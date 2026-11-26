import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { renderAssembly } from '../desktop/flow-assembly.mjs';

const root = join(import.meta.dirname, '..');
const outDir = join(root, 'artifacts', 'style-benchmark');
mkdirSync(outDir, { recursive: true });
const picks = [
  ['expanded-02', 'DIA proteomics workflow'],
  ['expanded-09', 'Catalyst electronic structure'],
  ['expanded-20', 'Radiative cooling system'],
  ['expanded-27', 'Bio-inspired multimodal learning'],
];
const flow = {
  id: 'real-panel-test', confirmed: true,
  blocks: picks.map(([, label]) => ({ label, query: label })), edges: picks.slice(1).map((_, i) => ({ from: i, to: i + 1 })),
  materials: picks.map(([id], index) => ({ id: 'm' + index, index, kind: 'paper',
    data: 'data:image/png;base64,' + readFileSync(join(outDir, 'expanded-figures', id + '.png')).toString('base64'),
    summary: id, citation: {} })),
};
const layout = { composition: 'overviewDetail', archetype: 'grid', direction: 'LR', rankGap: 70, nodeGap: 50,
  sizes: picks.map(() => ({ width: 420, height: 320 })), rationale: 'four real method panels',
  captions: picks.map(([, label]) => label), referenceIndex: 0,
  reference: { kind: 'note', label: '100 张开放论文插图版式基准' } };
const data = renderAssembly(flow, { kind: 'diagram', title: 'real panel test' }, layout);
const target = join(outDir, 'archetype-grid-real.svg');
writeFileSync(target, Buffer.from(data.split(',')[1], 'base64'), 'utf8');
console.log(target);
