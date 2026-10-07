// Who is playing: the remembered name, plus the optional br8t account (name prefill + ID token for the server).
import { getName, setName } from '../core/store.js?v=202610071438';

let authP = null;

// The account layer pulls Firebase from a CDN; it must never block or break joining.
function account() {
  const q = (() => { try { return new URL(performance.getEntriesByType('navigation')[0]?.name || location.href).search + location.search; } catch (e) { return location.search; } })();
  if (/[?&](noauth|soak|test)=1/.test(q)) return Promise.resolve(null);
  if (!authP) {
    authP = Promise.race([
      import('/lib/auth/auth.js').then(m => m.auth.ready().then(() => m.auth)).catch(() => null),
      new Promise(r => setTimeout(() => r(null), 4000)),
    ]);
  }
  return authP;
}

export async function idToken() {
  try {
    const a = await account();
    if (!a || !a.signedIn) return null;
    return await Promise.race([a.getIdToken(), new Promise(r => setTimeout(() => r(null), 2500))]);
  } catch (e) { return null; }
}

// Remembered name first, then the signed-in display name.
export async function suggestedName() {
  const n = getName();
  if (n) return n;
  try {
    const a = await account();
    if (a && a.signedIn && a.user?.name) return a.user.name.slice(0, 20);
  } catch (e) {}
  return '';
}

export const rememberName = n => { try { setName(String(n).trim().slice(0, 20)); } catch (e) {} };

export const MAX_NAME = 20;
// Control and invisible formatting characters (zero-width, bidi overrides), plus angle brackets.
const BAD_CHARS = new RegExp('[' + [[0, 31], [127, 159], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f]]
  .map(([a, b]) => String.fromCharCode(a) + '-' + String.fromCharCode(b)).join('') + '<>]', 'g');
export function tidyName(s) {
  return String(s || '').replace(BAD_CHARS, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
}
