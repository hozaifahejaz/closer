import Svg, { Circle, Ellipse, G, Path, Rect, SvgXml } from 'react-native-svg';

// Each deck's colours and line artwork, the same as the website's deck picker (public/index.html).
// c1 is the soft tint, c2 the line and accent colour.
export const DECK_COLORS: Record<string, { c1: string; c2: string }> = {
  All: { c1: '#9b5aa6', c2: '#5a2d66' },
  'Getting Closer': { c1: '#f08a7e', c2: '#c9486a' },
  'Who You Are': { c1: '#9a7ff0', c2: '#5236a3' },
  'Us & The Future': { c1: '#eeaa52', c2: '#a4531f' },
  'Honest & Vulnerable': { c1: '#c2567a', c2: '#7a2a4b' },
  'Light & Playful': { c1: '#45bfae', c2: '#1d6a74' },
  'Desire & Intimacy': { c1: '#e8735a', c2: '#a33b24' },
  'Conflict & Repair': { c1: '#6f9cf0', c2: '#2f53a3' },
  'Life & Meaning': { c1: '#8fb86a', c2: '#4b6e2e' },
  'Guess My Answer': { c1: '#e2b33c', c2: '#8a6512' },
  'Would You Rather': { c1: '#d673c4', c2: '#86287a' },
  'Weekly Check-in': { c1: '#8a96b8', c2: '#3e4a6e' },
  Dilemmas: { c1: '#c79a6b', c2: '#7a5230' },
  'Long Distance': { c1: '#4fb0d6', c2: '#1c5f7d' },
  'Midnight Questions': { c1: '#6c6fd8', c2: '#2a2c72' },
  'Money & Work': { c1: '#4fa36b', c2: '#1f5a37' },
  'Alien Interview': { c1: '#8bc34a', c2: '#3f6b16' },
  'Genie Wishes': { c1: '#a15ee0', c2: '#4d1f86' },
  'Amnesia': { c1: '#e0a47a', c2: '#8a5028' },
  'Act It Out': { c1: '#f0617d', c2: '#9a1f3c' },
  'Job Interview': { c1: '#3f8f9e', c2: '#164c57' },
  'Unsent': { c1: '#8fb4d9', c2: '#345b85' },
  'Bad Advice': { c1: '#f4823c', c2: '#99400b' },
  'How Much Would You Pay': { c1: '#c9b458', c2: '#6a5c14' },
  'The Worst': { c1: '#a1887f', c2: '#5d4037' },
  'Tiny Vows': { c1: '#f7a0b8', c2: '#a63a5c' },
  'Comfort Codes': { c1: '#c3a6e8', c2: '#5c3f8f' },
};
export const deckColors = (name: string) => DECK_COLORS[name] || DECK_COLORS['Getting Closer'];

const FAN = Object.entries(DECK_COLORS).filter(([k]) => k !== 'All').map(([, v]) => v.c1);
const GOLD = '#c8912a';

