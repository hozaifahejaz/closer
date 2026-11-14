import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { makeGame } from '../src/game.ts';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const DECK = read('../src/data/questions.json');
const game = makeGame(DECK);

// A small seeded generator so a failing run can be repeated.
const seeded = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const small = () => makeGame({ A: ['a0', 'a1', null, 'a3'], B: ['b0', 'b1'], C: ['c0'] }, seeded(7));

// Everything that must be true of a state, whatever the person tapped.
function check(g, s) {
  assert.ok(Number.isInteger(s.index) && s.index >= 0);
  assert.equal(new Set(s.order).size, s.order.length, 'no card twice in a deal');
  for (const k of s.order) assert.ok(g.live(k), `${k} is a live card`);
  if (s.started) {
    assert.ok(s.order.length > 0 && s.index < s.order.length);
    const allowed = new Set((s.decks.length ? s.decks : g.names).map(String));
    for (const k of s.order) assert.ok(allowed.has(k.slice(0, k.lastIndexOf(':'))), `${k} belongs to a deck in play`);
    if (s.flipped) assert.equal(s.seen[g.current(s)], 1, 'a face-up card is seen');
    if (!s.tapToReveal) assert.equal(s.flipped, true);
  } else assert.equal(g.current(s), null);
  for (const [key, deal] of Object.entries(s.progress)) {
    assert.ok(deal.order.length > 0 && deal.index < deal.order.length, `saved place ${key} is inside its cards`);
    assert.equal(new Set(deal.order).size, deal.order.length);
  }
  assert.equal(new Set(s.favorites.map(f => f.k)).size, s.favorites.length);
}

test('the bundled questions are the same as the repo questions.json', { skip: !existsSync(new URL('../../questions.json', import.meta.url)) }, () => {
  assert.deepEqual(DECK, read('../../questions.json'));
});

test('all 26 decks and every live question are bundled', () => {
  assert.equal(game.names.length, 26);
  assert.equal(game.total, 1378);
  for (const d of game.usage(game.newState())) assert.ok(d.count > 0, d.name);
});

test('a new install has nothing dealt and nothing seen', () => {
  const s = game.newState();
  check(game, s);
  assert.equal(game.current(s), null);
  assert.equal(game.seenCount(s), 0);
  assert.deepEqual(game.next(s), s);
  assert.deepEqual(game.flip(s), s);
});

test('starting all decks deals every live card once', () => {
  const s = game.start(game.newState(), game.names, false);
  check(game, s);
  assert.equal(s.order.length, 1378);
  assert.deepEqual(s.decks, []);
  assert.equal(game.seenCount(s), 1);
});

test('starting needs at least one real deck', () => {
  const s0 = game.newState();
  assert.equal(game.start(s0, [], false), s0);
  assert.equal(game.start(s0, ['Nope'], false), s0);
  assert.equal(game.start(s0, null, false), s0);
});

test('next and previous wrap around and retired cards never appear', () => {
  const g = small();
  let s = g.start(g.newState(), ['A'], false);
  assert.equal(s.order.length, 3);
  assert.ok(!s.order.includes('A:2'));
  const first = g.current(s);
  s = g.prev(s); assert.equal(s.index, 2);
  s = g.next(s); assert.equal(g.current(s), first);
  s = g.next(g.next(g.next(s))); assert.equal(g.current(s), first);
  assert.equal(Object.keys(s.seen).length, 3);
  check(g, s);
});

test('tap to reveal: cards arrive face down and count as seen only once turned', () => {
  const g = small();
  let s = g.setTapToReveal(g.start(g.newState(), ['A', 'B'], false), true);
  s = g.next(s);
  assert.equal(s.flipped, false);
  const seen = Object.keys(s.seen).length;
  s = g.flip(s);
  assert.equal(s.flipped, true);
  assert.equal(Object.keys(s.seen).length, seen + 1);
  s = g.setTapToReveal(g.flip(s), false);
  assert.equal(s.flipped, true);
  check(g, s);
});

