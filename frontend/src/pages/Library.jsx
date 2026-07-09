import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';

const CATS = [
  ['cpu', 'processors'], ['gpu', 'gpus'], ['ram', 'rams'],
  ['storage', 'storages'], ['color', 'colors'], ['screen', 'screens'],
];

export default function Library() {
  const [data, setData] = useState(null);
  const [newBrand, setNewBrand] = useState('');
  const [newSeries, setNewSeries] = useState({});
  const [newValue, setNewValue] = useState({});
  const { can } = useAuth();
  const { t } = useLang();
  const canEdit = can('library', 'edit');

  function load() { api.get('/library').then(r => setData(r.data)); }
  useEffect(load, []);

  async function addBrand(e) {
    e.preventDefault();
    if (!newBrand.trim()) return;
    await api.post('/library/brands', { name: newBrand });
    setNewBrand(''); load();
  }
  async function delBrand(id) {
    if (!confirm('Удалить бренд и все его серии?')) return;
    await api.delete(`/library/brands/${id}`); load();
  }
  async function addSeries(brandId) {
    const name = newSeries[brandId];
    if (!name?.trim()) return;
    await api.post(`/library/brands/${brandId}/series`, { name });
    setNewSeries(s => ({ ...s, [brandId]: '' })); load();
  }
  async function delSeries(id) {
    await api.delete(`/library/series/${id}`); load();
  }
  async function addValue(cat) {
    const v = newValue[cat];
    if (!v?.trim()) return;
    await api.post('/library/values', { category: cat, value: v });
    setNewValue(s => ({ ...s, [cat]: '' })); load();
  }
  async function delValue(id) {
    await api.delete(`/library/values/${id}`); load();
  }

  if (!data) return <div className="text-text3">{t('loading')}</div>;

  return (
    <div>
      <h1 className="text-2xl font-black mb-6">📚 {t('library')}</h1>

      <div className="card mb-4">
        <div className="flex justify-between items-center mb-3">
          <div className="font-bold text-sm">🏷️ {t('brandsAndSeries')}</div>
          {canEdit && (
            <form onSubmit={addBrand} className="flex gap-2">
              <input className="inp w-40" placeholder={t('name')} value={newBrand} onChange={e => setNewBrand(e.target.value)} />
              <button className="btn btn-primary btn-sm">{t('addBrand')}</button>
            </form>
          )}
        </div>
        <div className="space-y-3">
          {data.brands.map(b => (
            <div key={b.id} className="border-t border-border pt-2">
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-sm">{b.name}</span>
                {canEdit && <button className="text-red text-xs hover:underline" onClick={() => delBrand(b.id)}>{t('delete')}</button>}
              </div>
              <div className="pl-3 space-y-1">
                {b.series.map(s => (
                  <div key={s.id} className="flex justify-between items-center text-xs text-text2">
                    <span>{s.name}</span>
                    {canEdit && <button className="text-text3 hover:text-red" onClick={() => delSeries(s.id)}>✕</button>}
                  </div>
                ))}
                {canEdit && (
                  <div className="flex gap-2 mt-1">
                    <input className="inp inp-sm flex-1" placeholder={t('addSeries')} value={newSeries[b.id] || ''}
                      onChange={e => setNewSeries(s => ({ ...s, [b.id]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && addSeries(b.id)} />
                    <button className="btn btn-secondary btn-xs" onClick={() => addSeries(b.id)}>+</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {CATS.map(([cat, labelKey]) => (
          <div key={cat} className="card">
            <div className="font-bold text-sm mb-3">{t(labelKey)}</div>
            <div className="max-h-56 overflow-y-auto mb-2">
              {(data.values[cat] || []).map(v => (
                <div key={v.id} className="flex justify-between items-center text-sm py-1 border-b border-border last:border-0">
                  <span>{v.value}</span>
                  {canEdit && <button className="text-text3 hover:text-red text-xs" onClick={() => delValue(v.id)}>✕</button>}
                </div>
              ))}
              {!(data.values[cat] || []).length && <div className="text-text3 text-xs">—</div>}
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <input className="inp inp-sm flex-1" value={newValue[cat] || ''} onChange={e => setNewValue(s => ({ ...s, [cat]: e.target.value }))}
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
