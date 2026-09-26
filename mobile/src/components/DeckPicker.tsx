import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RoomState } from '../api';
import { colors, fonts, radius } from '../theme';
import { Icon, IconName } from './Icon';
import { Button, tap, Toggle } from './ui';

const BLURBS: Record<string, string> = {
  'Getting Closer': 'Warm, easy questions to open up.',
  'Who You Are': 'Your past, your values, what shaped you.',
  'Us & The Future': 'Dreams, plans and the life you are building.',
  'Honest & Vulnerable': 'The deeper things that are harder to say.',
  'Light & Playful': 'Fun, silly and nostalgic.',
};
const ICONS: Record<string, IconName> = {
  'Getting Closer': 'chat', 'Who You Are': 'user', 'Us & The Future': 'sun', 'Honest & Vulnerable': 'heart', 'Light & Playful': 'spark',
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const sum = <T,>(list: T[], f: (x: T) => number) => list.reduce((n, x) => n + f(x), 0);

// Choosing decks is shared: when one of you opens the picker, it opens for both,
// and starting deals the same cards to both phones.
export function DeckPicker({ room, send }: { room: RoomState; send: (a: any) => void }) {
  const { width, height } = useWindowDimensions();
  const [gridH, setGridH] = useState(0);
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
  const cols = width >= 900 ? 3 : 2;
  const short = height < 720;
  // Tiles share the height the screen leaves them, and show less detail when they're short, so nothing scrolls.
  const tileCount = list.length + 1;
  const rows = Math.ceil(tileCount / cols);
  const rowH = gridH ? gridH / rows : 999;
  const showBlurb = rowH >= 188;
  const showIcon = rowH >= 148;
  const narrow = width < 360;

  const toggle = (name: string | null) => {
    tap();
    if (name === null) setSel(sel.size === list.length ? new Set() : new Set(list.map(d => d.name)));
    else { const next = new Set(sel); next.has(name) ? next.delete(name) : next.add(name); setSel(next); }
  };
  const close = () => { if (room.started) send({ type: 'choose', on: false }); };
  const start = () => { if (sel.size) send({ type: 'decks', decks: [...sel], fresh }); };

  const go = !picked.length ? 'Pick at least one deck'
    : fresh ? (unused ? `Start · ${unused} new` : "You've seen every card here")
    : saved && saved.index > 0 ? `Continue · card ${saved.index + 1} of ${saved.total}` : `Start · ${count} questions`;

  const tile = (name: string | null, label: string, blurb: string, icon: IconName, cards: number, fresh_: number, on: boolean) => {
    const spent = fresh && !fresh_;
    return (
      <Pressable key={label} onPress={() => toggle(name)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
        accessibilityLabel={`${label}. ${blurb}`}
        style={({ pressed }) => [st.tile, pressed && { transform: [{ scale: 0.98 }] }]}>
        <View style={[st.tileIn, on && st.tileOn, spent && { opacity: 0.55 }]}>
          {on ? <LinearGradient colors={['rgba(232,118,111,0.20)', 'rgba(109,58,120,0.12)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: radius.box }]} /> : null}
          <View style={[st.tileTop, !showIcon && { marginBottom: 6 }]}>
            {showIcon ? (
              <View style={[st.emb, on && { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                <Icon name={icon} size={20} color={colors.accent2} fill={icon === 'heart'} strokeWidth={icon === 'heart' ? 0 : 1.8} />
              </View>
            ) : <Icon name={icon} size={16} color={colors.accent2} fill={icon === 'heart'} strokeWidth={icon === 'heart' ? 0 : 1.8} />}
            <View style={[st.chk, on && st.chkOn]}>{on ? <Icon name="check" size={14} color={colors.onPrimary} strokeWidth={2.6} /> : null}</View>
          </View>
          <Text style={[st.nm, narrow && { fontSize: 15 }]} numberOfLines={2}>{label}</Text>
          {showBlurb ? <Text style={st.bl} numberOfLines={2}>{blurb}</Text> : <View style={{ flex: 1 }} />}
          <Text style={[st.ct, on && { color: colors.accent2 }]}>{!fresh ? plural(cards, 'card', 'cards') : fresh_ ? `${fresh_} new` : 'All seen'}</Text>
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
          {room.started ? (
            <Pressable onPress={close} hitSlop={10} style={st.x} accessibilityRole="button" accessibilityLabel="Back to the card">
              <Icon name="close" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        <View style={st.grid} onLayout={e => setGridH(e.nativeEvent.layout.height)}>
          {Array.from({ length: rows }, (_, r) => (
            <View key={r} style={st.gridRow}>
              {[
                tile(null, 'All decks', 'Every question, shuffled together.', 'cards', sum(list, d => d.count), sum(list, left), sel.size === list.length),
                ...list.map(d => tile(d.name, d.name, BLURBS[d.name] || '', ICONS[d.name] || 'cards', d.count, left(d), sel.has(d.name))),
              ].slice(r * cols, r * cols + cols)}
              {r === rows - 1 && tileCount % cols ? Array.from({ length: cols - (tileCount % cols) }, (_, i) => <View key={`pad${i}`} style={st.tile} />) : null}
            </View>
          ))}
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
  grid: { flex: 1, minHeight: 0, paddingHorizontal: 14, paddingBottom: 8, width: '100%', maxWidth: 980, alignSelf: 'center' },
  gridRow: { flex: 1, minHeight: 0, flexDirection: 'row' },
  tile: { flex: 1, padding: 5 },
  tileIn: { flex: 1, borderRadius: radius.box, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg2, padding: 12, overflow: 'hidden' },
  tileOn: { borderColor: colors.accent },
  tileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  emb: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.bg3, alignItems: 'center', justifyContent: 'center' },
  chk: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.line2, alignItems: 'center', justifyContent: 'center' },
  chkOn: { backgroundColor: colors.accent2, borderColor: colors.accent2 },
  nm: { fontFamily: fonts.serifBold, fontSize: 17, color: colors.text },
  bl: { marginTop: 4, fontFamily: fonts.sans, fontSize: 13, lineHeight: 18, color: colors.muted, flex: 1 },
  ct: { marginTop: 6, fontFamily: fonts.sansBold, fontSize: 12, color: colors.faint, letterSpacing: 0.3 },
  foot: { paddingHorizontal: 20, paddingTop: 12, gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.bg, width: '100%', maxWidth: 620, alignSelf: 'center' },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.bg2, borderRadius: radius.control, borderWidth: 1, borderColor: colors.line, padding: 14 },
  optT: { fontFamily: fonts.sansBold, fontSize: 15, color: colors.text },
  optS: { marginTop: 2, fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
});
