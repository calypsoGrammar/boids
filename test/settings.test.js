// The configuration model and the module split of CAL-1288 (BOIDS-V1-07):
// one validated model for every control (src/javascripts/settings.js), the
// way each kind of setting reaches the flock or the picture, the renderer's
// overlays, and the physics, loop and renderer running with no DOM at all.
// See docs/audit/BOIDS-V1-07.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULTS as MODEL_DEFAULTS, PARAMETERS, couple, keys, limits, validate } from '../src/javascripts/settings.js';
import { Loop, TICK_MS } from '../src/javascripts/loop.js';
import { drawFlock } from '../src/javascripts/renderer.js';
import { DEFAULTS, finite, scene, seeded } from './fixtures.js';
import { loadPage, parseInputs } from './harness.js';

const inputs = parseInputs();
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const status = (page) => page.elements.statusMessage.style.display === 'none' ? '' : page.elements.statusMessage.textContent;
const pending = (page) => page.elements.generatePending.style.display !== 'none';
const shown = (page, p) => [page.elements[p.range].value, page.elements[p.text].value];
const sliders = PARAMETERS.filter((p) => p.range);

// --- The model and index.html -----------------------------------------------

test('the model has every control of the settings panel, with its markup default and limits', () => {
  const panel = html.slice(html.indexOf('id="settingsMenu"'), html.indexOf('id="generate"'));
  const ids = [...panel.matchAll(/<input[^>]*\sid="(\w+)"/g)].map((m) => m[1]);
  const modelled = PARAMETERS.flatMap((p) => [p.range, p.text, p.checkbox, ...Object.values(p.radios ?? {})]).filter(Boolean);
  assert.deepEqual([...modelled].sort(), [...ids].sort());
  for(const p of sliders)
  {
    const range = inputs[p.range];
    assert.equal(Number(range.value), p.default, p.key + ' default');
    assert.equal(Number(inputs[p.text].value), p.default, p.key + ' number field');
    assert.deepEqual([Number(range.min), Number(range.max)], [p.min, p.max], p.key + ' limits');
  }
  for(const p of PARAMETERS.filter((p) => p.checkbox)) assert.equal(inputs[p.checkbox].checked, p.default, p.key);
  assert.equal(inputs.flockSizeShapeCircle.checked, true);
  assert.deepEqual(MODEL_DEFAULTS, DEFAULTS, 'the test fixtures use the same defaults');
});

test('each parameter is live, generate-only or view-only, and the Generate notice names the generate ones', () => {
  assert.deepEqual(keys('generate'), ['flockSize', 'raceCount', 'variance']);
  assert.deepEqual(keys('view'), ['shape', 'nearby', 'close', 'direction']);
  assert.deepEqual(keys('live'), ['minSpeed', 'maxSpeed', 'seperation', 'seperationFactor', 'alignment', 'cohesion',
    'turnFactor', 'bias', 'boxX', 'boxY', 'wrap']);
  assert.match(html, /Press Generate to apply Flock Size, Species and Variance\./);
});

test('validate() keeps valid values and replaces the rest, saying how', () => {
  assert.deepEqual(validate('alignment', '0.10'), { value: 0.1, valid: true, message: '' });
  assert.deepEqual(validate('flockSize', '200'), { value: 200, valid: true, message: '' });
  for(const [key, raw, value] of [
    ['flockSize', 'abc', 50], ['flockSize', '500', 200], ['flockSize', '0', 1], ['flockSize', '2.6', 3],
    ['flockSize', '', 50], ['maxSpeed', '11', 10], ['maxSpeed', 'NaN', 2.5], ['cohesion', '-1', 0],
    ['raceCount', 'Infinity', 2],
  ])
  {
    const result = validate(key, raw);
    assert.equal(result.value, value, `${key} ${raw}`);
    assert.equal(result.valid, false);
    assert.match(result.message, new RegExp(`"${raw}" is not a .* so ${value} was used\\.$`));
  }
  assert.match(validate('flockSize', '0').message, /^Flock size "0" is not a whole number from 1 to 200/);
  assert.match(validate('maxSpeed', '11').message, /^Max speed "11" is not a number from 0.2 to 10/);
  assert.equal(validate('wrap', true).value, true);
  assert.equal(validate('wrap', 'yes').value, false);
  assert.equal(validate('shape', 'square').value, 'circle');
  assert.equal(validate('boxX', '600', [0, 1000]).value, 600, 'limits can be overridden');
});

