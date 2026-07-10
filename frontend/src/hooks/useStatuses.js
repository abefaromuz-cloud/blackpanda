import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';
import { useLang } from '../i18n/LangContext';

const BUCKET_BADGE = {
  instock: 'badge-green', intransit: 'badge-yellow', reserved: 'badge-blue',
  sold: 'badge-red', other: 'badge-purple',
};

// Статусы товара теперь ведутся в Справочнике (могут быть любыми — "На ремонте", "Гарантия КНР" и т.д.),
// а не жёстко зашитыми 4 значениями. Этот хук подтягивает актуальный список + помогает с бейджами и переводом.
export function useStatuses() {
  const [statuses, setStatuses] = useState([]);
  const { lang } = useLang();

  useEffect(() => { api.get('/library/statuses').then(r => setStatuses(r.data)); }, []);

  const bucketOf = useCallback((label) => statuses.find(s => s.label === label)?.counts_as || 'other', [statuses]);
  const badgeClass = useCallback((label) => BUCKET_BADGE[bucketOf(label)] || 'badge-blue', [bucketOf]);
  const isSellable = useCallback((label) => ['instock', 'reserved'].includes(bucketOf(label)), [bucketOf]);
  const isInStock = useCallback((label) => bucketOf(label) === 'instock', [bucketOf]);
  // Отображаемый текст статуса — китайский перевод, если язык интерфейса zh и перевод заполнен
  const displayLabel = useCallback((label) => {
    if (lang !== 'zh') return label;
    const st = statuses.find(s => s.label === label);
    return st?.label_zh || label;
  }, [statuses, lang]);

  return { statuses, bucketOf, badgeClass, isSellable, isInStock, displayLabel };
}
