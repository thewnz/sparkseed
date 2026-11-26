import JSZip from 'jszip';
import { setTimeout as delay } from 'node:timers/promises';
import { flowDrawingRules } from './flow-design.mjs';
import { FLOW_REFERENCE_GALLERY } from './flow-reference-gallery.mjs';
const normalizeText = value => value.replace(/\s+/g, ' ').trim();

const workflow = /workflow|flowchart|flow diagram|pipeline|architecture|schematic|experimental design|study design|流程|架构|示意/i;
const diagramPattern = /workflow|flowchart|pipeline|architecture|流程|架构/i;
const figureExtension = /\.(?:jpe?g|png|webp|gif)$/i;

function figureMime(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) return 'image/jpeg';
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (/^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii'))) return 'image/gif';
  return '';
}

async function fetchFigureArchive(url, signal, request) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let response;
    try {
      response = await request(url, { signal, redirect: 'error', headers: {
        'user-agent': 'Mozilla/5.0 (compatible; Sparkseed/0.1.1)',
        accept: 'application/zip, application/octet-stream',
      } });
    } catch (error) {
      if (signal.aborted || attempt || !(error instanceof TypeError)) throw error;
    }
    if (response?.ok) return response;
    if (response) {
      if (attempt || ![408, 502, 503, 504].includes(response.status)) return response;
      await response.body?.cancel().catch(() => {});
    }
    await delay(300, undefined, { signal });
  }
}

export async function extractArticleFigures(xml, paper, signal, request) {
  const candidates = [...xml.matchAll(/<fig\b([^>]*)>([\s\S]*?)<\/fig>/g)].flatMap(([, attributes, content]) => {
    const name = /\bxlink:href=["']([\w.-]{1,180})["']/.exec(content)?.[1];
    const caption = normalizeText((/<caption\b[^>]*>([\s\S]*?)<\/caption>/.exec(content)?.[1] || '').replace(/<[^>]+>/g, ' '));
    if (!name || !workflow.test(caption)) return [];
    const anchor = /\bid=["']([\w.:-]+)["']/.exec(attributes)?.[1];
    const label = /<label>([^<]+)<\/label>/.exec(content)?.[1] || '论文插图';
    return [{ name, label, caption: caption.slice(0, 340), url: paper.url + (anchor ? '#' + anchor : '') }];
  }).sort((a, b) => Number(diagramPattern.test(b.caption)) - Number(diagramPattern.test(a.caption))).slice(0, 3);
  if (!candidates.length) return [];
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(45000)]);
  const url = new URL(paper.pmcid + '/supplementaryFiles', 'https://www.ebi.ac.uk/europepmc/webservices/rest/');
  url.searchParams.set('includeInlineImage', 'yes');
  const response = await fetchFigureArchive(url, deadline, request);
  if (!response?.ok || !response.body) return [];
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > 16 * 1024 * 1024) return [];
    chunks.push(chunk);
  }
  const zip = await JSZip.loadAsync(Buffer.concat(chunks)).catch(error => {
    deadline.throwIfAborted();
    return null;
  });
  if (!zip) return [];
  deadline.throwIfAborted();
  const references = [];
  for (const { name, ...figure } of candidates) {
    deadline.throwIfAborted();
    const entry = Object.values(zip.files).find(file => {
      const basename = file.name.split('/').at(-1);
      return !file.dir && figureExtension.test(basename) &&
        (basename === name || basename.replace(/\.[^.]+$/, '') === name.replace(figureExtension, ''));
    });
    if (!entry) continue;
    const bytes = await new Promise((resolve, reject) => {
      const stream = entry.nodeStream('nodebuffer');
      const parts = [];
      let size = 0;
      const abort = () => stream.destroy(deadline.reason);
      deadline.addEventListener('abort', abort, { once: true });
      stream.on('data', chunk => {
        size += chunk.length;
        if (size > 900_000) stream.destroy();
        else parts.push(chunk);
      });
      stream.on('error', reject);
      stream.on('close', () => {
        deadline.removeEventListener('abort', abort);
        if (deadline.aborted) reject(deadline.reason);
        else resolve(size > 900_000 ? null : Buffer.concat(parts));
      });
      stream.on('end', () => {
        deadline.removeEventListener('abort', abort);
        resolve(Buffer.concat(parts));
      });
      if (deadline.aborted) abort();
    });
    if (!bytes) continue;
    const mime = figureMime(bytes);
    if (mime) references.push({ ...figure, paper: paper.title, bytes, mime });
  }
  return references;
}

