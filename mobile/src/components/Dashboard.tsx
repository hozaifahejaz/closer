import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_NAME } from '../brand';
import { num } from '../format';
import { colors, fonts, radius } from '../theme';
import { DeckArt } from './DeckArt';
import { Icon } from './Icon';
import { Button, HeartBadge } from './ui';
import { sheet, useK, useScaled } from '../scale';

type MenuItem = { title: string; onPress: () => void };
type Props = {
  title: string; subtitle: string; invite?: ReactNode; onOpen: () => void; onRetry?: () => void; retryTitle?: string; disabled?: boolean;
  menu: MenuItem[]; error?: string; promotion?: ReactNode; played?: number; started?: boolean; onAdmin?: () => void;
};

// The home screen for accounts and guest rooms: the deck fan, a welcome, the way into the
// cards for both of you, and how many you've played. Laid out like Stay Up With Me's home:
// the fan takes whatever height is left, so every screen size looks filled and balanced.
export function Dashboard({ title, subtitle, invite, onOpen, onRetry, retryTitle = 'Retry connection', disabled, menu, error, promotion, played, started, onAdmin }: Props) {
  const st = useScaled(base);
  const k = useK();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const short = height / k < 700;
  const wide = width >= 760 && width > height * 1.05;

  const [room, setRoom] = useState<{ w: number; h: number } | null>(null);
  const guess = wide ? Math.min(height * 0.7, width * 0.4) : Math.min(width * 0.7, height * (short ? 0.22 : 0.3));
  const artSize = room ? Math.min(room.w * (wide ? 0.95 : 1), room.h / 0.6) : guess;
  // With an invite or sign-up offer on screen, the fan only uses spare room and steps aside on short phones.
  const busy = !!invite || !!promotion;
  const hero = (
    <View style={[st.hero, wide ? { flex: 1 } : busy ? { flexGrow: 1, minHeight: 0, maxHeight: guess * 0.75 } : { flexGrow: 1, minHeight: guess * 0.6 }]}
      onLayout={e => { const { width: w, height: h } = e.nativeEvent.layout; setRoom(r => r && Math.abs(r.w - w) < 1 && Math.abs(r.h - h) < 1 ? r : { w, h }); }}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {artSize >= 70 * k ? <View style={st.heroArt}><DeckArt deck="All" size={artSize} /></View> : null}
    </View>
  );

  const welcome = (
    <View style={{ gap: 6 * k }}>
      <Text style={[st.title, short && { fontSize: 26 * k, lineHeight: 32 * k }]} accessibilityRole="header">{title}</Text>
      <Text style={st.sub}>{subtitle}</Text>
    </View>
  );

  const actions = (
    <View style={{ gap: 10 * k }}>
      <Button title={started ? 'Continue cards' : 'Open cards'} icon="cards" onPress={onOpen} disabled={disabled} />
      {error ? <Text accessibilityRole="alert" style={st.error}>{error}</Text> : null}
      {onRetry ? <Button kind="ghost" title={retryTitle} onPress={onRetry} /> : null}
      {onAdmin ? <Button kind="link" title="Admin dashboard" onPress={onAdmin} /> : null}
    </View>
  );

  const stat = (
    <View style={st.stat} accessible accessibilityLiveRegion="polite" accessibilityLabel={`${played ?? 0} cards played together`}>
      <Text style={st.statNum}>{played === undefined ? '…' : num(played)}</Text>
      <View style={{ flex: 1 }}>
        <Text style={st.statLabel}>Cards played together</Text>
        <Text style={st.statNote} numberOfLines={2}>Cards you&apos;ve revealed or answered in this shared room.</Text>
      </View>
    </View>
  );

  const column = <>
    {invite ? <View style={st.box}>{invite}</View> : null}
    {welcome}{actions}{stat}
    {promotion ? <View style={st.promotion}>{promotion}</View> : null}
  </>;

  return (
    <KeyboardAvoidingView style={st.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" bounces={false} overScrollMode="never"
        contentContainerStyle={[st.page, { paddingTop: insets.top + 12 * k, paddingBottom: Math.max(insets.bottom, 16 * k) + 4, paddingLeft: insets.left + 20 * k, paddingRight: insets.right + 20 * k }]}>
        <View style={[st.header, !wide && { maxWidth: 560 * k }]}>
          <View style={st.logo}><HeartBadge size={32} /><Text style={st.brand} numberOfLines={1}>{APP_NAME}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Open menu" accessibilityState={{ expanded: open }} onPress={() => setOpen(true)} hitSlop={6} style={st.menuButton}>
            <Icon name="menu" size={20 * k} color={colors.text} />
          </Pressable>
        </View>
        {wide ? (
          <View style={st.wide}>{hero}<View style={{ flex: 1, justifyContent: 'center', gap: 18 * k }}>{column}</View></View>
        ) : (
          <View style={[st.body, { gap: (short ? 14 : 20) * k }]}>{hero}{column}</View>
        )}
      </ScrollView>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable style={[st.overlay, { paddingTop: insets.top + 60 * k }]} accessibilityRole="button" accessibilityLabel="Close menu" onPress={() => setOpen(false)}>
          <View accessibilityViewIsModal style={st.menu}>
            {menu.map(item => (
              <Pressable key={item.title} accessibilityRole="button" onPress={() => { setOpen(false); item.onPress(); }}
                style={({ pressed }) => [st.item, pressed && { backgroundColor: colors.raise }]}>
                <Text style={[st.itemText, /delete|unlink|log out|leave/i.test(item.title) && { color: colors.bad }]}>{item.title}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const base = sheet({
  fill: { flex: 1, backgroundColor: colors.bg },
  page: { flexGrow: 1, width: '100%', maxWidth: 1100, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6, width: '100%', alignSelf: 'center' },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  brand: { fontFamily: fonts.serifBold, fontSize: 24, color: colors.text, flexShrink: 1 },
  menuButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  body: { flexGrow: 1, justifyContent: 'center', paddingVertical: 14, width: '100%', maxWidth: 560, alignSelf: 'center' },
  wide: { flexGrow: 1, flexDirection: 'row', gap: 36, paddingVertical: 16 },
  hero: { alignItems: 'center', justifyContent: 'center' },
  heroArt: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.serif, fontSize: 30, lineHeight: 37, letterSpacing: -0.6, color: colors.text },
  sub: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22, color: colors.muted },
  box: { padding: 18, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line, borderRadius: radius.box, gap: 12 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16, borderRadius: radius.box, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line },
  statNum: { fontFamily: fonts.sansBold, fontSize: 26, color: colors.text, letterSpacing: -0.4, fontVariant: ['tabular-nums'], minWidth: 28 },
  statLabel: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.text },
  statNote: { marginTop: 2, fontFamily: fonts.sans, fontSize: 12, lineHeight: 17, color: colors.muted },
  promotion: { paddingTop: 18, borderTopWidth: 1, borderTopColor: colors.line, gap: 10 },
  error: { fontFamily: fonts.sans, fontSize: 14, color: colors.bad, textAlign: 'center' },
  overlay: { flex: 1, backgroundColor: '#0008', alignItems: 'flex-end', paddingHorizontal: 16 },
  menu: { paddingVertical: 6, minWidth: 240, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line, borderRadius: radius.box, overflow: 'hidden' },
  item: { paddingVertical: 13, paddingHorizontal: 18 },
  itemText: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.text },
});
