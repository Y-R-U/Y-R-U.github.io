// history.js - Undo/redo via state snapshots

const MAX_HISTORY = 50;

export function createHistory(state) {
  const history = {
    _undoStack: [],
    _redoStack: [],
    _state: state,

    // Take a snapshot of current state and push to undo stack
    push() {
      this._undoStack.push(this._state.serializeLayers());
      if (this._undoStack.length > MAX_HISTORY) {
        this._undoStack.shift();
      }
      this._redoStack = [];
      this._notify();
    },

    undo() {
      if (this._undoStack.length === 0) return;
      // Save current state to redo stack
      this._redoStack.push(this._state.serializeLayers());
      // Restore previous state
      const prev = this._undoStack.pop();
      this._state.restoreLayers(prev);
      this._notify();
    },

    redo() {
      if (this._redoStack.length === 0) return;
      // Save current state to undo stack
      this._undoStack.push(this._state.serializeLayers());
      // Restore next state
      const next = this._redoStack.pop();
      this._state.restoreLayers(next);
      this._notify();
    },

    canUndo() { return this._undoStack.length > 0; },
    canRedo() { return this._redoStack.length > 0; },

    _notify() {
      this._state.emit('history-changed');
    },
  };

  return history;
}
