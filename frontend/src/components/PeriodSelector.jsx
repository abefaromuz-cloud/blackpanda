import { useTT } from '../i18n/useTT';

export const PERIOD_OPTIONS = ['day', 'week', 'month', 'year', 'all'];
const LABELS = { day: 'День', week: 'Неделя', month: 'Месяц', year: 'Год', all: 'Всё время' };

// Возвращает {from, to} в формате YYYY-MM-DD для выбранного периода. earliestDate — самая ранняя
// дата в системе (например, дата создания первой продажи) — нужна для варианта "Всё время".
export function periodToRange(period, earliestDate) {
  const to = new Date().toISOString().slice(0, 10);
  let from;
  const now = Date.now();
  if (period === 'day') from = new Date(now - 86400000).toISOString().slice(0, 10);
  else if (period === 'week') from = new Date(now - 7 * 86400000).toISOString().slice(0, 10);
  else if (period === 'month') from = new Date(now - 30 * 86400000).toISOString().slice(0, 10);
  else if (period === 'year') from = new Date(now - 365 * 86400000).toISOString().slice(0, 10);
  else from = (earliestDate || '2020-01-01').slice(0, 10); // "Всё время"
  return { from, to };
}

export default function PeriodSelector({ value, onChange, className = '' }) {
  const tt = useTT();
  return (
    <div className={`flex gap-1 flex-wrap ${className}`}>
      {PERIOD_OPTIONS.map(p => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={`btn btn-xs ${value === p ? 'btn-primary' : 'btn-secondary'}`}
        >
          {tt(LABELS[p])}
        </button>
      ))}
    </div>
  );
}
