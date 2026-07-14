import { useState } from 'react';
import api from '../api/client';
import { useLang } from '../i18n/LangContext';
import { useTT } from '../i18n/useTT';
import { exportToExcel, exportToPdf } from '../utils/export';
import { zhDict } from '../i18n/zhDict';

export default function Reports() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { t } = useLang();
  const tt = useTT();

  return (
    <div>
      <h1 className="text-2xl font-black mb-1">{t('reports')}</h1>
      <div className="text-xs text-text3 mb-6">{tt('Реестры для бухгалтерии — по каждой единице товара отдельной строкой, с курсом на момент операции')}</div>

      <div className="card mb-5 flex gap-2 flex-wrap items-end">
        <div className="min-w-[150px]"><label className="block text-[11px] text-text2 font-bold uppercase mb-1">{t('from')}</label><input className="inp" type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div className="min-w-[150px]"><label className="block text-[11px] text-text2 font-bold uppercase mb-1">{t('to')}</label><input className="inp" type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
        <div className="text-[11px] text-text3">{tt('Общий период для всех реестров ниже — оставь пустым для «за всё время»')}</div>
      </div>

      <SalesRegister from={from} to={to} tt={tt} t={t} />
      <PurchasesRegister from={from} to={to} tt={tt} t={t} />
      <CashflowRegister from={from} to={to} tt={tt} t={t} />
    </div>
  );
}

