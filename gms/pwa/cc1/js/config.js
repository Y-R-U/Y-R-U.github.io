/* ===== BOUNCE MERGE ROGUELITE — CONFIG ===== */
window.BM = window.BM || {};

(function(BM) {
    'use strict';

    // ===== GAME TUNING =====
    BM.CFG = {
        BALL_BASE_RADIUS: 14,
        BALL_BASE_SPEED: 600,
        BALL_DAMPING: 0.9985,
        BALL_MIN_SPEED: 40,
        BALL_MAX_BOUNCES: 18,
        BLOCK_ROWS_VISIBLE: 6,
        BLOCK_COLS: 6,
        BLOCK_PADDING: 3,
        DANGER_LINE_Y_RATIO: 0.82,
        LAUNCHER_Y_RATIO: 0.92,
        GRAVITY: 0,
        WAVE_ADVANCE_SPEED: 2,
        BOSS_EVERY: 5,
        BOSS_HP_MULT: 8,
        BASE_BLOCK_HP: 4,
        HP_SCALE_PER_WAVE: 1.25,
        BLOCKS_PER_ROW_MIN: 2,
        BLOCKS_PER_ROW_MAX: 5,
        MERGE_ANIM_DUR: 300,
        PARTICLES_PER_MERGE: 12,
        PARTICLES_PER_BREAK: 8,
        AIM_LINE_DOTS: 20,
        AIM_LINE_SIM_BOUNCES: 3,
        CRYSTAL_BASE: 2,
        FPS: 60,
    };

    // ===== BALL COLORS BY VALUE =====
    BM.BALL_COLORS = {
        2:    { bg: '#FF6B6B', text: '#FFF' },
        4:    { bg: '#FF9F43', text: '#FFF' },
        8:    { bg: '#FECA57', text: '#333' },
        16:   { bg: '#48DBFB', text: '#333' },
        32:   { bg: '#0ABDE3', text: '#FFF' },
        64:   { bg: '#5F27CD', text: '#FFF' },
        128:  { bg: '#FF6348', text: '#FFF' },
        256:  { bg: '#2ED573', text: '#FFF' },
        512:  { bg: '#1E90FF', text: '#FFF' },
        1024: { bg: '#FF1493', text: '#FFF' },
        2048: { bg: '#FFD700', text: '#333' },
        4096: { bg: '#FF00FF', text: '#FFF' },
    };

    BM.getBallColor = function(value) {
        if (BM.BALL_COLORS[value]) return BM.BALL_COLORS[value];
        // For values beyond our table, cycle through hues
        var hue = (Math.log2(value) * 47) % 360;
        return { bg: 'hsl(' + hue + ',70%,55%)', text: '#FFF' };
    };

    // ===== BLOCK COLORS BY HP TIER =====
    BM.getBlockColor = function(hp, maxHp) {
        var ratio = hp / maxHp;
        if (ratio > 0.75) return '#e74c3c';
        if (ratio > 0.5) return '#e67e22';
        if (ratio > 0.25) return '#f1c40f';
        return '#95a5a6';
    };

    BM.BOSS_COLOR = '#ff1493';

    // ===== UPGRADE DEFINITIONS =====
    BM.UPGRADES = [
        {
            id: 'startValue',
            name: 'Ball Power',
            icon: '⚡',
            desc: 'Start with higher value balls',
            maxLevel: 6,
            costs: [0, 20, 50, 120, 300, 700],
            values: [2, 4, 8, 16, 32, 64],
            display: function(lvl) { return 'Start ball: ' + BM.UPGRADES[0].values[lvl]; }
        },
        {
            id: 'ballSpeed',
            name: 'Velocity',
            icon: '💨',
            desc: 'Balls move faster',
            maxLevel: 5,
            costs: [0, 15, 40, 100, 250],
            values: [1.0, 1.12, 1.25, 1.4, 1.6],
            display: function(lvl) { return '+' + Math.round((BM.UPGRADES[1].values[lvl] - 1) * 100) + '% speed'; }
        },
        {
            id: 'durability',
            name: 'Durability',
            icon: '🛡️',
            desc: 'More bounces before stopping',
            maxLevel: 5,
            costs: [0, 15, 35, 80, 200],
            values: [0, 4, 8, 14, 22],
            display: function(lvl) { return '+' + BM.UPGRADES[2].values[lvl] + ' bounces'; }
        },
        {
            id: 'multishot',
            name: 'Multi-Shot',
            icon: '🔥',
            desc: 'Shoot extra balls per turn',
            maxLevel: 4,
            costs: [0, 60, 180, 500],
            values: [1, 2, 3, 4],
            display: function(lvl) { return BM.UPGRADES[3].values[lvl] + ' ball(s) per shot'; }
        },
        {
            id: 'critChance',
            name: 'Critical Hit',
            icon: '🎯',
            desc: 'Chance to deal 2x damage to blocks',
            maxLevel: 5,
            costs: [0, 25, 60, 150, 350],
            values: [0, 0.08, 0.16, 0.25, 0.35],
            display: function(lvl) { return Math.round(BM.UPGRADES[4].values[lvl] * 100) + '% crit chance'; }
        },
        {
            id: 'mergeBonus',
            name: 'Merge Luck',
            icon: '🍀',
            desc: 'Chance to merge one tier higher',
            maxLevel: 4,
            costs: [0, 30, 80, 200],
            values: [0, 0.1, 0.2, 0.32],
            display: function(lvl) { return Math.round(BM.UPGRADES[5].values[lvl] * 100) + '% super merge'; }
        },
        {
            id: 'scoreMult',
            name: 'Score Bonus',
            icon: '⭐',
            desc: 'Earn more score and crystals',
            maxLevel: 5,
            costs: [0, 20, 50, 120, 300],
            values: [1.0, 1.2, 1.5, 1.8, 2.2],
            display: function(lvl) { return 'x' + BM.UPGRADES[6].values[lvl].toFixed(1) + ' score'; }
        },
    ];

    // ===== SAVE / LOAD =====
    BM.SAVE_KEY = 'bounceMergeRoguelite';

    BM.loadSave = function() {
        try {
            var data = JSON.parse(localStorage.getItem(BM.SAVE_KEY));
            if (data) return data;
        } catch (e) { /* ignore */ }
        return { crystals: 0, upgradeLevels: {}, bestWave: 0, bestScore: 0, totalRuns: 0, settings: { music: true, sfx: true } };
    };

    BM.saveSave = function(data) {
        try { localStorage.setItem(BM.SAVE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
    };

    BM.getUpgradeLevel = function(save, id) {
        return (save.upgradeLevels && save.upgradeLevels[id]) || 0;
    };

    BM.getUpgradeValue = function(save, id) {
        var def = BM.UPGRADES.find(function(u) { return u.id === id; });
        if (!def) return 0;
        var lvl = BM.getUpgradeLevel(save, id);
        return def.values[lvl];
    };

})(window.BM);
