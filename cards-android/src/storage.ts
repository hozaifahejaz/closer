import AsyncStorage from '@react-native-async-storage/async-storage';
import type { State } from './game';

// Everything the app remembers lives on this phone only, in two entries: the small one
// changes with every tap, the big one (the shuffled card orders) only when cards are dealt.
const CORE = 'mothlamp.core.v1';
const DEALS = 'mothlamp.deals.v1';

const parse = (text: string | null) => { try { return text ? JSON.parse(text) : null; } catch { return null; } };

export async function load(): Promise<unknown> {
  try {
    const [[, core], [, deals]] = await AsyncStorage.multiGet([CORE, DEALS]);
    const a = parse(core), b = parse(deals);
    return a && typeof a === 'object' ? { ...(b && typeof b === 'object' ? b : {}), ...a } : null;
  } catch { return null; }
}

let last: State | null = null;
let queued: State | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let writing: Promise<void> = Promise.resolve();

function write(s: State) {
  const before = last;
  last = s;
  const { order, progress, ...core } = s;
  const pairs: [string, string][] = [[CORE, JSON.stringify(core)]];
  if (!before || before.order !== order || before.progress !== progress) pairs.push([DEALS, JSON.stringify({ order, progress })]);
  // One write at a time, in order, so an older state can never land after a newer one.
  writing = writing.then(() => AsyncStorage.multiSet(pairs)).catch(() => { last = null; });
}

// Saves shortly after the last change, so quick taps cost one write, not many.
export function save(s: State) {
  queued = s;
  if (timer) return;
  timer = setTimeout(flush, 300);
}

// Writes anything still waiting right now (the app is going to the background).
export function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (queued && queued !== last) write(queued);
  queued = null;
}

// Which screen was open, so a restart that the person didn't ask for (Android rebuilding the app
// after a font size, theme or window change, or clearing it from memory in the background) comes
// back to the same place. A fresh start much later opens on Home as usual.
const NAV = 'mothlamp.nav.v1';
const NAV_KEEP = 30 * 60 * 1000;
let navNow: unknown = null; // survives while the JavaScript side stays alive

export async function loadNav(): Promise<unknown> {
  if (navNow) return navNow;
  try {
    const saved = parse(await AsyncStorage.getItem(NAV));
    return saved && typeof saved.at === 'number' && Math.abs(Date.now() - saved.at) < NAV_KEEP ? saved.screen : null;
  } catch { return null; }
}

export function saveNav(screen: unknown) {
  navNow = screen;
  AsyncStorage.setItem(NAV, JSON.stringify({ screen, at: Date.now() })).catch(() => {});
}

// Whether the one-time "for adults" note on first launch has been read.
const WELCOMED = 'mothlamp.welcomed.v1';
export async function loadWelcomed(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(WELCOMED)) === '1'; } catch { return true; }
}
export function saveWelcomed() { AsyncStorage.setItem(WELCOMED, '1').catch(() => {}); }
