import { Icon } from './icons.jsx';

export function PaperRating({ value = 0, onChange, compact = false, label = '论文评分' }) {
  return <span className={compact ? 'paper-rating compact' : 'paper-rating'} role="group" aria-label={label}>
    {[1, 2, 3, 4, 5].map(score => <button key={score} type="button" className="rating-star"
      data-on={score <= value} aria-label={score + ' 分'} aria-pressed={score <= value}
      onClick={event => { event.stopPropagation(); onChange?.(value === score ? null : score); }}>
      <Icon name="star" />
    </button>)}
  </span>;
}
