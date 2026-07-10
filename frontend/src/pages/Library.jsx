import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';
import DragReorderList from '../components/DragReorderList';

const CATS = [
  ['cpu', 'processors'], ['gpu', 'gpus'], ['ram', 'rams'],
  ['storage', 'storages'], ['color', 'colors'], ['screen', 'screens'],
];

// Инлайн-редактируемое поле — сохраняет по потере фокуса/Enter.
function EditableField({ value, onSave, placeholder }) {
  const [v, setV] = useState(value || '');
  useEffect(() => { setV(value || ''); }, [value]);
  return (
    <input
      className="inp inp-sm truncate min-w-0 w-36 flex-shrink-0"
      placeholder={placeholder}
      value={v}
      onChange={e => setV(e.target.value)}
      onBlur={() => { if (v !== (value || '')) onSave(v); }}
      onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
    />
  );
}

// Пара «оригинал ⚭ китайский» — одинаковая ширина у обоих полей, стоят вплотную,
// между ними значок связи, чтобы было видно, что это перевод именно этого значения.
function BilingualPair({ name, nameZh, onSaveName, onSaveZh, canEdit, staticName }) {
  if (!canEdit) {
    return (
      <span className="flex items-center gap-2 min-w-0">
        <span className="truncate">{staticName ?? name}</span>
        {nameZh && <span className="text-text3 text-xs truncate">⚭ {nameZh}</span>}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 flex-shrink-0">
      <EditableField value={name} onSave={onSaveName} />
      <span className="text-text3 text-xs flex-shrink-0" title="Перевод этого значения">⚭</span>
      <EditableField value={nameZh} onSave={onSaveZh} placeholder="中文" />
    </span>
  );
}

export default function Library() {
  const [data, setData] = useState(null);
  const [newBrand, setNewBrand] = useState({ name: '', name_zh: '' });
  const [newSeries, setNewSeries] = useState({});
  const [newValue, setNewValue] = useState({});
  const [newStatus, setNewStatus] = useState({ label: '', label_zh: '', counts_as: 'other' });
  const { can } = useAuth();
  const { t } = useLang();
  const canEdit = can('library', 'edit');

  function load() { api.get('/library').then(r => setData(r.data)); }
  useEffect(load, []);

  async function addStatus(e) {
    e.preventDefault();
    if (!newStatus.label.trim()) return;
    await api.post('/library/statuses', newStatus);
    setNewStatus({ label: '', label_zh: '', counts_as: 'other' }); load();
  }
  async function delStatus(id) { await api.delete(`/library/statuses/${id}`); load(); }
  async function reorderStatuses(ids) { await api.put('/library/statuses/reorder', { ids }); load(); }
  async function saveStatus(id, patch) { await api.put(`/library/statuses/${id}`, patch); load(); }

  async function addBrand(e) {
    e.preventDefault();
    if (!newBrand.name.trim()) return;
    await api.post('/library/brands', newBrand);
    setNewBrand({ name: '', name_zh: '' }); load();
  }
  async function delBrand(id) {
    if (!confirm('Удалить бренд и все его серии?')) return;
    await api.delete(`/library/brands/${id}`); load();
  }
  async function reorderBrands(ids) { await api.put('/library/brands/reorder', { ids }); load(); }
  async function saveBrand(id, patch) { await api.put(`/library/brands/${id}`, patch); load(); }

  async function addSeries(brandId) {
    const entry = newSeries[brandId] || {};
    if (!entry.name?.trim()) return;
    await api.post(`/library/brands/${brandId}/series`, { name: entry.name, name_zh: entry.name_zh });
    setNewSeries(s => ({ ...s, [brandId]: { name: '', name_zh: '' } })); load();
  }
  async function delSeries(id) { await api.delete(`/library/series/${id}`); load(); }
  async function reorderSeries(ids) { await api.put('/library/series/reorder', { ids }); load(); }
  async function saveSeries(id, patch) { await api.put(`/library/series/${id}`, patch); load(); }

  async function addValue(cat) {
    const entry = newValue[cat] || {};
    if (!entry.value?.trim()) return;
    await api.post('/library/values', { category: cat, value: entry.value, value_zh: entry.value_zh });
    setNewValue(s => ({ ...s, [cat]: { value: '', value_zh: '' } })); load();
  }
  async function delValue(id) { await api.delete(`/library/values/${id}`); load(); }
  async function reorderValues(ids) { await api.put('/library/values/reorder', { ids }); load(); }
  async function saveValue(id, patch) { await api.put(`/library/values/${id}`, patch); load(); }

  if (!data) return <div className="text-text3">{t('loading')}</div>;

  return (
    <div>
      <h1 className="text-2xl font-black mb-1">📚 {t('library')}</h1>
      <div className="text-xs text-text3 mb-5">
        Всё остальное в интерфейсе уже переведено автоматически. Здесь — то, что пишешь сам: бренды, серии,
        характеристики, статусы. Поля «оригинал ⚭ 中文» стоят парой — правишь любое, клик мимо (или Enter) — сохранится.
      </div>

      <div className="card mb-4">
        <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
          <div className="font-bold text-sm">🏷️ {t('brandsAndSeries')}</div>
          {canEdit && (
            <form onSubmit={addBrand} className="flex items-center gap-1.5">
              <input className="inp inp-sm w-36" placeholder="Название" value={newBrand.name} onChange={e => setNewBrand(b => ({ ...b, name: e.target.value }))} />
              <span className="text-text3 text-xs">⚭</span>
              <input className="inp inp-sm w-36" placeholder="中文" value={newBrand.name_zh} onChange={e => setNewBrand(b => ({ ...b, name_zh: e.target.value }))} />
              <button className="btn btn-primary btn-sm">{t('addBrand')}</button>
            </form>
          )}
        </div>

        <DragReorderList
          items={data.brands}
          getKey={b => b.id}
          onReorder={reorderBrands}
          renderItem={(b, handleProps) => (
            <div className="border-t border-border pt-2">
              <div className="flex justify-between items-center gap-2">
                <span className="flex items-center gap-2 min-w-0">
                  {canEdit && <span {...handleProps} className="text-text3 select-none flex-shrink-0">⠿</span>}
                  <BilingualPair name={b.name} nameZh={b.name_zh} canEdit={canEdit}
                    onSaveName={(v) => saveBrand(b.id, { name: v })} onSaveZh={(v) => saveBrand(b.id, { name_zh: v })}
                    staticName={<span className="font-bold text-sm">{b.name}</span>} />
                </span>
                {canEdit && <button className="text-red text-xs hover:underline flex-shrink-0" onClick={() => delBrand(b.id)}>{t('delete')}</button>}
              </div>
              <div className="pl-3">
                <DragReorderList
                  items={b.series}
                  getKey={s => s.id}
                  onReorder={reorderSeries}
                  renderItem={(s, seriesHandle) => (
                    <div className="flex justify-between items-center gap-2 text-xs text-text2 py-1">
                      <span className="flex items-center gap-2 min-w-0">
                        {canEdit && <span {...seriesHandle} className="text-text3 select-none flex-shrink-0">⠿</span>}
                        <BilingualPair name={s.name} nameZh={s.name_zh} canEdit={canEdit}
                          onSaveName={(v) => saveSeries(s.id, { name: v })} onSaveZh={(v) => saveSeries(s.id, { name_zh: v })} />
                      </span>
                      {canEdit && <button className="text-text3 hover:text-red flex-shrink-0" onClick={() => delSeries(s.id)}>✕</button>}
                    </div>
                  )}
                />
                {canEdit && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="w-4 flex-shrink-0" />
                    <input className="inp inp-sm truncate min-w-0 w-36 flex-shrink-0" placeholder={t('addSeries')} value={newSeries[b.id]?.name || ''}
                      onChange={e => setNewSeries(s => ({ ...s, [b.id]: { ...s[b.id], name: e.target.value } }))}
                      onKeyDown={e => e.key === 'Enter' && addSeries(b.id)} />
                    <span className="text-text3 text-xs flex-shrink-0">⚭</span>
                    <input className="inp inp-sm truncate min-w-0 w-36 flex-shrink-0" placeholder="中文" value={newSeries[b.id]?.name_zh || ''}
                      onChange={e => setNewSeries(s => ({ ...s, [b.id]: { ...s[b.id], name_zh: e.target.value } }))}
                      onKeyDown={e => e.key === 'Enter' && addSeries(b.id)} />
                    <button className="text-accent2 text-xs hover:underline flex-shrink-0" onClick={() => addSeries(b.id)}>+</button>
                  </div>
                )}
              </div>
            </div>
          )}
        />
      </div>

      <div className="card mb-4">
        <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
          <div className="font-bold text-sm">🏷️ Статусы товара</div>
          {canEdit && (
            <form onSubmit={addStatus} className="flex gap-1.5 flex-wrap items-center">
              <input className="inp inp-sm w-36" placeholder="Название статуса" value={newStatus.label} onChange={e => setNewStatus(s => ({ ...s, label: e.target.value }))} />
              <span className="text-text3 text-xs">⚭</span>
              <input className="inp inp-sm w-36" placeholder="中文" value={newStatus.label_zh} onChange={e => setNewStatus(s => ({ ...s, label_zh: e.target.value }))} />
              <select className="inp inp-sm" value={newStatus.counts_as} onChange={e => setNewStatus(s => ({ ...s, counts_as: e.target.value }))}>
                <option value="instock">Считать «в наличии»</option>
                <option value="intransit">Считать «в пути»</option>
                <option value="reserved">Считать «резерв»</option>
                <option value="sold">Считать «продано»</option>
                <option value="other">Не считать в остатках</option>
              </select>
              <button className="btn btn-primary btn-sm">+ Статус</button>
            </form>
          )}
        </div>
        <div className="text-xs text-text3 mb-3">
          «Считать в наличии» — товар с этим статусом учитывается на складе и его можно продать (например, «Склад (восст.)»).
          «Не считать в остатках» — статус просто для информации (например, «На ремонте», «Потерян»).
          Переименование статуса автоматически перенесётся на уже сохранённые товары с этим статусом.
        </div>
        <DragReorderList
          items={data.statuses}
          getKey={s => s.id}
          onReorder={reorderStatuses}
          renderItem={(s, handleProps) => (
            <div className="flex justify-between items-center gap-2 text-sm py-1.5 border-b border-border last:border-0">
              <span className="flex items-center gap-2 min-w-0">
                {canEdit && <span {...handleProps} className="text-text3 select-none flex-shrink-0">⠿</span>}
                <BilingualPair name={s.label} nameZh={s.label_zh} canEdit={canEdit}
                  onSaveName={(v) => saveStatus(s.id, { label: v })} onSaveZh={(v) => saveStatus(s.id, { label_zh: v })} />
              </span>
              <span className="flex items-center gap-2 flex-shrink-0">
                {canEdit ? (
                  <select className="inp inp-sm w-32" value={s.counts_as} onChange={e => saveStatus(s.id, { counts_as: e.target.value })}>
                    <option value="instock">в наличии</option>
                    <option value="intransit">в пути</option>
                    <option value="reserved">резерв</option>
                    <option value="sold">продано</option>
                    <option value="other">не считать</option>
                  </select>
                ) : <span className="badge badge-blue text-[10px]">{s.counts_as}</span>}
                {canEdit && <button className="text-text3 hover:text-red text-xs" onClick={() => delStatus(s.id)}>✕</button>}
              </span>
            </div>
          )}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {CATS.map(([cat, labelKey]) => (
          <div key={cat} className="card">
            <div className="font-bold text-sm mb-3">{t(labelKey)}</div>
            <div className="max-h-56 overflow-y-auto mb-2">
              <DragReorderList
                items={data.values[cat] || []}
                getKey={v => v.id}
                onReorder={(ids) => reorderValues(ids)}
                renderItem={(v, handleProps) => (
                  <div className="flex justify-between items-center gap-2 text-sm py-1 border-b border-border last:border-0">
                    <span className="flex items-center gap-2 min-w-0">
                      {canEdit && <span {...handleProps} className="text-text3 select-none flex-shrink-0">⠿</span>}
                      <BilingualPair name={v.value} nameZh={v.value_zh} canEdit={canEdit}
                        onSaveName={(val) => saveValue(v.id, { value: val })} onSaveZh={(val) => saveValue(v.id, { value_zh: val })} />
                    </span>
                    {canEdit && <button className="text-text3 hover:text-red text-xs flex-shrink-0" onClick={() => delValue(v.id)}>✕</button>}
                  </div>
                )}
              />
              {!(data.values[cat] || []).length && <div className="text-text3 text-xs">—</div>}
            </div>
            {canEdit && (
              <div className="flex items-center gap-1.5">
                <input className="inp inp-sm truncate min-w-0 flex-1" value={newValue[cat]?.value || ''} onChange={e => setNewValue(s => ({ ...s, [cat]: { ...s[cat], value: e.target.value } }))}
                  onKeyDown={e => e.key === 'Enter' && addValue(cat)} />
                <span className="text-text3 text-xs flex-shrink-0">⚭</span>
                <input className="inp inp-sm truncate min-w-0 w-28 flex-shrink-0" placeholder="中文" value={newValue[cat]?.value_zh || ''} onChange={e => setNewValue(s => ({ ...s, [cat]: { ...s[cat], value_zh: e.target.value } }))}
                  onKeyDown={e => e.key === 'Enter' && addValue(cat)} />
                <button className="btn btn-secondary btn-xs flex-shrink-0" onClick={() => addValue(cat)}>{t('addValue')}</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