// Newer decks keep the website's artwork as-is (the markup in DECK_ART in public/index.html),
// drawn with the same classes: tint (soft fill), soft (faded line) and fill (solid).
const MARKUP: Record<string, [string, string]> = {
  "Alien Interview": ["16 14 88 76", "<path class=\"tint\" d=\"M48 42a12 12 0 0 1 24 0z\"/><path d=\"M48 42a12 12 0 0 1 24 0M60 30v-6\"/><circle class=\"fill\" cx=\"60\" cy=\"22\" r=\"2\"/><ellipse class=\"tint\" cx=\"60\" cy=\"47\" rx=\"30\" ry=\"8\"/><ellipse cx=\"60\" cy=\"47\" rx=\"30\" ry=\"8\"/><g class=\"fill\"><circle cx=\"44\" cy=\"48\" r=\"1.8\"/><circle cx=\"60\" cy=\"50\" r=\"1.8\"/><circle cx=\"76\" cy=\"48\" r=\"1.8\"/></g><path class=\"soft\" d=\"M50 56l-10 26M70 56l10 26M36 86h48\"/>"],
  "Genie Wishes": ["20 12 84 72", "<path class=\"tint\" d=\"M34 70h40c0-10-9-16-20-16s-20 6-20 16z\"/><path d=\"M34 70h40c0-10-9-16-20-16s-20 6-20 16zM74 66c8 0 14-4 20-10M34 64c-8 0-10-10-2-10M48 54c0-4 3-6 6-6s6 2 6 6M44 70v6h20v-6M40 80h28\"/><path class=\"soft\" d=\"M94 54c4-8-6-10-2-18s12-6 8-14\"/><path class=\"fill\" d=\"M86 16l1.6 4.4 4.4 1.6-4.4 1.6L86 28l-1.6-4.4-4.4-1.6 4.4-1.6z\"/>"],
  "Amnesia": ["22 12 76 76", "<g transform=\"rotate(-6 56 48)\"><rect class=\"tint\" x=\"34\" y=\"22\" width=\"44\" height=\"54\" rx=\"3\"/><rect x=\"34\" y=\"22\" width=\"44\" height=\"54\" rx=\"3\"/><rect class=\"soft\" x=\"39\" y=\"27\" width=\"34\" height=\"32\" rx=\"1.5\"/></g><path d=\"M51 37a5 5 0 1 1 7 4.6c-1.3.7-2 1.7-2 3.2v1\"/><circle class=\"fill\" cx=\"56\" cy=\"51\" r=\"1.8\"/><path class=\"soft\" stroke-dasharray=\"2 4\" d=\"M86 30c6 6 6 18 0 26\"/>"],
  "Act It Out": ["18 16 84 72", "<path class=\"tint\" d=\"M32 30h32v18c0 12-7 20-16 20s-16-8-16-20z\"/><path d=\"M32 30h32v18c0 12-7 20-16 20s-16-8-16-20zM39 42c2-2 4-2 6 0M51 42c2-2 4-2 6 0M40 54c4 5 12 5 16 0\"/><g transform=\"rotate(12 76 58)\"><path class=\"tint\" d=\"M60 40h32v18c0 12-7 20-16 20s-16-8-16-20z\"/><path d=\"M60 40h32v18c0 12-7 20-16 20s-16-8-16-20zM67 54c2 2 4 2 6 0M79 54c2 2 4 2 6 0M68 68c4-5 12-5 16 0\"/></g>"],
  "Job Interview": ["24 12 72 80", "<path class=\"soft\" d=\"M44 18L32 88M76 18l12 70\"/><path d=\"M44 18l16 10 16-10\"/><path class=\"tint\" d=\"M54 28h12l-2 8h-8z\"/><path class=\"tint\" d=\"M56 36l-6 34 10 10 10-10-6-34z\"/><path d=\"M54 28h12l-2 8h-8zM56 36l-6 34 10 10 10-10-6-34z\"/><path class=\"soft\" d=\"M54 50l12-6M52 62l16-8\"/>"],
  "Unsent": ["16 20 90 64", "<rect class=\"tint\" x=\"24\" y=\"32\" width=\"60\" height=\"42\" rx=\"4\"/><rect x=\"24\" y=\"32\" width=\"60\" height=\"42\" rx=\"4\"/><path d=\"M24 36l30 22 30-22\"/><path class=\"fill\" d=\"M54 67c-.4 0-7-4.2-7-8.6 0-2.3 1.8-4 3.9-4 1.4 0 2.5.8 3.1 1.8.6-1 1.7-1.8 3.1-1.8 2.1 0 3.9 1.7 3.9 4 0 4.4-6.6 8.6-7 8.6z\"/><path class=\"soft\" stroke-dasharray=\"3 5\" d=\"M88 30c6-4 10-4 14 0\"/>"],
  "Bad Advice": ["20 14 80 76", "<path class=\"tint\" d=\"M60 20l32 56H28z\"/><path d=\"M60 20l32 56H28zM60 40v18\"/><circle class=\"fill\" cx=\"60\" cy=\"66\" r=\"2.4\"/><path class=\"soft\" d=\"M24 84h72\"/>"],
  "How Much Would You Pay": ["18 14 84 70", "<path class=\"soft\" d=\"M36 48c-6-8-8-20-2-28\"/><path class=\"tint\" d=\"M42 30h44a6 6 0 0 1 6 6v28a6 6 0 0 1-6 6H42L26 50z\"/><path d=\"M42 30h44a6 6 0 0 1 6 6v28a6 6 0 0 1-6 6H42L26 50z\"/><circle cx=\"38\" cy=\"50\" r=\"3.5\"/><path d=\"M72 43c-1.5-2-4-3-6.5-3-3 0-5.5 1.6-5.5 4.3 0 5.7 12.5 3.2 12.5 9.4 0 2.8-2.7 4.5-6 4.5-2.7 0-5.2-1.2-6.8-3.3M66 36v28\"/>"],
  "The Worst": ["16 14 88 76", "<path class=\"tint\" d=\"M36 56a12 12 0 0 1 2-23.8A17 17 0 0 1 71 28a14 14 0 0 1 13 28z\"/><path d=\"M36 56a12 12 0 0 1 2-23.8A17 17 0 0 1 71 28a14 14 0 0 1 13 28z\"/><path class=\"soft\" d=\"M40 64l-3 8M46 78l-2 5M76 64l-3 8M82 78l-2 5\"/><path class=\"fill\" d=\"M60 58h9l-6 10h6L54 86l4-13h-6z\"/>"],
  "Tiny Vows": ["28 10 64 76", "<circle class=\"tint\" cx=\"60\" cy=\"62\" r=\"20\"/><circle cx=\"60\" cy=\"62\" r=\"20\"/><circle class=\"soft\" cx=\"60\" cy=\"62\" r=\"15\"/><path class=\"tint\" d=\"M50 30l5-8h10l5 8-10 12z\"/><path d=\"M50 30l5-8h10l5 8-10 12zM50 30h20M57 22l3 8 3-8\"/><path class=\"soft\" d=\"M80 22l4-4M84 30h5M40 22l-4-4M36 30h-5\"/>"],
  "Comfort Codes": ["20 16 80 76", "<path class=\"soft\" d=\"M46 36c-3-4 3-6 0-10M56 36c-3-4 3-6 0-10M66 36c-3-4 3-6 0-10\"/><path class=\"tint\" d=\"M34 42h40v26a12 12 0 0 1-12 12H46a12 12 0 0 1-12-12z\"/><path d=\"M34 42h40v26a12 12 0 0 1-12 12H46a12 12 0 0 1-12-12zM74 48h4a8 8 0 0 1 0 16h-4\"/><path class=\"fill\" d=\"M54 68c-.4 0-7-4.2-7-8.6 0-2.3 1.8-4 3.9-4 1.4 0 2.5.8 3.1 1.8.6-1 1.7-1.8 3.1-1.8 2.1 0 3.9 1.7 3.9 4 0 4.4-6.6 8.6-7 8.6z\"/><path class=\"soft\" d=\"M28 88h56\"/>"],
};
function markupArt(viewBox: string, body: string, line: string, tint: string, size: number) {
  const xml = body
    .replace(/class="tint"/g, `fill="${tint}" opacity="0.28" stroke="none"`)
    .replace(/class="fill soft"/g, `fill="${line}" stroke="none" opacity="0.45"`)
    .replace(/class="fill"/g, `fill="${line}" stroke="none"`)
    .replace(/class="soft"/g, 'opacity="0.45"')
    .replace(/<(path|circle|ellipse|rect) /g, '<$1 vector-effect="non-scaling-stroke" ');
  return <SvgXml width={size} height={size} xml={`<svg viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet"><g fill="none" stroke="${line}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${xml}</g></svg>`} />;
}

