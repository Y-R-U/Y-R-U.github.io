/* DRace - Player Module */
const AI_NAMES = ['Blaze', 'Nova', 'Storm', 'Pixel', 'Echo', 'Viper', 'Frost', 'Spark'];
const PLAYER_COLORS = [
    '#00d4ff', // cyan
    '#ff6b35', // orange
    '#a855f7', // purple
    '#00e676', // green
];
const PLAYER_EMOJIS = ['🏃', '🤖', '🤖', '🤖'];

class Player {
    constructor(index, name, isHuman = false) {
        this.index = index;
        this.name = name;
        this.isHuman = isHuman;
        this.position = 0;
        this.treasure = 0;
        this.permBonus = 0;
        this.tempBonus = 0;
        this.doubleNext = false;
        this.shield = false;
        this.skipNextTurn = false;
        this.finished = false;
        this.finishOrder = -1;
        this.color = PLAYER_COLORS[index];
        this.emoji = isHuman ? '🏃' : '🤖';
    }

    getEffectiveRoll(rawRoll) {
        let result = rawRoll + this.permBonus + this.tempBonus;
        if (this.doubleNext) {
            result = rawRoll * 2 + this.permBonus;
            this.doubleNext = false;
        }
        this.tempBonus = 0;
        return Math.max(1, result);
    }

    getScore(totalSquares) {
        // Position scoring: finishing gives big bonus
        let posScore = 0;
        if (this.finished) {
            const finishBonus = [100, 60, 30, 10];
            posScore = finishBonus[this.finishOrder] || 10;
        } else {
            posScore = Math.floor((this.position / totalSquares) * 40);
        }
        return posScore + this.treasure;
    }

    serialize() {
        return {
            index: this.index,
            name: this.name,
            isHuman: this.isHuman,
            position: this.position,
            treasure: this.treasure,
            permBonus: this.permBonus,
            tempBonus: this.tempBonus,
            doubleNext: this.doubleNext,
            shield: this.shield,
            skipNextTurn: this.skipNextTurn,
            finished: this.finished,
            finishOrder: this.finishOrder,
            color: this.color,
            emoji: this.emoji
        };
    }

    static deserialize(data) {
        const p = new Player(data.index, data.name, data.isHuman);
        Object.assign(p, data);
        return p;
    }
}
