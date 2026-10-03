import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInContext } from 'node:vm';
import { JSDOM } from 'jsdom';

// Run the shipped page in a real DOM. Only external transport and the clock are
// controlled, so these tests exercise the actual event handlers and rendering.
function browser(page = 'index', fetcher = () => new Promise(() => {})) {
  const html = readFileSync(new URL(`../public/${page}.html`, import.meta.url), 'utf8');
  const dom = new JSDOM(html, { url: 'https://closer.test/', runScripts: 'outside-only' });
  const { window } = dom;
  const timers = new Map(), sockets = [];
  let timerId = 0, commandId = 0;
  window.fetch = fetcher;
  window.setTimeout = (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; };
  window.clearTimeout = id => timers.delete(id);
  window.setInterval = () => 0;
  window.clearInterval = () => {};
  window.crypto.randomUUID = () => `00000000-0000-4000-8000-${String(++commandId).padStart(12, '0')}`;
  window.WebSocket = class {
    static OPEN = 1;
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; sockets.push(this); }
    send(body) { if (this.readyState !== 1) throw new Error('Socket is closed'); this.sent.push(JSON.parse(body)); }
    close() { this.readyState = 3; }
  };
  const evaluate = code => runInContext(code, dom.getInternalVMContext());
  evaluate(window.document.querySelector('script').textContent);
  const element = id => window.document.getElementById(id);
  return {
    window, element, sockets,
    eval: evaluate,
    connect() {
      evaluate("openSocket('/api/rooms/ABCD/ws?name=Me&id=guest', 'Could not join')");
      const socket = sockets.at(-1); socket.readyState = 1; socket.onopen(); return socket;
    },
    receive(socket, message) { socket.onmessage({ data: JSON.stringify(message) }); },
    type(text) { element('answerText').value = text; element('answerText').dispatchEvent(new window.Event('input', { bubbles: true })); },
    runTimers(delay) {
      for (const [id, timer] of [...timers]) if (timer.delay === delay && timers.delete(id)) timer.fn();
    },
    close() { dom.window.close(); },
  };
}

function state(card = 0, extra = {}) {
  return {
    protocolVersion: 2, generation: 0, roomId: 'ABCD', code: 'ABCD', couple: false,
    card: { id: `Getting Closer:${card}`, category: 'Getting Closer', text: `Question ${card}` },
    decks: [], deckList: [{ name: 'Getting Closer', count: 10, used: 0 }, { name: 'Who You Are', count: 10, used: 0 }],
    index: card, total: 20, favorites: [], flipped: true, tapToReveal: true,
    mode: 'answer', myAnswer: null, partnerAnswered: false, revealed: null,
    partners: ['Me', 'Partner'], choosing: false, started: true, fresh: false, saved: {},
    ...extra,
  };
}

function playing(t, extra) {
  const page = browser(); t.after(() => page.close());
  const socket = page.connect(); page.receive(socket, state(0, extra));
  return { ...page, socket };
}

test('a delayed face-down transition cannot overwrite a newer question', t => {
  const page = playing(t);
  page.receive(page.socket, state(1, { flipped: false }));
  page.receive(page.socket, state(2, { flipped: true }));
  page.runTimers(300);
  assert.equal(page.element('q').textContent, 'Question 2');
});

test('a draft returns to its question after the partner navigates away', t => {
  const page = playing(t);
  page.type('My unfinished thought');
  page.receive(page.socket, state(1));
  assert.equal(page.element('answerText').value, '');
  page.type('A second thought');
  page.receive(page.socket, state(0));
  assert.equal(page.element('answerText').value, 'My unfinished thought');
});

test('drafts for the same question stay separate in different rooms', t => {
  const page = playing(t);
  page.type('For room A');
  page.receive(page.socket, state(0, { roomId: 'EFGH', code: 'EFGH' }));
  assert.equal(page.element('answerText').value, '');
  page.type('For room B');
  page.receive(page.socket, state(0));
  assert.equal(page.element('answerText').value, 'For room A');
});

test('sending an answer binds its card and keeps the draft until acknowledgment', t => {
  const page = playing(t);
  page.type('  An answer  '); page.element('lockIn').click();
  const command = page.socket.sent.at(-1);
  assert.equal(command.cardKey, 'Getting Closer:0');
  assert.match(command.id, /^[a-f\d-]{36}$/i);
  assert.equal(command.text, 'An answer');
  assert.equal(page.element('answerText').value, '  An answer  ');
  page.receive(page.socket, { type: 'ack', id: command.id, ok: true, cardKey: command.cardKey });
  assert.equal(page.element('answerText').value, '');
  assert.equal(page.element('q').textContent, 'Question 0');
});

