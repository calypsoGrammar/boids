"use strict";

// The flocking simulation: agents, neighbour search, the three Boids rules
// and the box edges. It has no DOM or canvas, so it runs and is tested in
// plain Node; src/javascripts/renderer.js draws it and
// src/javascripts/controller.js connects it to the page.
import { AGENT_RADIUS, CLOSE_VISION, FlockAgent, VISION } from "./agent.js";
import { DEFAULTS, keys, limits } from "./settings.js";

// Separation treats neighbours closer than this (px) as this far away, so the
// push stays finite when two agents overlap.
const MIN_SEPARATION_DISTANCE = 1;
// Spreads the fallback directions for stopped and overlapping agents.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
// The coefficients each agent varies by the variance.
const COEFFICIENTS = ["seperation", "alignment", "cohesion"];
// The settings Configure() changes on a running flock. The "generate" ones
// (flock size, species, variance) are only read by the constructor.
const LIVE = keys("live");

export class Flock
{
  // `settings` holds the flock parameters of src/javascripts/settings.js
  // (any left out are the defaults), plus `width` and `height`, the canvas
  // size in CSS px, and `limits`, the [min, max] of each numeric parameter.
  constructor(settings = {})
  {
    for(let key of [...keys("generate"), ...LIVE]) this[key] = key in settings ? settings[key] : DEFAULTS[key];
    this.width = settings.width ?? 0;
    this.height = settings.height ?? 0;

    // [min, max] of each coefficient: an agent's coefficient never leaves
    // them, and the variance is a share of their range.
    let all = limits(settings.limits);
    this.limits = Object.fromEntries(COEFFICIENTS.map((key) => [key, all[key]]));

    this.agents = [];

    // Source of every random draw in Start(). Tests replace it with a seeded
    // or scripted source; the page always uses Math.random.
    this.random = Math.random;
  }

  // Copies the live settings from `settings` to the running flock.
  Configure(settings)
  {
    for(let key of LIVE) if(key in settings) this[key] = settings[key];
  }

  // Fills the flock with flockSize new agents and runs one tick.
  Start()
  {
    this.Validate();
    // Species and variance only change here, when a flock is generated.
    this.raceCount = Number.isFinite(this.raceCount) ? Math.max(1, Math.floor(this.raceCount)) : 1;
    this.variance = Number.isFinite(this.variance) ? Math.min(Math.max(this.variance, 0), 100) : 0;

    let races = [];

    for(let i = 0; i < this.raceCount; i++)
    {
      // Species are told apart by colour, so a colour already taken is drawn
      // again.
      let col;
      do
      {
        let r = Math.floor(this.random() * 255);
        let g = Math.floor(this.random() * 255);
        let b = Math.floor(this.random() * 255);
        col = [r, g, b];
      }
      while(races.some((race) => race.every((value, j) => value === col[j])));
      races.push(col);
    }

    this.agents.length = 0;

    // Agents start inside the box, so none starts out wrapped or turning.
    let [left, right] = this.Edges(this.boxX, this.width, AGENT_RADIUS);
    let [top, bottom] = this.Edges(this.boxY, this.height, AGENT_RADIUS);

    for(let i = 0; i < this.flockSize; i++)
    {
      let startW = left + Math.floor(this.random() * (right - left));
      let startH = top + Math.floor(this.random() * (bottom - top));
      let startVW = Math.max(this.minSpeed, this.random() * this.maxSpeed);
      let startVH = Math.max(this.minSpeed, this.random() * this.maxSpeed);
      if(this.random() > 0.5) startVW = -startVW;
      if(this.random() > 0.5) startVH = -startVH;

      let s = this.VarianceOffset("seperation");
      let a = this.VarianceOffset("alignment");
      let c = this.VarianceOffset("cohesion");

      let r = Math.floor(this.random() * races.length);
      let newAgent = new FlockAgent(
        i, // index
        s, // seperation offset
        a, // alignment offset
        c, // cohesion offset
        VISION, // vision
        CLOSE_VISION, // close vision
        ("Agent " + i), // name
        AGENT_RADIUS, // radius
        startW, // start x position
        startH, // start y position
        startVW, // start x vector velocity
        startVH, // start y vector velocity
        races[r] // race
        );
      this.agents.push(newAgent);
    }
    this.Step();
  }

  // An agent's offset from the flock value of coefficient `key`: up to
  // variance % of the slider range either way. Two draws (size, then sign)
  // when variance is above 0, none at 0.
  VarianceOffset(key)
  {
    if(!(this.variance > 0)) return 0;
    let [min, max] = this.limits[key];
    let change = this.random() * ((max - min) / 100) * this.variance;
    return this.random() > 0.5 ? -change : change;
  }

