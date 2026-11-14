// Адреса, з якої сайт бере дані.
// Звичайно — Apps Script (Google-таблиця). Пробний режим нової бази: відкрити посилання з &db=1 (вимкнути — &db=0).
window.LB_API_URL = "https://script.google.com/macros/s/AKfycbwzMBurJfPgrKJY2H99pHG7BN7axnxWIFC3p1cHjno3Q0bKywZP71_KDC2vBd9qfUi1/exec";
(function () {
  var m = /[?&]db=([01])\b/.exec(location.search), on = false;
  try {
    if (m) localStorage.setItem('lb.db', m[1]);
    on = localStorage.getItem('lb.db') === '1';
  } catch (e) { on = !!(m && m[1] === '1'); }
  if (on) {
    window.LB_DB = true;
    window.LB_API_URL = "https://syrwtxxgbybftkuxuvlq.supabase.co/functions/v1/api";
  }
})();
