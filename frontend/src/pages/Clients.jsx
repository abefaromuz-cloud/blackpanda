import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Users, Star, Wallet, TrendingUp, Search, Filter, LayoutGrid, List as ListIcon } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';

const CATEGORY_LABEL = { retail: 'Розница', wholesale: 'Опт', vip: 'VIP' };
const CATEGORY_BADGE = { retail: 'badge-blue', wholesale: 'badge-purple', vip: 'badge-yellow' };

const emptyForm = { name: '', phone: '', telegram: '', city: '', category: 'retail', discount_percent: 0, manager_id: '' };

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [stats, setStats] = useState(null);
  const [managers, setManagers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sort, setSort] = useState('recent');
  const [view, setView] = useState('grid');
  const [page, setPage] = useState(1);
  const perPage = 8;
  const { can } = useAuth();
  const { t } = useLang();
  const canEdit = can('clients', 'edit');

  function load() {
    api.get('/clients').then(r => setClients(r.data));
    api.get('/clients/stats').then(r => setStats(r.data));
    api.get('/clients/managers-list').then(r => setManagers(r.data));
  }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    await api.post('/clients', { ...form, manager_id: form.manager_id || null });
    setForm(emptyForm); setShowForm(false); load();
  }

  const debtorsCount = useMemo(() => clients.filter(c => Number(c.open_debt_rub) > 0).length, [clients]);
  const wholesaleCount = useMemo(() => clients.filter(c => c.category === 'wholesale').length, [clients]);
  const retailCount = useMemo(() => clients.filter(c => c.category === 'retail').length, [clients]);

  const filtered = useMemo(() => {
    let list = clients.filter(c => {
      if (search && !`${c.name} ${c.phone || ''} ${c.telegram || ''}`.toLowerCase().includes(search.toLowerCase())) return false;
      if (categoryFilter === 'debtors') return Number(c.open_debt_rub) > 0;
      if (categoryFilter !== 'all') return c.category === categoryFilter;
      return true;
    });
    if (sort === 'recent') list = [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    else if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    else if (sort === 'purchases') list = [...list].sort((a, b) => Number(b.total_purchases_rub) - Number(a.total_purchases_rub));
    else if (sort === 'debt') list = [...list].sort((a, b) => Number(b.open_debt_rub) - Number(a.open_debt_rub));
    return list;
  }, [clients, search, categoryFilter, sort]);

  useEffect(() => { setPage(1); }, [search, categoryFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageItems = filtered.slice((page - 1) * perPage, page * perPage);

  function daysAgo(dateStr) {
    if (!dateStr) return null;
    return Math.floor((Date.now() - new Date(dateStr)) / 86400000);
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-5 flex-wrap gap-2">
        <h1 className="text-2xl font-black flex items-center gap-2"><Users size={22} /> {t('clients')}</h1>
        {canEdit && <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>+ {t('addClient')}</button>}
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="card flex items-center justify-between">
            <div><div className="text-xs text-text3 mb-1">Всего клиентов</div><div className="text-2xl font-black">{stats.total}</div></div>
            <Users size={22} className="text-accent2 opacity-70" />
          </div>
          <div className="card flex items-center justify-between">
            <div><div className="text-xs text-text3 mb-1">VIP клиенты</div><div className="text-2xl font-black text-yellow">{stats.vip_count}</div></div>
            <Star size={22} className="text-yellow opacity-70" />
          </div>
          <div className="card flex items-center justify-between">
            <div><div className="text-xs text-text3 mb-1">Общий долг</div><div className="text-xl font-black text-red">{Math.round(stats.total_debt_rub).toLocaleString('ru-RU')} ₽</div><div className="text-[10px] text-text3">≈ ¥{Math.round(stats.total_debt_cny).toLocaleString('ru-RU')}</div></div>
            <Wallet size={22} className="text-red opacity-70" />
          </div>
          <div className="card flex items-center justify-between">
            <div><div className="text-xs text-text3 mb-1">Оборот за 30 дней</div><div className="text-xl font-black text-green">{Math.round(stats.total_turnover_30d_rub).toLocaleString('ru-RU')} ₽</div></div>
            <TrendingUp size={22} className="text-green opacity-70" />
          </div>
        </div>
      )}

      {showForm && canEdit && (
        <form onSubmit={submit} className="card mb-5 grid grid-cols-2 md:grid-cols-4 gap-3">
          <input className="inp" placeholder={t('name')} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          <input className="inp" placeholder={t('phone')} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          <input className="inp" placeholder="Telegram (@username)" value={form.telegram} onChange={e => setForm(f => ({ ...f, telegram: e.target.value }))} />
          <input className="inp" placeholder="Город" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
          <select className="inp" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
            <option value="retail">Розница</option><option value="wholesale">Опт</option><option value="vip">VIP</option>
          </select>
          <input className="inp" type="number" placeholder="Скидка %" value={form.discount_percent} onChange={e => setForm(f => ({ ...f, discount_percent: e.target.value }))} />
          <select className="inp" value={form.manager_id} onChange={e => setForm(f => ({ ...f, manager_id: e.target.value }))}>
            <option value="">— Менеджер —</option>
            {managers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
          <button className="btn btn-primary">{t('save')}</button>
        </form>
      )}

      <div className="grid lg:grid-cols-[240px_1fr] gap-4">
        <div className="card h-fit">
          <div className="flex items-center gap-2 font-bold text-sm mb-3"><Filter size={15} /> Фильтр</div>
          <div className="relative mb-3">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text3" />
            <input className="inp pl-8 text-sm" placeholder="Поиск..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="space-y-1 text-sm">
            {[['all', 'Все клиенты', clients.length], ['vip', 'VIP клиенты', clients.filter(c => c.category === 'vip').length],
              ['wholesale', 'Оптовые', wholesaleCount], ['retail', 'Розничные', retailCount],
              ['debtors', 'Должники', debtorsCount]].map(([key, label, count]) => (
              <button key={key} onClick={() => setCategoryFilter(key)}
                className={`w-full flex justify-between items-center px-2.5 py-1.5 rounded-lg ${categoryFilter === key ? 'bg-accent/15 text-accent2 font-semibold' : 'text-text2 hover:bg-bg3'}`}>
                <span>{label}</span><span className="text-xs">{count}</span>
              </button>
            ))}
          </div>
          {categoryFilter !== 'all' && (
            <button onClick={() => { setCategoryFilter('all'); setSearch(''); }} className="btn btn-secondary btn-sm w-full justify-center mt-3">↺ Сбросить фильтры</button>
          )}
        </div>

        <div>
          <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
            <div className="text-sm text-text3">Найдено: <b className="text-text">{filtered.length}</b> клиентов</div>
            <div className="flex items-center gap-2">
              <select className="inp inp-sm" value={sort} onChange={e => setSort(e.target.value)}>
                <option value="recent">Последние</option><option value="name">По имени</option>
                <option value="purchases">По покупкам</option><option value="debt">По долгу</option>
              </select>
              <button onClick={() => setView('grid')} className={`w-8 h-8 rounded-lg flex items-center justify-center ${view === 'grid' ? 'bg-accent text-white' : 'bg-bg3 text-text3'}`}><LayoutGrid size={14} /></button>
              <button onClick={() => setView('list')} className={`w-8 h-8 rounded-lg flex items-center justify-center ${view === 'list' ? 'bg-accent text-white' : 'bg-bg3 text-text3'}`}><ListIcon size={14} /></button>
            </div>
          </div>

          <div className={view === 'grid' ? 'grid sm:grid-cols-2 gap-3' : 'space-y-2'}>
            {pageItems.map(c => {
              const days = daysAgo(c.last_purchase_at);
              return (
                <Link key={c.id} to={`/clients/${c.id}`} className="card hover:border-accent/50 block">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-bg3 border border-border flex items-center justify-center overflow-hidden flex-shrink-0">
                        {c.avatar_url ? <img src={c.avatar_url} className="w-full h-full object-cover" alt="" /> : <span className="text-sm font-bold text-text3">{c.name?.[0]}</span>}
                      </div>
                      <div>
                        <div className="font-bold text-sm">{c.name}</div>
                        {c.telegram && <div className="text-xs text-accent2">✈️ {c.telegram}</div>}
                      </div>
                    </div>
                    <span className={`badge ${CATEGORY_BADGE[c.category] || 'badge-blue'}`}>{CATEGORY_LABEL[c.category] || c.category}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-y-1 text-xs">
                    <span className="text-text3">Баланс</span><span className="text-right font-mono text-green">{Math.round(c.balance_rub).toLocaleString('ru-RU')} ₽</span>
                    <span className="text-text3">Долг</span><span className={`text-right font-mono ${Number(c.open_debt_rub) > 0 ? 'text-red' : 'text-text3'}`}>{Math.round(c.open_debt_rub).toLocaleString('ru-RU')} ₽</span>
                    <span className="text-text3">Покупок</span><span className="text-right font-mono">{c.purchases_count}</span>
                    <span className="text-text3">Последняя покупка</span><span className="text-right text-text3">{days === null ? '—' : days === 0 ? 'Сегодня' : `${days} дн. назад`}</span>
                  </div>
                  {c.manager_name && <div className="text-[10px] text-text3 mt-2 pt-2 border-t border-border">Менеджер: {c.manager_name}</div>}
                </Link>
              );
            })}
            {pageItems.length === 0 && <div className="text-text3 text-sm col-span-2">Клиенты не найдены</div>}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-1 mt-5">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn btn-secondary btn-sm disabled:opacity-30">‹</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 5).map(p => (
                <button key={p} onClick={() => setPage(p)} className={`btn btn-sm ${p === page ? 'btn-primary' : 'btn-secondary'}`}>{p}</button>
              ))}
              {totalPages > 5 && <span className="text-text3 px-1">…</span>}
              <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="btn btn-secondary btn-sm disabled:opacity-30">›</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
