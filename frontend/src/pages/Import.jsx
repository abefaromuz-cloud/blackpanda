import { useState } from 'react';
import Papa from 'papaparse';
import api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useLang } from '../i18n/LangContext';

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
  const canEdit = can('import', 'edit');

  return (
    <div>
      <h1 className="text-xl font-black mb-5">{t('importPage')}</h1>
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
