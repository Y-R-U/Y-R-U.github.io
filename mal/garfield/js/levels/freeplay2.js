import { defineLevel2, V, flat, prop, A, apos, naughtyChase } from './ch2/common2.js';
import { hidePlates, showPlates } from './ch2/c2_02.js';
import { sillHelpers } from './shared.js';
import { tableBox } from './common.js';
import { insideRoom } from './l08.js';
import { getCast } from '../game/cast2.js';
import { LINES } from '../game/lines.js';

// Chapter Two Free Play (BRIEF2 last paragraph, D21, docs/LEVELS2.md §6). No objectives: a living house. Jon and
// Lyman run their own day (wander / telly / coffee / their rooms), Odie roams, and a director rolls Ch2 events.
// Contradictory events are mutually exclusive: rolled together they cancel each other, and one that clashes with a
// running event is cancelled. Every Ch2 interaction works any time. Odie knockouts recover after 10 s; a shut-in
// person (or dog) gets out after 60 s or when Garfield opens the door; "Naughty Garfield!" chases last 10 s.
export const FP2 = { knockout: 10, trapped: 60, chase: 10, odieBack: 20, firstRoll: [12, 20], roll: [26, 46], pair: 0.3 };
const rnd = (a, b) => a + Math.random() * (b - a);
const pickW = (list) => { const s = list.reduce((a, x) => a + x.w, 0); let r = Math.random() * s; for (const x of list) if ((r -= x.w) <= 0) return x; return list[list.length - 1]; };
const any = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Free-play lines not (yet) in js/game/lines.js. bark() prefers lines.js / the VO manifest, so once the game lane
// merges these keys they get voices automatically; until then they show as subtitle/thought bubbles only.
export const FP2_LINES = {
  fp2_g_idle_1: { who: 'garfield', text: "Jon, Lyman, a dog and me. One of us is the brains. Guess who." },
  fp2_g_idle_2: { who: 'garfield', text: "The house is quiet. That's my cue." },
  fp2_g_idle_3: { who: 'garfield', text: "Every day is free play if you're a cat." },
  fp2_g_idle_4: { who: 'garfield', text: "I could nap. Or I could cause chaos. Why not both?" },
  fp2_g_idle_5: { who: 'garfield', text: "So many targets. So little nap time." },
  fp2_g_odie_table_1: { who: 'garfield', text: "The dog's on the table again. Gravity, do your thing." },
  fp2_g_odie_table_2: { who: 'garfield', text: "Somebody's about to learn about edges." },
  fp2_g_odie_fly_1: { who: 'garfield', text: "Bon voyage, dog breath." },
  fp2_g_odie_fly_2: { who: 'garfield', text: "Fly, Odie, fly! Preferably far." },
  fp2_g_odie_splat_1: { who: 'garfield', text: "Wall: one. Dog: nil." },
  fp2_g_odie_splat_2: { who: 'garfield', text: "Close. Next time, open window AND good aim." },
  fp2_g_vase_odie_1: { who: 'garfield', text: "Bullseye. Sorry, vase." },
  fp2_g_vase_odie_2: { who: 'garfield', text: "Special delivery: one vase, express." },
  fp2_g_vase_miss_1: { who: 'garfield', text: "Missed. That vase died for nothing." },
  fp2_g_cupboard_1: { who: 'garfield', text: "Dinner's in the cupboard, dog. So are you." },
  fp2_g_cupboard_out_1: { who: 'garfield', text: "He's out. Nobody tell him how doors work." },
  fp2_g_whistle_again_1: { who: 'garfield', text: "Still broken. I'll keep testing it. For science." },
  fp2_g_whistle_again_2: { who: 'garfield', text: "Not a peep. Rubbish whistle." },
  fp2_g_socks_1: { who: 'garfield', text: "Odie in socks. My finest work." },
  fp2_g_launcher_1: { who: 'garfield', text: "Spit-ball launcher. Loaded and dangerous." },
  fp2_g_launcher_2: { who: 'garfield', text: "One straw. Infinite possibilities." },
  fp2_g_brawl_1: { who: 'garfield', text: "I didn't do anything. I'm just a cat." },
  fp2_g_brawl_2: { who: 'garfield', text: "Two grown men and a dog. Best show on telly." },
  fp2_g_mice_1: { who: 'garfield', text: "Mice party. Humans dancing. Everything's going to plan." },
  fp2_g_mice_2: { who: 'garfield', text: "I'd catch them, but I'm on a break. Forever." },
  fp2_g_delivery_1: { who: 'garfield', text: "A parcel! Is it lasagna? It's never lasagna." },
  fp2_g_carpet_1: { who: 'garfield', text: "TV dinner, round two." },
  fp2_g_carpet_miss_1: { who: 'garfield', text: "No dog under it. Still satisfying." },
  fp2_g_shed_1: { who: 'garfield', text: "Shedding week again. Bless." },
  fp2_g_shed_2: { who: 'garfield', text: "A little orange makes everything better." },
  fp2_g_shed_3: { who: 'garfield', text: "Fur here. Fur there. Fur everywhere." },
  fp2_g_bald_back_1: { who: 'garfield', text: "Fur's back. Order restored. Handsome restored." },
  fp2_g_trap_1: { who: 'garfield', text: "Enjoy your room. I'll hold the door. Closed." },
  fp2_g_trap_2: { who: 'garfield', text: "Peace and quiet. Finally." },
  fp2_g_disco_1: { who: 'garfield', text: "The white suit's back. My fur sees an opportunity." },
  fp2_g_disco_end_1: { who: 'garfield', text: "Disco's dead. I killed it. With fur." },
  fp2_g_warp_1: { who: 'garfield', text: "The table's weak. Not me. The table." },
  fp2_g_cancel_1: { who: 'garfield', text: "Two things were about to happen. Then neither did. Typical." },
  fp2_g_cancel_2: { who: 'garfield', text: "Something was going to happen. It changed its mind." },
  fp2_g_eat_1: { who: 'garfield', text: "Unguarded dinner. My favourite kind." },
  fp2_g_eat_2: { who: 'garfield', text: "Ew for them. Yum for me." },
  fp2_g_soup_1: { who: 'garfield', text: "Soup. The drink you eat. I approve." },
  fp2_g_bowl_1: { who: 'garfield', text: "Biscuits. The salad of cat food." },
  fp2_g_guard_1: { who: 'garfield', text: "The dog's guarding it. With his face." },
  fp2_g_window_1: { who: 'garfield', text: "Fresh air. For the dog. On his way out." },
  fp2_g_morning_1: { who: 'garfield', text: "Bad mood. Big table. Let's see who dares." },
  fp2_g_hug_1: { who: 'garfield', text: "Fine. I'm loved. Don't make it weird." },
  fp2_g_nohug_1: { who: 'garfield', text: "Respect. That's all I ask. And lasagna." },
  fp2_j_wander_1: { who: 'jon', text: "Lyman, did you eat my sandwich? …Lyman?" },
  fp2_j_wander_2: { who: 'jon', text: "What a lovely day to stay in with my pets!" },
  fp2_j_wander_3: { who: 'jon', text: "Odie, that's not a chew toy, that's my slipper." },
  fp2_j_room_1: { who: 'jon', text: "Now where did I put my good socks?" },
  fp2_j_room_2: { who: 'jon', text: "Who's been rolling in my sock drawer?" },
  fp2_j_free_1: { who: 'jon', text: "Freedom! Who keeps shutting doors?!" },
  fp2_j_coffee_1: { who: 'jon', text: "Ahh. Coffee. The only thing in this house that doesn't shed." },
  fp2_j_coffee_2: { who: 'jon', text: "A quiet cup of coffee. Any second now. Quiet. Any second." },
  fp2_j_delivery_1: { who: 'jon', text: "The doorbell! Coming!" },
  fp2_j_dinner_1: { who: 'jon', text: "Dinner time! Two plates, zero cats." },
  fp2_j_soup_1: { who: 'jon', text: "Chicken soup for one. Lovely." },
  fp2_j_makeup_1: { who: 'jon', text: "Sorry, Lyman. Hug it out?" },
  fp2_j_odie_1: { who: 'jon', text: "Odie! Are you okay, boy?" },
  fp2_j_window_1: { who: 'jon', text: "Who opened the window? Brrr!" },
  fp2_j_mice_end_1: { who: 'jon', text: "I think they're gone. I'm never buying cheese again." },
  fp2_j_shed_1: { who: 'jon', text: "Is it shedding week AGAIN?!" },
  fp2_j_tv_1: { who: 'jon', text: "Telly time! Lyman, budge up." },
  fp2_l_wander_1: { who: 'lyman', text: "Jon, your fridge is my fridge, right? Right." },
  fp2_l_wander_2: { who: 'lyman', text: "A man needs his afternoon snack. And his morning snack." },
  fp2_l_room_1: { who: 'lyman', text: "Just a little nap. A twelve-hour little nap." },
  fp2_l_free_1: { who: 'lyman', text: "I'm out! I'm cold, I'm hungry, I'm weak… but I'm out!" },
  fp2_l_trapped_1: { who: 'lyman', text: "Jon! The door's stuck! I'm wasting away in here!" },
  fp2_l_trapped_2: { who: 'lyman', text: "Let me out! I can hear snacks!" },
  fp2_l_coffee_1: { who: 'lyman', text: "Coffee and telly. Living the dream." },
  fp2_l_disco_1: { who: 'lyman', text: "Time to boogie! Make way for Lyman!" },
  fp2_l_disco_end_1: { who: 'lyman', text: "My suit! Covered in cat! I'm going to change." },
  fp2_l_disco_done_1: { who: 'lyman', text: "Right. Back to normal Lyman. Dull, dull Lyman." },
  fp2_l_makeup_1: { who: 'lyman', text: "No hard feelings, Jon. Your cat started it." },
  fp2_l_odie_1: { who: 'lyman', text: "Odie! Who did this to you? …I bet it was the cat." },
  fp2_l_odie_back_1: { who: 'lyman', text: "Odie! You came back! Good boy!" },
  fp2_l_dinner_1: { who: 'lyman', text: "Steak? Again? Jon, you spoil me." },
};
const famIn = (src, key) => !!src[key] || Object.keys(src).some((k) => k.length > key.length + 1 && k.startsWith(key + '_') && /^\d+$/.test(k.slice(key.length + 1)));

function bark(L, key, o = {}) {
  const { ctx, fp } = L;
  if (famIn(LINES, key) || famIn(ctx.audio?.voLines || {}, key)) return L.say(key, o);
  if (o.chance != null && Math.random() > o.chance) return;
  if (o.delay) { L.later(o.delay, () => bark(L, key, { ...o, delay: 0, chance: null })); return; }
  const keys = Object.keys(FP2_LINES).filter((k) => k === key || (k.startsWith(key + '_') && /^\d+$/.test(k.slice(key.length + 1))));
  if (!keys.length) return;
  if (!o.force && L.t - fp.localAt < (o.lowPri ? 9 : 3.5)) return;
  let k = any(keys);
  if (keys.length > 1 && k === fp.lastLocal[key]) k = keys[(keys.indexOf(k) + 1) % keys.length];
  fp.lastLocal[key] = k; fp.localAt = L.t;
  const ln = FP2_LINES[k];
  let text = ln.text;
  try { text = ctx.names?.apply?.(text) ?? text; } catch {}
  try { ctx.ui?.say?.({ who: ln.who, text, thought: ln.who === 'garfield', dur: Math.max(1.6, Math.min(5.5, 0.9 + text.length * 0.055)) }); } catch {}
  ctx.events?.emit?.('bark', { key: k, who: ln.who, text });
  L.barks.log.push({ t: L.barks.now, key: k });
}

// ------------------------------------------------------------------ geometry helpers
const inCupboard = (p) => p.x > 8.0 && p.z > 0.85 && p.z < 4.75 && p.y < 0.6;
const inLymanRoom = (p) => p.y > 2.5 && p.z > 7.05;
const upstairs = (p) => p.y > 2.5;
const BOUNDS = { x0: -0.2, x1: 9.6, z0: -0.2, z1: 11.4 };
const reach = (nav, from, to) => { try { return !!nav?.path?.(from.clone(), to.clone()); } catch { return false; } };
function tableSpots(ctx) {
  const tb = tableBox(ctx), y = tb.topY, cz = (tb.min.z + tb.max.z) / 2, cx = (tb.min.x + tb.max.x) / 2;
  const floorCands = [V(tb.max.x + 0.5, 0, cz), V(tb.min.x - 0.55, 0, cz), V(cx, 0, tb.min.z - 0.55), V(cx, 0, tb.max.z + 0.55)];
  const floor = floorCands.find((p) => (ctx.world.groundAt?.(p.x, p.z, 0.3) ?? 0) < 0.1) || floorCands[0];
  const edge = apos(ctx, 'odieTableEdge', V(cx, y, tb.min.z + 0.3)).setY(y);
  const corners = [V(tb.min.x + 0.2, y, tb.min.z + 0.2), V(tb.max.x - 0.2, y, tb.min.z + 0.2), V(tb.max.x - 0.2, y, tb.max.z - 0.2), V(tb.min.x + 0.2, y, tb.max.z - 0.2)];
  const near = floor.clone().lerp(V(cx, 0, cz), 0.35).setY(y);
  return { tb, y, floor, edge, corners, near, centre: V(cx, y, cz) };
}
const plateP = (ctx, id) => { const p = prop(ctx, id); return p?.pos?.lengthSq() ? p.pos.clone() : apos(ctx, id === 'plate' ? 'plateSpot' : 'plateSpot2', V(4.4, 0.76, 8.5)); };
const soupPos = (ctx) => { const s = prop(ctx, 'soupBowl'); return s?.root?.visible ? s.root.getWorldPosition(V()) : apos(ctx, 'soupSpot', V(4.4, 0.76, 8.5)); };
const vasePos = (ctx) => { const v = prop(ctx, 'vase'); return v?.root ? v.root.getWorldPosition(V()) : apos(ctx, 'vase', V(2.55, 0.9, 0.22)); };
const odieBowlSpot = (ctx) => { const b = apos(ctx, 'odieBowl', V(7.35, 0, 9.75)), r = A(ctx, 'odieBowl')?.rotY || 0; return b.add(V(Math.sin(r), 0, Math.cos(r)).multiplyScalar(0.42)).setY(0); };
const oldTvOdie = (ctx) => apos(ctx, 'oldTvSpot', V(1.17, 0, 2.75)).setY(0).add(V(0.15, 0, 0.8));
const drawerPos = (ctx) => apos(ctx, 'sockDrawer', V(4.1, 3.62, 6.2));
const breakPos = (ctx) => apos(ctx, 'breakDrawer', V(4.1, 3.12, 6.1));
const SHED = [
  { id: 'bed', anchor: 'shedBed', fb: V(1.05, 3.62, 3.2) },
  { id: 'sofa', anchor: 'shedSofa', fb: V(3.85, 0.5, 2.75) },
  { id: 'armchair', anchor: 'shedArmchair', fb: V(4.45, 0.49, 0.95) },
  { id: 'table', anchor: 'shedTable', fb: V(4.4, 0.77, 8.8) },
];

