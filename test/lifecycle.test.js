// Animation lifecycle, resize and error states for CAL-1287 (BOIDS-V1-06):
// the one requestAnimationFrame loop, fixed 8 ms ticks with bounded catch-up,
// Play / Pause / Step / Generate / keys, DPR-scaled canvas sizing and the
// status message. See docs/audit/BOIDS-V1-06.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPage } from './harness.js';

const main = readFileSync(new URL('../src/javascripts/main.js', import.meta.url), 'utf8');
// Array.from, so the copy is an array of this realm rather than the page's.
const state = (page) => Array.from(page.flock.agents, ({ x, y, vx, vy, colour }) => ({ x, y, vx, vy, colour }));
const playing = (page) => page.elements.IS_PAUSED.style.display === 'none' && page.elements.IS_PLAYING.style.display === '';
const paused = (page) => page.elements.IS_PAUSED.style.display === '' && page.elements.IS_PLAYING.style.display === 'none';
const status = (page) => page.elements.statusMessage.style.display === 'none' ? '' : page.elements.statusMessage.textContent;
const drew = (page) => page.calls.some(([name]) => name === 'clearRect');

// A loaded page and a twin with the same seed, to compare against n ticks.
function twins(options)
{
  const page = loadPage(options);
  const twin = loadPage(options);
  page.load();
  twin.load();
  const ticked = (n) => { for(let i = 0; i < n; i++) twin.flock.Step(); return state(twin); };
  return { page, ticked };
}

test('main.js schedules only animation frames, never timers', () => {
  assert.doesNotMatch(main, /setInterval|setTimeout/);
});

test('Play runs exactly one loop, however often it is pressed', () => {
  const page = loadPage();
  page.load();
  page.click('IS_PAUSED');
  page.click('IS_PAUSED');
  page.key('i');
  page.key('i');
  assert.equal(page.timers.size, 1);
  assert.ok(playing(page));
  page.tick(5);
  assert.equal(page.timers.size, 1, 'each frame requests the next one only');
  page.click('IS_PLAYING');
  page.click('IS_PLAYING');
  page.key('p');
  assert.equal(page.timers.size, 0);
  assert.ok(paused(page));
});

test('the Play button never pauses, and the Pause button never plays', () => {
  const page = loadPage();
  page.load();
  page.key('i');
  page.click('IS_PAUSED');
  assert.equal(page.timers.size, 1);
  page.key('p');
  page.click('IS_PLAYING');
  assert.equal(page.timers.size, 0);
});

test('Pause stops every update', () => {
  const page = loadPage();
  page.load();
  page.click('IS_PAUSED');
  page.tick(3);
  page.click('IS_PLAYING');
  const before = state(page);
  page.tick(10);
  assert.deepEqual(state(page), before);
  assert.equal(page.calls.length, 0, 'and nothing is drawn');
});

test('each 8 ms of frames runs one tick, and a frame draws once', () => {
  const { page, ticked } = twins({ seed: 4 });
  page.click('IS_PAUSED');
  page.frame(0);
  assert.deepEqual(state(page), ticked(1), 'the first frame runs one tick at once');
  page.frame(16);
  assert.deepEqual(state(page), ticked(2), '16 ms runs two ticks');
  assert.equal(page.calls.filter(([name]) => name === 'clearRect').length, 1, 'drawn once');
  page.frame(5);
  assert.deepEqual(state(page), ticked(0), '5 ms is not yet a tick');
  assert.ok(!drew(page), 'and an unchanged flock is not redrawn');
  page.frame(5);
  assert.deepEqual(state(page), ticked(1), 'the 2 ms left over carry on');
});

test('catch-up after a long frame is bounded to 8 ticks', () => {
  const { page, ticked } = twins({ seed: 5 });
  page.click('IS_PAUSED');
  page.frame(8);
  ticked(1);
  // A background tab or a stall of 10 s.
  page.frame(10000);
  assert.deepEqual(state(page), ticked(8));
  page.frame(8);
  assert.deepEqual(state(page), ticked(1), 'the rest of the stall is dropped');
});

test('Step pauses and advances exactly one tick, by button or u key', () => {
  const { page, ticked } = twins({ seed: 6 });
  page.click('IS_PAUSED');
  page.tick(3);
  ticked(3);
  page.click('nextButton');
  assert.equal(page.timers.size, 0);
  assert.ok(paused(page));
  assert.deepEqual(state(page), ticked(1));
  page.calls.length = 0;
  page.key('u');
  assert.ok(drew(page), 'a step is drawn');
  assert.deepEqual(state(page), ticked(1));
  page.key('i');
  page.key('u');
  assert.equal(page.timers.size, 0, 'u pauses a playing flock');
  assert.ok(paused(page));
  assert.deepEqual(state(page), ticked(1));
});

test('shortcuts with a modifier are left to the browser', () => {
  const page = loadPage();
  page.load();
  page.click('IS_PAUSED');
  page.key('p', { ctrlKey: true });
  page.key('p', { metaKey: true });
  assert.equal(page.timers.size, 1);
  const before = state(page);
  page.key('u', { altKey: true });
  assert.deepEqual(state(page), before);
});

test('Generate disposes the loop of the old flock and leaves the new one paused', () => {
  const page = loadPage();
  page.load();
  for(let i = 0; i < 5; i++)
  {
    page.click('IS_PAUSED');
    page.tick(2);
    const old = page.flock;
    page.click('generateButton');
    assert.equal(page.timers.size, 0, 'no frame is left for the old flock');
    assert.ok(paused(page));
    assert.notEqual(page.flock, old);
    const frozen = Array.from(old.agents, ({ x, y }) => ({ x, y }));
    page.click('IS_PAUSED');
    page.tick(3);
    assert.deepEqual(Array.from(old.agents, ({ x, y }) => ({ x, y })), frozen, 'the old flock no longer moves');
    assert.equal(page.timers.size, 1);
    page.click('IS_PLAYING');
  }
  assert.ok(page.flock.agents.every((a) => [a.x, a.y, a.vx, a.vy].every(Number.isFinite)));
});

