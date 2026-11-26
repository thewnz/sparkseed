const translatedPages = new Map();
let previewFlowState = null;
let previewResearchProfile = {
  soul: { text: '用中文讨论，每轮聚焦一个问题。', revision: 0, savedAt: null, history: [] },
  memory: { text: '研究问题：小样本时间序列估计。', revision: 0, savedAt: null, history: [] },
};
let previewSkills = [
  { id: 'sk-1', name: '顶会方法拆解', description: '按假设-模块-损失函数拆解论文核心方法', text: '逐段提炼方法假设、模型输入输出与损失函数。', scope: 'research', enabled: true, origin: '内置示例' },
];
let previewAutomationState = { mode: 'record', autoPlain: true, autoQuiz: false };
let previewEvidence = [
  {
    id: 'claim-1',
    text: '分层抽样在类别不平衡的小样本时间序列下能显著降低估计方差',
    links: [
      { id: 'link-1', paper_id: 'p-ready', title: 'Koopman Operator Theory for Control', page: 1, relation: 'support', quote: 'We compare stratified and simple random sampling.', note: '实验第 3 节直接验证', available: true },
    ],
  },
];
let papers = [
  { id: 'p-ready', filename: 'koopman.pdf', title: 'Koopman Operator Theory for Control', author: 'Alexandre Mauroy',
    page_count: 24, status: 'ready', error: null, imported: '2026-11-10T09:00:00.000Z',
    doi: '10.1000/koopman', arxiv_id: '2401.00001', year: 2024, venue: 'IEEE TAC',
    abstract: 'A survey of Koopman operator methods for control.', source_url: '', pdf_url: '',
    favorite: 1, rating: 5, read_status: 'reading', categoryIds: ['c-koopman'] },
  { id: 'p-linked', filename: '', title: 'Deep Learning for Time Series Forecasting', author: 'Bryan Lim',
    page_count: 0, status: 'linked', error: null, imported: '2026-11-11T09:00:00.000Z',
    doi: '10.1000/timeseries', arxiv_id: '', year: 2021, venue: 'IJF',
    abstract: 'We review deep learning architectures for time series forecasting and discuss evaluation pitfalls.',
    source_url: 'https://doi.org/10.1000/timeseries', pdf_url: 'https://example.org/timeseries.pdf',
    favorite: 0, rating: 4, read_status: 'unread', categoryIds: ['c-series'] },
  { id: 'p-third', filename: 'control.pdf', title: 'Data-Driven Nonlinear Stabilization', author: 'Milan Korda',
    page_count: 18, status: 'ready', error: null, imported: '2026-11-12T09:00:00.000Z',
    doi: '10.1000/stabilization', arxiv_id: '', year: 2020, venue: 'Automatica',
    abstract: '', source_url: '', pdf_url: '', favorite: 0, rating: null, read_status: 'done', categoryIds: [] },
];
let categories = [
  { id: 'c-koopman', name: 'Koopman 方法', parentId: null, color: '#5451b0', count: 1 },
  { id: 'c-series', name: '时间序列', parentId: null, color: '#23644f', count: 1 },
  { id: 'c-control', name: '控制', parentId: 'c-koopman', color: '#87511e', count: 0 },
];
const listeners = new Set();
const annotationListeners = new Set();
let annotations = [
  { id: 'a-1', paperId: 'p-ready', kind: 'highlight', page: 1, color: '#f2c94c',
    quote: 'small sample estimation', prefix: 'We study', suffix: 'for time series.',
    rects: [{ x: 0.105, y: 0.072, w: 0.25, h: 0.02 }], note: '', tags: [],
    created: new Date().toISOString(), updated: new Date().toISOString() },
];
let paperNote = { html: '', text: '', updated: null };
let readerLayout = { left: 215, right: 310, leftOpen: true, rightOpen: true };
let notes = [
  { id: 'n-1', title: '小样本估计讨论', html: '<p>分层抽样在类别不平衡时更稳。</p>', text: '分层抽样在类别不平衡时更稳。',
    sourceType: 'idea', sourceId: 'idea-1', tags: ['采样', '方法'], pinned: 1,
    created: '2026-11-10T09:00:00.000Z', updated: '2026-11-12T09:00:00.000Z' },
  { id: 'n-2', title: 'Koopman 谱方法', html: '<p>谱收敛与有限维近似。</p>', text: '谱收敛与有限维近似。',
    sourceType: 'manual', sourceId: '', tags: ['Koopman'], pinned: 0,
    created: '2026-11-11T09:00:00.000Z', updated: '2026-11-11T09:00:00.000Z' },
];
const noteListeners = new Set();
const memoryListeners = new Set();
let criticalInsight = null;
const sourceSettings = {
  github: { id: 'github', label: 'GitHub', endpoint: 'https://api.githubcopilot.com/mcp/x/repos/readonly', tool: 'search_repositories' },
  scholar: { id: 'scholar', label: '学术搜索', endpoint: '', tool: '' },
  web: { id: 'web', label: '网页搜索', endpoint: '', tool: '' },
};
let triage = { type: '实证研究', context: '小样本时间序列估计', correctness: '假设合理', contributions: '分层抽样比较',
  clarity: '结构清楚', decision: 'continue', seconds: 86, updated: null };
let plain = { paper_id: 'p-ready', page: 1, kind: 'plain', supported: 1,
  text: '这一页说明小样本估计在温和假设下是一致的，并比较了分层抽样与简单随机抽样。',
  citations: [{ page: 1, quote: 'small sample estimation' }, { page: 1, quote: 'The estimator is consistent' }],
  created: new Date().toISOString() };
