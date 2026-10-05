// Closer on Cloudflare Workers.
//
// - The page itself is served from ./public as static assets.
// - Each room (a guest room with a 4-letter code, or a linked couple's private
//   room) is a Durable Object. Both phones hold a WebSocket to it, and every tap
//   is sent over that socket and broadcast back to both.
// - Accounts go through database functions in Supabase (see supabase/schema.sql).
import { DurableObject } from 'cloudflare:workers';
import { randomCode, newRoom, upgradeRoom, publicState, applyAction, cardKey, deckSummary, cardUsage } from './game.js';
import { Db, DbError } from './db.js';
import { TERMS_VERSION, SAFETY, REASONS, safetyHandle, safetyFetch, safetyAlarm } from './safety.js';
import { RoomStorage, listEntries } from './room-storage.js';

// Idle rooms are forgotten: guest rooms after 6 hours, couple rooms after a year.
// A couple's room holds their place in each deck; if it's ever forgotten it is
// rebuilt from their saved answers next time they open it.
const GUEST_ROOM_TTL = 6 * 3600e3;
const COUPLE_ROOM_TTL = 365 * 86400e3;

const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

async function readBody(request) {
  try { return await request.json(); } catch { return {}; }
}

function tokenOf(request, url) {
  const header = request.headers.get('Authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : url.searchParams.get('token');
}

// The sign-in is also kept in a first-party, HttpOnly cookie. Browsers (Safari
// especially) may wipe a site's localStorage after a few weeks away, but keep this
// cookie, so people stay signed in until they log out. The cookie is only honoured
// by same-origin requests that just read (GET /api/me, the room WebSocket) and by
// logging out; everything else still needs the token in the Authorization header.
const COOKIE = 'closer_session';
const cookieToken = request => (request.headers.get('Cookie') || '').split(/;\s*/)
  .find(c => c.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) || null;
const sameOrigin = (request, url) => { const o = request.headers.get('Origin'); return !o || o === url.origin; };
const sessionCookie = (url, token) => `${COOKIE}=${token || ''}; Path=/api/; HttpOnly; SameSite=Lax; Max-Age=${token ? 400 * 86400 : 0}` +
  (url.protocol === 'https:' ? '; Secure' : '');
function withCookie(response, url, token) {
  const r = new Response(response.body, response);
  r.headers.append('Set-Cookie', sessionCookie(url, token));
  return r;
}

// Slows down password guessing, invite-code guessing and room spam. The limiters are
// Cloudflare rate limiting bindings (see wrangler.jsonc); without them nothing is limited.
async function tooMany(limiter, ...keys) {
  if (!limiter) return false;
  for (const key of keys) if (!(await limiter.limit({ key })).success) return true;
  return false;
}
const clientIp = request => request.headers.get('CF-Connecting-IP') || 'local';
const slowDown = () => json(429, { error: 'Too many tries. Please wait a minute and try again' });

const publicMe = s => ({ id: s.id, name: s.name, inviteCode: s.invite_code, partner: s.partner, isAdmin: Boolean(s.is_admin), termsAccepted: Boolean(s.terms_accepted) });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const db = new Db(env);

    try {
      if (url.pathname === '/api/config') return json(200, { accounts: db.enabled });

      if (url.pathname === '/api/guest/terms' && request.method === 'POST') {
        if (!sameOrigin(request, url)) return json(403, { error: 'Not allowed' });
        if (await tooMany(env.ROOM_LOOKUP_LIMIT, `terms:${clientIp(request)}`)) return slowDown();
        const { id, version } = await readBody(request);
        if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) return json(400, { error: 'Invalid guest identity' });
        if (version != null && version !== TERMS_VERSION) return json(400, { error: 'Please review the current terms.' });
        return json(200, await safetyCall(env, 'terms', { id, accept: version }));
      }
      // ---- Guest rooms ----
      if (url.pathname === '/api/rooms' && request.method === 'POST') {
        if (await tooMany(env.ROOM_LIMIT, `rooms:${clientIp(request)}`)) return slowDown();
        for (let attempt = 0; attempt < 5; attempt++) {
          const code = randomCode(4);
          const res = await roomStub(env, code).fetch('https://room/create', { method: 'POST', body: JSON.stringify({ code }) });
          if (res.ok) {
            ctx.waitUntil(statsStub(env).fetch('https://stats/room-created', { method: 'POST' }).catch(() => {}));
            return json(200, { code });
          }
        }
        return json(500, { error: 'Could not create a room, please try again' });
      }
      const m = url.pathname.match(/^\/api\/rooms\/([A-Z]{4})(\/ws)?$/);
      if (m) {
        if (await tooMany(env.ROOM_LOOKUP_LIMIT, `room:${clientIp(request)}`)) return slowDown();
        const stub = roomStub(env, m[1]);
        if (!m[2]) return stub.fetch('https://room/exists');
        const id = url.searchParams.get('id') || crypto.randomUUID();
        if (!/^[A-Za-z0-9_-]{8,64}$/.test(id) || Object.hasOwn(Object.prototype, id)) return json(400, { error: 'Invalid guest identity. Refresh and try again.' });
        const name = (url.searchParams.get('name') || 'Partner').slice(0, 24);
        return stub.fetch(withPlayer(request, { id, name }));
      }

      // ---- Accounts ----
      if (url.pathname.startsWith('/api/')) {
        if (!db.enabled) return json(503, { error: 'Accounts are not set up on this server' });
        return await accountApi(request, url, db, env);
      }

      return env.ASSETS.fetch(request);
    } catch (err) {
      if (!(err instanceof DbError) || err.status >= 500) console.error(err);
      return json(err.status || 500, { error: err instanceof DbError ? err.message : 'Something went wrong, please try again' });
    }
  },
};

