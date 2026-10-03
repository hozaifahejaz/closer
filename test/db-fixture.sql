-- Synthetic accounts only. The runner creates an isolated local cluster.
insert into private.config(key, value) values ('server_key', 'local-test-key');
insert into public.profiles(id, email, password_hash, name, invite_code, is_admin) values
  ('00000000-0000-0000-0000-000000000001', 'a@example.test', 'unused', 'A', 'AAAAAA', false),
  ('00000000-0000-0000-0000-000000000002', 'b@example.test', 'unused', 'B', 'BBBBBB', false),
  ('00000000-0000-0000-0000-000000000003', 'c@example.test', 'unused', 'C', 'CCCCCC', false),
  ('00000000-0000-0000-0000-000000000004', 'admin@example.test', 'unused', 'Admin', 'DDDDDD', true);
insert into public.sessions(token_hash, profile_id)
select encode(extensions.digest(token, 'sha256'), 'hex'), id from (values
  ('token-a', '00000000-0000-0000-0000-000000000001'::uuid),
  ('token-b', '00000000-0000-0000-0000-000000000002'::uuid),
  ('token-admin', '00000000-0000-0000-0000-000000000004'::uuid)
) as s(token, id);
