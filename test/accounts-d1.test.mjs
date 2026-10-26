import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadWorker } from './worker-loader.mjs';
import { fakeD1 } from './d1-shim.mjs';

const { modules } = await loadWorker();
const { Db } = modules.get(path.resolve('worker/db.js')).namespace;
const { TERMS_VERSION } = modules.get(path.resolve('worker/safety.js')).namespace;

function setup() {
  const d1 = fakeD1();
  const db = new Db({ DB: d1 });
  const signUp = (email, name = email.split('@')[0]) =>
    db.rpc('sign_up_with_terms', { p_email: email, p_password: 'secret12', p_name: name, p_version: TERMS_VERSION });
  return { d1, db, signUp, rows: sql => d1.sqlite.prepare(sql).all() };
}
async function rejects(promise, message, status = 400) {
  await assert.rejects(promise, err => { assert.equal(err.message, message); assert.equal(err.status, status); return true; });
}
async function linkedPair(t) {
  const a = await t.signUp('a@test.com'), b = await t.signUp('b@test.com');
  const meB = await t.db.me(b);
  await t.db.rpc('link_partner', { p_token: a, p_code: meB.invite_code });
  return { a, b, me: await t.db.me(a), meB: await t.db.me(b) };
}

test('sign up, log in and log out', async () => {
  const t = setup();
  const token = await t.signUp(' Sam@Test.com ', 'Sam');
  const me = await t.db.me(token);
  assert.equal(me.email, 'sam@test.com');
  assert.equal(me.name, 'Sam');
  assert.match(me.invite_code, /^[A-HJ-NP-Z]{6}$/);
  assert.equal(me.terms_accepted, true);
  assert.equal(me.is_admin, false);
  assert.equal(me.partner, null);
  assert.match(t.rows('SELECT password_hash FROM profiles')[0].password_hash, /^pbkdf2-sha256\$100000\$/);
  assert.notEqual(t.rows('SELECT token_hash FROM sessions')[0].token_hash, token, 'only a hash of the token is stored');

  await rejects(t.signUp('sam@test.com'), 'That email already has an account. Try logging in');
  await rejects(t.db.rpc('sign_up_with_terms', { p_email: 'x', p_password: 'secret12', p_name: '', p_version: TERMS_VERSION }), 'Please enter a valid email');
  await rejects(t.db.rpc('sign_up_with_terms', { p_email: 'x@y.co', p_password: '123', p_name: '', p_version: TERMS_VERSION }), 'Password needs at least 6 characters');
  await rejects(t.db.rpc('sign_up_with_terms', { p_email: 'x@y.co', p_password: 'secret12', p_name: '', p_version: 'old' }), 'Accept the Terms of Use before signing up.');
  await rejects(t.db.rpc('log_in', { p_email: 'sam@test.com', p_password: 'wrong!' }), 'Wrong email or password');
  await rejects(t.db.rpc('log_in', { p_email: 'nobody@test.com', p_password: 'secret12' }), 'Wrong email or password');

  const second = await t.db.rpc('log_in', { p_email: 'SAM@test.com', p_password: 'secret12' });
  assert.equal((await t.db.me(second)).id, me.id);
  await t.db.rpc('log_out', { p_token: token });
  assert.equal(await t.db.me(token), null);
  assert.equal((await t.db.me(second)).id, me.id);
  await rejects(t.db.rpc('my_state', { p_token: 'nope' }), 'Please log in again', 401);
});

test('passwords and sessions copied from Supabase keep working', async () => {
  const t = setup();
  // A bcrypt hash in pgcrypto's $2a$ format, and a session stored as the token's SHA-256.
  const { hashSync } = modules.get(path.resolve('worker/vendor/bcrypt.js')).namespace;
  const hash = hashSync('secret12', 10).replace(/^\$2b\$/, '$2a$');
  t.d1.sqlite.prepare("INSERT INTO profiles (id, email, password_hash, name, invite_code) VALUES ('00000000-0000-4000-8000-000000000001', 'old@test.com', ?, 'Old', 'ABCDEF')").run(hash);
  const sessionHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('old-token')))].map(b => b.toString(16).padStart(2, '0')).join('');
  t.d1.sqlite.prepare("INSERT INTO sessions (token_hash, profile_id) VALUES (?, '00000000-0000-4000-8000-000000000001')").run(sessionHash);
  assert.equal((await t.db.me('old-token')).email, 'old@test.com');

  await rejects(t.db.rpc('log_in', { p_email: 'old@test.com', p_password: 'wrong!' }), 'Wrong email or password');
  assert.ok(await t.db.rpc('log_in', { p_email: 'old@test.com', p_password: 'secret12' }));
  assert.match(t.rows('SELECT password_hash FROM profiles')[0].password_hash, /^pbkdf2-sha256\$/, 'upgraded after a good log-in');
  assert.ok(await t.db.rpc('log_in', { p_email: 'old@test.com', p_password: 'secret12' }));
});

