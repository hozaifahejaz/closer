import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, BackHandler, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
// One import per weight, so only these five font files ship in the app.
import { Fraunces_500Medium } from '@expo-google-fonts/fraunces/500Medium';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import app from './app.json';
import { game } from './src/cards';
import { deckName } from './src/format';
import type { CardView, State } from './src/game';
import { flush, load, loadNav, loadWelcomed, save, saveNav, saveWelcomed } from './src/storage';
import { colors } from './src/theme';
import { DeckPicker } from './src/components/DeckPicker';
import { Confirm, Menu, Notice } from './src/components/Sheet';
import { setHapticsOn } from './src/components/ui';
import { Favorites } from './src/screens/Favorites';
import { Home } from './src/screens/Home';
import { Info } from './src/screens/Info';
import { Play } from './src/screens/Play';
import { Viewer } from './src/screens/Viewer';

SplashScreen.preventAutoHideAsync().catch(() => {});

type Screen =
  | { name: 'home' } | { name: 'play' } | { name: 'favorites' }
  | { name: 'info'; page: 'privacy' | 'about' }
  // The cards are a snapshot, so un-hearting one while flicking through doesn't make it vanish mid-swipe.
  | { name: 'viewer'; title: string; cards: CardView[]; startAt: number; from: 'favorites' };


// Checks a screen read back from storage before trusting it.
function toScreen(raw: any): Screen {
  const isCard = (c: any) => c && typeof c.id === 'string' && typeof c.category === 'string' && typeof c.text === 'string';
  if (raw?.name === 'play' || raw?.name === 'favorites') return { name: raw.name };
  if (raw?.name === 'info' && (raw.page === 'privacy' || raw.page === 'about')) return { name: 'info', page: raw.page };
  if (raw?.name === 'viewer' && typeof raw.title === 'string' && Array.isArray(raw.cards) && raw.cards.length && raw.cards.every(isCard)) {
    if (raw.from === 'favorites') return { name: 'viewer', title: raw.title, cards: raw.cards, startAt: Number.isInteger(raw.startAt) ? raw.startAt : 0, from: 'favorites' };
  }
  return { name: 'home' };
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({ Fraunces_500Medium, Fraunces_600SemiBold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold });
  const [state, setState] = useState<State | null>(null);
  const [screen, setScreenNow] = useState<Screen>({ name: 'home' });
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [welcome, setWelcome] = useState(false);
  useEffect(() => { loadWelcomed().then(seen => setWelcome(!seen)); }, []);

  // What was saved on this phone, or a clean start. A damaged save can't stop the app opening.
  useEffect(() => {
    Promise.all([load(), loadNav()]).then(([raw, nav]) => { setScreenNow(toScreen(nav)); setState(game.restore(raw)); }, () => setState(game.newState()));
  }, []);
  const setScreen = useCallback((next: Screen) => { setScreenNow(next); saveNav(next); }, []);
  useEffect(() => { if (state) { save(state); setHapticsOn(state.haptics); } }, [state]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', now => { if (now !== 'active') flush(); });
    return () => sub.remove();
  }, []);

  const ready = (fontsLoaded || !!fontError) && !!state;
  useEffect(() => { if (ready) SplashScreen.hideAsync().catch(() => {}); }, [ready]);

  const update = useCallback((change: (s: State) => State) => setState(s => s && change(s)), []);
  const home = useCallback(() => setScreen({ name: 'home' }), [setScreen]);
  const back = useCallback(() => setScreen(screen.name === 'viewer' ? { name: 'favorites' } : { name: 'home' }), [screen, setScreen]);

  // Android's back button or gesture: one screen back, and out of the app from the first screen.
  const atHome = screen.name === 'home';
  useEffect(() => {
    if (atHome) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { back(); return true; });
    return () => sub.remove();
  }, [atHome, back]);

  const list = useMemo(() => state ? game.usage(state) : [], [state?.seen]); // eslint-disable-line react-hooks/exhaustive-deps
  const favorites = useMemo<CardView[]>(() => (state?.favorites ?? []).map(f => game.view(f.k) ?? { id: f.k, category: f.k.slice(0, f.k.lastIndexOf(':')), text: f.q }).reverse(), [state?.favorites]);

  if (!ready || !state) return <View style={st.fill} />;

  const dealt = !!game.current(state);
  const body = (() => {
    switch (screen.name) {
      case 'play':
        if (dealt) return <Play state={state} update={update} onBack={home} onDecks={() => setPicker(true)} />;
        break;
      case 'favorites':
        return <Favorites cards={favorites} onBack={home} onDecks={() => setPicker(true)}
          onOpen={startAt => setScreen({ name: 'viewer', title: 'Favorites', cards: favorites, startAt, from: 'favorites' })}
          onRemove={id => {
            const at = state.favorites.findIndex(f => f.k === id), fav = state.favorites[at];
            update(s => game.toggleFavorite(s, id));
            return () => { if (fav) update(s => game.restoreFavorite(s, fav, at)); };
          }} />;
      case 'viewer':
        return <Viewer title={screen.title} cards={screen.cards} startAt={screen.startAt} state={state} update={update} onBack={back} />;
      case 'info':
        return <Info page={screen.page} version={app.expo.version} onBack={home} />;
    }
    return <Home seen={list.reduce((n, d) => n + d.used, 0)} total={game.total} favorites={state.favorites.length}
      place={dealt ? { index: state.index, total: state.order.length, label: deckName(state.decks) } : null}
      onContinue={() => setScreen({ name: 'play' })}
      onDecks={() => setPicker(true)}
      onFavorites={() => setScreen({ name: 'favorites' })}
      onMenu={() => setMenu(true)} />;
  })();

  return (
    <SafeAreaProvider style={st.fill}>
      <StatusBar style="light" />
      {body}
      <DeckPicker visible={picker} list={list} decks={state.decks} fresh={state.fresh} started={dealt && screen.name === 'play'} saved={game.savedPlaces(state)}
        onClose={() => setPicker(false)}
        onStart={(decks, fresh) => { update(s => game.start(s, decks, fresh)); setPicker(false); setScreen({ name: 'play' }); }} />
      <Menu visible={menu} onClose={() => setMenu(false)} groups={[
        [{ title: 'Favorites', onPress: () => setScreen({ name: 'favorites' }) }],
        [{ title: 'Tap to reveal each card', on: state.tapToReveal, onChange: (on: boolean) => update(s => game.setTapToReveal(s, on)) },
          { title: 'Vibration', on: state.haptics, onChange: (on: boolean) => update(s => game.setHaptics(s, on)) }],
        [{ title: 'Reset my progress', danger: true, onPress: () => setResetOpen(true) }],
        [{ title: 'Privacy policy', onPress: () => setScreen({ name: 'info', page: 'privacy' }) },
          { title: 'About', onPress: () => setScreen({ name: 'info', page: 'about' }) }],
      ]} />
      <Confirm visible={resetOpen} danger title="Reset my progress?" yes="Reset" onClose={() => setResetOpen(false)}
        body="This forgets which cards you've seen and your place in every deck. Your favorites and settings are kept. It can't be undone."
        onYes={() => update(game.resetProgress)} />
      <Notice visible={welcome} title="For adults" ok="I'm 18 or older" onOk={() => { saveWelcomed(); setWelcome(false); }}
        body="Stay Up With Me is for people aged 18 and over. Some decks, such as Desire & Intimacy, ask about intimacy. You choose which decks to play." />
    </SafeAreaProvider>
  );
}

const st = StyleSheet.create({ fill: { flex: 1, backgroundColor: colors.bg } });
