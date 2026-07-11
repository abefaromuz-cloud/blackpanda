import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';
import api from '../api/client';
import StatCard from '../components/StatCard';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';
import { formatCompact } from '../utils/format';

const BRAND_COLORS = ['#e11d2e', '#ff5a63', '#e8b84b', '#22c55e', '#c084fc', '#6f6162'];

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [rateData, setRateData] = useState([]);
  const [ratePeriod, setRatePeriod] = useState('30');
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState('');
  const [newTaskDate, setNewTaskDate] = useState('');
  const { user, can } = useAuth();
  const { t } = useLang();

  function load() { api.get('/dashboard').then(r => { setD(r.data); setTasks(r.data.tasks || []); }); }
  useEffect(load, []);
  useEffect(() => { loadRate(); }, [ratePeriod]);

  async function loadRate() {
    const { data } = await api.get('/settings/rate-history');
    const days = ratePeriod === '7' ? 7 : ratePeriod === '365' ? 365 : 30;
    const cutoff = Date.now() - days * 86400000;
    const points = data.filter(r => new Date(r.created_at).getTime() >= cutoff)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map(r => ({ date: new Date(r.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }), rate: Number(r.rate) }));
    setRateData(points);
  }

  async function addTask(e) {
    e.preventDefault();
    if (!newTask.trim()) return;
    await api.post('/tasks', { title: newTask, due_date: newTaskDate || null });
    setNewTask(''); setNewTaskDate('');
    const { data } = await api.get('/tasks'); setTasks(data);
  }
  async function toggleTask(id, done) {
    await api.put(`/tasks/${id}`, { done: !done });
    const { data } = await api.get('/tasks'); setTasks(data);
  }
  async function delTask(id) {
    await api.delete(`/tasks/${id}`);
    const { data } = await api.get('/tasks'); setTasks(data);
  }

  if (!d) return <div className="text-text3">{t('loading')}</div>;

  const chartData = d.monthly.map(m => ({ month: m.month, revenue: Math.round(Number(m.revenue_rub)), profit: Math.round(Number(m.profit_rub)) }));
  const openTasks = tasks.filter(x => !x.done);

  return (
    <div>
      <div className="card mb-5 bg-gradient-to-r from-accent/10 to-transparent">
        <h1 className="text-2xl font-black mb-1">Добро пожаловать, {user?.full_name}! 👋</h1>
        <p className="text-text2 text-sm">
          {openTasks.length > 0 ? <>У вас <b className="text-accent2">{openTasks.length}</b> открытых задач и <b className="text-red">{d.debts.length}</b> должников</>
            : <>Активных задач нет — можно вздохнуть 🐼</>}
        </p>
      </div>

      {can('warehouse', 'edit') && (
        <div className="flex gap-2 flex-wrap mb-5">
          <Link to="/scan" className="card flex items-center gap-2 py-2.5 px-4 hover:border-accent/50"><span className="text-lg">🔍</span><div><div className="text-xs font-bold">Быстрый поиск</div><div className="text-[10px] text-text3">По серийному номеру</div></div></Link>
          <Link to="/warehouse" className="card flex items-center gap-2 py-2.5 px-4 hover:border-accent/50"><span className="text-lg">➕</span><div><div className="text-xs font-bold">Добавить устройство</div><div className="text-[10px] text-text3">Внести новый товар</div></div></Link>
          <Link to="/clients" className="card flex items-center gap-2 py-2.5 px-4 hover:border-accent/50"><span className="text-lg">👤</span><div><div className="text-xs font-bold">Добавить клиента</div><div className="text-[10px] text-text3">Новый клиент в базу</div></div></Link>
          <Link to="/import" className="card flex items-center gap-2 py-2.5 px-4 hover:border-accent/50"><span className="text-lg">📥</span><div><div className="text-xs font-bold">Импорт</div><div className="text-[10px] text-text3">Загрузить список</div></div></Link>
        </div>
      )}

      {/* Задачи + напоминания по должникам */}
      <div className="grid md:grid-cols-2 gap-4 mb-5">
        <div className="card">
          <div className="font-bold text-sm mb-3">📝 Задачи</div>
          <form onSubmit={addTask} className="flex gap-2 mb-3">
            <input className="inp" placeholder="Новая задача..." value={newTask} onChange={e => setNewTask(e.target.value)} />
            <input className="inp w-32" type="date" value={newTaskDate} onChange={e => setNewTaskDate(e.target.value)} />
            <button className="btn btn-primary">+</button>
          </form>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {openTasks.length === 0 && <div className="text-text3 text-xs">Нет активных задач</div>}
            {openTasks.map(task => (
              <div key={task.id} className="flex items-center gap-2 text-sm py-1">
                <input type="checkbox" checked={task.done} onChange={() => toggleTask(task.id, task.done)} />
                <span className="flex-1">{task.title} {task.client_name && <span className="text-text3">· {task.client_name}</span>}</span>
                {task.due_date && <span className="text-xs text-text3">{new Date(task.due_date).toLocaleDateString('ru-RU')}</span>}
                <button onClick={() => delTask(task.id)} className="text-text3 hover:text-red">✕</button>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="font-bold text-sm mb-3">💰 Напомнить должникам</div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {d.debts.length === 0 && <div className="text-text3 text-xs">Долгов нет</div>}
            {d.debts.map(c => (
              <Link key={c.id} to={`/clients/${c.id}`} className="flex justify-between items-center text-sm py-1.5 border-b border-border last:border-0 hover:text-accent2">
                <span>{c.name}</span>
                <span className="flex items-center gap-2"><span className="font-mono text-red">{Math.round(c.debt_rub).toLocaleString('ru-RU')} ₽</span><span className="text-xs text-accent2">Напомнить →</span></span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Основные показатели склада */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <StatCard label={t('inStock')} value={d.stock.in_stock} color="green" />
        <StatCard label={t('inTransit')} value={d.stock.in_transit} color="yellow" />
        <StatCard label={t('reserved')} value={d.stock.reserved} color="accent2" />
        <StatCard label={t('soldTotal')} value={d.stock.sold} />
      </div>

      {/* Специальные статусы: возврат / КНР / восстановленные */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Возврат" value={d.special_statuses.return} sub="Ждут отправки в КНР" color="red" />
        <StatCard label="Отправлены в КНР" value={d.special_statuses.sent_to_cn} sub="Ожидается возвращение" color="yellow" />
        <StatCard label="Склад (восст.)" value={d.special_statuses.refurbished} sub="После ремонта, цена — своя у каждого" color="accent2" />
        <StatCard label="Прибыль за год" value={formatCompact(d.yearly_profit_rub) + ' ₽'} sub={new Date().getFullYear()} color={d.yearly_profit_rub >= 0 ? 'green' : 'red'} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <div className="card lg:col-span-2">
          <div className="font-bold text-sm mb-3">Продажи и прибыль по месяцам</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid stroke="#27272a" vertical={false} />
              <XAxis dataKey="month" stroke="#71717a" fontSize={11} />
              <YAxis stroke="#71717a" fontSize={11} tickFormatter={(v) => formatCompact(v)} />
              <Tooltip contentStyle={{ background: '#1c1c1f', border: '1px solid #27272a', borderRadius: 8, fontSize: 12 }} formatter={(v) => Number(v).toLocaleString('ru-RU') + ' ₽'} />
              <Line type="monotone" dataKey="revenue" name="Продажи" stroke="#ff5a63" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="profit" name="Прибыль" stroke="#22c55e" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <div className="font-bold text-sm mb-3">Топ моделей</div>
          {(!d.top_models || d.top_models.length === 0) && <div className="text-text3 text-sm">—</div>}
          {d.top_models?.map((m, i) => (
            <div key={i} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0">
              <span><b className="text-text3 mr-1">{i + 1}.</b>{m.brand} {m.series}</span>
              <span className="font-mono text-accent2">{m.sold_qty}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <div className="card">
          <div className="flex justify-between items-center mb-3">
            <div className="font-bold text-sm">💱 Курс юаня</div>
            <div className="flex gap-1">
              {['7', '30', '365'].map(p => (
                <button key={p} onClick={() => setRatePeriod(p)} className={`btn btn-xs ${ratePeriod === p ? 'btn-primary' : 'btn-secondary'}`}>
                  {p === '7' ? '7д' : p === '30' ? '30д' : '1г'}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={rateData}>
              <CartesianGrid stroke="#27272a" vertical={false} />
              <XAxis dataKey="date" stroke="#71717a" fontSize={10} />
              <YAxis stroke="#71717a" fontSize={10} domain={['auto', 'auto']} />
              <Tooltip contentStyle={{ background: '#1c1c1f', border: '1px solid #27272a', borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="rate" stroke="#e8b84b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <div className="font-bold text-sm mb-3">Распределение по брендам</div>
          {(!d.by_brand || d.by_brand.length === 0) ? <div className="text-text3 text-sm">—</div> : (
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={d.by_brand} dataKey="qty" nameKey="brand" innerRadius={38} outerRadius={62} paddingAngle={2}>
                  {d.by_brand.map((_, i) => <Cell key={i} fill={BRAND_COLORS[i % BRAND_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1c1c1f', border: '1px solid #27272a', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="card">
          <div className="font-bold text-sm mb-3">⚠️ Заканчивается на складе</div>
          {d.low_stock.length === 0 && <div className="text-text3 text-sm">Всё в порядке</div>}
          {d.low_stock.map(l => (
            <Link key={l.id} to={`/warehouse/${l.id}`} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0 hover:text-accent2">
              <span>{l.brand} {l.series}</span>
              <span className="text-yellow font-mono">{l.in_stock} шт.</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card">
          <div className="font-bold text-sm mb-3">🧾 Последние проданные устройства</div>
          {d.recent_sales.length === 0 && <div className="text-text3 text-sm">—</div>}
          {d.recent_sales.map(s => (
            <div key={s.id} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0">
              <span>{s.client_name || 'Без клиента'} <span className="text-text3">· {(s.items || []).map(it => `${it.brand} ${it.series}`).join(', ')}</span></span>
              <span className="font-mono">{Math.round(s.total_rub).toLocaleString('ru-RU')} ₽</span>
            </div>
          ))}
          <Link to="/sales" className="block text-center text-accent2 text-sm mt-3 hover:underline">Смотреть все устройства →</Link>
        </div>
        <div className="card">
          <div className="font-bold text-sm mb-3">📋 Последние действия</div>
          {d.recent_activity.length === 0 && <div className="text-text3 text-sm">—</div>}
          {d.recent_activity.map(a => (
            <div key={a.id} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0">
              <span>{a.action} <span className="text-text3">· {a.entity_label}</span></span>
              <span className="text-text3 text-xs">{new Date(a.created_at).toLocaleString('ru-RU')}</span>
            </div>
          ))}
          <Link to="/activity-log" className="block text-center text-accent2 text-sm mt-3 hover:underline">Смотреть все действия →</Link>
        </div>
      </div>
    </div>
  );
}