const roomStub = (env, name) => env.ROOMS.get(env.ROOMS.idFromName(name));
// Live numbers live in one extra object of the same class, under a name no room can have.
const STATS = '__stats';
const statsStub = env => roomStub(env, STATS);
const safetyStub = env => roomStub(env, SAFETY);
async function safetyCall(env, path, body = {}) {
  const res = await safetyStub(env).fetch('https://safety/' + path, { method: 'POST', body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new DbError(data.error || 'Could not save. Please try again.', res.status);
  return data;
}

// Passes who the player is to the room via headers the browser can't set on its own
// (the Worker overwrites them on every request).
function withPlayer(request, { id, name, token = '', couple = '', partnerName = '' }) {
  const headers = new Headers(request.headers);
  headers.set('x-player-id', id);
  headers.set('x-player-name', encodeURIComponent(name));
  headers.set('x-partner-name', encodeURIComponent(partnerName));
  headers.set('x-player-token', token);
  headers.set('x-couple-id', couple);
  return new Request(request.url, { method: request.method, headers });
}

async function accountApi(request, url, db, env) {
  if (url.pathname === '/api/signup' && request.method === 'POST') {
    const { email, password, name, termsVersion } = await readBody(request);
    if (await tooMany(env.AUTH_LIMIT, `signup:${clientIp(request)}`)) return slowDown();
    const token = await db.rpc('sign_up_with_terms', { p_email: String(email || ''), p_password: String(password || ''), p_name: String(name || ''), p_version: String(termsVersion || '') });
    return withCookie(json(200, { token, me: publicMe(await db.me(token)) }), url, token);
  }
  if (url.pathname === '/api/login' && request.method === 'POST') {
    const { email, password } = await readBody(request);
    if (await tooMany(env.AUTH_LIMIT, `login:${clientIp(request)}`, `login:${String(email || '').trim().toLowerCase()}`)) return slowDown();
    const token = await db.rpc('log_in', { p_email: String(email || ''), p_password: String(password || '') });
    return withCookie(json(200, { token, me: publicMe(await db.me(token)) }), url, token);
  }

  // Logging out may use it too, so a page that lost its saved token still ends the session.
  const readsWithCookie = ((request.method === 'GET' && (url.pathname === '/api/me' || url.pathname === '/api/history' || url.pathname === '/api/couple/ws')) ||
    (request.method === 'POST' && url.pathname === '/api/logout')) && sameOrigin(request, url);
  const fromCookie = !tokenOf(request, url) && readsWithCookie ? cookieToken(request) : null;
  const token = tokenOf(request, url) || fromCookie;
  if (url.pathname === '/api/logout' && request.method === 'POST') {
    const current = token ? await db.me(token) : null;
    if (token) await db.rpc('log_out', { p_token: token });
    if (current?.couple_id) await roomStub(env, `couple:${current.couple_id}`).fetch('https://room/admin/revoke', {
      method: 'POST', body: JSON.stringify({ token, reason: 'You signed out. Please log in again.' }),
    });
    return withCookie(json(200, { ok: true }), url, null);
  }

  const state = await db.me(token);
  if (!state) return fromCookie ? withCookie(json(401, { error: 'Please log in again' }), url, null) : json(401, { error: 'Please log in again' });

  if (url.pathname === '/api/terms' && request.method === 'POST') {
    await db.rpc('accept_terms', { p_token: token, p_version: String((await readBody(request)).version || '') });
    return json(200, { ok: true });
  }
  if (url.pathname === '/api/me' && request.method === 'GET') {
    // Hands the token back when the page lost it, and (re)sets the cookie, including
    // for people who signed in before it existed.
    const res = json(200, { ...publicMe(state), ...(fromCookie ? { token } : {}) });
    return withCookie(res, url, token); // renewed on every visit, so it never runs out while in use
  }
  if (url.pathname === '/api/link' && request.method === 'POST') {
    if (!state.terms_accepted) return json(403, { error: 'Accept the Terms of Use before linking.' });
    if ((await db.rpc('safety_state', { p_token: token })).restricted) return json(403, { error: 'Partner interactions are restricted. Contact support to appeal.' });
    if (await tooMany(env.AUTH_LIMIT, `link:${state.id}`)) return slowDown();
    const partner = await db.rpc('link_partner', { p_token: token, p_code: String((await readBody(request)).code || '') });
    return json(200, { partner });
  }
  if (url.pathname === '/api/unlink' && request.method === 'POST') {
    await db.rpc('unlink_partner', { p_token: token });
    // Their shared room stays saved (for if they link again), but nobody may stay in it.
    if (state.couple_id) await roomStub(env, `couple:${state.couple_id}`)
      .fetch('https://room/admin/kick', { method: 'POST', body: JSON.stringify({ all: true, reason: "You're no longer linked" }) });
    return json(200, { ok: true });
  }
  if (url.pathname === '/api/account/delete' && request.method === 'POST') {
    // Require an explicit bearer token and password. Cookies alone cannot
    // authorize a destructive request from another site.
    if (!request.headers.get('Authorization')?.startsWith('Bearer '))
      return json(401, { error: 'Please log in again' });
    if (await tooMany(env.AUTH_LIMIT, `delete:${state.id}`)) return slowDown();
    const { password } = await readBody(request);
    if (typeof password !== 'string' || !password) return json(400, { error: 'Enter your password to delete your account' });
    // A room with no saved answers might only exist in Durable Objects. Include
    // currently active rooms as well as the historical IDs returned by the DB.
    let active = [];
    try {
      active = (await statsStub(env).fetch('https://stats/rooms').then(r => r.json()))
        .filter(r => r.couple && r.room?.slice(7).split(':').includes(state.id))
        .map(r => r.room.slice(7));
    } catch (error) { console.error('Could not list active rooms during account deletion', error); }
    const saved = await db.rpc('delete_own_account', { p_token: token, p_password: password });
    for (const couple of new Set([...saved, ...active])) {
      const room = `couple:${couple}`;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await roomStub(env, room).fetch('https://room/admin/close', {
            method: 'POST', body: JSON.stringify({ reason: 'This account was deleted', discard: true }),
          });
          if (response.ok) break;
          if (attempt === 2) console.error('Could not clear deleted account room', room, response.status);
        } catch (error) {
          if (attempt === 2) console.error('Could not clear deleted account room', room, error);
        }
      }
    }
    return withCookie(json(200, { ok: true }), url, null);
  }
  if (url.pathname.startsWith('/api/admin/')) return adminApi(request, url, db, env, token, state);
  if (url.pathname === '/api/history' && request.method === 'GET') {
    if (!state.couple_id) return json(200, { linked: false, decks: [], used: 0, total: 0, remaining: 0 });
    const response = await roomStub(env, `couple:${state.couple_id}`).fetch(withPlayer(request, { id: state.id, name: state.name, token, couple: state.couple_id }));
    const headers = new Headers(response.headers); headers.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, headers });
  }
  if (url.pathname === '/api/couple/ws') {
    if (!state.couple_id) return json(409, { error: 'Link with your partner first' });
    return roomStub(env, `couple:${state.couple_id}`)
      .fetch(withPlayer(request, { id: state.id, name: state.name, token, couple: state.couple_id, partnerName: state.partner?.name || '' }));
  }
  return json(404, { error: 'Not found' });
}

