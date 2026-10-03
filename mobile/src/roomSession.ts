import type { RoomState } from './api';

export type CardAction =
  | { type: 'answer'; id: string; cardKey: string; generation: number; text: string }
  | { type: 'favorite'; id: string; cardKey: string; generation: number };
export type Ack = { type: 'ack'; id: string; ok: boolean; error?: string; cardKey?: string };
export function decodeRoomMessage(raw: string): { kind: 'ack'; ack: Ack } | { kind: 'state'; room: RoomState } | null {
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    if (value.type === 'ack') {
      return typeof value.id === 'string' && typeof value.ok === 'boolean'
        && (value.error === undefined || typeof value.error === 'string')
        && (value.cardKey === undefined || typeof value.cardKey === 'string') ? { kind: 'ack', ack: value } : null;
    }
    if (value.protocolVersion === 2 && typeof value.roomId === 'string' && Number.isInteger(value.generation) && value.generation >= 0 && typeof value.card?.id === 'string'
      && typeof value.card.text === 'string' && Array.isArray(value.partners) && Array.isArray(value.decks)
      && Array.isArray(value.deckList) && Array.isArray(value.favorites) && value.saved && typeof value.saved === 'object') {
      return { kind: 'state', room: value };
    }
  } catch {}
  return null;
}

export class RoomSession {
  private drafts = new Map<string, string>();
  private pending = new Map<string, CardAction>();

  getDraft(cardKey: string) { return this.drafts.get(cardKey) || ''; }
  setDraft(cardKey: string, text: string) {
    if (text) this.drafts.set(cardKey, text); else this.drafts.delete(cardKey);
  }
  queue(action: CardAction) {
    if (this.pendingActions().some(a => a.type === action.type && a.cardKey === action.cardKey)) return false;
    this.pending.set(action.id, action);
    return true;
  }
  pendingActions() { return [...this.pending.values()]; }
  acknowledge(ack: Ack): CardAction | null {
    const action = this.pending.get(ack.id);
    if (!action || (ack.cardKey && ack.cardKey !== action.cardKey)) return null;
    this.pending.delete(ack.id);
    if (ack.ok && action.type === 'answer' && this.getDraft(action.cardKey).trim() === action.text) {
      this.drafts.delete(action.cardKey);
    }
    return action;
  }
}

// Kept above the room/answer screens so switching mode or leaving and rejoining
// does not destroy unfinished work. The scope includes the player and server.
const sessions = new Map<string, RoomSession>();
export function roomSession(scope: string, roomId: string) {
  const key = JSON.stringify([scope, roomId]);
  let session = sessions.get(key);
  if (!session) { session = new RoomSession(); sessions.set(key, session); }
  return session;
}
export function clearRoomSessions() { sessions.clear(); }
