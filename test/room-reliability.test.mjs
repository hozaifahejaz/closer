import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker, MemoryStorage } from './worker-loader.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const cid = `${A}:${B}`;
const code = `couple:${cid}`;
const { Room, game } = await loadWorker({ WebSocket: { OPEN: 1 } });

async function fixture({ storage = new MemoryStorage(), valid = true, offline = false } = {}) {
  let init;
  const pending = [];
  const frames = [];
  const player = { id: A, name: 'A', token: 'session-a' };
  const ws = { readyState: 1, deserializeAttachment: () => player, serializeAttachment: x => Object.assign(player,x),
    send: data => frames.push(JSON.parse(data)), close: () => { ws.readyState = 3; } };
  const ctx = { storage, id: { equals: () => false }, blockConcurrencyWhile: fn => { init = fn(); },
    waitUntil: p => pending.push(p), getWebSockets: () => [ws].filter(s => s.readyState === 1) };
  const env = { ROOMS: { idFromName: n => n, get: () => ({ fetch: async () => Response.json({}) }) } };
  const room = new Room(ctx, env);
  await init;
  room.room ||= game.newRoom(code, cid);
  const backend = new Map();
  room.db = { me: async () => valid ? { id: A, couple_id: cid } : null,
    rpc: async (fn,args) => {
      if (fn === 'record_activity') return;
      if (offline) throw new Error('Temporary outage');
      if (fn === 'persist_room_change') backend.set(args.p_id, args);
      return { applied: true };
    } };
  const settle = async () => { while (pending.length) await Promise.allSettled(pending.splice(0)); };
  return { room, ws, storage, frames, backend, settle, online: () => { offline = false; }, revoke: () => { valid = false; } };
}

test('a revoked socket cannot mutate or receive private room state', async () => {
  const f = await fixture({ valid: false });
  await f.room.webSocketMessage(f.ws, JSON.stringify({ type:'answer', id:crypto.randomUUID(), generation:0, cardKey:game.cardKey(f.room.room.order[0]), text:'Revoked text' }));
  await f.settle();
  assert.equal(Object.keys(f.room.room.answers).length, 0);
  assert.equal(f.ws.readyState, 3);
  assert.equal(f.frames.some(x=>x.card), false);
});

test('retrying one favorite command never toggles it a second time', async () => {
  const f = await fixture();
  const action = { type:'favorite', id:crypto.randomUUID(), generation:0, cardKey:game.cardKey(f.room.room.order[0]) };
  await f.room.webSocketMessage(f.ws, JSON.stringify(action));
  await f.room.webSocketMessage(f.ws, JSON.stringify(action));
  await f.settle();
  assert.equal(f.room.room.favorites.length, 1);
  assert.equal(f.frames.filter(x=>x.type==='ack' && x.id===action.id && x.ok).length, 2);
});

test('an accepted answer remains durable and retries after a database outage', async () => {
  const f = await fixture({ offline:true });
  const action = { type:'answer', id:crypto.randomUUID(), generation:0, cardKey:game.cardKey(f.room.room.order[0]), text:'Keep this answer' };
  await f.room.webSocketMessage(f.ws, JSON.stringify(action));
  await f.settle();
  assert.equal(f.frames.some(x=>x.type==='ack' && x.id===action.id && x.ok), true);
  const restored = await fixture({ storage:f.storage });
  assert.equal(restored.room.room.answers[action.cardKey][A], 'Keep this answer');
  await restored.room.alarm();
  await restored.settle();
  assert.equal([...restored.backend.values()].some(x=>x.p_text==='Keep this answer' && x.p_couple_id===cid), true);
});

test('valid full answer histories are saved in values smaller than 2 MB', async () => {
  const f = await fixture();
  for(const card of f.room.room.order) f.room.room.answers[game.cardKey(card)] = { [A]:'a'.repeat(1000), [B]:'b'.repeat(1000) };
  await f.room.save();
  const restored = await fixture({ storage:f.storage });
  assert.equal(Object.keys(restored.room.room.answers).length, 1378);
  assert.equal(restored.room.room.answers[game.cardKey(restored.room.room.order[0])][B].length, 1000);
});

