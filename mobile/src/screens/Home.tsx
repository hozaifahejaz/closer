import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Account, api, ApiError } from '../api';
import { WEBSITE } from '../config';
import { cardGradient, colors, fonts, radius } from '../theme';
import type { Connection } from '../useRoom';
import { Icon } from '../components/Icon';
import { Button, HeartBadge, Or, tap } from '../components/ui';

export type HomeData = { stats: { seen: number; answered: number; favorites: number } | null; favorites: string[] };

type Props = {
  token: string | null;
  account: Account;
  clientId: string;
  notice: string;
  onSession: (token: string | null, account: Account | null) => void;
  onPlay: (conn: Connection) => void;
  demo?: { linked: boolean; setLinked: (on: boolean) => void; exit: () => void }; // preview with made-up data (accounts are off on the experiments server)
};

const DEMO_HOME: HomeData = { stats: { seen: 42, answered: 17, favorites: 6 }, favorites: [
  "What's a moment with me you replay when you miss me?",
  'What small thing do I do that makes you feel looked after?',
  'If we had a free weekend and no plans, what would you want us to do?',
] };
const FAV_H = 66; // one favorite, two lines at most

// Where you land once signed in. Until the two of you are linked, your partner
// code is on top; after that it's gone and your shared cards take over.
export function Home({ token, account, clientId, notice, onSession, onPlay, demo }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [home, setHome] = useState<HomeData | null>(demo ? DEMO_HOME : null);
  const [partnerCode, setPartnerCode] = useState('');
  const [err, setErr] = useState(notice);
  const [busy, setBusy] = useState('');
  const [favSpace, setFavSpace] = useState(0);
  const linked = !!account.partner;
  const compact = height < 720;

  useEffect(() => { setErr(notice); }, [notice]);

  const load = useCallback(async () => {
    if (demo) return;
    try {
      const h = await api<HomeData & { me: Account }>('/api/home', token);
      setHome(h);
      if (!!h.me.partner !== linked) onSession(token, h.me);
    } catch (e) { if (e instanceof ApiError && e.status === 401) onSession(null, null); }
  }, [demo, token, linked, onSession]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    // Fresh numbers when coming back to the app, and notice when the partner types in our code.
    const sub = AppState.addEventListener('change', s => { if (s === 'active') load(); });
    const t = linked || demo ? null : setInterval(load, 4000);
    return () => { sub.remove(); if (t) clearInterval(t); };
  }, [load, linked, demo]);

  const run = async (what: string, f: () => Promise<void>) => {
    setErr(''); setBusy(what);
    try { await f(); }
    catch (e) {
      if (e instanceof ApiError && e.status === 401) onSession(null, null);
      setErr(e instanceof Error ? e.message : 'Something went wrong, please try again');
    } finally { setBusy(''); }
  };

  const linkPartner = () => run('link', async () => {
    const code = partnerCode.trim().toUpperCase();
    if (code.length !== 6) throw new Error('Partner codes are 6 letters.');
    if (demo) { setPartnerCode(''); demo.setLinked(true); return; }
    await api('/api/link', token, { code });
    setPartnerCode('');
    onSession(token, await api<Account>('/api/me', token));
  });
  const shareCode = async () => {
    try { await Share.share({ message: `Join me on Closer! Get the app or go to ${WEBSITE}, sign up, and enter my code: ${account.inviteCode}` }); } catch {}
  };
  const play = () => run('play', async () => {
    if (linked) {
      if (demo) throw new Error('In the real app this opens your shared cards.');
      onPlay({ kind: 'couple', token: token!, name: account.name });
      return;
    }
    const r = await api<{ code: string }>('/api/rooms', null, {});
    onPlay({ kind: 'guest', code: r.code, name: account.name, id: clientId });
  });
  const logout = () => run('logout', async () => {
    if (demo) return demo.exit();
    try { await api('/api/logout', token, {}); } catch {}
    onSession(null, null);
  });
  const unlink = () => {
    if (!account.partner) return;
    Alert.alert(`Unlink from ${account.partner.name}?`, 'Your saved answers stay saved.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unlink', style: 'destructive', onPress: () => run('unlink', async () => {
        if (demo) return demo.setLinked(false);
        await api('/api/unlink', token, {});
        onSession(token, await api<Account>('/api/me', token));
      }) },
    ]);
  };

  const data = demo ? (linked ? DEMO_HOME : { stats: null, favorites: [] }) : home;
  const favs = data?.favorites || [];
  // Only as many favorites as fit, so the screen never scrolls.
  const chrome = (compact ? 32 : 40) + 34; // the box's padding and heading
  const favRoom = Math.max(0, Math.floor((favSpace - chrome + 8) / (FAV_H + 8)));
  const narrow = width < 340;
  const gap = compact ? 10 : 14;

  return (
    <KeyboardAvoidingView style={st.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Laid out to fit the screen; it only scrolls if the keyboard leaves too little room. */}
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false} alwaysBounceVertical={false}
        contentContainerStyle={[st.page, { gap, paddingTop: insets.top + (compact ? 8 : 14), paddingBottom: insets.bottom + (demo ? 58 : compact ? 8 : 14),
          paddingLeft: Math.max(insets.left, 16), paddingRight: Math.max(insets.right, 16) }]}>
        <View style={st.col}>
          <View style={st.top}>
            <View style={st.brand}><HeartBadge size={30} /><Text style={st.brandText}>Closer</Text></View>
            <Pressable onPress={() => { tap(); logout(); }} style={({ pressed }) => [st.pill, pressed && { opacity: 0.7 }]} accessibilityRole="button" hitSlop={6}>
              <Text style={st.pillText}>Log out</Text>
            </Pressable>
          </View>
        </View>

        {!linked ? (
          <View style={[st.col, st.card, st.invite, compact && st.cardCompact]}>
            <View style={st.ihead}>
              {narrow ? null : <HeartBadge size={36} />}
              <View style={{ flex: 1 }}>
                <Text style={st.h2}>Link with your partner</Text>
                {compact ? null : <Text style={st.note}>Send them your code, or type in theirs. You only do this once.</Text>}
              </View>
            </View>
            <Text style={st.label}>Your code</Text>
            <View style={st.row}>
              <View style={st.bigcode}><Text style={[st.bigcodeText, narrow && { fontSize: 20, letterSpacing: 4 }]} selectable numberOfLines={1}>{account.inviteCode}</Text></View>
              <Button kind="ghost" title="Share" icon={narrow ? undefined : 'share'} onPress={shareCode} style={{ minHeight: 52 }} />
            </View>
            <View style={{ marginVertical: compact ? 10 : 14 }}><Or>or</Or></View>
            <Text style={st.label}>Their code</Text>
            <View style={st.row}>
              <TextInput value={partnerCode} onChangeText={t => setPartnerCode(t.toUpperCase().replace(/[^A-Z]/g, ''))} maxLength={6} placeholder="CODE"
                autoCapitalize="characters" autoCorrect={false} returnKeyType="done" onSubmitEditing={linkPartner} accessibilityLabel="Your partner's code"
                placeholderTextColor={colors.faint} selectionColor={colors.accent} keyboardAppearance="dark" style={[st.input, st.code]} />
              <Button kind="ghost" title="Link" onPress={linkPartner} busy={busy === 'link'} style={{ minWidth: 84, minHeight: 52 }} />
            </View>
          </View>
        ) : null}

        <LinearGradient colors={cardGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[st.col, st.play, compact && st.cardCompact]}>
          <View style={st.deco} pointerEvents="none">
            <View style={[st.decoCard, { transform: [{ rotate: '14deg' }, { translateX: 10 }] }]} />
            <View style={[st.decoCard, st.decoFront]}>
              <View style={st.decoLine} /><View style={st.decoLine} /><View style={[st.decoLine, { width: '55%', opacity: 0.6 }]} />
            </View>
          </View>
          <Text style={st.eyebrow} numberOfLines={1}>{linked ? `${account.name} & ${account.partner!.name}` : `Hi ${account.name}`}</Text>
          <Text style={[st.playTitle, compact && { fontSize: 25, lineHeight: 30 }]}>{linked ? 'Ready for a few questions?' : 'Your shared cards open here'}</Text>
          {compact && (!linked || height < 600) ? null : (
            <Text style={st.playNote}>{linked ? 'Pick your decks and see the same card at the same moment.' : "Once you're linked. Want to play now? Start a room and send the code."}</Text>
          )}
          <Pressable onPress={() => { tap(); play(); }} disabled={!!busy} accessibilityRole="button"
            style={({ pressed }) => [st.playBtn, compact && { minHeight: 48 }, pressed && { transform: [{ scale: 0.98 }], opacity: 0.92 }]}>
            <Text style={st.playBtnText}>{linked ? 'Open our cards' : 'Start a guest room'}</Text>
            {linked ? <Icon name="right" size={18} color="#3a1d33" /> : null}
          </Pressable>
        </LinearGradient>

        {linked ? (
          <View style={[st.col, st.stats]}>
            {[[data?.stats?.seen, 'cards played'], [data?.stats?.answered, 'answered together'], [data?.stats?.favorites, 'favorites']].map(([n, label]) => (
              <View key={label as string} style={[st.stat, compact && { paddingVertical: 10 }]}>
                <Text style={st.statNum}>{n ?? '–'}</Text>
                <Text style={st.statLabel} numberOfLines={2}>{label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {linked ? (
          // Takes the space left over and shows as many favorites as fit.
          <View style={[st.col, { flex: 1, overflow: 'hidden' }]} onLayout={e => setFavSpace(e.nativeEvent.layout.height)}>
            {(favs.length ? favRoom > 0 : favSpace >= chrome + 40) ? (
              <View style={[st.card, st.favs, compact && st.cardCompact]}>
                <View style={st.fhead}><Icon name="heart" size={17} color={colors.accent} fill strokeWidth={0} /><Text style={st.favTitle}>Latest favorites</Text></View>
                {favs.length ? favs.slice(0, favRoom).map(q => (
                  <View key={q} style={st.fav}><Text style={st.favText} numberOfLines={2}>{q}</Text></View>
                )) : <Text style={st.note}>{home || demo ? 'Tap the heart on any card to keep it here.' : ' '}</Text>}
              </View>
            ) : null}
          </View>
        ) : <View style={{ flex: 1 }} />}

        {err ? <Text style={[st.col, st.err]} accessibilityRole="alert">{err}</Text> : null}
        {linked ? <Button kind="link" title="Unlink partner" onPress={unlink} /> : null}
      </ScrollView>
      {demo ? (
        <View style={[st.demoBar, { bottom: insets.bottom + 10 }]}>
          <Text style={st.demoLabel}>Demo:</Text>
          {[false, true].map(on => (
            <Pressable key={String(on)} onPress={() => { tap(); setErr(''); demo.setLinked(on); }} style={[st.demoBtn, linked === on && st.demoOn]}>
              <Text style={[st.demoText, linked === on && { color: '#fff' }]}>{on ? 'Linked' : 'Not linked'}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  page: { flexGrow: 1, alignItems: 'center' },
  col: { width: '100%', maxWidth: 560 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandText: { fontFamily: fonts.serifBold, fontSize: 22, color: colors.text },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line },
  pillText: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.text },
  card: { backgroundColor: 'rgba(42,28,46,0.92)', borderWidth: 1, borderColor: colors.line, borderRadius: radius.panel, padding: 20 },
  cardCompact: { padding: 16 },
  invite: { borderColor: 'rgba(232,118,111,0.55)', backgroundColor: '#33202f' },
  ihead: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 14 },
  h2: { fontFamily: fonts.serifBold, fontSize: 21, lineHeight: 26, color: colors.text },
  note: { marginTop: 4, fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, color: colors.muted },
  label: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.muted, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  bigcode: { flex: 1, minHeight: 52, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.accent, backgroundColor: colors.bg3, alignItems: 'center', justifyContent: 'center' },
  bigcodeText: { fontFamily: fonts.sansBold, fontSize: 24, letterSpacing: 7, color: colors.text, paddingLeft: 7 },
  input: { minHeight: 52, borderRadius: radius.control - 2, backgroundColor: colors.bg3, borderWidth: 1, borderColor: colors.line, color: colors.text, paddingHorizontal: 14, fontFamily: fonts.sans, fontSize: 16 },
  code: { flex: 1, minWidth: 0, textAlign: 'center', fontFamily: fonts.sansBold, fontSize: 18, letterSpacing: 5 },
  play: { borderRadius: radius.panel, padding: 22, overflow: 'hidden' },
  deco: { position: 'absolute', right: -12, top: 14, width: 86, height: 100 },
  decoCard: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', backgroundColor: 'rgba(255,255,255,0.1)' },
  decoFront: { backgroundColor: 'rgba(251,243,234,0.95)', borderColor: 'transparent', transform: [{ rotate: '-4deg' }], paddingTop: 22, paddingLeft: 12, paddingRight: 20, gap: 8 },
  decoLine: { height: 5, borderRadius: 3, backgroundColor: '#e7cfd3' },
  eyebrow: { fontFamily: fonts.sansBold, fontSize: 12, letterSpacing: 1.8, textTransform: 'uppercase', color: '#ffe3dc', marginBottom: 8, paddingRight: 70 },
  playTitle: { fontFamily: fonts.serifBold, fontSize: 28, lineHeight: 33, color: '#fff', paddingRight: 70 },
  playNote: { marginTop: 6, fontFamily: fonts.sans, fontSize: 15, lineHeight: 21, color: '#ffe6ea', paddingRight: 56 },
  playBtn: { marginTop: 18, minHeight: 52, borderRadius: radius.control, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  playBtnText: { fontFamily: fonts.sansBold, fontSize: 16, color: '#3a1d33' },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, minWidth: 0, backgroundColor: 'rgba(42,28,46,0.92)', borderWidth: 1, borderColor: colors.line, borderRadius: radius.box, paddingVertical: 14, paddingHorizontal: 6, alignItems: 'center' },
  statNum: { fontFamily: fonts.serifBold, fontSize: 28, lineHeight: 32, color: colors.text },
  statLabel: { marginTop: 2, fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, color: colors.muted, textAlign: 'center' },
  favs: { gap: 8 },
  fhead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  favTitle: { fontFamily: fonts.serifBold, fontSize: 19, color: colors.text },
  fav: { height: FAV_H, justifyContent: 'center', backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: 14 },
  favText: { fontFamily: fonts.serif, fontSize: 15.5, lineHeight: 21, color: colors.ink },
  err: { fontFamily: fonts.sansMedium, fontSize: 14, lineHeight: 20, color: colors.bad, textAlign: 'center' },
  demoBar: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4, paddingLeft: 12, borderRadius: 999,
    backgroundColor: 'rgba(18,11,20,0.94)', borderWidth: 1, borderColor: colors.line2 },
  demoLabel: { fontFamily: fonts.sans, fontSize: 12, color: colors.muted },
  demoBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  demoOn: { backgroundColor: colors.raise },
  demoText: { fontFamily: fonts.sansBold, fontSize: 12, color: colors.muted },
});
