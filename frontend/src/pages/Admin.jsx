import { useEffect, useState } from 'react';
import api from '../api/client';
import { useLang } from '../i18n/LangContext';
import { roleLabels, pageLabels } from '../i18n/translations';
import DragReorderList from '../components/DragReorderList';
import { useTT } from '../i18n/useTT';

const ROLES = ['admin', 'staff', 'accountant', 'client'];
const PAGES = ['dashboard', 'warehouse', 'clients', 'preorders', 'sales', 'cash', 'settings', 'admin', 'client_portal',
  'finance', 'analytics', 'reports', 'import', 'employees', 'activity_log', 'scan', 'broadcast', 'library', 'arrivals', 'service'];
const NAV_PAGES = ['dashboard', 'scan', 'warehouse', 'library', 'clients', 'preorders', 'sales',
  'finance', 'analytics', 'reports', 'broadcast', 'import', 'activity_log', 'settings', 'arrivals', 'service'];

export default function Admin() {
  const { t, lang } = useLang();
  const [tab, setTab] = useState('users');
  const tt = useTT();

  return (
    <div>
      <h1 className="text-2xl font-black mb-6 flex items-center gap-2"><span className="text-purple">◇</span> {t('admin')}</h1>
      <div className="flex gap-2 mb-5 flex-wrap">
        <button onClick={() => setTab('users')} className={`btn ${tab === 'users' ? 'btn-primary' : 'btn-secondary'}`}>{t('users')}</button>
        <button onClick={() => setTab('permissions')} className={`btn ${tab === 'permissions' ? 'btn-primary' : 'btn-secondary'}`}>{t('permissions')}</button>
        <button onClick={() => setTab('navorder')} className={`btn ${tab === 'navorder' ? 'btn-primary' : 'btn-secondary'}`}>{t('menuOrder')}</button>
        <button onClick={() => setTab('danger')} className={`btn ${tab === 'danger' ? 'btn-danger' : 'btn-secondary'}`}>⚠️ {tt('Опасная зона')}</button>
      </div>
      {tab === 'users' ? <UsersTab /> : tab === 'permissions' ? <PermissionsTab /> : tab === 'navorder' ? <NavOrderTab /> : <DangerZoneTab />}
    </div>
  );
}

function NavOrderTab() {
  const { t, lang } = useLang();
  const tt = useTT();
  const [order, setOrder] = useState(null);

  function load() {
    api.get('/nav-order').then(r => {
      const saved = r.data.map(o => o.page_key);
      const full = [...saved, ...NAV_PAGES.filter(p => !saved.includes(p))];
      setOrder(full.map(p => ({ page: p })));
    });
  }
  useEffect(load, []);

  async function reorder(keys) {
    setOrder(keys.map(p => ({ page: p })));
    await api.put('/nav-order', { page_keys: keys });
  }

  if (!order) return <div className="text-text3">{t('loading')}</div>;

  return (
    <div className="card max-w-md">
      <div className="font-bold text-sm mb-1">{t('menuOrder')}</div>
      <div className="text-xs text-text3 mb-3">{tt("Перетащи разделы, чтобы изменить порядок в меню — для всех пользователей сразу.")}</div>
      <DragReorderList
        items={order}
        getKey={o => o.page}
        onReorder={reorder}
        renderItem={(o, handleProps) => (
          <div className="flex items-center gap-3 py-2 border-b border-border last:border-0">
            <span {...handleProps} className="text-text3 select-none text-lg">⠿</span>
            <span className="text-sm">{pageLabels[lang]?.[o.page] || o.page}</span>
          </div>
        )}
      />
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
        <div className="overflow-x-auto">
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
    </div>
  );
}

