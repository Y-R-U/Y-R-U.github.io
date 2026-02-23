// ===== Particle System =====
import { MAX_PARTICLES } from '../config.js';

// Pool of particle objects
const pool = [];
let activeCount = 0;

for (let i = 0; i < MAX_PARTICLES; i++) {
  pool.push({ dead: true });
}

function acquire() {
  for (let i = 0; i < pool.length; i++) {
    if (pool[i].dead) return pool[i];
  }
  return null; // pool exhausted
}

function emit(wx, wy, opts) {
  const p = acquire();
  if (!p) return;
  p.dead   = false;
  p.wx     = wx;
  p.wy     = wy;
  p.ox     = opts.ox || 8;
  p.oy     = opts.oy || 8;
  p.vx     = opts.vx || 0;
  p.vy     = opts.vy || 0;
  p.alpha  = 1;
  p.fade   = opts.fade || 0.03;
  p.color  = opts.color || '#fff';
  p.size   = opts.size  || 3;
  p.shape  = opts.shape || 'circle';
  p.glyph  = opts.glyph || '*';
  p.domOnly = false;
  activeCount++;
}

// ===== Particle Presets =====

export function spawnHit(wx, wy) {
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 * i) / 8;
    const speed = 0.3 + Math.random() * 0.5;
    emit(wx, wy, {
      ox: 8, oy: 8,
      vx: Math.cos(angle) * speed * 16,
      vy: Math.sin(angle) * speed * 16,
      color: '#e94560', size: 2 + Math.random() * 2,
      fade: 0.05, shape: 'circle',
    });
  }
}

export function spawnMagicHit(wx, wy) {
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI * 2 * i) / 10 + Math.random() * 0.5;
    const speed = 0.4 + Math.random() * 0.6;
    emit(wx, wy, {
      ox: 8, oy: 8,
      vx: Math.cos(angle) * speed * 14,
      vy: Math.sin(angle) * speed * 14,
      color: i % 2 === 0 ? '#4fc3f7' : '#4ecca3',
      size: 3, fade: 0.03, shape: 'circle',
    });
  }
}

export function spawnLevelUp(wx, wy) {
  for (let i = 0; i < 16; i++) {
    const angle = (Math.PI * 2 * i) / 16;
    const speed = 0.5 + Math.random() * 1;
    emit(wx, wy, {
      ox: 8, oy: 8,
      vx: Math.cos(angle) * speed * 12,
      vy: Math.sin(angle) * speed * 12 - 8,
      color: '#f5a623', size: 4, fade: 0.015, shape: 'glyph', glyph: '*',
    });
  }
  showFloatText(wx, wy, 'LEVEL UP!', '#f5a623', 16);
}

export function spawnDeath(wx, wy, glyph, color) {
  for (let i = 0; i < 12; i++) {
    const angle = (Math.PI * 2 * i) / 12;
    const speed = 0.3 + Math.random() * 0.8;
    emit(wx, wy, {
      ox: 8 + Math.random() * 8 - 4,
      oy: 8 + Math.random() * 8 - 4,
      vx: Math.cos(angle) * speed * 10,
      vy: Math.sin(angle) * speed * 10,
      color, size: 3, fade: 0.02, shape: 'glyph', glyph,
    });
  }
}

export function spawnBossAppear(wx, wy) {
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 8 + Math.random() * 24;
    emit(wx, wy, {
      ox: Math.cos(angle) * dist + 8,
      oy: Math.sin(angle) * dist + 8,
      vx: Math.cos(angle) * 8,
      vy: Math.sin(angle) * 8,
      color: '#9C27B0', size: 3, fade: 0.02, shape: 'circle',
    });
  }
}

export function spawnItemDrop(wx, wy) {
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI * 2 * i) / 6;
    emit(wx, wy, {
      ox: 8, oy: 8,
      vx: Math.cos(angle) * 6,
      vy: Math.sin(angle) * 6 - 4,
      color: '#fff', size: 2, fade: 0.04, shape: 'circle',
    });
  }
}

// ===== DOM Float Texts =====
export function showFloatText(wx, wy, text, color, fontSize) {
  const layer = document.getElementById('float-layer');
  if (!layer) return;

  // Convert world → screen
  import('./renderer.js').then(({ worldToScreen }) => {
    const { sx, sy } = worldToScreen(wx, wy);
    const el = document.createElement('div');
    el.className = 'float-text';
    el.style.left = sx + 'px';
    el.style.top  = sy + 'px';
    el.style.color = color || '#fff';
    if (fontSize) el.style.fontSize = fontSize + 'px';
    el.textContent = text;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  });
}

export function showDamage(wx, wy, dmg) {
  showFloatText(wx, wy, `-${dmg}`, '#e94560');
}

export function showHeal(wx, wy, hp) {
  showFloatText(wx, wy, `+${hp}`, '#5f5');
}

export function showXP(wx, wy, xp, skillName) {
  showFloatText(wx, wy, `+${xp} ${skillName} XP`, '#f5a623', 11);
}

export function showGold(wx, wy, gold) {
  showFloatText(wx, wy, `+${gold}g`, '#f5a623');
}

// ===== Update =====
export function update(dt) {
  for (const p of pool) {
    if (p.dead) continue;
    p.ox += p.vx * dt;
    p.oy += p.vy * dt;
    p.vx *= 0.92;
    p.vy *= 0.92;
    p.alpha -= p.fade;
    if (p.alpha <= 0) {
      p.dead = true;
      activeCount--;
    }
  }
}

export function getParticles() { return pool; }
