// ============================================================
// Idle Transport Empire - Utility Functions
// ============================================================

function fmtMoney(n) {
    if (n < 0) return '-' + fmtMoney(-n);
    if (n < 1e3) return '$' + n.toFixed(n < 10 ? 2 : 0);
    const suf = ['','K','M','B','T','Qa','Qi','Sx','Sp','Oc','No','Dc'];
    const tier = Math.floor(Math.log10(Math.abs(n)) / 3);
    if (tier >= suf.length) return '$' + n.toExponential(2);
    const s = suf[tier];
    const sc = n / Math.pow(10, tier * 3);
    return '$' + sc.toFixed(sc < 10 ? 2 : (sc < 100 ? 1 : 0)) + s;
}

function fmtNum(n) {
    if (n < 1e3) return Math.floor(n).toString();
    return fmtMoney(n).replace('$', '');
}

function fmtTime(s) {
    if (s < 60) return Math.ceil(s) + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm ' + Math.ceil(s % 60) + 's';
    return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
}

function showToast(msg, type) {
    const c = document.getElementById('toasts');
    const t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 2500);
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// Lerp for smooth camera moves
function lerp(a, b, t) { return a + (b - a) * t; }

// Clamp
function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }
