// Возвращает SQL-подзапрос, находящий все текстовые метки статусов, относящиеся к заданной
// "корзине" (instock/intransit/reserved/sold/other). Статусы теперь управляются в Справочнике
// (таблица lib_statuses), поэтому вместо жёстких сравнений status_id='s2' везде используется этот подзапрос.
function bucketSubquery(bucket) {
  return `(SELECT label FROM lib_statuses WHERE counts_as = '${bucket}')`;
}

module.exports = { bucketSubquery };
