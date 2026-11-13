
function npProbeGmail() {
  const sh = SpreadsheetApp
    .openById(NP_BOOKS_CONFIG.id)
    .getSheetByName('Бажанки');

  const rows = sh.getLastRow() > 1
    ? sh.getRange(2, 14, sh.getLastRow() - 1, 2)
        .getDisplayValues()
    : [];

  const orders = [...new Set(
    rows.map(r => r[0].trim()).filter(Boolean)
  )];

  const threads = GmailApp.search(
    'after:2026/09/01 {ТТН накладна відстеження}',
    0, 100
  );

  let scanned = 0;
  let withTTN = 0;
  let matched = 0;

  for (const thread of threads) {
    for (const message of thread.getMessages()) {
      if (message.getDate() < new Date('2026-09-01')) {
        continue;
      }

      scanned++;
      const content = message.getSubject() +
        '\n' + message.getPlainBody();

      const ttNs = [...new Set(
        (content.match(/\b20\d{12}\b/g) || [])
      )];

      if (!ttNs.length) continue;
      withTTN++;

      const found = orders.filter(order => {
        const escaped = order.replace(
          /[.*+?^${}()|[\]\\]/g, '\\$&'
        );
        return new RegExp(
          '(^|[^0-9A-Za-z])' + escaped +
          '($|[^0-9A-Za-z])'
        ).test(content);
      });

      if (found.length === 1 && ttNs.length === 1) {
        matched++;
      }
    }
  }

  console.log('Перевірено листів: ' + scanned);
  console.log('Листів із ТТН: ' + withTTN);
  console.log('Потенційних однозначних збігів: ' + matched);
  console.log('Дані таблиці не змінювалися.');
}
