// ============================================================
// Tower Defense - Image Hotspot Based
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- Game Config ---
const MAP_SIZE = 1024;
canvas.width = MAP_SIZE;
canvas.height = MAP_SIZE;

// --- Game State ---
const state = {
    gold: 200,
    lives: 20,
    wave: 0,
    waveActive: false,
    enemiesSpawned: 0,
    enemiesToSpawn: 0,
    spawnTimer: 0,
    spawnInterval: 60,
    gameOver: false
};

// --- Path Waypoints (enemy route on the map) ---
// Traced from the S-curve on map1.png
const PATH = [
    { x: -30, y: 820 },
    { x: 50, y: 790 },
    { x: 105, y: 735 },
    { x: 130, y: 660 },
    { x: 135, y: 580 },
    { x: 130, y: 500 },
    { x: 130, y: 420 },
    { x: 145, y: 345 },
    { x: 180, y: 275 },
    { x: 235, y: 215 },
    { x: 310, y: 175 },
    { x: 395, y: 165 },
    { x: 470, y: 190 },
    { x: 525, y: 245 },
    { x: 555, y: 320 },
    { x: 565, y: 410 },
    { x: 555, y: 500 },
    { x: 525, y: 585 },
    { x: 495, y: 665 },
    { x: 480, y: 745 },
    { x: 490, y: 820 },
    { x: 530, y: 880 },
    { x: 590, y: 920 },
    { x: 665, y: 925 },
    { x: 735, y: 895 },
    { x: 790, y: 835 },
    { x: 830, y: 755 },
    { x: 850, y: 665 },
    { x: 860, y: 575 },
    { x: 865, y: 485 },
    { x: 875, y: 395 },
    { x: 895, y: 315 },
    { x: 930, y: 245 },
    { x: 975, y: 195 },
    { x: 1030, y: 165 },
    { x: 1060, y: 155 }
];

// --- Tower Platform Positions (from the stone circles on map) ---
const TOWER_SLOTS = [
    { x: 225, y: 530, radius: 42 },
    { x: 265, y: 770, radius: 38 },
    { x: 460, y: 195, radius: 44 },
    { x: 640, y: 125, radius: 44 },
    { x: 515, y: 480, radius: 40 },
    { x: 610, y: 590, radius: 38 }
];

// --- Tower Data ---
const TOWER_COSTS = [50, 75, 125]; // build, upgrade 1, upgrade 2
const TOWER_STATS = [
    { range: 140, damage: 8, fireRate: 50, color: '#5588cc' },    // level 1
    { range: 170, damage: 15, fireRate: 40, color: '#44aaff' },   // level 2
    { range: 200, damage: 25, fireRate: 28, color: '#22ddff' }    // level 3
];

// --- Arrays ---
let towers = [];
let enemies = [];
let projectiles = [];
let particles = [];
let floatingTexts = [];

// --- Map Image ---
const mapImg = new Image();
mapImg.src = 'map1.png';
let mapLoaded = false;
mapImg.onload = () => { mapLoaded = true; };

// --- UI Elements ---
const goldEl = document.getElementById('gold');
const waveEl = document.getElementById('wave');
const livesEl = document.getElementById('lives');
const startBtn = document.getElementById('start-wave-btn');
const tooltip = document.getElementById('tower-tooltip');
const tooltipTitle = document.getElementById('tooltip-title');
const tooltipInfo = document.getElementById('tooltip-info');
const tooltipBtn = document.getElementById('tooltip-btn');

let selectedSlot = null;

// ============================================================
// ENEMY CLASS
// ============================================================
class Enemy {
    constructor(hp, speed, reward) {
        this.pathIndex = 0;
        this.pathProgress = 0;
        this.x = PATH[0].x;
        this.y = PATH[0].y;
        this.maxHp = hp;
        this.hp = hp;
        this.speed = speed;
        this.reward = reward;
        this.alive = true;
        this.reached = false;
        this.size = 16;
        // Visual variation
        this.hue = 0 + Math.random() * 30; // red-ish
        this.bodyOffsets = [];
        for (let i = 0; i < 6; i++) {
            this.bodyOffsets.push({
                x: (Math.random() - 0.5) * 6,
                y: (Math.random() - 0.5) * 6,
                s: 4 + Math.random() * 5
            });
        }
        this.animTimer = Math.random() * Math.PI * 2;
    }

