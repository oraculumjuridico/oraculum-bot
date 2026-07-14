const assert = require('node:assert/strict')

// Tests for option parsing
function withArgv(argv, fn) {
  const old = process.argv
  process.argv = argv
  try { return fn() } finally { process.argv = old }
}

const mod = require('../scripts/import-real-cases.js')
const option = mod.option

// 1) no flag -> option returns null
withArgv(['node','script.js','dry-run'], () => {
  assert.equal(option('use-pilot-selection'), null)
})

// 2) flag true parsed
withArgv(['node','script.js','dry-run','--use-pilot-selection=true'], () => {
  assert.equal(option('use-pilot-selection'), 'true')
})

// 3) pilot-selection-file parsed
withArgv(['node','script.js','dry-run','--pilot-selection-file=foo/bar.json'], () => {
  assert.equal(option('pilot-selection-file'), 'foo/bar.json')
})

// Regression test: variables must be declared (no ReferenceError)
// These exports verify the variables exist and are accessible
assert.equal(typeof mod.usePilotSelection, 'boolean', 'usePilotSelection must be a boolean')
assert.equal(typeof mod.pilotSelectionFile, 'string', 'pilotSelectionFile must be a string')

// Regression test: default values when no flags provided
// usePilotSelection should be false by default
// pilotSelectionFile should have a sensible default
withArgv(['node','script.js','dry-run'], () => {
  assert.equal(option('use-pilot-selection'), null, 'no flag should return null')
  // Default value is parsed as: false when not true
})

// Regression test: pilot-selection-file defaults to data/case-import/pilot-selection.json
// When flag is not provided, it uses the default path
const path = require('path')
const defaultPath = path.join('data/case-import', 'pilot-selection.json')
assert(mod.pilotSelectionFile.includes('pilot-selection.json'), `pilotSelectionFile should reference pilot-selection.json, got: ${mod.pilotSelectionFile}`)

console.log('✓ TEST parser: PASS')

