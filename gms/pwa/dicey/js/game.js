/* ============================================
   DICEY - Game Logic & State Management
   ============================================ */

const Game = {
    state: null,
    running: false,
    animating: false,

    createInitialState() {
        const properties = {};
        Utils.BOARD_SPACES.forEach((space, i) => {
            if (space.type === 'property' || space.type === 'railroad' || space.type === 'utility') {
                properties[i] = { owner: null, houses: 0 };
            }
        });

        return {
            players: [
                { index: 0, money: 1500, position: 0, inJail: false, jailTurns: 0, bankrupt: false, doublesCount: 0, isAI: false },
                { index: 1, money: 1500, position: 0, inJail: false, jailTurns: 0, bankrupt: false, doublesCount: 0, isAI: true },
                { index: 2, money: 1500, position: 0, inJail: false, jailTurns: 0, bankrupt: false, doublesCount: 0, isAI: true },
                { index: 3, money: 1500, position: 0, inJail: false, jailTurns: 0, bankrupt: false, doublesCount: 0, isAI: true },
            ],
            properties,
            currentPlayer: 0,
            round: 1,
            maxRounds: 30,
            chanceCards: Utils.shuffle([...Utils.CHANCE_CARDS]),
            chestCards: Utils.shuffle([...Utils.CHEST_CARDS]),
            chanceIdx: 0,
            chestIdx: 0,
            gameOver: false,
        };
    },

    init() {
        this.state = this.createInitialState();
        this.running = true;
    },

    getActiveCount() {
        return this.state.players.filter(p => !p.bankrupt).length;
    },

    async startTurn() {
        if (this.state.gameOver) return;

        const player = this.state.players[this.state.currentPlayer];
        if (player.bankrupt) {
            this.nextPlayer();
            return;
        }

        player.doublesCount = 0;
        UI.updateHUD(this.state);
        BoardRenderer.draw(this.state);

        if (player.isAI) {
            await this.doAITurn(player);
        } else {
            this.enableRoll(player);
        }
    },

    enableRoll(player) {
        const rollBtn = document.getElementById('btn-roll');
        rollBtn.style.display = '';
        rollBtn.textContent = player.inJail ? 'In Jail...' : 'Roll Dice';
        rollBtn.disabled = false;
        rollBtn.onclick = async () => {
            rollBtn.disabled = true;
            if (player.inJail) {
                await this.handleJail(player);
            } else {
                await this.doRoll(player);
            }
        };

        // Build button (only show if player has buildable properties)
        this.showBuildButton(player);
    },

    showBuildButton(player) {
        // Remove existing build button
        const existing = document.getElementById('btn-build');
        if (existing) existing.remove();

        // Check if player has buildable properties
        const hasBuildable = Utils.BOARD_SPACES.some((space, idx) => {
            if (space.type !== 'property') return false;
            const prop = this.state.properties[idx];
            if (!prop || prop.owner !== player.index || prop.houses >= 5) return false;
            const group = space.group;
            const groupSpaces = Utils.BOARD_SPACES.map((s, i) => ({ s, i }))
                .filter(o => o.s.group === group && o.s.type === 'property');
            const ownsAll = groupSpaces.every(o => this.state.properties[o.i]?.owner === player.index);
            const cost = Math.floor(space.price / 2);
            return ownsAll && player.money >= cost;
        });

        if (hasBuildable) {
            const btn = document.createElement('button');
            btn.id = 'btn-build';
            btn.className = 'btn btn-gold btn-small';
            btn.textContent = '🏗️ Build';
            btn.onclick = async () => {
                const ownedIdxs = Utils.BOARD_SPACES.map((s, i) => i)
                    .filter(i => this.state.properties[i]?.owner === player.index);
                const buildIdx = await UI.showBuildPanel(player, ownedIdxs, this.state);
                if (buildIdx !== null) {
                    this.buildHouse(player, buildIdx);
                    BoardRenderer.draw(this.state);
                    UI.updateHUD(this.state);
                    // Refresh build button
                    this.showBuildButton(player);
                }
            };
            document.getElementById('action-area').appendChild(btn);
        }
    },

    buildHouse(player, spaceIdx) {
        const space = Utils.BOARD_SPACES[spaceIdx];
        const prop = this.state.properties[spaceIdx];
        const cost = Math.floor(space.price / 2);
        player.money -= cost;
        prop.houses++;
        UI.showToast(`Built on ${space.name}! (${prop.houses < 5 ? prop.houses + ' houses' : 'Hotel'})`);
    },

    async doRoll(player) {
        // Animate dice
        const diceCanvas = document.getElementById('dice-canvas');
        const dctx = diceCanvas.getContext('2d');

        // Rolling animation
        AudioManager.playSfx('roll');
        const frames = 15;
        for (let i = 0; i < frames; i++) {
            Sprites.drawDicePair(dctx, diceCanvas.width, diceCanvas.height, null, null, true);
            await Utils.wait(50);
        }

        const roll = Utils.rollDice();
        Sprites.drawDicePair(dctx, diceCanvas.width, diceCanvas.height, roll.d1, roll.d2);

        UI.showToast(`${Utils.PLAYER_NAMES[player.index]} rolled ${roll.d1} + ${roll.d2} = ${roll.total}${roll.doubles ? ' (Doubles!)' : ''}`);

        await Utils.wait(600);

        // Check for triple doubles
        if (roll.doubles) {
            player.doublesCount++;
            if (player.doublesCount >= 3) {
                UI.showToast(`${Utils.PLAYER_NAMES[player.index]} rolled 3 doubles - Go to Jail!`);
                await Utils.wait(600);
                this.sendToJail(player);
                BoardRenderer.draw(this.state);
                this.nextPlayer();
                return;
            }
        }

        // Move player
        await this.movePlayer(player, roll.total);

        // Handle landing
        await this.handleLanding(player);

        // Check bankruptcy
        if (player.bankrupt) {
            UI.showToast(`${Utils.PLAYER_NAMES[player.index]} is bankrupt!`);
            await Utils.wait(800);
            if (this.checkGameEnd()) return;
            this.nextPlayer();
            return;
        }

        // Doubles = another turn
        if (roll.doubles && !player.inJail && !player.bankrupt) {
            UI.showToast('Doubles! Roll again!');
            await Utils.wait(500);
            if (!player.isAI) {
                this.enableRoll(player);
            } else {
                await this.doRoll(player);
            }
            return;
        }

        // AI building phase
        if (player.isAI) {
            let buildIdx = AI.chooseBuild(player, this.state);
            while (buildIdx !== null) {
                this.buildHouse(player, buildIdx);
                await Utils.wait(300);
                buildIdx = AI.chooseBuild(player, this.state);
            }
        }

        this.nextPlayer();
    },

    async movePlayer(player, spaces) {
        const totalSpaces = 32;
        const startPos = player.position;

        // Animate step by step
        for (let i = 0; i < spaces; i++) {
            player.position = (player.position + 1) % totalSpaces;
            BoardRenderer.draw(this.state);
            await Utils.wait(100);

            // Passed GO
            if (player.position === 0 && i < spaces - 1) {
                player.money += 200;
                AudioManager.playSfx('coin');
                UI.showToast(`${Utils.PLAYER_NAMES[player.index]} passed GO! +$200`);
                UI.updateHUD(this.state);
            }
        }

        // Landed on GO
        if (player.position === 0 && spaces > 0) {
            player.money += 200;
            AudioManager.playSfx('coin');
            UI.showToast(`${Utils.PLAYER_NAMES[player.index]} landed on GO! +$200`);
            UI.updateHUD(this.state);
        }

        BoardRenderer.draw(this.state);
        UI.updateHUD(this.state);
    },

    async handleLanding(player) {
        const space = Utils.BOARD_SPACES[player.position];
        if (!space) return;

        switch (space.type) {
            case 'property':
            case 'railroad':
            case 'utility':
                await this.handlePropertyLanding(player, space, player.position);
                break;
            case 'tax':
                await this.handleTax(player, space);
                break;
            case 'chance':
                await this.handleCard(player, 'chance');
                break;
            case 'chest':
                await this.handleCard(player, 'chest');
                break;
            case 'goToJail':
                UI.showToast(`${Utils.PLAYER_NAMES[player.index]} goes to Jail!`);
                await Utils.wait(600);
                this.sendToJail(player);
                AudioManager.playSfx('jail');
                BoardRenderer.draw(this.state);
                break;
            case 'jail':
                // Just visiting
                break;
            case 'parking':
                // Free parking - nothing happens
                break;
            case 'go':
                // Already handled in movePlayer
                break;
        }
    },

    async handlePropertyLanding(player, space, spaceIdx) {
        const prop = this.state.properties[spaceIdx];
        if (!prop) return;

        if (prop.owner === null) {
            // Unowned - offer to buy
            const canAfford = player.money >= space.price;

            if (player.isAI) {
                await AI.delay();
                let shouldBuy;
                if (space.type === 'property') {
                    shouldBuy = AI.shouldBuy(player, space, this.state) && canAfford;
                } else {
                    shouldBuy = AI.shouldBuySpecial(player, space, this.state) && canAfford;
                }

                if (shouldBuy) {
                    player.money -= space.price;
                    prop.owner = player.index;
                    AudioManager.playSfx('buy');
                    UI.showToast(`${Utils.PLAYER_NAMES[player.index]} bought ${space.name}!`);
                } else {
                    UI.showToast(`${Utils.PLAYER_NAMES[player.index]} passed on ${space.name}`);
                }
            } else {
                const choice = await UI.showPropertyPanel(space, spaceIdx, player, canAfford);
                if (choice === 'buy') {
                    player.money -= space.price;
                    prop.owner = player.index;
                    UI.showToast(`You bought ${space.name}!`);
                }
            }
        } else if (prop.owner !== player.index) {
            // Owned by someone else - pay rent
            const owner = this.state.players[prop.owner];
            if (owner.bankrupt || owner.inJail) return; // No rent if owner is bankrupt or in jail

            let rent = this.calculateRent(space, spaceIdx, prop);

            if (player.isAI) {
                await AI.delay();
                UI.showToast(`${Utils.PLAYER_NAMES[player.index]} pays ${Utils.formatMoney(rent)} to ${Utils.PLAYER_NAMES[owner.index]}`);
            } else {
                await UI.showRentPanel(space, prop.owner, rent);
            }

            this.transferMoney(player, owner, rent);
        }

        UI.updateHUD(this.state);
        BoardRenderer.draw(this.state);
    },

    calculateRent(space, spaceIdx, prop) {
        if (space.type === 'railroad') {
            // Count railroads owned by same owner
            const count = Utils.BOARD_SPACES
                .map((s, i) => ({ s, i }))
                .filter(o => o.s.type === 'railroad' && this.state.properties[o.i]?.owner === prop.owner)
                .length;
            return space.rent[count - 1] || 25;
        }

        if (space.type === 'utility') {
            // Utility rent = dice roll * multiplier
            const utilCount = Utils.BOARD_SPACES
                .map((s, i) => ({ s, i }))
                .filter(o => o.s.type === 'utility' && this.state.properties[o.i]?.owner === prop.owner)
                .length;
            const roll = Utils.rollDice();
            return roll.total * (utilCount === 2 ? 10 : 4);
        }

        if (space.type === 'property') {
            const baseRent = space.rent[prop.houses] || space.rent[0];

            // Check if owner has monopoly (all in group)
            if (prop.houses === 0) {
                const group = space.group;
                const groupSpaces = Utils.BOARD_SPACES.map((s, i) => ({ s, i }))
                    .filter(o => o.s.group === group && o.s.type === 'property');
                const ownsAll = groupSpaces.every(o => this.state.properties[o.i]?.owner === prop.owner);
                if (ownsAll) return baseRent * 2;
            }
            return baseRent;
        }

        return 0;
    },

    transferMoney(from, to, amount) {
        const actual = Math.min(from.money, amount);
        from.money -= actual;
        to.money += actual;

        if (from.money <= 0) {
            from.money = 0;
            this.goBankrupt(from);
        }
    },

    goBankrupt(player) {
        player.bankrupt = true;
        // Return all properties
        for (const [idx, prop] of Object.entries(this.state.properties)) {
            if (prop.owner === player.index) {
                prop.owner = null;
                prop.houses = 0;
            }
        }
        AudioManager.playSfx('pay');
    },

    async handleTax(player, space) {
        if (player.isAI) {
            await AI.delay();
            UI.showToast(`${Utils.PLAYER_NAMES[player.index]} pays ${Utils.formatMoney(space.amount)} tax`);
        } else {
            await UI.showTaxPanel(space);
        }

        player.money -= space.amount;
        if (player.money <= 0) {
            player.money = 0;
            this.goBankrupt(player);
        }
        AudioManager.playSfx('pay');
        UI.updateHUD(this.state);
    },

    async handleCard(player, type) {
        let card;
        if (type === 'chance') {
            card = this.state.chanceCards[this.state.chanceIdx];
            this.state.chanceIdx = (this.state.chanceIdx + 1) % this.state.chanceCards.length;
        } else {
            card = this.state.chestCards[this.state.chestIdx];
            this.state.chestIdx = (this.state.chestIdx + 1) % this.state.chestCards.length;
        }

        if (player.isAI) {
            await AI.delay();
            UI.showToast(`${Utils.PLAYER_NAMES[player.index]}: ${card.text}`);
            await Utils.wait(800);
        } else {
            await UI.showCardPanel(type, card);
        }

        await this.executeCard(player, card);
        UI.updateHUD(this.state);
        BoardRenderer.draw(this.state);
    },

    async executeCard(player, card) {
        switch (card.action) {
            case 'gain':
                player.money += card.value;
                AudioManager.playSfx('coin');
                break;
            case 'pay':
                player.money -= card.value;
                if (player.money <= 0) { player.money = 0; this.goBankrupt(player); }
                AudioManager.playSfx('pay');
                break;
            case 'moveTo':
                const oldPos = player.position;
                if (card.value <= player.position) {
                    // Passed GO
                    player.money += 200;
                    AudioManager.playSfx('coin');
                }
                player.position = card.value;
                BoardRenderer.draw(this.state);
                await this.handleLanding(player);
                break;
            case 'moveBack':
                player.position = (player.position - card.value + 32) % 32;
                BoardRenderer.draw(this.state);
                await this.handleLanding(player);
                break;
            case 'goJail':
                this.sendToJail(player);
                AudioManager.playSfx('jail');
                break;
            case 'nearestRail':
                // Find nearest railroad
                const railIndices = Utils.BOARD_SPACES.map((s, i) => s.type === 'railroad' ? i : -1).filter(i => i >= 0);
                let nearest = railIndices[0];
                for (const ri of railIndices) {
                    if (ri > player.position) { nearest = ri; break; }
                }
                if (nearest <= player.position) player.money += 200; // Passed GO
                player.position = nearest;
                BoardRenderer.draw(this.state);
                await this.handleLanding(player);
                break;
            case 'payPerHouse':
                let totalHouses = 0;
                for (const [idx, prop] of Object.entries(this.state.properties)) {
                    if (prop.owner === player.index) totalHouses += prop.houses;
                }
                const amount = totalHouses * card.value;
                player.money -= amount;
                if (player.money <= 0) { player.money = 0; this.goBankrupt(player); }
                if (amount > 0) UI.showToast(`Paid ${Utils.formatMoney(amount)} for ${totalHouses} houses`);
                AudioManager.playSfx('pay');
                break;
        }
    },

    sendToJail(player) {
        player.position = 8; // Jail is at index 8 (bottom-left corner)
        player.inJail = true;
        player.jailTurns = 0;
    },

    async handleJail(player) {
        let decision;

        if (player.isAI) {
            await AI.delay();
            decision = AI.jailDecision(player);
            UI.showToast(`${Utils.PLAYER_NAMES[player.index]} ${decision === 'pay' ? 'pays bail' : 'tries to roll doubles'}`);
            await Utils.wait(500);
        } else {
            decision = await UI.showJailPanel(player, player.money >= 50);
        }

        if (decision === 'pay') {
            player.money -= 50;
            player.inJail = false;
            player.jailTurns = 0;
            AudioManager.playSfx('pay');
            UI.updateHUD(this.state);
            await this.doRoll(player);
            return;
        }

        // Try rolling doubles
        const diceCanvas = document.getElementById('dice-canvas');
        const dctx = diceCanvas.getContext('2d');
        AudioManager.playSfx('roll');
        const frames = 12;
        for (let i = 0; i < frames; i++) {
            Sprites.drawDicePair(dctx, diceCanvas.width, diceCanvas.height, null, null, true);
            await Utils.wait(50);
        }

        const roll = Utils.rollDice();
        Sprites.drawDicePair(dctx, diceCanvas.width, diceCanvas.height, roll.d1, roll.d2);

        if (roll.doubles) {
            player.inJail = false;
            player.jailTurns = 0;
            UI.showToast(`${Utils.PLAYER_NAMES[player.index]} rolled doubles and escaped jail!`);
            await Utils.wait(600);
            await this.movePlayer(player, roll.total);
            await this.handleLanding(player);
        } else {
            player.jailTurns++;
            UI.showToast(`${Utils.PLAYER_NAMES[player.index]} didn't roll doubles (${roll.d1}, ${roll.d2})`);

            if (player.jailTurns >= 3) {
                // Force pay
                player.money -= 50;
                player.inJail = false;
                player.jailTurns = 0;
                UI.showToast('Forced to pay $50 bail after 3 failed attempts');
                if (player.money <= 0) { player.money = 0; this.goBankrupt(player); }
                await Utils.wait(500);
                await this.movePlayer(player, roll.total);
                await this.handleLanding(player);
            }
        }

        UI.updateHUD(this.state);

        if (player.bankrupt) {
            if (this.checkGameEnd()) return;
        }

        this.nextPlayer();
    },

    async doAITurn(player) {
        await Utils.wait(400);

        if (player.inJail) {
            await this.handleJail(player);
            return;
        }

        await this.doRoll(player);
    },

    nextPlayer() {
        // Remove build button
        const buildBtn = document.getElementById('btn-build');
        if (buildBtn) buildBtn.remove();

        if (this.state.gameOver) return;

        // Find next active player
        let next = (this.state.currentPlayer + 1) % 4;
        let safety = 0;
        while (this.state.players[next].bankrupt && safety < 4) {
            next = (next + 1) % 4;
            safety++;
        }

        // Check for new round
        if (next <= this.state.currentPlayer) {
            this.state.round++;
            if (this.state.round > this.state.maxRounds) {
                this.endGame();
                return;
            }
        }

        this.state.currentPlayer = next;

        if (this.checkGameEnd()) return;

        // Start next turn
        setTimeout(() => this.startTurn(), 300);
    },

    checkGameEnd() {
        const active = this.getActiveCount();
        if (active <= 1) {
            this.endGame();
            return true;
        }
        return false;
    },

    endGame() {
        this.state.gameOver = true;
        this.running = false;
        AudioManager.playSfx('win');
        setTimeout(() => {
            UI.showGameOver(this.state.players);
        }, 500);
    }
};
