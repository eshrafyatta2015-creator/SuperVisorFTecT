/*
 * تطوير البحث في مشروع App Inventor: SuperVisorFTecT
 * -------------------------------------------------
 * 1) إضافة مربع بحث نصي (SearchBox) يبحث بالاسم / رقم الهوية / السكن / المدرسة
 *    مع المطابقة الجزئية (contains) بدلاً من المطابقة التامة بالاسم فقط.
 * 2) تفعيل زر البحث (Button2) وجعله عربياً.
 * 3) ضبط منطق الإجراء procedure لاختيار مفتاح البحث (مربع البحث أو القائمة المنسدلة).
 *
 * يعمل على ملف Screen1.bky و Screen1.scm المستخرجين من .aia
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const bkyPath = path.join(root, '_extracted_supervisor', 'src', 'appinventor',
  'ai_eshrafyatta2015', 'SuperVisorFTecT', 'Screen1.bky');
const scmPath = path.join(root, '_extracted_supervisor', 'src', 'appinventor',
  'ai_eshrafyatta2015', 'SuperVisorFTecT', 'Screen1.scm');

function fail(msg) { console.error('ERROR: ' + msg); process.exit(1); }
function assert(cond, msg) { if (!cond) fail(msg); }

/* ---------- helpers ---------- */

// returns index just after the '>' that ends the tag starting at index i
function tagEnd(s, i) {
  let j = i + 1, q = null;
  for (; j < s.length; j++) {
    const c = s[j];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === '>') return j + 1;
  }
  return -1;
}

function tagName(s, i) {
  let j = i + 1;
  while (j < s.length && !/[\s>]/.test(s[j])) j++;
  return s.slice(i + 1, j);
}

// given index of an opening '<' find index just after its matching close tag
function closeOf(s, start) {
  assert(s[start] === '<', 'closeOf: not at a tag');
  const name = tagName(s, start);
  let end = tagEnd(s, start);
  assert(end > 0, 'closeOf: bad tag end for ' + name);
  if (s[end - 2] === '/') return end; // self closing
  let depth = 1, i = end;
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt < 0) fail('closeOf: unclosed <' + name + '>');
    if (s.startsWith('<?', lt)) { i = tagEnd(s, lt); continue; }
    if (s.startsWith('<!--', lt)) { i = s.indexOf('-->', lt) + 3; continue; }
    if (s.startsWith('<!', lt)) { i = tagEnd(s, lt); continue; }
    if (s.startsWith('</', lt)) {
      const n = tagName(s, lt + 1);
      const e = tagEnd(s, lt);
      if (n === name) { depth--; if (depth === 0) return e; }
      i = e; continue;
    }
    const n = tagName(s, lt);
    const e = tagEnd(s, lt);
    if (s[e - 2] !== '/') { if (n === name) depth++; }
    i = e;
  }
  fail('closeOf: fell off end for <' + name + '>');
}

function replaceOnce(s, oldStr, newStr, label) {
  const first = s.indexOf(oldStr);
  assert(first >= 0, 'anchor not found: ' + label);
  assert(s.indexOf(oldStr, first + 1) < 0, 'anchor not unique: ' + label);
  return s.slice(0, first) + newStr + s.slice(first + oldStr.length);
}

// replace the <value name="IF0">...</value> that contains block with given id
function replaceIfValue(s, blockId, newInner, label) {
  const marker = 'id="' + blockId + '"';
  const bi = s.indexOf(marker);
  assert(bi >= 0, 'block id not found: ' + blockId + ' (' + label + ')');
  const bs = s.lastIndexOf('<block', bi);
  const be = closeOf(s, bs);
  // value element wraps the block: <value name="IF0"> ... </value>
  const vs = s.lastIndexOf('<value', bs);
  const ve = closeOf(s, vs);
  assert(s.slice(vs, ve).endsWith('</value>'), 'bad value wrap: ' + label);
  return s.slice(0, vs) + newInner + s.slice(ve);
}

/* ---------- block fragments ---------- */

const NS = 'xmlns="http://www.w3.org/1999/xhtml"';