// ---- Admin dashboard ----
// The database checks that the token belongs to an admin on every call.
async function adminApi(request, url, db, env, token, state) {
  const path = url.pathname.slice('/api/admin/'.length);
  // Database calls check admin themselves; rooms live outside the database, so check here too.
  if (!state.is_admin) return json(403, { error: 'Admins only' });
  const closeRoom = (name, body = {}) => roomStub(env, name).fetch('https://room/admin/close', { method: 'POST', body: JSON.stringify(body) });
  // A couple's room holds a working copy of their answers; after changing saved
  // data, drop that copy so it's rebuilt from the database (players reconnect on their own).
  const refreshCouple = couple => couple && closeRoom(`couple:${couple}`, { code: 1012, reason: 'Refreshing', discard: true });
  if (path === 'reports' && request.method === 'GET') {
    const page = await safetyCall(env, 'reports', { offset: Number(url.searchParams.get('offset') || 0) });
    return json(200, { ...page, reports: page.reports.map(({ room, roomInstance, reporter, target, ...report }) => report) });
  }
  if (path === 'review-report' && request.method === 'POST') {
    const { id, action, note } = await readBody(request);
    if (!['resolve', 'dismiss', 'close-room', 'restrict-user', 'restore-user'].includes(action) || typeof note !== 'string' || !note.trim() || note.length > 1000) return json(400, { error: 'Choose an action and enter a review note (up to 1000 characters).' });
    const report = await safetyCall(env, 'review', { id: String(id || '') });
    if (action === 'close-room') {
      if (report.couple) return json(400, { error: 'Use account restriction for an account report.' });
      if (!report.roomInstance) return json(409, { error: 'This older report cannot safely identify its room. Record a decision instead.' });
      const result = await closeRoom(report.room, { reason: 'This room was closed for safety.', expectedInstance: report.roomInstance });
      if (!result.ok) return json(409, { error: 'That room has changed since the report. Record a decision instead.' });
    }
    if (['restrict-user', 'restore-user'].includes(action)) {
      if (!report.couple || !report.target) return json(400, { error: 'This report has no account to restrict.' });
      await db.rpc('admin_restrict_user', { p_token: token, p_user: report.target, p_on: action === 'restrict-user' });
      if (action === 'restrict-user') await roomStub(env, report.room).fetch('https://room/admin/kick', { method: 'POST', body: JSON.stringify({ all: true, reason: 'Partner interactions were restricted. Contact support to appeal.' }) });
    }
    return json(200, await safetyCall(env, 'review', { id: report.id, status: action === 'dismiss' ? 'dismissed' : 'resolved', event: { action, note: note.trim(), admin: state.id } }));
  }
  if (path === 'stats' && request.method === 'GET') {
    const [stats, live, play] = await Promise.all([
      db.rpc('admin_stats', { p_token: token }),
      statsStub(env).fetch('https://stats/live').then(r => r.json()),
      statsStub(env).fetch('https://stats/play').then(r => r.json()),
    ]);
    return json(200, { ...stats, live, play });
  }
  if (path === 'decks' && request.method === 'GET') return json(200, deckSummary());
  if (path === 'users' && request.method === 'GET') {
    const users = await db.rpc('admin_users', { p_token: token, p_search: url.searchParams.get('q') || '' });
    return json(200, users.map(({ invite_code, ...visible }) => visible));
  }
  if (path === 'couples' && request.method === 'GET') return json(200, await db.rpc('admin_couples', { p_token: token }));
  if (path === 'action' && request.method === 'POST') {
    const body = await readBody(request);
    const { action, user, on } = body;
    const fn = { signout: 'admin_sign_out', unlink: 'admin_unlink', delete: 'admin_delete_user', admin: 'admin_set_admin' }[action];
    if (!fn) return json(400, { error: 'Unknown action' });
    const args = { p_token: token, p_user: String(user || '') };
    if (action === 'admin') args.p_on = Boolean(on);
    const affected = ['signout', 'delete', 'unlink'].includes(action)
      ? (await statsStub(env).fetch('https://stats/rooms').then(r => r.json()))
        .filter(r => r.couple && r.room.slice(7).split(':').includes(String(user))) : [];
    await db.rpc(fn, args);
    for (const r of affected) {
      if (action === 'delete') await closeRoom(r.room, { discard: true });
      else await roomStub(env, r.room).fetch('https://room/admin/revoke', { method: 'POST', body: JSON.stringify({
        ...(action === 'unlink' ? { all: true } : { user: String(user) }), reason: action === 'unlink' ? "You're no longer linked." : 'Please log in again.',
      }) });
    }
    return json(200, { ok: true });
  }
  if (path === 'rooms' && request.method === 'GET') {
    const rooms = await statsStub(env).fetch('https://stats/rooms').then(r => r.json());
    return json(200, rooms.map(({ room, coupleId, ...visible }) => visible));
  }
  if (path === 'room' && request.method === 'POST') {
    const { action, handle, player } = await readBody(request);
    if (typeof handle !== 'string' || !handle) return json(400, { error: 'Which room?' });
    const rooms = await statsStub(env).fetch('https://stats/rooms').then(r => r.json());
    const room = rooms.find(r => r.handle === handle)?.room;
    if (!room) return json(404, { error: 'Room not found' });
    if (action === 'close') await closeRoom(room, { reason: 'This room was closed' });
    else if (action === 'kick') await roomStub(env, room).fetch('https://room/admin/kick', { method: 'POST', body: JSON.stringify({ player: String(player || '') }) });
    else return json(400, { error: 'Unknown action' });
    return json(200, { ok: true });
  }
  if (path === 'clear-guest-rooms' && request.method === 'POST') {
    const rooms = await statsStub(env).fetch('https://stats/rooms').then(r => r.json());
    const guests = rooms.filter(r => !r.couple);
    await Promise.all(guests.map(r => closeRoom(r.room, { reason: 'This room was closed' })));
    return json(200, { closed: guests.length });
  }
  if (path === 'delete-data' && request.method === 'POST') {
    const { couple, card, user } = await readBody(request);
    if (card != null || user != null) return json(400, { error: 'Only couple data deletion is available' });
    await db.rpc('admin_delete_couple_data', { p_token: token, p_couple_id: String(couple || '') });
    await refreshCouple(String(couple || ''));
    return json(200, { ok: true });
  }
  return json(404, { error: 'Not found' });
}

