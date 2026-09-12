/* ═══════════════════════════════════════════════════════════════════════════
   THE GAME
   One fish, one tank, and a room that fills up over hours of play. Nothing is
   available at the start; GOALS hand out capability as you earn it and the
   SHELF sells the rest for renown.
   ═══════════════════════════════════════════════════════════════════════════ */

import * as THREE from 'three';
import { clamp, lerp, rr, rnd, ri, pick, money$, num, plural, ago, el, $ } from '../util.js';
import { CFG } from '../config.js';
import { SPECIES, SP } from '../data/species.js';
import { PL, DEC, FD, PLANTS, DECOR, FOODS } from '../data/flora.js';
import { GR, GEAR, has } from '../data/gear.js';
import { GOALS, SHELF, SH, TIER_CAP, SPECIES_RENOWN } from '../data/progress.js';
import { REL, LORE } from '../data/relations.js';
import { makeTank, TANKS, TK, stepChem, waterScore, isCycled, daylight,
         flowOf, bioloadTotal, bioCapacity, decorStats, setNextTankId } from '../sim/tank.js';
import { makeFish, stepBiology, deathReason, foodValue } from '../sim/biology.js';
import { updateAI, placeFish, canEat } from '../sim/behaviour.js';
import { ecosystemHealth, crowdAppeal, evaluatePlacement } from '../sim/scoring.js';
import { Save, packTank } from './save.js';
import { Audio } from '../audio.js';

export class Game {
  constructor(world, orbit, scene, camera) {
    this.world = world; this.orbit = orbit; this.scene = scene; this.camera = camera;
    this.save = Save.data;
    this.tanks = []; this.active = 0;
    this.money = 0; this.renown = 0;
    this.caps = new Set();
    this.speed = 1; this.paused = true;
    this.appeal = 0; this.health = 100; this.appealPeak = 0;
    this.visitorRate = 0; this.totalFishEverAdded = 0;
    this.stats = null; this.streak = { clean: 0, noLoss: 0 };
    this.alertCd = new Map();
    this.selected = null; this.photo = false;
    this.pending = [];       // reward popups waiting to be shown
    this.warnT = 0; this.saveT = 0; this.scoreT = 0;
    this.ui = null; this.coach = null;
  }

  /* ── capability ───────────────────────────────────────────────────────── */
  can(c) { return this.caps.has(c); }
  grant(c) {
    if (this.caps.has(c)) return false;
    this.caps.add(c);
    if (!this.save.caps.includes(c)) this.save.caps.push(c);
    return true;
  }
  get T() { return this.tanks[this.active]; }
  tank(i) { return this.tanks[i]; }

  /* ── boot ─────────────────────────────────────────────────────────────── */
  start() {
    const s = this.save;
    const firstRun = !s.tanks || !s.tanks.length;
    this.money = firstRun ? CFG.START_MONEY : s.money;
    this.renown = s.renown;
    this.stats = s.stats;
    s.caps.forEach(c => this.caps.add(c));
    this.totalFishEverAdded = s.stats.fishEver || 0;

    if (s.tanks && s.tanks.length) {
      let maxUid = 0;
      this.tanks = s.tanks.map(p => {
        const T = makeTank(p.tankId, p.water, { uid: p.uid, name: p.name, substrate: p.substrate });
        Object.assign(T, {
          temp: p.temp, target: p.target, ph: p.ph, o2: p.o2, nh3: p.nh3, no2: p.no2, no3: p.no3,
          bactA: p.bactA, bactN: p.bactN, processed: p.processed, organics: p.organics,
          detritus: p.detritus, algae: p.algae, day: p.day, hour: p.hour, ageDays: p.ageDays,
          flowUser: p.flowUser, autoFeed: p.autoFeed, lastWaterChange: p.lastWaterChange,
        });
        T.gear = new Set(p.gear);
        T.plants = p.plants.map(x => ({ id: x.id, health: x.health }));
        T.decor = p.decor.map(x => ({ id: x.id, health: x.health }));
        for (const fp of p.fish) {
          const f = makeFish(T, fp.spId, { len: fp.len });
          Object.assign(f, fp);
          f.sp = SP[fp.spId];
          placeFish(T, f);
        }
        maxUid = Math.max(maxUid, p.uid);
        return T;
      });
      setNextTankId(maxUid + 1);
    } else {
      /* the shop sends a starter with seeded filter media in it, which is
         both what actually happens and the difference between a first fish
         that lives and a first fish that teaches you nothing */
      const first = makeTank('t10', 'fw', { name: 'The first tank' });
      first.bactA = 0.30; first.bactN = 0.16; first.processed = 1.4;
      this.tanks = [first];
    }
    this.showTank(0, true);
    this.applyOffline();
  }

