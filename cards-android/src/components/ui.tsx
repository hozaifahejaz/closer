import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { buttonGradient, cardGradient, colors, fonts, radius } from '../theme';
import { Icon, IconName } from './Icon';
import { sheet, useK, useScaled } from '../scale';

// Vibration can be switched off in the menu.
let hapticsOn = true;
export const setHapticsOn = (on: boolean) => { hapticsOn = on; };
export const tap = () => { if (hapticsOn) Haptics.selectionAsync().catch(() => {}); };
export const bump = (strong = false) => {
  if (hapticsOn) Haptics.impactAsync(strong ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

type ButtonProps = {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'ghost' | 'link' | 'danger';
  icon?: IconName;
  iconRight?: IconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function Button({ title, onPress, kind = 'primary', icon, iconRight, disabled, style, accessibilityLabel }: ButtonProps) {
  const st = useScaled(base);
  const k = useK();
  const off = !!disabled;
  const tint = kind === 'primary' ? colors.onPrimary : kind === 'link' ? colors.muted : kind === 'danger' ? colors.bad : colors.text;
  const body = (
    <>
      {icon ? <Icon name={icon} size={18 * k} color={tint} /> : null}
      {title ? <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[st.btnText, { color: tint }, kind === 'link' && st.linkText]}>{title}</Text> : null}
      {iconRight ? <Icon name={iconRight} size={18 * k} color={tint} /> : null}
    </>
  );
  return (
    <Pressable
      onPress={() => { tap(); onPress(); }}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: off }}
      hitSlop={kind === 'link' ? 8 : 0}
      style={({ pressed }) => [kind === 'link' ? st.link : st.btn, (kind === 'ghost' || kind === 'danger') && st.ghost, style,
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 }, off && { opacity: 0.5 }]}
    >
      {kind === 'primary' ? (
        <LinearGradient colors={buttonGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: radius.control * k }]} />
      ) : null}
      {body}
    </Pressable>
  );
}

// The website's rounded switch, animated natively.
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  const st = useScaled(base);
  const k = useK();
  const [x] = useState(() => new Animated.Value(on ? 1 : 0));
  useEffect(() => { Animated.spring(x, { toValue: on ? 1 : 0, useNativeDriver: true, speed: 20, bounciness: 4 }).start(); }, [on, x]);
  return (
    <Pressable onPress={() => { tap(); onChange(!on); }} accessibilityRole="switch" accessibilityLabel={label}
      accessibilityState={{ checked: on }} hitSlop={10} style={[st.switch, !on && st.switchOff]}>
      {on ? <LinearGradient colors={buttonGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 999 }]} /> : null}
      <Animated.View style={[st.knob, { backgroundColor: on ? '#fff' : colors.soft, transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, 18 * k] }) }] }]} />
    </Pressable>
  );
}

export function HeartBadge({ size: phoneSize = 36 }: { size?: number }) {
  const size = phoneSize * useK();
  return (
    <LinearGradient colors={cardGradient} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
      style={{ width: size, height: size, borderRadius: size * 0.32, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="heart" size={size * 0.52} color="#fff" fill strokeWidth={0} />
    </LinearGradient>
  );
}

const base = sheet({
  btn: { minHeight: 52, borderRadius: radius.control, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, overflow: 'hidden' },
  ghost: { borderWidth: 1, borderColor: colors.line, backgroundColor: 'transparent' },
  btnText: { fontFamily: fonts.sansBold, fontSize: 16, flexShrink: 1 },
  link: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  linkText: { fontFamily: fonts.sansMedium, fontSize: 14, textDecorationLine: 'underline', textDecorationColor: colors.line2 },
  switch: { width: 46, height: 28, borderRadius: 999, padding: 2, borderWidth: 1, borderColor: 'transparent', justifyContent: 'center', overflow: 'hidden' },
  switchOff: { backgroundColor: colors.raise, borderColor: colors.line2 },
  knob: { width: 22, height: 22, borderRadius: 11, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
});
