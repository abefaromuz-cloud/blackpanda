import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';
import { useTT } from '../i18n/useTT';
import { beep } from '../utils/sound';
import { printReceipt } from '../utils/print';

export default function PreorderDetail() {
  const { id } = useParams();
  const [po, setPo] = useState(null);
  const [scan, setScan] = useState('');
  const [scanned, setScanned] = useState([]);
  const [banks, setBanks] = useState([]);
  const [paymentMode, setPaymentMode] = useState('full');
  const [payDest, setPayDest] = useState('cash');
  const [splitCash, setSplitCash] = useState(0);
  const [splitBank, setSplitBank] = useState(0);
  const [bankDest, setBankDest] = useState('sber');
  const [paidNowRub, setPaidNowRub] = useState(0);
  const [dueDate, setDueDate] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [err, setErr] = useState('');
  const { can } = useAuth();
  const { t } = useLang();
  const canEdit = can('preorders', 'edit');
  const tt = useTT();

  function load() { api.get(`/preorders/${id}`).then(r => setPo(r.data)); }
  useEffect(load, [id]);
  useEffect(() => { api.get('/bank-accounts').then(r => setBanks(r.data)); }, []);

  async function addScan(e) {
    e.preventDefault();
    const s = scan.trim();
    if (!s) return;
    if (scanned.some(x => x.serial === s)) { setErr(tt('Уже добавлен')); beep(false); setScan(''); return; }
    try {
      const { data } = await api.get(`/serials/lookup/${encodeURIComponent(s)}`);
      if (data.bucket === 'instock' || data.bucket === 'reserved') {
        beep(true); setScanned(a => [...a, { serial: s, id: data.id, ok: true }]); setErr('');
      } else {
        beep(false); setScanned(a => [...a, { serial: s, id: data.id, ok: false }]); setErr(`${s}: ${tt('не в наличии/не наш')}`);
      }
    } catch {
      beep(false); setErr(`${s}: ${tt('не найден')}`);
    }
    setScan('');
  }

  async function cancelPreorder() {
    if (!confirm(tt('Отменить предзаказ?'))) return;
    await api.post(`/preorders/${id}/cancel`);
    load();
  }

  async function payNow() {
    setErr('');
    try {
      await api.post(`/preorders/${id}/pay`, { amount_cny: payAmount || undefined, dest: payDest });
      setPayAmount(''); load();
    } catch (e2) { setErr(e2.response?.data?.error || 'Ошибка оплаты'); }
  }

  async function confirmTransfer() {
    setErr('');
    try {
      const body = {
        serials: scanned.filter(s => s.ok).map(s => s.serial), payment_mode: paymentMode, pay_dest: payDest,
        split_cash: splitCash, split_bank: splitBank, bank_dest: bankDest, paid_now_rub: paidNowRub, due_date: dueDate || null,
      };
      const { data } = await api.post(`/preorders/${id}/transfer`, body);
      printReceipt({
        clientName: po.client_name, totalRub: data.totalRub, totalCny: data.totalCny,
        items: scanned.filter(s => s.ok).map(s => ({ brand: '', series: '', serials: [s.serial], qty: 1, totalCny: '' })),
      });
      setScanned([]); load();
    } catch (e2) {
      setErr(e2.response?.data?.error || 'Ошибка передачи');
    }
  }

  if (!po) return <div className="text-text3">{t('loading')}</div>;
  const pending = po.stage === 'cancelled' ? [] : po.items.filter(it => it.item_status !== 'transferred');
  const okScanned = scanned.filter(s => s.ok);
  const remainingRubNow = po.remaining_rub_now;

  return (
    <div>
      <Link to="/preorders" className="text-text3 text-sm hover:text-text2">← {t('preorders')}</Link>
      <h1 className="text-xl font-black mt-2 mb-1">{po.client_name}</h1>
      <div className="text-text3 text-sm mb-5 flex items-center gap-3 flex-wrap">
        <span>No.{po.id.slice(-6)} · {po.stage === 'done' ? t('done') : po.stage === 'cancelled' ? tt('Отменён') : t('active')}</span>
        {canEdit && po.stage === 'active' && (
          <button className="text-red text-xs hover:underline" onClick={cancelPreorder}>❌ {tt('Отменить')}</button>
        )}
      </div>

      <div className="card mb-4">
        <div className="font-bold text-sm mb-3">{tt('Ценообразование')}</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-sm">
          <div><div className="text-xs text-text3">{tt('Предоплата')}</div><div className="font-bold">{po.prepayment_pct}% ({tt('наценка')} {po.markup_pct}%)</div></div>
          <div><div className="text-xs text-text3">{tt('Итого по заказу')}</div><div className="font-bold">¥{Number(po.total_cny).toLocaleString('ru-RU')}</div></div>
          <div><div className="text-xs text-text3">{tt('оплачено')}</div><div className="font-bold text-green">¥{Number(po.paid_cny).toLocaleString('ru-RU')}</div></div>
          <div><div className="text-xs text-text3">{tt('Остаток')}</div><div className="font-bold text-red">¥{po.remaining_cny.toLocaleString('ru-RU')} ≈ {Math.round(remainingRubNow).toLocaleString('ru-RU')} ₽</div></div>
        </div>
        <div className="text-[10px] text-text3 mb-3">{tt('Остаток фиксируется в юанях — при оплате пересчитывается по курсу на день оплаты')}. {tt('Текущий курс')}: ¥1 = {po.current_rate} ₽</div>

        {po.remaining_cny > 0.01 && canEdit && (
          <div className="flex gap-2 flex-wrap items-end">
            <div>
              <label className="block text-[11px] text-text2 mb-1">{tt('Сумма к оплате ¥ (пусто = весь остаток)')}</label>
              <input className="inp w-40" type="number" placeholder={`¥${po.remaining_cny}`} value={payAmount} onChange={e => setPayAmount(e.target.value)} />
            </div>
            <select className="inp w-40" value={payDest} onChange={e => setPayDest(e.target.value)}>
              <option value="cash">{tt('Наличные')}</option>
              {banks.map(b => <option key={b.key} value={b.key}>{b.name}</option>)}
            </select>
            <button className="btn btn-primary" onClick={payNow}>💰 {tt('Внести оплату')}</button>
          </div>
        )}
      </div>

      <div className="card mb-4">
        <div className="font-bold text-sm mb-3">{t('position')}</div>
        {po.items.map(it => (
          <div key={it.id} className="py-2 border-b border-border last:border-0">
            <div className="flex justify-between text-sm">
              <span>{it.brand} {it.series} × {it.qty}</span>
              <span className={it.item_status === 'transferred' ? 'text-green' : 'text-yellow'}>
                {it.item_status === 'transferred' ? t('transferred') : t('pending')}
              </span>
            </div>
            <div className="text-[10px] text-text3">
              ¥{it.cost_cny} + {tt('логистика')} ¥{it.logistics_cny} + {po.markup_pct}% = <b>¥{it.price_sell_cny}</b>/{tt('шт')} ≈ {Math.round(it.price_sell_cny * po.current_rate).toLocaleString('ru-RU')} ₽
            </div>
          </div>
        ))}
      </div>

      {pending.length > 0 && canEdit && (
        <div className="card">
          <div className="font-bold text-sm mb-3">{t('transfer')}</div>
          <form onSubmit={addScan} className="flex gap-2 mb-3">
            <input className="inp" placeholder={t('scanSerial')} value={scan} onChange={e => setScan(e.target.value)} autoFocus />
            <button className="btn btn-primary">+</button>
          </form>
          {err && <div className="text-red text-xs mb-2">{err}</div>}
          {scanned.map((s, i) => (
            <div key={i} className={`flex justify-between text-sm py-1 px-2 rounded mb-1 ${s.ok ? 'bg-bg3' : 'bg-red/10 border border-red'}`}>
              {s.id ? <Link to={`/serials/${s.id}`} target="_blank" className="font-mono hover:underline hover:text-accent2">{s.serial}</Link> : <span className="font-mono">{s.serial}</span>}
              <button onClick={() => setScanned(a => a.filter((_, idx) => idx !== i))} className="text-text3 hover:text-red">✕</button>
            </div>
          ))}
          {okScanned.length > 0 && (
            <>
              {po.remaining_cny > 0.01 ? (
                <div className="mt-3 mb-2">
                  <div className="text-xs text-accent2 mb-2">{tt('К оплате остаток по всему предзаказу')}: ¥{po.remaining_cny.toLocaleString('ru-RU')} ≈ {Math.round(remainingRubNow).toLocaleString('ru-RU')} ₽ ({tt('по курсу сегодня')})</div>
                  <label className="block text-[11px] text-text2 font-bold uppercase mb-1">{t('paymentMethod')}</label>
                  <div className="flex gap-3 flex-wrap text-xs mb-2">
                    <label className="flex items-center gap-1"><input type="radio" checked={paymentMode === 'full'} onChange={() => setPaymentMode('full')} /> {t('paymentFull')}</label>
                    <label className="flex items-center gap-1"><input type="radio" checked={paymentMode === 'partial'} onChange={() => setPaymentMode('partial')} /> {t('paymentPartial')}</label>
                    <label className="flex items-center gap-1"><input type="radio" checked={paymentMode === 'split'} onChange={() => setPaymentMode('split')} /> {t('paymentSplit')}</label>
                    {po.client_id && <label className="flex items-center gap-1"><input type="radio" checked={paymentMode === 'balance'} onChange={() => setPaymentMode('balance')} /> {t('paymentBalance')}</label>}
                  </div>

                  {paymentMode === 'full' && (
                    <select className="inp max-w-xs" value={payDest} onChange={e => setPayDest(e.target.value)}>
                      <option value="cash">{t('payDestCash')}</option>
                      {banks.map(b => <option key={b.key} value={b.key}>{b.name}</option>)}
                    </select>
                  )}
                  {paymentMode === 'partial' && (
                    <div className="grid grid-cols-2 gap-2 max-w-md">
                      <div><label className="block text-[11px] text-text2 mb-1">{t('paidNow')}</label><input className="inp" type="number" value={paidNowRub} onChange={e => setPaidNowRub(e.target.value)} /></div>
                      <div><label className="block text-[11px] text-text2 mb-1">{t('dueDate')}</label><input className="inp" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
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
              ) : (
                <div className="text-xs text-green mb-2">✓ {tt('Предзаказ полностью оплачен — просто передай товар')}</div>
              )}
              <button className="btn btn-primary w-full justify-center" onClick={confirmTransfer}>{t('confirmSale')}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
