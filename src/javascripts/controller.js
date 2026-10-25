"use strict";

// Connects the page to the simulation: reads the settings panel through the
// model in src/javascripts/settings.js, keeps one Flock and one Loop, sizes
// the canvas and draws with src/javascripts/renderer.js. Every browser object
// it uses comes in through createApp(), so tests run it against a fake or
// jsdom page.
import { AGENT_RADIUS } from "./agent.js";
import { Flock } from "./flock.js";
import { Loop } from "./loop.js";
import { drawFlock } from "./renderer.js";
import { PARAMETERS, PARAMETER, couple, keys, limits, validate } from "./settings.js";

// A canvas smaller than one agent across, on either axis, has no room to
// simulate in: the flock stops moving until the window is larger again.
const MIN_VIEW_SIZE = 2 * AGENT_RADIUS;
const GENERATE = keys("generate");

// `random` is the source of the flock's random draws.
export function createApp({ window, document, random = Math.random })
{
  const $ = (id) => document.getElementById(id);
  const settingsMenu = $("settingsMenu");
  const generatePending = $("generatePending");
  const gameCanvas = $("gameCanvas");
  const c = gameCanvas.getContext("2d");
  const statusMessage = $("statusMessage");

  // The limits of each numeric parameter, from its slider's attributes.
  const bounds = limits(Object.fromEntries(PARAMETERS.filter((p) => p.range).map((p) => {
    let range = $(p.range);
    return [p.key, [parseFloat(range.min), parseFloat(range.max)]];
  })));

  // The current value of every parameter, as the controls show it. The flock
  // runs with the live ones; the generate ones wait for the next Generate.
  const config = {};
  let flock = null;
  // The canvas size in CSS pixels, which the flock moves in. ReSize() sets it.
  const view = { width: 0, height: 0 };
  // The messages statusMessage shows, by cause; "" when there is none. A
  // replaced setting adds a message under its key until it is read again.
  const notices = { error: "", viewport: "", input: {} };

  const loop = new Loop(
    () => { if(ViewValid()) flock.Step(); },
    () => Draw(),
    (error) => {
      ShowPlaying(false);
      notices.error = "The simulation stopped after an error (" + error.message + "). Press Generate to start again.";
      ShowStatus();
    },
    window,
  );

  // The raw value of parameter `p` in its controls.
  function Raw(p)
  {
    if(p.checkbox) return $(p.checkbox).checked;
    if(p.radios) return $(p.radios.circle).checked ? "circle" : "line";
    return $(p.range).value;
  }

  // Shows `value` in the controls of parameter `p` without firing onchange.
  // A control that already shows the same number keeps its text, so "0.10"
  // stays "0.10".
  function Show(p, value)
  {
    if(p.checkbox) $(p.checkbox).checked = value;
    else if(p.radios) for(let [shape, id] of Object.entries(p.radios)) $(id).checked = shape === value;
    else
    {
      for(let input of [$(p.range), $(p.text)])
        if(input.value === "" || Number(input.value) !== value) input.value = String(value);
    }
  }

  // Reads parameter `key` from its controls into config, replacing an
  // invalid value in the controls too.
  function Read(key)
  {
    let p = PARAMETER[key];
    let raw = Raw(p);
    let result = validate(key, raw, bounds[key]);
    config[key] = result.value;
    notices.input[key] = result.message;
    if(!result.valid || p.text) Show(p, result.value);
    return result.value;
  }

  // Reads every parameter, keeping the speeds in order (min lowered to max).
  function ReadAll()
  {
    for(let p of PARAMETERS) Read(p.key);
    for(let key of couple(config)) Show(PARAMETER[key], config[key]);
  }

  // A control of parameter `key` changed: update config and whatever the
  // parameter applies to, and redraw so a paused flock shows it at once.
  function Changed(key)
  {
    Read(key);
    for(let other of couple(config, key)) Show(PARAMETER[other], config[other]);
    if(flock !== null)
    {
      flock.Configure(config);
      ShowPending();
      Draw();
    }
    ShowStatus();
  }

  // Generate: a new, paused flock from the current settings. Every setting
  // keeps its value; only the agents, the play state and an error notice are
  // reset.
  function Generate()
  {
    // Generate replaces the flock, so the loop that stepped the old one stops.
    Pause();
    notices.error = "";
    ReSize();
    ReadAll();
    flock = new Flock({ ...config, width: view.width, height: view.height, limits: bounds });
    flock.random = random;
    flock.Start();
    Draw();
    ShowPending();
    ShowStatus();
  }

  function Draw()
  {
    drawFlock(c, flock, config);
  }

  function Settings()
  {
    if(settingsMenu.style.display === "") settingsMenu.style.display = "none";
    else settingsMenu.style.display = "";
  }

  // Play, Pause and Step are the only ways the buttons and keys start or stop
  // the loop, so the Play/Pause button always shows what the loop does.
  function Play()
  {
    loop.Play();
    ShowPlaying(loop.running);
  }

  function Pause()
  {
    loop.Pause();
    ShowPlaying(false);
  }

  // Pauses, then advances exactly one tick and draws it.
  function StepOnce()
  {
    Pause();
    if(ViewValid()) flock.Step();
    Draw();
  }

  function ShowPlaying(playing)
  {
    $("IS_PAUSED").style.display = playing ? "none" : "";
    $("IS_PLAYING").style.display = playing ? "" : "none";
  }

  // Whether the canvas has room to simulate in (MIN_VIEW_SIZE). Ticks are
  // skipped while it has not, which leaves every agent as it is.
  function ViewValid()
  {
    return view.width >= MIN_VIEW_SIZE && view.height >= MIN_VIEW_SIZE;
  }

  // Shows every notice, or hides the status when there is none.
  function ShowStatus()
  {
    let text = [notices.error, notices.viewport, ...Object.values(notices.input)]
      .filter((notice) => notice !== "").join(" ");
    statusMessage.textContent = text;
    statusMessage.style.display = text === "" ? "none" : "";
  }

  // Sizes the canvas to the window. Its logical size, in CSS pixels, is what the
  // flock moves in and what is drawn in. Its backing store has devicePixelRatio
  // times as many pixels, so drawing stays sharp on high-DPI screens. The flock
  // keeps its agents and play state; agents left outside a smaller window wrap
  // or turn back in as usual.
  function ReSize()
  {
    let width = Math.floor(window.innerWidth);
    let height = Math.floor(window.innerHeight);
    view.width = Number.isFinite(width) ? Math.max(0, width) : 0;
    view.height = Number.isFinite(height) ? Math.max(0, height) : 0;
    let ratio = window.devicePixelRatio;
    if(!(Number.isFinite(ratio) && ratio > 0)) ratio = 1;

    // Setting the backing size clears the canvas, so it is only set on a change.
    let pixelWidth = Math.round(view.width * ratio);
    let pixelHeight = Math.round(view.height * ratio);
    if(gameCanvas.width !== pixelWidth) gameCanvas.width = pixelWidth;
    if(gameCanvas.height !== pixelHeight) gameCanvas.height = pixelHeight;
    gameCanvas.style.width = view.width + "px";
    gameCanvas.style.height = view.height + "px";
    c.setTransform(ratio, 0, 0, ratio, 0, 0);

    notices.viewport = ViewValid() ? "" : "The window is too small to show the flock ("
      + view.width + " × " + view.height + " px). Make it larger to continue.";
    ShowStatus();

    if(flock !== null)
    {
      flock.width = view.width;
      flock.height = view.height;
      Draw();
    }
  }

  // Shows the Generate notice while a "generate" setting differs from what
  // the current flock was generated with.
  function ShowPending()
  {
    let pending = GENERATE.some((key) => config[key] !== flock[key]);
    generatePending.style.display = pending ? "" : "none";
  }

  $("IS_PAUSED").onclick = () => Play();
  $("IS_PLAYING").onclick = () => Pause();
  $("nextButton").onclick = () => StepOnce();
  $("optionsButton").onclick = () => Settings();
  $("generateButton").onclick = () => Generate();

  for(let p of PARAMETERS)
  {
    let ids = p.radios ? Object.values(p.radios) : [p.range ?? p.checkbox];
    for(let id of ids) $(id).onchange = () => Changed(p.key);
  }

  // u steps, p pauses and i plays, as the buttons do. Shortcuts with a modifier
  // (Ctrl+P and the like) are left to the browser.
  document.onkeydown = function(event)
  {
    if(event.ctrlKey || event.metaKey || event.altKey) return;
    if(event.key == "u") StepOnce();
    if(event.key == "p") Pause();
    if(event.key == "i") Play();
  };

  window.addEventListener("resize", () => ReSize());
  document.addEventListener("DOMContentLoaded", () => Generate());

  return {
    config,
    get flock() { return flock; },
    loop,
    Generate,
    Play,
    Pause,
    StepOnce,
  };
}
