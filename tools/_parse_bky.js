const fs = require('fs');
const file = process.argv[2];
const outFile = process.argv[3];
const xml = fs.readFileSync(file, 'utf8');
let nodeCount = 0;

// Minimal XML parser
function parseXml(s) {
  let i = 0;
  function node() {
    nodeCount++;
    while (s[i] === '<') {
      if (s.startsWith('<?', i)) { const e = s.indexOf('?>', i); i = e + 2; continue; }
      if (s.startsWith('<!--', i)) { const e = s.indexOf('-->', i); i = e + 3; continue; }
      if (s.startsWith('<!', i)) { const e = s.indexOf('>', i); i = e + 1; continue; }
      if (s[i + 1] === '/') { i += 2; const e = s.indexOf('>', i); const name = s.slice(i, e); i = e + 1; return { close: name }; }
      break;
    }
    if (s[i] !== '<') {
      const e = s.indexOf('<', i);
      const text = s.slice(i, e === -1 ? s.length : e);
      i = e === -1 ? s.length : e;
      return { text };
    }
    // opening tag
    let j = i + 1;
    while (j < s.length && !/[\s>]/.test(s[j])) j++;
    const name = s.slice(i + 1, j);
    const attrs = {};
    while (j < s.length && s[j] !== '>' && !(s[j] === '/' && s[j + 1] === '>')) {
      while (j < s.length && /[\s]/.test(s[j])) j++;
      let k = j;
      while (k < s.length && !/[\s=]/.test(s[k])) k++;
      const an = s.slice(j, k);
      j = k;
      while (j < s.length && /[\s]/.test(s[j])) j++;
      if (s[j] === '=') {
        j++;
        const q = s[j];
        j++;
        let k2 = j;
        while (k2 < s.length && s[k2] !== q) k2++;
        attrs[an] = s.slice(j, k2).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#10;/g, '\n').replace(/&amp;/g, '&');
        j = k2 + 1;
      }
    }
    const selfClose = s[j] === '/';
    j++;
    i = j;
    const children = [];
    if (selfClose) return { name, attrs, children };
    while (true) {
      const c = node();
      if (!c) break;
      if (c.close) break;
      if (c.text !== undefined) { if (c.text.trim()) children.push(c); continue; }
      children.push(c);
    }
    return { name, attrs, children };
  }
  return node();
}

const root = parseXml(xml);

