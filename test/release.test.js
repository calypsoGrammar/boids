// Guards for the release workflows (docs/release.md): publishing happens only
// by hand through the shared Pages deploy, it publishes the committed dist/,
// and CI only reads the repository. Reads the workflow files as text, since no
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

test('the deploy runs only by hand, through the shared Pages workflow', () => {
  assert.equal(block(deploy, 'on:')[0], '  workflow_dispatch:');
  assert.doesNotMatch(code(deploy), /^\s*(push|pull_request|schedule):/m);
  assert.match(deploy, /uses: calypsoGrammar\/deploy-workflows\/\.github\/workflows\/github-pages\.yml@v\d+/);
});

test('the deploy publishes the committed dist/ without rebuilding it', () => {
  assert.match(code(deploy), /^\s*build_command: ''$/m);
  assert.match(code(deploy), /^\s*site_path: dist$/m);
  // The committed dist/ is built with the default /boids/ base.
  assert.doesNotMatch(deploy, /BASE_PATH/);
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
