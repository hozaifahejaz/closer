// Password reset links. Tokens live in a private Durable Object, hashed, for an
// hour, and work once; nothing about them is stored in the database.
import { sha256Hex } from './passwords.js';

export const RESETS = '__resets';
const TTL_MS = 60 * 60 * 1000;
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function issueReset(storage, user, now = Date.now()) {
  const token = [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('');
  const hash = await sha256Hex(token);
  // One live link per account: asking again replaces the earlier one.
  const previous = await storage.get(`user:${user}`);
  if (previous) await storage.delete(`reset:${previous}`);
  await storage.put(`reset:${hash}`, { user, expires: now + TTL_MS });
  await storage.put(`user:${user}`, hash);
  return token;
}

export async function redeemReset(storage, token, now = Date.now()) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return null;
  const hash = await sha256Hex(token);
  const entry = await storage.get(`reset:${hash}`);
  if (!entry) return null;
  await storage.delete(`reset:${hash}`);
  await storage.delete(`user:${entry.user}`);
  return entry.expires > now ? entry.user : null;
}

export async function resetsFetch(ctx, request) {
  const path = new URL(request.url).pathname;
  const body = await request.json().catch(() => ({}));
  if (path === '/issue' && typeof body.user === 'string' && body.user) return json(200, { token: await issueReset(ctx.storage, body.user) });
  if (path === '/redeem') {
    const user = await redeemReset(ctx.storage, body.token);
    return user ? json(200, { user }) : json(410, { error: 'This reset link has expired or was already used. Ask for a new one.' });
  }
  return json(404, { error: 'Not found' });
}
