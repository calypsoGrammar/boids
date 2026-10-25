// Deterministic fixtures for the flocking physics (BOIDS-V1-03). A scene is a
// Flock from src/javascripts/flock.js with fixed settings and a fixed list of
// agents, so a test can step it with no random draws at all. Random
// initialisation goes through Flock.random, which a scene always sets to a
// seeded or scripted source. The physics and the renderer are imported
// directly: neither needs a DOM.
import { FlockAgent } from '../src/javascripts/agent.js';
import { Flock } from '../src/javascripts/flock.js';
import { drawFlock } from '../src/javascripts/renderer.js';
import { scripted, seeded } from './random.js';

export { scripted, seeded };

// Fixed, clearly different species colours, so fixtures never depend on the
// random palette in Start().
export const SPECIES = [[200, 30, 30], [30, 30, 200], [30, 160, 30], [150, 100, 0]];

// The defaults in index.html read as the numbers they show.
// test/settings.test.js checks they are the defaults of the settings model.
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
  direction: false,
};

// A recording 2D context: every call is pushed to `calls` as [name, ...args].
export function recorder()
{
  const calls = [];
  const ctx = { strokeStyle: '#000000', fillStyle: '#000000', lineWidth: 1 };
  for(const name of ['clearRect', 'beginPath', 'rect', 'stroke', 'moveTo', 'lineTo', 'arc', 'fill', 'fillText', 'setTransform'])
    ctx[name] = (...args) => calls.push([name, ...args]);
  return { ctx, calls };
}

// Creates a Flock with DEFAULTS overridden by `settings`. `agents` are
// { x, y, vx, vy, species, offsets } objects; species indexes SPECIES and
// offsets ([seperation, alignment, cohesion], default 0) are the agent's
// variance offsets from the flock values. Without agents the flock is empty
// until flock.Start() is called. `draw()` draws the flock with the view
// settings (shape, nearby, close, direction) and `calls` records what it
// draws; clear it when drawing for long.
export function scene({ width = 800, height = 600, agents = [], random = seeded(1), ...settings } = {})
{
  const { ctx, calls } = recorder();
  const options = { ...DEFAULTS, width, height, flockSize: agents.length || DEFAULTS.flockSize, ...settings };
  const flock = new Flock(options);
  flock.random = random;
  agents.forEach((a, i) => {
    const [s, al, c] = a.offsets ?? [0, 0, 0];
    flock.agents.push(new FlockAgent(i, s, al, c, 120, 40, 'Agent ' + i, 5, a.x, a.y, a.vx, a.vy,
      SPECIES[a.species ?? 0]));
  });
  return { flock, calls, draw: (view = options) => drawFlock(ctx, flock, view) };
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
