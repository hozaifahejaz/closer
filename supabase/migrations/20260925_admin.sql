-- Admin accounts and the admin dashboard's data.
--
-- An account is an admin when profiles.is_admin is set, or when its email is
-- listed in private.config 'admin_emails' (comma separated), so the owner
-- becomes admin as soon as they sign up. To add the first admin:
--   insert into private.config (key, value) values ('admin_emails', 'you@example.com');
--
-- Every admin_* function requires the server key and an admin session.

alter table profiles add column if not exists is_admin boolean not null default false;
create index if not exists answers_created_at on answers (created_at);
create index if not exists answers_user on answers (user_id);
create index if not exists sessions_profile on sessions (profile_id);

create or replace function public.is_admin(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.is_admin or p.email = any(string_to_array(replace(coalesce(
      (select value from private.config where key = 'admin_emails'), ''), ' ', ''), ','))
    from profiles p where p.id = pid), false)
$$;

create or replace function public.require_admin(p_token text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  pid uuid := session_profile(p_token);
begin
  if not is_admin(pid) then raise exception 'Admins only' using errcode = '42501'; end if;
  return pid;
end $$;

create or replace function public.my_state(p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  pid uuid := session_profile(p_token);
  result json;
begin
  select json_build_object(
    'id', me.id,
    'name', me.name,
    'invite_code', me.invite_code,
    'partner', case when p.id is null then null else json_build_object('name', p.name) end,
    'couple_id', case when p.id is null then null else couple_key(me.id, p.id) end,
    'is_admin', is_admin(me.id)
  ) into result
  from profiles me left join profiles p on p.id = me.partner_id and p.partner_id = me.id
  where me.id = pid;
  return result;
end $$;

-- Headline numbers, daily series for the last 30 days, and the most popular questions.
create or replace function public.admin_stats(p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  days date[] := array(select generate_series(current_date - 29, current_date, interval '1 day')::date);
begin
  perform require_admin(p_token);
  return json_build_object(
    'users', (select count(*) from profiles),
    'users_today', (select count(*) from profiles where created_at >= current_date),
    'users_7d', (select count(*) from profiles where created_at > now() - interval '7 days'),
    'users_30d', (select count(*) from profiles where created_at > now() - interval '30 days'),
    'couples', (select count(*) from profiles me join profiles p on p.id = me.partner_id and p.partner_id = me.id where me.id < p.id),
    'waiting_for_partner', (select count(*) from profiles where partner_id is null),
    'answers', (select count(*) from answers),
    'answers_7d', (select count(*) from answers where created_at > now() - interval '7 days'),
    'favorites', (select count(*) from favorites),
    'active_7d', (select count(distinct id) from (
        select profile_id as id from sessions where created_at > now() - interval '7 days'
        union all select user_id from answers where created_at > now() - interval '7 days') a),
    'active_30d', (select count(distinct id) from (
        select profile_id as id from sessions where created_at > now() - interval '30 days'
        union all select user_id from answers where created_at > now() - interval '30 days') a),
    'couples_answering', (select count(distinct couple_id) from answers),
    'days', to_json(days),
    'signups_by_day', (select json_agg(coalesce(c, 0) order by d) from unnest(days) d
        left join (select created_at::date as d0, count(*) as c from profiles group by 1) s on s.d0 = d),
    'answers_by_day', (select json_agg(coalesce(c, 0) order by d) from unnest(days) d
        left join (select created_at::date as d0, count(*) as c from answers group by 1) s on s.d0 = d),
    'top_answered', coalesce((select json_agg(t) from (
        select question, count(*) as count from answers group by question order by count(*) desc, question limit 10) t), '[]'),
    'top_favorited', coalesce((select json_agg(t) from (
        select question, count(*) as count from favorites group by question order by count(*) desc, question limit 10) t), '[]'),
    'by_category', coalesce((select json_agg(t) from (
        select split_part(card_key, ':', 1) as category, count(*) as count from answers group by 1 order by 2 desc) t), '[]')
  );
end $$;

-- Every account, newest first, optionally filtered by name or email.
create or replace function public.admin_users(p_token text, p_search text default '') returns json
language plpgsql stable security definer set search_path = public as $$
declare
  q text := '%' || lower(trim(coalesce(p_search, ''))) || '%';
begin
  perform require_admin(p_token);
  return coalesce((select json_agg(u) from (
    select p.id, p.name, p.email, p.created_at, p.invite_code, is_admin(p.id) as is_admin,
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

-- Every linked couple with how much they've played.
create or replace function public.admin_couples(p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin(p_token);
  return coalesce((select json_agg(c order by c.last_activity desc nulls last) from (
    select couple_key(a.id, b.id) as id,
           json_build_array(json_build_object('id', a.id, 'name', a.name, 'email', a.email),
                            json_build_object('id', b.id, 'name', b.name, 'email', b.email)) as partners,
           (select count(*) from answers x where x.couple_id = couple_key(a.id, b.id)) as answers,
           (select count(*) from favorites f where f.couple_id = couple_key(a.id, b.id)) as favorites,
           (select max(created_at) from answers x where x.couple_id = couple_key(a.id, b.id)) as last_activity
    from profiles a join profiles b on b.id = a.partner_id and b.partner_id = a.id
    where a.id < b.id) c), '[]');
end $$;

-- One couple's answers and favorites.
create or replace function public.admin_couple(p_token text, p_couple_id text) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin(p_token);
  return json_build_object(
    'answers', coalesce((select json_agg(json_build_object('question', a.question, 'card_key', a.card_key, 'name', p.name,
                                                           'text', a.text, 'created_at', a.created_at) order by a.created_at desc, p.name)
                         from answers a join profiles p on p.id = a.user_id where a.couple_id = p_couple_id), '[]'),
    'favorites', coalesce((select json_agg(f.question order by f.created_at) from favorites f where f.couple_id = p_couple_id), '[]')
  );
end $$;

-- ---- Admin actions ----

-- Sets a new password (there's no "forgot password" email yet) and signs them out everywhere.
create or replace function public.admin_set_password(p_token text, p_user uuid, p_password text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform require_admin(p_token);
  if length(coalesce(p_password, '')) < 6 then raise exception 'Password needs at least 6 characters'; end if;
  update profiles set password_hash = crypt(p_password, gen_salt('bf', 10)) where id = p_user;
  if not found then raise exception 'No such account'; end if;
  delete from sessions where profile_id = p_user;
end $$;

create or replace function public.admin_sign_out(p_token text, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_admin(p_token);
  delete from sessions where profile_id = p_user;
end $$;

create or replace function public.admin_unlink(p_token text, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  partner uuid;
begin
  perform require_admin(p_token);
  select partner_id into partner from profiles where id = p_user;
  update profiles set partner_id = null where id = p_user;
  if partner is not null then update profiles set partner_id = null where id = partner and partner_id = p_user; end if;
end $$;

-- Deletes the account, its sessions and answers, and its couple's favorites.
create or replace function public.admin_delete_user(p_token text, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := require_admin(p_token);
  cid text := my_couple(p_user);
begin
  if p_user = me then raise exception 'You can''t delete your own account here'; end if;
  if cid is not null then delete from favorites where couple_id = cid; end if;
  update profiles set partner_id = null where partner_id = p_user;
  delete from profiles where id = p_user;
  if not found then raise exception 'No such account'; end if;
end $$;

create or replace function public.admin_set_admin(p_token text, p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := require_admin(p_token);
begin
  if p_user = me and not p_on then raise exception 'You can''t remove your own admin access'; end if;
  update profiles set is_admin = p_on where id = p_user;
  if not found then raise exception 'No such account'; end if;
end $$;

-- ---- Permissions ----

revoke all on function public.is_admin(uuid), public.require_admin(text) from public, anon, authenticated;
revoke all on function public.admin_stats(text), public.admin_users(text, text), public.admin_couples(text),
  public.admin_couple(text, text), public.admin_set_password(text, uuid, text), public.admin_sign_out(text, uuid),
  public.admin_unlink(text, uuid), public.admin_delete_user(text, uuid), public.admin_set_admin(text, uuid, boolean)
  from public, authenticated;
grant execute on function public.admin_stats(text), public.admin_users(text, text), public.admin_couples(text),
  public.admin_couple(text, text), public.admin_set_password(text, uuid, text), public.admin_sign_out(text, uuid),
  public.admin_unlink(text, uuid), public.admin_delete_user(text, uuid), public.admin_set_admin(text, uuid, boolean)
  to anon;
