// Couples Deep Questions: tiny real-time server (no dependencies).
// Rooms are held in memory. Clients receive state via Server-Sent Events
// and send actions via POST. Run: node server.js  (then open http://localhost:3000)
//
// Two ways to play:
//  - Guest rooms: pick a name, share a 4-letter code. Nothing is saved.
//  - Accounts (when Supabase is configured): partners link once and share a
//    private room; answers and favorites are saved to the database.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./supabase');

const PORT = process.env.PORT || 3000;
const DECK = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8'));
const CATEGORIES = Object.keys(DECK);
const rooms = new Map(); // key -> room (guest rooms use their 4-letter code, couple rooms "couple:<id>")

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildOrder(category) {
  const cats = category === 'All' ? CATEGORIES : [category];
  return shuffle(cats.flatMap(c => DECK[c].map((q, i) => ({ c, i }))));
}

function randomCode(length) {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from({ length }, () => letters[crypto.randomInt(letters.length)]).join('');
}

function newRoom(code, coupleId = null) {
  return { code, coupleId, category: 'All', order: buildOrder('All'), index: 0, flipped: false, favorites: [], mode: 'talk', answers: {}, clients: new Map(), touched: Date.now() };
}

const cardKey = card => `${card.c}:${card.i}`;
const questionText = card => DECK[card.c]?.[card.i];

// State is tailored per viewer: a partner's answer stays hidden until both have answered.
function publicState(room, viewerId) {
  const card = room.order[room.index];
  const answers = room.answers[cardKey(card)] || {};
  const bothAnswered = room.clients.size === 2 && [...room.clients.keys()].every(id => id in answers);
  return {
    code: room.coupleId ? null : room.code,
    couple: Boolean(room.coupleId),
    categories: ['All', ...CATEGORIES],
    category: room.category,
    index: room.index,
    total: room.order.length,
    flipped: room.flipped,
    card: { category: card.c, text: questionText(card) },
    partners: [...room.clients.values()].map(c => c.name),
    favorites: room.favorites,
    mode: room.mode,
    myAnswer: answers[viewerId] ?? null,
    partnerAnswered: [...room.clients.keys()].some(id => id !== viewerId && id in answers),
    revealed: bothAnswered ? [...room.clients.entries()].map(([id, c]) => ({ name: c.name, text: answers[id], mine: id === viewerId })) : null,
  };
}

function broadcast(room) {
  for (const [id, c] of room.clients) c.res.write(`data: ${JSON.stringify(publicState(room, id))}\n\n`);
}

function readBody(req) {
  return new Promise(resolve => {
    let b = '';
    req.on('data', d => { if (b.length < 1e5) b += d; });
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
  });
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

// Saving is best effort: a database hiccup must never break the live game.
function save(label, promise) {
  promise.catch(err => console.error(`Could not save ${label}:`, err.message));
}

function joinRoom(room, req, res, id, name) {
  const old = room.clients.get(id);
  if (old) old.res.end();
  else if (room.clients.size >= 2) return json(res, 409, { error: 'Room is full' });
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  room.clients.set(id, { res, name });
  broadcast(room);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    if (room.clients.get(id)?.res === res) { room.clients.delete(id); broadcast(room); }
  });
}

function applyAction(room, actorId, { type, category, mode, text }, token) {
  if (type === 'next') { room.index = (room.index + 1) % room.order.length; room.flipped = false; }
  else if (type === 'prev') { room.index = (room.index - 1 + room.order.length) % room.order.length; room.flipped = false; }
  else if (type === 'flip') room.flipped = !room.flipped;
  else if (type === 'category' && (category === 'All' || CATEGORIES.includes(category))) {
    room.category = category; room.order = buildOrder(category); room.index = 0; room.flipped = false;
  } else if (type === 'favorite') {
    const q = questionText(room.order[room.index]);
    const removing = room.favorites.includes(q);
    room.favorites = removing ? room.favorites.filter(f => f !== q) : [...room.favorites, q];
    if (room.coupleId) {
      save('favorite', db.rpc('set_favorite', { p_token: token, p_question: q, p_on: !removing }));
    }
  } else if (type === 'mode' && (mode === 'talk' || mode === 'answer')) {
    room.mode = mode;
  } else if (type === 'answer' && room.clients.has(actorId) && typeof text === 'string' && text.trim()) {
    const key = cardKey(room.order[room.index]);
    const clean = text.trim().slice(0, 1000);
    room.answers[key] = { ...room.answers[key], [actorId]: clean };
    if (room.coupleId) {
      save('answer', db.rpc('save_answer', { p_token: token, p_card_key: key, p_question: questionText(room.order[room.index]), p_text: clean }));
    }
  } else return false;
  return true;
}

// ---- Accounts ----

function tokenOf(req, url) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : url.searchParams.get('token');
}

// Couple rooms reload saved answers and favorites the first time they're opened.
const loading = new Map();
async function coupleRoom(state, token) {
  const key = `couple:${state.couple_id}`;
  if (rooms.has(key)) return rooms.get(key);
  if (!loading.has(key)) {
    loading.set(key, (async () => {
      const room = newRoom(key, state.couple_id);
      const saved = await db.rpc('couple_data', { p_token: token });
      for (const a of saved.answers) room.answers[a.card_key] = { ...room.answers[a.card_key], [a.user_id]: a.text };
      room.favorites = saved.favorites;
      rooms.set(key, room);
      return room;
    })().finally(() => loading.delete(key)));
  }
  return loading.get(key);
}

