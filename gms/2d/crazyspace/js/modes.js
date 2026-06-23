// modes.js — game-mode rules: Deathmatch, Team Battle, CTF, King of the Hill.

import { MODES, TEAMS, TILE } from './config.js';
import { Flag } from './entities.js';
import { dist, fmtTime } from './util.js';

class Mode {
  constructor(key, game) {
    this.key = key;
    this.def = MODES[key];
    this.game = game;
    this.name = this.def.name;
    this.teamCount = this.def.teams;
    this.ffa = !!this.def.ffa;
    this.scoreLimit = this.def.scoreLimit;
    this.teamScore = [0, 0, 0, 0];
    this.over = false;
    this.winnerText = '';
  }
  init() {}
  update(dt) {}
  areEnemies(a, b) { return a.team !== b.team; }
  objectiveFor(ship) { return null; }

  onKill(killer, victim) {
    // default combat scoring
    if (killer && killer !== victim && this.areEnemies(killer, victim)) {
      killer.stats.kills++;
      killer.stats.score += 1;
      killer.bounty += 1;
      if (!this.ffa) this.teamScore[killer.team]++;
      this.game.killFeed.push({ a: killer.name, b: victim.name, ac: killer.color.color, bc: victim.color.color, t: 4 });
      this._checkScoreWin();
    } else {
      this.game.killFeed.push({ a: '', b: victim.name, bc: victim.color.color, t: 4, suicide: true });
    }
  }

  _checkScoreWin() {
    if (this.ffa) {
      let best = null;
      for (const s of this.game.ships) if (!best || s.stats.kills > best.stats.kills) best = s;
      if (best && best.stats.kills >= this.scoreLimit) this.end(best.name + ' wins!');
    } else {
      for (let t = 0; t < this.teamCount; t++)
        if (this.teamScore[t] >= this.scoreLimit) this.end(TEAMS[t].name + ' Team wins!');
    }
  }

  onTimeUp() {
    if (this.ffa) {
      let best = null;
      for (const s of this.game.ships) if (!best || s.stats.kills > best.stats.kills) best = s;
      this.end((best ? best.name : 'Nobody') + ' wins on time!');
    } else {
      const a = this.teamScore[0], b = this.teamScore[1];
      this.end(a === b ? "Time — it's a draw!" : (TEAMS[a > b ? 0 : 1].name + ' Team wins on time!'));
    }
  }

  end(text) { if (!this.over) { this.over = true; this.winnerText = text; this.game.endMatch(text); } }

  // HUD top-bar string
  statusLine() {
    if (this.ffa) {
      const me = this.game.player;
      return `Frags ${me ? me.stats.kills : 0} / ${this.scoreLimit}`;
    }
    return `${TEAMS[0].name} ${this.teamScore[0]}  —  ${this.teamScore[1]} ${TEAMS[1].name}`;
  }
}

// ----------------------------------------------------------- Deathmatch (FFA)
class Deathmatch extends Mode {}

// ----------------------------------------------------------- Team Battle
class TeamBattle extends Mode {}

// ----------------------------------------------------------- CTF
class CTF extends Mode {
  init() {
    this.flags = [];
    for (const b of this.game.world.bases) {
      const f = new Flag(b.team, b.x, b.y);
      this.flags.push(f);
    }
    this.game.flags = this.flags;
    this.dropReturn = 18;
  }
  flagOfTeam(t) { return this.flags.find(f => f.team === t); }

