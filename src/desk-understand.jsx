import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './icons.jsx';

const api = window.recorder;
const errorText = error => error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');
const criticalGroups = [
  ['批判四问', [['who', '谁在提出该主张？'], ['why', '动机与出发点是什么？'], ['evidence', '核心实验依据是什么？'], ['holds', '推导与证据站得住吗？']]],
  ['综合五问', [['consensus', '领域共识是什么？'], ['debate', '核心争议点在哪里？'], ['method', '偏理论、定性还是定量？'], ['ignored', '哪些边界情境被忽略？'], ['mine', '对我的课题有何启发？']]],
];

export function DeskUnderstand({ paper, page, translation, onGo, glossaryVersion = 0, focusGlossary = 0, onClear }) {
  const [tab, setTab] = useState('plain');
  const [plain, setPlain] = useState(null);
  const [plainBusy, setPlainBusy] = useState(false);
  const [glossary, setGlossary] = useState([]);
  const [termQuery, setTermQuery] = useState('');
  const [critical, setCritical] = useState({});
  const [busy, setBusy] = useState('');
  const [savedNote, setSavedNote] = useState(false);
  const criticalSaver = useRef(null);
  const latestCritical = useRef(critical);
  latestCritical.current = critical;
  const criticalDirty = useRef(false);
  const [error, setError] = useState('');
  const { saved, result, progress, onTranslate, onStop, onAttach, currentText } = translation;
  const picked = result?.page === page ? result : null;
  const pageTranslation = saved?.page === page ? saved.text : '';

  function flushCritical() {
    clearTimeout(criticalSaver.current);
    if (!criticalDirty.current) return;
    criticalDirty.current = false;
    void api.saveInsight({
      paperId: paper.id, page: 1, kind: 'critical',
      text: JSON.stringify(latestCritical.current), citations: [], supported: true,
    }).catch(err => { criticalDirty.current = true; setError(errorText(err)); });
  }

  useEffect(() => { if (focusGlossary) setTab('glossary'); }, [focusGlossary]);

  useEffect(() => {
    let live = true;
    void api.getInsight(paper.id, 1, 'critical').then(row => {
      if (!live || !row?.text) return;
      try { setCritical(JSON.parse(row.text)); criticalDirty.current = false; } catch { /* Keep an empty form. */ }
    }, () => {});
    return () => { live = false; flushCritical(); };
  }, [paper.id]);

  useEffect(() => {
    let live = true;
    setPlain(null);
    setError('');
    void api.getPlain(paper.id, page).then(value => { if (live) setPlain(value); }, () => {});
    return () => { live = false; };
  }, [paper.id, page]);

  useEffect(() => {
    let live = true;
    void api.listGlossary(paper.id).then(rows => { if (live) setGlossary(rows); },
      err => { if (live) setError(errorText(err)); });
    return () => { live = false; };
  }, [paper.id, glossaryVersion]);

  async function generatePlain(refresh = false) {
    if (plainBusy) return;
    setPlainBusy(true);
    setError('');
    try { setPlain(await api.generatePlain(paper.id, page, refresh)); }
    catch (err) { setError(errorText(err)); }
    finally { setPlainBusy(false); }
  }

  async function removeTerm(id) {
    if (busy) return;
    setBusy(id);
    setError('');
    try {
      await api.removeGlossary(id);
      setGlossary(previous => previous.filter(item => item.id !== id));
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(''); }
  }

  async function savePlainToNote() {
    if (!plain?.text) return;
    try {
      const existing = await api.getPaperNote(paper.id);
      const block = `\n\n### 第 ${page} 页白话导读\n${plain.text}`;
      const nextText = (existing?.text || '').trim() + block;
      const escaped = block.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
      await api.savePaperNote(paper.id, { text: nextText, html: (existing?.html || '') + escaped });
      setSavedNote(true);
      setTimeout(() => setSavedNote(false), 1600);
    } catch (err) { setError(errorText(err)); }
  }

  const filteredGlossary = useMemo(() => {
    const q = termQuery.trim().toLowerCase();
    if (!q) return glossary;
    return glossary.filter(item => (item.term + ' ' + item.definition).toLowerCase().includes(q));
  }, [glossary, termQuery]);

  return <section className="desk-understand" aria-label="理解">
    <div className="desk-subtabs" role="group" aria-label="理解方式">
      {[
        ['plain', '本页白话'],
        ['translation', '译文摘引'],
        ['glossary', `术语库${glossary.length ? ` (${glossary.length})` : ''}`],
        ['critical', '批判九问'],
      ].map(([id, label]) =>
        <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}
    </div>

    {tab === 'plain' && <div className="desk-plain">
      <div className="desk-section-head">
        <div>
          <h3>第 {page} 页白话导读</h3>
          <p>严格基于本页可提取文字生成，逐句核验原文出处</p>
        </div>
        <button type="button" className={plain ? 'quiet icon-label' : 'primary icon-label'}
          disabled={plainBusy} onClick={() => void generatePlain(Boolean(plain))}>
          <Icon name="refresh" />{plainBusy ? '生成核验中…' : plain ? '重新生成' : '生成白话导读'}
        </button>
      </div>
      {plain ? <>
        <div className="desk-plain-meta">
          <span className="desk-trust" data-supported={Boolean(plain.supported)}>
            <Icon name="shield" />
            {plain.supported ? `已逐字核对 ${plain.citations.length} 处原文依据` : '证据不足 · 原文未明确提及'}
          </span>
          <button type="button" className="quiet icon-label" onClick={() => void savePlainToNote()}>
            <Icon name={savedNote ? 'check' : 'document'} />{savedNote ? '已存入笔记' : '存入笔记'}
          </button>
        </div>
        <p className="desk-prose">{plain.text}</p>
        {plain.citations.length > 0 && <ul className="desk-citations">
          {plain.citations.map((citation, index) => <li key={index}>
            <button type="button" className="quiet" onClick={() => onGo(citation.page)}>
              第 {citation.page} 页 · “{citation.quote}”
            </button>
          </li>)}
        </ul>}
      </> : <p className="muted">{plainBusy ? '正在阅读本页并逐句核对原文引文…' : '点击右上角按钮生成通俗解释；若找不到原文依据会如实提示。'}</p>}
    </div>}

    {tab === 'translation' && <div className="desk-translation">
      <div className="desk-section-head">
        <h3>{picked ? '划选片段译文' : `第 ${page} 页译文摘引`}</h3>
        {picked && <button type="button" className="quiet" onClick={onClear}>清除选区</button>}
      </div>
      {!picked && <div className="desk-translate-actions">
        <button type="button" className="primary" disabled={Boolean(progress) || !currentText} onClick={() => onTranslate('page')}>翻译本页</button>
        <button type="button" className="quiet" disabled={Boolean(progress) || paper.status !== 'ready'} onClick={() => onTranslate('paper')}>翻译全文</button>
      </div>}
      {progress && <div className="desk-progress" role="status">
        <span>{progress.stopping ? '正在停止…' : progress.scope === 'paper'
          ? `全文翻译 ${progress.done} / ${progress.total} 页` : '正在翻译…'}</span>
        <button type="button" className="quiet" disabled={progress.stopping} onClick={onStop}>停止</button>
      </div>}
      {picked && <blockquote className="desk-quote">{picked.source}</blockquote>}
      {(picked ? picked.text : pageTranslation)
        ? <>
            <p className="desk-translation-text">{picked ? picked.text : pageTranslation}</p>
            <button type="button" className="quiet icon-label" onClick={() => onAttach(picked?.source || currentText, picked?.text || pageTranslation)}>
              <Icon name="excerpt" />将原文与译文一并带入讨论
            </button>
          </>
        : !progress && <p className="muted">{picked ? '可重新选择原文后重试。' : paper.status !== 'ready' ? '等待本地提取文字…'
          : currentText ? '可点击「翻译本页」，或在左侧 PDF 中划选任意句子点「翻译」。' : '本页没有可提取的文字。'}</p>}
    </div>}

    {tab === 'glossary' && <div className="desk-glossary">
      <div className="desk-section-head">
        <div>
          <h3>专业术语词典</h3>
          <p>在原文中划选术语，点弹出栏「术语」即可释义并定位原句</p>
        </div>
      </div>
      {glossary.length > 2 && <label className="search-input-box">
        <Icon name="search" />
        <input type="search" value={termQuery} onChange={e => setTermQuery(e.target.value)} placeholder="筛选已收录术语…" />
      </label>}
      {filteredGlossary.length ? <div className="desk-term-list">
        {filteredGlossary.map(item => <article key={item.id}>
          <header>
            <strong>{item.term}</strong>
            <button type="button" className="quiet icon-only-btn" disabled={busy === item.id}
              onClick={() => void removeTerm(item.id)} title="删除术语"><Icon name="trash" /></button>
          </header>
          <p>{item.definition}</p>
          {item.quote && <button type="button" className="quiet desk-term-source" onClick={() => onGo(item.page)}>
            第 {item.page} 页 · “{item.quote}”
          </button>}
        </article>)}
      </div> : <p className="muted">{glossary.length ? '没有匹配的术语。' : '还没有收录术语。在 PDF 原文中划选专有名词并点击「术语」，Agent 会结合上下文释义。'}</p>}
    </div>}

    {tab === 'critical' && <div className="desk-critical">
      <div className="desk-section-head">
        <div>
          <h3>批判与综合审视</h3>
          <p>独立写下你自己的学术审稿判断，自动持久保存</p>
        </div>
      </div>
      {criticalGroups.map(([label, items]) => <section key={label}>
        <h4>{label}</h4>
        <div className="desk-critical-grid">{items.map(([key, text]) => <label key={key}>
          <span>{text}</span>
          <textarea rows={2} value={critical[key] || ''} onChange={event => {
            const next = { ...critical, [key]: event.target.value };
            setCritical(next);
            latestCritical.current = next;
            criticalDirty.current = true;
            clearTimeout(criticalSaver.current);
            criticalSaver.current = setTimeout(flushCritical, 500);
          }} onBlur={flushCritical} />
        </label>)}</div>
      </section>)}
    </div>}

    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
