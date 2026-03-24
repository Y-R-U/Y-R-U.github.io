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

    this.stats = JSON.parse(localStorage.getItem('sudokuStats')) || {};
    this.deferredPrompt = null;

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

    // Panels
    this.panels = new PanelManager(this.audioManager);

    // Resume music on first interaction (autoplay policy)
    const resumeAudio = () => {
      this.audioManager.resumeIfNeeded();
      document.removeEventListener('click', resumeAudio);
      document.removeEventListener('touchstart', resumeAudio);
    };
    document.addEventListener('click', resumeAudio);
    document.addEventListener('touchstart', resumeAudio);

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
        this.selectCell(i);
        this.showPopup();
      });
      let touchTimer;
      cell.addEventListener('touchstart', e => {
        touchTimer = setTimeout(() => {
          e.preventDefault();
          this.selectCell(i);
          this.showPopup();
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

    this.saveGame();
    this.render();
    this.hideMessage();
  }

  changeDifficulty(level) {
    this.level = level;
    document.querySelectorAll('.diff-btn').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.level === level)
    );
    this.newGame();
  }

  // ── Cell selection / popup ──────────────────────────────────────────────────
  selectCell(index) {
    const row = Math.floor(index / 9), col = index % 9;
    if (this.given[row][col]) return;
    this.selected = index;
    this.audioManager.playSound('click');

    const val = this.grid[row][col];
    if (val > 0) { this.showPopup(); this.render(); return; }
    if (!this.notesMode && this.lastNumber > 0 && this.engine.canPlaceNumber(this.grid, row, col, this.lastNumber)) {
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
  }

  closePopup() {
    document.getElementById('popup').classList.remove('active');
    this.notesPhase = 'position';
    this.notesClearMode = false;
    this.noteSelectedPos = null;
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
      if (!this.stats[this.level]) this.stats[this.level] = 0;
      this.stats[this.level]++;
      localStorage.setItem('sudokuStats', JSON.stringify(this.stats));
      this.clearSavedGame();
      this.audioManager.playSound('win');
      this.showMessage('Congratulations! You solved it!', 'success');
      setTimeout(() => this.newGame(), 3000);
    } else {
      this.audioManager.playSound('error');
      this.showMessage('Incorrect solution. <span class="restart-link" onclick="game.confirmRestart()">Restart?</span>', 'error');
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
    if (confirm('Start a new game? Current progress will be lost.')) this.newGame();
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  render() {
    const cells = document.querySelectorAll('.cell');
    const selRow = this.selected !== null ? Math.floor(this.selected / 9) : -1;
    const selCol = this.selected !== null ? this.selected % 9 : -1;
    const selNum = this.selected !== null ? this.grid[selRow][selCol] : 0;

    cells.forEach((cell, index) => {
      const row = Math.floor(index / 9), col = index % 9;
      const value = this.grid[row][col];
      const cellNotes = this.notes[row][col];
      const hasNotes = Object.keys(cellNotes).length > 0;

      cell.innerHTML = '';
      cell.className = 'cell';

      if (this.given[row][col]) cell.classList.add('given');
      else if (value) cell.classList.add('filled');
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
      lastNumber: this.lastNumber, notes: this.notes
    }));
  }

  loadGame() {
    const saved = localStorage.getItem('sudokuGame2');
    if (saved) {
      try {
        const s = JSON.parse(saved);
        this.grid       = s.grid;
        this.solution   = s.solution;
        this.given      = s.given;
        this.level      = s.level;
        this.history    = s.history || [];
        this.selected   = s.selected;
        this.lastNumber = s.lastNumber || 0;
        this.notes      = s.notes || Array(9).fill(null).map(() => Array(9).fill(null).map(() => ({})));
        document.querySelectorAll('.diff-btn').forEach(btn =>
          btn.classList.toggle('active', btn.dataset.level === this.level)
        );
        this.render();
        return;
      } catch (e) {
        console.error('Failed to load saved game', e);
      }
    }
    this.newGame();
  }

  clearSavedGame() { localStorage.removeItem('sudokuGame2'); }
}

const game = new SudokuGame();
