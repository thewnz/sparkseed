import { useEffect, useId, useRef, useState } from 'react';
import { researchLimits } from '../desktop/research-limits.mjs';
import { memoryKindLabels } from '../desktop/memory-summary.mjs';
import { Icon } from './icons.jsx';

const api = window.recorder;
const modules = {
  soul: {
    title: 'Soul', label: 'Agent 行为准则', icon: 'soul',
    description: '定义 Agent 如何提问、回应和处理证据。',
    guidance: '适合写入交流语言、追问节奏、证据标准和长期工作范围。',
    placeholder: '例如：每轮只问一个问题，先区分已知事实与待查证假设。',
  },
  memory: {
    title: 'Memory', label: '长期研究背景', icon: 'memory',
    description: '记录希望 Agent 在不同讨论中记住的研究背景。',
    guidance: '可按「研究问题」「常用方法」「长期约束」组织。单次讨论里的猜测可以留在原讨论中。',
    placeholder: '例如：研究问题、常用数据与方法，以及长期限制。',
  },
};
const dateTime = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
const formatDate = date => date ? dateTime.format(new Date(date)) : '初始内容';
const errorText = error => error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');
const directionQuestions = [
  ['目前的研究重点', ['模型与算法', '数据与采样', '评估与可靠性', '系统与效率']],
  ['当前最需要弄清楚的事', ['最相近的工作', '方法的适用条件', '已有反例与局限', '可复用的方法']],
  ['长期约束', ['优先使用公开材料', '优先能核对的原文', '区分摘要证据和正文证据', '聚焦当前研究方向']],
];

function DirectionBuilder({ apply, close }) {
  const inputPrefix = useId();
  const [answers, setAnswers] = useState({});
  const [custom, setCustom] = useState({});
  const [note, setNote] = useState('');
  const groups = directionQuestions.map(([label]) => {
    const values = [...(answers[label] || []), custom[label]?.enabled && custom[label].text.trim()].filter(Boolean);
    return values.length ? label + '\n' + values.join('、') : '';
  });
  const hasAnswer = groups.some(Boolean) || note.trim();
  return <section className="work-job direction-builder">
    <header><h3>用选择题建立研究方向</h3><button type="button" className="quiet" onClick={close}>收起</button></header>
    {directionQuestions.map(([label, options], index) => <fieldset key={label}>
      <legend>{label}</legend>
      {options.map(option => <label className="choice" key={option}>
        <input type="checkbox" checked={Boolean(answers[label]?.includes(option))} onChange={event => {
          const group = answers[label] || [];
          setAnswers({ ...answers, [label]: event.target.checked ? [...group, option] : group.filter(value => value !== option) });
        }} />{option}
      </label>)}
      <label className="choice"><input type="checkbox" checked={Boolean(custom[label]?.enabled)} onChange={event => {
        const enabled = event.target.checked;
        setCustom(previous => ({ ...previous, [label]: { text: '', ...previous[label], enabled } }));
        if (enabled) requestAnimationFrame(() => document.getElementById(inputPrefix + index)?.focus());
      }} />自己补充</label>
      {custom[label]?.enabled && <label className="custom-choice-answer">补充「{label}」
        <textarea id={inputPrefix + index} rows={2} maxLength={250} value={custom[label].text}
          onChange={event => {
            const text = event.target.value;
            setCustom(previous => ({ ...previous, [label]: { ...previous[label], text } }));
          }} />
      </label>}
    </fieldset>)}
    <label>补充具体题目或领域<textarea rows={2} maxLength={500} value={note} onChange={event => setNote(event.target.value)} /></label>
    <button type="button" disabled={!hasAnswer} onClick={() => apply([
      ...groups,
      note.trim() ? '具体研究方向\n' + note.trim() : '',
    ].filter(Boolean).join('\n\n'))}>整理到 Memory 草稿</button>
  </section>;
}

