// Run against `npm start -- --port 8791`. This script refuses remote hosts and
// enabled account backends. Optional: --checkpoint FILE, restart Wrangler, then
// --resume FILE to verify Durable Object state and command receipts survived.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const base = new URL(process.env.BASE_URL || 'http://127.0.0.1:8791');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Only loopback hosts are allowed');
assert.equal(base.protocol, 'http:', 'Use the local HTTP Wrangler server');
assert.equal(base.username + base.password, '', 'Credentials are not allowed');
const config = await fetch(new URL('/api/config', base)).then(r => r.json());
assert.equal(config.accounts, false, 'Run without account secrets or a database backend');
const clients = [];
const checkpointPath = process.argv[process.argv.indexOf('--checkpoint') + 1];
const resumePath = process.argv[process.argv.indexOf('--resume') + 1];

class Client {
  constructor(code, id, name) {
    const url = new URL(`/api/rooms/${code}/ws`, base);
    url.protocol = 'ws:';
    url.search = new URLSearchParams({ id, name, protocol: '2' });
    this.frames = [];
    this.listeners = new Set();
    this.socket = new WebSocket(url);
    clients.push(this);
    this.socket.addEventListener('message', event => {
      this.frames.push(JSON.parse(event.data));
      for (const notify of this.listeners) notify();
    });
  }
  wait(predicate, after = 0) {
    return new Promise((resolve, reject) => {
      const done = (error, value) => {
        clearTimeout(timer); this.listeners.delete(check);
        error ? reject(error) : resolve(value);
      };
      const check = () => {
        const found = this.frames.slice(after).find(predicate);
        if (found) done(null, found);
      };
      const timer = setTimeout(() => done(new Error(`Timed out waiting for a room frame after ${after}`)), 8000);
      this.listeners.add(check); check();
    });
  }
  state(predicate = () => true, after = 0) { return this.wait(frame => frame.card && predicate(frame), after); }
  send(action) { const after = this.frames.length; this.socket.send(JSON.stringify(action)); return after; }
  async command(action, ok = true) {
    const after = this.send(action);
    const ack = await this.wait(frame => frame.type === 'ack' && frame.id === action.id, after);
    assert.equal(ack.ok, ok);
    assert.equal(ack.cardKey, action.cardKey);
    if (!ok) assert.ok(ack.error);
    return after;
  }
  async close() {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    await new Promise(resolve => {
      const timer = setTimeout(resolve, 1000);
      this.socket.addEventListener('close', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.socket.close(1000, 'Local integration complete');
    });
  }
}

async function verifyRestored(saved, event) {
  const a = new Client(saved.code, saved.aId, 'Integration A');
  const first = await a.state();
  assert.equal(first.card.id, saved.card.id);
  assert.equal(first.myAnswer, saved.answerA);
  assert.deepEqual(first.revealed.map(answer => answer.text).sort(), [saved.answerA, saved.answerB].sort());
  assert.ok(first.favorites.includes(saved.card.text));
  const after = await a.command(saved.favorite);
  const replayed = await a.state(frame => frame.card.id === saved.card.id, after);
  assert.equal(replayed.favorites.filter(text => text === saved.card.text).length, 1);
  console.log(`PASS ${event}: room ${saved.code}, both answers, favorite and deduplication receipt persisted`);
}

try {
  if (process.argv.includes('--resume')) {
    assert.ok(resumePath, '--resume needs a checkpoint path');
    await verifyRestored(JSON.parse(await readFile(resumePath, 'utf8')), 'process restart');
  } else {
    const created = await fetch(new URL('/api/rooms', base), { method: 'POST' });
    assert.equal(created.status, 200);
    const { code } = await created.json();
    assert.match(code, /^[A-Z]{4}$/);
    const aId = randomUUID(), bId = randomUUID();
    const a = new Client(code, aId, 'Integration A');
    await a.state();
    const b = new Client(code, bId, 'Integration B');
    await Promise.all([a.state(s => s.partners.length === 2), b.state(s => s.partners.length === 2)]);
    let after = a.send({ type: 'decks', decks: ['Getting Closer'], fresh: false });
    const active = await a.state(s => !s.choosing && s.decks[0] === 'Getting Closer', after);
    assert.equal(active.protocolVersion, 2); assert.equal(active.generation, 0); assert.equal(active.roomId, code);
    assert.match(active.card.id, /^Getting Closer:\d+$/);
    const { card } = active;
    after = a.send({ type: 'mode', mode: 'answer' });
    await a.state(s => s.mode === 'answer', after);
    const answerA = `Private A ${randomUUID()}`, answerB = `Private B ${randomUUID()}`;
    const bBefore = b.frames.length;
    after = await a.command({ type: 'answer', id: randomUUID(), cardKey: card.id, generation: 0, text: answerA });
    const own = await a.state(s => s.myAnswer === answerA, after);
    assert.equal(own.revealed, null);
    const hidden = await b.state(s => s.partnerAnswered, bBefore);
    assert.equal(hidden.myAnswer, null); assert.equal(hidden.revealed, null);
    assert.equal(JSON.stringify(hidden).includes(answerA), false);
    console.log('PASS two real WebSockets: card identity, generation, durable acknowledgment, and one-sided answer privacy');
    after = await b.command({ type: 'answer', id: randomUUID(), cardKey: card.id, generation: 0, text: answerB });
    const revealed = await b.state(s => s.revealed?.length === 2, after);
    assert.deepEqual(revealed.revealed.map(answer => answer.text).sort(), [answerA, answerB].sort());
    console.log('PASS answers reveal only after both partners answer');
    const favorite = { type: 'favorite', id: randomUUID(), cardKey: card.id, generation: 0 };
    after = await a.command(favorite);
    await a.state(s => s.favorites.includes(card.text), after);
    after = await a.command(favorite);
    const duplicate = await a.state(s => s.card.id === card.id, after);
    assert.equal(duplicate.favorites.filter(text => text === card.text).length, 1);
    console.log('PASS duplicate favorite command ID returns success without a second toggle');
    after = a.send({ type: 'next' });
    const next = await a.state(s => s.card.id !== card.id, after);
    await a.command({ type: 'answer', id: randomUUID(), cardKey: card.id, generation: 0, text: 'Must not attach to the next card' }, false);
    await a.command({ type: 'favorite', id: randomUUID(), cardKey: card.id, generation: 0 }, false);
    await a.command({ type: 'answer', id: randomUUID(), cardKey: next.card.id, generation: 1, text: 'Wrong generation' }, false);
    after = a.send({ type: 'mode', mode: 'answer' });
    const unchanged = await a.state(s => s.card.id === next.card.id, after);
    assert.equal(unchanged.myAnswer, null); assert.equal(unchanged.favorites.includes(next.card.text), false);
    console.log('PASS stale answer/favorite and incorrect generation rejected without modifying the current card');
    for (const id of ['__proto__', 'constructor', 'toString']) {
      const url = new URL(`/api/rooms/${code}/ws`, base);
      url.search = new URLSearchParams({ id, name: 'Invalid', protocol: '2' });
      const response = await fetch(url);
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /guest identity/i);
    }
    console.log('PASS inherited guest identities rejected by the real HTTP route');
    after = a.send({ type: 'prev' });
    await a.state(s => s.card.id === card.id, after);
    await a.close();
    const saved = { code, aId, bId, card, answerA, answerB, favorite };
    await verifyRestored(saved, 'reconnect');
    if (process.argv.includes('--checkpoint')) {
      assert.ok(checkpointPath, '--checkpoint needs a file path');
      await writeFile(checkpointPath, JSON.stringify(saved), { mode: 0o600 });
      console.log(`Checkpoint saved to ${checkpointPath}; restart Wrangler and run --resume to verify process persistence`);
    }
  }
} finally {
  await Promise.all(clients.map(client => client.close()));
}
