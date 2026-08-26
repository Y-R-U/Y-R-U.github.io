// Mission brief: the radio line, the objectives, the reward, your loadout, and LAUNCH.

import { el, btn, topbar, secs, toast } from '../widgets.js';
import { cash, distText } from '../units.js';
import { iconCanvas, planeCanvas, drawStar, GOLD } from '../icons.js';
import * as M from '../model.js';

const TAG_LABEL = {
  light: 'light structures', bunker: 'bunkers', depot: 'fuel depots',
  armour: 'armour', radar: 'radar masts',
};

export function objectiveText(o, data) {
  const E = (data && data.ENEMIES) || {};
  switch (o.type) {
    case 'destroy': {
      const what = o.tag ? (TAG_LABEL[o.tag] || o.tag) : (E[o.def] && E[o.def].name) || plural(o.kind);
      return `Destroy ${o.count} ${what}`;
    }
    case 'kill': return `Shoot down ${o.count} ${plural(o.kind || 'fighter')}`;
    case 'survive': return `Stay airborne for ${o.seconds}s`;
    case 'land': return `Land on the ${o.padId || 'pad'}`;
    case 'collect': return `Collect ${o.count} supply balloons`;
    case 'escort': return `Escort the ${o.what || 'convoy'} home`;
    default: return o.text || o.type;
  }
}

function plural(kind) {
  if (kind === 'fighter') return 'aircraft';
  if (kind === 'flak') return 'AA guns';
  if (kind === 'ground') return 'ground targets';
  return (kind || 'targets') + 's';
}

export function mount(root, ctx) {
  const { data, save } = ctx;
  const LEVELS = data.LEVELS;
  const id = ctx.args.levelId;
  const idx = Math.max(0, LEVELS.findIndex((l) => l.id === id));
  const lv = LEVELS[idx];
  const mode = ctx.args.mode || 'story';

  root.appendChild(topbar(ctx, 'BRIEFING', { back: () => ctx.go('levelselect'), screen: 'brief' }));

  if (!lv) {
    root.appendChild(el('div.empty', {}, 'No such mission: ' + id));
    return;
  }

  const stars = M.levelStars(save, lv.id);
  const rec = M.levelRecord(save, lv.id);
  const plane = M.currentPlane(save, data.PLANES);

  const left = el('section.brief-left', {},
    el('div.brief-eyebrow', {}, `ACT ${lv.act} · MISSION ${lv.id.toUpperCase()}`),
    el('h2.brief-name', {}, lv.name),
    el('div.badges', {},
      el('span.badge', {}, String(lv.biome || '').toUpperCase()),
      el('span.badge', {}, String(lv.timeOfDay || '').toUpperCase()),
      el('span.badge', {}, String(lv.weather || '').toUpperCase()),
      el('span.badge.dim', {}, distText(lv.length || 0))
    ),
    el('div.radio', {},
      el('div.radio-head', {}, el('span.radio-dot'), speakerName(data, actIntro(lv, data, LEVELS, idx)) || 'CONTROL'),
      el('p.radio-line', {}, (actIntro(lv, data, LEVELS, idx) || {}).text || lv.intro || '—')
    ),
    opfor(lv, data),
    plane ? el('div.brief-plane', {},
      planeCanvas(plane.shape, 160, 68),
      el('div.brief-plane-t', {},
        el('div.brief-plane-n', {}, plane.name),
        el('div.brief-plane-m', {}, `TIER ${plane.tier}`, document.createElement('br'), `${M.slotCount(plane)} HARDPOINTS`)
      )
    ) : null,
    el('div.brief-foot', {},
      el('div.kv', {}, el('span', {}, 'PAR'), el('b', {}, secs(lv.par || 0))),
      rec && rec.best ? el('div.kv', {}, el('span', {}, 'BEST'), el('b', {}, secs(rec.best))) : null,
      el('div.kv', {}, el('span', {}, 'REWARD'), el('b.gold', {}, cash((lv.reward || {}).money || 0))),
      el('div.kv.stars', {}, starRow(stars))
    )
  );

  const objs = el('ul.objs');
  for (const o of lv.objectives || []) {
    objs.appendChild(el('li.obj', {}, el('span.obj-tick'), objectiveText(o, data)));
  }
  if (!(lv.objectives || []).length) objs.appendChild(el('li.obj', {}, el('span.obj-tick'), 'Reach the far end of the map'));

  const l = M.normaliseLoadout(save, plane);
  const n = M.slotCount(plane);
  const slots = el('div.brief-slots');
  for (let i = 0; i < n; i++) {
    const w = l[i] ? data.WEAPONS[l[i]] : null;
    slots.appendChild(el('div.bslot' + (w ? '.full' : ''), {},
      w ? iconCanvas(w.icon || 'bomb', 22, GOLD) : el('span.slot-empty', {}, '—'),
      el('span.bslot-n', {}, w ? String(w.ammo) : '')
    ));
  }

  const right = el('section.brief-right', {},
    el('h3.sec-h', {}, 'OBJECTIVES'),
    objs,
    el('div.loadline', {},
      el('div.loadline-l', {},
        el('div.sec-h.sm', {}, 'LOADOUT'),
        el('div.loadline-plane', {}, plane ? plane.name : '—')
      ),
      slots,
      btn('mini ghost', 'CHANGE', () => ctx.go('hangar'))
    ),
    btn('launch', el('span.play-inner', {},
      el('span.play-label', {}, 'LAUNCH'),
      el('span.play-sub', {}, mode === 'story' ? 'Story' : mode.toUpperCase())
    ), () => {
      if (!l.slice(0, n).some(Boolean)) {
        toast('Flying with no ordnance — guns only', 'bad');
      }
      ctx.start(lv.id, mode);
    })
  );

  root.appendChild(el('div.brief-body', {}, left, right));
}

export function unmount() {}

/** The act-opening beat, if this is the first mission of its act; else null. */
function actIntro(lv, data, LEVELS, idx) {
  const S = data && data.STORY;
  if (!S || !S.ACT_INTRO) return null;
  if (idx > 0 && LEVELS[idx - 1] && LEVELS[idx - 1].act === lv.act) return null;
  return S.ACT_INTRO[lv.act] || null;
}

function speakerName(data, beat) {
  if (!beat) return null;
  const cast = data && data.STORY && data.STORY.CAST;
  const who = cast && cast[beat.speaker];
  return (who && (who.name || who.callsign)) || String(beat.speaker || '').toUpperCase();
}

/** What the level actually spawns, counted by kind — the "what am I flying into" line. */
function opfor(lv, data) {
  const E = (data && data.ENEMIES) || {};
  const count = new Map();
  const add = (k, n) => { if (!k || k === 'pad' || k === 'balloon') return; count.set(k, (count.get(k) || 0) + n); };
  for (const sp of lv.spawns || []) add(sp.kind || sp.def, 1);
  for (const wv of lv.waves || []) add(wv.def || wv.kind, wv.n || 1);
  if (!count.size) return null;
  const rows = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) =>
    el('span.opfor-t', {}, el('b', {}, String(n)), (E[k] && E[k].name) || k));
  return el('div.opfor', {},
    el('div.opfor-h', {}, 'OPPOSITION'),
    el('div.opfor-row', {}, rows)
  );
}

function starRow(n) {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = 66 * dpr; c.height = 20 * dpr;
  c.style.width = '66px'; c.style.height = '20px';
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  for (let i = 0; i < 3; i++) drawStar(g, 11 + i * 22, 10, 9, i < n);
  return c;
}