function EditWarning({ module, cancel, proceed }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => { if (element.open) element.close(); };
  }, []);
  function close(next) {
    dialog.current.close();
    next();
  }
  return <dialog ref={dialog} className="research-warning" aria-labelledby="edit-warning-title" aria-describedby="edit-warning-copy"
    onCancel={event => { event.preventDefault(); close(cancel); }}>
    <span className="research-symbol"><Icon name="notice" /></span>
    <h2 id="edit-warning-title">编辑 {module.title} 前，请先确认</h2>
    <p id="edit-warning-copy">请谨慎修改。{module.title === 'Memory' ? '相关记忆' : '保存的准则'}会随讨论请求发送给你选择的 Agent。请勿填写密钥或不便分享的研究材料。</p>
    <div className="actions">
      <button type="button" onClick={() => close(cancel)}>取消</button>
      <button type="button" className="primary" onClick={() => close(proceed)}>继续编辑</button>
    </div>
  </dialog>;
}

function MemoryEntries({ openIdea }) {
  const [editing, setEditing] = useState(null);
  const [entries, setEntries] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const reload = () => api.listMemoryEntries().then(rows => { if (live) setEntries(rows); },
      error => { if (live) setError(errorText(error)); });
    void reload();
    const stop = api.onResearchWorkChanged(reload);
    const stopMemory = api.onMemoryChanged(reload);
    return () => { live = false; stop(); stopMemory(); };
  }, []);
  async function change(id, action, value = text) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      setEntries(await api.changeMemoryEntry(id, action, value));
      if (action === 'add') setText('');
      if (action === 'edit') setEditing(null);
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  async function consolidatePreview() {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try { setPreview(await api.previewMemoryConsolidation()); }
    catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  async function applyConsolidation() {
    if (busy || !preview) return;
    setBusy(true);
    setError('');
    try {
      setEntries(await api.applyMemoryConsolidation(preview.groups));
      setPreview(null);
      setNotice('已合并记忆并更新 Memory。可继续编辑或撤回。');
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  async function pin(entry) {
    if (busy) return;
    setBusy(true);
    setError('');
    try { setEntries(await api.pinMemory(entry.id, !entry.pinned)); }
    catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  return <section className="work-job memory-entries">
    <div className="preference-title"><h3>记忆条目</h3>
      <button className="quiet" disabled={busy || entries.filter(entry => entry.status === 'active').length < 3}
        onClick={() => void consolidatePreview()}>{busy ? '处理中…' : '整理记忆'}</button>
    </div>
    <p className="muted">后续任务只会选取和当前讨论有关的已启用条目。重复出现的记忆会增强，长期未用会缓慢衰减。</p>
    <p className="muted">在讨论中输入“请记住：长期信息”可直接写入记忆（限 1000 字符）；AI 推断的变化仍需你确认。</p>
    {preview && <section className="memory-consolidation" aria-label="记忆整理预览">
      <h4>{preview.before} 条 → {preview.after} 条</h4>
      {preview.groups.map((group, index) => <div key={index} className="memory-consolidation-row">
        <p>{group.text}</p><span className="muted">合并 {group.ids.length} 条</span></div>)}
      <div className="inline-actions">
        <button className="primary" disabled={busy} onClick={() => void applyConsolidation()}>应用整理</button>
        <button className="quiet" disabled={busy} onClick={() => setPreview(null)}>取消</button>
      </div>
    </section>}
    {notice && <p className="success" role="status">{notice}</p>}
    {entries.map(entry => <article key={entry.id} className="memory-entry">
      {editing?.id === entry.id ? <form onSubmit={event => { event.preventDefault(); void change(entry.id, 'edit', editing.text); }}>
        <label>修改记忆<textarea autoFocus rows={3} maxLength={1000} value={editing.text} onChange={event => setEditing({ ...editing, text: event.target.value })} /></label>
        <div className="inline-actions"><button disabled={busy || !editing.text.trim()}>保存修改</button>
          <button className="quiet" type="button" disabled={busy} onClick={() => setEditing(null)}>取消</button></div>
      </form> : <p>{entry.text}</p>}
      <div className="memory-strength-line">
        <span className="memory-strength" aria-label={'记忆强度 ' + Number(entry.strength || 1).toFixed(1)}>
          <i style={{ width: Math.min(100, (entry.strength || 1) / 2.5 * 100) + '%' }} /></span>
        <span className="muted">强度 {Number(entry.strength || 1).toFixed(1)} · 命中 {entry.hits || 1}{entry.pinned ? ' · 已置顶' : ''}</span>
      </div>
      <p className="muted">{entry.reason} · {formatDate(entry.created)}{entry.status === 'withdrawn' ? ' · 已撤回' : ''}</p>
      <div className="inline-actions">
        <button className="quiet" disabled={busy || Boolean(editing)} onClick={() => setEditing({ id: entry.id, text: entry.text })}>编辑</button>
        <button className="quiet" disabled={busy} aria-pressed={Boolean(entry.pinned)} onClick={() => void pin(entry)}>
          {entry.pinned ? '取消置顶' : '置顶'}</button>
        {entry.idea_id && <button className="quiet" onClick={() => openIdea(entry.idea_id)}>查看来源讨论</button>}
        <button className="quiet" disabled={busy} onClick={() => void change(entry.id, entry.status === 'active' ? 'withdrawn' : 'active')}>
          {entry.status === 'active' ? '撤回' : '恢复使用'}
        </button>
      </div>
    </article>)}
    <form onSubmit={event => { event.preventDefault(); void change('', 'add'); }}>
      <label>手动添加记忆<textarea rows={2} maxLength={1000} value={text} onChange={event => setText(event.target.value)} /></label>
      <button disabled={busy || !text.trim()}>确认添加</button>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}

function AgentSummaries({ openIdea }) {
  const [rows, setRows] = useState([]);
  const [auto, setAuto] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const load = () => {
      void api.listMemorySummaries().then(items => { if (live) setRows(items); },
        error => { if (live) setError(errorText(error)); });
      void api.getMemoryAuto().then(value => { if (live) setAuto(value); }, () => {});
    };
    load();
    const stop = api.onMemoryChanged(load);
    return () => { live = false; stop(); };
  }, []);
  async function decide(id, action) {
    if (busy) return;
    setBusy(id);
    setError('');
    try { await api.decideMemorySuggestion(id, action); }
    catch (error) { setError(errorText(error)); }
    finally { setBusy(''); }
  }
  async function toggle(value) {
    setAuto(value);
    setError('');
    try { await api.setMemoryAuto(value); }
    catch (error) { setError(errorText(error)); setAuto(!value); }
  }
  return <section className="work-job memory-entries">
    <div className="preference-title"><h3>Agent 总结</h3>
      <label className="choice"><input type="checkbox" checked={auto} onChange={event => void toggle(event.target.checked)} />
        自动生成记忆建议</label>
    </div>
    <p className="muted">讨论或研究任务完成后，Agent 会提炼长期有效的信息。建议经你确认后才会写入研究记忆。</p>
    {!rows.length && <p className="muted">还没有 Agent 总结。完成任务后会自动出现。</p>}
    {rows.map(item => <article className="memory-entry" key={item.id}>
      <span className="memory-suggestion-kind">{memoryKindLabels[item.kind] || item.kind}</span>
      <p>{item.text}</p>
      {item.status === 'pending' ? <div className="inline-actions">
        <button className="primary" disabled={Boolean(busy)} onClick={() => void decide(item.id, 'accept')}>
          {busy === item.id ? '正在处理…' : '采纳'}</button>
        <button className="quiet" disabled={Boolean(busy)} onClick={() => void decide(item.id, 'ignore')}>忽略</button>
        {item.idea_id && <button className="quiet" onClick={() => openIdea(item.idea_id)}>查看来源讨论</button>}
      </div> : <p className="muted">
        {item.status === 'accepted' ? '已采纳到研究记忆' : '已忽略'}
        {item.idea_id && <button className="quiet" onClick={() => openIdea(item.idea_id)}>查看来源讨论</button>}
      </p>}
      {item.evidence && <details><summary>查看依据</summary><blockquote>{item.evidence}</blockquote></details>}
    </article>)}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}

function LearnedProfile({ openIdea }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let live = true;
    const load = () => void api.listLearnedResearch().then(items => { if (live) setRows(items); }, () => {});
    const stop = api.onResearchWorkChanged(load);
    load();
    return () => { live = false; stop(); };
  }, []);
  return <section className="work-job memory-entries">
    <h3>研究画像建议</h3>
    <p className="muted">根据讨论提出研究习惯和方法熟悉度建议，确认后才用于后续提问。可在记忆条目中编辑或撤回。</p>
    {error && <p className="error" role="alert">{error}</p>}
    {!rows.length && <p className="muted">还没有足够的讨论依据。</p>}
    {rows.map(item => <article className="memory-entry" key={item.ideaId + item.kind + item.text}>
      <strong>{{ style: '研究习惯', familiar: '已熟悉的方法', learning: '正在探索的方法' }[item.kind]}</strong>
      <p>{item.text}</p>
      <button className="quiet" disabled={busy || item.approved} onClick={async () => {
        setBusy(true); setError('');
        try { await api.approveObservation(item.ideaId, item.text); }
        catch (error) { setError(errorText(error)); }
        finally { setBusy(false); }
      }}>{item.approved ? '已确认并启用' : '确认加入研究记忆'}</button>
      <details><summary>查看依据</summary><blockquote>{item.evidence}</blockquote>
        <button className="quiet" onClick={() => openIdea(item.ideaId)}>查看来源讨论</button>
      </details>
    </article>)}
  </section>;
}

