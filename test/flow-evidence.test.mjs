import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeCompositeFlow } from '../desktop/composite-flow.mjs';
import { applyFlowEvidence, requireFlowStageEvidence, verifyFlowEvidence } from '../desktop/flow-evidence.mjs';

test('出图前要求每个阶段至少有一个已核验节点，同名阶段按索引区分', () => {
  const plan = [{ title: 'Calibration' }, { title: 'Calibration' }];
  const first = { key: '0:0:0', verified: true };
  const second = { key: '1:0:0', verified: false };
  assert.throws(() => requireFlowStageEvidence(plan, { nodes: [first, second] }), /缺少可定位的论文依据：Calibration/);
  assert.doesNotThrow(() => requireFlowStageEvidence(plan, { nodes: [first, { ...second, verified: true }] }));
});

test('流程节点逐条核对论文、位置和连续原文，保留未获证据的项目步骤', () => {
  const quote = 'We ranked candidate wavelengths using stability across bootstrap samples.';
  const literature = { papers: [{ id: 'paper:1', title: 'Spectral methods', url: 'https://example.org/paper',
    abstract: 'A study of wavelength selection with multiple methods.',
    pages: [{ page: 3, text: `The method follows this order. ${quote} Additional details.` }],
    sections: [{ section: 'Methods [2]', text: 'Bootstrap sampling identified reliable wavelengths in the input spectra.' }] }] };
  const nodes = [{ label: '稳定性排序', evidence: [{ id: 'paper:1', page: 3, quote }] },
    { label: '项目特有实验', evidence: [] },
    { label: '错误引用', evidence: [{ id: 'paper:1', page: 2, quote }] },
    { label: '章节引用', evidence: [{ id: 'paper:1', page: null, section: 'Methods [2]',
      quote: 'Bootstrap sampling identified reliable wavelengths' }] }];
  const stage = { title: '方法', columns: [[nodes[0], nodes[1]], [nodes[2], nodes[3]]], links: [] };
  const plan = normalizeCompositeFlow({ stages: [stage, { ...stage, title: '结果', columns: [[{ label: '汇总' }]] }] });
  const report = verifyFlowEvidence(plan, literature);
  assert.equal(report.total, 5);
  assert.equal(report.verified, 2);
  assert.equal(report.rejected, 1);
  assert.equal(report.nodes[0].citations[0].location, '第 3 页');
  assert.equal(report.nodes[1].verified, false);
  assert.equal(report.nodes[2].citations[0].reason, '指定页码或章节未读取');
  assert.equal(report.nodes[3].citations[0].location, 'Methods [2]');
  assert.deepEqual(normalizeCompositeFlow({ stages: plan }), plan);
  const enriched = normalizeCompositeFlow({ stages: applyFlowEvidence(plan, { bindings: [
    { key: '1:0:0', evidence: [{ id: 'paper:1', page: null,
      quote: 'A study of wavelength selection with multiple methods.' }] },
  ] }) });
  assert.equal(verifyFlowEvidence(enriched, literature).verified, 3);
});
