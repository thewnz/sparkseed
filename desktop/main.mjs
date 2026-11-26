import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, Menu, nativeImage, nativeTheme, Notification, safeStorage, screen, shell, Tray } from 'electron';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diagnoseAgent, diagnosticMessage, draftSkillFromDiscussion, findCli, generateQuestion, listApiModels, listCliModels, listImageModels, normalizeCliModel, providers, requestResearchJson, translatePaperText } from './agents.mjs';
import { apiPresets, apiPresetDefaults } from './api-presets.mjs';
import { openStore } from './store.mjs';
import { normalizeAppearance, palettes, resolveAppearance } from './appearance.mjs';
import { appendMemoryProfile, learnedResearch, readResearchProfile, relevantMemory, rememberExplicitRequest, saveResearchSection } from './research.mjs';
import { consolidateInstructions, normalizeConsolidation, normalizeSuggestions, shouldDecay, summaryInstructions } from './memory-summary.mjs';
import { researchLimits } from './research-limits.mjs';
import { mcpEndpoint, researchSources, scholarUrl, searchPublicSource, sourceBrowserUrl, useResearchSource, validateSearchTool } from './sources.mjs';
import { downloadGitHubSkill, enabledSkills, findGitHubSkills, listSkills, removeSkill, saveSkill, seedDefaultFigureSkill, skillFromMarkdown } from './skills.mjs';
import { fitMainWindow, isWindowBounds, normalizeSidebarWidth } from './window-layout.mjs';
import { packagedPaths } from './runtime-paths.mjs';
import { checkRelease, updateUrl } from './release-check.mjs';
import { createPaperQueue, importPaper, importPaperBytes, paperPath } from './papers.mjs';
import { collectLiterature, fetchArxivPdf, localLiterature } from './literature.mjs';
import { downloadPdf, resultMeta, searchAll, SOURCE_IDS } from './paper-search.mjs';
import { fetchCitationGraph, workKey } from './citation-graph.mjs';
import { comparisonCacheKey, comparisonInstructions, comparisonPayload, metadataRows, normalizeComparison } from './paper-compare.mjs';
import { fetchJournalRank } from './journal-rank.mjs';
import { classifyInstructions, cleanCategoryNames } from './paper-classify.mjs';
import { normalizeReaderLayout } from './reader-layout.mjs';
import { automationDecision } from './automation-policy.mjs';
import { glossaryInstructions, normalizeGlossary, normalizePlain, normalizeQuiz, plainInstructions, quizInstructions } from './desk-insights.mjs';
import { enqueueResearch, executeResearch, followUpNeedsInitial, recordDiscussionReply } from './research-work.mjs';
import { attentionOf, automationWorkStage } from './work-stage.mjs';
import { normalizeWorkPolicy, workMandate, workPolicyEffect, workPolicyVersion } from './work-policy.mjs';
import { Later, WorkEffects } from './work-effects.mjs';
import { paperTriggerAction, recordPaperParsed } from './work-sources.mjs';
import { researchDelivery } from './work-delivery.mjs';
import { exportMemo } from './memo.mjs';
import { makeMiniMaxImage, makePresentation, normalizeStudioSlides } from './studio.mjs';
import { normalizeFigureDraft, inspectFigureInput, planFigure } from './scientific-figure.mjs';
import { figureBriefComplete, figureBriefRecord, normalizeFigureBrief } from './figure-brief.mjs';
import { builtInFigureSkills, conceptImagePrompt, figureGenerationInstructions, figureReviewInstructions, normalizeFigureReview,
  detailedFlowInstructions, flowPromptLimit, flowStepInstructions, normalizeFlowSteps, overviewDetailInstructions, overviewDetailLayout } from './figure-workflow.mjs';
import { modelFigureArtifact } from './model-figure.mjs';
import { detectCapability, normalizeCapabilityOverrides, reasoningAdvice } from './figure-capabilities.mjs';
import { resolveFigureRoute } from './figure-routing.mjs';
import { figureSkillTexts } from './figure-skills.mjs';
import { lintVenueFigure, localFallbackArtifact } from './figure-quality.mjs';
import { normalizeVisionReview, reviewFixHint, visionReviewInstructions } from './figure-review.mjs';
import { makeGptFigure } from './gpt-figure.mjs';
import { compositeFlowCritiqueInstructions, compositeFlowInstructions, compositeFlowRevisionInstructions,
  inspectCompositeStructure, normalizeCompositeFlow, normalizeFlowCritique, renderCompositeFlow } from './composite-flow.mjs';
import { flowLayoutEngine } from './flow-layout.mjs';
import { createFlowAssemblySession } from './flow-assembly-session.mjs';
import { applyFlowReferenceDefaults, getFlowReferenceProfile, recommendFlowReference } from './flow-reference-gallery.mjs';
import { applyFlowEvidence, flowEvidenceInstructions, requireFlowStageEvidence, verifyFlowEvidence } from './flow-evidence.mjs';
import { designInstructions, flowCompositionInstructions, flowVisualDraftPrompt, normalizeFlowComposition, normalizeFlowDesign } from './flow-style.mjs';
import { exportFlowArchive, flowDesignFromStages, flowGeometryScore, preservesFlowContent, preservesSvgLabels,
  selectFlowReferences } from './flow-design.mjs';
import { flowPlanToD2 } from './flow-d2.mjs';
import { pictureWorkflowOf } from './picture-workflow.mjs';
import { inspectRenderedFigure, renderFigureExport } from './figure-export.mjs';
import { dictate } from './dictation.mjs';

const shortcuts = {
  'Control+Shift+Space': 'Ctrl + Shift + Space',
  'Control+Alt+Space': 'Ctrl + Alt + Space',
  'Control+Alt+I': 'Ctrl + Alt + I',
};
const defaultShortcut = 'Control+Shift+Space';
const root = fileURLToPath(new URL('..', import.meta.url));
// mth: packaged asset layout
const runtime = packagedPaths({ packaged: app.isPackaged, resourcesPath: process.resourcesPath, root });
if (runtime.worker) {
  process.env.SPARKSEED_PDF_WORKER = runtime.worker;
  process.env.SPARKSEED_PDFJS = runtime.pdfjs;
}
const brandPath = runtime.brand;
const appTitle = 'Sparkseed · 火种';
const appId = 'com.sparkseed.recorder';
if (process.platform === 'win32') app.setAppUserModelId(appId);
const apiProviders = new Set(apiPresets.map(preset => preset.id));
let store;
let main;
let brandIcon;
let paperDirectory;
let paperQueue;
let captureRequested = false;
let tray;
let registered = '';
const voiceShortcut = 'CommandOrControl+Shift+Alt+Space';
let voiceShortcutRegistered = false;
let quitting = false;
let active;
const activeResearch = new Map();
let automationRunning = null;
let automationController = null;
let dictation;
let workEffects;
const connectionTests = new Map();
const connectionResults = new Map();
const skillRequests = new Set();
const combinationRequests = new Map();
const translations = new Map();
const searchControllers = new Map();
const classifyRequests = new Set();
const memoryTimers = new Map();
const memoryRunning = new Set();
let studioRequest;
let starSurface = false;
const pdfAssets = { cMapUrl: 'cmaps', standardFontDataUrl: 'standard_fonts', wasmUrl: 'wasm' };

function publish(select) {
  if (main && !main.isDestroyed()) main.webContents.send('ideas:changed', select);
}

function configFor(provider) {
  if (!apiProviders.has(provider)) return { model: store.setting('cli:model:' + provider) || '' };
  const config = store.setting(provider);
  if (!config) return undefined;
  return { base: config.base, model: config.model,
    key: config.secret ? safeStorage.decryptString(Buffer.from(config.secret, 'base64')) : '' };
}

function agentAvailable(provider) {
  return Object.hasOwn(providers, provider) && (apiProviders.has(provider) ? Boolean(store.setting(provider)) : Boolean(findCli(provider)));
}

function citationView(seed, value) {
  const library = new Map();
  for (const paper of store.papers.list()) {
    if (paper.id === seed.id) continue;
    const key = workKey({ doi: paper.doi, arxiv: paper.arxiv_id, title: paper.title });
    if (key) library.set(key, paper);
  }
  const co = new Map(store.papers.citation.coCited().map(row => [row.key, row]));
  const decorate = (row, shared) => ({
    ...row,
    inLibraryId: library.get(row.key)?.id || '',
    sharedBy: shared ? Math.max(0, (co.get(row.key)?.sharedBy || 0) - 1) : 0,
  });
  return {
    ...value,
    references: value.references.map(row => decorate(row, true)),
    citations: value.citations.map(row => decorate(row, false)),
    pending: false,
  };
}

function searchConnector(name) {
  const config = store.setting('mcp:' + name);
  if (!config) return undefined;
  return (query, signal) => useResearchSource({ ...config, token: config.secret
    ? safeStorage.decryptString(Buffer.from(config.secret, 'base64')) : '' }, query, signal);
}

function studioArtifact(id) {
  return typeof id === 'string' && /^[a-f0-9-]{36}$/i.test(id) ? store.setting('studio:artifact:' + id) : null;
}

function studioReference(id) {
  const result = studioArtifact(id);
  if (!result) return null;
  const summary = result.type === 'slides' ? result.slides.map(slide => slide.title + '：' + slide.points.join('、')).join('\n') : result.description;
  return { id: result.id, title: result.title, type: result.type, summary: clean(summary, 4500) };
}

function unseal(secret) {
  return secret ? safeStorage.decryptString(Buffer.from(secret, 'base64')) : '';
}

function seal(key, previous) {
  return key ? safeStorage.encryptString(key).toString('base64') : previous || '';
}

function publishResearch(id) {
  if (main && !main.isDestroyed()) main.webContents.send('work:changed', id);
}

function publishNotes() {
  if (main && !main.isDestroyed()) main.webContents.send('notes:changed');
}

function publishMemory() {
  if (main && !main.isDestroyed()) main.webContents.send('memory:changed');
}

function publishAutomation() {
  if (main && !main.isDestroyed()) main.webContents.send('automation:changed');
}

/** One notification handler for the whole app: durable, deduplicated by receipt, retried with backoff. */
function installWorkEffects() {
  workEffects = new WorkEffects(store.work);
  workEffects.handle('notify', async payload => {
    if (quitting) throw new Later('应用正在退出');
    if (store.setting('researchNotifications') === false) return;
    const id = String(payload?.id || '');
    if (!id || store.work.receipts.has(id)) return;
    if (payload.jobId && !store.work.get(payload.jobId)) {
      store.work.receipts.add(id, 'notify', 'dropped', '任务已删除');
      return;
    }
    if (main?.isFocused()) return;
    if (!Notification.isSupported()) {
      store.work.receipts.add(id, 'notify', 'unsupported', '系统通知不可用');
      return;
    }
    const notification = new Notification({ title: payload.title, body: payload.body });
    notification.on('click', () => {
      if (!store.work.get(payload.jobId)) return;
      showMain();
      main.webContents.send('work:open', { ideaId: payload.ideaId, jobId: payload.jobId });
    });
    notification.show();
    store.work.receipts.add(id, 'notify', 'sent');
  }, { limit: () => 1, retry: [5000, 300_000] });
  workEffects.handle('paper-trigger', async () => {
    if (quitting) throw new Later('应用正在退出');
    const action = paperTriggerAction({ mode: automationMode(), provider: store.setting('provider') });
    if (action === 'drop') return;
    if (action === 'hold') throw new Later('尚未接入 Agent');
    schedulePaperAutomation();
  }, { limit: () => 1, retry: [10_000, 300_000] });
  workEffects.handle('launch', async payload => {
    if (quitting) throw new Later('应用正在退出');
    const job = store.work.get(payload.jobId);
    if (!job || job.status !== 'queued') return;
    processResearch();
    if (store.work.get(payload.jobId)?.status === 'queued') throw new Later('等待空闲工作槽');
  }, { limit: () => 1, retry: [1500, 60_000] });
  workEffects.handle('deliver', async payload => {
    if (quitting) throw new Later('应用正在退出');
    const job = store.work.get(payload.jobId);
    if (!job || !['ready', 'waiting'].includes(job.status)) return;
    const delivery = researchDelivery(job, job.progress, { notifications: store.setting('researchNotifications') !== false });
    if (delivery.observations) {
      store.work.learn(job, delivery.observations);
      publish();
    }
    if (delivery.summarize) scheduleMemorySummary(job.idea_id);
    if (delivery.notice && !store.work.receipts.has(delivery.notice.key)) {
      store.work.effects.enqueue('notify', delivery.notice.key, delivery.notice);
    }
    publishResearch(job.idea_id);
  }, { limit: () => 2, retry: [2000, 60_000] });
  workEffects.start();
}

function automationMode() {
  const mode = store.setting('automationMode');
  return ['off', 'record', 'act'].includes(mode) ? mode : 'record';
}

/** The current rules and accept mode; every mandate records this policy version. */
function currentWorkPolicy() {
  return normalizeWorkPolicy({
    mode: automationMode(),
    rules: {
      'paper-plain': store.setting('autoPlain') !== false,
      'paper-quiz': store.setting('autoQuiz') === true,
      'initial-research': store.setting('automaticResearch') !== false,
      synthesis: true,
      'deep-research': true,
    },
  });
}

/** A policy change is delivered to affected open work; it never cancels a running task. */
function applyWorkPolicyChange(before, after) {
  if (workPolicyVersion(before) === workPolicyVersion(after)) return;
  for (const row of store.work.dashboard()) {
    if (!['queued', 'running', 'waiting'].includes(row.status)) continue;
    const effect = workPolicyEffect(row.mandate, before, after);
    if (effect) store.work.setPolicyNotice(row.id, effect);
  }
  for (const job of store.automation.list()) {
    if (!['queued', 'running', 'waiting'].includes(job.status)) continue;
    const effect = workPolicyEffect(job.mandate, before, after);
    if (effect) store.automation.setPolicyNotice(job.id, effect);
  }
  publishResearch('');
  publishAutomation();
}

function schedulePaperAutomation() {
  if (automationMode() === 'off' || !store.setting('provider')) return;
  const mode = automationMode();
  const policy = currentWorkPolicy();
  const autoPlain = store.setting('autoPlain') !== false;
  const autoQuiz = store.setting('autoQuiz') === true;
  const candidates = store.papers.list().filter(row => row.status === 'ready').filter(row =>
    (autoPlain && !store.papers.insights.get(row.id, 1, 'plain')) ||
    (autoQuiz && store.papers.review.list(row.id).length === 0));
  for (const paper of candidates.slice(0, 30)) {
    if (autoPlain && !store.papers.insights.get(paper.id, 1, 'plain')) {
      const event = store.work.recordEvent({ source: 'automation', subjectType: 'paper', subjectId: paper.id,
        kind: 'automation:paper-plain', actor: 'system', payload: { mode, provider: store.setting('provider') } });
      store.automation.enqueue({ kind: 'paper-plain', subjectType: 'paper', subjectId: paper.id,
        title: '生成《' + paper.title.slice(0, 50) + '》的白话摘要', mode, originEventId: event.id,
        mandate: workMandate({ policy, strength: 'inferred', rules: ['paper-plain'], source: 'paper', subject: paper.id }) });
    }
    if (autoQuiz && store.papers.review.list(paper.id).length === 0) {
      const event = store.work.recordEvent({ source: 'automation', subjectType: 'paper', subjectId: paper.id,
        kind: 'automation:paper-quiz', actor: 'system', payload: { mode, provider: store.setting('provider') } });
      store.automation.enqueue({ kind: 'paper-quiz', subjectType: 'paper', subjectId: paper.id,
        title: '为《' + paper.title.slice(0, 50) + '》生成自测题', mode, originEventId: event.id,
        mandate: workMandate({ policy, strength: 'inferred', rules: ['paper-quiz'], source: 'paper', subject: paper.id }) });
    }
  }
  publishAutomation();
  void processAutomation();
}

async function generatePlainForPaper(paper, page = 1, signal) {
  const text = store.papers.page(paper.id, page)?.text;
  if (!text) throw new Error('这一页没有可提取的文字。');
  const provider = store.setting('provider');
  const output = await requestResearchJson(provider, configFor(provider), plainInstructions(), {
    title: paper.title, page, text: text.slice(0, 12000),
  }, signal);
  const value = normalizePlain(output, { [page]: text });
  return store.papers.insights.save({ paperId: paper.id, page, kind: 'plain',
    text: value.summary, citations: value.citations, supported: value.supported });
}

async function generateQuizForPaper(paper, signal) {
  const provider = store.setting('provider');
  const texts = {};
  for (let page = 1; page <= Math.min(paper.page_count || 4, 4); page++) {
    const row = store.papers.page(paper.id, page);
    if (row?.text) texts[page] = row.text;
  }
  if (!Object.keys(texts).length) throw new Error('还没有可用的正文，无法生成自测题。');
  const output = await requestResearchJson(provider, configFor(provider), quizInstructions(), {
    title: paper.title, pages: texts,
  }, signal);
  const cards = normalizeQuiz(output, texts);
  const existing = new Set(store.papers.review.list(paper.id).map(card => card.question));
  for (const card of cards) if (!existing.has(card.question)) store.papers.review.save({ paperId: paper.id, ...card });
  return cards.length;
}

