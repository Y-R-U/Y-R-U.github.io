// ============================================================
// Transport Empire - Utility Functions
// ============================================================

function formatMoney(n) {
    if (n < 0) return '-' + formatMoney(-n);
    if (n < 1e3) return '$' + n.toFixed(n < 10 ? 2 : 0);
    const suffixes = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
    const tier = Math.floor(Math.log10(Math.abs(n)) / 3);
    if (tier >= suffixes.length) return '$' + n.toExponential(2);
    const s = suffixes[tier];
    const scale = Math.pow(10, tier * 3);
    const scaled = n / scale;
    return '$' + scaled.toFixed(scaled < 10 ? 2 : (scaled < 100 ? 1 : 0)) + s;
}

function formatNum(n) {
    if (n < 1e3) return Math.floor(n).toString();
    return formatMoney(n).replace('$', '');
}

function formatTime(s) {
    if (s < 60) return Math.ceil(s) + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm ' + Math.ceil(s % 60) + 's';
    return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
}

function showToast(msg, type) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast ' + (type || '');
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.transition = 'opacity 0.3s';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}
