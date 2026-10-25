// Checks the production build's asset URLs. Vite's base: '/boids/' makes the
// build only work when served from a /boids/ subpath (GitHub Pages project
// site); see "Asset base path" in docs/audit/BOIDS-V1-01.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
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

// .gitignore lists dist, so a rebuilt asset is only committed with git add -f.
// Without this check a commit can point dist/index.html at a bundle that is on
// disk but not in git, and the deployed page loads no script or stylesheet.
test('every file in dist/ is tracked by git', (t) => {
  if(!existsSync(join(root, '.git'))) return t.skip('not a git checkout');
  const tracked = execFileSync('git', ['ls-files', '--', 'dist'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  const onDisk = readdirSync(join(root, 'dist'), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(root.length));
  assert.deepEqual(onDisk.filter((path) => !tracked.includes(path)).sort(), []);
  assert.deepEqual(tracked.filter((path) => !onDisk.includes(path)).sort(), []);
});
