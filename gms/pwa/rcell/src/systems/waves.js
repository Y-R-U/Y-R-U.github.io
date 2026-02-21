// waves.js — Wave/stage progression
const Waves = (() => {
  // Boss wave indices (0-based)
  const BOSS_WAVES = new Set([9, 14, 19, 24]);

  const WAVE_CONFIGS = [
    // === WAVES 1–5 : Tutorial → Early Game ===
    // Wave 1
    { spawns: [{ id: 'bacteria_cocci', count: 8, interval: 1800 }, { id: 'bacteria_rod', count: 2, interval: 2500 }], special: 'tutorial' },
    // Wave 2
    { spawns: [{ id: 'bacteria_cocci', count: 8, interval: 1600 }, { id: 'bacteria_rod', count: 4, interval: 2200 }, { id: 'virus_basic', count: 3, interval: 2000 }] },
    // Wave 3
    { spawns: [{ id: 'bacteria_cocci', count: 10, interval: 1400 }, { id: 'bacteria_rod', count: 4, interval: 1800 }, { id: 'virus_basic', count: 4, interval: 1800 }, { id: 'fungus_spore', count: 2, interval: 4000 }] },
    // Wave 4
    { spawns: [{ id: 'bacteria_cocci', count: 10, interval: 1300 }, { id: 'bacteria_rod', count: 5, interval: 1600 }, { id: 'fungus_spore', count: 3, interval: 3000 }, { id: 'parasite_hook', count: 2, interval: 3500 }] },
    // Wave 5
    { spawns: [{ id: 'bacteria_cocci', count: 8, interval: 1200 }, { id: 'fungus_spore', count: 4, interval: 2500 }, { id: 'bacteria_spiral', count: 5, interval: 2000 }, { id: 'parasite_hook', count: 3, interval: 2800 }] },

    // === WAVES 6–9 : Mid Game ===
    // Wave 6
    { spawns: [{ id: 'bacteria_rod', count: 6, interval: 1400 }, { id: 'fungus_spore', count: 4, interval: 2200 }, { id: 'virus_corona', count: 3, interval: 4000 }, { id: 'parasite_hook', count: 4, interval: 2500 }, { id: 'bacteria_spiral', count: 4, interval: 2000 }] },
    // Wave 7
    { spawns: [{ id: 'bacteria_cocci', count: 14, interval: 900 }, { id: 'parasite_hook', count: 5, interval: 2200 }, { id: 'bacteria_spiral', count: 5, interval: 1800 }, { id: 'virus_corona', count: 3, interval: 3500 }] },
    // Wave 8
    { spawns: [{ id: 'prion_cluster', count: 3, interval: 4000 }, { id: 'superbug', count: 3, interval: 5000 }, { id: 'virus_corona', count: 4, interval: 2800 }, { id: 'fungus_spore', count: 5, interval: 2200 }, { id: 'bacteria_spiral', count: 5, interval: 1600 }] },
    // Wave 9
    { spawns: [{ id: 'bacteria_cocci', count: 12, interval: 900 }, { id: 'bacteria_rod', count: 6, interval: 1200 }, { id: 'virus_basic', count: 6, interval: 1200 }, { id: 'prion_cluster', count: 3, interval: 4000 }, { id: 'superbug', count: 3, interval: 5000 }, { id: 'virus_corona', count: 3, interval: 3000 }] },

    // === WAVE 10 : BOSS #1 ===
    { spawns: [{ id: 'bacteria_cocci', count: 6, interval: 1000 }, { id: 'boss_cancer', count: 1, interval: 0 }], isBossWave: true, special: 'boss' },

    // === WAVES 11–14 : Late Game — HP/damage scales every wave ===
    // Wave 11
    { spawns: [{ id: 'bacteria_cocci', count: 15, interval: 800 }, { id: 'bacteria_rod', count: 8, interval: 1100 }, { id: 'virus_corona', count: 4, interval: 2500 }, { id: 'fungus_spore', count: 4, interval: 2000 }] },
    // Wave 12
    { spawns: [{ id: 'prion_cluster', count: 4, interval: 3500 }, { id: 'superbug', count: 4, interval: 4500 }, { id: 'bacteria_spiral', count: 8, interval: 1500 }, { id: 'parasite_hook', count: 6, interval: 2000 }] },
    // Wave 13
    { spawns: [{ id: 'bacteria_cocci', count: 18, interval: 700 }, { id: 'virus_corona', count: 5, interval: 2200 }, { id: 'prion_cluster', count: 4, interval: 3000 }, { id: 'superbug', count: 4, interval: 4000 }, { id: 'bacteria_spiral', count: 6, interval: 1400 }] },
    // Wave 14
    { spawns: [{ id: 'superbug', count: 6, interval: 3500 }, { id: 'prion_cluster', count: 5, interval: 3000 }, { id: 'virus_corona', count: 6, interval: 2000 }, { id: 'parasite_hook', count: 8, interval: 1800 }] },

    // === WAVE 15 : BOSS #2 (3 500 HP) ===
    { spawns: [{ id: 'bacteria_cocci', count: 8, interval: 900 }, { id: 'superbug', count: 2, interval: 5000 }, { id: 'boss_cancer', count: 1, interval: 0, overrides: { hp: 3500, maxHp: 3500, minionInterval: 2500, speed: 45 } }], isBossWave: true, special: 'boss' },

    // === WAVES 16–19 : Brutal ===
    // Wave 16
    { spawns: [{ id: 'bacteria_cocci', count: 20, interval: 650 }, { id: 'virus_corona', count: 6, interval: 2000 }, { id: 'prion_cluster', count: 5, interval: 2800 }, { id: 'superbug', count: 5, interval: 3500 }] },
    // Wave 17
    { spawns: [{ id: 'superbug', count: 8, interval: 3000 }, { id: 'prion_cluster', count: 6, interval: 2800 }, { id: 'bacteria_spiral', count: 10, interval: 1200 }, { id: 'virus_corona', count: 6, interval: 1800 }] },
    // Wave 18
    { spawns: [{ id: 'bacteria_cocci', count: 25, interval: 550 }, { id: 'parasite_hook', count: 10, interval: 1600 }, { id: 'virus_corona', count: 8, interval: 1800 }, { id: 'prion_cluster', count: 5, interval: 2500 }] },
    // Wave 19
    { spawns: [{ id: 'superbug', count: 10, interval: 2500 }, { id: 'prion_cluster', count: 8, interval: 2200 }, { id: 'virus_corona', count: 8, interval: 1600 }, { id: 'bacteria_spiral', count: 12, interval: 1100 }, { id: 'parasite_hook', count: 10, interval: 1500 }] },

    // === WAVE 20 : BOSS #3 (5 500 HP) ===
    { spawns: [{ id: 'superbug', count: 3, interval: 4000 }, { id: 'prion_cluster', count: 2, interval: 5000 }, { id: 'boss_cancer', count: 1, interval: 0, overrides: { hp: 5500, maxHp: 5500, minionInterval: 1800, speed: 50 } }], isBossWave: true, special: 'boss' },

    // === WAVES 21–24 : Near-impossible without heavy meta investment ===
    // Wave 21
    { spawns: [{ id: 'bacteria_cocci', count: 30, interval: 500 }, { id: 'superbug', count: 10, interval: 2500 }, { id: 'prion_cluster', count: 8, interval: 2200 }, { id: 'virus_corona', count: 10, interval: 1500 }] },
    // Wave 22
    { spawns: [{ id: 'superbug', count: 12, interval: 2200 }, { id: 'prion_cluster', count: 10, interval: 2000 }, { id: 'parasite_hook', count: 15, interval: 1300 }, { id: 'bacteria_spiral', count: 14, interval: 1000 }] },
    // Wave 23
    { spawns: [{ id: 'bacteria_cocci', count: 35, interval: 450 }, { id: 'virus_corona', count: 12, interval: 1300 }, { id: 'superbug', count: 12, interval: 2200 }, { id: 'prion_cluster', count: 10, interval: 2000 }, { id: 'parasite_hook', count: 12, interval: 1300 }] },
    // Wave 24
    { spawns: [{ id: 'superbug', count: 15, interval: 2000 }, { id: 'prion_cluster', count: 12, interval: 1800 }, { id: 'virus_corona', count: 14, interval: 1200 }, { id: 'bacteria_spiral', count: 18, interval: 900 }, { id: 'parasite_hook', count: 14, interval: 1200 }] },

    // === WAVE 25 : FINAL BOSS (9 000 HP, rapid minions) ===
    { spawns: [{ id: 'superbug', count: 4, interval: 3000 }, { id: 'prion_cluster', count: 3, interval: 4000 }, { id: 'boss_cancer', count: 1, interval: 0, overrides: { hp: 9000, maxHp: 9000, minionInterval: 1200, speed: 55, growthRate: 0.005, maxRadius: 110 } }], isBossWave: true, special: 'boss' }
  ];

  let currentWave = 0;
  let spawnQueues = [];
  let spawnTimers = [];
  let waveActive = false;
  let waveEnemiesRemaining = 0;
  let onWaveComplete = null;
  let canvasW = 0, canvasH = 0;
  let totalWaves = 25;
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

    // Waves 11+ (index 10+) scale enemy toughness. Every wave past 10 adds 18% to HP
    // and 12% to contact damage — only meta defence upgrades soften this pressure.
    const diffWave = Math.max(0, currentWave - 9); // 0 for waves 1-10, 1 for wave 11, etc.
    const hpMult   = 1 + diffWave * 0.18;
    const dmgMult  = 1 + diffWave * 0.12;

    let allQueuesEmpty = true;
    for (let i = 0; i < spawnQueues.length; i++) {
      const q = spawnQueues[i];
      if (q.remaining <= 0) continue;
      allQueuesEmpty = false;
      spawnTimers[i] -= dt * 1000;
      if (spawnTimers[i] <= 0) {
        spawnTimers[i] = q.interval || 100;

        // Support per-spawn overrides (used for boss HP scaling between encounters)
        const enemy = Enemies.spawnEdge(q.id, canvasW, canvasH, q.overrides || {});

        // Apply wave difficulty scaling to non-boss enemies in late game
        if (enemy && diffWave > 0 && !enemy.isBoss) {
          enemy.hp      = Math.ceil(enemy.hp      * hpMult);
          enemy.maxHp   = Math.ceil(enemy.maxHp   * hpMult);
          enemy.damage  = enemy.damage * dmgMult;
        }

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
  function isBossWave() { return BOSS_WAVES.has(currentWave); }
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
