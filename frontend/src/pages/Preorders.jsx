import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';
import { useTT } from '../i18n/useTT';
import { useLibraryText } from '../hooks/useLibraryText';

const PREPAY_OPTIONS = [
  [0, '0% (наценка 9%)'],
  [50, '50% (наценка 6%)'],
  [100, '100% (наценка 3%)'],
];
function markupFor(pct) { return pct >= 100 ? 3 : pct >= 50 ? 6 : 9; }

function specsLine(l, tr, tt) {
  return [
    tr('cpu', l.cpu), tr('ram', l.ram), tr('storage', l.storage), tr('gpu', l.gpu),
    tr('color', l.color), l.touch === 'yes' ? tt('сенсорный') : null,
  ].filter(Boolean).join(' ');
}

export default function Preorders() {
  const [list, setList] = useState([]);
  const [clients, setClients] = useState([]);
  const [laptops, setLaptops] = useState([]);
  const [rate, setRate] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [clientId, setClientId] = useState('');
  const [prepaymentPct, setPrepaymentPct] = useState(0);
  const [items, setItems] = useState([{ laptop_id: '', qty: 1, cost_cny: '', logistics_cny: 200 }]);
  const [pickerOpenIdx, setPickerOpenIdx] = useState(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const { can } = useAuth();
  const { t } = useLang();
  const tt = useTT();
  const { tr } = useLibraryText();
  const canEdit = can('preorders', 'edit');

  function load() { api.get('/preorders').then(r => setList(r.data)); }
  useEffect(load, []);
  useEffect(() => {
    api.get('/clients').then(r => setClients(r.data));
    api.get('/laptops').then(r => setLaptops(r.data));
    api.get('/settings/public-rate').then(r => setRate(r.data.rate));
  }, []);

  const pickerResults = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return laptops.slice(0, 30);
    return laptops.filter(l => {
      const hay = [l.brand, l.series, l.cpu, l.ram, l.storage, l.gpu, l.color, l.mfr_item_code].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    }).slice(0, 30);
  }, [laptops, pickerQuery]);

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
                <div className="mb-2">
                  {it.laptop_id && pickerOpenIdx !== i ? (
                    (() => {
                      const picked = laptops.find(l => l.id === it.laptop_id);
                      if (!picked) return null;
                      return (
                        <div className="bg-bg4 rounded-xl p-2.5 flex items-start gap-2.5">
                          <img src={picked.image_url || ''} onError={e => e.target.style.display = 'none'} className="w-11 h-11 object-contain rounded-lg bg-bg3 flex-shrink-0" alt="" />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm">{tr('brand', picked.brand)} {tr('series', picked.series)}</div>
                            <div className="text-xs text-text3">{specsLine(picked, tr, tt)}</div>
                          </div>
                          <button type="button" className="text-text3 hover:text-accent2 text-xs flex-shrink-0" onClick={() => { setPickerOpenIdx(i); setPickerQuery(''); }}>✏️ {tt('Изменить')}</button>
                        </div>
                      );
                    })()
                  ) : (
                    <div>
                      <input
                        className="inp" autoFocus placeholder={tt("Начни вводить бренд, модель или характеристику...")}
                        value={pickerQuery} onChange={e => setPickerQuery(e.target.value)} onFocus={() => setPickerOpenIdx(i)}
                      />
                      {pickerOpenIdx === i && (
                        <div className="mt-2 max-h-64 overflow-y-auto border border-border rounded-xl divide-y divide-border">
                          {pickerResults.map(l => (
                            <button type="button" key={l.id} onClick={() => { updateItem(i, { laptop_id: l.id }); setPickerOpenIdx(null); setPickerQuery(''); }} className="w-full flex items-start gap-2.5 p-2 hover:bg-bg4 text-left">
                              <img src={l.image_url || ''} onError={e => e.target.style.display = 'none'} className="w-10 h-10 object-contain rounded-lg bg-bg4 flex-shrink-0" alt="" />
                              <div className="min-w-0">
                                <div className="font-medium text-sm">{tr('brand', l.brand)} {tr('series', l.series)} {l.is_hot && '🔥'}</div>
                                <div className="text-xs text-text3">{specsLine(l, tr, tt)}</div>
                              </div>
                            </button>
                          ))}
                          {!pickerResults.length && <div className="p-3 text-sm text-text3 text-center">{tt("Ничего не найдено")}</div>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 mb-2">
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
