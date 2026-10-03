import assert from 'node:assert/strict';
import test from 'node:test';
import { RoomSession, roomSession, clearRoomSessions, decodeRoomMessage } from '../src/roomSession.ts';
import { refreshSession, readGuestResume } from '../src/sessionRecovery.ts';

test('moving between questions retains each unfinished answer', () => {
  const room = new RoomSession();
  room.setDraft('Getting Closer:0', 'Our first date');
  room.setDraft('Getting Closer:1', 'Sunday mornings');
  assert.equal(room.getDraft('Getting Closer:0'), 'Our first date');
  assert.equal(room.getDraft('Getting Closer:1'), 'Sunday mornings');
});

test('sending and reconnecting preserves the draft and replays the same action ID', () => {
  const room = new RoomSession();
  room.setDraft('Getting Closer:0', 'Our first date');
  room.queue({ type: 'answer', id: 'attempt-1', cardKey: 'Getting Closer:0', generation: 0, text: 'Our first date' });
  assert.equal(room.getDraft('Getting Closer:0'), 'Our first date');
  assert.deepEqual(room.pendingActions(), [{ type: 'answer', id: 'attempt-1', cardKey: 'Getting Closer:0', generation: 0, text: 'Our first date' }]);
  assert.deepEqual(room.pendingActions(), [{ type: 'answer', id: 'attempt-1', cardKey: 'Getting Closer:0', generation: 0, text: 'Our first date' }]);
});

test('acknowledging an earlier card clears only that accepted answer', () => {
  const room = new RoomSession();
  room.setDraft('Getting Closer:0', 'First');
  room.setDraft('Getting Closer:1', 'Second');
  room.queue({ type: 'answer', id: 'attempt-1', cardKey: 'Getting Closer:0', generation: 0, text: 'First' });
  room.acknowledge({ type: 'ack', id: 'attempt-1', ok: true, cardKey: 'Getting Closer:0' });
  assert.equal(room.getDraft('Getting Closer:0'), '');
  assert.equal(room.getDraft('Getting Closer:1'), 'Second');
  assert.deepEqual(room.pendingActions(), []);
});

test('a rejected answer stays editable and is not automatically resent', () => {
  const room = new RoomSession();
  room.setDraft('Getting Closer:0', 'Keep this answer');
  room.queue({ type: 'answer', id: 'attempt-1', cardKey: 'Getting Closer:0', generation: 0, text: 'Keep this answer' });
  const rejected = room.acknowledge({ type: 'ack', id: 'attempt-1', ok: false, error: 'Question changed' });
  assert.equal(rejected?.cardKey, 'Getting Closer:0');
  assert.equal(room.getDraft('Getting Closer:0'), 'Keep this answer');
  assert.deepEqual(room.pendingActions(), []);
});

test('duplicate taps cannot queue a second favorite toggle before acknowledgement', () => {
  const room = new RoomSession();
  assert.equal(room.queue({ type: 'favorite', id: 'favorite-1', cardKey: 'Getting Closer:0' }), true);
  assert.equal(room.queue({ type: 'favorite', id: 'favorite-2', cardKey: 'Getting Closer:0' }), false);
  assert.equal(room.pendingActions().length, 1);
});

test('late acknowledgements cannot erase a newer draft or match another action', () => {
  const room = new RoomSession();
  room.setDraft('Getting Closer:0', 'Original');
  room.queue({ type: 'answer', id: 'attempt-1', cardKey: 'Getting Closer:0', generation: 0, text: 'Original' });
  room.setDraft('Getting Closer:0', 'New thought');
  room.acknowledge({ type: 'ack', id: 'unknown', ok: true });
  assert.equal(room.pendingActions().length, 1);
  room.acknowledge({ type: 'ack', id: 'attempt-1', ok: true });
  assert.equal(room.getDraft('Getting Closer:0'), 'New thought');
});

test('revoked session clears both token and account on returning from a room', async () => {
  const state = await refreshSession('revoked', { id: 'user-a' }, async () => { throw { status: 401 }; });
  assert.deepEqual(state, { token: null, account: null });
});

test('a temporary network failure preserves the signed-in account', async () => {
  const state = await refreshSession('valid', { id: 'user-a' }, async () => { throw { status: 0 }; });
  assert.deepEqual(state, { token: 'valid', account: { id: 'user-a' } });
});

test('room drafts survive screen remounts but never cross players or rooms', () => {
  clearRoomSessions();
  roomSession('player-a', 'room-a').setDraft('Deck:0', 'Private draft');
  assert.equal(roomSession('player-a', 'room-a').getDraft('Deck:0'), 'Private draft');
  assert.equal(roomSession('player-b', 'room-a').getDraft('Deck:0'), '');
  assert.equal(roomSession('player-a', 'room-b').getDraft('Deck:0'), '');
  clearRoomSessions();
  assert.equal(roomSession('player-a', 'room-a').getDraft('Deck:0'), '');
});

test('ack frames are identified separately from state and malformed frames ignored', () => {
  assert.equal(decodeRoomMessage('{"type":"ack","id":"a-1","ok":true}')?.kind, 'ack');
  assert.equal(decodeRoomMessage('{"type":"ack","id":"a-1","ok":"yes"}'), null);
  assert.equal(decodeRoomMessage('not json'), null);
  assert.equal(decodeRoomMessage('{"code":"ABCD"}'), null);
});

test('guest resume survives restart without crossing servers, players or expired rooms', () => {
  const stored = JSON.stringify({ code: 'ABCD', name: 'Sam', id: 'guest-a', server: 'https://stage.example', savedAt: 1000 });
  assert.deepEqual(readGuestResume(stored, 'https://stage.example', 'guest-a', 2000), { kind: 'guest', code: 'ABCD', name: 'Sam', id: 'guest-a' });
  assert.equal(readGuestResume(stored, 'https://live.example', 'guest-a', 2000), null);
  assert.equal(readGuestResume(stored, 'https://stage.example', 'guest-b', 2000), null);
  assert.equal(readGuestResume(stored, 'https://stage.example', 'guest-a', 7 * 3600_000), null);
  assert.equal(readGuestResume('broken', 'https://stage.example', 'guest-a', 2000), null);
});

test('retry after a data reset keeps the original generation so deleted answers cannot return', () => {
  clearRoomSessions();
  const before = roomSession('user-a', 'couple-a');
  before.setDraft('Deck:0', 'Sensitive answer');
  before.queue({ type: 'answer', id: 'attempt-old', cardKey: 'Deck:0', generation: 3, text: 'Sensitive answer' });
  const reconnected = roomSession('user-a', 'couple-a');
  assert.equal(reconnected.pendingActions()[0].generation, 3);
  reconnected.acknowledge({ type: 'ack', id: 'attempt-old', ok: false, error: 'Saved data changed', cardKey: 'Deck:0' });
  assert.equal(reconnected.getDraft('Deck:0'), 'Sensitive answer');
  assert.deepEqual(reconnected.pendingActions(), []);
});

test('room state must advertise a valid deletion generation before commands can be sent', () => {
  const base = { protocolVersion: 2, roomId: 'ABCD', card: { id: 'Deck:0', text: 'Question?' }, partners: [], decks: [], deckList: [], favorites: [], saved: {} };
  assert.equal(decodeRoomMessage(JSON.stringify(base)), null);
  assert.equal(decodeRoomMessage(JSON.stringify({ ...base, generation: -1 })), null);
  assert.equal(decodeRoomMessage(JSON.stringify({ ...base, generation: 0.5 })), null);
  assert.equal(decodeRoomMessage(JSON.stringify({ ...base, generation: 0 }))?.kind, 'state');
});
