// Panel Manager — settings panel, stats panel, help overlay
class PanelManager {
  constructor(audioManager, hooks = {}) {
    this.audio = audioManager;
    this.onOpen = hooks.onOpen || (() => {});
    this.onClose = hooks.onClose || (() => {});
    this.getStats = hooks.getStats || (() => JSON.parse(localStorage.getItem('sudokuStats')) || {});
    this.initSettingsPanel();
    this.initStatsPanel();
    this.initHelpPanel();
  }

  // ── Settings Panel ──────────────────────────────────────────────────────────
  initSettingsPanel() {
    document.getElementById('settingsBtn').addEventListener('click', () => this.openSettings());
    document.getElementById('settingsClose').addEventListener('click', () => this.closeSettings());
    document.getElementById('settingsOverlay').addEventListener('click', e => {
      if (e.target.id === 'settingsOverlay') this.closeSettings();
    });

    const musicToggle = document.getElementById('musicToggle');
    const soundToggle = document.getElementById('soundToggle');

    musicToggle.checked = this.audio.musicEnabled;
    soundToggle.checked = this.audio.soundEnabled;

    musicToggle.addEventListener('change', () => {
      this.audio.setMusic(musicToggle.checked);
    });
    soundToggle.addEventListener('change', () => {
      this.audio.setSound(soundToggle.checked);
    });

    document.getElementById('helpBtn').addEventListener('click', () => {
      this.closeSettings();
      setTimeout(() => this.openHelp(), 200);
    });
  }

  openSettings() {
    document.getElementById('settingsOverlay').classList.add('active');
    this.onOpen();
  }

  closeSettings() {
    document.getElementById('settingsOverlay').classList.remove('active');
    this.onClose();
  }

  // ── Stats Panel ─────────────────────────────────────────────────────────────
  initStatsPanel() {
    document.getElementById('statsBtn').addEventListener('click', () => this.openStats());
    document.getElementById('statsClose').addEventListener('click', () => this.closeStats());
    document.getElementById('statsOverlay').addEventListener('click', e => {
      if (e.target.id === 'statsOverlay') this.closeStats();
    });
  }

  openStats() {
    this.renderStats();
    document.getElementById('statsOverlay').classList.add('active');
    this.onOpen();
  }

  closeStats() {
    document.getElementById('statsOverlay').classList.remove('active');
    this.onClose();
  }

  renderStats() {
    const stats = this.getStats();
    const levels = ['basic', 'simple', 'easy', 'medium', 'hard', 'crazy'];
    const labels = ['Basic', 'Simple', 'Easy', 'Medium', 'Hard', 'Crazy'];
    const colors = ['#43a047', '#66bb6a', '#4a90e2', '#ffa726', '#ef5350', '#ab47bc'];

    const grid = document.getElementById('statsGrid');
    grid.innerHTML = '';

    let totalWins = 0;
    levels.forEach((level, i) => {
      const entry = stats[level] || { wins: 0, bestMs: null };
      const wins = entry.wins || 0;
      const bestMs = entry.bestMs;
      totalWins += wins;
      const best = bestMs != null ? this.formatTime(bestMs) : '—';
      const card = document.createElement('div');
      card.className = 'stats-card';
      card.innerHTML = `
        <div class="stats-card-label" style="color:${colors[i]}">${labels[i]}</div>
        <div class="stats-card-value" style="color:${colors[i]}">${wins}</div>
        <div class="stats-card-sub">wins</div>
        <div class="stats-card-best" title="Best time">${best}</div>
      `;
      grid.appendChild(card);
    });

    document.getElementById('statsTotalWins').textContent = totalWins;
  }

  formatTime(ms) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = n => n.toString().padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  // ── Help Panel ──────────────────────────────────────────────────────────────
  initHelpPanel() {
    document.getElementById('helpClose').addEventListener('click', () => this.closeHelp());
    document.getElementById('helpOverlay').addEventListener('click', e => {
      if (e.target.id === 'helpOverlay') this.closeHelp();
    });
  }

  openHelp() {
    document.getElementById('helpOverlay').classList.add('active');
    this.onOpen();
  }

  closeHelp() {
    document.getElementById('helpOverlay').classList.remove('active');
    this.onClose();
  }
}
