import * as THREE from '../../vendor/three/three.module.js';
import { defineLevel, prop, apos } from './common.js';
import { sillHelpers, intoRoom } from './shared.js';

// Windowsill → open the window → cold breeze → Jon goes to close it → eat.
export default defineLevel({
  id: 7, food: 'steak', title: 'Cold Snap',
  objectives: ['Jump onto the windowsill', 'Open the window', "Eat Jon's steak"],
  hints: ['l07_hint_1', 'l07_hint_2', 'l07_hint_3'],
  canEat: (L) => (L.flags.open || L.flags.closed) && L.ai.distracted(),
  setup(L) {
    const { ctx } = L;
    const sill = sillHelpers(L);
    L.flags.sill = sill;
    sill.onLand(() => L.obj(0));
    const win = () => prop(ctx, 'window');
    ctx.interact.register({
      id: 'window', label: 'Open the window', radius: 0.95, heightTol: 0.5,
      getPos: (o) => (o || new THREE.Vector3()).copy(sill.pos()),
      enabled: () => sill.isOn() && !L.flags.open,
      onInteract: () => openWindow(L),
    });
  },
  update(L) {
    const { ctx, flags } = L;
    if (flags.sill.isOn()) L.obj(0);
    if (flags.open && L.ai.distracted()) L.target((o) => o.copy(L.foodPos()), { height: 0.4 });
    else L.target((o) => o.copy(flags.sill.pos()), { height: 0.45 });
    // re-arm when Jon is back in his chair with the window shut
    if (flags.closed && L.ai.state === 'sitEat' && L.ai.stateT > 1) {
      flags.closed = false; flags.open = false;
      L.obj(1, false);
    }
  },
  teardown(L) { try { prop(L.ctx, 'window')?.close?.(); prop(L.ctx, 'curtains')?.wave?.(false); } catch {} },
});

function openWindow(L) {
  const { ctx, ai } = L;
  if (L.flags.open) return;
  L.flags.open = true;
  L.obj(1);
  const win = prop(ctx, 'window');
  try { win?.open?.(); prop(ctx, 'curtains')?.wave?.(true); } catch (e) { console.warn(e); }
  ctx.audio?.sfx?.('wind', { vol: 0.8 });
  L.say('g_window_1', { delay: 0.8 });
  const sillP = L.flags.sill.pos();
  const stand = sillP.clone().setY(0).addScaledVector(intoRoom(ctx), 0.55);
  ai.run('cold', async (t) => {
    await t.wait(1.5);
    t.say('j_cold_1', { force: true });
    try { ctx.jon.setExpression?.('shock'); } catch {}
    await t.play('stunned_shake', 1.2, { fallback: 'idle' });
    await t.play('stand_up', 0.8, { fallback: 'idle' });
    t.say('j_cold_2', { force: true });
    await t.walkTo(stand, { arrive: 0.25 });
    await t.face(sillP);
    if (L.flags.sill.isOn()) {
      t.say('j_shoo', { force: true });
      const away = new THREE.Vector3().subVectors(stand, sillP).setY(0).normalize();
      ctx.controller.knockback(away, 2.2);
      await t.wait(0.6);
    }
    await t.play('close_window', 1.4, { fallback: 'idle' });
    try { await win?.close?.(); prop(ctx, 'curtains')?.wave?.(false); } catch {}
    t.say('j_cold_3', { force: true });
    await t.play('stunned_shake', 3, { fallback: 'idle' });
    L.flags.closed = true;
    ai.goHome();
  });
}
