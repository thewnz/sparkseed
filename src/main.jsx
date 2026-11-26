import { Question } from './question.jsx';
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import { useDictation } from './use-dictation.jsx';
import { createRoot } from 'react-dom/client';
import { Icon } from './icons.jsx';
import '@fontsource-variable/geist';
import '@fontsource-variable/noto-sans-sc';
import '@fontsource-variable/noto-serif-sc';
import './styles.css';
import './workspace-material.css';
import { Preferences } from './preferences.jsx';
import { IdeaLibrary } from './idea-library.jsx';
import { initialStarView } from './idea-star-map.jsx';
import { loadStarPreferences, saveStarPreferences } from './star-preferences.jsx';
import { PaperLibrary } from './paper-library.jsx';
import { EvidencePanel } from './evidence.jsx';
import { SessionRail, Sidebar, WorkspaceBrand } from './sidebar.jsx';
import { ResearchActivity, ResearchPanel, RetryAgent, useResearchJobs } from './research-work.jsx';
import { ResearchDashboard } from './research-dashboard.jsx';
import { Notebook } from './notebook.jsx';
import { NotesLibrary } from './notes-library.jsx';
import { UserGuide } from './user-guide.jsx';
import { StartupSplash } from './startup-splash.jsx';
import { SpaceBackground } from './space-background.jsx';
import { Studio, StudioAttachment } from './studio.jsx';
import { CommandPalette } from './command-palette.jsx';
import {
  draftDiscussionSkill,
  formatIdeaMarkdown,
  ideaDates as dates,
  ideaDisplayStatus,
  ideaStatuses as labels,
  ideaTitle as title,
} from './idea-text.mjs';
import { workStageGroup } from '../desktop/work-stage.mjs';
import { defaultOpenings, resolveAppearance } from '../desktop/appearance.mjs';
import './visual-refinement.css';
import { useWorkspaceMotion } from './workspace-motion.jsx';
import './workspace-motion.css';

const api = window.recorder;
const blank = { body: '', excerpt: '', paper: '', page: '' };
const errorText = error => error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');

const chooseOpening = (openings, avoid = '') => {
  if (!openings.length) return '';
  const candidates = openings.length > 1 ? openings.filter(item => item !== avoid) : openings;
  return candidates[Math.floor(Math.random() * candidates.length)] || openings[0] || '';
};

const agentNames = {
  codex: 'Codex', claude: 'Claude Code', kimi: 'Kimi Code',
  openai: 'OpenAI API', anthropic: 'Anthropic API', gemini: 'Gemini',
  deepseek: 'DeepSeek', 'kimi-api': 'Kimi API', qwen: 'Qwen', zhipu: '智谱 GLM',
  doubao: '豆包', minimax: 'MiniMax', siliconflow: 'SiliconFlow', openrouter: 'OpenRouter', custom: '自定义 API',
};

const modeNames = {
  inbox: '对话',
  new: '新对话',
  library: '灵感库',
  papers: '文献库',
  notes: '笔记库',
  tasks: '后台任务',
  studio: '科研制图',
  guide: '使用指南',
  settings: '偏好设置',
};

function AgentBadge({ provider, entries = [], onSettings }) {
  const entry = entries.find(item => item.id === provider);
  const name = entry?.label || agentNames[provider] || (provider ? provider : '本地记录');
  return <button type="button" className="quiet backend agent-badge" data-connected={Boolean(provider)}
    aria-label={'Agent 接入 · ' + name} title={'点击配置或切换 Agent · 当前：' + name} onClick={onSettings}>
    <span className={provider ? 'connection-dot connected' : 'connection-dot'} aria-hidden="true" />
    <span className="agent-code">{name}</span>
  </button>;
}

const starters = [
  {
    label: '假设界定',
    desc: '把直觉拆成可检验的前提与变量',
    opening: '我想检验一个研究假设：\n- 核心问题：\n- 关键前提：\n- 待验证之处：',
    icon: 'compose',
  },
  {
    label: '方法迁移',
    desc: '定位现有方法失效边界与改进点',
    opening: '我想把现有方法迁移到新场景，目前卡在：',
    icon: 'socratic',
  },
  {
    label: '对照设计',
    desc: '权衡两条技术路线在样本与开销上的取舍',
    opening: '我在比较两个候选方案：\n方案 A：\n方案 B：\n核心取舍在于：',
    icon: 'split',
  },
  {
    label: '反例排查',
    desc: '主动寻找可能推翻当前结论的边界条件',
    opening: '针对目前的结论，最可能失效或被质疑的场景是：',
    icon: 'shield',
  },
];

