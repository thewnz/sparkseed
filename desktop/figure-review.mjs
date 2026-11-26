// 视觉复核：把渲染图交给具备视觉能力的连接，返回可执行的修订清单。

export const visionReviewInstructions = [
  '你是顶会/顶刊插图的视觉审稿人（Vision Critic）。审阅渲染后的成图，评估科学含义、构图平衡与出版级视觉质量，只针对可修复的问题给出具体意见。',
  '重点检查：文字重叠或压线、标签裁切、字号过小、箭头指向或归属错误、节点遗漏或多余、视觉层次与留白失衡、配色对比与灰度可读性、元素对齐与图例完整性。',
  '不要评价作者的研究结论，不要臆造数据、数值或显著性。',
  '只返回 JSON：{"valid":true,"score":9,"issues":[],"fixes":[]} 或 {"valid":false,"score":6,"issues":["问题"],"fixes":["具体修改要求"]}。score 为 0-10 整数；issues 最多 6 条，每条不超过 80 字；fixes 与 issues 一一对应，给出可直接执行的坐标、字号、配色或布局调整指令。',
].join('\n');

export function normalizeVisionReview(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const list = (items, limit) => (Array.isArray(items) ? items : [])
    .filter(item => typeof item === 'string' && item.trim())
    .map(item => item.trim().slice(0, limit))
    .slice(0, 6);
  const issues = list(value.issues, 120);
  const fixes = list(value.fixes, 160);
  if (value.valid !== true && !issues.length) return null;
  const score = Number.isFinite(Number(value.score)) ? Math.max(0, Math.min(10, Math.round(Number(value.score)))) : undefined;
  return {
    valid: value.valid === true && issues.length === 0,
    ...(score !== undefined ? { score } : {}),
    issues,
    fixes,
  };
}

export function reviewFixHint(review) {
  if (!review || review.valid) return '';
  const fixes = review.fixes.length ? review.fixes : review.issues;
  return fixes.length ? '上一稿存在以下问题，请在保留既有正确内容的前提下修正：' + fixes.join('；') + '。' : '';
}
