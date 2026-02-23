// ===== Player Entity — path-following movement =====
import { getState, getEquipBonus, getBuffBonus, calcMaxHp } from '../state.js';
import { AGGRO_RADIUS } from '../config.js';

const MOVE_SPEED = 0.085; // tiles per frame  (~5 tiles/sec at 60fps)

export class Player {
  constructor() {
    const st = getState();
    this.x = st.player.x;
    this.y = st.player.y;
    this.glyph    = '@';
    this.color    = '#00ff00';
    this.bgColor  = '#003300';
    this.visible  = true;
    this.type     = 'player';
    this.hp       = st.player.hp;
    this.maxHp    = st.player.maxHp;
    this.targeted = false;

    // Pathfinding state
    this.path       = [];    // [{x, y}] remaining waypoints (tile centres)
    this.destMarker = null;  // {x, y} shown on canvas until arrived
  }

  // Set a new path from the pathfinder.
  setPath(waypoints, dest) {
    this.path       = waypoints ? [...waypoints] : [];
    this.destMarker = dest || null;
  }

  // Stop moving immediately.
  stopPath() {
    this.path       = [];
    this.destMarker = null;
  }

  update(worldMap) {
    if (this.path.length > 0) {
      const wp   = this.path[0];
      const dx   = wp.x - this.x;
      const dy   = wp.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= MOVE_SPEED) {
        // Snap to waypoint and advance
        this.x = wp.x;
        this.y = wp.y;
        this.path.shift();
        if (this.path.length === 0) this.destMarker = null;
      } else {
        const nx = this.x + (dx / dist) * MOVE_SPEED;
        const ny = this.y + (dy / dist) * MOVE_SPEED;

        if (worldMap) {
          const canX = worldMap.isWalkable(nx, this.y);
          const canY = worldMap.isWalkable(this.x, ny);
          if (canX) this.x = nx;
          if (canY) this.y = ny;
          // Stuck on both axes — give up on this path
          if (!canX && !canY) this.stopPath();
        } else {
          this.x = nx;
          this.y = ny;
        }
      }
    }

    // Clamp to map bounds
    const mapW = worldMap ? worldMap.width  : 80;
    const mapH = worldMap ? worldMap.height : 80;
    this.x = Math.max(0.5, Math.min(mapW - 0.5, this.x));
    this.y = Math.max(0.5, Math.min(mapH - 0.5, this.y));

    // Sync back to persistent state
    const st   = getState();
    st.player.x = this.x;
    st.player.y = this.y;
  }

  syncFromState() {
    const st       = getState();
    this.maxHp     = calcMaxHp();
    st.player.maxHp = this.maxHp;
    if (!st.player.hp || st.player.hp <= 0) st.player.hp = this.maxHp;
    this.hp = st.player.hp;
  }

  heal(amount) {
    const st    = getState();
    st.player.hp = Math.min(st.player.maxHp, st.player.hp + amount);
    this.hp     = st.player.hp;
  }

  takeDamage(amount) {
    const st       = getState();
    const defSkill = st.player.skills.defence?.level || 1;
    const totalDef = defSkill + getEquipBonus('def') + getBuffBonus('def');
    const reduced  = Math.max(1, amount - Math.floor(totalDef * 0.5));
    st.player.hp   = Math.max(0, st.player.hp - reduced);
    this.hp        = st.player.hp;
    return reduced;
  }

  isDead() { return getState().player.hp <= 0; }

  getAttackStat() {
    const st = getState();
    return (st.player.skills.attack?.level || 1) + getEquipBonus('atk') + getBuffBonus('atk');
  }

  getDefenceStat() {
    const st = getState();
    return (st.player.skills.defence?.level || 1) + getEquipBonus('def') + getBuffBonus('def');
  }

  getAggroRadius() {
    const rngLvl = getState().player.skills.ranged?.level || 1;
    return AGGRO_RADIUS + Math.floor(rngLvl / 20);
  }

  isMoving() { return this.path.length > 0; }
}
