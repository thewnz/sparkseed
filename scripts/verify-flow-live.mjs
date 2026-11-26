// Manual live check. Uses a synthetic flow; does not read or write app user data.
import { requestResearchJson } from '../desktop/agents.mjs';
import { collectLiterature } from '../desktop/literature.mjs';
import { compositeFlowInstructions, normalizeCompositeFlow, renderCompositeFlow } from '../desktop/composite-flow.mjs';
import { verifyFlowEvidence } from '../desktop/flow-evidence.mjs';
import { applyFlowEvidence, flowEvidenceInstructions } from '../desktop/flow-evidence.mjs';
import { normalizeFigureDraft } from '../desktop/scientific-figure.mjs';
import { validateModelSvg } from '../desktop/model-figure.mjs';

const signal = AbortSignal.timeout(180_000);
const material = 'Acquire near-infrared spectra → bootstrap PLSR wavelength selection → rank stable wavelengths → train a regression model.';
const queryPlan = await requestResearchJson('codex', {},
  'Return JSON {"queries":["one concrete scholarly query"]} for the given flow. No other text.',
  { material }, signal);
const queries = queryPlan.queries?.filter(value => typeof value === 'string').slice(0, 1) || [];
if (!queries.length) throw new Error('No model-generated literature query.');
const found = await collectLiterature(queries, { signal, localPapers: () => [] });
const literature = { queries, searches: found.searches, papers: found.papers.slice(0, 10).map(paper => ({
  id: paper.id, title: paper.title, url: paper.url || '', abstract: paper.abstract || '',
  pages: paper.pages || [], sections: paper.sections || [],
})) };
const result = await requestResearchJson('codex', {}, compositeFlowInstructions,
  { material, literature, brief: [], skills: [] }, signal);
let plan = normalizeCompositeFlow(result);
const bindings = await requestResearchJson('codex', {}, flowEvidenceInstructions,
  { stages: plan, literature }, signal);
plan = normalizeCompositeFlow({ stages: applyFlowEvidence(plan, bindings) });
const evidence = verifyFlowEvidence(plan, literature);
const svg = validateModelSvg(renderCompositeFlow(plan, normalizeFigureDraft({ kind: 'diagram',
  title: 'Synthetic NIR flow', data: material, width: 1080, theme: 'color' })));
console.log(JSON.stringify({ queries, sources: literature.searches, papers: literature.papers.length,
  stages: plan.length, nodes: evidence.total, verified: evidence.verified, rejected: evidence.rejected,
  evidence: evidence.nodes.map(({ key, label, verified, citations }) => ({ key, label, verified,
    sources: citations.map(({ id, location, verified, reason }) => ({ id, location, verified, reason })) })),
  svgBytes: Buffer.byteLength(svg) }, null, 2));
