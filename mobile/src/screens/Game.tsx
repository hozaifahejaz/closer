import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, BackHandler, KeyboardAvoidingView, Platform, Pressable, Linking, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Action } from '../api';
import { WEBSITE } from '../config';
import { colors, fonts, radius } from '../theme';
import { Connection, useRoom } from '../useRoom';
import { useKeyboardVisible } from '../useKeyboard';
import { AnswerPanel } from '../components/AnswerPanel';
import { History } from '../components/History';
import { Dashboard } from '../components/Dashboard';
import { Card } from '../components/Card';
import { DeckPicker } from '../components/DeckPicker';
import { Icon } from '../components/Icon';
import { Button, HeartBadge, Segmented, tap, Toggle } from '../components/ui';

const deckName = (decks: string[]) => !decks.length ? 'All decks' : decks.length === 1 ? decks[0] : `${decks.length} decks`;

export function Game({ conn, onLeave, accounts, signedIn }: { conn: Connection; onLeave: (message?: string) => void; accounts: boolean; signedIn: boolean }) {
  const { room, link, send, reclaim, draft, setDraft, answerPending, error } = useRoom(conn, onLeave);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [toast, setToast] = useState('');
  const [toastOpacity] = useState(() => new Animated.Value(0));
  const keyboard = useKeyboardVisible();
  const first = useRef(true);
  const openVersion = useRef<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [dashboard, setDashboard] = useState(conn.kind === 'guest');

  const say = useCallback((msg: string) => {
    setToast(msg);
    toastOpacity.stopAnimation();
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.delay(1600),
      Animated.timing(toastOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [toastOpacity]);

  useEffect(() => { if (error) say(error); }, [error, say]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { if (dashboard) onLeave(); else setDashboard(true); return true; });
    return () => subscription.remove();
  }, [onLeave, dashboard]);

  const act = useCallback((a: Action) => {
    const ok = send(a);
    if (!ok) say('Reconnecting…');
    return ok;
  }, [send, say]);

  useEffect(() => {
    if (!room) return;
    const version = room.cardsOpenVersion || 0;
    if (openVersion.current !== null && version > openVersion.current) {
      setHistoryOpen(false); setDashboard(false);
    }
    openVersion.current = version;
  }, [room]);

  // Back in a room you've played before, before your partner arrives: open the picker with "Continue" ready.
  useEffect(() => {
    if (!room || dashboard || !first.current) return;
    first.current = false;
    if (room.started && !room.choosing && room.partners.length < 2) act({ type: 'choose', on: true });
  }, [room, act, dashboard]);

  if (!room) {
    return (
      <View style={[st.fill, st.center]}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={st.loading}>{conn.kind === 'couple' ? 'Opening your cards…' : `Joining room ${conn.code}…`}</Text>
        <Button kind="link" title="Cancel" onPress={() => onLeave()} style={{ marginTop: 16 }} />
      </View>
    );
  }

  const me = conn.name;
  const partner = room.partners.find(p => p !== me) || (room.partners.length === 2 ? room.partners[1] : '');
  const together = room.partners.length === 2;
  // Includes the question: a fresh deal or a rebuilt room can put a different card at the same place.
  const cardKey = room.card.id;
  const answerMode = room.mode === 'answer';
  const wide = width >= 760 && width > height * 1.05;

  const invite = async () => {
    if (!room.code) return;
    try {
      await Share.share({ message: `Join me on Closer! Open the app and enter room code ${room.code}, or tap ${WEBSITE}/?room=${room.code}` });
    } catch { say(`Code: ${room.code}`); }
  };

  if (dashboard) return <><History visible={historyOpen} token={conn.kind === 'couple' ? conn.token : null} onClose={() => setHistoryOpen(false)} /><Dashboard
    title={together || room.couple ? 'A little time for two.' : `Welcome, ${conn.name}.`}
    subtitle={together || room.couple ? 'Choose a deck. Start a conversation.' : 'Share your invite with your partner. Once your partner joins, open cards to play together. Find more options in the menu.'}
    onOpen={() => act({ type: 'openCards' })} disabled={link !== 'live'} error={error || (link === 'live' ? undefined : link === 'replaced' ? 'This room is open on another device.' : 'Reconnecting…')}
    invite={!room.couple && !together ? <>
      <Text style={st.pillText}>Your room code</Text>
      <View style={st.row}><Text selectable style={[st.pillCode, { fontSize: 26, letterSpacing: 6, flex: 1 }]}>{room.code}</Text><Button kind="ghost" title="Share invite" onPress={invite} /></View>
    </> : undefined}
    promotion={!room.couple && !signedIn ? <>
      <Text style={{ fontFamily: fonts.serif, fontSize: 22, color: colors.text }}>Make your moments last.</Text>
      <Text style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 23, color: colors.muted }}>Create an account and link your partner to save answers, favorites, and cards you’ve seen.</Text>
      <Button kind="ghost" title="Create an account" disabled={!accounts} onPress={() => { if (accounts) Linking.openURL(WEBSITE); }} style={{ alignSelf: 'flex-start' }} />
      <Text style={{ fontFamily: fonts.sans, fontSize: 12, lineHeight: 19, color: colors.muted }}>{accounts ? 'Your current guest progress won’t transfer to your account.' : 'Sign-up is unavailable in this guest-only preview.'}</Text>
    </> : undefined}
    menu={[
      ...(room.couple ? [{ title: 'History', onPress: () => setHistoryOpen(true) }] : []),
      ...(link === 'replaced' ? [{ title: 'Use room here', onPress: reclaim }] : []),
      { title: 'Privacy policy', onPress: () => { Linking.openURL(`${WEBSITE}/privacy`); } },
      { title: room.couple ? 'Back to account' : 'Leave room', onPress: () => onLeave() },
    ]}
  /></>;

  const top = (
    <View style={st.top}>
      <Pressable onPress={() => { tap(); setDashboard(true); }} hitSlop={10} style={st.back} accessibilityRole="button" accessibilityLabel="Back to dashboard">
        <Icon name="left" size={20} color={colors.text} />
      </Pressable>
      <View style={st.brand}><HeartBadge size={26} />{width >= 360 ? <Text style={st.brandText}>Closer</Text> : null}</View>
      <View style={{ flex: 1 }} />
      {room.couple ? (
        <View style={st.pill}><Icon name="heart" size={13} color={colors.accent} fill strokeWidth={0} /><Text style={st.pillName}>Just us</Text></View>
      ) : !together ? (
        <Pressable onPress={invite} style={({ pressed }) => [st.pill, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel={`Room ${room.code}. Invite your partner`}>
          <Text style={st.pillText}>Room</Text><Text style={st.pillCode}>{room.code}</Text>
        </Pressable>
      ) : null}
      <View style={[st.pill, { maxWidth: wide ? 220 : 140 }]}>
        <View style={[st.dot, together && st.dotOn]} />
        <Text numberOfLines={1} style={together ? st.pillName : st.pillText}>{together ? partner : 'Waiting…'}</Text>
      </View>
    </View>
  );

  const card = (
    <Card cardKey={cardKey} category={room.card?.category ?? ''} text={room.card?.text ?? ''} position={`${room.index + 1} / ${room.total}`}
      flipped={room.flipped} tapToReveal={room.tapToReveal} favorite={room.favorites.includes(room.card?.text ?? '')}
      onFlip={() => act({ type: 'flip' })} onFavorite={() => act({ type: 'favorite', cardKey, generation: room.generation })} onSwipe={dir => act({ type: dir })} />
  );

  // Short phones fold the two bottom rows into one; while typing an answer, only the card and the answer stay.
  const compact = height < 760;
  const typing = keyboard && answerMode;
  // Once both answers are showing on a short phone, they get the room the switch row would take.
  const revealedTight = compact && answerMode && !!room.revealed;
  const gap = compact ? 10 : 12;
  const decksButton = (
    <Pressable onPress={() => { tap(); act({ type: 'choose', on: true }); }}
      style={({ pressed }) => [st.deckBtn, compact && st.iconBtn, pressed && { opacity: 0.85 }]}
      accessibilityRole="button" accessibilityLabel={`Choose decks. Now playing ${deckName(room.decks)}`}>
      <Icon name="cards" size={18} color={colors.accent2} />
      {compact ? null : <Text numberOfLines={1} style={st.deckText}>{deckName(room.decks)}{room.fresh ? ' · new only' : ''}</Text>}
      {compact ? null : <View style={st.chev} />}
    </Pressable>
  );
  const btnH = compact ? { minHeight: 48 } : null;
  const nav = (
    <View style={st.row}>
      <Button kind="ghost" title="" icon="left" accessibilityLabel="Previous question" onPress={() => act({ type: 'prev' })} style={[{ width: compact ? 48 : 56, paddingHorizontal: 0 }, btnH]} />
      <Button title={compact ? 'Next' : 'Next question'} accessibilityLabel="Next question" iconRight="right" onPress={() => act({ type: 'next' })} style={[{ flex: 1 }, btnH]} />
      {compact ? decksButton : null}
      {compact && !room.couple && !together ? <Button kind="ghost" title="" icon="share" accessibilityLabel="Invite your partner" onPress={invite} style={[st.iconBtn, btnH]} /> : null}
    </View>
  );

  // The mode switch sits above the card.
  const modes = (
    <Segmented value={room.mode} onChange={mode => act({ type: 'mode', mode })}
      options={[{ value: 'talk', label: 'Just talk' }, { value: 'answer', label: 'Answer & reveal' }]} />
  );

  const side = (
    <View style={{ gap, flexShrink: 1, minHeight: 0 }}>
      {typing ? null : (
        <>
          {revealedTight ? null : <View style={st.opt}>
            <Text style={st.optText}>Tap to reveal each card</Text>
            <Toggle on={room.tapToReveal} onChange={on => act({ type: 'tapToReveal', on })} label="Tap to reveal each card" />
          </View>}
        </>
      )}
      {answerMode ? (
        <AnswerPanel room={room} partnerName={partner || 'your partner'} compact={compact || typing}
          text={draft} onChangeText={setDraft} pending={answerPending}
          onLockIn={text => act({ type: 'answer', cardKey, generation: room.generation, text })} />
      ) : null}
      {typing ? null : nav}
      {typing || compact ? null : (
        <View style={st.row}>
          {decksButton}
          {!room.couple && !together ? <Button kind="ghost" title="Invite" icon="share" onPress={invite} /> : null}
        </View>
      )}
    </View>
  );

  const banner = link === 'live' ? null : (
    <View style={st.banner}>
      {link === 'replaced' ? (
        <>
          <Text style={st.bannerText}>You opened this room on another device.</Text>
          <Pressable onPress={() => { tap(); reclaim(); }} hitSlop={8}><Text style={st.bannerBtn}>Use here</Text></Pressable>
        </>
      ) : (
        <><ActivityIndicator size="small" color={colors.accent2} /><Text style={st.bannerText}>Reconnecting…</Text></>
      )}
    </View>
  );

  return (
    <View style={[st.fill, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
      {top}
      {banner}
      {wide ? (
        <View style={[st.wide, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={[st.wideCard, { gap: 12 }]}>{modes}<View style={{ flex: 1 }}>{card}</View></View>
          <View style={st.wideSide}>{side}</View>
        </View>
      ) : (
        // Everything fits the screen: the card takes whatever height is left.
        <KeyboardAvoidingView style={st.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[st.column, { gap, paddingBottom: typing ? 8 : Math.max(insets.bottom, compact ? 10 : 16) }]}>
            {typing ? null : modes}
            <View style={[st.cardArea, { minHeight: typing || room.revealed ? 90 : 120 }]}>{card}</View>
            {side}
          </View>
        </KeyboardAvoidingView>
      )}
      <Animated.View pointerEvents="none" style={[st.toast, { opacity: toastOpacity, bottom: insets.bottom + 90 }]}>
        <Text style={st.toastText}>{toast}</Text>
      </Animated.View>
      <DeckPicker room={room} send={act} onLeave={() => setDashboard(true)} banner={banner} />
    </View>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  loading: { marginTop: 16, fontFamily: fonts.sansMedium, fontSize: 15, color: colors.muted },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  back: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 2 },
  brandText: { fontFamily: fonts.serifBold, fontSize: 19, color: colors.text },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, height: 32, borderRadius: 999, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line, flexShrink: 1 },
  pillText: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.muted },
  pillCode: { fontFamily: fonts.sansBold, fontSize: 13, color: '#fff', letterSpacing: 1.8 },
  pillName: { fontFamily: fonts.sansBold, fontSize: 13, color: '#fff', flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.faint },
  dotOn: { backgroundColor: colors.ok, shadowColor: colors.ok, shadowOpacity: 0.8, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
  banner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginHorizontal: 14, marginBottom: 6, paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 12, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line },
  bannerText: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.soft, flexShrink: 1 },
  bannerBtn: { fontFamily: fonts.sansBold, fontSize: 13, color: colors.accent2 },
  column: { flex: 1, paddingHorizontal: 16, paddingTop: 4, width: '100%', maxWidth: 560, alignSelf: 'center' },
  cardArea: { flex: 1 },
  wide: { flex: 1, flexDirection: 'row', gap: 28, paddingHorizontal: 28, paddingTop: 8, maxWidth: 1280, width: '100%', alignSelf: 'center' },
  wideCard: { flex: 1.25, maxWidth: 720 },
  wideSide: { flex: 1, maxWidth: 400, justifyContent: 'center' },
  iconBtn: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', width: 48, minHeight: 48, paddingHorizontal: 0, justifyContent: 'center', gap: 0 },
  opt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 4 },
  optText: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.soft },
  row: { flexDirection: 'row', gap: 10 },
  deckBtn: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: radius.control,
    backgroundColor: colors.bg3, borderWidth: 1, borderColor: colors.line },
  deckText: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 15, color: colors.text },
  chev: { width: 8, height: 8, borderRightWidth: 1.5, borderBottomWidth: 1.5, borderColor: colors.muted, transform: [{ rotate: '-45deg' }], marginRight: 4 },
  toast: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.raise, borderWidth: 1, borderColor: colors.line2 },
  toastText: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.text },
});
