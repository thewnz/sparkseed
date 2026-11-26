import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { renderAssembly } from '../desktop/flow-assembly.mjs';

const root = join(import.meta.dirname, '..');
const outDir = join(root, 'artifacts', 'style-benchmark');
mkdirSync(outDir, { recursive: true });
const ink = '#1f2328', muted = '#4f555b', line = '#c6cbd0';
const blue = '#2f5f8f', ochre = '#a45f32', green = '#4c7358';

const wrap = inner => `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="280" viewBox="0 0 320 280" font-family="Arial, Helvetica, sans-serif" fill="${ink}"><rect width="320" height="280" fill="#ffffff"/>${inner}</svg>`;
const heat = (x, y, cols, rows, cell, hue) => Array.from({ length: rows }, (_, r) =>
  Array.from({ length: cols }, (_, c) => {
    const v = ((r * 7 + c * 5) % 11) / 10;
    const fill = hue === 'blue' ? `rgba(47,95,143,${0.15 + v * 0.65})` : `rgba(164,95,50,${0.14 + v * 0.62})`;
    return `<rect x="${x + c * cell}" y="${y + r * cell}" width="${cell - 1}" height="${cell - 1}" fill="${fill}"/>`;
  }).join('')).join('');

const blockInput = wrap(`
  <text x="10" y="18" font-size="11" font-weight="600">Cohort and input tensor</text>
  <text x="10" y="36" font-size="9" fill="${muted}">n = 1,284 · 5 folds</text>
  ${heat(12, 48, 10, 9, 13, 'blue')}
  <text x="12" y="182" font-size="8" fill="${muted}">methylation β</text>
  <line x1="152" y1="104" x2="176" y2="104" stroke="${muted}" stroke-width="1.1" marker-end="url(#ar-arrow)"/>
  <defs><marker id="ar-arrow" markerWidth="5" markerHeight="5" refX="4.5" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 Z" fill="${muted}"/></marker></defs>
  <rect x="182" y="76" width="58" height="52" fill="#e8f0f7" stroke="${blue}" stroke-width="0.9"/>
  <text x="211" y="96" text-anchor="middle" font-size="9">QC +</text>
  <text x="211" y="109" text-anchor="middle" font-size="9">normalize</text>
  <line x1="242" y1="102" x2="264" y2="102" stroke="${muted}" stroke-width="1.1" marker-end="url(#ar-arrow)"/>
  <rect x="270" y="80" width="38" height="44" fill="none" stroke="${line}"/>
  <text x="289" y="99" text-anchor="middle" font-size="8">z-score</text>
  <text x="289" y="112" text-anchor="middle" font-size="8">matrix</text>
  <text x="12" y="212" font-size="9" fill="${muted}">clinical table</text>
  <rect x="12" y="220" width="128" height="42" fill="none" stroke="${line}"/>
  ${[0, 1, 2, 3].map(i => `<line x1="12" y1="${230 + i * 10}" x2="140" y2="${230 + i * 10}" stroke="${line}" stroke-width="0.5"/>`).join('')}
  ${[0, 1, 2, 3, 4].map(i => `<line x1="${24 + i * 26}" y1="220" x2="${24 + i * 26}" y2="262" stroke="${line}" stroke-width="0.5"/>`).join('')}
`);