async function processAutomation() {
  if (automationRunning || quitting) return;
  const job = store.automation.next();
  if (!job) return;
  const mode = automationMode();
  const decision = automationDecision(mode, job.mode);
  if (decision === 'skip') return;
  automationRunning = job.id;
  try {
    store.automation.update(job.id, { status: 'running', stage: '正在执行', attempts: job.attempts + 1 });
    publishAutomation();
    if (decision === 'wait') {
      store.automation.update(job.id, { status: 'waiting', stage: '等待你确认', requires_attention: true,
        checkpoint: { proposal: job.kind === 'paper-plain' ? '生成第 1 页白话摘要' : '生成自测题卡' } });
      return;
    }
    if (!store.setting('provider')) throw new Error('请先在偏好设置中接入 Agent。');
    const paper = store.papers.get(job.subject_id);
    if (!paper) throw new Error('论文已不可用。');
    automationController = new AbortController();
    const signal = AbortSignal.any([automationController.signal, AbortSignal.timeout(50000)]);
    if (job.kind === 'paper-plain') await generatePlainForPaper(paper, 1, signal);
    else if (job.kind === 'paper-quiz') await generateQuizForPaper(paper, signal);
    else throw new Error('未知的自动化任务。');
    store.automation.update(job.id, { status: 'ended', stage: '已完成', requires_attention: false, result: { ok: true } });
  } catch (error) {
    if (!quitting) {
      if (automationController?.signal.aborted) {
        store.automation.update(job.id, { status: 'waiting', stage: '已停止，等待确认', requires_attention: true });
      } else {
        store.automation.update(job.id, { status: 'failed', stage: '失败',
          requires_attention: true, error: clean(error.message, 300) || '自动化任务失败。' });
      }
    }
  } finally {
    automationController = null;
    automationRunning = null;
    publishAutomation();
    if (!quitting) queueMicrotask(() => void processAutomation());
  }
}

function scheduleMemorySummary(ideaId) {
  if (!ideaId || !store.setting('provider') || store.setting('autoMemory') === false) return;
  clearTimeout(memoryTimers.get(ideaId));
  memoryTimers.set(ideaId, setTimeout(() => {
    memoryTimers.delete(ideaId);
    void summarizeMemory(ideaId).catch(() => {});
  }, 90000));
}

async function summarizeMemory(ideaId) {
  const idea = store.get(ideaId);
  if (!idea || memoryRunning.has(ideaId)) return { added: 0, accepted: 0 };
  const provider = store.setting('provider');
  if (!provider) throw new Error('请先在偏好设置中接入 Agent。');
  memoryRunning.add(ideaId);
  try {
    const profile = readResearchProfile(store);
    const memories = store.work.memories().filter(row => row.status === 'active').map(row => row.text);
    const pending = store.work.suggestions().filter(row => row.status === 'pending').map(row => row.text);
    const existing = [...memories, ...profile.memory.text.split(/\n\s*\n/), ...pending];
    const output = await requestResearchJson(provider, configFor(provider), summaryInstructions(), {
      idea: { body: idea.body, paper: idea.paper, excerpt: idea.excerpt },
      discussion: idea.discussion.slice(-10),
      analysis: idea.analysis ? { title: idea.analysis.title, abstract: idea.analysis.abstract } : null,
      currentMemory: profile.memory.text.slice(0, 3000),
      existingMemories: memories.slice(0, 20),
    }, AbortSignal.timeout(30000));
    const suggestions = normalizeSuggestions(output?.suggestions, existing);
    let added = 0;
    for (const item of suggestions) {
      if (store.work.hasSuggestion(item.text) || store.work.findSimilarMemory(item.text)) continue;
      const id = 'summary-' + createHash('sha256').update(ideaId + '\n' + item.text).digest('hex').slice(0, 40);
      if (store.work.addSuggestion({ id, ...item, idea_id: ideaId })) added++;
    }
    store.set('memorySummary:' + ideaId, new Date().toISOString());
    publishMemory();
    publishResearch(ideaId);
    return { added, accepted: 0 };
  } finally { memoryRunning.delete(ideaId); }
}

function scheduleResearch(idea, kinds, originEvent = null) {
  const provider = store.setting('provider');
  if (!provider || !agentAvailable(provider)) return;
  for (const kind of kinds) {
    if (kind === 'initial') {
      if (store.setting('automaticResearch') === false) continue;
      if (!followUpNeedsInitial(store.work.list(idea.id))) continue;
    }
    enqueueResearch(store, idea, provider, kind, '', false, currentWorkPolicy(), originEvent);
  }
  publishResearch(idea.id);
  if (kinds.includes('synthesis')) publish();
  void processResearch();
}

const researchTasks = () => [...activeResearch.values()];
const researchUsesProvider = provider => researchTasks().some(task => task.provider === provider);

async function runResearch(job, slot) {
  if (quitting || activeResearch.has(job.id)) return;
  const controller = new AbortController();
  activeResearch.set(job.id, { id: job.id, ideaId: job.idea_id, provider: job.provider, slot, controller });
  let checkpoint = job.progress;
  const save = (status, progress, error) => {
    if (quitting) return;
    checkpoint = progress;
    store.work.update(job.id, status, progress, error);
    publishResearch(job.idea_id);
  };
  save('running', checkpoint);
  try {
    const result = await executeResearch(job, {
      signal: controller.signal,
      ask: (instructions, data, signal) => requestResearchJson(job.provider, configFor(job.provider), instructions, {
        ...data, profile: relevantMemory(store, job.input.snapshot, job.input.question),
      }, signal),
      collect: (queries, citedTitle, signal, onStage, prior) => collectLiterature(queries, {
        signal, localPapers: query => localLiterature(store.papers, query, citedTitle),
        scholar: searchConnector('scholar'), web: searchConnector('web'), onStage, prior,
      }),
      checkpoint: progress => save('running', progress),
    });
    controller.signal.throwIfAborted();
    const delivery = researchDelivery(job, result, { notifications: store.setting('researchNotifications') !== false });
    save(delivery.status, result);
    store.work.effects.enqueue('deliver', job.id, { jobId: job.id, ideaId: job.idea_id });
    workEffects?.kick();
  } catch (error) {
    if (quitting || !store.work.get(job.id)) return;
    save(controller.signal.aborted ? 'paused' : 'failed', checkpoint, controller.signal.aborted ? null :
      error.name === 'TimeoutError' ? '任务超时，可以继续。' : clean(error.message, 500) || '研究任务失败。');
    if (job.kind === 'synthesis' && !quitting) publish();
  } finally {
    activeResearch.delete(job.id);
    if (!quitting) queueMicrotask(() => void processResearch());
  }
}

/** Fills the reserved human slot first, then the automatic slot. A running task is never preempted. */
function processResearch() {
  if (quitting) return;
  const taken = new Set(activeResearch.keys());
  for (const slot of ['manual', 'auto']) {
    if (researchTasks().some(task => task.slot === slot)) continue;
    const job = store.work.nextForSlot(slot, [...taken]);
    if (!job) continue;
    taken.add(job.id);
    void runResearch(job, slot);
  }
}

async function processQueue() {
  if (active || quitting) return;
  const next = store.queued()[0];
  if (!next) return;
  const idea = store.get(next.id);
  if (!idea) return;
  const controller = new AbortController();
  active = { id: idea.id, provider: idea.provider, controller };
  store.update(idea.id, 'running', idea.provider);
  publish();
  const start = performance.now();
  try {
    const { soul, memory, adaptive } = relevantMemory(store, idea);
    const skills = enabledSkills(store)
      .map(({ name, description, text }) => ({ name, description, text }));
    const question = await generateQuestion(idea.provider, configFor(idea.provider),
      { ...idea, previousSummary: store.work.latestSummary(idea.id) }, controller.signal,
      { soul, memory, adaptive }, skills);
    if (quitting) return;
    controller.signal.throwIfAborted();
    const activity = { turns: Math.min(4, idea.discussion.length), soul: Boolean(soul), memory: Boolean(memory),
      skills: skills.map(skill => skill.name), elapsed: Math.round(performance.now() - start) };
    store.update(idea.id, 'ready', idea.provider, null, [...idea.discussion, { ...question, provider: idea.provider, activity }]);
  } catch (error) {
    if (quitting || !store.get(idea.id)) return;
    const cancelled = controller.signal.aborted;
    store.update(idea.id, cancelled ? 'idle' : 'failed', idea.provider,
      cancelled ? null : error.name === 'TimeoutError' ? '请求超时，可以重试。' :
        error instanceof TypeError || error instanceof SyntaxError ? '连接或响应异常，可以在设置中测试。' : error.message);
  } finally {
    active = undefined;
    if (!quitting) {
      publish();
      void processQueue();
    }
  }
}

function appearance() {
  return resolveAppearance(store.setting('appearance'), nativeTheme.shouldUseDarkColors);
}

function titlebar(palette) {
  return { color: palette.canvas, symbolColor: palette.symbols, height: 34 };
}

function applyAppearance() {
  const choice = appearance();
  const palette = palettes[choice.palette];
  if (!main || main.isDestroyed()) return;
  main.setBackgroundColor(palette.canvas);
  if (process.platform === 'win32') main.setTitleBarOverlay(titlebar(starSurface ? { canvas: '#080b17', symbols: '#eceaff' } : palette));
  main.webContents.send('appearance:changed', choice);
}

function createWindow(geometry, icon) {
  const palette = palettes[appearance().palette];
  const window = new BrowserWindow({
    ...geometry,
    show: false, autoHideMenuBar: true,
    backgroundColor: palette.canvas,
    icon,
    ...(process.platform === 'win32' ? {
      titleBarStyle: 'hidden',
      titleBarOverlay: titlebar(palette),
    } : {}),
    title: appTitle,
    webPreferences: { preload: runtime.preload, contextIsolation: true, sandbox: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  for (const event of ['show', 'hide', 'minimize', 'restore']) {
    window.on(event, () => window.webContents.send('window:visibility', isWindowVisible(window)));
  }
  window.on('close', event => {
    if (quitting) return;
    event.preventDefault();
    window.hide();
  });
  void window.loadFile(runtime.renderer, { hash: 'inbox' });
  return window;
}

function isWindowVisible(window) {
  return window.isVisible() && !window.isMinimized();
}

function rememberMainWindow(window) {
  let timer;
  function save() {
    clearTimeout(timer);
    if (!window.isDestroyed() && !window.isMinimized()) {
      store.set('mainWindow', { bounds: window.getNormalBounds(), maximized: window.isMaximized() });
    }
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(save, 180);
  }
  for (const event of ['move', 'resize', 'maximize', 'unmaximize']) window.on(event, schedule);
  window.on('close', save);
  window.once('closed', () => clearTimeout(timer));
}

function showMain() {
  if (main.isMinimized()) main.restore();
  main.show();
  main.focus();
}

function showCapture(voice = false) {
  captureRequested = voice === true ? 'voice' : 'text';
  showMain();
  main.webContents.send('capture:open');
}

function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function handle(channel, windows, callback) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!windows().some(window => window?.webContents === event.sender && event.senderFrame === window.webContents.mainFrame)) {
      throw new Error('请求来源不可用。');
    }
    return callback(...args);
  });
}