export function ResearchProfileSettings({ drafts, setDrafts, openIdea }) {
  const [section, setSection] = useState('');
  const [pendingSection, setPendingSection] = useState('');
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [direction, setDirection] = useState(false);
  const cards = useRef({});
  const returnFocus = useRef('');
  const meta = modules[section];
  const document = profile?.[section];
  const draft = drafts[section];
  const limit = researchLimits[section];

  useEffect(() => {
    let active = true;
    api.getResearchProfile().then(value => { if (active) setProfile(value); },
      error => { if (active) setError(errorText(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!section && returnFocus.current) {
      cards.current[returnFocus.current]?.focus();
      returnFocus.current = '';
    }
  }, [section]);

  function edit(text = document.text) {
    setDrafts(previous => ({ ...previous, [section]: { text, revision: document.revision } }));
    setError('');
    setNotice('');
  }

  function discard() {
    setDrafts(previous => ({ ...previous, [section]: undefined }));
    setError('');
  }

  async function save(event) {
    event.preventDefault();
    if (!draft || saving) return;
    setSaving(true);
    setError('');
    try {
      setProfile(await api.saveResearchSection({ section, ...draft }));
      setDrafts(previous => ({ ...previous, [section]: undefined }));
      setNotice(section === 'memory' ? '已保存。后续讨论会按任务选用相关记忆。' : '已保存。后续讨论会采用这版准则。');
    } catch (error) { setError(errorText(error)); }
    finally { setSaving(false); }
  }

  if (!section) return <section className="research-settings research-overview" aria-label="研究记忆" key="overview">
    <h2>研究记忆</h2>
    <nav className="research-modules" aria-label="研究记忆模块">
      {Object.entries(modules).map(([id, item]) => <button key={id} className="research-module" data-module={id}
        ref={element => { cards.current[id] = element; }} type="button" disabled={loading || !profile} onClick={() => setPendingSection(id)}>
        <span className="research-symbol"><Icon name={item.icon} /></span>
        <span><strong>{item.title}</strong><span>{item.label}</span></span>
        <span className="research-open"><Icon name="forward" /></span>
      </button>)}
    </nav>
    {error && <p className="error" role="alert">{error}</p>}
    {pendingSection && <EditWarning module={modules[pendingSection]} cancel={() => setPendingSection('')} proceed={() => {
      const target = pendingSection;
      const saved = profile[target];
      setPendingSection('');
      setSection(target);
      setError('');
      setNotice('');
      setDirection(target === 'memory' && !saved.text);
      setDrafts(previous => ({ ...previous, [target]: previous[target] || { text: saved.text, revision: saved.revision } }));
    }} />}
  </section>;

  return <section className="research-settings research-editor-screen" aria-label={meta.title + ' 编辑页'} key={section}>
    <header className="research-editor-title">
      <span className="research-symbol"><Icon name={meta.icon} /></span>
      <h2>{meta.title}</h2>
      <button className="quiet icon-label" disabled={saving} onClick={() => {
        returnFocus.current = section;
        setSection('');
        setError('');
      }}><Icon name="back" />返回研究记忆</button>
    </header>
    {section === 'memory' && <><AgentSummaries openIdea={openIdea} /><LearnedProfile openIdea={openIdea} /><MemoryEntries openIdea={openIdea} /></>}
    {section === 'memory' && (direction
      ? <DirectionBuilder close={() => setDirection(false)} apply={text => {
        edit([draft?.text.trim(), text].filter(Boolean).join('\n\n').slice(0, limit));
        setDirection(false);
      }} />
      : <button className="quiet icon-label" type="button" onClick={() => setDirection(true)}><Icon name="compose" />用选项补充研究方向</button>)}
    {document && <form className="research-document" onSubmit={save}>
      <header className="research-document-header">
        <div><h3>{meta.label}</h3><p>{meta.description}</p></div>
        {!draft && <button className="icon-label" type="button" onClick={() => edit()}><Icon name="compose" />编辑</button>}
      </header>
      {draft ? <div className={'research-editor-layout ' + section}>
        <div className="research-edit-guide" id="research-guidance">
          {section === 'soul' ? <>
            <strong>长期准则</strong>
            <ul><li>语言与交流风格</li><li>提问与选项偏好</li><li>证据标准与工作范围</li></ul>
          </> : <>
            <p>{meta.guidance}</p>
            {!draft.text && <button type="button" className="quiet" onClick={() => edit('研究问题\n\n常用数据与方法\n\n长期约束\n')}>插入研究提纲</button>}
          </>}
        </div>
        <textarea className="research-editor" aria-label={meta.label} aria-describedby="research-guidance" autoFocus
          value={draft.text} disabled={saving} maxLength={limit} rows={section === 'soul' ? 7 : 10}
          placeholder={meta.placeholder} onChange={event => {
            const text = event.target.value;
            setDrafts(previous => ({ ...previous, [section]: { ...previous[section], text } }));
          }} />
      </div> : document.text ? <div className="research-preview">{document.text}</div>
        : <div className="research-preview muted">还没有保存研究背景。{meta.guidance}</div>}
      <footer className="research-document-footer">
        <span className="muted">{draft ? draft.text.length + ' / ' + limit + ' 字符' : formatDate(document.savedAt)}
          {!draft && document.origin && ' · 来自已确认的讨论建议'}</span>
        {!draft && document.origin && <button className="quiet" type="button" onClick={() => openIdea(document.origin.ideaId)}>查看来源讨论</button>}
        {draft && <div className="actions">
          <button className="quiet" type="button" disabled={saving} onClick={discard}>取消编辑</button>
          <button className="primary" disabled={saving || draft.text === document.text}>{saving ? '正在保存…' : '保存更改'}</button>
        </div>}
      </footer>
    </form>}
    {document?.history?.length > 0 && <details className="research-history">
      <summary><Icon name="history" />版本历史 <span>{document.history.length}</span></summary>
      {document.history.map(version => <div className="research-version" key={version.revision}>
        <div><span>{formatDate(version.savedAt)}{version.origin && ' · 来自已确认的讨论建议'}</span><p>{version.text || '空白内容'}</p>
          {version.origin && <button className="quiet" type="button" onClick={() => openIdea(version.origin.ideaId)}>查看来源讨论</button>}
        </div>
        <button className="quiet" type="button" disabled={saving || Boolean(draft)} onClick={() => edit(version.text)}>恢复到编辑器</button>
      </div>)}
    </details>}
    {notice && <p className="success" role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