const blockEncoder = wrap(`
  <text x="10" y="18" font-size="11" font-weight="600">Dual-branch encoder</text>
  <rect x="10" y="38" width="72" height="52" fill="#f3f6f9" stroke="${line}"/>
  <text x="46" y="59" text-anchor="middle" font-size="9"> omics </text>
  <text x="46" y="73" text-anchor="middle" font-size="9">MLP</text>
  <path d="M82 64 L104 64" stroke="${muted}" stroke-width="1.1" marker-end="url(#en-arrow)"/>
  <defs><marker id="en-arrow" markerWidth="5" markerHeight="5" refX="4.5" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 Z" fill="${muted}"/></marker></defs>
  <rect x="108" y="38" width="72" height="52" fill="#e8f0f7" stroke="${blue}" stroke-width="0.9"/>
  <text x="144" y="59" text-anchor="middle" font-size="9">attention</text>
  <text x="144" y="73" text-anchor="middle" font-size="9">block × 4</text>
  <path d="M180 64 L202 64" stroke="${muted}" stroke-width="1.1" marker-end="url(#en-arrow)"/>
  <rect x="206" y="38" width="50" height="52" fill="none" stroke="${line}"/>
  <text x="231" y="59" text-anchor="middle" font-size="9">latent</text>
  <text x="231" y="72" text-anchor="middle" font-size="9">256-d</text>
  <rect x="10" y="104" width="72" height="52" fill="#faf3ed" stroke="${line}"/>
  <text x="46" y="125" text-anchor="middle" font-size="9">clinical</text>
  <text x="46" y="139" text-anchor="middle" font-size="9">MLP</text>
  <path d="M82 130 L104 130" stroke="${muted}" stroke-width="1.1" marker-end="url(#en-arrow)"/>
  <rect x="108" y="104" width="72" height="52" fill="#f7e8e8" stroke="${ochre}" stroke-width="0.9"/>
  <text x="144" y="125" text-anchor="middle" font-size="9">gated</text>
  <text x="144" y="139" text-anchor="middle" font-size="9">fusion</text>
  <path d="M180 130 L202 130" stroke="${muted}" stroke-width="1.1" marker-end="url(#en-arrow)"/>
  <rect x="206" y="104" width="50" height="52" fill="none" stroke="${line}"/>
  <text x="231" y="125" text-anchor="middle" font-size="9">joint</text>
  <text x="231" y="139" text-anchor="middle" font-size="9">embed</text>
  <path d="M144 90 L144 102" stroke="${muted}" stroke-width="1.1" marker-end="url(#en-arrow)"/>
  <text x="10" y="190" font-size="8" fill="${muted}">feature map 64 × 64</text>
  ${heat(10, 198, 8, 5, 14, 'ochre')}
  <text x="140" y="198" font-size="8" fill="${muted}">attention weights</text>
  ${Array.from({ length: 6 }, (_, i) => `<rect x="${140 + i * 22}" y="${214 + (i % 3) * 18}" width="18" height="12" fill="rgba(47,95,143,${0.25 + (i % 4) * 0.15})"/>`).join('')}
`);

const blockFusion = wrap(`
  <text x="10" y="18" font-size="11" font-weight="600">Cross-modal integration</text>
  <rect x="10" y="42" width="64" height="38" fill="#e8f0f7" stroke="${blue}" stroke-width="0.9"/>
  <text x="42" y="65" text-anchor="middle" font-size="9">omics z</text>
  <rect x="10" y="98" width="64" height="38" fill="#faf3ed" stroke="${ochre}" stroke-width="0.9"/>
  <text x="42" y="121" text-anchor="middle" font-size="9">clinical z</text>
  <path d="M74 61 L104 80" stroke="${muted}" stroke-width="1.1" marker-end="url(#fu-arrow)"/>
  <path d="M74 117 L104 98" stroke="${muted}" stroke-width="1.1" marker-end="url(#fu-arrow)"/>
  <defs><marker id="fu-arrow" markerWidth="5" markerHeight="5" refX="4.5" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 Z" fill="${muted}"/></marker></defs>
  <rect x="108" y="66" width="82" height="52" fill="#f7f7f4" stroke="${muted}" stroke-width="0.9"/>
  <text x="149" y="87" text-anchor="middle" font-size="9">cross-attention</text>
  <text x="149" y="101" text-anchor="middle" font-size="9">Q · K · V</text>
  <path d="M190 92 L214 92" stroke="${muted}" stroke-width="1.1" marker-end="url(#fu-arrow)"/>
  <rect x="218" y="66" width="66" height="52" fill="none" stroke="${line}"/>
  <text x="251" y="87" text-anchor="middle" font-size="9">shared</text>
  <text x="251" y="101" text-anchor="middle" font-size="9">space</text>
  <text x="10" y="172" font-size="8" fill="${muted}">similarity matrix</text>
  ${heat(10, 180, 8, 8, 13, 'blue')}
  <text x="128" y="164" font-size="8" fill="${muted}">pathway score</text>
  ${Array.from({ length: 7 }, (_, i) => `<rect x="${128 + i * 10}" y="${250 - i * 9}" width="7" height="${i * 9 + 6}" fill="${i % 2 ? '#2f6f6f' : '#2f5f8f'}"/>`).join('')}
  <text x="128" y="258" font-size="8" fill="${muted}">T cell / IFN / DDR</text>
`);

