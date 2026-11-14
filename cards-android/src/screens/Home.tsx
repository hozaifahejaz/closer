import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { num } from '../format';
import { buttonGradient, colors, fonts, radius } from '../theme';
import { DeckArt } from '../components/DeckArt';
import { Icon } from '../components/Icon';
import { Button, HeartBadge, tap } from '../components/ui';
import { sheet, useK, useScaled } from '../scale';

type Props = {
  seen: number;
  total: number;
  favorites: number;
  place: { index: number; total: number; label: string } | null; // where the cards were left, if any are dealt
  onContinue: () => void;
  onDecks: () => void;
  onFavorites: () => void;
  onMenu: () => void;
};

// The first screen: a welcome, the way into the cards, and how far you've got.
export function Home({ seen, total, favorites, place, onContinue, onDecks, onFavorites, onMenu }: Props) {
  const st = useScaled(base);
  const k = useK();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const short = height / k < 700;
  const wide = width >= 760 && width > height * 1.05;
  const share = total ? seen / total : 0;

  // A fan of every deck's colour, the same art as the "All decks" tile, as the screen's picture.
  // The fan is about 1.7 times wider than tall, so its box is cut down to the drawing's height.
  const artSize = wide ? Math.min(height * 0.75, width * 0.4) : Math.min(width * 0.78, height * (short ? 0.3 : 0.4));
  const hero = <View style={[st.hero, { height: artSize * 0.6 }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><DeckArt deck="All" size={artSize} /></View>;

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
          <View style={{ flex: 1, justifyContent: 'center' }}>{hero}</View>
          <View style={{ flex: 1, justifyContent: 'center', gap: 18 * k }}>{welcome}{actions}{stats}</View>
        </View>
      ) : (
        // One centred group, so the screen looks balanced from small phones to tablets.
        <View style={[st.body, { gap: (short ? 16 : 24) * k }]}>
          {hero}{welcome}{actions}{stats}
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
  body: { flexGrow: 1, justifyContent: 'center', paddingVertical: 14, width: '100%', maxWidth: 560, alignSelf: 'center' },
  hero: { alignItems: 'center', justifyContent: 'center' },
  wide: { flexGrow: 1, flexDirection: 'row', gap: 36, paddingVertical: 16 },
  title: { fontFamily: fonts.serif, fontSize: 30, lineHeight: 37, letterSpacing: -0.6, color: colors.text },
  sub: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22, color: colors.muted },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, paddingVertical: 14, paddingHorizontal: 16, borderRadius: radius.box, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line },
  statNum: { fontFamily: fonts.sansBold, fontSize: 22, color: colors.text, letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  statOf: { fontFamily: fonts.sans, fontSize: 14, color: colors.muted, letterSpacing: 0 },
  statLabel: { marginTop: 2, fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
  statIcon: { position: 'absolute', top: 14, right: 14 },
  bar: { marginTop: 10, height: 4, borderRadius: 2, backgroundColor: colors.line, overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2 },
});
