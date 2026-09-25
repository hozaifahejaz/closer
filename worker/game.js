// Game rules shared by every room: the deck, whose turn it is to see what,
// and how each tap changes the room.
import DECK from '../questions.json';

export const CATEGORIES = Object.keys(DECK);

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// A room plays one or more decks (categories); no decks chosen means all of them.
function buildOrder(decks) {
  const cats = decks.length ? decks : CATEGORIES;
  return shuffle(cats.flatMap(c => DECK[c].map((q, i) => ({ c, i }))));
}
const deckKey = decks => decks.length ? decks.join('|') : 'All';
const deckLabel = decks => !decks.length ? 'All' : decks.length === 1 ? decks[0] : `${decks.length} decks`;
// Keeps the deck order stable and turns "every deck" into the shorthand [].
function cleanDecks(list) {
  const picked = CATEGORIES.filter(c => Array.isArray(list) && list.includes(c));
  return picked.length === CATEGORIES.length ? [] : picked;
}

export function randomCode(length) {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, b => letters[b % letters.length]).join('');
}

export function newRoom(code, coupleId = null) {
  return { code, coupleId, decks: [], category: 'All', order: buildOrder([]), index: 0, progress: {}, choosing: true, started: false,
    flipped: false, tapToReveal: true, favorites: [], mode: 'talk', answers: {} };
}

// Rooms saved before decks existed only had one category.
export function upgradeRoom(room) {
  if (!room || room.decks) return room;
  room.decks = !room.category || room.category === 'All' ? [] : [room.category];
  room.progress = {};
  room.choosing = false;
  room.started = true;
  return room;
}

// Switches decks, remembering where the room was in the old set and picking
// up where it left off if it has played the new set before.
function useDecks(room, decks) {
  room.progress[deckKey(room.decks)] = { order: room.order, index: room.index };
  const saved = room.progress[deckKey(decks)];
  room.decks = decks;
  room.category = deckLabel(decks);
  if (saved) { room.order = saved.order; room.index = saved.index; }
  else { room.order = buildOrder(decks); room.index = 0; }
  delete room.progress[deckKey(decks)];
}

// Rooms saved before the setting existed have no field: treat them as "tap to reveal" on.
const tapToReveal = room => room.tapToReveal !== false;
// With tap to reveal off, every card lands face up.
function freshCard(room) {
  room.flipped = !tapToReveal(room);
}

export const cardKey = card => `${card.c}:${card.i}`;
export const questionText = card => DECK[card.c]?.[card.i];

// State is tailored per viewer: a partner's answer stays hidden until both have answered.
// `players` is a Map of player id -> name for everyone currently connected.
export function publicState(room, players, viewerId) {
  const card = room.order[room.index];
  const answers = room.answers[cardKey(card)] || {};
  const ids = [...players.keys()];
  const bothAnswered = ids.length === 2 && ids.every(id => id in answers);
  return {
    code: room.coupleId ? null : room.code,
    couple: Boolean(room.coupleId),
    deckList: CATEGORIES.map(name => ({ name, count: DECK[name].length })),
    decks: room.decks,
    choosing: Boolean(room.choosing),
    started: room.started !== false,
    // Where the room is in every set of decks it has played, so the picker can offer "Continue".
    saved: Object.fromEntries([...Object.entries(room.progress).map(([k, p]) => [k, { index: p.index, total: p.order.length }]),
      [deckKey(room.decks), { index: room.index, total: room.order.length }]]),
    index: room.index,
    total: room.order.length,
    flipped: room.flipped,
    tapToReveal: tapToReveal(room),
    card: { category: card.c, text: questionText(card) },
    partners: [...players.values()],
    favorites: room.favorites,
    mode: room.mode,
    myAnswer: answers[viewerId] ?? null,
    partnerAnswered: ids.some(id => id !== viewerId && id in answers),
    revealed: bothAnswered ? ids.map(id => ({ name: players.get(id), text: answers[id], mine: id === viewerId })) : null,
  };
}

// Applies one action. Returns false for anything unrecognised, otherwise an
// object describing what (if anything) should be saved for a couple.
export function applyAction(room, actorId, isPlayer, { type, category, decks, mode, text, on }) {
  if (type === 'next') { room.index = (room.index + 1) % room.order.length; freshCard(room); }
  else if (type === 'prev') { room.index = (room.index - 1 + room.order.length) % room.order.length; freshCard(room); }
  else if (type === 'flip') { if (tapToReveal(room)) room.flipped = !room.flipped; }
  else if (type === 'tapToReveal' && typeof on === 'boolean') { room.tapToReveal = on; if (!on) room.flipped = true; }
  else if (type === 'decks' && Array.isArray(decks)) {
    const next = cleanDecks(decks);
    if (!next.length && decks.length && decks.length < CATEGORIES.length) return false; // nothing valid picked
    if (deckKey(next) !== deckKey(room.decks)) { useDecks(room, next); freshCard(room); }
    room.choosing = false;
    room.started = true;
  } else if (type === 'choose' && typeof on === 'boolean') room.choosing = on;
  else if (type === 'category' && (category === 'All' || CATEGORIES.includes(category))) {
    useDecks(room, category === 'All' ? [] : [category]); freshCard(room);
  } else if (type === 'favorite') {
    const q = questionText(room.order[room.index]);
    const on = !room.favorites.includes(q);
    room.favorites = on ? [...room.favorites, q] : room.favorites.filter(f => f !== q);
    return { favorite: { question: q, on } };
  } else if (type === 'mode' && (mode === 'talk' || mode === 'answer')) {
    room.mode = mode;
  } else if (type === 'answer' && isPlayer && typeof text === 'string' && text.trim()) {
    const card = room.order[room.index];
    const key = cardKey(card);
    const clean = text.trim().slice(0, 1000);
    room.answers[key] = { ...room.answers[key], [actorId]: clean };
    return { answer: { cardKey: key, question: questionText(card), text: clean } };
  } else return false;
  return {};
}
