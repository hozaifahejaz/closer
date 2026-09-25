// Minimal Supabase client over fetch (no dependencies).
// Accounts live in the app's own tables and are only reachable through the
// database functions in supabase/schema.sql. Those functions also require
// CLOSER_DB_KEY, a secret only this server knows, so the public Supabase key
// alone can't call them. Each call passes the player's session token.
const URL_ = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_ANON_KEY || '';
const SERVER_KEY = process.env.CLOSER_DB_KEY || '';

const enabled = Boolean(URL_ && KEY && SERVER_KEY);

class DbError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function rpc(fn, args = {}) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'x-closer-key': SERVER_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    // Messages raised by our own functions (P0001) are written for players; anything else isn't.
    const friendly = data?.code === 'P0001' || data?.code === '28000';
    throw new DbError(friendly ? data.message : 'Something went wrong, please try again', data?.code === '28000' ? 401 : friendly ? 400 : 500);
  }
  return data;
}

// Session lookups are cached briefly so every tap doesn't cost a database round trip.
const cache = new Map();
async function me(token, { fresh = false } = {}) {
  if (!enabled || !token) return null;
  const hit = cache.get(token);
  if (!fresh && hit && hit.until > Date.now()) return hit.state;
  let state = null;
  try { state = await rpc('my_state', { p_token: token }); }
  catch (err) { if (err.status !== 401) throw err; }
  cache.set(token, { state, until: Date.now() + 30e3 });
  if (cache.size > 1000) for (const [k, v] of cache) if (v.until < Date.now()) cache.delete(k);
  return state;
}
const forget = token => cache.delete(token);

module.exports = { enabled, rpc, me, forget, DbError };