function SalesRegister({ from, to, tt, t }) {
  const [data, setData] = useState(null);

  async function generate() {
    const { data } = await api.get('/reports/sales-register', { params: { from: from || undefined, to: to || undefined } });
    setData(data);
  }

  const COLUMNS = [
    { key: 'date', label: 'Дата', labelZh: '日期' },
    { key: 'sale_no', label: '№ продажи', labelZh: '销售编号' },
    { key: 'client', label: 'Клиент', labelZh: '客户' },
    { key: 'brand', label: 'Бренд', labelZh: zhDict['Бренд'] },
    { key: 'series', label: 'Серия', labelZh: zhDict['Серия'] },
    { key: 'serial', label: 'Серийник', labelZh: zhDict['Серийник'] },
    { key: 'rate', label: 'Курс', labelZh: '汇率', numeric: true },
    { key: 'cost_cny', label: 'Себестоимость ¥', labelZh: '成本 ¥', numeric: true },
    { key: 'cost_rub', label: 'Себестоимость ₽', labelZh: '成本 ₽', numeric: true },
    { key: 'sell_cny', label: 'Цена продажи ¥', labelZh: '售价 ¥', numeric: true },
    { key: 'sell_rub', label: 'Цена продажи ₽', labelZh: '售价 ₽', numeric: true },
    { key: 'profit_rub', label: 'Прибыль ₽', labelZh: '利润 ₽', numeric: true },
    { key: 'payment_mode', label: 'Способ оплаты', labelZh: zhDict['Способ оплаты'] },
    { key: 'payment_status', label: 'Статус оплаты', labelZh: '付款状态' },
    { key: 'employee', label: 'Сотрудник', labelZh: '员工' },
  ];

  function buildRows() {
    return (data?.rows || []).map(r => ({
      date: new Date(r.created_at).toLocaleString('ru-RU'), sale_no: 'No.' + r.sale_id.slice(-6),
      client: r.client_name, brand: r.brand, series: r.series, serial: r.serial,
      rate: r.rate, cost_cny: r.cost_cny, cost_rub: r.cost_rub, sell_cny: r.sell_cny, sell_rub: r.sell_rub,
      profit_rub: r.profit_rub, payment_mode: r.payment_mode, payment_status: r.payment_status, employee: r.employee_name,
    }));
  }

  function doExportExcel() {
    exportToExcel({
      filename: `BlackPanda_Sales_Register_${new Date().toISOString().slice(0, 10)}.xls`,
      sheetName: 'Реестр продаж', title: 'Реестр продаж (для бухгалтерии)',
      columns: COLUMNS, rows: buildRows(),
      footerRow: ['', '', '', '', '', '', '', '', '', 'ИТОГО:', Math.round(data.totals.sell_rub).toLocaleString('ru-RU'), Math.round(data.totals.profit_rub).toLocaleString('ru-RU'), '', '', ''],
    });
  }
  function doExportPdf() {
    exportToPdf({
      title: 'Реестр продаж (для бухгалтерии)', subtitle: `${from || '…'} — ${to || '…'}`,
      columns: COLUMNS, rows: buildRows(),
    });
  }

  return (
    <div className="card mb-5">
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <div className="font-bold text-sm">📒 {tt('Реестр продаж')}</div>
        <div className="flex gap-2">
          <button className="btn btn-primary btn-sm" onClick={generate}>{t('generate')}</button>
          {data && <>
            <button className="btn btn-secondary btn-sm" onClick={doExportExcel}>📊 Excel</button>
            <button className="btn btn-secondary btn-sm" onClick={doExportPdf}>🖨️ PDF</button>
          </>}
        </div>
      </div>
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3 text-xs">
            <div className="bg-bg3 rounded-lg p-2"><div className="text-text3">{tt('Выручка')}</div><b>{Math.round(data.totals.sell_rub).toLocaleString('ru-RU')} ₽</b></div>
            <div className="bg-bg3 rounded-lg p-2"><div className="text-text3">{tt('Себестоимость')}</div><b>{Math.round(data.totals.cost_rub).toLocaleString('ru-RU')} ₽</b></div>
            <div className="bg-bg3 rounded-lg p-2"><div className="text-text3">{tt('Валовая прибыль')}</div><b className="text-green">{Math.round(data.totals.profit_rub).toLocaleString('ru-RU')} ₽</b></div>
            <div className="bg-bg3 rounded-lg p-2"><div className="text-text3">{tt('Непогашено')}</div><b className="text-red">{Math.round(data.totals.open_debt_rub).toLocaleString('ru-RU')} ₽</b></div>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase text-text3 border-b border-border">
                <th className="pb-2">{tt('Дата')}</th><th className="pb-2">{t('client')}</th><th className="pb-2">{tt('Товар')}</th>
                <th className="pb-2">{tt('Серийник')}</th><th className="pb-2">{tt('Курс')}</th>
                <th className="pb-2">{tt('Себест. ₽')}</th><th className="pb-2">{tt('Продажа ₽')}</th><th className="pb-2">{tt('Прибыль ₽')}</th>
                <th className="pb-2">{tt('Оплата')}</th><th className="pb-2">{tt('Сотрудник')}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="py-1.5 text-text3">{new Date(r.created_at).toLocaleDateString('ru-RU')}</td>
                  <td className="py-1.5">{r.client_name}</td>
                  <td className="py-1.5">{r.brand} {r.series}</td>
                  <td className="py-1.5 font-mono text-text3">{r.serial}</td>
                  <td className="py-1.5 font-mono">{r.rate}</td>
                  <td className="py-1.5 font-mono">{r.cost_rub.toLocaleString('ru-RU')}</td>
                  <td className="py-1.5 font-mono">{r.sell_rub.toLocaleString('ru-RU')}</td>
                  <td className="py-1.5 font-mono text-green">{r.profit_rub.toLocaleString('ru-RU')}</td>
                  <td className="py-1.5"><span className={`badge ${r.payment_status === 'Оплачено' ? 'badge-green' : 'badge-red'} text-[9px]`}>{tt(r.payment_status)}</span></td>
                  <td className="py-1.5 text-text3">{r.employee_name}</td>
                </tr>
              ))}
              {!data.rows.length && <tr><td colSpan={10} className="text-center py-4 text-text3">—</td></tr>}
            </tbody>
          </table></div>
        </>
      )}
    </div>
  );
}

