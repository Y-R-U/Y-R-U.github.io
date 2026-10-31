// Plain 2D animations: deliberately boring, like a chess site.
//  - moves: a straight slide (no hops, no squash), ≤ ~220 ms; knights slide too
//  - captures ("battles"): the attacker slides in while the victim fades and shrinks away,
//    ~260 ms at 1×. It honours the battle-speed contract like every theme: tweens run on the
//    battle timeline (1× / 2× / 5× and tap-to-skip), battle_util.prep() fits a D24 cap, and
//    it plays no sfx so the board's default capture click lands at the end.
//  - board hooks (js/board/board.js): castleAnim (rook slides), captureAnim (battles Off),
//    promoteAnim (new piece grows in; the theme sets promoteFx:false so there are no sparkles).
import * as U from '../battle_util.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const slideMs = dist => clamp(110 + dist * 16, 120, 220);

/** Move obj from where it is to `to` along the board, y kept flat. */
function glideTo(ctx, obj, to, ms, ez) {
  const from = obj.position.clone();
  return ctx.tween(ms, e => { obj.position.lerpVectors(from, to, e); obj.position.y = from.y + (to.y - from.y) * e; }, ez)
    .then(() => { obj.position.copy(to); obj.quaternion.identity(); obj.scale.set(1, 1, 1); });
}

/** Fade + shrink a piece (its materials are cloned first; the shared one is used by every icon). */
function fadeAway(ctx, obj, ms, { shrink = 0.35 } = {}) {
  ctx.kit.ownMaterials(obj);
  const mats = [];
  obj.traverse(o => { if (o.isMesh) mats.push(o.material); });
  const s0 = obj.scale.x || 1;
  return ctx.tween(ms, e => {
    for (const m of mats) m.opacity = 1 - e;
    obj.scale.setScalar(Math.max(0.01, s0 * (1 - shrink * e)));
  }, ctx.kit.ease.quadIn).then(() => { obj.visible = false; });
}

// ----------------------------------------------------------------- move anims
export function slide(ctx) {
  return glideTo(ctx, ctx.piece, ctx.to, slideMs(ctx.dist), ctx.kit.ease.cubicOut);
}
slide.label = 'slide'; slide.weight = 3;

/** Same slide with an ease-in-out and the faintest lift (scale) mid-way, as if picked up. */
export function glide(ctx) {
  const p = ctx.piece, ms = slideMs(ctx.dist) + 20;
  const from = p.position.clone(), to = ctx.to;
  return ctx.tween(ms, (e, k) => {
    p.position.lerpVectors(from, to, e); p.position.y = from.y + (to.y - from.y) * e;
    p.scale.setScalar(1 + 0.07 * Math.sin(k * Math.PI));
  }, ctx.kit.ease.cubicInOut).then(() => { p.position.copy(to); p.scale.set(1, 1, 1); });
}
glide.label = 'glide';

export const moveAnims = [slide, glide];

// --------------------------------------------------------------- battle anims
/** Attacker slides onto the square; the victim fades and shrinks as it arrives. */
export async function fade(ctx) {
  const c = U.prep(ctx, 300);
  const A = c.attacker, V = c.victim, ms = slideMs(c.kit.flatDist(A.position, c.to));
  await Promise.all([
    glideTo(c, A, c.to, ms, c.kit.ease.cubicOut),
    c.wait(ms * 0.35).then(() => fadeAway(c, V, 150)),
  ]);
  U.finish(c);
}
fade.label = 'fade'; fade.weight = 3;

/** Victim pops out first (a tiny swell, then gone), then the attacker slides in. */
export async function pop(ctx) {
  const c = U.prep(ctx, 360);
  const A = c.attacker, V = c.victim;
  c.kit.ownMaterials(V);
  const mats = []; V.traverse(o => { if (o.isMesh) mats.push(o.material); });
  const slideP = glideTo(c, A, c.to, slideMs(c.kit.flatDist(A.position, c.to)), c.kit.ease.cubicOut);
  await c.tween(140, (e, k) => {
    V.scale.setScalar(Math.max(0.01, k < 0.3 ? 1 + 0.12 * (k / 0.3) : 1.12 * (1 - (k - 0.3) / 0.7)));
    for (const m of mats) m.opacity = k < 0.3 ? 1 : 1 - (k - 0.3) / 0.7;
  });
  V.visible = false;
  await slideP;
  U.finish(c);
}
pop.label = 'pop';

export const battleAnims = [fade, pop];

// ----------------------------------------------------------------- board hooks
/** Battles Off: the plain capture (board passes the victim as ctx.piece). */
export function captureAnim(ctx) { return fadeAway(ctx, ctx.piece, 130); }

/** Castling: the rook slides over the king, no hop. */
export function castleAnim(ctx) {
  return glideTo(ctx, ctx.piece, ctx.to, slideMs(ctx.dist), ctx.kit.ease.cubicInOut);
}

/** Promotion: the new piece (scale 0.01) grows in quickly. */
export function promoteAnim(ctx) {
  const p = ctx.piece;
  return ctx.tween(140, e => p.scale.setScalar(Math.max(0.01, 0.4 + 0.6 * e)), ctx.kit.ease.quadOut)
    .then(() => p.scale.set(1, 1, 1));
}
