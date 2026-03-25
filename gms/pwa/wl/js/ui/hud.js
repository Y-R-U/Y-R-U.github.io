import { UNIT_TYPES } from '../data/units.js';

/**
 * Manages DOM-based HUD: gold counter, turn label, info panel, city panel,
 * combat overlay, message log, flash messages, and game-over screen.
 */
export class HUD {
  /**
   * @param {object} elements - keyed DOM element references
   * @param {object} callbacks - { onEndTurn, onHireHero, onTrainUnit, onCityClose }
   */
  constructor(elements, callbacks) {
    this.el  = elements;
    this.cb  = callbacks;
    this._attachButtons();
  }

  _attachButtons() {
    this.el.endTurnBtn?.addEventListener('click', () => this.cb.onEndTurn());
    this.el.cityCloseBtn?.addEventListener('click', () => this.cb.onCityClose());
    this.el.combatOkBtn?.addEventListener('click', () => this.cb.onCombatOk());
  }

  // ---- Turn / Gold HUD ----

  /** @param {Player} player @param {number} turn */
  updateTurnInfo(player, turn) {
    if (this.el.turnLabel) {
      this.el.turnLabel.textContent = `Turn ${turn} — ${player.name}`;
    }
    if (this.el.factionDot) {
      this.el.factionDot.style.background = player.color;
    }
    if (this.el.goldDisplay) {
      this.el.goldDisplay.textContent = player.gold;
    }
    // Highlight "End Turn" for human only
    if (this.el.endTurnBtn) {
      this.el.endTurnBtn.disabled = !player.isHuman;
    }
  }

  updateGold(player) {
    if (this.el.goldDisplay) this.el.goldDisplay.textContent = player.gold;
  }

  // ---- Info Panel ----

  /** Show info for a selected army */
  showArmyInfo(army) {
    if (!this.el.infoContent) return;
    const hero    = army.hero;
    const color   = army.player.color;
    const heroHtml = hero
      ? `<div class="info-hero">★ <strong>${hero.name}</strong> Lvl ${hero.level}
           <span class="stat">ATK+${hero.attack} DEF+${hero.defense}</span>
           <div class="xp-bar"><div class="xp-fill" style="width:${Math.floor(hero.experience/hero.expToNext*100)}%"></div></div>
         </div>`
      : '';

    const unitRows = army.units.map(u => {
      const def = UNIT_TYPES[u.type];
      return `<div class="unit-row">
        <span class="unit-name">${def.name}</span>
        <span class="unit-stats">A:${def.attack} D:${def.defense} M:${def.move}</span>
      </div>`;
    }).join('');

    this.el.infoContent.innerHTML = `
      <div class="info-title" style="color:${color}">${army.player.name}</div>
      ${heroHtml}
      <div class="info-sub">Units (${army.units.length}/${army.maxUnits()})</div>
      ${unitRows}
      <div class="info-moves">Move: ${army.movePoints}/${army.maxMovePoints()}</div>
    `;
  }

  /** Show info for a city tile */
  showCityInfo(city) {
    if (!this.el.infoContent) return;
    const ownerName  = city.owner ? city.owner.name : 'Neutral';
    const ownerColor = city.owner ? city.owner.color : '#aaa';
    const garrison   = city.garrison.map(u => UNIT_TYPES[u.type]?.name ?? u.type).join(', ') || 'Empty';

    this.el.infoContent.innerHTML = `
      <div class="info-title" style="color:${ownerColor}">${city.name}</div>
      <div class="info-sub">${city.typeLabel()} — Owner: ${ownerName}</div>
      <div class="info-row">Income: ${city.incomePerTurn()} gold/turn</div>
      <div class="info-row">Defense bonus: +${city.defenseBonus}</div>
      <div class="info-row">Garrison: ${garrison}</div>
    `;
  }

  clearInfo() {
    if (this.el.infoContent) {
      this.el.infoContent.innerHTML = '<div class="info-placeholder">Click a unit or city</div>';
    }
  }

  // ---- City Management Panel ----