    update() {
        if (!this.alive) return;
        this.animTimer += 0.05;

        // Move along path
        if (this.pathIndex >= PATH.length - 1) {
            this.alive = false;
            this.reached = true;
            state.lives--;
            spawnParticles(this.x, this.y, '#ff0000', 10);
            addFloatingText(this.x, this.y, '-1 Life', '#ff4444');
            return;
        }

        const target = PATH[this.pathIndex + 1];
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < this.speed) {
            this.pathIndex++;
            this.x = target.x;
            this.y = target.y;
        } else {
            this.x += (dx / dist) * this.speed;
            this.y += (dy / dist) * this.speed;
        }

        // Trail particles
        if (Math.random() < 0.3) {
            particles.push(new Particle(
                this.x + (Math.random() - 0.5) * 10,
                this.y + (Math.random() - 0.5) * 10,
                0, 0, `hsla(${this.hue}, 80%, 50%, 0.6)`, 15, 3
            ));
        }
    }

    draw() {
        if (!this.alive) return;
        const bob = Math.sin(this.animTimer) * 2;

        // Body - cluster of shapes for a creepy bug look
        ctx.save();
        ctx.translate(this.x, this.y + bob);

        // Main body
        ctx.fillStyle = `hsl(${this.hue}, 70%, 35%)`;
        ctx.beginPath();
        ctx.ellipse(0, 0, this.size, this.size * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();

        // Body segments
        for (const off of this.bodyOffsets) {
            ctx.fillStyle = `hsl(${this.hue + 10}, 60%, 30%)`;
            ctx.beginPath();
            ctx.arc(off.x, off.y, off.s, 0, Math.PI * 2);
            ctx.fill();
        }

        // Eyes
        ctx.fillStyle = '#ffff00';
        ctx.beginPath();
        ctx.arc(-5, -4, 3, 0, Math.PI * 2);
        ctx.arc(5, -4, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(-5, -4, 1.5, 0, Math.PI * 2);
        ctx.arc(5, -4, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Legs (animated)
        ctx.strokeStyle = `hsl(${this.hue}, 50%, 25%)`;
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
            const legAnim = Math.sin(this.animTimer * 3 + i * 1.5) * 8;
            // Left legs
            ctx.beginPath();
            ctx.moveTo(-this.size + 4, -4 + i * 7);
            ctx.lineTo(-this.size - 10, -8 + i * 7 + legAnim);
            ctx.stroke();
            // Right legs
            ctx.beginPath();
            ctx.moveTo(this.size - 4, -4 + i * 7);
            ctx.lineTo(this.size + 10, -8 + i * 7 - legAnim);
            ctx.stroke();
        }

        ctx.restore();

        // Health bar
        const barWidth = 30;
        const barHeight = 4;
        const barX = this.x - barWidth / 2;
        const barY = this.y - this.size - 10;
        const hpRatio = this.hp / this.maxHp;

        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
        ctx.fillStyle = hpRatio > 0.5 ? '#4CAF50' : hpRatio > 0.25 ? '#ff9800' : '#f44336';
        ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);
    }
}

// ============================================================
// TOWER CLASS
// ============================================================
class Tower {
    constructor(slot) {
        this.x = slot.x;
        this.y = slot.y;
        this.slotRadius = slot.radius;
        this.level = 0; // 0 = level 1, 1 = level 2, 2 = level 3
        this.fireTimer = 0;
        this.angle = 0;
        this.target = null;
    }

    get stats() { return TOWER_STATS[this.level]; }

    update() {
        this.fireTimer--;

        // Find target
        this.target = null;
        let closestDist = Infinity;
        for (const e of enemies) {
            if (!e.alive) continue;
            const dx = e.x - this.x;
            const dy = e.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= this.stats.range && dist < closestDist) {
                closestDist = dist;
                this.target = e;
            }
        }

        if (this.target) {
            this.angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);

