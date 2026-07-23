import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import StatCard from '../components/StatCard';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';
import { useTT } from '../i18n/useTT';

export default function Finance() {
  const [d, setD] = useState(null);
  const [clients, setClients] = useState([]);
  const [banks, setBanks] = useState([]);
  const { can } = useAuth();
  const { t } = useLang();
  const tt = useTT();
  const canEdit = can('finance', 'edit');

  function load() {
    api.get('/finance').then(r => setD(r.data));
    api.get('/clients').then(r => setClients(r.data));
  }
  useEffect(load, []);
  useEffect(() => { api.get('/bank-accounts').then(r => setBanks(r.data)); }, []);

  if (!d) return <div className="text-text3">{t('loading')}</div>;

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
          <OperationBlock clients={clients} debtors={d.debtors} banks={banks} onDone={load} />
          <DayCloseBlock onDone={load} />
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4 mb-5">
        <div className="card">
          <div className="font-bold text-sm mb-3">💰 {t('debtors')}</div>
          {d.debtors.length === 0 && <div className="text-text3 text-sm">{t('noDebts')}</div>}
          {d.debtors.map(c => (
            <Link key={c.id} to={`/clients/${c.id}`} className="flex justify-between items-center text-sm py-1.5 border-b border-border last:border-0 hover:text-accent2">
              <span>{c.name}</span>
              <span className="flex items-center gap-2 flex-wrap justify-end">
                {Number(c.debt_rub) > 0 && <span className="text-red font-mono text-xs">🇷🇺 {Math.round(c.debt_rub).toLocaleString('ru-RU')} ₽</span>}
                {Number(c.debt_cny) > 0 && <span className="text-red font-mono text-xs">🇨🇳 ¥{Number(c.debt_cny).toLocaleString('ru-RU')}</span>}
              </span>
            </Link>
          ))}
        </div>
        <div className="card">
          <div className="font-bold text-sm mb-3">💱 {t('rate')}: ¥1 = {d.rate} ₽ · {tt("Касса")}: {Math.round(d.cash_balance_rub).toLocaleString('ru-RU')} ₽</div>
          <div className="text-xs text-text3 uppercase font-bold mb-2">{tt("Передано обменникам")}</div>
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
        <div className="font-bold text-sm mb-3">📋 {tt("Последние операции")}</div>
        {d.recentOps.length === 0 && <div className="text-text3 text-sm">—</div>}
        {d.recentOps.map(op => (
          <div key={op.id} className="flex justify-between items-baseline gap-3 text-sm py-1.5 border-b border-border last:border-0">
            <span className="min-w-0 truncate">
              <span className="text-text3">{new Date(op.created_at).toLocaleString('ru-RU')}</span>
              {' — '}
              <span>{op.note} {op.recipient && `· ${op.recipient}`} {op.client_name && `· ${op.client_name}`}</span>
            </span>
            <span className={`font-mono flex-shrink-0 ${op.type === 'in' ? 'text-green' : 'text-red'}`}>{op.type === 'in' ? '+' : '-'}{Math.round(op.amount_rub).toLocaleString('ru-RU')} ₽</span>
          </div>
        ))}
        <Link to="/cash" className="block text-center text-accent2 text-sm mt-3 hover:underline">{tt("Показать всю историю операций")} →</Link>
      </div>
    </div>
  );
}