// ---- Live numbers ----
// The stats object keeps a small record of every room that exists (who's in it,
// what card they're on, when it was last used) and how many guest rooms are
// started each day. Rooms report to it as people come, go and play.
async function statsFetch(ctx, request) {
  const url = new URL(request.url);
  const today = () => new Date().toISOString().slice(0, 10);
  if (url.pathname === '/report') {
    const { played, ...r } = await request.json();
    const key = `room:${r.room}`;
    const old = (await ctx.storage.get(key)) || { createdAt: Date.now() };
    await ctx.storage.put(key, { ...old, ...r, handle: old.handle || crypto.randomUUID(), at: Date.now() });
    if (played) await countPlay(ctx, today(), played);
    return json(200, { ok: true });
  }
  if (url.pathname === '/play') {
    // The last 30 days of play, guest rooms included (the database only sees couples).
    const days = Array.from({ length: 30 }, (_, i) => new Date(Date.now() - (29 - i) * 86400e3).toISOString().slice(0, 10));
    const saved = await ctx.storage.list({ prefix: 'play:' });
    const byDay = new Map([...saved].map(([k, v]) => [k.slice(5), v]));
    const byDeck = {}, total = { guestCards: 0, coupleCards: 0, talk: 0, answer: 0 };
    for (const d of days) {
      const p = byDay.get(d);
      if (!p) continue;
      for (const [deck, n] of Object.entries(p.decks || {})) byDeck[deck] = (byDeck[deck] || 0) + n;
      for (const k of Object.keys(total)) total[k] += p[k] || 0;
    }
    const old = new Date(Date.now() - 90 * 86400e3).toISOString().slice(0, 10);
    for (const d of byDay.keys()) if (d < old) await ctx.storage.delete(`play:${d}`);
    return json(200, {
      since: [...byDay.keys()].sort()[0] || null, days,
      cards: days.map(d => byDay.get(d)?.cards || 0),
      answers: days.map(d => byDay.get(d)?.answers || 0),
      byDeck, ...total,
    });
  }
  if (url.pathname === '/gone') {
    await ctx.storage.delete(`room:${(await request.json()).room}`);
    return json(200, { ok: true });
  }
  if (url.pathname === '/room-created') {
    const key = `created:${today()}`;
    await ctx.storage.put(key, ((await ctx.storage.get(key)) || 0) + 1);
    return json(200, { ok: true });
  }
  if (url.pathname === '/rooms' || url.pathname === '/live') {
    // A record older than the longest room lifetime is a room that was never reported gone.
    const stale = Date.now() - COUPLE_ROOM_TTL - 86400e3;
    const rooms = [];
    for (const [key, r] of await ctx.storage.list({ prefix: 'room:' })) {
      if (r.at < stale) { await ctx.storage.delete(key); continue; }
      if (!r.handle) { r.handle = crypto.randomUUID(); await ctx.storage.put(key, r); }
      rooms.push(r);
    }
    if (url.pathname === '/rooms') return json(200, rooms.sort((a, b) => b.at - a.at));
    const open = rooms.filter(r => r.players > 0);
    const week = new Date(Date.now() - 6 * 86400e3).toISOString().slice(0, 10);
    const old = new Date(Date.now() - 60 * 86400e3).toISOString().slice(0, 10);
    let guestToday = 0, guestWeek = 0;
    for (const [key, n] of await ctx.storage.list({ prefix: 'created:' })) {
      const day = key.slice(8);
      if (day === today()) guestToday += n;
      if (day >= week) guestWeek += n;
      if (day < old) await ctx.storage.delete(key);
    }
    return json(200, {
      rooms: open.length, coupleRooms: open.filter(r => r.couple).length, guestRooms: open.filter(r => !r.couple).length,
      people: open.reduce((n, r) => n + r.players, 0), guestRoomsToday: guestToday, guestRooms7d: guestWeek,
    });
  }
  return json(404, { error: 'Not found' });
}

