import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

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
};
export const deckColors = (name: string) => DECK_COLORS[name] || DECK_COLORS['Getting Closer'];

const FAN = Object.entries(DECK_COLORS).filter(([k]) => k !== 'All').map(([, v]) => v.c1);
const GOLD = '#c8912a';

// dim: the deck isn't picked, so the art fades back like the website's.
// fan: colours for the "All decks" fan, one card per deck the server offers.
export function DeckArt({ deck, size, dim, spent, fan = FAN }: { deck: string; size: number; dim?: boolean; spent?: boolean; fan?: string[] }) {
  const { c1, c2 } = deckColors(deck);
  const line = spent ? '#9c8f9a' : dim ? '#cbb6c6' : c2;
  const tint = spent ? '#b9adb6' : c1;
  const stroke = { fill: 'none', stroke: line, strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, vectorEffect: 'non-scaling-stroke' as const };
  const soft = { ...stroke, opacity: 0.45 };
  const tinted = { fill: tint, opacity: 0.28 };
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
    default: // All decks: a fan with one card per deck colour
      body = <>
        {fan.map((c, i) => (
          <G key={c + i} transform={`translate(60 84) rotate(${(i - (fan.length - 1) / 2) * Math.min(16, 70 / Math.max(1, fan.length - 1))})`}>
            <Rect x="-12" y="-56" width="24" height="34" rx="3" fill={spent ? '#b9adb6' : c} opacity={dim ? 0.5 : 1} stroke="#fffaf4" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
          </G>
        ))}
      </>;
  }
  return <Svg width={size} height={size} viewBox={viewBox} preserveAspectRatio="xMidYMid meet">{body}</Svg>;
}