function PermissionsTab() {
  const { t, lang } = useLang();
  const tt = useTT();
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
        <div className="text-[11px] text-text3 mt-2">{t('view')} / {t('editPerm')} — {tt('админ всегда имеет полный доступ и в этой таблице не участвует.')}</div>
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
                    <td className="py-2">{pageLabels[lang][page]} {!override && <span className="text-text3 text-[10px]">({tt("роль")})</span>}</td>
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

function DangerZoneTab() {
  const tt = useTT();
  const [codeSet, setCodeSet] = useState(null);
  const [newCode, setNewCode] = useState('');
  const [msg, setMsg] = useState('');

  const [wCode, setWCode] = useState('');
  const [wFrom, setWFrom] = useState('');
  const [wTo, setWTo] = useState('');
  const [wConfirm, setWConfirm] = useState('');
  const [wResult, setWResult] = useState(null);
  const [wBusy, setWBusy] = useState(false);

  const [eCode, setECode] = useState('');
  const [eConfirm, setEConfirm] = useState('');
  const [eBusy, setEBusy] = useState(false);

  const [loadError, setLoadError] = useState('');
  function load() {
    api.get('/admin-danger/code-status')
      .then(r => setCodeSet(r.data.code_set))
      .catch(err => { setLoadError(err.response?.data?.error || err.message || 'Не удалось загрузить'); setCodeSet(false); });
  }
  useEffect(load, []);

  async function saveCode(e) {
    e.preventDefault();
    if (!newCode) return;
    try {
      await api.post('/admin-danger/set-code', { code: newCode });
      setNewCode(''); setMsg(tt('Код сохранён')); load();
    } catch (err) {
      setMsg(`❌ ${err.response?.data?.error || 'Ошибка сохранения'}`);
    }
  }

  async function clearWarehouse(e) {
    e.preventDefault();
    if (wConfirm !== 'УДАЛИТЬ СКЛАД') { alert(tt('Введи текст подтверждения ровно как указано')); return; }
    setWBusy(true); setWResult(null);
    try {
      const { data } = await api.post('/admin-danger/clear-warehouse', { code: wCode, from: wFrom || undefined, to: wTo || undefined });
      setWResult(data);
      setWCode(''); setWConfirm('');
    } catch (e2) { alert(e2.response?.data?.error || 'Ошибка'); }
    finally { setWBusy(false); }
  }

  async function clearEverything(e) {
    e.preventDefault();
    if (eConfirm !== 'УДАЛИТЬ ВСЁ') { alert(tt('Введи текст подтверждения ровно как указано')); return; }
    setEBusy(true);
    try {
      await api.post('/admin-danger/clear-everything', { code: eCode });
      alert('✅ ' + tt('Система полностью очищена'));
      setECode(''); setEConfirm('');
    } catch (e2) { alert(e2.response?.data?.error || 'Ошибка'); }
    finally { setEBusy(false); }
  }

  if (codeSet === null) return <div className="text-text3">Загрузка...</div>;

  return (
    <div className="space-y-5">
      {loadError && <div className="card border border-red text-red text-sm">⚠️ {tt('Не удалось загрузить статус кода доступа')}: {loadError}</div>}
      <div className="card border border-red/30">
        <div className="text-red text-sm font-bold mb-2">⚠️ {tt('Эти действия необратимы. Пользоваться только если точно понимаешь, что делаешь.')}</div>
      </div>

      <form onSubmit={saveCode} className="card">
        <div className="font-bold text-sm mb-1">🔑 {tt('Код доступа к опасным операциям')}</div>
        <div className="text-xs text-text3 mb-3">
          {codeSet ? tt('Код уже установлен. Ты можешь сменить его ниже.') : tt('Код ещё не установлен — задай его, прежде чем сможешь что-либо очищать.')}
        </div>
        <div className="flex gap-2 flex-wrap">
          <input className="inp max-w-xs" type="password" placeholder={tt('Новый код (минимум 4 символа)')} value={newCode} onChange={e => setNewCode(e.target.value)} />
          <button className="btn btn-primary">{tt('Сохранить код')}</button>
        </div>
        {msg && <div className="text-green text-xs mt-2">{msg}</div>}
      </form>

      <form onSubmit={clearWarehouse} className="card border border-yellow/30">
        <div className="font-bold text-sm mb-1">📦 {tt('Очистить склад')}</div>
        <div className="text-xs text-text3 mb-3">{tt('Удаляет модели, серийники и связанные с ними продажи/предзаказы. Можно указать диапазон дат добавления модели — тогда удалятся только модели, добавленные в этот период.')}</div>
        <div className="grid grid-cols-2 gap-2 mb-3 max-w-md">
          <div><label className="block text-[11px] text-text2 mb-1">{tt('С даты (необязательно)')}</label><input className="inp" type="date" value={wFrom} onChange={e => setWFrom(e.target.value)} /></div>
          <div><label className="block text-[11px] text-text2 mb-1">{tt('По дату (необязательно)')}</label><input className="inp" type="date" value={wTo} onChange={e => setWTo(e.target.value)} /></div>
        </div>
        <input className="inp mb-2 max-w-xs" type="password" placeholder={tt('Код доступа')} value={wCode} onChange={e => setWCode(e.target.value)} />
        <input className="inp mb-3 max-w-xs" placeholder={tt('Введи: УДАЛИТЬ СКЛАД')} value={wConfirm} onChange={e => setWConfirm(e.target.value)} />
        <button className="btn btn-danger" disabled={wBusy}>{wBusy ? tt('Удаляю...') : `🗑️ ${tt('Очистить склад')}`}</button>
        {wResult && <div className="text-xs text-text3 mt-2">{tt('Удалено моделей')}: {wResult.deleted_models}, {tt('серийников')}: {wResult.deleted_serials}</div>}
      </form>

      <form onSubmit={clearEverything} className="card border border-red/50">
        <div className="font-bold text-sm mb-1 text-red">💣 {tt('Полная очистка системы')}</div>
        <div className="text-xs text-text3 mb-3">{tt('Удаляет ВСЁ: клиентов, склад, продажи, предзаказы, кассу, долги, сервис, рассылки. Пользователи, права доступа и Справочник остаются.')}</div>
        <input className="inp mb-2 max-w-xs" type="password" placeholder={tt('Код доступа')} value={eCode} onChange={e => setECode(e.target.value)} />
        <input className="inp mb-3 max-w-xs" placeholder={tt('Введи: УДАЛИТЬ ВСЁ')} value={eConfirm} onChange={e => setEConfirm(e.target.value)} />
        <button className="btn btn-danger" disabled={eBusy}>{eBusy ? tt('Удаляю...') : `💣 ${tt('Очистить всю систему')}`}</button>
      </form>
    </div>
  );
}
