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

console.log('✓ TEST parser: PASS')
