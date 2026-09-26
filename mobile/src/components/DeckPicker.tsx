import { ReactNode, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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
  const count = sum(picked, d => d.count), unused = sum(picked, left), seen = sum(list, d => d.used);
  const short = height < 720;
  // Decks are upright cards (5:7), three to a row in two rows, sized to whatever height the screen leaves so nothing scrolls.
  const COLS = 3, ROWS = 2, GAP = width < 360 ? 10 : 14;
  const cardW = Math.max(60, Math.floor(Math.min((grid.w - GAP * (COLS - 1)) / COLS, ((grid.h - GAP * (ROWS - 1)) / ROWS) * (5 / 7), 190)));
  const cardH = Math.round(cardW * 7 / 5);

  const toggle = (name: string | null) => {
    tap();
    if (name === null) setSel(sel.size === list.length ? new Set() : new Set(list.map(d => d.name)));
    else { const next = new Set(sel); next.has(name) ? next.delete(name) : next.add(name); setSel(next); }
  };
  // Before the first deal there is no card to go back to, so closing leaves the room.
  const close = () => { if (room.started) send({ type: 'choose', on: false }); else onLeave(); };
  const start = () => { if (sel.size) send({ type: 'decks', decks: [...sel], fresh }); };

  const go = !picked.length ? 'Pick at least one deck'
    : fresh ? (unused ? `Start · ${unused} new` : "You've seen every card here")
    : saved && saved.index > 0 ? `Continue · card ${saved.index + 1} of ${saved.total}` : `Start · ${count} questions`;

  const tile = (name: string | null, label: string, blurb: string, cards: number, fresh_: number, on: boolean) => {
    const spent = fresh && !fresh_;
    const deck = name ?? 'All';
    const { c2 } = deckColors(deck);
    const nameSize = Math.max(10, Math.min(17, cardW * 0.11));
    const countSize = Math.max(7, Math.min(10.5, cardW * 0.068));
    const chk = Math.max(14, Math.min(20, cardW * 0.13));
    return (
      <Pressable key={label} onPress={() => toggle(name)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
        accessibilityLabel={`${label}. ${blurb}`}
        style={({ pressed }) => [st.card, { width: cardW, height: cardH, paddingVertical: cardW * 0.1, paddingHorizontal: cardW * 0.08 },
          on ? { backgroundColor: colors.card, borderColor: c2 + 'b3' } : st.cardOff, pressed && { transform: [{ scale: 0.97 }] }]}>
        <View style={{ marginBottom: cardW * 0.1, opacity: on ? (spent ? 0.5 : 1) : 0.4 }}>
          <DeckArt deck={deck} size={cardW * 0.46} dim={!on} spent={spent} />
        </View>
        <Text style={[st.nm, { fontSize: nameSize, lineHeight: nameSize * 1.15 }, !on && { color: colors.muted }]} numberOfLines={2}>{label}</Text>
        <Text style={[st.ct, { fontSize: countSize, color: on ? (spent ? colors.ink2 : c2) : colors.faint }]} numberOfLines={1}>
          {!fresh ? plural(cards, 'card', 'cards') : fresh_ ? `${fresh_} new` : 'All seen'}
        </Text>
        <View style={[st.chk, { width: chk, height: chk, borderRadius: chk / 2, top: Math.max(7, cardW * 0.07), right: Math.max(7, cardW * 0.07) },
          on ? { backgroundColor: c2, borderColor: c2 } : { borderColor: colors.line2 }]}>
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
        <View style={st.grid} onLayout={e => setGrid({ w: e.nativeEvent.layout.width - 28, h: e.nativeEvent.layout.height - 16 })}>
          {grid.w ? (
            <View style={[st.cards, { width: cardW * COLS + GAP * (COLS - 1), gap: GAP }]}>
              {[
            tile(null, 'All decks', 'Every question, shuffled together.', sum(list, d => d.count), sum(list, left), sel.size === list.length),
            ...list.map(d => tile(d.name, d.name, BLURBS[d.name] || '', d.count, left(d), sel.has(d.name))),
          ]}
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
  grid: { flex: 1, minHeight: 0, paddingHorizontal: 14, paddingVertical: 8, width: '100%', maxWidth: 980, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  cards: { flexDirection: 'row', flexWrap: 'wrap' },
  card: { borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 11, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  cardOff: { backgroundColor: colors.bg3, borderColor: colors.line2, shadowOpacity: 0, elevation: 0 },
  chk: { position: 'absolute', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  nm: { fontFamily: fonts.serif, color: colors.ink, textAlign: 'center' },
  ct: { marginTop: 4, fontFamily: fonts.sansBold, letterSpacing: 1.4, textTransform: 'uppercase', fontVariant: ['tabular-nums'] },
  foot: { paddingHorizontal: 20, paddingTop: 12, gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.bg, width: '100%', maxWidth: 620, alignSelf: 'center' },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.bg2, borderRadius: radius.control, borderWidth: 1, borderColor: colors.line, padding: 14 },
  optT: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.text },
  optS: { marginTop: 2, fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
});
