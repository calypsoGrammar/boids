// Deterministic physics tests for CAL-1284 (BOIDS-V1-03), updated for the
// fixes of CAL-1285 (BOIDS-V1-04, docs/audit/BOIDS-V1-04.md). Every scene has
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
//   CAL-1286 (BOIDS-V1-05) fixed the last one, D5.
//
// Since CAL-1288 (BOIDS-V1-07) the physics is its own module
// (src/javascripts/flock.js) and these tests import it directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Flock } from '../src/javascripts/flock.js';
import { loadPage } from './harness.js';
import { DEFAULTS, SPECIES, finite, scene, scripted, seeded, snapshot, speed, turnAngle } from './fixtures.js';

const near = (actual, expected, message, eps = 1e-12) =>
  assert.ok(Math.abs(actual - expected) <= eps, `${message ?? ''} expected ${expected}, got ${actual}`);
const colour = ([r, g, b]) => `rgba(${r},${g},${b}, 1)`;
// One frame of steering for agents[i] alone, without moving anything.
function steer(flock, i = 0)
{
  const agent = flock.agents[i];
  flock.GetNearbyAgents(agent, flock.agents.length);
  const [dvx, dvy] = flock.Steer(agent);
  return { dvx, dvy };
}

// --- The random seam -------------------------------------------------------

