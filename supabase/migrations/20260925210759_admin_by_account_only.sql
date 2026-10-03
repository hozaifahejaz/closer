-- Admin comes only from profiles.is_admin, never from an email match: sign-up
-- doesn't verify emails, so anyone could register the owner's address first
-- and become admin. Promote the first admin by account instead:
--   update profiles set is_admin = true where email = 'you@example.com';
-- (run it only once that account exists and you know it's yours).

create or replace function public.is_admin(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from profiles p where p.id = pid), false)
$$;
revoke all on function public.is_admin(uuid) from public, anon, authenticated;

delete from private.config where key = 'admin_emails';
