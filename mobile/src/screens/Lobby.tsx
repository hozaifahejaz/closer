import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, ScrollView, Share, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Account, api, ApiError } from '../api';
import { WEBSITE } from '../config';
import { setItem } from '../storage';
import { cardGradient, colors, fonts, radius } from '../theme';
import type { Connection } from '../useRoom';
import { Icon, IconName } from '../components/Icon';
import { Button, Field, HeartBadge, Or, Segmented } from '../components/ui';

type Props = {
  accounts: boolean; // false when the server has accounts switched off: guest rooms only
  token: string | null;
  account: Account | null;
  clientId: string;
  savedName: string;
  notice: string; // e.g. "This room was closed", shown once when coming back from a room
  onSession: (token: string | null, account: Account | null) => void;
  onPlay: (conn: Connection) => void;
};

export function Lobby({ accounts, token, account, clientId, savedName, notice, onSession, onPlay }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [guest, setGuest] = useState(!accounts);
  const [signup, setSignup] = useState(true);
  const [name, setName] = useState(savedName);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [partnerCode, setPartnerCode] = useState('');
  const [err, setErr] = useState(notice);
  const [busy, setBusy] = useState('');
  const pw = useRef<TextInput>(null);
  const mail = useRef<TextInput>(null);

  useEffect(() => { setErr(notice); }, [notice]);
  useEffect(() => { if (!accounts) setGuest(true); }, [accounts]);

  const fail = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401 && token) onSession(null, null);
    setErr(e instanceof Error ? e.message : 'Something went wrong, please try again');
  };
  const run = async (what: string, f: () => Promise<void>) => {
    setErr(''); setBusy(what);
    try { await f(); } catch (e) { fail(e); } finally { setBusy(''); }
  };

  // Notice when the partner types in our code on their phone.
  const waitingForPartner = !!account && !account.partner;
  useEffect(() => {
    if (!waitingForPartner || !token) return;
    const t = setInterval(async () => {
      try { const m = await api<Account>('/api/me', token); if (m.partner) onSession(token, m); } catch {}
    }, 4000);
    return () => clearInterval(t);
  }, [waitingForPartner, token, onSession]);

  const auth = () => run('auth', async () => {
    if (signup && !name.trim()) throw new Error('Add your name first.');
    if (!email.trim()) throw new Error('Add your email.');
    const r = await api<{ token: string; me: Account }>(signup ? '/api/signup' : '/api/login', null, { email: email.trim(), password, name: name.trim() });
    setPassword('');
    onSession(r.token, r.me);
  });

  const guestName = async () => {
    const n = name.trim();
    if (!n) throw new Error('Add your name first.');
    await setItem('closer:name', n);
    return n;
  };
  const create = () => run('create', async () => {
    const n = await guestName();
    const r = await api<{ code: string }>('/api/rooms', null, {});
    onPlay({ kind: 'guest', code: r.code, name: n, id: clientId });
  });
  const join = () => run('join', async () => {
    const n = await guestName();
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 4) throw new Error('Room codes are 4 letters.');
    try { await api(`/api/rooms/${code}`, null); } catch (e) { throw e instanceof ApiError && e.status === 404 ? new Error('No room with that code.') : e; }
    onPlay({ kind: 'guest', code, name: n, id: clientId });
  });

  const linkPartner = () => run('link', async () => {
    const code = partnerCode.trim().toUpperCase();
    if (code.length !== 6) throw new Error('Partner codes are 6 letters.');
    await api('/api/link', token, { code });
    onSession(token, await api<Account>('/api/me', token));
  });
  const shareCode = async () => {
    if (!account) return;
    try { await Share.share({ message: `Join me on Closer! Get the app or go to ${WEBSITE}, sign up, and enter my code: ${account.inviteCode}` }); } catch {}
  };
  const logout = () => run('logout', async () => {
    try { await api('/api/logout', token, {}); } catch {}
    onSession(null, null);
  });
  const unlink = () => {
    if (!account?.partner) return;
    Alert.alert(`Unlink from ${account.partner.name}?`, 'Your saved answers stay saved.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unlink', style: 'destructive', onPress: () => run('unlink', async () => {
        await api('/api/unlink', token, {});
        onSession(token, await api<Account>('/api/me', token));
      }) },
    ]);
  };

  const wide = width >= 820;
  const view = account ? (account.partner ? 'home' : 'link') : guest ? 'guest' : 'auth';

  const panel = (
    <View style={st.panel}>
      {view === 'auth' && (
        <View style={st.stack}>
          <Segmented value={signup ? 'signup' : 'login'} onChange={v => { setSignup(v === 'signup'); setErr(''); }}
            options={[{ value: 'signup', label: 'Sign up' }, { value: 'login', label: 'Log in' }]} />
          {signup ? <Field label="Your name" value={name} onChangeText={setName} maxLength={24} placeholder="e.g. Sam" autoComplete="given-name"
            textContentType="givenName" returnKeyType="next" onSubmitEditing={() => mail.current?.focus()} /> : null}
          <View>
            <Text style={st.label}>Email</Text>
            <TextInput ref={mail} value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none"
              autoCorrect={false} autoComplete="email" textContentType="emailAddress" returnKeyType="next" onSubmitEditing={() => pw.current?.focus()}
              placeholderTextColor={colors.faint} selectionColor={colors.accent} keyboardAppearance="dark" style={st.input} />
          </View>
          <View>
            <Text style={st.label}>Password</Text>
            <TextInput ref={pw} value={password} onChangeText={setPassword} secureTextEntry placeholder={signup ? 'At least 6 characters' : 'Your password'}
              autoComplete={signup ? 'new-password' : 'current-password'} textContentType={signup ? 'newPassword' : 'password'} returnKeyType="go" onSubmitEditing={auth}
              placeholderTextColor={colors.faint} selectionColor={colors.accent} keyboardAppearance="dark" style={st.input} />
          </View>
          <Button title={signup ? 'Create account' : 'Log in'} onPress={auth} busy={busy === 'auth'} />
          {signup ? (
            <Text style={st.hint}>By signing up you agree to our{' '}
              <Text style={st.a} onPress={() => Linking.openURL(`${WEBSITE}/privacy`)} accessibilityRole="link">privacy policy</Text>.</Text>
          ) : null}
          <Or>or</Or>
          <Button kind="ghost" title="Play as a guest" onPress={() => { setGuest(true); setErr(''); }} />
        </View>
      )}

      {view === 'guest' && (
        <View style={st.stack}>
          <Field label="Your name" value={name} onChangeText={setName} maxLength={24} placeholder="e.g. Sam" autoComplete="given-name" textContentType="givenName" />
          <Button title="Start a new room" onPress={create} busy={busy === 'create'} />
          <Or>or join your partner</Or>
          <View style={st.row}>
            <TextInput value={joinCode} onChangeText={t => setJoinCode(t.toUpperCase().replace(/[^A-Z]/g, ''))} maxLength={4} placeholder="CODE"
              autoCapitalize="characters" autoCorrect={false} returnKeyType="join" onSubmitEditing={join} accessibilityLabel="Room code"
              placeholderTextColor={colors.faint} selectionColor={colors.accent} keyboardAppearance="dark" style={[st.input, st.code]} />
            <Button kind="ghost" title="Join" onPress={join} busy={busy === 'join'} style={{ minWidth: 92 }} />
          </View>
          {accounts ? <Button kind="link" title="Sign up or log in instead" onPress={() => { setGuest(false); setErr(''); }} /> : null}
        </View>
      )}

      {view === 'link' && account && (
        <View style={st.stack}>
          <Text style={st.hello}>Hi {account.name}! Link with your partner</Text>
          <View>
            <Text style={st.label}>Your code: send it to your partner</Text>
            <View style={st.row}>
              <View style={st.bigcode}><Text style={st.bigcodeText} selectable>{account.inviteCode}</Text></View>
              <Button kind="ghost" title="Share" icon="share" onPress={shareCode} />
            </View>
          </View>
          <Or>or enter theirs</Or>
          <View style={st.row}>
            <TextInput value={partnerCode} onChangeText={t => setPartnerCode(t.toUpperCase().replace(/[^A-Z]/g, ''))} maxLength={6} placeholder="CODE"
              autoCapitalize="characters" autoCorrect={false} returnKeyType="done" onSubmitEditing={linkPartner} accessibilityLabel="Partner's code"
              placeholderTextColor={colors.faint} selectionColor={colors.accent} keyboardAppearance="dark" style={[st.input, st.code]} />
            <Button kind="ghost" title="Link" onPress={linkPartner} busy={busy === 'link'} style={{ minWidth: 92 }} />
          </View>
          <Text style={st.hint}>You only do this once. After that you'll always land in your shared room.</Text>
          <Button kind="link" title="Log out" onPress={logout} />
        </View>
      )}

      {view === 'home' && account?.partner && (
        <View style={st.stack}>
          <View style={st.couple}>
            <View style={st.avatars}>
              <View style={st.avatar}><Text style={st.avatarText}>{account.name.slice(0, 1).toUpperCase()}</Text></View>
              <View style={[st.avatar, st.avatar2]}><Text style={st.avatarText}>{account.partner.name.slice(0, 1).toUpperCase()}</Text></View>
            </View>
            <Text style={st.hello}>You & {account.partner.name}</Text>
          </View>
          <Button title="Open our cards" iconRight="right" onPress={() => onPlay({ kind: 'couple', token: token!, name: account.name })} />
          <Text style={st.hint}>Your answers and favorites are saved to your account.</Text>
          <View style={st.links}>
            <Button kind="link" title="Unlink partner" onPress={unlink} />
            <Button kind="link" title="Log out" onPress={logout} />
          </View>
        </View>
      )}

      {err ? <Text style={st.err} accessibilityRole="alert">{err}</Text> : null}
    </View>
  );

  return (
    <KeyboardAvoidingView style={st.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        contentContainerStyle={[st.page, wide && st.pageWide, {
          paddingTop: insets.top + (height > 700 ? 36 : 16), paddingBottom: insets.bottom + 24,
          paddingLeft: Math.max(insets.left, 18), paddingRight: Math.max(insets.right, 18),
        }]}>
        <Hero wide={wide} compact={height < 640 && !wide} />
        {panel}
        <Text style={st.foot} onPress={() => Linking.openURL(`${WEBSITE}/privacy`)} accessibilityRole="link">Privacy policy</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const PERKS: [IconName, string, string][] = [
  ['sync', 'Always in sync', 'Flip, skip or change the topic, and your partner sees it instantly.'],
  ['chat', 'Just talk, or answer & reveal', "Write privately, then see each other's answers once you've both answered."],
  ['heart', 'Your story, saved', 'With an account, your answers and favorites stay with you.'],
];

function Hero({ wide, compact }: { wide: boolean; compact: boolean }) {
  return (
    <View style={[st.hero, wide && st.heroWide]}>
      <View style={st.logo}><HeartBadge size={compact ? 34 : 42} /><Text style={[st.h1, compact && { fontSize: 34 }]}>Closer</Text></View>
      <Text style={[st.sub, wide && { textAlign: 'left' }]}>Deep questions for two. Same card, same moment, wherever you are.</Text>
      {!compact && !wide ? <MiniDeck /> : null}
      {wide ? (
        <View style={{ marginTop: 28, gap: 18 }}>
          {PERKS.map(([icon, title, body]) => (
            <View key={title} style={st.perk}>
              <View style={st.perkIcon}><Icon name={icon} size={18} color={colors.accent2} /></View>
              <View style={{ flex: 1 }}><Text style={st.perkTitle}>{title}</Text><Text style={st.perkBody}>{body}</Text></View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// A small fanned stack of cards, like the website's hero.
function MiniDeck() {
  return (
    <View style={st.mini} accessible={false} importantForAccessibility="no-hide-descendants">
      <LinearGradient colors={cardGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[st.miniCard, { transform: [{ rotate: '-9deg' }, { translateX: -38 }], opacity: 0.7 }]} />
      <LinearGradient colors={cardGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[st.miniCard, st.miniBack, { transform: [{ rotate: '8deg' }, { translateX: 38 }] }]}>
        <Icon name="heart" size={22} color="#fff" strokeWidth={1.5} />
      </LinearGradient>
      <View style={[st.miniCard, st.miniFront]}>
        <Text style={st.miniCat}>GETTING CLOSER</Text>
        <Text style={st.miniQ}>What's a moment with me you replay when you miss me?</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  page: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 24 },
  pageWide: { flexDirection: 'row', flexWrap: 'wrap', gap: 64 },
  hero: { alignItems: 'center', maxWidth: 440 },
  heroWide: { alignItems: 'flex-start', maxWidth: 460, flexShrink: 1 },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  h1: { fontFamily: fonts.serifBold, fontSize: 44, color: colors.text, letterSpacing: -0.8 },
  sub: { marginTop: 10, fontFamily: fonts.sans, fontSize: 16, lineHeight: 23, color: colors.muted, textAlign: 'center', maxWidth: 340 },
  perk: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  perkIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  perkTitle: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.text },
  perkBody: { marginTop: 2, fontFamily: fonts.sans, fontSize: 15, lineHeight: 22, color: '#d9c8d5' },
  mini: { marginTop: 22, width: 260, height: 150, alignItems: 'center', justifyContent: 'center' },
  miniCard: { position: 'absolute', width: 150, height: 140, borderRadius: 16 },
  miniBack: { alignItems: 'flex-end', justifyContent: 'center', paddingRight: 14 },
  miniFront: { backgroundColor: colors.card, padding: 14, justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  miniCat: { fontFamily: fonts.sansBold, fontSize: 8.5, letterSpacing: 1.2, color: colors.rose, textAlign: 'center', marginBottom: 8 },
  miniQ: { fontFamily: fonts.serif, fontSize: 14, lineHeight: 18, color: colors.ink, textAlign: 'center' },
  panel: { width: '100%', maxWidth: 420, backgroundColor: 'rgba(42,28,46,0.92)', borderWidth: 1, borderColor: colors.line, borderRadius: radius.panel, padding: 22 },
  stack: { gap: 14 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  label: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.muted, marginBottom: 6 },
  input: { minHeight: 50, borderRadius: radius.control - 2, backgroundColor: colors.bg3, borderWidth: 1, borderColor: colors.line, color: colors.text,
    paddingHorizontal: 14, fontFamily: fonts.sans, fontSize: 16 },
  code: { flex: 1, minWidth: 0, textAlign: 'center', fontFamily: fonts.sansBold, fontSize: 18, letterSpacing: 5 },
  bigcode: { flex: 1, minHeight: 52, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.accent, backgroundColor: colors.bg3, alignItems: 'center', justifyContent: 'center' },
  bigcodeText: { fontFamily: fonts.sansBold, fontSize: 24, letterSpacing: 7, color: colors.text, paddingLeft: 7 },
  hint: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, color: colors.muted, textAlign: 'center' },
  a: { color: colors.accent2, textDecorationLine: 'underline' },
  hello: { fontFamily: fonts.serifBold, fontSize: 22, lineHeight: 28, color: colors.text, textAlign: 'center' },
  couple: { alignItems: 'center', gap: 12, paddingTop: 4 },
  avatars: { flexDirection: 'row' },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.rose, borderWidth: 3, borderColor: colors.bg2, alignItems: 'center', justifyContent: 'center' },
  avatar2: { backgroundColor: colors.plum, marginLeft: -14 },
  avatarText: { fontFamily: fonts.serifBold, fontSize: 21, color: '#fff' },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 18, flexWrap: 'wrap' },
  err: { marginTop: 14, fontFamily: fonts.sansMedium, fontSize: 14, lineHeight: 20, color: colors.bad, textAlign: 'center' },
  foot: { fontFamily: fonts.sans, fontSize: 13, color: colors.faint, textDecorationLine: 'underline', width: '100%', textAlign: 'center' },
});
