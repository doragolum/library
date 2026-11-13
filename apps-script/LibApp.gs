/**
 * «Моя бібліотека» v2 — вебдодаток і Телеграм-міні-додаток для таблиці «Книги».
 *
 * Не змінює ваш код меню та Нової пошти. Усі назви тут починаються з lb / LB_.
 * Для впорядкування таблиці (сортування, нумерація, серії) викликає ваші ж функції
 * sortLibrary, renumberBooks, updateSeriesInfo, syncPublishers, sortWishlist.
 *
 * Властивості скрипту (Налаштування проєкту → Властивості скрипту):
 *   LB_TG_TOKEN    — ключ бота від @BotFather (лише тут, не в коді й не в таблиці);
 *   LB_TG_APP_URL  — посилання розгортання «Будь-хто» (…/exec);
 *   LB_TG_CHAT_ID, LB_TG_USER_ID — заповнюються самі функцією lbTelegramConnect;
 *   LB_WEB_KEY     — ключ особистого посилання для браузера, створює lbBrowserLink.
 *
 * Необов'язкові колонки в «Облік бібліотеки» (додаток знаходить їх за заголовком і вмикає
 * відповідні можливості, лише коли колонка є): ISBN, Обкладинка, Дата покупки, Дата початку,
 * Дата прочитання, Оцінка, Кому позичила, Коли позичила, Повернути до, Посилка з Києва.
 */

var LB_SS_ID = '1s2Bl96wySGDEgU8BjxIAj1i5HJBPQTu5lMjP3tUaQW0';
var LB_SHEETS = { library: 'Облік бібліотеки', wish: 'Бажанки', series: 'Серії', catalog: 'Каталог книг', sold: 'Продані', log: 'Лог' };
var LB_REMIND_HOUR = 9;          // о котрій годині приходять нагадування
var LB_NIGHT_HOUR = 3;           // о котрій годині нічне впорядкування таблиці
var LB_NOT_SENT_DAYS = 5;        // через скільки днів після релізу нагадати «ще не відправили»
var LB_TG_MAX_AGE_SEC = 24 * 3600;

/* ============================================================
 * Колонки, які можна змінювати з додатку
 * type: list — лише значення зі списку таблиці; date; rating; number; text; url; isbn
 * ============================================================ */

var LB_FIELDS = {
  library: { id: ['Автор', 'Назва книги'], fields: {
    status:  { head: ['Статус'], type: 'list', def: ['прочитано', 'не читала', 'читаю', 'закинула'] },
    avail:   { head: ['Наявність'], type: 'list', def: ['бібліотека', 'Київ', 'продана', 'подарована', 'позичена', 'на продаж', 'на розподілення'] },
    shelf:   { head: ['Де шукати'], type: 'list', def: ['Полиця 1', 'Полиця 2', 'Полиця 3', 'Полиця 4', 'Полиця 5', 'Полиця 6', 'Полиця 7', 'Закрита шафа, полиця 2', 'Закрита шафа, полиця 4'] },
    prio:    { head: ['Пріорітет', 'Пріоритет'], type: 'list', def: ['1', '2', '3', '4'] },
    genre:   { head: ['Жанр'], type: 'list', def: [] },
    lang:    { head: ['Мова'], type: 'list', def: ['українська', 'англійська'] },
    genres:  { head: ['Додаткові жанри'], type: 'text' },
    pages:   { head: ['Кількість сторінок'], type: 'number' },
    price:   { head: ['Ціна, грн', 'Ціна'], type: 'number' },
    isbn:    { head: ['ISBN'], type: 'isbn', optional: true },
    cover:   { head: ['Обкладинка'], type: 'url', optional: true },
    bought:  { head: ['Дата покупки'], type: 'date', optional: true },
    started: { head: ['Дата початку'], type: 'date', optional: true },
    readOn:  { head: ['Дата прочитання'], type: 'date', optional: true },
    rating:  { head: ['Оцінка'], type: 'rating', optional: true },
    lentTo:  { head: ['Кому позичила'], type: 'text', optional: true },
    lentOn:  { head: ['Коли позичила'], type: 'date', optional: true },
    lentDue: { head: ['Повернути до'], type: 'date', optional: true },
    parcel:  { head: ['Посилка з Києва'], type: 'list', def: ['в списку', 'в дорозі'], optional: true },
    plan:    { head: ['Планую читати'], type: 'month', optional: true },
    page:    { head: ['Поточна сторінка'], type: 'number', optional: true },
    tropes:  { head: ['Тропи'], type: 'text', optional: true },
    moods:   { head: ['Враження'], type: 'text', optional: true },
    author:  { head: ['Автор'], type: 'text' },
    title:   { head: ['Назва книги'], type: 'text' },
    type:    { head: ['Серія'], type: 'list', def: ['Серія', 'Одиночна'] },
    series:  { head: ['Назва серії'], type: 'list', def: [] },
    num:     { head: ['№ серії'], type: 'number' },
    total:   { head: ['Всього'], type: 'number' },
    pub:     { head: ['Видавництво'], type: 'list', def: [] }
  } },
  wish: { id: ['Автор', 'Назва'], fields: {
    status: { head: ['Статус'], type: 'list', def: ['Хочу купити', 'На майбутнє', 'Докупити серію', 'Замовлено', 'Створено ТТН', 'Відправлено', 'Доставлено', 'В бібліотеці'] },
    avail:  { head: ['Наявність'], type: 'list', def: ['Є у продажу', 'Анонс', 'Передзамовлення', 'Немає у продажу', 'Не видана'] },
    cover:  { head: ['Обкладинка'], type: 'url', optional: true },
    author: { head: ['Автор'], type: 'text' },
    title:  { head: ['Назва'], type: 'text' },
    pub:    { head: ['Видавництво'], type: 'text' },
    release: { head: ['Реліз'], type: 'date' },
    ordered: { head: ['Дата замовлення'], type: 'date', optional: true }
  } }
};
// для сумісності з v1
var LB_EDITABLE = LB_FIELDS;

/* ============================================================
 * Сторінка
 * ============================================================ */

function doGet(e) {
  var tg = !!(e && e.parameter && e.parameter.tg === '1');
  var t = HtmlService.createTemplateFromFile('LibPage');
  t.tg = tg ? '1' : '';
  var out = t.evaluate()
    .setTitle('Моя бібліотека')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1');
  if (tg) out.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return out;
}

/**
 * Запити від сторінки на GitHub Pages: {fn, args, initData, key} → JSON.
 * Дозволені лише функції додатку зі списку нижче; доступ перевіряється так само (особисте посилання або Телеграм).
 */
function doPost(e) {
  var API = { lbApiData: lbApiData, lbApiSetGoals: lbApiSetGoals, lbApiDeleteBook: lbApiDeleteBook, lbApiUpdate: lbApiUpdate,
    lbApiSave: lbApiSave, lbApiAddBook: lbApiAddBook, lbApiDeleteWish: lbApiDeleteWish, lbApiAddWish: lbApiAddWish,
    lbApiOcr: lbApiOcr, lbApiOrder: lbApiOrder, lbApiLookup: lbApiLookup, lbApiCoverUpload: lbApiCoverUpload, lbApiOfficial: lbApiOfficial, lbApiAutoFill: lbApiAutoFill, lbApiAi: lbApiAi, lbApiGenre: lbApiGenre, lbApiShelfMark: lbApiShelfMark, lbApiNews: lbApiNews, lbApiTropes: lbApiTropes };
  var out;
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var fn = API[String(req.fn || '')];
    if (!fn) throw new Error('Невідома дія.');
    out = fn.apply(null, [String(req.initData || ''), String(req.key || '')].concat(Array.isArray(req.args) ? req.args : []));
  } catch (err) {
    out = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function lbRun_(initData, key, fn) {
  try {
    lbAuth_(initData, key);
    return { ok: true, data: fn() };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

/** Єдиний запит сторінки: перевіряє, що це ви, і віддає всі дані одним пакетом. */
function lbApiData(initData, key) { return lbRun_(initData, key, lbReadAll_); }

/* ============================================================
 * Хто відкрив: особисте посилання з ключем або ваш Телеграм (підпис бота)
 * ============================================================ */

function lbAuth_(initData, key) {
  var props = PropertiesService.getScriptProperties();
  var saved = String(props.getProperty('LB_WEB_KEY') || '');
  if (key && saved && lbSame_(String(key), saved)) return 'browser';

  if (!initData) throw new Error('Немає доступу. Відкрийте бібліотеку за своїм особистим посиланням або через кнопку в Телеграм-боті.');
  var allowed = String(props.getProperty('LB_TG_USER_ID') || '');
  if (!allowed) throw new Error('Телеграм ще не підключено. Запустіть lbTelegramConnect у редакторі скрипту.');
  var user = lbTgVerify_(initData);
  if (user.id !== allowed) throw new Error('Цей Телеграм не має доступу до бібліотеки.');
  return 'telegram';
}

function lbSame_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Друкує в журнал ваше особисте посилання для браузера (створює ключ, якщо його ще немає). */
function lbBrowserLink() {
  var props = PropertiesService.getScriptProperties();
  var url = String(props.getProperty('LB_TG_APP_URL') || '').trim();
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) throw new Error('Спершу впишіть у Властивості скрипту LB_TG_APP_URL = посилання розгортання (…/exec).');
  var key = props.getProperty('LB_WEB_KEY');
  if (!key) { key = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); props.setProperty('LB_WEB_KEY', key); }
  var page = String(props.getProperty('LB_PAGE_URL') || '').trim().replace(/[?#].*$/, '');
  if (page) console.log('Ваше посилання для браузера, нова сторінка без смужки Google (збережіть у закладки, нікому не пересилайте):\n' + page + '?k=' + key);
  console.log('Старе посилання (теж працює):\n' + url + '?k=' + key);
}

/** Якщо посилання потрапило комусь іще: створює новий ключ, старе посилання перестає працювати. */
function lbBrowserLinkReset() {
  PropertiesService.getScriptProperties().deleteProperty('LB_WEB_KEY');
  lbBrowserLink();
}

/** Перевірка підпису Телеграму. Повертає {id, name}. */
function lbTgVerify_(initData) {
  var token = lbTgToken_();
  var params = {};
  String(initData || '').split('&').forEach(function (pair) {
    var i = pair.indexOf('=');
    if (i < 1) return;
    var dec = function (v) { try { return decodeURIComponent(v); } catch (err) { return v; } };
    params[dec(pair.slice(0, i))] = dec(pair.slice(i + 1).replace(/\+/g, '%20'));
  });
  var hash = String(params.hash || '').toLowerCase();
  delete params.hash;
  var check = Object.keys(params).sort().map(function (k) { return k + '=' + params[k]; }).join('\n');
  var secret = Utilities.computeHmacSha256Signature(Utilities.newBlob(token).getBytes(), Utilities.newBlob('WebAppData').getBytes());
  var sig = Utilities.computeHmacSha256Signature(Utilities.newBlob(check).getBytes(), secret)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
  if (!hash || sig !== hash) throw new Error('Телеграм не підтвердив, хто ви. Закрийте й відкрийте бібліотеку в боті заново.');
  var age = Math.floor(Date.now() / 1000) - Number(params.auth_date || 0);
  if (!(age < LB_TG_MAX_AGE_SEC)) throw new Error('Сесія застаріла. Закрийте й відкрийте бібліотеку в боті заново.');
  var u = {};
  try { u = JSON.parse(params.user || '{}'); } catch (err) {}
  if (!u.id) throw new Error('Телеграм не передав, хто ви.');
  return { id: String(u.id), name: [u.first_name, u.last_name].filter(Boolean).join(' ') };
}

/* ============================================================
 * Читання таблиці
 * ============================================================ */

function lbSs_() { return SpreadsheetApp.openById(LB_SS_ID); }
function lbTz_() { return Session.getScriptTimeZone(); }
function lbToday_() { return Utilities.formatDate(new Date(), lbTz_(), 'yyyy-MM-dd'); }

function lbKey_(v) { return String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, ' '); }

/** Як normalizeText у вашому скрипті + ґ→г: для порівняння назв і авторів. */
function lbNorm_(v) {
  return String(v == null ? '' : v).toLowerCase().replace(/ґ/g, 'г').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['’`"ʼ«»]/g, '').replace(/[-–—]/g, ' ').replace(/[.,:;!?()[\]{}#№]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Зчитує лист як рядки-тексти + карту «заголовок → номер колонки». */
function lbSheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 1) return { head: {}, rows: [] };
  var values = sh.getRange(1, 1, sh.getLastRow(), Math.max(1, sh.getLastColumn())).getDisplayValues();
  var head = {};
  values[0].forEach(function (h, i) { var k = lbKey_(h); if (k && !(k in head)) head[k] = i; });
  return { head: head, rows: values.slice(1) };
}

/** Повертає функцію, що дістає з рядка значення колонки за одним із заголовків (або ''). */
function lbGetter_(head) {
  return function (row, aliases) {
    for (var i = 0; i < aliases.length; i++) {
      var idx = head[lbKey_(aliases[i])];
      if (idx !== undefined) return String(row[idx] == null ? '' : row[idx]).trim();
    }
    return '';
  };
}

function lbHas_(head, aliases) {
  for (var i = 0; i < aliases.length; i++) if (head[lbKey_(aliases[i])] !== undefined) return true;
  return false;
}

function lbNum_(v) {
  var s = String(v == null ? '' : v).replace(/[\s ₴]|грн/g, '').replace(',', '.');
  if (s === '') return null;
  var n = Number(s);
  return isFinite(n) ? n : null;
}

/** «11.2026», «2026-11», «01.11.2026» → «2026-11». Інакше null. */
function lbMonth_(v) {
  var s = String(v == null ? '' : v).trim().replace(/^'/, '');
  var m = s.match(/^(\d{1,2})[.\/](\d{4})$/);
  if (m) return m[2] + '-' + ('0' + m[1]).slice(-2);
  m = s.match(/^(\d{4})-(\d{2})/);
  if (m) return m[1] + '-' + m[2];
  var d = lbDate_(s);
  return d ? d.slice(0, 7) : null;
}

/** Мета читання: {month: книг на місяць, year: книг на рік}. Зберігається у властивостях скрипту. */
function lbGoals_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('LB_GOALS') || '{}'); } catch (e) { return {}; }
}
/** Позначки полиць: «є місце» / «повна» / «лише для …». Зберігаються у властивостях скрипта, таблицю не змінюють. */
function lbShelfMarks_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('LB_SHELF_MARKS') || '{}'); } catch (e) { return {}; }
}
function lbApiShelfMark(initData, key, req) {
  return lbRun_(initData, key, function () {
    req = req || {};
    var sh = String(req.shelf || '').trim().slice(0, 80);
    if (!sh) throw new Error('Немає полиці.');
    var m = lbShelfMarks_();
    if (!req.k || req.k === 'none') delete m[sh];
    else if (['open', 'full', 'only'].indexOf(req.k) !== -1) m[sh] = { k: req.k, note: String(req.note || '').slice(0, 60) };
    PropertiesService.getScriptProperties().setProperty('LB_SHELF_MARKS', JSON.stringify(m));
    return m;
  });
}
function lbApiSetGoals(initData, key, g) {
  return lbRun_(initData, key, function () {
    var out = {};
    ['month', 'year'].forEach(function (k) { var n = Math.round(Number(g && g[k])); if (n > 0 && n < 1000) out[k] = n; });
    PropertiesService.getScriptProperties().setProperty('LB_GOALS', JSON.stringify(out));
    return out;
  });
}

/** Видаляє книгу з бібліотеки (рядок зникає, у Лозі лишається запис з усіма даними). */
function lbApiDeleteBook(initData, key, req) {
  return lbRun_(initData, key, function () {
    var ss = lbSs_();
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) throw new Error('Таблиця зараз оновлюється. Спробуйте за хвилину.');
    try {
      var c = lbSheetCache_(ss, {}, 'library');
      var idx = lbFindRow_(c, LB_FIELDS.library, req.author, req.title, req.row);
      var snapshot = c.vals[idx].filter(function (v) { return String(v).trim(); }).join(' | ').slice(0, 1000);
      c.sh.deleteRow(idx + 2);
      SpreadsheetApp.flush();
      lbLog_('🗑 Видалено з бібліотеки', req.title, req.author, snapshot);
      return { row: idx + 2 };
    } finally { lock.releaseLock(); }
  });
}

/** «01.12.2026», «2026-12-01» або число-дата таблиці → «2026-12-01». Інакше null. */
function lbDate_(v) {
  var s = String(v == null ? '' : v).trim();
  var m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  if (/^\d{5}$/.test(s)) {
    var d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000);
    return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
  }
  return null;
}

function lbReadAll_() {
  var ss = lbSs_();
  var F = LB_FIELDS.library.fields;

  var L = lbSheet_(ss, LB_SHEETS.library), g = lbGetter_(L.head);
  var books = L.rows.map(function (r, i) {
    return {
      row: i + 2,
      n: g(r, ['№', 'Столбец 1']),
      author: g(r, ['Автор']),
      type: g(r, ['Серія']),
      series: g(r, ['Назва серії']),
      title: g(r, ['Назва книги']),
      pub: g(r, ['Видавництво']),
      num: g(r, ['№ серії']),
      total: g(r, ['Всього']),
      genre: g(r, ['Жанр']),
      genres: g(r, ['Додаткові жанри']),
      pages: lbNum_(g(r, ['Кількість сторінок'])),
      lang: g(r, ['Мова']),
      status: g(r, ['Статус']),
      finished: g(r, ['Завершена?']),
      translated: g(r, ['Повний переклад укр']),
      avail: g(r, ['Наявність']),
      shelf: g(r, ['Де шукати']),
      prio: g(r, F.prio.head),
      price: lbNum_(g(r, F.price.head)),
      isbn: g(r, F.isbn.head).replace(/[^0-9Xx]/g, ''),
      cover: g(r, F.cover.head),
      bought: lbDate_(g(r, F.bought.head)),
      started: lbDate_(g(r, F.started.head)),
      readOn: lbDate_(g(r, F.readOn.head)),
      rating: lbNum_(g(r, F.rating.head)),
      lentTo: g(r, F.lentTo.head),
      lentOn: lbDate_(g(r, F.lentOn.head)),
      lentDue: lbDate_(g(r, F.lentDue.head)),
      parcel: g(r, F.parcel.head),
      plan: lbMonth_(g(r, F.plan.head)),
      page: lbNum_(g(r, F.page.head)),
      tropes: g(r, F.tropes.head),
      moods: g(r, F.moods.head)
    };
  }).filter(function (b) { return b.title || b.author; });

  var W = lbSheet_(ss, LB_SHEETS.wish), gw = lbGetter_(W.head);
  var wish = W.rows.map(function (r, i) {
    var rel = gw(r, ['Реліз']);
    return {
      row: i + 2,
      author: gw(r, ['Автор']),
      series: gw(r, ['Назва серії']),
      title: gw(r, ['Назва']),
      price: lbNum_(gw(r, ['Ціна'])),
      status: gw(r, ['Статус']),
      pub: gw(r, ['Видавництво']),
      isSeries: gw(r, ['Серія']),
      avail: gw(r, ['Наявність']),
      part: gw(r, ['Яка частина']),
      total: gw(r, ['Всього книг']),
      release: lbDate_(rel),
      releaseText: rel,
      where: gw(r, ['Де замовлено']),
      site: gw(r, ['Сайт']),
      order: gw(r, ['Номер замовлення']),
      ttn: gw(r, ['ТТН']).replace(/\s/g, ''),
      np: gw(r, ['Статус НП']),
      npCheck: gw(r, ['НП: остання перевірка']),
      npErr: gw(r, ['НП: помилка перевірки']),
      cover: gw(r, ['Обкладинка']),
      ordered: lbDate_(gw(r, ['Дата замовлення']))
    };
  }).filter(function (w) { return w.title || w.author; });

  var S = lbSheet_(ss, LB_SHEETS.series), gs = lbGetter_(S.head);
  var series = S.rows.map(function (r) {
    return { author: gs(r, ['Автор']), name: gs(r, ['Назва серії']), total: lbNum_(gs(r, ['Основних томів'])),
      finished: gs(r, ['Завершена']), translated: gs(r, ['Повний переклад укр']), pub: gs(r, ['Видавництво']) };
  }).filter(function (s) { return s.name && s.name !== '-'; });

  var C = lbSheet_(ss, LB_SHEETS.catalog), gc = lbGetter_(C.head);
  var catalog = C.rows.map(function (r) {
    return { author: gc(r, ['Автор']), series: gc(r, ['Серія']), num: gc(r, ['№ у серії']),
      title: gc(r, ['Назва книги']), pub: gc(r, ['Видавництво']), type: gc(r, ['Тип']) };
  }).filter(function (c) { return c.series; });

  var P = lbSheet_(ss, LB_SHEETS.sold), gp = lbGetter_(P.head);
  var sold = P.rows.map(function (r) {
    return { author: gp(r, ['Автор']), series: gp(r, ['Назва серії']), title: gp(r, ['Назва книги']),
      num: gp(r, ['№ серії']), status: gp(r, ['Статус']), price: lbNum_(gp(r, ['Ціна продажу'])), date: lbDate_(gp(r, ['Дата продажу'])) };
  }).filter(function (s) { return s.title || s.author; });

  var log = [];
  var logSh = ss.getSheetByName(LB_SHEETS.log);
  if (logSh && logSh.getLastRow() > 0) {
    var last = logSh.getLastRow(), from = Math.max(1, last - 29);
    log = logSh.getRange(from, 1, last - from + 1, Math.min(5, logSh.getLastColumn())).getDisplayValues()
      .filter(function (r) { return r.join('').trim(); }).reverse();
  }

  // які необов'язкові колонки є в таблиці
  var cols = {};
  Object.keys(F).forEach(function (f) { if (F[f].optional) cols[f] = lbHas_(L.head, F[f].head); });
  cols.wishCover = lbHas_(W.head, ['Обкладинка']);
  cols.wishOrdered = lbHas_(W.head, ['Дата замовлення']);

  return {
    today: lbToday_(),
    hasBought: !!cols.bought,
    hasSale: P.head[lbKey_('Ціна продажу')] !== undefined,
    cols: cols,
    options: lbOptions_(ss),
    goals: lbGoals_(),
    shelfMarks: lbShelfMarks_(),
    news: lbNewsGet_().items,
    pubCanon: LB_PUBLISHERS,
    books: books, wish: wish, series: series, catalog: catalog, sold: sold, log: log
  };
}

