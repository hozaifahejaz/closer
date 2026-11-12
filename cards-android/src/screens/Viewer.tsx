import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { game } from '../cards';
import type { CardView, State } from '../game';
import { colors } from '../theme';
import { shareQuestion } from '../share';
import { Card } from '../components/Card';
import { useToast } from '../components/Toast';
import { RoundButton, TopBar } from '../components/TopBar';
import { Button } from '../components/ui';

type Props = { title: string; cards: CardView[]; startAt: number; state: State; update: (change: (s: State) => State) => void; onBack: () => void };

// One card on its own (the card of the day), or a short stack to flick through (favorites).
export function Viewer({ title, cards, startAt, state, update, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { say, toast } = useToast();
  const [at, setAt] = useState(Math.max(0, Math.min(startAt, cards.length - 1)));
  const card = cards[at];
  if (!card) return null;
  const many = cards.length > 1;
  const wide = width >= 760 && width > height * 1.05;
  const go = (by: number) => { if (many) setAt(i => (i + by + cards.length) % cards.length); };

  return (
    <View style={[st.fill, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <TopBar title={title} onBack={onBack}>
        <RoundButton icon="share" label="Share this question" onPress={() => shareQuestion(card.text)} />
      </TopBar>
      <View style={[st.column, wide && { maxWidth: 720 }, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={st.cardArea}>
          <Card cardKey={card.id} category={card.category} text={card.text} position={many ? `${at + 1} / ${cards.length}` : ''}
            flipped tapToReveal={false} favorite={game.isFavorite(state, card.id)}
            onFlip={() => {}} onSwipe={dir => go(dir === 'next' ? 1 : -1)}
            onFavorite={() => { say(game.isFavorite(state, card.id) ? 'Removed from favorites' : 'Saved to favorites'); update(s => game.toggleFavorite(s, card.id)); }} />
        </View>
        {many ? (
          <View style={st.row}>
            <Button kind="ghost" title="" icon="left" accessibilityLabel="Previous question" onPress={() => go(-1)} style={{ width: 56, paddingHorizontal: 0 }} />
            <Button title="Next" accessibilityLabel="Next question" iconRight="right" onPress={() => go(1)} style={{ flex: 1 }} />
          </View>
        ) : null}
      </View>
      {toast}
    </View>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  column: { flex: 1, gap: 14, paddingHorizontal: 16, paddingTop: 4, width: '100%', maxWidth: 560, alignSelf: 'center' },
  cardArea: { flex: 1, minHeight: 120 },
  row: { flexDirection: 'row', gap: 10 },
});
