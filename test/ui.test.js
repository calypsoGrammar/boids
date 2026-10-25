// Responsive layout and accessible controls for CAL-1289 (BOIDS-V1-08): the
// real markup in jsdom (test/browser.js), from source and from the committed
// build, plus the rules in the built CSS. jsdom does no layout, so sizes and
// positions are checked as CSS rules; see docs/audit/BOIDS-V1-08.md for the
// manual viewport checklist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openPage } from './browser.js';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const built = read('dist/index.html');
const css = read('dist' + built.match(/"\/boids(\/assets\/index-[\w-]+\.css)"/)[1]);
// The declarations of the first rule for `selector` in the built CSS.
const rule = (selector, from = css) =>
{
  const at = from.indexOf(selector + '{');
  assert.ok(at >= 0, selector);
  return from.slice(at + selector.length + 1, from.indexOf('}', at)).split(';');
};
// The CSS inside the first `@media <query>` block.
const media = (query) =>
{
  const at = css.indexOf('@media ' + query + '{');
  assert.ok(at >= 0, query);
  let depth = 0;
  for(let i = at; i < css.length; i++)
  {
    if(css[i] === '{') depth++;
    if(css[i] === '}' && --depth === 0) return css.slice(at, i + 1);
  }
};

// Common phone, tablet and desktop viewports, portrait and landscape.
const VIEWPORTS = [
  [320, 568], [375, 667], [390, 844], [667, 375], [844, 390],
  [768, 1024], [1024, 768], [1280, 720], [1920, 1080],
];

const SLIDERS = [
  'flockSizeRange', 'flockRangeMinSpeed', 'flockRangeMaxSpeed', 'flockRangeSeperation',
  'flockRangeSeperationFactor', 'flockRangeAlignment', 'flockRangeCohesion', 'flockRangeTurn',
  'flockRangeTribes', 'flockRangeBias', 'flockRangeVariance', 'flockRangeBoxX', 'flockRangeBoxY',
];

