# BOIDS-V1-03 — Deterministic physics and UI regression tests

Work for Linear CAL-1284, on top of BOIDS-V1-02 (`docs/audit/BOIDS-V1-02.md`).
The defect IDs `D1`–`D14` are the inventory in `docs/audit/BOIDS-V1-01.md` §5.
No defect is fixed here. The simulation behaves exactly as before: the only
source change is the random seam below, and the seeded CAL-1282 baselines and
the benchmark checksums are unchanged by it.

## 1. Test seam

| Seam | Where | Use |
| --- | --- | --- |
| `flock.random` | `Flock` constructor in `src/javascripts/main.js` | Every random draw in `Start()` (species colours, spawn positions and velocities, signs, variance, species pick) goes through it. It defaults to `Math.random`, so the page is as spontaneous as before. Tests set a seeded (`seeded(n)`) or scripted (`scripted([...])`) source. The draws happen in the same order as before. |
| `scene({ settings, agents, random })` | `test/fixtures.js` | Builds a `Flock` from the real `main.js` with fixed settings (`DEFAULTS`, the index.html defaults read as the numbers they show, so 0.5 / 2.5 speeds) and a fixed agent list, with fixed species colours (`SPECIES`). It bypasses `Main()`, so D1 does not apply. |
| `GetNearbyAgents`, `Adjust`, `DetectEdgeCollisions`, `MovePosition`, `Update` | `main.js`, unchanged | Called directly on a scene to isolate neighbour geometry, the three rules, the edges and the speed clamp. |

`scene()` compiles `main.js` in Node's own realm with the DOM globals passed
in as function parameters. The CAL-1282 harness (`test/harness.js`) runs it in
a `node:vm` context, where every global lookup is about ten times slower,
which would distort the benchmarks. The harness is still used for the
page-level tests.

## 2. Test files and conventions

`npm test` runs `node --test test/*.test.js`. No browser download, network,
Cloudways or production state is needed.

| File | What it covers |
| --- | --- |
| `test/baseline.test.js` | CAL-1282 baseline (unchanged). |
| `test/physics.test.js` | Deterministic physics fixtures (§3). |
| `test/browser.test.js` | Browser smoke tests in jsdom (§4), from source and from the committed `dist/`. |
| `test/bench.test.js` | Every benchmark scenario runs and replays the same checksum (§5). |
| `test/build.test.js`, `test/tooling.test.js` | Build checks from CAL-1282 / CAL-1283 (unchanged). |

How a test name tells current behaviour from the target:

- **Plain name.** Correct today, and must stay true after the fixes.
- **`KNOWN DEFECT Dn: …`** Asserts today's wrong behaviour. The ticket that
  fixes `Dn` must change or delete it on purpose.
- **`TARGET Dn: …`** States the intended behaviour. It is marked `todo`, so
  it runs and fails today but `node --test` reports it as `# TODO` and the run
  still passes. The fix removes the `todo` option, and the test then has to
  pass. Run `node --test --test-reporter=tap test/physics.test.js | grep TODO`
  to list them.

## 3. Physics invariants

Settings are the intended defaults unless the test says otherwise (speeds
0.5 / 2.5, separation 0.1 × factor 10, alignment 0.1, cohesion 0.0005,
bias 50, turn 0.4).

| Invariant / case | Status | Test |
| --- | --- | --- |
| Same random source → same flock; `Start()` maps each draw as documented | holds | random seam tests |
| No neighbours: straight line, constant velocity | holds | single agent |
| Vision is the open square `|dx|, |dy| < 120`; close is `< 40` | holds | neighbour square |
| Separation: per-axis `seperation × factor / d`, equal and opposite, only inside 40 px | holds | pairwise |
| Alignment: `alignment × (mean v − v)`; cohesion: `cohesion × (mean p − p)`; the rules add | holds | pairwise |
| Bias weighs other species `1/bias`; bias 0 = bias 1; separation ignores species | holds | bias |
| Speed above max → scaled to max with the heading kept; in-range speeds untouched | holds | speed bounds |
| Speed below min → scaled to min with the heading kept | **fails, D2** | `KNOWN DEFECT D2` / `TARGET D2` |
| Zero velocity stays finite | **fails, D2** (NaN) | `KNOWN DEFECT D2` / `TARGET D2` |
| Generate keeps 0.5 / 2.5 | **fails, D1** | `TARGET D1` (pinned in baseline) |
| Close agents on the same x, the same y or the same point stay finite | **fails, D3** | `KNOWN DEFECT D3` / `TARGET D3` × 3 |
| Wrap: each edge (and corners) to the opposite inside edge of the box, velocity kept | holds | wrap |
| Turn: exactly ±turn factor per axis per frame, position untouched | holds | turn |
| Turn with box 150: an isolated agent turns back within a bounded overshoot (furthest x 650 for edge 645, turns at frame 28), at most 0.4 per axis and under 90° per frame | holds | large box |
| Box over half the canvas keeps agents on the canvas | **fails, D9** | `KNOWN DEFECT D9` / `TARGET D9` |
| Variance 0: all agents get the flock values; variance 100 spreads them inside the slider limits | holds | variance |
| Each agent steers with its own values | **fails, D5** | `KNOWN DEFECT D5` / `TARGET D5` |
| 1, 2 and 10 species each get their own colour and a fair share of 200 agents | holds | species |
| Flock sizes 0 and 1 run 500 frames | holds | flock sizes |
| 50 (wrap), 50 (turn, box 150) and 200 (10 species, bias 100) agents, seeds 1–5: finite, on the canvas, speed within limits every frame | **fails, D2 + D3** | `TARGET D2/D3` × 3 |
| Six-agent, two-species scene replays a recorded 200-frame trajectory | holds | regression trajectory |

