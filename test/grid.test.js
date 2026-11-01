// The spatial grid (CAL-1482) must find exactly the neighbours the all-pairs
// search finds, in the same order, and must not change a simulation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scene, seeded } from './fixtures.js';

const lists = (flock) => flock.agents.map((a) => [[...a.nearby], [...a.close]]);

function bothSearches(flock)
{
  const n = flock.agents.length;
  flock.agents.forEach((a) => flock.GetNearbyAgents(a, n));
  const allPairs = lists(flock);
  assert.equal(flock.BuildGrid(n), true);
  flock.agents.forEach((a) => flock.GetNearbyAgentsGrid(a));
  return [allPairs, lists(flock)];
}

for(const [name, settings] of [
  ['wrapping 1000', { flockSize: 1000 }],
  ['dense 200', { flockSize: 200 }],
  ['turn box 300', { flockSize: 300, wrap: false, boxX: 150, boxY: 150 }],
])
{
  test(`grid neighbours equal all-pairs neighbours: ${name}`, () => {
    const { flock } = scene({ width: 1280, height: 720, random: seeded(7), ...settings });
    flock.Start();
    for(let tick = 0; tick < 20; tick++)
    {
      const [allPairs, grid] = bothSearches(flock);
      assert.deepEqual(grid, allPairs);
      flock.Step();
    }
  });
}

test('grid handles lost (NaN), far-off and coincident agents like all-pairs', () => {
  const { flock } = scene({ width: 800, height: 600, random: seeded(3), flockSize: 100 });
  flock.Start();
  flock.agents[3].y = NaN;
  flock.agents[4].y = Infinity;
  flock.agents[9].x = -Infinity;
  flock.agents[5].x = -5000;
  flock.agents[6].x = flock.agents[7].x;
  flock.agents[6].y = flock.agents[7].y;
  flock.agents[8].x = 1e9;
  const [allPairs, grid] = bothSearches(flock);
  assert.deepEqual(grid, allPairs);
});

test('a flock with an x of NaN is searched all-pairs, which lets it through the x test', () => {
  const { flock } = scene({ width: 800, height: 600, random: seeded(3), flockSize: 100 });
  flock.Start();
  flock.agents[3].x = NaN;
  assert.equal(flock.BuildGrid(100), false);
});

test('a vision that is not a finite positive number falls back to all-pairs', () => {
  const { flock } = scene({ width: 800, height: 600, random: seeded(3), flockSize: 100 });
  flock.Start();
  flock.agents[0].vision = Infinity;
  assert.equal(flock.BuildGrid(100), false);
  flock.Step();
  assert.equal(flock.agents[0].nearby.length === 99, true, 'all-pairs search ran');
});

test('Step gives the same flock with the grid as with all-pairs', () => {
  const run = (useGrid) => {
    const { flock } = scene({ width: 1280, height: 720, random: seeded(11), flockSize: 300 });
    if(!useGrid) flock.BuildGrid = () => false;
    flock.Start();
    for(let i = 0; i < 50; i++) flock.Step();
    return flock.agents.map((a) => [a.x, a.y, a.vx, a.vy]);
  };
  assert.deepEqual(run(true), run(false));
});

// The whole of Step(): two identically seeded flocks, one searched with the
// grid and one all-pairs, must hold the same neighbour lists and state after
// every tick, including the awkward agents and a canvas shrunk mid-run.
for(const wrap of [true, false])
{
  test(`Step with the grid equals Step with all-pairs on every tick, awkward agents included (${wrap ? 'wrap' : 'turn'})`, () => {
    let gridTicks = 0;
    const make = (useGrid) => {
      const { flock } = scene({ width: 900, height: 600, random: seeded(21), flockSize: 150, raceCount: 3, bias: 4, wrap, boxX: 60, boxY: 60 });
      const build = flock.BuildGrid;
      flock.BuildGrid = useGrid ? (n) => { const ok = build.call(flock, n); if(ok) gridTicks++; return ok; } : () => false;
      flock.Start();
      const a = flock.agents;
      a[3].y = NaN;
      a[4].y = Infinity;
      a[9].x = -Infinity;
      a[5].x = -5000;
      a[8].x = 1e9;
      a[6].x = a[7].x;
      a[6].y = a[7].y;
      a[6].vx = a[7].vx;
      a[6].vy = a[7].vy;
      return flock;
    };
    const state = (flock) => flock.agents.map((a) =>
      [a.x, a.y, a.vx, a.vy, a.outBox, [...a.nearby], [...a.close]]);
    const withGrid = make(true);
    const allPairs = make(false);
    for(let tick = 0; tick < 40; tick++)
    {
      // Shrunk so many agents are off the canvas and keep their stale lists,
      // then widened again.
      if(tick === 10) for(const f of [withGrid, allPairs]) { f.width = 300; f.height = 200; }
      if(tick === 25) for(const f of [withGrid, allPairs]) { f.width = 900; f.height = 600; }
      withGrid.Step();
      allPairs.Step();
      assert.deepEqual(state(withGrid), state(allPairs), `tick ${tick}`);
    }
    assert.ok(gridTicks >= 30, 'the grid search ran on most ticks');
  });
}
