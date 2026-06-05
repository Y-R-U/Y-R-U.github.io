/* caltrack — front-end. One codebase, two modes:
   • SERVER  (caltrack.br8t.com)  — accounts + SQLite via /api/*
   • CLIENT  (GitHub Pages)       — no backend, everything in localStorage
   Mode is auto-detected by probing /api/health.                              */
'use strict';

const KCAL_PER_KG = 7700;        // ~kcal in 1 kg of body fat
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

/* ---------------------------------------------------------------- toast --- */
function toast(msg, {accent=false, ms=2600}={}){
  const t = document.createElement('div');
  t.className = 'toast' + (accent ? ' accent' : '');
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(()=>{ t.style.transition='opacity .3s'; t.style.opacity='0';
                   setTimeout(()=>t.remove(),300); }, ms);
}

/* ------------------------------------------------------------- confirm --- */
function confirmDialog(text, {danger=true, yes='Delete'}={}){
  return new Promise(res=>{
    const bd = $('#confirm-backdrop');
    $('#confirm-text').textContent = text;
    const y = $('#confirm-yes'), n = $('#confirm-no');
    y.textContent = yes;
    y.className = 'btn-primary' + (danger ? ' danger' : '');
    bd.classList.remove('hidden');
    const done = v => { bd.classList.add('hidden'); y.onclick=n.onclick=bd.onclick=null; res(v); };
    y.onclick = ()=>done(true);
    n.onclick = ()=>done(false);
    bd.onclick = e => { if(e.target===bd) done(false); };
  });
}

/* =========================================================================
   STORAGE ADAPTER
   ========================================================================= */
const GLOBAL_SEED = [
  ['food','Banana',105,8],['food','Apple',95,10],['food','Coffee with milk',40,8],
  ['food','Porridge / oats',220,8],['food','Eggs (2)',140,8],['food','Toast (2 slices)',160,8],
  ['food','Chicken breast',250,13],['food','Salad',150,13],['food','Sandwich',350,13],
  ['food','Rice (1 cup)',200,19],['food','Pasta bowl',450,19],['food','Pizza slice',285,19],
  ['food','Protein shake',180,16],['food','Chocolate bar',230,15],['food','Beer (pint)',215,21],
  ['food','Glass of wine',125,21],['food','Yoghurt',120,8],['food','Nuts (handful)',180,16],
  ['exercise','Walk (30 min)',150,12],['exercise','Run (30 min)',320,7],['exercise','Cycling (30 min)',280,17],
  ['exercise','Gym session',400,18],['exercise','Swimming (30 min)',300,18],['exercise','Yoga (30 min)',120,7],
  ['exercise','HIIT (20 min)',250,18],['exercise','Weights (45 min)',220,18],['exercise','Football',500,18],
];

