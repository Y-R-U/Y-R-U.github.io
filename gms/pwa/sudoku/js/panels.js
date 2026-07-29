// Panel Manager — settings panel, stats panel, help overlay
class PanelManager {
  constructor(audioManager, hooks = {}) {
    this.audio = audioManager;
    this.onOpen = hooks.onOpen || (() => {});
    this.onClose = hooks.onClose || (() => {});
    this.getStats = hooks.getStats || (() => JSON.parse(localStorage.getItem('sudokuStats') || '{}'));
    this.getHintPref = hooks.getHintPref || (() => true);
    this.setHintPref = hooks.setHintPref || (() => {});
    this.initSettingsPanel();
    this.initStatsPanel();
    this.initHelpPanel();
    // Esc closes whichever panel is on top, so a keyboard user is never stuck.
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      const open = document.querySelector('.panel-overlay.active');
      if (!open) return;
      open.classList.remove('active');
      this.onClose();
      e.preventDefault();
    });
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
    const hintToggle  = document.getElementById('hintToggle');

    musicToggle.checked = this.audio.musicEnabled;
    soundToggle.checked = this.audio.soundEnabled;
    hintToggle.checked  = this.getHintPref();

    musicToggle.addEventListener('change', () => this.audio.setMusic(musicToggle.checked));
    soundToggle.addEventListener('change', () => this.audio.setSound(soundToggle.checked));
    hintToggle.addEventListener('change', () => this.setHintPref(hintToggle.checked));

    document.getElementById('helpBtn').addEventListener('click', () => {
      this.closeSettings();
      setTimeout(() => this.openHelp(), 200);
    });
  }

  openSettings() {
    // Cloud sync can change these underneath us, so re-read on open.
    document.getElementById('musicToggle').checked = this.audio.musicEnabled;
    document.getElementById('soundToggle').checked = this.audio.soundEnabled;
    document.getElementById('hintToggle').checked = this.getHintPref();
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

  static get LEVEL_CARDS() {
    return [
      { level: 'basic',  label: 'Basic',  color: '#43a047' },
      { level: 'simple', label: 'Simple', color: '#66bb6a' },
      { level: 'easy',   label: 'Easy',   color: '#4a90e2' },
      { level: 'medium', label: 'Medium', color: '#ffa726' },
      { level: 'hard',   label: 'Hard',   color: '#ef5350' },
      { level: 'crazy',  label: 'Crazy',  color: '#ab47bc' },
    ];
  }

  renderStats() {
    const stats = this.getStats();
    const grid = document.getElementById('statsGrid');
    grid.innerHTML = '';

    let totalWins = 0;
    for (const { level, label, color } of PanelManager.LEVEL_CARDS) {
      const entry = stats[level] || {};
      const wins = entry.wins || 0;
      totalWins += wins;
      const best = entry.bestMs != null ? this.formatTime(entry.bestMs) : '—';
      const hints = entry.hints || 0;

      const card = document.createElement('div');
      card.className = 'stats-card';
      card.innerHTML = `
        <div class="stats-card-label" style="color:${color}">${label}</div>
        <div class="stats-card-value" style="color:${color}">${wins}</div>
        <div class="stats-card-sub">wins</div>
        <div class="stats-card-best" title="Best time, no hints">${best}</div>
        <div class="stats-card-hints">${hints ? `${hints} hint${hints === 1 ? '' : 's'}` : '&nbsp;'}</div>
      `;
      grid.appendChild(card);
    }

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
