/* powerups.js - Consumable power-up definitions and persistent inventory */
'use strict';

const PowerUps = (() => {
    const SAVE_KEY = 'paperant_powerups';

    // Order here is the display order in the in-game bar
    const TYPES = {
        magnet: {
            icon: '\u{1F9F2}', name: 'Magnet',
            desc: 'Tap the paper to place a magnet that pulls ants toward it for a few seconds.',
        },
        pencil: {
            icon: '\u{270F}\u{FE0F}', name: 'Thick Pencil',
            desc: 'Thicker, longer-lasting lines for the rest of the level.',
        },
        freeze: {
            icon: '\u{2744}\u{FE0F}', name: 'Freeze',
            desc: 'Slows every ant to a crawl for a few seconds.',
        },
        ink: {
            icon: '\u{1FAD9}', name: 'Ink Flask',
            desc: 'Instantly refills the ink meter.',
        },
        time: {
            icon: '\u{23F0}', name: 'Extra Time',
            desc: 'Adds 15 seconds to the level clock.',
        },
    };

    // First-run gift so players can try everything immediately
    const STARTER_PACK = { magnet: 2, pencil: 1, freeze: 1, ink: 2, time: 1 };

    let inventory = null;

    function init() {
        try {
            const data = JSON.parse(localStorage.getItem(SAVE_KEY));
            if (data && typeof data === 'object') {
                inventory = {};
                for (const key of Object.keys(TYPES)) {
                    inventory[key] = Math.max(0, data[key] | 0);
                }
                return;
            }
        } catch (e) {}
        inventory = { ...STARTER_PACK };
        save();
    }

    function save() {
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(inventory));
        } catch (e) {}
    }

    function getCount(type) {
        return inventory ? (inventory[type] || 0) : 0;
    }

    function add(type, count) {
        if (!TYPES[type] || !inventory) return;
        inventory[type] = (inventory[type] || 0) + count;
        save();
    }

    /** Grant a bundle like { magnet: 2, ink: 1 } in one save. */
    function addBundle(items) {
        if (!inventory) return;
        for (const [type, count] of Object.entries(items)) {
            if (TYPES[type]) inventory[type] = (inventory[type] || 0) + count;
        }
        save();
    }

    /** Consume one unit. Returns true if there was one to spend. */
    function use(type) {
        if (getCount(type) <= 0) return false;
        inventory[type]--;
        save();
        return true;
    }

    function getAll() {
        return { ...inventory };
    }

    return { TYPES, init, getCount, add, addBundle, use, getAll };
})();
