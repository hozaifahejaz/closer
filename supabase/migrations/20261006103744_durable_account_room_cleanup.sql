-- Register every account room before its durable working copy is opened, even
-- when it has no saved answers. Keep cleanup work after the account disappears.
create table private.room_cleanup_jobs (
  couple_id text primary key,
  queued_at timestamptz not null default now()
);
create index room_cleanup_jobs_queue on private.room_cleanup_jobs(queued_at, couple_id);
alter table private.room_cleanup_jobs enable row level security;
revoke all on table private.room_cleanup_jobs from public, anon, authenticated;

create function public.register_room(p_token text, p_couple_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid := public.session_profile(p_token);
  members uuid[];
  member_count integer;
begin
  perform public.require_server();
  if p_couple_id is null or p_couple_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Invalid room pair' using errcode = '22023';
  end if;
  members := string_to_array(p_couple_id, ':')::uuid[];
  if members[1] >= members[2] then
    raise exception 'Invalid room pair' using errcode = '22023';
  end if;
  -- Match the ordering used by persistence and account deletion. Recheck the
  -- relationship after waiting: a deleted or unlinked account cannot register.
  perform 1 from public.profiles where id = any(members) order by id for key share;
  get diagnostics member_count = row_count;
  if member_count <> 2 or not pid = any(members)
     or public.my_couple(pid) is distinct from p_couple_id then
    raise exception 'Your session or partner link changed. Please reopen your room.' using errcode = '42501';
  end if;
  insert into private.room_generations(couple_id) values (p_couple_id) on conflict do nothing;
end $$;

create function private.erase_profile(p_user uuid, p_rooms text[] default '{}') returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  partner uuid;
  current_partner uuid;
  current_couple text;
  room_id text;
  members uuid[];
  affected text[];
begin
  -- Only the guarded deletion RPCs may call this private helper. Reject extra
  -- room IDs before changing anything, including another account's room.
  foreach room_id in array coalesce(p_rooms, array[]::text[]) loop
    if room_id is null or room_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Invalid room pair' using errcode = '22023';
    end if;
    members := string_to_array(room_id, ':')::uuid[];
    if members[1] >= members[2] or p_user is null or not p_user = any(members) then
      raise exception 'Invalid room member' using errcode = '22023';
    end if;
  end loop;

  select partner_id into partner from public.profiles where id = p_user;
  if not found then raise exception 'No such account'; end if;
  perform 1 from public.profiles where id in (p_user, partner) order by id for update;
  select partner_id into current_partner from public.profiles where id = p_user;
  if not found then raise exception 'No such account'; end if;
  if current_partner is distinct from partner then
    raise exception 'Relationship changed. Please try again' using errcode = '40001';
  end if;
  current_couple := public.my_couple(p_user);
  perform private.unlink_profile(p_user);

  select coalesce(array_agg(couple_id order by couple_id), array[]::text[]) into affected
  from (
    select current_couple as couple_id where current_couple is not null
    union
    select couple_id from public.answers where p_user::text = any(string_to_array(couple_id, ':'))
    union
    select couple_id from public.favorites where p_user::text = any(string_to_array(couple_id, ':'))
    union
    select couple_id from private.room_generations where p_user::text = any(string_to_array(couple_id, ':'))
    union
    select unnest(coalesce(p_rooms, array[]::text[]))
  ) rooms;

  -- The queue and database deletion commit together. It has no profile foreign
  -- key, so retries can erase Durable Objects after sessions and profiles vanish.
  insert into private.room_cleanup_jobs(couple_id)
    select unnest(affected) on conflict do nothing;
  delete from public.answers where couple_id = any(affected);
  delete from public.favorites where couple_id = any(affected);
  delete from private.room_generations where couple_id = any(affected);
  delete from public.profiles where id = p_user;
  return affected;
end $$;

create function public.delete_own_account_with_rooms(p_token text, p_password text, p_rooms text[]) returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid := public.session_profile(p_token);
  saved_hash text;
begin
  select password_hash into saved_hash from public.profiles where id = pid;
  if saved_hash is null or saved_hash <> extensions.crypt(coalesce(p_password, ''), saved_hash) then
    raise exception 'Incorrect password' using errcode = 'P0001';
  end if;
  return private.erase_profile(pid, p_rooms);
end $$;

create or replace function public.delete_own_account(p_token text, p_password text) returns text[]
language plpgsql security definer set search_path = '' as $$
begin
  return public.delete_own_account_with_rooms(p_token, p_password, array[]::text[]);
end $$;

create function public.admin_delete_user_with_rooms(p_token text, p_user uuid, p_rooms text[]) returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public.require_admin(p_token);
begin
  if p_user = me then raise exception 'You can''t delete your own account here'; end if;
  return private.erase_profile(p_user, p_rooms);
end $$;

create or replace function public.admin_delete_user(p_token text, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.admin_delete_user_with_rooms(p_token, p_user, array[]::text[]);
end $$;

create function public.pending_room_cleanup(p_rooms text[] default null) returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_server();
  return (
    select coalesce(json_agg(json_build_object('couple_id', couple_id) order by queued_at, couple_id), '[]'::json)
    from (
      select couple_id, queued_at from private.room_cleanup_jobs
      where p_rooms is null or couple_id = any(p_rooms)
      order by queued_at, couple_id limit 100
    ) jobs
  );
end $$;

create function public.complete_room_cleanup(p_couple_id text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_server();
  delete from private.room_cleanup_jobs where couple_id = p_couple_id;
end $$;

-- Explicitly remove both default PUBLIC and Supabase role grants. These RPCs
-- are reachable only through the Worker server key plus their session guards.
revoke all on function private.erase_profile(uuid, text[]),
  public.register_room(text, text), public.delete_own_account_with_rooms(text, text, text[]),
  public.delete_own_account(text, text), public.admin_delete_user_with_rooms(text, uuid, text[]),
  public.admin_delete_user(text, uuid), public.pending_room_cleanup(text[]), public.complete_room_cleanup(text)
  from public, anon, authenticated;
grant execute on function public.register_room(text, text),
  public.delete_own_account_with_rooms(text, text, text[]), public.delete_own_account(text, text),
  public.admin_delete_user_with_rooms(text, uuid, text[]), public.admin_delete_user(text, uuid),
  public.pending_room_cleanup(text[]), public.complete_room_cleanup(text) to anon;
