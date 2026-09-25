// Couples Deep Questions: tiny real-time server (no dependencies).
// Rooms are held in memory. Clients receive state via Server-Sent Events
// and send actions via POST. Run: node server.js  (then open http://localhost:3000)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DECK = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8'));
const CATEGORIES = Object.keys(DECK);
const rooms = new Map(); // code -> room

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

function newCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = Array.from({ length: 4 }, () => letters[crypto.randomInt(letters.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function publicState(room) {
  const card = room.order[room.index];
  return {
    code: room.code,
    categories: ['All', ...CATEGORIES],
    category: room.category,
    index: room.index,
    total: room.order.length,
    flipped: room.flipped,
    card: { category: card.c, text: DECK[card.c][card.i] },
    partners: [...room.clients.values()].map(c => c.name),
    favorites: room.favorites,
  };
}

function broadcast(room) {
  const data = `data: ${JSON.stringify(publicState(room))}\n\n`;
  for (const c of room.clients.values()) c.res.write(data);
}

function readBody(req) {
  return new Promise(resolve => {
    let b = '';
    req.on('data', d => (b += d));
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
  });
}

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (req.method === 'POST' && url.pathname === '/api/rooms') {
    const code = newCode();
    rooms.set(code, { code, category: 'All', order: buildOrder('All'), index: 0, flipped: false, favorites: [], clients: new Map(), touched: Date.now() });
    return json(res, 200, { code });
  }

  const m = url.pathname.match(/^\/api\/rooms\/([A-Z]{4})(\/events|\/action)?$/);
  if (m) {
    const room = rooms.get(m[1]);
    if (!room) return json(res, 404, { error: 'Room not found' });
    room.touched = Date.now();

    if (!m[2] && req.method === 'GET') return json(res, 200, { code: room.code, partners: room.clients.size });

    if (m[2] === '/events' && req.method === 'GET') {
      if (room.clients.size >= 2) return json(res, 409, { error: 'Room is full' });
      const id = crypto.randomUUID();
      const name = (url.searchParams.get('name') || 'Partner').slice(0, 24);
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      room.clients.set(id, { res, name });
      broadcast(room);
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => { clearInterval(ping); room.clients.delete(id); broadcast(room); });
      return;
    }

    if (m[2] === '/action' && req.method === 'POST') {
      const { type, category } = await readBody(req);
      if (type === 'next') { room.index = (room.index + 1) % room.order.length; room.flipped = false; }
      else if (type === 'prev') { room.index = (room.index - 1 + room.order.length) % room.order.length; room.flipped = false; }
      else if (type === 'flip') room.flipped = !room.flipped;
      else if (type === 'category' && (category === 'All' || CATEGORIES.includes(category))) {
        room.category = category; room.order = buildOrder(category); room.index = 0; room.flipped = false;
      } else if (type === 'favorite') {
        const text = publicState(room).card.text;
        room.favorites = room.favorites.includes(text) ? room.favorites.filter(f => f !== text) : [...room.favorites, text];
      } else return json(res, 400, { error: 'Unknown action' });
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

// Forget rooms that have been empty and idle for 6 hours.
setInterval(() => {
  for (const [code, r] of rooms) if (r.clients.size === 0 && Date.now() - r.touched > 6 * 3600e3) rooms.delete(code);
}, 600e3).unref();

server.listen(PORT, () => console.log(`Couples app running at http://localhost:${PORT}`));
