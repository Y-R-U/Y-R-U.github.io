/**
 * Central game-phase state machine.
 * Phases: MENU | SETUP | PLAYING | AI_TURN | COMBAT_ANIM | GAME_OVER
 */
export class GameState {
  constructor() {
    this.phase      = 'MENU';
    this.prevPhase  = null;

    // Playing sub-state
    this.selectedArmy   = null;
    this.reachable      = null;   // Map<"x,y",cost> from army BFS
    this.hoveredTile    = null;   // { tx, ty }
    this.hoveredPath    = null;   // {x,y}[] A* preview path

    // Pending combat result to display
    this.pendingCombat  = null;   // { result, atkName, defName }

    // City panel
    this.openCity       = null;

    // Messages
    this.flashMessage   = null;
    this.flashTimer     = 0;
  }

  setPhase(phase) {
    this.prevPhase = this.phase;
    this.phase     = phase;
  }

  isPlaying()  { return this.phase === 'PLAYING'; }
  isMenu()     { return this.phase === 'MENU'; }
  isSetup()    { return this.phase === 'SETUP'; }
  isGameOver() { return this.phase === 'GAME_OVER'; }
  isAiTurn()   { return this.phase === 'AI_TURN'; }

  selectArmy(army) {
    this.selectedArmy = army;
    this.reachable    = null;
    this.hoveredPath  = null;
  }

  deselect() {
    this.selectedArmy = null;
    this.reachable    = null;
    this.hoveredPath  = null;
  }

  flash(msg, duration = 120) {
    this.flashMessage = msg;
    this.flashTimer   = duration;
  }

  tick() {
    if (this.flashTimer > 0) this.flashTimer--;
    if (this.flashTimer === 0) this.flashMessage = null;
  }

  /** UI state object passed to renderer */
  uiState() {
    return {
      selectedArmy: this.selectedArmy,
      reachable:    this.reachable,
      hoveredPath:  this.hoveredPath,
      flashMessage: this.flashMessage,
    };
  }
}
