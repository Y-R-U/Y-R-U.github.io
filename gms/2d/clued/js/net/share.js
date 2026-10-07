// Share links: navigator.share, clipboard fallback, and a QR code people in the room can scan.
import { h } from '../ui/kit.js?v=202610071327';
import { popup, toast } from '../ui/popup.js?v=202610071327';
import { qrSvg } from '../vendor/qr.js?v=202610071327';
import { API_OVERRIDE } from './api.js?v=202610071327';

function link(param, value) {
  const u = new URL(location.pathname, location.origin);
  u.searchParams.set(param, value);
  if (API_OVERRIDE) u.searchParams.set('api', API_OVERRIDE);
  return u.href;
}
export const joinUrl = code => link('join', code);
export const p2pUrl = code => link('p2p', code);   // device-hosted rooms (lane P2P)
export const challengeUrl = id => link('c', id);

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0', top: '0' } });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) {}
    ta.remove();
    return ok;
  }
}

export async function shareOrCopy({ url, title = 'Clued', text = '' }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  const ok = await copyText(url);
  toast(ok ? 'Link copied' : 'Couldn’t copy: long-press the link to copy it');
  return ok ? 'copied' : 'failed';
}

export function qrEl(url, cls = '') {
  const box = h('div.net-qr', { class: cls });
  box.innerHTML = qrSvg(url); // our own SVG markup; the URL is not interpolated as text
  return box;
}

// Inline panel: code + QR + share/copy buttons. Used in the lobby.
export function sharePanel({ url, code, title, text, big = false }) {
  const linkEl = h('div.net-link', {}, url.replace(/^https?:\/\//, ''));
  return h('div.net-share', { class: big ? 'big' : '' },
    qrEl(url),
    h('div.net-share-side', {},
      code ? h('div.net-code-label', {}, 'Room code') : null,
      code ? h('div.net-code', { 'aria-label': `Room code ${code.split('').join(' ')}` }, code) : null,
      linkEl,
      h('div.net-share-btns', {},
        h('button.btn.go.small', { type: 'button', onclick: () => shareOrCopy({ url, title, text }) }, navigator.share ? 'Share link' : 'Copy link'),
        navigator.share ? h('button.btn.small', { type: 'button', onclick: async () => toast((await copyText(url)) ? 'Link copied' : 'Couldn’t copy') }, 'Copy') : null)));
}

export function openShare({ url, code, title = 'Clued', text = '', heading = 'Invite friends' }) {
  return popup({
    title: heading, cls: 'net-pop',
    body: h('div.stack', {}, sharePanel({ url, code, title, text }), h('p.tiny.muted.center', {}, 'Anyone with the link can join. No sign-in needed.')),
    actions: [{ label: 'Done', value: true, primary: true }],
  });
}