  /** Time passed while the game was closed. Tanks with an auto-feeder keep
      earning; the rest simply wait, which is the kinder default. */
  applyOffline() {
    const gap = Date.now() - (this.save.lastSeen || Date.now());
    this.save.lastSeen = Date.now();
    if (gap < 90_000 || !this.tanks.length) return;
    const capH = CFG.OFFLINE_CAP_HOURS * (1 + (this.perk('offline') || 0));
    const hours = Math.min(gap / 3600_000, capH);
    let earned = 0, fed = 0;
    for (const T of this.tanks) {
      const days = hours / 24;
      /* fish do not starve while you are away; they just stop earning */
      for (const f of T.fish) if (f.alive) f.hunger = clamp(f.hunger + days * 0.25, 0, T.autoFeed ? 0.5 : 0.85);
      if (T.autoFeed) {
        for (let i = 0; i < Math.min(24, hours); i++) stepChem(T, 1 / 24, this.perks());
        const ap = crowdAppeal(T, 0);
        earned += ap * CFG.TICKET_BASE * hours * CFG.OFFLINE_RATE * (1 + (this.perk('ticket') || 0));
        fed++;
      }
      T.hour = (T.hour + hours) % 24;
      T.day += Math.floor((T.hour + hours) / 24);
    }
    if (earned > 1) {
      this.money += earned; this.stats.earned += earned;
      this.offlineReport = { hours, earned, fed, gap };
    } else if (hours > 0.5 && this.can('autofeed')) {
      this.offlineReport = { hours, earned: 0, fed: 0, gap };
    }
  }

  perks() { return { algae: this.perk('algae'), disease: this.perk('disease') }; }
  perk(k) {
    let v = 0;
    for (const id of this.save.shelf) { const s = SH[id]; if (s && s.mult && s.mult[k] != null) v += s.mult[k]; }
    return v;
  }

  /* ── tanks ────────────────────────────────────────────────────────────── */
  showTank(i, instant = false) {
    this.active = clamp(i, 0, this.tanks.length - 1);
    const T = this.T;
    this.world.buildTank(T);
    this.world.syncContents(T);
    for (const f of T.fish) if (!f.pos) placeFish(T, f);
    this.orbit.frame(T.dims, instant);
    this.setFollow(null);
    this.selected = null;
    this.ui?.onTankChanged();
  }
  addTank(tankId, water, name) {
    const T = makeTank(tankId, water, { name });
    this.tanks.push(T);
    this.showTank(this.tanks.length - 1);
    this.persist();
    return T;
  }