test('acknowledging an earlier answer preserves edits made while it was pending', t => {
  const page = playing(t);
  page.type('First thought'); page.element('lockIn').click();
  const command = page.socket.sent.at(-1);
  page.type('A revised thought');
  assert.doesNotThrow(() => page.receive(page.socket, { type: 'ack', id: command.id, ok: true, cardKey: command.cardKey }));
  assert.equal(page.element('answerText').value, 'A revised thought');
});

test('an acknowledgment for another question cannot clear the active draft', t => {
  const page = playing(t);
  page.type('Answer to zero'); page.element('lockIn').click();
  const command = page.socket.sent.at(-1);
  page.receive(page.socket, state(1)); page.type('Draft for one');
  assert.doesNotThrow(() => page.receive(page.socket, { type: 'ack', id: command.id, ok: true, cardKey: command.cardKey }));
  assert.equal(page.element('answerText').value, 'Draft for one');
  page.receive(page.socket, state(0));
  assert.equal(page.element('answerText').value, '');
});

test('rejected answers preserve the draft and allow a corrected retry', t => {
  const page = playing(t);
  page.type('Keep this answer'); page.element('lockIn').click();
  const command = page.socket.sent.at(-1);
  assert.doesNotThrow(() => page.receive(page.socket, { type: 'ack', id: command.id, ok: false, error: 'Card changed. Try again.' }));
  assert.equal(page.element('answerText').value, 'Keep this answer');
  assert.match(page.element('toast').textContent, /Card changed/);
  assert.equal(page.element('lockIn').disabled, false);
});

test('reconnect retries an unacknowledged answer with the original command id', t => {
  const page = playing(t);
  page.type('Persist this'); page.element('lockIn').click();
  const original = page.socket.sent.at(-1);
  page.socket.readyState = 3; page.socket.onclose({ code: 1006 }); page.runTimers(1000);
  const next = page.sockets.at(-1); next.readyState = 1; next.onopen();
  page.receive(next, state(0));
  assert.deepEqual(next.sent.at(-1), original);
  assert.equal(page.element('answerText').value, 'Persist this');
});

test('answer and favorite commands bind the current data generation', t => {
  const page = playing(t, { generation: 3 });
  page.type('An answer'); page.element('lockIn').click(); page.element('fav').click();
  assert.deepEqual(page.socket.sent.map(({ type, generation }) => ({ type, generation })), [
    { type: 'answer', generation: 3 }, { type: 'favorite', generation: 3 },
  ]);
});

test('replaying after deleted data retains the original generation and preserves a rejected draft', t => {
  const page = playing(t, { generation: 2 });
  page.type('Before the deletion'); page.element('lockIn').click();
  const original = page.socket.sent.at(-1);
  page.socket.readyState = 3; page.socket.onclose({ code: 1006 }); page.runTimers(1000);
  const next = page.sockets.at(-1); next.readyState = 1; next.onopen();
  page.receive(next, state(0, { generation: 3 }));
  assert.equal(next.sent.at(-1).generation, 2);
  assert.equal(next.sent.at(-1).id, original.id);
  page.receive(next, { type: 'ack', id: original.id, ok: false, cardKey: original.cardKey, error: 'Saved data changed. Try again.' });
  assert.equal(page.element('answerText').value, 'Before the deletion');
  assert.equal(page.element('lockIn').disabled, false);
});

test('an unsupported data generation cannot send a saved-card command', t => {
  for (const generation of [undefined, -1, 0.5]) {
    const page = playing(t, { generation });
    page.type('Retain this draft'); page.element('lockIn').click(); page.element('fav').click();
    assert.equal(page.socket.sent.length, 0);
    assert.equal(page.element('answerText').value, 'Retain this draft');
    assert.match(page.element('toast').textContent, /refresh|updat/i);
  }
});

test('a favorite is bound to the displayed card and a deduplicatable id', t => {
  const page = playing(t);
  page.element('fav').click();
  const command = page.socket.sent.at(-1);
  assert.equal(command.type, 'favorite');
  assert.equal(command.cardKey, 'Getting Closer:0');
  assert.match(command.id, /^[a-f\d-]{36}$/i);
});

test('WebSocket connections opt into the acknowledged command protocol', t => {
  const page = playing(t);
  assert.equal(new URL(page.socket.url).searchParams.get('protocol'), '2');
});

