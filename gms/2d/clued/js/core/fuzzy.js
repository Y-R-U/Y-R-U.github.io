const ARTICLES = /^(the|a|an|le|la|les|el|los|las|der|die|das)\s+/;

export function normalize(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[''`´]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(ARTICLES, '')
    .replace(/\bsaint\b/g, 'st').replace(/\bmount\b/g, 'mt')
    .replace(/\s+/g, ' ');
}

// Damerau (optimal string alignment) distance
export function distance(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => { const r = new Array(n + 1).fill(0); r[0] = i; return r; });
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

export function tolerance(len) {
  if (len <= 4) return 0;
  if (len <= 9) return 1;
  if (len <= 15) return 2;
  return 3;
}

// answers: string | string[]. Numbers in the answer must match exactly ("1984" never accepts "1985").
export function fuzzyMatch(input, answers) {
  const g = normalize(input);
  const list = (Array.isArray(answers) ? answers : [answers]).filter(a => a != null && a !== '');
  let best = null;
  if (!g) return { ok: false, best: null, dist: Infinity };
  for (const raw of list) {
    const a = normalize(raw);
    if (!a) continue;
    if (a === g || a.replace(/ /g, '') === g.replace(/ /g, '')) return { ok: true, best: raw, dist: 0 };
    const digitsA = a.match(/\d+/g)?.join(' ') || '';
    const digitsG = g.match(/\d+/g)?.join(' ') || '';
    if (digitsA !== digitsG) continue;
    const dist = distance(a, g);
    if (!best || dist < best.dist) best = { raw, dist, tol: tolerance(a.length) };
  }
  if (best && best.dist <= best.tol) return { ok: true, best: best.raw, dist: best.dist };
  return { ok: false, best: best ? best.raw : null, dist: best ? best.dist : Infinity };
}

export const answersFor = item => [item.name, ...(item.alt || [])];
