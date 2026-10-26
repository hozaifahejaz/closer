// Accounts, couple links, answers and favorites live in Cloudflare D1 (binding
// DB, schema in migrations/). Only this Worker can reach the database.
// Each function below keeps the name and arguments of the database function it
// replaced, so callers use db.rpc(name, args) as before. Messages thrown with
// friendly() are written for players; anything else becomes a generic error.
import { TERMS_VERSION } from './safety.js';
import { hashPassword, verifyPassword, sha256Hex } from './passwords.js';

export class DbError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

const friendly = message => new DbError(message, 400);
const loggedOut = () => new DbError('Please log in again', 401);
const forbidden = message => new DbError(message, 403);
const invalid = message => new DbError(message, 500); // a bug or tampering, not a player mistake

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PAIR = new RegExp(`^${UUID}:${UUID}$`);
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const now = () => new Date().toISOString();
const daysAgo = days => new Date(Date.now() - days * 86400e3).toISOString();
const coupleKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
const chars = (text, max) => Array.from(text).slice(0, max).join('');

function randomInviteCode() {
  let code = '';
  while (code.length < 6) {
    const [sample] = crypto.getRandomValues(new Uint8Array(1));
    if (sample < 240) code += CODE_ALPHABET[sample % 24]; // 240 = 10 * 24, so every letter is equally likely
  }
  return code;
}

// A couple room ID ("<uuid>:<uuid>", smaller first) that includes user, if given.
function checkPair(pair, user) {
  if (typeof pair !== 'string' || !PAIR.test(pair)) throw invalid('Invalid room pair');
  const members = pair.split(':');
  if (members[0] >= members[1] || (user !== undefined && !members.includes(user))) throw invalid('Invalid room member');
  return members;
}

export class Db {
  constructor(env) {
    this.d1 = env.DB || null;
    this.enabled = Boolean(this.d1);
  }

  async rpc(fn, args = {}) {
    const call = Object.hasOwn(FUNCTIONS, fn) && FUNCTIONS[fn];
    if (!call) throw new Error(`Unknown database function ${fn}`);
    try { return await call(this, args); }
    catch (err) {
      if (err instanceof DbError) throw err;
      // The safety trigger is the last line of defence for linking.
      if (String(err?.message).includes('These accounts cannot be linked.')) throw friendly('These accounts cannot be linked.');
      throw err;
    }
  }

  // The signed-in player's profile and partner, or null if the session is gone.
  async me(token) {
    if (!this.enabled || !token) return null;
    try { return await this.rpc('my_state', { p_token: token }); }
    catch (err) { if (err.status === 401) return null; throw err; }
  }

  sql(query, ...params) { return this.d1.prepare(query).bind(...params); }
  first(query, ...params) { return this.sql(query, ...params).first(); }
  async all(query, ...params) { return (await this.sql(query, ...params).all()).results; }
  batch(statements) { return this.d1.batch(statements); }

  async sessionProfile(token) {
    const row = await this.first('SELECT profile_id FROM sessions WHERE token_hash = ?', await sha256Hex(String(token || '')));
    if (!row) throw loggedOut();
    return row.profile_id;
  }

  async myCouple(pid) {
    const row = await this.first(
      'SELECT p.id FROM profiles me JOIN profiles p ON p.id = me.partner_id AND p.partner_id = me.id WHERE me.id = ?', pid);
    return row ? coupleKey(pid, row.id) : null;
  }

  async requireAdmin(token) {
    const pid = await this.sessionProfile(token);
    const row = await this.first('SELECT is_admin FROM profiles WHERE id = ?', pid);
    if (!row?.is_admin) throw forbidden('Admins only');
    return pid;
  }

