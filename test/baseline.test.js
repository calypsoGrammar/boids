// Baseline for CAL-1282 (BOIDS-V1-01). These tests pin the behaviour of the
// simulation as audited, including the known defects listed in
// docs/audit/BOIDS-V1-01.md. A "KNOWN DEFECT" test asserts the current, wrong
// behaviour so the fix ticket that corrects it has to update the test on
// purpose; the defect ID matches the inventory in the audit document.
// CAL-1285 (BOIDS-V1-04) fixed D1-D4 and D9; their tests now pin the fixed
// behaviour (docs/audit/BOIDS-V1-04.md), and CAL-1287 (BOIDS-V1-06) fixed D8
// and D12 (docs/audit/BOIDS-V1-06.md). CAL-1288 (BOIDS-V1-07) fixed D6 and D7
// (docs/audit/BOIDS-V1-07.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './harness.js';

const speed = (agent) => Math.hypot(agent.vx, agent.vy);
const finite = (agent) => [agent.x, agent.y, agent.vx, agent.vy].every(Number.isFinite);

test('default settings generate a paused flock of 50 circles that fills the viewport', () => {
  const page = loadPage({ width: 1280, height: 720 });
  page.load();
  const flock = page.flock;
  assert.equal(flock.agents.length, 50);
  assert.equal(page.app.config.shape, 'circle');
  assert.equal(flock.raceCount, 2);
  assert.equal(flock.wrap, true);
  assert.deepEqual([flock.width, flock.height], [1280, 720]);
  assert.equal(page.timers.size, 0, 'nothing runs until Play is pressed');
  assert.equal(page.elements.IS_PAUSED.style.display, '', 'Play button visible');
  assert.equal(page.elements.IS_PLAYING.style.display, 'none', 'Pause button hidden');
  assert.ok(page.calls.some(([name]) => name === 'arc'), 'first frame is drawn');
});

test('play, pause and step drive the animation loop and swap the buttons', () => {
  const page = loadPage();
  page.load();
  page.click('IS_PAUSED');
  assert.equal(page.timers.size, 1);
  assert.equal(page.elements.IS_PAUSED.style.display, 'none');
  assert.equal(page.elements.IS_PLAYING.style.display, '');

  page.click('IS_PLAYING');
  assert.equal(page.timers.size, 0);
  assert.equal(page.elements.IS_PAUSED.style.display, '');

  const before = page.flock.agents.map((a) => a.x);
  page.click('nextButton');
  assert.equal(page.timers.size, 0, 'step leaves the simulation paused');
  assert.notDeepEqual(page.flock.agents.map((a) => a.x), before, 'step advances one frame');
});

test('the options button toggles the settings menu', () => {
  const page = loadPage();
  page.load();
  page.click('optionsButton');
  assert.equal(page.elements.settingsMenu.style.display, '');
  page.click('optionsButton');
  assert.equal(page.elements.settingsMenu.style.display, 'none');
});

test('default settings run for 10 seconds of frames without losing agents', () => {
  const page = loadPage({ seed: 1 });
  page.load();
  page.click('IS_PAUSED');
  page.tick(1250);
  assert.ok(page.flock.agents.every(finite));
});

test('turn boundaries run for 10 seconds of frames without losing agents', () => {
  const page = loadPage({ seed: 1 });
  page.load();
  page.setCheckbox('flockWrap', false);
  page.click('IS_PAUSED');
  page.tick(1250);
  assert.ok(page.flock.agents.every(finite));
});

test('wrap moves an agent that leaves one edge to the opposite edge', () => {
  const page = loadPage({ width: 800, height: 600 });
  page.elements.flockSizeRange.value = '1';
  page.load();
  const agent = page.flock.agents[0];
  Object.assign(agent, { x: 2, y: 300, vx: -1, vy: 0 });
  page.flock.DetectEdgeCollisions(agent);
  assert.equal(agent.x, 800 - agent.radius);
});

