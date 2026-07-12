import { useState } from 'react';
import Papa from 'papaparse';
import api from '../api/client';
import { useTT } from '../i18n/useTT';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';

function LegacyImportBlock({ canEdit }) {
  const tt = useTT();
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name); setErr(''); setResult(null);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      setLoading(true);
      try {
        const data = JSON.parse(ev.target.result);
        const { data: res } = await api.post('/import/legacy-backup', data);
        setResult(res.counts);
      } catch (e2) {
        setErr(e2.response?.data?.error || tt('Не удалось разобрать файл — убедись, что это JSON-бэкап из старой версии'));
      } finally { setLoading(false); }
    };
    reader.readAsText(file);
  }

  return (
    <div className="card mb-5 border-accent/40">
      <div className="font-bold text-sm mb-2">🐼 {tt("Импорт из старой версии (HTML/Firebase)")}</div>
      <div className="text-xs text-text3 mb-3">
        {tt("В старой CRM нажми «Бэкап данных» — скачается файл вида")} <code className="text-accent2">BlackPanda_backup_....json</code>. {tt("Загрузи его сюда — перенесутся клиенты, склад, серийники, продажи, касса, курс и банковские счета.")}
        <br /><b className="text-yellow">{tt("Запускай только один раз")}</b> — {tt("при повторном запуске клиенты и продажи продублируются (серийники защищены от дублей уникальным номером).")}
      </div>
      {canEdit && (
        <label className="btn btn-primary inline-block cursor-pointer">
          {loading ? tt('Импортируем...') : '📁 ' + tt('Выбрать файл бэкапа')}
          <input type="file" accept=".json" className="hidden" onChange={handleFile} disabled={loading} />
        </label>
      )}
      {fileName && <div className="text-xs text-text3 mt-2">{tt("Файл")}: {fileName}</div>}
      {err && <div className="mt-3 text-sm text-red">{err}</div>}
      {result && (
        <div className="mt-3 text-sm text-green">
          ✅ {tt("Импортировано: клиентов")} — {result.clients}, {tt("моделей")} — {result.laptops}, {tt("серийников")} — {result.serials},
          {tt("продаж")} — {result.sales}, {tt("записей кассы")} — {result.cash}, {tt("долгов")} — {result.debts}
        </div>
      )}
    </div>
  );
}

function ImportBlock({ title, columns, endpoint, mapRow, t, canEdit }) {
  const [csv, setCsv] = useState('');
  const [rows, setRows] = useState([]);
  const [result, setResult] = useState(null);

  function parse() {
    const { data } = Papa.parse(csv.trim(), { header: true, skipEmptyLines: true });
    setRows(data.map(mapRow));
    setResult(null);
  }

  async function doImport() {
    const { data } = await api.post(endpoint, { rows });
    setResult(data);
  }

  return (
    <div className="card mb-5">
      <div className="font-bold text-sm mb-2">{title}</div>
      <div className="text-xs text-text3 mb-2">{t('pasteCsv')}: {columns.join(', ')}</div>
      <textarea className="inp mb-2" rows={4} value={csv} onChange={e => setCsv(e.target.value)} placeholder={columns.join(',')} disabled={!canEdit} />
      {canEdit && <button className="btn btn-secondary mb-3" onClick={parse}>{t('preview')}</button>}
      {rows.length > 0 && (
        <>
          <div className="text-xs text-text3 mb-2">{rows.length} {t('rowsFound')}</div>
          <div className="overflow-x-auto mb-3">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-text3 border-b border-border">{columns.map(c => <th key={c} className="pb-1 pr-3">{c}</th>)}</tr></thead>
              <tbody>
                {rows.slice(0, 10).map((r, i) => (
                  <tr key={i} className="border-b border-border last:border-0">{columns.map(c => <td key={c} className="py-1 pr-3">{r[c] ?? ''}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && <button className="btn btn-primary" onClick={doImport}>{t('importBtn')}</button>}
        </>
      )}
      {result && <div className="mt-2 text-sm text-green">✓ {result.created}</div>}
    </div>
  );
}

export default function Import() {
  const { can } = useAuth();
  const { t } = useLang();
  const tt = useTT();
  const canEdit = can('import', 'edit');

  async function downloadBackup() {
    const { data } = await api.get('/import/export-backup');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `blackpanda-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }

  return (
    <div>
      <h1 className="text-2xl font-black mb-6">{t('importPage')}</h1>
      <div className="card mb-5 flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="font-bold text-sm">💾 {tt('Резервная копия данных')}</div>
          <div className="text-xs text-text3">{tt('Скачать все данные системы одним JSON-файлом — на всякий случай')}</div>
        </div>
        <button className="btn btn-secondary" onClick={downloadBackup}>⬇️ {tt('Скачать бэкап')}</button>
      </div>
      <LegacyImportBlock canEdit={canEdit} />
      <ImportBlock
        title={t('importClients')}
        columns={['name', 'phone', 'telegram']}
        endpoint="/import/clients"
        mapRow={r => ({ name: r.name, phone: r.phone, telegram: r.telegram })}
        t={t} canEdit={canEdit}
      />
      <ImportBlock
        title={t('importLaptops')}
        columns={['brand', 'series', 'cpu', 'ram', 'gpu', 'storage', 'cost_cny', 'price_sell_cny']}
        endpoint="/import/laptops"
        mapRow={r => ({ brand: r.brand, series: r.series, cpu: r.cpu, ram: r.ram, gpu: r.gpu, storage: r.storage, cost_cny: Number(r.cost_cny)||0, price_sell_cny: Number(r.price_sell_cny)||0 })}
        t={t} canEdit={canEdit}
      />
    </div>
  );
}