// dim: the deck isn't picked, so the art fades back like the website's.
// fan: colours for the "All decks" fan, one card per deck the server offers.
export function DeckArt({ deck, size, dim, spent, fan = FAN }: { deck: string; size: number; dim?: boolean; spent?: boolean; fan?: string[] }) {
  const { c1, c2 } = deckColors(deck);
  const line = spent ? '#9c8f9a' : dim ? '#cbb6c6' : c2;
  const tint = spent ? '#b9adb6' : c1;
  const stroke = { fill: 'none', stroke: line, strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, vectorEffect: 'non-scaling-stroke' as const };
  const soft = { ...stroke, opacity: 0.45 };
  const tinted = { fill: tint, opacity: 0.28 };
  if (MARKUP[deck]) return markupArt(MARKUP[deck][0], MARKUP[deck][1], line, tint, size);
  let viewBox = '16 14 88 76';
  let body = null;
  switch (deck) {
    case 'Getting Closer':
      viewBox = '14 12 92 66';
      body = <>
        <Circle cx="48" cy="45" r="25" {...tinted} /><Circle cx="48" cy="45" r="25" {...stroke} /><Circle cx="72" cy="45" r="25" {...stroke} />
        <Path fill={line} d="M60 54c-.5 0-9-5.5-9-11.5 0-3 2.3-5.3 5-5.3 1.8 0 3.2 1 4 2.4.8-1.4 2.2-2.4 4-2.4 2.7 0 5 2.3 5 5.3 0 6-8.5 11.5-9 11.5z" />
      </>;
      break;
    case 'Who You Are':
      viewBox = '24 8 72 72';
      body = <>
        <Path {...stroke} d="M55.2 52.4A5.2 6.1 0 1 1 65.1 51.4M50.7 55.4A10.4 12.3 0 1 1 69.4 55.2M46.4 58.9A15.6 18.4 0 1 1 75.2 54.1M42.4 63A20.8 24.5 0 1 1 78.9 60.4M38.7 67.6A26 30.7 0 1 1 85.3 56.9M35.4 72.7A31.2 36.8 0 1 1 88.3 65.6" />
        <Path {...soft} d="M60 50v8M65 60c0 6-2 10-5 14M55 62c-1 5-4 9-8 12" />
      </>;
      break;
    case 'Us & The Future':
      viewBox = '14 20 92 72';
      body = <>
        <Path {...tinted} d="M42 62a18 18 0 0 1 36 0z" /><Path {...stroke} d="M16 62h88M42 62a18 18 0 0 1 36 0" />
        <Path {...soft} d="M60 36v-8M44 42l-5-5M76 42l5-5" /><Path {...stroke} d="M38 90l19-28M82 90L63 62" /><Path {...soft} d="M60 68v4M60 77v5M60 86v3" />
      </>;
      break;
    case 'Honest & Vulnerable': {
      viewBox = '22 14 76 70';
      const heart = 'M60 78C57 78 29 60 29 38c0-9.5 7.3-17 16.5-17 6.3 0 11.3 3.5 14.5 8.6 3.2-5.1 8.2-8.6 14.5-8.6C83.7 21 91 28.5 91 38c0 22-28 40-31 40z';
      body = <>
        <Path {...tinted} d={heart} /><Path {...stroke} d={heart} />
        <Path {...stroke} stroke={spent || dim ? line : GOLD} strokeWidth={2} d="M60 29.6l-5.5 9.4 8 7.5-7 9 5 8-1.5 14.5" />
      </>;
      break;
    }
    case 'Light & Playful':
      viewBox = '26 8 68 80';
      body = <>
        <Ellipse cx="47" cy="32" rx="13" ry="16" {...tinted} /><Ellipse cx="73" cy="27" rx="13" ry="16" {...tinted} />
        <Ellipse cx="47" cy="32" rx="13" ry="16" {...stroke} /><Ellipse cx="73" cy="27" rx="13" ry="16" {...stroke} />
        <Path {...stroke} d="M44.5 48.5h5l-2.5-3zM70.5 43.5h5l-2.5-3z" /><Path {...stroke} d="M47 48.5c-4 12 16 16 11 33M73 43.5c4 12-18 18-13 38" />
      </>;
      break;
    case 'Desire & Intimacy': {
      viewBox = '24 10 72 80';
      const flame = 'M60 14c8 10 12 17 12 24a12 12 0 0 1-24 0c0-7 4-14 12-24z';
      body = <>
        <Path {...tinted} d={flame} /><Path {...stroke} d={flame} />
        <Path fill={line} d="M60 31c3.5 4.5 5 7.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-5.5 5-10z" /><Path {...stroke} d="M60 50v5" />
        <Rect x="48" y="55" width="24" height="31" rx="2.5" {...stroke} />
        <Path {...soft} d="M48 62c3 0 3 6 6.5 6s3-6 6.5-6M36 34l-5-3M84 34l5-3M34 46h-6M86 46h6" />
      </>;
      break;
    }
    case 'Conflict & Repair':
      viewBox = '12 30 96 56';
      body = <>
        <Path {...tinted} d="M22 66C34 34 86 34 98 66z" /><Path {...stroke} d="M14 66h92M22 66C34 34 86 34 98 66" />
        <Path {...soft} d="M36 66V53M48 66V46M60 66V42.5M72 66V46M84 66V53" /><Path {...stroke} d="M26 66v12M94 66v12" />
        <Path {...soft} d="M16 82h18M48 84h24M86 82h18" />
      </>;
      break;
    case 'Life & Meaning':
      viewBox = '22 10 76 80';
      body = <>
        <Circle cx="60" cy="38" r="23" {...tinted} /><Circle cx="60" cy="38" r="23" {...stroke} /><Path {...stroke} d="M60 50v36M60 68l-9-9M60 62l8-8" />
        <Path {...soft} d="M50 30a10 10 0 0 1 10-7M34 86h52M52 86c3-3 5-3 8-3s5 0 8 3" />
      </>;
      break;
    case 'Guess My Answer': {
      viewBox = '12 20 86 76';
      const ask = 'M23 24h36a7 7 0 0 1 7 7v20a7 7 0 0 1-7 7H40L28 68V58h-5a7 7 0 0 1-7-7V31a7 7 0 0 1 7-7z';
      body = <>
        <Path {...tinted} d={ask} /><Path {...stroke} d={ask} />
        <Path {...stroke} d="M35 35a6 6 0 1 1 8.5 5.5c-1.6.8-2.5 2-2.5 3.8v1.2" /><Circle cx="41" cy="50.5" r="2" fill={line} />
        <Path {...soft} d="M68 62h20a6 6 0 0 1 6 6v10a6 6 0 0 1-6 6h-1v8l-9-8H68a6 6 0 0 1-6-6V68a6 6 0 0 1 6-6z" />
        {[71, 78, 85].map(x => <Circle key={x} cx={x} cy="73" r="1.8" fill={line} />)}
      </>;
      break;
    }
    case 'Would You Rather':
      viewBox = '20 16 80 76';
      body = <>
        <Path {...stroke} d="M60 22v64" />
        <Path {...tinted} d="M60 30h24l8 8-8 8H60z" /><Path {...stroke} d="M60 30h24l8 8-8 8H60z" />
        <Path {...tinted} d="M60 52H36l-8 8 8 8h24z" /><Path {...stroke} d="M60 52H36l-8 8 8 8h24z" /><Path {...soft} d="M44 86h32" />
      </>;
      break;
    case 'Weekly Check-in': {
      viewBox = '22 16 76 72';
      const days = [[42, 51], [51, 51], [60, 51], [69, 51], [78, 51], [42, 63], [51, 63], [60, 63], [78, 63], [42, 75], [51, 75], [60, 75]];
      body = <>
        <Path {...tinted} d="M38 28h44a6 6 0 0 1 6 6v8H32v-8a6 6 0 0 1 6-6z" /><Rect x="32" y="28" width="56" height="54" rx="6" {...stroke} />
        <Path {...stroke} d="M32 42h56M46 22v12M74 22v12" />
        {days.map(([x, y]) => <Circle key={`${x}-${y}`} cx={x} cy={y} r="1.7" fill={line} opacity={0.45} />)}
        <Path fill={line} d="M69 72c-.4 0-8-4.8-8-10 0-2.6 2-4.6 4.4-4.6 1.6 0 2.8.9 3.6 2.1.8-1.2 2-2.1 3.6-2.1 2.4 0 4.4 2 4.4 4.6 0 5.2-7.6 10-8 10z" />
      </>;
      break;
    }
    case 'Dilemmas': {
      viewBox = '20 24 80 60';
      const pans = ['M24 56a11 6 0 0 0 22 0z', 'M74 48a11 6 0 0 0 22 0z'];
      body = <>
        <Path {...stroke} d="M60 36v42M48 78h24M35 40l50-8" /><Circle cx="60" cy="36" r="2.6" fill={line} />
        <Path {...soft} d="M35 40l-8 16M35 40l8 16M85 32l-8 16M85 32l8 16" />
        {pans.map(d => <G key={d}><Path {...tinted} d={d} /><Path {...stroke} d={d} /></G>)}
      </>;
      break;
    }
    case 'Long Distance': {
      viewBox = '22 16 76 66';
      const pins = ['M36 78c-.4 0-9-9-9-15a9 9 0 0 1 18 0c0 6-8.6 15-9 15z', 'M84 58c-.4 0-9-9-9-15a9 9 0 0 1 18 0c0 6-8.6 15-9 15z'];
      body = <>
        <Path {...soft} strokeDasharray="3 5" d="M36 50C40 28 66 20 82 30" />
        {pins.map(d => <G key={d}><Path {...tinted} d={d} /><Path {...stroke} d={d} /></G>)}
        <Circle cx="36" cy="63" r="3" {...stroke} /><Circle cx="84" cy="43" r="3" {...stroke} />
        <Path fill={line} d="M58 31c-.3 0-5.5-3.3-5.5-6.8 0-1.8 1.4-3.2 3-3.2 1.1 0 1.9.6 2.5 1.5.6-.9 1.4-1.5 2.5-1.5 1.6 0 3 1.4 3 3.2 0 3.5-5.2 6.8-5.5 6.8z" />
      </>;
      break;
    }
    case 'Midnight Questions': {
      viewBox = '20 14 80 72';
      const moon = 'M62 22a26 26 0 1 0 22 40a22 22 0 0 1-22-40z';
      body = <>
        <Path {...tinted} d={moon} /><Path {...stroke} d={moon} />
        <Path fill={line} d="M80 20l1.8 5.2 5.2 1.8-5.2 1.8L80 34l-1.8-5.2-5.2-1.8 5.2-1.8z" />
        <Path fill={line} opacity={0.45} d="M92 42l1.2 3.3 3.3 1.2-3.3 1.2L92 51l-1.2-3.3-3.3-1.2 3.3-1.2z" />
        <Circle cx="74" cy="46" r="1.6" fill={line} opacity={0.45} /><Path {...soft} d="M30 82h60" />
      </>;
      break;
    }
    case 'Money & Work': {
      viewBox = '14 22 94 68';
      const bag = 'M26 44h40a5 5 0 0 1 5 5v26a5 5 0 0 1-5 5H26a5 5 0 0 1-5-5V49a5 5 0 0 1 5-5z';
      body = <>
        <Path {...tinted} d={bag} /><Path {...stroke} d={bag} />
        <Path {...stroke} d="M38 44v-6a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v6M21 58h50" /><Rect x="42" y="54.5" width="8" height="7" rx="1.5" fill={line} />
        <Path {...tinted} d="M78 56v21c0 2.2 5 4 11 4s11-1.8 11-4V56z" /><Ellipse cx="89" cy="56" rx="11" ry="4" {...stroke} />
        <Path {...stroke} d="M78 56v21c0 2.2 5 4 11 4s11-1.8 11-4V56M78 63c0 2.2 5 4 11 4s11-1.8 11-4M78 70c0 2.2 5 4 11 4s11-1.8 11-4" />
        <Path {...soft} d="M18 86h86" />
      </>;
      break;
    }
    default: // All decks: a fan with one card per deck colour
      body = <>
        {fan.map((c, i) => (
          <G key={c + i} transform={`translate(60 84) rotate(${(i - (fan.length - 1) / 2) * (fan.length > 11 ? Math.min(7, 98 / (fan.length - 1)) : fan.length > 8 ? 8 : fan.length > 5 ? 10 : 16)})`}>
            <Rect x="-12" y="-56" width="24" height="34" rx="3" fill={spent ? '#b9adb6' : c} opacity={dim ? 0.5 : 1} stroke="#fffaf4" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
          </G>
        ))}
      </>;
  }
  return <Svg width={size} height={size} viewBox={viewBox} preserveAspectRatio="xMidYMid meet">{body}</Svg>;
}
