import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';
import { useTT } from '../i18n/useTT';

// 7 реальных этапов ремонта (бизнес-логика и API не менялись — это те же значения,
// что уже используются на бэкенде). У каждого — свой цвет, чтобы не всё было красным.
const STAGES = [
  ['received', '📥', 'Принят на ремонт', 'blue'],
  ['consolidation', '📦', 'Консолидация', 'orange'],
  ['sent_cn', '✈️', 'Отправлен в КНР', 'rose'],
  ['in_repair', '🔧', 'На ремонте в Китае', 'red'],
  ['returning', '🚚', 'Возвращается из Китая', 'cyan'],
  ['ready', '📍', 'Готов к выдаче', 'emerald'],
  ['done', '✅', 'Выдан клиенту', 'green'],
];
const STAGE_MAP = Object.fromEntries(STAGES.map(([id, ico, label, color], i) => [id, { ico, label, color, index: i }]));
const COLOR = {
  blue: { text: 'text-blue-400', bg: 'bg-blue-500/15', dot: 'bg-blue-500', ring: 'ring-blue-500' },
  orange: { text: 'text-orange-400', bg: 'bg-orange-500/15', dot: 'bg-orange-500', ring: 'ring-orange-500' },
  rose: { text: 'text-rose-400', bg: 'bg-rose-500/15', dot: 'bg-rose-500', ring: 'ring-rose-500' },
  red: { text: 'text-red', bg: 'bg-red/15', dot: 'bg-red', ring: 'ring-red' },
  cyan: { text: 'text-cyan-400', bg: 'bg-cyan-500/15', dot: 'bg-cyan-500', ring: 'ring-cyan-500' },
  emerald: { text: 'text-emerald-400', bg: 'bg-emerald-500/15', dot: 'bg-emerald-500', ring: 'ring-emerald-500' },
  green: { text: 'text-green', bg: 'bg-green/15', dot: 'bg-green', ring: 'ring-green' },
};
const STAGE_NORM_DAYS = 10; // норматив дней на этап по умолчанию

const emptyItem = { kind: 'external', device_label: '', serial_input: '', found_serial: null, issue: '', is_warranty: false, cost_cny: '', technician: '', expected_date: '' };

function daysBetween(a, b) { return Math.floor((b - a) / 86400000); }

function warrantyInfo(item) {
  if (!item.sale_date || !item.warranty_months) return null;
  const end = new Date(item.sale_date);
  end.setMonth(end.getMonth() + Number(item.warranty_months));
  const daysLeft = daysBetween(new Date(), end);
  return { end, active: daysLeft >= 0, daysLeft };
}