test('Flock.random defaults to Math.random, and Start() draws only from it', () => {
  assert.equal(new Flock().random, Math.random);
  for(const file of ['flock.js', 'agent.js', 'controller.js'])
  {
    const source = readFileSync(new URL('../src/javascripts/' + file, import.meta.url), 'utf8');
    assert.equal(source.match(/Math\.random\(/g), null, file + ' makes no direct draws');
  }
  // The page hands its random source to every flock it generates.
  const page = loadPage({ seed: 3 });
  page.load();
  const first = page.flock.agents.map((a) => a.x);
  const again = loadPage({ seed: 3 });
  again.load();
  assert.deepEqual(again.flock.agents.map((a) => a.x), first);
});

test('the same random source rebuilds the same flock in a fresh scene', () => {
  const build = (seed) => {
    const { flock } = scene({ flockSize: 30, raceCount: 3, variance: 50, random: seeded(seed) });
    flock.Start();
    return Array.from(flock.agents, (a) => ({ x: a.x, y: a.y, vx: a.vx, vy: a.vy, colour: a.colour,
      s: a.seperationOffset, c: a.cohesionOffset }));
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
  // Spawned inside the box edges 5..795 and 5..595: (5 + floor(0.25 * 790),
  // 5 + floor(0.75 * 590)) = (202, 447), with v = (-2, max(0.5, 0.25)).
  // Start() then runs one Step().
  assert.deepEqual(snapshot(flock), [{ x: 200, y: 447.5, vx: -2, vy: 0.5 }]);
});

test('Start() spawns every agent inside the box', () => {
  const { flock } = scene({ flockSize: 200, boxX: 150, boxY: 100, random: seeded(3) });
  flock.Start();
  // The box edges are 155..645 and 105..495; one Step() moves at most 2.5.
  assert.ok(flock.agents.every((a) => a.x >= 152.5 && a.x <= 647.5 && a.y >= 102.5 && a.y <= 497.5));
});

// --- A single agent, no neighbours -----------------------------------------

test('an agent with no neighbours flies straight at constant velocity', () => {
  const { flock } = scene({ agents: [{ x: 400, y: 300, vx: 1.5, vy: -1 }] });
  for(let i = 0; i < 100; i++) flock.Step();
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
  // seperation * factor / distance, away from the neighbour:
  // 0.1 * 10 * (-10, -4) / |(-10, -4)|^2 = (-10, -4) / 116.
  near(a.dvx, -10 / 116);
  near(a.dvy, -4 / 116);
  const b = steer(flock, 1);
  near(b.dvx, 10 / 116);
  near(b.dvy, 4 / 116);
});

test('separation strength falls with distance, the same in every direction', () => {
  const push = (x, y) => {
    const { dvx, dvy } = steer(scene({ alignment: 0, cohesion: 0, agents: [
      { x: 100, y: 100, vx: 1, vy: 0 }, { x, y, vx: 1, vy: 0 }] }).flock);
    return Math.hypot(dvx, dvy);
  };
  // 0.1 * 10 / distance.
  near(push(120, 100), 0.05, 'along x');
  near(push(100, 80), 0.05, 'along y');
  near(push(100 + 20 / Math.SQRT2, 100 + 20 / Math.SQRT2), 0.05, 'diagonal', 1e-12);
  near(push(110, 100), 0.1, 'half the distance');
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
});

test('bias between 0 and 1 weighs all species the same, as 0 and 1 do', () => {
  // A bias below 1 would otherwise make other species count more than the
  // agent's own, a social rule the simulation does not have.
  const zero = steer(biasScene(0).flock);
  for(const bias of [0.5, -3, NaN, Infinity])
  {
    const result = steer(biasScene(bias).flock);
    near(result.dvx, zero.dvx, String(bias));
    near(result.dvy, zero.dvy, String(bias));
  }
});

test('bias only shifts the weight between species in a mixed neighbourhood', () => {
  // Agent 0 sees two agents of species 1 only: whatever the bias, it aligns
  // and coheres with them as with its own species.
  const others = (bias) => steer(scene({ bias, agents: [
    { x: 100, y: 100, vx: 1, vy: 0, species: 0 },
    { x: 160, y: 100, vx: 0, vy: 1, species: 1 },
    { x: 100, y: 160, vx: 0, vy: -2, species: 1 },
  ] }).flock);
  for(const bias of [1, 2, 50, 100]) assert.deepEqual(others(bias), others(0), String(bias));
  // One species: the bias changes nothing.
  const same = (bias) => steer(scene({ bias, agents: [
    { x: 100, y: 100, vx: 1, vy: 0 },
    { x: 160, y: 100, vx: 0, vy: 1 },
    { x: 100, y: 160, vx: 0, vy: -2 },
  ] }).flock);
  for(const bias of [1, 2, 50, 100]) assert.deepEqual(same(bias), same(0), String(bias));
});

test('a higher bias pulls an agent towards its own species and away from others', () => {
  // Agent 0 at (100, 100) between one agent of its own species to the right
  // and three of another species below, all still. Cohesion only.
  const pull = (bias) => steer(scene({ bias, seperation: 0, alignment: 0, cohesion: 0.001, agents: [
    { x: 100, y: 100, vx: 0, vy: 0, species: 0 },
    { x: 160, y: 100, vx: 0, vy: 0, species: 0 },
    { x: 90, y: 150, vx: 0, vy: 0, species: 1 },
    { x: 100, y: 150, vx: 0, vy: 0, species: 1 },
    { x: 110, y: 150, vx: 0, vy: 0, species: 1 },
  ] }).flock);
  // Centre (sum x / d, sum y / d) / (1 + 3 / d) with d = max(1, bias).
  const expected = (d) => [((160 + 300 / d) / (1 + 3 / d) - 100) * 0.001, ((100 + 450 / d) / (1 + 3 / d) - 100) * 0.001];
  let previous = null;
  for(const bias of [0, 1, 2, 10, 100])
  {
    const { dvx, dvy } = pull(bias);
    const [ex, ey] = expected(Math.max(1, bias));
    near(dvx, ex, `x at ${bias}`);
    near(dvy, ey, `y at ${bias}`);
    if(previous && bias > 1) assert.ok(dvx > previous.dvx && dvy < previous.dvy, String(bias));
    previous = { dvx, dvy };
  }
});

test('species bias sorts a mixed flock by colour, and bias 0 does not', () => {
  // The share of each agent's neighbours that are its own species, after a
  // seeded 3-species flock has run for a while.
  const ownShare = (bias) => {
    const { flock } = scene({ flockSize: 90, raceCount: 3, bias, variance: 0, random: seeded(21) });
    flock.Start();
    for(let i = 0; i < 600; i++) flock.Step();
    let own = 0, all = 0;
    for(const agent of flock.agents)
    {
      flock.GetNearbyAgents(agent, flock.agents.length);
      all += agent.nearby.length;
      own += agent.nearby.filter((i) => flock.agents[i].colour === agent.colour).length;
      assert.ok(finite(agent));
    }
    return own / all;
  };
  const unbiased = ownShare(0);
  const biased = ownShare(100);
  assert.ok(biased > unbiased + 0.1, `own-species share ${unbiased} at bias 0, ${biased} at bias 100`);
});

test('neighbour search keeps only the nearby and close lists', () => {
  const { flock } = biasScene(100);
  flock.GetNearbyAgents(flock.agents[0], 3);
  assert.deepEqual(Object.keys(flock.agents[0]).filter((k) => /bias/i.test(k)), []);
  assert.deepEqual([...flock.agents[0].nearby], [1, 2]);
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

test('D2: a speed below minSpeed is scaled up to it, keeping the heading', () => {
  const agent = clamp(0.12, 0.16);
  near(agent.vx, 0.3);
  near(agent.vy, 0.4);
});

test('D2: a zero velocity leaves the agent finite at minSpeed', () => {
  const agent = clamp(0, 0);
  assert.ok(finite(agent));
  near(speed(agent), DEFAULTS.minSpeed, 'speed', 1e-12);
});

test('D2: a zero velocity starts along a fixed direction picked from the index', () => {
  const heading = (index) => {
    const { flock } = scene({ agents: [{ x: 400, y: 300, vx: 0, vy: 0 }] });
    const [agent] = flock.agents;
    agent.index = index;
    flock.MovePosition(agent);
    return [agent.vx, agent.vy];
  };
  assert.deepEqual(heading(0), [0.5, 0]);
  assert.deepEqual(heading(3), heading(3));
  assert.notDeepEqual(heading(3), heading(4));
});

test('D2: with minSpeed 0 a stopped agent stays where it is', () => {
  const { flock } = scene({ minSpeed: 0, agents: [{ x: 400, y: 300, vx: 0, vy: 0 }] });
  flock.MovePosition(flock.agents[0]);
  assert.deepEqual(snapshot(flock), [{ x: 400, y: 300, vx: 0, vy: 0 }]);
});

test('D2: a non-finite velocity is replaced by a finite one inside the limits', () => {
  for(const [vx, vy] of [[NaN, 1], [Infinity, 0], [-Infinity, Infinity]])
  {
    const agent = clamp(vx, vy);
    assert.ok(finite(agent), `${vx}, ${vy}`);
    near(speed(agent), DEFAULTS.minSpeed, `${vx}, ${vy}`, 1e-12);
  }
});

test('D2: both speed limits hold for any velocity, with fractional limits', () => {
  const random = seeded(9);
  for(let i = 0; i < 500; i++)
  {
    const { flock } = scene({ minSpeed: 0.7, maxSpeed: 1.3, agents: [{ x: 400, y: 300,
      vx: (random() - 0.5) * 10 ** (random() * 6 - 3), vy: (random() - 0.5) * 10 ** (random() * 6 - 3) }] });
    const [agent] = flock.agents;
    const before = { vx: agent.vx, vy: agent.vy };
    flock.MovePosition(agent);
    assert.ok(speed(agent) >= 0.7 - 1e-12 && speed(agent) <= 1.3 + 1e-12, String(speed(agent)));
    assert.ok(turnAngle(before, agent) < 1e-9, 'heading kept');
  }
});

test('D4: Validate() lowers a minSpeed above maxSpeed and repairs non-finite settings', () => {
  const settle = (settings) => {
    const { flock } = scene({ agents: [], ...settings });
    flock.Validate();
    return [flock.minSpeed, flock.maxSpeed, flock.boxX, flock.boxY];
  };
  assert.deepEqual(settle({}), [0.5, 2.5, 0, 0], 'the defaults are kept');
  assert.deepEqual(settle({ minSpeed: 0.3, maxSpeed: 0.7 }), [0.3, 0.7, 0, 0], 'fractions are kept');
  assert.deepEqual(settle({ minSpeed: 9, maxSpeed: 2 }), [2, 2, 0, 0]);
  assert.deepEqual(settle({ minSpeed: NaN, maxSpeed: Infinity }), [0.5, 2.5, 0, 0]);
  assert.deepEqual(settle({ minSpeed: -1, maxSpeed: '3' }), [0, 2.5, 0, 0]);
  assert.deepEqual(settle({ boxX: -20, boxY: NaN }), [0.5, 2.5, 0, 0]);
});

test('D4: Step() validates the settings before stepping', () => {
  const { flock } = scene({ agents: [{ x: 400, y: 300, vx: 3, vy: 4 }] });
  flock.minSpeed = 9;
  flock.maxSpeed = 2;
  flock.Step();
  near(speed(flock.agents[0]), 2, 'speed', 1e-12);
});

test('D1: Generate keeps the 0.5 / 2.5 speed defaults', () => {
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

  // The pair may be closing faster than one frame of separation can stop,
  // so "separate" is checked on the push itself and over time.
  test(`D3: two close agents on ${name} stay finite and are pushed apart`, () => {
    const flock = pair();
    const [a, b] = flock.agents;
    flock.alignment = 0;
    flock.cohesion = 0;
    const pa = steer(flock, 0);
    const pb = steer(flock, 1);
    assert.ok([pa.dvx, pa.dvy, pb.dvx, pb.dvy].every(Number.isFinite));
    near(pa.dvx, -pb.dvx, 'equal and opposite x');
    near(pa.dvy, -pb.dvy, 'equal and opposite y');
    assert.ok(Math.hypot(pa.dvx, pa.dvy) > 0, 'pushed');
    // Away from the other agent (any direction will do at the same point).
    if(b.x !== a.x || b.y !== a.y) assert.ok(pa.dvx * (b.x - a.x) + pa.dvy * (b.y - a.y) < 0);

    const gap = () => Math.hypot(a.x - b.x, a.y - b.y);
    for(let i = 0; i < 100; i++)
    {
      flock.Step();
      assert.ok(flock.agents.every(finite), 'frame ' + i);
    }
    assert.ok(gap() >= 20, 'apart after 100 frames: ' + gap());
  });
}

test('D3: the push is capped for agents closer than one pixel', () => {
  const push = (dx) => {
    const { dvx, dvy } = steer(scene({ alignment: 0, cohesion: 0, agents: [
      { x: 100, y: 100, vx: 1, vy: 0 }, { x: 100 + dx, y: 100, vx: 1, vy: 0 }] }).flock);
    return Math.hypot(dvx, dvy);
  };
  // seperation * factor / 1 at most.
  for(const dx of [1, 0.5, 1e-9, 1e-300, 0]) near(push(dx), 1, String(dx));
});

test('D3: a stack of agents on one point spreads out, deterministically and finitely', () => {
  const run = () => {
    const agents = Array.from({ length: 12 }, () => ({ x: 400, y: 300, vx: 0, vy: 0 }));
    const { flock } = scene({ agents });
    for(let i = 0; i < 60; i++)
    {
      flock.Step();
      assert.ok(flock.agents.every(finite), 'frame ' + i);
    }
    return snapshot(flock);
  };
  const first = run();
  assert.deepEqual(run(), first);
  assert.equal(new Set(first.map(({ x, y }) => x + ',' + y)).size, 12, 'no two agents share a point');
});

test('D3: a default 200-agent flock on whole-pixel spawns keeps every agent (seeds 1-5)', () => {
  for(const seed of [1, 2, 3, 4, 5])
  {
    const { flock } = scene({ flockSize: 200, width: 1280, height: 720, random: seeded(seed) });
    flock.Start();
    for(let i = 0; i < 50; i++) flock.Step();
    assert.ok(flock.agents.every(finite), 'seed ' + seed);
  }
});

// --- One consistent state per tick -----------------------------------------

test('every agent steers from the state at the start of the tick', () => {
  const agents = [
    { x: 100, y: 100, vx: 1, vy: 0.5 },
    { x: 112, y: 104, vx: 0.2, vy: 1.4 },
    { x: 130, y: 90, vx: -0.7, vy: 0.9 },
    { x: 104, y: 125, vx: 0.3, vy: -1.1, species: 1 },
  ];
  // Each agent's steering, computed from the untouched start state.
  const { flock: still } = scene({ agents });
  const expected = still.agents.map((agent) => {
    still.GetNearbyAgents(agent, still.agents.length);
    const [dvx, dvy] = still.Steer(agent);
    return [agent.vx + dvx, agent.vy + dvy];
  });
  const { flock } = scene({ agents });
  flock.Step();
  flock.agents.forEach((agent, i) => {
    const [vx, vy] = expected[i];
    const s = Math.hypot(vx, vy);
    const limited = Math.min(Math.max(s, flock.minSpeed), flock.maxSpeed);
    near(agent.vx, vx / s * limited, 'vx ' + i, 1e-12);
    near(agent.vy, vy / s * limited, 'vy ' + i, 1e-12);
  });
});

test('the order of the agents does not change where they go', () => {
  const agents = [
    { x: 300.25, y: 200.75, vx: 1.2, vy: 0.7, species: 0 },
    { x: 330.5, y: 215, vx: 0.9, vy: 1.1, species: 0 },
    { x: 352, y: 181.5, vx: 1.4, vy: -0.3, species: 1 },
    { x: 280, y: 238, vx: -0.6, vy: 1.3, species: 1 },
    { x: 309.75, y: 200.75, vx: -1.1, vy: -0.8, species: 0 },
    { x: 250.5, y: 161, vx: 0.5, vy: 1.5, species: 1 },
  ];
  const run = (list) => {
    const { flock } = scene({ agents: list });
    for(let i = 0; i < 100; i++) flock.Step();
    return snapshot(flock);
  };
  const forward = run(agents);
  const backward = run([...agents].reverse()).reverse();
  forward.forEach((a, i) => {
    for(const k of ['x', 'y', 'vx', 'vy']) near(backward[i][k], a[k], `${k} ${i}`, 1e-9);
  });
});

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
    flock.Step();
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

test('D9: a box margin over half the canvas is capped to leave a 10 px box', () => {
  const { flock } = scene({ width: 375, height: 667, boxX: 200, agents: [{ x: 180, y: 300, vx: 1, vy: 0 }] });
  // The inset is capped at 375 / 2 - 10 = 177.5: edges 182.5 and 192.5.
  assert.deepEqual(flock.Edges(200, 375, 5), [182.5, 192.5]);
  flock.DetectEdgeCollisions(flock.agents[0]);
  assert.equal(flock.agents[0].x, 192.5);
  flock.DetectEdgeCollisions(flock.agents[0]);
  assert.equal(flock.agents[0].x, 192.5, 'and it stays there');
});

test('D9: box edges follow the canvas size, down to a canvas smaller than an agent', () => {
  const { flock } = scene({ agents: [] });
  assert.deepEqual(flock.Edges(0, 800, 5), [5, 795]);
  assert.deepEqual(flock.Edges(100, 800, 5), [105, 695]);
  assert.deepEqual(flock.Edges(500, 800, 5), [395, 405]);
  assert.deepEqual(flock.Edges(0, 20, 5), [5, 15]);
  assert.deepEqual(flock.Edges(30, 20, 5), [5, 15]);
  assert.deepEqual(flock.Edges(0, 8, 5), [4, 4], 'collapsed to the middle');
  assert.deepEqual(flock.Edges(0, 0, 5), [0, 0]);
});

test('D9: the drawn box is the capped box', () => {
  const { calls, draw } = scene({ width: 375, height: 200, boxX: 500, boxY: 60, agents: [] });
  draw();
  assert.deepEqual(calls.find(([name]) => name === 'rect'), ['rect', 177.5, 60, 20, 80]);
});

for(const wrap of [true, false])
{
  test(`D9: agents stay finite and come back on a tiny or shrinking canvas (${wrap ? 'wrap' : 'turn'})`, () => {
    const { flock } = scene({ wrap, width: 800, height: 600, boxX: 40, boxY: 40, flockSize: 50, random: seeded(2) });
    flock.Start();
    for(const [w, h] of [[120, 90], [12, 9], [3, 2], [0, 0], [320, 240]])
    {
      flock.width = w;
      flock.height = h;
      for(let i = 0; i < 400; i++) flock.Step();
      assert.equal(flock.agents.length, 50);
      assert.ok(flock.agents.every(finite), `${w} × ${h}`);
    }
    // Back on a usable canvas, every agent is on it again.
    assert.ok(flock.agents.every((a) => a.x >= 0 && a.x <= 320 && a.y >= 0 && a.y <= 240));
  });
}

test('D9: agents stay on the canvas whatever the box margin', () => {
  const { flock } = scene({ width: 375, height: 667, boxX: 500, boxY: 500, random: seeded(1), flockSize: 20 });
  flock.Start();
  for(let i = 0; i < 100; i++) flock.Step();
  assert.ok(flock.agents.every((a) => finite(a) && a.x >= 0 && a.x <= 375 && a.y >= 0 && a.y <= 667));
});

// --- Per-agent variance ----------------------------------------------------

const varianceFlock = (variance, seed = 5) => {
  const { flock } = scene({ flockSize: 100, variance, random: seeded(seed) });
  flock.Start();
  return flock;
};
const KEYS = ['seperation', 'alignment', 'cohesion'];
const coefficients = (flock) => flock.agents.map((a) => KEYS.map((key) => flock.Coefficient(a, key)));

test('variance 0 gives every agent the flock values', () => {
  const flock = varianceFlock(0);
  for(const agent of flock.agents)
    assert.deepEqual([agent.seperationOffset, agent.alignmentOffset, agent.cohesionOffset], [0, 0, 0]);
  for(const values of coefficients(flock)) assert.deepEqual(values, [0.1, 0.1, 0.0005]);
});

test('variance spreads per-agent numbers inside the slider limits', () => {
  const limits = { seperation: [0, 0.25], alignment: [0, 0.25], cohesion: [0, 0.0025] };
  for(const variance of [5, 50, 100])
  {
    const flock = varianceFlock(variance);
    assert.deepEqual(flock.limits, limits);
    KEYS.forEach((key, k) => {
      const [min, max] = limits[key];
      const offsets = flock.agents.map((a) => a[key + 'Offset']);
      assert.ok(offsets.every((o) => typeof o === 'number' && Number.isFinite(o)), key);
      // Each offset is at most variance % of the slider range either way.
      assert.ok(offsets.every((o) => Math.abs(o) <= ((max - min) * variance) / 100), key);
      const values = coefficients(flock).map((v) => v[k]);
      assert.ok(values.every((v) => Number.isFinite(v) && v >= min && v <= max), key);
      assert.ok(new Set(values).size > 50, `${key} varies at ${variance}`);
    });
  }
});

test('variance draws are reproducible and grow with the variance', () => {
  assert.deepEqual(coefficients(varianceFlock(50)), coefficients(varianceFlock(50)));
  assert.notDeepEqual(coefficients(varianceFlock(50, 5)), coefficients(varianceFlock(50, 6)));
  // The same draws scaled: the offsets at 50 are ten times those at 5.
  const small = varianceFlock(5).agents;
  varianceFlock(50).agents.forEach((a, i) => near(a.cohesionOffset, small[i].cohesionOffset * 10, 'cohesion', 1e-15));
});

test('D5: an agent steers with its own separation, alignment and cohesion', () => {
  const agents = (offsets) => [{ x: 100, y: 100, vx: 1, vy: 0, offsets }, { x: 130, y: 110, vx: 0, vy: 2 }];
  // Offsets of minus the flock values switch every rule off for agent 0.
  assert.deepEqual(steer(scene({ agents: agents([-0.1, -0.1, -0.0005]) }).flock), { dvx: 0, dvy: 0 });
  // One rule at a time: an offset scales that rule's part of the steering.
  const only = (settings, offsets) => steer(scene({ ...settings, agents: agents(offsets) }).flock);
  for(const [k, settings] of [
    [0, { alignment: 0, cohesion: 0 }],
    [1, { seperation: 0, cohesion: 0 }],
    [2, { seperation: 0, alignment: 0 }],
  ])
  {
    const flockValue = [0.1, 0.1, 0.0005][k];
    const plain = only(settings, [0, 0, 0]);
    const offsets = [0, 0, 0];
    offsets[k] = flockValue;
    const doubled = only({ ...settings, [KEYS[k]]: flockValue }, offsets);
    near(doubled.dvx, plain.dvx * 2, KEYS[k], 1e-12);
    near(doubled.dvy, plain.dvy * 2, KEYS[k], 1e-12);
    assert.notEqual(plain.dvx, 0, KEYS[k]);
  }
});

test('an agent coefficient stays inside the slider limits whatever its offset', () => {
  const { flock } = scene({ agents: [{ x: 100, y: 100, vx: 1, vy: 0, offsets: [1, -1, NaN] }] });
  const [agent] = flock.agents;
  assert.deepEqual(KEYS.map((key) => flock.Coefficient(agent, key)), [0.25, 0, 0]);
});

test('the flock sliders move every agent, keeping its offset', () => {
  const flock = varianceFlock(20);
  const before = coefficients(flock);
  flock.alignment = 0.15;
  coefficients(flock).forEach((values, i) => {
    assert.equal(values[0], before[i][0]);
    // +0.05, unless the limits cut it.
    const expected = Math.min(0.25, Math.max(0, 0.15 + flock.agents[i].alignmentOffset));
    near(values[1], expected, 'alignment', 1e-15);
  });
});

test('variance changes how a seeded flock moves', () => {
  const run = (variance) => {
    const { flock } = scene({ flockSize: 50, variance, random: seeded(9) });
    flock.Start();
    for(let i = 0; i < 300; i++) flock.Step();
    assert.ok(flock.agents.every((a) => finite(a) && speed(a) <= flock.maxSpeed + 1e-9));
    return snapshot(flock);
  };
  assert.deepEqual(run(30), run(30), 'reproducible');
  // The draws for the colours and the first agent's position are the same,
  // so any difference comes from the coefficients.
  assert.notDeepEqual(run(30), run(0));
});

test('two agents in the same situation steer differently when their offsets differ', () => {
  // Mirror-image pairs: agent 0 and agent 2 each see one neighbour 30 px
  // ahead, in their own copy of the scene 400 px apart.
  const { flock } = scene({ agents: [
    { x: 100, y: 100, vx: 1, vy: 0, offsets: [0.05, -0.05, 0.0002] },
    { x: 130, y: 110, vx: 0, vy: 2 },
    { x: 500, y: 100, vx: 1, vy: 0, offsets: [-0.05, 0.05, -0.0002] },
    { x: 530, y: 110, vx: 0, vy: 2 },
  ] });
  const a = steer(flock, 0);
  const b = steer(flock, 2);
  assert.ok(Math.abs(a.dvx - b.dvx) > 1e-3 || Math.abs(a.dvy - b.dvy) > 1e-3, JSON.stringify([a, b]));
});

// Checksums of four seeded runs at variance 0, recorded from CAL-1285
// (0f4a714) before the per-agent coefficients and before nearbyBias and
// closeBias were removed. Same numbers: neither change moves an agent when
// variance is 0, for bias 0, 7 and 100 and in wrap and turn modes.
test('variance 0 replays the CAL-1285 trajectories exactly', async () => {
  const { createHash } = await import('node:crypto');
  const runs = [
    [1, 300, { flockSize: 50 }, 'e087a2fb66a2ae49'],
    [3, 100, { flockSize: 200, raceCount: 10, bias: 100 }, 'a3b05b8aedf1b79d'],
    [4, 100, { flockSize: 120, raceCount: 3, bias: 0 }, 'a728fa4fcc239bb1'],
    [5, 100, { flockSize: 120, raceCount: 4, bias: 7, wrap: false, boxX: 100, boxY: 80 }, 'f045f28da24dca2b'],
  ];
  for(const [seed, frames, settings, checksum] of runs)
  {
    const { flock } = scene({ width: 1280, height: 720, random: seeded(seed), variance: 0, ...settings });
    flock.Start();
    for(let i = 0; i < frames; i++) flock.Step();
    const state = new Float64Array(flock.agents.flatMap((a) => [a.x, a.y, a.vx, a.vy]));
    assert.equal(createHash('sha256').update(state).digest('hex').slice(0, 16), checksum, String(seed));
  }
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

test('species count: no species, fractions and non-numbers still give a valid flock', () => {
  for(const [raceCount, expected] of [[0, 1], [-2, 1], [NaN, 1], [2.7, 2], [Infinity, 1], [1, 1]])
  {
    const { flock } = scene({ flockSize: 30, raceCount, random: seeded(4) });
    flock.Start();
    for(let i = 0; i < 20; i++) flock.Step();
    assert.equal(flock.raceCount, expected, String(raceCount));
    assert.equal(new Set(flock.agents.map((a) => a.colour)).size, expected, String(raceCount));
    assert.ok(flock.agents.every(finite), String(raceCount));
  }
});

test('species never share a colour', () => {
  // The second species first draws the first one's colour, then a new one.
  const { flock } = scene({ flockSize: 40, raceCount: 2, variance: 0,
    random: scripted([0.1, 0.2, 0.3, 0.1, 0.2, 0.3, 0.5, 0.6, 0.7, 0.4, 0.4, 0.3, 0.3, 0.6, 0.6, 0.99]) });
  flock.Start();
  assert.deepEqual([...new Set(flock.agents.map((a) => a.colour))].sort(), ['rgba(127,153,178, 1)', 'rgba(25,51,76, 1)']);
});

test('variance outside 0..100 is limited when the flock is generated', () => {
  for(const [variance, expected] of [[-10, 0], [NaN, 0], ['abc', 0], [250, 100], [30, 30]])
  {
    const { flock } = scene({ flockSize: 20, variance, random: seeded(2) });
    flock.Start();
    assert.equal(flock.variance, expected, String(variance));
    assert.ok(coefficients(flock).flat().every(Number.isFinite));
  }
});

test('extreme flock sizes: 0 and 1 agents run without errors', () => {
  for(const flockSize of [0, 1])
  {
    const { flock } = scene({ flockSize, random: seeded(1) });
    flock.Start();
    for(let i = 0; i < 500; i++) flock.Step();
    assert.equal(flock.agents.length, flockSize);
    assert.ok(flock.agents.every(finite));
  }
});

// Flock-wide invariants with the intended settings over several seeds. They
// failed before CAL-1285 through D2 (speeds outside the limits) and D3 (NaN
// agents).
const invariantRuns = [
  ['50 agents, wrap', { flockSize: 50 }, 1000],
  ['50 agents, turn, box 150', { flockSize: 50, wrap: false, boxX: 150, boxY: 150 }, 1000],
  ['200 agents, 10 species, bias 100', { flockSize: 200, raceCount: 10, bias: 100 }, 200],
];
for(const [name, settings, frames] of invariantRuns)
{
  test(`D2/D3: ${name} stays finite, on the canvas and inside the speed limits`, () => {
    for(const seed of [1, 2, 3, 4, 5])
    {
      const { flock } = scene({ ...settings, random: seeded(seed) });
      flock.Start();
      for(let frame = 0; frame < frames; frame++)
      {
        flock.Step();
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

// Six agents of two species with fractional positions, and minSpeed 0 so the
// min clamp never runs. Recorded again for CAL-1285 (vector separation and
// one state per tick). Any change to the rules, the edges or the speed clamp
// moves these numbers. If a fix changes them on purpose, replace GOLDEN with
// the "actual" value from the failure.
const GOLDEN_AGENTS = [
  { x: 300.5, y: 200.25, vx: 1.2, vy: 0.7, species: 0 },
  { x: 330.75, y: 215.5, vx: 0.9, vy: 1.1, species: 0 },
  { x: 352.125, y: 180.875, vx: 1.4, vy: -0.3, species: 1 },
  { x: 280.375, y: 238.625, vx: -0.6, vy: 1.3, species: 1 },
  { x: 410.0625, y: 260.3125, vx: -1.1, vy: -0.8, species: 0 },
  { x: 250.8125, y: 160.4375, vx: 0.5, vy: 1.5, species: 1 },
];
const GOLDEN = [
  { x: 389.5605746409004, y: 306.6493133690321, vx: 0.43322209345259, vy: 0.5150282996032911 },
  { x: 410.39737064119015, y: 346.51547579596496, vx: 0.3614222639921819, vy: 0.6537949571076873 },
  { x: 422.1732258089145, y: 305.51363567448146, vx: 0.34125929139810335, vy: 0.5436608856591736 },
  { x: 368.49819864152863, y: 346.59868887427706, vx: 0.4387242045524675, vy: 0.5258273292761453 },
  { x: 450.431778715177, y: 345.3848899410847, vx: 0.36413374360168005, vy: 0.6184674005639793 },
  { x: 350.37972292423296, y: 306.68853222471114, vx: 0.39635269591783334, vy: 0.6502129576133624 },
];

test('a fixed six-agent scene replays the recorded 200-frame trajectory', () => {
  const { flock } = scene({ minSpeed: 0, agents: GOLDEN_AGENTS });
  for(let i = 0; i < 200; i++)
  {
    flock.Step();
    assert.ok(flock.agents.every((a) => finite(a) && speed(a) <= DEFAULTS.maxSpeed + 1e-12), 'frame ' + i);
  }
  const actual = snapshot(flock);
  const close = actual.every((a, i) => ['x', 'y', 'vx', 'vy'].every((k) => Math.abs(a[k] - GOLDEN[i][k]) < 1e-9));
  assert.ok(close, 'actual: ' + JSON.stringify(actual));
  assert.deepEqual(Array.from(flock.agents, (a) => a.colour), GOLDEN_AGENTS.map((a) => colour(SPECIES[a.species])));
});
