/**
 * events.js - Random event spawning and management
 */

const Events = (() => {
  let sceneEl = null;
  const timers = {}; // next spawn time for each event

  function init() {
    sceneEl = document.getElementById('scene-area');
    // Initialize timers with random initial delays
    for (const ev of GameData.EVENTS) {
      timers[ev.id] = Date.now() + Utils.randInt(ev.minInterval, ev.maxInterval) * 1000;
    }
  }

  function update() {
    const now = Date.now();
    for (const ev of GameData.EVENTS) {
      if (now >= timers[ev.id]) {
        spawnEvent(ev);
        timers[ev.id] = now + Utils.randInt(ev.minInterval, ev.maxInterval) * 1000;
      }
    }
  }

  function spawnEvent(evDef) {
    if (!sceneEl) return;
    const rect = sceneEl.getBoundingClientRect();

    const el = document.createElement('div');
    el.className = 'random-event ' + evDef.cssClass;
    el.innerHTML = `<span class="event-icon">${evDef.icon}</span>`;
    el.title = evDef.name + ': ' + evDef.desc;

    // Position based on event type
    if (evDef.id === 'tumbleweed') {
      // Roll across the bottom of the scene
      el.style.top = (rect.height - 50) + 'px';
      el.style.left = '-50px';
      el.style.setProperty('--roll-distance', (rect.width + 100) + 'px');
    } else if (evDef.id === 'dustdevil') {
      // Swirl in from a side
      el.style.top = Utils.randInt(20, rect.height - 60) + 'px';
      el.style.left = '-50px';
      el.style.setProperty('--roll-distance', (rect.width + 100) + 'px');
    } else {
      // Float / appear at random position
      el.style.top = Utils.randInt(20, rect.height - 60) + 'px';
      el.style.left = Utils.randInt(20, rect.width - 60) + 'px';
    }

    // Click handler
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      activateEvent(evDef, el);
    });
    el.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      e.preventDefault();
      activateEvent(evDef, el);
    }, { passive: false });

    sceneEl.appendChild(el);

    // Remove after screen time
    setTimeout(() => {
      if (el.parentNode) {
        el.classList.add('event-fade-out');
        setTimeout(() => el.remove(), 300);
      }
    }, evDef.screenTime * 1000);
  }

  function activateEvent(evDef, el) {
    // Remove the element
    el.classList.add('event-collected');
    setTimeout(() => el.remove(), 300);

    const state = GameState.getState();
    state.eventsClicked++;

    // Apply effect
    if (evDef.effect === 'income_mult') {
      let mult = evDef.mult;
      if (evDef.id === 'snakeoil') {
        mult = Utils.randInt(2, 10);
      }
      GameState.addBuff(evDef.id, 'income_mult', mult, evDef.duration);
      UI.showToast(`${evDef.icon} ${evDef.name}: ${mult}x income for ${Utils.formatTime(evDef.duration)}!`);
    } else if (evDef.effect === 'tap_mult') {
      GameState.addBuff(evDef.id, 'tap_mult', evDef.mult, evDef.duration);
      UI.showToast(`${evDef.icon} ${evDef.name}: ${evDef.mult}x tap for ${Utils.formatTime(evDef.duration)}!`);
    } else if (evDef.effect === 'instant_income') {
      const bonus = GameState.getTotalIncomePerSec() * evDef.mult;
      if (bonus > 0) {
        state.coins += bonus;
        state.totalEarned += bonus;
        state.lifetimeEarned += bonus;
        UI.showToast(`${evDef.icon} ${evDef.name}: +${Utils.formatCoins(bonus)}!`);
      } else {
        // Fallback if no income yet: give 10x tap value
        const fallback = GameState.getTapValue() * 10;
        state.coins += fallback;
        state.totalEarned += fallback;
        state.lifetimeEarned += fallback;
        UI.showToast(`${evDef.icon} ${evDef.name}: +${Utils.formatCoins(fallback)}!`);
      }
    }
  }

  return { init, update };
})();
