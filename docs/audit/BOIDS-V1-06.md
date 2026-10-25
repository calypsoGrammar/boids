# BOIDS-V1-06 — Animation lifecycle, resize and large-flock performance

Work for Linear CAL-1287, on top of BOIDS-V1-05 (`docs/audit/BOIDS-V1-05.md`).
This change fixes D8 and D12 from `docs/audit/BOIDS-V1-01.md` §5. The flocking
rules are unchanged: every benchmark checksum from BOIDS-V1-05 replays exactly.

## 1. One animation loop

Before: Play started a `setInterval` of 8 ms that stepped **and** drew the
flock on every call. The flock owned the interval, and the `i` and `p` keys
started and stopped it without updating the buttons (D8). Its speed depended
on timer throttling, and it drew more often than the screen refreshes (D12).

Now `main.js` has one `Loop`, owned by the page rather than by a flock:

- It runs on `requestAnimationFrame`. At most one frame request is pending.
  Play while playing does nothing, and so does Pause while paused. The page
  uses no `setInterval` or `setTimeout` at all.
- The simulation advances in fixed **ticks** of `TICK_MS` = 8 ms. That is 125
  ticks a second, the rate of the old interval, so the flock moves at the same
  speed. Each display frame runs the ticks that are due, then draws once. A
  frame with no tick due draws nothing.
- The first frame after Play runs one tick at once.
- Catch-up is bounded. A frame runs at most `MAX_TICKS_PER_FRAME` = 8 ticks
  (64 ms). Any time beyond that is dropped: after a stall, or after a
  background tab that the browser stopped animating. So the simulation slows
  down instead of piling up work, and the CPU it uses stays bounded.
- If a frame throws, the loop stops and the page shows the Play button. The
  status message (§4) reports the error until the next Generate.

`Flock.Step()` is one physics tick without drawing. `Flock.Update()` is still
one tick plus a redraw, as the tests and the benchmark used it before.

## 2. Controls

| Control | Effect |
| --- | --- |
| Play button, `i` | Starts the loop if it is stopped. Shows Pause. |
| Pause button, `p` | Stops the loop. Shows Play. |
| Step button, `u` | Pauses, then runs exactly one tick and draws it. |
| Generate | Stops the loop, then makes a new, paused flock. The old flock is never stepped again. |

The Play button now only plays and the Pause button only pauses. Before, both
toggled, which is why they could get out of step with the keys. Keys pressed
with Ctrl, Meta (Cmd) or Alt are left to the browser, so Ctrl+P prints and does
not pause the flock. (`u` used to add one tick without pausing.)

## 3. Canvas size and resize

- The canvas has a **logical size**, `view`, equal to the window
  (`innerWidth` × `innerHeight`) in CSS pixels. Its CSS size is set to that.
  The flock moves within it, and everything is drawn in it.
- The **backing store** is `devicePixelRatio` times the logical size, rounded.
  The context is scaled with `setTransform(dpr, 0, 0, dpr, 0, 0)`. Shapes keep
  their size in CSS pixels and stay sharp on high-DPI screens. A missing,
  zero, negative or non-finite ratio counts as 1.
- A resize updates the canvas and the flock bounds, then redraws at once.
  Agents, species and play state stay as they were. Before, the flock bounds
  came from the container's scroll size and the canvas size came from the
  window, which could disagree. Now both use `view`. Agents left outside a
  smaller window wrap or turn back in, as before (D9).
- The backing store is only resized when its pixel size changes. Setting it
  clears the canvas and resets the context.
- The page does not watch for a `devicePixelRatio` change that comes without a
  resize event, such as moving the window to another screen in some browsers.
  The next resize picks it up.

## 4. Controlled error states

`#statusMessage` (`role="status"`) sits at the bottom of the page. It is hidden
when there is nothing to report and shows these notices:

| Cause | Behaviour |
| --- | --- |
| Window under `MIN_VIEW_SIZE` (10 px, one agent across) on either axis | Ticks are skipped, so the agents stay as they are. Play, Pause and Step still work. Movement resumes once the window is large enough. |
| Flock size slider not a whole number from its min to its max (1–200) | Generate uses the nearest limit, or 50 when it is not a number. It shows the value it used on the slider, and the notice stays until the next Generate. |
| Error thrown in a frame | The loop stops (§1). |

