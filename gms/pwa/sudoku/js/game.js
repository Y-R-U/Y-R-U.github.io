// Main Sudoku Game — state management, UI rendering, user interaction
class SudokuGame {
  constructor() {
    this.engine = new SudokuEngine();
    this.audioManager = new AudioManager();

    // Core grid state
    this.grid     = SudokuGame.make9x9(0);
    this.solution = SudokuGame.make9x9(0);
    this.given    = SudokuGame.make9x9(false);
    this.level    = 'easy';
    this.selected = null;
    this.lastNumber = 0;
    this.history  = [];

    // Pencil marks. One 9-bit mask per cell: bit 0 = digit 1 … bit 8 = digit 9.
    this.notes = SudokuGame.make9x9(0);
    this.notesMode = false;

    this.stats = this.migrateStats(JSON.parse(localStorage.getItem('sudokuStats') || '{}'));
    this.showHint = localStorage.getItem('sudokuHintBtn') !== 'off';
    this.deferredPrompt = null;

    // Timer state — elapsedMs is the persisted total; when running, the live
    // value is elapsedMs + (Date.now() - timerStart).
    this.elapsedMs   = 0;
    this.timerStart  = 0;
    this.timerRunning = false;
    this.timerInterval = null;
    this.solved = false;

    // Per-puzzle scoring state
    this.mistakes = 0;
    this.hintsUsed = 0;

    this.saveTimer = null;

    this.checkPWAInstalled();
    this.init();
  }

  static make9x9(value) {
    return Array(9).fill(null).map(() => Array(9).fill(value));
  }

