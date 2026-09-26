import { ReactNode, useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleProp, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { buttonGradient, cardGradient, colors, fonts, radius } from '../theme';
import { Icon, IconName } from './Icon';

export const tap = () => { Haptics.selectionAsync().catch(() => {}); };

type ButtonProps = {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'ghost' | 'link';
  icon?: IconName;
  iconRight?: IconName;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function Button({ title, onPress, kind = 'primary', icon, iconRight, disabled, busy, style, accessibilityLabel }: ButtonProps) {
  const off = disabled || busy;
  const tint = kind === 'primary' ? colors.onPrimary : kind === 'link' ? colors.muted : colors.text;
  const body = (
    <>
      {busy ? <ActivityIndicator color={tint} /> : icon ? <Icon name={icon} size={18} color={tint} /> : null}
      {title ? <Text numberOfLines={1} style={[s.btnText, { color: tint }, kind === 'link' && s.linkText]}>{title}</Text> : null}
      {iconRight && !busy ? <Icon name={iconRight} size={18} color={tint} /> : null}
    </>
  );
  return (
    <Pressable
      onPress={() => { tap(); onPress(); }}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      hitSlop={kind === 'link' ? 8 : 0}
      style={({ pressed }) => [kind === 'link' ? s.link : s.btn, kind === 'ghost' && s.ghost, style,
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 }, off && { opacity: 0.5 }]}
    >
      {kind === 'primary' ? (
        <LinearGradient colors={buttonGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: radius.control }]} />
      ) : null}
      {body}
    </Pressable>
  );
}

// Two or more options, one on: "Sign up / Log in", "Just talk / Answer & reveal".
export function Segmented<T extends string>({ value, options, onChange, style }:
  { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.seg, style]} accessibilityRole="tablist">
      {options.map(o => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => { if (!on) { tap(); onChange(o.value); } }} accessibilityRole="tab"
            accessibilityState={{ selected: on }} style={[s.segBtn, on && s.segOn]}>
            <Text numberOfLines={1} style={[s.segText, on && { color: '#fff' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// The website's rounded switch, animated natively.
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  const x = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => { Animated.spring(x, { toValue: on ? 1 : 0, useNativeDriver: true, speed: 20, bounciness: 4 }).start(); }, [on, x]);
  return (
    <Pressable onPress={() => { tap(); onChange(!on); }} accessibilityRole="switch" accessibilityLabel={label}
      accessibilityState={{ checked: on }} hitSlop={10} style={[s.switch, !on && s.switchOff]}>
      {on ? <LinearGradient colors={buttonGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 999 }]} /> : null}
      <Animated.View style={[s.knob, { backgroundColor: on ? '#fff' : colors.soft, transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) }] }]} />
    </Pressable>
  );
}

export function Field({ label, style, inputStyle, ...props }: TextInputProps & { label?: string; style?: StyleProp<ViewStyle>; inputStyle?: StyleProp<any> }) {
  return (
    <View style={style}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput placeholderTextColor={colors.faint} selectionColor={colors.accent} keyboardAppearance="dark" style={[s.input, inputStyle]} {...props} />
    </View>
  );
}

export function HeartBadge({ size = 36 }: { size?: number }) {
  return (
    <LinearGradient colors={cardGradient} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }}
      style={{ width: size, height: size, borderRadius: size * 0.32, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="heart" size={size * 0.52} color="#fff" fill strokeWidth={0} />
    </LinearGradient>
  );
}

export function Or({ children }: { children: ReactNode }) {
  return (
    <View style={s.or}>
      <View style={s.orLine} /><Text style={s.orText}>{children}</Text><View style={s.orLine} />
    </View>
  );
}

export const s = StyleSheet.create({
  btn: { minHeight: 52, borderRadius: radius.control, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, overflow: 'hidden' },
  ghost: { borderWidth: 1, borderColor: colors.line, backgroundColor: 'transparent' },
  btnText: { fontFamily: fonts.sansBold, fontSize: 16, flexShrink: 1 },
  link: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  linkText: { fontFamily: fonts.sansMedium, fontSize: 14, textDecorationLine: 'underline', textDecorationColor: colors.line2 },
  seg: { flexDirection: 'row', backgroundColor: colors.bg3, borderWidth: 1, borderColor: colors.line, borderRadius: 13, padding: 4 },
  segBtn: { flex: 1, minHeight: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  segOn: { backgroundColor: colors.raise },
  segText: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.muted },
  switch: { width: 46, height: 28, borderRadius: 999, padding: 2, borderWidth: 1, borderColor: 'transparent', justifyContent: 'center', overflow: 'hidden' },
  switchOff: { backgroundColor: colors.raise, borderColor: colors.line2 },
  knob: { width: 22, height: 22, borderRadius: 11, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  label: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.muted, marginBottom: 6 },
  input: { minHeight: 50, borderRadius: radius.control - 2, backgroundColor: colors.bg3, borderWidth: 1, borderColor: colors.line, color: colors.text,
    paddingHorizontal: 14, fontFamily: fonts.sans, fontSize: 16 },
  or: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.line2 },
  orText: { fontFamily: fonts.sans, fontSize: 13, color: colors.faint },
});