  // The agent's own value of coefficient `key`: the live flock value plus the
  // agent's offset, kept inside the slider limits.
  Coefficient(agent, key)
  {
    let [min, max] = this.limits[key];
    let value = this[key] + agent[key + "Offset"];
    if(!Number.isFinite(value)) return min;
    return Math.min(Math.max(value, min), max);
  }

  // Neighbours of another species count 1 / divisor as much as those of the
  // agent's own species in alignment and cohesion: the bias, when above 1.
  // Bias 0 or 1 (or a bias that is not a finite number) weighs all species the
  // same. Separation ignores species.
  SpeciesDivisor()
  {
    return Number.isFinite(this.bias) && this.bias > 1 ? this.bias : 1;
  }

  // Makes the speed limits and box insets usable: finite, not negative, and
  // minSpeed no higher than maxSpeed (maxSpeed is the hard limit, so a min
  // above it is lowered to it). Runs before every step. Settings that come
  // through src/javascripts/settings.js are already valid; this guards
  // against anything else.
  Validate()
  {
    let min = Number.isFinite(this.minSpeed) ? Math.max(0, this.minSpeed) : DEFAULTS.minSpeed;
    let max = Number.isFinite(this.maxSpeed) ? Math.max(0, this.maxSpeed) : DEFAULTS.maxSpeed;
    this.minSpeed = Math.min(min, max);
    this.maxSpeed = max;
    this.boxX = Number.isFinite(this.boxX) ? Math.max(0, this.boxX) : 0;
    this.boxY = Number.isFinite(this.boxY) ? Math.max(0, this.boxY) : 0;
  }

  // One tick. Every agent finds its neighbours and steers from the state at
  // the start of the tick, then all of them move, so the result does not
  // depend on the order of the agents.
  Step()
  {
    this.Validate();
    let len = this.agents.length;
    // The steering buffers are kept between ticks rather than allocated each
    // time.
    if(this.steerX === undefined || this.steerX.length !== len)
    {
      this.steerX = new Float64Array(len);
      this.steerY = new Float64Array(len);
    }
    let steerX = this.steerX;
    let steerY = this.steerY;
    for(let i = 0; i < len; i++)
    {
      this.agents[i].outBox = false;
      this.GetNearbyAgents(this.agents[i], len);
      let steer = this.Steer(this.agents[i]);
      steerX[i] = steer[0];
      steerY[i] = steer[1];
    }
    for(let i = 0; i < len; i++)
    {
      this.agents[i].vx += steerX[i];
      this.agents[i].vy += steerY[i];
      this.DetectEdgeCollisions(this.agents[i]);
      this.MovePosition(this.agents[i]);
    }
  }

  // Fills agent.nearby with every other agent strictly closer than vision on
  // both axes (a square, not a circle), and agent.close with those also
  // closer than closeVision. An agent off the canvas keeps the lists of its
  // last search (D10 in docs/audit/BOIDS-V1-01.md).
  GetNearbyAgents(agent, length)
  {
    if(agent.x < 0 || agent.x > this.width || agent.y < 0 || agent.y > this.height) return;
    // The agent's lists are refilled in place, so a tick allocates no arrays.
    let context = agent.nearby;
    let closeContext = agent.close;
    context.length = 0;
    closeContext.length = 0;
    let range = agent.vision;
    let tooClose = agent.closeVision;
    let x = agent.x;
    let y = agent.y;
    for(let i = 0; i < length; i++)
    {
      if(i == agent.index) continue;
      let other = this.agents[i];
      let xDif = Math.abs(x - other.x);
      if(xDif >= range) continue;
      let yDif = Math.abs(y - other.y);
      if(yDif < range)
      {
        context.push(i);
        if(xDif < tooClose && yDif < tooClose) closeContext.push(i);
      }
    }
  }