            if (this.fireTimer <= 0) {
                this.fire();
                this.fireTimer = this.stats.fireRate;
            }
        }
    }

    fire() {
        const speed = 6;
        const dx = Math.cos(this.angle) * speed;
        const dy = Math.sin(this.angle) * speed;
        projectiles.push(new Projectile(
            this.x, this.y, dx, dy, this.stats.damage, this.stats.color, this.stats.range
        ));
        // Muzzle flash particles
        for (let i = 0; i < 5; i++) {
            const spread = 0.5;
            particles.push(new Particle(
                this.x + Math.cos(this.angle) * 20,
                this.y + Math.sin(this.angle) * 20,
                dx * 0.3 + (Math.random() - 0.5) * spread,
                dy * 0.3 + (Math.random() - 0.5) * spread,
                this.stats.color,
                10 + Math.random() * 10,
                2 + Math.random() * 3
            ));
        }
    }

    draw() {
        // Range circle (subtle, only when selected)
        if (selectedSlot && selectedSlot.x === this.x && selectedSlot.y === this.y) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.stats.range, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.03)';
            ctx.fill();
        }

        // Tower base (on top of stone platform)
        ctx.save();
        ctx.translate(this.x, this.y);

        // Base circle
        const gradient = ctx.createRadialGradient(0, 0, 5, 0, 0, 28);
        gradient.addColorStop(0, '#667788');
        gradient.addColorStop(1, '#445566');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, 28, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#334455';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Turret
        ctx.rotate(this.angle);
        ctx.fillStyle = this.stats.color;
        ctx.fillRect(-6, -6, 30, 12);
        // Barrel tip
        ctx.fillStyle = '#fff';
        ctx.fillRect(24, -3, 6, 6);
        ctx.restore();

        // Stars (upgrade level)
        for (let i = 0; i <= this.level; i++) {
            const sx = this.x - 12 + i * 12;
            const sy = this.y + 22;
            drawStar(sx, sy, 5, '#ffd700', '#ff8c00');
        }

        // Health/level bar under tower
        const barW = 32;
        const barH = 3;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(this.x - barW / 2, this.y + 30, barW, barH);
        ctx.fillStyle = this.stats.color;
        ctx.fillRect(this.x - barW / 2, this.y + 30, barW * ((this.level + 1) / 3), barH);
    }
}

// ============================================================
// PROJECTILE CLASS
// ============================================================
class Projectile {
    constructor(x, y, dx, dy, damage, color, maxRange) {
        this.x = x;
        this.y = y;
        this.startX = x;
        this.startY = y;
        this.dx = dx;
        this.dy = dy;
        this.damage = damage;
        this.color = color;
        this.alive = true;
        this.maxRange = maxRange;
        this.size = 4;
    }

    update() {
        this.x += this.dx;
        this.y += this.dy;

        // Trail
        if (Math.random() < 0.5) {
            particles.push(new Particle(
                this.x, this.y,
                (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 0.5,
                this.color,
                8 + Math.random() * 6,
                2
            ));
        }

        // Check range
        const traveled = Math.sqrt(
            (this.x - this.startX) ** 2 + (this.y - this.startY) ** 2
        );
        if (traveled > this.maxRange + 50) {
            this.alive = false;
            return;
        }

        // Hit detection
        for (const e of enemies) {
            if (!e.alive) continue;
            const dx = e.x - this.x;
            const dy = e.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < e.size + this.size) {
                e.hp -= this.damage;
                this.alive = false;

                // Hit particles
                spawnParticles(this.x, this.y, this.color, 6);

                if (e.hp <= 0) {
                    e.alive = false;
                    state.gold += e.reward;
                    addFloatingText(e.x, e.y, `+${e.reward}g`, '#ffd700');
                    spawnParticles(e.x, e.y, '#ff4400', 20);
                    spawnParticles(e.x, e.y, '#ffaa00', 15);
                }
                break;
            }
        }
    }

