// Main Sudoku Game — state management, UI rendering, user interaction
class SudokuGame {
  constructor() {
    this.engine = new SudokuEngine();
    this.audioManager = new AudioManager();

    // Core grid state
    this.grid     = Array(9).fill(null).map(() => Array(9).fill(0));
    this.solution = Array(9).fill(null).map(() => Array(9).fill(0));
    this.given    = Array(9).fill(null).map(() => Array(9).fill(false));
    this.level    = 'easy';
    this.selected = null;
    this.lastNumber = 0;
    this.history  = [];

    // Notes state
    this.notes = Array(9).fill(null).map(() => Array(9).fill(null).map(() => ({})));
    this.notesMode       = false;
    this.notesPhase      = 'position';
    this.notesClearMode  = false;
    this.noteSelectedPos = null;

    this.stats = this.migrateStats(JSON.parse(localStorage.getItem('sudokuStats')) || {});
    this.deferredPrompt = null;

    // Timer state — elapsedMs is the persisted total; when running, the live
    // value is elapsedMs + (Date.now() - timerStart).
    this.elapsedMs   = 0;
    this.timerStart  = 0;
    this.timerRunning = false;
    this.timerInterval = null;
    this.solved = false;

    this.checkPWAInstalled();
    this.init();
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
    document.getElementById('message').addEventListener('click', e => {
      if (e.target.dataset && e.target.dataset.action === 'restart') this.confirmRestart();
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
      onClose: () => {
        if (!this.solved && !document.getElementById('popup').classList.contains('active')) {
          this.startTimer();
        }
      },
      getStats: () => this.stats
    });

    // Resume music on first interaction (autoplay policy)
    const resumeAudio = () => {
      this.audioManager.resumeIfNeeded();
      document.removeEventListener('click', resumeAudio);
      document.removeEventListener('touchstart', resumeAudio);
    };
    document.addEventListener('click', resumeAudio);
    document.addEventListener('touchstart', resumeAudio);

    // Keyboard input — desktop quality-of-life
    document.addEventListener('keydown', e => this.handleKey(e));

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
    for (let i = 0; i < 81; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.index = i;
      cell.addEventListener('click', () => this.selectCell(i));
      cell.addEventListener('contextmenu', e => {
        e.preventDefault();
        this.requestPopup(i);
      });
      let touchTimer;
      cell.addEventListener('touchstart', e => {
        touchTimer = setTimeout(() => {
          e.preventDefault();
          this.requestPopup(i);
        }, 500);
      });
      cell.addEventListener('touchend', () => clearTimeout(touchTimer));
      cell.addEventListener('touchmove', () => clearTimeout(touchTimer));
      gridEl.appendChild(cell);
    }
  }

  // ── New game ────────────────────────────────────────────────────────────────
  newGame() {
    const puzzle = this.engine.generatePuzzle(this.level);
    this.grid     = puzzle.grid;
    this.solution = puzzle.solution;
    this.given    = puzzle.given;
    this.notes    = Array(9).fill(null).map(() => Array(9).fill(null).map(() => ({})));
    this.history  = [];
    this.selected = null;
    this.lastNumber = 0;
    this.resetNotesUI();
    this.resetTimer();
    this.startTimer();

    this.saveGame();
    this.render();
    this.hideMessage();
  }

