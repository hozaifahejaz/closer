import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { cardGradient, colors, fonts, radius } from '../theme';
import { Icon } from './Icon';

type Props = {
  cardKey: string; // changes when the room moves to another card
  category: string;
  text: string;
  position: string; // "3 / 40"
  flipped: boolean;
  tapToReveal: boolean;
  favorite: boolean;
  onFlip: () => void;
  onFavorite: () => void;
  onSwipe: (dir: 'next' | 'prev') => void;
};

const EASE = Easing.bezier(0.2, 0.7, 0.2, 1);

// The question card: tap to flip it (for both of you), swipe for the next or previous one.
export function Card({ cardKey, category, text, position, flipped, tapToReveal, favorite, onFlip, onFavorite, onSwipe }: Props) {
  const turn = useRef(new Animated.Value(flipped ? 1 : 0)).current;
  const drag = useRef(new Animated.Value(0)).current;
  const swap = useRef(new Animated.Value(1)).current;
  const [shown, setShown] = useState({ category, text, position });
  const [size, setSize] = useState({ w: 320, h: 420 });
  const last = useRef({ key: cardKey, flipped });

  useEffect(() => {
    const was = last.current;
    last.current = { key: cardKey, flipped };
    const moved = was.key !== cardKey;
    const spin = (to: number) => Animated.timing(turn, { toValue: to, duration: 600, easing: EASE, useNativeDriver: true }).start();
    if (moved && was.flipped && !flipped) {
      // Turn face down first, then change the question, so the next one isn't spoiled.
      spin(0);
      const t = setTimeout(() => setShown({ category, text, position }), 300);
      return () => clearTimeout(t);
    }
    if (moved && flipped && was.flipped) {
      // Tap to reveal is off: the new question slides in face up.
      swap.setValue(0);
      Animated.timing(swap, { toValue: 1, duration: 380, easing: EASE, useNativeDriver: true }).start();
    }
    setShown({ category, text, position });
    if (was.flipped !== flipped) {
      spin(flipped ? 1 : 0);
      if (flipped) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, [cardKey, flipped, category, text, position, turn, swap]);

  const swipe = useRef(onSwipe);
  swipe.current = onSwipe;
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.4,
    onPanResponderMove: Animated.event([null, { dx: drag }], { useNativeDriver: false }),
    onPanResponderRelease: (_, g) => {
      const far = Math.abs(g.dx) > 70 || Math.abs(g.vx) > 0.6;
      if (far) swipe.current(g.dx < 0 ? 'next' : 'prev');
      Animated.spring(drag, { toValue: 0, useNativeDriver: false, speed: 18, bounciness: 6 }).start();
    },
    onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, useNativeDriver: false }).start(),
  })).current;

  const backStyle = {
    opacity: turn.interpolate({ inputRange: [0, 0.5, 0.501, 1], outputRange: [1, 1, 0, 0] }),
    transform: [{ perspective: 1400 }, { rotateY: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }],
  };
  const frontStyle = {
    opacity: turn.interpolate({ inputRange: [0, 0.499, 0.5, 1], outputRange: [0, 0, 1, 1] }),
    transform: [{ perspective: 1400 }, { rotateY: turn.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] }) }],
  };

  // Bigger type on bigger cards, a little smaller for long questions.
  const base = Math.max(21, Math.min(34, size.w * 0.074, size.h * 0.07));
  const qSize = shown.text.length > 110 ? base * 0.86 : shown.text.length > 80 ? base * 0.93 : base;

  return (
    <Animated.View
      {...pan.panHandlers}
      onLayout={e => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={[st.wrap, {
        transform: [
          { translateX: Animated.multiply(drag, 0.6) },
          { rotate: drag.interpolate({ inputRange: [-300, 0, 300], outputRange: ['-5deg', '0deg', '5deg'] }) },
        ],
      }]}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={tapToReveal ? onFlip : undefined} disabled={!tapToReveal}
        accessibilityRole={tapToReveal ? 'button' : undefined} accessibilityLabel={tapToReveal ? (flipped ? 'Turn the card over' : 'Reveal the question') : undefined}>
        <Animated.View style={[st.face, backStyle]} pointerEvents={flipped ? 'none' : 'auto'} accessibilityElementsHidden={flipped}>
          <View style={st.clip}>
            <LinearGradient colors={cardGradient} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 0.75, y: 1 }} style={StyleSheet.absoluteFill} />
            <LinearGradient colors={['rgba(255,255,255,0.2)', 'rgba(255,255,255,0)']} start={{ x: 0.3, y: 0 }} end={{ x: 0.5, y: 0.6 }} style={StyleSheet.absoluteFill} />
            <View style={st.inset} />
            <View><Icon name="heart" size={Math.min(64, size.w * 0.16)} color="#fff" strokeWidth={1.4} /></View>
            <Text style={st.tap}>Tap to reveal together</Text>
          </View>
        </Animated.View>

        <Animated.View style={[st.face, frontStyle]} pointerEvents={flipped ? 'box-none' : 'none'}>
          <View style={[st.clip, st.front]}>
            <LinearGradient colors={[colors.cardGlow, colors.card]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.6 }} style={StyleSheet.absoluteFill} />
            <Text style={st.cat} numberOfLines={1}>{shown.category}</Text>
            <Animated.View style={[st.qWrap, {
              opacity: swap,
              transform: [{ translateY: swap.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
            }]}>
              <Text style={[st.q, { fontSize: qSize, lineHeight: qSize * 1.28 }]} accessibilityRole="header">{shown.text}</Text>
            </Animated.View>
            <Text style={st.num}>{shown.position}</Text>
            <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onFavorite(); }} hitSlop={8} style={st.fav}
              accessibilityRole="button" accessibilityLabel={favorite ? 'Remove from favorites' : 'Save to favorites'} accessibilityState={{ selected: favorite }}>
              <Icon name="heart" size={24} color={favorite ? colors.accent : '#cdb8c7'} fill={favorite} />
            </Pressable>
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, width: '100%', minHeight: 240 },
  face: { ...StyleSheet.absoluteFill, borderRadius: radius.card, backgroundColor: colors.bg2,
    shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: 18 }, elevation: 10 },
  clip: { flex: 1, borderRadius: radius.card, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  inset: { ...StyleSheet.absoluteFill, margin: 12, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' },
  tap: { marginTop: 14, fontFamily: fonts.sansMedium, fontSize: 13, letterSpacing: 0.3, color: '#ffe6e6', opacity: 0.92 },
  front: { justifyContent: 'flex-start', paddingTop: 24, paddingBottom: 20, paddingHorizontal: 26, backgroundColor: colors.card },
  cat: { marginHorizontal: 34, fontFamily: fonts.sansBold, fontSize: 12, letterSpacing: 1.9, textTransform: 'uppercase', color: colors.rose, textAlign: 'center' },
  qWrap: { flex: 1, justifyContent: 'center', paddingVertical: 12, maxWidth: 520 },
  q: { fontFamily: fonts.serif, color: colors.ink, textAlign: 'center', letterSpacing: -0.1 },
  num: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink2, letterSpacing: 0.5, fontVariant: ['tabular-nums'] },
  fav: { position: 'absolute', top: 8, right: 8, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
});