// ===== Единая форма устройства — для создания заявки и для редактирования (бизнес-логика та же) =====
function DeviceForm({ value, onChange, onLookupSerial, showRemove, onRemove, canChangeKind = true }) {
  const tt = useTT();
  const { t } = useLang();
  const it = value;
  return (
    <div className="bg-bg3 rounded-2xl p-4 mb-3">
      {canChangeKind && (
        <div className="flex gap-4 mb-3 text-sm">
          <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" checked={it.kind === 'own_stock'} onChange={() => onChange({ kind: 'own_stock' })} /> {t('ourDevice')}</label>
          <label className="flex items-center gap-1.5 cursor-pointer"><input type="radio" checked={it.kind === 'external'} onChange={() => onChange({ kind: 'external' })} /> {t('externalDevice')}</label>
          {showRemove && <button type="button" className="ml-auto text-red text-xs hover:underline" onClick={onRemove}>✕ {tt('убрать')}</button>}
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
        <label className="flex items-center gap-2 text-sm self-end pb-2 cursor-pointer">
          <input type="checkbox" checked={it.is_warranty} onChange={e => onChange({ is_warranty: e.target.checked })} /> {t('warrantyCase')}
        </label>
      </div>
    </div>
  );
}

// ===== Горизонтальный Timeline: пройденные этапы зелёные, текущий подсвечен своим цветом, будущие серые =====
function StageTimeline({ currentStage, dates = {} }) {
  const tt = useTT();
  const curIdx = STAGE_MAP[currentStage]?.index ?? 0;
  return (
    <div className="overflow-x-auto overflow-y-hidden -mx-1 px-1 pt-2 pb-1">
      <div className="flex items-start min-w-[640px] sm:min-w-0">
        {STAGES.map(([id, ico, label, color], i) => {
          const isDone = i < curIdx;
          const isCurrent = i === curIdx;
          const c = COLOR[color];
          return (
            <div key={id} className="flex-1 flex flex-col items-center relative">
              {i > 0 && (
                <div className={`absolute top-4 right-1/2 w-full h-0.5 transition-colors duration-500 ${i <= curIdx ? 'bg-green' : 'bg-border'}`} style={{ zIndex: 0 }} />
              )}
              <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all duration-300
                ${isDone ? 'bg-green text-white' : isCurrent ? `${c.dot} text-white ring-4 ${c.ring}/25 scale-110` : 'bg-bg3 border border-border text-text3'}`}>
                {isDone ? '✓' : ico}
              </div>
              <div className={`text-[10px] text-center mt-2 px-1 leading-tight ${isCurrent ? `${c.text} font-bold` : isDone ? 'text-text2' : 'text-text3'}`}>{tt(label)}</div>
              {dates[id] && <div className="text-[9px] text-text3 mt-0.5">{dates[id]}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProgressBar({ currentStage }) {
  const tt = useTT();
  const total = STAGES.length;
  const idx = STAGE_MAP[currentStage]?.index ?? 0;
  const pct = Math.round(((idx + 1) / total) * 100);
  return (
    <div>
      <div className="h-2 bg-bg3 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-accent to-accent2 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[11px] text-text3 mt-1">
        <span>{idx + 1} {tt('из')} {total} {tt('этапов')}</span>
        <span>{pct}%</span>
      </div>
    </div>
  );
}

// ===== Карточка гарантии — по дате продажи + сроку гарантии на самом серийнике =====
function WarrantyBadge({ item }) {
  const tt = useTT();
  const w = warrantyInfo(item);
  if (!w) return <span className="badge bg-bg4 text-text3 text-xs">{tt('Гарантия неизвестна')}</span>;
  return w.active
    ? <span className="badge badge-green text-xs">🟢 {tt('Гарантия действует')}</span>
    : <span className="badge badge-red text-xs">🔴 {tt('Гарантия закончилась')}</span>;
}

export default function Service() {
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [rate, setRate] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [clientId, setClientId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([{ ...emptyItem }]);
  const [inlineForm, setInlineForm] = useState(null);
  const [inlineSaving, setInlineSaving] = useState(false);
  const [editingClientFor, setEditingClientFor] = useState(null);

  const [searchMode, setSearchMode] = useState('serial'); // serial | client
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedKey, setSelectedKey] = useState(null); // `${orderId}:${itemId}` — устройство в большой карточке
  const [stageHistory, setStageHistory] = useState({}); // itemId -> [{stage, created_at}]
  const [confirmStage, setConfirmStage] = useState(null); // { orderId, item, stage }
  const [showHistoryFor, setShowHistoryFor] = useState(null);

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
    if (cid) { sessionStorage.removeItem('bp_service_client'); setClientId(cid); setShowForm(true); }
  }, []);

  // Плоский список всех устройств во всех заявках — удобно для статистики, поиска, таблицы
  const allDevices = useMemo(() => {
    const list = [];
    orders.forEach(o => o.items.forEach(it => list.push({ ...it, order: o })));
    return list;
  }, [orders]);

  const stats = useMemo(() => {
    const byStage = {};
    STAGES.forEach(([id]) => { byStage[id] = 0; });
    let overdue = 0;
    allDevices.forEach(d => {
      byStage[d.stage] = (byStage[d.stage] || 0) + 1;
      if (d.expected_date && new Date(d.expected_date) < new Date() && d.stage !== 'done') overdue++;
    });
    return { total: allDevices.length, byStage, overdue, done: byStage.done || 0 };
  }, [allDevices]);

  const filteredDevices = useMemo(() => {
    let list = allDevices;
    if (filter === 'warranty') list = list.filter(d => d.is_warranty);
    else if (filter === 'nowarranty') list = list.filter(d => !d.is_warranty);
    else if (filter === 'overdue') list = list.filter(d => d.expected_date && new Date(d.expected_date) < new Date() && d.stage !== 'done');
    else if (filter === 'inrepair') list = list.filter(d => !['ready', 'done'].includes(d.stage));
    else if (filter === 'ready') list = list.filter(d => d.stage === 'ready');
    else if (filter === 'done') list = list.filter(d => d.stage === 'done');

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      if (searchMode === 'serial') {
        list = list.filter(d => (d.serial || '').toLowerCase().includes(q) || (d.brand || '').toLowerCase().includes(q) || (d.series || '').toLowerCase().includes(q) || (d.device_label || '').toLowerCase().includes(q));
      } else {
        list = list.filter(d => (d.order.client_name || '').toLowerCase().includes(q) || d.order.id.toLowerCase().includes(q));
      }
    }
    return list;
  }, [allDevices, filter, searchQuery, searchMode]);

  const selectedDevice = useMemo(() => {
    if (!selectedKey) return null;
    return allDevices.find(d => `${d.order.id}:${d.id}` === selectedKey) || null;
  }, [selectedKey, allDevices]);

  useEffect(() => {
    if (selectedDevice && !stageHistory[selectedDevice.id]) {
      api.get(`/service/${selectedDevice.order.id}/items/${selectedDevice.id}/history`)
        .then(r => setStageHistory(h => ({ ...h, [selectedDevice.id]: r.data })))
        .catch(() => {});
    }
  }, [selectedDevice]);

  function updateItem(i, patch) { setItems(arr => arr.map((it, idx) => idx === i ? { ...it, ...patch } : it)); }
  function addItemRow() { setItems(arr => [...arr, { ...emptyItem }]); }
  function removeItemRow(i) { setItems(arr => arr.filter((_, idx) => idx !== i)); }

  async function checkSerial(i, serial, isNewOrderForm = true) {
    if (isNewOrderForm) updateItem(i, { serial_input: serial });
    if (!serial.trim()) { if (isNewOrderForm) updateItem(i, { found_serial: null }); return; }
    try {
      const { data } = await api.get(`/service/lookup-serial/${encodeURIComponent(serial.trim())}`);
      if (isNewOrderForm) { updateItem(i, { found_serial: data }); if (data.sale_client_id && !clientId) setClientId(data.sale_client_id); }
      return data;
    } catch { if (isNewOrderForm) updateItem(i, { found_serial: null }); return null; }
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

  function openAddDevice(orderId) { setInlineForm({ orderId, itemId: null, form: { ...emptyItem } }); }
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
    } catch (e2) { alert(e2.response?.data?.error || 'Ошибка'); } finally { setInlineSaving(false); }
  }

  // Смена этапа теперь всегда идёт через модалку подтверждения (по требованию нового UX)
  function requestStageChange(orderId, item, stage) { setConfirmStage({ orderId, item, stage, tracking: item.tracking || '', returnStatus: 'Склад (восст.)' }); }
  async function confirmStageChange() {
    const { orderId, item, stage, tracking, returnStatus } = confirmStage;
    const body = { stage };
    if (stage === 'sent_cn') body.tracking = tracking;
    if (stage === 'done' && item.serial_id) body.return_status = returnStatus;
    await api.put(`/service/${orderId}/items/${item.id}`, body);
    setConfirmStage(null);
    setStageHistory(h => { const n = { ...h }; delete n[item.id]; return n; }); // перезагрузим историю при следующем показе
    load();
  }

  async function notifyItem(orderId, itemId) { await api.post(`/service/${orderId}/items/${itemId}/notify`); alert('✅ ' + tt('Уведомление отправлено')); }
  async function removeItem(orderId, itemId) { if (!confirm(tt('Удалить позицию?'))) return; await api.delete(`/service/${orderId}/items/${itemId}`); load(); }
  async function removeOrder(orderId) { if (!confirm(tt('Удалить всю заявку целиком со всеми устройствами в ней? Это нельзя отменить.'))) return; await api.delete(`/service/${orderId}`); load(); }
  async function changeOrderClient(orderId, newClientId) { await api.put(`/service/${orderId}`, { client_id: newClientId || null }); setEditingClientFor(null); load(); }

  const STAT_CARDS = [
    ['📋', tt('Всего случаев'), stats.total, null],
    ...STAGES.map(([id, ico, label, color]) => [ico, tt(label), stats.byStage[id] || 0, color]),
  ];

  return (
    <div className="pb-10">
      <div className="flex justify-between items-start flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2">🔧 {t('service')}</h1>
          <div className="text-text3 text-sm mt-0.5">{tt('Управление сервисными случаями и ремонтом ноутбуков')}</div>
        </div>
        {canEdit && <button className="btn btn-primary shadow-glow" onClick={() => setShowForm(s => !s)}>{t('newServiceOrder')}</button>}
      </div>

      {/* ===== Статистика сверху ===== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 mb-6">
        {STAT_CARDS.map(([ico, label, value, color], i) => {
          const c = color ? COLOR[color] : null;
          return (
            <div key={i} className="card py-3 px-3.5 hover:border-accent/40 transition-colors duration-200">
              <div className="flex items-center gap-1.5 text-[11px] text-text3 mb-1 truncate">
                <span className={c ? c.text : ''}>{ico}</span> <span className="truncate">{label}</span>
              </div>
              <div className={`text-xl font-black ${c ? c.text : ''}`}>{value}</div>
            </div>
          );
        })}
      </div>

      {showForm && canEdit && (
        <form onSubmit={submit} className="card mb-6">
          <select className="inp mb-3" value={clientId} onChange={e => setClientId(e.target.value)}>
            <option value="">{t('chooseClientOpt')}</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="font-bold text-xs uppercase text-text3 mb-2">{tt('Позиции заявки')}</div>
          {items.map((it, i) => (
            <DeviceForm key={i} value={it} onChange={patch => updateItem(i, patch)} onLookupSerial={val => checkSerial(i, val, true)} showRemove={items.length > 1} onRemove={() => removeItemRow(i)} />
          ))}
          <button type="button" className="btn btn-secondary btn-sm mb-3" onClick={addItemRow}>+ {tt('Ещё устройство')}</button>
          <textarea className="inp mb-3" placeholder={tt('Общий комментарий по заявке')} value={notes} onChange={e => setNotes(e.target.value)} />
          <button className="btn btn-primary">{t('save')}</button>
        </form>
      )}

      {/* ===== Поиск ===== */}
      <div className="card mb-4 p-2">
        <div className="flex gap-1 mb-2">
          <button onClick={() => setSearchMode('serial')} className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${searchMode === 'serial' ? 'bg-accent text-white' : 'text-text3 hover:text-text'}`}>{tt('Поиск по серийному номеру')}</button>
          <button onClick={() => setSearchMode('client')} className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${searchMode === 'client' ? 'bg-accent text-white' : 'text-text3 hover:text-text'}`}>{tt('Поиск по заказу / клиенту')}</button>
        </div>
        <input
          className="inp" placeholder={searchMode === 'serial' ? tt('Введите серийный номер, бренд или модель...') : tt('Клиент или номер заказа...')}
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      {/* ===== Фильтры ===== */}
      <div className="flex gap-2 flex-wrap mb-5">
        {[
          ['all', tt('Все')], ['warranty', tt('Гарантийные')], ['nowarranty', tt('Негарантийные')],
          ['overdue', tt('Просроченные')], ['inrepair', tt('На ремонте')], ['ready', tt('Готовые')], ['done', tt('Выданные')],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filter === id ? 'bg-accent text-white' : 'bg-bg3 text-text3 hover:text-text'}`}>{label}</button>
        ))}
      </div>

      {/* ===== Большая карточка выбранного устройства ===== */}
      {selectedDevice && (
        <DeviceDetailCard
          device={selectedDevice} rate={rate} canEdit={canEdit}
          history={stageHistory[selectedDevice.id] || []}
          onStageClick={(stage) => requestStageChange(selectedDevice.order.id, selectedDevice, stage)}
          onEdit={() => openEditDevice(selectedDevice.order.id, selectedDevice)}
          onNotify={() => notifyItem(selectedDevice.order.id, selectedDevice.id)}
          onShowHistory={() => setShowHistoryFor(selectedDevice.id)}
          onDelete={() => removeItem(selectedDevice.order.id, selectedDevice.id)}
          onClose={() => setSelectedKey(null)}
        />
      )}

      {inlineForm && (
        <div className="card mb-5">
          <div className="font-bold text-sm mb-3">{inlineForm.itemId ? `✏️ ${tt('Редактировать устройство')}` : `+ ${tt('Добавить устройство в эту заявку')}`}</div>
          <DeviceForm value={inlineForm.form} onChange={patch => updateInlineForm(patch)} onLookupSerial={inlineForm.itemId ? () => {} : inlineLookupSerial} canChangeKind={!inlineForm.itemId} />
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" onClick={saveInlineForm} disabled={inlineSaving}>{inlineSaving ? tt('Сохраняю...') : t('save')}</button>
            <button className="text-text3 text-xs hover:text-text" onClick={() => setInlineForm(null)}>{t('cancel')}</button>
          </div>
        </div>
      )}

      {/* ===== Таблица всех случаев ===== */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase text-text3 border-b border-border">
                <th className="pb-2 pl-4 pt-3">{tt("Заказ")}</th>
                <th className="pb-2 pt-3">{tt("Серийный номер")}</th>
                <th className="pb-2 pt-3">{tt("Модель")}</th>
                <th className="pb-2 pt-3">{tt("Клиент")}</th>
                <th className="pb-2 pt-3">{t('warrantyCase')}</th>
                <th className="pb-2 pt-3">{tt("Текущий статус")}</th>
                <th className="pb-2 pt-3">{tt("Общее время")}</th>
                <th className="pb-2 pt-3">{tt("Плановая дата")}</th>
                <th className="pb-2 pr-4 pt-3"></th>
              </tr>
            </thead>
            <tbody>
              {filteredDevices.map(d => {
                const st = STAGE_MAP[d.stage];
                const c = COLOR[st.color];
                const days = daysBetween(new Date(d.created_at), new Date());
                const isSel = selectedDevice && selectedDevice.id === d.id;
                return (
                  <tr key={d.id} className={`border-b border-border last:border-0 hover:bg-bg3 cursor-pointer transition-colors ${isSel ? 'bg-bg3' : ''}`} onClick={() => setSelectedKey(`${d.order.id}:${d.id}`)}>
                    <td className="py-2.5 pl-4 font-mono text-xs text-text3">{d.order.id.slice(-6)}</td>
                    <td className="py-2.5 font-mono text-xs">{d.serial || '—'}</td>
                    <td className="py-2.5">{d.brand ? `${d.brand} ${d.series}` : d.device_label}</td>
                    <td className="py-2.5">{d.order.client_name || tt('Без клиента')}</td>
                    <td className="py-2.5">{d.is_warranty ? <span className="text-green text-xs">✓ {tt('Да')}</span> : <span className="text-text3 text-xs">{tt('Нет')}</span>}</td>
                    <td className="py-2.5"><span className={`badge text-[11px] ${c.bg} ${c.text}`}>{st.ico} {tt(st.label)}</span></td>
                    <td className="py-2.5 text-xs text-text3">{days} {tt('дн.')}</td>
                    <td className="py-2.5 text-xs text-text3">{d.expected_date ? new Date(d.expected_date).toLocaleDateString('ru-RU') : '—'}</td>
                    <td className="py-2.5 pr-4 text-right" onClick={e => e.stopPropagation()}>
                      <button className="text-text3 hover:text-accent2 text-xs">👁️</button>
                    </td>
                  </tr>
                );
              })}
              {!filteredDevices.length && <tr><td colSpan={9} className="text-center py-8 text-text3">{tt('Нет заявок')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Управление заявками (клиент/удаление) — компактно, под таблицей, для полноты набора действий */}
      {canEdit && selectedDevice && (
        <div className="card mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-text3">{tt('Заказ')} {selectedDevice.order.id.slice(-6)}:</span>
          {editingClientFor === selectedDevice.order.id ? (
            <select className="inp inp-sm w-auto" autoFocus defaultValue={selectedDevice.order.client_id || ''} onChange={e => changeOrderClient(selectedDevice.order.id, e.target.value)} onBlur={() => setEditingClientFor(null)}>
              <option value="">— {tt('без клиента')} —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ) : (
            <button className="text-accent2 hover:underline" onClick={() => setEditingClientFor(selectedDevice.order.id)}>✏️ {tt('Сменить клиента')}</button>
          )}
          <button className="text-text3 hover:text-accent2" onClick={() => openAddDevice(selectedDevice.order.id)}>+ {tt('Добавить устройство в эту заявку')}</button>
          <button className="text-red hover:underline ml-auto" onClick={() => removeOrder(selectedDevice.order.id)}>🗑️ {tt('Удалить всю заявку')}</button>
        </div>
      )}

      {/* ===== Модалка подтверждения смены этапа ===== */}
      {confirmStage && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setConfirmStage(null)}>
          <div className="card max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="font-bold text-sm mb-3">{tt('Подтверди смену этапа')}</div>
            <div className="text-sm mb-3">
              {tt('Перевести устройство на этап')}: <b className={COLOR[STAGE_MAP[confirmStage.stage].color].text}>{STAGE_MAP[confirmStage.stage].ico} {tt(STAGE_MAP[confirmStage.stage].label)}</b>?
            </div>
            {confirmStage.stage === 'sent_cn' && (
              <input className="inp mb-3" placeholder={tt('Трек-номер (необязательно)')} value={confirmStage.tracking} onChange={e => setConfirmStage(s => ({ ...s, tracking: e.target.value }))} />
            )}
            {confirmStage.stage === 'done' && confirmStage.item.serial_id && (
              <input className="inp mb-3" placeholder={tt('Статус серийника после ремонта')} value={confirmStage.returnStatus} onChange={e => setConfirmStage(s => ({ ...s, returnStatus: e.target.value }))} />
            )}
            <div className="text-[11px] text-text3 mb-3">{tt('Запишется дата, время и твоё имя — попадёт в историю устройства.')}</div>
            <div className="flex gap-2">
              <button className="btn btn-primary flex-1 justify-center" onClick={confirmStageChange}>{tt('Подтвердить')}</button>
              <button className="btn btn-secondary" onClick={() => setConfirmStage(null)}>{t('cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Модалка истории ===== */}
      {showHistoryFor && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowHistoryFor(null)}>
          <div className="card max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="font-bold text-sm mb-4">📜 {tt('История устройства')}</div>
            {(stageHistory[showHistoryFor] || []).map((h, i) => {
              const st = STAGE_MAP[h.stage] || STAGE_MAP.received;
              const c = COLOR[st.color];
              return (
                <div key={i} className="flex gap-3 pb-4 relative">
                  {i < (stageHistory[showHistoryFor] || []).length - 1 && <div className="absolute left-[15px] top-8 bottom-0 w-0.5 bg-border" />}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 z-10 ${c.dot} text-white`}>{st.ico}</div>
                  <div>
                    <div className={`font-medium text-sm ${c.text}`}>{tt(st.label)}</div>
                    <div className="text-xs text-text3">{new Date(h.created_at).toLocaleString('ru-RU')}</div>
                    {h.note && <div className="text-xs text-text2 mt-0.5">{h.note}</div>}
                  </div>
                </div>
              );
            })}
            {!(stageHistory[showHistoryFor] || []).length && <div className="text-text3 text-sm">—</div>}
            <button className="btn btn-secondary btn-sm w-full justify-center mt-2" onClick={() => setShowHistoryFor(null)}>{tt('Закрыть')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Большая карточка выбранного устройства (фото/специфика/гарантия/timeline/прогресс/действия) =====
function DeviceDetailCard({ device, rate, canEdit, history, onStageClick, onEdit, onNotify, onShowHistory, onDelete, onClose }) {
  const tt = useTT();
  const st = STAGE_MAP[device.stage];
  const nextStage = STAGES[st.index + 1];
  const c = COLOR[st.color];

  // Дата входа в текущий этап — из истории, если есть; иначе дата приёма устройства
  const stageEnteredAt = useMemo(() => {
    const rec = [...history].reverse().find(h => h.stage === device.stage);
    return rec ? new Date(rec.created_at) : new Date(device.created_at);
  }, [history, device.stage, device.created_at]);
  const daysAtStage = daysBetween(stageEnteredAt, new Date());
  const stageColorClass = daysAtStage > STAGE_NORM_DAYS ? 'text-red' : daysAtStage >= STAGE_NORM_DAYS - 3 ? 'text-yellow' : 'text-green';

  const dates = {};
  history.forEach(h => { dates[h.stage] = new Date(h.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }); });

  const totalDays = daysBetween(new Date(device.created_at), device.stage === 'done' ? stageEnteredAt : new Date());

  return (
    <div className="card mb-5 animate-[fadeIn_0.2s_ease] relative">
      <button onClick={onClose} className="absolute top-3 right-3 w-7 h-7 rounded-full bg-bg3 hover:bg-bg4 text-text3 hover:text-text flex items-center justify-center text-sm z-10" title={tt('Закрыть')}>✕</button>
      <div className="grid md:grid-cols-[180px_1fr] gap-5 mb-5">
        {/* Фото */}
        <div className="aspect-square rounded-2xl bg-bg3 overflow-hidden flex items-center justify-center flex-shrink-0">
          {device.image_url ? <img src={device.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-4xl opacity-30">💻</span>}
        </div>

        <div className="min-w-0">
          <div className="flex justify-between items-start flex-wrap gap-2 mb-1">
            <div>
              <div className="text-lg font-black">{device.brand ? `${device.brand} ${device.series}` : device.device_label}</div>
              {device.serial && <Link to={`/serials/${device.serial_id}`} className="font-mono text-xs text-text3 hover:text-accent2">{device.serial}</Link>}
            </div>
            <WarrantyBadge item={device} />
          </div>
          {warrantyInfo(device) && (
            <div className="text-[11px] text-text3 mb-2">{tt('до')} {warrantyInfo(device).end.toLocaleDateString('ru-RU')} ({warrantyInfo(device).active ? `${tt('осталось')} ${warrantyInfo(device).daysLeft} ${tt('дн.')}` : tt('истекла')})</div>
          )}
          <div className="text-sm text-text2 mb-3">{device.issue}</div>
          {device.brand && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs text-text3 mb-2">
              {device.cpu && <div>🧠 {device.cpu}</div>}
              {device.ram && <div>💾 {device.ram}</div>}
              {device.storage && <div>💿 {device.storage}</div>}
              {device.gpu && <div>🎮 {device.gpu}</div>}
              {device.screen && <div>🖥️ {device.screen}</div>}
              {device.color && <div>🎨 {device.color}</div>}
            </div>
          )}
          <div className="text-xs text-text3">{tt('Заказ')} No.{device.order.id.slice(-6)} · {device.order.client_name || tt('Без клиента')}</div>
        </div>
      </div>

      {/* Timeline */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-3">
          <div className="text-xs font-bold uppercase text-text3">{tt('Текущий статус')}</div>
          <div className={`text-xs font-bold ${stageColorClass}`}>
            {daysAtStage} / {STAGE_NORM_DAYS} {tt('дн. на этапе')}{daysAtStage > STAGE_NORM_DAYS ? ' ⚠️' : ''}
          </div>
        </div>
        <StageTimeline currentStage={device.stage} dates={dates} />
      </div>

      <div className="mb-4"><ProgressBar currentStage={device.stage} /></div>

      {/* Даты */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-xs">
        <div><div className="text-text3 mb-0.5">{tt('Дата приёма')}</div><div className="font-medium">{new Date(device.created_at).toLocaleDateString('ru-RU')}</div></div>
        <div><div className="text-text3 mb-0.5">{tt('Плановая дата')}</div><div className="font-medium">{device.expected_date ? new Date(device.expected_date).toLocaleDateString('ru-RU') : '—'}</div></div>
        <div><div className="text-text3 mb-0.5">{tt('Фактическая дата')}</div><div className="font-medium">{device.stage === 'done' ? stageEnteredAt.toLocaleDateString('ru-RU') : '—'}</div></div>
        <div><div className="text-text3 mb-0.5">{tt('Общий срок')}</div><div className="font-medium">{totalDays} {tt('дн.')}</div></div>
      </div>

      {Number(device.cost_cny) > 0 && (
        <div className="bg-bg3 rounded-xl p-3 mb-4 flex justify-between items-center flex-wrap gap-2">
          <span className="text-sm">💰 {tt('Стоимость ремонта')}: <b className="text-yellow">¥{device.cost_cny}</b> <span className="text-text3">≈{Math.round(device.cost_cny * rate).toLocaleString('ru-RU')}₽</span></span>
          <Link to="/finance" className="text-accent2 text-xs hover:underline">💳 {tt('Оплата — через раздел Финансы')} →</Link>
        </div>
      )}

      {/* Быстрые действия */}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          {nextStage && (
            <button onClick={() => onStageClick(nextStage[0])} className="btn btn-primary text-sm">
              → {nextStage[1]} {tt(nextStage[2])}
            </button>
          )}
          <select className="inp inp-sm w-auto" value="" onChange={e => e.target.value && onStageClick(e.target.value)}>
            <option value="">{tt('Другой этап...')}</option>
            {STAGES.filter(([id]) => id !== device.stage).map(([id, ico, label]) => <option key={id} value={id}>{ico} {tt(label)}</option>)}
          </select>
          <button className="btn btn-secondary text-sm" onClick={onEdit}>✏️ {tt('Редактировать')}</button>
          <button className="btn btn-secondary text-sm" onClick={onShowHistory}>📜 {tt('История')}</button>
          <button className="btn btn-secondary text-sm" onClick={onNotify}>📤 {tt('Уведомить')}</button>
          <button className="text-text3 hover:text-red text-sm px-2" onClick={onDelete}>✕</button>
        </div>
      )}
    </div>
  );
}
