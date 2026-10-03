import { el, btn, setText } from './dom.js?v=20261004a';
import { fmtCash, fmtNum, fmtMult } from '../state/format.js?v=20261004a';
import { section, buyRow, empty } from './kit.js?v=20261004a';
import { face, lookFor } from './face.js?v=20261004a';

const KID_TOPS = ['#f2b84b', '#9bc66b', '#e58fb0'];
const KID_AGE = { baby: 'baby', toddler: 'kid', kid: 'kid', teen: 'adult' };
export const partnerLook = (p) => lookFor(p.name, { top: '#7d9ad6' });
export const kidLook = (k, i) => lookFor(k.name, { top: KID_TOPS[i % 3] });

const STAGE_TEXT = { baby: 'Baby', toddler: 'Toddler', kid: 'Kid', teen: 'Teen' };
const NIECES = new Set(['Mags', 'Dot', 'Flo', 'Vi']);
export const kin = (name) => (NIECES.has(name) ? 'niece' : 'nephew');
const kidSub = (k) => (k.apprentice ? '🧑‍🎓 Your ' + kin(k.name) : STAGE_TEXT[k.stage] || k.stage || '');
const DOG_NAMES = ['Biscuit', 'Pepper', 'Waffles', 'Mochi', 'Rusty', 'Bean'];