    draw() {
        if (!this.alive) return;
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

// ============================================================
// PARTICLE CLASS
// ============================================================
class Particle {
    constructor(x, y, dx, dy, color, life, size) {
        this.x = x;
        this.y = y;
        this.dx = dx;
        this.dy = dy;
        this.color = color;
        this.life = life;
        this.maxLife = life;
        this.size = size;
        this.alive = true;
    }

    update() {
        this.x += this.dx;
        this.y += this.dy;
        this.dx *= 0.96;
        this.dy *= 0.96;
        this.life--;
        if (this.life <= 0) this.alive = false;
    }

    draw() {
        if (!this.alive) return;
        const alpha = this.life / this.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * alpha, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

// ============================================================
// FLOATING TEXT
// ============================================================
class FloatingText {
    constructor(x, y, text, color) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.life = 60;
        this.alive = true;
    }

    update() {
        this.y -= 1;
        this.life--;
        if (this.life <= 0) this.alive = false;
    }

    draw() {
        if (!this.alive) return;
        const alpha = this.life / 60;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.text, this.x, this.y);
        ctx.globalAlpha = 1;
    }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================
function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 3;
        particles.push(new Particle(
            x, y,
            Math.cos(angle) * speed,
            Math.sin(angle) * speed,
            color,
            15 + Math.random() * 20,
            2 + Math.random() * 4
        ));
    }
}

function addFloatingText(x, y, text, color) {
    floatingTexts.push(new FloatingText(x, y, text, color));
}

function drawStar(cx, cy, size, fillColor, strokeColor) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
        const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
        const method = i === 0 ? 'moveTo' : 'lineTo';
        ctx[method](Math.cos(angle) * size, Math.sin(angle) * size);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

function drawEmptySlot(slot) {
    // Subtle glow/pulse on empty slots to indicate they're clickable
    const pulse = 0.5 + Math.sin(Date.now() / 500) * 0.15;
    ctx.beginPath();
    ctx.arc(slot.x, slot.y, slot.radius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 215, 0, ${pulse * 0.4})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Plus icon
    ctx.fillStyle = `rgba(255, 255, 255, ${pulse * 0.6})`;
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+', slot.x, slot.y);
}

// ============================================================
// WAVE SYSTEM
// ============================================================
function startWave() {
    if (state.waveActive || state.gameOver) return;
    state.wave++;
    state.waveActive = true;
    state.enemiesSpawned = 0;
    state.enemiesToSpawn = 5 + state.wave * 2;
    state.spawnTimer = 0;
    state.spawnInterval = Math.max(20, 60 - state.wave * 3);
    startBtn.classList.add('hidden');
    tooltip.classList.add('hidden');
    selectedSlot = null;
}

function spawnEnemy() {
    const waveScale = 1 + state.wave * 0.3;
    const hp = 30 * waveScale;
    const speed = 1.5 + Math.random() * 0.5 + state.wave * 0.05;
    const reward = 10 + state.wave * 2;
    enemies.push(new Enemy(hp, speed, reward));
    state.enemiesSpawned++;
}

// ============================================================
// INPUT HANDLING
// ============================================================
canvas.addEventListener('click', (e) => {
    if (state.gameOver) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    // Check tower slots
    for (let i = 0; i < TOWER_SLOTS.length; i++) {
        const slot = TOWER_SLOTS[i];
        const dx = mx - slot.x;
        const dy = my - slot.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= slot.radius + 10) {
            const existingTower = towers.find(t => t.x === slot.x && t.y === slot.y);

            if (existingTower) {
                // Show upgrade tooltip
                if (existingTower.level >= 2) {
                    selectedSlot = slot;
                    showTooltip(slot, 'Max Level', `Damage: ${existingTower.stats.damage}\nRange: ${existingTower.stats.range}`, null);
                } else {
                    const cost = TOWER_COSTS[existingTower.level + 1];
                    selectedSlot = slot;
                    showTooltip(
                        slot,
                        `Tower Lv.${existingTower.level + 1}`,
                        `Upgrade to Lv.${existingTower.level + 2}`,
                        `Upgrade (${cost}g)`,
                        () => {
                            if (state.gold >= cost) {
                                state.gold -= cost;
                                existingTower.level++;
                                spawnParticles(slot.x, slot.y, '#ffd700', 15);
                                addFloatingText(slot.x, slot.y - 30, 'Upgraded!', '#ffd700');
                                tooltip.classList.add('hidden');
                                selectedSlot = null;
                            } else {
                                addFloatingText(slot.x, slot.y - 30, 'Not enough gold!', '#ff4444');
                            }
                        }
                    );
                }
            } else {
                // Show build tooltip
                const cost = TOWER_COSTS[0];
                selectedSlot = slot;
                showTooltip(
                    slot,
                    'Empty Platform',
                    'Build a tower here',
                    `Build (${cost}g)`,
                    () => {
                        if (state.gold >= cost) {
                            state.gold -= cost;
                            towers.push(new Tower(slot));
                            spawnParticles(slot.x, slot.y, '#44ff44', 20);
                            addFloatingText(slot.x, slot.y - 30, 'Tower Built!', '#44ff44');
                            tooltip.classList.add('hidden');
                            selectedSlot = null;
                        } else {
                            addFloatingText(slot.x, slot.y - 30, 'Not enough gold!', '#ff4444');
                        }
                    }
                );
            }
            return;
        }
    }

    // Clicked elsewhere - hide tooltip
    tooltip.classList.add('hidden');
    selectedSlot = null;
});

