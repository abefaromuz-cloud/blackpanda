import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import { useLang } from '../i18n/LangContext';

export default function ClientDetail() {
  const { id } = useParams();
  const [c, setC] = useState(null);
  const { t } = useLang();

  useEffect(() => { api.get(`/clients/${id}`).then(r => setC(r.data)); }, [id]);
  if (!c) return <div className="text-text3">{t('loading')}</div>;

  return (
    <div>
      <Link to="/clients" className="text-text3 text-sm hover:text-text2">← {t('clients')}</Link>
      <h1 className="text-xl font-black mt-2 mb-1">{c.name}</h1>
      <div className="text-text3 text-sm mb-5">{c.phone} {c.telegram && `· ${c.telegram}`}</div>

      {Number(c.debt_rub) > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-red/10 border border-red text-red text-sm">
          {t('debt')}: {Math.round(c.debt_rub).toLocaleString('ru-RU')} ₽
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <div className="font-bold text-sm mb-3">{t('preorders')}</div>
          {c.preorders.length === 0 && <div className="text-text3 text-sm">—</div>}
          {c.preorders.map(p => (
            <Link key={p.id} to={`/preorders/${p.id}`} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0 hover:text-accent2">
              <span>No.{p.id.slice(-6)}</span>
              <span className={p.stage === 'done' ? 'text-green' : 'text-yellow'}>{p.stage === 'done' ? t('done') : t('active')}</span>
            </Link>
          ))}
        </div>
        <div className="card">
          <div className="font-bold text-sm mb-3">{t('sales')}</div>
          {c.sales.length === 0 && <div className="text-text3 text-sm">—</div>}
          {c.sales.map(s => (
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
