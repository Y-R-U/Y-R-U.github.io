// renderer.js — All SVG/canvas drawing via Path2D
const Renderer = (() => {
  let ctx = null;

  function init(context) { ctx = context; }

  // === BACKGROUND ===
  function drawBackground(canvasW, canvasH, t) {
    ctx.fillStyle = '#050d1a';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // Subtle grid lines (plasma membrane style)
    ctx.strokeStyle = 'rgba(74,240,176,0.03)';
    ctx.lineWidth = 1;
    const gridSize = 60;
    for (let x = 0; x < canvasW; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvasH); ctx.stroke();
    }
    for (let y = 0; y < canvasH; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvasW, y); ctx.stroke();
    }
  }

  // === PLAYER CELL ===
  function drawPlayer(playerState, wobblePhase, invincible, isPhasing, t) {
    if (!playerState) return;
    const { x, y } = playerState;
    const baseR = playerState.radius * playerState.radiusMultiplier;
    const N = 24;

    ctx.save();
    if (invincible && Math.floor(t * 10) % 2 === 0) {
      ctx.globalAlpha = 0.5;
    }
    if (isPhasing) ctx.globalAlpha = 0.4;

    // Outer glow
    ctx.shadowColor = '#4af0b0';
    ctx.shadowBlur = 16;

    // Cell membrane (wobble)
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const r = baseR + 5 * Math.sin(3 * a + wobblePhase);
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(74,240,176,0.15)';
    ctx.fill();
    ctx.strokeStyle = '#4af0b0';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Nucleus
    ctx.beginPath();
    ctx.arc(x, y, baseR * 0.38, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(74,240,176,0.35)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(74,240,176,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Cytoplasm granules
    const granuleAngles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
    granuleAngles.forEach((a, i) => {
      const ga = a + wobblePhase * 0.3 + i;
      const gr = baseR * 0.6;
      ctx.beginPath();
      ctx.arc(x + Math.cos(ga) * gr * 0.45, y + Math.sin(ga) * gr * 0.45, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(74,240,176,0.4)';
      ctx.fill();
    });

    // Shield visual
    if (playerState.shieldCharges > 0) {
      ctx.beginPath();
      ctx.arc(x, y, baseR + 8, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(68,170,255,${0.4 + 0.2 * Math.sin(t * 4)})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();
  }

  // === AURA ===
  function drawAura(x, y, radius, color, t) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = color || 'rgba(74,240,176,0.2)';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3 + 0.1 * Math.sin(t * 3);
    ctx.stroke();
    ctx.globalAlpha = 0.05 + 0.03 * Math.sin(t * 3);
    ctx.fillStyle = color || 'rgba(74,240,176,0.1)';
    ctx.fill();
    ctx.restore();
  }

  // === ENEMY SHAPES ===
  function drawEnemy(e, t) {
    if (!e.alive) return;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.angle);

    const pulse = 1 + 0.06 * Math.sin(e.pulsePhase);

    switch (e.shape) {
      case 'cocci': drawCocci(e, pulse, t); break;
      case 'rod': drawRod(e, pulse, t); break;
      case 'icosahedron': drawIcosahedron(e, pulse, t); break;
      case 'spore': drawSpore(e, pulse, t); break;
      case 'crescent': drawCrescent(e, pulse, t); break;
      case 'corona': drawCorona(e, pulse, t); break;
      case 'spiral': drawSpiral(e, pulse, t); break;
      case 'prion': drawPrion(e, pulse, t); break;
      case 'armoured_sphere': drawArmouredSphere(e, pulse, t); break;
      case 'neoplasm': drawNeoplasm(e, pulse, t); break;
      default: drawDefaultEnemy(e, pulse); break;
    }

    // Health bar
    if (e.hp < e.maxHp) {
      const bw = e.radius * 2;
      const bh = 4;
      const bx = -bw / 2;
      const by = -e.radius - 10;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = e.color;
      ctx.fillRect(bx, by, bw * (e.hp / e.maxHp), bh);
    }

    // Poison indicator
    if (e.poisoned) {
      ctx.beginPath();
      ctx.arc(0, 0, e.radius + 3, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(100,255,100,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Marked indicator
    if (e.marked) {
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(0, -e.radius - 6, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawCocci(e, pulse, t) {
    // Chain of 3 circles
    const r = e.radius * 0.5 * pulse;
    ctx.shadowColor = e.color;
    ctx.shadowBlur = 8;
    [-r, 0, r].forEach(ox => {
      ctx.beginPath();
      ctx.arc(ox, 0, r * 0.9, 0, Math.PI * 2);
      ctx.fillStyle = `${e.color}33`;
      ctx.fill();
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    ctx.shadowBlur = 0;
  }

  function drawRod(e, pulse, t) {
    const w = e.radius * 2.2 * pulse;
    const h = e.radius * 0.75 * pulse;
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = `${e.color}33`;
    ctx.fill();
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    // Flagella
    for (let i = 0; i < 3; i++) {
      const fy = (i - 1) * h * 0.3;
      ctx.beginPath();
      ctx.moveTo(w / 2, fy);
      ctx.bezierCurveTo(w / 2 + 20, fy + 10 * Math.sin(t * 4 + i), w / 2 + 30, fy - 8, w / 2 + 35, fy);
      ctx.strokeStyle = `${e.color}88`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function drawIcosahedron(e, pulse, t) {
    const r = e.radius * pulse;
    const N = 6;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = `${e.color}22`;
    ctx.fill();
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    // Spikes
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + Math.PI / N;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8);
      ctx.lineTo(Math.cos(a) * (r + 10), Math.sin(a) * (r + 10));
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function drawSpore(e, pulse, t) {
    const r = e.radius * pulse;
    const wobble = (a) => r + 5 * Math.sin(4 * a + e.wobblePhase);
    ctx.beginPath();
    const N = 20;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const rr = wobble(a);
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = `${e.color}33`;
    ctx.fill();
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    // Bud
    ctx.beginPath();
    ctx.arc(r * 0.5, -r * 0.3, r * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = `${e.color}44`;
    ctx.fill();
    ctx.stroke();
  }

  function drawCrescent(e, pulse, t) {
    const r = e.radius * pulse;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0.3, Math.PI * 2 - 0.3);
    ctx.arc(r * 0.3, 0, r * 0.7, Math.PI * 2 - 0.3, 0.3, true);
    ctx.closePath();
    ctx.fillStyle = `${e.color}33`;
    ctx.fill();
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    // Hook
    ctx.beginPath();
    ctx.moveTo(r * Math.cos(0.3), r * Math.sin(0.3));
    ctx.quadraticCurveTo(r + 12, 0, r * Math.cos(-0.3), r * Math.sin(-0.3));
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawCorona(e, pulse, t) {
    const r = e.radius * pulse;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = `${e.color}33`;
    ctx.fill();
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    // S-proteins
    const spikes = 8;
    for (let i = 0; i < spikes; i++) {
      const a = (i / spikes) * Math.PI * 2 + t * 0.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.lineTo(Math.cos(a) * (r + 14), Math.sin(a) * (r + 14));
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.stroke();
      // Club tip
      ctx.beginPath();
      ctx.arc(Math.cos(a) * (r + 14), Math.sin(a) * (r + 14), 3.5, 0, Math.PI * 2);
      ctx.fillStyle = e.color;
      ctx.fill();
    }
    ctx.lineCap = 'butt';
  }

  function drawSpiral(e, pulse, t) {
    const r = e.radius * pulse;
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    const turns = 2.5;
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const frac = i / steps;
      const a = frac * Math.PI * 2 * turns + e.corkscrewT;
      const rr = frac * r;
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr * 0.4;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fillStyle = e.color;
    ctx.fill();
  }

  function drawPrion(e, pulse, t) {
    const r = e.radius * pulse;
    ctx.shadowColor = e.color;
    ctx.shadowBlur = 10;
    // Misfolded mass - irregular blob
    ctx.beginPath();
    const pts = 7;
    for (let i = 0; i <= pts; i++) {
      const a = (i / pts) * Math.PI * 2;
      const rr = r * (0.6 + 0.4 * Math.sin(a * 3 + e.wobblePhase));
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = `${e.color}44`;
    ctx.fill();
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    // Inner clumps
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + t;
      const cr = r * 0.35;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * cr, Math.sin(a) * cr, r * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = `${e.color}66`;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  function drawArmouredSphere(e, pulse, t) {
    const r = e.radius * pulse;
    // Armour plating
    ctx.strokeStyle = '#888888';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(100,100,100,0.3)';
    ctx.fill();
    ctx.stroke();
    // Plate lines
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.strokeStyle = 'rgba(160,160,160,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // Flagella
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.quadraticCurveTo(
        Math.cos(a + 0.5) * (r + 20),
        Math.sin(a + 0.5) * (r + 20) + Math.sin(t * 3 + i) * 8,
        Math.cos(a) * (r + 30),
        Math.sin(a) * (r + 30)
      );
      ctx.strokeStyle = 'rgba(160,160,160,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.shadowColor = '#888888';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#aaaaaa';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function drawNeoplasm(e, pulse, t) {
    const r = e.radius * pulse;
    ctx.shadowColor = '#cc2244';
    ctx.shadowBlur = 20;
    // Irregular cancerous blob
    ctx.beginPath();
    const pts = 12;
    for (let i = 0; i <= pts; i++) {
      const a = (i / pts) * Math.PI * 2;
      const rr = r * (0.7 + 0.3 * Math.sin(a * 4 + e.wobblePhase * 0.5 + t * 0.3));
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(204,34,68,0.25)';
    ctx.fill();
    ctx.strokeStyle = '#cc2244';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Nucleus
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(204,34,68,0.5)';
    ctx.fill();
    ctx.strokeStyle = '#ff4466';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Mitotic figures
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + t;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,68,102,0.4)';
      ctx.fill();
    }

    // Boss name label
    ctx.fillStyle = '#ff4466';
    ctx.font = 'bold 9px "Exo 2", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NEOPLASM', 0, -r - 6);
    ctx.shadowBlur = 0;
  }

  function drawDefaultEnemy(e, pulse) {
    const r = e.radius * pulse;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = `${e.color}33`;
    ctx.fill();
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // === PROJECTILES ===
  function drawProjectile(p, t) {
    if (!p.alive) return;
    ctx.save();

    // Trail
    p.trail.forEach((pt, i) => {
      const alpha = (i / p.trail.length) * 0.4;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, p.radius * (i / p.trail.length), 0, Math.PI * 2);
      ctx.fillStyle = p.color === '#ffffff' ? `rgba(200,220,255,${alpha})` : `rgba(74,240,176,${alpha})`;
      ctx.fill();
    });

    // Main projectile
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // === ENEMY PROJECTILES ===
  function drawEnemyProjectile(p) {
    if (!p.alive) return;
    ctx.save();
    p.trail.forEach((pt, i) => {
      const alpha = (i / p.trail.length) * 0.3;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, p.radius * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,68,102,${alpha})`;
      ctx.fill();
    });
    ctx.shadowColor = '#ff4466';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#ff4466';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // === XP ORBS ===
  function drawXPOrb(orb, t) {
    if (!orb.alive) return;
    ctx.save();
    ctx.shadowColor = '#a78bfa';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y + orb.wobble, orb.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#a78bfa';
    ctx.fill();
    ctx.restore();
  }

  // === HEALTH PICKUPS ===
  function drawHealthPickup(h, t) {
    if (!h.alive) return;
    ctx.save();
    ctx.shadowColor = '#ff6688';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(h.x, h.y + h.wobble, h.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#ff6688';
    ctx.fill();
    // Cross
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(h.x - 4, h.y + h.wobble);
    ctx.lineTo(h.x + 4, h.y + h.wobble);
    ctx.moveTo(h.x, h.y + h.wobble - 4);
    ctx.lineTo(h.x, h.y + h.wobble + 4);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // === CLOT TRAILS ===
  function drawClotTrail(clot, t) {
    ctx.save();
    const alpha = Math.min(1, clot.timer / 2) * 0.5;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(clot.x, clot.y, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#cc2244';
    ctx.fill();
    ctx.restore();
  }

  // === AOE EFFECT ===
  function drawAoeEffect(x, y, radius, progress) {
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    ctx.strokeStyle = '#4af0b0';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#4af0b0';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(x, y, radius * progress, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = (1 - progress) * 0.1;
    ctx.fillStyle = '#4af0b0';
    ctx.fill();
    ctx.restore();
  }

  // === DAMAGE NUMBER ===
  function drawDamageNumber(x, y, value, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color || '#ffffff';
    ctx.font = `bold ${Math.min(22, 12 + value / 5)}px "Exo 2", sans-serif`;
    ctx.textAlign = 'center';
    ctx.shadowColor = color || '#ffffff';
    ctx.shadowBlur = 6;
    ctx.fillText(Math.ceil(value), x, y);
    ctx.restore();
  }

  // === HELPER CELL ===
  function drawHelperCell(hc, t) {
    ctx.save();
    ctx.translate(hc.x, hc.y);
    const r = 12;
    const wobble = r + 3 * Math.sin(hc.wobble || 0);
    ctx.beginPath();
    ctx.arc(0, 0, wobble, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(74,240,176,0.2)';
    ctx.fill();
    ctx.strokeStyle = '#4af0b0';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.7;
    ctx.stroke();
    ctx.restore();
  }

  return {
    init, drawBackground, drawPlayer, drawAura, drawEnemy,
    drawProjectile, drawEnemyProjectile, drawXPOrb, drawHealthPickup,
    drawClotTrail, drawAoeEffect, drawDamageNumber, drawHelperCell
  };
})();
