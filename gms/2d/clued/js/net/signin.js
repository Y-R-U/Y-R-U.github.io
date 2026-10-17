// Protection-level sign-in asks. Never a blocking modal: an inline panel with a button that opens
// the br8t account panel (or Google sign-in when the panel isn't mounted).
import { h } from '../ui/kit.js?v=202610170843';
import { toast } from '../ui/popup.js?v=202610170843';
import { go } from '../ui/app.js?v=202610170843';
import { allowanceText, resetTime, canTopUp, doneForToday } from './pass.js?v=202610170843';

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
  start: 'Online games run on the host’s free br8t account: free games every day, unlimited with a br8t Pass. Joining stays free for everyone.',
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

// The host's daily online games: one quiet line, or (none left) an inline panel. Never a modal.
export function allowanceNote(a) {
  return h('p.net-note', { dataset: { allowance: a.unlimited ? 'pass' : String(a.remaining) } }, `${a.unlimited ? '⭐' : '🎟️'} ${allowanceText(a)}`);
}

// onMore: opens the free top-up sheet (topup.js), shown while this account still has a top-up today.
export function noGamesPanel(a, onMore) {
  const at = resetTime(a);
  const more = onMore && canTopUp(a);
  const late = doneForToday(a);
  return h('div.panel.stack.net-signin', { dataset: { panel: 'no-games' } },
    h('b', {}, late ? `🌙 That’s ${a.usedToday || a.perDay} games today` : '🎟️ No online games left today'),
    h('p.muted', { style: { margin: 0 } }, late ? `More at ${at || 'midnight UTC'} your time. Players who join always play free, so a friend can host.`
      : `You’ve used today’s ${a?.perDay || ''} online games${at ? `. More at ${at} your time` : ''}.`.replace('  ', ' ')),
    ...(more ? [h('button.btn.go.wide', { type: 'button', dataset: { act: 'topup-open' }, onclick: () => onMore() }, `🎟️ Get ${a.topUpSize} more free games`)] : []),
    h('p.muted', { style: { margin: 0 } }, more || late ? 'A br8t Pass (monthly or yearly) makes hosting unlimited, in Clued and every br8t game.'
      : 'A br8t Pass (monthly or yearly) makes online play unlimited, in Clued and every br8t game. Players who join your games always play free, so a friend with a Pass can host.'),
    h('button.btn.wide', { type: 'button', dataset: { act: 'pass-code' }, onclick: () => go('settings', { focus: 'pass' }) }, 'Got a Pass code?'));
}
