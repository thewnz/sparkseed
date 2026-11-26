import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { enqueueResearch, executeResearch } from '../desktop/research-work.mjs';
import { openStore } from '../desktop/store.mjs';
import { exportMemo, makeMemo } from '../desktop/memo.mjs';
import { relevantMemory } from '../desktop/research.mjs';
import { collectLiterature } from '../desktop/literature.mjs';
import { sortIdeasByUsability } from '../src/idea-map.mjs';

const ideaInput = body => ({ body, paper: '', page: '', excerpt: '' });
const signal = new AbortController().signal;

test('删除研究任务清除结果并阻止自动重建，手动重跑使用新任务 ID', () => {
  const store = openStore(':memory:');
  try {
    const idea = store.create(ideaInput('比较估计误差'));
    const job = enqueueResearch(store, idea, 'codex', 'synthesis');
    store.work.update(job.id, 'running', { stage: 'organize' });
    assert.equal(store.work.remove(job.id).id, job.id);
    store.work.update(job.id, 'ready', { result: { summary: { title: '已删除任务的迟到结果' } } });
    assert.equal(store.work.get(job.id), undefined);
    assert.deepEqual(store.work.dashboard(), []);
    assert.deepEqual(store.work.public(idea.id), []);
    assert.equal(store.work.next(), undefined);
    assert.equal(store.get(idea.id).synthesisStatus, null);
    assert.equal(enqueueResearch(store, idea, 'codex', 'synthesis'), undefined);
    const next = enqueueResearch(store, idea, 'codex', 'synthesis', '', true);
    assert.notEqual(next.id, job.id);
    assert.equal(store.work.next().id, next.id);
    assert.deepEqual(next.progress, {});
  } finally { store.close(); }
});

test('删除最新研究整理后恢复上一份观察，已确认记忆和其他任务仍在', () => {
  const store = openStore(':memory:');
  try {
    const idea = store.create(ideaInput('对照两种方法'));
    const older = enqueueResearch(store, idea, 'codex', 'synthesis');
    const oldResult = { result: { summary: { title: '旧整理' }, observations: [{ text: '核对对照组' }] } };
    store.work.update(older.id, 'ready', oldResult);
    const newer = enqueueResearch(store, { ...idea, body: '加入新条件' }, 'codex', 'synthesis');
    const newResult = { result: { summary: { title: '新整理' }, observations: [{ text: '核对其他条件' }] } };
    store.work.update(newer.id, 'ready', newResult);
    store.work.learn(newer, newResult.result.observations);
    store.work.addMemory(newer, { text: '已确认的长期研究记忆' });
    store.work.remove(newer.id);
    assert.equal(store.get(idea.id).analysis.title, '旧整理');
    assert.deepEqual(store.work.learned()[0].observations, oldResult.result.observations);
    assert.equal(store.work.memories()[0].text, '已确认的长期研究记忆');
    store.work.remove(older.id);
    assert.deepEqual(store.work.learned(), []);
    assert.equal(store.get(idea.id).analysis, null);
  } finally { store.close(); }
});

test('用户请求的研究任务优先，旧的重复请求不撤销新任务', () => {
  const store = openStore(':memory:');
  try {
    const idea = store.create(ideaInput('检查队列优先级'));
    const original = enqueueResearch(store, idea, 'codex', 'synthesis');
    const newer = enqueueResearch(store, { ...idea, body: '添加新条件' }, 'codex', 'synthesis');
    assert.equal(store.work.get(original.id).status, 'superseded');
    assert.equal(enqueueResearch(store, idea, 'codex', 'synthesis').id, original.id);
    assert.equal(store.work.get(newer.id).status, 'queued');
    const manual = enqueueResearch(store, idea, 'codex', 'deep', '确认的查证问题？', true);
    assert.equal(store.work.next().id, manual.id);
    store.work.update(manual.id, 'paused', {});
    store.work.retry(manual.id, 'claude');
    assert.equal(store.work.next().id, manual.id);
    assert.equal(store.work.next().provider, 'claude');
  } finally { store.close(); }
});

test('只引用论文也会触发新整理，缺少标题或摘要的响应可重试', async () => {
  const store = openStore(':memory:');
  try {
    const idea = store.create(ideaInput('比较区间估计的覆盖率'));
    const original = enqueueResearch(store, idea, 'codex', 'synthesis');
    const paper = { title: 'Coverage study', page: 2, excerpt: 'Observed coverage.' };
    const job = enqueueResearch(store, { ...idea, discussion: [{ message: '', paper }] }, 'codex', 'synthesis');
    assert.notEqual(job.id, original.id);
    assert.deepEqual(job.input.snapshot.discussion[0].paper, paper);
    await assert.rejects(executeResearch(job, {
      ask: async () => ({ summary: { title: '区间覆盖率' } }), checkpoint() {}, signal,
    }), /标题和讨论摘要/);
  } finally { store.close(); }
});

