// Reproducible benchmark scenarios for later optimisation (BOIDS-V1-03).
// Each scenario is a seeded flock with fixed settings, stepped headlessly
// through Flock.Update() (drawing goes to the recording canvas of
// test/fixtures.js). `checksum` hashes the final state of every agent, so an
// optimisation that is meant to keep behaviour must keep the checksum.
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
  const start = performance.now();
  for(let i = 0; i < frames; i++)
  {
    calls.length = 0;
    flock.Update();
  }
  const ms = performance.now() - start;
  const state = new Float64Array(flock.agents.flatMap((a) => [a.x, a.y, a.vx, a.vy]));
  return {
    name,
    agents: flock.agents.length,
    frames,
    msPerFrame: ms / frames,
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
    return { ...r, msPerFrame: Number(r.msPerFrame.toFixed(3)) };
  });
  console.table(rows);
}
