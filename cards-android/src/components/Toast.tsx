import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleProp, Text, ViewStyle } from 'react-native';
import { colors, fonts } from '../theme';
import { tap } from './ui';
import { sheet, useScaled } from '../scale';

type Action = { label: string; onPress: () => void };

// A short message that fades in and goes away by itself. The screen decides where it sits
// (never over a button), and it can carry one action such as Undo.
export function useToast(style: StyleProp<ViewStyle>) {
  const st = useScaled(base);
  const [shown, setShown] = useState<{ text: string; action?: Action } | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hide = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => { if (finished) setShown(null); });
  }, [opacity]);
  const say = useCallback((text: string, action?: Action) => {
    if (timer.current) clearTimeout(timer.current);
    setShown({ text, action });
    opacity.stopAnimation();
    Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    timer.current = setTimeout(hide, action ? 5000 : 1800);
  }, [opacity, hide]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const toast = shown ? (
    <Animated.View pointerEvents={shown.action ? 'box-none' : 'none'} accessibilityLiveRegion="polite" style={[st.toast, shown.action && st.withAction, style, { opacity }]}>
      <Text style={st.text}>{shown.text}</Text>
      {shown.action ? (
        <Pressable onPress={() => { tap(); shown.action?.onPress(); hide(); }} hitSlop={10} accessibilityRole="button" accessibilityLabel={shown.action.label} style={st.action}>
          <Text style={st.actionText}>{shown.action.label}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  ) : null;
  return { say, toast };
}

const base = sheet({
  toast: { position: 'absolute', alignSelf: 'center', maxWidth: '86%', flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
    backgroundColor: colors.raise, borderWidth: 1, borderColor: colors.line2, zIndex: 4, elevation: 14 },
  withAction: { paddingRight: 8, paddingVertical: 6 },
  text: { flexShrink: 1, fontFamily: fonts.sansMedium, fontSize: 14, color: colors.text, textAlign: 'center' },
  action: { minHeight: 36, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 999, backgroundColor: colors.bg3 },
  actionText: { fontFamily: fonts.sansBold, fontSize: 14, color: colors.accent2 },
});
