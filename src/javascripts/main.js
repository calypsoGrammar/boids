"use strict";

function CalculateVh()
{
  let vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', vh + 'px');
}

window.addEventListener('DOMContentLoaded', CalculateVh);
window.addEventListener('resize', CalculateVh);
window.addEventListener('orientationchange', CalculateVh);

// Speeds used when a setting is not a number: the index.html defaults.
const DEFAULT_MIN_SPEED = 0.5;
const DEFAULT_MAX_SPEED = 2.5;
const DEFAULT_FLOCK_SIZE = 50;
const AGENT_RADIUS = 5;
// The simulation advances in fixed ticks of this many ms (125 per second, the
// rate of the old 8 ms interval), however often the screen refreshes.
const TICK_MS = 8;
// At most this many ticks are run to catch up in one frame. Time beyond that
// (a background tab, a slow frame) is dropped, so the simulation slows down
// instead of piling up work.
const MAX_TICKS_PER_FRAME = 8;
// A canvas smaller than one agent across, on either axis, has no room to
// simulate in: the flock stops moving until the window is larger again.
const MIN_VIEW_SIZE = 2 * AGENT_RADIUS;
// Separation treats neighbours closer than this (px) as this far away, so the
// push stays finite when two agents overlap.
const MIN_SEPARATION_DISTANCE = 1;
// Spreads the fallback directions for stopped and overlapping agents.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
// The coefficients each agent varies, with the slider that sets the flock
// value and the slider limits (index.html) used when a slider has none.
const COEFFICIENTS = {
  seperation: { slider: "flockRangeSeperation", limits: [0, 0.25] },
  alignment: { slider: "flockRangeAlignment", limits: [0, 0.25] },
  cohesion: { slider: "flockRangeCohesion", limits: [0, 0.0025] },
};

