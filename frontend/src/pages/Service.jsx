import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';

const STATUS_LABELS = { in_progress: ['inProgress', 'badge-yellow'], done: ['doneStatus', 'badge-green'], issued: ['issued', 'badge-blue'], declined: ['declined', 'badge-red'] };

export default function Service() {
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState('external');
  const [serialInput, setSerialInput] = useState('');
  const [foundSerial, setFoundSerial] = useState(null);
  const [serialErr, setSerialErr] = useState('');
  const [form, setForm] = useState({ device_label: '', client_id: '', issue: '', is_warranty: false, cost_rub: '', technician: '', notes: '' });
  const { can } = useAuth();
  const { t } = useLang();
  const canEdit = can('service', 'edit');

  function load() {
    api.get('/service').then(r => setOrders(r.data));
    api.get('/clients').then(r => setClients(r.data));
  }
  useEffect(load, []);

  // Предзаполнение клиента из его карточки (кнопка "Сдать в сервис")
  useEffect(() => {
    const cid = sessionStorage.getItem('bp_service_client');
    if (cid) {
      sessionStorage.removeItem('bp_service_client');
      setForm(f => ({ ...f, client_id: cid }));
      setShowForm(true);
    }
  }, []);

  async function checkSerial() {
    setSerialErr(''); setFoundSerial(null);
    try {
      const { data } = await api.get(`/service/lookup-serial/${encodeURIComponent(serialInput.trim())}`);
      setFoundSerial(data);
      if (data.sale_client_id) setForm(f => ({ ...f, client_id: data.sale_client_id }));
    } catch (e) {
      setSerialErr(e.response?.data?.error || 'Не найден');
    }
  }

  async function submit(e) {
    e.preventDefault();
    await api.post('/service', {
      kind, serial_id: foundSerial?.id || null, device_label: kind === 'external' ? form.device_label : null,
      client_id: form.client_id || null, issue: form.issue, is_warranty: form.is_warranty,
      cost_rub: form.cost_rub || 0, technician: form.technician, notes: form.notes,
    });
    setShowForm(false); setKind('external'); setSerialInput(''); setFoundSerial(null);
    setForm({ device_label: '', client_id: '', issue: '', is_warranty: false, cost_rub: '', technician: '', notes: '' });
    load();
  }

  async function updateStatus(order, status) {
    const body = { status };
    if (status === 'done' && order.serial_id) {
      const rs = prompt('Какой статус присвоить серийнику после ремонта? (например: Склад (восст.), Гарантия КНР)', 'Склад (восст.)');
      if (rs) body.return_status = rs;
    }
    await api.put(`/service/${order.id}`, body);
    load();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-black">🔧 {t('service')}</h1>
        {canEdit && <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>{t('newServiceOrder')}</button>}
      </div>

      {showForm && canEdit && (
        <form onSubmit={submit} className="card mb-5">
          <div className="flex gap-3 mb-3 text-sm">
            <label className="flex items-center gap-1"><input type="radio" checked={kind === 'own_stock'} onChange={() => setKind('own_stock')} /> {t('ourDevice')}</label>
            <label className="flex items-center gap-1"><input type="radio" checked={kind === 'external'} onChange={() => setKind('external')} /> {t('externalDevice')}</label>
          </div>

          {kind === 'own_stock' ? (
            <div className="mb-3">
              <div className="flex gap-2 mb-1">
                <input className="inp" placeholder={t('scanSerial')} value={serialInput} onChange={e => setSerialInput(e.target.value)} />
                <button type="button" className="btn btn-secondary" onClick={checkSerial}>{t('checkSerial')}</button>
              </div>
              {serialErr && <div className="text-red text-xs">{serialErr}</div>}
              {foundSerial && (
                <div className="text-xs text-green mt-1">
                  ✓ {foundSerial.brand} {foundSerial.series} — статус: {foundSerial.status_id}
                  {foundSerial.sale_client_name && ` · продан: ${foundSerial.sale_client_name}`}
                </div>
              )}
            </div>
          ) : (
            <input className="inp mb-3" placeholder={t('deviceLabel')} value={form.device_label} onChange={e => setForm(f => ({ ...f, device_label: e.target.value }))} required />
          )}

          <select className="inp mb-3" value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}>
            <option value="">{t('chooseClientOpt')}</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <textarea className="inp mb-3" placeholder="Описание неисправности" value={form.issue} onChange={e => setForm(f => ({ ...f, issue: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input className="inp" type="number" placeholder={t('repairCost')} value={form.cost_rub} onChange={e => setForm(f => ({ ...f, cost_rub: e.target.value }))} />
            <input className="inp" placeholder={t('technician')} value={form.technician} onChange={e => setForm(f => ({ ...f, technician: e.target.value }))} />
          </div>
          <label className="flex items-center gap-2 text-sm mb-3">
            <input type="checkbox" checked={form.is_warranty} onChange={e => setForm(f => ({ ...f, is_warranty: e.target.checked }))} /> {t('warrantyCase')}
          </label>
          <button className="btn btn-primary">{t('save')}</button>
        </form>
      )}

      <div className="card">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase text-text3 border-b border-border">
              <th className="pb-2">{t('date')}</th><th className="pb-2">Устройство</th><th className="pb-2">{t('client')}</th>
              <th className="pb-2">Гарантия</th><th className="pb-2">Статус</th><th className="pb-2">{t('repairCost')}</th><th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {orders.map(o => {
              const [labelKey, cls] = STATUS_LABELS[o.status] || ['inProgress', 'badge-yellow'];
              return (
                <tr key={o.id} className="border-b border-border last:border-0">
                  <td className="py-2 text-text3">{new Date(o.received_date).toLocaleDateString('ru-RU')}</td>
                  <td className="py-2">
                    {o.serial_id
                      ? <Link to={`/serials/${o.serial_id}`} className="hover:text-accent2">{o.brand} {o.series} <span className="font-mono text-text3">({o.serial})</span></Link>
                      : <span>{o.device_label} <span className="badge badge-blue text-[10px] ml-1">внешний</span></span>}
                  </td>
                  <td className="py-2 text-text3">{o.client_name || '—'}</td>
                  <td className="py-2">{o.is_warranty ? <span className="badge badge-green">Да</span> : <span className="text-text3">Нет</span>}</td>
                  <td className="py-2">
                    {canEdit ? (
                      <select className="inp text-xs py-1" value={o.status} onChange={e => updateStatus(o, e.target.value)}>
                        <option value="in_progress">{t('inProgress')}</option>
                        <option value="done">{t('doneStatus')}</option>
                        <option value="issued">{t('issued')}</option>
                        <option value="declined">{t('declined')}</option>
                      </select>
                    ) : <span className={`badge ${cls}`}>{t(labelKey)}</span>}
                  </td>
                  <td className="py-2 font-mono">{Math.round(o.cost_rub).toLocaleString('ru-RU')} ₽</td>
                  <td className="py-2 text-text3 text-xs max-w-[160px] truncate" title={o.issue}>{o.issue}</td>
                </tr>
              );
            })}
            {!orders.length && <tr><td colSpan={7} className="text-center py-6 text-text3">Нет заявок</td></tr>}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