/** Списки значень для полів-списків: з випадаючого списку таблиці, інакше стандартні. */
function lbOptions_(ss) {
  var out = {};
  Object.keys(LB_FIELDS).forEach(function (kind) {
    var cfg = LB_FIELDS[kind];
    var sh = ss.getSheetByName(LB_SHEETS[kind]);
    out[kind] = {};
    if (!sh) return;
    var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0].map(lbKey_);
    Object.keys(cfg.fields).forEach(function (f) {
      var fd = cfg.fields[f];
      if (fd.type !== 'list') return;
      var col = lbCol_(head, fd.head) + 1;
      var list = null;
      if (col > 0 && sh.getLastRow() > 1) {
        try {
          var rules = sh.getRange(2, col, Math.min(20, sh.getLastRow() - 1), 1).getDataValidations();
          for (var i = 0; i < rules.length && !list; i++) {
            var r = rules[i][0];
            if (r && r.getCriteriaType() === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) list = r.getCriteriaValues()[0].map(String);
          }
        } catch (err) {}
      }
      if (!list && f === 'genre') {
        // без випадаючого списку — беремо жанри, які вже є в таблиці
        var c = col - 1, seen = {};
        list = [];
        if (c >= 0 && sh.getLastRow() > 1) sh.getRange(2, col, sh.getLastRow() - 1, 1).getDisplayValues().forEach(function (r) {
          var v = String(r[0]).trim(); if (v && !seen[v]) { seen[v] = 1; list.push(v); }
        });
        list.sort();
      }
      out[kind][f] = (list && list.length ? list : fd.def).filter(function (v) { return v !== ''; });
    });
  });
  return out;
}

function lbCol_(headKeys, aliases) {
  for (var i = 0; i < aliases.length; i++) {
    var k = headKeys.indexOf(lbKey_(aliases[i]));
    if (k !== -1) return k;
  }
  return -1;
}

/* ============================================================
 * Зміни з додатку
 * ============================================================ */

/** v1: змінює одне поле. */
function lbApiUpdate(initData, key, change) {
  var set = {};
  set[change && change.field] = change ? change.value : '';
  var res = lbApiSave(initData, key, [{ kind: change.kind, row: change.row, author: change.author, title: change.title, set: set }]);
  if (res.ok) res.data = { row: res.data[0].row, value: res.data[0].values[change.field] };
  return res;
}

/**
 * Змінює кілька полів кількох книг за один раз.
 * changes = [{kind:'library'|'wish', row, author, title, set:{field:value,…}}]
 * Рядок шукається заново за автором і назвою (таблицю могли відсортувати).
 */
function lbApiSave(initData, key, changes) {
  return lbRun_(initData, key, function () {
    if (!changes || !changes.length) throw new Error('Немає що зберігати.');
    if (changes.length > 60) throw new Error('Забагато книг за раз (до 60).');
    var ss = lbSs_();
    var options = lbOptions_(ss);
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) throw new Error('Таблиця зараз оновлюється (можливо, Нова пошта). Спробуйте за хвилину.');
    try {
      var cache = {};
      var out = changes.map(function (ch) { return lbSaveOne_(ss, options, cache, ch); });
      SpreadsheetApp.flush();
      return out;
    } finally { lock.releaseLock(); }
  });
}

function lbSheetCache_(ss, cache, kind) {
  if (cache[kind]) return cache[kind];
  var sh = ss.getSheetByName(LB_SHEETS[kind]);
  if (!sh) throw new Error('Не знайдено лист «' + LB_SHEETS[kind] + '».');
  var lastCol = sh.getLastColumn();
  var head = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(lbKey_);
  var vals = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, lastCol).getDisplayValues() : [];
  cache[kind] = { sh: sh, head: head, vals: vals };
  return cache[kind];
}

function lbFindRow_(c, cfg, author, title, rowHint) {
  var cA = lbCol_(c.head, [cfg.id[0]]), cT = lbCol_(c.head, [cfg.id[1]]);
  if (cA < 0 || cT < 0) throw new Error('Не знайшла колонки «' + cfg.id.join('» / «') + '».');
  var same = function (r) { return r && lbKey_(r[cA]) === lbKey_(author) && lbKey_(r[cT]) === lbKey_(title); };
  var idx = rowHint && same(c.vals[Number(rowHint) - 2]) ? Number(rowHint) - 2 : -1;
  if (idx >= 0) return idx;
  var hits = [];
  c.vals.forEach(function (r, i) { if (same(r)) hits.push(i); });
  if (hits.length !== 1) throw new Error(hits.length ? 'Знайшла кілька однакових книг «' + title + '». Змініть у таблиці.' : 'Книгу «' + title + '» не знайдено: можливо, її перенесли або видалили. Оновіть сторінку.');
  return hits[0];
}

/** Перевіряє значення за типом поля. Повертає {cell: що писати, show: як показати}. */
function lbClean_(kind, f, fd, value, options) {
  var v = String(value == null ? '' : value).trim();
  if (v === '') return { cell: '', show: '' };
  switch (fd.type) {
    case 'list':
      var allowed = (options[kind] && options[kind][f]) || fd.def || [];
      // видавництво — вільне поле: довідник сам приводить назву до правильної
      if (allowed.length && allowed.indexOf(v) === -1 && f !== 'pub') throw new Error('«' + v + '» немає у списку для «' + fd.head[0] + '».');
      return { cell: v, show: v };
    case 'date':
      var iso = lbDate_(v);
      if (!iso) throw new Error('Дата має бути у вигляді 31.12.2026.');
      var p = iso.split('-');
      return { cell: new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12), show: iso, date: true };
    case 'month':
      var mo = lbMonth_(v);
      if (!mo) throw new Error('Місяць має бути у вигляді 11.2026.');
      return { cell: "'" + mo.slice(5, 7) + '.' + mo.slice(0, 4), show: mo };
    case 'rating':
      var r = Number(v.replace(',', '.'));
      if (!(r >= 1 && r <= 5) || Math.round(r * 2) !== r * 2) throw new Error('Оцінка: від 1 до 5 (можна з половинкою).');
      return { cell: r, show: r };
    case 'number':
      var n = lbNum_(v);
      if (n == null || n < 0 || n > 100000) throw new Error('«' + fd.head[0] + '»: потрібне число.');
      return { cell: n, show: n };
    case 'isbn':
      var d = v.replace(/[^0-9Xx]/g, '').toUpperCase();
      if (!(d.length === 10 || d.length === 13)) throw new Error('ISBN має 10 або 13 цифр.');
      return { cell: "'" + d, show: d };
    case 'url':
      if (!/^https:\/\/[^\s"'<>]+$/.test(v) || v.length > 500) throw new Error('Обкладинка: потрібне посилання https://…');
      return { cell: v, show: v };
    default:
      if (v.length > 200) v = v.slice(0, 200);
      return { cell: /^[=+@-]/.test(v) ? "'" + v : v, show: v };
  }
}

function lbSaveOne_(ss, options, cache, ch) {
  var cfg = LB_FIELDS[ch && ch.kind];
  if (!cfg) throw new Error('Невідомий лист.');
  var c = lbSheetCache_(ss, cache, ch.kind);
  var idx = lbFindRow_(c, cfg, ch.author, ch.title, ch.row);
  var values = {}, notes = [];
  Object.keys(ch.set || {}).forEach(function (f) {
    var fd = cfg.fields[f];
    if (!fd) throw new Error('Поле «' + f + '» не можна змінювати з додатку.');
    var col = lbCol_(c.head, fd.head);
    if (col < 0) throw new Error('У таблиці немає колонки «' + fd.head[0] + '». Її треба додати, щоб це працювало.');
    var clean = lbClean_(ch.kind, f, fd, f === 'pub' ? lbPubCanon_(ch.set[f]) : ch.set[f], options);
    var old = c.vals[idx][col];
    var range = c.sh.getRange(idx + 2, col + 1);
    range.setValue(clean.cell);
    if (clean.date) range.setNumberFormat('dd.mm.yyyy');
    c.vals[idx][col] = String(clean.show);
    values[f] = clean.show;
    var shown = clean.date ? lbHuman_(clean.show) : clean.show;
    if (f !== 'cover' && String(old) !== String(shown)) notes.push(fd.head[0] + ': ' + (old || '—') + ' → ' + (shown === '' ? '—' : shown));
  });
  // статус став «Замовлено» → дата замовлення (якщо колонка є і дата ще порожня)
  if (ch.kind === 'wish' && values.status === 'Замовлено' && !('ordered' in values)) {
    var oc = lbCol_(c.head, ['Дата замовлення']);
    if (oc >= 0 && !String(c.vals[idx][oc]).trim()) {
      var today = lbToday_(), tp = today.split('-');
      c.sh.getRange(idx + 2, oc + 1).setValue(new Date(Number(tp[0]), Number(tp[1]) - 1, Number(tp[2]), 12)).setNumberFormat('dd.mm.yyyy');
      c.vals[idx][oc] = today; values.ordered = today;
      notes.push('Дата замовлення: ' + lbHuman_(today));
    }
  }
  if (notes.length) lbLog_('✏️ Змінено в додатку', ch.title, ch.author, notes.join('; '));
  return { row: idx + 2, values: values };
}

function lbLog_(action, book, author, details) {
  if (typeof addLog === 'function') { try { addLog(action, book || '', author || '', details || ''); return; } catch (err) {} }
  var sh = lbSs_().getSheetByName(LB_SHEETS.log);
  if (sh) sh.appendRow([new Date(), action, book || '', author || '', details || '']);
}

/* ============================================================
 * Додати книгу в бібліотеку (з бажанок, після «Отримала» або вручну / зі скану)
 * ============================================================ */

/**
 * req = { book:{author,title,type,series,num,total,pub,genre,genres,pages,lang,price,status,avail,shelf,prio,isbn,cover,bought},
 *         wish:{row,author,title}|null, removeWish:true|false }
 */
function lbApiAddBook(initData, key, req) {
  return lbRun_(initData, key, function () {
    var b = (req && req.book) || {};
    ['author', 'title'].forEach(function (f) { if (!String(b[f] || '').trim()) throw new Error('Заповніть автора і назву.'); });
    var ss = lbSs_();
    var options = lbOptions_(ss);
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) throw new Error('Таблиця зараз оновлюється (можливо, Нова пошта). Спробуйте за хвилину.');
    try {
      var lib = ss.getSheetByName(LB_SHEETS.library);
      var lastCol = lib.getLastColumn();
      var head = lib.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(lbKey_);
      var vals = lib.getLastRow() > 1 ? lib.getRange(2, 1, lib.getLastRow() - 1, lastCol).getDisplayValues() : [];
      var cA = lbCol_(head, ['Автор']), cT = lbCol_(head, ['Назва книги']), cP = lbCol_(head, ['Видавництво']), cS = lbCol_(head, ['Назва серії']);

      // дублікат: той самий автор + назва + серія (+ видавництво, якщо вказане)
      var dup = -1;
      vals.forEach(function (r, i) {
        if (lbNorm_(r[cA]) === lbNorm_(b.author) && lbNorm_(r[cT]) === lbNorm_(b.title) &&
            lbNorm_(r[cS]) === lbNorm_(b.series || '') && (!b.pub || lbNorm_(r[cP]) === lbNorm_(b.pub))) dup = i;
      });
      if (dup >= 0 && !req.force) return { duplicate: true, row: dup + 2 };

      var row = [];
      for (var i = 0; i < lastCol; i++) row.push('');
      var put = function (aliases, value) { var c = lbCol_(head, aliases); if (c >= 0 && value !== '' && value != null) row[c] = value; };
      var isSeries = b.type === 'Серія';
      put(['Автор'], String(b.author).trim());
      put(['Назва книги'], String(b.title).trim());
      put(['Серія'], isSeries ? 'Серія' : 'Одиночна');
      put(['Назва серії'], String(b.series || (isSeries ? '' : '-')).trim());
      put(['№ серії'], isSeries ? lbNum_(b.num) : '');
      put(['Всього'], isSeries ? lbNum_(b.total) : '');
      put(['Видавництво'], lbPubCanon_(b.pub));
      put(['Статус'], b.status || 'не читала');

      // поля з перевіркою
      var F = LB_FIELDS.library.fields;
      ['genre', 'lang', 'genres', 'pages', 'price', 'avail', 'shelf', 'prio', 'isbn', 'cover', 'bought', 'status', 'plan'].forEach(function (f) {
        if (b[f] === '' || b[f] == null) return;
        var c = lbCol_(head, F[f].head);
        if (c < 0) return; // немає колонки — пропускаємо
        row[c] = lbClean_('library', f, F[f], b[f], options).cell;
      });

      lib.appendRow(row);
      var newRow = lib.getLastRow();
      ['bought'].forEach(function (f) { var c = lbCol_(head, F[f].head); if (c >= 0 && row[c]) lib.getRange(newRow, c + 1).setNumberFormat('dd.mm.yyyy'); });
      lbLog_('➕ Додано з додатку', b.title, b.author, [b.avail, b.shelf, b.prio ? 'пріоритет ' + b.prio : ''].filter(Boolean).join(', '));

      // бажанка: прибрати або позначити «В бібліотеці»
      var wishNote = '';
      if (req.wish && req.wish.title) {
        var cache = {};
        var wc = lbSheetCache_(ss, cache, 'wish');
        try {
          var wi = lbFindRow_(wc, LB_FIELDS.wish, req.wish.author, req.wish.title, req.wish.row);
          if (req.removeWish) { wc.sh.deleteRow(wi + 2); wishNote = 'removed'; }
          else { var sc = lbCol_(wc.head, ['Статус']); if (sc >= 0) wc.sh.getRange(wi + 2, sc + 1).setValue('В бібліотеці'); wishNote = 'marked'; }
        } catch (err) { wishNote = 'not-found'; }
      }

      // нова серія → додати в «Серії», щоб ваш updateSeriesInfo не питав
      if (isSeries && b.series) lbEnsureSeries_(ss, b);

      var note = lbTidy_(ss);
      SpreadsheetApp.flush();
      return { row: lbFindBookRow_(ss, b.author, b.title), wish: wishNote, tidy: note };
    } finally { lock.releaseLock(); }
  });
}

/** Видаляє рядок із бажанок (дубль або більше не хочу). req = {row, author, title, reason} */
function lbApiDeleteWish(initData, key, req) {
  return lbRun_(initData, key, function () {
    var ss = lbSs_();
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) throw new Error('Таблиця зараз оновлюється (можливо, Нова пошта). Спробуйте за хвилину.');
    try {
      var c = lbSheetCache_(ss, {}, 'wish');
      var idx = lbFindRow_(c, LB_FIELDS.wish, req.author, req.title, req.row);
      c.sh.deleteRow(idx + 2);
      SpreadsheetApp.flush();
      lbLog_('🗑 Видалено з бажанок', req.title, req.author, String(req.reason || '').slice(0, 100));
      return { row: idx + 2 };
    } finally { lock.releaseLock(); }
  });
}

/**
 * Додає книгу в бажанки (наприклад, наступний том серії). req = {author, series, title, part, total, pub, status}
 */
function lbApiAddWish(initData, key, req) {
  return lbRun_(initData, key, function () {
    req = req || {};
    if (!String(req.title || '').trim() || !String(req.author || '').trim()) throw new Error('Потрібні автор і назва.');
    var ss = lbSs_();
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) throw new Error('Таблиця зараз оновлюється. Спробуйте за хвилину.');
    try {
      var sh = ss.getSheetByName(LB_SHEETS.wish);
      var lastCol = sh.getLastColumn();
      var head = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(lbKey_);
      var vals = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, lastCol).getDisplayValues() : [];
      var cA = lbCol_(head, ['Автор']), cT = lbCol_(head, ['Назва']), cS = lbCol_(head, ['Назва серії']), cN = lbCol_(head, ['Яка частина']);
      var dup = -1;
      vals.forEach(function (r, i) {
        if (lbNorm_(r[cA]) === lbNorm_(req.author) && (lbNorm_(r[cT]) === lbNorm_(req.title) ||
            (req.series && cS >= 0 && cN >= 0 && lbNorm_(r[cS]) === lbNorm_(req.series) && String(r[cN]).replace(',', '.') === String(req.part).replace(',', '.')))) dup = i;
      });
      if (dup >= 0) return { duplicate: true, row: dup + 2 };
      var row = head.map(function () { return ''; });
      var put = function (h, v) { var c = lbCol_(head, [h]); if (c >= 0 && v !== '' && v != null) row[c] = v; };
      put('Автор', String(req.author).trim());
      put('Назва серії', String(req.series || '').trim());
      put('Назва', String(req.title).trim());
      put('Статус', req.status || (req.series ? 'Докупити серію' : 'Хочу купити'));
      put('Видавництво', lbPubCanon_(req.pub));
      put('Серія', req.series ? 'Так' : 'Ні');
      put('Яка частина', req.part === '' || req.part == null ? '' : lbNum_(req.part));
      put('Всього книг', req.total === '' || req.total == null ? '' : lbNum_(req.total));
      sh.appendRow(row);
      lbLog_('🛒 Додано в бажанки з додатку', req.title, req.author, req.series ? req.series + (req.part ? ' #' + req.part : '') : '');
      if (typeof sortWishlist === 'function') { try { sortWishlist(); } catch (err) {} }
      SpreadsheetApp.flush();
      return { ok: true };
    } finally { lock.releaseLock(); }
  });
}

/* ============================================================
 * Замовлення зі скриншота або тексту
 * ============================================================ */

/**
 * Розпізнає текст на скриншоті (сторінка замовлення, чек). req = {data: base64, mime}
 * Google Drive сам розпізнає текст (OCR): створює тимчасовий документ, бере з нього текст і одразу видаляє.
 */
function lbApiOcr(initData, key, req) {
  return lbRun_(initData, key, function () {
    req = req || {};
    if (!req.data) throw new Error('Немає картинки.');
    var mime = String(req.mime || 'image/jpeg');
    var bytes = Utilities.base64Decode(String(req.data));
    if (bytes.length > 8 * 1024 * 1024) throw new Error('Картинка завелика.');
    var token = ScriptApp.getOAuthToken();
    var boundary = 'lbocr' + Date.now();
    var meta = JSON.stringify({ name: 'lb-ocr-' + Date.now(), mimeType: 'application/vnd.google-apps.document' });
    var head = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta + '\r\n--' + boundary + '\r\nContent-Type: ' + mime + '\r\n\r\n';
    var tail = '\r\n--' + boundary + '--';
    var payload = Utilities.newBlob(head).getBytes().concat(bytes).concat(Utilities.newBlob(tail).getBytes());
    var up = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&ocrLanguage=uk&fields=id', {
      method: 'post', contentType: 'multipart/related; boundary=' + boundary, payload: payload,
      headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true
    });
    if (up.getResponseCode() !== 200) throw new Error('Не вдалося розпізнати картинку (' + up.getResponseCode() + '). Спробуйте вставити текст.');
    var id = JSON.parse(up.getContentText()).id;
    try {
      var ex = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + id + '/export?mimeType=text/plain', {
        headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true
      });
      return { text: ex.getResponseCode() === 200 ? ex.getContentText('UTF-8').replace(/^﻿/, '') : '' };
    } finally {
      UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + id, { method: 'delete', headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
    }
  });
}
/**
 * Gemini: читає скриншот анонсу / сторінки книги і повертає книги як JSON.
 * Ключ — властивість скрипта GEMINI_API_KEY (вона вставляється вручну, у код не потрапляє).
 * Модель можна змінити властивістю GEMINI_MODEL. Без ключа повертає {nokey:true} — тоді додаток бере звичайне розпізнавання.
 * req = {images: [base64 jpeg], text}
 */
function lbGemini_(parts, prompt) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('GEMINI_API_KEY');
  if (!key) return null;
  var models = lbGeminiModels_();
  var body = { contents: [{ role: 'user', parts: [{ text: prompt }].concat(parts) }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' } };
  var lastErr = '';
  for (var i = 0; i < models.length; i++) {
    var r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(models[i]) + ':generateContent', {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(body),
      headers: { 'x-goog-api-key': key }, muteHttpExceptions: true
    });
    var code = r.getResponseCode();
    if (code === 200) {
      var j = JSON.parse(r.getContentText());
      var t = (((j.candidates || [])[0] || {}).content || {}).parts || [];
      var txt = t.map(function (p) { return p.text || ''; }).join('').replace(/^```(?:json)?\s*|\s*```$/g, '');
      try { return JSON.parse(txt); } catch (e) { throw new Error('Gemini відповів незрозуміло. Спробуйте ще раз.'); }
    }
    lastErr = code + ' ' + r.getContentText().slice(0, 200);
    if ([404, 429, 500, 503].indexOf(code) === -1) break; // інша модель може бути доступна
  }
  if (/^(401|403)/.test(lastErr)) throw new Error('Gemini не прийняв ключ. Перевірте GEMINI_API_KEY у властивостях скрипта.');
  if (/^429/.test(lastErr)) throw new Error('Ліміт Gemini на зараз вичерпано. Спробуйте за хвилину.');
  throw new Error('Gemini недоступний (' + lastErr.slice(0, 60) + ').');
}
function lbApiAi(initData, key, req) {
  return lbRun_(initData, key, function () {
    req = req || {};
    var parts = [];
    (req.images || []).slice(0, 4).forEach(function (b64) { parts.push({ inline_data: { mime_type: 'image/jpeg', data: String(b64) } }); });
    if (req.text) parts.push({ text: 'Текст від користувачки:\n' + String(req.text).slice(0, 6000) });
    if (!parts.length) throw new Error('Немає скриншота чи тексту.');
    return lbAiBooks_(parts);
  });
}
/**
 * Жанри для книги: Gemini обирає ЛИШЕ з вашого списку жанрів (основний + до 3 додаткових).
 * req = {title, author, series, description, list: [ваші жанри]}
 */
