import { useEffect, useState, useMemo } from 'react';
import api from '../api/client';
import { useLang } from '../i18n/LangContext';
import { useTT } from '../i18n/useTT';
import { printReceipt } from '../utils/print';
import { exportToExcel, exportToPdf } from '../utils/export';
import { zhDict } from '../i18n/zhDict';

export default function Sales() {
  const [sales, setSales] = useState([]);
  const [clients, setClients] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const { t } = useLang();
  const tt = useTT();

  useEffect(() => {
    api.get('/sales').then(r => setSales(r.data));
    api.get('/clients').then(r => setClients(r.data));
  }, []);

  const filtered = useMemo(() => {
    return sales.filter(s => {
      if (dateFrom && new Date(s.created_at) < new Date(dateFrom)) return false;
      if (dateTo && new Date(s.created_at) > new Date(dateTo + 'T23:59:59')) return false;
      if (clientFilter && s.client_id !== clientFilter) return false;
      return true;
    });
  }, [sales, dateFrom, dateTo, clientFilter]);

  // Разворачиваем продажи в построчный вид (одна строка = одна позиция/серийник) — так удобнее
  // анализировать в Excel, чем "одна строка = вся продажа"
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
            price_cny: Number(it.price_sell_cny || 0),
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
    { key: 'price_rub', label: 'Цена ₽', labelZh: '价格 ₽', numeric: true },
    { key: 'margin_cny', label: 'Маржа ¥', labelZh: '利润 ¥', numeric: true },
    { key: 'total_rub', label: 'Итого ₽', labelZh: '合计 ₽', numeric: true },
    { key: 'payment_mode', label: 'Способ оплаты', labelZh: zhDict['Способ оплаты'] },
    { key: 'note', label: 'Примечание', labelZh: '备注' },
  ];

  function doExportExcel() {
    const rows = buildRows();
    exportToExcel({
      filename: `BlackPanda_Sales_${new Date().toISOString().slice(0, 10)}.xls`,
      sheetName: tt('Продажи'),
      title: t('sales'),
      columns: COLUMNS,
      rows,
    });
  }

  function doExportPdf() {
    const rows = buildRows();
    const totalRub = filtered.reduce((s, x) => s + Number(x.total_rub), 0);
    exportToPdf({
      title: t('sales'),
      subtitle: `${dateFrom || '…'} — ${dateTo || '…'}`,
      columns: COLUMNS,
      rows,
      footerRow: ['', '', '', '', '', '', '', '', '', '', '', '', '', '', tt('ИТОГО'), Math.round(totalRub).toLocaleString('ru-RU'), '', ''],
    });
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-5 flex-wrap gap-2">
        <h1 className="text-2xl font-black">{t('sales')}</h1>
        <div className="flex gap-2">
          <button className="btn btn-secondary btn-sm" onClick={doExportExcel}>📊 Excel</button>
          <button className="btn btn-secondary btn-sm" onClick={doExportPdf}>🖨️ PDF</button>
        </div>
      </div>

      <div className="card mb-4 flex flex-wrap gap-2 items-end">
        <div>
          <label className="block text-[11px] text-text2 font-bold uppercase mb-1">{t('date')} {tt('от')}</label>
          <input className="inp" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div>
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

      <div className="card">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase text-text3 border-b border-border">
              <th className="pb-2">{t('date')}</th><th className="pb-2">{t('client')}</th><th className="pb-2">{t('qty')}</th><th className="pb-2">¥</th><th className="pb-2">₽</th><th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id} className="border-b border-border last:border-0">
                <td className="py-2 text-text3">{new Date(s.created_at).toLocaleString('ru-RU')}</td>
                <td className="py-2">{s.client_name}</td>
                <td className="py-2">{s.items.reduce((n, it) => n + it.qty, 0)}</td>
                <td className="py-2 font-mono text-yellow">¥{Number(s.total_cny).toFixed(0)}</td>
                <td className="py-2 font-mono">{Math.round(s.total_rub).toLocaleString('ru-RU')} ₽</td>
                <td className="py-2 text-right">
                  <button className="text-text3 hover:text-accent2 text-xs" onClick={() => printReceipt({
                    saleId: s.id, clientName: s.client_name, note: s.note, discountRub: 0, totalRub: s.total_rub, totalCny: s.total_cny,
                    items: s.items.map(it => ({ brand: it.brand, series: it.series, serials: it.serials || [], qty: it.qty, totalCny: Number(it.total_cny).toFixed(0) })),
                  })}>🖨️</button>
                </td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={6} className="text-center py-6 text-text3">—</td></tr>}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
