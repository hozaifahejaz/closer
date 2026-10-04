import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type DeckInfo } from '../api';
import { colors, fonts } from '../theme';
import { Button } from './ui';

type Usage = { linked: boolean; decks: DeckInfo[]; total: number; used: number; remaining: number };
export function History({ visible, token, onClose }: { visible: boolean; token: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Usage | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    setData(null); setError('');
    if (visible && token) api<Usage>('/api/history', token).then(value => { if (current) setData(value); }).catch(e => { if (current) setError(e instanceof Error ? e.message : 'Could not load history.'); });
    return () => { current = false; };
  }, [visible, token, retry]);
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <ScrollView contentContainerStyle={[st.page, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]} style={st.fill}>
      <View style={st.header}><Text style={st.title}>History</Text><Button kind="ghost" title="" icon="close" accessibilityLabel="Close history" onPress={onClose} /></View>
      <Text style={st.note}>Cards revealed or answered in your shared account room.</Text>
      {error ? <View style={{ gap: 12 }}><Text accessibilityRole="alert" style={st.note}>{error}</Text><Button kind="ghost" title="Try again" onPress={() => setRetry(n => n + 1)} /></View> : !token ? <Text style={st.note}>Sign in to view your history.</Text> : !data ? <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} /> : !data.linked ? <Text style={st.note}>Link with your partner to start your shared card history.</Text> : <>
        <View style={st.stats}>{[[data.used, 'Used'], [data.remaining, 'Remaining'], [`${Math.round(data.used / (data.total || 1) * 100)}%`, 'Explored']].map(([value, label]) => <View key={label} style={{ flex: 1 }}><Text style={st.number}>{value}</Text><Text style={st.label}>{label}</Text></View>)}</View>
        {!data.used ? <Text style={st.note}>Your story starts with the first card. Reveal a card to begin.</Text> : null}
        {data.decks.map(deck => <View key={deck.name} style={st.deck}>
          <View style={st.header}><Text style={st.deckName}>{deck.name}</Text><Text style={st.label}>{deck.used} / {deck.count}</Text></View>
          <View accessible accessibilityRole="progressbar" accessibilityLabel={`${deck.name} cards used`} accessibilityValue={{ min: 0, max: deck.count, now: deck.used }} style={st.track}><View style={[st.bar, { width: `${deck.count ? deck.used / deck.count * 100 : 0}%` }]} /></View>
        </View>)}
      </>}
    </ScrollView>
  </Modal>;
}
const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  page: { flexGrow: 1, paddingHorizontal: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontFamily: fonts.serif, color: colors.text, fontSize: 30 },
  note: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 23, color: colors.muted, marginTop: 16 },
  stats: { flexDirection: 'row', gap: 20, marginVertical: 28 },
  number: { fontFamily: fonts.sansMedium, fontSize: 30, color: colors.text },
  label: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
  deck: { marginTop: 24, gap: 10 },
  deckName: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.text, flexShrink: 1 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
});