function IdeaComposer({
  quick = false,
  voiceRequest = 0,
  enabled = true,
  provider,
  entries = [],
  onSettings,
  draft,
  setDraft,
  onClose,
  onPickPaper,
  onNotebook,
  notebookOpen = false,
  artifact,
  removeArtifact,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showSources, setShowSources] = useState(false);
  const { listen, listening, stop } = useDictation(enabled);
  const [voiceSaving, setVoiceSaving] = useState(false);
  const body = useRef(null);
  const saving = useRef(false);
  const latestDraft = useRef(draft);
  useEffect(() => { latestDraft.current = draft; }, [draft]);
  const draftId = quick ? 'quick-draft' : 'draft';
  const sourceId = quick ? 'quick-sources' : 'capture-sources';
  const ready = Boolean(artifact) || Object.values(draft).some(value => value.trim());

  async function dictate(saveWhenDone = false) {
    if (busy) return;
    if (listening) return stop();
    setVoiceSaving(saveWhenDone);
    setError('');
    try {
      const text = await listen();
      if (text) {
        const current = latestDraft.current;
        const spokenDraft = { ...current, body: [current.body, text].filter(Boolean).join('\n').slice(0, 8000) };
        setDraft(spokenDraft);
        if (saveWhenDone) await save(false, spokenDraft);
        else body.current?.focus();
      }
    } catch (err) { setError(errorText(err)); }
  }

  const runVoiceRequest = useEffectEvent(() => { if (!listening) void dictate(true); });
  const handledVoiceRequest = useRef(0);
  useEffect(() => {
    if (voiceRequest && voiceRequest !== handledVoiceRequest.current) {
      handledVoiceRequest.current = voiceRequest;
      runVoiceRequest();
    }
  }, [voiceRequest]);

  function field(key) {
    return { value: draft[key], onChange: event => setDraft({ ...draft, [key]: event.target.value }) };
  }

  async function save(discuss, spokenDraft) {
    if ((!spokenDraft && (!ready || listening)) || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      await api.create({ ...(spokenDraft || draft), artifact: artifact?.id }, !quick || discuss);
      setDraft(blank);
      removeArtifact?.();
      setShowSources(false);
      if (quick) onClose(!discuss);
    } catch (err) { setError(errorText(err)); }
    finally { saving.current = false; setBusy(false); }
  }

  async function attach() {
    try {
      const excerpt = await api.readClipboard();
      if (excerpt.trim()) {
        setDraft(previous => ({ ...previous, excerpt }));
        setError('');
      } else setError('剪贴板里没有可带入的文字。');
    } catch (err) { setError(errorText(err)); }
  }

  return <section className={quick ? 'capture quick-composer' : 'capture embedded'} onKeyDown={event => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape' && quick && !saving.current) onClose();
    if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault();
      void save(event.shiftKey);
    }
  }}>
    <form className="composer studio-composer-box" onSubmit={event => { event.preventDefault(); void save(false); }}>
      <label className="visually-hidden" htmlFor={draftId}>第一条消息</label>
      <textarea id={draftId} ref={body} autoFocus rows={quick ? 5 : 4} maxLength={8000}
        placeholder="写下你的研究念头、疑问或观察，半句话也可以开始…" {...field('body')} />

      {showSources && <div className="sources composer-source-drawer" id={sourceId}>
        <label><span>论文题名或 DOI / 链接</span><input maxLength={1000} placeholder="选填，记录灵感出处" {...field('paper')} /></label>
        <label><span>页码</span><input maxLength={80} placeholder="如 3-4" {...field('page')} /></label>
      </div>}

      {(draft.excerpt || (!showSources && draft.paper) || artifact) && <div className="composer-attachments-tray">
        {!showSources && draft.paper && <div className="attachment-pill">
          <Icon name="location" />
          <span>{[draft.paper, draft.page && '第 ' + draft.page + ' 页'].filter(Boolean).join(' · ')}</span>
          <button type="button" className="quiet" onClick={() => setShowSources(true)}>修改</button>
          <button type="button" className="quiet" onClick={() => setDraft({ ...draft, paper: '', page: '' })}>移除</button>
        </div>}
        {draft.excerpt && <div className="excerpt attachment-excerpt-card">
          <Icon name="quote" />
          <span>{draft.excerpt}</span>
          <button type="button" className="quiet" onClick={() => setDraft({ ...draft, excerpt: '' })}>移除</button>
        </div>}
        {artifact && <StudioAttachment key={artifact.id} attachment={artifact} remove={removeArtifact} />}
      </div>}

      {listening && <p className="voice-live-banner" role="status">
        <span className="pulse-dot" aria-hidden="true" />
        {voiceSaving ? '正在听写，识别结束后自动保存…' : '正在听写，识别结果将填入草稿…'}
      </p>}
      {error && <p className="error voice-feedback" role="alert">{error}</p>}

      <div className="composer-bottom-bar">
        <div className="attachment-actions composer-tools" role="group" aria-label="输入和引用">
          <button className="quiet" type="button" title="带入剪贴板原文" onClick={() => void attach()}>
            <Icon name="excerpt" />{draft.excerpt ? '替换引文' : '粘贴引文'}
          </button>
          <button className="quiet" type="button" aria-expanded={showSources} aria-controls={sourceId}
            onClick={() => setShowSources(!showSources)}>
            <Icon name="location" />{draft.paper || draft.page ? '编辑位置' : '论文位置'}
          </button>
          <button className="quiet" type="button" onClick={onPickPaper}>
            <Icon name="book" />引用论文
          </button>
          <button className="quiet" type="button" aria-pressed={listening && !voiceSaving} title="使用 Windows 本地听写"
            disabled={busy || (listening && voiceSaving)} onClick={() => void dictate(false)}>
            <Icon name="microphone" />{listening && !voiceSaving ? '取消听写' : '听写到草稿'}
          </button>
          {!quick && onNotebook && <button type="button" className="quiet" aria-pressed={notebookOpen} onClick={onNotebook}>
            <Icon name="document" />随手记
          </button>}
        </div>

        <footer className="capture-actions">
          {!quick ? <>
            {draft.body.length > 0 && <span className="composer-char-hint">{draft.body.length} / 8000</span>}
            <AgentBadge provider={provider} entries={entries} onSettings={onSettings} />
            <button type="submit" className="primary send-cta icon-label" disabled={!ready || busy || listening}
              aria-label={provider ? '发送' : '保存消息'} title={provider ? '发送并开始追问 · Ctrl+Enter' : '保存到本机 · Ctrl+Enter'}>
              <span>{provider ? '开始思辨' : '保存记录'}</span>
              <Icon name="send" />
            </button>
          </> : <>
            <button type="button" className="quiet icon-label voice-action" disabled={busy || (listening && !voiceSaving)}
              onClick={() => void dictate(true)}>
              <Icon name="microphone" />{listening && voiceSaving ? '取消语音保存' : '说完即保存'}
            </button>
            <div className="capture-submit">
              <button type="submit" className="quiet" disabled={!ready || busy || listening}>仅保存灵感</button>
              <button type="button" className="primary icon-label" disabled={!ready || busy || listening}
                onClick={() => void save(true)}>
                保存并讨论 <Icon name="forward" />
              </button>
            </div>
          </>}
        </footer>
      </div>
    </form>
  </section>;
}

function Message({ type, roleLabel, copyText, onQuoteEvidence, children }) {
  const [copied, setCopied] = useState(false);
  const isAgent = type === 'agent-message';
  return <div className={'message ' + type} role="group" aria-label={isAgent ? 'Agent 回复' : '用户消息'}>
    <div className="message-card">
      <div className="message-meta-row">
        <span className="message-role-badge" data-agent={isAgent || undefined}>
          <Icon name={isAgent ? 'soul' : 'compose'} />
          {roleLabel || (isAgent ? 'Sparkseed 追问' : '研究者')}
        </span>
        {(copyText || onQuoteEvidence) && <span className="message-hover-tools">
          {onQuoteEvidence && copyText && <button type="button" className="quiet" title="将此条内容作为结论带入证据台"
            onClick={() => onQuoteEvidence(copyText)}>
            <Icon name="shield" />送入证据台
          </button>}
          {copyText && <button type="button" className="quiet" title="复制内容" onClick={async () => {
            try {
              await navigator.clipboard.writeText(copyText);
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            } catch { /* ignore */ }
          }}>
            <Icon name={copied ? 'check' : 'copy'} />{copied ? '已复制' : '复制'}
          </button>}
        </span>}
      </div>
      <div className="message-body">{children}</div>
    </div>
  </div>;
}

function AgentActivity({ activity }) {
  if (!activity) return null;
  const memory = [activity.soul && 'Soul', activity.memory && 'Memory'].filter(Boolean);
  const elapsed = typeof activity.elapsed === 'number'
    ? (activity.elapsed < 1000 ? activity.elapsed + ' 毫秒' : (activity.elapsed / 1000).toFixed(1) + ' 秒')
    : String(activity.elapsed || '');
  return <details className="agent-activity">
    <summary><Icon name="layers" />上下文与推理轨迹 {elapsed && <span>· {elapsed}</span>}</summary>
    <ul>
      <li>读取了当前想法{activity.turns > 0 && '和最近 ' + activity.turns + ' 条讨论记录'}。</li>
      {memory.length > 0 && <li>载入了已保存的 {memory.join(' 与 ')}。</li>}
      {activity.skills?.length > 0 && <li>注入了技能：{activity.skills.join('、')}。</li>}
      <li>已完成追问与选项结构校验。{elapsed && `耗时 ${elapsed}。`}</li>
    </ul>
  </details>;
}

function PaperReference({ paper, remove }) {
  if (!paper) return null;
  return <div className="reply-paper">
    <span className="reply-paper-head">
      <Icon name="book" />
      <strong>{paper.title}</strong>
      <span>第 {paper.page} 页</span>
      {remove && <button type="button" className="quiet" onClick={remove}>移除</button>}
    </span>
    {!remove && (paper.excerpt || paper.translation) && <details><summary>展开引用原文</summary>
      {paper.excerpt && <blockquote>{paper.excerpt}</blockquote>}
      {paper.translation && <blockquote><strong>译文</strong>{'\n'}{paper.translation}</blockquote>}
    </details>}
  </div>;
}

