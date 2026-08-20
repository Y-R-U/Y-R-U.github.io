// §S2-I — the company screens. RENDERS ONLY: every decision is `js/company.js`'s and every credit
// that moves, moves through it. This file has no arithmetic of its own beyond laying numbers out.
//
// **It builds nothing new.** `CabinPanel` is the shell, and `screen()`, `readout()`, `meter()`,
// `el()` and `crd()` are S2-D's primitives, exported from `js/ui.js` for exactly this — its own
// header promised that "a company earnings screen in pass 2-B calls `screen(…)` and inherits the
// frame, the brackets and the ident". Aaron's complaint that produced S2-D was *"it looks fine if
// it was a web form"*; the way that complaint stays answered is by there being ONE idiom, not two.
//
// Three tabs, and each answers a different question:
//
//   ROSTER    who is flying, where, and is this one making or losing money RIGHT NOW
//   RECRUIT   who is available, what they cost, and what the hull adds to that
//   EARNINGS  the whole sum, written out — not a total
//
// The EARNINGS tab is the one Aaron's note is really about (*"earnings screens etc."*), and the
// rule it is built to is: **show the arithmetic, not just a total.** Every line that goes into the
// net is on the screen with its own sign, and the per-minute column beside it is what lets a player
// work out whether a hire is worth keeping without waiting an hour to find out.

import { CabinPanel, screen, readout, meter, el, crd, mmss } from './ui.js';
import * as C from './company.js';
import * as E from './economy.js';
import { SHADY_TIERS, shadyState } from './ranks.js';
import { CRAFT_SPEED } from './config.js';

// The cruise speed of a hull. Read off the same table `flight.js` flies, so a hull that is
// re-tuned cannot leave a stale number on a hire card. Declared HERE and not beside the method
// that uses it: this file has watched `main.js` die three times on a `const` in temporal dead
// zone, and a `const` read before its declaration THROWS rather than reading undefined.
const cruiseOf = id => CRAFT_SPEED[id] || CRAFT_SPEED.wisp;

const sign = n => (n > 0 ? `+${crd(n)}` : n < 0 ? `−${crd(-n)}` : '0');
const tone = n => (n > 0 ? 'good' : n < 0 ? 'bad' : '');

export class FleetPanel {
  // `hooks` is the whole coupling, in the shape every other surface in this game uses:
  //   state()            -> { econ, company, ledger, statuses, viewing, docked }
  //   hire(cand, craft)  -> { ok, why, ... }
  //   release(id)        -> { ok }
  //   refresh()          -> { ok, why, short }
  //   view(id | null)    -> the driver now being watched, or null
  constructor(host, hooks = {}) {
    this.hooks = hooks;
    this.panel = new CabinPanel(host, { kicker: 'COMPANY', title: 'FLEET', wide: true });
    // §S2-J. TWO axes of tab, because Aaron asked for two different things and collapsing them
    // would lose one: `branch` is *"a tab to switch between them"* (the legit haulage business and
    // the shady one), and `tab` is the section inside whichever branch is showing. They are stored
    // separately so switching branch and coming back does not dump the player on a different page.
    this.branch = 'legit';
    this.tab = 'roster';             // the LEGIT section
    this.stab = 'runs';              // the OFF BOOK section
    this.sel = null;                 // the candidate being considered
    this.hull = 'wisp';              // the hull that candidate would be leased
    this.note = '';
    this.founding = false;           // the FOUND screen is up over everything else
    this.nameDraft = '';
    this.opens = 0;
    this.actions = 0;
  }

  get open() { return this.panel.open; }

  // `tab` accepts either axis by NAME rather than a pair, because every caller in the game and
  // every gate says what it wants to see and not which of two dimensions it lives on. 'found' is a
  // third thing again: the registration screen, which is not a tab and sits over both branches.
  show(tab) {
    if (tab === 'found') { this.founding = true; }
    else if (tab === 'runs' || tab === 'exposure' || tab === 'ladder') { this.branch = 'shady'; this.stab = tab; this.founding = false; }
    else if (tab) { this.branch = 'legit'; this.tab = tab; this.founding = false; }
    this.note = '';
    this.opens++;
    this.panel.show();
    this.paint();
    return true;
  }

  hide() { return this.panel.hide(); }
  toggle(tab) { return this.panel.open ? this.hide() : this.show(tab); }

  // Repaint from live state without resetting the scroll — the roster's numbers move every second
  // and a panel that jumps to the top once a second is unusable.
  refreshLive() {
    if (!this.panel.open) return false;
    const top = this.panel.body.scrollTop;
    this.paint();
    this.panel.body.scrollTop = top;
    return true;
  }

  _act(fn, ...args) {
    this.actions++;
    const r = fn ? fn(...args) : null;
    if (r && r.note !== undefined) this.note = r.note;
    this.paint();
    return r;
  }

