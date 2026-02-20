// test-waves.js — Wave progression tests
(function () {
  const suite = TestRunner.suite('Wave System');

  suite.test('wave 1 config only has Tier 1 enemies', () => {
    const config = Waves.getConfig(0);
    assert(config !== null, 'wave 1 config exists');
    const tier1Ids = ['bacteria_cocci', 'bacteria_rod', 'virus_basic'];
    config.spawns.forEach(s => {
      assert(tier1Ids.includes(s.id), `wave 1 spawn ${s.id} is Tier 1`);
    });
  });

  suite.test('wave 1 only spawns cocci (tutorial)', () => {
    const config = Waves.getConfig(0);
    assert(config.spawns.length === 1, 'wave 1 has only 1 spawn group');
    assert(config.spawns[0].id === 'bacteria_cocci', 'wave 1 = cocci only');
    assert(config.special === 'tutorial', 'wave 1 is tutorial');
  });

  suite.test('wave 10 is boss wave', () => {
    const config = Waves.getConfig(9);
    assert(config !== null, 'wave 10 config exists');
    assert(config.isBossWave === true, 'wave 10 is boss wave');
    assert(config.spawns[0].id === 'boss_cancer', 'boss is Neoplasm');
    assert(config.spawns[0].count === 1, 'exactly 1 boss');
  });

  suite.test('wave 5 introduces Tier 2 enemies', () => {
    const config = Waves.getConfig(4);
    const tier2Ids = ['fungus_spore', 'parasite_hook', 'virus_corona', 'bacteria_spiral'];
    const hasTier2 = config.spawns.some(s => tier2Ids.includes(s.id));
    assert(hasTier2, 'wave 5 has tier 2 enemies');
  });

  suite.test('all 10 wave configs exist', () => {
    for (let i = 0; i < 10; i++) {
      const config = Waves.getConfig(i);
      assert(config !== null, `wave ${i + 1} config exists`);
    }
  });

  suite.test('getTotalWaves returns 10', () => {
    assert(Waves.getTotalWaves() === 10, 'total waves = 10');
  });

  suite.test('isLastWave returns false for wave 1', () => {
    // Manually set the internal wave counter
    Waves.init(400, 800, () => {});
    Waves.startWave(0);
    assert(!Waves.isLastWave(), 'wave 0 is not last wave');
  });

  suite.test('isBossWave false for non-boss wave', () => {
    Waves.init(400, 800, () => {});
    Waves.startWave(0);
    assert(!Waves.isBossWave(), 'wave 1 is not boss wave');
  });

  suite.test('isBossWave true for wave 10', () => {
    Waves.init(400, 800, () => {});
    Waves.startWave(9);
    assert(Waves.isBossWave(), 'wave 10 is boss wave');
  });

  suite.test('wave 2 has cocci and rod', () => {
    const config = Waves.getConfig(1);
    const ids = config.spawns.map(s => s.id);
    assert(ids.includes('bacteria_cocci'), 'wave 2 has cocci');
    assert(ids.includes('bacteria_rod'), 'wave 2 has rod');
  });

  suite.test('wave 6 includes coronavirus', () => {
    const config = Waves.getConfig(5);
    const ids = config.spawns.map(s => s.id);
    assert(ids.includes('virus_corona'), 'wave 6 has coronavirus');
  });

  suite.test('WAVE_CONFIGS has 10 entries', () => {
    assert(Waves.WAVE_CONFIGS.length === 10, 'WAVE_CONFIGS.length = 10');
  });

  suite.test('getTierForWave returns tier 1 for wave 1-4', () => {
    assert(Waves.getTierForWave(0) === 1, 'wave 1 = tier 1');
    assert(Waves.getTierForWave(3) === 1, 'wave 4 = tier 1');
  });

  suite.test('getTierForWave returns mixed tiers for wave 5-9', () => {
    const tier = Waves.getTierForWave(4);
    assert(Array.isArray(tier), 'wave 5 returns array');
    assert(tier.includes(1) && tier.includes(2), 'wave 5 includes tier 1 and 2');
  });

  suite.run();
})();
