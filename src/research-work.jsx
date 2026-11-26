import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { ideaTitle } from './idea-text.mjs';
import { ResearchTaskDelete } from './research-task-delete.jsx';
import { workStageLabel } from '../desktop/work-stage.mjs';
import { mandateLabel, policyNoticeText } from './work-labels.mjs';

const api = window.recorder;
const kinds = { initial: '文献初查', deep: '文献深查', synthesis: '研究整理' };
const stages = { plan: '确定检索范围', search: '检索论文', read: '读取开放正文', review: '核对引文和整理证据', organize: '整理讨论和相关 Idea' };
const states = { queued: '排队中', running: '进行中', waiting: '待你确认', ready: '已完成', paused: '已暂停', failed: '失败' };
export { kinds as workKinds, stages as workStages, states as workStates };

const jobStage = job => workStageLabel(job.workStage) || states[job.status] || job.status;
const errorText = error => error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');
const comparisonFields = [['task', '任务'], ['method', '方法'], ['data', '数据'], ['baseline', '基线'], ['metric', '指标'], ['result', '结果']];
const evidenceKinds = ['支持', '反例', '适用条件', '高度相似', '证据不足'];
const evidenceKind = card => card.kind === '限制' ? '适用条件' : evidenceKinds.includes(card.kind) ? card.kind : '证据不足';
const locationOf = card => card.section || (card.page === null ? '摘要' : 'PDF 第 ' + card.page + ' 页');

function currentJobs(jobs) {
  const latest = new Map();
  for (const job of jobs) {
    if (job.status === 'superseded') continue;
    const key = job.kind === 'deep' ? job.kind + ':' + job.question : job.kind;
    if (!latest.has(key)) latest.set(key, job);
  }
  const priority = { deep: 0, initial: 1, synthesis: 2 };
  return [...latest.values()].sort((a, b) => priority[a.kind] - priority[b.kind]);
}

export function RetryAgent({ entries, provider, label = '继续', run, disabled }) {
  const [choice, setChoice] = useState('');
  const available = entries.filter(entry => entry.installed || entry.base);
  const defaultChoice = available.some(entry => entry.id === provider) ? provider : '';
  const selected = available.some(entry => entry.id === choice) ? choice : defaultChoice;
  return <form className="inline-actions agent-retry" onSubmit={event => {
    event.preventDefault();
    if (selected) void run(selected);
  }}>
    <select aria-label="重试使用的 Agent" value={selected} disabled={disabled} onChange={event => setChoice(event.target.value)}>
      <option value="" disabled>选择 Agent</option>
      {available.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
    </select>
    <button disabled={disabled || !selected}>{label}</button>
  </form>;
}

export function useResearchJobs(id) {
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    let version = 0;
    async function reload() {
      const request = ++version;
      try {
        const rows = await api.listResearchWork(id);
        if (live && version === request) { setJobs(rows); setError(''); }
      } catch (err) { if (live && version === request) setError(errorText(err)); }
    }
    const off = api.onResearchWorkChanged(changed => { if (!changed || changed === id) void reload(); });
    void reload();
    return () => { live = false; off(); };
  }, [id]);
  return { jobs, error };
}

export function ResearchActivity({ jobs, open }) {
  const pending = currentJobs(jobs).filter(job => ['queued', 'running', 'paused', 'failed'].includes(job.status));
  if (!pending.length) return null;
  return <details className="agent-activity research-activity" open>
    <summary><Icon name="radar" />后台研究任务状态 · {pending.length}</summary>
    <ul aria-live="polite">{pending.map(job => <li key={job.id}>
      {kinds[job.kind]} · {jobStage(job)}{job.progress.stage && ' · ' + stages[job.progress.stage]}{job.error && ' · ' + job.error}
    </li>)}</ul>
    <button className="quiet icon-label" onClick={open}><Icon name="search" />打开研究工作面板</button>
  </details>;
}