let glossary = [
  { id: 'g-1', paper_id: 'p-ready', term: '一致估计量', definition: '样本量增大时，估计值趋近真实参数。',
    page: 1, quote: 'The estimator is consistent under mild assumptions.', created: '' },
];
let quizCards = [
  { id: 'q-1', paper_id: 'p-ready', question: '这篇论文研究的核心问题是什么？',
    answer: '小样本时间序列估计，并比较分层抽样与简单随机抽样。', source_page: 1,
    source_quote: 'We study small sample estimation for time series.', due: new Date().toISOString(),
    interval: 0, ease: 2.5, reviews: 0 },
];
let memorySuggestions = [
  { id: 's-1', text: '长期关注小样本区间估计', kind: 'direction', evidence: '我希望先看反例，再讨论支持证据。',
    idea_id: 'idea-1', confidence: 0.9, status: 'pending', created: '', updated: '' },
  { id: 's-2', text: '偏好先读原文再看摘要', kind: 'habit', evidence: '摘要证据不足时先定位正文。',
    idea_id: 'idea-1', confidence: 0.75, status: 'accepted', created: '', updated: '' },
];
let automationJobs = [
  { id: 'j-1', kind: 'paper-plain', subject_type: 'paper', subject_id: 'p-ready', title: '生成《Koopman Operator Theory for Control》的白话摘要', status: 'waiting', stage: '等待你确认', mode: 'record', attempts: 1, requires_attention: 1, result: {}, error: null, created: new Date().toISOString() },
  { id: 'j-2', kind: 'paper-quiz', subject_type: 'paper', subject_id: 'p-linked', title: '为《Deep Learning for Time Series Forecasting》生成自测题', status: 'ended', stage: '已完成', mode: 'act', attempts: 1, requires_attention: 0, result: { ok: true }, error: null, created: new Date().toISOString() },
];
let memoryEntries = [
  { id: 'm-1', text: '长期关注小样本区间估计', reason: '讨论', idea_id: 'idea-1', status: 'active',
    created: new Date().toISOString(), kind: 'direction', strength: 1.8, hits: 4, last_seen: new Date().toISOString(),
    pinned: 1, merged_from: [] },
  { id: 'm-2', text: '偏好先读原文再看摘要', reason: '讨论', idea_id: 'idea-1', status: 'active',
    created: new Date().toISOString(), kind: 'habit', strength: 1.2, hits: 2, last_seen: new Date().toISOString(),
    pinned: 0, merged_from: [] },
  { id: 'm-3', text: '小样本估计需要报告置信区间', reason: '讨论', idea_id: 'idea-1', status: 'active',
    created: new Date().toISOString(), kind: 'method', strength: 1, hits: 1, last_seen: new Date().toISOString(),
    pinned: 0, merged_from: [] },
];
const notify = () => { for (const callback of listeners) callback(); };
const notifyAnnotations = () => { for (const callback of annotationListeners) callback('p-ready'); };
const notifyNotes = () => { for (const callback of noteListeners) callback(); };
const notifyMemory = () => { for (const callback of memoryListeners) callback(); };
const wait = value => new Promise(resolve => setTimeout(() => resolve(value), 600));
const searchResults = [
  { id: 'doi:10.1000/koopman', title: 'Koopman Operator Theory for Control', authors: ['Alexandre Mauroy', 'Igor Mezić'],
    year: 2024, venue: 'IEEE Transactions on Automatic Control', doi: '10.1000/koopman', arxiv: '2401.00001',
    abstract: 'We review Koopman operator methods and their use in data-driven control, with an emphasis on finite-dimensional approximations and spectral convergence.',
    url: 'https://doi.org/10.1000/koopman', pdfUrl: 'https://arxiv.org/pdf/2401.00001', source: 'arXiv',
    sources: ['Crossref', 'arXiv'], citationCount: 42, openAccess: true },
  { id: 'doi:10.1000/timeseries', title: 'Deep Learning for Time Series Forecasting: A Survey', authors: ['Bryan Lim', 'Stefan Zohren'],
    year: 2021, venue: 'International Journal of Forecasting', doi: '10.1000/timeseries', arxiv: '',
    abstract: 'A survey of deep learning architectures for time series forecasting, including evaluation protocols and common pitfalls.',
    url: 'https://doi.org/10.1000/timeseries', pdfUrl: '', source: 'OpenAlex', sources: ['OpenAlex', 'Crossref'],
    citationCount: 218, openAccess: false },
  { id: 'url:https://example.org/blog/koopman', title: 'Understanding Koopman operators without the jargon',
    authors: [], year: null, venue: 'example.org', doi: '', arxiv: '',
    abstract: 'A blog post that builds intuition for Koopman operators with small examples.',
    url: 'https://example.org/blog/koopman', pdfUrl: '', source: '网页', sources: ['网页'],
    citationCount: null, openAccess: false },
];