  paint() {
    const body = this.panel.body;
    body.innerHTML = '';
    const st = this.hooks.state ? this.hooks.state() : null;
    if (!st) return;
    const { econ, company } = st;
    const G = st.group || null;
    const GL = st.groupLedger || (G ? C.groupLedger(G, st.now || 0) : null);

    // ── the GROUP rail: ONE layout that lists n charters ─────────────────
    // Aaron: *"at some point it won't be just a single company - you may own multiple, so the
    // layout for all these things will have to look good."* A list of n chips does not have to be
    // redesigned when n changes and n screens do, so this is the whole of "multiple companies" as
    // far as the layout is concerned. It is present at n = 1 as well: a player who owns one charter
    // is looking at the same control they will use when they own three, which is what stops the
    // second one feeling like a different game.
    if (GL) body.appendChild(this._groupRail(GL, econ));

    // No charter at all: the FOUND screen IS the panel. There is nothing else to show and a set of
    // empty tabs above an empty roster would be a screen apologising for itself.
    if (!company || this.founding) {
      this._found(body, st, GL);
      if (this.note) body.appendChild(this._note());
      return;
    }

    const L = st.ledger || C.ledger(company, st.now || 0);
    const shadyOpen = L.shady.open;

    // ── the company rail ────────────────────────────────────────────────
    // The same shape as the dock's rank rail, and for the same reason: the two numbers that say
    // what you are allowed to do belong above the tabs, not behind one.
    const rail = el('div', 'fl-rail');
    const tierBox = el('div', 'fl-tier');
    tierBox.appendChild(el('span', 'flt-k', `COMPANY ${L.tier.tier}`));
    tierBox.appendChild(el('span', 'flt-n', L.tier.name));
    tierBox.appendChild(el('span', 'flt-s', L.next
      ? `${crd(L.next.need)} more fleet gross → ${L.next.name}` : 'top of the ladder'));
    tierBox.appendChild(meter(L.frac, 20, 'thin'));
    rail.appendChild(tierBox);
    const nums = el('div', 'fl-nums');
    nums.appendChild(readout('FLEET GROSS', crd(L.gross)));
    nums.appendChild(readout('NET', sign(L.net), tone(L.net)));
    nums.appendChild(readout('DRIVERS', `${L.count}/${L.cap}`));
    if (shadyOpen) nums.appendChild(readout('FILE', L.shady.band.name, `exposure h${L.shady.band.key}`));
    rail.appendChild(nums);
    body.appendChild(rail);

    // A suspended charter is the one state a player must not have to go looking for.
    if (L.shady.suspended) {
      const w = el('div', 'fl-susp');
      w.appendChild(el('span', 'fls-k', 'CHARTER SUSPENDED'));
      w.appendChild(el('span', 'fls-t',
        `${mmss(L.shady.suspendFor)} left. Nothing this charter delivers pays anything — and the `
        + `payroll is still running.`));
      body.appendChild(w);
    }

    // ── Aaron's branch tabs ──────────────────────────────────────────────
    // Only once the door is open. Before that there is no second side to switch to, and a greyed
    // tab labelled OFF BOOK would tell the player the story is coming, which is exactly what the
    // brief says not to do: *"a player who is not paying attention simply never notices."*
    if (shadyOpen) {
      const br = el('div', 'fl-branch');
      const mkb = (id, label, sub) => {
        const b = el('button', 'fl-br' + (this.branch === id ? ' on' : '') + (id === 'shady' ? ' dark' : ''));
        b.appendChild(el('span', 'fbr-l', label));
        b.appendChild(el('span', 'fbr-s', sub));
        b.addEventListener('click', () => { this.branch = id; this.note = ''; this.paint(); });
        br.appendChild(b);
      };
      mkb('legit', 'HAULAGE', `${L.count} on the books`);
      mkb('shady', 'OFF BOOK', L.shady.running || L.shady.playerOffBook
        ? `${L.shady.running + (L.shady.playerOffBook ? 1 : 0)} running` : 'nobody running');
      body.appendChild(br);
    }

    // ── the section tabs ────────────────────────────────────────────────
    // `.fl-tab`, deliberately NOT `.dk-tab`: gates_wire presses `.dk-tab` index 2 and gates_s2d B6
    // asserts RECORD is the last one. Both are contracts about that collection and this panel is
    // not a member of it.
    const tabs = el('div', 'fl-tabs');
    const cur = this.branch === 'shady' ? this.stab : this.tab;
    const mk = (id, label, sub) => {
      const b = el('button', 'fl-tab' + (cur === id ? ' on' : ''));
      b.appendChild(el('span', 'flt-l', label));
      if (sub !== undefined) b.appendChild(el('span', 'flt-c', String(sub)));
      b.addEventListener('click', () => {
        if (this.branch === 'shady') this.stab = id; else this.tab = id;
        this.note = ''; this.paint();
      });
      tabs.appendChild(b);
    };
    if (this.branch === 'shady') {
      mk('runs', 'RUNS', L.shady.running + (L.shady.playerOffBook ? 1 : 0));
      mk('exposure', 'EXPOSURE', `${Math.round(L.shady.exposure * 100)}%`);
      mk('ladder', 'THE ROOM');
    } else {
      mk('roster', 'ROSTER', `${L.count}/${L.cap}`);
      mk('recruit', 'RECRUIT', C.CANDIDATES);
      mk('earnings', 'EARNINGS');
    }
    body.appendChild(tabs);

    if (this.branch === 'shady') {
      if (this.stab === 'runs') this._runs(body, st, L);
      else if (this.stab === 'exposure') this._exposure(body, st, L);
      else this._shadyLadder(body, st, L, GL);
    } else if (this.tab === 'roster') this._roster(body, st, L);
    else if (this.tab === 'recruit') this._recruit(body, st, L);
    else this._earnings(body, st, L);

    if (this.note) body.appendChild(this._note());
    void econ;
  }

  _note() {
    const n = el('div', 'fl-note');
    n.appendChild(el('span', 'fln-mark', '!'));
    n.appendChild(el('span', null, this.note));
    return n;
  }

  // ── the group rail ────────────────────────────────────────────────────────
  // One chip per charter, plus the key that adds another. Each chip carries the two things that
  // decide whether you need to look at that charter today: what it is netting, and what is on its
  // file. A suspended charter says so on the chip, because a player with three registrations must
  // not have to open each one to find the dead one.
  _groupRail(GL, econ) {
    const rail = el('div', 'fl-group');
    const list = el('div', 'flg-list');
    for (const r of GL.rows) {
      const c = el('button', `flg-chip${r.active ? ' on' : ''}${r.suspended ? ' susp' : ''}`);
      c.appendChild(el('span', 'flgc-n', r.name));
      const sub = el('span', 'flgc-s');
      sub.appendChild(el('i', null, `T${r.tier.tier}`));
      sub.appendChild(el('i', null, `${r.count}/${r.cap}`));
      sub.appendChild(el('i', tone(r.net), sign(r.net)));
      c.appendChild(sub);
      // The file, as a pip rather than a number: on a chip the question is "is anything on it",
      // and the number is on the rail below the moment you select it.
      if (GL.open) {
        const pip = el('span', `flgc-file h${r.band.key}`);
        pip.appendChild(meter(r.exposure, 8, 'pip'));
        pip.appendChild(el('i', null, r.suspended ? `SUSPENDED ${mmss(r.suspendFor)}` : r.band.name));
        c.appendChild(pip);
      }
      c.addEventListener('click', () => this._act(this.hooks.pick, r.i));
      list.appendChild(c);
    }
    if (GL.count < GL.max) {
      const add = el('button', 'flg-chip add');
      add.appendChild(el('span', 'flgc-n', '+ NEW CHARTER'));
      const sub = el('span', 'flgc-s');
      sub.appendChild(el('i', null, `${crd(GL.fee)} CRD`));
      sub.appendChild(el('i', econ && econ.credits >= GL.fee ? '' : 'bad',
        econ && econ.credits >= GL.fee ? 'register' : `short ${crd(GL.fee - (econ ? econ.credits : 0))}`));
      add.appendChild(sub);
      add.addEventListener('click', () => { this.founding = true; this.note = ''; this.paint(); });
      list.appendChild(add);
    }
    rail.appendChild(list);
    if (GL.count > 1) {
      rail.appendChild(el('div', 'flg-tot',
        `${GL.count} charters · ${GL.live}/${GL.liveCap} hulls · ${crd(GL.gross)} CRD hauled between them`));
    }
    return rail;
  }