test('turn mode pushes an agent back by the turn factor instead of moving it', () => {
  const page = loadPage({ width: 800, height: 600 });
  page.elements.flockSizeRange.value = '1';
  page.load();
  page.setCheckbox('flockWrap', false);
  const agent = page.flock.agents[0];
  Object.assign(agent, { x: 2, y: 300, vx: -1, vy: 0 });
  page.flock.DetectEdgeCollisions(agent);
  assert.equal(agent.x, 2);
  assert.equal(agent.vx, -1 + 0.4);
  assert.equal(agent.outBox, true);
});

test('alignment, cohesion, separation, bias and boundary sliders apply live', () => {
  const page = loadPage();
  page.load();
  const settings = [
    ['flockRangeSeperation', 0.25, 'seperation'],
    ['flockRangeSeperationFactor', 0, 'seperationFactor'],
    ['flockRangeAlignment', 0, 'alignment'],
    ['flockRangeCohesion', 0.0025, 'cohesion'],
    ['flockRangeBias', 100, 'bias'],
    ['flockRangeTurn', 1, 'turnFactor'],
    ['flockRangeBoxX', 50, 'boxX'],
    ['flockRangeBoxY', 50, 'boxY'],
  ];
  for(const [id, value, key] of settings)
  {
    page.setSlider(id, value);
    assert.equal(page.flock[key], value, id);
  }
});

test('flock size, species and variance only take effect on Generate', () => {
  const page = loadPage();
  page.load();
  const pending = () => page.elements.generatePending.style.display !== 'none';
  assert.equal(pending(), false, 'no notice on load');
  page.setSlider('flockSizeRange', 10);
  page.setSlider('flockRangeTribes', 5);
  page.setSlider('flockRangeVariance', 40);
  assert.equal(pending(), true, 'notice while they differ');
  assert.equal(page.flock.agents.length, 50);
  assert.deepEqual([page.flock.flockSize, page.flock.raceCount, page.flock.variance], [50, 2, 5]);
  assert.equal(new Set(page.flock.agents.map((a) => a.colour)).size, 2);
  page.click('generateButton');
  assert.equal(page.flock.agents.length, 10);
  assert.deepEqual([page.flock.raceCount, page.flock.variance], [5, 40]);
  assert.equal(pending(), false, 'Generate clears the notice');
  // Moving a slider back to the running value clears it as well.
  page.setSlider('flockRangeTribes', 3);
  assert.equal(pending(), true);
  page.setSlider('flockRangeTribes', 5);
  assert.equal(pending(), false);
  // Separation, alignment and cohesion stay live and show no notice.
  page.setSlider('flockRangeAlignment', 0.2);
  assert.equal(pending(), false);
});

test('species become separate colours, and agents of a species share one', () => {
  const page = loadPage({ seed: 3 });
  page.elements.flockSizeRange.value = '200';
  page.elements.flockRangeTribes.value = '1';
  page.load();
  assert.equal(new Set(page.flock.agents.map((a) => a.colour)).size, 1);
});

test('line shape draws each agent as a velocity line', () => {
  const page = loadPage();
  page.load();
  page.setCheckbox('flockSizeShapeLine', true);
  assert.equal(page.app.config.shape, 'line');
  page.calls.length = 0;
  page.click('nextButton');
  assert.ok(!page.calls.some(([name]) => name === 'arc'));
});

test('resizing the window resizes the canvas and the flock bounds', () => {
  const page = loadPage({ width: 1280, height: 720 });
  page.load();
  page.resize(800, 600);
  assert.deepEqual([page.elements.gameCanvas.width, page.elements.gameCanvas.height], [800, 600]);
  assert.deepEqual([page.flock.width, page.flock.height], [800, 600]);
});

