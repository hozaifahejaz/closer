import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { Action, RoomState } from './api';
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
    if (old) { old.onclose = null; try { old.close(); } catch {} }
    const sock = new WebSocket(socketUrl(pathFor(conn)));
    ws.current = sock;
    sock.onopen = () => { retry.current = 0; };
    sock.onmessage = e => {
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
      timer.current = setTimeout(open, Math.min(1000 * 2 ** retry.current++, 10000));
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
