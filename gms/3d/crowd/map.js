'use strict';
/* ── map.js ── Procedural map: floor, buildings, trees, plaza ── */

class MapBuilder {
  constructor(scene) {
    this.scene     = scene;
    this.meshes    = []; // all disposable meshes
    this.buildings = []; // [{x, z, hw, hd}] for collision detection
    this._orbRef   = null;
  }

  build() {
    this._floor();
    this._plaza();
    this._buildings();
    this._trees();
  }

  // ── Floor ────────────────────────────────────────────────────────────
  _floor() {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshLambertMaterial({ color: 0xf0f0f0 })
    );
    m.rotation.x  = -Math.PI / 2;
    m.receiveShadow = true;
    this.scene.add(m);
    this.meshes.push(m);
  }

  // ── Central plaza ────────────────────────────────────────────────────
  _plaza() {
    // Raised circular platform
    const plat = new THREE.Mesh(
      new THREE.CylinderGeometry(8, 8.5, 0.5, 24),
      new THREE.MeshLambertMaterial({ color: 0xe0e0e0 })
    );
    plat.position.set(0, 0.25, 0);
    plat.receiveShadow = true;
    this.scene.add(plat);
    this.meshes.push(plat);

    // Four pillars
    [[-5, -5], [5, -5], [5, 5], [-5, 5]].forEach(([px, pz]) => {
      const p = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 4.5, 10),
        new THREE.MeshLambertMaterial({ color: 0xbdbdbd })
      );
      p.position.set(px, 2.5, pz);
      p.castShadow = true;
      this.scene.add(p);
      this.meshes.push(p);
    });

    // Glowing central orb
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(1.3, 16, 12),
      new THREE.MeshPhongMaterial({ color: 0x29b6f6, emissive: 0x0d6090, shininess: 100 })
    );
    orb.position.set(0, 2.4, 0);
    orb.castShadow = true;
    this.scene.add(orb);
    this.meshes.push(orb);
    this._orbRef = orb;
  }

  // ── Buildings ────────────────────────────────────────────────────────
  _buildings() {
    const PASTEL = [
      0xFFCDD2, 0xC8E6C9, 0xBBDEFB, 0xFFF9C4,
      0xE1BEE7, 0xB2EBF2, 0xFFE0B2, 0xD7CCC8,
      0xF8BBD9, 0xCCFF90, 0xB3E5FC, 0xFFECB3,
    ];
    const placed = []; // {x, z, hw, hd} for clearance

    const fits = (x, z, hw, hd) => {
      if (Math.abs(x) < 14 && Math.abs(z) < 14) return false;
      if (Math.abs(x) + hw > MAP_HALF - 3) return false;
      if (Math.abs(z) + hd > MAP_HALF - 3) return false;
      for (const p of placed) {
        if (Math.abs(x - p.x) < hw + p.hw + 2.5 &&
            Math.abs(z - p.z) < hd + p.hd + 2.5) return false;
      }
      return true;
    };

    let count = 0;
    for (let attempt = 0; attempt < 200 && count < 28; attempt++) {
      const x  = (Math.random() * 2 - 1) * (MAP_HALF - 6);
      const z  = (Math.random() * 2 - 1) * (MAP_HALF - 6);
      const w  = 4 + Math.random() * 10;
      const d  = 4 + Math.random() * 10;
      const h  = 3 + Math.random() * 9;
      const hw = w / 2, hd = d / 2;
      if (!fits(x, z, hw, hd)) continue;

      const col = PASTEL[Math.floor(Math.random() * PASTEL.length)];
      this._addBox(x, h / 2, z, w, h, d, col);

      // Rooftop detail on ~40% of buildings
      if (Math.random() < 0.4) {
        const rw = w * 0.45, rd = d * 0.45, rh = 1 + Math.random() * 2;
        this._addBox(x, h + rh / 2, z, rw, rh, rd, this._darken(col, 0.2));
      }

      placed.push({ x, z, hw, hd });
      this.buildings.push({ x, z, hw, hd }); // expose for collision
      count++;
    }
  }

  _addBox(x, cy, z, w, h, d, color) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color })
    );
    m.position.set(x, cy, z);
    m.castShadow    = true;
    m.receiveShadow = true;
    this.scene.add(m);
    this.meshes.push(m);
  }

  _darken(hex, amt) {
    const r = ((hex >> 16) & 0xff) * (1 - amt) | 0;
    const g = ((hex >>  8) & 0xff) * (1 - amt) | 0;
    const b = ( hex        & 0xff) * (1 - amt) | 0;
    return (r << 16) | (g << 8) | b;
  }

  // ── Trees ────────────────────────────────────────────────────────────
  _trees() {
    const CANOPY_COLS = [0x81C784, 0x4CAF50, 0x66BB6A, 0xA5D6A7, 0x2E7D32, 0xAED581];
    let placed = 0;

    for (let attempt = 0; attempt < 200 && placed < 18; attempt++) {
      const x = (Math.random() * 2 - 1) * (MAP_HALF - 4);
      const z = (Math.random() * 2 - 1) * (MAP_HALF - 4);
      if (Math.abs(x) < 14 && Math.abs(z) < 14) continue;

      // Trunk
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.4, 2.2, 7),
        new THREE.MeshLambertMaterial({ color: 0x795548 })
      );
      trunk.position.set(x, 1.1, z);
      trunk.castShadow = true;
      this.scene.add(trunk);
      this.meshes.push(trunk);

      // Canopy
      const cr  = 1.6 + Math.random() * 0.8;
      const can = new THREE.Mesh(
        new THREE.SphereGeometry(cr, 8, 6),
        new THREE.MeshLambertMaterial({ color: CANOPY_COLS[Math.floor(Math.random() * CANOPY_COLS.length)] })
      );
      can.position.set(x, 2.2 + cr * 0.8, z);
      can.castShadow = true;
      this.scene.add(can);
      this.meshes.push(can);

      placed++;
    }
  }

  // ── Per-frame update ─────────────────────────────────────────────────
  update(dt) {
    if (this._orbRef) this._orbRef.rotation.y += dt * 1.0;
  }

  // ── Cleanup ──────────────────────────────────────────────────────────
  dispose() {
    for (const m of this.meshes) {
      this.scene.remove(m);
      m.geometry.dispose();
      if (m.material && m.material.dispose) m.material.dispose();
    }
    this.meshes    = [];
    this.buildings = [];
    this._orbRef   = null;
  }
}
