"use strict";

// The simulation advances in fixed ticks of this many ms (125 per second, the
// rate of the old 8 ms interval), however often the screen refreshes.
export const TICK_MS = 8;
// At most this many ticks are run to catch up in one frame. Time beyond that
// (a background tab, a slow frame) is dropped, so the simulation slows down
// instead of piling up work.
export const MAX_TICKS_PER_FRAME = 8;

// The one animation loop of the page. While playing, each display frame runs
// the ticks that are due at TICK_MS each (at most MAX_TICKS_PER_FRAME), then
// draws once. Play while playing and Pause while paused do nothing, so there
// is never more than one frame request pending. `frames` supplies
// requestAnimationFrame and cancelAnimationFrame (the window in the page).
export class Loop
{
  constructor(tick, draw, fail, frames)
  {
    this.tick = tick;
    this.draw = draw;
    this.fail = fail;
    this.frames = frames;
    this.frame = null;
    this.last = null;
    this.lag = 0;
    this.run = (now) => this.Frame(now);
  }

  get running()
  {
    return this.frame !== null;
  }

  Play()
  {
    if(this.running) return;
    // The first frame runs one tick at once, whatever its time stamp.
    this.last = null;
    this.lag = 0;
    this.frame = this.frames.requestAnimationFrame(this.run);
  }

  Pause()
  {
    if(!this.running) return;
    this.frames.cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  Frame(now)
  {
    this.frame = this.frames.requestAnimationFrame(this.run);
    let elapsed = this.last === null ? TICK_MS : now - this.last;
    this.last = now;
    this.lag = Math.min(this.lag + Math.max(0, elapsed), MAX_TICKS_PER_FRAME * TICK_MS);
    if(this.lag < TICK_MS) return;
    try
    {
      while(this.lag >= TICK_MS)
      {
        this.tick();
        this.lag -= TICK_MS;
      }
      this.draw();
    }
    catch(error)
    {
      this.Pause();
      this.fail(error);
    }
  }
}
