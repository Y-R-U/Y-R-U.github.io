import * as THREE from '../../vendor/three/three.module.js';

// Stand-ins used until (or if) a lane's real module fails to load. Keep the game bootable end-to-end.
const FOOD = { 1: 'steak', 2: 'steak', 7: 'steak', 3: 'lasagna', 5: 'lasagna', 6: 'lasagna', 10: 'lasagna', 4: 'meatloaf', 8: 'meatloaf', 9: 'meatloaf' };

export function stubWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf3d9b0);
  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x7a5030, 1.4));
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.2);
  sun.position.set(4, 7, 3); sun.target.position.set(4.6, 0, 5.5);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, far: 20 });
  scene.add(sun, sun.target);

  const colliders = [], anchors = new Map(), camBlockers = [];
  const box = (id, x0, y0, z0, x1, y1, z1, color, kind = 'solid', cam = false) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    colliders.push({ id, min: new THREE.Vector3(x0, y0, z0), max: new THREE.Vector3(x1, y1, z1), kind, enabled: true });
    if (cam) camBlockers.push(m);
    return m;
  };
  const W = 9.2, D = 11, Hh = 2.7;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: 0xc89060, roughness: 0.7 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(W / 2, 0, D / 2); floor.receiveShadow = true;
  scene.add(floor); camBlockers.push(floor);
  box('wallS', 0, 0, -0.2, W, Hh, 0, 0xf2e2c4, 'solid', true);
  box('wallN', 0, 0, D, W, Hh, D + 0.2, 0xf2e2c4, 'solid', true);
  box('wallW', -0.2, 0, 0, 0, Hh, D, 0xe9d3ad, 'solid', true);
  box('wallE', W, 0, 0, W + 0.2, Hh, D, 0xe9d3ad, 'solid', true);
  box('ceiling', 0, Hh, 0, W, Hh + 0.2, D, 0xfff8ee, 'solid', true).castShadow = false;
  // Kitchen table, Jon's chair, bench, fridge, windowsill, sofa.
  box('tableTop', 5.4, 0.72, 6.6, 7.0, 0.76, 7.6, 0xa0683a, 'surface');
  for (const [x, z] of [[5.5, 6.7], [6.9, 6.7], [5.5, 7.5], [6.9, 7.5]]) box('tleg' + x + z, x - 0.04, 0, z - 0.04, x + 0.04, 0.72, z + 0.04, 0x7a4a26);
  box('chairSeat', 6.0, 0.42, 7.75, 6.45, 0.46, 8.2, 0x8a5530, 'surface');
  box('chairBack', 6.0, 0.46, 8.15, 6.45, 1.0, 8.2, 0x8a5530);
  box('bench', 5.3, 0.4, 5.9, 7.1, 0.45, 6.25, 0x8a5530, 'surface');
  box('fridge', 8.3, 0, 8.6, 9.2, 1.85, 9.4, 0xf0f0ea);
  box('counter', 8.5, 0, 6.0, 9.2, 0.9, 8.5, 0xd8c6a8);
  box('sill', 0.0, 0.88, 2.0, 0.32, 0.92, 3.4, 0xffffff, 'surface');
  box('sofa', 1.0, 0, 4.2, 3.0, 0.45, 5.0, 0x7c9a6a, 'surface');
  box('sofaBack', 1.0, 0.45, 4.85, 3.0, 0.9, 5.0, 0x6c8a5a);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.03, 24), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  plate.position.set(6.2, 0.775, 7.3); scene.add(plate);
  const food = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 10), new THREE.MeshStandardMaterial({ color: 0x8a3b1a }));
  food.scale.y = 0.5; food.position.set(6.2, 0.81, 7.3); scene.add(food);

  const A = (n, x, y, z, rotY = 0) => anchors.set(n, { pos: new THREE.Vector3(x, y, z), rotY });
  A('playerSpawn', 3.2, 0, 3.0, Math.PI / 2); A('jonSpawn', 4.0, 0, 8.0, Math.PI);
  A('jonChair', 6.2, 0, 8.4, Math.PI); A('jonSeat', 6.22, 0.44, 7.95, Math.PI); A('tableTop', 6.2, 0.76, 7.1);
  A('plateSpot', 6.2, 0.76, 7.3); A('catBowl', 7.6, 0, 4.4, Math.PI); A('fridgeFront', 8.0, 0, 9.0, Math.PI / 2);
  A('windowsill', 0.16, 0.92, 2.7); A('underTable', 6.2, 0, 7.1); A('sofa', 2.0, 0.45, 4.6);
  A('frontDoor', 4.6, 0, 0.4); A('stairsBottom', 0.6, 0, 9.5);
  anchors.set('cam_table', { pos: new THREE.Vector3(4.2, 1.6, 5.2), look: new THREE.Vector3(6.2, 0.8, 7.4) });

  let food_ = 'steak';
  return {
    stub: true, scene, colliders, anchors, camBlockers, props: new Map(),
    exterior: { show() {} },
    update() {},
    addCollider(c) { colliders.push(c); }, removeCollider(id) { const i = colliders.findIndex((c) => c.id === id); if (i >= 0) colliders.splice(i, 1); },
    groundAt(x, z, fromY = 10) {
      let best = 0;
      for (const c of colliders) if (x >= c.min.x && x <= c.max.x && z >= c.min.z && z <= c.max.z && c.max.y <= fromY + 0.3 && c.max.y > best && c.max.y < 2.6) best = c.max.y;
      return best;
    },
    nav: { path: (a, b) => [b.clone()] },
    setFood(k) { food_ = k; food.material.color.set(k === 'steak' ? 0x8a3b1a : k === 'lasagna' ? 0xd0602a : 0x6a3a22); food.visible = true; },
    eatFood() { food.visible = false; },
    reset() { food.visible = true; },
    get food() { return food_; },
  };
}

