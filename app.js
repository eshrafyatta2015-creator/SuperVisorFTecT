/* ============================================================
   المشرف الفني / التقنية — منطق التطبيق والبحث المطوّر
   ------------------------------------------------------------
   • بحث فوري (أثناء الكتابة) بدل البحث بالقائمة المنسدلة فقط
   • مطابقة جزئية بالاسم / رقم الهوية / المدرسة / التخصص / السكن
   • تطبيع النص العربي (التشكيل، الألف المهموزة، التاء المربوطة، الأرقام)
   • بحث بكلمات متعددة (كل الكلمات يجب أن تظهر) مع ترتيب حسب الأفضلية
   • فلاتر (المدرسة / المؤهل / التخصص) + إبراز الكلمات المطابقة
   • العمل دون اتصال: آخر نسخة من البيانات محفوظة محلياً
   ============================================================ */
'use strict';

/* ------------------ الإعدادات ------------------ */
const DATA_URL =
  'https://docs.google.com/spreadsheets/d/1r3QcCM_g4nccN_-s9dMhpmxtwKAIxbq0oYrDJVgRUsQ/export?format=csv';
const SNAPSHOT_URL = 'data/teachers.csv';
const CACHE_KEY = 'sup_data_v1';
const QUERY_KEY = 'sup_query_v1';

/* أعمدة الجدول (0 = بدون الرأس) */
const INFO_FIELDS = [
  ['الاسم الرباعي', 0], ['رقم الهوية', 1], ['السكن', 2], ['اسم المدرسة', 3],
  ['المركز الآخر', 4], ['المؤهل العلمي', 5], ['التخصص الجامعي', 6],
  ['الصفوف التي يدرسها', 7], ['تاريخ التعيين', 8], ['المؤهل التربوي', 9],
  ['الرقم', 10], ['تاريخ التحديث', 11],
  ['على مستوى المديرية', 47], ['أيام الدوام / نصف المركز', 48]
];

/* حقول البحث ووزنها في الترتيب */
const SEARCH_FIELDS = [
  { idx: 0,  w: 1.00 }, // الاسم
  { idx: 1,  w: 1.00 }, // رقم الهوية
  { idx: 3,  w: 0.85 }, // المدرسة
  { idx: 6,  w: 0.75 }, // التخصص
  { idx: 2,  w: 0.65 }, // السكن
  { idx: 7,  w: 0.65 }, // الصفوف
  { idx: 5,  w: 0.55 }, // المؤهل العلمي
  { idx: 4,  w: 0.55 }, // المركز الآخر
  { idx: 9,  w: 0.45 }, // المؤهل التربوي
  { idx: 8,  w: 0.35 }, // تاريخ التعيين
  { idx: 47, w: 0.35 },
  { idx: 48, w: 0.35 }
];

/* أيام الدوام: كل يوم 7 حصص متتالية ابتداءً من العمود المذكور */
const DAYS = [
  ['الأحد', 12], ['الاثنين', 19], ['الثلاثاء', 26],
  ['الاربعاء', 33], ['الخميس', 40]
];
const PER_DAY = 7;

/* ------------------ أدوات النص العربي ------------------ */
function normalizeWithMap(raw) {
  const s = raw == null ? '' : String(raw);
  let out = '';
  const map = [];
  let prevSpace = true; // نتجاهل المسافات في البداية
  for (let i = 0; i < s.length; i++) {
    let c = s[i];
    const code = c.codePointAt(0);
    // التشكيل + التطويل
    if ((code >= 0x064B && code <= 0x0652) || code === 0x0670 || code === 0x0640) continue;
    if (c === 'أ' || c === 'إ' || c === 'آ' || c === 'ٱ') c = 'ا';
    else if (c === 'ى') c = 'ي';
    else if (c === 'ة') c = 'ه';
    else if (c === 'ؤ') c = 'و';
    else if (c === 'ئ') c = 'ي';
    else if (code >= 0x0660 && code <= 0x0669) c = String(code - 0x0660);
    else if (code >= 0x06F0 && code <= 0x06F9) c = String(code - 0x06F0);
    else if (/\s/.test(c)) c = ' ';

    if (c === ' ') {
      if (prevSpace) continue;
      prevSpace = true;
    } else {
      prevSpace = false;
    }
    const lc = c.toLowerCase();
    for (const ch of lc) { out += ch; map.push(i); }
  }
  return { text: out, map };
}