function PurchasesRegister({ from, to, tt, t }) {
  const [data, setData] = useState(null);

  async function generate() {
    const { data } = await api.get('/reports/purchases-register', { params: { from: from || undefined, to: to || undefined } });
    setData(data);
  }

  const COLUMNS = [
    { key: 'date', label: 'Дата поступления', labelZh: '入库日期' },
    { key: 'brand', label: 'Бренд', labelZh: zhDict['Бренд'] },
    { key: 'series', label: 'Серия', labelZh: zhDict['Серия'] },
    { key: 'serial', label: 'Серийник', labelZh: zhDict['Серийник'] },
    { key: 'cost_cny', label: 'Себестоимость ¥', labelZh: '成本 ¥', numeric: true },
    { key: 'note', label: 'Примечание', labelZh: '备注' },
  ];

  function buildRows() {
    return (data?.rows || []).map(r => ({
      date: new Date(r.arrival_date).toLocaleDateString('ru-RU'), brand: r.brand, series: r.series,
      serial: r.serial, cost_cny: r.cost_cny, note: r.arrival_note || '',
    }));
  }

  function doExportExcel() {
    exportToExcel({
      filename: `BlackPanda_Purchases_Register_${new Date().toISOString().slice(0, 10)}.xls`,
      sheetName: 'Реестр прихода', title: 'Реестр прихода товара',
      columns: COLUMNS, rows: buildRows(),
      footerRow: ['', '', '', 'ИТОГО:', Math.round(data.totals.total_cny).toLocaleString('ru-RU'), ''],
    });
  }
  function doExportPdf() {
    exportToPdf({ title: 'Реестр прихода товара', subtitle: `${from || '…'} — ${to || '…'}`, columns: COLUMNS, rows: buildRows() });
  }

  return (
    <div className="card mb-5">
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <div className="font-bold text-sm">📥 {tt('Реестр прихода товара')}</div>
        <div className="flex gap-2">
          <button className="btn btn-primary btn-sm" onClick={generate}>{t('generate')}</button>
          {data && <>
            <button className="btn btn-secondary btn-sm" onClick={doExportExcel}>📊 Excel</button>
            <button className="btn btn-secondary btn-sm" onClick={doExportPdf}>🖨️ PDF</button>
          </>}
        </div>
      </div>
      {data && (
        <>
          <div className="text-xs text-text3 mb-3">{tt('Всего поступило')}: <b className="text-text">{data.totals.count} {tt('шт.')}</b> · ¥{Math.round(data.totals.total_cny).toLocaleString('ru-RU')}</div>
          <div className="overflow-x-auto"><table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase text-text3 border-b border-border">
                <th className="pb-2">{tt('Дата')}</th><th className="pb-2">{tt('Товар')}</th><th className="pb-2">{tt('Серийник')}</th>
                <th className="pb-2">{tt('Себестоимость')}</th><th className="pb-2">{t('comment')}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="py-1.5 text-text3">{new Date(r.arrival_date).toLocaleDateString('ru-RU')}</td>
                  <td className="py-1.5">{r.brand} {r.series}</td>
                  <td className="py-1.5 font-mono text-text3">{r.serial}</td>
                  <td className="py-1.5 font-mono">¥{r.cost_cny}</td>
                  <td className="py-1.5 text-text3">{r.arrival_note || '—'}</td>
                </tr>
              ))}
              {!data.rows.length && <tr><td colSpan={5} className="text-center py-4 text-text3">—</td></tr>}
            </tbody>
          </table></div>
        </>
      )}
    </div>
  );
}

