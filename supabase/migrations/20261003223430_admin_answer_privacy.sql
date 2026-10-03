-- Admins may see aggregate answer counts, but not submitted answer text or
-- account/room access secrets. Remove the old answer-reading and password
-- takeover RPCs so a stale Worker cannot continue to call them.

drop function if exists public.admin_couple(text, text);
drop function if exists public.admin_set_password(text, uuid, text);
drop function if exists public.admin_delete_answer(text, text, text, uuid);

create or replace function public.admin_users(p_token text, p_search text default '') returns json
language plpgsql stable security definer set search_path = public as $$
declare
  q text := '%' || lower(trim(coalesce(p_search, ''))) || '%';
begin
  perform require_admin(p_token);
  return coalesce((select json_agg(u) from (
    select p.id, p.name, p.email, p.created_at, is_admin(p.id) as is_admin,
           case when partner.id is null then null else json_build_object('id', partner.id, 'name', partner.name, 'email', partner.email) end as partner,
           (select count(*) from answers a where a.user_id = p.id) as answers,
           (select max(created_at) from sessions s where s.profile_id = p.id) as last_login,
           (select max(created_at) from answers a where a.user_id = p.id) as last_answer
    from profiles p
    left join profiles partner on partner.id = p.partner_id and partner.partner_id = p.id
    where lower(p.name) like q or lower(p.email) like q
    order by p.created_at desc
    limit 500) u), '[]');
end $$;
