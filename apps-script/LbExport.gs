/**
 * Нічна копія нової бази (Supabase) в ОКРЕМУ Google-таблицю «Книги — копія з бази».
 * Основну таблицю «Книги» цей файл не змінює й не читає.
 * Ключ — той самий LB_WEB_KEY з Властивостей скрипту (у коді ключа немає).
 *
 * Разово запустити lbExportInstall: створить таблицю-копію, заповнить її й увімкне щонічне оновлення (~4:00).
 * Вимкнути: lbExportUninstall.
 */
const LB_EXPORT_URL = 'https://syrwtxxgbybftkuxuvlq.supabase.co/functions/v1/export';
const LB_EXPORT_NAME = 'Книги — копія з бази';

function lbExportFromDb() {
  const props = PropertiesService.getScriptProperties();
  const key = (props.getProperty('LB_WEB_KEY') || '').trim();
  if (!key) throw new Error('Немає LB_WEB_KEY у Властивостях скрипту.');
  const res = UrlFetchApp.fetch(LB_EXPORT_URL, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ key: key }),
  });
  let body;
  try { body = JSON.parse(res.getContentText()); } catch (e) { throw new Error('База відповіла не JSON (HTTP ' + res.getResponseCode() + ').'); }
  if (!body.ok) throw new Error('База: ' + body.error);
  const data = body.data;

  let ss = null;
  const id = props.getProperty('LB_EXPORT_ID');
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) { ss = SpreadsheetApp.create(LB_EXPORT_NAME); props.setProperty('LB_EXPORT_ID', ss.getId()); }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const counts = [];
    data.tables.forEach(function (t) {
      const sh = ss.getSheetByName(t.name) || ss.insertSheet(t.name);
      sh.clear();
      const rows = [t.header].concat(t.rows);
      // ISBN, ТТН і номери — як текст, щоб таблиця не перетворила їх на 9,79E+12
      t.header.forEach(function (h, i) { if (['ISBN', 'ТТН', 'Номер замовлення', 'ID книги'].indexOf(h) !== -1) sh.getRange(1, i + 1, rows.length, 1).setNumberFormat('@'); });
      sh.getRange(1, 1, rows.length, t.header.length).setValues(rows);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, t.header.length).setFontWeight('bold');
      counts.push(t.name + ': ' + t.rows.length);
    });
    const info = ss.getSheetByName('Про копію') || ss.insertSheet('Про копію', 0);
    info.clear();
    info.getRange(1, 1, 4, 1).setValues([
      ['Це копія нової бази тільки для перегляду. Тут нічого не редагуйте: щоночі все перезаписується.'],
      ['Оновлено: ' + data.at],
      [counts.join(' · ')],
      ['Основна таблиця «Книги» цією копією не змінюється.'],
    ]);
    ['Аркуш1', 'Sheet1', 'Лист1'].forEach(function (n) { const s = ss.getSheetByName(n); if (s && ss.getSheets().length > 1) ss.deleteSheet(s); });
    console.log('Копію з бази оновлено: ' + counts.join(', ') + '. ' + ss.getUrl());
    return ss.getUrl();
  } finally { lock.releaseLock(); }
}

function lbExportInstall() {
  const url = lbExportFromDb();
  ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'lbExportFromDb'; }).forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('lbExportFromDb').timeBased().everyDays(1).atHour(4).inTimezone('Europe/Kyiv').create();
  console.log('Щонічну копію увімкнено (~4:00 за Києвом). Таблиця-копія: ' + url);
}

function lbExportUninstall() {
  ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'lbExportFromDb'; }).forEach(function (t) { ScriptApp.deleteTrigger(t); });
  console.log('Щонічну копію вимкнено. Сама таблиця-копія лишилася.');
}
