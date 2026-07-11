import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Ruler, Cpu, MemoryStick, HardDrive, Gamepad2, Palette, Hand, Package, DollarSign, Tag, Eye, EyeOff } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';
import { printSerialLabel } from '../utils/print';
import { useStatuses } from '../hooks/useStatuses';
import { useLibraryText } from '../hooks/useLibraryText';
import BarcodeScannerModal from '../components/BarcodeScannerModal';
import { beep } from '../utils/sound';

const SPEC_ICONS = {
  screen: [Ruler, 'bg-accent/15 text-accent2'],
  cpu: [Cpu, 'bg-purple/15 text-purple'],
  ram: [MemoryStick, 'bg-purple/15 text-purple'],
  storage: [HardDrive, 'bg-blue-500/15 text-blue-400'],
  gpu: [Gamepad2, 'bg-purple/15 text-purple'],
  color: [Palette, 'bg-yellow/15 text-yellow'],
  touch: [Hand, 'bg-yellow/15 text-yellow'],
  stock: [Package, 'bg-yellow/15 text-yellow'],
  price: [Tag, 'bg-green/15 text-green'],
  cost: [DollarSign, 'bg-accent/15 text-accent2'],
};

function SpecBox({ Icon, iconClass, label, value }) {
  return (
    <div className="card flex items-center gap-3 py-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${iconClass}`}><Icon size={17} /></div>
      <div className="min-w-0">
        <div className="text-[10px] text-text3 uppercase font-bold tracking-wide">{label}</div>
        <div className="font-bold text-sm truncate">{value || '—'}</div>
      </div>
    </div>
  );
}