  changeDifficulty(level) {
    if (level === this.level) return;
    if (this.hasProgress() && !confirm('Switch difficulty? Current progress will be lost.')) {
      // Re-sync the active class so the rejected button doesn't appear selected
      document.querySelectorAll('.diff-btn').forEach(btn =>
        btn.classList.toggle('active', btn.dataset.level === this.level)
      );
      return;
    }
    this.level = level;
    document.querySelectorAll('.diff-btn').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.level === level)
    );
    this.newGame();
  }

  // True iff the player has touched the puzzle (filled or cleared anything,
  // or added notes). Used to decide whether to confirm destructive actions.
  hasProgress() {
    if (this.history.length) return true;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (!this.given[r][c] && this.grid[r][c] !== 0) return true;
        if (this.notes[r][c] && Object.keys(this.notes[r][c]).length) return true;
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

  resetTimer() {
    this.elapsedMs = 0;
    this.timerStart = 0;
    this.timerRunning = false;
    this.solved = false;
    if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
    this.renderTimer();
  }

  // ── Stats migration ─────────────────────────────────────────────────────────
  // Old schema: { level: <number wins> }. New schema: { level: { wins, bestMs } }.
  migrateStats(raw) {
    const out = {};
    for (const k in raw) {
      const v = raw[k];
      if (typeof v === 'number') out[k] = { wins: v, bestMs: null };
      else if (v && typeof v === 'object') out[k] = { wins: v.wins || 0, bestMs: v.bestMs || null };
    }
    return out;
  }

  // ── Keyboard ────────────────────────────────────────────────────────────────
  handleKey(e) {
    // Don't interfere when typing in form fields (defensive — none today).
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
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

    // Digit input: place (or, in notes mode with popup open and a position
    // already chosen, place a note at that position).
    if (/^[1-9]$/.test(key)) {
      const num = parseInt(key, 10);
      if (this.selected === null) return;
      const row = Math.floor(this.selected / 9), col = this.selected % 9;
      if (this.given[row][col]) return;
      if (this.notesMode && popupOpen && this.notesPhase === 'number' && this.noteSelectedPos !== null) {
        this.placeNote(num);
      } else if (!this.notesMode) {
        this.placeNumber(num);
      }
      e.preventDefault();
      return;
    }

    if (key === 'Backspace' || key === 'Delete' || key === '0') {
      if (this.selected === null) return;
      const row = Math.floor(this.selected / 9), col = this.selected % 9;
      if (this.given[row][col]) return;
      // Use handleClear so undo history is recorded consistently.
      // handleClear branches on notesMode; in notes mode it opens the
      // clear-note picker, which is fine.
      this.handleClear();
      e.preventDefault();
      return;
    }

    if (key === 'n' || key === 'N') {
      this.toggleNotesMode();
      // toggleNotesMode calls showPopup; that's fine for power users.
      e.preventDefault();
      return;
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
    }
    this.render();
  }

  // ── Popup rendering ─────────────────────────────────────────────────────────
  showPopup() {
    if (this.selected === null) return;
    const popup   = document.getElementById('popup');
    const numGrid = document.getElementById('numberGrid');
    const header  = document.getElementById('popupHeader');
    numGrid.innerHTML = '';

    const row = Math.floor(this.selected / 9), col = this.selected % 9;
    const cellNotes = this.notes[row][col];

    if (this.notesMode && this.notesPhase === 'position') {
      header.textContent = this.notesClearMode ? 'Tap position to clear note' : 'Tap position to place note';
      for (let pos = 1; pos <= 9; pos++) {
        if (pos === 5) {
          const spacer = document.createElement('div');
          spacer.className = 'number-btn pos-spacer';
          numGrid.appendChild(spacer);
          continue;
        }
        const existingNote = cellNotes[pos];
        const btn = document.createElement('button');
        btn.className = 'number-btn pos-btn';

        if (this.notesClearMode) {
          if (existingNote) {
            btn.textContent = existingNote;
            btn.classList.add('has-note', 'clear-mode');
            btn.addEventListener('click', () => this.clearNote(pos));
          } else {
            btn.textContent = '';
            btn.style.opacity = '0.15';
            btn.disabled = true;
          }
        } else {
          if (existingNote) {
            btn.textContent = existingNote;
            btn.classList.add('has-note');
          }
          btn.addEventListener('click', () => this.selectNotePosition(pos));
        }
        numGrid.appendChild(btn);
      }
    } else if (this.notesMode && this.notesPhase === 'number') {
      header.textContent = 'Select number for note';
      for (let i = 1; i <= 9; i++) {
        const btn = document.createElement('button');
        btn.className = 'number-btn';
        btn.textContent = i;
        btn.addEventListener('click', () => this.placeNote(i));
        numGrid.appendChild(btn);
      }
    } else {
      header.textContent = '';
      for (let i = 1; i <= 9; i++) {
        const btn = document.createElement('button');
        btn.className = 'number-btn';
        btn.textContent = i;
        btn.addEventListener('click', () => this.placeNumber(i));
        numGrid.appendChild(btn);
      }
    }

    document.getElementById('notesToggle').classList.toggle('notes-active', this.notesMode);
    popup.classList.add('active');
    this.pauseTimer();
  }

  closePopup() {
    document.getElementById('popup').classList.remove('active');
    this.notesPhase = 'position';
    this.notesClearMode = false;
    this.noteSelectedPos = null;
    if (!this.solved && !this.isPanelOpen()) this.startTimer();
  }

  isPanelOpen() {
    return document.querySelector('.panel-overlay.active') !== null;
  }

  // ── Notes-mode helpers ──────────────────────────────────────────────────────
  toggleNotesMode() {
    this.notesMode = !this.notesMode;
    this.notesPhase = 'position';
    this.notesClearMode = false;
    this.noteSelectedPos = null;
    this.showPopup();
  }

  resetNotesUI() {
    this.notesMode = false;
    this.notesPhase = 'position';
    this.notesClearMode = false;
    this.noteSelectedPos = null;
  }

  selectNotePosition(pos) {
    this.noteSelectedPos = pos;
    this.notesPhase = 'number';
    this.showPopup();
  }

  placeNote(num) {
    if (this.selected === null || this.noteSelectedPos === null) return;
    const row = Math.floor(this.selected / 9), col = this.selected % 9;
    if (this.given[row][col] || this.grid[row][col] !== 0) return;
    this.notes[row][col][this.noteSelectedPos] = num;
    this.noteSelectedPos = null;
    this.notesPhase = 'position';
    this.notesClearMode = false;
    this.saveGame();
    this.closePopup();
    this.render();
  }

  clearNote(pos) {
    if (this.selected === null) return;
    const row = Math.floor(this.selected / 9), col = this.selected % 9;
    delete this.notes[row][col][pos];
    this.noteSelectedPos = null;
    this.notesPhase = 'position';
    this.notesClearMode = false;
    this.saveGame();
    this.closePopup();
    this.render();
  }

  // ── Number placement ────────────────────────────────────────────────────────
  placeNumber(num) {
    if (this.selected === null) return;
    const row = Math.floor(this.selected / 9), col = this.selected % 9;
    if (this.given[row][col]) return;
    this.history.push({
      index: this.selected,
      value: this.grid[row][col],
      notes: JSON.parse(JSON.stringify(this.notes[row][col]))
    });
    this.grid[row][col] = num;
    this.notes[row][col] = {};
    this.lastNumber = num;
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

    if (this.notesMode) {
      this.notesClearMode = true;
      this.notesPhase = 'position';
      this.noteSelectedPos = null;
      this.showPopup();
      return;
    }

    this.history.push({
      index: this.selected,
      value: this.grid[row][col],
      notes: JSON.parse(JSON.stringify(this.notes[row][col]))
    });
    this.grid[row][col] = 0;
    this.saveGame();
    this.closePopup();
    this.render();
  }

  // ── Undo ────────────────────────────────────────────────────────────────────
  undo() {
    if (!this.history.length) return;
    const last = this.history.pop();
    const row = Math.floor(last.index / 9), col = last.index % 9;
    this.grid[row][col] = last.value;
    if (last.notes) this.notes[row][col] = last.notes;
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

  checkSolution() {
    if (this.engine.isValidCompleteSolution(this.grid)) {
      this.pauseTimer();
      this.solved = true;
      const finalMs = this.elapsedMs;
      if (!this.stats[this.level]) this.stats[this.level] = { wins: 0, bestMs: null };
      this.stats[this.level].wins++;
      const prevBest = this.stats[this.level].bestMs;
      const isNewBest = prevBest == null || finalMs < prevBest;
      if (isNewBest) this.stats[this.level].bestMs = finalMs;
      localStorage.setItem('sudokuStats', JSON.stringify(this.stats));
      this.clearSavedGame();
      this.audioManager.playSound('win');
      const timeStr = this.formatTime(finalMs);
      const msg = isNewBest
        ? `Congratulations! New best time: ${timeStr}!`
        : `Congratulations! Solved in ${timeStr}.`;
      this.showMessage(msg, 'success');
      setTimeout(() => this.newGame(), 3000);
    } else {
      this.audioManager.playSound('error');
      this.showMessage('Incorrect solution. <span class="restart-link" data-action="restart">Restart?</span>', 'error');
      document.getElementById('grid').classList.add('error-border');
      setTimeout(() => {
        this.hideMessage();
        document.getElementById('grid').classList.remove('error-border');
      }, 5000);
    }
  }

  confirmRestart() {
    if (confirm('Restart this game?')) this.newGame();
  }

  confirmNewGame() {
    if (!this.hasProgress() || confirm('Start a new game? Current progress will be lost.')) this.newGame();
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  render() {
    const cells = document.querySelectorAll('.cell');
    const selRow = this.selected !== null ? Math.floor(this.selected / 9) : -1;
    const selCol = this.selected !== null ? this.selected % 9 : -1;
    const selNum = this.selected !== null ? this.grid[selRow][selCol] : 0;

    const selBoxR = selRow >= 0 ? Math.floor(selRow / 3) * 3 : -1;
    const selBoxC = selCol >= 0 ? Math.floor(selCol / 3) * 3 : -1;

    cells.forEach((cell, index) => {
      const row = Math.floor(index / 9), col = index % 9;
      const value = this.grid[row][col];
      const cellNotes = this.notes[row][col];
      const hasNotes = Object.keys(cellNotes).length > 0;

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

      // Conflict detection (user-placed numbers only)
      if (value > 0 && !this.given[row][col]) {
        let conflict = false;
        for (let i = 0; i < 9; i++) {
          if (i !== col && this.grid[row][i] === value) conflict = true;
          if (i !== row && this.grid[i][col] === value) conflict = true;
        }
        const br = Math.floor(row / 3) * 3, bc = Math.floor(col / 3) * 3;
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) {
            const r = br + i, c = bc + j;
            if ((r !== row || c !== col) && this.grid[r][c] === value) conflict = true;
          }
        }
        if (conflict) cell.classList.add('conflict');
      }

      if (value) {
        cell.textContent = value;
      } else if (hasNotes) {
        const notesGrid = document.createElement('div');
        notesGrid.className = 'cell-notes';
        for (let pos = 1; pos <= 9; pos++) {
          const slot = document.createElement('div');
          slot.className = 'cell-note';
          if (pos !== 5 && cellNotes[pos]) slot.textContent = cellNotes[pos];
          notesGrid.appendChild(slot);
        }
        cell.appendChild(notesGrid);
      }
    });
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
  saveGame() {
    localStorage.setItem('sudokuGame2', JSON.stringify({
      grid: this.grid, solution: this.solution, given: this.given,
      level: this.level, history: this.history, selected: this.selected,
      lastNumber: this.lastNumber, notes: this.notes,
      elapsedMs: this.currentElapsedMs()
    }));
  }

  loadGame() {
    const saved = localStorage.getItem('sudokuGame2');
    if (saved) {
      try {
        const s = JSON.parse(saved);
        if (!this.isValidSavedState(s)) throw new Error('saved state failed validation');
        this.grid       = s.grid;
        this.solution   = s.solution;
        this.given      = s.given;
        this.level      = s.level;
        this.history    = Array.isArray(s.history) ? s.history : [];
        this.selected   = (typeof s.selected === 'number' && s.selected >= 0 && s.selected < 81) ? s.selected : null;
        this.lastNumber = s.lastNumber || 0;
        this.notes      = this.isValid9x9Object(s.notes) ? s.notes
                          : Array(9).fill(null).map(() => Array(9).fill(null).map(() => ({})));
        this.elapsedMs  = (typeof s.elapsedMs === 'number' && s.elapsedMs >= 0) ? s.elapsedMs : 0;
        document.querySelectorAll('.diff-btn').forEach(btn =>
          btn.classList.toggle('active', btn.dataset.level === this.level)
        );
        this.render();
        this.renderTimer();
        this.startTimer();
        return;
      } catch (e) {
        console.warn('Discarding corrupt saved game:', e.message);
        localStorage.removeItem('sudokuGame2');
      }
    }
    this.newGame();
  }

  isValidSavedState(s) {
    if (!s || typeof s !== 'object') return false;
    const levels = ['basic', 'simple', 'easy', 'medium', 'hard', 'crazy'];
    if (!levels.includes(s.level)) return false;
    if (!this.isValid9x9Numbers(s.grid, 0, 9)) return false;
    if (!this.isValid9x9Numbers(s.solution, 1, 9)) return false;
    if (!this.isValid9x9Booleans(s.given)) return false;
    return true;
  }

  isValid9x9Numbers(g, min, max) {
    if (!Array.isArray(g) || g.length !== 9) return false;
    for (let r = 0; r < 9; r++) {
      if (!Array.isArray(g[r]) || g[r].length !== 9) return false;
      for (let c = 0; c < 9; c++) {
        const v = g[r][c];
        if (typeof v !== 'number' || v < min || v > max) return false;
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

  isValid9x9Object(g) {
    if (!Array.isArray(g) || g.length !== 9) return false;
    for (let r = 0; r < 9; r++) {
      if (!Array.isArray(g[r]) || g[r].length !== 9) return false;
      for (let c = 0; c < 9; c++) {
        if (g[r][c] === null || typeof g[r][c] !== 'object') return false;
      }
    }
    return true;
  }

  clearSavedGame() { localStorage.removeItem('sudokuGame2'); }
}

const game = new SudokuGame();