// human states
const BUSY = new Set(['react', 'throw', 'fetchPaper', 'chase', 'glare', 'catch', 'trapped', 'stunned', 'faceplant', 'down', 'cutscene']);
const LOCKED_TASKS = /^fp(Delivery|Brawl|Window|Hug|Glare|Splash|Change|Poked)/;
const ACT_STATES = new Set(['wander', 'sofa', 'sitEat', 'fpRoom', 'lounge']);
const TRANSIT = new Set(['goSofa', 'goSit', 'returning', 'investigate', 'walking', 'fpStand', 'afterChase']);
const doing = (h, re) => h.busy() && (typeof re === 'string' ? h.taskName === re : re.test(h.taskName || ''));
const avail = (h) => !!h && h.enabled !== false && h.actor.root.visible !== false && !BUSY.has(h.state) && !(h.busy() && LOCKED_TASKS.test(h.taskName || ''));

// ------------------------------------------------------------------ level
export default defineLevel2({
  id: 'fp2', title: 'Free Play', food: 'steak', objectives: [], hints: [], cast: ['odie', 'lyman'],
  async setup(L) {
    const { ctx } = L;
    L.showMarker = false;
    L.fp = {
      log: [], active: new Map(), claims: { jon: null, lyman: null, odie: null }, counts: {}, cancels: 0, skips: 0,
      done: new Set(), pending: new Set(), watchdog: [], act: {}, nextRoll: 0, localAt: -99, lastLocal: {}, chaseAt: -99,
      knocks: 0, traps: 0, frees: 0,
    };
    hidePlates(L);
    const f = L.flags;
    f.sill = sillHelpers(L);
    f.cheeseHeld = 0; f.cheese = new Set();
    try {
      for (const id of ['soupBowl', 'coffeeMug', 'newTv', 'tvBox', 'furPile', 'spitballLauncher', 'plate2']) prop(ctx, id)?.setActive?.(false);
      prop(ctx, 'whistle')?.setActive?.(true);
      prop(ctx, 'bedroomDoor')?.open?.(); prop(ctx, 'lymanDoor')?.open?.();
      const fd = prop(ctx, 'frontDoor'); fd?.close?.(); fd?.setLocked?.(true);
    } catch (e) { console.warn('[fp2] props', e); }
    [L.mice, L.del] = await Promise.all([getCast(ctx, 'mice').catch(() => null), getCast(ctx, 'delivery').catch(() => null)]);
    try { L.mice?.show?.(false); L.mice?.stop?.(); } catch {}
    if (L.del) L.del.root.visible = false;
    ctx.ui?.hud?.set?.({ freePlay: 'Free Play' });
    for (const h of L.humans.list) { h.trapDoor = h.who === 'lyman' ? 'lymanDoor' : 'bedroomDoor'; h.chatter = (st) => chatter(L, h, st); baseline(L, h); }
    setupFood(L);
    setupOdieTricks(L);
    setupWindowVase(L);
    setupDoors(L);
    setupCupboard(L);
    setupCheese(L);
    setupCarpet(L);
    setupDresser(L);
    setupShed(L);
    setupMorning(L);
    L.ctx.events.on('humanReact', () => { L.fp.lastReact = L.t; });
    // test hooks (tools/sim/fp2.mjs)
    L.fp.api = { start: (id) => startEvent(L, id, { force: true }), end: (id) => endEvent(L, id), roll: (a, b) => roll(L, a, b), can: (id) => canStart(L, id),
      act: (who, name) => { const h = humanOf(L, who); if (!avail(h) || L.fp.claims[who]) return false; h.setOff(); h.leave(); nextActivity(L, h, name); return true; },
      director: (on) => { L.fp.nextRoll = on ? L.t + 5 : 1e9; }, odieGo: (k) => odieGo(L, k), odieNext: () => odieNext(L), events: EVENTS,
      excl: (a, b) => EVENTS[a].excl.has(b) };
  },
  start(L) {
    const { ctx } = L;
    L.fp.nextRoll = L.t + rnd(...FP2.firstRoll);
    L.odieAI.place(odieBowlSpot(ctx)); L.odieAI.face(apos(ctx, 'odieBowl', V()));
    L.odieAI.onScratch = () => scratchOdie(L);
    odieNext(L);
    for (const h of L.humans.list) { h.setOff(); h.leave(); }
    L.ly.place(apos(ctx, 'livingCentre', V(5.9, 0, 2.6)), Math.PI);
    L.jon.place(apos(ctx, 'kitchenCentre', V(6.6, 0, 7.6)), Math.PI);
    for (const h of L.humans.list) h.goHome();
    bark(L, 'fp2_g_start', { delay: 1.0, force: true });
  },
  update(L, dt) {
    const { fp } = L;
    if (L.t >= fp.nextRoll) { fp.nextRoll = L.t + rnd(...FP2.roll); roll(L); }
    for (const id of [...fp.pending]) if (!fp.active.has(id) && canStart(L, id) === true) { fp.pending.delete(id); startEvent(L, id, { trigger: true }); }
    for (const [id, ev] of fp.active) {
      try { EVENTS[id].update?.(L, ev, dt); } catch (e) { console.error('[fp2] event', id, e); ev.done = true; }
      if (ev.done || L.t > ev.until) endEvent(L, id);
    }
    updateHumans(L, dt);
    updateOdie(L, dt);
    updateTrapped(L);
    updateWindow(L);
    updateTableTricks(L, dt);
    updateCupCam(L);
    updateCarry(L);
    if ((fp.idleT = (fp.idleT ?? 30) - dt) <= 0) { fp.idleT = rnd(28, 45); if (!L.ctx.director?.active) bark(L, Math.random() < 0.6 ? 'fp2_g_idle' : 'fp_g_idle', { lowPri: true }); }
  },
  teardown(L) {
    const { ctx } = L;
    for (const id of [...(L.fp?.active?.keys() || [])]) { try { EVENTS[id].end?.(L, L.fp.active.get(id), true); } catch {} }
    showPlates(L);
    ctx.controller.animHold = false;
    ctx.ui?.hud?.set?.({ freePlay: null, hold: null, interactLabel: null });
    try { L.mice?.stop?.(); L.mice?.show?.(false); } catch {}
    if (L.del) L.del.root.visible = false;
    try { ctx.odie.setSocks?.(false); ctx.odie.root.visible = true; ctx.lyman?.setOutfit?.('normal'); ctx.lyman?.setFur?.(0); ctx.garfield.setBald?.(false); ctx.garfield.setSeethe?.(0); } catch {}
    try {
      prop(ctx, 'plate2')?.setActive?.(false); prop(ctx, 'soupBowl')?.reset?.(); prop(ctx, 'soupBowl')?.setActive?.(false);
      prop(ctx, 'window')?.close?.(); prop(ctx, 'curtains')?.wave?.(false); prop(ctx, 'table')?.warp?.(0);
      for (const id of ['bedroomDoor', 'lymanDoor', 'cupboardDoor', 'dresser', 'spitballLauncher', 'whistle', 'carpet', 'vase', 'biscuitBox', 'cheese', 'furPile']) prop(ctx, id)?.reset?.();
      prop(ctx, 'fridge')?.close?.(); prop(ctx, 'whistle')?.setActive?.(false);
      const fd = prop(ctx, 'frontDoor'); fd?.close?.(); fd?.setLocked?.(true);
      for (const s of SHED) prop(ctx, 'shedDecals')?.set?.(s.id, 0);
    } catch (e) { console.warn('[fp2] teardown', e); }
  },
});

// ------------------------------------------------------------------ event director
// uses: actors the event drives. excl: contradictory events (symmetric). once: at most once per session.
const EVENTS = {
  tvtime: { w: 3, uses: ['jon', 'lyman'], excl: ['mice', 'disco', 'dinner', 'soup', 'goodmorning'], dur: [55, 85], start: tvStart, end: releaseAll },
  dinner: { w: 2, uses: ['jon', 'lyman'], excl: ['soup', 'disco', 'goodmorning'], dur: [80, 110], start: dinnerStart, update: dinnerUpdate, end: dinnerEnd },
  soup: { w: 2, uses: ['jon'], excl: ['goodmorning'], dur: [60, 90], start: soupStart, update: soupUpdate, end: soupEnd },
  delivery: { w: 1.4, uses: ['jon'], excl: ['mice'], once: true, dur: [80, 80], start: deliveryStart, end: deliveryEnd },
  mice: { w: 0, uses: ['jon', 'lyman'], dur: [20, 24], start: miceStart, end: miceEnd },
  disco: { w: 1.3, uses: ['lyman'], dur: [60, 80], can: (L) => !L.flags.bald, start: discoStart, update: discoUpdate, end: discoEnd },
  shedding: { w: 1, uses: [], excl: ['disco', 'goodmorning'], dur: [90, 90], can: (L) => !L.flags.bald, start: shedStart, update: shedUpdate, end: shedEnd },
  goodmorning: { w: 1.2, uses: ['jon'], dur: [60, 60], start: gmStart, update: gmUpdate, end: gmEnd },
  zoomies: { w: 2, uses: ['odie'], excl: ['sill'], dur: [35, 45], start: zoomStart, end: odieRelease },
  sill: { w: 1.5, uses: ['odie'], dur: [35, 45], start: sillStart, end: odieRelease },
  brawl: { w: 0, uses: ['jon', 'lyman'], dur: [22, 22], start: brawlStart, end: brawlEnd },
};
for (const [id, e] of Object.entries(EVENTS)) { e.excl = new Set(e.excl || []); }
for (const [id, e] of Object.entries(EVENTS)) for (const x of e.excl) EVENTS[x].excl.add(id);

const humanOf = (L, who) => (who === 'jon' ? L.jon : who === 'lyman' ? L.ly : null);
function odieFree(L) { const f = L.flags; return !f.odieDown && !f.odieOut && !f.odieTrapped && !f.odieArc && L.odie.root.visible !== false; }
// true, or the reason it can't start
function canStart(L, id) {
  const e = EVENTS[id], fp = L.fp;
  if (fp.active.has(id)) return 'active';
  if (e.once && fp.done.has(id)) return 'once';
  if (e.can && !e.can(L)) return 'cannot';
  for (const a of fp.active.keys()) if (e.excl.has(a)) return 'excl:' + a;
  for (const u of e.uses) {
    if (fp.claims[u]) return 'claimed:' + u;
    if (u === 'odie' ? !odieFree(L) : !avail(humanOf(L, u))) return 'busy:' + u;
  }
  return true;
}
function logEv(L, kind, id, extra) { L.fp.log.push({ t: +L.t.toFixed(1), kind, id, ...(extra || {}) }); if (L.fp.log.length > 400) L.fp.log.shift(); }

function roll(L, fa, fb) {
  const { fp } = L;
  const pool = Object.entries(EVENTS).filter(([id, e]) => e.w > 0 && !fp.active.has(id) && !(e.once && fp.done.has(id)) && (!e.can || e.can(L))).map(([id, e]) => ({ id, w: e.w }));
  if (!pool.length && !fa) return;
  const a = fa ? { id: fa } : pickW(pool);
  const rest = pool.filter((x) => x.id !== a.id);
  const b = fb ? { id: fb } : fa ? null : rest.length && Math.random() < FP2.pair ? pickW(rest) : null;
  if (b && EVENTS[a.id].excl.has(b.id)) {
    // contradictory events rolled together cancel each other out
    fp.cancels++;
    logEv(L, 'cancelPair', a.id, { other: b.id });
    bark(L, 'fp2_g_cancel', { chance: 0.5 });
    return;
  }
  for (const x of [a, b].filter(Boolean)) {
    const ok = canStart(L, x.id);
    if (ok === true) startEvent(L, x.id);
    else if (String(ok).startsWith('excl')) { fp.cancels++; logEv(L, 'cancel', x.id, { why: ok }); }
    else { fp.skips++; logEv(L, 'skip', x.id, { why: ok }); }
  }
}

function startEvent(L, id, { force = false, trigger = false } = {}) {
  const { fp } = L, e = EVENTS[id];
  if (force) {
    if (fp.active.has(id)) return false;
    for (const a of [...fp.active.keys()]) if (e.excl.has(a) || e.uses.some((u) => fp.claims[u] === a)) endEvent(L, a);
  }
  const ok = canStart(L, id);
  if (ok !== true && !(force && /^busy/.test(ok))) { if (trigger) fp.pending.add(id); return false; }
  const ev = { id, t0: L.t, until: L.t + rnd(...e.dur), data: {}, done: false };
  fp.active.set(id, ev);
  for (const u of e.uses) fp.claims[u] = id;
  fp.counts[id] = (fp.counts[id] || 0) + 1;
  if (e.once) fp.done.add(id);
  logEv(L, 'start', id, trigger ? { trigger } : null);
  try { e.start(L, ev); } catch (err) { console.error('[fp2] start', id, err); ev.done = true; }
  return true;
}

function endEvent(L, id) {
  const { fp } = L, ev = fp.active.get(id);
  if (!ev) return;
  fp.active.delete(id);
  for (const u of Object.keys(fp.claims)) if (fp.claims[u] === id) fp.claims[u] = null;
  try { EVENTS[id].end?.(L, ev, false); } catch (e) { console.error('[fp2] end', id, e); }
  logEv(L, 'end', id, { dur: +(L.t - ev.t0).toFixed(1) });
}

// event-owned human: its home routine is the event's; released → back to their own day
function drive(L, h, fn) { h.setHome({ type: 'custom', fn }); goNow(L, h); }
function goNow(L, h) {
  if (!avail(h)) return;
  if (h.seated()) h.run('fpStand', async (t) => { await h.standUp(t); h.goHome(); });
  else h.goHome();
}
function release(L, h) {
  if (!h) return;
  h.eatClip = null;
  try { h.actor.holdProp?.(null); } catch {}
  baseline(L, h);
  L.fp.act[h.who] = null;
  goNow(L, h);
}
function releaseAll(L, ev) { for (const u of EVENTS[ev.id].uses) if (u !== 'odie' && (!L.fp.claims[u] || L.fp.claims[u] === ev.id)) release(L, humanOf(L, u)); }