export const designInstructions = [
  flowDrawingRules,
  '把用户输入的流程步骤拓展为一段可执行的科研绘图提示词。保留步骤、分支、术语和公式；只补充视觉表达、分组、阅读顺序、图标和连线说明。不要新增实验、结论或参数。',
  '如有图片，按输入顺序对应 references，观察其布局、分组、连线、节点形态和色彩。选择适合当前步骤的视觉特征用于原创图稿，忽略参考图中的项目事实。只按实际收到的图片描述视觉特征。',
  'requirements 是用户的画面目标和偏好，constraints 是必须逐条遵守的要求。结合用途、尺寸、阅读顺序与流程拓扑，将它们转为可执行的绘图计划。保留步骤、术语、数值和公式。硬性约束优先于收藏画风、参考图和推荐风格。发现冲突、信息缺失或当前渲染方式无法表达的要求时，写入 concerns，勿擅自更改流程。',
  'referenceGallery 是 Sparkseed 自制的构图参考库，只规定分区、阅读顺序和信息密度，不提供科学事实。用户明确选择时优先沿用该构图；自动推荐时结合领域与拓扑选最合适的构图。论文插图只提供视觉语言，节点事实仍须来自论文正文和用户材料。',
  '需要总览下方横向并排详图、并用引线或投影对应各阶段时，设置 archetype 为 overview-detail、layout 为 compact。用户指定两列时才采用 panels。',
  `可用构图参考：${FLOW_REFERENCE_GALLERY.map(profile => `${profile.id}（${profile.label}：${profile.description}）`).join('；')}`,
  '需要按信息密度分配不同模块尺寸、处理不对称布局、跨区连线、回路、重点图形或固定比例时，设 renderer 为 detailed。只有结构简单、各阶段同等重要且紧凑分区合适时才选 composite。',
  '输出 JSON {"prompt":"完整绘图提示词","purpose":"图要回答的问题","archetype":"pipeline|overview-detail|branch|cycle|swimlane","referenceProfileId":"overview-detail|parallel-merge|feedback-cycle|swimlane|matrix-feature|compact-method","nodeStyle":"glyph|card|plain","leader":"ribbon|line|none","renderer":"composite|detailed","layout":"compact|panels|stacked","frame":"dashed|solid|open","palette":["#RRGGBB"],"checks":["须逐条对照成图的要求"],"concerns":["冲突、信息缺失或渲染限制"]}。compact 采用紧凑横排，panels 采用两列分组，stacked 采用纵向逐段布局。',
].join('\n');

export const flowCompositionInstructions = [
  '你负责整张科研流程图的美术指导。识别参考图的视觉层级、模块比例与阅读方向，结合已核验流程，为本图设计一个整体构图。',
  '按节点密度、语义重要性和连线路径分配面积。核心机制占更大区域；单一输入、输出和说明占更少空间。不要默认等分面板，也不要照搬参考图的内容或版式。',
  '输出 JSON {"aspect":"建议宽高比及理由","readingOrder":"整图阅读路线","zones":[{"label":"区域名称","stageIndices":[0],"x":0,"y":0,"width":40,"height":35,"focus":"主图形、内部结构及相邻区域如何衔接"}]}。',
  '坐标和尺寸用 0–100 的画布百分比，区域不得重叠。为标题、跨区箭头及留白预留空间。stageIndices 填该区域涵盖的阶段索引，从 0 开始。总览、图例等辅助区可填空数组。每个阶段都须有所属区域。用户硬性约束优先。',
].join('\n');

