import * as THREE from 'three';
import { VEILS, VEIL_DEFAULT } from '../data/veils.js';

// D30: a human's Link veil for the dialogue bust. One shared shader (scanlines / gold filigree / wire lattice /
// glitch / shard dropout, all uniforms, so swapping speakers never recompiles), a blank mirrored faceplate with the
// person's emblem, and an optional head piece. Patterns live in bind space so they stick to the body as it moves.
export function createVeils() {
  const U = { uT: { value: 0 }, uTint: { value: new THREE.Color() }, uStyle: { value: new THREE.Vector4() }, uShard: { value: new THREE.Vector2() } };
  function veilMat(side) {
    const m = new THREE.MeshStandardMaterial({ color: 0x0c2a3a, metalness: 0.1, roughness: 0.5, transparent: true, opacity: 0.9, envMapIntensity: 0.25, side });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBind;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform float uT; uniform vec3 uTint; uniform vec4 uStyle; uniform vec2 uShard; varying vec3 vBind;
float vh31( vec3 p ) { return fract( sin( dot( p, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 ); }`)
        .replace('#include <opaque_fragment>', `{
        vec3 cell = floor( vBind * 17.0 );
        if ( step( 1.0 - 0.3 * uShard.x, fract( vh31( cell ) + uT * 0.06 ) ) > 0.5 ) discard;
        float fr = pow( 1.0 - abs( dot( normal, normalize( vViewPosition ) ) ), 1.7 );
        float scan = mix( 1.0, 0.6 + 0.4 * smoothstep( 0.2, 0.9, sin( gl_FragCoord.y * 1.25 - uT * 5.0 ) * 0.5 + 0.5 ), uStyle.x );
        float flick = 0.94 + 0.06 * sin( uT * 37.0 ) * sin( uT * 11.0 );
        vec3 g = abs( fract( vBind * 26.0 ) - 0.5 );
        float wire = ( 1.0 - smoothstep( 0.0, 0.07, min( g.x, min( g.y, g.z ) ) ) ) * uStyle.z;
        float f = sin( vBind.x * 70.0 + sin( vBind.y * 45.0 ) * 2.4 ) * sin( vBind.y * 62.0 + sin( vBind.z * 55.0 + vBind.x * 30.0 ) * 2.0 );
        float fil = ( 1.0 - smoothstep( 0.0, 0.16, abs( f ) ) ) * uStyle.y;
        float gl = step( 0.9, fract( sin( floor( gl_FragCoord.y / 5.0 ) * 13.7 + floor( uT * 9.0 ) * 7.1 ) * 4375.5 ) ) * uStyle.w;
        outgoingLight = ( outgoingLight * ( 0.25 + 0.5 * uShard.y ) + uTint * ( 0.1 + fr * 1.7 ) ) * scan * flick + uTint * ( wire * 1.6 + fil * 1.2 );
        outgoingLight = mix( outgoingLight, outgoingLight.brg * 1.4, gl );
        diffuseColor.a *= clamp( 0.3 + 0.45 * uShard.y + 0.45 * fr + wire + fil * 0.6, 0.0, 1.0 );
      }\n#include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => 'bustVeil' + side;
    return m;
  }
  const body = veilMat(THREE.FrontSide), piece = veilMat(THREE.DoubleSide);
  const plate = new THREE.MeshStandardMaterial({ color: 0x0d0a08, metalness: 0.9, roughness: 0.2, emissive: 0xffffff, emissiveIntensity: 0.1 });
  const mark = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });

  // faceplate: the front of the head ellipsoid (buildHuman's head is [0,0.1,0.01] × [0.078,0.1,0.09])
  const plateGeo = new THREE.SphereGeometry(1, 28, 18, Math.PI / 2 - 1.15, 2.3, 0.28, 2.35);
  const markGeo = new THREE.PlaneGeometry(0.088, 0.088);
  const heads = {
    hood: () => { const g = new THREE.SphereGeometry(0.13, 24, 14, Math.PI / 2 + 0.7, Math.PI * 2 - 1.4, 0, Math.PI * 0.8); g.scale(1.05, 1.25, 1.1); g.translate(0, 0.085, -0.012); return g; },
    cap: () => {
      const a = new THREE.CylinderGeometry(0.088, 0.092, 0.05, 20).translate(0, 0.19, 0);
      const b = new THREE.CylinderGeometry(0.105, 0.105, 0.008, 20, 1, false, -1.2, 2.4).translate(0, 0.168, 0.018);
      const c = new THREE.CylinderGeometry(0.1, 0.1, 0.012, 20).translate(0, 0.217, 0.0);
      return merge([a, b, c]);
    },
    ears: () => merge([-1, 1].map((s) => new THREE.ConeGeometry(0.032, 0.075, 4).rotateZ(-s * 0.4).translate(s * 0.055, 0.19, 0.0))),
  };
  const headGeo = new Map(), marks = new Map();

  function merge(gs) {
    const out = new THREE.BufferGeometry(), pos = [], nor = [], idx = [];
    let o = 0;
    for (const g of gs) {
      const p = g.attributes.position.array, n = g.attributes.normal.array;
      pos.push(...p); nor.push(...n);
      const ix = g.index ? g.index.array : [...Array(p.length / 3).keys()];
      for (const i of ix) idx.push(i + o);
      o += p.length / 3;
      g.dispose();
    }
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setIndex(idx);
    return out;
  }

  function emblem(kind) {
    if (marks.has(kind)) return marks.get(kind);
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.strokeStyle = x.fillStyle = '#fff'; x.lineWidth = 9; x.lineCap = x.lineJoin = 'round';
    x.shadowColor = '#fff'; x.shadowBlur = 8;
    x.beginPath();
    if (kind === 'quill') {
      x.moveTo(36, 104); x.quadraticCurveTo(52, 52, 100, 20); x.quadraticCurveTo(84, 66, 36, 104); x.stroke();
      x.lineWidth = 3; x.beginPath(); x.moveTo(36, 104); x.lineTo(84, 40); x.stroke();
      x.beginPath(); x.moveTo(30, 112); x.lineTo(40, 98); x.stroke();
    } else if (kind === 'leaf') {
      x.moveTo(64, 112); x.bezierCurveTo(16, 80, 28, 30, 64, 14); x.bezierCurveTo(100, 30, 112, 80, 64, 112); x.stroke();
      x.lineWidth = 3; x.beginPath(); x.moveTo(64, 112); x.lineTo(64, 30);
      for (const y of [50, 70, 90]) { x.moveTo(64, y); x.lineTo(44, y - 14); x.moveTo(64, y); x.lineTo(84, y - 14); }
      x.stroke();
    } else if (kind === 'grin') {
      const px = (a, b) => x.fillRect(a * 12 + 10, b * 12 + 10, 10, 10);
      [[2, 3], [1, 2], [3, 2], [6, 3], [5, 2], [7, 2], [1, 6], [2, 7], [3, 8], [4, 8], [5, 8], [6, 7], [7, 6]].forEach(([a, b]) => px(a, b));
    } else if (kind === 'star') {
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 20 : 48, a = -Math.PI / 2 + i * Math.PI / 5; x[i ? 'lineTo' : 'moveTo'](64 + Math.cos(a) * r, 66 + Math.sin(a) * r); }
      x.closePath(); x.stroke();
    } else if (kind === 'ark') {
      x.ellipse(64, 64, 50, 18, 0, 0, Math.PI * 2); x.stroke();
      x.lineWidth = 3; x.beginPath(); for (const dx of [-24, 0, 24]) { x.moveTo(64 + dx, 50); x.lineTo(64 + dx, 78); } x.stroke();
    } else { x.arc(64, 64, 40, 0, Math.PI * 2); x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    marks.set(kind, t);
    return t;
  }

  let rig = null, cur = VEIL_DEFAULT, bones = {}, jit = 0;
  const POSE_BONES = ['head', 'neck', 'chest', 'spine'];

  // dress an actor of kind 'human'; returns the veil used
  function wear(actor, id) {
    const v = VEILS[id] || VEIL_DEFAULT;
    cur = v;
    U.uTint.value.setHex(v.tint);
    U.uStyle.value.fromArray(v.style);
    U.uShard.value.set(v.shard, v.glass);
    body.color.setHex(v.body); piece.color.setHex(v.body);
    plate.color.setHex(v.plate); plate.emissive.setHex(v.tint);
    mark.map = emblem(v.mask); mark.color.setHex(v.tint); mark.needsUpdate = true;
    actor.mesh.material = body;
    bones = {};
    for (const n of POSE_BONES) bones[n] = actor.mesh.skeleton.getBoneByName(n);
    rig = new THREE.Group();
    const p = new THREE.Mesh(plateGeo, plate); p.position.set(0, 0.098, 0.014); p.scale.set(0.085, 0.104, 0.097);
    const m = new THREE.Mesh(markGeo, mark); m.position.set(0, 0.118, 0.114); m.renderOrder = 2;
    rig.add(p, m);
    if (v.head) {
      if (!headGeo.has(v.head)) headGeo.set(v.head, heads[v.head]());
      rig.add(new THREE.Mesh(headGeo.get(v.head), piece));
    }
    for (const o of rig.children) o.frustumCulled = false;
    bones.head.add(rig);
    actor.root.rotation.y = v.turn;
    return v;
  }

  // after actor.update(): the veil's own pose on top of idle/talk
  function pose(actor, t, level) {
    for (const [n, r] of Object.entries(cur.pose)) { const b = bones[n]; if (b) { b.rotation.x += r[0]; b.rotation.y += r[1]; b.rotation.z += r[2]; } }
    if (bones.head) bones.head.rotation.z += Math.sin(t * 1.3 * cur.sway) * 0.025 * cur.sway;
    if (cur.style[3] > 0.5) {
      jit = Math.sin(Math.floor(t * 9) * 12.9898) > 0.82 ? (Math.random() - 0.5) * 0.012 : 0;
      actor.root.position.x = jit;
    }
    mark.opacity = Math.min(1, 0.7 + level * 0.8);
    plate.emissiveIntensity = 0.1 + level * 0.25;
  }

  function remove() { rig?.removeFromParent(); rig = null; }
  const tintOf = (id) => (VEILS[id] || VEIL_DEFAULT).tint;
  return { wear, pose, remove, tintOf, mats: [body, piece, plate, mark], U, get veil() { return cur; } };
}
