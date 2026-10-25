# BOIDS-V1-01 — Deployment, controls and simulation baseline

Audit for Linear CAL-1282, done on 2026-10-25 from a fresh checkout of `main`
at `57d47ac`. Nothing about hosting, DNS, GitHub Pages settings or published
files was changed. No simulation code was changed: the defects below are
recorded, not fixed.

Automated evidence lives in `test/` and runs with `npm test`:

- `test/harness.js` loads `src/javascripts/main.js` in Node against a minimal
  fake DOM and canvas, using the real defaults and slider limits from
  `index.html` and a seeded `Math.random`, so every run is reproducible.
- `test/baseline.test.js` pins current behaviour. Tests named
  `KNOWN DEFECT Dn` assert the current, wrong behaviour of defect `Dn` below,
  so whichever ticket fixes a defect has to change its test on purpose.
- `test/build.test.js` builds into a temporary directory and checks the asset
  URLs, the third-party hosts, and that the build matches the committed
  `dist/`.

## 1. Live deployment and hosting

### What could be established

| Item | Finding | Evidence |
| --- | --- | --- |
| Live URL | **Unknown — needs the owner.** | The sandbox network only allows `registry.npmjs.org`. Requests to `calypsogrammar.github.io` and `api.github.com` were refused by the proxy (`CONNECT tunnel failed, response 403`). |
| DNS | **Unknown — needs the owner.** | Name resolution for outside hosts is not available in the sandbox. |
| GitHub Pages source, branch and custom domain | **Unknown — needs the owner.** | Needs repository admin access to *Settings → Pages* or `GET /repos/calypsoGrammar/boids/pages`. |
| `gh-pages` branch | **Not seen.** | This checkout has only `main` (as `remotes/archon/main`). It has no Git remote, so other branches can't be listed. Whether a `gh-pages` branch exists upstream is unknown. |
| Cloudways copy | **Unknown — needs the owner.** | Nothing in the repo points to Cloudways: there is no deploy script, CI workflow, `.htaccess`, `CNAME` or PHP. |
| Published commit | **Unknown.** | See the operator tasks. The newest build in the repo is `dist/` on `main`, last changed in `a912d97` (2024-03-25). |
| Release route | **Manual, as far as the repo shows.** | There is no `.github/workflows`. `dist/` is committed even though `.gitignore` lists it (the files were force-added). The last `dist/` change (`a912d97`) hand-edits `dist/index.html` to match the `index.html` change in `4114771`; no rebuild was needed, because the classes were already in the CSS. |

**Production is not claimed to be broken.** Nothing here reproduced a failure
on a live host. The base-path analysis below shows the conditions under which
the published files *would* fail to load.

### Operator-only tasks (need owner access)

These need GitHub admin, DNS or Cloudways access. Each one only reads
information and changes nothing.

1. **GitHub Pages settings.** In *Settings → Pages*, record the source (branch
   or GitHub Actions), the branch and folder (`/` or `/docs`), the custom
   domain, whether *Enforce HTTPS* is on, and the "Your site is live at" URL.
   Or run `gh api repos/calypsoGrammar/boids/pages`.
2. **Published build.** Run
   `gh api repos/calypsoGrammar/boids/pages/builds/latest` and record the
   `commit` and `status`. Also run `git ls-remote https://github.com/calypsoGrammar/boids`
   to show whether `gh-pages` exists and which commit it points to.
3. **What the live site actually serves.** For each candidate URL
   (`https://calypsogrammar.github.io/boids/`, any custom domain, any
   Cloudways URL), save:
   - `curl -sSIL <url>`, showing the status codes, redirects and `server` header.
   - `curl -sSL <url> | grep -E 'src=|href='`, showing which asset paths the
     page asks for.
   - `curl -sSI <url>assets/index-efddc0fe.js`, which returns 200 if that host
     is serving the build from `main`.
   - A browser screenshot with DevTools *Console* and *Network* open, showing
     any 404s.
4. **DNS.** Run `dig +short <custom-domain> A AAAA CNAME` for every custom
   domain. GitHub Pages apex addresses are `185.199.108–111.153`, and a
   subdomain on Pages has a `CNAME` to `calypsogrammar.github.io`. Any other
   address means a different host, such as Cloudways.
5. **Cloudways.** If an application there serves Boids, record its URL, its
   document root, and whether the files there match `dist/` on `main`
   (`sha256sum` of `index.html` and `assets/*`).