function ReplyInput({ waiting, draft, setDraft, custom = false }) {
  const fields = <>
    <label htmlFor="reply" className={custom ? undefined : 'visually-hidden'}>{custom ? '填写你自己的答案' : '继续补充想法'}</label>
    <textarea id="reply" form="idea-reply" rows={2} maxLength={waiting ? 1500 : 8000} value={draft}
      placeholder={custom ? '写下你自己的补充判断…' : waiting ? '勾选上方选项，或直接写下你的回应（Ctrl+Enter 发送）…' : '继续推进你的想法（Ctrl+Enter 发送）…'}
      onChange={event => setDraft(event.target.value)} onKeyDown={event => {
        if (event.key === 'Enter' && event.ctrlKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }
      }} />
  </>;
  return custom ? <div className="custom-choice-answer">{fields}</div> : fields;
}

function Reply({ enabled, provider, entries, pending, waiting, selected, custom, send, onSettings, paper, onPickPaper, onRemovePaper, draft, setDraft, artifact, removeArtifact, autoFollowup, setAutoFollowup }) {
  const [sending, setSending] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const { listen, listening, stop } = useDictation(enabled && !pending);
  const latest = useRef({ draft, selected, paper, artifact });
  useEffect(() => { latest.current = { draft, selected, paper, artifact }; }, [draft, selected, paper, artifact]);
  const canSend = Boolean(draft.trim() || selected.length || paper || artifact);
  const count = selected.length + (custom && draft.trim() ? 1 : 0);

  async function submit(mode = 'send', spoken) {
    const skip = mode === 'skip';
    const pause = mode === 'pause';
    if ((!skip && !pause && !spoken && !canSend) || pending || sending || (!spoken && listening)) return;
    const message = spoken || { draft, selected, paper, artifact };
    setSending(true);
    try {
      const payload = pause
        ? { pause: true, note: message.draft, options: message.selected, paper: message.paper, artifact: message.artifact?.id }
        : skip
          ? { skip: true }
          : { note: message.draft, options: message.selected, paper: message.paper, artifact: message.artifact?.id, recordOnly: !autoFollowup };
      if (await send(payload)) {
        setDraft('');
        if (!skip && message.paper) onRemovePaper();
        if (!skip && message.artifact) removeArtifact();
        if (pause) setAutoFollowup(false);
      }
    } finally { setSending(false); }
  }

  const [voiceSends, setVoiceSends] = useState(false);
  async function replyByVoice(sendImmediately) {
    if (listening) return stop();
    setVoiceSends(sendImmediately);
    window.speechSynthesis?.cancel();
    setVoiceError('');
    try {
      const text = await listen();
      if (!text) return;
      const message = latest.current;
      const note = [message.draft, text].filter(Boolean).join('\n').slice(0, waiting ? 1500 : 8000);
      setDraft(note);
      if (sendImmediately) await submit('send', { ...message, draft: note });
      else requestAnimationFrame(() => document.getElementById('reply')?.focus());
    } catch (err) { setVoiceError(errorText(err)); }
  }

  return <form id="idea-reply" className="reply composer studio-composer-box" onSubmit={event => { event.preventDefault(); void submit(); }}>
    {!custom && <ReplyInput waiting={waiting} draft={draft} setDraft={setDraft} />}
    {(paper || artifact) && <div className="composer-attachments-tray">
      <PaperReference paper={paper} remove={onRemovePaper} />
      {artifact && <StudioAttachment key={artifact.id} attachment={artifact} remove={removeArtifact} />}
    </div>}
    {voiceError && <p className="error voice-feedback" role="alert">{voiceError}</p>}
    {listening && <p className="voice-live-banner" role="status">
      <span className="pulse-dot" aria-hidden="true" />
      {voiceSends ? '正在听写，识别结束后自动发送…' : '正在听写，识别结果将填入草稿…'}
    </p>}
    <div className="composer-bottom-bar">
      <div className="attachment-actions composer-tools" role="group" aria-label="输入和引用">
        <AgentBadge provider={provider} entries={entries} onSettings={onSettings} />
        {provider && <button type="button" className="quiet icon-label" aria-pressed={!autoFollowup}
          title={autoFollowup ? '当前：发送后由 Agent 继续追问（点击切换为仅记录）' : '当前：仅记录想法，不触发 Agent 追问'}
          onClick={() => setAutoFollowup(v => !v)}>
          <Icon name={autoFollowup ? 'socratic' : 'pause'} />{autoFollowup ? '自动追问' : '仅记录'}
        </button>}
        <button className="quiet" type="button" onClick={onPickPaper}><Icon name="book" />引用论文</button>
        <button className="quiet" type="button" disabled={pending || sending || (listening && voiceSends)}
          aria-pressed={listening && !voiceSends} onClick={() => void replyByVoice(false)}>
          <Icon name="microphone" />{listening && !voiceSends ? '取消听写' : '听写到草稿'}
        </button>
      </div>
      <footer className="capture-actions">
        {count > 0 && <span className="selected-count">已选 {count} 项</span>}
        {waiting && <button type="button" className="quiet" onClick={() => void submit('pause')} disabled={pending || sending || listening}
          title="结束当前追问并切换为自主记录模式">暂停追问</button>}
        {waiting && <button type="button" className="quiet" onClick={() => void submit('skip')} disabled={pending || sending || listening}>跳过此问</button>}
        <button className="quiet icon-label voice-action" type="button" disabled={pending || sending || (listening && !voiceSends)}
          aria-pressed={listening && voiceSends} onClick={() => void replyByVoice(true)}>
          <Icon name="microphone" />{listening && voiceSends ? '取消语音发送' : '说完即发送'}
        </button>
        <button type="submit" className="primary send-icon icon-label" disabled={!canSend || pending || sending || listening}
          aria-label={provider && autoFollowup ? '发送' : '保存'} title={provider && autoFollowup ? '发送并继续 · Ctrl+Enter' : '仅保存到本机 · Ctrl+Enter'}>
          <Icon name="send" />
          <span>{provider && autoFollowup ? '发送' : '记录'}</span>
        </button>
      </footer>
    </div>
  </form>;
}

