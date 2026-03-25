import { TERRAIN } from '../game/tile.js';
import { UNIT_TYPES, CITY_PRODUCTION } from '../data/units.js';

const TS = 32; // tile size in pixels

/**
 * Canvas 2D renderer.  All drawing goes through here.
 * Call render(world, camera, uiState) once per frame.
 */
export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this._pulse = 0;
    this._frame = 0;
  }

  /** Called once to size the canvas to fill its container */
  resize() {
    const parent = this.canvas.parentElement;
    this.canvas.width  = parent.clientWidth;
    this.canvas.height = parent.clientHeight;
  }

  /**
   * Main render call.
   * @param {World}  world
   * @param {Camera} camera
   * @param {object} uiState - { selectedArmy, reachable, path, hoveredTile }
   */
  render(world, camera, uiState) {
    const ctx = this.ctx;
    this._frame++;
    this._pulse = (Math.sin(this._frame * 0.08) + 1) / 2; // 0..1 oscillating

    camera.resize(this.canvas.width, this.canvas.height);

    ctx.fillStyle = '#060610';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this._drawTerrain(world, camera);
    this._drawMoveRange(camera, uiState);
    this._drawCities(world, camera);
    this._drawArmies(world, camera, uiState);
    this._drawSelection(camera, uiState);
    this._drawMinimap(world, camera);
  }

  // ---- Terrain ----

  _drawTerrain(world, camera) {
    const ctx = this.ctx;
    const { minTX, maxTX, minTY, maxTY } = camera.visibleTiles();

    for (let ty = minTY; ty <= maxTY; ty++) {
      for (let tx = minTX; tx <= maxTX; tx++) {
        const tile = world.getTile(tx, ty);
        if (!tile) continue;
        const { px, py } = camera.tileToScreen(tx, ty);
        this._drawTile(ctx, tile, px, py, tx, ty);
      }
    }
  }

  _drawTile(ctx, tile, px, py, tx, ty) {
    const t = tile.terrain;
    const sz = TS;

    // Base color with slight checkerboard variation
    const vary = ((tx + ty) % 2 === 0) ? 8 : 0;
    ctx.fillStyle = this._adjustColor(t.color, vary);
    ctx.fillRect(px, py, sz, sz);

    // Terrain details
    if (t === TERRAIN.FOREST)    this._drawTrees(ctx, px, py, tx, ty);
    if (t === TERRAIN.HILLS)     this._drawHills(ctx, px, py, tx, ty);
    if (t === TERRAIN.MOUNTAINS) this._drawMountains(ctx, px, py, tx, ty);
    if (t === TERRAIN.OCEAN)     this._drawWaves(ctx, px, py, tx, ty);
    if (t === TERRAIN.DESERT)    this._drawDunes(ctx, px, py, tx, ty);
    if (t === TERRAIN.SWAMP)     this._drawSwamp(ctx, px, py, tx, ty);

    // Grid line
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(px, py, sz, sz);
  }

  _drawTrees(ctx, px, py, tx, ty) {
    const rng = this._seededRng(tx * 1000 + ty);
    ctx.fillStyle = '#1a4212';
    for (let i = 0; i < 3; i++) {
      const bx = px + rng() * (TS - 10) + 4;
      const by = py + rng() * (TS - 10) + 4;
      ctx.beginPath();
      ctx.moveTo(bx, by + 8);
      ctx.lineTo(bx - 5, by + 8);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx + 5, by + 8);
      ctx.closePath();
      ctx.fill();
    }
  }

  _drawHills(ctx, px, py, tx, ty) {
    ctx.fillStyle = '#8a7040';
    ctx.beginPath();
    ctx.ellipse(px + TS/2, py + TS*0.7, TS*0.45, TS*0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6a5020';
    ctx.beginPath();
    ctx.ellipse(px + TS*0.3, py + TS*0.75, TS*0.3, TS*0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawMountains(ctx, px, py, tx, ty) {
    ctx.fillStyle = '#888';
    ctx.beginPath();
    ctx.moveTo(px + TS*0.5, py + 2);
    ctx.lineTo(px + 2, py + TS - 2);
    ctx.lineTo(px + TS - 2, py + TS - 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ddd';
    ctx.beginPath();
    ctx.moveTo(px + TS*0.5, py + 2);
    ctx.lineTo(px + TS*0.35, py + TS*0.3);
    ctx.lineTo(px + TS*0.65, py + TS*0.3);
    ctx.closePath();
    ctx.fill();
  }

  _drawWaves(ctx, px, py, tx, ty) {
    const phase = ((tx + ty + this._frame * 0.02) % 1) * Math.PI * 2;
    ctx.strokeStyle = 'rgba(100,160,255,0.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const wy = py + 8 + i * 9;
      ctx.beginPath();
      ctx.moveTo(px, wy + Math.sin(phase + i) * 2);
      ctx.bezierCurveTo(px + 8, wy - 2, px + 16, wy + 2, px + TS, wy + Math.sin(phase + i + 1) * 2);
      ctx.stroke();
    }
  }

  _drawDunes(ctx, px, py, tx, ty) {
    ctx.fillStyle = 'rgba(180,150,60,0.4)';
    ctx.beginPath();
    ctx.ellipse(px + TS*0.5, py + TS*0.65, TS*0.48, TS*0.25, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawSwamp(ctx, px, py, tx, ty) {
    ctx.fillStyle = 'rgba(30,50,20,0.5)';
    for (let i = 0; i < 3; i++) {
      const rng = this._seededRng(tx * 31 + ty * 7 + i);
      ctx.beginPath();
      ctx.ellipse(px + 4 + rng() * (TS - 8), py + 4 + rng() * (TS - 8), 4, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- Move range overlay ----

  _drawMoveRange(camera, uiState) {
    if (!uiState.reachable) return;
    const ctx = this.ctx;
    const alpha = 0.25 + this._pulse * 0.1;
    ctx.fillStyle = `rgba(100,220,255,${alpha})`;

    for (const key of uiState.reachable.keys()) {
      const [tx, ty] = key.split(',').map(Number);
      const { px, py } = camera.tileToScreen(tx, ty);
      ctx.fillRect(px + 1, py + 1, TS - 2, TS - 2);
    }

    // Draw planned path
    if (uiState.hoveredPath) {
      ctx.strokeStyle = 'rgba(255,255,100,0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      for (let i = 0; i < uiState.hoveredPath.length; i++) {
        const { x, y } = uiState.hoveredPath[i];
        const { px, py } = camera.tileToScreen(x, y);
        if (i === 0) ctx.moveTo(px + TS/2, py + TS/2);
        else          ctx.lineTo(px + TS/2, py + TS/2);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // ---- Cities ----

  _drawCities(world, camera) {
    const ctx = this.ctx;
    const { minTX, maxTX, minTY, maxTY } = camera.visibleTiles();

    for (let ty = minTY; ty <= maxTY; ty++) {
      for (let tx = minTX; tx <= maxTX; tx++) {
        const city = world.getCityAt(tx, ty);
        if (!city) continue;
        const { px, py } = camera.tileToScreen(tx, ty);
        this._drawCity(ctx, city, px, py);
      }
    }
  }

  _drawCity(ctx, city, px, py) {
    const sz = TS;
    const half = sz / 2;
    const ownerColor = city.owner ? city.owner.color : '#aaaaaa';

    switch (city.type) {
      case 'capital':
        this._drawCastle(ctx, px, py, ownerColor, true);
        break;
      case 'city':
        this._drawCastle(ctx, px, py, ownerColor, false);
        break;
      case 'town':
        this._drawTown(ctx, px, py, ownerColor);
        break;
      case 'village':
        this._drawVillage(ctx, px, py, ownerColor);
        break;
      case 'ruins':
        this._drawRuins(ctx, px, py);
        break;
      case 'temple':
        this._drawTemple(ctx, px, py);
        break;
    }

    // City name label (only when zoomed in enough)
    if (TS >= 28) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(px, py + sz - 10, sz, 10);
      ctx.fillStyle = ownerColor;
      ctx.font = 'bold 7px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = city.name.length > 10 ? city.name.substring(0, 9) + '…' : city.name;
      ctx.fillText(label, px + half, py + sz - 5);
    }
  }

  _drawCastle(ctx, px, py, color, isCapital) {
    const w = TS, h = TS;
    // Wall
    ctx.fillStyle = '#555';
    ctx.fillRect(px + 4, py + 10, w - 8, h - 14);
    // Towers
    ctx.fillStyle = '#666';
    ctx.fillRect(px + 2,     py + 6, 8, 10);
    ctx.fillRect(px + w - 10, py + 6, 8, 10);
    if (isCapital) {
      ctx.fillRect(px + w/2 - 4, py + 3, 8, 12);
    }
    // Battlements
    ctx.fillStyle = '#777';
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(px + 4 + i*8, py + 8, 5, 3);
    }
    // Banner
    ctx.fillStyle = color;
    ctx.fillRect(px + w/2 - 1, py + 2, 2, 8);
    ctx.beginPath();
    ctx.moveTo(px + w/2 + 1, py + 2);
    ctx.lineTo(px + w/2 + 7, py + 5);
    ctx.lineTo(px + w/2 + 1, py + 8);
    ctx.closePath();
    ctx.fill();
  }

  _drawTown(ctx, px, py, color) {
    const w = TS, h = TS;
    ctx.fillStyle = '#88776a';
    ctx.fillRect(px + 6, py + 14, w - 12, h - 18);
    // Roof
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(px + w/2, py + 7);
    ctx.lineTo(px + 4, py + 16);
    ctx.lineTo(px + w - 4, py + 16);
    ctx.closePath();
    ctx.fill();
    // Door
    ctx.fillStyle = '#333';
    ctx.fillRect(px + w/2 - 3, py + h - 8, 6, 8);
  }

  _drawVillage(ctx, px, py, color) {
    const w = TS, h = TS;
    ctx.fillStyle = '#9a8870';
    ctx.fillRect(px + 8, py + 16, w - 16, h - 20);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(px + w/2, py + 9);
    ctx.lineTo(px + 6, py + 18);
    ctx.lineTo(px + w - 6, py + 18);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#444';
    ctx.fillRect(px + w/2 - 2, py + h - 8, 4, 8);
  }

  _drawRuins(ctx, px, py) {
    const w = TS, h = TS;
    ctx.fillStyle = '#554444';
    // Broken walls
    ctx.fillRect(px + 4, py + 18, 6, h - 20);
    ctx.fillRect(px + w - 10, py + 14, 6, h - 16);
    ctx.fillRect(px + 8, py + 22, w - 16, 4);
    // Rubble
    ctx.fillStyle = '#443333';
    ctx.fillRect(px + 10, py + 20, 4, 4);
    ctx.fillRect(px + 18, py + 24, 5, 3);
    ctx.fillStyle = '#888';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('?', px + w/2, py + h/2);
  }

  _drawTemple(ctx, px, py) {
    const w = TS, h = TS;
    ctx.fillStyle = '#ccbbaa';
    ctx.fillRect(px + 5, py + 14, w - 10, h - 16);
    // Columns
    ctx.fillStyle = '#ddccbb';
    ctx.fillRect(px + 7,  py + 12, 4, h - 14);
    ctx.fillRect(px + w - 11, py + 12, 4, h - 14);
    // Pediment
    ctx.fillStyle = '#c8b89a';
    ctx.beginPath();
    ctx.moveTo(px + w/2, py + 5);
    ctx.lineTo(px + 3, py + 14);
    ctx.lineTo(px + w - 3, py + 14);
    ctx.closePath();
    ctx.fill();
    // Glow
    ctx.fillStyle = 'rgba(200,180,100,0.6)';
    ctx.beginPath();
    ctx.arc(px + w/2, py + h/2, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- Armies ----

  _drawArmies(world, camera, uiState) {
    const ctx = this.ctx;
    const { minTX, maxTX, minTY, maxTY } = camera.visibleTiles();

    for (let ty = minTY; ty <= maxTY; ty++) {
      for (let tx = minTX; tx <= maxTX; tx++) {
        const armies = world.getArmiesAt(tx, ty);
        if (armies.length === 0) continue;
        const { px, py } = camera.tileToScreen(tx, ty);
        this._drawArmyStack(ctx, armies, px, py, uiState);
      }
    }
  }

  _drawArmyStack(ctx, armies, px, py, uiState) {
    // Draw up to 3 stacked icons
    const selected = uiState.selectedArmy;
    const count = Math.min(armies.length, 3);

    for (let i = count - 1; i >= 0; i--) {
      const army   = armies[i];
      const isSelected = army === selected;
      const offX = i * 2, offY = i * 2;
      this._drawArmyIcon(ctx, army, px + offX, py + offY, isSelected);
    }
  }

  _drawArmyIcon(ctx, army, px, py, isSelected) {
    const sz   = TS - 4;
    const ax   = px + 2;
    const ay   = py + 2;
    const color = army.player.color;
    const dark  = army.player.faction.dark;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(ax + 2, ay + 2, sz, sz);

    // Body
    ctx.fillStyle = dark;
    ctx.fillRect(ax, ay, sz, sz);

    // Selection pulse
    if (isSelected) {
      ctx.strokeStyle = `rgba(255,255,100,${0.7 + this._pulse * 0.3})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(ax - 1, ay - 1, sz + 2, sz + 2);
    }

    // Color bar (top)
    ctx.fillStyle = color;
    ctx.fillRect(ax, ay, sz, 4);

    // Hero star
    if (army.hero) {
      ctx.fillStyle = '#ffdd22';
      ctx.font = `bold ${Math.floor(sz * 0.4)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', ax + sz/2, ay + sz/2 - 2);
    }

    // Unit count
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.floor(sz * 0.35)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(army.units.length.toString(), ax + sz/2, ay + sz - 1);

    // Move points indicator (dots)
    const maxMp  = army.maxMovePoints();
    const curMp  = army.movePoints;
    if (maxMp > 0) {
      const dotW = Math.min(4, (sz - 4) / maxMp);
      for (let i = 0; i < maxMp; i++) {
        ctx.fillStyle = i < curMp ? '#88ff88' : '#444';
        ctx.fillRect(ax + 2 + i * (dotW + 1), ay + sz - 6, dotW, 3);
      }
    }
  }

  // ---- Selection indicator ----

  _drawSelection(camera, uiState) {
    if (!uiState.selectedArmy) return;
    const army = uiState.selectedArmy;
    const { px, py } = camera.tileToScreen(army.x, army.y);
    const ctx = this.ctx;

    // Glowing ring around selected tile
    const glow = 0.4 + this._pulse * 0.5;
    ctx.strokeStyle = `rgba(255,255,80,${glow})`;
    ctx.lineWidth   = 2;
    ctx.strokeRect(px, py, TS, TS);
  }

  // ---- Minimap ----

  _drawMinimap(world, camera) {
    const ctx  = this.ctx;
    const mmSz = Math.min(120, Math.floor(Math.min(this.canvas.width, this.canvas.height) * 0.18));
    const tilePerPx = world.mapSize / mmSz;
    const mmX  = this.canvas.width  - mmSz - 8;
    const mmY  = this.canvas.height - mmSz - 8;

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(mmX - 2, mmY - 2, mmSz + 4, mmSz + 4);

    // Terrain
    for (let my = 0; my < mmSz; my++) {
      for (let mx = 0; mx < mmSz; mx++) {
        const tx = Math.floor(mx * tilePerPx);
        const ty = Math.floor(my * tilePerPx);
        const tile = world.getTile(tx, ty);
        if (!tile) continue;

        const city = tile.city;
        if (city) {
          ctx.fillStyle = city.owner ? city.owner.color : '#cccccc';
        } else {
          ctx.fillStyle = tile.terrain.dark;
        }
        ctx.fillRect(mmX + mx, mmY + my, 1, 1);
      }
    }

    // Draw armies
    for (const army of world.armies) {
      const mx = Math.floor(army.x / tilePerPx);
      const my = Math.floor(army.y / tilePerPx);
      ctx.fillStyle = army.player.color;
      ctx.fillRect(mmX + mx - 1, mmY + my - 1, 3, 3);
    }

    // Viewport rect
    const vpX = Math.floor(camera.x  / (world.mapSize * TS / mmSz));
    const vpY = Math.floor(camera.y  / (world.mapSize * TS / mmSz));
    const vpW = Math.floor(camera.screenW / (world.mapSize * TS / mmSz));
    const vpH = Math.floor(camera.screenH / (world.mapSize * TS / mmSz));

    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth   = 1;
    ctx.strokeRect(mmX + vpX, mmY + vpY, vpW, vpH);
  }

  // ---- Helpers ----

  _adjustColor(hex, amount) {
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    const clamp = v => Math.max(0, Math.min(255, v + amount));
    return `rgb(${clamp(r)},${clamp(g)},${clamp(b)})`;
  }

  /** Deterministic pseudo-random generator seeded by a number */
  _seededRng(seed) {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 0xffffffff;
    };
  }
}