export function fillLife(body, ctx) {
  const { model, game } = ctx;
  const ups = [];
  let sig = '';

  const top = el('div', 'life-top');
  const me = el('div', 'life-me');
  const meFace = el('span', 'life-face', '🧑');
  const meTxt = el('div', '');
  const meName = el('b', '', model.name());
  const meSub = el('small', '');
  meTxt.append(meName, meSub);
  me.append(meFace, meTxt);
  const cam = btn('pill', '📷', () => ctx.postcard(), 'Postcard');
  top.append(me, cam);
  body.appendChild(top);

  const homeQ = () => {
    if (!model.nextHome()) return { cost: Infinity };
    const q = model.q('housing', { tier: model.housingTier() + 1 });
    return q.young ? { ...q, lock: '🔒 age ' + q.minAge } : q;
  };
  const homeSec = section(body, 'Home');
  const homeNow = el('div', 'home-now');
  homeSec.appendChild(homeNow);
  ups.push(buyRow(homeSec, ctx, {
    icon: () => model.nextHome()?.emoji || '🏰',
    label: () => model.nextHome()?.name || 'Dream home',
    sub: () => {
      const h = model.nextHome();
      if (!h) return 'You made it';
      const q = homeQ();
      return (q.young ? fmtCash(q.cost) + ' · ' : '') + `${fmtMult(h.mult)} income · ${Math.round(h.offlineCapSec / 3600)}h away` + (h.unlocks === 'partner' ? ' · 💞' : h.unlocks ? ' · 👶' : '');
    },
    quote: homeQ,
    run: () => game.act('housing', { tier: model.housingTier() + 1 }),
    done: () => !model.nextHome(),
    after: () => { sig = ''; },
  }));

  const famSec = section(body, 'Family');
  const fam = el('div', 'fam');
  famSec.appendChild(fam);

  const retSec = section(body, 'Pass it on');
  const ret = el('div', 'retire');
  retSec.appendChild(ret);

  const wallSec = section(body, 'Family wall');
  const wall = el('div', 'wall');
  wallSec.appendChild(wall);

  function partnerPick() {
    const box = el('div', 'partner-pick');
    box.appendChild(el('b', 'pick-q', '☕ Who caught your eye?'));
    const row = el('div', 'choice-row');
    for (const p of model.partners()) {
      const b = btn('choice person', '', () => {
        const r = game.act('partner', { choice: p.id });
        if (r.ok) { ctx.celebrate('💑 ' + p.name + '!'); sig = ''; paint(); }
      }, p.name + ', ' + p.perk);
      b.append(face(partnerLook(p), { size: 58 }), el('b', 'choice-n', p.name), el('small', 'perk', p.emoji + ' ' + p.perk));
      row.appendChild(b);
    }
    box.appendChild(row);
    return box;
  }

  function kidRow(k, i) {
    const r = el('div', 'kid');
    r.append(face(kidLook(k, i), { size: 40, age: KID_AGE[k.stage] }));
    const t = el('div', 'kid-t');
    t.append(el('b', '', k.name), el('small', '', kidSub(k)));
    r.appendChild(t);
    if (k.canWork) {
      const sel = el('select', 'kid-work');
      sel.setAttribute('aria-label', k.name + ' helps at');
      const ph = new Option('🏠 Helps at…', '');
      ph.disabled = true;
      sel.appendChild(ph);
      for (const l of model.owned()) sel.appendChild(new Option(l.emoji + ' ' + l.name, l.id));
      sel.value = k.workedLine || '';
      sel.addEventListener('change', () => {
        if (!sel.value) return;
        const res = game.act('kidWork', { kidId: k.id, lineId: sel.value });
        if (res.ok) { ctx.audio.sfx.pop(); ctx.toast(`${model.line(sel.value).emoji} ${k.name} helps at ${model.line(sel.value).name}`); sig = ''; }
        else ctx.toast(res.msg || '🙅 Not yet');
      });
      r.appendChild(sel);
    }
    if (k.workSec > 0) { const t = model.talent(k.talent); r.appendChild(el('small', 'talent', t.emoji + ' ' + t.name)); }
    return r;
  }

  function paint() {
    const l = model.life();
    const kids = model.kids();
    const rp = model.retire();
    const key = [model.housingTier(), l.partner?.id, kids.map((k) => k.stage + k.workedLine + k.talent + !!k.apprentice).join(), !!l.dog, model.dogOffered(), rp.available, rp.legacy, rp.recommended, rp.mult.toFixed(2), model.portraits().length, model.partnerOffered(), model.ownedCount()].join('|');
    meFace.textContent = l.partner ? '💑' : model.age() >= 50 ? '🧓' : '🧑';
    setText(meSub, `Age ${model.age()} · Gen ${model.gen()}`);
    if (key === sig) return;
    sig = key;

    const h = model.home();
    homeNow.replaceChildren(el('span', 'home-e', h.emoji), el('b', '', h.name));

    fam.replaceChildren();
    if (l.partner) {
      const p = l.partner;
      const r = el('div', 'kid');
      const t = el('div', 'kid-t');
      t.append(el('b', '', p.name), el('small', '', '💑 Partner'));
      r.append(face(partnerLook(p), { size: 40 }), t, el('small', 'talent', p.emoji + ' ' + p.perk));
      fam.appendChild(r);
    } else if (model.partnerOffered()) fam.appendChild(partnerPick());
    kids.forEach((k, i) => fam.appendChild(kidRow(k, i)));
    if (l.dog) {
      const r = el('div', 'kid');
      const t = el('div', 'kid-t');
      t.append(el('b', '', l.dog.name), el('small', '', '🕊️ fetches pigeons'));
      r.append(el('span', 'kid-e', '🐕'), t);
      fam.appendChild(r);
    } else if (model.dogOffered()) {
      const r = el('div', 'kid offer');
      r.append(el('span', 'kid-e', '🐕'), el('b', 'kid-t', 'A stray pup'), btn('pill gold', 'Adopt', () => {
        const res = game.act('adoptDog', { name: DOG_NAMES[Math.floor(Math.random() * DOG_NAMES.length)] });
        if (res.ok) { ctx.celebrate('🐕 New friend!'); sig = ''; paint(); }
      }));
      fam.appendChild(r);
    }
    if (!fam.children.length) empty(fam, '☕', model.housingTier() < 2 ? '🏢 Apartment first' : 'Soon…');
    else if (l.partner && !kids.length) fam.appendChild(el('small', 'muted', model.housingTier() < 3 ? '🏠 Starter House → 👶' : '👶 Soon…'));

    ret.replaceChildren();
    const needs = el('div', 'needs');
    for (const n of rp.needs) needs.appendChild(el('span', 'need' + (n.done ? ' ok' : ''), (n.done ? '✓ ' : '') + n.emoji + ' ' + n.text));
    ret.appendChild(needs);
    const prev = el('div', 'ret-preview');
    prev.append(el('span', 'ret-big', fmtMult(rp.mult)), el('small', '', 'income for your heir' + (rp.legacy ? ' · +' + fmtNum(rp.legacy) + ' 🏛️' : '') + (rp.floorApplies ? ' · first-gen bonus' : '')));
    ret.appendChild(prev);
    const go = btn('cta' + (rp.recommended ? ' glow' : ''), '🌅 Pass it on', () => ctx.sheets.push({ id: 'ceremony', title: '🌅 Pass it on', cls: 'warm', fill: (b) => fillCeremony(b, ctx) }));
    go.disabled = !rp.available;
    ret.appendChild(go);

    wall.replaceChildren();
    const ps = model.portraits();
    for (const p of ps) {
      const f = el('div', 'frame');
      const h = model.data.housing[p.homeTier];
      f.append(el('span', '', h.emoji), el('small', '', `${p.name} · G${p.gen}`));
      f.title = `${p.name}, age ${Math.floor(p.age)}${p.partner ? ' · 💑 ' + p.partner : ''}${p.lineId ? ' · ' + model.line(p.lineId).emoji : ''}`;
      wall.appendChild(f);
    }
    const mine = el('div', 'frame you');
    mine.append(el('span', '', '🧑'), el('small', '', 'Gen ' + model.gen()));
    wall.appendChild(mine);
    const looms = model.heirlooms();
    if (looms.length) {
      const f = el('div', 'frame loom');
      f.append(el('span', '', looms.map((x) => model.itemEmoji(x.def)).join('')), el('small', '', 'Heirlooms'));
      wall.appendChild(f);
    }
  }

  const update = () => { for (const u of ups) u(); paint(); };
  update();
  return update;
}

