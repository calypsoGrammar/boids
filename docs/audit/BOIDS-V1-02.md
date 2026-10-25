# BOIDS-V1-02 — Build tooling upgrade and audit

Work for Linear CAL-1283, done on 2026-10-25 on top of the CAL-1282 baseline
(`docs/audit/BOIDS-V1-01.md`). The simulation code is unchanged apart from
removing the unused Alpine.js import. Hosting, Pages settings, DNS and the
`base: '/boids/'` path are unchanged.

## 1. Versions

| Package | Before | After | Why this version |
| --- | --- | --- | --- |
| `vite` | 4.1.4 | **8.3.5** | Current `latest`. Every Vite release up to 6.4.3 has open advisories (dev server `server.fs.deny` bypasses, launch-editor, DOM clobbering). |
| `tailwindcss` | 3.2.7 | **3.4.19** | The `v3-lts` dist-tag, still maintained (3.4.19 was released 2025-12-10). Tailwind 4 is a rewrite with a CSS-first config, a new preflight and a higher browser floor (Safari 16.4+), so it was not taken (§4). |
| `postcss` | 8.4.21 | **8.5.31** | Current `latest`. Fixes the source-map file-read advisories (`<= 8.5.22`). |
| `autoprefixer` | 10.4.13 | **10.6.1** | Current `latest`. Pulls a fixed `browserslist`. |
| `alpinejs` | 3.13.7 | **removed** | Not used (§3). |
| `postcss-cli` | 10.1.0 | **removed** | No script or config calls it. Vite runs PostCSS itself through `postcss.config.cjs`. |
| `eslint`, `@eslint/js`, `globals` | — | **10.13.0, 10.0.1, 17.13.0** | New, for `npm run lint`. |

All packages are now `devDependencies`. The site ships only the built static
files, so nothing is needed at runtime.

**Node runtime:** `package.json` `engines` is `^22.13.0 || >=24`: the
intersection of Vite 8 (`^20.19.0 || >=22.12.0`) and ESLint 10
(`^20.19.0 || ^22.13.0 || >=24`), without Node 20, which reached end of life
in April 2026. CI runs on 22.13, 24 (active LTS) and 26 (what the Archon runner
uses, `v26.11.1` with npm `11.20.0`).

## 2. Security audit

`npm audit` before the upgrade: **14 vulnerable packages, 9 high and 5
moderate** (counting packages; CAL-1282 counted 26 under the older npm
advisory data). They were in vite, rollup, esbuild, postcss, nanoid,
picomatch, braces, micromatch, browserslist, source-map-js, yaml,
postcss-nested, postcss-selector-parser and tailwindcss.

After the upgrade: **0 high, 0 critical, 3 moderate**. `npm run audit:high`
(`npm audit --audit-level=high`) passes, and CI runs it on every pull request.

The 3 moderate findings are one advisory,
[GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf)
(quadratic CPU time when parsing long, flat selectors), reported through
`postcss-selector-parser@6.1.5`, `postcss-nested@6.2.0` and `tailwindcss@3.4.19`.
**Accepted for now:** it only affects the build, the only input is this
repository's own CSS and `index.html`, and nothing from it ships to visitors.
The only fix npm offers is Tailwind 4 (§4). A forced `overrides` to
`postcss-selector-parser@7` would put a major version under Tailwind 3 that it
does not declare support for, so it was not used.

The lockfile has 382 packages, all resolved from `registry.npmjs.org`. No
installed package has an install script, so the npm 11 `allowScripts` warning
for `esbuild` that CAL-1282 saw is gone. Vite 8 bundles with Rolldown and
minifies CSS with Lightning CSS, and both come as prebuilt optional platform
packages.

## 3. Alpine.js

Evidence that nothing used it:

- `index.html` has no Alpine attributes: no `x-*`, no `@event` shorthand and
  no `:attr` bindings.
- `src/javascripts/main.js` only imported Alpine, assigned `window.Alpine` and
  called `Alpine.start()`. Nothing read `window.Alpine`, `$store`, `$el` or any
  other Alpine API. Every control is wired with `onclick` / `onchange`
  handlers on elements fetched by id.
- The CAL-1282 test harness already ran `main.js` with those three lines
  stripped, and all 23 baseline tests for every control passed.

Removed: the three lines in `main.js` and the `alpinejs` package. All 23
CAL-1282 baseline tests still pass unchanged. `test/tooling.test.js` checks
that `index.html` has no Alpine directives, that `main.js` and `package.json`
don't mention it, and that the built bundle doesn't contain it. The JS bundle
went from 57.07 kB (19.02 kB gzip) to 13.25 kB (3.43 kB gzip).

