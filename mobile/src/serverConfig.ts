export function resolveServer(override: string | undefined, environment: string | undefined, development: boolean) {
  const mode = environment || (development ? 'development' : 'production');
  const value = override?.trim() || (mode === 'production' ? 'https://closer.hozaiphaa.workers.dev' : '');
  if (!value) return { server: '', error: 'Set EXPO_PUBLIC_CLOSER_SERVER to your development or staging server, then reload Closer.' };
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || (mode !== 'development' && url.protocol !== 'https:')
      || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Invalid server');
    return { server: url.origin, error: '' };
  } catch { return { server: '', error: 'EXPO_PUBLIC_CLOSER_SERVER must be a server origin using HTTPS (HTTP is allowed for local development).' }; }
}

export function tokenStorageKey(server: string) {
  if (server === 'https://closer.hozaiphaa.workers.dev') return 'closer:token';
  // Hex characters avoid SecureStore's restricted key alphabet and collisions
  // between origins. Keep the original production key for existing installs.
  return 'closer.token.' + Array.from(server, c => c.codePointAt(0)!.toString(16)).join('-');
}
