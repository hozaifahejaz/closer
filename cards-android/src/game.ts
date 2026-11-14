// The rules of the single-player app, with no React and no storage in here so they
// can be tested on their own. This is the offline cousin of worker/game.js: the same
// decks, the same "Deck:index" card keys, the same saved place per set of decks.

export type DeckData = Record<string, (string | null)[]>;
export type Deal = { order: string[]; index: number };
export type Favorite = { k: string; q: string };
export type State = {
  v: 1;
  decks: string[]; // the decks in play; [] means all of them
  fresh: boolean; // this deal only has cards that were unseen when it was dealt
  order: string[]; // card keys, shuffled
  index: number;
  flipped: boolean; // face up
  tapToReveal: boolean;
  started: boolean;
  progress: Record<string, Deal>; // saved place in other sets of decks, oldest first
  seen: Record<string, 1>;
  favorites: Favorite[]; // newest last
  haptics: boolean;
};
export type DeckInfo = { name: string; count: number; used: number };
export type CardView = { id: string; category: string; text: string };

const MAX_SAVED_PLACES = 24;

export function makeGame(DECK: DeckData, random: () => number = Math.random) {
  const NAMES = Object.keys(DECK);

  const split = (key: string) => { const at = key.lastIndexOf(':'); return { c: key.slice(0, at), i: Number(key.slice(at + 1)) }; };
  const text = (key: string): string | null => {
    if (typeof key !== 'string') return null;
    const { c, i } = split(key);
    const q = Object.hasOwn(DECK, c) && Number.isInteger(i) && i >= 0 ? DECK[c][i] : null;
    return typeof q === 'string' && q ? q : null;
  };
  const live = (key: string) => text(key) !== null;
  const view = (key: string): CardView | null => { const q = text(key); return q === null ? null : { id: key, category: split(key).c, text: q }; };
  // A retired question stays in questions.json as null, so every other card keeps its number.
  const cardsOf = (c: string) => DECK[c].map((_, i) => `${c}:${i}`).filter(live);
  const ALL = NAMES.flatMap(cardsOf);

  function shuffle<T>(list: T[]): T[] {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const buildOrder = (decks: string[], keep: (key: string) => boolean = () => true) =>
    shuffle((decks.length ? decks : NAMES).flatMap(cardsOf).filter(keep));
  const deckKey = (decks: string[]) => decks.length ? decks.join('|') : 'All';
  // Keeps the deck order stable and turns "every deck" into the shorthand [].
  function cleanDecks(list: unknown): string[] {
    const picked = NAMES.filter(c => Array.isArray(list) && list.includes(c));
    return picked.length === NAMES.length ? [] : picked;
  }

  const newState = (): State => ({ v: 1, decks: [], fresh: false, order: [], index: 0, flipped: true, tapToReveal: false,
    started: false, progress: {}, seen: {}, favorites: [], haptics: true });

  const current = (s: State): string | null => (s.started && s.order[s.index]) || null;
  const isSeen = (s: State, key: string) => s.seen[key] === 1;

  // A card counts as seen once it has been face up on screen.
  function markSeen(s: State): State {
    const key = current(s);
    if (!key || !s.flipped || isSeen(s, key)) return s;
    return { ...s, seen: { ...s.seen, [key]: 1 } };
  }
  const see = (s: State, key: string): State => !live(key) || isSeen(s, key) ? s : { ...s, seen: { ...s.seen, [key]: 1 } };

  function step(s: State, by: 1 | -1): State {
    const n = s.order.length;
    if (!s.started || !n) return s;
    return markSeen({ ...s, index: (s.index + by + n) % n, flipped: !s.tapToReveal });
  }
  const next = (s: State) => step(s, 1);
  const prev = (s: State) => step(s, -1);
  const flip = (s: State): State => s.tapToReveal && current(s) ? markSeen({ ...s, flipped: !s.flipped }) : s;
  const setTapToReveal = (s: State, on: boolean): State => markSeen({ ...s, tapToReveal: on, flipped: on ? s.flipped : true });
  const setHaptics = (s: State, on: boolean): State => ({ ...s, haptics: on });

  const unusedCount = (s: State, decks: string[]) => (decks.length ? decks : NAMES).flatMap(cardsOf).filter(k => !isSeen(s, k)).length;

  function savePlace(progress: Record<string, Deal>, key: string, deal: Deal): Record<string, Deal> {
    const out: Record<string, Deal> = {};
    for (const [k, v] of Object.entries(progress)) if (k !== key) out[k] = v;
    out[key] = deal;
    const keys = Object.keys(out);
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_SAVED_PLACES))) delete out[k];
    return out;
  }

  // Starts (or returns to) a set of decks. The place in the old set is remembered, and a
  // set that was played before picks up where it left off. With `fresh`, only cards that
  // haven't been seen are dealt; that deal isn't saved as the set's place.
  function start(s: State, picked: unknown, fresh: boolean): State {
    const decks = cleanDecks(picked);
    if (!decks.length && !(Array.isArray(picked) && NAMES.every(n => picked.includes(n)))) return s; // nothing valid picked
    if (fresh && !unusedCount(s, decks)) return s;
    if (s.started && s.order.length && !fresh && !s.fresh && deckKey(decks) === deckKey(s.decks)) return markSeen(s);
    let progress = s.progress;
    if (s.started && s.order.length && !s.fresh) progress = savePlace(progress, deckKey(s.decks), { order: s.order, index: s.index });
    const saved = fresh ? undefined : progress[deckKey(decks)];
    const deal: Deal = saved ?? { order: fresh ? buildOrder(decks, k => !isSeen(s, k)) : buildOrder(decks), index: 0 };
    if (saved) { progress = { ...progress }; delete progress[deckKey(decks)]; }
    return markSeen({ ...s, decks, fresh, order: deal.order, index: deal.index, progress, started: true, flipped: !s.tapToReveal });
  }

  // Shuffles the cards being played and goes back to the first one.
  function reshuffle(s: State): State {
    if (!current(s)) return s;
    return markSeen({ ...s, order: shuffle(s.order), index: 0, flipped: !s.tapToReveal });
  }

  const isFavorite = (s: State, key: string) => s.favorites.some(f => f.k === key);
  function toggleFavorite(s: State, key: string): State {
    if (isFavorite(s, key)) return { ...s, favorites: s.favorites.filter(f => f.k !== key) };
    const q = text(key);
    return q === null ? s : { ...s, favorites: [...s.favorites, { k: key, q }] };
  }
  // Puts a removed favorite back where it was (the Undo after removing one).
  function restoreFavorite(s: State, fav: Favorite, at: number): State {
    if (isFavorite(s, fav.k)) return s;
    const favorites = s.favorites.slice();
    favorites.splice(Math.max(0, Math.min(at, favorites.length)), 0, fav);
    return { ...s, favorites };
  }

  // Forgets seen cards and every saved place. Favorites and settings stay.
  const resetProgress = (s: State): State => ({ ...newState(), tapToReveal: s.tapToReveal, haptics: s.haptics, favorites: s.favorites });

  const usage = (s: State): DeckInfo[] => NAMES.map(name => {
    const cards = cardsOf(name);
    return { name, count: cards.length, used: cards.filter(k => isSeen(s, k)).length };
  });
  const seenCount = (s: State) => ALL.filter(k => isSeen(s, k)).length;

  // Where each set of decks was left, so the picker can offer "Continue".
  function savedPlaces(s: State): Record<string, { index: number; total: number }> {
    const out: Record<string, { index: number; total: number }> = {};
    for (const [k, p] of Object.entries(s.progress)) out[k] = { index: p.index, total: p.order.length };
    if (s.started && s.order.length && !s.fresh) out[deckKey(s.decks)] = { index: s.index, total: s.order.length };
    return out;
  }

  // Brings a dealt order up to date with the questions in this version of the app, keeping
  // the place: retired cards drop out, and cards added since are shuffled into the cards
  // still to come. Returns null if the deal's decks no longer exist.
  function refresh(deal: Deal, decks: string[], keep: (key: string) => boolean = () => true): Deal | null {
    const known = decks.filter(c => Object.hasOwn(DECK, c));
    if (decks.length && !known.length) return null;
    const allowed = new Set((known.length ? known : NAMES).flatMap(cardsOf));
    const seenKeys = new Set<string>();
    const order: string[] = [];
    const was = Math.max(0, Math.min(deal.index, deal.order.length - 1));
    let index = was;
    deal.order.forEach((k, at) => {
      if (allowed.has(k) && !seenKeys.has(k)) { seenKeys.add(k); order.push(k); }
      else if (at < was) index--; // a dropped card before the current one moves it back a place
    });
    const had = new Set(deal.order);
    for (const k of buildOrder(known, k => !had.has(k) && keep(k))) order.splice(index + 1 + Math.floor(random() * (order.length - index)), 0, k);
    return { order, index: Math.max(0, Math.min(index, order.length - 1)) };
  }

  const strings = (x: unknown): string[] => Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : [];
  const toDeal = (x: any): Deal | null => x && typeof x === 'object' && Array.isArray(x.order)
    ? { order: strings(x.order), index: Number.isInteger(x.index) && x.index >= 0 ? x.index : 0 } : null;

  // Turns whatever was saved on the phone (possibly by an older version, possibly damaged)
  // into a state this version can play. Anything unusable is dropped rather than crashing.
  function restore(raw: unknown): State {
    const fresh0 = newState();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fresh0;
    const r = raw as Record<string, any>;
    const s: State = { ...fresh0, tapToReveal: r.tapToReveal === true, haptics: r.haptics !== false };

    if (r.seen && typeof r.seen === 'object') for (const k of Object.keys(r.seen)) if (live(k)) s.seen[k] = 1;
    const favs = new Set<string>();
    if (Array.isArray(r.favorites)) for (const f of r.favorites) {
      // A favorite whose question was later retired is kept with the wording it was saved with.
      if (!f || typeof f.k !== 'string' || typeof f.q !== 'string' || !f.q || favs.has(f.k)) continue;
      favs.add(f.k);
      s.favorites.push({ k: f.k, q: text(f.k) ?? f.q });
    }

    if (r.progress && typeof r.progress === 'object') for (const [key, value] of Object.entries(r.progress)) {
      const decks = key === 'All' ? [] : key.split('|');
      const deal = toDeal(value);
      if (!deal?.order.length || deckKey(cleanDecks(decks)) !== key) continue;
      const now = refresh(deal, decks);
      if (now?.order.length) s.progress[key] = now;
    }

    const deal = toDeal(r);
    const decks = cleanDecks(r.decks);
    if (r.started === true && deal) {
      s.decks = decks;
      s.fresh = r.fresh === true;
      let now = refresh(deal, decks, k => !s.fresh || !isSeen(s, k));
      // A new-cards-only deal with nothing left, or a deal that lost all its cards, is dealt again.
      if (!now?.order.length) { s.fresh = false; now = { order: buildOrder(decks), index: 0 }; }
      s.order = now.order; s.index = now.index;
      s.started = true;
      const same = deal.order[deal.index] === s.order[s.index];
      s.flipped = s.tapToReveal ? (same && r.flipped === true) : true;
      if (!s.fresh) delete s.progress[deckKey(decks)]; // the place being played is the current deal, not a saved one
    }
    return markSeen(s);
  }

  return { names: NAMES, total: ALL.length, text, view, live, deckKey, cleanDecks, newState, restore, current, next, prev, flip, setTapToReveal,
    setHaptics, start, reshuffle, isFavorite, toggleFavorite, resetProgress, usage, seenCount, unusedCount, savedPlaces, see, restoreFavorite };
}

export type Game = ReturnType<typeof makeGame>;
