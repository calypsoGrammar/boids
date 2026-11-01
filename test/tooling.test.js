// Checks for the build tooling chosen in BOIDS-V1-02 (docs/audit/BOIDS-V1-02.md):
// Alpine stays removed, Tailwind scans every file that uses classes, the
// palette survives in the built CSS, and the build uses the browser floor
// Tailwind 4 needs (CAL-1644). Reads the committed dist/, which
// test/build.test.js keeps identical to a fresh build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const html = read('index.html');
const main = read('src/javascripts/main.js');
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
  // Tailwind 4 turns automatic detection off (source(none)) and names the one file.
  const style = read('src/stylesheets/style.css');
  assert.match(style, /@import "tailwindcss" source\(none\);/);
  assert.deepEqual([...style.matchAll(/@source "([^"]+)"/g)].map((m) => m[1]), ['../../index.html']);
  // main.js only toggles inline styles; classes come from index.html alone.
  assert.doesNotMatch(main, /className|classList|setAttribute\(\s*['"]class|innerHTML|insertAdjacentHTML/);
});

test('the built CSS keeps the design palette and font', () => {
  const css = asset('css');
  assert.match(css, /--color-mod_light:#fafafa/);
  assert.match(css, /--color-mod_dark:#323232/);
  assert.match(css, /--color-mod_dark_light:#4b4b4b/);
  assert.match(css, /\.bg-mod_light\{background-color:var\(--color-mod_light\)\}/);
  assert.match(css, /\.bg-mod_dark\{background-color:var\(--color-mod_dark\)\}/);
  assert.match(css, /\.text-mod_light\{color:var\(--color-mod_light\)\}/);
  assert.match(css, /\.hover\\:bg-mod_dark_light:hover\{background-color:var\(--color-mod_dark_light\)\}/);
  assert.match(css, /--font-f1:Electrolize, sans-serif/);
  assert.match(css, /\.font-f1\{font-family:var\(--font-f1\)\}/);
  // The minifier reorders declarations and writes rgb(50,50,50) as #323232.
  for(const type of ['range', 'checkbox'])
  {
    const rule = css.match(new RegExp(`input\\[type=${type}\\]\\{([^}]*)\\}`))[1].split(';');
    assert.ok(rule.includes('accent-color:#323232') && rule.includes('background-color:#fafafa'), type);
  }
  // Every class in index.html is generated, apart from the startButton hook
  // for main.js. (D13's font-mod_dark and text-md were fixed in CAL-1289.)
  const classes = new Set([...html.matchAll(/class=["']([^"']*)["']/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean));
  const escape = (name) => name.replace(/[^\w-]/g, (c) => '\\' + c);
  const missing = [...classes].filter((name) => !css.includes('.' + escape(name)));
  assert.deepEqual(missing.sort(), ['startButton']);
});

test('the build uses the browser floor Tailwind 4 needs', () => {
  const css = asset('css');
  assert.equal(pkg.devDependencies.tailwindcss.startsWith('^4'), true);
  assert.equal(pkg.devDependencies.autoprefixer, undefined);
  assert.match(css, /tailwindcss v4\./);
});
