import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { Wallet, TrendingUp, ShoppingCart, Package, Users, Sparkles } from 'lucide-react';
import api from '../api/client';
import { useLang } from '../i18n/LangContext';
import { useTT } from '../i18n/useTT';
import { exportToExcel, exportToPdf } from '../utils/export';
import PeriodSelector, { periodToRange } from '../components/PeriodSelector';

const COLORS = ['#e11d2e', '#ff5a63', '#e8b84b', '#22c55e', '#c084fc', '#6f6162', '#4f8cff'];
const PAYMENT_LABEL = { cash: 'Наличные', sber: 'Сбербанк', alfa: 'Альфа-банк', tbank: 'Т-банк' };

export default function Analytics() {
  const [d, setD] = useState(null);
  const [period, setPeriod] = useState('month');
  const { from, to } = periodToRange(period, '2024-01-01');
  const [insights, setInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const { lang, t } = useLang();
  const tt = useTT();
  const isZh = lang === 'zh';
  const cur = isZh ? '¥' : '₽';

  function load() {
    api.get('/analytics/full', { params: { from, to } }).then(r => setD(r.data));
  }
  useEffect(load, [period]);

  function money(obj) {
    if (!obj) return '—';
    return `¥${Math.round(obj.cny).toLocaleString('ru-RU')} ≈ ${Math.round(obj.rub).toLocaleString('ru-RU')} ₽`;
  }
  function moneyRaw(obj) { return isZh ? obj.cny : obj.rub; }

  async function generateInsights() {
    if (!d) return;
    setInsightsLoading(true);
    try {
      const { data } = await api.post('/analytics/insights', {
        оборот: d.stats.revenue.rub, прибыль: d.stats.profit.rub, продано: d.stats.sold_qty.value,
        изменение_оборота_pct: d.stats.revenue.change_pct, изменение_продаж_pct: d.stats.sold_qty.change_pct,
        остаток_на_складе: d.stats.stock_now.value, новых_клиентов: d.stats.new_clients.value,
        топ_модели: d.top_models, залежавшийся_товар: d.slow_stock, дебиторка_руб: d.receivables.rub,
      });
      setInsights(data.insights);
    } catch (e) {
      setInsights([tt('Не удалось получить инсайты — проверь ключ ИИ в Настройках')]);
    } finally { setInsightsLoading(false); }
  }

  function doExportExcel() {
    exportToExcel({
      filename: `BlackPanda_Statistics_${to}.xls`,
      sheetName: 'Статистика',
      title: 'Статистика',
      columns: [
        { key: 'lbl', label: 'Период', labelZh: '时期' },
        { key: 'revenue', label: 'Оборот', labelZh: '营业额', numeric: true },
        { key: 'profit', label: 'Прибыль', labelZh: '利润', numeric: true },
        { key: 'qty', label: 'Продано', labelZh: '已售', numeric: true },
      ],
      rows: (d?.dynamics || []).map(p => ({ lbl: p.lbl, revenue: moneyRaw(p.revenue), profit: moneyRaw(p.profit), qty: p.qty })),
    });
  }
  function doExportPdf() {
    exportToPdf({
      title: 'Статистика', subtitle: `${from} — ${to}`,
      columns: [
        { key: 'lbl', label: 'Период', labelZh: '时期' },
        { key: 'revenue', label: 'Оборот', labelZh: '营业额', numeric: true },
        { key: 'profit', label: 'Прибыль', labelZh: '利润', numeric: true },
        { key: 'qty', label: 'Продано', labelZh: '已售', numeric: true },
      ],
      rows: (d?.dynamics || []).map(p => ({ lbl: p.lbl, revenue: moneyRaw(p.revenue), profit: moneyRaw(p.profit), qty: p.qty })),
    });
  }

  if (!d) return <div className="text-text3">{t('loading')}</div>;

  const stockTotal = d.by_brand_stock.reduce((s, b) => s + Number(b.qty), 0);

  return (
    <div>
      <div className="flex justify-between items-center mb-5 flex-wrap gap-2">
        <h1 className="text-2xl font-black">{tt('Статистика')}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <PeriodSelector value={period} onChange={setPeriod} />
          <button className="btn btn-secondary btn-sm" onClick={doExportExcel}>📊 Excel</button>
          <button className="btn btn-secondary btn-sm" onClick={doExportPdf}>🖨️ PDF</button>
        </div>
      </div>

      {/* Верхние показатели */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <StatMini icon={<Wallet size={18} />} cls="bg-accent/15 text-accent2" label={tt('Оборот')} value={money(d.stats.revenue)} change={d.stats.revenue.change_pct} />
        <StatMini icon={<TrendingUp size={18} />} cls="bg-green/15 text-green" label={tt('Чистая прибыль')} value={money(d.stats.profit)} change={d.stats.profit.change_pct} />
        <StatMini icon={<ShoppingCart size={18} />} cls="bg-blue-500/15 text-blue-400" label={tt('Продано ноутбуков')} value={d.stats.sold_qty.value + ' ' + tt('шт.')} change={d.stats.sold_qty.change_pct} />
        <StatMini icon={<Package size={18} />} cls="bg-yellow/15 text-yellow" label={tt('Остаток на складе')} value={d.stats.stock_now.value + ' ' + tt('шт.')} />
        <StatMini icon={<Users size={18} />} cls="bg-purple/15 text-purple" label={tt('Новые клиенты')} value={d.stats.new_clients.value} change={d.stats.new_clients.change_pct} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <div className="card lg:col-span-2">
          <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
            <div className="font-bold text-sm">{tt('Динамика продаж')}</div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={d.dynamics.map(p => ({ lbl: p.lbl, revenue: moneyRaw(p.revenue), profit: moneyRaw(p.profit), qty: p.qty }))}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="lbl" stroke="var(--text3)" fontSize={11} />
              <YAxis yAxisId="money" stroke="var(--text3)" fontSize={11} />
              <YAxis yAxisId="qty" orientation="right" stroke="var(--text3)" fontSize={11} />
              <Tooltip contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text)' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line yAxisId="money" type="monotone" dataKey="revenue" name={tt('Оборот') + ` (${cur})`} stroke="#e11d2e" strokeWidth={2} dot={false} />
              <Line yAxisId="money" type="monotone" dataKey="profit" name={tt('Прибыль') + ` (${cur})`} stroke="#22c55e" strokeWidth={2} dot={false} />
              <Line yAxisId="qty" type="monotone" dataKey="qty" name={tt('Продажи') + ` (${tt('шт.')})`} stroke="#4f8cff" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="font-bold text-sm mb-3">{tt('Структура склада по брендам')}</div>
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie data={d.by_brand_stock} dataKey="qty" nameKey="brand" innerRadius={36} outerRadius={58} paddingAngle={2}>
                {d.by_brand_stock.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text)' }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-2">
            {d.by_brand_stock.map((b, i) => (
              <div key={b.brand} className="flex justify-between items-center text-xs">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{b.brand}</span>
                <span className="text-text3">{b.qty} {tt('шт.')} · {stockTotal > 0 ? Math.round(b.qty / stockTotal * 1000) / 10 : 0}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <div className="card">
          <div className="font-bold text-sm mb-3">{tt('Топ прибыльных моделей')}</div>
          {d.top_models.map((m, i) => (
            <div key={i} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0">
              <span className="truncate">{m.brand} {m.series}</span>
              <span className="text-right flex-shrink-0"><span className="text-text3 text-xs mr-2">{m.sold_qty} {tt('шт.')}</span><b className="text-green">{money(m.profit)}</b></span>
            </div>
          ))}
          {!d.top_models.length && <div className="text-text3 text-sm">—</div>}
        </div>

        <div className="card">
          <div className="font-bold text-sm mb-3">{tt('Эффективность менеджеров')}</div>
          {d.by_manager.map(m => (
            <div key={m.id} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0">
              <span className="truncate">{m.full_name}</span>
              <span className="text-right text-xs flex-shrink-0">{m.orders} {tt('шт.')} · <b className="text-text">{money(m.revenue)}</b></span>
            </div>
          ))}
          {!d.by_manager.length && <div className="text-text3 text-sm">{tt('Нет данных за период')}</div>}
        </div>

        <div className="card">
          <div className="font-bold text-sm mb-3">{tt('Способы оплаты')}</div>
          {d.payment_methods.length > 0 ? (
            <ResponsiveContainer width="100%" height={120}>
              <PieChart>
                <Pie data={d.payment_methods} dataKey={isZh ? 'cny' : 'rub'} nameKey="method" innerRadius={32} outerRadius={52} paddingAngle={2}>
                  {d.payment_methods.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text)' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="text-text3 text-sm mb-2">—</div>}
          {d.payment_methods.map((p, i) => (
            <div key={p.method} className="flex justify-between text-xs py-0.5">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{tt(PAYMENT_LABEL[p.method] || p.method)}</span>
              <span>{money(p)}</span>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-border">
            <div><div className="text-[10px] text-text3">{tt('Дебиторская задолженность')}</div><div className="font-bold text-sm text-red">{money(d.receivables)}</div></div>
            <div><div className="text-[10px] text-text3">{tt('Средний срок оплаты')}</div><div className="font-bold text-sm">{d.avg_payment_term_days} {tt('дн.')}</div></div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <div className="card">
          <div className="font-bold text-sm mb-3">{tt('Товары с долгим сроком на складе')}</div>
          {d.slow_stock.map(s => (
            <Link key={s.id} to={`/serials/${s.id}`} className="flex justify-between items-center text-sm py-1.5 border-b border-border last:border-0 hover:text-accent2">
              <span className="truncate">{s.brand} {s.series} <span className="text-text3 text-xs font-mono">({s.serial})</span></span>
              <span className="badge badge-yellow text-[10px] flex-shrink-0">{s.days_on_stock} {tt('дн.')}</span>
            </Link>
          ))}
          {!d.slow_stock.length && <div className="text-text3 text-sm">—</div>}
        </div>

        <div className="card">
          <div className="font-bold text-sm mb-3">{tt('Топ клиентов по обороту')}</div>
          {d.top_clients.map((c, i) => (
            <Link key={c.id} to={`/clients/${c.id}`} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0 hover:text-accent2">
              <span>{['🥇', '🥈', '🥉'][i] || (i + 1)} {c.name}</span>
              <b>{money(c.revenue)}</b>
            </Link>
          ))}
          {!d.top_clients.length && <div className="text-text3 text-sm">—</div>}
        </div>

        <div className="card">
          <div className="font-bold text-sm mb-3">{tt('География продаж')}</div>
          {d.geography.map(g => {
            const max = d.geography[0] ? moneyRaw(d.geography[0].revenue) : 1;
            const pct = max > 0 ? Math.round(moneyRaw(g.revenue) / max * 100) : 0;
            return (
              <div key={g.city} className="mb-2">
                <div className="flex justify-between text-xs mb-1"><span>{g.city}</span><span className="text-text3">{money(g.revenue)}</span></div>
                <div className="h-1.5 bg-bg3 rounded-full overflow-hidden"><div className="h-full bg-accent" style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
          {!d.geography.length && <div className="text-text3 text-sm">—</div>}
        </div>
      </div>

      <div className="card">
        <div className="flex justify-between items-center mb-3">
          <div className="font-bold text-sm flex items-center gap-1.5"><Sparkles size={15} /> {tt('AI Инсайты')}</div>
          <button className="btn btn-secondary btn-sm" onClick={generateInsights} disabled={insightsLoading}>
            {insightsLoading ? tt('Анализирую...') : tt('Обновить')}
          </button>
        </div>
        {insights === null && <div className="text-text3 text-sm">{tt('Нажми «Обновить», чтобы получить инсайты по текущим данным')}</div>}
        {insights?.map((line, i) => <div key={i} className="text-sm py-1.5 border-b border-border last:border-0">{line}</div>)}
      </div>
    </div>
  );
}

function StatMini({ icon, cls, label, value, change }) {
  return (
    <div className="card">
      <div className="flex items-start justify-between mb-2">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${cls}`}>{icon}</div>
      </div>
      <div className="text-[10px] text-text3 uppercase font-bold mb-1">{label}</div>
      <div className="text-sm md:text-base font-black leading-tight break-words">{value}</div>
      {change !== undefined && (
        <div className={`text-[10px] mt-0.5 ${change >= 0 ? 'text-green' : 'text-red'}`}>{change >= 0 ? '+' : ''}{change}% к пред. периоду</div>
      )}
    </div>
  );
}
