import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleProp, StyleSheet, Text, useWindowDimensions, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { num } from '../format';
import type { CardView } from '../game';
import { buttonGradient, cardGradient, colors, fonts, radius } from '../theme';
import { Icon } from '../components/Icon';
import { bump, Button, HeartBadge, tap } from '../components/ui';
import { sheet, useK, useScaled } from '../scale';

// The card of the day lies face down until it is tapped, then turns over where it is and stays
// open for the rest of the day. Tapping the open card shows it full screen (to save or share it).
function DailyCard({ card, open, short, onOpen, onView, style }: { card: CardView; open: boolean; short: boolean; onOpen: () => void; onView: () => void; style?: StyleProp<ViewStyle> }) {
  const st = useScaled(base);
  const k = useK();
  const [turn] = useState(() => new Animated.Value(open ? 1 : 0));
  const was = useRef(open);
  useEffect(() => {
    if (was.current === open) return;
    was.current = open;
    Animated.timing(turn, { toValue: open ? 1 : 0, duration: 600, easing: Easing.bezier(0.2, 0.7, 0.2, 1), useNativeDriver: true }).start();
    if (open) bump();
  }, [open, turn]);
  const back = {
    opacity: turn.interpolate({ inputRange: [0, 0.5, 0.501, 1], outputRange: [1, 1, 0, 0] }),
    transform: [{ perspective: 2200 }, { rotateY: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }],
  };
  const front = {
    opacity: turn.interpolate({ inputRange: [0, 0.499, 0.5, 1], outputRange: [0, 0, 1, 1] }),
    transform: [{ perspective: 2200 }, { rotateY: turn.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] }) }],
  };
  return (
    <Pressable onPress={() => { tap(); if (open) onView(); else onOpen(); }} accessibilityRole="button"
      accessibilityLabel={open ? `Card of the day. ${card.text}` : 'Card of the day. Tap to turn it over'}
      style={({ pressed }) => [st.daily, style, pressed && { transform: [{ scale: 0.985 }] }]}>
      <Animated.View style={[st.dailyFace, back]} pointerEvents="none">
        <View style={st.dailyClip}>
          <LinearGradient colors={cardGradient} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 0.75, y: 1 }} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={['rgba(255,255,255,0.2)', 'rgba(255,255,255,0)']} start={{ x: 0.3, y: 0 }} end={{ x: 0.5, y: 0.6 }} style={StyleSheet.absoluteFill} />
          <View style={st.dailyInset} />
          <View style={st.dailyHead}><Icon name="spark" size={13 * k} color="#fff" fill strokeWidth={0} /><Text style={st.dailyLabel}>Card of the day</Text></View>
          <View><Icon name="heart" size={(short ? 34 : 46) * k} color="#fff" strokeWidth={1.4} /></View>
          <Text style={st.dailyOpen}>Tap to open</Text>
        </View>
      </Animated.View>
      <Animated.View style={[st.dailyFace, front]} pointerEvents="none">
        <View style={[st.dailyClip, st.dailyFront, short && { padding: 16 * k }]}>
          <View style={st.dailyHead}><Icon name="spark" size={13 * k} color={colors.rose} fill strokeWidth={0} /><Text style={[st.dailyLabel, { color: colors.rose }]}>Card of the day</Text></View>
          <View style={st.dailyMid}>
            <Text style={[st.dailyQ, short && { fontSize: 19 * k, lineHeight: 25 * k }]} numberOfLines={6} adjustsFontSizeToFit minimumFontScale={0.7}>{card.text}</Text>
          </View>
          <Text style={st.dailyCat} numberOfLines={1}>{card.category}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

type Props = {
  daily: CardView;
  dailyOpen: boolean; // today's card has already been turned over
  seen: number;
  total: number;
  favorites: number;
  place: { index: number; total: number; label: string } | null; // where the cards were left, if any are dealt
  onContinue: () => void;
  onDecks: () => void;
  onOpenDaily: () => void;
  onDaily: () => void;
  onFavorites: () => void;
  onMenu: () => void;
};

