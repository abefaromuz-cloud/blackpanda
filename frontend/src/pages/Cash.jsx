import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';

export default function Cash() {
  const [data, setData] = useState(null);
  const [banks, setBanks] = useState([]);
  const [form, setForm] = useState({ type: 'out', amount_rub: '', note: '', category: 'other' });
  const { can } = useAuth();
  const { t } = useLang();
  const canEdit = can('cash', 'edit');

  function load() {
    api.get('/cash').then(r => setData(r.data));
    api.get('/bank-accounts').then(r => setBanks(r.data));
  }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    await api.post('/cash', form);
    setForm({ type: 'out', amount_rub: '', note: '', category: 'other' }); load();
  }

  async function adjustBank(bank) {
    const v = prompt(`${t('adjustBankBalance')} — ${bank.name}`, bank.balance_rub);
    if (v === null) return;
    await api.put(`/bank-accounts/${bank.key}`, { new_balance_rub: Number(v) });
    load();
  }

  if (!data) return <div className="text-text3">{t('loading')}</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-2xl font-black">{t('cash')}</h1>
        <div className="text-2xl font-black font-mono text-green">{Math.round(data.balance_rub).toLocaleString('ru-RU')} ₽</div>
      </div>

      <div className="card mb-5">
        <div className="font-bold text-sm mb-3">🏦 {t('bankAccounts')}</div>
        <div className="grid grid-cols-3 gap-3">
          {banks.map(b => (
            <div key={b.key} className="bg-bg3 rounded-xl p-3 cursor-pointer hover:border-accent border border-transparent" onClick={() => canEdit && adjustBank(b)}>
              <div className="text-xs text-text3">{b.name}</div>
              <div className="font-mono font-bold text-lg">{Math.round(b.balance_rub).toLocaleString('ru-RU')} ₽</div>
            </div>
          ))}
        </div>
      </div>

      {canEdit && (
        <form onSubmit={submit} className="card mb-5 flex gap-2 flex-wrap items-end">
          <select className="inp w-32" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
            <option value="in">{t('income')}</option>
            <option value="out">{t('expense')}</option>
          </select>
          <input className="inp w-40" type="number" placeholder={t('amount') + ' ₽'} value={form.amount_rub} onChange={e => setForm(f => ({ ...f, amount_rub: e.target.value }))} required />
          <select className="inp w-36" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
            <option value="other">{t('other')}</option>
            <option value="purchase">{t('purchase')}</option>
            <option value="rent">{t('rent')}</option>
            <option value="salary">{t('salaryExp')}</option>
            <option value="logistics">{t('logistics')}</option>
            <option value="marketing">{t('marketing')}</option>
          </select>
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
                  {l.bank_key && <span className="badge badge-blue ml-1">{l.bank_key}</span>}
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
