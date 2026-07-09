import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';

const emptyForm = {
  brand: '', series: '', cpu: '', ram: '', gpu: '', storage: '', color: '', screen: '', touch: 'no',
  images: [''], cost_cny: '', price_sell_cny: '', low_stock_threshold: 2, is_hot: false,
};

function uniq(arr) { return [...new Set(arr.filter(Boolean))].sort(); }

export default function Warehouse() {
  const [laptops, setLaptops] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [rate, setRate] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ brand: '', cpu: '', ram: '', gpu: '', storage: '', color: '', screen: '', touch: '', status: '' });
  const [sort, setSort] = useState({ col: 'brand', dir: 1 });
  const { can } = useAuth();
  const { t } = useLang();
  const canEdit = can('warehouse', 'edit');

  function load() {
    api.get('/laptops').then(r => setLaptops(r.data));
    api.get('/reservations').then(r => setReservations(r.data));
    api.get('/settings/public-rate').then(r => setRate(r.data.rate));
  }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    await api.post('/laptops', { ...form, images: form.images.filter(Boolean) });
    setForm(emptyForm); setShowForm(false); load();
  }

  async function releaseReservation(id) {
    await api.delete(`/reservations/${id}`);
    load();
  }

  async function remove(id) {
    if (!confirm('Удалить модель?')) return;
    await api.delete(`/laptops/${id}`);
    load();
  }

  const opts = useMemo(() => ({
    brand: uniq(laptops.map(l => l.brand)), cpu: uniq(laptops.map(l => l.cpu)), ram: uniq(laptops.map(l => l.ram)),
    gpu: uniq(laptops.map(l => l.gpu)), storage: uniq(laptops.map(l => l.storage)), color: uniq(laptops.map(l => l.color)),
    screen: uniq(laptops.map(l => l.screen)),
  }), [laptops]);

  const filtered = useMemo(() => {
    let list = laptops.filter(l => {
      if (search && !`${l.brand} ${l.series} ${l.cpu} ${l.ram} ${l.gpu} ${l.storage} ${l.color} ${l.screen}`.toLowerCase().includes(search.toLowerCase())) return false;
      if (filters.brand && l.brand !== filters.brand) return false;
      if (filters.cpu && l.cpu !== filters.cpu) return false;
      if (filters.ram && l.ram !== filters.ram) return false;
      if (filters.gpu && l.gpu !== filters.gpu) return false;
      if (filters.storage && l.storage !== filters.storage) return false;
      if (filters.color && l.color !== filters.color) return false;
      if (filters.screen && l.screen !== filters.screen) return false;
      if (filters.touch && l.touch !== filters.touch) return false;
      if (filters.status === 'instock' && Number(l.in_stock) === 0) return false;
      if (filters.status === 'empty' && Number(l.in_stock) > 0) return false;
      return true;
    });
    list.sort((a, b) => {
      let av, bv;
      if (sort.col === 'price') { av = Number(a.price_sell_cny); bv = Number(b.price_sell_cny); }
      else if (sort.col === 'stock') { av = Number(a.in_stock); bv = Number(b.in_stock); }
      else { av = (a.brand || '') + (a.series || ''); bv = (b.brand || '') + (b.series || ''); }
      if (typeof av === 'string') return sort.dir * av.localeCompare(bv);
      return sort.dir * (av - bv);
    });
    const inStock = list.filter(l => Number(l.in_stock) > 0);
    const outStock = list.filter(l => Number(l.in_stock) === 0);
    return [...inStock, ...outStock];
  }, [laptops, search, filters, sort]);

  function th(col, label) {
    const arrow = sort.col === col ? (sort.dir === 1 ? ' ↑' : ' ↓') : '';
    return <th className="pb-2 cursor-pointer select-none" onClick={() => setSort(s => s.col === col ? { col, dir: -s.dir } : { col, dir: 1 })}>{label}{arrow}</th>;
  }

  function exportExcel() {
    const rows = filtered.map(l => `<tr>
      <td>${l.brand}</td><td>${l.series || ''}</td><td>${l.cpu || ''}</td><td>${l.ram || ''}</td>
      <td>${l.storage || ''}</td><td>${l.gpu || ''}</td><td>${l.color || ''}</td>
      <td>${l.touch === 'yes' ? 'Да' : 'Нет'}</td><td>${l.in_stock}</td>
      <td>¥${l.price_sell_cny}</td><td>${Math.round(l.price_sell_cny * rate).toLocaleString('ru-RU')} ₽</td>
    </tr>`).join('');
    const html = `<html><head><meta charset="UTF-8"></head><body><table border="1">
      <tr><th>Бренд</th><th>Серия</th><th>CPU</th><th>RAM</th><th>Накопитель</th><th>GPU</th><th>Цвет</th><th>Сенсор</th><th>Кол-во</th><th>Цена ¥</th><th>Цена ₽</th></tr>
      ${rows}</table></body></html>`;
    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `sklad_${new Date().toISOString().slice(0, 10)}.xls`; a.click();
  }

  function updateImage(i, v) {
    setForm(f => { const imgs = [...f.images]; imgs[i] = v; return { ...f, images: imgs }; });
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-5 flex-wrap gap-2">
        <h1 className="text-2xl font-black">{t('warehouse')} <span className="text-text3 text-sm font-normal">{filtered.length}/{laptops.length}</span></h1>
        <div className="flex gap-2">
          <button className="btn btn-secondary btn-sm" onClick={exportExcel}>📊 Excel</button>
          {canEdit && <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>+ {t('addModel')}</button>}
        </div>
      </div>

      {reservations.length > 0 && (
        <div className="card mb-5">
          <div className="font-bold text-sm mb-3">🔒 {t('reservations')}</div>
          {reservations.map(r => (
            <div key={r.id} className="flex justify-between items-center text-sm py-1.5 border-b border-border last:border-0">
              <span>{r.brand} {r.series} · <span className="font-mono text-text3">{r.serial}</span> {r.client_name && `· ${r.client_name}`}</span>
              <span className="flex items-center gap-2">
                {r.deadline && <span className="text-xs text-text3">до {new Date(r.deadline).toLocaleDateString('ru-RU')}</span>}
                {canEdit && <button className="text-red text-xs hover:underline" onClick={() => releaseReservation(r.id)}>{t('releaseReservation')}</button>}
              </span>
            </div>
          ))}
        </div>
      )}

      {showForm && canEdit && (
        <form onSubmit={submit} className="card mb-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <input className="inp" placeholder={t('name') + ' (бренд)'} list="brand-list" value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} required />
            <datalist id="brand-list">{opts.brand.map(b => <option key={b} value={b} />)}</datalist>
            <input className="inp" placeholder="Серия" value={form.series} onChange={e => setForm(f => ({ ...f, series: e.target.value }))} />
            <input className="inp" placeholder="CPU" list="cpu-list" value={form.cpu} onChange={e => setForm(f => ({ ...f, cpu: e.target.value }))} />
            <datalist id="cpu-list">{opts.cpu.map(v => <option key={v} value={v} />)}</datalist>
            <input className="inp" placeholder="RAM" list="ram-list" value={form.ram} onChange={e => setForm(f => ({ ...f, ram: e.target.value }))} />
            <datalist id="ram-list">{opts.ram.map(v => <option key={v} value={v} />)}</datalist>
            <input className="inp" placeholder="GPU" list="gpu-list" value={form.gpu} onChange={e => setForm(f => ({ ...f, gpu: e.target.value }))} />
            <datalist id="gpu-list">{opts.gpu.map(v => <option key={v} value={v} />)}</datalist>
            <input className="inp" placeholder="Накопитель" list="storage-list" value={form.storage} onChange={e => setForm(f => ({ ...f, storage: e.target.value }))} />
            <datalist id="storage-list">{opts.storage.map(v => <option key={v} value={v} />)}</datalist>
            <input className="inp" placeholder="Цвет" list="color-list" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
            <datalist id="color-list">{opts.color.map(v => <option key={v} value={v} />)}</datalist>
            <input className="inp" placeholder="Экран" list="screen-list" value={form.screen} onChange={e => setForm(f => ({ ...f, screen: e.target.value }))} />
            <datalist id="screen-list">{opts.screen.map(v => <option key={v} value={v} />)}</datalist>
            <select className="inp" value={form.touch} onChange={e => setForm(f => ({ ...f, touch: e.target.value }))}>
              <option value="no">Сенсор: Нет</option><option value="yes">Сенсор: Да</option>
            </select>
            <input className="inp" type="number" placeholder="Закупка ¥ (скрыто)" value={form.cost_cny} onChange={e => setForm(f => ({ ...f, cost_cny: e.target.value }))} />
            <div>
              <input className="inp" type="number" placeholder="Цена продажи ¥" value={form.price_sell_cny} onChange={e => setForm(f => ({ ...f, price_sell_cny: e.target.value }))} />
              {form.price_sell_cny && rate > 0 && <div className="text-xs text-text3 mt-1">≈ {Math.round(form.price_sell_cny * rate).toLocaleString('ru-RU')} ₽</div>}
            </div>
            <input className="inp" type="number" placeholder="Мин. остаток (уведомление)" value={form.low_stock_threshold} onChange={e => setForm(f => ({ ...f, low_stock_threshold: e.target.value }))} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_hot} onChange={e => setForm(f => ({ ...f, is_hot: e.target.checked }))} /> 🔥 Хит продаж</label>
          </div>
          <div className="mb-3">
            <label className="block text-[11px] text-text2 font-bold uppercase mb-1">Фото (ссылки)</label>
            {form.images.map((url, i) => (
              <div key={i} className="flex gap-2 mb-1">
                <input className="inp" placeholder="https://..." value={url} onChange={e => updateImage(i, e.target.value)} />
                <button type="button" className="btn btn-danger btn-sm" onClick={() => setForm(f => ({ ...f, images: f.images.filter((_, idx) => idx !== i) }))}>✕</button>
              </div>
            ))}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm(f => ({ ...f, images: [...f.images, ''] }))}>+ Фото</button>
          </div>
          <button className="btn btn-primary">{t('save')}</button>
        </form>
      )}

      <div className="flex gap-2 flex-wrap mb-3">
        <input className="inp flex-1 min-w-[160px]" placeholder="Поиск..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="grid grid-cols-4 md:grid-cols-8 gap-2 mb-4">
        {['brand', 'cpu', 'ram', 'gpu', 'storage', 'color', 'screen'].map(k => (
          <select key={k} className="inp text-xs" value={filters[k]} onChange={e => setFilters(f => ({ ...f, [k]: e.target.value }))}>
            <option value="">{k}</option>
            {opts[k].map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        ))}
        <select className="inp text-xs" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
          <option value="">Статус</option><option value="instock">Есть</option><option value="empty">Нет</option>
        </select>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase text-text3 border-b border-border">
                <th className="pb-2 pl-4 pt-3">Фото</th>
                {th('brand', t('model'))}
                <th className="pb-2">GPU</th><th className="pb-2">Цвет</th>
                {th('price', 'Цена')}
                {th('stock', t('inStock'))}
                <th className="pb-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => (
                <tr key={l.id} className={`border-b border-border last:border-0 hover:bg-bg3 ${Number(l.in_stock) === 0 ? 'opacity-50' : ''}`}>
                  <td className="py-2 pl-4">
                    <img src={l.image_url || ''} onError={e => e.target.style.display = 'none'} className="w-12 h-9 object-contain rounded bg-bg3" alt="" />
                  </td>
                  <td className="py-2">
                    <Link to={`/warehouse/${l.id}`} className="hover:text-accent2 font-medium block">
                      {l.brand} {l.series} {l.is_hot && <span className="badge badge-yellow ml-1">🔥</span>}
                    </Link>
                    <div className="text-xs text-text3">{[l.cpu, l.ram, l.storage].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className="py-2 text-xs text-text3">{l.gpu || '—'}</td>
                  <td className="py-2 text-xs text-text3">{l.color || '—'}</td>
                  <td className="py-2">
                    <div className="font-mono text-yellow font-bold">¥{l.price_sell_cny}</div>
                    <div className="text-xs text-text3 font-mono">{Math.round(l.price_sell_cny * rate).toLocaleString('ru-RU')} ₽</div>
                  </td>
                  <td className="py-2">
                    <span className={`font-mono font-bold ${Number(l.in_stock) <= Number(l.low_stock_threshold) && Number(l.in_stock) > 0 ? 'text-red' : Number(l.in_stock) > 0 ? 'text-green' : 'text-text3'}`}>{l.in_stock}</span>
                    <span className="text-text3 text-xs">/{l.total}</span>
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {canEdit && <button className="text-text3 hover:text-red text-xs" onClick={() => remove(l.id)}>✕</button>}
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={7} className="text-center py-8 text-text3">Нет ноутбуков</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
