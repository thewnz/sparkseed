import { useEffect, useRef, useState } from 'react';
import { figureBriefNoteLimit, figureBriefQuestions, figureBriefRecord } from '../desktop/figure-brief.mjs';
import { Icon } from './icons.jsx';
import { Question } from './question.jsx';

export function BriefSummary({ record }) {
  return <ol className="figure-brief-summary">{record.map(({ question, selections, note, skipped }) => <li key={question}>
    <strong>{question}</strong><p>{skipped ? '已跳过' : [...selections, note].filter(Boolean).join('；')}</p>
  </li>)}</ol>;
}

function IntakeRound({ round, initial, submit, back, disabled }) {
  const [selected, setSelected] = useState(initial?.selected || []);
  const [custom, setCustom] = useState(Boolean(initial?.note));
  const [note, setNote] = useState(initial?.note || '');
  const title = useRef(null);
  const input = useRef(null);
  useEffect(() => { title.current?.focus(); }, []);
  return <form className="figure-intake-round message agent-message" onSubmit={event => {
    event.preventDefault();
    const text = custom ? note.trim() : '';
    if (!disabled && (selected.length || text)) submit({ selected, note: text });
  }}>
    <fieldset className="figure-intake-fields" disabled={disabled}><div className="message-body">
      <div ref={title} tabIndex={-1} aria-label={round.question}>
        <Question round={round} selected={selected} onSelect={setSelected} custom={custom} onCustom={checked => {
          setCustom(checked);
          if (checked) requestAnimationFrame(() => input.current?.focus());
        }}>
          <textarea ref={input} aria-label="补充绘图要求" value={note} rows={3} maxLength={figureBriefNoteLimit}
            placeholder="用自己的话补充。" onChange={event => setNote(event.target.value)} />
        </Question>
      </div>
      {round.help && <p className="muted">{round.help}</p>}
      <div className="figure-intake-actions">
        {back && <button className="quiet icon-label" type="button" disabled={disabled} onClick={back}>
          <Icon name="back" />上一问</button>}
        <button className="quiet" type="button" onClick={() => submit({ selected: [], note: '', skipped: true })}>跳过此问</button>
        <button className="primary icon-label" disabled={disabled || (!selected.length && !(custom && note.trim()))}>
          继续<Icon name="forward" />
        </button>
      </div>
    </div></fieldset>
  </form>;
}

export function FigureIntake({ answers, previous, answer, back, disabled }) {
  const questions = figureBriefQuestions(answers);
  const next = questions.find(round => !answers[round.id]);
  const record = figureBriefRecord(answers, { includeSkipped: true });
  if (!next) return null;
  return <section className="studio-prompt studio-glass figure-intake" aria-label="确认绘图需求">
    <header className="figure-intake-heading">
      <span className="studio-stage-symbol"><Icon name="discussion" /></span>
      <div><h3>确认绘图需求</h3><p className="muted">每轮可以多选，也可以用自己的话补充。</p></div>
      <span className="figure-intake-step">第 {record.length + 1} 问</span>
    </header>
    {record.length > 0 && <details><summary>已完成 {record.length} 问</summary><BriefSummary record={record} /></details>}
    <IntakeRound key={next.id} round={next} initial={previous[next.id]} submit={value => answer(next.id, value)}
      back={record.length ? back : null} disabled={disabled} />
  </section>;
}
