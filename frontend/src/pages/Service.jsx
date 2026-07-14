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

// Единая форма устройства — используется и при создании новой заявки, и при добавлении/
// редактировании устройства в уже существующей заявке. Чтобы поведение было предсказуемым
// и одинаковым везде, а не разным набором действий как раньше.
function DeviceForm({ value, onChange, onLookupSerial, showRemove, onRemove, canChangeKind = true }) {
  const tt = useTT();
  const { t } = useLang();
  const it = value;
  return (
    <div className="bg-bg3 rounded-xl p-3 mb-3">
      {canChangeKind && (
        <div className="flex gap-3 mb-2 text-sm">
          <label className="flex items-center gap-1"><input type="radio" checked={it.kind === 'own_stock'} onChange={() => onChange({ kind: 'own_stock' })} /> {t('ourDevice')}</label>
          <label className="flex items-center gap-1"><input type="radio" checked={it.kind === 'external'} onChange={() => onChange({ kind: 'external' })} /> {t('externalDevice')}</label>
          {showRemove && <button type="button" className="ml-auto text-red text-xs" onClick={onRemove}>✕ {tt('убрать')}</button>}
        </div>
      )}
      {it.kind === 'own_stock' ? (
        <div className="mb-2">
          <input className="inp" placeholder={t('scanSerial')} value={it.serial_input} onChange={e => onLookupSerial(e.target.value)} disabled={!canChangeKind && it.found_serial} />
          {it.serial_input && !it.found_serial && <div className="text-red text-xs mt-1">{tt('Не найден')}</div>}
          {it.found_serial && <div className="text-xs text-green mt-1">✓ {it.found_serial.brand} {it.found_serial.series} — {it.found_serial.status_id}</div>}
        </div>
      ) : (
        <input className="inp mb-2" placeholder={t('deviceLabel')} value={it.device_label} onChange={e => onChange({ device_label: e.target.value })} disabled={!canChangeKind} />
      )}
      <textarea className="inp mb-2" placeholder={tt('Описание неисправности')} value={it.issue} onChange={e => onChange({ issue: e.target.value })} />
      <div className="grid grid-cols-2 gap-2 mb-2">
        <input className="inp" type="number" placeholder={tt('Стоимость ремонта (¥)')} value={it.cost_cny} onChange={e => onChange({ cost_cny: e.target.value })} />
        <input className="inp" placeholder={t('technician')} value={it.technician} onChange={e => onChange({ technician: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] text-text2 mb-1">{tt('Ожидаемая дата возврата')}</label>
          <input className="inp" type="date" value={it.expected_date} onChange={e => onChange({ expected_date: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 text-sm self-end pb-2">
          <input type="checkbox" checked={it.is_warranty} onChange={e => onChange({ is_warranty: e.target.checked })} /> {t('warrantyCase')}
        </label>
      </div>
    </div>
  );
}

export default function Service() {
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [rate, setRate] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [clientId, setClientId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([{ ...emptyItem }]);
  const [expanded, setExpanded] = useState({});
  // Инлайн-форма добавления/редактирования устройства внутри уже существующей заявки:
  // { orderId, itemId (null = добавление нового), form }
  const [inlineForm, setInlineForm] = useState(null);
  const [inlineSaving, setInlineSaving] = useState(false);
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

  async function checkSerial(i, serial, isNewOrderForm = true) {
    if (isNewOrderForm) updateItem(i, { serial_input: serial });
    if (!serial.trim()) {
      if (isNewOrderForm) updateItem(i, { found_serial: null });
      return;
    }
    try {
      const { data } = await api.get(`/service/lookup-serial/${encodeURIComponent(serial.trim())}`);
      if (isNewOrderForm) {
        updateItem(i, { found_serial: data });
        if (data.sale_client_id && !clientId) setClientId(data.sale_client_id);
      }
      return data;
    } catch {
      if (isNewOrderForm) updateItem(i, { found_serial: null });
      return null;
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

  // Открыть инлайн-форму: null itemId — добавление нового устройства в заявку,
  // существующий itemId — редактирование уже добавленного (доступно на ЛЮБОМ этапе)
  function openAddDevice(orderId) {
    setInlineForm({ orderId, itemId: null, form: { ...emptyItem } });
  }
  function openEditDevice(orderId, item) {
    setInlineForm({
      orderId, itemId: item.id,
      form: {
        kind: item.kind, device_label: item.kind === 'external' ? item.device_label : '',
        serial_input: item.serial || '', found_serial: item.serial_id ? { id: item.serial_id, brand: item.brand, series: item.series, status_id: '' } : null,
        issue: item.issue || '', is_warranty: item.is_warranty, cost_cny: item.cost_cny || '', technician: item.technician || '',
        expected_date: item.expected_date ? item.expected_date.slice(0, 10) : '',
      },
    });
  }
  function updateInlineForm(patch) { setInlineForm(f => ({ ...f, form: { ...f.form, ...patch } })); }
  async function inlineLookupSerial(serial) {
    updateInlineForm({ serial_input: serial });
    const data = await checkSerial(0, serial, false);
    updateInlineForm({ found_serial: data || null });
  }

  async function saveInlineForm() {
    const { orderId, itemId, form } = inlineForm;
    setInlineSaving(true);
    try {
      if (itemId) {
        await api.put(`/service/${orderId}/items/${itemId}`, {
          issue: form.issue, cost_cny: form.cost_cny || 0, technician: form.technician,
          is_warranty: form.is_warranty, expected_date: form.expected_date || null,
        });
      } else {
        if ((form.kind === 'own_stock' && !form.found_serial) || (form.kind === 'external' && !form.device_label.trim())) {
          alert(tt('Укажи серийник или марку устройства')); setInlineSaving(false); return;
        }
        await api.post(`/service/${orderId}/items`, {
          kind: form.kind, serial_id: form.found_serial?.id || null, device_label: form.kind === 'external' ? form.device_label : null,
          issue: form.issue, is_warranty: form.is_warranty, cost_cny: form.cost_cny || 0, technician: form.technician, expected_date: form.expected_date || null,
        });
      }
      setInlineForm(null);
      load();
    } catch (e2) {
      alert(e2.response?.data?.error || 'Ошибка');
    } finally { setInlineSaving(false); }
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

  async function removeOrder(orderId) {
    if (!confirm(tt('Удалить всю заявку целиком со всеми устройствами в ней? Это нельзя отменить.'))) return;
    await api.delete(`/service/${orderId}`);
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
            <DeviceForm
              key={i} value={it}
              onChange={patch => updateItem(i, patch)}
              onLookupSerial={val => checkSerial(i, val, true)}
              showRemove={items.length > 1} onRemove={() => removeItemRow(i)}
            />
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
                    const stageIdx = STAGES.findIndex(([id]) => id === it.stage);
                    const nextStage = stageIdx >= 0 && stageIdx < STAGES.length - 1 ? STAGES[stageIdx + 1] : null;
                    const isOverdue = it.expected_date && new Date(it.expected_date) < new Date() && it.stage !== 'done' && it.stage !== 'ready';
                    const isEditingThis = inlineForm && inlineForm.itemId === it.id;
                    return (
                      <div key={it.id} className="bg-bg3 rounded-xl p-3">
                        {isEditingThis ? (
                          <>
                            <DeviceForm value={inlineForm.form} onChange={patch => updateInlineForm(patch)} onLookupSerial={() => {}} canChangeKind={false} />
                            <div className="flex gap-2">
                              <button className="btn btn-primary btn-sm" onClick={saveInlineForm} disabled={inlineSaving}>{inlineSaving ? tt('Сохраняю...') : t('save')}</button>
                              <button className="text-text3 text-xs hover:text-text" onClick={() => setInlineForm(null)}>{t('cancel')}</button>
                            </div>
                          </>
                        ) : (
                          <>
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
                              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                {nextStage && (
                                  <button className="btn btn-primary text-[11px] px-2.5 py-1" onClick={() => changeStage(o.id, it, nextStage[0])}>
                                    → {nextStage[1]} {tt(nextStage[2])}
                                  </button>
                                )}
                                <select className="inp inp-sm w-auto" value="" onChange={e => e.target.value && changeStage(o.id, it, e.target.value)}>
                                  <option value="">{tt('Другой этап...')}</option>
                                  {STAGES.filter(([id]) => id !== it.stage).map(([id, ico, label]) => (
                                    <option key={id} value={id}>{ico} {tt(label)}</option>
                                  ))}
                                </select>
                                <button className="btn btn-secondary text-[11px] px-2 py-1" onClick={() => openEditDevice(o.id, it)}>✏️ {tt('Редактировать')}</button>
                                <button className="text-text3 hover:text-accent2 text-xs px-1" onClick={() => notifyItem(o.id, it.id)} title={tt('Отправить уведомление клиенту')}>📤</button>
                                <button className="text-text3 hover:text-red text-xs px-1" onClick={() => removeItem(o.id, it.id)}>✕</button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}

                  {inlineForm && inlineForm.orderId === o.id && inlineForm.itemId === null && (
                    <div>
                      <DeviceForm value={inlineForm.form} onChange={patch => updateInlineForm(patch)} onLookupSerial={inlineLookupSerial} />
                      <div className="flex gap-2 -mt-1 mb-1">
                        <button className="btn btn-primary btn-sm" onClick={saveInlineForm} disabled={inlineSaving}>{inlineSaving ? tt('Сохраняю...') : tt('Добавить')}</button>
                        <button className="text-text3 text-xs hover:text-text" onClick={() => setInlineForm(null)}>{t('cancel')}</button>
                      </div>
                    </div>
                  )}

                  {canEdit && !(inlineForm && inlineForm.orderId === o.id) && (
                    <button className="btn btn-secondary btn-sm w-full justify-center" onClick={() => openAddDevice(o.id)}>+ {tt('Добавить устройство в эту заявку')}</button>
                  )}
                  {o.notes && <div className="text-xs text-text3 mt-2">💬 {o.notes}</div>}
                  {canEdit && (
                    <button className="text-red text-xs hover:underline block mt-2" onClick={() => removeOrder(o.id)}>🗑️ {tt('Удалить всю заявку')}</button>
                  )}
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
