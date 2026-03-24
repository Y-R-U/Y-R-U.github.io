/* assets.js – asset catalog, sprite sheet loading, placeholder tile generation */

const packs = {};
let activePack = null;
let catalog = null;

// ── Catalog ──
export async function loadCatalog() {
  try {
    const res = await fetch('./assets/catalog.json');
    catalog = await res.json();
  } catch {
    catalog = { packs: [] };
  }
}

export function getCatalog() { return catalog; }

// ── Pack loading ──
export async function loadPack(packId) {
  if (packs[packId]) { activePack = packs[packId]; return activePack; }

  if (packId === 'placeholder') {
    const pack = generatePlaceholderPack();
    packs[packId] = pack;
    activePack = pack;
    return pack;
  }

  const entry = catalog?.packs.find(p => p.id === packId);
  if (!entry) return null;

  const img = new Image();
  img.src = entry.image;
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });

  let meta;
  try {
    const res = await fetch(entry.metadata);
    meta = await res.json();
  } catch { return null; }

  const pack = {
    id: packId,
    name: entry.name,
    tileSize: meta.tileSize,
    image: img,
    columns: meta.columns,
    spacing: meta.spacing || 0,
    tiles: meta.tiles,
    tileMap: {},
    categories: [],
  };

  const cats = new Set();
  meta.tiles.forEach(t => {
    pack.tileMap[t.id] = t;
    if (t.category) cats.add(t.category);
  });
  pack.categories = ['all', ...Array.from(cats).sort()];

  packs[packId] = pack;
  activePack = pack;
  return pack;
}

export function getActivePack() { return activePack; }

// ── Tile lookup ──
export function getTile(tileId) {
  if (!activePack || !tileId) return null;
  const t = activePack.tileMap[tileId];
  if (!t) return null;
  const ts = activePack.tileSize;
  const sp = activePack.spacing;
  return {
    image: activePack.image,
    sx: t.col * (ts + sp),
    sy: t.row * (ts + sp),
    sw: ts,
    sh: ts,
    name: t.name,
    category: t.category,
  };
}

export function getAllTiles() {
  if (!activePack) return [];
  return activePack.tiles;
}

export function searchTiles(query) {
  if (!activePack) return [];
  const q = query.toLowerCase();
  return activePack.tiles.filter(t => t.name.toLowerCase().includes(q) || t.id.toLowerCase().includes(q));
}

export function getTilesByCategory(cat) {
  if (!activePack) return [];
  if (cat === 'all') return activePack.tiles;
  return activePack.tiles.filter(t => t.category === cat);
}

export function getCategories() {
  return activePack?.categories || ['all'];
}

