import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadWorker } from './worker-loader.mjs';
import { fakeD1 } from './d1-shim.mjs';

const { modules } = await loadWorker();
const { Db } = modules.get(path.resolve('worker/db.js')).namespace;
const { TERMS_VERSION } = modules.get(path.resolve('worker/safety.js')).namespace;
const { issueReset, redeemReset } = modules.get(path.resolve('worker/resets.js')).namespace;
const { resetEmail, mailEnabled } = modules.get(path.resolve('worker/mail.js')).namespace;

const fakeStorage = () => { const m = new Map(); return { get: async k => m.get(k), put: async (k, v) => { m.set(k, v); }, delete: async k => m.delete(k), size: () => m.size }; };

test('reset links work once, within an hour, and the newest replaces the old', async () => {
  const storage = fakeStorage();
  const first = await issueReset(storage, 'user-1');
  assert.match(first, /^[0-9a-f]{64}$/);
  const second = await issueReset(storage, 'user-1');
  assert.equal(await redeemReset(storage, first), null, 'asking again cancels the earlier link');
  assert.equal(await redeemReset(storage, 'not-a-token'), null);
  assert.equal(await redeemReset(storage, second), 'user-1');
  assert.equal(await redeemReset(storage, second), null, 'a link works once');
  assert.equal(storage.size(), 0, 'nothing is left behind');

  const stale = await issueReset(storage, 'user-2', 1000);
  assert.equal(await redeemReset(storage, stale, 1000 + 61 * 60 * 1000), null, 'links expire after an hour');
  assert.equal(await redeemReset(storage, stale, 1000), null, 'and an expired link is removed too');
});

test('resetting a password signs out every other session', async () => {
  const db = new Db({ DB: fakeD1() });
  const token = await db.rpc('sign_up_with_terms', { p_email: 'sam@test.com', p_password: 'secret12', p_name: 'Sam', p_version: TERMS_VERSION });
  const me = await db.me(token);
  assert.deepEqual(await db.rpc('profile_for_reset', { p_email: ' SAM@test.com ' }), { id: me.id, email: 'sam@test.com', name: 'Sam' });
  assert.equal(await db.rpc('profile_for_reset', { p_email: 'nobody@test.com' }), null);

  await assert.rejects(db.rpc('reset_password', { p_user: me.id, p_password: '123' }), err => err.message === 'Password needs at least 6 characters');
  await assert.rejects(db.rpc('reset_password', { p_user: 'ghost', p_password: 'newpass99' }), err => err.status === 404);
  const fresh = await db.rpc('reset_password', { p_user: me.id, p_password: 'newpass99' });
  assert.equal(await db.me(token), null, 'the old session is gone');
  assert.equal((await db.me(fresh)).id, me.id, 'the reset logs the person in');
  await assert.rejects(db.rpc('log_in', { p_email: 'sam@test.com', p_password: 'secret12' }), err => err.message === 'Wrong email or password');
  assert.equal((await db.me(await db.rpc('log_in', { p_email: 'sam@test.com', p_password: 'newpass99' }))).id, me.id);
});

test('reset email names the person and carries the link, escaped', () => {
  assert.equal(mailEnabled({}), false);
  assert.equal(mailEnabled({ RESEND_API_KEY: 'k', MAIL_FROM: 'Closer <hi@example.com>' }), true);
  const mail = resetEmail({ name: 'Sam <3', link: 'https://closer.example/?reset=abc' });
  assert.equal(mail.subject, 'Reset your Closer password');
  assert.match(mail.text, /Hi Sam <3,[\s\S]*https:\/\/closer\.example\/\?reset=abc/);
  assert.match(mail.html, /Hi Sam &lt;3,/);
  assert.match(mail.html, /href="https:\/\/closer\.example\/\?reset=abc"/);
});
