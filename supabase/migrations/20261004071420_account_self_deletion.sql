-- A signed-in person can delete their own account after confirming their password.
-- Return every affected couple room so the Worker can discard its durable copy.
create function public.delete_own_account(p_token text, p_password text) returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid := public.session_profile(p_token);
  saved_hash text;
  affected text[];
  current_couple text;
begin
  select password_hash into saved_hash from public.profiles where id = pid;
  if saved_hash is null or saved_hash <> extensions.crypt(coalesce(p_password, ''), saved_hash) then
    raise exception 'Incorrect password' using errcode = 'P0001';
  end if;

  current_couple := public.my_couple(pid);
  -- Serializes deletion with linking, unlinking, and room persistence.
  perform private.unlink_profile(pid);
  select coalesce(array_agg(couple_id), array[]::text[]) into affected
  from (
    select current_couple as couple_id where current_couple is not null
    union
    select couple_id from public.answers where pid::text = any(string_to_array(couple_id, ':'))
    union
    select couple_id from public.favorites where pid::text = any(string_to_array(couple_id, ':'))
    union
    select couple_id from private.room_generations where pid::text = any(string_to_array(couple_id, ':'))
  ) rooms;

  -- Couple records belong to the pair. Their room and both partners' answers
  -- become inaccessible after deletion, so remove the complete old pair record.
  delete from public.answers where couple_id = any(affected);
  delete from public.favorites where couple_id = any(affected);
  delete from private.room_generations where couple_id = any(affected);
  delete from public.profiles where id = pid;
  return affected;
end $$;

revoke all on function public.delete_own_account(text, text) from public, anon, authenticated;
grant execute on function public.delete_own_account(text, text) to anon;