  /* ── stock ────────────────────────────────────────────────────────────── */
  buyFish(spId, n = 1, free = false) {
    const T = this.T, sp = SP[spId];
    let got = 0;
    for (let i = 0; i < n; i++) {
      if (T.fish.filter(f => f.alive).length >= 60) break;
      if (!free) { if (this.money < sp.price) break; this.money -= sp.price; }
      const f = makeFish(T, spId, { health: clamp(0.82 + (this.perk('health') || 0), 0, 1) });
      placeFish(T, f);
      got++;
      this.totalFishEverAdded++; this.stats.fishEver = this.totalFishEverAdded;
      if (!this.save.kept[spId]) { this.save.kept[spId] = 1; this.onNewSpecies(sp); }
    }
    if (got) {
      this.world.syncContents(T);
      Audio.splash();
      this.persist();
    }
    return got;
  }
  sellFish(f) {
    const T = this.T, i = T.fish.indexOf(f);
    if (i < 0) return;
    T.fish.splice(i, 1);
    this.money += Math.round(f.sp.price * 0.45 * (0.4 + 0.6 * f.health));
    if (this.orbit.follow === f) this.setFollow(null);
    if (this.selected === f) { this.selected = null; this.ui?.hideFishCard(); }
    this.world.syncContents(T);
    this.alert('info', 'Rehomed', `Your <b>${f.sp.name}</b> has gone to another keeper.`, 3);
    this.persist();
  }
  moveFish(f, toIdx) {
    const from = this.T, to = this.tanks[toIdx];
    if (!to || to === from) return;
    from.fish.splice(from.fish.indexOf(f), 1);
    to.fish.push(f);
    f.pos = null; placeFish(to, f);
    this.world.syncContents(from);
    this.alert('good', 'Moved', `<b>${f.sp.name}</b> is now in ${to.name}.`, 3);
    if (this.selected === f) { this.selected = null; this.ui?.hideFishCard(); }
    this.persist();
  }

  /* ── care ─────────────────────────────────────────────────────────────── */
  /** The food that feeds the most mouths in this tank. */
  bestFood() {
    const T = this.T;
    const diets = {};
    for (const f of T.fish) if (f.alive) diets[f.sp.diet] = (diets[f.sp.diet] || 0) + 1;
    let best = 'flake', score = -1;
    for (const f of FOODS) {
      const n = f.feeds.reduce((a, d) => a + (diets[d] || 0), 0);
      if (n > score) { score = n; best = f.id; }
    }
    return best;
  }

  feed(foodId = 'flake', portions = 1) {
    const T = this.T, f = FD[foodId];
    let cost = f.price * portions * (1 + (this.perk('foodCost') || 0));
    /* nobody should ever be unable to feed the fish they already own */
    if (this.money < cost) {
      if (this.stats.feeds > 3) { this.toast('Not enough money for food.'); return false; }
      cost = 0;
    }
    this.money -= cost;
    const [W, H, D] = T.dims;
    const n = Math.round(CFG.FOOD_PER_PORTION * portions * (1 + (this.perk('portion') || 0)));
    for (let i = 0; i < n; i++) {
      T.food.push({ pos: new THREE.Vector3(rr(-W * 0.38, W * 0.38), H - rr(0.05, 0.22), rr(-D * 0.32, D * 0.32)),
                    type: foodId, mass: CFG.FOOD_MASS * portions, waste: f.waste, age: 0, settled: false, seed: rnd() * 100 });
    }
    Audio.blip(1400, 0.05, 'sine', 0.03);
    for (let i = 0; i < 4; i++) setTimeout(() => Audio.bubble(), i * 60);
    this.stats.feeds++;
    T.lastFed = T.day;
    return true;
  }
  waterChange(frac = 0.25) {
    const T = this.T;
    const cost = Math.round(T.litres * frac * 0.06) + 2;
    if (this.money < cost) { this.toast('Not enough money.'); return; }
    this.money -= cost;
    const src = T.water === 'sw' ? 8.25 : 7.4;
    T.nh3 *= 1 - frac; T.no2 *= 1 - frac; T.no3 *= 1 - frac;
    T.organics *= 1 - frac * 0.8;
    T.ph = lerp(T.ph, src, frac * 0.9);
    T.o2 = clamp(T.o2 + frac * 0.35, 0, 1.05);
    T.temp = lerp(T.temp, 22, frac * 0.3);
    T.detritus *= 1 - frac * 0.6;
    T.lastWaterChange = T.day;
    for (const f of T.fish) if (f.alive) f.stress = Math.max(0, f.stress - 0.15);
    this.alert('good', 'Water change', `${Math.round(frac * 100)}% changed. Nitrate down, oxygen up.`, 4);
    this.lore('waterchange');
    Audio.splash();
    this.persist();
  }
  siphon() {
    const T = this.T, cost = 5;
    if (this.money < cost) { this.toast('Not enough money.'); return; }
    this.money -= cost;
    T.detritus *= 0.25;
    T.algae = Math.max(0, T.algae - 0.3);
    for (let i = T.fish.length - 1; i >= 0; i--) if (!T.fish[i].alive) T.fish.splice(i, 1);
    this.world.syncContents(T);
    this.alert('good', 'Cleaned', 'Substrate siphoned and anything dead removed.', 4);
    Audio.blip(300, 0.3, 'sine', 0.05);
  }
  medicate() {
    const T = this.T, cost = 26;
    if (this.money < cost) { this.toast('Not enough money.'); return; }
    this.money -= cost;
    for (const f of T.fish) if (f.alive) f.medicated = 2.5;
    T.bactA *= 0.78; T.bactN *= 0.78;
    this.alert('info', 'Treated', 'Whole-tank treatment dosed. It will knock your bacteria back a little.', 4);
    this.lore('meds');
    Audio.blip(700, 0.2, 'triangle', 0.05);
  }