function getTextbox(comp, id) {
  return '<block type="component_set_get" id="' + id + '"><mutation ' + NS +
    ' component_type="TextBox" set_or_get="get" property_name="Text" is_generic="false" instance_name="' +
    comp + '"></mutation><field name="COMPONENT_SELECTOR">' + comp +
    '</field><field name="PROP">Text</field></block>';
}
function getSpinner(id) {
  return '<block type="component_set_get" id="' + id + '"><mutation ' + NS +
    ' component_type="Spinner" set_or_get="get" property_name="Selection" is_generic="false" instance_name="Spinner3"></mutation>' +
    '<field name="COMPONENT_SELECTOR">Spinner3</field><field name="PROP">Selection</field></block>';
}
function getKey(id) {
  return '<block type="lexical_variable_get" id="' + id + '"><field name="VAR">global searchKey</field></block>';
}
function getListIndex(n, id) {
  return '<block type="lists_select_item" id="' + id + '">' +
    '<value name="LIST"><block type="lexical_variable_get" id="' + id + 'g"><field name="VAR">item</field></block></value>' +
    '<value name="NUM"><block type="math_number" id="' + id + 'n"><field name="NUM">' + n + '</field></block></value></block>';
}
// contains(item[n], global searchKey)
function contains(n, id) {
  return '<block type="text_contains" id="' + id + '"><mutation ' + NS + ' mode="CONTAINS"></mutation>' +
    '<field name="OP">CONTAINS</field>' +
    '<value name="TEXT">' + getListIndex(n, id + 't') + '</value>' +
    '<value name="PIECE">' + getKey(id + 'p') + '</value></block>';
}
function logicOp(op, id, a, b) {
  return '<block type="logic_operation" id="' + id + '"><mutation ' + NS + ' items="2"></mutation>' +
    '<field name="OP">' + op + '</field>' +
    '<value name="A">' + a + '</value><value name="B">' + b + '</value></block>';
}
function isEmpty(inner, id) {
  return '<block type="text_isEmpty" id="' + id + '"><value name="VALUE">' + inner + '</value></block>';
}

/* =======================================================================
 *  Screen1.bky
 * ===================================================================== */

let bky = fs.readFileSync(bkyPath, 'utf8');

/* --- 1) المتغير العام searchKey ------------------------------------- */
const globalDecl = '<block type="global_declaration" id="kGlob1" x="-3287" y="-3700">' +
  '<field name="NAME">searchKey</field>' +
  '<value name="VALUE"><block type="text" id="kGlob1v"><field name="TEXT"></field></block></value></block>';

const procAnchor = '<block type="procedures_defnoreturn" id="(MG_aW:R}?rqEe{]im;@"';
assert(bky.indexOf(procAnchor) >= 0, 'procedure block not found');
bky = replaceOnce(bky, procAnchor, globalDecl + procAnchor, 'insert global searchKey');

/* --- 2) تهيئة searchKey في بداية الإجراء procedure ------------------ */
const stackTag = '<statement name="STACK">';
const procIdx = bky.indexOf(procAnchor);
const stackIdx = bky.indexOf(stackTag, procIdx);
assert(stackIdx >= 0, 'STACK statement not found');
const bodyStart = stackIdx + stackTag.length;
assert(bky.startsWith('<block', bodyStart), 'STACK does not start with a block');

const setterOpen =
  '<block type="controls_if" id="kSet1"><mutation ' + NS + ' else="1"></mutation>' +
  '<value name="IF0">' + isEmpty(getTextbox('SearchBox', 'kSet1a'), 'kSet1b') + '</value>' +
  '<statement name="DO0"><block type="lexical_variable_set" id="kSet2">' +
  '<field name="VAR">global searchKey</field>' +
  '<value name="VALUE">' + getSpinner('kSet2v') + '</value></block></statement>' +
  '<statement name="ELSE"><block type="lexical_variable_set" id="kSet3">' +
  '<field name="VAR">global searchKey</field>' +
  '<value name="VALUE">' + getTextbox('SearchBox', 'kSet3v') + '</value></block></statement>' +
  '<next>';

