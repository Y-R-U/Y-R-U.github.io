import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// The Vite "root" is app/ (source). The built static bundle is emitted INTO the
// cryodrift/ folder root (index.html + assets/) so GitHub Pages serves it directly
// at /gms/2d/cryodrift/ with no CI step. `emptyOutDir:false` keeps app/ source safe;
// scripts/clean.mjs removes stale hashed assets before each build.
//
// base:'./' makes all asset URLs relative, so the same bundle works at any path.
export default defineConfig({
  root: 'app',
  base: './',
  build: {
    outDir: resolve(import.meta.dirname, '.'),
    emptyOutDir: false,
    assetsDir: 'assets',
    target: 'es2020',
    sourcemap: false,
  },
  server: {
    host: true,
  },
});
