import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import * as Crypto from 'expo-crypto';
import { useFonts } from 'expo-font';
// One import per weight, so only these five font files ship in the app.
import { Fraunces_500Medium } from '@expo-google-fonts/fraunces/500Medium';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Account, api, ApiError } from './src/api';
import { getItem, setItem } from './src/storage';
import { colors } from './src/theme';
import type { Connection } from './src/useRoom';
import { Game } from './src/screens/Game';
import { Lobby } from './src/screens/Lobby';
import { Button } from './src/components/ui';
import { clearRoomSessions } from './src/roomSession';
import { GuestResume, readGuestResume, refreshSession } from './src/sessionRecovery';
import { CONFIG_ERROR, SERVER, TOKEN_KEY } from './src/config';

SplashScreen.preventAutoHideAsync().catch(() => {});

type Boot = { accounts: boolean; token: string | null; account: Account | null; clientId: string; name: string; notice: string; guest?: boolean; resume: GuestResume | null };

// Everything the website does on load: is the server offering accounts, is
// someone signed in on this phone, and a stable id for guest rooms.
async function boot(): Promise<Boot> {
  let clientId = await getItem('closer:id');
  if (!clientId) { clientId = Crypto.randomUUID(); await setItem('closer:id', clientId); }
  const name = (await getItem('closer:name')) || '';
  const resume = readGuestResume(await getItem('closer:guestRoom'), SERVER, clientId);
  let token = await getItem(TOKEN_KEY);
  let accounts = true;
  try { accounts = (await api<{ accounts: boolean }>('/api/config', null)).accounts; } catch {}
  let account: Account | null = null;
  let notice = '';
  if (accounts && token) {
    try { account = await api<Account>('/api/me', token); }
    catch (e) {
      // Only a rejected sign-in logs out; being offline keeps it for next time.
      if (e instanceof ApiError && e.status === 401) { token = null; await setItem(TOKEN_KEY, null); }
      notice = e instanceof Error ? e.message : '';
    }
  }
  return { accounts, token, account, clientId, name, notice, resume, guest: !!resume };
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({ Fraunces_500Medium, Fraunces_600SemiBold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  const [state, setState] = useState<Boot | null>(null);
  const [conn, setConn] = useState<Connection | null>(null);
  const [bootError, setBootError] = useState('');
  const sessionToken = useRef<string | null>(null);

  const start = useCallback(() => {
    setBootError('');
    if (CONFIG_ERROR) { setBootError(CONFIG_ERROR); return; }
    boot().then(s => { sessionToken.current = s.token; setState(s); }).catch(() => setBootError('Could not start Closer. Please try again.'));
  }, []);
  useEffect(start, [start]);
  const ready = (fontsLoaded || !!fontError) && (!!state || !!bootError);
  useEffect(() => { if (ready) SplashScreen.hideAsync().catch(() => {}); }, [ready]);

  const onSession = useCallback((token: string | null, account: Account | null, expectedToken?: string | null) => {
    if (expectedToken !== undefined && sessionToken.current !== expectedToken) return;
    sessionToken.current = token;
    if (!token) clearRoomSessions();
    setItem(TOKEN_KEY, token);
    setState(s => s && { ...s, token, account, notice: '' });
  }, []);

  const onLeave = useCallback(async (message?: string) => {
    setConn(null);
    // The room may have ended because the partner unlinked: refresh the account.
    const token = state?.token ?? null;
    const session = token ? await refreshSession(token, state?.account ?? null, () => api<Account>('/api/me', token))
      : { token: null, account: null };
    if (sessionToken.current !== token) return;
    sessionToken.current = session.token;
    if (token && !session.token) { await setItem(TOKEN_KEY, null); clearRoomSessions(); }
    // A refresh from a previous account must not replace a newer login.
    setState(s => s && s.token === token ? { ...s, ...session, notice: message || (token && !session.token ? 'Please log in again.' : '') } : s);
  }, [state?.token, state?.account]);

  const onPlay = useCallback((c: Connection) => {
    // Leaving a guest room comes back to the guest screen, not the sign-up form.
    if (c.kind === 'guest') setItem('closer:guestRoom', JSON.stringify({ ...c, server: SERVER, savedAt: Date.now() }));
    setState(s => s && { ...s, notice: '', name: c.kind === 'guest' ? c.name : s.name, guest: c.kind === 'guest', resume: c.kind === 'guest' ? c : s.resume });
    setConn(c);
  }, []);

  const forgetResume = useCallback(() => {
    setItem('closer:guestRoom', null);
    setState(s => s && { ...s, resume: null });
  }, []);

  return (
    <SafeAreaProvider style={{ backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      {!ready ? (
        <View style={st.boot}><ActivityIndicator color={colors.accent} /></View>
      ) : bootError || !state ? (
        <View style={st.boot}><Text style={{ color: colors.text, marginBottom: 16 }}>{bootError}</Text><Button title="Try again" onPress={start} /></View>
      ) : conn ? (
        <Game conn={conn} onLeave={onLeave} />
      ) : (
        <Lobby accounts={state.accounts} token={state.token} account={state.account} clientId={state.clientId} savedName={state.name} startAsGuest={!!state.guest}
          notice={state.notice} onSession={onSession} onPlay={onPlay} resume={state.resume} onForgetResume={forgetResume} />
      )}
    </SafeAreaProvider>
  );
}

const st = StyleSheet.create({ boot: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' } });
