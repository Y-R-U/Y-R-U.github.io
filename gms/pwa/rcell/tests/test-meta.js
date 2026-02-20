// test-meta.js — Meta-upgrade persistence tests
(function () {
  const suite = TestRunner.suite('Meta Upgrades');

  function freshSave() {
    return {
      version: 1,
      dnaPoints: 100,
      metaUnlocked: [],
      bestWave: 0,
      totalRuns: 0,
      hasWon: false
    };
  }

  suite.before(() => {
    if (typeof META_DATA !== 'undefined') {
      MetaUpgrades.loadData(META_DATA);
    }
  });

  suite.test('all branches loaded (5 branches)', () => {
    const branches = MetaUpgrades.getBranches();
    assert(branches.length === 5, `Expected 5 branches, got ${branches.length}`);
  });

  suite.test('branch IDs are correct', () => {
    const branches = MetaUpgrades.getBranches();
    const ids = branches.map(b => b.id);
    assert(ids.includes('nucleus'), 'nucleus branch');
    assert(ids.includes('cytoplasm'), 'cytoplasm branch');
    assert(ids.includes('membrane'), 'membrane branch');
    assert(ids.includes('lab'), 'lab branch');
    assert(ids.includes('evolution'), 'evolution branch');
  });

  suite.test('all nodes have required fields', () => {
    const nodes = MetaUpgrades.getAllNodes();
    Object.values(nodes).forEach(node => {
      assert(node.id !== undefined, `node has id`);
      assert(node.cost !== undefined, `node ${node.id} has cost`);
      assert(Array.isArray(node.requires), `node ${node.id} has requires array`);
      assert(node.effect !== undefined, `node ${node.id} has effect`);
    });
  });

  suite.test('base_hp has no prerequisites', () => {
    const node = MetaUpgrades.getNode('base_hp');
    assert(node !== null, 'base_hp exists');
    assert(node.requires.length === 0, 'base_hp has no prereqs');
  });

  suite.test('hp_regen requires base_hp', () => {
    const node = MetaUpgrades.getNode('hp_regen');
    assert(node.requires.includes('base_hp'), 'hp_regen requires base_hp');
  });

  suite.test('canUnlock root node with no prereqs', () => {
    const save = freshSave();
    MetaUpgrades.setSaveState(save);
    assert(MetaUpgrades.canUnlock('base_hp'), 'can unlock base_hp (no prereqs)');
  });

  suite.test('cannot unlock child without parent', () => {
    const save = freshSave();
    MetaUpgrades.setSaveState(save);
    assert(!MetaUpgrades.canUnlock('hp_regen'), 'cannot unlock hp_regen without base_hp');
  });

  suite.test('can unlock child after parent unlocked', () => {
    const save = freshSave();
    save.metaUnlocked = ['base_hp'];
    MetaUpgrades.setSaveState(save);
    assert(MetaUpgrades.canUnlock('hp_regen'), 'can unlock hp_regen after base_hp');
  });

  suite.test('unlock deducts DNA points', () => {
    const save = freshSave();
    save.dnaPoints = 50;
    MetaUpgrades.setSaveState(save);
    const node = MetaUpgrades.getNode('base_hp');
    const cost = MetaUpgrades.getEffectiveCost('base_hp');
    const result = MetaUpgrades.unlock('base_hp');
    assert(result.success, `unlock succeeded: ${result.reason}`);
    assert(save.dnaPoints === 50 - cost, `DNA deducted: ${save.dnaPoints}`);
    assert(save.metaUnlocked.includes('base_hp'), 'base_hp in unlocked list');
  });

  suite.test('cannot unlock same node twice', () => {
    const save = freshSave();
    save.metaUnlocked = ['base_hp'];
    MetaUpgrades.setSaveState(save);
    const result = MetaUpgrades.unlock('base_hp');
    assert(!result.success, 'cannot unlock already unlocked node');
  });

  suite.test('unlock fails with insufficient DNA', () => {
    const save = freshSave();
    save.dnaPoints = 0;
    MetaUpgrades.setSaveState(save);
    const result = MetaUpgrades.unlock('base_hp');
    assert(!result.success, 'unlock fails with 0 DNA');
  });

  suite.test('evolution branch requires win', () => {
    const save = freshSave();
    save.hasWon = false;
    MetaUpgrades.setSaveState(save);
    assert(!MetaUpgrades.canUnlock('viral_integration'), 'evolution locked before win');

    save.hasWon = true;
    MetaUpgrades.setSaveState(save);
    assert(MetaUpgrades.canUnlock('viral_integration'), 'evolution unlocked after win');
  });

  suite.test('DNA efficiency discount applies', () => {
    const save = freshSave();
    save.metaUnlocked = ['dna_efficiency'];
    MetaUpgrades.setSaveState(save);
    // dna_efficiency gives -15% cost reduction
    const node = MetaUpgrades.getNode('petri_expansion');
    const baseCost = node.cost;
    const effectiveCost = MetaUpgrades.getEffectiveCost('petri_expansion');
    assert(effectiveCost < baseCost, `effective cost ${effectiveCost} < base cost ${baseCost}`);
    assert(effectiveCost >= Math.ceil(baseCost * 0.85) - 1, 'cost reduction ~15%');
  });

  suite.test('addDNA increases DNA points', () => {
    const save = freshSave();
    save.dnaPoints = 10;
    MetaUpgrades.setSaveState(save);
    MetaUpgrades.addDNA(20);
    assert(save.dnaPoints === 30, `DNA: 10 + 20 = 30, got ${save.dnaPoints}`);
  });

  suite.test('applyMetaToPlayerStats applies base_hp', () => {
    const save = freshSave();
    save.metaUnlocked = ['base_hp'];
    MetaUpgrades.setSaveState(save);
    const stats = MetaUpgrades.applyMetaToPlayerStats({ maxHp: 100 });
    assert(stats.maxHp === 115, `maxHp should be 115 with base_hp, got ${stats.maxHp}`);
  });

  suite.test('applyMetaToPlayerStats stacks multiple nodes', () => {
    const save = freshSave();
    save.metaUnlocked = ['base_hp', 'hp_regen'];
    MetaUpgrades.setSaveState(save);
    const stats = MetaUpgrades.applyMetaToPlayerStats({ maxHp: 100, hpRegen: 0 });
    assert(stats.maxHp === 115, `maxHp = 115`);
    assert(stats.hpRegen === 1, `hpRegen = 1`);
  });

  // Storage tests
  suite.test('storage save and load round-trip', () => {
    const testKey = 'rcell_test_v1';
    const testData = { version: 1, dnaPoints: 42, metaUnlocked: ['base_hp'], bestWave: 5 };
    localStorage.setItem(testKey, JSON.stringify(testData));
    const loaded = JSON.parse(localStorage.getItem(testKey));
    assert(loaded.dnaPoints === 42, 'dnaPoints preserved');
    assert(loaded.metaUnlocked.includes('base_hp'), 'metaUnlocked preserved');
    assert(loaded.bestWave === 5, 'bestWave preserved');
    localStorage.removeItem(testKey);
  });

  suite.test('Storage.save and Storage.loadOrDefault work', () => {
    const save = freshSave();
    save.dnaPoints = 99;
    save.bestWave = 7;
    Storage.save(save);
    const loaded = Storage.loadOrDefault();
    assert(loaded.dnaPoints === 99, `dnaPoints = 99, got ${loaded.dnaPoints}`);
    assert(loaded.bestWave === 7, `bestWave = 7, got ${loaded.bestWave}`);
    Storage.clear();
  });

  suite.test('Storage.loadOrDefault returns defaults when no save', () => {
    Storage.clear();
    const loaded = Storage.loadOrDefault();
    assert(loaded.dnaPoints === 0, 'default dnaPoints = 0');
    assert(Array.isArray(loaded.metaUnlocked), 'metaUnlocked is array');
    assert(loaded.metaUnlocked.length === 0, 'metaUnlocked is empty');
  });

  suite.test('total nodes >= 26 (5 branches × avg 5 nodes)', () => {
    const allNodes = MetaUpgrades.getAllNodes();
    const count = Object.keys(allNodes).length;
    assert(count >= 26, `Total meta nodes >= 26: ${count}`);
  });

  suite.run();
})();
