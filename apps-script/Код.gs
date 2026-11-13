
const LIBRARY = "Облік бібліотеки";
const SERIES = "Серії";
const CATALOG = "Каталог книг";
const SOLD = "Продані";
const LOG = "Лог";
const WISHLIST = "Бажанки";
// Заголовки зчитуються один раз на запуск, номери колонок не закріплені.
const BOOK_HEADERS_ = Object.create(null);
const COL_NUMBER = bookColumn_(LIBRARY, ["Столбец 1", "№"]);
const COL_AUTHOR = bookColumn_(LIBRARY, ["Автор"]);
const COL_TYPE = bookColumn_(LIBRARY, ["Серія"]);
const COL_SERIES = bookColumn_(LIBRARY, ["Назва серії"]);
const COL_BOOK = bookColumn_(LIBRARY, ["Назва книги"]);
const COL_PUBLISHER = bookColumn_(LIBRARY, ["Видавництво"]);
const COL_SERIES_NUM = bookColumn_(LIBRARY, ["№ серії"]);
const COL_TOTAL = bookColumn_(LIBRARY, ["Всього"]);
const COL_GENRE = bookColumn_(LIBRARY, ["Жанр"]);
const COL_EXTRA_GENRES = bookColumn_(LIBRARY, ["Додаткові жанри"]);
const COL_PAGES = bookColumn_(LIBRARY, ["Кількість сторінок"]);
const COL_LANGUAGE = bookColumn_(LIBRARY, ["Мова"]);
const COL_STATUS = bookColumn_(LIBRARY, ["Статус"]);
const COL_FINISHED = bookColumn_(LIBRARY, ["Завершена?"]);
const COL_TRANSLATED = bookColumn_(LIBRARY, ["Повний переклад укр"]);
const COL_AVAILABLE = bookColumn_(LIBRARY, ["Наявність"]);
const COL_WHERE_FIND = bookColumn_(LIBRARY, ["Де шукати"]);
const COL_PRIORITY = bookColumn_(LIBRARY, ["Пріорітет"]);
const COL_PRICE = bookColumn_(LIBRARY, ["Ціна, грн", "Ціна"]);
const W_AUTHOR = bookColumn_(WISHLIST, ["Автор"]);
const W_SERIES_NAME = bookColumn_(WISHLIST, ["Назва серії"]);
const W_BOOK = bookColumn_(WISHLIST, ["Назва"]);
const W_PRICE = bookColumn_(WISHLIST, ["Ціна"]);
const W_STATUS = bookColumn_(WISHLIST, ["Статус"]);
const W_PUBLISHER = bookColumn_(WISHLIST, ["Видавництво"]);
const W_IS_SERIES = bookColumn_(WISHLIST, ["Серія"]);
const W_AVAILABILITY = bookColumn_(WISHLIST, ["Наявність"]);
const W_PART = bookColumn_(WISHLIST, ["Яка частина"]);
const W_TOTAL = bookColumn_(WISHLIST, ["Всього книг"]);
const W_RELEASE = bookColumn_(WISHLIST, ["Реліз"]);
const W_ORDERED_FROM = bookColumn_(WISHLIST, ["Де замовлено"]);
const W_SITE = bookColumn_(WISHLIST, ["Сайт"]);
const W_ORDER_NUMBER = bookColumn_(WISHLIST, ["Номер замовлення"]);
const W_TTN = bookColumn_(WISHLIST, ["ТТН"]);
const CAT_AUTHOR = bookColumn_(CATALOG, ["Автор"]);
const CAT_SERIES = bookColumn_(CATALOG, ["Серія"]);
const CAT_NUMBER = bookColumn_(CATALOG, ["№ у серії"]);
const CAT_BOOK = bookColumn_(CATALOG, ["Назва книги"]);
const CAT_PUBLISHER = bookColumn_(CATALOG, ["Видавництво"]);
const CAT_TYPE = bookColumn_(CATALOG, ["Тип"]);
const S_AUTHOR = bookColumn_(SERIES, ["Автор"]);
const S_SERIES = bookColumn_(SERIES, ["Назва серії"]);
const S_TOTAL = bookColumn_(SERIES, ["Основних томів"]);
const S_FINISHED = bookColumn_(SERIES, ["Завершена"]);
const S_TRANSLATED = bookColumn_(SERIES, ["Повний переклад укр"]);
const S_PUBLISHER = bookColumn_(SERIES, ["Видавництво"]);

