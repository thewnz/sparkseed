import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { draftSkillFromDiscussion, generateQuestion, parseJsonObject, parseQuestion, translatePaperText } from '../desktop/agents.mjs';
import { openStore } from '../desktop/store.mjs';
import { resolveAppearance } from '../desktop/appearance.mjs';
import { readResearchProfile, saveResearchSection } from '../desktop/research.mjs';
import { summarizeDiscussion } from '../src/idea-text.mjs';
import { downloadGitHubSkill, enabledSkills, listSkills, saveSkill, skillFromMarkdown } from '../desktop/skills.mjs';
import { scholarUrl, useResearchSource } from '../desktop/sources.mjs';
import { fitMainWindow, isWindowBounds } from '../desktop/window-layout.mjs';
import { buildIdeaMap, ideaRating } from '../src/idea-map.mjs';
import { createPaperQueue, importPaper } from '../desktop/papers.mjs';

const idea = { body: '比较小样本分类的采样方式', excerpt: '', paper: '示例论文', page: '3', discussion: [] };
const question = { question: '最想比较哪个环节？', options: ['样本选择', '类别分配'] };

test('恢复窗口时将旧尺寸限制在当前显示器工作区内', () => {
  const area = { x: 0, y: 0, width: 800, height: 600 };
  assert.deepEqual(fitMainWindow({ x: 1800, y: -10, width: 930, height: 450 }, area),
    { x: 0, y: 0, width: 800, height: 450, minWidth: 640, minHeight: 450 });
  assert.deepEqual(fitMainWindow(undefined, { x: -500, y: 20, width: 500, height: 400 }),
    { x: -500, y: 20, width: 500, height: 400, minWidth: 500, minHeight: 400 });
  assert.equal(isWindowBounds({ x: 0, y: 0, width: 0, height: 450 }), false);
});

test('外观预设与系统配色分别生效，缺少设置时沿用系统默认', () => {
  assert.equal(resolveAppearance(undefined, true).palette, 'graphite');
  const preference = { mode: 'system', light: 'paper', dark: 'black', accent: 'jade' };
  assert.equal(resolveAppearance(preference, false).palette, 'paper');
  assert.equal(resolveAppearance(preference, true).palette, 'black');
  assert.equal(resolveAppearance({ ...preference, mode: 'paper' }, true).palette, 'paper');
  assert.equal(resolveAppearance({ ...preference, accent: 'unknown' }, true).accent, 'iris');
  assert.equal(resolveAppearance(undefined, false).fontSize, 14);
  assert.equal(resolveAppearance({ fontSize: 30 }, false).fontSize, 14);
  assert.equal(resolveAppearance(undefined, false).typeface, 'serif');
  assert.equal(resolveAppearance({ typeface: 'invalid' }, false).typeface, 'serif');
  assert.equal(resolveAppearance({ typeface: 'studio' }, false).typeface, 'studio');
  assert.equal(resolveAppearance({ typeface: 'serif', bold: true }, false).typeface, 'serif');
  assert.equal(resolveAppearance({ typeface: 'serif', bold: true }, false).bold, true);
});

