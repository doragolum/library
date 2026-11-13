
/**
 * Синхронізація статусу НП з колонкою E.
 * Використовує результати поточного npUpdate().
 * Не робить додаткових API-запитів.
 */

function npBookStatusFromCode_(code) {
  const mapping = {
    '1': 'Створено ТТН',

    '4': 'Відправлено',
    '41': 'Відправлено',
    '5': 'Відправлено',
    '6': 'Відправлено',
    '101': 'Відправлено',

    '7': 'Доставлено',
    '8': 'Доставлено',

    '9': 'В бібліотеці',
    '10': 'В бібліотеці',
    '11': 'В бібліотеці'
  };

  return mapping[String(code)] || null;
}

function npSyncBooksFromNp_(sheet, source, statuses, dryRun) {
  const progress = {
    'Замовлено': 0,
    'Створено ТТН': 1,
    'Відправлено': 2,
    'В дорозі': 2,
    'Доставлено': 3,
    'В бібліотеці': 4
  };

  const current = sheet
    .getRange(2, 5, source.length, 1)
    .getDisplayValues();

  const changes = [];
  const totals = {};

  source.forEach((row, i) => {
    const ttn = npNormalize_(row[1]);

    // Лише коректні ТТН, які були перевірені API.
    if (!/^\d{14}$/.test(ttn)) return;

    const result = statuses.get(ttn);
    if (!result || result.error) return;

    const next = npBookStatusFromCode_(result.code);
    if (!next) return;

    const previous = String(current[i][0]).trim();

    // Не змінюємо невідомі, скасовані та ручні статуси.
    if (!Object.prototype.hasOwnProperty.call(
      progress, previous
    )) return;

    // Ніколи не повертаємо статус назад.
    if (progress[next] <= progress[previous]) return;

    changes.push({ row: i + 2, status: next });
    totals[next] = (totals[next] || 0) + 1;
  });

  console.log(
    'НП → Бажанки: ' +
    (dryRun ? 'ТЕСТ' : 'ОНОВЛЕННЯ')
  );
  console.log('Знайдено змін: ' + changes.length);
  console.log('За статусами: ' + JSON.stringify(totals));

  if (!dryRun) {
    changes.forEach(change => {
      sheet.getRange(change.row, 5)
        .setValue(change.status);
    });

    SpreadsheetApp.flush();
  }

  return changes.length;
}