function showTooltip(slot, title, info, btnText, btnAction) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;

    tooltip.classList.remove('hidden');
    tooltipTitle.textContent = title;
    tooltipInfo.textContent = info;

    if (btnText) {
        tooltipBtn.textContent = btnText;
        tooltipBtn.style.display = 'inline-block';
        tooltipBtn.onclick = btnAction;
    } else {
        tooltipBtn.style.display = 'none';
    }

    // Position tooltip above the slot
    let tx = slot.x * scaleX - 80;
    let ty = slot.y * scaleY - 110;
    if (ty < 50) ty = slot.y * scaleY + 60;
    if (tx < 10) tx = 10;
    if (tx > rect.width - 170) tx = rect.width - 170;

    tooltip.style.left = tx + 'px';
    tooltip.style.top = ty + 'px';
}

// Start wave button
startBtn.addEventListener('click', startWave);

// ============================================================
// GAME LOOP
// ============================================================
function update() {
    if (state.gameOver) return;

    // Spawn enemies
    if (state.waveActive && state.enemiesSpawned < state.enemiesToSpawn) {
        state.spawnTimer--;
        if (state.spawnTimer <= 0) {
            spawnEnemy();
            state.spawnTimer = state.spawnInterval;
        }
    }

    // Check wave end
    if (state.waveActive && state.enemiesSpawned >= state.enemiesToSpawn) {
        const aliveEnemies = enemies.filter(e => e.alive);
        if (aliveEnemies.length === 0) {
            state.waveActive = false;
            startBtn.classList.remove('hidden');
            // Wave complete bonus
            const bonus = 20 + state.wave * 10;
            state.gold += bonus;
            addFloatingText(512, 400, `Wave ${state.wave} Complete! +${bonus}g`, '#44ff44');
        }
    }

    // Update entities
    for (const e of enemies) e.update();
    for (const t of towers) t.update();
    for (const p of projectiles) p.update();
    for (const p of particles) p.update();
    for (const ft of floatingTexts) ft.update();

    // Cleanup dead
    enemies = enemies.filter(e => e.alive);
    projectiles = projectiles.filter(p => p.alive);
    particles = particles.filter(p => p.alive);
    floatingTexts = floatingTexts.filter(ft => ft.alive);

    // Update UI
    goldEl.textContent = state.gold;
    waveEl.textContent = state.wave;
    livesEl.textContent = state.lives;

    // Game over check
    if (state.lives <= 0) {
        state.gameOver = true;
        state.lives = 0;
        livesEl.textContent = 0;
    }
}

function draw() {
    ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);

    // Draw map
    if (mapLoaded) {
        ctx.drawImage(mapImg, 0, 0, MAP_SIZE, MAP_SIZE);
    }

    // Draw empty slots
    for (const slot of TOWER_SLOTS) {
        const hasTower = towers.some(t => t.x === slot.x && t.y === slot.y);
        if (!hasTower) {
            drawEmptySlot(slot);
        }
    }

    // Draw entities
    for (const e of enemies) e.draw();
    for (const t of towers) t.draw();
    for (const p of projectiles) p.draw();
    for (const p of particles) p.draw();
    for (const ft of floatingTexts) ft.draw();

    // Game over overlay
    if (state.gameOver) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 64px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('GAME OVER', MAP_SIZE / 2, MAP_SIZE / 2 - 30);
        ctx.fillStyle = '#fff';
        ctx.font = '28px Arial';
        ctx.fillText(`Survived ${state.wave} waves`, MAP_SIZE / 2, MAP_SIZE / 2 + 30);
    }
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// Start
gameLoop();
