import assert from 'node:assert/strict';
import test from 'node:test';
import { auditBlockSvg, repairAuditText } from '../desktop/flow-completeness.mjs';

const text = (x, y, value) => `<text x="${x}" y="${y}" font-size="12">${value}</text>`;
const rect = (x, y, w, h, fill = '#f1f6fa', stroke = '#2f5f8f') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;

test('块完整度检查拒绝只有三个框和箭头的空骨架', () => {
  const sparse = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="320" viewBox="0 0 420 320">
    ${rect(30, 40, 90, 50)}${rect(170, 40, 90, 50)}${rect(310, 40, 80, 50)}
    <line x1="120" y1="65" x2="168" y2="65"/><line x1="260" y1="65" x2="308" y2="65"/>
    ${text(40, 70, 'Input')}${text(185, 70, 'Model')}${text(325, 70, 'Output')}
  </svg>`;
  const report = auditBlockSvg(sparse);
  assert.equal(report.ok, false);
  assert.equal(report.level, 'empty');
  assert.match(report.issues.join(''), /有效图元/);
  assert.match(repairAuditText(report), /空骨架/);
});

test('块完整度检查接受含数据图元、注释和图例的方法块', () => {
  const cells = Array.from({ length: 12 }, (_, i) =>
    rect(24 + (i % 6) * 30, 80 + Math.floor(i / 6) * 28, 24, 22, i % 3 ? '#ffffff' : '#e8f0f7')).join('');
  const rich = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="340" viewBox="0 0 480 340">
    <rect x="8" y="8" width="440" height="48" fill="#f1f6fa"/>
    ${cells}
    <path d="M220 110 C250 70 300 150 340 92 C380 45 410 110 450 80" fill="none" stroke="#a45f32" stroke-width="1.1"/>
    <line x1="230" y1="200" x2="450" y2="200" stroke="#c6cbd0"/>
    <rect x="232" y="220" width="46" height="34" fill="#ffffff" stroke="#4c7358"/>
    <circle cx="286" cy="237" r="9" fill="#eaf1ec" stroke="#4c7358"/>
    <polyline points="320,250 340,225 360,238 382,212 404,226" fill="none" stroke="#4c7358"/>
    ${[['Raw spectra', 24, 40], ['Baseline', 120, 40], ['Corrected', 230, 40], ['PCA scores', 24, 180],
      ['Loading P', 120, 180], ['Component 1', 232, 278], ['Component 2', 320, 278], ['RMSE 0.12', 400, 278]]
      .map(([value, x, y]) => text(x, y, value)).join('')}
  </svg>`;
  const report = auditBlockSvg(rich);
  assert.equal(report.ok, true);
  assert.ok(report.textCount >= 7);
  assert.ok(report.vectorCount >= 10);
  assert.ok(report.coverage >= 0.46);
});
