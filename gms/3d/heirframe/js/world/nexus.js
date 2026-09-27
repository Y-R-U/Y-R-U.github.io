// Nexus Arcology (P3w, in progress): stub so the district registry imports cleanly.
function buildStub(ctx) {
  ctx.sites = [];
}
const stub = (id, name) => ({
  id, name, layout: { bounds: { x0: -20, x1: 20, z0: -20, z1: 20 } }, bounds: { x0: -20, x1: 20, z0: -20, z1: 20 }, build: buildStub,
  ambience: { sun: [1, 0.9, 0.8], sunI: 3, hemiSky: 0xbcd4ff, hemiGround: 0x8a7358, hemiI: 0.3, fog: [0.7, 0.76, 0.85], fogDensity: 0.0006, env: 0.75,
    gain: [1, 1, 1], lift: [0, 0, 0], sat: 1.1, contrast: 1.1 },
  spawnPoints: () => ({ player: [0, 0], relay: [0, 0], lift: [0, 0] }),
});
export const ARCOLOGY = stub('arcology', 'Nexus Arcology');
export const ARCOLOGY_SERVERS = stub('arcology_servers', 'Nexus Arcology — Server Hall');
