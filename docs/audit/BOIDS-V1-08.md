# BOIDS-V1-08 — Responsive simulator and accessible controls

Work for Linear CAL-1289, on top of BOIDS-V1-06 (`docs/audit/BOIDS-V1-06.md`).
It changes only the page around the canvas. The flocking rules, the loop and
every setting's effect are unchanged, so the physics tests and the benchmark
checksums are the same as before. It fixes the rest of D13 from
`docs/audit/BOIDS-V1-01.md` §5.

## 1. What stays the same

- The full-window canvas, the light `mod_light` background, the dark
  `mod_dark` text and accents, and the Electrolize font.
- The toolbar at the top centre, with its three functions and the same icons:
  Play/Pause, Step and Settings.
- Every element id that `main.js` and the tests use, and every slider's range,
  step and default.
- The keys: `i` plays, `p` pauses and `u` steps.

## 2. Toolbar

- It is a `<nav aria-label="Simulation controls">`. Each button has
  `type="button"`, an `aria-label` (Play, Pause, Step one tick, Settings) and
  `aria-keyshortcuts` for its key.
- The two play/pause icons had the same id, `playPauseButton` (D13). The icons
  are now `playIcon`, `pauseIcon`, `nextIcon` and `optionsIcon`. They are
  decorative (`alt=""`), since the button carries the name.
- Each button is a 44 × 44 px target around its 24 px icon.
- A tooltip under each button gives its name and key, for example
  "Pause and step one tick (U)". It shows on hover, only on devices that can
  hover, and on keyboard focus. Screen readers get the `aria-label` instead.
- Play and Pause are two buttons that swap. When the focused one is hidden,
  the focus moves to the other, so a keyboard user can press Space again to
  toggle.
- Settings has `aria-controls="settingsMenu"` and an `aria-expanded` that
  follows the panel.

## 3. Settings panel

The settings fall into four groups, each a `<fieldset>` with a `<legend>`:

| Group | Settings |
| --- | --- |
| Flock | Flock size (boids) ↻, Shape |
| Movement | Min speed and Max speed (px/tick), Separation, Separation strength, Alignment and Cohesion (×), Turn factor (px/tick²) |
| Species | Species ↻, Bias, Variance (%) ↻ |
| Environment & diagnostics | Box inset X and Y (px), Wrap, Show nearby (green), Show close (red) |

- Each slider has a `<label>`, then its value and unit in an `<output>` with
  the old `flockInput…` id. The readonly number fields could take focus but
  not be edited, and are gone. The value now updates while the slider is
  dragged (`input`), not only when it is let go. The flock takes the new
  value at the same time.
- **Immediate vs. Generate.** Settings marked **↻ Generate** (flock size,
  species, variance) only apply when Generate is pressed. They have
  `data-applies="generate"` and `aria-describedby` pointing at "Applies on
  Generate". Every other setting has `data-applies="live"` and applies at
  once. The existing Generate notice still shows while one of them differs
  from the flock on screen.
- A short help text at the top explains Play, Pause, Step, the ↻ mark and
  Generate. Turn factor, Bias and Variance each have a one-line hint.
- "Seperation" is spelt "Separation" in the UI. The ids keep the old spelling.
- The panel has a Close button, and Escape closes it. Closing it from inside
  returns the focus to the Settings button.
- Generate sits in a bar that stays at the bottom of the panel while the
  groups scroll.

### Guidance for invalid settings

Two inline notices (`role="status"`) say when the page did not use a setting
exactly as set. Both clear once the setting is valid again, or on Generate:

| Notice | When |
| --- | --- |
| `speedNotice` | Moving Min speed above Max speed raised the max, or moving Max below Min lowered the min (D4 fix from BOIDS-V1-04). |
| `boxNotice` | A box inset is wider than `Flock.BoxInset()` allows on this window (half the window less two agent radii, the D9 fix). It gives the inset that is used, and it updates on resize. |

The page-wide `statusMessage` keeps its V1-06 notices: window too small,
invalid flock size and frame error.

## 4. Layout, layering and contrast

