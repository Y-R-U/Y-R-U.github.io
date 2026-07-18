// room.js — the room at the end of every world. Same archetype, seeded contents.
// The PC screen is a live canvas texture; taps are raycast → UV → hit regions.

import * as THREE from 'three';
import {
  posterCanvas, quoteFrameCanvas, bookCoverCanvas, windowViewCanvas, toTexture,
} from './canvastex.js';

const SCREEN_W = 640, SCREEN_H = 480;
const MONO = 'ui-monospace, Menlo, Consolas, monospace';

export class Room {
  constructor(spec, nextUuid, journey) {
    this.spec = spec;
    this.nextUuid = nextUuid;
    this.journey = journey;    // { visited, mode }
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0e);
    this.textures = [];
    this.clickables = [];
    this.hintIdx = 0;
    this._acc = 9;
    this._build();
  }

  tex(c) { const t = toTexture(c); this.textures.push(t); return t; }

  _build() {
    const { spec } = this;
    const pal = spec.roomPal;
    const r = spec.rand('room');
    const lam = (c) => new THREE.MeshLambertMaterial({ color: c });

    // shell: floor / ceiling / 4 walls  (room x −3..3, z −2.6..2.4, h 3.2)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 5), lam(pal.floor));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -0.1);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(6, 5), lam(0xe8e4dc));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 3.2, -0.1);
    const wallN = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.2), lam(pal.wall));   // desk wall
    wallN.position.set(0, 1.6, -2.6);
    const wallS = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.2), lam(pal.wall2));
    wallS.rotation.y = Math.PI; wallS.position.set(0, 1.6, 2.4);
    const wallE = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.2), lam(pal.wall2));  // window wall
    wallE.rotation.y = -Math.PI / 2; wallE.position.set(3, 1.6, -0.1);
    const wallW = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.2), lam(pal.wall));
    wallW.rotation.y = Math.PI / 2; wallW.position.set(-3, 1.6, -0.1);
    this.scene.add(floor, ceil, wallN, wallS, wallE, wallW);

    // rug
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.3, 24), lam(pal.rug));
    rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.012, 0.3);
    this.scene.add(rug);

    // desk
    const deskMat = lam(pal.desk);
    const desk = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.07, 0.95), deskMat);
    desk.position.set(0, 0.98, -2.05);
    for (const [lx, lz] of [[-1.2, -1.68], [1.2, -1.68], [-1.2, -2.42], [1.2, -2.42]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.98, 0.07), deskMat);
      leg.position.set(lx, 0.49, lz);
      this.scene.add(leg);
    }
    this.scene.add(desk);

    // monitor + screen
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.86, 0.07), lam(0x14161a));
    frame.position.set(0, 1.62, -2.32);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.1), lam(0x14161a));
    stand.position.set(0, 1.1, -2.32);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.3), lam(0x14161a));
    foot.position.set(0, 1.02, -2.3);
    this.screenCanvas = document.createElement('canvas');
    this.screenCanvas.width = SCREEN_W; this.screenCanvas.height = SCREEN_H;
    this.screenTex = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    this.screen = new THREE.Mesh(
      new THREE.PlaneGeometry(1.24, 0.78),
      new THREE.MeshBasicMaterial({ map: this.screenTex }),
    );
    this.screen.position.set(0, 1.62, -2.28);
    this.screen.userData.action = 'screen';
    this.clickables.push(this.screen);
    this.scene.add(frame, stand, foot, this.screen);
    const glow = new THREE.PointLight(0x88b8e8, 8, 5);
    glow.position.set(0, 1.6, -1.9);
    this.scene.add(glow);
    this.screenGlow = glow;

    // tower + keyboard + mouse
    const tower = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.52, 0.5), lam(0x1c1e24));
    tower.position.set(1.05, 1.28, -2.2);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.02), new THREE.MeshBasicMaterial({ color: 0x40ff80 }));
    led.position.set(1.05, 1.42, -1.94);
    this.towerLed = led;
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.03, 0.2), lam(0x2a2d33));
    kb.position.set(0, 1.03, -1.85);
    const mouse = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.12), lam(0x2a2d33));
    mouse.position.set(0.45, 1.04, -1.83);
    this.scene.add(tower, led, kb, mouse);

    // the book — char 14
    const bookGroup = new THREE.Group();
    const cover = this.tex(bookCoverCanvas(spec.book, (spec.posterSet.hue + 40) % 360, r));
    const bookMats = [
      lam(0xe8e2d2), lam(0xe8e2d2), // pages edges x
      new THREE.MeshLambertMaterial({ map: cover }), lam(0x2a2118), // top (cover), bottom
      lam(0xe8e2d2), lam(0xe8e2d2),
    ];
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.5), bookMats);
    book.rotation.y = r.range(-0.5, 0.2);
    bookGroup.add(book);
    bookGroup.position.set(-0.82, 1.05, -1.95);
    bookGroup.userData.action = 'book';
    book.userData.action = 'book';
    this.clickables.push(book);
    this.scene.add(bookGroup);

    // mug + lamp + plant + papers (micro-variation stream)
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.11, 10), lam(spec.vehPal.colors[0]));
    mug.position.set(0.78, 1.08, -2.05);
    this.scene.add(mug);
    if (r.chance(0.8)) {
      const armMat = lam(0x3a3d44);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.03, 10), armMat);
      base.position.set(-1.05, 1.03, -2.25);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.03), armMat);
      arm.position.set(-1.05, 1.28, -2.25); arm.rotation.z = 0.3;
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.14, 10), armMat);
      head.position.set(-0.97, 1.5, -2.25); head.rotation.z = 2.4;
      this.scene.add(base, arm, head);
      const warm = new THREE.PointLight(0xffd9a0, 6, 4);
      warm.position.set(-0.95, 1.45, -2.1);
      this.scene.add(warm);
    }
    if (r.chance(0.7)) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.24, 10), lam(0xa06040));
      pot.position.set(2.55, 0.12, -2.2);
      const fol = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), lam(spec.nature.foliage[0]));
      fol.position.set(2.55, 0.5, -2.2);
      fol.scale.y = 1.5;
      this.scene.add(pot, fol);
    }
    for (let i = 0; i < r.int(1, 4); i++) {
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.3), lam(0xf2eee2));
      paper.rotation.x = -Math.PI / 2;
      paper.rotation.z = r.range(-0.8, 0.8);
      paper.position.set(r.range(-0.6, 0.6), 1.021 + i * 0.002, -1.9 + r.range(-0.1, 0.1));
      this.scene.add(paper);
    }

    // chair (behind the camera, mostly seen when looking around)
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), lam(0x24262c));
    seat.position.set(0, 0.55, 0.75);
    const backr = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.06), lam(0x24262c));
    backr.position.set(0, 0.9, 1.0);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 8), lam(0x111));
    pole.position.set(0, 0.27, 0.75);
    this.scene.add(seat, backr, pole);

    // framed wall quote — char 12 (its twin is on a billboard out there)
    const quoteTex = this.tex(quoteFrameCanvas(spec.quote, spec.billboards.hue));
    const quote = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), new THREE.MeshBasicMaterial({ map: quoteTex }));
    quote.position.set(-1.9, 2.25, -2.58);
    quote.userData.action = 'quote';
    this.clickables.push(quote);
    this.scene.add(quote);

    // posters — char 13
    const pr = spec.rand('room-posters');
    const posterSpots = [
      { p: [1.9, 2.1, -2.58], ry: 0 },
      { p: [-2.98, 1.7, 0.6], ry: Math.PI / 2 },
      { p: [-2.98, 1.7, -1.2], ry: Math.PI / 2 },
      { p: [1.4, 1.8, 2.38], ry: Math.PI },
    ];
    const nPosters = 2 + pr.int(0, 2);
    for (let i = 0; i < nPosters; i++) {
      const spot = posterSpots[i];
      const t = this.tex(posterCanvas(spec.posterSet, pr, spec.uuid));
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.0), new THREE.MeshBasicMaterial({ map: t }));
      m.position.set(...spot.p);
      m.rotation.y = spot.ry;
      m.userData.action = 'poster';
      this.clickables.push(m);
      this.scene.add(m);
    }

    // window with a view of THIS world
    const wr = spec.rand('window-view');
    const viewTex = this.tex(windowViewCanvas(spec, wr));
    const view = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.2), new THREE.MeshBasicMaterial({ map: viewTex }));
    view.rotation.y = -Math.PI / 2;
    view.position.set(2.97, 1.75, -0.3);
    view.userData.action = 'window';
    this.clickables.push(view);
    const wf = lam(0x2e2620);
    for (const [w, h, px, py] of [[0.08, 1.36, -0.89, 0], [0.08, 1.36, 0.89, 0], [1.86, 0.08, 0, 0.64], [1.86, 0.08, 0, -0.64], [1.86, 0.04, 0, 0]]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, w), wf);
      bar.position.set(2.95, 1.75 + py, -0.3 + px);
      this.scene.add(bar);
    }
    this.scene.add(view);
    const winLight = new THREE.PointLight(new THREE.Color(spec.sky.mid), 4, 8);
    winLight.position.set(2.5, 1.8, -0.3);
    this.scene.add(winLight);

    // door on the south wall — where you "came in"
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 2.1), lam(0x322a22));
    door.rotation.y = Math.PI;
    door.position.set(-1.8, 1.05, 2.39);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), lam(0xb8a060));
    knob.position.set(-1.45, 1.05, 2.35);
    this.scene.add(door, knob);

    // shelf with books
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.28), lam(pal.desk));
    shelf.position.set(1.9, 2.5, 2.25);
    this.scene.add(shelf);
    let bx = 1.25;
    const br = spec.rand('shelf');
    while (bx < 2.6) {
      const bw = br.range(0.05, 0.1), bh = br.range(0.28, 0.42);
      const bb = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.2),
        lam(new THREE.Color().setHSL(br.float(), 0.45, 0.4).getHex()));
      bb.position.set(bx, 2.52 + bh / 2, 2.25);
      bb.rotation.z = br.chance(0.85) ? 0 : -0.22;
      this.scene.add(bb);
      bx += bw + 0.015;
    }

    // room lighting
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const ceiling = new THREE.PointLight(0xfff2e0, 12, 12);
    ceiling.position.set(0, 2.9, 0.3);
    this.scene.add(ceiling);

    this.renderScreen();
  }

  // ── the terminal ───────────────────────────────────────────────────────────
  renderScreen(pulse = 0) {
    const ctx = this.screenCanvas.getContext('2d');
    const W = SCREEN_W, H = SCREEN_H;
    const { spec } = this;
    ctx.fillStyle = '#070c10'; ctx.fillRect(0, 0, W, H);

    // header
    ctx.fillStyle = '#0f1a22'; ctx.fillRect(0, 0, W, 44);
    ctx.font = `700 20px ${MONO}`; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#4fd8c8'; ctx.textAlign = 'left';
    ctx.fillText('UUIDNET // WORLDLINK', 18, 24);
    const now = new Date();
    ctx.textAlign = 'right'; ctx.fillStyle = '#7a8894';
    ctx.font = `400 16px ${MONO}`;
    ctx.fillText(now.toLocaleDateString() + '  ' + now.toLocaleTimeString(), W - 16, 24);

    // session block
    ctx.textAlign = 'left';
    ctx.font = `400 17px ${MONO}`;
    ctx.fillStyle = '#5a90b8';
    ctx.fillText('user:', 18, 72);
    ctx.fillStyle = '#c8e8b0';
    ctx.fillText(spec.person, 78, 72);
    ctx.fillStyle = '#5a90b8';
    ctx.fillText('arrival:', 18, 98);
    ctx.fillStyle = this.journey.mode === 'random' ? '#e8b878' : '#8fd0e8';
    ctx.fillText(this.journey.mode.toUpperCase(), 108, 98);
    ctx.fillStyle = '#48545e';
    ctx.fillText(`worlds visited: ${this.journey.visited}`, 300, 98);

    ctx.strokeStyle = '#16242e'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(14, 120); ctx.lineTo(W - 14, 120); ctx.stroke();

    // next uuid, 2 rows × 16, coloured by char class
    ctx.font = `400 15px ${MONO}`;
    ctx.fillStyle = '#5a90b8';
    ctx.fillText('next world:', 18, 144);
    ctx.font = `700 30px ${MONO}`;
    const u = this.nextUuid;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 16; col++) {
        const ch = u[row * 16 + col];
        ctx.fillStyle = /[0-9]/.test(ch) ? '#e8d8a0' : /[a-z]/.test(ch) ? '#9fd8ff' : '#ff9fb8';
        ctx.fillText(ch, 32 + col * 36, 182 + row * 40);
      }
    }

    // CONNECT
    const cy = 280, ch2 = 62;
    const glow = 0.55 + pulse * 0.45;
    ctx.strokeStyle = `rgba(80,232,200,${glow})`;
    ctx.lineWidth = 3;
    ctx.fillStyle = `rgba(18,60,52,${0.5 + pulse * 0.3})`;
    ctx.beginPath(); ctx.roundRect(120, cy, 400, ch2, 10); ctx.fill(); ctx.stroke();
    ctx.font = `800 30px ${MONO}`; ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(160,255,230,${0.75 + pulse * 0.25})`;
    ctx.fillText('C O N N E C T', W / 2, cy + ch2 / 2 + 1);

    // RANDOM, faded
    ctx.font = `500 18px ${MONO}`;
    ctx.strokeStyle = 'rgba(140,150,160,0.3)'; ctx.lineWidth = 1.5;
    ctx.fillStyle = 'rgba(140,150,160,0.08)';
    ctx.beginPath(); ctx.roundRect(200, 368, 240, 38, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(150,160,170,0.5)';
    ctx.fillText('random', W / 2, 388);

    // rotating whisper-hint, very dim
    const hints = ['', '', 'tap the code', '', 'tap the code twice', '', 'the wall quote is out there', '', 'tap the code three times', ''];
    const hint = hints[this.hintIdx % hints.length];
    if (hint) {
      ctx.font = `400 14px ${MONO}`;
      ctx.fillStyle = 'rgba(90,105,115,0.4)';
      ctx.fillText(hint, W / 2, 440);
    }
    // blinking cursor
    if (Math.floor(Date.now() / 600) % 2) {
      ctx.fillStyle = '#4fd8c8';
      ctx.fillRect(18, 452, 12, 20);
    }
    // scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);

    this.screenTex.needsUpdate = true;
  }

  // canvas-space hit regions → actions
  screenAction(u, v) {
    const x = u * SCREEN_W, y = (1 - v) * SCREEN_H;
    if (x > 120 && x < 520 && y > 272 && y < 350) return 'connect';
    if (x > 190 && x < 450 && y > 360 && y < 414) return 'random';
    if (y > 128 && y < 240) return 'uuid';
    if (y < 44) return 'header';
    if (y > 56 && y < 84) return 'person';
    return null;
  }

  update(t, dt) {
    this._acc += dt;
    if (this._acc > 0.2) {  // ~5fps terminal refresh
      this._acc = 0;
      this.hintIdx = Math.floor(t / 6);
      this.renderScreen(Math.sin(t * 2.4) * 0.5 + 0.5);
    }
    this.screenGlow.intensity = 7 + Math.sin(t * 2.4) * 2;
    this.towerLed.material.color.setHex(Math.floor(t * 1.3) % 2 ? 0x40ff80 : 0x104020);
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) { if (m.map) m.map.dispose(); m.dispose(); }
      }
    });
    for (const t of this.textures) t.dispose();
    this.screenTex.dispose();
  }
}

// camera poses for the room
export const ROOM_SEAT = { pos: new THREE.Vector3(0, 1.42, 0.55), look: new THREE.Vector3(0, 1.55, -2.3) };
export const ROOM_DOOR = { pos: new THREE.Vector3(-1.7, 1.55, 1.9), look: new THREE.Vector3(0, 1.5, -2.2) };
