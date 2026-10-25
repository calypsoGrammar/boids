// Guards for the release workflow of CAL-1290 (BOIDS-V1-09, docs/release.md):
// only main publishes, pull requests never do, and each job has the least
// permissions it needs. Reads the workflow files as text, since no YAML
// parser is installed; each check names the lines it expects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const pages = read('.github/workflows/pages.yml');
const ci = read('.github/workflows/ci.yml');

// The text without comments or blank lines.
const code = (text) => text.split('\n').filter((line) => line.trim() !== '' && !line.trim().startsWith('#')).join('\n');

// The lines under `start` (a whole line, with its indentation).
function block(text, start)
{
  const lines = code(text).split('\n');
  const from = lines.indexOf(start);
  assert.notEqual(from, -1, `missing "${start}"`);
  const indent = start.match(/^ */)[0].length;
  const end = lines.findIndex((line, i) => i > from && line.match(/^ */)[0].length <= indent);
  return lines.slice(from + 1, end === -1 ? undefined : end);
}
const job = (name) => block(pages, `  ${name}:`).map((line) => line.trim());
const permissions = (name) => block(block(pages, `  ${name}:`).join('\n'), '    permissions:').map((line) => line.trim());

test('Pages runs only for main: merges and manual runs, never pull requests', () => {
  assert.deepEqual(block(pages, 'on:'), ['  push:', '    branches: [main]', '  workflow_dispatch:']);
  assert.doesNotMatch(pages, /pull_request/);
  // A manual run from another branch skips both jobs.
  for(const name of ['build', 'deploy'])
    assert.ok(job(name).includes("if: github.ref == 'refs/heads/main'"), name);
});

test('Pages grants nothing by default and only the deploy job can publish', () => {
  assert.match(pages, /^permissions: \{\}$/m);
  assert.deepEqual(permissions('build'), ['contents: read', 'pages: read']);
  assert.deepEqual(permissions('deploy'), ['pages: write', 'id-token: write']);
  assert.ok(job('deploy').includes('needs: build'));
  assert.ok(job('deploy').includes('name: github-pages'), 'deploys through the protected environment');
  assert.ok(job('deploy').some((line) => /uses: actions\/deploy-pages@/.test(line)));
  assert.ok(!job('build').some((line) => /deploy-pages/.test(line)));
  assert.ok(job('build').includes('persist-credentials: false'));
});

test('Pages checks, then publishes only the committed dist/', () => {
  const steps = job('build');
  const order = ['uses: actions/configure-pages@', 'run: npm ci', 'run: npm audit', 'run: npm run lint', 'run: npm run build',
    'run: git diff --exit-code -- dist', 'run: test -z "$(git status --porcelain --ignored -- dist)"', 'run: npm test',
    'uses: actions/upload-pages-artifact@'];
  const at = order.map((step) => steps.findIndex((line) => line.replace(/^- /, '').startsWith(step)));
  assert.deepEqual(at.filter((i) => i === -1), [], 'every step is there');
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'in this order');
  assert.equal(steps[at.at(-1) + 2], 'path: dist');
  // The build uses the default /boids/ base, the one dist/ is committed with.
  assert.doesNotMatch(pages, /BASE_PATH/);
  assert.ok(steps.includes('if [ "$BASE" != "/boids" ]; then'), 'refuses a site that is not served from /boids/');
});

test('pull request CI only reads the repository and never deploys', () => {
  assert.deepEqual(block(ci, 'permissions:'), ['  contents: read']);
  assert.doesNotMatch(code(ci), /pages|deploy|id-token|: write/);
  assert.deepEqual(block(ci, 'on:'), ['  pull_request:', '  workflow_dispatch:']);
});