export default function LaptopDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [l, setL] = useState(null);
  const [activeImg, setActiveImg] = useState(0);
  const [serial, setSerial] = useState('');
  const [bulk, setBulk] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showCost, setShowCost] = useState(false);
  const [selected, setSelected] = useState([]);
  const [rate, setRate] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const { can } = useAuth();
  const { t } = useLang();
  const { statuses, badgeClass, isInStock, displayLabel } = useStatuses();
  const { lib, tr } = useLibraryText();
  const canEdit = can('warehouse', 'edit');

  function load() { api.get(`/laptops/${id}`).then(r => { setL(r.data); setActiveImg(0); }); }
  useEffect(load, [id]);
  useEffect(() => { api.get('/settings/public-rate').then(r => setRate(r.data.rate)); }, []);

  async function addOne(e) {
    e.preventDefault();
    if (!serial.trim()) return;
    await api.post('/serials', { laptop_id: id, serial: serial.trim() });
    setSerial(''); load();
  }

  async function addFromCamera(text) {
    setShowCamera(false);
    try {
      await api.post('/serials', { laptop_id: id, serial: text.trim() });
      beep(true); load();
    } catch (e2) {
      beep(false);
      alert(e2.response?.data?.error || 'Ошибка добавления серийника');
    }
  }

  function genSerial() {
    setSerial('BP' + Math.random().toString(36).slice(2, 10).toUpperCase());
  }

  async function addBulk(e) {
    e.preventDefault();
    const list = bulk.split('\n').map(s => s.trim()).filter(Boolean);
    if (!list.length) return;
    await api.post('/serials/bulk', { laptop_id: id, serials: list });
    setBulk(''); setShowBulk(false); load();
  }

  async function changeStatus(serialId, status_id) {
    await api.put(`/serials/${serialId}`, { status_id });
    load();
  }

  async function deleteSerial(serialId) {
    if (!confirm('Удалить серийник?')) return;
    await api.delete(`/serials/${serialId}`);
    load();
  }

  // availableCount вычисляется от актуального списка каждый раз — selected синхронизируем
  // с ним же, чтобы после смены статуса/перезагрузки не оставалось "мёртвых" выбранных серийников
  const availableSerials = l ? l.serials.filter(s => isInStock(s.status_id)).map(s => s.serial) : [];

  function toggleSelect(sn) {
    setSelected(s => s.includes(sn) ? s.filter(x => x !== sn) : [...s, sn]);
  }
  function toggleAll(e) {
    setSelected(e.target.checked ? availableSerials : []);
  }

  function sellSelected() {
    if (!selected.length) return;
    sessionStorage.setItem('bp_scan_prefill', JSON.stringify(selected));
    navigate('/scan');
  }

  async function reserveSelected() {
    if (!selected.length) return;
    const clientId = prompt('ID клиента (необязательно, оставь пустым для резерва без клиента):') || null;
    await api.post('/reservations', { serials: selected, client_id: clientId });
    setSelected([]); load();
  }

  function startEdit() {
    setEditForm({
      brand: l.brand, series: l.series || '', cpu: l.cpu || '', ram: l.ram || '', gpu: l.gpu || '',
      storage: l.storage || '', color: l.color || '', screen: l.screen || '', touch: l.touch || 'no',
      images: (l.images && l.images.length ? l.images : ['']), cost_cny: l.cost_cny, price_sell_cny: l.price_sell_cny,
      low_stock_threshold: l.low_stock_threshold, is_hot: l.is_hot, mfr_item_code: l.mfr_item_code || '',
    });
    setEditing(true);
  }

  async function saveEdit(e) {
    e.preventDefault();
    await api.put(`/laptops/${id}`, { ...editForm, images: editForm.images.filter(Boolean) });
    setEditing(false); load();
  }

  if (!l) return <div className="text-text3">{t('loading')}</div>;

  const images = (l.images && l.images.length ? l.images : (l.image_url ? [l.image_url] : []));
  const inStockCount = l.serials.filter(s => isInStock(s.status_id)).length;
  const overallStatus = inStockCount > 0 ? 'На складе' : (l.serials.length ? 'Нет в наличии' : '—');

  return (
    <div>
      <Link to="/warehouse" className="text-text3 text-sm hover:text-text2">← {t('warehouse')}</Link>

      <div className="flex justify-between items-start mt-2 mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-black">
            {l.brand}{tr('brand', l.brand) !== l.brand ? ` / ${tr('brand', l.brand)}` : ''}
            {tr('series', l.series) !== l.series ? ` — ${tr('series', l.series)}` : ''}
            {l.is_hot && <span className="badge badge-yellow ml-1">🔥 хит</span>}
          </h1>
          <div className="text-text3 text-sm">{l.series}</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="badge badge-blue font-mono">{l.item_code || '—'}</span>
          {l.mfr_item_code && <span className="badge badge-purple font-mono">ITEM: {l.mfr_item_code}</span>}
          {canEdit && <button className="btn btn-secondary btn-sm" onClick={startEdit}>✏️ {t('edit')}</button>}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-5">
        <span className={`badge ${inStockCount > 0 ? 'badge-green' : 'badge-red'}`}>📦 {overallStatus}</span>
        <span className="badge badge-yellow">{inStockCount} / {l.serials.length} шт.</span>
        <span className="badge badge-blue">🕐 Добавлено: {new Date(l.created_at).toLocaleDateString('ru-RU')}</span>
      </div>

      {editing ? (
        <form onSubmit={saveEdit} className="card mb-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <input className="inp" placeholder="Бренд" list="edit-brand-list" value={editForm.brand} onChange={e => setEditForm(f => ({ ...f, brand: e.target.value }))} required />
            <datalist id="edit-brand-list">{(lib?.brands || []).map(b => <option key={b.id} value={b.name} />)}</datalist>
            <input className="inp" placeholder="Серия" list="edit-series-list" value={editForm.series} onChange={e => setEditForm(f => ({ ...f, series: e.target.value }))} />
            <datalist id="edit-series-list">{(lib?.brands?.find(b => b.name === editForm.brand)?.series || []).map(s => <option key={s.id} value={s.name} />)}</datalist>
            <input className="inp" placeholder="CPU" list="edit-cpu-list" value={editForm.cpu} onChange={e => setEditForm(f => ({ ...f, cpu: e.target.value }))} />
            <datalist id="edit-cpu-list">{(lib?.values?.cpu || []).map(v => <option key={v.id} value={v.value} />)}</datalist>
            <input className="inp" placeholder="RAM" list="edit-ram-list" value={editForm.ram} onChange={e => setEditForm(f => ({ ...f, ram: e.target.value }))} />
            <datalist id="edit-ram-list">{(lib?.values?.ram || []).map(v => <option key={v.id} value={v.value} />)}</datalist>
            <input className="inp" placeholder="GPU" list="edit-gpu-list" value={editForm.gpu} onChange={e => setEditForm(f => ({ ...f, gpu: e.target.value }))} />
            <datalist id="edit-gpu-list">{(lib?.values?.gpu || []).map(v => <option key={v.id} value={v.value} />)}</datalist>
            <input className="inp" placeholder="Накопитель" list="edit-storage-list" value={editForm.storage} onChange={e => setEditForm(f => ({ ...f, storage: e.target.value }))} />
            <datalist id="edit-storage-list">{(lib?.values?.storage || []).map(v => <option key={v.id} value={v.value} />)}</datalist>
            <input className="inp" placeholder="Цвет" list="edit-color-list" value={editForm.color} onChange={e => setEditForm(f => ({ ...f, color: e.target.value }))} />
            <datalist id="edit-color-list">{(lib?.values?.color || []).map(v => <option key={v.id} value={v.value} />)}</datalist>
            <input className="inp" placeholder="Экран" list="edit-screen-list" value={editForm.screen} onChange={e => setEditForm(f => ({ ...f, screen: e.target.value }))} />
            <datalist id="edit-screen-list">{(lib?.values?.screen || []).map(v => <option key={v.id} value={v.value} />)}</datalist>
            <select className="inp" value={editForm.touch} onChange={e => setEditForm(f => ({ ...f, touch: e.target.value }))}>
              <option value="no">Сенсор: Нет</option><option value="yes">Сенсор: Да</option>
            </select>
            <input className="inp" type="number" placeholder="Закупка ¥" value={editForm.cost_cny} onChange={e => setEditForm(f => ({ ...f, cost_cny: e.target.value }))} />
            <input className="inp" type="number" placeholder="Цена продажи ¥" value={editForm.price_sell_cny} onChange={e => setEditForm(f => ({ ...f, price_sell_cny: e.target.value }))} />
            <input className="inp" type="number" placeholder="Мин. остаток" value={editForm.low_stock_threshold} onChange={e => setEditForm(f => ({ ...f, low_stock_threshold: e.target.value }))} />
            <input className="inp" placeholder="ITEM (код с коробки производителя)" value={editForm.mfr_item_code} onChange={e => setEditForm(f => ({ ...f, mfr_item_code: e.target.value }))} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editForm.is_hot} onChange={e => setEditForm(f => ({ ...f, is_hot: e.target.checked }))} /> 🔥 Хит</label>
          </div>
          <div className="mb-3">
            <label className="block text-[11px] text-text2 font-bold uppercase mb-1">Фото</label>
            {editForm.images.map((url, i) => (
              <div key={i} className="flex gap-2 mb-1">
                <input className="inp" value={url} onChange={e => setEditForm(f => { const imgs = [...f.images]; imgs[i] = e.target.value; return { ...f, images: imgs }; })} />
                <button type="button" className="btn btn-danger btn-sm" onClick={() => setEditForm(f => ({ ...f, images: f.images.filter((_, idx) => idx !== i) }))}>✕</button>
              </div>
            ))}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditForm(f => ({ ...f, images: [...f.images, ''] }))}>+ Фото</button>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary" type="button" onClick={() => setEditing(false)}>{t('cancel')}</button>
            <button className="btn btn-primary">{t('save')}</button>
          </div>
        </form>
      ) : (
        <div className="grid md:grid-cols-3 gap-4 mb-5">
          <div className="card md:col-span-1">
            {images.length ? (
              <div>
                <img src={images[activeImg]} className="w-full h-44 object-contain bg-bg3 rounded-lg mb-2" alt="" />
                {images.length > 1 && (
                  <div className="flex gap-2 flex-wrap">
                    {images.map((u, i) => (
                      <button key={i} onClick={() => setActiveImg(i)} className={`w-14 h-14 rounded-lg overflow-hidden border-2 ${activeImg === i ? 'border-accent' : 'border-transparent'}`}>
                        <img src={u} className="w-full h-full object-contain bg-bg3" alt="" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : <div className="w-full h-44 bg-bg3 rounded-lg flex items-center justify-center text-text3 text-3xl">🐼</div>}
          </div>
          <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-3">
            <SpecBox Icon={SPEC_ICONS.screen[0]} iconClass={SPEC_ICONS.screen[1]} label="Диагональ" value={tr('screen', l.screen)} />
            <SpecBox Icon={SPEC_ICONS.cpu[0]} iconClass={SPEC_ICONS.cpu[1]} label="CPU" value={tr('cpu', l.cpu)} />
            <SpecBox Icon={SPEC_ICONS.ram[0]} iconClass={SPEC_ICONS.ram[1]} label="RAM" value={tr('ram', l.ram)} />
            <SpecBox Icon={SPEC_ICONS.storage[0]} iconClass={SPEC_ICONS.storage[1]} label="Накопитель" value={tr('storage', l.storage)} />
            <SpecBox Icon={SPEC_ICONS.gpu[0]} iconClass={SPEC_ICONS.gpu[1]} label="GPU" value={tr('gpu', l.gpu)} />
            <SpecBox Icon={SPEC_ICONS.color[0]} iconClass={SPEC_ICONS.color[1]} label="Цвет" value={tr('color', l.color)} />
            <SpecBox Icon={SPEC_ICONS.touch[0]} iconClass={SPEC_ICONS.touch[1]} label="Сенсор" value={l.touch === 'yes' ? 'Да' : 'Нет'} />
            <SpecBox Icon={SPEC_ICONS.stock[0]} iconClass={SPEC_ICONS.stock[1]} label="На складе" value={`${inStockCount} / ${l.serials.length}`} />
            <SpecBox Icon={SPEC_ICONS.price[0]} iconClass={SPEC_ICONS.price[1]} label="Цена продажи" value={`¥${l.price_sell_cny} ≈ ${Math.round(l.price_sell_cny * rate).toLocaleString('ru-RU')} ₽`} />
            {(() => {
              const CostIcon = showCost ? SPEC_ICONS.cost[0] : EyeOff;
              return (
                <button onClick={() => setShowCost(s => !s)} className="card flex items-center gap-3 py-3 text-left w-full">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${SPEC_ICONS.cost[1]}`}>
                    <CostIcon size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] text-text3 uppercase font-bold tracking-wide flex items-center gap-1">
                      Себестоимость {showCost ? <EyeOff size={11} /> : <Eye size={11} />}
                    </div>
                    <div className="font-bold text-sm truncate">{showCost ? `¥${l.cost_cny}` : '••••'}</div>
                  </div>
                </button>
              );
            })()}
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
          <div className="font-bold text-sm">Серийные номера ({l.serials.length})</div>
          {canEdit && (
            <div className={`flex gap-2 transition ${selected.length === 0 ? 'opacity-40 pointer-events-none' : ''}`}>
              <button className="btn btn-primary btn-sm" onClick={sellSelected}>🛒 Продать выбранные ({selected.length})</button>
              <button className="btn btn-secondary btn-sm" onClick={reserveSelected}>🔒 Зарезервировать</button>
            </div>
          )}
        </div>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase text-text3 border-b border-border">
                <th className="pb-2 w-8">
                  {canEdit && availableSerials.length > 0 &&
                    <input type="checkbox" onChange={toggleAll} checked={selected.length > 0 && selected.length === availableSerials.length} />}
                </th>
                <th className="pb-2">Серийник</th><th className="pb-2">Статус</th><th className="pb-2">Поступление</th><th className="pb-2">Дней</th><th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {l.serials.map(s => {
                const days = s.arrival_date ? Math.floor((Date.now() - new Date(s.arrival_date)) / 86400000) : null;
                return (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <td className="py-2">
                      {canEdit && isInStock(s.status_id) && <input type="checkbox" checked={selected.includes(s.serial)} onChange={() => toggleSelect(s.serial)} />}
                    </td>
                    <td className="py-2 font-mono"><Link to={`/serials/${s.id}`} className="hover:text-accent2 hover:underline">{s.serial}</Link></td>
                    <td className="py-2">
                      {canEdit ? (
                        <select className="inp text-xs py-1" value={s.status_id} onChange={e => changeStatus(s.id, e.target.value)}>
                          {statuses.map(st => <option key={st.id} value={st.label}>{displayLabel(st.label)}</option>)}
                        </select>
                      ) : (
                        <span className={`badge ${badgeClass(s.status_id)}`}>{displayLabel(s.status_id)}</span>
                      )}
                    </td>
                    <td className="py-2 text-text3">{s.arrival_date ? new Date(s.arrival_date).toLocaleDateString('ru-RU') : '—'}</td>
                    <td className="py-2 text-text3">{days !== null ? `${days}д` : '—'}</td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <button className="text-text3 hover:text-accent2 text-xs mr-2" onClick={() => printSerialLabel({ serial: s.serial, brand: l.brand, series: l.series, specs: [l.cpu, l.ram, l.storage].filter(Boolean).join(' / '), arrivalDate: s.arrival_date })}>🏷️</button>
                      {canEdit && <button className="text-text3 hover:text-red text-xs" onClick={() => deleteSerial(s.id)}>✕</button>}
                    </td>
                  </tr>
                );
              })}
              {!l.serials.length && <tr><td colSpan={6} className="text-center py-6 text-text3">Нет серийников</td></tr>}
            </tbody>
          </table>
        </div>

        {canEdit && (
          <>
            <form onSubmit={addOne} className="flex gap-2 mb-2">
              <input className="inp" placeholder="Новый серийник" value={serial} onChange={e => setSerial(e.target.value)} />
              <button type="button" className="btn btn-secondary" onClick={() => setShowCamera(true)} title="Сканировать камерой">📷</button>
              <button type="button" className="btn btn-secondary" onClick={genSerial}>BP</button>
              <button className="btn btn-primary px-4">+</button>
            </form>
            <button className="btn btn-secondary btn-sm w-full justify-center" onClick={() => setShowBulk(s => !s)}>🏷️ Массовая загрузка серийников {showBulk ? '▲' : '▼'}</button>
            {showBulk && (
              <form onSubmit={addBulk} className="mt-2">
                <textarea className="inp mb-2" rows={3} placeholder="По одному серийнику в строке" value={bulk} onChange={e => setBulk(e.target.value)} />
                <button className="btn btn-secondary">{t('add')}</button>
              </form>
            )}
          </>
        )}
      </div>

      {showCamera && <BarcodeScannerModal onResult={addFromCamera} onClose={() => setShowCamera(false)} />}
    </div>
  );
}
