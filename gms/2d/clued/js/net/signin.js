// Protection-level sign-in asks. Never a blocking modal: an inline panel with a button that opens
// the br8t account panel (or Google sign-in when the panel isn't mounted).
import { h } from '../ui/kit.js?v=202610081134';
import { toast } from '../ui/popup.js?v=202610081134';

let authMod = null;
const loadAuth = () => authMod || (authMod = import('/lib/auth/auth.js').catch(() => null));

export async function isSignedIn() {
  const m = await loadAuth();
  try { return !!(m && (await m.auth.ready()) && m.auth.signedIn); } catch (e) { return false; }
}

export async function openSignIn() {
  const fab = document.getElementById('br8t-account')?.shadowRoot?.querySelector('.fab');
  if (fab) { fab.click(); return 'panel'; }
  const m = await loadAuth();
  if (!m) { toast('Sign-in isn’t available right now'); return null; }
  try { await m.signInGoogle(); return 'google'; } catch (e) { toast(e?.message || 'Sign-in didn’t finish'); return null; }
}

const WHY = {
  host: 'To keep Clued friendly while it’s busy, hosting needs a free br8t account for now. Joining stays open to everyone.',
  join: 'This room needs a free br8t account to join right now. It only takes a moment.',
  challenge: 'Creating challenges needs a free br8t account for now.',
};

// Renders into box; resolves once the player is signed in (polls, since the panel is in a shadow root).
export function signInPrompt(box, kind = 'host') {
  return new Promise(resolve => {
    const btn = h('button.btn.grape.wide', { type: 'button', dataset: { act: 'signin' }, onclick: () => openSignIn() }, 'Sign in with br8t');
    box.replaceChildren(h('div.panel.stack.net-signin', {}, h('b', {}, '🔐 Sign-in needed'), h('p.muted', { style: { margin: 0 } }, WHY[kind] || WHY.host), btn));
    const id = setInterval(async () => {
      if (!box.isConnected) { clearInterval(id); resolve(false); return; }
      if (await isSignedIn()) { clearInterval(id); box.replaceChildren(); resolve(true); }
    }, 1200);
  });
}

export const pausedText = 'New games are paused for a little while. Please try again later.';
export const busyText = 'Clued is busy right now. Please try again soon.';
