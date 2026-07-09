import { useEffect, useState } from 'react';
import api from '../api/client';
import { useLang } from '../i18n/LangContext';
import { roleLabels, pageLabels } from '../i18n/translations';

const ROLES = ['admin', 'staff', 'accountant', 'client'];
const PAGES = ['dashboard', 'warehouse', 'clients', 'preorders', 'sales', 'cash', 'settings', 'admin', 'client_portal',
  'suppliers', 'finance', 'analytics', 'reports', 'import', 'employees', 'activity_log', 'scan', 'broadcast', 'library'];

export default function Admin() {
  const { t, lang } = useLang();
  const [tab, setTab] = useState('users');

  return (
    <div>
      <h1 className="text-2xl font-black mb-6 flex items-center gap-2"><span className="text-purple">◇</span> {t('admin')}</h1>
      <div className="flex gap-2 mb-5">
        <button onClick={() => setTab('users')} className={`btn ${tab === 'users' ? 'btn-primary' : 'btn-secondary'}`}>{t('users')}</button>
        <button onClick={() => setTab('permissions')} className={`btn ${tab === 'permissions' ? 'btn-primary' : 'btn-secondary'}`}>{t('permissions')}</button>
      </div>
      {tab === 'users' ? <UsersTab /> : <PermissionsTab />}
    </div>
  );
}

