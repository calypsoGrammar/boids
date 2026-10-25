// Keeps the benchmark scenarios in test/bench.js runnable and reproducible.
// Timings are not checked: they depend on the machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, runScenario } from './bench.js';

for(const name of Object.keys(SCENARIOS))
{
  test(`benchmark ${name} runs and replays the same final state`, () => {
    const first = runScenario(name, 3);
    const second = runScenario(name, 3);
    assert.equal(first.agents, SCENARIOS[name].settings.flockSize);
    assert.equal(first.checksum, second.checksum);
    assert.ok(Number.isFinite(first.msPerFrame));
  });
}
