import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api from '../api/client';
import StatCard from '../components/StatCard';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';

const catLabelKey = { purchase: 'purchase', rent: 'rent', salary: 'salaryExp', logistics: 'logistics', marketing: 'marketing', other: 'other' };

export default function Finance() {
  const [d, setD] = useState(null);
  const { can } = useAuth();
  const { t } = useLang();

  useEffect(() => { api.get('/finance').then(r => setD(r.data)); }, []);
  if (!d) return <div className="text-text3">{t('loading')}</div>;

  const chartData = d.monthly.map(m => ({ month: m.month, revenue: Math.round(Number(m.revenue_rub)), cost: Math.round(Number(m.cost_rub)) }));

  return (
    <div>
      <h1 className="text-xl font-black mb-5">{t('finance')}</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label={t('revenue')} value={Math.round(d.revenue).toLocaleString('ru-RU') + ' ₽'} />
        <StatCard label={t('grossProfit')} value={Math.round(d.grossProfit).toLocaleString('ru-RU') + ' ₽'} color="green" />
        <StatCard label={t('expenses')} value={Math.round(d.expenses).toLocaleString('ru-RU') + ' ₽'} color="red" />
        <StatCard label={t('netProfit')} value={Math.round(d.netProfit).toLocaleString('ru-RU') + ' ₽'} color={d.netProfit >= 0 ? 'green' : 'red'} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-2">
          <div className="font-bold text-sm mb-3">{t('revenue')} / {t('finance')} (12 мес.)</div>
          {chartData.length === 0 ? <div className="text-text3 text-sm">—</div> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData}>
                <CartesianGrid stroke="#33201f" vertical={false} />
                <XAxis dataKey="month" stroke="#6f6162" fontSize={11} />
                <YAxis stroke="#6f6162" fontSize={11} tickFormatter={(v) => (v / 1000) + 'k'} />
                <Tooltip contentStyle={{ background: '#1d1416', border: '1px solid #33201f', borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => Number(v).toLocaleString('ru-RU') + ' ₽'} />
                <Bar dataKey="revenue" name={t('revenue')} fill="#ff5a63" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cost" name={t('costPrice')} fill="#6f6162" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="card">
          <div className="font-bold text-sm mb-3">{t('expensesByCategory')}</div>
          {d.expensesByCategory.length === 0 && <div className="text-text3 text-sm">—</div>}
          {d.expensesByCategory.map((c, i) => (
            <div key={i} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0">
              <span>{t(catLabelKey[c.category] || 'other')}</span>
              <span className="font-mono text-red">{Math.round(c.total).toLocaleString('ru-RU')} ₽</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
