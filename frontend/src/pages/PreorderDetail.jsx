import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';

export default function PreorderDetail() {
  const { id } = useParams();
  const [po, setPo] = useState(null);
  const [scan, setScan] = useState('');
  const [scanned, setScanned] = useState([]);
  const [paymentMode, setPaymentMode] = useState('full');
  const [err, setErr] = useState('');
  const { can } = useAuth();
  const { t } = useLang();
  const canEdit = can('preorders', 'edit');

  function load() { api.get(`/preorders/${id}`).then(r => setPo(r.data)); }
  useEffect(load, [id]);

  function addScan(e) {
    e.preventDefault();
    const s = scan.trim();
    if (!s) return;
    if (scanned.includes(s)) { setErr('Уже добавлен'); return; }
    setScanned(a => [...a, s]); setScan(''); setErr('');
  }

  async function confirmTransfer() {
    setErr('');
    try {
      await api.post(`/preorders/${id}/transfer`, { serials: scanned, payment_mode: paymentMode });
      setScanned([]); load();
    } catch (e2) {
      setErr(e2.response?.data?.error || 'Ошибка передачи');
    }
  }

  if (!po) return <div className="text-text3">{t('loading')}</div>;
  const pending = po.items.filter(it => it.item_status !== 'transferred');

  return (
    <div>
      <Link to="/preorders" className="text-text3 text-sm hover:text-text2">← {t('preorders')}</Link>
      <h1 className="text-xl font-black mt-2 mb-1">{po.client_name}</h1>
      <div className="text-text3 text-sm mb-5">No.{po.id.slice(-6)} · {po.stage === 'done' ? t('done') : t('active')}</div>

      <div className="card mb-4">
        <div className="font-bold text-sm mb-3">{t('position')}</div>
        {po.items.map(it => (
          <div key={it.id} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0">
            <span>{it.brand} {it.series} × {it.qty}</span>
            <span className={it.item_status === 'transferred' ? 'text-green' : 'text-yellow'}>
              {it.item_status === 'transferred' ? t('transferred') : t('pending')}
            </span>
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
          {scanned.map(sn => (
            <div key={sn} className="flex justify-between text-sm py-1 px-2 bg-bg3 rounded mb-1">
              <span className="font-mono">{sn}</span>
              <button className="text-text3 hover:text-red" onClick={() => setScanned(a => a.filter(s => s !== sn))}>✕</button>
            </div>
          ))}
          {scanned.length > 0 && (
            <>
              <div className="mt-3 mb-2">
                <label className="block text-[11px] text-text2 font-bold uppercase mb-1">{t('paymentMethod')}</label>
                <select className="inp" value={paymentMode} onChange={e => setPaymentMode(e.target.value)}>
                  <option value="full">{t('cash_full')}</option>
                  <option value="transfer">{t('transferPay')}</option>
                  <option value="partial">{t('debtPay')}</option>
                  <option value="balance">{t('balancePay')}</option>
                </select>
              </div>
              <button className="btn btn-primary w-full justify-center" onClick={confirmTransfer}>{t('confirmTransfer')}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
