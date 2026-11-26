import { createHash } from 'node:crypto';
import { normalizeWorkPolicy, workMandate } from './work-policy.mjs';
import { normalizeText } from './literature.mjs';
import { relevantMemory } from './research.mjs';
import { enabledSkills } from './skills.mjs';
import { researchCandidates } from '../src/idea-map.mjs';

const text = (value, limit = 1000) => normalizeText(value).slice(0, limit);
const list = (value, limit) => Array.isArray(value) ? value.slice(0, limit) : [];
const texts = (value, limit, length) => [...new Set(list(value, limit).map(item => text(item, length)).filter(Boolean))];
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const relationKinds = ['重复', '互补', '冲突', '可迁移方法'];

export function researchSnapshot(idea) {
  return {
    body: idea.body, paper: idea.paper, page: idea.page, excerpt: idea.excerpt.slice(0, 5000),
    discussion: idea.discussion.flatMap(turn => {
      if (turn.message || turn.paper || turn.artifact) return [{ message: text(turn.message, 1600), paper: turn.paper, artifact: turn.artifact }];
      if (turn.answer && !turn.answer.skipped) return [{ question: turn.question, answer: turn.answer }];
      return [];
    }),
  };
}

/** A reply revives a failed initial check; a paused one stays paused because the person stopped it. */
export function followUpNeedsInitial(jobs) {
  const previous = jobs.find(job => job.kind === 'initial' && !['superseded', 'deleted'].includes(job.status));
  if (!previous) return true;
  if (['queued', 'running', 'paused'].includes(previous.status)) return false;
  if (previous.status === 'failed') return true;
  return !previous.progress?.plan?.queries?.length;
}

export function recordDiscussionReply(store, idea) {
  return store.work.recordEvent({ source: 'idea', subjectType: 'idea', subjectId: idea.id, kind: 'idea:reply',
    actor: 'user', payload: { turns: idea.discussion.length, last: digest(idea.discussion.at(-1) ?? null) } });
}

export function enqueueResearch(store, idea, provider, kind, question = '', manual = false, policy = null, originEvent = null) {
  const snapshot = researchSnapshot(idea);
  const candidates = kind === 'synthesis' ? researchCandidates(idea, store.list())
    .map(row => ({ id: row.id, body: text(row.body, 450), paper: text(row.paper, 120),
      points: researchSnapshot(row).discussion.slice(-3).map(point => text(point.message || point.answer?.note || point.answer?.options?.join('、'), 140)).filter(Boolean) }))
    : [];
  const profile = relevantMemory(store, idea, question);
  const skills = enabledSkills(store).map(({ name, text }) => ({ name, text }));
  const revision = digest(kind === 'synthesis' ? { version: 4, snapshot, provider } : { snapshot, question, provider, profile, skills });
  const normalized = normalizeWorkPolicy(policy || { mode: store.setting('automationMode') || 'record' });
  const rules = manual ? [] : kind === 'initial' ? ['initial-research'] : kind === 'synthesis' ? ['synthesis'] : ['deep-research'];
  const event = originEvent || store.work.recordEvent({
    source: 'idea', subjectType: 'idea', subjectId: idea.id, kind: 'research:' + kind,
    actor: manual ? 'user' : 'system', payload: { revision, provider, question: question || '' },
  });
  const mandate = workMandate({ policy: normalized, strength: manual ? 'explicit' : 'inferred', rules, revision,
    source: 'idea', subject: idea.id });
  const job = store.work.enqueue({ ideaId: idea.id, kind, revision, provider, manual,
    originEventId: event.id, mandate, input: { snapshot, question, candidates, profile, skills } });
  if (job?.status === 'queued') store.work.effects.enqueue('launch', job.id, { jobId: job.id, ideaId: idea.id });
  return job;
}

