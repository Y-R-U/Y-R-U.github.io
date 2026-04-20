import * as store from './storage.js';

const EPUBJS_URL = 'https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js';
const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.min.mjs';
const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs';

let jszipLoaded = null;
function loadJSZip() {
  if (jszipLoaded) return jszipLoaded;
  jszipLoaded = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
    s.onload = () => resolve(window.JSZip);
    s.onerror = () => reject(new Error('jszip load failed'));
    document.head.appendChild(s);
  });
  return jszipLoaded;
}

let epubLoaded = null;
function loadEpub() {
  if (epubLoaded) return epubLoaded;
  epubLoaded = loadJSZip().then(() => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = EPUBJS_URL;
    s.onload = () => resolve(window.ePub);
    s.onerror = () => reject(new Error('epub.js load failed'));
    document.head.appendChild(s);
  }));
  return epubLoaded;
}

let pdfLoaded = null;
async function loadPdf() {
  if (pdfLoaded) return pdfLoaded;
  pdfLoaded = (async () => {
    const mod = await import(PDFJS_URL);
    mod.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    return mod;
  })();
  return pdfLoaded;
}

function cleanText(s) {
  return s.replace(/\s+/g, ' ').trim();
}

function stripHtml(html) {
  const el = document.createElement('div');
  el.innerHTML = html;
  return cleanText(el.textContent || '');
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function parseEpub(arrayBuffer) {
  const ePub = await loadEpub();
  const book = ePub(arrayBuffer);
  await book.ready;
  const md = book.package?.metadata || {};
  const title = md.title || 'Untitled';
  const author = md.creator || '';

  const navToc = (await book.loaded.navigation).toc || [];
  const tocByHref = new Map();
  const walk = (items, depth = 0) => {
    for (const it of items) {
      if (it.href) tocByHref.set(it.href.split('#')[0], { label: it.label, depth });
      if (it.subitems) walk(it.subitems, depth + 1);
    }
  };
  walk(navToc);

  const chapters = [];
  for (const item of book.spine.spineItems) {
    const href = (item.href || '').split('#')[0];
    const meta = tocByHref.get(href);
    const label = meta?.label?.trim() || `Section ${chapters.length + 1}`;
    try {
      const doc = await item.load(book.load.bind(book));
      const text = cleanText(doc.body?.textContent || doc.textContent || '');
      item.unload();
      if (text.length > 40) chapters.push({ title: label, text });
    } catch (_) {}
  }
  return { title, author, chapters };
}

async function parsePdfOutline(pdf) {
  try {
    const outline = await pdf.getOutline();
    if (!outline || !outline.length) return null;
    const flat = [];
    const walk = (items) => {
      for (const it of items) {
        flat.push(it);
        if (it.items?.length) walk(it.items);
      }
    };
    walk(outline);
    const entries = [];
    for (const it of flat) {
      try {
        let dest = it.dest;
        if (typeof dest === 'string') dest = await pdf.getDestination(dest);
        if (!dest) continue;
        const pageIndex = await pdf.getPageIndex(dest[0]);
        entries.push({ title: it.title || `Section ${entries.length + 1}`, page: pageIndex });
      } catch (_) {}
    }
    entries.sort((a, b) => a.page - b.page);
    return entries.length ? entries : null;
  } catch (_) { return null; }
}

async function extractPageText(pdf, pageNum) {
  const page = await pdf.getPage(pageNum);
  const c = await page.getTextContent();
  return cleanText(c.items.map((i) => i.str).join(' '));
}

async function parsePdf(arrayBuffer) {
  const pdfjs = await loadPdf();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const meta = await pdf.getMetadata().catch(() => ({ info: {} }));
  const title = meta?.info?.Title || 'Untitled PDF';
  const author = meta?.info?.Author || '';
  const numPages = pdf.numPages;

  const outline = await parsePdfOutline(pdf);
  const chapters = [];
  if (outline) {
    for (let i = 0; i < outline.length; i++) {
      const start = outline[i].page;
      const end = (i + 1 < outline.length ? outline[i + 1].page : numPages) - 1;
      const parts = [];
      for (let p = start; p <= end; p++) parts.push(await extractPageText(pdf, p + 1));
      const text = cleanText(parts.join(' '));
      if (text.length > 40) chapters.push({ title: outline[i].title, text });
    }
  } else {
    const chunk = 10;
    for (let start = 0; start < numPages; start += chunk) {
      const end = Math.min(start + chunk, numPages);
      const parts = [];
      for (let p = start; p < end; p++) parts.push(await extractPageText(pdf, p + 1));
      const text = cleanText(parts.join(' '));
      if (text.length > 40) chapters.push({ title: `Pages ${start + 1}–${end}`, text });
    }
  }
  return { title, author, chapters };
}

function parseTxt(text) {
  const cleaned = text.replace(/\r\n?/g, '\n');
  const parts = cleaned.split(/\n{3,}/).map((s) => s.trim()).filter((s) => s.length > 40);
  const chapters = parts.length > 1
    ? parts.map((text, i) => ({ title: `Section ${i + 1}`, text: cleanText(text) }))
    : [{ title: 'Full text', text: cleanText(cleaned) }];
  return { title: 'Text document', author: '', chapters };
}

export async function importFile(file) {
  const id = newId();
  const ext = file.name.toLowerCase().split('.').pop();
  let parsed;
  if (ext === 'epub') {
    parsed = await parseEpub(await file.arrayBuffer());
  } else if (ext === 'pdf') {
    parsed = await parsePdf(await file.arrayBuffer());
  } else if (ext === 'txt') {
    parsed = parseTxt(await file.text());
  } else {
    throw new Error(`Unsupported file type: .${ext}`);
  }
  if (!parsed.chapters.length) throw new Error('No readable text found in this file.');

  if (!parsed.title || parsed.title === 'Untitled' || parsed.title === 'Untitled PDF') {
    parsed.title = file.name.replace(/\.[^.]+$/, '');
  }

  await store.saveBookFile(id, file.name, file);

  const lastVoice = await store.getPref('lastVoice', 'af_heart');
  const meta = {
    id,
    title: parsed.title,
    author: parsed.author,
    format: ext,
    filename: file.name,
    chapters: parsed.chapters,
    voice: lastVoice,
    position: { chapter: 0, sentence: 0 },
    createdAt: Date.now(),
    lastOpened: Date.now(),
  };
  await store.putBook(meta);
  return meta;
}

// Sentence split for playback. Not perfect on abbreviations, but good enough.
export function splitSentences(text) {
  const out = [];
  const re = /[^.!?…]+[.!?…]+["'”’)\]]*\s*|[^.!?…]+$/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const s = m[0].trim();
    if (s.length >= 2) out.push(s);
  }
  // Merge very short fragments into previous.
  const merged = [];
  for (const s of out) {
    if (merged.length && s.length < 15) merged[merged.length - 1] += ' ' + s;
    else merged.push(s);
  }
  return merged;
}
