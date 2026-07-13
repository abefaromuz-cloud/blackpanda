import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';
import { useTT } from '../i18n/useTT';

const PREPAY_OPTIONS = [
  [0, '0% (наценка 9%)'],
  [50, '50% (наценка 6%)'],
  [100, '100% (наценка 3%)'],
];
function markupFor(pct) { return pct >= 100 ? 3 : pct >= 50 ? 6 : 9; }

export default function Preorders() {
  const [list, setList] = useState([]);
  const [clients, setClients] = useState([]);
  const [laptops, setLaptops] = useState([]);
  const [rate, setRate] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [clientId, setClientId] = useState('');
  const [prepaymentPct, setPrepaymentPct] = useState(0);
  const [items, setItems] = useState([{ laptop_id: '', qty: 1, cost_cny: '', logistics_cny: 200 }]);
  const { can } = useAuth();
  const { t } = useLang();
  const tt = useTT();
  const canEdit = can('preorders', 'edit');

  function load() { api.get('/preorders').then(r => setList(r.data)); }
  useEffect(load, []);
  useEffect(() => {
    api.get('/clients').then(r => setClients(r.data));
    api.get('/laptops').then(r => setLaptops(r.data));
    api.get('/settings/public-rate').then(r => setRate(r.data.rate));
  }, []);

  function updateItem(i, patch) {
    setItems(arr => arr.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  }

  const markup = markupFor(prepaymentPct);
  function unitPriceCny(it) {
    const cost = Number(it.cost_cny) || 0;
    const logistics = Number(it.logistics_cny) || 200;
    return Math.round((cost + logistics) * (1 + markup / 100) * 100) / 100;
  }
  const grandTotalCny = items.reduce((s, it) => s + unitPriceCny(it) * (Number(it.qty) || 1), 0);
  const requiredDepositCny = grandTotalCny * prepaymentPct / 100;

  async function removePreorder(id) {
    if (!confirm(tt('Удалить этот отменённый предзаказ насовсем?'))) return;
    await api.delete(`/preorders/${id}`);
    load();
  }

  async function submit(e) {
    e.preventDefault();
    await api.post('/preorders', { client_id: clientId, prepayment_pct: prepaymentPct, items });
    setShowForm(false); setClientId(''); setPrepaymentPct(0);
    setItems([{ laptop_id: '', qty: 1, cost_cny: '', logistics_cny: 200 }]);
    load();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-2xl font-black">{t('preorders')}</h1>
        {canEdit && <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>+ {t('addPreorder')}</button>}
      </div>

      {showForm && canEdit && (
        <form onSubmit={submit} className="card mb-5">
          <div className="mb-3">
            <label className="block text-[11px] text-text2 font-bold uppercase mb-1">{t('client')}</label>
            <select className="inp" value={clientId} onChange={e => setClientId(e.target.value)} required>
              <option value="">— {t('client')} —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-[11px] text-text2 font-bold uppercase mb-1">{tt('Предоплата клиента')}</label>
            <div className="flex gap-2 flex-wrap">
              {PREPAY_OPTIONS.map(([pct, label]) => (
                <button key={pct} type="button" onClick={() => setPrepaymentPct(pct)}
                  className={`btn btn-sm ${prepaymentPct === pct ? 'btn-primary' : 'btn-secondary'}`}>{tt(label)}</button>
              ))}
            </div>
          </div>

          <div className="text-xs font-bold text-text3 uppercase mb-2">{tt('Позиции')}</div>
          {items.map((it, i) => {
            const cost = Number(it.cost_cny) || 0;
            const logistics = Number(it.logistics_cny) || 200;
            const unit = unitPriceCny(it);
            const unitRub = Math.round(unit * rate);
            return (
              <div key={i} className="bg-bg3 rounded-xl p-3 mb-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                  <select className="inp" value={it.laptop_id} onChange={e => updateItem(i, { laptop_id: e.target.value })} required>
                    <option value="">{t('model')}</option>
                    {laptops.map(l => <option key={l.id} value={l.id}>{l.brand} {l.series}</option>)}
                  </select>
                  <input className="inp" type="number" min="1" placeholder={t('qty')} value={it.qty} onChange={e => updateItem(i, { qty: e.target.value })} />
                  <input className="inp" type="number" placeholder={t('costPrice') + ' ¥'} value={it.cost_cny} onChange={e => updateItem(i, { cost_cny: e.target.value })} />
                  <select className="inp" value={it.logistics_cny} onChange={e => updateItem(i, { logistics_cny: Number(e.target.value) })}>
                    <option value={200}>{tt('Логистика')} ¥200</option>
                    <option value={300}>{tt('Логистика')} ¥300</option>
                  </select>
                </div>
                {(cost > 0) && (
                  <div className="text-xs text-text3">
                    ¥{cost} + {tt('логистика')} ¥{logistics} + {markup}% ({tt('наценка от предоплаты')}) = <b className="text-text">¥{unit}</b> ≈ {unitRub.toLocaleString('ru-RU')} ₽
                    {Number(it.qty) > 1 && <span> × {it.qty} = <b className="text-accent2">¥{Math.round(unit * it.qty * 100) / 100}</b></span>}
                  </div>
                )}
                {items.length > 1 && (
                  <button type="button" className="text-red text-xs mt-1" onClick={() => setItems(a => a.filter((_, idx) => idx !== i))}>✕ {tt('убрать позицию')}</button>
                )}
              </div>
            );
          })}
          <button type="button" className="btn btn-secondary btn-sm mb-4" onClick={() => setItems(a => [...a, { laptop_id: '', qty: 1, cost_cny: '', logistics_cny: 200 }])}>{t('addItem')}</button>

          <div className="bg-bg3 rounded-xl p-3 mb-4">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-text3">{tt('Итого по заказу')}</span>
              <span className="font-bold">¥{Math.round(grandTotalCny * 100) / 100} ≈ {Math.round(grandTotalCny * rate).toLocaleString('ru-RU')} ₽</span>
            </div>
            {prepaymentPct > 0 && (
              <div className="flex justify-between text-sm text-accent2">
                <span>{tt('Требуется предоплата сейчас')} ({prepaymentPct}%)</span>
                <span className="font-bold">¥{Math.round(requiredDepositCny * 100) / 100} ≈ {Math.round(requiredDepositCny * rate).toLocaleString('ru-RU')} ₽</span>
              </div>
            )}
            <div className="text-[10px] text-text3 mt-1">{tt('Остаток фиксируется в юанях — при оплате пересчитывается по курсу на день оплаты')}</div>
          </div>

          <button className="btn btn-primary">{t('createPreorder')}</button>
        </form>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {list.map(p => (
          <div key={p.id} className={`card hover:border-accent/60 hover:shadow-glow relative border-l-4 ${
            p.stage === 'done' ? 'border-l-green' : p.stage === 'cancelled' ? 'border-l-red' : 'border-l-yellow'
          }`}>
            <Link to={`/preorders/${p.id}`} className="block">
              <div className="flex justify-between items-start mb-2">
                <span className="font-bold">{p.client_name}</span>
                <span className={`badge ${p.stage === 'done' ? 'badge-green' : p.stage === 'cancelled' ? 'badge-red' : 'badge-yellow'}`}>
                  {p.stage === 'done' ? t('done') : p.stage === 'cancelled' ? tt('Отменён') : `🟡 ${t('active')}`}
                </span>
              </div>
              <div className="text-xs text-text3">No.{p.id.slice(-6)} · {p.items.length} {tt('поз.')}</div>
              <div className="text-xs text-text3 mt-1">¥{Number(p.total_cny).toLocaleString('ru-RU')} · {tt('оплачено')} ¥{Number(p.paid_cny).toLocaleString('ru-RU')}</div>
            </Link>
            {p.stage === 'cancelled' && canEdit && (
              <button onClick={() => removePreorder(p.id)} className="text-red text-xs hover:underline mt-2">🗑️ {tt('Удалить')}</button>
            )}
          </div>
        ))}
        {!list.length && <div className="text-text3 text-sm">—</div>}
      </div>
    </div>
  );
}