test('legacy room storage migrates while retaining answers and saved progress', async () => {
  const legacy = game.newRoom(code,cid);
  const key = game.cardKey(legacy.order[0]);
  legacy.answers[key] = { [A]:'Existing answer' };
  legacy.progress['Getting Closer'] = { order:[{c:'Getting Closer',i:0}], index:0 };
  const f = await fixture({ storage:new MemoryStorage([['room',legacy]]) });
  await f.room.save();
  const restored = await fixture({ storage:f.storage });
  assert.equal(restored.room.room.answers[key][A], 'Existing answer');
  assert.equal(restored.room.room.progress['Getting Closer'].index, 0);
  assert.equal((await f.storage.get('room')).answers, undefined);
});

test('failed durable storage does not leave an unaccepted favorite toggled', async () => {
  const f = await fixture();
  const action = { type:'favorite', id:crypto.randomUUID(), generation:0, cardKey:game.cardKey(f.room.room.order[0]) };
  const transaction = f.storage.transaction.bind(f.storage);
  f.storage.transaction = async () => { throw new Error('Storage unavailable'); };
  await f.room.webSocketMessage(f.ws,JSON.stringify(action)).catch(()=>{});
  assert.equal(f.room.room.favorites.length,0);
  f.storage.transaction = transaction;
  await f.room.webSocketMessage(f.ws,JSON.stringify(action));
  await f.settle();
  assert.equal(f.room.room.favorites.length,1);
});

test('database retries remain ordered when an earlier write fails', async () => {
  const f = await fixture({ offline:true });
  const cardKey = game.cardKey(f.room.room.order[0]);
  for(let i=0;i<2;i++) {
    await f.room.webSocketMessage(f.ws,JSON.stringify({type:'favorite',id:crypto.randomUUID(),generation:0,cardKey}));
    await f.settle();
  }
  f.online();
  await f.room.alarm();
  await f.settle();
  assert.deepEqual([...f.backend.values()].map(x=>x.p_on),[true,false]);
  assert.equal((await f.storage.list({prefix:'pending:'})).size,0);
});

test('closing a couple room retains acknowledged saves waiting for the database', async () => {
  const f = await fixture({ offline:true });
  const action = { type:'answer', id:crypto.randomUUID(), generation:0, cardKey:game.cardKey(f.room.room.order[0]), text:'Keep queued answer' };
  await f.room.webSocketMessage(f.ws, JSON.stringify(action));
  await f.settle();
  await f.room.fetch(new Request('https://room/admin/close',{method:'POST',body:'{}'}));
  const restored = await fixture({ storage:f.storage });
  assert.equal(restored.room.room.answers[action.cardKey]?.[A],action.text);
  await restored.room.alarm();
  assert.equal([...restored.backend.values()][0]?.p_text,action.text);
});

test('room hydration rejects answers belonging to a different current couple', async () => {
  const f = await fixture();
  f.room.room = null;
  f.room.db.rpc = async () => ({couple_id:'another-couple',generation:0,answers:[{card_key:'x:0',user_id:B,text:'Other couple secret'}],favorites:[]});
  const response = await f.room.fetch(new Request('https://room/ws',{headers:{Upgrade:'websocket','x-player-id':A,'x-player-token':'session-a','x-couple-id':cid}}));
  assert.equal(response.status,409);
  assert.equal(f.room.room,null);
  assert.equal(await f.storage.get('room'),undefined);
});

test('transient authorization failure closes the socket so pending commands retry',async()=>{
  const f = await fixture();
  let closed;
  f.ws.close = code => { closed=code; f.ws.readyState=3; };
  f.room.db.me=async()=>{throw new Error('Database unavailable');};
  await f.room.webSocketMessage(f.ws,JSON.stringify({type:'favorite',id:crypto.randomUUID(),generation:0,cardKey:game.cardKey(f.room.room.order[0])}));
  assert.equal(closed,1012);
  assert.equal(f.room.room.favorites.length,0);
});

test('a pending command from before data deletion cannot recreate content',async()=>{
  const f=await fixture();
  f.room.room.generation=1;
  const action={type:'answer',id:crypto.randomUUID(),generation:0,cardKey:game.cardKey(f.room.room.order[0]),text:'Previously deleted'};
  await f.room.webSocketMessage(f.ws,JSON.stringify(action));
  await f.settle();
  assert.equal(Object.keys(f.room.room.answers).length,0);
  assert.equal(f.frames.some(x=>x.type==='ack'&&x.id===action.id&&!x.ok),true);
});
