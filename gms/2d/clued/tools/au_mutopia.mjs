#!/usr/bin/env node
// Search the Mutopia Project:  node tools/au_mutopia.mjs "term" ["term2" ...]  → candidates with licence + .mid url
export async function search(term) {
  const html = await (await fetch('https://www.mutopiaproject.org/cgibin/make-table.cgi?searchingfor=' + encodeURIComponent(term))).text();
  const out = [];
  for (const blk of html.split('<table class="table-bordered result-table">').slice(1)) {
    const tds = [...blk.matchAll(/<td>(.*?)<\/td>/gs)].map((m) => m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, '').trim());
    const mid = blk.match(/href="([^"]+\.(?:mid|zip))"/)?.[1];
    const id = blk.match(/piece-info\.cgi\?id=(\d+)/)?.[1];
    out.push({ title: tds[0], composer: tds[1], opus: tds[2], instrument: tds[4], date: tds[5], arranger: tds[7], source: tds[8], license: tds[9], id, mid });
  }
  return out;
}
import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const t of process.argv.slice(2)) {
    console.log('## ' + t);
    for (const r of await search(t)) console.log(`  ${r.id}  ${r.title} | ${r.composer} | ${r.instrument} | ${r.license} | ${r.arranger || ''} | ${r.mid?.split('/ftp/')[1] || '-'}`);
  }
}
