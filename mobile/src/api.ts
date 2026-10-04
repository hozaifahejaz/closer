import { SERVER } from './config';
import { requestJson } from './request';
export { ApiError } from './request';

export type Partner = { id: string; name: string };
export type Account = { id: string; name: string; inviteCode: string; partner: Partner | null; isAdmin: boolean };

// Calls the same /api routes the website uses. The token goes in the
// Authorization header (the website's cookie isn't used by the apps).
export async function api<T = any>(path: string, token: string | null, body?: object): Promise<T> {
  return requestJson<T>(SERVER + path, token, body);
}

// What the room sends after every change (see publicState in worker/game.js).
export type DeckInfo = { name: string; count: number; used: number };
export type RoomState = {
  protocolVersion: 2;
  roomId: string;
  generation: number;
  code: string | null;
  couple: boolean;
  deckList: DeckInfo[];
  fresh: boolean;
  decks: string[];
  choosing: boolean;
  started: boolean;
  cardsOpenVersion?: number;
  saved: Record<string, { index: number; total: number }>;
  index: number;
  total: number;
  flipped: boolean;
  tapToReveal: boolean;
  card: { id: string; category: string; text: string };
  partners: string[];
  favorites: string[];
  mode: 'talk' | 'answer';
  myAnswer: string | null;
  partnerAnswered: boolean;
  revealed: { name: string; text: string; mine: boolean }[] | null;
};

export type Action =
  | { type: 'next' | 'prev' | 'flip' | 'openCards' }
  | { type: 'favorite'; cardKey: string; generation: number }
  | { type: 'tapToReveal' | 'choose'; on: boolean }
  | { type: 'decks'; decks: string[]; fresh: boolean }
  | { type: 'mode'; mode: 'talk' | 'answer' }
  | { type: 'answer'; cardKey: string; generation: number; text: string };
