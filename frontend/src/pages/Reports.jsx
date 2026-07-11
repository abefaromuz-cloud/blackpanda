import { useState } from 'react';
import api from '../api/client';
import { useLang } from '../i18n/LangContext';

export default function Reports() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [salesReport, setSalesReport] = useState(null);
  const [whReport, setWhReport] = useState(null);
  const { t } = useLang();

  async function genSales() {
    const { data } = await api.get('/reports/sales', { params: { from: from || undefined, to: to || undefined } });
    setSalesReport(data);
  }

  async function genWarehouse() {
    const { data } = await api.get('/reports/warehouse');
    setWhReport(data);
  }

  function exportCsv() {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const token = localStorage.getItem('bp_token');
    fetch(`/api/reports/sales/export?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'sales-report.csv'; a.click();
        URL.revokeObjectURL(url);
      });
  }

  return (
    <div>
      <h1 className="text-2xl font-black mb-6">{t('reports')}</h1>

      <div className="card mb-5">
        <div className="font-bold text-sm mb-3">{t('salesReport')}</div>
        <div className="flex gap-2 flex-wrap items-end mb-3">
          <div><label className="block text-[11px] text-text2 font-bold uppercase mb-1">{t('from')}</label><input className="inp" type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><label className="block text-[11px] text-text2 font-bold uppercase mb-1">{t('to')}</label><input className="inp" type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
          <button className="btn btn-primary" onClick={genSales}>{t('generate')}</button>
          <button className="btn btn-secondary" onClick={exportCsv}>⇩ {t('exportCsv')}</button>
        </div>
        {salesReport && (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase text-text3 border-b border-border">
                <th className="pb-2">{t('date')}</th><th className="pb-2">{t('client')}</th><th className="pb-2">¥</th><th className="pb-2">₽</th>
              </tr>
            </thead>
            <tbody>
              {salesReport.rows.map(r => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="py-2 text-text3">{new Date(r.created_at).toLocaleDateString('ru-RU')}</td>
                  <td className="py-2">{r.client_name}</td>
                  <td className="py-2 font-mono text-yellow">¥{Number(r.total_cny).toFixed(0)}</td>
                  <td className="py-2 font-mono">{Math.round(r.total_rub).toLocaleString('ru-RU')} ₽</td>
                </tr>
              ))}
              <tr><td className="py-2 font-bold" colSpan={2}>{t('total')}</td>
                <td className="py-2 font-mono font-bold text-yellow">¥{salesReport.totals.total_cny.toFixed(0)}</td>
                <td className="py-2 font-mono font-bold">{Math.round(salesReport.totals.total_rub).toLocaleString('ru-RU')} ₽</td>
              </tr>
            </tbody>
          </table></div>
        )}
      </div>

      <div className="card">
        <div className="font-bold text-sm mb-3 flex justify-between items-center">
          {t('warehouseReport')}
          <button className="btn btn-secondary" onClick={genWarehouse}>{t('generate')}</button>
        </div>
        {whReport && (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase text-text3 border-b border-border">
                <th className="pb-2">{t('model')}</th><th className="pb-2">{t('inStock')}</th><th className="pb-2">{t('costPrice')}</th><th className="pb-2">{t('sellPrice')}</th>
              </tr>
            </thead>
            <tbody>
              {whReport.map((r, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="py-2">{r.brand} {r.series}</td>
                  <td className="py-2 font-mono">{r.in_stock}</td>
                  <td className="py-2 font-mono">¥{r.cost_cny}</td>
                  <td className="py-2 font-mono text-yellow">¥{r.price_sell_cny}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
