import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, ScanLine, Warehouse, PackagePlus, Library, Users,
  ClipboardList, ShoppingCart, Wrench, Wallet, BarChart3, FileText,
  Megaphone, Upload, UserCog, History, Settings, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';
import { roleLabels } from '../i18n/translations';
import api from '../api/client';

const navItems = [
  { to: '/',          key: 'dashboard', page: 'dashboard', Icon: LayoutDashboard, end: true },
  { to: '/scan',      key: 'scan',      page: 'scan',      Icon: ScanLine },
  { to: '/warehouse', key: 'warehouse', page: 'warehouse', Icon: Warehouse },
  { to: '/arrivals',  key: 'arrivals',  page: 'arrivals',  Icon: PackagePlus },
  { to: '/library',   key: 'library',   page: 'library',   Icon: Library },
  { to: '/clients',   key: 'clients',   page: 'clients',   Icon: Users },
  { to: '/preorders', key: 'preorders', page: 'preorders', Icon: ClipboardList },
  { to: '/sales',     key: 'sales',     page: 'sales',     Icon: ShoppingCart },
  { to: '/service',   key: 'service',   page: 'service',   Icon: Wrench },
  { to: '/finance',   key: 'finance',   page: 'finance',   Icon: Wallet },
  { to: '/analytics', key: 'analytics', page: 'analytics', Icon: BarChart3 },
  { to: '/reports',   key: 'reports',   page: 'reports',   Icon: FileText },
  { to: '/broadcast', key: 'broadcast', page: 'broadcast', Icon: Megaphone },
  { to: '/import',    key: 'importPage',page: 'import',    Icon: Upload },
  { to: '/employees', key: 'employees', page: 'employees', Icon: UserCog },
  { to: '/activity-log', key: 'activityLog', page: 'activity_log', Icon: History },
  { to: '/settings',  key: 'settings',  page: 'settings',  Icon: Settings },
];

export default function Layout() {
  const navigate = useNavigate();
  const { user, can, logout } = useAuth();
  const { t, lang, setLang } = useLang();
  const [order, setOrder] = useState(null);

  useEffect(() => { api.get('/nav-order').then(r => setOrder(r.data.map(o => o.page_key))); }, []);

  const orderedItems = order
    ? [...navItems].sort((a, b) => {
        const ia = order.indexOf(a.page), ib = order.indexOf(b.page);
        if (ia === -1 && ib === -1) return 0;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      })
    : navItems;

  const visibleItems = orderedItems.filter(i => can(i.page, 'view'));

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="w-72 bg-bg2 border-r border-border text-text flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-border flex items-center gap-2.5">
          <img src="/logo.png" alt="" className="h-14 w-auto object-contain flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xl font-black leading-none tracking-tight truncate">BlackPanda</h1>
            <p className="text-[10px] text-accent2 mt-1 font-semibold tracking-widest uppercase">CRM</p>
          </div>
        </div>
        <nav className="flex-1 p-2.5 space-y-0.5 overflow-y-auto min-h-0">
          {visibleItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition ${
                  isActive ? 'bg-accent text-white font-semibold shadow-lg shadow-accent/20' : 'text-text2 hover:bg-bg3 hover:text-text'
                }`
              }
            >
              <item.Icon size={17} className="flex-shrink-0 opacity-90" />
              <span>{t(item.key)}</span>
            </NavLink>
          ))}
          {user?.role === 'admin' && (
            <NavLink to="/admin" className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition mt-1.5 border-t border-border pt-3 ${
                isActive ? 'text-accent2 font-semibold' : 'text-purple hover:text-purple'
              }`}>
              <ShieldCheck size={17} className="flex-shrink-0 opacity-90" />
              <span>{t('admin')}</span>
            </NavLink>
          )}
        </nav>

        {/* Иллюстрация — адаптивная, без фиксированной высоты, чтобы не резалась криво на разных экранах */}
        <div className="relative shrink-0 border-t border-border overflow-hidden" style={{ aspectRatio: '280 / 320' }}>
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(225,29,46,0.10), transparent 70%)' }} />
          <img src="/panda-logo-full.png" alt="" className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[85%] h-auto object-contain"
            style={{ filter: 'drop-shadow(0 0 16px rgba(225,29,46,0.25))' }} />
        </div>

        <div className="p-3 border-t border-border">
          <button onClick={() => setLang(lang === 'ru' ? 'zh' : 'ru')}
            className="w-full mb-2 text-xs px-3 py-1.5 rounded-xl border border-border text-text2 hover:text-text hover:border-accent transition">
            {lang === 'ru' ? '中文' : 'RU'}
          </button>
          <div className="rounded-xl bg-bg3 p-2.5">
            <p className="text-xs font-medium text-text truncate">{user?.full_name}</p>
            <p className="text-[10px] text-text3 mb-1.5">{roleLabels[lang]?.[user?.role] || user?.role}</p>
            <button onClick={logout} className="w-full text-xs bg-bg4 hover:bg-bg4/70 rounded-lg py-1.5 transition">
              {t('logout')}
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-y-auto min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
