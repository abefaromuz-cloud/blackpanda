import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api from '../api/client';
import StatCard from '../components/StatCard';
import { useLang } from '../i18n/LangContext';

export default function Dashboard() {
  const [d, setD] = useState(null);
  const { t } = useLang();

  useEffect(() => { api.get('/dashboard').then(r => setD(r.data)); }, []);

  if (!d) return <div className="text-text3">{t('loading')}</div>;

  const chartData = (d.monthly || []).map(m => ({
    month: m.month,
    revenue: Math.round(Number(m.revenue_rub)),
    profit: Math.round(Number(m.profit_rub)),
  }));

  return (
    <div>
      <h1 className="text-xl font-black mb-5">{t('dashboard')}</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label={t('inStock')} value={d.stock.in_stock} color="green" />
        <StatCard label={t('inTransit')} value={d.stock.in_transit} color="yellow" />
        <StatCard label={t('reserved')} value={d.stock.reserved} color="accent2" />
        <StatCard label={t('soldTotal')} value={d.stock.sold} />
        <StatCard label={t('sales30d')} value={Math.round(d.sales30d.total_rub).toLocaleString('ru-RU') + ' ₽'} sub={d.sales30d.count + ''} />
        <StatCard label={t('cashBalance')} value={Math.round(d.cash_balance_rub).toLocaleString('ru-RU') + ' ₽'} color="green" />
        <StatCard label={t('rate')} value={'¥1 = ' + d.rate + ' ₽'} />
        <StatCard label={t('clientDebts')} value={d.debts.reduce((s, c) => s + Number(c.debt_rub), 0).toLocaleString('ru-RU') + ' ₽'} color="red" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <div className="card lg:col-span-2">
          <div className="font-bold text-sm mb-3">{t('monthlySales')}</div>
          {chartData.length === 0 ? (
            <div className="text-text3 text-sm">—</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid stroke="#33201f" vertical={false} />
                <XAxis dataKey="month" stroke="#6f6162" fontSize={11} />
                <YAxis stroke="#6f6162" fontSize={11} tickFormatter={(v) => (v / 1000) + 'k'} />
                <Tooltip contentStyle={{ background: '#1d1416', border: '1px solid #33201f', borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => Number(v).toLocaleString('ru-RU') + ' ₽'} />
                <Line type="monotone" dataKey="revenue" name={t('revenue')} stroke="#ff5a63" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="profit" name={t('profit')} stroke="#22c55e" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="card">
          <div className="font-bold text-sm mb-3">{t('topModels')}</div>
          {(!d.top_models || d.top_models.length === 0) && <div className="text-text3 text-sm">—</div>}
          {d.top_models?.map((m, i) => (
            <div key={i} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0">
              <span><b className="text-text3 mr-1">{i + 1}.</b>{m.brand} {m.series}</span>
              <span className="font-mono text-accent2">{m.sold_qty}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <div className="font-bold mb-3">⚠️ {t('lowStock')}</div>
          {d.low_stock.length === 0 && <div className="text-text3 text-sm">{t('allOk')}</div>}
          {d.low_stock.map(l => (
            <Link key={l.id} to={`/warehouse/${l.id}`} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0 hover:text-accent2">
              <span>{l.brand} {l.series}</span>
              <span className="text-yellow font-mono">{l.in_stock} шт.</span>
            </Link>
          ))}
        </div>
        <div className="card">
          <div className="font-bold mb-3">💰 {t('debtors')}</div>
          {d.debts.length === 0 && <div className="text-text3 text-sm">{t('noDebts')}</div>}
          {d.debts.map(c => (
            <Link key={c.id} to={`/clients/${c.id}`} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0 hover:text-accent2">
              <span>{c.name}</span>
              <span className="text-red font-mono">{Math.round(c.debt_rub).toLocaleString('ru-RU')} ₽</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