test('each set of decks keeps its own place', () => {
  const g = small();
  let s = g.start(g.newState(), ['A'], false);
  s = g.next(s);
  const [orderA, indexA] = [s.order, s.index];
  s = g.start(s, ['B'], false);
  assert.deepEqual(g.savedPlaces(s).A, { index: 1, total: 3 });
  s = g.next(s);
  s = g.start(s, ['A'], false);
  assert.deepEqual(s.order, orderA);
  assert.equal(s.index, indexA);
  assert.deepEqual(g.savedPlaces(s), { A: { index: 1, total: 3 }, B: { index: 1, total: 2 } });
  assert.equal(g.start(s, ['A'], false), s, 'starting the same decks again changes nothing');
  check(g, s);
});

test('"only cards I haven\'t seen" deals just the unseen ones and leaves the saved place alone', () => {
  const g = small();
  let s = g.start(g.newState(), ['A', 'B'], false);
  s = g.next(g.next(s));
  const seen = new Set(Object.keys(s.seen));
  const place = { order: s.order, index: s.index };
  s = g.start(s, ['A', 'B'], true);
  assert.equal(s.fresh, true);
  assert.equal(s.order.length, 5 - seen.size);
  for (const k of s.order) assert.ok(!seen.has(k));
  assert.deepEqual(s.progress['A|B'], place);
  while (g.unusedCount(s, ['A', 'B'])) s = g.next(s);
  assert.equal(g.start(s, ['A', 'B'], true), s, 'nothing new left to deal');
  s = g.start(s, ['A', 'B'], false);
  assert.deepEqual({ order: s.order, index: s.index }, place);
  check(g, s);
});

test('favorites can be added, removed and survive a retired question', () => {
  const g = small();
  let s = g.start(g.newState(), ['A'], false);
  s = g.toggleFavorite(s, 'A:0');
  s = g.toggleFavorite(s, 'B:1');
  assert.deepEqual(s.favorites, [{ k: 'A:0', q: 'a0' }, { k: 'B:1', q: 'b1' }]);
  assert.equal(g.toggleFavorite(s, 'A:2'), s, 'a retired card cannot be saved');
  s = g.toggleFavorite(s, 'A:0');
  assert.deepEqual(s.favorites, [{ k: 'B:1', q: 'b1' }]);
  const later = makeGame({ A: ['a0'], B: ['b0', null] });
  assert.deepEqual(later.restore(JSON.parse(JSON.stringify(s))).favorites, [{ k: 'B:1', q: 'b1' }]);
});

test('removing a favorite can be undone', () => {
  let s = game.newState();
  for (const k of game.start(s, ['Dilemmas'], false).order.slice(0, 3)) s = game.toggleFavorite(s, k);
  const before = s.favorites, gone = s.favorites[1];
  s = game.toggleFavorite(s, gone.k);
  assert.equal(s.favorites.length, 2);
  s = game.restoreFavorite(s, gone, 1);
  assert.deepEqual(s.favorites, before);
  assert.equal(game.restoreFavorite(s, gone, 0), s);
  check(game, s);
});

test('reset forgets progress but keeps favorites and settings', () => {
  const g = small();
  let s = g.setHaptics(g.setTapToReveal(g.start(g.newState(), ['A'], false), true), false);
  s = g.toggleFavorite(g.next(s), 'A:0');
  s = g.resetProgress(s);
  assert.equal(s.started, false);
  assert.deepEqual(s.seen, {});
  assert.deepEqual(s.progress, {});
  assert.equal(s.favorites.length, 1);
  assert.equal(s.tapToReveal, true);
  assert.equal(s.haptics, false);
  check(g, s);
});

test('shuffling keeps the same cards and goes back to the first', () => {
  let s = game.start(game.newState(), ['Dilemmas'], false);
  s = game.next(game.next(s));
  const again = game.reshuffle(s);
  assert.equal(again.index, 0);
  assert.deepEqual([...again.order].sort(), [...s.order].sort());
  assert.notDeepEqual(again.order, s.order);
  check(game, again);
});

test('saving and loading gives back the same state', () => {
  let s = game.start(game.newState(), ['Dilemmas', 'Unsent'], false);
  s = game.toggleFavorite(game.next(game.next(s)), game.current(s));
  s = game.start(s, ['Amnesia'], false);
  assert.deepEqual(game.restore(JSON.parse(JSON.stringify(s))), s);
});

