// Opens the real page in jsdom, as a browser smoke test without a browser
// download. Unlike test/harness.js, the elements come from parsing the actual
// markup, so a renamed id or a broken handler fails here. `build: true` opens
// dist/index.html with the built bundle instead of index.html with the
// source. jsdom has no canvas, so the 2D context records its calls, and timers
// requestAnimationFrame and Math.random are replaced to keep every run the
// same.
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { seeded } from './fixtures.js';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

function recordingContext(calls)
{
  const ctx = { strokeStyle: '#000000', fillStyle: '#000000', lineWidth: 1 };
  for(const name of ['clearRect', 'beginPath', 'rect', 'stroke', 'moveTo', 'lineTo', 'arc', 'fill', 'fillText', 'setTransform'])
    ctx[name] = (...args) => calls.push({ name, args, strokeStyle: ctx.strokeStyle, fillStyle: ctx.fillStyle });
  return ctx;
}

export async function openPage({ build = false, width = 1280, height = 720, devicePixelRatio = 1, seed = 1 } = {})
{
  let html = read(build ? 'dist/index.html' : 'index.html');
  // jsdom does not run module scripts, so the one module script becomes a
  // classic script at the end of <body>. That runs before DOMContentLoaded,
  // like a deferred module.
  const tag = /<script type=['"]module['"][^>]*\ssrc="([^"]+)"[^>]*><\/script>/;
  const src = html.match(tag)[1];
  const code = build ? read('dist' + src.replace(/^\/boids/, '')) : read(src.replace(/^\.\//, ''));
  html = html.replace(tag, '').replace('</body>', () => `<script>${code}</script></body>`);

  const calls = [];
  // Pending requestAnimationFrame callbacks, and the frame clock in ms.
  const timers = new Map();
  let nextTimer = 1;
  let now = 1000;
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'http://localhost/boids/',
    beforeParse(window)
    {
      Object.assign(window, { innerWidth: width, innerHeight: height, devicePixelRatio });
      const ctx = recordingContext(calls);
      window.HTMLCanvasElement.prototype.getContext = () => ctx;
      window.Math.random = seeded(seed);
      window.requestAnimationFrame = (fn) => { timers.set(nextTimer, fn); return nextTimer++; };
      window.cancelAnimationFrame = (id) => timers.delete(id);
    },
  });
  const { window } = dom;
  const errors = [];
  window.addEventListener('error', (event) => errors.push(event.error ?? event.message));
  await new Promise((resolve) => window.addEventListener('load', resolve));

  const $ = (id) => window.document.getElementById(id);
  return {
    window,
    $,
    calls,
    timers,
    errors,
    // The calls of one frame, for a frame drawn by `action`.
    frame(action) { calls.length = 0; action(); return calls.slice(); },
    // Runs one display frame `ms` (default one 8 ms tick) after the last.
    tick(ms = 8)
    {
      now += ms;
      const pending = [...timers];
      timers.clear();
      for(const [, fn] of pending) fn(now);
    },
    resize(w, h)
    {
      Object.assign(window, { innerWidth: w, innerHeight: h });
      window.dispatchEvent(new window.Event('resize'));
    },
    click(id) { $(id).click(); },
    change(id, value)
    {
      const input = $(id);
      if(input.type === 'checkbox' || input.type === 'radio') input.checked = value;
      else input.value = String(value);
      input.dispatchEvent(new window.Event('change'));
    },
    key(key) { window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key })); },
    visible(id) { return $(id).style.display !== 'none'; },
    close() { window.close(); },
  };
}
