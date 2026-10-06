import { THREE, makeProp, addBox, Builder, roundedBox, gloss } from './util.js';

const CW = 160, CH = 120;

// Old CRT: retro beige plastic case (refs/living_room), bulged glass screen with a live canvas (cartoon / static / off).
export function createTV(ctx) {
  const p = makeProp('tv', ctx);
  const W = 0.58, H = 0.46, D = 0.44;
  const veneer = gloss(0xd8c19a, { roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.5 });
  const plastic = gloss(0x3a332c, { roughness: 0.5, clearcoat: 0.3 });
  const knobMat = gloss(0x6a5440, { roughness: 0.4, clearcoat: 0.5 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xcfcfd4, metalness: 1, roughness: 0.25 });
  const canvas = document.createElement('canvas'); canvas.width = CW; canvas.height = CH;
  const g2 = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.1, roughness: 0.15 });

  const b = new Builder();
  b.add(roundedBox(W, H, D, 0.05, 3), veneer, { pos: [0, H / 2 + 0.03, -D / 2 + 0.02] });
  b.add(roundedBox(W * 0.86, H * 0.84, 0.03, 0.03, 2), plastic, { pos: [-0.04, H / 2 + 0.03, 0.035] });
  // side control strip: two knobs, a power button, speaker grille slots
  for (const y of [0.4, 0.32]) b.add(new THREE.CylinderGeometry(0.02, 0.022, 0.03, 14), knobMat, { pos: [W / 2 - 0.06, y, 0.04], rot: [Math.PI / 2, 0, 0] });
  b.add(roundedBox(0.03, 0.016, 0.012, 0.004), chrome, { pos: [W / 2 - 0.06, 0.255, 0.035] });
  for (let i = 0; i < 6; i++) b.add(roundedBox(0.056, 0.007, 0.01, 0.003), plastic, { pos: [W / 2 - 0.06, 0.2 - i * 0.02, 0.031] });
  for (const sx of [-1, 1]) b.add(roundedBox(0.05, 0.03, 0.05, 0.012), plastic, { pos: [sx * (W / 2 - 0.07), 0.015, -D / 2 + 0.05] });
  // rabbit ears
  b.add(new THREE.SphereGeometry(0.04, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), plastic, { pos: [0, H + 0.03, -0.18] });
  for (const s of [-1, 1]) b.add(new THREE.CylinderGeometry(0.003, 0.004, 0.42, 6), chrome, { pos: [s * 0.1, H + 0.22, -0.18], rot: [0, 0, -s * 0.5] });
  p.root.add(b.build('tvBody'));

  // gently bulged screen sitting proud of the bezel (a deep sphere cap read as a round porthole)
  const SW = 0.4, SH = 0.31;
  const sg = new THREE.PlaneGeometry(SW, SH, 10, 8), pos = sg.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / (SW / 2), v = pos.getY(i) / (SH / 2);
    pos.setZ(i, 0.016 * (1 - u * u * 0.7) * (1 - v * v * 0.7));
  }
  sg.computeVertexNormals();
  const screen = new THREE.Mesh(sg, screenMat);
  screen.position.set(-0.04, H / 2 + 0.03, 0.051);
  p.root.add(screen);


  let mode = 'cartoon', t = 0, acc = 0;
  const img = g2.createImageData(CW, CH);
  const draw = () => {
    if (mode === 'off') { g2.fillStyle = '#0b0d0c'; g2.fillRect(0, 0, CW, CH); return; }
    if (mode === 'static') {
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
      g2.putImageData(img, 0, 0);
      return;
    }
    // little original cartoon: a bouncing blue dog chasing a red ball across a hill
    g2.fillStyle = '#7ec8ff'; g2.fillRect(0, 0, CW, CH);
    g2.fillStyle = '#fff6b0'; g2.beginPath(); g2.arc(130, 22, 12, 0, Math.PI * 2); g2.fill();
    g2.fillStyle = '#5fbf4a'; g2.beginPath(); g2.ellipse(80, 130, 120, 50, 0, 0, Math.PI * 2); g2.fill();
    const x = ((t * 40) % (CW + 60)) - 30;
    const by = 70 - Math.abs(Math.sin(t * 4)) * 30;
    g2.fillStyle = '#e8402a'; g2.beginPath(); g2.arc(x + 30, by, 7, 0, Math.PI * 2); g2.fill();
    const dy = 78 - Math.abs(Math.sin(t * 6)) * 8;
    g2.fillStyle = '#4a74d9'; g2.beginPath(); g2.ellipse(x, dy, 14, 9, 0, 0, Math.PI * 2); g2.fill();
    g2.beginPath(); g2.arc(x + 12, dy - 8, 7, 0, Math.PI * 2); g2.fill();
    g2.fillStyle = '#fff'; g2.beginPath(); g2.arc(x + 14, dy - 10, 2.5, 0, Math.PI * 2); g2.fill();
    g2.fillStyle = '#222'; g2.beginPath(); g2.arc(x + 15, dy - 10, 1.2, 0, Math.PI * 2); g2.fill();
    // scanlines + vignette
    g2.fillStyle = 'rgba(0,0,0,0.12)'; for (let y = 0; y < CH; y += 3) g2.fillRect(0, y, CW, 1);
    const v = g2.createRadialGradient(CW / 2, CH / 2, CW * 0.45, CW / 2, CH / 2, CW * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.3)');
    g2.fillStyle = v; g2.fillRect(0, 0, CW, CH);
  };
  p.onUpdate(dt => {
    t += dt; acc += dt;
    if (acc > 1 / 15) {
      acc = 0; draw(); tex.needsUpdate = true;
      const flick = mode === 'off' ? 0 : 0.85 + Math.random() * 0.25;
      screenMat.emissiveIntensity = mode === 'off' ? 0 : 1.1 * flick;
    }
  });
  p.setMode = m => { mode = m; p.state.mode = m; };
  p.state.mode = mode;
  addBox(p, 'body', p.root, [-W / 2, 0, -D + 0.02], [W / 2, H + 0.05, 0.06]);
  p.reset = () => p.setMode('cartoon');
  draw(); tex.needsUpdate = true;
  return p;
}
