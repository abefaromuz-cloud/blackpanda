import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ShoppingCart, Wallet, AlertTriangle, Wrench, ClipboardList, MessageSquare, Phone, Send, Package } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';

const PERIODS = [
  ['today', 'Сегодня'], ['7d', '7 дней'], ['30d', '30 дней'], ['90d', '90 дней'], ['year', 'Год'],
];

function periodRange(period) {
  const now = new Date();
  const to = now.toISOString();
  let from;
  if (period === 'today') from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  else if (period === '7d') from = new Date(now - 7 * 86400000).toISOString();
  else if (period === '30d') from = new Date(now - 30 * 86400000).toISOString();
  else if (period === '90d') from = new Date(now - 90 * 86400000).toISOString();
  else from = new Date(now.getFullYear(), 0, 1).toISOString();
  return { from, to };
}

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
];

function eventLine(ev) {
  switch (ev.type) {
    case 'sale': return { title: `Продажа: ${(ev.data.items || []).map(it => `${it.brand} ${it.series}`).join(', ') || 'товар'}`, amount: `${Math.round(ev.data.total_rub).toLocaleString('ru-RU')} ₽`, amountCls: 'text-green' };
    case 'balance': return { title: ev.data.note || 'Изменение баланса', amount: `${Number(ev.data.amount_rub) >= 0 ? '+' : ''}${Math.round(ev.data.amount_rub).toLocaleString('ru-RU')} ₽`, amountCls: Number(ev.data.amount_rub) >= 0 ? 'text-green' : 'text-red' };
    case 'debt': return { title: 'Начислен долг', amount: `${Math.round(ev.data.amount_rub).toLocaleString('ru-RU')} ₽`, amountCls: 'text-red' };
    case 'service': return { title: `Сервис: ${ev.data.device_label || 'наш товар'}`, sub: ev.data.issue, amount: ev.data.status === 'done' ? 'Готово' : 'В работе' };
    case 'preorder': return { title: `Предзаказ No.${ev.data.id.slice(-6)}`, amount: ev.data.stage === 'done' ? 'Выполнен' : 'Активен' };
    case 'comment': return { title: 'Комментарий', sub: ev.data.text };
    case 'call': return { title: 'Звонок', sub: ev.data.text };
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
  const canEdit = can('clients', 'edit');

  function load() {
    const { from, to } = periodRange(period);
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

  if (!data) return <div className="text-text3">{t('loading')}</div>;

  const events = data.events.filter(ev => activeFilters.includes(ev.type) &&
    (!search || JSON.stringify(ev.data).toLowerCase().includes(search.toLowerCase())));
  const chartData = data.purchases_by_month.map(m => ({ month: m.month, total: Math.round(Number(m.total)) }));

  return (
    <div>
      <div className="text-text3 text-sm mb-2">
        <Link to="/clients" className="hover:text-text2">{t('clients')}</Link> {'>'} <Link to={`/clients/${id}`} className="hover:text-text2">{data.client.name}</Link> {'>'} История
      </div>
      <h1 className="text-2xl font-black mb-5">История клиента</h1>

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
          <div className="flex gap-2 flex-wrap mb-3">
            {PERIODS.map(([key, label]) => (
              <button key={key} onClick={() => setPeriod(key)} className={`btn btn-sm ${period === key ? 'btn-primary' : 'btn-secondary'}`}>{label}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatBox icon={<ShoppingCart size={16} />} cls="bg-accent2/15 text-accent2" label="Покупок" value={data.stats.purchases} />
            <StatBox icon={<Wallet size={16} />} cls="bg-green/15 text-green" label="Оборот" value={Math.round(data.stats.revenue_rub).toLocaleString('ru-RU') + ' ₽'} />
            <StatBox icon={<Package size={16} />} cls="bg-green/15 text-green" label="Прибыль" value={Math.round(data.stats.profit_rub).toLocaleString('ru-RU') + ' ₽'} />
            <StatBox icon={<Wallet size={16} />} cls="bg-yellow/15 text-yellow" label="Средний чек" value={Math.round(data.stats.avg_check_rub).toLocaleString('ru-RU') + ' ₽'} />
            <StatBox icon={<AlertTriangle size={16} />} cls="bg-red/15 text-red" label="Возвратов" value={data.stats.returns} />
            <StatBox icon={<Wrench size={16} />} cls="bg-purple/15 text-purple" label="Ремонтов" value={data.stats.repairs} />
          </div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-wrap gap-3">
            {FILTERS.map(([key, label]) => (
              <label key={key} className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={activeFilters.includes(key)} onChange={() => toggleFilter(key)} /> {label}
              </label>
            ))}
          </div>
          <input className="inp inp-sm w-48" placeholder="Поиск в истории..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card">
          <div className="font-bold text-sm mb-3">История событий</div>
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {events.length === 0 && <div className="text-text3 text-sm">Нет событий за выбранный период</div>}
            {events.map((ev, i) => {
              const meta = EVENT_META[ev.type] || EVENT_META.comment;
              const line = eventLine(ev);
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
                <option value="comment">Заметка</option><option value="call">Звонок</option><option value="telegram">Telegram</option>
              </select>
              <input className="inp inp-sm flex-1" placeholder="Добавить запись..." value={noteText} onChange={e => setNoteText(e.target.value)} />
              <button className="btn btn-primary btn-sm">+</button>
            </form>
          )}
        </div>

        <div className="space-y-4">
          <div className="card">
            <div className="font-bold text-sm mb-3">Покупки клиента (по месяцам)</div>
            {chartData.length === 0 ? <div className="text-text3 text-sm">—</div> : (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={chartData}>
                  <CartesianGrid stroke="#27272a" vertical={false} />
                  <XAxis dataKey="month" stroke="#71717a" fontSize={10} />
                  <YAxis stroke="#71717a" fontSize={10} />
                  <Tooltip contentStyle={{ background: '#1c1c1f', border: '1px solid #27272a', borderRadius: 8, fontSize: 12 }} formatter={(v) => Number(v).toLocaleString('ru-RU') + ' ₽'} />
                  <Area type="monotone" dataKey="total" stroke="#e11d2e" fill="#e11d2e" fillOpacity={0.25} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="card">
            <div className="font-bold text-sm mb-3">Купленные устройства</div>
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