test('D1: min and max speed keep their fractions, in the flock and the number fields', () => {
  const page = loadPage();
  page.load();
  assert.equal(page.flock.minSpeed, 0.5);
  assert.equal(page.flock.maxSpeed, 2.5);
  page.setSlider('flockRangeMaxSpeed', 0.8);
  page.setSlider('flockRangeMinSpeed', 0.3);
  assert.deepEqual([page.flock.minSpeed, page.flock.maxSpeed], [0.3, 0.8]);
  assert.deepEqual([page.elements.flockInputMinSpeed.value, page.elements.flockInputMaxSpeed.value], ['0.3', '0.8']);
  for(let i = 0; i < 20; i++) page.click('nextButton');
  assert.ok(page.flock.agents.every((a) => speed(a) >= 0.3 - 1e-12 && speed(a) <= 0.8 + 1e-12), 'the flock moves inside 0.3-0.8');
  page.click('generateButton');
  assert.deepEqual([page.flock.minSpeed, page.flock.maxSpeed], [0.3, 0.8], 'Generate reads the fractions');
});

test('D2: the min speed clamp keeps the heading', () => {
  const page = loadPage();
  page.elements.flockSizeRange.value = '1';
  page.elements.flockRangeMinSpeed.value = '3';
  page.elements.flockRangeMaxSpeed.value = '5';
  page.load();
  const agent = page.flock.agents[0];
  Object.assign(agent, { vx: 0.3, vy: 0.4 });
  page.flock.MovePosition(agent);
  assert.ok(Math.abs(agent.vx - 1.8) < 1e-9);
  assert.ok(Math.abs(agent.vy - 2.4) < 1e-9);
  assert.ok(Math.abs(speed(agent) - 3) < 1e-9);
});

test('D3: two close agents on the same x or y stay finite', () => {
  const page = loadPage();
  page.elements.flockSizeRange.value = '2';
  page.load();
  const [a, b] = page.flock.agents;
  Object.assign(a, { x: 100, y: 100, vx: 1, vy: 1 });
  Object.assign(b, { x: 100, y: 120, vx: 1, vy: 1 });
  page.flock.Step();
  assert.ok(finite(a) && finite(b));
});

test('D3: a default 200-agent flock keeps every agent (seed 2)', () => {
  // Spawn positions are whole pixels, so equal coordinates are common.
  const page = loadPage({ seed: 2 });
  page.elements.flockSizeRange.value = '200';
  page.load();
  page.click('IS_PAUSED');
  page.tick(500);
  assert.equal(page.flock.agents.length, 200);
  assert.ok(page.flock.agents.every(finite));
});

test('D4: Generate lowers a min speed above the max speed to it, and shows it', () => {
  const page = loadPage({ seed: 1 });
  page.elements.flockRangeMinSpeed.value = '9';
  page.elements.flockRangeMaxSpeed.value = '2';
  page.load();
  assert.deepEqual([page.flock.minSpeed, page.flock.maxSpeed], [2, 2]);
  assert.equal(page.elements.flockRangeMinSpeed.value, '2');
  assert.equal(page.elements.flockInputMinSpeed.value, '2');
  page.click('nextButton');
  assert.ok(page.flock.agents.every((a) => Math.abs(speed(a) - 2) < 1e-12));
});

test('D4: moving one speed slider past the other moves the other with it', () => {
  const page = loadPage();
  page.load();
  page.setSlider('flockRangeMinSpeed', 4.5);
  assert.deepEqual([page.flock.minSpeed, page.flock.maxSpeed], [4.5, 4.5]);
  assert.deepEqual([page.elements.flockRangeMaxSpeed.value, page.elements.flockInputMaxSpeed.value], ['4.5', '4.5']);
  page.setSlider('flockRangeMaxSpeed', 1.2);
  assert.deepEqual([page.flock.minSpeed, page.flock.maxSpeed], [1.2, 1.2]);
  assert.deepEqual([page.elements.flockRangeMinSpeed.value, page.elements.flockInputMinSpeed.value], ['1.2', '1.2']);
  page.setSlider('flockRangeMaxSpeed', 3.7);
  assert.deepEqual([page.flock.minSpeed, page.flock.maxSpeed], [1.2, 3.7], 'raising max leaves min alone');
});

