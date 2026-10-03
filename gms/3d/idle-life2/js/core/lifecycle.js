// The one owner of page-lifecycle signals. 'resume' fires once per away interval, however many of
// visibilitychange / pageshow / resume / focus arrive. No unload/beforeunload listeners (they kill bfcache).
const KINDS = ['suspend', 'resume', 'pagehide', 'bfcache-restore', 'freeze'];
const subs = Object.fromEntries(KINDS.map((k) => [k, new Set()]));
let awayAt = null, awayReason = '';
const stats = { suspends: 0, resumes: 0, freezes: 0, bfcache: 0, lastAwaySec: 0, lastReason: '' };

function emit(kind, payload) {
  for (const fn of subs[kind]) {
    try { fn(payload); } catch (e) { console.error(e); }
  }
}

const visible = () => document.visibilityState !== 'hidden';

function goAway(reason) {
  if (awayAt !== null) return false;
  awayAt = Date.now();
  awayReason = reason;
  lifecycle.hidden = true;
  stats.suspends++;
  emit('suspend', { reason });
  return true;
}

function comeBack(reason, extra) {
  if (awayAt === null) return null;
  const awaySec = Math.max(0, (Date.now() - awayAt) / 1000);
  awayAt = null;
  lifecycle.hidden = false;
  stats.resumes++;
  stats.lastAwaySec = awaySec;
  stats.lastReason = reason;
  const payload = { awaySec, reason, from: awayReason, ...extra };
  if (extra && extra.persisted) { stats.bfcache++; emit('bfcache-restore', payload); }
  emit('resume', payload);
  return payload;
}

export const lifecycle = {
  hidden: !visible(),
  stats,
  get awaySince() { return awayAt; },
  on(kind, fn) {
    subs[kind]?.add(fn);
    return () => subs[kind]?.delete(fn);
  },
  // Test hook: kind 'hidden' | 'freeze' | 'bfcache'; returns the resume payload.
  simulate(kind, ms = 0) {
    if (kind === 'freeze') { stats.freezes++; emit('freeze', {}); goAway('freeze'); }
    else if (kind === 'bfcache') { emit('pagehide', { persisted: true }); goAway('pagehide'); }
    else goAway('simulate');
    awayAt -= ms;
    return comeBack('simulate', kind === 'bfcache' ? { persisted: true } : undefined);
  },
};

if (lifecycle.hidden) { awayAt = Date.now(); awayReason = 'prerender'; }
document.addEventListener('visibilitychange', () => { visible() ? comeBack('visible') : goAway('hidden'); });
addEventListener('pagehide', (e) => { emit('pagehide', { persisted: e.persisted }); goAway('pagehide'); });
addEventListener('pageshow', (e) => {
  if (!visible()) return;
  if (!comeBack('pageshow', { persisted: e.persisted }) && e.persisted) {
    stats.bfcache++;
    emit('bfcache-restore', { awaySec: stats.lastAwaySec, reason: 'pageshow', persisted: true });
  }
});
document.addEventListener('freeze', () => { stats.freezes++; emit('freeze', {}); goAway('freeze'); });
document.addEventListener('resume', () => { if (visible()) comeBack('resume'); });
addEventListener('focus', () => { if (visible()) comeBack('focus'); });