function CashflowRegister({ from, to, tt, t }) {
  const [data, setData] = useState(null);

  async function generate() {
    const { data } = await api.get('/reports/cashflow-register', { params: { from: from || undefined, to: to || undefined } });
    setData(data);
  }

  const COLUMNS = [
    { key: 'date', label: 'Дата', labelZh: '日期' },
    { key: 'type', label: 'Тип', labelZh: '类型' },
    { key: 'amount_rub', label: 'Сумма ₽', labelZh: '金额 ₽', numeric: true },
    { key: 'method', label: 'Счёт', labelZh: '账户' },
    { key: 'category', label: 'Категория', labelZh: '类别' },
    { key: 'client', label: 'Клиент', labelZh: '客户' },
    { key: 'note', label: 'Примечание', labelZh: '备注' },
  ];

  function buildRows() {
    return (data?.rows || []).map(r => ({
      date: new Date(r.created_at).toLocaleString('ru-RU'), type: r.type === 'in' ? 'Приход' : 'Расход',
      amount_rub: Math.round(r.amount_rub), method: r.bank_key || 'Наличные', category: r.category || '',
      client: r.client_name || r.recipient || '', note: r.note || '',
    }));
  }

  function doExportExcel() {
    exportToExcel({
      filename: `BlackPanda_Cashflow_${new Date().toISOString().slice(0, 10)}.xls`,
      sheetName: 'Движение денег', title: 'Реестр движения денежных средств',
      columns: COLUMNS, rows: buildRows(),
      footerRow: ['', 'Приход:', Math.round(data.totals.in).toLocaleString('ru-RU'), '', 'Расход:', Math.round(data.totals.out).toLocaleString('ru-RU'), 'Итого: ' + Math.round(data.totals.net).toLocaleString('ru-RU')],
    });
  }
  function doExportPdf() {
    exportToPdf({ title: 'Реестр движения денежных средств', subtitle: `${from || '…'} — ${to || '…'}`, columns: COLUMNS, rows: buildRows() });
  }

  return (
    <div className="card">
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <div className="font-bold text-sm">💵 {tt('Реестр движения денежных средств')}</div>
        <div className="flex gap-2">
          <button className="btn btn-primary btn-sm" onClick={generate}>{t('generate')}</button>
          {data && <>
            <button className="btn btn-secondary btn-sm" onClick={doExportExcel}>📊 Excel</button>
            <button className="btn btn-secondary btn-sm" onClick={doExportPdf}>🖨️ PDF</button>
          </>}
        </div>
      </div>
      {data && (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
            <div className="bg-bg3 rounded-lg p-2"><div className="text-text3">{tt('Приход')}</div><b className="text-green">{Math.round(data.totals.in).toLocaleString('ru-RU')} ₽</b></div>
            <div className="bg-bg3 rounded-lg p-2"><div className="text-text3">{tt('Расход')}</div><b className="text-red">{Math.round(data.totals.out).toLocaleString('ru-RU')} ₽</b></div>
            <div className="bg-bg3 rounded-lg p-2"><div className="text-text3">{tt('Итого')}</div><b>{Math.round(data.totals.net).toLocaleString('ru-RU')} ₽</b></div>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase text-text3 border-b border-border">
                <th className="pb-2">{tt('Дата')}</th><th className="pb-2">{tt('Тип')}</th><th className="pb-2">{tt('Сумма')}</th>
                <th className="pb-2">{tt('Счёт')}</th><th className="pb-2">{t('client')}</th><th className="pb-2">{t('comment')}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="py-1.5 text-text3">{new Date(r.created_at).toLocaleDateString('ru-RU')}</td>
                  <td className="py-1.5"><span className={`badge ${r.type === 'in' ? 'badge-green' : 'badge-red'} text-[9px]`}>{r.type === 'in' ? tt('Приход') : tt('Расход')}</span></td>
                  <td className={`py-1.5 font-mono ${r.type === 'in' ? 'text-green' : 'text-red'}`}>{r.type === 'in' ? '+' : '-'}{Math.round(r.amount_rub).toLocaleString('ru-RU')} ₽</td>
                  <td className="py-1.5 text-text3">{r.bank_key || tt('Наличные')}</td>
                  <td className="py-1.5 text-text3">{r.client_name || r.recipient || '—'}</td>
                  <td className="py-1.5 text-text3">{r.note}</td>
                </tr>
              ))}
              {!data.rows.length && <tr><td colSpan={6} className="text-center py-4 text-text3">—</td></tr>}
            </tbody>
          </table></div>
        </>
      )}
    </div>
  );
}
