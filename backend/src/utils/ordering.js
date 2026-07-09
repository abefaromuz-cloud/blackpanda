// Вставляет новый элемент в список с сохранением текущего порядка (в том числе после ручной
// перетасовки), но по алфавиту относительно ближайших соседей — как и было задумано:
// "даже если добавлю новый, он должен встать в алфавитном порядке" относительно того, что уже есть.
async function insertOrdered(client, table, nameColumn, whereSql, whereParams, name) {
  const existing = await client.query(
    `SELECT id, ${nameColumn} AS name, sort_order FROM ${table} WHERE ${whereSql} ORDER BY sort_order ASC`,
    whereParams
  );
  const rows = existing.rows;
  if (!rows.length) return 100;

  let idx = rows.findIndex(r => name.localeCompare(r.name, 'ru') < 0);
  if (idx === -1) idx = rows.length; // вставить в конец

  if (idx === 0) {
    const first = rows[0].sort_order;
    if (first > 1) return Math.floor(first / 2);
    await renumber(client, table, whereSql, whereParams);
    return -50; // после renumber первый элемент станет 100, вставляем перед ним
  }
  if (idx === rows.length) {
    return rows[rows.length - 1].sort_order + 100;
  }
  const prev = rows[idx - 1].sort_order;
  const next = rows[idx].sort_order;
  if (next - prev > 1) return Math.floor((prev + next) / 2);
  await renumber(client, table, whereSql, whereParams);
  return await insertOrdered(client, table, nameColumn, whereSql, whereParams, name); // повтор после renumber
}

async function renumber(client, table, whereSql, whereParams) {
  const existing = await client.query(`SELECT id FROM ${table} WHERE ${whereSql} ORDER BY sort_order ASC`, whereParams);
  for (let i = 0; i < existing.rows.length; i++) {
    await client.query(`UPDATE ${table} SET sort_order=$1 WHERE id=$2`, [(i + 1) * 100, existing.rows[i].id]);
  }
}

module.exports = { insertOrdered, renumber };
