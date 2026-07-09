import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';

const emptyForm = { brand: '', series: '', cpu: '', ram: '', gpu: '', storage: '', color: '', screen: '', cost_cny: '', price_sell_cny: '' };

export default function Warehouse() {
  const [laptops, setLaptops] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const { can } = useAuth();
  const { t } = useLang();
  const canEdit = can('warehouse', 'edit');

  function load() { api.get('/laptops').then(r => setLaptops(r.data)); }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    await api.post('/laptops', form);
    setForm(emptyForm); setShowForm(false); load();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-xl font-black">{t('warehouse')}</h1>
        {canEdit && <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>+ {t('addModel')}</button>}
      </div>

      {showForm && canEdit && (
        <form onSubmit={submit} className="card mb-5 grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.keys(emptyForm).map(k => (
            <input key={k} className="inp" placeholder={k} value={form[k]}
              onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
          ))}
          <button className="btn btn-primary col-span-2 md:col-span-1">{t('save')}</button>
        </form>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {laptops.map(l => (
          <Link key={l.id} to={`/warehouse/${l.id}`} className="card hover:border-accent/60 hover:shadow-glow block">
            <div className="text-[10px] text-text3 font-bold uppercase mb-1">{l.brand}</div>
            <div className="font-bold text-sm mb-2">{l.series} · {l.cpu} · {l.ram}</div>
            <div className="flex gap-2 text-xs flex-wrap mb-2">
              <span className="badge badge-green">{t('inStock')}: {l.in_stock}</span>
              <span className="badge badge-yellow">{t('inTransit')}: {l.in_transit}</span>
              <span className="badge badge-blue">{t('reserved')}: {l.reserved}</span>
            </div>
            <div className="flex justify-between items-end pt-2 border-t border-border">
              <span className="font-mono font-black text-yellow">¥{l.price_sell_cny}</span>
              <span className="text-xs text-text3">{t('costPrice')} ¥{l.cost_cny}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
