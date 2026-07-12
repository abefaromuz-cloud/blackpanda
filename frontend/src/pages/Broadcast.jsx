import { useEffect, useState } from 'react';
import api from '../api/client';
import { useLang } from '../i18n/LangContext';
import { useTT } from '../i18n/useTT';

export default function Broadcast() {
  const { t } = useLang();
  const tt = useTT();
  const [clients, setClients] = useState([]);
  const [selected, setSelected] = useState([]);
  const [message, setMessage] = useState('');
  const [templates, setTemplates] = useState([]);
  const [result, setResult] = useState(null);
  const [drafts, setDrafts] = useState(null);
  const [campaignGoal, setCampaignGoal] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  function load() {
    api.get('/clients').then(r => setClients(r.data.filter(c => c.telegram)));
    api.get('/msg-templates').then(r => setTemplates(r.data));
  }
  useEffect(load, []);

  function toggle(id) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  }

  async function fillStock() {
    const { data } = await api.get('/broadcast/stock-message');
    setMessage(data.message);
  }

  async function send() {
    if (!message.trim() || !selected.length) return;
    const { data } = await api.post('/broadcast/send', { client_ids: selected, message });
    setResult(data);
  }

  async function saveTemplate() {
    const name = prompt(tt('Название шаблона:'));
    if (!name || !message.trim()) return;
    await api.post('/msg-templates', { name, text: message });
    load();
  }

  async function generateAiDrafts() {
    if (!selected.length) return;
    setAiLoading(true); setAiError(''); setDrafts(null);
    try {
      const { data } = await api.post('/ai/broadcast-drafts', { client_ids: selected, campaign_goal: campaignGoal });
      setDrafts(data.drafts);
    } catch (e) {
      setAiError(e.response?.data?.error || 'Ошибка ИИ');
    } finally { setAiLoading(false); }
  }

  function updateDraft(id, text) {
    setDrafts(ds => ds.map(d => d.id === id ? { ...d, message_text: text } : d));
  }

  async function saveDraftEdit(d) {
    await api.put(`/ai/broadcast-drafts/${d.id}`, { message_text: d.message_text });
  }

  function removeDraft(id) {
    api.delete(`/ai/broadcast-drafts/${id}`);
    setDrafts(ds => ds.filter(d => d.id !== id));
  }

  async function sendApprovedDrafts() {
    if (!drafts?.length) return;
    await Promise.all(drafts.map(d => saveDraftEdit(d))); // сохраняем последние правки перед отправкой
    const { data } = await api.post('/ai/broadcast-drafts/send', { draft_ids: drafts.map(d => d.id) });
    setResult(data); setDrafts(null);
  }

  return (
    <div>
      <h1 className="text-2xl font-black mb-6">{t('broadcast')}</h1>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <div className="font-bold text-sm mb-2">{t('recipients')} ({clients.length})</div>
          <div className="flex gap-2 mb-3">
            <button className="btn btn-secondary btn-sm" onClick={() => setSelected(clients.map(c => c.id))}>{t('selectAll')}</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelected([])}>{t('deselectAll')}</button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {clients.map(c => (
              <label key={c.id} className="flex items-center gap-2 text-sm py-1.5 border-b border-border last:border-0">
                <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} />
                <span>{c.name}</span><span className="text-text3 text-xs">{c.telegram}</span>
              </label>
            ))}
            {!clients.length && <div className="text-text3 text-sm">{tt("Нет клиентов с Telegram")}</div>}
          </div>
          <div className="text-xs text-text3 mt-2">{t('selected')}: <b>{selected.length}</b></div>
        </div>

        <div className="card">
          <div className="font-bold text-sm mb-2">{t('messageText')}</div>
          <div className="flex gap-2 flex-wrap mb-2">
            <button className="btn btn-secondary btn-xs" onClick={fillStock}>{t('stockListTemplate')}</button>
            {templates.map(tpl => (
              <button key={tpl.id} className="btn btn-secondary btn-xs" onClick={() => setMessage(tpl.text)}>{tpl.name}</button>
            ))}
          </div>
          <textarea className="inp mb-2" rows={10} style={{ fontFamily: 'monospace', fontSize: 12 }} value={message} onChange={e => setMessage(e.target.value)} placeholder={tt("Текст рассылки... {name} и {phone} подставятся автоматически")} />
          <div className="flex gap-2 mb-3">
            <button className="btn btn-secondary btn-sm" onClick={saveTemplate}>💾 {t('addTemplate')}</button>
          </div>
          <button className="btn btn-primary w-full justify-center" onClick={send}>📢 {t('sendBroadcast')} ({selected.length})</button>
          {result && <div className="mt-3 text-sm">✅ {result.sent} · ❌ {result.failed}</div>}

          <div className="mt-4 pt-4 border-t border-border">
            <div className="font-bold text-sm mb-2">✨ {tt('Персонализировать с ИИ')}</div>
            <input className="inp mb-2" placeholder={tt('Цель сообщения (например: рассказать о новых поступлениях)')} value={campaignGoal} onChange={e => setCampaignGoal(e.target.value)} />
            <button className="btn btn-secondary w-full justify-center" onClick={generateAiDrafts} disabled={!selected.length || aiLoading}>
              {aiLoading ? tt('Генерирую...') : `✨ ${tt('Сгенерировать черновики')} (${selected.length})`}
            </button>
            {aiError && <div className="text-red text-xs mt-2">{aiError}</div>}
            <div className="text-[10px] text-text3 mt-2">{tt('Черновики нужно проверить и одобрить — автоматически ничего не отправляется')}</div>
          </div>
        </div>
      </div>

      {drafts && drafts.length > 0 && (
        <div className="card mt-4">
          <div className="flex justify-between items-center mb-3">
            <div className="font-bold text-sm">📝 {tt('Черновики на одобрение')} ({drafts.length})</div>
            <button className="btn btn-primary btn-sm" onClick={sendApprovedDrafts}>✅ {tt('Отправить все')}</button>
          </div>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {drafts.map(d => (
              <div key={d.id} className="bg-bg3 rounded-xl p-3">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-sm font-bold">{d.client_name} <span className="text-text3 font-normal text-xs">{d.telegram}</span></span>
                  <button className="text-red text-xs hover:underline" onClick={() => removeDraft(d.id)}>✕ {tt('Убрать')}</button>
                </div>
                <textarea className="inp text-sm" rows={3} value={d.message_text} onChange={e => updateDraft(d.id, e.target.value)} onBlur={() => saveDraftEdit(d)} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
