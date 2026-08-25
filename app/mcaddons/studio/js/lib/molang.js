// A small Molang evaluator — enough for the expressions a child will meet in animations,
// render controllers and animation controllers.
//
// Supports: numbers, + - * / %, comparisons, && || !, ternary ?:, ??, brackets,
//   query.* / q.*, variable.* / v.*, temp.* / t.*, math.*, and 'this'.
// math.sin / math.cos take DEGREES, like the real thing.

const CACHE = new Map();

const MATH = {
  sin: a => Math.sin(a * Math.PI / 180),
  cos: a => Math.cos(a * Math.PI / 180),
  abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  sqrt: Math.sqrt, exp: Math.exp, ln: Math.log,
  pow: (a, b) => Math.pow(a, b),
  min: (a, b) => Math.min(a, b), max: (a, b) => Math.max(a, b),
  clamp: (v, a, b) => Math.min(Math.max(v, a), b),
  lerp: (a, b, t) => a + (b - a) * Math.min(Math.max(t, 0), 1),
  lerprotate: (a, b, t) => { let d = ((b - a) % 360 + 540) % 360 - 180; return a + d * Math.min(Math.max(t, 0), 1); },
  mod: (a, b) => a % b,
  trunc: Math.trunc,
  random: (a = 0, b = 1) => a + Math.random() * (b - a),
  random_integer: (a = 0, b = 1) => Math.floor(a + Math.random() * (b - a + 1)),
  die_roll: (n, a, b) => { let s = 0; for (let i = 0; i < n; i++) s += a + Math.random() * (b - a); return s; },
  die_roll_integer: (n, a, b) => { let s = 0; for (let i = 0; i < n; i++) s += Math.floor(a + Math.random() * (b - a + 1)); return s; },
  hermite_blend: t => 3 * t * t - 2 * t * t * t,
  atan: a => Math.atan(a) * 180 / Math.PI,
  atan2: (a, b) => Math.atan2(a, b) * 180 / Math.PI,
  asin: a => Math.asin(Math.min(1, Math.max(-1, a))) * 180 / Math.PI,
  acos: a => Math.acos(Math.min(1, Math.max(-1, a))) * 180 / Math.PI,
  sign: Math.sign
};

// ------------------------------------------------------------------ lexer ---
function lex(src) {
  const out = [];
  let i = 0;
  const isNum = c => c >= '0' && c <= '9';
  const isId = c => /[A-Za-z_.]/.test(c);
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\n' || c === '\t' || c === '\r') { i++; continue; }
    if (isNum(c) || (c === '.' && isNum(src[i + 1]))) {
      let j = i; while (j < src.length && (isNum(src[j]) || src[j] === '.')) j++;
      out.push({ t: 'num', v: parseFloat(src.slice(i, j)) }); i = j; continue;
    }
    if (isId(c)) {
      let j = i; while (j < src.length && /[A-Za-z0-9_.]/.test(src[j])) j++;
      out.push({ t: 'id', v: src.slice(i, j).toLowerCase() }); i = j; continue;
    }
    if (c === "'") { let j = src.indexOf("'", i + 1); if (j < 0) j = src.length; out.push({ t: 'str', v: src.slice(i + 1, j) }); i = j + 1; continue; }
    const three = src.substr(i, 2);
    if (['&&', '||', '==', '!=', '<=', '>=', '??'].includes(three)) { out.push({ t: 'op', v: three }); i += 2; continue; }
    out.push({ t: 'op', v: c }); i++;
  }
  out.push({ t: 'end' });
  return out;
}

