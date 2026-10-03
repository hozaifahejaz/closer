-- Remember when a signed-in account last joined or used its couple room.
-- The private schema is not exposed through the Supabase Data API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.user_activity (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_active_at timestamptz not null default now()
);
alter table private.user_activity enable row level security;
revoke all on table private.user_activity from public, anon, authenticated;

-- This is called only by the app Worker, which supplies the private server key.
create or replace function public.record_activity(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid := public.session_profile(p_token);
begin
  insert into private.user_activity (user_id, last_active_at)
  values (pid, now())
  on conflict (user_id) do update set last_active_at = excluded.last_active_at;
end $$;
revoke all on function public.record_activity(text) from public, anon, authenticated;
grant execute on function public.record_activity(text) to anon;

-- Include people who used Just Talk or other couple-room controls, not only
-- people who signed in or saved an answer recently.
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
        union all select user_id from answers where created_at > now() - interval '7 days'
        union all select user_id from private.user_activity where last_active_at > now() - interval '7 days') a),
    'active_30d', (select count(distinct id) from (
        select profile_id as id from sessions where created_at > now() - interval '30 days'
        union all select user_id from answers where created_at > now() - interval '30 days'
        union all select user_id from private.user_activity where last_active_at > now() - interval '30 days') a),
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
