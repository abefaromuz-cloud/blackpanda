import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';
import DragReorderList from '../components/DragReorderList';
import { useTT } from '../i18n/useTT';

const CATS = [
  ['cpu', 'processors'], ['gpu', 'gpus'], ['ram', 'rams'],
  ['storage', 'storages'], ['color', 'colors'], ['screen', 'screens'],
  ['refresh_rate', 'refreshRates'], ['screen_type', 'screenTypes'],
  ['keyboard_backlight', 'keyboardBacklights'], ['keyboard_layout', 'keyboardLayouts'],
];

// Инлайн-редактируемое поле — сохраняет по потере фокуса/Enter. w-full — растягивается на всю
// свою колонку сетки (а колонка задаётся один раз на весь список, поэтому все поля одной ширины).
function EditableField({ value, onSave, placeholder }) {
  const [v, setV] = useState(value || '');
  useEffect(() => { setV(value || ''); }, [value]);
  return (
    <input
      className="inp inp-sm truncate w-full min-w-0"
      placeholder={placeholder}
      value={v}
      onChange={e => setV(e.target.value)}
      onBlur={() => { if (v !== (value || '')) onSave(v); }}
      onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
    />
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
  const tt = useTT();

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
    if (!confirm(tt('Удалить бренд и все его серии?'))) return;
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

  // Одна сетка колонок на ВЕСЬ список сразу (а не по строке) — гарантирует, что название и 中文
  // всегда одной ширины и растянуты на всю доступную ширину, независимо от строки и текста внутри.
  // 1fr + 1fr = поля равны и делят между собой ~85% ширины, адаптивно под любой экран.
  const gridCols = 'grid-cols-[20px_1fr_20px_1fr_auto]';

  return (
    <div>
      <h1 className="text-2xl font-black mb-1">📚 {t('library')}</h1>
      <div className="text-xs text-text3 mb-5">
        {tt("Всё остальное в интерфейсе уже переведено автоматически. Здесь — то, что пишешь сам: бренды, серии, характеристики, статусы. Поля «оригинал ⚭ 中文» — одной ширины, растянуты на всю строку.")}
      </div>

      <div className="card mb-4">
        <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
          <div className="font-bold text-sm">🏷️ {t('brandsAndSeries')}</div>
          {canEdit && (
            <form onSubmit={addBrand} className={`grid ${gridCols} gap-2 items-center w-full sm:w-auto sm:min-w-[420px]`}>
              <span />
              <input className="inp inp-sm" placeholder={tt("Название")} value={newBrand.name} onChange={e => setNewBrand(b => ({ ...b, name: e.target.value }))} />
              <span className="text-text3 text-xs text-center">⚭</span>
              <input className="inp inp-sm" placeholder="中文" value={newBrand.name_zh} onChange={e => setNewBrand(b => ({ ...b, name_zh: e.target.value }))} />
              <button className="btn btn-primary btn-sm">{t('addBrand')}</button>
            </form>
          )}
        </div>

        <div className={`grid ${gridCols} gap-x-2 gap-y-1.5`}>
          <DragReorderList
            items={data.brands}
            getKey={b => b.id}
            onReorder={reorderBrands}
            className="contents"
            renderItem={(b, handleProps) => (
              <>
                {canEdit ? <span {...handleProps} className="text-text3 select-none">⠿</span> : <span />}
                {canEdit ? <EditableField value={b.name} onSave={(v) => saveBrand(b.id, { name: v })} /> : <span className="font-bold text-sm truncate">{b.name}</span>}
                <span className="text-text3 text-xs text-center">⚭</span>
                {canEdit ? <EditableField value={b.name_zh} onSave={(v) => saveBrand(b.id, { name_zh: v })} placeholder="中文" /> : <span className="text-text3 text-xs truncate">{b.name_zh}</span>}
                {canEdit && <button className="text-red text-xs hover:underline whitespace-nowrap" onClick={() => delBrand(b.id)}>{t('delete')}</button>}

                <DragReorderList
                  items={b.series}
                  getKey={s => s.id}
                  onReorder={reorderSeries}
                  className="contents"
                  renderItem={(s, seriesHandle) => (
                    <>
                      {canEdit ? <span {...seriesHandle} className="text-text3 select-none pl-3">⠿</span> : <span />}
                      {canEdit ? <EditableField value={s.name} onSave={(v) => saveSeries(s.id, { name: v })} /> : <span className="text-xs text-text2 truncate pl-3">{s.name}</span>}
                      <span className="text-text3 text-xs text-center">⚭</span>
                      {canEdit ? <EditableField value={s.name_zh} onSave={(v) => saveSeries(s.id, { name_zh: v })} placeholder="中文" /> : <span className="text-text3 text-xs truncate">{s.name_zh}</span>}
                      {canEdit && <button className="text-text3 hover:text-red text-xs" onClick={() => delSeries(s.id)}>✕</button>}
                    </>
                  )}
                />

                {canEdit && (
                  <>
                    <span className="pl-3 text-text3 text-xs">＋</span>
                    <input className="inp inp-sm truncate w-full min-w-0" placeholder={t('addSeries')} value={newSeries[b.id]?.name || ''}
                      onChange={e => setNewSeries(s => ({ ...s, [b.id]: { ...s[b.id], name: e.target.value } }))}
                      onKeyDown={e => e.key === 'Enter' && addSeries(b.id)} />
                    <span className="text-text3 text-xs text-center">⚭</span>
                    <input className="inp inp-sm truncate w-full min-w-0" placeholder="中文" value={newSeries[b.id]?.name_zh || ''}
                      onChange={e => setNewSeries(s => ({ ...s, [b.id]: { ...s[b.id], name_zh: e.target.value } }))}
                      onKeyDown={e => e.key === 'Enter' && addSeries(b.id)} />
                    <button className="text-accent2 text-xs hover:underline" onClick={() => addSeries(b.id)}>+</button>
                  </>
                )}
                <div className="col-span-5 border-b border-border my-1" />
              </>
            )}
          />
        </div>
      </div>

      <div className="card mb-4">
        <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
          <div className="font-bold text-sm">🏷️ {tt("Статусы товара")}</div>
          {canEdit && (
            <form onSubmit={addStatus} className="flex gap-1.5 flex-wrap items-center">
              <input className="inp inp-sm w-36" placeholder={tt("Название статуса")} value={newStatus.label} onChange={e => setNewStatus(s => ({ ...s, label: e.target.value }))} />
              <span className="text-text3 text-xs">⚭</span>
              <input className="inp inp-sm w-36" placeholder="中文" value={newStatus.label_zh} onChange={e => setNewStatus(s => ({ ...s, label_zh: e.target.value }))} />
              <select className="inp inp-sm" value={newStatus.counts_as} onChange={e => setNewStatus(s => ({ ...s, counts_as: e.target.value }))}>
                <option value="instock">{tt("Считать «в наличии»")}</option>
                <option value="intransit">{tt("Считать «в пути»")}</option>
                <option value="reserved">{tt("Считать «резерв»")}</option>
                <option value="sold">{tt("Считать «продано»")}</option>
                <option value="other">{tt("Не считать в остатках")}</option>
              </select>
              <button className="btn btn-primary btn-sm">+ {tt("Статус")}</button>
            </form>
          )}
        </div>
        <div className="text-xs text-text3 mb-3">
          {tt("«Считать в наличии» — товар с этим статусом учитывается на складе и его можно продать (например, «Склад (восст.)»). «Не считать в остатках» — статус просто для информации (например, «На ремонте», «Потерян»). Переименование статуса автоматически перенесётся на уже сохранённые товары с этим статусом.")}
        </div>
        <div className="grid grid-cols-[20px_1fr_20px_1fr_128px_20px] gap-x-2 gap-y-1.5 text-sm">
          <DragReorderList
            items={data.statuses}
            getKey={s => s.id}
            onReorder={reorderStatuses}
            className="contents"
            renderItem={(s, handleProps) => (
              <>
                {canEdit ? <span {...handleProps} className="text-text3 select-none">⠿</span> : <span />}
                {canEdit ? <EditableField value={s.label} onSave={(v) => saveStatus(s.id, { label: v })} /> : <span className="truncate">{s.label}</span>}
                <span className="text-text3 text-xs text-center">⚭</span>
                {canEdit ? <EditableField value={s.label_zh} onSave={(v) => saveStatus(s.id, { label_zh: v })} placeholder="中文" /> : <span className="text-text3 text-xs truncate">{s.label_zh}</span>}
                {canEdit ? (
                  <select className="inp inp-sm" value={s.counts_as} onChange={e => saveStatus(s.id, { counts_as: e.target.value })}>
                    <option value="instock">{tt("в наличии")}</option>
                    <option value="intransit">{tt("в пути")}</option>
                    <option value="reserved">{tt("резерв")}</option>
                    <option value="sold">{tt("продано")}</option>
                    <option value="other">{tt("не считать")}</option>
                  </select>
                ) : <span className="badge badge-blue text-[10px] justify-self-start">{s.counts_as}</span>}
                {canEdit && <button className="text-text3 hover:text-red text-xs" onClick={() => delStatus(s.id)}>✕</button>}
                <div className="col-span-6 border-b border-border" />
              </>
            )}
          />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {CATS.map(([cat, labelKey]) => (
          <div key={cat} className="card">
            <div className="font-bold text-sm mb-3">{t(labelKey)}</div>
            <div className="max-h-56 overflow-y-auto mb-2">
              <div className={`grid ${gridCols} gap-x-2 gap-y-1 text-sm`}>
                <DragReorderList
                  items={data.values[cat] || []}
                  getKey={v => v.id}
                  onReorder={(ids) => reorderValues(ids)}
                  className="contents"
                  renderItem={(v, handleProps) => (
                    <>
                      {canEdit ? <span {...handleProps} className="text-text3 select-none">⠿</span> : <span />}
                      {canEdit ? <EditableField value={v.value} onSave={(val) => saveValue(v.id, { value: val })} /> : <span className="truncate">{v.value}</span>}
                      <span className="text-text3 text-xs text-center">⚭</span>
                      {canEdit ? <EditableField value={v.value_zh} onSave={(val) => saveValue(v.id, { value_zh: val })} placeholder="中文" /> : <span className="text-text3 text-xs truncate">{v.value_zh}</span>}
                      {canEdit && <button className="text-text3 hover:text-red text-xs" onClick={() => delValue(v.id)}>✕</button>}
                      <div className="col-span-5 border-b border-border" />
                    </>
                  )}
                />
              </div>
              {!(data.values[cat] || []).length && <div className="text-text3 text-xs">—</div>}
            </div>
            {canEdit && (
              <div className={`grid ${gridCols} gap-2 items-center`}>
                <span />
                <input className="inp inp-sm truncate w-full min-w-0" value={newValue[cat]?.value || ''} onChange={e => setNewValue(s => ({ ...s, [cat]: { ...s[cat], value: e.target.value } }))}
                  onKeyDown={e => e.key === 'Enter' && addValue(cat)} />
                <span className="text-text3 text-xs text-center">⚭</span>
                <input className="inp inp-sm truncate w-full min-w-0" placeholder="中文" value={newValue[cat]?.value_zh || ''} onChange={e => setNewValue(s => ({ ...s, [cat]: { ...s[cat], value_zh: e.target.value } }))}
                  onKeyDown={e => e.key === 'Enter' && addValue(cat)} />
                <button className="btn btn-secondary btn-xs" onClick={() => addValue(cat)}>{t('addValue')}</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