function lbApiGenre(initData, key, req) {
  return lbRun_(initData, key, function () {
    req = req || {};
    var list = (req.list || []).map(String).filter(Boolean).slice(0, 80);
    if (!list.length || !req.title) return {};
    var desc = String(req.description || '');
    if (!desc) {
      try { var y = lbFromBook_(req.isbn || '', req.title, req.author || '', req.pub || ''); if (y && y.attrs) desc = Object.keys(y.attrs).map(function (k) { return k + ': ' + y.attrs[k]; }).join('; '); } catch (e) {}
    }
    var prompt = 'Визнач жанри книги для особистого обліку. Обирай ЛИШЕ з цього списку (пиши точно як у списку): ' + JSON.stringify(list) + '. ' +
      'Поверни JSON {"genre":"основний жанр","genres":["до 3 додаткових"]}. Якщо не впевнена — {"genre":"","genres":[]}.\n' +
      'Книга: «' + String(req.title) + '»' + (req.author ? ', автор ' + req.author : '') + (req.series ? ', серія «' + req.series + '»' : '') + '.' + (desc ? '\nОпис: ' + desc.slice(0, 2500) : '');
    var r = lbGemini_([], prompt);
    if (!r) return { nokey: true };
    var ok = function (x) { return list.indexOf(String(x)) !== -1; };
    var main = ok(r.genre) ? String(r.genre) : '';
    var extra = (Array.isArray(r.genres) ? r.genres : []).map(String).filter(function (x) { return ok(x) && x !== main; }).slice(0, 3);
    return { genre: main, genres: extra };
  });
}
function LB_AI_PROMPT_() {
    return 'Ти допомагаєш вести облік книжок українською. На скриншоті(ах) або в тексті — анонс, сторінка книги чи список книг українського видавництва або книгарні. ' +
      'Знайди КОЖНУ книгу і поверни JSON {"items":[{"title":"","author":"","series":"","part":"","total":"","pub":"","price":null,"release":"","avail":"","isbn":""}]}. ' +
      'title — назва книги українською без номера тому і без назви серії; author — автор українською, як на обкладинці (Ім\'я Прізвище); series — назва циклу, якщо книга з серії; part — номер тому; ' +
      'total — скільки всього томів у серії, якщо відомо; pub — видавництво; price — ціна в гривнях числом (якщо є знижка — кінцева ціна); ' +
      'release — дата виходу у форматі YYYY-MM-DD або YYYY-MM, якщо вказана (поточний рік ' + new Date().getFullYear() + '); ' +
      'avail — одне з: "Передзамовлення", "Є у продажу", "Анонс" або ""; isbn — лише цифри. Чого не видно — залиш порожнім, нічого не вигадуй.';
}
function lbAiBooks_(parts) {
    var prompt = LB_AI_PROMPT_();
    var res = lbGemini_(parts, prompt);
    if (!res) return { nokey: true };
    var items = (res.items || res || []);
    if (!Array.isArray(items)) items = [];
    items = items.filter(function (x) { return x && x.title; }).slice(0, 30);
    items.forEach(function (x) { if (x.pub) x.pub = lbPubCanon_(x.pub); });
    return { items: items };
}

/**
 * Фото обкладинки з телефону: зберігає картинку в папку «Моя бібліотека — обкладинки» на вашому Диску
 * (доступ «усі, хто має посилання», лише перегляд, щоб картинка показувалась у додатку) і повертає посилання.
 * req = {data: base64 jpeg, title}
 */
function lbApiCoverUpload(initData, key, req) {
  return lbRun_(initData, key, function () {
    req = req || {};
    if (!req.data) throw new Error('Немає картинки.');
    var bytes = Utilities.base64Decode(String(req.data));
    if (bytes.length > 5 * 1024 * 1024) throw new Error('Картинка завелика.');
    var props = PropertiesService.getScriptProperties();
    var folder = null, fid = props.getProperty('LB_COVER_FOLDER');
    if (fid) { try { folder = DriveApp.getFolderById(fid); if (folder.isTrashed()) folder = null; } catch (e) { folder = null; } }
    if (!folder) { folder = DriveApp.createFolder('Моя бібліотека — обкладинки'); props.setProperty('LB_COVER_FOLDER', folder.getId()); }
    var name = String(req.title || 'обкладинка').replace(/[\\/:*?"<>|]/g, ' ').slice(0, 80) + '.jpg';
    var file = folder.createFile(Utilities.newBlob(bytes, 'image/jpeg', name));
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
    catch (e) { throw new Error('Фото збережено на Диску, але Google не дозволив відкрити його за посиланням: ' + (e && e.message ? e.message : e)); }
    return { url: 'https://lh3.googleusercontent.com/d/' + file.getId() + '=w600' };
  });
}

/** Запустіть один раз після оновлення: Google попросить дозвіл на Диск (потрібен для розпізнавання скриншотів). Нічого не змінює. */
function lbAllowDrive() { DriveApp.getRootFolder(); Logger.log('Дозвіл на Диск є ✓ Тепер скриншоти замовлень розпізнаються.'); }

/**
 * Зберігає замовлення в бажанки. Книги, які вже є в бажанках, оновлює; нових додає.
 * req = { where, site, num, avail, items:[{row, author, title, series, part, total, pub, price, release:'YYYY-MM-DD'|'YYYY-MM'}] }
 */
function lbApiOrder(initData, key, req) {
  return lbRun_(initData, key, function () { return lbOrderSave_(req); });
}
function lbOrderSave_(req) {
  {
    req = req || {};
    var items = (req.items || []).filter(function (x) { return x && String(x.title || '').trim(); });
    if (!items.length) throw new Error('Немає жодної книги в замовленні.');
    items.forEach(function (x) { if (!String(x.author || '').trim()) throw new Error('Вкажіть автора для «' + x.title + '».'); });
    var ss = lbSs_();
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) throw new Error('Таблиця зараз оновлюється. Спробуйте за хвилину.');
    try {
      var sh = ss.getSheetByName(LB_SHEETS.wish);
      var lastCol = sh.getLastColumn();
      var head = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(lbKey_);
      var n = Math.max(sh.getLastRow() - 1, 0);
      var vals = n ? sh.getRange(2, 1, n, lastCol).getDisplayValues() : [];
      var col = function (h) { return lbCol_(head, [h]); };
      var cA = col('Автор'), cT = col('Назва');
      var relVal = function (s) {
        var m = String(s || '').match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
        return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3] || 1)) : '';
      };
      var out = { updated: 0, added: 0, rows: [] };
      var newRows = [];
      // дата замовлення: з форми (req.date) або сьогодні; лише для замовлень, не для бажанок
      var cOD = col('Дата замовлення');
      var odIso = /^\d{4}-\d{2}-\d{2}$/.test(String(req.date || '')) ? String(req.date) : lbToday_();
      var odP = odIso.split('-'), odVal = new Date(Number(odP[0]), Number(odP[1]) - 1, Number(odP[2]), 12);
      items.forEach(function (x) {
        var isWish = req.mode === 'wish';
        var set = {
          'Статус': isWish ? '' : 'Замовлено',
          'Ціна': x.price === '' || x.price == null ? '' : lbNum_(x.price),
          'Наявність': x.avail || req.avail || '',
          'Реліз': relVal(x.release),
          'Де замовлено': req.where || '',
          'Сайт': req.site || '',
          'Номер замовлення': req.num ? String(req.num) : ''
        };
        var idx = -1;
        var hint = Number(x.row) - 2;
        if (hint >= 0 && hint < vals.length && lbNorm_(vals[hint][cT]) === lbNorm_(x.title)) idx = hint;
        if (idx < 0) vals.forEach(function (r, i) { if (idx < 0 && lbNorm_(r[cT]) === lbNorm_(x.title) && (!x.author || lbNorm_(r[cA]) === lbNorm_(x.author))) idx = i; });
        if (idx >= 0) {
          Object.keys(set).forEach(function (h) {
            var c = col(h); if (c < 0 || set[h] === '' || set[h] == null) return;
            var cell = sh.getRange(idx + 2, c + 1);
            if (h === 'Номер замовлення') cell.setNumberFormat('@');
            cell.setValue(set[h]);
          });
          if (!isWish && cOD >= 0 && (req.date || !String(vals[idx][cOD]).trim())) sh.getRange(idx + 2, cOD + 1).setValue(odVal).setNumberFormat('dd.mm.yyyy');
          out.updated++; out.rows.push(idx + 2);
          lbLog_(isWish ? '＋ Бажанка оновлена (з додатку)' : '🧾 Замовлено (з додатку)', x.title, vals[idx][cA], [req.where, req.num ? '№' + req.num : '', set['Ціна'] !== '' ? set['Ціна'] + ' грн' : ''].filter(String).join(' · '));
        } else {
          var row = head.map(function () { return ''; });
          var put = function (h, v) { var c = col(h); if (c >= 0 && v !== '' && v != null) row[c] = v; };
          put('Автор', String(x.author).trim());
          put('Назва серії', String(x.series || '').trim());
          put('Назва', String(x.title).trim());
          put('Видавництво', lbPubCanon_(x.pub));
          put('Серія', x.series ? 'Так' : 'Ні');
          put('Яка частина', x.part === '' || x.part == null ? '' : lbNum_(x.part));
          put('Всього книг', x.total === '' || x.total == null ? '' : lbNum_(x.total));
          if (x.isbn) put('ISBN', String(x.isbn));
          Object.keys(set).forEach(function (h) { put(h, set[h]); });
          if (isWish) put('Статус', 'Хочу купити');
          else put('Дата замовлення', odVal);
          newRows.push(row);
          out.added++;
          lbLog_(isWish ? '＋ Нова бажанка (з додатку)' : '🧾 Замовлено, додано в бажанки (з додатку)', x.title, x.author, [req.where, req.num ? '№' + req.num : ''].filter(String).join(' · '));
        }
      });
      if (newRows.length) {
        var start = sh.getLastRow() + 1;
        var cN = col('Номер замовлення');
        if (cN >= 0) sh.getRange(start, cN + 1, newRows.length, 1).setNumberFormat('@');
        sh.getRange(start, 1, newRows.length, lastCol).setValues(newRows);
        if (cOD >= 0) sh.getRange(start, cOD + 1, newRows.length, 1).setNumberFormat('dd.mm.yyyy');
      }
      if (typeof sortWishlist === 'function') { try { sortWishlist(); } catch (err) {} }
      SpreadsheetApp.flush();
      return out;
    } finally { lock.releaseLock(); }
  }
}

function lbFindBookRow_(ss, author, title) {
  var c = lbSheetCache_(ss, {}, 'library');
  try { return lbFindRow_(c, LB_FIELDS.library, author, title) + 2; } catch (err) { return null; }
}

function lbEnsureSeries_(ss, b) {
  var sh = ss.getSheetByName(LB_SHEETS.series);
  if (!sh) return;
  var S = lbSheet_(ss, LB_SHEETS.series), gs = lbGetter_(S.head);
  var exists = S.rows.some(function (r) { return lbKey_(gs(r, ['Назва серії'])) === lbKey_(b.series); });
  if (exists) return;
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0].map(lbKey_);
  var row = head.map(function () { return ''; });
  var put = function (h, v) { var c = lbCol_(head, [h]); if (c >= 0 && v !== '' && v != null) row[c] = v; };
  put('Автор', b.author); put('Назва серії', b.series); put('Основних томів', lbNum_(b.total)); put('Видавництво', b.pub);
  sh.appendRow(row);
  lbLog_('📚 Створено серію', b.series, b.author, 'Додано з додатку');
}

/**
 * Впорядкування таблиці вашими ж функціями: сортування, нумерація, дані серій, видавництва, сортування бажанок.
 * updateSeriesInfo запускається, лише коли всі серії вже є в «Серіях» (інакше він питає у вікні, а тут вікна немає).
 */
function lbTidy_(ss) {
  var done = [], skipped = [];
  var lib = ss.getSheetByName(LB_SHEETS.library);
  var call = function (name, fn) {
    if (typeof fn !== 'function') { skipped.push(name + ' (немає функції)'); return; }
    try { fn(); done.push(name); } catch (err) { skipped.push(name + ': ' + (err && err.message ? err.message : err)); }
  };
  call('сортування', typeof sortLibrary === 'function' ? function () { sortLibrary(lib); } : null);
  call('нумерація', typeof renumberBooks === 'function' ? function () { renumberBooks(lib); } : null);
  var missing = lbMissingSeries_(ss);
  if (missing.length) skipped.push('дані серій: немає в «Серіях»: ' + missing.join(', '));
  else call('дані серій', typeof updateSeriesInfo === 'function' ? function () { updateSeriesInfo(lib); } : null);
  call('видавництва', typeof syncPublishers === 'function' ? syncPublishers : null);
  call('сортування бажанок', typeof sortWishlist === 'function' ? sortWishlist : null);
  return { done: done, skipped: skipped };
}

function lbMissingSeries_(ss) {
  var S = lbSheet_(ss, LB_SHEETS.series), gs = lbGetter_(S.head);
  var known = {};
  S.rows.forEach(function (r) { known[String(gs(r, ['Назва серії']))] = 1; });
  var L = lbSheet_(ss, LB_SHEETS.library), g = lbGetter_(L.head);
  var miss = {};
  L.rows.forEach(function (r) {
    if (g(r, ['Серія']) !== 'Серія') return;
    var s = g(r, ['Назва серії']);
    if (s && !known[s]) miss[s] = 1;
  });
  return Object.keys(miss);
}

/* ============================================================
 * Обкладинки та дані книги за ISBN або назвою
 * Джерела по черзі: Goodreads (сторінка видання за ISBN), Google Books, Open Library.
 * ============================================================ */

function lbApiLookup(initData, key, q) {
  return lbRun_(initData, key, function () { return lbLookup_(q || {}); });
}

function lbLookup_(q) {
  var isbn = String(q.isbn || '').replace(/[^0-9Xx]/g, '');
  var title = String(q.title || '').trim(), author = String(q.author || '').trim();
  var ck = 'lk5:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, isbn + '|' + title + '|' + author));
  var cache = CacheService.getScriptCache();
  var hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  var res = null, tried = [];
  var tries = isbn ? [lbFromGoodreads_, lbFromGoogle_, lbFromOpenLibrary_] : [lbFromGoodreadsSearch_, lbFromGoogle_, lbFromOpenLibrary_];
  for (var i = 0; i < tries.length; i++) {
    try {
      var r = tries[i](isbn, title, author);
      if (r) {
        res = res || {};
        Object.keys(r).forEach(function (k) {
          var v = r[k];
          if (v && !(Array.isArray(v) && !v.length) && (!res[k] || (Array.isArray(res[k]) && !res[k].length))) res[k] = v;
        });
        tried.push(r.source);
      }
    } catch (err) { tried.push('помилка: ' + (err && err.message ? err.message : err)); }
    if (res && res.cover && res.title && res.pages && res.description && res.genresRaw && res.genresRaw.length) break;
  }
  // за ISBN не знайшлось обкладинки — шукаємо на Goodreads за назвою й автором (інше видання теж підходить)
  if (isbn && title && !(res && res.cover)) {
    try {
      var g = lbFromGoodreadsSearch_('', title, author);
      if (g) { res = res || {}; Object.keys(g).forEach(function (k) { if (g[k] && !res[k]) res[k] = g[k]; }); tried.push(g.source); }
    } catch (err) { tried.push('помилка: ' + (err && err.message ? err.message : err)); }
  }
  // без ISBN нічого не знайшлось за назвою й автором — пробуємо лише за назвою (автор на Goodreads часто латиницею)
  if (!isbn && title && author && !(res && res.cover)) {
    try {
      var g2 = lbFromGoodreadsSearch_('', title, '');
      if (g2) { res = res || {}; Object.keys(g2).forEach(function (k) { if (g2[k] && !res[k]) res[k] = g2[k]; }); tried.push(g2.source + ' за назвою'); }
    } catch (err) { tried.push('помилка: ' + (err && err.message ? err.message : err)); }
  }
  var out = res ? res : { notFound: true };
  out.sources = tried;
  try { cache.put(ck, JSON.stringify(out), 21600); } catch (err) {}
  return out;
}

/* ============================================================
 * Книгарня Є (book-ye.com.ua) — еталон даних про українські видання
 * ============================================================ */
