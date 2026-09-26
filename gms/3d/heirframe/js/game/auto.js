import { toUiBoard } from '../sim/ui_adapt.js';

// ?auto=1 test pilot. Drives the real UI (DOM clicks) for screens/panels and the same player/combat calls the
// touch controls use. Progress in __game.runtime.auto.
//   &contracts=N   title → intro → A1-M1 → N random contracts → Warehouse equip (the P1 flow)
//   &story=1       take every gold STORY card as soon as it shows (plays Act 1 end to end)
//   &frame=K       grant level 5 + the licence fee, buy frame K (brawler|gunner|ghost) and fight with it
//   &frames=1      after the contracts: buy all three frames (credits granted) and play one contract with each
const P1_ARCH = ['courier', 'pest', 'retrieve', 'surveil'];
const ORDER = ['brawler', 'gunner', 'ghost'];

export function createAutopilot(G, { ui, player }) {
  const Q = new URLSearchParams(location.search);
  const want = +(Q.get('contracts') || 2);
  const storyMode = Q.has('story');
  const frameK = Q.get('frame');
  const framesTour = Q.has('frames');
  const A = {
    phase: 'title', attackHeld: false, t: 0, tick: 0, done: [], archetypes: [], stuckT: 0, lastPos: null, side: null, sideT: 0,
    frBefore: null, frAfter: null, weaponBefore: null, weaponAfter: null, finished: false, result: null, fails: 0, tour: [], bought: [], perFrame: {},
  };
  const $ = (s) => document.querySelector(s);
  const click = (el) => { if (!el) return false; el.click(); return true; };

  function chooseContract() {
    const list = toUiBoard(G.sim).contracts;
    const story = list.findIndex((c) => c.story);
    if (story >= 0 && (G.contractsDone === 0 || storyMode)) return story;
    const ok = (c) => !c.story && !(c.modifiers || []).some((m) => /Ghost/.test(m.label));
    let i = -1;
    if (!storyMode && !frameK && !framesTour) i = list.findIndex((c) => ok(c) && P1_ARCH.includes(c.archetype) && !A.archetypes.includes(c.archetype));
    if (i < 0) i = list.findIndex((c) => ok(c) && !A.archetypes.includes(c.archetype));
    if (i < 0) i = list.findIndex(ok);
    if (i < 0) i = list.findIndex((c) => !c.story);
    return Math.max(0, i);
  }

  function nearestHostile(r) {
    let best = null, bd = r;
    for (const e of G.enemies.alive()) {
      if (e.state === 'dead' || e.ally || e.escort) continue;
      const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
      const engaged = e.state === 'chase' || e.state === 'flee' || (G.runner.active && e.mission === G.runner.mission?.id && !G.runner.active.stealth && !e.watcher);
      if (d < bd && engaged) { bd = d; best = e; }
    }
    return best;
  }
  const countNear = (r, at = player.pos) => G.enemies.alive().filter((e) => !e.ally && e.state !== 'idle' && Math.hypot(e.pos.x - at.x, e.pos.z - at.z) < r).length;

  function goTo(x, z, stop = 0.8) {
    if (A.sideT > 0 && A.side) { player.setTarget({ x: player.pos.x + A.side.x * 3, z: player.pos.z + A.side.z * 3 }); A.goal = null; return; }
    const key = `${x.toFixed(0)},${z.toFixed(0)}`;
    if (A.goal === key && player.moveTarget) return;
    A.goal = key;
    G.walkTo(x, z, stop);
  }

  function stuckCheck(dt, moving) {
    const p = player.pos;
    if (A.lastPos && moving && Math.hypot(p.x - A.lastPos.x, p.z - A.lastPos.z) < 0.02) A.stuckT += dt; else A.stuckT = Math.max(0, A.stuckT - dt);
    A.lastPos = { x: p.x, z: p.z };
    A.sideT -= dt;
    if (A.stuckT > 1.2) { const a = Math.random() * Math.PI * 2; A.side = { x: Math.sin(a), z: Math.cos(a) }; A.sideT = 1.0; A.stuckT = 0; }
  }

  function finish(ok, why) {
    if (A.finished) return;
    A.finished = true; A.phase = ok ? 'done' : 'failed';
    A.result = { ok, why, contracts: A.done, archetypes: A.archetypes, frBefore: A.frBefore, frAfter: A.frAfter, weaponBefore: A.weaponBefore, weaponAfter: A.weaponAfter,
      level: G.sim?.state.player.level, credits: G.sim?.state.credits, story: G.sim?.state.story.done.slice(), bought: A.bought, tour: A.tour, playMin: +((G.sim?.state.playSeconds || 0) / 60).toFixed(1),
      metrics: feel(), errors: (window.__bootErrors || []).slice() };
    G.log.push('AUTO ' + JSON.stringify(A.result));
    player.setTarget(null);
    A.attackHeld = false;
  }

  function feel() {
    const out = {};
    for (const [k, m] of Object.entries(G.combat?.metrics || {})) out[k] = { hits: m.hits, avgDist: m.distN ? +(m.distSum / m.distN).toFixed(2) : null, backstabShare: m.meleeHits ? +(m.backstabs / m.meleeHits).toFixed(3) : 0, backstabDmgShare: m.dmg ? +(m.backstabDmg / m.dmg).toFixed(3) : 0, kills: m.kills };
    return out;
  }

  // --- per-frame fighting ---------------------------------------------------------------------------------
  const ready = (id) => { const s = G.sim.skillsHud().find((x) => x.id === id); return s && s.ready && !(s.cd > 0); };
  function fight(foe) {
    const pc = G.sim.playerCombatant();
    const k = G.sim.activeFrame().archetype;
    const d = Math.hypot(foe.pos.x - player.pos.x, foe.pos.z - player.pos.z);
    G.combat.lock = foe;
    // step out of telegraphed stomps / charges
    const tele = G.enemies.alive().find((e) => e.tele && Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) < (e.tele.skill.radius || e.tele.skill.range || 3) + 1.5);
    if (tele && Math.random() < 0.6 && G.combat.dodge({ x: player.pos.x - tele.pos.x, z: player.pos.z - tele.pos.z })) return;
    if (pc.hp < pc.stats.hp * 0.35 && (G.sim.state.consumables.repairKit || 0) > 0) G.useKit?.();
    if (k === 'gunner') return gunner(foe, d, pc);
    if (k === 'ghost') return ghost(foe, d, pc);
    if (k === 'brawler') {
      if (ready('s3') && pc.hp < pc.stats.hp * 0.65 && countNear(8) >= 2) G.combat.skill('s3');
      else if (ready('s1') && countNear(4.2) >= 2) G.combat.skill('s1');
      else if (ready('s2') && d > 4.5 && d < 9) G.combat.skill('s2');
    }
    if (G.combat.inReach(foe)) { player.setTarget(null); A.attackHeld = true; }
    else { A.goal = null; goTo(foe.pos.x, foe.pos.z, 1.0); if (k === 'rental' && d < 12 && pc.energy > 20 && Math.random() < 0.08) G.combat.skill('s1'); }
    if (pc.hp < pc.stats.hp * 0.35 && Math.random() < 0.15) G.combat.dodge({ x: player.pos.x - foe.pos.x, z: player.pos.z - foe.pos.z });
  }

  // kite: hold 9–13 m, fire standing still (Steady Hands), shotgun what gets close
  function gunner(foe, d, pc) {
    const close = countNear(6);
    if (ready('s3') && countNear(14) >= 2) G.combat.skill('s3');
    if (ready('s1') && d < 6) G.combat.skill('s1');
    else if (ready('s2') && d > 7 && foe.c.hp > foe.c.stats.hp * 0.4) G.combat.skill('s2');
    if (d < 7.5 || close) {
      const ax = player.pos.x - foe.pos.x, az = player.pos.z - foe.pos.z, l = Math.hypot(ax, az) || 1;
      let tx = player.pos.x + ax / l * 7, tz = player.pos.z + az / l * 7;
      if (G.nav.blocked(tx, tz)) { tx = player.pos.x - az / l * 7; tz = player.pos.z + ax / l * 7; }
      if (G.nav.blocked(tx, tz)) { tx = player.pos.x + az / l * 7; tz = player.pos.z - ax / l * 7; }
      A.goal = null; goTo(tx, tz, 0.5);
      if (d < 3 && Math.random() < 0.2) G.combat.dodge({ x: ax, z: az });
      A.attackHeld = d < 14;
      return;
    }
    if (d > 14 || !G.combat.inReach(foe)) { A.goal = null; goTo(foe.pos.x, foe.pos.z, 11); A.attackHeld = false; return; }
    player.setTarget(null); A.attackHeld = true;
  }

  // ghost: veil in, shadow-step behind, stab the back; hack pulse a crowd
  function ghost(foe, d, pc) {
    if (ready('s3') && countNear(6) >= 2) G.combat.skill('s3');
    if (!pc.hidden && ready('s1') && d < 14 && d > 4 && foe.state !== 'idle') G.combat.skill('s1');
    const behind = G.combat.relAngle(foe) > Math.PI * 2 / 3;
    if (!behind && ready('s2') && d < 8 && foe.state !== 'idle') { G.combat.skill('s2'); return; }
    // circle to the back unless it's already turned away or busy
    const by = foe.yaw ?? 0;
    const bx = foe.pos.x - Math.sin(by) * 1.5, bz = foe.pos.z - Math.cos(by) * 1.5;
    const engagedOnMe = foe.state === 'chase' && !foe.tauntT && !foe.pending && foe.c.alerted;
    if (!behind && d < 5 && engagedOnMe && !G.nav.blocked(bx, bz) && Math.random() < 0.5) { A.goal = null; goTo(bx, bz, 0.4); A.attackHeld = false; return; }
    if (G.combat.inReach(foe)) { player.setTarget(null); A.attackHeld = true; }
    else { A.goal = null; goTo(behind ? foe.pos.x : bx, behind ? foe.pos.z : bz, 0.6); }
    if (pc.hp < pc.stats.hp * 0.4 && Math.random() < 0.2) G.combat.dodge({ x: player.pos.x - foe.pos.x, z: player.pos.z - foe.pos.z });
  }

  // --- warehouse errands ------------------------------------------------------------------------------------
  function wantFrame() {
    const S = G.sim.state;
    if (frameK && !A.bought.includes(frameK)) return frameK;
    if (framesTour && G.contractsDone >= 1 + want) { const k = ORDER.find((x) => !A.bought.includes(x)); if (k) return k; }
    // a player buys the first frame as soon as the (discounted) licence is affordable
    if (!frameK && !framesTour && !S.frames.some((f) => !f.rental) && S.player.level >= 5 && S.credits >= G.sim.framePrice()) return 'brawler';
    return null;
  }

  function step(dt) {
    if (A.finished) return;
    const titleNew = $('.hf-title [data-a="new"]');
    if (titleNew && A.phase === 'title') { if (A.t > 1.2) click(titleNew); return; }
    const cont = $('.hf-complete .cp-go');
    if (cont) { if ((A.cpT = (A.cpT || 0) + 0.25) > 2.5) { A.cpT = 0; click(cont); } return; }
    const redeploy = $('.hf-scr [data-a="redeploy"]');
    if (redeploy) { A.fails++; click(redeploy); return; }
    if (ui.dialogue.open) {
      const ch = document.querySelector('.hf-dlg .hf-choice');
      if (ch) click(ch); else click($('.hf-dlg'));
      return;
    }
    if (G.state !== 'free' || G.frames?.busy) return;
    const S = G.sim.state;
    const panel = ui.panel.current;
    const buy = wantFrame();

    if (panel === 'contracts') {
      if (S.contract) { ui.panel.close(); return; }
      if ((A.pT = (A.pT || 0) + 0.25) < 1) return;
      A.pT = 0;
      const i = chooseContract();
      const btn = document.querySelectorAll('.cc-go')[i] || document.querySelector('.cc-go');
      if (!click(btn)) ui.panel.close();
      return;
    }
    if (panel === 'warehouse') {
      if ((A.wT = (A.wT || 0) + 0.25) < 1.2) return;
      if (buy) {
        A.wT = 0;
        if ((frameK || framesTour) && S.credits < G.sim.framePrice()) G.sim.addCredits(G.sim.framePrice() - S.credits + 50, 'autopilot');
        const r = ui.emit('warehouse:buy', { kind: buy });
        A.bought.push(buy);
        G.log.push(`AUTO bought ${buy} ${JSON.stringify(r || {})}`);
        if (!G.sim.state.frames.some((f) => f.frameId === buy)) { ui.panel.close(); }
        return;
      }
      if (A.phase === 'warehouse') {
        A.weaponBefore = G.sim.activeFrame().equipped.weapon; A.frBefore = G.sim.frameFR();
        const best = $('.wd-best');
        if (best) click(best); else ui.emit('warehouse:autoEquip', { frameId: S.activeFrame });
        A.phase = 'warehouse2'; A.wT = 0; return;
      }
      if (A.phase === 'warehouse2') {
        A.weaponAfter = G.sim.activeFrame().equipped.weapon; A.frAfter = G.sim.frameFR();
        ui.panel.close();
        A.phase = 'equipped';
        if (!framesTour && !storyMode) finish(true, 'all phases complete');
        return;
      }
      ui.emit('warehouse:autoEquip', { frameId: S.activeFrame });
      ui.panel.close();
      return;
    }
    if (panel) { ui.panel.close(); return; }
    if (A.finished) return;

    const pc = G.sim.playerCombatant();
    A.attackHeld = false;
    const foe = nearestHostile(G.sim.activeFrame().archetype === 'gunner' ? 16 : 11);
    if (foe) { A.phase = 'fight'; fight(foe); return; }
    if (G.runner.active) {
      const st = G.runner.active.step;
      A.phase = 'mission:' + (st?.type || '?');
      if (pc.hp < pc.stats.hp * 0.5 && (S.consumables.repairKit || 0) > 0) G.useKit?.();
      const lbl = G.runner.interactLabel();
      if (lbl && !(st?.type === 'hack' && G.runner.active.ss.hacking)) { player.setTarget(null); click($('.hf-interact')) || ui.emit('interact'); return; }
      if (st?.type === 'hack' && G.runner.active.ss.hacking) { player.setTarget(null); return; }
      const o = G.runner.objective();
      if (st?.type === 'destroy' && o) {
        const d = Math.hypot(o.x - player.pos.x, o.z - player.pos.z);
        if (d < (G.sim.activeFrame().archetype === 'gunner' ? 12 : 2.6)) { player.setTarget(null); A.attackHeld = true; return; }
      }
      if (st?.type === 'photo' && o) {
        const d = Math.hypot(o.x - player.pos.x, o.z - player.pos.z);
        if (d < 10 && d > 4) { player.setTarget(null); return; }
        goTo(o.x, o.z, 6);
        return;
      }
      if (st?.type === 'escort' && G.runner.active.ss.npc) {
        const n = G.runner.active.ss.npc, wp = G.runner.active.ss.path?.[G.runner.active.ss.wp] || n.pos;
        const ax = wp.x - n.pos.x, az = wp.z - n.pos.z, l = Math.hypot(ax, az) || 1;
        goTo(n.pos.x + ax / l * 4, n.pos.z + az / l * 4, 1.5);
        return;
      }
      if (st?.type === 'defend' && o) { const d = Math.hypot(o.x - player.pos.x, o.z - player.pos.z); if (d < 6) { player.setTarget(null); return; } }
      if (o) goTo(o.x, o.z, 0.8);
      return;
    }
    // free roam: kiosk intro → warehouse errands → contracts → warehouse
    if (!S.flags.kioskDone) { A.phase = 'kiosk'; const k = window.__game.world.spawnPoints.kiosk; goTo(k.x, k.z, 1.5); return; }
    // &storyat=a1_m4: jump the story to that mission (test hook)
    const at = Q.get('storyat');
    if (at && !A.jumped) {
      A.jumped = true;
      const ids = ['a1_m1', 'a1_m2', 'a1_m3', 'a1_m4', 'a1_m5'], gates = { a1_m1: 1, a1_m2: 2, a1_m3: 3, a1_m4: 5, a1_m5: 7 };
      const S2 = G.sim.state;
      S2.story.done = ids.slice(0, ids.indexOf(at)); S2.story.mission = at; S2.flags.boardUnlocked = true;
      while (S2.player.level < gates[at]) G.sim.giveXp(200, 'autopilot');
      G.contractsDone = Math.max(G.contractsDone, 1);
      G.sim.refreshBoard();
    }
    if (frameK && !A.bought.includes(frameK) && G.contractsDone === 0 && !A.granted) {
      A.granted = true;
      if (S.player.level < 5) G.sim.giveXp(1600, 'autopilot');
      S.flags.kioskDone = true;
    }
    if (buy) { A.phase = 'buy:' + buy; ui.emit('warehouse'); return; }
    if (framesTour && G.contractsDone >= 1 + want) {
      // one contract per bought frame, then done
      const k = G.sim.activeFrame().archetype;
      const played = A.tour.filter((x) => x === k).length;
      if (!played && A.bought.includes(k) && A.tourStart !== G.contractsDone) { A.tourStart = G.contractsDone; A.tourFrame = k; }
      if (A.tourFrame && G.contractsDone > A.tourStart) { A.tour.push(A.tourFrame); A.tourFrame = null; }
      const next = ORDER.find((x) => A.bought.includes(x) && !A.tour.includes(x));
      if (!next) { finish(true, 'frames tour complete'); return; }
      if (k !== next) { const f = S.frames.find((x) => x.frameId === next); ui.emit('warehouse:activate', { frameId: f.uid }); return; }
      A.phase = 'board'; ui.emit('contracts'); return;
    }
    const goal = storyMode ? 99 : want;
    if (storyMode && S.story.done.includes('a1_m5')) { finish(true, 'act 1 complete'); return; }
    if (G.contractsDone < 1 + goal) { A.phase = 'board'; if (G.contractsDone > A.done.length) syncDone(); ui.emit('contracts'); return; }
    syncDone();
    if (A.phase !== 'warehouse' && A.phase !== 'warehouse2') { A.phase = 'warehouse'; A.wT = 0; ui.emit('warehouse'); }
  }

  function syncDone() {
    const l = G.log.filter((x) => x.includes(' complete ')).map((x) => x.split(' complete ')[1].split(' ')[0]);
    A.done = l;
  }

  return Object.assign(A, {
    feel,
    update(dt) {
      A.t += dt;
      if (G.runner?.active && !A.archetypes.includes(G.runner.mission.archetype) && !G.runner.mission.story) A.archetypes.push(G.runner.mission.archetype);
      stuckCheck(dt, !!player.moveTarget);
      if ((A.tick -= dt) > 0) return;
      A.tick = 0.25;
      try { step(dt); } catch (e) { console.error('autopilot', e); finish(false, String(e.message || e)); }
      const cap = +(Q.get('autocap') || (storyMode ? 9000 : 900));
      if (A.t > cap && !A.finished) finish(false, 'timeout in phase ' + A.phase);
    },
  });
}