test('a damaged or foreign save never crashes and always gives a playable state', () => {
  const bad = [null, undefined, 7, 'x', [], {}, { started: true }, { started: true, order: 'no', index: -4 },
    { started: true, order: ['Nope:1', 'Dilemmas:0', 'Dilemmas:0', 5, 'Dilemmas:99999'], index: 99, decks: ['Dilemmas', 'Nope'], seen: { 'Nope:1': 1, 'Dilemmas:0': 1 } },
    { started: true, order: [], index: 0, decks: ['Unsent'], fresh: true, tapToReveal: true, flipped: true },
    { progress: { 'Nope': { order: ['Nope:0'], index: 0 }, 'Unsent': { order: ['Unsent:0'], index: 9 }, 'Unsent|Amnesia': 4, All: { order: [], index: 0 } } },
    { favorites: [{ k: 'Dilemmas:0', q: 'old' }, { k: 'Dilemmas:0', q: 'dupe' }, { k: 3 }, null, 'x'], seen: 'no', haptics: 'yes' },
    { __proto__: { started: true }, decks: { length: 3 } }];
  for (const raw of bad) {
    const s = game.restore(raw);
    check(game, s);
    check(game, game.next(game.start(s, ['Unsent'], false)));
  }
  const fixed = game.restore(bad[8]);
  assert.deepEqual(fixed.decks, ['Dilemmas']);
  assert.ok(fixed.order.includes('Dilemmas:0') && fixed.order.length === game.usage(fixed).find(d => d.name === 'Dilemmas').count);
  assert.deepEqual(Object.keys(game.restore(bad[10]).progress), ['Unsent']);
});

test('an app update that retires and adds questions keeps the place', () => {
  const before = makeGame({ A: ['a0', 'a1', 'a2', 'a3'], B: ['b0'] }, seeded(3));
  let s = before.start(before.newState(), ['A'], false);
  s = before.next(before.next(s));
  const here = before.current(s), earlier = s.order[0];
  const data = { A: ['a0', 'a1', 'a2', 'a3', 'a4', 'a5'], B: ['b0'] };
  data.A[Number(earlier.split(':')[1])] = null; // retire a card already passed
  const after = makeGame(data, seeded(5));
  const now = after.restore(JSON.parse(JSON.stringify(s)));
  check(after, now);
  assert.equal(after.current(now), here);
  assert.equal(now.index, 1);
  assert.equal(now.order.length, 5);
  assert.ok(now.order.indexOf('A:4') > now.index && now.order.indexOf('A:5') > now.index, 'new cards land in the cards still to come');
  const gone = makeGame({ B: ['b0'] });
  const moved = gone.restore(JSON.parse(JSON.stringify(s)));
  check(gone, moved);
  assert.deepEqual(moved.order, ['B:0']);
});

test('only a limited number of saved places is kept', () => {
  let s = game.newState();
  for (let a = 0; a < game.names.length; a++) for (let b = a + 1; b < a + 3 && b < game.names.length; b++) s = game.start(s, [game.names[a], game.names[b]], false);
  assert.ok(Object.keys(s.progress).length <= 24);
  check(game, s);
});

test('thousands of random taps never break a state', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const rnd = seeded(seed);
    const g = makeGame(DECK, rnd);
    const pick = list => list[Math.floor(rnd() * list.length)];
    let s = g.newState();
    for (let i = 0; i < 4000; i++) {
      const r = rnd();
      if (r < 0.4) s = g.next(s);
      else if (r < 0.5) s = g.prev(s);
      else if (r < 0.6) s = g.flip(s);
      else if (r < 0.65) s = g.setTapToReveal(s, rnd() < 0.5);
      else if (r < 0.75) s = g.start(s, rnd() < 0.2 ? g.names : Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pick(g.names)), rnd() < 0.3);
      else if (r < 0.85) s = g.toggleFavorite(s, g.current(s) ?? pick(g.names) + ':0');
      else if (r < 0.88) s = g.reshuffle(s);
      else if (r < 0.9) s = g.resetProgress(s);
      else if (r < 0.95) s = g.see(s, pick(g.names) + ':0');
      else { const loaded = g.restore(JSON.parse(JSON.stringify(s))); assert.deepEqual(loaded, s); s = loaded; }
      if (i % 50 === 0) check(g, s);
    }
    check(g, s);
  }
});
