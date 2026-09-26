import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { RoomState } from '../api';
import { colors, fonts, radius } from '../theme';
import { Icon } from './Icon';
import { Button } from './ui';

// Answer & reveal: each of you writes privately; both answers show once you've both locked in.
export function AnswerPanel({ room, cardKey, partnerName, onLockIn, compact }:
  { room: RoomState; cardKey: string; partnerName: string; onLockIn: (text: string) => boolean; compact?: boolean }) {
  const [text, setText] = useState('');
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => { setText(''); }, [cardKey]);
  useEffect(() => {
    if (!room.revealed) { pop.setValue(0); return; }
    Animated.timing(pop, { toValue: 1, duration: 380, easing: Easing.bezier(0.2, 0.7, 0.2, 1), useNativeDriver: true }).start();
  }, [!!room.revealed]); // eslint-disable-line react-hooks/exhaustive-deps

  const answered = room.myAnswer !== null;
  const status = room.revealed ? 'Now talk about it ♡'
    : room.partners.length < 2 ? 'Waiting for your partner to join…'
    : answered ? `Locked in. Waiting for ${partnerName}…`
    : room.partnerAnswered ? `${partnerName} has answered. Your turn.` : "Hidden until you've both answered.";

  return (
    <View style={[st.box, compact && { padding: 12 }]}>
      {room.revealed ? (
        // Answers are laid out to fit; only very long ones can scroll here.
        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: compact ? 8 : 10 }} bounces={false} alwaysBounceVertical={false} showsVerticalScrollIndicator={false}>
          {room.revealed.map((a, i) => (
            <Animated.View key={i} style={[st.reveal, compact && { paddingVertical: 10, paddingHorizontal: 12 }, { opacity: pop, transform: [{ translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [8 + i * 6, 0] }) }, { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }] }]}>
              <Text style={st.revealWho}>{a.mine ? 'You' : a.name}</Text>
              <Text style={[st.revealText, compact && { fontSize: 14, lineHeight: 20 }]}>{a.text}</Text>
            </Animated.View>
          ))}
        </ScrollView>
      ) : answered ? (
        <View>
          <View style={st.who}><Icon name="lock" size={14} color={colors.muted} /><Text style={st.whoText}>Your answer</Text></View>
          <Text style={st.mine} numberOfLines={compact ? 3 : 5}>{room.myAnswer}</Text>
        </View>
      ) : (
        <View style={{ gap: compact ? 8 : 10 }}>
          <TextInput value={text} onChangeText={setText} multiline maxLength={1000} placeholder="Write your answer…"
            placeholderTextColor={colors.faint} selectionColor={colors.accent} keyboardAppearance="dark" style={[st.input, compact && st.inputCompact]}
            accessibilityLabel="Your answer" textAlignVertical="top" />
          <Button title="Lock in my answer" icon="lock" disabled={!text.trim()}
            onPress={() => { if (onLockIn(text.trim())) setText(''); }} style={compact && { minHeight: 46 }} />
        </View>
      )}
      {/* On short screens the two answers speak for themselves. */}
      {compact && room.revealed ? null : <Text style={[st.status, compact && { marginTop: 8 }]} numberOfLines={1}>{status}</Text>}
    </View>
  );
}

const st = StyleSheet.create({
  box: { flexShrink: 1, minHeight: 0, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line, borderRadius: radius.box, padding: 14 },
  input: { minHeight: 92, maxHeight: 180, borderRadius: 12, backgroundColor: colors.bg3, borderWidth: 1, borderColor: colors.line, color: colors.text,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, fontFamily: fonts.sans, fontSize: 16, lineHeight: 23 },
  inputCompact: { minHeight: 62, maxHeight: 110, paddingTop: 10, paddingBottom: 10 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  whoText: { fontFamily: fonts.sansBold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: colors.muted },
  mine: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22, color: colors.text, backgroundColor: colors.bg3, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  reveal: { backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14 },
  revealWho: { fontFamily: fonts.sansBold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: colors.rose, marginBottom: 4 },
  revealText: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22, color: colors.ink },
  status: { marginTop: 10, fontFamily: fonts.sans, fontSize: 13, lineHeight: 18, color: colors.muted, textAlign: 'center' },
});
