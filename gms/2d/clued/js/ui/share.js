import { toast } from './popup.js?v=202610050144';

export async function shareText(text, title = 'Clued') {
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ title, text }); return 'shared'; }
  } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
  try { await navigator.clipboard.writeText(text); toast('Copied! Paste it anywhere.'); return 'copied'; } catch (e) {}
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.append(ta); ta.select();
  try { document.execCommand('copy'); toast('Copied! Paste it anywhere.'); } catch (e) { toast("Couldn't copy"); }
  ta.remove();
  return 'copied';
}
