export type GuestResume = { kind: 'guest'; code: string; name: string; id: string };
export function readGuestResume(raw: string | null, server: string, id: string, now = Date.now()): GuestResume | null {
  try {
    const saved = JSON.parse(raw || 'null');
    if (saved?.server !== server || saved?.id !== id || typeof saved.code !== 'string' || !/^[A-Z]{4}$/.test(saved.code)
      || typeof saved.name !== 'string' || !saved.name.trim() || typeof saved.savedAt !== 'number'
      || now - saved.savedAt > 6 * 3600_000 || saved.savedAt > now) return null;
    return { kind: 'guest', code: saved.code, name: saved.name, id };
  } catch { return null; }
}

export async function refreshSession<T>(token: string, account: T | null, fetchAccount: () => Promise<T>) {
  try { return { token, account: await fetchAccount() }; }
  catch (error) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 401) {
      return { token: null, account: null };
    }
    return { token, account };
  }
}
