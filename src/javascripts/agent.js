"use strict";

export const AGENT_RADIUS = 5;
// Neighbours closer than this on both axes (px, strictly) count for
// alignment and cohesion: a square 2 * VISION wide around the agent.
export const VISION = 120;
// Neighbours closer than this on both axes count for separation too.
export const CLOSE_VISION = 40;

export class FlockAgent
{
  constructor(
    index,
    seperationOffset,
    alignmentOffset,

    cohesionOffset,
    vision,
    closeVision,

    name,
    radius,
    x,

    y,
    vx,
    vy,

    race)
  {
    this.index = index;
    // Offsets from the flock's separation, alignment and cohesion, drawn
    // from the variance on Generate (see Flock.Coefficient()).
    this.seperationOffset = seperationOffset;
    this.alignmentOffset = alignmentOffset;

    this.cohesionOffset = cohesionOffset;
    this.vision = vision;
    this.closeVision = closeVision;

    this.name = name;
    this.radius = radius;
    this.x = x;

    this.y = y;
    this.vx = vx;
    this.vy = vy;

    this.colour = "rgba(" + race[0] + "," + race[1] + "," + race[2] + ", 1)";

    // Indexes of the agents seen in the last neighbour search: all of them
    // within vision, and those also within closeVision.
    this.nearby = [];
    this.close = [];
    // Whether the last tick pushed the agent back towards the box (turn
    // mode).
    this.outBox = false;
  }
}
