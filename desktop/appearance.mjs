export const palettes = {
  light: { canvas: '#fdfdfe', symbols: '#50515c' },
  paper: { canvas: '#f9f5ed', symbols: '#5d5043' },
  graphite: { canvas: '#1d1d22', symbols: '#bfc0cc' },
  black: { canvas: '#111113', symbols: '#c8c8cf' },
};

export const accents = ['iris', 'blue', 'jade', 'amber'];
export const defaultTypeface = 'serif';
export const typefaces = [defaultTypeface, 'studio', 'system'];
export const fontSizes = [13, 14, 15, 16, 17, 18];
export const defaultOpenings = ['有时候灵光一闪而过，牛顿也吃苹果', '星星之火可以燎原', '我的念头不太啰嗦', '无需多言'];

export function normalizeAppearance(value) {
  return {
    mode: Object.hasOwn(palettes, value?.mode) ? value.mode : 'system',
    light: value?.light === 'paper' ? 'paper' : 'light',
    dark: value?.dark === 'black' ? 'black' : 'graphite',
    accent: accents.includes(value?.accent) ? value.accent : 'iris',
    typeface: typefaces.includes(value?.typeface) ? value.typeface : defaultTypeface,
    fontSize: fontSizes.includes(value?.fontSize) ? value.fontSize : 14,
    bold: value?.bold === true,
    openings: Array.isArray(value?.openings)
      ? [...new Set(value.openings.filter(item => typeof item === 'string').map(item => item.trim().slice(0, 90)).filter(Boolean))].slice(0, 20)
      : defaultOpenings,
  };
}

export function resolveAppearance(value, systemDark) {
  const choice = normalizeAppearance(value);
  return { ...choice, palette: choice.mode === 'system' ? choice[systemDark ? 'dark' : 'light'] : choice.mode };
}
