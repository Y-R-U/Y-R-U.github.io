// Daily calendar, weekly challenge, date-driven events, fake-ad plumbing.
import { DAILY, MONTHLY_GOAL, MONTHLY_REWARD, EVENTS, WEEKEND_ROTATION, WEEKLY_TIERS, AD } from './config.js';
import { save, persist, addShards, addBooster } from './save.js';
import { todayKey, isYesterday, weekKey, weekNum, monthKey, hashStr } from './utils.js';

// ── daily ─────────────────────────────────────────────────────────────
export function dailyState(now = new Date()) {
  const d = save.data.daily;
  const today = todayKey(now);
  const claimedToday = d.lastClaim === today;
  // streak continues if last claim was yesterday (or today), else resets to 0
  const streak = (claimedToday || (d.lastClaim && isYesterday(d.lastClaim, now))) ? d.streak : 0;
  const dayIndex = claimedToday ? (streak - 1 + 7) % 7 : streak % 7;
  return { claimedToday, streak, dayIndex, reward: DAILY[dayIndex], today };
}

export function claimDaily(now = new Date()) {
  const st = dailyState(now);
  if (st.claimedToday) return null;
  const d = save.data.daily;
  d.streak = st.streak + 1;
  d.lastClaim = st.today;
  d.claimed.push(st.today);
  if (d.claimed.length > 60) d.claimed = d.claimed.slice(-60);
  const r = st.reward;
  if (r.shards) addShards(r.shards);
  if (r.booster) addBooster(r.booster, r.n || 1);
  persist();
  return { ...r, dayIndex: st.dayIndex, monthly: checkMonthly(now) };
}

export function monthClaims(now = new Date()) {
  const mk = monthKey(now);
  return save.data.daily.claimed.filter(k => k.startsWith(mk)).length;
}

export function checkMonthly(now = new Date()) {
  const mk = monthKey(now);
  if (save.data.monthlyAwarded.includes(mk)) return null;
  if (monthClaims(now) < MONTHLY_GOAL) return null;
  save.data.monthlyAwarded.push(mk);
  addShards(MONTHLY_REWARD.shards);
  if (MONTHLY_REWARD.theme && !save.data.themesOwned.includes(MONTHLY_REWARD.theme)) {
    save.data.themesOwned.push(MONTHLY_REWARD.theme);
  }
  persist();
  return MONTHLY_REWARD;
}

// ── weekly challenge ──────────────────────────────────────────────────
export function weeklyState(now = new Date()) {
  const wk = weekKey(now);
  if (save.data.weekly.week !== wk) {
    save.data.weekly = { week: wk, best: 0, claimed: WEEKLY_TIERS.map(() => false), runs: 0 };
    persist();
  }
  const w = save.data.weekly;
  if (!Array.isArray(w.claimed) || w.claimed.length !== WEEKLY_TIERS.length) {
    w.claimed = WEEKLY_TIERS.map(() => false);
  }
  return { ...w, seed: hashStr('prismbreak-' + wk), tiers: WEEKLY_TIERS };
}

export function weeklyRecord(score) {
  const w = weeklyState();
  save.data.weekly.best = Math.max(w.best, score);
  save.data.weekly.runs++;
  persist();
}

export function weeklyClaim(tierIdx) {
  const w = weeklyState();
  const tier = WEEKLY_TIERS[tierIdx];
  if (!tier || w.claimed[tierIdx] || w.best < tier.score) return false;
  save.data.weekly.claimed[tierIdx] = true;
  addShards(tier.shards);
  if (tier.booster) addBooster(tier.booster, tier.n || 1);
  persist();
  return true;
}

// ── events (deterministic from the calendar) ──────────────────────────
// Fri/Sat/Sun: weekend event rotating by ISO week. Wednesday: Twilight Zen.
export function activeEvent(now = new Date()) {
  const day = now.getDay(); // 0 sun .. 6 sat
  let id = null, endsIn = null;
  if (day === 5 || day === 6 || day === 0) {
    id = WEEKEND_ROTATION[weekNum(now) % WEEKEND_ROTATION.length];
    const end = new Date(now);
    end.setDate(end.getDate() + (day === 0 ? 1 : (8 - day) % 7 || 1)); // through Sunday night
    end.setHours(0, 0, 0, 0);
    endsIn = end - now;
  } else if (day === 3) {
    id = 'twilightzen';
    const end = new Date(now); end.setDate(end.getDate() + 1); end.setHours(0, 0, 0, 0);
    endsIn = end - now;
  }
  if (!id) {
    // countdown to the next event window (Wed or Fri)
    const next = new Date(now);
    const target = day < 3 ? 3 : 5;
    next.setDate(next.getDate() + (target - day));
    next.setHours(0, 0, 0, 0);
    return { active: false, nextIn: next - now };
  }
  const def = EVENTS[id];
  const evKey = `${weekKey(now)}-${id}`;
  if (!save.data.events[evKey]) {
    save.data.events[evKey] = { best: 0, claimed: def.tiers.map(() => false) };
    persist();
  }
  return { active: true, id, def, key: evKey, state: save.data.events[evKey], endsIn };
}

export function eventRecord(evKey, score) {
  const e = save.data.events[evKey];
  if (!e) return;
  e.best = Math.max(e.best, score);
  persist();
}

export function eventClaim(evKey, def, tierIdx) {
  const e = save.data.events[evKey];
  const tier = def.tiers[tierIdx];
  if (!e || !tier || e.claimed[tierIdx] || e.best < tier.score) return false;
  e.claimed[tierIdx] = true;
  addShards(tier.shards);
  persist();
  return true;
}

// ── fake ads ──────────────────────────────────────────────────────────
export function adFreebiesLeft(now = new Date()) {
  const today = todayKey(now);
  if (save.data.ads.day !== today) { save.data.ads = { day: today, freebies: 0 }; persist(); }
  return AD.freeShardsPerDay - save.data.ads.freebies;
}

export function useAdFreebie() {
  if (adFreebiesLeft() <= 0) return false;
  save.data.ads.freebies++;
  addShards(AD.freeShards);
  persist();
  return true;
}
