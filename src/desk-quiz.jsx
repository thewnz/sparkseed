import { useEffect, useState } from 'react';
import { Icon } from './icons.jsx';

const api = window.recorder;
const errorText = error => error.message.replace(/^Error invoking remote method '[^']+': Error: /, '');
const ratings = [
  ['again', '重来', '1'],
  ['hard', '吃力', '2'],
  ['good', '记得', '3'],
  ['easy', '熟练', '4'],
];

export function DeskQuiz({ paperId, onGo }) {
  const [cards, setCards] = useState([]);
  const [queue, setQueue] = useState([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const card = queue[index];

  useEffect(() => {
    let live = true;
    void api.listQuiz(paperId).then(rows => {
      if (!live) return;
      setCards(rows);
      const due = rows.filter(row => Date.parse(row.due) <= Date.now());
      setQueue(due.length ? due : rows);
      setIndex(0);
      setRevealed(false);
    }, err => { if (live) setError(errorText(err)); });
    return () => { live = false; };
  }, [paperId]);

  async function generate() {
    if (busy) return;
    setBusy('generate');
    setError('');
    try {
      const rows = await api.generateQuiz(paperId);
      setCards(rows);
      setQueue(rows);
      setIndex(0);
      setRevealed(false);
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(''); }
  }

  async function review(rating) {
    if (busy || !card) return;
    setBusy(rating);
    setError('');
    try {
      const updated = await api.reviewQuiz(card.id, rating);
      setCards(previous => previous.map(item => item.id === updated.id ? updated : item));
      setQueue(previous => {
        const next = previous.map((item, position) => position === index ? updated : item);
        if (rating === 'again') next.push(updated);
        return next;
      });
      setIndex(previous => previous + 1);
      setRevealed(false);
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(''); }
  }

  const dueCount = cards.filter(item => Date.parse(item.due) <= Date.now()).length;
  const pct = queue.length ? Math.round((Math.min(index, queue.length) / queue.length) * 100) : 0;

  return <section className="desk-quiz" aria-label="自测复习" onKeyDown={event => {
    if (!card || busy) return;
    if (event.key === ' ' && !revealed && event.target.tagName !== 'BUTTON') {
      event.preventDefault();
      setRevealed(true);
    } else if (revealed && ['1', '2', '3', '4'].includes(event.key)) {
      event.preventDefault();
      void review(ratings[Number(event.key) - 1][0]);
    }
  }}>
    <div className="desk-section-head">
      <div>
        <h3>间隔回忆题卡</h3>
        <p className="muted">待复习 {dueCount} 张 · 共 {cards.length} 张。主动检索记忆远胜重复阅读</p>
      </div>
      <button type="button" className="quiet icon-label" disabled={Boolean(busy)} onClick={() => void generate()}>
        <Icon name="refresh" />{busy === 'generate' ? '生成中…' : cards.length ? '增补新题' : '生成题卡'}
      </button>
    </div>

    {!cards.length && <div className="desk-quiz-empty workbench-empty-card">
      <Icon name="check" />
      <strong>用闪卡检验真实理解</strong>
      <p>从原文关键命题生成带逐字依据的问答题卡，按记忆熟练度动态排期复习。</p>
      <button type="button" className="primary icon-label" disabled={Boolean(busy)} onClick={() => void generate()}>
        <Icon name="stars" />{busy === 'generate' ? '正在提炼原文题卡…' : '从原文生成自测题'}
      </button>
    </div>}

    {cards.length > 0 && !card && <div className="desk-quiz-empty workbench-empty-card">
      <Icon name="check" />
      <strong>本轮间隔复习已全部通关</strong>
      <p>下一批题卡将在记忆衰减节点自动浮现。</p>
      <button type="button" className="quiet icon-label" onClick={() => { setQueue(cards); setIndex(0); setRevealed(false); }}>
        <Icon name="refresh" />立即重温全套题卡
      </button>
    </div>}

    {card && <article className="desk-quiz-card" tabIndex={0}>
      <header>
        <span className="desk-quiz-count">题卡 {index + 1} / {queue.length}</span>
        <button type="button" className="quiet desk-quiz-page" onClick={() => onGo(card.source_page)}>
          定位第 {card.source_page} 页 →
        </button>
      </header>
      <div className="triage-timer-track" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
      <h4>{card.question}</h4>

      {!revealed
        ? <button type="button" className="primary icon-label" onClick={() => setRevealed(true)}>
            <Icon name="eye" />翻转核对答案
          </button>
        : <>
            <div className="desk-answer-box">
              <p className="desk-prose desk-answer">{card.answer}</p>
              {card.source_quote && <blockquote className="desk-quote">
                <span>原文逐字依据</span>
                {card.source_quote}
              </blockquote>}
            </div>
            <div className="desk-review-buttons" role="group" aria-label="复习熟练度评分">
              {ratings.map(([id, label, keyHint]) => <button key={id} type="button" data-rating={id}
                disabled={Boolean(busy)} onClick={() => void review(id)}>
                <span>{busy === id ? '…' : label}</span>
                <kbd>{keyHint}</kbd>
              </button>)}
            </div>
          </>}
    </article>}

    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
