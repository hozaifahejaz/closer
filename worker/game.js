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

// A retired question stays in questions.json as null, so every other card keeps
// its number (answers and saved places refer to cards by deck and number).
const live = card => DECK[card.c]?.[card.i] != null;
const cards = c => DECK[c].map((q, i) => ({ c, i })).filter(live);

// A room plays one or more decks (categories); no decks chosen means all of them.
// `keep` can leave cards out (used for "only cards we haven't seen").
function buildOrder(decks, keep = () => true) {
  const cats = decks.length ? decks : CATEGORIES;
  return shuffle(cats.flatMap(cards).filter(keep));
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
  if (!room) return room;
  if (!room.decks) {
    room.decks = !room.category || room.category === 'All' ? [] : [room.category];
    room.progress = {};
    room.choosing = false;
    room.started = true;
  }
  const current = room.order[room.index];
  const now = refresh(room.order, room.index, room.decks, c => !room.fresh || !isUsed(room, c));
  if (now) {
    if (!now.order.length) { room.fresh = false; Object.assign(room, refresh([], 0, room.decks)); }
    else Object.assign(room, now);
    if (room.order[room.index] !== current) freshCard(room);
  }
  for (const [key, p] of Object.entries(room.progress)) {
    const next = refresh(p.order, p.index, key === 'All' ? [] : key.split('|'));
    if (next?.order.length) room.progress[key] = next;
    else if (next) delete room.progress[key];
  }
  return room;
}
// Brings a dealt order up to date with questions.json, keeping the room's place:
// retired cards drop out, and cards added since are shuffled into the cards still
// to come. A new-cards-only deal gets just the unseen ones. Returns null if nothing changed.
function refresh(order, index, decks, keep = () => true) {
  const known = decks.filter(c => DECK[c]);
  if (decks.length && !known.length) return null;
  const kept = order.filter(live);
  const have = new Set(order.map(cardKey));
  const missing = buildOrder(known, c => !have.has(cardKey(c)) && keep(c));
  if (kept.length === order.length && !missing.length) return null;
  // Every retired card before the current one moves it back a place; if the current
  // card itself was retired, the room lands on the card after it.
  index -= order.slice(0, index).filter(c => !live(c)).length;
  const next = kept.slice();
  for (const card of missing) next.splice(index + 1 + Math.floor(Math.random() * (next.length - index)), 0, card);
  return { order: next, index: Math.max(0, Math.min(index, next.length - 1)) };
}

// A card counts as used once it has been shown face up in the room, or either
// partner has answered it.
const isUsed = (room, card) => Boolean(room.seen?.[cardKey(card)]) || cardKey(card) in room.answers;
function markSeen(room) {
  if (!room.flipped) return;
  room.seen ||= {};
  room.seen[cardKey(room.order[room.index])] = true;
}

// Switches decks, remembering where the room was in the old set and picking
// up where it left off if it has played the new set before. With `fresh`, it
// deals only cards the room hasn't used yet (a fresh deal each time, not saved).
function useDecks(room, decks, fresh) {
  if (!room.fresh) room.progress[deckKey(room.decks)] = { order: room.order, index: room.index };
  room.decks = decks;
  room.category = deckLabel(decks);
  room.fresh = fresh;
  const saved = !fresh && room.progress[deckKey(decks)];
  if (saved) { room.order = saved.order; room.index = saved.index; }
  else { room.order = fresh ? buildOrder(decks, c => !isUsed(room, c)) : buildOrder(decks); room.index = 0; }
  // A fresh deal leaves the saved place in this set alone, to come back to later.
  if (!fresh) delete room.progress[deckKey(decks)];
}
const unusedCount = (room, decks) => (decks.length ? decks : CATEGORIES)
  .reduce((n, c) => n + cards(c).filter(card => !isUsed(room, card)).length, 0);

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
    deckList: CATEGORIES.map(name => ({ name, count: cards(name).length, used: cards(name).filter(card => isUsed(room, card)).length })),
    fresh: Boolean(room.fresh),
    decks: room.decks,
    choosing: Boolean(room.choosing),
    started: room.started !== false,
    // Where the room is in every set of decks it has played, so the picker can offer "Continue".
    saved: Object.fromEntries([...Object.entries(room.progress).map(([k, p]) => [k, { index: p.index, total: p.order.length }]),
      ...(room.fresh ? [] : [[deckKey(room.decks), { index: room.index, total: room.order.length }]])]),
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
export function applyAction(room, actorId, isPlayer, action) {
  const result = act(room, actorId, isPlayer, action);
  if (result) markSeen(room);
  return result;
}

function act(room, actorId, isPlayer, { type, category, decks, fresh, mode, text, on }) {
  if (type === 'next') { room.index = (room.index + 1) % room.order.length; freshCard(room); }
  else if (type === 'prev') { room.index = (room.index - 1 + room.order.length) % room.order.length; freshCard(room); }
  else if (type === 'flip') { if (tapToReveal(room)) room.flipped = !room.flipped; }
  else if (type === 'tapToReveal' && typeof on === 'boolean') { room.tapToReveal = on; if (!on) room.flipped = true; }
  else if (type === 'decks' && Array.isArray(decks)) {
    const next = cleanDecks(decks);
    if (!next.length && decks.length && decks.length < CATEGORIES.length) return false; // nothing valid picked
    // Only couples (accounts) can deal just the cards they haven't used.
    const onlyNew = fresh === true && Boolean(room.coupleId);
    if (onlyNew && !unusedCount(room, next)) return false;
    if (onlyNew || room.fresh || deckKey(next) !== deckKey(room.decks)) { useDecks(room, next, onlyNew); freshCard(room); }
    room.choosing = false;
    room.started = true;
  } else if (type === 'choose' && typeof on === 'boolean') room.choosing = on;
  else if (type === 'category' && (category === 'All' || CATEGORIES.includes(category))) {
    useDecks(room, category === 'All' ? [] : [category], false); freshCard(room);
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
