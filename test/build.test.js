// Checks the production build's asset URLs. Vite's base: '/boids/' makes the
// build only work when served from a /boids/ subpath (GitHub Pages project
// site); see "Asset base path" in docs/audit/BOIDS-V1-01.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';

const root = new URL('..', import.meta.url).pathname;

test('a fresh build matches the committed dist/', async (t) => {
  const outDir = mkdtempSync(join(tmpdir(), 'boids-build-'));
  t.after(() => rmSync(outDir, { recursive: true, force: true }));
  await build({ root, logLevel: 'silent', build: { outDir, emptyOutDir: true } });

  const html = readFileSync(join(outDir, 'index.html'), 'utf8');
  const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  const local = urls.filter((url) => !url.startsWith('https://'));

  // Bundled assets and root-relative images are rewritten under /boids/.
  assert.ok(local.some((url) => /^\/boids\/assets\/index-[\w-]+\.js$/.test(url)));
  assert.ok(local.some((url) => /^\/boids\/assets\/index-[\w-]+\.css$/.test(url)));
  assert.ok(local.includes('/boids/play.svg'));
  assert.ok(local.includes('/boids/pause.svg'));
  // Page-relative images are left alone and resolve against the page URL.
  assert.ok(local.includes('./playNext.svg'));
  assert.ok(local.includes('./options.svg'));
  assert.deepEqual(local.filter((url) => !url.startsWith('/boids/') && !url.startsWith('./')), []);

  // Third-party requests made by the page.
  const external = urls.filter((url) => url.startsWith('https://')).map((url) => new URL(url).host);
  assert.deepEqual([...new Set(external)].sort(), ['fonts.googleapis.com', 'fonts.gstatic.com']);

  const committed = readdirSync(join(root, 'dist', 'assets')).sort();
  assert.deepEqual(readdirSync(join(outDir, 'assets')).sort(), committed);
  assert.equal(html, readFileSync(join(root, 'dist', 'index.html'), 'utf8'));
});
