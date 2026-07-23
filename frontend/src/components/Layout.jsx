import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, ScanLine, Warehouse, PackagePlus, Library, Users,
  ClipboardList, ShoppingCart, Wrench, Wallet, BarChart3, FileText,
  Megaphone, ShieldCheck, Menu, X, MoreHorizontal,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';
import { roleLabels } from '../i18n/translations';
import api from '../api/client';
import Header from './Header';

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
];

// Нижняя навигация на мобильном (как в старой версии системы) — 4 самых частых раздела + "Ещё"
const BOTTOM_NAV = [
  { to: '/',          key: 'dashboard', page: 'dashboard', Icon: LayoutDashboard, end: true },
  { to: '/scan',      key: 'scan',      page: 'scan',      Icon: ScanLine },
  { to: '/warehouse', key: 'warehouse', page: 'warehouse', Icon: Warehouse },
  { to: '/clients',   key: 'clients',   page: 'clients',   Icon: Users },
];

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, can, logout } = useAuth();
  const { t, lang, setLang } = useLang();
  const [order, setOrder] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileRate, setMobileRate] = useState(null);
  useEffect(() => { api.get('/settings/public-rate').then(r => setMobileRate(r.data.rate)); }, [location.pathname]);
  const [theme, setTheme] = useState(() => localStorage.getItem('bp_theme') || 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    localStorage.setItem('bp_theme', theme);
  }, [theme]);

  useEffect(() => { api.get('/nav-order').then(r => setOrder(r.data.map(o => o.page_key))); }, []);
  // Закрываем мобильное меню при каждой смене страницы
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

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
      {/* Мобильная верхняя панель — видна только на маленьких экранах */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-bg2 border-b border-border flex items-center gap-3 px-4 py-3"
        style={{ paddingTop: 'calc(0.75rem + var(--safe-top))' }}>
        <button onClick={() => setMobileOpen(true)} className="text-text2 hover:text-text">
          <Menu size={22} />
        </button>
        <img src="/logo.png" alt="" className="h-8 w-auto object-contain" />
        <span className="font-black text-sm">BlackPanda</span>
        {mobileRate !== null && (
          <span className="ml-auto flex items-center gap-1 bg-bg3 border border-border rounded-lg px-2 py-1 text-xs font-mono font-bold flex-shrink-0">
            💱 ¥1={mobileRate}₽
          </span>
        )}
      </div>

      {/* Затемнение фона при открытом мобильном меню */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/60 z-40" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={`
        w-72 bg-bg2 border-r border-border text-text flex flex-col flex-shrink-0
        fixed lg:static inset-y-0 left-0 z-50 transition-transform duration-200
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0
      `}>
        <div className="p-4 border-b border-border flex items-center gap-2.5">
          <img src="/logo.png" alt="" className="h-14 w-auto object-contain flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black leading-none tracking-tight truncate">BlackPanda</h1>
            <p className="text-[10px] text-accent2 mt-1 font-semibold tracking-widest uppercase">CRM</p>
          </div>
          <button onClick={() => setMobileOpen(false)} className="lg:hidden text-text3 hover:text-text flex-shrink-0">
            <X size={20} />
          </button>
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

        {/* Иллюстрация — адаптивная, без фиксированной высоты, чтобы не резалась криво на разных экранах.
            На мобильном (короткие экраны) скрываем, чтобы не съедала место у самого меню. */}
        <div className="hidden sm:block relative shrink-0 border-t border-border overflow-hidden" style={{ aspectRatio: '280 / 320' }}>
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(225,29,46,0.10), transparent 70%)' }} />
          <img src="/panda-logo-full.png" alt="" className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[85%] h-auto object-contain"
            style={{ filter: 'drop-shadow(0 0 16px rgba(225,29,46,0.25))' }} />
        </div>

        <div className="p-3 border-t border-border">
          <div className="flex gap-2 mb-2">
            <button onClick={() => setLang(lang === 'ru' ? 'zh' : 'ru')}
              className="flex-1 text-xs px-3 py-1.5 rounded-xl border border-border text-text2 hover:text-text hover:border-accent transition">
              {lang === 'ru' ? '中文' : 'RU'}
            </button>
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
              className="flex-1 text-xs px-3 py-1.5 rounded-xl border border-border text-text2 hover:text-text hover:border-accent transition">
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
          <div className="rounded-xl bg-bg3 p-2.5">
            <p className="text-xs font-medium text-text truncate">{user?.full_name}</p>
            <p className="text-[10px] text-text3 mb-1.5">{roleLabels[lang]?.[user?.role] || user?.role}</p>
            <button onClick={logout} className="w-full text-xs bg-bg4 hover:bg-bg4/70 rounded-lg py-1.5 transition">
              {t('logout')}
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />
        <div className="flex-1 p-4 lg:p-6 pt-20 lg:pt-6 pb-20 lg:pb-6 overflow-y-auto">
          <Outlet />
        </div>
      </main>

      {/* Нижняя навигация — только на мобильном, как в старой версии системы */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-bg2 border-t border-border flex items-stretch"
        style={{ paddingBottom: 'var(--safe-bottom)' }}>
        {BOTTOM_NAV.filter(i => can(i.page, 'view')).map(item => (
          <NavLink key={item.to} to={item.to} end={item.end}
            className={({ isActive }) => `flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] ${isActive ? 'text-accent2' : 'text-text3'}`}>
            <item.Icon size={20} />
            <span>{t(item.key)}</span>
          </NavLink>
        ))}
        <button onClick={() => setMobileOpen(true)} className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] text-text3">
          <MoreHorizontal size={20} />
          <span>{t('more')}</span>
        </button>
      </nav>
    </div>
  );
}
