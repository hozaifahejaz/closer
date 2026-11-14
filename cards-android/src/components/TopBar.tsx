import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, fonts } from '../theme';
import { Icon, IconName } from './Icon';
import { tap } from './ui';
import { sheet, useK, useScaled } from '../scale';

export function RoundButton({ icon, label, onPress, disabled }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  const st = useScaled(base);
  const k = useK();
  return (
    <Pressable onPress={() => { tap(); onPress(); }} disabled={disabled} hitSlop={8} accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }} style={({ pressed }) => [st.round, pressed && { opacity: 0.7 }, disabled && { opacity: 0.35 }]}>
      <Icon name={icon} size={20 * k} color={colors.text} />
    </Pressable>
  );
}

// Back arrow, a title, and a few round buttons on the right. `maxWidth` lines the bar up with
// the screen's content column on tablets. It sits above the card, so a card that swings out
// while flipping passes under the buttons, not over them.
export function TopBar({ title, onBack, maxWidth = 560, children }: { title: string; onBack: () => void; maxWidth?: number; children?: ReactNode }) {
  const st = useScaled(base);
  const k = useK();
  return (
    <View style={st.bar}>
      <View style={[st.top, { maxWidth: maxWidth * k }]}>
        <RoundButton icon="left" label="Back" onPress={onBack} />
        <Text style={st.title} numberOfLines={1} accessibilityRole="header">{title}</Text>
        {children}
      </View>
    </View>
  );
}

const base = sheet({
  bar: { zIndex: 5, elevation: 12, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, width: '100%', alignSelf: 'center' },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line },
  title: { flex: 1, marginLeft: 4, fontFamily: fonts.serifBold, fontSize: 19, color: colors.text },
});
