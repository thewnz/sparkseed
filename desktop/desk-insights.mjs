import { locateQuote } from './annotation-anchor.mjs';

const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';

export function plainInstructions() {
  return [
    '把当前页的论文原文改写成清晰的中文白话解释，保留关键术语、数字与结论。',
    '不要引入原文没有的信息。每一条解释必须能在原文中找到依据。',
    '如果原文不足以支持某个概括，直接写“原文未提及”，不要补全。',
    '仅返回合法 JSON，格式为 {"summary":"白话解释","citations":[{"page":1,"quote":"原文短句"}],"unsupported":false}。',
    'citations 必须逐字摘自原文，最多 4 条；无法摘录时返回空数组并把 unsupported 设为 true。',
  ].join('\n');
}

export function glossaryInstructions() {
  return [
    '解释给定术语在本文语境中的含义。用两到四句中文，先给一句话定义，再说明它在本文中的作用。',
    '必须引用原文中的一两句作为依据；不要引入外部知识。',
    '仅返回合法 JSON，格式为 {"term":"术语","definition":"释义","quote":"原文依据","page":1}。',
  ].join('\n');
}

export function quizInstructions() {
  return [
    '根据论文原文生成 4 到 6 张自测卡片，覆盖核心问题、方法、关键结论与适用条件。',
    '问题要能脱离原文回答，答案简洁但完整；不要考原句背诵。',
    '每张卡片必须附一条逐字摘自原文的依据与页码；找不到依据就不要生成。',
    '仅返回合法 JSON，格式为 {"cards":[{"question":"问题","answer":"答案","sourcePage":1,"sourceQuote":"原文依据"}]}。',
  ].join('\n');
}

function verified(citations, texts) {
  return (Array.isArray(citations) ? citations : []).flatMap(item => {
    const page = Number(item?.page);
    const quote = clean(item?.quote, 600);
    if (!Number.isInteger(page) || page < 1 || !quote) return [];
    const found = locateQuote(texts[page] || '', { quote });
    return found ? [{ page, quote }] : [];
  }).slice(0, 6);
}

export function normalizePlain(value, texts) {
  const summary = clean(value?.summary, 6000);
  if (!summary) throw new Error('Agent 没有返回可用的白话解释。');
  const citations = verified(value?.citations, texts);
  return { summary, citations, supported: !value?.unsupported && citations.length > 0 };
}

export function normalizeGlossary(value, fallback = {}) {
  const term = clean(value?.term, 120) || clean(fallback.term, 120);
  const definition = clean(value?.definition, 1600);
  if (!term || !definition) throw new Error('Agent 没有返回可用的术语解释。');
  const page = Number(value?.page) >= 1 ? Math.round(Number(value.page)) : Number(fallback.page) || 1;
  const quote = clean(value?.quote, 600);
  const found = quote && locateQuote(fallback.text || '', { quote });
  return { term, definition, page, quote: found ? quote : '' };
}

export function normalizeQuiz(value, texts) {
  const cards = (Array.isArray(value?.cards) ? value.cards : []).flatMap(item => {
    const question = clean(item?.question, 500);
    const answer = clean(item?.answer, 1200);
    const page = Number(item?.sourcePage);
    const quote = clean(item?.sourceQuote, 600);
    if (!question || !answer || !Number.isInteger(page) || page < 1 || !quote) return [];
    if (!locateQuote(texts[page] || '', { quote })) return [];
    return [{ question, answer, sourcePage: page, sourceQuote: quote }];
  }).slice(0, 6);
  if (!cards.length) throw new Error('原文中没有找到足够的依据，暂时无法生成自测题。');
  return cards;
}
