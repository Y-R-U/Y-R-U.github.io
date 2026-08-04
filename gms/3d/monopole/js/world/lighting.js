// One dominant key from the local star, one coloured fill from the opposite side, and a small
// image-based env baked from the same two hues so metal has something to reflect. Ambient is
// deliberately close to nothing — hulls are meant to read as dark shapes with lit edges.

import * as THREE from 'three';
import { track, untrack } from '../engine/budget.js';
import { system } from './palettes.js';
import { setEnvIntensity } from './materials.js';

const ENV_W = 256, ENV_H = 128;

export class Lighting {
  constructor(backdrop, systemId = 'tamber') {
    this.backdrop = backdrop;
    this.sys = system(systemId);
    this.object3D = new THREE.Group();

    this.key = new THREE.DirectionalLight(new THREE.Color(this.sys.key), 3.6);
    this.key.position.set(0, 0, -1000);
    this.object3D.add(this.key, this.key.target);

    this.fill = new THREE.DirectionalLight(new THREE.Color(this.sys.fill), 0.5);
    this.object3D.add(this.fill, this.fill.target);

    this.hemi = new THREE.HemisphereLight(new THREE.Color(this.sys.cool), new THREE.Color(this.sys.deep), 0.06);
    this.object3D.add(this.hemi);

    this.fillAngle = 128;
    this.fillLift = -26;
    this.keySwing = 0;
    this.keyLift = 0;
    this.keyDir = new THREE.Vector3(0, 0, -1);
  }

  registerKnobs(q, app) {
    this.app = app;
    const G = 'Lighting';

    q.register({ key: 'keyPower', label: 'Key light', type: 'range', min: 0, max: 16, step: 0.05, default: 6.0, group: G },
      v => { this.key.intensity = v; });
    q.register({ key: 'fillPower', label: 'Coloured fill', type: 'range', min: 0, max: 3, step: 0.02, default: 0.9, group: G },
      v => { this.fill.intensity = v; });
    q.register({ key: 'ambient', label: 'Ambient', type: 'range', min: 0, max: 0.5, step: 0.005, default: 0.012, group: G },
      v => { this.hemi.intensity = v; });
    // The star's *position* is composition; the angle its light rakes across a hull at is form.
    // These two swing the key off the star bearing without moving the flare in frame.
    q.register({ key: 'keySwing', label: 'Key swing off star', type: 'range', min: -90, max: 90, step: 1, default: 0, group: G },
      v => { this.keySwing = v; });
    q.register({ key: 'keyLift', label: 'Key elevation offset', type: 'range', min: -80, max: 80, step: 1, default: 0, group: G },
      v => { this.keyLift = v; });
    q.register({ key: 'fillAngle', label: 'Fill azimuth', type: 'range', min: 0, max: 180, step: 1, default: 128, group: G },
      v => { this.fillAngle = v; });
    q.register({ key: 'fillLift', label: 'Fill elevation', type: 'range', min: -80, max: 80, step: 1, default: -26, group: G },
      v => { this.fillLift = v; });
    q.register({ key: 'envPower', label: 'Env reflection', type: 'range', min: 0, max: 3, step: 0.02, default: 0.30, group: G },
      v => { setEnvIntensity(v); });
    q.register({ key: 'envFalloff', label: 'Env falloff', type: 'range', min: 0.3, max: 8, step: 0.05, default: 1.9, group: G },
      v => { if (v === this.envFall) return; this.envFall = v; this.envDirty = true; });
    // Without this the env is a sphere of roughly one brightness and every up-facing and
    // down-facing surface on a hull reads at the same value — which is what "ambient dominating"
    // looks like. Dimming the lower hemisphere is what drops an underside to black.
    q.register({ key: 'envFloor', label: 'Env underside dim', type: 'range', min: 0, max: 1, step: 0.01, default: 0.16, group: G },
      v => { if (v === this.envLow) return; this.envLow = v; this.envDirty = true; });

    this.buildEnv(app);
  }

  buildEnv(app) {
    this.envDirty = false;
    const dir = this.backdrop?.dir || new THREE.Vector3(0, 0, -1);
    const hot = new THREE.Color(this.sys.hot).convertSRGBToLinear();
    const mid = new THREE.Color(this.sys.mid).convertSRGBToLinear();
    const cool = new THREE.Color(this.sys.cool).convertSRGBToLinear();
    const deep = new THREE.Color(this.sys.deep).convertSRGBToLinear();
    const fall = this.envFall ?? 1.9;
    const low = this.envLow ?? 0.16;
    const smooth = t => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };

    const data = new Float32Array(ENV_W * ENV_H * 4);
    const d = new THREE.Vector3(), c = new THREE.Color();
    for (let y = 0; y < ENV_H; y++) {
      const theta = (1 - (y + 0.5) / ENV_H) * Math.PI;
      const st = Math.sin(theta), ct = Math.cos(theta);
      for (let x = 0; x < ENV_W; x++) {
        const phi = ((x + 0.5) / ENV_W) * Math.PI * 2;
        d.set(-Math.cos(phi) * st, ct, Math.sin(phi) * st);
        const ang = Math.acos(Math.max(-1, Math.min(1, d.dot(dir))));
        const lit = Math.exp(-ang * ang * fall);
        let e = 0.05 + 2.4 * lit;
        c.copy(cool).lerp(mid, Math.min(1, e * 0.55)).lerp(hot, Math.max(0, Math.min(1, (e - 0.9) / 1.2)));
        e *= low + (1 - low) * smooth((d.y + 0.55) / 0.95);
        const i = (y * ENV_W + x) * 4;
        data[i] = deep.r + c.r * e;
        data[i + 1] = deep.g + c.g * e;
        data[i + 2] = deep.b + c.b * e;
        data[i + 3] = 1;
      }
    }
    const tex = new THREE.DataTexture(data, ENV_W, ENV_H, THREE.RGBAFormat, THREE.FloatType);
    tex.colorSpace = THREE.LinearSRGBColorSpace;
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.needsUpdate = true;

    this.pmrem ??= new THREE.PMREMGenerator(app.renderer);
    if (this.envRT) { untrack(this.envRT.texture); this.envRT.dispose(); }
    this.envRT = this.pmrem.fromEquirectangular(tex);
    tex.dispose();
    app.scene.environment = this.envRT.texture;
    track(this.envRT.texture, { w: this.envRT.width, h: this.envRT.height, fmt: 'rgba16f', mips: false, label: 'env pmrem' });
  }

  update(dt, app) {
    const dir = this.backdrop?.dir;
    if (!dir) return;
    if (this.envDirty) this.buildEnv(app);

    const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(dir, up).normalize();
    const swing = this.keySwing * Math.PI / 180, lift = this.keyLift * Math.PI / 180;
    this.keyDir.copy(dir).multiplyScalar(Math.cos(swing)).addScaledVector(right, Math.sin(swing));
    this.keyDir.normalize().multiplyScalar(Math.cos(lift)).addScaledVector(up, Math.sin(lift)).normalize();
    this.key.position.copy(this.keyDir).multiplyScalar(1000);

    // the fill sits at a fixed angle *around* the key, so moving the star moves both together
    const a = this.fillAngle * Math.PI / 180, l = this.fillLift * Math.PI / 180;
    const f = new THREE.Vector3().copy(this.keyDir).multiplyScalar(Math.cos(a))
      .addScaledVector(right, Math.sin(a));
    f.normalize().multiplyScalar(Math.cos(l)).addScaledVector(up, Math.sin(l));
    this.fill.position.copy(f).multiplyScalar(1000);
  }
}
