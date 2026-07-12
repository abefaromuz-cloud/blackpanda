const LOGO_URL = () => `${window.location.origin}/logo.png`;
const CONTACT = { site: 'blackpanda.tech', telegram: '@blackpanda_official', team: 'BlackPanda Team' };

const FEATURES = [
  { icon: '🛡️', title: 'НАДЁЖНОСТЬ', sub: 'Проверенное качество' },
  { icon: '📈', title: 'ВЫГОДА', sub: 'Лучшие цены' },
  { icon: '🎧', title: 'ПОДДЕРЖКА', sub: 'Всегда на связи' },
  { icon: '🤝', title: 'ПАРТНЁРСТВО', sub: 'Долгосрочное сотрудничество' },
];

// Экспорт таблицы в Excel — через HTML-таблицу с MS-Office XML заголовком, открывается
// прямо в Excel с нормальным форматированием (не просто CSV с запятыми). Сверху — фирменная
// шапка компании (лого, слоган, контакты), заголовки колонок — на русском и китайском.
export function exportToExcel({ filename, sheetName = 'Лист1', columns, rows, footerRow, title }) {
  const colCount = columns.length;
  const headerCells = columns.map(c => `<th>${c.label}${c.labelZh ? `<br/>${c.labelZh}` : ''}</th>`).join('');
  const bodyRows = rows.map(row => {
    const cells = columns.map(c => {
      const val = typeof c.value === 'function' ? c.value(row) : row[c.key];
      return `<td${c.numeric ? ' style="mso-number-format:\'0\';"' : ''}>${val ?? ''}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  const footer = footerRow
    ? `<tr style="font-weight:bold;background:#f5f5f5">${footerRow.map(c => `<td>${c}</td>`).join('')}</tr>`
    : '';

  const brandRows = `
    <tr><td colspan="${colCount}" style="background:#0d0d0f;color:#fff;font-size:20px;font-weight:bold;padding:10px">🐼 BlackPanda — TECHNOLOGY &amp; SOLUTIONS</td></tr>
    <tr><td colspan="${colCount}" style="background:#0d0d0f;color:#ff5a63;font-size:12px;padding:4px 10px 10px">${title || ''} · ${new Date().toLocaleString('ru-RU')} · ${CONTACT.site} · ${CONTACT.telegram}</td></tr>
    <tr><td colspan="${colCount}"></td></tr>`;

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
  <head><meta charset="UTF-8">
  <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
  <x:Name>${sheetName}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
  </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
  </head><body>
  <table border="1">
    ${brandRows}
    <tr style="background:#1c1c1f;color:white;font-weight:bold">${headerCells}</tr>
    ${bodyRows}
    ${footer}
  </table>
  </body></html>`;

  const blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// Экспорт в PDF — открывает окно печати браузера с готовым HTML-отчётом (с фирменной шапкой);
// пользователь сохраняет как PDF через системный диалог печати (Сохранить как PDF).
export function exportToPdf({ title, subtitle, columns, rows, footerRow }) {
  const headerCells = columns.map(c => `<th>${c.label}${c.labelZh ? `<br/><span class="zh">${c.labelZh}</span>` : ''}</th>`).join('');
  const bodyRows = rows.map(row => {
    const cells = columns.map(c => {
      const val = typeof c.value === 'function' ? c.value(row) : row[c.key];
      return `<td style="${c.numeric ? 'text-align:right;' : ''}">${val ?? ''}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  const footer = footerRow
    ? `<tr style="font-weight:bold;background:#f5f5f5">${footerRow.map(c => `<td>${c}</td>`).join('')}</tr>`
    : '';

  const featureCells = FEATURES.map(f => `
    <div class="feature">
      <span class="fi">${f.icon}</span>
      <div><div class="ft">${f.title}</div><div class="fs">${f.sub}</div></div>
    </div>`).join('');

  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:0;color:#111}
    .banner{background:linear-gradient(120deg,#0d0d0f 60%,#1a0d0e 100%);color:#fff;padding:22px 28px;display:flex;align-items:center;gap:18px;flex-wrap:wrap}
    .banner img{height:56px;width:auto}
    .brand{font-size:26px;font-weight:900;margin:0}
    .brand span{color:#ff5a63}
    .tagline{font-size:11px;letter-spacing:2px;color:#a1a1aa;margin-top:2px}
    .slogan{margin-left:auto;font-size:13px;line-height:1.5}
    .slogan b{color:#ff5a63}
    .features{display:flex;gap:22px;flex-wrap:wrap;background:#131316;padding:10px 28px;border-bottom:2px solid #e11d2e}
    .feature{display:flex;align-items:center;gap:8px;color:#e4e4e7}
    .fi{font-size:16px}
    .ft{font-size:11px;font-weight:bold;color:#fff}
    .fs{font-size:9px;color:#a1a1aa}
    .content{padding:20px 28px}
    h2{font-size:15px;margin:0 0 2px}
    .sub{font-size:12px;color:#666;font-weight:normal;margin:0 0 16px}
    table{width:100%;border-collapse:collapse;font-size:11px}
    th,td{padding:6px 8px;border:1px solid #ccc;text-align:left}
    th{background:#1c1c1f;color:#fff;font-size:10px}
    th .zh{display:block;font-weight:normal;color:#ff5a63;font-size:9px}
    .no-print{margin:20px 28px;padding:10px 20px;font-size:14px;cursor:pointer}
    @media print{.no-print{display:none}}
  </style></head><body>
  <div class="banner">
    <img src="${LOGO_URL()}" alt="BlackPanda" onerror="this.style.display='none'">
    <div><div class="brand">Black<span>Panda</span></div><div class="tagline">TECHNOLOGY &amp; SOLUTIONS</div></div>
    <div class="slogan">ТЕХНОЛОГИИ, КОТОРЫЕ<br/><b>РАБОТАЮТ НА ВАШ УСПЕХ</b></div>
  </div>
  <div class="features">${featureCells}</div>
  <div class="content">
    <h2>${title}</h2>
    <div class="sub">${subtitle ? subtitle + ' · ' : ''}${new Date().toLocaleString('ru-RU')} · ${CONTACT.site} · ${CONTACT.telegram} · ${CONTACT.team}</div>
    <table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}${footer}</tbody></table>
    <button class="no-print" onclick="window.print()">🖨️ Печать / Сохранить как PDF</button>
  </div>
  </body></html>`);
  w.document.close();
}