function onOpen() {
SpreadsheetApp.getUi()
.createMenu("📚 Бібліотека")
.addSeparator()
.addItem("➕ Додати книгу","addBook")
.addItem("📚 Перенести з бажанок","transferWishlistToLibrary")
.addItem("🧹 Очистити бажанки","cleanWishlist")
.addItem("✨ Знайти відсутні книги", "findMissingSeriesBooks")
.addItem("💰 Продати позначені книги","sellBooks")
.addSeparator()
.addItem("🔄 Оновити бібліотеку","updateLibrary")
.addItem("📥 Оновити каталог","updateCatalog")
.addSeparator()
.addItem("📊 Статистика","showStatistics")
.addToUi();
}
//==========================================================
// ДОДАТИ КНИГУ
//==========================================================
function addBook(bookData = null, updateAfter = true) {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(LIBRARY);
  if (!sheet) {
    ui.alert('❌ Не знайдено лист "' + LIBRARY + '".');
    return;
  }
  let title;
if (bookData) {
  title = bookData.book;
} else {
  const result = ui.prompt(
    "➕ Додати книгу",
    "Спочатку введіть назву книги для перевірки дублікатів:",
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() != ui.Button.OK) return;
  title = result.getResponseText().trim();
}
const search = normalizeText(title);
if (search == "") return;
 const lastRow = sheet.getLastRow();
const books = lastRow > 1
  ? sheet.getRange(
      2,
      1,
      lastRow - 1,
      sheet.getLastColumn()
    ).getValues()
  : [];
  let similarBooks = [];
for (let i = 0; i < books.length; i++) {
  const title = normalizeText(
    books[i][COL_BOOK - 1]
  );
  if (
    title && (title == search ||
    title.includes(search) ||
    search.includes(title))
  ) {
    similarBooks.push({
      row: i + 2,
      title: books[i][COL_BOOK - 1],
      author: books[i][COL_AUTHOR - 1]
    });
  }
}
 if (similarBooks.length > 0) {
  let message =
    "⚠ Знайдено схожі книги:\n\n";
  similarBooks.forEach(book => {
    message +=
      "• " + book.title +
      "\n" + book.author +
      "\nрядок " + book.row +
      "\n\n";
  });
  message +=
    "Додати книгу все одно?";
  const answer = ui.alert(
    "Можливий дублікат",
    message,
    ui.ButtonSet.YES_NO
  );
  if (answer !== ui.Button.YES) {
    sheet.getRange(similarBooks[0].row, COL_BOOK).activate();
    return;
  }
}
  const newRow = sheet.getLastRow() + 1;
  sheet.insertRowAfter(sheet.getLastRow());
const rowData = Array(sheet.getLastColumn()).fill("");
rowData[COL_BOOK - 1] = title;
if (bookData) {
  rowData[COL_AUTHOR - 1] = bookData.author;
  rowData[COL_TYPE - 1] =
    bookData.isSeries === "Так"
      ? "Серія"
      : "Одиночна";
  rowData[COL_SERIES - 1] = bookData.series;
  rowData[COL_PUBLISHER - 1] = bookData.publisher;
  rowData[COL_SERIES_NUM - 1] = bookData.part;
  rowData[COL_TOTAL - 1] = bookData.total;
  if (hasBookValue_(bookData.price)) rowData[COL_PRICE - 1] = bookData.price;
}
sheet
  .getRange(newRow, 1, 1, rowData.length)
  .setValues([rowData]);
addLog(
  "➕ Додано книгу",
  title,
  bookData ? bookData.author : "",
  "Створено новий рядок"
);
if (updateAfter) {
  updateLibrary(false);
}
if (bookData) {
  const library = ss.getSheetByName(LIBRARY);
  ss.setActiveSheet(library);
  if (updateAfter) {
    const row = findBookInLibrary(
      bookData.author,
      bookData.series,
      bookData.book
    );
    if (row) {
      library.getRange(row, COL_GENRE).activate();
    }
  } else {
  // Курсор встановить transferWishlistToLibrary()
}
} else {
  sheet.getRange(newRow, COL_AUTHOR).activate();
}
return newRow;
}
//==========================================================
// ГОЛОВНА КНОПКА
//==========================================================
function updateLibrary(showMessage = true){
const ss = SpreadsheetApp.getActive();
const sheet = ss.getSheetByName(LIBRARY);
if (!sheet) {
  SpreadsheetApp.getUi().alert(
    '❌ Не знайдено лист "' + LIBRARY + '".'
  );
  return;
}
const seriesSheet = ss.getSheetByName(SERIES);
if (!seriesSheet) {
  SpreadsheetApp.getUi().alert(
    '❌ Не знайдено лист "' + SERIES + '".'
  );
  return;
}
sortLibrary(sheet);
renumberBooks(sheet);
updateSeriesInfo(sheet);
syncPublishers();
sortWishlist();
SpreadsheetApp.flush();
addLog(
  "🔄 Оновлено бібліотеку",
  "",
  "",
  sheet.getLastRow() - 1 + " книг"
);
if (showMessage) {
  SpreadsheetApp.getUi().alert(
    "Бібліотека оновлена ✅"
  );
}
}
//==========================================================
// СОРТУВАННЯ
//==========================================================
function sortLibrary(sheet){
const lastRow=sheet.getLastRow();
const lastCol=sheet.getLastColumn();
if(lastRow<3) return;
sheet.getRange(2,1,lastRow-1,lastCol)
.sort([
{column:COL_AUTHOR,ascending:true},
{column:COL_TYPE,ascending:false},
{column:COL_SERIES,ascending:true},
{column:COL_SERIES_NUM,ascending:true},
{column:COL_BOOK,ascending:true}
]);
}
function sortWishlist() {
  const sheet = SpreadsheetApp
    .getActive()
    .getSheetByName(WISHLIST);
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 3) return;
  // Сортуємо ВЕСЬ рядок книги, а не тільки A:I
  sheet
    .getRange(
      2,
      1,
      lastRow - 1,
      lastCol
    )
    .sort([
      { column: W_AUTHOR, ascending: true },
      { column: W_IS_SERIES, ascending: false },
      { column: W_SERIES_NAME, ascending: true },
      { column: W_PART, ascending: true },
      { column: W_BOOK, ascending: true }
    ]);
}
//==========================================================
// НУМЕРАЦІЯ
//==========================================================
function renumberBooks(sheet){
if (sheet.getLastRow() < 2) return;
const lastRow=sheet.getLastRow();
let values=[];
for(let i=1;i<lastRow;i++){
values.push([i]);
}
sheet.getRange(2,COL_NUMBER,values.length,1).setValues(values);
}
//==========================================================
// ОНОВИТИ ДАНІ ПРО СЕРІЇ
//==========================================================
function updateSeriesInfo(sheet){
if (sheet.getLastRow() < 2) return;
const ss=SpreadsheetApp.getActive();
const seriesSheet=ss.getSheetByName(SERIES);
if (seriesSheet.getLastRow() < 2) {
  SpreadsheetApp.getUi().alert(
    '⚠ Лист "' + SERIES + '" порожній.\n\nДодай хоча б одну серію до довідника.'
  );
  return;
}
const seriesData = seriesSheet
  .getRange(2, 1, seriesSheet.getLastRow() - 1, seriesSheet.getLastColumn())
  .getValues();
let map={};
let newSeriesAdded = [];
seriesData.forEach(r=>{
map[r[S_SERIES - 1]] = {
    total:r[S_TOTAL - 1],
    finished:r[S_FINISHED - 1],
    translated:r[S_TRANSLATED - 1],
    publisher:r[S_PUBLISHER - 1]
};
});
const lastRow=sheet.getLastRow();
const data=sheet.getRange(2,1,lastRow-1,sheet.getLastColumn()).getValues();
for(let i=0;i<data.length;i++){
const type=data[i][COL_TYPE-1];
const series=data[i][COL_SERIES-1];
if(type!="Серія"){
data[i][COL_TOTAL-1]="";
data[i][COL_FINISHED-1]="—";
data[i][COL_TRANSLATED-1]="—";
continue;
}
if (map[series]) {
  data[i][COL_TOTAL-1] = map[series].total;
  data[i][COL_FINISHED-1] = map[series].finished;
  data[i][COL_TRANSLATED-1] = map[series].translated;
} else {
  const ui = SpreadsheetApp.getUi();
  const answer = ui.alert(
    "⚠ Серію не знайдено",
    "Автор:\n" +
    data[i][COL_AUTHOR - 1] +
    "\n\nСерія:\n" +
    series +
    "\n\nСтворити нову серію?",
    ui.ButtonSet.YES_NO
  );
  if (answer !== ui.Button.YES) {
    continue;
  }
  const newSeries = mappedBookRow_(seriesSheet, [
    [S_AUTHOR, data[i][COL_AUTHOR - 1]], [S_SERIES, series],
    [S_TOTAL, data[i][COL_TOTAL - 1]], [S_FINISHED, data[i][COL_FINISHED - 1]],
    [S_TRANSLATED, data[i][COL_TRANSLATED - 1]], [S_PUBLISHER, data[i][COL_PUBLISHER - 1]]
  ]);
  seriesSheet.appendRow(newSeries);
  addLog(
    "📚 Створено серію",
    series,
    data[i][COL_AUTHOR - 1],
    "Створено вручну"
  );
  newSeriesAdded.push(series);
  map[series] = {
    total: newSeries[S_TOTAL - 1],
    finished: newSeries[S_FINISHED - 1],
    translated: newSeries[S_TRANSLATED - 1],
    publisher: newSeries[S_PUBLISHER - 1]
  };
}
}
[COL_TOTAL, COL_FINISHED, COL_TRANSLATED].forEach(column => {
  sheet.getRange(2, column, data.length, 1).setValues(data.map(row => [row[column - 1]]));
});
if (newSeriesAdded.length > 0) {
  SpreadsheetApp.getUi().alert(
    "✅ Створено нові серії:\n\n• " +
    newSeriesAdded.join("\n• ") +
    "\n\n⚠ Не забудьте додати їх до випадаючого списку Google Tables."
  );
}
}
//==========================================================
// ПРОДАТИ КНИГИ
//==========================================================
function sellBooks(){
const ss = SpreadsheetApp.getActive();
const sheet = ss.getSheetByName(LIBRARY);
if (!sheet) {
  SpreadsheetApp.getUi().alert(
    '❌ Не знайдено лист "' + LIBRARY + '".'
  );
  return;
}
const sold = ss.getSheetByName(SOLD);
if (!sold) {
  SpreadsheetApp.getUi().alert(
    '❌ Не знайдено лист "' + SOLD + '".'
  );
  return;
}
const lastRow=sheet.getLastRow();
const lastCol=sheet.getLastColumn();
const values=readBookRows_(sheet);
for(let i=values.length-1;i>=0;i--){
const available=String(values[i][COL_AVAILABLE-1]).toLowerCase();
if (available == "продана") {
  addLog(
    "💰 Продано книгу",
    values[i][COL_BOOK - 1],
    values[i][COL_AUTHOR - 1]
  );
const soldRow = [
  values[i][COL_NUMBER - 1],
  values[i][COL_AUTHOR - 1],
  values[i][COL_TYPE - 1],
  values[i][COL_SERIES - 1],
  values[i][COL_BOOK - 1],
  values[i][COL_SERIES_NUM - 1],
  values[i][COL_LANGUAGE - 1],
  values[i][COL_STATUS - 1],
  values[i][COL_AVAILABLE - 1]
];
sold.appendRow(soldRow);
  sheet.deleteRow(i + 2);
}
}
updateLibrary(false);
}
//==========================================================
// НОРМАЛІЗАЦІЯ ТЕКСТУ ДЛЯ ПОШУКУ
//==========================================================
function normalizeText(text) {
  return String(text == null ? "" : text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // прибирає діакритичні знаки
    .replace(/['’`"]/g, "")            // апострофи та лапки
    .replace(/[-–—]/g, " ")            // усі дефіси
    .replace(/[.,:;!?()[\]{}]/g, " ")  // розділові знаки
    .replace(/\s+/g, " ")              // кілька пробілів → один
    .trim();
}
function addLog(action, book = "", author = "", details = "") {
  const sheet = SpreadsheetApp.getActive().getSheetByName(LOG);
  if (!sheet) return;
  sheet.appendRow([
    new Date(),
    action,
    book,
    author,
    details
  ]);
}
//==========================================================
// СТАТИСТИКА
//==========================================================
function showStatistics(){
const html=HtmlService
.createHtmlOutputFromFile("Statistics")
.setTitle("📊 Статистика");
SpreadsheetApp.getUi().showSidebar(html);
}
function getStatistics(){
const ss=SpreadsheetApp.getActive();
const sheet=ss.getSheetByName(LIBRARY);
const soldSheet=ss.getSheetByName(SOLD);
const data=readBookRows_(sheet);
const sold=soldSheet.getLastRow()-1;
const statisticsData = buildSeriesStatisticsData();
const seriesStats = statisticsData.series;
let total=data.length;
let read=0;
let unread=0;
let reading=0;
let dropped=0;
let ukrainian=0;
let english=0;
let series=0;
let single=0;
let authors={};
data.forEach(r=>{
const author = r[COL_AUTHOR - 1];
const type = r[COL_TYPE - 1];
const status = String(r[COL_STATUS - 1]).toLowerCase();
const language = String(r[COL_LANGUAGE - 1]).toLowerCase();
const s = r[COL_SERIES - 1];
authors[author]=(authors[author]||0)+1;
if (type == "Серія") {
  series++;
} else {
  single++;
}
switch (status) {
  case "прочитано":
    read++;
    break;
  case "не читала":
    unread++;
    break;
  case "читаю":
    reading++;
    break;
  case "закинула":
    dropped++;
    break;
}
if (language == "українська") ukrainian++;
if (language == "англійська") english++;
});
function maxKey(obj){
let best="";
let value=0;
for(let k in obj){
if(obj[k]>value){
value=obj[k];
best=k;
}
}
return [best,value];
}
const bestAuthor=maxKey(authors);
const percent = total == 0
  ? 0
  : Math.round(read / total * 100);
let progressHtml = "";
let completedSeries = 0;
let almostCompletedSeries = 0;
const seriesList = Object.entries(seriesStats)
.sort((a, b) => {
  const pa = a[1].stats.mainOwned / Math.max(a[1].stats.mainTotal, 1);
  const pb = b[1].stats.mainOwned / Math.max(b[1].stats.mainTotal, 1);
  return pa - pb;
});
seriesList.forEach(([name, s]) => {
  if (s.stats.mainTotal === 0) return;
  if (s.stats.mainMissing.length === 0) {
    completedSeries++;
    return;
  }
  if (s.stats.mainMissing.length === 1) {
  almostCompletedSeries++;
}
  progressHtml +=
    "<b>🛒 " + name + "</b><br>" +
    s.stats.mainOwned +
    " із " +
    s.stats.mainTotal +
    "<br><span style='color:#b71c1c'>" +
    "Докупити: " +
    s.stats.mainMissing
      .map(book => book.number)
      .join(", ") +
    "</span><br><br>";
});
const activeSeries =
  Object.keys(seriesStats).length - completedSeries;
progressHtml +=
"<hr>" +
"✅ Повністю зібрано серій: <b>" +
completedSeries +
"</b>";
return `
<h2>📚 Моя бібліотека</h2>
<div class="card">
<div class="value">${total}</div>
Усього книг
</div>
<div class="card">
📖 Прочитано: <b>${read}</b><br>
📕 Не читала: <b>${unread}</b><br>
📘 Читаю: <b>${reading}</b><br>
📙 Закинула: <b>${dropped}</b>
</div>
<div class="card">
📚 Серій: <b>${series}</b><br>
📖 Одиночних: <b>${single}</b><br><br>
✅ Повністю зібрано: <b>${completedSeries}</b><br>
🎯 Бракує 1 книги: <b>${almostCompletedSeries}</b>
</div>
<div class="card">
🇺🇦 Українською: <b>${ukrainian}</b><br>
🇬🇧 Англійською: <b>${english}</b>
</div>
<div class="card">
💰 Продано: <b>${sold}</b>
</div>
<div class="card">
👑 Найпопулярніший автор<br>
<b>${bestAuthor[0]}</b><br>
${bestAuthor[1]} книг
</div>
<div class="card">
<h3>📚 Прогрес серій</h3>
${progressHtml}
</div>
<div class="card">
📈 Прочитано
<div class="value">
${percent}%
</div>
</div>
`;
}
//==========================================================
// ОНОВИТИ КАТАЛОГ
//==========================================================
function updateCatalog() {
  const ss = SpreadsheetApp.getActive();
  const ui = SpreadsheetApp.getUi();
  const library = ss.getSheetByName(LIBRARY);
  const catalog = ss.getSheetByName(CATALOG);
  if (!library) {
    ui.alert('❌ Не знайдено лист "' + LIBRARY + '".');
    return;
  }
  if (!catalog) {
    ui.alert('❌ Не знайдено лист "' + CATALOG + '".');
    return;
  }
  // ==========================================================
  // ЧИТАЄМО ІСНУЮЧИЙ КАТАЛОГ
  // ==========================================================
  const catalogData = catalog.getLastRow() > 1
    ? catalog
        .getRange(
          2,
          1,
          catalog.getLastRow() - 1,
          catalog.getLastColumn()
        )
        .getValues()
    : [];
  // ==========================================================
  // ЗБИРАЄМО КЛЮЧІ КНИГ, ЯКІ ВЖЕ Є В КАТАЛОЗІ
  //
  // Автор + Серія + № у серії
  // ==========================================================
  const catalogBooks = new Set();
  catalogData.forEach(row => {
    const author = row[CAT_AUTHOR - 1];
    const series = row[CAT_SERIES - 1];
    const number = row[CAT_NUMBER - 1];
    if (!author || !series || number === "") {
      return;
    }
    const num = parseFloat(
      String(number).replace(",", ".")
    );
    if (isNaN(num)) {
      return;
    }
    const key =
      normalizeText(author) + "|" +
      normalizeText(series) + "|" +
      String(num);
    catalogBooks.add(key);
  });
  // ==========================================================
  // ЧИТАЄМО БІБЛІОТЕКУ
  // ==========================================================
  const libraryData = library.getLastRow() > 1
    ? library
        .getRange(
          2,
          1,
          library.getLastRow() - 1,
          library.getLastColumn()
        )
        .getValues()
    : [];
  const rowsToAdd = [];
  // ==========================================================
  // ШУКАЄМО КНИГИ, ЯКИХ ЩЕ НЕМАЄ В КАТАЛОЗІ
  // ==========================================================
  libraryData.forEach(row => {
    // Одиночні книги в каталог не додаємо
    if (
      String(row[COL_TYPE - 1]).trim() !== "Серія"
    ) {
      return;
    }
    const author = row[COL_AUTHOR - 1];
    const series = row[COL_SERIES - 1];
    const number = row[COL_SERIES_NUM - 1];
    if (!author || !series || number === "") {
      return;
    }
    const num = parseFloat(
      String(number).replace(",", ".")
    );
    if (isNaN(num)) {
      return;
    }
    const key =
      normalizeText(author) + "|" +
      normalizeText(series) + "|" +
      String(num);
    // Уже є в каталозі — нічого не робимо
    if (catalogBooks.has(key)) {
      return;
    }
    rowsToAdd.push(mappedBookRow_(catalog, [
      [CAT_AUTHOR, author], [CAT_SERIES, series], [CAT_NUMBER, number],
      [CAT_BOOK, row[COL_BOOK - 1]], [CAT_PUBLISHER, row[COL_PUBLISHER - 1]],
      [CAT_TYPE, num % 1 === 0 ? "Основна" : "Додаткова"]
    ]));
    // Щоб одна й та сама книга випадково
    // не додалась двічі за один запуск
    catalogBooks.add(key);
  });
  // ==========================================================
  // ЯКЩО НОВИХ КНИГ НЕМАЄ
  // ==========================================================
 if (rowsToAdd.length === 0) {
  // Навіть якщо нових книг немає,
  // приводимо каталог до правильного порядку
  sortCatalog();
  restoreCatalogDropdowns();
  SpreadsheetApp.flush();
  ui.alert(
    "✅ Каталог актуальний.\n\n" +
    "Нових книг для додавання немає.\n" +
    "Каталог відсортовано."
  );
  return;
}
  // ==========================================================
  // ДОДАЄМО ТІЛЬКИ НОВІ РЯДКИ
  // ==========================================================
  const startRow = catalog.getLastRow() + 1;
  const targetRange = catalog.getRange(
  startRow,
  1,
  rowsToAdd.length,
  catalog.getLastColumn()
);
// Прибираємо старі правила перевірки даних
// тільки з нових рядків, куди зараз додаються книги
targetRange.clearDataValidations();
// Записуємо нові книги
targetRange.setValues(rowsToAdd);
SpreadsheetApp.flush();
// Сортуємо весь каталог після додавання нових книг
sortCatalog();
restoreCatalogDropdowns();
SpreadsheetApp.flush();
  // ==========================================================
  // РЕЗУЛЬТАТ
  // ==========================================================
  ui.alert(
    "✅ Каталог оновлено.\n\n" +
    "➕ Додано нових книг: " +
    rowsToAdd.length +
    "\n\nІснуючі записи каталогу не змінювались."
  );
}
function restoreCatalogDropdowns() {
  const sheet = SpreadsheetApp
    .getActive()
    .getSheetByName(CATALOG);
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  // =========================
  // E — ВИДАВНИЦТВО
  // =========================
  let publisherRule = null;
  for (let row = 2; row <= lastRow; row++) {
    const rule = sheet.getRange(row, CAT_PUBLISHER).getDataValidation();
    if (rule) {
      publisherRule = rule;
      break;
    }
  }
  if (publisherRule) {
    const range = sheet.getRange(2, CAT_PUBLISHER, lastRow - 1, 1);
    const rules = range.getDataValidations();
    for (let i = 0; i < rules.length; i++) {
      if (!rules[i][0]) {
        rules[i][0] = publisherRule;
      }
    }
    range.setDataValidations(rules);
  }
  // =========================
  // F — ТИП
  // =========================
  let typeRule = null;
  for (let row = 2; row <= lastRow; row++) {
    const rule = sheet.getRange(row, CAT_TYPE).getDataValidation();
    if (rule) {
      typeRule = rule;
      break;
    }
  }
  if (typeRule) {
    const range = sheet.getRange(2, CAT_TYPE, lastRow - 1, 1);
    const rules = range.getDataValidations();
    for (let i = 0; i < rules.length; i++) {
      if (!rules[i][0]) {
        rules[i][0] = typeRule;
      }
    }
    range.setDataValidations(rules);
  }
  // =========================
  // B — СЕРІЯ
  // =========================
  // Для кожної серії шукаємо вже існуючий
  // dropdown цієї ж серії та переносимо
  // його на рядки, де validation відсутня.
  const seriesRange = sheet.getRange(2, CAT_SERIES, lastRow - 1, 1);
  const seriesValues = seriesRange.getValues();
  const seriesRules = seriesRange.getDataValidations();
  const rulesBySeries = {};
  // Спочатку збираємо існуючі правила
  for (let i = 0; i < seriesValues.length; i++) {
    const series = String(seriesValues[i][0] || "").trim();
    const rule = seriesRules[i][0];
    if (series && rule && !rulesBySeries[series]) {
      rulesBySeries[series] = rule;
    }
  }
  // Потім застосовуємо їх до рядків
  // тієї самої серії без dropdown
  for (let i = 0; i < seriesValues.length; i++) {
    const series = String(seriesValues[i][0] || "").trim();
    if (
      series &&
      !seriesRules[i][0] &&
      rulesBySeries[series]
    ) {
      seriesRules[i][0] = rulesBySeries[series];
    }
  }
  seriesRange.setDataValidations(seriesRules);
}
function sortCatalog() {
  const sheet = SpreadsheetApp
    .getActive()
    .getSheetByName(CATALOG);
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 3) return;
  sheet
    .getRange(
      2,
      1,
      lastRow - 1,
      lastCol
    )
    .sort([
      { column: CAT_AUTHOR, ascending: true },
      { column: CAT_SERIES, ascending: true },
      { column: CAT_NUMBER, ascending: true }
    ]);
}
function buildSeriesStatisticsData() {
  const ss = SpreadsheetApp.getActive();
  const librarySheet = ss.getSheetByName(LIBRARY);
  const catalogSheet = ss.getSheetByName(CATALOG);
  const seriesSheet = ss.getSheetByName(SERIES);
  const libraryData = librarySheet.getLastRow() > 1
    ? librarySheet
        .getRange(
          2,
          1,
          librarySheet.getLastRow() - 1,
          librarySheet.getLastColumn()
        )
        .getValues()
    : [];
  const catalogData = catalogSheet.getLastRow() > 1
    ? catalogSheet
        .getRange(
          2,
          1,
          catalogSheet.getLastRow() - 1,
          catalogSheet.getLastColumn()
        )
        .getValues()
    : [];
    const seriesData = seriesSheet.getLastRow() > 1
  ? seriesSheet
      .getRange(
    2,
    1,
    seriesSheet.getLastRow()-1,
    seriesSheet.getLastColumn()
)
      .getValues()
  : [];
  const series = {};
catalogData.forEach(row => {
  const name = row[CAT_SERIES - 1];
  if (!series[name]) {
  series[name] = {
    author: row[CAT_AUTHOR - 1],
    expectedMain: 0,
    expectedExtra: 0,
    mainCatalog: [],
    extraCatalog: [],
    mainOwned: [],
    extraOwned: []
  };
}
});
seriesData.forEach(row => {
  const name = row[S_SERIES - 1];
  const total = Number(row[S_TOTAL - 1]) || 0;
  if (!series[name]) return;
  series[name].expectedMain = total;
});
catalogData.forEach(row => {
  const name = row[CAT_SERIES - 1];
  const book = {
    number: row[CAT_NUMBER - 1],
    title: row[CAT_BOOK - 1],
    publisher: row[CAT_PUBLISHER - 1]
  };
  if (row[CAT_TYPE - 1] == "Основна") {
    series[name].mainCatalog.push(book);
  } else {
    series[name].extraCatalog.push(book);
  }
});
libraryData.forEach(row => {
  if (row[COL_TYPE - 1] != "Серія") return;
  const name = row[COL_SERIES - 1];
  if (!series[name]) return;
  const book = {
    number: row[COL_SERIES_NUM - 1],
    title: row[COL_BOOK - 1],
    publisher: row[COL_PUBLISHER - 1]
  };
  const num = parseFloat(
    String(book.number).replace(",", ".")
  );
  if (isNaN(num)) return;
  if (num % 1 === 0) {
    series[name].mainOwned.push(book);
  } else {
    series[name].extraOwned.push(book);
  }
});
function normalizeBookNumber(number) {
  return parseFloat(
    String(number)
      .replace(",", ".")
      .trim()
  );
}
Object.values(series).forEach(s => {
  s.stats = {
    mainTotal: Math.max(
  s.mainCatalog.length,
  s.expectedMain
),
    mainOwned: s.mainOwned.length,
    extraTotal: s.extraCatalog.length,
    extraOwned: s.extraOwned.length
  };
 const expectedMainBooks = [...s.mainCatalog];
for (let i = 1; i <= s.expectedMain; i++) {
  const exists = expectedMainBooks.some(book =>
    normalizeBookNumber(book.number) === normalizeBookNumber(i)
  );
  if (!exists) {
    expectedMainBooks.push({
      number: i,
      title: "",
      publisher: ""
    });
  }
}
s.stats.mainMissing = expectedMainBooks.filter(book => {
  return !s.mainOwned.some(ownedBook =>
    normalizeBookNumber(ownedBook.number) ===
    normalizeBookNumber(book.number)
  );
});
  s.stats.extraMissing = s.extraCatalog.filter(catalogBook => {
    return !s.extraOwned.some(ownedBook =>
      normalizeBookNumber(ownedBook.number) ===
normalizeBookNumber(catalogBook.number)
    );
  });
});
return {
  series
};
}
function findBookInLibrary(author, series, title, publisher) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(LIBRARY);
  const data = readBookRows_(sheet);
  if (!hasBookValue_(title)) return null;
  for (let i = 0; i < data.length; i++) {
    if (normalizeText(data[i][COL_AUTHOR - 1]) === normalizeText(author) &&
        normalizeText(data[i][COL_SERIES - 1]) === normalizeText(series) &&
        normalizeText(data[i][COL_BOOK - 1]) === normalizeText(title) &&
        (publisher === undefined ||
         normalizeText(data[i][COL_PUBLISHER - 1]) === normalizeText(publisher))) {
      return i + 2;
    }
  }
  return null;
}
function addWishlistBookToLibrary() {
  const ss = SpreadsheetApp.getActive();
  const ui = SpreadsheetApp.getUi();
  const wishlist = ss.getSheetByName(WISHLIST);
  if (ss.getActiveSheet().getName() !== WISHLIST) {
    ui.alert('Відкрий лист "' + WISHLIST + '".');
    return;
  }
  const row = wishlist.getActiveCell().getRow();
  if (row < 2) {
    ui.alert("Оберіть книгу.");
    return;
  }
  const data = wishlist
    .getRange(row, 1, 1, wishlist.getLastColumn())
    .getValues()[0];
  const bookData = {
  author: data[W_AUTHOR - 1],
  series: data[W_SERIES_NAME - 1],
  book: data[W_BOOK - 1],
  publisher: data[W_PUBLISHER - 1],
  isSeries: data[W_IS_SERIES - 1],
  part: data[W_PART - 1],
  total: data[W_TOTAL - 1],
  price: data[W_PRICE - 1]
};
const existingRow = findBookInLibrary(
  bookData.author,
  bookData.series,
  bookData.book,
  bookData.publisher
);
if (existingRow) {
  copyBookPrice_(ss.getSheetByName(LIBRARY), existingRow, bookData.price);
  const answer = ui.alert(
    "Книга вже є в бібліотеці.\n\nПерейти до неї?",
    ui.ButtonSet.YES_NO
  );
  if (answer === ui.Button.YES) {
    const library = ss.getSheetByName(LIBRARY);
    ss.setActiveSheet(library);
    library.getRange(existingRow, COL_BOOK).activate();
  }
  return;
}
  addBook(bookData);
}
function cleanWishlist() {
  const ss = SpreadsheetApp.getActive();
  const ui = SpreadsheetApp.getUi();
  const wishlist = ss.getSheetByName(WISHLIST);
  const library = ss.getSheetByName(LIBRARY);
  if (!library) {
    ui.alert(
      '❌ Не знайдено лист "' + LIBRARY + '".'
    );
    return;
  }
  if (!wishlist) {
    ui.alert(
      '❌ Не знайдено лист "' + WISHLIST + '".'
    );
    return;
  }
  // ==========================================================
  // ЗБИРАЄМО КНИГИ, ЯКІ РЕАЛЬНО Є В БІБЛІОТЕЦІ
  // ==========================================================
  const libraryData = library.getLastRow() > 1
    ? library.getRange(
        2,
        1,
        library.getLastRow() - 1,
        library.getLastColumn()
      ).getValues()
    : [];
  const libraryBooks = new Set();
  libraryData.forEach(row => {
    const author = normalizeText(
      row[COL_AUTHOR - 1]
    );
    const book = normalizeText(
      row[COL_BOOK - 1]
    );
    const publisher = normalizeText(
      row[COL_PUBLISHER - 1]
    );
    // Конкретна книга / конкретне видання
    const key =
      author + "|" +
      book + "|" +
      publisher;
    libraryBooks.add(key);
  });
  // ==========================================================
  // ЧИТАЄМО БАЖАНКИ
  // ==========================================================
  const lastRow = wishlist.getLastRow();
  if (lastRow < 2) {
    ui.alert(
      "Бажанки порожні."
    );
    return;
  }
  const data = wishlist
    .getRange(
      2,
      1,
      lastRow - 1,
      wishlist.getLastColumn()
    )
    .getValues();
  let found = 0;
  const foundBooks = [];
  const rowsToDelete = [];
  // ==========================================================
  // ШУКАЄМО ТОЧНІ ЗБІГИ
  // ==========================================================
  for (let i = 0; i < data.length; i++) {
    const author = normalizeText(
      data[i][W_AUTHOR - 1]
    );
    const book = normalizeText(
      data[i][W_BOOK - 1]
    );
    const publisher = normalizeText(
      data[i][W_PUBLISHER - 1]
    );
    const key =
      author + "|" +
      book + "|" +
      publisher;
    if (book && libraryBooks.has(key)) {
      found++;
      foundBooks.push(
        data[i][W_BOOK - 1]
      );
      rowsToDelete.push(i + 2);
    }
  }
  // ==========================================================
  // НІЧОГО НЕ ЗНАЙДЕНО
  // ==========================================================
  if (found === 0) {
    ui.alert(
      "✅ Усі бажанки актуальні.\n" +
      "Нічого видаляти не потрібно."
    );
    return;
  }
  // ==========================================================
  // ПІДТВЕРДЖЕННЯ
  // ==========================================================
  const answer = ui.alert(
    "🧹 Очистити бажанки?",
    "Знайдено " +
    found +
    " книг, які вже є в бібліотеці:\n\n" +
    foundBooks.join("\n") +
    "\n\nВидалити їх із бажанок?",
    ui.ButtonSet.YES_NO
  );
  if (answer !== ui.Button.YES) {
    return;
  }
  // ==========================================================
  // ВИДАЛЯЄМО ЗНИЗУ ВГОРУ
  // ==========================================================
  for (let i = rowsToDelete.length - 1; i >= 0; i--) {
    wishlist.deleteRow(
      rowsToDelete[i]
    );
  }
  // ==========================================================
  // ЛОГ
  // ==========================================================
  addLog(
    "🧹 Очищено бажанки",
    "",
    "",
    "Видалено " +
    found +
    " книг, які вже є в бібліотеці"
  );
  ui.alert(
    "✅ Видалено " +
    found +
    " книг із бажанок."
  );
}
function findMissingSeriesBooks() {
  const ss = SpreadsheetApp.getActive();
  const librarySheet = ss.getSheetByName(LIBRARY);
  const wishlistSheet = ss.getSheetByName(WISHLIST);
  const seriesSheet = ss.getSheetByName(SERIES);
  const library = librarySheet.getDataRange().getValues();
  const wishlist = wishlistSheet.getDataRange().getValues();
  const series = seriesSheet.getDataRange().getValues();
  const catalogSheet = ss.getSheetByName(CATALOG);
const catalog = catalogSheet.getDataRange().getValues();
  const publishers = {};
for (let i = 1; i < series.length; i++) {
  const key =
    normalizeText(series[i][S_AUTHOR - 1]) + "|" +
    normalizeText(series[i][S_SERIES - 1]);
  publishers[key] = series[i][S_PUBLISHER - 1];
}
const catalogBooks = {};
for (let i = 1; i < catalog.length; i++) {
  const number = parseFloat(
    String(catalog[i][CAT_NUMBER - 1]).replace(",", ".")
  );
  if (isNaN(number)) continue;
  const key =
    normalizeText(catalog[i][CAT_AUTHOR - 1]) + "|" +
    normalizeText(catalog[i][CAT_SERIES - 1]) + "|" +
    number;
  catalogBooks[key] = catalog[i][CAT_BOOK - 1];
}
const librarySet = new Set();
for (let i = 1; i < library.length; i++) {
  if (library[i][COL_TYPE - 1] !== "Серія") continue;
  const key =
    normalizeText(library[i][COL_AUTHOR - 1]) + "|" +
    normalizeText(library[i][COL_SERIES - 1]) + "|" +
    bookPartKey_(library[i][COL_SERIES_NUM - 1]);
  librarySet.add(key);
  }
  const wishlistSet = new Set();
for (let i = 1; i < wishlist.length; i++) {
  if (
    String(wishlist[i][W_IS_SERIES - 1])
      .trim()
      .toLowerCase() !== "так"
  ) continue;
  const key =
    normalizeText(wishlist[i][W_AUTHOR - 1]) + "|" +
    normalizeText(wishlist[i][W_SERIES_NAME - 1]) + "|" +
    bookPartKey_(wishlist[i][W_PART - 1]);
  wishlistSet.add(key);
}
const booksToAdd = [];
for (let i = 1; i < series.length; i++) {
  const author = String(series[i][S_AUTHOR - 1]).trim();
const seriesName = String(series[i][S_SERIES - 1]).trim();
const totalBooks = Number(series[i][S_TOTAL - 1]);
const publisher = String(
  series[i][S_PUBLISHER - 1]
).trim();
  if (!totalBooks) continue;
  for (let part = 1; part <= totalBooks; part++) {
  const key =
    normalizeText(author) + "|" +
    normalizeText(seriesName) + "|" +
    part;
  if (librarySet.has(key)) continue;
  if (wishlistSet.has(key)) continue;
  wishlistSet.add(key);
  booksToAdd.push({
  author: author,
  series: seriesName,
  book:
  catalogBooks[
    normalizeText(author) + "|" +
    normalizeText(seriesName) + "|" +
    part
  ] || ("Частина " + part),
  status: "Хочу купити",
  publisher:
  publishers[
    normalizeText(author) + "|" +
    normalizeText(seriesName)
  ] || "",
  isSeries: "Так",
  availability: "",
  part: part,
  total: totalBooks,
  release: ""
});
}
}
if (booksToAdd.length === 0) {
  SpreadsheetApp.getUi().alert(
    "✅ Усі книги вже є в бібліотеці або бажанках."
  );
  return;
}
booksToAdd.sort((a, b) => {
  const author = a.author.localeCompare(b.author, "uk");
  if (author !== 0) return author;
  const series = a.series.localeCompare(b.series, "uk");
  if (series !== 0) return series;
  return a.part - b.part;
});
const ui = SpreadsheetApp.getUi();
let message =
  "✨ Знайдено " +
  booksToAdd.length +
  " відсутн" +
  (booksToAdd.length === 1 ? "ю книгу.\n\n" : "і книги.\n\n");
let currentAuthor = "";
booksToAdd.forEach(book => {
  if (book.author !== currentAuthor) {
    if (currentAuthor !== "") {
      message += "\n";
    }
    currentAuthor = book.author;
    message += "📚 " + currentAuthor + "\n";
  }
  if (book.series) {
    message +=
      "   • " +
      book.series +
      " #" +
      book.part +
      " - " +
      book.book +
      "\n";
  } else {
    message +=
      "   • " +
      book.book +
      "\n";
  }
});
message += "Додати їх у бажанки?";
const answer = ui.alert(
  "Пошук відсутніх книг",
  message,
  ui.ButtonSet.YES_NO
);
if (answer !== SpreadsheetApp.getUi().Button.YES) {
  return;
}
const rows = booksToAdd.map(book => mappedBookRow_(wishlistSheet, [
  [W_AUTHOR, book.author], [W_SERIES_NAME, book.series], [W_BOOK, book.book],
  [W_STATUS, book.status], [W_PUBLISHER, book.publisher],
  [W_IS_SERIES, book.isSeries], [W_AVAILABILITY, book.availability],
  [W_PART, book.part], [W_TOTAL, book.total], [W_RELEASE, book.release]
]));
ensureBookRows_(wishlistSheet, wishlistSheet.getLastRow() + rows.length);

wishlistSheet
  .getRange(
    wishlistSheet.getLastRow() + 1,
    1,
    rows.length,
    rows[0].length
  )
  .setValues(rows);
  sortWishlist();
  addLog(
  "✨ Додано книги в бажанки",
  "",
  "",
  "Додано " + rows.length + " книг"
);
SpreadsheetApp.getUi().alert(
  "✅ У бажанки додано " +
  rows.length +
  " книг."
);
}
function syncPublishers() {
  const ss = SpreadsheetApp.getActive();
  const library = ss.getSheetByName(LIBRARY);
  const series = ss.getSheetByName(SERIES);
  const wishlist = ss.getSheetByName(WISHLIST);
  const libraryData = library.getDataRange().getValues();
  const seriesData = series.getDataRange().getValues();
  const wishlistData = wishlist.getDataRange().getValues();
  const publishers = {};
// Беремо видавництва з листа "Серії"
for (let i = 1; i < seriesData.length; i++) {
  const publisher = String(
    seriesData[i][S_PUBLISHER - 1]
  ).trim();
  if (!publisher) continue;
  const key =
    normalizeText(seriesData[i][S_AUTHOR - 1]) +
    "|" +
    normalizeText(seriesData[i][S_SERIES - 1]);
  publishers[key] = publisher;
}
  // Заповнюємо лист Серії
  for (let i = 1; i < seriesData.length; i++) {
    const key =
      normalizeText(seriesData[i][S_AUTHOR - 1]) +
      "|" +
      normalizeText(seriesData[i][S_SERIES - 1]);
    if (publishers[key]) {
      seriesData[i][S_PUBLISHER - 1] = publishers[key];
    }
  }
 // Заповнюємо лише порожні клітинки в Бажанках
for (let i = 1; i < wishlistData.length; i++) {
  if (
    String(wishlistData[i][W_IS_SERIES - 1]).trim().toLowerCase() !== "так"
  ) continue;
  const key =
    normalizeText(wishlistData[i][W_AUTHOR - 1]) +
    "|" +
    normalizeText(wishlistData[i][W_SERIES_NAME - 1]);
  if (!publishers[key]) {
    Logger.log("НЕ ЗНАЙШОВ: " + key);
    continue;
  }
  if (
  !String(wishlistData[i][W_PUBLISHER - 1]).trim() &&
  publishers[key]
) {
  wishlist
    .getRange(i + 1, W_PUBLISHER)
    .setValue(publishers[key]);
}
}
}
//==========================================================
// ПЕРЕНЕСТИ КНИГИ З БАЖАНОК
//==========================================================
function transferWishlistToLibrary() {
  const ss = SpreadsheetApp.getActive();
  const ui = SpreadsheetApp.getUi();
  const wishlist = ss.getSheetByName(WISHLIST);
  const library = ss.getSheetByName(LIBRARY);
  const candidates = readBookRows_(wishlist)
    .map((row, index) => ({ row: index + 2, book: wishlistBookData_(row) }))
    .filter(item => String(item.book.status).trim() === "В бібліотеці" &&
      hasBookValue_(item.book.book));
  if (!candidates.length) {
    ui.alert('Не знайдено книг зі статусом "В бібліотеці" та заповненою назвою.');
    return;
  }
  const answer = ui.alert(
    "Перенесення книг",
    candidates.map(item => "• " + item.book.author + " — " + item.book.book).join("\n") +
    "\n\nНові книги буде додано. Для вже наявного видання заповнена ціна з бажанок " +
    "замінить ціну в бібліотеці; порожня ціна нічого не змінить. " +
    "Наявні видання залишаться в бажанках. Продовжити?",
    ui.ButtonSet.YES_NO
  );
  if (answer !== ui.Button.YES) return;

  const added = [];
  let updatedPrices = 0;
  let existingCount = 0;
  for (const item of candidates) {
    const book = item.book;
    // Повторна перевірка враховує книги, додані раніше в цьому самому запуску.
    const existing = findBookInLibrary(book.author, book.series, book.book, book.publisher);
    if (existing) {
      if (copyBookPrice_(library, existing, book.price)) updatedPrices++;
      existingCount++;
      continue;
    }
    const newRow = addBook(book, false);
    // Скасований діалог або порожня назва не дають права видаляти бажанку.
    if (newRow) added.push({ sourceRow: item.row, libraryRow: newRow, book: book });
  }
  SpreadsheetApp.flush();
  let deletedCount = 0;
  if (added.length) {
    const deleteAnswer = ui.alert(
      "Видалення з бажанок",
      "Успішно додано до бібліотеки:\n\n" +
      added.map(item => "• " + item.book.author + " — " + item.book.book).join("\n") +
      "\n\nВидалити ці книги з бажанок?",
      ui.ButtonSet.YES_NO
    );
    if (deleteAnswer === ui.Button.YES) {
      added.slice().sort((a, b) => b.sourceRow - a.sourceRow).forEach(item => {
        wishlist.deleteRow(item.sourceRow);
        deletedCount++;
      });
    }
    sortWishlist();
    ss.setActiveSheet(library);
    library.getRange(added[0].libraryRow, COL_GENRE).activate();
  }
  addLog("📚 Перенесення з бажанок", "", "",
    "Додано: " + added.length + "; оновлено цін: " + updatedPrices +
    "; уже є: " + existingCount + "; видалено з бажанок: " + deletedCount);
  ui.alert("✅ Додано книг: " + added.length +
    "\nОновлено цін наявних видань: " + updatedPrices +
    "\nВидалено з бажанок: " + deletedCount);
}

// Допоміжні функції. Не залежать від букв або порядку колонок.
function bookColumn_(sheetName, aliases) {
  if (!BOOK_HEADERS_[sheetName]) {
    const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
    if (!sheet) throw new Error('Не знайдено лист "' + sheetName + '".');
    BOOK_HEADERS_[sheetName] = sheet.getRange(1, 1, 1, sheet.getLastColumn())
      .getDisplayValues()[0].map(bookHeaderKey_);
  }
  const wanted = aliases.map(bookHeaderKey_);
  const matches = [];
  BOOK_HEADERS_[sheetName].forEach((header, index) => {
    if (wanted.indexOf(header) !== -1) matches.push(index + 1);
  });
  if (matches.length !== 1) {
    throw new Error('Лист "' + sheetName + '": потрібен один стовпець "' +
      aliases.join('" або "') + '". Знайдено: ' + matches.length + '.');
  }
  return matches[0];
}
function bookHeaderKey_(value) {
  return String(value == null ? "" : value).trim().toLowerCase().replace(/\s+/g, " ");
}
function hasBookValue_(value) {
  return value !== null && value !== undefined &&
    !(typeof value === "string" && value.trim() === "");
}
function readBookRows_(sheet) {
  if (!sheet) throw new Error("Не знайдено потрібний лист.");
  return sheet.getLastRow() < 2 ? [] :
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
}
function mappedBookRow_(sheet, entries) {
  const row = Array(sheet.getLastColumn()).fill("");
  entries.forEach(entry => { row[entry[0] - 1] = entry[1] == null ? "" : entry[1]; });
  return row;
}
function ensureBookRows_(sheet, requiredLastRow) {
  if (requiredLastRow > sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), requiredLastRow - sheet.getMaxRows());
  }
}
function wishlistBookData_(row) {
  return {
    author: row[W_AUTHOR - 1], series: row[W_SERIES_NAME - 1],
    book: row[W_BOOK - 1], price: row[W_PRICE - 1],
    status: row[W_STATUS - 1], publisher: row[W_PUBLISHER - 1],
    isSeries: row[W_IS_SERIES - 1], part: row[W_PART - 1], total: row[W_TOTAL - 1]
  };
}
function copyBookPrice_(library, row, price) {
  if (!hasBookValue_(price)) return false; // Число 0 є заповненою ціною.
  library.getRange(row, COL_PRICE).setValue(price);
  return true;
}
function bookPartKey_(value) {
  const text = String(value == null ? "" : value).trim().replace(",", ".");
  return text !== "" && Number.isFinite(Number(text)) ? String(Number(text)) : text;
}