function attr(n, k) { return n.attrs[k]; }
function kids(n, name) { return n.children.filter(c => c.name === name); }
function firstKids(n) { return n.children.filter(c => c.name); }
function fieldVal(n, fname) {
  const f = kids(n, 'field').find(x => x.attrs.name === fname);
  return f ? f.children.map(c => c.text || '').join('') : null;
}
function valueBlock(n, vname) {
  const v = kids(n, 'value').find(x => x.attrs.name === vname);
  if (!v) return null;
  const b = kids(v, 'block')[0];
  return b || null;
}
function statementBlock(n, sname) {
  const st = kids(n, 'statement').find(x => x.attrs.name === sname);
  if (!st) return null;
  return kids(st, 'block')[0] || null;
}
function expr(b, depth = 0) {
  if (!b || depth > 30) return '...';
  const t = b.attrs.type;
  const mut = kids(b, 'mutation')[0];
  switch (t) {
    case 'math_number': return fieldVal(b, 'NUM');
    case 'text': return JSON.stringify(fieldVal(b, 'TEXT') || '');
    case 'lexical_variable_get': return fieldVal(b, 'VAR');
    case 'lexical_variable_set': return `${fieldVal(b, 'VAR')} = ${expr(valueBlock(b, 'VALUE'), depth + 1)}`;
    case 'component_set_get': {
      const inst = fieldVal(b, 'COMPONENT_SELECTOR');
      const prop = fieldVal(b, 'PROP');
      const getter = mut && mut.attrs.set_or_get === 'get';
      if (getter) return `${inst}.${prop}`;
      return `${inst}.${prop} = ${expr(valueBlock(b, 'VALUE'), depth + 1)}`;
    }
    case 'logic_operation': {
      const op = fieldVal(b, 'OP');
      return `(${expr(valueBlock(b, 'A'), depth + 1)} ${op} ${expr(valueBlock(b, 'B'), depth + 1)})`;
    }
    case 'logic_boolean': return fieldVal(b, 'BOOL');
    case 'logic_negate': return `not ${expr(valueBlock(b, 'BOOL'), depth + 1)}`;
    case 'math_compare': {
      const op = fieldVal(b, 'OP');
      return `${expr(valueBlock(b, 'A'), depth + 1)} ${op} ${expr(valueBlock(b, 'B'), depth + 1)}`;
    }
    case 'math_add': case 'math_subtract': case 'math_multiply': case 'math_divide': {
      const op = { math_add: '+', math_subtract: '-', math_multiply: '*', math_divide: '/' }[t];
      return `(${expr(valueBlock(b, 'A'), depth + 1)} ${op} ${expr(valueBlock(b, 'B'), depth + 1)})`;
    }
    case 'text_join': {
      const items = kids(b, 'value');
      return items.map(v => expr(kids(v, 'block')[0], depth + 1)).join(' + ');
    }
    case 'text_length': return `len(${expr(valueBlock(b, 'VALUE'), depth + 1)})`;
    case 'text_isEmpty': return `isEmpty(${expr(valueBlock(b, 'VALUE'), depth + 1)})`;
    case 'text_contains': return `contains(${expr(valueBlock(b, 'TEXT'), depth + 1)}, ${expr(valueBlock(b, 'TOSUBSTRING'), depth + 1)})`;
    case 'text_changeCase': {
      const c = fieldVal(b, 'CASE');
      return `changeCase(${c}, ${expr(valueBlock(b, 'TEXT'), depth + 1)})`;
    }
    case 'text_trim': return `trim(${expr(valueBlock(b, 'TEXT'), depth + 1)})`;
    case 'text_segment': return `segment(${expr(valueBlock(b, 'TEXT'), depth + 1)}, ${expr(valueBlock(b, 'START'), depth + 1)}, ${expr(valueBlock(b, 'LENGTH'), depth + 1)})`;
    case 'text_replace_all': return `replace(${expr(valueBlock(b, 'TEXT'), depth + 1)}, ${expr(valueBlock(b, 'TOSUBSTRING'), depth + 1)}, ${expr(valueBlock(b, 'WITHSTRING'), depth + 1)})`;
    case 'lists_create_with': {
      const items = kids(b, 'value');
      return `[${items.map(v => expr(kids(v, 'block')[0], depth + 1)).join(', ')}]`;
    }
    case 'lists_add_items': {
      const list = expr(valueBlock(b, 'LIST'), depth + 1);
      const items = kids(b, 'value').filter(v => v.attrs.name !== 'LIST').map(v => expr(kids(v, 'block')[0], depth + 1));
      return `add [${items.join(', ')}] to ${list}`;
    }
    case 'lists_select_item': return `${expr(valueBlock(b, 'LIST'), depth + 1)}[${expr(valueBlock(b, 'NUM'), depth + 1)}]`;
    case 'lists_length': return `length(${expr(valueBlock(b, 'LIST'), depth + 1)})`;
    case 'lists_is_in': return `${expr(valueBlock(b, 'ITEM'), depth + 1)} in ${expr(valueBlock(b, 'LIST'), depth + 1)}`;
    case 'lists_pick_random_item': return `random from ${expr(valueBlock(b, 'LIST'), depth + 1)}`;
    case 'lists_replace_item': return `replace item ${expr(valueBlock(b, 'NUM'), depth + 1)} of ${expr(valueBlock(b, 'LIST'), depth + 1)} with ${expr(valueBlock(b, 'ITEM'), depth + 1)}`;
    case 'lists_remove_item': return `remove item ${expr(valueBlock(b, 'NUM'), depth + 1)} from ${expr(valueBlock(b, 'LIST'), depth + 1)}`;
    case 'lists_index_of': return `index of ${expr(valueBlock(b, 'ITEM'), depth + 1)} in ${expr(valueBlock(b, 'LIST'), depth + 1)}`;
    case 'lists_split': return `split(${expr(valueBlock(b, 'TEXT'), depth + 1)}, ${expr(valueBlock(b, 'AT'), depth + 1)})`;
    case 'procedures_call_return': {
      const pname = mut ? mut.attrs.name : '?';
      const args = kids(b, 'value').map(v => expr(kids(v, 'block')[0], depth + 1));
      return `${pname}(${args.join(', ')})`;
    }
    case 'component_method_call': {
      const inst = fieldVal(b, 'COMPONENT_SELECTOR');
      const m = fieldVal(b, 'METHOD_NAME');
      const args = kids(b, 'value').map(v => expr(kids(v, 'block')[0], depth + 1));
      return `${inst}.${m}(${args.join(', ')})`;
    }
    case 'component_method_call_no_return': {
      const inst = fieldVal(b, 'COMPONENT_SELECTOR');
      const m = fieldVal(b, 'METHOD_NAME');
      const args = kids(b, 'value').map(v => expr(kids(v, 'block')[0], depth + 1));
      return `${inst}.${m}(${args.join(', ')})`;
    }
    case 'component_method': case 'component_method_call': case 'component_method_call_no_return': {
      const inst = fieldVal(b, 'COMPONENT_SELECTOR');
      const m2 = kids(b, 'mutation')[0];
      const mname = (m2 && m2.attrs.method_name) || fieldVal(b, 'METHOD_NAME');
      const args = kids(b, 'value').map(v => expr(kids(v, 'block')[0], depth + 1));
      return `${inst}.${mname}(${args.join(', ')})`;
    }
    case 'lists_from_csv_table': return `fromCSVtable(${expr(valueBlock(b, 'CSV'), depth + 1)})`;
    case 'lists_from_csv_row': return `fromCSVrow(${expr(valueBlock(b, 'CSV'), depth + 1)})`;
    case 'lists_to_csv_table': return `toCSVtable(${expr(valueBlock(b, 'LIST'), depth + 1)})`;
    case 'math_on_list': {
      const op = fieldVal(b, 'OP');
      return `${op}(${expr(valueBlock(b, 'LIST'), depth + 1)})`;
    }
    case 'lists_sort': return `sort(${expr(valueBlock(b, 'LIST'), depth + 1)})`;
    case 'lists_reverse': return `reverse(${expr(valueBlock(b, 'LIST'), depth + 1)})`;
    case 'lists_flatten': return `flatten(${expr(valueBlock(b, 'LIST'), depth + 1)})`;
    case 'lists_slice': return `slice(${expr(valueBlock(b, 'LIST'), depth + 1)})`;
    case 'global_declaration': {
      const n2 = fieldVal(b, 'NAME');
      return `global ${n2} = ${expr(valueBlock(b, 'VALUE'), depth + 1)}`;
    }
    default: {
      // generic: show type and child values
      const vals = kids(b, 'value').map(v => `${v.attrs.name}=${expr(kids(v, 'block')[0], depth + 1)}`);
      const flds = kids(b, 'field').map(f => `${f.attrs.name}=${f.children.map(c => c.text || '').join('')}`);
      return `${t}(${[...flds, ...vals].join(', ')})`;
    }
  }
}
function blockStmt(b, indent) {
  if (!b) return [];
  const out = [];
  const pad = '  '.repeat(indent);
  const t = b.attrs.type;
  const mut = kids(b, 'mutation')[0];
  switch (t) {
    case 'controls_if': {
      let n = 0;
      while (true) {
        const cond = valueBlock(b, 'IF' + n);
        const doBlk = statementBlock(b, 'DO' + n);
        if (!cond && !doBlk) break;
        out.push(`${pad}${n === 0 ? 'IF' : 'ELSE IF'} ${expr(cond)}:`);
        out.push(...blockStmt(doBlk, indent + 1));
        n++;
        if (!kids(b, 'statement').some(s => s.attrs.name === 'DO' + n)) break;
      }
      const elseBlk = statementBlock(b, 'ELSE');
      if (elseBlk) { out.push(`${pad}ELSE:`); out.push(...blockStmt(elseBlk, indent + 1)); }
      break;
    }
    case 'controls_forEach': {
      const v = fieldVal(b, 'VAR');
      out.push(`${pad}FOR EACH ${v} IN ${expr(valueBlock(b, 'LIST'))}:`);
      out.push(...blockStmt(statementBlock(b, 'DO'), indent + 1));
      break;
    }
    case 'controls_forRange': {
      out.push(`${pad}FOR ${fieldVal(b, 'VAR')} FROM ${expr(valueBlock(b, 'FROM'))} TO ${expr(valueBlock(b, 'TO'))} STEP ${expr(valueBlock(b, 'BY'))}:`);
      out.push(...blockStmt(statementBlock(b, 'DO'), indent + 1));
      break;
    }
    case 'controls_while': {
      out.push(`${pad}WHILE ${expr(valueBlock(b, 'TEST'))}:`);
      out.push(...blockStmt(statementBlock(b, 'DO'), indent + 1));
      break;
    }
    case 'procedures_defnoreturn': {
      const pname = fieldVal(b, 'NAME');
      out.push(`${pad}PROCEDURE ${pname}:`);
      out.push(...blockStmt(statementBlock(b, 'STACK'), indent + 1));
      break;
    }
    case 'procedures_defreturn': {
      const pname = fieldVal(b, 'NAME');
      out.push(`${pad}PROCEDURE ${pname} (returns):`);
      out.push(...blockStmt(statementBlock(b, 'STACK'), indent + 1));
      break;
    }
    case 'procedures_callnoreturn': {
      const pname = mut ? mut.attrs.name : '?';
      const args = kids(b, 'value').map(v => expr(kids(v, 'block')[0]));
      out.push(`${pad}${pname}(${args.join(', ')})`);
      break;
    }
    case 'procedures_callreturn': {
      const pname = mut ? mut.attrs.name : '?';
      const args = kids(b, 'value').map(v => expr(kids(v, 'block')[0]));
      out.push(`${pad}${pname}(${args.join(', ')})`);
      break;
    }
    case 'component_event': {
      const inst = fieldVal(b, 'COMPONENT_SELECTOR');
      const ev = mut ? mut.attrs.event_name : '';
      out.push(`${pad}EVENT ${inst}.${ev}:`);
      out.push(...blockStmt(statementBlock(b, 'DO'), indent + 1));
      break;
    }
    case 'controls_closeApplication': out.push(`${pad}closeApplication()`); break;
    default: {
      // try as expression statement
      out.push(`${pad}${expr(b)}`);
      // nested statements
      kids(b, 'statement').forEach(s => out.push(...blockStmt(kids(s, 'block')[0], indent + 1)));
      break;
    }
  }
  // follow chained sibling statements
  const nxt = kids(b, 'next')[0];
  if (nxt) {
    const nb = kids(nxt, 'block')[0];
    if (nb) out.push(...blockStmt(nb, indent));
  }
  return out;
}

const topBlocks = root.children.filter(c => c.name === 'block');
const lines = [];
for (const b of topBlocks) {
  lines.push(...blockStmt(b, 0));
  lines.push('');
}
const result = `<!-- nodes=${nodeCount} topBlocks=${topBlocks.length} -->\n` + lines.join('\n');
if (outFile) fs.writeFileSync(outFile, result, 'utf8');
else process.stdout.write(result + '\n');
