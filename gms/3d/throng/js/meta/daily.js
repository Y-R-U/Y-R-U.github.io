import { hash32 } from './hash.js';

// Days roll over at 00:00 UTC so the challenge is the same for everyone on the same day.
export const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
export const dayIndex = (key) => Math.floor(Date.parse(key + 'T00:00:00Z') / 86400000);
export const msToRollover = (t = Date.now()) => 86400000 - (t % 86400000);

export const LOGIN_REWARDS = [40, 60, 80, 120, 160, 200, 400];

const KINDS = [
  { id: 'size', sum: false, targets: [300, 400, 500, 600], text: (n) => `Finish a match with ${n}+ people` },
  { id: 'absorb', sum: true, targets: [2, 3, 4, 5], text: (n) => `Absorb ${n} crowds` },
  { id: 'crown', sum: false, targets: [15, 20, 30, 45], text: (n) => `Hold the crown for ${n} s in one match` },
  { id: 'top3', sum: true, targets: [2, 3, 4], text: (n) => `Finish in the top 3 ${n} times` },
  { id: 'recruit', sum: true, targets: [600, 900, 1200, 1500], text: (n) => `Recruit ${n} people from the street` },
  { id: 'win', sum: true, targets: [1, 2], text: (n) => n === 1 ? 'Win a match' : `Win ${n} matches` },
  { id: 'peak', sum: false, targets: [400, 550, 700], text: (n) => `Reach a crowd of ${n} at any moment` },
];

export function challengeFor(key) {
  const h = hash32('daily:' + key);
  const kind = KINDS[h % KINDS.length];
  const tier = (h >>> 8) % kind.targets.length;
  const target = kind.targets[tier];
  return { key, kind: kind.id, sum: kind.sum, target, tier, text: kind.text(target), coins: 150 + 50 * tier, xp: 80 + 30 * tier };
}

export function challengeValue(kind, r) {
  switch (kind) {
    case 'size': return r.count;
    case 'absorb': return r.kills;
    case 'crown': return Math.floor(r.crownSecs || 0);
    case 'top3': return r.place <= 3 ? 1 : 0;
    case 'recruit': return r.recruited;
    case 'win': return r.place === 1 ? 1 : 0;
    case 'peak': return r.best;
  }
  return 0;
}

// Updates save.daily for a finished match. Returns { ch, progress, done, justDone }.
export function trackChallenge(save, r, now = Date.now()) {
  const d = save.daily, key = dayKey(now);
  if (d.chKey !== key) { d.chKey = key; d.chProgress = 0; d.chDone = false; }
  const ch = challengeFor(key);
  if (d.chDone || r.left) return { ch, progress: d.chProgress, done: d.chDone, justDone: false };
  const v = challengeValue(ch.kind, r);
  d.chProgress = ch.sum ? d.chProgress + v : Math.max(d.chProgress, v);
  const justDone = d.chProgress >= ch.target;
  if (justDone) d.chDone = true;
  return { ch, progress: Math.min(d.chProgress, ch.target), done: d.chDone, justDone };
}

export function challengeState(save, now = Date.now()) {
  const key = dayKey(now), ch = challengeFor(key), d = save.daily;
  const fresh = d.chKey !== key;
  return { ch, progress: fresh ? 0 : Math.min(d.chProgress, ch.target), done: !fresh && d.chDone };
}

// 7-day cycle that advances one step per day claimed; a missed day does not reset it.
export function loginState(save, now = Date.now()) {
  const key = dayKey(now);
  return { day: save.daily.loginStep % 7, canClaim: save.daily.lastClaim !== key, rewards: LOGIN_REWARDS };
}

export function claimLogin(save, now = Date.now()) {
  const s = loginState(save, now);
  if (!s.canClaim) return 0;
  save.daily.lastClaim = dayKey(now);
  save.daily.loginStep = (save.daily.loginStep + 1) % 7;
  return LOGIN_REWARDS[s.day];
}