  // ── Initialise ──────────────────────────────────────────────────────────────
  init() {
    this.createGrid();
    this.loadGame();

    // Difficulty buttons
    document.querySelectorAll('.diff-btn').forEach(btn =>
      btn.addEventListener('click', () => this.changeDifficulty(btn.dataset.level))
    );

    // Controls
    document.getElementById('newGame').addEventListener('click', () => this.confirmNewGame());
    document.getElementById('undoBtn').addEventListener('click', () => this.undo());
    document.getElementById('hintBtn').addEventListener('click', () => this.useHint());
    document.getElementById('message').addEventListener('click', e => {
      const action = e.target.dataset && e.target.dataset.action;
      if (action === 'restart') this.confirmRestart();
      if (action === 'next') this.newGame();
      if (action === 'review') this.revealMistakes();
    });

    // Popup
    document.getElementById('closePopup').addEventListener('click', () => this.closePopup());
    document.getElementById('clearCell').addEventListener('click', () => this.handleClear());
    document.getElementById('notesToggle').addEventListener('click', () => this.toggleNotesMode());
    document.getElementById('popup').addEventListener('click', e => {
      if (e.target.id === 'popup') this.closePopup();
    });

    // PWA install
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
      setHintPref: on => this.setHintVisible(on)
    });

    // Resume music on first interaction (autoplay policy)
    const resumeAudio = () => {
      this.audioManager.resumeIfNeeded();
      document.removeEventListener('click', resumeAudio);
      document.removeEventListener('touchstart', resumeAudio);
    };
    document.addEventListener('click', resumeAudio);
    document.addEventListener('touchstart', resumeAudio);

    // Lifting the finger after a long press produces a click, and by then the
    // picker is covering the spot that was pressed — so that click would pick a
    // number nobody chose. Swallow it before anything sees it. The deadline
    // matters: a long press that ends outside the picker never produces a
    // click at all, and a latched flag would then eat the player's next real
    // tap instead.
    document.addEventListener('click', e => {
      if (!this.suppressClickUntil || Date.now() > this.suppressClickUntil) return;
      this.suppressClickUntil = 0;
      e.stopPropagation();
      e.preventDefault();
    }, true);

    // Keyboard input — desktop quality-of-life
    document.addEventListener('keydown', e => this.handleKey(e));

    // A backgrounded tab must not keep clocking up time — best times are a
    // stat, and leaving the app open over lunch would otherwise ruin them.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pauseTimer();
      else this.resumeIfIdle();
    });
    window.addEventListener('pagehide', () => this.flushSave());

    this.setHintVisible(this.showHint);

    // Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('SW registered', reg.scope))
        .catch(err => console.warn('SW registration failed', err));
    }
  }

  // ── Grid DOM creation ───────────────────────────────────────────────────────
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
      cell.addEventListener('contextmenu', e => {
        e.preventDefault();
        this.requestPopup(i);
      });
      let touchTimer = null;
      cell.addEventListener('touchstart', () => {
        this.suppressClickUntil = 0;
        touchTimer = setTimeout(() => {
          touchTimer = null;
          // The picker has just opened underneath the finger that is still
          // down. Whatever click the browser synthesizes on release has to be
          // thrown away — see the swallower installed in init().
          this.suppressClickUntil = Date.now() + 700;
          this.requestPopup(i);
        }, 500);
      }, { passive: true });
      const cancel = () => { if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; } };
      cell.addEventListener('touchend', cancel);
      cell.addEventListener('touchmove', cancel);
      cell.addEventListener('touchcancel', cancel);
      gridEl.appendChild(cell);
      this.cells.push(cell);
    }
  }

  // ── New game ────────────────────────────────────────────────────────────────
  newGame() {
    const puzzle = this.engine.generatePuzzle(this.level);
    this.grid     = puzzle.grid;
    this.solution = puzzle.solution;
    this.given    = puzzle.given;
    this.notes    = SudokuGame.make9x9(0);
    this.history  = [];
    this.selected = null;
    this.lastNumber = 0;
    this.mistakes = 0;
    this.hintsUsed = 0;
    this.notesMode = false;
    this.resetTimer();
    this.startTimer();
    this.syncDifficultyButtons();

    this.saveGame();
    this.render();
    this.hideMessage();
  }

  changeDifficulty(level) {
    if (level === this.level) return;
    if (this.hasProgress() && !confirm('Switch difficulty? Current progress will be lost.')) {
      // Re-sync the active class so the rejected button doesn't appear selected
      this.syncDifficultyButtons();
      return;
    }
    this.level = level;
    this.syncDifficultyButtons();
    this.newGame();
  }

  syncDifficultyButtons() {
    document.querySelectorAll('.diff-btn').forEach(btn => {
      const on = btn.dataset.level === this.level;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
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
    if (this.timerRunning || this.solved) return;
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
    if (document.getElementById('popup').classList.contains('active')) return;
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

  // ── Stats migration ─────────────────────────────────────────────────────────
  // v1: { level: <number wins> }
  // v2: { level: { wins, bestMs } }
  // v3: { level: { wins, bestMs, cleanWins, hints } } — bestMs only ever set by
  //     a win with no hints, so a hinted run can't take the record.
  migrateStats(raw) {
    const out = {};
    for (const k in raw) {
      const v = raw[k];
      if (typeof v === 'number') out[k] = { wins: v, bestMs: null, cleanWins: 0, hints: 0 };
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

  // ── Keyboard ────────────────────────────────────────────────────────────────
  handleKey(e) {
    // Don't interfere when typing in form fields (defensive — none today).
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Panels handle their own dismiss; we still want Esc/keys to do nothing
    // funky underneath, so bail when any panel overlay is active.
    if (this.isPanelOpen()) return;

    const popupOpen = document.getElementById('popup').classList.contains('active');
    const key = e.key;

    if (key === 'Escape') {
      if (popupOpen) { this.closePopup(); e.preventDefault(); }
      return;
    }

    // Arrow nav — works when popup is closed. Auto-select (0,0) if nothing
    // selected so first arrow press has somewhere to go.
    if (!popupOpen && (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight')) {
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

    // Digit input: places a number, or toggles a pencil mark in notes mode.
    if (/^[1-9]$/.test(key)) {
      const num = parseInt(key, 10);
      if (this.selected === null) return;
      const row = Math.floor(this.selected / 9), col = this.selected % 9;
      if (this.given[row][col]) return;
      if (this.notesMode) this.toggleNote(num);
      else this.placeNumber(num);
      e.preventDefault();
      return;
    }

    if (key === 'Backspace' || key === 'Delete' || key === '0') {
      if (this.selected === null) return;
      const row = Math.floor(this.selected / 9), col = this.selected % 9;
      if (this.given[row][col]) return;
      this.handleClear();
      e.preventDefault();
      return;
    }

    if (key === 'n' || key === 'N') {
      this.toggleNotesMode();
      e.preventDefault();
      return;
    }

    if (key === 'h' || key === 'H') {
      if (this.showHint) this.useHint();
      e.preventDefault();
      return;
    }

    if (key === 'u' || key === 'U') {
      this.undo();
      e.preventDefault();
    }
  }

  // ── Cell selection / popup ──────────────────────────────────────────────────
  // Long-press / right-click entry: ignore given cells so we don't pop up the
  // picker for whichever cell happened to be selected before.
  requestPopup(index) {
    const row = Math.floor(index / 9), col = index % 9;
    if (this.given[row][col]) return;
    this.selected = index;
    this.audioManager.playSound('click');
    this.showPopup();
    this.render();
  }

  selectCell(index) {
    const row = Math.floor(index / 9), col = index % 9;
    if (this.given[row][col]) return;
    this.selected = index;
    this.audioManager.playSound('click');

    const val = this.grid[row][col];
    if (val > 0) { this.showPopup(); this.render(); return; }
    // Fast-fill: if user just placed a number, auto-place it on the next empty
    // cell — but only if it's fully valid (row + column + box). Otherwise open
    // the picker so they pick consciously.
    if (!this.notesMode && this.lastNumber > 0 && this.engine.isValid(this.grid, row, col, this.lastNumber)) {
      this.placeNumber(this.lastNumber);
    } else {
      this.showPopup();
      this.render();
    }
  }

  // ── Popup rendering ─────────────────────────────────────────────────────────
  showPopup() {
    if (this.selected === null) return;
    const popup   = document.getElementById('popup');
    const numGrid = document.getElementById('numberGrid');
    const header  = document.getElementById('popupHeader');
    numGrid.innerHTML = '';

    const row = Math.floor(this.selected / 9), col = this.selected % 9;
    const mask = this.notes[row][col];

    header.textContent = this.notesMode
      ? 'Notes — tap digits to pencil them in'
      : '';

    for (let i = 1; i <= 9; i++) {
      const btn = document.createElement('button');
      btn.className = 'number-btn';
      btn.textContent = i;
      if (this.notesMode) {
        const on = (mask & this.engine.bit(i)) !== 0;
        btn.classList.add('note-btn');
        btn.classList.toggle('note-on', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.setAttribute('aria-label', `Note ${i}`);
        btn.addEventListener('click', () => this.toggleNote(i));
      } else {
        btn.setAttribute('aria-label', `Place ${i}`);
        btn.addEventListener('click', () => this.placeNumber(i));
      }
      numGrid.appendChild(btn);
    }

    const clearBtn = document.getElementById('clearCell');
    clearBtn.textContent = this.notesMode ? 'Clear Notes' : 'Clear';
    document.getElementById('notesToggle').classList.toggle('notes-active', this.notesMode);
    popup.classList.add('active');
    this.pauseTimer();
  }

  closePopup() {
    document.getElementById('popup').classList.remove('active');
    this.resumeIfIdle();
  }

  isPanelOpen() {
    return document.querySelector('.panel-overlay.active') !== null;
  }

  // ── Notes ───────────────────────────────────────────────────────────────────
  // Standard pencil marks: digit n always sits in slot n, so a cell's notes can
  // be read at a glance without hunting for where a digit was put.
  toggleNotesMode() {
    this.notesMode = !this.notesMode;
    const btn = document.getElementById('notesToggle');
    btn.classList.toggle('notes-active', this.notesMode);
    btn.setAttribute('aria-pressed', this.notesMode ? 'true' : 'false');
    if (document.getElementById('popup').classList.contains('active')) this.showPopup();
    this.render();
  }

  toggleNote(num) {
    if (this.selected === null) return;
    const row = Math.floor(this.selected / 9), col = this.selected % 9;
    if (this.given[row][col] || this.grid[row][col] !== 0) return;
    this.pushHistory(this.selected);
    this.notes[row][col] ^= this.engine.bit(num);
    this.audioManager.playSound('click');
    this.saveGame();
    // The popup stays open on purpose — pencilling one candidate almost always
    // means pencilling several.
    if (document.getElementById('popup').classList.contains('active')) this.showPopup();
    this.render();
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

  // ── Number placement ────────────────────────────────────────────────────────
  pushHistory(index) {
    const row = Math.floor(index / 9), col = index % 9;
    this.history.push({
      index,
      value: this.grid[row][col],
      notes: this.notes[row][col],
      lastNumber: this.lastNumber,
      mistakes: this.mistakes,
      // Peer notes are restored wholesale rather than diffed — 81 small ints is
      // cheaper to reason about than tracking which marks a placement erased.
      allNotes: this.notes.map(r => [...r])
    });
    if (this.history.length > 200) this.history.shift();
  }

  placeNumber(num) {
    if (this.selected === null) return;
    const row = Math.floor(this.selected / 9), col = this.selected % 9;
    if (this.given[row][col]) return;
    if (this.grid[row][col] === num) { this.closePopup(); return; }

    this.pushHistory(this.selected);
    this.grid[row][col] = num;
    this.notes[row][col] = 0;
    this.clearPeerNotes(row, col, num);
    this.lastNumber = num;
    if (this.solution[row][col] && num !== this.solution[row][col]) this.mistakes++;
    this.audioManager.playSound('place');
    this.saveGame();
    this.closePopup();
    this.render();
    if (this.isComplete()) this.checkSolution();
  }

  // ── Clear handler ───────────────────────────────────────────────────────────
  handleClear() {
    if (this.selected === null) return;
    const row = Math.floor(this.selected / 9), col = this.selected % 9;
    if (this.given[row][col]) return;

    this.pushHistory(this.selected);
    if (this.notesMode) this.notes[row][col] = 0;
    else { this.grid[row][col] = 0; this.notes[row][col] = 0; }
    this.saveGame();
    this.closePopup();
    this.render();
  }

  // ── Hint ────────────────────────────────────────────────────────────────────
  setHintVisible(on) {
    this.showHint = !!on;
    localStorage.setItem('sudokuHintBtn', this.showHint ? 'on' : 'off');
    const btn = document.getElementById('hintBtn');
    if (btn) btn.style.display = this.showHint ? '' : 'none';
  }

  // Fill one cell with its real answer: the selected cell if it's empty,
  // otherwise a random empty one. Using a hint forfeits the best time for this
  // puzzle — the win still counts, the record doesn't.
  useHint() {
    if (this.solved) return;
    let target = null;
    if (this.selected !== null) {
      const r = Math.floor(this.selected / 9), c = this.selected % 9;
      if (!this.given[r][c] && !this.grid[r][c]) target = [r, c];
    }
    if (!target) {
      const empties = [];
      for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (!this.grid[r][c]) empties.push([r, c]);
      if (!empties.length) return;
      target = empties[Math.floor(Math.random() * empties.length)];
    }
    const [row, col] = target;
    const answer = this.solution[row][col];
    if (!answer) return;

    this.selected = row * 9 + col;
    this.pushHistory(this.selected);
    this.grid[row][col] = answer;
    this.notes[row][col] = 0;
    this.clearPeerNotes(row, col, answer);
    this.hintsUsed++;
    this.levelStats(this.level).hints++;
    this.saveStats();
    this.audioManager.playSound('place');
    this.saveGame();
    this.closePopup();
    this.render();
    if (this.isComplete()) this.checkSolution();
  }

  // ── Undo ────────────────────────────────────────────────────────────────────
  undo() {
    if (!this.history.length) return;
    const last = this.history.pop();
    const row = Math.floor(last.index / 9), col = last.index % 9;
    this.grid[row][col] = last.value;
    this.notes = last.allNotes ? last.allNotes.map(r => [...r]) : this.notes;
    if (typeof last.notes === 'number') this.notes[row][col] = last.notes;
    this.lastNumber = last.lastNumber || 0;
    if (typeof last.mistakes === 'number') this.mistakes = last.mistakes;
    this.selected = last.index;
    this.saveGame();
    this.render();
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
    if (this.engine.isValidCompleteSolution(this.grid)) {
      this.pauseTimer();
      this.solved = true;
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
      this.saveStats();
      this.clearSavedGame();
      this.audioManager.playSound('win');

      const timeStr = this.formatTime(finalMs);
      const bits = [isNewBest ? `New best time: ${timeStr}!` : `Solved in ${timeStr}`];
      if (this.hintsUsed) bits.push(`${this.hintsUsed} hint${this.hintsUsed === 1 ? '' : 's'} used`);
      if (this.mistakes) bits.push(`${this.mistakes} mistake${this.mistakes === 1 ? '' : 's'}`);
      this.showMessage(
        `${bits.join(' · ')} <button class="msg-btn" data-action="next">Next puzzle</button>`,
        'success'
      );
      // No auto-advance: the board stays up until the player asks for another.
      this.render();
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

  confirmRestart() {
    if (confirm('Restart this game?')) this.newGame();
  }

  confirmNewGame() {
    if (!this.hasProgress() || confirm('Start a new game? Current progress will be lost.')) this.newGame();
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  render() {
    const selRow = this.selected !== null ? Math.floor(this.selected / 9) : -1;
    const selCol = this.selected !== null ? this.selected % 9 : -1;
    const selNum = this.selected !== null ? this.grid[selRow][selCol] : 0;
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
      // Related = same row, same col, or same 3x3 box as selected (excluding self)
      if (this.selected !== null && index !== this.selected) {
        const inRowOrCol = row === selRow || col === selCol;
        const inBox = row >= selBoxR && row < selBoxR + 3 && col >= selBoxC && col < selBoxC + 3;
        if (inRowOrCol || inBox) cell.classList.add('related');
      }
      if (index === this.selected) cell.classList.add('selected');
      if (selNum > 0 && value === selNum) cell.classList.add('same-number-highlight');
      if (value > 0 && !this.given[row][col] && conflict[row][col]) cell.classList.add('conflict');
      if (this.reviewing && value && this.solution[row][col] && value !== this.solution[row][col]) {
        cell.classList.add('wrong');
      }

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
            if (selNum > 0 && n === selNum) slot.classList.add('note-match');
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
    document.getElementById('notesToggle').classList.toggle('notes-active', this.notesMode);
  }

  // Mistake tally plus a "how many of each digit are left" strip — the single
  // most useful thing to see while scanning for a home for a number.
  renderStatusBar(remaining) {
    const mEl = document.getElementById('mistakes');
    if (mEl) {
      mEl.textContent = this.mistakes;
      mEl.parentElement.classList.toggle('has-mistakes', this.mistakes > 0);
    }
    const strip = document.getElementById('digitCounts');
    if (!strip) return;
    strip.innerHTML = '';
    for (let n = 1; n <= 9; n++) {
      const left = 9 - remaining[n];
      const chip = document.createElement('div');
      chip.className = 'digit-chip' + (left === 0 ? ' done' : '');
      chip.innerHTML = `<span class="digit-chip-n">${n}</span><span class="digit-chip-left">${left}</span>`;
      chip.title = `${left} ${n}${left === 1 ? '' : 's'} left to place`;
      strip.appendChild(chip);
    }
  }

  // ── UI helpers ──────────────────────────────────────────────────────────────
  showMessage(text, type) {
    const msg = document.getElementById('message');
    msg.innerHTML = text;
    msg.className = `message ${type}`;
    msg.classList.remove('hidden');
  }

  hideMessage() { document.getElementById('message').classList.add('hidden'); }

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
    if (this.solved) return;
    localStorage.setItem('sudokuGame3', JSON.stringify({
      grid: this.grid, given: this.given, level: this.level,
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
        return;
      } catch (e) {
        console.warn('Discarding corrupt saved game:', e.message);
        localStorage.removeItem('sudokuGame3');
      }
    }
    // A v2 save can't be carried over — its notes used the old positional
    // scheme — so it is dropped rather than half-translated.
    localStorage.removeItem('sudokuGame2');
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
