// ---- DOM UI: menus, career hub, cup bracket, settings, popups, HUD ----
import { KIT_CHOICES, NATIONS, GIANTS } from './teams.js';
import {
  loadCareer, newCareer, deleteCareer, userTeam, userDiv, nextFixture, table,
  catalogue, DIV_NAMES, ccNextMatch, CC_STAGES, wcUserMatch, WC_STAGES,
} from './league.js';
import { drawBadge, bakePlayerSheet, drawSprite, CELL_W, CELL_H, SKINS, HAIRS, POSE } from './sprites.js';
import { HALF_CHOICES } from './const.js';
import { pick, clamp } from './util.js';
import { AUDIO } from './audio.js';

// tiny dom helper
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const k in props) {
    if (k === 'class') el.className = props[k];
    else if (k === 'html') el.innerHTML = props[k];
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), props[k]);
    else el.setAttribute(k, props[k]);
  }
  for (const kid of kids) {
    if (kid == null) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return el;
}

const $ = (id) => document.getElementById(id);

const COMMENT = {
  goal: ['WHAT A FINISH!', 'The net bulges!', 'Absolute scenes!', 'Top bins!', 'The keeper had no chance!'],
  save: ['Great hands from the keeper!', 'Denied!', 'What a stop!'],
  post: ['Off the woodwork!', 'So close — rattled the frame!'],
  foul: ['Crunching challenge — the ref blows up', 'That one hurt. Free kick.', 'Late! The whistle goes'],
  corner: ['Corner — bodies in the box!', 'Chance to swing one in'],
  tackle: ['Won it cleanly!', 'Lovely sliding tackle!'],
  penaltyAim: ['A penalty! Keep your nerve...'],
  offside: ["Flag's up — offside!", 'Caught napping beyond the last man!'],
  throwin: [],
  kickoff: [],
};

function cardLine({ f, kind, n, bookings }) {
  const name = f.person.name;
  if (kind === 'yellow') {
    if (n >= 2) return `🟨 Second yellow for ${name} — one more and he walks!`;
    return pick([`🟨 Booked — ${name} goes in the notebook`, `🟨 Yellow for ${name}`, `🟨 ${name} is in the book`]);
  }
  if (bookings) return `🟥 Third booking — ${name} is OFF! Down to ten!`;
  return pick([`🟥 RED! ${name} sees straight red!`, `🟥 ${name} is sent off — an early bath!`]);
}

class UISys {
  constructor() {
    this.app = null;
    this.tickerTimer = null;
    this.badgeCache = new Map();
  }

  init(app) {
    this.app = app;
    this.scr = { menu: $('scr-menu'), career: $('scr-career'), pick: $('scr-pick'), cup: $('scr-cup') };
    $('pauseBtn').addEventListener('click', () => this.app.pauseToggle());
  }

  // ---------- helpers ----------
  hideAll() {
    for (const k in this.scr) this.scr[k].classList.add('hidden');
  }
  _show(name, builder) {
    this.hideAll();
    const el = this.scr[name];
    el.innerHTML = '';
    el.append(builder());
    el.classList.remove('hidden');
    el.scrollTop = 0;
  }

  badgeCanvas(style, c1, c2, size = 48) {
    const c = document.createElement('canvas');
    c.width = size * 2; c.height = size * 2;
    c.style.width = size + 'px'; c.style.height = size + 'px';
    const ctx = c.getContext('2d');
    ctx.scale(2, 2);
    drawBadge(ctx, style, c1, c2, size / 2, size / 2, size * 0.86);
    return c;
  }

  playerPreview(kit, size = 3) {
    const c = document.createElement('canvas');
    c.width = CELL_W * size; c.height = CELL_H * size;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const sheet = bakePlayerSheet({ kit, skin: SKINS[1], hair: HAIRS[0], style: 1 });
    ctx.save();
    ctx.scale(size, size);
    drawSprite(ctx, sheet, 4, POSE.RUN0, CELL_W / 2, CELL_H - 1);
    ctx.restore();
    return c;
  }

