-- Preserve server-accepted durable saves during the consent rollout. This
-- RPC remains protected by require_server and room membership/generation checks.
-- The Worker enforces consent before accepting all new answers.
create or replace function public.enforce_answer_terms() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('closer.accepted_outbox', true), '') = 'true' then return new; end if;
  if not exists(select 1 from terms_acceptances where user_id = new.user_id and version = '2026-10-04') then
    raise exception 'Accept the Terms of Use before submitting answers.';
  end if;
  return new;
end $$;

create or replace function public.persist_room_change(
  p_couple_id text, p_generation bigint, p_id text, p_user uuid,
  p_kind text, p_card_key text, p_question text, p_text text, p_on boolean
) returns json
language plpgsql security definer set search_path = '' as $$
declare
  members uuid[];
  member_count integer;
  current_generation bigint;
  previous_outbox_setting text;
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
    -- The private Worker outbox contains operations authorized at acceptance.
    -- This preserves pre-rollout saves without inventing user consent.
    previous_outbox_setting := current_setting('closer.accepted_outbox', true);
    perform set_config('closer.accepted_outbox', 'true', true);
    insert into public.answers(couple_id, card_key, user_id, question, text)
    values (p_couple_id, p_card_key, p_user, p_question, left(p_text, 1000))
    on conflict (couple_id, card_key, user_id) do update
      set text = excluded.text, question = excluded.question, created_at = now();
    perform set_config('closer.accepted_outbox', coalesce(previous_outbox_setting, ''), true);
  elsif p_on then
    insert into public.favorites(couple_id, question) values (p_couple_id, p_question) on conflict do nothing;
  else
    delete from public.favorites where couple_id = p_couple_id and question = p_question;
  end if;
  insert into private.room_operations(couple_id, generation, user_id, operation_id)
    values (p_couple_id, p_generation, p_user, p_id);
  return json_build_object('applied', true);
end $$;

-- Supabase default ACLs can grant roles directly as well as through PUBLIC.
revoke all on function public.safety_state(text), public.accept_terms(text,text), public.block_partner(text), public.admin_restrict_user(text,uuid,boolean), public.sign_up_with_terms(text,text,text,text), public.enforce_safe_link(), public.enforce_answer_terms() from public, anon, authenticated;
grant execute on function public.safety_state(text), public.accept_terms(text,text), public.block_partner(text), public.admin_restrict_user(text,uuid,boolean), public.sign_up_with_terms(text,text,text,text) to anon;
