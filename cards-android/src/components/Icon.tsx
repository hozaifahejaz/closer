import Svg, { Path, Rect } from 'react-native-svg';

// The Closer icon set, drawn natively.
const shapes = {
  menu: <Path d="M4 6h16M4 12h16M4 18h16" />,
  heart: <Path d="M12 20.3c-.3 0-.6-.1-.8-.3C6.4 15.8 3 12.8 3 8.9 3 6.2 5.1 4 7.7 4c1.8 0 3.3 1 4.3 2.4C13 5 14.5 4 16.3 4 18.9 4 21 6.2 21 8.9c0 3.9-3.4 6.9-8.2 11.1-.2.2-.5.3-.8.3z" />,
  left: <Path d="M19 12H5m6-6-6 6 6 6" />,
  right: <Path d="M5 12h14m-6-6 6 6-6 6" />,
  share: <Path d="M12 15V3m-4 4 4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />,
  cards: <><Rect x="7" y="3" width="13" height="17" rx="2.5" /><Path d="M4.5 7.5v10A3.5 3.5 0 0 0 8 21h8" /></>,
  check: <Path d="m5 12.5 4.5 4.5L19 7.5" />,
  spark: <Path d="M12 3.5c.6 4.4 2.9 6.9 8.5 8.5-5.6 1.6-7.9 4.1-8.5 8.5-.6-4.4-2.9-6.9-8.5-8.5 5.6-1.6 7.9-4.1 8.5-8.5z" />,
  close: <Path d="M6 6l12 12M18 6 6 18" />,
  shuffle: <Path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />,
  trash: <Path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
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
