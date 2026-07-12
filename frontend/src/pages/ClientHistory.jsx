import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ShoppingCart, Wallet, AlertTriangle, Wrench, ClipboardList, MessageSquare, Phone, Send, Package } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { exportToExcel, exportToPdf } from '../utils/export';
import { zhDict } from '../i18n/zhDict';
import { useLang } from '../i18n/LangContext';
import { useTT } from '../i18n/useTT';
import PeriodSelector, { periodToRange } from '../components/PeriodSelector';

const EVENT_META = {
  sale: { Icon: ShoppingCart, cls: 'bg-green/15 text-green' },
  balance: { Icon: Wallet, cls: 'bg-blue-500/15 text-blue-400' },
  debt: { Icon: AlertTriangle, cls: 'bg-red/15 text-red' },
  service: { Icon: Wrench, cls: 'bg-yellow/15 text-yellow' },
  preorder: { Icon: ClipboardList, cls: 'bg-purple/15 text-purple' },
  comment: { Icon: MessageSquare, cls: 'bg-accent/15 text-accent2' },
  call: { Icon: Phone, cls: 'bg-green/15 text-green' },
  telegram: { Icon: Send, cls: 'bg-blue-500/15 text-blue-400' },
};

const FILTERS = [
  ['sale', 'Покупки'], ['balance', 'Пополнение'], ['debt', 'Долги'], ['service', 'Сервис'],
  ['preorder', 'Предзаказы'], ['telegram', 'Telegram'], ['call', 'Звонки'], ['comment', 'Комментарии'],
]; // подписи переводятся через tt() в месте рендера

function eventLine(ev, tt) {
  switch (ev.type) {
    case 'sale': return { title: `${tt('Продажа')}: ${(ev.data.items || []).map(it => `${it.brand} ${it.series}`).join(', ') || tt('товар')}`, amount: `${Math.round(ev.data.total_rub).toLocaleString('ru-RU')} ₽`, amountCls: 'text-green' };
    case 'balance': return { title: ev.data.note || tt('Изменение баланса'), amount: `${Number(ev.data.amount_rub) >= 0 ? '+' : ''}${Math.round(ev.data.amount_rub).toLocaleString('ru-RU')} ₽`, amountCls: Number(ev.data.amount_rub) >= 0 ? 'text-green' : 'text-red' };
    case 'debt': return { title: tt('Начислен долг'), amount: `${Math.round(ev.data.amount_rub).toLocaleString('ru-RU')} ₽`, amountCls: 'text-red' };
    case 'service': return { title: `${tt('Сервис')}: ${ev.data.device_label || tt('наш товар')}`, sub: ev.data.issue, amount: ev.data.status === 'done' ? tt('Готово') : tt('В работе') };
    case 'preorder': return { title: `${tt('Предзаказ')} No.${ev.data.id.slice(-6)}`, amount: ev.data.stage === 'done' ? tt('Выполнен') : tt('Активен') };
    case 'comment': return { title: tt('Комментарий'), sub: ev.data.text };
    case 'call': return { title: tt('Звонок'), sub: ev.data.text };
    case 'telegram': return { title: 'Telegram', sub: ev.data.text };
    default: return { title: ev.type };
  }
}