export function flowVisualDraftPrompt({ composition, stages, title, requirements, constraints, description }) {
  const flow = stages.map(stage => ({
    title: stage.title,
    input: stage.input?.label,
    output: stage.output?.label,
    columns: stage.columns.map(column => column.map(({ label, shape, expression }) => ({ label, shape, expression }))),
    links: stage.links,
  }));
  return [
    '绘制一张完整的论文流程图草案。输入插图只提供视觉参考。用新的构图表达这里给出的流程，优先满足用户要求。',
    '在一张画布落位所有区域，按构图方案安排大小、阅读顺序和视觉重点。图形和标签在预览大小下也应清晰。',
    '流程含义以给定阶段和连线为准。links 的起点与终点依次使用从 0 开始的列索引、行索引。不得从参考图引入步骤或结果。',
    JSON.stringify({ title, composition, requirements, constraints, description, flow }),
  ].join('\n');
}

export function normalizeFlowComposition(value, stageCount) {
  const clip = (text, length) => typeof text === 'string' ? text.trim().slice(0, length) : '';
  const aspect = clip(value?.aspect, 160);
  const readingOrder = clip(value?.readingOrder, 500);
  const zones = Array.isArray(value?.zones) && value.zones.length <= 10 ? value.zones.map(zone => ({
    label: clip(zone?.label, 160), focus: clip(zone?.focus, 400),
    stageIndices: zone?.stageIndices,
    x: zone?.x, y: zone?.y, width: zone?.width, height: zone?.height,
  })) : [];
  const invalid = !aspect || !readingOrder || !zones.length || zones.some(zone =>
    !zone.label || !zone.focus || ![zone.x, zone.y, zone.width, zone.height].every(Number.isFinite) ||
    !Array.isArray(zone.stageIndices) || zone.stageIndices.some(index => !Number.isInteger(index) || index < 0 || index >= stageCount) ||
    zone.x < 0 || zone.y < 0 || zone.width <= 0 || zone.height <= 0 ||
    zone.x + zone.width > 100 || zone.y + zone.height > 100);
  if (invalid || new Set(zones.flatMap(zone => zone.stageIndices)).size !== stageCount || zones.some((a, index) => zones.slice(index + 1).some(b =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height))) {
    throw new Error('模型未返回可用的全图构图。请重试或明确画布与分区要求。');
  }
  return { aspect, readingOrder, zones };
}

export function normalizeFlowDesign(value) {
  const prompt = typeof value?.prompt === 'string' ? value.prompt.trim().slice(0, 3500) : '';
  if (!prompt) throw new Error('模型未返回绘图提示词。');
  const palette = Array.isArray(value.palette) ? value.palette.slice(0, 4).filter(color => /^#[a-f0-9]{6}$/i.test(color)) : [];
  const items = list => Array.isArray(list) ? list.filter(item => typeof item === 'string')
    .map(item => item.trim().slice(0, 240)).filter(Boolean).slice(0, 12) : [];
  return {
    prompt,
    purpose: typeof value.purpose === 'string' ? value.purpose.trim().slice(0, 240) : '',
    ...(['pipeline', 'overview-detail', 'branch', 'cycle', 'swimlane'].includes(value.archetype) ? { archetype: value.archetype } : {}),
    ...(['overview-detail', 'parallel-merge', 'feedback-cycle', 'swimlane', 'matrix-feature', 'compact-method'].includes(value.referenceProfileId)
      ? { referenceProfileId: value.referenceProfileId } : {}),
    ...(['glyph', 'card', 'plain'].includes(value.nodeStyle) ? { nodeStyle: value.nodeStyle } : {}),
    ...(['ribbon', 'line', 'none'].includes(value.leader) ? { leader: value.leader } : {}),
    layout: ['compact', 'panels', 'stacked'].includes(value.layout) ? value.layout : 'compact',
    frame: ['dashed', 'solid', 'open'].includes(value.frame) ? value.frame : 'solid',
    palette,
    renderer: value.renderer === 'detailed' || value.archetype === 'swimlane' ? 'detailed' : 'composite',
    checks: items(value.checks),
    concerns: items(value.concerns),
  };
}