  popup({ title, node, html, buttons = [], dismissable = true }) {
    const root = $('modal-root');
    const card = h('div', { class: 'modal' });
    if (title) card.append(h('h2', null, title));
    if (html) card.append(h('div', { html }));
    if (node) card.append(node);
    const back = h('div', { class: 'modal-back' }, card);
    const close = () => back.remove();
    for (const b of buttons) {
      card.append(h('button', {
        class: 'btn ' + (b.cls || ''),
        onclick: () => { AUDIO.click(); if (b.keepOpen !== true) close(); if (b.cb) b.cb(); },
      }, b.label));
    }
    if (dismissable && buttons.length === 0) {
      back.addEventListener('click', (e) => { if (e.target === back) close(); });
    }
    root.append(back);
    return { close, card };
  }

  confirm(title, msg, yesLabel, cb, danger = true) {
    this.popup({
      title,
      html: `<p class="sub" style="margin-bottom:4px">${msg}</p>`,
      buttons: [
        { label: yesLabel, cls: danger ? 'danger' : '', cb },
        { label: 'Cancel', cls: 'ghost' },
      ],
    });
  }

  // ---------- HUD ----------
  hudShow(match) {
    $('hud').classList.remove('hidden');
    this._men = [-1, -1];
    this._hudTeams(match);
    this.hudTick(match);
  }
  hudHide() { $('hud').classList.add('hidden'); }
  // team names, with a man-count badge once someone has been sent off
  _hudTeams(match) {
    const t0 = match.teams[0], t1 = match.teams[1];
    const n0 = t0.players.length, n1 = t1.players.length;
    if (n0 === this._men[0] && n1 === this._men[1]) return;
    this._men = [n0, n1];
    const men = (n) => (n < 11 ? `<span class="men">${n}</span>` : '');
    $('sbHome').innerHTML = `<span class="kitdot" style="background:${t0.kit.shirt}"></span>${t0.def.short}${men(n0)}`;
    $('sbAway').innerHTML = `${men(n1)}${t1.def.short}<span class="kitdot" style="background:${t1.kit.shirt};margin:0 0 0 6px"></span>`;
  }
  hudTick(match) {
    $('sbScore').textContent = `${match.teams[0].score} : ${match.teams[1].score}`;
    const m = Math.floor(match.clockMin);
    $('sbClock').textContent = match.mode === 'practice' ? '∞' : (m < 10 ? '0' : '') + m + "'";
    this._hudTeams(match);
  }

  comment(str) {
    if (!str) return;
    const t = $('ticker');
    t.textContent = str;
    t.classList.add('show');
    clearTimeout(this.tickerTimer);
    this.tickerTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  matchEvent(type, data) {
    if (type === 'card') { this.comment(cardLine(data)); return; }
    const pool = COMMENT[type];
    if (pool && pool.length && (type === 'goal' || Math.random() < 0.7)) this.comment(pick(pool));
  }

  // ---------- MENU ----------
  showMenu() {
    this._show('menu', () => {
      const w = h('div', { class: 'wrap' });
      w.append(
        h('div', { class: 'spacer' }),
        h('div', { class: 'logo', html: 'Sunday<br><em>League</em>' }),
        h('div', { class: 'tagline' }, 'from the park to the world'),
        h('button', { class: 'btn gold', onclick: () => { AUDIO.click(); this.showCareer(); } }, '🏆 Career'),
        h('button', { class: 'btn', onclick: () => { AUDIO.click(); this.showQuick(); } }, '⚡ Quick Match'),
        h('button', { class: 'btn', onclick: () => { AUDIO.click(); this.showCup(); } }, '🌍 World Cup'),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn ghost', onclick: () => { AUDIO.click(); this.app.startShootout(); } }, '🥅 Penalties'),
          h('button', { class: 'btn ghost', onclick: () => { AUDIO.click(); this.app.startPractice(); } }, '🎯 Practice'),
        ),
        h('button', { class: 'btn ghost small', onclick: () => { AUDIO.click(); this.settingsModal(); } }, '⚙ Settings'),
        h('div', { class: 'spacer' }),
        h('div', { class: 'menu-foot' }, 'tap anywhere for sound • Y-R-U games'),
      );
      return w;
    });
  }