export function stubActor(kind) {
  const isJon = kind === 'jon';
  const root = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: isJon ? 0x5a7fb8 : 0xf0922a, roughness: 0.7 });
  const H = isJon ? 1.82 : 0.42;
  const body = new THREE.Mesh(isJon ? new THREE.CapsuleGeometry(0.22, 1.3, 6, 12) : new THREE.CapsuleGeometry(0.18, 0.38, 6, 12), mat);
  if (isJon) body.position.y = 0.9; else { body.rotation.x = Math.PI / 2; body.position.y = 0.2; }
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(isJon ? 0.13 : 0.14, 16, 12), new THREE.MeshStandardMaterial({ color: isJon ? 0xf2c9a0 : 0xf0922a }));
  head.position.set(0, isJon ? 1.68 : 0.36, isJon ? 0 : 0.3); head.castShadow = true;
  root.add(body, head);
  let t = 0, move = 0;
  return {
    stub: true, root, height: H, radius: isJon ? 0.28 : 0.22,
    anims: [], sockets: { head, mouth: head, pawR: head, pawL: head, belly: body, handR: head, handL: head, hips: body, face: head, butt: body },
    update(dt) { t += dt * (2 + move * 4); body.position.y = (isJon ? 0.9 : 0.2) + (move > 0.1 ? Math.abs(Math.sin(t)) * 0.04 : 0); },
    play(name, o = {}) { return o.once ? new Promise((r) => setTimeout(r, 600)) : Promise.resolve(); },
    setMove(s) { move = s; },
    lookAt() {}, setBelly(b) { body.scale.set(1 + b * 0.4, 1, 1 + b * 0.4); }, claw() {}, setExpression() {}, holdProp() {},
    hitZone(p) { const h = p.y - root.position.y; return h > 1.3 ? 'face' : h > 0.8 ? 'butt' : 'leg'; },
    dispose() {},
  };
}

