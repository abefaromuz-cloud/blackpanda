import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', telegram: '' });
  const { can } = useAuth();
  const { t } = useLang();
  const canEdit = can('clients', 'edit');

  function load() { api.get('/clients').then(r => setClients(r.data)); }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    await api.post('/clients', form);
    setForm({ name: '', phone: '', telegram: '' }); setShowForm(false); load();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-xl font-black">{t('clients')}</h1>
        {canEdit && <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>+ {t('addClient')}</button>}
      </div>

      {showForm && canEdit && (
        <form onSubmit={submit} className="card mb-5 grid grid-cols-3 gap-3">
          <input className="inp" placeholder={t('name')} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          <input className="inp" placeholder={t('phone')} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          <input className="inp" placeholder="Telegram (@username)" value={form.telegram} onChange={e => setForm(f => ({ ...f, telegram: e.target.value }))} />
          <button className="btn btn-primary col-span-3">{t('save')}</button>
        </form>
      )}

      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase text-text3 border-b border-border">
              <th className="pb-2">{t('name')}</th><th className="pb-2">{t('phone')}</th><th className="pb-2">{t('purchases')}</th><th className="pb-2">{t('debt')}</th>
            </tr>
          </thead>
          <tbody>
            {clients.map(c => (
              <tr key={c.id} className="border-b border-border last:border-0">
                <td className="py-2"><Link to={`/clients/${c.id}`} className="hover:text-accent2 font-medium">{c.name}</Link></td>
                <td className="py-2 text-text3">{c.phone || '—'}</td>
                <td className="py-2">{Math.round(c.total_purchases_rub).toLocaleString('ru-RU')} ₽</td>
                <td className={`py-2 font-mono ${Number(c.debt_rub) > 0 ? 'text-red' : 'text-text3'}`}>
                  {Math.round(c.debt_rub).toLocaleString('ru-RU')} ₽
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
