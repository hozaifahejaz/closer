import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';
import { Icon, IconName } from './Icon';
import { tap } from './ui';

export function RoundButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={() => { tap(); onPress(); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [st.round, pressed && { opacity: 0.7 }]}>
      <Icon name={icon} size={20} color={colors.text} />
    </Pressable>
  );
}

// Back arrow, a title, and a few round buttons on the right.
export function TopBar({ title, onBack, children }: { title: string; onBack: () => void; children?: ReactNode }) {
  return (
    <View style={st.top}>
      <RoundButton icon="left" label="Back" onPress={onBack} />
      <Text style={st.title} numberOfLines={1} accessibilityRole="header">{title}</Text>
      {children}
    </View>
  );
}

const st = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, width: '100%', maxWidth: 1280, alignSelf: 'center' },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line },
  title: { flex: 1, marginLeft: 4, fontFamily: fonts.serifBold, fontSize: 19, color: colors.text },
});