const Store = {
  mode: 'client',
  async init(){
    try{
      const c = new AbortController();
      const t = setTimeout(()=>c.abort(), 2500);
      const r = await fetch('api/health', {signal:c.signal});
      clearTimeout(t);
      if(r.ok && (await r.json()).mode === 'server'){ this.mode='server'; return; }
    }catch(_){}
    this.mode = 'client';
    this._seed();
  },
  /* --- server helpers --- */
  async _api(path, opts={}){
    const r = await fetch('api/'+path, {credentials:'same-origin',
      headers:{'Content-Type':'application/json'}, ...opts});
    const data = r.status===204 ? {} : await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data.error || ('HTTP '+r.status));
    return data;
  },
  /* --- client (localStorage) helpers --- */
  _lsGet(k, def){ try{ return JSON.parse(localStorage.getItem('ct:'+k)) ?? def; }catch{ return def; } },
  _lsSet(k, v){ localStorage.setItem('ct:'+k, JSON.stringify(v)); },
  _seed(){
    if(this._lsGet('seeded', false)) return;
    const now = Math.floor(Date.now()/1000);
    let id = 1;
    const sg = GLOBAL_SEED.map(([kind,label,cal,hour])=>(
      {id:id++, kind, label, calories:cal, count:1, hour_sum:hour, last_used:now, global:true}));
    this._lsSet('suggestions', sg);
    this._lsSet('seeded', true);
  },

  /* --- account (server only) --- */
  async register(u,p){ return this._api('register',{method:'POST',body:JSON.stringify({username:u,password:p})}); },
  async login(u,p){ return this._api('login',{method:'POST',body:JSON.stringify({username:u,password:p})}); },
  async logout(){ if(this.mode==='server') await this._api('logout',{method:'POST'}); },

  /* --- me / settings --- */
  async me(){
    if(this.mode==='server') return this._api('me');
    const s = this._lsGet('settings', {});
    return {username:'you', daily_burn:s.daily_burn||0, target_loss_kg:s.target_loss_kg||0,
            start_weight_kg:s.start_weight_kg||0, configured:(s.daily_burn||0)>0};
  },
  async saveSettings(patch){
    if(this.mode==='server') return this._api('settings',{method:'PUT',body:JSON.stringify(patch)});
    const s = this._lsGet('settings', {});
    Object.assign(s, patch);
    this._lsSet('settings', s);
    return {...s, configured:(s.daily_burn||0)>0};
  },

  /* --- entries --- */
  async listEntries(from, to){
    if(this.mode==='server') return this._api(`entries?from=${from}&to=${to}`);
    return this._lsGet('entries', []).filter(e=>e.created_at>=from && e.created_at<to)
             .sort((a,b)=>b.created_at-a.created_at);
  },
  async addEntry(e){
    if(this.mode==='server') return this._api('entries',{method:'POST',body:JSON.stringify(e)});
    const when = e.when || Math.floor(Date.now()/1000);
    const entries = this._lsGet('entries', []);
    const row = {id:Date.now(), kind:e.kind, label:e.label, calories:e.calories, created_at:when};
    entries.push(row); this._lsSet('entries', entries);
    this._rememberClient(e.kind, e.label, e.calories, when);
    return row;
  },
  async updateEntry(id, e){
    if(this.mode==='server') return this._api('entries/'+id,{method:'PUT',body:JSON.stringify(e)});
    const entries = this._lsGet('entries', []);
    const row = entries.find(x=>x.id===id);
    if(row){
      row.kind=e.kind; row.label=e.label; row.calories=e.calories;
      this._lsSet('entries', entries);
      this._rememberClient(e.kind, e.label, e.calories, row.created_at);
    }
    return row;
  },
  async deleteEntry(id){
    if(this.mode==='server') return this._api('entries/'+id,{method:'DELETE'});
    this._lsSet('entries', this._lsGet('entries', []).filter(e=>e.id!==id));
  },

  /* --- suggestions --- */
  async suggestions(kind){
    if(this.mode==='server') return this._api('suggestions?kind='+kind);
    const all = this._lsGet('suggestions', []).filter(s=>!kind || s.kind===kind);
    const seen = new Set(), out = [];
    for(const s of all.sort((a,b)=>b.count-a.count || b.last_used-a.last_used)){
      const key = s.kind+'|'+s.label.toLowerCase();
      if(seen.has(key)) continue; seen.add(key);
      out.push({id:s.id, kind:s.kind, label:s.label, calories:s.calories,
                count:s.count, avg_hour:s.count?s.hour_sum/s.count:12, global:!!s.global});
    }
    return out;
  },
  async deleteSuggestion(id){
    if(this.mode==='server') return this._api('suggestions/'+id,{method:'DELETE'});
    this._lsSet('suggestions', this._lsGet('suggestions', []).filter(s=>s.id!==id));
  },
  _rememberClient(kind, label, cal, when){
    const list = this._lsGet('suggestions', []);
    const hour = new Date(when*1000).getHours();
    const hit = list.find(s=>s.kind===kind && s.label.toLowerCase()===label.toLowerCase() && !s.global);
    if(hit){ hit.count++; hit.hour_sum+=hour; hit.calories=cal; hit.last_used=when; }
    else list.push({id:Date.now()+1, kind, label, calories:cal, count:1, hour_sum:hour, last_used:when, global:false});
    this._lsSet('suggestions', list);
  },
};

/* =========================================================================
   SHARED PURE HELPERS
   ========================================================================= */
