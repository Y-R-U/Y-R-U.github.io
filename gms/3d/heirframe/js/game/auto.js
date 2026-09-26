import { toUiBoard } from '../sim/ui_adapt.js';

// ?auto=1 test pilot: title → intro → A1-M1 → 2 random contracts → Warehouse equip. Drives the real UI (DOM clicks)
// for screens/panels and the same player/combat calls the touch controls use. Progress in __game.runtime.auto.
const P1_ARCH = ['courier', 'pest', 'retrieve', 'surveil'];

export function createAutopilot(G, { ui, player }) {
  const Q = new URLSearchParams(location.search);
  const want = +(Q.get('contracts') || 2);
  const A = {
    phase: 'title', attackHeld: false, t: 0, tick: 0, done: [], archetypes: [], stuckT: 0, lastPos: null, side: null, sideT: 0,
    frBefore: null, frAfter: null, weaponBefore: null, weaponAfter: null, finished: false, result: null, fails: 0,
  };
  const $ = (s) => document.querySelector(s);
  const click = (el) => { if (!el) return false; el.click(); return true; };
  const visible = (el) => !!el && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden';

  function chooseContract() {
    const b = toUiBoard(G.sim);
    const list = b.contracts;
    let i = G.contractsDone === 0 ? list.findIndex((c) => c.story) : -1;
    if (i < 0) i = list.findIndex((c) => !c.story && P1_ARCH.includes(c.archetype) && !A.archetypes.includes(c.archetype) && !(c.modifiers || []).some((m) => /Ghost/.test(m.label)));
    if (i < 0) i = list.findIndex((c) => !c.story && P1_ARCH.includes(c.archetype));
    if (i < 0) i = list.findIndex((c) => !c.story);
    if (i < 0) i = 0;
    return i;
  }

  function nearestHostile(r) {
    let best = null, bd = r;
    for (const e of G.enemies.alive()) {
      if (e.state === 'dead') continue;
      const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
      const engaged = e.state !== 'idle' || (G.runner.active && e.mission === G.runner.mission?.id && !G.runner.active.stealth);
      if (d < bd && engaged) { bd = d; best = e; }
    }
    return best;
  }

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
    A.result = { ok, why, contracts: A.done, archetypes: A.archetypes, frBefore: A.frBefore, frAfter: A.frAfter, weaponBefore: A.weaponBefore, weaponAfter: A.weaponAfter, level: G.sim?.state.player.level, credits: G.sim?.state.credits, errors: (window.__bootErrors || []).slice() };
    G.log.push('AUTO ' + JSON.stringify(A.result));
    player.setTarget(null);
    A.attackHeld = false;
  }

  function step(dt) {
    if (A.finished) return;   // hands off: tests drive the game after the run
    // screens
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
    if (G.state !== 'free') return;
    const S = G.sim.state;
    const panel = ui.panel.current;

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
      if (A.phase === 'warehouse') {
        A.weaponBefore = G.sim.activeFrame().equipped.weapon; A.frBefore = G.sim.frameFR();
        const best = $('.wd-best');
        if (best) click(best); else ui.emit('warehouse:autoEquip', { frameId: S.activeFrame });
        A.phase = 'warehouse2'; A.wT = 0; return;
      }
      A.weaponAfter = G.sim.activeFrame().equipped.weapon; A.frAfter = G.sim.frameFR();
      ui.panel.close();
      finish(true, 'all phases complete');
      return;
    }
    if (panel) { ui.panel.close(); return; }
    if (A.finished) return;

    const pc = G.sim.playerCombatant();
    const foe = nearestHostile(10);
    A.attackHeld = false;
    if (foe) {
      A.phase = 'fight';
      const d = Math.hypot(foe.pos.x - player.pos.x, foe.pos.z - player.pos.z);
      if (G.combat.inReach(foe)) { player.setTarget(null); A.attackHeld = true; G.combat.lock = foe; }
      else { A.goal = null; goTo(foe.pos.x, foe.pos.z, 1.0); if (d < 12 && pc.energy > 20 && Math.random() < 0.08) G.combat.skill('s1'); }
      if (pc.hp < pc.stats.hp * 0.35 && Math.random() < 0.15) G.combat.dodge({ x: player.pos.x - foe.pos.x, z: player.pos.z - foe.pos.z });
      return;
    }
    if (G.runner.active) {
      A.phase = 'mission:' + (G.runner.active.step?.type || '?');
      const lbl = G.runner.interactLabel();
      if (lbl) { player.setTarget(null); click($('.hf-interact')) || ui.emit('interact'); return; }
      const st = G.runner.active.step;
      const o = G.runner.objective();
      if (st?.type === 'destroy' && o) {
        const d = Math.hypot(o.x - player.pos.x, o.z - player.pos.z);
        if (d < 2.6) { player.setTarget(null); A.attackHeld = true; return; }
      }
      if (st?.type === 'photo' && o) {
        const d = Math.hypot(o.x - player.pos.x, o.z - player.pos.z);
        if (d < 10 && d > 4) { player.setTarget(null); return; }
        goTo(o.x, o.z, 6);
        return;
      }
      if (o) goTo(o.x, o.z, 0.8);
      return;
    }
    // free roam: kiosk intro → contracts → warehouse
    if (!S.flags.kioskDone) { A.phase = 'kiosk'; const k = window.__game.world.spawnPoints.kiosk; goTo(k.x, k.z, 1.5); return; }
    if (G.contractsDone < 1 + want) { A.phase = 'board'; if (G.contractsDone > A.done.length) syncDone(); ui.emit('contracts'); return; }
    syncDone();
    if (A.phase !== 'warehouse' && A.phase !== 'warehouse2') { A.phase = 'warehouse'; A.wT = 0; ui.emit('warehouse'); }
  }

  function syncDone() {
    const l = G.log.filter((x) => x.includes(' complete ')).map((x) => x.split(' complete ')[1].split(' ')[0]);
    A.done = l;
  }

  return Object.assign(A, {
    update(dt) {
      A.t += dt;
      if (G.runner?.active && !A.archetypes.includes(G.runner.mission.archetype) && !G.runner.mission.story) A.archetypes.push(G.runner.mission.archetype);
      stuckCheck(dt, !!player.moveTarget);
      if ((A.tick -= dt) > 0) return;
      A.tick = 0.25;
      try { step(dt); } catch (e) { console.error('autopilot', e); finish(false, String(e.message || e)); }
      if (A.t > 900 && !A.finished) finish(false, 'timeout in phase ' + A.phase);
    },
  });
}