  // ---------- CAREER ----------
  showCareer() {
    const c = loadCareer();
    if (!c) this._show('career', () => this._creator());
    else this._show('career', () => this._hub(c));
  }

  _creator() {
    const w = h('div', { class: 'wrap' });
    let name = 'Sunday FC';
    let c1 = KIT_CHOICES[0], c2 = KIT_CHOICES[8];
    let badge = 0;

    const nameIn = h('input', {
      class: 'txt', value: name, maxlength: 16, placeholder: 'Team name',
      oninput: (e) => { name = e.target.value; },
    });
    const prevWrap = h('div', { class: 'preview-row' });
    const redraw = () => {
      prevWrap.innerHTML = '';
      const kit = { shirt: c1, sleeve: c2, shorts: c2, socks: c1 };
      prevWrap.append(this.playerPreview(kit, 3), this.badgeCanvas(badge, c1, c2, 62));
    };

    const swRow = (get, set) => {
      const row = h('div', { class: 'swatches' });
      for (const col of KIT_CHOICES) {
        const s = h('div', {
          class: 'swatch' + (get() === col ? ' sel' : ''), style: `background:${col}`,
          onclick: () => {
            set(col);
            row.querySelectorAll('.swatch').forEach(el => el.classList.remove('sel'));
            s.classList.add('sel');
            redraw();
          },
        });
        row.append(s);
      }
      return row;
    };

    const badgeRow = h('div', { class: 'badge-row' });
    const buildBadges = () => {
      badgeRow.innerHTML = '';
      for (let i = 0; i < 4; i++) {
        const o = h('div', {
          class: 'badge-opt' + (badge === i ? ' sel' : ''),
          onclick: () => { badge = i; buildBadges(); redraw(); },
        }, this.badgeCanvas(i, c1, c2, 42));
        badgeRow.append(o);
      }
    };
    buildBadges();
    redraw();

    w.append(
      h('h2', { class: 'title' }, 'Found your club'),
      h('div', { class: 'sub' }, `Start in the ${DIV_NAMES[4]} and climb to world glory`),
      h('div', { class: 'panel' },
        h('h3', null, 'Club name'), nameIn,
        h('h3', { style: 'margin-top:12px' }, 'Shirt colour'), swRow(() => c1, v => { c1 = v; buildBadges(); }),
        h('h3', { style: 'margin-top:12px' }, 'Trim & shorts'), swRow(() => c2, v => { c2 = v; buildBadges(); }),
        h('h3', { style: 'margin-top:12px' }, 'Badge'), badgeRow,
        h('h3', { style: 'margin-top:12px' }, 'Your look'), prevWrap,
      ),
      h('button', {
        class: 'btn gold', onclick: () => {
          const nm = (name || '').trim();
          if (nm.length < 2) { this.popup({ title: 'Name too short', html: '<p class="sub">Give your club a proper name!</p>', buttons: [{ label: 'OK' }] }); return; }
          AUDIO.click();
          const short = nm.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'MYT';
          const kit = { shirt: c1, sleeve: c2, shorts: c2, socks: c1 };
          newCareer(nm, short, kit, badge);
          this.showCareer();
        },
      }, '✔ Found the club'),
      h('button', { class: 'btn ghost small', onclick: () => this.showMenu() }, '← Back'),
    );
    return w;
  }