  /* ── the loop ─────────────────────────────────────────────────────────── */
  tick(rdt) {
    const T = this.T;
    if (!T) return;
    const dt = this.paused ? 0 : Math.min(rdt, 0.05) * this.speed;
    const days = dt / CFG.DAY_SECONDS;

    if (dt > 0) {
      for (const t2 of this.tanks) {
        t2.hour += days * 24;
        while (t2.hour >= 24) { t2.hour -= 24; t2.day++; this.onNewDay(t2); }
        if (t2.heatwave > 0) t2.heatwave -= days;
        if (t2.powerOut > 0) t2.powerOut -= days;
        if (t2.filterOff > 0) t2.filterOff -= days;
        stepChem(t2, days, this.perks());
        stepBiology(t2, days, this, this.perks());
        if (t2 !== T) this.offscreen(t2, days);
      }
      this.economy(dt, days);
      this.stats.days += days;
    }

    updateAI(T, Math.min(rdt, 0.05) * (this.paused ? 0 : this.speed), this);

    this.scoreT -= rdt;
    if (this.scoreT <= 0) {
      this.scoreT = 0.2;
      const night = clamp(1 - daylight(T), 0, 1);
      let ap = 0, hp = 0;
      for (const t2 of this.tanks) {
        hp += ecosystemHealth(t2);
        ap += crowdAppeal(t2, clamp(1 - daylight(t2), 0, 1)) * (t2 === T ? 1 : 0.8);
      }
      this.appeal = ap; this.health = hp / this.tanks.length;
      this.appealPeak = Math.max(this.appealPeak, ap);
      this.checkGoals();
    }

    this.warnT -= rdt;
    if (this.warnT <= 0) { this.warnT = 4; this.warnings(T); }
    this.saveT -= rdt;
    if (this.saveT <= 0) { this.saveT = 8; this.persist(); }

    const night = clamp(1 - daylight(T), 0, 1);
    this.world.updateLighting(T, night);
    this.world.updateFish(T);
    this.world.updateBubbles(Math.min(rdt, 0.05), T);
    this.world.updateFood(T);
    this.world.updateRays(this.camera);
    Audio.night(night); Audio.flow(flowOf(T));
    if (rnd() < rdt * (T.decor.some(d => d.id === 'bubbler') ? 2.4 : 0.35)) Audio.bubble();
  }

  onNewDay(T) {
    if (!this.tanks.some(t2 => t2.fish.some(f => f.alive))) this.streak.noLoss = 0;
    if (T === this.T) {
      const w = waterScore(T);
      if (w > 82) this.streak.clean++; else this.streak.clean = 0;
      this.streak.noLoss++;
    }
    if (T.autoFeed && this.money > 4) {
      const diets = new Set(T.fish.filter(f => f.alive).map(f => f.sp.diet));
      const best = FOODS.find(f => f.feeds.some(d => diets.has(d))) || FD.flake;
      const save = this.active;
      this.active = this.tanks.indexOf(T);
      this.feed(best.id, 0.9);
      this.active = save;
    }
  }

