export const readerLayoutLimits = {
  left: { min: 150, max: 380, initial: 215 },
  right: { min: 250, max: 520, initial: 310 },
};

const clamp = (value, { min, max, initial }) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : initial;

export function normalizeReaderLayout(value) {
  return {
    left: clamp(value?.left, readerLayoutLimits.left),
    right: clamp(value?.right, readerLayoutLimits.right),
    leftOpen: value?.leftOpen !== false,
    rightOpen: value?.rightOpen !== false,
  };
}
