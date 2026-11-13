// THRONG ↔ br8t account. The game keeps saving to localStorage ('throng.save'); localsync mirrors that one key
// to users/{uid}/games/throng and adopts a newer cloud save with a once-guarded reload. Never load-bearing:
// main.js imports this dynamically and the game plays on with a local save if it fails.
// Only the career save syncs: the device id (throng.dev) and an in-progress match never leave the device.
import { syncLocalKeys, auth } from '/lib/auth/localsync.js';

const LEAGUES = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Champion', 'Legend'];

function describe(keys) {
  const s = keys['throng.save'];
  if (!s || typeof s !== 'object') return ['Nothing saved yet'];
  const st = s.stats || {};
  return [
    `Level ${s.level || 1} · ${LEAGUES[s.league || 0] || 'Bronze'} · ${s.rating || 0} pts`,
    `${st.matches || 0} matches · ${st.wins || 0} wins`,
    `${(s.coins || 0).toLocaleString('en-US')} coins`,
  ];
}

const cleanName = (n) => String(n || '').split(/\s+/)[0].replace(/[^\p{L}\p{N} _.-]/gu, '').slice(0, 14);

export function initCloud({ canPester, onName }) {
  const sync = syncLocalKeys({ gameId: 'throng', keys: ['throng.save'], describe, nudge: 'callout', canPester });
  auth.onChange((u) => { try { onName(u && !u.anon && u.name ? cleanName(u.name) : ''); } catch {} });
  return sync;
}
