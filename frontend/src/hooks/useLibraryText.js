import { useEffect, useState, useCallback } from 'react';
import api from '../api/client';
import { useLang } from '../i18n/LangContext';

// Подтягивает Справочник и даёт функцию tr(category, value) — отдаёт китайский перевод,
// если интерфейс на китайском и перевод для этого значения заполнен, иначе исходный текст.
// category: 'brand' | 'series' | 'cpu' | 'gpu' | 'ram' | 'storage' | 'color' | 'screen'
export function useLibraryText() {
  const [lib, setLib] = useState(null);
  const { lang } = useLang();

  useEffect(() => { api.get('/library').then(r => setLib(r.data)); }, []);

  const tr = useCallback((category, value) => {
    if (lang !== 'zh' || !value || !lib) return value;
    if (category === 'brand') {
      return lib.brands.find(b => b.name === value)?.name_zh || value;
    }
    if (category === 'series') {
      for (const b of lib.brands) {
        const found = b.series.find(s => s.name === value);
        if (found) return found.name_zh || value;
      }
      return value;
    }
    const list = lib.values?.[category];
    if (!list) return value;
    return list.find(v => v.value === value)?.value_zh || value;
  }, [lib, lang]);

  return { lib, tr };
}