  // ── FOUND ─────────────────────────────────────────────────────────────────
  // Aaron: *"at some point you would need to start a company for your employees to work under."*
  // So this is a real act with a real price, and it is the only door into the rest of the panel —
  // there is no roster until there is something for a driver to be on the books OF.
  //
  // The name is OFFERED and not imposed, which is the same rule S2-E's intro applies to the
  // player's own name and the same markup: a field with the suggestion as its placeholder, and a
  // key that takes the suggestion. Never a prompt().
  _found(body, st, GL) {
    const { econ } = st;
    const first = !GL || GL.count === 0;
    const fee = GL ? GL.fee : C.FOUND.BASE;
    const suggestion = this.hooks.suggest ? this.hooks.suggest() : 'MERIDIAN HAULAGE';
    const afford = econ.credits >= fee;
    const full = GL && GL.count >= GL.max;

    const sc = screen('fl-sect found', first ? 'REGISTRY' : 'REGISTRY · ANOTHER',
      first ? 'FOUND A COMPANY' : 'A SECOND SET OF BOOKS',
      full ? `${GL.max} charters is the limit` : `${crd(fee)} CRD to register`);

    sc.body.appendChild(el('div', 'fl-hint', first
      ? 'Drivers cannot be on your books until there are books. A charter is a name, a registration '
        + 'and a ledger the city can read — and it is the thing that grows: every tier of it is '
        + 'another hull you are allowed to run.'
      : 'A second charter is a second ledger, a second driver cap that starts at one, and — the part '
        + 'that matters — a second file. Nothing that happens under this name appears under the '
        + 'other one.'));

    const row = el('div', 'fl-namerow');
    const input = el('input', 'fl-name');
    input.type = 'text';
    input.maxLength = 22;
    input.placeholder = suggestion;
    input.value = this.nameDraft;
    input.setAttribute('aria-label', 'company name');
    input.addEventListener('input', () => { this.nameDraft = input.value; });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') this._doFound(input.value || suggestion); });
    row.appendChild(input);
    const use = el('button', 'fl-suggest', 'SUGGEST');
    use.addEventListener('click', () => { input.value = suggestion; this.nameDraft = suggestion; this.paint(); });
    row.appendChild(use);
    sc.body.appendChild(row);

    const sum = el('div', 'flc-sum');
    sum.appendChild(readout('REGISTRATION', `−${crd(fee)}`, 'sub'));
    sum.appendChild(readout('OPENS AT', C.COMPANY_TIERS[0].name));
    sum.appendChild(readout('DRIVERS', `0/${C.COMPANY_TIERS[0].cap}`));
    sum.appendChild(readout('IN HAND', crd(econ.credits), afford ? '' : 'bad'));
    sc.body.appendChild(sum);

    const keys = el('div', 'flc-keys');
    const go = el('button', 'flc-key take');
    go.textContent = `REGISTER · ${crd(fee)} CRD`;
    go.disabled = !afford || full;
    go.addEventListener('click', () => this._doFound(input.value || suggestion));
    keys.appendChild(go);
    keys.appendChild(el('span', 'flc-why', full ? `${GL.max} is the limit`
      : !afford ? `short ${crd(fee - econ.credits)} CRD`
        : 'the fee is sunk; the name is not changeable afterwards'));
    if (GL && GL.count > 0) {
      const back = el('button', 'flc-key back', 'NOT NOW');
      back.addEventListener('click', () => { this.founding = false; this.note = ''; this.paint(); });
      keys.appendChild(back);
    }
    sc.body.appendChild(keys);

    // What each tier of a charter buys, on the screen where the player is deciding to buy one.
    const lad = el('div', 'fl-ladder small');
    for (const t of C.COMPANY_TIERS) {
      const d = el('div', 'fl-rung');
      d.appendChild(el('span', 'flr-i', String(t.tier).padStart(2, '0')));
      const tx = el('span', 'flr-tx');
      tx.appendChild(el('span', 'flr-name', t.name));
      tx.appendChild(el('span', 'flr-blurb', `${t.cap} driver${t.cap === 1 ? '' : 's'} — ${t.blurb}`));
      d.appendChild(tx);
      d.appendChild(el('span', 'flr-at', crd(t.gross)));
      lad.appendChild(d);
    }
    sc.body.appendChild(lad);
    body.appendChild(sc);
  }

  _doFound(name) {
    const r = this._act(this.hooks.found, String(name || '').trim());
    if (r && r.ok) { this.founding = false; this.nameDraft = ''; this.branch = 'legit'; this.tab = 'recruit'; this.paint(); }
    return r;
  }

