import js from '@eslint/js'
import globals from 'globals'

export default [
  { ignores: ['dist/'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: { globals: globals.browser },
    // Flock's constructor takes its settings positionally, including ones it
    // does not read yet.
    rules: { 'no-unused-vars': ['error', { args: 'none' }] },
  },
  {
    files: ['test/**/*.js', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['*.config.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
]
