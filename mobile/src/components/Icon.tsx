import Svg, { Circle, Path, Rect } from 'react-native-svg';

// The website's icon set, drawn natively.
const shapes = {
  heart: <Path d="M12 20.3c-.3 0-.6-.1-.8-.3C6.4 15.8 3 12.8 3 8.9 3 6.2 5.1 4 7.7 4c1.8 0 3.3 1 4.3 2.4C13 5 14.5 4 16.3 4 18.9 4 21 6.2 21 8.9c0 3.9-3.4 6.9-8.2 11.1-.2.2-.5.3-.8.3z" />,
  left: <Path d="M19 12H5m6-6-6 6 6 6" />,
  right: <Path d="M5 12h14m-6-6 6 6-6 6" />,
  share: <Path d="M12 15V3m-4 4 4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />,
  sync: <Path d="M20 11a8 8 0 0 0-14.7-4.3L4 8m0-4v4h4M4 13a8 8 0 0 0 14.7 4.3L20 16m0 4v-4h-4" />,
  chat: <Path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
  cards: <><Rect x="7" y="3" width="13" height="17" rx="2.5" /><Path d="M4.5 7.5v10A3.5 3.5 0 0 0 8 21h8" /></>,
  check: <Path d="m5 12.5 4.5 4.5L19 7.5" />,
  user: <><Circle cx="12" cy="8" r="4" /><Path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></>,
  sun: <Path d="M3 18.5h18M6.5 18.5a5.5 5.5 0 0 1 11 0M12 5v3M5.3 9.8l2 2M18.7 9.8l-2 2" />,
  spark: <Path d="M12 3.5c.6 4.4 2.9 6.9 8.5 8.5-5.6 1.6-7.9 4.1-8.5 8.5-.6-4.4-2.9-6.9-8.5-8.5 5.6-1.6 7.9-4.1 8.5-8.5z" />,
  lock: <><Rect x="5" y="11" width="14" height="10" rx="2" /><Path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  close: <Path d="M6 6l12 12M18 6 6 18" />,
  logout: <Path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" />,
};

export type IconName = keyof typeof shapes;

export function Icon({ name, size = 20, color = '#fff', fill = false, strokeWidth = 1.8 }:
  { name: IconName; size?: number; color?: string; fill?: boolean; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? color : 'none'} stroke={color}
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {shapes[name]}
    </Svg>
  );
}