const planPrompt = [
  '根据已确认的研究想法，给出能用论文查证的检索计划。检索式用 3–8 个学术关键词，不复制用户原话、不含个人身份、未公开项目名或数据。',
  '如果还只有模糊方向或论文页码，queries 可留空，同时给 2–4 个贴合上下文的可查证问题。已经有用户确认的问题时，必须围绕该问题给查询。',
  '格式 {"focus":"实际查证范围","queries":["英文短检索式"],"questions":["下一步可查证的问题"]}。queries 最多两条。',
].join('\n');
const reportPrompt = [
  '只有可能改变当前研究判断的证据才将 impact 填为 high，普通相关结果填 normal。与当前问题和方法高度相似的工作可将 kind 填为 高度相似；必须有 papers 中可核对的引文，不根据题名猜测。',
  '为研究想法写中文文献查证报告，只回答 focus 中的假设。区分支持、反例、适用条件和证据不足。对证据缺口单独说明原因。',
  '每张证据卡必须引用 papers 内的 id，并逐字引用该页的 text、章节的 text 或 abstract 中的短句。摘要使用 page:null，章节使用 page:null 且精确填写 section。网页评论和题名不构成论文证据。',
  '把可行性写成条件性判断，指出与原论文任务、数据、指标或场景的差异。建议具体改进，但不执行或要求实验。',
  '格式 {"assessment":"对假设的条件性回答","revision":"如何改写或收敛 Idea","unknowns":["证据不足之处"],"questions":["下一轮可查证问题"],"cards":[{"id":"原样引用","page":null,"section":"","quote":"原文短引","kind":"支持|反例|适用条件|证据不足|高度相似","impact":"high|normal","finding":"这篇论文能说明什么","cannot":"这篇论文不能说明什么","condition":"适用条件","comparison":{"task":"","method":"","data":"","baseline":"","metric":"","result":""}}]}。论文资料未提及的对照字段留空。',
].join('\n');
const synthesisPrompt = [
  '根据讨论整理一份研究简报。已确认信息必须来自用户的消息和回答，推断放入假设。分析历史候选的重复、互补、冲突和可迁移方法关系，单纯主题相近不返回。',
  '为 Idea 提炼一个简洁具体的中文名称，不沿用第一句口语。abstract 用一段话综合说明研究动机、思路如何收敛、目前结论或最大的待查证点；不要逐轮复述或截取对话。尚无讨论时只归纳原始 Idea。',
  '每条关联理由写明两个想法各自贡献什么、为什么能接起来。不要提前生成组合草稿，draft 必须为空字符串，等待用户点击后单独生成。仅当用户表达了可跨讨论复用的研究方向、方法或长期约束时提出记忆增补。',
  'observations 只记录用户自身表达中有证据的研究习惯（style）、已熟悉的方法（familiar）或正在探索的方法（learning）。不要猜测学历、总体能力或专业身份。每条 evidence 必须逐字取自用户原始 Idea、消息、选择或自填回答，Agent 提问及论文摘录均不算。证据不足返回空数组。用户纠正过往偏好时，以新表述为准。',
  '格式 {"summary":{"title":"具体名称","abstract":"综合讨论摘要","hypothesis":"研究假设","confirmed":["已确认"],"open":["待解决"],"next":"下一步"},"connections":[{"id":"候选 ID","kind":"重复|互补|冲突|可迁移方法","reason":"关系理由","draft":""}],"memory":{"text":"一条长期信息","reason":"依据"},"observations":[{"kind":"style|familiar|learning","text":"简短观察","evidence":"用户原话"}]}。没有可建议的记忆时 memory 为 null。',
].join('\n');

function evidenceReport(value, found, plan) {
  const sources = new Map(found.papers.map(paper => [paper.id, paper]));
  const cards = list(value.cards, 10).flatMap(card => {
    const paper = sources.get(card?.id);
    const page = card?.page === null ? null : Number.isSafeInteger(card?.page) ? card.page : undefined;
    const quote = text(card?.quote, 360);
    const section = text(card?.section, 160);
    const sectionSource = section && page === null ? paper?.sections?.find(row => row.section === section) : null;
    const origin = section && page === null ? sectionSource?.text :
      page === null ? paper?.abstract : paper?.pages?.find(row => row.page === page)?.text;
    if (quote.length < 12 || !origin || !normalizeText(origin).includes(quote) || !text(card.finding)) return [];
    const kind = card.kind === '限制' ? '适用条件' : ['支持', '反例', '适用条件', '证据不足', '高度相似'].includes(card.kind) ? card.kind : '证据不足';
    return [{ id: paper.id, page, section, anchor: sectionSource?.anchor, quote, kind, impact: card.impact === 'high' ? 'high' : 'normal',
      finding: text(card.finding), cannot: text(card.cannot, 600), condition: text(card.condition, 420),
      comparison: Object.fromEntries(['task', 'method', 'data', 'baseline', 'metric', 'result']
        .map(key => [key, text(card.comparison?.[key], 240)])) }];
  });
  const unknowns = texts(value.unknowns, 8, 400);
  if (!cards.length && !unknowns.length) unknowns.push('当前查证范围内没有可核对的引文，无法判断该假设。');
  return {
    hypothesis: plan.hypothesis || plan.focus,
    assessment: cards.length ? text(value.assessment, 2000) || '已找到可定位的相关证据，结论仍取决于适用条件。' :
      '这次没有核对到可定位的原文证据，暂时无法从文献判断可行性。',
    revision: cards.length ? text(value.revision, 1600) : '',
    unknowns, questions: texts([...list(value.questions, 5), ...(plan.questions || [])], 7, 300),
    cards: [...new Map(cards.map(card => [card.id + '|' + card.page + '|' + card.section + '|' + card.quote, card])).values()],
    papers: found.papers.map(({ pages, sections, abstract, lead, matched, ...paper }) => ({
      ...paper, access: pages?.length || sections?.length ? '已读取部分正文' : abstract ? '摘要' : '检索线索',
    })),
    searches: found.searches, searchedAt: found.searchedAt, commentary: found.commentary || [],
  };
}

