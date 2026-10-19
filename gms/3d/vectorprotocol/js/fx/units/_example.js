// Example per-unit FX module (not used by any unit). Copy to js/fx/units/<id>.js and register it in index.js.
// Every hook is optional. Return 'default' from a hook to ALSO run the generic effect.
export default {
  // basic attack, called on the attack anim's 'fire' frame. ctx.timing.travel = seconds until the sim's impact.
  attack(ctx) {
    const { fx, src, target, timing, palette } = ctx;
    const a = src.pos('muzzle'), b = target.pos('core');
    fx.muzzle(a, palette.faction, 1.2);
    fx.bolt(a, b, palette.faction, timing.travel, { size: 0.35, arc: 0.4 });
  },
  // a hit landed on ctx.target (ctx.hit = sim hit event: amount, crit, absorbed, kill)
  impact(ctx) {
    ctx.fx.impact(ctx.target.pos('core'), ctx.palette.faction, ctx.hit.crit ? 1.6 : 1);
  },
  // every fire/cast/impact frame of the attack (index 0 = the one attack() ran on) and of the overdrive anim
  shot(ctx) {
    const { fx, shot, target, palette } = ctx;
    if (shot.phase !== 'attack' || shot.index === 0 || !target) return;
    fx.muzzle(shot.socket, palette.faction, 0.7);
    fx.tracer(shot.socket, target.pos('core'), palette.faction, 0.25);
  },
  // a heal this unit caused landed on ctx.target (ctx.heal = sim heal event); shield(ctx) / buff(ctx) work the same way
  heal(ctx) {
    ctx.fx.heal(ctx.target.pos('core').setY(0));
  },
  // overdrive release (the generic banner, charge-up, slow-mo and camera push already ran)
  overdrive(ctx) {
    for (const t of ctx.targets) ctx.fx.explosion(t.pos('core'), ctx.palette.faction, 1);
    ctx.fx.screenFlash(ctx.palette.faction, 0.25);
  },
};