function installHandlers() {
  const workspace = () => [main];
  handle('window:visibility-get', workspace, () => isWindowVisible(main));
  handle('brand:get', workspace, () => brandIcon.isEmpty() ? '' : brandIcon.resize({ width: 96 }).toDataURL());
  function createIdea(input) {
    const idea = {
      body: clean(input?.body, 8000), excerpt: clean(input?.excerpt, 16000),
      paper: clean(input?.paper, 1000), page: clean(input?.page, 80),
      artifact: studioReference(input?.artifact),
    };
    if (!Object.values(idea).some(Boolean)) throw new Error('请先写下一点线索。');
    const saved = store.create(idea, store.setting('provider'));
    rememberExplicitRequest(store, saved.id, idea.body);
    return saved;
  }
  handle('ideas:list', workspace, () => store.list());
  handle('evidence:list', workspace, ideaId => typeof ideaId === 'string' ? store.evidence.list(ideaId) : []);
  handle('evidence:change', workspace, (ideaId, input) => store.evidence.change(ideaId, input));
  handle('studio:get', workspace, id => studioArtifact(id || store.setting('studio:last')));
  const publishStudio = () => {
    if (!quitting && main && !main.isDestroyed()) main.webContents.send('studio:changed');
  };
  handle('studio:projects', workspace, () => ({ projects: store.studio.list(), generating: studioRequest?.projectId ?? null }));
  handle('studio:project', workspace, id => {
    const project = store.studio.get(clean(id, 80));
    const { flowAssembly: _assembly, ...draft } = project.draft;
    return { ...project, draft };
  });
  handle('studio:project-create', workspace, input => store.studio.create(input?.title, input?.ideaId, input?.figure));
  handle('studio:project-rename', workspace, (id, title) => store.studio.rename(clean(id, 80), title));
  handle('studio:project-draft', workspace, (id, draft) => store.studio.draft(clean(id, 80), draft));
  handle('studio:project-archive', workspace, (id, archived) => {
    const projectId = clean(id, 80);
    if (studioRequest?.projectId === projectId) throw new Error('请先停止当前生成任务。');
    store.studio.archive(projectId, archived === true);
  });
  handle('studio:project-remove', workspace, id => {
    const projectId = clean(id, 80);
    if (studioRequest?.projectId === projectId) throw new Error('请先停止当前生成任务。');
    store.studio.remove(projectId);
    return { projects: store.studio.list(), generating: studioRequest?.projectId ?? null };
  });
  handle('studio:settings', workspace, () => {
    const config = store.setting('studio:options') || {};
    const selected = config.provider || store.setting('provider');
    const legacy = config.provider === 'custom' && Boolean(config.base && config.model);
    const figureAgent = legacy ? config.model :
      agentAvailable(selected) ? config.model || providers[selected] : '';
    const visionAgent = config.vision && agentAvailable(config.vision) ? config.vision : '';
    return { provider: legacy ? 'legacy-custom' : config.provider || '', imageMode: config.imageMode || 'diagram',
      base: config.base || '', model: config.model || '', imageModel: config.imageModel || '',
      hasKey: Boolean(config.secret), hasImageKey: Boolean(studioImageSecret(config, 'minimax')),
      hasGptImage: Boolean(studioImageSecret(config, 'openai')),
      vision: visionAgent, visionModel: config.visionModel || '', visionAgent: visionAgent ? providers[visionAgent] : '',
      leader: config.leader || '', leaderModel: config.leaderModel || '',
      figureAgent, canReviewFigure: Boolean(figureAgent),
      capabilities: normalizeCapabilityOverrides(store.setting('studio:capabilities')),
      reasoningAdvice: reasoningAdvice(detectCapability(selected || '',
        config.model || (selected ? store.setting(selected)?.model || providers[selected] || '' : ''),
        normalizeCapabilityOverrides(store.setting('studio:capabilities')))) };
  });
  handle('studio:image-models', workspace, async mode => {
    const config = store.setting('studio:options') || {};
    const minimax = mode === 'minimax';
    const key = unseal(studioImageSecret(config, minimax ? 'minimax' : 'openai'));
    return listImageModels(minimax ? 'minimax' : 'openai', { key, base: minimax ? minimaxImageBase() : 'https://api.openai.com/v1' });
  });
  handle('studio:configure', workspace, input => {
    const previous = store.setting('studio:options') || {};
    const legacy = input?.provider === 'legacy-custom' && previous.provider === 'custom' && Boolean(previous.base && previous.model);
    const provider = legacy ? 'custom' : agentAvailable(input?.provider) ? input.provider : '';
    const imageMode = input?.imageMode === 'minimax' ? 'minimax' : 'diagram';
    let base = '';
    let model = '';
    if (legacy) {
      base = previous.base;
      model = previous.model;
    } else if (provider) {
      model = apiProviders.has(provider) ? clean(input?.model, 240) : normalizeCliModel(input?.model);
    }
    const vision = input?.vision && agentAvailable(input.vision) ? input.vision : '';
    const visionModel = vision ? (apiProviders.has(vision) ? clean(input?.visionModel, 240) : normalizeCliModel(input?.visionModel)) : '';
    const leader = clean(input?.leader, 80);
    if (leader && !agentAvailable(leader)) throw new Error('领导 Agent 不可用，请检查连接或改用生成 Agent。');
    const leaderModel = leader ? (apiProviders.has(leader) ? clean(input?.leaderModel, 240) : normalizeCliModel(input?.leaderModel)) : '';
    store.set('studio:options', { provider, imageMode, base, model, vision, visionModel, leader, leaderModel,
      imageModel: clean(input?.imageModel, 120),
      secret: legacy ? previous.secret : '',
      imageSecret: previous.imageSecret, gptImageSecret: previous.gptImageSecret });
    if (input?.capabilities) store.set('studio:capabilities', normalizeCapabilityOverrides(input.capabilities));
  });
  function studioImageSecret(options, provider) {
    const shared = store.setting(provider);
    const origins = provider === 'openai' ? ['https://api.openai.com']
      : ['https://api.minimax.io', 'https://api.minimax.chat'];
    if (shared?.secret && origins.includes(URL.parse(shared.base)?.origin)) return shared.secret;
    return provider === 'openai' ? options.gptImageSecret : options.imageSecret;
  }
  function minimaxImageBase() {
    const shared = store.setting('minimax');
    try {
      const url = URL.parse(shared?.base);
      if (url) return url.origin + '/v1';
    } catch {}
    return 'https://api.minimax.io/v1';
  }
  // MiniMax 图像模型偶尔返回近乎全白的图；检测墨迹比例，过低时用强化构图提示重试一次。
  function imageInkRatio(data) {
    const comma = String(data || '').indexOf(',');
    const image = comma > 0 ? nativeImage.createFromBuffer(Buffer.from(data.slice(comma + 1), 'base64')) : null;
    if (!image || image.isEmpty()) return 1;
    const small = image.getSize().width > 160 ? image.resize({ width: 160 }) : image;
    const { width, height } = small.getSize();
    if (!width || !height) return 1;
    const bitmap = small.toBitmap();
    let ink = 0;
    for (let i = 0; i < bitmap.length; i += 4) {
      if (0.114 * bitmap[i] + 0.587 * bitmap[i + 1] + 0.299 * bitmap[i + 2] < 200) ink++;
    }
    return ink / (width * height);
  }
  async function makeReadableMiniMaxImage(prompt, key, signal, config) {
    const artifact = await makeMiniMaxImage(prompt, key, signal, undefined, config.imageModel || undefined, minimaxImageBase());
    if (imageInkRatio(artifact.data) >= 0.003) return artifact;
    const reinforced = '整幅画面满版构图，图形占画面八成以上；背景为纯净的白色或极浅灰色；所有节点使用深蓝、灰蓝、橙色等明显色块填充，并加深色粗描边；中文标签大号加粗；整体对比强烈；不要线稿、浅色、半透明、水印或大面积空白。\n' + prompt;
    const retry = await makeMiniMaxImage(reinforced, key, signal, undefined, config.imageModel || undefined, minimaxImageBase());
    if (imageInkRatio(retry.data) < 0.003) {
      // 保证出图：位图连续空白时改用可编辑的本地兜底排版，而不是整次失败。
      const fallback = localFallbackArtifact({ title: '研究方法流程', text: prompt });
      fallback.figure.fallbackReason = '图片服务连续返回近乎空白的图片，已改用本地兜底排版。';
      return fallback;
    }
    return retry;
  }
  function svgTextOf(data) {
    if (typeof data !== 'string' || !data.startsWith('data:image/svg+xml;base64,')) return '';
    return Buffer.from(data.slice(data.indexOf(',') + 1), 'base64').toString('utf8');
  }
  function resolveVisionReviewer(config) {
    const overrides = normalizeCapabilityOverrides(store.setting('studio:capabilities'));
    const explicit = config.vision && agentAvailable(config.vision) ? config.vision : '';
    if (explicit) {
      const explicitModel = config.visionModel || providers[explicit];
      if (detectCapability(explicit, explicitModel, overrides).vision) {
        return { provider: explicit, model: config.visionModel || '' };
      }
      return null;
    }
    const fallback = config.provider || store.setting('provider');
    if (fallback && (fallback === 'custom' || agentAvailable(fallback))) {
      const fallbackModel = config.model || (fallback !== 'custom' ? configFor(fallback)?.model : '') || providers[fallback] || '';
      if (detectCapability(fallback, fallbackModel, overrides).vision) {
        return { provider: fallback, model: config.model || '' };
      }
    }
    return null;
  }
  async function visionReviewOf(artifact, config, signal, pictureType) {
    const reviewer = resolveVisionReviewer(config);
    if (!reviewer) return null;
    let png;
    try { png = await renderFigureExport(artifact.data, 'png'); } catch { return null; }
    const pngDataUrl = 'data:image/png;base64,' + png.toString('base64');
    const [provider, connection] = studioFigureConnection(reviewer.provider === config.provider ? config : { provider: reviewer.provider, model: reviewer.model });
    try {
      const result = await requestResearchJson(provider, connection, visionReviewInstructions,
        { title: artifact.title, kind: pictureType, summary: String(artifact.description || '').slice(0, 400) },
        signal, 1500, [pngDataUrl]);
      const normalized = normalizeVisionReview(result);
      if (!normalized) return null;
      return {
        ...normalized,
        reviewer: provider,
        model: connection.model || providers[provider] || '',
        _pngDataUrl: pngDataUrl,
      };
    } catch { return null; }
  }
  // 视觉闭环自动精修：当接入视觉模型时，渲染成图 → Vision Critic 审稿 → 附带渲染图与修订指令回传自动精修（最多 2 轮）。
  async function runVisionRefineLoop(artifact, config, signal, pictureType, refineFn, maxRounds = 2) {
    if (!artifact?.figure || artifact.figure.engine === 'local-fallback') return artifact;
    const history = [];
    let current = artifact;
    for (let round = 1; round <= maxRounds; round += 1) {
      signal.throwIfAborted();
      const review = await visionReviewOf(current, config, signal, pictureType);
      if (!review) break;
      const { _pngDataUrl, ...cleanReview } = review;
      history.push({ round, ...cleanReview });
      current.figure.visionReview = {
        ...cleanReview,
        rounds: round,
        refined: round > 1,
        history,
      };
      const needsRefine = (!cleanReview.valid && cleanReview.issues.length > 0) ||
        (typeof cleanReview.score === 'number' && cleanReview.score < 8 && cleanReview.issues.length > 0);
      if (!needsRefine || !refineFn || round >= maxRounds || config.visionRefine === false) break;
      const hint = reviewFixHint(cleanReview);
      if (!hint) break;
      try {
        const refined = await refineFn({
          artifact: current,
          review: cleanReview,
          hint,
          renderedPng: _pngDataUrl,
          round: round + 1,
        });
        if (!refined) break;
        try { refined.figure.renderChecks = await inspectRenderedFigure(refined.data); }
        catch { refined.figure.renderChecks = { unavailable: true }; }
        refined.figure.quality = lintVenueFigure(svgTextOf(refined.data), refined.figure.renderChecks);
        current = refined;
      } catch {
        signal.throwIfAborted();
        break;
      }
    }
    if (history.length) {
      const last = history.at(-1);
      current.figure.visionReview = {
        ...last,
        rounds: history.length,
        refined: history.length > 1,
        history,
      };
    }
    return current;
  }
  // 文本模型偶尔返回不合规的 SVG；只在校验失败时追加格式约束重试一次。
  const svgFormatHint = '\n\n上一次返回的 SVG 未通过格式校验。请只返回一个完整的 <svg> 根元素，width 与 height 为 100–2000 的数值并带 viewBox；仅使用 rect、circle、ellipse、line、path、polygon、polyline、text、tspan、g、defs、marker、linearGradient、radialGradient、stop、title、desc；不要使用 style、class、foreignObject、script、image、use、symbol、xlink、DOCTYPE 或 XML 声明。';
  async function agentFigureArtifact(provider, connection, instructions, payload, specification, metadata, signal, maxTokens, images = []) {
    const ask = async text => modelFigureArtifact(
      await requestResearchJson(provider, connection, text, payload, signal, maxTokens, images), specification, metadata);
    try {
      return await ask(instructions);
    } catch (error) {
      if (!/SVG 格式不受支持/.test(String(error?.message))) throw error;
      signal.throwIfAborted();
      return ask(instructions + svgFormatHint);
    }
  }
  function studioFigureConnection(config) {
    const selected = config.provider || store.setting('provider');
    if (config.provider === 'custom' && config.base && config.model) return ['openai', { base: config.base, model: config.model, key: unseal(config.secret) }];
    if (!agentAvailable(selected)) throw new Error('请先在生成设置选择绘图 Agent。');
    const connection = configFor(selected);
    if (config.provider && config.model) connection.model = config.model;
    return [selected, connection];
  }
  // 文献检索缓存与并行预热：同一检索词 15 分钟内复用，块生成时不再重复等待网络。
  const literatureCache = new Map();
  const literatureInflight = new Map();
  const literatureKeyOf = queries => queries.map(query => String(query).trim().toLowerCase()).join('|');
  const literatureOptions = snapshotRef => ({
    illustrations: true,
    localPapers: query => localLiterature(store.papers, query),
    scholar: searchConnector('scholar'),
    onStage: (_stage, result) => { snapshotRef.result = result; },
    localPdf: async (id, signal) => {
      const path = paperPath(paperDirectory, id);
      return (await stat(path)).size <= 12 * 1024 * 1024 ? readFile(path, { signal }) : null;
    },
  });
  function fetchLiterature(queries, signal) {
    const key = literatureKeyOf(queries);
    const cached = literatureCache.get(key);
    if (cached) {
      if (Date.now() - cached.at < 15 * 60_000) return Promise.resolve(cached.value);
      literatureCache.delete(key);
    }
    let job = literatureInflight.get(key);
    if (!job) {
      const snapshotRef = { result: null };
      job = collectLiterature(queries, { ...literatureOptions(snapshotRef), signal: AbortSignal.timeout(65_000) })
        .catch(error => {
          if (snapshotRef.result?.papers?.length) return snapshotRef.result;
          throw new Error('论文检索未完成。请更换关键词或稍后重试。', { cause: error });
        })
        .then(snapshot => {
          if (snapshot?.papers?.length) literatureCache.set(key, { at: Date.now(), value: snapshot });
          return snapshot;
        })
        .finally(() => literatureInflight.delete(key));
      literatureInflight.set(key, job);
    }
    if (!signal) return job;
    signal.throwIfAborted?.();
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
      signal.addEventListener('abort', onAbort, { once: true });
      job.then(value => { signal.removeEventListener('abort', onAbort); resolve(value); },
        error => { signal.removeEventListener('abort', onAbort); reject(error); });
    });
  }
  async function prefetchLiterature(queries) {
    const unique = [...new Set((queries || []).map(query => String(query).trim()).filter(Boolean))].slice(0, 12);
    for (let i = 0; i < unique.length; i += 4) {
      await Promise.all(unique.slice(i, i + 4).map(query => fetchLiterature([query]).catch(() => null)));
    }
  }
  const flowOptions = store.setting('studio:options') || {};
  const flowCanVision = Boolean(flowOptions.vision) ||
    (flowOptions.provider || store.setting('provider')) === 'codex';
  const flowAssembly = createFlowAssemblySession({
    studio: store.studio,
    changed: publishStudio,
    getArtifact: studioArtifact,
    progress(event) {
      if (!quitting && main && !main.isDestroyed()) main.webContents.send('studio:flow-progress', event);
    },
    async runModel(projectId, operation) {
      if (studioRequest) throw new Error('已有图文任务正在生成。');
      const options = store.setting('studio:options') || {};
      const [provider, connection] = studioFigureConnection(options);
      const controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(360_000)]);
      studioRequest = { controller, projectId };
      publishStudio();
      try {
        const skills = [...builtInFigureSkills, ...enabledSkills(store, 'studio').map(({ name, text }) => ({ name, text }))];
        return await operation({ signal, skills, ask: (instructions, data, images = [], role = 'draw') => {
          const route = role === 'lead' && options.leader
            ? studioFigureConnection({ provider: options.leader, model: options.leaderModel })
            : images.length && options.vision
              ? studioFigureConnection({ provider: options.vision, model: options.visionModel })
              : null;
          const [askProvider, askConnection] = route || [provider, connection];
          // 按步骤收紧输出预算：带图请求 10000；主控/复核类 3000；块绘制 6000。
          const budget = images.length ? 10000 : role === 'lead' ? 3000 : 6000;
          return requestResearchJson(askProvider, askConnection, instructions, data, signal, budget, images);
        } });
      } catch (error) {
        if (controller.signal.aborted) return null;
        if (signal.aborted || error?.name === 'TimeoutError') throw new Error('流程图操作超时：所选模型绘制过慢，建议改用非推理型绘图模型后重试。');
        throw error;
      } finally {
        studioRequest = undefined;
        publishStudio();
      }
    },
    async search(queries, signal) {
      return fetchLiterature(queries, signal);
    },
    prefetch: prefetchLiterature,
    canVision: flowCanVision,
    cropFigure(reference, crop) {
      let image = nativeImage.createFromBuffer(reference.bytes);
      if (image.isEmpty()) throw new Error('论文插图无法解码，请换一张图。');
      const { width, height } = image.getSize();
      const x = Math.floor(width * crop.x / 100);
      const y = Math.floor(height * crop.y / 100);
      image = image.crop({ x, y, width: Math.max(1, Math.floor(width * (crop.x + crop.width) / 100) - x),
        height: Math.max(1, Math.floor(height * (crop.y + crop.height) / 100) - y) });
      const size = image.getSize();
      if (Math.max(size.width, size.height) > 1400) image = image.resize(size.width >= size.height ? { width: 1400 } : { height: 1400 });
      return 'data:image/png;base64,' + image.toPNG().toString('base64');
    },
    async rasterize(data) {
      let image = nativeImage.createFromBuffer(await renderFigureExport(data, 'png'));
      const { width, height } = image.getSize();
      if (Math.max(width, height) > 1600) image = image.resize(width >= height ? { width: 1600 } : { height: 1600 });
      return { mime: 'image/png', bytes: image.toPNG() };
    },
    inspect: inspectRenderedFigure,
    analyzeImage(bytes) {
      try {
        const image = nativeImage.createFromBuffer(bytes);
        if (image.isEmpty()) return null;
        const { width, height } = image.getSize();
        if (!width || !height) return null;
        return { w: width, h: height, bitmap: image.getBitmap() };
      } catch { return null; }
    },
  });
  handle('studio:flow-assembly', workspace, (id, input) => {
    if (input?.operation !== 'read' && studioRequest) throw new Error('已有图文任务正在生成。');
    return flowAssembly.action(clean(id, 80), input);
  });
  handle('studio:flow-steps', workspace, async input => {
    const description = typeof input === 'string' ? input.trim() : '';
    if (!description || description.length > flowPromptLimit) throw new Error('请填写 1–3000 个字符的流程描述。');
    const [provider, connection] = studioFigureConnection(store.setting('studio:options') || {});
    return normalizeFlowSteps(await requestResearchJson(provider, connection, flowStepInstructions,
      { description }, AbortSignal.timeout(45_000), 4096));
  });
  handle('studio:figure-review', workspace, async input => {
    const config = store.setting('studio:options') || {};
    const [provider, connection] = studioFigureConnection(config);
    const answers = normalizeFigureBrief(input?.figureBrief);
    if (!figureBriefComplete(answers)) throw new Error('请先确认绘图需求。');
    const specification = normalizeFigureDraft(input.figure);
    const checks = inspectFigureInput(specification);
    const { kind, title, xLabel, yLabel, caption, theme, width } = specification;
    return normalizeFigureReview(await requestResearchJson(provider, connection, figureReviewInstructions, {
      brief: figureBriefRecord(answers), figure: { kind, title, xLabel, yLabel, caption, theme, width },
      checks, skills: builtInFigureSkills,
    }, AbortSignal.timeout(45_000)));
  });
  handle('studio:generate', workspace, async input => {
    const config = store.setting('studio:options') || {};
    const prompt = clean(input?.prompt, 3000);
    const idea = input?.ideaId ? store.get(clean(input.ideaId, 80)) : null;
    const projectId = clean(input?.projectId, 80);
    if (projectId && store.studio.get(projectId).archived) throw new Error('请先恢复已归档的项目。');
    if (studioRequest) throw new Error('已有图文任务正在生成。');
    const workflow = pictureWorkflowOf(input?.pictureWorkflow);
    const capabilityOverrides = normalizeCapabilityOverrides(store.setting('studio:capabilities'));
    const imageReady = provider => Boolean(studioImageSecret(config, provider)) &&
      detectCapability(provider, provider === 'minimax'
        ? store.setting('minimax')?.model || ''
        : config.imageModel || '', capabilityOverrides).imageApi;
    const rasterChoice = config.imageMode === 'minimax'
      ? (imageReady('minimax') ? 'minimax' : '')
      : (imageReady('openai') ? 'openai' : imageReady('minimax') ? 'minimax' : '');
    const vectorConcept = input?.type === 'concept-vector' || (input?.type === 'concept' && !rasterChoice);
    const dataFigure = input?.type === 'figure' || vectorConcept;
    const localFigure = input?.type === 'figure' && input.engine === 'local';
    const answers = normalizeFigureBrief(input?.figureBrief);
    let specification;
    let checks;
    if (dataFigure) {
      if (!projectId) throw new Error('请先选择图文项目。');
      if (!workflow && !figureBriefComplete(answers)) throw new Error('请先完成科研绘图的需求确认。');
      specification = vectorConcept ? normalizeFigureDraft({ ...input.figure, kind: 'diagram', data: '' }) : normalizeFigureDraft(input.figure);
      if (vectorConcept && !clean(input?.concept, 3000)) throw new Error('请填写概念示意内容。');
    }
    const concept = clean(input?.concept, 3000) || (vectorConcept ? prompt : '');
    const gptConcept = input?.type === 'concept' && Boolean(rasterChoice);
    const revision = gptConcept || dataFigure ? clean(input?.revision, 1500) : '';
    let reference;
    if (revision) {
      const id = clean(input?.referenceId, 80);
      reference = projectId && store.studio.get(projectId).versions.some(version => version.id === id) ? studioArtifact(id) : null;
      if (gptConcept && (!reference?.concept || !/^data:image\/png;base64,/.test(reference.data) || reference.data.length > 20_971_520)) {
        throw new Error('请选择此项目中可用于修改的 GPT 示意草案。');
      }
      if (dataFigure && (!reference?.figure || !reference.data.startsWith('data:image/svg+xml;base64,'))) {
        throw new Error('请选择此项目中可用于修改的科研图。');
      }
      if (reference?.figure?.specification) specification = normalizeFigureDraft(reference.figure.specification);
    }
    if (gptConcept && (!projectId || !(reference?.concept.prompt || concept) || !workflow && !figureBriefComplete(answers))) {
      throw new Error('请填写概念示意内容，并确认图文项目。');
    }
    const hybridFigure = input?.type === 'figure' && workflow === 'hybrid' && !localFigure && input.engine !== 'agent' &&
      specification?.kind !== 'diagram';
    const layout = reference ? (reference.concept || reference.figure)?.conceptLayout : input?.conceptLayout;
    const useVisualDraft = specification?.kind === 'diagram' && !vectorConcept && !localFigure &&
      input.engine === 'image-draft';
    const detailedFlow = specification?.kind === 'diagram' && !vectorConcept && !localFigure &&
      (reference ? reference.figure.engine === 'detailed' : input.engine === 'detailed' || useVisualDraft);
    const flowNeeds = {
      requirements: clean(reference ? reference.figure?.flowRequirements : input?.flowRequirements, flowPromptLimit),
      constraints: clean(reference ? reference.figure?.flowConstraints : input?.flowConstraints, flowPromptLimit),
    };
    const hasFlowNeeds = Boolean(flowNeeds.requirements || flowNeeds.constraints);
    const compositeFlow = specification?.kind === 'diagram' && !vectorConcept && !localFigure;
    if (detailedFlow && !specification.data.trim() &&
        !clean(reference ? reference.figure.flowPrompt : input.flowPrompt, flowPromptLimit)) {
      throw new Error('请填写流程步骤或流程描述。');
    }
    if (dataFigure && !vectorConcept && !detailedFlow) checks = inspectFigureInput(specification);
    const conceptLayout = (vectorConcept || gptConcept || specification?.kind === 'diagram' && !localFigure && !hybridFigure) &&
      layout === overviewDetailLayout ? overviewDetailLayout : undefined;
    if (!gptConcept && !dataFigure && !prompt && !idea) throw new Error('请填写生成要求或选一段讨论。');
    const type = input?.type === 'image' ? 'image' : 'slides';
    const pictureType = clean(input?.pictureType, 40);
    const gptIllustration = type === 'image' && workflow === 'hybrid' && config.imageMode !== 'minimax' && Boolean(rasterChoice);
    const controller = new AbortController();
    studioRequest = { controller, projectId };
    publishStudio();
    const timeout = detailedFlow || compositeFlow && hasFlowNeeds ? 360_000 :
      gptConcept || gptIllustration || compositeFlow ? 240_000 : 125_000;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(timeout)]);
    try {
      const skills = enabledSkills(store, 'studio').map(({ name, text }) => ({ name, text }));
      const plottingSkills = [...builtInFigureSkills, ...figureSkillTexts(pictureType), ...skills];
      const context = idea ? { title: idea.analysis?.title || idea.body.slice(0, 200), summary: idea.analysis,
        discussion: idea.discussion.slice(-12) } : null;
      let artifact;
      if (localFigure || hybridFigure) {
        if (revision) throw new Error('请修改原材料后重新绘制。');
        const { svg, summary, warnings } = planFigure(specification);
        const brief = figureBriefRecord(answers);
        let model = '';
        let suggestions;
        if (hybridFigure) {
          const [provider, connection] = studioFigureConnection(config);
          model = connection.model || providers[provider];
          const { kind, title, xLabel, yLabel, caption, theme, width } = specification;
          suggestions = normalizeFigureReview(await requestResearchJson(provider, connection, figureReviewInstructions, {
            brief, figure: { kind, title, xLabel, yLabel, caption, theme, width }, checks, skills: builtInFigureSkills,
          }, signal));
        }
        artifact = { id: randomUUID(), type: 'image', title: specification.title.trim() || '科研图',
          description: summary, data: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'),
          figure: { specification, brief, engine: hybridFigure ? 'hybrid' : 'local', summary, warnings,
            ...(suggestions ? { suggestions, model } : {}) } };
      } else if (compositeFlow) {
        const [provider, connection] = studioFigureConnection(config);
        const brief = figureBriefRecord(answers);
        const flowPrompt = clean(reference ? reference.figure.flowPrompt : input.flowPrompt, flowPromptLimit);
        let literature;
        let figures = [];
        let retrieved;
        let queries = [];
        const useLiterature = found => {
          const papers = found.papers.filter(paper => !/\b(?:withdrawn|retracted)\b/i.test(paper.title || ''));
          figures = selectFlowReferences(papers, [specification.title, specification.data, flowPrompt, ...queries].join(' '),
            2, { requireTopicMatch: true });
          return { queries, searches: found.searches, papers: papers.slice(0, 10).map(paper => ({
            id: paper.id, title: paper.title, doi: paper.doi, pmcid: paper.pmcid, url: paper.url || '', abstract: paper.abstract || '',
            pages: paper.pages || [], sections: paper.sections || [],
          })) };
        };
        try {
          const searchSignal = AbortSignal.any([signal, AbortSignal.timeout(65000)]);
          const searchPlan = await requestResearchJson(provider, connection,
            '根据流程图材料生成 1–2 条简短的英文学术检索词，每条 3–6 个关键词。优先检索描述同类方法或流程的论文。只返回 JSON 对象 {"queries":["检索词"]}。',
            { material: specification.data, description: flowPrompt },
            AbortSignal.any([searchSignal, AbortSignal.timeout(20000)])).catch(() => null);
          signal.throwIfAborted();
          queries = Array.isArray(searchPlan?.queries) ? searchPlan.queries
            .filter(query => typeof query === 'string' && query.trim()).map(query => query.trim().slice(0, 200)).slice(0, 2) : [];
          if (!queries.length) {
            const fallback = (specification.title.trim() || flowPrompt.split('\n').find(line => line.trim()) ||
              specification.data.split('\n')[0] || '').trim().slice(0, 120);
            if (fallback) queries = [fallback];
          }
          if (queries.length) {
            const found = await collectLiterature(queries, {
              signal: searchSignal, localPapers: query => localLiterature(store.papers, query),
              scholar: searchConnector('scholar'), illustrations: true,
              onStage: (_stage, snapshot) => { retrieved = snapshot; },
              localPdf: async (id, signal) => {
                const path = paperPath(paperDirectory, id);
                return (await stat(path)).size <= 12 * 1024 * 1024 ? readFile(path, { signal }) : null;
              },
            });
            literature = useLiterature(found);
          }
        } catch (error) {
          signal.throwIfAborted();
          literature = { ...(retrieved ? useLiterature(retrieved) : { queries, searches: [], papers: [] }),
            error: retrieved ? '部分论文检索或正文读取超时，已保留取得的结果。' : '论文检索未完成，可重试生成。' };
        }
        const styleVersion = projectId && store.studio.get(projectId)?.versions.some(version => version.id === input.flowStyleVersion)
          ? studioArtifact(input.flowStyleVersion) : null;
        const remembered = styleVersion?.figure?.designBrief;
        const preferredStyle = remembered ? { layout: remembered.layout, frame: remembered.frame, palette: remembered.palette,
          nodeStyle: remembered.nodeStyle, leader: remembered.leader,
          referenceProfileId: remembered.referenceProfileId } : undefined;
        const draftProfileId = clean(input?.flowReferenceId, 60);
        const requestedProfileId = reference ? reference.figure.designBrief?.referenceProfileId : draftProfileId;
        const requestedProfile = getFlowReferenceProfile(requestedProfileId);
        const initialRecommendation = recommendFlowReference({ description: flowPrompt, steps: specification.data,
          requirements: flowNeeds.requirements, constraints: flowNeeds.constraints });
        const rememberedProfile = !hasFlowNeeds && getFlowReferenceProfile(preferredStyle?.referenceProfileId);
        const initialProfile = requestedProfile || rememberedProfile || initialRecommendation.profile;
        const referenceMetadata = figures.map(({ bytes, mime, ...source }) => source);
        const designInput = { steps: specification.data, description: flowPrompt, brief, revision, preferredStyle,
          ...flowNeeds, canvas: { width: specification.width, theme: specification.theme },
          referenceGallery: { mode: requestedProfile ? 'user-selected' : 'auto-recommended', id: initialProfile.id,
            label: initialProfile.label, description: initialProfile.description, archetype: initialProfile.archetype,
            layout: initialProfile.layout, nodeStyle: initialProfile.nodeStyle, leader: initialProfile.leader,
            frame: initialProfile.frame, palette: initialProfile.palette } };
        if (!figures.length) {
          throw new Error('尚未取得匹配的论文参考图。请导入含相关流程图的论文，或补充领域和方法关键词后重试。');
        }
        let designBrief;
        try {
          designBrief = normalizeFlowDesign(await requestResearchJson(provider, connection, designInstructions, {
            ...designInput, references: referenceMetadata,
          }, AbortSignal.any([signal, AbortSignal.timeout(35000)]), 4096, figures));
        } catch (error) {
          signal.throwIfAborted();
          throw new Error('论文参考图分析未完成。请重试，或切换支持图片输入的绘图模型。', { cause: error });
        }
        const modelProfile = getFlowReferenceProfile(designBrief?.referenceProfileId);
        const selectedProfile = requestedProfile || rememberedProfile || modelProfile || recommendFlowReference({ description: flowPrompt,
          steps: specification.data, requirements: flowNeeds.requirements, constraints: flowNeeds.constraints,
          archetype: designBrief?.archetype });
        const actualProfile = selectedProfile.profile || selectedProfile;
        const profileReason = requestedProfile ? (reference ? '沿用原版本的构图参考。' : '使用你选择的构图参考。') : rememberedProfile
          ? '沿用项目中收藏版本的构图范式。' : modelProfile
            ? 'AI 根据流程拓扑选择了该构图范式。' : selectedProfile.reason;
        designBrief = {
          ...applyFlowReferenceDefaults(designBrief || preferredStyle || {}, actualProfile,
            { preferProfile: Boolean(requestedProfile && !reference && !hasFlowNeeds && !flowPrompt),
              useDefaults: Boolean(designBrief || !hasFlowNeeds && !flowPrompt) }),
          ...(preferredStyle && !hasFlowNeeds && !requestedProfile ? preferredStyle : {}),
          referenceProfileId: actualProfile.id,
          referenceProfile: { id: actualProfile.id, label: actualProfile.label, description: actualProfile.description,
            selectedBy: requestedProfile ? 'user' : 'recommended', reason: profileReason },
          ...(preferredStyle && !hasFlowNeeds && !requestedProfile ? { styleVersionId: styleVersion.id } : {}),
          references: figures.map(({ bytes, mime, ...source }) => ({
            ...source, data: 'data:' + mime + ';base64,' + bytes.toString('base64'), used: true,
          })),
        };
        const needsSnapshot = { ...(flowNeeds.requirements ? { flowRequirements: flowNeeds.requirements } : {}),
          ...(flowNeeds.constraints ? { flowConstraints: flowNeeds.constraints } : {}) };
        const reviewNeeds = { ...flowNeeds, designChecks: designBrief.checks,
          material: specification.data, description: flowPrompt };
        const material = {
          material: specification.data, ...(flowPrompt ? { description: flowPrompt } : {}), brief, skills: plottingSkills,
          drawingPrompt: designBrief.prompt, ...flowNeeds, designChecks: designBrief.checks,
          figureSpec: { purpose: designBrief.purpose, archetype: designBrief.archetype, layout: designBrief.layout,
            nodeStyle: designBrief.nodeStyle, leader: designBrief.leader, referenceProfileId: designBrief.referenceProfileId,
            frame: designBrief.frame, palette: designBrief.palette },
          ...(literature ? { literature } : {}),
          ...(revision ? { revision, previousPlan: reference.figure.flowPlan } : {}),
        };
        let groundedPlan = normalizeCompositeFlow(await requestResearchJson(provider, connection, compositeFlowInstructions, material, signal));
        let grounding = verifyFlowEvidence(groundedPlan, literature);
        try {
          requireFlowStageEvidence(groundedPlan, grounding);
        } catch {
          const bindings = await requestResearchJson(provider, connection, flowEvidenceInstructions,
            { stages: groundedPlan, literature }, AbortSignal.any([signal, AbortSignal.timeout(30_000)]));
          const citedPlan = normalizeCompositeFlow({ stages: applyFlowEvidence(groundedPlan, bindings) });
          const cited = verifyFlowEvidence(citedPlan, literature);
          const alreadyVerified = new Set(grounding.nodes.filter(node => node.verified).map(node => node.key));
          const additions = cited.nodes.filter(node => node.verified &&
            !alreadyVerified.has(node.key));
          groundedPlan = normalizeCompositeFlow({ stages: applyFlowEvidence(groundedPlan, { bindings:
            additions.map(node => ({ key: node.key, evidence: node.citations.filter(citation => citation.verified) })) }) });
          grounding = verifyFlowEvidence(groundedPlan, literature);
          requireFlowStageEvidence(groundedPlan, grounding);
        }
        const hasComplexTopology = groundedPlan.some(stage => stage.columns.some(column => column.length > 1) ||
          stage.links.some(([from, to]) => to[0] <= from[0]));
        if (detailedFlow || workflow === 'agent' || requestedProfile?.id === 'swimlane' ||
            designBrief.renderer === 'detailed' || hasComplexTopology) {
          const composition = normalizeFlowComposition(await requestResearchJson(provider, connection, flowCompositionInstructions, {
            material: specification.data, description: flowPrompt, ...flowNeeds,
            canvas: { width: specification.width, theme: specification.theme },
            design: { purpose: designBrief.purpose, prompt: designBrief.prompt },
            stages: groundedPlan.map(stage => ({ title: stage.title, columns: stage.columns.map(column =>
              column.map(({ label, shape, expression }) => ({ label, shape, expression }))), links: stage.links })),
            references: referenceMetadata,
          }, AbortSignal.any([signal, AbortSignal.timeout(45_000)]), 4096, figures), groundedPlan.length);
          designBrief = { ...designBrief, renderer: 'detailed', composition };
          let drawingImages = figures;
          if (useVisualDraft) {
            const key = unseal(studioImageSecret(config, 'openai'));
            const [source] = designBrief.references;
            const visualDraft = await makeGptFigure({
              prompt: flowVisualDraftPrompt({ composition, stages: groundedPlan, title: specification.title,
                description: flowPrompt, ...flowNeeds }),
              title: specification.title, key, signal, reference: source.data, model: config.imageModel || undefined,
            });
            drawingImages = [...figures, { bytes: Buffer.from(visualDraft.data.split(',')[1], 'base64'), mime: 'image/png' }];
            designBrief.visualDraft = { provider: 'OpenAI Images', referenceUrl: source.url };
          }
          const drawingInput = {
            description: flowPrompt, confirmedSteps: specification.data, brief, drawingPrompt: designBrief.prompt,
            ...flowNeeds, designChecks: designBrief.checks,
            figureSpec: { purpose: designBrief.purpose, archetype: designBrief.archetype },
            composition, references: referenceMetadata,
            ...(useVisualDraft ? { visualDraftImage: drawingImages.length } : {}),
            groundedPlan, verifiedEvidence: grounding.nodes.filter(node => node.verified)
              .map(node => ({ ...node, citations: node.citations.filter(citation => citation.verified) })),
            referenceStyle: { palette: designBrief.palette },
            ...(revision ? { revision, previousSvg: Buffer.from(reference.data.split(',')[1], 'base64').toString('utf8') } : {}),
          };
          const metadata = { brief, engine: 'detailed', flowPrompt, designBrief, evidence: grounding, ...needsSnapshot,
            ...(literature ? { literature } : {}), model: connection.model || providers[provider],
            ...(reference ? { revision, referenceId: reference.id } : {}) };
          const draw = async (input, deadline) => modelFigureArtifact(
            await requestResearchJson(provider, connection, detailedFlowInstructions, input, deadline, 16000, drawingImages),
            specification, metadata);
          artifact = await draw(drawingInput, signal);
          async function reviewDetailed(value) {
            const { previewImage, ...checks } = await inspectRenderedFigure(value.data, { preview: true });
            value.figure.renderChecks = checks;
            if (!previewImage) return;
            const reviewImages = [{ bytes: Buffer.from(previewImage.split(',')[1], 'base64'), mime: 'image/png' }];
            if (useVisualDraft) reviewImages.push(drawingImages.at(-1));
            value.figure.visualReview = normalizeFlowCritique(await requestResearchJson(provider, connection,
              compositeFlowCritiqueInstructions, { ...reviewNeeds, checks, composition, ...(useVisualDraft ? { visualDraftImage: 2 } : {}) },
              AbortSignal.any([signal, AbortSignal.timeout(30_000)]), 3000,
              reviewImages));
          }
          try { await reviewDetailed(artifact); }
          catch { signal.throwIfAborted(); }
          const score = value => {
            const checks = value.figure.renderChecks;
            const review = value.figure.visualReview;
            if (!checks || artifact.figure.visualReview && !review) return Infinity;
            return (review?.issues || []).filter(issue => issue.severity !== 'minor')
              .reduce((total, issue) => total + (issue.severity === 'critical' ? 100 : 10), flowGeometryScore(checks));
          };
          if (Number.isFinite(score(artifact)) && score(artifact) > 0) {
            try {
              const improved = await draw({ ...drawingInput, review: artifact.figure.visualReview || { issues: [] },
                renderChecks: artifact.figure.renderChecks,
                previousSvg: Buffer.from(artifact.data.split(',')[1], 'base64').toString('utf8'),
              }, AbortSignal.any([signal, AbortSignal.timeout(70_000)]));
              await reviewDetailed(improved);
              if (preservesSvgLabels(artifact.data, improved.data) && score(improved) < score(artifact)) artifact = improved;
            } catch { signal.throwIfAborted(); }
          }
        } else {
          async function candidate(output, drawingStyle = designBrief) {
            const flowPlan = normalizeCompositeFlow(output);
            const evidence = verifyFlowEvidence(flowPlan, literature);
            requireFlowStageEvidence(flowPlan, evidence);
            const structure = inspectCompositeStructure(flowPlan);
            const resolvedDesign = flowDesignFromStages(flowPlan, drawingStyle);
            const svg = renderCompositeFlow(flowPlan, specification, resolvedDesign);
            const value = modelFigureArtifact({ svg, summary: `流程总览 · ${flowPlan.length} 个阶段详图` }, specification, {
              brief, flowPlan, evidence, structure, designBrief: resolvedDesign, ...needsSnapshot, flowLayout: { ...flowLayoutEngine },
              ...(flowPrompt ? { flowPrompt } : {}), ...(literature ? { literature } : {}),
              conceptLayout: overviewDetailLayout, model: connection.model || providers[provider],
              ...(reference ? { revision, referenceId: reference.id } : {}),
            });
            try { value.figure.renderChecks = await inspectRenderedFigure(value.data, { preview: true }); }
            catch { value.figure.renderChecks = { unavailable: true }; }
            return value;
          }
          const initialPlan = { stages: groundedPlan };
          artifact = await candidate(initialPlan);
          if (!hasFlowNeeds && !preferredStyle && !designBrief.layout?.match(/^(?:stacked|panels)$/) &&
              flowGeometryScore(artifact.figure.renderChecks) > 0 && !artifact.figure.renderChecks.unavailable) {
            try {
              const compact = await candidate(initialPlan, { ...designBrief, compactSpacing: true });
              if (flowGeometryScore(compact.figure.renderChecks) < flowGeometryScore(artifact.figure.renderChecks)) artifact = compact;
            } catch { signal.throwIfAborted(); }
          }
          const report = artifact.figure.renderChecks;
          const previewImage = report.previewImage;
          delete report.previewImage;
          const defects = flowGeometryScore(report, artifact.figure.structure.isolated.length);
          let critique;
          if (previewImage) {
            try {
              const bytes = Buffer.from(previewImage.split(',')[1], 'base64');
              critique = normalizeFlowCritique(await requestResearchJson(provider, connection,
                compositeFlowCritiqueInstructions, {
                  stages: artifact.figure.flowPlan, checks: report, structure: artifact.figure.structure,
                  referenceNotes: designBrief.prompt, ...reviewNeeds,
                }, AbortSignal.any([signal, AbortSignal.timeout(30000)]), 3000,
                [{ bytes, mime: 'image/png' }]));
            } catch { signal.throwIfAborted(); }
          }
          if (critique) artifact.figure.visualReview = critique;
          if ((!report.unavailable && defects > 0) || artifact.figure.structure.isolated.length || critique?.verdict === 'revise') {
            const refineSignal = AbortSignal.any([signal, AbortSignal.timeout(25_000)]);
            try {
              const improved = await candidate(await requestResearchJson(provider, connection, compositeFlowRevisionInstructions, {
                ...material, draftPlan: artifact.figure.flowPlan, report, critique,
                structuralIssues: artifact.figure.structure.isolated,
              }, refineSignal), artifact.figure.designBrief);
              const next = improved.figure.renderChecks;
              const nextPreview = next.previewImage;
              delete next.previewImage;
              let visualImproved = false;
              if (nextPreview && critique) {
                try {
                  const revised = normalizeFlowCritique(await requestResearchJson(provider, connection,
                    compositeFlowCritiqueInstructions, {
                      stages: improved.figure.flowPlan, checks: next, referenceNotes: designBrief.prompt, ...reviewNeeds,
                    }, AbortSignal.any([signal, AbortSignal.timeout(25000)]), 3000,
                    [{ bytes: Buffer.from(nextPreview.split(',')[1], 'base64'), mime: 'image/png' }]));
                  const severity = review => review.issues.reduce((sum, issue) =>
                    sum + (issue.severity === 'critical' ? 100 : issue.severity === 'major' ? 10 : 1), 0);
                  visualImproved = severity(revised) < severity(critique);
                  improved.figure.visualReview = revised;
                } catch { signal.throwIfAborted(); }
              }
              const nextDefects = flowGeometryScore(next, improved.figure.structure.isolated.length);
              if (preservesFlowContent(artifact.figure.flowPlan, improved.figure.flowPlan) &&
                  Number.isFinite(nextDefects) && nextDefects <= defects &&
                  (visualImproved || !critique && nextDefects < defects ||
                    nextDefects < defects && improved.figure.visualReview?.issues.length === 0)) artifact = improved;
            } catch { signal.throwIfAborted(); }
          }
          if (literature?.papers?.length) {
            try {
              const citationSignal = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
              const bindings = await requestResearchJson(provider, connection, flowEvidenceInstructions,
                { stages: artifact.figure.flowPlan, literature }, citationSignal);
              const citedPlan = normalizeCompositeFlow({ stages: applyFlowEvidence(artifact.figure.flowPlan, bindings) });
              const citedEvidence = verifyFlowEvidence(citedPlan, literature);
              const citedByKey = new Map(citedEvidence.nodes.map(node => [node.key, node]));
              if (artifact.figure.evidence.nodes.every(node => !node.verified || citedByKey.get(node.key)?.verified)) {
                artifact.figure.flowPlan = citedPlan;
                artifact.figure.evidence = citedEvidence;
              }
            } catch (error) {
              signal.throwIfAborted();
              artifact.figure.evidence.error = '节点引文补全未完成，当前仅显示已取得的引用。';
            }
          }
        }
      } else if (dataFigure) {
        const [provider, connection] = studioFigureConnection(config);
        const brief = figureBriefRecord(answers);
        const instructions = conceptLayout ? figureGenerationInstructions + '\n\n' + overviewDetailInstructions : figureGenerationInstructions;
        const basePayload = {
          specification, brief, checks, skills: plottingSkills,
          ...(vectorConcept ? { concept, deliverable: '概念示意、机制图或图形摘要。按材料设计完整矢量插图，突出实体、关系和阅读路径。' } : {}),
          ...(reference ? { revision, previousSvg: Buffer.from(reference.data.split(',')[1], 'base64').toString('utf8') } : {}),
        };
        const baseMeta = {
          brief, model: config.model || connection.model || providers[provider],
          ...(vectorConcept ? { concept } : {}), ...(conceptLayout ? { conceptLayout } : {}),
          ...(reference ? { revision, referenceId: reference.id } : {}),
        };
        artifact = await agentFigureArtifact(provider, connection, instructions, basePayload, specification, baseMeta, signal, 16000);
        if (input?.visionRefine !== false) {
          artifact = await runVisionRefineLoop(artifact, config, signal, pictureType, async ({ artifact: prev, hint, renderedPng, round }) => {
            const canSeeImage = detectCapability(provider, connection.model || providers[provider],
              normalizeCapabilityOverrides(store.setting('studio:capabilities'))).vision;
            return agentFigureArtifact(provider, connection, instructions, {
              ...basePayload,
              revision: hint,
              previousSvg: svgTextOf(prev.data),
              visionRefineRound: round,
            }, specification, { ...baseMeta, engine: 'vision-refined' }, signal, 16000, canSeeImage && renderedPng ? [renderedPng] : []);
          }, 2);
        }
      } else if (gptConcept) {
        const key = unseal(studioImageSecret(config, 'openai'));
        const record = figureBriefRecord(answers, { includeSkipped: true });
        const brief = record.filter(item => !item.skipped);
        const title = reference?.title || clean(input.figure?.title, 120) || 'GPT 科研示意图';
        const original = reference?.concept.prompt || concept;
        artifact = rasterChoice === 'minimax'
          ? await makeReadableMiniMaxImage(conceptImagePrompt({ title, audience: record[2]?.selections, brief, concept: original, revision, skills: plottingSkills, conceptLayout }),
            unseal(studioImageSecret(config, 'minimax')), signal, config)
          : await makeGptFigure({
            prompt: conceptImagePrompt({ title, audience: record[2]?.selections, brief, concept: original, revision, skills: plottingSkills, conceptLayout }),
            title, key: unseal(studioImageSecret(config, 'openai')), signal, reference: reference?.data, model: config.imageModel || undefined,
          });
        artifact.concept = { brief, prompt: original, ...(conceptLayout ? { conceptLayout } : {}),
          ...(reference ? { revision, referenceId: reference.id } : {}) };
      } else if (gptIllustration) {
        const description = [prompt, context?.summary?.abstract || context?.title].filter(Boolean).join('\n');
        artifact = rasterChoice === 'minimax'
          ? await makeReadableMiniMaxImage(description, unseal(studioImageSecret(config, 'minimax')), signal, config)
          : await makeGptFigure({ prompt: description, title: '自由配图',
            key: unseal(studioImageSecret(config, 'openai')), signal, model: config.imageModel || undefined });
      } else if (type === 'image' && workflow !== 'agent' && config.imageMode === 'minimax' && rasterChoice === 'minimax') {
        const brief = [prompt, context?.summary?.abstract || context?.title, ...skills.map(skill => skill.text.slice(0, 250))].filter(Boolean).join('\n');
        artifact = await makeReadableMiniMaxImage(brief, unseal(studioImageSecret(config, 'minimax')), signal, config);
      } else {
        const [provider, connection] = studioFigureConnection(config);
        const instructions = type === 'slides' ?
          '生成适合研究汇报的 PPT。讨论材料仅作内容来源，区分事实与计划。返回 {"title":"总标题","slides":[{"title":"页标题","points":["要点"]}]}，最多十页，每页一到五条。' :
          figureGenerationInstructions;
        if (type === 'slides') {
          artifact = normalizeStudioSlides(await requestResearchJson(provider, connection, instructions,
            { prompt, context, skills }, signal, 4096));
        } else {
          const fallbackSpec = normalizeFigureDraft();
          const fallbackMeta = { model: config.model || connection.model || providers[provider] };
          artifact = await agentFigureArtifact(provider, connection, instructions, { prompt, context, skills: plottingSkills },
            fallbackSpec, fallbackMeta, signal, 16000);
          if (input?.visionRefine !== false) {
            artifact = await runVisionRefineLoop(artifact, config, signal, pictureType, async ({ artifact: prev, hint, renderedPng, round }) => {
              const canSeeImage = detectCapability(provider, connection.model || providers[provider],
                normalizeCapabilityOverrides(store.setting('studio:capabilities'))).vision;
              return agentFigureArtifact(provider, connection, instructions, {
                prompt, context, skills: plottingSkills,
                revision: hint,
                previousSvg: svgTextOf(prev.data),
                visionRefineRound: round,
              }, fallbackSpec, { ...fallbackMeta, engine: 'vision-refined' }, signal, 16000, canSeeImage && renderedPng ? [renderedPng] : []);
            }, 2);
          }
        }
        const image = studioArtifact(input?.coverId);
        if (type === 'slides' && image?.type === 'image' && /^data:image\/(png|jpeg);base64,/.test(image.data)) artifact.cover = image.data;
      }
      if (artifact.figure && !artifact.figure.renderChecks) {
        signal.throwIfAborted();
        try { artifact.figure.renderChecks = await inspectRenderedFigure(artifact.data); }
        catch { artifact.figure.renderChecks = { unavailable: true }; }
      }
      if (artifact.figure) {
        artifact.figure.quality = lintVenueFigure(svgTextOf(artifact.data), artifact.figure.renderChecks);
        if (artifact.figure.engine !== 'local-fallback' && !artifact.figure.visionReview) {
          const review = await visionReviewOf(artifact, config, signal, pictureType);
          if (review) {
            const { _pngDataUrl, ...cleanReview } = review;
            artifact.figure.visionReview = { ...cleanReview, rounds: 1, refined: false };
          }
        }
        const vr = artifact.figure.visionReview;
        artifact.figure.superAgentTrace = [
          { role: 'router', label: 'Router · 规划路由', status: 'done', detail: `${pictureType} · ${workflow || 'auto'}` },
          { role: 'researcher', label: 'Researcher · 依据校验', status: 'done', detail: artifact.figure.evidence?.nodes?.length ? `${artifact.figure.evidence.nodes.length} 条引文核验` : '结构与数据规范校验' },
          { role: 'drawer', label: 'Drawer · 绘图引擎', status: 'done', detail: `${artifact.figure.model || '本地矢量引擎'}${vr?.refined ? ` · 精修 ${vr.rounds} 轮` : ''}` },
          { role: 'critic', label: 'Vision Critic · 视觉复核', status: vr ? (vr.valid ? 'done' : 'attention') : 'skipped', detail: vr ? (vr.valid ? `视觉通过${vr.score != null ? ` (${vr.score}/10)` : ''}` : `发现 ${vr.issues.length} 项可修问题${vr.score != null ? ` (${vr.score}/10)` : ''}`) : '未接入视觉模型（仅几何质检）' },
        ];
      }
      signal.throwIfAborted();
      store.studio.record(artifact, projectId);
      return artifact;
    } catch (error) {
      if (controller.signal.aborted) return null;
      if (signal.aborted) throw new Error('图文生成超时：所选模型绘制过慢，建议改用非推理型绘图模型后重试。');
      if (input?.type === 'image' || input?.type === 'concept' || dataFigure) {
        // 保证出图：模型或接口失败时仍产出可编辑的本地兜底流程图，并记录失败原因。
        const fallback = localFallbackArtifact({
          title: clean(input?.figure?.title, 60) || '研究方法流程',
          text: [prompt, concept, input?.flowPrompt].filter(Boolean).join('；'),
          specification: specification || input?.figure,
        });
        fallback.figure.fallbackReason = String(error?.message || '生成失败').slice(0, 160);
        store.studio.record(fallback, projectId);
        return fallback;
      }
      throw error;
    } finally {
      studioRequest = undefined;
      publishStudio();
    }
  });
  handle('studio:cancel', workspace, () => studioRequest?.controller.abort());
  handle('studio:export', workspace, async (id, format) => {
    const artifact = studioArtifact(id);
    if (!artifact) throw new Error('图文内容已不可用。');
    const allowed = artifact.figure?.designBrief ? ['svg', 'pdf', 'png', 'json', 'zip'] : ['svg', 'pdf', 'png', 'json'];
    if (Array.isArray(artifact.figure?.flowPlan)) allowed.push('d2');
    const extension = artifact.figure && allowed.includes(format) ? format :
      artifact.type === 'slides' ? 'pptx' : artifact.data.startsWith('data:image/jpeg') ? 'jpg' :
      artifact.data.startsWith('data:image/png') ? 'png' : 'svg';
    const defaultPath = artifact.title.replace(/[<>:"/\\|?*]/g, '').slice(0, 65) || 'Sparkseed';
    const picked = await dialog.showSaveDialog(main, { defaultPath: defaultPath + '.' + extension,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }] });
    if (picked.canceled || !picked.filePath) return false;
    let data;
    if (artifact.type === 'slides') data = await makePresentation(artifact);
    else if (extension === 'zip') data = await exportFlowArchive(artifact);
    else if (extension === 'json') data = JSON.stringify({
      format: 'sparkseed-scientific-figure', version: 1, ...artifact.figure,
    }, null, 2);
    else if (extension === 'd2') data = flowPlanToD2(artifact.figure.flowPlan, {
      title: artifact.figure.specification?.title || artifact.title,
      layout: artifact.figure.flowLayout?.name === 'ELK' ? 'elk' : 'tala',
    });
    else if (artifact.figure && extension !== 'svg') data = await renderFigureExport(artifact.data, extension);
    else data = Buffer.from(artifact.data.split(',')[1], 'base64');
    await writeFile(picked.filePath, data);
    return true;
  });
  handle('notebook:get', workspace, () => store.setting('notebook:draft') || { html: '', text: '' });
  handle('notebook:save', workspace, value => {
    if (typeof value?.html !== 'string' || typeof value?.text !== 'string' || value.html.length > 100_000 || value.text.length > 32_000) {
      throw new Error('记录本内容过长。');
    }
    store.set('notebook:draft', { html: value.html, text: value.text });
  });
  handle('notes:list', workspace, filter => store.notes.list({
    sourceType: clean(filter?.sourceType, 20), query: clean(filter?.query, 100), tag: clean(filter?.tag, 30),
  }));
  handle('notes:get', workspace, id => store.notes.get(clean(id, 80)));
  handle('notes:save', workspace, input => {
    const row = store.notes.save({ ...input, id: clean(input?.id, 80) || undefined });
    publishNotes();
    return row;
  });
  handle('notes:remove', workspace, id => {
    store.notes.remove(clean(id, 80));
    publishNotes();
    return true;
  });
  handle('notes:pin', workspace, (id, pinned) => {
    store.notes.pin(clean(id, 80), pinned === true);
    publishNotes();
  });
  handle('notes:for-idea', workspace, ideaId => {
    const idea = store.get(clean(ideaId, 80));
    if (!idea) throw new Error('讨论不存在。');
    return store.notes.forIdea(idea.id) || { html: '', text: '' };
  });
  handle('notes:save-idea', workspace, (ideaId, value) => {
    const idea = store.get(clean(ideaId, 80));
    if (!idea) throw new Error('讨论不存在。');
    const row = store.notes.ensureIdea(idea.id, '讨论记录本');
    const saved = store.notes.save({ ...row, ...value, id: row.id, sourceType: 'idea', sourceId: idea.id });
    publishNotes();
    return saved;
  });
  handle('ideas:organize', workspace, id => {
    const idea = store.get(clean(id, 80));
    const provider = store.setting('provider');
    if (!idea || !provider || !agentAvailable(provider) || (idea.analysis?.title && idea.analysis?.abstract) ||
        ['queued', 'running', 'failed', 'paused'].includes(idea.synthesisStatus)) return;
    scheduleResearch(idea, ['synthesis']);
  });
  handle('papers:citations', workspace, async (id, options = {}) => {
    const paper = store.papers.get(clean(id, 80));
    if (!paper) throw new Error('论文不存在。');
    const cached = store.papers.citation.get(paper.id);
    const direction = options?.direction === 'citations' ? 'citations' : 'references';
    const hasCache = direction === 'references' ? cached.meta.referenceAt : cached.meta.citationAt;
    if (!options?.refresh && hasCache) return citationView(paper, cached);
    try {
      const graph = await fetchCitationGraph(paper, {
        openalexKey: unseal(store.setting('openalexKey')),
        semanticKey: unseal(store.setting('semanticScholarKey')),
        signal: AbortSignal.timeout(25000),
      });
      store.papers.citation.save(paper.id, graph);
      if (Number.isFinite(graph.seedCitationCount) && graph.seedCitationCount !== paper.citation_count) {
        store.papers.updateMeta(paper.id, { citationCount: graph.seedCitationCount });
        if (!quitting) main.webContents.send('papers:changed');
      }
    } catch (error) {
      const value = citationView(paper, cached);
      value.error = error.message;
      return value;
    }
    return citationView(paper, store.papers.citation.get(paper.id));
  });
  handle('papers:compare', workspace, async (ids, options = {}) => {
    const paperIds = [...new Set((Array.isArray(ids) ? ids : []).map(id => clean(id, 80)).filter(Boolean))];
    if (paperIds.length < 2 || paperIds.length > 4) throw new Error('请选择 2 到 4 篇论文。');
    const papers = paperIds.map(id => store.papers.get(id));
    if (papers.some(paper => !paper)) throw new Error('有论文已不在库中。');
    const enriched = papers.map(paper => ({
      ...paper,
      triage: store.papers.triage.get(paper.id),
      note: store.papers.notes.get(paper.id).text,
    }));
    const key = comparisonCacheKey(paperIds);
    const metadata = metadataRows(enriched);
    const summary = papers.map(paper => ({ id: paper.id, title: paper.title, year: paper.year }));
    let cached = store.papers.comparison.get(key);
    if (cached && options?.generate !== true) {
      const savedIndex = new Map(cached.paperIds.map((id, index) => [id, index]));
      cached = paperIds.every(id => savedIndex.has(id))
        ? { ...cached, rows: cached.rows.map(row => ({
          label: row.label, values: paperIds.map(id =>
            (Array.isArray(row.values) ? row.values[savedIndex.get(id)] : '') ?? ''),
        })) }
        : null;
    }
    if (options?.generate === true) {
      const provider = store.setting('provider');
      if (!provider || !agentAvailable(provider)) throw new Error('请先在偏好设置中接入 Agent，再生成对比。');
      const output = await requestResearchJson(provider, configFor(provider), comparisonInstructions(),
        { papers: comparisonPayload(enriched) }, AbortSignal.timeout(45000));
      const rows = normalizeComparison(output, papers.length);
      cached = store.papers.comparison.save(key, paperIds, rows, { generated: true, model: provider });
    }
    return {
      paperIds, metadata, papers: summary,
      rows: cached?.rows || [], generated: Boolean(cached?.generated),
      model: cached?.model || '', updated: cached?.updated || null,
      notice: cached?.generated ? '' : '先看元数据对比；接入 Agent 后可补全问题、方法、结论与局限。',
    };
  });
  handle('papers:list', workspace, () => store.papers.list());
  handle('papers:search-config', workspace, () => {
    const saved = store.setting('paperSearchSources');
    return { sources: Array.isArray(saved) ? saved.filter(id => SOURCE_IDS.includes(id)) : SOURCE_IDS,
      hasSemanticKey: Boolean(store.setting('semanticScholarKey')),
      hasOpenAlexKey: Boolean(store.setting('openalexKey')) };
  });
  handle('papers:search-config-save', workspace, input => {
    const sources = Array.isArray(input?.sources) ? input.sources.filter(id => SOURCE_IDS.includes(id)) : SOURCE_IDS;
    if (!sources.length) throw new Error('请至少保留一个检索来源。');
    store.set('paperSearchSources', sources);
    if (input?.clearSemanticKey) store.set('semanticScholarKey', '');
    else if (clean(input?.semanticKey, 200)) store.set('semanticScholarKey',
      safeStorage.encryptString(clean(input.semanticKey, 200)).toString('base64'));
    if (input?.clearOpenAlexKey) store.set('openalexKey', '');
    else if (clean(input?.openalexKey, 200)) store.set('openalexKey',
      safeStorage.encryptString(clean(input.openalexKey, 200)).toString('base64'));
  });
  handle('papers:search-sources', workspace, async input => {
    const requestId = clean(input?.requestId, 80) || randomUUID();
    const requested = Array.isArray(input?.sources) ? input.sources.filter(id => SOURCE_IDS.includes(id)) : SOURCE_IDS;
    const controller = new AbortController();
    searchControllers.set(requestId, controller);
    try {
      const value = await searchAll(clean(input?.query, 300), {
        sources: requested, signal: controller.signal,
        semanticKey: unseal(store.setting('semanticScholarKey')),
        openalexKey: unseal(store.setting('openalexKey')),
      });
      return { ...value, requestId };
    } finally { searchControllers.delete(requestId); }
  });
  handle('papers:search-cancel', workspace, requestId => {
    searchControllers.get(clean(requestId, 80))?.abort();
  });
  handle('papers:import-from-search', workspace, async input => {
    const meta = resultMeta(input?.result);
    const existing = meta.doi ? store.papers.byDoi(meta.doi) : null;
    if (existing && !(input?.retry === true && existing.status === 'linked')) {
      return { paperId: existing.id, downloaded: existing.status !== 'linked',
        reason: existing.status === 'linked' ? '这篇论文已在库中，目前只有论文信息。' : '' };
    }
    let paperId = existing?.id || '';
    let downloaded = false;
    let reason = '';
    if (meta.pdfUrl) {
      try {
        const { data } = await downloadPdf(meta.pdfUrl, { signal: AbortSignal.timeout(25000) });
        const filename = (meta.arxiv || meta.doi.replace(/[^\w.-]+/g, '-') || 'paper') + '.pdf';
        if (existing?.status === 'linked') {
          const hash = createHash('sha256').update(data).digest('hex');
          const duplicate = store.papers.byHash(hash);
          if (duplicate && duplicate.id !== existing.id) {
            paperId = existing.id;
            reason = '相同 PDF 已在论文库中。';
          } else {
            await mkdir(paperDirectory, { recursive: true });
            await writeFile(paperPath(paperDirectory, existing.id), data);
            store.papers.upgradeLinked(existing.id, { hash, filename });
            paperId = existing.id;
            downloaded = true;
          }
        } else {
          const imported = await importPaperBytes(store.papers, paperDirectory, filename, data);
          paperId = imported.id;
          downloaded = true;
        }
      } catch (error) {
        reason = error.message || 'PDF 下载失败，可打开原文查看。';
      }
    } else {
      reason = '这篇论文没有开放 PDF，已收入论文信息。';
    }
    if (!paperId) {
      paperId = randomUUID();
      store.papers.createLinked({ id: paperId, title: meta.title, author: meta.author, doi: meta.doi,
        arxivId: meta.arxiv, year: meta.year, venue: meta.venue, abstract: meta.abstract,
        sourceUrl: meta.sourceUrl, pdfUrl: meta.pdfUrl, citationCount: meta.citationCount });
    } else {
      store.papers.updateMeta(paperId, { doi: meta.doi, arxivId: meta.arxiv, year: meta.year,
        venue: meta.venue, abstract: meta.abstract, sourceUrl: meta.sourceUrl, pdfUrl: meta.pdfUrl,
        citationCount: meta.citationCount ?? undefined });
    }
    if (!quitting) {
      main.webContents.send('papers:changed');
      paperQueue.run();
    }
    return { paperId, downloaded, reason };
  });
  handle('paper-categories:list', workspace, () => store.papers.categories.list());
  handle('paper-categories:save', workspace, input => {
    const rows = store.papers.categories.save({
      id: clean(input?.id, 80) || undefined, name: clean(input?.name, 60),
      parentId: clean(input?.parentId, 80) || null,
      color: /^#[0-9a-f]{6}$/i.test(input?.color || '') ? input.color : '',
    });
    if (!quitting) main.webContents.send('papers:changed');
    return rows;
  });
  handle('paper-categories:remove', workspace, id => {
    const rows = store.papers.categories.remove(clean(id, 80));
    if (!quitting) main.webContents.send('papers:changed');
    return rows;
  });
  handle('paper-categories:assign', workspace, (paperId, categoryId, assigned) => {
    store.papers.categories.assign(clean(paperId, 80), clean(categoryId, 80), assigned === true);
    if (!quitting) main.webContents.send('papers:changed');
  });
  handle('papers:favorite', workspace, (id, value) => {
    store.papers.setFavorite(clean(id, 80), value === true);
    if (!quitting) main.webContents.send('papers:changed');
  });
  handle('papers:rate', workspace, (id, value) => {
    store.papers.setRating(clean(id, 80), Number.isInteger(value) && value >= 1 && value <= 5 ? value : null);
    if (!quitting) main.webContents.send('papers:changed');
  });
  handle('papers:read-status', workspace, (id, value) => {
    store.papers.setReadStatus(clean(id, 80), value);
    if (!quitting) main.webContents.send('papers:changed');
  });
  handle('papers:rating-config', workspace, () => ({ hasEasyScholar: Boolean(store.setting('easyScholarSecret')) }));
  handle('papers:rating-config-save', workspace, input => {
    if (input?.clear) store.set('easyScholarSecret', '');
    else if (clean(input?.secret, 200)) store.set('easyScholarSecret',
      safeStorage.encryptString(clean(input.secret, 200)).toString('base64'));
  });
  handle('papers:journal-rating', workspace, async (id, refresh) => {
    const paper = store.papers.get(clean(id, 80));
    if (!paper) throw new Error('论文不存在。');
    let cached = null;
    try { cached = paper.journal_rating ? JSON.parse(paper.journal_rating) : null; } catch { cached = null; }
    const age = paper.journal_rating_at ? Date.now() - Date.parse(paper.journal_rating_at) : Infinity;
    if (!refresh && cached && age < 30 * 24 * 60 * 60 * 1000) return cached;
    const secret = unseal(store.setting('easyScholarSecret'));
    if (!secret) {
      if (cached) return cached;
      throw new Error('请先在论文库设置中填写 easyScholar 密钥。');
    }
    const value = await fetchJournalRank(paper.venue, secret, { signal: AbortSignal.timeout(15000) });
    store.papers.saveJournalRating(paper.id, value);
    if (!quitting) main.webContents.send('papers:changed');
    return value;
  });
  handle('papers:auto-classify', workspace, async id => {
    const paper = store.papers.get(clean(id, 80));
    if (!paper) throw new Error('论文不存在。');
    const provider = store.setting('provider');
    if (!provider) throw new Error('请先在偏好设置中接入 Agent。');
    const existing = [...new Set(store.papers.categories.list().map(row => row.name))];
    const controller = new AbortController();
    classifyRequests.add(controller);
    try {
      const output = await requestResearchJson(provider, configFor(provider),
        classifyInstructions(existing), { title: paper.title, abstract: paper.abstract,
          venue: paper.venue, author: paper.author },
        AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]));
      const names = cleanCategoryNames(output?.categories, existing);
      if (!names.length) throw new Error('Agent 没有给出可用的分类建议。');
      return { categories: names, current: paper.categoryIds || [] };
    } finally { classifyRequests.delete(controller); }
  });
  handle('paper-annotations:list', workspace, paperId => store.papers.annotations.list(clean(paperId, 80)));
  handle('paper-annotations:save', workspace, input => {
    const row = store.papers.annotations.save({ ...input, paperId: clean(input?.paperId, 80) });
    if (!quitting) main.webContents.send('annotations:changed', row.paperId);
    return row;
  });
  handle('paper-annotations:remove', workspace, id => {
    const paperId = store.papers.annotations.remove(clean(id, 80));
    if (!quitting) main.webContents.send('annotations:changed', paperId);
    return true;
  });
  handle('paper-notes:get', workspace, paperId => store.papers.notes.get(clean(paperId, 80)));
  handle('paper-notes:save', workspace, (paperId, value) => store.papers.notes.save(clean(paperId, 80), value));
  handle('reader:layout-get', workspace, () => normalizeReaderLayout(store.setting('readerLayout')));
  handle('reader:layout-save', workspace, value => {
    const layout = normalizeReaderLayout(value);
    store.set('readerLayout', layout);
    return layout;
  });
  handle('desk:triage-get', workspace, id => store.papers.triage.get(clean(id, 80)));
  handle('desk:triage-save', workspace, (id, value) => store.papers.triage.save(clean(id, 80), value));
  handle('desk:plain-get', workspace, (id, page) => store.papers.insights.get(clean(id, 80), Number(page) || 1, 'plain'));
  handle('desk:insight-get', workspace, (id, page, kind) => store.papers.insights.get(clean(id, 80), Number(page) || 1, clean(kind, 30) || 'plain'));
  handle('desk:insight-save', workspace, input => store.papers.insights.save({ ...input, paperId: clean(input?.paperId, 80) }));
  handle('desk:plain', workspace, async (id, page, refresh) => {
    const paper = store.papers.get(clean(id, 80));
    if (!paper) throw new Error('论文不存在。');
    const pageNumber = Math.max(1, Number(page) || 1);
    const cached = store.papers.insights.get(paper.id, pageNumber, 'plain');
    if (cached && refresh !== true) return cached;
    const text = store.papers.page(paper.id, pageNumber)?.text;
    if (!text) throw new Error('本页没有可提取的文字。');
    const provider = store.setting('provider');
    if (!provider) throw new Error('请先在偏好设置中接入 Agent。');
    const output = await requestResearchJson(provider, configFor(provider), plainInstructions(), {
      title: paper.title, page: pageNumber, text: text.slice(0, 12000),
    }, AbortSignal.timeout(40000));
    const value = normalizePlain(output, { [pageNumber]: text });
    return store.papers.insights.save({ paperId: paper.id, page: pageNumber, kind: 'plain',
      text: value.summary, citations: value.citations, supported: value.supported });
  });
  handle('desk:glossary-list', workspace, id => store.papers.glossary.list(clean(id, 80)));
  handle('desk:glossary-define', workspace, async input => {
    const paper = store.papers.get(clean(input?.paperId, 80));
    if (!paper) throw new Error('论文不存在。');
    const term = clean(input?.term, 120);
    if (!term) throw new Error('请先选择要解释的术语。');
    const page = Math.max(1, Number(input?.page) || 1);
    const text = store.papers.page(paper.id, page)?.text || '';
    if (!text) throw new Error('本页没有可提取的文字。');
    const provider = store.setting('provider');
    if (!provider) throw new Error('请先在偏好设置中接入 Agent。');
    const output = await requestResearchJson(provider, configFor(provider), glossaryInstructions(), {
      title: paper.title, page, term, context: text.slice(0, 8000),
    }, AbortSignal.timeout(30000));
    const value = normalizeGlossary(output, { term, page, text });
    return store.papers.glossary.save({ paperId: paper.id, ...value });
  });
  handle('desk:glossary-remove', workspace, id => store.papers.glossary.remove(clean(id, 80)));
  handle('desk:quiz-list', workspace, id => store.papers.review.list(clean(id, 80)));
  handle('desk:quiz-generate', workspace, async id => {
    const paper = store.papers.get(clean(id, 80));
    if (!paper) throw new Error('论文不存在。');
    const provider = store.setting('provider');
    if (!provider) throw new Error('请先在偏好设置中接入 Agent。');
    await generateQuizForPaper(paper, AbortSignal.timeout(45000));
    return store.papers.review.list(paper.id);
  });
  handle('desk:quiz-review', workspace, (id, rating) => store.papers.review.review(clean(id, 80), rating));
  handle('papers:save-arxiv', workspace, async (jobId, paperId) => {
    const job = store.work.get(clean(jobId, 80));
    const paper = job?.progress.result?.papers?.find(row => row.id === paperId);
    if (!paper?.arxiv) throw new Error('当前来源没有可收录的开放 PDF。');
    const data = await fetchArxivPdf(paper.arxiv, AbortSignal.timeout(25000));
    if (quitting) return null;
    const result = await importPaperBytes(store.papers, paperDirectory, paper.arxiv.replace('/', '-') + '.pdf', data);
    if (!quitting) {
      main.webContents.send('papers:changed');
      paperQueue.run();
    }
    return result.id;
  });
  handle('window:star-surface', workspace, enabled => {
    starSurface = enabled === true;
    if (process.platform === 'win32') main.setTitleBarOverlay(titlebar(starSurface
      ? { canvas: '#080b17', symbols: '#eceaff' } : palettes[appearance().palette]));
  });
  handle('papers:bytes', workspace, async id => {
    const paper = store.papers.get(clean(id, 80));
    if (!paper) throw new Error('这份 PDF 已不可用。');
    return new Uint8Array(await readFile(paperPath(paperDirectory, paper.id)));
  });
  handle('papers:asset', workspace, async (kind, filename) => {
    if (!Object.hasOwn(pdfAssets, kind) || typeof filename !== 'string' ||
        !/^[\w-]+\.(?:bcmap|pfb|ttf|wasm)$/.test(filename)) throw new Error('无效的 PDF 字体或渲染资源。');
    return new Uint8Array(await readFile(join(runtime.pdfjs, pdfAssets[kind], filename)));
  });
  handle('papers:translate', workspace, async input => {
    const id = clean(input?.id, 80);
    const request = clean(input?.request, 80);
    const { page, lookup } = input || {};
    const paper = store.papers.get(id);
    if (!paper || !Number.isSafeInteger(page) || page < 1 || page > paper.page_count) return null;
    const source = typeof input.selection === 'string' ? input.selection.trim() : store.papers.page(id, page)?.text;
    if (!source) return null;
    if (source.length > 24000) throw new Error('选区过长，请缩小选择范围。');
    const key = createHash('sha256').update('zh-CN\0').update(source).digest('hex');
    const saved = store.papers.translation(id, page, key);
    if (saved || lookup) return saved || null;
    if (!request || [...translations.values()].some(item => item.paperId === id)) {
      throw new Error('这篇论文已有翻译任务在运行，请稍后再试。');
    }
    const provider = store.setting('provider');
    if (!Object.hasOwn(providers, provider)) throw new Error('请在设置中选择默认 Agent，再开始翻译。');
    const controller = new AbortController();
    translations.set(request, { controller, paperId: id });
    try {
      const text = await translatePaperText(provider, configFor(provider), source, controller.signal);
      controller.signal.throwIfAborted();
      store.papers.saveTranslation(id, page, key, text);
      return text;
    } catch (error) {
      if (controller.signal.aborted) return null;
      if (error.name === 'TimeoutError') throw new Error('翻译超时，可以重试。');
      throw error;
    } finally {
      translations.delete(request);
    }
  });
  handle('papers:stop-translation', workspace, request => translations.get(clean(request, 80))?.controller.abort());
  handle('papers:import', workspace, async () => {
    const result = await dialog.showOpenDialog(main, { title: '导入论文 PDF', properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF 文档', extensions: ['pdf'] }] });
    const report = { added: 0, duplicates: 0, errors: [] };
    if (result.canceled) return report;
    for (const file of result.filePaths) {
      if (quitting) break;
      try {
        const paper = await importPaper(store.papers, paperDirectory, file);
        if (paper.duplicate) report.duplicates++;
        else report.added++;
      } catch (error) {
        const reason = error.code ? '无法读取或保存 PDF。' : error.message;
        report.errors.push(basename(file) + ' · ' + reason);
      }
    }
    main.webContents.send('papers:changed');
    paperQueue.run();
    return report;
  });
  handle('papers:page', workspace, (id, page) => {
    if (!Number.isSafeInteger(page) || page < 1) throw new Error('页码无效。');
    return store.papers.page(clean(id, 80), page) || null;
  });
  handle('papers:search', workspace, (id, query) => {
    const term = clean(query, 160);
    return term ? store.papers.search(clean(id, 80), term) : [];
  });
  handle('papers:retry', workspace, id => {
    const paper = store.papers.get(clean(id, 80));
    if (paper?.status !== 'failed') return;
    store.papers.finish(paper.id, 'queued');
    main.webContents.send('papers:changed');
    paperQueue.run();
  });
  handle('papers:open', workspace, async id => {
    const paper = store.papers.get(clean(id, 80));
    if (!paper) throw new Error('这份 PDF 已不可用。');
    if (await shell.openPath(paperPath(paperDirectory, paper.id))) throw new Error('无法打开 PDF，请检查本机 PDF 阅读器。');
  });
  handle('ideas:rate', workspace, (id, field, rating) => {
    store.rateIdea(clean(id, 80), field, rating);
    publish();
  });
  handle('ideas:pin', workspace, (id, pinned) => {
    store.pinIdea(clean(id, 80), pinned);
    publish();
  });
  handle('ideas:remove', workspace, input => {
    const id = clean(input, 80);
    if (!store.get(id)) return;
    store.removeIdea(id);
    if (active?.id === id) active.controller.abort();
    for (const task of researchTasks()) if (task.ideaId === id) task.controller.abort();
    publish();
    publishResearch(id);
  });
  handle('settings:library-view', workspace, view => {
    if (view !== 'cards' && view !== 'stars') throw new Error('未知 Idea 库视图。');
    store.set('libraryView', view);
  });
  handle('settings:sidebar-width', workspace, width => {
    store.set('sidebarWidth', normalizeSidebarWidth(width));
  });
  handle('ideas:create', workspace, (input, openDiscussion = true) => {
    const saved = createIdea(input);
    publish(openDiscussion === false ? undefined : saved.id);
    void processQueue();
    scheduleResearch(saved, ['initial', 'synthesis']);
    return saved.id;
  });
  handle('capture:clipboard', workspace, () => clipboard.readText().slice(0, 16000));
  handle('capture:dictate', workspace, async id => {
    if (dictation) throw new Error('已有一处正在听写。');
    const controller = new AbortController();
    dictation = { id: clean(id, 80), controller };
    try { return await dictate(controller.signal); }
    finally { dictation = null; }
  });
  handle('capture:stop-dictation', workspace, id => {
    if (dictation?.id === clean(id, 80)) dictation.controller.abort();
  });
  handle('capture:take', workspace, () => {
    const requested = captureRequested;
    captureRequested = false;
    return requested;
  });
  handle('ideas:ask', workspace, (id, response, selectedProvider) => {
    const idea = store.get(clean(id, 80));
    if (!idea || ['queued', 'running'].includes(idea.status)) return;
    if (selectedProvider && (response || !agentAvailable(selectedProvider))) throw new Error('请选择一个可用的 Agent 重试。');
    const provider = selectedProvider || store.setting('provider');
    const discussion = idea.discussion;
    const previous = discussion.at(-1);
    const artifact = studioReference(response?.artifact);
    const paperTitle = clean(response?.paper?.title, 500);
    const paper = paperTitle && Number.isSafeInteger(response?.paper?.page) && response.paper.page > 0
      ? { title: paperTitle, page: response.paper.page, excerpt: clean(response.paper.excerpt, 8000),
        ...(response.paper.translation ? { translation: clean(response.paper.translation, 8000) } : {}) } : null;
    const paused = response?.pause === true;
    const recordOnly = paused || response?.recordOnly === true;
    if (response && previous?.question && !previous.answer) {
      const indexes = Array.isArray(response.options) ? new Set(response.options) : new Set();
      const options = previous.options.filter((_, index) => indexes.has(index));
      const note = clean(response.note, 1500);
      const skipped = response.skip === true || (paused && !options.length && !note && !paper && !artifact);
      if (!options.length && !note && !skipped && !paper && !artifact) throw new Error('请选择、补一句、带入材料，或者跳过。');
      previous.answer = {
        options,
        note,
        skipped,
        ...(paused ? { paused: true } : {}),
        ...(paper && !skipped ? { paper } : {}),
        ...(artifact && !skipped ? { artifact } : {}),
      };
    } else if (previous?.question && !previous.answer) {
      return;
    } else if (response) {
      const message = clean(response.note, 8000);
      if (!message && !paper && !artifact) throw new Error('请先写下一点线索。');
      discussion.push({ message, ...(paper ? { paper } : {}), ...(artifact ? { artifact } : {}) });
    } else if (!provider) {
      throw new Error('请先在设置里选择 AI 后端。');
    }
    const nextProvider = recordOnly ? '' : provider;
    store.update(idea.id, nextProvider ? 'queued' : 'idle', nextProvider, null, discussion);
    if (response && response.skip !== true) rememberExplicitRequest(store, idea.id, response.note);
    publish();
    if (nextProvider) void processQueue();
    if (response && response.skip !== true && (!paused || response.note || response.options?.length)) {
      const current = store.get(idea.id);
      scheduleResearch(current, ['synthesis', 'initial'], recordDiscussionReply(store, current));
      scheduleMemorySummary(idea.id);
    }
  });
  handle('ideas:cancel', workspace, id => {
    if (active?.id === id) active.controller.abort();
    else {
      const idea = store.get(clean(id, 80));
      if (idea?.status === 'queued') {
        store.update(id, 'idle', idea.provider);
        publish();
      }
    }
  });
  handle('notifications:test', workspace, () => {
    if (!Notification.isSupported()) throw new Error('当前系统不支持桌面通知。');
    const notification = new Notification({
      title: 'Sparkseed · 通知已开启',
      body: '重要研究结果或需要处理的票据会在这里提醒你。',
      icon: brandIcon,
    });
    notification.on('click', showMain);
    notification.show();
    return true;
  });
  handle('settings:get', workspace, () => ({
    provider: store.setting('provider') || '',
    automaticResearch: store.setting('automaticResearch') !== false,
    researchNotifications: store.setting('researchNotifications') !== false,
    dataFolder: app.getPath('userData'),
    appVersion: app.getVersion(),
    updateSource: store.setting('updateSource') || '',
    sidebarWidth: normalizeSidebarWidth(store.setting('sidebarWidth')),
    libraryView: store.setting('libraryView') === 'stars' ? 'stars' : 'cards',
    shortcut: shortcuts[registered] || '',
    voiceShortcut: voiceShortcutRegistered ? 'Ctrl+Shift+Alt+Space' : '',
    shortcutChoice: store.setting('shortcut') || defaultShortcut,
    shortcuts,
    entries: Object.entries(providers).map(([id, label]) => {
      const config = apiProviders.has(id) ? store.setting(id) : undefined;
      const defaults = apiPresetDefaults(id);
      return { id, label, ready: agentAvailable(id), installed: !apiProviders.has(id) && Boolean(findCli(id)),
        base: config?.base || defaults.base, model: config?.model || defaults.model || store.setting('cli:model:' + id) || '',
        hasKey: Boolean(config?.secret), preset: apiProviders.has(id) && id !== 'custom' && id !== 'custom-anthropic', api: apiProviders.has(id),
        test: connectionResults.get(id) };
    }),
  }));
  handle('notifications:research', workspace, enabled => store.set('researchNotifications', enabled === true));
  handle('updates:check', workspace, async source => {
    const url = updateUrl(source);
    const result = await checkRelease(url, app.getVersion());
    store.set('updateSource', url);
    return result;
  });
  handle('updates:clear', workspace, () => store.set('updateSource', ''));
  handle('settings:open-data-folder', workspace, async () => {
    const failure = await shell.openPath(app.getPath('userData'));
    if (failure) throw new Error('无法打开本地数据文件夹。');
  });
  handle('appearance:get', workspace, appearance);
  handle('research:get', workspace, () => readResearchProfile(store));
  handle('research:save', workspace, change => saveResearchSection(store, change));
  handle('research:entries', workspace, () => store.work.memories());
  handle('research:learned', workspace, () => learnedResearch(store));
  handle('research:approve-observation', workspace, (ideaId, text) => {
    const item = learnedResearch(store).find(row => row.ideaId === ideaId && row.text === text);
    if (!item || !store.get(ideaId)) throw new Error('这条建议已更新，请重新打开。');
    const id = 'observation-' + createHash('sha256').update(ideaId + text).digest('hex').slice(0, 40);
    store.work.addMemory({ id, idea_id: ideaId }, { text: item.text, reason: '用户确认研究画像；依据：' + item.evidence });
    publishResearch(ideaId);
  });
  handle('research:entry', workspace, (id, action, value) => {
    if (action === 'add') {
      const text = clean(value, 1000);
      if (!text) throw new Error('请输入要保留的记忆。');
      store.work.addManualMemory(text);
    } else if (action === 'edit') {
      store.work.editMemory(clean(id, 80), clean(value, 1001));
    } else if (['active', 'withdrawn'].includes(action)) {
      store.work.setMemoryStatus(clean(id, 80), action);
    }
    publishResearch('');
    return store.work.memories();
  });
  handle('ideas:relations', workspace, () => store.work.relations());
  handle('memory:summaries', workspace, () => store.work.suggestions());
  handle('memory:summarize', workspace, ideaId => summarizeMemory(clean(ideaId, 80)));
  handle('memory:decide', workspace, (id, action) => {
    const row = store.work.suggestion(clean(id, 80));
    if (!row) throw new Error('记忆建议不存在。');
    if (action === 'ignore') {
      const updated = store.work.decideSuggestion(row.id, 'ignored');
      publishMemory();
      return updated;
    }
    if (action !== 'accept') throw new Error('未知的记忆操作。');
    const updated = store.work.decideSuggestion(row.id, 'accepted');
    const withdrawn = store.work.memories().find(entry => entry.text === row.text && entry.status === 'withdrawn');
    if (withdrawn) {
      store.work.setMemoryStatus(withdrawn.id, 'active');
      store.work.reinforceMemory(withdrawn.id, 0.2);
    } else {
      store.work.addMemory({ id: 'accepted-' + row.id, idea_id: row.idea_id }, {
        text: row.text, reason: '用户采纳 Agent 总结' + (row.evidence ? '；依据：' + row.evidence : ''),
      });
    }
    appendMemoryProfile(store, [row.text], { ideaId: row.idea_id });
    publishMemory();
    publishResearch(row.idea_id);
    return updated;
  });
  handle('memory:auto', workspace, value => {
    if (value === undefined) return store.setting('autoMemory') !== false;
    store.set('autoMemory', value === true);
    publishMemory();
    return store.setting('autoMemory') !== false;
  });
  handle('memory:pin', workspace, (id, pinned) => {
    store.work.pinMemory(clean(id, 80), pinned === true);
    publishMemory();
    return store.work.memories();
  });
  handle('memory:consolidate-preview', workspace, async () => {
    const provider = store.setting('provider');
    if (!provider) throw new Error('请先在偏好设置中接入 Agent。');
    const memories = store.work.memories().filter(row => row.status === 'active');
    if (memories.length < 3) throw new Error('至少需要三条已启用记忆才能整理。');
    const output = await requestResearchJson(provider, configFor(provider), consolidateInstructions(), {
      memories: memories.map(({ id, text, kind, strength, hits }) => ({ id, text, kind, strength, hits })),
    }, AbortSignal.timeout(40000));
    const groups = normalizeConsolidation(output, memories);
    if (!groups.length) throw new Error('没有找到可以合并的记忆。');
    return { groups, before: memories.length,
      after: memories.length - groups.reduce((total, group) => total + group.ids.length, 0) + groups.length };
  });
  handle('memory:consolidate-apply', workspace, groups => {
    const active = store.work.memories().filter(row => row.status === 'active');
    const normalized = normalizeConsolidation({ groups }, active);
    if (!normalized.length) throw new Error('整理结果已失效，请重新生成。');
    const profile = readResearchProfile(store);
    const previousTexts = active.map(row => row.text);
    const manual = profile.memory.text.split(/\n\s*\n/).map(part => part.trim()).filter(part =>
      part && !previousTexts.some(text => part.includes(text) || text.includes(part)));
    store.work.consolidateMemory(normalized);
    const memories = store.work.memories().filter(row => row.status === 'active')
      .sort((first, second) => (second.strength || 1) - (first.strength || 1) || (second.hits || 1) - (first.hits || 1));
    const parts = [...manual];
    for (const row of memories.slice(0, 12)) {
      if (parts.some(part => part.includes(row.text))) continue;
      const next = parts.concat('· ' + row.text).join('\n\n');
      if (next.length > researchLimits.memory) break;
      parts.push('· ' + row.text);
    }
    const text = parts.join('\n\n');
    if (text && text !== profile.memory.text) {
      saveResearchSection(store, { section: 'memory', text, revision: profile.memory.revision });
    }
    publishMemory();
    publishResearch('');
    return store.work.memories();
  });
  const automationState = () => ({
    mode: automationMode(),
    autoPlain: store.setting('autoPlain') !== false,
    autoQuiz: store.setting('autoQuiz') === true,
    attention: store.automation.attention(),
    jobs: store.automation.list().map(job => ({ ...job, workStage: automationWorkStage(job),
      attention: attentionOf(job, 'automation'), canRetry: ['waiting', 'failed'].includes(job.status) })),
  });
  handle('automation:get', workspace, automationState);
  handle('automation:save', workspace, input => {
    const before = currentWorkPolicy();
    if (['off', 'record', 'act'].includes(input?.mode)) store.set('automationMode', input.mode);
    if (input?.autoPlain !== undefined) store.set('autoPlain', input.autoPlain === true);
    if (input?.autoQuiz !== undefined) store.set('autoQuiz', input.autoQuiz === true);
    if (automationMode() !== 'act') store.automation.downgradeAct();
    else schedulePaperAutomation();
    applyWorkPolicyChange(before, currentWorkPolicy());
    publishAutomation();
    return automationState();
  });
  handle('automation:scan', workspace, () => {
    schedulePaperAutomation();
    return automationState();
  });
  handle('automation:approve', workspace, id => {
    const job = store.automation.approve(clean(id, 80));
    publishAutomation();
    void processAutomation();
    return job;
  });
  handle('automation:retry', workspace, id => {
    const job = store.automation.retry(clean(id, 80));
    publishAutomation();
    void processAutomation();
    return job;
  });
  handle('automation:dismiss', workspace, id => {
    const job = store.automation.dismiss(clean(id, 80));
    publishAutomation();
    return job;
  });
  handle('ideas:memo', workspace, async id => {
    const idea = store.get(clean(id, 80));
    if (!idea) throw new Error('找不到要导出的 Idea。');
    const picked = await dialog.showOpenDialog(main, { title: '选择备忘录导出位置', properties: ['openDirectory', 'createDirectory'] });
    if (picked.canceled) return null;
    return exportMemo(picked.filePaths[0], idea, store.work.list(idea.id));
  });
  handle('work:list', workspace, id => store.work.public(clean(id, 80)));
  handle('work:dashboard', workspace, () => store.work.dashboard());
  handle('work:health', workspace, () => ({
    effects: workEffects?.health() || store.work.effects.health(),
    receipts: store.work.receipts.list(20),
  }));
  handle('work:remove', workspace, id => {
    const job = store.work.remove(clean(id, 80));
    if (!job) return;
    if (activeResearch.has(job.id)) activeResearch.get(job.id).controller.abort();
    for (const [key, controller] of combinationRequests) {
      if (key.startsWith(job.id + ':')) controller.abort();
    }
    publishResearch(job.idea_id);
    if (job.kind === 'synthesis') publish();
  });
  handle('work:auto', workspace, enabled => {
    const before = currentWorkPolicy();
    store.set('automaticResearch', enabled === true);
    applyWorkPolicyChange(before, currentWorkPolicy());
  });
  handle('work:start', workspace, (id, kind, question, parentId) => {
    const idea = store.get(clean(id, 80));
    const provider = store.setting('provider');
    if (!idea || !provider) throw new Error('请先选择默认 Agent，再开始研究。');
    if (!agentAvailable(provider)) throw new Error('默认 Agent 当前不可用，请重新选择或检查安装与登录。');
    if (!['initial', 'deep', 'synthesis'].includes(kind)) throw new Error('未知研究任务。');
    const focus = kind === 'deep' ? clean(question, 300) : '';
    if (kind === 'deep' && !focus) throw new Error('请选择或写下要查证的问题。');
    const parent = kind === 'deep' && parentId ? store.work.get(clean(parentId, 80)) : null;
    if (parentId && (!parent || parent.idea_id !== idea.id || parent.kind !== 'initial' || !['waiting', 'ready'].includes(parent.status) || !parent.progress.result)) {
      throw new Error('原文献初查已不可用，请从当前结果重新确认。');
    }
    const job = enqueueResearch(store, idea, provider, kind, focus, true, currentWorkPolicy());
    if (parent?.status === 'waiting') store.work.update(parent.id, 'ready', parent.progress);
    publishResearch(idea.id);
    void processResearch();
    return job.id;
  });
  handle('work:state', workspace, (id, action, selectedProvider) => {
    const job = store.work.get(clean(id, 80));
    if (!job) throw new Error('找不到这项研究任务。');
    const task = activeResearch.get(job.id);
    if (action === 'pause' && job.status === 'running' && task) {
      task.controller.abort();
    } else if (action === 'pause' && job.status === 'queued') {
      store.work.update(job.id, 'paused', job.progress);
    } else if (action === 'resume' && ['paused', 'failed'].includes(job.status)) {
      const provider = selectedProvider || job.provider;
      if (!agentAvailable(provider)) throw new Error('这个 Agent 尚未配置或安装，请选择另一个。');
      store.work.retry(job.id, provider);
      void processResearch();
    }
    publishResearch(job.idea_id);
  });
  handle('work:relation', workspace, (id, candidate, action) => {
    const job = store.work.get(clean(id, 80));
    const row = job?.progress.result?.connections?.find(item => item.id === candidate);
    if (!row || !store.get(candidate) || !['confirmed', 'ignored'].includes(action)) throw new Error('找不到可处理的 Idea 关系。');
    store.work.decideRelation(job.idea_id, candidate, row.kind || '互补', row.reason, action);
    publishResearch(job.idea_id);
    publishResearch(candidate);
  });
  handle('work:combine', workspace, (id, candidate, body) => {
    const job = store.work.get(clean(id, 80));
    const other = job?.progress.result?.connections?.find(row => row.id === candidate);
    const draft = clean(body, 2400);
    if (!other || !['互补', '可迁移方法'].includes(other.kind || '互补') || !draft || !store.get(candidate)) {
      throw new Error('组合草稿或来源不可用。');
    }
    const created = store.combine(job, candidate, draft);
    publish(created);
    return created;
  });
  handle('work:combination-draft', workspace, async (id, candidate) => {
    const job = store.work.get(clean(id, 80));
    const relation = job?.progress.result?.connections?.find(row => row.id === candidate);
    const first = job && store.get(job.idea_id);
    const second = store.get(clean(candidate, 80));
    if (!first || !second || !relation || !['互补', '可迁移方法'].includes(relation.kind || '互补')) throw new Error('关联来源不可用。');
    if (relation.draft) return relation.draft;
    const key = job.id + ':' + candidate;
    if (combinationRequests.has(key)) throw new Error('组合草稿正在生成。');
    const controller = new AbortController();
    combinationRequests.set(key, controller);
    try {
      const output = await requestResearchJson(store.setting('provider') || job.provider, configFor(store.setting('provider') || job.provider),
        '用户已点击生成组合草稿。根据两个原始想法及讨论，说明各自贡献、组合思路和待查证缺口。只做文献研究构想，不执行实验。返回 {"draft":"可编辑的中文草稿"}，最多 2400 字。',
        { first: { body: first.body, discussion: first.discussion.slice(-8) }, second: { body: second.body, discussion: second.discussion.slice(-8) }, relation: relation.reason }, controller.signal);
      controller.signal.throwIfAborted();
      const draft = clean(output?.draft, 2400);
      if (!draft) throw new Error('模型没有返回组合草稿，请重试。');
      const latest = store.work.get(job.id);
      const current = latest?.progress.result?.connections?.find(row => row.id === candidate);
      if (!current || !store.get(first.id) || !store.get(second.id)) throw new Error('来源已变更，请重新打开。');
      current.draft = draft;
      store.work.update(latest.id, latest.status, latest.progress, latest.error);
      publishResearch(job.idea_id);
      return draft;
    } finally { combinationRequests.delete(key); }
  });
  handle('work:memory', workspace, (id, action) => {
    const job = store.work.get(clean(id, 80));
    const proposal = job?.progress.result?.memory;
    if (!proposal || proposal.decision || !['accept', 'reject'].includes(action)) throw new Error('这条记忆建议已处理或不可用。');
    store.work.resolveMemory(job, action, () => {
      if (action !== 'accept') return;
      store.work.addMemory(job, proposal);
    });
    publishResearch(job.idea_id);
  });
  handle('skills:list', workspace, () => listSkills(store));
  handle('skills:find', workspace, async (scope, input) => {
    const provider = store.setting('provider');
    const intent = clean(input, 220) || (scope === 'studio' ? 'presentation' : 'scientific research');
    const controller = new AbortController();
    skillRequests.add(controller);
    try {
      let keywords = intent;
      if (provider) {
        const budget = AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]);
        const output = await requestResearchJson(provider, configFor(provider),
          '给 GitHub 仓库搜索拟定一组英文关键词，目标是发现可复用 Agent skills。去掉个人项目名，仅返回 {"keywords":"2 到 5 个关键词"}。',
          { scope, intent }, budget).catch(() => null);
        controller.signal.throwIfAborted();
        if (typeof output?.keywords === 'string' && output.keywords.trim()) keywords = output.keywords;
      }
      const query = keywords.replace(/[^\p{L}\p{N}\s-]/gu, ' ').trim().split(/\s+/).slice(0, 7).join(' ');
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(16000)]);
      const search = async term => (await findGitHubSkills(term, signal)).filter(item => item.files.length);
      const matches = await search(query + ' skills');
      const fallback = scope === 'studio' ? 'pptx agent skills' : 'research agent skills';
      return matches.length || query + ' skills' === fallback ? matches : await search(fallback);
    } catch (error) {
      if (error.name === 'TimeoutError') throw new Error('GitHub 技能检索超时，请重试。');
      throw error;
    } finally { skillRequests.delete(controller); }
  });
  handle('skills:save', workspace, change => saveSkill(store, { ...change, origin: clean(change?.origin, 80) }));
  handle('skills:remove', workspace, id => removeSkill(store, clean(id, 80)));
  handle('skills:download', workspace, async value => {
    const controller = new AbortController();
    skillRequests.add(controller);
    try { return await downloadGitHubSkill(value, AbortSignal.any([controller.signal, AbortSignal.timeout(12000)])); }
    catch (error) {
      if (error.name === 'TimeoutError') throw new Error('下载 SKILL.md 超时，请重试。');
      throw error;
    } finally { skillRequests.delete(controller); }
  });
  handle('skills:import', workspace, async () => {
    const picked = await dialog.showOpenDialog(main, { title: '导入 SKILL.md', properties: ['openFile'],
      filters: [{ name: 'Markdown 技能', extensions: ['md', 'markdown'] }] });
    if (picked.canceled) return null;
    const file = picked.filePaths[0];
    if ((await stat(file)).size > 64000) throw new Error('技能文件过大。');
    const fallback = /^skill\.md$/i.test(basename(file)) ? basename(dirname(file)) : basename(file).replace(/\.(md|markdown)$/i, '');
    return skillFromMarkdown(await readFile(file, 'utf8'), fallback, 64000);
  });
  handle('skills:draft', workspace, async id => {
    const idea = store.get(clean(id, 80));
    const provider = store.setting('provider');
    if (!idea || !provider) throw new Error('请选择一个已接入的 Agent，并从已保存的讨论发起提炼。');
    const controller = new AbortController();
    skillRequests.add(controller);
    try { return await draftSkillFromDiscussion(provider, configFor(provider), idea, controller.signal); }
    catch (error) {
      if (error.name === 'TimeoutError') throw new Error('提炼超时，当前草稿仍可继续编辑。');
      if (error instanceof TypeError || error instanceof SyntaxError) throw new Error('Agent 连接或响应异常。');
      throw error;
    } finally { skillRequests.delete(controller); }
  });
  handle('sources:list', workspace, () => Object.entries(researchSources).map(([id, defaults]) => {
    const config = store.setting('mcp:' + id);
    return { id, label: defaults.label, endpoint: config?.endpoint || defaults.endpoint,
      tool: config?.tool || defaults.tool, queryField: config?.queryField || '', configured: Boolean(config), hasToken: Boolean(config?.secret) };
  }));
  handle('sources:save', workspace, (id, input) => {
    if (!Object.hasOwn(researchSources, id)) throw new Error('未知研究工具。');
    const endpoint = mcpEndpoint(clean(input?.endpoint, 1500)).href;
    const tool = validateSearchTool(clean(input?.tool, 100));
    const queryField = clean(input?.queryField, 70);
    if (queryField && !/^[a-z_][a-z\d_-]*$/i.test(queryField)) throw new Error('查询字段格式不正确。');
    const key = 'mcp:' + id;
    const previous = store.setting(key);
    const token = clean(input?.token, 4000);
    const secret = token ? safeStorage.encryptString(token).toString('base64') :
      (previous?.endpoint === endpoint && !input?.clearToken ? previous.secret : '') || '';
    store.set(key, { endpoint, tool, queryField, secret });
  });
  handle('sources:run', workspace, (id, query, mode) => {
    if (!Object.hasOwn(researchSources, id)) throw new Error('未知研究工具。');
    if (mode === 'public') return searchPublicSource(id, query);
    const config = store.setting('mcp:' + id);
    if (!config) throw new Error('请先保存 MCP 连接。');
    const text = query == null ? undefined : clean(query, 600);
    if (query != null && !text) throw new Error('请填写检索词。');
    return useResearchSource({ ...config, token: config.secret ? safeStorage.decryptString(Buffer.from(config.secret, 'base64')) : '' }, text);
  });
  handle('sources:scholar', workspace, query => {
    const text = clean(query, 600);
    if (!text) throw new Error('请填写检索词。');
    return shell.openExternal(scholarUrl(text));
  });
  handle('sources:browser', workspace, (id, query) => shell.openExternal(sourceBrowserUrl(id, query)));
  handle('sources:open', workspace, value => {
    const url = new URL(clean(value, 1500));
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('无法打开此来源链接。');
    return shell.openExternal(url.href);
  });
  handle('appearance:save', workspace, choice => {
    store.set('appearance', normalizeAppearance(choice));
    applyAppearance();
    return appearance();
  });
  handle('settings:shortcut', workspace, next => {
    if (!Object.hasOwn(shortcuts, next)) throw new Error('请选择可用的快捷键。');
    if (next !== registered) {
      if (!globalShortcut.register(next, showCapture)) throw new Error('此快捷键已被占用，请选择另一组。');
      if (registered) globalShortcut.unregister(registered);
      registered = next;
    }
    store.set('shortcut', next);
  });
  handle('settings:default', workspace, provider => {
    if (!Object.hasOwn(providers, provider) && provider !== '') throw new Error('未知 Agent。');
    if (apiProviders.has(provider) && !store.setting(provider)) throw new Error('请先保存 API 配置。');
    if (provider && !apiProviders.has(provider) && !findCli(provider)) throw new Error('尚未找到这个 CLI。');
    store.set('provider', provider);
    publish();
    schedulePaperAutomation();
  });
  handle('settings:configure', workspace, (provider, input) => {
    if (!apiProviders.has(provider)) throw new Error('请选择 API 协议。');
    if (connectionTests.has(provider)) throw new Error('此连接正在测试，请等待测试结束。');
    let url;
    try { url = new URL(clean(input?.base, 1200)); } catch { throw new Error('请填写完整的 API 地址。'); }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) {
      throw new Error('请使用 HTTPS API 地址。本机服务可用 HTTP。');
    }
    const model = clean(input?.model, 240);
    if (!model) throw new Error('请填写模型名称。');
    const previous = store.setting(provider);
    const endpointChanged = Boolean(previous?.base && previous.base !== url.href);
    if (endpointChanged && (active?.provider === provider || researchUsesProvider(provider))) throw new Error('此连接正在处理讨论或研究任务，请等它完成或停止后再更换地址。');
    const key = clean(input?.key, 4000);
    const keepKey = previous?.base === url.href && !input?.clearKey;
    const secret = key ? safeStorage.encryptString(key).toString('base64') : (keepKey ? previous.secret : '') || '';
    store.saveConnection(provider, { base: url.href, model, secret }, endpointChanged);
    connectionResults.delete(provider);
    if (endpointChanged) {
      publish();
      publishResearch();
    }
    schedulePaperAutomation();
  });
  handle('settings:cli-model', workspace, (provider, value) => {
    if (!Object.hasOwn(providers, provider) || apiProviders.has(provider)) throw new Error('请选择一个本机 CLI。');
    const model = normalizeCliModel(value);
    const key = 'cli:model:' + provider;
    if (model === (store.setting(key) || '')) return;
    if (active?.provider === provider || researchUsesProvider(provider) || connectionTests.has(provider)) {
      throw new Error('这个 Agent 正在运行，请等待完成或先停止，再修改模型。');
    }
    store.set(key, model);
    connectionResults.delete(provider);
  });
  handle('settings:cli-models', workspace, provider => listCliModels(provider));
  handle('settings:api-models', workspace, provider => {
    if (!apiProviders.has(provider)) throw new Error('请选择兼容 API。');
    const config = configFor(provider);
    if (!config) throw new Error('请先保存 API 配置。');
    return listApiModels(provider, config);
  });
  handle('settings:test', workspace, async provider => {
    if (!Object.hasOwn(providers, provider)) throw new Error('请选择要测试的连接。');
    if (connectionTests.has(provider)) throw new Error('此连接正在测试。');
    const controller = new AbortController();
    connectionTests.set(provider, controller);
    const stages = {};
    function update(stage, status, message) {
      stages[stage] = { status, message };
      connectionResults.set(provider, { status: 'running', stages });
      main?.webContents.send('agents:diagnostic');
    }
    try {
      const ready = await diagnoseAgent(provider, configFor(provider), controller.signal, update);
      connectionResults.set(provider, { status: ready ? 'ready' : 'failed', stages });
    } catch (error) {
      const cancelled = controller.signal.aborted;
      const message = cancelled ? '已停止测试。' : diagnosticMessage(error);
      for (const row of Object.values(stages)) if (row.status === 'running') Object.assign(row, { status: cancelled ? 'cancelled' : 'failed', message });
      connectionResults.set(provider, { status: cancelled ? 'cancelled' : 'failed', stages, message });
    } finally {
      connectionTests.delete(provider);
      if (!quitting && main && !main.isDestroyed()) main.webContents.send('agents:diagnostic');
    }
  });
  handle('settings:stop-test', workspace, provider => { connectionTests.get(provider)?.abort(); });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (main) showMain(); });
  app.on('before-quit', () => {
    quitting = true;
    workEffects?.stop();
    active?.controller.abort();
    for (const task of researchTasks()) task.controller.abort();
    dictation?.controller.abort();
    for (const item of translations.values()) item.controller.abort();
    paperQueue?.stop();
    for (const controller of connectionTests.values()) controller.abort();
    for (const controller of skillRequests) controller.abort();
    for (const controller of combinationRequests.values()) controller.abort();
    for (const controller of classifyRequests) controller.abort();
    for (const timer of memoryTimers.values()) clearTimeout(timer);
    memoryTimers.clear();
    studioRequest?.controller.abort();
    automationController?.abort();
  });
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    store?.close();
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    store = openStore(join(app.getPath('userData'), 'ideas.sqlite'));
    try {
      seedDefaultFigureSkill(store, readFileSync(join(root, 'desktop', 'bundled-skills', 'figgenie-paper-diagram', 'SKILL.md'), 'utf8'));
    } catch {}
    paperDirectory = join(app.getPath('userData'), 'papers');
    const savedWindow = store.setting('mainWindow');
    const savedBounds = isWindowBounds(savedWindow?.bounds) ? savedWindow.bounds : undefined;
    const display = savedBounds ? screen.getDisplayMatching(savedBounds) : screen.getPrimaryDisplay();
    brandIcon = nativeImage.createFromPath(brandPath);
    main = createWindow(fitMainWindow(savedBounds, display.workArea), brandIcon);
    rememberMainWindow(main);
    installWorkEffects();
    paperQueue = createPaperQueue(store.papers, paperDirectory, paperId => {
      main.webContents.send('papers:changed');
      if (paperId) recordPaperParsed(store, store.papers.get(paperId));
      schedulePaperAutomation();
      workEffects?.kick();
    });
    nativeTheme.on('updated', applyAppearance);
    installHandlers();
    tray = new Tray(brandIcon.resize({ width: 32, height: 32, quality: 'best' }));
    tray.setToolTip(appTitle);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '快速记录', click: showCapture },
      { label: '语音快记（说完即保存）', click: () => showCapture(true) },
      { label: '打开 Sparkseed', click: () => showMain() },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() },
    ]));
    tray.on('double-click', () => showMain());
    const preference = store.setting('shortcut') || defaultShortcut;
    if (globalShortcut.register(preference, showCapture)) registered = preference;
    voiceShortcutRegistered = globalShortcut.register(voiceShortcut, () => showCapture(true));
    main.once('ready-to-show', () => {
      if (savedWindow?.maximized === true) main.maximize();
      showMain();
    });
    void processQueue();
    void processResearch();
    paperQueue.run();
    const lastDecay = store.setting('memoryDecayAt');
    if (shouldDecay(lastDecay)) {
      store.work.decayMemories(45);
      store.set('memoryDecayAt', new Date().toISOString());
    }
    schedulePaperAutomation();
    void processAutomation();
    if (store.setting('autoMemory') !== false) {
      for (const idea of store.list().filter(row => row.discussion.length > 0).slice(0, 3)) {
        const last = store.setting('memorySummary:' + idea.id);
        if (!last || Date.now() - Date.parse(last) > 86400000) scheduleMemorySummary(idea.id);
      }
    }
  }).catch(error => {
    try { dialog.showErrorBox('Sparkseed 无法启动', '数据文件无法读取：' + (error?.message || error)); } catch {}
    app.quit();
  });
}

