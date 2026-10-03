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
  'Midnight Questions': 'The strange, big thoughts that come out late at night.',
  'Money & Work': 'Jobs, ambition, spending and saving.',
  'Alien Interview': 'Explain life on Earth, and the two of you, to an alien.',
  'Genie Wishes': 'Three wishes, but the genie has rules.',
  Amnesia: 'What if one of you woke up and forgot everything?',
  'Act It Out': "Show, don't tell. Act out your answer.",
  'Job Interview': 'Interview each other for the role of partner.',
  Unsent: 'The messages you wrote and never sent.',
  'Bad Advice': 'Terrible advice only.',
  'How Much Would You Pay': 'Put a price on the things that matter.',
  'The Worst': 'Worst dates, photos and ideas. The funnier the better.',
  'Tiny Vows': 'Small, everyday promises.',
  'Comfort Codes': 'How each of you likes to be looked after.',
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const sum = <T,>(list: T[], f: (x: T) => number) => list.reduce((n, x) => n + f(x), 0);

// Choosing decks is shared: when one of you opens the picker, it opens for both,
// and starting deals the same cards to both phones.
export function DeckPicker({ room, send, onLeave, banner }: { room: RoomState; send: (a: any) => void; onLeave: () => void; banner?: ReactNode }) {
  const { height } = useWindowDimensions();
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
  // Four decks show at a time as upright cards, as big as the space between the heading and the
  // Start button allows: 2 by 2 on tall spaces, 4 in a row on wide ones. Cards are playing-card shaped
  // (5:7) when height limits them and grow taller (up to 4:7) when width does. A sliver of the next
  // row peeks out to show the rest scroll.
  const aspect = grid.h ? grid.w / grid.h : 0;
  const layout = aspect >= 10 / 7 ? { cols: 4, rows: 1, gap: 16 } : { cols: 2, rows: 2, gap: 12 };
  const COLS = layout.cols;
  const peek = Math.max(14, Math.min(30, grid.h * 0.05));
  const rowH = Math.max(130, (grid.h - peek - layout.rows * layout.gap) / layout.rows);
  const cardW = Math.floor(Math.min(rowH * 5 / 7, (grid.w - layout.gap * (COLS - 1)) / COLS));
  const cardH = Math.floor(Math.min(rowH, cardW * 7 / 4));
  // When width limits the cards, the box shrinks to four cards and a peek, centred, instead of showing half the next row.
  const boxH = Math.min(grid.h + 10, layout.rows * (cardH + layout.gap) + peek + 10);
  const [edge, setEdge] = useState({ above: false, below: false });
  const onScroll = ({ nativeEvent: n }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const above = n.contentOffset.y > 2, below = n.contentOffset.y + n.layoutMeasurement.height < n.contentSize.height - 2;
    if (above !== edge.above || below !== edge.below) setEdge({ above, below });
  };

  const fan = list.map(d => deckColors(d.name).c1);
  const toggle = (name: string | null) => {
    tap();
    if (name === null) setSel(sel.size === list.length ? new Set() : new Set(list.map(d => d.name)));
    else { const next = new Set(sel); if (next.has(name)) next.delete(name); else next.add(name); setSel(next); }
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
    // Type and art scale with the card; each card shows just the deck's name and card count.
    const m = Math.min(cardW, cardH * 1.1);
    const low = cardH < 150;
    const nameSize = Math.max(14, Math.min(23, cardW * 0.1, cardH * 0.12));
    const countSize = Math.max(9, Math.min(11.5, cardW * 0.056, cardH * 0.07));
    const art = Math.min(cardW * 0.44, cardH * (low ? 0.32 : 0.36));
    const chk = Math.max(18, Math.min(26, m * 0.12));
    const inset = Math.max(8, Math.min(14, m * 0.06));
    return (
      <Pressable key={label} onPress={() => toggle(name)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
        accessibilityLabel={`${label}. ${blurb}`}
        style={({ pressed }) => [st.card, { width: cardW, height: cardH, paddingVertical: low ? 8 : cardH * 0.08, paddingHorizontal: low ? 6 : cardW * 0.08 },
          { backgroundColor: colors.card, borderColor: c2 + 'b3' }, pressed && { transform: [{ scale: 0.97 }] }]}>
        <View style={{ marginBottom: Math.min(22, cardH * (low ? 0.04 : 0.06)), opacity: spent ? 0.5 : 1 }}>
          <DeckArt deck={deck} size={art} spent={spent} fan={fan} />
        </View>
        <Text style={[st.nm, { fontSize: nameSize, lineHeight: nameSize * 1.15 }]} numberOfLines={2}>{label.replace(/-/g, '\u2011')}</Text>
        {cardH < 110 ? null : (
          <Text style={[st.ct, { fontSize: countSize, color: spent ? colors.ink2 : c2, marginTop: Math.min(12, cardH * (low ? 0.02 : 0.04)) }]} numberOfLines={1}>
            {!fresh ? plural(cards, 'card', 'cards') : fresh_ ? `${fresh_} new` : 'All seen'}
          </Text>
        )}
        <View style={[st.chk, { width: chk, height: chk, borderRadius: chk / 2, top: inset, right: inset },
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
        <View style={st.grid} onLayout={e => setGrid({ w: e.nativeEvent.layout.width - 28, h: e.nativeEvent.layout.height - 10 })}>
          {grid.w ? (
            <View style={{ height: boxH, width: '100%' }}>
              <ScrollView style={st.scroll} contentContainerStyle={st.scrollIn} onScroll={onScroll} onContentSizeChange={(_, h) => setEdge(x => ({ ...x, below: h > boxH + 2 }))}
                scrollEventThrottle={32} showsVerticalScrollIndicator={false} bounces={false} overScrollMode="never"
                snapToInterval={cardH + layout.gap} decelerationRate="fast" snapToAlignment="start">
                <View style={[st.cards, { width: cardW * COLS + layout.gap * (COLS - 1), columnGap: layout.gap, rowGap: layout.gap }]}>
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
                <Text style={st.optT}>Only cards we haven&apos;t seen</Text>
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
  grid: { flex: 1, minHeight: 0, width: '100%', maxWidth: 1060, alignSelf: 'center', justifyContent: 'center', overflow: 'hidden' },
  scroll: { flex: 1 },
  scrollIn: { alignItems: 'center', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' },
  fade: { position: 'absolute', left: 0, right: 0, height: 36 },
  card: { borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 11, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  chk: { position: 'absolute', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  nm: { fontFamily: fonts.serif, color: colors.ink, textAlign: 'center' },
  ct: { marginTop: 4, fontFamily: fonts.sansBold, letterSpacing: 1.4, textTransform: 'uppercase', fontVariant: ['tabular-nums'] },
  foot: { paddingHorizontal: 20, paddingTop: 12, gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.bg, width: '100%', maxWidth: 620, alignSelf: 'center' },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.bg2, borderRadius: radius.control, borderWidth: 1, borderColor: colors.line, padding: 14 },
  optT: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.text },
  optS: { marginTop: 2, fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
});
