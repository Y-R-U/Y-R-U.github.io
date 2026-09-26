const $ = id => document.getElementById(id);
const host = location.hostname;
const isLocal = /^(localhost|127\.0\.0\.1)$/.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.endsWith('.local');
const apiRoot = `http://${host}:8890`;
let token = '', sessions = [], schedules = [], selectedId = '', editingId = null, busy = false;
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date = timestamp => new Date(timestamp * 1000).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const duration = seconds => `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
function message(text, error = false) { $('message').textContent = text; $('message').classList.toggle('error', error); }
async function api(path, body) {
  const response = await fetch(apiRoot + path, {cache:'no-store', signal:AbortSignal.timeout(25000), ...(body ? {method:'POST',headers:{'Content-Type':'application/json','X-YRU-Token':token},body:JSON.stringify(body)} : {})});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
function readForm() {
  return {session_id:selectedId, delay_seconds:Number($('delay-hours').value)*3600+Number($('delay-minutes').value)*60,
    first_prompt:$('first-prompt').value, interval_seconds:Number($('repeat-hours').value)*3600+Number($('repeat-minutes').value)*60,
    repeat_count:$('repeat').checked ? Number($('repeat-count').value) : 0, repeat_prompt:$('repeat-prompt').value};
}
function summary() {
  const b = readForm();
  $('repeat-fields').hidden = !$('repeat').checked;
  $('repeat-fields').querySelectorAll('input').forEach(input => input.disabled = !$('repeat').checked);
  $('summary').textContent = `First in ${duration(b.delay_seconds)}${b.repeat_count ? `, then every ${duration(b.interval_seconds)} × ${b.repeat_count} more` : ''}. ${1 + b.repeat_count} total ${b.repeat_count ? 'prompts' : 'prompt'}.`;
  $('save').disabled = !selectedId || !token || busy || !sessions.some(s => s.id === selectedId);
}
function renderSessions() {
  $('sessions').innerHTML = sessions.length ? sessions.map(s => `<button type="button" class="session ${s.id === selectedId ? 'selected' : ''}" data-session="${escapeHTML(s.id)}" aria-pressed="${s.id === selectedId}"><strong>${escapeHTML(s.name)}</strong><small>Window ${s.window} · Tab ${s.tab} · Pane ${s.pane} · ${escapeHTML(s.tty)}${s.at_shell ? ' · Shell prompt' : ''}</small></button>`).join('') : '<p class="hint">No sessions found. Open iTerm2 on the Mac, then refresh.</p>';
  const selected = sessions.find(s => s.id === selectedId);
  $('selected').textContent = selected ? `${selected.name} · W${selected.window} / T${selected.tab} / P${selected.pane}` : selectedId ? 'Session closed — choose another pane' : 'No session selected';
  summary();
}
function renderState(data) {
  token = data.token; schedules = data.schedules;
  $('connection').textContent = '● Scheduler online'; $('connection').classList.add('live'); $('offline').hidden = true;
  $('schedules').innerHTML = schedules.length ? schedules.map(s => `<article class="schedule"><div class="status ${escapeHTML(s.status)}">${escapeHTML(s.status)}</div><h3>${escapeHTML(s.session_name)}</h3><p>${s.status === 'completed' ? 'Finished' : `Next${s.status === 'paused' ? ' (paused)' : ''}: ${date(s.next_at)}`} · ${s.sent_count}/${1+s.repeat_count} sent</p><p class="hint">${s.repeat_count ? `Repeats every ${duration(s.interval_seconds)}.` : 'One reminder.'} First: “${escapeHTML(s.first_prompt)}”${s.repeat_count ? ` · Repeat: “${escapeHTML(s.repeat_prompt)}”` : ''}</p>${s.error ? `<p class="error">${escapeHTML(s.error)}</p>` : ''}<div class="actions">${s.status === 'active' ? `<button data-action="pause" data-id="${s.id}">Pause</button>` : s.status === 'paused' ? `<button data-action="resume" data-id="${s.id}">Resume</button>` : ''}<button data-action="edit" data-id="${s.id}" ${s.status === 'sending' ? 'disabled' : ''}>Edit</button><button class="danger" data-action="delete" data-id="${s.id}" ${s.status === 'sending' ? 'disabled' : ''}>${s.status === 'completed' ? 'Remove' : 'Cancel'}</button></div></article>`).join('') : '<p class="muted">No reminders yet. Choose a session and set your first nudge.</p>';
  $('history').innerHTML = data.history.length ? data.history.slice(0,20).map(h=>`<div class="history-item"><span class="${h.outcome === 'paused' ? 'error' : 'muted'}">${date(h.at)} · ${escapeHTML(h.outcome)}</span><p>${escapeHTML(h.detail)}</p></div>`).join('') : '<p class="hint">Your delivered prompts and any issues will appear here.</p>';
  summary();
}
async function refresh(all = false) {
  if (!isLocal) return;
  try { renderState(await api('/api/state')); }
  catch (error) { token = ''; $('connection').textContent = 'Scheduler offline'; $('connection').classList.remove('live'); $('offline').hidden = false; summary(); return; }
  if (all) {
    $('refresh').disabled = true;
    try { sessions = (await api('/api/sessions')).sessions; renderSessions(); if ($('message').classList.contains('error')) message('Sessions refreshed.'); }
    catch (error) { message(error.message, true); }
    finally { $('refresh').disabled = false; }
  }
}
$('sessions').addEventListener('click', event => {
  const button = event.target.closest('[data-session]'); if (!button) return;
  selectedId = button.dataset.session; $('screen').textContent = 'Load the current screen for this session.'; renderSessions();
  if (matchMedia('(max-width:700px)').matches) $('form-title').scrollIntoView({behavior:'smooth', block:'start'});
});
$('schedule-form').addEventListener('input', summary);
$('schedule-form').addEventListener('submit', async event => {
  event.preventDefault(); const body = readForm();
  if (body.delay_seconds < 60 || (body.repeat_count && body.interval_seconds < 60)) return message('Choose a delay and repeat interval of at least one minute.', true);
  if (!body.repeat_count) { body.interval_seconds = 18120; body.repeat_prompt = body.first_prompt; }
  if (editingId) body.id = editingId;
  busy = true; summary();
  try { await api('/api/schedules', body); message(editingId ? 'Reminder updated. Timing and delivery count restarted.' : 'Reminder created. You can close this page.'); cancelEdit(); await refresh(); }
  catch (error) { message(error.message, true); }
  finally { busy = false; summary(); }
});
function cancelEdit() { editingId = null; $('form-title').textContent = '2. Schedule a reminder'; $('save').textContent = 'Create reminder'; $('cancel-edit').hidden = true; }
$('cancel-edit').onclick = cancelEdit;
$('schedules').addEventListener('click', async event => {
  const button = event.target.closest('[data-action]'); if (!button) return;
  const {id, action} = button.dataset;
  if (action === 'edit') {
    const s = schedules.find(s => s.id === id); if (!s) return;
    editingId = id; selectedId = s.session_id;
    for (const [prefix, seconds] of [['delay', s.delay_seconds], ['repeat', s.interval_seconds]]) {
      $(prefix+'-hours').value = Math.floor(seconds / 3600); $(prefix+'-minutes').value = Math.floor(seconds % 3600 / 60);
    }
    $('first-prompt').value = s.first_prompt; $('repeat-prompt').value = s.repeat_prompt; $('repeat').checked = s.repeat_count > 0; $('repeat-count').value = s.repeat_count || 3;
    $('form-title').textContent = 'Edit reminder'; $('save').textContent = 'Save & restart timing'; $('cancel-edit').hidden = false;
    renderSessions(); $('form-title').scrollIntoView({behavior:'smooth',block:'start'}); return;
  }
  button.disabled = true;
  try { await api('/api/action', {id,action}); if (id === editingId && action === 'delete') cancelEdit(); message(action === 'resume' ? 'Resumed. An overdue reminder will wait at least one minute.' : action === 'pause' ? 'Reminder paused.' : 'Reminder removed.'); await refresh(); }
  catch (error) { message(error.message, true); button.disabled = false; }
});
$('refresh').onclick = () => refresh(true);
$('preview').onclick = async () => {
  if (!selectedId) return message('Choose a session first.', true);
  const id = selectedId; $('preview').disabled = true;
  try { const data = await api('/api/preview?session_id='+encodeURIComponent(id)); if (id === selectedId) $('screen').textContent = data.text || '(Screen is empty)'; }
  catch (error) { message(error.message, true); }
  finally { $('preview').disabled = false; }
};
summary();
if (isLocal) { refresh(true); setInterval(() => { if (!document.hidden) refresh(); }, 10000); }
else { $('connection').textContent = 'Home network only'; $('sessions').textContent = 'Open this page from your local YRU server on port 8888.'; $('schedules').textContent = ''; $('refresh').disabled = true; message('Use your Mac’s local network address on your phone, or localhost:8888 on the Mac.'); }