function normalize(raw) { return normalizeWithMap(raw).text; }

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** إبراز الكلمات المطابقة داخل النص الأصلي */
function highlight(raw, tokens) {
  const s = raw == null ? '' : String(raw);
  if (!tokens.length) return esc(s);
  const { text, map } = normalizeWithMap(s);
  const ranges = [];
  for (const t of tokens) {
    let from = 0;
    for (;;) {
      const i = text.indexOf(t, from);
      if (i < 0) break;
      ranges.push([i, i + t.length - 1]);
      from = i + 1;
    }
  }
  if (!ranges.length) return esc(s);
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  let out = '';
  let pos = 0;
  for (const [a, b] of merged) {
    let rs = map[a];
    const re = b + 1 < map.length ? map[b + 1] : s.length;
    if (rs < pos) rs = pos;
    if (rs > s.length || re > s.length || rs >= re) continue;
    out += esc(s.slice(pos, rs)) + '<mark>' + esc(s.slice(rs, re)) + '</mark>';
    pos = re;
  }
  out += esc(s.slice(pos));
  return out;
}

/* ------------------ قارئ CSV ------------------ */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const s = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r[0] || '').trim() !== '');
}

/* ------------------ الحالة ------------------ */
const state = {
  rows: [],          // الصفوف بدون الرأس
  index: [],         // نصوص مطبَّعة لكل صف
  source: 'none',
  updatedAt: 0,
  query: '',
  tokens: [],
  filters: { school: '', degree: '', spec: '' }
};

function buildIndex() {
  state.index = state.rows.map(r => {
    const item = { fields: {}, all: '' };
    for (const f of SEARCH_FIELDS) {
      const n = normalize(r[f.idx]);
      item.fields[f.idx] = n;
      item.all += n + ' ';
    }
    item.all = item.all.trim();
    return item;
  });
}

/* ------------------ البحث والترتيب ------------------ */
function scoreField(nf, token) {
  if (!nf) return 0;
  if (nf === token) return 100;
  if (nf.startsWith(token)) return 72;
  if (nf.split(' ').some(w => w.startsWith(token))) return 82;
  if (nf.includes(token)) return 48;
  return 0;
}

function runSearch() {
  const q = state.query.trim();
  const tokens = state.tokens;
  const f = state.filters;
  const hasFilters = f.school || f.degree || f.spec;

  if (!q && !hasFilters) return state.rows.map((_, i) => ({ i, score: 0 }));

  const out = [];
  for (let i = 0; i < state.rows.length; i++) {
    const r = state.rows[i];
    if (f.school && normalize(r[3]) !== f.school) continue;
    if (f.degree && normalize(r[5]) !== f.degree) continue;
    if (f.spec && normalize(r[6]) !== f.spec) continue;
    if (!tokens.length) { out.push({ i, score: 0 }); continue; }

    const idx = state.index[i];
    let total = 0;
    let ok = true;
    for (const t of tokens) {
      let best = 0;
      for (const f2 of SEARCH_FIELDS) {
        const s = scoreField(idx.fields[f2.idx], t) * f2.w;
        if (s > best) best = s;
      }
      if (best <= 0) { ok = false; break; }
      total += best;
    }
    if (ok) out.push({ i, score: total });
  }
  out.sort((a, b) => b.score - a.score || normalize(state.rows[a.i][0]).localeCompare(normalize(state.rows[b.i][0])));
  return out;
}

/* ------------------ العرض ------------------ */
const $ = sel => document.querySelector(sel);
const resultsEl = $('#results');
const statusEl = $('#status');
const qEl = $('#q');
const clearBtn = $('#clearBtn');

function sourcePill() {
  if (state.source === 'live') return '<span class="pill">مباشر</span>';
  if (state.source === 'cache' || state.source === 'snapshot') {
    const when = state.updatedAt ? timeAgo(state.updatedAt) : '';
    return '<span class="pill off">نسخة محفوظة' + (when ? ' · ' + when : '') + '</span>';
  }
  return '<span class="pill off">بدون بيانات</span>';
}

function timeAgo(ts) {
  const d = Math.max(0, Date.now() - ts);
  const m = Math.floor(d / 60000);
  if (m < 1) return 'الآن';
  if (m < 60) return 'منذ ' + m + ' دقيقة';
  const h = Math.floor(m / 60);
  if (h < 24) return 'منذ ' + h + ' ساعة';
  return 'منذ ' + Math.floor(h / 24) + ' يوم';
}

