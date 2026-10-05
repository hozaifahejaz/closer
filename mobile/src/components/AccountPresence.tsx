import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Safety } from './Safety';
import { useRoom, type Connection, type Link } from '../useRoom';

type Controls = { open: () => boolean; reclaim: () => void; safety: () => void };
// Keep the shared account room connected while its dashboard is visible.
export function AccountPresence({ token, id, name, controlsRef, onOpen, onLeave, onLink, onError, onProgress }: {
  token: string; id: string; name: string;
  controlsRef: RefObject<Controls | null>;
  onOpen: (conn: Connection) => void; onLeave: (message: string) => void;
  onLink: (link: Link) => void; onError: (message: string) => void; onProgress: (progress: { used: number; started: boolean }) => void;
}) {
  const conn = useMemo<Connection>(() => ({ kind: 'couple', token, id, name }), [token, id, name]);
  const { room, link, send, reclaim, error, requestSafety } = useRoom(conn, onLeave);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const version = useRef<number | null>(null);
  useEffect(() => {
    controlsRef.current = { safety: () => setSafetyOpen(true), open: () => link === 'live' && send({ type: 'openCards' }), reclaim };
    return () => { controlsRef.current = null; };
  }, [controlsRef, link, send, reclaim]);
  useEffect(() => { onLink(link); }, [link, onLink]);
  useEffect(() => { if (room) onProgress({ used: room.deckList.reduce((total, deck) => total + deck.used, 0), started: room.started }); }, [room, onProgress]);
  useEffect(() => { if (error) onError(error); }, [error, onError]);
  useEffect(() => {
    if (!room) return;
    const next = room.cardsOpenVersion || 0;
    if (version.current !== null && next > version.current) onOpen(conn);
    version.current = next;
  }, [room, conn, onOpen]);
  return room ? <Safety mode={safetyOpen ? 'report' : null} room={room} request={requestSafety} onClose={() => setSafetyOpen(false)} /> : null;
}
