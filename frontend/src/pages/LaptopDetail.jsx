import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';
import { printSerialLabel } from '../utils/print';

const statusKey = { s1: ['inTransit', 'badge-yellow'], s2: ['inStock', 'badge-green'], s15: ['reserved', 'badge-blue'], s3: ['soldTotal', 'badge-red'] };

export default function LaptopDetail() {
  const { id } = useParams();
  const [l, setL] = useState(null);
  const [serial, setSerial] = useState('');
  const [bulk, setBulk] = useState('');
  const { can } = useAuth();
  const { t } = useLang();
  const canEdit = can('warehouse', 'edit');

  function load() { api.get(`/laptops/${id}`).then(r => setL(r.data)); }
  useEffect(load, [id]);

  async function addOne(e) {
    e.preventDefault();
    if (!serial.trim()) return;
    await api.post('/serials', { laptop_id: id, serial: serial.trim() });
    setSerial(''); load();
  }

  async function addBulk(e) {
    e.preventDefault();
    const list = bulk.split('\n').map(s => s.trim()).filter(Boolean);
    if (!list.length) return;
    await api.post('/serials/bulk', { laptop_id: id, serials: list });
    setBulk(''); load();
  }

  if (!l) return <div className="text-text3">{t('loading')}</div>;

  return (
    <div>
      <Link to="/warehouse" className="text-text3 text-sm hover:text-text2">← {t('warehouse')}</Link>
      <h1 className="text-xl font-black mt-2 mb-1">{l.brand} {l.series}</h1>
      <div className="text-text3 text-sm mb-5">{l.cpu} · {l.ram} · {l.gpu} · {l.storage} · {l.color}</div>

      {canEdit && (
        <div className="grid md:grid-cols-2 gap-4 mb-5">
          <form onSubmit={addOne} className="card">
            <div className="font-bold text-sm mb-3">+ {t('addModel')}</div>
            <div className="flex gap-2">
              <input className="inp" placeholder={t('scanSerial')} value={serial} onChange={e => setSerial(e.target.value)} />
              <button className="btn btn-primary">+</button>
            </div>
          </form>
          <form onSubmit={addBulk} className="card">
            <div className="font-bold text-sm mb-3">Bulk import</div>
            <textarea className="inp mb-2" rows={3} value={bulk} onChange={e => setBulk(e.target.value)} />
            <button className="btn btn-secondary">{t('add')}</button>
          </form>
        </div>
      )}

      <div className="card">
        <div className="font-bold text-sm mb-3">{t('warehouse')} ({l.serials.length})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase text-text3 border-b border-border">
                <th className="pb-2">S/N</th><th className="pb-2">Status</th><th className="pb-2">{t('date')}</th><th className="pb-2">Sale</th><th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {l.serials.map(s => {
                const [key, cls] = statusKey[s.status_id] || ['reserved', 'badge-blue'];
                return (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="py-2 font-mono">{s.serial}</td>
                    <td className="py-2"><span className={`badge ${cls}`}>{t(key)}</span></td>
                    <td className="py-2 text-text3">{s.arrival_date ? new Date(s.arrival_date).toLocaleDateString('ru-RU') : '—'}</td>
                    <td className="py-2 text-text3">{s.sale_date ? new Date(s.sale_date).toLocaleDateString('ru-RU') : '—'}</td>
                    <td className="py-2 text-right">
                      <button className="text-text3 hover:text-accent2 text-xs" onClick={() => printSerialLabel({ serial: s.serial, brand: l.brand, series: l.series, specs: [l.cpu, l.ram, l.storage].filter(Boolean).join(' / '), arrivalDate: s.arrival_date })}>🏷️</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