function rankSuggestions(list, text, nowHour){
  const q = text.trim().toLowerCase();
  return list
    .map(s=>{
      const lab = s.label.toLowerCase();
      if(q && !lab.includes(q)) return null;
      let score = Math.log2(1+s.count)*3;             // frequency
      const hd = Math.min(Math.abs(s.avg_hour-nowHour), 24-Math.abs(s.avg_hour-nowHour));
      score += (12-hd)/3;                             // time-of-day proximity
      if(q && lab.startsWith(q)) score += 5;          // prefix match wins
      return {s, score};
    })
    .filter(Boolean)
    .sort((a,b)=>b.score-a.score)
    .slice(0,7)
    .map(x=>x.s);
}
const kgLost = (deficitPerDay, days) => Math.max(0, deficitPerDay*days/KCAL_PER_KG);
const startOfDay = ts => { const d=new Date(ts*1000); d.setHours(0,0,0,0); return Math.floor(d/1000); };
const round1 = n => Math.round(n*10)/10;
const emojiFor = k => k==='food' ? '🍎' : '💪';

/* =========================================================================
   APP STATE + UI
   ========================================================================= */
const State = {
  me:null, kind:'food', sugCache:{food:[],exercise:[]}, entries:[],
  sugOpen:false, sugExpanded:false, hideT:null, editingId:null,
  projDef:250, projWk:10, periodDays:7,
};

/* ---------- entry kind toggle ---------- */
function setKind(kind){
  State.kind = kind;
  State.sugExpanded = false;
  $$('#kind-seg .seg-btn').forEach(b=>b.classList.toggle('active', b.dataset.kind===kind));
  $('#label-input').placeholder = kind==='food' ? 'What did you eat?' : 'What did you do?';
  updateSaveLabel();
  loadSuggestions().then(renderSuggest);
}

function updateSaveLabel(){
  const verb = State.editingId ? 'Update' : 'Add';
  $('#save-btn').textContent = `${verb} ${State.kind==='food' ? 'Food' : 'Exercise'}`;
}

async function loadSuggestions(){
  State.sugCache[State.kind] = await Store.suggestions(State.kind);
}

const COLLAPSED_SUGGESTIONS = 2;

function renderSuggest(){
  const box = $('#suggest-list');
  const ranked = rankSuggestions(State.sugCache[State.kind]||[], $('#label-input').value, new Date().getHours());
  if(!State.sugOpen || !ranked.length){ box.classList.add('hidden'); box.innerHTML=''; return; }

  const collapsible = ranked.length > COLLAPSED_SUGGESTIONS;
  const shown = (State.sugExpanded || !collapsible) ? ranked : ranked.slice(0, COLLAPSED_SUGGESTIONS);
  box.innerHTML = '';
  for(const s of shown){
    const li = document.createElement('li');
    li.innerHTML = `<span class="s-label">${esc(s.label)}</span>
      ${s.global?'<span class="s-glob">global</span>':''}
      <span class="s-cal">${s.calories} kcal</span>
      <button class="s-del" aria-label="Remove suggestion">✕</button>`;
    li.querySelector('.s-label').onclick = ()=>pick(s);
    li.querySelector('.s-cal').onclick = ()=>pick(s);
    li.querySelector('.s-del').onclick = async (ev)=>{
      ev.stopPropagation();
      clearTimeout(State.hideT);                 // keep the list alive through the dialog
      const ok = await confirmDialog(`Remove “${s.label}” from your suggestions?`, {yes:'Remove'});
      if(!ok){ renderSuggest(); return; }
      await Store.deleteSuggestion(s.id);
      await loadSuggestions(); renderSuggest();
      toast('Suggestion removed');
    };
    box.appendChild(li);
  }
  if(collapsible){
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 's-notch' + (State.sugExpanded ? ' open' : '');
    more.innerHTML = (State.sugExpanded ? 'Show less' : `${ranked.length - COLLAPSED_SUGGESTIONS} more`) +
                     ' <span class="chev">▾</span>';
    more.addEventListener('mousedown', e=>e.preventDefault());   // don't blur the input
    more.onclick = ()=>{ clearTimeout(State.hideT); State.sugExpanded = !State.sugExpanded; renderSuggest(); };
    box.appendChild(more);
  }
  box.classList.remove('hidden');
}

function pick(s){
  State.sugOpen = false;
  clearTimeout(State.hideT);
  $('#suggest-list').classList.add('hidden'); $('#suggest-list').innerHTML='';
  $('#label-input').value = s.label;
  $('#cal-input').value = s.calories;
  $('#cal-input').focus();
}

/* ---------- calorie steppers ---------- */
function bumpCal(delta){
  const inp = $('#cal-input');
  inp.value = Math.max(0, (parseInt(inp.value,10)||0) + delta);
}

