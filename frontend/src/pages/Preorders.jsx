import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';

export default function Preorders() {
  const [list, setList] = useState([]);
  const [clients, setClients] = useState([]);
  const [laptops, setLaptops] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [clientId, setClientId] = useState('');
  const [items, setItems] = useState([{ laptop_id: '', qty: 1, cost_cny: '', price_sell_cny: '' }]);
  const { can } = useAuth();
  const { t } = useLang();
  const canEdit = can('preorders', 'edit');

  function load() { api.get('/preorders').then(r => setList(r.data)); }
  useEffect(load, []);
  useEffect(() => {
    api.get('/clients').then(r => setClients(r.data));
    api.get('/laptops').then(r => setLaptops(r.data));
  }, []);

  function updateItem(i, patch) {
    setItems(arr => arr.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  }

  async function submit(e) {
    e.preventDefault();
    await api.post('/preorders', { client_id: clientId, items });
    setShowForm(false); setClientId(''); setItems([{ laptop_id: '', qty: 1, cost_cny: '', price_sell_cny: '' }]);
    load();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-xl font-black">{t('preorders')}</h1>
        {canEdit && <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>+ {t('addPreorder')}</button>}
      </div>

      {showForm && canEdit && (
        <form onSubmit={submit} className="card mb-5">
          <div className="mb-3">
            <label className="block text-[11px] text-text2 font-bold uppercase mb-1">{t('client')}</label>
            <select className="inp" value={clientId} onChange={e => setClientId(e.target.value)} required>
              <option value="">— {t('client')} —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-4 gap-2 mb-2">
              <select className="inp" value={it.laptop_id} onChange={e => updateItem(i, { laptop_id: e.target.value })} required>
                <option value="">{t('model')}</option>
                {laptops.map(l => <option key={l.id} value={l.id}>{l.brand} {l.series}</option>)}
              </select>
              <input className="inp" type="number" min="1" placeholder={t('qty')} value={it.qty} onChange={e => updateItem(i, { qty: e.target.value })} />
              <input className="inp" type="number" placeholder={t('costPrice') + ' ¥'} value={it.cost_cny} onChange={e => updateItem(i, { cost_cny: e.target.value })} />
              <input className="inp" type="number" placeholder={t('sellPrice') + ' ¥'} value={it.price_sell_cny} onChange={e => updateItem(i, { price_sell_cny: e.target.value })} />
            </div>
          ))}
          <div className="flex gap-2 mt-2">
            <button type="button" className="btn btn-secondary" onClick={() => setItems(a => [...a, { laptop_id: '', qty: 1, cost_cny: '', price_sell_cny: '' }])}>{t('addItem')}</button>
            <button className="btn btn-primary">{t('createPreorder')}</button>
          </div>
        </form>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {list.map(p => (
          <Link key={p.id} to={`/preorders/${p.id}`} className="card hover:border-accent/60 hover:shadow-glow block">
            <div className="flex justify-between items-start mb-2">
              <span className="font-bold">{p.client_name}</span>
              <span className={`badge ${p.stage === 'done' ? 'badge-green' : 'badge-yellow'}`}>{p.stage === 'done' ? t('done') : t('active')}</span>
            </div>
            <div className="text-xs text-text3">No.{p.id.slice(-6)} · {p.items.length}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