test('limits() takes usable slider limits and falls back to the model', () => {
  const result = limits({ boxX: [0, 900], boxY: [NaN, 3], alignment: [1, 0] });
  assert.deepEqual(result.boxX, [0, 900]);
  assert.deepEqual(result.boxY, [0, 500]);
  assert.deepEqual(result.alignment, [0, 0.25]);
  assert.equal(result.wrap, undefined, 'only numeric parameters have limits');
});

test('couple() keeps min speed <= max speed, the speed just changed winning', () => {
  const pair = (min, max, changed) => { const c = { minSpeed: min, maxSpeed: max }; return [couple(c, changed), c]; };
  assert.deepEqual(pair(1, 2), [[], { minSpeed: 1, maxSpeed: 2 }]);
  assert.deepEqual(pair(3, 2, 'minSpeed'), [['maxSpeed'], { minSpeed: 3, maxSpeed: 3 }]);
  assert.deepEqual(pair(3, 2, 'maxSpeed'), [['minSpeed'], { minSpeed: 2, maxSpeed: 2 }]);
  assert.deepEqual(pair(3, 2), [['minSpeed'], { minSpeed: 2, maxSpeed: 2 }], 'Generate lowers min');
});

// --- Settings sync ----------------------------------------------------------

test('on load the config, the flock, the sliders and the number fields agree', () => {
  const page = loadPage();
  page.load();
  assert.deepEqual({ ...page.app.config }, DEFAULTS);
  for(const key of [...keys('live'), ...keys('generate')]) assert.equal(page.flock[key], DEFAULTS[key], key);
  for(const p of sliders) assert.equal(Number(page.elements[p.text].value), page.app.config[p.key], p.key);
  assert.equal(pending(page), false);
  assert.equal(status(page), '');
});

test('number fields that disagree with their slider, as after a restored form, are corrected on load', () => {
  const page = loadPage();
  page.elements.flockRangeAlignment.value = '0.2';
  page.elements.flockSizeRange.value = '30';
  page.load();
  assert.deepEqual(shown(page, sliders.find((p) => p.key === 'alignment')), ['0.2', '0.2']);
  assert.equal(page.elements.flockSizeInput.value, '30');
  assert.equal(page.flock.alignment, 0.2);
  assert.equal(page.flock.agents.length, 30);
  // A field that already shows the number keeps its text.
  assert.equal(page.elements.flockInputSeperation.value, '0.10');
});

test('every live slider changes the running flock at once, and its number field', () => {
  const page = loadPage();
  page.load();
  const flock = page.flock;
  const agents = page.flock.agents.length;
  for(const p of sliders.filter((p) => p.applies === 'live'))
  {
    const value = p.key === 'minSpeed' ? 0.3 : p.max;
    page.setSlider(p.range, value);
    assert.equal(page.app.config[p.key], value, p.key);
    assert.equal(page.flock[p.key], value, p.key);
    assert.equal(Number(page.elements[p.text].value), value, p.key);
  }
  page.setCheckbox('flockWrap', false);
  assert.equal(page.flock.wrap, false);
  assert.equal(page.flock, flock, 'the same flock');
  assert.equal(page.flock.agents.length, agents);
  assert.equal(pending(page), false, 'live settings need no Generate');
});

test('generate-only sliders wait for Generate, and their notice follows the difference', () => {
  const page = loadPage();
  page.load();
  for(const [id, value, key] of [['flockSizeRange', 10, 'flockSize'], ['flockRangeTribes', 5, 'raceCount'],
    ['flockRangeVariance', 40, 'variance']])
  {
    page.setSlider(id, value);
    assert.equal(page.app.config[key], value, key);
    assert.equal(page.flock[key], DEFAULTS[key], key + ' waits');
    assert.equal(pending(page), true, key);
    page.setSlider(id, DEFAULTS[key]);
    assert.equal(pending(page), false, key + ' back to the running value');
  }
  page.setSlider('flockSizeRange', 10);
  page.setSlider('flockRangeTribes', 5);
  page.setSlider('flockRangeVariance', 40);
  page.click('generateButton');
  assert.deepEqual([page.flock.agents.length, page.flock.raceCount, page.flock.variance], [10, 5, 40]);
  assert.equal(pending(page), false);
});

