-- Worker RPCs use anon plus the server key and the app's own session token.
-- Supabase's authenticated role is not part of Closer's custom auth model.
revoke all on function public.update_display_name(text, text) from authenticated;
