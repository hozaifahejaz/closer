import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CardView } from '../game';
import { colors, fonts, radius } from '../theme';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { TopBar } from '../components/TopBar';
import { Button, tap } from '../components/ui';

// onRemove takes the card out at once and returns how to put it back.
type Props = { cards: CardView[]; onOpen: (index: number) => void; onRemove: (id: string) => () => void; onBack: () => void; onDecks: () => void };

// Every card saved with the heart, newest first.
export function Favorites({ cards, onOpen, onRemove, onBack, onDecks }: Props) {
  const insets = useSafeAreaInsets();
  const { say, toast } = useToast({ bottom: insets.bottom + 20 });
  return (
    <View style={[st.fill, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <TopBar title="Favorites" onBack={onBack} maxWidth={640} />
      {cards.length ? (
        <FlatList data={cards} keyExtractor={c => c.id} style={st.list} initialNumToRender={10} windowSize={7}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: insets.bottom + 84, gap: 10 }}
          renderItem={({ item, index }) => (
            <Pressable onPress={() => { tap(); onOpen(index); }} accessibilityRole="button" accessibilityLabel={`${item.category}. ${item.text}`}
              style={({ pressed }) => [st.item, pressed && { opacity: 0.9 }]}>
              <View style={{ flex: 1 }}>
                <Text style={st.cat} numberOfLines={1}>{item.category}</Text>
                <Text style={st.q}>{item.text}</Text>
              </View>
              <Pressable onPress={() => { tap(); say('Removed from favorites', { label: 'Undo', onPress: onRemove(item.id) }); }} hitSlop={10} style={st.remove} accessibilityRole="button" accessibilityLabel="Remove from favorites">
                <Icon name="heart" size={22} color={colors.accent} fill />
              </Pressable>
            </Pressable>
          )} />
      ) : (
        <View style={st.empty}>
          <Icon name="heart" size={44} color={colors.line2} strokeWidth={1.4} />
          <Text style={st.emptyTitle}>No favorites yet</Text>
          <Text style={st.emptyText}>Tap the heart on any card to keep it here.</Text>
          <Button title="Choose decks" onPress={onDecks} style={{ marginTop: 12, minWidth: 200 }} />
        </View>
      )}
      {toast}
    </View>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  list: { flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 16, paddingLeft: 18, paddingRight: 8, borderRadius: radius.box, backgroundColor: colors.card },
  cat: { fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.rose, marginBottom: 6 },
  q: { fontFamily: fonts.serif, fontSize: 18, lineHeight: 24, color: colors.ink },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyTitle: { marginTop: 8, fontFamily: fonts.serifBold, fontSize: 22, color: colors.text },
  emptyText: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22, color: colors.muted, textAlign: 'center' },
});
