// Greybox theme: the engine's fallback. Implements THEME_CONTRACT with plain materials and
// simple shapes. Any other theme can omit a material or skin and this one fills the gap.

export default function createTheme(ctx) {
  const { THREE } = ctx;
  const high = ctx.quality !== 'low';
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o });

  const grassTex = stripeTexture(THREE, '#4fae4a', '#469f42');
  const materials = {
    grass: std(0xffffff, { map: grassTex }),
    fringe: std(0x3b8c3a),
    wall: std(0x9a958c),
    wallTop: std(0xb9b3a7),
    trim: std(0xd8a93c, { metalness: 0.6, roughness: 0.35 }),
    tee: std(0x5d6470),
    cupRim: std(0xe8e2d0, { roughness: 0.5 }),
    flag: std(0xe0342c, { side: THREE.DoubleSide, roughness: 0.7 }),
    sand: std(0xdcc58f), water: std(0x3b8bd0, { roughness: 0.2 }), ice: std(0xcfeaf7, { roughness: 0.15 }),
    boost: std(0x42c6ff, { emissive: 0x1f6f99 }), bridge: std(0x8a6a48), rock: std(0x6f6a63, { flatShading: true }),
  };
  const disposables = [grassTex, ...Object.values(materials)];
  const mat = (c, o) => { const m = std(c, o); disposables.push(m); return m; };
  const geom = g => { disposables.push(g); return g; };

  return {
    id: 'greybox', name: 'Greybox',
    materials,

    buildEnvironment(scene, info) {
      const added = [];
      const add = o => { scene.add(o); added.push(o); return o; };
      scene.background = new THREE.Color(0x9fc9ee);
      scene.fog = new THREE.Fog(0x9fc9ee, 18, 60);
      add(new THREE.HemisphereLight(0xdcefff, 0x5a6a4a, 1.4));
      const sun = add(new THREE.DirectionalLight(0xffffff, 2.2));
      const c = info.bounds.getCenter(new THREE.Vector3()), size = info.bounds.getSize(new THREE.Vector3());
      const r = Math.max(size.x, size.z) / 2 + 1.5;
      sun.position.copy(c).add(new THREE.Vector3(r * 0.6, r * 1.6, r * 0.8));
      sun.target.position.copy(c); add(sun.target);
      sun.castShadow = true;
      sun.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024);
      Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 0.5, far: r * 4 });
      sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
      // rock under the fairway: one instanced batch of inverted cones following the path
      const cone = geom(new THREE.ConeGeometry(1, 1, 7, 1));
      cone.rotateX(Math.PI); cone.translate(0, -0.5, 0);
      const step = 3, n = Math.ceil(info.path.length / step);
      const rock = new THREE.InstancedMesh(cone, materials.rock, n);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      for (let i = 0, k = 0; i < info.path.length; i += step, k++) {
        const p = info.path[i], w = info.widths[i];
        const h = 1.2 + ((i * 37) % 11) / 11;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.3);
        m.compose(new THREE.Vector3(p.x, p.y - 0.1, p.z), q, s.set(w * 0.75, h, w * 0.75));
        rock.setMatrixAt(k, m);
      }
      rock.receiveShadow = true;
      add(rock);
      return {
        update() {},
        dispose() { for (const o of added) scene.remove(o); },
      };
    },

    skins: {
      windmill(o) {
        const object = new THREE.Group();
        const body = mat(0xcfc6b4), roof = mat(0xb5523b), wood = mat(0x8a6038), sail = mat(0xe9dcc0, { side: THREE.DoubleSide });
        const hw = o.gapWidth / 2, R = o.towerRadius;
        const sideW = R - hw;
        for (const sg of [1, -1]) {
          const m = new THREE.Mesh(geom(new THREE.BoxGeometry(sideW, o.towerHeight, R * 1.7)), body);
          m.position.set(sg * (hw + sideW / 2), o.towerHeight / 2, 0);
          m.castShadow = m.receiveShadow = true; object.add(m);
        }
        const top = new THREE.Mesh(geom(new THREE.BoxGeometry(o.gapWidth, o.towerHeight - o.gapHeight, R * 1.7)), body);
        top.position.set(0, (o.towerHeight + o.gapHeight) / 2, 0); top.castShadow = true; object.add(top);
        const cap = new THREE.Mesh(geom(new THREE.ConeGeometry(R * 1.25, 0.5, 4)), roof);
        cap.rotation.y = Math.PI / 4; cap.position.y = o.towerHeight + 0.25; cap.castShadow = true; object.add(cap);
        const rotor = new THREE.Group();
        rotor.position.set(0, o.hubHeight, o.towerRadius + 0.05);
        const hub = new THREE.Mesh(geom(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 12)), wood);
        hub.rotation.x = Math.PI / 2; rotor.add(hub);
        for (let k = 0; k < o.bladeCount; k++) {
          const arm = new THREE.Group(); arm.rotation.z = (2 * Math.PI * k) / o.bladeCount;
          const spar = new THREE.Mesh(geom(new THREE.BoxGeometry(0.03, o.bladeLength, 0.03)), wood);
          spar.position.y = o.bladeLength / 2; arm.add(spar);
          const b = new THREE.Mesh(geom(new THREE.BoxGeometry(o.bladeWidth, o.bladeLength - 0.08, 0.02)), sail);
          b.position.set(0.018 + o.bladeWidth / 2, (o.bladeLength + 0.08) / 2, 0); b.castShadow = true; arm.add(b); rotor.add(arm);
        }
        object.add(rotor);
        return { object, rotor };
      },
      loop(o) {
        const object = new THREE.Group();
        const gold = materials.trim;
        for (const sg of [1, -1]) {
          const pts = [];
          for (let i = 0; i <= 64; i++) {
            const u = i / 64, th = u * Math.PI * 2;
            const sh = o.sideShift * (u - Math.sin(th) / (2 * Math.PI));
            const rr = o.radius + 0.02;
            pts.push(new THREE.Vector3(sh + sg * (o.width / 2 + 0.14), o.radius - rr * Math.cos(th), rr * Math.sin(th)));
          }
          const tube = new THREE.Mesh(geom(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.025, 6)), gold);
          tube.castShadow = true; object.add(tube);
        }
        return object;
      },
      tube(o) {
        return new THREE.Mesh(geom(new THREE.TubeGeometry(o.curve, 64, o.radius, 12)),
          mat(0x9fe3ff, { transparent: true, opacity: 0.3, roughness: 0.1, depthWrite: false }));
      },
      flag(o) {
        const object = new THREE.Group();
        const pole = new THREE.Mesh(geom(new THREE.CylinderGeometry(0.008, 0.008, o.poleHeight, 6)), mat(0xf2f2f2));
        pole.position.y = o.poleHeight / 2; object.add(pole);
        const fg = geom(new THREE.PlaneGeometry(0.3, 0.18, 8, 1)); fg.translate(0.15, 0, 0);
        const flag = new THREE.Mesh(fg, materials.flag);
        flag.position.y = o.poleHeight - 0.1; flag.castShadow = true; object.add(flag);
        const base = fg.attributes.position.array.slice();
        return {
          object,
          update(dt, t) {
            const a = fg.attributes.position.array;
            for (let i = 0; i < a.length; i += 3) a[i + 2] = Math.sin(t * 4 + base[i] * 18) * 0.025 * base[i] / 0.3;
            fg.attributes.position.needsUpdate = true;
          },
        };
      },
      pickup() {
        const m = new THREE.Mesh(geom(new THREE.OctahedronGeometry(0.06)), mat(0x58c8ff, { emissive: 0x1a6aa0, roughness: 0.2 }));
        m.scale.y = 1.4; m.position.y = 0.04;
        const object = new THREE.Group(); object.add(m);
        return { object, update(dt, t) { m.rotation.y = t * 2; m.position.y = 0.04 + Math.sin(t * 2.5) * 0.015; } };
      },
      bumper(o) {
        const m = new THREE.Mesh(geom(new THREE.CylinderGeometry(o.radius, o.radius, o.height, 20)), mat(0xd04848, { roughness: 0.4 }));
        m.position.y = o.height / 2; m.castShadow = true;
        const g = new THREE.Group(); g.add(m); return g;
      },
      // Extension (engine): a sliding block. opts = { width, height, depth }, base at the origin.
      mover(o) {
        const g = new THREE.Group();
        const body = new THREE.Mesh(geom(new THREE.BoxGeometry(o.width, o.height, o.depth)), materials.wall);
        body.position.y = o.height / 2; body.castShadow = body.receiveShadow = true; g.add(body);
        const top = new THREE.Mesh(geom(new THREE.BoxGeometry(o.width + 0.01, 0.02, o.depth + 0.01)), materials.trim);
        top.position.y = o.height - 0.01; g.add(top);
        return g;
      },
      teePad(o) {
        const m = new THREE.Mesh(geom(new THREE.RingGeometry(o.radius * 0.55, o.radius, 32)), mat(0x5b8fd6, { roughness: 0.5 }));
        m.rotation.x = -Math.PI / 2; m.position.y = 0.002; m.receiveShadow = true;
        const g = new THREE.Group(); g.add(m); return g;
      },
    },
    dispose() { for (const d of disposables) d.dispose?.(); },
  };
}

function stripeTexture(THREE, a, b) {
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (!c) return null;
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = a; g.fillRect(0, 0, 64, 128);
  g.fillStyle = b; g.fillRect(0, 64, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 1); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