function IdeaConversation({
  visible,
  idea,
  ideas,
  openIdea,
  openPaper,
  provider,
  entries,
  onSettings,
  paper,
  onPickPaper,
  onRemovePaper,
  targetJob,
  notebookOpen,
  onToggleNotebook,
  onCloseNotebook,
  artifact,
  removeArtifact,
  onBindEvidence,
}) {
  const [inspector, setInspector] = useState(() => targetJob ? 'research' : '');
  const [workbenchFull, setWorkbenchFull] = useState(false);
  const [claimSeed, setClaimSeed] = useState('');
  const evidenceButton = useRef(null);
  const feed = useRef(null);

  useEffect(() => {
    if (notebookOpen && inspector !== 'notebook') setInspector('notebook');
    else if (!notebookOpen && inspector === 'notebook') setInspector('');
  }, [notebookOpen]);

  function selectInspector(next) {
    const target = inspector === next ? '' : next;
    setInspector(target);
    if (target === 'notebook' && !notebookOpen) onToggleNotebook();
    if (target !== 'notebook' && notebookOpen) onCloseNotebook();
    if (!target) setWorkbenchFull(false);
  }

  function closeEvidence() {
    setInspector('');
    setWorkbenchFull(false);
    setClaimSeed('');
    evidenceButton.current?.focus();
  }

  function sendToEvidence(text) {
    setClaimSeed((text || '').trim().slice(0, 2000));
    if (notebookOpen) onCloseNotebook();
    setInspector('evidence');
    requestAnimationFrame(() => document.querySelector('.evidence-panel textarea')?.focus({ preventScroll: true }));
  }

  const [error, setError] = useState('');
  const [selected, setSelected] = useState([]);
  const [custom, setCustom] = useState(false);
  const [replyDraft, setReplyDraft] = useState('');
  const [autoFollowup, setAutoFollowup] = useState(true);
  const [copiedThread, setCopiedThread] = useState(false);
  const [selectionBar, setSelectionBar] = useState(null);
  const { jobs } = useResearchJobs(idea.id);
  const latest = useRef(null);
  const previousPaper = useRef(paper);
  const pending = ['queued', 'running'].includes(idea.status);
  const round = idea.discussion.at(-1);
  const waitingForAnswer = round?.question && !round.answer;
  const activeJobsCount = jobs.filter(job => job.status !== 'superseded').length;
  const displayState = ideaDisplayStatus(idea);

  useEffect(() => {
    if (!visible || !waitingForAnswer || !round?.options?.length) return;
    function onNumberKey(event) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const num = Number(event.key);
      if (!Number.isInteger(num) || num < 1 || num > round.options.length) return;
      const idx = num - 1;
      event.preventDefault();
      setSelected(prev => prev.includes(idx) ? prev.filter(item => item !== idx) : [...prev, idx]);
    }
    window.addEventListener('keydown', onNumberKey);
    return () => window.removeEventListener('keydown', onNumberKey);
  }, [visible, waitingForAnswer, round?.options?.length]);

  function handleFeedSelection() {
    const sel = window.getSelection();
    const text = sel?.toString().trim() || '';
    if (!text || !feed.current) { setSelectionBar(null); return; }
    const anchor = sel.anchorNode?.parentElement || sel.anchorNode;
    const focus = sel.focusNode?.parentElement || sel.focusNode;
    if (!feed.current.contains(anchor) || !feed.current.contains(focus)) { setSelectionBar(null); return; }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) { setSelectionBar(null); return; }
    setSelectionBar({
      text: text.slice(0, 2000),
      top: Math.max(54, rect.top - 42),
      left: Math.min(window.innerWidth - 220, Math.max(16, rect.left + rect.width / 2 - 96)),
    });
  }

  async function copyThreadMarkdown() {
    try {
      await navigator.clipboard.writeText(formatIdeaMarkdown(idea));
      setCopiedThread(true);
      setTimeout(() => setCopiedThread(false), 1600);
    } catch { /* ignore */ }
  }

  useEffect(() => () => window.speechSynthesis?.cancel(), [round?.question, inspector, visible]);

  function readQuestion() {
    const speech = window.speechSynthesis;
    if (!speech || !waitingForAnswer) return;
    if (speech.speaking) { speech.cancel(); return; }
    const utterance = new SpeechSynthesisUtterance([round.question,
      ...round.options.map((option, index) => `选项 ${index + 1}，${option}`)].join('。'));
    utterance.lang = 'zh-CN';
    utterance.onerror = event => {
      if (!['interrupted', 'canceled'].includes(event.error)) setError('朗读失败，请检查 Windows 语音设置。');
    };
    speech.speak(utterance);
  }

  useEffect(() => {
    if (targetJob) {
      if (notebookOpen) onCloseNotebook();
      setInspector('research');
    }
  }, [targetJob]);

  useEffect(() => {
    if (paper && previousPaper.current !== paper) {
      if (workbenchFull) setWorkbenchFull(false);
      requestAnimationFrame(() => document.getElementById('reply')?.focus());
    }
    previousPaper.current = paper;
  }, [paper, workbenchFull]);

  useEffect(() => {
    if (idea.discussion.length) latest.current?.scrollIntoView({ block: 'nearest' });
  }, [idea.discussion.length, idea.status]);

  async function ask(response, selectedProvider) {
    setError('');
    try {
      await api.ask(idea.id, response, selectedProvider);
      setSelected([]);
      setCustom(false);
      return true;
    } catch (err) { setError(errorText(err)); return false; }
  }

  const hideChatThread = Boolean(inspector && workbenchFull);

  return <div className="dialogue-workbench" data-inspector={inspector || undefined} data-full={workbenchFull || undefined}>
    <article className="idea chat" hidden={hideChatThread}>
      <header className="chat-header research-chat-header">
        <div className="chat-title-block">
          <div className="chat-title-row">
            <h1>{title(idea)}</h1>
            <span className="status-pill" data-status={displayState.key}>{displayState.label}</span>
          </div>
          <div className="chat-subtitle-meta">
            <time dateTime={idea.created}>{dates.format(new Date(idea.created))}</time>
            <span>· 共 {idea.discussion.length + 1} 条记录</span>
            {idea.paper && <span>· <Icon name="book" />{idea.paper}</span>}
          </div>
        </div>

        <div className="inline-actions chat-workbench-toggles">
          {waitingForAnswer && window.speechSynthesis && <button type="button" className="quiet icon-label" onClick={readQuestion}>
            <Icon name="play" />朗读
          </button>}
          <button type="button" className="quiet icon-label" title="复制整段讨论为 Markdown"
            onClick={() => void copyThreadMarkdown()}>
            <Icon name={copiedThread ? 'check' : 'copy'} />{copiedThread ? '已复制' : '复制纪要'}
          </button>
          <div className="segmented-pills" role="group" aria-label="右侧协同面板">
            <button type="button" className="quiet icon-label" aria-pressed={inspector === 'research'}
              onClick={() => selectInspector('research')}>
              <Icon name="search" />查证{activeJobsCount > 0 && <em className="mini-badge">{activeJobsCount}</em>}
            </button>
            <button ref={evidenceButton} type="button" className="quiet icon-label" aria-expanded={inspector === 'evidence'}
              aria-pressed={inspector === 'evidence'}
              onPointerDown={event => { if (window.getSelection()?.toString().trim()) event.preventDefault(); }}
              onClick={() => {
                const sel = window.getSelection();
                const msg = node => (node?.parentElement || node)?.closest?.('.message');
                const from = msg(sel?.anchorNode);
                const to = msg(sel?.focusNode);
                const picked = from && from === to && feed.current?.contains(from)
                  ? sel.toString().trim().slice(0, 2000) : '';
                if (picked) {
                  sel.removeAllRanges();
                  sendToEvidence(picked);
                } else if (inspector === 'evidence') {
                  closeEvidence();
                } else {
                  if (notebookOpen) onCloseNotebook();
                  setInspector('evidence');
                  requestAnimationFrame(() => document.querySelector('.evidence-panel textarea')?.focus({ preventScroll: true }));
                }
              }}>
              <Icon name="shield" />证据台
            </button>
            <button type="button" className="quiet icon-label" aria-pressed={inspector === 'notebook'}
              onClick={() => selectInspector('notebook')}>
              <Icon name="document" />记录本
            </button>
          </div>
        </div>
      </header>

      <div className="chat-feed" ref={feed} onMouseUp={handleFeedSelection} onKeyUp={handleFeedSelection}>
        {selectionBar && <div className="feed-selection-popover" style={{ top: selectionBar.top, left: selectionBar.left }}>
          <button type="button" className="quiet icon-label" onMouseDown={e => e.preventDefault()} onClick={() => {
            const text = selectionBar.text;
            window.getSelection()?.removeAllRanges();
            setSelectionBar(null);
            sendToEvidence(text);
          }}>
            <Icon name="shield" />送入证据台
          </button>
          <button type="button" className="quiet icon-label" onMouseDown={e => e.preventDefault()} onClick={async () => {
            try { await navigator.clipboard.writeText(selectionBar.text); } catch { /* ignore */ }
            window.getSelection()?.removeAllRanges();
            setSelectionBar(null);
          }}>
            <Icon name="copy" />复制
          </button>
        </div>}
        <div className="seed-origin-banner">
          <div className="seed-origin-label"><Icon name="compose" />初始记录</div>
          <Message type="user-message" roleLabel="初始想法" copyText={idea.body || idea.excerpt} onQuoteEvidence={sendToEvidence}>
            {idea.body && <p className="body-text">{idea.body}</p>}
            {(idea.paper || idea.page) && <p className="source seed-source-pill">
              <Icon name="location" />{[idea.paper, idea.page && '第 ' + idea.page + ' 页'].filter(Boolean).join(' · ')}
            </p>}
            {idea.excerpt && <blockquote>{idea.excerpt}</blockquote>}
          </Message>
        </div>

        {idea.discussion.map((item, index) => 'message' in item
          ? <Message key={index} type="user-message" roleLabel={`补充 · 第 ${index + 1} 步`}
              copyText={item.message} onQuoteEvidence={sendToEvidence}>
              {item.message && <p className="body-text">{item.message}</p>}
              <PaperReference paper={item.paper} />
              <StudioAttachment attachment={item.artifact} />
            </Message>
          : <div key={index} className="exchange">
              <Message type="agent-message" roleLabel={`追问 · 第 ${index + 1} 轮`}
                copyText={item.question} onQuoteEvidence={sendToEvidence}>
                {item.answer
                  ? <p className="resolved-question-text">{item.question}</p>
                  : <Question round={item} selected={selected} onSelect={setSelected} custom={custom}
                      onCustom={checked => {
                        setCustom(checked);
                        if (checked) requestAnimationFrame(() => document.getElementById('reply')?.focus());
                      }}>
                      <ReplyInput waiting draft={replyDraft} setDraft={setReplyDraft} custom />
                    </Question>}
                <AgentActivity activity={item.activity} />
              </Message>
              {item.answer && <Message type="user-message" roleLabel="你的回应"
                copyText={item.answer.skipped ? '' : [...item.answer.options, item.answer.note].filter(Boolean).join('\n')}
                onQuoteEvidence={sendToEvidence}>
                <p className="body-text">
                  {item.answer.skipped ? '这题先跳过' : [...item.answer.options, item.answer.note].filter(Boolean).join('\n')}
                </p>
                <PaperReference paper={item.answer.paper} />
                <StudioAttachment attachment={item.answer.artifact} />
              </Message>}
            </div>)}

        <ResearchActivity jobs={jobs} open={() => {
          if (notebookOpen) onCloseNotebook();
          setInspector('research');
        }} />
        <div ref={latest} />
      </div>

      <div className="chat-end">
        {pending && <div className="status-line active-thinking-bar" role="status">
          <span>{labels[idea.status]}…</span>
          <button className="quiet" onClick={() => void api.cancel(idea.id)}>停止</button>
        </div>}
        {!pending && !waitingForAnswer && (idea.status === 'failed' || idea.error) && <div className="status-line error-retry-bar">
          <span>{idea.error || '上次请求未完成'}</span>
          <RetryAgent entries={entries} provider={idea.provider || provider} label="重试" run={agent => ask(undefined, agent)} />
        </div>}
        {!pending && !waitingForAnswer && provider && idea.status !== 'failed' && !idea.error &&
          <div className="status-line">
            <span className="muted">
              {autoFollowup ? '已暂停自动追问，可自由记录或手动触发下一问' : '当前为「仅记录」模式'}
            </span>
            <button className="quiet icon-label" onClick={() => { setAutoFollowup(true); void ask(); }}>
              <Icon name="socratic" />发起追问
            </button>
          </div>}
        <Reply enabled={visible && !hideChatThread} provider={provider} entries={entries} pending={pending}
          waiting={waitingForAnswer} selected={selected} custom={!hideChatThread && Boolean(waitingForAnswer) && custom}
          send={ask} onSettings={onSettings} paper={paper} onPickPaper={onPickPaper} onRemovePaper={onRemovePaper}
          draft={replyDraft} setDraft={setReplyDraft} artifact={artifact} removeArtifact={removeArtifact}
          autoFollowup={autoFollowup} setAutoFollowup={setAutoFollowup} />
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </article>

    {inspector && <section className="dialogue-side-dock" aria-label="思辨协同工作台">
      {inspector === 'research' && <div className="research-dock-shell">
        <header className="workbench-pane-header">
          <div className="workbench-pane-title">
            <span className="workbench-pane-icon"><Icon name="search" /></span>
            <div>
              <h2>文献查证与关联</h2>
              <p>{title(idea)}</p>
            </div>
          </div>
          <div className="inline-actions">
            <button type="button" className="quiet icon-only-btn" title={workbenchFull ? '恢复分栏视图' : '展开全宽查看'}
              aria-label={workbenchFull ? '恢复分栏视图' : '展开全宽查看'} onClick={() => setWorkbenchFull(v => !v)}>
              <Icon name={workbenchFull ? 'minimize' : 'maximize'} />
            </button>
            <button type="button" className="quiet icon-only-btn" title="关闭研究工作" aria-label="关闭研究工作"
              onClick={() => { setInspector(''); setWorkbenchFull(false); }}>
              <Icon name="close" />
            </button>
          </div>
        </header>
        <div className="research-dock-scroll">
          <ResearchPanel idea={idea} ideas={ideas} entries={entries} openIdea={openIdea} openPaper={openPaper}
            targetJob={targetJob} useRevision={revision => {
              setReplyDraft(previous => [previous, '根据论文查证，想进一步修改 Idea。\n' + revision].filter(Boolean).join('\n\n')
                .slice(0, waitingForAnswer ? 1500 : 8000));
              setWorkbenchFull(false);
              requestAnimationFrame(() => document.getElementById('reply')?.focus());
            }} />
        </div>
      </div>}

      {inspector === 'evidence' && <EvidencePanel ideaId={idea.id} visible={visible} selectedText={claimSeed}
        onClose={closeEvidence} onBind={(claim, button) => onBindEvidence(idea.id, claim, button)} onOpen={openPaper} />}

      {inspector === 'notebook' && <Notebook key={idea.id} mode="split" docked
        setMode={next => { if (!next) { onCloseNotebook(); setInspector(''); } }} ideaId={idea.id} />}
    </section>}
  </div>;
}

