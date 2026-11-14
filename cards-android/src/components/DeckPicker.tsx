import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DeckInfo } from '../game';
import { colors, fonts } from '../theme';
import { DeckArt, deckColors } from './DeckArt';
import { num, plural } from '../format';
import { Icon } from './Icon';
import { Button, tap, Toggle } from './ui';
import { sheet, useK, useScaled } from '../scale';

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
  const st = useScaled(base);
  const k = useK();
  const { height } = useWindowDimensions();
  const short = height / k < 720;
  const [grid, setGrid] = useState({ w: 0, h: 0 });
  const insets = useSafeAreaInsets();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [freshOn, setFreshOn] = useState(false);
  // The fades at the top and bottom of the list follow the scroll on the UI thread, so scrolling
  // never waits for JavaScript and never redraws the tiles.
  const [scrollY] = useState(() => new Animated.Value(0));
  const [maxY, setMaxY] = useState(0);
  const listRef = useRef<ScrollView>(null);

  // Start from what is being played now, each time the picker opens.
  useEffect(() => {
    if (!visible) return;
    setSel(new Set(decks.length ? decks : list.map(d => d.name)));
    setFreshOn(freshNow);
    scrollY.setValue(0);
    listRef.current?.scrollTo({ y: 0, animated: false });
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
  const layout = aspect >= 10 / 7 ? { cols: 4, rows: 1, gap: 16 * k, wide: 5 / 7 } : grid.w >= 572 ? { cols: 3, rows: 2, gap: 14 * k, wide: 5 / 7 } : { cols: 2, rows: 2, gap: 12 * k, wide: 0.88 };
  const COLS = layout.cols;
  const peek = Math.max(14 * k, Math.min(30 * k, grid.h * 0.05));
  const rowH = Math.max(130 * k, (grid.h - peek - layout.rows * layout.gap) / layout.rows);
  const cardW = Math.floor(Math.min(rowH * layout.wide, (grid.w - layout.gap * (COLS - 1)) / COLS));
  const cardH = Math.floor(Math.min(rowH, cardW * 7 / 4));
  // When width limits the cards, the box shrinks to four cards and a peek, centred, instead of showing half the next row.
  const boxH = Math.min(grid.h + 10 * k, layout.rows * (cardH + layout.gap) + peek + 10 * k);
  const onScroll = useMemo(() => Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true }), [scrollY]);
  const topFade = scrollY.interpolate({ inputRange: [0, 24], outputRange: [0, 1], extrapolate: 'clamp' });
  const bottomFade = scrollY.interpolate({ inputRange: [Math.max(0, maxY - 24), Math.max(1, maxY)], outputRange: [1, 0], extrapolate: 'clamp' });

  const names = useMemo(() => list.map(d => d.name).join('\n'), [list]);
  const fan = useMemo(() => names.split('\n').map(n => deckColors(n).c1), [names]);
  // The same function every render, so tapping one deck redraws only the tiles that changed.
  const toggle = useCallback((name: string | null) => {
    tap();
    const all = names.split('\n');
    setSel(sel => {
      if (name === null) return sel.size === all.length ? new Set() : new Set(all);
      const next = new Set(sel); if (next.has(name)) next.delete(name); else next.add(name); return next;
    });
  }, [names]);
  const start = () => { if (picked.length) onStart(picked.map(d => d.name), fresh); };

  const go = !picked.length ? 'Pick at least one deck'
    : fresh ? (unused ? 'Start' : "You've seen every card here")
    : saved && saved.index > 0 ? `Continue · card ${num(saved.index + 1)} of ${num(saved.total)}` : 'Start';

  const tileSize = { cardW, cardH, k };
  const tiles = [
    { name: null, label: 'All decks', cards: sum(list, d => d.count), fresh_: sum(list, left), on: sel.size === list.length },
    ...list.map(d => ({ name: d.name, label: d.name, cards: d.count, fresh_: left(d), on: sel.has(d.name) })),
  ];

  const column = cardW * COLS + layout.gap * (COLS - 1) + 28 * k; // the cards plus their side padding

  return (
    <Modal visible={visible} animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose} statusBarTranslucent>
      <View style={[st.sheet, { paddingTop: Platform.OS === 'ios' ? 12 : insets.top + 8 * k }]}>
        <View style={st.grabber} />
        <View style={[st.head, grid.w ? { maxWidth: Math.max(column, 320 * k) } : null]}>
          <Text style={st.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} accessibilityRole="header">Choose your decks</Text>
          <Pressable onPress={() => { tap(); onClose(); }} hitSlop={10} style={st.x} accessibilityRole="button" accessibilityLabel={started ? 'Back to the card' : 'Close'}>
            <Icon name="close" size={18 * k} color={colors.muted} />
          </Pressable>
        </View>
        <View style={st.grid} onLayout={e => setGrid({ w: e.nativeEvent.layout.width - 28 * k, h: e.nativeEvent.layout.height - 10 * k })}>
          {grid.w ? (
            <View style={{ height: boxH, width: '100%' }}>
              {/* Plain, free scrolling with normal momentum: no snapping to rows, which made it jerky. */}
              <Animated.ScrollView ref={listRef} style={st.scroll} contentContainerStyle={st.scrollIn} onScroll={onScroll} scrollEventThrottle={16}
                onContentSizeChange={(_, h) => setMaxY(Math.max(0, Math.round(h - boxH)))}
                showsVerticalScrollIndicator={false} overScrollMode="never" removeClippedSubviews={Platform.OS === 'android'}>
                <View style={[st.cards, { width: cardW * COLS + layout.gap * (COLS - 1), columnGap: layout.gap, rowGap: layout.gap }]}>
                  {tiles.map(t => <DeckTile key={t.label} {...t} {...tileSize} fresh={fresh} fan={fan} onToggle={toggle} st={st} />)}
                </View>
              </Animated.ScrollView>
              <Animated.View pointerEvents="none" style={[st.fade, { top: 0, opacity: topFade }]}><LinearGradient colors={[colors.bg, colors.bg + '00']} style={StyleSheet.absoluteFill} /></Animated.View>
              {maxY > 2 ? <Animated.View pointerEvents="none" style={[st.fade, { bottom: 0, opacity: bottomFade }]}><LinearGradient colors={[colors.bg + '00', colors.bg]} style={StyleSheet.absoluteFill} /></Animated.View> : null}
            </View>
          ) : null}
        </View>
        <View style={[st.foot, { paddingBottom: Math.max(insets.bottom, (short ? 10 : 16) * k) }]}>
          <View style={st.opt}>
            <Text style={st.optT} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>Only cards I haven&apos;t seen</Text>
            <Toggle on={fresh} onChange={setFreshOn} label="Only cards I haven't seen" />
          </View>
          <Button title={go} onPress={start} disabled={!picked.length || (fresh && !unused)} style={short && { minHeight: 48 * k }} />
        </View>
      </View>
    </Modal>
  );
}

