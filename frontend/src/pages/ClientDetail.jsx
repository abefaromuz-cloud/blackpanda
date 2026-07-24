import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Phone, Send, Wallet, ShoppingCart, Wrench, ClipboardList, History as HistoryIcon } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';
import { useTT } from '../i18n/useTT';

const CATEGORY_LABEL_RU = { retail: 'Розница', wholesale: 'Опт', vip: 'VIP' };
const CATEGORY_BADGE = { retail: 'badge-blue', wholesale: 'badge-purple', vip: 'badge-yellow' };

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [c, setC] = useState(null);
  const [rate, setRate] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [payAmounts, setPayAmounts] = useState({});
  const [editing, setEditing] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [managers, setManagers] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const { can } = useAuth();
  const { t } = useLang();
  const canEdit = can('clients', 'edit');
  const tt = useTT();

  function load() { api.get(`/clients/${id}`).then(r => setC(r.data)); }
  useEffect(() => { api.get('/settings/public-rate').then(r => setRate(r.data.rate)); }, []);
  useEffect(load, [id]);
  useEffect(() => { api.get('/clients/managers-list').then(r => setManagers(r.data)); }, []);
  useEffect(() => { api.get('/wishlist', { params: { client_id: id } }).then(r => setWishlist(r.data)); }, [id]);

  async function removeWish(wishId) {
    await api.delete(`/wishlist/${wishId}`);
    setWishlist(w => w.filter(x => x.id !== wishId));
  }
  if (!c) return <div className="text-text3">{t('loading')}</div>;

  const openDebts = c.debts.filter(d => {
    if (d.status !== 'open') return false;
    const remaining = d.amount_cny ? Number(d.amount_cny) - Number(d.amount_paid_cny) : Number(d.amount_rub) - Number(d.amount_paid_rub);
    return remaining > 0.01; // защита от уже некорректных долгов с отрицательным/нулевым остатком
  });
  const totalDebt = openDebts.reduce((s, d) => {
    if (d.amount_cny) return s + (Number(d.amount_cny) - Number(d.amount_paid_cny)) * rate;
    return s + (Number(d.amount_rub) - Number(d.amount_paid_rub));
  }, 0);
  const daysAgo = c.last_purchase_at ? Math.floor((Date.now() - new Date(c.last_purchase_at)) / 86400000) : null;

  async function adjustBalance() {
    if (!adjustAmount) return;
    await api.post(`/clients/${id}/balance`, { amount_rub: Number(adjustAmount), note: tt('Ручная корректировка') });
    setAdjustAmount(''); load();
  }

  async function resetBalance() {
    const refund = confirm(`${t('resetBalance')}?\n\nOK — ${t('refundCash')}\n${tt('Отмена — просто обнулить')}`);
    await api.post(`/clients/${id}/balance/reset`, { refund_cash: refund });
    load();
  }

  async function payOff() {
    if (!confirm(t('payOffDebt') + '?')) return;
    await api.post(`/clients/${id}/debts/payoff`);
    load();
  }

  async function payOneDebt(debt, amountInput) {
    if (debt.amount_cny) {
      const remainingCny = Number(debt.amount_cny) - Number(debt.amount_paid_cny);
      const remainingRub = Math.round(remainingCny * rate);
      const amount = amountInput ? Number(amountInput) : remainingRub;
      if (!amount || amount <= 0) return;
      await api.post(`/clients/${id}/debts/${debt.id}/pay`, { amount_rub: Math.min(amount, remainingRub) });
      setPayAmounts(a => ({ ...a, [debt.id]: '' }));
      load();
      return;
    }
    const remaining = Number(debt.amount_rub) - Number(debt.amount_paid_rub);
    const amount = amountInput ? Number(amountInput) : remaining;
    if (!amount || amount <= 0) return;
    await api.post(`/clients/${id}/debts/${debt.id}/pay`, { amount_rub: Math.min(amount, remaining) });
    setPayAmounts(a => ({ ...a, [debt.id]: '' }));
    load();
  }

  async function editDebt(debt) {
    if (debt.amount_cny) {
      const input = prompt(`${tt('Новая ОБЩАЯ сумма долга (¥). Уже оплачено')}: ¥${debt.amount_paid_cny} — ${tt('новая сумма не может быть меньше')}:`, debt.amount_cny);
      if (input === null) return;
      const amount = Number(input);
      if (!amount || amount <= 0) return;
      try {
        await api.put(`/clients/${id}/debts/${debt.id}`, { amount_cny: amount });
        load();
      } catch (e2) { alert(e2.response?.data?.error || 'Ошибка'); }
      return;
    }
    const input = prompt(`${tt('Новая ОБЩАЯ сумма долга (₽). Уже оплачено')}: ${debt.amount_paid_rub} ₽ — ${tt('новая сумма не может быть меньше')}:`, debt.amount_rub);
    if (input === null) return;
    const amount = Number(input);
    if (!amount || amount <= 0) return;
    try {
      await api.put(`/clients/${id}/debts/${debt.id}`, { amount_rub: amount });
      load();
    } catch (e2) { alert(e2.response?.data?.error || 'Ошибка'); }
  }

  async function remind(debtId) {
    const r = await api.post(`/clients/${id}/debts/remind`, { debt_id: debtId });
    alert(r.data.ok ? tt('Отправлено') + ' ✅' : tt('Ошибка') + ': ' + (r.data.error || '—'));
  }

  function startEdit() {
    setEditForm({
      name: c.name, phone: c.phone || '', telegram: c.telegram || '', city: c.city || '',
      category: c.category, discount_percent: c.discount_percent, manager_id: c.manager_id || '', avatar_url: c.avatar_url || '',
      source: c.source || '', avito_shop: c.avito_shop || '',
    });
    setEditing(true);
  }
  async function saveEdit(e) {
    e.preventDefault();
    await api.put(`/clients/${id}`, editForm);
    setEditing(false); load();
  }

  async function addNote() {
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      await api.post(`/clients/${id}/notes`, { type: 'comment', text: noteText.trim() });
      setNoteText('');
      load();
    } catch (e2) { alert(e2.response?.data?.error || 'Ошибка'); } finally { setSavingNote(false); }
  }

  function newSale() {
    sessionStorage.setItem('bp_scan_client', id);
    navigate('/scan');
  }
  function newService() {
    sessionStorage.setItem('bp_service_client', id);
    navigate('/service');
  }

  return (
    <div>
      <Link to="/clients" className="text-text3 text-sm hover:text-text2">← {t('clients')}</Link>

      <div className="card mt-2 mb-4">
        <div className="flex justify-between items-start flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-bg3 border border-border flex items-center justify-center overflow-hidden flex-shrink-0">
              {c.avatar_url ? <img src={c.avatar_url} className="w-full h-full object-cover" alt="" /> : <span className="text-xl font-bold text-text3">{c.name?.[0]}</span>}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black">{c.name}</h1>
                <span className={`badge ${CATEGORY_BADGE[c.category] || 'badge-blue'}`}>{tt(CATEGORY_LABEL_RU[c.category]) || c.category}</span>
              </div>
              <div className="text-text3 text-sm mt-1">
                {c.telegram && <span>✈️ {c.telegram} </span>}
                {c.phone && <span>· {c.phone} </span>}
                {c.city && <span>· 📍 {c.city}</span>}
                {c.source && <span>· 🔗 {tt({ avito: 'Avito', wordofmouth: 'Сарафан', telegram: 'Telegram', marketplace: 'Маркетплейс', other: 'Другое' }[c.source] || c.source)}</span>}
                {c.avito_shop && <span>· 🛍️ {c.avito_shop}</span>}
              </div>
              <div className="text-xs text-text3 mt-1">{daysAgo === null ? tt('Покупок ещё не было') : daysAgo === 0 ? tt('Последняя покупка сегодня') : `Последняя покупка ${daysAgo} дн. назад`}</div>
            </div>
          </div>
          {canEdit && <button className="btn btn-secondary btn-sm" onClick={startEdit}>✏️ {t('edit')}</button>}
        </div>

        {editing && (
          <form onSubmit={saveEdit} className="mt-4 pt-4 border-t border-border grid grid-cols-2 md:grid-cols-4 gap-3">
            <input className="inp" placeholder={t('name')} value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
            <input className="inp" placeholder={t('phone')} value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
            <input className="inp" placeholder="Telegram" value={editForm.telegram} onChange={e => setEditForm(f => ({ ...f, telegram: e.target.value }))} />
            <input className="inp" placeholder={tt("Город")} value={editForm.city} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} />
            <select className="inp" value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}>
              <option value="retail">{tt("Розница")}</option><option value="wholesale">{tt("Опт")}</option><option value="vip">VIP</option>
            </select>
            <input className="inp" type="number" placeholder={tt("Скидка %")} value={editForm.discount_percent} onChange={e => setEditForm(f => ({ ...f, discount_percent: e.target.value }))} />
            <select className="inp" value={editForm.manager_id} onChange={e => setEditForm(f => ({ ...f, manager_id: e.target.value }))}>
              <option value="">— {tt("Менеджер")} —</option>
              {managers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
            <input className="inp" placeholder={tt("Ссылка на фото (аватар)")} value={editForm.avatar_url} onChange={e => setEditForm(f => ({ ...f, avatar_url: e.target.value }))} />
            <input className="inp" placeholder={tt("Авито")} value={editForm.avito_shop} onChange={e => setEditForm(f => ({ ...f, avito_shop: e.target.value }))} />
            <select className="inp" value={editForm.source} onChange={e => setEditForm(f => ({ ...f, source: e.target.value }))}>
              <option value="">{tt("Откуда пришёл")}</option>
              <option value="avito">Avito</option><option value="wordofmouth">{tt("Сарафан")}</option>
              <option value="telegram">Telegram</option><option value="marketplace">{tt("Маркетплейс")}</option>
              <option value="other">{tt("Другое")}</option>
            </select>
            <div className="col-span-2 md:col-span-4 flex gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>{t('cancel')}</button>
              <button className="btn btn-primary">{t('save')}</button>
            </div>
          </form>
        )}
      </div>

      <div className="card mb-4">
        <div className="font-bold text-sm mb-3">📝 {tt("Заметки о клиенте")}</div>
        {canEdit && (
          <div className="flex gap-2 mb-3">
            <input
              className="inp flex-1" placeholder={tt("Например: пришёл с Авито, торговался, забирает через друга...")}
              value={noteText} onChange={e => setNoteText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addNote()}
            />
            <button className="btn btn-primary btn-sm" onClick={addNote} disabled={!noteText.trim() || savingNote}>
              {savingNote ? tt('Сохраняю...') : t('save')}
            </button>
          </div>
        )}
        {(!c.notes || c.notes.length === 0) && <div className="text-text3 text-sm">{tt("Заметок пока нет")}</div>}
        {c.notes && c.notes.map(n => (
          <div key={n.id} className="text-sm py-1.5 border-b border-border last:border-0">
            <div>{n.text}</div>
            <div className="text-[11px] text-text3 mt-0.5">{new Date(n.created_at).toLocaleString('ru-RU')}{n.created_by_name && ` · ${n.created_by_name}`}</div>
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          {c.telegram && <a href={`https://t.me/${c.telegram.replace('@', '')}`} target="_blank" rel="noreferrer" className="card flex items-center gap-2 py-2.5 justify-center hover:border-accent/50"><Send size={15} /><span className="text-xs font-bold">Telegram</span></a>}
          {c.phone && <a href={`tel:${c.phone}`} className="card flex items-center gap-2 py-2.5 justify-center hover:border-accent/50"><Phone size={15} /><span className="text-xs font-bold">{tt("Позвонить")}</span></a>}
          <button onClick={newSale} className="card flex items-center gap-2 py-2.5 justify-center hover:border-accent/50"><ShoppingCart size={15} /><span className="text-xs font-bold">{tt("Новая продажа")}</span></button>
          <button onClick={newService} className="card flex items-center gap-2 py-2.5 justify-center hover:border-accent/50"><Wrench size={15} /><span className="text-xs font-bold">{tt("Сдать в сервис")}</span></button>
          <button onClick={() => alert(tt('Генерация PDF-договора скоро будет доступна') + ' 🐼')} className="card flex items-center gap-2 py-2.5 justify-center hover:border-accent/50 opacity-70"><ClipboardList size={15} /><span className="text-xs font-bold">PDF {tt("Договор")}</span></button>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div className="card">
          <div className="flex justify-between items-center mb-2">
            <div className="font-bold text-sm">💰 {t('balance')}</div>
            <button className="text-xs text-text3 hover:text-accent2" onClick={() => setShowHistory(s => !s)}>{t('balanceHistory')}</button>
          </div>
          <div className={`text-2xl font-black font-mono ${Number(c.balance_rub) > 0 ? 'text-green' : 'text-text'}`}>
            {Math.round(c.balance_rub).toLocaleString('ru-RU')} ₽
          </div>
          {canEdit && (
            <div className="flex gap-2 mt-3">
              <input className="inp" type="number" placeholder="+/- ₽" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} />
              <button className="btn btn-secondary" onClick={adjustBalance}>{t('adjustBalance')}</button>
              {Number(c.balance_rub) !== 0 && <button className="btn btn-danger" onClick={resetBalance}>{t('resetBalance')}</button>}
            </div>
          )}
          {showHistory && (
            <div className="mt-3 max-h-48 overflow-y-auto border-t border-border pt-2">
              {c.balance_history.length === 0 && <div className="text-text3 text-xs">—</div>}
              {c.balance_history.map(h => (
                <div key={h.id} className="flex justify-between text-xs py-1">
                  <span className="text-text3">{h.note}</span>
                  <span className={Number(h.amount_rub) >= 0 ? 'text-green' : 'text-red'}>{Number(h.amount_rub) >= 0 ? '+' : ''}{Math.round(h.amount_rub).toLocaleString('ru-RU')} ₽</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="font-bold text-sm mb-2">⚠️ {t('debt')}</div>
          <div className={`text-2xl font-black font-mono ${totalDebt > 0 ? 'text-red' : 'text-text3'}`}>
            {Math.round(totalDebt).toLocaleString('ru-RU')} ₽
          </div>
          {totalDebt > 0 && canEdit && <button className="btn btn-primary mt-3" onClick={payOff}>✅ {t('payOffDebt')} ({tt('все')})</button>}
          {openDebts.length > 0 && (
            <div className="mt-3 space-y-2">
              {openDebts.map(d => {
                const remainingRub = d.amount_cny
                  ? Math.round((Number(d.amount_cny) - Number(d.amount_paid_cny)) * rate)
                  : Math.round(Number(d.amount_rub) - Number(d.amount_paid_rub));
                return (
                  <div key={d.id} className="border-t border-border pt-2">
                    <div className="flex justify-between items-center text-xs mb-1.5">
                      <span className="text-text3">{new Date(d.created_at).toLocaleDateString('ru-RU')} {d.due_date && `· ${tt("до")} ${new Date(d.due_date).toLocaleDateString('ru-RU')}`}</span>
                      <span className="flex items-center gap-2">
                        {canEdit && <button className="text-text3 hover:text-text" onClick={() => editDebt(d)}>✏️</button>}
                        {c.telegram && <button className="text-accent2 hover:underline" onClick={() => remind(d.id)}>✈️ {t('remindDebt')}</button>}
                      </span>
                    </div>
                    {d.amount_cny ? (
                      <div className="mb-1.5">
                        <span className="block text-[9px] text-text3 uppercase font-bold">🇨🇳 {tt('Долг в юанях ≈ рублей')}</span>
                        <b className="text-red">¥{(Number(d.amount_cny) - Number(d.amount_paid_cny)).toLocaleString('ru-RU')} ≈ {remainingRub.toLocaleString('ru-RU')} ₽</b>
                      </div>
                    ) : (
                      <div className="mb-1.5">
                        <span className="block text-[9px] text-text3 uppercase font-bold">🇷🇺 {tt('Долг в рублях')}</span>
                        <b className="text-red">{remainingRub.toLocaleString('ru-RU')} ₽</b>
                        <span className="text-text3 text-xs"> ≈ ¥{(remainingRub / rate).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} {tt('если платит юанями')}</span>
                      </div>
                    )}
                    {canEdit && (
                      <div className="flex gap-2">
                        <input
                          className="inp inp-sm flex-1" type="number" placeholder={`${tt('Сумма, ₽ (максимум')} ${remainingRub.toLocaleString('ru-RU')})`}
                          value={payAmounts[d.id] || ''} onChange={e => setPayAmounts(a => ({ ...a, [d.id]: e.target.value }))}
                        />
                        <button className="btn btn-secondary btn-sm" onClick={() => payOneDebt(d, payAmounts[d.id])} disabled={!payAmounts[d.id]}>
                          {tt('Внести часть')}
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={() => payOneDebt(d, null)}>
                          {tt('Погасить полностью')}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div className="card">
          <div className="font-bold text-sm mb-3 flex items-center gap-1.5"><ClipboardList size={15} /> {t('preorders')}</div>
          {c.preorders.length === 0 && <div className="text-text3 text-sm">—</div>}
          {c.preorders.map(p => (
            <Link key={p.id} to={`/preorders/${p.id}`} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0 hover:text-accent2">
              <span>No.{p.id.slice(-6)}</span>
              <span className={p.stage === 'done' ? 'text-green' : 'text-yellow'}>{p.stage === 'done' ? t('done') : t('active')}</span>
            </Link>
          ))}
        </div>
        {wishlist.length > 0 && (
          <div className="card">
            <div className="font-bold text-sm mb-3">👀 {tt("Отложенный интерес (без предоплаты)")}</div>
            {wishlist.map(w => (
              <div key={w.id} className="flex justify-between items-center text-sm py-1.5 border-b border-border last:border-0">
                <Link to={`/warehouse/${w.laptop_id}`} className="hover:text-accent2">{w.brand} {w.series}</Link>
                <span className="flex items-center gap-2">
                  {w.notified ? <span className="badge badge-green text-[10px]">{tt('Уведомлён')}</span> : Number(w.in_stock) > 0 ? <span className="badge badge-yellow text-[10px]">{tt('Уже в наличии!')}</span> : <span className="text-text3 text-xs">{tt('Ждём поступления')}</span>}
                  {canEdit && <button className="text-text3 hover:text-red text-xs" onClick={() => removeWish(w.id)}>✕</button>}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="card">
          <div className="font-bold text-sm mb-3">{t('sales')}</div>
          {c.sales.length === 0 && <div className="text-text3 text-sm">—</div>}
          {c.sales.slice(0, 5).map(s => (
            <div key={s.id} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0">
              <span className="text-text3">{new Date(s.created_at).toLocaleDateString('ru-RU')}</span>
              <span className="font-mono">{Math.round(s.total_rub).toLocaleString('ru-RU')} ₽</span>
            </div>
          ))}
        </div>
      </div>

      <Link to={`/clients/${id}/history`} className="card flex items-center justify-center gap-2 py-3 hover:border-accent/50 text-accent2 font-semibold text-sm">
        <HistoryIcon size={16} /> {tt("Смотреть всю историю")} →
      </Link>
    </div>
  );
}
