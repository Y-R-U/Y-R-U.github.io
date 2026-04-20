// ============================================================
//  PARTICLE SYSTEM
// ============================================================

export const particles = [];

export function createParticle(x, y, type) {
  return {
    x, y,
    vx: (Math.random() - 0.5) * 4,
    vy: (Math.random() - 0.5) * 4 - 2,
    life: 1,
    maxLife: 0.5 + Math.random() * 0.5,
    size: 2 + Math.random() * 3,
    type,
    color: type === 'tongue' ? '#e84057' : (type === 'coin' ? '#ffd700' : '#88ff88'),
  };
}

export function spawnCoinParticles(x, y, value) {
  for (let i = 0; i < value * 3; i++) {
    particles.push(createParticle(x, y, 'coin'));
  }
}

export function spawnCelebration(x, y) {
  const colors = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff922b'];
  for (let i = 0; i < 30; i++) {
    const p = createParticle(x, y, 'celebrate');
    p.vx = (Math.random() - 0.5) * 10;
    p.vy = -3 - Math.random() * 8;
    p.color = colors[Math.floor(Math.random() * colors.length)];
    p.maxLife = 1 + Math.random();
    p.size = 3 + Math.random() * 4;
    particles.push(p);
  }
}

export function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.1;
    p.life -= dt / p.maxLife;
    if (p.life <= 0) particles.splice(i, 1);
  }
}
