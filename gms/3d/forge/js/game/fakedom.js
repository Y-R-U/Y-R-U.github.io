// Enough browser to construct a real Session in node: it builds the HUD, the menu and the market
// out of DOM nodes, and `start()` fetches the packs off disk. Everything it does with them is
// append and classList. Shared by every test that needs a really-constructed Session, because a
// Session that is really constructed is the only way to test what its constructor decides.

import { readFileSync } from 'node:fs';

export function fakeDom() {
  const node = () => {
    const n = {
      children: [], className: '', id: '', textContent: '', value: '', checked: false, parent: null,
      style: { setProperty() {}, removeProperty() {} }, dataset: {},
      classList: { s: new Set(), add(...c) { c.forEach(x => this.s.add(x)); },
        remove(...c) { c.forEach(x => this.s.delete(x)); },
        toggle(c, on) { on ? this.s.add(c) : this.s.delete(c); }, contains(c) { return this.s.has(c); } },
      append(...k) { for (const c of k) if (c && typeof c === 'object') { c.parent = n; n.children.push(c); } },
      appendChild(c) { n.append(c); return c; },
      prepend(...k) { n.append(...k); },
      remove() { if (n.parent) n.parent.children = n.parent.children.filter(c => c !== n); },
      addEventListener() {}, removeEventListener() {}, setAttribute() {}, removeAttribute() {},
      getAttribute: () => null, focus() {}, blur() {}, scrollIntoView() {},
      querySelector: () => null, querySelectorAll: () => [],
      getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0 }),
      get firstChild() { return n.children[0] || null; },
    };
    return n;
  };
  const mem = new Map();
  globalThis.document ??= {
    head: node(), body: node(), documentElement: node(), hidden: false,
    createElement: node, createElementNS: node, createTextNode: t => ({ textContent: t }),
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
  };
  globalThis.window ??= globalThis;
  globalThis.requestAnimationFrame ??= fn => { fn(0); return 0; };
  globalThis.addEventListener ??= () => {};
  globalThis.removeEventListener ??= () => {};
  globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  globalThis.innerWidth ??= 844;
  globalThis.innerHeight ??= 390;
  globalThis.navigator ??= { userAgent: 'node', vibrate() {} };
  globalThis.localStorage ??= {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), clear: () => mem.clear(),
  };
  // The packs are fetched by relative path off the page; here they are files.
  globalThis.fetch = async p => {
    try {
      const text = readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
      return { ok: true, status: 200, json: async () => JSON.parse(text) };
    } catch { return { ok: false, status: 404, json: async () => null }; }
  };
}
