import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { game } from '../cards';
import { deckName, num } from '../format';
import type { State } from '../game';
import { colors } from '../theme';
import { shareQuestion } from '../share';
import { Card } from '../components/Card';
import { Confirm } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { RoundButton, TopBar } from '../components/TopBar';
import { Button } from '../components/ui';
import { sheet, useK, useScaled } from '../scale';

type Props = { state: State; update: (change: (s: State) => State) => void; onBack: () => void; onDecks: () => void };

// The card on the table: flip it, move on, save it, share it.
export function Play({ state, update, onBack, onDecks }: Props) {
  const st = useScaled(base);
  const k = useK();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // Messages show over the foot of the card, clear of every button.
  const { say, toast } = useToast({ bottom: 44 * k });
  const [shuffleOpen, setShuffleOpen] = useState(false);
  const card = game.view(game.current(state) ?? '');
  if (!card) return null; // App only shows this screen once cards are dealt

  const total = state.order.length;
  const wide = width >= 760 && width > height * 1.05;
  const compact = height / k < 700;
  const gap = (compact ? 10 : 12) * k;
  const btnH = compact ? { minHeight: 48 * k } : null;
  const playing = `${deckName(state.decks)}${state.fresh ? ' · new only' : ''}`;

  const next = () => { if (state.index === total - 1 && total > 1) say("That's every card here. Back to the first one."); update(game.next); };
  const prev = () => update(game.prev);

  const table = (
    <View style={st.cardArea}>
      {/* The filled heart is the confirmation; no message needed. */}
      <Card cardKey={card.id} category={card.category} text={card.text} position={`${num(state.index + 1)} / ${num(total)}`}
        flipped={state.flipped} tapToReveal={state.tapToReveal} favorite={game.isFavorite(state, card.id)}
        onFlip={() => update(game.flip)} onFavorite={() => update(s => game.toggleFavorite(s, card.id))}
        onSwipe={dir => (dir === 'next' ? next() : prev())} />
      {toast}
    </View>
  );

  // Two rows that hold at any width: move between cards, and change what is being played.
  const side = (
    <View style={{ gap, flexShrink: 0 }}>
      <View style={st.row}>
        <Button kind="ghost" title="" icon="left" accessibilityLabel="Previous question" onPress={prev} style={[{ width: (compact ? 48 : 56) * k, paddingHorizontal: 0 }, btnH]} />
        <Button title={compact ? 'Next' : 'Next question'} accessibilityLabel="Next question" iconRight="right" onPress={next} style={[{ flex: 1 }, btnH]} />
      </View>
      <Button kind="ghost" title="Change decks" icon="cards" accessibilityLabel={`Change decks. Now playing ${playing}`} onPress={onDecks} style={btnH} />
    </View>
  );

  return (
    <View style={[st.fill, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <TopBar title={playing} onBack={onBack} maxWidth={wide ? 1280 : 560}>
        <RoundButton icon="shuffle" label="Shuffle these cards" onPress={() => setShuffleOpen(true)} />
        <RoundButton icon="share" label="Share this question" disabled={!state.flipped} onPress={() => shareQuestion(card.text)} />
      </TopBar>
      {wide ? (
        <View style={[st.wide, { paddingBottom: Math.max(insets.bottom, 16 * k) }]}>
          <View style={st.wideCard}>{table}</View>
          <View style={st.wideSide}>{side}</View>
        </View>
      ) : (
        // Everything fits the screen: the card takes whatever height is left.
        <View style={[st.column, { gap, paddingBottom: Math.max(insets.bottom, (compact ? 10 : 16) * k) }]}>
          {table}
          {side}
        </View>
      )}
      <Confirm visible={shuffleOpen} title="Shuffle these cards?" body="The cards you're playing are mixed again and you start from the first one. Seen cards and favorites stay as they are."
        yes="Shuffle" onYes={() => { update(game.reshuffle); say('Shuffled'); }} onClose={() => setShuffleOpen(false)} />
    </View>
  );
}

const base = sheet({
  fill: { flex: 1, backgroundColor: colors.bg },
  column: { flex: 1, paddingHorizontal: 16, paddingTop: 4, width: '100%', maxWidth: 560, alignSelf: 'center' },
  cardArea: { flex: 1, minHeight: 120 },
  wide: { flex: 1, flexDirection: 'row', gap: 28, paddingHorizontal: 16, paddingTop: 8, maxWidth: 1280, width: '100%', alignSelf: 'center' },
  wideCard: { flex: 1.25, maxWidth: 720 },
  wideSide: { flex: 1, maxWidth: 400, justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 10 },
});
