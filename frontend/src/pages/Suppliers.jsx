import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';

const empty = { name: '', contact_person: '', phone: '', wechat: '', country: 'CN', notes: '' };

export default function Suppliers() {
  const [list, setList] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(empty);
  const { can } = useAuth();
  const { t } = useLang();
  const canEdit = can('suppliers', 'edit');

  function load() { api.get('/suppliers').then(r => setList(r.data)); }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    await api.post('/suppliers', form);
    setForm(empty); setShowForm(false); load();
  }

  async function remove(id) {
    if (!confirm('?')) return;
    await api.delete(`/suppliers/${id}`);
    load();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-2xl font-black">{t('suppliers')}</h1>
        {canEdit && <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>{t('addSupplier')}</button>}
      </div>

      {showForm && canEdit && (
        <form onSubmit={submit} className="card mb-5 grid grid-cols-2 md:grid-cols-3 gap-3">
          <input className="inp" placeholder={t('name')} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          <input className="inp" placeholder={t('contactPerson')} value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} />
          <input className="inp" placeholder={t('phone')} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          <input className="inp" placeholder={t('wechat')} value={form.wechat} onChange={e => setForm(f => ({ ...f, wechat: e.target.value }))} />
          <input className="inp" placeholder={t('country')} value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} />
          <input className="inp" placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          <button className="btn btn-primary">{t('save')}</button>
        </form>
      )}

      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase text-text3 border-b border-border">
              <th className="pb-2">{t('name')}</th><th className="pb-2">{t('contactPerson')}</th><th className="pb-2">{t('phone')}</th>
              <th className="pb-2">WeChat</th><th className="pb-2">{t('itemsSupplied')}</th><th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {list.map(s => (
              <tr key={s.id} className="border-b border-border last:border-0">
                <td className="py-2 font-medium">{s.name}</td>
                <td className="py-2 text-text3">{s.contact_person || '—'}</td>
                <td className="py-2 text-text3">{s.phone || '—'}</td>
                <td className="py-2 text-text3">{s.wechat || '—'}</td>
                <td className="py-2 font-mono">{s.items_supplied}</td>
                <td className="py-2 text-right">{canEdit && <button className="text-text3 hover:text-red text-xs" onClick={() => remove(s.id)}>{t('delete')}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
