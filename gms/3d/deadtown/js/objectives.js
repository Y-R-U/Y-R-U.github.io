// A light mission chain so there's a reason to explore and fight, not just
// endless wandering. Each objective is a one-liner with a done() predicate;
// main calls check() each second, advancing through the chain with a toast +
// a small reward, and shows the current one in the HUD. Add steps by extending
// CHAIN. ctx = { player, visited:Set<interiorId>, get kills() }.

export function createObjectives(ctx, bus) {
  const P = ctx.player;
  const has = (...ids) => ids.some(id => P.weapons.includes(id));
  const CHAIN = [
    { id: 'gearup', text: 'Find a real firearm',        hint: 'scavenge the streets', done: () => has('shotgun', 'rifle', 'smg', 'revolver', 'machinegun'), reward: () => P.addMedkit(1) },
    { id: 'armory', text: 'Raid the police armory',      hint: 'NE — follow the minimap', done: () => ctx.visited.has('police'), reward: () => P.addAmmo('rifle', 30) },
    { id: 'cull',   text: 'Thin the horde — 25 kills',   hint: '', done: () => P.kills >= 25, reward: () => { P.addMedkit(1); P.addAmmo('9mm', 30); } },
    { id: 'rescue', text: 'Rescue a survivor',           hint: 'follow the blue 🆘 beacons', done: () => P.rescued >= 1, reward: () => P.addMedkit(1) },
    { id: 'arsenal', text: 'Collect 4 different weapons', hint: '', done: () => P.weapons.length >= 4, reward: () => P.addMedkit(2) },
    { id: 'rescue3', text: 'Rescue 3 survivors',         hint: '', done: () => P.rescued >= 3, reward: () => P.addAmmo('rifle', 30) },
    { id: 'horde',  text: 'Hold out — 60 kills',         hint: 'the dead keep coming', done: () => P.kills >= 60, reward: () => P.addAmmo('rifle', 40) },
  ];
  let i = 0;

  const cur = () => (i < CHAIN.length ? CHAIN[i] : null);
  const text = () => {
    const o = cur();
    if (!o) return `✔ Town cleared-ish — survive (${P.kills} down)`;
    return o.text + (o.hint ? ` — ${o.hint}` : '');
  };
  function check() {
    let advanced = false;
    while (i < CHAIN.length && CHAIN[i].done()) {
      const o = CHAIN[i];
      bus.toast?.(`✅ ${o.text}`);
      try { o.reward?.(); } catch {}
      bus.celebrate?.();
      i++; advanced = true;
      const n = cur();
      if (n) bus.toast?.(`🎯 ${n.text}`);
    }
    return advanced;
  }
  return { cur, text, check, serialize: () => i, load: (n) => { i = Math.min(n || 0, CHAIN.length); } };
}