test('保存原始记录，重启恢复中断的追问，再保留已生成的题目', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'idea-recorder-test-'));
  const filename = join(directory, 'ideas.sqlite');
  let store = openStore(filename);
  try {
    const saved = store.create(idea, 'codex');
    store.update(saved.id, 'running', 'codex');
    store.close();
    store = openStore(filename);
    assert.deepEqual(store.queued().map(row => row.id), [saved.id]);
    assert.equal(store.get(saved.id).body, idea.body);
    assert.equal(store.get(saved.id).page, '3');
    store.update(saved.id, 'ready', 'codex', null, [question]);
    assert.deepEqual(store.get(saved.id).discussion, [question]);
    assert.equal(store.queued().length, 0);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('过滤不可用的模型输出', () => {
  assert.deepEqual(parseQuestion(JSON.stringify(question)), question);
  assert.throws(() => parseQuestion('not JSON'));
  assert.throws(() => parseQuestion(JSON.stringify({ ...question, options: ['一样', '一样'] })));
});

test('推理模型的 think 块与附带说明不影响 JSON 解析', () => {
  assert.deepEqual(parseQuestion('<think>先考虑 {格式}</think>\n' + JSON.stringify(question)), question);
  assert.deepEqual(parseQuestion('以下是结果：\n```json\n' + JSON.stringify(question) + '\n```'), question);
  assert.equal(parseJsonObject('<think>只有推理</think>'), null);
});

test('Idea 摘要区分用户确认内容、暂缓问题和待答问题', () => {
  const discussion = [
    { question: '比较什么？', answer: { options: ['采样方式'], note: '重点看类别不平衡' } },
    { question: '数据规模？', answer: { skipped: true, options: [], note: '' } },
    { message: '先从公开数据开始' },
    { question: '用什么指标？' },
  ];
  assert.deepEqual(summarizeDiscussion(discussion), {
    answered: [{ question: '比较什么？', selections: ['采样方式'], note: '重点看类别不平衡' }],
    notes: ['先从公开数据开始'], skipped: 1, open: '用什么指标？',
  });
});

test('星图布局由内容决定，相关 Idea 更近，评分只影响亮度', () => {
  const ideas = [
    { ...idea, id: 'a', body: '小样本类别采样和数据不平衡评估', paper: '' },
    { ...idea, id: 'b', body: '小样本类别采样与不平衡数据评估', paper: '' },
    { ...idea, id: 'c', body: '海洋深层环流温度记录', paper: '' },
    { ...idea, id: 'd', body: '海洋深层环流水温测量', paper: '' },
  ];
  const first = buildIdeaMap(ideas);
  const [a, b, c] = first.positions;
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < Math.hypot(a.x - c.x, a.y - c.y));
  assert.equal(first.neighbors.get('a')[0].id, 'b');
  const rated = { ...ideas[0], importance: 5, research_value: 3 };
  assert.equal(ideaRating(rated), 4);
  assert.equal(ideaRating(ideas[0]), null);
  const next = buildIdeaMap([ideas[3], ideas[2], rated, ideas[1]]);
  assert.deepEqual(next.positions.map(({ x, y }) => [x, y]), first.positions.map(({ x, y }) => [x, y]));
});

test('Idea 的两项评分独立更新，可撤销而不改讨论内容', () => {
  const store = openStore(':memory:');
  try {
    const saved = store.create(idea);
    store.rateIdea(saved.id, 'importance', 5);
    store.rateIdea(saved.id, 'researchValue', 3);
    assert.equal(ideaRating(store.list()[0]), 4);
    store.rateIdea(saved.id, 'importance', null);
    assert.equal(ideaRating(store.get(saved.id)), 3);
    assert.equal(store.get(saved.id).body, idea.body);
    assert.throws(() => store.rateIdea(saved.id, 'importance', 6));
  } finally { store.close(); }
});

