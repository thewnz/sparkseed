import { mkdir, writeFile } from 'node:fs/promises';
import { requestResearchJson } from '../desktop/agents.mjs';
import { collectLiterature } from '../desktop/literature.mjs';
import { normalizeFigureDraft } from '../desktop/scientific-figure.mjs';
import { designInstructions, normalizeFlowDesign } from '../desktop/flow-style.mjs';
import { applyFlowReferenceDefaults, recommendFlowReference } from '../desktop/flow-reference-gallery.mjs';
import { compositeFlowInstructions, inspectCompositeStructure, normalizeCompositeFlow, renderCompositeFlow } from '../desktop/composite-flow.mjs';
import { exportFlowArchive, selectFlowReferences } from '../desktop/flow-design.mjs';
import { verifyFlowEvidence } from '../desktop/flow-evidence.mjs';
import { modelFigureArtifact } from '../desktop/model-figure.mjs';

const cases = {
  wavelength: {
    title: 'Optimal Wavelength Selection',
    query: 'visible near infrared spectroscopy wavelength selection bootstrap PLSR',
    steps: 'Primary: bootstrap PLSR on raw spectra, select candidates by VIP. Secondary: rank candidate wavelengths by stability across repeats. Final: traverse candidate/reference pairs, construct 1/R_i − 1/R_ref features and screen by ridge regression to obtain the optimal wavelength set.',
    requirements: 'English labels. Overview and three compact detail panels in rose, green and teal. Use spectrum, model and formula glyphs. Keep the inverse-difference equation.',
  },
  hydrology: {
    title: 'Rainfall–Runoff Model Calibration',
    query: 'rainfall runoff model calibration split sample validation streamflow',
    steps: 'Align rainfall, potential evapotranspiration and observed discharge. Split chronologically. Simulate calibration discharge and compare to observations. If fit is insufficient, update parameters and repeat the calibration simulation; otherwise freeze parameters. Simulate held-out discharge with frozen parameters and report validation skill.',
    requirements: 'English labels. Draw calibration as an explicit feedback loop, then independent validation. No parameter tuning on validation data.',
  },
};

const name = process.argv[2];
const example = cases[name];
if (!example) throw new Error('Choose wavelength or hydrology.');
const directory = new URL('../artifacts/flow-generation-check/', import.meta.url);
await mkdir(directory, { recursive: true });
const signal = AbortSignal.timeout(180_000);
const { title, query, steps, requirements } = example;
const found = await collectLiterature([query], {
  signal: AbortSignal.any([signal, AbortSignal.timeout(45_000)]), localPapers: () => [], illustrations: true,
});
const figures = selectFlowReferences(found.papers, steps);
const references = figures.map(({ bytes, mime, ...metadata }) => metadata);
const papers = found.papers.slice(0, 8).map(({ id, title, abstract, sections, pages }) => ({
  id, title, abstract, sections: sections?.slice(0, 3), pages: pages?.slice(0, 2),
}));
const literature = { papers, searches: found.searches };
const { profile } = recommendFlowReference({ steps, requirements });
const planned = normalizeFlowDesign(await requestResearchJson('codex', {}, designInstructions, {
  steps, requirements, canvas: { width: 1440 }, referenceGallery: { id: profile.id, description: profile.description },
  references,
}, signal, 4096, figures));
const designBrief = applyFlowReferenceDefaults(planned, profile);
const flowPlan = normalizeCompositeFlow(await requestResearchJson('codex', {}, compositeFlowInstructions, {
  material: steps, requirements, drawingPrompt: designBrief.prompt, figureSpec: designBrief, literature,
}, signal));
const evidence = verifyFlowEvidence(flowPlan, literature);
const structure = inspectCompositeStructure(flowPlan);
const specification = normalizeFigureDraft({ kind: 'diagram', title, data: steps, width: 1440, theme: 'color' });
const artifact = modelFigureArtifact({ svg: renderCompositeFlow(flowPlan, specification, designBrief) },
  specification, { flowPlan, evidence, structure, designBrief: { ...designBrief, references } });
const result = { title, query, profile: profile.id, paperCount: papers.length, referenceCount: references.length,
  structure, evidence: { total: evidence.total, verified: evidence.verified, rejected: evidence.rejected },
  feedbackEdges: flowPlan.flatMap(stage => stage.links).filter(([from, to]) => from[0] > to[0]).length,
  formulas: flowPlan.flatMap(stage => stage.columns.flat()).flatMap(node => node.expression ? [node.expression] : []) };
await Promise.all([
  writeFile(new URL(name + '.svg', directory), Buffer.from(artifact.data.split(',')[1], 'base64')),
  writeFile(new URL(name + '.zip', directory), await exportFlowArchive(artifact)),
  writeFile(new URL(name + '.json', directory), JSON.stringify(result, null, 2)),
]);
console.log(JSON.stringify(result, null, 2));
