// ===== Skills Panel UI =====
import { SKILLS, SKILL_LEVEL_CAP, xpForLevel } from '../config.js';
import { getState } from '../state.js';

// Maps skill ID → buff stat key used in player.buffs
const SKILL_TO_BUFF_STAT = {
  attack: 'atk', strength: 'str', defence: 'def', magic: 'mag', ranged: 'rng',
};

export function renderSkillsPanel() {
  const list = document.getElementById('skills-list');
  if (!list) return;
  list.innerHTML = '';

  const st = getState();

  for (const [id, def] of Object.entries(SKILLS)) {
    const sk = st.player.skills[id] || { level: 1, xp: 0 };
    const level = sk.level;
    const xp    = sk.xp;
    const needed = level < SKILL_LEVEL_CAP ? xpForLevel(level) : 0;
    const pct    = level >= SKILL_LEVEL_CAP ? 100 : Math.min(100, (xp / needed) * 100);

    // Check for active buff on this skill
    const buffStat  = SKILL_TO_BUFF_STAT[id];
    const now       = Date.now();
    const activeBuff = buffStat
      ? (st.player.buffs || []).find(b => b.stat === buffStat && b.endsAt > now)
      : null;
    const minsLeft = activeBuff ? Math.ceil((activeBuff.endsAt - now) / 60000) : 0;

    const row = document.createElement('div');
    row.className = 'skill-row';
    row.innerHTML = `
      <div class="skill-glyph" style="background:${def.color}22;color:${def.color}">${def.glyph}</div>
      <div class="skill-info">
        <div class="skill-name">${def.name}</div>
        <div class="skill-xp-wrap">
          <div class="skill-xp-bar" style="width:${pct}%;background:${def.color}"></div>
        </div>
        <div class="skill-xp-text">${xp.toLocaleString()} / ${needed.toLocaleString()} XP</div>
      </div>
      <div class="skill-level" style="color:${activeBuff ? '#f5a623' : def.color}">
        ${level}
        ${activeBuff ? `<div class="skill-boost-tag">+${activeBuff.amount} (${minsLeft}m)</div>` : ''}
      </div>
    `;
    list.appendChild(row);
  }
}