// Daily play counters: cards dealt (by deck, mode and room type) and answers written.
async function countPlay(ctx, day, { deck, mode, couple, answered }) {
  const key = `play:${day}`;
  const p = (await ctx.storage.get(key)) || { cards: 0, answers: 0, guestCards: 0, coupleCards: 0, talk: 0, answer: 0, decks: {} };
  if (answered) p.answers++;
  if (deck) {
    p.cards++;
    p[couple ? 'coupleCards' : 'guestCards']++;
    p[mode === 'answer' ? 'answer' : 'talk']++;
    p.decks[deck] = (p.decks[deck] || 0) + 1;
  }
  await ctx.storage.put(key, p);
}

// ---- One room ----

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.db = new Db(env);
    this.room = null;
    this.store = new RoomStorage(ctx.storage);
    this.serial = Promise.resolve();
    this.flushing = null;
    // Room state survives the object going to sleep between taps.
    ctx.blockConcurrencyWhile(async () => {
      this.room = upgradeRoom(await this.store.load());
      if (this.room && (this.room.storageVersion !== 2 || !this.room.safetyInstance)) await this.save();
    });
  }

  run(task) {
    const result = this.serial.then(task);
    this.serial = result.catch(() => {});
    return result;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (this.ctx.id.equals(this.env.ROOMS.idFromName(STATS))) return statsFetch(this.ctx, request);
    if (this.ctx.id.equals(this.env.ROOMS.idFromName(SAFETY))) return this.run(() => safetyFetch(this.ctx, request));
    return this.run(() => this.fetchRoom(request));
  }

  async fetchRoom(request) {
    const url = new URL(request.url);

    if (url.pathname === '/create') {
      if (this.room) return json(409, { error: 'Code taken' });
      const { code } = await request.json();
      this.room = newRoom(code);
      await this.save();
      this.reportPresence();
      return json(200, { code });
    }
    if (url.pathname === '/exists') {
      return this.room && !this.room.safetyClosed ? json(200, { code: this.room.code, partners: this.players().size }) : json(404, { error: 'Room not found' });
    }
    // Admin actions (only the Worker's admin routes call these).
    if (url.pathname === '/admin/close') {
      // Ordinary couple-room closure keeps accepted saves, including the outbox.
      // Only explicit data/account deletion discards that durable working copy.
      const { reason = 'This room was closed', code = 4001, discard = false, expectedInstance } = await request.json();
      if (expectedInstance && this.room && this.room.safetyInstance !== expectedInstance) return json(409, { error: 'Room changed' });
      const name = this.room?.code;
      for (const ws of this.ctx.getWebSockets()) { try { ws.close(code, reason); } catch {} }
      if (discard || !this.room?.coupleId) {
        this.room = null;
        await this.ctx.storage.deleteAll();
        this.store = new RoomStorage(this.ctx.storage);
      }
      if (name) await this.statsGone(name);
      return json(200, { ok: true });
    }
    if (url.pathname === '/admin/kick' || url.pathname === '/admin/revoke') {
      const { player, user, token, all, reason = 'You were removed from this room' } = await request.json();
      for (const ws of this.ctx.getWebSockets()) {
        const p = ws.deserializeAttachment();
        if (all || p.id === (player || user) || (token && p.token === token)) { try { ws.close(4001, reason); } catch {} }
      }
      await this.broadcast();
      this.reportPresence();
      return json(200, { ok: true });
    }

    // Anything else is a player connecting.
    const history = url.pathname === '/api/history' && request.method === 'GET';
    if (!history && request.headers.get('Upgrade') !== 'websocket') return json(426, { error: 'Expected a WebSocket' });
    const player = {
      id: request.headers.get('x-player-id'),
      name: decodeURIComponent(request.headers.get('x-player-name') || 'Partner'),
      token: request.headers.get('x-player-token') || '',
    };
    const coupleId = request.headers.get('x-couple-id') || '';
    if (coupleId) {
      const state = await this.db.me(player.token);
      if (!state || state.id !== player.id || state.couple_id !== coupleId) return json(401, { error: 'Your session or partner link changed. Please sign in again.' });
    }

    const safety = coupleId ? await this.db.rpc('safety_state', { p_token: player.token }) : await safetyCall(this.env, 'terms', { id: player.id });
    if (safety.restricted) return json(403, { error: 'Partner interactions are restricted. Contact support to appeal.' });
    if (!history && !safety.accepted) return json(403, { error: 'Accept the Terms of Use before joining a room.' });
    player.termsAccepted = safety.accepted;

    if (coupleId && !this.room) {
      // A couple's room is created on first use from what they saved before. It is only
      // kept once that load worked, so a database hiccup can't leave (and later save) a
      // room that has lost their answers and favorites.
      const room = newRoom(`couple:${coupleId}`, coupleId);
      const saved = await this.db.rpc('couple_data', { p_token: player.token });
      if (saved.couple_id !== coupleId) return json(409, { error: 'Your partner link changed. Please reopen your room.' });
      room.generation = saved.generation || 0;
      for (const a of saved.answers) room.answers[a.card_key] = { ...room.answers[a.card_key], [a.user_id]: a.text };
      room.favorites = saved.favorites;
      if (!this.room) { this.room = room; await this.save(); }
    }
    if (!this.room) return json(404, { error: 'Room not found' });
    if (history) {
      if (!coupleId || this.room.coupleId !== coupleId) return json(403, { error: 'Account history only' });
      const decks = cardUsage(this.room);
      const total = decks.reduce((sum, deck) => sum + deck.count, 0);
      const used = decks.reduce((sum, deck) => sum + deck.used, 0);
      return json(200, { linked: true, decks, total, used, remaining: total - used });
    }

    if (!coupleId) {
      if (this.room.safetyClosed) return json(403, { error: 'This room was ended for safety. Start a new room.' });
      for (const other of Object.keys(this.room.names || {})) {
        if (other !== player.id && (await safetyCall(this.env, 'blocked', { a: player.id, b: other })).blocked) return json(403, { error: 'These guests cannot share a room.' });
      }
    }

    // The same person reconnecting (a reload or a second device) takes over their seat.
    const existing = this.ctx.getWebSockets(player.id);
    if (!existing.length && this.players().size >= 2) return json(409, { error: 'Room is full' });
    for (const ws of existing) ws.close(4000, 'Opened somewhere else');

    // Names are remembered so answers can still be shown with a name while someone is away.
    // A couple's id is made of both partners' ids, so the partner's id is the other half.
    if (!coupleId) {
      this.room.guestPartners ||= {};
      for (const other of this.players().keys()) if (other !== player.id) { this.room.guestPartners[player.id] = other; this.room.guestPartners[other] = player.id; }
    }
    const names = { [player.id]: player.name };
    const partnerName = decodeURIComponent(request.headers.get('x-partner-name') || '');
    const partnerId = coupleId && coupleId.split(':').find(id => id !== player.id);
    if (partnerId && partnerName) names[partnerId] = partnerName;
    if (Object.entries(names).some(([id, n]) => this.room.names?.[id] !== n)) {
      this.room.names = { ...this.room.names, ...names };
      await this.save();
    }

    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, [player.id]);
    server.serializeAttachment(player);
    if (this.markActivity(player)) {
      await this.save();
      this.recordActivity(player);
    }
    await this.broadcast();
    this.ctx.waitUntil(this.flushOutbox());
    this.reportPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    return this.run(() => this.handleMessage(ws, message));
  }

  async handleMessage(ws, message) {
    if (!this.room) return; // closed a moment ago
    const player = ws.deserializeAttachment();
    if (typeof message !== 'string' || new TextEncoder().encode(message).length > 8192) return ws.close(1009, 'Message too large');
    const now = Date.now();
    if (!player.rate || now - player.rate.since > 10000) player.rate = { since: now, count: 0 };
    if (++player.rate.count > 80) return ws.close(4001, 'Too many actions. Please reopen the room.');
    ws.serializeAttachment(player);
    let action;
    try { action = JSON.parse(message); } catch { return; }
    if (!action || typeof action !== 'object' || Array.isArray(action)) return;
    if (!(await this.authorized(ws))) return;
    if (['acceptTerms', 'reportUser', 'blockUser'].includes(action.type)) return this.handleSafety(ws, player, action);
    const changesContent = ['answer', 'favorite'].includes(action.type);
    const ack = (ok, error) => ({ type: 'ack', id: action.id, ok, ...(error ? { error } : {}), cardKey: action.cardKey });
    const sendAck = value => { try { ws.send(JSON.stringify(value)); } catch {} };
    if (action.type === 'answer' && !player.termsAccepted) { sendAck(ack(false, 'Accept the Terms of Use before submitting answers.')); return; }
    let receiptKey;
    if (changesContent) {
      if (typeof action.id !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(action.id) || typeof action.cardKey !== 'string' || !Number.isSafeInteger(action.generation) || action.generation < 0) {
        return ws.close(4001, 'Please update the Closer app or refresh this page before saving answers.');
      }
      if (action.generation !== (this.room.generation || 0)) {
        sendAck(ack(false, 'Saved data changed. Your draft is kept; review it before sending again.'));
        return;
      }
      receiptKey = `receipt:${player.id}:${action.id}`;
      const received = await this.ctx.storage.get(receiptKey);
      if (received) { sendAck(received); await this.broadcast(); return; }
      if (action.cardKey !== cardKey(this.room.order[this.room.index])) {
        sendAck(ack(false, 'The card changed. Your draft is kept; return to that question to send it.'));
        return;
      }
    }
    const previous = structuredClone(this.room);
    const before = cardKey(this.room.order[this.room.index]);
    const result = applyAction(this.room, player.id, true, action);
    if (!result) { if (changesContent) sendAck(ack(false, 'That answer could not be accepted. Your draft is kept.')); return; }
    const recordActivity = this.markActivity(player);
    const extras = {};
    if (changesContent) {
      extras[receiptKey] = ack(true);
      if (this.room.coupleId) {
        this.room.sequence = (this.room.sequence || 0) + 1;
        const key = `pending:${String(this.room.sequence).padStart(16, '0')}:${player.id}:${action.id}`;
        extras[key] = { p_couple_id: this.room.coupleId, p_generation: this.room.generation || 0, p_id: action.id,
          p_user: player.id, p_kind: result.answer ? 'answer' : 'favorite', p_card_key: action.cardKey,
          p_question: (result.answer || result.favorite).question, p_text: result.answer?.text ?? null, p_on: result.favorite?.on ?? null };
      }
    }
    try { await this.save(extras); }
    catch (err) {
      this.room = previous;
      console.error('Room storage failed:', err.message);
      if (changesContent) sendAck(ack(false, 'Could not save. Your draft is kept; please try again.'));
      await this.broadcast();
      return;
    }
    if (changesContent) sendAck(ack(true));
    await this.broadcast();
    // A new card dealt (going back doesn't count), or an answer written, is counted as play.
    const card = this.room.order[this.room.index];
    const dealt = action.type !== 'prev' && cardKey(card) !== before;
    const answered = Boolean(result.answer);
    this.reportPresence(dealt || answered
      ? { deck: dealt ? card.c : null, mode: this.room.mode, couple: Boolean(this.room.coupleId), answered } : null);
    if (this.room.coupleId) {
      if (recordActivity) this.recordActivity(player);
      this.ctx.waitUntil(this.flushOutbox());
    }
  }

  safetyPartner(id) {
    return this.room.coupleId ? this.room.coupleId.split(':').find(other => other !== id) : [...this.players().keys()].find(other => other !== id) || this.room.guestPartners?.[id] || (Object.keys(this.room.names || {}).length === 2 ? Object.keys(this.room.names).find(other => other !== id) : null);
  }

  async handleSafety(ws, player, action) {
    const reply = value => { try { ws.send(JSON.stringify({ type: 'safetyResult', id: action.id, ...value })); } catch {} };
    if (typeof action.id !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(action.id)) return;
    try {
      if (action.type === 'acceptTerms') {
        if (action.version !== TERMS_VERSION) throw new DbError('Please review the current terms.', 400);
        if (this.room.coupleId) await this.db.rpc('accept_terms', { p_token: player.token, p_version: TERMS_VERSION });
        else await safetyCall(this.env, 'terms', { id: player.id, accept: TERMS_VERSION });
        for (const socket of this.ctx.getWebSockets(player.id)) {
          const attachment = socket.deserializeAttachment(); attachment.termsAccepted = true; socket.serializeAttachment(attachment);
        }
        reply({ ok: true }); await this.broadcast(); return;
      }
      const target = this.safetyPartner(player.id);
      if (target && action.partnerHandle !== await safetyHandle(this.room.code + ':' + target)) throw new DbError('Your partner changed. Review this action again.', 400);
      if (!target) throw new DbError('There is no partner to report or block yet.', 400);
      if (action.type === 'reportUser') {
        if (!REASONS.includes(action.reason) || typeof action.details !== 'string' || action.details.length > 1000) throw new DbError('Choose a reason and keep details under 1000 characters.', 400);
        // Only a currently revealed partner answer can be attached, with explicit consent.
        let excerpt = null;
        if (action.includeAnswer === true) {
          const view = publicState(this.room, this.players(), player.id);
          if (action.cardKey !== view.card.id || !view.revealed?.some(a => !a.mine)) throw new DbError('The answer changed or is not revealed. Review your report again.', 400);
          excerpt = this.room.answers[view.card.id]?.[target];
          if (typeof excerpt !== 'string' || action.answerText !== excerpt) throw new DbError('The selected answer changed. Review the report again.', 400);
        }
        const result = await safetyCall(this.env, 'report', { reporter: player.id, requestId: action.id, target, reporterName: player.name, targetName: this.room.names?.[target] || 'Partner', room: this.room.code, roomInstance: this.room.safetyInstance, couple: Boolean(this.room.coupleId), reason: action.reason, details: action.details.trim(), excerpt, cardKey: excerpt ? action.cardKey : null });
        reply({ ok: true, reportId: result.id }); return;
      }
      if (this.room.coupleId) await this.db.rpc('block_partner', { p_token: player.token });
      else {
        await safetyCall(this.env, 'block', { a: player.id, b: target });
        this.room.safetyClosed = true; await this.save();
      }
      reply({ ok: true });
      for (const socket of this.ctx.getWebSockets()) { try { socket.close(4001, 'This connection ended. You can start again with a different partner.'); } catch {} }
      await this.broadcast(); this.reportPresence();
    } catch (error) { reply({ ok: false, error: error instanceof DbError ? error.message : 'Could not save. Please try again.' }); }
  }

  webSocketClose(ws) {
    try { ws.close(); } catch {} // already closed
    return this.run(async () => { await this.broadcast(); this.reportPresence(); });
  }

  webSocketError() {
    return this.run(async () => { await this.broadcast(); this.reportPresence(); });
  }

  // Tells the stats object who's here and what they're doing, for the admin dashboard.
  reportPresence(played = null) {
    if (!this.room) return;
    const players = [...this.players()].map(([id, name]) => ({ id, name }));
    const body = JSON.stringify({
      room: this.room.code, couple: Boolean(this.room.coupleId), coupleId: this.room.coupleId || null,
      players: players.length, people: players, mode: this.room.mode, category: this.room.category,
      card: this.room.index + 1, total: this.room.order.length, answered: Object.keys(this.room.answers).length,
      deck: this.room.order[this.room.index]?.c || null, played,
    });
    this.ctx.waitUntil(statsStub(this.env).fetch('https://stats/report', { method: 'POST', body }).catch(() => {}));
  }

  statsGone(room) {
    return statsStub(this.env).fetch('https://stats/gone', { method: 'POST', body: JSON.stringify({ room }) }).catch(() => {});
  }

  // Only open sockets count: a closing socket may still be listed briefly.
  sockets() {
    return this.ctx.getWebSockets().filter(ws => ws.readyState === WebSocket.OPEN);
  }

  players() {
    const players = new Map();
    for (const ws of this.sockets()) {
      const p = ws.deserializeAttachment();
      players.set(p.id, p.name);
    }
    return players;
  }

  async authorized(ws) {
    if (!this.room) return false;
    if (!this.room.coupleId) return !this.room.safetyClosed && ws.readyState === WebSocket.OPEN;
    const p = ws.deserializeAttachment();
    try {
      const state = await this.db.me(p.token);
      if (state?.id === p.id && state.couple_id === this.room.coupleId && !(await this.db.rpc('safety_state', { p_token: p.token })).restricted) return ws.readyState === WebSocket.OPEN;
      ws.close(4001, 'Your session or partner link changed. Please sign in again.');
    } catch {
      // Reconnect retries unacknowledged commands after transient auth outages.
      // Keeping this socket open would leave a pending answer waiting forever.
      try { ws.close(1012, 'Connection interrupted. Reconnecting…'); } catch {}
    }
    return false;
  }

  async broadcast() {
    if (!this.room) return;
    const allowed = [];
    for (const ws of this.sockets()) if (await this.authorized(ws)) allowed.push(ws);
    const players = this.players();
    for (const ws of allowed) {
      const { id } = ws.deserializeAttachment();
      try { ws.send(JSON.stringify({ ...publicState(this.room, players, id), termsAccepted: Boolean(ws.deserializeAttachment().termsAccepted), termsVersion: TERMS_VERSION, canReportPartner: Boolean(this.safetyPartner(id)), reportablePartnerAnswer: Object.hasOwn(this.room.answers[cardKey(this.room.order[this.room.index])] || {}, id) ? this.room.answers[cardKey(this.room.order[this.room.index])]?.[this.safetyPartner(id)] ?? null : null, partnerSafetyHandle: this.safetyPartner(id) ? await safetyHandle(this.room.code + ':' + this.safetyPartner(id)) : null })); } catch {}
    }
  }

  async save(extras = {}) {
    this.room.safetyInstance ||= crypto.randomUUID();
    this.room.lastActiveAt = Date.now();
    const pending = await this.ctx.storage.list({ prefix: 'pending:', limit: 1 });
    const queued = pending.size || Object.keys(extras).some(key => key.startsWith('pending:'));
    // Schedule first: once the transaction commits, accepted content must have
    // a wake-up scheduled even if this isolate stops immediately afterwards.
    await this.ctx.storage.setAlarm(Date.now() + (queued ? 30000 : this.ttl()));
    await this.store.save(this.room, extras);
  }

  ttl() { return this.room?.coupleId ? COUPLE_ROOM_TTL : GUEST_ROOM_TTL; }

  async alarm() {
    if (this.ctx.id.equals(this.env.ROOMS.idFromName(STATS))) return;
    if (this.ctx.id.equals(this.env.ROOMS.idFromName(SAFETY))) return this.run(() => safetyAlarm(this.ctx));
    await this.flushOutbox();
    return this.run(async () => {
    if (!this.room) return;
    const pending = await this.ctx.storage.list({ prefix: 'pending:', limit: 1 });
    if (pending.size) return this.ctx.storage.setAlarm(Date.now() + 30000);
    // Idle for too long: forget the room, unless someone is still in it.
    if (this.sockets().length) return this.ctx.storage.setAlarm(Date.now() + this.ttl());
    const expires = (this.room.lastActiveAt || Date.now()) + this.ttl();
    if (expires > Date.now()) return this.ctx.storage.setAlarm(expires);
    const name = this.room?.code;
    this.room = null;
    await this.ctx.storage.deleteAll();
    this.store = new RoomStorage(this.ctx.storage);
    if (name) await this.statsGone(name);
    });
  }

  // Signed-in players count as active at most once every 5 minutes (for the admin stats).
  markActivity(player) {
    if (!this.room?.coupleId) return false;
    const activityAt = this.room.activityAt ||= {};
    const now = Date.now();
    if (now - (activityAt[player.id] || 0) < 5 * 60_000) return false;
    activityAt[player.id] = now;
    return true;
  }

  // Saving is best effort: a database hiccup must never break the live game.
  recordActivity(player) {
    if (!this.room?.coupleId) return;
    const call = this.db.rpc('record_activity', { p_token: player.token });
    this.ctx.waitUntil(call.catch(err => console.error('Could not record activity:', err.message)));
  }

  flushOutbox() {
    if (this.flushing) return this.flushing;
    this.flushing = (async () => {
      for (const [key, operation] of await listEntries(this.ctx.storage, 'pending:')) {
        try {
          const result = await this.db.rpc('persist_room_change', operation);
          if (!result?.applied && !['stale_generation', 'deleted_account'].includes(result?.reason)) throw new Error('Save was not accepted');
          await this.ctx.storage.delete(key);
        } catch (err) {
          console.error('Room save pending:', err.message);
          await this.ctx.storage.setAlarm(Date.now() + 30000);
          break; // Preserve order: later writes cannot overtake this one.
        }
      }
    })().finally(() => { this.flushing = null; });
    return this.flushing;
  }
}
