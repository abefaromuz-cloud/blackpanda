import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useLang } from '../i18n/LangContext';
import { useTT } from '../i18n/useTT';

// Эта страница специально не выведена в левое меню — открывается по кнопке
// «Показать всю историю операций» со страницы Финансы.
export default function Cash() {
  const [data, setData] = useState(null);
  const [banks, setBanks] = useState([]);
  const { t } = useLang();
  const tt = useTT();

  function load() {
    api.get('/cash').then(r => setData(r.data));
    api.get('/bank-accounts').then(r => setBanks(r.data));
  }
  useEffect(load, []);

  if (!data) return <div className="text-text3">{t('loading')}</div>;

  return (
    <div>
      <Link to="/finance" className="text-text3 text-sm hover:text-text2">← {t('finance')}</Link>
      <div className="flex justify-between items-center mt-2 mb-5">
        <h1 className="text-2xl font-black">{tt("История операций")}</h1>
        <div className="text-2xl font-black font-mono text-green">{Math.round(data.balance_rub).toLocaleString('ru-RU')} ₽</div>
      </div>

      <div className="card mb-5">
        <div className="font-bold text-sm mb-3">🏦 {t('bankAccounts')}</div>
        <div className="grid grid-cols-3 gap-3">
          {banks.map(b => (
            <div key={b.key} className="bg-bg3 rounded-xl p-3">
              <div className="text-xs text-text3">{b.name}</div>
              <div className="font-mono font-bold text-lg">{Math.round(b.balance_rub).toLocaleString('ru-RU')} ₽</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="overflow-x-auto"><table className="w-full text-sm">
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
                  {l.category === 'exchanger' && <span className="badge badge-purple ml-1">{tt("обменник")}</span>}
                </td>
                <td className={`py-2 font-mono ${l.type === 'in' ? 'text-green' : 'text-red'}`}>
                  {l.type === 'in' ? '+' : '-'}{Math.round(l.amount_rub).toLocaleString('ru-RU')} ₽
                </td>
                <td className="py-2 text-text3">{l.note} {l.recipient && `· ${l.recipient}`} {l.client_name && `· ${l.client_name}`}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
