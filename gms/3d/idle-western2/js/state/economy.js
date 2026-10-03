export function levelCost(line, lv, cm = 1) {
  return cm * line.levelCost * Math.pow(line.costGrowth, Math.max(0, lv - 1));
}

export function bulkCost(line, lv, n, cm = 1) {
  const g = line.costGrowth;
  return levelCost(line, lv, cm) * (Math.pow(g, n) - 1) / (g - 1);
}

export function maxAffordable(line, lv, cash, cm = 1) {
  const g = line.costGrowth, first = levelCost(line, lv, cm);
  if (!(cash >= first)) return 0;
  let n = Math.floor(Math.log(cash * (g - 1) / first + 1) / Math.log(g));
  while (n > 0 && bulkCost(line, lv, n, cm) > cash) n--;
  while (bulkCost(line, lv, n + 1, cm) <= cash) n++;
  return n;
}

export function milestoneCount(lv, E) {
  let n = 0;
  for (const t of E.milestones) if (lv >= t) n++;
  return n;
}

export function milestoneMult(lv, E) {
  return Math.pow(E.milestoneMult, milestoneCount(lv, E));
}

export function nextMilestone(lv, E) {
  for (const t of E.milestones) if (lv < t) return t;
  return null;
}

export function sigmaBase(thr, E) {
  return Math.min(1, E.sigma0 + E.sigmaStep * thr);
}

export function priceMult(thr, E) {
  return Math.pow(E.sigmaPrice, thr);
}

export function boostMult(line, n) {
  let m = 1;
  for (let i = 0; i < n && i < line.boosts.length; i++) m *= line.boosts[i].mult;
  return m;
}

export function shelfCap(P, sto, shelfMult, E) {
  return E.shelfSec * P * Math.pow(E.shelfStep, sto) * shelfMult;
}

export function visualTier(lv) {
  return lv >= 100 ? 2 : lv >= 25 ? 1 : 0;
}

export function comboMult(n, E) {
  return 1 + (E.comboMax - 1) * Math.min(1, n / E.comboTaps);
}

export function hourOf(ms) {
  const d = new Date(ms);
  return d.getHours() + d.getMinutes() / 60;
}

export function inWindow(h, from, to) {
  return from <= to ? h >= from && h < to : h >= from || h < to;
}
