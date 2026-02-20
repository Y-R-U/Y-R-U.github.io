// meta.js — Persistent meta-upgrade tree
const MetaUpgrades = (() => {
  let branchData = [];
  let allNodes = {};
  let saveState = null;

  function loadData(data) {
    branchData = data.branches;
    allNodes = {};
    branchData.forEach(branch => {
      branch.nodes.forEach(node => {
        allNodes[node.id] = { ...node, branch: branch.id };
      });
    });
  }

  function getBranches() { return branchData; }
  function getAllNodes() { return allNodes; }
  function getNode(id) { return allNodes[id] || null; }

  function setSaveState(state) {
    saveState = state;
  }

  function isUnlocked(nodeId) {
    if (!saveState) return false;
    return saveState.metaUnlocked.includes(nodeId);
  }

  function canUnlock(nodeId) {
    const node = allNodes[nodeId];
    if (!node) return false;
    if (isUnlocked(nodeId)) return false;

    // Check branch prestige requirement
    const branch = branchData.find(b => b.id === node.branch);
    if (branch && branch.requiresWin && !saveState.hasWon) return false;

    // Check prerequisite nodes
    for (const reqId of node.requires) {
      if (!isUnlocked(reqId)) return false;
    }
    return true;
  }

  function getEffectiveCost(nodeId) {
    const node = allNodes[nodeId];
    if (!node) return Infinity;
    let cost = node.cost;
    // DNA efficiency discount
    const costReduction = getMetaStat('metaCostReduction');
    if (costReduction > 0) cost = Math.max(1, Math.ceil(cost * (1 - costReduction)));
    return cost;
  }

  function unlock(nodeId) {
    if (!saveState) return { success: false, reason: 'No save state' };
    if (!canUnlock(nodeId)) return { success: false, reason: 'Prerequisites not met' };
    const cost = getEffectiveCost(nodeId);
    if (saveState.dnaPoints < cost) return { success: false, reason: 'Insufficient DNA' };

    saveState.dnaPoints -= cost;
    saveState.metaUnlocked.push(nodeId);
    return { success: true };
  }

  // Get combined stat from all unlocked meta upgrades
  function getMetaStat(statName) {
    let total = 0;
    for (const nodeId of (saveState ? saveState.metaUnlocked : [])) {
      const node = allNodes[nodeId];
      if (!node) continue;
      if (node.effect.stat === statName) {
        if (node.effect.op === 'add') total += node.effect.value;
      }
    }
    return total;
  }

  function applyMetaToPlayerStats(baseStats) {
    const result = { ...baseStats };
    if (!saveState) return result;

    for (const nodeId of saveState.metaUnlocked) {
      const node = allNodes[nodeId];
      if (!node) continue;
      const { stat, op, value } = node.effect;

      if (op === 'add') {
        result[stat] = (result[stat] || 0) + value;
      } else if (op === 'multiply') {
        result[stat] = (result[stat] || 1) * value;
      } else if (op === 'set') {
        result[stat] = value;
      }
    }

    // Clamp hp
    result.hp = result.maxHp;
    return result;
  }

  function getUnlockedIds() {
    return saveState ? saveState.metaUnlocked.slice() : [];
  }

  function getDNAPoints() {
    return saveState ? saveState.dnaPoints : 0;
  }

  function addDNA(amount) {
    if (saveState) saveState.dnaPoints += amount;
  }

  function isPrestigeUnlocked() {
    return saveState && saveState.hasWon;
  }

  function getStartUpgrades() {
    const count = 0;
    if (!saveState) return [];
    const startUpgradeCount = getMetaStat('startUpgrades');
    if (startUpgradeCount <= 0) return [];
    // Return random in-game upgrade IDs
    return [];
  }

  return {
    loadData, getBranches, getAllNodes, getNode, setSaveState, isUnlocked,
    canUnlock, getEffectiveCost, unlock, getMetaStat, applyMetaToPlayerStats,
    getUnlockedIds, getDNAPoints, addDNA, isPrestigeUnlocked, getStartUpgrades
  };
})();
