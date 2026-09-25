import { SERVER } from './config';

export type Partner = { id: string; name: string };
export type Account = { id: string; name: string; inviteCode: string; partner: Partner | null; isAdmin: boolean };

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

// Calls the same /api routes the website uses. The token goes in the
// Authorization header (the website's cookie isn't used by the apps).
export async function api<T = any>(path: string, token: string | null, body?: object): Promise<T> {
  let res: Response;
  try {
    res = await fetch(SERVER + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Can't reach Closer. Check your connection and try again.", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'Something went wrong, please try again', res.status);
  return data as T;
}

// What the room sends after every change (see publicState in worker/game.js).
export type DeckInfo = { name: string; count: number; used: number };
export type RoomState = {
  code: string | null;
  couple: boolean;
  deckList: DeckInfo[];
  fresh: boolean;
  decks: string[];
  choosing: boolean;
  started: boolean;
  saved: Record<string, { index: number; total: number }>;
  index: number;
  total: number;
  flipped: boolean;
  tapToReveal: boolean;
  card: { category: string; text: string };
  partners: string[];
  favorites: string[];
  mode: 'talk' | 'answer';
  myAnswer: string | null;
  partnerAnswered: boolean;
  revealed: { name: string; text: string; mine: boolean }[] | null;
};

export type Action =
  | { type: 'next' | 'prev' | 'flip' | 'favorite' }
  | { type: 'tapToReveal' | 'choose'; on: boolean }
  | { type: 'decks'; decks: string[]; fresh: boolean }
  | { type: 'mode'; mode: 'talk' | 'answer' }
  | { type: 'answer'; text: string };