Measured with the intended settings before writing the flock-wide targets:
seeded 50-agent flocks lose agents to NaN on the first frame (seeds 1 and 3),
and D2 pushes speeds as high as 367 and as low as 0.003. The regression
trajectory therefore uses fractional positions and `minSpeed` 0, so neither D2
nor D3 can trigger. A D3 fix that changes the separation formula will still
move it, and the failure message prints the new values to paste in.

"Bounded turns" is read as: steering at an edge changes velocity by at most
the turn factor per axis per frame, and an agent that crosses the box returns
within a bounded overshoot. Classic Boids has no per-frame heading limit, so
none is asserted for flocks.

## 4. Browser smoke tests

`test/browser.js` opens the real `index.html` (with `src/javascripts/main.js`)
and the built `dist/index.html` (with its bundle) in jsdom 29. jsdom does not
run module scripts, so the single module script is moved to the end of
`<body>` as a classic script, which runs before `DOMContentLoaded` just like a
deferred module. The canvas context records its calls together with the
current stroke and fill styles. Timers are manual and `Math.random` is
seeded. Both variants check:

- every id `main.js` looks up exists in the markup, and no script errors;
- load: a paused flock of 50 circles, canvas sized to the window;
- Play → one interval and the buttons swap; Pause → none; Step → paused and the flock moves; the `u` key draws a frame;
- Options opens and closes the settings;
- sliders update their read-only number fields; flock size waits for Generate, which builds a paused flock of the new size;
- line shape (no arcs, two lines per agent), circle shape (one arc and one direction line per agent);
- Show Nearby (50 green squares and counts), Show Close (50 red), and the box outline follows Box-X / Box-Y.

jsdom 29.1 was chosen because it supports the `engines` floor
(`^22.13.0 || >=24`); jsdom 30 needs Node 22.22.2. It adds no install scripts
and no new `npm audit` findings (still the 3 moderate ones from BOIDS-V1-02).
A real-browser run (Playwright) would need a browser download, which the
Archon sandbox cannot reach.

## 5. Benchmarks

`npm run bench` (`test/bench.js`) runs seeded scenarios headlessly with the
intended settings and prints ms per frame, agents lost to NaN, and a checksum
of the final state. An optimisation that should not change behaviour must
keep every checksum. `npm run bench -- dense-200 --frames 50` runs one
scenario.

Reference run: Node 26.11.1 on the 2-vCPU Archon runner. Timings vary by
machine, so compare runs on the same one.

| Scenario | Agents | Frames | ms/frame | Lost | Checksum |
| --- | --- | --- | --- | --- | --- |
| `default-50` | 50 | 2000 | 0.19 | 0 | `e17e828b7d3cc5c3` |
| `dense-200` | 200 | 500 | 1.26 | 3 | `953d5326ddc2f026` |
| `species-200` (10 species, bias 100) | 200 | 500 | 3.75 | 4 | `c68b41500aa6bb0a` |
| `turn-box-200` (turn, box 150) | 200 | 500 | 5.69 | 2 | `2bb956b63a8916d6` |
| `overlays-200` (line, nearby, close) | 200 | 300 | 7.81 | 3 | `ab60ba04dafae2d0` |
| `stress-1000` | 1000 | 100 | 172 | 92 | `e859cb2033323297` |

A fix for D2/D3 will change the checksums and the lost counts. Record the new
values in the same change.

## 6. CI and Archon verify

No workflow change was needed. `npm test` already runs every
`test/*.test.js` in CI (`.github/workflows/ci.yml`, Node 22.13 / 24 / 26) and
in Archon verify (`WORKFLOW.md`). Neither needs network access beyond
`npm ci`. `npm run bench` is not run in CI, because timings are not pass/fail.
