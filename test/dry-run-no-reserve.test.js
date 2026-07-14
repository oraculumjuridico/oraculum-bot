const assert = require('node:assert/strict')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { applyPilotSelection, buildCanonicalDryRunReport, runDryRun } = require('../scripts/import-real-cases.js');

(async () => {
  try {
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pilot-test-'))
    try {
      const manifest = { selection: [ { importId: 'r1' }, { importId: 'r2' }, { importId: 'r3' } ] }
      const manifestPath = path.join(tmpDir, 'manifest.json')
      await fsp.writeFile(manifestPath, JSON.stringify(manifest))

      const scanned = {
        records: [
          { importId: 'r1', consolidatedCase: null, reviewReasons: [], contact: { status: 'new' }, deal: { status: 'new' } },
          { importId: 'r2', consolidatedCase: null, reviewReasons: [], contact: { status: 'new' }, deal: { status: 'new' } },
          { importId: 'r3', consolidatedCase: null, reviewReasons: [], contact: { status: 'new' }, deal: { status: 'new' } },
          { importId: 'r4', consolidatedCase: null }
        ]
      }

      // Apply pilot selection (should not trigger reserve or apply)
      const sliced = await applyPilotSelection(scanned, manifestPath)

      let reserveCallCount = 0
      let applyCallCount = 0
      let writeReportCallCount = 0
      let analyzeCallCount = 0
      const analyzeFn = async (records, online) => { analyzeCallCount++; return { results: records, checkpoint: { version: 1, records: {} } } }
      const writeReportFn = async (canonical) => { writeReportCallCount++; /* no external write */ }

      // runDryRun with injected functions to ensure no reservation or apply is invoked
      const { canonical, results } = await runDryRun({ scanned: sliced, analyzeFn, buildReportFn: buildCanonicalDryRunReport, writeReportFn })

      // Assertions per requirements
      assert.equal(reserveCallCount, 0, 'reserve must not be called')
      assert.equal(applyCallCount, 0, 'apply must not be called')
      assert.equal(writeReportCallCount, 1, 'report should be written once')
      assert.equal(analyzeCallCount, 1, 'analyze should be called once')
      assert.equal(results.length, 3, 'only three records must be selected')
      assert.equal(canonical.reports.length, 3, 'canonical must include three reports')

      console.log('✓ TEST dry-run-no-reserve: PASS')
    } finally {
      await fsp.rm(tmpDir, { recursive: true, force: true })
    }
  } catch (e) {
    console.error(e)
    process.exitCode = 1
  }
})()
