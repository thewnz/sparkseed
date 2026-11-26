const flat = value => String(value ?? '').replace(/\s+/g, ' ').trim();

export function locateQuote(text, { quote, prefix = '', suffix = '' } = {}) {
  const source = typeof text === 'string' ? text : '';
  const needle = flat(quote);
  if (!needle) return null;
  const exact = source.indexOf(quote.trim());
  if (exact >= 0) return { start: exact, end: exact + quote.trim().length };
  const normalized = flat(source);
  const target = flat(quote);
  let at = normalized.indexOf(target);
  if (at < 0) {
    const before = flat(prefix).slice(-30);
    const after = flat(suffix).slice(0, 30);
    if (before) {
      const found = normalized.indexOf(before);
      if (found >= 0) at = found + before.length;
    }
    if (at < 0 && after) {
      const found = normalized.indexOf(after);
      if (found >= 0) at = Math.max(0, found - target.length);
    }
  }
  return at >= 0 ? { start: at, end: at + target.length } : null;
}
