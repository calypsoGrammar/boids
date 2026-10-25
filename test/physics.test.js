// Deterministic physics tests for CAL-1284 (BOIDS-V1-03). Every scene has
// fixed agents (test/fixtures.js) or a seeded Flock.random, so each run
// replays exactly.
//
// Three kinds of test:
// - Plain tests check behaviour that is correct today and must survive the
//   fixes.
// - "KNOWN DEFECT Dn" tests assert the current, wrong behaviour of defect Dn
//   from docs/audit/BOIDS-V1-01.md. The fix has to change them on purpose.
// - "TARGET Dn" tests are marked todo. They state the intended behaviour and
//   fail until Dn is fixed (BOIDS-V1-04 / V1-05). node --test reports them
//   as todo and they don't fail the run. A fix removes the todo option.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPage } from './harness.js';
import { DEFAULTS, SPECIES, finite, scene, scripted, seeded, snapshot, speed, turnAngle } from './fixtures.js';

const near = (actual, expected, message, eps = 1e-12) =>
  assert.ok(Math.abs(actual - expected) <= eps, `${message ?? ''} expected ${expected}, got ${actual}`);
const todo = (id) => ({ todo: `${id}: fails until fixed, see docs/audit/BOIDS-V1-03.md` });
const colour = ([r, g, b]) => `rgba(${r},${g},${b}, 1)`;
// One frame of steering for agents[i] alone, without moving anything.
function steer(flock, i = 0)
{
  const agent = flock.agents[i];
  flock.GetNearbyAgents(agent, flock.agents.length);
  const before = { vx: agent.vx, vy: agent.vy };
  flock.Adjust(agent);
  return { dvx: agent.vx - before.vx, dvy: agent.vy - before.vy };
}

// --- The random seam -------------------------------------------------------

