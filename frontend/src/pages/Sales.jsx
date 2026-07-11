import { useEffect, useState } from 'react';
import api from '../api/client';
import { useLang } from '../i18n/LangContext';
import { printReceipt } from '../utils/print';

export default function Sales() {
  const [sales, setSales] = useState([]);
  const { t } = useLang();
  useEffect(() => { api.get('/sales').then(r => setSales(r.data)); }, []);

  return (
    <div>
      <h1 className="text-2xl font-black mb-6">{t('sales')}</h1>
      <div className="card">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase text-text3 border-b border-border">
              <th className="pb-2">{t('date')}</th><th className="pb-2">{t('client')}</th><th className="pb-2">{t('qty')}</th><th className="pb-2">¥</th><th className="pb-2">₽</th><th className="pb-2"></th>
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
                <td className="py-2 text-right">
                  <button className="text-text3 hover:text-accent2 text-xs" onClick={() => printReceipt({
                    saleId: s.id, clientName: s.client_name, note: s.note, discountRub: 0, totalRub: s.total_rub, totalCny: s.total_cny,
                    items: s.items.map(it => ({ brand: '', series: '', serials: it.serial_ids || [], qty: it.qty, totalCny: Number(it.total_cny).toFixed(0) })),
                  })}>🖨️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