  // ── ROSTER ────────────────────────────────────────────────────────────────
  _roster(body, st, L) {
    const sc = screen('fl-sect', 'ROSTER', 'WHO IS FLYING',
      `${L.count} of ${L.cap} · ${crd(L.wagePerMin)} CRD/min payroll`);
    if (!L.drivers.length) {
      sc.body.appendChild(el('div', 'fl-empty',
        'Nobody on the books. RECRUIT hires a driver; they fly their own jobs and the money lands '
        + 'in your account. So does the wage bill, every second, whether they are earning or not.'));
      body.appendChild(sc);
      return;
    }
    for (const d of L.drivers) {
      const live = (st.statuses || {})[d.id] || null;
      const row = el('div', `fl-drv${st.viewing === d.id ? ' watching' : ''}`);

      const head = el('div', 'fld-head');
      head.appendChild(el('span', 'fld-name', d.name));
      head.appendChild(el('span', `fld-grade g${d.grade}`, d.gradeName));
      head.appendChild(el('span', 'fld-hull', `${d.craft.toUpperCase()} · ${d.cruise} m/s`));
      // §S2-J. A driver on runs is doing something the ROSTER's own arithmetic does not explain —
      // their gross is high and none of it is on the charter — so the roster says so rather than
      // leaving the OFF BOOK tab as the only place that knows.
      if (d.offBook) head.appendChild(el('span', 'fld-off', 'OFF BOOK'));
      row.appendChild(head);

      // What they are doing, off the LIVE flight model rather than a mirrored field.
      const line = live
        ? (live.towing ? `CELL FLAT — limping to a charge pad`
          : live.state === 'dock' ? `on the deck at ${live.pad || 'a pad'} · ${live.held} in the hold`
            : live.dest ? `${live.leg} → ${live.dest} · ${crd(live.dist)} m · ${live.held} held`
              : live.pad ? `${live.leg} → ${live.pad} · ${crd(live.dist)} m · empty hold`
                : 'looking for work')
        : 'standing by';
      row.appendChild(el('div', 'fld-status', line));
      if (live) {
        const g = el('div', 'fld-gauges');
        g.appendChild(this._gauge('CELL', `${Math.round(live.cell * 100)}%`, live.cell,
          live.cell < 0.2 ? 'bad' : live.cell < 0.4 ? 'warn' : ''));
        g.appendChild(this._gauge('HOLD', `${live.held}/${live.slots}`,
          live.slots ? live.held / live.slots : 0, ''));
        g.appendChild(this._gauge('LICENCE', `T${live.tier}`, live.tier / 6, ''));
        row.appendChild(g);
      }

      // The arithmetic, per minute, with its sign. This is the number that decides whether the
      // hire was a mistake and it is deliberately larger than the totals beside it.
      const sum = el('div', 'fld-sum');
      sum.appendChild(readout('GROSS/MIN', crd(d.grossPerMin)));
      sum.appendChild(readout('WAGE/MIN', `−${crd(d.wagePerMin)}`, 'sub'));
      // `−0` is not a number a player should ever be shown. A driver that has not bought charge
      // yet has spent nothing, and printing a signed zero reads as a rounding artefact.
      sum.appendChild(readout('FUEL/MIN', d.fuelPerMin ? `−${crd(d.fuelPerMin)}` : '0', 'sub'));
      sum.appendChild(readout('NET/MIN', sign(d.netPerMin), `big ${tone(d.netPerMin)}`));
      row.appendChild(sum);

      const tot = el('div', 'fld-tot');
      tot.appendChild(el('span', null, `${mmss(d.minutes * 60)} on the books`));
      tot.appendChild(el('span', null, `${d.jobs} delivered`));
      tot.appendChild(el('span', null, `${sign(d.net)} CRD lifetime`));
      if (d.arrears > 0) tot.appendChild(el('span', 'bad', `${crd(d.arrears)} OWED`));
      row.appendChild(tot);

      if (d.arrears > 0) {
        row.appendChild(el('div', 'fld-warn',
          `Unpaid. At ${crd(C.arrearsLimit({ grade: d.grade, craft: d.craft }, st.company))} owed they walk.`));
      }

      const keys = el('div', 'fld-keys');
      // Aaron's *"switch to their vehicle views"*. The feed is only offered from a pad, because
      // watching a driver moves the camera — and the whole city — kilometres away from the
      // player's own hull. Docked, that costs nothing; airborne, it would be flying blind.
      const vw = el('button', 'fld-key view' + (st.viewing === d.id ? ' on' : ''));
      vw.textContent = st.viewing === d.id ? 'LEAVE FEED' : 'VIEW CRAFT';
      vw.disabled = !st.docked && st.viewing !== d.id;
      vw.addEventListener('click', () => {
        this._act(this.hooks.view, st.viewing === d.id ? null : d.id);
        if (st.viewing !== d.id) this.hide();
      });
      keys.appendChild(vw);
      const rel = el('button', 'fld-key drop', 'RELEASE');
      rel.addEventListener('click', () => this._act(this.hooks.release, d.id));
      keys.appendChild(rel);
      row.appendChild(keys);
      if (!st.docked && st.viewing !== d.id) {
        row.appendChild(el('div', 'fld-why', 'dock to watch a driver’s craft'));
      }
      sc.body.appendChild(row);
    }
    body.appendChild(sc);
  }

  _gauge(label, value, frac, t) {
    const g = el('div', `fl-gauge${t ? ' ' + t : ''}`);
    g.appendChild(el('i', null, label));
    g.appendChild(meter(frac, 10));
    g.appendChild(el('b', null, value));
    return g;
  }

  // ═══ §S2-J — THE OFF-BOOK BRANCH ══════════════════════════════════════════
  //
  // Three screens, and each answers the question the one before it raises:
  //
  //   RUNS      who is running, and the switch that puts them there
  //   EXPOSURE  what it has cost — every term, the same rule the EARNINGS tab is built to
  //   THE ROOM  the SMOKE → THE HOUSE ladder, on a ledger nobody else can see
  //
  // The design rule this branch is built against is the brief's: **a dodgy trade must be a real
  // trade-off, not a better payout.** So the panel never says "this pays more" without the four
  // things it costs on the same screen, and the one number that decides it — the EDGE — is printed
  // as a live quantity that moves against you as the file thickens.

