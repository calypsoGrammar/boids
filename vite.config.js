import { defineConfig } from 'vite'

export default defineConfig({
  base: '/boids/',
  build: {
    // Vite 7+ defaults to 'baseline-widely-available' (Safari 16.4+), which
    // also rewrites CSS media queries to range syntax. Keep the browser
    // support the site had under Vite 4 (its 'modules' default).
    target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'],
  },
})
