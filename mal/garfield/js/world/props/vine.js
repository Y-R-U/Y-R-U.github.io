import { THREE, makeProp, Builder, lathe, gloss, mat, rng, propQuality } from './util.js';

const SEG = 28, RAD = 5;
const LEAF_COLS = [0x3f8a30, 0x4f9a36, 0x5ea83c, 0x6fae44, 0x8bb84e, 0x47912f];

// Heart-shaped pothos leaf, petiole at the origin, blade along +Z, face up (+Y), cupped and drooping at the tip.
function heartLeaf(L = 0.07) {
  const s = new THREE.Shape(), w = L * 0.36;
  s.moveTo(0, 0);
  s.bezierCurveTo(-w * 0.45, -L * 0.1, -w * 1.15, L * 0.05, -w, L * 0.32);
  s.bezierCurveTo(-w * 0.85, L * 0.62, -w * 0.25, L * 0.86, 0, L);
  s.bezierCurveTo(w * 0.25, L * 0.86, w * 0.85, L * 0.62, w, L * 0.32);
  s.bezierCurveTo(w * 1.15, L * 0.05, w * 0.45, -L * 0.1, 0, 0);
  const g = new THREE.ShapeGeometry(s, 5);
  g.rotateX(Math.PI / 2);
  g.scale(1, 1, -1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, -0.7 * x * x / L - 0.3 * (z / L) * (z / L) * L + 0.12 * Math.abs(x));
  }
  g.computeVertexNormals();
  g.translate(0, 0, L * 0.12);
  return g;
}