// ------------------------------------------------------------------ the humans' own day
function baseline(L, h) { h.setHome({ type: 'custom', fn: () => nextActivity(L, h) }); }
function nextActivity(L, h, force) {
  const { ctx, fp } = L;
  const isJon = h.who === 'jon';
  const room = isJon ? apos(ctx, 'bedroomCentre', V(3.4, 3, 4.2)) : apos(ctx, 'lymanRoom', V(4.6, 3, 9));
  const doorOpen = prop(ctx, h.trapDoor)?.state?.open !== false;
  const other = isJon ? L.ly : L.jon;
  const acts = [
    { id: 'wander', w: 3 }, { id: 'sofa', w: 3 }, { id: 'coffee', w: 2 },
    { id: 'room', w: doorOpen && reach(ctx.world.nav, h.pos(), room) ? 1.4 : 0 },
    { id: 'lounge', w: other && fp.act[other.who]?.name === 'lounge' ? 0 : 1 },
  ].filter((a) => a.w > 0 && a.id !== fp.act[h.who + '_last']);
  const a = force ? { id: force } : pickW(acts);
  fp.act[h.who + '_last'] = a.id;
  fp.act[h.who] = { name: a.id, until: L.t + rnd(...({ wander: [25, 45], sofa: [30, 55], coffee: [25, 40], room: [25, 40], lounge: [25, 40] })[a.id]) };
  h.eatClip = null;
  try { h.actor.holdProp?.(null); } catch {}
  if (a.id === 'wander') { h.wander(); if (Math.random() < 0.4) bark(L, isJon ? 'fp2_j_wander' : 'fp2_l_wander', { delay: 2, lowPri: true }); }
  else if (a.id === 'sofa') {
    const coffee = !isJon && Math.random() < 0.5;
    h.sitOn(isJon ? 'sofaSeatL' : 'sofaSeatR', coffee ? 'drink_coffee' : 'watch_tv');
    if (coffee) L.later(3, () => { if (h.state === 'sofa') try { h.actor.holdProp?.('mug'); } catch {} });
  } else if (a.id === 'coffee') {
    h.eatClip = 'drink_coffee';
    h.goSit();
    L.later(4, () => { if (h.state === 'sitEat') { try { h.actor.holdProp?.('mug'); } catch {} bark(L, isJon ? 'fp2_j_coffee' : 'fp2_l_coffee', { lowPri: true }); } });
  } else if (a.id === 'lounge') h.sitOn('loungeChair', 'sit', 'lounge');
  else {
    h.run('fpRoom', async (t) => {
      await t.walkTo(room.clone().add(V(rnd(-0.4, 0.4), 0, rnd(-0.4, 0.4))), { arrive: 0.35 });
      t.say(isJon ? 'fp2_j_room' : 'fp2_l_room');
      for (;;) await t.play(any(['investigate', 'scratch_head', 'idle', 'sigh']), rnd(3, 5), { fallback: 'idle' });
    });
    if (!isJon) L.later(1, () => bark(L, 'fp2_l_room', { lowPri: true }));
  }
}
function chatter(L, h, st) {
  const isJon = h.who === 'jon', act = L.fp.act[h.who]?.name, ev = L.fp.claims[h.who];
  const key = st === 'sofa' ? (isJon ? any(['c2_j_watch', 'c2_j_idle']) : any(['c2_l_telly', 'l_idle']))
    : st === 'sitEat' ? (ev === 'dinner' ? (isJon ? 'j_eat' : 'l_eat') : act === 'coffee' ? (isJon ? 'fp2_j_coffee' : 'fp2_l_coffee') : null)
    : st === 'wander' ? (isJon ? any(['fp2_j_wander', 'c2_j_idle', 'j_wander']) : any(['fp2_l_wander', 'l_idle']))
    : st === 'fpRoom' ? (isJon ? 'fp2_j_room' : 'fp2_l_room') : null;
  if (key) bark(L, key, { lowPri: true });
}

function updateHumans(L) {
  const { fp, ctx } = L;
  for (const h of L.humans.list) {
    const a = fp.act[h.who];
    if (!fp.claims[h.who] && a && L.t > a.until && ACT_STATES.has(h.state) && avail(h)) { fp.act[h.who] = null; goNow(L, h); }
    // stuck guards (the soak test reports how often these fire)
    if (TRANSIT.has(h.state) && h.stateT > 40) watchdog(L, h.who + ':transit:' + h.state, () => { h.setOff(); h.leave(); h.goHome(); });
    else if (h.state === 'off' && h.stateT > 6) watchdog(L, h.who + ':off', () => h.goHome());
    const p = h.pos();
    if (p.x < BOUNDS.x0 - 1 || p.x > BOUNDS.x1 + 1 || p.z < BOUNDS.z0 - 1.5 || p.z > BOUNDS.z1 + 1 || p.y < -0.3 || p.y > 3.6) {
      if (!doing(h, LOCKED_TASKS)) watchdog(L, h.who + ':outside', () => { h.place(apos(ctx, 'livingCentre', V(5.9, 0, 2.6)), 0); h.goHome(); });
    }
  }
}
function watchdog(L, what, fix) {
  const w = L.fp.watchdog;
  if (w.length && w[w.length - 1].what === what && L.t - w[w.length - 1].t < 3) return;
  w.push({ t: +L.t.toFixed(1), what });
  try { fix(); } catch (e) { console.warn('[fp2] watchdog', what, e); }
}

// "Naughty Garfield!" — both chase for 10 s (only if they're free; at most every 20 s)
function naughty(L, chance = 1) {
  const { fp } = L;
  if (L.t - fp.chaseAt < 20 || Math.random() > chance) return;
  if (!avail(L.jon) || fp.claims.jon === 'delivery' || L.humans.chasing()) return;
  fp.chaseAt = L.t;
  fp.chases = (fp.chases || 0) + 1;
  logEv(L, 'chase', 'naughty');
  naughtyChase(L);
}

// ------------------------------------------------------------------ TV time + the spit-ball brawl
function tvStart(L, ev) {
  const { jon, ly, ctx } = L;
  drive(L, jon, () => jon.sitOn('sofaSeatL', 'watch_tv'));
  drive(L, ly, () => { ly.sitOn('sofaSeatR', 'drink_coffee'); L.later(3, () => { if (ly.state === 'sofa') try { ctx.lyman.holdProp?.('mug'); } catch {} }); });
  bark(L, 'fp2_j_tv', { delay: 1.5 });
  if (odieFree(L) && !L.fp.claims.odie) odieGo(L, 'sofa');
  void ev;
}
function brawlStart(L, ev) {
  const { ctx, jon, ly, odieAI } = L;
  const mid = apos(ctx, 'sofaFoot', V(3, 0, 2.75)).setY(0);
  const jp = mid.clone().add(V(0, 0, -0.45)), lp = mid.clone().add(V(0, 0, 0.45));
  ctx.audio?.sfx?.('thwip');
  try { ctx.lyman.play?.('spill'); prop(ctx, 'coffeeMug')?.setActive?.(true); prop(ctx, 'coffeeMug')?.spill?.(V(0, 0, -1)); } catch {}
  ev.data.mid = mid;
  const fight = (h, spot, faceP, lines, clips) => h.run('fpBrawl', async (t) => {
    await t.wait(h === jon ? 0.5 : 0.1);
    if (h === jon) { t.loop('spilled_on', { fallback: 'idle' }); t.say('c2_j_l6_coffee', { force: true }); await t.wait(1.2); }
    await h.standUp(t);
    try { h.actor.holdProp?.(null); } catch {}
    await t.walkTo(spot, { arrive: 0.12, speed: 1.6 });
    await t.face(faceP, 0.25);
    for (let i = 0; L.t - ev.t0 < 14; i++) {
      if (i === 2) t.say(lines[0], { force: true });
      if (i === 5) t.say(lines[1], { force: true });
      if (i % 3 === 2) ctx.audio?.sfx?.('brawl', { vol: 0.6 });
      await t.play(clips[i % clips.length], 0.75, { fallback: 'talk_angry' });
    }
    t.loop('brawl_tangle', { fallback: 'talk_angry' });
    await t.wait(Math.max(0.1, 15 - (L.t - ev.t0)));
    t.say(h === jon ? 'fp2_j_makeup' : 'fp2_l_makeup', { force: true, delay: h === jon ? 0 : 2.2 });
    await t.play('hug', 3.0, { fallback: 'idle' });
    ev.data.madeUp = true;
    t.loop('idle');
    await t.wait(30);
  }, { interruptible: false });
  fight(jon, jp, lp, ['c2_j_l6_brawl', 'j_chase'], ['brawl_slap', 'brawl_dodge', 'brawl_hit', 'brawl_slap']);
  fight(ly, lp, jp, ['c2_l_l6_brawl', 'l_chase'], ['brawl_kick', 'brawl_hit', 'brawl_slap', 'brawl_dodge']);
  L.later(2.2, () => { ctx.audio?.sfx?.('brawl'); ctx.camera?.shake?.(0.06); });
  L.later(3.5, () => { if (odieFree(L)) odieAI.run('fpKicked', async (t) => { await t.walkTo(mid.clone().add(V(0.7, 0, 0)), { speed: 2 }); odieAI.noise('o_growl_play'); t.loop('bark'); await t.wait(8); odieNext(L); }); });
  bark(L, 'c2_g_l6_win', { delay: 5.5, force: true });
  bark(L, 'fp2_g_brawl', { delay: 12, force: true });
  ev.until = L.t + 21;
}
function brawlEnd(L, ev) {
  try { prop(L.ctx, 'coffeeMug')?.reset?.(); prop(L.ctx, 'coffeeMug')?.setActive?.(false); } catch {}
  for (const h of [L.jon, L.ly]) if (doing(h, 'fpBrawl')) h.setOff();
  releaseAll(L, ev);
}

// ------------------------------------------------------------------ meals: dinner for two / Jon's chicken soup
function setupFood(L) {
  const { ctx, flags: f } = L;
  const belly = (d) => { const c = ctx.controller; c.setBelly(Math.min(1, c.belly + d)); ctx.save.data.belly = c.belly; ctx.ui?.hud?.set?.({ belly: c.belly }); };
  const seatedAt = (h) => h && h.state === 'sitEat' && h.seated();
  for (const [id, who] of [['plate', 'jon'], ['plate2', 'lyman']]) {
    L.eatSpot({ id: 'fp_' + id, pos: () => plateP(ctx, id), prop: () => prop(ctx, id), radius: 0.6, heightTol: 0.45,
      enabled: () => f['food_' + id] && (f.ew || !seatedAt(humanOf(L, who))),
      onDone: () => { f['food_' + id] = false; belly(0.1); bark(L, 'fp2_g_eat', { force: true }); L.fp.eaten = (L.fp.eaten || 0) + 1; } });
  }
  ctx.interact.register({ id: 'fp_splash', radius: 0.6, heightTol: 0.45, markerHeight: 0.3, label: 'Splash the soup!',
    getPos: (o) => (o || V()).copy(soupPos(ctx)),
    enabled: () => L.fp.active.has('soup') && f.soupFull && !f.splashed && L.onTable() && seatedAt(L.jon),
    onInteract: () => splashSoup(L) });
  L.eatSpot({ id: 'fp_soup', pos: () => soupPos(ctx), prop: () => prop(ctx, 'soupBowl'), radius: 0.55, heightTol: 0.45, label: 'Slurp!',
    enabled: () => f.soupFull && !seatedAt(L.jon),
    onDone: () => { f.soupFull = false; belly(0.05); bark(L, 'fp2_g_soup', { force: true }); L.fp.eaten = (L.fp.eaten || 0) + 1; } });
  L.eatSpot({ id: 'fp_catBowl', pos: () => apos(ctx, 'catBowl', V(6.7, 0, 9.7)), prop: () => prop(ctx, 'catBowl'), radius: 0.45,
    enabled: () => !f.catBowlEmpty,
    onDone: () => { f.catBowlEmpty = true; bark(L, 'fp2_g_bowl', { force: true }); L.later(60, () => { f.catBowlEmpty = false; try { prop(ctx, 'catBowl')?.eaten?.(0); } catch {} }); } });
  // Odie's bowl: only while he isn't standing at it
  ctx.interact.register({ id: 'fp_odieBowl', radius: 0.45, heightTol: 0.5, markerHeight: 0.35,
    get label() { return L.odieAI && L.odieAI.distTo(odieBowlSpot(ctx)) < 0.7 && odieFree(L) ? "Odie's guarding it!" : 'Eat!'; },
    getPos: (o) => (o || V()).copy(apos(ctx, 'odieBowl', V(7.35, 0, 9.75))),
    enabled: () => !f.odieBowlEmpty && !f.eatingDog,
    onInteract: async () => {
      if (L.odieAI.distTo(odieBowlSpot(ctx)) < 0.7 && odieFree(L)) { bark(L, 'fp2_g_guard', { force: true }); return; }
      f.eatingDog = true;
      const c = ctx.controller, g = ctx.garfield, b = apos(ctx, 'odieBowl', V());
      c.lock(true);
      g.root.rotation.y = Math.atan2(b.x - c.pos.x, b.z - c.pos.z);
      try { g.play?.('eat', { once: true }); } catch {}
      for (let t = 0; t < 2.2; t += 0.1) { await new Promise((r) => setTimeout(r, 100)); try { prop(ctx, 'odieBowl')?.eaten?.(t / 2.2); } catch {} }
      ctx.audio?.sfx?.('gulp');
      c.lock(false);
      f.eatingDog = false; f.odieBowlEmpty = true; belly(0.05);
      L.say('c2_g_l1_dogfood', { force: true });
      L.fp.eaten = (L.fp.eaten || 0) + 1;
      L.later(60, () => { f.odieBowlEmpty = false; try { prop(ctx, 'odieBowl')?.eaten?.(0); } catch {} });
    } });
}
function dinnerStart(L, ev) {
  const { ctx, flags: f, jon, ly } = L;
  for (const id of ['plate', 'plate2']) {
    const p = prop(ctx, id);
    try { if (id === 'plate2') p?.setActive?.(true); if (p?.root) p.root.visible = true; p?.setFood?.('steak'); p?.eaten?.(0); } catch {}
    f['food_' + id] = true;
  }
  f.ew = false;
  for (const h of [jon, ly]) drive(L, h, () => { h.eatClip = null; h.goSit(); });
  bark(L, 'fp2_j_dinner', { force: true, delay: 0.5 });
  bark(L, 'fp2_l_dinner', { delay: 3 });
  void ev;
}
function dinnerUpdate(L, ev) {
  const { ctx, flags: f } = L;
  if (!f.ew && L.onTable() && ['plate', 'plate2'].some((id) => f['food_' + id] && flat(ctx.controller.pos, plateP(ctx, id)) < 0.55)
    && [L.jon, L.ly].some((h) => h.state === 'sitEat')) {
    // cat feet in the peas: "Ew!", they leave it for the telly (Ch2 L1)
    f.ew = true;
    logEv(L, 'ew', 'dinner');
    L.say('c2_j_l1_ew', { force: true }); L.say('c2_l_l1_ew', { force: true, delay: 0.3 });
    for (const [h, seat, line, d] of [[L.jon, 'sofaSeatL', 'c2_j_l1_nomore', 0.4], [L.ly, 'sofaSeatR', 'c2_l_l1_nomore', 2.4]]) {
      h.setHome({ type: 'custom', fn: () => h.sitOn(seat, 'watch_tv') });
      if (!avail(h)) continue;
      h.run('fpEw', async (t) => { try { h.actor.setExpression?.('shock'); } catch {} await h.standUp(t); await t.wait(d); t.say(line, { force: true }); await t.wait(1); h.goHome(); });
    }
    ev.until = Math.min(ev.until, L.t + 45);
  }
  if (!f.food_plate && !f.food_plate2) ev.done = true;
}
function dinnerEnd(L, ev) {
  const { ctx, flags: f } = L;
  f.food_plate = f.food_plate2 = false; f.ew = false;
  try { prop(ctx, 'plate2')?.setActive?.(false); const p = prop(ctx, 'plate'); if (p?.root) p.root.visible = false; } catch {}
  releaseAll(L, ev);
}
function soupStart(L, ev) {
  const { ctx, flags: f, jon } = L;
  try { const s = prop(ctx, 'soupBowl'); s?.reset?.(); s?.setActive?.(true); s?.eaten?.(0); } catch {}
  f.soupFull = true; f.splashed = false;
  drive(L, jon, () => { jon.eatClip = 'eat_soup'; jon.goSit(); });
  bark(L, 'fp2_j_soup', { delay: 3 });
  L.later(9, () => { if (L.fp.active.get('soup') === ev && jon.state === 'sitEat') L.say('c2_j_l3_soup'); });
}
function soupUpdate(L, ev) { if (!L.flags.soupFull && !L.flags.splashed && L.jon.state !== 'sitEat') ev.done = true; }
function soupEnd(L, ev) {
  const { ctx, flags: f } = L;
  f.soupFull = false;
  L.later(f.splashed ? 8 : 0.5, () => { if (!L.fp.active.has('soup')) try { prop(ctx, 'soupBowl')?.reset?.(); prop(ctx, 'soupBowl')?.setActive?.(false); } catch {} });
  if (!doing(L.jon, 'fpSplash')) releaseAll(L, ev);
  else L.fp.claims.jon = null;
}
function splashSoup(L) {
  const { ctx, jon, flags: f } = L;
  f.splashed = true; f.soupFull = false;
  logEv(L, 'splash', 'soup');
  try { ctx.garfield.play?.('interact', { once: true }); } catch {}
  ctx.audio?.sfx?.('splash');
  try { prop(ctx, 'soupBowl')?.splash?.(); } catch {}
  jon.run('fpSplash', async (t) => {
    t.say('c2_j_l3_splash', { force: true });
    try { ctx.jon.setExpression?.('pain'); } catch {}
    await t.play('spilled_on', 1.4, { fallback: 'sit' });
    await jon.standUp(t);
    const sink = apos(ctx, 'counter', V(3.6, 0, 10.7)).setY(0); sink.z -= 0.75;
    await t.walkTo(sink, { arrive: 0.3 });
    t.say('c2_j_l3_dab', { force: true });
    await t.play('wipe', 8, { loop: true, fallback: 'scratch_head' });
    const ev = L.fp.active.get('soup');
    if (ev) ev.done = true;
    release(L, jon);
  });
}