  /** Background tanks: predation and nipping resolved statistically. */
  offscreen(T, days) {
    const live = T.fish.filter(f => f.alive);
    for (const f of live) {
      const prey = live.filter(o => canEat(f, o));
      if (prey.length && f.hunger > 0.4 && rnd() < days * 1.4)
        this.eat(f, prey[Math.floor(rnd() * prey.length)], T);
      const veilers = live.filter(o => o !== f && (o.sp.body.veil || 0) >= 0.55);
      if (['betta', 'barb', 'puffer'].includes(f.spId) && veilers.length && rnd() < days * 3)
        veilers[Math.floor(rnd() * veilers.length)].finDamage = clamp(veilers[0].finDamage + 0.1, 0, 1);
      if (T.food.length) { f.hunger = clamp(f.hunger - days * 1.6, 0, 1.4); T.food.length = Math.max(0, T.food.length - 1); }
    }
  }

  economy(dt, days) {
    const T = this.T;
    const night = daylight(T) < 0.25;
    let rate = Math.pow(Math.max(0, this.appeal), 0.93) * 1.05 * (1 + (this.perk('visitors') || 0));
    if (night) rate *= this.save.shelf.includes('nightlight') ? 0.55 : 0.10;
    if (this.health < 40) rate *= 0.55;
    this.visitorRate = rate;
    const v = rate * days * 24;
    this.stats.visitors += v;
    const ticket = (CFG.TICKET_BASE + clamp(this.appeal / 2400, 0, 0.4)) * (1 + (this.perk('ticket') || 0));
    const inc = v * ticket;
    this.money += inc; this.stats.earned += inc;
    const ren = v * CFG.RENOWN_PER_VISITOR;
    this.renown += ren; this.stats.renownEver += ren;
    /* running costs, so a big empty room is not free */
    let cost = this.tanks.reduce((a, t2) => a + t2.litres * 0.0016 + 0.9, 0);
    if (has(T, 'chiller')) cost += 2.4;
    this.money = Math.max(0, this.money - cost * days * 24 * 0.1);
  }

  /* ── the interaction callbacks the sim fires ──────────────────────────── */
  stalkStart(pred, prey) {
    if (rnd() > 0.55) return;
    this.alert('warn', 'Watch', `The <b>${pred.sp.name.toLowerCase()}</b> is eyeing your ${prey.sp.name.toLowerCase()}.`, 40);
  }
  eat(pred, prey, T) {
    prey.alive = false; prey.corpse = 0.85;
    prey.killedBy = `The ${pred.sp.name.toLowerCase()} ate it.`;
    pred.hunger = clamp(pred.hunger - 0.55 - prey.len / 30, 0, 1.4);
    pred.flash = 1;
    this.stats.losses++; this.streak.noLoss = 0;
    this.alert('bad', 'Predation', `The <b>${pred.sp.name}</b> took your ${prey.sp.name.toLowerCase()}.`, 8);
    Audio.blip(140, 0.22, 'sawtooth', 0.08);
    if (pred.spId === 'lion') this.discover('lion-small');
    if (pred.spId === 'angel' && prey.spId === 'neon') this.discover('angel-neon');
    if (pred.spId === 'puffer') this.discover('puffer-snail');
    if (prey.spId === 'cherry') this.discover('shrimp-snack');
    for (const o of T.fish) if (o.alive && o !== pred) { o.stress = Math.min(1.5, o.stress + 0.25); o.mood = 'flee'; }
  }
  contact(agg, vic, T) {
    const veil = vic.sp.body.veil || 0;
    let does = false, rel = null;
    if (agg.spId === 'betta' && (veil >= 0.55 || vic.spId === 'betta')) { does = true; rel = vic.spId === 'betta' ? 'betta-betta' : 'betta-veil'; }
    if (agg.spId === 'barb' && veil >= 0.55 && T.fish.filter(f => f.alive && f.spId === 'barb').length < 6) { does = true; rel = 'barb-veil'; }
    if (agg.spId === 'puffer' && veil >= 0.5) { does = true; rel = 'betta-veil'; }
    if (agg.spId === 'gramma' && vic.spId === 'gramma') { does = true; rel = 'gramma-gramma'; }
    if (agg.sp.temper === 'aggressive' && vic.len < agg.len * 0.6) does = does || rnd() < 0.3;
    if (!does) return;
    if ((this.lastNip || 0) > performance.now() - 900) return;
    this.lastNip = performance.now();
    vic.finDamage = clamp(vic.finDamage + 0.12, 0, 1);
    vic.stress = Math.min(1.5, vic.stress + 0.3);
    vic.flash = 0.8; vic.mood = 'flee';
    if (vic.finDamage > 0.2 && rel) {
      this.discover(rel);
      this.alert('warn', 'Aggression', `Your <b>${agg.sp.name}</b> is shredding the ${vic.sp.name.toLowerCase()}'s fins.`, 45);
    }
    if (vic.finDamage >= 0.97) vic.health -= 0.35;
  }
  /** The first time anything is about to die, it does not. Once. */
  useMercy(f, T) {
    if (this.save.mercyUsed) return false;
    this.save.mercyUsed = true;
    this.alert('bad', 'Close call', `Your <b>${f.sp.name}</b> nearly died. It is very weak — feed it, and fix whatever went wrong.`, 0);
    Audio.alarm();
    this.coach?.say(`That was close. A fish that is hungry or in bad water loses condition every day, and when it runs out it dies. Watch the <b>fish card</b> and the <b>water</b> reading — they tell you before it is too late.`, 'Understood');
    this.persist();
    return true;
  }

