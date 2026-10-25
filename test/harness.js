// Runs the page controller (src/javascripts/controller.js) headlessly against
// a minimal fake DOM, so the whole page can be driven in Node without a
// browser. The inputs and their defaults and limits come from index.html;
// the flock draws from a seeded random source, so runs are reproducible.
import { readFileSync } from 'node:fs';
import { createApp } from '../src/javascripts/controller.js';
import { seeded } from './random.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// Read every <input> in index.html so the harness starts from the real
// default values and slider limits.
export function parseInputs()
{
  const inputs = {};
  for(const tag of html.match(/<input[^>]*>/g))
  {
    const attr = (name) => (tag.match(new RegExp('\\s' + name + '="([^"]*)"')) || [])[1];
    inputs[attr('id')] = {
      type: attr('type'),
      name: attr('name'),
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
  const ctx = { strokeStyle: '#000000', fillStyle: '#000000', lineWidth: 1 };
  for(const name of ['clearRect', 'beginPath', 'rect', 'stroke', 'moveTo', 'lineTo', 'arc', 'fill', 'fillText', 'setTransform'])
    ctx[name] = (...args) => calls.push([name, ...args]);
  return ctx;
}

export function loadPage({ width = 1280, height = 720, devicePixelRatio = 1, seed = 1 } = {})
{
  const calls = [];
  const elements = {};
  const listeners = {};
  const element = (id, props = {}) => (elements[id] ??= { id, style: { display: '' }, ...props });

  for(const [id, props] of Object.entries(parseInputs())) element(id, props);
  const ctx = fakeContext(calls);
  element('gameCanvas', { width: 300, height: 150, getContext: () => ctx });
  element('settingsMenu', { style: { display: 'none' } });
  element('statusMessage', { style: { display: 'none' }, textContent: '' });
  element('generatePending', { style: { display: 'none' } });
  element('IS_PLAYING', { style: { display: 'none' } });

  // Pending requestAnimationFrame callbacks, and the frame clock in ms.
  // The page gets no setInterval or setTimeout, so it cannot leave one running.
  const timers = new Map();
  let nextTimer = 1;
  let now = 1000;
  const on = (target) => (type, fn) => (listeners[target + ':' + type] ??= []).push(fn);
  const window = {
    innerWidth: width,
    innerHeight: height,
    devicePixelRatio,
    addEventListener: on('window'),
    requestAnimationFrame: (fn) => { timers.set(nextTimer, fn); return nextTimer++; },
    cancelAnimationFrame: (id) => timers.delete(id),
  };
  const document = {
    getElementById: (id) => element(id),
    addEventListener: on('document'),
    onkeydown: null,
  };

  const app = createApp({ window, document, random: seeded(seed) });

  const fire = (key) => (listeners[key] ?? []).forEach((fn) => fn());
  const page = {
    app,
    elements,
    calls,
    window,
    timers,
    get flock() { return app.flock; },
    load() { fire('document:DOMContentLoaded'); },
    resize(w, h) { window.innerWidth = w; window.innerHeight = h; fire('window:resize'); },
    // Runs one display frame `ms` after the last: the pending
    // requestAnimationFrame callbacks, as the browser would. Only the draw
    // calls of this frame are kept.
    frame(ms)
    {
      now += ms;
      const pending = [...timers];
      timers.clear();
      calls.length = 0;
      for(const [, fn] of pending) fn(now);
    },
    // Runs n frames of one 8 ms tick each.
    tick(n = 1) { for(let i = 0; i < n; i++) page.frame(8); },
    setSlider(id, value) { elements[id].value = String(value); elements[id].onchange(); },
    // Checks or unchecks a checkbox, or selects a radio button (unchecking
    // the others of its group), as a click would.
    setCheckbox(id, checked)
    {
      const input = elements[id];
      if(input.type === 'radio')
        for(const other of Object.values(elements)) if(other.name === input.name) other.checked = false;
      input.checked = checked;
      input.onchange();
    },
    click(id) { elements[id].onclick(); },
    key(key, modifiers = {}) { document.onkeydown({ key, ...modifiers }); },
  };
  return page;
}