function synthesis(value, input) {
  const candidates = new Set(input.candidates.map(row => row.id));
  const summary = value.summary || {};
  const normalized = { title: text(summary.title, 68), abstract: text(summary.abstract, 1200),
    hypothesis: text(summary.hypothesis), confirmed: texts(summary.confirmed, 10, 480),
    open: texts(summary.open, 8, 480), next: text(summary.next) };
  if (!normalized.title || !normalized.abstract) throw new Error('Agent 没有返回完整的标题和讨论摘要，可以重试。');
  const connections = list(value.connections, 8).flatMap(row => candidates.has(row?.id) && text(row.reason)
    ? [{ id: row.id, kind: relationKinds.includes(row.kind) ? row.kind : '互补', reason: text(row.reason), draft: '' }] : []);
  const note = text(value.memory?.text, 1000);
  const userText = [input.snapshot.body, ...input.snapshot.discussion.flatMap(turn =>
    [turn.message, turn.answer?.note, ...(turn.answer?.options || [])])].map(value => text(value, 8000));
  const observations = list(value.observations, 6).flatMap(item => {
    const evidence = text(item?.evidence, 220);
    const description = text(item?.text, 260);
    if (!['style', 'familiar', 'learning'].includes(item?.kind) || !description || evidence.length < 4 ||
        !userText.some(message => message.includes(evidence))) return [];
    return [{ kind: item.kind, text: description, evidence }];
  });
  return { summary: normalized, connections: [...new Map(connections.map(row => [row.id, row])).values()],
    observations,
    memory: note && text(value.memory?.reason) ? { text: note, reason: text(value.memory.reason),
      revision: input.profile.memoryRevision } : null };
}

export async function executeResearch(job, { ask, collect, checkpoint, signal }) {
  const { input } = job;
  const progress = { ...job.progress };
  const save = (stage, patch = {}) => {
    signal.throwIfAborted();
    Object.assign(progress, patch, { stage });
    checkpoint(progress);
  };
  if (job.kind === 'synthesis') {
    save('organize');
    const result = await ask(synthesisPrompt, input, signal);
    signal.throwIfAborted();
    return { ...progress, result: synthesis(result, input) };
  }
  if (!progress.plan) {
    save('plan');
    const raw = await ask(planPrompt, { idea: input.snapshot, question: input.question, profile: input.profile, skills: input.skills }, signal);
    const plan = { focus: text(raw.focus), hypothesis: input.question || text(raw.focus), queries: texts(raw.queries, 2, 180), questions: texts(raw.questions, 5, 300) };
    if (!plan.queries.length && (!plan.questions.length || job.kind === 'deep')) throw new Error('Agent 没有提出可用的检索式，可以重试。');
    save('plan', { plan });
  }
  if (!progress.plan.queries.length) {
    const questions = progress.plan.questions || [];
    return {
      ...progress,
      attention: questions.length ? { kind: 'question', question: questions[0], options: questions } : null,
      result: { questions, cards: [], papers: [], assessment: '需要先选定查证问题。' },
    };
  }
  if (!progress.found || progress.found.pendingSearch || progress.found.pendingRead) {
    save(progress.found?.pendingRead ? 'read' : 'search');
    const found = await collect(progress.plan.queries, input.snapshot.paper, signal,
      (stage, partial) => save(stage, partial ? { found: partial } : {}), progress.found);
    if (found.searches.length && found.searches.filter(row => !['本地论文库', '网页评论 MCP'].includes(row.source)).every(row => row.error) && !found.papers.length) {
      delete progress.found;
      save('search');
      throw new Error('学术检索服务暂时不可用，可以继续重试已保存的检索式。');
    }
    save('read', { found });
  }
  const { found, plan } = progress;
  if (!found.papers.some(paper => paper.abstract || paper.pages?.length || paper.sections?.length)) {
    return { ...progress, result: evidenceReport({}, found, plan) };
  }
  save('review');
  const raw = await ask(reportPrompt, { idea: input.snapshot, focus: input.question || plan.focus, papers: found.papers, skills: input.skills }, signal);
  signal.throwIfAborted();
  return { ...progress, result: evidenceReport(raw, found, plan) };
}