function UsersTab() {
  const { t, lang } = useLang();
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'staff', client_id: '' });
  const [editing, setEditing] = useState(null);

  function load() { api.get('/admin/users').then(r => setUsers(r.data)); }
  useEffect(load, []);
  useEffect(() => { api.get('/clients').then(r => setClients(r.data)); }, []);

  async function submit(e) {
    e.preventDefault();
    await api.post('/admin/users', form);
    setForm({ full_name: '', email: '', password: '', role: 'staff', client_id: '' });
    setShowForm(false); load();
  }

  async function saveEdit(e) {
    e.preventDefault();
    await api.put(`/admin/users/${editing.id}`, editing);
    setEditing(null); load();
  }

  async function toggleActive(u) {
    await api.put(`/admin/users/${u.id}`, { is_active: !u.is_active });
    load();
  }

  async function remove(u) {
    if (!confirm(`${u.full_name}?`)) return;
    await api.delete(`/admin/users/${u.id}`);
    load();
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>{t('createUser')}</button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="card mb-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          <input className="inp" placeholder={t('fullName')} value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required />
          <input className="inp" placeholder="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
          <input className="inp" placeholder={t('password')} type="text" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
          <select className="inp" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
            {ROLES.map(r => <option key={r} value={r}>{roleLabels[lang][r]}</option>)}
          </select>
          {form.role === 'client' && (
            <select className="inp" value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))} required>
              <option value="">— {t('client')} —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <button className="btn btn-primary">{t('save')}</button>
        </form>
      )}

      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase text-text3 border-b border-border">
              <th className="pb-2">{t('fullName')}</th><th className="pb-2">Email</th><th className="pb-2">{t('role')}</th><th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-border last:border-0">
                {editing?.id === u.id ? (
                  <td colSpan={4} className="py-2">
                    <form onSubmit={saveEdit} className="flex flex-wrap gap-2 items-center">
                      <input className="inp w-40" value={editing.full_name} onChange={e => setEditing(ed => ({ ...ed, full_name: e.target.value }))} />
                      <input className="inp w-48" value={editing.email} onChange={e => setEditing(ed => ({ ...ed, email: e.target.value }))} />
                      <select className="inp w-32" value={editing.role} onChange={e => setEditing(ed => ({ ...ed, role: e.target.value }))}>
                        {ROLES.map(r => <option key={r} value={r}>{roleLabels[lang][r]}</option>)}
                      </select>
                      <input className="inp w-36" placeholder={t('password') + ' (—)'} onChange={e => setEditing(ed => ({ ...ed, password: e.target.value }))} />
                      <button className="btn btn-primary">{t('save')}</button>
                      <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>{t('cancel')}</button>
                    </form>
                  </td>
                ) : (
                  <>
                    <td className="py-2">{u.full_name}{!u.is_active && <span className="badge badge-red ml-2">off</span>}</td>
                    <td className="py-2 text-text3">{u.email}</td>
                    <td className="py-2"><span className="badge badge-blue">{roleLabels[lang][u.role]}</span> {u.client_name && <span className="text-text3 text-xs ml-1">({u.client_name})</span>}</td>
                    <td className="py-2 text-right space-x-2">
                      <button className="text-text3 hover:text-accent2 text-xs" onClick={() => setEditing({ ...u, password: '' })}>{t('edit')}</button>
                      <button className="text-text3 hover:text-yellow text-xs" onClick={() => toggleActive(u)}>{u.is_active ? 'off' : 'on'}</button>
                      <button className="text-text3 hover:text-red text-xs" onClick={() => remove(u)}>{t('delete')}</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PermissionsTab() {
  const { t, lang } = useLang();
  const [data, setData] = useState(null);
  const [selectedUser, setSelectedUser] = useState('');
  const [users, setUsers] = useState([]);

  function load() { api.get('/admin/permissions').then(r => setData(r.data)); }
  useEffect(load, []);
  useEffect(() => { api.get('/admin/users').then(r => setUsers(r.data)); }, []);

  function roleValue(role, page) {
    return data?.rolePermissions.find(p => p.role === role && p.page_key === page) || { can_view: false, can_edit: false };
  }

  async function setRolePerm(role, page, patch) {
    const current = roleValue(role, page);
    const next = { ...current, ...patch };
    await api.put('/admin/permissions/role', { role, page_key: page, can_view: next.can_view, can_edit: next.can_edit });
    load();
  }

  function userValue(userId, page) {
    return data?.userPermissions.find(p => p.user_id === userId && p.page_key === page);
  }

  async function setUserPerm(userId, page, patch) {
    const current = userValue(userId, page) || { can_view: false, can_edit: false };
    const next = { ...current, ...patch };
    await api.put('/admin/permissions/user', { user_id: userId, page_key: page, can_view: next.can_view, can_edit: next.can_edit });
    load();
  }

  async function clearUserPerm(userId, page) {
    await api.delete(`/admin/permissions/user/${userId}/${page}`);
    load();
  }

  if (!data) return <div className="text-text3">{t('loading')}</div>;

  return (
    <div className="space-y-6">
      <div className="card overflow-x-auto">
        <div className="font-bold text-sm mb-3">{t('permissions')} — {t('role')}</div>
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="text-left text-[10px] uppercase text-text3 border-b border-border">
              <th className="pb-2">{t('role')}</th>
              {PAGES.map(p => <th key={p} className="pb-2 text-center">{pageLabels[lang][p]}</th>)}
            </tr>
          </thead>
          <tbody>
            {ROLES.filter(r => r !== 'admin').map(role => (
              <tr key={role} className="border-b border-border last:border-0">
                <td className="py-2 font-medium">{roleLabels[lang][role]}</td>
                {PAGES.map(page => {
                  const v = roleValue(role, page);
                  return (
                    <td key={page} className="py-2 text-center">
                      <div className="flex gap-1 justify-center">
                        <label title={t('view')} className="cursor-pointer">
                          <input type="checkbox" checked={v.can_view} onChange={e => setRolePerm(role, page, { can_view: e.target.checked, can_edit: e.target.checked ? v.can_edit : false })} />
                        </label>
                        <label title={t('editPerm')} className="cursor-pointer">
                          <input type="checkbox" checked={v.can_edit} disabled={!v.can_view} onChange={e => setRolePerm(role, page, { can_edit: e.target.checked })} />
                        </label>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-[11px] text-text3 mt-2">{t('view')} / {t('editPerm')} — админ всегда имеет полный доступ и в этой таблице не участвует.</div>
      </div>

      <div className="card overflow-x-auto">
        <div className="font-bold text-sm mb-3">{t('overrideFor')}</div>
        <select className="inp mb-4 max-w-xs" value={selectedUser} onChange={e => setSelectedUser(e.target.value)}>
          <option value="">— {t('users')} —</option>
          {users.filter(u => u.role !== 'admin').map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
        {selectedUser && (
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="text-left text-[10px] uppercase text-text3 border-b border-border">
                <th className="pb-2">{t('page')}</th>
                <th className="pb-2 text-center">{t('view')}</th>
                <th className="pb-2 text-center">{t('editPerm')}</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {PAGES.map(page => {
                const override = userValue(selectedUser, page);
                const roleDefault = roleValue(users.find(u => u.id === selectedUser)?.role, page);
                const v = override || roleDefault;
                return (
                  <tr key={page} className="border-b border-border last:border-0">
                    <td className="py-2">{pageLabels[lang][page]} {!override && <span className="text-text3 text-[10px]">(роль)</span>}</td>
                    <td className="py-2 text-center">
                      <input type="checkbox" checked={v.can_view} onChange={e => setUserPerm(selectedUser, page, { can_view: e.target.checked, can_edit: e.target.checked ? v.can_edit : false })} />
                    </td>
                    <td className="py-2 text-center">
                      <input type="checkbox" checked={v.can_edit} disabled={!v.can_view} onChange={e => setUserPerm(selectedUser, page, { can_edit: e.target.checked })} />
                    </td>
                    <td className="py-2 text-right">
                      {override && <button className="text-xs text-text3 hover:text-red" onClick={() => clearUserPerm(selectedUser, page)}>{t('backToRoleDefault')}</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
