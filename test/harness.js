// Loads src/javascripts/main.js headlessly against a minimal fake DOM so the
// simulation can be stepped in Node without a browser. The page's Alpine
// import is stripped; main.js does not use any Alpine directives.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../src/javascripts/main.js', import.meta.url), 'utf8');

// Read every <input> in index.html so the harness starts from the real
// default values and slider limits.
function parseInputs()
{
  const inputs = {};
  for(const tag of html.match(/<input[^>]*>/g))
  {
    const attr = (name) => (tag.match(new RegExp('\\s' + name + '="([^"]*)"')) || [])[1];
    inputs[attr('id')] = {
      type: attr('type'),
      value: attr('value') ?? '',
      min: attr('min'),
      max: attr('max'),
      checked: /\schecked[\s>]/.test(tag),
    };
  }
  return inputs;
}

function fakeContext(calls)
{
  const record = (name) => (...args) => calls.push([name, ...args]);
  return {
    strokeStyle: '#000000',
    fillStyle: '#000000',
    lineWidth: 1,
    clearRect: record('clearRect'),
    beginPath: record('beginPath'),
    rect: record('rect'),
    stroke: record('stroke'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    arc: record('arc'),
    fill: record('fill'),
    fillText: record('fillText'),
  };
}

export function loadPage({ width = 1280, height = 720, seed = 1 } = {})
{
  const calls = [];
  const elements = {};
  const listeners = {};
  const element = (id, props = {}) => (elements[id] ??= { id, style: { display: '' }, ...props });

  for(const [id, props] of Object.entries(parseInputs())) element(id, props);
  const ctx = fakeContext(calls);
  element('gameCanvas', { width: 300, height: 150, getContext: () => ctx });
  // ReSize() reads the container's scroll size, which tracks the viewport.
  Object.defineProperties(element('gameContainer'), {
    scrollWidth: { get: () => window.innerWidth },
    scrollHeight: { get: () => window.innerHeight },
  });
  element('settingsMenu', { style: { display: 'none' } });
  element('IS_PLAYING', { style: { display: 'none' } });

  const startButtons = [element('IS_PAUSED'), elements.IS_PLAYING];
  const on = (target) => (type, fn) => (listeners[target + ':' + type] ??= []).push(fn);
  const window = { innerWidth: width, innerHeight: height, addEventListener: on('window') };
  const document = {
    documentElement: { style: { setProperty() {} } },
    getElementById: (id) => element(id),
    getElementsByClassName: (name) => (name === 'startButton' ? startButtons : []),
    addEventListener: on('document'),
    onkeydown: null,
  };

  // Deterministic Math.random (mulberry32) so runs are reproducible.
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const math = Object.create(Math);
  math.random = random;

  const timers = new Map();
  let nextTimer = 1;
  const context = vm.createContext({
    window,
    document,
    Math: math,
    setInterval: (fn) => { timers.set(nextTimer, fn); return nextTimer++; },
    clearInterval: (id) => timers.delete(id),
  });

  const script = source.replace(/^import Alpine.*$/m, '').replace(/^window\.Alpine.*$/m, '').replace(/^Alpine\.start\(\).*$/m, '');
  vm.runInContext(script, context);

  const fire = (key) => (listeners[key] ?? []).forEach((fn) => fn());
  const page = {
    elements,
    calls,
    window,
    timers,
    // Top-level bindings of main.js live in the context's global lexical scope.
    eval: (code) => vm.runInContext(code, context),
    get flock() { return page.eval('flock'); },
    load() { fire('window:DOMContentLoaded'); fire('document:DOMContentLoaded'); },
    resize(w, h) { window.innerWidth = w; window.innerHeight = h; fire('window:resize'); },
    // Runs the pending setInterval callback n times, as the browser would.
    // Only the draw calls of the last frame are kept.
    tick(n = 1) { for(let i = 0; i < n; i++) for(const fn of [...timers.values()]) { calls.length = 0; fn(); } },
    setSlider(id, value) { elements[id].value = String(value); elements[id].onchange(); },
    setCheckbox(id, checked) { elements[id].checked = checked; elements[id].onchange(); },
    click(id) { elements[id].onclick(); },
    key(key) { document.onkeydown({ key }); },
  };
  return page;
}