  // ── RUNS ──────────────────────────────────────────────────────────────────
  _runs(body, st, L) {
    const S = L.shady;
    const sc = screen('fl-sect dark', 'OFF BOOK', 'THE RUNS',
      S.suspended ? `SUSPENDED — ${mmss(S.suspendFor)}` : `${S.jobs} run${S.jobs === 1 ? '' : 's'} · ${S.busts} seized`);

    // The gauge, and beside it what the gauge is currently costing. A exposure bar on its own is a mood;
    // the three multipliers underneath it are the trade-off.
    const g = el('div', `fl-file h${S.band.key}`);   // the on-screen name for it is THE FILE
    const head = el('div', 'fh-head');
    head.appendChild(el('span', 'fh-k', 'THE FILE'));
    head.appendChild(el('span', 'fh-b', S.band.name));
    head.appendChild(el('span', 'fh-n', `${Math.round(S.exposure * 100)}%`));
    g.appendChild(head);
    g.appendChild(meter(S.exposure, 24, 'exposure'));
    g.appendChild(el('div', 'fh-note', S.band.note));
    const costs = el('div', 'fh-costs');
    costs.appendChild(readout('A RUN PAYS', `${C.EXPOSURE.PAY.toFixed(2)}×`, 'good'));
    costs.appendChild(readout('LEGIT PAYS', `${S.legitMul.toFixed(2)}×`, S.legitMul < 1 ? 'bad' : ''));
    costs.appendChild(readout('PAYROLL', `${S.wageMul.toFixed(2)}×`, S.wageMul > 1 ? 'bad' : ''));
    costs.appendChild(readout('SEIZED', `${Math.round(S.bust * 100)}%`, S.bust > 0.15 ? 'bad' : ''));
    g.appendChild(costs);
    // The EDGE. What a run is worth against what the same parcel is worth on the books RIGHT NOW,
    // after the seizure risk. It is the whole decision in one number and it goes below 1 on its own
    // as the file thickens — which is the panel telling the player to stop without a warning box.
    g.appendChild(el('div', `fh-edge ${S.edge > 1.15 ? 'good' : S.edge > 1 ? '' : 'bad'}`,
      S.edge > 1
        ? `A run is worth ${S.edge.toFixed(2)}× the same parcel on the books, after the seizure risk.`
        : `A run is worth ${S.edge.toFixed(2)}× the same parcel on the books. It is not worth taking.`));
    g.appendChild(el('div', 'fh-fine',
      `A seizure pays nothing and fines you ${C.EXPOSURE.FINE_MULT.toFixed(1)}× the load. At 100 % the `
      + `charter is suspended for ${Math.round(C.EXPOSURE.SUSPEND_S / 60)} minutes and earns nothing at `
      + `all — the wages do not stop. The file cools on its own; nothing else clears it.`));
    sc.body.appendChild(g);

    // The player's own switch. The branch is a business and not a driver perk, and a player who
    // reaches act two with nothing to hire anybody with must still be able to take a dodgy trade —
    // otherwise the whole side of the game is gated behind the other one.
    const me = el('div', `fl-run me${S.playerOffBook ? ' on' : ''}`);
    const mh = el('div', 'fr-head');
    mh.appendChild(el('span', 'fr-nm', 'YOUR OWN DELIVERIES'));
    mh.appendChild(el('span', 'fr-gr', S.playerOffBook ? 'RUNNING' : 'ON THE BOOKS'));
    me.appendChild(mh);
    me.appendChild(el('div', 'fr-blurb', S.playerOffBook
      ? 'What you deliver is settled at the desk, not at the pad. If a run is seized you lose the '
        + 'load and pay the fine out of your own account.'
      : 'Everything you fly is on the manifest. Turn this on and the desk pays the difference.'));
    const mk = el('button', 'fld-key' + (S.playerOffBook ? ' on' : ''));
    mk.textContent = S.playerOffBook ? 'BACK ON THE BOOKS' : 'RUN OFF THE BOOKS';
    mk.disabled = S.suspended;
    mk.addEventListener('click', () => this._act(this.hooks.playerOffBook, !S.playerOffBook));
    me.appendChild(mk);
    sc.body.appendChild(me);

    if (!L.drivers.length) {
      sc.body.appendChild(el('div', 'fl-empty',
        'No drivers on this charter. A run is a delivery, so somebody has to fly it — you, or '
        + 'somebody on the books.'));
    }
    for (const d of L.drivers) {
      const row = el('div', `fl-run${d.offBook ? ' on' : ''}`);
      const h = el('div', 'fr-head');
      h.appendChild(el('span', 'fr-nm', d.name));
      h.appendChild(el('span', `fld-grade g${d.grade}`, d.gradeName));
      h.appendChild(el('span', 'fr-gr', d.offBook ? 'RUNNING' : 'ON THE BOOKS'));
      row.appendChild(h);
      const sum = el('div', 'fld-sum');
      sum.appendChild(readout('OFF-BOOK GROSS', crd(d.shadyGross)));
      sum.appendChild(readout('RUNS', String(d.shadyJobs)));
      sum.appendChild(readout('SEIZED', String(d.busts), d.busts ? 'bad' : ''));
      sum.appendChild(readout('NET/MIN', sign(d.netPerMin), `big ${tone(d.netPerMin)}`));
      row.appendChild(sum);
      const k = el('button', 'fld-key' + (d.offBook ? ' on' : ''));
      k.textContent = d.offBook ? 'PUT BACK ON THE BOOKS' : 'PUT ON RUNS';
      k.disabled = S.suspended;
      k.addEventListener('click', () => this._act(this.hooks.offBook, d.id, !d.offBook));
      row.appendChild(k);
      sc.body.appendChild(row);
    }
    body.appendChild(sc);
  }