test('D5: variance gives agents their own numeric coefficients', () => {
  const page = loadPage();
  page.elements.flockRangeVariance.value = '100';
  page.load();
  const { flock } = page;
  assert.equal(flock.variance, 100);
  for(const key of ['seperation', 'alignment', 'cohesion'])
  {
    const values = flock.agents.map((a) => flock.Coefficient(a, key));
    assert.ok(values.every((v) => typeof v === 'number' && Number.isFinite(v)), key);
    assert.ok(new Set(values).size > 10, key + ' varies');
  }
});

test('D6: the nearby and close overlays cover the squares the neighbour search uses', () => {
  const page = loadPage();
  page.load();
  page.setCheckbox('flockNearby', true);
  page.setCheckbox('flockClose', true);
  page.click('nextButton');
  const agent = page.flock.agents[0];
  // GetNearbyAgents accepts |dx| < vision, so the square is 2 * vision wide.
  const rects = page.calls.filter(([name]) => name === 'rect');
  assert.ok(rects.some((call) => call.join() === ['rect', agent.x - 120, agent.y - 120, 240, 240].join()));
  assert.ok(rects.some((call) => call.join() === ['rect', agent.x - 40, agent.y - 40, 80, 80].join()));
  assert.ok(!rects.some(([, , , w]) => w === 120 || w === 40), 'no half-size squares');
});

test('D7: toggling an overlay or shape while paused redraws at once', () => {
  const page = loadPage();
  page.load();
  page.calls.length = 0;
  page.setCheckbox('flockNearby', true);
  assert.ok(page.calls.some(([name]) => name === 'fillText'), 'the overlay is drawn');
  page.calls.length = 0;
  page.setCheckbox('flockSizeShapeLine', true);
  assert.ok(page.calls.some(([name]) => name === 'clearRect'));
  assert.ok(!page.calls.some(([name]) => name === 'arc'), 'as lines');
  assert.equal(page.timers.size, 0, 'and it stays paused');
});

test('D8: keyboard shortcuts keep the play/pause button in sync', () => {
  const page = loadPage();
  page.load();
  page.key('i');
  assert.equal(page.timers.size, 1, 'running');
  assert.equal(page.elements.IS_PAUSED.style.display, 'none', 'the Pause button is shown');
  assert.equal(page.elements.IS_PLAYING.style.display, '');
  page.key('p');
  assert.equal(page.timers.size, 0, 'paused');
  assert.equal(page.elements.IS_PAUSED.style.display, '', 'the Play button is shown');
});

test('D9: a boundary box wider than half the canvas keeps agents on screen', () => {
  const page = loadPage({ width: 375, height: 667 });
  page.load();
  page.setSlider('flockRangeBoxX', 500);
  for(let i = 0; i < 100; i++) page.click('nextButton');
  // The inset is capped at 375 / 2 - 10, leaving a 10 px wide box.
  assert.ok(page.flock.agents.every((a) => finite(a) && a.x >= 180 && a.x <= 195));
  assert.equal(page.flock.boxX, 500, 'the setting itself is kept for a larger window');
  page.resize(1280, 720);
  page.setCheckbox('flockWrap', false);
  for(let i = 0; i < 100; i++) page.click('nextButton');
  assert.ok(page.flock.agents.every((a) => finite(a) && a.x >= 0 && a.x <= 1280));
});

test('D9: shrinking the window to a few pixels and back loses no agents', () => {
  const page = loadPage({ width: 800, height: 600 });
  page.load();
  page.click('IS_PAUSED');
  for(const [w, h] of [[200, 150], [6, 4], [0, 0], [1024, 768]])
  {
    page.resize(w, h);
    page.tick(200);
    assert.equal(page.flock.agents.length, 50);
    assert.ok(page.flock.agents.every(finite), `${w} × ${h}`);
  }
  assert.ok(page.flock.agents.every((a) => a.x >= 0 && a.x <= 1024 && a.y >= 0 && a.y <= 768));
});
