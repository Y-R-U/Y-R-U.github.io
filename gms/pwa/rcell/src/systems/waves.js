// waves.js — Wave/stage progression
const Waves = (() => {
  const WAVE_CONFIGS = [
    // Wave 1 — Tutorial: modest pressure, but more than before
    { spawns: [{ id: 'bacteria_cocci', count: 8, interval: 1800 }, { id: 'bacteria_rod', count: 2, interval: 2500 }], special: 'tutorial' },
    // Wave 2 — Mixed tier-1
    { spawns: [{ id: 'bacteria_cocci', count: 8, interval: 1600 }, { id: 'bacteria_rod', count: 4, interval: 2200 }, { id: 'virus_basic', count: 3, interval: 2000 }] },
    // Wave 3 — Faster, first tier-2 intro
    { spawns: [{ id: 'bacteria_cocci', count: 10, interval: 1400 }, { id: 'bacteria_rod', count: 4, interval: 1800 }, { id: 'virus_basic', count: 4, interval: 1800 }, { id: 'fungus_spore', count: 2, interval: 4000 }], elite: true },
    // Wave 4 — Tier-2 pressure starts
    { spawns: [{ id: 'bacteria_cocci', count: 10, interval: 1300 }, { id: 'bacteria_rod', count: 5, interval: 1600 }, { id: 'fungus_spore', count: 3, interval: 3000 }, { id: 'parasite_hook', count: 2, interval: 3500 }] },
    // Wave 5 — Spiral + hook swarm
    { spawns: [{ id: 'bacteria_cocci', count: 8, interval: 1200 }, { id: 'fungus_spore', count: 4, interval: 2500 }, { id: 'bacteria_spiral', count: 5, interval: 2000 }, { id: 'parasite_hook', count: 3, interval: 2800 }] },
    // Wave 6 — Shooters enter, heavy pressure
    { spawns: [{ id: 'bacteria_rod', count: 6, interval: 1400 }, { id: 'fungus_spore', count: 4, interval: 2200 }, { id: 'virus_corona', count: 3, interval: 4000 }, { id: 'parasite_hook', count: 4, interval: 2500 }, { id: 'bacteria_spiral', count: 4, interval: 2000 }] },
    // Wave 7 — Swarm + tier-2 mix
    { spawns: [{ id: 'bacteria_cocci', count: 14, interval: 900 }, { id: 'parasite_hook', count: 5, interval: 2200 }, { id: 'bacteria_spiral', count: 5, interval: 1800 }, { id: 'virus_corona', count: 3, interval: 3500 }] },
    // Wave 8 — Tier-3 debut, brutal combo
    { spawns: [{ id: 'prion_cluster', count: 3, interval: 4000 }, { id: 'superbug', count: 3, interval: 5000 }, { id: 'virus_corona', count: 4, interval: 2800 }, { id: 'fungus_spore', count: 5, interval: 2200 }, { id: 'bacteria_spiral', count: 5, interval: 1600 }] },
    // Wave 9 — All types, relentless
    { spawns: [{ id: 'bacteria_cocci', count: 12, interval: 900 }, { id: 'bacteria_rod', count: 6, interval: 1200 }, { id: 'virus_basic', count: 6, interval: 1200 }, { id: 'prion_cluster', count: 3, interval: 4000 }, { id: 'superbug', count: 3, interval: 5000 }, { id: 'virus_corona', count: 3, interval: 3000 }] },
    // Wave 10 — Boss + opening minion wave
    { spawns: [{ id: 'bacteria_cocci', count: 6, interval: 1000 }, { id: 'boss_cancer', count: 1, interval: 0 }], isBossWave: true, special: 'boss' }
  ];

  let currentWave = 0;
  let spawnQueues = [];
  let spawnTimers = [];
  let waveActive = false;
  let waveEnemiesRemaining = 0;
  let onWaveComplete = null;
  let canvasW = 0, canvasH = 0;
  let totalWaves = 10;
  let waveSurvived = 0;

  function init(w, h, completeCallback) {
    currentWave = 0;
    waveActive = false;
    waveEnemiesRemaining = 0;
    spawnQueues = [];
    spawnTimers = [];
    onWaveComplete = completeCallback;
    canvasW = w;
    canvasH = h;
    waveSurvived = 0;
  }

  function startWave(waveIndex) {
    currentWave = waveIndex;
    const config = WAVE_CONFIGS[waveIndex];
    if (!config) return false;
    waveActive = true;
    spawnQueues = [];
    spawnTimers = [];
    waveEnemiesRemaining = 0;

    config.spawns.forEach(spawnDef => {
      spawnQueues.push({ ...spawnDef, remaining: spawnDef.count });
      spawnTimers.push(spawnDef.interval === 0 ? 0 : spawnDef.interval);
      waveEnemiesRemaining += spawnDef.count;
    });
    return true;
  }

  function update(dt, canvasW, canvasH) {
    if (!waveActive) return;

    let allQueuesEmpty = true;
    for (let i = 0; i < spawnQueues.length; i++) {
      const q = spawnQueues[i];
      if (q.remaining <= 0) continue;
      allQueuesEmpty = false;
      spawnTimers[i] -= dt * 1000;
      if (spawnTimers[i] <= 0) {
        spawnTimers[i] = q.interval || 100;
        Enemies.spawnEdge(q.id, canvasW, canvasH);
        q.remaining--;
      }
    }

    // Check if wave is done (all spawned and all enemies dead)
    if (allQueuesEmpty && Enemies.getActive().length === 0) {
      waveActive = false;
      waveSurvived++;
      if (onWaveComplete) onWaveComplete(currentWave);
    }
  }

  function getCurrentWave() { return currentWave; }
  function getTotalWaves() { return totalWaves; }
  function isWaveActive() { return waveActive; }
  function isBossWave() { return currentWave === 9; }
  function isLastWave() { return currentWave >= totalWaves - 1; }
  function getConfig(waveIndex) { return WAVE_CONFIGS[waveIndex] || null; }
  function getTierForWave(waveIndex) {
    if (waveIndex <= 3) return 1;
    if (waveIndex <= 8) return [1, 2];
    return [1, 2, 3];
  }
  function getWaveSurvived() { return waveSurvived; }
  function isWave1Only() { return currentWave === 0; }

  return {
    init, startWave, update, getCurrentWave, getTotalWaves, isWaveActive,
    isBossWave, isLastWave, getConfig, getTierForWave, getWaveSurvived, isWave1Only,
    WAVE_CONFIGS
  };
})();
