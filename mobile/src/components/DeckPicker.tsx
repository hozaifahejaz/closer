import { ReactNode, useEffect, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Modal, NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RoomState } from '../api';
import { colors, fonts, radius } from '../theme';
import { DeckArt, deckColors } from './DeckArt';
import { Icon } from './Icon';
import { Button, tap, Toggle } from './ui';

const BLURBS: Record<string, string> = {
  'Getting Closer': 'Warm, easy questions to open up.',
  'Who You Are': 'Your past, your values, what shaped you.',
  'Us & The Future': 'Dreams, plans and the life you are building.',
  'Honest & Vulnerable': 'The deeper things that are harder to say.',
  'Light & Playful': 'Fun, silly and nostalgic.',
  'Desire & Intimacy': 'Touch, attraction and feeling wanted.',
  'Conflict & Repair': 'How you fight, forgive and find your way back.',
  'Life & Meaning': 'Big questions about life, death and what matters.',
  'Guess My Answer': 'Guess what your partner will say, then find out.',
  'Would You Rather': 'Quick either-or picks to argue about.',
  'Weekly Check-in': 'A few minutes each week to stay in step.',
  Dilemmas: 'Moral what-ifs with no right answer.',
  'Long Distance': 'For missing each other from miles away.',
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const sum = <T,>(list: T[], f: (x: T) => number) => list.reduce((n, x) => n + f(x), 0);

// Choosing decks is shared: when one of you opens the picker, it opens for both,
// and starting deals the same cards to both phones.
export function DeckPicker({ room, send, onLeave, banner }: { room: RoomState; send: (a: any) => void; onLeave: () => void; banner?: ReactNode }) {
  const { width, height } = useWindowDimensions();
  const [grid, setGrid] = useState({ w: 0, h: 0 });
  const insets = useSafeAreaInsets();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [freshOn, setFreshOn] = useState(false);

  // Start from what the room is playing now, each time the picker opens.
  useEffect(() => {
    if (!room.choosing) return;
    setSel(new Set(room.decks.length ? room.decks : room.deckList.map(d => d.name)));
    setFreshOn(room.fresh);
  }, [room.choosing]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = room.deckList;
  const fresh = room.couple && freshOn; // "only cards we haven't seen" needs an account
  const left = (d: { count: number; used: number }) => d.count - d.used;
  const picked = list.filter(d => sel.has(d.name));
  const key = picked.length === list.length ? 'All' : picked.map(d => d.name).join('|');
  const saved = room.saved[key];
  const unused = sum(picked, left), seen = sum(list, d => d.used);
  const short = height < 720;
  // Deck cards are upright (5:7) and sized like the website's picker: four to a row on phones and tablets,
  // six on wide screens, shrinking only until three rows (two on wide screens) fit, never below a minimum.
  // The size never depends on how many decks there are: twelve (three rows of four) show at full size,
  // and any more scroll, with a soft fade at the edge that has more.
  const layout = width >= 960 ? { cols: 6, gx: 18, gy: 18, rows: 2, min: 90 }
    : width >= 700 ? { cols: 4, gx: 20, gy: 22, rows: 3, min: 96 }
    : { cols: 4, gx: 12, gy: 16, rows: 3, min: 64 };
  const COLS = layout.cols;
  const cardW = Math.floor(Math.min((grid.w - layout.gx * (COLS - 1)) / COLS, 190,
    Math.max(layout.min, ((grid.h - layout.gy * (layout.rows - 1)) / layout.rows) * (5 / 7))));
  const [edge, setEdge] = useState({ above: false, below: false });
  const onScroll = ({ nativeEvent: n }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const above = n.contentOffset.y > 2, below = n.contentOffset.y + n.layoutMeasurement.height < n.contentSize.height - 2;
    if (above !== edge.above || below !== edge.below) setEdge({ above, below });
  };
  const cardH = Math.round(cardW * 7 / 5);
  const visibleH = layout.rows * cardH + (layout.rows - 1) * layout.gy + 20;

  const fan = list.map(d => deckColors(d.name).c1);
  const toggle = (name: string | null) => {
    tap();
    if (name === null) setSel(sel.size === list.length ? new Set() : new Set(list.map(d => d.name)));
    else { const next = new Set(sel); next.has(name) ? next.delete(name) : next.add(name); setSel(next); }
  };
  // Before the first deal there is no card to go back to, so closing leaves the room.
  const close = () => { if (room.started) send({ type: 'choose', on: false }); else onLeave(); };
  const start = () => { if (sel.size) send({ type: 'decks', decks: [...sel], fresh }); };

  const go = !picked.length ? 'Pick at least one deck'
    : fresh ? (unused ? 'Start' : "You've seen every card here")
    : saved && saved.index > 0 ? `Continue · card ${saved.index + 1} of ${saved.total}` : 'Start';

  const tile = (name: string | null, label: string, blurb: string, cards: number, fresh_: number, on: boolean) => {
    const spent = fresh && !fresh_;
    const deck = name ?? 'All';
    const { c2 } = deckColors(deck);
    // Tiny cards (twelve decks on a small phone) tighten up like the website's: smaller type, and no count below 56px.
    const tiny = cardW < 80, micro = cardW < 56;
    const nameSize = micro ? 8.5 : tiny ? 9.5 : Math.max(10, Math.min(17, cardW * 0.11));
    const countSize = tiny ? 7 : Math.max(7, Math.min(10.5, cardW * 0.068));
    const chk = micro ? 11 : Math.max(13, Math.min(20, cardW * 0.13));
    return (
      <Pressable key={label} onPress={() => toggle(name)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
        accessibilityLabel={`${label}. ${blurb}`}
        style={({ pressed }) => [st.card, { width: cardW, height: cardH, paddingVertical: cardW * (tiny ? 0.085 : 0.1), paddingHorizontal: cardW * (micro ? 0.04 : tiny ? 0.06 : 0.08) },
          { backgroundColor: colors.card, borderColor: c2 + 'b3' }, pressed && { transform: [{ scale: 0.97 }] }]}>
        <View style={{ marginBottom: cardW * (tiny ? 0.07 : 0.1), opacity: spent ? 0.5 : 1 }}>
          <DeckArt deck={deck} size={cardW * (tiny && !micro ? 0.5 : 0.46)} spent={spent} fan={fan} />
        </View>
        <Text style={[st.nm, { fontSize: nameSize, lineHeight: nameSize * 1.15 }]} numberOfLines={2}>{label.replace(/-/g, '\u2011')}</Text>
        {micro ? null : (
          <Text style={[st.ct, { fontSize: countSize, color: spent ? colors.ink2 : c2 }, tiny && { letterSpacing: 0.7, marginTop: 3 }]} numberOfLines={1}>
            {!fresh ? plural(cards, 'card', 'cards') : fresh_ ? `${fresh_} new` : 'All seen'}
          </Text>
        )}
        <View style={[st.chk, { width: chk, height: chk, borderRadius: chk / 2, top: micro ? 5 : Math.max(7, cardW * 0.07), right: micro ? 5 : Math.max(7, cardW * 0.07) },
          on ? { backgroundColor: c2, borderColor: c2 } : { borderColor: c2 + '80', borderWidth: 1.5 }]}>
          {on ? <Icon name="check" size={chk * 0.7} color="#fff" strokeWidth={3} /> : null}
        </View>
      </Pressable>
    );
  };

  return (
    <Modal visible={room.choosing} animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={close} statusBarTranslucent>
      <View style={[st.sheet, { paddingTop: Platform.OS === 'ios' ? 12 : insets.top + 8 }]}>
        <View style={st.grabber} />
        <View style={[st.head, short && { paddingBottom: 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={[st.title, short && { fontSize: 24 }]} accessibilityRole="header">Choose your decks</Text>
            {short ? null : <Text style={st.sub}>Pick one, a few, or all of them. Your place in each is saved.</Text>}
          </View>
          <Pressable onPress={close} hitSlop={10} style={st.x} accessibilityRole="button" accessibilityLabel={room.started ? 'Back to the card' : 'Leave the room'}>
            <Icon name="close" size={18} color={colors.muted} />
          </Pressable>
        </View>
        {banner}
        <View style={st.grid} onLayout={e => setGrid({ w: e.nativeEvent.layout.width - 28, h: e.nativeEvent.layout.height - 20 })}>
          {grid.w ? (
            // At most three rows (two on wide screens) show at once; the box is exactly that tall and the rest scroll.
            <View style={{ height: Math.min(grid.h + 20, visibleH), width: '100%' }}>
              <ScrollView style={st.scroll} contentContainerStyle={st.scrollIn} onScroll={onScroll} onContentSizeChange={(_, h) => setEdge(x => ({ ...x, below: h > Math.min(grid.h + 20, visibleH) + 2 }))}
                scrollEventThrottle={32} showsVerticalScrollIndicator={false} bounces={false} overScrollMode="never">
                <View style={[st.cards, { width: cardW * COLS + layout.gx * (COLS - 1), columnGap: layout.gx, rowGap: layout.gy }]}>
                  {[
                    tile(null, 'All decks', 'Every question, shuffled together.', sum(list, d => d.count), sum(list, left), sel.size === list.length),
                    ...list.map(d => tile(d.name, d.name, BLURBS[d.name] || '', d.count, left(d), sel.has(d.name))),
                  ]}
                </View>
              </ScrollView>
              {edge.above ? <LinearGradient pointerEvents="none" colors={[colors.bg, colors.bg + '00']} style={[st.fade, { top: 0 }]} /> : null}
              {edge.below ? <LinearGradient pointerEvents="none" colors={[colors.bg + '00', colors.bg]} style={[st.fade, { bottom: 0 }]} /> : null}
            </View>
          ) : null}
        </View>
        <View style={[st.foot, short && { gap: 10, paddingTop: 10 }, { paddingBottom: Math.max(insets.bottom, short ? 10 : 16) }]}>
          {room.couple ? (
            <View style={[st.opt, short && { paddingVertical: 10 }]}>
              <View style={{ flex: 1 }}>
                <Text style={st.optT}>Only cards we haven't seen</Text>
                <Text style={st.optS}>{seen ? `You've seen ${seen} of ${sum(list, d => d.count)} so far` : 'Skip cards you two have already seen'}</Text>
              </View>
              <Toggle on={fresh} onChange={setFreshOn} label="Only cards we haven't seen" />
            </View>
          ) : null}
          <Button title={go} onPress={start} disabled={!picked.length || (fresh && !unused)} style={short && { minHeight: 48 }} />
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.bg },
  grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: colors.line2, marginBottom: 14, display: Platform.OS === 'ios' ? 'flex' : 'none' },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20, paddingBottom: 14, width: '100%', maxWidth: 980, alignSelf: 'center' },
  title: { fontFamily: fonts.serifBold, fontSize: 28, color: colors.text, letterSpacing: -0.3 },
  sub: { marginTop: 4, fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, color: colors.muted },
  x: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  grid: { flex: 1, minHeight: 0, width: '100%', maxWidth: 980, alignSelf: 'center', justifyContent: 'center', overflow: 'hidden' },
  scroll: { flex: 1 },
  scrollIn: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  fade: { position: 'absolute', left: 0, right: 0, height: 36 },
  card: { borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 11, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  chk: { position: 'absolute', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  nm: { fontFamily: fonts.serif, color: colors.ink, textAlign: 'center' },
  ct: { marginTop: 4, fontFamily: fonts.sansBold, letterSpacing: 1.4, textTransform: 'uppercase', fontVariant: ['tabular-nums'] },
  foot: { paddingHorizontal: 20, paddingTop: 12, gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.bg, width: '100%', maxWidth: 620, alignSelf: 'center' },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.bg2, borderRadius: radius.control, borderWidth: 1, borderColor: colors.line, padding: 14 },
  optT: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.text },
  optS: { marginTop: 2, fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
});
