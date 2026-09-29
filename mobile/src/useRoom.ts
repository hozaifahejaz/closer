import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Account, Action, api, ApiError, RoomState } from './api';
import { socketUrl } from './config';

export type Connection =
  | { kind: 'guest'; code: string; name: string; id: string }
  | { kind: 'couple'; token: string; name: string };

// connecting: first connection, not in the room yet. live: in sync.
// reconnecting: dropped (sleep, network change) and trying again, the room keeps its state meanwhile.
// replaced: the same person opened the room on another device, which took over their seat.
export type Link = 'connecting' | 'live' | 'reconnecting' | 'replaced';

const pathFor = (c: Connection) => c.kind === 'couple'
  ? `/api/couple/ws?token=${encodeURIComponent(c.token)}`
  : `/api/rooms/${c.code}/ws?name=${encodeURIComponent(c.name)}&id=${encodeURIComponent(c.id)}`;

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
  const ws = useRef<WebSocket | null>(null);
  const retry = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hadRoom = useRef(false);
  const alive = useRef(true);
  const replaced = useRef(false);
  const leave = useRef(onLeave);
  leave.current = onLeave;

  const open = useCallback(() => {
    clearTimeout(timer.current);
    const old = ws.current;
    ws.current = null;
    if (old) { old.onclose = null; old.onmessage = null; try { old.close(); } catch {} }
    const sock = new WebSocket(socketUrl(pathFor(conn)));
    ws.current = sock;
    let opened = false;
    sock.onopen = () => { opened = true; retry.current = 0; };
    sock.onmessage = e => {
      if (sock !== ws.current) return; // a late message from a replaced socket
      try {
        const s: RoomState = JSON.parse(String(e.data));
        hadRoom.current = true;
        setRoom(s);
        setLink('live');
      } catch {}
    };
    sock.onclose = e => {
      if (sock !== ws.current || !alive.current) return; // replaced by a newer connection, or the screen is gone
      ws.current = null;
      if (e.code === 4000) { replaced.current = true; setLink('replaced'); return; }
      if (e.code === 4001) { leave.current(e.reason || 'This room was closed.'); return; }
      if (!hadRoom.current) {
        leave.current(conn.kind === 'couple' ? 'Could not open your room. Please try again.' : 'Could not join (the room may be full).');
        return;
      }
      setLink('reconnecting');
      const again = () => { timer.current = setTimeout(open, Math.min(1000 * 2 ** retry.current++, 10000)); };
      // Refused outright (not a dropped network): the room may be gone for good, e.g. a
      // guest room forgotten overnight, a sign-in ended elsewhere, or no longer linked.
      if (opened) return again();
      roomGone(conn).then(why => {
        if (!alive.current || ws.current) return;
        if (why) leave.current(why); else again();
      });
    };
  }, [conn]);

  useEffect(() => {
    alive.current = true;
    open();
    // Phones drop sockets while asleep: reconnect as soon as the app is back.
    const sub = AppState.addEventListener('change', s => {
      if (s !== 'active' || !hadRoom.current || replaced.current) return;
      const sock = ws.current;
      if (!sock || sock.readyState > 1) { retry.current = 0; open(); }
    });
    return () => {
      alive.current = false;
      sub.remove();
      clearTimeout(timer.current);
      const sock = ws.current;
      ws.current = null;
      if (sock) { sock.onclose = null; try { sock.close(); } catch {} }
    };
  }, [open]);

  // Returns false when the tap couldn't be sent (offline for a moment).
  const send = useCallback((action: Action) => {
    const sock = ws.current;
    if (sock && sock.readyState === WebSocket.OPEN) { sock.send(JSON.stringify(action)); return true; }
    return false;
  }, []);

  const reclaim = useCallback(() => { replaced.current = false; retry.current = 0; setLink('reconnecting'); open(); }, [open]);

  return { room, link, send, reclaim };
}