The other settings already had fallbacks (D4, D5, D9) and need no notice.

## 5. Performance

Profiling `dense-200` showed that neighbour search, steering and garbage
collection took most of a tick. The garbage came from two new neighbour
arrays per agent per tick, and the steering buffers were also allocated on
every tick. Changes, all bit-for-bit identical (the checksums are unchanged):

- `GetNearbyAgents` refills each agent's `nearby` and `close` arrays in place.
  It also skips the y test when x is already out of range.
- `Step()` keeps its steering buffers between ticks.
- `Steer()` looks up each coefficient once rather than twice.

The search stays all-pairs. A spatial grid would make it cheaper for large
flocks, but that would be an algorithmic rewrite, and the ticket does not ask
for one.

`npm run bench` now times the tick (`msPerTick`) and the draw (`msPerDraw`)
apart. `cpuPerSecond` estimates the share of one core the page uses while
playing: 125 ticks and 60 draws a second. The drawing goes to a recording
canvas, so `msPerDraw` is a floor, and painting in a browser costs more. The
table shows ranges over three runs each, on the 2-vCPU Archon runner (Node 26).
The legacy code is HEAD of CAL-1286, run at the same time. Its frame is one
`Update()`, so its CPU per second is 125 × ms/frame.

| Scenario | Legacy ms/frame | Now ms/tick | Now ms/draw | Legacy CPU/s | Now CPU/s |
| --- | --- | --- | --- | --- | --- |
| `default-50` | 0.20–0.36 | 0.14–0.16 | 0.07–0.09 | 0.025–0.045 | 0.022–0.025 |
| `dense-200` | 1.39–2.04 | 1.31–1.55 | 0.31–0.38 | 0.17–0.25 | 0.18–0.22 |
| `species-200` | 1.12–1.69 | 1.26–1.69 | 0.25–0.33 | 0.14–0.21 | 0.17–0.23 |
| `turn-box-200` | 3.3–5.1 | 3.8–4.7 | 0.19–0.27 | 0.41–0.64 | 0.48–0.60 |
| `overlays-200` | 5.8–9.7 | 4.6–5.3 | 0.53–0.60 | 0.73–1.22 | 0.61–0.69 |
| `stress-1000` | 131–165 | 88–103 | 1.5–1.9 | 16–21 | 11–13 |

At 50 and 200 boids the tick costs the same as before, within the noise of
this runner. The saving is in drawing: it happens at most once per display
frame rather than 125 times a second, which matters most with the overlays,
and nothing runs while paused. At 1000 boids (beyond the slider), reusing the
arrays cuts about a third of each tick. A browser that cannot keep up gets at
most 8 ticks a frame, so the page slows down rather than locking up.

## 6. Tests

- `test/lifecycle.test.js` (new) covers:
  - one loop under repeated Play, from both buttons and keys
  - Pause stops updates and drawing
  - fixed 8 ms ticks: 0, 1 and 2 ticks per frame, with remainders carried over
  - catch-up after a 10 s stall bounded to 8 ticks
  - Step from the button and `u`, each exactly one tick compared with a twin
    flock, and left paused
  - modifier keys ignored
  - five Generate cycles while playing, each leaving no frame and a frozen old
    flock
  - resize while playing and while paused
  - DPR 2 and 1.5 sizing, and broken ratios
  - no canvas reset on a same-size resize
  - the too-small window, invalid flock size and frame error states
  - `main.js` never uses `setInterval` or `setTimeout`
- `test/browser.test.js`: in the real markup, from source and build, a DPR 2
  canvas resized while playing keeps every agent and the play state, and the
  too-small notice shows.
- `test/baseline.test.js`: `KNOWN DEFECT D8` is now a plain test of the fixed
  behaviour.
- `test/harness.js` and `test/browser.js` fake `requestAnimationFrame` with a
  clock. `tick(n)` runs n frames of 8 ms, and `frame(ms)` (harness) or
  `tick(ms)` (browser) runs one frame `ms` after the last.
