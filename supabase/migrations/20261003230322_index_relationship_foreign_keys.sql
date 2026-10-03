-- Keep account deletion and partner-reference checks from scanning all records.
create index room_operations_user_id_idx on private.room_operations(user_id);
create index profiles_partner_id_idx on public.profiles(partner_id);