class Flock
{
  constructor(
    flockSize,
    minSpeed,
    maxSpeed,

    width,
    height,
    seperation,

    seperationFactor,
    alignment,
    cohesion,

    bias,
    variance,
    turnFactor,
    raceCount,

    shape,
    boxX,
    boxY,

    wrap,
    nearby,
    close,

    )
  {
    this.flockSize = flockSize;
    this.minSpeed = minSpeed;
    this.maxSpeed = maxSpeed;

    this.width = width;
    this.height = height;
    this.seperation = seperation;

    this.seperationFactor = seperationFactor;
    this.alignment = alignment;
    this.cohesion = cohesion;

    this.bias = bias;
    this.variance = variance;
    this.turnFactor = turnFactor;
    this.raceCount = raceCount;

    this.shape = shape;

    this.agents = [];

    this.box_x = boxX;
    this.box_y = boxY;
    this.wrap = wrap;

    this.nearbyBool = nearby;
    this.closeBool = close;

    // [min, max] of each coefficient in COEFFICIENTS. Start() reads them from
    // the sliders; an agent's coefficient never leaves them.
    this.limits = {};
    for(let key in COEFFICIENTS) this.limits[key] = COEFFICIENTS[key].limits;

    // Source of every random draw in Start(). Tests replace it with a seeded
    // or scripted source; the page always uses Math.random.
    this.random = Math.random;
  }

Start()
{
  this.Validate();
  // Species and variance only change here, when a flock is generated.
  this.raceCount = Number.isFinite(this.raceCount) ? Math.max(1, Math.floor(this.raceCount)) : 1;
  this.variance = Number.isFinite(this.variance) ? Math.min(Math.max(this.variance, 0), 100) : 0;
  for(let key in COEFFICIENTS) this.limits[key] = this.SliderLimits(COEFFICIENTS[key]);

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
  let [left, right] = this.Edges(this.box_x, this.width, AGENT_RADIUS);
  let [top, bottom] = this.Edges(this.box_y, this.height, AGENT_RADIUS);

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
      120, // vision
      40, // close vision
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
  this.Update();
  this.DrawFlock(this.shape);
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

// The [min, max] of a coefficient's slider, or its default limits when the
// slider has no usable ones.
SliderLimits(coefficient)
{
  let slider = document.getElementById(coefficient.slider);
  let min = parseFloat(slider && slider.min);
  let max = parseFloat(slider && slider.max);
  if(Number.isFinite(min) && Number.isFinite(max) && min <= max) return [min, max];
  return coefficient.limits;
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
// above it is lowered to it). Runs before every step.
Validate()
{
  let min = Number.isFinite(this.minSpeed) ? Math.max(0, this.minSpeed) : DEFAULT_MIN_SPEED;
  let max = Number.isFinite(this.maxSpeed) ? Math.max(0, this.maxSpeed) : DEFAULT_MAX_SPEED;
  this.minSpeed = Math.min(min, max);
  this.maxSpeed = max;
  this.box_x = Number.isFinite(this.box_x) ? Math.max(0, this.box_x) : 0;
  this.box_y = Number.isFinite(this.box_y) ? Math.max(0, this.box_y) : 0;
}

// One tick and a redraw.
Update()
{
  this.Step();
  this.DrawFlock(this.shape);
}

// One tick, without drawing. Every agent finds its neighbours and steers from
// the state at the start of the tick, then all of them move, so the result
// does not depend on the order of the agents.
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

Adjust(agent)
{
  let steer = this.Steer(agent);
  agent.vx += steer[0];
  agent.vy += steer[1];
}

// The velocity change [x, y] from separation, alignment and cohesion, with
// the agent's own coefficients. Reads the agent and its neighbours and
// changes nothing.
Steer(agent)
{
  if(agent.nearby.length === 0) return [0, 0];

  let newX = 0
  let newY = 0;

  let sep = true;
  let ali = true;
  let coh = true;

  let divisor = this.SpeciesDivisor();

  // SEPERATION
  if(sep)
  {
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
  }

  // ALIGNMENT
  if(ali)
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
  if(coh)
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
  let [left, right] = this.Edges(this.box_x, this.width, agent.radius);
  let [top, bottom] = this.Edges(this.box_y, this.height, agent.radius);
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

DrawFlock(style)
{
  c.clearRect(0, 0, this.width, this.height);

  c.strokeStyle = "#d1d5db";

  let boxX = this.BoxInset(this.box_x, this.width);
  let boxY = this.BoxInset(this.box_y, this.height);
  c.beginPath();
  c.rect(boxX, boxY, (this.width - (boxX * 2)), (this.height - (boxY * 2)));
  c.stroke();

  let debugDirection = true;

  for(let i = 0; i < this.agents.length; i++)
  {
    if(style === "line")
    {
      c.lineWidth = ( this.agents[i].radius / 3 );
      let newx = this.agents[i].vx * this.agents[i].radius;
      let newy = this.agents[i].vy * this.agents[i].radius;
      if(c.strokeStyle != this.agents[i].colour) c.strokeStyle = this.agents[i].colour;
      c.beginPath();
      c.moveTo(this.agents[i].x, this.agents[i].y);
      c.lineTo(this.agents[i].x + newx, this.agents[i].y + newy);
      c.stroke();
    }
    else if(style === "circle")
    {
      if(c.fillStyle != this.agents[i].colour) c.fillStyle = this.agents[i].colour;
      c.beginPath();
      c.arc(this.agents[i].x, this.agents[i].y, this.agents[i].radius, 0, 2 * Math.PI);
      c.fill();
    }

    if(this.nearbyBool)
    {
      c.strokeStyle = "green";
      c.beginPath();
      c.rect(this.agents[i].x - (this.agents[i].vision / 2), this.agents[i].y - (this.agents[i].vision / 2), this.agents[i].vision, this.agents[i].vision);
      c.stroke();
  
      c.fillStyle = "green";
      c.fillText(this.agents[i].nearby.length, this.agents[i].x + 7.5, this.agents[i].y +5);
    }

    if(this.closeBool)
    {
      c.strokeStyle = "red";
      c.beginPath();
      c.rect(this.agents[i].x - (this.agents[i].closeVision / 2), this.agents[i].y - (this.agents[i].closeVision / 2), this.agents[i].closeVision, this.agents[i].closeVision);
      c.stroke();
  
      c.fillStyle = "red";
      c.fillText(this.agents[i].close.length, this.agents[i].x + 7.5, this.agents[i].y -5);
    }

    if(debugDirection)
    {
      c.strokeStyle = this.agents[i].colour;
      c.beginPath();
      let newx = this.agents[i].vx * this.agents[i].radius;
      let newy = this.agents[i].vy * this.agents[i].radius;
      c.moveTo(this.agents[i].x, this.agents[i].y);
      c.lineTo(this.agents[i].x + this.agents[i].vx + newx, this.agents[i].y + this.agents[i].vy + newy);
      c.stroke();
    }
  }
}
}

class FlockAgent
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

    this.nearby = [];
    this.close = [];
  }
}

// The one animation loop of the page. While playing, each display frame runs
// the ticks that are due at TICK_MS each (at most MAX_TICKS_PER_FRAME), then
// draws once. Play while playing and Pause while paused do nothing, so there
// is never more than one frame request pending.
class Loop
{
  constructor(tick, draw, fail)
  {
    this.tick = tick;
    this.draw = draw;
    this.fail = fail;
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
    this.frame = requestAnimationFrame(this.run);
  }

