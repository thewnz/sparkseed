import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeVisionReview, reviewFixHint, visionReviewInstructions } from '../desktop/figure-review.mjs';

test('视觉复核结果规范化并生成修订提示', () => {
  const review = normalizeVisionReview({ valid: false, issues: ['箭头指向错误', '  '], fixes: ['把结果验证的箭头指回模型训练'] });
  assert.equal(review.valid, false);
  assert.deepEqual(review.issues, ['箭头指向错误']);
  assert.match(reviewFixHint(review), /箭头指回模型训练/);
  assert.equal(normalizeVisionReview({ valid: true, issues: [] }).valid, true);
});

test('视觉复核拒绝无法使用的返回', () => {
  assert.equal(normalizeVisionReview(null), null);
  assert.equal(normalizeVisionReview([]), null);
  assert.equal(normalizeVisionReview({ valid: false, issues: [] }), null);
  assert.match(visionReviewInstructions, /只返回 JSON/);
});
