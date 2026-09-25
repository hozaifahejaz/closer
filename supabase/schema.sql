-- Closer database schema for Supabase (run once in the SQL editor).
--
-- Accounts are managed by the app itself rather than Supabase Auth, because
-- Supabase's built-in email only reaches the project's own team, so email
-- confirmation would stop partners from signing up. Passwords are bcrypt
-- hashed; sessions are random tokens stored as SHA-256 hashes.
--
-- Nothing is readable directly: every table has row level security with no
-- policies, and all access goes through the functions below. Each function
-- also checks an x-closer-key header against private.config, so only the app
-- server (which holds CLOSER_DB_KEY) can call them. After running this file,
-- set the key once:
--   insert into private.config (key, value) values ('server_key', '<CLOSER_DB_KEY>');
-- Then run the files in supabase/migrations/ in order (the admin dashboard is one).

create extension if not exists pgcrypto with schema extensions;

create table profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  name text not null,
  invite_code text not null unique,
  partner_id uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table sessions (
  token_hash text primary key,
  profile_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table answers (
  couple_id text not null,
  card_key text not null,
  user_id uuid not null references profiles (id) on delete cascade,
  question text not null,
  text text not null,
  created_at timestamptz not null default now(),
  primary key (couple_id, card_key, user_id)
);

create table favorites (
  couple_id text not null,
  question text not null,
  created_at timestamptz not null default now(),
  primary key (couple_id, question)
);

alter table profiles enable row level security;
alter table sessions enable row level security;
alter table answers enable row level security;
alter table favorites enable row level security;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.config (key text primary key, value text not null);

-- ---- Private helpers ----

create or replace function public.require_server() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(current_setting('request.headers', true)::json->>'x-closer-key', '') is distinct from
     (select value from private.config where key = 'server_key') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
end $$;

create or replace function public.couple_key(a uuid, b uuid) returns text
language sql immutable set search_path = public as $$
  select least(a::text, b::text) || ':' || greatest(a::text, b::text)
$$;

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

create or replace function public.new_session(p_profile uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  token text;
begin
  perform require_server();
  token := encode(gen_random_bytes(32), 'hex');
  insert into sessions (token_hash, profile_id) values (encode(digest(token, 'sha256'), 'hex'), p_profile);
  return token;
end $$;

create or replace function public.my_couple(pid uuid) returns text
language sql stable security definer set search_path = public as $$
  select couple_key(me.id, p.id)
  from profiles me join profiles p on p.id = me.partner_id and p.partner_id = me.id
  where me.id = pid
$$;

-- ---- Entry points (called by the app server) ----

create or replace function public.sign_up(p_email text, p_password text, p_name text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_email text := lower(trim(p_email));
  pid uuid;
  code text;
begin
  perform require_server();
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Please enter a valid email'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'Password needs at least 6 characters'; end if;
  if exists (select 1 from profiles where email = v_email) then
    raise exception 'That email already has an account. Try logging in';
  end if;
  loop
    code := (select string_agg(substr(alphabet, 1 + floor(random() * 24)::int, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from profiles where invite_code = code);
  end loop;
  insert into profiles (email, password_hash, name, invite_code)
  values (v_email, crypt(p_password, gen_salt('bf', 10)), left(coalesce(nullif(trim(p_name), ''), 'Partner'), 24), code)
  returning id into pid;
  return new_session(pid);
exception when unique_violation then
  raise exception 'That email already has an account. Try logging in';
end $$;

create or replace function public.log_in(p_email text, p_password text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  me profiles;
begin
  perform require_server();
  select * into me from profiles where email = lower(trim(p_email));
  if not found or me.password_hash <> crypt(coalesce(p_password, ''), me.password_hash) then
    raise exception 'Wrong email or password';
  end if;
  return new_session(me.id);
end $$;

create or replace function public.log_out(p_token text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform require_server();
  delete from sessions where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
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
    'couple_id', case when p.id is null then null else couple_key(me.id, p.id) end
  ) into result
  from profiles me left join profiles p on p.id = me.partner_id and p.partner_id = me.id
  where me.id = pid;
  return result;
end $$;

create or replace function public.link_partner(p_token text, p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare
  pid uuid := session_profile(p_token);
  other profiles;
begin
  perform 1 from profiles where id = pid for update;
  if (select partner_id from profiles where id = pid) is not null then
    raise exception 'You''re already linked with a partner';
  end if;
  select * into other from profiles where invite_code = upper(trim(p_code)) for update;
  if not found then raise exception 'No one has that code'; end if;
  if other.id = pid then raise exception 'That''s your own code. Send it to your partner'; end if;
  if other.partner_id is not null then raise exception 'That person is already linked with someone'; end if;
  update profiles set partner_id = other.id where id = pid;
  update profiles set partner_id = pid where id = other.id;
  return json_build_object('name', other.name);
end $$;

create or replace function public.unlink_partner(p_token text) returns void
language plpgsql security definer set search_path = public as $$
declare
  pid uuid := session_profile(p_token);
  partner uuid;
begin
  select partner_id into partner from profiles where id = pid;
  update profiles set partner_id = null where id = pid;
  if partner is not null then
    update profiles set partner_id = null where id = partner and partner_id = pid;
  end if;
end $$;

create or replace function public.couple_data(p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  cid text := my_couple(session_profile(p_token));
begin
  if cid is null then raise exception 'Link with your partner first'; end if;
  return json_build_object(
    'answers', coalesce((select json_agg(json_build_object('card_key', a.card_key, 'user_id', a.user_id, 'text', a.text))
                         from answers a where a.couple_id = cid), '[]'::json),
    'favorites', coalesce((select json_agg(f.question order by f.created_at)
                           from favorites f where f.couple_id = cid), '[]'::json)
  );
end $$;

create or replace function public.save_answer(p_token text, p_card_key text, p_question text, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare
  pid uuid := session_profile(p_token);
  cid text := my_couple(pid);
begin
  if cid is null then raise exception 'Link with your partner first'; end if;
  insert into answers (couple_id, card_key, user_id, question, text)
  values (cid, p_card_key, pid, p_question, left(p_text, 1000))
  on conflict (couple_id, card_key, user_id) do update set text = excluded.text, question = excluded.question, created_at = now();
end $$;

create or replace function public.set_favorite(p_token text, p_question text, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  cid text := my_couple(session_profile(p_token));
begin
  if cid is null then raise exception 'Link with your partner first'; end if;
  if p_on then
    insert into favorites (couple_id, question) values (cid, p_question) on conflict do nothing;
  else
    delete from favorites where couple_id = cid and question = p_question;
  end if;
end $$;

-- ---- Permissions ----

revoke all on function public.require_server(), public.couple_key(uuid, uuid), public.session_profile(text),
  public.new_session(uuid), public.my_couple(uuid) from public, anon, authenticated;
revoke all on function public.sign_up(text, text, text), public.log_in(text, text), public.log_out(text),
  public.my_state(text), public.link_partner(text, text), public.unlink_partner(text), public.couple_data(text),
  public.save_answer(text, text, text, text), public.set_favorite(text, text, boolean) from public, authenticated;
grant execute on function public.sign_up(text, text, text), public.log_in(text, text), public.log_out(text),
  public.my_state(text), public.link_partner(text, text), public.unlink_partner(text), public.couple_data(text),
  public.save_answer(text, text, text, text), public.set_favorite(text, text, boolean) to anon;