  onDeath(f, T, why) {
    this.stats.losses++; this.streak.noLoss = 0;
    this.alert('bad', 'Loss', `<b>${f.sp.name}</b> has died. ${why}`);
    if (this.orbit.follow === f) this.setFollow(null);
    if (this.selected === f) { this.selected = null; this.ui?.hideFishCard(); }
  }
  onBirth(sp, T) {
    const baby = makeFish(T, sp.id, { len: sp.size * 0.28, fry: true });
    placeFish(T, baby);
    this.stats.births++;
    this.world.syncContents(T);
    this.alert('good', 'Fry', `Your <b>${sp.name}</b> have bred. There is a fry hiding in the planting.`, 10);
    this.lore('breeding');
  }
  onNewSpecies(sp) {
    this.alert('new', 'New species', `<b>${sp.name}</b> added to your logbook.`, 0);
  }

  /* ── notices ──────────────────────────────────────────────────────────── */
  alert(kind, key, html, cd = 25) {
    const now = this.T ? this.T.day * 24 + this.T.hour : 0;
    const k = key + kind;
    if (now - (this.alertCd.get(k) ?? -1e9) < cd / 24 * 6) return;
    this.alertCd.set(k, now);
    this.ui?.pushAlert(kind, key, html);
    if (kind === 'bad') Audio.alarm(); else if (kind === 'good') Audio.blip(880, 0.12, 'sine', 0.05);
  }
  toast(msg) { this.ui?.toast(msg); }
  lore(id) {
    if (!LORE[id] || this.save.lore.includes(id)) return;
    this.save.lore.push(id);
    this.alert('new', 'Logbook', `<b>${LORE[id][0]}</b> — written up.`, 0);
    Audio.chime(true);
    this.ui?.flagLogbook();
  }
  discover(id) {
    if (!REL[id] || this.save.rels.includes(id)) return;
    this.save.rels.push(id);
    this.alert('new', 'Logbook', `<b>${REL[id].title}</b> — you have seen this happen now.`, 0);
    Audio.chime(true);
    this.ui?.flagLogbook();
  }

