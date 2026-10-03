-- Sign-ins no longer expire after 180 days: people stay signed in until they log
-- out (logging out deletes the session). Same function as in schema.sql, minus
-- the age check; its permissions are unchanged by "create or replace".
create or replace function public.session_profile(p_token text) returns uuid
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  pid uuid;
begin
  perform require_server();
  select profile_id into pid from sessions
  where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if pid is null then raise exception 'Please log in again' using errcode = '28000'; end if;
  return pid;
end $$;