// ------------------------------------------------------------------ delivery: the new TV (once per session)
function deliveryStart(L, ev) {
  const { ctx, jon } = L;
  const del = L.del, box = prop(ctx, 'tvBox'), fd = prop(ctx, 'frontDoor');
  const doorIn = apos(ctx, 'doorInside', V(7.1, 0, 1)), step = apos(ctx, 'doorStep', V(7.1, 0, -0.95));
  ctx.audio?.sfx?.('doorbell'); ctx.audio?.sfx?.('knock');
  bark(L, 'fp2_g_delivery', { delay: 2.5 });
  const task = () => jon.run('fpDelivery', async (t) => {
    t.say('fp2_j_delivery', { force: true });
    await jon.standUp(t);
    await t.walkTo(doorIn, { arrive: 0.25 });
    await t.face(step);
    try { fd?.setLocked?.(false); fd?.open?.(); } catch {}
    ctx.audio?.sfx?.('door');
    if (del) {
      del.root.position.copy(step); del.root.rotation.set(0, Math.PI, 0); del.root.visible = true;
      try { box?.setActive?.(true); del.holdProp?.('box', box?.root); del.play?.('carry_box'); } catch {}
      L.say('d_l5_sign', { force: true });
      await t.wait(2.4);
      try { del.play?.('hand_over', { once: true }); } catch {}
      await t.wait(1.2);
      try { del.dropProp?.(); del.holdProp?.(null); ctx.jon.holdProp?.('box', box?.root); } catch {}
    } else { try { box?.setActive?.(true); ctx.jon.holdProp?.('box', box?.root); } catch {} }
    t.loop('carry_box', { fallback: 'carry' });
    t.say('c2_j_l5_tv', { force: true });
    await t.wait(1.8);
    if (del) { L.say('d_l5_bye', { force: true }); await t.wait(1.6); del.root.visible = false; }
    try { fd?.close?.(); fd?.setLocked?.(true); } catch {}
    ctx.audio?.sfx?.('door');
    const tvFront = apos(ctx, 'tvBoxSpot', V(5.6, 0, 1.3)).setY(0);
    await t.walkTo(tvFront.clone().add(V(0.5, 0, 0)), { arrive: 0.2 });
    try { ctx.jon.holdProp?.(null); if (box?.root) { ctx.world.scene.attach(box.root); box.root.position.copy(tvFront); box.root.rotation.set(0, 0, 0); } } catch {}
    await t.face(tvFront);
    try { box?.open?.(); } catch {}
    await t.play('unbox', 2.6, { fallback: 'investigate' });
    swapTv(L);
    t.say('c2_j_l5_swap', { force: true });
    await t.play('scratch_head', 1.2, { fallback: 'idle' });
    ev.done = true;
  }, { interruptible: false });
  drive(L, jon, task);
}
function swapTv(L) {
  const { ctx, flags: f } = L;
  if (f.swapped) return;
  try { ctx.world.swapTv?.(); prop(ctx, 'tvBox')?.setActive?.(false); } catch (e) { console.warn('[fp2] swapTv', e); }
  f.swapped = true;
  logEv(L, 'swap', 'delivery');
  // Odie can't resist the old telly
  if (odieFree(L) && !L.fp.claims.odie) odieGo(L, 'oldTv');
}
function deliveryEnd(L, ev) {
  const { ctx } = L;
  if (L.del) L.del.root.visible = false;
  try { const fd = prop(ctx, 'frontDoor'); fd?.close?.(); fd?.setLocked?.(true); ctx.jon.holdProp?.(null); } catch {}
  swapTv(L);
  if (doing(L.jon, 'fpDelivery')) L.jon.setOff();
  releaseAll(L, ev);
}

// ------------------------------------------------------------------ cheese → mice night
function setupCheese(L) {
  const { ctx, flags: f } = L;
  const spots = [0, 1, 2, 3, 4, 5].map((i) => apos(ctx, 'cheese' + i)).filter(Boolean);
  const holes = [0, 1, 2, 3].map((i) => apos(ctx, 'mouseHole' + i)).filter(Boolean);
  f.holes = holes;
  const fridge = () => prop(ctx, 'fridge');
  ctx.interact.register({ id: 'fp_fridge', radius: 0.85, heightTol: 0.5,
    get label() { return fridge()?.state?.open ? 'Close the fridge' : f.cheeseHeld ? 'Open the fridge' : 'Get some cheese'; },
    getPos: (o) => (o || V()).copy(apos(ctx, 'fridgeFront', V(5.67, 0, 10.3))),
    enabled: () => !f.fridgeBusy,
    onInteract: async () => {
      f.fridgeBusy = true;
      ctx.audio?.sfx?.('fridge');
      try { ctx.garfield.play?.('interact', { once: true }); } catch {}
      if (fridge()?.state?.open) { try { await fridge()?.close?.(); } catch {} }
      else {
        try { await fridge()?.open?.(); } catch {}
        if (!f.cheeseHeld) { f.cheeseHeld = 3; L.say('c2_g_l5_cheese', { force: true, delay: 0.4 }); }
        else L.say('fp1_g_fridge', { delay: 0.6, chance: 0.6 });
      }
      f.fridgeBusy = false;
    } });
  spots.forEach((p, i) => ctx.interact.register({ id: 'fp_cheese' + i, radius: 0.6, heightTol: 0.5, label: 'Put the cheese down', getPos: (o) => (o || V()).copy(p),
    enabled: () => f.cheeseHeld > 0 && !f.cheese.has(i) && !L.fp.active.has('mice'),
    onInteract: () => {
      f.cheese.add(i); f.cheeseHeld--;
      try { ctx.garfield.play?.('interact', { once: true }); prop(ctx, 'cheese')?.setActive?.(true); prop(ctx, 'cheese')?.put?.(i); } catch {}
      ctx.audio?.sfx?.('pop');
      if (f.cheese.size === 1) L.say('c2_g_l5_place', { force: true });
      if (f.cheese.size >= 2 && !L.fp.active.has('mice')) { if (!startEvent(L, 'mice', { trigger: true })) logEv(L, 'queued', 'mice'); }
    } }));
}
function miceStart(L, ev) {
  const { ctx, jon, ly } = L;
  try { L.mice?.show?.(true); L.mice?.wander?.({ min: V(0.6, 0, 0.6), max: V(8.0, 0, 10.4) }); } catch {}
  ctx.audio?.sfx?.('squeak');
  L.say('c2_j_l5_mice', { force: true });
  L.say('c2_l_l5_mice', { force: true, delay: 2.2 });
  bark(L, 'fp2_g_mice', { delay: 5 });
  const pts = [V(2.0, 0, 1.5), V(5.5, 0, 1.6), V(6.0, 0, 4.4), V(3.0, 0, 4.2), V(2.2, 0, 7.0), V(6.3, 0, 7.2), V(5.0, 0, 10.0)];
  for (const [h, line] of [[jon, 'c2_j_l5_chase'], [ly, 'c2_l_l5_chase']]) drive(L, h, () => h.run('fpMice', async (t) => {
    await h.standUp(t);
    for (;;) {
      await t.walkTo(any(pts), { speed: 2.0, arrive: 0.4 });
      await t.play('catch_mouse', 1.0, { fallback: 'investigate' });
      if (Math.random() < 0.35) t.say(line);
    }
  }));
  void ev;
}
function miceEnd(L, ev) {
  const { ctx, flags: f } = L;
  try { L.mice?.stop?.(); L.mice?.show?.(false); for (const i of f.cheese) prop(ctx, 'cheese')?.remove?.(i); } catch {}
  f.cheese.clear();
  L.say('fp2_j_mice_end', { force: true });
  bark(L, 'fp2_j_mice_end', { force: true });
  releaseAll(L, ev);
}

// ------------------------------------------------------------------ carpet pull (after the delivery)
function setupCarpet(L) {
  const { ctx, flags: f } = L;
  ctx.interact.register({ id: 'fp_carpet', radius: 0.7, heightTol: 0.5, markerHeight: 0.4,
    get label() { return watchingTv(L) ? 'Too many eyes…' : 'Grip the carpet!'; },
    getPos: (o) => (o || V()).copy(apos(ctx, 'carpetEdge', V(1.12, 0, 3.98))),
    enabled: () => f.swapped && !f.pulled,
    onInteract: () => { if (watchingTv(L)) { L.say('c2_g_l5_eyes', { force: true }); return; } pullCarpet(L); } });
}
function watchingTv(L) { return !L.fp.active.has('mice') && L.humans.list.some((h) => h.state === 'sofa' && h.actor.root.visible !== false); }
function pullCarpet(L) {
  const { ctx, flags: f, odieAI } = L;
  f.pulled = true;
  logEv(L, 'carpet', 'pull');
  const carpet = prop(ctx, 'carpet');
  const hit = odieFree(L) && flat(L.odie.root.position, apos(ctx, 'oldTvSpot', V(1.17, 0, 2.75))) < 1.8 && L.odie.root.position.y < 0.3;
  const target = hit ? L.odie.root.position.clone().add(V(0, 0.3, 0)) : null;
  if (hit) { odieAI.run('fpBrace', async (t) => { t.loop('idle_pant'); await t.wait(5); }); f.odieDown = true; }
  try { ctx.garfield.play?.('pull', { once: true }); } catch {}
  ctx.audio?.sfx?.('carpet');
  Promise.resolve(carpet?.pull?.(target ? { target } : {})).catch(() => {});
  L.later(1.3, () => {
    ctx.audio?.sfx?.('tvthud');
    ctx.camera?.shake?.(0.15);
    if (hit) {
      knockOdie(L, 'flattened', 'o_whimper');
      bark(L, Math.random() < 0.5 ? 'c2_g_l5_win' : 'fp2_g_carpet', { force: true, delay: 1 });
      L.later(2.5, () => { if (avail(L.ly)) bark(L, 'fp2_l_odie', { force: true }); naughty(L, 0.5); });
    } else bark(L, 'fp2_g_carpet_miss', { force: true, delay: 0.8 });
  });
  // put the old telly back on the carpet for next time
  L.later(14, () => {
    try { carpet?.reset?.(); const a = A(ctx, 'oldTvSpot'); if (a) prop(ctx, 'tv')?.moveTo?.(a); } catch (e) { console.warn('[fp2] carpet reset', e); }
    f.pulled = false;
  });
}

