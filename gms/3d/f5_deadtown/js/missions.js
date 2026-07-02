// Data-driven mission chain, loaded from config key `game` (editable in the
// level editor's Missions panel). Sequential like a story: each step has a
// done() predicate over game state; main calls check() ~1/s, advancing with a
// toast + optional reward. Types:
//   flag   — a game flag (set by hotspots' `sets`)        { flag }
//   weapon — the player owns weapon id                    { weapon }
//   kills  — total kills ≥ n                              { n }
//   level  — the player has visited level id              { level }
// Reward: { medkit: n } and/or { ammo: kind, n }.

export function createMissions(defs, ctx, bus) {
  const P = ctx.player;
  const done = (m) => {
    switch (m.type) {
      case 'flag':   return ctx.flags.has(m.flag);
      case 'weapon': return P.weapons.includes(m.weapon);
      case 'kills':  return P.kills >= (m.n || 1);
      case 'level':  return ctx.visited.has(m.level);
      default: return false;
    }
  };
  let i = 0;
  const chain = Array.isArray(defs) ? defs : [];

  const cur = () => (i < chain.length ? chain[i] : null);
  const text = () => {
    const m = cur();
    if (!m) return `✔ You survived day one — keep moving (${P.kills} down)`;
    return m.title + (m.hint ? ` — ${m.hint}` : '');
  };
  function check() {
    let advanced = false;
    while (i < chain.length && done(chain[i])) {
      const m = chain[i];
      bus.toast?.(`✅ ${m.title}`);
      if (m.reward) {
        if (m.reward.medkit) P.addMedkit(m.reward.medkit);
        if (m.reward.ammo && m.reward.n) P.addAmmo(m.reward.ammo, m.reward.n);
      }
      bus.celebrate?.();
      i++; advanced = true;
      const n = cur();
      if (n) bus.toast?.(`🎯 ${n.title}`);
    }
    return advanced;
  }
  return { cur, text, check, serialize: () => i, load: (n) => { i = Math.min(n || 0, chain.length); } };
}
