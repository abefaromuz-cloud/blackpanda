import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';
import { printSerialLabel } from '../utils/print';
import { useStatuses } from '../hooks/useStatuses';
import { useLibraryText } from '../hooks/useLibraryText';
import { useTT } from '../i18n/useTT';

export default function SerialDetail() {
  const { id } = useParams();
  const [s, setS] = useState(null);
  const [notesBuffer, setNotesBuffer] = useState('');
  const [showReturn, setShowReturn] = useState(false);
  const [reason, setReason] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [pendingSoldStatus, setPendingSoldStatus] = useState(null); // статус со счётом "sold", ждущий выбора клиента
  const [soldClientId, setSoldClientId] = useState('');
  const [soldDate, setSoldDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [clients, setClients] = useState([]);
  const { can } = useAuth();
  const { t } = useLang();
  const { statuses, badgeClass, bucketOf, displayLabel } = useStatuses();
  const { tr } = useLibraryText();
  const tt = useTT();
  const canEdit = can('warehouse', 'edit');

  function load() { api.get(`/serials/detail/${id}`).then(r => { setS(r.data); setNotesBuffer(r.data.notes || ''); }); }
  useEffect(load, [id]);

  async function saveNotes() {
    if (notesBuffer === (s.notes || '')) return; // ничего не поменялось — не дёргаем сервер зря
    await api.put(`/serials/${id}`, { notes: notesBuffer });
    setS(prev => ({ ...prev, notes: notesBuffer }));
  }

  async function changeStatus(status_id) {
    if (bucketOf(status_id) === 'sold') {
      // Продажа "напрямую" из карточки серийника — обычно для внесения старых архивных продаж
      // задним числом. Спрашиваем, кому продано, прежде чем менять статус.
      setPendingSoldStatus(status_id);
      setSoldClientId(s.sale_client_id || '');
      if (!clients.length) api.get('/clients').then(r => setClients(r.data));
      return;
    }
    await api.put(`/serials/${id}`, { status_id });
    load();
  }

  async function confirmSold() {
    await api.put(`/serials/${id}`, {
      status_id: pendingSoldStatus,
      sale_client_id: soldClientId || null,
      sale_date: soldDate ? new Date(soldDate).toISOString() : null,
    });
    setPendingSoldStatus(null);
    load();
  }

  async function updateField(field, value) {
    await api.put(`/serials/${id}`, { [field]: value });
    load();
  }

  function openReturn() {
    // Разумные варианты по умолчанию после возврата — сотрудник может выбрать любой другой
    const preferred = statuses.find(st => st.label === 'Склад (восст.)') || statuses.find(st => st.counts_as === 'instock');
    setNewStatus(preferred?.label || '');
    setShowReturn(true);
  }

  async function doReturn(e) {
    e.preventDefault();
    if (!newStatus) return;
    await api.post(`/serials/${id}/return`, { reason, new_status: newStatus });
    setShowReturn(false); setReason(''); load();
  }

  if (!s) return <div className="text-text3">{t('loading')}</div>;

  const daysOnStock = s.arrival_date ? Math.floor((Date.now() - new Date(s.arrival_date)) / 86400000) : null;
  const isSold = bucketOf(s.status_id) === 'sold';

  return (
    <div>
      <Link to={`/warehouse/${s.laptop_id}`} className="text-text3 text-sm hover:text-text2">← {t('warehouse')}</Link>

      <div className="card mt-2 mb-4">
        <div className="flex justify-between items-start flex-wrap gap-2 mb-1">
          <div>
            <div className="font-mono text-xl font-black">{s.serial}</div>
            <div className="text-text3 text-sm">{tr('brand', s.brand)} · {tr('series', s.series)}</div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary btn-sm" onClick={() => printSerialLabel({ serial: s.serial, brand: s.brand, series: s.series, specs: [s.cpu, s.ram, s.storage].filter(Boolean).join(' / '), arrivalDate: s.arrival_date })}>🏷️ {t('printLabel')}</button>
            {canEdit && isSold && <button className="btn btn-danger btn-sm" onClick={openReturn}>↩️ {tt("Возврат")}</button>}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm mt-3">
          <div><div className="text-xs text-text3">CPU</div><div className="font-bold">{tr('cpu', s.cpu) || '—'}</div></div>
          <div><div className="text-xs text-text3">RAM</div><div className="font-bold">{tr('ram', s.ram) || '—'}</div></div>
          <div><div className="text-xs text-text3">GPU</div><div className="font-bold">{tr('gpu', s.gpu) || '—'}</div></div>
          <div><div className="text-xs text-text3">{tt("Накопитель")}</div><div className="font-bold">{tr('storage', s.storage) || '—'}</div></div>
          <div><div className="text-xs text-text3">{tt("Цвет")}</div><div className="font-bold">{tr('color', s.color) || '—'}</div></div>
          <div><div className="text-xs text-text3">{tt("Экран")}</div><div className="font-bold">{tr('screen', s.screen) || '—'}</div></div>
        </div>
      </div>

      {showReturn && (
        <form onSubmit={doReturn} className="card mb-4">
          <div className="font-bold text-sm mb-2">{tt("Оформить возврат")}{s.client_name ? ` ${tt("от клиента")} ${s.client_name}` : ''}</div>
          <textarea className="inp mb-3" placeholder={tt("Причина возврата")} value={reason} onChange={e => setReason(e.target.value)} />
          <label className="block text-[11px] text-text2 font-bold uppercase mb-1">{tt("Какой статус присвоить после возврата")}</label>
          <select className="inp mb-3" value={newStatus} onChange={e => setNewStatus(e.target.value)} required>
            <option value="">— {tt("выбери статус")} —</option>
            {statuses.map(st => <option key={st.id} value={st.label}>{displayLabel(st.label)}</option>)}
          </select>
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setShowReturn(false)}>{t('cancel')}</button>
            <button className="btn btn-primary">{tt("Подтвердить возврат")}</button>
          </div>
        </form>
      )}

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div className="card">
          <div className="font-bold text-sm mb-3">{tt("Статус")}</div>
          {canEdit ? (
            <select className="inp mb-2" value={s.status_id} onChange={e => changeStatus(e.target.value)}>
              {statuses.map(st => <option key={st.id} value={st.label}>{displayLabel(st.label)}</option>)}
            </select>
          ) : <div className="text-sm"><span className={`badge ${badgeClass(s.status_id)}`}>{displayLabel(s.status_id)}</span></div>}
          {pendingSoldStatus && (
            <div className="bg-bg3 rounded-xl p-3 mb-2">
              <div className="text-xs font-bold mb-2">👤 {tt("Кому продано?")}</div>
              <select className="inp mb-2" value={soldClientId} onChange={e => setSoldClientId(e.target.value)}>
                <option value="">— {tt("без клиента")} —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input className="inp mb-2" type="date" value={soldDate} onChange={e => setSoldDate(e.target.value)} />
              <div className="flex gap-2">
                <button className="btn btn-primary btn-sm" onClick={confirmSold}>{tt("Подтвердить продажу")}</button>
                <button className="text-text3 text-xs hover:text-text" onClick={() => setPendingSoldStatus(null)}>{t('cancel')}</button>
              </div>
            </div>
          )}
          {s.client_name && <div className="text-xs text-text3 mt-1">{tt("Клиент")}: <Link to={`/clients/${s.sale_client_id}`} className="text-accent2 hover:underline">{s.client_name} →</Link></div>}

          <div className="mt-3">
            <label className="block text-[11px] text-text2 font-bold uppercase mb-1">{tt("Гарантия (мес.)")}</label>
            <select className="inp" disabled={!canEdit} value={s.warranty_months} onChange={e => updateField('warranty_months', Number(e.target.value))}>
              {[1, 3, 6, 12].map(m => <option key={m} value={m}>{m} {tt("мес.")}</option>)}
            </select>
          </div>
          <div className="mt-3">
            <label className="block text-[11px] text-text2 font-bold uppercase mb-1">{tt("Дата поступления")}</label>
            <input className="inp" type="date" disabled={!canEdit} value={s.arrival_date ? s.arrival_date.slice(0, 10) : ''} onChange={e => updateField('arrival_date', e.target.value ? new Date(e.target.value).toISOString() : null)} />
          </div>
          <div className="mt-3">
            <label className="block text-[11px] text-text2 font-bold uppercase mb-1">{tt("Дата продажи")}</label>
            <input className="inp" type="date" disabled={!canEdit} value={s.sale_date ? s.sale_date.slice(0, 10) : ''} onChange={e => updateField('sale_date', e.target.value ? new Date(e.target.value).toISOString() : null)} />
          </div>
          {daysOnStock !== null && <div className="text-xs text-text3 mt-2">{tt("Дней с поступления")}: {daysOnStock}</div>}
        </div>

        <div className="card">
          <div className="font-bold text-sm mb-3">{tt("Заметки / причина")}</div>
          <textarea className="inp mb-3" rows={4} disabled={!canEdit} value={notesBuffer} onChange={e => setNotesBuffer(e.target.value)} onBlur={saveNotes} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" disabled={!canEdit} checked={s.warranty_notify} onChange={e => updateField('warranty_notify', e.target.checked)} />
            {tt("Уведомления гарантии")}
          </label>
        </div>
      </div>

      <div className="card">
        <div className="font-bold text-sm mb-3">📋 {tt("История изменений")}</div>
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