  Pause()
  {
    if(!this.running) return;
    cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  Frame(now)
  {
    this.frame = requestAnimationFrame(this.run);
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

const loop = new Loop(
  () => { if(ViewValid()) flock.Step(); },
  () => flock.DrawFlock(flock.shape),
  (error) => {
    ShowPlaying(false);
    notices.error = "The simulation stopped after an error (" + error.message + "). Press Generate to start again.";
    ShowStatus();
  },
);

document.getElementById("IS_PAUSED").onclick = function(){ Play() };
document.getElementById("IS_PLAYING").onclick = function(){ Pause() };

const nextButton = document.getElementById("nextButton");
nextButton.onclick = function(){ StepOnce() };

const optionsButton = document.getElementById("optionsButton");
optionsButton.onclick = function(){ Settings() };

const settingsMenu = document.getElementById("settingsMenu");
document.getElementById("settingsClose").onclick = function(){ Settings(false) };

const flockSizeInput = document.getElementById("flockSizeInput");
const flockSizeRange = document.getElementById("flockSizeRange");
flockSizeRange.onchange = function(){ UpdateSlider(1,
  flockSizeRange.value,
  flockSizeInput)
};

const flockSizeShapeLine = document.getElementById("flockSizeShapeLine");
flockSizeShapeLine.onclick = function(){ ChangeShape() };
const flockSizeShapeCircle = document.getElementById("flockSizeShapeCircle");
flockSizeShapeCircle.onclick = function(){ ChangeShape() };

const flockInputMinSpeed = document.getElementById("flockInputMinSpeed");
const flockRangeMinSpeed = document.getElementById("flockRangeMinSpeed");
flockRangeMinSpeed.onchange = function(){ UpdateSlider(2,
  flockRangeMinSpeed.value,
  flockInputMinSpeed)
};

const flockInputMaxSpeed = document.getElementById("flockInputMaxSpeed");
const flockRangeMaxSpeed = document.getElementById("flockRangeMaxSpeed");
flockRangeMaxSpeed.onchange = function(){ UpdateSlider(3,
  flockRangeMaxSpeed.value,
  flockInputMaxSpeed)
};

const flockInputSeperation = document.getElementById("flockInputSeperation");
const flockRangeSeperation = document.getElementById("flockRangeSeperation");
flockRangeSeperation.onchange = function(){ UpdateSlider(4,
  flockRangeSeperation.value,
  flockInputSeperation)
};

const flockInputSeperationFactor = document.getElementById("flockInputSeperationFactor");
const flockRangeSeperationFactor = document.getElementById("flockRangeSeperationFactor");
flockRangeSeperationFactor.onchange = function(){ UpdateSlider(5,
  flockRangeSeperationFactor.value,
  flockInputSeperationFactor)
};

const flockInputAlignment = document.getElementById("flockInputAlignment");
const flockRangeAlignment = document.getElementById("flockRangeAlignment");
flockRangeAlignment.onchange = function(){ UpdateSlider(6,
  flockRangeAlignment.value,
  flockInputAlignment)
};

const flockInputCohesion = document.getElementById("flockInputCohesion");
const flockRangeCohesion = document.getElementById("flockRangeCohesion");
flockRangeCohesion.onchange = function(){ UpdateSlider(7,
  flockRangeCohesion.value,
  flockInputCohesion)
};

const flockInputTurn = document.getElementById("flockInputTurn");
const flockRangeTurn = document.getElementById("flockRangeTurn");
flockRangeTurn.onchange = function(){ UpdateSlider(9,
  flockRangeTurn.value,
  flockInputTurn)
};

const flockInputTribes = document.getElementById("flockInputTribes");
const flockRangeTribes = document.getElementById("flockRangeTribes");
flockRangeTribes.onchange = function(){ UpdateSlider(10,
  flockRangeTribes.value,
  flockInputTribes)
};

const flockInputBias = document.getElementById("flockInputBias");
const flockRangeBias = document.getElementById("flockRangeBias");
flockRangeBias.onchange = function(){ UpdateSlider(8,
  flockRangeBias.value,
  flockInputBias)
};

const flockRangeVarianceText = document.getElementById("flockRangeVarianceText");
const flockRangeVariance = document.getElementById("flockRangeVariance");
flockRangeVariance.onchange = function(){ UpdateSlider(16,
  flockRangeVariance.value,
  flockRangeVarianceText)
};

const flockInputBoxX = document.getElementById("flockInputBoxX");
const flockRangeBoxX = document.getElementById("flockRangeBoxX");
flockRangeBoxX.onchange = function(){ UpdateSlider(11,
  flockRangeBoxX.value,
  flockInputBoxX)
};
// Box Y
const flockInputBoxY = document.getElementById("flockInputBoxY");
const flockRangeBoxY = document.getElementById("flockRangeBoxY");
flockRangeBoxY.onchange = function(){ UpdateSlider(12,
  flockRangeBoxY.value,
  flockInputBoxY)
};

const flockWrap = document.getElementById("flockWrap");
flockWrap.onchange = function(){ UpdateSlider(13,
  flockWrap.checked,)
};

const flockNearby = document.getElementById("flockNearby");
flockNearby.onchange = function(){ UpdateSlider(14,
  flockNearby.checked,)
};

const flockClose = document.getElementById("flockClose");
flockClose.onchange = function(){ UpdateSlider(15,
  flockClose.checked,)
};

// Every slider also updates while it is dragged, so its value shows at once.
for(const range of [flockSizeRange, flockRangeMinSpeed, flockRangeMaxSpeed, flockRangeSeperation,
  flockRangeSeperationFactor, flockRangeAlignment, flockRangeCohesion, flockRangeTurn, flockRangeTribes,
  flockRangeBias, flockRangeVariance, flockRangeBoxX, flockRangeBoxY])
  range.oninput = range.onchange;

const speedNotice = document.getElementById("speedNotice");
const boxNotice = document.getElementById("boxNotice");
const generatePending = document.getElementById("generatePending");
const generateButton = document.getElementById("generateButton");
generateButton.onclick = function(){ Main(); };

const gameCanvas = document.getElementById("gameCanvas");
const c = gameCanvas.getContext("2d");
const statusMessage = document.getElementById("statusMessage");

let flock = null;
// The canvas size in CSS pixels, which the flock moves in. ReSize() sets it.
const view = { width: 0, height: 0 };
// The messages statusMessage shows, by cause; "" when there is none.
const notices = { viewport: "", input: "", error: "" };

function Main()
{
  // Generate replaces the flock, so the loop that stepped the old one stops.
  Pause();
  notices.error = "";
  ReSize();

  let shape = ChangeShape();

  let flockSize = FlockSize();
  let minSpeed = parseFloat(document.getElementById("flockRangeMinSpeed").value);
  let maxSpeed = parseFloat(document.getElementById("flockRangeMaxSpeed").value);
  let seperation = parseFloat(document.getElementById("flockRangeSeperation").value);
  let seperationF = parseFloat(document.getElementById("flockRangeSeperationFactor").value);
  let alignment = parseFloat(document.getElementById("flockRangeAlignment").value);
  let cohesion = parseFloat(document.getElementById("flockRangeCohesion").value);
  let bias = parseFloat(document.getElementById("flockRangeBias").value);
  let variance = parseFloat(document.getElementById("flockRangeVariance").value);
  let turn = parseFloat(document.getElementById("flockRangeTurn").value);
  let tribes = parseInt(document.getElementById("flockRangeTribes").value);
  let boxX = parseFloat(document.getElementById("flockRangeBoxX").value);
  let boxY = parseFloat(document.getElementById("flockRangeBoxY").value);
  let wrap = document.getElementById("flockWrap").checked;
  let nearby = document.getElementById("flockNearby").checked;
  let close = document.getElementById("flockClose").checked;

  flock = new Flock(
  flockSize, // flock size
  minSpeed, // minimum speed
  maxSpeed, // maximum speed
  view.width, // canvas width
  view.height, // canvas height
  seperation, // seperation
  seperationF, // seperation tuning factor
  alignment, // alignment
  cohesion, // cohesion
  bias, // bias
  variance,
  turn, // turnFactor
  tribes, // raceCount
  shape, // agent shape
  boxX, // box X size
  boxY, // box Y size
  wrap, // wrap
  nearby, // nearby
  close, // close
  );

  flock.Start();
  // Start() may have lowered a min speed above the max: show what is used.
  if(flock.minSpeed !== minSpeed) ShowSlider(flockRangeMinSpeed, flockInputMinSpeed, flock.minSpeed);
  if(flock.maxSpeed !== maxSpeed) ShowSlider(flockRangeMaxSpeed, flockInputMaxSpeed, flock.maxSpeed);
  ShowNotice(speedNotice, "");
  ShowBoxNotice();
  ShowPending();
  ShowStatus();
}

// The flock size slider as a whole number within its limits. Anything else is
// replaced, and the status says so until the next Generate.
function FlockSize()
{
  let value = parseInt(flockSizeRange.value);
  let min = parseInt(flockSizeRange.min);
  let max = parseInt(flockSizeRange.max);
  if(!Number.isFinite(min)) min = 1;
  if(!Number.isFinite(max)) max = Infinity;
  notices.input = "";
  if(Number.isFinite(value) && value >= min && value <= max) return value;
  let used = Number.isFinite(value) ? Math.min(Math.max(value, min), max) : DEFAULT_FLOCK_SIZE;
  notices.input = "Flock size " + JSON.stringify(flockSizeRange.value) + " is not a whole number from "
    + min + " to " + max + ", so " + used + " was used.";
  ShowSlider(flockSizeRange, flockSizeInput, used);
  return used;
}

// Opens or closes the settings, or toggles them when `open` is not given.
// Closing them from inside moves the focus back to the Settings button, so
// keyboard users do not lose their place.
function Settings(open = settingsMenu.style.display === "none")
{
  let focusInside = !open && typeof settingsMenu.contains === "function" && settingsMenu.contains(document.activeElement);
  settingsMenu.style.display = open ? "" : "none";
  optionsButton.setAttribute("aria-expanded", String(open));
  if(focusInside) optionsButton.focus();
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
  flock.DrawFlock(flock.shape);
}

// Shows Pause while playing and Play while paused. The two are separate
// buttons, so when the focused one is hidden the focus moves to the other.
function ShowPlaying(playing)
{
  let play = document.getElementById('IS_PAUSED');
  let pause = document.getElementById('IS_PLAYING');
  let focused = document.activeElement === play || document.activeElement === pause;
  play.style.display = playing ? 'none' : '';
  pause.style.display = playing ? '' : 'none';
  if(focused) (playing ? pause : play).focus();
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
  let text = [notices.error, notices.viewport, notices.input].filter((notice) => notice !== "").join(" ");
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
  WatchRatio(ratio);

  notices.viewport = ViewValid() ? "" : "The window is too small to show the flock ("
    + view.width + " × " + view.height + " px). Make it larger to continue.";
  ShowStatus();

  if(flock !== null)
  {
    flock.width = view.width;
    flock.height = view.height;
    flock.DrawFlock(flock.shape);
    ShowBoxNotice();
  }
}

// Page zoom or a move to another screen can change devicePixelRatio without a
// resize event. A media query for the current ratio stops matching when it
// does, and ReSize() then sizes the backing store for the new ratio.
let ratioQuery = null;
function WatchRatio(ratio)
{
  if(typeof window.matchMedia !== "function") return;
  if(ratioQuery !== null && ratioQuery.ratio === ratio) return;
  if(ratioQuery !== null) ratioQuery.list.removeEventListener("change", ReSize);
  let list = window.matchMedia("(resolution: " + ratio + "dppx)");
  list.addEventListener("change", ReSize);
  ratioQuery = { ratio, list };
}

function ChangeShape()
{
  let circle = document.getElementById("flockSizeShapeCircle");
  let result = "line";
  if(circle.checked === true) result = "circle";
  if(flock !== null) flock.shape = result;
  return result;
}

function UpdateSlider(index, value, text)
{
  if(text !== undefined && value !== undefined) text.value = value;
  // Flock size, species and variance only apply on Generate.
  if(index === 1 || index === 10 || index === 16) ShowPending();
  // The speed slider just moved wins: the other follows so min <= max.
  if(index === 2) // min speed
  {
    flock.minSpeed = parseFloat(value);
    let raised = flock.minSpeed > flock.maxSpeed;
    if(raised) ShowSlider(flockRangeMaxSpeed, flockInputMaxSpeed, flock.maxSpeed = flock.minSpeed);
    ShowNotice(speedNotice, raised ? "Max speed was raised to " + flock.maxSpeed + " to stay at or above Min speed." : "");
  }
  if(index === 3) // max speed
  {
    flock.maxSpeed = parseFloat(value);
    let lowered = flock.maxSpeed < flock.minSpeed;
    if(lowered) ShowSlider(flockRangeMinSpeed, flockInputMinSpeed, flock.minSpeed = flock.maxSpeed);
    ShowNotice(speedNotice, lowered ? "Min speed was lowered to " + flock.minSpeed + " to stay at or below Max speed." : "");
  }
  if(index === 4) flock.seperation = parseFloat(value); // seperation
  if(index === 5) flock.seperationFactor = parseFloat(value); // seperation factor
  if(index === 6) flock.alignment = parseFloat(value); // alignment
  if(index === 7) flock.cohesion = parseFloat(value); // cohesion
  if(index === 8) flock.bias = parseFloat(value); // bias
  if(index === 9) flock.turnFactor = parseFloat(value); // turn
  if(index === 11) flock.box_x = parseFloat(value); // box_x
  if(index === 12) flock.box_y = parseFloat(value); // box_y
  if(index === 11 || index === 12) ShowBoxNotice();
  if(index === 13) flock.wrap = value; // wrap
  if(index === 14) flock.nearbyBool = value; // show nearby flock
  if(index === 15) flock.closeBool = value; // show close flock
}

// Shows the Generate notice while the flock size, species or variance
// sliders differ from what the current flock was generated with.
function ShowPending()
{
  let pending = parseInt(flockSizeRange.value) !== flock.flockSize
    || parseInt(flockRangeTribes.value) !== flock.raceCount
    || parseFloat(flockRangeVariance.value) !== flock.variance;
  generatePending.style.display = pending ? "" : "none";
}

// Shows `text` in an inline notice, or hides it when `text` is "".
function ShowNotice(notice, text)
{
  notice.textContent = text;
  notice.style.display = text === "" ? "none" : "";
}

// Says when a box inset is wider than this window allows: Flock.BoxInset()
// then uses a smaller one, which keeps room for the flock between the edges.
function ShowBoxNotice()
{
  let capped = [];
  let x = flock.BoxInset(flock.box_x, view.width);
  let y = flock.BoxInset(flock.box_y, view.height);
  if(x < flock.box_x) capped.push("Box inset X is " + Math.floor(x) + " px");
  if(y < flock.box_y) capped.push("Box inset Y is " + Math.floor(y) + " px");
  ShowNotice(boxNotice, capped.length === 0 ? ""
    : capped.join(" and ") + " at most on this window size, so the flock keeps room to move.");
}

// Sets a slider and its number field to `value` without firing onchange.
function ShowSlider(range, text, value)
{
  range.value = String(value);
  text.value = String(value);
}

// u steps, p pauses and i plays, as the buttons do, and Escape closes the
// settings. Shortcuts with a modifier (Ctrl+P and the like) are left to the
// browser.
document.onkeydown = function(event)
{
  if(event.ctrlKey || event.metaKey || event.altKey) return;
  if(event.key == "Escape" && settingsMenu.style.display !== "none") Settings(false);
  if(event.key == "u") StepOnce();
  if(event.key == "p") Pause();
  if(event.key == "i") Play();
}

window.addEventListener('resize', ReSize);
document.addEventListener("DOMContentLoaded", Main);