// ------------------------------------------------------------------ Odie
function odieGo(L, kind) {
  const { ctx, odieAI } = L;
  const f = L.flags;
  const here = L.odie.root.position;
  const nav = ctx.world.navPet || ctx.world.nav;
  const okTo = (p) => reach(nav, here, p);
  const dur = rnd(18, 30);
  const finish = () => { if (!L.dead) odieNext(L); };
  f.odieAct = kind;
  if (f.odieOnTable && kind !== 'table') return hopDown(L, () => odieGo(L, kind));
  if (kind === 'bowl') {
    const p = odieBowlSpot(ctx);
    if (!okTo(p)) return odieSitHere(L, dur);
    return odieAI.run('fpBowl', async (t) => { await t.walkTo(p, { speed: 1.2 }); odieAI.face(apos(ctx, 'odieBowl', V())); t.loop('eat'); await t.wait(dur); finish(); });
  }
  if (kind === 'table' && !f.odieOnTable && !okTo(tableSpots(ctx).floor)) return odieGo(L, 'roam');
  if (kind === 'table') return odieAI.run('fpTable', async (t) => { await hopUpTask(L, t); t.loop('idle_pant'); if (Math.random() < 0.5) bark(L, 'fp2_g_odie_table', { delay: 1 }); await t.wait(dur); await hopDownTask(L, t); finish(); });
  if (kind === 'oldTv' && f.swapped) {
    const p = oldTvOdie(ctx);
    if (!okTo(p)) return odieSitHere(L, dur);
    return odieAI.run('fpOldTv', async (t) => { await t.walkTo(p, { speed: 1.4 }); L.odie.root.rotation.y = Math.PI / 2; t.loop('idle_pant'); await t.wait(dur); finish(); });
  }
  if (kind === 'follow') return odieAI.run('fpFollow', async (t) => {
    for (let i = 0; i < 3; i++) {
      const g = ctx.controller.pos.clone();
      if (Math.abs(g.y - here.y) > 1 || g.y > 0.5) break;
      const p = g.clone().setY(0).add(V(rnd(-0.6, 0.6), 0, rnd(-0.6, 0.6)));
      if (!okTo(p)) break;
      await t.walkTo(p, { speed: 1.6, arrive: 0.5 });
      odieAI.face(g);
      await t.play(any(['sniff', 'lick', 'idle_pant']), rnd(2, 3.5), { fallback: 'idle_pant' });
    }
    finish();
  });
  if (kind === 'upstairs') {
    const p = apos(ctx, 'odieBed', V(4.9, 3, 10.35)).add(V(0, 0, -0.6));
    if (prop(ctx, 'lymanDoor')?.state?.open === false || !okTo(p)) return odieGo(L, 'roam');
    return odieAI.run('fpUpstairs', async (t) => { await t.walkTo(p, { speed: 1.3 }); t.loop('sit_pant'); await t.wait(dur); finish(); });
  }
  const spots = { sill: 'odieSill', sofa: 'sofaFoot' };
  if (spots[kind]) {
    const p = apos(ctx, spots[kind], V(3, 0, 2.75));
    if (!okTo(p)) return odieSitHere(L, dur);
    return odieAI.run('fp_' + kind, async (t) => { await t.walkTo(p, { speed: 1.2 }); const a = A(ctx, spots[kind]); if (a?.rotY != null) L.odie.root.rotation.y = a.rotY; t.loop('sit_pant'); await t.wait(dur); finish(); });
  }
  // roam: a few sniffs about the ground floor
  return odieAI.run('fpRoam', async (t) => {
    const names = ['livingCentre', 'kitchenCentre', 'doorInside', 'tvBoxSpot', 'sofaFoot', 'odieTableSide', 'cupboardFront'];
    for (let i = 0; i < 3; i++) {
      const p = apos(ctx, any(names), V(5.9, 0, 2.6)).setY(0).add(V(rnd(-0.4, 0.4), 0, rnd(-0.4, 0.4)));
      if (!okTo(p)) continue;
      await t.walkTo(p, { speed: Math.random() < 0.3 ? 2.4 : 1.1 });
      await t.play(any(['sniff', 'idle_pant', 'bark']), rnd(1.5, 3), { fallback: 'idle' });
    }
    finish();
  });
}
function odieSitHere(L, dur) { L.odieAI.run('fpSit', async (t) => { t.loop('sit_pant'); await t.wait(Math.min(dur, 8)); odieNext(L); }); }
function odieNext(L) {
  const f = L.flags;
  if (L.dead || !odieFree(L) || L.fp.claims.odie) return;
  const up = upstairs(L.odie.root.position);
  const opts = [
    { id: 'bowl', w: up ? 0.5 : 2 }, { id: 'sill', w: 1 }, { id: 'sofa', w: 1.5 }, { id: 'roam', w: 2 }, { id: 'follow', w: 1 },
    { id: 'table', w: 1 }, { id: 'oldTv', w: f.swapped ? 2 : 0 }, { id: 'upstairs', w: up ? 0 : 0.4 },
  ].filter((o) => o.w > 0 && o.id !== f.odieAct);
  odieGo(L, pickW(opts).id);
}
function odieRelease(L) { if (L.flags.odieOnTable && odieFree(L)) hopDown(L, () => odieNext(L)); else odieNext(L); }

async function hopUpTask(L, t) {
  const { ctx, odieAI } = L;
  const s = tableSpots(ctx);
  await t.walkTo(s.floor, { speed: 1.6 });
  odieAI.clip('jump_up', { once: true, force: true });
  const from = L.odie.root.position.clone();
  await t.tween((k) => { L.odie.root.position.lerpVectors(from, s.near, k); L.odie.root.position.y = from.y + (s.y - from.y) * k + Math.sin(k * Math.PI) * 0.35; }, 0.45);
  L.flags.odieOnTable = true;
  const e0 = L.odie.root.position.clone();
  odieAI.face(s.edge);
  odieAI.clip('walk', { force: true });
  await t.tween((k) => L.odie.root.position.lerpVectors(e0, s.edge, k), Math.max(0.3, flat(e0, s.edge) / 0.9));
  L.odie.root.rotation.y = A(ctx, 'odieTableEdge')?.rotY ?? Math.PI;
}
async function hopDownTask(L, t) {
  const { ctx, odieAI } = L;
  const s = tableSpots(ctx);
  const from = L.odie.root.position.clone();
  odieAI.face(s.floor);
  odieAI.clip('jump_up', { once: true, force: true });
  await t.tween((k) => { L.odie.root.position.lerpVectors(from, s.floor, k); L.odie.root.position.y = from.y * (1 - k) + Math.sin(k * Math.PI) * 0.3; }, 0.5);
  L.odie.root.position.y = 0;
  L.flags.odieOnTable = false;
}
function hopDown(L, then) { L.odieAI.run('fpHopDown', async (t) => { await hopDownTask(L, t); then?.(); }); }

function zoomStart(L, ev) {
  const { ctx, odieAI } = L;
  L.flags.zoomSat = false;
  odieAI.run('fpZoomies', async (t) => {
    if (!L.flags.odieOnTable) await hopUpTask(L, t);
    const s = tableSpots(ctx);
    ctx.audio?.sfx?.('pant');
    odieAI.noise('o_pant');
    bark(L, 'fp2_g_odie_table', { delay: 1.5, force: true });
    odieAI.clip('gallop_goofy', { force: true });
    for (let lap = 0; lap < 2; lap++) for (let i = 0; i < 4; i++) {
      const a = L.odie.root.position.clone(), b = s.corners[(i + 1) % 4];
      odieAI.face(b);
      await t.tween((k) => L.odie.root.position.lerpVectors(a, b, k), Math.max(0.2, flat(a, b) / 2.4));
    }
    const a = L.odie.root.position.clone();
    odieAI.face(s.edge);
    await t.tween((k) => L.odie.root.position.lerpVectors(a, s.edge, k), Math.max(0.2, flat(a, s.edge) / 2));
    L.odie.root.rotation.y = A(ctx, 'odieTableEdge')?.rotY ?? Math.PI;
    t.loop('idle_pant');
    L.flags.zoomSat = true;
    for (;;) { await t.wait(rnd(5, 8)); if (Math.random() < 0.4) odieAI.noise('o_pant'); }
  });
  void ev;
}
function sillStart(L) {
  const { ctx, odieAI } = L;
  const go = () => odieAI.run('fpSillWait', async (t) => {
    await t.walkTo(apos(ctx, 'odieSill', V(2.55, 0, 0.78)), { speed: 1.4 });
    L.odie.root.rotation.y = A(ctx, 'odieSill')?.rotY ?? Math.PI;
    t.loop('sit_pant');
    for (;;) await t.wait(10);
  });
  if (L.flags.odieOnTable) hopDown(L, go); else go();
}

// 10 s knockout, then back to his day (D21)
function knockOdie(L, clip = 'dizzy', noise = 'o_yip') {
  const f = L.flags;
  f.odieDown = true;
  L.fp.knocks++;
  logEv(L, 'knock', clip);
  if (L.fp.claims.odie) endEvent(L, L.fp.claims.odie);
  if (noise) L.odieAI.noise(noise);
  L.odieAI.knockout(clip, FP2.knockout, () => { f.odieDown = false; L.odieAI.idle(); odieNext(L); });
}

function setupOdieTricks(L) {
  // spit-ball, whistle and socks live with the dresser; vase/window with the sill; this is just the scratch
  void L;
}
function scratchOdie(L) {
  const { ctx, odieAI, flags: f } = L;
  if (!odieFree(L)) return;
  const g = ctx.controller.pos, op = L.odie.root.position.clone();
  if (L.fp.claims.odie) endEvent(L, L.fp.claims.odie);
  if (f.odieOnTable) {
    if (f.winOpen && L.onTable()) return outTheWindow(L);
    // off the table, onto his head (Ch2 L2)
    const s = tableSpots(ctx), c = s.centre;
    const away = V(op.x - c.x, 0, op.z - c.z); if (away.lengthSq() < 0.01) away.set(0, 0, -1);
    let land = op.clone().setY(0).addScaledVector(away.normalize(), 0.8);
    if ((ctx.world.groundAt?.(land.x, land.z, 0.3) ?? 0) > 0.1) land = s.floor.clone();
    f.odieArc = true;
    ctx.audio?.sfx?.('yip');
    odieAI.noise('o_yip_long');
    odieAI.arc(land, { h: 0.5, dur: 0.6 });
    L.later(0.65, () => {
      f.odieArc = false; f.odieOnTable = false;
      L.odie.root.position.y = 0;
      ctx.audio?.sfx?.('boing');
      knockOdie(L, 'land_head', null);
      bark(L, 'fp2_g_odie_table', { delay: 1.2 });
      L.later(1.4, () => naughty(L, 0.85));
    });
    return;
  }
  const win = apos(ctx, 'window', V(3, 1.5, 0));
  if (f.winOpen && op.z < 5.5 && op.y < 0.3) {
    if (g.y > 0.4) return outTheWindow(L);
    // splat on the wall below the window (Ch2 L4)
    const w = apos(ctx, 'wallBelowWindow', V(3, 0.5, 0.52)), spot = V(w.x, 0, w.z + 0.22);
    f.odieArc = true;
    odieAI.noise('o_yip_long');
    odieAI.arc(spot, { h: 1.0, dur: 1.0 });
    L.later(1.05, () => {
      f.odieArc = false;
      L.odie.root.position.copy(spot); L.odie.root.rotation.y = Math.PI;
      ctx.audio?.sfx?.('boing'); ctx.camera?.shake?.(0.06);
      knockOdie(L, 'stuck_wall', null);
      bark(L, 'fp2_g_odie_splat', { force: true, delay: 0.6 });
    });
    void win;
    return;
  }
  // plain scratch: a startled hop away, then on with his day
  L.say('g_c2_odie_scratch', { force: true, delay: 0.5 });
  const away = V(op.x - g.x, 0, op.z - g.z); if (away.lengthSq() < 0.01) away.set(1, 0, 0);
  let to = op.clone().addScaledVector(away.normalize(), 1.6);
  if (!reach(ctx.world.navPet || ctx.world.nav, op, to)) to = op.clone();
  odieAI.flee(to, { then: 'idle_pant' });
  L.later(4, () => { if (odieFree(L) && odieAI.taskName() !== 'fpBrace' && !L.fp.claims.odie) odieNext(L); });
}
function outTheWindow(L) {
  const { ctx, odieAI, flags: f } = L;
  f.odieOut = true; f.odieOnTable = false;
  L.fp.launches = (L.fp.launches || 0) + 1;
  logEv(L, 'window', 'launch');
  odieAI.noise('o_yip_long');
  ctx.audio?.sfx?.('yip');
  bark(L, 'fp2_g_odie_fly', { force: true, delay: 0.8 });
  const w = apos(ctx, 'window', V(3, 1.5, 0)), out = apos(ctx, 'outsideWindow', V(3, -0.3, -3.6));
  odieAI.run('fpOutWindow', async (t) => {
    odieAI.clip('launched', { force: true });
    const from = L.odie.root.position.clone();
    await t.tween((k) => { L.odie.root.position.lerpVectors(from, w.clone().setY(1.2), k); L.odie.root.position.y += Math.sin(k * Math.PI) * 0.6; }, 1.1);
    const f2 = L.odie.root.position.clone();
    await t.tween((k) => { L.odie.root.position.lerpVectors(f2, out, k); L.odie.root.position.y += Math.sin(k * Math.PI) * 0.5; }, 0.8);
    L.odie.root.visible = false;
    await t.wait(FP2.odieBack);
    // back in through the front door
    const fd = prop(ctx, 'frontDoor'), step = apos(ctx, 'doorStep', V(7.1, 0, -0.95)), inside = apos(ctx, 'doorInside', V(7.1, 0, 1));
    try { fd?.setLocked?.(false); fd?.open?.(); } catch {}
    ctx.audio?.sfx?.('door');
    L.odie.root.position.copy(step); L.odie.root.rotation.y = 0; L.odie.root.visible = true;
    odieAI.clip('gallop_goofy', { force: true });
    await t.tween((k) => L.odie.root.position.lerpVectors(step, inside, k), 1.0);
    try { fd?.close?.(); fd?.setLocked?.(true); } catch {}
    f.odieOut = false;
    odieAI.noise('o_bark_happy');
    L.say('fp2_g_back', { force: true, delay: 0.6 });
    if (avail(L.ly)) bark(L, 'fp2_l_odie_back', { delay: 2.2 });
    odieNext(L);
  });
}

function updateOdie(L, dt) {
  const { ctx, odieAI, flags: f, fp } = L;
  if (!odieAI) return;
  const p = L.odie.root.position;
  if (L.odie.root.visible !== false && !f.odieArc && !f.odieOut && !/OutWindow|Zoomies|fpTable|HopDown|fpKicked/.test(odieAI.taskName() || '')) {
    // inside furniture/walls, under the floor, or outside the house → put him somewhere sensible
    const bad = p.x < BOUNDS.x0 || p.x > BOUNDS.x1 || p.z < BOUNDS.z0 || p.z > BOUNDS.z1 || p.y < -0.2 || p.y > 3.4
      || (!f.odieOnTable && (ctx.world.colliders || []).some((c) => c.enabled !== false && c.kind !== 'surface' && !/door|blocker/i.test(c.id || '')
        && p.x > c.min.x + 0.05 && p.x < c.max.x - 0.05 && p.z > c.min.z + 0.05 && p.z < c.max.z - 0.05 && p.y + 0.3 > c.min.y && p.y + 0.05 < c.max.y));
    if (bad) { f.badT = (f.badT || 0) + dt; if (f.badT > 1.5) { f.badT = 0; watchdog(L, 'odie:stuck@' + p.toArray().map((v) => v.toFixed(1)).join(','), () => { odieAI.place(apos(ctx, 'sofaFoot', V(3, 0, 2.75))); f.odieOnTable = false; odieNext(L); }); } }
    else f.badT = 0;
  }
  if (odieFree(L) && !odieAI.busy() && !fp.claims.odie) { f.idleOdie = (f.idleOdie || 0) + dt; if (f.idleOdie > 6) { f.idleOdie = 0; odieNext(L); } }
  else f.idleOdie = 0;
}

