import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, DollarSign } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';
import { roleLabels } from '../i18n/translations';
import { useTT } from '../i18n/useTT';

export default function Header() {
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const { lang } = useLang();
  const tt = useTT();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [rate, setRate] = useState(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifData, setNotifData] = useState({ lowStock: [], debts: [] });
  const [dismissed, setDismissed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bp_dismissed_notifs') || '[]'); } catch { return []; }
  });
  const boxRef = useRef(null);

  useEffect(() => { api.get('/settings/public-rate').then(r => setRate(r.data.rate)); }, []);

  useEffect(() => {
    if (!can('dashboard', 'view')) return;
    api.get('/dashboard').then(r => setNotifData({ lowStock: r.data.low_stock || [], debts: r.data.debts || [] })).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults(null); return; }
    const timer = setTimeout(() => {
      api.get('/search', { params: { q } }).then(r => { setResults(r.data); setShowResults(true); });
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onClickOutside(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setShowResults(false); }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function goTo(path) {
    setShowResults(false); setQuery(''); navigate(path);
  }

  const hasResults = results && (results.serials.length || results.laptops.length || results.clients.length);

  // Сигнатура = "что именно" + "какое сейчас значение". Если товара стало ещё меньше или долг
  // вырос — сигнатура изменится, и уведомление снова покажется как новое, даже если старое
  // уже было очищено.
  function lowStockSig(l) { return `stock:${l.id}:${l.in_stock}`; }
  function debtSig(c) { return `debt:${c.id}:${Math.round(c.debt_rub)}:${Math.round(c.debt_cny || 0)}`; }
  const visibleLowStock = notifData.lowStock.filter(l => !dismissed.includes(lowStockSig(l)));
  const visibleDebts = notifData.debts.filter(c => !dismissed.includes(debtSig(c)));
  const visibleCount = visibleLowStock.length + visibleDebts.length;

  function clearAllNotifs() {
    const allSigs = [...notifData.lowStock.map(lowStockSig), ...notifData.debts.map(debtSig)];
    const next = [...new Set([...dismissed, ...allSigs])];
    setDismissed(next);
    localStorage.setItem('bp_dismissed_notifs', JSON.stringify(next));
  }

  return (
    <div className="hidden lg:flex items-center gap-3 px-6 py-3 border-b border-border bg-bg2">
      <div className="relative flex-1 max-w-md" ref={boxRef}>
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text3" />
        <input
          className="inp pl-9"
          placeholder={tt("Поиск по серийному номеру, модели, клиенту...")}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => query.length >= 2 && setShowResults(true)}
        />
        {showResults && results && (
          <div className="absolute top-full left-0 right-0 mt-1 card p-2 z-50 max-h-80 overflow-y-auto">
            {!hasResults && <div className="text-text3 text-xs p-2">{tt("Ничего не найдено")}</div>}
            {results.serials.length > 0 && (
              <div className="mb-2">
                <div className="text-[10px] text-text3 uppercase font-bold px-2 mb-1">{tt("Серийники")}</div>
                {results.serials.map(s => (
                  <button key={s.id} onClick={() => goTo(`/serials/${s.id}`)} className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-bg3 text-sm flex justify-between">
                    <span className="font-mono">{s.serial}</span><span className="text-text3">{s.brand} {s.series}</span>
                  </button>
                ))}
              </div>
            )}
            {results.laptops.length > 0 && (
              <div className="mb-2">
                <div className="text-[10px] text-text3 uppercase font-bold px-2 mb-1">{tt("Модели")}</div>
                {results.laptops.map(l => (
                  <button key={l.id} onClick={() => goTo(`/warehouse/${l.id}`)} className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-bg3 text-sm">
                    {l.brand} {l.series}
                  </button>
                ))}
              </div>
            )}
            {results.clients.length > 0 && (
              <div>
                <div className="text-[10px] text-text3 uppercase font-bold px-2 mb-1">{tt("Клиенты")}</div>
                {results.clients.map(c => (
                  <button key={c.id} onClick={() => goTo(`/clients/${c.id}`)} className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-bg3 text-sm flex justify-between">
                    <span>{c.name}</span><span className="text-text3">{c.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1" />

      {rate !== null && (
        <div className="hidden lg:flex items-center gap-1.5 bg-bg3 border border-border rounded-xl px-3 py-1.5 text-sm">
          <DollarSign size={14} className="text-accent2" />
          <span className="font-mono font-bold">¥1 = {rate} ₽</span>
        </div>
      )}

      {can('dashboard', 'view') && (
        <div className="relative">
          <button onClick={() => setNotifOpen(o => !o)} className="relative w-9 h-9 rounded-xl bg-bg3 border border-border flex items-center justify-center text-text2 hover:text-text">
            <Bell size={16} />
            {visibleCount > 0 && <span className="absolute -top-1.5 -right-1.5 bg-accent text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">{visibleCount}</span>}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 card p-3 z-50 max-h-80 overflow-y-auto">
              {visibleCount === 0 && <div className="text-text3 text-xs">{tt("Нет уведомлений")}</div>}
              {visibleCount > 0 && (
                <button onClick={clearAllNotifs} className="w-full text-center text-[10px] text-text3 hover:text-text border border-border rounded-lg py-1 mb-2">
                  ✕ {tt("Очистить всё")}
                </button>
              )}
              {visibleLowStock.length > 0 && (
                <div className="mb-2">
                  <div className="text-[10px] text-yellow uppercase font-bold mb-1">⚠️ {tt("Заканчивается на складе")}</div>
                  {visibleLowStock.map(l => (
                    <button key={l.id} onClick={() => { setNotifOpen(false); navigate(`/warehouse/${l.id}`); }} className="w-full text-left text-xs py-1 hover:text-accent2">
                      {l.brand} {l.series} — {l.in_stock} {tt("шт.")}
                    </button>
                  ))}
                </div>
              )}
              {visibleDebts.length > 0 && (
                <div>
                  <div className="text-[10px] text-red uppercase font-bold mb-1">💰 {tt("Должники")}</div>
                  {visibleDebts.map(c => (
                    <button key={c.id} onClick={() => { setNotifOpen(false); navigate(`/clients/${c.id}`); }} className="w-full text-left text-xs py-1 hover:text-accent2 flex justify-between">
                      <span>{c.name}</span>
                      <span className="flex items-center gap-1.5">
                        {Number(c.debt_rub) > 0 && <span className="font-mono text-red">🇷🇺{Math.round(c.debt_rub).toLocaleString('ru-RU')}₽</span>}
                        {Number(c.debt_cny) > 0 && <span className="font-mono text-red">🇨🇳¥{Number(c.debt_cny).toLocaleString('ru-RU')}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 pl-2">
        <div className="w-9 h-9 rounded-xl bg-bg3 border border-border flex items-center justify-center overflow-hidden">
          <img src="/panda-logo-icon.png" alt="" className="w-full h-full object-cover" />
        </div>
        <div className="hidden lg:block">
          <div className="text-xs font-semibold leading-none">{user?.full_name}</div>
          <div className="text-[10px] text-text3 mt-0.5">{roleLabels[lang]?.[user?.role] || user?.role}</div>
        </div>
      </div>
    </div>
  );
}
