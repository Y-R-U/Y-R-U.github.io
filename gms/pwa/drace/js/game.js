/* DRace - Game Logic */
const Game = (() => {
    let players = [];
    let squares = [];
    let currentPlayerIndex = 0;
    let turn = 1;
    let finishCount = 0;
    let gameOver = false;
    let boardSize = 45;
    let processing = false;

    function create(playerName, playerCount, size) {
        boardSize = size;
        squares = Effects.generateBoard(boardSize);
        players = [];
        finishCount = 0;
        gameOver = false;
        turn = 1;
        currentPlayerIndex = 0;
        processing = false;

        // Create human player
        players.push(new Player(0, playerName, true));

        // Create AI players
        const aiNames = AI_NAMES.slice(0, playerCount - 1);
        for (let i = 0; i < aiNames.length; i++) {
            players.push(new Player(i + 1, aiNames[i], false));
        }

        // Init board
        Board.init(document.getElementById('game-board'), document.getElementById('board-container'));
        Board.setBoard(squares, players);

        // UI
        UI.showScreen('screen-game');
        UI.updateHUD(players[currentPlayerIndex], turn);
        UI.updatePlayerStats(players, currentPlayerIndex, boardSize);
        UI.setRollEnabled(true);
        Dice.renderDiceFace(0);

        // Music
        Audio.playMusic();

        // Start game - check if first player needs to skip
        checkCurrentTurn();
    }

    function checkCurrentTurn() {
        const p = players[currentPlayerIndex];
        if (p.finished) {
            nextPlayer();
            return;
        }
        if (p.skipNextTurn) {
            p.skipNextTurn = false;
            UI.showToast(`${p.name} is frozen! Skipping turn.`, 'negative');
            setTimeout(() => nextPlayer(), 1200);
            return;
        }

        UI.updateHUD(p, turn);
        UI.updatePlayerStats(players, currentPlayerIndex, boardSize);
        UI.setRollEnabled(p.isHuman);

        if (!p.isHuman) {
            // AI auto-roll after delay
            setTimeout(() => doRoll(), 800);
        }
    }

    async function doRoll() {
        if (processing || gameOver) return;
        processing = true;

        const p = players[currentPlayerIndex];
        const rawRoll = Dice.roll();
        const effectiveRoll = p.getEffectiveRoll(rawRoll);

        Audio.sfxRoll();
        await Dice.animateRoll(rawRoll);

        // Show effective roll if different
        if (effectiveRoll !== rawRoll) {
            UI.showToast(`Rolled ${rawRoll} + bonuses = ${effectiveRoll}`, 'info');
        }

        // Calculate available choices (squares from current+1 to current+effectiveRoll)
        const choices = [];
        for (let i = 1; i <= effectiveRoll; i++) {
            const target = p.position + i;
            if (target < boardSize) {
                choices.push(target);
            } else if (target >= boardSize - 1) {
                // Can reach or pass finish
                if (!choices.includes(boardSize - 1)) {
                    choices.push(boardSize - 1);
                }
                break;
            }
        }

        if (choices.length === 0) {
            // No valid moves
            UI.showToast(`${p.name} can't move!`, 'info');
            processing = false;
            nextPlayer();
            return;
        }

        // Focus board on choices area
        const midChoice = choices[Math.floor(choices.length / 2)];
        Board.focusOnSquare(midChoice);

        if (p.isHuman) {
            // Show choice UI and highlight board squares
            Board.setHighlightSquares(choices, (idx) => {
                Board.clearHighlight();
                UI.hideChoices();
                landOnSquare(idx);
            });
            UI.showChoices(choices, squares, (idx) => {
                Board.clearHighlight();
                landOnSquare(idx);
            });
        } else {
            // AI chooses
            const chosen = AI.chooseSquare(p, choices, squares, players);
            Board.setHighlightSquares(choices, null);
            setTimeout(() => {
                Board.clearHighlight();
                landOnSquare(chosen);
            }, 600);
        }
    }

    function landOnSquare(targetIdx) {
        const p = players[currentPlayerIndex];
        p.position = targetIdx;
        Board.focusOnSquare(targetIdx);
        Audio.sfxLand();

        // Check finish
        if (targetIdx >= boardSize - 1) {
            p.finished = true;
            p.finishOrder = finishCount;
            finishCount++;
            const ordinals = ['1st', '2nd', '3rd', '4th'];
            UI.showToast(`${p.name} finishes ${ordinals[p.finishOrder]}! 🏁`, 'positive');
            Audio.sfxWin();

            UI.updatePlayerStats(players, currentPlayerIndex, boardSize);

            // Check game over
            if (finishCount >= players.length - 1 || players.every(pp => pp.finished)) {
                setTimeout(() => endGame(), 1500);
                return;
            }

            processing = false;
            setTimeout(() => nextPlayer(), 1000);
            return;
        }

        // Apply square effect
        const sq = squares[targetIdx];
        const result = Effects.applyEffect(p, sq.effect);

        UI.updatePlayerStats(players, currentPlayerIndex, boardSize);

        if (result.message) {
            // Play appropriate sound
            if (result.toastType === 'positive') Audio.sfxPositive();
            else if (result.toastType === 'negative') Audio.sfxNegative();
            else if (result.toastType === 'treasure') Audio.sfxTreasure();

            // Show effect panel for human, toast for AI
            if (p.isHuman && sq.effect.id !== 'empty' && sq.effect.id !== 'start') {
                UI.showEffectPanel(sq.effect, p.name, () => {
                    handleExtraAction(result.extraAction);
                });
            } else {
                UI.showToast(result.message, result.toastType);
                setTimeout(() => handleExtraAction(result.extraAction), 800);
            }
        } else {
            processing = false;
            setTimeout(() => nextPlayer(), 500);
        }
    }

    function handleExtraAction(action) {
        if (!action) {
            processing = false;
            setTimeout(() => nextPlayer(), 400);
            return;
        }

        const p = players[currentPlayerIndex];

        switch (action.type) {
            case 'move': {
                const newPos = Math.max(0, Math.min(boardSize - 1, p.position + action.amount));
                p.position = newPos;
                Board.focusOnSquare(newPos);
                UI.updatePlayerStats(players, currentPlayerIndex, boardSize);

                if (newPos >= boardSize - 1) {
                    p.finished = true;
                    p.finishOrder = finishCount;
                    finishCount++;
                    UI.showToast(`${p.name} reaches the finish!`, 'positive');
                    Audio.sfxWin();
                    if (finishCount >= players.length - 1) {
                        setTimeout(() => endGame(), 1500);
                        return;
                    }
                    processing = false;
                    setTimeout(() => nextPlayer(), 1000);
                    return;
                }
                processing = false;
                setTimeout(() => nextPlayer(), 600);
                break;
            }
            case 'roll_again':
                processing = false;
                UI.showToast(`${p.name} rolls again!`, 'positive');
                UI.setRollEnabled(p.isHuman);
                if (!p.isHuman) {
                    setTimeout(() => doRoll(), 800);
                }
                break;
            case 'skip_opponent': {
                // Skip next player's turn
                const nextIdx = (currentPlayerIndex + 1) % players.length;
                const target = players[nextIdx];
                if (!target.finished) {
                    target.skipNextTurn = true;
                    UI.showToast(`${target.name}'s next turn is frozen!`, 'info');
                }
                processing = false;
                setTimeout(() => nextPlayer(), 600);
                break;
            }
            case 'swap': {
                // Swap with random other non-finished player
                const others = players.filter((pp, i) => i !== currentPlayerIndex && !pp.finished);
                if (others.length > 0) {
                    const other = others[Math.floor(Math.random() * others.length)];
                    const tmpPos = p.position;
                    p.position = other.position;
                    other.position = tmpPos;
                    Board.focusOnSquare(p.position);
                    UI.updatePlayerStats(players, currentPlayerIndex, boardSize);
                    UI.showToast(`${p.name} swapped places with ${other.name}!`, 'info');
                }
                processing = false;
                setTimeout(() => nextPlayer(), 800);
                break;
            }
            case 'teleport': {
                // Teleport forward 3-8 squares randomly
                const teleportDist = 3 + Math.floor(Math.random() * 6);
                const newPos = Math.min(boardSize - 1, p.position + teleportDist);
                p.position = newPos;
                Board.focusOnSquare(newPos);
                UI.updatePlayerStats(players, currentPlayerIndex, boardSize);
                UI.showToast(`${p.name} teleported ${teleportDist} spaces forward!`, 'positive');

                if (newPos >= boardSize - 1) {
                    p.finished = true;
                    p.finishOrder = finishCount;
                    finishCount++;
                    if (finishCount >= players.length - 1) {
                        setTimeout(() => endGame(), 1500);
                        return;
                    }
                }
                processing = false;
                setTimeout(() => nextPlayer(), 600);
                break;
            }
            case 'steal': {
                const stealTargets = players.filter((pp, i) => i !== currentPlayerIndex && pp.treasure > 0);
                if (stealTargets.length > 0) {
                    const victim = stealTargets[Math.floor(Math.random() * stealTargets.length)];
                    const stolen = Math.min(action.amount, victim.treasure);
                    victim.treasure -= stolen;
                    p.treasure += stolen;
                    UI.updatePlayerStats(players, currentPlayerIndex, boardSize);
                    UI.showToast(`${p.name} stole ${stolen} pts from ${victim.name}!`, 'treasure');
                } else {
                    UI.showToast('No one has treasure to steal!', 'info');
                }
                processing = false;
                setTimeout(() => nextPlayer(), 600);
                break;
            }
            default:
                processing = false;
                setTimeout(() => nextPlayer(), 400);
        }
    }

    function nextPlayer() {
        if (gameOver) return;

        // Advance to next non-finished player
        let attempts = 0;
        do {
            currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
            attempts++;
            if (currentPlayerIndex === 0) turn++;
        } while (players[currentPlayerIndex].finished && attempts < players.length * 2);

        if (attempts >= players.length * 2) {
            endGame();
            return;
        }

        checkCurrentTurn();
    }

    function endGame() {
        gameOver = true;
        Audio.stopMusic();
        Board.destroy();

        // Mark any unfinished players
        players.forEach(p => {
            if (!p.finished) {
                p.finishOrder = finishCount;
                finishCount++;
            }
        });

        // Calculate scores & sort
        const results = players.map(p => ({
            name: p.name,
            color: p.color,
            score: p.getScore(boardSize),
            treasure: p.treasure,
            finishOrder: p.finishOrder,
            finished: p.finished,
            isHuman: p.isHuman
        })).sort((a, b) => b.score - a.score);

        // Show results screen
        const list = document.getElementById('results-list');
        list.innerHTML = results.map((r, i) => {
            const rankClass = i === 0 ? 'first' : i === 1 ? 'second' : i === 2 ? 'third' : '';
            return `
                <div class="result-row ${i === 0 ? 'winner' : ''}">
                    <div class="result-rank ${rankClass}">#${i + 1}</div>
                    <div class="player-avatar" style="background:${r.color}">${r.name.charAt(0)}</div>
                    <div class="result-info">
                        <div class="result-name">${r.name} ${r.isHuman ? '' : '&#129302;'}</div>
                        <div class="result-details">
                            ${r.finished ? `Finished ${['1st', '2nd', '3rd', '4th'][r.finishOrder]}` : 'Did not finish'}
                            &middot; &#128176;${r.treasure} treasure
                        </div>
                    </div>
                    <div class="result-score">${r.score}</div>
                </div>
            `;
        }).join('');

        // Check if human won
        const title = document.getElementById('results-title');
        if (results[0].isHuman) {
            title.textContent = 'You Win!';
            Audio.sfxWin();
        } else {
            title.textContent = 'Race Complete!';
        }

        UI.showScreen('screen-results');
    }

    // Expose doRoll to be called from UI
    return {
        create,
        doRoll,
        get players() { return players; },
        get squares() { return squares; },
        get currentPlayerIndex() { return currentPlayerIndex; },
        get boardSize() { return boardSize; },
        get gameOver() { return gameOver; }
    };
})();
