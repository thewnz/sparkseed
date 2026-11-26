import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { renderAssembly } from '../desktop/flow-assembly.mjs';

const root = join(import.meta.dirname, '..');
const outDir = join(root, 'artifacts', 'style-benchmark');
mkdirSync(outDir, { recursive: true });

const ink = '#1f2328';
const muted = '#4f555b';
const blue = '#2f5f8f';
const ochre = '#a45f32';
const green = '#4c7358';
const line = '#c6cbd0';

const svgBlock = (inner, background = '#ffffff') => `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="280" viewBox="0 0 320 280" font-family="Arial, Helvetica, sans-serif" fill="${ink}">
  <rect width="320" height="280" fill="${background}"/>
  ${inner}
</svg>`;

const cube = (x, y, w, h, colors) => {
  const d = 18;
  return `<g>
    <path d="M${x} ${y + d} L${x + d} ${y} L${x + w} ${y} L${x + w - d} ${y + d} Z" fill="${colors[0]}"/>
    <path d="M${x} ${y + d} L${x} ${y + h} L${x + w - d} ${y + h} L${x + w - d} ${y + d} Z" fill="${colors[1]}"/>
    <path d="M${x + w - d} ${y + d} L${x + w - d} ${y + h} L${x + w} ${y + h - d} L${x + w} ${y} Z" fill="${colors[2]}"/>
    ${Array.from({ length: 7 }, (_, i) => `<line x1="${x + 7 + i * 11}" y1="${y + 12}" x2="${x + 7 + i * 11}" y2="${y + h - 5}" stroke="#ffffff" stroke-opacity=".55" stroke-width="1"/>`).join('')}
  </g>`;
};

const block1 = svgBlock(`
  <text x="8" y="18" font-size="11" font-weight="600">Hyperspectral input</text>
  ${cube(12, 40, 92, 88, ['#dbe6ef', '#9fb8cc', '#6f8da4'])}
  <text x="18" y="151" font-size="10" fill="${muted}">Noisy HSI Y</text>
  <line x1="118" y1="84" x2="148" y2="84" stroke="${muted}" stroke-width="1.2" marker-end="url(#block-a-arrow)"/>
  <defs><marker id="block-a-arrow" markerWidth="5" markerHeight="5" refX="4.5" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 Z" fill="${muted}"/></marker></defs>
  <rect x="154" y="58" width="64" height="52" fill="#f3f6f9" stroke="${blue}" stroke-width="1"/>
  <text x="186" y="79" text-anchor="middle" font-size="10">Spectral</text>
  <text x="186" y="93" text-anchor="middle" font-size="10">encoder</text>
  <line x1="224" y1="84" x2="246" y2="84" stroke="${muted}" stroke-width="1.2" marker-end="url(#block-a-arrow)"/>
  <rect x="252" y="54" width="56" height="60" fill="#ffffff" stroke="${line}" stroke-width=".9"/>
  ${Array.from({ length: 5 }, (_, r) => `<rect x="259" y="${61 + r * 10}" width="42" height="6" fill="${r === 2 ? '#d7e3ee' : '#edf2f6'}"/>`).join('')}
  <text x="14" y="190" font-size="10" fill="${muted}">Spatial–spectral patches</text>
  <text x="14" y="240" font-size="10" fill="${muted}">Spectral bands 400–1000 nm</text>
  ${Array.from({ length: 9 }, (_, i) => `<rect x="${14 + i * 32}" y="250" width="29" height="10" fill="${['#dce7f0', '#c5d7e5', '#a9c2d4', '#e8ddcf', '#dcc9b8', '#f0e7d8', '#dbe6dc', '#b9cdbb', '#9eb7a3'][i]}"/>`).join('')}
`);

