// Heat responders (DESIGN §11.2). The sim owns the stars (gain, 3-minute decay); this spawns the Concord response:
// 1★ a Warden Eye tails you · 2★ Warden pairs engage on sight · 3★ hunting patrols · 4★ Lancers + Enforcer squads
// · 5★ everything, faster. Responders arrive from the district edge, hunt without leashing, and stand down when the
// stars go out. Choir Angel squads at 5★ are Act 2+ (P3).
const WAVES = {
  1: { every: 0, max: 1, units: [['warden_eye', 'grunt']] },
  2: { every: 55, max: 3, units: [['warden', 'grunt'], ['warden', 'grunt'], ['warden_eye', 'grunt']] },
  3: { every: 40, max: 5, units: [['warden', 'grunt'], ['warden', 'veteran'], ['warden', 'grunt'], ['warden_eye', 'grunt']] },
  4: { every: 34, max: 7, units: [['enforcer', 'grunt'], ['lancer', 'grunt'], ['warden', 'grunt'], ['warden', 'grunt']] },
  5: { every: 26, max: 9, units: [['enforcer', 'veteran'], ['lancer', 'grunt'], ['lancer', 'grunt'], ['warden', 'grunt'], ['warden_eye', 'grunt']] },
};
const BARK = { 2: 'b_warden_spot_', 3: 'b_warden_backup_', 4: 'b_enforcer_aggro_', 5: 'b_secbot_backup_' };

export function createHeat(ctx) {
  const { sim, enemies, world, player, ui, audio } = ctx;
  const H = { stars: 0, t: 8, eye: null, squads: [], lastStars: 0, spawned: 0 };

  const responders = () => enemies.list.filter((e) => e.heat && e.state !== 'dead');

  function edgeSpot(minD = 26, maxD = 38) {
    const edges = world.sites.filter((s) => s.tag === 'spawn_edge' || s.tag === 'alley' || s.tag === 'relay');
    let best = null, bd = Infinity;
    for (const s of edges) {
      const d = Math.hypot(s.x - player.pos.x, s.z - player.pos.z);
      const score = d < minD ? 1e3 + (minD - d) : d > maxD ? d - maxD : 0;
      if (score < bd) { bd = score; best = s; }
    }
    if (best && bd < 1e3) {
      const d = Math.hypot(best.x - player.pos.x, best.z - player.pos.z);
      if (d > maxD) return { x: player.pos.x + (best.x - player.pos.x) / d * maxD, z: player.pos.z + (best.z - player.pos.z) / d * maxD };
      return best;
    }
    const a = Math.random() * Math.PI * 2;
    const p = { x: player.pos.x + Math.sin(a) * maxD, z: player.pos.z + Math.cos(a) * maxD };
    const q = ctx.nav?.nearest(p.x, p.z);
    return q || p;
  }

  function spawnSquad(stars) {
    const W = WAVES[stars];
    const lvl = sim.state.player.level + Math.max(0, stars - 2);
    const at = edgeSpot();
    const n = W.units.length;
    const ents = W.units.map(([defId, rank], k) => {
      let x = at.x + Math.sin(k * 2.1) * 2, z = at.z + Math.cos(k * 2.1) * 2;
      if (world.blocked(x, z, 0.5)) { const q = ctx.nav?.nearest(x, z); if (q) { x = q.x; z = q.z; } }
      const e = enemies.spawn({ defId, rank, level: lvl }, x, z, { hostile: stars >= 3, guard: stars < 3, yaw: Math.atan2(player.pos.x - x, player.pos.z - z) });
      e.heat = stars; e.hunter = stars >= 3;
      if (stars === 2) { e.home.set(player.pos.x, 0, player.pos.z); }
      return e;
    });
    H.spawned += n;
    audio.bark(BARK[stars] || 'b_warden_spot_', { x: at.x, z: at.z, cooldown: 12 });
    if (stars >= 4) ui.toast(stars === 5 ? 'Every unit in the district is coming' : 'Enforcer squad deployed', 'bad', { ms: 2200 });
    ctx.log?.(`heat squad ${stars}★ x${n}`);
    return ents;
  }

  function standDown() {
    for (const e of responders()) {
      e.hunter = false;
      if (e.state !== 'dead' && Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) > 30) enemies.clear((x) => x === e);
      else { e.state = 'search'; e.searchT = 3; e.c.alerted = false; e.bot.setAlert(1); e.lastSeen = player.pos.clone(); }
    }
    audio.bark('b_warden_search_', { cooldown: 20 });
  }

  function update(dt, { paused = false, calm = false } = {}) {
    const stars = Math.floor(sim.state.factions.heat + 1e-9);
    if (stars !== H.lastStars) {
      if (stars > H.lastStars && stars >= 2) { H.t = Math.min(H.t, 4); ui.sting(`${stars}-star Heat`, ['', '', 'Wardens engage on sight', 'Patrols are hunting you', 'Lancers and Enforcers deployed', 'The whole district is after you'][stars], 'alert', 2200); }
      if (stars === 0 && H.lastStars > 0) { standDown(); ui.toast('Heat cleared', 'good', { sub: 'The Wardens lost interest' }); }
      H.lastStars = stars;
    }
    H.stars = stars;
    if (paused || calm || !stars) return;
    // 1★+: a Warden Eye shadows you from a distance
    if (!H.eye || H.eye.state === 'dead' || !enemies.list.includes(H.eye)) {
      if ((H.eyeT = (H.eyeT ?? 3) - dt) <= 0) { H.eyeT = 20; const [e] = spawnSquadEye(); H.eye = e; }
    } else if (H.eye.state === 'idle') {
      H.eye.home.set(player.pos.x + 6, 0, player.pos.z - 5);
      if (stars >= 2) enemies.alert(H.eye, 'heat');
    }
    if (stars < 2) return;
    const W = WAVES[stars];
    const live = responders().length;
    if ((H.t -= dt) <= 0 && live < W.max) { H.t = W.every; spawnSquad(stars); }
    // wardens on sight at 2★: once they see you they hunt
    for (const e of responders()) if (e.state === 'chase' && !e.hunter) e.hunter = true;
  }

  function spawnSquadEye() {
    const at = edgeSpot(18, 26);
    const e = enemies.spawn({ defId: 'warden_eye', level: sim.state.player.level }, at.x, at.z, { guard: true });
    e.heat = 1;
    return [e];
  }

  return { update, get stars() { return H.stars; }, responders, standDown };
}