test('resizing keeps every agent, its species and the play state', () => {
  const page = loadPage({ width: 1280, height: 720 });
  page.load();
  page.click('IS_PAUSED');
  page.tick(5);
  const flock = page.flock;
  const before = state(page);
  page.resize(1024, 768);
  assert.equal(page.flock, flock, 'same flock');
  assert.deepEqual(state(page), before, 'resizing moves nothing');
  assert.deepEqual([flock.width, flock.height], [1024, 768]);
  assert.equal(page.timers.size, 1, 'still playing, with one loop');
  assert.ok(playing(page));
  page.tick(5);
  assert.notDeepEqual(state(page), before);

  page.click('IS_PLAYING');
  const pausedState = state(page);
  page.resize(900, 700);
  assert.equal(page.timers.size, 0, 'still paused');
  assert.ok(paused(page));
  assert.deepEqual(state(page), pausedState);
  assert.ok(page.calls.some(([name, , , w, h]) => name === 'clearRect' && w === 900 && h === 700), 'redrawn at the new size');
});

test('the backing store is DPR-scaled and drawing stays in CSS pixels', () => {
  const page = loadPage({ width: 1280, height: 720, devicePixelRatio: 2 });
  page.load();
  const canvas = page.elements.gameCanvas;
  assert.deepEqual([canvas.width, canvas.height], [2560, 1440]);
  assert.deepEqual([canvas.style.width, canvas.style.height], ['1280px', '720px']);
  assert.deepEqual([page.flock.width, page.flock.height], [1280, 720]);
  assert.ok(page.calls.some((call) => call.join() === 'setTransform,2,0,0,2,0,0'));
  assert.ok(page.calls.some((call) => call.join() === 'clearRect,0,0,1280,720'));

  page.window.devicePixelRatio = 1.5;
  page.resize(801, 601);
  assert.deepEqual([canvas.width, canvas.height], [1202, 902]);
  assert.deepEqual([canvas.style.width, canvas.style.height], ['801px', '601px']);
  assert.deepEqual([page.flock.width, page.flock.height], [801, 601]);
  assert.ok(page.calls.some((call) => call.join() === 'setTransform,1.5,0,0,1.5,0,0'));
});

test('a resize to the same size does not reset the canvas', () => {
  const page = loadPage({ width: 800, height: 600 });
  page.load();
  const canvas = page.elements.gameCanvas;
  let sets = 0;
  let size = [canvas.width, canvas.height];
  Object.defineProperty(canvas, 'width', { get: () => size[0], set: (v) => { sets++; size[0] = v; } });
  Object.defineProperty(canvas, 'height', { get: () => size[1], set: (v) => { sets++; size[1] = v; } });
  page.resize(800, 600);
  assert.equal(sets, 0);
  page.resize(800, 500);
  assert.equal(sets, 1);
});

test('a broken device pixel ratio counts as 1', () => {
  for(const devicePixelRatio of [0, -2, NaN, undefined])
  {
    const page = loadPage({ width: 640, height: 480, devicePixelRatio });
    page.load();
    assert.deepEqual([page.elements.gameCanvas.width, page.elements.gameCanvas.height], [640, 480], String(devicePixelRatio));
  }
});

test('a window too small to simulate in pauses the physics and says so', () => {
  const page = loadPage({ width: 800, height: 600 });
  page.load();
  assert.equal(status(page), '');
  page.click('IS_PAUSED');
  page.tick(2);
  page.resize(300, 0);
  assert.match(status(page), /too small.*300 × 0/);
  const before = state(page);
  page.tick(20);
  page.click('nextButton');
  assert.deepEqual(state(page), before, 'no tick runs');
  assert.ok(paused(page), 'Step still pauses');
  page.click('IS_PAUSED');
  assert.equal(page.timers.size, 1);

  page.resize(800, 600);
  assert.equal(status(page), '');
  page.tick(2);
  assert.notDeepEqual(state(page), before, 'and it carries on once there is room');
  assert.equal(page.flock.agents.length, 50);
});

test('a flock size the slider cannot hold is replaced and reported', () => {
  const page = loadPage();
  page.load();
  for(const [value, used] of [['abc', 50], ['500', 200], ['0', 1], ['-3', 1]])
  {
    page.elements.flockSizeRange.value = value;
    page.click('generateButton');
    assert.equal(page.flock.agents.length, used, value);
    assert.match(status(page), new RegExp(`Flock size "${value}" is not a whole number from 1 to 200, so ${used} was used`));
    assert.equal(page.elements.flockSizeRange.value, String(used));
    assert.equal(page.elements.flockSizeInput.value, String(used));
  }
  page.elements.flockSizeRange.value = '20';
  page.click('generateButton');
  assert.equal(page.flock.agents.length, 20);
  assert.equal(status(page), '', 'a valid Generate clears it');
});

test('an error in a frame stops the loop and shows a message until Generate', () => {
  const page = loadPage();
  page.load();
  page.click('IS_PAUSED');
  page.flock.Step = () => { throw new Error('boom'); };
  page.tick();
  assert.equal(page.timers.size, 0, 'the loop stops');
  assert.ok(paused(page));
  assert.match(status(page), /stopped after an error \(boom\).*Generate/);
  page.click('generateButton');
  assert.equal(status(page), '');
  page.click('IS_PAUSED');
  page.tick(2);
  assert.equal(page.timers.size, 1);
});