  _hub(c) {
    const w = h('div', { class: 'wrap' });
    const u = userTeam(c);
    const div = userDiv(c);
    const stars = clamp(Math.round((u.rating - 30) / 13), 1, 5);
    const cc = ccNextMatch(c);
    const fix = nextFixture(c);

    w.append(h('div', { class: 'panel' },
      h('div', { class: 'hub-head' },
        this.badgeCanvas(u.badge, u.kit.shirt, u.kit.sleeve, 52),
        h('div', null,
          h('div', { class: 'hub-name' }, u.name),
          h('div', { class: 'hub-meta' }, `${DIV_NAMES[div]} • Season ${c.season}`),
          h('div', { class: 'stars' }, '★'.repeat(stars) + '☆'.repeat(5 - stars)),
        ),
      ),
    ));

    if (cc) {
      const g = GIANTS[cc.gi];
      w.append(h('div', { class: 'panel' },
        h('h3', null, '🌍 World Champions Cup'),
        h('div', { class: 'fixture-card' },
          h('div', { class: 'sub' }, CC_STAGES[cc.stage]),
          h('div', { class: 'fixture-vs' },
            h('span', null, h('span', { class: 'kitdot', style: `background:${u.kit.shirt}` }), u.name),
            h('span', { class: 'at' }, 'vs'),
            h('span', null, h('span', { class: 'kitdot', style: `background:${g.kit.shirt}` }), g.name),
          ),
          h('button', { class: 'btn gold', onclick: () => { AUDIO.click(); this.app.startCCMatch(c); } }, '▶ Play Cup Tie'),
        ),
      ));
    } else if (fix) {
      const opp = c.teams[fix.oppIdx];
      const pitchType = this.app.forecastPitch(div);
      w.append(h('div', { class: 'panel' },
        h('h3', null, `Round ${c.round + 1} of 14`),
        h('div', { class: 'fixture-card' },
          h('div', { class: 'fixture-vs' },
            h('span', null, h('span', { class: 'kitdot', style: `background:${u.kit.shirt}` }), u.name),
            h('span', { class: 'at' }, fix.home ? 'HOME' : 'AWAY'),
            h('span', null, h('span', { class: 'kitdot', style: `background:${opp.kit.shirt}` }), opp.name),
          ),
          h('div', { class: 'pitch-tag' }, this.app.pitchLabel(pitchType)),
          h('div', { style: 'height:10px' }),
          h('button', { class: 'btn gold', onclick: () => { AUDIO.click(); this.app.startCareerMatch(c, fix, pitchType); } }, '▶ Play Match'),
        ),
      ));
    }

    w.append(
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn ghost small', onclick: () => this.tableModal(c) }, '📊 Table'),
        h('button', { class: 'btn ghost small', onclick: () => this.fixturesModal(c) }, '📅 Fixtures'),
        h('button', { class: 'btn ghost small', onclick: () => this.trophiesModal(c) }, '🏅 Trophies'),
      ),
      h('button', { class: 'btn ghost small', onclick: () => this.showMenu() }, '← Menu'),
      h('button', {
        class: 'btn danger small', onclick: () =>
          this.confirm('Abandon career?', `${u.name} will be deleted forever.`, 'Delete career', () => { deleteCareer(); this.showCareer(); }),
      }, '🗑 New Career'),
    );
    return w;
  }

  tableModal(c, div = userDiv(c)) {
    const rows = table(c, div);
    const tbl = h('table', { class: 'league' });
    tbl.append(h('tr', null,
      h('th', null, '#'), h('th', { class: 'tname' }, DIV_NAMES[div]),
      h('th', null, 'P'), h('th', null, 'GD'), h('th', null, 'Pts')));
    rows.forEach((r, i) => {
      const t = c.teams[r.ti];
      const cls = [
        r.ti === c.userIdx ? 'me' : '',
        (div > 1 && i < 2) || (div === 1 && i === 0) ? 'up' : '',
        div < 4 && i >= 6 ? 'down' : '',
      ].join(' ');
      tbl.append(h('tr', { class: cls },
        h('td', null, String(i + 1)),
        h('td', { class: 'tname' }, t.name),
        h('td', null, String(r.p)),
        h('td', null, String(r.gf - r.ga)),
        h('td', { class: 'pts' }, String(r.pts)),
      ));
    });
    this.popup({ title: 'League Table', node: tbl, buttons: [{ label: 'Close', cls: 'ghost' }] });
  }

  fixturesModal(c) {
    const div = userDiv(c);
    const roster = c.rosters[div];
    const uPos = roster.indexOf(c.userIdx);
    const wrap = h('div');
    for (let r = 0; r < 14; r++) {
      const rd = c.fixtures[div][r];
      let opp = null, home = false;
      for (const [hh, aa] of rd) {
        if (hh === uPos) { opp = roster[aa]; home = true; }
        if (aa === uPos) { opp = roster[hh]; home = false; }
      }
      if (opp === null) continue;
      const past = c.lastResults.find(x => x.season === c.season && x.round === r);
      wrap.append(h('div', { class: 'list-row' + (r === c.round ? ' me' : '') },
        h('span', null, `R${r + 1}  ${home ? 'vs' : 'at'} ${c.teams[opp].name}`),
        h('span', { class: 'dim' }, past ? `${past.ga} : ${past.gb}` : (r === c.round ? 'NEXT' : '·')),
      ));
    }
    this.popup({ title: 'Fixtures', node: wrap, buttons: [{ label: 'Close', cls: 'ghost' }] });
  }

  trophiesModal(c) {
    const wrap = h('div');
    if (!c.trophies.length) {
      wrap.append(h('p', { class: 'sub' }, 'No silverware yet — go win the park! 🥾'));
    } else {
      for (const t of [...c.trophies].reverse()) {
        wrap.append(h('div', { class: 'trophy-row' },
          h('span', { class: 'ico' }, t.icon),
          h('span', null,
            h('div', { class: 'lbl' }, t.label),
            h('div', { class: 'ssn' }, 'Season ' + t.season)),
        ));
      }
    }
    this.popup({ title: 'Trophy Cabinet', node: wrap, buttons: [{ label: 'Close', cls: 'ghost' }] });
  }

  // ---------- QUICK MATCH ----------
  showQuick() {
    this._show('pick', () => {
      const w = h('div', { class: 'wrap' });
      const groups = catalogue(loadCareer());
      const makeSelect = (defIdx) => {
        const sel = h('select', { class: 'sel-input' });
        let gi = 0;
        for (const g of groups) {
          const og = h('optgroup', { label: g.label });
          g.teams.forEach((t, i) => og.append(h('option', { value: gi + ':' + i }, `${t.name} (${Math.round(t.rating)})`)));
          sel.append(og);
          gi++;
        }
        sel.selectedIndex = defIdx;
        return sel;
      };
      const totalTeams = groups.reduce((n, g) => n + g.teams.length, 0);
      const selA = makeSelect(0);
      const selB = makeSelect(Math.min(2, totalTeams - 1));
      const lookup = (v) => {
        const [g, i] = v.split(':').map(Number);
        return groups[g].teams[i];
      };
      const pitchSel = h('select', { class: 'sel-input' },
        h('option', { value: 'random' }, '🎲 Random pitch'),
        h('option', { value: 'grass' }, '🌱 Lush Grass'),
        h('option', { value: 'wet' }, '🌧 Rain-Soaked'),
        h('option', { value: 'mud' }, '🟤 Mud Bath'),
        h('option', { value: 'ice' }, '❄️ Frozen Over'),
        h('option', { value: 'dry' }, '☀️ Sun-Baked'),
      );
      w.append(
        h('h2', { class: 'title' }, 'Quick Match'),
        h('div', { class: 'panel' },
          h('div', { class: 'field-label' }, 'Your team'), selA,
          h('div', { class: 'field-label', style: 'margin-top:10px' }, 'Opponent'), selB,
          h('div', { class: 'field-label', style: 'margin-top:10px' }, 'Pitch'), pitchSel,
        ),
        h('button', {
          class: 'btn gold', onclick: () => {
            AUDIO.click();
            const a = lookup(selA.value), b = lookup(selB.value);
            const pt = pitchSel.value === 'random' ? this.app.forecastPitch(3) : pitchSel.value;
            this.matchOptsModal('Match Settings', null, (o) => this.app.startQuick(a, b, pt, o));
          },
        }, '▶ Kick Off'),
        h('button', { class: 'btn ghost small', onclick: () => this.showMenu() }, '← Back'),
      );
      return w;
    });
  }

  // ---------- WORLD CUP ----------
  showCup() {
    this._show('cup', () => {
      const cup = this.app.cup;
      const w = h('div', { class: 'wrap' });
      if (!cup) {
        w.append(
          h('h2', { class: 'title' }, 'World Cup'),
          h('div', { class: 'sub' }, '16 nations. Knockout. Pick yours.'),
        );
        const grid = h('div', { class: 'swatches', style: 'gap:8px' });
        NATIONS.forEach((n, i) => {
          grid.append(h('button', {
            class: 'btn ghost small', style: `flex:0 0 47%; border-left:6px solid ${n.kit.shirt}`,
            onclick: () => {
              AUDIO.click();
              this.matchOptsModal('Tournament Settings', 'These apply to every match of the cup.', (o) => {
                this.app.newCup(i, o);
                this.showCup();
              });
            },
          }, n.name));
        });
        w.append(h('div', { class: 'panel' }, grid),
          h('button', { class: 'btn ghost small', onclick: () => this.showMenu() }, '← Back'));
        return w;
      }

      w.append(h('h2', { class: 'title' }, 'World Cup'));
      const panel = h('div', { class: 'panel' });
      for (let s = 0; s <= Math.min(cup.stage, 3); s++) {
        const round = cup.rounds[s];
        if (!round || round.length < 2) continue;
        const rp = h('div', { class: 'bracket-round' }, h('h4', null, WC_STAGES[s]));
        const results = cup.results[s] || [];
        for (let i = 0; i < round.length; i += 2) {
          const a = round[i], b = round[i + 1];
          const isMe = a === cup.userNi || b === cup.userNi;
          const res = results.find(r => (r.a === a && r.b === b) || (r.a === b && r.b === a));
          const winner = res ? res.winner : (cup.rounds[s + 1] || []).find(x => x === a || x === b);
          rp.append(h('div', { class: 'bk-match' + (isMe ? ' me' : '') },
            h('span', { class: winner === a ? 'win' : '' }, NATIONS[a].name),
            h('span', { class: 'dim' }, res ? `${res.ga}:${res.gb}` : (s === cup.stage && !cup.done ? 'vs' : '')),
            h('span', { class: winner === b ? 'win' : '' }, NATIONS[b].name),
          ));
        }
        panel.append(rp);
      }
      w.append(panel);

      if (cup.done) {
        const champ = cup.rounds[cup.stage] && cup.rounds[cup.stage].length === 1 ? cup.rounds[cup.stage][0] : null;
        w.append(h('div', { class: 'panel', style: 'text-align:center' },
          h('div', { style: 'font-size:34px' }, cup.won ? '🏆' : '😞'),
          h('div', { class: 'hub-name' }, cup.won ? 'WORLD CHAMPIONS!' : champ !== null ? `${NATIONS[champ].name} win the cup` : 'Knocked out!'),
        ));
        w.append(h('button', { class: 'btn gold', onclick: () => { this.app.cup = null; this.showCup(); } }, 'New Cup'));
      } else {
        const um = wcUserMatch(cup);
        if (um) {
          w.append(h('button', {
            class: 'btn gold',
            onclick: () => { AUDIO.click(); this.app.startWCMatch(cup, um); },
          }, `▶ Play ${WC_STAGES[um.stage]}`));
        }
      }
      w.append(h('button', { class: 'btn ghost small', onclick: () => this.showMenu() }, '← Menu'));
      return w;
    });
  }

  // ---------- SETTINGS ----------
  settingsModal(onClose) {
    const s = this.app.settings;
    const wrap = h('div');
    const seg = (key, opts, labels) => {
      const el = h('div', { class: 'seg' });
      opts.forEach((v, i) => {
        const b = h('button', { class: s[key] === v ? 'on' : '' }, labels ? labels[i] : String(v));
        b.addEventListener('click', () => {
          s[key] = v;
          el.querySelectorAll('button').forEach(x => x.classList.remove('on'));
          b.classList.add('on');
          this.app.applySettings();
          AUDIO.click();
        });
        el.append(b);
      });
      return el;
    };
    const row = (label, ctrl) => h('div', { class: 'set-row' }, h('span', { class: 'set-label' }, label), ctrl);
    wrap.append(
      row('Kick button', seg('side', ['left', 'right'], ['Left', 'Right'])),
      row('Joystick', seg('joyMode', ['float', 'fixed'], ['Float', 'Fixed'])),
      row('Half length', seg('halfLen', HALF_CHOICES, ['1m', '1½m', '2m', '3m', '4m'])),
      row('Difficulty', seg('difficulty', ['easy', 'normal', 'hard'], ['Easy', 'Norm', 'Hard'])),
      row('Camera', seg('zoom', ['near', 'normal', 'far'], ['Near', 'Mid', 'Far'])),
      row('Offside rule', seg('offside', [true, false], ['On', 'Off'])),
      row('Radar', seg('radar', [true, false], ['On', 'Off'])),
      row('Goal replays', seg('replays', [true, false], ['On', 'Off'])),
      row('Aftertouch', seg('aftertouch', [true, false], ['On', 'Off'])),
      row('Auto-switch', seg('autoSwitch', [true, false], ['On', 'Off'])),
      row('Vibration', seg('vibration', [true, false], ['On', 'Off'])),
      row('Sound', seg('sound', [true, false], ['On', 'Off'])),
    );
    this.popup({
      title: '⚙ Settings', node: wrap,
      buttons: [{ label: 'Done', cls: 'ghost', cb: onClose }],
    });
  }

  // pre-match panel: the three knobs worth asking about, pre-filled from settings.
  // whatever you pick also becomes your new default.
  matchOptsModal(title, note, onStart) {
    const s = this.app.settings;
    const opts = { halfLen: s.halfLen, difficulty: s.difficulty, replays: s.replays };
    const wrap = h('div');
    const seg = (key, values, labels) => {
      const el = h('div', { class: 'seg' });
      values.forEach((v, i) => {
        const b = h('button', { class: opts[key] === v ? 'on' : '' }, labels[i]);
        b.addEventListener('click', () => {
          opts[key] = v;
          el.querySelectorAll('button').forEach(x => x.classList.remove('on'));
          b.classList.add('on');
          AUDIO.click();
        });
        el.append(b);
      });
      return el;
    };
    const row = (label, ctrl) => h('div', { class: 'set-row' }, h('span', { class: 'set-label' }, label), ctrl);
    wrap.append(
      row('Half length', seg('halfLen', HALF_CHOICES, ['1m', '1½m', '2m', '3m', '4m'])),
      row('Difficulty', seg('difficulty', ['easy', 'normal', 'hard'], ['Easy', 'Norm', 'Hard'])),
      row('Goal replays', seg('replays', [true, false], ['On', 'Off'])),
    );
    if (note) wrap.append(h('p', { class: 'sub', style: 'margin-top:10px' }, note));
    this.popup({
      title, node: wrap,
      buttons: [
        {
          label: '▶ Kick Off', cls: 'gold', cb: () => {
            Object.assign(s, opts);          // remembered as the default next time
            this.app.applySettings();
            onStart(opts);
          },
        },
        { label: 'Back', cls: 'ghost' },
      ],
    });
  }

  // ---------- match popups ----------
  pauseModal(meta) {
    const isCareer = meta.kind === 'career' || meta.kind === 'careerCC';
    const { close } = this.popup({
      title: 'Paused',
      buttons: [
        { label: '▶ Resume', cb: () => this.app.resumeMatch() },
        { label: '⚙ Settings', cls: 'ghost', keepOpen: false, cb: () => this.settingsModal(() => this.pauseModal(meta)) },
        {
          label: isCareer ? 'Forfeit (0–3)' : 'Quit to menu', cls: 'danger',
          cb: () => {
            if (isCareer) this.confirm('Forfeit match?', 'It goes down as a 0–3 defeat.', 'Forfeit', () => this.app.quitMatch(true));
            else this.app.quitMatch(false);
          },
        },
      ],
      dismissable: false,
    });
    return close;
  }

  halfTimeModal(match) {
    const r = match.result();
    this.popup({
      title: 'Half Time',
      node: this._scorePanel(r, false),
      buttons: [{ label: '▶ Second Half', cb: () => this.app.secondHalf() }],
      dismissable: false,
    });
  }

  fullTimeModal(match, meta, onContinue) {
    const r = match.result();
    const btns = [];
    if (meta.kind === 'friendly' || meta.kind === 'shootout') {
      btns.push({ label: 'Continue', cls: 'gold', cb: onContinue });
      btns.push({ label: '↻ Rematch', cls: 'ghost', cb: () => this.app.rematch() });
    } else {
      btns.push({ label: 'Continue', cls: 'gold', cb: onContinue });
    }
    this.popup({ title: 'Full Time', node: this._scorePanel(r, true), buttons: btns, dismissable: false });
  }

  _scorePanel(r, withStats) {
    const wrap = h('div');
    wrap.append(
      h('div', { class: 'vs-names' },
        h('span', { style: 'text-align:right' }, r.nameA),
        h('span', { style: 'flex:0;color:#9db8a5' }, 'v'),
        h('span', null, r.nameB)),
      h('div', { class: 'big-score' }, `${r.a} : ${r.b}` + (r.pens ? `  (${r.pens[0]}–${r.pens[1]} pens)` : '')),
    );
    const sc = [];
    const maxLen = Math.max(r.scorersA.length, r.scorersB.length);
    for (let i = 0; i < maxLen; i++) {
      const a = r.scorersA[i] ? `⚽ ${r.scorersA[i].name} ${r.scorersA[i].min}'` : '';
      const b = r.scorersB[i] ? `${r.scorersB[i].name} ${r.scorersB[i].min}' ⚽` : '';
      sc.push(`<div style="display:flex;justify-content:space-between"><span>${a}</span><span>${b}</span></div>`);
    }
    if (sc.length) wrap.append(h('div', { class: 'scorer-list', html: sc.join('') }));
    if (withStats) {
      const g = h('div', { class: 'stat-grid', style: 'margin-top:8px' });
      const stat = (label, a, b) => {
        g.append(h('span', { class: 'l' }, String(a)), h('span', { class: 'm' }, label), h('span', { class: 'r' }, String(b)));
      };
      stat('Possession', r.statsA.possession + '%', r.statsB.possession + '%');
      stat('Shots', r.statsA.shots, r.statsB.shots);
      stat('On target', r.statsA.onTarget, r.statsB.onTarget);
      stat('Corners', r.statsA.corners, r.statsB.corners);
      stat('Fouls', r.statsA.fouls, r.statsB.fouls);
      const cards = (s) => (s.yellows || s.reds)
        ? `${s.yellows ? s.yellows + '🟨' : ''}${s.yellows && s.reds ? ' ' : ''}${s.reds ? s.reds + '🟥' : ''}` : '—';
      if (r.statsA.yellows + r.statsA.reds + r.statsB.yellows + r.statsB.reds > 0) {
        stat('Cards', cards(r.statsA), cards(r.statsB));
      }
      wrap.append(g);
    }
    return wrap;
  }

  seasonEndModal(events, cb) {
    let title = 'Season Over', body = `You finished ${events.userPos}${['st', 'nd', 'rd'][events.userPos - 1] || 'th'} in the ${DIV_NAMES[events.div]}.`, icon = '📋';
    if (events.champion) { title = 'CHAMPIONS!'; icon = '🏆'; body = `You've won the ${DIV_NAMES[1]} — and qualified for the World Champions Cup!`; }
    else if (events.promoted) { title = 'PROMOTED!'; icon = '🎉'; body = `${body} You're going up!`; }
    else if (events.relegated) { title = 'Relegated…'; icon = '📉'; body = `${body} Down you go.`; }
    this.popup({
      title,
      html: `<div style="text-align:center;font-size:44px">${icon}</div><p class="sub">${body}</p>`,
      buttons: [{ label: 'Continue', cls: 'gold', cb }],
      dismissable: false,
    });
  }
}

export const UI = new UISys();
