import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './worker-loader.mjs';

const { game } = await loadWorker();

test('an inherited guest identity cannot reveal an unanswered partner secret', () => {
  const room = game.newRoom('DEMO');
  game.applyAction(room, 'partner-id', true, { type: 'answer', cardKey: game.cardKey(room.order[0]), text: 'Secret' });
  const state = game.publicState(room, new Map([['partner-id','A'],['constructor','B']]), 'constructor');
  assert.equal(state.myAnswer, null);
  assert.equal(state.revealed, null);
});

test('a delayed answer cannot attach itself to a newly selected card', () => {
  const room = game.newRoom('DEMO');
  const cardKey = game.cardKey(room.order[0]);
  game.applyAction(room, 'b', true, { type: 'next' });
  const result = game.applyAction(room, 'a', true, { type: 'answer', cardKey, text: 'Earlier answer' });
  assert.equal(result, false);
  assert.equal(Object.keys(room.answers).length, 0);
});

test('a stale favorite does not mark the next question', () => {
  const room = game.newRoom('DEMO');
  const cardKey = game.cardKey(room.order[0]);
  game.applyAction(room, 'b', true, { type: 'next' });
  assert.equal(game.applyAction(room, 'a', true, { type: 'favorite', cardKey }), false);
  assert.equal(room.favorites.length, 0);
});

test('malformed actions cannot crash the game', () => {
  const room = game.newRoom('DEMO');
  for (const action of [null, [], 1, 'next']) assert.equal(game.applyAction(room, 'a', true, action), false);
});