// The first screen: today's card, how far you've got, and a way back into the cards.
export function Home({ daily, dailyOpen, onOpenDaily, seen, total, favorites, place, onContinue, onDecks, onDaily, onFavorites, onMenu }: Props) {
  const st = useScaled(base);
  const k = useK();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const short = height / k < 700;
  const wide = width >= 760 && width > height * 1.05;
  const share = total ? seen / total : 0;

  const today = <DailyCard card={daily} open={dailyOpen} short={short} onOpen={onOpenDaily} onView={onDaily}
    style={wide ? { flexGrow: 0, height: Math.min(360 * k, height - 150 * k) } : { maxHeight: Math.min(560 * k, Math.max(380 * k, height * 0.46)) }} />;

  const stats = (
    <View style={st.stats}>
      <View style={st.stat} accessible accessibilityLabel={`${seen} of ${total} cards seen`}>
        <Text style={st.statNum}>{num(seen)}<Text style={st.statOf}> / {num(total)}</Text></Text>
        <Text style={st.statLabel}>Cards seen</Text>
        <View style={st.bar}><LinearGradient colors={buttonGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[st.barFill, { width: `${Math.max(seen ? 3 : 0, share * 100)}%` }]} /></View>
      </View>
      <Pressable onPress={() => { tap(); onFavorites(); }} accessibilityRole="button" accessibilityLabel={`${favorites} favorites. Open favorites`}
        style={({ pressed }) => [st.stat, pressed && { backgroundColor: colors.raise }]}>
        <Text style={st.statNum}>{num(favorites)}</Text>
        <Text style={st.statLabel}>Favorites</Text>
        <View style={st.statIcon}><Icon name="heart" size={16 * k} color={colors.accent} fill strokeWidth={0} /></View>
      </Pressable>
    </View>
  );

  const welcome = (
    <View style={{ gap: 6 * k }}>
      <Text style={[st.title, short && { fontSize: 26 * k, lineHeight: 32 * k }]} accessibilityRole="header">{place ? 'Welcome back.' : 'Welcome.'}</Text>
      <Text style={st.sub}>{place ? 'Pick up where you left off, or choose new decks.' : 'Choose your decks and turn the first card.'}</Text>
    </View>
  );

  const actions = (
    <View style={{ gap: 10 * k }}>
      {place ? <Button title={place.index ? `Continue ${place.label} · ${num(place.index + 1)} of ${num(place.total)}` : `Start ${place.label}`}
        accessibilityLabel={place.index ? `Continue ${place.label}, card ${place.index + 1} of ${place.total}` : `Start ${place.label}`} iconRight="right" onPress={onContinue} /> : null}
      <Button kind={place ? 'ghost' : 'primary'} title="Choose decks" icon="cards" onPress={onDecks} />
    </View>
  );

  return (
    <ScrollView style={st.fill} bounces={false} overScrollMode="never"
      contentContainerStyle={[st.page, { paddingTop: insets.top + 12 * k, paddingBottom: Math.max(insets.bottom, 16 * k) + 4, paddingLeft: insets.left + 20 * k, paddingRight: insets.right + 20 * k }]}>
      <View style={[st.header, !wide && { maxWidth: 560 * k }]}>
        <View style={st.logo}><HeartBadge size={32} /><Text style={st.brand}>Closer</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Open menu" onPress={() => { tap(); onMenu(); }} hitSlop={6} style={st.menuButton}><Icon name="menu" size={20 * k} color={colors.text} /></Pressable>
      </View>
      {wide ? (
        <View style={st.wide}>
          <View style={{ flex: 1, justifyContent: 'center', gap: 18 * k }}>{welcome}{actions}{stats}</View>
          <View style={{ flex: 1, justifyContent: 'center' }}>{today}</View>
        </View>
      ) : (
        <View style={[st.body, { gap: (short ? 14 : 20) * k }]}>
          {welcome}{actions}{today}{stats}
        </View>
      )}
    </ScrollView>
  );
}

const base = sheet({
  fill: { flex: 1, backgroundColor: colors.bg },
  page: { flexGrow: 1, width: '100%', maxWidth: 1100, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6, width: '100%', alignSelf: 'center' },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brand: { fontFamily: fonts.serifBold, fontSize: 24, color: colors.text },
  menuButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  body: { flexGrow: 1, paddingTop: 14, width: '100%', maxWidth: 560, alignSelf: 'center' },
  wide: { flexGrow: 1, flexDirection: 'row', gap: 36, paddingVertical: 16 },
  title: { fontFamily: fonts.serif, fontSize: 30, lineHeight: 37, letterSpacing: -0.6, color: colors.text },
  sub: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22, color: colors.muted },
  daily: { flexGrow: 1, minHeight: 150 },
  dailyFace: { ...StyleSheet.absoluteFill, borderRadius: radius.card, backgroundColor: colors.bg2,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 18, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  dailyClip: { flex: 1, borderRadius: radius.card, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18 },
  dailyFront: { backgroundColor: colors.card, justifyContent: 'space-between', padding: 22, gap: 8 },
  dailyInset: { ...StyleSheet.absoluteFill, margin: 10, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' },
  dailyHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dailyLabel: { fontFamily: fonts.sansBold, fontSize: 12, letterSpacing: 1.8, textTransform: 'uppercase', color: '#fff' },
  dailyOpen: { fontFamily: fonts.sansMedium, fontSize: 13, letterSpacing: 0.3, color: '#ffe6e6' },
  dailyMid: { flex: 1, minHeight: 0, justifyContent: 'center', alignSelf: 'stretch' },
  dailyQ: { fontFamily: fonts.serif, fontSize: 22, lineHeight: 29, color: colors.ink, textAlign: 'center' },
  dailyCat: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink2 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, paddingVertical: 14, paddingHorizontal: 16, borderRadius: radius.box, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line },
  statNum: { fontFamily: fonts.sansBold, fontSize: 22, color: colors.text, letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  statOf: { fontFamily: fonts.sans, fontSize: 14, color: colors.muted, letterSpacing: 0 },
  statLabel: { marginTop: 2, fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
  statIcon: { position: 'absolute', top: 14, right: 14 },
  bar: { marginTop: 10, height: 4, borderRadius: 2, backgroundColor: colors.line, overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2 },
});
