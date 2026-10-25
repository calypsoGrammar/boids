// Deterministic fixtures for the flocking physics (BOIDS-V1-03). A scene is a
// Flock from main.js with fixed settings and a fixed list of agents, so a test
// can step it with no random draws at all. Random initialisation goes through
// Flock.random, which a scene always sets to a seeded or scripted source.
import { readFileSync } from 'node:fs';
import { loadPage } from './harness.js';

const source = readFileSync(new URL('../src/javascripts/main.js', import.meta.url), 'utf8');
// The inputs of index.html with their limits, as test/harness.js reads them.
const inputs = loadPage().elements;

// mulberry32, the same generator test/harness.js uses for Math.random.
export function seeded(seed)
{
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Returns the given values in order, then repeats them.
export function scripted(values)
{
  let i = 0;
  return () => values[i++ % values.length];
}

// Fixed, clearly different species colours, so fixtures never depend on the
// random palette in Start().
export const SPECIES = [[200, 30, 30], [30, 30, 200], [30, 160, 30], [150, 100, 0]];

// The defaults in index.html read as the numbers they show. This is the
// intended configuration: Main() truncates the speeds to 0 and 2 (D1).
export const DEFAULTS = {
  flockSize: 50,
  minSpeed: 0.5,
  maxSpeed: 2.5,
  seperation: 0.1,
  seperationFactor: 10,
  alignment: 0.1,
  cohesion: 0.0005,
  bias: 50,
  variance: 5,
  turnFactor: 0.4,
  raceCount: 2,
  shape: 'circle',
  boxX: 0,
  boxY: 0,
  wrap: true,
  nearby: false,
  close: false,
};

const ORDER = ['flockSize', 'minSpeed', 'maxSpeed', 'width', 'height', 'seperation',
  'seperationFactor', 'alignment', 'cohesion', 'bias', 'variance', 'turnFactor',
  'raceCount', 'shape', 'boxX', 'boxY', 'wrap', 'nearby', 'close'];

// Compiles main.js in this realm against a bare fake DOM. test/harness.js
// runs it in a node:vm context instead, where every global lookup (Math, for
// one) is about ten times slower, which would distort the benchmarks. Here
// the globals are function parameters. Returns the classes and the draw calls.
function compile()
{
  const calls = [];
  const ctx = { strokeStyle: '#000000', fillStyle: '#000000', lineWidth: 1 };
  for(const name of ['clearRect', 'beginPath', 'rect', 'stroke', 'moveTo', 'lineTo', 'arc', 'fill', 'fillText', 'setTransform'])
    ctx[name] = (...args) => calls.push([name, ...args]);
  const elements = {};
  const element = (id) => (elements[id] ??= { ...inputs[id], id, style: {}, getContext: () => ctx });
  const noop = () => {};
  const window = { innerWidth: 800, innerHeight: 600, addEventListener: noop };
  const document = {
    documentElement: { style: { setProperty: noop } },
    getElementById: element,
    getElementsByClassName: () => [],
    addEventListener: noop,
  };
  const load = new Function('window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame',
    source + '\nreturn { Flock, FlockAgent };');
  return { ...load(window, document, noop, noop), calls };
}

// Creates a Flock with DEFAULTS overridden by `settings`. `agents` are
// { x, y, vx, vy, species, offsets } objects; species indexes SPECIES and
// offsets ([seperation, alignment, cohesion], default 0) are the agent's
// variance offsets from the flock values. Without agents
// the flock is empty until flock.Start() is called. `calls` records what
// DrawFlock() draws; clear it when stepping for long.
export function scene({ width = 800, height = 600, agents = [], random = seeded(1), ...settings } = {})
{
  const { Flock, FlockAgent, calls } = compile();
  const options = { ...DEFAULTS, width, height, flockSize: agents.length || DEFAULTS.flockSize, ...settings };
  const flock = new Flock(...ORDER.map((key) => options[key]));
  flock.random = random;
  agents.forEach((a, i) => {
    const [s, al, c] = a.offsets ?? [0, 0, 0];
    flock.agents.push(new FlockAgent(i, s, al, c, 120, 40, 'Agent ' + i, 5, a.x, a.y, a.vx, a.vy,
      SPECIES[a.species ?? 0]));
  });
  return { flock, calls };
}

// Copies the moving state of every agent, for before/after comparisons.
export const snapshot = (flock) => flock.agents.map(({ x, y, vx, vy }) => ({ x, y, vx, vy }));

export const speed = (agent) => Math.hypot(agent.vx, agent.vy);
export const finite = (agent) => [agent.x, agent.y, agent.vx, agent.vy].every(Number.isFinite);
// Heading change in radians between two velocities, in [0, pi].
export function turnAngle(before, after)
{
  const cross = before.vx * after.vy - before.vy * after.vx;
  const dot = before.vx * after.vx + before.vy * after.vy;
  return Math.abs(Math.atan2(cross, dot));
}
