// ===== Player Entity =====
import { getState, getEquipBonus, getBuffBonus, calcMaxHp } from '../state.js';
import { getVelocity } from '../engine/input.js';
import { AGGRO_RADIUS } from '../config.js';

export class Player {
  constructor() {
    const st = getState();
    this.x = st.player.x;
    this.y = st.player.y;
    this.glyph   = '@';
    this.color   = '#00ff00';
    this.bgColor = '#003300';
    this.visible = true;
    this.type    = 'player';
    this.hp      = st.player.hp;
    this.maxHp   = st.player.maxHp;
    this.targeted = false;
  }

  update(worldMap) {
    const { vx, vy } = getVelocity();

    // Velocity from input.js is already in tiles/frame — apply directly
    if (vx !== 0 || vy !== 0) {
      const nx = this.x + vx;
      const ny = this.y + vy;

      // Separate X and Y collision so player can slide along walls
      if (worldMap) {
        if (worldMap.isWalkable(nx, this.y)) this.x = nx;
        if (worldMap.isWalkable(this.x, ny)) this.y = ny;
      } else {
        this.x = nx;
        this.y = ny;
      }

      // Clamp to map bounds
      const mapW = worldMap ? worldMap.width  : 80;
      const mapH = worldMap ? worldMap.height : 80;
      this.x = Math.max(0.5, Math.min(mapW  - 0.5, this.x));
      this.y = Math.max(0.5, Math.min(mapH - 0.5, this.y));
    }

    // Sync to global state every frame
    const st = getState();
    st.player.x = this.x;
    st.player.y = this.y;
  }

  syncFromState() {
    const st = getState();
    this.hp    = st.player.hp;
    this.maxHp = calcMaxHp();
    st.player.maxHp = this.maxHp;
    if (this.hp <= 0) {
      st.player.hp = this.maxHp;
      this.hp = this.maxHp;
    }
  }

  heal(amount) {
    const st = getState();
    st.player.hp = Math.min(st.player.maxHp, st.player.hp + amount);
    this.hp = st.player.hp;
  }

  takeDamage(amount) {
    const defBonus = getEquipBonus('def');
    const buffDef  = getBuffBonus('def');
    const st       = getState();
    const defSkill = st.player.skills.defence?.level || 1;
    const totalDef = defSkill + defBonus + buffDef;
    const reduced  = Math.max(1, amount - Math.floor(totalDef * 0.5));
    st.player.hp = Math.max(0, st.player.hp - reduced);
    this.hp = st.player.hp;
    return reduced;
  }

  isDead() {
    return getState().player.hp <= 0;
  }

  getAttackStat() {
    const st    = getState();
    const lvl   = st.player.skills.attack?.level || 1;
    const equip = getEquipBonus('atk');
    const buff  = getBuffBonus('atk');
    return lvl + equip + buff;
  }

  getDefenceStat() {
    const st    = getState();
    const lvl   = st.player.skills.defence?.level || 1;
    const equip = getEquipBonus('def');
    const buff  = getBuffBonus('def');
    return lvl + equip + buff;
  }

  getAggroRadius() {
    const rngLvl = getState().player.skills.ranged?.level || 1;
    return AGGRO_RADIUS + Math.floor(rngLvl / 20);
  }
}