The harness comment in `test/harness.js` ("The page's Alpine import is
stripped") is now stale. That file belongs to CAL-1282, so it was left alone.
Its strip regexes now just match nothing.

## 4. Breaking changes reviewed

**Vite 4 → 8**

- *Default build target.* Since Vite 7 the default is
  `'baseline-widely-available'` (Chrome 111, Safari 16.4, Firefox 114).
  Lightning CSS then rewrote `@media (min-width:640px)` to
  `@media (width>=640px)`, which breaks the `sm:`/`lg:` layout on older
  Safari. `vite.config.js` now sets `build.target` to Vite 4's own default
  (`es2020, edge88, firefox78, chrome87, safari14`), so browser support is
  unchanged. A test checks that the media queries keep `min-width`.
- *Rolldown and Lightning CSS* replace Rollup and esbuild. File hashes now
  use base64url (`index-BgQT_Li-.js`). The `[\w-]+` patterns in
  `test/build.test.js` already allow this. No plugins or `rollupOptions` are
  used, so nothing else in the config is affected.
- `base: '/boids/'`, the `public/` copy and the asset URL rewriting behave as
  before. `test/build.test.js` (CAL-1282) passes unchanged, and `vite preview`
  served the page, JS, CSS, favicon and all four icons from `/boids/` with
  status 200.
- Node 20.19+ / 22.12+ is required (see `engines`).

**Tailwind 3.2 → 3.4 (generated CSS compared rule by rule)**

- Same utilities, same palette (`mod_dark` `rgb(50,50,50)`, `mod_dark_light`
  `rgb(75,75,75)`, `mod_light` `rgb(250,250,250)`) and same `font-f1`
  (Electrolize). Colours are now written as `rgb(50 50 50/var(--tw-bg-opacity,1))`
  and `#323232`, which are the same values.
- Preflight additions in 3.3/3.4: `letter-spacing`/`font-feature-settings`
  inherit on form controls, `dialog { padding: 0 }`,
  `[hidden]:where(:not([hidden=until-found]))`, `-webkit-tap-highlight-color:
  transparent`, `:host` matching `html`, and a shorter system font fallback
  list. The page sets no letter spacing and uses no dialog or `hidden`, and
  the body font is Electrolize, so nothing visible changes.
- `transform` uses `skewX()` instead of `skew()`. These are equivalent with no
  y argument.
- Lightning CSS reorders declarations inside a rule and writes `#0000001a`
  for `rgb(0 0 0 / .1)`. The values are the same.
- Tailwind 4 was not adopted. It needs a config migration to CSS, changes
  preflight defaults (border and placeholder colours, button cursor) and the
  shadow/rounded scale names, and requires Safari 16.4+ / Chrome 111+. That
  would change the visual output and the supported browsers.

**Content scanning:** `tailwind.config.cjs` keeps `content: ['./index.html']`.
`main.js` never sets class names (it only toggles inline `style.display`).
Adding `./src/**/*.js` was tried: it only added a false-positive `.resize`
utility, picked up from the `'resize'` event name. A test checks that `main.js`
still sets no classes and that every Tailwind class in `index.html` is
generated. The ones left over are `startButton` (a JS hook) and
`font-mod_dark` / `text-md`, which are not Tailwind classes (CAL-1282 D13,
not fixed here).

No new root-relative asset paths were added. The built URLs are the same as
in BOIDS-V1-01 §2, apart from the hashes.

## 5. Scripts and CI

| Script | What it does |
| --- | --- |
| `npm run lint` | ESLint 10 (`eslint.config.js`, recommended rules) on `src/`, `test/` and the configs. |
| `npm test` | `node:test`: the CAL-1282 baseline and build tests plus `test/tooling.test.js`. |
| `npm run build` | `vite build` into the committed `dist/`. |
| `npm run check` | lint, then test, then build. |
| `npm run check:clean` | `npm ci`, then `check`. |
| `npm run audit:high` | `npm audit --audit-level=high`. Needs the registry. |

`.github/workflows/ci.yml` runs on `pull_request` and manual dispatch only. It
has `permissions: contents: read`, checks out without persisting
credentials, uses no secrets and has no deploy or Pages step, so a PR check
cannot publish production. It runs `npm ci`, lint, build,
`git diff --exit-code -- dist` (the committed build must be current) and
`npm test` on Node 22.13, 24 and 26, plus `npm audit --audit-level=high`.

`WORKFLOW.md` verify now runs `npm run lint`, `npm run build` and `npm test`
(audit is left out because verify may not have registry access). The agent
prompt no longer mentions Alpine. Both changes only take effect once merged to
`main`.

`dist/` was rebuilt with the new tooling and committed, so a fresh build still
matches it byte for byte, as `test/build.test.js` requires.