window.recorder = {
  listPapers: async () => papers,
  onPapersChanged: callback => { listeners.add(callback); return () => listeners.delete(callback); },
  listPaperCategories: async () => categories,
  savePaperCategory: async input => {
    if (input.id) categories = categories.map(row => row.id === input.id ? { ...row, name: input.name, color: input.color } : row);
    else categories = [...categories, { id: 'c-' + Date.now(), name: input.name, parentId: input.parentId || null,
      color: input.color || '#8b5cf6', count: 0 }];
    notify();
    return categories;
  },
  removePaperCategory: async id => {
    categories = categories.filter(row => row.id !== id);
    papers = papers.map(row => ({ ...row, categoryIds: (row.categoryIds || []).filter(item => item !== id) }));
    notify();
    return categories;
  },
  assignPaperCategory: async (paperId, categoryId, assigned) => {
    papers = papers.map(row => {
      if (row.id !== paperId) return row;
      const ids = new Set(row.categoryIds || []);
      if (assigned) ids.add(categoryId); else ids.delete(categoryId);
      return { ...row, categoryIds: [...ids] };
    });
    notify();
  },
  setPaperFavorite: async (id, value) => {
    papers = papers.map(row => row.id === id ? { ...row, favorite: value ? 1 : 0 } : row); notify();
  },
  setPaperRating: async (id, value) => {
    papers = papers.map(row => row.id === id ? { ...row, rating: value } : row); notify();
  },
  setPaperReadStatus: async (id, value) => {
    papers = papers.map(row => row.id === id ? { ...row, read_status: value } : row); notify();
  },
  getPaperRatingConfig: async () => ({ hasEasyScholar: false }),
  savePaperRatingConfig: async () => {},
  getJournalRating: async () => ({ venue: 'IEEE TAC',
    entries: [{ key: 'sci', value: 'Q1' }, { key: 'sciif', value: '8.2' }],
    label: 'sci Q1 · sciif 8.2', fetchedAt: new Date().toISOString() }),
  classifyPaper: async () => wait({ categories: ['Koopman 方法', '时间序列', '新方向：谱方法'] }),
  importPapers: async () => ({ added: 0, duplicates: 0, errors: [] }),
  getPaperSearchConfig: async () => ({ sources: ['crossref', 'arxiv', 'openalex', 'semantic', 'europepmc', 'web'] }),
  savePaperSearchConfig: async () => {},
  searchPapers: async () => {
    await wait();
    return {
      requestId: 'preview',
      results: searchResults,
      sources: [
        { id: 'crossref', label: 'Crossref', status: 'ok', count: 3 },
        { id: 'arxiv', label: 'arXiv', status: 'ok', count: 1 },
        { id: 'openalex', label: 'OpenAlex', status: 'ok', count: 2 },
        { id: 'semantic', label: 'Semantic Scholar', status: 'error', count: 0, message: '预览模式：模拟限流' },
        { id: 'europepmc', label: 'Europe PMC', status: 'empty', count: 0 },
        { id: 'web', label: '网页', status: 'ok', count: 1 },
      ],
    };
  },
  cancelPaperSearch: async () => {},
  importSearchResult: async input => {
    const result = input?.result || {};
    const id = 'imported-' + papers.length;
    papers = [{ id, filename: '', title: result.title || '未命名', author: (result.authors || []).join(', '),
      page_count: 0, status: 'linked', error: null, imported: new Date().toISOString(),
      doi: result.doi || '', arxiv_id: result.arxiv || '', year: result.year || null, venue: result.venue || '',
      abstract: result.abstract || '', source_url: result.url || '', pdf_url: result.pdfUrl || '',
      favorite: 0, rating: null, read_status: 'unread', categoryIds: [] }, ...papers];
    notify();
    return { paperId: id, downloaded: false, reason: '预览模式：已收入论文信息。' };
  },
  getPaperCitations: async () => {
    await wait();
    const now = new Date().toISOString();
    return {
      references: [
        { key: 'doi:10.1000/ref-a', title: 'Spectral Convergence of Koopman Approximations', author: 'Igor Mezić',
          year: 2019, venue: 'Nonlinear Dynamics', doi: '10.1000/ref-a', url: 'https://doi.org/10.1000/ref-a',
          pdfUrl: '', abstract: '', citationCount: 87, source: 'OpenAlex', inLibraryId: 'p-ready', sharedBy: 0 },
        { key: 'doi:10.1000/ref-b', title: 'Data-Driven Control via Koopman Operators', author: 'Milan Korda',
          year: 2020, venue: 'Automatica', doi: '10.1000/ref-b', url: 'https://doi.org/10.1000/ref-b',
          pdfUrl: 'https://example.org/ref-b.pdf', abstract: '', citationCount: 132, source: 'OpenAlex',
          inLibraryId: 'p-third', sharedBy: 1 },
        { key: 'doi:10.1000/ref-c', title: 'A Finite-Dimensional Approximation Perspective', author: 'Clarence Rowley',
          year: 2017, venue: 'Journal of Nonlinear Science', doi: '10.1000/ref-c', url: '', pdfUrl: '',
          abstract: '', citationCount: 240, source: 'OpenAlex', inLibraryId: '', sharedBy: 2 },
      ],
      citations: [
        { key: 'doi:10.1000/cite-a', title: 'Koopman-Based Model Predictive Control', author: 'Milan Korda',
          year: 2025, venue: 'IEEE TAC', doi: '10.1000/cite-a', url: 'https://doi.org/10.1000/cite-a',
          pdfUrl: '', abstract: '', citationCount: 6, source: 'OpenAlex', inLibraryId: '', sharedBy: 0 },
      ],
      meta: { referenceAt: now, citationAt: now, referenceSource: 'OpenAlex', citationSource: 'OpenAlex',
        referenceError: '', citationError: '' },
    };
  },
  comparePapers: async (ids, options = {}) => {
    await wait();
    const selected = ids.map(id => papers.find(paper => paper.id === id)).filter(Boolean);
    const metadata = [
      ['年份', paper => paper.year ? String(paper.year) : '—'],
      ['出处', paper => paper.venue || '—'],
      ['作者', paper => paper.author || '—'],
      ['你的评分', paper => paper.rating ? '★'.repeat(paper.rating) : '未评分'],
      ['阅读状态', paper => ({ unread: '未读', reading: '在读', done: '已读' })[paper.read_status] || '未读'],
      ['被引次数', paper => paper.id === 'p-ready' ? '42' : paper.id === 'p-linked' ? '218' : '—'],
    ].map(([label, map]) => ({ label, values: selected.map(map) }));
    const base = { paperIds: ids, metadata,
      papers: selected.map(paper => ({ id: paper.id, title: paper.title, year: paper.year })) };
    if (options.generate !== true) {
      return { ...base, rows: [], generated: false, model: '', updated: null,
        notice: '先看元数据对比；接入 Agent 后可补全问题、方法、结论与局限。' };
    }
    return { ...base, generated: true, model: 'preview', updated: new Date().toISOString(), notice: '',
      rows: [
        { label: '研究问题', values: selected.map((paper, index) => index === 0 ? 'Koopman 算子在非线性控制中的线性化误差' : index === 1 ? '深度模型在时间序列预测中的评估偏差' : '数据驱动非线性系统的闭环镇定保障') },
        { label: '方法', values: selected.map((paper, index) => index === 0 ? 'EDMD 与分层抽样结合' : index === 1 ? '架构综述与基准复现' : '凸优化 lifted MPC 镇定') },
        { label: '数据与场景', values: selected.map((paper, index) => index === 0 ? '仿真非线性动力系统' : index === 1 ? '公开多变量预测基准' : '受扰非线性控制基准') },
        { label: '主要结论', values: selected.map((paper, index) => index === 0 ? '分层抽样显著降低算子方差' : index === 1 ? '评估协议差异会放大结论' : '有限维逼近满足局部指数稳定') },
        { label: '局限与争议', values: selected.map((paper, index) => index === 0 ? '缺乏高维真实物理平台验证' : index === 1 ? '未覆盖最新基础模型' : '对强时变干扰的鲁棒界仍较保守') },
      ] };
  },
  listAnnotations: async () => annotations,
  saveAnnotation: async input => {
    const now = new Date().toISOString();
    const row = { id: input.id || 'a-' + Date.now(), created: now, updated: now, ...input };
    annotations = input.id ? annotations.map(item => item.id === input.id ? row : item) : [...annotations, row];
    notifyAnnotations();
    return row;
  },
  removeAnnotation: async id => {
    annotations = annotations.filter(item => item.id !== id);
    notifyAnnotations();
    return true;
  },
  onAnnotationsChanged: callback => { annotationListeners.add(callback); return () => annotationListeners.delete(callback); },
  listNotes: async () => notes,
  getNote: async id => notes.find(note => note.id === id) || null,
  saveNote: async input => {
    const now = new Date().toISOString();
    const row = input.id
      ? { ...notes.find(note => note.id === input.id), ...input, updated: now }
      : { id: 'n-' + Date.now(), created: now, updated: now, tags: [], pinned: 0, ...input };
    notes = input.id ? notes.map(note => note.id === input.id ? row : note) : [row, ...notes];
    notifyNotes();
    return row;
  },
  removeNote: async id => { notes = notes.filter(note => note.id !== id); notifyNotes(); return true; },
  pinNote: async (id, pinned) => {
    notes = notes.map(note => note.id === id ? { ...note, pinned: pinned ? 1 : 0 } : note);
    notifyNotes();
  },
  getIdeaNote: async ideaId => notes.find(note => note.sourceType === 'idea' && note.sourceId === ideaId) || {
    id: 'n-idea', title: '讨论记录本', html: '', text: '', sourceType: 'idea', sourceId: ideaId,
    tags: [], pinned: 0, created: new Date().toISOString(), updated: null },
  saveIdeaNote: async (ideaId, value) => {
    const existing = notes.find(note => note.sourceType === 'idea' && note.sourceId === ideaId);
    const now = new Date().toISOString();
    const row = existing
      ? { ...existing, ...value, updated: now }
      : { id: 'n-' + Date.now(), title: '讨论记录本', ...value, sourceType: 'idea', sourceId: ideaId,
        tags: [], pinned: 0, created: now, updated: now };
    notes = existing ? notes.map(note => note.id === existing.id ? row : note) : [row, ...notes];
    notifyNotes();
    return row;
  },
  onNotesChanged: callback => { noteListeners.add(callback); return () => noteListeners.delete(callback); },
  getResearchProfile: async () => previewResearchProfile,
  saveResearchSection: async change => {
    const now = new Date().toISOString();
    const key = change?.section;
    if ((key === 'soul' || key === 'memory') && typeof change?.text === 'string') {
      const prev = previewResearchProfile[key];
      previewResearchProfile = {
        ...previewResearchProfile,
        [key]: {
          text: change.text,
          revision: (prev?.revision || 0) + 1,
          savedAt: now,
          history: [{ revision: (prev?.revision || 0) + 1, text: prev?.text || '', savedAt: prev?.savedAt || now }, ...(prev?.history || [])].slice(0, 8),
        },
      };
    }
    return previewResearchProfile;
  },
  listMemoryEntries: async () => memoryEntries,
  pinMemory: async (id, pinned) => { memoryEntries = memoryEntries.map(row => row.id === id ? { ...row, pinned: pinned ? 1 : 0 } : row); return memoryEntries; },
  previewMemoryConsolidation: async () => ({ groups: [{ ids: ['m-1', 'm-2'], text: '长期关注小样本区间估计，并先读原文再看摘要', kind: 'direction' }], before: 3, after: 2 }),
  applyMemoryConsolidation: async () => { memoryEntries = memoryEntries.filter(row => !['m-1', 'm-2'].includes(row.id)); memoryEntries = [{ id: 'm-merged', text: '长期关注小样本区间估计，并先读原文再看摘要', reason: 'Agent 整理：合并重复记忆', idea_id: 'idea-1', status: 'active', created: new Date().toISOString(), kind: 'direction', strength: 2, hits: 6, last_seen: new Date().toISOString(), pinned: 0, merged_from: ['m-1', 'm-2'] }, ...memoryEntries]; return memoryEntries; },
  listLearnedResearch: async () => [],
  changeMemoryEntry: async () => memoryEntries,
  approveObservation: async () => {},
  listMemorySummaries: async () => memorySuggestions,
  getMemoryAuto: async () => true,
  setMemoryAuto: async () => true,
  decideMemorySuggestion: async (id, action) => {
    memorySuggestions = memorySuggestions.map(item => item.id === id
      ? { ...item, status: action === 'accept' ? 'accepted' : 'ignored' } : item);
    notifyMemory();
    return memorySuggestions.find(item => item.id === id);
  },
  onMemoryChanged: callback => { memoryListeners.add(callback); return () => memoryListeners.delete(callback); },
  getAutomation: async () => ({
    ...previewAutomationState,
    attention: automationJobs.filter(job => job.status === 'waiting').length,
    jobs: automationJobs,
  }),
  saveAutomation: async input => {
    previewAutomationState = {
      mode: input?.mode || previewAutomationState.mode,
      autoPlain: input?.autoPlain !== undefined ? Boolean(input.autoPlain) : previewAutomationState.autoPlain,
      autoQuiz: input?.autoQuiz !== undefined ? Boolean(input.autoQuiz) : previewAutomationState.autoQuiz,
    };
    return {
      ...previewAutomationState,
      attention: automationJobs.filter(job => job.status === 'waiting').length,
      jobs: automationJobs,
    };
  },
  scanAutomation: async () => ({
    ...previewAutomationState,
    attention: automationJobs.filter(job => job.status === 'waiting').length,
    jobs: automationJobs,
  }),
  approveAutomation: async id => {
    automationJobs = automationJobs.map(job => job.id === id ? { ...job, status: 'running', stage: '正在执行' } : job);
    return automationJobs.find(job => job.id === id);
  },
  retryAutomation: async id => automationJobs.find(job => job.id === id),
  dismissAutomation: async id => { automationJobs = automationJobs.map(job => job.id === id ? { ...job, status: 'ended', stage: '已忽略' } : job); return automationJobs.find(job => job.id === id); },
  onAutomationChanged: () => () => {},
  onResearchWorkChanged: () => () => {},
  getPaperNote: async () => paperNote,
  savePaperNote: async (paperId, value) => {
    paperNote = { html: value.html, text: value.text, updated: new Date().toISOString() };
    return paperNote;
  },
  getReaderLayout: async () => readerLayout,
  saveReaderLayout: async value => { readerLayout = { ...readerLayout, ...value }; return readerLayout; },
  getTriage: async () => triage,
  saveTriage: async (paperId, value) => { triage = { ...triage, ...value }; return triage; },
  getPlain: async () => plain,
  getInsight: async (paperId, page, kind) => kind === 'critical' ? criticalInsight : null,
  saveInsight: async input => { if (input.kind === 'critical') criticalInsight = input; return input; },
  generatePlain: async () => plain,
  listGlossary: async () => glossary,
  defineGlossary: async input => {
    const row = { id: 'g-' + Date.now(), paper_id: input.paperId, term: input.term,
      definition: '预览模式生成的术语释义。', page: input.page || 1,
      quote: 'The estimator is consistent under mild assumptions.', created: new Date().toISOString() };
    glossary = [row, ...glossary];
    return row;
  },
  removeGlossary: async id => { glossary = glossary.filter(item => item.id !== id); return true; },
  listQuiz: async () => quizCards,
  generateQuiz: async () => quizCards,
  reviewQuiz: async (id, rating) => {
    quizCards = quizCards.map(card => card.id === id ? { ...card, due: new Date(Date.now() + 86400000).toISOString(),
      interval: 1, reviews: card.reviews + 1 } : card);
    return quizCards.find(card => card.id === id);
  },
  openSourceLink: async url => { console.info('[预览] 打开链接', url); },
  listSources: async () => Object.values(sourceSettings).map(source => ({ queryField: '', ...source })),
  saveSource: async (id, { endpoint, tool, queryField, token, clearToken }) => {
    const source = sourceSettings[id];
    const hasToken = Boolean(token || (source.endpoint === endpoint && !clearToken && source.hasToken));
    Object.assign(source, { endpoint, tool, queryField, configured: true, hasToken });
  },
  runSource: async (id, query, mode) => {
    const source = sourceSettings[id];
    if (!query) return { tool: source.tool, queryField: source.queryField || 'query' };
    const entries = id === 'github'
      ? [{ title: 'matplotlib/matplotlib', url: 'https://github.com/matplotlib/matplotlib', description: '预览示例 · 科研绘图工具' }]
      : searchResults.filter(item => id === 'web' ? item.source === '网页' : item.source !== '网页')
        .map(item => ({ title: item.title, url: item.url, description: item.abstract }));
    return { entries, text: '', source: mode === 'mcp' ? source.label + ' · MCP' : source.label };
  },
  openSourceSearch: async (id, query) => { console.info('[预览] 在浏览器搜索', id, query); },
  openScholar: async query => { console.info('[预览] Google Scholar', query); },
  readPaperPdf: async () => {
    const response = await fetch('/preview-sample.pdf');
    return new Uint8Array(await response.arrayBuffer());
  },
  readPdfAsset: async () => new Uint8Array(0),
  getPaperPage: async (id, page) => ({ page, text: 'We study small sample estimation for time series. The estimator is consistent under mild assumptions.\n\nWe compare stratified and simple random sampling. Koopman operators provide a linear representation.' }),
  translatePaper: async input => {
    const key = `${input?.id || 'p'}:${input?.page || 1}`;
    if (input?.lookup) return translatedPages.get(key) || null;
    if (input?.selection) return '所选片段译文：我们对比了分层抽样与简单随机抽样在小样本条件下的方差表现。';
    const text = '我们研究时间序列的小样本估计问题。在温和的正则性假设下，所提出的估计量具有一致性与渐近无偏性。\n\n进一步地，我们对比了分层抽样与简单随机抽样在类别不平衡场景下的估计方差；实验表明 Koopman 算子能够为非线性动力学提供稳定的线性表示。';
    translatedPages.set(key, text);
    return text;
  },
  stopPaperTranslation: async () => {},
  onAppearance: callback => { appearanceListeners.add(callback); return () => appearanceListeners.delete(callback); },
  getAppearance: async () => previewAppearance,
};

