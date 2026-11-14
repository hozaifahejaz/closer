import { useEffect, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Modal, NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DeckInfo } from '../game';
import { colors, fonts } from '../theme';
import { DeckArt, deckColors } from './DeckArt';
import { num, plural } from '../format';
import { Icon } from './Icon';
import { Button, tap, Toggle } from './ui';

const sum = <T,>(list: T[], f: (x: T) => number) => list.reduce((n, x) => n + f(x), 0);

type Props = {
  visible: boolean;
  list: DeckInfo[];
  decks: string[]; // what is being played now; [] means every deck
  fresh: boolean;
  started: boolean;
  saved: Record<string, { index: number; total: number }>;
  onStart: (decks: string[], fresh: boolean) => void;
  onClose: () => void;
};

// Pick one deck, a few, or all of them. Each set of decks remembers its place.
export function DeckPicker({ visible, list, decks, fresh: freshNow, started, saved: places, onStart, onClose }: Props) {
  const { height } = useWindowDimensions();
  const short = height < 720;
  const [grid, setGrid] = useState({ w: 0, h: 0 });
  const insets = useSafeAreaInsets();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [freshOn, setFreshOn] = useState(false);
  const [edge, setEdge] = useState({ above: false, below: false });

  // Start from what is being played now, each time the picker opens.
  useEffect(() => {
    if (!visible) return;
    setSel(new Set(decks.length ? decks : list.map(d => d.name)));
    setFreshOn(freshNow);
    setEdge(e => e.above ? { ...e, above: false } : e);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const fresh = freshOn;
  const left = (d: { count: number; used: number }) => d.count - d.used;
  const picked = list.filter(d => sel.has(d.name));
  const key = picked.length === list.length ? 'All' : picked.map(d => d.name).join('|');
  const saved = places[key];
  const unused = sum(picked, left);
  // Decks show as upright cards, as big as the space between the heading and the Start button
  // allows: 2 by 2 on phones, 3 by 2 on tablets, 4 in a row on wide screens. They never shrink to
  // fit more in; the rest scroll, and a sliver of the next row peeks out to show it. On a phone a
  // card fills its half of the width whenever its height allows, and grows taller (up to 4:7)
  // when there is height to spare.
  const aspect = grid.h ? grid.w / grid.h : 0;
  const layout = aspect >= 10 / 7 ? { cols: 4, rows: 1, gap: 16, wide: 5 / 7 } : grid.w >= 572 ? { cols: 3, rows: 2, gap: 14, wide: 5 / 7 } : { cols: 2, rows: 2, gap: 12, wide: 0.88 };
  const COLS = layout.cols;
  const peek = Math.max(14, Math.min(30, grid.h * 0.05));
  const rowH = Math.max(130, (grid.h - peek - layout.rows * layout.gap) / layout.rows);
  const cardW = Math.floor(Math.min(rowH * layout.wide, (grid.w - layout.gap * (COLS - 1)) / COLS));
  const cardH = Math.floor(Math.min(rowH, cardW * 7 / 4));
  // When width limits the cards, the box shrinks to four cards and a peek, centred, instead of showing half the next row.
  const boxH = Math.min(grid.h + 10, layout.rows * (cardH + layout.gap) + peek + 10);
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
  const start = () => { if (picked.length) onStart(picked.map(d => d.name), fresh); };

  const go = !picked.length ? 'Pick at least one deck'
    : fresh ? (unused ? 'Start' : "You've seen every card here")
    : saved && saved.index > 0 ? `Continue · card ${num(saved.index + 1)} of ${num(saved.total)}` : 'Start';

  const tile = (name: string | null, label: string, cards: number, fresh_: number, on: boolean) => {
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
    const count = !fresh ? plural(cards, 'card', 'cards') : fresh_ ? `${num(fresh_)} new` : 'All seen';
    const lineH = nameSize * 1.15;
    // A picked deck is bright with a strong ring in its colour; an unpicked one fades back.
    // The art sits on the same line in every card and the name always has room for two lines,
    // so the counts line up across a row even when one name wraps.
    return (
      <Pressable key={label} onPress={() => toggle(name)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
        accessibilityLabel={`${label}, ${count}, ${on ? 'picked' : 'not picked'}`}
        style={({ pressed }) => [st.card, { width: cardW, height: cardH, paddingHorizontal: low ? 6 : cardW * 0.07 },
          { backgroundColor: colors.card, borderColor: on ? c2 : c2 + '40' }, !on && st.off, pressed && { transform: [{ scale: 0.97 }] }]}>
        <View style={{ height: art, marginBottom: Math.min(18, cardH * (low ? 0.03 : 0.05)), opacity: spent ? 0.5 : 1 }}>
          <DeckArt deck={deck} size={art} spent={spent} fan={fan} />
        </View>
        <View style={{ height: lineH * 2, justifyContent: 'center' }}>
          <Text style={[st.nm, { fontSize: nameSize, lineHeight: lineH }]} numberOfLines={2}>{label.replace(/-/g, '\u2011')}</Text>
        </View>
        {cardH < 110 ? null : (
          <Text style={[st.ct, { fontSize: countSize, color: spent ? colors.ink2 : c2, marginTop: Math.min(10, cardH * (low ? 0.02 : 0.03)) }]} numberOfLines={1}>{count}</Text>
        )}
        <View style={[st.chk, { width: chk, height: chk, borderRadius: chk / 2, top: inset, right: inset },
          on ? { backgroundColor: c2, borderColor: c2 } : { borderColor: c2 + '80', borderWidth: 1.5 }]}>
          {on ? <Icon name="check" size={chk * 0.7} color="#fff" strokeWidth={3} /> : null}
        </View>
      </Pressable>
    );
  };

  const column = cardW * COLS + layout.gap * (COLS - 1) + 28; // the cards plus their side padding

  return (
    <Modal visible={visible} animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose} statusBarTranslucent>
      <View style={[st.sheet, { paddingTop: Platform.OS === 'ios' ? 12 : insets.top + 8 }]}>
        <View style={st.grabber} />
        <View style={[st.head, grid.w ? { maxWidth: Math.max(column, 320) } : null]}>
          <Text style={st.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} accessibilityRole="header">Choose your decks</Text>
          <Pressable onPress={() => { tap(); onClose(); }} hitSlop={10} style={st.x} accessibilityRole="button" accessibilityLabel={started ? 'Back to the card' : 'Close'}>
            <Icon name="close" size={18} color={colors.muted} />
          </Pressable>
        </View>
        <View style={st.grid} onLayout={e => setGrid({ w: e.nativeEvent.layout.width - 28, h: e.nativeEvent.layout.height - 10 })}>
          {grid.w ? (
            <View style={{ height: boxH, width: '100%' }}>
              <ScrollView style={st.scroll} contentContainerStyle={st.scrollIn} onScroll={onScroll} onContentSizeChange={(_, h) => setEdge(x => ({ ...x, below: h > boxH + 2 }))}
                scrollEventThrottle={32} showsVerticalScrollIndicator={false} bounces={false} overScrollMode="never"
                snapToInterval={cardH + layout.gap} decelerationRate="fast" snapToAlignment="start">
                <View style={[st.cards, { width: cardW * COLS + layout.gap * (COLS - 1), columnGap: layout.gap, rowGap: layout.gap }]}>
                  {[
                    tile(null, 'All decks', sum(list, d => d.count), sum(list, left), sel.size === list.length),
                    ...list.map(d => tile(d.name, d.name, d.count, left(d), sel.has(d.name))),
                  ]}
                </View>
              </ScrollView>
              {edge.above ? <LinearGradient pointerEvents="none" colors={[colors.bg, colors.bg + '00']} style={[st.fade, { top: 0 }]} /> : null}
              {edge.below ? <LinearGradient pointerEvents="none" colors={[colors.bg + '00', colors.bg]} style={[st.fade, { bottom: 0 }]} /> : null}
            </View>
          ) : null}
        </View>
        <View style={[st.foot, { paddingBottom: Math.max(insets.bottom, short ? 10 : 16) }]}>
          <View style={st.opt}>
            <Text style={st.optT} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>Only cards I haven&apos;t seen</Text>
            <Toggle on={fresh} onChange={setFreshOn} label="Only cards I haven't seen" />
          </View>
          <Button title={go} onPress={start} disabled={!picked.length || (fresh && !unused)} style={short && { minHeight: 48 }} />
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.bg },
  grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: colors.line2, marginBottom: 14, display: Platform.OS === 'ios' ? 'flex' : 'none' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 6, width: '100%', maxWidth: 980, alignSelf: 'center' },
  title: { flex: 1, fontFamily: fonts.serifBold, fontSize: 23, color: colors.text, letterSpacing: -0.3 },
  x: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  grid: { flex: 1, minHeight: 0, width: '100%', maxWidth: 1060, alignSelf: 'center', justifyContent: 'center', overflow: 'hidden' },
  scroll: { flex: 1 },
  scrollIn: { alignItems: 'center', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' },
  fade: { position: 'absolute', left: 0, right: 0, height: 36 },
  off: { opacity: 0.5, elevation: 0, shadowOpacity: 0 },
  card: { borderRadius: 16, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 11, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  chk: { position: 'absolute', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  nm: { fontFamily: fonts.serif, color: colors.ink, textAlign: 'center' },
  ct: { marginTop: 4, fontFamily: fonts.sansBold, letterSpacing: 1.4, textTransform: 'uppercase', fontVariant: ['tabular-nums'] },
  foot: { paddingHorizontal: 20, paddingTop: 8, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.bg, width: '100%', maxWidth: 620, alignSelf: 'center' },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 4, minHeight: 32 },
  optT: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 14.5, color: colors.soft },
});
