/**
 * effects.js - Visual effects: coin fly-up, tap ripple, particles
 */

const Effects = (() => {
  let container = null;

  function init() {
    container = document.getElementById('effects-layer');
  }

  function coinFlyUp(x, y, value) {
    const el = document.createElement('div');
    el.className = 'coin-fly';
    el.textContent = '+' + Utils.formatCoins(value);

    // Randomize slightly
    const offsetX = Utils.randInt(-30, 30);
    el.style.left = (x + offsetX) + 'px';
    el.style.top = y + 'px';
    el.style.setProperty('--fly-x', Utils.randInt(-20, 20) + 'px');

    container.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  function tapRipple(x, y) {
    const el = document.createElement('div');
    el.className = 'tap-ripple';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    container.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  function dustParticle() {
    const scene = document.getElementById('scene-area');
    if (!scene) return;
    const rect = scene.getBoundingClientRect();

    const el = document.createElement('div');
    el.className = 'dust-particle';
    el.style.left = Utils.randInt(0, rect.width) + 'px';
    el.style.top = Utils.randInt(10, rect.height - 10) + 'px';
    el.style.animationDuration = Utils.randFloat(3, 7) + 's';
    el.style.opacity = Utils.randFloat(0.2, 0.5);
    el.style.width = el.style.height = Utils.randInt(2, 5) + 'px';

    scene.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  function showAchievement(name, icon) {
    const el = document.createElement('div');
    el.className = 'achievement-popup';
    el.innerHTML = `<span class="ach-icon">${icon}</span> <span class="ach-text">${name}</span>`;
    document.body.appendChild(el);

    // Trigger animation
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      el.classList.add('hide');
      setTimeout(() => el.remove(), 500);
    }, 3000);
  }

  function showOfflineEarnings(amount) {
    const overlay = document.createElement('div');
    overlay.className = 'offline-overlay';
    overlay.innerHTML = `
      <div class="offline-box">
        <div class="offline-title">Welcome Back, Partner!</div>
        <div class="offline-icon">\uD83E\uDD20</div>
        <div class="offline-amount">You earned ${Utils.formatCoins(amount)} while away</div>
        <button class="offline-btn" onclick="this.closest('.offline-overlay').remove()">Collect</button>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  // Start ambient dust particles
  let dustInterval = null;
  function startAmbientDust() {
    dustInterval = setInterval(dustParticle, 800);
  }

  function stopAmbientDust() {
    clearInterval(dustInterval);
  }

  return {
    init, coinFlyUp, tapRipple, dustParticle,
    showAchievement, showOfflineEarnings,
    startAmbientDust, stopAmbientDust
  };
})();
