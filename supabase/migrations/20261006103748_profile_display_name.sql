-- Only the authenticated owner can edit their display name. Email is read-only.
create or replace function public.my_state(p_token text) returns json
language plpgsql stable security definer set search_path = '' as $$
declare pid uuid := public.session_profile(p_token); result json;
begin
  select json_build_object('id', me.id, 'name', me.name, 'email', me.email, 'invite_code', me.invite_code,
    'partner', case when p.id is null then null else json_build_object('id', p.id, 'name', p.name) end,
    'couple_id', case when p.id is null then null else public.couple_key(me.id, p.id) end,
    'is_admin', public.is_admin(me.id), 'terms_accepted', exists(select 1 from public.terms_acceptances where user_id = me.id and version = '2026-10-04'))
    into result from public.profiles me left join public.profiles p on p.id = me.partner_id and p.partner_id = me.id where me.id = pid;
  return result;
end $$;

create function public.update_display_name(p_token text, p_name text) returns json
language plpgsql security definer set search_path = '' as $$
declare pid uuid := public.session_profile(p_token); clean text := btrim(p_name);
begin
  if clean is null or char_length(clean) not between 1 and 24 or clean ~ '[[:cntrl:]]' then
    raise exception 'Use a name between 1 and 24 characters, without line breaks.';
  end if;
  update public.profiles set name = clean where id = pid;
  return public.my_state(p_token);
end $$;
revoke all on function public.update_display_name(text,text) from public;
grant execute on function public.update_display_name(text,text) to anon;