  // The velocity change [x, y] from separation, alignment and cohesion, with
  // the agent's own coefficients. Reads the agent and its neighbours and
  // changes nothing. A further force belongs here as one more term added to
  // [newX, newY] (see docs/audit/BOIDS-V1-07.md).
  Steer(agent)
  {
    if(agent.nearby.length === 0) return [0, 0];

    let newX = 0
    let newY = 0;

    let divisor = this.SpeciesDivisor();

    // SEPERATION
    if(agent.close.length > 0)
    {
      let avoidX = 0;
      let avoidY = 0;

      for(let i = 0; i < agent.close.length; i++)
      {
        let other = this.agents[agent.close[i]];
        let xDif = agent.x - other.x;
        let yDif = agent.y - other.y;
        let dist = Math.sqrt(xDif * xDif + yDif * yDif);

        if(dist === 0)
        {
          // Same point: push the pair apart along a direction picked from
          // their indices, opposite for each of the two.
          let angle = GOLDEN_ANGLE * (agent.index + other.index);
          let sign = agent.index < other.index ? 1 : -1;
          xDif = sign * Math.cos(angle);
          yDif = sign * Math.sin(angle);
          dist = 1;
        }

        // Away from the neighbour with strength factor / distance.
        let scale = this.seperationFactor / (Math.max(dist, MIN_SEPARATION_DISTANCE) * dist);
        avoidX += xDif * scale;
        avoidY += yDif * scale;
      }

      let seperation = this.Coefficient(agent, "seperation");
      newX += avoidX * seperation;
      newY += avoidY * seperation;
    }

    // ALIGNMENT
    {
      let alignX = 0;
      let alignY = 0;
      let weight = 0;

      for(let i = 0; i < agent.nearby.length; i++)
      {
        let other = this.agents[agent.nearby[i]];
        let d = agent.colour === other.colour ? 1 : divisor;
        alignX += other.vx / d;
        alignY += other.vy / d;
        weight += 1 / d;
      }

      let alignment = this.Coefficient(agent, "alignment");
      newX += ( alignX / weight - agent.vx ) * alignment;
      newY += ( alignY / weight - agent.vy ) * alignment;
    }

    // COHESION
    {
      let cohereX = 0;
      let cohereY = 0;
      let weight = 0;

      for(let i = 0; i < agent.nearby.length; i++)
      {
        let other = this.agents[agent.nearby[i]];
        let d = agent.colour === other.colour ? 1 : divisor;
        cohereX += other.x / d;
        cohereY += other.y / d;
        weight += 1 / d;
      }

      let cohesion = this.Coefficient(agent, "cohesion");
      newX += ( cohereX / weight - agent.x ) * cohesion;
      newY += ( cohereY / weight - agent.y ) * cohesion;
    }
    return [newX, newY];
  }

  // The box inset used on a canvas axis of `size` px: the setting, capped so
  // the box keeps at least two agent radii of room between its inside edges.
  BoxInset(inset, size, radius = AGENT_RADIUS)
  {
    return Math.min(inset, Math.max(0, size / 2 - 2 * radius));
  }

  // The inside edges [low, high] of the box on one axis for an agent of
  // `radius`. A canvas too small to fit the agent collapses them to its middle.
  Edges(inset, size, radius)
  {
    let low = radius + this.BoxInset(inset, size, radius);
    let high = size - low;
    if(high < low) low = high = size / 2;
    return [low, high];
  }

  DetectEdgeCollisions(agent)
  {
    let [left, right] = this.Edges(this.boxX, this.width, agent.radius);
    let [top, bottom] = this.Edges(this.boxY, this.height, agent.radius);
    if(agent.x < left)
    {
      if(this.wrap) agent.x = right;
      else
      {
        agent.vx += this.turnFactor;
        agent.outBox = true;
      }
    }
    else if(agent.x > right)
    {
      if(this.wrap) agent.x = left;
      else
      {
        agent.vx -= this.turnFactor;
        agent.outBox = true;
      }
    }
    if(agent.y < top)
    {
      if(this.wrap) agent.y = bottom;
      else
      {
        agent.vy += this.turnFactor;
        agent.outBox = true;
      }
    }
    else if(agent.y > bottom)
    {
      if(this.wrap) agent.y = top;
      else
      {
        agent.vy -= this.turnFactor;
        agent.outBox = true;
      }
    }
  }

  // Clamps the speed to [minSpeed, maxSpeed], keeping the heading, then moves.
  MovePosition(agent)
  {
    let speed = Math.sqrt(
    ( agent.vx * agent.vx) +
    ( agent.vy * agent.vy)
    );
    if(!Number.isFinite(speed) || (speed === 0 && this.minSpeed > 0))
    {
      // No heading to keep: use a fixed direction picked from the index.
      let angle = GOLDEN_ANGLE * agent.index;
      agent.vx = Math.cos(angle) * this.minSpeed;
      agent.vy = Math.sin(angle) * this.minSpeed;
      speed = this.minSpeed;
    }
    let limited = Math.min(Math.max(speed, this.minSpeed), this.maxSpeed);
    if(limited !== speed)
    {
      agent.vx = ( agent.vx / speed ) * limited;
      agent.vy = ( agent.vy / speed ) * limited;
    }
    agent.x += agent.vx;
    agent.y += agent.vy;
  }
}
