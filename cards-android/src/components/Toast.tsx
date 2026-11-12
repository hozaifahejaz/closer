import { useCallback, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme';

// A short message that fades in over the bottom of the screen and goes away by itself.
export function useToast() {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [opacity] = useState(() => new Animated.Value(0));
  const say = useCallback((msg: string) => {
    setText(msg);
    opacity.stopAnimation();
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [opacity]);
  const toast = (
    <Animated.View pointerEvents="none" accessibilityLiveRegion="polite" style={[st.toast, { opacity, bottom: insets.bottom + 96 }]}>
      <Text style={st.text}>{text}</Text>
    </Animated.View>
  );
  return { say, toast };
}

const st = StyleSheet.create({
  toast: { position: 'absolute', alignSelf: 'center', maxWidth: '86%', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.raise, borderWidth: 1, borderColor: colors.line2 },
  text: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.text, textAlign: 'center' },
});
