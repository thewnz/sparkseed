import { Icon } from './icons.jsx';

export function Question({ round, selected, onSelect, custom, onCustom, children }) {
  const customCode = String.fromCharCode(65 + round.options.length);
  return <div className="question socratic-card">
    <div className="question-eyebrow">
      <span className="question-tag">追问焦点</span>
      <span className="question-hint">可多选 · 可直接补充</span>
    </div>
    <h3>{round.question}</h3>
    <fieldset className="choice-grid">
      <legend className="visually-hidden">可多选回答项</legend>
      {round.options.map((option, index) => {
        const active = selected.includes(index);
        return <label className="choice" key={option} data-checked={active || undefined}>
          <input type="checkbox" className="visually-hidden" checked={active} onChange={event => {
            onSelect(event.target.checked ? [...selected, index] : selected.filter(item => item !== index));
          }} />
          <span className="choice-key" aria-hidden="true">
            {active ? <Icon name="check" /> : String.fromCharCode(65 + index)}
          </span>
          <span className="choice-label">{option}</span>
        </label>;
      })}
      <label className="choice choice-custom-toggle" data-checked={custom || undefined}>
        <input type="checkbox" className="visually-hidden" checked={custom}
          onChange={event => onCustom(event.target.checked)} />
        <span className="choice-key" aria-hidden="true">{custom ? <Icon name="check" /> : customCode}</span>
        <span className="choice-label">用自己的话补充观点…</span>
      </label>
      {custom && children}
    </fieldset>
  </div>;
}
