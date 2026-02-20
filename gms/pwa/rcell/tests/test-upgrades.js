// test-upgrades.js — Upgrade path effect validation
(function () {
  const suite = TestRunner.suite('In-Game Upgrades');

  function freshPlayer() {
    return Player.init({});
  }

  suite.test('all 35 upgrades defined', () => {
    const all = InGameUpgrades.getAll();
    assert(all.length === 35, `Expected 35 upgrades, got ${all.length}`);
  });

  suite.test('antibody_burst: increments projectileCount by 1', () => {
    freshPlayer();
    const before = Player.getState().projectileCount;
    InGameUpgrades.applyUpgrade('antibody_burst');
    const after = Player.getState().projectileCount;
    assert(after === before + 1, `projectileCount: ${before} → ${after}, expected +1`);
  });

  suite.test('igm_spread: adds 15 to spreadAngle', () => {
    freshPlayer();
    const before = Player.getState().spreadAngle;
    InGameUpgrades.applyUpgrade('igm_spread');
    const after = Player.getState().spreadAngle;
    assert(after === before + 15, `spreadAngle: ${before} → ${after}, expected +15`);
  });

  suite.test('cytotoxin_coat: adds poison damage', () => {
    freshPlayer();
    InGameUpgrades.applyUpgrade('cytotoxin_coat');
    const state = Player.getState();
    assert(state.poisonDamage === 5, `poisonDamage should be 5, got ${state.poisonDamage}`);
    assert(state.poisonDuration === 3, `poisonDuration should be 3, got ${state.poisonDuration}`);
  });

  suite.test('complement_chain: increments chainCount', () => {
    freshPlayer();
    InGameUpgrades.applyUpgrade('complement_chain');
    assert(Player.getState().chainCount === 1, 'chainCount = 1');
  });

  suite.test('nk_strike: adds crit chance', () => {
    freshPlayer();
    InGameUpgrades.applyUpgrade('nk_strike');
    const state = Player.getState();
    assert(Math.abs(state.critChance - 0.1) < 0.001, `critChance should be 0.1, got ${state.critChance}`);
  });

  suite.test('membrane_tough: adds 20 max HP', () => {
    freshPlayer();
    const before = Player.getState().maxHp;
    InGameUpgrades.applyUpgrade('membrane_tough');
    const after = Player.getState().maxHp;
    assert(after === before + 20, `maxHp: ${before} → ${after}, expected +20`);
  });

  suite.test('regen_factor: adds 2 HP/s', () => {
    freshPlayer();
    InGameUpgrades.applyUpgrade('regen_factor');
    assert(Player.getState().hpRegen === 2, `hpRegen = 2`);
  });

  suite.test('cytokine_shield: adds 3 shield charges', () => {
    freshPlayer();
    InGameUpgrades.applyUpgrade('cytokine_shield');
    assert(Player.getState().shieldCharges === 3, 'shieldCharges = 3');
  });

  suite.test('pseudopod_speed: multiplies speedMultiplier by 1.2', () => {
    freshPlayer();
    const before = Player.getState().speedMultiplier;
    InGameUpgrades.applyUpgrade('pseudopod_speed');
    const after = Player.getState().speedMultiplier;
    assert(Math.abs(after - before * 1.2) < 0.001, `speedMultiplier: ${before} → ${after}`);
  });

  suite.test('rapid_mitosis: reduces fireRateMultiplier to 0.7', () => {
    freshPlayer();
    InGameUpgrades.applyUpgrade('rapid_mitosis');
    const after = Player.getState().fireRateMultiplier;
    assert(Math.abs(after - 0.7) < 0.01, `fireRateMultiplier should be 0.7, got ${after}`);
  });

  suite.test('receptor_boost: multiplies pickupRadius by 1.5', () => {
    freshPlayer();
    const before = Player.getState().pickupRadius;
    InGameUpgrades.applyUpgrade('receptor_boost');
    const after = Player.getState().pickupRadius;
    assert(Math.abs(after - before * 1.5) < 0.01, `pickupRadius multiplied`);
  });

  suite.test('amoeboid_form: reduces radiusMultiplier to 0.75', () => {
    freshPlayer();
    const before = Player.getState().radiusMultiplier;
    InGameUpgrades.applyUpgrade('amoeboid_form');
    const after = Player.getState().radiusMultiplier;
    assert(Math.abs(after - before * 0.75) < 0.01, `radiusMultiplier reduced by 25%`);
  });

  suite.test('macrophage_memory: sets flag', () => {
    freshPlayer();
    InGameUpgrades.applyUpgrade('macrophage_memory');
    assert(Player.getState().macrophageMemory === true, 'macrophageMemory flag set');
  });

  suite.test('stem_cell_call: adds helperCells', () => {
    freshPlayer();
    const before = Player.getState().helperCells;
    InGameUpgrades.applyUpgrade('stem_cell_call');
    assert(Player.getState().helperCells === before + 1, 'helperCells +1');
  });

  suite.test('clonal_expansion: adds to nextPickCount', () => {
    freshPlayer();
    const before = Player.getState().nextPickCount || 0;
    InGameUpgrades.applyUpgrade('clonal_expansion');
    assert(Player.getState().nextPickCount === before + 2, 'nextPickCount +2');
  });

  suite.test('heat_shock: adds dodge chance', () => {
    freshPlayer();
    InGameUpgrades.applyUpgrade('heat_shock');
    assert(Math.abs(Player.getState().dodgeChance - 0.2) < 0.001, 'dodgeChance = 0.2');
  });

  suite.test('interferon_wave: sets aoeInterval', () => {
    freshPlayer();
    InGameUpgrades.applyUpgrade('interferon_wave');
    assert(Player.getState().aoeInterval === 8000, 'aoeInterval = 8000');
  });

  suite.test('lysozyme_field: adds auraDamage', () => {
    freshPlayer();
    InGameUpgrades.applyUpgrade('lysozyme_field');
    assert(Player.getState().auraDamage === 3, 'auraDamage = 3');
  });

  suite.test('mast_cell_bomb: adds kill explosion chance', () => {
    freshPlayer();
    InGameUpgrades.applyUpgrade('mast_cell_bomb');
    assert(Math.abs(Player.getState().killExplosionChance - 0.15) < 0.001, 'killExplosionChance = 0.15');
  });

  suite.test('adhesion_molecule: adds damage reduction', () => {
    freshPlayer();
    InGameUpgrades.applyUpgrade('adhesion_molecule');
    assert(Math.abs(Player.getState().damageReduction - 0.1) < 0.001, 'damageReduction = 0.1');
  });

  suite.test('opsonin_mark: adds markDamageBonus', () => {
    freshPlayer();
    InGameUpgrades.applyUpgrade('opsonin_mark');
    assert(Math.abs(Player.getState().markDamageBonus - 0.25) < 0.001, 'markDamageBonus = 0.25');
  });

  // Stacking tests
  suite.test('upgrade stacking: antibody_burst twice = +2 projectiles', () => {
    freshPlayer();
    const base = Player.getState().projectileCount;
    InGameUpgrades.applyUpgrade('antibody_burst');
    InGameUpgrades.applyUpgrade('antibody_burst');
    assert(Player.getState().projectileCount === base + 2, 'double stack = +2');
  });

  suite.test('upgrade stacking: regen_factor twice = 4 HP/s', () => {
    freshPlayer();
    InGameUpgrades.applyUpgrade('regen_factor');
    InGameUpgrades.applyUpgrade('regen_factor');
    assert(Player.getState().hpRegen === 4, 'double regen = 4');
  });

  // macrophage_memory: doubled effect
  suite.test('macrophage_memory: second antibody_burst gives +1.5 instead of +1', () => {
    freshPlayer();
    InGameUpgrades.applyUpgrade('macrophage_memory'); // enable memory
    InGameUpgrades.applyUpgrade('antibody_burst'); // first = +1
    const afterFirst = Player.getState().projectileCount;
    InGameUpgrades.applyUpgrade('antibody_burst'); // second = +1.5 (isDoubled)
    const afterSecond = Player.getState().projectileCount;
    // First: base+1, Second: base+1+1.5 = base+2.5
    assert(afterSecond > afterFirst, 'second upgrade provides benefit');
    // The effect is 1 * 1.5 = 1.5 additional
    assert(Math.abs(afterSecond - afterFirst - 1.5) < 0.01, `macrophage_memory gives 1.5x effect: ${afterSecond - afterFirst}`);
  });

  suite.test('each upgrade has required fields', () => {
    const required = ['id', 'name', 'description', 'category', 'effect'];
    InGameUpgrades.getAll().forEach(u => {
      required.forEach(field => {
        assert(u[field] !== undefined, `upgrade ${u.id} has field ${field}`);
      });
    });
  });

  suite.test('4 categories covered', () => {
    const cats = new Set(InGameUpgrades.getAll().map(u => u.category));
    assert(cats.has('offensive'), 'offensive category exists');
    assert(cats.has('defensive'), 'defensive category exists');
    assert(cats.has('mobility'), 'mobility category exists');
    assert(cats.has('utility'), 'utility category exists');
  });

  suite.test('offensive upgrades: at least 12', () => {
    const count = InGameUpgrades.getAll().filter(u => u.category === 'offensive').length;
    assert(count >= 12, `offensive upgrades >= 12: ${count}`);
  });

  suite.test('defensive upgrades: at least 10', () => {
    const count = InGameUpgrades.getAll().filter(u => u.category === 'defensive').length;
    assert(count >= 10, `defensive upgrades >= 10: ${count}`);
  });

  suite.test('getRandomPicks returns correct count', () => {
    freshPlayer();
    const picks = InGameUpgrades.getRandomPicks(3);
    assert(picks.length === 3, `getRandomPicks(3) returns 3, got ${picks.length}`);
  });

  suite.test('getRandomPicks has no duplicates', () => {
    const picks = InGameUpgrades.getRandomPicks(5);
    const ids = picks.map(p => p.id);
    const unique = new Set(ids);
    assert(unique.size === ids.length, 'no duplicate picks');
  });

  suite.run();
})();