test('view settings change only the picture, and redraw a paused flock', () => {
  const page = loadPage();
  page.load();
  const state = () => page.flock.agents.map(({ x, y, vx, vy }) => [x, y, vx, vy]);
  const before = state();
  for(const [id, checked] of [['flockNearby', true], ['flockClose', true], ['flockDirection', true],
    ['flockSizeShapeLine', true], ['flockSizeShapeCircle', true], ['flockNearby', false]])
  {
    page.calls.length = 0;
    page.setCheckbox(id, checked);
    assert.ok(page.calls.some(([name]) => name === 'clearRect'), id + ' redraws');
  }
  assert.deepEqual(state(), before, 'no agent moved');
  assert.equal(page.timers.size, 0);
  assert.deepEqual([page.app.config.shape, page.app.config.nearby, page.app.config.close, page.app.config.direction],
    ['circle', false, true, true]);
});

test('Generate keeps every setting, live and view ones included', () => {
  const page = loadPage();
  page.load();
  const changes = [['flockRangeMaxSpeed', 4], ['flockRangeMinSpeed', 1.5], ['flockRangeSeperation', 0.2],
    ['flockRangeSeperationFactor', 3], ['flockRangeAlignment', 0.05], ['flockRangeCohesion', 0.002],
    ['flockRangeTurn', 0.7], ['flockRangeBias', 10], ['flockRangeBoxX', 40], ['flockRangeBoxY', 30],
    ['flockSizeRange', 25], ['flockRangeTribes', 3], ['flockRangeVariance', 20]];
  for(const [id, value] of changes) page.setSlider(id, value);
  for(const id of ['flockNearby', 'flockClose', 'flockDirection', 'flockSizeShapeLine']) page.setCheckbox(id, true);
  page.setCheckbox('flockWrap', false);
  const config = { ...page.app.config };
  const controls = Object.fromEntries(Object.entries(page.elements).map(([id, e]) => [id, [e.value, e.checked]]));
  page.click('IS_PAUSED');
  page.tick(3);

  page.click('generateButton');
  assert.deepEqual({ ...page.app.config }, config, 'no setting was reset');
  for(const [id, [value, checked]] of Object.entries(controls))
    assert.deepEqual([page.elements[id].value, page.elements[id].checked], [value, checked], id);
  for(const key of [...keys('live'), ...keys('generate')]) assert.equal(page.flock[key], config[key], key);
  assert.equal(page.flock.agents.length, 25);
  assert.equal(page.timers.size, 0, 'only the play state is reset');
  assert.ok(page.calls.some(([name, , , w]) => name === 'rect' && w === 240), 'the overlays are still drawn');
});

test('a replaced live value is shown and reported, and clears once valid', () => {
  const page = loadPage();
  page.load();
  page.setSlider('flockRangeMaxSpeed', 'fast');
  assert.equal(page.flock.maxSpeed, 2.5);
  assert.deepEqual(shown(page, sliders.find((p) => p.key === 'maxSpeed')), ['2.5', '2.5']);
  assert.match(status(page), /Max speed "fast" is not a number from 0.2 to 10, so 2.5 was used\./);
  page.setSlider('flockRangeMaxSpeed', 3);
  assert.equal(status(page), '');
});

test('the speed sliders stay in order through live changes and Generate', () => {
  const page = loadPage();
  page.load();
  page.setSlider('flockRangeMaxSpeed', 1);
  page.setSlider('flockRangeMinSpeed', 2);
  assert.deepEqual([page.app.config.minSpeed, page.app.config.maxSpeed], [2, 2]);
  assert.deepEqual([page.flock.minSpeed, page.flock.maxSpeed], [2, 2]);
  assert.equal(page.elements.flockInputMaxSpeed.value, '2');
  page.click('generateButton');
  assert.deepEqual([page.flock.minSpeed, page.flock.maxSpeed], [2, 2]);
});

test('a setting changed before the page loads is used by the first flock', () => {
  const page = loadPage();
  page.setSlider('flockRangeAlignment', 0.2);
  page.setCheckbox('flockWrap', false);
  page.load();
  assert.equal(page.flock.alignment, 0.2);
  assert.equal(page.flock.wrap, false);
});

// --- Renderer ---------------------------------------------------------------

const two = [{ x: 100, y: 100, vx: 1, vy: 0 }, { x: 130, y: 110, vx: 0, vy: 2, species: 1 }];

