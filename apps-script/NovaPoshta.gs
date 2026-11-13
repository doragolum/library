/** НП: only known TTNs; never writes E, N or O. Key: Script Properties NP_API_KEY. */
const NP_BOOKS_CONFIG = Object.freeze({id:'1s2Bl96wySGDEgU8BjxIAj1i5HJBPQTu5lMjP3tUaQW0',tab:'Бажанки',headers:['Статус НП','НП: остання перевірка','НП: помилка перевірки','НП: перевірена ТТН']});

function npInstall() {
  npSelfTest();
  const result = npUpdate(); // Real API test must succeed before scheduling.
  if (!result.checked || result.errors) throw new Error('Тригер не створено: потрібна успішна перевірка всіх наявних ТТН. Перегляньте колонку R.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const own = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'npUpdate');
    if (!own.length) ScriptApp.newTrigger('npUpdate').timeBased().everyHours(1).create();
    own.slice(1).forEach(t => ScriptApp.deleteTrigger(t));
  } finally { lock.releaseLock(); }
  console.log('НП: тест пройдено, погодинний тригер увімкнено. Унікальних ТТН: ' + result.checked);
}

function npUpdate() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('НП: інше оновлення ще виконується.');
  try {
    const key = (PropertiesService.getScriptProperties().getProperty('NP_API_KEY') || '').trim();
    if (!key) throw new Error('Додайте NP_API_KEY у Налаштування проєкту → Властивості скрипту. Не вставляйте ключ у код або таблицю.');
    const sh = SpreadsheetApp.openById(NP_BOOKS_CONFIG.id).getSheetByName(NP_BOOKS_CONFIG.tab);
    if (!sh) throw new Error('Вкладку Бажанки не знайдено.');
    const h = sh.getRange(1,1,1,19).getDisplayValues()[0];
    if (h[4] !== 'Статус' || h[13] !== 'Номер замовлення' || h[14] !== 'ТТН') throw new Error('Структура E/N/O змінилася; оновлення зупинено.');
    const out = h.slice(15,19);
    if (out.some((v,i) => v && v !== NP_BOOKS_CONFIG.headers[i])) throw new Error('P:S зайняті іншими колонками. Потрібне узгодження.');
    const count = Math.max(0,sh.getLastRow()-1);
    if (!count) return {checked:0,errors:0};
    // Before claiming output columns, reject any data under a missing header.
    const old = sh.getRange(2,16,count,4).getValues();
    const formulas = sh.getRange(2,16,count,4).getFormulas();
    if (formulas.some(r => r.some(Boolean)) || out.some((v,i) => !v && old.some(r => r[i] !== ''))) throw new Error('P:S містять дані або формули; автоматичний запис зупинено.');
    const source = sh.getRange(2,14,count,2).getDisplayValues();
    const numbers = [...new Set(source.map(r => npNormalize_(r[1])).filter(n => /^\d{14}$/.test(n)))];
    const statuses = new Map();
    for (let i=0;i<numbers.length;i+=100) {
      const batch = numbers.slice(i,i+100);
      const data = npFetch_(key,batch);
      const group = new Map();
      data.forEach(d => { const n=String(d.Number || ''); if(batch.includes(n)) { if(!group.has(n)) group.set(n,[]); group.get(n).push(d); } });
      batch.forEach(n => {
        const matches = group.get(n) || [];
        if (matches.length !== 1 || !String(matches[0].Status || '').trim()) statuses.set(n,{error:'Немає однозначної відповіді API'});
        else statuses.set(n,{status:String(matches[0].Status),code:String(matches[0].StatusCode || '')});
      });
      if(i+100<numbers.length) Utilities.sleep(1100);
    }
    // Abort if rows were sorted, edited or moved during the request.
    if (sh.getLastRow()-1 !== count || JSON.stringify(sh.getRange(2,14,count,2).getDisplayValues()) !== JSON.stringify(source) || JSON.stringify(sh.getRange(1,1,1,19).getDisplayValues()[0]) !== JSON.stringify(h)) throw new Error('Таблиця змінилася під час запиту. Повторіть оновлення.');
    sh.getRange(1,16,1,4).setValues([NP_BOOKS_CONFIG.headers]);
    const stamp = new Date();
    let errors=0;
    source.forEach((r,i) => {
      const n=npNormalize_(r[1]);
      if (!n) { if(old[i].some(v => v !== '')) sh.getRange(i+2,16,1,4).clearContent(); return; }
      const record = statuses.get(n);
      let error = !/^\d{14}$/.test(n) ? 'Потрібна одна ТТН із 14 цифр; виправте O вручну' : record && record.error;
      if (error) {
        errors++;
        const same=String(old[i][3])===n;
        sh.getRange(i+2,16,1,4).setValues([[same?old[i][0]:'',same?old[i][1]:'',error,same?old[i][3]:'']]);
      } else if(record) {
        sh.getRange(i+2,16,1,4).setValues([[npText_(record.status),stamp,'',n]]);
      }
    });
    sh.getRange(2,17,count,1).setNumberFormat('dd.MM.yyyy HH:mm');
    
SpreadsheetApp.flush();


npSyncBooksFromNp_(sh, source, statuses, false);


return {checked:numbers.length,errors:errors};

  } finally { lock.releaseLock(); }
}

function npFetch_(key,numbers) {
  let response;
  for(let attempt=0;attempt<3;attempt++) {
    try {
      response=UrlFetchApp.fetch('https://api.novaposhta.ua/v2.0/json/',{
        method:'post',contentType:'application/json',muteHttpExceptions:true,followRedirects:false,
        payload:JSON.stringify({apiKey:key,modelName:'TrackingDocument',calledMethod:'getStatusDocuments',methodProperties:{Documents:numbers.map(n=>({DocumentNumber:n}))}})
      });
    } catch (_) { throw new Error('НП: мережевий запит не виконано. Попередні статуси збережено.'); }
    const code=response.getResponseCode();
    if(code===200) break;
    if((code===429 || code>=500) && attempt<2) { Utilities.sleep(1000*Math.pow(2,attempt)); continue; }
    throw new Error('НП: HTTP '+code+'. Попередні статуси збережено.');
  }
  let body;
  try { body=JSON.parse(response.getContentText()); } catch (_) { throw new Error('НП: відповідь не є JSON.'); }
  // Never log raw responses, request bodies, credentials or personal details.
  if(body.success !== true || !Array.isArray(body.data)) throw new Error('НП відхилила запит. Перевірте чинність ключа в кабінеті НП. Попередні статуси збережено.');
  return body.data;
}

function npNormalize_(value) { return String(value || '').trim().replace(/\s/g,''); }
function npText_(value) { const s=String(value).slice(0,500); return /^[=+@-]/.test(s) ? "'"+s : s; }

function npSelfTest() {
  if(npNormalize_(' 2045 1573 8189 05 ')!=='20451573818905') throw new Error('Помилка нормалізації');
  if(/^\d{14}$/.test(npNormalize_('20451573818905,20400560859149'))) throw new Error('Неоднозначні ТТН мають відхилятися');
  if(npText_('=IMPORTXML(1)')[0]!=="'") throw new Error('Помилка захисту формул');
  if(new Set(['20451573818905','20451573818905']).size!==1) throw new Error('Помилка дедуплікації');
  console.log('НП: локальні перевірки пройдено.');
}
