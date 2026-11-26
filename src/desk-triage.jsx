import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons.jsx';

const api = window.recorder;
const errorText = error => error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');
const fields = [
  ['type', 'C1 · 论文体裁', '实证、综述、方法还是系统论文？'],
  ['context', 'C2 · 理论脉络', '建立在哪些关键前人工作之上？'],
  ['correctness', 'C3 · 论证严密性', '核心假设与实验设计是否站得住？'],
  ['contributions', 'C4 · 核心增量', '它真正新增了什么贡献？'],
  ['clarity', 'C5 · 表述质量', '图表结构与公式推导是否清晰？'],
];

export function DeskTriage({ paperId, onDecision }) {
  const [value, setValue] = useState({ type: '', context: '', correctness: '', contributions: '', clarity: '', decision: '' });
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [syncingNote, setSyncingNote] = useState(false);
  const [syncedNote, setSyncedNote] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef(null);
  const saver = useRef(null);
  const latest = useRef({ value, seconds });
  latest.current = { value, seconds };
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;

  useEffect(() => {
    let live = true;
    setLoaded(false);
    setRunning(false);
    void api.getTriage(paperId).then(row => {
      if (!live) return;
      setValue({
        type: row.type, context: row.context, correctness: row.correctness,
        contributions: row.contributions, clarity: row.clarity, decision: row.decision,
      });
      setSeconds(row.seconds || 0);
      setLoaded(true);
    }, err => { if (live) setError(errorText(err)); });
    return () => { live = false; clearInterval(timer.current); clearTimeout(saver.current); };
  }, [paperId]);

  useEffect(() => {
    if (!running) return;
    timer.current = setInterval(() => setSeconds(previous => previous + 1), 1000);
    return () => clearInterval(timer.current);
  }, [running]);

  useEffect(() => {
    if (!loaded) return;
    clearTimeout(saver.current);
    saver.current = setTimeout(() => {
      void api.saveTriage(paperId, { ...latest.current.value, seconds: latest.current.seconds })
        .catch(err => setError(errorText(err)));
    }, 450);
    return () => clearTimeout(saver.current);
  }, [value, loaded, paperId]);

  useEffect(() => {
    if (!running || !loaded) return;
    const id = setInterval(() => {
      void api.saveTriage(paperId, { ...latest.current.value, seconds: latest.current.seconds })
        .catch(err => setError(errorText(err)));
    }, 15000);
    return () => clearInterval(id);
  }, [running, loaded, paperId]);

  useEffect(() => () => {
    if (!loadedRef.current) return;
    void api.saveTriage(paperId, { ...latest.current.value, seconds: latest.current.seconds }).catch(() => {});
  }, [paperId]);

  const remaining = Math.max(0, 300 - seconds);
  const progressPct = Math.min(100, Math.round((seconds / 300) * 100));
  const clock = String(Math.floor(remaining / 60)).padStart(2, '0') + ':' + String(remaining % 60).padStart(2, '0');
  const filledCount = fields.filter(([key]) => (value[key] || '').trim()).length;

  async function syncToPaperNote() {
    if (syncingNote || !filledCount || !api.getPaperNote || !api.savePaperNote) return;
    setSyncingNote(true);
    setError('');
    try {
      const existing = await api.getPaperNote(paperId);
      const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const lines = fields.filter(([k]) => (value[k] || '').trim())
        .map(([k, label]) => `${label}：${value[k].trim()}`);
      const blockHtml = '<p><strong>5C 速读筛查记录</strong></p><ul>'
        + fields.filter(([k]) => (value[k] || '').trim())
          .map(([k, label]) => `<li><strong>${esc(label)}</strong>：${esc(value[k].trim())}</li>`).join('')
        + '</ul>';
      const nextHtml = (existing?.html || '') + blockHtml;
      const nextText = [existing?.text, '5C 速读筛查记录\n' + lines.join('\n')].filter(Boolean).join('\n\n');
      await api.savePaperNote(paperId, { html: nextHtml, text: nextText });
      setSyncedNote(true);
      setTimeout(() => setSyncedNote(false), 1800);
    } catch (err) { setError(errorText(err)); }
    finally { setSyncingNote(false); }
  }

  return <section className="desk-triage" aria-label="五分钟速读">
    <div className="desk-triage-head">
      <div>
        <div className="triage-title-line">
          <h3>五分钟 5C 速读筛查</h3>
          <span className="mini-tag">{filledCount} / 5 已填</span>
        </div>
        <p>用 5 分钟快速抓准骨架，再决定是否投入精读时间。内容实时自动保存。</p>
      </div>
      <div className="desk-timer">
        <strong>{clock}</strong>
        <button type="button" className={running ? 'quiet' : 'primary'} onClick={() => {
          if (running) {
            setRunning(false);
            void api.saveTriage(paperId, { ...latest.current.value, seconds: latest.current.seconds })
              .catch(err => setError(errorText(err)));
          } else setRunning(true);
        }}>
          <Icon name={running ? 'pause' : 'play'} />{running ? '暂停' : '计时'}
        </button>
      </div>
    </div>

    <div className="triage-timer-track" aria-hidden="true">
      <span style={{ width: `${progressPct}%` }} />
    </div>

    <div className="desk-triage-grid">
      {fields.map(([key, label, hint]) => <label key={key} className="triage-field-card">
        <span>{label}</span>
        <textarea rows={2} value={value[key]} placeholder={hint}
          onChange={event => setValue({ ...value, [key]: event.target.value })} />
      </label>)}
    </div>

    <div className="desk-decision" role="group" aria-label="阅读决定">
      <span>筛查结论：</span>
      {[['continue', '进入深度精读 →'], ['pause', '暂存待读'], ['skip', '略过不读']].map(([id, label]) =>
        <button key={id} type="button" aria-pressed={value.decision === id}
          onClick={() => { const next = { ...value, decision: id }; setValue(next); onDecision?.(next); }}>{label}</button>)}
      <button type="button" className="quiet icon-label" disabled={!filledCount || syncingNote}
        title="将已填写的 5C 速读要点追加到这篇论文的读书笔记" onClick={() => void syncToPaperNote()}>
        <Icon name={syncedNote ? 'check' : 'document'} />{syncedNote ? '已写入笔记' : '同步至论文笔记'}
      </button>
    </div>

    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