  /**
   * Show the city management panel for a player's own city.
   * @param {City} city
   * @param {Player} player
   * @param {Army|null} armyHere - army on same tile
   * @param {object} callbacks - { onHire, onTrain }
   */
  showCityPanel(city, player, armyHere, callbacks) {
    if (!this.el.cityPanel || !this.el.cityPanelContent) return;

    const canHire  = !armyHere?.hero;
    const hireCost = 40;
    const hireHtml = canHire
      ? `<button class="panel-btn" id="btn-hire-hero">Hire Hero (${hireCost}g)</button>`
      : `<div class="info-sub">Hero already present</div>`;

    const unitsHtml = city.availableUnits().map(id => {
      const def = UNIT_TYPES[id];
      const canAfford = player.gold >= def.cost;
      return `<button class="panel-btn unit-btn ${canAfford ? '' : 'btn-disabled'}"
                data-unit="${id}" ${canAfford ? '' : 'disabled'}>
        ${def.name} (${def.cost}g) A:${def.attack} D:${def.defense} M:${def.move}
      </button>`;
    }).join('');

    const garrisonHtml = city.garrison.length
      ? city.garrison.map(u => `<span class="garrison-unit">${UNIT_TYPES[u.type]?.name}</span>`).join(' ')
      : '<em>Empty garrison</em>';

    this.el.cityPanelContent.innerHTML = `
      <div class="panel-title">${city.name} <span class="panel-subtitle">${city.typeLabel()}</span></div>
      <div class="panel-gold">Treasury: <strong>${player.gold}g</strong></div>
      <div class="panel-section">
        <div class="panel-label">Garrison (${city.garrison.length}/${city.maxGarrison()})</div>
        <div class="panel-garrison">${garrisonHtml}</div>
      </div>
      <div class="panel-section">
        <div class="panel-label">Heroes</div>
        ${hireHtml}
      </div>
      <div class="panel-section">
        <div class="panel-label">Train Units</div>
        ${unitsHtml}
      </div>
    `;

    // Attach button events
    this.el.cityPanelContent.querySelector('#btn-hire-hero')
      ?.addEventListener('click', () => callbacks.onHire(city));

    this.el.cityPanelContent.querySelectorAll('.unit-btn').forEach(btn => {
      btn.addEventListener('click', () => callbacks.onTrain(city, btn.dataset.unit));
    });

    this.el.cityPanel.classList.remove('hidden');
  }

  hideCityPanel() {
    this.el.cityPanel?.classList.add('hidden');
  }

  // ---- Combat Overlay ----

  /**
   * Show combat result overlay.
   * @param {object} result - from resolveCombat
   * @param {string} atkName
   * @param {string} defName
   */
  showCombat(result, atkName, defName) {
    if (!this.el.combatOverlay) return;
    const winner = result.attackerWins ? atkName : defName;
    const summary = result.log.slice(-4).join('<br>');

    if (this.el.combatAttacker) this.el.combatAttacker.textContent = atkName ?? 'Attacker';
    if (this.el.combatDefender) this.el.combatDefender.textContent = defName ?? 'Defender';
    if (this.el.combatResult) {
      this.el.combatResult.innerHTML = `
        <strong>${winner}</strong> wins after ${result.rounds} rounds!<br>
        <small>${summary}</small>
      `;
    }
    this.el.combatOverlay.classList.remove('hidden');
  }

  hideCombat() {
    this.el.combatOverlay?.classList.add('hidden');
  }

  // ---- Message Log ----

  /** @param {string[]} log */
  updateLog(log) {
    if (!this.el.messageLog) return;
    this.el.messageLog.innerHTML = log.slice(0, 6).map(m =>
      `<div class="log-entry">${m}</div>`
    ).join('');
  }

  // ---- Flash Message ----

  /** @param {string|null} msg */
  updateFlash(msg) {
    if (!this.el.flashEl) return;
    if (msg) {
      this.el.flashEl.textContent = msg;
      this.el.flashEl.classList.remove('hidden');
    } else {
      this.el.flashEl.classList.add('hidden');
    }
  }

  // ---- Game Over ----

  /** @param {Player} winner */
  showGameOver(winner) {
    if (!this.el.gameOver) return;
    if (this.el.gameOverTitle) {
      this.el.gameOverTitle.textContent = winner.isHuman ? 'Victory!' : 'Defeated!';
      this.el.gameOverTitle.style.color = winner.color;
    }
    if (this.el.gameOverText) {
      this.el.gameOverText.textContent = winner.isHuman
        ? `${winner.name} has conquered the realm!`
        : `${winner.name} has claimed dominion over all lands.`;
    }
    this.el.gameOver.classList.remove('hidden');
  }
}
