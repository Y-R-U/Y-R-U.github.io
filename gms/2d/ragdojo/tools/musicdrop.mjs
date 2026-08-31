#!/usr/bin/env node
/**
 * Local drop box for Suno audio. The browser tab fetches each clip with its own session
 * credentials and POSTs the bytes here, so no signed URL ever leaves the page.
 *   node tools/musicdrop.mjs   ->  writes assets/audio/raw/<name>.mp3
 */
import { createServer } from 'node:http';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'audio', 'raw');
mkdirSync(OUT, { recursive: true });

// Access-Control-Allow-Private-Network is the one that matters: Chrome's Private Network
// Access check blocks a public HTTPS page from reaching 127.0.0.1 without it, and the
// failure is silent from the page's side.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': '*',
  'access-control-allow-private-network': 'true',
  'access-control-max-age': '86400',
};

createServer(async (req, res) => {
  console.log(`${req.method} ${req.url}`);
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS).end(); return; }
  if (req.method !== 'POST') { res.writeHead(405, CORS).end(); return; }
  const name = (new URLSearchParams(req.url.split('?')[1] || '').get('f') || 'out.mp3')
    .replace(/[^\w.\-]/g, '_');
  const chunks = [];
  for await (const ch of req) chunks.push(ch);
  const buf = Buffer.concat(chunks);
  writeFileSync(join(OUT, name), buf);
  console.log(`${name}  ${(buf.length / 1024).toFixed(0)} KB`);
  res.writeHead(200, { ...CORS, 'content-type': 'text/plain' }).end('ok');
}).listen(8777, '127.0.0.1', () => console.log('drop box on http://127.0.0.1:8777'));
