import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';
import { printSerialLabel } from '../utils/print';

const statusOptions = [
  ['s1', 'В пути'], ['s2', 'На складе'], ['s15', 'Резерв'], ['s3', 'Продан'],
];

export default function SerialDetail() {
  const { id } = useParams();
  const [s, setS] = useState(null);
  const [showReturn, setShowReturn] = useState(false);
  const [reason, setReason] = useState('');
  const { can } = useAuth();
  const { t } = useLang();
  const canEdit = can('warehouse', 'edit');

  function load() { api.get(`/serials/detail/${id}`).then(r => setS(r.data)); }
  useEffect(load, [id]);

  async function changeStatus(status_id) {
    await api.put(`/serials/${id}`, { status_id });
    load();
  }

  async function updateField(field, value) {
    await api.put(`/serials/${id}`, { [field]: value });
    load();
  }

  async function doReturn(e) {
    e.preventDefault();
    await api.post(`/serials/${id}/return`, { reason });
    setShowReturn(false); setReason(''); load();
  }

  if (!s) return <div className="text-text3">{t('loading')}</div>;

  const daysOnStock = s.arrival_date ? Math.floor((Date.now() - new Date(s.arrival_date)) / 86400000) : null;

  return (
    <div>
      <Link to={`/warehouse/${s.laptop_id}`} className="text-text3 text-sm hover:text-text2">← {t('warehouse')}</Link>

      <div className="card mt-2 mb-4">
        <div className="flex justify-between items-start flex-wrap gap-2 mb-1">
          <div>
            <div className="font-mono text-xl font-black">{s.serial}</div>
            <div className="text-text3 text-sm">{s.brand} · {s.series}</div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary btn-sm" onClick={() => printSerialLabel({ serial: s.serial, brand: s.brand, series: s.series, specs: [s.cpu, s.ram, s.storage].filter(Boolean).join(' / '), arrivalDate: s.arrival_date })}>🏷️ {t('printLabel')}</button>
            {canEdit && s.status_id === 's3' && <button className="btn btn-danger btn-sm" onClick={() => setShowReturn(true)}>↩️ Возврат</button>}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm mt-3">
          <div><div className="text-xs text-text3">CPU</div><div className="font-bold">{s.cpu || '—'}</div></div>
          <div><div className="text-xs text-text3">RAM</div><div className="font-bold">{s.ram || '—'}</div></div>
          <div><div className="text-xs text-text3">GPU</div><div className="font-bold">{s.gpu || '—'}</div></div>
          <div><div className="text-xs text-text3">Накопитель</div><div className="font-bold">{s.storage || '—'}</div></div>
          <div><div className="text-xs text-text3">Цвет</div><div className="font-bold">{s.color || '—'}</div></div>
          <div><div className="text-xs text-text3">Экран</div><div className="font-bold">{s.screen || '—'}</div></div>
        </div>
      </div>

      {showReturn && (
        <form onSubmit={doReturn} className="card mb-4">
          <div className="font-bold text-sm mb-2">Оформить возврат{s.client_name ? ` от клиента ${s.client_name}` : ''}</div>
          <textarea className="inp mb-2" placeholder="Причина возврата" value={reason} onChange={e => setReason(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setShowReturn(false)}>{t('cancel')}</button>
            <button className="btn btn-primary">Подтвердить возврат</button>
          </div>
        </form>
      )}

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div className="card">
          <div className="font-bold text-sm mb-3">Статус</div>
          {canEdit ? (
            <select className="inp mb-2" value={s.status_id} onChange={e => changeStatus(e.target.value)}>
              {statusOptions.map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
            </select>
          ) : <div className="text-sm">{statusOptions.find(o => o[0] === s.status_id)?.[1] || s.status_id}</div>}
          {s.client_name && <div className="text-xs text-text3 mt-1">Клиент: {s.client_name}</div>}

          <div className="mt-3">
            <label className="block text-[11px] text-text2 font-bold uppercase mb-1">Гарантия (мес.)</label>
            <select className="inp" disabled={!canEdit} value={s.warranty_months} onChange={e => updateField('warranty_months', Number(e.target.value))}>
              {[1, 3, 6, 12].map(m => <option key={m} value={m}>{m} мес.</option>)}
            </select>
          </div>
          <div className="mt-3">
            <label className="block text-[11px] text-text2 font-bold uppercase mb-1">Дата поступления</label>
            <input className="inp" type="date" disabled={!canEdit} value={s.arrival_date ? s.arrival_date.slice(0, 10) : ''} onChange={e => updateField('arrival_date', e.target.value ? new Date(e.target.value).toISOString() : null)} />
          </div>
          <div className="mt-3">
            <label className="block text-[11px] text-text2 font-bold uppercase mb-1">Дата продажи</label>
            <input className="inp" type="date" disabled={!canEdit} value={s.sale_date ? s.sale_date.slice(0, 10) : ''} onChange={e => updateField('sale_date', e.target.value ? new Date(e.target.value).toISOString() : null)} />
          </div>
          {daysOnStock !== null && <div className="text-xs text-text3 mt-2">Дней с поступления: {daysOnStock}</div>}
        </div>

        <div className="card">
          <div className="font-bold text-sm mb-3">Заметки / причина</div>
          <textarea className="inp mb-3" rows={4} disabled={!canEdit} value={s.notes || ''} onChange={e => updateField('notes', e.target.value)} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" disabled={!canEdit} checked={s.warranty_notify} onChange={e => updateField('warranty_notify', e.target.checked)} />
            Уведомления гарантии
          </label>
        </div>
      </div>

      <div className="card">
        <div className="font-bold text-sm mb-3">📋 История изменений</div>
        {s.history.length === 0 && <div className="text-text3 text-sm">—</div>}
        {s.history.map(h => (
          <div key={h.id} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0">
            <span className="text-text3">{new Date(h.created_at).toLocaleString('ru-RU')}</span>
            <span>{h.note}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