var LB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
function lbGetHtml_(url) {
  var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': LB_UA, 'Accept-Language': 'uk' } });
  return { code: r.getResponseCode(), html: r.getContentText() };
}
function lbWords_(s) { return lbNorm_(s).split(' ').filter(function (w) { return w.length > 2; }); }
function lbSim_(a, b) {
  var wa = lbWords_(a), nb = ' ' + lbNorm_(b) + ' ';
  if (!wa.length) return 0;
  return wa.filter(function (w) { return nb.indexOf(' ' + w) !== -1; }).length / wa.length;
}
/** Схожість рядків (0…1) за парами літер, без пробілів: «вкінці» ≈ «в кінці», «першим» ≈ «перший». */
function lbDice_(a, b) {
  a = lbNorm_(a).replace(/\s+/g, ''); b = lbNorm_(b).replace(/\s+/g, '');
  if (!a || !b) return 0;
  if (a === b) return 1;
  var bg = function (s) { var m = {}; for (var i = 0; i < s.length - 1; i++) { var k = s.substr(i, 2); m[k] = (m[k] || 0) + 1; } return m; };
  var x = bg(a), y = bg(b), inter = 0, n = Math.max(a.length - 1, 1) + Math.max(b.length - 1, 1);
  for (var k in x) if (y[k]) inter += Math.min(x[k], y[k]);
  return 2 * inter / n;
}
function lbCleanTitle_(t) { return String(t || '').replace(/\s*\((?:[^()]*)\)\s*$/, '').replace(/\.\s*Книга\s+\d+\s*$/i, '').trim(); }
function lbNoParen_(t) { return String(t || '').replace(/\s*\((?:[^()]*)\)\s*$/, '').trim(); }
function lbAuthorOk_(mine, theirs) {
  if (!mine) return true;
  var t = lbNorm_(theirs);
  return lbNorm_(mine).split(' ').filter(function (w) { return w.length > 2; }).some(function (w) { return t.indexOf(w.slice(0, Math.max(4, w.length - 2))) !== -1; });
}
/** Пошук на Книгарні Є: за ISBN, потім за назвою (+ прізвище автора). Перевіряє автора на сторінці книги. */
function lbFromBookYe_(isbn, title, author, pub) {
  var surname = String(author || '').split(/[ ,]+/).filter(Boolean).slice(-1)[0] || '';
  var qs = [];
  if (isbn) qs.push(['isbn', isbn]);
  if (title) { qs.push(['t', lbCleanTitle_(title) + (surname ? ' ' + surname : '')]); qs.push(['t', lbCleanTitle_(title)]); }
  var seen = {};
  for (var q = 0; q < qs.length; q++) {
    var res = lbGetHtml_('https://book-ye.com.ua/catalogsearch/result/?q=' + encodeURIComponent(qs[q][1]));
    if (res.code !== 200) continue;
    // пошук за ISBN іноді одразу відкриває сторінку книги
    if (/<meta[^>]+og:type[^>]+product/i.test(res.html) && !/product-item-link/.test(res.html)) {
      var d = lbParseBookYe_(res.html);
      if (d.isbn && (qs[q][0] !== 'isbn' || d.isbn === isbn)) { d.source = 'Книгарня Є'; d.match = 'isbn'; return d; }
    }
    var cands = [];
    res.html.split(/class="item product product-item"/).slice(1, 16).forEach(function (chunk) {
      var href = (chunk.match(/<a[^>]*product-item-link[^>]*href="([^"]+)"/) || chunk.match(/<a[^>]*href="([^"]+)"[^>]*product-item-link/) || chunk.match(/<a[^>]*href="(https:\/\/book-ye\.com\.ua\/[^"#?]+\/)"/) || [])[1];
      if (!href || seen[href]) return;
      var g = {}, gm = chunk.match(/data-gtm="([^"]+)"/);
      if (gm) { try { g = JSON.parse(gm[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')); } catch (e) { g = {}; } }
      var nm = (chunk.match(/product-item-link[^>]*>([\s\S]*?)<\/a>/) || [])[1];
      cands.push({ url: href, name: g.item_name || (nm ? lbHtmlText_(nm) : ''), brand: String(g.item_brand || '').replace(/^#/, '') });
    });
    if (!cands.length) continue;
    // номер тому в назві («Книга 2», «Том 1») має збігатися
    var nums = (String(title || '').match(/\d+/g) || []);
    if (qs[q][0] !== 'isbn' && nums.length) cands = cands.filter(function (c) { var cn = String(c.name).match(/\d+/g) || []; return nums.every(function (n) { return cn.indexOf(n) !== -1; }); });
    if (!cands.length) continue;
    cands.forEach(function (c) {
      c.score = qs[q][0] === 'isbn' ? 1 : lbDice_(lbCleanTitle_(title), lbCleanTitle_(c.name));
      if (pub && c.brand && (lbDice_(pub, c.brand) > 0.6 || lbNorm_(c.brand).indexOf(lbNorm_(pub)) === 0)) c.score += 0.15;
    });
    cands.sort(function (a, b) { return b.score - a.score; });
    var tries = cands.filter(function (c) { return c.score >= 0.62; }).slice(0, 3);
    for (var t = 0; t < tries.length; t++) {
      seen[tries[t].url] = 1;
      var page = lbGetHtml_(tries[t].url);
      if (page.code !== 200) continue;
      var out = lbParseBookYe_(page.html);
      if (!out.title) out.title = tries[t].name;
      if (qs[q][0] === 'isbn' ? out.isbn !== isbn && !lbAuthorOk_(author, out.author) : !lbAuthorOk_(author, out.author)) continue;
      out.url = tries[t].url; out.source = 'Книгарня Є'; out.match = qs[q][0] === 'isbn' && out.isbn === isbn ? 'isbn' : 'назва';
      // «Книга N» лишаємо, якщо у вашій назві є номер; інакше прибираємо
      out.titleClean = nums.length ? lbNoParen_(out.title) : lbCleanTitle_(out.title);
      out.score = Math.round(tries[t].score * 100) / 100;
      return out;
    }
  }
  return null;
}
/* ============================================================
 * Автозвірка у фоні: заповнює ПОРОЖНІ ISBN, сторінки й обкладинки там, де збіг надійний.
 * Нічого не перезаписує (назви й авторів не змінює — це лише через звірку в додатку).
 * Працює порціями по ~4,5 хв і сама продовжує кожні 10 хв, доки не пройде все; потім вимикається.
 * ============================================================ */
function lbAutoFill() {
  var started = Date.now(), budget = 270000;
  var ss = lbSs_(), props = PropertiesService.getScriptProperties();
  var tried = {};
  try { tried = JSON.parse(props.getProperty('LB_AV_TRIED') || '{}'); } catch (e) { tried = {}; }
  var today = Math.floor(Date.now() / 86400000);
  var fresh = function (k) { return tried[k] && today - tried[k] < 30; };
  var keyOf = function (a, t) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, lbNorm_(a + ' ' + t))).slice(0, 10); };
  var stats = { checked: 0, filled: 0, left: 0 }, stopped = false;
  var sheets = [[LB_SHEETS.library, 'Назва книги', true], [LB_SHEETS.wish, 'Назва', false]];
  for (var si = 0; si < sheets.length && !stopped; si++) {
    var sh = ss.getSheetByName(sheets[si][0]); if (!sh) continue;
    var lib = sheets[si][2];
    var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0].map(lbKey_);
    var c = { a: lbCol_(head, ['Автор']), t: lbCol_(head, [sheets[si][1]]), p: lbCol_(head, ['Видавництво']), i: lbCol_(head, ['ISBN']), n: lbCol_(head, ['Кількість сторінок']), o: lbCol_(head, ['Обкладинка']), s: lbCol_(head, ['Статус']) };
    if (c.a < 0 || c.t < 0) continue;
    var vals = sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), sh.getLastColumn()).getDisplayValues();
    for (var r = 0; r < vals.length; r++) {
      var v = vals[r], title = v[c.t], author = v[c.a];
      if (!title || !author || /не оголошено/i.test(title)) continue;
      if (!lib && c.s >= 0 && v[c.s] === 'В бібліотеці') continue;
      var need = (c.i >= 0 && !v[c.i]) || (c.n >= 0 && !v[c.n]) || (c.o >= 0 && !v[c.o]);
      if (!need) continue;
      var k = (lib ? 'L' : 'W') + keyOf(author, title);
      if (fresh(k)) continue;
      if (Date.now() - started > budget) { stopped = true; break; }
      stats.checked++;
      var set = {}, isbn = c.i >= 0 ? String(v[c.i]).replace(/[^0-9Xx]/g, '') : '', pub = c.p >= 0 ? v[c.p] : '';
      try {
        var y = lbFromBook_(isbn, title, author, pub);
        var sure = y && (y.match === 'isbn' || (lbDice_(lbCleanTitle_(title), y.titleClean || y.title) >= 0.85 && lbAuthorOk_(author, y.author) &&
          (!pub || !y.pub || lbDice_(pub, y.pub) > 0.5 || lbNorm_(y.pub).indexOf(lbNorm_(pub)) === 0 || lbNorm_(pub).indexOf(lbNorm_(y.pub)) === 0)));
        var cov = '';
        if (sure) {
          if (c.i >= 0 && !isbn && y.isbn) set.i = "'" + y.isbn;
          if (c.n >= 0 && !v[c.n] && y.pages) set.n = y.pages;
          if (c.o >= 0 && !v[c.o] && y.isbn) {
            try { var g = lbFromGoodreads_(y.isbn); if (g && g.cover) cov = g.cover; } catch (e) {}
            if (!cov) { try { var gb = lbFromGoogle_(y.isbn, '', ''); if (gb && gb.cover) cov = gb.cover; } catch (e) {} }
          }
        }
        // на Книгарні Є не знайшлось — обкладинка з Goodreads за назвою, лише якщо назва дуже схожа
        if (c.o >= 0 && !v[c.o] && !cov) {
          try { var gs = lbFromGoodreadsSearch_('', title, author); if (gs && gs.cover && lbDice_(title, lbCleanTitle_(gs.title || '')) >= 0.85) { cov = gs.cover; if (c.i >= 0 && !isbn && !set.i && gs.isbn) set.i = "'" + String(gs.isbn).replace(/[^0-9Xx]/g, ''); } } catch (e) {}
        }
        if (cov) set.o = cov;
      } catch (e) {}
      var keys = Object.keys(set);
      if (keys.length) {
        // рядок міг зсунутись (нічне сортування) — пишемо лише якщо там та сама книга
        var row = r + 2;
        if (String(sh.getRange(row, c.t + 1).getDisplayValue()) === title && String(sh.getRange(row, c.a + 1).getDisplayValue()) === author) {
          keys.forEach(function (f) { sh.getRange(row, c[f] + 1).setValue(set[f]); });
          stats.filled++;
          lbLog_('🔎 Автозвірка', title, author, 'додано: ' + keys.map(function (f) { return { i: 'ISBN', n: 'сторінки', o: 'обкладинку' }[f]; }).join(', '));
        }
      }
      tried[k] = today;
      if (stats.checked % 5 === 0) { try { props.setProperty('LB_AV_TRIED', JSON.stringify(tried)); } catch (e) {} }
    }
  }
  try { props.setProperty('LB_AV_TRIED', JSON.stringify(tried)); } catch (e) {}
  // старі одноразові запуски прибираємо; якщо не встигли — наступна порція за 10 хвилин
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'lbAutoFill') ScriptApp.deleteTrigger(t); });
  if (stopped) ScriptApp.newTrigger('lbAutoFill').timeBased().after(10 * 60 * 1000).create();
  props.setProperty('LB_AV_STATE', JSON.stringify({ at: Date.now(), running: stopped, checked: stats.checked, filled: stats.filled }));
  var msg = 'Автозвірка: перевірено ' + stats.checked + ', доповнено ' + stats.filled + '. ' + (stopped ? 'Продовжу сама за 10 хвилин.' : 'Усе пройдено ✓');
  console.log(msg);
  if (!stopped) lbLog_('🔎 Автозвірка завершена', '', '', msg);
  return msg;
}
/** Запуск автозвірки з додатку: вмикає фонову роботу (перший запуск за хвилину) і одразу повертається. */
function lbApiAutoFill(initData, key) {
  return lbRun_(initData, key, function () {
    var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'lbAutoFill'; });
    if (!has) ScriptApp.newTrigger('lbAutoFill').timeBased().after(60 * 1000).create();
    var st = {}; try { st = JSON.parse(PropertiesService.getScriptProperties().getProperty('LB_AV_STATE') || '{}'); } catch (e) {}
    return { started: !has, running: has, last: st };
  });
}

/** Звірка з Книгарнею Є для додатку. req = {isbn, title, author, pub} */
function lbApiOfficial(initData, key, req) {
  return lbRun_(initData, key, function () {
    req = req || {};
    var isbn = String(req.isbn || '').replace(/[^0-9Xx]/g, '');
    var ck = 'by2:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, isbn + '|' + req.title + '|' + req.author + '|' + req.pub));
    var cache = CacheService.getScriptCache(), hit = cache.get(ck);
    if (hit) return JSON.parse(hit);
    var r = lbFromBook_(isbn, String(req.title || ''), String(req.author || ''), String(req.pub || '')) || { notFound: true };
    // у Книгарні Є часто фото книги боком — рівну обкладинку беремо з Goodreads за тим самим ISBN
    if (!r.notFound) {
      r.shopCover = r.cover || '';
      r.cover = '';
      if (r.isbn) { try { var g = lbFromGoodreads_(r.isbn, '', ''); if (g && g.cover) { r.cover = g.cover; r.coverFrom = 'Goodreads'; } } catch (e) {} }
      if (!r.cover && r.isbn) { try { var gb = lbFromGoogle_(r.isbn, '', ''); if (gb && gb.cover && !/no_cover|nophoto/i.test(gb.cover)) { r.cover = gb.cover; r.coverFrom = 'Google Books'; } } catch (e) {} }
    }
    if (r.attrs) { r.lang = r.attrs['Мова'] || ''; r.binding = r.attrs['Обкладинка'] || ''; delete r.attrs; }
    try { cache.put(ck, JSON.stringify(r), 21600); } catch (e) {}
    return r;
  });
}
function lbParseBookYe_(h) {
  var meta = function (p) { var m = h.match(new RegExp('<meta[^>]+(?:property|name)="' + p + '"[^>]+content="([^"]*)"', 'i')) || h.match(new RegExp('<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="' + p + '"', 'i')); return m ? lbHtmlText_(m[1]) : ''; };
  var attrs = {}, re = /<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi, m;
  while ((m = re.exec(h))) { var k = lbHtmlText_(m[1]).replace(/:$/, ''); if (k && k.length < 40) attrs[k] = lbHtmlText_(m[2]); }
  var re2 = /data-th="([^"]+)"[^>]*>([\s\S]*?)<\/td>/gi;
  while ((m = re2.exec(h))) { var k2 = lbHtmlText_(m[1]); if (k2 && !attrs[k2]) attrs[k2] = lbHtmlText_(m[2]); }
  var get = function (names) { for (var i = 0; i < names.length; i++) for (var k in attrs) if (lbKey_(k).indexOf(names[i]) === 0) return attrs[k]; return ''; };
  var h1 = (h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1];
  var isbn = (get(['isbn']) || '').replace(/[^0-9Xx]/g, '');
  return {
    title: h1 ? lbHtmlText_(h1) : meta('og:title'),
    author: get(['автор']),
    pub: lbPubCanon_(get(['видавництво', 'видавець'])),
    series: get(['серія']),
    isbn: isbn.length === 13 || isbn.length === 10 ? isbn : '',
    pages: lbNum_(get(['кількість сторінок', 'сторінок', 'к-сть сторінок'])),
    year: get(['рік видання', 'рік']),
    cover: meta('og:image'),
    attrs: attrs
  };
}

/* ============================================================
 * MEGOGO Books (mbooks.com.ua) — перше джерело; Книгарня Є — запасне.
 * Сайт на Next.js: дані книги лежать у сторінці як JSON (self.__next_f.push).
 * ============================================================ */
function lbMgText_(html) {
  var out = [], re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g, m;
  while ((m = re.exec(html))) { try { out.push(JSON.parse('"' + m[1] + '"')); } catch (e) {} }
  return out.join('');
}
/** Вирізає JSON-об'єкт, що містить "slug":"<slug>", і починається з {"uid". */
function lbMgObj_(text, slug, from) {
  var i = text.indexOf('"slug":"' + slug + '"', from || 0);
  if (i < 0) return null;
  var j = text.lastIndexOf('{"uid"', i);
  if (j < 0) return null;
  var depth = 0, inStr = false;
  for (var k = j; k < text.length; k++) {
    var c = text.charAt(k);
    if (inStr) { if (c === '\\') k++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (!depth) { try { return JSON.parse(text.slice(j, k + 1)); } catch (e) { return null; } } }
  }
  return null;
}
function lbMgAuthor_(o) { return (o.authors || []).map(function (a) { return [a.firstName, a.lastName].filter(Boolean).join(' '); }).join(', '); }
function lbMgSearch_(q) {
  var res = lbGetHtml_('https://mbooks.com.ua/search/?query=' + encodeURIComponent(q));
  if (res.code !== 200) return [];
  var t = lbMgText_(res.html), seen = {}, out = [];
  var re = /"slug":"(\d{6}-[a-z0-9-]+)"/g, m;
  while ((m = re.exec(t)) && out.length < 15) {
    if (seen[m[1]]) continue; seen[m[1]] = 1;
    var o = lbMgObj_(t, m[1], m.index - 1);
    if (o && o.title && o.bookType !== 'ebook' && o.bookType !== 'audiobook') out.push({ slug: o.slug, name: o.title, author: lbMgAuthor_(o) });
  }
  return out;
}
function lbMgBook_(slug) {
  var res = lbGetHtml_('https://mbooks.com.ua/book/' + slug + '/');
  if (res.code !== 200) return null;
  var o = lbMgObj_(lbMgText_(res.html), slug);
  if (!o || !o.title) return null;
  var desc = '';
  var ld = res.html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i);
  if (ld) { try { desc = lbHtmlText_(JSON.parse(ld[1]).description || ''); } catch (e) {} }
  var cats = [];
  (o.additionalCategories || []).concat(o.mainCategory ? [o.mainCategory] : []).forEach(function (c) { if (c && c.title && cats.indexOf(c.title) === -1) cats.push(c.title); });
  var ser = (o.series || [])[0] || null;
  var pu = o.purchases || {};
  var isbn = String(o.isbn || o.barcode || '').replace(/[^0-9Xx]/g, '');
  var avail = o.status === 'ready_for_presale' ? 'Передзамовлення' : o.status === 'ready_for_order' ? 'Є у продажу' : '';
  var attrs = { 'Категорії': cats.join(', '), 'Мова': (o.languages || []).join(', '), 'Рік видання': o.year || '', 'Опис': desc.slice(0, 1500) };
  if (o.originalTitle) attrs['Оригінальна назва'] = o.originalTitle;
  return {
    title: o.title, author: lbMgAuthor_(o), pub: o.publisher ? lbPubCanon_(o.publisher.name) : '',
    series: ser ? ser.title : '', part: ser && ser.numberInSeries ? String(ser.numberInSeries) : (o.numberInSeries ? String(o.numberInSeries) : ''),
    isbn: isbn.length === 13 || isbn.length === 10 ? isbn : '', pages: o.pages || null, year: o.year ? String(o.year) : '',
    cover: o.cover && o.cover.frontCover || '', price: pu.currentPrice || pu.price || pu.preorderPrice || null, avail: avail,
    release: pu.preorderDate ? String(pu.preorderDate).slice(0, 10) : '', genres: cats, lang: (o.languages || [])[0] || '',
    rating: o.goodreadsAverageRating || '', url: 'https://mbooks.com.ua/book/' + slug + '/', attrs: attrs
  };
}
/** Пошук на MEGOGO Books: за ISBN, потім за назвою (+ прізвище автора). Перевіряє автора. */
function lbFromMegogo_(isbn, title, author, pub) {
  var surname = String(author || '').split(/[ ,]+/).filter(Boolean).slice(-1)[0] || '';
  var qs = [];
  if (isbn) qs.push(['isbn', isbn]);
  if (title) { qs.push(['t', lbCleanTitle_(title) + (surname ? ' ' + surname : '')]); qs.push(['t', lbCleanTitle_(title)]); }
  var seen = {};
  var nums = (String(title || '').match(/\d+/g) || []);
  for (var q = 0; q < qs.length; q++) {
    var cands = lbMgSearch_(qs[q][1]).filter(function (c) { return !seen[c.slug]; });
    if (qs[q][0] !== 'isbn' && nums.length) cands = cands.filter(function (c) { var cn = String(c.name).match(/\d+/g) || []; return nums.every(function (n) { return cn.indexOf(n) !== -1; }); });
    cands.forEach(function (c) {
      c.score = qs[q][0] === 'isbn' ? 1 : lbDice_(lbCleanTitle_(title), lbCleanTitle_(c.name));
      if (author && !lbAuthorOk_(author, c.author)) c.score -= 0.5;
    });
    cands.sort(function (a, b) { return b.score - a.score; });
    var tries = cands.filter(function (c) { return c.score >= 0.62; }).slice(0, 2);
    for (var t = 0; t < tries.length; t++) {
      seen[tries[t].slug] = 1;
      var out = lbMgBook_(tries[t].slug);
      if (!out) continue;
      if (qs[q][0] === 'isbn' ? out.isbn !== isbn && !lbAuthorOk_(author, out.author) : !lbAuthorOk_(author, out.author)) continue;
      out.source = 'MEGOGO Books'; out.match = qs[q][0] === 'isbn' && out.isbn === isbn ? 'isbn' : 'назва';
      out.titleClean = nums.length ? lbNoParen_(out.title) : lbCleanTitle_(out.title);
      out.score = Math.round(tries[t].score * 100) / 100;
      return out;
    }
  }
  return null;
}
/** Головний пошук даних про книгу: MEGOGO Books, а чого бракує (серія, дата, сама книга) — з Книгарні Є. */
function lbFromBook_(isbn, title, author, pub) {
  var m = null, y = null;
  try { m = lbFromMegogo_(isbn, title, author, pub); } catch (e) { m = null; }
  if (m && m.isbn && m.pages && m.cover) return m;
  try { y = lbFromBookYe_(isbn || (m && m.isbn) || '', title, author, pub); } catch (e) { y = null; }
  if (!m) return y;
  if (y) {
    ['series', 'isbn', 'pages', 'cover', 'pub', 'year'].forEach(function (k) { if (!m[k] && y[k]) m[k] = y[k]; });
    if (y.attrs) Object.keys(y.attrs).forEach(function (k) { if (!m.attrs[k]) m.attrs[k] = y.attrs[k]; });
    m.source = 'MEGOGO Books + Книгарня Є';
  }
  return m;
}

/* ============================================================
 * 📰 Новини серій: раз на тиждень перевіряє бажанки, які ще не в продажу
 * (MEGOGO Books, а чого там нема — Gemini з пошуком Google).
 * Нічого не пише в таблицю: лише пропозиції, які вона підтверджує в додатку.
 * ============================================================ */