for(const build of [false, true])
{
  const variant = build ? 'build' : 'source';
  const open = async (t, options) => {
    const page = await openPage({ build, ...options });
    t.after(() => page.close());
    return page;
  };

  test(`${variant}: every id is unique`, async (t) => {
    const page = await open(t);
    const ids = [...page.window.document.querySelectorAll('[id]')].map((el) => el.id);
    assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), []);
  });

  test(`${variant}: the toolbar keeps its three functions as labelled buttons with tooltips`, async (t) => {
    const page = await open(t);
    const toolbar = page.$('toolbar');
    assert.equal(toolbar.tagName, 'NAV');
    assert.ok(toolbar.getAttribute('aria-label'));
    const buttons = [...toolbar.querySelectorAll('button')];
    assert.deepEqual(buttons.map((b) => b.id), ['IS_PAUSED', 'IS_PLAYING', 'nextButton', 'optionsButton']);
    assert.deepEqual(buttons.map((b) => b.getAttribute('aria-label')), ['Play', 'Pause', 'Step one tick', 'Settings']);
    for(const button of buttons)
    {
      assert.ok(button.classList.contains('tool'), button.id);
      assert.match(button.querySelector('.tooltip').textContent, new RegExp(button.getAttribute('aria-label').split(' ')[0], 'i'));
      assert.equal(button.querySelector('.tooltip').getAttribute('aria-hidden'), 'true');
    }
    assert.deepEqual(['IS_PAUSED', 'IS_PLAYING', 'nextButton'].map((id) => page.$(id).getAttribute('aria-keyshortcuts')), ['I', 'P', 'U']);
  });

  test(`${variant}: every button has a type and a name, every image an alt`, async (t) => {
    const page = await open(t);
    const document = page.window.document;
    for(const button of document.querySelectorAll('button'))
    {
      assert.equal(button.type, 'button', button.id);
      assert.ok(button.getAttribute('aria-label') || button.textContent.trim(), button.id);
    }
    for(const img of document.querySelectorAll('img')) assert.equal(img.getAttribute('alt'), '', img.id);
  });

  test(`${variant}: every control has a label, and every slider shows its value`, async (t) => {
    const page = await open(t);
    const document = page.window.document;
    for(const input of document.querySelectorAll('input'))
      assert.ok(input.labels.length > 0 && input.labels[0].textContent.trim(), input.id);
    assert.deepEqual([...document.querySelectorAll('input[type=range]')].map((r) => r.id).sort(), [...SLIDERS].sort());
    for(const id of SLIDERS)
    {
      const output = document.querySelector(`output[for="${id}"]`);
      assert.ok(output, id);
      assert.equal(output.value, page.$(id).value, id);
    }
    assert.doesNotMatch(page.$('settingsMenu').textContent, /Seperation/);
  });

  test(`${variant}: settings are grouped, and only size, species and variance wait for Generate`, async (t) => {
    const page = await open(t);
    const document = page.window.document;
    const legends = [...document.querySelectorAll('.settings-group > legend')].map((l) => l.textContent);
    assert.deepEqual(legends, ['Flock', 'Movement', 'Species', 'Environment & diagnostics']);
    const generate = [...document.querySelectorAll('[data-applies="generate"] input')].map((i) => i.id);
    assert.deepEqual(generate, ['flockSizeRange', 'flockRangeTribes', 'flockRangeVariance']);
    for(const id of generate)
    {
      assert.match(page.$(id).getAttribute('aria-describedby'), /\bgenerateCue\b/);
      assert.match(page.$(id).closest('.setting').querySelector('.cue').textContent, /Generate/);
    }
    // Every other control is marked live and has no Generate cue.
    for(const input of document.querySelectorAll('#settingsMenu input'))
    {
      if(generate.includes(input.id)) continue;
      assert.equal(input.closest('[data-applies]').dataset.applies, 'live', input.id);
      assert.equal(input.closest('.setting').querySelector('.cue'), null, input.id);
    }
    assert.match(page.$('controlsHelp').textContent, /Pause.*Step.*Generate/s);
  });

  test(`${variant}: a slider updates its value and the flock while it is dragged`, async (t) => {
    const page = await open(t);
    page.drag('flockRangeAlignment', 0.2);
    assert.equal(page.$('flockInputAlignment').value, '0.2');
    // The drag reaches the flock: a min speed above the max moves the max.
    page.drag('flockRangeMinSpeed', 4);
    assert.equal(page.$('flockInputMaxSpeed').value, '4');
    assert.ok(page.visible('speedNotice'));
    page.drag('flockSizeRange', 12);
    assert.equal(page.$('flockSizeInput').value, '12');
    assert.ok(page.visible('generatePending'));
    assert.deepEqual(page.errors, []);
  });

  test(`${variant}: the settings button reports its state, and Escape or Close shut the panel`, async (t) => {
    const page = await open(t);
    const options = page.$('optionsButton');
    assert.equal(options.getAttribute('aria-controls'), 'settingsMenu');
    assert.equal(options.getAttribute('aria-expanded'), 'false');
    page.click('optionsButton');
    assert.ok(page.visible('settingsMenu'));
    assert.equal(options.getAttribute('aria-expanded'), 'true');

    page.$('flockRangeBias').focus();
    page.key('Escape');
    assert.ok(!page.visible('settingsMenu'));
    assert.equal(options.getAttribute('aria-expanded'), 'false');
    assert.equal(page.window.document.activeElement, options, 'focus goes back to the Settings button');
    page.key('Escape');
    assert.ok(!page.visible('settingsMenu'), 'Escape never opens the panel');

    page.click('optionsButton');
    page.$('settingsClose').focus();
    page.click('settingsClose');
    assert.ok(!page.visible('settingsMenu'));
    assert.equal(page.window.document.activeElement, options);
  });

  test(`${variant}: keyboard focus follows Play and Pause as they swap`, async (t) => {
    const page = await open(t);
    const active = () => page.window.document.activeElement.id;
    page.$('IS_PAUSED').focus();
    page.click('IS_PAUSED');
    assert.equal(active(), 'IS_PLAYING');
    page.click('IS_PLAYING');
    assert.equal(active(), 'IS_PAUSED');
    page.$('nextButton').focus();
    page.key('i');
    assert.equal(active(), 'nextButton', 'focus elsewhere stays where it is');
    assert.ok(page.visible('IS_PLAYING'));
  });

  test(`${variant}: the speed sliders say when one moved the other`, async (t) => {
    const page = await open(t);
    assert.ok(!page.visible('speedNotice'));
    page.change('flockRangeMinSpeed', 4);
    assert.ok(page.visible('speedNotice'));
    assert.match(page.$('speedNotice').textContent, /Max speed was raised to 4/);
    assert.equal(page.$('flockInputMaxSpeed').value, '4');
    page.change('flockRangeMaxSpeed', 6);
    assert.ok(!page.visible('speedNotice'));
    page.change('flockRangeMaxSpeed', 2);
    assert.match(page.$('speedNotice').textContent, /Min speed was lowered to 2/);
    page.click('generateButton');
    assert.ok(!page.visible('speedNotice'), 'Generate clears it');
  });

  test(`${variant}: a box inset too wide for the window says what is used`, async (t) => {
    const page = await open(t, { width: 375, height: 667 });
    page.change('flockRangeBoxY', 300);
    assert.ok(!page.visible('boxNotice'), '300 px fits a 667 px height');
    page.change('flockRangeBoxX', 300);
    assert.ok(page.visible('boxNotice'));
    // 375 / 2 - 2 agent radii.
    assert.match(page.$('boxNotice').textContent, /Box inset X is 177 px at most/);
    page.resize(1280, 720);
    assert.ok(!page.visible('boxNotice'), 'a wider window clears it');
    page.resize(500, 500);
    assert.match(page.$('boxNotice').textContent, /X is 240 px and Box inset Y is 240 px/);
    page.change('flockRangeBoxX', 0);
    page.change('flockRangeBoxY', 0);
    assert.ok(!page.visible('boxNotice'));
  });

  test(`${variant}: a devicePixelRatio change without a resize resizes the canvas`, async (t) => {
    const queries = [];
    const page = await open(t, {
      devicePixelRatio: 1,
      setup(window)
      {
        window.matchMedia = (query) => {
          const list = { query, listeners: new Set(),
            addEventListener(type, fn) { this.listeners.add(fn); },
            removeEventListener(type, fn) { this.listeners.delete(fn); } };
          queries.push(list);
          return list;
        };
      },
    });
    assert.deepEqual(queries.map((q) => q.query), ['(resolution: 1dppx)']);
    page.window.devicePixelRatio = 2;
    queries[0].listeners.forEach((fn) => fn());
    assert.equal(page.$('gameCanvas').width, 2560);
    assert.equal(queries.length, 2);
    assert.equal(queries[0].listeners.size, 0, 'the old query is dropped');
    assert.equal(queries[1].query, '(resolution: 2dppx)');
    page.resize(800, 600);
    assert.equal(queries.length, 2, 'the same ratio is watched once');
  });

  for(const [width, height] of VIEWPORTS)
  {
    test(`${variant}: ${width} × ${height}: the canvas fills the window and every control works`, async (t) => {
      const page = await open(t, { width, height, devicePixelRatio: 2 });
      const canvas = page.$('gameCanvas');
      assert.deepEqual([canvas.style.width, canvas.style.height], [width + 'px', height + 'px']);
      assert.deepEqual([canvas.width, canvas.height], [width * 2, height * 2]);
      assert.equal(page.window.document.documentElement.style.getPropertyValue('--vh'), height / 100 + 'px');
      page.click('optionsButton');
      page.click('IS_PAUSED');
      assert.ok(page.visible('IS_PLAYING'));
      page.click('nextButton');
      assert.ok(page.visible('IS_PAUSED'));
      for(const id of SLIDERS) page.change(id, page.$(id).max);
      page.change('flockWrap', false);
      page.change('flockNearby', true);
      const frame = page.frame(() => page.click('generateButton'));
      const drawn = frame.slice(frame.findLastIndex((c) => c.name === 'clearRect'));
      assert.equal(drawn.filter((c) => c.name === 'arc').length, 200);
      assert.ok(!page.visible('statusMessage'));
      assert.deepEqual(page.errors, []);
    });
  }
}