test('the overlays show the search squares and the neighbours the last tick found', () => {
  const { flock, calls, draw } = scene({ agents: [...two, { x: 300, y: 300, vx: 1, vy: 1 }] });
  flock.Step();
  draw({ shape: 'circle', nearby: true, close: true });
  for(const agent of flock.agents)
  {
    const rect = (r) => calls.some((c) => c.join() === ['rect', agent.x - r, agent.y - r, 2 * r, 2 * r].join());
    assert.ok(rect(120) && rect(40), agent.name);
    assert.ok(calls.some((c) => c.join() === ['fillText', agent.nearby.length, agent.x + 7.5, agent.y + 5].join()));
    assert.ok(calls.some((c) => c.join() === ['fillText', agent.close.length, agent.x + 7.5, agent.y - 5].join()));
  }
  assert.deepEqual(flock.agents.map((a) => a.nearby.length), [1, 1, 0]);
  assert.deepEqual(flock.agents.map((a) => a.close.length), [1, 1, 0]);
});

test('without overlays or the direction line, each agent is one shape', () => {
  const { calls, draw } = scene({ agents: two });
  draw({ shape: 'circle' });
  assert.deepEqual(calls.map(([name]) => name).filter((name) => !['beginPath', 'stroke', 'fill'].includes(name)),
    ['clearRect', 'rect', 'arc', 'arc']);
  calls.length = 0;
  draw({ shape: 'line' });
  assert.equal(calls.filter(([name]) => name === 'lineTo').length, 2);
  assert.ok(!calls.some(([name]) => name === 'arc' || name === 'fillText'));
});

test('the direction line follows the velocity, and line widths never leak between strokes', () => {
  const { flock } = scene({ agents: two });
  // Records the line width of every stroke and the end of every line.
  const widths = [];
  const ends = [];
  const ctx = { lineWidth: 1, stroke() { widths.push(this.lineWidth); }, lineTo: (x, y) => ends.push([x, y]) };
  for(const name of ['clearRect', 'beginPath', 'rect', 'moveTo', 'arc', 'fill', 'fillText']) ctx[name] = () => {};
  drawFlock(ctx, flock, { shape: 'line' });
  assert.deepEqual(widths, [1, 5 / 3, 5 / 3], 'the box at 1 px, then lines at radius / 3');
  widths.length = 0;
  ends.length = 0;
  drawFlock(ctx, flock, { shape: 'circle', direction: true });
  assert.deepEqual(widths, [1, 1, 1], 'the box and the direction lines at 1 px');
  assert.deepEqual(ends, [[106, 100], [130, 122]], '(radius + 1) times the velocity');
});

// --- Modules without a DOM -----------------------------------------------------

test('the physics, renderer and loop modules use no browser globals', () => {
  for(const file of ['agent.js', 'flock.js', 'renderer.js', 'loop.js', 'settings.js'])
  {
    const source = readFileSync(new URL('../src/javascripts/' + file, import.meta.url), 'utf8');
    // Code only: no comments, and no property names such as frames.requestAnimationFrame.
    const code = source.replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /(?<![.\w])(window|document|requestAnimationFrame|cancelAnimationFrame)\b/, file);
    assert.doesNotMatch(source, /from ["']\.\/(controller|main)\.js["']/, file);
  }
  assert.equal(typeof globalThis.document, 'undefined', 'and these tests run them with none');
  const { flock, calls, draw } = scene({ flockSize: 30, random: seeded(2) });
  flock.Start();
  for(let i = 0; i < 50; i++) flock.Step();
  draw();
  assert.ok(flock.agents.every(finite));
  assert.equal(calls.filter(([name]) => name === 'arc').length, 30);
});

test('the loop runs fixed ticks with any frame source', () => {
  const pending = [];
  const frames = {
    requestAnimationFrame: (fn) => pending.push(fn),
    cancelAnimationFrame: () => pending.length = 0,
  };
  const log = [];
  const loop = new Loop(() => log.push('tick'), () => log.push('draw'), (error) => log.push(error.message), frames);
  const frame = (now) => pending.splice(0).forEach((fn) => fn(now));
  loop.Play();
  loop.Play();
  assert.equal(pending.length, 1);
  frame(0);
  frame(3 * TICK_MS);
  assert.deepEqual(log, ['tick', 'draw', 'tick', 'tick', 'tick', 'draw']);
  loop.Pause();
  assert.equal(loop.running, false);
  assert.equal(pending.length, 0);
  loop.tick = () => { throw new Error('boom'); };
  loop.Play();
  frame(100);
  assert.equal(log.at(-1), 'boom');
  assert.equal(loop.running, false);
});
