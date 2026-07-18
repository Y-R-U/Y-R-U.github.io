export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const sgn = (v) => v < 0 ? -1 : 1;

let _shuffleBags = new Map();
// Pick from array without repeating until the bag empties — keeps comedy lines fresh.
export function pickBag(key, arr) {
  let bag = _shuffleBags.get(key);
  if (!bag || !bag.length) {
    bag = arr.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    _shuffleBags.set(key, bag);
  }
  return bag.pop();
}

export function fmtMoney(n) {
  return "$" + Math.round(n).toLocaleString("en-US");
}

export function fmtSpeed(kph, units) {
  return units === "mph" ? Math.round(kph * 0.621371) + " mph" : Math.round(kph) + " km/h";
}

export function fmtRank(r) {
  if (r === null || r === undefined) return "UNRANKED";
  return "#" + Math.round(r).toLocaleString("en-US");
}

export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
