import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';

const empty = { full_name: '', position: '', phone: '', hire_date: '', salary_rub: '', notes: '' };

export default function Employees() {
  const [list, setList] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(empty);
  const { can } = useAuth();
  const { t } = useLang();
  const canEdit = can('employees', 'edit');

  function load() { api.get('/employees').then(r => setList(r.data)); }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    await api.post('/employees', form);
    setForm(empty); setShowForm(false); load();
  }

  async function toggleActive(e) {
    await api.put(`/employees/${e.id}`, { is_active: !e.is_active });
    load();
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-2xl font-black">{t('employees')}</h1>
        {canEdit && <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>{t('addEmployee')}</button>}
      </div>

      {showForm && canEdit && (
        <form onSubmit={submit} className="card mb-5 grid grid-cols-2 md:grid-cols-3 gap-3">
          <input className="inp" placeholder={t('fullName')} value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required />
          <input className="inp" placeholder={t('position')} value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} />
          <input className="inp" placeholder={t('phone')} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          <input className="inp" type="date" placeholder={t('hireDate')} value={form.hire_date} onChange={e => setForm(f => ({ ...f, hire_date: e.target.value }))} />
          <input className="inp" type="number" placeholder={t('salary') + ' ₽'} value={form.salary_rub} onChange={e => setForm(f => ({ ...f, salary_rub: e.target.value }))} />
          <input className="inp" placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          <button className="btn btn-primary">{t('save')}</button>
        </form>
      )}

      <div className="card">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase text-text3 border-b border-border">
              <th className="pb-2">{t('fullName')}</th><th className="pb-2">{t('position')}</th><th className="pb-2">{t('phone')}</th>
              <th className="pb-2">{t('hireDate')}</th><th className="pb-2">{t('salary')}</th><th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {list.map(e => (
              <tr key={e.id} className="border-b border-border last:border-0">
                <td className="py-2 font-medium">{e.full_name}{!e.is_active && <span className="badge badge-red ml-2">off</span>}</td>
                <td className="py-2 text-text3">{e.position || '—'}</td>
                <td className="py-2 text-text3">{e.phone || '—'}</td>
                <td className="py-2 text-text3">{e.hire_date ? new Date(e.hire_date).toLocaleDateString('ru-RU') : '—'}</td>
                <td className="py-2 font-mono">{Number(e.salary_rub).toLocaleString('ru-RU')} ₽</td>
                <td className="py-2 text-right">{canEdit && <button className="text-text3 hover:text-yellow text-xs" onClick={() => toggleActive(e)}>{e.is_active ? 'off' : 'on'}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
