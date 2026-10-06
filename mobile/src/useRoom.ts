import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Crypto from 'expo-crypto';
import { Account, Action, api, ApiError, RoomState, SafetyAction } from './api';
import { SERVER, socketUrl } from './config';
import { decodeRoomMessage, roomSession, RoomSession } from './roomSession';

export type Connection =
  | { kind: 'guest'; code: string; name: string; id: string }
  | { kind: 'couple'; token: string; name: string; id: string };

// connecting: first connection, not in the room yet. live: in sync.
// reconnecting: dropped (sleep, network change) and trying again, the room keeps its state meanwhile.
// replaced: the same person opened the room on another device, which took over their seat.
export type Link = 'connecting' | 'live' | 'reconnecting' | 'replaced';

const pathFor = (c: Connection) => c.kind === 'couple'
  ? `/api/couple/ws?protocol=2&token=${encodeURIComponent(c.token)}`
  : `/api/rooms/${c.code}/ws?protocol=2&name=${encodeURIComponent(c.name)}&id=${encodeURIComponent(c.id)}`;

// One live connection to a room, like the website's: every tap is sent over the
// socket and the room broadcasts the new state to both partners.
// Why the room can't be reopened, or null if it can (or we can't tell while offline).
async function roomGone(c: Connection): Promise<string | null> {
  try {
    if (c.kind === 'guest') { await api(`/api/rooms/${c.code}?id=${encodeURIComponent(c.id)}`, null); return null; }
    const me = await api<Account>('/api/me', c.token);
    if (!me.partner) return "You're no longer linked.";
    if (!me.termsAccepted) return 'Accept the Terms of Use before joining a room.';
    // /api/me still permits account maintenance while partner interactions are
    // restricted. History checks the shared room's current access policy.
    await api('/api/history', c.token);
    return null;
  } catch (e) {
    if (!(e instanceof ApiError)) return null;
    if (e.status === 404) return 'This room has ended. Start a new one.';
    if (e.status === 401) return 'Please log in again.';
    if (e.status === 403 || (c.kind === 'guest' && e.status === 409)) return e.message;
    return null;
  }
}

function closeSocket(sock: WebSocket | null) {
  if (!sock) return;
  sock.onopen = null; sock.onclose = null; sock.onmessage = null;
  try { sock.close(); } catch {}
}

