# BOIDS-V1-07 — Modules, one settings model and accurate overlays

Work for Linear CAL-1288, on top of BOIDS-V1-06 (`docs/audit/BOIDS-V1-06.md`).
The single `main.js` is split into modules, every control goes through one
validated settings model, and the debug overlays now match the neighbour
search. This fixes D6 and D7 from `docs/audit/BOIDS-V1-01.md` §5 and the
inline `onchange` part of D13. The flocking rules are unchanged: the recorded
trajectory, the CAL-1285 checksums and every benchmark checksum replay
exactly. No framework or dependency was added; it is still plain JavaScript
bundled by Vite.

## 1. Modules

All in `src/javascripts/`. Only `controller.js` and `main.js` touch the page.

| Module | Responsibility | Uses |
| --- | --- | --- |
| `settings.js` | The settings model: every control's ids, default, limits, type and when it applies (§2). `validate()` turns a raw control value into a valid one, `couple()` keeps min speed ≤ max speed. Pure data and functions. | — |
| `agent.js` | `FlockAgent` (position, velocity, offsets, colour, last neighbour lists) and the radius / vision constants. | — |
| `flock.js` | `Flock`: generating agents (`Start()`), one deterministic tick (`Step()`), the neighbour search, the three rules (`Steer()`), the box edges and the speed clamp. `Configure()` applies the live settings. No DOM, no canvas. | `agent.js`, `settings.js` |
| `loop.js` | `Loop`: the one `requestAnimationFrame` loop with fixed 8 ms ticks and bounded catch-up (BOIDS-V1-06 §1). The frame source is passed in. | — |
| `renderer.js` | `drawFlock(context, flock, view)`: the box, the agents as circles or lines, and the optional overlays. Reads the flock and changes nothing. | — |
| `controller.js` | `createApp({ window, document, random })`: reads the controls into `config`, owns the flock, the loop, the canvas size and the status and Generate messages, and wires the buttons and keys. Every browser object comes in as an argument. | all of the above |
| `main.js` | Entry point: sets `--vh` and calls `createApp` with the real window and document. | `controller.js` |

Tests import the modules directly: `test/fixtures.js` builds `Flock`s and
draws them with `drawFlock` on a recording context, with no DOM at all;
`test/harness.js` runs `createApp` on a small fake page; `test/browser.js`
opens the real markup in jsdom with the source bundled by Vite in memory, or
with the committed `dist/`.

`Flock.Update()`, `Flock.DrawFlock()`, `Flock.Adjust()`, `Flock.SliderLimits()`,
the `UpdateSlider(index, …)` branches and the inline `onchange` on the
Seperation slider are gone. Before removal every use was found: `Update()`,
`DrawFlock()` and `Adjust()` were only called by the tests and the benchmark
(now `Step()`, `drawFlock()` and `Steer()`); the inline handler named a
function the module scope hid, so it never ran. The flock fields `box_x` /
`box_y` are now `boxX` / `boxY`, the names of the settings model, and the
view settings (`shape`, `nearbyBool`, `closeBool`) moved from the flock to the
controller's `config`. No third-party code was removed.

## 2. One settings model

`config` in the controller holds the current value of every control.
Whenever a control changes, or Generate runs, the controller reads it through
`validate()`: a number outside the slider limits is moved inside them, a
whole-number setting is rounded, and anything that is not a number becomes
the default. A replaced value is written back to the slider and its number
field, and the status message says what was used until the value is valid
again. The slider limits come from the `min` / `max` attributes in
`index.html`; `test/settings.test.js` checks that the model's defaults and
limits are the markup's.

Each parameter has one of three kinds:

| Applies | Parameters | When it takes effect |
| --- | --- | --- |
| live | Min Speed, Max Speed, Seperation, Seperation Factor, Alignment, Cohesion, Turn Factor, Bias, Box-X, Box-Y, Wrap | At once, on the running flock (`Flock.Configure()`), and on the next Generate. |
| generate | Flock Size, Species, Variance | On Generate only. Until then the panel shows "Press Generate to apply Flock Size, Species and Variance." while any of them differs from the running flock. |
| view | Shape, Show Nearby, Show Close, Show Direction | At once, on the picture only. |

Flock size, species and variance stay generate-only: each changes which
agents exist or what they were drawn with, and an in-place change would need
rules for which agents to add, drop or recolour, a new behaviour this ticket
does not ask for.

The two speeds stay in order: the slider just moved wins and the other one
follows it, and Generate lowers a min above the max to it (as before).

Generate builds a new, paused flock from `config`. It keeps every setting —
live, generate and view — and resets only the agents, the play state and an
error message. Every change redraws at once, so a paused flock shows a new
shape, overlay, box or speed straight away (D7).

On load the number fields are set from their sliders when they show a
different number (as after a browser restores a form); a field that already
shows the same number keeps its text, so "0.10" stays "0.10".

## 3. Overlays

- **Show Nearby / Show Close.** The neighbour search counts an agent closer
  than `vision` (120 px) on both axes as nearby, and closer than
  `closeVision` (40 px) as close: squares 240 and 80 px wide. The overlays
  used to draw them 120 and 40 px wide (D6); they now draw the real squares.
  The number next to each agent is the size of the list its last tick's
  steering used. The squares are drawn around the agent's position after it
  moved, at most `maxSpeed` from where the search ran. An agent off the canvas
  keeps its last lists (D10, unchanged).
- **Show Direction** (new checkbox, off). The old code drew a thin heading
  line for every agent through a hard-coded `debugDirection = true`. It was a
  diagnostic: a local flag with no control, and in Line mode it drew over the
  agent's own velocity line. It is now an overlay like the other two, off by
  default; on, it draws the same line, (radius + 1) times the velocity, 1 px
  wide.
- Each stroke sets its own line width. Before, Line mode set it to radius / 3
  and left it there, so after Line mode the box and overlays were drawn
  thicker, even back in Circle mode.

## 4. Adding a force later

A new steering force (an obstacle, a goal, a predator: BOIDS-V2 work) goes in
`Flock.Steer()` in `flock.js`, as one more term added to `[newX, newY]`. It
must read only the state at the start of the tick (the agent, its neighbour
lists, the flock settings), so `Step()` stays independent of the agent order.
Its settings go in `PARAMETERS` in `settings.js` with their slider in
`index.html` (`applies: "live"` if `Flock.Configure()` can take them at once);
anything it needs to draw goes in `renderer.js` as a `view` parameter. The
controller needs no change for an ordinary slider or checkbox.

## 5. Checks

`npm run check`: lint, every test and the build. New tests are in
`test/settings.test.js` (the model, settings sync, the renderer, the modules
without a DOM, the loop with a fake frame source) and
`test/lifecycle.test.js` (settings changed while playing). The D6 and D7
tests in `test/baseline.test.js` now pin the fixed behaviour.
