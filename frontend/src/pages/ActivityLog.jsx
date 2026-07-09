import { useEffect, useState } from 'react';
import api from '../api/client';
import { useLang } from '../i18n/LangContext';

export default function ActivityLog() {
  const [log, setLog] = useState([]);
  const { t } = useLang();

  useEffect(() => { api.get('/activity-log').then(r => setLog(r.data)); }, []);

  return (
    <div>
      <h1 className="text-2xl font-black mb-6">{t('activityLog')}</h1>
      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase text-text3 border-b border-border">
              <th className="pb-2">{t('date')}</th><th className="pb-2">{t('who')}</th><th className="pb-2">{t('action')}</th><th className="pb-2">{t('entity')}</th>
            </tr>
          </thead>
          <tbody>
            {log.map(l => (
              <tr key={l.id} className="border-b border-border last:border-0">
                <td className="py-2 text-text3">{new Date(l.created_at).toLocaleString('ru-RU')}</td>
                <td className="py-2">{l.user_name || '—'}</td>
                <td className="py-2">{l.action}</td>
                <td className="py-2 text-text3">{l.entity_label || l.entity_type}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {log.length === 0 && <div className="text-text3 text-sm">—</div>}
      </div>
    </div>
  );
}
