// Real layout for CAL-1289 (BOIDS-V1-08): the committed build in headless
// Chromium (Playwright), measured at the viewports test/ui.test.js uses.
// jsdom does no layout, so this is where sizes, overlap, scrolling and the
// focus and reduced-motion styles are checked. The page is served under
// /boids/ from dist/ through request routing; requests to other hosts (the
// web fonts) are aborted, so no network is needed. Skipped when Playwright is
// not installed.
//
// The callbacks passed to page.evaluate and $eval run in the page.
/* global window, document, getComputedStyle */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';

const PLAYWRIGHT = '/usr/local/lib/node_modules/playwright/index.mjs';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/usr/local/share/ms-playwright';
const playwright = existsSync(PLAYWRIGHT) ? await import(PLAYWRIGHT).catch(() => null) : null;
const skip = playwright === null && 'Playwright is not installed';

const ORIGIN = 'http://boids.test';
const dist = new URL('../dist/', import.meta.url);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const VIEWPORTS = [
  [320, 568], [375, 667], [390, 844], [667, 375], [844, 390],
  [768, 1024], [1024, 768], [1280, 720], [1920, 1080],
];
const portrait = (width, height) => height > width;
const shortLandscape = (width, height) => width > height && height <= 520;

let browser;
before(async () => { if(!skip) browser = await playwright.chromium.launch(); });
after(async () => { await browser?.close(); });

async function open(t, width, height, options = {})
{
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, ...options });
  t.after(() => context.close());
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if(url.origin !== ORIGIN || !url.pathname.startsWith('/boids/')) return route.abort();
    const path = url.pathname.slice('/boids/'.length) || 'index.html';
    const file = new URL(path, dist);
    if(!existsSync(file)) return route.fulfill({ status: 404 });
    return route.fulfill({ body: readFileSync(file), contentType: TYPES[extname(path)] });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error));
  await page.goto(ORIGIN + '/boids/');
  await page.waitForFunction(() => document.getElementById('gameCanvas').width > 0);
  t.after(() => assert.deepEqual(errors, []));
  return page;
}

const box = (page, selector) => page.locator(selector).boundingBox();
const inside = (inner, outer, slack = 0.5) =>
  inner.x >= outer.x - slack && inner.y >= outer.y - slack
  && inner.x + inner.width <= outer.x + outer.width + slack
  && inner.y + inner.height <= outer.y + outer.height + slack;
const overlap = (a, b) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