## 2. Asset base path (`vite.config.js` `base: '/boids/'`)

A fresh build of `main` is byte-for-byte identical to the committed `dist/`
(same file names, hashes and `index.html`), so `dist/` on `main` is current
with the source. `test/build.test.js` checks this.

URLs in the built `dist/index.html`:

| Reference | Built URL | Kind |
| --- | --- | --- |
| JS bundle | `/boids/assets/index-efddc0fe.js` | root-absolute, under `/boids/` |
| CSS bundle | `/boids/assets/index-ad720aab.css` | root-absolute, under `/boids/` |
| favicon | `/boids/assets/favicon-82fbd818.ico` | root-absolute, under `/boids/` |
| Play / Pause icons | `/boids/play.svg`, `/boids/pause.svg` | root-absolute (source `/play.svg`) |
| Step / Options icons | `./playNext.svg`, `./options.svg` | page-relative (source `./…`), not rewritten |
| Fonts | `https://fonts.googleapis.com/…`, `https://fonts.gstatic.com` | third party |

What this means in practice, checked with `vite preview`:

- **Served at `/boids/`** (a GitHub Pages project site
  `https://<owner>.github.io/boids/`): everything loads.
- **Served at `/`** (a custom domain on Pages, or `dist/` copied to a web
  root such as Cloudways `public_html`): the JS, CSS, favicon and Play/Pause
  icons all 404. The page shows unstyled controls with no simulation; only the
  Step and Options icons load. Fixing this needs `base` set to `'/'` or
  `'./'` and a rebuild, plus making the four icon references consistent.
- **Served at `/boids` without a trailing slash** on a host that doesn't
  redirect (for example `vite preview` serves the HTML there): the bundles
  load, but `./playNext.svg` and `./options.svg` resolve to `/playNext.svg`
  and `/options.svg` and 404. GitHub Pages redirects `/boids` to `/boids/`,
  so this only matters on other hosts.
- `npm run dev` also serves under `/boids/`, not `/`.

### Prerequisites for any production migration (not done here)

1. The owner confirms the target URL, which decides between `base: '/boids/'`
   (Pages project site) and `base: '/'` or `'./'` (custom domain or root).
