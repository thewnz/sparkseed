import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { IdeaInspector, IdeaStarMap } from './idea-star-map.jsx';
import { StarPreferences } from './star-preferences.jsx';
import { buildIdeaMap, ideaUsability, sortIdeasByUsability } from './idea-map.mjs';
import { formatIdeaMarkdown, ideaDates, ideaDisplayStatus, ideaPreview, ideaTitle } from './idea-text.mjs';
import { ResearchPanel, useIdeaRelations } from './research-work.jsx';
import { IdeaRecordActions } from './idea-record-actions.jsx';

const usabilityLabels = ['仅有线索', '方向待明确', '可开始查证', '推进路径较清楚', '可直接推进'];

function ScorePips({ label, value }) {
  const numeric = Number(value) || 0;
  return <span className="score-pip-group" title={`${label}：${numeric ? numeric + ' / 5' : '未评分'}`}>
    <small>{label}</small>
    <span className="score-pips" aria-hidden="true">
      {[1, 2, 3, 4, 5].map(step => <i key={step} data-lit={step <= numeric || undefined} />)}
    </span>
  </span>;
}

function IdeaCard({ idea, open, openDiscussion, previewed }) {
  const intro = ideaPreview(idea);
  const usability = ideaUsability(idea);
  const state = ideaDisplayStatus(idea);
  const scores = [usability, idea.importance, idea.research_value].filter(v => Number.isFinite(Number(v)) && Number(v) > 0).map(Number);
  const avgScore = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '';

  return <article className="library-card bento-idea-card" data-idea-id={idea.id} data-previewed={previewed || undefined}>
    <button type="button" className="library-card-open" aria-label={ideaTitle(idea)} aria-expanded={previewed}
      aria-controls={previewed ? 'idea-card-inspector' : undefined} onClick={open}>
      <span className="library-card-top">
        <span className="library-card-badges">
          {idea.pinned_at && <span className="mini-tag"><Icon name="pin" />置顶</span>}
          {idea.analysis && <span className="mini-tag accent">已整理</span>}
          {avgScore && <span className="mini-tag">均分 {avgScore}</span>}
        </span>
        <span className="library-card-status status-pill" data-status={state.key}>
          {state.label}
        </span>
      </span>

      <strong className="library-card-heading">{ideaTitle(idea)}</strong>
      {intro && <span className="library-card-intro">{intro}</span>}

      {idea.paper && <span className="library-card-paper">
        <Icon name="book" /><span>{idea.paper}</span>
      </span>}

      <span className="library-card-scores">
        <ScorePips label="可用" value={usability} />
        <ScorePips label="重要" value={idea.importance} />
        <ScorePips label="价值" value={idea.research_value} />
      </span>

      <time className="library-card-meta" dateTime={idea.created}>{ideaDates.format(new Date(idea.created))}</time>
    </button>

    <footer className="library-card-footer">
      <RatingField idea={idea} field="usability" label="可用度" value={usability} compact />
      <div className="library-card-actions">
        <button type="button" className="quiet card-discuss-btn icon-label" title="进入对话"
          onClick={() => openDiscussion(idea.id)}>
          <Icon name="discussion" />对话
        </button>
        <IdeaRecordActions idea={idea} />
      </div>
    </footer>
  </article>;
}

function CardInspector({ idea, ideas, choose, close, open, openDiscussion }) {
  const graph = useMemo(() => buildIdeaMap(ideas), [ideas]);
  const rows = useMemo(() => new Map(ideas.map(row => [row.id, row])), [ideas]);
  const relations = useIdeaRelations();
  const confirmed = relations.flatMap(row => {
    if (row.status !== 'confirmed') return [];
    const other = rows.get(row.first_id === idea.id ? row.second_id : row.second_id === idea.id ? row.first_id : '');
    return other ? [{ ...row, idea: other }] : [];
  });
  return <IdeaInspector id="idea-card-inspector" idea={idea}
    related={(graph.neighbors.get(idea.id) || []).map(item => rows.get(item.id)).filter(Boolean)}
    confirmed={confirmed} choose={choose} close={close} open={open} openDiscussion={openDiscussion} />;
}

