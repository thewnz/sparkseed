import { mkdirSync, writeFileSync } from 'node:fs';
import { renderAssembly, vectorBlock } from '../desktop/flow-assembly.mjs';

const ink = '#192733';
const blue = '#326489';
const teal = '#24746c';
const amber = '#a25a24';
const grey = '#637583';
const label = (x,y,value,size=13) => `<text x="${x}" y="${y}" font-size="${size}" fill="${ink}">${value}</text>`;
const box = (x,y,w,h,color=blue) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="url(#tint)" stroke="${color}"/>`;
const line = (x1,y1,x2,y2,color=grey,arrow=false) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.3"${arrow?' marker-end="url(#tip)"':''}/>`;
const plot = (points,color) => `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;
const panel = content => `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="244" viewBox="0 0 340 244" font-family="Arial">
<defs><linearGradient id="tint" x2="0" y2="1" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="#f7fbfd"/><stop offset="1" stop-color="#edf4f8"/></linearGradient>
<marker id="tip" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8Z" fill="${grey}"/></marker></defs>${content}</svg>`;

const acquire = panel([
  label(15,29,'Transmission measurement',15),
  box(15,47,72,36), label(30,70,'Source'),
  box(113,47,97,36,teal), label(133,70,'Sample'),
  box(238,47,87,36), label(255,70,'Detector'),
  line(90,65,109,65,grey,true), line(213,65,234,65,grey,true),
  label(15,114,'Detected spectrum',14),
  line(26,138,26,201),line(26,201,316,201),
  plot('32,184 62,177 91,180 116,160 145,172 173,154 199,142 219,151 243,160 278,150 310,166',blue),
  label(26,223,'Wavelength',12),label(211,223,'Illustrative trace',12),
].join(''));

const preprocess = panel([
  label(15,29,'Apply fixed preprocessing',15),
  label(15,60,'Raw signal'), label(191,60,'Processed signal'),
  line(15,75,15,146),line(15,146,149,146),
  line(191,75,191,146),line(191,146,325,146),
  plot('20,127 31,111 41,121 51,101 61,115 71,112 80,90 90,103 101,81 111,91 121,80 132,102 143,91',blue),
  plot('196,128 210,123 226,116 239,112 251,102 265,92 279,86 292,87 306,92 320,99',teal),
  line(154,111,183,111,grey,true),
  label(15,166,'Wavelength',12),label(191,166,'Wavelength',12),
  box(15,187,310,36,teal),label(32,210,'Smooth, then normalize each spectrum'),
].join(''));

const evaluate = panel([
  label(15,29,'Split by specimen',15),
  box(15,46,135,35),label(30,68,'Training specimens'),
  box(190,46,135,35,amber),label(205,68,'Held-out specimens'),
  line(82,84,82,109,grey,true),line(257,84,257,109,grey,true),
  box(15,112,135,35),label(32,134,'Fit classifier'),
  box(190,112,135,35,amber),label(209,134,'Predict labels'),
  line(154,129,185,129,grey,true),line(257,150,257,174,grey,true),
  box(190,178,135,36,teal),label(204,201,'Compare to labels'),
  label(15,201,'Report held-out performance',11),
].join(''));

const blocks = ['Acquisition', 'Preprocessing', 'Evaluation'].map(title => ({ label: title }));
const flow = { blocks, edges: [{ from: 0, to: 1 }, { from: 1, to: 2 }],
  materials: [acquire, preprocess, evaluate].map((svg,index) => ({ index, kind: 'agent', data: vectorBlock(svg) })) };
const spec = { kind: 'diagram', title: 'Optical spectroscopy workflow' };
const layout = { composition: 'overviewDetail', archetype: 'horizontal', direction: 'LR',
  sizes: blocks.map(() => ({ width: 340, height: 244 })) };
const out = new URL('../artifacts/deepseek-flow-demo/', import.meta.url);
mkdirSync(out,{recursive:true});
writeFileSync(new URL('spectroscopy-reviewed.svg',out),Buffer.from(renderAssembly(flow,spec,layout).split(',')[1],'base64'));
