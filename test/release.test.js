// Guards for the release workflows (docs/release.md): publishing happens only
// by hand through the shared Cloudflare Pages deploy, it publishes a fresh
// build for the root of boids.calypsogrammar.com, and CI only reads the
// repository. Reads the workflow files as text, since no
// YAML parser is installed; each check names the lines it expects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const deploy = read('.github/workflows/deploy.yml');
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

test('the deploy runs only by hand, through the shared Cloudflare Pages workflow', () => {
  assert.equal(block(deploy, 'on:')[0], '  workflow_dispatch:');
  assert.doesNotMatch(code(deploy), /^\s*(push|pull_request|schedule):/m);
  assert.match(deploy, /uses: calypsoGrammar\/deploy-workflows\/\.github\/workflows\/cloudflare-pages\.yml@v\d+/);
});

test('the deploy builds a fresh dist/ for the root of its subdomain', () => {
  // The committed dist/ is built for the old /boids/ path, so the deploy rebuilds with base /.
  assert.deepEqual(block(deploy, '      build_command: |').map((line) => line.trim()), ['npm ci --no-audit --no-fund', 'npm run build -- --base=/']);
  assert.match(code(deploy), /^\s*project_name: boids$/m);
  assert.match(code(deploy), /^\s*site_url: https:\/\/boids\.calypsogrammar\.com$/m);
});

test('the deploy requires every CI job to have passed', () => {
  const required = block(deploy, '      required_checks: |').map((line) => line.trim());
  const nodeJobs = ci.match(/node: \[(.*)\]/)[1].split(',').map((node) => `Node ${node.trim().replace(/'/g, '')}`);
  assert.deepEqual(required, [...nodeJobs, 'Security audit']);
  assert.match(ci, /name: Security audit/);
});

test('CI checks the committed dist/ and only reads the repository', () => {
  assert.deepEqual(block(ci, 'permissions:'), ['  contents: read']);
  assert.doesNotMatch(code(ci), /pages|deploy|id-token|: write/);
  assert.deepEqual(block(ci, 'on:'), ['  pull_request:', '  push:', '    branches: [main]', '  workflow_dispatch:']);
  assert.match(ci, /run: git diff --exit-code -- dist/);
  assert.match(ci, /run: test -z "\$\(git status --porcelain --ignored -- dist\)"/);
});