  update(dt) {
    for (const f of this.flags) {
      if (f.state === 'carried') {
        const c = f.carrier;
        if (!c || !c.alive) { this._drop(f, c); continue; }
        f.x = c.x; f.y = c.y;
      } else if (f.state === 'dropped') {
        f.dropTimer -= dt;
        if (f.dropTimer <= 0) this._returnHome(f);
      }
    }

    for (const s of this.game.ships) {
      if (!s.alive) continue;
      for (const f of this.flags) {
        const d = dist(s.x, s.y, f.x, f.y);
        if (f.team === s.team) {
          // return own dropped flag
          if (f.state === 'dropped' && d < 30) { this._returnHome(f); s.stats.returns++; this.game.popup('Flag Returned', s.x, s.y, s.color.color); }
        } else {
          // grab enemy flag
          if ((f.state === 'home' || f.state === 'dropped') && !s.carryingFlag && d < f.radius + s.radius + 6) {
            f.state = 'carried'; f.carrier = s; s.carryingFlag = f;
            this.game.popup('Flag Taken!', s.x, s.y, s.color.color);
            this.game.audio && this.game.audio.flag();
          }
        }
      }
      // capture
      if (s.carryingFlag) {
        const home = this.flagOfTeam(s.team);
        const base = this.game.world.bases.find(b => b.team === s.team);
        if (base && dist(s.x, s.y, base.x, base.y) < 46 && home.state === 'home') {
          const f = s.carryingFlag;
          this._returnHome(f); s.carryingFlag = null;
          this.teamScore[s.team]++; s.stats.caps++; s.stats.score += 8;
          this.game.popup('CAPTURE!', s.x, s.y, '#fff', 1.4);
          this.game.audio && this.game.audio.capture();
          this.game.bigEvent(TEAMS[s.team].name + ' scores! ' + this.teamScore[s.team] + '/' + this.scoreLimit);
          if (this.teamScore[s.team] >= this.scoreLimit) this.end(TEAMS[s.team].name + ' Team wins!');
        }
      }
    }
  }

  _drop(f, c) {
    f.state = 'dropped'; f.dropTimer = this.dropReturn;
    if (c) { f.x = c.x; f.y = c.y; c.carryingFlag = null; }
    f.carrier = null;
  }
  _returnHome(f) { f.state = 'home'; f.carrier = null; f.x = f.homeX; f.y = f.homeY; }

  onKill(killer, victim) {
    super.onKill(killer, victim);
    if (victim.carryingFlag) this._drop(victim.carryingFlag, victim);
  }

  objectiveFor(ship) {
    if (ship.carryingFlag) {
      const base = this.game.world.bases.find(b => b.team === ship.team);
      return base ? { x: base.x, y: base.y } : null;
    }
    const enemyFlag = this.flags.find(f => f.team !== ship.team && f.state !== 'carried');
    if (enemyFlag) return { x: enemyFlag.x, y: enemyFlag.y };
    const ownDropped = this.flags.find(f => f.team === ship.team && f.state === 'dropped');
    if (ownDropped) return { x: ownDropped.x, y: ownDropped.y };
    return null;
  }

  statusLine() {
    return `${TEAMS[0].name} ${this.teamScore[0]} 🚩 ${this.teamScore[1]} ${TEAMS[1].name}`;
  }
}

// ----------------------------------------------------------- King of the Hill
class KOTH extends Mode {
  init() {
    this.zone = this.game.world.zone;
    this.game.zone = this.zone;
    this.fscore = [0, 0];
    this.holder = -1; // -1 none/contested
  }
  update(dt) {
    const counts = [0, 0];
    for (const s of this.game.ships) {
      if (!s.alive) continue;
      if (dist(s.x, s.y, this.zone.x, this.zone.y) < this.zone.r) counts[s.team]++;
    }
    if (counts[0] > 0 && counts[1] === 0) this.holder = 0;
    else if (counts[1] > 0 && counts[0] === 0) this.holder = 1;
    else this.holder = -1;

    if (this.holder >= 0) {
      this.fscore[this.holder] += dt * 11;
      this.teamScore[this.holder] = Math.floor(this.fscore[this.holder]);
      if (this.teamScore[this.holder] >= this.scoreLimit) this.end(TEAMS[this.holder].name + ' Team wins!');
    }
    this.contested = counts[0] > 0 && counts[1] > 0;
  }
  objectiveFor(ship) { return { x: this.zone.x, y: this.zone.y }; }
  statusLine() {
    const tag = this.holder < 0 ? (this.contested ? 'CONTESTED' : 'NEUTRAL') : TEAMS[this.holder].name + ' holds';
    return `${TEAMS[0].name} ${this.teamScore[0]} 👑 ${this.teamScore[1]} ${TEAMS[1].name}  · ${tag}`;
  }
}

export function createMode(key, game) {
  switch (key) {
    case 'ctf': return new CTF(key, game);
    case 'koth': return new KOTH(key, game);
    case 'team': return new TeamBattle(key, game);
    default: return new Deathmatch(key, game);
  }
}