var LB_NEWS_MAX = 40;
function lbNewsGet_() {
  var p = PropertiesService.getScriptProperties();
  var o = {};
  try { o = JSON.parse(p.getProperty('LB_NEWS') || '{}'); } catch (e) { o = {}; }
  o.items = o.items || []; o.seen = o.seen || []; o.cur = o.cur || 0;
  return o;
}
function lbNewsPut_(o) {
  o.items = o.items.slice(-LB_NEWS_MAX); o.seen = o.seen.slice(-150);
  var s = JSON.stringify(o);
  while (s.length > 8500 && o.items.length) { o.items.shift(); s = JSON.stringify(o); }
  PropertiesService.getScriptProperties().setProperty('LB_NEWS', s);
}
function lbNewsHash_(row, a, t, ch) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, lbNorm_(a + '|' + t) + JSON.stringify(ch))).slice(0, 10);
}
function lbIsPlaceholder_(t) { return /не оголошено|^(книга|частина|том)\s*\d+\s*$/i.test(String(t || '').trim()); }
/** Пошук наступного тому серії на MEGOGO за назвою серії й номером. */
function lbMgSeriesVolume_(series, part, author) {
  var surname = String(author || '').split(/[ ,]+/).filter(Boolean).slice(-1)[0] || '';
  var cands = lbMgSearch_(series + (surname ? ' ' + surname : ''));
  if (author) cands = cands.filter(function (c) { return lbAuthorOk_(author, c.author); });
  for (var i = 0; i < Math.min(cands.length, 4); i++) {
    var b = lbMgBook_(cands[i].slug);
    if (b && b.series && lbDice_(b.series, series) > 0.7 && String(lbNum_(b.part)) === String(lbNum_(part))) { b.source = 'MEGOGO Books'; return b; }
  }
  return null;
}
/** Gemini з пошуком Google. Повертає {json, url} або null. */
/** Моделі по черзі: власна з GEMINI_MODEL, потім «остання flash» (Google сам оновлює), потім конкретні назви. */
function lbGeminiModels_() {
  var own = PropertiesService.getScriptProperties().getProperty('GEMINI_MODEL');
  var list = [own, 'gemini-flash-latest', 'gemini-3.8-flash', 'gemini-flash-lite-latest'].filter(Boolean);
  return list.filter(function (m, i) { return list.indexOf(m) === i; });
}
var LB_GS_ERR = '';
function lbGeminiSearch_(prompt) {
  LB_GS_ERR = '';
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) { LB_GS_ERR = 'немає GEMINI_API_KEY'; return null; }
  var models = lbGeminiModels_(), r = null;
  for (var i = 0; i < models.length; i++) {
    r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(models[i]) + ':generateContent', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: { 'x-goog-api-key': key },
      payload: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0 } })
    });
    if ([404, 429, 500, 503].indexOf(r.getResponseCode()) === -1) break;
  }
  if (r.getResponseCode() !== 200) { LB_GS_ERR = r.getResponseCode() + ' ' + r.getContentText().slice(0, 300); return null; }
  var j = JSON.parse(r.getContentText());
  var c = (j.candidates || [])[0] || {};
  var txt = ((c.content || {}).parts || []).map(function (p) { return p.text || ''; }).join('');
  var m = txt.match(/\{[\s\S]*\}/);
  if (!m) { LB_GS_ERR = 'без JSON: ' + txt.slice(0, 200); return null; }
  var out; try { out = JSON.parse(m[0]); } catch (e) { LB_GS_ERR = 'зламаний JSON: ' + m[0].slice(0, 200); return null; }
  var chunks = ((c.groundingMetadata || {}).groundingChunks || []).map(function (g) { return g.web && g.web.uri; }).filter(Boolean);
  return { json: out, url: /^https?:\/\//.test(out.source || '') ? out.source : (chunks[0] || '') };
}
function lbNewsAsk_(w) {
  var what = lbIsPlaceholder_(w.title) ? 'том №' + w.part + ' серії «' + w.series + '»' : 'книга «' + w.title + '»' + (w.series ? ' (серія «' + w.series + '»' + (w.part ? ', том ' + w.part : '') + ')' : '');
  var prompt = 'Знайди в інтернеті, чи анонсовано УКРАЇНСЬКЕ видання (паперове, українською мовою): ' + what + ', автор ' + w.author + '. ' +
    'Шукай на сайтах українських видавництв і книгарень (Vivat, КСД, Book Chef, Nebo, Bookshelf, Yakaboo, Книгарня Є, MEGOGO Books, Readberry, Жорж). ' +
    'Відповідай ЛИШЕ JSON без пояснень: {"found":true|false,"title":"українська назва","publisher":"видавництво","release":"YYYY-MM-DD або YYYY-MM або порожньо","status":"анонс"|"передзамовлення"|"у продажу"|"невідомо","source":"посилання на сторінку, де це сказано"}. ' +
    'Якщо українського видання не знайшла або не впевнена — {"found":false}. Нічого не вигадуй, дату давай лише якщо вона прямо вказана.';
  var r = lbGeminiSearch_(prompt);
  if (r && r.json && !r.json.found) LB_GS_ERR = 'Gemini: українського видання не знайдено';
  else if (r && r.json && r.json.found && !r.url) LB_GS_ERR = 'знайдено, але без посилання на джерело: ' + JSON.stringify(r.json).slice(0, 200);
  if (!r || !r.json || !r.json.found || !r.url) return null;
  var j = r.json, st = String(j.status || '').toLowerCase();
  var rel = String(j.release || '').trim();
  if (/^\d{4}-\d{2}$/.test(rel)) rel = ''; // місяць без дня не пишемо в «Реліз»
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rel)) rel = '';
  return { title: String(j.title || '').slice(0, 150), pub: lbPubCanon_(String(j.publisher || '').slice(0, 60)), release: rel, relMonth: String(j.release || '').slice(0, 7),
    avail: st.indexOf('передзам') === 0 ? 'Передзамовлення' : st.indexOf('у продаж') === 0 ? 'Є у продажу' : st.indexOf('анонс') === 0 ? 'Анонс' : '',
    url: r.url, source: 'Gemini + Google' };
}
/** Один прохід. budgetMs — скільки часу можна витратити; maxAi — скільки разів звертатись до Gemini. */
function lbSeriesNews_(budgetMs, maxAi) {
  var started = Date.now();
  var ss = lbSs_(), W = lbSheet_(ss, LB_SHEETS.wish), gw = lbGetter_(W.head);
  var today = lbToday_();
  var news = lbNewsGet_(), known = {};
  news.items.forEach(function (x) { known[x.id] = 1; }); news.seen.forEach(function (h) { known[h] = 1; });
  var list = [];
  W.rows.forEach(function (r, i) {
    var st = gw(r, ['Статус']);
    if (['Хочу купити', 'Докупити серію', 'На майбутнє'].indexOf(st) === -1) return;
    var av = gw(r, ['Наявність']), rel = lbDate_(gw(r, ['Реліз']));
    if (av === 'Є у продажу') return;
    if (av === 'Передзамовлення' && rel) return; // уже все відомо
    list.push({ row: i + 2, author: gw(r, ['Автор']), title: gw(r, ['Назва']), series: gw(r, ['Назва серії']), part: gw(r, ['Яка частина']),
      pub: gw(r, ['Видавництво']), avail: av, release: rel || '', isbn: gw(r, ['ISBN']).replace(/\D/g, '') });
  });
  if (!list.length) return { checked: 0, added: [] };
  var added = [], checked = 0, ai = 0;
  var start = news.cur % list.length;
  for (var n = 0; n < list.length; n++) {
    if (Date.now() - started > budgetMs) break;
    var w = list[(start + n) % list.length];
    news.cur = (start + n + 1) % list.length;
    checked++;
    if (!w.author || (!w.title && !w.series)) continue;
    var f = null;
    try {
      f = lbIsPlaceholder_(w.title) ? (w.series && w.part ? lbMgSeriesVolume_(w.series, w.part, w.author) : null) : lbFromMegogo_(w.isbn, w.title, w.author, w.pub);
    } catch (e) { f = null; }
    if (f && f.lang && !/укр/i.test(f.lang)) f = null; // лише українські видання
    if (f) f.url = f.url || '';
    var useful = function (x) { return x && (x.release || (x.avail && x.avail !== w.avail) || (lbIsPlaceholder_(w.title) && x.title)); };
    if (!useful(f) && ai < maxAi) { ai++; try { f = lbNewsAsk_(w) || f; } catch (e) {} if (/^429/.test(LB_GS_ERR)) maxAi = 0; /* пошук Google недоступний на безкоштовному тарифі — далі лише MEGOGO */ }
    if (!useful(f)) continue;
    var ch = {};
    if (lbIsPlaceholder_(w.title) && f.title && !lbIsPlaceholder_(f.title)) ch.title = lbCleanTitle_(f.title);
    if (f.release && f.release !== w.release && f.release >= today.slice(0, 4) + '-01-01') ch.release = f.release;
    if (f.avail && f.avail !== w.avail) ch.avail = f.avail;
    if (f.pub && !w.pub) ch.pub = f.pub;
    if (!ch.title && !ch.release && !ch.avail) continue;
    var id = lbNewsHash_(w.row, w.author, w.title, ch);
    if (known[id]) continue;
    known[id] = 1;
    var item = { id: id, row: w.row, a: w.author, t: w.title, s: w.series, p: w.part, ch: ch, src: f.source || '', url: String(f.url || '').slice(0, 300), d: today };
    if (f.relMonth && !ch.release && /^\d{4}-\d{2}$/.test(f.relMonth)) item.m = f.relMonth;
    news.items.push(item); added.push(item);
  }
  news.last = today;
  lbNewsPut_(news);
  return { checked: checked, added: added };
}
function lbNewsText_(it) {
  var bits = [];
  if (it.ch.title) bits.push('назва: «' + it.ch.title + '»');
  if (it.ch.release) bits.push('вийде ' + lbHuman_(it.ch.release));
  else if (it.m) bits.push('орієнтовно ' + it.m.slice(5, 7) + '.' + it.m.slice(0, 4));
  if (it.ch.avail) bits.push(it.ch.avail.toLowerCase());
  if (it.ch.pub) bits.push(it.ch.pub);
  return bits.join(' · ');
}
/** Діагностика (нічого не змінює): що знайде пошук новин для 3 перших бажанок «не в продажу». */
function lbTestNews() {
  var W = lbSheet_(lbSs_(), LB_SHEETS.wish), gw = lbGetter_(W.head), n = 0, ser = {};
  W.rows.forEach(function (r, i) {
    var sk = lbNorm_(gw(r, ['Назва серії']) || gw(r, ['Назва']));
    if (ser[sk]) return;
    if (n >= 4 || ['Хочу купити', 'Докупити серію', 'На майбутнє'].indexOf(gw(r, ['Статус'])) === -1 || gw(r, ['Наявність']) === 'Є у продажу') return;
    n++; ser[sk] = 1;
    var w = { row: i + 2, author: gw(r, ['Автор']), title: gw(r, ['Назва']), series: gw(r, ['Назва серії']), part: gw(r, ['Яка частина']), pub: gw(r, ['Видавництво']) };
    var m = null, g = null;
    try { m = lbIsPlaceholder_(w.title) ? lbMgSeriesVolume_(w.series, w.part, w.author) : lbFromMegogo_('', w.title, w.author, w.pub); } catch (e) { m = 'помилка: ' + e.message; }
    try { g = lbNewsAsk_(w); } catch (e) { g = 'помилка: ' + e.message; }
    if (m && m.attrs) delete m.attrs;
    console.log(w.title + ' (' + w.author + ')\n  MEGOGO: ' + JSON.stringify(m) + '\n  Gemini: ' + JSON.stringify(g) + (g ? '' : '\n  Причина: ' + (LB_GS_ERR || '—')));
  });
  // контроль: книга, про яку точно є українська інформація
  var c = null;
  try { c = lbNewsAsk_({ title: 'Ритм війни', author: 'Брендон Сандерсон', series: 'Хроніки Буресвітла', part: '4' }); } catch (e) { c = 'помилка: ' + e.message; }
  console.log('Контроль «Ритм війни»: ' + JSON.stringify(c) + (c ? '' : '\n  Причина: ' + (LB_GS_ERR || '—')));
}
/** Діагностика: чи працює Gemini без пошуку Google (як для скриншотів) і з пошуком. Нічого не змінює. */
function lbTestGemini() {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) { console.log('Немає GEMINI_API_KEY'); return; }
  ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'].forEach(function (m) {
    [false, true].forEach(function (search) {
      var body = { contents: [{ role: 'user', parts: [{ text: 'Яке видавництво видало українською «Ритм війни» Брендона Сандерсона? Одним словом.' }] }] };
      if (search) body.tools = [{ google_search: {} }];
      var r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: { 'x-goog-api-key': key }, payload: JSON.stringify(body) });
      var code = r.getResponseCode(), t = r.getContentText();
      var ans = '';
      if (code === 200) { try { ans = JSON.parse(t).candidates[0].content.parts.map(function (p) { return p.text || ''; }).join('').slice(0, 60); } catch (e) { ans = '?'; } }
      else { try { ans = JSON.parse(t).error.message.slice(0, 120); } catch (e) { ans = t.slice(0, 120); } }
      console.log(m + (search ? ' + Google' : '') + ' → ' + code + ' ' + ans);
    });
  });
}
/** Тригер раз на тиждень. */
function lbSeriesNews() {
  var res = lbSeriesNews_(300000, 15);
  lbLog_('📰 Новини серій', '', '', 'Перевірено: ' + res.checked + ', нового: ' + res.added.length);
  if (!res.added.length) return;
  try {
    lbTgSend_('📰 <b>Новини серій</b> (' + res.added.length + ')\n' + res.added.slice(0, 15).map(function (it) {
      return '• ' + lbEsc_(it.ch.title || it.t) + (it.s ? ' <i>(' + lbEsc_(it.s) + (it.p ? ' #' + lbEsc_(it.p) : '') + ')</i>' : '') + ' — ' + lbEsc_(lbNewsText_(it));
    }).join('\n') + '\n\nПідтвердити або сховати можна в додатку: Бажанки → «Новини серій».');
  } catch (e) {}
}
/** Ставить тижневий тригер, якщо його ще немає (викликається з нічного оновлення). */
function lbEnsureNewsTrigger_() {
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'lbSeriesNews'; });
  if (!has) ScriptApp.newTrigger('lbSeriesNews').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(5).create();
}
/** Додаток: req = {action:'dismiss'|'done', id} або {action:'run'} — повертає актуальний список. */
function lbApiNews(initData, key, req) {
  return lbRun_(initData, key, function () {
    req = req || {};
    if (req.action === 'run') { lbSeriesNews_(25000, 3); return lbNewsGet_().items; }
    var news = lbNewsGet_();
    if (req.id) {
      news.items = news.items.filter(function (x) { return x.id !== req.id; });
      news.seen.push(String(req.id).slice(0, 12));
      lbNewsPut_(news);
    }
    return news.items;
  });
}

/** Діагностика (нічого не змінює): пробує Книгарню Є на 3 книгах і пише в журнал, що знайшла. */
function lbTestSources() {
  [['', 'Він першим помре вкінці', 'Адам Сільвера', 'Vivat'], ['', 'Дракула', 'Брем Стокер', 'Атена'], ['9786171245624', 'Убивство Роджера Екройда', 'Агата Крісті', 'КСД']].forEach(function (t) {
    try {
      var r = lbFromBook_(t[0], t[1], t[2], t[3]);
      if (r) delete r.attrs;
      console.log(t[1] + ' → ' + (r ? JSON.stringify(r) : 'нічого'));
    } catch (e) { console.log(t[1] + ' → помилка: ' + (e && e.message ? e.message : e)); }
  });
  var s = lbGetHtml_('https://book-ye.com.ua/catalogsearch/result/?q=' + encodeURIComponent('Дракула'));
  var i = s.html.indexOf('product-item');
  console.log('Пошук: код ' + s.code + ', product-item ' + (i >= 0 ? 'є' : 'немає') + '\n' + (i >= 0 ? s.html.slice(Math.max(0, i - 300), i + 900) : s.html.slice(0, 600)).replace(/\s+/g, ' '));
}

function lbFetch_(url) {
  var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'Mozilla/5.0 (personal library)', 'Accept-Language': 'uk,en;q=0.8' } });
  return r.getResponseCode() === 200 ? r.getContentText() : '';
}

function lbHtmlText_(s) {
  return String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/&laquo;/g, '«').replace(/&raquo;/g, '»').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&rsquo;|&lsquo;/g, '’').replace(/&hellip;/g, '…')
    .replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(Number(n)); })
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

/** Розбирає сторінку книги Goodreads: назва, автор, сторінки, обкладинка, серія, жанри, опис. */
function lbParseGoodreads_(html) {
  var out = { source: 'Goodreads' };
  var m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (m) {
    try {
      var j = JSON.parse(m[1]);
      out.title = j.name; out.cover = j.image; out.pages = j.numberOfPages;
      var au = [].concat(j.author || []);
      if (au.length) out.author = au.map(function (a) { return a.name; }).join(', ');
      if (j.isbn) out.isbn = j.isbn;
      if (j.inLanguage) out.language = j.inLanguage;
    } catch (err) {}
  }
  if (!out.cover) { var og = html.match(/<meta property="og:image" content="([^"]+)"/); if (og) out.cover = og[1]; }
  if (out.cover && /nophoto/.test(out.cover)) delete out.cover;
  if (out.title) {
    var sm = String(out.title).match(/\(([^()]*?),?\s*#\s*([\d.,]+)\)\s*$/);
    if (sm) { out.seriesName = sm[1].trim(); out.seriesNum = sm[2].replace(',', '.'); }
    out.title = String(out.title).replace(/\s*\([^)]*#[^)]*\)\s*$/, '');
  }
  var g = [], re = /\/genres\/([a-z0-9-]+)/g, gm;
  while ((gm = re.exec(html)) && g.length < 10) if (g.indexOf(gm[1]) === -1 && gm[1] !== 'new_releases') g.push(gm[1]);
  out.genresRaw = g;
  var dm = html.match(/data-testid="description"[\s\S]*?<span class="Formatted">([\s\S]*?)<\/span>/);
  var d = dm ? lbHtmlText_(dm[1]) : '';
  if (!d) { var md = html.match(/<meta (?:name="description"|property="og:description") content="([^"]*)"/); if (md) d = lbHtmlText_(md[1]); }
  if (d) out.description = d.slice(0, 1200);
  var pm = html.match(/(\d+)\s+pages,/);
  if (!out.pages && pm) out.pages = Number(pm[1]);
  return out.cover || out.title ? out : null;
}

function lbFromGoodreads_(isbn) {
  if (!isbn) return null;
  var html = lbFetch_('https://www.goodreads.com/book/isbn/' + isbn);
  return html ? lbParseGoodreads_(html) : null;
}

/** Пошук на Goodreads за назвою й автором (коли ISBN немає): перший результат. */
function lbFromGoodreadsSearch_(isbn, title, author) {
  if (!title) return null;
  var html = lbFetch_('https://www.goodreads.com/search?q=' + encodeURIComponent(title + ' ' + (author || '')));
  if (!html) return null;
  var m = html.match(/href="(\/book\/show\/[0-9][^"?#]*)/);
  if (!m) return null;
  var page = lbFetch_('https://www.goodreads.com' + m[1]);
  var out = page ? lbParseGoodreads_(page) : null;
  if (out) out.source = 'Goodreads (пошук)';
  return out;
}

function lbFromGoogle_(isbn, title, author) {
  var q = isbn ? 'isbn:' + isbn : 'intitle:' + title + (author ? '+inauthor:' + author.split(/\s+/).pop() : '');
  var txt = lbFetch_('https://www.googleapis.com/books/v1/volumes?maxResults=3&q=' + encodeURIComponent(q));
  if (!txt) return null;
  var d = JSON.parse(txt);
  var it = (d.items || [])[0];
  if (!it) return null;
  var v = it.volumeInfo || {};
  var img = v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail);
  var ids = (v.industryIdentifiers || []).filter(function (x) { return x.type === 'ISBN_13'; })[0];
  return { source: 'Google Books', title: v.title, author: (v.authors || []).join(', '), pages: v.pageCount, pub: lbPubCanon_(v.publisher),
    isbn: ids ? ids.identifier : '', cover: img ? String(img).replace(/^http:/, 'https:').replace('&edge=curl', '') : '',
    description: v.description ? lbHtmlText_(v.description).slice(0, 1200) : '',
    genresRaw: (v.categories || []).map(function (c) { return String(c).toLowerCase().replace(/[^a-z0-9]+/g, '-'); }) };
}

function lbFromOpenLibrary_(isbn, title, author) {
  if (isbn) {
    var txt = lbFetch_('https://openlibrary.org/isbn/' + isbn + '.json');
    if (!txt) return null;
    var d = JSON.parse(txt);
    return { source: 'Open Library', title: d.title, pages: d.number_of_pages, pub: lbPubCanon_((d.publishers || [])[0]),
      cover: d.covers && d.covers[0] > 0 ? 'https://covers.openlibrary.org/b/id/' + d.covers[0] + '-M.jpg' : '' };
  }
  var s = lbFetch_('https://openlibrary.org/search.json?limit=1&title=' + encodeURIComponent(title) + (author ? '&author=' + encodeURIComponent(author) : ''));
  if (!s) return null;
  var doc = (JSON.parse(s).docs || [])[0];
  if (!doc) return null;
  return { source: 'Open Library', title: doc.title, author: (doc.author_name || []).join(', '), pages: doc.number_of_pages_median,
    cover: doc.cover_i ? 'https://covers.openlibrary.org/b/id/' + doc.cover_i + '-M.jpg' : '', isbn: (doc.isbn || [])[0] };
}

/** Перевірка пошуку обкладинки: впишіть свій ISBN і запустіть. */
function lbTestCover() {
  console.log(JSON.stringify(lbLookup_({ isbn: '9786178903015' }), null, 2));
}

/**
 * Заповнює порожні «Обкладинка» (і ISBN, якщо знайдено) для книг із ISBN.
 * За один запуск до 40 книг, щоб не впертися в ліміт часу. Нічне оновлення робить це саме потроху.
 */
function lbFillCovers(limit) {
  // Працює до ~4,5 хвилини за запуск і запам'ятовує, де зупинилось. Запускайте повторно, поки в журналі не буде «ще не перевірено: 0».
  var started = Date.now(), budget = 270000;
  limit = limit || 1000;
  var ss = lbSs_();
  var lib = ss.getSheetByName(LB_SHEETS.library);
  var head = lib.getRange(1, 1, 1, lib.getLastColumn()).getDisplayValues()[0].map(lbKey_);
  var cI = lbCol_(head, ['ISBN']), cC = lbCol_(head, ['Обкладинка']), cT = lbCol_(head, ['Назва книги']), cA = lbCol_(head, ['Автор']);
  if (cC < 0) { console.log('Немає колонки «Обкладинка».'); return 0; }
  var vals = lib.getRange(2, 1, Math.max(1, lib.getLastRow() - 1), lib.getLastColumn()).getDisplayValues();
  var props = PropertiesService.getScriptProperties();
  var tried = {};
  try { tried = JSON.parse(props.getProperty('LB_COVER_TRIED3') || '{}'); } catch (e) { tried = {}; }
  var today = Math.floor(Date.now() / 86400000);
  var save = function () { try { props.setProperty('LB_COVER_TRIED3', JSON.stringify(tried)); } catch (e) { tried = {}; } };
  var keyOf = function (r) {
    var isbn = cI >= 0 ? String(r[cI]).replace(/[^0-9Xx]/g, '') : '';
    var raw = isbn || lbNorm_(r[cA] + ' ' + r[cT]);
    return raw ? Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, raw)).slice(0, 10) : '';
  };
  // не знайдене пробуємо знову через 14 днів
  var fresh = function (k) { return tried[k] && today - tried[k] < 14; };
  var n = 0, found = 0, stopped = false;
  for (var i = 0; i < vals.length && n < limit; i++) {
    if (vals[i][cC] || !vals[i][cT]) continue;
    var k = keyOf(vals[i]);
    if (!k || fresh(k)) continue;
    if (Date.now() - started > budget) { stopped = true; break; }
    var isbn = cI >= 0 ? String(vals[i][cI]).replace(/[^0-9Xx]/g, '') : '';
    var r = null;
    try { r = lbLookup_({ isbn: isbn, title: vals[i][cT], author: vals[i][cA] }); } catch (e) { r = null; }
    n++;
    if (r && r.cover) { lib.getRange(i + 2, cC + 1).setValue(r.cover); vals[i][cC] = r.cover; found++; delete tried[k]; }
    else tried[k] = today;
    if (r && r.isbn && cI >= 0 && !isbn) { var ri = String(r.isbn).replace(/[^0-9Xx]/g, ''); if (ri.length === 13 || ri.length === 10) lib.getRange(i + 2, cI + 1).setValue("'" + ri); }
    if (n % 5 === 0) save();
    Utilities.sleep(300);
  }
  save();
  var noCover = 0, left = 0;
  vals.forEach(function (r) { if (r[cT] && !r[cC]) { noCover++; var k = keyOf(r); if (k && !fresh(k)) left++; } });
  console.log('Перевірено зараз: ' + n + ', знайдено обкладинок: ' + found + '. Без обкладинки всього: ' + noCover + ', з них ще не перевірено: ' + left +
    (left ? ' — запустіть ще раз.' : ' — готово. Для решти обкладинку в інтернеті не знайдено; її можна вставити посиланням у картці книги.'));
  return found;
}

/** Перевірити заново всі книги без обкладинки (наприклад, після того як дописали ISBN). */
function lbFillCoversReset() { PropertiesService.getScriptProperties().deleteProperty('LB_COVER_TRIED3'); lbFillCovers(); }

/* ============================================================
 * Телеграм
 * ============================================================ */

function lbTgToken_() {
  var t = String(PropertiesService.getScriptProperties().getProperty('LB_TG_TOKEN') || '').trim();
  if (!t) throw new Error('Додайте LB_TG_TOKEN у Властивості скрипту (ключ від @BotFather).');
  return t;
}

function lbTgApi_(method, payload) {
  var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + lbTgToken_() + '/' + method, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify(payload || {})
  });
  var body = {};
  try { body = JSON.parse(res.getContentText()); } catch (err) {}
  return body;
}

function lbTgSend_(text) {
  var chat = PropertiesService.getScriptProperties().getProperty('LB_TG_CHAT_ID');
  if (!chat) throw new Error('Телеграм ще не підключено. Запустіть lbTelegramConnect.');
  // Телеграм приймає до 4096 символів
  var parts = [], s = String(text);
  while (s.length > 3900) { var cut = s.lastIndexOf('\n', 3900); if (cut < 1000) cut = 3900; parts.push(s.slice(0, cut)); s = s.slice(cut); }
  parts.push(s);
  parts.forEach(function (p) {
    var res = lbTgApi_('sendMessage', { chat_id: Number(chat), text: p, parse_mode: 'HTML', disable_web_page_preview: true });
    if (!res.ok) throw new Error('Телеграм не прийняв повідомлення: ' + (res.description || 'невідома помилка'));
  });
}

