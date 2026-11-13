
function npProbeIncoming() {
  const key = PropertiesService.getScriptProperties()
    .getProperty('NP_API_KEY');

  if (!key) throw new Error('NP_API_KEY відсутній');

  const sh = SpreadsheetApp
    .openById(NP_BOOKS_CONFIG.id)
    .getSheetByName('Бажанки');

  const lastRow = sh.getLastRow();

  const known = new Set(
    lastRow > 1
      ? sh.getRange(2, 15, lastRow - 1, 1)
          .getDisplayValues()
          .flat()
          .map(x => String(x).replace(/\s/g, ''))
          .filter(x => /^\d{14}$/.test(x))
      : []
  );

  const from = new Date();
  const to = new Date();

  from.setDate(from.getDate() - 60);
  to.setDate(to.getDate() + 1);

  const fmt = d => Utilities.formatDate(
    d, 'Europe/Kyiv', 'dd.MM.yyyy'
  );

  const response = UrlFetchApp.fetch(
    'https://api.novaposhta.ua/v2.0/json/',
    {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify({
        apiKey: key,
        modelName: 'InternetDocument',
        calledMethod: 'getDocumentList',
        methodProperties: {
          DateTimeFrom: fmt(from),
          DateTimeTo: fmt(to),
          GetFullList: '1'
        }
      })
    }
  );

  const http = response.getResponseCode();
  if (http !== 200) throw new Error('HTTP ' + http);

  const body = JSON.parse(response.getContentText());

  if (body.success !== true || !Array.isArray(body.data)) {
    console.log('API відхилив запит.');
    console.log('Кількість помилок: ' +
      (body.errors || []).length);
    return;
  }

  const docs = body.data;

  const matches = docs.filter(d =>
    known.has(String(d.IntDocNumber || '')
      .replace(/\s/g, ''))
  ).length;

  const withOrderNumbers = docs.filter(d =>
    Boolean(d.InfoRegClientBarcodes)
  ).length;

  console.log('API відповів успішно.');
  console.log('Знайдено накладних: ' + docs.length);
  console.log('Відомих ТТН у таблиці: ' + known.size);
  console.log('Збігів із таблицею: ' + matches);
  console.log('Із внутрішнім номером: ' + withOrderNumbers);

  if (docs.length >= 500) {
    console.log('Можливе обмеження списку 500 записами.');
  }
}
