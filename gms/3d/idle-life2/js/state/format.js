const NAMED = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
const A = 97;

export function suffix(e) {
  if (e < NAMED.length) return NAMED[e];
  const i = e - NAMED.length;
  return String.fromCharCode(A + Math.floor(i / 26) % 26) + String.fromCharCode(A + i % 26);
}

export function fmtNum(n) {
  if (typeof n !== 'number' || n !== n) return '0';
  if (!isFinite(n)) return '∞';
  const neg = n < 0;
  n = Math.abs(n);
  let s;
  if (n < 1000) s = n < 10 && n % 1 ? (Math.floor(n * 10) / 10).toFixed(1).replace(/\.0$/, '') : String(Math.floor(n));
  else {
    let e = Math.floor(Math.log10(n) / 3);
    let v = n / Math.pow(1000, e);
    if (v >= 1000) { e++; v /= 1000; } else if (v < 1) { e--; v *= 1000; }
    const t = (x, d) => (Math.floor(x * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d);
    s = (v < 10 ? t(v, 2) : v < 100 ? t(v, 1) : String(Math.floor(v))) + suffix(e);
  }
  return (neg ? '-' : '') + s;
}

export const fmtCash = (n) => '$' + fmtNum(n);
export const fmtRate = (n) => '$' + fmtNum(n) + '/s';
export const fmtPct = (x) => Math.round(x * 100) + '%';
export const fmtMult = (x) => '×' + (x >= 10 ? fmtNum(x) : (Math.round(x * 100) / 100).toString());

export function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  if (sec < 60) return sec + 's';
  if (sec < 3600) return Math.floor(sec / 60) + 'm' + (sec % 60 ? ' ' + (sec % 60) + 's' : '');
  if (sec < 86400) return Math.floor(sec / 3600) + 'h' + (Math.floor((sec % 3600) / 60) ? ' ' + Math.floor((sec % 3600) / 60) + 'm' : '');
  return Math.floor(sec / 86400) + 'd ' + Math.floor((sec % 86400) / 3600) + 'h';
}
