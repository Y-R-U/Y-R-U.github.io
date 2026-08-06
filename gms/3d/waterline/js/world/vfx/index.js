// The VFX façade and the update pump. FROZEN after W0.
//
// C3 owns gun.js, C4 owns impact.js and fire.js. They never meet: each registers its emitters
// into this file's registry and gets the shared card field, the shared light pool and the shared
// budget for free. Nothing here knows what a splash looks like.
//
// `size` is 1 | 4 | 9 and is resolved to scale/lifetime/light through config.js — never a literal
// in an emitter.

import * as THREE from 'three';
import { CardField, Pool } from './pool.js';
import { VFX } from '../../config.js';
import { track } from '../../engine/budget.js';

const emitters = new Map();

// Called at module load by gun.js / impact.js / fire.js.
export function registerEmitter(name, spawn) { emitters.set(name, spawn); }

export function createVFX(app) {
  const root = new THREE.Group();
  root.name = 'vfx';
  const quality = app.quality;

  const cardMat = new THREE.MeshBasicMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    map: softDisc(), toneMapped: true,
  });

  let cards = new CardField(quality.get('vfxCap') ?? 220, cardMat);
  root.add(cards.mesh);

  const lights = new Pool({
    label: 'vfx light', cap: 4,
    make: () => { const l = new THREE.PointLight(0xffb060, 0, 60, 2); root.add(l); return l; },
    reset: l => { l.intensity = 0; l.distance = 60; },
  });

  const live = [];   // { update(dt) → boolean keepAlive, kill() }

  const ctx = {
    root, cards, lights, app, quality, config: VFX,
    // an emitter's only way to keep something ticking
    add(updater) { live.push(updater); return handleFor(updater); },
    size: s => VFX[s] || VFX[1],
  };

  function handleFor(updater) {
    return {
      get alive() { return live.includes(updater); },
      kill() { updater.kill?.(); const i = live.indexOf(updater); if (i >= 0) live.splice(i, 1); },
    };
  }

  const DEAD = { alive: false, kill() {} };

  function call(name, args) {
    const spawn = emitters.get(name);
    if (!spawn) return DEAD;
    return spawn(ctx, ...args) ?? DEAD;
  }

  const vfx = {
    object3D: root,

    muzzle: (anchor, size = 1) => call('muzzle', [anchor, size]),
    tracer: (from, to, ms, size = 1) => call('tracer', [from, to, ms, size]),
    splash: (pos, size = 1) => call('splash', [pos, size]),
    hit: (pos, size = 1) => call('hit', [pos, size]),
    fire: (host, localPos, seconds = VFX.fireSeconds) => call('fire', [host, localPos, seconds]),
    smoke: (pos, drift, size = 1) => call('smoke', [pos, drift, size]),

    update(dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        if (live[i].update(dt) === false) { live[i].kill?.(); live.splice(i, 1); }
      }
      cards.update(app.camera);
    },

    clear() {
      for (const u of live.splice(0)) u.kill?.();
      cards.clear();
      lights.clear();
    },

    alive: () => live.length,

    registerKnobs(q) {
      q.register({ key: 'vfxCap', label: 'Particle cap', type: 'range', min: 40, max: 900, step: 20, group: 'VFX' },
        n => {
          if (cards.cap === n) return;
          // the InstancedMesh's instance count is fixed at construction, so a cap change rebuilds
          vfx.clear();
          root.remove(cards.mesh);
          cards.mesh.dispose();
          cards = new CardField(n, cardMat);
          ctx.cards = cards;
          root.add(cards.mesh);
        });
    },
  };

  return vfx;
}

// One 64² radial falloff, used by every card in the game. Alpha only — the instance colour tints it.
function softDisc() {
  const S = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d').createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  const c = cv.getContext('2d');
  c.fillStyle = g;
  c.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return track(t, { w: S, h: S, fmt: 'rgba', mips: true, label: 'vfx card' });
}
