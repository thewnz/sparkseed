export function researchNotification(result) {
  const cards = result?.cards || [];
  if (cards.some(card => card.impact === 'high' && card.kind === '高度相似')) {
    return { title: 'Sparkseed · 发现高度相似的工作', body: '已找到有原文引文支持的相似工作，查看它与当前想法的差异。' };
  }
  if (cards.some(card => card.impact === 'high' && (card.page != null || card.section) && ['反例', '适用条件'].includes(card.kind))) {
    return { title: 'Sparkseed · 发现可能改变判断的证据', body: '已找到可定位的反例或重要适用条件，请查看查证结果。' };
  }
  return null;
}