export function useRoom(conn: Connection, onLeave: (message: string) => void) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [link, setLink] = useState<Link>('connecting');
  const [error, setError] = useState('');
  const [activeSession, setActiveSession] = useState<RoomSession | null>(null);
  const [, changed] = useState(0);
  const current = useRef<RoomState | null>(null);
  const session = useRef<RoomSession | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const safetyPending = useRef(new Map<string, { resolve: (result: { reportId?: string }) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>());
  const retry = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handshake = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const attempt = useRef(0);
  const alive = useRef(true);
  const paused = useRef(false);
  const ended = useRef(false);
  const replaced = useRef(false);
  const leave = useRef(onLeave);
  useEffect(() => { leave.current = onLeave; }, [onLeave]);

  const open = useCallback(function connect() {
    if (!alive.current || paused.current || ended.current || replaced.current) return;
    clearTimeout(timer.current);
    clearTimeout(handshake.current);
    const old = ws.current;
    ws.current = null;
    closeSocket(old);
    const version = ++attempt.current;
    const sock = new WebSocket(socketUrl(pathFor(conn)));
    ws.current = sock;
    let synchronized = false;
    const recover = (message: string) => {
      if (ws.current !== sock || !alive.current) return;
      clearTimeout(handshake.current);
      ws.current = null;
      closeSocket(sock);
      setLink('reconnecting');
      setError(message);
      const again = () => {
        if (!alive.current || paused.current || ended.current || replaced.current || attempt.current !== version) return;
        timer.current = setTimeout(connect, Math.min(1000 * 2 ** Math.min(retry.current++, 4), 10000));
      };
      if (synchronized) { again(); return; }
      roomGone(conn).then(why => {
        if (!alive.current || paused.current || attempt.current !== version || ws.current) return;
        if (why) { ended.current = true; setError(why); leave.current(why); }
        else again();
      });
    };
    handshake.current = setTimeout(() => {
      if (!synchronized) recover('Could not synchronize your room. Trying again…');
    }, 12000);
    sock.onmessage = e => {
      if (sock !== ws.current) return; // a late message from a replaced socket
      let control;
      try { control = JSON.parse(String(e.data)); } catch { return; }
      if (control?.type === 'safetyResult') {
        const pending = safetyPending.current.get(control.id);
        if (pending) { clearTimeout(pending.timer); safetyPending.current.delete(control.id); if (control.ok === true) pending.resolve(control); else pending.reject(new Error(control.error || 'Could not save.')); }
        return;
      }
      const frame = decodeRoomMessage(String(e.data));
      if (!frame) return;
      // Acknowledgements are control messages, never room state.
      if (frame.kind === 'ack') {
        const action = session.current?.acknowledge(frame.ack);
        if (action) {
          if (!frame.ack.ok) setError(frame.ack.error || 'Could not save. Your answer is still here.');
          changed(n => n + 1);
        }
        return;
      }
      const s = frame.room;
      clearTimeout(handshake.current);
      current.current = s;
      session.current = roomSession(JSON.stringify([SERVER, conn.kind, conn.id]), s.roomId);
      setActiveSession(session.current);
      setRoom(s);
      setLink('live');
      if (!synchronized) {
        synchronized = true;
        retry.current = 0;
        setError('');
        for (const action of session.current.pendingActions()) {
          try { sock.send(JSON.stringify(action)); } catch { break; }
        }
      }
    };
    sock.onclose = e => {
      if (sock !== ws.current || !alive.current) return; // replaced by a newer connection, or the screen is gone
      if (e.code === 4000 || e.code === 4001) {
        clearTimeout(handshake.current); ws.current = null; closeSocket(sock);
        if (e.code === 4000) { replaced.current = true; setError(''); setLink('replaced'); }
        else {
          ended.current = true;
          const reason = e.reason || 'This room was closed.';
          setLink('reconnecting'); setError(reason); leave.current(reason);
        }
        return;
      }
      recover('Connection interrupted. Trying again…');
    };
  }, [conn]);

  useEffect(() => {
    alive.current = true;
    paused.current = AppState.currentState === 'background' || AppState.currentState === 'inactive';
    ended.current = false;
    replaced.current = false;
    const pendingSafety = safetyPending.current;
    open();
    // Phones drop sockets while asleep: reconnect as soon as the app is back.
    const sub = AppState.addEventListener('change', s => {
      paused.current = s !== 'active';
      if (paused.current) {
        ++attempt.current;
        clearTimeout(timer.current); clearTimeout(handshake.current);
        const sock = ws.current; ws.current = null; closeSocket(sock);
        if (!replaced.current && !ended.current) setLink('reconnecting');
        return;
      }
      if (replaced.current || ended.current) return;
      // An apparently OPEN socket may be stale after the OS suspended the app.
      retry.current = 0; setLink('reconnecting'); open();
    });
    return () => {
      alive.current = false;
      for (const pending of pendingSafety.values()) { clearTimeout(pending.timer); pending.reject(new Error('You left the room before confirmation.')); }
      pendingSafety.clear();
      sub.remove();
      clearTimeout(timer.current);
      clearTimeout(handshake.current);
      const sock = ws.current;
      ws.current = null;
      closeSocket(sock);
    };
  }, [open]);

  // Card commands remain pending until acknowledged. Other controls are sent
  // immediately and return false if the connection is unavailable.
  const send = useCallback((action: Action) => {
    const sock = ws.current;
    if (action.type === 'answer' || action.type === 'favorite') {
      const state = current.current, store = session.current;
      if (!state || !store || replaced.current) return false;
      const message = { ...action, id: Crypto.randomUUID() };
      if (!store.queue(message)) return true;
      setError('');
      changed(n => n + 1);
      if (sock?.readyState === WebSocket.OPEN) {
        try { sock.send(JSON.stringify(message)); } catch { /* retained for reconnect */ }
      }
      return true;
    }
    if (sock && sock.readyState === WebSocket.OPEN) {
      try { sock.send(JSON.stringify(action)); return true; } catch {}
    }
    return false;
  }, []);

  const requestSafety = useCallback((action: SafetyAction) => new Promise<{ reportId?: string }>((resolve, reject) => {
    const sock = ws.current;
    if (sock?.readyState !== WebSocket.OPEN) { reject(new Error('Reconnect before using this action.')); return; }
    const id = Crypto.randomUUID();
    const timer = setTimeout(() => { safetyPending.current.delete(id); reject(new Error('No confirmation received. Please reconnect and try again.')); }, 12000);
    safetyPending.current.set(id, { resolve, reject, timer });
    try { sock.send(JSON.stringify({ ...action, id })); } catch { clearTimeout(timer); safetyPending.current.delete(id); reject(new Error('Connection interrupted. Please try again.')); }
  }), []);

  const setDraft = useCallback((text: string) => {
    if (!room || !session.current) return;
    session.current.setDraft(room.card.id, text);
    changed(n => n + 1);
  }, [room]);

  const reclaim = useCallback(() => { replaced.current = false; ended.current = false; retry.current = 0; setError(''); setLink('reconnecting'); open(); }, [open]);

  const draft = room ? activeSession?.getDraft(room.card.id) || '' : '';
  const answerPending = !!room && !!activeSession?.pendingActions().some(a => a.type === 'answer' && a.cardKey === room.card.id);
  return { room, link, send, reclaim, draft, setDraft, answerPending, error, requestSafety };
}