const blockReadout = wrap(`
  <text x="10" y="18" font-size="11" font-weight="600">Readout and validation</text>
  <line x1="18" y1="52" x2="18" y2="206" stroke="${line}" stroke-width="0.8"/>
  <line x1="18" y1="206" x2="168" y2="206" stroke="${line}" stroke-width="0.8"/>
  <text x="12" y="224" font-size="8" fill="${muted}">1 - specificity</text>
  <text x="6" y="120" font-size="8" fill="${muted}" transform="rotate(-90 6 120)">sensitivity</text>
  ${Array.from({ length: 15 }, (_, i) => {
    const x = 22 + i * 10, y = 202 - Math.min(150, Math.round((1 - Math.pow(0.72, i / 2)) * 150));
    return `<circle cx="${x}" cy="${y}" r="1.8" fill="${blue}"/>`;
  }).join('')}
  <path d="M20 204 L60 184 L94 150 L126 98 L160 46" fill="none" stroke="${ochre}" stroke-width="1.4"/>
  <text x="184" y="48" font-size="9" font-weight="600">AUROC 0.91</text>
  <text x="184" y="64" font-size="8" fill="${muted}">5-fold CV</text>
  <rect x="184" y="80" width="112" height="64" fill="#f7f7f4" stroke="${line}" stroke-width="0.7"/>
  ${[0, 1, 2, 3].map(i => `<rect x="${192 + i * 25}" y="${124 - (i + 1) * 9}" width="16" height="${(i + 1) * 9}" fill="${i % 2 ? '#2f6f6f' : '#2f5f8f'}"/>`).join('')}
  <text x="184" y="162" font-size="8" fill="${muted}">external cohort</text>
  <text x="184" y="188" font-size="9">HR 1.84 (1.31–2.57)</text>
  <text x="184" y="204" font-size="9">p = 3.2 × 10⁻⁶</text>
  <text x="184" y="230" font-size="8" fill="${muted}">calibration slope 0.96</text>
`);

const labels = ['Input and QC', 'Dual-branch encoder', 'Cross-modal fusion', 'Readout and validation'];
const blocks = [blockInput, blockEncoder, blockFusion, blockReadout];
const flowOf = count => ({
  id: 'archetype-sample', confirmed: true,
  blocks: labels.slice(0, count).map(label => ({ label, query: label })),
  edges: Array.from({ length: count - 1 }, (_, i) => ({ from: i, to: i + 1 })),
  materials: blocks.slice(0, count).map((svg, index) => ({ id: 'm' + index, index, kind: 'agent',
    data: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'), summary: '', citation: {} })),
});

const cases = [
  ['horizontal', 3, '横向流水线 3 块'],
  ['vertical', 3, '纵向分层 3 块'],
  ['grid', 4, '多面板网格 4 块'],
  ['single', 2, '单幅主图 2 块'],
];
for (const [archetype, count, title] of cases) {
  const spec = { kind: 'diagram', title, data: '', width: 1160 };
  const layout = { composition: 'overviewDetail', archetype, direction: 'LR', rankGap: 72, nodeGap: 48,
    sizes: Array.from({ length: count }, () => ({ width: 320, height: 300 })), rationale: title,
    captions: labels.slice(0, count), referenceIndex: 0, reference: { kind: 'note', label: '100 张开放论文插图版式基准' } };
  const data = renderAssembly(flowOf(count), spec, layout);
  const b64 = data.split(',')[1];
  const file = join(outDir, `archetype-${archetype}.svg`);
  writeFileSync(file, Buffer.from(b64, 'base64'), 'utf8');
  console.log(file);
}
