/* Curated discovery metadata. projects.js remains the project source of truth.
 * Keys are registry screenshot IDs. Tags may overlap; parents are documented
 * sequels/rebuilds, not a claim that similar projects share source code. */
window.PROJECT_TAXONOMY = (() => {
  const labels = {
    isometric: 'Isometric / overhead', rpg: 'Diablo / RuneScape / RPG',
    strategy: 'Strategy & tactics', shooter: 'Shooters & combat',
    simulation: 'Simulation & management', idle: 'Idle & incremental',
    puzzle: 'Puzzles & board games', platformer: 'Platformers & runners',
    horror: 'Horror & narrative', sports: 'Sports & racing',
    sandbox: 'Exploration & building', arcade: 'Arcade & survival', tools: 'Editors & creative tools',
    utility: 'Everyday utilities'
  };
  const groups = {
    isometric: 'driverc pirates fable5-glade whoami deadtown f5_deadtown hotwire hexpire runedale facet forge whofights emberwake heirframe tinpot towered firstfolk glade-bros-3d',
    rpg: 'crpg orpg pirate2d fable5-glade whoami runedale forge whofights emberwake heirframe hellwake sunwake',
    strategy: 'kingdom-city kingdom-manager miniwar ccg cc1 warlords towerd1 towered firstfolk hexpire grudgebugs grumpybugs tinpot waterline monopole',
    shooter: 'asteroids simple-shooter tululoo rcell dodgybird codex-3d-tank claude-3d-tank codex-tank-battle claude-tank-battle outpace fable5-3d-tank fable5-3d-tank-battle fable5-crow-tank fable5-crow-tank-battle crazyspace deadtown f5_deadtown longshot opus5-ironhail breachpoint breachpoint2 skyhammer kitehawk ragdojo hellwake ninestrings',
    simulation: 'kingdom-city kingdom-manager idle-life idle-western transport idle-transport emeraldplace drk firstfolk uuidworlds monopole tanking tanking2 tidekeeper tidekeeper2',
    idle: 'idle-life idle-western transport idle-transport',
    puzzle: 'sudoku dicey dicey-vid drace bouncem paperant prismbreak silt secondhand',
    platformer: 'desert-throw dodgybird swingin codex-gate-tank-runner homebound lanternlight sunderfall',
    horror: 'storybook codex-horror claude-horror awake the-horrors emeraldplace glade-bros glade-bros-3d deadtown f5_deadtown',
    sports: 'driverc sundayleague racketeer foulplay',
    sandbox: 'pirates pirate2d fable5-glade facet uuidworlds neonhaul synthwild sunwake',
    arcade: 'snake snake-io crowd voidcast bouncem desert-throw rcell ninestrings hellwake',
    tools: 'code-editor mobile-editor code-editor-v2 ab-edit image-editor draw-editor edit2d spacehabitat mcaddons mcstudio gallery flythrough',
    utility: 'goal-tracker k-hydro fnote timezones reader caltrack'
  };
  const entries = {};
  for (const [tag, ids] of Object.entries(groups)) {
    for (const id of ids.split(' ')) (entries[id] ||= { tags: [] }).tags.push(tag);
  }
  const parents = {
    'code-editor-v2': ['code-editor', 'Version 2'], 'ab-edit': ['mobile-editor', 'Enhanced editor'],
    'draw-editor': ['image-editor', 'Drawing & layers'],
    'dicey-vid': ['dicey', 'Image & video experiment'],
    'glade-bros-3d': ['glade-bros', '3D edition'],
    'f5_deadtown': ['deadtown', 'Story-driven rebuild'],
    'grumpybugs': ['grudgebugs', 'Graphics rebuild'],
    'tanking2': ['tanking', 'Version II'], 'tidekeeper2': ['tidekeeper', 'Version II'],
    'breachpoint2': ['breachpoint', 'Version II'],
    'codex-tank-battle': ['codex-3d-tank', 'Battle royale'],
    'claude-tank-battle': ['claude-3d-tank', 'Battle royale'],
    'fable5-3d-tank-battle': ['fable5-3d-tank', 'Battle royale'],
    'fable5-crow-tank-battle': ['fable5-crow-tank', 'Battle royale']
  };
  for (const [id, [parent, evolution]] of Object.entries(parents)) Object.assign(entries[id], { parent, evolution });
  const graphics = {
    'grudgebugs': 'Procedural 3D insects & destructible ridges',
    'grumpybugs': 'Rebuilt props, materials & scenery',
    'tanking': 'Procedural aquarium & animated fish',
    'tanking2': 'Modular aquarium, richer materials & lighting',
    'tidekeeper': 'GPU fish, caustics & volumetric light shafts',
    'tidekeeper2': 'Aquarium sequel with expanded presentation',
    'breachpoint': 'Low-poly warehouse combat',
    'breachpoint2': 'Nine missions, seven weather & lighting presets',
    'glade-bros': '2D rooms & characters', 'glade-bros-3d': '3D dollhouse rooms',
    'fable5-glade': 'Low-poly meadow & tap-to-move hero',
    'facet': 'Procedural isometric island diorama',
    'neonhaul': 'Rain-lit city, neon signage & wet roads',
    'heirframe': 'PBR reflections & planar mirror floors',
    'synthwild': 'Voxel worlds, flood-fill lighting & greedy meshing',
    'sunderfall': 'Painted parallax, WebGL2 sprites & dynamic lights',
    'ragdojo': 'Animated pencil drawing & Verlet ragdolls',
    'secondhand': 'Reflective metal & reversible physical fragments',
    'lanternlight': 'Procedural worlds, characters & bloom',
    'waterline': 'Lit wheelhouse, shell flights & ocean impacts',
    'dicey': 'Classic board-game presentation', 'dicey-vid': 'Image-backed spaces & looping video',
    'emberwake': 'Isometric islands, crafting & narrated story'
  };
  for (const [id, visual] of Object.entries(graphics)) Object.assign(entries[id], { visual });
  function get(project) {
    const category = project.type === 'app' ? 'apps' :
      /\/3d\//.test(project.path) || ['pirates', 'transport'].includes(project.screenshot) ? '3d' : '2d';
    return { category, tags: [], ...entries[project.screenshot] };
  }
  return { get, labels, entries };
})();