// ── Placeholder pack generation ──
function generatePlaceholderPack() {
  const ts = 16;
  const cols = 20;
  const totalTiles = [];

  const tileDefs = [
    // Terrain
    { id: 'grass_1',  name: 'Grass',       cat: 'terrain', color: '#3a7d32' },
    { id: 'grass_2',  name: 'Grass Alt',   cat: 'terrain', color: '#4a8d42' },
    { id: 'dirt_1',   name: 'Dirt',        cat: 'terrain', color: '#8b6914' },
    { id: 'dirt_2',   name: 'Dirt Alt',    cat: 'terrain', color: '#7a5c12' },
    { id: 'sand_1',   name: 'Sand',        cat: 'terrain', color: '#d4b456' },
    { id: 'sand_2',   name: 'Sand Alt',    cat: 'terrain', color: '#c4a446' },
    { id: 'stone_1',  name: 'Stone',       cat: 'terrain', color: '#777788' },
    { id: 'stone_2',  name: 'Stone Alt',   cat: 'terrain', color: '#666677' },
    { id: 'snow_1',   name: 'Snow',        cat: 'terrain', color: '#ddeeff' },
    { id: 'path_1',   name: 'Path',        cat: 'terrain', color: '#aa9060' },
    // Water
    { id: 'water_1',  name: 'Water',       cat: 'water', color: '#2266aa' },
    { id: 'water_2',  name: 'Water Deep',  cat: 'water', color: '#114488' },
    { id: 'water_3',  name: 'Water Shore', cat: 'water', color: '#3388cc' },
    { id: 'lava_1',   name: 'Lava',        cat: 'water', color: '#cc3300' },
    // Walls
    { id: 'wall_1',   name: 'Wall',        cat: 'walls', color: '#555566' },
    { id: 'wall_2',   name: 'Wall Brick',  cat: 'walls', color: '#884433' },
    { id: 'wall_3',   name: 'Wall Stone',  cat: 'walls', color: '#666655' },
    { id: 'wall_4',   name: 'Wall Dark',   cat: 'walls', color: '#333344' },
    { id: 'wall_wood', name: 'Wall Wood',  cat: 'walls', color: '#8b6b3a' },
    { id: 'fence_1',  name: 'Fence',       cat: 'walls', color: '#9a8a5a' },
    // Items
    { id: 'chest_1',  name: 'Chest',       cat: 'items', color: '#cc8800' },
    { id: 'key_1',    name: 'Key',         cat: 'items', color: '#ffcc00' },
    { id: 'potion_1', name: 'Potion',      cat: 'items', color: '#cc22aa' },
    { id: 'gem_1',    name: 'Gem',         cat: 'items', color: '#22cccc' },
    { id: 'coin_1',   name: 'Coin',        cat: 'items', color: '#ffdd33' },
    { id: 'scroll_1', name: 'Scroll',      cat: 'items', color: '#eecc88' },
    { id: 'bomb_1',   name: 'Bomb',        cat: 'items', color: '#333333' },
    { id: 'heart_1',  name: 'Heart',       cat: 'items', color: '#ee3333' },
    // Characters
    { id: 'hero_1',   name: 'Hero',        cat: 'characters', color: '#3366cc' },
    { id: 'hero_2',   name: 'Hero Alt',    cat: 'characters', color: '#4477dd' },
    { id: 'enemy_1',  name: 'Enemy',       cat: 'characters', color: '#cc3333' },
    { id: 'enemy_2',  name: 'Enemy Alt',   cat: 'characters', color: '#dd4444' },
    { id: 'npc_1',    name: 'NPC',         cat: 'characters', color: '#33aa33' },
    { id: 'npc_2',    name: 'NPC Alt',     cat: 'characters', color: '#44bb44' },
    { id: 'boss_1',   name: 'Boss',        cat: 'characters', color: '#aa22aa' },
    { id: 'pet_1',    name: 'Pet',         cat: 'characters', color: '#ee9933' },
    // Decoration
    { id: 'tree_1',   name: 'Tree',        cat: 'decoration', color: '#226622' },
    { id: 'tree_2',   name: 'Tree Pine',   cat: 'decoration', color: '#1a5a1a' },
    { id: 'bush_1',   name: 'Bush',        cat: 'decoration', color: '#2a8a2a' },
    { id: 'rock_1',   name: 'Rock',        cat: 'decoration', color: '#888888' },
    { id: 'flower_1', name: 'Flower',      cat: 'decoration', color: '#ee66aa' },
    { id: 'mushroom_1', name: 'Mushroom',  cat: 'decoration', color: '#cc5544' },
    { id: 'torch_1',  name: 'Torch',       cat: 'decoration', color: '#ff9922' },
    { id: 'sign_1',   name: 'Sign',        cat: 'decoration', color: '#aa8855' },
    // Doors / Stairs
    { id: 'door_1',   name: 'Door',        cat: 'structures', color: '#8a5a2a' },
    { id: 'door_2',   name: 'Door Open',   cat: 'structures', color: '#6a4a1a' },
    { id: 'stairs_1', name: 'Stairs Up',   cat: 'structures', color: '#999999' },
    { id: 'stairs_2', name: 'Stairs Down', cat: 'structures', color: '#777777' },
    { id: 'bridge_1', name: 'Bridge',      cat: 'structures', color: '#8b7b4b' },
    { id: 'floor_1',  name: 'Floor Tile',  cat: 'structures', color: '#998866' },
    // UI/Markers
    { id: 'spawn_1',  name: 'Spawn Point', cat: 'markers', color: '#00ff88' },
    { id: 'exit_1',   name: 'Exit',        cat: 'markers', color: '#ff4444' },
    { id: 'waypoint', name: 'Waypoint',    cat: 'markers', color: '#4488ff' },
    { id: 'trigger_zone', name: 'Trigger', cat: 'markers', color: '#ffaa00' },
  ];

  const canvas = document.createElement('canvas');
  const rows = Math.ceil(tileDefs.length / cols);
  canvas.width = cols * ts;
  canvas.height = rows * ts;
  const ctx = canvas.getContext('2d');

  tileDefs.forEach((def, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * ts;
    const y = row * ts;

    // Fill base color
    ctx.fillStyle = def.color;
    ctx.fillRect(x, y, ts, ts);

    // Add subtle pattern/detail
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    if (def.cat === 'terrain') {
      // Noise dots
      for (let d = 0; d < 5; d++) {
        const dx = x + 2 + Math.floor(Math.random() * 12);
        const dy = y + 2 + Math.floor(Math.random() * 12);
        ctx.fillRect(dx, dy, 1, 1);
      }
    } else if (def.cat === 'walls') {
      // Brick lines
      ctx.fillRect(x, y + 4, ts, 1);
      ctx.fillRect(x, y + 10, ts, 1);
      ctx.fillRect(x + 8, y, 1, 4);
      ctx.fillRect(x + 4, y + 5, 1, 5);
      ctx.fillRect(x + 12, y + 5, 1, 5);
      ctx.fillRect(x + 8, y + 11, 1, 5);
    } else if (def.cat === 'characters') {
      // Simple face
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x + 5, y + 5, 2, 2);
      ctx.fillRect(x + 9, y + 5, 2, 2);
      ctx.fillRect(x + 5, y + 9, 6, 2);
    } else if (def.cat === 'items') {
      // Highlight
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(x + 3, y + 3, 3, 2);
    }

    // 1px inner border
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.strokeRect(x + 0.5, y + 0.5, ts - 1, ts - 1);

    // Small label
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(def.id.split('_')[0].slice(0, 4), x + ts / 2, y + ts - 2);
  });

  const img = new Image();
  img.src = canvas.toDataURL();

  const tiles = tileDefs.map((def, i) => ({
    id: def.id,
    name: def.name,
    category: def.cat,
    col: i % cols,
    row: Math.floor(i / cols),
  }));

  const cats = new Set();
  tiles.forEach(t => cats.add(t.category));

  const tileMap = {};
  tiles.forEach(t => { tileMap[t.id] = t; });

  return {
    id: 'placeholder',
    name: 'Placeholder Pack',
    tileSize: ts,
    image: img,
    columns: cols,
    spacing: 0,
    tiles,
    tileMap,
    categories: ['all', ...Array.from(cats).sort()],
  };
}
