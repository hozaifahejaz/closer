import { StyleSheet, useWindowDimensions } from 'react-native';

// The app is drawn for a phone about 390 by 780. On anything bigger (big phones, foldables,
// tablets, either way up) every size grows by the same factor, so a tablet shows a bigger card,
// bigger type and bigger buttons instead of a phone layout with empty margins.
export function scaleFor(width: number, height: number) {
  const short = Math.min(width, height), long = Math.max(width, height);
  const k = Math.min(short / 390, long / 780);
  return Math.round(Math.max(1, Math.min(1.8, k)) * 20) / 20; // steps of 0.05
}
export function useK() {
  const { width, height } = useWindowDimensions();
  return scaleFor(width, height);
}

// Style values that are lengths, and so grow with the screen. Flex factors, opacity, border
// widths and the like are left alone.
const LENGTHS = new Set(['fontSize', 'lineHeight', 'letterSpacing', 'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  'padding', 'paddingHorizontal', 'paddingVertical', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
  'margin', 'marginHorizontal', 'marginVertical', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'gap', 'rowGap', 'columnGap', 'top', 'bottom', 'left', 'right', 'borderRadius', 'shadowRadius']);

type Styles = Record<string, Record<string, unknown>>;
export const sheet = <T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(styles: T) => styles;

const made = new WeakMap<object, Map<number, unknown>>();
// A screen's styles at this screen's scale. Each sheet is built once per scale and reused.
export function useScaled<T extends object>(base: T): T {
  const k = useK();
  let byScale = made.get(base);
  if (!byScale) made.set(base, byScale = new Map());
  let st = byScale.get(k) as T | undefined;
  if (!st) {
    const out: Styles = {};
    for (const [name, style] of Object.entries(base as Styles)) {
      out[name] = {};
      for (const [key, value] of Object.entries(style)) out[name][key] = k !== 1 && typeof value === 'number' && LENGTHS.has(key) ? value * k : value;
    }
    byScale.set(k, st = StyleSheet.create(out as any) as T);
  }
  return st;
}
