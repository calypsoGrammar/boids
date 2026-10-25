// Reproducible benchmark scenarios for later optimisation (BOIDS-V1-03).
// Each scenario is a seeded flock with fixed settings, stepped headlessly:
// each frame is one Flock.Step() and one DrawFlock(), timed apart (drawing
// goes to the recording canvas of test/fixtures.js, so msPerDraw is the cost
// of issuing the calls, not of painting). `checksum` hashes the final state
// of every agent, so an optimisation that is meant to keep behaviour must
// keep the checksum. `cpuPerSecond` estimates the share of one core the page
// uses while playing: 125 ticks and 60 draws a second (BOIDS-V1-06).
//
//   npm run bench                  all scenarios, default frame counts
//   npm run bench -- dense-200     one scenario
//   npm run bench -- --frames 50   override the frame count
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { finite, scene, seeded } from './fixtures.js';

export const SCENARIOS = {
  'default-50': { seed: 1, frames: 2000, settings: { flockSize: 50 } },
  'dense-200': { seed: 2, frames: 500, settings: { flockSize: 200 } },
  'species-200': { seed: 3, frames: 500, settings: { flockSize: 200, raceCount: 10, bias: 100 } },
  'turn-box-200': { seed: 4, frames: 500, settings: { flockSize: 200, wrap: false, boxX: 150, boxY: 150 } },
  'overlays-200': { seed: 5, frames: 300, settings: { flockSize: 200, shape: 'line', nearby: true, close: true } },
  // Beyond the slider's 200, to show how the all-pairs neighbour search scales.
  'stress-1000': { seed: 6, frames: 100, settings: { flockSize: 1000 } },
};

export function runScenario(name, frames = SCENARIOS[name].frames)
{
  const { seed, settings } = SCENARIOS[name];
  const { calls, flock } = scene({ width: 1280, height: 720, random: seeded(seed), ...settings });
  flock.Start();
  let stepMs = 0;
  let drawMs = 0;
  for(let i = 0; i < frames; i++)
  {
    calls.length = 0;
    const start = performance.now();
    flock.Step();
    const stepped = performance.now();
    flock.DrawFlock(flock.shape);
    stepMs += stepped - start;
    drawMs += performance.now() - stepped;
  }
  const state = new Float64Array(flock.agents.flatMap((a) => [a.x, a.y, a.vx, a.vy]));
  return {
    name,
    agents: flock.agents.length,
    frames,
    msPerFrame: (stepMs + drawMs) / frames,
    msPerTick: stepMs / frames,
    msPerDraw: drawMs / frames,
    cpuPerSecond: (125 * stepMs + 60 * drawMs) / frames / 1000,
    // Agents lost to NaN (D3) by the end; they still cost time every frame.
    lost: flock.agents.filter((a) => !finite(a)).length,
    checksum: createHash('sha256').update(state).digest('hex').slice(0, 16),
  };
}

if(import.meta.url === pathToFileURL(process.argv[1]).href)
{
  const args = process.argv.slice(2);
  const at = args.indexOf('--frames');
  const frames = at >= 0 ? Number(args.splice(at, 2)[1]) : undefined;
  const names = args.length ? args : Object.keys(SCENARIOS);
  const rows = names.map((name) => {
    if(!SCENARIOS[name]) throw new Error(`Unknown scenario ${name}. Known: ${Object.keys(SCENARIOS).join(', ')}`);
    const r = runScenario(name, frames);
    const round = (value) => Number(value.toFixed(3));
    return { ...r, msPerFrame: round(r.msPerFrame), msPerTick: round(r.msPerTick), msPerDraw: round(r.msPerDraw),
      cpuPerSecond: round(r.cpuPerSecond) };
  });
  console.table(rows);
}
