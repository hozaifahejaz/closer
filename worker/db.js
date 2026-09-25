// Minimal Supabase client over fetch.
// Accounts live in the app's own tables and are only reachable through the
// database functions in supabase/schema.sql. Those functions also require
// CLOSER_DB_KEY, a secret only this Worker knows, so the public Supabase key
// alone can't call them. Each call passes the player's session token.
export class DbError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export class Db {
  constructor(env) {
    this.url = (env.SUPABASE_URL || '').replace(/\/$/, '');
    this.key = env.SUPABASE_ANON_KEY || '';
    this.serverKey = env.CLOSER_DB_KEY || '';
    this.enabled = Boolean(this.url && this.key && this.serverKey);
  }

  async rpc(fn, args = {}) {
    const res = await fetch(`${this.url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, 'x-closer-key': this.serverKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) {
      // Messages raised by our own functions (P0001) are written for players; anything else isn't.
      const friendly = data?.code === 'P0001' || data?.code === '28000';
      throw new DbError(friendly ? data.message : 'Something went wrong, please try again', data?.code === '28000' ? 401 : friendly ? 400 : 500);
    }
    return data;
  }

  // The signed-in player's profile and partner, or null if the session is gone.
  async me(token) {
    if (!this.enabled || !token) return null;
    try { return await this.rpc('my_state', { p_token: token }); }
    catch (err) { if (err.status === 401) return null; throw err; }
  }
}
