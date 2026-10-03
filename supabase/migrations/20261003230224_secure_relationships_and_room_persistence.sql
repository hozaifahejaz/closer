-- Keep invitation revocation and room writes correct across unlink/deletion.
-- The Worker authorizes room membership before accepting an outbox operation.
-- These private records let a later retry target that same pair exactly once.
create table private.room_generations (
  couple_id text primary key,
  generation bigint not null default 0 check (generation >= 0)
);
create table private.room_operations (
  couple_id text not null references private.room_generations(couple_id) on delete cascade,
  generation bigint not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  operation_id text not null,
  primary key (couple_id, generation, user_id, operation_id)
);
alter table private.room_generations enable row level security;
alter table private.room_operations enable row level security;
revoke all on table private.room_generations, private.room_operations from public, anon, authenticated;

-- Rejection sampling avoids modulo bias; a unique-index collision is retried.
-- Retired codes include both partners' old codes, even after the first rotation.
create function private.rotate_invite_code(p_user uuid, p_retired_codes text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  code text;
  sample integer;
begin
  loop
    code := '';
    while length(code) < 6 loop
      sample := get_byte(extensions.gen_random_bytes(1), 0);
      if sample < (256 / length(alphabet)) * length(alphabet) then
        code := code || substr(alphabet, 1 + sample % length(alphabet), 1);
      end if;
    end loop;
    if code = any(p_retired_codes) then continue; end if;
    begin
      update public.profiles set invite_code = code where id = p_user;
      return;
    exception when unique_violation then
      -- Another account may have acquired this random code concurrently.
    end;
  end loop;
end $$;

create function private.unlink_profile(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  partner uuid;
  current_partner uuid;
  retired_codes text[];
  member uuid;
begin
  select partner_id into partner from public.profiles where id = p_user;
  if not found then raise exception 'No such account'; end if;
  -- Link, unlink, and account deletion acquire profile locks in the same order.
  perform 1 from public.profiles where id in (p_user, partner) order by id for update;
  select partner_id into current_partner from public.profiles where id = p_user;
  if not found then raise exception 'No such account'; end if;
  if current_partner is distinct from partner then
    raise exception 'Relationship changed. Please try again' using errcode = '40001';
  end if;
  select array_agg(invite_code) into retired_codes from public.profiles
    where id = p_user or (id = partner and partner_id = p_user);
  for member in select id from public.profiles
    where id = p_user or (id = partner and partner_id = p_user) order by id
  loop
    update public.profiles set partner_id = null where id = member;
    perform private.rotate_invite_code(member, retired_codes);
  end loop;
end $$;
revoke all on function private.rotate_invite_code(uuid, text[]), private.unlink_profile(uuid)
  from public, anon, authenticated;

create or replace function public.link_partner(p_token text, p_code text) returns json
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid := public.session_profile(p_token);
  other_id uuid;
  other public.profiles;
  code text := upper(trim(p_code));
begin
  select id into other_id from public.profiles where invite_code = code;
  if not found then raise exception 'No one has that code'; end if;
  if other_id = pid then raise exception 'That''s your own code. Send it to your partner'; end if;
  perform 1 from public.profiles where id in (pid, other_id) order by id for update;
  if not exists(select 1 from public.profiles where id = pid) then
    raise exception 'Please log in again' using errcode = '28000';
  end if;
  -- The invite may have been rotated while the query waited for these locks.
  select * into other from public.profiles where id = other_id and invite_code = code;
  if not found then raise exception 'No one has that code'; end if;
  if (select partner_id from public.profiles where id = pid) is not null then
    raise exception 'You''re already linked with a partner';
  end if;
  if other.partner_id is not null then raise exception 'That person is already linked with someone'; end if;
  update public.profiles set partner_id = other_id where id = pid;
  update public.profiles set partner_id = pid where id = other_id;
  return json_build_object('name', other.name);
end $$;

create or replace function public.unlink_partner(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.unlink_profile(public.session_profile(p_token));
end $$;

create or replace function public.admin_unlink(p_token text, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin(p_token);
  perform private.unlink_profile(p_user);
end $$;

create or replace function public.admin_delete_user(p_token text, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.require_admin(p_token);
begin
  if p_user = me then raise exception 'You can''t delete your own account here'; end if;
  -- Also revokes the surviving partner's invitation and locks both profiles.
  -- Persistence takes key-share profile locks before its generation lock, so
  -- deletion either removes an earlier save or makes a later save obsolete.
  perform private.unlink_profile(p_user);
  delete from public.favorites
    where p_user::text = any(string_to_array(couple_id, ':'));
  delete from private.room_generations
    where p_user::text = any(string_to_array(couple_id, ':'));
  delete from public.profiles where id = p_user;
end $$;

create or replace function public.couple_data(p_token text) returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  cid text := public.my_couple(public.session_profile(p_token));
begin
  if cid is null then raise exception 'Link with your partner first'; end if;
  return json_build_object(
    'couple_id', cid,
    'generation', coalesce((select generation from private.room_generations where couple_id = cid), 0),
    'answers', coalesce((select json_agg(json_build_object('card_key', a.card_key, 'user_id', a.user_id, 'text', a.text))
                         from public.answers a where a.couple_id = cid), '[]'::json),
    'favorites', coalesce((select json_agg(f.question order by f.created_at)
                           from public.favorites f where f.couple_id = cid), '[]'::json)
  );
end $$;

-- p_card_key is the accepted category:index question key, including favorites.
-- p_generation is the value returned by couple_data when that room was loaded.
-- Reuse p_id for retries; identities are scoped to a user within the pair and
-- generation. A deletion invalidates even a previously successful operation ID.
create function public.persist_room_change(
  p_couple_id text, p_generation bigint, p_id text, p_user uuid,
  p_kind text, p_card_key text, p_question text, p_text text, p_on boolean
) returns json
language plpgsql security definer set search_path = '' as $$
declare
  members uuid[];
  member_count integer;
  current_generation bigint;
begin
  perform public.require_server();
  if p_couple_id is null or p_couple_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Invalid room pair' using errcode = '22023';
  end if;
  members := string_to_array(p_couple_id, ':')::uuid[];
  if members[1] >= members[2] or p_user is null or not p_user = any(members) then
    raise exception 'Invalid room member' using errcode = '22023';
  end if;
  if p_generation is null or p_generation < 0 or nullif(trim(p_id), '') is null
     or length(p_id) > 128 or p_kind is null or p_kind not in ('answer', 'favorite')
     or nullif(p_card_key, '') is null or nullif(p_question, '') is null
     or (p_kind = 'answer' and p_text is null) or (p_kind = 'favorite' and p_on is null) then
    raise exception 'Invalid room operation' using errcode = '22023';
  end if;

  -- Membership was authorized when the Worker accepted the command; looking up
  -- today's partner would move a queued answer into an unrelated later couple.
  -- Lock both existing accounts so deletion cannot race the following writes.
  perform 1 from public.profiles where id = any(members) order by id for key share;
  get diagnostics member_count = row_count;
  if member_count <> 2 then
    return json_build_object('applied', false, 'reason', 'deleted_account');
  end if;
  insert into private.room_generations(couple_id) values (p_couple_id) on conflict do nothing;
  select generation into current_generation from private.room_generations
    where couple_id = p_couple_id for update;
  if p_generation <> current_generation then
    return json_build_object('applied', false, 'reason', 'stale_generation');
  end if;
  if exists(select 1 from private.room_operations where couple_id = p_couple_id
            and generation = p_generation and user_id = p_user and operation_id = p_id) then
    return json_build_object('applied', true);
  end if;
  if p_kind = 'answer' then
    insert into public.answers(couple_id, card_key, user_id, question, text)
    values (p_couple_id, p_card_key, p_user, p_question, left(p_text, 1000))
    on conflict (couple_id, card_key, user_id) do update
      set text = excluded.text, question = excluded.question, created_at = now();
  elsif p_on then
    insert into public.favorites(couple_id, question) values (p_couple_id, p_question) on conflict do nothing;
  else
    delete from public.favorites where couple_id = p_couple_id and question = p_question;
  end if;
  insert into private.room_operations(couple_id, generation, user_id, operation_id)
    values (p_couple_id, p_generation, p_user, p_id);
  return json_build_object('applied', true);
end $$;

create or replace function public.admin_delete_couple_data(p_token text, p_couple_id text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin(p_token);
  insert into private.room_generations(couple_id) values (p_couple_id) on conflict do nothing;
  -- UPDATE takes the same row lock as persistence, before deleting any content.
  update private.room_generations set generation = generation + 1 where couple_id = p_couple_id;
  delete from public.answers where couple_id = p_couple_id;
  delete from public.favorites where couple_id = p_couple_id;
  delete from private.room_operations where couple_id = p_couple_id;
end $$;

revoke all on function public.persist_room_change(text, bigint, text, uuid, text, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.persist_room_change(text, bigint, text, uuid, text, text, text, text, boolean) to anon;
-- CREATE OR REPLACE preserves the existing restricted grants on the other RPCs.
