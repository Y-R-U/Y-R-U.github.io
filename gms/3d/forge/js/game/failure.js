// The one place a failure the player can see is drawn. Non-modal: a dismissible line across the
// top, never a dialog box, and never a page that just sits there saying "warming…".
//
// Inline styles rather than a class: this has to work before `game.css` is injected, in the editor,
// and in the boot screen, none of which share a stylesheet.

const BAR = [
  'position:fixed;left:0;right:0;top:0;z-index:999',
  'display:flex;gap:12px;align-items:center',
  'padding:10px 14px;font:13px/1.35 system-ui,-apple-system,sans-serif',
  'background:#2a1416;color:#f0dcd6;border-bottom:1px solid #7a3b34',
].join(';');

let bar = null;
let line = null;
let installed = false;

export const RELOAD = 'Reload the page to try again.';

export function fail(text) {
  console.error(`forge: ${text}`);
  const status = document.getElementById('boot-status');
  if (status && !document.getElementById('boot')?.classList.contains('gone')) status.textContent = text;
  if (!bar) {
    bar = document.createElement('div');
    bar.style.cssText = BAR;
    line = document.createElement('span');
    line.style.flex = '1';
    const x = document.createElement('button');
    x.textContent = '✕';
    x.setAttribute('aria-label', 'Dismiss');
    x.style.cssText = 'background:none;border:0;color:inherit;font:inherit;cursor:pointer;padding:0 4px';
    x.onclick = () => { bar.remove(); bar = null; };
    bar.append(line, x);
    document.body?.append(bar);
  }
  line.textContent = text;
  return text;
}

const textOf = e => {
  const m = e?.message || e?.reason?.message || e?.reason || e?.error?.message || e;
  return typeof m === 'string' && m ? m : 'something went wrong';
};

export function install() {
  if (installed) return;
  installed = true;
  addEventListener('error', e => fail(`Something broke: ${textOf(e)}. ${RELOAD}`));
  addEventListener('unhandledrejection', e => fail(`Something broke: ${textOf(e)}. ${RELOAD}`));
}

// `three` comes off a CDN, so "the page is up but nothing happened" is a real state and it looked
// identical to a slow phone. If the world has not reported ready by now, say so.
export function watchBoot(ready, seconds = 12) {
  return setTimeout(() => {
    if (!ready()) fail(`The world is taking too long to load. Check your connection, then reload.`);
  }, seconds * 1000);
}