/* ---------- save an entry (new, or an edit in progress) ---------- */
async function saveEntry(){
  const label = $('#label-input').value.trim();
  const cal = parseInt($('#cal-input').value,10)||0;
  if(!label){ toast('Give it a name first'); $('#label-input').focus(); return; }
  if(cal<=0){ toast('Set a calorie amount'); $('#cal-input').focus(); return; }
  const payload = {kind:State.kind, label, calories:cal, hour:new Date().getHours()};
  if(State.editingId != null){
    await Store.updateEntry(State.editingId, payload);
    exitEditMode();
    toast(`${emojiFor(State.kind)} ${label} updated`, {accent:true});
  }else{
    await Store.addEntry(payload);
    $('#label-input').value=''; $('#cal-input').value=0;
    toast(`${emojiFor(State.kind)} ${label} · ${cal} kcal saved`, {accent:true});
  }
  State.sugOpen = false;
  await loadSuggestions();
  await refreshData();
  $('#label-input').focus();
}

/* ---------- edit an existing entry ---------- */
function editEntry(e){
  State.editingId = e.id;
  $('#edit-banner').classList.remove('hidden');
  setKind(e.kind);                       // sets kind + Save label = "Update …"
  $('#label-input').value = e.label;
  $('#cal-input').value = e.calories;
  $('.entry-card').scrollIntoView({behavior:'smooth', block:'start'});
  $('#cal-input').focus();
}
function exitEditMode(){
  State.editingId = null;
  $('#edit-banner').classList.add('hidden');
  $('#label-input').value=''; $('#cal-input').value=0;
  updateSaveLabel();
}

/* ---------- today + actuals data ---------- */
async function refreshData(){
  const now = Math.floor(Date.now()/1000);
  const monthAgo = now - 31*86400;
  State.entries = await Store.listEntries(monthAgo, now+86400);
  renderToday(State.entries);
  renderActuals(State.entries);
}

function renderToday(all){
  const dayStart = startOfDay(Math.floor(Date.now()/1000));
  const today = all.filter(e=>e.created_at>=dayStart);
  const eaten  = today.filter(e=>e.kind==='food').reduce((a,e)=>a+e.calories,0);
  const burned = today.filter(e=>e.kind==='exercise').reduce((a,e)=>a+e.calories,0);
  const burn = State.me.daily_burn||0;
  const net = burn + burned - eaten;     // positive = deficit (good)
  $('#today-date').textContent = new Date().toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'});
  $('#t-eaten').textContent = eaten;
  $('#t-burned').textContent = burned;
  $('#t-net').textContent = (net>=0?'+':'') + net;
  // bar shows deficit vs a 1000 kcal "great day" reference
  const pct = Math.max(0, Math.min(100, net/1000*100));
  $('#net-bar').style.width = pct+'%';
  let msg;
  if(!burn) msg = 'Set your base daily burn in ⚙️ to see your real deficit.';
  else if(net>0) msg = `Nice — ${net} kcal under your burn so far today.`;
  else if(net===0) msg = 'Right at maintenance so far today.';
  else msg = `${-net} kcal over your burn so far today — still time to move!`;
  $('#net-msg').textContent = msg;

  const ul = $('#today-entries'); ul.innerHTML='';
  if(!today.length){ ul.innerHTML = '<li class="empty">No entries yet today — add one above ↑</li>'; return; }
  for(const e of today){
    const li = document.createElement('li');
    li.innerHTML = `<span class="e-emoji">${emojiFor(e.kind)}</span>
      <span class="e-label">${esc(e.label)}</span>
      <span class="e-cal ${e.kind}">${e.kind==='food'?'+':'−'}${e.calories}</span>
      <button class="e-edit" aria-label="Edit entry">✏️</button>
      <button class="e-del" aria-label="Delete entry">🗑</button>`;
    li.querySelector('.e-edit').onclick = ()=>editEntry(e);
    li.querySelector('.e-del').onclick = async ()=>{
      const ok = await confirmDialog(`Delete “${e.label}”?`);
      if(!ok) return;
      if(State.editingId===e.id) exitEditMode();
      await Store.deleteEntry(e.id); await refreshData(); toast('Entry deleted');
    };
    ul.appendChild(li);
  }
}