test('linking, unlinking and blocking', async () => {
  const t = setup();
  const a = await t.signUp('a@test.com', 'Ann'), b = await t.signUp('b@test.com', 'Ben'), c = await t.signUp('c@test.com');
  const [meA, meB, meC] = [await t.db.me(a), await t.db.me(b), await t.db.me(c)];
  await rejects(t.db.rpc('link_partner', { p_token: a, p_code: 'ZZZZZZ' }), 'No one has that code');
  await rejects(t.db.rpc('link_partner', { p_token: a, p_code: meA.invite_code }), "That's your own code. Send it to your partner");
  assert.deepEqual({ ...await t.db.rpc('link_partner', { p_token: a, p_code: ` ${meB.invite_code.toLowerCase()} ` }) }, { name: 'Ben' });
  const linked = await t.db.me(a);
  assert.deepEqual({ ...linked.partner }, { id: meB.id, name: 'Ben' });
  assert.equal(linked.couple_id, [meA.id, meB.id].sort().join(':'));
  assert.equal((await t.db.me(b)).couple_id, linked.couple_id);
  await rejects(t.db.rpc('link_partner', { p_token: c, p_code: meA.invite_code }), 'That person is already linked with someone');
  await rejects(t.db.rpc('link_partner', { p_token: a, p_code: meC.invite_code }), "You're already linked with a partner");

  await t.db.rpc('unlink_partner', { p_token: b });
  const [afterA, afterB] = [await t.db.me(a), await t.db.me(b)];
  assert.equal(afterA.partner, null);
  assert.equal(afterB.partner, null);
  assert.notEqual(afterA.invite_code, meA.invite_code, 'unlinking rotates both codes');
  assert.notEqual(afterB.invite_code, meB.invite_code);

  await t.db.rpc('link_partner', { p_token: a, p_code: afterB.invite_code });
  await t.db.rpc('block_partner', { p_token: a });
  assert.equal((await t.db.me(b)).partner, null);
  await rejects(t.db.rpc('link_partner', { p_token: b, p_code: (await t.db.me(a)).invite_code }), 'These accounts cannot be linked.');
  await rejects(t.db.rpc('block_partner', { p_token: a }), 'There is no partner to block.');
});

test('room saves apply once, respect deletions and couple data reads them back', async () => {
  const t = setup();
  const { a, me, meB } = await linkedPair(t);
  const pair = me.couple_id;
  await t.db.rpc('register_room', { p_token: a, p_couple_id: pair });
  const op = (id, extra) => t.db.rpc('persist_room_change', { p_couple_id: pair, p_generation: 0, p_id: id, p_user: me.id, p_kind: 'answer',
    p_card_key: 'deep:1', p_question: 'Q1', p_text: 'Hello', p_on: null, ...extra });
  assert.deepEqual({ ...await op('op-1') }, { applied: true });
  assert.deepEqual({ ...await op('op-1', { p_text: 'Changed' }) }, { applied: true });
  assert.equal(t.rows('SELECT text FROM answers')[0].text, 'Hello', 'a repeated save is not applied twice');
  assert.deepEqual({ ...await op('fav-1', { p_kind: 'favorite', p_on: true, p_text: null }) }, { applied: true });

  const data = await t.db.rpc('couple_data', { p_token: a });
  assert.equal(data.generation, 0);
  assert.deepEqual(data.answers.map(x => ({ ...x })), [{ card_key: 'deep:1', user_id: me.id, text: 'Hello' }]);
  assert.deepEqual([...data.favorites], ['Q1']);

  const admin = me.id;
  t.d1.sqlite.prepare('UPDATE profiles SET is_admin = 1 WHERE id = ?').run(admin);
  await t.db.rpc('admin_delete_couple_data', { p_token: a, p_couple_id: pair });
  assert.deepEqual({ ...await op('op-2') }, { applied: false, reason: 'stale_generation' });
  assert.equal(t.rows('SELECT * FROM answers').length, 0);
  assert.equal((await t.db.rpc('couple_data', { p_token: a })).generation, 1);
  await assert.rejects(op('op-3', { p_couple_id: pair.split(':').reverse().join(':') }), /Invalid room/);
  await assert.rejects(op('op-3', { p_kind: 'nope' }), /Invalid room operation/);
  await rejects(t.db.rpc('register_room', { p_token: a, p_couple_id: [me.id, '00000000-0000-4000-8000-000000000009'].sort().join(':') }),
    'Your session or partner link changed. Please reopen your room.', 403);
});

