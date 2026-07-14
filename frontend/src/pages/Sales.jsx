import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';
import { useTT } from '../i18n/useTT';
import { printReceipt } from '../utils/print';
import { exportToExcel, exportToPdf } from '../utils/export';
import { zhDict } from '../i18n/zhDict';

const PAYMENT_LABEL = {
  full: 'Полностью', partial: 'Частично (в долг)', split: 'Наличные + перевод', balance: 'С баланса клиента',
};

export default function Sales() {
  const [sales, setSales] = useState([]);
  const [clients, setClients] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [expanded, setExpanded] = useState({});
  const { t } = useLang();
  const tt = useTT();
  const { can } = useAuth();
  const canEdit = can('sales', 'edit');

  function load() {
    api.get('/sales').then(r => setSales(r.data));
    api.get('/clients').then(r => setClients(r.data));
  }
  useEffect(load, []);

  const filtered = useMemo(() => {
    return sales.filter(s => {
      if (dateFrom && new Date(s.created_at) < new Date(dateFrom)) return false;
      if (dateTo && new Date(s.created_at) > new Date(dateTo + 'T23:59:59')) return false;
      if (clientFilter && s.client_id !== clientFilter) return false;
      return true;
    });
  }, [sales, dateFrom, dateTo, clientFilter]);

  function toggle(id) { setExpanded(e => ({ ...e, [id]: !e[id] })); }

  function saleStatus(s) {
    // Статус оплаты определяем по способу: partial без указания — считаем оплаченным, т.к. долг
    // отражается отдельно в разделе Клиенты/Финансы; здесь просто показываем способ оплаты как есть
    return s.payment_mode === 'partial' ? { label: tt('Частично / долг'), cls: 'badge-yellow' } : { label: tt('Оплачено'), cls: 'badge-green' };
  }

  function doPrint(s) {
    printReceipt({
      saleId: s.id, clientName: s.client_name, note: s.note, discountRub: 0, totalRub: s.total_rub, totalCny: s.total_cny,
      items: s.items.map(it => ({ brand: it.brand, series: it.series, serials: it.serials || [], qty: it.qty, totalCny: Number(it.total_cny).toFixed(0) })),
    });
  }

  async function removeSerialFromSale(saleId, serial) {
    if (!confirm(`${tt('Убрать серийник')} ${serial} ${tt('из этой продажи и вернуть его на склад?')}`)) return;
    await api.delete(`/sales/${saleId}/serials/${serial}`);
    load();
  }

  async function addSerialToSale(saleId) {
    const serial = prompt(tt('Серийник товара со склада, который добавить в эту продажу:'));
    if (!serial) return;
    try {
      await api.post(`/sales/${saleId}/serials`, { serial: serial.trim() });
      load();
    } catch (e) { alert(e.response?.data?.error || 'Ошибка'); }
  }

  async function removeSale(saleId) {
    if (!confirm(tt('Удалить всю продажу целиком? Все серийники вернутся на склад, долг (если есть) будет снят.'))) return;
    await api.delete(`/sales/${saleId}`);
    load();
  }

  async function saveWarrantyNote(saleId, note) {
    await api.put(`/sales/${saleId}/warranty-note`, { note });
    load();
  }

  // Разворачиваем продажи в построчный вид для экспорта (одна строка = одна позиция/серийник)
  function buildRows() {
    const rows = [];
    filtered.forEach(s => {
      (s.items || []).forEach(it => {
        const serials = it.serials && it.serials.length ? it.serials : [null];
        serials.forEach(sn => {
          rows.push({
            date: new Date(s.created_at).toLocaleDateString('ru-RU'),
            client: s.client_name || tt('Без клиента'),
            brand: it.brand || '', series: it.series || '', cpu: it.cpu || '', gpu: it.gpu || '',
            ram: it.ram || '', storage: it.storage || '', color: it.color || '', screen: it.screen || '',
            serial: sn || '—', qty: serials.length > 1 ? 1 : it.qty,
            price_cny: Number(it.price_sell_cny || 0), rate: Number(s.rate),
            price_rub: Math.round(Number(it.price_sell_rub || it.price_sell_cny * s.rate || 0)),
            margin_cny: (Number(it.price_sell_cny || 0) - Number(it.price_cost_cny || 0)),
            total_rub: Math.round(Number(s.total_rub)),
            payment_mode: s.payment_mode || '', note: s.note || '',
          });
        });
      });
    });
    return rows;
  }

  const COLUMNS = [
    { key: 'date', label: 'Дата', labelZh: '日期' },
    { key: 'client', label: 'Клиент', labelZh: '客户' },
    { key: 'brand', label: 'Бренд', labelZh: zhDict['Бренд'] },
    { key: 'series', label: 'Серия', labelZh: zhDict['Серия'] },
    { key: 'cpu', label: 'CPU', labelZh: '处理器' },
    { key: 'gpu', label: 'GPU', labelZh: '显卡' },
    { key: 'ram', label: 'RAM', labelZh: '内存' },
    { key: 'storage', label: 'Накопитель', labelZh: zhDict['Накопитель'] },
    { key: 'color', label: 'Цвет', labelZh: zhDict['Цвет'] },
    { key: 'screen', label: 'Экран', labelZh: zhDict['Экран'] },
    { key: 'serial', label: 'Серийник', labelZh: zhDict['Серийник'] },
    { key: 'qty', label: 'Кол-во', labelZh: '数量', numeric: true },
    { key: 'price_cny', label: 'Цена ¥', labelZh: '价格 ¥', numeric: true },
    { key: 'rate', label: 'Курс', labelZh: '汇率', numeric: true },
    { key: 'price_rub', label: 'Цена ₽', labelZh: '价格 ₽', numeric: true },
    { key: 'margin_cny', label: 'Маржа ¥', labelZh: '利润 ¥', numeric: true },
    { key: 'total_rub', label: 'Итого ₽', labelZh: '合计 ₽', numeric: true },
    { key: 'payment_mode', label: 'Способ оплаты', labelZh: zhDict['Способ оплаты'] },
    { key: 'note', label: 'Примечание', labelZh: '备注' },
  ];

  function doExportExcel() {
    exportToExcel({ filename: `BlackPanda_Sales_${new Date().toISOString().slice(0, 10)}.xls`, sheetName: tt('Продажи'), title: t('sales'), columns: COLUMNS, rows: buildRows() });
  }
  function doExportPdf() {
    const totalRub = filtered.reduce((s, x) => s + Number(x.total_rub), 0);
    exportToPdf({
      title: t('sales'), subtitle: `${dateFrom || '…'} — ${dateTo || '…'}`, columns: COLUMNS, rows: buildRows(),
      footerRow: ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', tt('ИТОГО'), Math.round(totalRub).toLocaleString('ru-RU'), '', ''],
    });
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-5 flex-wrap gap-2">
        <h1 className="text-2xl font-black">{t('sales')} <span className="text-text3 text-sm font-normal">({filtered.length})</span></h1>
        <div className="flex gap-2">
          <button className="btn btn-secondary btn-sm" onClick={doExportExcel}>📊 Excel</button>
          <button className="btn btn-secondary btn-sm" onClick={doExportPdf}>🖨️ PDF</button>
        </div>
      </div>

      <div className="card mb-4 flex flex-wrap gap-2 items-end">
        <div className="min-w-[150px]">
          <label className="block text-[11px] text-text2 font-bold uppercase mb-1">{t('date')} {tt('от')}</label>
          <input className="inp" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div className="min-w-[150px]">
          <label className="block text-[11px] text-text2 font-bold uppercase mb-1">{t('date')} {tt('до')}</label>
          <input className="inp" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-[11px] text-text2 font-bold uppercase mb-1">{t('client')}</label>
          <select className="inp" value={clientFilter} onChange={e => setClientFilter(e.target.value)}>
            <option value="">{tt('Все клиенты')}</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {(dateFrom || dateTo || clientFilter) && (
          <button className="btn btn-danger btn-sm" onClick={() => { setDateFrom(''); setDateTo(''); setClientFilter(''); }}>✕ {tt('Сбросить')}</button>
        )}
      </div>

      <div className="space-y-3">
        {filtered.map(s => {
          const status = saleStatus(s);
          const isOpen = !!expanded[s.id];
          const totalQty = s.items.reduce((n, it) => n + it.qty, 0);
          return (
            <div key={s.id} className="card">
              <div className="flex justify-between items-start flex-wrap gap-2 cursor-pointer" onClick={() => toggle(s.id)}>
                <div>
                  <div className="font-bold text-sm flex items-center gap-2 flex-wrap">
                    No.{s.id.slice(-6)}
                    <span className="text-text3 font-normal">{new Date(s.created_at).toLocaleString('ru-RU')}</span>
                    <span className={`badge ${status.cls}`}>{status.label}</span>
                    {s.warranty_note && <span className="badge badge-purple">🛡️ {tt('Гарантийный случай')}</span>}
                  </div>
                  <div className="text-sm mt-1">
                    {s.client_id ? <Link to={`/clients/${s.client_id}`} onClick={e => e.stopPropagation()} className="hover:text-accent2 hover:underline font-medium">{s.client_name}</Link> : <span className="text-text3">{tt('Без клиента')}</span>}
                    <span className="text-text3"> · {totalQty} {tt('шт.')} · {tt(PAYMENT_LABEL[s.payment_mode] || s.payment_mode)}</span>
                    {s.employee_name && <span className="text-text3"> · {s.employee_name}</span>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-mono text-yellow font-bold">¥{Number(s.total_cny).toFixed(0)}</div>
                  <div className="font-mono text-sm">{Math.round(s.total_rub).toLocaleString('ru-RU')} ₽</div>
                  <div className="text-[10px] text-text3">{tt('курс')} {s.rate}</div>
                </div>
              </div>

              {isOpen && (
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="space-y-2 mb-3">
                    {s.items.map(it => (
                      <div key={it.id} className="bg-bg3 rounded-xl p-3">
                        <div className="flex justify-between items-start mb-1.5 flex-wrap gap-1">
                          <span className="font-medium text-sm">{it.brand} {it.series}</span>
                          <span className="text-xs text-text3">
                            ¥{it.price_sell_cny}/{tt('шт')} × {it.qty} = <b className="text-yellow">¥{Number(it.total_cny).toFixed(0)}</b>
                            {' '}≈ {Math.round(it.price_sell_cny * it.qty * s.rate).toLocaleString('ru-RU')} ₽
                          </span>
                        </div>
                        <div className="text-[11px] text-text3 mb-2">{[it.cpu, it.ram, it.storage, it.gpu, it.color, it.screen].filter(Boolean).join(' · ')}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {(it.serial_details || []).map(sd => (
                            <span key={sd.serial} className="inline-flex items-center gap-1 bg-bg4 rounded-lg px-2 py-1 text-xs font-mono">
                              {sd.serial}
                              {sd.warranty_months > 0 && <span className="text-text3 text-[10px]">🛡️{sd.warranty_months}{tt('мес')}</span>}
                              {canEdit && (
                                <button className="text-text3 hover:text-red ml-1" onClick={() => removeSerialFromSale(s.id, sd.serial)} title={tt('Убрать из продажи (вернуть на склад)')}>✕</button>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mb-3">
                    <label className="block text-[11px] text-text2 font-bold uppercase mb-1">🛡️ {tt('Гарантийный случай (если был)')}</label>
                    <textarea
                      className="inp text-sm" rows={2} defaultValue={s.warranty_note || ''}
                      placeholder={tt('Например: обмен по гарантии 12.08 — не включается экран, отправлен на диагностику')}
                      onBlur={e => { if (e.target.value !== (s.warranty_note || '')) saveWarrantyNote(s.id, e.target.value); }}
                      disabled={!canEdit}
                    />
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <button className="btn btn-secondary btn-sm" onClick={() => doPrint(s)}>🖨️ {tt('Печать')}</button>
                    {canEdit && <button className="btn btn-secondary btn-sm" onClick={() => addSerialToSale(s.id)}>+ {tt('Добавить товар в эту продажу')}</button>}
                    {canEdit && <button className="btn btn-danger btn-sm" onClick={() => removeSale(s.id)}>🗑️ {tt('Удалить продажу (вернуть всё на склад)')}</button>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {!filtered.length && <div className="card text-center text-text3 py-6">—</div>}
      </div>
    </div>
  );
}