// ------------------------------------------------------------------ window + vase (sill)
function setupWindowVase(L) {
  const { ctx, flags: f } = L;
  ctx.interact.register({ id: 'fp_window', radius: 0.95, heightTol: 0.5,
    get label() { return f.winOpen ? 'Close the window' : 'Open the window'; },
    getPos: (o) => (o || V()).copy(f.sill.pos()),
    enabled: () => f.sill.isOn() && !f.winBusy,
    onInteract: () => setWindow(L, !f.winOpen) });
  ctx.scratch.register({ id: 'fp_vase', radius: 0.3, heightTol: 0.55, getPos: (o) => (o || V()).copy(vasePos(ctx)),
    enabled: () => !f.vaseBroken && ctx.controller.pos.y > 0.45, onHit: () => knockVase(L) });
}
async function setWindow(L, open) {
  const { ctx, flags: f } = L;
  f.winBusy = true;
  try {
    if (open) { await prop(ctx, 'window')?.open?.(); prop(ctx, 'curtains')?.wave?.(true); ctx.audio?.sfx?.('wind', { vol: 0.7 }); f.winOpenAt = L.t; if (Math.random() < 0.5) bark(L, 'fp2_g_window', { delay: 0.8 }); }
    else { await prop(ctx, 'window')?.close?.(); prop(ctx, 'curtains')?.wave?.(false); }
  } catch {}
  f.winOpen = open; f.winBusy = false;
}
// a draughty house: after a while a free human goes and shuts it
function updateWindow(L) {
  const { ctx, flags: f } = L;
  if (!f.winOpen || f.winBusy || L.t - f.winOpenAt < 55 || f.closer) return;
  const h = [L.jon, L.ly].find((x) => avail(x) && !L.fp.claims[x.who] && !upstairs(x.pos()));
  if (!h) return;
  f.closer = h.who;
  const sillP = f.sill.pos(), stand = sillP.clone().setY(0).add(V(0, 0, 0.7));
  h.run('fpWindow', async (t) => {
    t.say(h.who === 'jon' ? 'fp2_j_window' : 'l_huh', { force: true });
    await h.standUp(t);
    await t.walkTo(stand, { arrive: 0.25 });
    await t.face(sillP);
    await t.play('close_window', 1.4, { fallback: 'idle' });
    await setWindow(L, false);
    if (h.who === 'jon') t.say('j_cold_3', { force: true });
    f.closer = null;
    h.goHome();
  }, { interruptible: false });
  L.later(20, () => { if (f.closer === h.who && !doing(h, 'fpWindow')) f.closer = null; });
}
async function knockVase(L) {
  const { ctx, flags: f } = L;
  if (f.vaseBroken) return;
  f.vaseBroken = true;
  const vase = prop(ctx, 'vase');
  const under = odieFree(L) && flat(L.odie.root.position, apos(ctx, 'odieSill', V(2.55, 0, 0.78))) < 0.8 && L.odie.root.position.y < 0.3;
  const head = L.odie.root.position.clone().add(V(0, 0.6, 0));
  logEv(L, 'vase', under ? 'hit' : 'miss');
  try { await Promise.race([vase?.knock?.(under ? { target: head } : { dir: V(0, 0, 1) }), new Promise((r) => setTimeout(r, 1800))]); } catch {}
  ctx.audio?.sfx?.('crash', { vol: 0.5 });
  if (under && odieFree(L)) {
    knockOdie(L, 'dizzy', 'o_yip');
    bark(L, 'fp2_g_vase_odie', { force: true, delay: 0.6 });
    L.later(1.5, () => naughty(L, 0.85));
  } else bark(L, 'fp2_g_vase_miss', { force: true, delay: 0.5 });
  L.later(12, () => { try { vase?.reset?.(); } catch {} f.vaseBroken = false; });
}

// ------------------------------------------------------------------ table tricks: soup splash, the warp
function updateTableTricks(L, dt) {
  const { ctx, flags: f } = L;
  const seated = [L.jon, L.ly].filter((h) => h.state === 'sitEat' && h.seated());
  if (L.onTable() && seated.length && !f.warping && L.t - (f.warpAt ?? -99) > 75) {
    const mid = apos(ctx, 'tableTop', V(4.4, 0.76, 8.8));
    if (flat(ctx.controller.pos, mid) < 0.3) {
      if (!f.warpTried) { f.warpTried = true; if (Math.random() < 0.6) tableWarp(L, seated[0]); }
    } else f.warpTried = false;
  }
  void dt;
}
function tableWarp(L, h) {
  const { ctx, flags: f } = L;
  f.warping = true; f.warpAt = L.t;
  L.fp.warps = (L.fp.warps || 0) + 1;
  logEv(L, 'warp', h.who);
  const table = prop(ctx, 'table'), g = ctx.garfield, y = L.tableTopY();
  const top = tableBox(ctx).src;
  L.cut(async (d) => {
    const gp = g.root.position.clone();
    d.cut(L.shot(gp.clone().setY(0.9), { dist: 2.8, h: 0.6 }));
    d.sfx('creak');
    if (top) top.enabled = false;
    await Promise.resolve(table?.warpTo ? table.warpTo(1, 0.7) : null);
    d.sfx('boing');
    ctx.camera?.shake?.(0.1);
    try { h.actor.setExpression?.('shock'); h.actor.play?.('eyes_widen'); } catch {}
    await d.say(h.who === 'lyman' ? 'jon' : 'jon', 'c2_j_l4_diet');
    try { g.setExpression?.('disgust'); } catch {}
    if (table?.warpTo) await table.warpTo(0, 0.6);
    if (top) top.enabled = true;
    ctx.controller.teleport(gp.setY(y + 0.02), g.root.rotation.y);
  }).then(() => { if (top) top.enabled = true; f.warping = false; try { prop(ctx, 'table')?.warp?.(0); } catch {} bark(L, 'fp2_g_warp', { delay: 0.5 }); if (avail(h)) h.goHome(); });
}

// ------------------------------------------------------------------ doors: shut a human in (60 s or until opened)
function setupDoors(L) {
  const { ctx, flags: f } = L;
  f.trapped = {};
  const doors = [
    { id: 'bedroomDoor', pos: () => apos(ctx, 'bedroomDoor', V(6.4, 3, 5.7)), inside: (p) => insideRoom(ctx, p) },
    { id: 'lymanDoor', pos: () => apos(ctx, 'lymanDoor', V(8.18, 3, 7)), inside: inLymanRoom },
  ];
  f.doors = doors;
  for (const d of doors) ctx.interact.register({ id: 'fp_' + d.id, radius: 1.0, heightTol: 0.7, markerHeight: 1.0,
    get label() { return prop(ctx, d.id)?.state?.open === false ? 'Open the door' : 'Close the door'; },
    getPos: (o) => (o || V()).copy(d.pos()),
    enabled: () => !f['busy_' + d.id],
    onInteract: () => toggleDoor(L, d) });
}
async function toggleDoor(L, d) {
  const { ctx, flags: f } = L;
  const door = prop(ctx, d.id);
  if (!door) return;
  f['busy_' + d.id] = true;
  ctx.audio?.sfx?.('door');
  try { ctx.garfield.play?.('interact', { once: true }); } catch {}
  try {
    if (door.state?.open === false) { await door.open?.(); for (const h of L.humans.list) if (f.trapped[h.who]?.door === d.id) free(L, h, false); }
    else {
      await door.close?.();
      const gIn = d.inside(ctx.controller.pos);
      for (const h of L.humans.list) {
        if (!d.inside(h.pos()) || !avail(h) || h.state === 'chase' || h.state === 'glare') continue;
        if (gIn) { h.run('fpLetOut', async (t) => { await t.wait(2); t.say('j_letout', { force: true }); try { await door.open?.(); } catch {} h.goHome(); }); continue; }
        if (L.fp.claims[h.who]) endEvent(L, L.fp.claims[h.who]);
        h.trapDoor = d.id;
        h.trap();
        f.trapped[h.who] = { at: L.t, door: d.id };
        L.fp.traps++;
        logEv(L, 'trap', h.who, { door: d.id });
        bark(L, Math.random() < 0.5 ? 'fp2_g_trap' : 'g_escape_2', { delay: 1.5, force: true });
      }
    }
  } finally { f['busy_' + d.id] = false; }
}
function free(L, h, self) {
  const { ctx, flags: f } = L;
  const tr = f.trapped[h.who];
  if (!tr) return;
  delete f.trapped[h.who];
  L.fp.frees++;
  logEv(L, 'free', h.who, { after: +(L.t - tr.at).toFixed(1), self });
  if (self) { try { prop(ctx, tr.door)?.open?.(); } catch {} ctx.audio?.sfx?.('door'); }
  L.say(h.who === 'jon' ? 'fp1_j_free' : 'fp2_l_free', { force: true });
  bark(L, h.who === 'jon' ? 'fp2_j_free' : 'fp2_l_free', { force: true });
  h.setOff();
  baseline(L, h);
  L.fp.act[h.who] = null;
  h.goHome();
}
function updateTrapped(L) {
  const { flags: f } = L;
  for (const h of L.humans.list) {
    const tr = f.trapped[h.who];
    if (!tr) continue;
    if (h.state !== 'trapped') { delete f.trapped[h.who]; continue; }
    if (L.t - tr.at > FP2.trapped) free(L, h, true);
    else if (h.who === 'lyman' && (tr.barkAt ?? tr.at) + 9 < L.t) { tr.barkAt = L.t; bark(L, 'fp2_l_trapped', { force: true }); }
  }
  // anyone who ends up inside a shut room (a chase, a reaction) is shut in too, or let out if Garfield's in there
  if ((f.roomT = (f.roomT || 0) + 1) % 15 === 0) for (const d of f.doors || []) {
    if (prop(L.ctx, d.id)?.state?.open !== false || f['busy_' + d.id]) { if (f.odieRoom?.door === d.id) f.odieRoom = null; continue; }
    for (const h of L.humans.list) {
      if (f.trapped[h.who] || !avail(h) || doing(h, 'fpLetOut') || !d.inside(h.pos())) continue;
      if (d.inside(L.ctx.controller.pos)) { h.run('fpLetOut', async (t) => { await t.wait(1.5); t.say('j_letout', { force: true }); try { await prop(L.ctx, d.id)?.open?.(); } catch {} h.goHome(); }); continue; }
      if (L.fp.claims[h.who]) endEvent(L, L.fp.claims[h.who]);
      h.trapDoor = d.id; h.trap();
      f.trapped[h.who] = { at: L.t, door: d.id };
      L.fp.traps++;
      logEv(L, 'trap', h.who, { door: d.id, late: true });
    }
    // Odie shut upstairs: he scratches his way out after a minute
    const op = L.odie.root.position;
    if (L.odie.root.visible !== false && d.inside(op)) {
      if (f.odieRoom?.door !== d.id) f.odieRoom = { door: d.id, at: L.t };
      else if (L.t - f.odieRoom.at > FP2.trapped) { try { prop(L.ctx, d.id)?.open?.(); } catch {} L.ctx.audio?.sfx?.('door'); logEv(L, 'free', 'odie', { door: d.id, after: +(L.t - f.odieRoom.at).toFixed(1), self: true }); f.odieRoom = null; }
    } else if (f.odieRoom?.door === d.id) f.odieRoom = null;
  }
  // Odie shut in the cupboard
  if (f.odieTrapped && L.t - f.odieTrappedAt > FP2.trapped) { try { prop(L.ctx, 'cupboardDoor')?.open?.(); } catch {} L.ctx.audio?.sfx?.('door'); odieOut(L); }
}

// ------------------------------------------------------------------ under-stair cupboard: biscuits + shut Odie in
function setupCupboard(L) {
  const { ctx, flags: f } = L;
  const door = () => prop(ctx, 'cupboardDoor');
  ctx.scratch.register({ id: 'fp_biscuitBox', radius: 0.35, heightTol: 0.6, getPos: (o) => (o || V()).copy(apos(ctx, 'biscuitBox', V(8.8, 0.15, 2.53))),
    enabled: () => !f.biscuits && !f.boxBusy, onHit: () => burstBox(L) });
  ctx.interact.register({ id: 'fp_cupboardDoor', radius: 0.9, heightTol: 0.6, markerHeight: 0.9,
    get label() { return door()?.isOpen ? 'Shut the door' : 'Open the cupboard'; },
    getPos: (o) => (o || V()).copy(apos(ctx, 'cupboardFront', V(7.55, 0, 2.88))),
    enabled: () => !f.cupBusy && (!door()?.isOpen || !inCupboard(ctx.controller.pos)),
    onInteract: async () => {
      const d = door();
      f.cupBusy = true;
      ctx.audio?.sfx?.('door');
      try { ctx.garfield.play?.('interact', { once: true }); } catch {}
      const wasOpen = !!d?.isOpen;
      try { await (wasOpen ? d?.close?.() : d?.open?.()); } catch {}
      f.cupBusy = false;
      if (!wasOpen) { if (f.odieTrapped) odieOut(L); return; }
      if (inCupboard(L.odie.root.position) && L.odie.root.visible !== false) {
        f.odieTrapped = true; f.odieTrappedAt = L.t;
        L.fp.traps++;
        logEv(L, 'trap', 'odie', { door: 'cupboardDoor' });
        L.odieAI.run('fpCupboard', async (t) => { t.loop('eat', { fallback: 'idle' }); await t.wait(6); for (;;) { L.odieAI.noise('o_whine_muffled'); t.loop('sit'); await t.wait(rnd(8, 12)); } });
        bark(L, 'fp2_g_cupboard', { force: true, delay: 0.8 });
      }
    } });
}
function burstBox(L) {
  const { ctx, odieAI, flags: f } = L;
  const box = prop(ctx, 'biscuitBox');
  f.biscuits = true;
  logEv(L, 'biscuits', 'burst');
  try { box?.burst?.(); } catch {}
  ctx.audio?.sfx?.('crash', { vol: 0.3 });
  L.say('c2_g_l2_biscuits', { force: true });
  L.later(1.5, () => {
    if (!odieFree(L)) return;
    if (L.fp.claims.odie) endEvent(L, L.fp.claims.odie);
    if (f.odieOnTable) return hopDown(L, () => goBiscuits(L));
    goBiscuits(L);
  });
  // a fresh box appears later
  L.later(75, () => { if (!f.odieTrapped) { try { box?.reset?.(); } catch {} f.biscuits = false; } else L.later(30, () => { try { box?.reset?.(); } catch {} f.biscuits = false; }); });
}
function goBiscuits(L) {
  const { ctx, odieAI } = L;
  odieAI.noise('o_bark_happy');
  const heap = prop(ctx, 'biscuitBox')?.heapPos?.() || apos(ctx, 'biscuitBox', V(8.8, 0, 2.53));
  const tgt = heap.clone().setY(0);
  odieAI.run('fpBiscuits', async (t) => {
    for (let i = 0; i < 6 && !prop(ctx, 'cupboardDoor')?.isOpen; i++) { odieAI.clip('bark', { force: true }); await t.wait(2); }
    if (!prop(ctx, 'cupboardDoor')?.isOpen) { odieNext(L); return; }
    await t.walkTo(tgt.clone().add(V(-0.3, 0, 0)), { speed: 2.4 });
    odieAI.face(tgt);
    t.loop('eat');
    for (let k = 0; k < 8; k++) { await t.wait(2); try { prop(ctx, 'biscuitBox')?.eaten?.(Math.min(1, (k + 1) / 8)); } catch {} }
    odieNext(L);
  });
}
function odieOut(L) {
  const { flags: f } = L;
  if (!f.odieTrapped) return;
  f.odieTrapped = false;
  logEv(L, 'free', 'odie', { after: +(L.t - f.odieTrappedAt).toFixed(1) });
  L.fp.frees++;
  L.odieAI.noise('o_bark_happy');
  bark(L, 'fp2_g_cupboard_out', { delay: 1 });
  odieNext(L);
}
function updateCupCam(L) {
  const { ctx, flags: f } = L;
  const inside = inCupboard(ctx.controller.pos) && !ctx.director?.active;
  if (inside === !!f.cupCam) return;
  f.cupCam = inside;
  const a = A(ctx, 'cam_cupboard');
  if (inside && a) ctx.camera.shot({ pos: a.pos.clone(), look: (a.look || a.pos).clone(), fov: a.fov ?? 55 }, { dur: 0.4 });
  else ctx.camera.follow?.({ dur: 0.4 });
}