function renderStatus(count) {
  const online = navigator.onLine;
  statusEl.innerHTML =
    sourcePill() +
    (online ? '' : '<span class="pill off">غير متصل</span>') +
    '<span class="count">النتائج: ' + count + '</span>' +
    '<span>إجمالي السجلات: ' + state.rows.length + '</span>';
}

function renderResults() {
  const list = runSearch();
  renderStatus(list.length);

  if (!list.length) {
    resultsEl.innerHTML = emptyState();
    bindSuggestions();
    return;
  }

  const tokens = state.tokens;
  const html = list.slice(0, 300).map(({ i }) => {
    const r = state.rows[i];
    const name = highlight(r[0], tokens);
    const idno = highlight(r[1], tokens);
    const school = highlight(r[3], tokens);
    const spec = highlight(r[6], tokens);
    const tags = [];
    if (r[5]) tags.push('<span class="tag alt">' + esc(r[5]) + '</span>');
    if (r[2]) tags.push('<span class="tag">' + highlight(r[2], tokens) + '</span>');
    if (r[9]) tags.push('<span class="tag">' + esc(r[9]) + '</span>');
    return (
      '<button class="card" type="button" data-row="' + i + '">' +
        '<span class="row1"><span class="name">' + name + '</span>' +
        '<span class="idno">' + idno + '</span></span>' +
        '<span class="row2">' + school + '</span>' +
        '<span class="meta">' + tags.join('') + '</span>' +
      '</button>'
    );
  }).join('');

  const more = list.length > 300
    ? '<div class="empty">توجد ' + list.length + ' نتيجة — يعرض أول 300. دقّق البحث لعرض الباقي.</div>'
    : '';
  resultsEl.innerHTML = html + more;
}

function emptyState() {
  const q = state.query.trim();
  if (!q && !state.filters.school && !state.filters.degree && !state.filters.spec) {
    return '<div class="empty"><strong>ابدأ البحث</strong>' +
      'اكتب اسم المعلم أو رقم الهوية أو اسم المدرسة…</div>';
  }
  // اقتراحات
  const first = state.tokens[0] || '';
  let suggestions = [];
  if (first) {
    suggestions = state.rows
      .map((r, i) => ({ i, n: state.index[i].all }))
      .filter(o => o.n.includes(first))
      .slice(0, 6);
  }
  if (!suggestions.length) {
    suggestions = state.rows.slice(0, 6).map((_, i) => ({ i }));
  }
  const btns = suggestions.map(o =>
    '<button type="button" data-sug="' + esc(state.rows[o.i][0]) + '">' +
    esc(state.rows[o.i][0]) + '</button>').join('');
  return '<div class="empty"><strong>لا توجد نتائج مطابقة</strong>' +
    'جرّب كلمة أقصر، أو تأكد من كتابة رقم الهوية بدون مسافات.' +
    '<div class="suggest">' + btns + '</div></div>';
}

function bindSuggestions() {
  resultsEl.querySelectorAll('[data-sug]').forEach(b => {
    b.addEventListener('click', () => {
      qEl.value = b.getAttribute('data-sug');
      onQueryChange();
      qEl.focus();
    });
  });
}

/* ------------------ تفاصيل السجل ------------------ */
function openDetail(i) {
  const r = state.rows[i];
  const dl = INFO_FIELDS
    .filter(([, idx]) => (r[idx] || '').trim() !== '')
    .map(([label, idx]) => '<dt>' + esc(label) + '</dt><dd>' + esc(r[idx]) + '</dd>')
    .join('');

  let sched = '<table class="schedule"><thead><tr><th>اليوم</th>';
  for (let h = 1; h <= PER_DAY; h++) sched += '<th>الحصة ' + h + '</th>';
  sched += '</tr></thead><tbody>';
  for (const [day, from] of DAYS) {
    sched += '<tr><td class="day">' + esc(day) + '</td>';
    for (let k = 0; k < PER_DAY; k++) {
      const v = (r[from + k] || '').trim();
      sched += v
        ? '<td>' + esc(v) + '</td>'
        : '<td class="empty-cell">—</td>';
    }
    sched += '</tr>';
  }
  sched += '</tbody></table>';

  $('#detailTitle').textContent = r[0] || 'تفاصيل';
  $('#detailBody').innerHTML =
    '<dl class="kv">' + dl + '</dl>' +
    '<div class="section-title">جدول الحصص الأسبوعي</div>' + sched;
  openModal('detailModal');
}

