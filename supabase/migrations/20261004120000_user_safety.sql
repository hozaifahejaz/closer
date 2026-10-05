-- Experiments first: apply locally only until promotion is approved.
create table public.terms_acceptances (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  version text not null, accepted_at timestamptz not null default now()
);
create table public.user_blocks (
  blocker uuid references public.profiles(id) on delete cascade,
  blocked uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked), check (blocker <> blocked)
);
create index user_blocks_reverse on public.user_blocks(blocked, blocker);
alter table public.profiles add column safety_restricted boolean not null default false;
alter table public.terms_acceptances enable row level security;
alter table public.user_blocks enable row level security;
revoke all on public.terms_acceptances, public.user_blocks from public, anon, authenticated;

create function public.safety_state(p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
declare pid uuid := session_profile(p_token);
begin
  return json_build_object('accepted', exists(select 1 from terms_acceptances where user_id = pid and version = '2026-10-04'),
    'restricted', (select safety_restricted from profiles where id = pid));
end $$;
create function public.accept_terms(p_token text, p_version text) returns void
language plpgsql security definer set search_path = public as $$
declare pid uuid := session_profile(p_token);
begin
  if p_version is distinct from '2026-10-04' then raise exception 'Please review the current terms.'; end if;
  insert into terms_acceptances(user_id, version) values(pid, p_version)
  on conflict(user_id) do update set version = excluded.version, accepted_at = now();
end $$;

create function public.block_partner(p_token text) returns void
language plpgsql security definer set search_path = public as $$
declare pid uuid := session_profile(p_token); other uuid;
begin
  select partner_id into other from profiles where id = pid;
  if other is null then raise exception 'There is no partner to block.'; end if;
  perform 1 from profiles where id in (pid, other) order by id for update;
  if not exists(select 1 from profiles where id = pid and partner_id = other) then raise exception 'Your partner changed. Please try again.'; end if;
  insert into user_blocks(blocker, blocked) values(pid, other) on conflict do nothing;
  perform unlink_partner(p_token);
end $$;

create function public.enforce_safe_link() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.partner_id is not null then
    if new.safety_restricted or exists(select 1 from profiles where id = new.partner_id and safety_restricted) or
       exists(select 1 from user_blocks where (blocker = new.id and blocked = new.partner_id) or (blocker = new.partner_id and blocked = new.id)) then
      raise exception 'These accounts cannot be linked.';
    end if;
  end if;
  return new;
end $$;
create trigger enforce_safe_link before update of partner_id on public.profiles
for each row execute function public.enforce_safe_link();

create function public.enforce_answer_terms() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from terms_acceptances where user_id = new.user_id and version = '2026-10-04') then
    raise exception 'Accept the Terms of Use before submitting answers.';
  end if;
  return new;
end $$;
create trigger enforce_answer_terms before insert or update of text on public.answers
for each row execute function public.enforce_answer_terms();

create function public.admin_restrict_user(p_token text, p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare admin_id uuid := require_admin(p_token); other uuid;
begin
  if p_user = admin_id or is_admin(p_user) then raise exception 'Admin accounts cannot be restricted here.'; end if;
  select partner_id into other from profiles where id = p_user for update;
  if not found then raise exception 'Account not found.'; end if;
  update profiles set safety_restricted = p_on, partner_id = case when p_on then null else partner_id end where id = p_user;
  if p_on then update profiles set partner_id = null where id = other and partner_id = p_user; end if;
end $$;

revoke all on function public.safety_state(text), public.accept_terms(text,text), public.block_partner(text), public.admin_restrict_user(text,uuid,boolean), public.enforce_safe_link(), public.enforce_answer_terms() from public;
grant execute on function public.safety_state(text), public.accept_terms(text,text), public.block_partner(text), public.admin_restrict_user(text,uuid,boolean) to anon;
