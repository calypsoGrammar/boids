// Checks the production build's asset URLs. The default base, '/boids/',
// makes the build work only when served from /boids/ (the GitHub Pages
// project site); BASE_PATH=/ builds for the root of a host, such as a custom
// domain. See docs/release.md and "Asset base path" in
// docs/audit/BOIDS-V1-01.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { basePath } from '../vite.config.js';

const root = new URL('..', import.meta.url).pathname;

async function buildTo(t, base)
{
  const outDir = mkdtempSync(join(tmpdir(), 'boids-build-'));
  t.after(() => rmSync(outDir, { recursive: true, force: true }));
  await build({ root, base, logLevel: 'silent', build: { outDir, emptyOutDir: true } });
  return outDir;
}

// Every local URL in index.html is under `base` and names a file of the
// build, so nothing depends on where the page sits relative to the host root.
function checkUrls(outDir, base)
{
  const html = readFileSync(join(outDir, 'index.html'), 'utf8');
  const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  const local = urls.filter((url) => !url.startsWith('https://'));
  assert.deepEqual(local.filter((url) => !url.startsWith(base)), []);
  const files = local.map((url) => url.slice(base.length));
  assert.deepEqual(files.filter((file) => !existsSync(join(outDir, file))), []);
  assert.ok(files.some((file) => /^assets\/index-[\w-]+\.js$/.test(file)));
  assert.ok(files.some((file) => /^assets\/index-[\w-]+\.css$/.test(file)));
  assert.ok(files.some((file) => /^assets\/favicon-[\w-]+\.ico$/.test(file)));
  for(const icon of ['play.svg', 'pause.svg', 'playNext.svg', 'options.svg'])
    assert.ok(files.includes(icon), icon);

  // Third-party requests made by the page.
  const external = urls.filter((url) => url.startsWith('https://')).map((url) => new URL(url).host);
  assert.deepEqual([...new Set(external)].sort(), ['fonts.googleapis.com', 'fonts.gstatic.com']);
  return html;
}

test('BASE_PATH picks the base, and defaults to the project site path', () => {
  assert.equal(basePath(), '/boids/');
  assert.equal(basePath('/'), '/');
  assert.equal(basePath('/boids/'), '/boids/');
  for(const bad of ['', 'boids', '/boids', './', 'https://example.com/', '/a b/'])
    assert.throws(() => basePath(bad), /BASE_PATH/, JSON.stringify(bad));
});

test('a fresh build matches the committed dist/', async (t) => {
  const outDir = await buildTo(t);
  const html = checkUrls(outDir, '/boids/');

  const committed = readdirSync(join(root, 'dist', 'assets')).sort();
  assert.deepEqual(readdirSync(join(outDir, 'assets')).sort(), committed);
  assert.equal(html, readFileSync(join(root, 'dist', 'index.html'), 'utf8'));
});

// The same bundle, with every URL moved from /boids/ to the host root.
test('a root build (BASE_PATH=/) differs from dist/ only in the base', async (t) => {
  const outDir = await buildTo(t, '/');
  const html = checkUrls(outDir, '/');
  assert.deepEqual(readdirSync(join(outDir, 'assets')).sort(), readdirSync(join(root, 'dist', 'assets')).sort());
  const committed = readFileSync(join(root, 'dist', 'index.html'), 'utf8');
  assert.equal(html, committed.replaceAll('"/boids/', '"/'));
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