  warnings(T) {
    const live = T.fish.filter(f => f.alive);
    const simple = !this.can('testkit');
    if (T.nh3 > 0.28) this.alert('bad', 'Water', simple
      ? 'The water has gone wrong. Change some of it, and feed less.'
      : `Ammonia is at <b>${T.nh3.toFixed(2)} mg/L</b>. Above 0.25 burns gills. Change water and stop feeding.`, 45);
    else if (T.nh3 > 0.08) this.alert('warn', 'Water', simple
      ? 'The water is starting to turn. A partial change would help.'
      : `Ammonia has appeared — <b>${T.nh3.toFixed(2)} mg/L</b>. Your filter is behind the stocking.`, 60);
    if (T.no2 > 0.3 && !simple) this.alert('bad', 'Water', `Nitrite at <b>${T.no2.toFixed(2)} mg/L</b>. It stops their blood carrying oxygen.`, 50);
    if (T.no3 > 55 && !simple) this.alert('warn', 'Water', `Nitrate is up to <b>${Math.round(T.no3)} mg/L</b>. Plants and a water change, or algae will do it for you.`, 70);
    if (T.o2 < 0.62) this.alert('bad', 'Water', 'Oxygen is low — get some surface movement in there.', 45);
    if (T.algae > 0.55) { this.alert('warn', 'Algae', 'Algae is taking the glass. Less light, more planting, or something that eats it.', 70); this.lore('algae'); }
    const load = bioloadTotal(T) / bioCapacity(T);
    if (load > 1.08) { this.alert('warn', 'Stocking', `This tank is carrying <b>${Math.round(load * 100)}%</b> of what its filter can process.`, 80); this.lore('stocking'); }
    const starving = live.filter(f => f.hunger > 0.82);
    if (starving.length) {
      const sh = starving.find(f => f.sp.slowFeeder);
      if (sh) { this.alert('warn', 'Feeding', `Your <b>${sh.sp.name}</b> is not getting to the food in time.`, 60); this.discover('seahorse-comp'); }
      else this.alert('warn', 'Feeding', `${plural(starving.length, 'fish', 'fish')} ${starving.length === 1 ? 'is' : 'are'} hungry.`, 55);
    }
    const cold = live.find(f => T.temp < f.sp.temp[0] - 0.8), hot = live.find(f => T.temp > f.sp.temp[1] + 0.8);
    if (cold) this.alert('warn', 'Temperature', `${T.temp.toFixed(1)} °C is too cold for your <b>${cold.sp.name}</b>.`, 60);
    if (hot) this.alert('warn', 'Temperature', `${T.temp.toFixed(1)} °C is too warm for your <b>${hot.sp.name}</b>.`, 60);
    const counts = {};
    for (const f of live) counts[f.spId] = (counts[f.spId] || 0) + 1;
    for (const id in counts) if (SP[id].school > 1 && counts[id] < SP[id].school)
      this.alert('warn', 'Company', `${plural(counts[id], SP[id].name)} — they need at least ${SP[id].school} before they behave like themselves.`, 110);
    const sick = live.filter(f => f.sick > 0.05).length;
    if (sick) this.alert('bad', 'Illness', `${plural(sick, 'fish', 'fish')} showing signs of ich. Treat it, and fix whatever stressed them.`, 55);
    const dead = T.fish.filter(f => !f.alive).length;
    if (dead) { this.alert('bad', 'Remove', `There ${dead === 1 ? 'is a body' : 'are ' + dead + ' bodies'} in the tank. A corpse makes ammonia faster than the fish did.`, 25); this.lore('crash'); }
    if (T.detritus > 2.5) this.alert('warn', 'Waste', 'Uneaten food is building up in the sand. Feed less, or get something that works down there.', 80);
  }

  /* ── goals and unlocks ────────────────────────────────────────────────── */
  checkGoals() {
    for (const g of GOALS) {
      if (this.save.goals.includes(g.id)) continue;
      let ok = false;
      try { ok = g.check(this); } catch (e) { ok = false; }
      if (!ok) continue;
      this.save.goals.push(g.id);
      this.award(g);
    }
  }
  award(g) {
    const give = g.give || {};
    const gained = [];
    if (give.money) { this.money += give.money; gained.push({ ic: '💵', b: money$(give.money), s: 'Paid in.' }); }
    if (give.renown) { this.renown += give.renown; this.stats.renownEver += give.renown;
      gained.push({ ic: '◆', b: give.renown + ' renown', s: 'Spend it on the Shelf.' }); }
    for (const c of give.caps || []) if (this.grant(c)) gained.push(capReward(c));
    if (give.lore) this.lore(give.lore);
    if (give.rel) this.discover(give.rel);
    this.persist();
    if (g.silent) {
      for (const x of gained) if (x) this.alert('new', 'Unlocked', `<b>${x.b}</b> — ${x.s}`, 0);
      return;
    }
    this.pending.push({ title: g.text, note: give.note, gained: gained.filter(Boolean) });
    this.ui?.drainRewards();
  }

