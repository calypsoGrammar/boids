# BOIDS-V1-04 — Numerical flocking, velocity and edge fixes

Work for Linear CAL-1285, on top of BOIDS-V1-03 (`docs/audit/BOIDS-V1-03.md`).
Defect IDs are the inventory in `docs/audit/BOIDS-V1-01.md` §5. This change
fixes D1, D2, D3, D4 and D9 in `src/javascripts/main.js`. D5–D8 and D10–D14
are unchanged. No forces were added.

## 1. Fixes

| Defect | Before | Now |
| --- | --- | --- |
| D1 | `Main()` and the Min/Max Speed sliders read speeds with `parseInt`, so 0.5 / 2.5 became 0 / 2 and a max below 1 froze the flock. | `parseFloat` everywhere. The defaults are 0.5 / 2.5 and fractions stay fractional in the flock and the number fields. Box-X / Box-Y also use `parseFloat` (they were a mix). |
| D2 | The min clamp computed `vy` from the rescaled `vx`. A zero velocity divided by zero (NaN). | `MovePosition()` scales the velocity once to `clamp(speed, minSpeed, maxSpeed)`, keeping the heading, so both limits hold. A zero velocity (with `minSpeed > 0`) or a non-finite one restarts at `minSpeed` along a fixed direction picked from the agent's index (golden-angle steps). With `minSpeed` 0 a stopped agent stays stopped. |
| D3 | Separation added `factor / dx` and `factor / dy` per axis: an equal x or y gave Infinity, then NaN, and the agent was lost. | Separation is a vector push away from each close neighbour with strength `seperation × factor / distance`, the classic inverse-distance rule. Neighbours closer than 1 px count as 1 px away, so the push never exceeds `seperation × factor`. Two agents on the same point are pushed apart along a direction picked from their two indices, opposite for each. |
| D4 | Min Speed above Max Speed won over Max Speed. | `Flock.Validate()` runs at the start of `Start()` and every `Update()`. It replaces non-finite speeds with the 0.5 / 2.5 defaults, negative ones with 0, and lowers a `minSpeed` above `maxSpeed` to it (`maxSpeed` is the hard limit). Box insets become finite and at least 0. In the page, moving one speed slider past the other moves the other one with it (slider and number field), and `Main()` shows the value it used if it had to lower Min Speed. |
| D9 | A box inset of half the canvas or more inverted the box: wrap sent agents off the canvas every frame. | The inset used on each axis is capped at `size / 2 − 2 × radius`, which leaves a box of at least two radii (10 px). A canvas narrower than one agent collapses the edges to its middle line. The cap follows the current canvas size, so the slider setting is kept and applies in full again after the window grows. The drawn box outline is the capped box. |

Sequential updates: `Update()` used to steer and move agent 0 before agent 1
looked at it, so the result depended on the agent order. It now runs in two
phases: every agent finds its neighbours and computes its steering
(`Flock.Steer()`, which changes nothing) from the state at the start of the
tick, then every agent applies it, hits the edges and moves. `Adjust(agent)`
still exists and applies `Steer(agent)` to one agent.

Spawning: `Start()` places agents inside the box (between the inside edges)
instead of anywhere on the canvas. Before, agents spawned outside a box
margin were all wrapped onto the box edge on the first frame (lining them up
on one x or y, the D3 trigger) or, in turn mode, could fly off the canvas.

## 2. Intentional behaviour changes from the legacy simulation

- **Separation is weaker for neighbours that are close on one axis only.**
  The legacy per-axis rule pushed hardest along an axis whose difference was
  small, even when the neighbour was far away along the other axis. The
  vector rule pushes along the line between the pair, at a strength that
  depends on the distance only. For a neighbour 10 px right and 4 px down the
  push is 0.093 instead of 0.27.
- **The flock cruises more slowly.** With the defaults it settles at about
  0.7–1 px per frame instead of about 2.4. Most of the old speed came from
  the D2 bug, which multiplied `vy` up whenever the min clamp ran: a
  NaN-safe version of the old per-axis separation with the fixed clamp
  cruises at 0.8–1.4. The live page used to run with 0 / 2 (D1), so it now
  runs at 0.5 / 2.5. Alignment still lines the flock up (polarisation 0.85–0.95
  in seeded 50- and 200-agent runs, against 0.95–0.99 before), and no agent is
  lost.
- **Steering reads one state per tick**, so the same scene gives the same
  result whatever the agent order (tested by reversing a scene).
- **Spawn positions** are inside the box: `left + floor(r × (right − left))`
  rather than `floor(r × width)`. The order of random draws is unchanged.
- **Over-large box insets are capped** instead of inverting the box.
- Wrap still moves an agent past an inside edge to the opposite inside edge,
  and turn mode still changes the velocity by the turn factor per axis per
  frame. Both are unchanged, apart from the capped edges. Turn mode remains a
  soft boundary: an agent crossing the inside edge at full speed overshoots
  it by a few pixels, which with a box inset of 0 can take it briefly past
  the canvas edge.

## 3. Tests

`KNOWN DEFECT` tests for D1–D4 and D9 in `test/baseline.test.js` and
`test/physics.test.js` now assert the fixed behaviour and are named after the
defect (`D2: …`). The `TARGET D1/D2/D3/D9` tests are no longer `todo`. The
one `TARGET D3` case that two agents on the same y are further apart after a
single frame was restated: those two agents close in at 1.5 px per frame, and
no bounded push reverses that in one frame. It now checks the push is finite,
equal and opposite and points away, and that the pair is at least 20 px
apart after 100 frames. Only `TARGET D5` is still `todo`.

New cases: the separation strength by distance and direction, the 1 px cap,
a stack of 12 agents on one point, 200-agent flocks on whole-pixel spawns,
fallback headings, non-finite velocities, random velocities against
fractional limits, `Validate()`, both phases of `Update()`, agent order,
box edges down to a 0 px canvas, the drawn box, shrinking the canvas to a few
pixels and back in wrap and turn modes, and the speed sliders keeping
Min ≤ Max in the page. The plain separation test and the Start() mapping test
were updated for the new formula and spawn area, and the six-agent golden
trajectory was recorded again.

## 4. Benchmarks

`npm run bench` on the 2-vCPU Archon runner, Node 26.11.1, with the legacy
code (HEAD of CAL-1284) run on the same machine at the same time for
comparison. The runner was slower than for the BOIDS-V1-03 reference, so
compare the two columns with each other, not with that table.

| Scenario | ms/frame (legacy) | ms/frame (now) | Lost (legacy → now) | Checksum (now) |
| --- | --- | --- | --- | --- |
| `default-50` | 0.27 | 0.48 | 0 → 0 | `7f9980d1b7f0d4bb` |
| `dense-200` | 2.60 | 2.84 | 3 → 0 | `d5d530942bcffb75` |
| `species-200` | 6.67 | 1.90 | 4 → 0 | `7a2c7c49b52a33aa` |
| `turn-box-200` | 9.85 | 9.39 | 2 → 0 | `a08ee0744ef35f93` |
| `overlays-200` | 20.4 | 15.3 | 3 → 0 | `d1f201df3acbcb00` |
| `stress-1000` | 279 | 265 | 92 → 0 | `49bd5fc1887bc00a` |

The cost per frame follows the number of neighbours, which depends on how
tightly each run flocks, so the timings move both ways.
