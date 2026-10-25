// Browser smoke tests for CAL-1284 (BOIDS-V1-03): the real markup and script
// in jsdom (test/browser.js), once from source and once from the committed
// build. Each check clicks or changes real elements and reads the result off
// the page and the recorded canvas calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PARAMETERS } from '../src/javascripts/settings.js';
import { openPage } from './browser.js';

const controller = readFileSync(new URL('../src/javascripts/controller.js', import.meta.url), 'utf8');
// Every element id the page looks up: those the controller names, and the
// controls of every parameter in the settings model.
const ids = [
  ...[...controller.matchAll(/\$\(\s*["'](\w+)["']\s*\)/g)].map((m) => m[1]),
  ...PARAMETERS.flatMap((p) => [p.range, p.text, p.checkbox, ...Object.values(p.radios ?? {})]).filter(Boolean),
];
// Counts calls to `name`, optionally only those drawn in `style` (the fill
// style for fill and fillText, otherwise the stroke style).
const count = (calls, name, style) => calls.filter((c) => c.name === name
  && (!style || (/^fill/.test(name) ? c.fillStyle : c.strokeStyle) === style)).length;
// The calls after the last clearRect: what is on screen now.
const lastFrame = (calls) => calls.slice(calls.findLastIndex((c) => c.name === 'clearRect'));

for(const build of [false, true])
{
  const variant = build ? 'build' : 'source';
  const open = async (t, options) => {
    const page = await openPage({ build, ...options });
    t.after(() => page.close());
    return page;
  };

  test(`${variant}: every element the page looks up is in the markup`, async (t) => {
    const page = await open(t);
    assert.ok(ids.length > 30);
    assert.deepEqual(ids.filter((id) => !page.$(id)), []);
    assert.equal(page.window.document.getElementsByClassName('startButton').length, 2);
    assert.deepEqual(page.errors, []);
  });

  test(`${variant}: the page loads a paused flock of 50 circles sized to the window`, async (t) => {
    const page = await open(t, { width: 1024, height: 600 });
    const canvas = page.$('gameCanvas');
    assert.deepEqual([canvas.width, canvas.height], [1024, 600]);
    assert.equal(count(lastFrame(page.calls), 'arc'), 50);
    assert.equal(page.timers.size, 0);
    assert.ok(page.visible('IS_PAUSED') && !page.visible('IS_PLAYING'));
  });

  test(`${variant}: play, pause and step`, async (t) => {
    const page = await open(t);
    page.click('IS_PAUSED');
    assert.equal(page.timers.size, 1, 'playing');
    assert.ok(!page.visible('IS_PAUSED') && page.visible('IS_PLAYING'));
    const frame = page.frame(() => page.tick());
    assert.equal(frame[0].name, 'clearRect', 'each tick redraws');
    assert.equal(count(frame, 'arc'), 50);

    page.click('IS_PLAYING');
    assert.equal(page.timers.size, 0, 'paused');
    assert.ok(page.visible('IS_PAUSED') && !page.visible('IS_PLAYING'));

    page.click('IS_PAUSED');
    const xs = (calls) => calls.filter((c) => c.name === 'arc').map((c) => c.args[0]);
    const first = xs(page.frame(() => page.click('nextButton')));
    assert.equal(page.timers.size, 0, 'step pauses');
    assert.ok(page.visible('IS_PAUSED'));
    const second = xs(page.frame(() => page.click('nextButton')));
    assert.equal(second.length, 50);
    assert.notDeepEqual(second, first, 'each step moves the flock');
  });

  test(`${variant}: the u key draws one frame`, async (t) => {
    const page = await open(t);
    assert.equal(count(page.frame(() => page.key('u')), 'arc'), 50);
  });

  test(`${variant}: the options button opens and closes the settings`, async (t) => {
    const page = await open(t);
    const shown = page.visible('settingsMenu');
    page.click('optionsButton');
    assert.equal(page.visible('settingsMenu'), !shown);
    page.click('optionsButton');
    assert.equal(page.visible('settingsMenu'), shown);
  });

  test(`${variant}: sliders show their value, and Generate applies the flock size`, async (t) => {
    const page = await open(t);
    for(const [range, input, value] of [
      ['flockRangeAlignment', 'flockInputAlignment', '0.2'],
      ['flockRangeCohesion', 'flockInputCohesion', '0.001'],
      ['flockRangeMaxSpeed', 'flockInputMaxSpeed', '4'],
      ['flockSizeRange', 'flockSizeInput', '12'],
    ])
    {
      page.change(range, value);
      assert.equal(page.$(input).value, value, range);
    }
    assert.equal(count(page.frame(() => page.click('nextButton')), 'arc'), 50, 'size waits for Generate');
    assert.equal(count(lastFrame(page.frame(() => page.click('generateButton'))), 'arc'), 12);
    assert.ok(page.visible('IS_PAUSED'), 'Generate leaves the flock paused');
    assert.deepEqual(page.errors, []);
  });

  test(`${variant}: the Generate notice shows while species or variance wait for Generate`, async (t) => {
    const page = await open(t);
    assert.ok(!page.visible('generatePending'));
    page.change('flockRangeTribes', 4);
    assert.ok(page.visible('generatePending'));
    assert.match(page.$('generatePending').textContent, /Generate/);
    page.click('generateButton');
    assert.ok(!page.visible('generatePending'));
    page.change('flockRangeVariance', 60);
    assert.ok(page.visible('generatePending'));
    page.change('flockRangeVariance', 5);
    assert.ok(!page.visible('generatePending'));
    assert.deepEqual(page.errors, []);
  });

  test(`${variant}: line and circle shapes, and the optional direction line`, async (t) => {
    const page = await open(t);
    const line = page.frame(() => page.change('flockSizeShapeLine', true));
    assert.equal(count(line, 'arc'), 0, 'a paused flock is redrawn as lines at once');
    // One velocity line per agent, and no direction line by default.
    assert.equal(count(line, 'lineTo'), 50);

    const both = page.frame(() => page.change('flockDirection', true));
    assert.equal(count(both, 'lineTo'), 100, 'plus a direction line per agent');

    page.change('flockSizeShapeCircle', true);
    const circle = page.frame(() => page.click('nextButton'));
    assert.equal(count(circle, 'arc'), 50);
    assert.equal(count(circle, 'lineTo'), 50);
    page.change('flockDirection', false);
    const plain = page.frame(() => page.click('nextButton'));
    assert.equal(count(plain, 'lineTo'), 0);
    assert.deepEqual(page.errors, []);
  });

  test(`${variant}: the nearby and close debug overlays`, async (t) => {
    const page = await open(t);
    const plain = page.frame(() => page.click('nextButton'));
    assert.equal(count(plain, 'fillText'), 0);

    page.change('flockNearby', true);
    const nearby = page.frame(() => page.click('nextButton'));
    assert.equal(count(nearby, 'rect', 'green'), 50);
    assert.equal(count(nearby, 'fillText', 'green'), 50);

    page.change('flockNearby', false);
    page.change('flockClose', true);
    const close = page.frame(() => page.click('nextButton'));
    assert.equal(count(close, 'rect', 'red'), 50);
    assert.equal(count(close, 'fillText', 'red'), 50);
    assert.equal(count(close, 'rect', 'green'), 0);
  });

  test(`${variant}: a high-DPI canvas keeps the flock and play state through a resize`, async (t) => {
    const page = await open(t, { width: 1024, height: 600, devicePixelRatio: 2 });
    const canvas = page.$('gameCanvas');
    assert.deepEqual([canvas.width, canvas.height], [2048, 1200]);
    assert.deepEqual([canvas.style.width, canvas.style.height], ['1024px', '600px']);
    page.click('IS_PAUSED');
    page.tick();
    const arcs = (calls) => calls.filter((c) => c.name === 'arc').map((c) => c.args.slice(0, 2));
    const before = arcs(lastFrame(page.calls));
    const frame = page.frame(() => page.resize(800, 500));
    assert.deepEqual([canvas.width, canvas.height], [1600, 1000]);
    assert.deepEqual(frame.find((c) => c.name === 'setTransform').args, [2, 0, 0, 2, 0, 0]);
    assert.deepEqual(frame.find((c) => c.name === 'clearRect').args, [0, 0, 800, 500]);
    assert.deepEqual(arcs(frame), before, 'the agents stay where they were');
    assert.equal(page.timers.size, 1, 'still playing');
    assert.ok(!page.visible('IS_PAUSED') && page.visible('IS_PLAYING'));
    assert.ok(!page.visible('statusMessage'));
    page.resize(4, 4);
    assert.ok(page.visible('statusMessage'));
    assert.match(page.$('statusMessage').textContent, /too small/);
    assert.deepEqual(page.errors, []);
  });

  test(`${variant}: the boundary box follows the box sliders`, async (t) => {
    const page = await open(t, { width: 800, height: 600 });
    page.change('flockRangeBoxX', 100);
    page.change('flockRangeBoxY', 50);
    const [box] = page.frame(() => page.click('nextButton')).filter((c) => c.name === 'rect');
    assert.deepEqual(box.args, [100, 50, 600, 500]);
  });
}
