// Browser smoke tests for CAL-1284 (BOIDS-V1-03): the real markup and script
// in jsdom (test/browser.js), once from source and once from the committed
// build. Each check clicks or changes real elements and reads the result off
// the page and the recorded canvas calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openPage } from './browser.js';

const main = readFileSync(new URL('../src/javascripts/main.js', import.meta.url), 'utf8');
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

  test(`${variant}: every element main.js looks up is in the markup`, async (t) => {
    const page = await open(t);
    const ids = [...main.matchAll(/getElementById\(\s*["'](\w+)["']\s*\)/g)].map((m) => m[1]);
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

  test(`${variant}: line and circle shapes, and the direction line`, async (t) => {
    const page = await open(t);
    page.change('flockSizeShapeLine', true);
    page.click('flockSizeShapeLine');
    const line = page.frame(() => page.click('nextButton'));
    assert.equal(count(line, 'arc'), 0);
    // A velocity line plus the always-on direction line per agent.
    assert.equal(count(line, 'lineTo'), 100);

    page.change('flockSizeShapeCircle', true);
    page.click('flockSizeShapeCircle');
    const circle = page.frame(() => page.click('nextButton'));
    assert.equal(count(circle, 'arc'), 50);
    assert.equal(count(circle, 'lineTo'), 50);
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

  test(`${variant}: the boundary box follows the box sliders`, async (t) => {
    const page = await open(t, { width: 800, height: 600 });
    page.change('flockRangeBoxX', 100);
    page.change('flockRangeBoxY', 50);
    const [box] = page.frame(() => page.click('nextButton')).filter((c) => c.name === 'rect');
    assert.deepEqual(box.args, [100, 50, 600, 500]);
  });
}