const appearanceListeners = new Set();
let previewAppearance = {
  mode: 'light', light: 'light', dark: 'graphite',
  palette: 'light', accent: 'iris', typeface: 'studio', fontSize: 14, bold: false,
};
const ideaListeners = new Set();
const notifyIdeas = nextId => { for (const cb of ideaListeners) cb(nextId); };
let previewStudioProjects = [
  {
    id: 'proj-koopman',
    title: 'Koopman 小样本实验图与汇报',
    archived: 0,
    versions: [],
    draft: { type: 'figure', pictureType: 'data', ideaId: 'idea-1', figure: { kind: 'line', title: '小样本采样策略方差对比', data: '样本量,分层抽样,随机抽样\n20,0.18,0.34\n50,0.11,0.23\n100,0.07,0.16' } },
  },
];

/* 全量预览（preview-app.html）所需的只读桩与示例数据 */
const previewIdeas = [
  {
    id: 'idea-1', body: '试试把这篇的采样策略用在小样本分类',
    excerpt: 'We study small sample estimation for time series.\nThe estimator is consistent under mild assumptions.\nWe compare stratified and simple random sampling.',
    paper: 'Koopman Operator Theory for Control', page: '3',
    created: '2026-11-10T09:00:00.000Z', updated: '2026-11-12T09:00:00.000Z', status: 'idle', provider: 'codex',
    discussion: [
      { question: '你想先借用这篇工作的哪一部分？',
        options: ['挑哪些样本', '每类分多少样本', '两者都想试', '还没想清楚'],
        answer: null, activity: null },
    ],
  },
  {
    id: 'idea-2', body: 'Koopman 算子的谱收敛性质在时间序列预测里是否可验证？',
    excerpt: '', paper: '', page: '',
    created: '2026-11-11T09:00:00.000Z', updated: '2026-11-12T10:00:00.000Z', status: 'ready', provider: 'codex',
    discussion: [
      { message: 'Koopman 算子的谱收敛性质在时间序列预测里是否可验证？' },
      { question: '你希望把验证重点放在哪一项？',
        options: ['谱收敛速度', '有限维近似的误差界', '与实际预测精度的对应'],
        answer: { options: ['有限维近似的误差界'], note: '先看有限维近似的误差界，再讨论收敛速度。', skipped: false },
        activity: { context: '第 1 轮 · 4 条记忆', skills: [], checks: ['格式校验通过'], elapsed: '3.2s' } },
    ],
  },
  {
    id: 'idea-3', body: '分层抽样和简单随机抽样在类别不平衡时的方差差异', excerpt: '', paper: '', page: '',
    created: '2026-11-12T09:00:00.000Z', updated: '2026-11-12T09:00:00.000Z', status: 'idle', provider: '',
    discussion: [],
  },
];
const previewStubs = {
  list: async () => previewIdeas.map(item => ({ ...item })),
  checkRelease: async () => ({ current: '0.1.5', latest: '0.1.5', available: false, status: 'current' }),
  clearReleaseSource: async () => {},
  getSettings: async () => ({
    appVersion: '0.1.0-beta',
    provider: 'codex', automaticResearch: true, researchNotifications: true, dataFolder: 'C:\预览',
    sidebarWidth: 242, libraryView: 'cards', shortcut: 'Ctrl+Shift+Space', voiceShortcut: 'Ctrl+Shift+Alt+Space',
    shortcutChoice: 'Ctrl+Shift+Space', shortcuts: { 'Ctrl+Shift+Space': 'Ctrl+Shift+Space' },
    entries: [
      { id: 'codex', label: 'Codex', installed: true, base: '', model: 'gpt-5', hasKey: false, test: { ok: true, message: '预览：已连接' } },
      { id: 'claude', label: 'Claude Code', installed: true, base: '', model: 'sonnet', hasKey: false, test: null },
      { id: 'kimi', label: 'Kimi Code', installed: false, base: '', model: '', hasKey: false, test: null },
      { id: 'openai', label: 'OpenAI', api: true, preset: true, installed: false, base: 'https://api.openai.com/v1', model: 'gpt-4o', hasKey: false, test: null },
      { id: 'anthropic', label: 'Anthropic Claude', api: true, preset: true, installed: false, base: 'https://api.anthropic.com', model: 'claude-sonnet-4-5', hasKey: false, test: null },
      { id: 'gemini', label: 'Google Gemini', api: true, preset: true, installed: false, base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash', hasKey: false, test: null },
      { id: 'xai', label: 'xAI Grok', api: true, preset: true, installed: false, base: 'https://api.x.ai/v1', model: 'grok-3-mini', hasKey: false, test: null },
      { id: 'mistral', label: 'Mistral AI', api: true, preset: true, installed: false, base: 'https://api.mistral.ai/v1', model: 'mistral-large-latest', hasKey: false, test: null },
      { id: 'groq', label: 'Groq', api: true, preset: true, installed: false, base: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', hasKey: false, test: null },
      { id: 'together', label: 'Together AI', api: true, preset: true, installed: false, base: 'https://api.together.xyz/v1', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', hasKey: false, test: null },
      { id: 'perplexity', label: 'Perplexity', api: true, preset: true, installed: false, base: 'https://api.perplexity.ai', model: 'sonar-pro', hasKey: false, test: null },
      { id: 'openrouter', label: 'OpenRouter', api: true, preset: true, installed: false, base: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o', hasKey: false, test: null },
      { id: 'deepseek', label: 'DeepSeek', api: true, preset: true, installed: false, base: 'https://api.deepseek.com/v1', model: 'deepseek-chat', hasKey: false, test: null },
      { id: 'kimi-api', label: 'Kimi / Moonshot', api: true, preset: true, installed: false, base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', hasKey: false, test: null },
      { id: 'qwen', label: '通义千问 Qwen', api: true, preset: true, installed: false, base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', hasKey: false, test: null },
      { id: 'zhipu', label: '智谱 GLM', api: true, preset: true, installed: false, base: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-plus', hasKey: false, test: null },
      { id: 'doubao', label: '豆包 / 火山方舟', api: true, preset: true, installed: false, base: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-pro-32k', hasKey: false, test: null },
      { id: 'minimax', label: 'MiniMax', api: true, preset: true, installed: false, base: 'https://api.minimax.chat/v1', model: 'MiniMax-Text-01', hasKey: false, test: null },
      { id: 'siliconflow', label: 'SiliconFlow', api: true, preset: true, installed: false, base: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3', hasKey: false, test: null },
      { id: 'stepfun', label: '阶跃星辰 StepFun', api: true, preset: true, installed: false, base: 'https://api.stepfun.com/v1', model: 'step-2-16k', hasKey: false, test: null },
      { id: 'yi', label: '零一万物 Yi', api: true, preset: true, installed: false, base: 'https://api.lingyiwanwu.com/v1', model: 'yi-lightning', hasKey: false, test: null },
      { id: 'qianfan', label: '百度千帆', api: true, preset: true, installed: false, base: 'https://qianfan.baidubce.com/v2', model: 'ernie-4.5-turbo-32k', hasKey: false, test: null },
      { id: 'spark', label: '讯飞星火', api: true, preset: true, installed: false, base: 'https://spark-api-open.xf-yun.com/v1', model: '4.0Ultra', hasKey: false, test: null },
      { id: 'custom-anthropic', label: '自定义 Anthropic 兼容', api: true, preset: false, installed: false, base: 'https://api.anthropic.com', model: 'claude-sonnet-4-5', hasKey: false, test: null },
      { id: 'custom', label: '自定义兼容 API', api: true, preset: false, installed: false, base: '', model: '', hasKey: false, test: null },
    ],
  }),
  getNotebook: async () => ({ html: '', text: '', updated: null }),
  getIdeaNote: async () => ({ html: '', text: '', updated: null }),
  saveNotebook: async () => {},
  saveIdeaNote: async () => {},
  getBrandIcon: async () => '',
  takeCaptureRequest: async () => null,
  onChanged: callback => { ideaListeners.add(callback); return () => ideaListeners.delete(callback); },
  onCaptureRequest: () => () => {},
  onOpenResearchWork: () => () => {},
  onAgentDiagnostic: () => () => {},
  onWindowVisibility: () => () => {},
  getWindowVisibility: async () => true,
  onStudioChanged: () => () => {},
  listResearchWork: async () => [],
  listIdeaRelations: async () => [],
  researchDashboard: async () => [],
  listEvidence: async () => previewEvidence,
  changeEvidence: async (_ideaId, input) => {
    if (input?.action === 'create' && input.text) {
      previewEvidence = [{ id: 'claim-' + Date.now(), text: input.text, links: [] }, ...previewEvidence];
    } else if (input?.action === 'delete' && input.claimId) {
      previewEvidence = previewEvidence.filter(item => item.id !== input.claimId);
    }
    return previewEvidence;
  },
  listStudioProjects: async () => ({ projects: previewStudioProjects, generating: '' }),
  getStudioSettings: async () => ({ provider: 'codex', figureAgent: 'Codex CLI', imageMode: 'diagram', skills: [], figures: [] }),
  getStudioProject: async id => previewStudioProjects.find(item => item.id === id) || previewStudioProjects[0] || null,
  getStudioArtifact: async () => null,
  saveStudioDraft: async (id, draft) => {
    previewStudioProjects = previewStudioProjects.map(item => item.id === id ? { ...item, draft: { ...item.draft, ...draft } } : item);
    return true;
  },
  createStudioProject: async input => {
    const id = 'proj-' + Date.now();
    previewStudioProjects = [{ id, title: input?.title || '新建项目', archived: 0, versions: [], draft: { type: 'figure', pictureType: 'data', ideaId: input?.ideaId || '', figure: {} } }, ...previewStudioProjects];
    return id;
  },
  renameStudioProject: async (id, title) => {
    previewStudioProjects = previewStudioProjects.map(item => item.id === id ? { ...item, title } : item);
    return null;
  },
  removeStudioProject: async id => {
    previewStudioProjects = previewStudioProjects.filter(item => item.id !== id);
    return { projects: previewStudioProjects, generating: '' };
  },
  archiveStudioProject: async (id, archived) => {
    previewStudioProjects = previewStudioProjects.map(item => item.id === id ? { ...item, archived: archived ? 1 : 0 } : item);
    return null;
  },
  generateStudio: async () => null,
  cancelStudio: async () => {},
  exportStudio: async () => null,
  reviewStudioFigure: async () => null,
  splitStudioFlow: async () => ['采集材料', '检查质量', '汇总结果'],
  flowAssembly: async (projectId, input) => {
    const op = input?.operation || 'read';
    if (op === 'read') return { flow: previewFlowState };
    const project = previewStudioProjects.find(item => item.id === projectId) || previewStudioProjects[0];
    const draft = project?.draft || {};
    const rawText = ((input?.description ?? draft.flowPrompt) || '').trim();
    const stepText = ((input?.steps ?? draft.flowFigure?.data) || '').trim();
    const parsedLabels = (stepText || rawText)
      .split(/\s*(?:->|→|\n)+\s*/)
      .map(s => s.replace(/^.*?(?:Stage\s*\d+|第\s*\d+\s*阶段)[:：\s-]*/i, '').trim())
      .filter(Boolean)
      .slice(0, 5);
    const stageLabels = parsedLabels.length >= 2 ? parsedLabels : ['数据采集与清洗', '特征提取与建模', '评估与可视化'];
    const svgW = Math.max(640, stageLabels.length * 205 + 30);
    const sampleSvg = 'data:image/svg+xml;utf8,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="220" viewBox="0 0 ${svgW} 220"><rect width="${svgW}" height="220" fill="#ffffff"/>` +
      stageLabels.map((lbl, idx) => {
        const x = 30 + idx * 200;
        const short = lbl.length > 22 ? lbl.slice(0, 21) + '…' : lbl;
        const arrow = idx < stageLabels.length - 1 ? `<path d="M${x + 170} 106h30" stroke="#2563eb" stroke-width="1.8"/>` : '';
        return `<rect x="${x}" y="68" width="170" height="76" rx="8" fill="#eef4ff" stroke="#2563eb"/><text x="${x + 85}" y="110" text-anchor="middle" font-size="12" fill="#171717">${idx + 1}. ${short.replace(/[<>&]/g, '')}</text>${arrow}`;
      }).join('') +
      '</svg>'
    );
    if (op === 'framework') {
      previewFlowState = {
        id: 'flow-' + Date.now(),
        confirmed: false,
        origin: {
          description: rawText.slice(0, 3000),
          steps: stepText.slice(0, 3000),
        },
        frameworkImage: sampleSvg,
        blocks: stageLabels.map((label, index) => ({ index, label, status: 'pending', candidate: null, material: null })),
        materials: stageLabels.map(() => null),
        edges: stageLabels.slice(0, -1).map((_, i) => ({ from: i, to: i + 1, label: '阶段推进' })),
        layout: null,
      };
      return { flow: previewFlowState };
    }
    if (op === 'confirm' && previewFlowState) {
      previewFlowState = { ...previewFlowState, confirmed: true };
      return { flow: previewFlowState };
    }
    if (op === 'material' && previewFlowState) {
      const idx = input?.index ?? input?.block ?? 0;
      const cand = { id: 'cand-' + idx, index: idx, kind: input?.kind || 'agent', data: sampleSvg, attempt: 1, revision: input?.revision || '' };
      previewFlowState = { ...previewFlowState, candidate: cand };
      return { flow: previewFlowState };
    }
    if (op === 'approve' && previewFlowState) {
      const idx = input?.index ?? input?.block ?? previewFlowState.candidate?.index ?? 0;
      const cand = previewFlowState.candidate || { id: 'mat-' + idx, kind: 'agent', data: sampleSvg };
      const mat = { id: cand.id, kind: cand.kind || 'agent', data: cand.data };
      const blocks = previewFlowState.blocks.map((b, i) => i === idx ? { ...b, status: 'approved' } : b);
      const materials = (previewFlowState.materials || []).map((m, i) => i === idx ? mat : m);
      previewFlowState = { ...previewFlowState, blocks, materials, candidate: null };
      return { flow: previewFlowState };
    }
    if (op === 'layout' && previewFlowState) {
      previewFlowState = { ...previewFlowState, layout: { id: 'layout-' + Date.now(), image: sampleSvg, saved: false } };
      return { flow: previewFlowState };
    }
    if (op === 'save' && previewFlowState?.layout) {
      previewFlowState = { ...previewFlowState, layout: { ...previewFlowState.layout, saved: true } };
      return { flow: previewFlowState };
    }
    return { flow: previewFlowState };
  },
  onFlowProgress: () => () => {},
  configureStudio: async () => {},
  listImageModels: async () => [],
  listSkills: async () => previewSkills,
  saveSkill: async change => {
    const id = change?.id || 'sk-' + Date.now();
    const row = { ...change, id, scope: change?.scope || 'research', enabled: Boolean(change?.enabled) };
    const exists = previewSkills.some(item => item.id === id);
    previewSkills = exists ? previewSkills.map(item => item.id === id ? row : item) : [row, ...previewSkills];
    return previewSkills;
  },
  deleteSkill: async id => { previewSkills = previewSkills.filter(item => item.id !== id); return previewSkills; },
  removeSkill: async id => { previewSkills = previewSkills.filter(item => item.id !== id); return previewSkills; },
  importSkill: async () => ({ name: '导入示例技能', description: '从 SKILL.md 导入', text: '按学术规范核验文献引文。', enabled: true, origin: 'SKILL.md' }),
  findSkills: async () => [],
  startResearchWork: async (id, kind, question, parentId) => {
    const idx = previewWorkRows.findIndex(row => row.id === parentId || (row.idea_id === id && row.status === 'waiting'));
    if (idx >= 0) {
      previewWorkRows[idx] = {
        ...previewWorkRows[idx],
        status: 'running',
        stage: 'search',
        question: question || previewWorkRows[idx].question,
        attention: null,
        workStage: { stage: 'working' },
        progress: { stage: 'search', paperCount: 1, attention: null, result: null },
      };
      return previewWorkRows[idx];
    }
    const job = {
      id: 'work-' + Date.now(), idea_id: id, kind: kind || 'deep', status: 'running', provider: 'codex', error: null,
      created: new Date().toISOString(), requested_at: new Date().toISOString(), manual: true,
      question: question || '深度核查关键证据', stage: 'search', paper_count: 1,
      attention: null, workStage: { stage: 'working' }, canRetry: false,
      progress: { stage: 'search', paperCount: 1, attention: null, result: null },
    };
    previewWorkRows.unshift(job);
    return job;
  },
  listApiModels: async () => [],
  listCliModels: async () => [],
  ask: async (id, response) => {
    const idx = previewIdeas.findIndex(item => item.id === id);
    if (idx < 0) return;
    const row = previewIdeas[idx];
    const discussion = row.discussion.map(turn => ({ ...turn }));
    const paused = response?.pause === true;
    const recordOnly = paused || response?.recordOnly === true;
    const pendingTurn = [...discussion].reverse().find(turn => turn?.question && !turn.answer);
    if (response && pendingTurn) {
      const selected = (response.options || []).map(i => pendingTurn.options[i]).filter(Boolean);
      const note = (response.note || '').trim();
      const skipped = response.skip === true || (paused && !selected.length && !note);
      pendingTurn.answer = { options: selected, note, skipped, ...(paused ? { paused: true } : {}), ...(response.paper ? { paper: response.paper } : {}) };
    } else if (response) {
      discussion.push({ message: (response.note || '').trim(), ...(response.paper ? { paper: response.paper } : {}) });
    }
    const stillPending = discussion.some(turn => turn?.question && !turn.answer);
    if (!recordOnly && !stillPending) {
      const round = discussion.filter(turn => turn?.question).length + 1;
      const prompts = [
        {
          question: '这个假设最容易在哪个物理或数学前提下失效？你打算先锁死哪一个边界条件？',
          options: ['有限维截断误差界', '在线优化实时性约束', '扰动下的 Lyapunov 稳定性'],
        },
        {
          question: '这一步的边界条件或反例，你最倾向先从哪类数据/场景入手核验？',
          options: ['小样本边界测试', '消融对照实验', '先查文献依据'],
        },
        {
          question: '如果对比基准（如非线性 MPC 或纯黑箱 RL），你希望突出哪一项核心指标？',
          options: ['闭环追踪误差', '单步求解耗时', '状态约束违反率'],
        },
      ];
      discussion.push(prompts[(round - 1) % prompts.length]);
    }
    previewIdeas[idx] = {
      ...row,
      discussion,
      status: 'idle',
      provider: recordOnly ? '' : 'codex',
      updated: new Date().toISOString(),
    };
    notifyIdeas(id);
  },
  cancel: async id => {
    const idx = previewIdeas.findIndex(item => item.id === id);
    if (idx < 0) return;
    previewIdeas[idx] = { ...previewIdeas[idx], status: 'idle', provider: '' };
    notifyIdeas(id);
  },
  create: async (input, discuss) => {
    const id = 'idea-' + Date.now();
    const now = new Date().toISOString();
    const initialDiscussion = discuss ? [{
      question: '为了把这条设想落成可验证方案，你最想先检验哪一个关键瓶颈？',
      options: ['理论边界与稳定性', '算法求解效率对比', '先补充基准文献对照'],
    }] : [];
    previewIdeas.unshift({
      id, body: input.body || '', excerpt: input.excerpt || '', paper: input.paper || '', page: input.page || '',
      created: now, updated: now, status: 'idle', provider: discuss ? 'codex' : '', discussion: initialDiscussion,
    });
    notifyIdeas(discuss ? id : undefined);
    return id;
  },
  pinIdea: async (id, pinned) => {
    const target = previewIdeas.find(item => item.id === id);
    if (target) target.pinned_at = pinned ? new Date().toISOString() : null;
    notifyIdeas();
  },
  removeIdea: async id => {
    const idx = previewIdeas.findIndex(item => item.id === id);
    if (idx >= 0) previewIdeas.splice(idx, 1);
    notifyIdeas();
  },
  organizeIdea: async () => {},
  rateIdea: async (id, field, value) => {
    const target = previewIdeas.find(item => item.id === id);
    if (target) {
      const col = field === 'researchValue' ? 'research_value' : field;
      target[col] = value;
    }
    notifyIdeas();
  },
  setLibraryView: async () => {},
  setSidebarWidth: async () => {},
  saveAppearance: async next => {
    const mode = next.mode || previewAppearance.mode;
    const palette = mode === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? (next.dark || 'graphite') : (next.light || 'light')) : mode;
    previewAppearance = { ...previewAppearance, ...next, mode, palette };
    for (const cb of appearanceListeners) cb(previewAppearance);
    return previewAppearance;
  },
  setShortcut: async () => {},
  setStarSurface: async () => {},
  openPaper: async () => {},
  readClipboard: async () => '',
  configureApi: async () => {},
  configureCliModel: async () => {},
  testConnection: async () => ({ ok: true, message: '预览：连接正常' }),
  stopConnectionTest: async () => {},
  setDefaultAgent: async () => {},
  setAutomaticResearch: async () => {},
  setResearchNotifications: async () => {},
  testNotification: async () => {},
  openDataFolder: async () => {},
  retryPaper: async () => {},
  searchPaper: async () => [],
  saveArxivPaper: async () => null,
  removeResearchWork: async id => {
    const idx = previewWorkRows.findIndex(row => row.id === id);
    if (idx >= 0) previewWorkRows.splice(idx, 1);
  },
  setResearchWorkState: async () => {},
  decideIdeaRelation: async () => {},
  draftCombination: async () => null,
  combineResearchIdeas: async () => null,
  decideResearchMemory: async () => {},
  exportMemo: async () => false,
  downloadSkill: async () => false,
  draftSkill: async () => ({ name: '从讨论提炼的技能', description: '预览示例', text: '聚焦核心方法假设与实验对比。', enabled: true, scope: 'research', origin: '讨论提炼' }),
  dictate: async () => '',
  stopDictation: async () => {},
};
for (const [key, value] of Object.entries(previewStubs)) {
  if (!(key in window.recorder)) window.recorder[key] = value;
}

let previewLibraryView = new URLSearchParams(location.search).get('view') === 'stars' ? 'stars' : 'cards';
const previewBaseSettings = window.recorder.getSettings;
window.recorder.getSettings = async () => ({ ...(await previewBaseSettings()), libraryView: previewLibraryView });
window.recorder.setLibraryView = async view => { previewLibraryView = view === 'stars' ? 'stars' : 'cards'; };
window.recorder.organizeIdea = async () => {};

/* P0 工作项阶段预览数据（仅预览页） */
const previewStageOf = job => {
  if (job.status === 'waiting') return { stage: 'person', action: 'answer' };
  if (job.status === 'failed') return { stage: 'person', action: 'failed' };
  if (job.status === 'paused') return { stage: 'person', action: 'blocked' };
  if (job.status === 'queued') return { stage: 'working', action: 'queued' };
  if (job.status === 'running') return { stage: 'working' };
  if (job.status === 'ready') return { stage: 'person', action: 'review' };
  return { stage: 'ended' };
};
const previewWorkRows = [
  {
    id: 'work-1', idea_id: 'idea-1', kind: 'initial', status: 'waiting', provider: 'codex', error: null,
    created: '2026-11-14T08:00:00.000Z', requested_at: null, manual: false, question: null, stage: 'plan', paper_count: null,
    attention: { kind: 'question', question: '先看采样策略，还是评价指标？', options: ['先看采样策略', '先看评价指标'] },
    workStage: { stage: 'person', action: 'answer' }, canRetry: false,
    progress: { stage: 'plan', paperCount: null, attention: { kind: 'question', question: '先看采样策略，还是评价指标？', options: ['先看采样策略', '先看评价指标'] },
      result: { questions: ['先看采样策略，还是评价指标？', '是否需要限定在时间序列任务？'], cards: [], papers: [], assessment: '需要先选定查证问题。' } },
  },
  {
    id: 'work-2', idea_id: 'idea-1', kind: 'deep', status: 'running', provider: 'codex', error: null,
    created: '2026-11-14T08:05:00.000Z', requested_at: '2026-11-14T08:05:00.000Z', manual: true, question: '分层抽样会不会引入选择偏差？', stage: 'search', paper_count: 2,
    attention: null, workStage: { stage: 'working' }, canRetry: false,
    progress: { stage: 'search', paperCount: 2, attention: null, result: null },
  },
  {
    id: 'work-3', idea_id: 'idea-1', kind: 'synthesis', status: 'ready', provider: 'codex', error: null,
    created: '2026-11-13T08:00:00.000Z', requested_at: null, manual: false, question: null, stage: 'organize', paper_count: null,
    attention: null, workStage: { stage: 'person', action: 'review' }, canRetry: false,
    progress: { stage: 'organize', paperCount: null, attention: null, result: { summary: { title: '分层抽样与小样本估计', abstract: '比较分层抽样与简单随机抽样在类别不平衡下的方差差异。', hypothesis: '分层抽样降低方差', confirmed: ['类别不平衡时更稳'], open: ['是否引入选择偏差'], next: '补充小样本实验' }, connections: [], memory: null } },
  },
];
window.recorder.listResearchWork = async id => previewWorkRows.filter(row => row.idea_id === id);
window.recorder.researchDashboard = async () => previewWorkRows;
const previewWithStage = job => ({ ...job, workStage: previewStageOf(job), canRetry: ['waiting', 'failed'].includes(job.status) });
const previewBaseAutomation = window.recorder.getAutomation;
window.recorder.getAutomation = async () => {
  const data = await previewBaseAutomation();
  return { ...data, jobs: data.jobs.map(previewWithStage) };
};
const previewBaseSaveAutomation = window.recorder.saveAutomation;
window.recorder.saveAutomation = async input => {
  const data = await previewBaseSaveAutomation(input);
  return { ...data, jobs: data.jobs.map(previewWithStage) };
};

/* P1 Mandate 与策略提示预览 */
const previewMandates = {
  'work-1': { strength: 'inferred', rules: ['initial-research'], policyVersion: 'preview-policy', source: 'idea' },
  'work-2': { strength: 'explicit', rules: [], policyVersion: 'preview-policy', source: 'idea' },
  'work-3': { strength: 'inferred', rules: ['synthesis'], policyVersion: 'preview-policy', source: 'idea' },
};
const previewDecorateWork = row => ({ ...row, mandate: previewMandates[row.id] || null,
  policyNotice: row.id === 'work-1' ? { proactive: true, rules: [{ id: 'initial-research', enabled: false }] } : null });
window.recorder.listResearchWork = async id => previewWorkRows.filter(row => row.idea_id === id).map(previewDecorateWork);
window.recorder.researchDashboard = async () => previewWorkRows.map(previewDecorateWork);
const previewMandateForJob = job => ({ 'j-1': { strength: 'inferred', rules: ['paper-plain'], source: 'paper' },
  'j-2': { strength: 'inferred', rules: ['paper-quiz'], source: 'paper' } })[job.id] || null;
const previewDecorateAutomation = job => ({ ...previewWithStage(job), mandate: previewMandateForJob(job),
  policyNotice: job.id === 'j-1' ? { rules: [{ id: 'paper-plain', enabled: false }] } : null });
const previewAutomationBase = window.recorder.getAutomation;
window.recorder.getAutomation = async () => {
  const data = await previewAutomationBase();
  return { ...data, jobs: data.jobs.map(previewDecorateAutomation) };
};

/* P2 队列健康预览 */
if (!('workHealth' in window.recorder)) {
  window.recorder.workHealth = async () => ({ effects: [], receipts: [] });
}