function renderActuals(all){
  const burn = State.me.daily_burn||0;
  const card = $('#actual-card');
  // Need a base burn AND at least one logged meal — otherwise there's nothing real to show.
  if(!burn || !all.some(e=>e.kind==='food')){ card.classList.add('hidden'); return; }
  card.classList.remove('hidden');

  const days = State.periodDays;
  const todayStart = startOfDay(Math.floor(Date.now()/1000));
  const series = [];                 // per-day net deficit; 0 = untracked day (no bar)
  let total = 0, trackedDays = 0;
  for(let i=days-1;i>=0;i--){
    const ds = todayStart - i*86400, de = ds + 86400;
    const dayEntries = all.filter(e=>e.created_at>=ds && e.created_at<de);
    // A day only counts if food was logged — otherwise we can't assume zero intake,
    // and an empty day would otherwise read as a full +burn "deficit".
    if(!dayEntries.some(e=>e.kind==='food')){ series.push(0); continue; }
    const eaten  = dayEntries.filter(e=>e.kind==='food').reduce((a,e)=>a+e.calories,0);
    const burned = dayEntries.filter(e=>e.kind==='exercise').reduce((a,e)=>a+e.calories,0);
    const def = burn + burned - eaten;
    series.push(def); total += def; trackedDays++;
  }
  const avg = Math.round(total/Math.max(1,trackedDays));
  $('#a-avg').textContent  = (avg>=0?'+':'')+avg;
  $('#a-kg').textContent   = round1(total/KCAL_PER_KG);       // net kg across tracked days
  $('#a-proj').textContent = round1(avg*70/KCAL_PER_KG);      // kg if this avg held for 10wk
  whenSized($('#actual-chart'), ()=> drawBars($('#actual-chart'), series));
}

/* ---------- projection ---------- */
function renderProjection(){
  const def = State.projDef, wk = State.projWk;
  $('#proj-def').textContent = def;
  $('#proj-wk').textContent = wk;
  const kg = kgLost(def, wk*7);
  $('#proj-kg').textContent = round1(kg) + ' kg';
  // chart: cumulative kg over the weeks
  const pts = [];
  for(let w=0; w<=wk; w++) pts.push(kgLost(def, w*7));
  whenSized($('#proj-chart'), ()=> drawLine($('#proj-chart'), pts, {fmt:v=>round1(v)+'kg'}));
  // target hint
  const tgt = State.me && State.me.target_loss_kg;
  if(tgt>0){
    const weeksNeeded = Math.ceil(tgt*KCAL_PER_KG/def/7);
    $('#proj-target').textContent =
      `🎯 Your ${round1(tgt)} kg goal lands in ~${weeksNeeded} weeks at this deficit.`;
  }else{
    $('#proj-target').textContent = 'Set a goal in ⚙️ to see your finish line. (~7,700 kcal ≈ 1 kg.)';
  }
}

/* =========================================================================
   CANVAS CHARTS (tiny, dependency-free)
   ========================================================================= */
