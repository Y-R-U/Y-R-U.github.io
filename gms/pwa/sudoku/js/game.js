// Generation runs in a worker so a slow Hard/Crazy carve never freezes the
// board. If the worker can't start (file://, old browser) it falls back to the
// main thread.
class PuzzleSource {
  constructor(engine) {
    this.engine = engine;
    this.seq = 0;
    this.waiting = new Map();
    try {
      this.worker = new Worker('./js/gen-worker.js');
      this.worker.onmessage = e => {
        const job = this.waiting.get(e.data.id);
        if (!job) return;
        this.waiting.delete(e.data.id);
        job.resolve(e.data.puzzle);
      };
      this.worker.onerror = () => this.fallBack();
    } catch (e) { this.worker = null; }
  }

  fallBack() {
    this.worker = null;
    const jobs = [...this.waiting.values()];
    this.waiting.clear();
    for (const job of jobs) this.runLocally(job);
  }

  runLocally(job) {
    setTimeout(() => job.resolve(this.engine.generatePuzzle(job.level, job.seed)), 0);
  }

  get(level, seed) {
    return new Promise(resolve => {
      const job = { level, seed, resolve };
      if (!this.worker) return this.runLocally(job);
      const id = ++this.seq;
      this.waiting.set(id, job);
      this.worker.postMessage({ id, level, seed });
    });
  }
}

// Main Sudoku Game — state management, UI rendering, user interaction
class SudokuGame {
  constructor() {
    this.engine = new SudokuEngine();
    this.source = new PuzzleSource(this.engine);
    this.audioManager = new AudioManager();

    // Core grid state
    this.grid     = SudokuGame.make9x9(0);
    this.solution = SudokuGame.make9x9(0);
    this.given    = SudokuGame.make9x9(false);
    this.level    = 'easy';
    this.daily    = null;          // UTC date string while playing a daily
    this.selected = null;
    this.lastNumber = 0;           // the armed digit for fast-fill
    this.history  = [];

    // Pencil marks. One 9-bit mask per cell: bit 0 = digit 1 … bit 8 = digit 9.
    this.notes = SudokuGame.make9x9(0);
    this.notesMode = false;

    this.stats = this.migrateStats(SudokuGame.readJSON('sudokuStats', {}));
    this.prefs = Object.assign({ fastFill: true, hideMistakes: false }, SudokuGame.readJSON('sudokuPrefs', {}));
    this.showHint = localStorage.getItem('sudokuHintBtn') !== 'off';
    this.deferredPrompt = null;

    // Timer state — elapsedMs is the persisted total; when running, the live
    // value is elapsedMs + (Date.now() - timerStart).
    this.elapsedMs   = 0;
    this.timerStart  = 0;
    this.timerRunning = false;
    this.timerInterval = null;
    this.solved = false;

    this.generating = false;
    this.genToken = 0;
    this.spare = null;             // a pre-generated { level, puzzle }

    // Per-puzzle scoring state
    this.mistakes = 0;
    this.hintsUsed = 0;
    this.hintInfo = null;
    this.armed = null;
    this.lastInputAt = 0;

    this.saveTimer = null;

    this.checkPWAInstalled();
    this.init();
  }

  static make9x9(value) {
    return Array(9).fill(null).map(() => Array(9).fill(value));
  }