const publicMe = s => ({ name: s.name, inviteCode: s.invite_code, partner: s.partner });

async function handleAccountApi(req, res, url) {
  if (!db.enabled) return json(res, 503, { error: 'Accounts are not set up on this server' });

  if (url.pathname === '/api/signup' && req.method === 'POST') {
    const { email, password, name } = await readBody(req);
    const token = await db.rpc('sign_up', { p_email: String(email || ''), p_password: String(password || ''), p_name: String(name || '') });
    return json(res, 200, { token, me: publicMe(await db.me(token, { fresh: true })) });
  }
  if (url.pathname === '/api/login' && req.method === 'POST') {
    const { email, password } = await readBody(req);
    const token = await db.rpc('log_in', { p_email: String(email || ''), p_password: String(password || '') });
    return json(res, 200, { token, me: publicMe(await db.me(token, { fresh: true })) });
  }

  const token = tokenOf(req, url);
  if (url.pathname === '/api/logout' && req.method === 'POST') {
    if (token) { db.forget(token); await db.rpc('log_out', { p_token: token }); }
    return json(res, 200, { ok: true });
  }

  const state = await db.me(token, { fresh: url.pathname === '/api/me' });
  if (!state) return json(res, 401, { error: 'Please log in again' });

  if (url.pathname === '/api/me' && req.method === 'GET') return json(res, 200, publicMe(state));

  if (url.pathname === '/api/link' && req.method === 'POST') {
    const partner = await db.rpc('link_partner', { p_token: token, p_code: String((await readBody(req)).code || '') });
    db.forget(token);
    return json(res, 200, { partner });
  }
  if (url.pathname === '/api/unlink' && req.method === 'POST') {
    await db.rpc('unlink_partner', { p_token: token });
    db.forget(token);
    return json(res, 200, { ok: true });
  }

  if (!state.couple_id) return json(res, 409, { error: 'Link with your partner first' });
  const room = await coupleRoom(state, token);
  room.touched = Date.now();
  if (url.pathname === '/api/couple/events' && req.method === 'GET') return joinRoom(room, req, res, state.id, state.name);
  if (url.pathname === '/api/couple/action' && req.method === 'POST') {
    if (!applyAction(room, state.id, await readBody(req), token)) return json(res, 400, { error: 'Unknown action' });
    broadcast(room);
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: 'Not found' });
}

// ---- HTTP ----

const ACCOUNT_ROUTES = new Set(['/api/signup', '/api/login', '/api/logout', '/api/me', '/api/link', '/api/unlink', '/api/couple/events', '/api/couple/action']);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (url.pathname === '/api/config') {
    return json(res, 200, { accounts: db.enabled });
  }

  if (ACCOUNT_ROUTES.has(url.pathname)) {
    try { return await handleAccountApi(req, res, url); }
    catch (err) {
      if (!(err instanceof db.DbError) || err.status >= 500) console.error(err);
      if (!res.headersSent) json(res, err.status || 500, { error: err instanceof db.DbError ? err.message : 'Something went wrong, please try again' });
      return;
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/rooms') {
    let code;
    do code = randomCode(4); while (rooms.has(code));
    rooms.set(code, newRoom(code));
    return json(res, 200, { code });
  }

  const m = url.pathname.match(/^\/api\/rooms\/([A-Z]{4})(\/events|\/action)?$/);
  if (m) {
    const room = rooms.get(m[1]);
    if (!room) return json(res, 404, { error: 'Room not found' });
    room.touched = Date.now();

    if (!m[2] && req.method === 'GET') return json(res, 200, { code: room.code, partners: room.clients.size });

    if (m[2] === '/events' && req.method === 'GET') {
      // The browser keeps a stable id so a partner who reloads gets their seat (and answers) back.
      const id = (url.searchParams.get('id') || '').slice(0, 64) || crypto.randomUUID();
      return joinRoom(room, req, res, id, (url.searchParams.get('name') || 'Partner').slice(0, 24));
    }

    if (m[2] === '/action' && req.method === 'POST') {
      const body = await readBody(req);
      if (!applyAction(room, body.id, body)) return json(res, 400, { error: 'Unknown action' });
      broadcast(room);
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: 'Method not allowed' });
  }

  // Static files
  const file = path.join(__dirname, 'public', url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
  if (!file.startsWith(path.join(__dirname, 'public'))) return json(res, 403, { error: 'Forbidden' });
  fs.readFile(file, (err, data) => {
    if (err) return json(res, 404, { error: 'Not found' });
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

// Forget rooms that have been empty and idle for 6 hours (couple rooms reload from the database).
setInterval(() => {
  for (const [key, r] of rooms) if (r.clients.size === 0 && Date.now() - r.touched > 6 * 3600e3) rooms.delete(key);
}, 600e3).unref();

server.listen(PORT, () => console.log(`Couples app running at http://localhost:${PORT}${db.enabled ? '' : ' (accounts off: Supabase not configured)'}`));