export function fillCeremony(body, ctx) {
  const { model, game } = ctx;
  let step = 0, heir = null, loom = null;
  const kids = model.kids();
  const noItems = !model.items().length;
  const steps = el('div', 'steps');
  const pane = el('div', 'step-pane');
  body.append(steps, pane);

  function dots() {
    steps.replaceChildren(...['🧑', '🎁', '🖼️'].map((e, i) => el('span', 'step' + (i === step ? ' on' : i < step ? ' done' : ''), e)));
  }

  function next() { step++; render(); ctx.audio.sfx.pop(); }

  function render() {
    dots();
    pane.replaceChildren();
    if (step === 0) {
      pane.appendChild(el('p', 'lede', 'Who takes over?'));
      const row = el('div', 'choice-row');
      kids.forEach((k, i) => {
        const b = btn('choice person heir' + (k.teen ? '' : ' young') + (heir === k.id ? ' sel' : ''), '', () => {
          if (!k.teen) { ctx.toast('🧒 Too young to take over'); return; }
          heir = k.id;
          noItems ? (step = 2, render(), ctx.audio.sfx.pop()) : next();
        }, k.name);
        const tl = model.talent(k.talent);
        b.append(face(kidLook(k, i), { size: 58, age: KID_AGE[k.stage] }), el('b', 'choice-n', k.name), el('small', 'perk', k.teen ? (k.apprentice ? '🧑‍🎓 ' : '') + `${tl.emoji} ${tl.name} · ${tl.text}` : '🧒 ' + STAGE_TEXT[k.stage]));
        row.appendChild(b);
      });
      pane.appendChild(row);
    } else if (step === 1) {
      pane.appendChild(el('p', 'lede', 'One heirloom stays.'));
      const grid = el('div', 'item-grid');
      for (const it of model.items()) {
        const b = btn('item r' + it.rarity + (loom === it.id ? ' sel' : ''), '', () => { loom = it.id; next(); }, it.def.name);
        b.append(el('span', 'item-e', it.def.emoji), el('small', '', model.itemLabel(it)));
        grid.appendChild(b);
      }
      pane.appendChild(grid);
      pane.appendChild(btn('wide-btn', 'Skip ›', () => { loom = null; next(); }));
    } else {
      const rp = model.retire();
      const frame = el('div', 'frame big');
      const hk = kids.find((k) => k.id === heir);
      frame.append(el('span', '', '🧓'), el('b', '', model.name()), el('small', '', `Gen ${model.gen()} · age ${model.age()}`));
      pane.appendChild(el('p', 'lede', `${hk.emoji} ${hk.name} takes over`));
      pane.appendChild(frame);
      const gains = el('div', 'needs');
      gains.append(
        el('span', 'need ok', '💰 ' + fmtMult(rp.mult) + ' income'),
        el('span', 'need ok', '💵 ' + fmtCash(rp.starterCash) + ' start'),
        ...(loom ? [el('span', 'need ok', '🎁 ' + model.items().find((i) => i.id === loom).def.emoji + ' heirloom')] : []),
        el('span', 'need ok', '🏛️ Landmark'),
        el('span', 'need ok', '🖼️ +1%'),
      );
      pane.appendChild(gains);
      const go = btn('cta glow', '🌅 Pass it on', () => {
        const r = game.act('retire', { heirId: heir, heirloomItemId: loom });
        if (r.ok) {
          ctx.sheets.close();
          ctx.celebrate('🌅');
          document.documentElement.classList.add('sunset');
          setTimeout(() => document.documentElement.classList.remove('sunset'), 3200);
          ctx.textNow();
        } else ctx.toast('🌅 ' + (r.msg || 'Not yet'));
      });
      pane.appendChild(go);
    }
  }
  render();
  return null;
}