function lbEsc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

/**
 * Напишіть боту /start або будь-що, потім запустіть цю функцію.
 * Запам'ятовує ваш Телеграм, надсилає «Готово» і додає в чат кнопку «Бібліотека».
 */
function lbTelegramConnect() {
  var me = lbTgApi_('getMe', {});
  if (!me.ok) throw new Error('Бот не відповів: ' + (me.description || 'перевірте LB_TG_TOKEN'));
  var botName = '@' + me.result.username;
  lbTgApi_('deleteWebhook', {});
  var res = lbTgApi_('getUpdates', { limit: 100 });
  if (!res.ok) throw new Error('Бот ' + botName + ' не віддає повідомлення: ' + (res.description || ''));
  var msgs = (res.result || []).map(function (u) { return u.message || u.edited_message; })
    .filter(function (m) { return m && m.chat && m.chat.type === 'private' && m.from && !m.from.is_bot; });
  if (!msgs.length) throw new Error('Бот ' + botName + ' не отримав від вас жодного повідомлення. Перевірте, що пишете саме цьому боту ' +
    '(ключ у LB_TG_TOKEN від нього), надішліть йому будь-що, наприклад «привіт», і запустіть ще раз.');
  var m = msgs[msgs.length - 1];
  var props = PropertiesService.getScriptProperties();
  props.setProperty('LB_TG_CHAT_ID', String(m.chat.id));
  props.setProperty('LB_TG_USER_ID', String(m.from.id));
  lbTgSend_('Готово! Тепер я нагадуватиму про релізи бажанок за день до виходу і в день релізу 📚');
  var menu = lbTelegramMenu_();
  console.log('Телеграм підключено: ' + [m.from.first_name, m.from.last_name].filter(Boolean).join(' ') + '. ' + menu);
}

function lbTelegramMenu() { console.log(lbTelegramMenu_()); }

