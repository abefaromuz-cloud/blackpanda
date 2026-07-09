import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';
import { printSerialLabel } from '../utils/print';

const statusOptions = [
  ['s1', 'В пути'], ['s2', 'На складе'], ['s15', 'Резерв'], ['s3', 'Продан'],
];
const statusKey = { s1: ['inTransit', 'badge-yellow'], s2: ['inStock', 'badge-green'], s15: ['reserved', 'badge-blue'], s3: ['soldTotal', 'badge-red'] };

export default function LaptopDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [l, setL] = useState(null);
  const [serial, setSerial] = useState('');
  const [bulk, setBulk] = useState('');
  const [selected, setSelected] = useState([]);
  const [rate, setRate] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const { can } = useAuth();
  const { t } = useLang();
  const canEdit = can('warehouse', 'edit');

  function load() { api.get(`/laptops/${id}`).then(r => setL(r.data)); }
  useEffect(load, [id]);
  useEffect(() => { api.get('/settings/public-rate').then(r => setRate(r.data.rate)); }, []);

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

  async function changeStatus(serialId, status_id) {
    await api.put(`/serials/${serialId}`, { status_id });
    load();
  }

  async function deleteSerial(serialId) {
    if (!confirm('Удалить серийник?')) return;
    await api.delete(`/serials/${serialId}`);
    load();
  }

  function toggleSelect(sn) {
    setSelected(s => s.includes(sn) ? s.filter(x => x !== sn) : [...s, sn]);
  }
  function toggleAll(e) {
    setSelected(e.target.checked ? l.serials.filter(s => s.status_id === 's2').map(s => s.serial) : []);
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
      low_stock_threshold: l.low_stock_threshold, is_hot: l.is_hot,
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
  const availableCount = l.serials.filter(s => s.status_id === 's2').length;

  return (
    <div>
      <Link to="/warehouse" className="text-text3 text-sm hover:text-text2">← {t('warehouse')}</Link>
      <div className="flex justify-between items-start mt-2 mb-1 flex-wrap gap-2">
        <h1 className="text-xl font-black">{l.brand} {l.series} {l.is_hot && <span className="badge badge-yellow ml-1">🔥 хит</span>}</h1>
        {canEdit && <button className="btn btn-secondary btn-sm" onClick={startEdit}>✏️ {t('edit')}</button>}
      </div>
      <div className="text-text3 text-sm mb-5">{l.cpu} · {l.ram} · {l.gpu} · {l.storage} · {l.color}</div>

      {editing ? (
        <form onSubmit={saveEdit} className="card mb-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <input className="inp" placeholder="Бренд" value={editForm.brand} onChange={e => setEditForm(f => ({ ...f, brand: e.target.value }))} required />
            <input className="inp" placeholder="Серия" value={editForm.series} onChange={e => setEditForm(f => ({ ...f, series: e.target.value }))} />
            <input className="inp" placeholder="CPU" value={editForm.cpu} onChange={e => setEditForm(f => ({ ...f, cpu: e.target.value }))} />
            <input className="inp" placeholder="RAM" value={editForm.ram} onChange={e => setEditForm(f => ({ ...f, ram: e.target.value }))} />
            <input className="inp" placeholder="GPU" value={editForm.gpu} onChange={e => setEditForm(f => ({ ...f, gpu: e.target.value }))} />
            <input className="inp" placeholder="Накопитель" value={editForm.storage} onChange={e => setEditForm(f => ({ ...f, storage: e.target.value }))} />
            <input className="inp" placeholder="Цвет" value={editForm.color} onChange={e => setEditForm(f => ({ ...f, color: e.target.value }))} />
            <input className="inp" placeholder="Экран" value={editForm.screen} onChange={e => setEditForm(f => ({ ...f, screen: e.target.value }))} />
            <select className="inp" value={editForm.touch} onChange={e => setEditForm(f => ({ ...f, touch: e.target.value }))}>
              <option value="no">Сенсор: Нет</option><option value="yes">Сенсор: Да</option>
            </select>
            <input className="inp" type="number" placeholder="Закупка ¥" value={editForm.cost_cny} onChange={e => setEditForm(f => ({ ...f, cost_cny: e.target.value }))} />
            <input className="inp" type="number" placeholder="Цена продажи ¥" value={editForm.price_sell_cny} onChange={e => setEditForm(f => ({ ...f, price_sell_cny: e.target.value }))} />
            <input className="inp" type="number" placeholder="Мин. остаток" value={editForm.low_stock_threshold} onChange={e => setEditForm(f => ({ ...f, low_stock_threshold: e.target.value }))} />
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
                <img src={images[0]} className="w-full h-40 object-contain bg-bg3 rounded-lg mb-2" alt="" />
                {images.length > 1 && (
                  <div className="flex gap-2 flex-wrap">
                    {images.slice(1).map((u, i) => <img key={i} src={u} className="w-12 h-12 object-contain bg-bg3 rounded" alt="" />)}
                  </div>
                )}
              </div>
            ) : <div className="w-full h-40 bg-bg3 rounded-lg flex items-center justify-center text-text3">🐼</div>}
          </div>
          <div className="card md:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <div><div className="text-xs text-text3">Экран</div><div className="font-bold">{l.screen || '—'}</div></div>
            <div><div className="text-xs text-text3">CPU</div><div className="font-bold">{l.cpu || '—'}</div></div>
            <div><div className="text-xs text-text3">RAM</div><div className="font-bold">{l.ram || '—'}</div></div>
            <div><div className="text-xs text-text3">Накопитель</div><div className="font-bold">{l.storage || '—'}</div></div>
            <div><div className="text-xs text-text3">GPU</div><div className="font-bold">{l.gpu || '—'}</div></div>
            <div><div className="text-xs text-text3">Цвет</div><div className="font-bold">{l.color || '—'}</div></div>
            <div><div className="text-xs text-text3">Сенсор</div><div className="font-bold">{l.touch === 'yes' ? 'Да' : 'Нет'}</div></div>
            <div><div className="text-xs text-text3">Закупка</div><div className="font-bold font-mono">¥{l.cost_cny}</div></div>
            <div><div className="text-xs text-text3">Продажа</div><div className="font-bold font-mono text-yellow">¥{l.price_sell_cny} ≈ {Math.round(l.price_sell_cny * rate).toLocaleString('ru-RU')} ₽</div></div>
            <div><div className="text-xs text-text3">Мин. остаток</div><div className="font-bold">{l.low_stock_threshold}</div></div>
          </div>
        </div>
      )}

      {canEdit && (
        <div className="grid md:grid-cols-2 gap-4 mb-5">
          <form onSubmit={addOne} className="card">
            <div className="font-bold text-sm mb-3">+ Серийник</div>
            <div className="flex gap-2">
              <input className="inp" placeholder={t('scanSerial')} value={serial} onChange={e => setSerial(e.target.value)} />
              <button className="btn btn-primary">+</button>
            </div>
          </form>
          <form onSubmit={addBulk} className="card">
            <div className="font-bold text-sm mb-3">Массовый импорт (по одному в строке)</div>
            <textarea className="inp mb-2" rows={3} value={bulk} onChange={e => setBulk(e.target.value)} />
            <button className="btn btn-secondary">{t('add')}</button>
          </form>
        </div>
      )}

      <div className="card">
        <div className="flex justify-between items-center mb-3">
          <div className="font-bold text-sm">{t('warehouse')} ({l.serials.length})</div>
          {selected.length > 0 && canEdit && (
            <div className="flex gap-2">
              <button className="btn btn-primary btn-sm" onClick={sellSelected}>🛒 Продать выбранные ({selected.length})</button>
              <button className="btn btn-secondary btn-sm" onClick={reserveSelected}>🔒 Зарезервировать</button>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase text-text3 border-b border-border">
                <th className="pb-2 w-8"><input type="checkbox" onChange={toggleAll} checked={selected.length > 0 && selected.length === availableCount} /></th>
                <th className="pb-2">S/N</th><th className="pb-2">Статус</th><th className="pb-2">{t('date')}</th><th className="pb-2">Продажа</th><th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {l.serials.map(s => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="py-2">
                    {s.status_id === 's2' && <input type="checkbox" checked={selected.includes(s.serial)} onChange={() => toggleSelect(s.serial)} />}
                  </td>
                  <td className="py-2 font-mono">{s.serial}</td>
                  <td className="py-2">
                    {canEdit ? (
                      <select className="inp text-xs py-1" value={s.status_id} onChange={e => changeStatus(s.id, e.target.value)}>
                        {statusOptions.map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
                      </select>
                    ) : (
                      <span className={`badge ${(statusKey[s.status_id] || ['', 'badge-blue'])[1]}`}>{s.status_id}</span>
                    )}
                  </td>
                  <td className="py-2 text-text3">{s.arrival_date ? new Date(s.arrival_date).toLocaleDateString('ru-RU') : '—'}</td>
                  <td className="py-2 text-text3">{s.sale_date ? new Date(s.sale_date).toLocaleDateString('ru-RU') : '—'}</td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <button className="text-text3 hover:text-accent2 text-xs mr-2" onClick={() => printSerialLabel({ serial: s.serial, brand: l.brand, series: l.series, specs: [l.cpu, l.ram, l.storage].filter(Boolean).join(' / '), arrivalDate: s.arrival_date })}>🏷️</button>
                    {canEdit && <button className="text-text3 hover:text-red text-xs" onClick={() => deleteSerial(s.id)}>✕</button>}
                  </td>
                </tr>
              ))}
              {!l.serials.length && <tr><td colSpan={6} className="text-center py-6 text-text3">Нет серийников</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
