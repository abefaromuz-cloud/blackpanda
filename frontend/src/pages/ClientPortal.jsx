import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';

export default function ClientPortal() {
  const [data, setData] = useState(null);
  const { logout } = useAuth();
  const { t, lang, setLang } = useLang();

  useEffect(() => { api.get('/client-portal').then(r => setData(r.data)); }, []);

  if (!data) return <div className="min-h-screen bg-bg flex items-center justify-center text-text3">{t('loading')}</div>;

  return (
    <div className="min-h-screen bg-bg p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="" className="w-8 h-8 object-contain" />
            <div className="text-lg font-black">BlackPanda</div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setLang(lang === 'ru' ? 'zh' : 'ru')} className="btn btn-secondary">{lang === 'ru' ? '中文' : 'RU'}</button>
            <button onClick={logout} className="btn btn-secondary">{t('logout')}</button>
          </div>
        </div>

        <h1 className="text-xl font-black mb-1">{data.name}</h1>
        {Number(data.debt_rub) > 0 && (
          <div className="mb-4 p-3 rounded-lg bg-red/10 border border-red text-red text-sm">
            {t('myDebt')}: {Math.round(data.debt_rub).toLocaleString('ru-RU')} ₽
          </div>
        )}

        <div className="card mb-4">
          <div className="font-bold text-sm mb-3">{t('myOrders')}</div>
          {data.preorders.length === 0 && <div className="text-text3 text-sm">—</div>}
          {data.preorders.map(p => (
            <div key={p.id} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0">
              <span>No.{p.id.slice(-6)}</span>
              <span className={p.stage === 'done' ? 'text-green' : 'text-yellow'}>{p.stage === 'done' ? t('done') : t('active')}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="font-bold text-sm mb-3">{t('myPurchases')}</div>
          {data.sales.length === 0 && <div className="text-text3 text-sm">—</div>}
          {data.sales.map(s => (
            <div key={s.id} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0">
              <span className="text-text3">{new Date(s.created_at).toLocaleDateString('ru-RU')}</span>
              <span className="font-mono">{Math.round(s.total_rub).toLocaleString('ru-RU')} ₽</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