type TileProps = { name: string | null; label: string; cards: number; fresh_: number; on: boolean; fresh: boolean;
  cardW: number; cardH: number; k: number; fan: string[]; onToggle: (name: string | null) => void; st: ReturnType<typeof useScaled<typeof base>> };

// One deck. Memoised, so scrolling and tapping other decks never redraw it.
const DeckTile = memo(function DeckTile({ name, label, cards, fresh_, on, fresh, cardW, cardH, k, fan, onToggle, st }: TileProps) {
  const spent = fresh && !fresh_;
  const deck = name ?? 'All';
  const { c2 } = deckColors(deck);
  // Type and art scale with the card; each card shows just the deck's name and card count.
  const m = Math.min(cardW, cardH * 1.1);
  const low = cardH < 150 * k;
  const nameSize = Math.max(14 * k, Math.min(23 * k, cardW * 0.1, cardH * 0.12));
  const countSize = Math.max(9 * k, Math.min(11.5 * k, cardW * 0.056, cardH * 0.07));
  const art = Math.min(cardW * 0.44, cardH * (low ? 0.32 : 0.36));
  const chk = Math.max(18 * k, Math.min(26 * k, m * 0.12));
  const inset = Math.max(8 * k, Math.min(14 * k, m * 0.06));
  const count = !fresh ? plural(cards, 'card', 'cards') : fresh_ ? `${num(fresh_)} new` : 'All seen';
  const lineH = nameSize * 1.15;
  // A picked deck is bright with a strong ring in its colour; an unpicked one fades back.
  // The art sits on the same line in every card and the name always has room for two lines,
  // so the counts line up across a row even when one name wraps.
  return (
    <Pressable onPress={() => onToggle(name)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
      accessibilityLabel={`${label}, ${count}, ${on ? 'picked' : 'not picked'}`}
      style={({ pressed }) => [st.card, { width: cardW, height: cardH, paddingHorizontal: low ? 6 * k : cardW * 0.07 },
        { borderColor: on ? c2 : c2 + '40' }, !on && st.off, pressed && { transform: [{ scale: 0.97 }] }]}>
      <View style={{ height: art, marginBottom: Math.min(18 * k, cardH * (low ? 0.03 : 0.05)), opacity: spent ? 0.5 : 1 }}>
        <DeckArt deck={deck} size={art} spent={spent} fan={fan} />
      </View>
      <View style={{ height: lineH * 2, justifyContent: 'center' }}>
        <Text style={[st.nm, { fontSize: nameSize, lineHeight: lineH }]} numberOfLines={2}>{label.replace(/-/g, '\u2011')}</Text>
      </View>
      {cardH < 110 * k ? null : (
        <Text style={[st.ct, { fontSize: countSize, color: spent ? colors.ink2 : c2, marginTop: Math.min(10 * k, cardH * (low ? 0.02 : 0.03)) }]} numberOfLines={1}>{count}</Text>
      )}
      <View style={[st.chk, { width: chk, height: chk, borderRadius: chk / 2, top: inset, right: inset },
        on ? { backgroundColor: c2, borderColor: c2 } : { borderColor: c2 + '80', borderWidth: 1.5 }]}>
        {on ? <Icon name="check" size={chk * 0.7} color="#fff" strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
});

const base = sheet({
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
  card: { borderRadius: 16, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  chk: { position: 'absolute', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  nm: { fontFamily: fonts.serif, color: colors.ink, textAlign: 'center' },
  ct: { marginTop: 4, fontFamily: fonts.sansBold, letterSpacing: 1.4, textTransform: 'uppercase', fontVariant: ['tabular-nums'] },
  foot: { paddingHorizontal: 20, paddingTop: 8, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.bg, width: '100%', maxWidth: 620, alignSelf: 'center' },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 4, minHeight: 32 },
  optT: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 14.5, color: colors.soft },
});
