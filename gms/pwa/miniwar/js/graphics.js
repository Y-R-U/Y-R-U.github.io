/* ===== GRAPHICS ENGINE ===== */
const Graphics = (() => {
  let canvas, ctx;
  let W, H, scale;
  const bgCache = {};
  const spriteCache = {};

  function init(c) {
    canvas = c;
    ctx = c.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    scale = Math.min(W / CONFIG.DESIGN_WIDTH, H / CONFIG.DESIGN_HEIGHT);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Invalidate bg cache on resize
    Object.keys(bgCache).forEach(k => delete bgCache[k]);
  }

  function getWidth() { return W; }
  function getHeight() { return H; }
  function getScale() { return scale; }
  function getGroundY() { return H * CONFIG.GROUND_Y; }
  function getCtx() { return ctx; }

  function clear() {
    ctx.clearRect(0, 0, W, H);
  }

  // ===== BACKGROUND RENDERING =====
  function drawBackground(theme, ageIndex) {
    const key = theme + '_' + W + '_' + H + (Sprites.isLoaded() ? '_k' : '');
    if (bgCache[key]) {
      ctx.drawImage(bgCache[key], 0, 0);
      return;
    }
    // Render to offscreen canvas & cache
    let oc;
    if (typeof OffscreenCanvas !== 'undefined') {
      oc = new OffscreenCanvas(W, H);
    } else {
      oc = document.createElement('canvas');
      oc.width = W; oc.height = H;
    }
    const octx = oc.getContext('2d');
    renderBg(octx, theme, ageIndex);
    // Layer Kenney decorations on top of procedural background
    if (Sprites.isLoaded()) {
      Sprites.drawDecorations(octx, theme, W, H, H * CONFIG.GROUND_Y);
    }
    bgCache[key] = oc;
    ctx.drawImage(oc, 0, 0);
  }

  function renderBg(c, theme, ageIndex) {
    const groundY = H * CONFIG.GROUND_Y;
    switch (theme) {
      case 'wasteland': drawWastelandBg(c, groundY); break;
      case 'settlement': drawSettlementBg(c, groundY); break;
      case 'industrial': drawIndustrialBg(c, groundY); break;
      case 'tech': drawTechBg(c, groundY); break;
      case 'neo': drawNeoBg(c, groundY); break;
      default: drawWastelandBg(c, groundY);
    }
  }

  function drawWastelandBg(c, gy) {
    // Sky gradient - dusty orange sunset
    const skyGrad = c.createLinearGradient(0, 0, 0, gy);
    skyGrad.addColorStop(0, '#1a0a05');
    skyGrad.addColorStop(0.3, '#3d1a0a');
    skyGrad.addColorStop(0.6, '#8b4513');
    skyGrad.addColorStop(0.85, '#cd853f');
    skyGrad.addColorStop(1, '#daa520');
    c.fillStyle = skyGrad;
    c.fillRect(0, 0, W, gy);

    // Sun
    const sunGrad = c.createRadialGradient(W * 0.7, gy * 0.35, 0, W * 0.7, gy * 0.35, 60);
    sunGrad.addColorStop(0, 'rgba(255,180,50,0.8)');
    sunGrad.addColorStop(0.5, 'rgba(255,120,30,0.3)');
    sunGrad.addColorStop(1, 'transparent');
    c.fillStyle = sunGrad;
    c.fillRect(0, 0, W, gy);

    // Distant ruins silhouette
    c.fillStyle = 'rgba(30,15,5,0.35)';
    const rng = seededRandom(42);
    for (let x = 0; x < W; x += 30 + rng() * 40) {
      const h = 15 + rng() * 35;
      const w = 8 + rng() * 20;
      c.fillRect(x, gy * 0.7 - h, w, h + gy * 0.3);
    }

    // Ground
    const groundGrad = c.createLinearGradient(0, gy, 0, H);
    groundGrad.addColorStop(0, '#8b6914');
    groundGrad.addColorStop(0.3, '#6b4a12');
    groundGrad.addColorStop(1, '#3a2a0a');
    c.fillStyle = groundGrad;
    c.fillRect(0, gy, W, H - gy);

    // Ground texture - cracks
    c.strokeStyle = 'rgba(0,0,0,0.15)';
    c.lineWidth = 1;
    for (let i = 0; i < 15; i++) {
      const x = rng() * W;
      const y = gy + 5 + rng() * (H - gy - 10);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + (rng() - 0.5) * 60, y + (rng() - 0.5) * 20);
      c.lineTo(x + (rng() - 0.5) * 80, y + (rng() - 0.5) * 25);
      c.stroke();
    }

    // Scattered rocks
    c.fillStyle = 'rgba(60,40,20,0.5)';
    for (let i = 0; i < 8; i++) {
      const rx = rng() * W;
      const ry = gy + 10 + rng() * (H - gy - 30);
      drawRock(c, rx, ry, 3 + rng() * 6);
    }
  }

  function drawSettlementBg(c, gy) {
    // Green sky
    const skyGrad = c.createLinearGradient(0, 0, 0, gy);
    skyGrad.addColorStop(0, '#0a1628');
    skyGrad.addColorStop(0.4, '#1a3a2a');
    skyGrad.addColorStop(0.7, '#2a5a3a');
    skyGrad.addColorStop(1, '#5a9a5a');
    c.fillStyle = skyGrad;
    c.fillRect(0, 0, W, gy);

    // Clouds
    c.fillStyle = 'rgba(255,255,255,0.06)';
    const rng = seededRandom(101);
    for (let i = 0; i < 5; i++) {
      drawCloud(c, rng() * W, 30 + rng() * gy * 0.4, 40 + rng() * 50);
    }

    // Rolling hills
    c.fillStyle = '#3a7a3a';
    c.beginPath();
    c.moveTo(0, gy);
    for (let x = 0; x <= W; x += 5) {
      c.lineTo(x, gy - 10 - Math.sin(x * 0.015) * 20 - Math.sin(x * 0.008 + 1) * 15);
    }
    c.lineTo(W, gy); c.closePath(); c.fill();

    // Trees in background
    c.fillStyle = '#2a5a2a';
    for (let i = 0; i < 12; i++) {
      const tx = rng() * W;
      const ty = gy - 10 - Math.sin(tx * 0.015) * 20 - Math.sin(tx * 0.008 + 1) * 15;
      drawTree(c, tx, ty, 8 + rng() * 12);
    }

    // Ground
    const groundGrad = c.createLinearGradient(0, gy, 0, H);
    groundGrad.addColorStop(0, '#4a8a3a');
    groundGrad.addColorStop(0.2, '#3a7030');
    groundGrad.addColorStop(1, '#2a4a20');
    c.fillStyle = groundGrad;
    c.fillRect(0, gy, W, H - gy);

    // Grass tufts
    c.strokeStyle = 'rgba(90,160,60,0.4)';
    c.lineWidth = 1.5;
    for (let i = 0; i < 30; i++) {
      const gx = rng() * W;
      const gy2 = gy + 3 + rng() * 15;
      c.beginPath();
      c.moveTo(gx, gy2);
      c.lineTo(gx - 3, gy2 - 6);
      c.moveTo(gx, gy2);
      c.lineTo(gx + 2, gy2 - 7);
      c.stroke();
    }
  }

  function drawIndustrialBg(c, gy) {
    // Grey smoggy sky
    const skyGrad = c.createLinearGradient(0, 0, 0, gy);
    skyGrad.addColorStop(0, '#1a1a2a');
    skyGrad.addColorStop(0.5, '#2a2a3a');
    skyGrad.addColorStop(0.8, '#4a4a5a');
    skyGrad.addColorStop(1, '#6a6a7a');
    c.fillStyle = skyGrad;
    c.fillRect(0, 0, W, gy);

    // Smoke/smog layers
    c.fillStyle = 'rgba(100,100,110,0.1)';
    const rng = seededRandom(200);
    for (let i = 0; i < 6; i++) {
      drawCloud(c, rng() * W, 20 + rng() * gy * 0.5, 50 + rng() * 70);
    }

    // Factory silhouettes
    c.fillStyle = 'rgba(26,26,37,0.5)';
    for (let i = 0; i < 6; i++) {
      const fx = rng() * W;
      const fw = 20 + rng() * 40;
      const fh = 30 + rng() * 50;
      c.fillRect(fx, gy * 0.6 - fh, fw, fh + gy * 0.4);
      // Chimney
      c.fillRect(fx + fw * 0.3, gy * 0.6 - fh - 20, 6, 20);
    }

    // Ground - concrete
    const groundGrad = c.createLinearGradient(0, gy, 0, H);
    groundGrad.addColorStop(0, '#5a5a6a');
    groundGrad.addColorStop(0.3, '#4a4a55');
    groundGrad.addColorStop(1, '#2a2a30');
    c.fillStyle = groundGrad;
    c.fillRect(0, gy, W, H - gy);

    // Rail lines
    c.strokeStyle = 'rgba(100,100,100,0.3)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, gy + 20);
    c.lineTo(W, gy + 20);
    c.stroke();
  }

  function drawTechBg(c, gy) {
    // Deep blue digital sky
    const skyGrad = c.createLinearGradient(0, 0, 0, gy);
    skyGrad.addColorStop(0, '#050520');
    skyGrad.addColorStop(0.5, '#0a1040');
    skyGrad.addColorStop(1, '#1a2a60');
    c.fillStyle = skyGrad;
    c.fillRect(0, 0, W, gy);

    // Digital grid lines
    c.strokeStyle = 'rgba(50,150,255,0.06)';
    c.lineWidth = 1;
    for (let y = 0; y < gy; y += 30) {
      c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    }
    for (let x = 0; x < W; x += 30) {
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, gy); c.stroke();
    }

    // Floating data particles
    c.fillStyle = 'rgba(50,200,255,0.15)';
    const rng = seededRandom(300);
    for (let i = 0; i < 25; i++) {
      c.fillRect(rng() * W, rng() * gy, 2, 2);
    }

    // Cityscape silhouette
    c.fillStyle = 'rgba(10,10,32,0.5)';
    for (let x = 0; x < W; x += 15 + rng() * 25) {
      const bh = 30 + rng() * 80;
      const bw = 10 + rng() * 20;
      c.fillRect(x, gy - bh, bw, bh);
      // Lit windows
      c.fillStyle = 'rgba(50,150,255,0.15)';
      for (let wy = gy - bh + 5; wy < gy - 5; wy += 8) {
        for (let wx = x + 3; wx < x + bw - 3; wx += 6) {
          if (rng() > 0.4) c.fillRect(wx, wy, 3, 3);
        }
      }
      c.fillStyle = 'rgba(10,10,32,0.5)';
    }

    // Glowing ground
    const groundGrad = c.createLinearGradient(0, gy, 0, H);
    groundGrad.addColorStop(0, '#1a2a50');
    groundGrad.addColorStop(0.1, '#0a1530');
    groundGrad.addColorStop(1, '#050a18');
    c.fillStyle = groundGrad;
    c.fillRect(0, gy, W, H - gy);

    // Glowing line
    c.strokeStyle = 'rgba(50,200,255,0.3)';
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, gy + 1); c.lineTo(W, gy + 1); c.stroke();
  }

  function drawNeoBg(c, gy) {
    // Purple/pink neon sky
    const skyGrad = c.createLinearGradient(0, 0, 0, gy);
    skyGrad.addColorStop(0, '#0a0020');
    skyGrad.addColorStop(0.3, '#1a0040');
    skyGrad.addColorStop(0.6, '#300060');
    skyGrad.addColorStop(1, '#500080');
    c.fillStyle = skyGrad;
    c.fillRect(0, 0, W, gy);

    // Stars
    c.fillStyle = 'rgba(255,255,255,0.4)';
    const rng = seededRandom(400);
    for (let i = 0; i < 40; i++) {
      const sz = 1 + rng() * 2;
      c.fillRect(rng() * W, rng() * gy * 0.6, sz, sz);
    }

    // Neon aurora
    const auroraGrad = c.createLinearGradient(0, gy * 0.2, 0, gy * 0.6);
    auroraGrad.addColorStop(0, 'rgba(155,89,182,0)');
    auroraGrad.addColorStop(0.5, 'rgba(155,89,182,0.08)');
    auroraGrad.addColorStop(1, 'rgba(231,76,120,0.05)');
    c.fillStyle = auroraGrad;
    c.beginPath();
    c.moveTo(0, gy * 0.3);
    for (let x = 0; x <= W; x += 5) {
      c.lineTo(x, gy * 0.3 + Math.sin(x * 0.02) * 30 + Math.sin(x * 0.01 + 2) * 20);
    }
    c.lineTo(W, gy * 0.6); c.lineTo(0, gy * 0.6); c.closePath(); c.fill();

    // Futuristic towers
    c.fillStyle = 'rgba(10,0,32,0.5)';
    for (let x = 0; x < W; x += 20 + rng() * 30) {
      const bh = 40 + rng() * 100;
      const bw = 6 + rng() * 15;
      c.fillRect(x, gy - bh, bw, bh);
      // Neon strips
      c.fillStyle = `rgba(${100 + rng() * 155},${50 + rng() * 100},${180 + rng() * 75},0.25)`;
      c.fillRect(x, gy - bh + bh * 0.3, bw, 2);
      c.fillRect(x, gy - bh + bh * 0.6, bw, 2);
      c.fillStyle = 'rgba(10,0,32,0.5)';
    }

    // Ground
    const groundGrad = c.createLinearGradient(0, gy, 0, H);
    groundGrad.addColorStop(0, '#2a0050');
    groundGrad.addColorStop(0.15, '#1a0030');
    groundGrad.addColorStop(1, '#0a0015');
    c.fillStyle = groundGrad;
    c.fillRect(0, gy, W, H - gy);

    // Neon ground line
    c.strokeStyle = 'rgba(180,80,255,0.5)';
    c.lineWidth = 2;
    c.shadowColor = 'rgba(180,80,255,0.5)';
    c.shadowBlur = 10;
    c.beginPath(); c.moveTo(0, gy + 1); c.lineTo(W, gy + 1); c.stroke();
    c.shadowBlur = 0;
  }

  // Helper shapes
  function drawRock(c, x, y, r) {
    c.beginPath();
    c.moveTo(x - r, y);
    c.quadraticCurveTo(x - r * 0.5, y - r * 1.2, x, y - r);
    c.quadraticCurveTo(x + r * 0.7, y - r * 0.8, x + r, y);
    c.closePath();
    c.fill();
  }

  function drawTree(c, x, y, size) {
    // Trunk
    const prevFill = c.fillStyle;
    c.fillStyle = 'rgba(60,40,20,0.5)';
    c.fillRect(x - 2, y - size * 0.2, 4, size * 0.4);
    // Canopy
    c.fillStyle = prevFill;
    c.beginPath();
    c.arc(x, y - size * 0.5, size * 0.5, 0, Math.PI * 2);
    c.fill();
  }

  function drawCloud(c, x, y, w) {
    c.beginPath();
    c.arc(x, y, w * 0.3, 0, Math.PI * 2);
    c.arc(x + w * 0.25, y - w * 0.1, w * 0.25, 0, Math.PI * 2);
    c.arc(x + w * 0.5, y, w * 0.28, 0, Math.PI * 2);
    c.fill();
  }

  function seededRandom(seed) {
    let s = seed;
    return () => {
      s = (s * 16807 + 0) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  // ===== SPRITE DRAWING =====
  // All sprites are drawn procedurally for a consistent cartoon style

  function drawBase(x, y, hp, maxHp, isPlayer, age) {
    const bw = CONFIG.BASE_WIDTH * scale;
    const bh = CONFIG.BASE_HEIGHT * scale;
    const groundY = getGroundY();
    const healthPct = hp / maxHp;

    // Try Kenney sprite base first
    if (Sprites.isLoaded() && Sprites.drawBase(ctx, age, x, groundY, bw, bh, isPlayer, healthPct)) {
      return; // Sprite base drawn successfully
    }

    // ===== PROCEDURAL FALLBACK =====
    const bx = x - bw / 2;
    const by = groundY - bh;
    const ageColors = [
      ['#8B6914', '#6B4A12'], // wasteland
      ['#5a8f5a', '#3a6a3a'], // settlement
      ['#6a6a7a', '#4a4a5a'], // industrial
      ['#3a6a9a', '#2a4a7a'], // tech
      ['#6a3a8a', '#4a2a6a'], // neo
    ];
    const colors = ageColors[age] || ageColors[0];

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, groundY + 2, bw * 0.6, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Main structure
    ctx.fillStyle = colors[0];
    ctx.strokeStyle = colors[1];
    ctx.lineWidth = 2;

    if (age <= 1) {
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeRect(bx, by, bw, bh);
      const bSize = bw / 5;
      for (let i = 0; i < 5; i += 2) {
        ctx.fillRect(bx + i * bSize, by - bSize * 0.7, bSize, bSize * 0.7);
        ctx.strokeRect(bx + i * bSize, by - bSize * 0.7, bSize, bSize * 0.7);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(x - bw * 0.12, groundY - bh * 0.35, bw * 0.24, bh * 0.35);
      drawFlag(ctx, isPlayer ? bx + bw * 0.8 : bx + bw * 0.2, by - bSize * 0.7, isPlayer, age);
    } else if (age <= 2) {
      ctx.fillRect(bx, by + bh * 0.2, bw, bh * 0.8);
      ctx.strokeRect(bx, by + bh * 0.2, bw, bh * 0.8);
      ctx.beginPath();
      ctx.moveTo(bx - 3, by + bh * 0.2);
      ctx.lineTo(x, by - 5);
      ctx.lineTo(bx + bw + 3, by + bh * 0.2);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,200,50,0.4)';
      ctx.fillRect(bx + bw * 0.15, by + bh * 0.35, bw * 0.2, bh * 0.15);
      ctx.fillRect(bx + bw * 0.65, by + bh * 0.35, bw * 0.2, bh * 0.15);
      drawFlag(ctx, x, by - 5, isPlayer, age);
    } else {
      ctx.beginPath();
      ctx.moveTo(bx, groundY);
      ctx.lineTo(bx + bw * 0.1, by);
      ctx.lineTo(bx + bw * 0.9, by);
      ctx.lineTo(bx + bw, groundY);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      const coreColor = isPlayer ? 'rgba(50,200,150,0.5)' : 'rgba(230,50,50,0.5)';
      ctx.fillStyle = coreColor;
      ctx.beginPath();
      ctx.arc(x, by + bh * 0.4, bw * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = colors[1];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, by);
      ctx.lineTo(x, by - 15);
      ctx.stroke();
      ctx.fillStyle = isPlayer ? '#4ecdc4' : '#e74c3c';
      ctx.beginPath();
      ctx.arc(x, by - 15, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    if (healthPct < 0.5) {
      ctx.strokeStyle = 'rgba(200,50,50,0.4)';
      ctx.lineWidth = 1.5;
      const crackCount = Math.floor((1 - healthPct) * 6);
      const rng = seededRandom(isPlayer ? 999 : 888);
      for (let i = 0; i < crackCount; i++) {
        const cx = bx + rng() * bw;
        const cy = by + rng() * bh;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + (rng() - 0.5) * 15, cy + rng() * 10);
        ctx.lineTo(cx + (rng() - 0.5) * 20, cy + rng() * 15);
        ctx.stroke();
      }
    }
  }

  function drawFlag(c, x, y, isPlayer, age) {
    const flagColor = isPlayer ? '#4ecdc4' : '#e74c3c';
    c.strokeStyle = '#333';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x, y - 18);
    c.stroke();
    c.fillStyle = flagColor;
    c.beginPath();
    c.moveTo(x, y - 18);
    c.lineTo(x + 12, y - 14);
    c.lineTo(x, y - 10);
    c.closePath();
    c.fill();
  }

  // ===== UNIT SPRITES =====
  function drawUnit(unit, time) {
    const x = unit.x;
    const groundY = getGroundY();
    const y = groundY;
    const dir = unit.isPlayer ? 1 : -1;
    const sz = (unit.type === 'tank' || unit.type === 'siege') ? 14 : 10;
    const s = sz * scale;

    // Animation bob
    const bob = unit.state === 'moving' ? Math.sin(time * 0.008 + unit.id * 3) * 2 : 0;
    // Attack flash
    const attackFlash = unit.state === 'attacking' && (time - unit.lastAttackTime) < 100;

    ctx.save();
    ctx.translate(x, y + bob);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 2, s * 0.6, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    const pColor = unit.isPlayer ? '#4ecdc4' : '#e74c3c';
    const sColor = unit.isPlayer ? '#2a9a8a' : '#a02a2a';
    const skinColor = '#f4c794';

    switch (unit.unitDef.type) {
      case 'melee':
        drawMeleeUnit(ctx, s, dir, pColor, sColor, skinColor, unit, attackFlash, time);
        break;
      case 'ranged':
        drawRangedUnit(ctx, s, dir, pColor, sColor, skinColor, unit, attackFlash, time);
        break;
      case 'tank':
        drawTankUnit(ctx, s, dir, pColor, sColor, unit, attackFlash, time);
        break;
      case 'siege':
        drawSiegeUnit(ctx, s, dir, pColor, sColor, unit, attackFlash, time);
        break;
      default:
        drawMeleeUnit(ctx, s, dir, pColor, sColor, skinColor, unit, attackFlash, time);
    }

    // HP bar above unit
    if (unit.hp < unit.maxHp) {
      const barW = s * 1.8;
      const barH = 3;
      const barY = -s * 1.8;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(-barW / 2, barY, barW, barH);
      const hpPct = unit.hp / unit.maxHp;
      const hpColor = hpPct > 0.5 ? '#2ecc71' : hpPct > 0.25 ? '#f39c12' : '#e74c3c';
      ctx.fillStyle = hpColor;
      ctx.fillRect(-barW / 2, barY, barW * hpPct, barH);
    }

    ctx.restore();
  }

  function drawMeleeUnit(c, s, dir, pCol, sCol, skin, unit, flash, t) {
    // Body
    c.fillStyle = flash ? '#fff' : pCol;
    c.fillRect(-s * 0.35, -s * 1.2, s * 0.7, s * 0.7);

    // Head
    c.fillStyle = flash ? '#fff' : skin;
    c.beginPath();
    c.arc(0, -s * 1.5, s * 0.3, 0, Math.PI * 2);
    c.fill();

    // Helmet
    c.fillStyle = sCol;
    c.beginPath();
    c.arc(0, -s * 1.55, s * 0.32, Math.PI, 0);
    c.fill();

    // Legs (animated)
    const legAnim = unit.state === 'moving' ? Math.sin(t * 0.01 + unit.id) * s * 0.3 : 0;
    c.strokeStyle = sCol;
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(-s * 0.15, -s * 0.5);
    c.lineTo(-s * 0.2 + legAnim, 0);
    c.moveTo(s * 0.15, -s * 0.5);
    c.lineTo(s * 0.2 - legAnim, 0);
    c.stroke();

    // Weapon (sword)
    const swingAngle = unit.state === 'attacking' ?
      Math.sin((t - unit.lastAttackTime) * 0.02) * 0.8 : 0.3;
    c.save();
    c.translate(dir * s * 0.35, -s * 0.9);
    c.rotate(dir * (-0.5 + swingAngle));
    c.fillStyle = '#ccc';
    c.fillRect(-1.5, -s * 0.8, 3, s * 0.8);
    c.fillStyle = '#888';
    c.fillRect(-3, 0, 6, 3);
    c.restore();
  }

  function drawRangedUnit(c, s, dir, pCol, sCol, skin, unit, flash, t) {
    // Body (slightly thinner)
    c.fillStyle = flash ? '#fff' : pCol;
    c.fillRect(-s * 0.3, -s * 1.2, s * 0.6, s * 0.65);

    // Cloak
    c.fillStyle = sCol;
    c.beginPath();
    c.moveTo(-s * 0.35, -s * 1.1);
    c.lineTo(-s * 0.4 - dir * s * 0.1, -s * 0.4);
    c.lineTo(-s * 0.2, -s * 0.5);
    c.closePath();
    c.fill();

    // Head
    c.fillStyle = flash ? '#fff' : skin;
    c.beginPath();
    c.arc(0, -s * 1.45, s * 0.28, 0, Math.PI * 2);
    c.fill();

    // Hood
    c.fillStyle = sCol;
    c.beginPath();
    c.arc(0, -s * 1.5, s * 0.3, Math.PI * 1.1, Math.PI * 1.9);
    c.fill();

    // Legs
    const legAnim = unit.state === 'moving' ? Math.sin(t * 0.01 + unit.id) * s * 0.25 : 0;
    c.strokeStyle = sCol;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-s * 0.1, -s * 0.55);
    c.lineTo(-s * 0.15 + legAnim, 0);
    c.moveTo(s * 0.1, -s * 0.55);
    c.lineTo(s * 0.15 - legAnim, 0);
    c.stroke();

    // Weapon (bow/gun)
    c.save();
    c.translate(dir * s * 0.3, -s * 0.9);
    if (unit.unitDef.id === 'archer' || unit.unitDef.id === 'slinger') {
      // Bow
      c.strokeStyle = '#8B4513';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(dir * 5, 0, s * 0.4, -0.8, 0.8);
      c.stroke();
      // String
      c.strokeStyle = '#ddd';
      c.lineWidth = 1;
      c.beginPath();
      const bx = dir * 5 + Math.cos(-0.8) * s * 0.4;
      const by1 = Math.sin(-0.8) * s * 0.4;
      const by2 = Math.sin(0.8) * s * 0.4;
      c.moveTo(bx, by1);
      c.lineTo(bx, by2);
      c.stroke();
    } else {
      // Gun
      c.fillStyle = '#555';
      c.fillRect(0, -2, dir * s * 0.7, 4);
      c.fillStyle = '#333';
      c.fillRect(0, -3, dir * 3, 6);
      // Muzzle flash
      if (flash) {
        c.fillStyle = 'rgba(255,200,50,0.8)';
        c.beginPath();
        c.arc(dir * s * 0.8, 0, 4, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.restore();
  }

  function drawTankUnit(c, s, dir, pCol, sCol, unit, flash, t) {
    const bs = s * 1.3;
    // Heavy armor body
    c.fillStyle = flash ? '#fff' : pCol;
    c.beginPath();
    c.moveTo(-bs * 0.45, -bs * 1.0);
    c.lineTo(bs * 0.45, -bs * 1.0);
    c.lineTo(bs * 0.5, -bs * 0.2);
    c.lineTo(-bs * 0.5, -bs * 0.2);
    c.closePath();
    c.fill();
    c.strokeStyle = sCol;
    c.lineWidth = 2;
    c.stroke();

    // Visor
    c.fillStyle = 'rgba(255,255,255,0.3)';
    c.fillRect(-bs * 0.2, -bs * 0.9, bs * 0.4, bs * 0.15);

    // Shoulder pads
    c.fillStyle = sCol;
    c.fillRect(-bs * 0.55, -bs * 0.95, bs * 0.15, bs * 0.3);
    c.fillRect(bs * 0.4, -bs * 0.95, bs * 0.15, bs * 0.3);

    // Legs (thick)
    const legAnim = unit.state === 'moving' ? Math.sin(t * 0.008 + unit.id) * bs * 0.2 : 0;
    c.fillStyle = sCol;
    c.fillRect(-bs * 0.3 + legAnim * 0.3, -bs * 0.2, bs * 0.22, bs * 0.25);
    c.fillRect(bs * 0.1 - legAnim * 0.3, -bs * 0.2, bs * 0.22, bs * 0.25);

    // Shield for shield-type
    if (unit.unitDef.id === 'shieldbearer' || unit.unitDef.id === 'mech') {
      c.fillStyle = 'rgba(255,255,255,0.15)';
      c.strokeStyle = pCol;
      c.lineWidth = 2;
      c.beginPath();
      c.ellipse(dir * bs * 0.5, -bs * 0.6, bs * 0.15, bs * 0.4, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
  }

  function drawSiegeUnit(c, s, dir, pCol, sCol, unit, flash, t) {
    const bs = s * 1.4;
    // Platform/wheels
    c.fillStyle = '#444';
    c.fillRect(-bs * 0.5, -bs * 0.25, bs * 1.0, bs * 0.2);
    // Wheels
    c.fillStyle = '#333';
    c.beginPath();
    c.arc(-bs * 0.35, 0, bs * 0.12, 0, Math.PI * 2);
    c.arc(bs * 0.35, 0, bs * 0.12, 0, Math.PI * 2);
    c.fill();

    // Cannon barrel
    c.fillStyle = flash ? '#ff8' : '#555';
    c.save();
    const recoil = flash ? -3 : 0;
    c.translate(dir * recoil, 0);
    c.fillRect(dir > 0 ? 0 : -bs * 0.8, -bs * 0.45, bs * 0.8, bs * 0.15);
    c.restore();

    // Body
    c.fillStyle = pCol;
    c.fillRect(-bs * 0.35, -bs * 0.7, bs * 0.7, bs * 0.45);
    c.strokeStyle = sCol;
    c.lineWidth = 1.5;
    c.strokeRect(-bs * 0.35, -bs * 0.7, bs * 0.7, bs * 0.45);

    // Emblem
    c.fillStyle = sCol;
    c.beginPath();
    c.arc(0, -bs * 0.48, bs * 0.1, 0, Math.PI * 2);
    c.fill();

    // Muzzle flash
    if (flash) {
      c.fillStyle = 'rgba(255,200,50,0.7)';
      const fx = dir > 0 ? bs * 0.8 : -bs * 0.8;
      c.beginPath();
      c.arc(fx, -bs * 0.38, 6, 0, Math.PI * 2);
      c.fill();
    }
  }

  // ===== UNIT ICON for HUD buttons (drawn to small canvas) =====
  function getUnitIcon(unitDef, isPlayer) {
    const key = unitDef.id + (isPlayer ? '_p' : '_e');
    if (spriteCache[key]) return spriteCache[key];

    const size = 64;
    const oc = document.createElement('canvas');
    oc.width = size; oc.height = size;
    const c = oc.getContext('2d');

    const pCol = isPlayer ? '#4ecdc4' : '#e74c3c';
    const sCol = isPlayer ? '#2a9a8a' : '#a02a2a';
    const skin = '#f4c794';
    const s = 14;
    const dir = 1;

    c.save();
    c.translate(size / 2, size * 0.85);
    c.scale(1.8, 1.8);

    switch (unitDef.type) {
      case 'melee':
        drawMeleeUnitIcon(c, s, dir, pCol, sCol, skin);
        break;
      case 'ranged':
        drawRangedUnitIcon(c, s, dir, pCol, sCol, skin, unitDef);
        break;
      case 'tank':
        drawTankUnitIcon(c, s, dir, pCol, sCol, unitDef);
        break;
      case 'siege':
        drawSiegeUnitIcon(c, s, dir, pCol, sCol);
        break;
    }
    c.restore();

    spriteCache[key] = oc;
    return oc;
  }

  function drawMeleeUnitIcon(c, s, dir, pCol, sCol, skin) {
    c.fillStyle = pCol;
    c.fillRect(-s * 0.35, -s * 1.2, s * 0.7, s * 0.7);
    c.fillStyle = skin;
    c.beginPath(); c.arc(0, -s * 1.5, s * 0.3, 0, Math.PI * 2); c.fill();
    c.fillStyle = sCol;
    c.beginPath(); c.arc(0, -s * 1.55, s * 0.32, Math.PI, 0); c.fill();
    c.strokeStyle = sCol; c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(-s * 0.15, -s * 0.5); c.lineTo(-s * 0.2, 0);
    c.moveTo(s * 0.15, -s * 0.5); c.lineTo(s * 0.2, 0);
    c.stroke();
    c.fillStyle = '#ccc';
    c.fillRect(s * 0.3, -s * 1.5, 3, s * 0.8);
  }

  function drawRangedUnitIcon(c, s, dir, pCol, sCol, skin, def) {
    c.fillStyle = pCol;
    c.fillRect(-s * 0.3, -s * 1.2, s * 0.6, s * 0.65);
    c.fillStyle = skin;
    c.beginPath(); c.arc(0, -s * 1.45, s * 0.28, 0, Math.PI * 2); c.fill();
    c.fillStyle = sCol;
    c.beginPath(); c.arc(0, -s * 1.5, s * 0.3, Math.PI * 1.1, Math.PI * 1.9); c.fill();
    c.strokeStyle = sCol; c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-s * 0.1, -s * 0.55); c.lineTo(-s * 0.15, 0);
    c.moveTo(s * 0.1, -s * 0.55); c.lineTo(s * 0.15, 0);
    c.stroke();
    c.fillStyle = '#555';
    c.fillRect(s * 0.3, -s * 1.0, s * 0.5, 3);
  }

  function drawTankUnitIcon(c, s, dir, pCol, sCol, def) {
    const bs = s * 1.3;
    c.fillStyle = pCol;
    c.beginPath();
    c.moveTo(-bs * 0.45, -bs * 1.0); c.lineTo(bs * 0.45, -bs * 1.0);
    c.lineTo(bs * 0.5, -bs * 0.2); c.lineTo(-bs * 0.5, -bs * 0.2);
    c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.3)';
    c.fillRect(-bs * 0.2, -bs * 0.9, bs * 0.4, bs * 0.15);
    c.fillStyle = sCol;
    c.fillRect(-bs * 0.55, -bs * 0.95, bs * 0.15, bs * 0.3);
    c.fillRect(bs * 0.4, -bs * 0.95, bs * 0.15, bs * 0.3);
    c.fillRect(-bs * 0.25, -bs * 0.15, bs * 0.22, bs * 0.2);
    c.fillRect(bs * 0.05, -bs * 0.15, bs * 0.22, bs * 0.2);
  }

  function drawSiegeUnitIcon(c, s, dir, pCol, sCol) {
    const bs = s * 1.4;
    c.fillStyle = '#444';
    c.fillRect(-bs * 0.5, -bs * 0.25, bs * 1.0, bs * 0.2);
    c.fillStyle = '#555';
    c.fillRect(0, -bs * 0.45, bs * 0.8, bs * 0.15);
    c.fillStyle = pCol;
    c.fillRect(-bs * 0.35, -bs * 0.7, bs * 0.7, bs * 0.45);
    c.strokeStyle = sCol; c.lineWidth = 1.5;
    c.strokeRect(-bs * 0.35, -bs * 0.7, bs * 0.7, bs * 0.45);
  }

  // ===== PROJECTILES =====
  function drawProjectile(proj) {
    // Try Kenney bullet sprites
    if (Sprites.isLoaded()) {
      const flipX = !proj.isPlayer;
      const size = proj.type === 'cannonball' ? 14 : proj.type === 'plasma' ? 12 : 10;
      if (Sprites.drawBullet(ctx, proj.type, proj.x, proj.y, size * scale, proj.isPlayer, flipX)) {
        // Add team-colored glow behind the sprite
        ctx.fillStyle = proj.isPlayer ? 'rgba(78,205,196,0.3)' : 'rgba(231,76,60,0.3)';
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, size * scale * 0.4, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
    }

    // Procedural fallback
    ctx.save();
    ctx.translate(proj.x, proj.y);

    if (proj.type === 'bullet') {
      ctx.fillStyle = proj.isPlayer ? '#4ecdc4' : '#e74c3c';
      ctx.beginPath();
      ctx.arc(0, 0, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = proj.isPlayer ? 'rgba(78,205,196,0.3)' : 'rgba(231,76,60,0.3)';
      const dx = proj.isPlayer ? -1 : 1;
      ctx.beginPath();
      ctx.arc(dx * 5, 0, 1.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (proj.type === 'cannonball') {
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#555';
      ctx.beginPath();
      ctx.arc(-1, -1, 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (proj.type === 'plasma') {
      ctx.fillStyle = proj.isPlayer ? 'rgba(78,205,196,0.8)' : 'rgba(231,76,60,0.8)';
      ctx.shadowColor = proj.isPlayer ? '#4ecdc4' : '#e74c3c';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  // ===== PARTICLES =====
  function drawParticle(p) {
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    if (p.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  // ===== SPECIAL ATTACK VISUAL =====
  function drawSpecialAttack(x, progress) {
    const groundY = getGroundY();
    const radius = 40 + progress * 20;
    const alpha = 1 - progress;

    // Try Kenney explosion sprite
    if (Sprites.isLoaded()) {
      Sprites.drawExplosion(ctx, x, groundY - 20, radius * 2, progress, alpha);
    }

    // Shockwave ring (always draw - looks great layered on explosion sprite)
    ctx.strokeStyle = `rgba(255,180,50,${alpha * 0.8})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, groundY - 20, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Inner glow
    const grad = ctx.createRadialGradient(x, groundY - 20, 0, x, groundY - 20, radius);
    grad.addColorStop(0, `rgba(255,200,50,${alpha * 0.3})`);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, groundY - 20, radius, 0, Math.PI * 2);
    ctx.fill();

    // Debris
    ctx.fillStyle = `rgba(200,100,50,${alpha * 0.5})`;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + progress * 3;
      const dist = radius * 0.6;
      const px = x + Math.cos(angle) * dist;
      const py = groundY - 20 + Math.sin(angle) * dist * 0.5;
      ctx.fillRect(px - 2, py - 2, 4, 4);
    }
  }

  // ===== DAMAGE NUMBERS =====
  function drawDamageNumber(dn) {
    ctx.globalAlpha = dn.alpha;
    ctx.font = `bold ${11 * scale}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillStyle = dn.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeText(dn.text, dn.x, dn.y);
    ctx.fillText(dn.text, dn.x, dn.y);
    ctx.globalAlpha = 1;
  }

  return {
    init, resize, clear, getWidth, getHeight, getScale, getGroundY, getCtx,
    drawBackground, drawBase, drawUnit, drawProjectile, drawParticle,
    drawSpecialAttack, drawDamageNumber, getUnitIcon,
  };
})();
