"use strict";

// Draws a Flock (src/javascripts/flock.js) on a 2D canvas context, in CSS
// pixels. Reads the flock and changes nothing, so it can be tested with a
// recording context and no browser.
//
// `view` holds the "view" parameters of src/javascripts/settings.js:
// - shape: "circle" draws a filled dot of the agent's radius; "line" draws
//   its velocity, radius times as long.
// - nearby / close: the neighbour search of the last tick. A square around
//   each agent covers what it searches (agents strictly closer than vision,
//   or closeVision, on both axes, so 2 * vision wide), and the number next to
//   it is how many agents it found: the neighbours its steering used.
// - direction: a thin heading line, (radius + 1) times the velocity.
export const BOX_COLOUR = "#d1d5db";
export const NEARBY_COLOUR = "green";
export const CLOSE_COLOUR = "red";

export function drawFlock(c, flock, view)
{
  c.clearRect(0, 0, flock.width, flock.height);

  // Every stroke sets its own width, so one shape or overlay never changes
  // how the next is drawn.
  c.lineWidth = 1;
  c.strokeStyle = BOX_COLOUR;
  let boxX = flock.BoxInset(flock.boxX, flock.width);
  let boxY = flock.BoxInset(flock.boxY, flock.height);
  c.beginPath();
  c.rect(boxX, boxY, (flock.width - (boxX * 2)), (flock.height - (boxY * 2)));
  c.stroke();

  for(let agent of flock.agents)
  {
    if(view.shape === "line")
    {
      c.lineWidth = agent.radius / 3;
      c.strokeStyle = agent.colour;
      c.beginPath();
      c.moveTo(agent.x, agent.y);
      c.lineTo(agent.x + agent.vx * agent.radius, agent.y + agent.vy * agent.radius);
      c.stroke();
    }
    else if(view.shape === "circle")
    {
      c.fillStyle = agent.colour;
      c.beginPath();
      c.arc(agent.x, agent.y, agent.radius, 0, 2 * Math.PI);
      c.fill();
    }

    if(view.nearby) drawSearch(c, agent, agent.vision, agent.nearby.length, NEARBY_COLOUR, 5);
    if(view.close) drawSearch(c, agent, agent.closeVision, agent.close.length, CLOSE_COLOUR, -5);

    if(view.direction)
    {
      c.lineWidth = 1;
      c.strokeStyle = agent.colour;
      c.beginPath();
      c.moveTo(agent.x, agent.y);
      c.lineTo(agent.x + agent.vx * (agent.radius + 1), agent.y + agent.vy * (agent.radius + 1));
      c.stroke();
    }
  }
}

// The square an agent searches out to `range` on each axis, and the `count`
// of agents found in it.
function drawSearch(c, agent, range, count, colour, textOffset)
{
  c.lineWidth = 1;
  c.strokeStyle = colour;
  c.beginPath();
  c.rect(agent.x - range, agent.y - range, 2 * range, 2 * range);
  c.stroke();

  c.fillStyle = colour;
  c.fillText(count, agent.x + 7.5, agent.y + textOffset);
}
