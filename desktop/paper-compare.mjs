import { normalizeText } from './paper-search.mjs';

export const COMPARE_ROWS = ['研究问题', '方法', '数据与场景', '主要结论', '局限与争议'];

export function comparisonInstructions() {
  return [
    '你是研究阅读助手。请比较给定的 2 到 4 篇论文，输出严格 JSON。',
    '只依据提供的标题、摘要、速读记录和论文笔记；不确定的内容写“摘要未说明”，不要编造实验数字或引用。',
    '输出格式：{"rows":[{"label":"研究问题","values":["第一篇的答案","第二篇的答案"]}]}。',
    'rows 依次为：研究问题、方法、数据与场景、主要结论、局限与争议。',
    '每个 values 数组长度必须与论文数量一致，顺序与输入一致；每格控制在 120 字以内，使用中文。',
    '如果两篇论文在某一行无法比较，就在对应格写“不可比”并简短说明原因。',
  ].join('\n');
}

const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';

export function normalizeComparison(value, count) {
  const length = Number.isInteger(count) && count > 0 ? count : 0;
  if (!length) return [];
  const input = Array.isArray(value?.rows) ? value.rows : Array.isArray(value) ? value : [];
  const rows = [];
  const seen = new Set();
  for (const row of input.slice(0, 12)) {
    const label = clean(row?.label, 40);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    const values = Array.isArray(row?.values) ? row.values : [];
    rows.push({ label, values: Array.from({ length }, (_, index) => clean(values[index], 600)) });
  }
  for (const label of COMPARE_ROWS) {
    if (!rows.some(row => row.label === label)) rows.push({ label, values: Array(length).fill('') });
  }
  return rows.slice(0, 8);
}

export function comparisonCacheKey(ids = []) {
  return [...new Set(ids.filter(id => typeof id === 'string' && id))].sort().join('|').slice(0, 400);
}

export function metadataRows(papers = []) {
  const rows = [
    ['年份', paper => paper.year ? String(paper.year) : '—'],
    ['出处', paper => paper.venue || '—'],
    ['作者', paper => paper.author ? clean(paper.author, 80) : '—'],
    ['你的评分', paper => paper.rating ? '★'.repeat(paper.rating) : '未评分'],
    ['阅读状态', paper => ({ unread: '未读', reading: '在读', done: '已读' })[paper.read_status] || '未读'],
    ['被引次数', paper => Number.isFinite(paper.citationCount) ? String(paper.citationCount) : '—'],
  ];
  return rows.map(([label, map]) => ({ label, values: papers.map(map) }));
}

export function comparisonPayload(papers = []) {
  return papers.map(paper => ({
    title: paper.title,
    year: paper.year || null,
    venue: paper.venue || '',
    abstract: normalizeText(paper.abstract).slice(0, 1800),
    triage: paper.triage ? {
      type: paper.triage.type, context: paper.triage.context,
      correctness: paper.triage.correctness, contributions: paper.triage.contributions,
      clarity: paper.triage.clarity,
    } : null,
    note: normalizeText(paper.note).slice(0, 1200),
  }));
}
