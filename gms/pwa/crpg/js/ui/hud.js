// ===== HUD — HP/XP bars, gold counter =====
import { getState, getSkill, calcCombatLevel, calcMaxHp } from '../state.js';
import { getSkillProgress } from '../skills/skillEngine.js';
import { SKILLS } from '../config.js';

let _hpBar, _hpText, _xpBar, _xpText, _goldText;

export function initHUD() {
  _hpBar    = document.getElementById('hp-bar');
  _hpText   = document.getElementById('hp-text');
  _xpBar    = document.getElementById('xp-bar');
  _xpText   = document.getElementById('xp-text');
  _goldText = document.getElementById('gold-text');

  // Add flash divs if not present
  if (!document.getElementById('boss-flash')) {
    const bf = document.createElement('div');
    bf.id = 'boss-flash';
    document.getElementById('canvas-wrap').appendChild(bf);
  }
  if (!document.getElementById('levelup-flash')) {
    const lf = document.createElement('div');
    lf.id = 'levelup-flash';
    document.getElementById('canvas-wrap').appendChild(lf);
  }
  if (!document.getElementById('fade-overlay')) {
    const fo = document.createElement('div');
    fo.id = 'fade-overlay';
    document.getElementById('canvas-wrap').appendChild(fo);
  }
}

export function updateHUD() {
  const st = getState();
  const player = st.player;

  // HP
  const hp    = player.hp;
  const maxHp = player.maxHp || calcMaxHp();
  const hpPct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  if (_hpBar) _hpBar.style.width = hpPct + '%';
  if (_hpText) _hpText.textContent = `${hp}/${maxHp}`;

  // Combat XP (use Attack skill for HUD XP bar)
  const atkSk   = getSkill('attack');
  const atkProg = getSkillProgress('attack');
  if (_xpBar)  _xpBar.style.width = (atkProg * 100) + '%';
  if (_xpText) _xpText.textContent = `Cb ${calcCombatLevel()}`;

  // Gold
  if (_goldText) _goldText.textContent = player.gold.toLocaleString();
}

export function flashBoss() {
  const el = document.getElementById('boss-flash');
  if (!el) return;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 700);
}

export function fadeToBlack(cb) {
  const el = document.getElementById('fade-overlay');
  if (!el) { if (cb) cb(); return; }
  el.classList.add('fade-in');
  setTimeout(() => {
    if (cb) cb();
    setTimeout(() => { el.classList.remove('fade-in'); }, 400);
  }, 400);
}
