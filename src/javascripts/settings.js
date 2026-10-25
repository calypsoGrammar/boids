"use strict";

// The one configuration model of the page. Every control in the settings
// panel is a parameter here, with its element ids, its default and limits
// (the same as in index.html), its type and when it applies:
//
// - "live":     a flock setting that changes the running flock at once.
// - "generate": a flock setting that only a new flock can take (Generate).
//               The panel shows the Generate notice while it differs from
//               what the current flock was generated with.
// - "view":     how the flock is drawn. Changes the picture at once, never
//               the simulation.
//
// The controller reads every control through read(), so the flock, the
// renderer and the number fields all see the same validated values.
// Nothing in this file touches the DOM.
export const PARAMETERS = [
  { key: "flockSize", label: "Flock size", type: "int", range: "flockSizeRange", text: "flockSizeInput",
    default: 50, min: 1, max: 200, applies: "generate" },
  { key: "shape", label: "Shape", type: "shape", radios: { line: "flockSizeShapeLine", circle: "flockSizeShapeCircle" },
    default: "circle", applies: "view" },
  { key: "minSpeed", label: "Min speed", type: "number", range: "flockRangeMinSpeed", text: "flockInputMinSpeed",
    default: 0.5, min: 0.1, max: 10, applies: "live" },
  { key: "maxSpeed", label: "Max speed", type: "number", range: "flockRangeMaxSpeed", text: "flockInputMaxSpeed",
    default: 2.5, min: 0.2, max: 10, applies: "live" },
  { key: "seperation", label: "Seperation", type: "number", range: "flockRangeSeperation", text: "flockInputSeperation",
    default: 0.1, min: 0, max: 0.25, applies: "live" },
  { key: "seperationFactor", label: "Seperation factor", type: "number", range: "flockRangeSeperationFactor",
    text: "flockInputSeperationFactor", default: 10, min: 0, max: 10, applies: "live" },
  { key: "alignment", label: "Alignment", type: "number", range: "flockRangeAlignment", text: "flockInputAlignment",
    default: 0.1, min: 0, max: 0.25, applies: "live" },
  { key: "cohesion", label: "Cohesion", type: "number", range: "flockRangeCohesion", text: "flockInputCohesion",
    default: 0.0005, min: 0, max: 0.0025, applies: "live" },
  { key: "turnFactor", label: "Turn factor", type: "number", range: "flockRangeTurn", text: "flockInputTurn",
    default: 0.4, min: 0.1, max: 1, applies: "live" },
  { key: "raceCount", label: "Species", type: "int", range: "flockRangeTribes", text: "flockInputTribes",
    default: 2, min: 1, max: 10, applies: "generate" },
  { key: "bias", label: "Bias", type: "number", range: "flockRangeBias", text: "flockInputBias",
    default: 50, min: 0, max: 100, applies: "live" },
  { key: "variance", label: "Variance", type: "number", range: "flockRangeVariance", text: "flockRangeVarianceText",
    default: 5, min: 0, max: 100, applies: "generate" },
  { key: "boxX", label: "Box-X", type: "number", range: "flockRangeBoxX", text: "flockInputBoxX",
    default: 0, min: 0, max: 500, applies: "live" },
  { key: "boxY", label: "Box-Y", type: "number", range: "flockRangeBoxY", text: "flockInputBoxY",
    default: 0, min: 0, max: 500, applies: "live" },
  { key: "wrap", label: "Wrap", type: "boolean", checkbox: "flockWrap", default: true, applies: "live" },
  { key: "nearby", label: "Show nearby", type: "boolean", checkbox: "flockNearby", default: false, applies: "view" },
  { key: "close", label: "Show close", type: "boolean", checkbox: "flockClose", default: false, applies: "view" },
  { key: "direction", label: "Show direction", type: "boolean", checkbox: "flockDirection", default: false, applies: "view" },
];

export const PARAMETER = Object.fromEntries(PARAMETERS.map((p) => [p.key, p]));

// Every parameter at its default.
export const DEFAULTS = Object.freeze(Object.fromEntries(PARAMETERS.map((p) => [p.key, p.default])));

// The keys of the parameters that apply in `applies`.
export function keys(applies)
{
  return PARAMETERS.filter((p) => p.applies === applies).map((p) => p.key);
}

// The [min, max] of every numeric parameter. `override` replaces the model's
// limits with usable ones from elsewhere (the slider attributes).
export function limits(override = {})
{
  let result = {};
  for(let p of PARAMETERS)
  {
    if(p.type !== "number" && p.type !== "int") continue;
    let [min, max] = override[p.key] ?? [];
    result[p.key] = Number.isFinite(min) && Number.isFinite(max) && min <= max ? [min, max] : [p.min, p.max];
  }
  return result;
}

// A control value as the number it shows, or NaN.
function toNumber(raw)
{
  if(typeof raw === "number") return raw;
  if(typeof raw !== "string" || raw.trim() === "") return NaN;
  return Number(raw);
}

// Validates the raw value of parameter `key`, as a control holds it, against
// `[min, max]`. Returns { value, valid, message }: a number outside the
// limits is moved inside them, a whole-number parameter is rounded, and
// anything else becomes the default. `message` says what was replaced, or is
// "" when the raw value was valid.
export function validate(key, raw, [min, max] = [PARAMETER[key].min, PARAMETER[key].max])
{
  let p = PARAMETER[key];
  if(p.type === "boolean") return { value: raw === true, valid: true, message: "" };
  if(p.type === "shape")
  {
    let valid = raw === "line" || raw === "circle";
    return { value: valid ? raw : p.default, valid, message: "" };
  }
  let number = toNumber(raw);
  let whole = p.type === "int";
  if(Number.isFinite(number) && number >= min && number <= max && (!whole || Number.isInteger(number)))
    return { value: number, valid: true, message: "" };
  let value = Number.isFinite(number)
    ? Math.min(Math.max(whole ? Math.round(number) : number, min), max)
    : p.default;
  let message = p.label + " " + JSON.stringify(String(raw)) + " is not a " + (whole ? "whole number" : "number")
    + " from " + min + " to " + max + ", so " + value + " was used.";
  return { value, valid: false, message };
}

// Keeps minSpeed <= maxSpeed in `config`, in place. The speed just changed
// (`changed`) wins and the other follows it; otherwise, as on Generate, a
// min above the max is lowered to it. Returns the keys it changed.
export function couple(config, changed)
{
  if(!(config.minSpeed > config.maxSpeed)) return [];
  if(changed === "minSpeed")
  {
    config.maxSpeed = config.minSpeed;
    return ["maxSpeed"];
  }
  config.minSpeed = config.maxSpeed;
  return ["minSpeed"];
}
