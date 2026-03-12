// Panel Manager — settings panel, stats panel, help overlay
class PanelManager {
  constructor(audioManager) {
    this.audio = audioManager;
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
  }

  closeSettings() {
    document.getElementById('settingsOverlay').classList.remove('active');
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
  }

  closeStats() {
    document.getElementById('statsOverlay').classList.remove('active');
  }

  renderStats() {
    const stats = JSON.parse(localStorage.getItem('sudokuStats')) || {};
    const levels = ['basic', 'simple', 'easy', 'medium', 'hard', 'crazy'];
    const labels = ['Basic', 'Simple', 'Easy', 'Medium', 'Hard', 'Crazy'];
    const colors = ['#43a047', '#66bb6a', '#4a90e2', '#ffa726', '#ef5350', '#ab47bc'];

    const grid = document.getElementById('statsGrid');
    grid.innerHTML = '';

    let totalWins = 0;
    levels.forEach((level, i) => {
      const wins = stats[level] || 0;
      totalWins += wins;
      const card = document.createElement('div');
      card.className = 'stats-card';
      card.innerHTML = `
        <div class="stats-card-label" style="color:${colors[i]}">${labels[i]}</div>
        <div class="stats-card-value" style="color:${colors[i]}">${wins}</div>
        <div class="stats-card-sub">wins</div>
      `;
      grid.appendChild(card);
    });

    document.getElementById('statsTotalWins').textContent = totalWins;
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
  }

  closeHelp() {
    document.getElementById('helpOverlay').classList.remove('active');
  }
}
