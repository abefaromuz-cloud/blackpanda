// Открывает окно печати с чеком продажи
export function printReceipt({ saleId, clientName, items, discountRub, totalRub, totalCny, note }) {
  const rows = items.map(it => `<tr>
    <td style="padding:6px;border:1px solid #ccc">${it.brand} ${it.series}</td>
    <td style="padding:6px;border:1px solid #ccc;font-size:11px">${(it.serials || []).join(', ')}</td>
    <td style="padding:6px;border:1px solid #ccc;text-align:center">${it.qty}</td>
    <td style="padding:6px;border:1px solid #ccc;text-align:right">¥${it.totalCny}</td>
  </tr>`).join('');
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Заказ ${saleId || ''}</title>
  <style>body{font-family:Arial;padding:24px;max-width:700px;margin:0 auto}
  h1{font-size:20px}h2{font-size:14px;color:#666;font-weight:normal}
  table{width:100%;border-collapse:collapse;margin-top:16px}
  th{padding:6px;border:1px solid #ccc;background:#f5f5f5;text-align:left}
  .total{text-align:right;font-size:18px;font-weight:bold;margin-top:12px}
  @media print{.no-print{display:none}}</style></head><body>
  <h1>🐼 BlackPanda</h1>
  <h2>Дата: ${new Date().toLocaleString('ru-RU')}</h2>
  ${clientName ? `<h2>Клиент: ${clientName}</h2>` : ''}
  <table><tr><th>Товар</th><th>Серийники</th><th>Кол-во</th><th>Сумма</th></tr>${rows}</table>
  ${discountRub > 0 ? `<div style="text-align:right;margin-top:8px;color:#c00">Скидка: −${discountRub.toLocaleString('ru-RU')} ₽</div>` : ''}
  <div class="total">Итого: ${Math.round(totalRub).toLocaleString('ru-RU')} ₽ (¥${Number(totalCny).toFixed(0)})</div>
  ${note ? `<p>Комментарий: ${note}</p>` : ''}
  <button class="no-print" onclick="window.print()" style="margin-top:20px;padding:10px 20px;font-size:14px;cursor:pointer">🖨️ Печать / PDF</button>
  </body></html>`);
  w.document.close();
}

// Открывает окно печати с QR-этикеткой серийника
export function printSerialLabel({ serial, brand, series, specs, arrivalDate }) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(serial)}`;
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Этикетка ${serial}</title>
  <style>body{font-family:Arial;padding:20px;max-width:300px}
  .label{border:2px solid #000;padding:12px;border-radius:8px;text-align:center}
  .brand{font-size:14px;font-weight:bold;margin-bottom:4px}
  .series{font-size:12px;color:#666;margin-bottom:8px}
  .sn{font-size:16px;font-weight:900;font-family:monospace;margin:8px 0}
  .specs{font-size:10px;color:#444;margin-bottom:8px}
  img{margin:8px auto;display:block}
  @media print{body{padding:5px}}</style></head>
  <body><div class="label">
    <div class="brand">${brand || 'BlackPanda'}</div>
    <div class="series">${series || ''}</div>
    <div class="specs">${specs || ''}</div>
    <img src="${qrUrl}" width="150" height="150" alt="QR">
    <div class="sn">${serial}</div>
    <div style="font-size:10px;color:#888">BlackPanda CRM · ${arrivalDate ? new Date(arrivalDate).toLocaleDateString('ru-RU') : ''}</div>
  </div>
  <script>window.onload=function(){window.print();}</script></body></html>`);
  w.document.close();
}
