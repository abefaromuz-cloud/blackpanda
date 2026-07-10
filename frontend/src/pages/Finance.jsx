import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api from '../api/client';
import StatCard from '../components/StatCard';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';

const catLabelKey = { purchase: 'purchase', rent: 'rent', salary: 'salaryExp', logistics: 'logistics', marketing: 'marketing', other: 'other' };

const ACTIONS = [
  ['op', 'Операция (приход/расход/обменник)'],
  ['topup', 'Пополнить баланс клиента'],
  ['debt', 'Добавить долг клиенту'],
  ['payoff', 'Погашение долга'],
];

export default function Finance() {
  const [d, setD] = useState(null);
  const [clients, setClients] = useState([]);
  const [banks, setBanks] = useState([]);
  const { can } = useAuth();
  const { t } = useLang();
  const canEdit = can('finance', 'edit');

  function load() {
    api.get('/finance').then(r => setD(r.data));
    api.get('/clients').then(r => setClients(r.data));
  }
  useEffect(load, []);
  useEffect(() => { api.get('/bank-accounts').then(r => setBanks(r.data)); }, []);

  if (!d) return <div className="text-text3">{t('loading')}</div>;

  const chartData = d.monthly.map(m => ({ month: m.month, revenue: Math.round(Number(m.revenue_rub)), cost: Math.round(Number(m.cost_rub)) }));

  return (
    <div>
      <h1 className="text-2xl font-black mb-6">{t('finance')}</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label={t('revenue')} value={Math.round(d.revenue).toLocaleString('ru-RU') + ' ₽'} />
        <StatCard label={t('grossProfit')} value={Math.round(d.grossProfit).toLocaleString('ru-RU') + ' ₽'} color="green" />
        <StatCard label={t('expenses')} value={Math.round(d.expenses).toLocaleString('ru-RU') + ' ₽'} color="red" />
        <StatCard label={t('netProfit')} value={Math.round(d.netProfit).toLocaleString('ru-RU') + ' ₽'} color={d.netProfit >= 0 ? 'green' : 'red'} />
      </div>

      {canEdit && (
        <div className="grid md:grid-cols-2 gap-4 mb-5">
          <OperationBlock clients={clients} banks={banks} onDone={load} />
          <DayCloseBlock onDone={load} />
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4 mb-5">
        <div className="card lg:col-span-2">
          <div className="font-bold text-sm mb-3">{t('revenue')} / {t('finance')} (12 мес.)</div>
          {chartData.length === 0 ? <div className="text-text3 text-sm">—</div> : (
            <ResponsiveContainer width="100%" height={200}>
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

      <div className="grid md:grid-cols-2 gap-4 mb-5">
        <div className="card">
          <div className="font-bold text-sm mb-3">💰 {t('debtors')}</div>
          {d.debtors.length === 0 && <div className="text-text3 text-sm">{t('noDebts')}</div>}
          {d.debtors.map(c => (
            <Link key={c.id} to={`/clients/${c.id}`} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0 hover:text-accent2">
              <span>{c.name}</span>
              <span className="text-red font-mono">{Math.round(c.debt_rub).toLocaleString('ru-RU')} ₽</span>
            </Link>
          ))}
        </div>
        <div className="card">
          <div className="font-bold text-sm mb-3">💱 {t('rate')}: ¥1 = {d.rate} ₽ · Касса: {Math.round(d.cash_balance_rub).toLocaleString('ru-RU')} ₽</div>
          <div className="text-xs text-text3 uppercase font-bold mb-2">Передано обменникам</div>
          {d.exchangers.length === 0 && <div className="text-text3 text-sm">—</div>}
          {d.exchangers.map((e, i) => (
            <div key={i} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0">
              <span>{e.recipient}</span>
              <span className="font-mono">{Math.round(e.total).toLocaleString('ru-RU')} ₽</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="font-bold text-sm mb-3">📋 Последние операции</div>
        {d.recentOps.length === 0 && <div className="text-text3 text-sm">—</div>}
        {d.recentOps.map(op => (
          <div key={op.id} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0">
            <span className="text-text3">{new Date(op.created_at).toLocaleString('ru-RU')}</span>
            <span>{op.note} {op.recipient && `· ${op.recipient}`} {op.client_name && `· ${op.client_name}`}</span>
            <span className={`font-mono ${op.type === 'in' ? 'text-green' : 'text-red'}`}>{op.type === 'in' ? '+' : '-'}{Math.round(op.amount_rub).toLocaleString('ru-RU')} ₽</span>
          </div>
        ))}
        <Link to="/cash" className="block text-center text-accent2 text-sm mt-3 hover:underline">Показать всю историю операций →</Link>
      </div>
    </div>
  );
}

function OperationBlock({ clients, banks, onDone }) {
  const [action, setAction] = useState('op');
  const [opType, setOpType] = useState('in');
  const [dest, setDest] = useState('cash');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [recipient, setRecipient] = useState('');
  const [clientId, setClientId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [msg, setMsg] = useState('');

  function reset() { setAmount(''); setNote(''); setRecipient(''); setDueDate(''); }

  async function submit(e) {
    e.preventDefault();
    setMsg('');
    try {
      if (action === 'op') {
        await api.post('/cash', { type: opType, dest, amount_rub: Number(amount), note, category: opType === 'out' && recipient ? 'exchanger' : 'other', recipient: recipient || null });
      } else if (action === 'topup') {
        if (!clientId) return;
        await api.post(`/clients/${clientId}/balance`, { amount_rub: Number(amount), note: note || 'Пополнение баланса' });
      } else if (action === 'debt') {
        if (!clientId) return;
        await api.post(`/clients/${clientId}/debts`, { amount_rub: Number(amount), due_date: dueDate || null, note });
      } else if (action === 'payoff') {
        if (!clientId) return;
        await api.post(`/clients/${clientId}/debts/payoff`);
      }
      setMsg('✅ Готово'); reset(); onDone();
    } catch (e2) {
      setMsg('❌ ' + (e2.response?.data?.error || 'Ошибка'));
    }
  }

  return (
    <form onSubmit={submit} className="card">
      <div className="font-bold text-sm mb-3">💳 Операция</div>
      <select className="inp mb-3" value={action} onChange={e => setAction(e.target.value)}>
        {ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>

      {action === 'op' && (
        <div className="space-y-2 mb-3">
          <select className="inp" value={opType} onChange={e => setOpType(e.target.value)}>
            <option value="in">Приход</option>
            <option value="out">Расход</option>
          </select>
          <select className="inp" value={dest} onChange={e => setDest(e.target.value)}>
            <option value="cash">Наличные</option>
            {banks.map(b => <option key={b.key} value={b.key}>{b.name} (перевод)</option>)}
          </select>
          {opType === 'out' && (
            <input className="inp" placeholder="Сдать обменнику (имя — необязательно)" value={recipient} onChange={e => setRecipient(e.target.value)} />
          )}
        </div>
      )}

      {(action === 'topup' || action === 'debt' || action === 'payoff') && (
        <select className="inp mb-3" value={clientId} onChange={e => setClientId(e.target.value)} required>
          <option value="">— выбери клиента —</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}

      {action !== 'payoff' && (
        <input className="inp mb-3" type="number" placeholder="Сумма ₽" value={amount} onChange={e => setAmount(e.target.value)} required />
      )}
      {action === 'debt' && (
        <input className="inp mb-3" type="date" placeholder="Срок оплаты" value={dueDate} onChange={e => setDueDate(e.target.value)} />
      )}
      {action !== 'payoff' && (
        <input className="inp mb-3" placeholder="Комментарий" value={note} onChange={e => setNote(e.target.value)} />
      )}

      <button className="btn btn-primary w-full justify-center">Выполнить</button>
      {msg && <div className="text-sm mt-2">{msg}</div>}
    </form>
  );
}

function DayCloseBlock({ onDone }) {
  const [summary, setSummary] = useState(null);
  const [actual, setActual] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState(null);

  function load() { api.get('/finance/day-summary').then(r => { setSummary(r.data); setActual(r.data.expected_cash_rub); }); }
  useEffect(load, []);

  async function close(e) {
    e.preventDefault();
    const { data } = await api.post('/finance/day-close', { actual_cash_rub: Number(actual), note });
    setResult(data); setNote(''); onDone(); load();
  }

  if (!summary) return <div className="card text-text3 text-sm">Загрузка...</div>;

  return (
    <form onSubmit={close} className="card">
      <div className="font-bold text-sm mb-3">🔒 Закрытие дня</div>
      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
        <div className="bg-bg3 rounded-lg p-2"><div className="text-xs text-text3">Приход сегодня</div><div className="font-mono text-green font-bold">+{Math.round(summary.income_today).toLocaleString('ru-RU')} ₽</div></div>
        <div className="bg-bg3 rounded-lg p-2"><div className="text-xs text-text3">Расход сегодня</div><div className="font-mono text-red font-bold">-{Math.round(summary.expense_today).toLocaleString('ru-RU')} ₽</div></div>
        <div className="bg-bg3 rounded-lg p-2"><div className="text-xs text-text3">Продажи сегодня</div><div className="font-mono font-bold">{Math.round(summary.sales_today).toLocaleString('ru-RU')} ₽</div></div>
        <div className="bg-bg3 rounded-lg p-2"><div className="text-xs text-text3">Ожидаемый остаток</div><div className="font-mono font-bold">{Math.round(summary.expected_cash_rub).toLocaleString('ru-RU')} ₽</div></div>
      </div>
      <label className="block text-[11px] text-text2 font-bold uppercase mb-1">Фактический остаток кассы</label>
      <input className="inp mb-2" type="number" value={actual} onChange={e => setActual(e.target.value)} />
      <input className="inp mb-3" placeholder="Комментарий (необязательно)" value={note} onChange={e => setNote(e.target.value)} />
      <button className="btn btn-primary w-full justify-center">Закрыть день</button>
      {result && (
        <div className={`text-sm mt-2 ${Math.abs(result.diff) > 0.5 ? 'text-yellow' : 'text-green'}`}>
          {Math.abs(result.diff) > 0.5 ? `Расхождение: ${result.diff > 0 ? '+' : ''}${Math.round(result.diff).toLocaleString('ru-RU')} ₽ (скорректировано)` : 'Касса сходится ✅'}
        </div>
      )}
    </form>
  );
}
