/* ============================================
   DICEY - Game Logic & State Management
   Skills-based board game
   ============================================ */

const Game = {
    state: null,
    running: false,

    createInitialState() {
        const skills = {};
        Utils.BOARD_SPACES.forEach((space, i) => {
            if (space.type === 'skill') {
                skills[i] = { owner: null };
            }
        });

        return {
            players: [
                { index: 0, money: Utils.STARTING_MONEY, position: 0, inJail: false, jailTurns: 0, bankrupt: false, doublesCount: 0, isAI: false, shields: Utils.STARTING_SHIELDS, discount: false },
                { index: 1, money: Utils.STARTING_MONEY, position: 0, inJail: false, jailTurns: 0, bankrupt: false, doublesCount: 0, isAI: true,  shields: Utils.STARTING_SHIELDS, discount: false },
                { index: 2, money: Utils.STARTING_MONEY, position: 0, inJail: false, jailTurns: 0, bankrupt: false, doublesCount: 0, isAI: true,  shields: Utils.STARTING_SHIELDS, discount: false },
                { index: 3, money: Utils.STARTING_MONEY, position: 0, inJail: false, jailTurns: 0, bankrupt: false, doublesCount: 0, isAI: true,  shields: Utils.STARTING_SHIELDS, discount: false },
            ],
            skills,
            currentPlayer: 0,
            round: 1,
            maxRounds: Utils.MAX_ROUNDS,
            fateCards: Utils.shuffle([...Utils.FATE_CARDS]),
            fateIdx: 0,
            gameOver: false,
            lastRoll: null,
        };
    },

    init() {
        this.state = this.createInitialState();
        this.running = true;
    },

    getActiveCount() {
        return this.state.players.filter(p => !p.bankrupt).length;
    },

    getPlayerSkillCount(playerIdx) {
        return Object.values(this.state.skills).filter(s => s.owner === playerIdx).length;
    },

    getPlayerSkills(playerIdx) {
        const result = [];
        for (const [idx, s] of Object.entries(this.state.skills)) {
            if (s.owner === playerIdx) {
                result.push({ spaceIdx: parseInt(idx), skill: Utils.getSkillForSpace(parseInt(idx)) });
            }
        }
        return result;
    },

    hasPassiveSkill(playerIdx, skillId) {
        return Object.entries(this.state.skills).some(([idx, s]) => {
            return s.owner === playerIdx && Utils.BOARD_SPACES[parseInt(idx)]?.skillId === skillId;
        });
    },

    countOwnedSkillById(playerIdx, skillId) {
        return Object.entries(this.state.skills).filter(([idx, s]) => {
            return s.owner === playerIdx && Utils.BOARD_SPACES[parseInt(idx)]?.skillId === skillId;
        }).length;
    },

    // ---- TURN MANAGEMENT ----

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
        UI.updateCardsStrip(this.state, 0);

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
        UI.updateCardsStrip(this.state, player.index);
    },

    // ---- DICE ROLLING ----

    async doRoll(player) {
        const diceCanvas = document.getElementById('dice-canvas');
        const dctx = diceCanvas.getContext('2d');

        AudioManager.playSfx('roll');
        for (let i = 0; i < 15; i++) {
            Sprites.drawDicePair(dctx, diceCanvas.width, diceCanvas.height, null, null, true);
            await Utils.wait(50);
        }

        const roll = Utils.rollDice();
        this.state.lastRoll = roll;
        Sprites.drawDicePair(dctx, diceCanvas.width, diceCanvas.height, roll.d1, roll.d2);

        UI.showToast(`${Utils.PLAYER_NAMES[player.index]} rolled ${roll.d1}+${roll.d2} = ${roll.total}${roll.doubles ? ' Doubles!' : ''}`);
        await Utils.wait(600);

        if (roll.doubles) {
            player.doublesCount++;
            if (player.doublesCount >= 3) {
                UI.showToast(`${Utils.PLAYER_NAMES[player.index]} rolled 3 doubles — Jail!`);
                await Utils.wait(600);
                this.sendToJail(player);
                BoardRenderer.draw(this.state);
                this.nextPlayer();
                return;
            }
        }

        await this.movePlayer(player, roll.total);
        await this.handleLanding(player);

        if (player.bankrupt) {
            UI.showToast(`${Utils.PLAYER_NAMES[player.index]} is bankrupt!`);
            await Utils.wait(800);
            if (this.checkGameEnd()) return;
            this.nextPlayer();
            return;
        }

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

        UI.updateCardsStrip(this.state, 0);
        this.nextPlayer();
    },

    // ---- MOVEMENT ----

    async movePlayer(player, spaces) {
        for (let i = 0; i < spaces; i++) {
            player.position = (player.position + 1) % 32;
            BoardRenderer.draw(this.state);
            await Utils.wait(100);

            if (player.position === 0 && i < spaces - 1) {
                this.passGo(player);
            }
        }

        if (player.position === 0 && spaces > 0) {
            this.passGo(player);
        }

        BoardRenderer.draw(this.state);
        UI.updateHUD(this.state);
    },

    passGo(player) {
        let bonus = 200;
        const goldmineCount = this.countOwnedSkillById(player.index, 'goldmine');
        bonus += goldmineCount * 100;

        const forgeCount = this.countOwnedSkillById(player.index, 'forge');
        if (forgeCount > 0 && player.shields < 6) {
            player.shields = Math.min(6, player.shields + forgeCount);
            UI.showToast(`${Utils.PLAYER_NAMES[player.index]} forged ${forgeCount} Shield${forgeCount > 1 ? 's' : ''}!`);
        }

        player.money += bonus;
        AudioManager.playSfx('coin');
        UI.showToast(`${Utils.PLAYER_NAMES[player.index]} passed GO! +${Utils.formatMoney(bonus)}`);
        UI.updateHUD(this.state);
    },

    // ---- LANDING HANDLER ----

    async handleLanding(player) {
        const space = Utils.BOARD_SPACES[player.position];
        if (!space) return;

        switch (space.type) {
            case 'skill':
                await this.handleSkillLanding(player, player.position);
                break;
            case 'tax':
                await this.handleTax(player, space);
                break;
            case 'fate':
                await this.handleFate(player);
                break;
            case 'goToJail':
                UI.showToast(`${Utils.PLAYER_NAMES[player.index]} goes to Jail!`);
                await Utils.wait(600);
                this.sendToJail(player);
                AudioManager.playSfx('jail');
                BoardRenderer.draw(this.state);
                break;
            case 'rest':
                if (player.shields < 6) {
                    player.shields++;
                    UI.showToast(`${Utils.PLAYER_NAMES[player.index]} rests and recovers a Shield! (${player.shields})`);
                    AudioManager.playSfx('coin');
                } else {
                    UI.showToast(`${Utils.PLAYER_NAMES[player.index]} rests. Shields already full!`);
                }
                UI.updateHUD(this.state);
                break;
            case 'jail':
            case 'go':
                break;
        }
    },

    // ---- SKILL LANDING ----

    async handleSkillLanding(player, spaceIdx) {
        const skillSlot = this.state.skills[spaceIdx];
        const skill = Utils.getSkillForSpace(spaceIdx);
        if (!skillSlot || !skill) return;

        if (skillSlot.owner === null) {
            // Unowned — offer to buy
            let price = skill.price;
            if (player.discount) {
                price = Math.floor(price / 2);
                player.discount = false;
            }
            const canAfford = player.money >= price;

            if (player.isAI) {
                await AI.delay();
                if (AI.shouldBuySkill(player, skill, price, this.state)) {
                    player.money -= price;
                    skillSlot.owner = player.index;
                    AudioManager.playSfx('buy');
                    UI.showToast(`${Utils.PLAYER_NAMES[player.index]} learned ${skill.name}!`);
                } else {
                    UI.showToast(`${Utils.PLAYER_NAMES[player.index]} passed on ${skill.name}`);
                }
            } else {
                const choice = await UI.showSkillBuyPanel(skill, spaceIdx, player, canAfford, price);
                if (choice === 'buy') {
                    player.money -= price;
                    skillSlot.owner = player.index;
                    UI.showToast(`You learned ${skill.name}!`);
                    AudioManager.playSfx('buy');
                }
            }
        } else if (skillSlot.owner !== player.index) {
            // Owned by opponent — trigger skill effect
            const owner = this.state.players[skillSlot.owner];
            if (owner.bankrupt) return;

            // Defense skill: healer gives owner money instead of attacking
            if (skill.id === 'healer') {
                owner.money += 150;
                AudioManager.playSfx('coin');
                if (player.isAI) {
                    UI.showToast(`${Utils.PLAYER_NAMES[owner.index]}'s Healer earns them $150`);
                    await AI.delay();
                } else {
                    await UI.showSkillEffectPanel(skill, owner.index, `${Utils.PLAYER_NAMES[owner.index]}'s Healer activates!\nThey gain $150.`, '#27ae60');
                }
                UI.updateHUD(this.state);
                return;
            }

            // Check if victim can use a shield
            const canShield = player.shields > 0;
            let useShield = false;

            if (canShield) {
                if (player.isAI) {
                    useShield = AI.shouldUseShield(player, skill, this.state);
                    await AI.delay();
                    if (useShield) {
                        UI.showToast(`${Utils.PLAYER_NAMES[player.index]} used a Shield Card to block ${skill.name}!`);
                    }
                } else {
                    useShield = await UI.showShieldPrompt(skill, owner.index, player);
                }
            }

            if (useShield) {
                player.shields--;
                AudioManager.playSfx('click');
                UI.updateHUD(this.state);
                BoardRenderer.draw(this.state);
                return;
            }

            // No shields & no cards → must surrender a skill if they have one
            if (player.shields <= 0 && this.getPlayerSkillCount(player.index) > 0) {
                let surrendered = false;
                if (player.isAI) {
                    const mySkills = this.getPlayerSkills(player.index);
                    if (mySkills.length > 0) {
                        const give = mySkills[Utils.rand(0, mySkills.length - 1)];
                        this.state.skills[give.spaceIdx].owner = owner.index;
                        UI.showToast(`${Utils.PLAYER_NAMES[player.index]} surrenders ${give.skill.name} to ${Utils.PLAYER_NAMES[owner.index]}!`);
                        surrendered = true;
                    }
                    await AI.delay();
                } else {
                    const mySkills = this.getPlayerSkills(player.index);
                    if (mySkills.length > 0) {
                        const chosenIdx = await UI.showSurrenderSkillPanel(player, mySkills, owner.index);
                        if (chosenIdx !== null) {
                            this.state.skills[chosenIdx].owner = owner.index;
                            const sk = Utils.getSkillForSpace(chosenIdx);
                            UI.showToast(`You surrendered ${sk.name} to ${Utils.PLAYER_NAMES[owner.index]}!`);
                            surrendered = true;
                        }
                    }
                }
                if (surrendered) {
                    AudioManager.playSfx('pay');
                    UI.updateHUD(this.state);
                    BoardRenderer.draw(this.state);
                    return;
                }
            }

            // Check passive defenses
            let damageMultiplier = 1;
            if (this.hasPassiveSkill(player.index, 'bodyguard')) {
                damageMultiplier = 0.5;
            }

            // Mirror shield check
            if (this.hasPassiveSkill(player.index, 'mirror') && Math.random() < 0.3) {
                // Reflect! Swap attacker/victim
                if (!player.isAI) {
                    await UI.showSkillEffectPanel(skill, player.index, `🪞 Mirror Shield reflects ${skill.name} back at ${Utils.PLAYER_NAMES[owner.index]}!`, '#3498db');
                } else {
                    UI.showToast(`${Utils.PLAYER_NAMES[player.index]}'s Mirror reflects ${skill.name}!`);
                    await AI.delay();
                }
                await this.executeSkillEffect(skill, owner, player, damageMultiplier);
                UI.updateHUD(this.state);
                BoardRenderer.draw(this.state);
                return;
            }

            // Execute the skill effect on the victim
            await this.executeSkillEffect(skill, player, owner, damageMultiplier);
            UI.updateHUD(this.state);
            BoardRenderer.draw(this.state);
        }
        // Landing on own skill — nothing happens

        UI.updateHUD(this.state);
        BoardRenderer.draw(this.state);
    },

    // ---- SKILL EFFECTS ----

    async executeSkillEffect(skill, victim, attacker, damageMultiplier) {
        const roll = this.state.lastRoll || Utils.rollDice();

        switch (skill.id) {
            case 'pickpocket': {
                let steal = roll.total * 100;
                steal = Math.floor(steal * damageMultiplier);
                steal = this.clampSteal(victim, steal);
                victim.money -= steal;
                attacker.money += steal;
                AudioManager.playSfx('pay');
                if (!victim.isAI) {
                    await UI.showSkillEffectPanel(skill, attacker.index, `${Utils.PLAYER_NAMES[attacker.index]}'s Pickpocket steals ${Utils.formatMoney(steal)}!`, '#e74c3c');
                } else {
                    UI.showToast(`${skill.icon} Pickpocket! ${Utils.PLAYER_NAMES[victim.index]} loses ${Utils.formatMoney(steal)}`);
                    await AI.delay();
                }
                break;
            }
            case 'ambush': {
                const victimSkills = this.getPlayerSkills(victim.index);
                if (victimSkills.length > 0) {
                    const stolen = victimSkills[Utils.rand(0, victimSkills.length - 1)];
                    this.state.skills[stolen.spaceIdx].owner = attacker.index;
                    const msg = `${Utils.PLAYER_NAMES[attacker.index]}'s Ambush steals ${stolen.skill.name}!`;
                    if (!victim.isAI) {
                        await UI.showSkillEffectPanel(skill, attacker.index, msg, '#c0392b');
                    } else {
                        UI.showToast(`${skill.icon} ${msg}`);
                        await AI.delay();
                    }
                } else {
                    let steal = Math.floor(200 * damageMultiplier);
                    steal = this.clampSteal(victim, steal);
                    victim.money -= steal;
                    attacker.money += steal;
                    AudioManager.playSfx('pay');
                    if (!victim.isAI) {
                        await UI.showSkillEffectPanel(skill, attacker.index, `${Utils.PLAYER_NAMES[attacker.index]}'s Ambush takes ${Utils.formatMoney(steal)}!`, '#c0392b');
                    } else {
                        UI.showToast(`${skill.icon} Ambush! ${Utils.PLAYER_NAMES[victim.index]} loses ${Utils.formatMoney(steal)}`);
                        await AI.delay();
                    }
                }
                break;
            }
            case 'sabotage': {
                let loss = Math.floor(victim.money / 2);
                loss = Math.floor(loss / 50) * 50;
                loss = Math.floor(loss * damageMultiplier);
                loss = this.clampSteal(victim, loss);
                victim.money -= loss;
                AudioManager.playSfx('pay');
                const msg = `${Utils.PLAYER_NAMES[attacker.index]}'s Sabotage destroys ${Utils.formatMoney(loss)}!`;
                if (!victim.isAI) {
                    await UI.showSkillEffectPanel(skill, attacker.index, msg, '#e67e22');
                } else {
                    UI.showToast(`${skill.icon} ${msg}`);
                    await AI.delay();
                }
                break;
            }
            case 'shakedown': {
                if (victim.shields > 0) {
                    victim.shields--;
                    attacker.shields = Math.min(6, attacker.shields + 1);
                    const msg = `${Utils.PLAYER_NAMES[attacker.index]}'s Shakedown steals a Shield Card!`;
                    if (!victim.isAI) {
                        await UI.showSkillEffectPanel(skill, attacker.index, msg, '#d35400');
                    } else {
                        UI.showToast(`${skill.icon} ${msg}`);
                        await AI.delay();
                    }
                } else {
                    let steal = Math.floor(300 * damageMultiplier);
                    steal = this.clampSteal(victim, steal);
                    victim.money -= steal;
                    attacker.money += steal;
                    AudioManager.playSfx('pay');
                    const msg = `${Utils.PLAYER_NAMES[attacker.index]}'s Shakedown takes ${Utils.formatMoney(steal)}!`;
                    if (!victim.isAI) {
                        await UI.showSkillEffectPanel(skill, attacker.index, msg, '#d35400');
                    } else {
                        UI.showToast(`${skill.icon} ${msg}`);
                        await AI.delay();
                    }
                }
                break;
            }
            case 'jinx': {
                this.sendToJail(victim);
                AudioManager.playSfx('jail');
                const msg = `${Utils.PLAYER_NAMES[attacker.index]}'s Jinx sends ${Utils.PLAYER_NAMES[victim.index]} to Jail!`;
                if (!victim.isAI) {
                    await UI.showSkillEffectPanel(skill, attacker.index, msg, '#8e44ad');
                } else {
                    UI.showToast(`${skill.icon} ${msg}`);
                    await AI.delay();
                }
                break;
            }
            case 'taxman': {
                const victimSkillCount = this.getPlayerSkillCount(victim.index);
                let tax = victimSkillCount * 50;
                tax = Math.floor(tax * damageMultiplier);
                tax = this.clampSteal(victim, tax);
                victim.money -= tax;
                attacker.money += tax;
                AudioManager.playSfx('pay');
                const msg = `${Utils.PLAYER_NAMES[attacker.index]}'s Tax Collector levies ${Utils.formatMoney(tax)}! (${victimSkillCount} skills)`;
                if (!victim.isAI) {
                    await UI.showSkillEffectPanel(skill, attacker.index, msg, '#e74c3c');
                } else {
                    UI.showToast(`${skill.icon} ${msg}`);
                    await AI.delay();
                }
                break;
            }
            case 'tollbooth': {
                let toll = Math.floor(200 * damageMultiplier);
                toll = this.clampSteal(victim, toll);
                victim.money -= toll;
                attacker.money += toll;
                AudioManager.playSfx('pay');
                const msg = `${Utils.PLAYER_NAMES[attacker.index]}'s Toll Booth charges ${Utils.formatMoney(toll)}!`;
                if (!victim.isAI) {
                    await UI.showSkillEffectPanel(skill, attacker.index, msg, '#e74c3c');
                } else {
                    UI.showToast(`${skill.icon} ${msg}`);
                    await AI.delay();
                }
                break;
            }
            case 'bounty': {
                const count = this.getPlayerSkillCount(victim.index);
                let bountyAmt = count * 100;
                bountyAmt = Math.floor(bountyAmt * damageMultiplier);
                bountyAmt = this.clampSteal(victim, bountyAmt);
                victim.money -= bountyAmt;
                attacker.money += bountyAmt;
                AudioManager.playSfx('pay');
                const msg = `${Utils.PLAYER_NAMES[attacker.index]}'s Bounty Hunter collects ${Utils.formatMoney(bountyAmt)}!`;
                if (!victim.isAI) {
                    await UI.showSkillEffectPanel(skill, attacker.index, msg, '#c0392b');
                } else {
                    UI.showToast(`${skill.icon} ${msg}`);
                    await AI.delay();
                }
                break;
            }
            default:
                break;
        }

        this.checkBankruptcy(victim);
    },

    clampSteal(victim, amount) {
        // Vault passive: money can't drop below $100
        if (this.hasPassiveSkill(victim.index, 'vault')) {
            const maxSteal = Math.max(0, victim.money - 100);
            return Math.min(amount, maxSteal);
        }
        return Math.min(amount, victim.money);
    },

    checkBankruptcy(player) {
        if (player.money <= 0 && this.getPlayerSkillCount(player.index) === 0 && player.shields <= 0) {
            player.money = 0;
            player.bankrupt = true;
            for (const [idx, s] of Object.entries(this.state.skills)) {
                if (s.owner === player.index) s.owner = null;
            }
            AudioManager.playSfx('pay');
        }
    },

    // ---- TAX ----

    async handleTax(player, space) {
        if (player.isAI) {
            await AI.delay();
            UI.showToast(`${Utils.PLAYER_NAMES[player.index]} pays ${Utils.formatMoney(space.amount)}`);
        } else {
            await UI.showTaxPanel(space);
        }
        player.money -= space.amount;
        if (player.money < 0) player.money = 0;
        this.checkBankruptcy(player);
        AudioManager.playSfx('pay');
        UI.updateHUD(this.state);
    },

    // ---- FATE CARDS ----

    async handleFate(player) {
        const card = this.state.fateCards[this.state.fateIdx];
        this.state.fateIdx = (this.state.fateIdx + 1) % this.state.fateCards.length;

        if (player.isAI) {
            await AI.delay();
            UI.showToast(`${Utils.PLAYER_NAMES[player.index]}: ${card.text}`);
            await Utils.wait(800);
        } else {
            await UI.showFatePanel(card);
        }

        await this.executeFate(player, card);
        UI.updateHUD(this.state);
        BoardRenderer.draw(this.state);
    },

    async executeFate(player, card) {
        switch (card.action) {
            case 'gain':
                player.money += card.value;
                AudioManager.playSfx('coin');
                break;
            case 'pay':
                player.money -= card.value;
                if (player.money < 0) player.money = 0;
                this.checkBankruptcy(player);
                AudioManager.playSfx('pay');
                break;
            case 'moveTo':
                if (card.value <= player.position) player.money += 200;
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
            case 'gainShield':
                player.shields = Math.min(6, player.shields + card.value);
                AudioManager.playSfx('coin');
                break;
            case 'loseShield':
                player.shields = Math.max(0, player.shields - card.value);
                AudioManager.playSfx('pay');
                break;
            case 'discount':
                player.discount = true;
                AudioManager.playSfx('coin');
                break;
            case 'gainPerSkill':
                const count = this.getPlayerSkillCount(player.index);
                player.money += count * card.value;
                AudioManager.playSfx('coin');
                break;
        }
    },

    // ---- JAIL ----

    sendToJail(player) {
        player.position = 8;
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

        const diceCanvas = document.getElementById('dice-canvas');
        const dctx = diceCanvas.getContext('2d');
        AudioManager.playSfx('roll');
        for (let i = 0; i < 12; i++) {
            Sprites.drawDicePair(dctx, diceCanvas.width, diceCanvas.height, null, null, true);
            await Utils.wait(50);
        }

        const roll = Utils.rollDice();
        Sprites.drawDicePair(dctx, diceCanvas.width, diceCanvas.height, roll.d1, roll.d2);

        if (roll.doubles) {
            player.inJail = false;
            player.jailTurns = 0;
            UI.showToast(`${Utils.PLAYER_NAMES[player.index]} rolled doubles and escaped!`);
            await Utils.wait(600);
            this.state.lastRoll = roll;
            await this.movePlayer(player, roll.total);
            await this.handleLanding(player);
        } else {
            player.jailTurns++;
            UI.showToast(`No doubles (${roll.d1}, ${roll.d2})`);
            if (player.jailTurns >= 3) {
                player.money -= 50;
                player.inJail = false;
                player.jailTurns = 0;
                if (player.money < 0) player.money = 0;
                this.checkBankruptcy(player);
                UI.showToast('Forced to pay $50 bail');
                await Utils.wait(500);
                this.state.lastRoll = roll;
                await this.movePlayer(player, roll.total);
                await this.handleLanding(player);
            }
        }

        UI.updateHUD(this.state);
        if (player.bankrupt && this.checkGameEnd()) return;
        this.nextPlayer();
    },

    // ---- AI TURN ----

    async doAITurn(player) {
        await Utils.wait(400);
        if (player.inJail) {
            await this.handleJail(player);
            return;
        }
        await this.doRoll(player);
    },

    // ---- TURN FLOW ----

    nextPlayer() {
        if (this.state.gameOver) return;

        let next = (this.state.currentPlayer + 1) % 4;
        let safety = 0;
        while (this.state.players[next].bankrupt && safety < 4) {
            next = (next + 1) % 4;
            safety++;
        }

        if (next <= this.state.currentPlayer) {
            this.state.round++;
            if (this.state.round > this.state.maxRounds) {
                this.endGame();
                return;
            }
        }

        this.state.currentPlayer = next;
        if (this.checkGameEnd()) return;
        setTimeout(() => this.startTurn(), 300);
    },

    checkGameEnd() {
        if (this.getActiveCount() <= 1) {
            this.endGame();
            return true;
        }
        return false;
    },

    endGame() {
        this.state.gameOver = true;
        this.running = false;
        AudioManager.playSfx('win');
        setTimeout(() => UI.showGameOver(this.state.players, this.state), 500);
    }
};
