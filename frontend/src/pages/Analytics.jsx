import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import api from '../api/client';
import StatCard from '../components/StatCard';
import { useLang } from '../i18n/LangContext';

const COLORS = ['#e11d2e', '#ff5a63', '#e8b84b', '#22c55e', '#c084fc', '#6f6162'];

export default function Analytics() {
  const [d, setD] = useState(null);
  const [salesPeriod, setSalesPeriod] = useState('30');
  const [salesTs, setSalesTs] = useState([]);
  const [rateData, setRateData] = useState([]);
  const [cbrLoading, setCbrLoading] = useState(false);
  const { t } = useLang();

  useEffect(() => { api.get('/analytics').then(r => setD(r.data)); }, []);

  useEffect(() => {
    api.get('/analytics/timeseries', { params: { period: salesPeriod } }).then(r => setSalesTs(r.data));
  }, [salesPeriod]);

  useEffect(() => { loadRateChart(); }, []);

  async function loadRateChart() {
    const [mine, cbr] = await Promise.all([
      api.get('/settings/rate-history'),
      api.get('/settings/cbr-rate-history'),
    ]);
    const mineByDate = {};
    mine.data.forEach(r => { mineByDate[new Date(r.created_at).toISOString().slice(0, 10)] = Number(r.rate); });
    const cbrByDate = {};
    cbr.data.forEach(r => { cbrByDate[r.date.slice(0, 10)] = Number(r.rate); });
    const allDates = [...new Set([...Object.keys(mineByDate), ...Object.keys(cbrByDate)])].sort();
    let lastMine, lastCbr;
    const merged = allDates.map(dt => {
      if (mineByDate[dt] !== undefined) lastMine = mineByDate[dt];
      if (cbrByDate[dt] !== undefined) lastCbr = cbrByDate[dt];
      return { date: dt.slice(5), my_rate: lastMine, cbr_rate: lastCbr };
    });
    setRateData(merged.slice(-60));
  }

  async function fetchCbr() {
    setCbrLoading(true);
    try {
      const resp = await fetch('https://www.cbr-xml-daily.ru/daily_json.js');
      const json = await resp.json();
      const cny = json?.Valute?.CNY;
      if (cny) {
        const rate = cny.Value / (cny.Nominal || 1);
        const date = (json.Date || new Date().toISOString()).slice(0, 10);
        await api.post('/settings/cbr-rate', { date, rate });
        await loadRateChart();
      }
    } catch (e) { /* сеть ЦБ недоступна — просто пропускаем */ }
    setCbrLoading(false);
  }

  if (!d) return <div className="text-text3">{t('loading')}</div>;

  return (
    <div>
      <h1 className="text-2xl font-black mb-6">{t('analytics')}</h1>
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard label={t('avgCheck')} value={Math.round(d.avgCheck).toLocaleString('ru-RU') + ' ₽'} />
        <StatCard label={t('totalSalesCount')} value={d.totalSales} />
      </div>

      <div className="card mb-4">
        <div className="flex justify-between items-center mb-3">
          <div className="font-bold text-sm">{t('monthlySales')}</div>
          <div className="flex gap-1">
            {['7', '30', '365', 'years'].map(p => (
              <button key={p} onClick={() => setSalesPeriod(p)} className={`btn btn-xs ${salesPeriod === p ? 'btn-primary' : 'btn-secondary'}`}>
                {p === '7' ? t('period7') : p === '30' ? t('period30') : p === '365' ? t('period365') : t('periodYears')}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={salesTs}>
            <CartesianGrid stroke="#33201f" vertical={false} />
            <XAxis dataKey="lbl" stroke="#6f6162" fontSize={11} />
            <YAxis stroke="#6f6162" fontSize={11} />
            <Tooltip contentStyle={{ background: '#1d1416', border: '1px solid #33201f', borderRadius: 8, fontSize: 12 }} formatter={(v) => '¥' + Number(v).toFixed(0)} />
            <Line type="monotone" dataKey="revenue_cny" name={t('revenue')} stroke="#ff5a63" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="cost_cny" name={t('costPrice')} stroke="#6f6162" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="margin_cny" name={t('profit')} stroke="#22c55e" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="card mb-4">
        <div className="flex justify-between items-center mb-3">
          <div className="font-bold text-sm">{t('ratechart')}</div>
          <button className="btn btn-secondary btn-xs" onClick={fetchCbr} disabled={cbrLoading}>{t('updateCbr')}</button>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={rateData}>
            <CartesianGrid stroke="#33201f" vertical={false} />
            <XAxis dataKey="date" stroke="#6f6162" fontSize={11} />
            <YAxis stroke="#6f6162" fontSize={11} domain={['auto', 'auto']} />
            <Tooltip contentStyle={{ background: '#1d1416', border: '1px solid #33201f', borderRadius: 8, fontSize: 12 }} />
            <Line type="monotone" dataKey="my_rate" name={t('myRate')} stroke="#e8b84b" strokeWidth={2} dot={false} connectNulls />
            <Line type="monotone" dataKey="cbr_rate" name={t('cbrRate')} stroke="#4f8cff" strokeWidth={2} dot={false} strokeDasharray="4 3" connectNulls />
          </LineChart>
        </ResponsiveContainer>
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