function lbTelegramMenu_() {
  var props = PropertiesService.getScriptProperties();
  // Якщо сторінка на GitHub Pages (LB_PAGE_URL), кнопка відкриває її; інакше — розгортання Apps Script.
  var page = String(props.getProperty('LB_PAGE_URL') || '').trim().replace(/[?#].*$/, '');
  var url = page || String(props.getProperty('LB_TG_APP_URL') || '').trim();
  var chat = props.getProperty('LB_TG_CHAT_ID');
  if (!url) return 'Кнопку міні-додатку ще не додано: впишіть LB_TG_APP_URL і запустіть lbTelegramMenu.';
  if (page && !/^https:\/\/[a-z0-9-]+\.github\.io\//i.test(page + '/')) return 'LB_PAGE_URL має бути посиланням https://….github.io/…';
  if (!page && !/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) return 'LB_TG_APP_URL має бути посиланням …/exec розгортання «Будь-хто».';
  if (!chat) return 'Спершу запустіть lbTelegramConnect.';
  var res = lbTgApi_('setChatMenuButton', { chat_id: Number(chat),
    menu_button: { type: 'web_app', text: 'Бібліотека', web_app: { url: url + '?tg=1' } } });
  lbTgApi_('setMyCommands', { commands: [
    { command: 'week', description: 'Підсумок тижня' },
    { command: 'month', description: 'Підсумок місяця' },
    { command: 'kyiv', description: 'Що чекає в Києві' },
    { command: 'help', description: 'Що я вмію' }
  ] });
  return res.ok ? 'Кнопку «Бібліотека» додано. Закрийте й відкрийте чат з ботом.' : 'Кнопку не додано: ' + (res.description || '');
}

/* ---------- бот відповідає на повідомлення (перевірка щохвилини) ---------- */

/** Тригер щохвилини: читає нові повідомлення боту і відповідає. Чужим не відповідає. */
function lbBotPoll() {
  var props = PropertiesService.getScriptProperties();
  var chat = props.getProperty('LB_TG_CHAT_ID');
  if (!chat || !props.getProperty('LB_TG_TOKEN')) return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return; // інша перевірка ще працює — наступна хвилина
  var offset = Number(props.getProperty('LB_TG_OFFSET') || 0);
  var res;
  try {
    res = lbTgApi_('getUpdates', { offset: offset || undefined, limit: 20, timeout: 0, allowed_updates: ['message', 'callback_query'] });
  } finally { lock.releaseLock(); }
  if (!res || !res.ok || !res.result || !res.result.length) return;
  var last = res.result[res.result.length - 1].update_id;
  props.setProperty('LB_TG_OFFSET', String(last + 1));
  res.result.forEach(function (u) {
    var q = u.callback_query;
    if (q && q.message && String(q.message.chat.id) === String(chat)) { try { lbBotButton_(q); } catch (err) { try { lbTgApi_('answerCallbackQuery', { callback_query_id: q.id, text: 'Не вийшло: ' + (err.message || err) }); } catch (e) {} } }
    var pm = u.message;
    if (pm && String(pm.chat.id) === String(chat) && (pm.photo || (pm.document && /^image\//.test(pm.document.mime_type || '')))) {
      try { lbBotPhoto_(pm); } catch (err) { try { lbTgSend_('Не вийшло прочитати скриншот: ' + lbEsc_(err.message || err)); } catch (e) {} }
    }
  });
  var msgs = res.result.map(function (u) { return u.message; })
    .filter(function (m) { return m && m.text && String(m.chat.id) === String(chat); });
  if (!msgs.length) return;
  var data = null;
  msgs.forEach(function (m) {
    try {
      data = data || lbReadAll_();
      lbTgSend_(lbBotAnswer_(m.text, data));
    } catch (err) {
      try { lbTgSend_('Не вийшло: ' + lbEsc_(err && err.message ? err.message : err)); } catch (e) {}
    }
  });
}

/** Скриншот у бот → Gemini → картка з кнопками «У бажанки» / «Замовила». */
function lbBotPhoto_(m) {
  var fileId = m.photo ? m.photo[m.photo.length - 1].file_id : m.document.file_id;
  var f = lbTgApi_('getFile', { file_id: fileId });
  if (!f.ok) throw new Error('Телеграм не віддав файл.');
  var blob = UrlFetchApp.fetch('https://api.telegram.org/file/bot' + lbTgToken_() + '/' + f.result.file_path).getBlob();
  var parts = [{ inline_data: { mime_type: 'image/jpeg', data: Utilities.base64Encode(blob.getBytes()) } }];
  if (m.caption) parts.push({ text: 'Підпис користувачки: ' + m.caption });
  var r = lbAiBooks_(parts);
  if (r.nokey) { lbTgSend_('Щоб я читала скриншоти, додайте GEMINI_API_KEY у властивості скрипта.'); return; }
  if (!r.items.length) { lbTgSend_('На скриншоті не знайшла книг. Спробуйте інший або додайте через кнопку «Бібліотека».'); return; }
  var props = PropertiesService.getScriptProperties();
  var pend = {}; try { pend = JSON.parse(props.getProperty('LB_BOT_PENDING') || '{}'); } catch (e) {}
  var keys = Object.keys(pend).sort(); while (keys.length > 15) delete pend[keys.shift()];
  var id = String(Date.now()).slice(-8);
  pend[id] = r.items;
  props.setProperty('LB_BOT_PENDING', JSON.stringify(pend));
  var lines = r.items.map(function (x) {
    return '📖 <b>' + lbEsc_(x.title) + '</b>' + (x.author ? ' — ' + lbEsc_(x.author) : '') +
      (x.series ? '\n   ' + lbEsc_(x.series) + (x.part ? ' #' + lbEsc_(x.part) : '') : '') +
      [x.pub, x.price ? x.price + ' грн' : '', x.release ? 'реліз ' + x.release : '', x.avail].filter(Boolean).map(function (s) { return '\n   ' + lbEsc_(s); }).join('');
  });
  var miss = r.items.some(function (x) { return !x.author; });
  lbTgApi_('sendMessage', { chat_id: m.chat.id, parse_mode: 'HTML', disable_web_page_preview: true,
    text: lines.join('\n\n') + (miss ? '\n\n⚠️ Не бачу автора — виправте потім у додатку.' : ''),
    reply_markup: { inline_keyboard: [[{ text: '✓ У бажанки', callback_data: 'w:' + id }, { text: '🧾 Замовила', callback_data: 'o:' + id }, { text: '✕', callback_data: 'x:' + id }]] } });
}
function lbBotButton_(q) {
  var p = String(q.data || '').split(':'), act = p[0], id = p[1];
  var props = PropertiesService.getScriptProperties();
  var pend = {}; try { pend = JSON.parse(props.getProperty('LB_BOT_PENDING') || '{}'); } catch (e) {}
  var items = pend[id];
  var done = function (txt) {
    lbTgApi_('answerCallbackQuery', { callback_query_id: q.id, text: txt });
    lbTgApi_('editMessageReplyMarkup', { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } });
    lbTgApi_('sendMessage', { chat_id: q.message.chat.id, text: txt, reply_to_message_id: q.message.message_id });
  };
  if (!items) return lbTgApi_('answerCallbackQuery', { callback_query_id: q.id, text: 'Ця картка вже неактуальна.' });
  delete pend[id]; props.setProperty('LB_BOT_PENDING', JSON.stringify(pend));
  if (act === 'x') return done('Добре, нічого не зберігаю.');
  var ok = items.filter(function (x) { return x.author; });
  if (!ok.length) return done('Немає автора — додайте книгу в додатку.');
  var rel = function (s) { s = String(s || ''); return /^\d{4}-\d{2}$/.test(s) ? s + '-01' : s; };
  var out = lbOrderSave_({ mode: act === 'o' ? 'order' : 'wish', items: ok.map(function (x) {
    return { title: x.title, author: x.author, series: x.series, part: x.part, total: x.total, pub: x.pub, price: x.price, release: rel(x.release), avail: x.avail, isbn: String(x.isbn || '').replace(/\D/g, '') };
  }) });
  done((act === 'o' ? '🧾 Записала як замовлені' : '✓ Додала в бажанки') + ': ' + ok.length + (out.updated ? ' (оновлено ' + out.updated + ')' : '') + '.');
}

function lbBotAnswer_(text, data) {
  var t = String(text).trim();
  var cmd = t.toLowerCase();
  if (/^\/(start|help|допомога)\b/.test(cmd)) return lbBotHelp_();
  if (/^\/(week|тиждень)\b/.test(cmd)) return lbWeekText_(data, lbToday_(), true);
  if (/^\/(month|місяць)\b/.test(cmd)) return lbMonthText_(data, lbToday_(), true);
  if (/^\/(kyiv|київ)\b/.test(cmd)) return lbKyivText_(data);
  var q = t.replace(/^\/(є|e|find|пошук)\s*/i, '').trim();
  if (q.length < 2) return 'Напишіть назву, автора або серію, наприклад: <b>Четверте крило</b>';
  return lbFindText_(q, data);
}

function lbBotHelp_() {
  return '📚 <b>Що я вмію</b>\n' +
    '• Напишіть назву, автора або серію, і я скажу, чи є книга в бібліотеці, де вона стоїть, чи є в бажанках або серед проданих.\n' +
    '• Надішліть скриншот анонсу чи замовлення — я прочитаю книги і запропоную додати їх у бажанки або як замовлені.\n' +
    '• /week — підсумок тижня, /month — підсумок місяця, /kyiv — книги в Києві за пріоритетом.\n' +
    '• Сама нагадую про релізи, позичені книги і замовлення, які вийшли, але ще не відправлені.\n' +
    'Кнопка <b>Бібліотека</b> внизу відкриває весь додаток.';
}

function lbFindText_(q, data) {
  var words = lbNorm_(q).split(' ').filter(Boolean);
  var hit = function (parts) { var s = lbNorm_(parts.join(' ')); return words.every(function (w) { return s.indexOf(w) !== -1; }); };
  var b = data.books.filter(function (x) { return hit([x.title, x.author, x.series, x.pub]); });
  var w = data.wish.filter(function (x) { return hit([x.title, x.author, x.series, x.pub]); });
  var s = data.sold.filter(function (x) { return hit([x.title, x.author, x.series]); });
  if (!b.length && !w.length && !s.length) return '❌ «' + lbEsc_(q) + '» ніде немає: ні в бібліотеці, ні в бажанках, ні серед проданих.';
  var out = [];
  if (b.length) out.push('✅ <b>У бібліотеці (' + b.length + ')</b>\n' + b.slice(0, 10).map(function (x) {
    var where = x.avail === 'позичена' ? 'позичена' + (x.lentTo ? ' (' + lbEsc_(x.lentTo) + ')' : '')
      : x.avail && x.avail !== 'бібліотека' ? lbEsc_(x.avail) + (x.avail === 'Київ' && x.prio ? ', пріоритет ' + lbEsc_(x.prio) : '')
      : lbEsc_(x.shelf || 'полицю не вказано');
    return '• <b>' + lbEsc_(x.title) + '</b> — ' + lbEsc_(x.author) + (x.series && x.series !== '-' && x.type === 'Серія' ? ' (' + lbEsc_(x.series) + (x.num ? ' #' + lbEsc_(x.num) : '') + ')' : '') +
      '\n   📍 ' + where + ' · ' + lbEsc_(x.status || '');
  }).join('\n') + (b.length > 10 ? '\n…і ще ' + (b.length - 10) : ''));
  if (w.length) out.push('🛒 <b>У бажанках (' + w.length + ')</b>\n' + w.slice(0, 8).map(function (x) {
    return '• <b>' + lbEsc_(x.title) + '</b> — ' + lbEsc_(x.author) + ' · ' + lbEsc_(x.status || '') + (x.release ? ' · реліз ' + lbHuman_(x.release) : '');
  }).join('\n'));
  if (s.length) out.push('💰 <b>Продано (' + s.length + ')</b>\n' + s.slice(0, 5).map(function (x) { return '• ' + lbEsc_(x.title) + ' — ' + lbEsc_(x.author); }).join('\n'));
  return out.join('\n\n');
}

/* ============================================================
 * Нагадування і підсумки
 * ============================================================ */

/**
 * Вмикає все автоматичне: щоденні нагадування о LB_REMIND_HOUR, нічне впорядкування о LB_NIGHT_HOUR,
 * відповіді бота (перевірка щохвилини). Можна запускати повторно.
 */
function lbInstallReminders() {
  var want = { lbDailyReminders: 1, lbNightly: 1, lbBotPoll: 1, lbSeriesNews: 1 };
  ScriptApp.getProjectTriggers().forEach(function (t) { if (want[t.getHandlerFunction()]) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('lbDailyReminders').timeBased().everyDays(1).atHour(LB_REMIND_HOUR).create();
  ScriptApp.newTrigger('lbNightly').timeBased().everyDays(1).atHour(LB_NIGHT_HOUR).create();
  ScriptApp.newTrigger('lbBotPoll').timeBased().everyMinutes(1).create();
  ScriptApp.newTrigger('lbSeriesNews').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(5).create();
  try { console.log(lbTelegramMenu_()); } catch (err) {}
  console.log('Увімкнено: нагадування щодня близько ' + LB_REMIND_HOUR + ':00, нічне оновлення близько ' + LB_NIGHT_HOUR +
    ':00, відповіді бота щохвилини (' + lbTz_() + ').');
}

/** Щоденний запуск (тригер). Нічого не надсилає, якщо сказати нічого. Пн — підсумок тижня, 1-го — підсумок місяця. */
function lbDailyReminders() {
  var props = PropertiesService.getScriptProperties();
  var today = lbToday_();
  if (props.getProperty('LB_LAST_REMIND') === today) return; // уже надсилали сьогодні
  var data = lbReadAll_();
  var msgs = [];
  var daily = lbDailyText_(data, today);
  if (daily) msgs.push(daily);
  if (lbWeekday_(today) === 1) msgs.push(lbWeekText_(data, today, false));
  if (today.slice(8) === '01') msgs.push(lbMonthText_(data, today, false));
  msgs.forEach(lbTgSend_);
  props.setProperty('LB_LAST_REMIND', today);
}

/** Перевірка без чекання: надсилає вам релізи найближчих 14 днів і підсумок тижня. */
function lbTestReminders() {
  var today = lbToday_();
  var data = lbReadAll_();
  var end = lbAddDays_(today, 14);
  var list = data.wish.filter(function (w) { return w.release && w.release >= today && w.release <= end && w.status !== 'В бібліотеці'; })
    .sort(function (a, b) { return a.release < b.release ? -1 : 1; });
  lbTgSend_('🔔 <b>Тест нагадувань.</b> Релізи найближчих 14 днів:\n' +
    (list.length ? list.map(function (w) { return lbReminderLine_(w, true); }).join('\n') : 'немає'));
  lbTgSend_(lbWeekText_(data, today, true));
  console.log('Надіслано тест: ' + list.length + ' релізів + підсумок тижня.');
}

/** v1: лише релізи сьогодні/завтра (лишено для сумісності). */
function lbReminderText_(today) { return lbReleaseText_(lbReadAll_(), today); }

function lbReleaseText_(data, today) {
  var tomorrow = lbAddDays_(today, 1);
  var active = data.wish.filter(function (w) { return w.release && w.status !== 'В бібліотеці'; });
  var t = active.filter(function (w) { return w.release === today; });
  var n = active.filter(function (w) { return w.release === tomorrow; });
  var parts = [];
  if (t.length) parts.push('📚 <b>Сьогодні реліз</b> (' + lbHuman_(today) + '):\n' + t.map(function (w) { return lbReminderLine_(w); }).join('\n'));
  if (n.length) parts.push('⏰ <b>Завтра реліз</b> (' + lbHuman_(tomorrow) + '):\n' + n.map(function (w) { return lbReminderLine_(w); }).join('\n'));
  return parts.join('\n\n');
}

/** Замовлено (без ТТН), а реліз був щонайменше LB_NOT_SENT_DAYS днів тому. */
function lbNotSent_(data, today) {
  var limit = lbAddDays_(today, -LB_NOT_SENT_DAYS);
  return data.wish.filter(function (w) { return w.status === 'Замовлено' && !w.ttn && w.release && w.release <= limit; })
    .sort(function (a, b) { return a.release < b.release ? -1 : 1; });
}

function lbDailyText_(data, today) {
  var parts = [];
  var rel = lbReleaseText_(data, today);
  if (rel) parts.push(rel);
  // «вийшло, але не відправили» — у день, коли минає LB_NOT_SENT_DAYS днів (далі — у підсумку тижня)
  var limit = lbAddDays_(today, -LB_NOT_SENT_DAYS);
  var ns = lbNotSent_(data, today).filter(function (w) { return w.release === limit; });
  if (ns.length) parts.push('📦 <b>Вийшло ' + LB_NOT_SENT_DAYS + ' днів тому, а ТТН досі немає</b>. Може, варто написати магазину:\n' +
    ns.map(function (w) { return lbReminderLine_(w, true) + (w.where || w.site ? ' · ' + lbEsc_(w.where || lbSite_(w.site)) : '') + (w.order ? ' № ' + lbEsc_(w.order) : ''); }).join('\n'));
  // позичені: сьогодні повернути
  var due = data.books.filter(function (b) { return b.avail === 'позичена' && b.lentDue === today; });
  if (due.length) parts.push('🤝 <b>Сьогодні мають повернути</b>:\n' + due.map(function (b) { return '• ' + lbEsc_(b.title) + (b.lentTo ? ' — ' + lbEsc_(b.lentTo) : ''); }).join('\n'));
  return parts.join('\n\n');
}

function lbInRange_(iso, from, to) { return iso && iso >= from && iso <= to; }

function lbWeekText_(data, today, now) {
  var from = lbAddDays_(today, -7), to = lbAddDays_(today, -1);
  if (now) { from = lbAddDays_(today, -6); to = today; }
  var read = data.books.filter(function (b) { return lbInRange_(b.readOn, from, to); });
  var started = data.books.filter(function (b) { return lbInRange_(b.started, from, to); });
  var bought = data.books.filter(function (b) { return lbInRange_(b.bought, from, to); });
  var reading = data.books.filter(function (b) { return lbKey_(b.status) === 'читаю'; });
  var spent = bought.reduce(function (a, b) { return a + (b.price || 0); }, 0);
  var nextEnd = lbAddDays_(today, 7);
  var soon = data.wish.filter(function (w) { return w.release && w.release >= today && w.release <= nextEnd && w.status !== 'В бібліотеці'; })
    .sort(function (a, b) { return a.release < b.release ? -1 : 1; });
  var ns = lbNotSent_(data, today);
  var lentLate = data.books.filter(function (b) { return b.avail === 'позичена' && b.lentDue && b.lentDue < today; });
  var onWay = data.wish.filter(function (w) { return w.ttn && ['Відправлено', 'Створено ТТН', 'В дорозі'].indexOf(w.status) !== -1; });
  var kyivParcel = data.books.filter(function (b) { return b.avail === 'Київ' && b.parcel; });

  var s = '🗓 <b>Тиждень ' + lbHuman_(from).slice(0, 5) + '–' + lbHuman_(to).slice(0, 5) + '</b>\n';
  s += '📖 Прочитано: <b>' + read.length + '</b>' + (read.length ? ' (' + read.reduce(function (a, b) { return a + (b.pages || 0); }, 0) + ' стор.)' : '') + '\n';
  read.forEach(function (b) { s += '   • ' + lbEsc_(b.title) + (b.rating ? ' ' + lbStars_(b.rating) : '') + '\n'; });
  if (started.length) s += '▶️ Почала: ' + started.map(function (b) { return lbEsc_(b.title); }).join(', ') + '\n';
  if (reading.length) s += '📚 Зараз читаю: ' + reading.map(function (b) { return lbEsc_(b.title); }).join(', ') + '\n';
  if (data.cols && data.cols.bought) s += '🛍 Додано книг: <b>' + bought.length + '</b>' + (spent ? ' на ' + lbMoney_(spent) : '') + '\n';
  if (onWay.length) s += '🚚 В дорозі: ' + onWay.length + ' кн.\n';
  if (kyivParcel.length) s += '✈️ Посилка з Києва: ' + kyivParcel.length + ' кн.\n';
  if (soon.length) s += '\n⏰ <b>Релізи наступного тижня</b>\n' + soon.map(function (w) { return lbReminderLine_(w, true); }).join('\n') + '\n';
  if (ns.length) s += '\n📦 <b>Вийшли, але ще не відправлені</b>\n' + ns.map(function (w) { return lbReminderLine_(w, true) + (w.where || w.site ? ' · ' + lbEsc_(w.where || lbSite_(w.site)) : ''); }).join('\n') + '\n';
  if (lentLate.length) s += '\n🤝 <b>Позичені, час повернути</b>\n' + lentLate.map(function (b) { return '• ' + lbEsc_(b.title) + (b.lentTo ? ' — ' + lbEsc_(b.lentTo) : '') + ' (до ' + lbHuman_(b.lentDue) + ')'; }).join('\n') + '\n';
  if (!data.cols || !data.cols.readOn) s += '\n<i>Щоб рахувати прочитане за тиждень, потрібна колонка «Дата прочитання».</i>';
  return s.trim();
}

function lbMonthText_(data, today, now) {
  // попередній місяць (або поточний, якщо now)
  var p = today.split('-').map(Number);
  var y = p[0], m = p[1];
  if (!now) { m -= 1; if (m === 0) { m = 12; y -= 1; } }
  var ym = y + '-' + ('0' + m).slice(-2);
  var pm = m === 1 ? (y - 1) + '-12' : y + '-' + ('0' + (m - 1)).slice(-2);
  var inM = function (iso, key) { return iso && iso.slice(0, 7) === key; };
  var read = data.books.filter(function (b) { return inM(b.readOn, ym); });
  var readPrev = data.books.filter(function (b) { return inM(b.readOn, pm); });
  var bought = data.books.filter(function (b) { return inM(b.bought, ym); });
  var pages = read.reduce(function (a, b) { return a + (b.pages || 0); }, 0);
  var rated = read.filter(function (b) { return b.rating; });
  var avg = rated.length ? rated.reduce(function (a, b) { return a + b.rating; }, 0) / rated.length : 0;
  var best = rated.slice().sort(function (a, b) { return b.rating - a.rating; })[0];
  var names = ['', 'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
  var s = '📆 <b>' + names[m] + ' ' + y + '</b>\n';
  s += '📖 Прочитано: <b>' + read.length + '</b> кн., ' + pages + ' стор.' + (readPrev.length || read.length ? ' (минулого місяця ' + readPrev.length + ')' : '') + '\n';
  if (rated.length) s += '⭐ Середня оцінка: ' + avg.toFixed(1) + (best ? ', найкраща: ' + lbEsc_(best.title) + ' ' + lbStars_(best.rating) : '') + '\n';
  read.forEach(function (b) { s += '   • ' + lbEsc_(b.title) + ' — ' + lbEsc_(b.author) + (b.rating ? ' ' + lbStars_(b.rating) : '') + '\n'; });
  if (data.cols && data.cols.bought) s += '🛍 Додано в бібліотеку: <b>' + bought.length + '</b> на ' + lbMoney_(bought.reduce(function (a, b) { return a + (b.price || 0); }, 0)) + '\n';
  var unread = data.books.filter(function (b) { return lbKey_(b.status) === 'не читала' && ['продана', 'подарована'].indexOf(b.avail) === -1; }).length;
  s += '📚 Непрочитаних у бібліотеці: ' + unread;
  if (!data.cols || !data.cols.readOn) s += '\n<i>Щоб рахувати прочитане за місяць, потрібна колонка «Дата прочитання».</i>';
  return s;
}

function lbKyivText_(data) {
  var k = data.books.filter(function (b) { return b.avail === 'Київ'; });
  if (!k.length) return 'У Києві книг немає.';
  var groups = {};
  k.forEach(function (b) { var p = b.parcel ? '0' : (b.prio || '9'); (groups[p] = groups[p] || []).push(b); });
  return '🏠 <b>Книги в Києві: ' + k.length + '</b>\n' + Object.keys(groups).sort().map(function (p) {
    var label = p === '0' ? '✈️ У посилці' : p === '9' ? 'Без пріоритету' : 'Пріоритет ' + p;
    return '\n<b>' + label + '</b> (' + groups[p].length + ')\n' + groups[p].map(function (b) { return '• ' + lbEsc_(b.title) + ' — ' + lbEsc_(b.author) + (b.parcel ? ' · ' + lbEsc_(b.parcel) : ''); }).join('\n');
  }).join('\n');
}

function lbReminderLine_(w, withDate) {
  var s = '• ' + (withDate && w.release ? lbHuman_(w.release) + ' · ' : '') + lbEsc_(w.author) + ' — <b>' + lbEsc_(w.title) + '</b>';
  if (w.series) s += ' (' + lbEsc_(w.series) + (w.part ? ' #' + lbEsc_(w.part) : '') + ')';
  if (w.pub) s += ', ' + lbEsc_(w.pub);
  if (w.status) s += ' · ' + lbEsc_(w.status);
  if (w.price != null) s += ' · ' + w.price + ' грн';
  return s;
}

function lbStars_(r) { var n = Math.round(Number(r) || 0); return '⭐'.repeat ? '⭐'.repeat(n) : new Array(n + 1).join('⭐'); }
function lbMoney_(n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' грн'; }
function lbSite_(url) { return String(url || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, ''); }
function lbWeekday_(iso) { var p = iso.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay(); }

function lbAddDays_(iso, n) {
  var p = iso.split('-');
  var d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n));
  return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
}

function lbHuman_(iso) { var p = String(iso).split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }

/* ============================================================
 * Нічне впорядкування таблиці
 * ============================================================ */

/**
 * Щоночі: сортування і нумерація бібліотеки, дані серій, видавництва, сортування бажанок (вашими функціями),
 * прибирання з бажанок книг «В бібліотеці», які вже точно є в бібліотеці, і потроху обкладинки.
 * Пише в Лог. Якщо щось не вийшло — надсилає в Телеграм.
 */
function lbNightly() {
  var ss = lbSs_();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(120000)) return;
  var res, cleaned = 0, onSale = 0;
  try {
    cleaned = lbCleanWish_(ss);
    onSale = lbWishOnSale_(ss);
    res = lbTidy_(ss);
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  try { lbEnsureNewsTrigger_(); } catch (err) {}
  var covers = 0;
  try { covers = lbFillCovers(25); } catch (err) { res.skipped.push('обкладинки: ' + err.message); }
  lbLog_('🌙 Нічне оновлення', '', '', 'Зроблено: ' + res.done.join(', ') + (cleaned ? '; прибрано з бажанок: ' + cleaned : '') + (onSale ? '; вийшли (→ Є у продажу): ' + onSale : '') +
    (covers ? '; обкладинок: ' + covers : '') + (res.skipped.length ? '; пропущено: ' + res.skipped.join('; ') : ''));
  var props = PropertiesService.getScriptProperties();
  var warn = res.skipped.join('\n');
  if (warn && props.getProperty('LB_LAST_NIGHT_WARN') !== warn) {
    props.setProperty('LB_LAST_NIGHT_WARN', warn);
    try { lbTgSend_('🌙 Нічне оновлення таблиці: дещо пропущено.\n' + lbEsc_(warn)); } catch (err) {}
  }
}

/** Бажанки з «Передзамовлення»/«Анонс», у яких настала дата релізу, → «Є у продажу». Лише точна дата (день), не місяць. */
function lbWishOnSale_(ss) {
  var sh = ss.getSheetByName(LB_SHEETS.wish);
  var W = lbSheet_(ss, LB_SHEETS.wish), gw = lbGetter_(W.head);
  var col = W.head[lbKey_('Наявність')];
  if (col === undefined || !lbHas_(W.head, ['Реліз'])) return 0;
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var done = [];
  W.rows.forEach(function (r, i) {
    var av = gw(r, ['Наявність']);
    if (av !== 'Передзамовлення' && av !== 'Анонс') return;
    if (gw(r, ['Статус']) === 'В бібліотеці') return;
    var d = lbDate_(gw(r, ['Реліз']));
    if (!d || d > today) return;
    sh.getRange(i + 2, col + 1).setValue('Є у продажу');
    done.push(gw(r, ['Автор']) + ' — ' + gw(r, ['Назва']));
  });
  if (done.length) lbLog_('📗 Вийшли з друку', '', '', 'Наявність → «Є у продажу»: ' + done.join('; '));
  return done.length;
}

/** Прибирає з бажанок рядки зі статусом «В бібліотеці», якщо така книга (автор + назва) вже є в бібліотеці. */
function lbCleanWish_(ss) {
  var L = lbSheet_(ss, LB_SHEETS.library), g = lbGetter_(L.head);
  var have = {};
  L.rows.forEach(function (r) { have[lbNorm_(g(r, ['Автор'])) + '|' + lbNorm_(g(r, ['Назва книги']))] = 1; });
  var sh = ss.getSheetByName(LB_SHEETS.wish);
  var W = lbSheet_(ss, LB_SHEETS.wish), gw = lbGetter_(W.head);
  var del = [];
  W.rows.forEach(function (r, i) {
    if (gw(r, ['Статус']) !== 'В бібліотеці') return;
    if (have[lbNorm_(gw(r, ['Автор'])) + '|' + lbNorm_(gw(r, ['Назва']))]) del.push({ row: i + 2, t: gw(r, ['Назва']), a: gw(r, ['Автор']) });
  });
  del.sort(function (a, b) { return b.row - a.row; }).forEach(function (d) { sh.deleteRow(d.row); });
  if (del.length) lbLog_('🧹 Прибрано з бажанок', '', '', del.map(function (d) { return d.a + ' — ' + d.t; }).join('; '));
  return del.length;
}

/**
 * Тропи книги: Gemini пропонує до 6 тропів за описом (спершу з тих, що вже є у вас).
 * req = {title, author, series, isbn, pub, description, known: [ваші тропи]}
 */
function lbApiTropes(initData, key, req) {
  return lbRun_(initData, key, function () {
    req = req || {};
    if (!req.title) return { tropes: [] };
    var known = (req.known || []).map(String).filter(Boolean).slice(0, 120);
    var desc = String(req.description || '');
    if (desc.length < 80) {
      try { var y = lbFromBook_(req.isbn || '', req.title, req.author || '', req.pub || ''); if (y && y.attrs && y.attrs['Опис']) desc = y.attrs['Опис']; } catch (e) {}
    }
    var prompt = 'Визнач літературні тропи книги для особистого обліку, як на українських книжкових сайтах ' +
      '(наприклад: вороги до коханців, морально сірий герой, мафія, сильна героїня, повільне горіння, фейкові стосунки, знайдена родина, обраний, академія магії). ' +
      'Пиши українською, з малої літери, 1–4 слова. Якщо підходить троп з цього списку — пиши точно як у списку: ' + JSON.stringify(known) + '. ' +
      'Поверни JSON {"tropes":["до 6 тропів"]}. Якщо не впевнена — {"tropes":[]}.\n' +
      'Книга: «' + String(req.title) + '»' + (req.author ? ', автор ' + req.author : '') + (req.series ? ', серія «' + req.series + '»' : '') + '.' + (desc ? '\nОпис: ' + desc.slice(0, 2500) : '');
    var r = lbGemini_([], prompt);
    if (!r) return { nokey: true };
    var out = [];
    (Array.isArray(r.tropes) ? r.tropes : []).forEach(function (t) {
      t = String(t || '').replace(/[,;]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 40);
      if (t && out.indexOf(t) === -1) out.push(t);
    });
    return { tropes: out.slice(0, 6), described: !!desc };
  });
}

/** Запустіть один раз: додає колонки «Тропи» і «Враження» в кінець листа «Облік бібліотеки» (якщо їх ще нема). */
function lbAddTagColumns() {
  var sh = lbSs_().getSheetByName(LB_SHEETS.library);
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  var keys = head.map(lbKey_), added = [];
  ['Тропи', 'Враження'].forEach(function (h) {
    if (keys.indexOf(lbKey_(h)) !== -1) return;
    var col = sh.getLastColumn() + 1;
    if (sh.getMaxColumns() < col) sh.insertColumnsAfter(sh.getMaxColumns(), 1);
    sh.getRange(1, col).setValue(h);
    keys.push(lbKey_(h)); added.push(h);
  });
  Logger.log(added.length ? 'Додано колонки: ' + added.join(', ') : 'Колонки вже є.');
  return added;
}

/* ============================================================
 * v8. Видавництва — один довідник
 * «Правильна назва»: [варіанти написання]. Довідник у коді (а не окремим листом): змінюється рідко,
 * а нові дублі lbPublishersPreview знаходить сама і показує. Регістр, пробіли, дефіси й лапки
 * не важать: «Book Chef», «BOOKCHEF» і «Bookchef» — одне й те саме.
 * ============================================================ */
var LB_PUBLISHERS = {
  'А-ба-ба-га-ла-ма-га': ['А-ба-ба', 'Абабагаламага', 'Видавництво А-ба-ба-га-ла-ма-га', 'A-BA-BA-HA-LA-MA-HA'],
  'BookChef': ['Book Chef', 'Bookchef', 'Букшеф'],
  'Книголав': ['Knigolove'],
  'Nebo Publishing': ['Nebo BookLab Publishing', 'Nebo BookLab', 'Nebo', 'Небо', 'Небо Publishing']
};
var LB_PUB_SHEETS = [['library', 'Облік бібліотеки'], ['wish', 'Бажанки'], ['series', 'Серії'], ['catalog', 'Каталог книг']];

/** Ключ для порівняння: без регістру, пробілів, дефісів, лапок і крапок. */
function lbPubKey_(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/ґ/g, 'г').replace(/[\s\-–—_.,:;'’`"ʼ«»()]/g, '');
}
/** Те саме + латинські літери, що виглядають як кириличні (A/А, C/С, O/О …), вважаються однаковими. */
function lbPubKey2_(s) {
  var map = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', I: 'І', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У' };
  return lbPubKey_(String(s == null ? '' : s).toUpperCase().replace(/[ABCEHIKMOPTXY]/g, function (c) { return map[c]; }));
}
var LB_PUB_MAP_ = null;
function lbPubMap_() {
  if (LB_PUB_MAP_) return LB_PUB_MAP_;
  var m = {};
  Object.keys(LB_PUBLISHERS).forEach(function (canon) {
    m[lbPubKey_(canon)] = canon;
    LB_PUBLISHERS[canon].forEach(function (v) { m[lbPubKey_(v)] = canon; });
  });
  LB_PUB_MAP_ = m;
  return m;
}
/** Правильна назва видавництва з довідника; якщо його там немає — назва як є (без зайвих пробілів). */
function lbPubCanon_(p) {
  var s = String(p == null ? '' : p).replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return lbPubMap_()[lbPubKey_(s)] || s;
}

/** План змін: які назви на що міняються, у яких клітинках, і що варто перевірити вручну. */
function lbPubPlan_(ss) {
  var sheets = [], counts = {};
  LB_PUB_SHEETS.forEach(function (x) {
    var sh = ss.getSheetByName(x[1]);
    if (!sh || sh.getLastRow() < 2) return;
    var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0].map(lbKey_);
    var col = lbCol_(head, ['Видавництво']);
    if (col < 0) return;
    var rng = sh.getRange(2, col + 1, sh.getLastRow() - 1, 1);
    var vals = rng.getValues().map(function (r) { return r[0]; });
    var formulas = rng.getFormulas().map(function (r) { return r[0]; });
    sheets.push({ kind: x[0], name: x[1], sh: sh, col: col, rng: rng, vals: vals, formulas: formulas });
    vals.forEach(function (v, i) { var t = String(v == null ? '' : v); if (t.trim() && !formulas[i]) counts[t] = (counts[t] || 0) + 1; });
  });
  // 1) довідник; 2) однакові з точністю до регістру/пробілів/схожих літер — до найчастішого написання
  var fix = {}, groups = {};
  Object.keys(counts).forEach(function (raw) {
    var canon = lbPubCanon_(raw);
    var k2 = lbPubKey2_(canon);
    (groups[k2] = groups[k2] || {})[canon] = (groups[k2][canon] || 0) + counts[raw];
    if (canon !== raw) fix[raw] = canon;
  });
  var known = {}; Object.keys(LB_PUBLISHERS).forEach(function (c) { known[c] = 1; });
  Object.keys(groups).forEach(function (k2) {
    var names = Object.keys(groups[k2]);
    if (names.length < 2) return;
    var best = names.filter(function (n) { return known[n]; })[0] ||
      names.sort(function (a, b) { return groups[k2][b] - groups[k2][a] || a.localeCompare(b); })[0];
    Object.keys(counts).forEach(function (raw) { var c = fix[raw] || raw; if (lbPubKey2_(c) === k2 && c !== best) fix[raw] = best; });
  });
  // 3) схожі, але не впевнена — лише показати
  var finals = {}; Object.keys(counts).forEach(function (raw) { var c = fix[raw] || raw; finals[c] = (finals[c] || 0) + counts[raw]; });
  var fl = Object.keys(finals), suspect = [];
  for (var i = 0; i < fl.length; i++) for (var j = i + 1; j < fl.length; j++) {
    var a = lbPubKey2_(fl[i]), b = lbPubKey2_(fl[j]);
    if (a.length < 4 || b.length < 4) continue;
    if (a.indexOf(b) !== -1 || b.indexOf(a) !== -1 || lbDice_(fl[i], fl[j]) >= 0.8) suspect.push(fl[i] + ' (' + finals[fl[i]] + ') ↔ ' + fl[j] + ' (' + finals[fl[j]] + ')');
  }
  var cells = 0, perSheet = [];
  sheets.forEach(function (x) {
    x.next = x.vals.map(function (v, i) { var t = String(v == null ? '' : v); return !x.formulas[i] && fix[t] ? fix[t] : v; });
    x.changed = x.next.filter(function (v, i) { return v !== x.vals[i]; }).length;
    cells += x.changed;
    perSheet.push(x.name + ': ' + x.changed);
  });
  // випадаючий список у колонці «Видавництво» (якщо він є)
  var dv = [];
  sheets.forEach(function (x) {
    var rule = null;
    try { rule = x.sh.getRange(2, x.col + 1).getDataValidation(); } catch (e) {}
    if (!rule || rule.getCriteriaType() !== SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) return;
    var list = rule.getCriteriaValues()[0].map(String);
    var next = [];
    list.concat(Object.keys(finals)).forEach(function (v) { var c = fix[v] || lbPubCanon_(v); if (c && next.indexOf(c) === -1) next.push(c); });
    next.sort(function (a, b) { return a.localeCompare(b, 'uk'); });
    if (next.join('|') !== list.slice().sort(function (a, b) { return a.localeCompare(b, 'uk'); }).join('|')) dv.push({ x: x, rule: rule, list: list, next: next });
  });
  return { fix: fix, counts: counts, sheets: sheets, cells: cells, perSheet: perSheet, suspect: suspect, dv: dv };
}
function lbPubPlanText_(p) {
  var keys = Object.keys(p.fix).sort(function (a, b) { return p.fix[a].localeCompare(p.fix[b], 'uk') || a.localeCompare(b, 'uk'); });
  var out = [];
  out.push(keys.length ? 'Зміниться назв: ' + keys.length + ', клітинок: ' + p.cells + ' (' + p.perSheet.join(', ') + ').' : 'Змінювати нічого не треба ✓');
  keys.forEach(function (k) { out.push('  «' + k + '» (' + p.counts[k] + ') → «' + p.fix[k] + '»'); });
  p.dv.forEach(function (d) { out.push('Випадаючий список «Видавництво» на листі «' + d.x.name + '» теж оновиться: ' + d.list.length + ' → ' + d.next.length + ' назв.'); });
  if (p.suspect.length) {
    out.push('', 'Схожі назви — НЕ змінюю, перевірте самі (якщо це одне видавництво, напишіть Claude, він додасть у довідник):');
    p.suspect.slice(0, 40).forEach(function (t) { out.push('  ' + t); });
  }
  return out.join('\n');
}
/** Крок 1 (нічого не змінює): показує в журналі, які назви видавництв зміняться і де. */
function lbPublishersPreview() {
  var p = lbPubPlan_(lbSs_());
  var t = lbPubPlanText_(p);
  console.log(t);
  return t;
}
/** Крок 2 (після «так»): виправляє назви видавництв на всіх листах. Усе записується в «Лог». */
function lbPublishersApply() {
  var ss = lbSs_();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Таблиця зараз оновлюється. Спробуйте за хвилину.');
  try {
    var p = lbPubPlan_(ss);
    // спершу випадаючий список (щоб таблиця не відхилила нові назви), потім самі назви
    p.dv.forEach(function (d) {
      var nr = d.rule.copy().requireValueInList(d.next, true).build();
      d.x.sh.getRange(2, d.x.col + 1, Math.max(1, d.x.sh.getMaxRows() - 1), 1).setDataValidation(nr);
    });
    p.sheets.forEach(function (x) {
      if (!x.changed) return;
      if (x.formulas.some(Boolean)) x.next.forEach(function (v, i) { if (v !== x.vals[i]) x.sh.getRange(i + 2, x.col + 1).setValue(v); });
      else x.rng.setValues(x.next.map(function (v) { return [v]; }));
    });
    SpreadsheetApp.flush();
    var keys = Object.keys(p.fix);
    if (keys.length || p.dv.length) lbLog_('🏢 Видавництва: один довідник', '', '', ('Клітинок: ' + p.cells + ' (' + p.perSheet.join(', ') + '). ' +
      keys.map(function (k) { return k + ' → ' + p.fix[k] + ' (' + p.counts[k] + ')'; }).join('; ')).slice(0, 45000));
    var t = keys.length ? 'Готово ✓ Виправлено клітинок: ' + p.cells + '. Подробиці — у листі «Лог».' : 'Змінювати нічого не треба ✓';
    if (p.suspect.length) t += '\nСхожі назви, які я не чіпала:\n  ' + p.suspect.slice(0, 40).join('\n  ');
    console.log(t);
    return t;
  } finally { lock.releaseLock(); }
}

/* ============================================================
 * v8. Дата замовлення (колонка в кінці «Бажанок»)
 * ============================================================ */
/** Запустіть один раз: додає колонку «Дата замовлення» в кінець листа «Бажанки» (якщо її ще нема). */
function lbAddOrderDateColumn() {
  var sh = lbSs_().getSheetByName(LB_SHEETS.wish);
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0].map(lbKey_);
  if (head.indexOf(lbKey_('Дата замовлення')) !== -1) { console.log('Колонка «Дата замовлення» вже є ✓'); return; }
  var col = sh.getLastColumn() + 1;
  if (sh.getMaxColumns() < col) sh.insertColumnsAfter(sh.getMaxColumns(), 1);
  sh.getRange(1, col).setValue('Дата замовлення');
  sh.getRange(2, col, Math.max(1, sh.getMaxRows() - 1), 1).setNumberFormat('dd.mm.yyyy');
  lbLog_('➕ Нова колонка', 'Бажанки', '', 'Дата замовлення (колонка ' + col + ')');
  console.log('Додано колонку «Дата замовлення» (колонка ' + col + ') ✓ Тепер дата ставиться сама, коли статус стає «Замовлено».');
}

/* ============================================================
 * v8. Нова пошта — модуль додатку
 * Те саме, що npUpdate + npSyncBooksFromNp_, але колонки шукаються за заголовками.
 * Перевіряє лише відомі ТТН, статус бажанки рухає лише вперед, нічого не пише,
 * якщо таблиця змінилася під час запиту. Ключ — NP_API_KEY у властивостях скрипту.
 * ============================================================ */
var LB_NP_HEADS = ['Статус НП', 'НП: остання перевірка', 'НП: помилка перевірки', 'НП: перевірена ТТН'];
var LB_NP_STAGE = { 'Замовлено': 0, 'Створено ТТН': 1, 'Відправлено': 2, 'В дорозі': 2, 'Доставлено': 3, 'В бібліотеці': 4 };
function lbNpStatusFromCode_(code) {
  return { '1': 'Створено ТТН', '4': 'Відправлено', '41': 'Відправлено', '5': 'Відправлено', '6': 'Відправлено', '101': 'Відправлено',
    '7': 'Доставлено', '8': 'Доставлено', '9': 'В бібліотеці', '10': 'В бібліотеці', '11': 'В бібліотеці' }[String(code)] || null;
}
function lbNpNorm_(v) { return String(v == null ? '' : v).trim().replace(/\s/g, ''); }
function lbNpText_(v) { var s = String(v).slice(0, 500); return /^[=+@-]/.test(s) ? "'" + s : s; }
function lbNpFetch_(key, numbers) {
  var response;
  for (var attempt = 0; attempt < 3; attempt++) {
    try {
      response = UrlFetchApp.fetch('https://api.novaposhta.ua/v2.0/json/', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true, followRedirects: false,
        payload: JSON.stringify({ apiKey: key, modelName: 'TrackingDocument', calledMethod: 'getStatusDocuments',
          methodProperties: { Documents: numbers.map(function (n) { return { DocumentNumber: n }; }) } })
      });
    } catch (e) { throw new Error('НП: мережевий запит не виконано. Попередні статуси збережено.'); }
    var code = response.getResponseCode();
    if (code === 200) break;
    if ((code === 429 || code >= 500) && attempt < 2) { Utilities.sleep(1000 * Math.pow(2, attempt)); continue; }
    throw new Error('НП: HTTP ' + code + '. Попередні статуси збережено.');
  }
  var body;
  try { body = JSON.parse(response.getContentText()); } catch (e) { throw new Error('НП: відповідь не є JSON.'); }
  // відповідь, ключ і особисті дані в журнал не пишемо
  if (body.success !== true || !Array.isArray(body.data)) throw new Error('НП відхилила запит. Перевірте чинність ключа в кабінеті НП. Попередні статуси збережено.');
  return body.data;
}
/** Один прохід. dryRun = true — лише рахує, що змінилося б, і нічого не пише. */
function lbNpRun_(dryRun) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(dryRun ? 30000 : 1000)) throw new Error('НП: інше оновлення ще виконується.');
  try {
    var key = (PropertiesService.getScriptProperties().getProperty('NP_API_KEY') || '').trim();
    if (!key) throw new Error('Додайте NP_API_KEY у Налаштування проєкту → Властивості скрипту. Не вставляйте ключ у код або таблицю.');
    var sh = lbSs_().getSheetByName(LB_SHEETS.wish);
    if (!sh) throw new Error('Вкладку «Бажанки» не знайдено.');
    var lastCol = sh.getLastColumn();
    var headRaw = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0], head = headRaw.map(lbKey_);
    var c = { status: lbCol_(head, ['Статус']), ttn: lbCol_(head, ['ТТН']) };
    if (c.status < 0 || c.ttn < 0) throw new Error('НП: не знайшла колонки «Статус» або «ТТН». Оновлення зупинено.');
    var outCols = LB_NP_HEADS.map(function (h) { return lbCol_(head, [h]); });
    if (outCols.some(function (x) { return x < 0; })) throw new Error('НП: бракує колонок ' + LB_NP_HEADS.filter(function (h, i) { return outCols[i] < 0; }).join(', ') + '. Оновлення зупинено.');
    var count = Math.max(0, sh.getLastRow() - 1);
    if (!count) return { checked: 0, errors: 0, npChanged: 0, statusChanged: [] };
    var old = outCols.map(function (oc) { return sh.getRange(2, oc + 1, count, 1).getValues().map(function (r) { return r[0]; }); });
    var formulas = outCols.some(function (oc) { return sh.getRange(2, oc + 1, count, 1).getFormulas().some(function (r) { return r[0]; }); });
    if (formulas) throw new Error('НП: у колонках статусу НП є формули; автоматичний запис зупинено.');
    var ttnRange = sh.getRange(2, c.ttn + 1, count, 1);
    var source = ttnRange.getDisplayValues().map(function (r) { return r[0]; });
    var numbers = [];
    source.forEach(function (t) { var n = lbNpNorm_(t); if (/^\d{14}$/.test(n) && numbers.indexOf(n) === -1) numbers.push(n); });
    var statuses = {};
    for (var i = 0; i < numbers.length; i += 100) {
      var batch = numbers.slice(i, i + 100);
      var data = lbNpFetch_(key, batch), group = {};
      data.forEach(function (d) { var n = String(d.Number || ''); if (batch.indexOf(n) !== -1) (group[n] = group[n] || []).push(d); });
      batch.forEach(function (n) {
        var m = group[n] || [];
        statuses[n] = m.length !== 1 || !String(m[0].Status || '').trim() ? { error: 'Немає однозначної відповіді API' } : { status: String(m[0].Status), code: String(m[0].StatusCode || '') };
      });
      if (i + 100 < numbers.length) Utilities.sleep(1100);
    }
    // рядки відсортували, змінили або перемістили під час запиту — нічого не пишемо
    if (sh.getLastRow() - 1 !== count || JSON.stringify(ttnRange.getDisplayValues().map(function (r) { return r[0]; })) !== JSON.stringify(source) ||
        JSON.stringify(sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0]) !== JSON.stringify(headRaw)) throw new Error('Таблиця змінилася під час запиту. Повторіть оновлення.');
    var stamp = new Date(), errors = 0, npChanged = 0;
    var next = old.map(function (col) { return col.slice(); });
    source.forEach(function (t, r) {
      var n = lbNpNorm_(t);
      if (!n) { if (old.some(function (col) { return col[r] !== ''; })) { next.forEach(function (col) { col[r] = ''; }); npChanged++; } return; }
      var rec = statuses[n];
      var err = !/^\d{14}$/.test(n) ? 'Потрібна одна ТТН із 14 цифр; виправте ТТН вручну' : rec && rec.error;
      if (err) {
        errors++;
        var same = String(old[3][r]) === n;
        if (!same) { next[0][r] = ''; next[1][r] = ''; next[3][r] = ''; }
        next[2][r] = err;
      } else if (rec) {
        if (String(old[0][r]) !== lbNpText_(rec.status).replace(/^'/, '') || String(old[3][r]) !== n) npChanged++;
        next[0][r] = lbNpText_(rec.status); next[1][r] = stamp; next[2][r] = ''; next[3][r] = n;
      }
    });
    // статус бажанки: лише вперед і лише зі звичних статусів (ручні й скасовані не чіпаємо)
    var cur = sh.getRange(2, c.status + 1, count, 1).getDisplayValues().map(function (r) { return String(r[0]).trim(); });
    var changes = [];
    source.forEach(function (t, r) {
      var n = lbNpNorm_(t);
      if (!/^\d{14}$/.test(n) || !statuses[n] || statuses[n].error) return;
      var to = lbNpStatusFromCode_(statuses[n].code);
      if (!to || !(cur[r] in LB_NP_STAGE) || LB_NP_STAGE[to] <= LB_NP_STAGE[cur[r]]) return;
      changes.push({ row: r + 2, from: cur[r], to: to });
    });
    if (!dryRun) {
      outCols.forEach(function (oc, k) { sh.getRange(2, oc + 1, count, 1).setValues(next[k].map(function (v) { return [v]; })); });
      sh.getRange(2, outCols[1] + 1, count, 1).setNumberFormat('dd.MM.yyyy HH:mm');
      changes.forEach(function (ch) { sh.getRange(ch.row, c.status + 1).setValue(ch.to); });
      SpreadsheetApp.flush();
      if (changes.length) {
        var cA = lbCol_(head, ['Автор']), cT = lbCol_(head, ['Назва']);
        var vals = sh.getRange(2, 1, count, lastCol).getDisplayValues();
        lbLog_('📦 Нова пошта', '', '', changes.map(function (ch) { var v = vals[ch.row - 2]; return v[cA] + ' — ' + v[cT] + ': ' + ch.from + ' → ' + ch.to; }).join('; ').slice(0, 45000));
      }
    }
    return { checked: numbers.length, errors: errors, npChanged: npChanged, statusChanged: changes };
  } finally { lock.releaseLock(); }
}
/** Тригер щогодини (після lbNpSwitch). */
function lbNpUpdate() {
  var r = lbNpRun_(false);
  console.log('НП: перевірено ТТН ' + r.checked + ', помилок ' + r.errors + ', статусів бажанок змінено ' + r.statusChanged.length + '.');
  return r;
}
/** Перевірка (нічого не змінює): чи новий код бачить ті самі ТТН і статуси, що й старий. */
function lbNpTest() {
  var r = lbNpRun_(true);
  var t = ['НП, тест (нічого не записано):', 'ТТН у таблиці: ' + r.checked + ', рядків із помилкою (неправильна ТТН або немає однозначної відповіді НП): ' + r.errors + '.',
    'Рядків, де «Статус НП» відрізнявся б від записаного зараз: ' + r.npChanged + ' (якщо старий код щойно відпрацював, тут 0 або кілька свіжих змін).',
    'Статус бажанки змінився б: ' + r.statusChanged.length + (r.statusChanged.length ? ' — ' + r.statusChanged.map(function (c) { return 'рядок ' + c.row + ': ' + c.from + ' → ' + c.to; }).join('; ') : '') + '.'];
  console.log(t.join('\n'));
  return t.join('\n');
}
/** Перехід на новий код НП: один справжній запуск; якщо без помилок — вимикає старий тригер npUpdate і вмикає lbNpUpdate щогодини. */
function lbNpSwitch() {
  var r = lbNpRun_(false);
  if (r.errors) throw new Error('Новий код НП відпрацював, але є ' + r.errors + ' ТТН з помилками (див. колонку «НП: помилка перевірки»). Старий тригер НЕ вимкнено. Виправте ТТН і запустіть ще раз.');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var tr = ScriptApp.getProjectTriggers();
    tr.forEach(function (t) { if (t.getHandlerFunction() === 'npUpdate') ScriptApp.deleteTrigger(t); });
    var mine = tr.filter(function (t) { return t.getHandlerFunction() === 'lbNpUpdate'; });
    if (!mine.length) ScriptApp.newTrigger('lbNpUpdate').timeBased().everyHours(1).create();
  } finally { lock.releaseLock(); }
  lbLog_('📦 Нова пошта', '', '', 'Перехід на модуль додатку: тригер npUpdate вимкнено, lbNpUpdate щогодини. Перевірено ТТН: ' + r.checked);
  console.log('Готово ✓ Нова пошта тепер працює з коду додатку (lbNpUpdate щогодини). Старий тригер npUpdate вимкнено. ТТН перевірено: ' + r.checked + '.');
}
/** Відкат: повертає старий код НП (npUpdate щогодини), вимикає lbNpUpdate. */
function lbNpBack() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'lbNpUpdate') ScriptApp.deleteTrigger(t); });
  if (!ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'npUpdate'; })) ScriptApp.newTrigger('npUpdate').timeBased().everyHours(1).create();
  lbLog_('📦 Нова пошта', '', '', 'Відкат: знову працює старий код npUpdate.');
  console.log('Повернула старий код НП (npUpdate щогодини).');
}

