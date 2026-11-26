import { normalizeText } from './literature.mjs';

const limited = (value, length) => typeof value === 'string' ? value.trim().slice(0, length) : '';

export const flowEvidenceInstructions = [
  '只依据给定论文片段，为流程图的每个节点寻找直接相关的原文依据。节点所描述的是用户项目步骤；不要把论文内容当成项目已经做过的实验。',
  '返回 JSON {"bindings":[{"key":"阶段索引:列索引:行索引","evidence":[{"id":"论文 id","page":页码或null,"section":"正文小节名","quote":"原文连续摘录"}]}]}。总览输入输出的 key 分别为「阶段索引:input」和「阶段索引:output」。',
  'quote 必须连续逐字复制自给定 abstract、pages[].text 或 sections[].text，至少 12 字符。摘要 page:null 且不填 section；PDF 使用对应 page；正文使用对应 section 且 page:null。每节点至多两条。无直接依据时 evidence:[]。不要写解释。',
].join('\n');

export function applyFlowEvidence(plan, result) {
  const bindings = new Map((Array.isArray(result?.bindings) ? result.bindings : [])
    .filter(row => typeof row?.key === 'string').map(row => [row.key, Array.isArray(row.evidence) ? row.evidence : []]));
  return plan.map((stage, index) => ({ ...stage,
    ...(stage.input ? { input: { ...stage.input, evidence: bindings.get(`${index}:input`) || stage.input.evidence } } : {}),
    ...(stage.output ? { output: { ...stage.output, evidence: bindings.get(`${index}:output`) || stage.output.evidence } } : {}),
    columns: stage.columns.map((column, col) => column.map((node, row) => ({ ...node,
      evidence: bindings.get(`${index}:${col}:${row}`) || node.evidence }))),
  }));
}

export function verifyFlowEvidence(plan, literature = {}) {
  const papers = new Map((literature.papers || []).map(paper => [paper.id, paper]));
  const nodes = [];
  const check = (stage, key, node) => {
    const citations = (node.evidence || []).slice(0, 2).map(raw => {
      const id = limited(raw?.id, 180);
      const quote = limited(raw?.quote, 360);
      const section = limited(raw?.section, 160);
      const page = Number.isSafeInteger(raw?.page) && raw.page > 0 ? raw.page : null;
      const paper = papers.get(id);
      let origin;
      let location;
      if (paper && page !== null && !section) {
        origin = paper.pages?.find(row => row.page === page)?.text;
        location = `第 ${page} 页`;
      } else if (paper && section && page === null) {
        const row = paper.sections?.find(row => row.section === section);
        origin = row?.text;
        location = section;
      } else if (paper && page === null && !section) {
        origin = paper.abstract;
        location = '摘要';
      }
      const verified = Boolean(paper && quote.length >= 12 && origin && normalizeText(origin).includes(normalizeText(quote)));
      return { id, title: paper?.title || '', url: paper?.url || '', page, section, quote,
        location: location || '', verified, reason: verified ? '' : !paper ? '论文不在本次检索结果中' :
          !origin ? '指定页码或章节未读取' : quote.length < 12 ? '引文过短' : '引文与原文不一致' };
    });
    nodes.push({ key, stage, label: node.label, citations, verified: citations.some(row => row.verified) });
  };
  plan.forEach((stage, index) => {
    const stageName = stage.title;
    if (stage.input) check(stageName, `${index}:input`, stage.input);
    if (stage.output) check(stageName, `${index}:output`, stage.output);
    stage.columns.forEach((column, col) => column.forEach((node, row) =>
      check(stageName, `${index}:${col}:${row}`, node)));
  });
  return { nodes, verified: nodes.filter(node => node.verified).length, total: nodes.length,
    rejected: nodes.flatMap(node => node.citations).filter(citation => !citation.verified).length };
}

export function requireFlowStageEvidence(plan, evidence) {
  const covered = new Set(evidence.nodes.filter(node => node.verified).map(node => Number(node.key.split(':')[0])));
  const missing = plan.filter((_, index) => !covered.has(index)).map(stage => stage.title);
  if (missing.length) throw new Error('以下阶段缺少可定位的论文依据：' + missing.join('、') + '。请导入相关论文或补充方法术语后重试。');
}
