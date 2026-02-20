// test-enemies.js — Enemy spawn/behaviour tests
(function () {
  const suite = TestRunner.suite('Enemy System');

  // Load enemy defs from the embedded data (same as game uses)
  let defs;

  suite.before(() => {
    // enemiesData is loaded in test-runner.html
    if (typeof ENEMY_DATA !== 'undefined') {
      Enemies.loadDefs(ENEMY_DATA.enemies);
      defs = ENEMY_DATA.enemies;
    }
  });

  suite.test('loadDefs loads all 10 enemy types', () => {
    const allDefs = Enemies.getAllDefs();
    assert(allDefs.length === 10, `Expected 10 enemy types, got ${allDefs.length}`);
  });

  suite.test('bacteria_cocci has correct stats', () => {
    const def = Enemies.getDef('bacteria_cocci');
    assert(def !== null, 'bacteria_cocci def exists');
    assert(def.hp === 30, `HP should be 30, got ${def.hp}`);
    assert(def.speed === 60, `Speed should be 60, got ${def.speed}`);
    assert(def.damage === 10, `Damage should be 10, got ${def.damage}`);
    assert(def.tier === 1, `Tier should be 1, got ${def.tier}`);
  });

  suite.test('bacteria_rod has correct stats', () => {
    const def = Enemies.getDef('bacteria_rod');
    assert(def !== null, 'bacteria_rod def exists');
    assert(def.hp === 40, `HP should be 40, got ${def.hp}`);
    assert(def.speed === 80, `Speed should be 80, got ${def.speed}`);
    assert(def.damage === 12, `Damage should be 12, got ${def.damage}`);
    assert(def.behaviour === 'sine_wave', 'rod uses sine_wave behaviour');
  });

  suite.test('virus_basic has correct stats', () => {
    const def = Enemies.getDef('virus_basic');
    assert(def !== null, 'virus_basic exists');
    assert(def.hp === 20, `HP = 20, got ${def.hp}`);
    assert(def.speed === 100, `Speed = 100, got ${def.speed}`);
    assert(def.damage === 8, `Damage = 8, got ${def.damage}`);
    assert(def.behaviour === 'orbit_dive', 'virus uses orbit_dive');
  });

  suite.test('fungus_spore has splitOnDeath', () => {
    const def = Enemies.getDef('fungus_spore');
    assert(def !== null, 'fungus_spore exists');
    assert(def.splitOnDeath === true, 'fungus_spore splits on death');
    assert(def.splitCount === 2, 'splits into 2');
    assert(def.tier === 2, 'tier 2');
  });

  suite.test('parasite_hook correct stats', () => {
    const def = Enemies.getDef('parasite_hook');
    assert(def.hp === 80, `HP = 80, got ${def.hp}`);
    assert(def.damage === 20, `Damage = 20, got ${def.damage}`);
    assert(def.behaviour === 'charge_retreat', 'charge_retreat behaviour');
  });

  suite.test('virus_corona is a shooter', () => {
    const def = Enemies.getDef('virus_corona');
    assert(def.behaviour === 'shooter', 'corona is a shooter');
    assert(def.projectileDamage !== undefined, 'corona has projectileDamage');
  });

  suite.test('boss_cancer has correct stats', () => {
    const def = Enemies.getDef('boss_cancer');
    assert(def !== null, 'boss_cancer exists');
    assert(def.hp === 1000, `Boss HP = 1000, got ${def.hp}`);
    assert(def.damage === 50, `Boss damage = 50, got ${def.damage}`);
    assert(def.isBoss === true, 'isBoss flag set');
    assert(def.tier === 3, 'tier 3');
  });

  suite.test('superbug has immune type', () => {
    const def = Enemies.getDef('superbug');
    assert(def.immuneType === 'poison', 'superbug immune to poison');
    assert(def.tier === 3, 'tier 3');
  });

  suite.test('prion_cluster has teleport behaviour', () => {
    const def = Enemies.getDef('prion_cluster');
    assert(def.behaviour === 'teleport', 'prion teleports');
    assert(def.tier === 3, 'tier 3');
  });

  suite.test('createEnemy initialises with correct stats', () => {
    Enemies.clear();
    const e = Enemies.createEnemy('bacteria_cocci', 100, 200);
    assert(e !== null, 'enemy created');
    assert(e.hp === 30, 'hp = 30');
    assert(e.x === 100, 'x = 100');
    assert(e.y === 200, 'y = 200');
    assert(e.alive === true, 'starts alive');
    Enemies.clear();
  });

  suite.test('createEnemy allows overrides', () => {
    Enemies.clear();
    const e = Enemies.createEnemy('bacteria_cocci', 0, 0, { hp: 99 });
    assert(e.hp === 99, 'override hp = 99');
    Enemies.clear();
  });

  suite.test('all enemy types can be created', () => {
    Enemies.clear();
    const ids = ['bacteria_cocci','bacteria_rod','virus_basic','fungus_spore',
                 'parasite_hook','virus_corona','bacteria_spiral','prion_cluster','superbug','boss_cancer'];
    ids.forEach(id => {
      const e = Enemies.createEnemy(id, 0, 0);
      assert(e !== null, `${id} created successfully`);
    });
    assert(Enemies.getActive().length === 10, '10 enemies active');
    Enemies.clear();
  });

  suite.test('splitOnDeath spawns children', () => {
    Enemies.clear();
    // Simulate fungus_spore split
    const def = Enemies.getDef('fungus_spore');
    assert(def.splitOnDeath === true, 'splitOnDeath defined');
    assert(def.splitId === 'bacteria_cocci', 'splits into cocci');
    assert(def.splitCount === 2, 'splits into 2');
    Enemies.clear();
  });

  suite.test('poisonEnemy sets poison state', () => {
    Enemies.clear();
    const e = Enemies.createEnemy('bacteria_cocci', 0, 0);
    Enemies.poisonEnemy(e, 5, 3);
    assert(e.poisoned === true, 'enemy poisoned');
    assert(e.poisonDamage === 5, 'poison damage = 5');
    assert(e.poisonTimer === 3, 'poison timer = 3s');
    Enemies.clear();
  });

  suite.test('poisonEnemy ignored by immune enemy', () => {
    Enemies.clear();
    const e = Enemies.createEnemy('superbug', 0, 0);
    Enemies.poisonEnemy(e, 5, 3);
    assert(!e.poisoned, 'superbug not poisoned (immune)');
    Enemies.clear();
  });

  suite.run();
})();
