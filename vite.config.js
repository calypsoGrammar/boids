import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

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
  plugins: [tailwindcss()],
  base: basePath(process.env.BASE_PATH || undefined),
  // No build.target override: Vite's default, 'baseline-widely-available'
  // (Chrome 111, Safari 16.4, Firefox 114), is the floor Tailwind 4 needs.
})