  // ── EXPOSURE ──────────────────────────────────────────────────────────────
  // The same rule as the EARNINGS tab — show the arithmetic, not a total — applied to the side of
  // the business that would most like to show a total. Every line here is a consequence, including
  // the one a player would never otherwise see: `LEGIT PAY LOST`, which is the money the charter's
  // ORDINARY deliveries did not pay because of the file. A cost the player cannot see is not a
  // trade-off, it is a tax.
  _exposure(body, st, L) {
    const S = L.shady;
    const mins = Math.max(1 / 60, L.minutes);
    const sc = screen('fl-sect dark', 'OFF BOOK', 'EXPOSURE',
      `${S.jobs} runs · ${S.busts} seized · ${S.suspensions} suspension${S.suspensions === 1 ? '' : 's'}`);

    const rows = [
      ['RUN GROSS', S.gross, 'what the desk paid, in full', 'in'],
      ['OF WHICH BONUS', S.bonus, `the ${C.EXPOSURE.PAY.toFixed(2)}× over the on-book rate`, 'note'],
      ['FINES', -S.fines, `${C.EXPOSURE.FINE_MULT.toFixed(1)}× the load, ${S.busts} time${S.busts === 1 ? '' : 's'}`, 'out'],
      ['LEGIT PAY LOST', -S.lostLegit, 'what your ordinary deliveries stopped paying', 'out'],
    ];
    const sheet = el('div', 'fl-books');
    for (const [k, v, why, kind] of rows) {
      if (kind !== 'in' && v === 0) continue;
      const r = el('div', `flb-row ${kind}`);
      r.appendChild(el('span', 'flb-k', k));
      r.appendChild(el('span', 'flb-why', why));
      r.appendChild(el('span', `flb-v ${kind === 'note' ? '' : tone(v)}`, sign(v)));
      r.appendChild(el('span', 'flb-min', `${sign(Math.round(v / mins))}/min`));
      sheet.appendChild(r);
    }
    const net = el('div', 'flb-row net');
    const bal = S.gross - S.fines - S.lostLegit;
    net.appendChild(el('span', 'flb-k', 'THE OTHER SIDE'));
    net.appendChild(el('span', 'flb-why', bal >= 0
      ? 'ahead of where the books would have left you' : 'behind where the books would have left you'));
    net.appendChild(el('span', `flb-v ${tone(bal)}`, sign(bal)));
    net.appendChild(el('span', 'flb-min', `${sign(Math.round(bal / mins))}/min`));
    sheet.appendChild(net);
    sc.body.appendChild(sheet);

    // The one line that says what it cost on the OTHER ladder. It is not a credit figure and it
    // does not belong in the sum above, which is exactly why it is printed on its own: a run does
    // not move `FLEET GROSS`, and `FLEET GROSS` is what buys the next hull.
    sc.body.appendChild(el('div', 'fl-arrears',
      `None of ${crd(S.gross)} CRD of run money counts on the charter. FLEET GROSS is ${crd(L.gross)} `
      + `and that is the only number the ${L.next ? L.next.name : 'top'} tier reads — so every run is `
      + `a hull you are not buying yet, and the two reserved licence rungs sit on the same ledger.`));

    const g = el('div', 'fh-costs wide');
    g.appendChild(readout('FILE NOW', `${Math.round(S.exposure * 100)}%`, `h${S.band.key}`));
    g.appendChild(readout('WORST IT HAS BEEN', `${Math.round(S.peak * 100)}%`));
    g.appendChild(readout('SEIZURE RISK', `${Math.round(S.bust * 100)}%`, S.bust > 0.15 ? 'bad' : ''));
    g.appendChild(readout('EDGE', `${S.edge.toFixed(2)}×`, S.edge > 1 ? 'good' : 'bad'));
    sc.body.appendChild(g);
    sc.body.appendChild(el('div', 'fl-hint',
      `The file cools on its own — about half of it every ${Math.round(C.EXPOSURE.DECAY_S * 0.69 / 60)} `
      + `minutes with nobody running. It is the only thing that clears it, and a charter that has `
      + `once been read stays on the record whatever the gauge says afterwards.`));
    body.appendChild(sc);
  }

  // ── THE ROOM — the shady ladder ───────────────────────────────────────────
  // Aaron's names, verbatim and in order. Its axis is OFF-BOOK GROSS ACROSS EVERY CHARTER, because
  // the contact is a relationship with the person: running the work through a shell keeps the file
  // off your legit registration, and it does not make you a stranger to the people paying you.
  _shadyLadder(body, st, L, GL) {
    const total = GL ? GL.shadyGross : L.shady.gross;
    const R = shadyState(total, true);
    const sc = screen('fl-sect dark lad', 'THE ROOM', R.name,
      `RUNG ${R.rung} OF ${SHADY_TIERS.length} · ${crd(R.at)} CRD OFF THE BOOKS`);
    const list = el('div', 'fl-ladder');
    for (const t of SHADY_TIERS) {
      const here = t.rung === R.rung;
      const done = R.at >= t.at;
      const d = el('div', `fl-rung${here ? ' here' : ''}${done && !here ? ' done' : ''}`);
      d.appendChild(el('span', 'flr-i', String(t.rung).padStart(2, '0')));
      const tx = el('span', 'flr-tx');
      tx.appendChild(el('span', 'flr-name', t.name));
      tx.appendChild(el('span', 'flr-blurb', t.blurb));
      d.appendChild(tx);
      d.appendChild(el('span', 'flr-at', crd(t.at)));
      if (here) d.appendChild(meter(R.frac, 20, 'thin here'));
      list.appendChild(d);
    }
    sc.body.appendChild(list);
    sc.body.appendChild(el('div', 'fl-ladnote', R.next
      ? `${crd(R.next.need)} CRD of run money to ${R.next.name}. It counts across every charter you `
        + `hold — the desk knows who you are, whatever is printed on the manifest.`
      : 'The room takes its cut before anyone is paid. There is nothing above this.'));
    if (GL && GL.count > 1) {
      const tbl = el('div', 'fl-table');
      const h = el('div', 'flt-row head');
      for (const c of ['CHARTER', 'FILE', 'RUN GROSS']) h.appendChild(el('span', null, c));
      tbl.appendChild(h);
      for (const r of GL.rows) {
        const tr = el('div', 'flt-row');
        tr.appendChild(el('span', 'flt-nm', r.name));
        tr.appendChild(el('span', `h${r.band.key}`, r.band.name));
        tr.appendChild(el('span', null, crd(r.shadyGross)));
        tbl.appendChild(tr);
      }
      sc.body.appendChild(tbl);
    }
    body.appendChild(sc);
  }

