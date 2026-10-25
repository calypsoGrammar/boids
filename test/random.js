// Reproducible random sources for the tests.

// mulberry32: a seeded generator with Math.random's range.
export function seeded(seed)
{
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Returns the given values in order, then repeats them.
export function scripted(values)
{
  let i = 0;
  return () => values[i++ % values.length];
}