function ResearchWorkspace({ appearance }) {
  useWorkspaceMotion();
  const [ideas, setIdeas] = useState([]);
  const [active, setActive] = useState('');
  const [settings, setSettings] = useState(null);
  const [mode, setMode] = useState('inbox');
  const [sessionRailOpen, setSessionRailOpen] = useState(() => localStorage.getItem('sparkseed:session-rail') !== 'false');
  const [notebookMode, setNotebookMode] = useState('');
  const [commandOpen, setCommandOpen] = useState(false);
  const [voiceRequest, setVoiceRequest] = useState(0);
  const [counts, setCounts] = useState({ papers: 0, notes: 0, tasks: 0, attention: 0 });
  const [navTargetId, setNavTargetId] = useState('');

  useEffect(() => {
    localStorage.setItem('sparkseed:session-rail', String(sessionRailOpen));
  }, [sessionRailOpen]);

  const isDialogueMode = ['inbox', 'new'].includes(mode);
  const toggleNotebook = () => setNotebookMode(previous => previous ? '' : 'float');
  const closeNotebook = () => setNotebookMode('');

  const [libraryId, setLibraryId] = useState('');
  const [starView, setStarView] = useState(initialStarView);
  const [starOptions, setStarOptions] = useState(loadStarPreferences);
  const [starRenderInfo, setStarRenderInfo] = useState();
  const [reducedStarMotion, setReducedStarMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReducedStarMotion(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);

  useEffect(() => { saveStarPreferences(starOptions); }, [starOptions]);

  const [section, setSection] = useState('appearance');
  const [draft, setDraft] = useState(blank);
  const openings = appearance?.openings || defaultOpenings;
  const [opening, setOpening] = useState(() => chooseOpening(openings));
  useEffect(() => { if (!openings.includes(opening)) setOpening(chooseOpening(openings)); }, [openings, opening]);

  const [quickOpen, setQuickOpen] = useState(false);
  const [quickDraft, setQuickDraft] = useState(blank);
  const [paperPicker, setPaperPicker] = useState(null);
  const [researchTarget, setResearchTarget] = useState(null);
  const [replyPapers, setReplyPapers] = useState({});
  const [draftArtifacts, setDraftArtifacts] = useState({});
  const [researchDrafts, setResearchDrafts] = useState({});
  const [skillDraft, setSkillDraft] = useState(null);
  const [settingsError, setSettingsError] = useState('');
  const [ideasError, setIdeasError] = useState('');
  const beforeSettings = useRef('inbox');
  const content = useRef(null);
  const scrollPositions = useRef({});
  const restoringScroll = useRef(false);

  // Refresh global telemetry counts for Dock & Topbar badges
  const refreshCounts = useCallback(() => {
    void api.listPapers?.().then(rows => {
      if (Array.isArray(rows)) setCounts(prev => ({ ...prev, papers: rows.length }));
    }, () => {});
    void api.listNotes?.().then(rows => {
      if (Array.isArray(rows)) setCounts(prev => ({ ...prev, notes: rows.length }));
    }, () => {});
    void api.researchDashboard?.().then(jobs => {
      if (Array.isArray(jobs)) {
        const attention = jobs.filter(row => workStageGroup(row.workStage) === 'attention').length;
        const activeJobs = jobs.filter(row => ['attention', 'active'].includes(workStageGroup(row.workStage))).length;
        setCounts(prev => ({ ...prev, tasks: activeJobs, attention }));
      }
    }, () => {});
  }, []);

  useEffect(() => {
    refreshCounts();
    const offPapers = api.onPapersChanged?.(refreshCounts);
    const offNotes = api.onNotesChanged?.(refreshCounts);
    const offWork = api.onResearchWorkChanged?.(refreshCounts);
    return () => { offPapers?.(); offNotes?.(); offWork?.(); };
  }, [refreshCounts]);

  // Global keyboard shortcuts: Ctrl+K (Command Palette), Ctrl+N (New Spark), Ctrl+/ (Toggle Session Rail)
  useEffect(() => {
    function onKeyDown(event) {
      if (event.nativeEvent?.isComposing || event.keyCode === 229) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(current => !current);
        return;
      }
      if (event.target.closest?.('dialog[open]')) return;
      if (mod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        openNew();
      } else if (mod && event.key === '/') {
        event.preventDefault();
        setSessionRailOpen(current => !current);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useLayoutEffect(() => {
    const element = content.current;
    if (!element) return;
    const target = scrollPositions.current[mode] || 0;
    restoringScroll.current = true;
    const stop = () => { restoringScroll.current = false; observer.disconnect(); };
    const restore = () => {
      element.scrollTop = target;
      if (Math.abs(element.scrollTop - target) < 1) stop();
    };
    const observer = new ResizeObserver(restore);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    restore();
    element.addEventListener('wheel', stop, { passive: true });
    element.addEventListener('pointerdown', stop);
    element.addEventListener('keydown', stop);
    return () => {
      stop();
      element.removeEventListener('wheel', stop);
      element.removeEventListener('pointerdown', stop);
      element.removeEventListener('keydown', stop);
    };
  }, [mode]);

  const quickReturnFocus = useRef(null);
  const paperReturnFocus = useRef(null);
  const settingsRequest = useRef(0);
  const starSurface = mode === 'library' && settings?.libraryView === 'stars' &&
    !ideas.some(idea => idea.id === libraryId) && !quickOpen && !paperPicker;

  useEffect(() => {
    void api.setStarSurface(starSurface).catch(() => {});
    if (!starSurface) setStarRenderInfo(undefined);
  }, [starSurface]);

  const loadSettings = useCallback(async () => {
    const request = ++settingsRequest.current;
    try {
      const next = await api.getSettings();
      if (settingsRequest.current === request) { setSettings(next); setSettingsError(''); }
    } catch (err) {
      if (settingsRequest.current === request) setSettingsError(errorText(err));
      throw err;
    }
  }, []);

  function openSettings(targetSection = 'appearance') {
    if (mode !== 'settings') beforeSettings.current = mode;
    void loadSettings().catch(() => {});
    setQuickOpen(false);
    setPaperPicker(null);
    setSection(targetSection);
    setMode('settings');
  }

  async function cycleTheme() {
    if (!appearance) return;
    const order = ['light', 'paper', 'graphite', 'black'];
    const currentIdx = order.indexOf(appearance.palette);
    const nextMode = order[(currentIdx + 1) % order.length];
    try { await api.saveAppearance({ ...appearance, mode: nextMode }); }
    catch { /* ignore */ }
  }

  function useSource(result) {
    const excerpt = result.entries.length
      ? result.entries.map(item => [item.title, item.url, item.description].filter(Boolean).join('\n')).join('\n\n')
      : result.text;
    setDraft(previous => ({
      ...previous,
      paper: previous.paper || result.source + ' · ' + result.query,
      excerpt: [excerpt, previous.excerpt].filter(Boolean).join('\n\n').slice(0, 16000),
    }));
    openNew();
  }

  function openNew() {
    setOpening(current => chooseOpening(openings, current));
    setQuickOpen(false);
    setPaperPicker(null);
    setMode('new');
  }

  useEffect(() => {
    let mounted = true;
    let version = 0;
    async function refresh(next) {
      if (next) { setActive(next); setResearchTarget(null); setMode('inbox'); }
      const request = ++version;
      try {
        const rows = await api.list();
        if (mounted && request === version) {
          setIdeasError('');
          setIdeas(rows);
          setActive(previous => rows.some(row => row.id === previous) ? previous : rows[0]?.id || '');
          setLibraryId(previous => rows.some(row => row.id === previous) ? previous : '');
        }
      } catch (err) {
        if (mounted && request === version) setIdeasError(errorText(err));
      }
    }
    const unsubscribe = api.onChanged(next => void refresh(next));
    void refresh();
    void loadSettings().catch(() => {});
    return () => { mounted = false; unsubscribe(); };
  }, []);

  function openQuickCapture(voice = false) {
    setPaperPicker(null);
    setVoiceRequest(previous => voice === true ? previous + 1 : 0);
    const input = document.getElementById('quick-draft');
    if (input) {
      requestAnimationFrame(() => input.focus());
      return;
    }
    quickReturnFocus.current = document.activeElement;
    setQuickOpen(true);
  }

  useEffect(() => { if (!quickOpen) setVoiceRequest(0); }, [quickOpen]);

  function closeQuickCapture(restore = true) {
    const previous = quickReturnFocus.current;
    setQuickOpen(false);
    setVoiceRequest(0);
    if (restore) requestAnimationFrame(() => {
      if (previous?.isConnected && previous.getClientRects().length) previous.focus({ preventScroll: true });
      else content.current?.focus({ preventScroll: true });
    });
  }

  useEffect(() => {
    let mounted = true;
    async function checkRequest() {
      const request = await api.takeCaptureRequest();
      if (request && mounted) openQuickCapture(request === 'voice');
    }
    const unsubscribe = api.onCaptureRequest(() => void checkRequest());
    void checkRequest();
    return () => { mounted = false; unsubscribe(); };
  }, []);

  const idea = ideas.find(row => row.id === active) || ideas[0];

  function openDiscussion(id) {
    setResearchTarget(null);
    setQuickOpen(false);
    setPaperPicker(null);
    setActive(id);
    setMode('inbox');
    content.current?.focus({ preventScroll: true });
  }

  function openResearchJob(target) {
    openDiscussion(target.ideaId);
    setResearchTarget(target);
  }

  useEffect(() => api.onOpenResearchWork(openResearchJob), []);

  function usePaper(material) {
    const attach = previous => ({
      ...previous,
      paper: material.title,
      page: String(material.page),
      excerpt: material.translation
        ? (material.excerpt.slice(0, 3950) + '\n\n译文\n' + material.translation.slice(0, 3950))
        : material.excerpt,
    });
    if (paperPicker?.type === 'reply' || (paperPicker?.type === 'evidence' && paperPicker.ideaId)) {
      const id = paperPicker.id || paperPicker.ideaId;
      setReplyPapers(previous => ({ ...previous, [id]: material }));
      if (paperPicker.type === 'evidence' && mode !== 'inbox') openDiscussion(id);
    } else if (paperPicker?.type === 'quick') setQuickDraft(attach);
    else {
      setDraft(attach);
      if (!paperPicker) openNew();
    }
    setPaperPicker(null);
  }

  function openEvidencePaper(id, page, link) {
    paperReturnFocus.current = document.activeElement;
    setPaperPicker({ type: 'evidence', target: { id, page, link }, ideaId: mode === 'library' ? libraryId : idea?.id });
  }

  function bindDiscussionEvidence(ideaId, claim, button) {
    paperReturnFocus.current = button;
    setPaperPicker({ type: 'bind-evidence', ideaId, claim });
  }

  async function saveDiscussionEvidence(input) {
    const { ideaId, claim } = paperPicker;
    await api.changeEvidence(ideaId, { ...input, action: 'bind', claimId: claim.id });
    closePaperPicker();
  }

  function closePaperPicker() {
    setPaperPicker(null);
    if (paperPicker?.type === 'evidence' || paperPicker?.type === 'bind-evidence') {
      requestAnimationFrame(() => paperReturnFocus.current?.focus({ preventScroll: true }));
    }
  }

  function attachStudio(artifact, id) {
    const key = id || 'new';
    setDraftArtifacts(previous => ({ ...previous, [key]: { id: artifact.id, title: artifact.title, type: artifact.type } }));
    if (id) openDiscussion(id);
    else openNew();
  }

  function removeStudio(key) {
    setDraftArtifacts(previous => ({ ...previous, [key]: undefined }));
  }

  function openWorkspacePage(page, targetId = '') {
    setQuickOpen(false);
    setPaperPicker(null);
    setNavTargetId(targetId);
    setMode(page);
  }

  function navigateFromGuide(target) {
    if (target === 'capture') return openQuickCapture(false);
    if (target === 'new') return openNew();
    if (['agents', 'skills', 'studio-skills', 'automation'].includes(target)) return openSettings(target);
    if (target === 'memory') return openSettings('research');
    openWorkspacePage(target);
  }

  return <div className="workspace"
    data-surface={starSurface ? 'stars' : paperPicker || mode === 'papers' ? 'papers' : mode}
    data-star-motion={starSurface && (!starOptions.motion || reducedStarMotion) ? 'paused' : undefined}>

    {starSurface && <div className="workspace-star-background"><SpaceBackground camera={starView.camera}
      preferences={starOptions} mapActive selectedId={starView.selectedId} ideas={ideas} onRenderInfo={setStarRenderInfo} /></div>}

    <header className="workspace-topbar">
      <div className="topbar-left">
        <WorkspaceBrand />
        <span className="topbar-divider" aria-hidden="true" />
        <span className="topbar-context-pill">
          {paperPicker ? '选择引用文献' : quickOpen ? '快速记录' : modeNames[mode] || '工作区'}
        </span>
        {isDialogueMode && !sessionRailOpen && !paperPicker && <button type="button"
          className="quiet topbar-rail-trigger icon-label" title="展开对话列表 (Ctrl+/)"
          onClick={() => setSessionRailOpen(true)}>
          <Icon name="sidebar" />列表 · {ideas.length}
        </button>}
      </div>

      <button type="button" className="topbar-omni-search" onClick={() => setCommandOpen(true)}
        aria-label="打开全局检索与命令面板 (Ctrl+K)">
        <Icon name="search" />
        <span>搜索对话、文献、笔记或命令…</span>
        <kbd>Ctrl K</kbd>
      </button>
    </header>

    <Sidebar ideas={ideas} active={idea?.id} counts={counts}
      mode={paperPicker ? 'papers' : quickOpen ? 'capture' : mode}
      openNew={openNew}
      openLibrary={() => openWorkspacePage('library')}
      openPapers={() => openWorkspacePage('papers')}
      openNotes={() => openWorkspacePage('notes')}
      openTasks={() => openWorkspacePage('tasks')}
      openStudio={() => openWorkspacePage('studio')}
      openDiscussion={openDiscussion}
      openSettings={() => openSettings('appearance')}
      quickCapture={openQuickCapture}
      openGuide={() => openWorkspacePage('guide')} />

    <div className="workspace-stage" inert={Boolean(paperPicker) || (quickOpen && !paperPicker) || undefined}>
      {isDialogueMode && <SessionRail ideas={ideas} active={idea?.id} mode={mode}
        open={sessionRailOpen} onToggle={setSessionRailOpen}
        openNew={openNew} openDiscussion={openDiscussion}
        savedWidth={settings?.sidebarWidth}
        onSaveWidth={width => {
          setSettings(previous => previous && { ...previous, sidebarWidth: width });
          void api.setSidebarWidth(width).catch(() => loadSettings().catch(() => {}));
        }} />}

      <main className="workspace-content" ref={content} tabIndex={-1}
        onScroll={event => { if (!restoringScroll.current) scrollPositions.current[mode] = event.currentTarget.scrollTop; }}>
        {ideasError && ['inbox', 'library'].includes(mode) && <p className="workspace-load-error error" role="alert">无法读取讨论记录。{ideasError}</p>}

        {mode === 'settings' ? settings
          ? <Preferences section={section} onSection={setSection} data={settings} appearance={appearance}
              reload={loadSettings} close={() => setMode(beforeSettings.current)}
              researchDrafts={researchDrafts} setResearchDrafts={setResearchDrafts}
              onUseSource={useSource} openIdea={openDiscussion} skillDraft={skillDraft} setSkillDraft={setSkillDraft} />
          : settingsError ? <div className="idea workspace-load-error"><p className="error" role="alert">无法读取偏好设置。{settingsError}</p>
              <button type="button" onClick={() => void loadSettings().catch(() => {})}>重试</button>
            </div> : <p className="idea" role="status">正在读取偏好设置…</p>

          : mode === 'library' ? <IdeaLibrary ideas={ideas} selected={libraryId} select={setLibraryId}
              starView={starView} setStarView={setStarView}
              starOptions={starOptions} changeStarOptions={change => setStarOptions(previous => ({ ...previous, ...change }))}
              starRenderInfo={starRenderInfo} reducedStarMotion={reducedStarMotion}
              openDiscussion={openDiscussion} openPaper={openEvidencePaper} newIdea={openNew}
              entries={settings?.entries || []} provider={settings?.provider} view={settings?.libraryView || 'cards'}
              changeView={async view => {
                await api.setLibraryView(view);
                await loadSettings();
              }}
              createSkill={targetIdea => { setSkillDraft(draftDiscussionSkill(targetIdea)); openSettings('skills'); }} />

          : mode === 'guide' ? <UserGuide onNavigate={navigateFromGuide} />
          : mode === 'papers' ? <PaperLibrary use={usePaper} initialPaperId={navTargetId} />
          : mode === 'notes' ? <NotesLibrary ideas={ideas} openIdea={openDiscussion} initialNoteId={navTargetId} />
          : mode === 'tasks' ? <ResearchDashboard ideas={ideas} entries={settings?.entries || []} openJob={openResearchJob} />
          : mode === 'studio' ? <Studio ideas={ideas} defaultIdea={idea?.id} entries={settings?.entries || []}
              insert={attachStudio} openAgents={() => openSettings('agents')} />

          : idea && mode !== 'new' ? <IdeaConversation key={idea.id} visible={!quickOpen && !paperPicker}
              idea={idea} ideas={ideas} openIdea={openDiscussion} openPaper={openEvidencePaper}
              onBindEvidence={bindDiscussionEvidence}
              notebookOpen={Boolean(notebookMode)} onToggleNotebook={toggleNotebook} onCloseNotebook={closeNotebook}
              artifact={draftArtifacts[idea.id]} removeArtifact={() => removeStudio(idea.id)}
              targetJob={researchTarget?.ideaId === idea.id ? researchTarget.jobId : ''}
              provider={settings?.provider} entries={settings?.entries || []}
              onSettings={() => openSettings('agents')}
              paper={replyPapers[idea.id]} onPickPaper={() => setPaperPicker({ type: 'reply', id: idea.id })}
              onRemovePaper={() => setReplyPapers(previous => ({ ...previous, [idea.id]: undefined }))} />

          : <div className="launchpad-layout" data-notebook={notebookMode ? 'open' : undefined}>
              <div className="empty launchpad-stage">
                <div className="launchpad-hero">
                  <div className="launchpad-eyebrow">
                    <span className="launchpad-spark-badge">新建研究对话</span>
                    {openings.length > 1 && <button type="button" className="quiet launchpad-shuffle"
                      title="换一句提示" onClick={() => setOpening(current => chooseOpening(openings, current))}>
                      <Icon name="refresh" />换一句
                    </button>}
                  </div>
                  {opening && <h1 key={opening}>{opening}</h1>}
                </div>

                <IdeaComposer enabled={!quickOpen && !paperPicker} provider={settings?.provider}
                  entries={settings?.entries || []} onSettings={() => openSettings('agents')}
                  draft={draft} setDraft={setDraft}
                  onNotebook={toggleNotebook} notebookOpen={Boolean(notebookMode)}
                  artifact={draftArtifacts.new} removeArtifact={() => removeStudio('new')}
                  onPickPaper={() => setPaperPicker({ type: 'new' })} />

                <div className="launchpad-starters-grid" aria-label="从一个方向开始">
                  {starters.map(({ label, desc, opening: promptSeed, icon }) => <button key={label}
                    className="starter-bento-card" type="button" onClick={() => {
                      setDraft(previous => ({ ...previous, body: previous.body ? previous.body + '\n' + promptSeed : promptSeed }));
                      document.getElementById('draft')?.focus();
                    }}>
                    <span className="starter-card-icon"><Icon name={icon} /></span>
                    <span className="starter-card-copy">
                      <strong>{label}</strong>
                      <small>{desc}</small>
                    </span>
                    <Icon name="forward" className="starter-card-arrow" />
                  </button>)}
                </div>

                {ideas.length > 0 && <div className="launchpad-recent-strip">
                  <div className="launchpad-recent-head">
                    <span>继续近期思辨</span>
                    <button type="button" className="quiet" onClick={() => openWorkspacePage('library')}>查看全部 {ideas.length} 条 →</button>
                  </div>
                  <div className="launchpad-recent-pills">
                    {ideas.slice(0, 4).map(row => <button key={row.id} type="button" className="recent-spark-pill"
                      onClick={() => openDiscussion(row.id)}>
                      <Icon name={row.pinned_at ? 'pin' : 'discussion'} />
                      <span>{title(row)}</span>
                    </button>)}
                  </div>
                </div>}
              </div>

              {notebookMode && <aside className="dialogue-side-dock">
                <Notebook key="draft" mode="split" docked setMode={setNotebookMode} ideaId="" />
              </aside>}
            </div>}
      </main>
    </div>

    {quickOpen && !paperPicker && <div className="spotlight-capture-overlay" role="dialog" aria-modal="true"
      aria-labelledby="quick-capture-title" onClick={event => {
        if (event.target === event.currentTarget) closeQuickCapture();
      }}>
      <section className="quick-capture-sheet">
        <header className="quick-capture-head">
          <div className="quick-capture-title-group">
            <span className="workbench-pane-icon"><Icon name="bolt" /></span>
            <div>
              <h1 id="quick-capture-title">快速记录</h1>
              <p>随时捕捉一闪而过的念头，当前工作区进度已为你保留</p>
            </div>
          </div>
          <button type="button" className="quiet icon-label" onClick={() => closeQuickCapture()}>
            <Icon name="close" />收起并保留草稿
          </button>
        </header>
        <IdeaComposer quick enabled={!paperPicker} voiceRequest={voiceRequest} draft={quickDraft} setDraft={setQuickDraft}
          onClose={closeQuickCapture} onPickPaper={() => setPaperPicker({ type: 'quick' })} />
        <footer className="quick-capture-tips">
          <span><kbd>Ctrl+Enter</kbd> 保存灵感</span>
          <span><kbd>Ctrl+Shift+Enter</kbd> 保存并立即讨论</span>
          <span><kbd>Esc</kbd> 返回原页面</span>
        </footer>
      </section>
    </div>}

    {paperPicker && <div className="paper-picker-overlay">
      <PaperLibrary
        use={paperPicker.claim ? undefined : usePaper}
        close={closePaperPicker}
        target={paperPicker.target}
        evidenceClaim={paperPicker.claim}
        saveEvidence={paperPicker.claim ? saveDiscussionEvidence : undefined} />
    </div>}

    <CommandPalette
      open={commandOpen}
      onClose={() => setCommandOpen(false)}
      ideas={ideas}
      onOpenIdea={openDiscussion}
      onOpenLibraryIdea={id => { setLibraryId(id); openWorkspacePage('library'); }}
      onNavigate={openWorkspacePage}
      onQuickCapture={openQuickCapture}
      onVoiceCapture={() => openQuickCapture(true)}
      onCycleTheme={() => void cycleTheme()}
      onOpenSettings={openSettings}
    />
  </div>;
}

function App() {
  const [appearance, setAppearance] = useState(null);
  const [startup, setStartup] = useState(false);
  const finishStartup = useCallback(() => setStartup(false), []);
  useEffect(() => {
    let current = true;
    let changed = false;
    let first = true;
    function apply(next) {
      if (first) {
        first = false;
        setStartup(!matchMedia('(prefers-reduced-motion: reduce)').matches);
      }
      document.documentElement.dataset.palette = next.palette;
      document.documentElement.dataset.accent = next.accent;
      document.documentElement.dataset.typeface = next.typeface;
      document.documentElement.dataset.fontSize = next.fontSize;
      document.documentElement.dataset.bold = next.bold;
      setAppearance(next);
    }
    const off = api.onAppearance(next => { changed = true; apply(next); });
    void api.getAppearance().catch(() => resolveAppearance(undefined, matchMedia('(prefers-color-scheme: dark)').matches))
      .then(next => { if (current && !changed) apply(next); });
    return () => { current = false; off(); };
  }, []);
  if (!appearance) return null;
  return <>
    <div inert={startup}><ResearchWorkspace appearance={appearance} /></div>
    {startup && <StartupSplash finish={finishStartup} />}
  </>;
}

createRoot(document.getElementById('root')).render(<App />);