export const stubAudio = {
  stub: true, voLines: {},
  unlock() {}, music() {}, sfx() {}, vo: () => Promise.resolve({ dur: 0 }), setVolumes() {}, setMusicOn() {}, stopVo() {},
};

export function stubLevels() {
  const levels = {};
  for (let n = 1; n <= 10; n++) {
    levels[n] = {
      id: n, food: FOOD[n], title: `Level ${n}`, objectives: ['Jump on the table', `Eat Jon's ${FOOD[n]}`],
      setup(ctx) {
        ctx.setObjectives(this.objectives);
        const top = ctx.anchors.get('plateSpot');
        ctx.interact.register({
          id: 'food', getPos: (o) => o.copy(top.pos), radius: 0.45, heightTol: 0.3, label: 'Eat!',
          onInteract: async () => {
            ctx.objective(1);
            ctx.world.eatFood?.();
            await ctx.garfield.play('eat', { once: true });
            ctx.win();
          },
        });
        ctx.events.on('land', (e) => { if (e.surfaceId === 'tableTop') ctx.objective(0); });
      },
      update() {},
      teardown() {},
    };
  }
  return {
    stub: true, levels,
    async playOpening(ctx) {
      await ctx.director.run(async (d) => {
        await d.cam({ pos: [4.2, 1.6, 5.2], look: [6.2, 0.8, 7.4] }, { dur: 0.01 });
        await d.say('jon', 'stub_open', { text: `Dinner time! ${ctx.level.food} tonight!` });
        await d.say('garfield', 'stub_think', { text: 'Mine. All of it. Eventually.' });
      });
    },
    async playIntro(ctx) {
      await ctx.director.run(async (d) => {
        await d.cam({ pos: [1, 2.2, 1], look: [6, 0.8, 7] }, { dur: 0.01 });
        await d.cam({ pos: [4.4, 1.4, 5.6], look: [6.2, 0.8, 7.3] }, { dur: 2.5 });
        await d.say('garfield', 'stub_intro', { text: 'Steak night. I accept.' });
      });
    },
  };
}

export function stubUI() {
  const handlers = new Map();
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:12px;top:12px;z-index:20;font:16px system-ui;color:#4a2a12;background:#fff4dcdd;border-radius:12px;padding:8px 12px;pointer-events:auto';
  document.body.appendChild(el);
  const ui = {
    stub: true,
    on(n, f) { (handlers.get(n) || handlers.set(n, new Set()).get(n)).add(f); return () => handlers.get(n).delete(f); },
    off(n, f) { handlers.get(n)?.delete(f); },
    emit(n, d) { handlers.get(n)?.forEach((f) => f(d)); },
    controls: { move: { x: 0, y: 0 }, consumeLook: null },
    mount() {}, screen() {}, isBlocking: () => false,
    settings: { get: () => ({}), set() {}, open() {} },
    menu: { show() { el.innerHTML = '<button id="s-ch">Chapter One: Food</button>'; el.querySelector('button').onclick = () => ui.emit('chapter', 1); } },
    chapter: { show({ levels, onPick }) { el.innerHTML = levels.map((l) => `<button ${l.locked ? 'disabled' : ''} data-n="${l.n}">${l.n}</button>`).join(''); el.querySelectorAll('button').forEach((b) => (b.onclick = () => onPick?.(+b.dataset.n))); } },
    hud: { set(p) { if (p.objectives) el.innerHTML = p.objectives.map((o) => (o.done ? '☑ ' : '☐ ') + o.text).join('<br>'); } },
    say: ({ text, dur = 2 }) => new Promise((r) => { el.title = text; setTimeout(r, dur * 1000); }),
    toast() {}, tutorial: { show() {}, hide() {} }, letterbox() {}, fade: () => Promise.resolve(),
    pause: { open() {} }, complete: { show: () => new Promise((r) => { el.innerHTML = 'Level Complete! <button>Next</button>'; el.querySelector('button').onclick = () => r('next'); }) },
  };
  return ui;
}