const oldEnd = closeOf(bky, bodyStart);
bky = bky.slice(0, bodyStart) + setterOpen +
      bky.slice(bodyStart, oldEnd) + '</next></block>' +
      bky.slice(oldEnd);

/* --- 3) شرط الحارس: تنبيه عند غياب مفتاح البحث ---------------------- */
// الشكل القديم:  IF Spinner3.Selection = "الاسم الرباعي"
const guardNew = '<value name="IF0">' +
  logicOp('AND', 'kGuard',
    isEmpty(getTextbox('SearchBox', 'kGuard1a'), 'kGuard1'),
    logicOp('OR', 'kGuard2',
      '<block type="math_compare" id="kGuard3"><field name="OP">EQ</field>' +
      '<value name="A">' + getSpinner('kGuard3a') + '</value>' +
      '<value name="B"><block type="text" id="kGuard3b"><field name="TEXT">الاسم الرباعي</field></block></value>' +
      '</block>',
      isEmpty(getSpinner('kGuard4a'), 'kGuard4'))) +
  '</value>';
bky = replaceIfValue(bky, '`MGs9Ncke?G3?tw?mYIJ', guardNew, 'guard condition');

/* --- 4) شرط المطابقة: بحث جزئي في الاسم/الهوية/السكن/المدرسة ------- */
const matchNew = '<value name="IF0">' +
  logicOp('OR', 'kMatch0',
    logicOp('OR', 'kMatch1', contains(1, 'kC1'), contains(2, 'kC2')),
    logicOp('OR', 'kMatch2', contains(3, 'kC3'), contains(4, 'kC4'))) +
  '</value>';
bky = replaceIfValue(bky, 'X1|@/qjJ+.v*y4JUdH//', matchNew, 'match condition');

/* --- 5) نصوص التنبيه ----------------------------------------------- */
bky = replaceOnce(bky,
  '<field name="TEXT">اختر الاسم من القائمه اعلاه</field>',
  '<field name="TEXT">اختر الاسم من القائمة او اكتب كلمة البحث</field>',
  'alert text 1');

bky = replaceOnce(bky,
  '<field name="TEXT">لا يوجد نتيجه للبحث</field>',
  '<field name="TEXT">لا توجد نتائج مطابقة للبحث</field>',
  'alert text 2');

/* --- 6) التحقق من تفرد معرّفات الكتل -------------------------------- */
const ids = Array.from(bky.matchAll(/\sid="([^"]+)"/g), m => m[1]);
const seenIds = new Set();
let dupId = null;
for (const id of ids) { if (seenIds.has(id)) { dupId = id; break; } seenIds.add(id); }
assert(!dupId, 'duplicate block id: ' + dupId);
console.log('block ids unique: ' + ids.length);

fs.writeFileSync(bkyPath, bky, 'utf8');
console.log('bky patched OK  (' + bky.length + ' bytes)');

/* =======================================================================
 *  Screen1.scm
 * ===================================================================== */

let scm = fs.readFileSync(scmPath, 'utf8');

// 5.1) زر البحث: ظاهر + نص عربي
scm = replaceOnce(scm,
  '"Text":"Search...","TextColor":"&HFFFFFFFF","Uuid":"-2083869436","Visible":"False"',
  '"Text":"بحث","TextColor":"&HFFFFFFFF","Uuid":"-2083869436","Visible":"True"',
  'Button2 visible/text');

// 5.2) صف بحث جديد (عرض 80%) بين رأس الشاشة وجدول البيانات
const searchBox = '{"$Name":"SearchBox","$Type":"TextBox","$Version":"15","FontBold":"True","FontSize":"14",' +
  '"Hint":"ابحث بالاسم او رقم الهوية او المدرسة","Width":"-1080","TextAlignment":"1","Uuid":"-739482615"},';
scm = replaceOnce(scm, '{"$Name":"TableArrangement3","$Type":"TableArrangement"',
  searchBox + '{"$Name":"TableArrangement3","$Type":"TableArrangement"', 'insert SearchBox');

fs.writeFileSync(scmPath, scm, 'utf8');
console.log('scm patched OK  (' + scm.length + ' bytes)');