/* ============================================================
 * v9. Дати наявних замовлень (разово, ЗАВДАННЯ_v8 п. 1.5а)
 * Дані зі скриншотів 13.11.2026. Рядок у «Бажанках» шукається за номером замовлення,
 * без номера — за назвою книги. Пише лише в ПОРОЖНІ клітинки: «Дата замовлення»,
 * а також «Номер замовлення», «Сайт», «Де замовлено» і «ISBN», якщо там нічого немає.
 * ============================================================ */
var LB_ORDER_DATES = [
  { shop: 'Vivat', site: 'https://vivat.com.ua', order: '40381574', date: '2026-09-08', items: [['Одіссея', 'Гомер'], ['Декстер. Темні сни', 'Джефф Ліндсі'], ['Не турбувати', 'Фріда Мак-Фадден'], ['Twisted. Ненависть', 'Ана Хван']] },
  { shop: 'Vivat', site: 'https://vivat.com.ua', order: '40388503', date: '2026-10-13', items: [['Двір розколотої гармонії', 'Сара Дж. Маас']] },
  { shop: 'Vivat', site: 'https://vivat.com.ua', order: '40396603', date: '2026-10-20', items: [['Орендарка', 'Фріда Мак-Фадден']] },
  { shop: 'Vivat', site: 'https://vivat.com.ua', order: '40400119', date: '2026-10-27', items: [['Іліада', 'Гомер']] },
  { shop: 'Бородатий Тамарин', site: 'https://tamarinbooks.com', order: '44776', date: '2026-11-12', items: [['Зазирни у мої сни', '']] },
  { shop: 'BookChef', site: 'https://bookchef.ua', order: '707061', date: '2026-11-10', items: [['The Killer Isn\'t Alice. Головоломка із 46 600 підозрюваними у вбивстві', '', '9786175486283'], ['Фантом', '', '9786175486313']] },
  { shop: 'BookChef', site: 'https://bookchef.ua', order: '700316', date: '2026-10-07', items: [['Трилогія душ. Книга 2: Її душа за помсту', '', '9786175486177'], ['Murdle. Частина 2', '']] },
  { shop: 'BookChef', site: 'https://bookchef.ua', order: '697880', date: '2026-09-26', items: [['Афера Сатани', ''], ['На межі темряви. Книга 2: Пожадливий', '']] },
  { shop: 'Nebo Publishing', site: 'https://nebopublishing.com.ua', order: '72474', date: '2026-10-23', items: [['Герой віків', 'Брендон Сандерсон', '9786178383862'], ['З-імли-народжені', 'Брендон Сандерсон', '9786178446161'], ['Джерело Вознесіння', 'Брендон Сандерсон', '9786178446178']] },
  { shop: 'Nebo Publishing', site: 'https://nebopublishing.com.ua', order: '69355', date: '2026-09-19', items: [['Лицар і нічниця', 'Рейчел Ґілліґ', '9786178446611']] },
  { shop: 'РМ', site: 'https://ridna-mova.com', order: '145145', date: '2026-10-10', items: [['Жінка з кімнати № 11', '', '9786178691547'], ['Царство Троянди', '', '9786178603243']] },
  { shop: 'РМ', site: 'https://ridna-mova.com', order: '140555', date: '2026-08-22', items: [] },
  { shop: 'Glimmer', site: 'https://glimmer.com.ua', order: '12391', date: '2026-10-19', items: [['Шепіт', 'Бекка Фіцпатрік']] },
  { shop: 'ArtBooks', site: 'https://artbooks.ua', order: 'A840345', date: '2026-10-28', items: [['Щоденники вампіра. Пробудження', '']] }
];
function lbOrderDatesPlan_(ss) {
  var sh = ss.getSheetByName(LB_SHEETS.wish);
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0].map(lbKey_);
  var c = { a: lbCol_(head, ['Автор']), t: lbCol_(head, ['Назва']), s: lbCol_(head, ['Статус']), n: lbCol_(head, ['Номер замовлення']),
    d: lbCol_(head, ['Дата замовлення']), site: lbCol_(head, ['Сайт']), w: lbCol_(head, ['Де замовлено']), i: lbCol_(head, ['ISBN']) };
  if (c.d < 0) throw new Error('Немає колонки «Дата замовлення». Спершу запустіть lbAddOrderDateColumn.');
  var vals = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getDisplayValues() : [];
  var num = function (v) { return String(v || '').replace(/[\s#№]/g, '').toUpperCase(); };
  var titleOk = function (mine, theirs) {
    var a = lbNorm_(mine), b = lbNorm_(theirs);
    return a && b && (a === b || a.indexOf(b) === 0 || b.indexOf(a) === 0 || lbDice_(mine, theirs) >= 0.85);
  };
  var used = {}, plan = [], miss = [], notes = [];
  LB_ORDER_DATES.forEach(function (o) {
    var byNum = [];
    vals.forEach(function (r, i) { if (c.n >= 0 && num(r[c.n]) === num(o.order)) byNum.push(i); });
    var rows = [];
    if (o.items.length) o.items.forEach(function (it) {
      var hit = byNum.filter(function (i) { return !used[i] && titleOk(vals[i][c.t], it[0]); })[0];
      if (hit == null) {
        var cand = [];
        vals.forEach(function (r, i) { if (!used[i] && titleOk(r[c.t], it[0]) && (!it[1] || lbAuthorOk_(it[1], r[c.a])) && (!num(r[c.n]) || num(r[c.n]) === num(o.order))) cand.push(i); });
        if (cand.length === 1) hit = cand[0];
        else if (cand.length > 1) { miss.push('№' + o.order + ' «' + it[0] + '»: кілька схожих рядків (' + cand.map(function (i) { return i + 2; }).join(', ') + ') — не чіпаю'); return; }
      }
      if (hit == null) { miss.push('№' + o.order + ' (' + o.shop + ') «' + it[0] + '» — не знайшла в «Бажанках»'); return; }
      rows.push({ i: hit, isbn: it[2] || '' });
    });
    else {
      byNum.forEach(function (i) { rows.push({ i: i, isbn: '' }); });
      if (!byNum.length) miss.push('№' + o.order + ' (' + o.shop + ') — назв немає, і рядків з цим номером не знайшла');
    }
    rows.forEach(function (x) {
      used[x.i] = 1;
      var r = vals[x.i], set = {};
      var curD = lbDate_(r[c.d]);
      if (!curD) set.d = o.date;
      else if (curD !== o.date) notes.push('рядок ' + (x.i + 2) + ' «' + r[c.t] + '»: дата вже є (' + lbHuman_(curD) + '), на скриншоті ' + lbHuman_(o.date) + ' — не міняю');
      if (c.n >= 0 && !num(r[c.n])) set.n = o.order;
      if (c.site >= 0 && !String(r[c.site]).trim()) set.site = o.site;
      if (c.w >= 0 && !String(r[c.w]).trim()) set.w = o.shop;
      if (c.i >= 0 && x.isbn && !String(r[c.i]).replace(/\D/g, '')) set.i = x.isbn;
      if (Object.keys(set).length) plan.push({ row: x.i + 2, a: r[c.a], t: r[c.t], st: r[c.s], set: set });
    });
  });
  return { sh: sh, c: c, plan: plan, miss: miss, notes: notes };
}
function lbOrderDatesText_(p) {
  var names = { d: 'дата', n: '№', site: 'сайт', w: 'де', i: 'ISBN' };
  var out = ['Рядків зміниться: ' + p.plan.length];
  p.plan.forEach(function (x) {
    out.push('  рядок ' + x.row + ': ' + x.a + ' — ' + x.t + ' [' + x.st + '] → ' + Object.keys(x.set).map(function (k) { return names[k] + ' ' + (k === 'd' ? lbHuman_(x.set[k]) : x.set[k]); }).join(', '));
  });
  if (p.notes.length) out.push('', 'Уже мають іншу дату (не чіпаю):', '  ' + p.notes.join('\n  '));
  if (p.miss.length) out.push('', 'Не знайшла (не чіпаю):', '  ' + p.miss.join('\n  '));
  return out.join('\n');
}
/** Крок 1 (нічого не змінює): які рядки «Бажанок» отримають дату замовлення. */
function lbBackfillOrderDatesPreview() {
  var t = lbOrderDatesText_(lbOrderDatesPlan_(lbSs_()));
  console.log(t);
  return t;
}
/** Крок 2 (після «так»): записує дати (і порожні №/сайт/ISBN). Усе — в «Лог». */
function lbBackfillOrderDatesApply() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Таблиця зараз оновлюється. Спробуйте за хвилину.');
  try {
    var p = lbOrderDatesPlan_(lbSs_());
    p.plan.forEach(function (x) {
      Object.keys(x.set).forEach(function (k) {
        var cell = p.sh.getRange(x.row, p.c[k] + 1), v = x.set[k];
        if (k === 'd') { var q = v.split('-'); cell.setValue(new Date(Number(q[0]), Number(q[1]) - 1, Number(q[2]), 12)).setNumberFormat('dd.mm.yyyy'); }
        else { if (k === 'n' || k === 'i') cell.setNumberFormat('@'); cell.setValue(String(v)); }
      });
    });
    SpreadsheetApp.flush();
    var t = lbOrderDatesText_(p);
    if (p.plan.length) lbLog_('🗓 Дати замовлень (разово)', '', '', t.slice(0, 45000));
    console.log('Готово ✓\n' + t);
    return t;
  } finally { lock.releaseLock(); }
}