  async newSessionStatement(pid, at = now()) {
    const token = [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('');
    return { token, statement: this.sql('INSERT INTO sessions (token_hash, profile_id, created_at) VALUES (?, ?, ?)', await sha256Hex(token), pid, at) };
  }

  async freeInviteCode(avoid = []) {
    for (;;) {
      const code = randomInviteCode();
      if (avoid.includes(code)) continue;
      if (!await this.first('SELECT 1 AS taken FROM profiles WHERE invite_code = ?', code)) return code;
    }
  }

  // Unlinks the account (and its partner, if they point back) and gives both new invite codes.
  async unlinkProfile(user) {
    const me = await this.first('SELECT id, partner_id, invite_code FROM profiles WHERE id = ?', user);
    if (!me) throw friendly('No such account');
    const partner = me.partner_id ? await this.first('SELECT id, invite_code FROM profiles WHERE id = ? AND partner_id = ?', me.partner_id, user) : null;
    const members = [me, ...(partner ? [partner] : [])];
    const retired = members.map(m => m.invite_code);
    const statements = [];
    for (const member of members) {
      const code = await this.freeInviteCode(retired);
      retired.push(code);
      statements.push(this.sql('UPDATE profiles SET partner_id = NULL, invite_code = ? WHERE id = ?', code, member.id));
    }
    await this.batch(statements);
  }

  // Deletes an account and everything saved for its rooms. Returns the affected
  // room IDs, which are queued so their Durable Objects get wiped too.
  async eraseProfile(user, rooms = []) {
    for (const room of rooms || []) checkPair(room, user);
    if (!await this.first('SELECT 1 AS found FROM profiles WHERE id = ?', user)) throw friendly('No such account');
    const current = await this.myCouple(user);
    await this.unlinkProfile(user);
    const found = await this.all(
      `SELECT couple_id FROM answers WHERE instr(couple_id, ?1) > 0
       UNION SELECT couple_id FROM favorites WHERE instr(couple_id, ?1) > 0
       UNION SELECT couple_id FROM room_generations WHERE instr(couple_id, ?1) > 0`, user);
    const affected = [...new Set([...(current ? [current] : []), ...found.map(r => r.couple_id), ...(rooms || [])])].sort();
    const statements = [];
    for (const pair of affected) statements.push(
      this.sql('INSERT INTO room_cleanup_jobs (couple_id, queued_at) VALUES (?, ?) ON CONFLICT DO NOTHING', pair, now()),
      this.sql('DELETE FROM answers WHERE couple_id = ?', pair),
      this.sql('DELETE FROM favorites WHERE couple_id = ?', pair),
      this.sql('DELETE FROM room_generations WHERE couple_id = ?', pair));
    statements.push(this.sql('DELETE FROM profiles WHERE id = ?', user));
    await this.batch(statements);
    return affected;
  }
}

const FUNCTIONS = {
  async sign_up_with_terms(db, { p_email, p_password, p_name, p_version }) {
    if (p_version !== TERMS_VERSION) throw friendly('Accept the Terms of Use before signing up.');
    const email = String(p_email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw friendly('Please enter a valid email');
    if (Array.from(String(p_password || '')).length < 6) throw friendly('Password needs at least 6 characters');
    const taken = () => friendly('That email already has an account. Try logging in');
    if (await db.first('SELECT 1 AS taken FROM profiles WHERE email = ?', email)) throw taken();
    const pid = crypto.randomUUID();
    const name = chars(String(p_name || '').trim() || 'Partner', 24);
    const passwordHash = await hashPassword(String(p_password)), at = now();
    const { token, statement } = await db.newSessionStatement(pid, at);
    try {
      await db.batch([
        db.sql('INSERT INTO profiles (id, email, password_hash, name, invite_code, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          pid, email, passwordHash, name, await db.freeInviteCode(), at),
        statement,
        db.sql('INSERT INTO terms_acceptances (user_id, version, accepted_at) VALUES (?, ?, ?)', pid, TERMS_VERSION, at),
      ]);
    } catch (err) {
      if (/UNIQUE/i.test(String(err?.message)) && String(err.message).includes('email')) throw taken();
      throw err;
    }
    return token;
  },

  async log_in(db, { p_email, p_password }) {
    const me = await db.first('SELECT id, password_hash FROM profiles WHERE email = ?', String(p_email || '').trim().toLowerCase());
    const check = me ? await verifyPassword(String(p_password || ''), me.password_hash) : { ok: false };
    if (!check.ok) throw friendly('Wrong email or password');
    const { token, statement } = await db.newSessionStatement(me.id);
    await db.batch([statement, ...(check.rehash
      ? [db.sql('UPDATE profiles SET password_hash = ? WHERE id = ?', await hashPassword(String(p_password)), me.id)] : [])]);
    return token;
  },

  async log_out(db, { p_token }) {
    await db.sql('DELETE FROM sessions WHERE token_hash = ?', await sha256Hex(String(p_token || ''))).run();
  },

  async my_state(db, { p_token }) {
    const pid = await db.sessionProfile(p_token);
    const row = await db.first(
      `SELECT me.id, me.name, me.email, me.invite_code, me.is_admin, p.id AS partner_id, p.name AS partner_name,
              EXISTS (SELECT 1 FROM terms_acceptances t WHERE t.user_id = me.id AND t.version = ?) AS terms_accepted
       FROM profiles me LEFT JOIN profiles p ON p.id = me.partner_id AND p.partner_id = me.id WHERE me.id = ?`, TERMS_VERSION, pid);
    if (!row) return null;
    return {
      id: row.id, name: row.name, email: row.email, invite_code: row.invite_code,
      partner: row.partner_id ? { id: row.partner_id, name: row.partner_name } : null,
      couple_id: row.partner_id ? coupleKey(row.id, row.partner_id) : null,
      is_admin: Boolean(row.is_admin), terms_accepted: Boolean(row.terms_accepted),
    };
  },

  async accept_terms(db, { p_token, p_version }) {
    const pid = await db.sessionProfile(p_token);
    if (p_version !== TERMS_VERSION) throw friendly('Please review the current terms.');
    await db.sql(`INSERT INTO terms_acceptances (user_id, version, accepted_at) VALUES (?1, ?2, ?3)
      ON CONFLICT (user_id) DO UPDATE SET version = excluded.version, accepted_at = excluded.accepted_at`, pid, p_version, now()).run();
  },

  async update_display_name(db, { p_token, p_name }) {
    const pid = await db.sessionProfile(p_token);
    const clean = typeof p_name === 'string' ? p_name.trim() : '';
    const length = Array.from(clean).length;
    if (length < 1 || length > 24 || /[\u0000-\u001f\u007f-\u009f]/.test(clean))
      throw friendly('Use a name between 1 and 24 characters, without line breaks.');
    await db.sql('UPDATE profiles SET name = ? WHERE id = ?', clean, pid).run();
    return FUNCTIONS.my_state(db, { p_token });
  },

  async safety_state(db, { p_token }) {
    const pid = await db.sessionProfile(p_token);
    const row = await db.first(
      'SELECT safety_restricted, EXISTS (SELECT 1 FROM terms_acceptances WHERE user_id = ?1 AND version = ?2) AS accepted FROM profiles WHERE id = ?1',
      pid, TERMS_VERSION);
    return { accepted: Boolean(row?.accepted), restricted: row ? Boolean(row.safety_restricted) : null };
  },

  async link_partner(db, { p_token, p_code }) {
    const pid = await db.sessionProfile(p_token);
    const code = String(p_code || '').trim().toUpperCase();
    const other = await db.first('SELECT id, name, partner_id FROM profiles WHERE invite_code = ?', code);
    if (!other) throw friendly('No one has that code');
    if (other.id === pid) throw friendly("That's your own code. Send it to your partner");
    const me = await db.first('SELECT partner_id FROM profiles WHERE id = ?', pid);
    if (!me) throw loggedOut();
    if (me.partner_id) throw friendly("You're already linked with a partner");
    if (other.partner_id) throw friendly('That person is already linked with someone');
    // One statement links both or neither, and only if nothing changed meanwhile
    // (the code wasn't rotated and neither account got linked).
    const result = await db.sql(
      `UPDATE profiles SET partner_id = CASE id WHEN ?1 THEN ?2 ELSE ?1 END
       WHERE id IN (?1, ?2)
         AND (SELECT count(*) FROM profiles WHERE id IN (?1, ?2) AND partner_id IS NULL) = 2
         AND (SELECT invite_code FROM profiles WHERE id = ?2) = ?3`, pid, other.id, code).run();
    if (result.meta.changes !== 2) throw friendly('Your partner changed. Please try again.');
    return { name: other.name };
  },

  async unlink_partner(db, { p_token }) {
    await db.unlinkProfile(await db.sessionProfile(p_token));
  },

  async block_partner(db, { p_token }) {
    const pid = await db.sessionProfile(p_token);
    const me = await db.first('SELECT partner_id FROM profiles WHERE id = ?', pid);
    if (!me?.partner_id) throw friendly('There is no partner to block.');
    await db.sql('INSERT INTO user_blocks (blocker, blocked, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', pid, me.partner_id, now()).run();
    await db.unlinkProfile(pid);
  },

  async delete_own_account_with_rooms(db, { p_token, p_password, p_rooms }) {
    const pid = await db.sessionProfile(p_token);
    const row = await db.first('SELECT password_hash FROM profiles WHERE id = ?', pid);
    if (!row || !(await verifyPassword(String(p_password || ''), row.password_hash)).ok) throw friendly('Incorrect password');
    return db.eraseProfile(pid, p_rooms);
  },

  // ---- Admin ----
  async admin_restrict_user(db, { p_token, p_user, p_on }) {
    const admin = await db.requireAdmin(p_token);
    const target = await db.first('SELECT partner_id, is_admin FROM profiles WHERE id = ?', p_user);
    if (p_user === admin || target?.is_admin) throw friendly('Admin accounts cannot be restricted here.');
    if (!target) throw friendly('Account not found.');
    if (p_on) await db.batch([
      db.sql('UPDATE profiles SET safety_restricted = 1, partner_id = NULL WHERE id = ?', p_user),
      db.sql('UPDATE profiles SET partner_id = NULL WHERE id = ? AND partner_id = ?', target.partner_id, p_user),
    ]);
    else await db.sql('UPDATE profiles SET safety_restricted = 0 WHERE id = ?', p_user).run();
  },

  async admin_set_admin(db, { p_token, p_user, p_on }) {
    const admin = await db.requireAdmin(p_token);
    if (p_user === admin && !p_on) throw friendly("You can't remove your own admin access");
    const result = await db.sql('UPDATE profiles SET is_admin = ? WHERE id = ?', p_on ? 1 : 0, p_user).run();
    if (!result.meta.changes) throw friendly('No such account');
  },

  async admin_sign_out(db, { p_token, p_user }) {
    await db.requireAdmin(p_token);
    await db.sql('DELETE FROM sessions WHERE profile_id = ?', p_user).run();
  },

  async admin_unlink(db, { p_token, p_user }) {
    await db.requireAdmin(p_token);
    await db.unlinkProfile(p_user);
  },

  async admin_delete_user_with_rooms(db, { p_token, p_user, p_rooms }) {
    const admin = await db.requireAdmin(p_token);
    if (p_user === admin) throw friendly("You can't delete your own account here");
    return db.eraseProfile(p_user, p_rooms);
  },

  async admin_delete_couple_data(db, { p_token, p_couple_id }) {
    await db.requireAdmin(p_token);
    await db.batch([
      // The new generation turns away delayed saves for the deleted data.
      db.sql('INSERT INTO room_generations (couple_id) VALUES (?) ON CONFLICT DO NOTHING', p_couple_id),
      db.sql('UPDATE room_generations SET generation = generation + 1 WHERE couple_id = ?', p_couple_id),
      db.sql('DELETE FROM answers WHERE couple_id = ?', p_couple_id),
      db.sql('DELETE FROM favorites WHERE couple_id = ?', p_couple_id),
      db.sql('DELETE FROM room_operations WHERE couple_id = ?', p_couple_id),
    ]);
  },

  async admin_stats(db, { p_token }) {
    await db.requireAdmin(p_token);
    const today = now().slice(0, 10);
    const d7 = daysAgo(7), d30 = daysAgo(30);
    const days = Array.from({ length: 30 }, (_, i) => daysAgo(29 - i).slice(0, 10));
    const active = since => `SELECT count(DISTINCT id) FROM (
      SELECT profile_id AS id FROM sessions WHERE created_at > '${since}'
      UNION ALL SELECT user_id FROM answers WHERE created_at > '${since}'
      UNION ALL SELECT user_id FROM user_activity WHERE last_active_at > '${since}')`;
    const [counts] = await db.all(`SELECT
      (SELECT count(*) FROM profiles) AS users,
      (SELECT count(*) FROM profiles WHERE created_at >= ?1) AS users_today,
      (SELECT count(*) FROM profiles WHERE created_at > ?2) AS users_7d,
      (SELECT count(*) FROM profiles WHERE created_at > ?3) AS users_30d,
      (SELECT count(*) FROM profiles me JOIN profiles p ON p.id = me.partner_id AND p.partner_id = me.id WHERE me.id < p.id) AS couples,
      (SELECT count(*) FROM profiles WHERE partner_id IS NULL) AS waiting_for_partner,
      (SELECT count(*) FROM answers) AS answers,
      (SELECT count(*) FROM answers WHERE created_at > ?2) AS answers_7d,
      (SELECT count(*) FROM favorites) AS favorites,
      (${active(d7)}) AS active_7d,
      (${active(d30)}) AS active_30d,
      (SELECT count(DISTINCT couple_id) FROM answers) AS couples_answering`, today, d7, d30);
    const perDay = async table => {
      const rows = await db.all(`SELECT substr(created_at, 1, 10) AS day, count(*) AS c FROM ${table} WHERE created_at >= ? GROUP BY 1`, days[0]);
      const byDay = new Map(rows.map(r => [r.day, r.c]));
      return days.map(d => byDay.get(d) || 0);
    };
    return {
      ...counts, days,
      signups_by_day: await perDay('profiles'),
      answers_by_day: await perDay('answers'),
      top_answered: await db.all('SELECT question, count(*) AS count FROM answers GROUP BY question ORDER BY count(*) DESC, question LIMIT 10'),
      top_favorited: await db.all('SELECT question, count(*) AS count FROM favorites GROUP BY question ORDER BY count(*) DESC, question LIMIT 10'),
      by_category: await db.all(`SELECT CASE WHEN instr(card_key, ':') > 0 THEN substr(card_key, 1, instr(card_key, ':') - 1) ELSE card_key END AS category,
        count(*) AS count FROM answers GROUP BY 1 ORDER BY 2 DESC`),
    };
  },

  async admin_users(db, { p_token, p_search }) {
    await db.requireAdmin(p_token);
    const q = `%${String(p_search || '').trim().toLowerCase()}%`;
    const rows = await db.all(
      `SELECT p.id, p.name, p.email, p.created_at, p.is_admin,
              partner.id AS partner_id, partner.name AS partner_name, partner.email AS partner_email,
              (SELECT count(*) FROM answers a WHERE a.user_id = p.id) AS answers,
              (SELECT max(created_at) FROM sessions s WHERE s.profile_id = p.id) AS last_login,
              (SELECT max(created_at) FROM answers a WHERE a.user_id = p.id) AS last_answer
       FROM profiles p LEFT JOIN profiles partner ON partner.id = p.partner_id AND partner.partner_id = p.id
       WHERE lower(p.name) LIKE ?1 OR lower(p.email) LIKE ?1
       ORDER BY p.created_at DESC LIMIT 500`, q);
    return rows.map(({ partner_id, partner_name, partner_email, is_admin, ...row }) => ({
      ...row, is_admin: Boolean(is_admin),
      partner: partner_id ? { id: partner_id, name: partner_name, email: partner_email } : null,
    }));
  },

  async admin_couples(db, { p_token }) {
    await db.requireAdmin(p_token);
    const rows = await db.all(
      `SELECT a.id AS a_id, a.name AS a_name, a.email AS a_email, b.id AS b_id, b.name AS b_name, b.email AS b_email
       FROM profiles a JOIN profiles b ON b.id = a.partner_id AND b.partner_id = a.id WHERE a.id < b.id`);
    const couples = [];
    for (const r of rows) {
      const id = coupleKey(r.a_id, r.b_id);
      const stats = await db.first(
        `SELECT (SELECT count(*) FROM answers WHERE couple_id = ?1) AS answers,
                (SELECT count(*) FROM favorites WHERE couple_id = ?1) AS favorites,
                (SELECT max(created_at) FROM answers WHERE couple_id = ?1) AS last_activity`, id);
      couples.push({ id, partners: [{ id: r.a_id, name: r.a_name, email: r.a_email }, { id: r.b_id, name: r.b_name, email: r.b_email }], ...stats });
    }
    return couples.sort((x, y) => (y.last_activity || '').localeCompare(x.last_activity || ''));
  },

  // ---- Rooms (called by the Worker and room objects, never with player input alone) ----
  async pending_room_cleanup(db, { p_rooms = null }) {
    const rows = await db.all('SELECT couple_id FROM room_cleanup_jobs ORDER BY queued_at, couple_id');
    return rows.filter(r => !p_rooms || p_rooms.includes(r.couple_id)).slice(0, 100);
  },

  async complete_room_cleanup(db, { p_couple_id }) {
    await db.sql('DELETE FROM room_cleanup_jobs WHERE couple_id = ?', p_couple_id).run();
  },

  async register_room(db, { p_token, p_couple_id }) {
    const pid = await db.sessionProfile(p_token);
    const members = checkPair(p_couple_id);
    const found = await db.first('SELECT count(*) AS n FROM profiles WHERE id IN (?, ?)', ...members);
    if (found.n !== 2 || !members.includes(pid) || await db.myCouple(pid) !== p_couple_id)
      throw forbidden('Your session or partner link changed. Please reopen your room.');
    await db.sql('INSERT INTO room_generations (couple_id) VALUES (?) ON CONFLICT DO NOTHING', p_couple_id).run();
  },

  async couple_data(db, { p_token }) {
    const cid = await db.myCouple(await db.sessionProfile(p_token));
    if (!cid) throw friendly('Link with your partner first');
    const generation = await db.first('SELECT generation FROM room_generations WHERE couple_id = ?', cid);
    return {
      couple_id: cid,
      generation: generation?.generation || 0,
      answers: await db.all('SELECT card_key, user_id, text FROM answers WHERE couple_id = ?', cid),
      favorites: (await db.all('SELECT question FROM favorites WHERE couple_id = ? ORDER BY created_at', cid)).map(r => r.question),
    };
  },

  async record_activity(db, { p_token }) {
    const pid = await db.sessionProfile(p_token);
    await db.sql(`INSERT INTO user_activity (user_id, last_active_at) VALUES (?1, ?2)
      ON CONFLICT (user_id) DO UPDATE SET last_active_at = excluded.last_active_at`, pid, now()).run();
  },

  // Saves one answer or favorite from a room's outbox. The room authorized it
  // when the player sent it, so this checks the pair, not today's partner.
  async persist_room_change(db, { p_couple_id, p_generation, p_id, p_user, p_kind, p_card_key, p_question, p_text, p_on }) {
    const members = checkPair(p_couple_id, p_user);
    if (!Number.isInteger(p_generation) || p_generation < 0 || typeof p_id !== 'string' || !p_id.trim() || p_id.length > 128
        || !['answer', 'favorite'].includes(p_kind) || !p_card_key || !p_question
        || (p_kind === 'answer' && typeof p_text !== 'string') || (p_kind === 'favorite' && typeof p_on !== 'boolean'))
      throw invalid('Invalid room operation');
    const found = await db.first('SELECT count(*) AS n FROM profiles WHERE id IN (?, ?)', ...members);
    if (found.n !== 2) return { applied: false, reason: 'deleted_account' };
    await db.sql('INSERT INTO room_generations (couple_id) VALUES (?) ON CONFLICT DO NOTHING', p_couple_id).run();
    const current = await db.first('SELECT generation FROM room_generations WHERE couple_id = ?', p_couple_id);
    if (current.generation !== p_generation) return { applied: false, reason: 'stale_generation' };
    if (await db.first('SELECT 1 AS done FROM room_operations WHERE couple_id = ? AND generation = ? AND user_id = ? AND operation_id = ?',
      p_couple_id, p_generation, p_user, p_id)) return { applied: true };
    // Every write repeats the generation check, so data deleted in the meantime stays deleted.
    const sameGeneration = 'EXISTS (SELECT 1 FROM room_generations WHERE couple_id = ?1 AND generation = ?2)';
    const change = p_kind === 'answer'
      ? db.sql(`INSERT INTO answers (couple_id, card_key, user_id, question, text, created_at)
          SELECT ?1, ?3, ?4, ?5, ?6, ?7 WHERE ${sameGeneration}
          ON CONFLICT (couple_id, card_key, user_id) DO UPDATE SET text = excluded.text, question = excluded.question, created_at = excluded.created_at`,
          p_couple_id, p_generation, p_card_key, p_user, p_question, chars(p_text, 1000), now())
      : p_on
        ? db.sql(`INSERT INTO favorites (couple_id, question, created_at) SELECT ?1, ?3, ?4 WHERE ${sameGeneration} ON CONFLICT DO NOTHING`,
            p_couple_id, p_generation, p_question, now())
        : db.sql(`DELETE FROM favorites WHERE couple_id = ?1 AND question = ?3 AND ${sameGeneration}`, p_couple_id, p_generation, p_question);
    const [, receipt] = await db.batch([change, db.sql(
      `INSERT INTO room_operations (couple_id, generation, user_id, operation_id) SELECT ?1, ?2, ?3, ?4 WHERE ${sameGeneration}`,
      p_couple_id, p_generation, p_user, p_id)]);
    return receipt.meta.changes ? { applied: true } : { applied: false, reason: 'stale_generation' };
  },
};
