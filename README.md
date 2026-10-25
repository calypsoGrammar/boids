# Boids

<p>Javascript rendering of bird like objects.</p>

## Development

Needs Node `^22.13.0 || >=24` (see `engines` in `package.json`).

```
npm ci
npm run dev          # http://localhost:5173/boids/
npm run check        # lint, tests and production build
npm run audit:high   # fail on high or critical advisories
npm run bench        # seeded simulation benchmarks
```

`npm run build` writes the committed `dist/`, built for
https://calypsogrammar.github.io/boids/. Commit the rebuilt files with any
source change. `BASE_PATH=/` builds for the root of a host instead; never
commit that build.

## Release

Every merge to `main` publishes `dist/` to GitHub Pages
(`.github/workflows/pages.yml`). Pull requests only run checks. See
`docs/release.md` for the Pages settings, the smoke checklist and rollback.

Tests run with `node --test` and need no browser or network. See
`docs/audit/BOIDS-V1-03.md` for the physics fixtures, the browser smoke tests
and the `KNOWN DEFECT` / `TARGET` naming.
`docs/audit/BOIDS-V1-04.md` lists the speed, separation and edge fixes and
how they change the simulation.
`docs/audit/BOIDS-V1-05.md` describes per-agent variance, species bias and
which settings need Generate.
`docs/audit/BOIDS-V1-06.md` covers the animation loop, the controls, high-DPI
resizing, the status messages and the performance figures.
`docs/audit/BOIDS-V1-08.md` covers the responsive layout, the grouped settings
and the keyboard, touch and screen-reader support of the controls.