  // ── RECRUIT ───────────────────────────────────────────────────────────────
  _recruit(body, st, L) {
    const { econ, company } = st;
    const full = L.count >= L.cap;

    const sc = screen('fl-sect', 'RECRUIT', 'THE AGENCY LIST',
      full ? `FULL — ${L.cap} is all a ${L.tier.name} may run` : `${L.cap - L.count} berth${L.cap - L.count === 1 ? '' : 's'} free`);

    // The hull first, because it is the half of the decision the player controls and the half that
    // decides whether the hire earns. Cruise speed and lease are FACTS printed side by side; there
    // is deliberately no "recommended" flag, because the sum is the game.
    const hulls = el('div', 'fl-hulls');
    hulls.appendChild(el('span', 'fh-k', 'LEASE A HULL'));
    for (const id of Object.keys(E.CRAFT)) {
      const licensed = E.unlockedCraft(econ.tier).includes(id);
      const lease = C.leasePerMin(id);
      const b = el('button', 'flh' + (this.hull === id ? ' on' : '') + (licensed ? '' : ' no'));
      b.appendChild(el('b', null, id.toUpperCase()));
      b.appendChild(el('i', null, `${E.CRAFT[id].slots} slot · ${cruiseOf(id)} m/s`));
      b.appendChild(el('u', null, `−${crd(lease)}/min`));
      b.disabled = !licensed;
      b.title = licensed ? '' : 'licence too low';
      b.addEventListener('click', () => { this.hull = id; this.paint(); });
      hulls.appendChild(b);
    }
    sc.body.appendChild(hulls);
    sc.body.appendChild(el('div', 'fl-hint',
      'A faster hull delivers more. A dearer hull costs more to lease every minute it is in the '
      + 'air, earning or not. Those two are not the same list.'));

    for (const cand of C.candidates(company)) {
      const g = C.gradeOf(cand.grade);
      const wage = C.wageOf({ grade: cand.grade, craft: this.hull });
      const fee = C.signingFee(cand.grade, this.hull);
      const rated = C.RATED_GROSS[cand.grade];
      const afford = econ.credits >= fee;
      const row = el('div', 'fl-cand' + (this.sel === cand.id ? ' on' : ''));

      const head = el('div', 'flc-head');
      head.appendChild(el('span', 'flc-name', cand.name));
      head.appendChild(el('span', `flc-grade g${cand.grade}`, g.name));
      head.appendChild(el('span', 'flc-blurb', g.blurb));
      row.appendChild(head);

      // The sum, laid out so it reads left to right as a subtraction. `RATED` is what this grade
      // was MEASURED to gross in a `wisp` over six worlds — it is a fact about the game printed so
      // the player can do the arithmetic, not a promise about this hire.
      const sum = el('div', 'flc-sum');
      sum.appendChild(readout('RATED GROSS', `${crd(rated)}/min`));
      sum.appendChild(readout('DRIVER', `−${crd(wage.base)}`, 'sub'));
      sum.appendChild(readout('LEASE', `−${crd(wage.lease)}`, 'sub'));
      sum.appendChild(readout('WAGE/MIN', `−${crd(wage.total)}`, 'big'));
      row.appendChild(sum);
      // The caveat only makes sense when the hull is NOT the one the rating was measured in.
      // "Rated in a WISP. A WISP will not earn the same" is a sentence that argues with itself.
      row.appendChild(el('div', 'flc-fine', this.hull === 'wisp'
        ? `Rated in a WISP over six worlds, which is the hull selected — so this is the figure, not `
          + `an analogy. What it cannot know is which jobs this driver draws.`
        : `Rated in a WISP at ${cruiseOf('wisp')} m/s. A ${this.hull.toUpperCase()} at `
          + `${cruiseOf(this.hull)} m/s will not earn the same — that is what you are betting on.`));

      const keys = el('div', 'flc-keys');
      const hire = el('button', 'flc-key take');
      hire.textContent = `HIRE · ${crd(fee)} CRD SIGNING`;
      hire.disabled = full || !afford || !E.unlockedCraft(econ.tier).includes(this.hull);
      hire.addEventListener('click', () => { this.sel = cand.id; this._act(this.hooks.hire, cand, this.hull); });
      keys.appendChild(hire);
      keys.appendChild(el('span', 'flc-why', full ? `no berth at ${L.tier.name}`
        : !afford ? `short ${crd(fee - econ.credits)} CRD`
          : `${C.SIGNING_MINUTES} minutes of wage, up front and non-refundable`));
      row.appendChild(keys);
      sc.body.appendChild(row);
    }

    const foot = el('div', 'fl-foot');
    const ref = el('button', 'fl-refresh', `NEW LIST · ${crd(C.REFRESH_FEE)} CRD`);
    ref.disabled = econ.credits < C.REFRESH_FEE;
    ref.addEventListener('click', () => this._act(this.hooks.refresh));
    foot.appendChild(ref);
    foot.appendChild(el('span', 'fl-footnote',
      'The list is fixed until you pay to change it. Closing this panel does not re-roll it.'));
    sc.body.appendChild(foot);
    body.appendChild(sc);
  }

  // ── EARNINGS ──────────────────────────────────────────────────────────────
  // "Show the arithmetic, not just a total." Every term with its own sign, a per-minute column
  // beside it, and the rule underneath.
  _earnings(body, st, L) {
    const sc = screen('fl-sect', 'EARNINGS', 'THE BOOKS',
      `${mmss(L.minutes * 60)} of trading · ${L.jobs} deliveries`);

    const mins = Math.max(1 / 60, L.minutes);
    // §S2-J adds three terms and they are ordinary rows, not a second sheet: run money is money the
    // company took and fines and the registration fee are money it paid. `gates_s2i` E1 parses these
    // out of the DOM and asserts they sum to the NET the screen prints, so a term that existed in
    // the ledger and not here would fail that check rather than quietly rounding away.
    const rows = [
      ['FLEET GROSS', L.gross, 'what your drivers delivered, on the books', 'in'],
      ['RUN GROSS', L.shady.gross, 'settled at the desk — none of it counts on the charter', 'in'],
      ['DRIVER WAGES', -L.wagesBase, 'paid every second, earning or not', 'out'],
      ['HULL LEASES', -L.wagesLease, `${C.LEASE_FRAC * 100} % of the retail hire rate`, 'out'],
      ['CHARGE', -L.fuel, 'their cells, on your account', 'out'],
      ['SIGNING FEES', -L.signing, `${C.SIGNING_MINUTES} minutes of wage per hire, sunk`, 'out'],
      ['AGENCY', -L.refresh, 'new candidate lists', 'out'],
      ['FINES', -L.shady.fines, `${L.shady.busts} load${L.shady.busts === 1 ? '' : 's'} seized at a pad`, 'out'],
      ['REGISTRATION', -L.fee, 'what this charter cost to found', 'out'],
    ];
    const sheet = el('div', 'fl-books');
    for (const [k, v, why, kind] of rows) {
      // A zero row is dropped — EXCEPT `FLEET GROSS`, which is the top line and whose absence would
      // read as a bug. `RUN GROSS` at zero is dropped too, which is what keeps the EARNINGS tab
      // identical to its S2-I self on a charter that has never run anything.
      if (v === 0 && k !== 'FLEET GROSS') continue;
      const r = el('div', `flb-row ${kind}`);
      r.appendChild(el('span', 'flb-k', k));
      r.appendChild(el('span', 'flb-why', why));
      r.appendChild(el('span', `flb-v ${tone(v)}`, sign(v)));
      r.appendChild(el('span', 'flb-min', `${sign(Math.round(v / mins))}/min`));
      sheet.appendChild(r);
    }
    const net = el('div', 'flb-row net');
    net.appendChild(el('span', 'flb-k', 'NET'));
    net.appendChild(el('span', 'flb-why', L.net >= 0
      ? 'the company is paying for itself' : 'the payroll is bigger than the work'));
    net.appendChild(el('span', `flb-v ${tone(L.net)}`, sign(L.net)));
    net.appendChild(el('span', 'flb-min', `${sign(L.netPerMin)}/min`));
    sheet.appendChild(net);
    sc.body.appendChild(sheet);

    if (L.arrears > 0) {
      sc.body.appendChild(el('div', 'fl-arrears',
        `${crd(L.arrears)} CRD of wages unpaid. Wages do not stop when the account is empty — they `
        + `accrue, and a driver owed ${C.ARREARS_MINUTES} minutes of their own wage walks out.`));
    }
    if (L.quits || L.released) {
      sc.body.appendChild(el('div', 'fl-hint',
        `${L.quits} walked out over unpaid wages · ${L.released} let go. Signing fees do not come back.`));
    }

    // Per driver, so a fleet of four can be read one row at a time.
    if (L.drivers.length) {
      const tbl = el('div', 'fl-table');
      const h = el('div', 'flt-row head');
      for (const c of ['DRIVER', 'HULL', 'JOBS', 'GROSS', 'WAGE', 'NET']) h.appendChild(el('span', null, c));
      tbl.appendChild(h);
      for (const d of L.drivers) {
        const r = el('div', 'flt-row');
        r.appendChild(el('span', 'flt-nm', d.name));
        r.appendChild(el('span', null, d.craft.toUpperCase()));
        r.appendChild(el('span', null, String(d.jobs)));
        r.appendChild(el('span', null, crd(d.gross)));
        r.appendChild(el('span', null, `−${crd(d.wages + d.fuel)}`));
        r.appendChild(el('span', tone(d.net), sign(d.net)));
        tbl.appendChild(r);
      }
      sc.body.appendChild(tbl);
    }
    body.appendChild(sc);

    // The company ladder, and what its top two rungs open. This is where the player finds out that
    // LANE MARSHAL and SPIRE HAULIER exist and that they are not on the lifetime axis.
    const lad = screen('fl-sect lad', 'CHARTER', L.tier.name, `TIER ${L.tier.tier} OF ${C.COMPANY_TIERS.length}`);
    const list = el('div', 'fl-ladder');
    for (const t of C.COMPANY_TIERS) {
      const here = t.tier === L.tier.tier;
      const done = L.gross >= t.gross;
      const d = el('div', `fl-rung${here ? ' here' : ''}${done && !here ? ' done' : ''}`);
      d.appendChild(el('span', 'flr-i', String(t.tier).padStart(2, '0')));
      const tx = el('span', 'flr-tx');
      tx.appendChild(el('span', 'flr-name', t.name));
      tx.appendChild(el('span', 'flr-blurb',
        `${t.cap} driver${t.cap === 1 ? '' : 's'} — ${t.blurb}`
        + (t.opens ? ` · opens the ${t.opens} licence` : '')));
      d.appendChild(tx);
      d.appendChild(el('span', 'flr-at', crd(t.gross)));
      if (here) d.appendChild(meter(L.frac, 20, 'thin here'));
      list.appendChild(d);
    }
    lad.body.appendChild(list);
    lad.body.appendChild(el('div', 'fl-ladnote',
      'Fleet gross — what your drivers have hauled. It is a different ledger from your own licence, '
      + 'which counts only what you flew yourself.'));
    body.appendChild(lad);
  }

