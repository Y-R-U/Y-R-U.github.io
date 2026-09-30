import * as THREE from 'three';

export const EPILOGUE_LINE = 'A BRIGHTER FUTURE — TOGETHER. FOR REAL THIS TIME.';

// Acts 5–6 runtime bits that aren't a boss: Walk as Yourself (Wren's own body), Seraph watching the hull (A5-M4),
// the Voices fleeing (A6-M2), and the world state the story leaves behind (the Meridian core gone, the Helm's mode,
// the rewritten billboards), re-applied every time a district loads.
export function createFinale(G, { world, robots, tier, player, fx, audio, ui, rig }) {
  const v = new THREE.Vector3();
  const S = () => G.sim.state.story;
  const done = (id) => S().done.includes(id);

  // ---- Walk as Yourself -----------------------------------------------------------------------------------
  let human = null;
  function humanOn() {
    if (human) return;
    let a;
    try { a = robots.createRobot({ kind: 'human', seed: 1, quality: tier.name }); } catch (e) { console.warn('human body failed', e); return; }
    const old = player.actor;
    world.scene.remove(old.root);
    world.scene.add(a.root);
    player.setActor(a);
    human = { old, actor: a };
    fx.flash(v.set(player.pos.x, player.pos.y + 1, player.pos.z), 1, 0xfff0d0, 0.3);
    ui?.controls?.setAttack?.({ icon: 'fist' });
    ui?.root?.classList.add('hf-human');
    G.log.push('human on');
  }
  function humanOff() {
    if (!human) return;
    world.scene.remove(human.actor.root);
    human.actor.dispose?.();
    world.scene.add(human.old.root);
    player.setActor(human.old);
    G.combat?.reset();
    human = null;
    fx.beam(player.pos, 0xffc860, 0.9, 7, 1.4);
    fx.ring(player.pos, 2.4, 0xffc860, 0.5);
    audio.sfx('contract_accept', { vol: 0.8 });
    ui?.root?.classList.remove('hf-human');
    G.log.push('human off');
  }

  // ---- A5-M4: she flies off once you've scanned her ---------------------------------------------------------
  function seraphLeaves() {
    const t = G.runner.active?.target;
    if (!t) return;
    fx.beam(t.pos, 0xffe6a0, 1.0, 18, 1.6);
    audio.sfx('flyby', { vol: 0.9 });
    const bot = t.bot, y0 = bot.root.position.y, t0 = performance.now();
    t.brain = () => true;
    const tick = () => {
      const u = Math.min(1, (performance.now() - t0) / (1100 / G.speed));
      bot.root.position.y = y0 + 22 * u * u;
      if (u < 1) requestAnimationFrame(tick); else G.enemies.clear((e) => e === t);
    };
    tick();
  }

  // ---- A6-M2: the five surviving Voices beam out of their thrones ---------------------------------------------
  async function voicesFlee() {
    const thrones = world.ctx?.helm?.voices || [];
    const list = thrones.length ? thrones : [1, 3, 4, 5, 7].map((n) => world.sites.find((s) => s.id === `hl_throne_${n}`)).filter(Boolean);
    const five = list.filter((_, i) => i !== 1 && i !== 5).slice(0, 5);
    for (const p of five) {
      fx.beam(v.set(p.x, world.groundAt(p.x, p.z), p.z), 0xffd36b, 0.8, 14, 1.4);
      audio.sfx('scan', { x: p.x, z: p.z, vol: 0.7 });
      await new Promise((r) => setTimeout(r, 260 / G.speed));
    }
  }

  // ---- world state the story leaves behind -------------------------------------------------------------------
  const SURFACE = ['aurum_plaza', 'brightline', 'terraces', 'portside', 'arcology', 'stacks'];
  function apply(id = world.district?.id) {
    if (!G.sim) return;
    const ch = S().choices;
    if (id === 'meridian' && (done('a5_m2') || G.runner?.active?.mission.story?.id === 'a5_m2' && G.coreTaken)) { const c = world.ctx?.meridian?.core; if (c) c.visible = false; }
    if (id === 'helm' && world.ctx?.helm) world.ctx.helm.setMode(done('a6_m5') ? (ch.ending === 'open' ? 'open' : 'calm') : 'calm');
    if (done('a6_m5') && SURFACE.includes(id) && world.billboards?.show) world.billboards.show('epilogue', { line: EPILOGUE_LINE, fade: 0.01 });
  }
  if (world.onDistrict) world.onDistrict((w, id) => setTimeout(() => apply(id), 0));

  function hideCore() {
    G.coreTaken = true;
    const c = world.ctx?.meridian?.core;
    if (c) { fx.flash(c.position, 1.2, 0xffd08a, 0.3); fx.sparks(c.position, 0xffd08a, 14, 4); c.visible = false; }
  }

  // ---- epilogue: back to Aurum Plaza under the rewritten billboards ------------------------------------------
  async function epilogue(id) {
    player.frozen = true;
    ui?.hideHud(true);
    await G.districts.travel('aurum_plaza', { reason: 'story', via: 'dev', quiet: true });   // soft travel: Heat can't lock the ending out
    apply('aurum_plaza');
    G.state = 'intro';
    const p0 = player.pos.clone();
    rig.fixed = { pos: new THREE.Vector3(p0.x + 6, p0.y + 3, p0.z + 9), look: new THREE.Vector3(-4, 12, -40), fov: 50 };
    await G.story.run(id, 'epilogue');
    while (G.story.busy) await new Promise((r) => setTimeout(r, 200));
    rig.fixed = null;
    rig.target.copy(player.pos); rig.snap();
    G.state = 'free';
    ui?.hideHud(false);
    player.frozen = false;
  }
  function theEnd() {
    const c = S().choices;
    ui?.sting('HEIRFRAME', `${c.ending === 'open' ? 'You opened the sky' : 'You kept the sky, for now'} · the board is still open`, 'story', 5200);
    audio.sting?.('win');
  }

  return { humanOn, humanOff, get human() { return !!human; }, seraphLeaves, voicesFlee, apply, hideCore, epilogue, theEnd };
}
