let _idCounter = 0;

export function generateId(prefix = 'n') {
  return `${prefix}_${Date.now()}_${_idCounter++}`;
}

export function formatShortDate(timestamp) {
  const d = new Date(timestamp);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  if (isToday) {
    const h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'p' : 'a';
    const h12 = h % 12 || 12;
    return `${h12}:${m}${ampm}`;
  }

  const sameYear = d.getFullYear() === now.getFullYear();
  if (sameYear) {
    return `${months[d.getMonth()]} ${d.getDate()}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}

export function debounce(fn, ms) {
  let timer;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  debounced.cancel = () => clearTimeout(timer);
  debounced.flush = (...args) => {
    clearTimeout(timer);
    fn(...args);
  };
  return debounced;
}

export function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
}
