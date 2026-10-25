import { defineConfig } from 'vite'

// Where the site is served from. The default is the GitHub Pages project site
// https://calypsogrammar.github.io/boids/, which the committed dist/ is built
// for. BASE_PATH=/ builds for the root of a host, such as a custom domain;
// that build is never committed (docs/release.md).
export function basePath(value = '/boids/')
{
  if(!/^\/(?:[\w.-]+\/)*$/.test(value))
    throw new Error(`BASE_PATH must start and end with "/", like "/boids/" or "/"; got ${JSON.stringify(value)}`)
  return value
}

export default defineConfig({
  base: basePath(process.env.BASE_PATH || undefined),
  build: {
    // Vite 7+ defaults to 'baseline-widely-available' (Safari 16.4+), which
    // also rewrites CSS media queries to range syntax. Keep the browser
    // support the site had under Vite 4 (its 'modules' default).
    target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'],
  },
})
