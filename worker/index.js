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

const publicMe = s => ({ name: s.name, inviteCode: s.invite_code, partner: s.partner });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const db = new Db(env);

    try {
      if (url.pathname === '/api/config') return json(200, { accounts: db.enabled });

      // ---- Guest rooms ----
      if (url.pathname === '/api/rooms' && request.method === 'POST') {
        for (let attempt = 0; attempt < 5; attempt++) {
          const code = randomCode(4);
          const res = await roomStub(env, code).fetch('https://room/create', { method: 'POST', body: JSON.stringify({ code }) });
          if (res.ok) return json(200, { code });
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
  if (url.pathname === '/api/couple/ws') {
    if (!state.couple_id) return json(409, { error: 'Link with your partner first' });
    return roomStub(env, `couple:${state.couple_id}`)
      .fetch(withPlayer(request, { id: state.id, name: state.name, token, couple: state.couple_id }));
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
  }

  webSocketError() {
    this.broadcast();
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
