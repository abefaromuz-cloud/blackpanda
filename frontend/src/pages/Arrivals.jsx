import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';

export default function Arrivals() {
  const [report, setReport] = useState([]);
  const [laptops, setLaptops] = useState([]);
  const [laptopId, setLaptopId] = useState('');
  const [serials, setSerials] = useState('');
  const [costCny, setCostCny] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const { can } = useAuth();
  const { t } = useLang();
  const canEdit = can('arrivals', 'edit');

  function load() {
    api.get('/arrivals').then(r => setReport(r.data));
    api.get('/laptops').then(r => setLaptops(r.data));
  }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    const list = serials.split('\n').map(s => s.trim()).filter(Boolean);
    if (!laptopId || !list.length) return;
    const { data } = await api.post('/arrivals', {
      laptop_id: laptopId, serials: list, cost_cny: costCny || null,
      arrival_date: date ? new Date(date).toISOString() : null, note,
    });
    setMsg(`✅ Добавлено: ${data.created}${data.skipped ? `, пропущено дублей: ${data.skipped}` : ''}`);
    setSerials(''); setCostCny(''); setNote(''); load();
  }

  const grandTotal = report.reduce((s, r) => s + r.totalQty, 0);

  return (
    <div>
      <h1 className="text-2xl font-black mb-6">📥 {t('arrivals')}</h1>

      {canEdit && (
        <form onSubmit={submit} className="card mb-5">
          <div className="font-bold text-sm mb-3">{t('arrivalForm')}</div>
          <div className="grid md:grid-cols-2 gap-3 mb-3">
            <select className="inp" value={laptopId} onChange={e => setLaptopId(e.target.value)} required>
              <option value="">— {t('model')} —</option>
              {laptops.map(l => <option key={l.id} value={l.id}>{l.brand} {l.series}</option>)}
            </select>
            <input className="inp" type="date" value={date} onChange={e => setDate(e.target.value)} />
            <input className="inp" type="number" placeholder={t('unitCost')} value={costCny} onChange={e => setCostCny(e.target.value)} />
            <input className="inp" placeholder={t('comment')} value={note} onChange={e => setNote(e.target.value)} />
          </div>
          <textarea className="inp mb-3" rows={4} placeholder="Серийные номера, по одному в строке" value={serials} onChange={e => setSerials(e.target.value)} />
          <button className="btn btn-primary">{t('add')}</button>
          {msg && <div className="text-sm mt-2 text-green">{msg}</div>}
        </form>
      )}

      <div className="card">
        <div className="flex justify-between items-center mb-3">
          <div className="font-bold text-sm">{t('arrivalReport')}</div>
          <div className="text-xs text-text3">Всего пришло: <b className="text-text">{grandTotal}</b> шт.</div>
        </div>
        {report.length === 0 && <div className="text-text3 text-sm">—</div>}
        {report.map(day => (
          <div key={day.date} className="border-b border-border last:border-0 py-3">
            <div className="flex justify-between items-center mb-2">
              <span className="font-bold text-sm">{new Date(day.date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
              <span className="text-xs text-text3">{day.totalQty} шт. {day.totalCostCny > 0 && `· ¥${Math.round(day.totalCostCny)}`}</span>
            </div>
            {day.items.map((it, i) => (
              <Link key={i} to={`/warehouse/${it.laptop_id}`} className="flex justify-between text-sm py-1 hover:text-accent2">
                <span>{it.brand} {it.series}</span>
                <span className="font-mono text-text3">{it.qty} шт. {it.avg_cost_cny > 0 && `· ¥${Math.round(it.avg_cost_cny)}/шт`}</span>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
