// Each answer and saved deck order has its own storage entry. Large histories
// must not grow the single metadata value past the Durable Object value limit.
export async function listEntries(storage, prefix) {
  const entries = new Map();
  let startAfter;
  for (;;) {
    const batch = await storage.list({ prefix, limit: 1000, ...(startAfter ? { startAfter } : {}) });
    for (const [key, value] of batch) entries.set(key, value);
    if (batch.size < 1000) return entries;
    startAfter = [...batch.keys()].at(-1);
  }
}

export class RoomStorage {
  constructor(storage) { this.storage = storage; this.cache = new Map(); }

  async load() {
    const room = await this.storage.get('room');
    if (!room || room.storageVersion !== 2) return room || null;
    room.answers = {};
    room.progress = {};
    room.names = {};
    for (const prefix of ['answer:', 'progress:', 'name:']) {
      for (const [key, value] of await listEntries(this.storage, prefix)) {
        this.cache.set(key, JSON.stringify(value));
        if (prefix === 'answer:') {
          const [card, player] = key.slice(prefix.length).split(':').map(decodeURIComponent);
          room.answers[card] = { ...room.answers[card], [player]: value };
        } else room[prefix === 'progress:' ? 'progress' : 'names'][decodeURIComponent(key.slice(prefix.length))] = value;
      }
    }
    return room;
  }

  async save(room, extras = {}) {
    const { answers = {}, progress = {}, names = {}, ...metadata } = room;
    const next = new Map();
    for (const [card, values] of Object.entries(answers)) for (const [player, answer] of Object.entries(values))
      next.set(`answer:${encodeURIComponent(card)}:${encodeURIComponent(player)}`, answer);
    for (const [key, value] of Object.entries(progress)) next.set(`progress:${encodeURIComponent(key)}`, value);
    for (const [key, value] of Object.entries(names)) next.set(`name:${encodeURIComponent(key)}`, value);
    const serialized = new Map([...next].map(([key,value]) => [key,JSON.stringify(value)]));
    await this.storage.transaction(async txn => {
      for (const [key, value] of next) if (serialized.get(key) !== this.cache.get(key)) await txn.put(key, value);
      for (const key of this.cache.keys()) if (!next.has(key)) await txn.delete(key);
      for (const [key,value] of Object.entries(extras)) await txn.put(key,value);
      await txn.put('room', { ...metadata, storageVersion: 2 });
    });
    this.cache = serialized;
  }
}