2. Pick one release route: either Pages "deploy from a branch" (from a
   committed build on `gh-pages`, since Pages can't serve `/dist` on `main`)
   or Pages "GitHub Actions" (build in CI; `dist/` then no longer needs
   committing).
3. Unify the icon paths (`/play.svg` and `/pause.svg` vs `./playNext.svg` and
   `./options.svg`).
4. Decide what happens to the Google Fonts dependency (§3).
5. If a custom domain is used: add `CNAME` handling (Pages settings or
   `public/CNAME`), the DNS records, and HTTPS enforcement.
6. If Cloudways serves a copy: decide whether to retire it or redirect it to
   Pages, so there aren't two diverging production copies.

## 3. Clean build

Run from a clean checkout:

```
rm -rf node_modules && npm ci --no-audit --no-fund   # added 110 packages
npm run build                                        # vite v4.1.4, 5 modules
npm test                                             # 23 tests, all pass
```

- **Runtime:** Node `v26.11.1`, npm `11.20.0`. Vite 4.1.4 declares
  `node: ^14.18.0 || >=16.0.0`. `package.json` has no `engines` field.
- **Installed versions:** `vite@4.1.4`, `alpinejs@3.13.7`,
  `tailwindcss@3.2.7`, `postcss@8.4.21`, `autoprefixer@10.4.13`,
  `postcss-cli@10.1.0`.
- **Build output:** `index.html` 10.30 kB, JS 57.07 kB (19.02 kB gzip), CSS
  6.93 kB, favicon 10.37 kB, plus the four SVGs copied from `public/`.
- **Warnings, none fatal:**
  - npm 11 didn't run `esbuild@0.16.17`'s postinstall script ("install
    scripts not yet covered by allowScripts"). The build still works, because
    the platform binary comes from the optional dependency.
  - Browserslist: `caniuse-lite is outdated`.
- **No broken build steps.** One side effect: `npm run build` writes into the
  committed `dist/`. Today the output is identical, but any source change
  makes the Archon verify step leave `dist/` modified.
- **`npm audit`:** 26 known vulnerabilities (10 moderate, 16 high), all in
  build-time tools (vite/rollup/esbuild, postcss, yaml, source-map-js and
  others). None of them ship in the static output. Several show "No fix
  available" within the pinned major versions.
- **Unused dependencies:** `alpinejs` is imported and started, but `index.html`
  uses no Alpine directives, and it accounts for most of the 57 kB bundle.
  `postcss-cli` is never called. Tailwind, PostCSS and Autoprefixer are listed
  under `dependencies`, although only the build uses them. These are recorded
  here only; removing any of them is a follow-up.
- **Static files:** the site is purely static, with no PHP, database or
  service calls. Everything runs in the browser from one module script.
- **Third-party fonts:** the page loads Google Fonts CSS for *Electrolize*,
  *Katibeh* and *Martel* (7 weights). Only Electrolize is used
  (`tailwind.config.cjs` `font-f1`). The page sends visitors' IPs to Google
  and falls back to `sans-serif` when offline or blocked.

## 4. Functional baseline

Default settings come from `index.html` (*live* means the setting applies to
the running flock straight away; *on Generate* means it only applies to the
next flock):

| Control | Default | Range | Applies | Baseline behaviour |
| --- | --- | --- | --- | --- |
| Flock Size | 50 | 1–200 | on Generate | Number of agents. |
| Shape | Circle | Line / Circle | live | Circle: filled dot, r = 5. Line: velocity line × radius. A thin direction line is always drawn too (`debugDirection = true`). |
| Min Speed | 0.5 | 0.1–10 | live | Truncated to an integer (**D1**). |
| Max Speed | 2.5 | 0.2–10 | live | Truncated to an integer (**D1**). |
| Seperation | 0.10 | 0–0.25 | live | Scales the push away from agents within 40 px. |
| Seperation Factor | 10 | 0–10 | live | Numerator of the per-axis `factor / dx` push; 0 turns separation off. |
| Alignment | 0.10 | 0–0.25 | live | Steers towards the average velocity of agents within 120 px. |
| Cohesion | 0.0005 | 0–0.0025 | live | Steers towards the average position of agents within 120 px. |
| Turn Factor | 0.4 | 0.1–1 | live | Velocity push per frame back inside the box, in turn mode. |
| Species | 2 | 1–10 | on Generate | Random RGB colour per species. Species identity is the colour string. |
| Bias | 50 | 0–100 | live | Other species weigh `1/bias` in alignment and cohesion. 0 and 1 behave the same (no bias). Separation ignores species. |
| Variance | 5 | 0–100 | on Generate | No effect (**D5**). |
| Box-X / Box-Y | 0 | 0–500 | live | Inset of the boundary rectangle (grey outline). |
| Wrap | on | checkbox | live | On: teleport to the opposite inside edge of the box. Off: steer back by the turn factor. |
| Show Nearby | off | checkbox | live | Green square plus neighbour count per agent (**D6**, **D7**). |
| Show Close | off | checkbox | live | Red square plus close-neighbour count per agent (**D6**, **D7**). |
| Generate | — | button | — | Builds a new flock from all settings, paused. |
| Play / Pause | paused | button | — | Starts or stops a `setInterval` of 8 ms (about 125 updates and draws per second). |
| Step | — | button | — | Pauses, then advances one frame. |
| Options | hidden | button | — | Shows or hides the settings panel. |
| Keys `u` / `p` / `i` | — | keyboard | — | Update one frame / pause / run, without updating the buttons (**D8**). |
| Window resize | — | — | — | The canvas and flock bounds follow the viewport. Agents left outside wrap or steer back in. |

Baseline runs, all seeded and in `test/baseline.test.js`: the default flock
and the turn-boundary flock each run 1,250 frames (10 s) with no lost agents.
Play, Pause, Step, Options, Generate, the live sliders, line/circle,
wrap/turn and resize behave as in the table.

### Browser steps for screenshots and video

No browser is available in this sandbox, so no screenshots were taken. To
record a visual baseline, run `npm ci && npm run dev`, open
`http://localhost:5173/boids/`, and capture:

1. The page on load: a paused, static flock of 50 circles in 2 colours with
   the toolbar at the top. Press **Play** and record about 10 s.
2. Settings set to *Line*, and also *Show Nearby* plus *Show Close*, while
   playing. Shows **D6**: the squares are half the real range.
3. *Wrap* off, Box-X = Box-Y = 150, *Generate*, *Play*: agents steer inside
   the grey box.
4. Species 10, Bias 100, *Generate*, *Play*: the species sort into
   single-colour flocks. Some random colours may be hard to see on the light
   background.
5. Extremes: Seperation 0.25 with Factor 10, then Alignment 0 with Cohesion
   0.0025, then Max Speed 0.8 (**D1**: the flock freezes), then Min 9 with
   Max 2 (**D4**).
6. Flock Size 200, *Generate*: on some seeds a few agents vanish on the first
   frame (**D3**).
7. Narrow the window to about 375 px, set Box-X to 500 (**D9**).
8. Press `i`, then click **Play** (**D8**).

## 5. Defect inventory

Each defect is reproduced by the named test in `test/baseline.test.js`.

| ID | Severity | Defect | Reproduction | Location |
| --- | --- | --- | --- | --- |
| D1 | High | Min/Max Speed are read with `parseInt`. The defaults 0.5 and 2.5 become 0 and 2; any max below 1 becomes 0 and **freezes the flock**. | Settings → Max Speed 0.8 → Step. | `main.js` `Main()` (`parseInt` for both speeds) and `UpdateSlider` 2 and 3 |
| D2 | High | The min-speed clamp computes `vy` from the already-rescaled `vx`, so the speed can overshoot the max and the heading changes. Speed 0 divides by zero. | Min 3, Max 5; an agent with v = (0.3, 0.4) becomes (1.8, 10.8). | `MovePosition` |
| D3 | High | Separation divides by the per-axis distance. Two close agents with an equal x or y give `Infinity`, then `NaN`, and **the agent vanishes for good**. Spawn positions are whole pixels, and wrap mode sends agents to the same x or y, so this happens often. | Flock Size 200, seed 2: agents lost on the first frame. Two agents at x = 100. | `Adjust` separation; `Start` (`Math.floor` positions); `DetectEdgeCollisions` (wrap) |
| D4 | Medium | Min Speed can be set above Max Speed. The min clamp runs last and wins. | Min 9, Max 2 → speed above 2. | Sliders; `MovePosition` |
| D5 | Medium | Variance does nothing. The per-agent separation, alignment and cohesion are stored as `toFixed` strings and never read by `Adjust`. Cohesion's variance also rounds to 0 because of `floor(... * 1000) / 1000`. | Variance 100 → Generate → no difference. | `Start`, `Adjust` |
| D6 | Medium | The debug squares are drawn `vision` (120) / `closeVision` (40) wide, but detection uses `abs(dx) < vision`, a square twice as wide. Detection is square, not circular. | Show Nearby → the green square is 120 px. | `DrawFlock`, `GetNearbyAgents` |
| D7 | Low | Changing Shape or the overlays while paused doesn't redraw until the next frame. | Pause, then toggle Show Nearby. | `ChangeShape`, `UpdateSlider` |
| D8 | Low | The `i` and `p` keys start and stop the interval without updating Play/Pause. Pressing Play while running then pauses. | Press `i`, then click Play. | `document.onkeydown` |
| D9 | Medium | A Box inset of half the canvas or more makes an inverted box. In wrap mode every agent is teleported off-canvas each frame (and lined up for D3). | Window 375 px wide, Box-X 500. | `DetectEdgeCollisions`; slider max 500 is fixed |
| D10 | Low | Agents outside the canvas skip neighbour detection and keep stale neighbour lists. Neighbour search doesn't wrap across edges in wrap mode. | Code reading. | `GetNearbyAgents` |
| D11 | Low | Species colours are random 0–254 RGB values. Two species can look nearly the same, or nearly invisible on the `rgb(250,250,250)` background. | Species 10 → Generate a few times. | `Start` |
| D12 | Low | The simulation runs on `setInterval(8)` rather than `requestAnimationFrame`, so its speed depends on timer throttling (background tabs, slow devices) and it draws more often than the screen refreshes. | Code reading. | `Iterate` |
| D13 | Low | Markup: duplicate `id="playPauseButton"`; the body class `font-mod_dark` and `text-md` aren't real Tailwind classes, so the text colour is the browser default; an inline `onchange="UpdateSlider(…)"` on Seperation refers to a module-scoped function (harmless only because `main.js` replaces the handler); icons have no `alt` and buttons no accessible labels; "Seperation" is misspelled in the UI. | View the source. | `index.html` |
| D14 | Low | The asset paths are inconsistent, and `base: '/boids/'` breaks the site when it is served from `/` (§2). | `vite preview`, request `/`. | `vite.config.js`, `index.html` |

Resizing loses no agents: the canvas and bounds follow the viewport, and
agents outside the new bounds wrap or steer back in. A resize that shrinks the
canvas below the box inset hits D9.
