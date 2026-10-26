// Password hashing with the platform's Web Crypto (PBKDF2-SHA256), stored as
// "pbkdf2-sha256$<iterations>$<salt>$<hash>". Passwords saved before the move to
// D1 are bcrypt hashes; they still work and are re-hashed on the next log-in.
import { compareSync as bcryptCompare } from './vendor/bcrypt.js';

const ITERATIONS = 100000; // Cloudflare's Web Crypto maximum
const enc = new TextEncoder();
const b64 = bytes => btoa(String.fromCharCode(...bytes));
const unb64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${ITERATIONS}$${b64(salt)}$${b64(await derive(password, salt, ITERATIONS))}`;
}

// { ok, rehash }: rehash is true when the stored hash should be replaced.
export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return { ok: false };
  if (stored.startsWith('$2')) {
    const ok = bcryptCompare(password, stored);
    return { ok, rehash: ok };
  }
  const [scheme, iterations, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2-sha256' || !hash) return { ok: false };
  const expected = unb64(hash);
  const actual = await derive(password, unb64(salt), Number(iterations));
  let diff = expected.length ^ actual.length;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ actual[i];
  return { ok: diff === 0, rehash: diff === 0 && Number(iterations) !== ITERATIONS };
}

export async function sha256Hex(text) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
  return [...digest].map(b => b.toString(16).padStart(2, '0')).join('');
}
