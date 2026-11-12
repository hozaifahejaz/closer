// Colours and type from the website (public/index.html), so the apps feel like the same product.
export const colors = {
  bg: '#1d1420',
  bg2: '#2a1c2e',
  bg3: '#1a111c',
  raise: '#3a2640',
  card: '#fbf3ea',
  cardGlow: '#fff9f2',
  ink: '#2b1d2e',
  ink2: '#8f7a8d',
  muted: '#a893a9',
  faint: '#7d6a7e',
  text: '#f4e9ef',
  soft: '#d9c8d5',
  accent: '#e8766f',
  accent2: '#f3b27a',
  rose: '#b8527a',
  plum: '#6d3a78',
  line: '#3d2b41',
  line2: '#553d5a',
  ok: '#7fd6a0',
  bad: '#ff9a8f',
  onPrimary: '#2b1320',
};

// The card back and the heart badge.
export const cardGradient = [colors.accent, colors.rose, colors.plum] as const;
// Primary buttons and switched-on switches.
export const buttonGradient = [colors.accent, colors.accent2] as const;

export const fonts = {
  serif: 'Fraunces_500Medium',
  serifBold: 'Fraunces_600SemiBold',
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansBold: 'Inter_600SemiBold',
};

export const radius = { card: 24, panel: 22, box: 18, control: 14, small: 10 };