test('an older server cannot receive an answer without reliable card context', t => {
  const page = playing(t, { protocolVersion: undefined, roomId: undefined, card: { category: 'Getting Closer', text: 'Legacy question' } });
  page.type('Keep me during rollout'); page.element('lockIn').click(); page.element('fav').click();
  assert.equal(page.socket.sent.filter(x => x.type === 'answer' || x.type === 'favorite').length, 0);
  assert.equal(page.element('answerText').value, 'Keep me during rollout');
  assert.match(page.element('toast').textContent, /refresh|updat/i);
});

test('keyboard focus stays on the selected deck when its selection rerenders', t => {
  const page = playing(t, { choosing: true });
  const tile = page.element('deckList').querySelector('[data-deck="Who You Are"]');
  tile.focus(); tile.click();
  assert.equal(page.window.document.activeElement.dataset.deck, 'Who You Are');
  assert.equal(page.window.document.activeElement.getAttribute('aria-pressed'), 'false');
});

test('the takeover control is a native keyboard button when another device replaces this one', t => {
  const page = playing(t);
  page.socket.onclose({ code: 4000 });
  const control = page.element('partners');
  assert.equal(control.tagName, 'BUTTON');
  assert.equal(control.disabled, false);
  control.focus(); assert.equal(page.window.document.activeElement, control);
  control.click();
  assert.equal(page.sockets.length, 2);
});

test('failed logout retains the session and tells the user it failed', async t => {
  const page = browser('index', path => path === '/api/logout'
    ? Promise.resolve({ ok: false, status: 503, json: async () => ({ error: 'Please try again later' }) })
    : new Promise(() => {}));
  t.after(() => page.close());
  page.eval("setToken('session-token'); showAccount({name:'Me',partner:{name:'Partner'}})");
  const button = page.window.document.querySelector('[data-logout]');
  await button.onclick();
  assert.equal(page.window.localStorage.getItem('closer:token'), 'session-token');
  assert.equal(page.element('homeBox').classList.contains('hidden'), false);
  assert.match(page.element('err').textContent, /log out|try again/i);
  assert.equal(button.disabled, false);
});

test('an expired account session closes its room and cannot replay its private pending answer', async t => {
  const page = playing(t, { couple: true });
  page.eval("setToken('expired-token'); account = { name:'Me',partner:{name:'Partner'} }");
  page.type('Private pending answer'); page.element('lockIn').click();
  page.window.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: 'Session expired' }) });
  await page.eval("api('/api/me').catch(() => {})");
  assert.equal(page.element('game').classList.contains('hidden'), true);
  assert.equal(page.socket.readyState, 3);
  const next = page.connect(); page.receive(next, state(0, { couple: true }));
  assert.equal(page.element('answerText').value, '');
  assert.equal(next.sent.length, 0);
});

test('an unsupported room frame is ignored without breaking the current view', t => {
  const page = playing(t);
  assert.doesNotThrow(() => page.receive(page.socket, null));
  assert.equal(page.element('q').textContent, 'Question 0');
});

function admin(t) {
  const requests = [];
  const page = browser('admin', path => new Promise((resolve, reject) => requests.push({ path, resolve, reject })));
  t.after(() => page.close());
  page.eval("me = {id:'admin'}");
  return { ...page, requests };
}
const user = (id, name) => ({ id, name, email: `${id}@example.com`, created_at: '2026-10-01T00:00:00Z', partner: null, answers: 0, last_login: null, last_answer: null, is_admin: false });
const response = data => ({ ok: true, status: 200, json: async () => data });

test('an older admin search response cannot overwrite the latest results', async t => {
  const page = admin(t);
  page.element('search').value = 'old'; const old = page.eval('loadUsers()');
  page.element('search').value = 'new'; const current = page.eval('loadUsers()');
  page.requests[2].resolve(response([user('new', 'New result')])); await current;
  page.requests[1].resolve(response([user('old', 'Old result')])); await old;
  assert.match(page.element('userList').textContent, /New result/);
  assert.doesNotMatch(page.element('userList').textContent, /Old result/);
});

test('typing another admin query invalidates a response before debounce starts the next request', async t => {
  const page = admin(t);
  page.element('search').value = 'old'; const old = page.eval('loadUsers()');
  page.element('search').value = 'new'; page.element('search').dispatchEvent(new page.window.Event('input'));
  page.requests[1].resolve(response([user('old', 'Old result')])); await old;
  assert.doesNotMatch(page.element('userList').textContent, /Old result/);
});
