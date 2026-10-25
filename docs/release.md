# Release, hosting and rollback

Work for Linear CAL-1290 (BOIDS-V1-09). Boids is a static page: an
`index.html`, one script, one stylesheet, a favicon and four icons. It needs
no server code, database or runtime, so GitHub Pages hosts it.

**Status:** the release workflow, the base path handling and offline tests
are in place. The live steps below (§4–§6) are for a person with admin
rights on the repository, and none had been done when this was written. V1
counts as shipped only once §5 has a filled-in record.

## 1. Source of truth

| What | Where |
| --- | --- |
| Source | `main` of https://github.com/calypsoGrammar/boids |
| Release build | `dist/`, committed on `main`; CI and the release workflow check that a fresh build matches it byte for byte |
| Production URL | https://calypsogrammar.github.io/boids/ (owner's answer on CAL-1290) |
| Publisher | `.github/workflows/pages.yml`, on every push to `main` |
| Host | GitHub Pages only. The owner plans to remove any other copy (such as Cloudways) |

No custom domain is planned. If one is added later, follow §7.

The agent could not check these, so a person confirms them in the first
release (§4):

- the current Pages source (most likely the `gh-pages` branch) and whether a
  custom domain is set in Settings → Pages
- what the `gh-pages` branch holds, and whether it is a working `/boids/`
  build. It is the fallback in §6
- whether a Cloudways site or DNS record still serves a copy of Boids

## 2. Base path

Vite rewrites every asset URL under its `base`. The URLs are absolute, so a
build works only at the path it was made for. `test/pages.test.js` shows a
`/boids/` build served at a host root losing its script and stylesheet.

| Destination | Build | URLs |
| --- | --- | --- |
| Project site `https://calypsogrammar.github.io/boids/` | `npm run build` (the default, committed in `dist/`) | `/boids/assets/…`, `/boids/play.svg`, … |
| Root of a host, such as a custom domain | `BASE_PATH=/ npm run build -- --outDir <elsewhere>` | `/assets/…`, `/play.svg`, … |

- `BASE_PATH` must start and end with `/`. The build fails on anything else.
- Never commit a root build to `dist/`. CI and the release workflow would
  fail, since they compare `dist/` with a default build.
- The four toolbar icons are now all written `/name.svg` in `index.html`, so
  Vite puts each under the base. Before, Step and Settings used
  `./name.svg`, which broke at `/boids` without the trailing slash on hosts
  that don't redirect.

Checks:

- `test/build.test.js`: in both builds, every local URL is under the base and
  names a file of the build, including the favicon, the script, the
  stylesheet and the four icons. The root build is `dist/` with `"/boids/`
  replaced by `"/`, with the same bundles.
- `test/pages.test.js` (headless Chromium, run where Playwright is installed,
  so not on the GitHub runners): serves `dist/` under `/boids/` and a root
  build at `/`, with every request to another host blocked. For each one it
  checks that every request succeeds, the icons decode, the stylesheet
  applies and the flock draws. Then it drives Step, Play, Pause, the Line
  shape, 200 boids, 10 species, 100 % variance, Generate and Close, and loads
  the page on a 390 × 844 touch phone.

## 3. The release workflow

`.github/workflows/pages.yml`:

- **Triggers:** a push to `main` (a merged pull request), or *Run workflow*
  on `main`. It has no `pull_request` trigger. Both jobs skip any ref other
  than `main`. Pull request checks are only in `ci.yml`, which can only read.
- **Build job** (`contents: read`, `pages: read`): checks out the commit
  without keeping credentials and sets up Node 24. Then:
  1. `configure-pages`.
  2. A check that Pages serves the site from `/boids`. A custom domain makes
     the job fail instead of publishing a build that can't load (§7).
  3. `npm ci`, `npm audit --audit-level=high`, `npm run lint` and
     `npm run build`.
  4. A check that the build equals the committed `dist/`, with no untracked
     file.
  5. `npm test`.
  6. Uploads `dist/` alone as the Pages artifact.
- **Deploy job** (`pages: write`, `id-token: write`): runs only after the
  build job passes. It deploys the artifact through the `github-pages`
  environment with `deploy-pages`, and the run shows the page URL.
- The workflow has no default permissions (`permissions: {}`). One release
  runs at a time, and a newer merge waits instead of cancelling one already
  running.
- A new high or critical advisory fails `npm audit` and holds releases back
  until the dependency is updated. That is deliberate.
- The project has no TypeScript, so there is no type-check step. ESLint is
  the static check.

`test/release.test.js` checks the triggers, the permissions, the order of
the steps and the uploaded path, and that `ci.yml` never deploys.

## 4. First release (owner, once)

Merging stays manual: `WORKFLOW.md` keeps `merge: policy: manual`, and this
ticket doesn't change it.

1. **Record the current state** before changing anything:
   - Settings → Pages: source (branch and folder), custom domain, Enforce
     HTTPS
   - `git ls-remote origin gh-pages`: the SHA of the `gh-pages` branch
   - the DNS records for any domain that serves Boids, and whether Cloudways
     serves it
   
   This is the rollback point (§6).
