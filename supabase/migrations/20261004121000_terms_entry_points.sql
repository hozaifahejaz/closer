-- Consent before creating an account with a display name.
create function public.sign_up_with_terms(p_email text, p_password text, p_name text, p_version text) returns text
language plpgsql security definer set search_path = public as $$
declare token text;
begin
  perform require_server();
  if p_version is distinct from '2026-10-04' then raise exception 'Accept the Terms of Use before signing up.'; end if;
  token := sign_up(p_email, p_password, p_name);
  perform accept_terms(token, p_version);
  return token;
end $$;
create or replace function public.my_state(p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
declare pid uuid := session_profile(p_token); result json;
begin
  select json_build_object('id', me.id, 'name', me.name, 'invite_code', me.invite_code,
    'partner', case when p.id is null then null else json_build_object('id', p.id, 'name', p.name) end,
    'couple_id', case when p.id is null then null else couple_key(me.id, p.id) end,
    'is_admin', is_admin(me.id), 'terms_accepted', exists(select 1 from terms_acceptances where user_id = me.id and version = '2026-10-04'))
    into result from profiles me left join profiles p on p.id = me.partner_id and p.partner_id = me.id where me.id = pid;
  return result;
end $$;
revoke all on function public.sign_up_with_terms(text,text,text,text) from public;
grant execute on function public.sign_up_with_terms(text,text,text,text) to anon;
