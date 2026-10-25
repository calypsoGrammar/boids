# Boids

<p>Javascript rendering of bird like objects.</p>

## Development

Needs Node `^22.13.0 || >=24` (see `engines` in `package.json`).

```
npm ci
npm run dev          # http://localhost:5173/boids/
npm run check        # lint, tests and production build
npm run audit:high   # fail on high or critical advisories
```

`npm run build` writes the committed `dist/`. Commit the rebuilt files with
any source change.
