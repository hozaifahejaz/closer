// Closer on Cloudflare Workers.
//
// - The page itself is served from ./public as static assets.
// - Each room (a guest room with a 4-letter code, or a linked couple's private
//   room) is a Durable Object. Both phones hold a WebSocket to it, and every tap
//   is sent over that socket and broadcast back to both.
// - Accounts go through database functions in Supabase (see supabase/schema.sql).
import { DurableObject } from 'cloudflare:workers';
import { randomCode, newRoom, publicState, applyAction } from './game.js';
import { Db, DbError } from './db.js';

const GUEST_ROOM_TTL = 6 * 3600e3; // guest rooms are forgotten after 6 idle hours

const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

async function readBody(request) {
  try { return await request.json(); } catch { return {}; }
}

function tokenOf(request, url) {
  const header = request.headers.get('Authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : url.searchParams.get('token');
}

const publicMe = s => ({ id: s.id, name: s.name, inviteCode: s.invite_code, partner: s.partner, isAdmin: Boolean(s.is_admin) });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const db = new Db(env);

    try {
      if (url.pathname === '/api/config') return json(200, { accounts: db.enabled });

      // ---- Guest rooms ----
      if (url.pathname === '/api/rooms' && request.method === 'POST') {
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
const statsStub = env => env.STATS.get(env.STATS.idFromName('stats'));

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
    const token = await db.rpc('sign_up', { p_email: String(email || ''), p_password: String(password || ''), p_name: String(name || '') });
    return json(200, { token, me: publicMe(await db.me(token)) });
  }
  if (url.pathname === '/api/login' && request.method === 'POST') {
    const { email, password } = await readBody(request);
    const token = await db.rpc('log_in', { p_email: String(email || ''), p_password: String(password || '') });
    return json(200, { token, me: publicMe(await db.me(token)) });
  }

  const token = tokenOf(request, url);
  if (url.pathname === '/api/logout' && request.method === 'POST') {
    if (token) await db.rpc('log_out', { p_token: token });
    return json(200, { ok: true });
  }

  const state = await db.me(token);
  if (!state) return json(401, { error: 'Please log in again' });

  if (url.pathname === '/api/me' && request.method === 'GET') return json(200, publicMe(state));
  if (url.pathname === '/api/link' && request.method === 'POST') {
    const partner = await db.rpc('link_partner', { p_token: token, p_code: String((await readBody(request)).code || '') });
    return json(200, { partner });
  }
  if (url.pathname === '/api/unlink' && request.method === 'POST') {
    await db.rpc('unlink_partner', { p_token: token });
    return json(200, { ok: true });
  }
  if (url.pathname.startsWith('/api/admin/')) return adminApi(request, url, db, env, token);
  if (url.pathname === '/api/couple/ws') {
    if (!state.couple_id) return json(409, { error: 'Link with your partner first' });
    return roomStub(env, `couple:${state.couple_id}`)
      .fetch(withPlayer(request, { id: state.id, name: state.name, token, couple: state.couple_id }));
  }
  return json(404, { error: 'Not found' });
}

// ---- Admin dashboard ----
// The database checks that the token belongs to an admin on every call.
async function adminApi(request, url, db, env, token) {
  const path = url.pathname.slice('/api/admin/'.length);
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
    const { action, user, password, on } = await readBody(request);
    const fn = { password: 'admin_set_password', signout: 'admin_sign_out', unlink: 'admin_unlink', delete: 'admin_delete_user', admin: 'admin_set_admin' }[action];
    if (!fn) return json(400, { error: 'Unknown action' });
    const args = { p_token: token, p_user: String(user || '') };
    if (action === 'password') args.p_password = String(password || '');
    if (action === 'admin') args.p_on = Boolean(on);
    await db.rpc(fn, args);
    return json(200, { ok: true });
  }
  return json(404, { error: 'Not found' });
}

