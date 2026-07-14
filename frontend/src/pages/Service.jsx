import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';
import { useTT } from '../i18n/useTT';

// Этапы ремонта — как в старой версии (отправка в Китай), у каждого устройства свой этап
const STAGES = [
  ['received', '📥', 'Принят на ремонт'],
  ['consolidation', '📦', 'Консолидация'],
  ['sent_cn', '✈️', 'Отправлен в Китай'],
  ['in_repair', '🔧', 'На ремонте в Китае'],
  ['returning', '📬', 'Возвращается из Китая'],
  ['ready', '✅', 'Готов к выдаче'],
  ['done', '🏁', 'Выдан клиенту'],
];
const STAGE_MAP = Object.fromEntries(STAGES.map(([id, ico, label]) => [id, { ico, label }]));
const STAGE_BADGE = { received: 'badge-blue', consolidation: 'badge-blue', sent_cn: 'badge-yellow', in_repair: 'badge-yellow', returning: 'badge-yellow', ready: 'badge-green', done: 'badge-green' };

const emptyItem = { kind: 'external', device_label: '', serial_input: '', found_serial: null, issue: '', is_warranty: false, cost_cny: '', technician: '', expected_date: '' };

export default function Service() {
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [rate, setRate] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [clientId, setClientId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([{ ...emptyItem }]);
  const [expanded, setExpanded] = useState({});
  const { can } = useAuth();
  const { t } = useLang();
  const tt = useTT();
  const canEdit = can('service', 'edit');

  function load() {
    api.get('/service').then(r => setOrders(r.data));
    api.get('/clients').then(r => setClients(r.data));
    api.get('/settings/public-rate').then(r => setRate(r.data.rate));
  }
  useEffect(load, []);

  useEffect(() => {
    const cid = sessionStorage.getItem('bp_service_client');
    if (cid) {
      sessionStorage.removeItem('bp_service_client');
      setClientId(cid);
      setShowForm(true);
    }
  }, []);

  function updateItem(i, patch) {
    setItems(arr => arr.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  }
  function addItemRow() { setItems(arr => [...arr, { ...emptyItem }]); }
  function removeItemRow(i) { setItems(arr => arr.filter((_, idx) => idx !== i)); }

  async function checkSerial(i, serial) {
    updateItem(i, { serial_input: serial });
    if (!serial.trim()) { updateItem(i, { found_serial: null }); return; }
    try {
      const { data } = await api.get(`/service/lookup-serial/${encodeURIComponent(serial.trim())}`);
      updateItem(i, { found_serial: data });
      // Автоподстановка клиента, если этот ноутбук уже кому-то продавался
      if (data.sale_client_id && !clientId) setClientId(data.sale_client_id);
    } catch {
      updateItem(i, { found_serial: null });
    }
  }

  async function submit(e) {
    e.preventDefault();
    const payload = items
      .filter(it => (it.kind === 'own_stock' && it.found_serial) || (it.kind === 'external' && it.device_label.trim()))
      .map(it => ({
        kind: it.kind, serial_id: it.found_serial?.id || null, device_label: it.kind === 'external' ? it.device_label : null,
        issue: it.issue, is_warranty: it.is_warranty, cost_cny: it.cost_cny || 0, technician: it.technician, expected_date: it.expected_date || null,
      }));
    if (!payload.length) return;
    await api.post('/service', { client_id: clientId || null, notes, items: payload });
    setShowForm(false); setClientId(''); setNotes(''); setItems([{ ...emptyItem }]);
    load();
  }

  async function addItemToOrder(orderId) {
    const kind = confirm(tt('Это наш ноутбук (сканировать серийник)?\nOK — наш, Отмена — внешнее устройство')) ? 'own_stock' : 'external';
    if (kind === 'own_stock') {
      const serial = prompt(tt('Введите серийный номер:'));
      if (!serial) return;
      try {
        const { data } = await api.get(`/service/lookup-serial/${encodeURIComponent(serial.trim())}`);
        const issue = prompt(tt('Описание неисправности:')) || '';
        await api.post(`/service/${orderId}/items`, { kind: 'own_stock', serial_id: data.id, issue });
      } catch {
        alert(tt('Серийник не найден'));
        return;
      }
    } else {
      const device_label = prompt(tt('Марка/модель устройства:'));
      if (!device_label) return;
      const issue = prompt(tt('Описание неисправности:')) || '';
      await api.post(`/service/${orderId}/items`, { kind: 'external', device_label, issue });
    }
    load();
  }

  async function changeStage(orderId, item, stage) {
    const body = { stage };
    if (stage === 'sent_cn') {
      const trk = prompt(tt('Введите трек-номер (необязательно):'), item.tracking || '');
      if (trk !== null) body.tracking = trk;
    }
    if (stage === 'done' && item.serial_id) {
      const rs = prompt(tt('Какой статус присвоить серийнику после ремонта? (например: Склад (восст.), Гарантия КНР)'), 'Склад (восст.)');
      if (rs) body.return_status = rs;
    }
    await api.put(`/service/${orderId}/items/${item.id}`, body);
    load();
  }

  async function notifyItem(orderId, itemId) {
    await api.post(`/service/${orderId}/items/${itemId}/notify`);
    alert('✅ ' + tt('Уведомление отправлено'));
  }

  async function removeItem(orderId, itemId) {
    if (!confirm(tt('Удалить позицию?'))) return;
    await api.delete(`/service/${orderId}/items/${itemId}`);
    load();
  }

  function toggleExpand(id) { setExpanded(e => ({ ...e, [id]: !e[id] })); }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-black">🔧 {t('service')}</h1>
        {canEdit && <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>{t('newServiceOrder')}</button>}
      </div>

      {showForm && canEdit && (
        <form onSubmit={submit} className="card mb-5">
          <select className="inp mb-3" value={clientId} onChange={e => setClientId(e.target.value)}>
            <option value="">{t('chooseClientOpt')}</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <div className="font-bold text-xs uppercase text-text3 mb-2">{tt('Позиции заявки')}</div>
          {items.map((it, i) => (
            <div key={i} className="bg-bg3 rounded-xl p-3 mb-3">
              <div className="flex gap-3 mb-2 text-sm">
                <label className="flex items-center gap-1"><input type="radio" checked={it.kind === 'own_stock'} onChange={() => updateItem(i, { kind: 'own_stock' })} /> {t('ourDevice')}</label>
                <label className="flex items-center gap-1"><input type="radio" checked={it.kind === 'external'} onChange={() => updateItem(i, { kind: 'external' })} /> {t('externalDevice')}</label>
                {items.length > 1 && <button type="button" className="ml-auto text-red text-xs" onClick={() => removeItemRow(i)}>✕ {tt('убрать')}</button>}
              </div>
              {it.kind === 'own_stock' ? (
                <div className="mb-2">
                  <input className="inp" placeholder={t('scanSerial')} value={it.serial_input} onChange={e => checkSerial(i, e.target.value)} />
                  {it.serial_input && !it.found_serial && <div className="text-red text-xs mt-1">{tt('Не найден')}</div>}
                  {it.found_serial && <div className="text-xs text-green mt-1">✓ {it.found_serial.brand} {it.found_serial.series} — {it.found_serial.status_id}{it.found_serial.sale_client_name && ` · ${tt('продан')}: ${it.found_serial.sale_client_name}`}</div>}
                </div>
              ) : (
                <input className="inp mb-2" placeholder={t('deviceLabel')} value={it.device_label} onChange={e => updateItem(i, { device_label: e.target.value })} />
              )}
              <textarea className="inp mb-2" placeholder={tt('Описание неисправности')} value={it.issue} onChange={e => updateItem(i, { issue: e.target.value })} />
              <div className="grid grid-cols-2 gap-2 mb-2">
                <input className="inp" type="number" placeholder={tt('Стоимость ремонта (¥)')} value={it.cost_cny} onChange={e => updateItem(i, { cost_cny: e.target.value })} />
                <input className="inp" placeholder={t('technician')} value={it.technician} onChange={e => updateItem(i, { technician: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="block text-[11px] text-text2 mb-1">{tt('Ожидаемая дата возврата')}</label>
                  <input className="inp" type="date" value={it.expected_date} onChange={e => updateItem(i, { expected_date: e.target.value })} />
                </div>
                <label className="flex items-center gap-2 text-sm self-end pb-2">
                  <input type="checkbox" checked={it.is_warranty} onChange={e => updateItem(i, { is_warranty: e.target.checked })} /> {t('warrantyCase')}
                </label>
              </div>
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm mb-3" onClick={addItemRow}>+ {tt('Ещё устройство')}</button>
          <textarea className="inp mb-3" placeholder={tt('Общий комментарий по заявке')} value={notes} onChange={e => setNotes(e.target.value)} />
          <button className="btn btn-primary">{t('save')}</button>
        </form>
      )}

      <div className="space-y-3">
        {orders.map(o => {
          const allDone = o.items.length > 0 && o.items.every(it => it.stage === 'done');
          return (
            <div key={o.id} className="card">
              <div className="flex justify-between items-center flex-wrap gap-2 cursor-pointer" onClick={() => toggleExpand(o.id)}>
                <div>
                  <div className="font-bold text-sm">{o.client_name || tt('Без клиента')} <span className="text-text3 font-normal">· {o.items.length} {tt('поз.')}</span></div>
                  <div className="text-xs text-text3">{new Date(o.received_date).toLocaleDateString('ru-RU')}{o.completed_date && ` · ${tt('завершено')} ${new Date(o.completed_date).toLocaleDateString('ru-RU')}`}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge ${allDone ? 'badge-green' : 'badge-yellow'}`}>{allDone ? t('done') : tt('В работе')}</span>
                  <span className="text-text3 text-xs">{expanded[o.id] ? '▲' : '▼'}</span>
                </div>
              </div>

              {expanded[o.id] && (
                <div className="mt-3 pt-3 border-t border-border space-y-3">
                  {o.items.map(it => {
                    const st = STAGE_MAP[it.stage] || STAGE_MAP.received;
                    const isOverdue = it.expected_date && new Date(it.expected_date) < new Date() && it.stage !== 'done' && it.stage !== 'ready';
                    return (
                      <div key={it.id} className="bg-bg3 rounded-xl p-3">
                        <div className="flex justify-between items-start flex-wrap gap-2">
                          <div className="min-w-0">
                            {it.serial_id
                              ? <Link to={`/serials/${it.serial_id}`} className="hover:text-accent2 font-medium">{it.brand} {it.series} <span className="font-mono text-text3 text-xs">({it.serial})</span></Link>
                              : <span className="font-medium">{it.device_label} <span className="badge badge-blue text-[10px] ml-1">{tt('внешний')}</span></span>}
                            <div className="text-xs text-text3 truncate max-w-xs" title={it.issue}>{it.issue}</div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {it.is_warranty && <span className="badge badge-green text-[10px]">{t('warrantyCase')}</span>}
                            {Number(it.cost_cny) > 0 && <span className="font-mono text-xs text-yellow">¥{it.cost_cny} <span className="text-text3">≈{Math.round(it.cost_cny * rate).toLocaleString('ru-RU')}₽</span></span>}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap mt-2">
                          <span className={`badge ${STAGE_BADGE[it.stage] || 'badge-blue'}`}>{st.ico} {tt(st.label)}</span>
                          {it.tracking && <span className="badge badge-blue text-[10px]">📦 {it.tracking}</span>}
                          {it.expected_date && (
                            <span className={`badge text-[10px] ${isOverdue ? 'badge-red' : 'badge-blue'}`}>⏰ {new Date(it.expected_date).toLocaleDateString('ru-RU')}{isOverdue && ' ⚠️'}</span>
                          )}
                        </div>

                        {canEdit && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {STAGES.filter(([id]) => id !== it.stage).map(([id, ico, label]) => (
                              <button key={id} className="btn btn-secondary text-[10px] px-2 py-1" onClick={() => changeStage(o.id, it, id)}>→ {ico} {tt(label)}</button>
                            ))}
                            <button className="text-text3 hover:text-accent2 text-xs px-1" onClick={() => notifyItem(o.id, it.id)} title={tt('Отправить уведомление клиенту')}>📤</button>
                            <button className="text-text3 hover:text-red text-xs px-1" onClick={() => removeItem(o.id, it.id)}>✕</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {canEdit && (
                    <button className="btn btn-secondary btn-sm w-full justify-center" onClick={() => addItemToOrder(o.id)}>+ {tt('Добавить устройство в эту заявку')}</button>
                  )}
                  {o.notes && <div className="text-xs text-text3 mt-2">💬 {o.notes}</div>}
                </div>
              )}
            </div>
          );
        })}
        {!orders.length && <div className="card text-center text-text3 py-6">{tt('Нет заявок')}</div>}
      </div>
    </div>
  );
}