// ----------------------------------------------------------------- parser ---
// expr := ternary ; ternary := or ('?' expr ':' expr)? ; or := and ('||' and)*
// and := eq ('&&' eq)* ; eq := cmp (('=='|'!=') cmp)* ; cmp := add (('<'|'>'|'<='|'>=') add)*
// add := mul (('+'|'-') mul)* ; mul := unary (('*'|'/'|'%') unary)* ; unary := ('-'|'!') unary | atom
function parse(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const eat = (v) => { if (tokens[p].v === v) { p++; return true; } return false; };

  function expr() { return coalesce(); }
  function coalesce() {
    let a = ternary();
    while (peek().v === '??') { p++; const b = ternary(); const aa = a; a = c => { const v = aa(c); return (v === undefined || v === null || Number.isNaN(v)) ? b(c) : v; }; }
    return a;
  }
  function ternary() {
    const cond = or();
    if (peek().v === '?') {
      p++; const a = expr();
      let b = () => 0;
      if (eat(':')) b = expr();
      return c => (cond(c) ? a(c) : b(c));
    }
    return cond;
  }
  function or() { let a = and(); while (peek().v === '||') { p++; const b = and(), aa = a; a = c => (aa(c) || b(c)) ? 1 : 0; } return a; }
  function and() { let a = eq(); while (peek().v === '&&') { p++; const b = eq(), aa = a; a = c => (aa(c) && b(c)) ? 1 : 0; } return a; }
  function eq() {
    let a = cmp();
    while (peek().v === '==' || peek().v === '!=') {
      const op = peek().v; p++; const b = cmp(), aa = a;
      a = op === '==' ? (c => (aa(c) === b(c) ? 1 : 0)) : (c => (aa(c) !== b(c) ? 1 : 0));
    }
    return a;
  }
  function cmp() {
    let a = add();
    while (['<', '>', '<=', '>='].includes(peek().v)) {
      const op = peek().v; p++; const b = add(), aa = a;
      a = c => { const x = aa(c), y = b(c); return (op === '<' ? x < y : op === '>' ? x > y : op === '<=' ? x <= y : x >= y) ? 1 : 0; };
    }
    return a;
  }
  function add() {
    let a = mul();
    while (peek().v === '+' || peek().v === '-') {
      const op = peek().v; p++; const b = mul(), aa = a;
      a = op === '+' ? (c => aa(c) + b(c)) : (c => aa(c) - b(c));
    }
    return a;
  }
  function mul() {
    let a = unary();
    while (['*', '/', '%'].includes(peek().v)) {
      const op = peek().v; p++; const b = unary(), aa = a;
      a = op === '*' ? (c => aa(c) * b(c)) : op === '/' ? (c => { const d = b(c); return d ? aa(c) / d : 0; }) : (c => aa(c) % b(c));
    }
    return a;
  }
  function unary() {
    if (peek().v === '-') { p++; const a = unary(); return c => -a(c); }
    if (peek().v === '!') { p++; const a = unary(); return c => (a(c) ? 0 : 1); }
    if (peek().v === '+') { p++; return unary(); }
    return atom();
  }
  function atom() {
    const tk = peek();
    if (tk.t === 'num') { p++; return () => tk.v; }
    if (tk.t === 'str') { p++; return () => tk.v; }
    if (tk.v === '(') { p++; const e = expr(); eat(')'); return e; }
    if (tk.t === 'id') {
      p++;
      let name = tk.v;
      // function call?
      if (peek().v === '(') {
        p++;
        const args = [];
        if (peek().v !== ')') { args.push(expr()); while (eat(',')) args.push(expr()); }
        eat(')');
        return c => {
          const fname = name.replace(/^math\./, '');
          const fn = MATH[fname];
          const vals = args.map(a => a(c));
          if (fn) return fn(...vals);
          const q = lookup(name, c);
          return typeof q === 'function' ? q(...vals) : (q ?? 0);
        };
      }
      if (name === 'true') return () => 1;
      if (name === 'false') return () => 0;
      return c => { const v = lookup(name, c); return v === undefined ? 0 : v; };
    }
    p++;
    return () => 0;
  }
  const fn = expr();
  return fn;
}

function lookup(name, ctx) {
  ctx = ctx || {};
  const full = name
    .replace(/^q\./, 'query.')
    .replace(/^v\./, 'variable.')
    .replace(/^t\./, 'temp.');
  if (full in ctx) return ctx[full];
  if (name in ctx) return ctx[name];
  const [ns, ...rest] = full.split('.');
  const key = rest.join('.');
  if (ctx[ns] && typeof ctx[ns] === 'object' && key in ctx[ns]) return ctx[ns][key];
  return 0;
}

/** Compile once, run many. Returns a function(ctx) -> number. */
export function compileMolang(src) {
  const key = String(src);
  if (CACHE.has(key)) return CACHE.get(key);
  let fn;
  try {
    // Molang allows several statements separated by ';' — the last one is the result.
    const parts = key.split(';').map(s => s.trim()).filter(Boolean);
    const fns = parts.map(part => {
      if (/^return\s+/i.test(part)) part = part.replace(/^return\s+/i, '');
      return parse(lex(part));
    });
    fn = (ctx) => { let out = 0; for (const f of fns) out = f(ctx); return out; };
  } catch (e) {
    fn = () => 0;
  }
  CACHE.set(key, fn);
  return fn;
}

/** Evaluate a Molang value that may already be a number. */
export function molang(value, ctx) {
  if (typeof value === 'number') return value;
  if (value === true) return 1;
  if (value === false || value == null) return 0;
  const n = parseFloat(value);
  if (!Number.isNaN(n) && String(n) === String(value).trim()) return n;
  return compileMolang(value)(ctx) || 0;
}

/** Quick syntax check for the editor: returns null or a message. */
export function checkMolang(src) {
  try { compileMolang(src)({ 'query.anim_time': 0 }); return null; }
  catch (e) { return e.message; }
}