function RatingField({ idea, field, label, value, compact = false }) {
  const [error, setError] = useState('');
  const [optimistic, setOptimistic] = useState(null);
  const control = useRef(null);
  const restoreFocus = useRef(false);
  const latest = useRef(0);
  const saved = String(value ?? '');
  const activeValue = optimistic ?? saved;

  useLayoutEffect(() => {
    if (optimistic === null || optimistic !== saved) return;
    if (restoreFocus.current && document.activeElement === document.body) control.current?.focus();
    restoreFocus.current = false;
    setOptimistic(null);
  }, [optimistic, saved]);

  async function rate(input) {
    const request = ++latest.current;
    restoreFocus.current = document.activeElement === control.current;
    setOptimistic(input);
    setError('');
    try { await window.recorder.rateIdea(idea.id, field, input ? Number(input) : null); }
    catch (err) {
      if (request !== latest.current) return;
      restoreFocus.current = false;
      setOptimistic(null);
      setError(err.message.replace(/^Error invoking remote method '[^']+': Error: /, ''));
    }
  }

  return <div className={compact ? 'idea-score-field compact' : 'idea-score-field studio-score-card'}>
    <label>
      <span className="score-field-label">{label}</span>
      <select ref={control} aria-label={label + ' · ' + ideaTitle(idea)} value={activeValue}
        onBlur={event => { if (event.relatedTarget) restoreFocus.current = false; }}
        onChange={event => void rate(event.target.value)}>
        <option value="">未评分</option>
        {[1, 2, 3, 4, 5].map(score => <option key={score} value={score}>
          {score} 分{field === 'usability' ? ' · ' + usabilityLabels[score - 1] : ''}
        </option>)}
      </select>
    </label>
    {!compact && <div className="score-quick-bar" role="group" aria-label={label + '快速点选'}>
      {[1, 2, 3, 4, 5].map(score => <button key={score} type="button" className="score-step-btn"
        data-active={Number(activeValue) >= score || undefined}
        aria-pressed={Number(activeValue) === score}
        onClick={() => void rate(Number(activeValue) === score ? '' : String(score))}>
        {score}
      </button>)}
    </div>}
    {error && <p role="alert" className="error">{error}</p>}
  </div>;
}

function IdeaRatings({ idea }) {
  const options = [
    ['usability', '可用程度', ideaUsability(idea)],
    ['importance', '重要性', idea.importance],
    ['researchValue', '研究价值', idea.research_value],
  ];
  return <section className="dossier-card idea-ratings">
    <header className="dossier-card-head">
      <h2><Icon name="star" />三维价值评估</h2>
      <span className="muted">评分决定星图亮度与优先排序</span>
    </header>
    <div className="idea-rating-fields">
      {options.map(([field, label, value]) => <RatingField key={field} idea={idea} field={field} label={label} value={value} />)}
    </div>
  </section>;
}

function DiscussionSummary({ idea, connected }) {
  const summary = idea.analysis;
  const running = ['queued', 'running'].includes(idea.synthesisStatus);
  const state = running ? (summary ? '正在根据新讨论更新提炼…' : '正在提炼标题和结构化摘要…') :
    idea.synthesisStatus === 'failed' ? '整理失败，可在右侧研究工作中重试。' :
      idea.synthesisStatus === 'paused' ? '整理已暂停，可在右侧研究工作中继续。' :
        !summary ? connected ? '等待 AI 自动跨轮提炼，也可点击右侧「整理与关联」。' : '接入 Agent 后可自动提炼跨轮研究摘要。' : '';

  return <section className="dossier-card detail-summary">
    <header className="dossier-card-head">
      <h2><Icon name="soul" />AI 跨轮思辨提炼</h2>
      {running && <span className="status-pill" data-status="running">提炼中</span>}
    </header>
    {state && <p className="muted" role="status">{state}</p>}
    {summary && <div className="synthesis-bento-grid">
      {(summary.abstract || summary.hypothesis) && <div className="synthesis-quadrant lead">
        <h3>核心假设与摘要</h3>
        <p className="summary-lead">{summary.abstract || summary.hypothesis}</p>
      </div>}
      {!!summary.confirmed?.length && <div className="synthesis-quadrant confirmed">
        <h3>已确认共识</h3>
        <ul>{summary.confirmed.map(item => <li key={item}>{item}</li>)}</ul>
      </div>}
      {!!summary.open?.length && <div className="synthesis-quadrant open">
        <h3>待查证问题</h3>
        <ul>{summary.open.map(item => <li key={item}>{item}</li>)}</ul>
      </div>}
      {summary.next && <div className="synthesis-quadrant next">
        <h3>下一步推进</h3>
        <p>{summary.next}</p>
      </div>}
    </div>}
  </section>;
}

export function IdeaLibrary({
  ideas,
  selected,
  select,
  openDiscussion,
  openPaper,
  newIdea,
  createSkill,
  view,
  changeView,
  entries,
  provider,
  starView,
  setStarView,
  starOptions,
  changeStarOptions,
  starRenderInfo,
  reducedStarMotion,
}) {
  const [viewError, setViewError] = useState('');
  const [starSettingsOpen, setStarSettingsOpen] = useState(false);
  const [cardPreview, setCardPreview] = useState('');
  const [layoutMode, setLayoutMode] = useState('grid'); // 'grid' | 'compact' inside 'cards' view
  const [quickFilter, setQuickFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('usability');
  const [copiedDossier, setCopiedDossier] = useState(false);

  const stats = useMemo(() => ({
    total: ideas.length,
    highPotential: ideas.filter(item => (ideaUsability(item) || 0) >= 4).length,
    pinned: ideas.filter(item => item.pinned_at).length,
    synthesized: ideas.filter(item => item.analysis).length,
  }), [ideas]);

  const cardIdeas = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    const matching = ideas.filter(item => {
      if (quickFilter === 'pinned' && !item.pinned_at) return false;
      if (quickFilter === 'high' && (ideaUsability(item) || 0) < 4) return false;
      if (quickFilter === 'waiting' && !(item.discussion?.at(-1)?.question && !item.discussion.at(-1)?.answer)) return false;
      if (quickFilter === 'synthesized' && !item.analysis) return false;
      if (!term) return true;
      return [ideaTitle(item), ideaPreview(item), item.body, item.paper]
        .filter(Boolean).join(' ').toLocaleLowerCase().includes(term);
    });
    if (sort === 'recent') return [...matching].sort((a, b) => new Date(b.created) - new Date(a.created));
    if (sort === 'researchValue') return [...matching].sort((a, b) => (b.research_value || 0) - (a.research_value || 0));
    if (sort === 'importance') return [...matching].sort((a, b) => (b.importance || 0) - (a.importance || 0));
    return sortIdeasByUsability(matching);
  }, [ideas, query, sort, quickFilter]);

  const cardTrigger = useRef(null);
  const idea = ideas.find(item => item.id === selected);
  const previewIdea = view === 'cards' && ideas.find(item => item.id === cardPreview);
  const connected = Boolean(provider);

  function closeCardPreview() {
    setCardPreview('');
    cardTrigger.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    if (selected) void window.recorder.organizeIdea(selected).catch(() => {});
  }, [selected]);

  if (idea) {
    const state = ideaDisplayStatus(idea);
    return <article className="library-page library-detail dossier-shell" key={idea.id}>
      <header className="dossier-topbar">
        <button className="quiet icon-label" onClick={() => select('')}><Icon name="back" />返回灵感库</button>
        <div className="inline-actions">
          <button type="button" className="quiet icon-label" onClick={async () => {
            try {
              await navigator.clipboard.writeText(formatIdeaMarkdown(idea));
              setCopiedDossier(true);
              setTimeout(() => setCopiedDossier(false), 1500);
            } catch { /* ignore */ }
          }}>
            <Icon name={copiedDossier ? 'check' : 'copy'} />{copiedDossier ? '已复制' : '复制档案'}
          </button>
          <IdeaRecordActions idea={idea} />
          {idea.discussion.some(turn => turn.message || (turn.answer && !turn.answer.skipped)) &&
            <button className="quiet icon-label" onClick={() => createSkill(idea)}><Icon name="skill" />提炼为技能</button>}
          <button className="primary icon-label" onClick={() => openDiscussion(idea.id)}>
            <Icon name="discussion" />进入对话
          </button>
        </div>
      </header>

      <div className="dossier-hero-card">
        <div className="dossier-hero-meta">
          <span className="status-pill" data-status={state.key}>{state.label}</span>
          <time dateTime={idea.created}>{ideaDates.format(new Date(idea.created))}</time>
          {!idea.analysis?.title && <span className="muted provisional-title">原始标题</span>}
          {idea.paper && <span className="mini-tag"><Icon name="book" />{idea.paper}</span>}
        </div>
        <h1>{ideaTitle(idea)}</h1>
      </div>

      <div className="dossier-split-grid">
        <div className="dossier-left-col">
          <DiscussionSummary idea={idea} connected={connected} />
          <IdeaRatings key={idea.id} idea={idea} />
          {idea.discussion?.length > 0 && <details className="dossier-card detail-original">
            <summary><Icon name="discussion" />讨论过程回看（{idea.discussion.length} 轮）</summary>
            <div className="detail-original-body dossier-thread-replay">
              {idea.discussion.map((turn, idx) => 'message' in turn
                ? <div key={idx} className="dossier-turn-row">
                    <strong>补充 ({idx + 1})</strong>
                    <p>{turn.message}</p>
                  </div>
                : <div key={idx} className="dossier-turn-row">
                    <strong>追问 ({idx + 1})：{turn.question}</strong>
                    <p className="muted">
                      {turn.answer
                        ? turn.answer.skipped ? '（已跳过）' : [...(turn.answer.options || []), turn.answer.note].filter(Boolean).join('；')
                        : '（待回答）'}
                    </p>
                  </div>)}
            </div>
          </details>}
          <details className="dossier-card detail-original" open={!idea.analysis}>
            <summary><Icon name="quote" />查看原始记录与引文</summary>
            <div className="detail-original-body">
              {idea.body && <p className="body-text">{idea.body}</p>}
              {(idea.paper || idea.page) && <p className="source">
                {[idea.paper, idea.page && '第 ' + idea.page + ' 页'].filter(Boolean).join(' · ')}
              </p>}
              {idea.excerpt && <blockquote>{idea.excerpt}</blockquote>}
            </div>
          </details>
        </div>

        <div className="dossier-right-col">
          <div className="dossier-card dossier-research-wrap">
            <ResearchPanel key={idea.id} idea={idea} ideas={ideas} entries={entries} openIdea={select} openPaper={openPaper} />
          </div>
        </div>
      </div>
    </article>;
  }

  return <section className={view === 'stars' ? 'library-page cosmic-library star-library' : 'library-page card-library'} key="library"
    onKeyDown={event => {
      if (previewIdea && !starSettingsOpen && event.key === 'Escape') { event.stopPropagation(); closeCardPreview(); }
    }}>
    <header className="library-actions library-toolbar">
      {view === 'stars' ? <div className="star-hud-brand">
        <Icon name="constellation" />
        <h1>关联星图</h1>
      </div> : <div className="page-heading">
        <div>
          <div className="academic-heading-row">
            <h1>灵感库</h1>
            {ideas.length > 0 && <span className="academic-progress-pill">
              共 {stats.total} 条 · 高潜 {stats.highPotential} · 置顶 {stats.pinned}
            </span>}
          </div>
          <p>按可用度、重要性和研究价值评估想法，切换画廊、清单或关联星图</p>
        </div>
      </div>}

      <div className="inline-actions">
        <div className="library-views segmented-pills" role="group" aria-label="灵感库视图">
          <button className="quiet icon-label" type="button"
            aria-pressed={view === 'cards' && layoutMode === 'grid'}
            onClick={async () => {
              setViewError('');
              setStarSettingsOpen(false);
              setLayoutMode('grid');
              if (view !== 'cards') {
                setStarView(previous => ({ ...previous, selectedId: '' }));
                try { await changeView('cards'); } catch { setViewError('保存视图偏好失败，请重试。'); }
              }
            }}><Icon name="grid" />画廊</button>
          <button className="quiet icon-label" type="button"
            aria-pressed={view === 'cards' && layoutMode === 'compact'}
            onClick={async () => {
              setViewError('');
              setStarSettingsOpen(false);
              setLayoutMode('compact');
              if (view !== 'cards') {
                setStarView(previous => ({ ...previous, selectedId: '' }));
                try { await changeView('cards'); } catch { setViewError('保存视图偏好失败，请重试。'); }
              }
            }}><Icon name="list" />清单</button>
          <button className="quiet icon-label" type="button"
            aria-pressed={view === 'stars'}
            onClick={async () => {
              setViewError('');
              setCardPreview('');
              setStarSettingsOpen(false);
              setStarView(previous => ({ ...previous, selectedId: '' }));
              try { await changeView('stars'); } catch { setViewError('保存视图偏好失败，请重试。'); }
            }}><Icon name="constellation" />星图</button>
        </div>
        {view === 'stars' && <button type="button" className="quiet icon-label star-settings-toggle"
          title="星图渲染偏好" aria-label="星图偏好" aria-haspopup="dialog"
          onClick={() => setStarSettingsOpen(true)}><Icon name="sliders" />星图设置</button>}
        <button className="primary icon-label" onClick={newIdea}><Icon name="compose" />新对话</button>
      </div>
    </header>

    {viewError && <p role="alert" className="error">{viewError}</p>}

    {view === 'cards' && ideas.length > 0 && <div className="library-findbar">
      <label className="library-search search-input-box">
        <Icon name="search" />
        <span className="visually-hidden">搜索灵感</span>
        <input type="search" value={query} onChange={event => { setQuery(event.target.value); setCardPreview(''); }}
          placeholder="搜索想法标题、正文或关联论文…" />
      </label>

      <div className="chip-filter-bar" role="group" aria-label="快速筛选">
        {[
          ['all', '全部'],
          ['high', `高潜 ${stats.highPotential}`],
          ['pinned', `置顶 ${stats.pinned}`],
          ['waiting', '待答'],
          ['synthesized', `已整理 ${stats.synthesized}`],
        ].map(([id, label]) => <button key={id} type="button" className="filter-pill"
          aria-pressed={quickFilter === id} onClick={() => setQuickFilter(id)}>{label}</button>)}
      </div>

      <span className="library-result-count" role="status">
        {(query.trim() || quickFilter !== 'all') ? cardIdeas.length + ' / ' : ''}{ideas.length} 条
      </span>

      <label className="library-sort">
        <span className="visually-hidden">排列方式</span>
        <select value={sort} onChange={event => setSort(event.target.value)}>
          <option value="usability">按可用程度排序</option>
          <option value="researchValue">按研究价值排序</option>
          <option value="importance">按重要性排序</option>
          <option value="recent">按最新记录排序</option>
        </select>
      </label>
    </div>}

    {view === 'stars'
      ? <IdeaStarMap ideas={ideas} openIdea={select} openDiscussion={openDiscussion} view={starView} setView={setStarView}
          preferences={starOptions} changePreferences={changeStarOptions} reducedMotion={reducedStarMotion} />
      : ideas.length ? <div className="library-master-detail" data-inspector={Boolean(previewIdea) || undefined}>
          <div className="library-main-stage">
            {cardIdeas.length ? (layoutMode === 'grid'
              ? <div className="library-grid">
                  {cardIdeas.map(item => <IdeaCard key={item.id} idea={item}
                    previewed={cardPreview === item.id}
                    openDiscussion={openDiscussion}
                    open={event => {
                      cardTrigger.current = event.currentTarget;
                      setCardPreview(current => current === item.id ? '' : item.id);
                    }} />)}
                </div>
              : <div className="library-compact-table">
                  {cardIdeas.map(item => <div key={item.id} className="compact-idea-row" data-previewed={cardPreview === item.id || undefined}>
                    <button type="button" className="compact-idea-main" onClick={() => setCardPreview(current => current === item.id ? '' : item.id)}>
                      <span className="session-status-dot" data-status={item.status} />
                      <strong>{ideaTitle(item)}</strong>
                      {item.paper && <span className="mini-tag">{item.paper}</span>}
                    </button>
                    <ScorePips label="可用" value={ideaUsability(item)} />
                    <time className="muted" dateTime={item.created}>{ideaDates.format(new Date(item.created))}</time>
                    <div className="inline-actions">
                      <button type="button" className="quiet" onClick={() => select(item.id)}>档案</button>
                      <button type="button" className="quiet" onClick={() => openDiscussion(item.id)}>思辨</button>
                      <IdeaRecordActions idea={item} />
                    </div>
                  </div>)}
                </div>)
              : <div className="library-no-results page-empty-state">
                  <Icon name="search" />
                  <h2>没有找到匹配的灵感</h2>
                  <p>试试更短的关键词，或重置当前筛选条件。</p>
                  <button type="button" onClick={() => { setQuery(''); setQuickFilter('all'); }}>重置筛选与搜索</button>
                </div>}
          </div>

          {previewIdea && <CardInspector idea={previewIdea} ideas={ideas} choose={setCardPreview}
            close={closeCardPreview} openDiscussion={openDiscussion}
            open={id => { setCardPreview(''); select(id); }} />}
        </div>
      : <div className="page-empty-state">
          <Icon name="stars" />
          <h2>你的研究星系尚未点亮</h2>
          <p className="muted">记录第一条研究想法后，它会在这里沉淀为卡片，并在全幅星图中化作星辰。</p>
          <button type="button" className="primary icon-label" onClick={newIdea}><Icon name="compose" />开启第一条思辨</button>
        </div>}

    {view === 'stars' && starSettingsOpen && <StarPreferences value={starOptions} onChange={changeStarOptions}
      close={() => setStarSettingsOpen(false)} info={starRenderInfo} reducedMotion={reducedStarMotion} />}
  </section>;
}
