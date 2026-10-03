import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Crypto from 'expo-crypto';
import { Account, Action, api, ApiError, RoomState } from './api';
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
    if (c.kind === 'guest') { await api(`/api/rooms/${c.code}`, null); return null; }
    const me = await api<Account>('/api/me', c.token);
    return me.partner ? null : "You're no longer linked.";
  } catch (e) {
    if (!(e instanceof ApiError)) return null;
    if (e.status === 404) return 'This room has ended. Start a new one.';
    if (e.status === 401) return 'Please log in again.';
    return null;
  }
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
  const retry = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handshake = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hadRoom = useRef(false);
  const alive = useRef(true);
  const replaced = useRef(false);
  const leave = useRef(onLeave);
  useEffect(() => { leave.current = onLeave; }, [onLeave]);

  const open = useCallback(function connect() {
    clearTimeout(timer.current);
    clearTimeout(handshake.current);
    const old = ws.current;
    ws.current = null;
    if (old) { old.onclose = null; old.onmessage = null; try { old.close(); } catch {} }
    const sock = new WebSocket(socketUrl(pathFor(conn)));
    ws.current = sock;
    let opened = false;
    let synchronized = false;
    handshake.current = setTimeout(() => {
      if (ws.current !== sock || synchronized) return;
      ws.current = null;
      try { sock.close(); } catch {}
      leave.current('Could not synchronize your room. Please try again with the latest version of Closer.');
    }, 12000);
    sock.onopen = () => { opened = true; retry.current = 0; };
    sock.onmessage = e => {
      if (sock !== ws.current) return; // a late message from a replaced socket
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
      hadRoom.current = true;
      setRoom(s);
      setLink('live');
      if (!synchronized) {
        synchronized = true;
        for (const action of session.current.pendingActions()) {
          try { sock.send(JSON.stringify(action)); } catch { break; }
        }
      }
    };
    sock.onclose = e => {
      if (sock !== ws.current || !alive.current) return; // replaced by a newer connection, or the screen is gone
      clearTimeout(handshake.current);
      ws.current = null;
      if (e.code === 4000) { replaced.current = true; setLink('replaced'); return; }
      if (e.code === 4001) { leave.current(e.reason || 'This room was closed.'); return; }
      setLink('reconnecting');
      const again = () => { timer.current = setTimeout(connect, Math.min(1000 * 2 ** retry.current++, 10000)); };
      // Refused outright (not a dropped network): the room may be gone for good, e.g. a
      // guest room forgotten overnight, a sign-in ended elsewhere, or no longer linked.
      if (opened) return again();
      roomGone(conn).then(why => {
        if (!alive.current || ws.current) return;
        if (why) leave.current(why);
        else if (!hadRoom.current) leave.current(conn.kind === 'couple' ? 'Could not open your room. Please try again.' : 'Could not join (the room may be full).');
        else again();
      });
    };
  }, [conn]);

  useEffect(() => {
    alive.current = true;
    open();
    // Phones drop sockets while asleep: reconnect as soon as the app is back.
    const sub = AppState.addEventListener('change', s => {
      if (s !== 'active' || replaced.current) return;
      // An apparently OPEN socket may be stale after the OS suspended the app.
      retry.current = 0; setLink('reconnecting'); open();
    });
    return () => {
      alive.current = false;
      sub.remove();
      clearTimeout(timer.current);
      clearTimeout(handshake.current);
      const sock = ws.current;
      ws.current = null;
      if (sock) { sock.onclose = null; try { sock.close(); } catch {} }
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

  const setDraft = useCallback((text: string) => {
    if (!room || !session.current) return;
    session.current.setDraft(room.card.id, text);
    changed(n => n + 1);
  }, [room]);

  const reclaim = useCallback(() => { replaced.current = false; retry.current = 0; setLink('reconnecting'); open(); }, [open]);

  const draft = room ? activeSession?.getDraft(room.card.id) || '' : '';
  const answerPending = !!room && !!activeSession?.pendingActions().some(a => a.type === 'answer' && a.cardKey === room.card.id);
  return { room, link, send, reclaim, draft, setDraft, answerPending, error };
}
