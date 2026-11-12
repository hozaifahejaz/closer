import AsyncStorage from '@react-native-async-storage/async-storage';
import type { State } from './game';

// Everything the app remembers lives on this phone only, in two entries: the small one
// changes with every tap, the big one (the shuffled card orders) only when cards are dealt.
const CORE = 'closercards.core.v1';
const DEALS = 'closercards.deals.v1';

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
