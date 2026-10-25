# BOIDS-V1-05 — Per-agent variance and species bias

Work for Linear CAL-1286, on top of BOIDS-V1-04 (`docs/audit/BOIDS-V1-04.md`).
This change fixes D5 from `docs/audit/BOIDS-V1-01.md` §5 and pins down how
species bias works. It adds no new forces, species rules or actor types.

## 1. Per-agent variance (D5)

Before: `Start()` gave each agent a separation, alignment and cohesion as
`toFixed(5)` strings, which `Adjust()` never read. Cohesion's variation also
came in steps of 0.001, which is coarser than its whole 0–0.0025 range.

Now:

- On Generate, each agent draws a numeric **offset** for each of the three
  coefficients: up to `variance % × (slider max − slider min)` either way,
  with no rounding. This uses the same two draws per coefficient as before
  (size, then sign) and makes none at variance 0. The offsets are kept as
  `seperationOffset`, `alignmentOffset` and `cohesionOffset` on `FlockAgent`.
  The `avoidance` field, which held alignment, is gone.
- `Steer()` uses `Flock.Coefficient(agent, key)`, which is
  `clamp(flock value + agent offset, slider min, slider max)`. A non-finite
  result counts as the slider min. The limits are read from the sliders in
  `Start()`, falling back to the `index.html` limits (0–0.25, 0–0.25,
  0–0.0025) when a slider has no usable `min`/`max`. Every coefficient is
  therefore a finite number within the slider range.
- Variance is limited to 0–100 when the flock is generated. A non-number
  counts as 0.

## 2. Species bias

Species are told apart by colour, as before. Separation ignores species. In
alignment and cohesion, a neighbour of another species counts `1 / d` as much
as a neighbour of the agent's own species, where:

| Bias | d | Effect |
| --- | --- | --- |
| 0 or 1 | 1 | Every neighbour counts the same, whatever its species. |
| above 1 (up to 100 on the slider) | bias | At 100, another species counts 1/100. |
| between 0 and 1, negative, or not finite | 1 | Treated as no bias. |

The result is a weighted average over all neighbours, so:

- With **one species**, bias changes nothing.
- When **every neighbour is another species**, the weights cancel and the
  agent follows them as if they were its own. Bias only shifts weight between
  species in a mixed neighbourhood.
- The total weight is never 0, so the average is never NaN or Infinity.

This is the same as before for every value the slider can give: 0, or a
whole number from 1 to 100. The only change is for values the slider can't
give. Before, a bias between 0 and 1 made other species count *more* than
the agent's own (`1 / 0.5 = 2`), and an infinite bias gave NaN. Both now
count as no bias, so the code has no rule that favours other species.

### `nearbyBias` and `closeBias`

`GetNearbyAgents()` built same-colour copies of the nearby and close lists,
but nothing ever read them. The weighting above already compares colours as
it sums, so these copies were not needed. Using `closeBias` would have meant
species-aware separation, which would be a new rule. Both arrays have been
removed.

To show this changes nothing: four seeded runs at variance 0 (bias 0, 7 and
100, with 1, 3, 4 and 10 species, in wrap and turn modes) give the same
state checksums before and after this change. The checksums were recorded
from CAL-1285 at `0f4a714`, and the test
`variance 0 replays the CAL-1285 trajectories exactly` checks them.

## 3. What applies when

| Setting | Applies |
| --- | --- |
| Separation, Alignment, Cohesion | Live. Every agent keeps its offset, so all of them move with the slider, within its limits. |
| Bias, speeds, separation factor, turn, box, wrap, overlays, shape | Live (unchanged). |
| Flock Size, Species, Variance | On Generate. Moving these sliders no longer changes the running `Flock`, so `flock.flockSize`, `raceCount` and `variance` always describe the flock on screen. |

While any of the Generate-only sliders differs from the running flock, a
line above the Generate button reads *"Press Generate to apply Flock Size,
Species and Variance."* It is hidden on load and after Generate, and it
disappears again if the slider goes back to the running value. Nothing else
about the default appearance or controls has changed.

Species set-up on Generate: the species count is rounded down and is at
least 1. A count of 0, a negative count or a non-number gives one species,
where before 0 made `Start()` throw. A colour already used by another
species is drawn again, so two species can never share a colour and become
one species.

## 4. Tests

- `test/physics.test.js`: numeric offsets within ±variance % of the range,
  and coefficients within the limits at variance 5, 50 and 100. Draws are
  reproducible and scale with variance. One rule at a time, an agent's offset
  scales that rule's steering. Clamping, live sliders keeping offsets, and a
  seeded flock moving differently at variance 30 than at 0 are covered. Bias
  is checked against the formula at 0, 1, 2, 10 and 100. Bias below 1 or
  non-finite is checked. With all neighbours of another species, or one
  species, bias has no effect. Bias 100 sorts a seeded three-species flock
  by colour and bias 0 does not. Neither lookup array exists any more. Also
  covered: species counts 0, −2, NaN, 2.7 and Infinity, a forced colour
  clash, and out-of-range variance. The variance-0 checksums from CAL-1285
  replay exactly. `TARGET D5` is now a plain test, and no `todo` tests are
  left.
- `test/baseline.test.js`: `KNOWN DEFECT D5` now asserts that variance
  works. The Generate test checks that the running flock keeps its size,
  species and variance until Generate, and checks the notice.
- `test/browser.test.js`: the notice in the real markup, from both source
  and build.

## 5. Benchmarks

Default settings use variance 5, so the benchmark checksums change. These
are from `npm run bench` on the Archon runner (Node 26):

| Scenario | ms/frame | Lost | Checksum |
| --- | --- | --- | --- |
| `default-50` | 0.24 | 0 | `017ff43fba91e341` |
| `dense-200` | 1.65 | 0 | `9537debfa71504a7` |
| `species-200` | 1.44 | 0 | `798e74b84679c41a` |
| `turn-box-200` | 5.37 | 0 | `9d2fb8f3a59a4df0` |
| `overlays-200` | 8.18 | 0 | `48f7dac4ab91f969` |
| `stress-1000` | 145 | 0 | `b55fa070c79b6e78` |