function Findings({ report, job, openPaper, useRevision, run }) {
  const savePaper = (paper, page) => void run(async () => openPaper(await api.saveArxivPaper(job.id, paper.id), page || 1));
  const comparable = report.cards.filter(card => Object.values(card.comparison || {}).some(Boolean));
  return <>
    {(report.hypothesis || job.question) && <div className="work-hypothesis">
      <span className="mini-tag accent">查证假设</span>
      <p>{report.hypothesis || job.question}</p>
    </div>}
    {report.assessment && <p className="work-assessment-copy">{report.assessment}</p>}
    {report.revision && <div className="work-revision">
      <div><strong>改进建议</strong><p>{report.revision}</p></div>
      {useRevision && <button className="quiet icon-label" onClick={() => useRevision(report.revision)}>
        <Icon name="compose" />带回讨论修改
      </button>}
    </div>}

    {evidenceKinds.map(kind => {
      const cards = report.cards.filter(card => evidenceKind(card) === kind);
      if (!cards.length && (kind !== '证据不足' || !report.unknowns?.length)) return null;
      return <section className="evidence-group" key={kind} data-kind={kind}>
        <header className="evidence-group-head">
          <h4>{kind}</h4>
          <span className="pill-counter">{cards.length || report.unknowns?.length || 0}</span>
        </header>
        <div className="evidence-grid">
          {cards.map((card, index) => {
            const paper = report.papers.find(row => row.id === card.id);
            if (!paper) return null;
            const location = locationOf(card);
            return <article key={index} className="evidence-card" data-kind={kind}>
              <header>
                <h5>{paper.title}</h5>
                <span className="muted">{[paper.source, paper.version, paper.year, location].filter(Boolean).join(' · ')}</span>
              </header>
              <div className="evidence-finding-pair">
                <p><strong>能说明</strong> {card.finding}</p>
                <p><strong>边界局限</strong> {card.cannot || '现有引文不足以确定该结论能否直接推广到当前假设。'}</p>
              </div>
              {card.condition && <p className="muted">{card.condition}</p>}
              <blockquote>{card.quote}</blockquote>
              <footer className="inline-actions">
                {(paper.paperId || paper.url) && <button className="quiet icon-label" onClick={() => {
                  if (paper.paperId) openPaper(paper.paperId, card.page || 1);
                  else void run(() => api.openSourceLink(card.page && paper.arxiv
                    ? 'https://arxiv.org/pdf/' + paper.arxiv + '#page=' + card.page : paper.url + (card.anchor ? '#' + card.anchor : '')));
                }}><Icon name="document" />打开{location}</button>}
                {paper.arxiv && !paper.paperId && <button className="quiet icon-label" onClick={() => savePaper(paper, card.page)}>
                  <Icon name="import" />收入论文库
                </button>}
              </footer>
            </article>;
          })}
        </div>
        {kind === '证据不足' && !!report.unknowns?.length && <ul className="work-points">{report.unknowns.map(item => <li key={item}>{item}</li>)}</ul>}
      </section>;
    })}

    {comparable.length > 0 && <details className="work-collapsible"><summary>展开论文维度对照表（{comparable.length} 项）</summary>
      <div className="work-comparison"><table>
        <thead><tr><th>来源</th>{comparisonFields.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead>
        <tbody>{comparable.map((card, index) => <tr key={index}>
          <th scope="row">{report.papers.find(paper => paper.id === card.id)?.title} · {locationOf(card)}</th>
          {comparisonFields.map(([key]) => <td key={key}>{card.comparison[key] || '资料未注明'}</td>)}
        </tr>)}</tbody>
      </table></div>
    </details>}

    {!!report.papers.length && <details className="work-collapsible"><summary>查看全部检索文献（{report.papers.length} 篇）</summary>
      <ul className="work-points">{report.papers.map(paper => <li key={paper.id}>
        <span>{paper.title}</span> <small className="muted">{[paper.source, paper.version, paper.access].filter(Boolean).join(' · ')}</small>
        {(paper.url || paper.paperId) && <button className="quiet" onClick={() => paper.paperId
          ? openPaper(paper.paperId, 1) : void run(() => api.openSourceLink(paper.url))}>打开</button>}
        {paper.arxiv && !paper.paperId && <button className="quiet" onClick={() => savePaper(paper, 1)}>收入论文库</button>}
        {(paper.related || []).filter((row, index, all) => all.findIndex(item => item.doi === row.doi) === index)
          .map(row => <button className="quiet" key={row.doi} onClick={() => void run(() => api.openSourceLink('https://doi.org/' + encodeURI(row.doi)))}>
            {row.kind === 'is-preprint-of' ? '关联发表版本' : '关联预印本'}
          </button>)}
      </li>)}</ul>
    </details>}

    {!!report.commentary?.length && <details className="work-collapsible"><summary>网页公开讨论与评论线索</summary>
      <p className="muted">网页评论仅供查找线索，不参与论文证据判断。</p>
      <ul className="work-points">{report.commentary.map(row => <li key={row.url}>
        <button className="quiet" onClick={() => void run(() => api.openSourceLink(row.url))}>{row.title}</button> {row.description}
      </li>)}</ul>
    </details>}

    {!!report.searches?.length && <details className="work-collapsible"><summary>查看本次检索策略与范围</summary>
      <p className="muted">{new Date(report.searchedAt).toLocaleString('zh-CN')}</p>
      <ul className="work-points">{report.searches.map((entry, index) => <li key={index}>
        {entry.source} · {entry.query} · {entry.error || entry.count + ' 条'}
      </li>)}</ul>
    </details>}
  </>;
}

function Connection({ job, connection, decision, idea, openIdea, run }) {
  const [draft, setDraft] = useState(connection.draft || '');
  const [generating, setGenerating] = useState(false);
  const kind = connection.kind || '互补';
  return <details className="work-connection" open={decision === 'confirmed' || undefined}>
    <summary>
      <span className="mini-tag accent">{kind}</span>
      <strong>{ideaTitle(idea)}</strong>
      {decision === 'confirmed' && <span className="muted">· 已确认</span>}
      {decision === 'ignored' && <span className="muted">· 已忽略</span>}
    </summary>
    <p>{connection.reason}</p>
    <div className="inline-actions">
      <button className="quiet" onClick={() => openIdea(idea.id)}>查看原 Idea</button>
      {decision !== 'confirmed' && <button onClick={() => void run(() => api.decideIdeaRelation(job.id, idea.id, 'confirmed'))}>确认关系</button>}
      {decision !== 'ignored' && <button className="quiet" onClick={() => void run(() => api.decideIdeaRelation(job.id, idea.id, 'ignored'))}>忽略</button>}
    </div>
    {['互补', '可迁移方法'].includes(kind) && decision !== 'ignored' && <>
      {!draft && <button type="button" className="quiet icon-label" disabled={generating} onClick={() => void run(async () => {
        setGenerating(true);
        try { setDraft(await api.draftCombination(job.id, idea.id)); } finally { setGenerating(false); }
      })}><Icon name="stars" />{generating ? '正在生成组合草稿…' : '生成组合草稿'}</button>}
      {draft && <label>组合草稿<textarea value={draft} maxLength={2400} rows={4} onChange={event => setDraft(event.target.value)} /></label>}
      {draft && <button className="primary icon-label" disabled={!draft.trim() || generating}
        onClick={() => void run(() => api.combineResearchIdeas(job.id, idea.id, draft))}>
        <Icon name="compose" />保存为新 Idea
      </button>}
    </>}
  </details>;
}

export function useIdeaRelations() {
  const [relations, setRelations] = useState([]);
  useEffect(() => {
    let live = true;
    let sequence = 0;
    const load = async () => {
      const current = ++sequence;
      const rows = await api.listIdeaRelations();
      if (live && current === sequence) setRelations(rows);
    };
    const refresh = () => void load().catch(() => {});
    const off = api.onResearchWorkChanged(refresh);
    refresh();
    return () => { live = false; off(); };
  }, []);
  return relations;
}

function Synthesis({ job, ideas, relations, openIdea, run }) {
  const result = job.progress.result;
  const { summary, connections, memory } = result;
  return <>
    <dl className="work-summary">
      {summary.hypothesis && <div><dt>研究假设</dt><dd>{summary.hypothesis}</dd></div>}
      {summary.confirmed.length > 0 && <div><dt>已确认</dt><dd>{summary.confirmed.join('；')}</dd></div>}
      {summary.open.length > 0 && <div><dt>待解决</dt><dd>{summary.open.join('；')}</dd></div>}
      {summary.next && <div><dt>下一步</dt><dd>{summary.next}</dd></div>}
    </dl>
    {connections.map(connection => {
      const other = ideas.find(row => row.id === connection.id);
      const [first, second] = [job.idea_id, connection.id].sort();
      const decision = relations.find(row => row.first_id === first && row.second_id === second && row.kind === (connection.kind || '互补'))?.status;
      return other && <Connection key={connection.id} job={job} connection={connection} decision={decision} idea={other} openIdea={openIdea} run={run} />;
    })}
    {memory && <div className="work-memory">
      <h4><Icon name="memory" />Memory 更新建议</h4>
      <p>{memory.text}</p>
      <p className="muted">{memory.reason}</p>
      {memory.decision ? <small className="mini-tag">{memory.decision === 'accept' ? '已写入 Memory' : '已略过'}</small> : <div className="inline-actions">
        <button className="quiet" onClick={() => void run(() => api.decideResearchMemory(job.id, 'reject'))}>略过</button>
        <button className="primary" onClick={() => void run(() => api.decideResearchMemory(job.id, 'accept'))}>加入 Memory</button>
      </div>}
    </div>}
  </>;
}

export function ResearchPanel({ idea, ideas, openIdea, openPaper, useRevision, entries = [], targetJob = '' }) {
  const { jobs, error: loadError } = useResearchJobs(idea.id);
  const relations = useIdeaRelations();
  const [error, setError] = useState('');
  const [files, setFiles] = useState(null);
  const [focus, setFocus] = useState('');
  const [focusJob, setFocusJob] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [showHypothesis, setShowHypothesis] = useState(false);
  const [busy, setBusy] = useState(false);
  const [startedJob, setStartedJob] = useState('');
  const panel = useRef(null);
  const visibleJob = startedJob || targetJob;
  const targetExists = jobs.some(job => job.id === visibleJob);

  useEffect(() => {
    if (!visibleJob || !targetExists) return;
    const card = panel.current?.querySelector('[data-job-id="' + CSS.escape(visibleJob) + '"]');
    if (!card || document.activeElement === card) return;
    const history = card.closest('.work-history');
    if (history) history.open = true;
    card.focus({ preventScroll: true });
    card.scrollIntoView({ block: 'nearest' });
  }, [visibleJob, targetExists]);

  async function run(action) {
    if (busy) return;
    setBusy(true);
    setError('');
    try { await action(); }
    catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }

  const current = currentJobs(jobs);
  const previous = jobs.filter(job => (job.progress.result || job.id === visibleJob) && !current.includes(job));
  const sources = (idea.origins || []).map(id => ideas.find(row => row.id === id)).filter(Boolean);
  const currentInitial = current.find(job => job.kind === 'initial');
  const selectedFor = (job, question) => { setFocusJob(job.id); setFocus(question); };

  const renderJob = (job, history = false) => {
    const report = job.progress.result;
    const selectable = !history && job.kind === 'initial' && ['waiting', 'ready'].includes(job.status) && report;
    const running = ['running', 'queued'].includes(job.status);

    return <article className="work-job" key={job.id} data-job-id={job.id} tabIndex={-1}>
      <header className="work-job-head">
        <h3>{kinds[job.kind]}</h3>
        <span className="status-pill" data-status={job.status}>{jobStage(job)}</span>
        <span className="muted">{entries.find(entry => entry.id === job.provider)?.label || job.provider}</span>
        {job.mandate && <span className="mini-tag">{mandateLabel(job.mandate)}</span>}
        {running && <button className="quiet" disabled={busy} onClick={() => void run(() => api.setResearchWorkState(job.id, 'pause'))}>暂停</button>}
        <ResearchTaskDelete job={job} title={kinds[job.kind] + ' · ' + (job.question || ideaTitle(idea))} disabled={busy}
          onDeleted={() => panel.current?.querySelector('.library-actions button')?.focus({ preventScroll: true })} />
      </header>
      {job.policyNotice && <p className="muted work-policy-notice" role="status">{policyNoticeText(job.policyNotice)}</p>}
      {job.canRetry && <RetryAgent entries={entries} provider={job.provider} disabled={busy}
        run={provider => run(() => api.setResearchWorkState(job.id, 'resume', provider))} />}
      {job.question && <p className="muted">问题：{job.question}</p>}
      {running && <p className="active-thinking-bar" role="status">{stages[job.progress.stage] || '正在等待执行'}</p>}
      {!report && job.progress.paperCount !== null && job.progress.paperCount !== undefined &&
        <p className="muted">已保存 {job.progress.paperCount} 篇检索结果</p>}
      {job.error && <p className="error" role="alert">{job.error}</p>}
      {report && (job.kind === 'synthesis'
        ? <Synthesis job={job} ideas={ideas} relations={relations} openIdea={openIdea} run={run} />
        : <Findings report={report} job={job} openPaper={openPaper} useRevision={useRevision} run={run} />)}

      {selectable && <form className="work-followup" onSubmit={event => {
        event.preventDefault();
        void run(async () => setStartedJob(await api.startResearchWork(idea.id, 'deep', focus, job.id)));
      }}>
        {report.questions.length > 0 && <h4>选择深入查证的具体问题</h4>}
        {report.questions.map(question => <button type="button" className="quiet followup-option" key={question} disabled={busy}
          onClick={() => void run(async () => setStartedJob(await api.startResearchWork(idea.id, 'deep', question, job.id)))}>
          <span>{question}</span><small>开始深查 <Icon name="forward" /></small>
        </button>)}
        <div className="followup-custom">
          <label className="visually-hidden" htmlFor={'work-focus-' + job.id}>自定义查证问题</label>
          <input id={'work-focus-' + job.id} maxLength={300} placeholder="或输入自定义查证问题…" value={focusJob === job.id ? focus : ''}
            onChange={event => selectedFor(job, event.target.value)} />
          <button className="primary" disabled={busy || focusJob !== job.id || !focus.trim()}>开始深查</button>
        </div>
      </form>}
    </article>;
  };

  return <section className="library-section research-work" ref={panel}>
    <header className="library-actions research-work-toolbar">
      <h2>研究工作</h2>
      <div className="inline-actions">
        <button className="quiet icon-label" disabled={busy || ['queued', 'running'].includes(currentInitial?.status)}
          onClick={() => void run(async () => setStartedJob(await api.startResearchWork(idea.id, 'initial')))}>
          <Icon name="search" />查论文
        </button>
        <button className="quiet icon-label" type="button" aria-expanded={showHypothesis} aria-controls="direct-hypothesis"
          onClick={() => setShowHypothesis(value => !value)}>
          <Icon name="shield" />查证假设
        </button>
        <button className="quiet icon-label" disabled={busy || current.some(job => job.kind === 'synthesis' && ['running', 'queued'].includes(job.status))}
          onClick={() => void run(async () => setStartedJob(await api.startResearchWork(idea.id, 'synthesis')))}>
          <Icon name="stars" />整理与关联
        </button>
        <button className="quiet icon-label" disabled={busy} onClick={() => void run(async () => {
          const result = await api.exportMemo(idea.id);
          if (result) setFiles(result);
        })}>
          <Icon name="import" />导出备忘录
        </button>
      </div>
    </header>

    {showHypothesis && <form id="direct-hypothesis" className="work-followup hypothesis-drawer" onSubmit={event => {
      event.preventDefault();
      void run(async () => {
        setStartedJob(await api.startResearchWork(idea.id, 'deep', hypothesis));
        setHypothesis('');
        setShowHypothesis(false);
      });
    }}>
      <label htmlFor="direct-hypothesis-input">你想用学术文献核实哪条具体假设？</label>
      <div className="followup-custom">
        <input id="direct-hypothesis-input" value={hypothesis} maxLength={300}
          onChange={event => setHypothesis(event.target.value)} placeholder="写出假设或待核实命题…" />
        <button className="primary" disabled={busy || !hypothesis.trim()}>启动深查</button>
      </div>
    </form>}

    {sources.length > 0 && <div className="inline-actions origin-ideas-bar">
      <strong>组合来源：</strong>
      {sources.map(row => <button key={row.id} className="quiet mini-tag" onClick={() => openIdea(row.id)}>{ideaTitle(row)}</button>)}
    </div>}

    {(error || loadError) && <p className="error" role="alert">{error || loadError}</p>}
    {files && <p className="memo-export" role="status">已导出 Markdown 与 BibTeX<br />{files.markdown}<br />{files.bibtex}</p>}

    {!jobs.length && !loadError && <div className="workbench-empty-card">
      <Icon name="search" />
      <strong>尚未发起文献查证</strong>
      <p>点击上方「查论文」检索公开与本地文献，或点「查证假设」直接定向深查。</p>
    </div>}

    {current.map(job => renderJob(job))}
    {previous.length > 0 && <details className="work-history"><summary>查看历史查证版本（{previous.length}）</summary>{previous.map(job => renderJob(job, true))}</details>}
  </section>;
}