test('模糊 Idea 等待确认，深查只接受能在来源中核对的引文', async () => {
  const store = openStore(':memory:');
  try {
    const idea = store.create(ideaInput('也许可用'), 'codex');
    const initial = enqueueResearch(store, idea, 'codex', 'initial');
    const question = '不均衡数据上的采样效果如何？';
    const triage = await executeResearch(initial, {
      ask: async () => ({ queries: [], questions: [question] }), checkpoint() {}, signal,
      collect: async () => assert.fail('模糊想法不应立即检索'),
    });
    assert.deepEqual(triage.result.questions, [question]);
    const deep = enqueueResearch(store, idea, 'codex', 'deep', question);
    const quote = 'The estimate was unstable on the smallest class.';
    const result = await executeResearch(deep, {
      ask: async (_, context) => {
        if (!context.papers) {
          assert.equal(context.question, question);
          return { focus: question, queries: ['few shot imbalanced sampling'], questions: [] };
        }
        assert.equal(context.focus, question);
        return { assessment: '需要限定少数类规模', revision: '明确适用范围', cards: [
          { id: 'local:p', page: 4, quote, kind: '限制', finding: '最小类的估计不稳定' },
          { id: 'local:p', page: 5, quote, kind: '限制', finding: '错页应丢弃' },
          { id: 'made-up', page: 4, quote, kind: '支持', finding: '虚构论文应丢弃' },
        ] };
      },
      collect: async () => ({ papers: [{ id: 'local:p', paperId: 'p', title: 'Fixture', pages: [{ page: 4, text: quote }] }], searches: [] }),
      checkpoint() {}, signal,
    });
    assert.equal(result.result.cards.length, 1);
    assert.equal(result.result.cards[0].page, 4);
    assert.equal(result.result.papers[0].access, '已读取部分正文');
    assert.equal(result.result.revision, '明确适用范围');
  } finally { store.close(); }
});