// Pothos in a pot on the fridge, trained up over a ceiling hook; the loose end drapes onto the fridge top.
// Grab the end and you swing from the hook over the table. World-space strand (mesh lives in the scene).
export function createVine(ctx, { anchors } = {}) {
  const p = makeProp('vine', ctx);
  const A = n => anchors?.get?.(n);
  const ft = A('fridgeTop')?.pos?.clone() || new THREE.Vector3(0, 1.85, 0);
  const tgt = (A('panSpot') || A('plateSpot') || A('tableTop'))?.pos?.clone() || ft.clone().add(new THREE.Vector3(-1.5, -1.09, -1.5));
  const ceilY = A('ceiling')?.pos?.y ?? ctx.ceilingY ?? 2.75;

  // fridge-top grab point = fridge top, nudged toward the table side
  const dirH = new THREE.Vector3(tgt.x - ft.x, 0, tgt.z - ft.z).normalize();
  const grabPt = ft.clone().addScaledVector(dirH, 0.2); grabPt.y = ft.y + 0.32;
  const catchY = tgt.y + 0.55;
  const L = Math.hypot(tgt.x - grabPt.x, tgt.z - grabPt.z);
  const hg = ceilY - grabPt.y, hc = ceilY - catchY;
  const a = (L * L + hc * hc - hg * hg) / (2 * L);
  const pivot = grabPt.clone().addScaledVector(dirH, a); pivot.y = ceilY;
  const len = Math.hypot(a, hg);
  const theta0 = Math.atan2(a, hg);               // angle (from straight down) on the fridge side
  const thetaTable = -Math.atan2(L - a, hc);       // angle over the target
  const omega = Math.sqrt(9.8 / len);
  Object.assign(p, { pivot, length: len, dirH, theta0, thetaTable, omega, grabPoint: grabPt.clone() });

  p.root.position.copy(ft);
  const leafMat = gloss(0xffffff, { roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.3, side: THREE.DoubleSide, vertexColors: true });
  const stemMat = mat(0x5a7a32, { roughness: 0.7 });
  const r = rng(12);
  const lc = () => LEAF_COLS[(r() * LEAF_COLS.length) | 0];
  const pot = new Builder();
  pot.add(lathe([[0, 0], [0.07, 0], [0.085, 0.12], [0.095, 0.13], [0.095, 0.145], [0, 0.145]], 20), gloss(0xc9663a, { roughness: 0.6, clearcoat: 0.2 }));
  pot.add(new THREE.CylinderGeometry(0.082, 0.082, 0.01, 16), mat(0x4a2e1c), { pos: [0, 0.135, 0] });
  // leafy crown in the pot
  for (let i = 0; i < 18; i++) {
    const lg = heartLeaf(0.075 + r() * 0.03);
    lg.rotateX(-0.5 - r() * 0.6); lg.rotateY(i * 2.4 + r() * 0.4);
    pot.add(lg, leafMat, { pos: [Math.cos(i * 2.4) * 0.03, 0.15 + r() * 0.07, Math.sin(i * 2.4) * 0.03] }, lc());
  }
  const potPos = new THREE.Vector3().copy(dirH).multiplyScalar(-0.15).add(new THREE.Vector3(dirH.z, 0, -dirH.x).multiplyScalar(0.18));
  // decorative tendrils spilling over the fridge edge (static, pot-local)
  const side = new THREE.Vector3(dirH.z, 0, -dirH.x);
  for (let k = 0; k < 3; k++) {
    const out = dirH.clone().multiplyScalar(0.58 + k * 0.05).addScaledVector(side, (k - 1) * 0.12 - 0.05);
    const drop = 0.25 + k * 0.18;
    const pts = [new THREE.Vector3(0, 0.15, 0), out.clone().multiplyScalar(0.6).setY(0.12), out.clone().setY(0.0), out.clone().multiplyScalar(1.1).setY(-drop * 0.5), out.clone().multiplyScalar(1.05).setY(-drop)];
    const curve = new THREE.CatmullRomCurve3(pts);
    pot.add(new THREE.TubeGeometry(curve, 16, 0.004, 4), stemMat);
    for (let i = 1; i < 12; i++) {
      const t = i / 12, pp = curve.getPoint(t), tan = curve.getTangent(t);
      const lg = heartLeaf(0.06 + r() * 0.025);
      lg.rotateX(0.5 + r() * 0.5); lg.rotateY(Math.atan2(tan.x, tan.z) + (i % 2 ? 1.3 : -1.3));
      pot.add(lg, leafMat, { pos: [pp.x, pp.y, pp.z] }, lc());
    }
  }
  const potMesh = pot.build('vinePot'); potMesh.position.copy(potPos); p.root.add(potMesh);
  const potTop = ft.clone().add(potPos); potTop.y += 0.19;

  // ceiling hook
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.005, 6, 14, Math.PI * 1.5), new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.8, roughness: 0.3 }));
  hook.position.copy(pivot); hook.position.y -= 0.02;
  ctx.scene.add(hook);

  // dynamic tube
  const N = SEG + 1;
  const pos = new Float32Array(N * RAD * 3), nor = new Float32Array(N * RAD * 3);
  const idx = [];
  for (let i = 0; i < SEG; i++) for (let j = 0; j < RAD; j++) {
    const a0 = i * RAD + j, a1 = i * RAD + (j + 1) % RAD, b0 = a0 + RAD, b1 = a1 + RAD;
    idx.push(a0, b0, a1, a1, b0, b1);
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  tg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  tg.setIndex(idx);
  const tube = new THREE.Mesh(tg, stemMat); tube.frustumCulled = false; tube.castShadow = propQuality() === 'high';
  ctx.scene.add(tube);

  const LEAVES = propQuality() === 'low' ? 34 : propQuality() === 'medium' ? 56 : 72;
  const leaves = new THREE.InstancedMesh(heartLeaf(0.088), gloss(0xffffff, { roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.3, side: THREE.DoubleSide }), LEAVES);
  leaves.frustumCulled = false; leaves.castShadow = propQuality() === 'high';
  ctx.scene.add(leaves);
  const leafSeed = Array.from({ length: LEAVES }, () => [r(), r(), r()]);
  const _col = new THREE.Color();
  for (let l = 0; l < LEAVES; l++) leaves.setColorAt(l, _col.set(lc()));

  const tip = new THREE.Vector3();
  p.tip = tip;
  const pts = Array.from({ length: N }, () => new THREE.Vector3());
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3(), _n = new THREE.Vector3(), _bn = new THREE.Vector3();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0), _z = new THREE.Vector3(0, 0, 1), _tw = new THREE.Quaternion();
  // two parts: pot → hook (fixed, 40% of points) and hook → tip (dynamic)
  const restTip = grabPt.clone(); restTip.y = ft.y + 0.04;
  const quad = (o, p0, p1, p2, t) => o.set(0, 0, 0).addScaledVector(p0, (1 - t) * (1 - t)).addScaledVector(p1, 2 * (1 - t) * t).addScaledVector(p2, t * t);
  let slack = 1, time = 0;

  const rebuild = () => {
    const k1 = Math.floor(N * 0.4);
    _a.copy(potTop).lerp(pivot, 0.5); _a.y = Math.max(potTop.y, pivot.y) + 0.0; _a.y = (potTop.y + pivot.y) / 2 + 0.05;
    for (let i = 0; i < k1; i++) quad(pts[i], potTop, _a, pivot, i / (k1 - 1));
    // sag between hook and tip proportional to slack
    _b.copy(pivot).lerp(tip, 0.5); _b.y -= 0.6 * slack;
    for (let i = k1; i < N; i++) quad(pts[i], pivot, _b, tip, (i - k1 + 1) / (N - k1));
    for (let i = 0; i < N; i++) {
      _t.subVectors(pts[Math.min(N - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
      _n.set(0, 1, 0); if (Math.abs(_t.y) > 0.9) _n.set(1, 0, 0);
      _bn.crossVectors(_t, _n).normalize(); _n.crossVectors(_bn, _t).normalize();
      const rr = 0.0065 * (1 - i / N * 0.35);
      for (let j = 0; j < RAD; j++) {
        const ang = j / RAD * Math.PI * 2, cs = Math.cos(ang), sn = Math.sin(ang);
        _c.copy(_n).multiplyScalar(cs).addScaledVector(_bn, sn);
        const o = (i * RAD + j) * 3;
        pos[o] = pts[i].x + _c.x * rr; pos[o + 1] = pts[i].y + _c.y * rr; pos[o + 2] = pts[i].z + _c.z * rr;
        nor[o] = _c.x; nor[o + 1] = _c.y; nor[o + 2] = _c.z;
      }
    }
    tg.attributes.position.needsUpdate = true; tg.attributes.normal.needsUpdate = true;
    tg.computeBoundingSphere();
    for (let l = 0; l < LEAVES; l++) {
      const [s1, s2, s3] = leafSeed[l];
      const u = 1 + (l + s1 * 0.6) / LEAVES * (N - 2.2), f = Math.min(N - 2, Math.floor(u)), fr = u - f;
      _c.copy(pts[f]).lerp(pts[f + 1], fr);
      _t.subVectors(pts[f + 1], pts[f]).normalize();
      // leaves spiral round the stem (golden angle) and hang outward/down under their own weight
      _n.set(0, 1, 0); if (Math.abs(_t.y) > 0.9) _n.set(1, 0, 0);
      _bn.crossVectors(_t, _n).normalize(); _n.crossVectors(_bn, _t).normalize();
      const ang = l * 2.4 + s2 * 0.6;
      _a.copy(_n).multiplyScalar(Math.cos(ang)).addScaledVector(_bn, Math.sin(ang));
      _a.y -= 0.55 + s1 * 0.35; _a.addScaledVector(_t, 0.25).normalize();
      _bn.crossVectors(_up, _a); if (_bn.lengthSq() < 1e-4) _bn.set(1, 0, 0); _bn.normalize();
      _n.crossVectors(_a, _bn);
      m4.makeBasis(_bn, _n, _a);
      q.setFromRotationMatrix(m4).multiply(_tw.setFromAxisAngle(_z, (s3 - 0.5) * 0.9));
      const big = (l > LEAVES - 7 ? 1.15 : 0.75 + s3 * 0.45) * (0.85 + 0.3 * (l / LEAVES));
      m4.compose(_c, q, sc.setScalar(big));
      leaves.setMatrixAt(l, m4);
    }
    leaves.instanceMatrix.needsUpdate = true;
  };

  Object.assign(p.state, { grabbed: false, free: false, angle: theta0, angVel: 0 });
  p.autoSwing = true;
  const setAngle = th => {
    p.state.angle = th;
    tip.copy(pivot).addScaledVector(dirH, Math.sin(th) * -len); // +theta = fridge side
    tip.addScaledVector(dirH, 0);
    tip.y = pivot.y - Math.cos(th) * len;
    // sin(th) > 0 means toward the fridge, i.e. against dirH
  };
  const rest = () => { tip.copy(restTip); slack = 1; p.state.grabbed = false; p.state.free = false; rebuild(); };

  p.grab = () => { dropT = -1; p.state.grabbed = true; p.state.free = false; time = 0; setAngle(theta0); slack = 0; rebuild(); p.sfx('rip', { vol: 0.25, rate: 1.8 }); };
  // t = seconds since grab (default physics: undamped so the swing is predictable for the catch)
  p.swing = t => { setAngle(theta0 * Math.cos(omega * t)); slack = 0; rebuild(); return tip; };
  p.swingAngle = th => { setAngle(th); slack = 0; rebuild(); return tip; };
  p.setTip = (v, sl) => { tip.copy(v); slack = sl ?? Math.max(0, 1 - tip.distanceTo(pivot) / len) * 0.4; rebuild(); };
  // let go of a held tip: it eases back down to its draped rest spot instead of snapping
  let dropT = -1; const dropFrom = new THREE.Vector3();
  p.letGo = (dur = 0.6) => { p.state.grabbed = false; p.state.free = false; dropFrom.copy(tip); dropT = 0; p.dropDur = dur; };
  p.release = () => {
    if (!p.state.grabbed) return;
    p.state.grabbed = false; p.state.free = true;
    p.state.angVel = -theta0 * omega * Math.sin(omega * time);
    p.state.angle = Math.atan2(-(tip.x - pivot.x) * dirH.x - (tip.z - pivot.z) * dirH.z, pivot.y - tip.y);
  };
  p.isOverTarget = (tol = 0.18) => Math.hypot(tip.x - tgt.x, tip.z - tgt.z) < tol;
  p.target = tgt;

  p.onUpdate(dt => {
    if (dropT >= 0) {
      dropT += dt;
      const u = Math.min(1, dropT / p.dropDur), e = u * u * (3 - 2 * u);
      tip.copy(dropFrom).lerp(restTip, e); tip.y -= Math.sin(Math.PI * u) * 0.06;
      slack = e; rebuild();
      if (u >= 1) { dropT = -1; time = 0; }
      return;
    }
    if (p.state.grabbed && p.autoSwing) { time += dt; p.swing(time); }
    else if (p.state.free) {
      const acc = -omega * omega * Math.sin(p.state.angle) - 0.5 * p.state.angVel;
      p.state.angVel += acc * dt; p.state.angle += p.state.angVel * dt;
      setAngle(p.state.angle); slack = 0; rebuild();
    } else if (!p.state.grabbed) {
      // idle sway of the draped end
      time += dt;
      tip.copy(restTip); tip.x += Math.sin(time * 0.8) * 0.01; tip.z += Math.cos(time * 0.6) * 0.01;
      if ((time * 10 | 0) % 3 === 0) rebuild();
    }
  });
  // a camera right up against the strand (top-down near the counters) sees nothing but leaves: drop them there
  const _s = new THREE.Line3(), _cp = new THREE.Vector3();
  p.cull = cam => {
    if (!cam) return;
    _s.set(potTop, pivot); let d = _s.closestPointToPoint(cam, true, _cp).distanceTo(cam);
    _s.set(pivot, tip); d = Math.min(d, _s.closestPointToPoint(cam, true, _cp).distanceTo(cam));
    const show = d > 0.45;
    if (leaves.visible !== show) leaves.visible = show;
  };
  p.reset = () => { time = 0; dropT = -1; rest(); };
  rest();
  return p;
}
