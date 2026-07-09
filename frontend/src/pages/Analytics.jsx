import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import api from '../api/client';
import StatCard from '../components/StatCard';
import { useLang } from '../i18n/LangContext';

const COLORS = ['#e11d2e', '#ff5a63', '#e8b84b', '#22c55e', '#c084fc', '#6f6162'];

export default function Analytics() {
  const [d, setD] = useState(null);
  const { t } = useLang();

  useEffect(() => { api.get('/analytics').then(r => setD(r.data)); }, []);
  if (!d) return <div className="text-text3">{t('loading')}</div>;

  return (
    <div>
      <h1 className="text-xl font-black mb-5">{t('analytics')}</h1>
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard label={t('avgCheck')} value={Math.round(d.avgCheck).toLocaleString('ru-RU') + ' ₽'} />
        <StatCard label={t('totalSalesCount')} value={d.totalSales} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="card">
          <div className="font-bold text-sm mb-3">{t('byBrand')}</div>
          {d.byBrand.length === 0 ? <div className="text-text3 text-sm">—</div> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={d.byBrand} dataKey="qty" nameKey="brand" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {d.byBrand.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1d1416', border: '1px solid #33201f', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="card">
          <div className="font-bold text-sm mb-3">{t('topClients')}</div>
          {d.topClients.length === 0 && <div className="text-text3 text-sm">—</div>}
          {d.topClients.map((c, i) => (
            <div key={c.id} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0">
              <span><b className="text-text3 mr-1">{i + 1}.</b>{c.name}</span>
              <span className="font-mono text-accent2">{Math.round(c.total_rub).toLocaleString('ru-RU')} ₽</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="font-bold text-sm mb-3">{t('bySeries')}</div>
        {d.bySeries.map((s, i) => (
          <div key={i} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0">
            <span>{s.brand} {s.series}</span>
            <span className="font-mono">{s.qty} {t('sold')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
