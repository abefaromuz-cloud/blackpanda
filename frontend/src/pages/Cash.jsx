import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';

export default function Cash() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ type: 'out', amount_rub: '', note: '' });
  const { can } = useAuth();
  const { t } = useLang();
  const canEdit = can('cash', 'edit');

  function load() { api.get('/cash').then(r => setData(r.data)); }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    await api.post('/cash', form);
    setForm({ type: 'out', amount_rub: '', note: '' }); load();
  }

  if (!data) return <div className="text-text3">{t('loading')}</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-xl font-black">{t('cash')}</h1>
        <div className="text-2xl font-black font-mono text-green">{Math.round(data.balance_rub).toLocaleString('ru-RU')} ₽</div>
      </div>

      {canEdit && (
        <form onSubmit={submit} className="card mb-5 flex gap-2 flex-wrap items-end">
          <select className="inp w-32" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
            <option value="in">{t('income')}</option>
            <option value="out">{t('expense')}</option>
          </select>
          <input className="inp w-40" type="number" placeholder={t('amount') + ' ₽'} value={form.amount_rub} onChange={e => setForm(f => ({ ...f, amount_rub: e.target.value }))} required />
          <input className="inp flex-1" placeholder={t('comment')} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
          <button className="btn btn-primary">{t('add')}</button>
        </form>
      )}

      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase text-text3 border-b border-border">
              <th className="pb-2">{t('date')}</th><th className="pb-2">{t('type')}</th><th className="pb-2">{t('amount')}</th><th className="pb-2">{t('comment')}</th>
            </tr>
          </thead>
          <tbody>
            {data.log.map(l => (
              <tr key={l.id} className="border-b border-border last:border-0">
                <td className="py-2 text-text3">{new Date(l.created_at).toLocaleString('ru-RU')}</td>
                <td className="py-2">
                  <span className={`badge ${l.type === 'in' ? 'badge-green' : 'badge-red'}`}>{l.type === 'in' ? t('income') : t('expense')}</span>
                </td>
                <td className={`py-2 font-mono ${l.type === 'in' ? 'text-green' : 'text-red'}`}>
                  {l.type === 'in' ? '+' : '-'}{Math.round(l.amount_rub).toLocaleString('ru-RU')} ₽
                </td>
                <td className="py-2 text-text3">{l.note} {l.client_name && `· ${l.client_name}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