  buyShelf(id) {
    const s = SH[id];
    if (!s || this.save.shelf.includes(id) || this.renown < s.cost) return false;
    this.renown -= s.cost;
    this.save.shelf.push(id);
    if (s.kind === 'tank') this.grant(id);
    Audio.fanfare();
    this.persist();
    return true;
  }
  buySpeciesUnlock(spId) {
    const sp = SP[spId];
    const cost = SPECIES_RENOWN[sp.tier] || 99;
    if (this.renown < cost) return false;
    this.renown -= cost;
    if (!this.save.kept[spId]) this.save.kept[spId] = 0;
    this.save.unlockedSpecies = this.save.unlockedSpecies || [];
    if (!this.save.unlockedSpecies.includes(spId)) this.save.unlockedSpecies.push(spId);
    Audio.chime(true);
    this.persist();
    return true;
  }
  speciesAvailable(spId) {
    const sp = SP[spId];
    if (sp.tier === 0) return true;
    const cap = TIER_CAP[sp.tier];
    if (cap && this.can(cap)) return sp.water === 'fw' || this.can('marine');
    return (this.save.unlockedSpecies || []).includes(spId);
  }

  /* ── misc ─────────────────────────────────────────────────────────────── */
  setSpeed(s) {
    this.speed = s; this.paused = s === 0;
    this.ui?.onSpeed(s);
  }
  setFollow(f) { this.orbit.setFollow(f); this.ui?.onFollow(f); }
  persist() {
    const s = this.save;
    s.money = this.money; s.renown = this.renown;
    s.stats = this.stats;
    s.tanks = this.tanks.map(packTank);
    s.lastSeen = Date.now();
    Save.write();
  }
}

function capReward(c) {
  const M = {
    feed:      { ic: '🍽️', b: 'Feeding', s: 'You can drop food into the tank.' },
    shelf1:    { ic: '🐠', b: 'The first shelf', s: 'Five more species are in the shop.' },
    tank2:     { ic: '🪟', b: 'A second tank', s: 'The first one keeps running on its own.' },
    plants:    { ic: '🌿', b: 'Planting', s: 'Plants eat nitrate and outcompete algae.' },
    testkit:   { ic: '🧪', b: 'Test kit', s: 'The real numbers, instead of one dial.' },
    decor:     { ic: '🪨', b: 'Hardscape', s: 'Wood and stone. Shy fish need somewhere to be.' },
    speed3:    { ic: '⏩', b: 'Fast forward', s: 'Run the tank at three times the speed.' },
    shelf2:    { ic: '🐟', b: 'The second shelf', s: 'Bigger, fussier, more valuable fish.' },
    autofeed:  { ic: '⏱️', b: 'Auto-feeder', s: 'A tank with one keeps earning while you are away.' },
    trips:     { ic: '🧭', b: 'Collecting trips', s: 'Send someone out. Bring something back.' },
    shelf3:    { ic: '🐡', b: 'The third shelf', s: 'Fish that need you to know what you are doing.' },
    gearshop:  { ic: '⚙️', b: 'Equipment', s: 'Filters, lights, heaters, skimmers.' },
    marine:    { ic: '🧂', b: 'Salt water', s: 'Everything about marine is narrower.' },
    shelf4:    { ic: '🪸', b: 'The reef shelf', s: 'Clownfish, tangs, cleaner shrimp.' },
    breeding:  { ic: '🥚', b: 'Breeding', s: 'Fish in genuinely good conditions will spawn.' },
    shelf5:    { ic: '💎', b: 'The deep end', s: 'Discus, lionfish, seahorses, jellies.' },
    photo:     { ic: '📷', b: 'Photo mode', s: 'Depth of field, filters, and no interface.' },
    logbook:   { ic: '📓', b: 'Logbook', s: 'Everything you have kept and everything you have learned.' },
    care:      { ic: '🧰', b: 'Care kit', s: 'Water changes, siphon, medication.' },
    moveFish:  { ic: '🔀', b: 'Moving fish', s: 'You can shift an animal between tanks.' },
  };
  return M[c] || null;
}
