"use strict";

function CalculateVh()
{
  let vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', vh + 'px');
}

window.addEventListener('DOMContentLoaded', CalculateVh);
window.addEventListener('resize', CalculateVh);
window.addEventListener('orientationchange', CalculateVh);

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

    toggle,
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
    this.iterator = undefined;

    this.box_x = boxX;
    this.box_y = boxY;
    this.wrap = wrap;

    this.nearbyBool = nearby;
    this.closeBool = close;

    this.toggle = false;

    // Source of every random draw in Start(). Tests replace it with a seeded
    // or scripted source; the page always uses Math.random.
    this.random = Math.random;
  }

Start()
{
  let races = [];

  for(let i = 0; i < this.raceCount; i++)
  {
    let r = Math.floor(this.random() * 255);
    let g = Math.floor(this.random() * 255);
    let b = Math.floor(this.random() * 255);
    let col = [r, g, b];
    races.push(col);
  }

  this.agents.length = 0;

  for(let i = 0; i < this.flockSize; i++)
  {
    let startW = Math.floor(this.random() * this.width);
    let startH = Math.floor(this.random() * this.height);
    let startVW = Math.max(this.minSpeed, this.random() * this.maxSpeed);
    let startVH = Math.max(this.minSpeed, this.random() * this.maxSpeed);
    if(this.random() > 0.5) startVW = -startVW;
    if(this.random() > 0.5) startVH = -startVH;

    let s = this.seperation;

    if(this.variance > 0)
    {
      let min = parseFloat(document.getElementById("flockRangeSeperation").min);
      let max = parseFloat(document.getElementById("flockRangeSeperation").max);
      let range = max - min;
      let rV = (range / 100) * this.variance;
      let change = Math.floor(this.random() * (rV * 1000)) / 1000;
      if(this.random() > 0.5) s -= change;
      else s += change;
      if(s < min) s = min;
      if(s > max) s = max;
    }

    s = s.toFixed(5);

    let a = this.alignment;

    if(this.variance > 0)
    {
      let min = parseFloat(document.getElementById("flockRangeAlignment").min);
      let max = parseFloat(document.getElementById("flockRangeAlignment").max);
      let range = max - min;
      let rV = (range / 100) * this.variance;
      let change = Math.floor(this.random() * (rV * 1000)) / 1000;
      if(this.random() > 0.5) a -= change;
      else a += change;
      if(a < min) a = min;
      if(a > max) a = max;
    }

    a = a.toFixed(5);

    let c = this.cohesion;

    if(this.variance > 0)
    {
      let min = parseFloat(document.getElementById("flockRangeCohesion").min);
      let max = parseFloat(document.getElementById("flockRangeCohesion").max);
      let range = max - min;
      let rV = (range / 100) * this.variance;
      let change = Math.floor(this.random() * (rV * 1000)) / 1000;
      if(this.random() > 0.5) c -= change;
      else c += change;
      if(c < min) c = min;
      if(c > max) c = max;
    }

    c = c.toFixed(5);

    let r = Math.floor(this.random() * races.length);
    let newAgent = new FlockAgent(
      i, // index
      s, // seperation
      a, // avoidance
      c, // cohesion
      120, // vision
      40, // close vision
      ("Agent " + i), // name
      5, // radius
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

Iterate()
{
  clearInterval(this.iterator);
  this.iterator = setInterval(() => {
    this.Update();
  }, 8);
}

Pause()
{
  clearInterval(this.iterator);
  this.iterator = null;
}

Toggle()
{
  if(this.iterator === null || this.iterator === undefined)
  {
    this.Iterate();
    this.toggle = true;
  }
  else
  {
    this.Pause();
    this.toggle = false;
  }
}

Update()
{
  let len = this.agents.length;
  for(let i = 0; i < this.agents.length; i++)
  {
    this.agents[i].outBox = false;
    this.GetNearbyAgents(this.agents[i], len);
    this.Adjust(this.agents[i]);
    this.DetectEdgeCollisions(this.agents[i]);
    this.MovePosition(this.agents[i]);
  }
  this.DrawFlock(this.shape);
}

GetNearbyAgents(agent, length)
{
  if(agent.x < 0 || agent.x > this.width || agent.y < 0 || agent.y > this.height) return;
  let context = [];
  let closeContext = [];
  let contextBias = [];
  let closeContextBias = [];
  let range = agent.vision;
  let tooClose = agent.closeVision;
  for(let i = 0; i < length; i++)
  {
    if(i == agent.index) continue;
    let xDif = Math.abs(agent.x - this.agents[i].x);
    let yDif = Math.abs(agent.y - this.agents[i].y);
    if(xDif < range && yDif < range)
    {
      context.push(i);
      if(agent.colour === this.agents[i].colour) contextBias.push(i);
      if(xDif < tooClose && yDif < tooClose)
      {
        closeContext.push(i);
        if(agent.colour === this.agents[i].colour) closeContextBias.push(i);
      }
    }
  }
  agent.nearby = context;
  agent.close = closeContext;
  agent.nearbyBias = contextBias;
  agent.closeBias = closeContextBias;
}

Adjust(agent)
{
  if(agent.nearby.length === 0) return;

  let newX = 0
  let newY = 0;

  let sep = true;
  let ali = true;
  let coh = true;

  // SEPERATION
  if(sep)
  {
    if(agent.close.length > 0)
    {
      let avoidX = 0;
      let avoidY = 0;

      for(let i = 0; i < agent.close.length; i++)
      {
        let xDif = agent.x - this.agents[agent.close[i]].x;
        let yDif = agent.y - this.agents[agent.close[i]].y;

        avoidX += this.seperationFactor / xDif;
        avoidY += this.seperationFactor / yDif;
      }

      newX += avoidX * this.seperation;
      newY += avoidY * this.seperation;
    }
  }

  // ALIGNMENT
  if(ali)
  {
    let alignX = 0;
    let alignY = 0;
    let biasCounter = 0;

    for(let i = 0; i < agent.nearby.length; i++)
    {
      if(this.bias > 0)
      {
        if(agent.colour === this.agents[agent.nearby[i]].colour)
        {
          alignX += this.agents[agent.nearby[i]].vx;
          alignY += this.agents[agent.nearby[i]].vy;
          biasCounter++;
        }
        else
        {
          alignX += ( this.agents[agent.nearby[i]].vx / this.bias );
          alignY += ( this.agents[agent.nearby[i]].vy / this.bias );
          biasCounter += 1/this.bias;
        }
      }
      else
      {
        alignX += this.agents[agent.nearby[i]].vx;
        alignY += this.agents[agent.nearby[i]].vy;
      }
    }

    let avX, avY;

    if(this.bias > 0)
    {
      avX = alignX / biasCounter;
      avY = alignY / biasCounter;
    }
    else
    {
      avX = alignX / agent.nearby.length;
      avY = alignY / agent.nearby.length;
    }

    newX += ( avX - agent.vx ) * this.alignment;
    newY += ( avY - agent.vy ) * this.alignment;
  }

  // COHESION
  if(coh)
  {
    let cohereX = 0;
    let cohereY = 0;
    let biasCounter = 0;

    for(let i = 0; i < agent.nearby.length; i++)
    {
      if(this.bias > 0)
      {
        if(agent.colour === this.agents[agent.nearby[i]].colour)
        {
          cohereX += this.agents[agent.nearby[i]].x;
          cohereY += this.agents[agent.nearby[i]].y;
          biasCounter++;
        }
        else
        {
          cohereX += ( this.agents[agent.nearby[i]].x / this.bias );
          cohereY += ( this.agents[agent.nearby[i]].y / this.bias );
          biasCounter += 1/this.bias;
        }
      }
      else
      {
        cohereX += this.agents[agent.nearby[i]].x;
        cohereY += this.agents[agent.nearby[i]].y;
      }
    }

    let avX, avY;

    if(this.bias > 0)
    {
      avX = cohereX / biasCounter;
      avY = cohereY / biasCounter;
    }
    else
    {
      avX = cohereX / agent.nearby.length;
      avY = cohereY / agent.nearby.length;
    }

    newX += ( avX - agent.x ) * this.cohesion;
    newY += ( avY - agent.y ) * this.cohesion;
  }
  agent.vx += newX;
  agent.vy += newY;
}

DetectEdgeCollisions(agent)
{
  if(agent.x < agent.radius + this.box_x)
  {
    if(this.wrap) agent.x = this.width - agent.radius - this.box_x;
    else
    {
      agent.vx += this.turnFactor;
      agent.outBox = true;
    }
  }
  else if(agent.x > (this.width - agent.radius - this.box_x))
  {
    if(this.wrap) agent.x = agent.radius + this.box_x;
    else
    {
      agent.vx -= this.turnFactor;
      agent.outBox = true;
    }
  }
  if(agent.y < agent.radius + this.box_y)
  {
    if(this.wrap) agent.y = this.height - agent.radius - this.box_y;
    else
    {
      agent.vy += this.turnFactor;
      agent.outBox = true;
    }
  }
  else if(agent.y > (this.height - agent.radius - this.box_y))
  {
    if(this.wrap) agent.y = agent.radius + this.box_y;
    else
    {
      agent.vy -= this.turnFactor;
      agent.outBox = true;
    }
  }
}

MovePosition(agent)
{
  let speed = Math.sqrt( 
  ( agent.vx * agent.vx) + 
  ( agent.vy * agent.vy)
  );
  if(speed > this.maxSpeed)
  {
    agent.vx = ( agent.vx / speed ) * this.maxSpeed;
    agent.vy = ( agent.vy / speed ) * this.maxSpeed;
  }
  if(speed < this.minSpeed)
  {
    agent.vx = ( agent.vx / speed ) * this.minSpeed;
    agent.vy = ( agent.vx / speed ) * this.minSpeed;
  }
  agent.x += agent.vx;
  agent.y += agent.vy;
}

DrawFlock(style)
{
  c.clearRect(0, 0, this.width, this.height);

  c.strokeStyle = "#d1d5db";

  c.beginPath();
  c.rect(this.box_x, this.box_y, (this.width - (this.box_x * 2)), (this.height - (this.box_y * 2)));
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
    seperation, 
    avoidance, 

    cohesion, 
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
    this.seperation = seperation;
    this.avoidance = avoidance;

    this.cohesion = cohesion;
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

    this.nearbyBias = [];
    this.closeBias = [];
  }
}

const startButton = document.getElementsByClassName("startButton");
for(let i = 0; i < startButton.length; i++)
{
  startButton[i].onclick = function(){ RestartFlock() };
}

const nextButton = document.getElementById("nextButton");
nextButton.onclick = function(){
  flock.Pause();
  flock.Update();
  document.getElementById('IS_PAUSED').style.display = '';
  document.getElementById('IS_PLAYING').style.display = 'none';
};

const optionsButton = document.getElementById("optionsButton");
optionsButton.onclick = function(){ Settings() };

const settingsMenu = document.getElementById("settingsMenu");

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

const generateButton = document.getElementById("generateButton");
generateButton.onclick = function(){ Main(); };

const gameContainer = document.getElementById("gameContainer");
const gameDiv = document.getElementById("gameDiv");
const gameCanvas = document.getElementById("gameCanvas");
const c = gameCanvas.getContext("2d");

let flock = null;

function Main()
{
  ReSize();

  let w = parseInt(gameCanvas.width);
  let h = parseInt(gameCanvas.height);

  if(flock !== null) flock.Pause();

  let shape = ChangeShape();

  let flockSize = parseInt(document.getElementById("flockSizeRange").value);
  let minSpeed = parseInt(document.getElementById("flockRangeMinSpeed").value);
  let maxSpeed = parseInt(document.getElementById("flockRangeMaxSpeed").value);
  let seperation = parseFloat(document.getElementById("flockRangeSeperation").value);
  let seperationF = parseFloat(document.getElementById("flockRangeSeperationFactor").value);
  let alignment = parseFloat(document.getElementById("flockRangeAlignment").value);
  let cohesion = parseFloat(document.getElementById("flockRangeCohesion").value);
  let bias = parseFloat(document.getElementById("flockRangeBias").value);
  let variance = parseFloat(document.getElementById("flockRangeVariance").value);
  let turn = parseFloat(document.getElementById("flockRangeTurn").value);
  let tribes = parseInt(document.getElementById("flockRangeTribes").value);
  let boxX = parseFloat(document.getElementById("flockRangeBoxX").value);
  let boxY = parseInt(document.getElementById("flockRangeBoxY").value);
  let wrap = document.getElementById("flockWrap").checked;
  let nearby = document.getElementById("flockNearby").checked;
  let close = document.getElementById("flockClose").checked;

  flock = new Flock(
  flockSize, // flock size
  minSpeed, // minimum speed
  maxSpeed, // maximum speed
  w, // canvas width
  h, // canvas height
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
  document.getElementById('IS_PAUSED').style.display = '';
  document.getElementById('IS_PLAYING').style.display = 'none';
}

function Settings()
{
  if(settingsMenu.style.display === "") settingsMenu.style.display = "none";
  else settingsMenu.style.display = "";
}

function RestartFlock()
{
  flock.Toggle();

  if(flock.toggle)
  {
    document.getElementById('IS_PAUSED').style.display = 'none';
    document.getElementById('IS_PLAYING').style.display = '';
  }
  else
  {
    document.getElementById('IS_PAUSED').style.display = '';
    document.getElementById('IS_PLAYING').style.display = 'none';
  }
}

function ReSize()
{
  gameContainer.width = window.innerWidth;
  gameContainer.height = window.innerHeight;
  gameDiv.width = window.innerWidth;
  gameDiv.height = window.innerHeight;
  gameCanvas.width = window.innerWidth;
  gameCanvas.height = window.innerHeight;
  c.width = window.innerWidth;
  c.height = window.innerHeight;
  if(flock != null)
  {
    flock.width = gameContainer.scrollWidth;
    flock.height = gameContainer.scrollHeight;
    flock.DrawFlock(flock.shape);
  }
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
  if(index === 1) flock.flockSize = parseInt(value); // flock size
  if(index === 2) flock.minSpeed = parseInt(value); // min speed
  if(index === 3) flock.maxSpeed = parseInt(value); // max speed
  if(index === 4) flock.seperation = parseFloat(value); // seperation
  if(index === 5) flock.seperationFactor = parseFloat(value); // seperation factor
  if(index === 6) flock.alignment = parseFloat(value); // alignment
  if(index === 7) flock.cohesion = parseFloat(value); // cohesion
  if(index === 8) flock.bias = parseFloat(value); // bias
  if(index === 9) flock.turnFactor = parseFloat(value); // turn
  if(index === 10) flock.raceCount = parseInt(value); // race count
  if(index === 11) flock.box_x = parseInt(value); // box_x
  if(index === 12) flock.box_y = parseInt(value); // box_y
  if(index === 13) flock.wrap = value; // wrap
  if(index === 14) flock.nearbyBool = value; // show nearby flock
  if(index === 15) flock.closeBool = value; // show close flock
  if(index === 15) flock.closeBool = value; // show close flock
  if(index === 16) flock.variance = value; // show close flock
}

document.onkeydown = function(event)
{
  if(event.key == "u") flock.Update();
  if(event.key == "p") flock.Pause();
  if(event.key == "i") flock.Iterate();
}

window.addEventListener('resize', ReSize);
document.addEventListener("DOMContentLoaded", Main);