  static readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
  }

  // Dailies use the UTC date so two devices agree on what "today" is.
  static todayUTC(offsetDays = 0) {
    return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
  }

  static dayBefore(date) {
    return new Date(Date.parse(date + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  }

  // Weekdays are Medium, weekends Hard.
  static dailyLevel(date) {
    const dow = new Date(date + 'T00:00:00Z').getUTCDay();
    return dow === 0 || dow === 6 ? 'hard' : 'medium';
  }

  // ── Initialise ──────────────────────────────────────────────────────────────
  init() {
    this.createGrid();
    this.createPad();
    this.loadGame();

    document.querySelectorAll('.diff-btn').forEach(btn =>
      btn.addEventListener('click', () => this.changeDifficulty(btn.dataset.level, btn))
    );

    document.getElementById('newGame').addEventListener('click', e => this.confirmNewGame(e.currentTarget));
    document.getElementById('undoBtn').addEventListener('click', () => this.undo());
    document.getElementById('notesToggle').addEventListener('click', () => this.toggleNotesMode());
    document.getElementById('clearCell').addEventListener('click', () => this.handleClear());
    document.getElementById('hintBtn').addEventListener('click', () => this.useHint());
    document.getElementById('autoBtn').addEventListener('click', () => this.autoCandidates());
    document.getElementById('dailyBtn').addEventListener('click', () => this.requestDaily());
    document.getElementById('message').addEventListener('click', e => {
      const btn = e.target.closest && e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'restart') this.armConfirm(btn, () => this.newGame());
      if (action === 'next') this.newGame();
      if (action === 'review') this.revealMistakes();
      if (action === 'daily') { this.hideMessage(); this.newGame({ daily: SudokuGame.todayUTC() }); }
      if (action === 'dismiss') this.hideMessage();
    });

    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      this.deferredPrompt = e;
      document.getElementById('installBtn').style.display = 'block';
    });
    document.getElementById('installBtn').addEventListener('click', () => this.installApp());

    // Panels — give them pause/resume hooks so the timer freezes while open
    this.panels = new PanelManager(this.audioManager, {
      onOpen: () => this.pauseTimer(),
      onClose: () => this.resumeIfIdle(),
      getStats: () => this.stats,
      getHintPref: () => this.showHint,
      setHintPref: on => this.setHintVisible(on),
      getPrefs: () => this.prefs,
      setPref: (k, v) => this.setPref(k, v)
    });

    document.addEventListener('keydown', e => this.handleKey(e));

    // A backgrounded tab must not keep clocking up time — best times are a
    // stat, and leaving the app open over lunch would otherwise ruin them.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pauseTimer();
      else this.resumeIfIdle();
    });
    window.addEventListener('pagehide', () => this.flushSave());

    this.setHintVisible(this.showHint);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .catch(err => console.warn('SW registration failed', err));
    }
  }

  // ── DOM creation ────────────────────────────────────────────────────────────
  createGrid() {
    const gridEl = document.getElementById('grid');
    gridEl.innerHTML = '';
    this.cells = [];
    for (let i = 0; i < 81; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.index = i;
      cell.setAttribute('role', 'gridcell');
      cell.tabIndex = -1;
      cell.addEventListener('click', () => this.selectCell(i));
      // A long press is just a slow tap now that the pad is always there.
      cell.addEventListener('contextmenu', e => { e.preventDefault(); if (this.selected !== i) this.selectCell(i); });
      gridEl.appendChild(cell);
      this.cells.push(cell);
    }
  }

  // The number pad doubles as the "how many are left" strip.
  createPad() {
    const pad = document.getElementById('pad');
    pad.innerHTML = '';
    this.padKeys = [];
    for (let n = 1; n <= 9; n++) {
      const key = document.createElement('button');
      key.className = 'pad-key';
      key.innerHTML = `<span class="pad-n">${n}</span><span class="pad-left"></span>`;
      key.addEventListener('click', () => this.padDigit(n));
      pad.appendChild(key);
      this.padKeys.push(key);
    }
  }

  // ── New game ────────────────────────────────────────────────────────────────
  locked() { return this.solved || this.generating; }

  newGame(opts = {}) {
    const daily = opts.daily || null;
    const level = daily ? SudokuGame.dailyLevel(daily) : this.level;
    const token = ++this.genToken;
    this.disarm();
    if (!daily && this.spare && this.spare.level === level) {
      const puzzle = this.spare.puzzle;
      this.spare = null;
      this.startPuzzle(puzzle, level, null);
      return;
    }
    this.setGenerating(true);
    this.source.get(level, daily ? `daily-${daily}` : undefined).then(puzzle => {
      if (token !== this.genToken) return;
      this.setGenerating(false);
      this.startPuzzle(puzzle, level, daily);
    });
  }

  startPuzzle(puzzle, level, daily) {
    this.level    = level;
    this.daily    = daily;
    this.grid     = puzzle.grid;
    this.solution = puzzle.solution;
    this.given    = puzzle.given;
    this.notes    = SudokuGame.make9x9(0);
    this.history  = [];
    this.selected = null;
    this.lastNumber = 0;
    this.mistakes = 0;
    this.hintsUsed = 0;
    this.hintInfo = null;
    this.notesMode = false;
    this.resetTimer();
    this.startTimer();
    this.syncDifficultyButtons();
    this.hideMessage();
    this.saveGame();
    this.render();
    this.prefetch();
  }

  setGenerating(on) {
    this.generating = on;
    document.getElementById('grid').classList.toggle('generating', on);
    if (on) {
      this.pauseTimer();
      this.showMessage('Generating…', 'info');
    } else {
      this.hideMessage();
    }
  }

  // Have the next puzzle for this level ready before the player asks for it.
  prefetch() {
    const level = this.level;
    if (this.spare && this.spare.level === level) return;
    if (this.prefetching === level) return;
    this.prefetching = level;
    const idle = window.requestIdleCallback || (fn => setTimeout(fn, 200));
    idle(() => this.source.get(level).then(puzzle => {
      if (this.prefetching === level) this.prefetching = null;
      this.spare = { level, puzzle };
    }));
  }

  changeDifficulty(level, btn) {
    if (this.generating) return;
    if (level === this.level && !this.daily) return;
    const go = () => { this.level = level; this.newGame(); };
    if (this.hasProgress() && !this.solved) this.armConfirm(btn, go);
    else go();
  }

  syncDifficultyButtons() {
    document.querySelectorAll('.diff-btn').forEach(btn => {
      const on = btn.dataset.level === this.level;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    document.getElementById('autoBtn').hidden = !(this.level === 'hard' || this.level === 'crazy');
    const chip = document.getElementById('dailyChip');
    chip.hidden = !this.daily;
    if (this.daily) {
      const day = new Date(this.daily + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
      chip.querySelector('span').textContent = `Daily · ${day}`;
    }
  }

  // True iff the player has touched the puzzle (filled or cleared anything,
  // or added notes). Used to decide whether to confirm destructive actions.
  hasProgress() {
    if (this.history.length) return true;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (!this.given[r][c] && this.grid[r][c] !== 0) return true;
        if (this.notes[r][c]) return true;
      }
    }
    return false;
  }

  // ── Confirmation without a dialog ───────────────────────────────────────────
  // A destructive button asks to be tapped again; after 3s it lets go.
  armConfirm(btn, run) {
    if (this.armed && this.armed.btn === btn) { this.disarm(); run(); return; }
    this.disarm();
    this.armed = { btn, html: btn.innerHTML, timer: setTimeout(() => this.disarm(), 3000) };
    btn.classList.add('confirming');
    btn.textContent = 'Tap again';
  }

  disarm() {
    if (!this.armed) return;
    const { btn, html, timer } = this.armed;
    this.armed = null;
    clearTimeout(timer);
    btn.innerHTML = html;
    btn.classList.remove('confirming');
    this.syncDifficultyButtons();
  }

  confirmNewGame(btn) {
    if (this.generating) return;
    if (!this.hasProgress() || this.solved) this.newGame();
    else this.armConfirm(btn, () => this.newGame());
  }

  // ── Daily puzzle ────────────────────────────────────────────────────────────
  dailyState() {
    const d = this.stats.daily;
    return d && typeof d === 'object' ? d : { last: null, streak: 0, best: 0, wins: 0 };
  }

  // A streak is alive if the last daily solved was today or yesterday.
  currentStreak() {
    const d = this.dailyState();
    return d.last && d.last >= SudokuGame.dayBefore(SudokuGame.todayUTC()) ? d.streak : 0;
  }

  requestDaily() {
    if (this.generating) return;
    const today = SudokuGame.todayUTC();
    const d = this.dailyState();
    if (d.last && d.last >= today) {
      this.showMessage(`Today's daily is solved — streak ${this.currentStreak()}. A new one comes at midnight UTC. ` +
        `<button class="msg-btn" data-action="dismiss">OK</button>`, 'info');
      return;
    }
    if (this.daily === today && !this.solved) {
      this.showMessage(`You're on today's daily. <button class="msg-btn" data-action="dismiss">OK</button>`, 'info');
      return;
    }
    if (this.hasProgress() && !this.solved) {
      this.showMessage(`Start today's daily? This puzzle's progress will be lost. ` +
        `<button class="msg-btn" data-action="daily">Start daily</button>` +
        `<button class="msg-btn" data-action="dismiss">Keep playing</button>`, 'info');
      return;
    }
    this.newGame({ daily: today });
  }

  recordDailyWin() {
    const d = this.dailyState();
    if (d.last && d.last >= this.daily) return;     // already counted (or synced from a device ahead of us)
    d.streak = d.last === SudokuGame.dayBefore(this.daily) ? (d.streak || 0) + 1 : 1;
    d.best = Math.max(d.best || 0, d.streak);
    d.wins = (d.wins || 0) + 1;
    d.last = this.daily;
    this.stats.daily = d;
  }

  // ── Timer ───────────────────────────────────────────────────────────────────
  currentElapsedMs() {
    return this.timerRunning ? this.elapsedMs + (Date.now() - this.timerStart) : this.elapsedMs;
  }

  formatTime(ms) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = n => n.toString().padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  renderTimer() {
    const el = document.getElementById('timer');
    if (!el) return;
    el.textContent = this.formatTime(this.currentElapsedMs());
    el.classList.toggle('paused', !this.timerRunning && !this.solved);
  }

  startTimer() {
    if (this.timerRunning || this.solved || this.generating) return;
    this.timerStart = Date.now();
    this.timerRunning = true;
    if (!this.timerInterval) this.timerInterval = setInterval(() => this.renderTimer(), 1000);
    this.renderTimer();
  }

  pauseTimer() {
    if (!this.timerRunning) return;
    this.elapsedMs += Date.now() - this.timerStart;
    this.timerRunning = false;
    this.renderTimer();
    this.saveGame();
  }

  // Restart the clock only if nothing is covering the board.
  resumeIfIdle() {
    if (this.solved || document.hidden) return;
    if (this.isPanelOpen()) return;
    this.startTimer();
  }

  resetTimer() {
    this.elapsedMs = 0;
    this.timerStart = 0;
    this.timerRunning = false;
    this.solved = false;
    if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
    this.renderTimer();
  }

  isPanelOpen() {
    return document.querySelector('.panel-overlay.active') !== null;
  }

  // ── Stats / prefs ───────────────────────────────────────────────────────────
  // v1: { level: <number wins> }
  // v2: { level: { wins, bestMs } }
  // v3: { level: { wins, bestMs, cleanWins, hints } } — bestMs only ever set by
  //     a win with no hints, so a hinted run can't take the record.
  // v3 + daily: { …, daily: { last, streak, best, wins } }
  migrateStats(raw) {
    const out = {};
    for (const k in raw) {
      const v = raw[k];
      if (k === 'daily') {
        if (v && typeof v === 'object') {
          out.daily = {
            last: typeof v.last === 'string' ? v.last : null,
            streak: v.streak || 0, best: v.best || 0, wins: v.wins || 0
          };
        }
      } else if (typeof v === 'number') out[k] = { wins: v, bestMs: null, cleanWins: 0, hints: 0 };
      else if (v && typeof v === 'object') {
        out[k] = {
          wins: v.wins || 0,
          bestMs: v.bestMs || null,
          cleanWins: v.cleanWins || 0,
          hints: v.hints || 0
        };
      }
    }
    return out;
  }

  levelStats(level) {
    if (!this.stats[level]) this.stats[level] = { wins: 0, bestMs: null, cleanWins: 0, hints: 0 };
    return this.stats[level];
  }

  saveStats() {
    localStorage.setItem('sudokuStats', JSON.stringify(this.stats));
  }

  setPref(key, value) {
    this.prefs[key] = value;
    localStorage.setItem('sudokuPrefs', JSON.stringify(this.prefs));
    this.render();
  }

  // ── Keyboard ────────────────────────────────────────────────────────────────
  handleKey(e) {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.isPanelOpen()) return;
    const key = e.key;

    if (key === 'Escape') {
      if (this.selected !== null) { this.selected = null; this.render(); e.preventDefault(); }
      return;
    }

    if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
      if (this.locked()) return;
      let idx = this.selected;
      if (idx === null) idx = 0;
      else {
        const r = Math.floor(idx / 9), c = idx % 9;
        if (key === 'ArrowUp'    && r > 0) idx -= 9;
        if (key === 'ArrowDown'  && r < 8) idx += 9;
        if (key === 'ArrowLeft'  && c > 0) idx -= 1;
        if (key === 'ArrowRight' && c < 8) idx += 1;
      }
      this.selected = idx;
      this.render();
      e.preventDefault();
      return;
    }

    if (/^[1-9]$/.test(key)) {
      this.padDigit(parseInt(key, 10));
      e.preventDefault();
      return;
    }

    if (key === 'Backspace' || key === 'Delete' || key === '0') {
      this.handleClear();
      e.preventDefault();
      return;
    }

    if (key === 'n' || key === 'N') { this.toggleNotesMode(); e.preventDefault(); return; }
    if (key === 'h' || key === 'H') { if (this.showHint) this.useHint(); e.preventDefault(); return; }
    if (key === 'u' || key === 'U') { this.undo(); e.preventDefault(); }
  }

  // ── Selection and the pad ───────────────────────────────────────────────────
  selectCell(index) {
    if (this.locked()) return;
    const row = Math.floor(index / 9), col = index % 9;
    this.selected = index;
    this.audioManager.playSound('click');
    if (this.given[row][col] || this.grid[row][col]) { this.render(); return; }
    // Fast-fill: tapping an empty cell drops the armed digit straight in — but
    // only where it is fully valid (row, column and box).
    if (this.prefs.fastFill && !this.notesMode && this.lastNumber > 0 &&
        this.engine.isValid(this.grid, row, col, this.lastNumber)) {
      this.placeNumber(this.lastNumber);
    } else {
      this.render();
    }
  }

  // A pad digit goes into the selected cell (or toggles a pencil mark). With
  // nothing editable selected it arms that digit instead, which highlights it
  // and — with fast-fill on — lets each tap on an empty cell place it.
  padDigit(n) {
    if (this.locked()) return;
    if (this.selected !== null) {
      const row = Math.floor(this.selected / 9), col = this.selected % 9;
      if (!this.given[row][col]) {
        if (this.notesMode) { this.toggleNote(n); return; }
        if (this.grid[row][col] !== n) { this.placeNumber(n); return; }
      }
    }
    this.selected = null;
    this.lastNumber = this.lastNumber === n ? 0 : n;
    this.audioManager.playSound('click');
    this.render();
  }

  // ── Notes ───────────────────────────────────────────────────────────────────
  // Standard pencil marks: digit n always sits in slot n, so a cell's notes can
  // be read at a glance without hunting for where a digit was put.
  toggleNotesMode() {
    if (this.locked()) return;
    this.notesMode = !this.notesMode;
    this.render();
  }

  toggleNote(num) {
    if (this.locked() || this.selected === null) return;
    const row = Math.floor(this.selected / 9), col = this.selected % 9;
    if (this.given[row][col] || this.grid[row][col] !== 0) return;
    this.pushHistory(this.selected);
    this.notes[row][col] ^= this.engine.bit(num);
    this.audioManager.playSound('click');
    this.touched();
  }

  // Placing a digit retires it as a candidate everywhere it can no longer go.
  clearPeerNotes(row, col, num) {
    const bit = this.engine.bit(num);
    const br = Math.floor(row / 3) * 3, bc = Math.floor(col / 3) * 3;
    for (let i = 0; i < 9; i++) {
      this.notes[row][i] &= ~bit;
      this.notes[i][col] &= ~bit;
      this.notes[br + Math.floor(i / 3)][bc + (i % 3)] &= ~bit;
    }
  }

  // Every candidate for every empty cell, from the digits on the board.
  autoCandidates() {
    if (this.locked()) return;
    this.pushHistory(-1);
    const { rows, cols, boxes } = this.engine.masks(this.grid);
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        this.notes[r][c] = this.grid[r][c] ? 0
          : this.engine.ALL & ~(rows[r] | cols[c] | boxes[Math.floor(r / 3) * 3 + Math.floor(c / 3)]);
      }
    }
    this.audioManager.playSound('click');
    this.touched();
  }

  // ── Number placement ────────────────────────────────────────────────────────
  // index -1 = a board-wide change (auto-candidates) with no single cell.
  pushHistory(index) {
    const row = Math.floor(index / 9), col = index % 9;
    this.history.push({
      index,
      value: index >= 0 ? this.grid[row][col] : 0,
      lastNumber: this.lastNumber,
      mistakes: this.mistakes,
      // Notes are restored wholesale rather than diffed — 81 small ints is
      // cheaper to reason about than tracking which marks a placement erased.
      allNotes: this.notes.map(r => [...r])
    });
    if (this.history.length > 200) this.history.shift();
  }

  touched() {
    this.lastInputAt = Date.now();
    if (this.msgKind === 'hint' || this.msgKind === 'info') this.hideMessage();
    this.saveGame();
    this.render();
  }

  placeNumber(num) {
    if (this.locked() || this.selected === null) return;
    const row = Math.floor(this.selected / 9), col = this.selected % 9;
    if (this.given[row][col] || this.grid[row][col] === num) return;
    this.setCell(row, col, num);
    this.lastNumber = num;
    if (this.solution[row][col] && num !== this.solution[row][col]) this.mistakes++;
    this.audioManager.playSound('place');
    this.touched();
    if (this.isComplete()) this.checkSolution();
  }

  setCell(row, col, num) {
    this.pushHistory(row * 9 + col);
    this.grid[row][col] = num;
    this.notes[row][col] = 0;
    this.clearPeerNotes(row, col, num);
  }

  // Erase a digit if there is one, otherwise the cell's notes.
  handleClear() {
    if (this.locked() || this.selected === null) return;
    const row = Math.floor(this.selected / 9), col = this.selected % 9;
    if (this.given[row][col]) return;
    if (!this.grid[row][col] && !this.notes[row][col]) return;
    this.pushHistory(this.selected);
    if (this.grid[row][col]) this.grid[row][col] = 0;
    else this.notes[row][col] = 0;
    this.touched();
  }

  // ── Hint ────────────────────────────────────────────────────────────────────
  setHintVisible(on) {
    this.showHint = !!on;
    localStorage.setItem('sudokuHintBtn', this.showHint ? 'on' : 'off');
    const btn = document.getElementById('hintBtn');
    if (btn) btn.style.display = this.showHint ? '' : 'none';
  }

  boardKey() { return this.grid.map(r => r.join('')).join(''); }

  // First tap: name the technique that forces the next digit and highlight
  // where it happens. Second tap (board unchanged): reveal the digit. One hint
  // forfeits the best time for this puzzle — the win still counts.
  useHint() {
    if (this.locked()) return;
    const h = this.hintInfo;
    if (h && h.key === this.boardKey()) {
      const [row, col] = h.target;
      this.hintInfo = null;
      this.selected = row * 9 + col;
      this.setCell(row, col, h.digit);
      this.audioManager.playSound('place');
      this.touched();
      if (this.isComplete()) this.checkSolution();
      return;
    }

    let info = null;
    const wrong = [];
    const board = this.grid.map((r, ri) => r.map((v, ci) => {
      if (v && !this.given[ri][ci] && v !== this.solution[ri][ci]) { wrong.push([ri, ci]); return 0; }
      return v;
    }));
    const at = ([r, c]) => `row ${r + 1}, column ${c + 1}`;
    if (wrong.length) {
      const t = wrong[0];
      info = { target: t, pattern: [], text: `The ${this.grid[t[0]][t[1]]} at ${at(t)} is wrong.` };
    } else {
      const ex = this.engine.explainNext(board);
      if (ex.stuck) {
        const t = this.fewestCandidates(board);
        if (!t) return;
        info = { target: t, pattern: [],
          text: `No technique in the hint book cracks this — it needs a chain or a guess. Try ${at(t)}.` };
      } else {
        const single = ex.steps[ex.steps.length - 1];
        const lead = ex.steps.length > 1 ? ex.steps[ex.steps.length - 2] : single;
        let text;
        if (lead === single) {
          text = single.name === 'Naked single'
            ? `Naked single: only one digit fits ${at(single.target)}.`
            : `Hidden single in ${single.house}: one place left for a ${single.digit}.`;
        } else {
          const what = lead.digit ? ` on ${lead.digit}s` : '';
          text = `${lead.name}${lead.house ? ' in ' + lead.house : ''}${what} — that forces the outlined cell.`;
        }
        info = { target: single.target, pattern: lead.cells || [], text };
      }
    }

    this.hintInfo = Object.assign(info, { key: this.boardKey(), digit: this.solution[info.target[0]][info.target[1]] });
    this.selected = info.target[0] * 9 + info.target[1];
    this.hintsUsed++;
    this.levelStats(this.level).hints++;
    this.saveStats();
    this.audioManager.playSound('click');
    this.showMessage(`${info.text} Tap Hint again for the digit.`, 'hint');
    this.saveGame();
    this.render();
  }

  fewestCandidates(board) {
    const { rows, cols, boxes } = this.engine.masks(board);
    let best = null, bestN = 10;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      if (board[r][c]) continue;
      const n = this.engine.popcount(this.engine.ALL & ~(rows[r] | cols[c] | boxes[Math.floor(r / 3) * 3 + Math.floor(c / 3)]));
      if (n < bestN) { bestN = n; best = [r, c]; }
    }
    return best;
  }

  // ── Undo ────────────────────────────────────────────────────────────────────
  undo() {
    if (this.locked() || !this.history.length) return;
    const last = this.history.pop();
    if (last.index >= 0) {
      const row = Math.floor(last.index / 9), col = last.index % 9;
      this.grid[row][col] = last.value;
      this.selected = last.index;
    }
    this.notes = last.allNotes.map(r => [...r]);
    this.lastNumber = last.lastNumber || 0;
    if (typeof last.mistakes === 'number') this.mistakes = last.mistakes;
    this.touched();
  }

  // ── Win detection ───────────────────────────────────────────────────────────
  isComplete() {
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 9; j++) {
        if (!this.grid[i][j]) return false;
      }
    }
    return true;
  }

  wrongCellCount() {
    let n = 0;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) if (this.solution[r][c] && this.grid[r][c] !== this.solution[r][c]) n++;
    }
    return n;
  }

  checkSolution() {
    if (this.solved) return;
    if (this.engine.isValidCompleteSolution(this.grid)) {
      this.pauseTimer();
      this.solved = true;
      this.selected = null;
      this.lastNumber = 0;
      this.hintInfo = null;
      const finalMs = this.elapsedMs;
      const s = this.levelStats(this.level);
      s.wins++;
      const clean = this.hintsUsed === 0;
      let isNewBest = false;
      if (clean) {
        s.cleanWins++;
        isNewBest = s.bestMs == null || finalMs < s.bestMs;
        if (isNewBest) s.bestMs = finalMs;
      }
      if (this.daily) this.recordDailyWin();
      this.saveStats();
      this.clearSavedGame();
      this.audioManager.playSound('win');

      const timeStr = this.formatTime(finalMs);
      const bits = [isNewBest ? `New best time: ${timeStr}!` : `Solved in ${timeStr}`];
      if (this.daily) bits.push(`daily streak ${this.currentStreak()}`);
      if (this.hintsUsed) bits.push(`${this.hintsUsed} hint${this.hintsUsed === 1 ? '' : 's'} used`);
      if (this.mistakes) bits.push(`${this.mistakes} mistake${this.mistakes === 1 ? '' : 's'}`);
      this.showMessage(
        `${bits.join(' · ')} <button class="msg-btn" data-action="next">Next puzzle</button>`,
        'success'
      );
      // No auto-advance: the board stays up until the player asks for another.
      this.render();
      this.prefetch();
      if (window.SudokuCloud && window.SudokuCloud.puzzleFinished) window.SudokuCloud.puzzleFinished();
    } else {
      this.audioManager.playSound('error');
      const wrong = this.wrongCellCount();
      this.showMessage(
        `${wrong} cell${wrong === 1 ? '' : 's'} ${wrong === 1 ? 'is' : 'are'} wrong. ` +
        `<button class="msg-btn" data-action="review">Show me</button>` +
        `<button class="msg-btn" data-action="restart">Restart</button>`,
        'error'
      );
      const gridEl = document.getElementById('grid');
      gridEl.classList.add('error-border');
      setTimeout(() => gridEl.classList.remove('error-border'), 800);
    }
  }

  // Paint the cells that differ from the solution. Only reachable from the
  // "wrong solution" message, so it can't be used to cheat mid-puzzle.
  revealMistakes() {
    this.reviewing = true;
    this.render();
    setTimeout(() => { this.reviewing = false; this.render(); }, 4000);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  render() {
    const selRow = this.selected !== null ? Math.floor(this.selected / 9) : -1;
    const selCol = this.selected !== null ? this.selected % 9 : -1;
    const selNum = this.selected !== null ? this.grid[selRow][selCol] : 0;
    const hlNum = selNum || this.lastNumber;
    const selBoxR = selRow >= 0 ? Math.floor(selRow / 3) * 3 : -1;
    const selBoxC = selCol >= 0 ? Math.floor(selCol / 3) * 3 : -1;

    // Conflicts, once for the whole board instead of a 27-cell scan per cell:
    // a digit is in conflict wherever its row, column or box holds it twice.
    const conflict = SudokuGame.make9x9(false);
    for (const unit of this.engine.units) {
      const seen = new Map();
      for (const [r, c] of unit) {
        const v = this.grid[r][c];
        if (!v) continue;
        if (seen.has(v)) { conflict[r][c] = true; conflict[seen.get(v)[0]][seen.get(v)[1]] = true; }
        else seen.set(v, [r, c]);
      }
    }

    const hint = this.hintInfo && this.hintInfo.key === this.boardKey() ? this.hintInfo : null;
    const hintCells = new Set(hint ? hint.pattern.map(([r, c]) => r * 9 + c) : []);
    const hintTarget = hint ? hint.target[0] * 9 + hint.target[1] : -1;

    const remaining = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (this.grid[r][c]) remaining[this.grid[r][c]]++;

    this.cells.forEach((cell, index) => {
      const row = Math.floor(index / 9), col = index % 9;
      const value = this.grid[row][col];
      const mask = this.notes[row][col];

      cell.innerHTML = '';
      cell.className = 'cell';

      if (this.given[row][col]) cell.classList.add('given');
      else if (value) cell.classList.add('filled');
      if (this.selected !== null && index !== this.selected) {
        const inRowOrCol = row === selRow || col === selCol;
        const inBox = row >= selBoxR && row < selBoxR + 3 && col >= selBoxC && col < selBoxC + 3;
        if (inRowOrCol || inBox) cell.classList.add('related');
      }
      if (index === this.selected) cell.classList.add('selected');
      if (hlNum > 0 && value === hlNum) cell.classList.add('same-number-highlight');
      if (value > 0 && !this.given[row][col] && conflict[row][col]) cell.classList.add('conflict');
      if (this.reviewing && value && this.solution[row][col] && value !== this.solution[row][col]) {
        cell.classList.add('wrong');
      }
      if (hintCells.has(index)) cell.classList.add('hint-pattern');
      if (index === hintTarget) cell.classList.add('hint-target');

      if (value) {
        cell.textContent = value;
      } else if (mask) {
        const notesGrid = document.createElement('div');
        notesGrid.className = 'cell-notes';
        for (let n = 1; n <= 9; n++) {
          const slot = document.createElement('div');
          slot.className = 'cell-note';
          if (mask & this.engine.bit(n)) {
            slot.textContent = n;
            if (hlNum > 0 && n === hlNum) slot.classList.add('note-match');
          }
          notesGrid.appendChild(slot);
        }
        cell.appendChild(notesGrid);
      }

      const where = `Row ${row + 1}, column ${col + 1}`;
      cell.setAttribute('aria-label',
        value ? `${where}, ${value}${this.given[row][col] ? ', given' : ''}` : `${where}, empty`);
    });

    this.renderStatusBar(remaining);
    const notesBtn = document.getElementById('notesToggle');
    notesBtn.classList.toggle('notes-active', this.notesMode);
    notesBtn.setAttribute('aria-pressed', this.notesMode ? 'true' : 'false');
    document.getElementById('pad').classList.toggle('notes-mode', this.notesMode);
  }

  renderStatusBar(remaining) {
    const mEl = document.getElementById('mistakes');
    if (mEl) {
      mEl.textContent = this.mistakes;
      mEl.parentElement.classList.toggle('has-mistakes', this.mistakes > 0);
      mEl.parentElement.hidden = this.prefs.hideMistakes && !this.solved;
    }
    const armed = this.prefs.fastFill && !this.notesMode ? this.lastNumber : 0;
    for (let n = 1; n <= 9; n++) {
      const left = 9 - remaining[n];
      const key = this.padKeys[n - 1];
      key.classList.toggle('done', left <= 0);
      key.classList.toggle('armed', n === armed);
      key.querySelector('.pad-left').textContent = Math.max(0, left);
      key.setAttribute('aria-label', `${this.notesMode ? 'Note' : 'Place'} ${n}, ${Math.max(0, left)} left`);
    }
  }

  // ── UI helpers ──────────────────────────────────────────────────────────────
  showMessage(text, type) {
    const msg = document.getElementById('message');
    msg.innerHTML = text;
    msg.className = `message ${type}`;
    this.msgKind = type;
  }

  hideMessage() {
    document.getElementById('message').classList.add('hidden');
    this.msgKind = null;
  }

  // ── PWA install ─────────────────────────────────────────────────────────────
  installApp() {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      this.deferredPrompt.userChoice.then(choice => {
        if (choice.outcome === 'accepted') {
          this.showMessage('App installed!', 'success');
          setTimeout(() => this.hideMessage(), 3000);
        }
        this.deferredPrompt = null;
      });
    } else {
      this.showMessage('iOS: Share > Add to Home Screen. Android: browser menu > Install App.', 'success');
      setTimeout(() => this.hideMessage(), 6000);
    }
  }

  checkPWAInstalled() {
    if (window.matchMedia('(display-mode:standalone)').matches || window.navigator.standalone === true) {
      document.getElementById('installBtn').style.display = 'none';
    }
  }

  // ── Persistence ─────────────────────────────────────────────────────────────
  // Writes are coalesced: fast-filling a row fires a dozen saves a second and
  // every one of them serialises the whole board.
  saveGame() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.writeSave(); }, 250);
  }

  flushSave() {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    this.writeSave();
  }

  // The solution is deliberately NOT stored — it used to sit in localStorage in
  // plain sight. It's recovered by solving the givens on load instead.
  writeSave() {
    // Nothing to save while a first puzzle is still being generated.
    if (this.solved || !this.given.some(r => r.some(Boolean))) return;
    localStorage.setItem('sudokuGame3', JSON.stringify({
      grid: this.grid, given: this.given, level: this.level, daily: this.daily,
      selected: this.selected, lastNumber: this.lastNumber,
      notes: this.notes, elapsedMs: this.currentElapsedMs(),
      mistakes: this.mistakes, hintsUsed: this.hintsUsed
    }));
  }

  loadGame() {
    const saved = localStorage.getItem('sudokuGame3');
    if (saved) {
      try {
        const s = JSON.parse(saved);
        if (!this.isValidSavedState(s)) throw new Error('saved state failed validation');

        // Only the clues are trustworthy; anything the player typed is replayed
        // on top of a board rebuilt from them.
        const clues = SudokuGame.make9x9(0);
        for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (s.given[r][c]) clues[r][c] = s.grid[r][c];
        const solution = this.engine.solve(clues);
        if (!solution) throw new Error('saved puzzle has no solution');

        this.grid       = s.grid;
        this.solution   = solution;
        this.given      = s.given;
        this.level      = s.level;
        this.daily      = typeof s.daily === 'string' && /^\d{4}-\d\d-\d\d$/.test(s.daily) ? s.daily : null;
        this.history    = [];
        this.selected   = (typeof s.selected === 'number' && s.selected >= 0 && s.selected < 81) ? s.selected : null;
        this.lastNumber = s.lastNumber || 0;
        this.notes      = this.isValidNotes(s.notes) ? s.notes : SudokuGame.make9x9(0);
        this.elapsedMs  = (typeof s.elapsedMs === 'number' && s.elapsedMs >= 0) ? s.elapsedMs : 0;
        this.mistakes   = (typeof s.mistakes === 'number' && s.mistakes >= 0) ? s.mistakes : 0;
        this.hintsUsed  = (typeof s.hintsUsed === 'number' && s.hintsUsed >= 0) ? s.hintsUsed : 0;

        this.syncDifficultyButtons();
        this.render();
        this.renderTimer();
        this.startTimer();
        this.prefetch();
        return;
      } catch (e) {
        console.warn('Discarding corrupt saved game:', e.message);
        localStorage.removeItem('sudokuGame3');
      }
    }
    // A v2 save can't be carried over — its notes used the old positional
    // scheme — so it is dropped rather than half-translated.
    localStorage.removeItem('sudokuGame2');
    this.syncDifficultyButtons();
    this.render();
    this.newGame();
  }

  isValidSavedState(s) {
    if (!s || typeof s !== 'object') return false;
    if (!SudokuEngine.LEVELS[s.level]) return false;
    if (!this.isValid9x9Numbers(s.grid, 0, 9)) return false;
    if (!this.isValid9x9Booleans(s.given)) return false;
    // A given cell with no digit in it is nonsense, and would make the board
    // unsolvable in a way that's hard to trace.
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) if (s.given[r][c] && !s.grid[r][c]) return false;
    }
    return true;
  }

  isValid9x9Numbers(g, min, max) {
    if (!Array.isArray(g) || g.length !== 9) return false;
    for (let r = 0; r < 9; r++) {
      if (!Array.isArray(g[r]) || g[r].length !== 9) return false;
      for (let c = 0; c < 9; c++) {
        const v = g[r][c];
        if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) return false;
      }
    }
    return true;
  }

  isValid9x9Booleans(g) {
    if (!Array.isArray(g) || g.length !== 9) return false;
    for (let r = 0; r < 9; r++) {
      if (!Array.isArray(g[r]) || g[r].length !== 9) return false;
      for (let c = 0; c < 9; c++) if (typeof g[r][c] !== 'boolean') return false;
    }
    return true;
  }

  isValidNotes(g) { return this.isValid9x9Numbers(g, 0, 511); }

  clearSavedGame() {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    localStorage.removeItem('sudokuGame3');
  }
}

const game = new SudokuGame();
