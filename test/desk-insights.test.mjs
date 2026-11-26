import assert from 'node:assert/strict';
import { test } from 'node:test';
import { glossaryInstructions, normalizeGlossary, normalizePlain, normalizeQuiz, plainInstructions, quizInstructions } from '../desktop/desk-insights.mjs';

const texts = { 1: 'We study small sample estimation. The estimator is consistent.', 2: 'Stratified sampling reduces variance.' };

test('白话解释只保留能在原文定位的引用', () => {
  const plain = normalizePlain({ summary: '本文研究小样本估计。', unsupported: false,
    citations: [{ page: 1, quote: 'small sample estimation' }, { page: 1, quote: 'not in page' }] }, texts);
  assert.equal(plain.summary, '本文研究小样本估计。');
  assert.equal(plain.citations.length, 1);
  assert.equal(plain.citations[0].quote, 'small sample estimation');
  assert.equal(plain.supported, true);
  const weak = normalizePlain({ summary: '原文未提及。', unsupported: true, citations: [] }, texts);
  assert.equal(weak.supported, false);
  assert.throws(() => normalizePlain({ summary: '' }, texts), /白话解释/);
});

test('术语解释必须给出可核对的原句', () => {
  const good = normalizeGlossary({ term: '估计量', definition: '用来推断总体参数的统计量。',
    quote: 'The estimator is consistent.', page: 1 }, { text: texts[1] });
  assert.equal(good.quote, 'The estimator is consistent.');
  const bad = normalizeGlossary({ term: '估计量', definition: '统计量。', quote: '编造的原句', page: 1 },
    { text: texts[1] });
  assert.equal(bad.quote, '');
  assert.throws(() => normalizeGlossary({ term: '', definition: '' }), /术语解释/);
});

test('自测题过滤无依据卡片，全部无依据时明确失败', () => {
  const cards = normalizeQuiz({ cards: [
    { question: '估计量有什么性质？', answer: '一致。', sourcePage: 1, sourceQuote: 'The estimator is consistent.' },
    { question: '编造题', answer: '编造', sourcePage: 1, sourceQuote: 'not in page' },
  ] }, texts);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].sourcePage, 1);
  assert.throws(() => normalizeQuiz({ cards: [
    { question: '题', answer: '答', sourcePage: 2, sourceQuote: '不存在' },
  ] }, texts), /依据/);
});

test('生成提示词要求逐字引用与原文未提及', () => {
  assert.match(plainInstructions(), /原文未提及/);
  assert.match(plainInstructions(), /citations/);
  assert.match(glossaryInstructions(), /JSON/);
  assert.match(quizInstructions(), /逐字/);
});
