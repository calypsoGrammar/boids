// Release smoke test for CAL-1290 (BOIDS-V1-09), offline: the committed dist/
// served under /boids/ (the GitHub Pages project site) and a BASE_PATH=/
// build served at the host root (an eventual custom domain), each opened in
// headless Chromium (Playwright). Every same-origin request must succeed: the
// favicon, script, stylesheet and icons. Requests to other hosts (the web
// fonts) are aborted, so the page must work without them. The core controls
// are then driven by real clicks. The live sites are checked by hand with
// the checklist in docs/release.md. Skipped when Playwright is not installed,
// as on the GitHub runners; test/build.test.js checks the URLs there.
//
// The callbacks passed to page.evaluate and $eval run in the page.
/* global document, getComputedStyle */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { build } from 'vite';

const PLAYWRIGHT = '/usr/local/lib/node_modules/playwright/index.mjs';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/usr/local/share/ms-playwright';
const playwright = existsSync(PLAYWRIGHT) ? await import(PLAYWRIGHT).catch(() => null) : null;
const skip = playwright === null && 'Playwright is not installed';

const ORIGIN = 'http://boids.test';
const root = new URL('..', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

let browser;
let rootBuild;
before(async () => {
  if(skip) return;
  rootBuild = mkdtempSync(join(tmpdir(), 'boids-root-'));
  await build({ root, base: '/', logLevel: 'silent', build: { outDir: rootBuild, emptyOutDir: true } });
  browser = await playwright.chromium.launch();
});
after(async () => {
  await browser?.close();
  if(rootBuild) rmSync(rootBuild, { recursive: true, force: true });
});

// Serves `dir` at `base` on ORIGIN, like a static host: a directory URL gets
// its index.html, anything else missing is a 404.
async function open(t, { dir, base, contextOptions = {} })
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...contextOptions });
  t.after(() => context.close());
  const external = new Set();
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if(url.origin !== ORIGIN) { external.add(url.host); return route.abort(); }
    if(!url.pathname.startsWith(base)) return route.fulfill({ status: 404 });
    let path = url.pathname.slice(base.length);
    if(path === '' || path.endsWith('/')) path += 'index.html';
    const file = join(dir, path);
    if(!existsSync(file)) return route.fulfill({ status: 404 });
    return route.fulfill({ body: readFileSync(file), contentType: TYPES[extname(path)] });
  });
  const page = await context.newPage();
  const errors = [];
  const failed = [];
  page.on('pageerror', (error) => errors.push(error));
  page.on('response', (response) => { if(response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
  await page.goto(ORIGIN + base, { waitUntil: 'load' });
  return { page, errors, failed, external };
}

// The canvas pixels, to tell whether a frame drew boids and whether the next
// one moved them.
const pixels = (page) => page.$eval('#gameCanvas', (canvas) => {
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let inked = 0;
  let hash = 0;
  for(let i = 0; i < data.length; i += 4)
  {
    if(data[i + 3] !== 0) inked++;
    hash = (hash * 31 + data[i] + data[i + 1] * 3 + data[i + 2] * 7 + data[i + 3] * 11) | 0;
  }
  return { inked, hash };
});

const setRange = (page, id, value) => page.$eval(`#${id}`, (range, v) => {
  range.value = String(v);
  range.dispatchEvent(new Event('input', { bubbles: true }));
  range.dispatchEvent(new Event('change', { bubbles: true }));
}, value);

const sites = [
  { name: 'project site /boids/ (committed dist/)', dir: () => join(root, 'dist'), base: '/boids/' },
  { name: 'host root / (BASE_PATH=/ build)', dir: () => rootBuild, base: '/' },
];

for(const site of sites)
{
  const load = (t, options) => open(t, { dir: site.dir(), base: site.base, ...options });

  test(`${site.name}: the favicon, script, stylesheet and icons all load`, { skip }, async (t) => {
    const { page, errors, failed, external } = await load(t);
    assert.deepEqual(failed, []);
    assert.deepEqual(errors, []);
    // Only the web fonts come from elsewhere, and the page works without them.
    assert.deepEqual([...external].sort(), ['fonts.googleapis.com']);

    const icon = await page.$eval('link[rel=icon]', async (link) => [link.href, (await fetch(link.href)).status]);
    assert.match(icon[0], new RegExp(`^${ORIGIN}${site.base}assets/favicon-[\\w-]+\\.ico$`));
    assert.equal(icon[1], 200);

    const images = await page.$$eval('img', (imgs) => imgs.map((img) => [img.id, img.src, img.complete && img.naturalWidth > 0]));
    assert.deepEqual(images.map(([id]) => id), ['playIcon', 'pauseIcon', 'nextIcon', 'optionsIcon']);
    for(const [id, src, loaded] of images)
    {
      assert.ok(src.startsWith(ORIGIN + site.base), `${id}: ${src}`);
      assert.ok(loaded, `${id} loaded`);
    }

    // The stylesheet applied: the light palette and the fixed canvas container.
    const styles = await page.evaluate(() => [
      getComputedStyle(document.body).backgroundColor,
      getComputedStyle(document.getElementById('gameContainer')).position,
    ]);
    assert.deepEqual(styles, ['rgb(250, 250, 250)', 'fixed']);
    // The script ran and drew the default flock.
    assert.ok((await pixels(page)).inked > 0, 'the flock is drawn');
  });

  test(`${site.name}: play, pause, step, settings and Generate work`, { skip }, async (t) => {
    const { page, errors } = await load(t);
    const before = await pixels(page);
    await page.click('#nextButton');
    const stepped = await pixels(page);
    assert.notEqual(stepped.hash, before.hash, 'Step moves the flock');

    await page.click('#IS_PAUSED');
    assert.ok(await page.isVisible('#IS_PLAYING'), 'playing');
    await page.waitForFunction((hash) => {
      const canvas = document.getElementById('gameCanvas');
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let h = 0;
      for(let i = 0; i < data.length; i += 4) h = (h * 31 + data[i] + data[i + 1] * 3 + data[i + 2] * 7 + data[i + 3] * 11) | 0;
      return h !== hash;
    }, stepped.hash);
    await page.click('#IS_PLAYING');
    assert.ok(await page.isVisible('#IS_PAUSED'), 'paused');
    const paused = await pixels(page);
    assert.equal((await pixels(page)).hash, paused.hash, 'a paused flock stays put');

    // Settings: shape, the largest flock, the most species and variance.
    await page.click('#optionsButton');
    assert.ok(await page.isVisible('#settingsMenu'));
    await page.check('#flockSizeShapeLine');
    await page.click('#nextButton');
    assert.notEqual((await pixels(page)).inked, paused.inked, 'the next frame draws lines, not circles');
    await setRange(page, 'flockSizeRange', 200);
    await setRange(page, 'flockRangeTribes', 10);
    await setRange(page, 'flockRangeVariance', 100);
    assert.ok(await page.isVisible('#generatePending'));
    await page.click('#generateButton');
    assert.ok(!(await page.isVisible('#generatePending')), 'Generate applied the settings');
    assert.equal(await page.textContent('#flockSizeInput'), '200');
    assert.ok((await pixels(page)).inked > 0, 'the new flock is drawn');
    await page.click('#settingsClose');
    assert.ok(!(await page.isVisible('#settingsMenu')));
    assert.deepEqual(errors, []);
  });

  test(`${site.name}: loads and plays on a touch phone`, { skip }, async (t) => {
    const { page, errors, failed } = await load(t, {
      contextOptions: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    });
    assert.deepEqual(failed, []);
    await page.tap('#IS_PAUSED');
    assert.ok(await page.isVisible('#IS_PLAYING'));
    await page.tap('#IS_PLAYING');
    await page.tap('#optionsButton');
    assert.ok(await page.isVisible('#settingsMenu'));
    assert.deepEqual(errors, []);
  });
}

// Why the two destinations need separate builds: the /boids/ build at a host
// root asks for /boids/… URLs that do not exist there.
test('the /boids/ build served at the host root loses its assets', { skip }, async (t) => {
  const { page, failed } = await open(t, { dir: join(root, 'dist'), base: '/' });
  assert.ok(failed.some((line) => /^404 .*\/boids\/assets\/index-[\w-]+\.js$/.test(line)), failed.join('\n'));
  assert.ok(failed.some((line) => /^404 .*\/boids\/assets\/index-[\w-]+\.css$/.test(line)));
  // The canvas keeps its 300 px default: no script ran to size it.
  assert.equal(await page.evaluate(() => document.getElementById('gameCanvas').width), 300, 'no script ran');
});