/* ------------------ النوافذ ------------------ */
function openModal(id) { document.getElementById(id).hidden = false; document.body.style.overflow = 'hidden'; }
function closeModal(id) { document.getElementById(id).hidden = true; document.body.style.overflow = ''; }
document.querySelectorAll('[data-close]').forEach(b =>
  b.addEventListener('click', () => closeModal(b.getAttribute('data-close'))));
document.querySelectorAll('.modal').forEach(m =>
  m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); }));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal:not([hidden])').forEach(m => closeModal(m.id));
});

/* ------------------ الفلاتر ------------------ */
function fillSelect(sel, idx) {
  const seen = new Map();
  for (const r of state.rows) {
    const v = (r[idx] || '').trim();
    if (!v) continue;
    const n = normalize(v);
    if (!seen.has(n)) seen.set(n, v);
  }
  const vals = Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1], 'ar'));
  const cur = sel.value;
  sel.innerHTML = '<option value="">الكل</option>' +
    vals.map(([n, v]) => '<option value="' + esc(n) + '">' + esc(v) + '</option>').join('');
  sel.value = cur;
}

function refreshFilters() {
  fillSelect($('#fSchool'), 3);
  fillSelect($('#fDegree'), 5);
  fillSelect($('#fSpec'), 6);
}

/* ------------------ الأحداث ------------------ */
let debounceTimer = null;
function onQueryChange() {
  state.query = qEl.value;
  state.tokens = state.query.split(/\s+/).map(normalize).filter(Boolean);
  clearBtn.hidden = !state.query;
  try { localStorage.setItem(QUERY_KEY, state.query); } catch (e) {}
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(renderResults, 110);
}
qEl.addEventListener('input', onQueryChange);
clearBtn.addEventListener('click', () => { qEl.value = ''; onQueryChange(); qEl.focus(); });

['fSchool', 'fDegree', 'fSpec'].forEach(id => {
  $('#' + id).addEventListener('change', e => {
    state.filters[id === 'fSchool' ? 'school' : id === 'fDegree' ? 'degree' : 'spec'] = e.target.value;
    renderResults();
  });
});
$('#resetBtn').addEventListener('click', () => {
  qEl.value = '';
  ['fSchool', 'fDegree', 'fSpec'].forEach(id => { $('#' + id).value = ''; });
  state.filters = { school: '', degree: '', spec: '' };
  onQueryChange();
});

resultsEl.addEventListener('click', e => {
  const card = e.target.closest('[data-row]');
  if (card) openDetail(Number(card.getAttribute('data-row')));
});

$('#helpLink').addEventListener('click', e => { e.preventDefault(); openModal('installHelp'); });

/* ------------------ التثبيت على الجهاز ------------------ */
let deferredPrompt = null;
const installBtn = $('#installBtn');
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) &&
  !window.MSStream && !window.navigator.standalone;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.hidden = false;
});
installBtn.addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') installBtn.hidden = true;
    deferredPrompt = null;
  } else {
    openModal('installHelp');
  }
});
window.addEventListener('appinstalled', () => { installBtn.hidden = true; });
if (isIOS) installBtn.hidden = false;

/* ------------------ تحميل البيانات ------------------ */
function saveCache(rows) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), rows })); } catch (e) {}
}

async function loadData() {
  try {
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = parseCSV(await res.text()).slice(1);
    if (rows.length) {
      saveCache(rows);
      return { rows, source: 'live', at: Date.now() };
    }
  } catch (e) { /* نجرب المصادر الأخرى */ }

  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (raw && Array.isArray(raw.rows) && raw.rows.length) {
      return { rows: raw.rows, source: 'cache', at: raw.at || 0 };
    }
  } catch (e) {}

  try {
    const res = await fetch(SNAPSHOT_URL, { cache: 'force-cache' });
    if (res.ok) {
      const rows = parseCSV(await res.text()).slice(1);
      if (rows.length) return { rows, source: 'snapshot', at: 0 };
    }
  } catch (e) {}

  return { rows: [], source: 'none', at: 0 };
}

async function init() {
  resultsEl.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
  const saved = (() => { try { return localStorage.getItem(QUERY_KEY) || ''; } catch (e) { return ''; } })();
  qEl.value = saved;

  const data = await loadData();
  state.rows = data.rows;
  state.source = data.source;
  state.updatedAt = data.at;
  buildIndex();
  refreshFilters();
  onQueryChange();
}

window.addEventListener('online', renderResults);
window.addEventListener('offline', renderResults);

init();

const isLocalHost = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname);
if ('serviceWorker' in navigator && (location.protocol === 'https:' || isLocalHost)) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