function OperationBlock({ clients, debtors, banks, onDone }) {
  const tt = useTT();
  const ACTIONS = [
    ['op', tt('Операция (приход/расход/обменник)')],
    ['topup', tt('Пополнить баланс клиента')],
    ['debt', tt('Добавить долг клиенту')],
    ['payoff', tt('Погашение долга')],
  ];
  const [action, setAction] = useState('op');
  const [opType, setOpType] = useState('in');
  const [dest, setDest] = useState('cash');
  const [amount, setAmount] = useState('');
  const [debtCurrency, setDebtCurrency] = useState('rub'); // rub | cny — валюта нового долга
  const [note, setNote] = useState('');
  const [recipient, setRecipient] = useState('');
  const [clientId, setClientId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [msg, setMsg] = useState('');
  const [rate, setRate] = useState(0);
  const [openDebts, setOpenDebts] = useState([]);
  const [payAmounts, setPayAmounts] = useState({});
  const [payBusy, setPayBusy] = useState(false);

  useEffect(() => { api.get('/settings/public-rate').then(r => setRate(r.data.rate)); }, []);

  useEffect(() => {
    if (action === 'payoff' && clientId) {
      api.get(`/clients/${clientId}`).then(r => setOpenDebts(r.data.debts.filter(d => d.status === 'open')));
    } else {
      setOpenDebts([]);
    }
  }, [action, clientId]);

  function reset() { setAmount(''); setNote(''); setRecipient(''); setDueDate(''); setDebtCurrency('rub'); }

  async function submit(e) {
    e.preventDefault();
    setMsg('');
    try {
      if (action === 'op') {
        await api.post('/cash', { type: opType, dest, amount_rub: Number(amount), note, category: opType === 'out' && recipient ? 'exchanger' : 'other', recipient: recipient || null });
      } else if (action === 'topup') {
        if (!clientId) return;
        await api.post(`/clients/${clientId}/balance`, { amount_rub: Number(amount), note: note || tt('Пополнение баланса') });
      } else if (action === 'debt') {
        if (!clientId) return;
        const payload = debtCurrency === 'cny'
          ? { amount_cny: Number(amount), due_date: dueDate || null, note }
          : { amount_rub: Number(amount), due_date: dueDate || null, note };
        await api.post(`/clients/${clientId}/debts`, payload);
      } else {
        return; // payoff обрабатывается отдельными кнопками на каждый долг, не общей кнопкой формы
      }
      setMsg('✅ ' + tt('Готово')); reset(); onDone();
    } catch (e2) {
      setMsg('❌ ' + (e2.response?.data?.error || tt('Ошибка')));
    }
  }

  async function payDebt(debt, amountInput) {
    setPayBusy(true);
    try {
      let amountRub;
      if (debt.amount_cny) {
        const remainingRub = Math.round((Number(debt.amount_cny) - Number(debt.amount_paid_cny)) * rate);
        amountRub = amountInput ? Math.min(Number(amountInput), remainingRub) : remainingRub;
      } else {
        const remaining = Number(debt.amount_rub) - Number(debt.amount_paid_rub);
        amountRub = amountInput ? Math.min(Number(amountInput), remaining) : remaining;
      }
      await api.post(`/clients/${clientId}/debts/${debt.id}/pay`, { amount_rub: amountRub });
      setPayAmounts(a => ({ ...a, [debt.id]: '' }));
      const r = await api.get(`/clients/${clientId}`);
      setOpenDebts(r.data.debts.filter(d => d.status === 'open'));
      setMsg('✅ ' + tt('Готово'));
      onDone();
    } catch (e2) {
      setMsg('❌ ' + (e2.response?.data?.error || tt('Ошибка')));
    } finally { setPayBusy(false); }
  }

  return (
    <form onSubmit={submit} className="card">
      <div className="font-bold text-sm mb-3">💳 {tt("Операция")}</div>
      <select className="inp mb-3" value={action} onChange={e => setAction(e.target.value)}>
        {ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>

      {action === 'op' && (
        <div className="space-y-2 mb-3">
          <select className="inp" value={opType} onChange={e => setOpType(e.target.value)}>
            <option value="in">{tt("Приход")}</option>
            <option value="out">{tt("Расход")}</option>
          </select>
          <select className="inp" value={dest} onChange={e => setDest(e.target.value)}>
            <option value="cash">{tt("Наличные")}</option>
            {banks.map(b => <option key={b.key} value={b.key}>{b.name} ({tt("перевод")})</option>)}
          </select>
          {opType === 'out' && (
            <input className="inp" placeholder={tt("Сдать обменнику (имя — необязательно)")} value={recipient} onChange={e => setRecipient(e.target.value)} />
          )}
        </div>
      )}

      {(action === 'topup' || action === 'debt' || action === 'payoff') && (
        <select className="inp mb-3" value={clientId} onChange={e => setClientId(e.target.value)} required>
          <option value="">— {tt(action === 'payoff' ? "выбери должника" : "выбери клиента")} —</option>
          {(action === 'payoff' ? debtors : clients).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      {action === 'payoff' && debtors.length === 0 && (
        <div className="text-text3 text-xs mb-3">{tt("Должников нет — гасить нечего")}</div>
      )}

      {action === 'debt' && (
        <div className="flex gap-2 mb-3">
          <button type="button" onClick={() => setDebtCurrency('rub')} className={`btn btn-sm flex-1 ${debtCurrency === 'rub' ? 'btn-primary' : 'btn-secondary'}`}>🇷🇺 ₽</button>
          <button type="button" onClick={() => setDebtCurrency('cny')} className={`btn btn-sm flex-1 ${debtCurrency === 'cny' ? 'btn-primary' : 'btn-secondary'}`}>🇨🇳 ¥</button>
        </div>
      )}

      {(action === 'op' || action === 'topup' || action === 'debt') && (
        <input className="inp mb-3" type="number" placeholder={tt("Сумма") + (action === 'debt' && debtCurrency === 'cny' ? ' ¥' : ' ₽')} value={amount} onChange={e => setAmount(e.target.value)} required />
      )}
      {action === 'debt' && (
        <input className="inp mb-3" type="date" placeholder={tt("Срок оплаты")} value={dueDate} onChange={e => setDueDate(e.target.value)} />
      )}
      {(action === 'op' || action === 'topup' || action === 'debt') && (
        <input className="inp mb-3" placeholder={tt("Комментарий")} value={note} onChange={e => setNote(e.target.value)} />
      )}

      {action === 'payoff' && clientId && (
        <div className="mb-3 space-y-2">
          {!openDebts.length && <div className="text-text3 text-sm">{tt('У этого клиента нет открытых долгов')}</div>}
          {openDebts.map(d => {
            const isCny = !!d.amount_cny;
            const remainingRub = isCny ? Math.round((Number(d.amount_cny) - Number(d.amount_paid_cny)) * rate) : Math.round(Number(d.amount_rub) - Number(d.amount_paid_rub));
            const remainingCny = isCny ? (Number(d.amount_cny) - Number(d.amount_paid_cny)) : (remainingRub / rate);
            return (
              <div key={d.id} className="bg-bg3 rounded-xl p-2.5">
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span>{isCny ? '🇨🇳' : '🇷🇺'} {new Date(d.created_at).toLocaleDateString('ru-RU')}</span>
                  <b className="text-red">{isCny ? `¥${remainingCny.toLocaleString('ru-RU')} ≈ ` : ''}{remainingRub.toLocaleString('ru-RU')} ₽</b>
                </div>
                <div className="flex gap-1.5">
                  <input className="inp inp-sm flex-1" type="number" placeholder={tt('Сумма, ₽')} value={payAmounts[d.id] || ''} onChange={e => setPayAmounts(a => ({ ...a, [d.id]: e.target.value }))} />
                  <button type="button" className="btn btn-secondary btn-sm" disabled={!payAmounts[d.id] || payBusy} onClick={() => payDebt(d, payAmounts[d.id])}>{tt('Часть')}</button>
                  <button type="button" className="btn btn-primary btn-sm" disabled={payBusy} onClick={() => payDebt(d, null)}>{tt('Всё')}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {action !== 'payoff' && <button className="btn btn-primary w-full justify-center">{tt("Выполнить")}</button>}
      {msg && <div className="text-sm mt-2">{msg}</div>}
    </form>
  );
}

function DayCloseBlock({ onDone }) {
  const tt = useTT();
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

  if (!summary) return <div className="card text-text3 text-sm">{tt("Загрузка...")}</div>;

  return (
    <form onSubmit={close} className="card">
      <div className="font-bold text-sm mb-3">🔒 {tt("Закрытие дня")}</div>
      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
        <div className="bg-bg3 rounded-lg p-2"><div className="text-xs text-text3">{tt("Приход сегодня")}</div><div className="font-mono text-green font-bold">+{Math.round(summary.income_today).toLocaleString('ru-RU')} ₽</div></div>
        <div className="bg-bg3 rounded-lg p-2"><div className="text-xs text-text3">{tt("Расход сегодня")}</div><div className="font-mono text-red font-bold">-{Math.round(summary.expense_today).toLocaleString('ru-RU')} ₽</div></div>
        <div className="bg-bg3 rounded-lg p-2"><div className="text-xs text-text3">{tt("Продажи сегодня")}</div><div className="font-mono font-bold">{Math.round(summary.sales_today).toLocaleString('ru-RU')} ₽</div></div>
        <div className="bg-bg3 rounded-lg p-2"><div className="text-xs text-text3">{tt("Ожидаемый остаток")}</div><div className="font-mono font-bold">{Math.round(summary.expected_cash_rub).toLocaleString('ru-RU')} ₽</div></div>
      </div>
      <label className="block text-[11px] text-text2 font-bold uppercase mb-1">{tt("Фактический остаток кассы")}</label>
      <input className="inp mb-2" type="number" value={actual} onChange={e => setActual(e.target.value)} />
      <input className="inp mb-3" placeholder={tt("Комментарий (необязательно)")} value={note} onChange={e => setNote(e.target.value)} />
      <button className="btn btn-primary w-full justify-center">{tt("Закрыть день")}</button>
      {result && (
        <div className={`text-sm mt-2 ${Math.abs(result.diff) > 0.5 ? 'text-yellow' : 'text-green'}`}>
          {Math.abs(result.diff) > 0.5 ? `${tt('Расхождение')}: ${result.diff > 0 ? '+' : ''}${Math.round(result.diff).toLocaleString('ru-RU')} ₽ (${tt('скорректировано')})` : 'Касса сходится ✅'}
        </div>
      )}
    </form>
  );
}
