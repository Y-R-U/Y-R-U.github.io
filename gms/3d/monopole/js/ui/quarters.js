// Going into and out of your quarters. Owns the room's visibility, the camera near-plane and the
// orbit rig's minimum distance — all three have to move together or the view breaks.
//
// The rig's `distMin` is 14 m for the star system and 0.30 m inside a 3 m room; leaving it at 14
// hauls the camera out through the back wall the moment anything re-enables orbiting. `near` is
// 1 outside and 0.28 inside, and leaving it at 0.28 costs depth precision on the far station.

import { quartersLighting, roomShots } from '../world/room.js';
import { reachLighting } from '../world/scene.js';

let ctx = null;
let inside = false;

export const quarters = {
  attach(o) { ctx = o; return quarters; },
  get inside() { return inside; },
  get tier() { return ctx?.room ? ctx.tierId : 'dockbox'; },

  enter(shot = 'enter', ms = 900) {
    if (!ctx) return Promise.resolve();
    const tier = ctx.tierId;
    const { app, camera, room } = ctx;
    room.group.visible = true;
    quartersLighting(app, tier);
    app.camera.near = 0.28;
    app.camera.updateProjectionMatrix();
    if (camera.rig) camera.rig.opt.distMin = 0.30;
    inside = true;
    document.body.classList.add('in-quarters');
    const s = roomShots(tier)[shot] || roomShots(tier).enter;
    return camera.moveTo({ pos: s.pos, look: s.look, fov: s.fov, ms, ease: 'inout' })
      .then(() => { camera.markHome(); });
  },

  leave(ms = 900) {
    if (!ctx || !inside) return Promise.resolve();
    const { app, camera, room, home } = ctx;
    reachLighting(app.quality);
    app.camera.near = 1;
    app.camera.updateProjectionMatrix();
    if (camera.rig) camera.rig.opt.distMin = 14;
    inside = false;
    document.body.classList.remove('in-quarters');
    room.group.visible = false;
    camera.markHome(home());
    return camera.resetView(ms);
  },

  toggle() { return inside ? quarters.leave() : quarters.enter(); },

  setTier(id) {
    if (!ctx || id === ctx.tierId) return;
    ctx.tierId = id;
    ctx.room.setTier(id);
    if (inside) quarters.enter('enter', 0);
  },
};

export default quarters;
