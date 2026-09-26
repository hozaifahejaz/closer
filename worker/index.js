// Closer on Cloudflare Workers.
//
// - The page itself is served from ./public as static assets.
// - Each room (a guest room with a 4-letter code, or a linked couple's private
//   room) is a Durable Object. Both phones hold a WebSocket to it, and every tap
//   is sent over that socket and broadcast back to both.
// - Accounts go through database functions in Supabase (see supabase/schema.sql).
import { DurableObject } from 'cloudflare:workers';
import { randomCode, newRoom, upgradeRoom, publicState, applyAction } from './game.js';
import { Db, DbError } from './db.js';

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
// by same-origin requests that just read (GET /api/me, the room WebSocket);
// everything else still needs the token in the Authorization header.
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

const publicMe = s => ({ id: s.id, name: s.name, inviteCode: s.invite_code, partner: s.partner, isAdmin: Boolean(s.is_admin) });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const db = new Db(env);

    try {
      if (url.pathname === '/api/config') return json(200, { accounts: db.enabled });

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
        const stub = roomStub(env, m[1]);
        if (!m[2]) return stub.fetch('https://room/exists');
        const id = (url.searchParams.get('id') || '').slice(0, 64) || crypto.randomUUID();
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

// Passes who the player is to the room via headers the browser can't set on its own
// (the Worker overwrites them on every request).
function withPlayer(request, { id, name, token = '', couple = '' }) {
  const headers = new Headers(request.headers);
  headers.set('x-player-id', id);
  headers.set('x-player-name', encodeURIComponent(name));
  headers.set('x-player-token', token);
  headers.set('x-couple-id', couple);
  return new Request(request.url, { method: request.method, headers });
}

async function accountApi(request, url, db, env) {
  if (url.pathname === '/api/signup' && request.method === 'POST') {
    const { email, password, name } = await readBody(request);
    if (await tooMany(env.AUTH_LIMIT, `signup:${clientIp(request)}`)) return slowDown();
    const token = await db.rpc('sign_up', { p_email: String(email || ''), p_password: String(password || ''), p_name: String(name || '') });
    return withCookie(json(200, { token, me: publicMe(await db.me(token)) }), url, token);
  }
  if (url.pathname === '/api/login' && request.method === 'POST') {
    const { email, password } = await readBody(request);
    if (await tooMany(env.AUTH_LIMIT, `login:${clientIp(request)}`, `login:${String(email || '').trim().toLowerCase()}`)) return slowDown();
    const token = await db.rpc('log_in', { p_email: String(email || ''), p_password: String(password || '') });
    return withCookie(json(200, { token, me: publicMe(await db.me(token)) }), url, token);
  }

  const readsWithCookie = request.method === 'GET' && (url.pathname === '/api/me' || url.pathname === '/api/couple/ws') && sameOrigin(request, url);
  const fromCookie = !tokenOf(request, url) && readsWithCookie ? cookieToken(request) : null;
  const token = tokenOf(request, url) || fromCookie;
  if (url.pathname === '/api/logout' && request.method === 'POST') {
    if (token) await db.rpc('log_out', { p_token: token });
    return withCookie(json(200, { ok: true }), url, null);
  }

  const state = await db.me(token);
  if (!state) return fromCookie ? withCookie(json(401, { error: 'Please log in again' }), url, null) : json(401, { error: 'Please log in again' });

  if (url.pathname === '/api/me' && request.method === 'GET') {
    // Hands the token back when the page lost it, and (re)sets the cookie, including
    // for people who signed in before it existed.
    const res = json(200, { ...publicMe(state), ...(fromCookie ? { token } : {}) });
    return withCookie(res, url, token); // renewed on every visit, so it never runs out while in use
  }
  if (url.pathname === '/api/link' && request.method === 'POST') {
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
  if (url.pathname.startsWith('/api/admin/')) return adminApi(request, url, db, env, token, state);
  if (url.pathname === '/api/couple/ws') {
    if (!state.couple_id) return json(409, { error: 'Link with your partner first' });
    return roomStub(env, `couple:${state.couple_id}`)
      .fetch(withPlayer(request, { id: state.id, name: state.name, token, couple: state.couple_id }));
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
  const refreshCouple = couple => couple && closeRoom(`couple:${couple}`, { code: 1012, reason: 'Refreshing' });
  if (path === 'stats' && request.method === 'GET') {
    const [stats, live] = await Promise.all([
      db.rpc('admin_stats', { p_token: token }),
      statsStub(env).fetch('https://stats/live').then(r => r.json()),
    ]);
    return json(200, { ...stats, live });
  }
  if (path === 'users' && request.method === 'GET') return json(200, await db.rpc('admin_users', { p_token: token, p_search: url.searchParams.get('q') || '' }));
  if (path === 'couples' && request.method === 'GET') return json(200, await db.rpc('admin_couples', { p_token: token }));
  if (path === 'couple' && request.method === 'GET') return json(200, await db.rpc('admin_couple', { p_token: token, p_couple_id: url.searchParams.get('id') || '' }));
  if (path === 'action' && request.method === 'POST') {
    const body = await readBody(request);
    const { action, user, password, on } = body;
    const fn = { password: 'admin_set_password', signout: 'admin_sign_out', unlink: 'admin_unlink', delete: 'admin_delete_user', admin: 'admin_set_admin' }[action];
    if (!fn) return json(400, { error: 'Unknown action' });
    const args = { p_token: token, p_user: String(user || '') };
    if (action === 'password') args.p_password = String(password || '');
    if (action === 'admin') args.p_on = Boolean(on);
    await db.rpc(fn, args);
    const { couple } = body;
    if (action === 'delete' || action === 'unlink') await refreshCouple(couple);
    return json(200, { ok: true });
  }
  if (path === 'rooms' && request.method === 'GET') return statsStub(env).fetch('https://stats/rooms');
  if (path === 'room' && request.method === 'POST') {
    const { action, room, player } = await readBody(request);
    if (typeof room !== 'string' || !room) return json(400, { error: 'Which room?' });
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
    if (card) await db.rpc('admin_delete_answer', { p_token: token, p_couple_id: String(couple || ''), p_card_key: String(card), p_user: String(user || '') });
    else await db.rpc('admin_delete_couple_data', { p_token: token, p_couple_id: String(couple || '') });
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
    const r = await request.json();
    const key = `room:${r.room}`;
    const old = (await ctx.storage.get(key)) || { createdAt: Date.now() };
    await ctx.storage.put(key, { ...old, ...r, at: Date.now() });
    return json(200, { ok: true });
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

// ---- One room ----

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.db = new Db(env);
    this.room = null;
    // Room state survives the object going to sleep between taps.
    ctx.blockConcurrencyWhile(async () => { this.room = upgradeRoom((await ctx.storage.get('room')) || null); });
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (this.ctx.id.equals(this.env.ROOMS.idFromName(STATS))) return statsFetch(this.ctx, request);

    if (url.pathname === '/create') {
      if (this.room) return json(409, { error: 'Code taken' });
      const { code } = await request.json();
      this.room = newRoom(code);
      await this.save();
      this.reportPresence();
      return json(200, { code });
    }
    if (url.pathname === '/exists') {
      return this.room ? json(200, { code: this.room.code, partners: this.players().size }) : json(404, { error: 'Room not found' });
    }
    // Admin actions (only the Worker's admin routes call these).
    if (url.pathname === '/admin/close') {
      // Closes the room for everyone and forgets it. A couple's room is rebuilt
      // from their saved answers next time, so for them this is a refresh.
      const { reason = 'This room was closed', code = 4001 } = await request.json();
      const name = this.room?.code;
      for (const ws of this.ctx.getWebSockets()) { try { ws.close(code, reason); } catch {} }
      this.room = null;
      await this.ctx.storage.deleteAll();
      if (name) await this.statsGone(name);
      return json(200, { ok: true });
    }
    if (url.pathname === '/admin/kick') {
      const { player, all, reason = 'You were removed from this room' } = await request.json();
      for (const ws of all ? this.ctx.getWebSockets() : this.ctx.getWebSockets(player)) { try { ws.close(4001, reason); } catch {} }
      this.broadcast();
      this.reportPresence();
      return json(200, { ok: true });
    }

    // Anything else is a player connecting.
    if (request.headers.get('Upgrade') !== 'websocket') return json(426, { error: 'Expected a WebSocket' });
    const player = {
      id: request.headers.get('x-player-id'),
      name: decodeURIComponent(request.headers.get('x-player-name') || 'Partner'),
      token: request.headers.get('x-player-token') || '',
    };
    const coupleId = request.headers.get('x-couple-id') || '';

    if (coupleId && !this.room) {
      // A couple's room is created on first use from what they saved before.
      this.room = newRoom(`couple:${coupleId}`, coupleId);
      const saved = await this.db.rpc('couple_data', { p_token: player.token });
      for (const a of saved.answers) this.room.answers[a.card_key] = { ...this.room.answers[a.card_key], [a.user_id]: a.text };
      this.room.favorites = saved.favorites;
      await this.save();
    }
    if (!this.room) return json(404, { error: 'Room not found' });

    // The same person reconnecting (a reload or a second device) takes over their seat.
    const existing = this.ctx.getWebSockets(player.id);
    if (!existing.length && this.players().size >= 2) return json(409, { error: 'Room is full' });
    for (const ws of existing) ws.close(4000, 'Opened somewhere else');

    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, [player.id]);
    server.serializeAttachment(player);
    this.broadcast();
    this.reportPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (!this.room) return; // closed a moment ago
    const player = ws.deserializeAttachment();
    let action;
    try { action = JSON.parse(message); } catch { return; }
    const result = applyAction(this.room, player.id, true, action);
    if (!result) return;
    await this.save();
    this.broadcast();
    this.reportPresence();
    if (this.room.coupleId) this.persist(player.token, result);
  }

  webSocketClose(ws) {
    try { ws.close(); } catch {} // already closed
    this.broadcast();
    this.reportPresence();
  }

  webSocketError() {
    this.broadcast();
    this.reportPresence();
  }

  // Tells the stats object who's here and what they're doing, for the admin dashboard.
  reportPresence() {
    if (!this.room) return;
    const players = [...this.players()].map(([id, name]) => ({ id, name }));
    const body = JSON.stringify({
      room: this.room.code, couple: Boolean(this.room.coupleId), coupleId: this.room.coupleId || null,
      players: players.length, people: players, mode: this.room.mode, category: this.room.category,
      card: this.room.index + 1, total: this.room.order.length, answered: Object.keys(this.room.answers).length,
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

  broadcast() {
    if (!this.room) return;
    const players = this.players();
    for (const ws of this.sockets()) {
      const { id } = ws.deserializeAttachment();
      try { ws.send(JSON.stringify(publicState(this.room, players, id))); } catch {}
    }
  }

  async save() {
    await this.ctx.storage.put('room', this.room);
    await this.ctx.storage.setAlarm(Date.now() + this.ttl());
  }

  ttl() { return this.room?.coupleId ? COUPLE_ROOM_TTL : GUEST_ROOM_TTL; }

  async alarm() {
    // Idle for too long: forget the room, unless someone is still in it.
    if (this.sockets().length) return this.ctx.storage.setAlarm(Date.now() + this.ttl());
    const name = this.room?.code;
    this.room = null;
    await this.ctx.storage.deleteAll();
    if (name) await this.statsGone(name);
  }

  // Saving is best effort: a database hiccup must never break the live game.
  persist(token, { answer, favorite }) {
    let call;
    if (answer) call = this.db.rpc('save_answer', { p_token: token, p_card_key: answer.cardKey, p_question: answer.question, p_text: answer.text });
    if (favorite) call = this.db.rpc('set_favorite', { p_token: token, p_question: favorite.question, p_on: favorite.on });
    if (call) this.ctx.waitUntil(call.catch(err => console.error('Could not save:', err.message)));
  }
}
