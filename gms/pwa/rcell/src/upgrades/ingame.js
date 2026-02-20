// ingame.js — In-run upgrade definitions & effects
const InGameUpgrades = (() => {
  let upgradeData = [];
  let playerUpgrades = []; // IDs of currently held upgrades

  function loadData(data) {
    upgradeData = data;
  }

  function getAll() { return upgradeData; }

  function getById(id) {
    return upgradeData.find(u => u.id === id) || null;
  }

  function getPlayerUpgrades() { return playerUpgrades.slice(); }

  function hasUpgrade(id) {
    return playerUpgrades.includes(id);
  }

  function countUpgrade(id) {
    return playerUpgrades.filter(u => u === id).length;
  }

  function applyUpgrade(upgradeId) {
    const upgrade = getById(upgradeId);
    if (!upgrade) return false;

    const alreadyHeld = hasUpgrade(upgradeId);
    const hasMacrophageMemory = Player.hasUpgrade('macrophage_memory');

    // macrophage_memory: doubled effect if already held
    const isDoubled = alreadyHeld && hasMacrophageMemory;

    Player.applyUpgrade(upgrade, isDoubled);
    playerUpgrades.push(upgradeId);

    return true;
  }

  function getRandomPicks(count, excludeOvercapped) {
    const available = upgradeData.filter(u => {
      // Filter out upgrades that can't stack further (optional)
      return true;
    });

    const shuffled = MathUtils.shuffle(available);
    return shuffled.slice(0, count);
  }

  function reset() {
    playerUpgrades = [];
  }

  function getTierLabel(category) {
    const map = {
      offensive: 'Offensive',
      defensive: 'Defensive',
      mobility: 'Mobility',
      utility: 'Utility'
    };
    return map[category] || category;
  }

  return {
    loadData, getAll, getById, getPlayerUpgrades, hasUpgrade, countUpgrade,
    applyUpgrade, getRandomPicks, reset, getTierLabel
  };
})();
