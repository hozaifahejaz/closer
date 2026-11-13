import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { buttonGradient, cardGradient, colors, fonts, radius } from '../theme';
import { Icon } from '../components/Icon';
import { Button, HeartBadge, tap } from '../components/ui';

const num = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

type Props = {
  seen: number;
  total: number;
  favorites: number;
  place: { index: number; total: number; label: string } | null; // where the cards were left, if any are dealt
  onContinue: () => void;
  onDecks: () => void;
  onDaily: () => void;
  onFavorites: () => void;
  onMenu: () => void;
};

// The first screen: today's card, how far you've got, and a way back into the cards.
export function Home({ seen, total, favorites, place, onContinue, onDecks, onDaily, onFavorites, onMenu }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const short = height < 700;
  const wide = width >= 760 && width > height * 1.05;
  const share = total ? seen / total : 0;

  // The card of the day stays face down here, like a card on the table: tapping it opens the question.
  const today = (
    <Pressable onPress={() => { tap(); onDaily(); }} accessibilityRole="button" accessibilityLabel="Card of the day. Open to view"
      style={({ pressed }) => [st.daily, wide && { flexGrow: 0, minHeight: 300 }, pressed && { transform: [{ scale: 0.985 }] }]}>
      <View style={st.dailyClip}>
        <LinearGradient colors={cardGradient} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 0.75, y: 1 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['rgba(255,255,255,0.2)', 'rgba(255,255,255,0)']} start={{ x: 0.3, y: 0 }} end={{ x: 0.5, y: 0.6 }} style={StyleSheet.absoluteFill} />
        <View style={st.dailyInset} />
        <View style={st.dailyHead}><Icon name="spark" size={13} color="#fff" fill strokeWidth={0} /><Text style={st.dailyLabel}>Card of the day</Text></View>
        <View><Icon name="heart" size={short ? 34 : 46} color="#fff" strokeWidth={1.4} /></View>
        <Text style={st.dailyOpen}>Open to view</Text>
      </View>
    </Pressable>
  );

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
        <View style={st.statIcon}><Icon name="heart" size={16} color={colors.accent} fill strokeWidth={0} /></View>
      </Pressable>
    </View>
  );

  const welcome = (
    <View style={{ gap: 6 }}>
      <Text style={[st.title, short && { fontSize: 26, lineHeight: 32 }]} accessibilityRole="header">{place ? 'Welcome back.' : 'Welcome.'}</Text>
      <Text style={st.sub}>{place ? 'Pick up where you left off, or choose new decks.' : 'Choose your decks and turn the first card.'}</Text>
    </View>
  );

  const actions = (
    <View style={{ gap: 10 }}>
      {place ? <Button title={`Continue · card ${place.index + 1} of ${place.total}`} accessibilityLabel={`Continue ${place.label}, card ${place.index + 1} of ${place.total}`} iconRight="right" onPress={onContinue} /> : null}
      <Button kind={place ? 'ghost' : 'primary'} title="Choose decks" icon="cards" onPress={onDecks} />
    </View>
  );

  return (
    <ScrollView style={st.fill} bounces={false} overScrollMode="never"
      contentContainerStyle={[st.page, { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 16) + 4, paddingLeft: insets.left + 20, paddingRight: insets.right + 20 }]}>
      <View style={st.header}>
        <View style={st.logo}><HeartBadge size={32} /><Text style={st.brand}>Closer</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Open menu" onPress={() => { tap(); onMenu(); }} hitSlop={6} style={st.menuButton}><Icon name="menu" color={colors.text} /></Pressable>
      </View>
      {wide ? (
        <View style={st.wide}>
          <View style={{ flex: 1, justifyContent: 'center', gap: 18 }}>{welcome}{actions}{stats}</View>
          <View style={{ flex: 1, justifyContent: 'center' }}>{today}</View>
        </View>
      ) : (
        <View style={[st.body, { gap: short ? 14 : 20 }]}>
          {welcome}{actions}{today}{stats}
        </View>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  page: { flexGrow: 1, width: '100%', maxWidth: 1100, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6 },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brand: { fontFamily: fonts.serifBold, fontSize: 24, color: colors.text },
  menuButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  body: { flexGrow: 1, paddingTop: 14, width: '100%', maxWidth: 560, alignSelf: 'center' },
  wide: { flexGrow: 1, flexDirection: 'row', gap: 36, paddingVertical: 16 },
  title: { fontFamily: fonts.serif, fontSize: 30, lineHeight: 37, letterSpacing: -0.6, color: colors.text },
  sub: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22, color: colors.muted },
  daily: { flexGrow: 1, minHeight: 130, maxHeight: 380, borderRadius: radius.card, backgroundColor: colors.bg2,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 18, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  dailyClip: { flex: 1, borderRadius: radius.card, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18 },
  dailyInset: { ...StyleSheet.absoluteFill, margin: 10, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' },
  dailyHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dailyLabel: { fontFamily: fonts.sansBold, fontSize: 12, letterSpacing: 1.8, textTransform: 'uppercase', color: '#fff' },
  dailyOpen: { fontFamily: fonts.sansMedium, fontSize: 13, letterSpacing: 0.3, color: '#ffe6e6' },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, paddingVertical: 14, paddingHorizontal: 16, borderRadius: radius.box, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line },
  statNum: { fontFamily: fonts.sansBold, fontSize: 22, color: colors.text, letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  statOf: { fontFamily: fonts.sans, fontSize: 14, color: colors.muted, letterSpacing: 0 },
  statLabel: { marginTop: 2, fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
  statIcon: { position: 'absolute', top: 14, right: 14 },
  bar: { marginTop: 10, height: 4, borderRadius: 2, backgroundColor: colors.line, overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2 },
});