// ------------------------------------------------------------------ Jon's dresser: socks, the launcher; the whistle
function setupDresser(L) {
  const { ctx, flags: f } = L;
  const dresser = () => prop(ctx, 'dresser');
  const dr = () => dresser()?.sockDrawer;
  ctx.interact.register({ id: 'fp_sockDrawer', radius: 0.8, heightTol: 0.8, markerHeight: 0.3,
    get label() { return !dr()?.isOpen ? 'Open the sock drawer' : f.inDrawer ? 'Play!' : 'Jump in!'; },
    getPos: (o) => (o || V()).copy(drawerPos(ctx)),
    enabled: () => !f.drawerBusy,
    onInteract: () => sockDrawer(L) });
  ctx.interact.register({ id: 'fp_sock', radius: 0.95, heightTol: 0.9, label: 'Sock him!', getPos: (o) => (o || V()).copy(L.odie.root.position),
    enabled: () => f.odieHere && odieFree(L) && (f.socks || 0) < 3 && !f.drawerBusy && L.odieAI.taskName() === 'fpSniff', onInteract: () => sockOdie(L) });
  // breakable drawer → spit-ball launcher
  f.drawerHits = 0;
  ctx.scratch.register({ id: 'fp_breakDrawer', radius: 0.4, heightTol: 0.6, getPos: (o) => (o || V()).copy(breakPos(ctx)),
    enabled: () => !f.drawerBroken,
    onHit: () => {
      const n = ++f.drawerHits;
      try { dresser()?.breakDrawer?.scratch?.(1); } catch {}
      ctx.audio?.sfx?.(n >= 3 ? 'crack' : 'drawer');
      if (n >= 3) { f.drawerBroken = true; try { dresser()?.breakDrawer?.break?.(); } catch {} L.say('c2_g_l6_found', { force: true, delay: 0.5 }); }
    } });
  ctx.interact.register({ id: 'fp_launcher', radius: 0.75, heightTol: 0.7, label: 'Pull it out!', getPos: (o) => (o || V()).copy(breakPos(ctx)).setY(breakPos(ctx).y - 0.2),
    enabled: () => f.drawerBroken && !f.launcher,
    onInteract: () => {
      const sl = prop(ctx, 'spitballLauncher');
      try { ctx.garfield.play?.('pull', { once: true }); } catch {}
      ctx.audio?.sfx?.('pop');
      if (sl?.root) { sl.setActive?.(true); ctx.world.scene.attach(sl.root); sl.root.scale.setScalar(0.8); f.launcher = sl.root; } else f.launcher = true;
      bark(L, 'fp2_g_launcher', { force: true, delay: 0.4 });
    } });
  ctx.interact.register({ id: 'fp_fire', radius: 5.0, heightTol: 1.0, markerHeight: 0.6, label: 'Fire at Odie!', getPos: (o) => (o || V()).copy(L.odie.root.position),
    enabled: () => !!f.launcher && !f.firing && odieFree(L) && !ctx.director?.active && Math.abs(L.odie.root.position.y - ctx.controller.pos.y) < 1.2,
    onInteract: () => fireSpitball(L) });
  // the whistle on Jon's floor
  const w = () => prop(ctx, 'whistle');
  ctx.interact.register({ id: 'fp_whistle', radius: 0.7, heightTol: 0.5,
    get label() { return f.whistle ? 'Blow!' : 'Pick it up'; },
    getPos: (o) => { const r = w()?.root; return f.whistle ? (o || V()).copy(ctx.controller.pos) : r ? r.getWorldPosition(o || V()) : (o || V()).copy(apos(ctx, 'whistleSpot', V(2.75, 3, 5.35))); },
    enabled: () => !f.whistleBusy && w()?.state?.active !== false,
    onInteract: () => whistle(L) });
}
function updateCarry(L) {
  const { ctx, flags: f } = L;
  const m = ctx.garfield.sockets?.mouth || ctx.garfield.root;
  if (f.launcher?.position) { m.getWorldPosition(f.launcher.position); f.launcher.rotation.y = ctx.garfield.root.rotation.y; }
  if (f.whistle?.position) m.getWorldPosition(f.whistle.position);
  if (f.inDrawer) { const p = prop(ctx, 'dresser')?.sockDrawer?.standPos?.(); if (p && flat(p, ctx.controller.pos) > 0.45) f.inDrawer = false; }
  if (prop(ctx, 'dresser')?.sockDrawer?.isOpen && !f.inDrawer && !f.drawerBusy && L.t - (f.drawerAt || 0) > 40) {
    f.drawerAt = L.t; try { prop(ctx, 'dresser').sockDrawer.close(); } catch {}
  }
}
async function sockDrawer(L) {
  const { ctx, flags: f, odieAI } = L;
  const dr = prop(ctx, 'dresser')?.sockDrawer;
  f.drawerBusy = true;
  try {
    if (!dr?.isOpen) { try { ctx.garfield.play?.('interact', { once: true }); } catch {} ctx.audio?.sfx?.('drawer'); await dr?.open?.(); f.drawerAt = L.t; }
    else if (!f.inDrawer) {
      const p = dr?.standPos?.() || drawerPos(ctx);
      ctx.controller.teleport(p.clone().add(V(0, 0.05, 0)), ctx.garfield.root.rotation.y);
      ctx.audio?.sfx?.('jump');
      f.inDrawer = true; f.drawerAt = L.t;
    } else {
      ctx.controller.animHold = true;
      try { ctx.garfield.play?.('play_socks'); ctx.garfield.setExpression?.('happy'); } catch {}
      try { dr?.play?.(2.5); } catch {}
      L.say('c2_g_l10_socks', { force: true });
      await new Promise((r) => setTimeout(r, 2600));
      ctx.controller.animHold = false;
      try { ctx.garfield.play?.('idle'); } catch {}
      f.drawerAt = L.t;
      logEv(L, 'socks', 'play');
      // the dog wanders in to see what the fuss is
      if (odieFree(L) && !L.fp.claims.odie && !f.socked && Math.random() < 0.75) {
        const d = drawerPos(ctx), r = A(ctx, 'sockDrawer')?.rotY ?? Math.PI;
        const front = V(d.x + Math.sin(r) * 1.0, 3, d.z + Math.cos(r) * 1.0);
        if (reach(ctx.world.navPet || ctx.world.nav, L.odie.root.position, front)) {
          if (f.odieOnTable) await new Promise((res) => hopDown(L, res));
          odieAI.run('fpSockWalk', async (t) => {
            odieAI.noise('o_sniff');
            await t.walkTo(front, { speed: 1.4 });
            odieAI.face(d);
            f.odieHere = true; f.socks = 0;
            odieAI.run('fpSniff', async (t2) => { t2.loop('sniff', { fallback: 'idle_pant' }); await t2.wait(25); f.odieHere = false; odieNext(L); });
            L.say('c2_g_l10_idea', { force: true });
          });
        }
      }
    }
  } finally { f.drawerBusy = false; }
}
async function sockOdie(L) {
  const { ctx, flags: f, odieAI } = L;
  f.drawerBusy = true;
  const PARTS = ['ears', 'tail', 'mouth'];
  const i = f.socks || 0;
  try { ctx.garfield.play?.('interact', { once: true }); } catch {}
  ctx.audio?.sfx?.('pop');
  const on = {}; PARTS.slice(0, i + 1).forEach((p) => (on[p] = true));
  try { ctx.odie.setSocks?.(on); } catch {}
  f.socks = i + 1;
  L.say('c2_g_l10_sock_' + (i + 1), { force: true });
  await new Promise((r) => setTimeout(r, 600));
  f.drawerBusy = false;
  if (f.socks < 3) { odieAI.run('fpSniff', async (t) => { t.loop('sniff', { fallback: 'idle_pant' }); await t.wait(25); f.odieHere = false; odieNext(L); }); return; }
  f.odieHere = false; f.socked = true;
  logEv(L, 'socks', 'odie');
  bark(L, 'fp2_g_socks', { delay: 1.5 });
  odieAI.run('fpSocked', async (t) => {
    await t.wait(1.0);
    odieAI.clip('walk_socked', { force: true });
    const dest = apos(ctx, 'sofaFoot', V(3, 0, 2.75)).add(V(0.4, 0, 0.6));
    await t.walkTo(dest, { speed: 0.9 });
    odieAI.clip('idle', { force: true });
    if (avail(L.jon) && L.fp.claims.jon !== 'delivery' && L.t - L.fp.chaseAt > 20) {
      L.fp.chaseAt = L.t;
      L.say('c2_j_l10_socks', { force: true });
      logEv(L, 'chase', 'socks');
      L.jon.chase(FP2.chase, { solo: true });
    }
    await t.wait(20);
    try { ctx.odie.setSocks?.(false); } catch {}
    odieAI.noise('o_shake_off');
    f.socked = false;
    odieNext(L);
  });
}
async function whistle(L) {
  const { ctx, flags: f } = L;
  const w = prop(ctx, 'whistle');
  if (!f.whistle) {
    ctx.audio?.sfx?.('pop');
    if (w?.root) { ctx.world.scene.attach(w.root); f.whistle = w.root; } else f.whistle = true;
    L.say('c2_g_l10_whistle', { force: true });
    return;
  }
  f.whistleBusy = true;
  ctx.controller.lock(true);
  try {
    try { ctx.garfield.play?.('blow_whistle', { once: true }); } catch {}
    await new Promise((r) => setTimeout(r, 600));
    try { w?.blow?.(); } catch {}
    ctx.audio?.sfx?.('whistle', { vol: 0.4 });
    await new Promise((r) => setTimeout(r, 900));
    f.blows = (f.blows || 0) + 1;
    if (f.blows === 1) L.say('c2_g_l10_broken', { force: true }); else bark(L, Math.random() < 0.5 ? 'fp2_g_whistle_again' : 'c2_g_l10_broken', { force: true });
    logEv(L, 'whistle', 'blow');
    if (odieFree(L)) {
      if (L.fp.claims.odie) endEvent(L, L.fp.claims.odie);
      try { ctx.odie.setExpression?.('scared'); } catch {}
      knockOdie(L, 'shake_scared', 'o_whimper');
    }
    // toss it over the shoulder; it lands behind him and can be found again
    try { ctx.garfield.play?.('throw_behind', { once: true }); } catch {}
    const g = ctx.garfield.root;
    if (f.whistle?.position) {
      const from = f.whistle.position.clone(), to = g.position.clone().add(V(-Math.sin(g.rotation.y) * 0.9, 0.02, -Math.cos(g.rotation.y) * 0.9));
      to.y = (ctx.world.groundAt?.(to.x, to.z, g.position.y + 0.3) ?? g.position.y) + 0.02;
      const obj = f.whistle; f.whistle = null;
      for (let k = 1; k <= 10; k++) { await new Promise((r) => setTimeout(r, 40)); obj.position.lerpVectors(from, to, k / 10); obj.position.y += Math.sin((k / 10) * Math.PI) * 0.35; }
    } else f.whistle = null;
  } finally { ctx.controller.lock(false); f.whistleBusy = false; }
}
function fireSpitball(L) {
  const { ctx, flags: f, odieAI } = L;
  f.firing = true;
  const sl = prop(ctx, 'spitballLauncher');
  const from = ctx.garfield.root.position.clone().add(V(0, 0.35, 0));
  const to = L.odie.root.position.clone().add(V(0, 0.55, 0));
  ctx.garfield.root.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
  ctx.audio?.sfx?.('thwip');
  logEv(L, 'spitball', 'fire');
  Promise.resolve(sl?.fire?.(from, to)).catch(() => {});
  L.later(0.5, () => {
    f.firing = false;
    if (!odieFree(L)) return;
    if (L.fp.claims.odie) endEvent(L, L.fp.claims.odie);
    odieAI.noise('o_yip');
    odieAI.run('fpSpitHit', async (t) => { await t.play('hit', 0.6, { fallback: 'dizzy' }); await t.play('yip_flee', 0.5, { fallback: 'idle' }); odieNext(L); });
    // both on the sofa → the coffee-spill brawl (Ch2 L6)
    const sofa = [L.jon, L.ly].every((h) => h.state === 'sofa' && h.seated());
    if (sofa && !L.fp.active.has('brawl')) { if (L.fp.active.has('tvtime')) endEvent(L, 'tvtime'); startEvent(L, 'brawl', { force: true }); }
    else naughty(L, 0.4);
  });
}