  stateOf() {
    return { open: this.panel.open, tab: this.branch === 'shady' ? this.stab : this.tab,
      branch: this.branch, legitTab: this.tab, shadyTab: this.stab, founding: this.founding,
      hull: this.hull, sel: this.sel,
      opens: this.opens, actions: this.actions, note: this.note };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// The DRIVER FEED strip.
//
// While the player is watching a driver the cabin dash is hidden — it reads the PLAYER's speed,
// altitude and job, and none of those describe what is on screen. A dash showing the wrong craft's
// numbers is worse than no dash. So this replaces it: a HUD-idiom strip (neon frame, transparent
// ground, no rounded corners) carrying that driver's telemetry and one key to leave.
export class DriverFeed {
  constructor(host, hooks = {}) {
    this.host = host;
    this.hooks = hooks;              // { leave, next }
    this.id = null;
    host.classList.add('hidden');
  }

  show(id) {
    this.id = id;
    this.host.classList.remove('hidden');
    return id;
  }

  hide() {
    this.id = null;
    this.host.classList.add('hidden');
    this.host.innerHTML = '';
    return null;
  }

  // Called once per HUD tick with the live status and the driver's ledger row. It rebuilds rather
  // than mutating because the strip is six elements and a diff would be more code than the paint.
  update(live, row) {
    if (!this.id || !live || !row) return false;
    const h = this.host;
    h.innerHTML = '';
    const f = el('div', 'df-frame');

    const head = el('div', 'df-head');
    head.appendChild(el('span', 'df-kick', 'DRIVER FEED'));
    head.appendChild(el('span', 'df-name', row.name));
    head.appendChild(el('span', `df-grade g${row.grade}`, row.gradeName));
    // §S2-J. What is in the hold decides what happens at the pad, so the feed says which it is.
    if (row.offBook) head.appendChild(el('span', 'df-off', 'OFF BOOK'));
    f.appendChild(head);

    const inst = el('div', 'df-inst');
    inst.appendChild(readout('SPEED', `${Math.round(live.speed)} m/s`));
    inst.appendChild(readout('ALT', `${Math.round(live.y)} m`));
    inst.appendChild(readout('HOLD', `${live.held}/${live.slots}`));
    inst.appendChild(readout('NET/MIN', sign(row.netPerMin), tone(row.netPerMin)));
    f.appendChild(inst);

    f.appendChild(el('div', 'df-task', live.towing ? 'CELL FLAT — limping to a charge pad'
      : live.dest ? `${live.leg.toUpperCase()} → ${live.dest} · ${crd(live.dist)} m`
        : live.pad ? `${live.leg.toUpperCase()} → ${live.pad} · ${crd(live.dist)} m`
          : 'looking for work'));

    const cell = el('div', 'df-cell');
    cell.appendChild(el('i', null, 'CELL'));
    cell.appendChild(meter(live.cell, 16));
    f.appendChild(cell);

    const keys = el('div', 'df-keys');
    const nx = el('button', 'df-key', 'NEXT DRIVER');
    nx.addEventListener('click', () => this.hooks.next && this.hooks.next());
    keys.appendChild(nx);
    const lv = el('button', 'df-key leave', 'LEAVE FEED');
    lv.addEventListener('click', () => this.hooks.leave && this.hooks.leave());
    keys.appendChild(lv);
    f.appendChild(keys);

    h.appendChild(f);
    return true;
  }
}
