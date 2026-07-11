// Компактное форматирование сумм: 100к, 1 млн, 100 млн и т.д.
export function formatCompact(n) {
  const num = Number(n) || 0;
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return sign + (abs / 1_000_000_000).toFixed(abs % 1_000_000_000 === 0 ? 0 : 1) + ' млрд';
  if (abs >= 1_000_000) return sign + (abs / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1) + ' млн';
  if (abs >= 100_000) return sign + Math.round(abs / 1000) + 'к';
  return sign + Math.round(abs).toLocaleString('ru-RU');
}