function chartCtx(cv){
  const dpr = window.devicePixelRatio||1;
  // Read the rendered size from CSS layout (stable), NOT the canvas width/height
  // attributes — those are the backing store we overwrite here, so reading them
  // back and re-multiplying by dpr would inflate the canvas on every redraw.
  const w = cv.clientWidth, h = cv.clientHeight || 150;
  if(w < 2) return null;                       // not laid out yet — caller retries
  cv.width = Math.round(w*dpr); cv.height = Math.round(h*dpr);
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
  return {ctx, w, h};
}
function cssVar(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

// Draw once the canvas actually has a width (handles first paint / just-unhidden cards).
function whenSized(cv, draw, tries=12){
  if(cv.clientWidth >= 2){ draw(); return; }
  if(tries > 0) requestAnimationFrame(()=>whenSized(cv, draw, tries-1));
}

function drawLine(cv, pts, {fmt=v=>v}={}){
  const m = chartCtx(cv); if(!m) return;
  const {ctx,w,h} = m;
  ctx.clearRect(0,0,w,h);
  const pad = {l:6,r:6,t:14,b:16};
  const max = Math.max(...pts, 0.001);
  const X = i => pad.l + (w-pad.l-pad.r) * (pts.length<2?0:i/(pts.length-1));
  const Y = v => h-pad.b - (h-pad.t-pad.b) * (v/max);
  // area fill
  const grad = ctx.createLinearGradient(0,0,0,h);
  grad.addColorStop(0, hexA(cssVar('--accent'),0.30));
  grad.addColorStop(1, hexA(cssVar('--accent'),0.02));
  ctx.beginPath(); ctx.moveTo(X(0), Y(0));
  pts.forEach((v,i)=>ctx.lineTo(X(i), Y(v)));
  ctx.lineTo(X(pts.length-1), h-pad.b); ctx.lineTo(X(0), h-pad.b); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  // line
  ctx.beginPath(); pts.forEach((v,i)=> i?ctx.lineTo(X(i),Y(v)):ctx.moveTo(X(i),Y(v)));
  ctx.lineWidth=2.5; ctx.strokeStyle=cssVar('--accent'); ctx.lineJoin='round'; ctx.stroke();
  // end dot + label
  const lx=X(pts.length-1), ly=Y(pts.at(-1));
  ctx.beginPath(); ctx.arc(lx,ly,3.5,0,7); ctx.fillStyle=cssVar('--accent'); ctx.fill();
  ctx.fillStyle=cssVar('--ink'); ctx.font='700 12px system-ui'; ctx.textAlign='right';
  ctx.fillText(fmt(pts.at(-1)), lx-4, Math.max(12, ly-7));
}

function drawBars(cv, vals){
  const m = chartCtx(cv); if(!m) return;
  const {ctx,w,h} = m;
  ctx.clearRect(0,0,w,h);
  const pad={t:10,b:14}, n=vals.length;
  const maxAbs = Math.max(1, ...vals.map(Math.abs));
  const bw = (w/n)*0.62, gap=(w/n)*0.38;
  const zeroY = pad.t + (h-pad.t-pad.b) * (maxAbs/(2*maxAbs)); // mid baseline
  const half = (h-pad.t-pad.b)/2;
  ctx.strokeStyle=hexA(cssVar('--muted'),.3); ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(0,zeroY); ctx.lineTo(w,zeroY); ctx.stroke();
  vals.forEach((v,i)=>{
    const x = i*(w/n) + gap/2;
    const bh = (Math.abs(v)/maxAbs)*half;
    ctx.fillStyle = v>=0 ? cssVar('--good') : cssVar('--bad');
    if(v>=0) roundRect(ctx, x, zeroY-bh, bw, bh, 4);
    else     roundRect(ctx, x, zeroY,    bw, bh, 4);
  });
}
function roundRect(ctx,x,y,w,h,r){ r=Math.min(r,h/2,w/2); ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); ctx.fill(); }
function hexA(hex,a){ hex=hex.replace('#',''); if(hex.length===3) hex=hex.split('').map(c=>c+c).join('');
  const n=parseInt(hex,16); return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`; }
function esc(s){ return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

/* =========================================================================
   SETTINGS SHEET
   ========================================================================= */
function openSettings(){
  $('#set-burn').value   = State.me.daily_burn||'';
  $('#set-target').value = State.me.target_loss_kg||'';
  $('#set-weight').value = State.me.start_weight_kg||'';
  $('#logout-btn').classList.toggle('hidden', Store.mode!=='server');
  $('#storage-note').innerHTML = Store.mode==='server'
    ? '🔒 Synced to your account on caltrack.br8t.com.'
    : '📱 Browser-only backup — data lives on this device. Visit <b>caltrack.br8t.com</b> to create an account and sync.';
  $('#sheet-backdrop').classList.remove('hidden');
  $('#settings').classList.remove('hidden');
}
function closeSettings(){
  $('#settings').classList.add('hidden');
  $('#sheet-backdrop').classList.add('hidden');
}
async function saveSettings(){
  const patch = {
    daily_burn: parseInt($('#set-burn').value,10)||0,
    target_loss_kg: parseFloat($('#set-target').value)||0,
    start_weight_kg: parseFloat($('#set-weight').value)||0,
  };
  State.me = await Store.saveSettings(patch);
  closeSettings();
  $('#cog').classList.remove('pulse');
  toast('Settings saved', {accent:true});
  renderProjection(); await refreshData();
}

/* =========================================================================
   AUTH SCREEN  (server mode)
   ========================================================================= */
let authIsRegister = true;
function showAuth(){
  $('#auth').classList.remove('hidden');
  $('#app').classList.add('hidden');
  $('#au-switch').onclick = e=>{ e.preventDefault(); authIsRegister=!authIsRegister; syncAuthUI(); };
  $('#auth-form').onsubmit = doAuth;
  syncAuthUI();
}
function syncAuthUI(){
  $('#au-submit').textContent = authIsRegister ? 'Create account' : 'Log in';
  $('#au-pass').autocomplete = authIsRegister ? 'new-password' : 'current-password';
  $('.auth-toggle').innerHTML = authIsRegister
    ? 'Already have an account? <a id="au-switch" href="#">Log in</a>'
    : 'New here? <a id="au-switch" href="#">Create an account</a>';
  $('#au-switch').onclick = e=>{ e.preventDefault(); authIsRegister=!authIsRegister; syncAuthUI(); };
  $('#au-err').textContent='';
}
async function doAuth(e){
  e.preventDefault();
  const u=$('#au-user').value.trim(), p=$('#au-pass').value;
  try{
    State.me = authIsRegister ? await Store.register(u,p) : await Store.login(u,p);
    enterApp(authIsRegister);
  }catch(err){ $('#au-err').textContent = err.message; }
}

/* =========================================================================
   BOOT
   ========================================================================= */
async function enterApp(isNew){
  $('#auth').classList.add('hidden');
  $('#app').classList.remove('hidden');
  setKind('food');
  renderProjection();
  await refreshData();
  // nudge to set daily burn
  if(!State.me.configured){
    $('#cog').classList.add('pulse');
    setTimeout(()=>toast('👋 Tap ⚙️ to set your daily calorie burn — it powers your numbers.', {ms:4200}), 600);
  }
  if(Store.mode==='client'){
    setTimeout(()=>toast('📱 Browser-only save. Go to caltrack.br8t.com to create an account & sync.', {ms:4600}), isNew?0:1200);
  }
  $('#label-input').focus();
}

function wireEvents(){
  $$('#kind-seg .seg-btn').forEach(b=> b.onclick=()=>setKind(b.dataset.kind));
  $$('.step').forEach(b=> b.onclick=()=>bumpCal(parseInt(b.dataset.delta,10)));
  $('#save-btn').onclick = saveEntry;
  const li = $('#label-input');
  li.addEventListener('input', renderSuggest);
  li.addEventListener('focus', ()=>{ State.sugOpen=true; State.sugExpanded=false; renderSuggest(); });
  li.addEventListener('blur', ()=>{ State.hideT=setTimeout(()=>{ State.sugOpen=false; renderSuggest(); }, 180); });
  li.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); $('#cal-input').focus(); } });
  $('#cal-input').addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); saveEntry(); } });
  // tap anywhere outside the entry box closes the suggestion list
  document.addEventListener('pointerdown', e=>{
    if(State.sugOpen && !e.target.closest('.combo')){ State.sugOpen=false; clearTimeout(State.hideT); renderSuggest(); }
  });
  $('#edit-cancel').onclick = exitEditMode;

  $('#cog').onclick = openSettings;
  $('#set-save').onclick = saveSettings;
  $('#set-close').onclick = closeSettings;
  $('#sheet-backdrop').onclick = closeSettings;
  $('#logout-btn').onclick = async ()=>{ await Store.logout(); location.reload(); };

  // projection steppers
  $$('[data-proj]').forEach(b=> b.onclick=()=>{
    const d = parseInt(b.dataset.delta,10);
    if(b.dataset.proj==='def') State.projDef = Math.max(50, State.projDef+d);
    else State.projWk = Math.max(1, State.projWk+d);
    renderProjection();
  });
  // actuals period stepper
  $$('[data-period]').forEach(b=> b.onclick=()=>{
    State.periodDays = Math.max(1, Math.min(31, State.periodDays + parseInt(b.dataset.period,10)));
    $('#period-days').textContent = State.periodDays;
    refreshData();
  });

  // On resize just redraw the charts from cached data — no need to refetch.
  let rt; window.addEventListener('resize', ()=>{ clearTimeout(rt); rt=setTimeout(()=>{
    renderProjection(); renderToday(State.entries); renderActuals(State.entries); }, 200); });
}

(async function main(){
  if('serviceWorker' in navigator){
    // Auto-reload once when a *new* worker takes control (an update) — but not on
    // the very first install, where there was no prior controller.
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', ()=>{
      if(reloaded || !hadController) return;
      reloaded = true; location.reload();
    });
    window.addEventListener('load', ()=> navigator.serviceWorker.register('sw.js').catch(()=>{}));
  }
  wireEvents();
  await Store.init();
  if(Store.mode==='server'){
    try{ State.me = await Store.me(); enterApp(false); }   // existing session
    catch{ showAuth(); }
  }else{
    State.me = await Store.me();
    enterApp(false);
  }
})();
