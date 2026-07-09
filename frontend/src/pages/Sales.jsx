import { useEffect, useState } from 'react';
import api from '../api/client';
import { useLang } from '../i18n/LangContext';

export default function Sales() {
  const [sales, setSales] = useState([]);
  const { t } = useLang();
  useEffect(() => { api.get('/sales').then(r => setSales(r.data)); }, []);

  return (
    <div>
      <h1 className="text-xl font-black mb-5">{t('sales')}</h1>
      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase text-text3 border-b border-border">
              <th className="pb-2">{t('date')}</th><th className="pb-2">{t('client')}</th><th className="pb-2">{t('qty')}</th><th className="pb-2">¥</th><th className="pb-2">₽</th>
            </tr>
          </thead>
          <tbody>
            {sales.map(s => (
              <tr key={s.id} className="border-b border-border last:border-0">
                <td className="py-2 text-text3">{new Date(s.created_at).toLocaleString('ru-RU')}</td>
                <td className="py-2">{s.client_name}</td>
                <td className="py-2">{s.items.reduce((n, it) => n + it.qty, 0)}</td>
                <td className="py-2 font-mono text-yellow">¥{Number(s.total_cny).toFixed(0)}</td>
                <td className="py-2 font-mono">{Math.round(s.total_rub).toLocaleString('ru-RU')} ₽</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
