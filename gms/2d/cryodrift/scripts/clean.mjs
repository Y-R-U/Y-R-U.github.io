// Remove stale built artifacts before a fresh build, so old hashed assets don't
// pile up at the project root (which is also the deployed GitHub Pages path).
import { rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
rmSync(resolve(root, 'assets'), { recursive: true, force: true });
rmSync(resolve(root, 'index.html'), { force: true });
console.log('[clean] removed previous build output (assets/, index.html)');
