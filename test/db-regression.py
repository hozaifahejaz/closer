#!/usr/bin/env python3
"""Run real SQL regressions in a temporary PostgreSQL cluster (requires pgcrypto).

No database URL is accepted or read. initdb/pg_ctl/psql must be on PATH; all
connections use a newly created local Unix socket with TCP disabled.
"""
import os
from pathlib import Path
import select
import shutil
import subprocess
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
A = '00000000-0000-0000-0000-000000000001'
B = '00000000-0000-0000-0000-000000000002'
C = '00000000-0000-0000-0000-000000000003'
AB = f'{A}:{B}'
AC = f'{A}:{C}'
BC = f'{B}:{C}'
APPLIED = "jsonb_build_object('applied', true)"
STALE = "jsonb_build_object('applied', false, 'reason', 'stale_generation')"
DELETED = "jsonb_build_object('applied', false, 'reason', 'deleted_account')"
HEADERS = "set request.headers = '{\"x-closer-key\":\"local-test-key\"}';"


class DatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        for binary in ('initdb', 'pg_ctl', 'psql'):
            if not shutil.which(binary):
                raise RuntimeError(f'{binary} is required for isolated database tests')
        cls.temp = tempfile.TemporaryDirectory(prefix='closer-db-', dir='/tmp')
        cls.path = Path(cls.temp.name)
        cls.data = cls.path / 'data'
        cls.env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
        cls.env.update(PGHOST=str(cls.path), PGPORT='5432', PGUSER='postgres', PGDATABASE='postgres')
        subprocess.run(['initdb', '-D', str(cls.data), '-U', 'postgres', '-A', 'trust', '--no-locale'],
                       check=True, capture_output=True, env=cls.env)
        subprocess.run(['pg_ctl', '-D', str(cls.data), '-l', str(cls.path / 'postgres.log'),
                        '-o', f"-k {cls.path} -h '' -F", '-w', 'start'],
                       check=True, capture_output=True, env=cls.env)
        cls.addClassCleanup(cls.stop_cluster)
        cls.sql('create role anon; create role authenticated; create schema extensions;')
        for path in sorted((ROOT / 'supabase/migrations').glob('*.sql')):
            cls.sql(path.read_text())
        cls.sql((ROOT / 'test/db-fixture.sql').read_text())

    @classmethod
    def stop_cluster(cls):
        subprocess.run(['pg_ctl', '-D', str(cls.data), '-m', 'immediate', '-w', 'stop'],
                       check=True, capture_output=True, env=cls.env)
        cls.temp.cleanup()

    @classmethod
    def sql(cls, query, check=True):
        result = subprocess.run(['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', query],
                                env=cls.env, capture_output=True, text=True, timeout=15)
        if check and result.returncode:
            raise AssertionError(result.stderr.strip())
        return result

    def transaction(self, query):
        return self.sql(f'begin; {HEADERS} {query} rollback;')

    def assert_sql(self, condition, message):
        return f"do $$ begin assert ({condition}), '{message}'; end $$;"

    def persist(self, op='op-1', generation=0, user=A, couple=AB, kind='answer',
                key='deep:1', question='Question?', text='original', on='null'):
        return (f"public.persist_room_change('{couple}', {generation}, '{op}', '{user}', "
                f"'{kind}', '{key}', '{question}', '{text}', {on})")

    def start_sql(self, name, query=None):
        proc = subprocess.Popen(['psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'],
                                env=dict(self.env, PGAPPNAME=name), stdin=subprocess.PIPE,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.addCleanup(lambda: self.close_sql(proc))
        if query is not None:
            proc.stdin.write(f"set statement_timeout='8s'; {HEADERS} {query}\n")
            proc.stdin.close()
            proc.stdin = None
        return proc

    @staticmethod
    def close_sql(proc):
        if proc.poll() is None:
            proc.terminate()
        proc.communicate(timeout=10)

    def hold(self, query):
        proc = self.start_sql('db-test-holder')
        proc.stdin.write(f"begin; {HEADERS} {query} select 'ready';\n")
        proc.stdin.flush()
        deadline = time.monotonic() + 5
        output = ''
        while time.monotonic() < deadline:
            if select.select([proc.stdout], [], [], 0.1)[0]:
                output += os.read(proc.stdout.fileno(), 4096).decode()
                if 'ready' in output.splitlines():
                    return proc
            if proc.poll() is not None:
                self.fail(proc.stderr.read())
        self.fail('local lock holder did not become ready')

    def release(self, proc):
        proc.stdin.write('commit;\n')
        proc.stdin.close()
        proc.stdin = None
        out, err = proc.communicate(timeout=10)
        self.assertEqual(proc.returncode, 0, err)
        return out

    def wait_for_lock(self, name):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            result = self.sql(f"select count(*) from pg_stat_activity where application_name='{name}' and wait_event_type='Lock';")
            if result.stdout.strip() == '1':
                return
            time.sleep(0.02)
        self.fail(f'{name} did not reach the expected lock')

    def restore_fixture(self):
        self.sql('truncate public.profiles, public.favorites, private.room_generations cascade; delete from private.config;')
        self.sql((ROOT / 'test/db-fixture.sql').read_text())

    def test_reciprocal_link_requests_use_one_lock_order(self):
        self.addCleanup(self.restore_fixture)
        # Hold B so the B->A caller queues first. With caller-first locking,
        # A->B would hold A and produce a deterministic deadlock on release.
        holder = self.hold(f"select id from public.profiles where id='{B}' for update;")
        first = self.start_sql('db-test-link-b', "select public.link_partner('token-b','AAAAAA');")
        self.wait_for_lock('db-test-link-b')
        second = self.start_sql('db-test-link-a', "select public.link_partner('token-a','BBBBBB');")
        self.wait_for_lock('db-test-link-a')
        self.release(holder)
        results = [proc.communicate(timeout=10) for proc in (first, second)]
        self.assertEqual(sorted([first.returncode, second.returncode]), [0, 3])
        self.assertTrue(any('already linked' in err for _, err in results), results)
        self.assertFalse(any('deadlock' in err or 'statement timeout' in err for _, err in results), results)
        self.assertEqual(self.sql(f"select count(*) from public.profiles where (id='{A}' and partner_id='{B}') or (id='{B}' and partner_id='{A}');").stdout.strip(), '2')

    def test_link_rechecks_invite_after_waiting_for_profile_lock(self):
        self.addCleanup(self.restore_fixture)
        holder = self.hold(f"update public.profiles set invite_code='NEWWWW' where id='{B}';")
        linking = self.start_sql('db-test-old-invite', "select public.link_partner('token-a','BBBBBB');")
        self.wait_for_lock('db-test-old-invite')
        self.release(holder)
        _, err = linking.communicate(timeout=10)
        self.assertNotEqual(linking.returncode, 0)
        self.assertIn('No one has that code', err)
        self.assertEqual(self.sql('select count(*) from public.profiles where partner_id is not null;').stdout.strip(), '0')

    def test_data_delete_serializes_before_waiting_persistence(self):
        self.addCleanup(self.restore_fixture)
        holder = self.hold(f"select public.admin_delete_couple_data('token-admin','{AB}');")
        saving = self.start_sql('db-test-stale-save', f'select {self.persist()};')
        self.wait_for_lock('db-test-stale-save')
        self.release(holder)
        out, err = saving.communicate(timeout=10)
        self.assertEqual(saving.returncode, 0, err)
        self.assertIn('stale_generation', out)
        self.assertEqual(self.sql('select count(*) from public.answers;').stdout.strip(), '0')

    def test_account_delete_serializes_before_waiting_persistence(self):
        self.addCleanup(self.restore_fixture)
        holder = self.hold(f"select public.admin_delete_user('token-admin','{B}');")
        saving = self.start_sql('db-test-deleted-save', f'select {self.persist(kind="favorite", on="true")};')
        self.wait_for_lock('db-test-deleted-save')
        self.release(holder)
        out, err = saving.communicate(timeout=10)
        self.assertEqual(saving.returncode, 0, err)
        self.assertIn('deleted_account', out)
        self.assertEqual(self.sql('select count(*) from public.favorites;').stdout.strip(), '0')

    def test_data_delete_removes_save_that_was_already_in_flight(self):
        self.addCleanup(self.restore_fixture)
        holder = self.hold(f'select {self.persist()};')
        deleting = self.start_sql('db-test-delete-after-save', f"select public.admin_delete_couple_data('token-admin','{AB}');")
        self.wait_for_lock('db-test-delete-after-save')
        self.release(holder)
        _, err = deleting.communicate(timeout=10)
        self.assertEqual(deleting.returncode, 0, err)
        self.assertEqual(self.sql('select count(*) from public.answers;').stdout.strip(), '0')
        self.assertIn('stale_generation', self.sql(f'{HEADERS} select {self.persist()};').stdout)

    def test_account_delete_removes_favorite_that_was_already_in_flight(self):
        self.addCleanup(self.restore_fixture)
        holder = self.hold(f'select {self.persist(kind="favorite", on="true")};')
        deleting = self.start_sql('db-test-delete-after-favorite', f"select public.admin_delete_user('token-admin','{B}');")
        self.wait_for_lock('db-test-delete-after-favorite')
        self.release(holder)
        _, err = deleting.communicate(timeout=10)
        self.assertEqual(deleting.returncode, 0, err)
        self.assertEqual(self.sql('select count(*) from public.favorites;').stdout.strip(), '0')
        self.assertIn('deleted_account', self.sql(f'{HEADERS} select {self.persist(kind="favorite", on="true")};').stdout)

    def test_unlink_rotates_both_codes_and_rejects_old_invite(self):
        self.transaction(f"""
          select public.link_partner('token-a', 'BBBBBB');
          select public.unlink_partner('token-a');
          {self.assert_sql("not exists(select 1 from public.profiles where invite_code in ('AAAAAA','BBBBBB'))", 'old codes survived unlink')}
          {self.assert_sql(f"not exists(select 1 from public.profiles where id in ('{A}','{B}') and partner_id is not null)", 'relationship survived unlink')}
          do $$ begin
            begin perform public.link_partner('token-a', 'BBBBBB');
              raise exception 'old invite accepted';
            exception when raise_exception then
              if sqlerrm <> 'No one has that code' then raise; end if;
            end;
          end $$;
        """)

    def test_admin_unlink_rotates_both_codes(self):
        self.transaction(f"""
          select public.link_partner('token-a', 'BBBBBB');
          select public.admin_unlink('token-admin', '{B}');
          {self.assert_sql("not exists(select 1 from public.profiles where invite_code in ('AAAAAA','BBBBBB'))", 'old codes survived admin unlink')}
        """)

    def test_delete_user_removes_historical_favorites(self):
        self.transaction(f"""
          insert into public.favorites(couple_id, question) values ('{AB}','old'), ('{AC}','current'), ('{BC}','unrelated');
          select public.link_partner('token-a', 'CCCCCC');
          select public.admin_delete_user('token-admin', '{A}');
          {self.assert_sql(f"(select count(*) from public.favorites) = 1 and exists(select 1 from public.favorites where couple_id='{BC}')", 'historical favorites were retained or unrelated data removed')}
        """)

    def test_persistence_is_idempotent_and_keeps_accepted_pair_after_relink(self):
        self.transaction(f"""
          select public.link_partner('token-a', 'CCCCCC');
          {self.assert_sql(f"({self.persist()})::jsonb = {APPLIED}", 'accepted historical pair was rejected')}
          select {self.persist(op='op-2', text='newest')};
          select {self.persist()};
          {self.assert_sql(f"(select text from public.answers where couple_id='{AB}') = 'newest'", 'duplicate replay replaced newer answer')}
          {self.assert_sql(f"not exists(select 1 from public.answers where couple_id='{AC}')", 'answer redirected to new partner')}
          select {self.persist(op='fav-1', kind='favorite', on='true')};
          select {self.persist(op='fav-2', kind='favorite', on='false')};
          select {self.persist(op='fav-1', kind='favorite', on='true')};
          {self.assert_sql('not exists(select 1 from public.favorites)', 'duplicate favorite restored removed item')}
        """)

    def test_couple_data_identifies_pair_after_relink(self):
        self.transaction(f"""
          select public.link_partner('token-a', 'BBBBBB');
          {self.assert_sql(f"public.couple_data('token-a')->>'couple_id' = '{AB}'", 'initial room pair missing')}
          select {self.persist()};
          select public.unlink_partner('token-a');
          select public.link_partner('token-a', 'CCCCCC');
          {self.assert_sql(f"public.couple_data('token-a')->>'couple_id' = '{AC}'", 'hydration pair did not reflect relink')}
          {self.assert_sql("(public.couple_data('token-a')->'answers')::jsonb = '[]'::jsonb", 'previous pair answers leaked after relink')}
        """)

    def test_generation_prevents_retry_after_delete(self):
        self.transaction(f"""
          select public.link_partner('token-a', 'BBBBBB');
          {self.assert_sql("(public.couple_data('token-a')->>'generation')::bigint = 0", 'initial generation missing')}
          select {self.persist()};
          select public.admin_delete_couple_data('token-admin', '{AB}');
          {self.assert_sql("(public.couple_data('token-a')->>'generation')::bigint = 1", 'generation did not advance')}
          {self.assert_sql(f"({self.persist()})::jsonb = {STALE}", 'deleted generation accepted replay')}
          {self.assert_sql('not exists(select 1 from public.answers)', 'deleted answer was resurrected')}
          select {self.persist(op='new-generation', generation=1)};
          {self.assert_sql('(select count(*) from public.answers) = 1', 'new generation did not accept write')}
        """)

    def test_deleted_pair_member_rejects_delayed_answer_and_favorite(self):
        self.transaction(f"""
          select public.admin_delete_user('token-admin', '{B}');
          {self.assert_sql(f"({self.persist()})::jsonb = {DELETED}", 'deleted pair member accepted answer')}
          {self.assert_sql(f"({self.persist(op='fav', kind='favorite', on='true')})::jsonb = {DELETED}", 'deleted pair member accepted favorite')}
          {self.assert_sql('not exists(select 1 from public.favorites)', 'deleted favorite was resurrected')}
        """)

    def test_server_guard_and_pair_membership(self):
        for query in [
            f"set role anon; set request.headers='{{}}'; select {self.persist()};",
            f"{HEADERS} set role anon; select {self.persist(user=C)};",
            f"{HEADERS} set role anon; select {self.persist(couple=f'{B}:{A}')};",
            "set role anon; select * from private.room_generations;",
            "set role anon; select * from private.room_operations;",
        ]:
            with self.subTest(query=query):
                self.assertNotEqual(self.sql(query, check=False).returncode, 0)
        self.transaction(f"set role anon; select {self.persist()}; reset role;")


if __name__ == '__main__':
    unittest.main(verbosity=2)
