import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import BarcodeScannerModal from '../components/BarcodeScannerModal';
import { printReceipt } from '../utils/print';
import { beep } from '../utils/sound';
import { useLang } from '../i18n/LangContext';
import { useTT } from '../i18n/useTT';

export default function Scan() {
  const scanInputRef = useRef(null);
  // Автофокус — только на ПК (≥1024px). На мобильном не фокусируем сами, чтобы не выскакивала
  // клавиатура и не зумило страницу сразу при входе в раздел — неудобно, если человек ещё
  // просто хочет осмотреться.
  useEffect(() => {
    if (window.innerWidth >= 1024 && scanInputRef.current) scanInputRef.current.focus();
  }, []);
  const { t } = useLang();
  const tt = useTT();
  const [step, setStep] = useState(1);
  const [scanInput, setScanInput] = useState('');
  const [scanned, setScanned] = useState([]); // {serial, status: 'ok'|'notfound'|'sold', laptop}
  const [showCamera, setShowCamera] = useState(false);
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');
  const [note, setNote] = useState('');
  const [priceOverrides, setPriceOverrides] = useState({});
  const [discountRub, setDiscountRub] = useState(0);
  const [rate, setRate] = useState(0);
  const [paymentMode, setPaymentMode] = useState('full');
  const [payDest, setPayDest] = useState('cash');
  const [splitCash, setSplitCash] = useState(0);
  const [splitBank, setSplitBank] = useState(0);
  const [bankDest, setBankDest] = useState('sber');
  const [paidNowRub, setPaidNowRub] = useState(0);
  const [dueDate, setDueDate] = useState('');
  const [banks, setBanks] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/clients').then(r => setClients(r.data));
    api.get('/settings/public-rate').then(r => setRate(r.data.rate));
    api.get('/bank-accounts').then(r => setBanks(r.data));
  }, []);

  // Предзаполнение из карточки модели (кнопка "Продать выбранные")
  useEffect(() => {
    const raw = sessionStorage.getItem('bp_scan_prefill');
    if (raw) {
      sessionStorage.removeItem('bp_scan_prefill');
      try {
        const sns = JSON.parse(raw);
        sns.forEach(sn => addSerial(sn));
        setStep(1);
      } catch (e) {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Предзаполнение клиента из его карточки (кнопка "Новая продажа")
  useEffect(() => {
    const cid = sessionStorage.getItem('bp_scan_client');
    if (cid) {
      sessionStorage.removeItem('bp_scan_client');
      setClientId(cid);
    }
  }, []);

  async function addSerial(sn) {
    const s = sn.trim();
    if (!s || scanned.some(x => x.serial === s)) { setScanInput(''); return; }
    try {
      const { data } = await api.get(`/serials/lookup/${encodeURIComponent(s)}`);
      if (data.bucket === 'instock' || data.bucket === 'reserved') {
        beep(true);
        setScanned(a => [...a, { serial: s, status: 'ok', id: data.id, laptop_id: data.laptop_id, brand: data.brand, series: data.series }]);
      } else {
        beep(false);
        setScanned(a => [...a, { serial: s, status: 'sold', id: data.id }]);
      }
    } catch {
      beep(false);
      setScanned(a => [...a, { serial: s, status: 'notfound' }]);
    }
    setScanInput('');
  }

  function submitScan(e) { e.preventDefault(); addSerial(scanInput); }
  function removeScanned(i) { setScanned(a => a.filter((_, idx) => idx !== i)); }

  // Группировка найденных серийников по модели для шага 3
  const grouped = {};
  scanned.filter(s => s.status === 'ok').forEach(s => {
    if (!grouped[s.laptop_id]) grouped[s.laptop_id] = { laptop_id: s.laptop_id, brand: s.brand, series: s.series, serials: [] };
    grouped[s.laptop_id].serials.push(s.serial);
  });
  const groups = Object.values(grouped);

  const [laptopPrices, setLaptopPrices] = useState({});
  useEffect(() => {
    // подтягиваем цену продажи по умолчанию для каждой модели в группе, если ещё не знаем
    groups.forEach(async g => {
      if (laptopPrices[g.laptop_id] === undefined) {
        const { data } = await api.get(`/laptops/${g.laptop_id}`);
        setLaptopPrices(p => ({ ...p, [g.laptop_id]: Number(data.price_sell_cny) }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanned.length]);

  const [upsell, setUpsell] = useState({});
  useEffect(() => {
    groups.forEach(async g => {
      if (upsell[g.laptop_id] === undefined) {
        try {
          const { data } = await api.get(`/ai/upsell/${g.laptop_id}`);
          setUpsell(u => ({ ...u, [g.laptop_id]: data }));
        } catch { setUpsell(u => ({ ...u, [g.laptop_id]: [] })); }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanned.length]);

  function unitPrice(lid) {
    return priceOverrides[lid] !== undefined ? Number(priceOverrides[lid]) : (laptopPrices[lid] || 0);
  }

  const subtotalCny = groups.reduce((s, g) => s + unitPrice(g.laptop_id) * g.serials.length, 0);
  const subtotalRub = subtotalCny * rate;
  const finalRub = Math.max(0, subtotalRub - (Number(discountRub) || 0));
  const finalCny = rate > 0 ? finalRub / rate : 0;
  const client = clients.find(c => c.id === clientId);

  async function confirmSale() {
    setErr('');
    try {
      const items = groups.map(g => ({ laptop_id: g.laptop_id, serials: g.serials, price_sell_cny: unitPrice(g.laptop_id) }));
      const body = {
        client_id: clientId || null, items, note, discount_rub: Number(discountRub) || 0,
        payment_mode: paymentMode, pay_dest: payDest,
        split_cash: splitCash, split_bank: splitBank, bank_dest: bankDest,
        paid_now_rub: paidNowRub, due_date: dueDate || null,
      };
      await api.post('/sales', body);
      printReceipt({
        clientName: client?.name, note, discountRub: Number(discountRub) || 0, totalRub: finalRub, totalCny: finalCny,
        items: groups.map(g => ({ brand: g.brand, series: g.series, serials: g.serials, qty: g.serials.length, totalCny: (unitPrice(g.laptop_id) * g.serials.length).toFixed(0) })),
      });
      resetWizard();
    } catch (e2) {
      setErr(e2.response?.data?.error || tt('Ошибка оформления продажи'));
    }
  }

  async function confirmReserve() {
    setErr('');
    try {
      await api.post('/reservations', {
        serials: scanned.filter(s => s.status === 'ok').map(s => s.serial),
        client_id: clientId || null, deadline: dueDate ? new Date(dueDate).toISOString() : null, note,
      });
      resetWizard();
    } catch (e2) {
      setErr(e2.response?.data?.error || tt('Ошибка резервирования'));
    }
  }

  function resetWizard() {
    setStep(1); setScanned([]); setClientId(''); setNote(''); setPriceOverrides({}); setDiscountRub(0);
    setPaymentMode('full'); setPayDest('cash'); setSplitCash(0); setSplitBank(0); setPaidNowRub(0); setDueDate('');
  }

  const steps = [t('scanStep1'), t('scanStep2'), t('scanStep3')];

  return (
    <div>
      <h1 className="text-2xl font-black mb-6">{t('scan')}</h1>
      <div className="flex items-center gap-2 mb-4 text-sm overflow-x-auto">
        {steps.map((s, i) => (
          <div key={i} className={`flex items-center gap-2 ${step === i + 1 ? 'text-accent2 font-semibold' : step > i + 1 ? 'text-green' : 'text-text3'}`}>
            <span className="w-6 h-6 rounded-full border border-current flex items-center justify-center text-xs">{step > i + 1 ? '✓' : i + 1}</span>
            {s}{i < 2 && <span className="mx-1 text-text3">›</span>}
          </div>
        ))}
      </div>

      {err && <div className="mb-3 p-2 rounded-lg bg-red/10 border border-red text-red text-xs">{err}</div>}

      <div className="card">
        {step === 1 && (
          <div>
            <form onSubmit={submitScan} className="flex gap-2 mb-3">
              <input id="scan-serial-input" ref={scanInputRef} className="inp" placeholder={t('scanSerialsPlaceholder')} value={scanInput} onChange={e => setScanInput(e.target.value)} />
              <button type="button" className="btn btn-secondary" onClick={() => setShowCamera(true)}>📷</button>
              <button className="btn btn-primary">+</button>
            </form>
            <div className="max-h-64 overflow-y-auto mb-3">
              {scanned.map((s, i) => (
                <div key={i} className={`flex justify-between items-center px-3 py-2 rounded-lg mb-1 text-sm ${s.status === 'ok' ? 'bg-green/10 border border-green' : s.status === 'sold' ? 'bg-yellow/10 border border-yellow' : 'bg-red/10 border border-red'}`}>
                  {s.id ? (
                    <Link to={`/serials/${s.id}`} target="_blank" className="font-mono hover:underline hover:text-accent2" title={tt("Открыть карточку / историю серийника")}>{s.serial}</Link>
                  ) : (
                    <span className="font-mono">{s.serial}</span>
                  )}
                  <span className="text-xs">{s.status === 'ok' ? `${s.brand} ${s.series}` : s.status === 'sold' ? tt('уже продан/недоступен') : t('notFound')}</span>
                  <button onClick={() => removeScanned(i)} className="text-text3 hover:text-red">✕</button>
                </div>
              ))}
              {!scanned.length && <div className="text-text3 text-sm">—</div>}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-text2">{t('found')}: <b className="text-green">{scanned.filter(s => s.status === 'ok').length}</b> / {scanned.length}</span>
              <button className="btn btn-primary" disabled={!groups.length} onClick={() => setStep(2)}>{t('next')} →</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="mb-3">
              <label className="block text-[11px] text-text2 font-bold uppercase mb-1">{t('client')}</label>
              <select className="inp" value={clientId} onChange={e => setClientId(e.target.value)}>
                <option value="">{t('chooseClientOpt')}</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="mb-3">
              <label className="block text-[11px] text-text2 font-bold uppercase mb-1">{t('comment')}</label>
              <input className="inp" value={note} onChange={e => setNote(e.target.value)} />
            </div>
            <div className="flex justify-between">
              <button className="btn btn-secondary" onClick={() => setStep(1)}>← {t('back')}</button>
              <button className="btn btn-primary" onClick={() => setStep(3)}>{t('next')} →</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            {client && <div className="mb-3 p-2 rounded-lg bg-bg3 text-sm">👤 <b>{client.name}</b></div>}
            <div className="overflow-x-auto"><table className="w-full text-sm mb-3">
              <thead><tr className="text-left text-[10px] uppercase text-text3 border-b border-border">
                <th className="pb-2">{t('model')}</th><th className="pb-2">{t('qty')}</th><th className="pb-2">{t('sellPrice')} ¥</th><th className="pb-2">{t('total')}</th>
              </tr></thead>
              <tbody>
                {groups.map(g => (
                  <tr key={g.laptop_id} className="border-b border-border last:border-0">
                    <td className="py-2">{g.brand} {g.series}</td>
                    <td className="py-2">{g.serials.length}</td>
                    <td className="py-2"><input className="inp w-24" type="number" value={unitPrice(g.laptop_id)} onChange={e => setPriceOverrides(p => ({ ...p, [g.laptop_id]: e.target.value }))} /></td>
                    <td className="py-2 font-mono text-yellow">¥{(unitPrice(g.laptop_id) * g.serials.length).toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            {groups.some(g => (upsell[g.laptop_id] || []).length > 0) && (
              <div className="bg-bg3 rounded-xl p-3 mb-3">
                <div className="text-xs font-bold text-accent2 mb-1.5">🤝 {tt('Часто покупают вместе')}</div>
                {groups.map(g => (upsell[g.laptop_id] || []).map(u => (
                  <div key={u.id} className="text-xs text-text2 py-0.5">
                    {g.brand} {g.series} → <b>{u.brand} {u.series}</b> <span className="text-text3">(¥{u.price_sell_cny}, {tt('вместе')} {u.together_count} {tt('раз')})</span>
                  </div>
                )))}
              </div>
            )}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <label className="text-xs text-text2">{t('discount')}</label>
              <input className="inp w-32" type="number" value={discountRub} onChange={e => setDiscountRub(e.target.value)} />
              {client?.discount_percent > 0 && (
                <button type="button" className="text-xs text-accent2 hover:underline"
                  onClick={() => setDiscountRub(Math.round(subtotalRub * Number(client.discount_percent) / 100))}>
                  {tt("У клиента скидка")} {client.discount_percent}% — {tt("применить")} ({Math.round(subtotalRub * Number(client.discount_percent) / 100).toLocaleString('ru-RU')} ₽)
                </button>
              )}
            </div>
            <div className="mb-3" />
            <div className="bg-bg3 rounded-xl p-4 mb-4">
              <div className="flex justify-between text-sm mb-1"><span className="text-text3">{t('subtotal')} ₽</span><span className="font-mono">{Math.round(subtotalRub).toLocaleString('ru-RU')} ₽</span></div>
              {Number(discountRub) > 0 && <div className="flex justify-between text-sm mb-1"><span className="text-text3">{t('discount')}</span><span className="font-mono text-red">−{Number(discountRub).toLocaleString('ru-RU')} ₽</span></div>}
              <div className="flex justify-between items-baseline pt-2 border-t border-border">
                <span className="font-bold">{t('total')}</span>
                <div className="text-right"><div className="font-mono font-black text-green text-xl">{Math.round(finalRub).toLocaleString('ru-RU')} ₽</div><div className="font-mono text-xs text-text3">¥{finalCny.toFixed(0)}</div></div>
              </div>
            </div>

            <div className="mb-4">
              <div className="font-bold text-sm mb-2">{t('paymentMethod')}</div>
              <div className="flex gap-3 flex-wrap text-xs mb-3">
                <label className="flex items-center gap-1"><input type="radio" checked={paymentMode === 'full'} onChange={() => setPaymentMode('full')} /> {t('paymentFull')}</label>
                <label className="flex items-center gap-1"><input type="radio" checked={paymentMode === 'partial'} onChange={() => setPaymentMode('partial')} /> {t('paymentPartial')}</label>
                <label className="flex items-center gap-1"><input type="radio" checked={paymentMode === 'split'} onChange={() => setPaymentMode('split')} /> {t('paymentSplit')}</label>
                {client && <label className="flex items-center gap-1"><input type="radio" checked={paymentMode === 'balance'} onChange={() => setPaymentMode('balance')} /> {t('paymentBalance')} ({Math.round(client.balance_rub || 0).toLocaleString('ru-RU')} ₽)</label>}
              </div>

              {paymentMode === 'full' && (
                <select className="inp max-w-xs" value={payDest} onChange={e => setPayDest(e.target.value)}>
                  <option value="cash">{t('payDestCash')}</option>
                  {banks.map(b => <option key={b.key} value={b.key}>{b.name} ({Math.round(b.balance_rub).toLocaleString('ru-RU')} ₽)</option>)}
                </select>
              )}
              {paymentMode === 'partial' && (
                <div className="grid grid-cols-2 gap-2 max-w-md">
                  <div><label className="block text-[11px] text-text2 mb-1">{t('paidNow')}</label><input className="inp" type="number" value={paidNowRub} onChange={e => setPaidNowRub(e.target.value)} /></div>
                  <div><label className="block text-[11px] text-text2 mb-1">{t('dueDate')}</label><input className="inp" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
                  <div className="col-span-2 text-xs text-text3">{t('remainingDebt')}: <b className="text-red">{Math.max(0, Math.round(finalRub - paidNowRub)).toLocaleString('ru-RU')} ₽</b></div>
                </div>
              )}
              {paymentMode === 'split' && (
                <div className="grid grid-cols-2 gap-2 max-w-md">
                  <div><label className="block text-[11px] text-text2 mb-1">{t('cashPart')}</label><input className="inp" type="number" value={splitCash} onChange={e => setSplitCash(e.target.value)} /></div>
                  <div><label className="block text-[11px] text-text2 mb-1">{t('bankPart')}</label><input className="inp" type="number" value={splitBank} onChange={e => setSplitBank(e.target.value)} /></div>
                  <div className="col-span-2"><label className="block text-[11px] text-text2 mb-1">{t('bankDest')}</label>
                    <select className="inp" value={bankDest} onChange={e => setBankDest(e.target.value)}>
                      {banks.map(b => <option key={b.key} value={b.key}>{b.name}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 flex-wrap justify-between">
              <button className="btn btn-secondary" onClick={() => setStep(2)}>← {t('back')}</button>
              <div className="flex gap-2">
                <button className="btn btn-secondary" onClick={confirmReserve}>🔒 {t('reserve')}</button>
                <button className="btn btn-primary" onClick={confirmSale}>✓ {t('confirmSale')}</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showCamera && (
        <BarcodeScannerModal
          onResult={(text) => { setShowCamera(false); addSerial(text); }}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}
