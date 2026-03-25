// Terrain type constants and Tile class

export const TERRAIN = {
  OCEAN:     { id:0, name:'Ocean',     color:'#1a3a6c', dark:'#0f2244', move:99, passable:false, label:'~' },
  PLAINS:    { id:1, name:'Plains',    color:'#3d7a30', dark:'#2d5a20', move:1,  passable:true,  label:'.' },
  FOREST:    { id:2, name:'Forest',    color:'#1e5218', dark:'#133410', move:2,  passable:true,  label:'T' },
  HILLS:     { id:3, name:'Hills',     color:'#7a6030', dark:'#5a4020', move:2,  passable:true,  label:'^' },
  MOUNTAINS: { id:4, name:'Mountains', color:'#606060', dark:'#404040', move:99, passable:false, label:'M' },
  DESERT:    { id:5, name:'Desert',    color:'#b09030', dark:'#806010', move:2,  passable:true,  label:'d' },
  SWAMP:     { id:6, name:'Swamp',     color:'#3a5030', dark:'#253520', move:3,  passable:true,  label:'s' },
};

export const TERRAIN_BY_ID = Object.values(TERRAIN);

export class Tile {
  /**
   * @param {number} x - grid column
   * @param {number} y - grid row
   * @param {object} terrain - TERRAIN constant
   */
  constructor(x, y, terrain) {
    this.x = x;
    this.y = y;
    this.terrain = terrain;
    this.city = null;       // City | null
    this.armies = [];       // Army[] on this tile
    this.explored = false;  // fog of war
  }
}
