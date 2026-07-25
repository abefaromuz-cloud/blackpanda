import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';
import { useTT } from '../i18n/useTT';
import { useLibraryText } from '../hooks/useLibraryText';
import { exportToExcel } from '../utils/export';

// Строка характеристик в одну строку — переиспользуется и в форме, и в отчёте
function specsLine(l, tr, tt) {
  return [
    tr('cpu', l.cpu), tr('ram', l.ram), tr('storage', l.storage), tr('gpu', l.gpu),
    tr('color', l.color), l.touch === 'yes' ? tt('сенсорный') : null,
  ].filter(Boolean).join(' ');
}

export default function Arrivals() {
  const [report, setReport] = useState([]);
  const [laptops, setLaptops] = useState([]);
  const [laptopId, setLaptopId] = useState('');
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [serials, setSerials] = useState('');
  const [costCny, setCostCny] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const { can } = useAuth();
  const { t } = useLang();
  const canEdit = can('arrivals', 'edit');
  const tt = useTT();
  const { tr } = useLibraryText();

  function load() {
    api.get('/arrivals').then(r => setReport(r.data));
    api.get('/laptops').then(r => setLaptops(r.data));
  }
  useEffect(load, []);

  const selectedLaptop = laptops.find(l => l.id === laptopId);

  const pickerResults = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return laptops.slice(0, 30); // без запроса — показываем первые, чтобы список не был пустым
    return laptops.filter(l => {
      const hay = [l.brand, l.series, l.cpu, l.ram, l.storage, l.gpu, l.color, l.mfr_item_code].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    }).slice(0, 30);
  }, [laptops, pickerQuery]);

  function pickLaptop(l) {
    setLaptopId(l.id);
    setPickerOpen(false);
    setPickerQuery('');
  }

  async function submit(e) {
    e.preventDefault();
    const list = serials.split('\n').map(s => s.trim()).filter(Boolean);
    if (!laptopId || !list.length) return;
    const { data } = await api.post('/arrivals', {
      laptop_id: laptopId, serials: list, cost_cny: costCny || null,
      arrival_date: date ? new Date(date).toISOString() : null, note,
    });
    setMsg(`✅ ${tt('Добавлено')}: ${data.created}${data.skipped ? `, ${tt('пропущено дублей')}: ${data.skipped}` : ''}`);
    setSerials(''); setCostCny(''); setNote(''); setLaptopId(''); load();
  }

  const grandTotal = report.reduce((s, r) => s + r.totalQty, 0);

  const ARRIVAL_COLUMNS = [
    { key: 'brand', label: 'Бренд', labelZh: '品牌' },
    { key: 'series', label: 'Серия', labelZh: '系列' },
    { key: 'cpu', label: 'CPU', labelZh: '处理器' },
    { key: 'ram', label: 'RAM', labelZh: '内存' },
    { key: 'storage', label: 'Накопитель', labelZh: '存储' },
    { key: 'gpu', label: 'Видеокарта', labelZh: '显卡' },
    { key: 'color', label: 'Цвет', labelZh: '颜色' },
    { key: 'touch', label: 'Сенсор', labelZh: '触屏', value: it => it.touch === 'yes' ? tt('Да') : tt('Нет') },
    { key: 'qty', label: 'Кол-во', labelZh: '数量', numeric: true },
    { key: 'avg_cost_cny', label: 'Себестоимость ¥/шт', labelZh: '单价成本 ¥', numeric: true, value: it => Math.round(it.avg_cost_cny) },
    { key: 'total_cost_cny', label: 'Итого ¥', labelZh: '总计 ¥', numeric: true, value: it => Math.round(it.total_cost_cny) },
  ];

  function exportDay(day) {
    const dateLabel = new Date(day.date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
    exportToExcel({
      filename: `BlackPanda_Prihod_${day.date}.xls`,
      sheetName: t('arrivals'),
      title: `${t('arrivalReport')} — ${dateLabel}`,
      columns: ARRIVAL_COLUMNS,
      rows: day.items,
      footerRow: ['', '', '', '', '', '', tt('ИТОГО'), '', day.totalQty, '', Math.round(day.totalCostCny)],
    });
  }

  return (
    <div>
      <h1 className="text-2xl font-black mb-6">📥 {t('arrivals')}</h1>

      {canEdit && (
        <form onSubmit={submit} className="card mb-5">
          <div className="font-bold text-sm mb-3">{t('arrivalForm')}</div>

          <div className="mb-3">
            <label className="block text-[11px] text-text2 mb-1">{t('model')}</label>
            {selectedLaptop && !pickerOpen ? (
              <div className="bg-bg3 rounded-xl p-3 flex items-start gap-3">
                <img src={selectedLaptop.image_url || ''} onError={e => e.target.style.display = 'none'} className="w-14 h-14 object-contain rounded-lg bg-bg4 flex-shrink-0" alt="" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm">{tr('brand', selectedLaptop.brand)} {tr('series', selectedLaptop.series)}</div>
                  <div className="text-xs text-text3">{specsLine(selectedLaptop, tr, tt)}</div>
                </div>
                <button type="button" className="text-text3 hover:text-accent2 text-xs flex-shrink-0" onClick={() => setPickerOpen(true)}>✏️ {tt('Изменить')}</button>
              </div>
            ) : (
              <div>
                <input
                  className="inp" autoFocus={pickerOpen} placeholder={tt("Начни вводить бренд, модель или характеристику...")}
                  value={pickerQuery} onChange={e => setPickerQuery(e.target.value)} onFocus={() => setPickerOpen(true)}
                />
                {pickerOpen && (
                  <div className="mt-2 max-h-72 overflow-y-auto border border-border rounded-xl divide-y divide-border">
                    {pickerResults.map(l => (
                      <button type="button" key={l.id} onClick={() => pickLaptop(l)} className="w-full flex items-start gap-3 p-2.5 hover:bg-bg3 text-left">
                        <img src={l.image_url || ''} onError={e => e.target.style.display = 'none'} className="w-12 h-12 object-contain rounded-lg bg-bg3 flex-shrink-0" alt="" />
                        <div className="min-w-0">
                          <div className="font-medium text-sm">{tr('brand', l.brand)} {tr('series', l.series)} {l.is_hot && '🔥'}</div>
                          <div className="text-xs text-text3">{specsLine(l, tr, tt)}</div>
                          <div className="text-[11px] text-text3">{tt("На складе")}: {l.in_stock}</div>
                        </div>
                      </button>
                    ))}
                    {!pickerResults.length && <div className="p-3 text-sm text-text3 text-center">{tt("Ничего не найдено")}</div>}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-3 gap-3 mb-3">
            <div><label className="block text-[11px] text-text2 mb-1">{tt("Дата")}</label><input className="inp" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
            <div><label className="block text-[11px] text-text2 mb-1">{t('unitCost')}</label><input className="inp" type="number" placeholder="¥" value={costCny} onChange={e => setCostCny(e.target.value)} /></div>
            <div><label className="block text-[11px] text-text2 mb-1">{t('comment')}</label><input className="inp" placeholder={t('comment')} value={note} onChange={e => setNote(e.target.value)} /></div>
          </div>
          <textarea className="inp mb-3" rows={4} placeholder={tt("Серийные номера, по одному в строке")} value={serials} onChange={e => setSerials(e.target.value)} />
          <button className="btn btn-primary">{t('add')}</button>
          {msg && <div className="text-sm mt-2 text-green">{msg}</div>}
        </form>
      )}

      <div className="card">
        <div className="flex justify-between items-center mb-3">
          <div className="font-bold text-sm">{t('arrivalReport')}</div>
          <div className="text-xs text-text3">{tt("Всего пришло")}: <b className="text-text">{grandTotal}</b> {tt("шт.")}</div>
        </div>
        {report.length === 0 && <div className="text-text3 text-sm">—</div>}
        {report.map(day => (
          <div key={day.date} className="border-b border-border last:border-0 py-3">
            <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
              <span className="font-bold text-sm">{new Date(day.date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-text3">{day.totalQty} {tt("шт.")} {day.totalCostCny > 0 && `· ¥${Math.round(day.totalCostCny)}`}</span>
                <button onClick={() => exportDay(day)} className="btn btn-secondary text-[11px] px-2 py-1">📊 Excel</button>
              </span>
            </div>
            {day.items.map((it, i) => (
              <Link key={i} to={`/warehouse/${it.laptop_id}`} className="flex justify-between items-center gap-3 text-sm py-1.5 hover:text-accent2">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{tr('brand', it.brand)} {tr('series', it.series)}</span>
                  {' '}
                  <span className="text-text3">{specsLine(it, tr, tt)}</span>
                </span>
                <span className="font-mono text-text3 flex-shrink-0">{it.qty} {tt("шт.")} {it.avg_cost_cny > 0 && `· ¥${Math.round(it.avg_cost_cny)}/${tt("шт")}`}</span>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