test('论文库复制 PDF、识别重复文件并按页提取和搜索文字', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sparkseed-pdf-test-'));
  const store = openStore(':memory:');
  let queue;
  try {
    const stream = word => {
      const content = 'BT /F1 16 Tf 45 700 Td (' + word + ') Tj ET';
      return '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream';
    };
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      stream('Sampling baseline'), stream('Independent evaluation metric'),
      '<< /Title (Sparkseed test paper) /Author (Fixture Author) >>',
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = objects.map((object, index) => {
      const offset = pdf.length;
      pdf += (index + 1) + ' 0 obj\n' + object + '\nendobj\n';
      return offset;
    });
    const xref = pdf.length;
    pdf += 'xref\n0 9\n0000000000 65535 f \n' + offsets.map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('')
      + 'trailer\n<< /Size 9 /Root 1 0 R /Info 8 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    const source = join(directory, 'fixture.pdf');
    const library = join(directory, 'library');
    await writeFile(source, pdf);
    const imported = await importPaper(store.papers, library, source);
    assert.deepEqual(await importPaper(store.papers, library, source), { id: imported.id, duplicate: true });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('PDF 解析超时')), 15000);
      queue = createPaperQueue(store.papers, library, () => {
        const paper = store.papers.get(imported.id);
        if (paper.status === 'ready' || paper.status === 'failed' || paper.status === 'empty') {
          clearTimeout(timer);
          if (paper.status === 'ready') resolve();
          else reject(new Error(paper.error || 'PDF 未提取到文字'));
        }
      });
      queue.run();
    });
    assert.equal(store.papers.list()[0].title, 'Sparkseed test paper');
    assert.equal(store.papers.list()[0].page_count, 2);
    assert.equal(store.papers.page(imported.id, 1).text, 'Sampling baseline');
    assert.equal(store.papers.search(imported.id, 'METRIC')[0].page, 2);
  } finally {
    queue?.stop();
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('Soul 和 Memory 独立保存，保留历史，拒绝覆盖已更新的内容', () => {
  const store = openStore(':memory:');
  try {
    const original = readResearchProfile(store);
    const updated = saveResearchSection(store, { section: 'memory', text: '比较小样本采样', revision: 0 });
    assert.deepEqual(updated.soul, original.soul);
    assert.equal(updated.memory.revision, 1);
    assert.equal(updated.memory.history[0].text, '');
    assert.throws(() => saveResearchSection(store, { section: 'memory', text: '过期草稿', revision: 0 }));
    const restored = saveResearchSection(store, { section: 'memory', text: '', revision: 1 });
    assert.equal(restored.memory.text, '');
    assert.equal(restored.memory.history[0].text, '比较小样本采样');
  } finally { store.close(); }
});

test('变更 API 地址时保留用户输入，并暂停原连接的排队任务', () => {
  const store = openStore(':memory:');
  try {
    const pending = store.create(idea, 'openai');
    const unrelated = store.create(idea, 'codex');
    store.saveConnection('openai', { base: 'https://example.com/v1' }, true);
    assert.equal(store.get(pending.id).status, 'failed');
    assert.equal(store.get(pending.id).body, idea.body);
    assert.deepEqual(store.queued().map(row => row.id), [unrelated.id]);
  } finally { store.close(); }
});

test('导入 SKILL.md 后默认停用，直到用户启用', () => {
  const store = openStore(':memory:');
  try {
    const draft = skillFromMarkdown('---\nname: "paper-review"\ndescription: 评估适用条件\n---\n逐项检查基线。', 'fallback');
    assert.equal(draft.name, 'paper-review');
    assert.equal(draft.description, '评估适用条件');
    const [saved] = saveSkill(store, draft);
    assert.equal(saved.enabled, false);
    saveSkill(store, { ...saved, enabled: true });
    assert.equal(listSkills(store)[0].enabled, true);
  } finally { store.close(); }
});

test('下载 GitHub 技能保留来源，默认停用且启用后只进入选定用途', async () => {
  const signal = new AbortController().signal;
  const source = 'https://github.com/example/repo/blob/release%2Fv1/slides/SKILL.md';
  const draft = await downloadGitHubSkill(source, signal, async (url, options) => {
    assert.equal(url.origin, 'https://api.github.com');
    assert.equal(url.pathname, '/repos/example/repo/contents/slides/SKILL.md');
    assert.equal(url.searchParams.get('ref'), 'release/v1');
    assert.equal(options.redirect, 'error');
    return new Response('---\nname: slides\n---\nArrange the findings.');
  });
  const store = openStore(':memory:');
  try {
    const [saved] = saveSkill(store, { ...draft, scope: 'studio' });
    assert.equal(saved.source, source);
    assert.equal(saved.enabled, false);
    saveSkill(store, { ...saved, enabled: true });
    assert.deepEqual(enabledSkills(store, 'research'), []);
    assert.equal(enabledSkills(store, 'studio')[0].name, 'slides');
  } finally { store.close(); }
  await assert.rejects(downloadGitHubSkill('https://example.com/SKILL.md', signal, () => assert.fail()), /GitHub/);
});

test('MCP 连接测试只枚举工具，检索返回结构化来源', async () => {
  const calls = [];
  const headers = [];
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    if (req.url === '/needs-token') {
      res.writeHead(401, { 'WWW-Authenticate': 'Bearer' }).end();
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const message = JSON.parse(Buffer.concat(chunks).toString());
    calls.push(message.method);
    headers.push(req.headers.authorization);
    if (message.id == null) { res.writeHead(202).end(); return; }
    let result;
    if (message.method === 'initialize') result = {
      protocolVersion: message.params.protocolVersion, capabilities: { tools: {} },
      serverInfo: { name: 'test-source', version: '1.0' },
    };
    else if (message.method === 'tools/list') result = { tools: [{
      name: 'search_repositories', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      annotations: { readOnlyHint: true },
    }] };
    else result = { content: [{ type: 'text', text: JSON.stringify({ items: [{
      full_name: 'sample/project', html_url: 'https://github.com/sample/project', description: message.params.arguments.query,
    }] }) }] };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const config = { endpoint: 'http://127.0.0.1:' + server.address().port + '/mcp', tool: 'search_repositories', token: 'fixture' };
  try {
    const protectedEndpoint = new URL('/needs-token', config.endpoint).href;
    await assert.rejects(useResearchSource({ ...config, endpoint: protectedEndpoint, token: '' }), /需要授权/);
    await assert.rejects(useResearchSource({ ...config, endpoint: protectedEndpoint }), /访问令牌和搜索权限/);
    assert.deepEqual(await useResearchSource(config), { tool: 'search_repositories', queryField: 'query' });
    assert.ok(!calls.includes('tools/call'));
    const result = await useResearchSource(config, 'open source evaluation');
    assert.deepEqual(result.entries, [{ title: 'sample/project', url: 'https://github.com/sample/project', description: 'open source evaluation' }]);
    assert.ok(headers.every(value => value === 'Bearer fixture'));
    assert.equal(new URL(scholarUrl('评估 & 复现')).searchParams.get('q'), '评估 & 复现');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('两种兼容 API 从同一 idea 返回同样结构的选择题', async () => {
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({ path: req.url, headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString()) });
    const prompt = requests.at(-1).body.messages[0].content;
    const text = prompt.startsWith('将 JSON 字符串') ? '独立评估指标。' : JSON.stringify(prompt.startsWith('把已保存讨论') ?
      { name: '采样评估', description: '小样本', text: '先确认指标，再核查样本。' } : question);
    const body = req.url.endsWith('/chat/completions')
      ? { choices: [{ message: { content: text } }] }
      : { content: [{ type: 'text', text }] };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const config = { base: 'http://127.0.0.1:' + server.address().port + '/v1', model: 'test', key: 'synthetic' };
  try {
    for (const name of ['openai', 'anthropic']) {
      assert.deepEqual(await generateQuestion(name, config, idea, new AbortController().signal,
        { soul: '一次只问一个问题', memory: '研究背景仅用于此测试' }, [{ name: '方法检查', text: '核对指标' }]), question);
    }
    assert.equal(requests[0].path, '/v1/chat/completions');
    assert.equal(requests[0].headers.authorization, 'Bearer synthetic');
    assert.equal(requests[1].path, '/v1/messages');
    assert.equal(requests[1].headers['x-api-key'], 'synthetic');
    assert.ok(requests.every(request => request.body.messages[0].content.includes(idea.body)));
    assert.ok(requests.every(request => request.body.messages[0].content.includes('研究背景仅用于此测试')));
    assert.ok(requests.every(request => request.body.messages[0].content.includes('核对指标')));
    const skill = await draftSkillFromDiscussion('openai', config, { ...idea, id: 'test-idea' }, new AbortController().signal);
    assert.equal(skill.name, '采样评估');
    assert.equal(skill.origin, 'test-idea');
    assert.equal(skill.enabled, false);
    const count = requests.length;
    const source = 'Second page: independent evaluation metric.';
    assert.equal(await translatePaperText('openai', config, source, new AbortController().signal), '独立评估指标。');
    assert.equal(requests.length, count + 1);
    assert.equal(JSON.parse(requests.at(-1).body.messages[0].content.split('\n\n').at(-1)), source);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
