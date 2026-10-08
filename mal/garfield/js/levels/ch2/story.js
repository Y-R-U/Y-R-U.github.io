import * as THREE from '../../../vendor/three/three.module.js';
import { getCast } from '../../game/cast2.js';
import { LINES } from '../../game/lines.js';
import { bestShot } from '../../game/shots.js';
import { tableBox } from '../common.js';
import { V, prop, A, apos } from './common2.js';

// Chapter Two opening story (BRIEF2; docs/LEVELS2.md §2). Every quoted line is verbatim from the brief.
const T = (k) => LINES[k]?.text;

export async function playStory(ctx) {
  const { director, jon, garfield, world } = ctx;
  const [odie, lyman] = await Promise.all([getCast(ctx, 'odie'), getCast(ctx, 'lyman')]);
  try { lyman.setOutfit?.('normal'); lyman.setFur?.(0); odie.setSocks?.(false); } catch {}
  const plate = prop(ctx, 'plate'), pan = prop(ctx, 'pan'), door = prop(ctx, 'frontDoor');
  const hidden = [plate?.root, pan?.root].filter(Boolean);
  hidden.forEach((o) => (o.visible = false));
  odie.root.visible = false; lyman.root.visible = false;
  const tb = tableBox(ctx);
  const seat = prop(ctx, 'chair')?.seat;
  const say = (d, who, k, o = {}) => d.say(who, k, { text: ctx.audio?.voLines?.[k]?.text || T(k), ...o });
  const onTable = (x, z) => V(x, tb.topY, z);
  const tc = V((tb.min.x + tb.max.x) / 2, tb.topY, (tb.min.z + tb.max.z) / 2);
  const doorIn = apos(ctx, 'doorInside') || apos(ctx, 'frontDoor', V(7.1, 0, 0.4)).add(V(0, 0, 0.9)).setY(0);
  const step = apos(ctx, 'doorStep') || apos(ctx, 'frontDoor', V(7.1, 0, 0)).add(V(0, 0, -0.9)).setY(0);
  const dPos = apos(ctx, 'frontDoor', V(7.1, 0, 0)).setY(0);
  ctx.cast = { odie, lyman };

  try {
    await director.run(async (d) => {
      // 1. Jon at the table, Garfield sitting on it
      if (seat && jon.sitAt) { if (jon.root.parent !== seat) jon.sitAt(seat, 'sit'); }
      jon.holdProp?.(null);
      jon.play?.('sit');
      try { jon.setExpression?.('talk'); } catch {}
      const jw = jon.root.getWorldPosition(V());
      const gSpot = onTable(THREE.MathUtils.lerp(tc.x, jw.x, 0.35), THREE.MathUtils.lerp(tc.z, jw.z, 0.35));
      d.place(garfield, gSpot, Math.atan2(jw.x - gSpot.x, jw.z - gSpot.z));
      garfield.play?.('sit_table');
      try { garfield.setExpression?.('sleepy'); } catch {}
      d.music('cutscene');
      const din = A(ctx, 'cam_dining');
      d.cut(din ? { pos: din.pos.clone(), look: (din.look || tc).clone(), fov: din.fov ?? 55 } : bestShot(ctx, gSpot.clone().setY(1.0), { dist: 2.6, h: 0.5 }));
      await say(d, 'jon', 'c2_j_story_1');
      // 2. bored (seated clips only while he's in the chair)
      garfield.play?.('idle_bored');
      await say(d, 'garfield', 'g_c2_story_bored');
      // 3. doorbell → Jon opens the door
      d.sfx('doorbell');
      await d.wait(0.6);
      try { jon.setExpression?.('happy'); } catch {}
      if (jon.leaveSeat && jon.root.parent !== world.scene) { await d.play(jon, 'stand_up', { once: true, max: 1.0 }); jon.leaveSeat(world.scene); }
      {
        const camIn0 = A(ctx, 'cam_frontDoorIn');
        d.cut(camIn0 ? { pos: camIn0.pos.clone(), look: (camIn0.look || doorIn).clone(), fov: camIn0.fov ?? 50 } : bestShot(ctx, doorIn.clone().setY(1.2), { dist: 3.4, h: 0.5, prefer: Math.PI }));
      }
      jon.play?.('walk');
      await d.walk(jon, doorIn.clone().add(V(0.35, 0, 0.25)), { faceEnd: false });
      await d.face(jon, dPos);
      try { door?.setLocked?.(false); } catch {}
      d.sfx('door');
      try { door?.open?.(); } catch {}
      // Lyman on the doorstep with his suitcase
      // he stands in the doorway (on the threshold) so the inside camera sees him past the open door
      const sill = step.clone().lerp(doorIn, 0.55);
      d.place(lyman, sill, Math.atan2(doorIn.x - step.x, doorIn.z - step.z));
      lyman.root.visible = true;
      lyman.holdProp?.('suitcase');
      lyman.play?.('carry_suitcase');
      const camIn = A(ctx, 'cam_frontDoorIn');
      const twoMid = jon.root.position.clone().lerp(lyman.root.position, 0.5).setY(1.4);
      d.cut(camIn ? { pos: camIn.pos.clone(), look: (camIn.look || twoMid).clone(), fov: camIn.fov ?? 50 } : bestShot(ctx, twoMid, { dist: 2.6, h: 0.1, prefer: Math.PI / 2 }));
      jon.play?.('talk');
      await say(d, 'jon', 'c2_j_story_lyman');
      lyman.play?.('talk');
      await say(d, 'lyman', 'c2_l_story_jon');
      lyman.play?.('dramatic');
      await say(d, 'lyman', 'c2_l_story_cold');
      jon.play?.('talk');
      await say(d, 'jon', 'c2_j_story_home');
      // Lyman steps in
      lyman.play?.('walk');
      const lyIn = doorIn.clone().add(V(-0.5, 0, 0.35));
      await d.walk(lyman, lyIn, { faceEnd: false });
      await d.face(lyman, jon.root.position.clone());
      lyman.play?.('idle');
      // Garfield (still on the table)
      d.cut(bestShot(ctx, garfield.root.position.clone().add(V(0, 0.3, 0)), { dist: 1.4, h: 0.2, prefer: garfield.root.rotation.y }));
      try { garfield.setExpression?.('smug'); } catch {}
      await say(d, 'garfield', 'c2_g_story_sandbox');
      d.cut(bestShot(ctx, jon.root.position.clone().lerp(lyman.root.position, 0.5).setY(1.4), { dist: 2.8, h: 0.1 }));
      jon.play?.('talk');
      await say(d, 'jon', 'c2_j_story_suitcase');
      lyman.play?.('talk');
      await say(d, 'lyman', 'c2_l_story_hereboy');
      // 4. Odie gallops in
      d.place(odie, step.clone().lerp(doorIn, 0.4).add(V(-0.45, 0, 0)), Math.atan2(doorIn.x - step.x, doorIn.z - step.z));
      odie.root.visible = true;
      d.sfx('yap');
      ctx.barks?.say?.('o_bark_happy', { force: true });
      odie.play?.('gallop_goofy');
      const jp = jon.root.position.clone();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        await d.walk(odie, jp.clone().add(V(Math.sin(a) * 0.8, 0, Math.cos(a) * 0.8)), { speed: 2.6, faceEnd: false });
      }
      odie.play?.('idle_pant');
      // 5. Garfield to a corner
      const corner = cornerSpot(ctx, garfield.root.position);
      d.cut(bestShot(ctx, corner.pos.clone().setY(0.4), { dist: 2.0, h: 0.6, prefer: corner.rotY + Math.PI * 0.8 }));
      d.place(garfield, corner.pos.clone().addScaledVector(V(Math.sin(corner.rotY), 0, Math.cos(corner.rotY)), -0.4), corner.rotY);
      garfield.play?.('walk');
      await d.walk(garfield, corner.pos, { speed: 0.8, faceEnd: false });
      d.place(garfield, corner.pos, corner.rotY);
      garfield.play?.('head_in_corner');
      try { garfield.setExpression?.('sleepy'); } catch {}
      await say(d, 'garfield', 'c2_g_story_lawsey');
      // 6. "This is Odie."
      d.cut(bestShot(ctx, lyman.root.position.clone().lerp(odie.root.position, 0.5).setY(0.9), { dist: 2.8, h: 0.4 }));
      lyman.play?.('talk');
      await say(d, 'lyman', 'c2_l_story_odie');
      // 7. Odie on the table, across, off the edge, head-first
      const near = V(tb.min.x - 0.35, 0, (tb.min.z + tb.max.z) / 2), farEdge = onTable(tb.max.x - 0.05, (tb.min.z + tb.max.z) / 2);
      const land = V(tb.max.x + 0.55, 0, (tb.min.z + tb.max.z) / 2);
      d.cut(bestShot(ctx, tc.clone().setY(0.8), { dist: 3.2, h: 0.7, prefer: Math.PI / 2 }));
      d.place(odie, near, Math.PI / 2);
      odie.play?.('jump_up', { once: true });
      await d.tween((k) => { odie.root.position.lerpVectors(near, onTable(tb.min.x + 0.15, near.z), k); odie.root.position.y = tb.topY * k + Math.sin(k * Math.PI) * 0.4; }, 0.45);
      odie.play?.('gallop_goofy');
      const s0 = odie.root.position.clone();
      await d.tween((k) => { odie.root.position.lerpVectors(s0, farEdge, k); }, 0.9, (k) => k);
      odie.play?.('fall');
      await d.tween((k) => { odie.root.position.lerpVectors(farEdge, land, k); odie.root.position.y = tb.topY * (1 - k * k) + Math.sin(k * Math.PI) * 0.15; odie.root.rotation.x = k * 1.2; }, 0.5, (k) => k);
      odie.root.rotation.x = 0;
      d.sfx('boing');
      ctx.camera.shake?.(0.08);
      odie.play?.('land_head', { once: true });
      await d.wait(1.4);
      const gp = garfield.root.position;
      d.face(garfield, odie.root.position.clone());
      garfield.play?.('idle');
      d.cut(bestShot(ctx, gp.clone().add(V(0, 0.35, 0)), { dist: 1.5, h: 0.25, prefer: Math.atan2(odie.root.position.x - gp.x, odie.root.position.z - gp.z) }));
      try { garfield.setExpression?.('disgust'); } catch {}
      await say(d, 'garfield', 'c2_g_story_tweedledee');
      await d.fade(true, 0.6);
    });
  } finally {
    hidden.forEach((o) => (o.visible = true));
    try { door?.close?.(); door?.setLocked?.(true); door?.reset?.(); } catch {}
    try { lyman.holdProp?.(null); } catch {}
    if (jon.root.parent !== world.scene) { try { jon.leaveSeat?.(world.scene); } catch {} }
    odie.root.rotation.x = 0;
    try { garfield.setExpression?.('smug'); } catch {}
  }
}

// A room corner near Garfield, facing into it (for head_in_corner).
function cornerSpot(ctx, from) {
  const cands = [[0.22, 5.18, -Math.PI * 0.75], [0.22, 0.22, -Math.PI * 0.25 - Math.PI / 2], [8.98, 10.78, Math.PI * 0.25], [0.22, 5.82, -Math.PI * 0.25]]
    .map(([x, z, r]) => ({ pos: V(x, 0, z), rotY: r }));
  const free = cands.filter((c) => (ctx.world.groundAt?.(c.pos.x, c.pos.z, 0.3) ?? 0) < 0.05);
  const list = free.length ? free : cands;
  list.sort((a, b) => a.pos.distanceTo(from) - b.pos.distanceTo(from));
  const c = list[0];
  // face the corner: toward the nearest walls
  c.rotY = Math.atan2((c.pos.x < 4.6 ? -1 : 1), (c.pos.z < 5.4 ? (c.pos.z < 2 ? -1 : 1) : (c.pos.z > 8 ? 1 : -1)));
  return c;
}