// ------------------------------------------------------------------ shedding week (+ the bald gag) / disco Lyman
function setupShed(L) {
  const { ctx, flags: f } = L;
  f.shed = {};
  SHED.forEach((s) => ctx.interact.register({ id: 'fp_shed_' + s.id, radius: 0.95, heightTol: 0.8, markerHeight: 0.4, label: 'Shed!',
    getPos: (o) => (o || V()).copy(apos(ctx, s.anchor, s.fb)),
    enabled: () => L.fp.active.has('shedding') && !f.shed[s.id] && !f.shedding && !f.bald,
    onInteract: () => shedOn(L, s) }));
}
function shedStart(L) {
  const { ctx, flags: f } = L;
  f.shed = {};
  bark(L, Math.random() < 0.5 ? 'c2_g_l8_intro' : 'fp2_g_shed', { force: true, delay: 0.5 });
  try { const pile = prop(ctx, 'furPile'), g = ctx.garfield.root; pile?.setActive?.(true); pile?.drop?.(g.position.clone().setY(ctx.controller.pos.y).add(V(-Math.sin(g.rotation.y) * 0.4, 0, -Math.cos(g.rotation.y) * 0.4))); } catch {}
  ctx.audio?.sfx?.('poof');
  try { ctx.garfield.play?.('shed', { once: true }); } catch {}
}
function shedUpdate(L, ev) { if (SHED.every((s) => L.flags.shed[s.id])) ev.done = true; }
async function shedOn(L, s) {
  const { ctx, flags: f } = L;
  f.shedding = true;
  ctx.controller.animHold = true;
  try { ctx.garfield.play?.('shed', { once: true }); } catch {}
  ctx.audio?.sfx?.('poof');
  const decals = prop(ctx, 'shedDecals');
  try { decals?.setActive?.(true); } catch {}
  for (let k = 1; k <= 10; k++) { await new Promise((r) => setTimeout(r, 150)); try { decals?.set?.(s.id, k / 10); } catch {} }
  ctx.controller.animHold = false;
  f.shedding = false;
  f.shed[s.id] = true;
  logEv(L, 'shed', s.id);
  const n = Object.keys(f.shed).length;
  if (n < 4) { L.say('c2_g_l8_shed_' + Math.min(3, n), { force: true }); if (Math.random() < 0.6) L.later(4 + Math.random() * 3, () => { if (avail(L.jon)) bark(L, Math.random() < 0.5 ? 'c2_j_l8_hair_' + Math.min(3, n) : 'fp2_j_shed', { force: true }); }); }
  else if (Math.random() < 0.4) goBald(L);
  else bark(L, 'fp2_g_shed', { force: true });
}
function goBald(L) {
  const { ctx, flags: f } = L;
  f.bald = true;
  logEv(L, 'bald', 'on');
  for (let k = 0; k < 3; k++) L.later(k * 0.5, () => { try { ctx.garfield.play?.('shed', { once: true }); } catch {} ctx.audio?.sfx?.('poof'); });
  L.later(1.6, () => {
    try { const pile = prop(ctx, 'furPile'); pile?.setActive?.(true); pile?.drop?.(ctx.controller.pos.clone().add(V(0.25, 0, 0.1))); pile?.puff?.(); } catch {}
    try { ctx.garfield.setBald?.(true); ctx.garfield.setExpression?.('shock'); } catch {}
    if (avail(L.jon)) L.say('c2_j_l8_bald', { force: true, delay: 0.8 });
    L.say('fp2_g_bald', { force: true, delay: 3.6 });
  });
  L.later(60, () => { try { ctx.garfield.setBald?.(false); } catch {} f.bald = false; logEv(L, 'bald', 'off'); bark(L, 'fp2_g_bald_back', { force: true }); });
}
function shedEnd(L) {
  const { ctx } = L;
  L.later(25, () => {
    if (L.fp.active.has('shedding')) return;
    try { for (const s of SHED) prop(ctx, 'shedDecals')?.set?.(s.id, 0); prop(ctx, 'furPile')?.setActive?.(false); } catch {}
  });
}
function discoStart(L, ev) {
  const { ctx, ly } = L;
  const room = apos(ctx, 'lymanInside', V(7.88, 3, 8.1));
  const spot = apos(ctx, 'livingCentre', V(5.9, 0, 2.6)).setY(0);
  const dance = () => ly.run('fpDance', async (t) => {
    L.flags.dancing = true;
    for (;;) { t.loop(Math.random() < 0.7 ? 'dramatic' : 'sing_morning', { fallback: 'idle' }); await t.wait(rnd(4, 7)); if (Math.random() < 0.5) t.say('c2_l_l3_dance'); }
  });
  const change = (h) => h.run('fpChange', async (t) => {
    await h.standUp(t);
    const viaRoom = prop(ctx, 'lymanDoor')?.state?.open !== false && reach(ctx.world.nav, h.pos(), room);
    if (viaRoom) { await t.walkTo(room, { arrive: 0.3 }); ctx.lyman.root.visible = false; await t.wait(2); }
    else { ctx.audio?.sfx?.('poof'); await t.wait(0.4); }
    try { ctx.lyman.setOutfit?.('disco'); ctx.lyman.setFur?.(0); } catch {}
    ctx.lyman.root.visible = true;
    L.flags.discoOn = true;
    logEv(L, 'outfit', 'disco');
    t.say('fp2_l_disco', { force: true });
    bark(L, Math.random() < 0.5 ? 'c2_g_l3_suit' : 'fp2_g_disco', { delay: 2.5, force: true });
    await t.walkTo(spot, { arrive: 0.3 });
    h.setHome({ type: 'custom', fn: dance });
    dance();
  }, { interruptible: false });
  L.flags.fur = 0;
  drive(L, ly, () => (L.flags.discoOn ? dance() : change(ly)));
  void ev;
}
function discoUpdate(L, ev, dt) {
  const { ctx, flags: f } = L;
  if (!f.discoOn || f.bald || f.furDone) return;
  const g = ctx.controller.pos, lp = ctx.lyman.root.position;
  if (flat(g, lp) < 0.6 && g.y < lp.y + 0.3 && ctx.lyman.root.visible !== false) {
    f.fur = Math.min(1, f.fur + dt / 3);
    try { ctx.lyman.setFur?.(f.fur); } catch {}
    if ((f.puffT = (f.puffT || 0) - dt) <= 0) { f.puffT = 0.6; ctx.audio?.sfx?.('poof', { vol: 0.5 }); try { ctx.garfield.play?.('shed', { once: true }); } catch {} }
    if (f.fur >= 1) {
      f.furDone = true;
      logEv(L, 'disco', 'furry');
      L.say('c2_l_l3_furry', { force: true });
      try { ctx.lyman.play?.('eyes_widen'); } catch {}
      bark(L, 'fp2_g_disco_end', { delay: 2.4, force: true });
      L.later(3.2, () => { ev.done = true; });
    }
  }
}
function discoEnd(L, ev) {
  const { ctx, ly, flags: f } = L;
  f.dancing = false;
  const room = apos(ctx, 'lymanInside', V(7.88, 3, 8.1));
  const back = (snap) => {
    if (snap) { try { ctx.lyman.setOutfit?.('normal'); ctx.lyman.setFur?.(0); } catch {} f.discoOn = false; f.furDone = false; ctx.lyman.root.visible = true; logEv(L, 'outfit', 'normal'); return; }
    ly.run('fpChange', async (t) => {
      if (f.furDone) t.say('fp2_l_disco_end', { force: true });
      await ly.standUp(t);
      const viaRoom = prop(ctx, 'lymanDoor')?.state?.open !== false && reach(ctx.world.nav, ly.pos(), room);
      if (viaRoom) { await t.walkTo(room, { arrive: 0.3 }); ctx.lyman.root.visible = false; await t.wait(2); }
      back(true);
      t.say('fp2_l_disco_done');
      release(L, ly);
    }, { interruptible: false });
  };
  if (!f.discoOn) { L.fp.claims.lyman = null; release(L, ly); return; }
  L.fp.claims.lyman = null;
  if (avail(ly) && !doing(ly, 'fpChange')) back(false); else back(true);
  void ev;
}

// ------------------------------------------------------------------ bad mood: sit on the table, poke, glare, maybe a hug
function setupMorning(L) {
  const { ctx, flags: f } = L;
  ctx.interact.register({ id: 'fp_sit', radius: 1.0, heightTol: 0.35, label: 'Sit (bad mood)', getPos: (o) => (o || V()).copy(apos(ctx, 'tableTop', V(4.4, 0.76, 8.8))),
    enabled: () => L.fp.active.has('goodmorning') && L.onTable() && !f.gmSit && !f.gmPhase,
    onInteract: () => { f.gmSit = true; ctx.controller.animHold = true; ctx.controller.vel?.set?.(0, 0, 0); try { ctx.garfield.play?.('sit_table'); ctx.garfield.setExpression?.('disgust'); } catch {} bark(L, 'c2_g_l9_intro', { force: true }); } });
  ctx.interact.register({ id: 'fp_poke', radius: 1.6, heightTol: 1.2, label: 'Poke!', getPos: (o) => (o || V()).copy(L.jon.pos()),
    enabled: () => f.gmSit && f.gmPhase === 'byTable', onInteract: () => gmPoke(L) });
}
function besideTable(L, off = 0) {
  const { ctx } = L;
  const g = ctx.controller.pos, tb = tableBox(ctx);
  const cands = [V(tb.min.x - 0.45, 0, g.z + off), V(tb.max.x + 0.45, 0, g.z + off), V(g.x + off, 0, tb.min.z - 0.45), V(g.x + off, 0, tb.max.z + 0.45)];
  cands.sort((a, b) => flat(a, g) - flat(b, g));
  return cands.find((p) => (ctx.world.groundAt?.(p.x, p.z, 0.3) ?? 0) < 0.1) || cands[0];
}
function gmStart(L, ev) {
  const { jon, flags: f } = L;
  f.gmSit = false; f.gmPhase = null; f.gmP = 0;
  bark(L, 'fp2_g_morning', { force: true, delay: 1 });
  drive(L, jon, () => jon.wander());
  void ev;
}
function gmUpdate(L, ev, dt) {
  const { ctx, jon, flags: f } = L;
  const c = ctx.controller;
  if (f.gmSit && !f.gmPhase && c.speed > 0.3) { f.gmSit = false; c.animHold = false; }
  if (f.gmSit && f.gmPhase !== 'glare' && f.gmPhase !== 'hug' && c.speed > 0.3) { f.gmSit = false; c.animHold = false; if (f.gmPhase === 'byTable') { f.gmPhase = null; drive(L, jon, () => jon.wander()); } }
  if (f.gmSit && !f.gmPhase && avail(jon)) {
    f.gmPhase = 'walkBy';
    ev.until = Math.max(ev.until, L.t + 40);
    jon.run('fpWalkBy', async (t) => {
      await t.walkTo(besideTable(L), { arrive: 0.2 });
      await t.face(ctx.controller.pos);
      f.gmPhase = 'byTable';
      try { ctx.jon.setExpression?.('happy'); } catch {}
      t.loop('sing_morning', { fallback: 'talk' });
      t.say('c2_j_l9_morning', { force: true });
      await t.wait(7);
      if (f.gmPhase === 'byTable') { f.gmPhase = null; f.gmSit = false; ctx.controller.animHold = false; ev.done = true; }
    });
  }
  if (f.gmPhase === 'glare') {
    if (!L.onTable()) { f.gmPhase = 'end'; ctx.ui?.hud?.set?.({ hold: null, interactLabel: null }); ev.done = true; return; }
    const held = !!ctx.input?.interactHeld;
    f.gmP = Math.max(0, Math.min(1, f.gmP + (held ? dt / 1.5 : -dt / 3)));
    try { ctx.garfield.setSeethe?.(f.gmP); } catch {}
    ctx.ui?.hud?.set?.({ hold: { p: f.gmP, label: 'Hold!' }, interactLabel: 'Hold to glare!' });
    if (f.gmP >= 1) gmGlared(L, ev);
    else if (L.t - f.gmGlareAt > 15) { f.gmPhase = 'end'; ctx.ui?.hud?.set?.({ hold: null, interactLabel: null }); ev.done = true; }
  }
}
function gmPoke(L) {
  const { ctx, jon, ly, flags: f } = L;
  f.gmPhase = 'poked';
  logEv(L, 'poke', 'jon');
  ctx.garfield.root.rotation.y = Math.atan2(jon.pos().x - ctx.controller.pos.x, jon.pos().z - ctx.controller.pos.z);
  try { ctx.garfield.play?.('poke', { once: true }); } catch {}
  ctx.audio?.sfx?.('hit', { vol: 0.5 });
  const ev = L.fp.active.get('goodmorning');
  if (ev) ev.until = L.t + 40;
  const lyOk = avail(ly) && !L.fp.claims.lyman;
  if (lyOk) { L.fp.claims.lyman = 'goodmorning'; if (ev) ev.data.ly = true; }
  jon.run('fpPoked', async (t) => {
    t.loop('poked', { fallback: 'cover_face' });
    try { ctx.jon.setExpression?.('pain'); } catch {}
    t.say('c2_j_l9_ow', { force: true });
    await t.wait(1.6);
    t.say('c2_j_l9_nasty', { force: true });
    await t.wait(2.6);
    if (lyOk) { L.say('c2_l_l9_treat', { force: true }); await t.wait(3.2); }
    await t.walkTo(besideTable(L), { arrive: 0.2 });
    await t.face(ctx.controller.pos);
    t.loop('idle');
    f.gmPhase = 'glare'; f.gmGlareAt = L.t; f.gmP = 0;
    try { ctx.garfield.play?.('seethe'); } catch {}
    L.tutorial({ id: 'fp_hold', text: 'Hold E (or Space) to give them your meanest glare!', touchText: 'Hold the hand button to give them your meanest glare!', icon: 'hand', keys: ['E'], touch: 'interact' });
    await t.wait(30);
  }, { interruptible: false });
  if (lyOk) ly.run('fpPoked', async (t) => {
    await ly.standUp(t);
    await t.walkTo(besideTable(L, 0.8), { arrive: 0.2 });
    await t.face(ctx.controller.pos);
    t.loop('idle');
    await t.wait(40);
  }, { interruptible: false });
}
function gmGlared(L, ev) {
  const { ctx, jon, ly, flags: f } = L;
  f.gmPhase = 'hug';
  logEv(L, 'glare', 'jon');
  ctx.ui?.hud?.set?.({ hold: null, interactLabel: null });
  try { ctx.ui?.tutorial?.hide?.(); } catch {}
  L.say('c2_g_l9_glare', { force: true });
  const lyIn = L.fp.claims.lyman === 'goodmorning';
  for (const h of [jon, lyIn ? ly : null].filter(Boolean)) { try { h.actor.play?.('frightened'); h.actor.setExpression?.('shock'); } catch {} }
  L.later(0.8, () => L.say('c2_j_l9_respect', { force: true }));
  const hug = Math.random() < 0.4;
  L.later(3.5, () => {
    try { ctx.garfield.setSeethe?.(0); } catch {}
    if (!hug) { bark(L, 'fp2_g_nohug', { force: true }); ev.done = true; return; }
    logEv(L, 'hug', 'all');
    ctx.controller.lock(true);
    for (const h of [jon, lyIn ? ly : null].filter(Boolean)) try { h.actor.play?.('jump_out'); } catch {}
    L.say('c2_j_l9_love', { force: true });
    if (lyIn) L.say('c2_l_l9_love', { force: true, delay: 0.2 });
    try { ctx.garfield.setExpression?.('shock'); ctx.garfield.play?.('startled_jump', { once: true }); } catch {}
    L.later(1.2, () => {
      for (const h of [jon, lyIn ? ly : null].filter(Boolean)) try { h.actor.play?.('hug'); } catch {}
      try { ctx.garfield.play?.('hug_squeezed'); } catch {}
      ctx.audio?.sfx?.('aww');
    });
    L.later(3.4, () => { try { ctx.garfield.setExpression?.('happy'); ctx.garfield.play?.('loved'); } catch {} bark(L, Math.random() < 0.5 ? 'c2_g_l9_loved' : 'fp2_g_hug', { force: true }); });
    L.later(5.5, () => { ctx.controller.lock(false); ev.done = true; });
  });
}
function gmEnd(L, ev) {
  const { ctx, flags: f, jon, ly } = L;
  if (f.gmPhase === 'hug' || f.gmPhase === 'glare') ctx.controller.lock(false);
  ctx.ui?.hud?.set?.({ hold: null, interactLabel: null });
  try { ctx.ui?.tutorial?.hide?.(); ctx.garfield.setSeethe?.(0); } catch {}
  if (f.gmSit) { f.gmSit = false; ctx.controller.animHold = false; try { ctx.garfield.play?.('idle'); } catch {} }
  f.gmPhase = null;
  for (const h of [jon, ly]) if (doing(h, /^fp(Poked|WalkBy)/)) h.setOff();
  if (ev.data.ly) release(L, ly);
  releaseAll(L, ev);
}
