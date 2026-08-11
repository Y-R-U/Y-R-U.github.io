// Going into and out of your quarters. Owns the room's visibility, the camera near-plane, the
// orbit rig's minimum distance and the leash on the look-around — they all have to move together
// or the view breaks.
//
// The rig's `distMin` is 14 m for the star system and 0.30 m inside a 3 m room; leaving it at 14
// hauls the camera out through the back wall the moment anything re-enables orbiting. `near` is
// 1 outside and 0.28 inside, and leaving it at 0.28 costs depth precision on the far station.

import { quartersLighting, roomShots } from '../world/room.js';
import { reachLighting } from '../world/scene.js';
import { nav } from './nav.js';

let ctx = null;
let inside = false;
let at = 'enter';
let sized = 0;

// Pinch inside a room leans in and back rather than dollying anywhere: the orbit centre is a
// hand's width in front of the eye, so these are fractions of that, not of the room.
const LEAN = { near: 0.72, far: 1.45 };

export const quarters = {
  attach(o) {
    ctx = o;
    let t = 0;
    addEventListener('resize', () => { clearTimeout(t); t = setTimeout(quarters.resize, 220); });
    return quarters;
  },
  get inside() { return inside; },
  get view() { return at; },
  get tier() { return ctx?.room ? ctx.tierId : 'dockbox'; },

  enter(shot = 'enter', ms = 900) {
    if (!ctx) return Promise.resolve();
    const tier = ctx.tierId;
    const { app, camera, room } = ctx;
    if (!nav.at('room')) nav.push('room', () => quarters.leave());
    room.group.visible = true;
    quartersLighting(app, tier);
    app.camera.near = 0.28;
    app.camera.updateProjectionMatrix();
    if (camera.rig) camera.rig.opt.distMin = 0.30;
    inside = true;
    at = shot;
    document.body.classList.add('in-quarters');
    // the leash has to be off for the move itself, or the move is clamped to the framing it is
    // travelling away from
    camera.setLimit(null);
    const s = quarters.shot(shot);
    return camera.moveTo({ pos: s.pos, look: s.look, fov: s.fov, ms, ease: 'inout' })
      .then(r => {
        if (r?.cut) return;
        // The pivot has to land before home is marked, or resetView pulls the eye back to the
        // orbit centre it was framed with — which for the room is a point out past the glass.
        camera.pivotAt(s.pivot);
        camera.markHome();
        quarters.applyLimits();
      });
  },

  shot(id = at) {
    const all = roomShots(ctx.tierId);
    return all[id] || all.enter;
  },

  // Re-leash on wherever the camera is standing now. Called after every arrival, and by the
  // handover at the end of the front of the game, which lands in here rather than in the system.
  applyLimits() {
    const rig = ctx?.camera?.rig;
    if (!rig || !inside) return;
    const s = quarters.shot();
    sized = window.innerWidth + window.innerHeight * 4096;
    rig.setLimit({
      theta: rig.want.theta, phi: rig.want.phi,
      spanTheta: s.yaw, spanPhi: s.pitch,
      distMin: Math.max(0.22, rig.want.dist * LEAN.near),
      distMax: rig.want.dist * LEAN.far,
      recentre: 1.1,
      invertX: true,
    });
  },

  // A turned phone changes the horizontal angle the room fits into, and there is nothing sensible
  // to interpolate towards, so the framing is simply re-taken.
  resize() {
    if (!inside || document.body.classList.contains('in-terminal')) return;
    const now = window.innerWidth + window.innerHeight * 4096;
    if (now === sized) return;
    quarters.enter(at, 0);
  },

  leave(ms = 900) {
    if (!ctx || !inside) return Promise.resolve();
    nav.drop('room');
    const { app, camera, room, home } = ctx;
    reachLighting(app.quality);
    app.camera.near = 1;
    app.camera.updateProjectionMatrix();
    if (camera.rig) camera.rig.opt.distMin = 14;
    camera.setLimit(null);
    inside = false;
    at = 'enter';
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
    if (inside) quarters.enter(at, 0);
  },
};

export default quarters;