- The body is `overflow-hidden` and the canvas is `display: block` in a
  `fixed inset-0 z-0` container. Before, an inline canvas could add a few
  pixels below the window and make the page scroll by that much.
- Layers: canvas 0, settings 20, toolbar and status 30. Before, the panel had
  both `z-20` and `z-10` set, and the canvas had no z-index.
- The toolbar, panel and status message keep clear of notches and home
  indicators (`env(safe-area-inset-*)`, with `viewport-fit=cover`).
- The panel is the window width less 12 px, up to 640 px. Its height is the
  window height less the toolbar, through `--vh`, which `main.js` sets from
  `innerHeight` (it was set but not used before). It scrolls on its own
  (`overscroll-behavior: contain`), so scrolling it never moves the page.
- From 640 px wide the groups sit in two columns, so a desktop needs less
  scrolling.
- On a short landscape screen (landscape, at most 520 px high: a phone on its
  side), the toolbar moves to the top left. The panel becomes a full-height
  column on the right, up to 380 px or 55 % wide, so most of the flock stays
  in view.
- **Contrast.** The panel was `opacity: 90%` as a whole, which faded the text
  as well. Now only its background is 94 % opaque, and text is fully opaque
  `mod_dark` (about 12:1). Hints are `rgb(75,75,75)`, above 7:1. Before, the
  body classes `font-mod_dark` and `text-md` did not exist in Tailwind (D13),
  so the text was the browser default black. They are now `text-mod_dark` and
  `text-base`.
- **Focus.** Every button and input has a 2 px `mod_dark` outline on
  `:focus-visible`.
- **Touch.** Sliders are 44 px tall. Each checkbox and radio sits in a label
  44 px tall, so tapping the text toggles it. The toolbar buttons use
  `touch-action: manipulation`, so a quick double tap does not zoom.

## 5. High-DPI

The canvas was already sized to `devicePixelRatio` on each resize (V1-06 §3).
Page zoom or a move to another screen can change the ratio without a resize
event. `ReSize()` now watches `matchMedia("(resolution: <ratio>dppx)")` and
resizes when it stops matching. It then watches the new ratio. Browsers
without `matchMedia` keep the V1-06 behaviour.

## 6. Reduced motion

With `prefers-reduced-motion: reduce`, the tooltip fade and the button press
scale are off. The flock itself is user-controlled animation: it starts
paused and only moves after Play, so the preference does not stop it. Step
still lets the user advance it one tick at a time.

## 7. Tests

`test/ui.test.js` (new) runs on the source and on the committed build in
jsdom:

- every id is unique
- the toolbar's buttons, labels, tooltips and keys
- every button has a type and a name, and every image has an `alt`
- every input has a label, and every slider has an `<output>` with its value
- the four groups, and which settings are marked for Generate
- a drag updates the value and the flock
- `aria-expanded`, Close and Escape, and where the focus goes
- focus following Play/Pause
- the speed and box notices
- the `devicePixelRatio` watch
- at 320 × 568, 375 × 667, 390 × 844, 667 × 375, 844 × 390, 768 × 1024,
  1024 × 768, 1280 × 720 and 1920 × 1080 (DPR 2): the canvas fills the
  window, and Play, Step, Settings, every slider at its maximum, the
  overlays and Generate all work

jsdom does no layout, so the layout is checked in the built CSS: the
layering, the panel's scrolling and height, the two-column and landscape
layouts, the 44 px targets, the focus and tooltip rules, the reduced-motion
rules and the panel's opacity. `test/tooling.test.js` now expects only the
`startButton` hook class to be missing from the CSS.

### Manual check

No browser was available on the Archon runner, so check these by hand in
browser dev tools at the sizes above:

1. The toolbar shows three buttons, and keyboard Tab shows a focus ring and
   tooltip on each.
2. The settings open below the toolbar, or on the right on a phone in
   landscape. They scroll inside themselves, Generate stays visible, and
   nothing is cut off at 320 px wide.
3. The canvas fills the window with no scrollbars, and it is sharp at DPR 2
   and 3.
4. With reduced motion set in the OS, the buttons do not scale when pressed.