test('deleting an account removes its data and queues its rooms', async () => {
  const t = setup();
  const { a, b, me, meB } = await linkedPair(t);
  await t.db.rpc('persist_room_change', { p_couple_id: me.couple_id, p_generation: 0, p_id: 'op-1', p_user: me.id, p_kind: 'answer',
    p_card_key: 'deep:1', p_question: 'Q1', p_text: 'Hi', p_on: null });
  await rejects(t.db.rpc('delete_own_account_with_rooms', { p_token: a, p_password: 'wrong!', p_rooms: [] }), 'Incorrect password');
  const rooms = await t.db.rpc('delete_own_account_with_rooms', { p_token: a, p_password: 'secret12', p_rooms: [] });
  assert.deepEqual([...rooms], [me.couple_id]);
  for (const table of ['answers', 'room_generations', 'room_operations', 'sessions WHERE profile_id = ' + JSON.stringify(me.id).replaceAll('"', "'")])
    assert.equal(t.rows(`SELECT * FROM ${table}`).length, 0, table);
  assert.equal(t.rows('SELECT * FROM profiles').length, 1);
  assert.equal((await t.db.me(b)).partner, null);
  assert.notEqual((await t.db.me(b)).invite_code, meB.invite_code);
  assert.deepEqual((await t.db.rpc('pending_room_cleanup', {})).map(r => r.couple_id), [me.couple_id]);
  assert.deepEqual([...await t.db.rpc('pending_room_cleanup', { p_rooms: ['other'] })], []);
  await t.db.rpc('complete_room_cleanup', { p_couple_id: me.couple_id });
  assert.deepEqual([...await t.db.rpc('pending_room_cleanup', {})], []);
});

test('admin tools', async () => {
  const t = setup();
  const { a, b, me, meB } = await linkedPair(t);
  const c = await t.signUp('c@test.com');
  await rejects(t.db.rpc('admin_stats', { p_token: a }), 'Admins only', 403);
  t.d1.sqlite.prepare('UPDATE profiles SET is_admin = 1 WHERE id = ?').run(me.id);
  await t.db.rpc('record_activity', { p_token: b });

  const stats = await t.db.rpc('admin_stats', { p_token: a });
  assert.equal(stats.users, 3);
  assert.equal(stats.users_today, 3);
  assert.equal(stats.couples, 1);
  assert.equal(stats.waiting_for_partner, 1);
  assert.equal(stats.active_7d, 3);
  assert.equal(stats.days.length, 30);
  assert.equal(stats.signups_by_day.at(-1), 3);

  const users = await t.db.rpc('admin_users', { p_token: a, p_search: 'B@TEST' });
  assert.equal(users.length, 1);
  assert.equal(users[0].partner.id, me.id);
  assert.equal(users[0].is_admin, false);
  const couples = await t.db.rpc('admin_couples', { p_token: a });
  assert.equal(couples[0].id, me.couple_id);
  assert.equal(couples[0].answers, 0);

  await rejects(t.db.rpc('admin_restrict_user', { p_token: a, p_user: me.id, p_on: true }), 'Admin accounts cannot be restricted here.');
  await t.db.rpc('admin_restrict_user', { p_token: a, p_user: meB.id, p_on: true });
  assert.equal((await t.db.me(a)).partner, null);
  assert.equal((await t.db.rpc('safety_state', { p_token: b })).restricted, true);
  await rejects(t.db.rpc('link_partner', { p_token: b, p_code: (await t.db.me(c)).invite_code }), 'These accounts cannot be linked.');
  await t.db.rpc('admin_restrict_user', { p_token: a, p_user: meB.id, p_on: false });

  await t.db.rpc('admin_set_admin', { p_token: a, p_user: meB.id, p_on: true });
  assert.equal((await t.db.me(b)).is_admin, true);
  await rejects(t.db.rpc('admin_set_admin', { p_token: a, p_user: me.id, p_on: false }), "You can't remove your own admin access");
  await t.db.rpc('admin_sign_out', { p_token: a, p_user: meB.id });
  assert.equal(await t.db.me(b), null);
  await rejects(t.db.rpc('admin_delete_user_with_rooms', { p_token: a, p_user: me.id, p_rooms: [] }), "You can't delete your own account here");
  await t.db.rpc('admin_delete_user_with_rooms', { p_token: a, p_user: meB.id, p_rooms: [] });
  assert.equal((await t.db.rpc('admin_users', { p_token: a, p_search: '' })).length, 2);
});

test('profile name and terms', async () => {
  const t = setup();
  const a = await t.signUp('a@test.com');
  assert.equal((await t.db.rpc('update_display_name', { p_token: a, p_name: '  Ann  ' })).name, 'Ann');
  await rejects(t.db.rpc('update_display_name', { p_token: a, p_name: 'x'.repeat(25) }), 'Use a name between 1 and 24 characters, without line breaks.');
  await rejects(t.db.rpc('accept_terms', { p_token: a, p_version: 'old' }), 'Please review the current terms.');
  await t.db.rpc('accept_terms', { p_token: a, p_version: TERMS_VERSION });
  assert.equal((await t.db.rpc('safety_state', { p_token: a })).accepted, true);
});
