import { useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { game } from '../cards';
import type { State } from '../game';
import { colors, fonts, radius } from '../theme';
import { shareQuestion } from '../share';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { Confirm } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { RoundButton, TopBar } from '../components/TopBar';
import { Button, tap, Toggle } from '../components/ui';

const deckName = (decks: string[]) => !decks.length ? 'All decks' : decks.length === 1 ? decks[0] : `${decks.length} decks`;

type Props = { state: State; update: (change: (s: State) => State) => void; onBack: () => void; onDecks: () => void };

// The card on the table: flip it, move on, save it, share it.
export function Play({ state, update, onBack, onDecks }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { say, toast } = useToast();
  const [shuffleOpen, setShuffleOpen] = useState(false);
  const card = game.view(game.current(state) ?? '');
  if (!card) return null; // App only shows this screen once cards are dealt

  const total = state.order.length;
  const wide = width >= 760 && width > height * 1.05;
  const compact = height < 700;
  const gap = compact ? 10 : 14;
  const btnH = compact ? { minHeight: 48 } : null;

  const next = () => { if (state.index === total - 1 && total > 1) say("That's every card here. Back to the first one."); update(game.next); };
  const prev = () => update(game.prev);

  const table = (
    <Card cardKey={card.id} category={card.category} text={card.text} position={`${state.index + 1} / ${total}`}
      flipped={state.flipped} tapToReveal={state.tapToReveal} favorite={game.isFavorite(state, card.id)}
      onFlip={() => update(game.flip)}
      onFavorite={() => { say(game.isFavorite(state, card.id) ? 'Removed from favorites' : 'Saved to favorites'); update(s => game.toggleFavorite(s, card.id)); }}
      onSwipe={dir => (dir === 'next' ? next() : prev())} />
  );

  const decksButton = (
    <Pressable onPress={() => { tap(); onDecks(); }} style={({ pressed }) => [st.deckBtn, compact && st.iconBtn, pressed && { opacity: 0.85 }]}
      accessibilityRole="button" accessibilityLabel={`Choose decks. Now playing ${deckName(state.decks)}`}>
      <Icon name="cards" size={18} color={colors.accent2} />
      {compact ? null : <Text numberOfLines={1} style={st.deckText}>{deckName(state.decks)}{state.fresh ? ' · new only' : ''}</Text>}
      {compact ? null : <View style={st.chev} />}
    </Pressable>
  );

  const side = (
    <View style={{ gap, flexShrink: 0 }}>
      <View style={st.opt}>
        <Text style={st.optText}>Tap to reveal each card</Text>
        <Toggle on={state.tapToReveal} onChange={on => update(s => game.setTapToReveal(s, on))} label="Tap to reveal each card" />
      </View>
      <View style={st.row}>
        <Button kind="ghost" title="" icon="left" accessibilityLabel="Previous question" onPress={prev} style={[{ width: compact ? 48 : 56, paddingHorizontal: 0 }, btnH]} />
        <Button title={compact ? 'Next' : 'Next question'} accessibilityLabel="Next question" iconRight="right" onPress={next} style={[{ flex: 1 }, btnH]} />
        {compact ? decksButton : null}
      </View>
      {compact ? null : <View style={st.row}>{decksButton}</View>}
    </View>
  );

  return (
    <View style={[st.fill, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <TopBar title="Closer" onBack={onBack}>
        <RoundButton icon="shuffle" label="Shuffle these cards" onPress={() => setShuffleOpen(true)} />
        <RoundButton icon="share" label="Share this question" onPress={() => { if (state.flipped) shareQuestion(card.text); else say('Reveal the card first'); }} />
      </TopBar>
      {wide ? (
        <View style={[st.wide, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={st.wideCard}>{table}</View>
          <View style={st.wideSide}>{side}</View>
        </View>
      ) : (
        // Everything fits the screen: the card takes whatever height is left.
        <View style={[st.column, { gap, paddingBottom: Math.max(insets.bottom, compact ? 10 : 16) }]}>
          <View style={st.cardArea}>{table}</View>
          {side}
        </View>
      )}
      {toast}
      <Confirm visible={shuffleOpen} title="Shuffle these cards?" body="The cards you're playing are mixed again and you start from the first one. Seen cards and favorites stay as they are."
        yes="Shuffle" onYes={() => { update(game.reshuffle); say('Shuffled'); }} onClose={() => setShuffleOpen(false)} />
    </View>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  column: { flex: 1, paddingHorizontal: 16, paddingTop: 4, width: '100%', maxWidth: 560, alignSelf: 'center' },
  cardArea: { flex: 1, minHeight: 120 },
  wide: { flex: 1, flexDirection: 'row', gap: 28, paddingHorizontal: 28, paddingTop: 8, maxWidth: 1280, width: '100%', alignSelf: 'center' },
  wideCard: { flex: 1.25, maxWidth: 720 },
  wideSide: { flex: 1, maxWidth: 400, justifyContent: 'center' },
  iconBtn: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', width: 48, minHeight: 48, paddingHorizontal: 0, justifyContent: 'center', gap: 0 },
  opt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 4 },
  optText: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.soft, flexShrink: 1 },
  row: { flexDirection: 'row', gap: 10 },
  deckBtn: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: radius.control,
    backgroundColor: colors.bg3, borderWidth: 1, borderColor: colors.line },
  deckText: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 15, color: colors.text },
  chev: { width: 8, height: 8, borderRightWidth: 1.5, borderBottomWidth: 1.5, borderColor: colors.muted, transform: [{ rotate: '-45deg' }], marginRight: 4 },
});
