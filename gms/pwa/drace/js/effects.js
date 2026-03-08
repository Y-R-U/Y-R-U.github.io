/* DRace - Square Effects Module */
const Effects = (() => {
    // Effect types and their properties
    const EFFECT_TYPES = {
        EMPTY:          { id: 'empty',          icon: '',   name: 'Empty',               desc: 'Nothing happens here.', category: 'neutral',  weight: 15 },
        FORWARD_2:      { id: 'forward_2',      icon: '⏩', name: 'Dash Forward',         desc: 'Move forward 2 spaces!', category: 'positive', weight: 8 },
        FORWARD_3:      { id: 'forward_3',      icon: '🚀', name: 'Rocket Boost',         desc: 'Blast forward 3 spaces!', category: 'positive', weight: 5 },
        BACK_2:         { id: 'back_2',          icon: '⏪', name: 'Pushed Back',          desc: 'Move back 2 spaces.', category: 'negative', weight: 7 },
        BACK_3:         { id: 'back_3',          icon: '🌀', name: 'Whirlpool',            desc: 'Dragged back 3 spaces!', category: 'negative', weight: 4 },
        ROLL_AGAIN:     { id: 'roll_again',      icon: '🎲', name: 'Roll Again',           desc: 'You get another roll!', category: 'positive', weight: 7 },
        SKIP_TURN:      { id: 'skip_turn',       icon: '⛔', name: 'Frozen',               desc: 'Skip your next turn.', category: 'negative', weight: 5 },
        SKIP_OPPONENT:  { id: 'skip_opponent',   icon: '🧊', name: 'Freeze Opponent',      desc: 'Next player skips their turn!', category: 'positive', weight: 4 },
        PERM_PLUS_1:    { id: 'perm_plus_1',     icon: '⭐', name: 'Star Power',           desc: '+1 to all future rolls (permanent)!', category: 'positive', weight: 3 },
        PERM_PLUS_2:    { id: 'perm_plus_2',     icon: '🌟', name: 'Super Star',           desc: '+2 to all future rolls (permanent)!', category: 'positive', weight: 1 },
        PERM_MINUS_1:   { id: 'perm_minus_1',    icon: '💀', name: 'Cursed',               desc: '-1 to all future rolls (permanent).', category: 'negative', weight: 3 },
        TEMP_PLUS_3:    { id: 'temp_plus_3',     icon: '⚡', name: 'Lightning Boost',      desc: '+3 to your next roll!', category: 'positive', weight: 5 },
        TEMP_MINUS_2:   { id: 'temp_minus_2',    icon: '🐌', name: 'Slowed',               desc: '-2 on your next roll.', category: 'negative', weight: 4 },
        DOUBLE_ROLL:    { id: 'double_roll',     icon: '✨', name: 'Double Up',            desc: 'Your next roll counts double!', category: 'positive', weight: 3 },
        TREASURE_SMALL: { id: 'treasure_small',  icon: '💎', name: 'Small Gem',            desc: 'Found a gem! +5 points.', category: 'treasure', weight: 8 },
        TREASURE_MED:   { id: 'treasure_med',    icon: '👑', name: 'Crown',                desc: 'Found a crown! +15 points.', category: 'treasure', weight: 4 },
        TREASURE_LARGE: { id: 'treasure_large',  icon: '🏆', name: 'Grand Trophy',         desc: 'Incredible find! +30 points.', category: 'treasure', weight: 1 },
        SHIELD:         { id: 'shield',          icon: '🛡️', name: 'Shield',               desc: 'Blocks the next negative effect!', category: 'positive', weight: 4 },
        SWAP:           { id: 'swap',            icon: '🔄', name: 'Swap Places',          desc: 'Swap position with a random player!', category: 'neutral',  weight: 3 },
        TELEPORT:       { id: 'teleport',        icon: '🌈', name: 'Rainbow Portal',       desc: 'Teleport to a random square ahead!', category: 'positive', weight: 3 },
        STEAL:          { id: 'steal',           icon: '🦊', name: 'Sneaky Fox',           desc: 'Steal 10 points from another player!', category: 'positive', weight: 3 },
        LOSE_TREASURE:  { id: 'lose_treasure',   icon: '💔', name: 'Treasure Lost',        desc: 'Lose 10 points of treasure!', category: 'negative', weight: 3 },
        SPRING:         { id: 'spring',          icon: '🍃', name: 'Spring Breeze',        desc: 'Move forward 1 space.', category: 'positive', weight: 10 },
        TRAP:           { id: 'trap',            icon: '🕸️', name: 'Spider Web',           desc: 'Move back 1 space.', category: 'negative', weight: 8 },
    };

    // Build weighted pool (excluding EMPTY which is handled separately)
    function buildPool() {
        const pool = [];
        for (const key of Object.keys(EFFECT_TYPES)) {
            if (key === 'EMPTY') continue;
            const e = EFFECT_TYPES[key];
            for (let i = 0; i < e.weight; i++) pool.push(key);
        }
        return pool;
    }

    const pool = buildPool();

    function randomEffect() {
        return EFFECT_TYPES[pool[Math.floor(Math.random() * pool.length)]];
    }

    function generateBoard(size) {
        const squares = [];
        // Square 0 is START
        squares.push({ index: 0, effect: { id: 'start', icon: '🏁', name: 'Start', desc: 'The starting line!', category: 'neutral' } });

        for (let i = 1; i < size - 1; i++) {
            // Higher chance of empty squares near start
            const emptyChance = i < 5 ? 0.5 : 0.2;
            if (Math.random() < emptyChance) {
                squares.push({ index: i, effect: EFFECT_TYPES.EMPTY });
            } else {
                let eff = randomEffect();
                // Don't place super powerful effects too early
                if (i < 8 && (eff.id === 'perm_plus_2' || eff.id === 'treasure_large' || eff.id === 'double_roll')) {
                    eff = EFFECT_TYPES.SPRING;
                }
                // Don't place devastating effects near start either
                if (i < 5 && eff.category === 'negative') {
                    eff = EFFECT_TYPES.EMPTY;
                }
                squares.push({ index: i, effect: { ...eff } });
            }
        }

        // Last square is FINISH
        squares.push({ index: size - 1, effect: { id: 'finish', icon: '🏁', name: 'Finish!', desc: 'Cross the finish line!', category: 'positive' } });

        return squares;
    }

    function applyEffect(player, effect) {
        const result = { message: '', toastType: 'info', extraAction: null };

        if (player.shield && effect.category === 'negative') {
            player.shield = false;
            result.message = `🛡️ Shield blocked "${effect.name}"!`;
            result.toastType = 'positive';
            return result;
        }

        switch (effect.id) {
            case 'empty':
            case 'start':
                result.message = '';
                break;
            case 'finish':
                result.message = `${player.name} crosses the finish line!`;
                result.toastType = 'positive';
                break;
            case 'forward_2':
                result.message = `${effect.icon} ${effect.name}: Move forward 2!`;
                result.toastType = 'positive';
                result.extraAction = { type: 'move', amount: 2 };
                break;
            case 'forward_3':
                result.message = `${effect.icon} ${effect.name}: Move forward 3!`;
                result.toastType = 'positive';
                result.extraAction = { type: 'move', amount: 3 };
                break;
            case 'spring':
                result.message = `${effect.icon} ${effect.name}: Move forward 1!`;
                result.toastType = 'positive';
                result.extraAction = { type: 'move', amount: 1 };
                break;
            case 'back_2':
                result.message = `${effect.icon} ${effect.name}: Move back 2!`;
                result.toastType = 'negative';
                result.extraAction = { type: 'move', amount: -2 };
                break;
            case 'back_3':
                result.message = `${effect.icon} ${effect.name}: Move back 3!`;
                result.toastType = 'negative';
                result.extraAction = { type: 'move', amount: -3 };
                break;
            case 'trap':
                result.message = `${effect.icon} ${effect.name}: Move back 1!`;
                result.toastType = 'negative';
                result.extraAction = { type: 'move', amount: -1 };
                break;
            case 'roll_again':
                result.message = `${effect.icon} ${effect.name}!`;
                result.toastType = 'positive';
                result.extraAction = { type: 'roll_again' };
                break;
            case 'skip_turn':
                result.message = `${effect.icon} ${effect.name}: Skip next turn!`;
                result.toastType = 'negative';
                player.skipNextTurn = true;
                break;
            case 'skip_opponent':
                result.message = `${effect.icon} ${effect.name}!`;
                result.toastType = 'positive';
                result.extraAction = { type: 'skip_opponent' };
                break;
            case 'perm_plus_1':
                result.message = `${effect.icon} ${effect.name}: +1 to all future rolls!`;
                result.toastType = 'positive';
                player.permBonus += 1;
                break;
            case 'perm_plus_2':
                result.message = `${effect.icon} ${effect.name}: +2 to all future rolls!`;
                result.toastType = 'positive';
                player.permBonus += 2;
                break;
            case 'perm_minus_1':
                result.message = `${effect.icon} ${effect.name}: -1 to all future rolls!`;
                result.toastType = 'negative';
                player.permBonus -= 1;
                break;
            case 'temp_plus_3':
                result.message = `${effect.icon} ${effect.name}: +3 to next roll!`;
                result.toastType = 'positive';
                player.tempBonus += 3;
                break;
            case 'temp_minus_2':
                result.message = `${effect.icon} ${effect.name}: -2 on next roll!`;
                result.toastType = 'negative';
                player.tempBonus -= 2;
                break;
            case 'double_roll':
                result.message = `${effect.icon} ${effect.name}: Next roll counts double!`;
                result.toastType = 'positive';
                player.doubleNext = true;
                break;
            case 'treasure_small':
                result.message = `${effect.icon} ${effect.name}: +5 points!`;
                result.toastType = 'treasure';
                player.treasure += 5;
                break;
            case 'treasure_med':
                result.message = `${effect.icon} ${effect.name}: +15 points!`;
                result.toastType = 'treasure';
                player.treasure += 15;
                break;
            case 'treasure_large':
                result.message = `${effect.icon} ${effect.name}: +30 points!`;
                result.toastType = 'treasure';
                player.treasure += 30;
                break;
            case 'shield':
                result.message = `${effect.icon} ${effect.name}: Protected from next negative effect!`;
                result.toastType = 'positive';
                player.shield = true;
                break;
            case 'swap':
                result.message = `${effect.icon} ${effect.name}!`;
                result.toastType = 'info';
                result.extraAction = { type: 'swap' };
                break;
            case 'teleport':
                result.message = `${effect.icon} ${effect.name}!`;
                result.toastType = 'positive';
                result.extraAction = { type: 'teleport' };
                break;
            case 'steal':
                result.message = `${effect.icon} ${effect.name}: Steal 10 points!`;
                result.toastType = 'positive';
                result.extraAction = { type: 'steal', amount: 10 };
                break;
            case 'lose_treasure':
                result.message = `${effect.icon} ${effect.name}: Lose 10 points!`;
                result.toastType = 'negative';
                player.treasure = Math.max(0, player.treasure - 10);
                break;
        }
        return result;
    }

    return {
        EFFECT_TYPES,
        generateBoard,
        applyEffect
    };
})();