// ---- Live numbers ----
// One object keeps track of which rooms have people in them right now, and how
// many guest rooms are started each day. Rooms report to it as people come and go.
export class Stats extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/presence') {
      const { room, couple, players } = await request.json();
      if (players > 0) await this.ctx.storage.put(`live:${room}`, { couple, players, at: Date.now() });
      else await this.ctx.storage.delete(`live:${room}`);
      return json(200, { ok: true });
    }
    if (url.pathname === '/room-created') {
      const key = `created:${new Date().toISOString().slice(0, 10)}`;
      await this.ctx.storage.put(key, ((await this.ctx.storage.get(key)) || 0) + 1);
      return json(200, { ok: true });
    }
    if (url.pathname === '/live') {
      const live = await this.ctx.storage.list({ prefix: 'live:' });
      const stale = Date.now() - 24 * 3600e3; // a room that never reported leaving
      let rooms = 0, coupleRooms = 0, people = 0;
      for (const [key, r] of live) {
        if (r.at < stale) { await this.ctx.storage.delete(key); continue; }
        rooms++; if (r.couple) coupleRooms++; people += r.players;
      }
      const created = await this.ctx.storage.list({ prefix: 'created:' });
      const today = new Date().toISOString().slice(0, 10);
      const week = new Date(Date.now() - 6 * 86400e3).toISOString().slice(0, 10);
      let guestToday = 0, guestWeek = 0;
      for (const [key, n] of created) {
        const day = key.slice(8);
        if (day === today) guestToday += n;
        if (day >= week) guestWeek += n;
        if (day < new Date(Date.now() - 60 * 86400e3).toISOString().slice(0, 10)) await this.ctx.storage.delete(key);
      }
      return json(200, { rooms, coupleRooms, guestRooms: rooms - coupleRooms, people, guestRoomsToday: guestToday, guestRooms7d: guestWeek });
    }
    return json(404, { error: 'Not found' });
  }
}

// ---- One room ----

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.db = new Db(env);
    this.room = null;
    // Room state survives the object going to sleep between taps.
    ctx.blockConcurrencyWhile(async () => { this.room = (await ctx.storage.get('room')) || null; });
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/create') {
      if (this.room) return json(409, { error: 'Code taken' });
      const { code } = await request.json();
      this.room = newRoom(code);
      await this.save();
      return json(200, { code });
    }
    if (url.pathname === '/exists') {
      return this.room ? json(200, { code: this.room.code, partners: this.players().size }) : json(404, { error: 'Room not found' });
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
    const player = ws.deserializeAttachment();
    let action;
    try { action = JSON.parse(message); } catch { return; }
    const result = applyAction(this.room, player.id, true, action);
    if (!result) return;
    await this.save();
    this.broadcast();
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

  reportPresence() {
    if (!this.room) return;
    const body = JSON.stringify({ room: this.room.code, couple: Boolean(this.room.coupleId), players: this.players().size });
    this.ctx.waitUntil(this.env.STATS.get(this.env.STATS.idFromName('stats'))
      .fetch('https://stats/presence', { method: 'POST', body }).catch(() => {}));
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
    if (!this.room.coupleId) await this.ctx.storage.setAlarm(Date.now() + GUEST_ROOM_TTL);
  }

  async alarm() {
    // Guest room idle for too long: forget it, unless someone is still in it.
    if (this.sockets().length) return this.ctx.storage.setAlarm(Date.now() + GUEST_ROOM_TTL);
    this.room = null;
    await this.ctx.storage.deleteAll();
  }

  // Saving is best effort: a database hiccup must never break the live game.
  persist(token, { answer, favorite }) {
    let call;
    if (answer) call = this.db.rpc('save_answer', { p_token: token, p_card_key: answer.cardKey, p_question: answer.question, p_text: answer.text });
    if (favorite) call = this.db.rpc('set_favorite', { p_token: token, p_question: favorite.question, p_on: favorite.on });
    if (call) this.ctx.waitUntil(call.catch(err => console.error('Could not save:', err.message)));
  }
}
