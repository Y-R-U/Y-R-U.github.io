// ===== Skills Panel UI =====
import { SKILLS, SKILL_LEVEL_CAP, xpForLevel } from '../config.js';
import { getState } from '../state.js';

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
      <div class="skill-level" style="color:${def.color}">${level}</div>
    `;
    list.appendChild(row);
  }
}