2. **Merge** this change. The first `Pages` run fails at `deploy-pages`
   while the source is still a branch, or at `configure-pages` if Pages is
   off. The build job still shows that the checks pass.
3. **Settings → Pages → Build and deployment → Source: GitHub Actions.** The
   URL stays https://calypsogrammar.github.io/boids/. Leave the `gh-pages`
   branch in place. Pages stops reading it, and it is the fallback.
4. **Settings → Environments → `github-pages`:** set Deployment branches to
   *Selected branches* with only `main`. GitHub usually creates the
   environment this way. Required reviewers are optional; add them for a
   manual approval of each release.
5. **Settings → Branches (or Rulesets) for `main`:** require pull requests
   and the CI checks (`Node 22.13`, `Node 24`, `Node 26`,
   `Security audit`). Block force pushes.
6. **Actions → Pages → Run workflow** on `main`, or re-run the failed run.
   Wait for *Deploy* to pass.
7. **Smoke test** https://calypsogrammar.github.io/boids/ with §5, then fill
   in the record.

## 5. Smoke checklist and release record

Use a private window on desktop, plus one phone. In the browser's network
panel, nothing from `calypsogrammar.github.io` should fail.

- [ ] Loads over HTTPS. `http://calypsogrammar.github.io/boids/` and
      `https://calypsogrammar.github.io/boids` (no slash) both redirect to
      `https://calypsogrammar.github.io/boids/`
- [ ] Favicon, light background, Electrolize font, and the four toolbar icons
      show
- [ ] 50 circles drawn and paused. Play (I) moves them, Pause (P) stops
      them, Step (U) moves one tick
- [ ] Settings opens and closes (button, ×, Escape). Line and Circle shapes
      both draw
- [ ] Flock size 200 + Generate: 200 boids. Species 10 and Variance 100 +
      Generate: the colours split and the boids differ
- [ ] Speed, separation, alignment, cohesion, turn, bias, box inset, wrap,
      nearby and close each change the flock
- [ ] Phone (portrait and landscape): the toolbar and settings fit, and taps
      work
- [ ] Block `fonts.googleapis.com` and `fonts.gstatic.com` (DevTools →
      Network → Block request domain), then reload. Everything works with a
      fallback font. Nothing else comes from another host
- [ ] View source: every asset URL starts with `/boids/`

Record, one per release that changes hosting (add it to this file or the
Linear issue):

```
Date:
Release SHA (main):
Workflow run URL:
Deployment URL:
Pages source / custom domain / Enforce HTTPS:
Previous source and gh-pages SHA (rollback point):
Checklist: all passed / failures:
Browsers and devices:
Checked by:
```

## 6. Rollback

Pick the first one that applies:

1. **A bad release:** revert the merge on `main` with a pull request, and
   merge it. The workflow publishes the reverted commit. Faster: Actions →
   Pages → the last good run → *Re-run all jobs*. A re-run builds and
   deploys that run's commit again. Pages artifacts expire after a day, so
   re-run all the jobs, not only Deploy.
2. **The workflow can't deploy at all:** Settings → Pages → Source:
   *Deploy from a branch* → `gh-pages`, with the folder recorded in §4.1. The
   site goes back to what the branch holds. This only works while the
   `gh-pages` branch still exists, and only if §4.1 found it to be a working
   build.
3. **Hosting moved away from another host (Cloudways):** keep that site and
   its DNS records unchanged until the release record is complete and the
   site has run on Pages for an agreed period. To go back, restore the DNS
   records written down in §4.1.

## 7. Custom domain (not planned)

The owner chose https://calypsogrammar.github.io/boids/. A custom domain
needs explicit approval and DNS rights. Its build serves from `/`, so it is a
code change as well as a settings change:

1. In a pull request, build the release with `BASE_PATH=/` and change the
   `/boids` check in `pages.yml` to expect an empty base path. The comparison
   with the committed `dist/` then needs a separate default build, or
   `dist/` must move to the root base. That is an owner decision. Optionally,
   add `public/CNAME` with the hostname.
2. Settings → Pages → Custom domain: enter the exact hostname, then verify
   the domain (account Settings → Pages → Verified domains).
3. DNS operator: a `CNAME` from the subdomain to `calypsogrammar.github.io`,
   or the Pages `A`/`AAAA` records for an apex. Keep the old records written
   down.
4. Once the certificate is issued, turn on Enforce HTTPS. Then run §5 on the
   new hostname, plus the redirect from the `github.io` URL.
5. Keep the previous host serving until §5 passes. To roll back, restore the
   DNS records and clear the custom domain.

Until then, the release workflow fails if a custom domain is set, rather
than publishing a site that can't load.

## 8. Maintenance

- Each merge to `main` releases. Rebuild and commit `dist/` with every
  source change (`npm run check`). The release fails if it is stale.
- Check the Pages run after each merge. A failure leaves the previous
  release live.
- Update the `actions/*` versions in both workflows together.
- Retiring the `gh-pages` branch and any Cloudways copy is the owner's
  decision, after the release record and the rollback period. Retiring
  `gh-pages` removes rollback route 2.
