// DOM host for the game UI. The host and its stylesheet are created on demand, so nothing exists
// in the document under ?shot= or in the editor.

let host = null;

export function gameHost() {
  if (host) return host;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./game.css', import.meta.url).href;
  document.head.append(link);
  host = document.createElement('div');
  host.id = 'game';
  document.body.append(host);
  document.body.classList.add('playing');
  return host;
}

export function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export const clear = n => { while (n.firstChild) n.firstChild.remove(); return n; };