test('the canvas sits under the toolbar, settings and status', () => {
  const html = read('index.html');
  assert.match(html, /id="gameContainer" class="fixed inset-0 z-0 overflow-hidden"/);
  assert.match(html, /<body[^>]*class='overflow-hidden /);
  const z = (selector) => Number(rule(selector).find((d) => d.startsWith('z-index:')).slice(8));
  assert.ok(z('.toolbar') > z('.settings-panel') && z('.settings-panel') > 0);
  assert.equal(z('.status-message'), z('.toolbar'));
  assert.ok(css.includes('.z-0{z-index:0}'));
  assert.ok(css.includes('.block{display:block}'), 'no inline gap under the canvas');
});

test('the settings panel scrolls inside the window height', () => {
  const panel = rule('.settings-panel');
  assert.ok(panel.includes('overflow-y:auto'));
  assert.ok(panel.includes('overscroll-behavior:contain'));
  assert.ok(panel.includes('max-height:calc(var(--vh,1vh) * 100 - 5.5rem - env(safe-area-inset-top))'));
  assert.ok(panel.includes('width:calc(100% - 12px)'), 'fits a narrow window');
  // Generate stays reachable while the groups scroll.
  assert.ok(rule('.generate-bar').includes('position:sticky'));
  assert.ok(rule('.settings-groups', media('(min-width:640px)')).includes('grid-template-columns:repeat(2,minmax(0,1fr))'));
});

test('a short landscape screen puts the settings in a column beside the flock', () => {
  const landscape = media('(orientation:landscape) and (max-height:520px)');
  assert.ok(rule('.settings-panel', landscape).includes('width:min(380px,55%)'));
  assert.ok(rule('.settings-panel', landscape).includes('max-height:calc(var(--vh,1vh) * 100 - 12px)'));
  assert.ok(rule('.toolbar', landscape).includes('transform:none'));
  assert.ok(rule('.settings-groups', landscape).includes('grid-template-columns:minmax(0,1fr)'));
});

test('buttons, sliders and toggles are at least 44 px to tap', () => {
  assert.ok(rule('.tool').includes('width:2.75rem') && rule('.tool').includes('height:2.75rem'));
  assert.ok(rule('input[type=range]').includes('height:2.75rem'));
  assert.ok(rule('.choice').includes('min-height:2.75rem'));
  assert.ok(css.includes('.h-11{height:2.75rem}'), 'Generate');
});

test('focus is visible and tooltips show on hover and keyboard focus', () => {
  for(const selector of ['button:focus-visible', 'input:focus-visible'])
    assert.deepEqual(rule(selector).sort(), ['outline-offset:2px', 'outline:2px solid #323232'], selector);
  assert.ok(rule('.tool:focus-visible .tooltip').includes('opacity:1'));
  assert.ok(rule('.tool:hover .tooltip', media('(hover:hover)')).includes('opacity:1'));
  // A tap does not leave a hover highlight behind on a touch screen.
  assert.ok(rule('.tool:hover', media('(hover:hover)')).includes('background-color:#ebebeb'));
  assert.ok(!css.replace(media('(hover:hover)'), '').includes('.tool:hover{'));
  assert.ok(rule('.tooltip').includes('pointer-events:none'));
});

test('reduced motion drops the fades and the press animation', () => {
  const reduced = media('(prefers-reduced-motion:reduce)');
  assert.ok(rule('.tooltip', reduced).includes('transition:none'));
  assert.ok(rule('.tool:active', reduced).includes('transform:none'));
  // Generate's press animation is Tailwind's motion-safe variant.
  assert.match(media('(prefers-reduced-motion:no-preference)'), /motion-safe\\:active\\:scale-95:active/);
});

test('the panel text stays opaque over the flock', () => {
  assert.doesNotMatch(read('index.html'), /opacity:\s*90%/);
  assert.ok(rule('.settings-panel').includes('background-color:#fafafaf0'));
  assert.ok(rule('.hint').includes('color:#4b4b4b'), 'rgb(75,75,75) on rgb(250,250,250), over 7:1');
});
