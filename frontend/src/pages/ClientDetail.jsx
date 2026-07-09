import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';

export default function ClientDetail() {
  const { id } = useParams();
  const [c, setC] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState('');
  const { can } = useAuth();
  const { t } = useLang();
  const canEdit = can('clients', 'edit');

  function load() { api.get(`/clients/${id}`).then(r => setC(r.data)); }
  useEffect(load, [id]);
  if (!c) return <div className="text-text3">{t('loading')}</div>;

  const openDebts = c.debts.filter(d => d.status === 'open');
  const totalDebt = openDebts.reduce((s, d) => s + (Number(d.amount_rub) - Number(d.amount_paid_rub)), 0);

  async function adjustBalance() {
    if (!adjustAmount) return;
    await api.post(`/clients/${id}/balance`, { amount_rub: Number(adjustAmount), note: 'Ручная корректировка' });
    setAdjustAmount(''); load();
  }

  async function resetBalance() {
    const refund = confirm(`${t('resetBalance')}?\n\nOK — ${t('refundCash')}\nОтмена — просто обнулить`);
    await api.post(`/clients/${id}/balance/reset`, { refund_cash: refund });
    load();
  }

  async function payOff() {
    if (!confirm(t('payOffDebt') + '?')) return;
    await api.post(`/clients/${id}/debts/payoff`);
    load();
  }

  async function remind(debtId) {
    const r = await api.post(`/clients/${id}/debts/remind`, { debt_id: debtId });
    alert(r.data.ok ? 'Отправлено ✅' : 'Ошибка: ' + (r.data.error || '—'));
  }

  return (
    <div>
      <Link to="/clients" className="text-text3 text-sm hover:text-text2">← {t('clients')}</Link>
      <h1 className="text-xl font-black mt-2 mb-1">{c.name}</h1>
      <div className="text-text3 text-sm mb-5">{c.phone} {c.telegram && `· ${c.telegram}`}</div>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div className="card">
          <div className="flex justify-between items-center mb-2">
            <div className="font-bold text-sm">💰 {t('balance')}</div>
            <button className="text-xs text-text3 hover:text-accent2" onClick={() => setShowHistory(s => !s)}>{t('balanceHistory')}</button>
          </div>
          <div className={`text-2xl font-black font-mono ${Number(c.balance_rub) > 0 ? 'text-green' : 'text-text'}`}>
            {Math.round(c.balance_rub).toLocaleString('ru-RU')} ₽
          </div>
          {canEdit && (
            <div className="flex gap-2 mt-3">
              <input className="inp" type="number" placeholder="+/- ₽" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} />
              <button className="btn btn-secondary" onClick={adjustBalance}>{t('adjustBalance')}</button>
              {Number(c.balance_rub) !== 0 && <button className="btn btn-danger" onClick={resetBalance}>{t('resetBalance')}</button>}
            </div>
          )}
          {showHistory && (
            <div className="mt-3 max-h-48 overflow-y-auto border-t border-border pt-2">
              {c.balance_history.length === 0 && <div className="text-text3 text-xs">—</div>}
              {c.balance_history.map(h => (
                <div key={h.id} className="flex justify-between text-xs py-1">
                  <span className="text-text3">{h.note}</span>
                  <span className={Number(h.amount_rub) >= 0 ? 'text-green' : 'text-red'}>{Number(h.amount_rub) >= 0 ? '+' : ''}{Math.round(h.amount_rub).toLocaleString('ru-RU')} ₽</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="font-bold text-sm mb-2">⚠️ {t('debt')}</div>
          <div className={`text-2xl font-black font-mono ${totalDebt > 0 ? 'text-red' : 'text-text3'}`}>
            {Math.round(totalDebt).toLocaleString('ru-RU')} ₽
          </div>
          {totalDebt > 0 && canEdit && <button className="btn btn-primary mt-3" onClick={payOff}>✅ {t('payOffDebt')}</button>}
          {openDebts.length > 0 && (
            <div className="mt-3 space-y-1">
              {openDebts.map(d => (
                <div key={d.id} className="flex justify-between items-center text-xs border-t border-border pt-2">
                  <span>{new Date(d.created_at).toLocaleDateString('ru-RU')} {d.due_date && `· до ${new Date(d.due_date).toLocaleDateString('ru-RU')}`}</span>
                  <span className="flex items-center gap-2">
                    <b className="text-red">{Math.round(Number(d.amount_rub) - Number(d.amount_paid_rub)).toLocaleString('ru-RU')} ₽</b>
                    {c.telegram && <button className="text-accent2 hover:underline" onClick={() => remind(d.id)}>✈️ {t('remindDebt')}</button>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <div className="font-bold text-sm mb-3">{t('preorders')}</div>
          {c.preorders.length === 0 && <div className="text-text3 text-sm">—</div>}
          {c.preorders.map(p => (
            <Link key={p.id} to={`/preorders/${p.id}`} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0 hover:text-accent2">
              <span>No.{p.id.slice(-6)}</span>
              <span className={p.stage === 'done' ? 'text-green' : 'text-yellow'}>{p.stage === 'done' ? t('done') : t('active')}</span>
            </Link>
          ))}
        </div>
        <div className="card">
          <div className="font-bold text-sm mb-3">{t('sales')}</div>
          {c.sales.length === 0 && <div className="text-text3 text-sm">—</div>}
          {c.sales.map(s => (
            <div key={s.id} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0">
              <span className="text-text3">{new Date(s.created_at).toLocaleDateString('ru-RU')}</span>
              <span className="font-mono">{Math.round(s.total_rub).toLocaleString('ru-RU')} ₽</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