export default function ClientHistory() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState('year');
  const [activeFilters, setActiveFilters] = useState(FILTERS.map(f => f[0]));
  const [search, setSearch] = useState('');
  const [noteText, setNoteText] = useState('');
  const [noteType, setNoteType] = useState('comment');
  const { can } = useAuth();
  const { t } = useLang();
  const tt = useTT();
  const canEdit = can('clients', 'edit');

  function load() {
    const { from, to } = periodToRange(period, data?.client?.created_at);
    api.get(`/clients/${id}/history`, { params: { from, to } }).then(r => setData(r.data));
  }
  useEffect(load, [id, period]);

  async function addNote(e) {
    e.preventDefault();
    if (!noteText.trim()) return;
    await api.post(`/clients/${id}/notes`, { type: noteType, text: noteText });
    setNoteText(''); load();
  }

  function toggleFilter(key) {
    setActiveFilters(f => f.includes(key) ? f.filter(x => x !== key) : [...f, key]);
  }

  const EXPORT_COLUMNS = [
    { key: 'date', label: 'Дата', labelZh: '日期' },
    { key: 'serial', label: 'Серийник', labelZh: zhDict['Серийник'] },
    { key: 'model', label: 'Модель', labelZh: zhDict['Модель'] },
    { key: 'cpu', label: 'CPU', labelZh: '处理器' }, { key: 'ram', label: 'RAM', labelZh: '内存' }, { key: 'storage', label: 'Накопитель', labelZh: zhDict['Накопитель'] },
    { key: 'warranty', label: 'Гарантия (мес.)', labelZh: zhDict['Гарантия (мес.)'] },
    { key: 'total_cny', label: 'Цена ¥', labelZh: '价格 ¥', numeric: true },
    { key: 'total_rub', label: 'Цена ₽', labelZh: '价格 ₽', numeric: true },
  ];

  function buildExportRows() {
    return (data?.devices || []).map(d => ({
      date: d.sale_date ? new Date(d.sale_date).toLocaleDateString('ru-RU') : '—',
      serial: d.serial, model: `${d.brand} ${d.series}`,
      cpu: d.cpu || '', ram: d.ram || '', storage: d.storage || '',
      warranty: d.warranty_months, total_cny: Number(d.total_cny).toFixed(0),
      total_rub: Math.round(Number(d.total_cny) * Number(d.rate)),
    }));
  }

  function doExportExcel() {
    const rows = buildExportRows();
    const totalRub = rows.reduce((s, r) => s + Number(r.total_rub), 0);
    exportToExcel({
      filename: `BlackPanda_${data.client.name}_history.xls`,
      sheetName: tt('История'),
      title: tt('История клиента') + ' — ' + data.client.name,
      columns: EXPORT_COLUMNS,
      rows,
      footerRow: ['', '', '', '', '', '', '', tt('ИТОГО'), Math.round(totalRub).toLocaleString('ru-RU')],
    });
  }

  function doExportPdf() {
    const rows = buildExportRows();
    const totalRub = rows.reduce((s, r) => s + Number(r.total_rub), 0);
    exportToPdf({
      title: `${tt('История клиента')}: ${data.client.name}`,
      subtitle: data.client.telegram || data.client.phone || '',
      columns: EXPORT_COLUMNS,
      rows,
      footerRow: ['', '', '', '', '', '', '', tt('ИТОГО'), Math.round(totalRub).toLocaleString('ru-RU')],
    });
  }

  if (!data) return <div className="text-text3">{t('loading')}</div>;

  const events = data.events.filter(ev => activeFilters.includes(ev.type) &&
    (!search || JSON.stringify(ev.data).toLowerCase().includes(search.toLowerCase())));
  const chartData = data.purchases_by_month.map(m => ({ month: m.month, total: Math.round(Number(m.total)) }));

  return (
    <div>
      <div className="text-text3 text-sm mb-2">
        <Link to="/clients" className="hover:text-text2">{t('clients')}</Link> {'>'} <Link to={`/clients/${id}`} className="hover:text-text2">{data.client.name}</Link> {'>'} История
      </div>
      <div className="flex justify-between items-center flex-wrap gap-2 mb-5">
        <h1 className="text-2xl font-black">{tt("История клиента")}</h1>
        <div className="flex gap-2">
          <button className="btn btn-secondary btn-sm" onClick={doExportExcel}>📊 Excel</button>
          <button className="btn btn-secondary btn-sm" onClick={doExportPdf}>🖨️ PDF</button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[220px_1fr] gap-4 mb-4">
        <div className="card">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-14 h-14 rounded-full bg-bg3 border border-border flex items-center justify-center overflow-hidden flex-shrink-0">
              {data.client.avatar_url ? <img src={data.client.avatar_url} className="w-full h-full object-cover" alt="" /> : <span className="text-lg font-bold text-text3">{data.client.name?.[0]}</span>}
            </div>
            <div>
              <div className="font-bold flex items-center gap-1">{data.client.name} {data.client.category === 'vip' && <span className="text-yellow">★ VIP</span>}</div>
            </div>
          </div>
          {data.client.telegram && <div className="text-xs text-text3 mb-1">✈️ {data.client.telegram}</div>}
          {data.client.phone && <div className="text-xs text-text3 mb-1">📞 {data.client.phone}</div>}
          {data.client.city && <div className="text-xs text-text3">📍 {data.client.city}</div>}
        </div>

        <div>
          <div className="mb-3">
            <PeriodSelector value={period} onChange={setPeriod} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatBox icon={<ShoppingCart size={16} />} cls="bg-accent2/15 text-accent2" label={tt("Покупок")} value={data.stats.purchases} />
            <StatBox icon={<Wallet size={16} />} cls="bg-green/15 text-green" label={tt("Оборот")} value={Math.round(data.stats.revenue_rub).toLocaleString('ru-RU') + ' ₽'} />
            <StatBox icon={<Package size={16} />} cls="bg-green/15 text-green" label={tt("Прибыль")} value={Math.round(data.stats.profit_rub).toLocaleString('ru-RU') + ' ₽'} />
            <StatBox icon={<Wallet size={16} />} cls="bg-yellow/15 text-yellow" label={tt("Средний чек")} value={Math.round(data.stats.avg_check_rub).toLocaleString('ru-RU') + ' ₽'} />
            <StatBox icon={<AlertTriangle size={16} />} cls="bg-red/15 text-red" label={tt("Возвратов")} value={data.stats.returns} />
            <StatBox icon={<Wrench size={16} />} cls="bg-purple/15 text-purple" label={tt("Ремонтов")} value={data.stats.repairs} />
          </div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-wrap gap-3">
            {FILTERS.map(([key, label]) => (
              <label key={key} className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={activeFilters.includes(key)} onChange={() => toggleFilter(key)} /> {tt(label)}
              </label>
            ))}
          </div>
          <input className="inp inp-sm w-48" placeholder={tt("Поиск в истории...")} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card">
          <div className="font-bold text-sm mb-3">{tt("История событий")}</div>
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {events.length === 0 && <div className="text-text3 text-sm">{tt("Нет событий за выбранный период")}</div>}
            {events.map((ev, i) => {
              const meta = EVENT_META[ev.type] || EVENT_META.comment;
              const line = eventLine(ev, tt);
              return (
                <div key={i} className="flex gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.cls}`}><meta.Icon size={15} /></div>
                  <div className="flex-1 min-w-0 pb-3 border-b border-border">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{line.title}</div>
                        {line.sub && <div className="text-xs text-text3 truncate">{line.sub}</div>}
                      </div>
                      {line.amount && <div className={`text-sm font-mono flex-shrink-0 ${line.amountCls || ''}`}>{line.amount}</div>}
                    </div>
                    <div className="text-[10px] text-text3 mt-1">{new Date(ev.date).toLocaleString('ru-RU')}</div>
                  </div>
                </div>
              );
            })}
          </div>
          {canEdit && (
            <form onSubmit={addNote} className="flex gap-2 mt-3 pt-3 border-t border-border">
              <select className="inp inp-sm w-28" value={noteType} onChange={e => setNoteType(e.target.value)}>
                <option value="comment">{tt("Заметка")}</option><option value="call">{tt("Звонок")}</option><option value="telegram">Telegram</option>
              </select>
              <input className="inp inp-sm flex-1" placeholder={tt("Добавить запись...")} value={noteText} onChange={e => setNoteText(e.target.value)} />
              <button className="btn btn-primary btn-sm">+</button>
            </form>
          )}
        </div>

        <div className="space-y-4">
          <div className="card">
            <div className="font-bold text-sm mb-3">{tt("Покупки клиента (по месяцам)")}</div>
            {chartData.length === 0 ? <div className="text-text3 text-sm">—</div> : (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={chartData}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" stroke="var(--text3)" fontSize={10} />
                  <YAxis stroke="var(--text3)" fontSize={10} />
                  <Tooltip contentStyle={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text)' }} formatter={(v) => Number(v).toLocaleString('ru-RU') + ' ₽'} />
                  <Area type="monotone" dataKey="total" stroke="#e11d2e" fill="#e11d2e" fillOpacity={0.25} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="card">
            <div className="font-bold text-sm mb-3">{tt("Купленные устройства")}</div>
            {data.devices.length === 0 && <div className="text-text3 text-sm">—</div>}
            <div className="space-y-2">
              {data.devices.map(d => (
                <Link key={d.id} to={`/serials/${d.id}`} className="flex justify-between items-center py-2 border-b border-border last:border-0 hover:text-accent2">
                  <div>
                    <div className="text-sm font-medium">{d.brand} {d.series}</div>
                    <div className="text-xs text-text3 font-mono">SN: {d.serial}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-mono text-green">{Math.round(Number(d.total_cny) * Number(d.rate)).toLocaleString('ru-RU')} ₽</div>
                    <div className="text-[10px] text-text3">{d.sale_date ? new Date(d.sale_date).toLocaleDateString('ru-RU') : '—'}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBox({ icon, cls, label, value }) {
  return (
    <div className="card flex items-center gap-2 py-2.5">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cls}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-sm font-bold truncate">{value}</div>
        <div className="text-[10px] text-text3">{label}</div>
      </div>
    </div>
  );
}
