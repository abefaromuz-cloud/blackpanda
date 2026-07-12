import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';
import { useTT } from '../i18n/useTT';

export default function Settings() {
  const [s, setS] = useState(null);
  const [rate, setRate] = useState('');
  const [tg, setTg] = useState({ tg_token: '', tg_chat_id: '' });
  const [aiKey, setAiKey] = useState('');
  const [msg, setMsg] = useState('');
  const { can } = useAuth();
  const { t } = useLang();
  const tt = useTT();
  const canEdit = can('settings', 'edit');

  function load() { api.get('/settings').then(r => { setS(r.data); setRate(r.data.rate); setTg({ tg_token: '', tg_chat_id: r.data.tg_chat_id }); }); }
  useEffect(load, []);

  async function saveRate(e) {
    e.preventDefault();
    await api.put('/settings/rate', { rate: Number(rate) });
    setMsg(t('saved')); load();
  }

  async function saveTg(e) {
    e.preventDefault();
    await api.put('/settings/telegram', tg);
    setMsg(t('saved')); load();
  }

  async function testTg() {
    const r = await api.post('/settings/telegram/test', { chat_id: tg.tg_chat_id });
    setMsg(r.data.ok ? 'OK ✅' : 'Error: ' + (r.data.error || '—'));
  }

  async function saveAiKey(e) {
    e.preventDefault();
    if (!aiKey) return;
    await api.put('/settings/ai-key', { ai_api_key: aiKey });
    setAiKey(''); setMsg(t('saved')); load();
  }

  if (!s) return <div className="text-text3">{t('loading')}</div>;

  return (
    <div>
      <h1 className="text-2xl font-black mb-6">{t('settings')}</h1>
      {msg && <div className="mb-4 p-3 rounded-lg bg-accent/10 border border-accent text-accent2 text-sm">{msg}</div>}

      <div className="grid md:grid-cols-2 gap-4">
        <form onSubmit={saveRate} className="card">
          <div className="font-bold text-sm mb-3">{t('currencyRate')}</div>
          <div className="flex gap-2">
            <input className="inp" type="number" step="0.01" value={rate} disabled={!canEdit} onChange={e => setRate(e.target.value)} />
            {canEdit && <button className="btn btn-primary">{t('save')}</button>}
          </div>
          <div className="text-xs text-text3 mt-2">¥1 = {s.rate} ₽</div>
        </form>

        <form onSubmit={saveTg} className="card">
          <div className="font-bold text-sm mb-3">{t('telegramNotify')}</div>
          <div className="mb-2">
            <label className="block text-[11px] text-text2 font-bold uppercase mb-1">{t('botToken')}</label>
            <input className="inp" type="password" disabled={!canEdit} placeholder={s.tg_token_set ? '•••••• (' + tt('уже задан') + ')' : '123456789:ABC-DEF...'} value={tg.tg_token || ''} onChange={e => setTg(t2 => ({ ...t2, tg_token: e.target.value }))} />
          </div>
          <div className="mb-3">
            <label className="block text-[11px] text-text2 font-bold uppercase mb-1">{t('chatIdTest')}</label>
            <input className="inp" disabled={!canEdit} placeholder="123456789" value={tg.tg_chat_id || ''} onChange={e => setTg(t2 => ({ ...t2, tg_chat_id: e.target.value }))} />
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <button className="btn btn-primary">{t('save')}</button>
              <button type="button" className="btn btn-secondary" onClick={testTg}>{t('test')}</button>
            </div>
          )}
          <div className="text-xs text-text3 mt-2">{t('tokenNote')}</div>
        </form>

        <form onSubmit={saveAiKey} className="card">
          <div className="font-bold text-sm mb-3">🤖 {tt('ИИ-функции (Anthropic API)')}</div>
          <div className="mb-3">
            <label className="block text-[11px] text-text2 font-bold uppercase mb-1">{tt('Ключ API')}</label>
            <input className="inp" type="password" disabled={!canEdit} placeholder={s.ai_key_set ? '•••••• (' + tt('уже задан') + ')' : 'sk-ant-...'} value={aiKey} onChange={e => setAiKey(e.target.value)} />
          </div>
          {canEdit && <button className="btn btn-primary">{t('save')}</button>}
          <div className="text-xs text-text3 mt-2">{tt('Нужен для: распознавания фото товара, приоритизации клиентов, персонализированных рассылок')}</div>
        </form>
      </div>
    </div>
  );
}