for(const [width, height] of VIEWPORTS)
{
  const size = `${width} × ${height}`;
  const viewport = { x: 0, y: 0, width, height };

  test(`${size}: the canvas fills the window and the page does not scroll`, { skip }, async (t) => {
    const page = await open(t, width, height);
    assert.deepEqual(await box(page, '#gameCanvas'), viewport);
    const canvas = await page.$eval('#gameCanvas', (c) => [c.width, c.height]);
    assert.deepEqual(canvas, [width * 2, height * 2], 'DPR 2 backing store');
    const scroll = await page.evaluate(() => {
      const root = document.scrollingElement;
      return [root.scrollWidth - root.clientWidth, root.scrollHeight - root.clientHeight];
    });
    assert.deepEqual(scroll, [0, 0]);
    await page.click('#optionsButton');
    const after = await page.evaluate(() => [document.scrollingElement.scrollWidth, document.scrollingElement.scrollHeight]);
    assert.deepEqual(after, [width, height], 'the open settings do not make the page scroll');
  });

  test(`${size}: the toolbar and the open settings fit the window and leave the flock in view`, { skip }, async (t) => {
    const page = await open(t, width, height);
    await page.click('#optionsButton');
    const toolbar = await box(page, '#toolbar');
    const panel = await box(page, '#settingsMenu');
    assert.ok(inside(toolbar, viewport), 'toolbar inside the window');
    assert.ok(inside(panel, viewport), 'settings inside the window');
    assert.ok(!overlap(toolbar, panel), 'toolbar and settings do not overlap');
    if(portrait(width, height))
    {
      // A bottom sheet: the band above it shows the flock.
      assert.ok(panel.y >= 0.35 * height, `${Math.round(panel.y)} px of ${height} px left uncovered`);
    }
    else if(shortLandscape(width, height))
    {
      // A column on the right: the flock shows to its left.
      assert.ok(panel.x >= 0.35 * width, `${Math.round(panel.x)} px of ${width} px left uncovered`);
    }
    else
    {
      const uncovered = width * height - panel.width * panel.height;
      assert.ok(uncovered >= 0.35 * width * height, 'at least 35 % of the flock stays in view');
    }
  });

  test(`${size}: every button, slider and toggle is at least 44 × 44 px`, { skip }, async (t) => {
    const page = await open(t, width, height);
    await page.click('#optionsButton');
    const small = await page.$$eval('.tool, input[type=range], .choice', (elements) => elements
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({ id: el.id || el.textContent.trim(), rect: el.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width < 44 || rect.height < 44)
      .map(({ id, rect }) => `${id}: ${rect.width} × ${rect.height}`));
    assert.deepEqual(small, []);
    const generate = await box(page, '#generateButton');
    assert.ok(generate.width >= 44 && generate.height >= 44);
  });

  test(`${size}: the settings scroll on their own and Generate stays reachable`, { skip }, async (t) => {
    const page = await open(t, width, height);
    await page.click('#optionsButton');
    const panel = page.locator('#settingsMenu');
    const [scrollHeight, clientHeight] = await panel.evaluate((el) => [el.scrollHeight, el.clientHeight]);
    if(scrollHeight > clientHeight)
    {
      const rect = await panel.boundingBox();
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
      await page.mouse.wheel(0, 10000);
      await page.waitForFunction(() => document.getElementById('settingsMenu').scrollTop > 0);
      const scrolled = await page.evaluate(() => [window.scrollX, window.scrollY, document.scrollingElement.scrollTop]);
      assert.deepEqual(scrolled, [0, 0, 0], 'the page stays put');
      const end = await panel.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop);
      assert.ok(end <= 1, 'the panel scrolls to its end');
    }
    // Generate is in view inside the panel before and after scrolling, and a
    // real click reaches it (Playwright checks that nothing covers it).
    const generate = await box(page, '#generateButton');
    assert.ok(inside(generate, await panel.boundingBox()) && inside(generate, viewport));
    await page.$eval('#flockSizeRange', (range) => { range.value = '20'; range.dispatchEvent(new Event('change')); });
    assert.ok(await page.isVisible('#generatePending'));
    await page.click('#generateButton');
    assert.ok(!(await page.isVisible('#generatePending')), 'Generate applied the flock size');
  });

  test(`${size}: no setting row is wider than its group`, { skip }, async (t) => {
    const page = await open(t, width, height);
    await page.click('#optionsButton');
    const wide = await page.$$eval('.setting-head, .setting, .choice', (elements) => elements.map((el) => {
      const group = el.closest('.settings-group').getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      return { el: el.textContent.trim().split(/\s+/).slice(0, 3).join(' '), over: Math.max(rect.right - group.right, group.left - rect.left, el.scrollWidth - el.clientWidth) };
    }).filter(({ over }) => over > 0.5));
    assert.deepEqual(wide, []);
    const panel = await page.$eval('#settingsMenu', (el) => el.scrollWidth - el.clientWidth);
    assert.equal(panel, 0, 'the settings never scroll sideways');
  });

  test(`${size}: keyboard focus shows a ring and a tooltip inside the window`, { skip }, async (t) => {
    const page = await open(t, width, height);
    for(const id of ['IS_PAUSED', 'nextButton', 'optionsButton'])
    {
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), id);
      const tooltip = page.locator(`#${id} .tooltip`);
      await page.waitForFunction((el) => getComputedStyle(el).opacity === '1', await tooltip.elementHandle());
      assert.ok(inside(await tooltip.boundingBox(), viewport), `${id} tooltip inside the window`);
      const outline = await page.$eval(`#${id}`, (el) => getComputedStyle(el).outlineStyle);
      assert.equal(outline, 'solid');
    }
  });
}

test('the toolbar buttons shrink when pressed, unless reduced motion is set', { skip }, async (t) => {
  const pressed = async (reducedMotion) => {
    const page = await open(t, 1280, 720, { reducedMotion });
    const rect = await box(page, '#nextButton');
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    const transform = await page.$eval('#nextButton', (el) => getComputedStyle(el).transform);
    await page.mouse.up();
    return transform;
  };
  assert.equal(await pressed('no-preference'), 'matrix(0.95, 0, 0, 0.95, 0, 0)');
  assert.equal(await pressed('reduce'), 'none');
});

test('reduced motion turns the tooltip fade off', { skip }, async (t) => {
  const page = await open(t, 1280, 720, { reducedMotion: 'reduce' });
  const transition = await page.$eval('#nextButton .tooltip', (el) => getComputedStyle(el).transitionDuration);
  assert.equal(transition, '0s');
});
