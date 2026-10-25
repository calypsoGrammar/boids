"use strict";

// The page's entry point (index.html). Sets --vh and starts the controller;
// see docs/audit/BOIDS-V1-07.md for what each module does.
import { createApp } from "./controller.js";

function CalculateVh()
{
  let vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', vh + 'px');
}

window.addEventListener('DOMContentLoaded', CalculateVh);
window.addEventListener('resize', CalculateVh);
window.addEventListener('orientationchange', CalculateVh);

createApp({ window, document });
