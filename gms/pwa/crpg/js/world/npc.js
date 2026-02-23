// ===== NPC System =====
import { NPCS, TOWNS } from '../config.js';

export class NpcManager {
  constructor() {
    this.npcs = [];
    this._build();
  }

  _build() {
    for (const npcDef of Object.values(NPCS)) {
      this.npcs.push({
        id: npcDef.id,
        name: npcDef.name,
        glyph: npcDef.glyph,
        color: npcDef.color,
        bgColor: '#2a1a0a',
        x: npcDef.tx + 0.5,
        y: npcDef.ty + 0.5,
        dialogue: npcDef.dialogue,
        shop: npcDef.shop || null,
        trainer: npcDef.trainer || null,
        visible: true,
        type: 'npc',
        hp: 9999, maxHp: 9999,
      });
    }
  }

  getNpcs() { return this.npcs; }

  getNpcAt(tx, ty) {
    const fx = Math.floor(tx);
    const fy = Math.floor(ty);
    return this.npcs.find(n =>
      Math.floor(n.x) === fx && Math.floor(n.y) === fy
    ) || null;
  }

  getNpcNear(tx, ty, radius = 1.5) {
    return this.npcs.find(n => {
      const dx = n.x - tx, dy = n.y - ty;
      return Math.sqrt(dx*dx + dy*dy) < radius;
    }) || null;
  }
}
