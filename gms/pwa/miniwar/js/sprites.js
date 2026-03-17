/* ===== KENNEY SPRITE SYSTEM =====
 * Loads 3 spritesheets (cartography, tanks, sci-fi RTS)
 * Parses XML atlas metadata for source rectangles
 * Provides draw helpers for bases, decorations, effects
 */
const Sprites = (() => {
  const ROOT = '/gms/assets/kenney/2d';
  let loaded = false;

  // Spritesheet images
  const sheets = {};
  // Atlas lookup: spriteName → { sheet, x, y, w, h }
  const atlas = {};

  // ===== SPRITESHEET DEFINITIONS =====
  const SHEETS = {
    carto: { img: `${ROOT}/cartography/spritesheet.png`, xml: `${ROOT}/cartography/spritesheet.xml` },
    tanks: { img: `${ROOT}/tanks/spritesheet.png`, xml: `${ROOT}/tanks/spritesheet.xml` },
    scifi: { img: `${ROOT}/scifi-rts/scifiRTS_spritesheet.png`, xml: `${ROOT}/scifi-rts/scifiRTS_spritesheet.xml` },
  };

  // ===== SPRITE ALIASES (game concept → atlas sprite name) =====
  // Bases per age
  const BASE_SPRITES = [
    { sheet: 'carto', sprite: 'houseViking.png' },   // Age 0: Scavenger
    { sheet: 'carto', sprite: 'castle.png' },          // Age 1: Militia
    { sheet: 'carto', sprite: 'mill.png' },             // Age 2: Industrial
    { sheet: 'scifi', sprite: 'scifiStructure_01.png' },// Age 3: Tech
    { sheet: 'scifi', sprite: 'scifiStructure_07.png' },// Age 4: Neo
  ];

  // Explosion frames (tanks pack)
  const EXPLOSION_SPRITES = [
    'tank_explosion1.png', 'tank_explosion3.png', 'tank_explosion5.png',
    'tank_explosion7.png', 'tank_explosion9.png',
  ];

  // Bullet sprites (tanks pack)
  const BULLET_SPRITES = {
    bullet: 'tank_bulletFly1.png',
    cannonball: 'tank_bullet3.png',
    plasma: 'tank_bulletFly3.png',
  };

  // Background decorations per theme
  // Each: { sprite (in carto sheet), xRange, yFrac (of groundY), scaleRange, opacity, count }
  const THEME_DECOS = {
    wasteland: [
      { sprite: 'rocks.png', xRange: [0.05, 0.95], yFrac: 0.92, scale: [0.5, 0.8], alpha: 0.45, n: 5 },
      { sprite: 'rocksA.png', xRange: [0.1, 0.9], yFrac: 0.82, scale: [0.3, 0.5], alpha: 0.3, n: 4 },
      { sprite: 'rocksTall.png', xRange: [0.15, 0.85], yFrac: 0.7, scale: [0.3, 0.5], alpha: 0.2, n: 3 },
      { sprite: 'rocksMountain.png', xRange: [0.2, 0.8], yFrac: 0.52, scale: [0.35, 0.6], alpha: 0.13, n: 2 },
      { sprite: 'skull.png', xRange: [0.1, 0.9], yFrac: 0.95, scale: [0.2, 0.3], alpha: 0.25, n: 3 },
    ],
    settlement: [
      { sprite: 'treeTall.png', xRange: [0.05, 0.95], yFrac: 0.73, scale: [0.4, 0.7], alpha: 0.3, n: 6 },
      { sprite: 'bush.png', xRange: [0.05, 0.95], yFrac: 0.92, scale: [0.3, 0.5], alpha: 0.25, n: 5 },
      { sprite: 'fence.png', xRange: [0.15, 0.85], yFrac: 0.94, scale: [0.3, 0.45], alpha: 0.2, n: 3 },
      { sprite: 'campfire.png', xRange: [0.3, 0.7], yFrac: 0.93, scale: [0.25, 0.35], alpha: 0.3, n: 2 },
    ],
    industrial: [
      { sprite: 'rocksB.png', xRange: [0.05, 0.95], yFrac: 0.85, scale: [0.3, 0.5], alpha: 0.25, n: 4 },
      { sprite: 'gate.png', xRange: [0.15, 0.85], yFrac: 0.78, scale: [0.25, 0.4], alpha: 0.18, n: 2 },
      { sprite: 'lighthouse.png', xRange: [0.2, 0.8], yFrac: 0.6, scale: [0.2, 0.35], alpha: 0.12, n: 2 },
      { sprite: 'mine.png', xRange: [0.25, 0.75], yFrac: 0.72, scale: [0.2, 0.35], alpha: 0.15, n: 2 },
    ],
    tech: [
      { sprite: 'rocksMountain.png', xRange: [0.1, 0.9], yFrac: 0.55, scale: [0.2, 0.35], alpha: 0.08, n: 2 },
      { sprite: 'gate.png', xRange: [0.1, 0.9], yFrac: 0.85, scale: [0.18, 0.3], alpha: 0.1, n: 2 },
    ],
    neo: [
      { sprite: 'rocksMountain.png', xRange: [0.15, 0.85], yFrac: 0.5, scale: [0.15, 0.3], alpha: 0.06, n: 2 },
    ],
  };

  // ===== SEEDED RANDOM (matches graphics.js) =====
  function seededRng(seed) {
    let s = seed;
    return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }

  // ===== LOADING =====
  async function init() {
    try {
      const entries = Object.entries(SHEETS);
      await Promise.all(entries.map(async ([id, def]) => {
        // Load image
        const img = new Image();
        const imgPromise = new Promise((res, rej) => {
          img.onload = res;
          img.onerror = rej;
          img.src = def.img;
        });

        // Load + parse XML atlas
        const xmlRes = await fetch(def.xml);
        const xmlText = await xmlRes.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

        await imgPromise;
        sheets[id] = img;

        // Parse SubTexture entries
        const subs = xmlDoc.querySelectorAll('SubTexture');
        subs.forEach(sub => {
          const name = sub.getAttribute('name');
          atlas[`${id}:${name}`] = {
            sheet: id,
            x: parseInt(sub.getAttribute('x')),
            y: parseInt(sub.getAttribute('y')),
            w: parseInt(sub.getAttribute('width')),
            h: parseInt(sub.getAttribute('height')),
          };
        });
      }));

      loaded = Object.keys(sheets).length >= 2;
      console.log(`Sprites: ${Object.keys(sheets).length} sheets, ${Object.keys(atlas).length} sprites`);
    } catch (e) {
      console.warn('Sprites: failed to load, using procedural fallback', e);
      loaded = false;
    }
    return loaded;
  }

  function isLoaded() { return loaded; }

  // ===== ATLAS LOOKUP =====
  function getRegion(sheetId, spriteName) {
    return atlas[`${sheetId}:${spriteName}`] || null;
  }

  // ===== DRAW HELPERS =====

  /** Draw a sprite from an atlas, centered at bottom-center */
  function drawAnchored(ctx, sheetId, spriteName, cx, bottomY, drawW, drawH, flipX) {
    const r = getRegion(sheetId, spriteName);
    if (!r) return false;
    const img = sheets[r.sheet];
    if (!img) return false;

    // Auto-height from aspect ratio if drawH is 0
    if (!drawH) drawH = drawW * (r.h / r.w);

    ctx.save();
    if (flipX) {
      ctx.translate(cx, bottomY);
      ctx.scale(-1, 1);
      ctx.drawImage(img, r.x, r.y, r.w, r.h, -drawW / 2, -drawH, drawW, drawH);
    } else {
      ctx.drawImage(img, r.x, r.y, r.w, r.h, cx - drawW / 2, bottomY - drawH, drawW, drawH);
    }
    ctx.restore();
    return true;
  }

  /** Draw a sprite centered at (cx, cy) - for effects */
  function drawCentered(ctx, sheetId, spriteName, cx, cy, size, alpha) {
    const r = getRegion(sheetId, spriteName);
    if (!r) return false;
    const img = sheets[r.sheet];
    if (!img) return false;

    const w = size;
    const h = size * (r.h / r.w);
    const prevAlpha = ctx.globalAlpha;
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    ctx.drawImage(img, r.x, r.y, r.w, r.h, cx - w / 2, cy - h / 2, w, h);
    ctx.globalAlpha = prevAlpha;
    return true;
  }

  /**
   * Draw a base building for the given age.
   * Cartography sprites (ages 0-2) get a team-colored glow behind them.
   * Sci-fi sprites (ages 3-4) are drawn as-is with team banner.
   */
  function drawBase(ctx, ageIndex, cx, groundY, bw, bh, isPlayer, healthPct) {
    const baseDef = BASE_SPRITES[ageIndex];
    if (!baseDef) return false;

    const r = getRegion(baseDef.sheet, baseDef.sprite);
    if (!r) return false;
    const img = sheets[r.sheet];
    if (!img) return false;

    const w = bw * 1.4;
    const h = bh * 1.2;

    // Team glow behind building
    const tc = isPlayer ? 'rgba(78,205,196,' : 'rgba(231,76,60,';
    const glowR = w * 0.7;
    const grad = ctx.createRadialGradient(cx, groundY - h * 0.4, 0, cx, groundY - h * 0.4, glowR);
    grad.addColorStop(0, tc + '0.25)');
    grad.addColorStop(0.6, tc + '0.08)');
    grad.addColorStop(1, tc + '0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, groundY - h * 0.4, glowR, 0, Math.PI * 2);
    ctx.fill();

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(cx, groundY + 2, w * 0.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // For cartography (line art): subtle team fill background
    if (ageIndex <= 2) {
      ctx.fillStyle = isPlayer ? 'rgba(78,205,196,0.12)' : 'rgba(231,76,60,0.12)';
      ctx.fillRect(cx - w * 0.38, groundY - h * 0.88, w * 0.76, h * 0.84);
    }

    // Draw the sprite
    ctx.save();
    ctx.globalAlpha = ageIndex <= 2 ? 0.85 : 1;
    ctx.drawImage(img, r.x, r.y, r.w, r.h, cx - w / 2, groundY - h, w, h);
    ctx.restore();

    // Team flag on top
    const flagCol = isPlayer ? '#4ecdc4' : '#e74c3c';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, groundY - h - 2);
    ctx.lineTo(cx, groundY - h - 16);
    ctx.stroke();
    ctx.fillStyle = flagCol;
    ctx.beginPath();
    ctx.moveTo(cx, groundY - h - 16);
    ctx.lineTo(cx + 10, groundY - h - 13);
    ctx.lineTo(cx, groundY - h - 10);
    ctx.closePath();
    ctx.fill();

    // Damage overlay
    if (healthPct < 0.5) {
      ctx.fillStyle = `rgba(200,50,50,${(1 - healthPct) * 0.3})`;
      ctx.fillRect(cx - w / 2, groundY - h, w, h);
    }

    return true;
  }

  /**
   * Draw background decorations for a theme.
   * Scatters cartography sprites deterministically behind the ground plane.
   */
  function drawDecorations(ctx, theme, W, H, groundY) {
    const decos = THEME_DECOS[theme];
    if (!decos) return;

    const seed = theme.charCodeAt(0) * 100 + theme.charCodeAt(1) * 10;
    const rng = seededRng(seed);

    for (const d of decos) {
      const r = getRegion('carto', d.sprite);
      if (!r) continue;
      const img = sheets.carto;
      if (!img) continue;

      for (let i = 0; i < d.n; i++) {
        const x = W * (d.xRange[0] + rng() * (d.xRange[1] - d.xRange[0]));
        const y = groundY * d.yFrac + (rng() - 0.5) * 15;
        const s = d.scale[0] + rng() * (d.scale[1] - d.scale[0]);
        const dw = r.w * s;
        const dh = r.h * s;

        ctx.globalAlpha = d.alpha;
        ctx.drawImage(img, r.x, r.y, r.w, r.h, x - dw / 2, y - dh, dw, dh);
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Draw an explosion effect from the tanks spritesheet.
   * @param {number} progress - 0 to 1
   * @returns {boolean}
   */
  function drawExplosion(ctx, cx, cy, size, progress, alpha) {
    const idx = Math.min(EXPLOSION_SPRITES.length - 1, Math.floor(progress * EXPLOSION_SPRITES.length));
    return drawCentered(ctx, 'tanks', EXPLOSION_SPRITES[idx], cx, cy, size, alpha);
  }

  /**
   * Draw a projectile sprite.
   * @param {string} type - 'bullet', 'cannonball', or 'plasma'
   */
  function drawBullet(ctx, type, x, y, size, isPlayer, flipX) {
    const spriteName = BULLET_SPRITES[type];
    if (!spriteName) return false;
    return drawAnchored(ctx, 'tanks', spriteName, x, y + size / 2, size, 0, flipX);
  }

  return {
    init,
    isLoaded,
    getRegion,
    drawAnchored,
    drawCentered,
    drawBase,
    drawDecorations,
    drawExplosion,
    drawBullet,
    sheets, // expose for direct drawImage if needed
  };
})();
