// Checks for the build tooling chosen in BOIDS-V1-02 (docs/audit/BOIDS-V1-02.md):
// Alpine stays removed, Tailwind scans every file that uses classes, the
// palette survives in the built CSS, and the build keeps the browser support
// the site had under Vite 4. Reads the committed dist/, which
// test/build.test.js keeps identical to a fresh build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const root = new URL('..', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const html = read('index.html');
const main = readdirSync(new URL('src/javascripts/', root)).map((file) => read('src/javascripts/' + file)).join('\n');
const pkg = JSON.parse(read('package.json'));
const built = read('dist/index.html');
const asset = (ext) => read('dist' + built.match(new RegExp(`"/boids(/assets/index-[\\w-]+\\.${ext})"`))[1]);

test('the page uses no Alpine.js, so it is not installed or bundled', () => {
  // x-data, x-on:…, x-show, @click, :class and the like.
  const attrs = [...html.matchAll(/<[a-z][^>]*>/gi)].flatMap((m) => [...m[0].matchAll(/\s([@:]?[\w:.-]+)(?==)/g)].map((a) => a[1]));
  assert.deepEqual(attrs.filter((a) => /^(x-|@|:)/.test(a)), []);
  assert.doesNotMatch(main, /alpine/i);
  assert.equal(pkg.dependencies?.alpinejs ?? pkg.devDependencies?.alpinejs, undefined);
  assert.doesNotMatch(asset('js'), /Alpine|x-data/);
});

test('every package is build-time only', () => {
  assert.deepEqual(Object.keys(pkg.dependencies ?? {}), []);
});

test('Tailwind scans every file that sets classes', () => {
  const require = createRequire(import.meta.url);
  const config = require('../tailwind.config.cjs');
  assert.deepEqual(config.content, ['./index.html']);
  // The scripts only toggle inline styles; classes come from index.html alone.
  assert.doesNotMatch(main, /className|classList|setAttribute\(\s*['"]class|innerHTML|insertAdjacentHTML/);
});

test('the built CSS keeps the design palette and font', () => {
  const css = asset('css');
  assert.match(css, /\.bg-mod_light\{[^}]*background-color:rgb\(250 250 250/);
  assert.match(css, /\.bg-mod_dark\{[^}]*background-color:rgb\(50 50 50/);
  assert.match(css, /\.text-mod_light\{[^}]*color:rgb\(250 250 250/);
  assert.match(css, /\.hover\\:bg-mod_dark_light:hover\{[^}]*background-color:rgb\(75 75 75/);
  assert.match(css, /\.font-f1\{font-family:Electrolize,sans-serif\}/);
  // The minifier reorders declarations and writes rgb(50,50,50) as #323232.
  for(const type of ['range', 'checkbox'])
  {
    const rule = css.match(new RegExp(`input\\[type=${type}\\]\\{([^}]*)\\}`))[1].split(';');
    assert.ok(rule.includes('accent-color:#323232') && rule.includes('background-color:#fafafa'), type);
  }
  // Every class in index.html that Tailwind knows is generated. The rest are
  // known markup defects (D13) or plain hooks for main.js.
  const classes = new Set([...html.matchAll(/class=["']([^"']*)["']/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean));
  const escape = (name) => name.replace(/[^\w-]/g, (c) => '\\' + c);
  const missing = [...classes].filter((name) => !css.includes('.' + escape(name)));
  assert.deepEqual(missing.sort(), ['font-mod_dark', 'startButton', 'text-md']);
});

test('the build keeps the Vite 4 browser targets', () => {
  const css = asset('css');
  // Range media queries ((width>=640px)) need Safari 16.4.
  assert.match(css, /@media \(min-width:640px\)/);
  assert.doesNotMatch(css, /@media \(width/);
});