test('Flock.random defaults to Math.random, and Start() draws only from it', () => {
  const page = loadPage();
  page.load();
  assert.equal(page.eval('new Flock().random === Math.random'), true);
  const source = readFileSync(new URL('../src/javascripts/main.js', import.meta.url), 'utf8');
  assert.equal(source.match(/Math\.random\(/g), null, 'no direct draws');
  assert.match(source, /this\.random = Math\.random;/);
});

test('the same random source rebuilds the same flock in a fresh scene', () => {
  const build = (seed) => {
    const { flock } = scene({ flockSize: 30, raceCount: 3, variance: 50, random: seeded(seed) });
    flock.Start();
    return Array.from(flock.agents, (a) => ({ x: a.x, y: a.y, vx: a.vx, vy: a.vy, colour: a.colour, s: a.seperation, c: a.cohesion }));
  };
  assert.deepEqual(build(7), build(7));
  assert.notDeepEqual(build(7), build(8));
});

test('Start() maps random draws to colours, positions and signed speeds', () => {
  // Draws in order: 3 per species colour, then per agent x, y, vx, vy, the
  // two signs (negative above 0.5) and the species (no variance draws at 0).
  const { flock } = scene({ flockSize: 1, raceCount: 1, variance: 0,
    random: scripted([0.1, 0.2, 0.3, 0.25, 0.75, 0.8, 0.1, 0.9, 0.2, 0]) });
  flock.Start();
  const [agent] = flock.agents;
  assert.equal(agent.colour, 'rgba(25,51,76, 1)');
  // Spawned at (200, 450) with v = (-2, max(0.5, 0.25)), then Start() runs
  // one Update().
  assert.deepEqual(snapshot(flock), [{ x: 198, y: 450.5, vx: -2, vy: 0.5 }]);
});

// --- A single agent, no neighbours -----------------------------------------

test('an agent with no neighbours flies straight at constant velocity', () => {
  const { flock } = scene({ agents: [{ x: 400, y: 300, vx: 1.5, vy: -1 }] });
  for(let i = 0; i < 100; i++) flock.Update();
  assert.deepEqual(snapshot(flock), [{ x: 550, y: 200, vx: 1.5, vy: -1 }]);
  assert.deepEqual([...flock.agents[0].nearby], []);
});

test('neighbours count only strictly inside the 120 px vision square', () => {
  const { flock } = scene({ agents: [
    { x: 300, y: 300, vx: 1, vy: 1 },
    { x: 420, y: 300, vx: 1, vy: 1 }, // exactly 120 away: not seen
    { x: 300, y: 419, vx: 1, vy: 1 }, // 119 away
    { x: 339, y: 339, vx: 1, vy: 1 }, // diagonal 55 px, inside the 40 px close square
  ] });
  flock.GetNearbyAgents(flock.agents[0], 4);
  assert.deepEqual([...flock.agents[0].nearby], [2, 3]);
  assert.deepEqual([...flock.agents[0].close], [3]);
});

// --- Pairwise rule contributions -------------------------------------------

test('separation pushes a close pair apart, equally and oppositely', () => {
  const { flock } = scene({ alignment: 0, cohesion: 0, agents: [
    { x: 100, y: 100, vx: 1, vy: 0 },
    { x: 110, y: 104, vx: 1, vy: 0 },
  ] });
  const a = steer(flock, 0);
  // seperation * factor / delta, per axis: 0.1 * 10 / -10 and 0.1 * 10 / -4.
  near(a.dvx, -0.1);
  near(a.dvy, -0.25);
  const b = steer(flock, 1);
  near(b.dvx, 0.1);
  near(b.dvy, 0.25);
});

test('separation only acts inside the 40 px close square', () => {
  const { flock } = scene({ alignment: 0, cohesion: 0, agents: [
    { x: 100, y: 100, vx: 1, vy: 0 },
    { x: 140.5, y: 101, vx: 1, vy: 0 },
  ] });
  assert.deepEqual(steer(flock), { dvx: 0, dvy: 0 });
});

test('alignment steers by alignment × (average neighbour velocity − own)', () => {
  const { flock } = scene({ cohesion: 0, agents: [
    { x: 100, y: 100, vx: 1, vy: 0 },
    { x: 160, y: 130, vx: 0, vy: 2 },
  ] });
  const { dvx, dvy } = steer(flock);
  near(dvx, -0.1);
  near(dvy, 0.2);
});

test('cohesion steers by cohesion × (average neighbour position − own)', () => {
  const { flock } = scene({ alignment: 0, agents: [
    { x: 100, y: 100, vx: 1, vy: 0 },
    { x: 160, y: 130, vx: 1, vy: 0 },
  ] });
  const { dvx, dvy } = steer(flock);
  near(dvx, 60 * 0.0005);
  near(dvy, 30 * 0.0005);
});

test('the three rules add up', () => {
  const agents = [
    { x: 100, y: 100, vx: 1, vy: 0.5 },
    { x: 125, y: 113, vx: 0.2, vy: 1.4 },
    { x: 170, y: 60, vx: -0.7, vy: 0.9 },
  ];
  const only = (settings) => steer(scene({ agents, ...settings }).flock);
  const sep = only({ alignment: 0, cohesion: 0 });
  const ali = only({ seperation: 0, cohesion: 0 });
  const coh = only({ seperation: 0, alignment: 0 });
  const all = only({});
  near(all.dvx, sep.dvx + ali.dvx + coh.dvx, 'x', 1e-12);
  near(all.dvy, sep.dvy + ali.dvy + coh.dvy, 'y', 1e-12);
});

// --- Species bias ----------------------------------------------------------

const biasScene = (bias) => scene({ bias, cohesion: 0, agents: [
  { x: 100, y: 100, vx: 1, vy: 0, species: 0 },
  { x: 160, y: 100, vx: 0, vy: 1, species: 0 },
  { x: 100, y: 160, vx: 0, vy: -1, species: 1 },
] });

test('bias weighs other species 1/bias in alignment and cohesion', () => {
  const { flock } = biasScene(100);
  const { dvx, dvy } = steer(flock);
  // Weighted average velocity: (vb + vc / 100) / (1 + 1 / 100).
  near(dvx, -0.1);
  near(dvy, ((1 - 0.01) / 1.01) * 0.1);
  assert.deepEqual([...flock.agents[0].nearbyBias], [1]);
});

test('bias 0 and bias 1 both average all species equally', () => {
  const zero = steer(biasScene(0).flock);
  const one = steer(biasScene(1).flock);
  near(zero.dvx, -0.1);
  near(zero.dvy, 0);
  near(one.dvx, zero.dvx);
  near(one.dvy, zero.dvy);
});

test('separation ignores species', () => {
  const push = (species) => steer(scene({ alignment: 0, cohesion: 0, bias: 100, agents: [
    { x: 100, y: 100, vx: 1, vy: 0, species: 0 },
    { x: 110, y: 104, vx: 1, vy: 0, species },
  ] }).flock);
  assert.deepEqual(push(1), push(0));
});

// --- Speed bounds (intended 0.5 / 2.5) -------------------------------------

const clamp = (vx, vy) => {
  const { flock } = scene({ agents: [{ x: 400, y: 300, vx, vy }] });
  flock.MovePosition(flock.agents[0]);
  return flock.agents[0];
};

test('a speed above maxSpeed is scaled down to it, keeping the heading', () => {
  const agent = clamp(3, 4);
  near(agent.vx, 1.5);
  near(agent.vy, 2);
  near(speed(agent), DEFAULTS.maxSpeed);
});

test('speeds between minSpeed and maxSpeed are left alone', () => {
  for(const [vx, vy] of [[0.5, 0], [0, -2.5], [1, 1], [-0.3, 0.4]])
  {
    const agent = clamp(vx, vy);
    assert.deepEqual([agent.vx, agent.vy], [vx, vy]);
  }
});

test('KNOWN DEFECT D2: a speed below minSpeed is rescaled from the new vx', () => {
  const agent = clamp(0.12, 0.16);
  near(agent.vx, 0.3);
  near(agent.vy, 0.75, 'vy should be 0.4');
});

test('TARGET D2: a speed below minSpeed is scaled up to it, keeping the heading', todo('D2'), () => {
  const agent = clamp(0.12, 0.16);
  near(agent.vx, 0.3);
  near(agent.vy, 0.4);
});

test('KNOWN DEFECT D2: a zero velocity becomes NaN', () => {
  const agent = clamp(0, 0);
  assert.ok(Number.isNaN(agent.vx) && Number.isNaN(agent.x));
});

test('TARGET D2: a zero velocity leaves the agent finite at minSpeed', todo('D2'), () => {
  const agent = clamp(0, 0);
  assert.ok(finite(agent));
  near(speed(agent), DEFAULTS.minSpeed, 'speed', 1e-9);
});

test('TARGET D1: Generate keeps the 0.5 / 2.5 speed defaults', todo('D1'), () => {
  const page = loadPage();
  page.load();
  assert.deepEqual([page.flock.minSpeed, page.flock.maxSpeed], [0.5, 2.5]);
});

// --- Coincident axes -------------------------------------------------------

for(const [name, b] of [
  ['the same x', { x: 100, y: 120 }],
  ['the same y', { x: 120, y: 100 }],
  ['the same point', { x: 100, y: 100 }],
])
{
  const pair = () => scene({ agents: [{ x: 100, y: 100, vx: 1, vy: 0.5 }, { ...b, vx: -0.5, vy: 1 }] }).flock;

  test(`KNOWN DEFECT D3: two close agents on ${name} become NaN`, () => {
    const flock = pair();
    flock.Update();
    assert.ok(!finite(flock.agents[0]));
  });

  test(`TARGET D3: two close agents on ${name} stay finite and separate`, todo('D3'), () => {
    const flock = pair();
    const gap = () => Math.hypot(flock.agents[0].x - flock.agents[1].x, flock.agents[0].y - flock.agents[1].y);
    const before = gap();
    flock.Update();
    assert.ok(flock.agents.every(finite));
    assert.ok(gap() >= before);
  });
}

// --- Edges: wrap and turn --------------------------------------------------

test('wrap moves an agent past any edge to the opposite inside edge of the box', () => {
  // 800 × 600 canvas, box inset 100 / 50, radius 5: inside edges at x 105 and
  // 695, y 55 and 545.
  const cases = [
    [{ x: 104, y: 300 }, { x: 695, y: 300 }],
    [{ x: 696, y: 300 }, { x: 105, y: 300 }],
    [{ x: 400, y: 54 }, { x: 400, y: 545 }],
    [{ x: 400, y: 546 }, { x: 400, y: 55 }],
    [{ x: 50, y: 20 }, { x: 695, y: 545 }],
  ];
  for(const [from, to] of cases)
  {
    const { flock } = scene({ boxX: 100, boxY: 50, agents: [{ ...from, vx: 1, vy: -1 }] });
    flock.DetectEdgeCollisions(flock.agents[0]);
    assert.deepEqual(snapshot(flock), [{ ...to, vx: 1, vy: -1 }], JSON.stringify(from));
  }
});

test('turn mode changes velocity by exactly the turn factor per axis per frame', () => {
  const { flock } = scene({ wrap: false, boxX: 100, boxY: 50, agents: [{ x: 50, y: 580, vx: -1, vy: 1 }] });
  const agent = flock.agents[0];
  flock.DetectEdgeCollisions(agent);
  assert.deepEqual([agent.x, agent.y], [50, 580], 'the agent is not moved');
  near(agent.vx, -1 + 0.4);
  near(agent.vy, 1 - 0.4);
  assert.equal(agent.outBox, true);
});

test('turn mode with a large box margin brings an agent back within a bounded overshoot', () => {
  const { flock } = scene({ wrap: false, boxX: 150, boxY: 150, agents: [{ x: 600, y: 300, vx: 2, vy: 1 }] });
  const agent = flock.agents[0];
  let furthest = 0;
  let turnedAt = null;
  for(let frame = 0; frame < 200; frame++)
  {
    const before = { vx: agent.vx, vy: agent.vy };
    flock.Update();
    furthest = Math.max(furthest, agent.x);
    turnedAt ??= agent.vx < 0 ? frame : null;
    // Bounded turns: an isolated agent only turns through the edge rule.
    assert.ok(Math.abs(agent.vx - before.vx) <= 0.4 + 1e-12 && Math.abs(agent.vy - before.vy) <= 0.4 + 1e-12);
    assert.ok(turnAngle(before, agent) < Math.PI / 2);
  }
  // The inside edge is 800 - 5 - 150 = 645. Five frames of 0.4 stop vx = 2.
  assert.equal(furthest, 650);
  assert.equal(turnedAt, 28);
  assert.ok(agent.x > 0 && agent.x < 800 && agent.y > 0 && agent.y < 600);
});

test('KNOWN DEFECT D9: a box margin over half the canvas leaves an inverted box', () => {
  const { flock } = scene({ width: 375, height: 667, boxX: 200, agents: [{ x: 180, y: 300, vx: 1, vy: 0 }] });
  flock.DetectEdgeCollisions(flock.agents[0]);
  // 180 < 5 + 200, so it is wrapped to 375 - 5 - 200 = 170 and back again.
  assert.equal(flock.agents[0].x, 170);
});

test('TARGET D9: agents stay on the canvas whatever the box margin', todo('D9'), () => {
  const { flock } = scene({ width: 375, height: 667, boxX: 500, boxY: 500, random: seeded(1), flockSize: 20 });
  flock.Start();
  for(let i = 0; i < 100; i++) flock.Update();
  assert.ok(flock.agents.every((a) => finite(a) && a.x >= 0 && a.x <= 375 && a.y >= 0 && a.y <= 667));
});

// --- Per-agent variance ----------------------------------------------------

const varianceFlock = (variance) => {
  const { flock } = scene({ flockSize: 100, variance, random: seeded(5) });
  flock.Start();
  return flock;
};

test('variance 0 gives every agent the flock values', () => {
  for(const agent of varianceFlock(0).agents)
    assert.deepEqual([agent.seperation, agent.avoidance, agent.cohesion], ['0.10000', '0.10000', '0.00050']);
});

test('variance spreads per-agent values inside the slider limits', () => {
  const agents = varianceFlock(100).agents;
  const limits = { seperation: [0, 0.25], avoidance: [0, 0.25], cohesion: [0, 0.0025] };
  for(const [key, [min, max]] of Object.entries(limits))
  {
    const values = agents.map((a) => parseFloat(a[key]));
    assert.ok(values.every((v) => v >= min && v <= max), key);
    // Cohesion changes in steps of 0.001 (D5), so it takes only a few values.
    assert.ok(new Set(values).size > (key === 'cohesion' ? 2 : 10), key + ' varies');
  }
});

test('KNOWN DEFECT D5: per-agent values are strings that steering never reads', () => {
  const agents = [{ x: 100, y: 100, vx: 1, vy: 0 }, { x: 160, y: 130, vx: 0, vy: 2 }];
  const plain = steer(scene({ agents }).flock);
  const { flock } = scene({ agents });
  Object.assign(flock.agents[0], { seperation: '0.00000', avoidance: '0.00000', cohesion: '0.00000' });
  assert.deepEqual(steer(flock), plain);
});

test('TARGET D5: an agent steers with its own separation, alignment and cohesion', todo('D5'), () => {
  const { flock } = scene({ agents: [{ x: 100, y: 100, vx: 1, vy: 0 }, { x: 160, y: 130, vx: 0, vy: 2 }] });
  Object.assign(flock.agents[0], { seperation: 0, avoidance: 0, cohesion: 0 });
  assert.deepEqual(steer(flock), { dvx: 0, dvy: 0 });
});

// --- Species distributions and flock sizes ---------------------------------

test('species: each gets its own colour and a share of a 200-agent flock', () => {
  for(const raceCount of [1, 2, 10])
  {
    const { flock } = scene({ flockSize: 200, raceCount, random: seeded(11) });
    flock.Start();
    const counts = Object.values(Object.groupBy(flock.agents, (a) => a.colour)).map((g) => g.length);
    assert.equal(counts.length, raceCount);
    assert.ok(Math.min(...counts) >= 200 / raceCount / 2, `${raceCount}: ${counts}`);
  }
});

test('extreme flock sizes: 0 and 1 agents run without errors', () => {
  for(const flockSize of [0, 1])
  {
    const { flock } = scene({ flockSize, random: seeded(1) });
    flock.Start();
    for(let i = 0; i < 500; i++) flock.Update();
    assert.equal(flock.agents.length, flockSize);
    assert.ok(flock.agents.every(finite));
  }
});

// Flock-wide invariants with the intended settings over several seeds. They
// fail today through D2 (speeds outside the limits) and D3 (NaN agents).
const invariantRuns = [
  ['50 agents, wrap', { flockSize: 50 }, 1000],
  ['50 agents, turn, box 150', { flockSize: 50, wrap: false, boxX: 150, boxY: 150 }, 1000],
  ['200 agents, 10 species, bias 100', { flockSize: 200, raceCount: 10, bias: 100 }, 200],
];
for(const [name, settings, frames] of invariantRuns)
{
  test(`TARGET D2/D3: ${name} stays finite, on the canvas and inside the speed limits`, todo('D2, D3'), () => {
    for(const seed of [1, 2, 3, 4, 5])
    {
      const { flock } = scene({ ...settings, random: seeded(seed) });
      flock.Start();
      for(let frame = 0; frame < frames; frame++)
      {
        flock.Update();
        for(const a of flock.agents)
        {
          const where = `seed ${seed}, frame ${frame}, ${a.name}`;
          assert.ok(finite(a), where + ' is NaN');
          assert.ok(speed(a) >= flock.minSpeed - 1e-9 && speed(a) <= flock.maxSpeed + 1e-9, where + ' speed ' + speed(a));
          assert.ok(a.x >= 0 && a.x <= flock.width && a.y >= 0 && a.y <= flock.height, where + ' off canvas');
        }
      }
    }
  });
}

// --- Regression trajectory -------------------------------------------------

// Six agents of two species, fractional positions so no two share an axis
// (D3), and minSpeed 0 so the min clamp never runs (D2). Any change to the
// rules, the edges or the speed clamp moves these numbers. If a fix changes
// them on purpose, replace GOLDEN with the "actual" value from the failure.
const GOLDEN_AGENTS = [
  { x: 300.5, y: 200.25, vx: 1.2, vy: 0.7, species: 0 },
  { x: 330.75, y: 215.5, vx: 0.9, vy: 1.1, species: 0 },
  { x: 352.125, y: 180.875, vx: 1.4, vy: -0.3, species: 1 },
  { x: 280.375, y: 238.625, vx: -0.6, vy: 1.3, species: 1 },
  { x: 410.0625, y: 260.3125, vx: -1.1, vy: -0.8, species: 0 },
  { x: 250.8125, y: 160.4375, vx: 0.5, vy: 1.5, species: 1 },
];
const GOLDEN = [
  { x: 403.8244664181651, y: 375.9769715631104, vx: 0.4868981132540339, vy: 0.9946482105004784 },
  { x: 439.4468126684552, y: 410.7906689618342, vx: 0.5068119886172888, vy: 1.0232636871140646 },
  { x: 371.2388700537475, y: 297.255169893001, vx: 0.05560779991514665, vy: 0.7177036489389238 },
  { x: 328.4389521979729, y: 331.01480026072863, vx: 0.27813475949184774, vy: 0.544587890500839 },
  { x: 475.8581332714907, y: 445.67658439085744, vx: 0.5202492704968581, vy: 1.06174700482028 },
  { x: 323.07185344232624, y: 291.0462598017891, vx: 0.30535052089476555, vy: 0.7517381702001428 },
];

test('a fixed six-agent scene replays the recorded 200-frame trajectory', () => {
  const { flock } = scene({ minSpeed: 0, agents: GOLDEN_AGENTS });
  for(let i = 0; i < 200; i++)
  {
    flock.Update();
    assert.ok(flock.agents.every((a) => finite(a) && speed(a) <= DEFAULTS.maxSpeed + 1e-12), 'frame ' + i);
  }
  const actual = snapshot(flock);
  const close = actual.every((a, i) => ['x', 'y', 'vx', 'vy'].every((k) => Math.abs(a[k] - GOLDEN[i][k]) < 1e-9));
  assert.ok(close, 'actual: ' + JSON.stringify(actual));
  assert.deepEqual(Array.from(flock.agents, (a) => a.colour), GOLDEN_AGENTS.map((a) => colour(SPECIES[a.species])));
});
