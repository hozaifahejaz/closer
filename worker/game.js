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

function buildOrder(category) {
  const cats = category === 'All' ? CATEGORIES : [category];
  return shuffle(cats.flatMap(c => DECK[c].map((q, i) => ({ c, i }))));
}

export function randomCode(length) {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, b => letters[b % letters.length]).join('');
}

export function newRoom(code, coupleId = null) {
  return { code, coupleId, category: 'All', order: buildOrder('All'), index: 0, flipped: false, tapToReveal: true, favorites: [], mode: 'talk', answers: {} };
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
    categories: ['All', ...CATEGORIES],
    category: room.category,
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
export function applyAction(room, actorId, isPlayer, { type, category, mode, text, on }) {
  if (type === 'next') { room.index = (room.index + 1) % room.order.length; freshCard(room); }
  else if (type === 'prev') { room.index = (room.index - 1 + room.order.length) % room.order.length; freshCard(room); }
  else if (type === 'flip') { if (tapToReveal(room)) room.flipped = !room.flipped; }
  else if (type === 'tapToReveal' && typeof on === 'boolean') { room.tapToReveal = on; if (!on) room.flipped = true; }
  else if (type === 'category' && (category === 'All' || CATEGORIES.includes(category))) {
    room.category = category; room.order = buildOrder(category); room.index = 0; freshCard(room);
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
