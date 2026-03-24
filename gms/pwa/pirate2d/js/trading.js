// Trading system - buy/sell goods at ports

export const TRADE_GOODS = {
    'Rum':       { basePrice: 20, icon: '\uD83C\uDF7A', category: 'common' },
    'Sugar':     { basePrice: 15, icon: '\uD83C\uDF6C', category: 'common' },
    'Tobacco':   { basePrice: 25, icon: '\uD83C\uDF3F', category: 'common' },
    'Spices':    { basePrice: 35, icon: '\u2728',       category: 'uncommon' },
    'Silk':      { basePrice: 50, icon: '\uD83E\uDDF5', category: 'uncommon' },
    'Medicine':  { basePrice: 60, icon: '\uD83D\uDC8A', category: 'uncommon' },
    'Gunpowder': { basePrice: 40, icon: '\uD83D\uDCA3', category: 'uncommon' },
    'Gold Ore':  { basePrice: 80, icon: '\uD83E\uDD47', category: 'rare' }
};

export class TradingSystem {
    constructor() {
        this.currentPort = null;
    }

    openPort(port) {
        this.currentPort = port;
    }

    closePort() {
        this.currentPort = null;
    }

    getBuyPrice(item) {
        if (!this.currentPort) return Infinity;
        return this.currentPort.prices[item] || TRADE_GOODS[item].basePrice;
    }

    getSellPrice(item) {
        if (!this.currentPort) return 0;
        const buyPrice = this.currentPort.prices[item] || TRADE_GOODS[item].basePrice;
        return Math.round(buyPrice * 0.75); // Sell at 75% of port buy price
    }

    buyItem(item, qty, player) {
        const price = this.getBuyPrice(item) * qty;
        if (player.gold < price) return { success: false, reason: 'Not enough gold' };
        const added = player.addCargo(item, qty);
        if (added === 0) return { success: false, reason: 'Cargo full' };
        player.gold -= this.getBuyPrice(item) * added;
        return { success: true, qty: added, cost: this.getBuyPrice(item) * added };
    }

    sellItem(item, qty, player) {
        const have = player.cargo[item] || 0;
        if (have === 0) return { success: false, reason: 'None to sell' };
        const sold = player.removeCargo(item, qty);
        const earned = this.getSellPrice(item) * sold;
        player.addGold(earned);
        return { success: true, qty: sold, earned };
    }

    // Repair ship at port
    getRepairCost(player) {
        const missing = player.maxHp - player.hp;
        return Math.ceil(missing * 0.5);
    }

    repair(player) {
        const cost = this.getRepairCost(player);
        if (player.gold < cost) return false;
        player.gold -= cost;
        player.hp = player.maxHp;
        return true;
    }
}
