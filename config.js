// Адреса, з якої сайт бере дані.
// З 14.11.2026 — нова база (Supabase). Повернутися до Google-таблиці: відкрити посилання з &db=0 (назад — &db=1).
window.LB_API_URL = "https://script.google.com/macros/s/AKfycbwzMBurJfPgrKJY2H99pHG7BN7axnxWIFC3p1cHjno3Q0bKywZP71_KDC2vBd9qfUi1/exec";
(function () {
  var m = /[?&]db=([01])\b/.exec(location.search), on = false;
  try {
    if (m) localStorage.setItem('lb.db', m[1]);
    on = localStorage.getItem('lb.db') !== '0';
  } catch (e) { on = !(m && m[1] === '0'); }
  if (on) {
    window.LB_DB = true;
    window.LB_API_URL = "https://syrwtxxgbybftkuxuvlq.supabase.co/functions/v1/api";
    window.LB_AI_URL = "https://syrwtxxgbybftkuxuvlq.supabase.co/functions/v1/ai";
  }
})();