test('研究任务去重，重启后保留检索结果和已确认的问题', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sparkseed-work-'));
  const path = join(directory, 'ideas.sqlite');
  let store = openStore(path);
  try {
    const idea = store.create(ideaInput('类不平衡'), 'codex');
    const job = enqueueResearch(store, idea, 'codex', 'deep', '哪些条件下有效？');
    assert.equal(enqueueResearch(store, idea, 'codex', 'deep', '哪些条件下有效？').id, job.id);
    store.work.update(job.id, 'running', {
      stage: 'search', plan: { focus: '', queries: ['few shot sampling'], questions: [] },
      found: { papers: [{ id: '10.5555/fixture', title: 'Fixture', abstract: 'An abstract with a useful finding.' }], searches: [] },
    });
    store.close();
    store = openStore(path);
    const resumed = store.work.next();
    assert.equal(resumed.id, job.id);
    assert.equal(resumed.input.question, '哪些条件下有效？');
    store.work.update(job.id, 'failed', resumed.progress, '模拟后端失败');
    store.work.retry(job.id, 'claude');
    const retry = store.work.next();
    assert.equal(retry.provider, 'claude');
    assert.equal(retry.id, job.id);
    const result = await executeResearch(retry, {
      ask: async (_, context) => {
        assert.ok(context.papers[0].abstract);
        return { assessment: '结论待正文确认', cards: [{ id: '10.5555/fixture', page: null,
          quote: 'An abstract with a useful finding.', finding: '有待查证', kind: '相似' }] };
      },
      collect: async () => assert.fail('已完成检索不应重跑'), checkpoint() {}, signal,
    });
    assert.equal(result.result.cards[0].page, null);
    assert.equal(result.result.papers[0].access, '摘要');
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('章节证据可定位，评论不进入证据，导出保持原始版本与 BibTeX 引用键', async () => {
  const store = openStore(':memory:');
  try {
    const idea = store.create(ideaInput('原始 Idea'));
    const job = enqueueResearch(store, idea, 'codex', 'deep', '条件 A 下是否有效？');
    const quote = 'The intervention worked only under condition A.';
    const paper = { id: 'PMC1', pmcid: 'PMC1', doi: '10.1000/test', title: 'Paper & Evidence', version: '作者稿',
      authors: ['Example, Alice'], sections: [{ section: 'Results [1]', text: quote }] };
    const report = await executeResearch(job, {
      ask: async (_, data) => data.papers ? {
        revision: '限定到条件 A',
        cards: [
          { id: paper.id, page: null, section: 'Results [1]', quote, kind: '适用条件', finding: '只支持 A', cannot: '不能推断 B' },
          { id: paper.id, page: null, section: 'Wrong', quote, kind: '支持', finding: '错章节' },
          { id: 'https://example.org', page: null, quote, kind: '支持', finding: '网页不属于论文' },
        ],
      } : { queries: ['condition A literature'], questions: [] },
      collect: async () => ({ papers: [paper], searches: [], commentary: [{ url: 'https://example.org', description: quote }] }),
      checkpoint() {}, signal,
    });
    assert.equal(report.result.hypothesis, job.input.question);
    assert.equal(report.result.cards.length, 1);
    assert.equal(report.result.cards[0].section, 'Results [1]');
    assert.equal(report.result.commentary.length, 1);
    store.work.update(job.id, 'ready', report);
    const { markdown, bibtex } = makeMemo(idea, store.work.list(idea.id));
    const citation = markdown.match(/\[@(sparkseed[a-f0-9]+)\]/)[1];
    assert.ok(bibtex.includes('@misc{' + citation + ','));
    assert.ok(bibtex.includes('doi = {10.1000/test}'));
    assert.ok(markdown.includes('不能推断 B') && markdown.includes('限定到条件 A') && !markdown.includes('https://example.org'));
    const directory = await mkdtemp(join(tmpdir(), 'sparkseed-memo-test-'));
    try {
      const files = await exportMemo(directory, idea, store.work.list(idea.id));
      assert.equal(await readFile(files.markdown, 'utf8'), markdown);
      assert.equal(await readFile(files.bibtex, 'utf8'), bibtex);
    } finally { await rm(directory, { recursive: true, force: true }); }
  } finally { store.close(); }
});

test('同名预印本和正式版分开记录，取消正文读取后从已保存论文续跑', async () => {
  const controller = new AbortController();
  let saved;
  let crossrefAttempts = 0;
  const request = async url => {
    if (url.hostname === 'api.crossref.org') {
      if (++crossrefAttempts === 1) return new Response('temporary outage', { status: 503 });
      return Response.json({ message: { items: [
        { DOI: '10.1000/published', title: ['Same title'], type: 'journal-article' },
      ] } });
    }
    if (url.hostname === 'export.arxiv.org') return new Response(
      '<feed><entry><id>https://arxiv.org/abs/2501.01234v2</id><title>Same title</title><arxiv:doi>10.1000/published</arxiv:doi></entry></feed>');
    if (url.pathname.endsWith('/search')) return Response.json({ resultList: { result: [] } });
    return new Response('fixture missing', { status: 404 });
  };
  await assert.rejects(collectLiterature(['research evidence'], {
    signal: controller.signal, request, localPapers: () => [],
    web: async () => ({ entries: [{ title: 'Comment', url: 'https://example.org/review', description: 'An external review' }] }),
    onStage: (stage, found) => { if (stage === 'read') { saved = found; controller.abort(); } },
  }), { name: 'AbortError' });
  assert.equal(saved.papers.length, 2);
  assert.equal(crossrefAttempts, 2);
  assert.equal(saved.commentary.length, 1);
  const resumed = await collectLiterature(['research evidence'], {
    signal, prior: saved, request: async url => {
      assert.equal(url.hostname, 'arxiv.org');
      return new Response('', { status: 404 });
    },
  });
  assert.deepEqual(resumed.papers.map(paper => paper.version).sort(), ['正式发表', '预印本'].sort());
  assert.equal(resumed.papers.find(paper => paper.arxiv).related[0].doi, '10.1000/published');
  assert.equal(resumed.pendingRead, false);
});

test('任务面板显示暂停的检索进度，续跑跳过已保存的检索式', async () => {
  const store = openStore(':memory:');
  const controller = new AbortController();
  try {
    const idea = store.create(ideaInput('两轮检索'));
    const job = enqueueResearch(store, idea, 'codex', 'deep', '哪种方法有效？');
    let checkpoint;
    const request = async url => {
      if (url.hostname === 'api.crossref.org') return Response.json({ message: { items: [{
        DOI: '10.1000/example', title: ['Saved result'], type: 'journal-article',
      }] } });
      if (url.hostname === 'export.arxiv.org') return new Response('<feed></feed>');
      return Response.json({ resultList: { result: [] } });
    };
    await assert.rejects(collectLiterature(['first query', 'second query'], {
      request, localPapers: () => [], signal: controller.signal,
      onStage: (stage, partial) => {
        checkpoint = partial;
        store.work.update(job.id, 'paused', { stage, found: partial });
        controller.abort();
      },
    }), { name: 'AbortError' });
    const [item] = store.work.dashboard();
    assert.equal(item.status, 'paused');
    assert.equal(item.paper_count, 1);
    assert.equal(item.stage, 'search');
    const result = await collectLiterature(['first query', 'second query'], { prior: checkpoint, localPapers: () => [],
      request: async url => {
        assert.ok(!url.searchParams.toString().includes('first'));
        return request(url);
      }, signal });
    assert.equal(result.papers[0].title, 'Saved result');
    assert.ok(result.searches.some(row => row.query === 'first query') && result.searches.some(row => row.query === 'second query'));
  } finally { store.close(); }
});

test('只选相关且未撤回的记忆，并对同一 Idea 关系保存确认状态', () => {
  const store = openStore(':memory:');
  try {
    const first = store.create(ideaInput('小样本评估'));
    const second = store.create(ideaInput('小样本跨域迁移'));
    const job = enqueueResearch(store, first, 'codex', 'synthesis');
    store.work.addMemory(job, { text: '长期关注小样本置信区间', reason: '原讨论确认' });
    store.work.addManualMemory('编译器寄存器分配');
    assert.equal(relevantMemory(store, first).memory, '长期关注小样本置信区间');
    assert.equal(store.work.memories().find(row => row.id === job.id).idea_id, first.id);
    store.work.setMemoryStatus(job.id, 'withdrawn');
    assert.equal(relevantMemory(store, first).memory, '');
    store.work.decideRelation(first.id, second.id, '可迁移方法', '评估方法可复用', 'confirmed');
    store.work.decideRelation(second.id, first.id, '可迁移方法', '评估方法可复用', 'ignored');
    assert.equal(store.work.relations().length, 1);
    assert.equal(store.work.relations()[0].status, 'ignored');
  } finally { store.close(); }
});

test('置顶优先于可用程度，删除一条 Idea 不删除组合记录或确认过的记忆', () => {
  const store = openStore(':memory:');
  try {
    const first = store.create(ideaInput('已有调研'));
    const second = store.create(ideaInput('待探索的研究方向'));
    store.rateIdea(first.id, 'usability', 5);
    store.rateIdea(second.id, 'usability', 1);
    assert.equal(sortIdeasByUsability(store.list())[0].id, first.id);
    store.pinIdea(second.id, true);
    assert.equal(sortIdeasByUsability(store.list())[0].id, second.id);
    const job = enqueueResearch(store, second, 'codex', 'synthesis');
    const combination = store.combine(job, first.id, '组合想法');
    store.work.addMemory(job, { text: '已确认的方向', reason: '来自讨论' });
    store.work.decideRelation(first.id, second.id, '互补', '可以组合', 'confirmed');
    store.removeIdea(second.id);
    assert.equal(store.get(second.id), undefined);
    assert.equal(store.work.get(job.id), undefined);
    assert.equal(store.work.relations().length, 0);
    assert.equal(store.get(combination).body, '组合想法');
    assert.equal(store.get(first.id).usability, 5);
    assert.equal(store.work.memories()[0].idea_id, '');
  } finally { store.close(); }
});

test('整理可提出可追溯的互补草稿和记忆建议，组合不会覆盖原 Idea', async () => {
  const store = openStore(':memory:');
  try {
    const first = store.create(ideaInput('用分层采样处理类别不平衡'));
    const second = store.create(ideaInput('用置信区间报告小样本评估'));
    const job = enqueueResearch(store, first, 'codex', 'synthesis');
    const progress = await executeResearch(job, {
      ask: async (_, input) => {
        assert.equal(input.candidates[0].id, second.id);
        return { summary: { title: '分层估计', abstract: '比较分层前后的估计稳定性。', hypothesis: '分层后估计更稳定' },
          connections: [{ id: second.id, reason: '评估补充采样方法', draft: '合并初稿' }, { id: 'bad', reason: '虚构', draft: '虚构' }],
          memory: { text: '长期关注小样本评估', reason: '已确认方向' } };
      }, checkpoint() {}, signal,
    });
    assert.equal(progress.result.connections.length, 1);
    assert.equal(progress.result.memory.revision, 0);
    const id = store.combine(job, second.id, '编辑后的草稿');
    assert.equal(store.combine(job, second.id, '避免重复'), id);
    assert.deepEqual(store.get(id).origins, [first.id, second.id]);
    assert.equal(store.get(id).body, '编辑后的草稿');
    assert.equal(store.get(first.id).body, first.body);
  } finally { store.close(); }
});
