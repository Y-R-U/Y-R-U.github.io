// waves.js — Wave/stage progression
const Waves = (() => {
  const WAVE_CONFIGS = [
    // Wave 1
    { spawns: [{ id: 'bacteria_cocci', count: 6, interval: 2000 }], special: 'tutorial' },
    // Wave 2
    { spawns: [{ id: 'bacteria_cocci', count: 5, interval: 1800 }, { id: 'bacteria_rod', count: 3, interval: 2500 }] },
    // Wave 3
    { spawns: [{ id: 'bacteria_cocci', count: 6, interval: 1600 }, { id: 'bacteria_rod', count: 3, interval: 2000 }, { id: 'virus_basic', count: 3, interval: 2200 }], elite: true },
    // Wave 4
    { spawns: [{ id: 'bacteria_cocci', count: 8, interval: 1500 }, { id: 'bacteria_rod', count: 4, interval: 1800 }, { id: 'virus_basic', count: 4, interval: 2000 }], miniBoss: 'bacteria_cocci' },
    // Wave 5
    { spawns: [{ id: 'bacteria_cocci', count: 5, interval: 1500 }, { id: 'fungus_spore', count: 3, interval: 3000 }, { id: 'bacteria_spiral', count: 3, interval: 2500 }] },
    // Wave 6
    { spawns: [{ id: 'bacteria_rod', count: 4, interval: 1600 }, { id: 'fungus_spore', count: 3, interval: 2500 }, { id: 'virus_corona', count: 2, interval: 5000 }, { id: 'parasite_hook', count: 2, interval: 3000 }] },
    // Wave 7
    { spawns: [{ id: 'bacteria_cocci', count: 10, interval: 1000 }, { id: 'parasite_hook', count: 4, interval: 2500 }, { id: 'bacteria_spiral', count: 4, interval: 2000 }] },
    // Wave 8
    { spawns: [{ id: 'prion_cluster', count: 2, interval: 5000 }, { id: 'superbug', count: 2, interval: 6000 }, { id: 'virus_corona', count: 3, interval: 3000 }, { id: 'fungus_spore', count: 4, interval: 2500 }] },
    // Wave 9
    { spawns: [{ id: 'bacteria_cocci', count: 8, interval: 1000 }, { id: 'bacteria_rod', count: 5, interval: 1400 }, { id: 'virus_basic', count: 5, interval: 1500 }, { id: 'prion_cluster', count: 2, interval: 5000 }, { id: 'superbug', count: 2, interval: 6000 }] },
    // Wave 10 — Boss
    { spawns: [{ id: 'boss_cancer', count: 1, interval: 0 }], isBossWave: true, special: 'boss' }
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