const block2 = svgBlock(`
  <text x="8" y="18" font-size="11" font-weight="600">Latent diffusion</text>
  <text x="12" y="43" font-size="10" fill="${muted}">abundance latent</text>
  ${Array.from({ length: 4 }, (_, r) => Array.from({ length: 5 }, (_, c) =>
    `<rect x="${14 + c * 18}" y="${52 + r * 18}" width="15" height="15" fill="${(r + c) % 4 === 0 ? '#ead9cc' : '#f3f6f9'}" stroke="#d0d5da" stroke-width=".6"/>`).join('')).join('')}
  <line x1="108" y1="92" x2="132" y2="92" stroke="${muted}" stroke-width="1.2" marker-end="url(#block-b-arrow)"/>
  <defs><marker id="block-b-arrow" markerWidth="5" markerHeight="5" refX="4.5" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 Z" fill="${muted}"/></marker></defs>
  <path d="M138 66 L164 87 L138 108 Z" fill="#fbf1e8" stroke="${ochre}" stroke-width="1"/>
  <path d="M170 66 L196 87 L170 108 Z" fill="#f3f6f9" stroke="${blue}" stroke-width="1"/>
  <line x1="202" y1="87" x2="224" y2="87" stroke="${muted}" stroke-width="1.2" marker-end="url(#block-b-arrow)"/>
  <rect x="230" y="62" width="78" height="50" fill="#ffffff" stroke="${line}" stroke-width=".9"/>
  <text x="269" y="81" text-anchor="middle" font-size="10">denoiser</text>
  <text x="269" y="96" text-anchor="middle" font-size="10" fill="${muted}">εθ(z&lt;t, t)</text>
  <path d="M16 142 C56 ${122} 96 168 136 146 C176 126 200 160 238 138 C258 128 280 138 304 134" fill="none" stroke="${ochre}" stroke-width="1.2"/>
  <text x="16" y="178" font-size="10" fill="${muted}">Conditioning function</text>
  <line x1="16" y1="188" x2="304" y2="188" stroke="${line}" stroke-width=".8"/>
  <text x="16" y="207" font-size="10" fill="${muted}">noise schedule: T steps</text>
  <text x="16" y="240" font-size="10" fill="${muted}">Reverse diffusion</text>
  ${Array.from({ length: 8 }, (_, i) => `<rect x="${16 + i * 36}" y="251" width="22" height="9" fill="${i < 4 ? '#f0e2d4' : '#e4edf3'}"/>`).join('')}
`);

const block3 = svgBlock(`
  <text x="8" y="18" font-size="11" font-weight="600">Reconstruction</text>
  ${cube(14, 32, 74, 70, ['#e9eee8', '#b8c9b9', '#839a86'])}
  <text x="18" y="123" font-size="10" fill="${muted}">Reconstructed HSI</text>
  <line x1="96" y1="68" x2="116" y2="68" stroke="${muted}" stroke-width="1.2"/>
  <rect x="122" y="40" width="88" height="58" fill="#f7f8f9" stroke="${line}" stroke-width=".9"/>
  <polyline points="130,88 144,72 158,80 172,56 186,64 200,46" fill="none" stroke="${green}" stroke-width="1.1"/>
  <text x="126" y="112" font-size="9" fill="${muted}">PSNR / epoch</text>
  <rect x="222" y="40" width="86" height="58" fill="#ffffff" stroke="${line}" stroke-width=".9"/>
  <text x="265" y="57" text-anchor="middle" font-size="9" fill="${muted}">metrics</text>
  <text x="229" y="73" font-size="9">RMSE</text><text x="229" y="87" font-size="9">SAM</text>
  <line x1="14" y1="146" x2="306" y2="146" stroke="${line}" stroke-width=".8"/>
  <text x="14" y="168" font-size="10" fill="${muted}">Abundance → spectra</text>
  <text x="14" y="188" font-size="10" fill="${muted}">Pixel-wise reconstruction</text>
  <text x="14" y="207" font-size="10" fill="${muted}">Held-out scene evaluation</text>
  <text x="14" y="240" font-size="10" fill="${muted}">Per-pixel reconstruction error</text>
  ${Array.from({ length: 6 }, (_, r) => Array.from({ length: 20 }, (_, c) =>
    `<rect x="${14 + c * 11}" y="${250 + r * 8}" width="9" height="6" fill="${(r + c) % 5 === 0 ? '#d8e1d9' : (r + c) % 3 === 0 ? '#eef2ee' : '#f7f9f7'}" stroke="#e3e6e3" stroke-width=".35"/>`).join('')).join('')}
`);

const materials = [block1, block2, block3].map((svg, index) => ({
  id: 'style-benchmark-' + index, index, kind: 'agent',
  data: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'),
  summary: '', citation: {},
}));

const flow = {
  id: 'style-benchmark-flow', confirmed: true,
  blocks: [
    { label: 'Spectral input and encoder', query: 'hyperspectral' },
    { label: 'Latent diffusion denoising', query: 'diffusion' },
    { label: 'Reconstruction and evaluation', query: 'reconstruction' },
  ],
  edges: [{ from: 0, to: 1 }, { from: 1, to: 2 }],
  materials,
};

const layout = {
  composition: 'overviewDetail', direction: 'LR', rankGap: 70, nodeGap: 50,
  sizes: materials.map(() => ({ width: 300, height: 220 })),
  captions: [
    'Encode spatial–spectral patches into a compact abundance latent.',
    'Condition the reverse diffusion process on the estimated endmembers.',
    'Decode the latent and compare reconstructed spectra with held-out data.',
  ],
  rationale: 'Three-stage method overview in journal figure style', referenceIndex: 0, reference: {},
};
const spec = { kind: 'diagram', title: 'Spectral unmixing with latent diffusion', data: '', width: 1240, theme: 'color' };
const dataUrl = renderAssembly(flow, spec, layout, {});
const svg = Buffer.from(dataUrl.split(',')[1], 'base64').toString('utf8');
const path = join(outDir, 'journal-flow-after.svg');
writeFileSync(path, svg, 'utf8');
console.log(path, svg.length);
