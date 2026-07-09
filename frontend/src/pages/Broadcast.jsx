import { useEffect, useState } from 'react';
import api from '../api/client';
import { useLang } from '../i18n/LangContext';

export default function Broadcast() {
  const { t } = useLang();
  const [clients, setClients] = useState([]);
  const [selected, setSelected] = useState([]);
  const [message, setMessage] = useState('');
  const [templates, setTemplates] = useState([]);
  const [result, setResult] = useState(null);

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
    const name = prompt('Название шаблона:');
    if (!name || !message.trim()) return;
    await api.post('/msg-templates', { name, text: message });
    load();
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
            {!clients.length && <div className="text-text3 text-sm">Нет клиентов с Telegram</div>}
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
          <textarea className="inp mb-2" rows={10} style={{ fontFamily: 'monospace', fontSize: 12 }} value={message} onChange={e => setMessage(e.target.value)} placeholder="Текст рассылки... {name} и {phone} подставятся автоматически" />
          <div className="flex gap-2 mb-3">
            <button className="btn btn-secondary btn-sm" onClick={saveTemplate}>💾 {t('addTemplate')}</button>
          </div>
          <button className="btn btn-primary w-full justify-center" onClick={send}>📢 {t('sendBroadcast')} ({selected.length})</button>
          {result && <div className="mt-3 text-sm">✅ {result.sent} · ❌ {result.failed}</div>}
        </div>
      </div>
    </div>
  );
}
