const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const fsp = require("node:fs/promises")
const os = require("node:os")

// Import functions under test (required for behavior testing)
// Note: These are called during dry-run only, not loaded at startup
const { applyPilotSelection, buildCanonicalDryRunReport } = require("../scripts/import-real-cases.js")

// Helper: create temporary JSON file
async function createTempManifest(data) {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "pilot-test-"))
  const filePath = path.join(tmpDir, "manifest.json")
  await fsp.writeFile(filePath, JSON.stringify(data))
  return { tmpDir, filePath }
}

// Helper: cleanup
async function cleanup(tmpDir) {
  await fsp.rm(tmpDir, { recursive: true, force: true })
}

// TEST 1: Selection with out-of-order inventory
async function testOutOfOrderSelection() {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "pilot-test-"))
  try {
    const manifest = {
      selection: [
        { name: "C", importId: "id-c", phone: "111", phoneSource: "pilot_manifest" },
        { name: "A", importId: "id-a", phone: "222", phoneSource: "pilot_manifest" },
        { name: "B", importId: "id-b", phone: "333", phoneSource: "pilot_manifest" }
      ]
    }
    const filePath = path.join(tmpDir, "manifest.json")
    await fsp.writeFile(filePath, JSON.stringify(manifest))

    // Inventory in different order
    const scanned = {
      records: [
        { importId: "id-a", name: "A", phone: "auto-a", consolidatedCase: null },
        { importId: "id-b", name: "B", phone: "auto-b", consolidatedCase: null },
        { importId: "id-c", name: "C", phone: "auto-c", consolidatedCase: null },
        { importId: "id-d", name: "D", phone: "auto-d", consolidatedCase: null }
      ]
    }

    const result = await applyPilotSelection(scanned, filePath)
    
    assert.equal(result.records.length, 3, "Must select exactly 3 records")
    assert(result.records.some(r => r.importId === "id-a"), "Must include id-a")
    assert(result.records.some(r => r.importId === "id-b"), "Must include id-b")
    assert(result.records.some(r => r.importId === "id-c"), "Must include id-c")
    assert(!result.records.some(r => r.importId === "id-d"), "Must NOT include id-d")
    
    // Verify pilot metadata merged
    const recordA = result.records.find(r => r.importId === "id-a")
    assert(recordA._pilotMeta, "Pilot metadata must be present")
    // Phone will be normalized (only digits), so "222" → normalizarTelefone("222") may return empty
    // But the key is that source is correctly tracked
    assert.equal(recordA._pilotMeta.phoneSource, "pilot_manifest", "Phone source must be pilot_manifest")
    assert(recordA._pilotMeta.phone || recordA._pilotMeta.phoneRaw, "Phone must be stored (raw or normalized)")

    console.log("✓ TEST 1 (out-of-order selection): PASS")
  } finally {
    await cleanup(tmpDir)
  }
}

// TEST 2: Missing importId in inventory
async function testMissingImportId() {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "pilot-test-"))
  try {
    const manifest = {
      selection: [
        { name: "A", importId: "id-a", phone: "111", phoneSource: "pilot_manifest" },
        { name: "B", importId: "id-b", phone: "222", phoneSource: "pilot_manifest" },
        { name: "MISSING", importId: "id-missing", phone: "333", phoneSource: "pilot_manifest" }
      ]
    }
    const filePath = path.join(tmpDir, "manifest.json")
    await fsp.writeFile(filePath, JSON.stringify(manifest))

    const scanned = {
      records: [
        { importId: "id-a", name: "A", consolidatedCase: null },
        { importId: "id-b", name: "B", consolidatedCase: null }
      ]
    }

    let errorThrown = false
    try {
      await applyPilotSelection(scanned, filePath)
    } catch (e) {
      errorThrown = true
      assert(e.message.includes("pilot_selection_mismatch") || e.message.includes("_of_3_clients"), 
        `Must fail with mismatch error, got: ${e.message}`)
    }
    assert(errorThrown, "Must throw error when importId not found in inventory")
    console.log("✓ TEST 2 (missing importId): PASS")
  } finally {
    await cleanup(tmpDir)
  }
}

// TEST 3: Duplicate importIds in manifest
async function testDuplicateImportIds() {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "pilot-test-"))
  try {
    const manifest = {
      selection: [
        { name: "A", importId: "id-a", phone: "111", phoneSource: "pilot_manifest" },
        { name: "B", importId: "id-a", phone: "222", phoneSource: "pilot_manifest" }, // duplicate
        { name: "C", importId: "id-c", phone: "333", phoneSource: "pilot_manifest" }
      ]
    }
    const filePath = path.join(tmpDir, "manifest.json")
    await fsp.writeFile(filePath, JSON.stringify(manifest))

    const scanned = {
      records: [
        { importId: "id-a", name: "A", consolidatedCase: null },
        { importId: "id-c", name: "C", consolidatedCase: null }
      ]
    }

    let errorThrown = false
    try {
      await applyPilotSelection(scanned, filePath)
    } catch (e) {
      errorThrown = true
      assert(e.message.includes("duplicate"), `Must mention duplicate, got: ${e.message}`)
    }
    assert(errorThrown, "Must throw error on duplicate importIds")
    console.log("✓ TEST 3 (duplicate importIds): PASS")
  } finally {
    await cleanup(tmpDir)
  }
}

// TEST 4: Wrong count (not exactly 3)
async function testWrongCount() {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "pilot-test-"))
  try {
    // Test with 2 entries
    const manifest = {
      selection: [
        { name: "A", importId: "id-a", phone: "111", phoneSource: "pilot_manifest" },
        { name: "B", importId: "id-b", phone: "222", phoneSource: "pilot_manifest" }
      ]
    }
    const filePath = path.join(tmpDir, "manifest.json")
    await fsp.writeFile(filePath, JSON.stringify(manifest))

    const scanned = {
      records: [
        { importId: "id-a", name: "A", consolidatedCase: null },
        { importId: "id-b", name: "B", consolidatedCase: null }
      ]
    }

    let errorThrown = false
    try {
      await applyPilotSelection(scanned, filePath)
    } catch (e) {
      errorThrown = true
      assert(e.message.includes("exactly_3"), `Must mention 3, got: ${e.message}`)
    }
    assert(errorThrown, "Must throw error when count != 3")
    console.log("✓ TEST 4 (wrong count): PASS")
  } finally {
    await cleanup(tmpDir)
  }
}

// TEST 5: Canonical report number states - BEHAVIORAL
function testCanonicalReportNumberStatesBehavioral() {
  // Prepare four fake registries to exercise the four states
  const results = [
    // 1. NÃO ANALISADO -> no consolidatedCase
    { importId: 'not-analyzed', name: 'NA', folder: 'f1', consolidatedCase: null, reviewReasons: [], contact: { status: 'new' }, deal: { status: 'new' } },
    // 2. BLOQUEADO -> consolidatedCase present and planner marks numero_de_caso blocked
    { importId: 'blocked', name: 'BL', folder: 'f2', consolidatedCase: { documents: [] }, reviewReasons: [], contact: { status: 'new' }, deal: { status: 'new' } },
    // 3. PRESENTE -> consolidatedCase present and planner provides numero_de_caso
    { importId: 'present', name: 'PR', folder: 'f3', consolidatedCase: { documents: [] }, reviewReasons: [], contact: { status: 'new' }, deal: { status: 'new' } },
    // 4. SERÁ GERADO NO APPLY -> consolidatedCase present, no block, no numero_de_caso
    { importId: 'to-generate', name: 'TG', folder: 'f4', consolidatedCase: { documents: [] }, reviewReasons: [], contact: { status: 'new' }, deal: { status: 'new' } }
  ]

  // Mock planner to return different plans per importId
  const originalPlanner = global.planejarSincronizacaoDocumentalHubSpot
  global.planejarSincronizacaoDocumentalHubSpot = ({ registry }) => {
    if (registry.importId === 'blocked') {
      return { contato: { props: {}, bloqueados: [] }, negocio: { props: {}, bloqueados: [{ campo: 'numero_de_caso', motivo: 'manual' }] } }
    }
    if (registry.importId === 'present') {
      return { contato: { props: {}, bloqueados: [] }, negocio: { props: { numero_de_caso: 'CASE-FAKE-123' }, bloqueados: [] } }
    }
    // for not-analyzed and to-generate: no bloqueios and no numero_de_caso
    return { contato: { props: {}, bloqueados: [] }, negocio: { props: {}, bloqueados: [] } }
  }

  try {
    // Ensure the module picks up the injected global planner by clearing require cache and re-requiring
    const modPath = require.resolve('../scripts/import-real-cases.js')
    const origModuleCache = require.cache[modPath]
    delete require.cache[modPath]
    const { buildCanonicalDryRunReport } = require('../scripts/import-real-cases.js')

    const canonical = buildCanonicalDryRunReport(results, { records: results })
    const map = Object.fromEntries(canonical.reports.map(r => [r.importId, r]))

    // restore original module cache to avoid interfering with other tests
    if (origModuleCache) require.cache[modPath] = origModuleCache

    // NÃO ANALISADO
    assert.equal(map['not-analyzed'].planning.caseNumber, '<NÃO ANALISADO>')
    assert.equal(map['not-analyzed'].planning.officialNumber, null)

    // BLOQUEADO
    assert.equal(map['blocked'].planning.caseNumber, '<BLOQUEADO>')
    assert.equal(map['blocked'].planning.officialNumber, null)

    // PRESENTE
    assert.equal(map['present'].planning.caseNumber, '<PRESENTE>')
    assert.equal(map['present'].planning.officialNumber, 'CASE-FAKE-123')

    // SERÁ GERADO NO APPLY
    assert.equal(map['to-generate'].planning.caseNumber, '<SERÁ GERADO NO APPLY>')
    assert.equal(map['to-generate'].planning.officialNumber, null)

    console.log('✓ TEST 5 (canonical report number states - behavioral): PASS')
  } finally {
    global.planejarSincronizacaoDocumentalHubSpot = originalPlanner
  }
}

// TEST 6: Phone source tracking
function testPhoneSourceTracking() {
  const results = [
    {
      importId: "id-pilot",
      name: "Client Pilot",
      folder: "folder-pilot",
      phone: "auto-pilot",
      _pilotMeta: { phone: "5511999990001", phoneSource: "pilot_manifest" },
      consolidatedCase: null,
      reviewReasons: [],
      contact: { status: "new" },
      deal: { status: "new" }
    }
  ]

  const originalPlan = global.planejarSincronizacaoDocumentalHubSpot
  global.planejarSincronizacaoDocumentalHubSpot = () => ({
    contato: { props: {}, bloqueados: [] },
    negocio: { props: {}, bloqueados: [] }
  })

  try {
    const canonical = buildCanonicalDryRunReport(results, { records: results })
    const report = canonical.reports[0]
    
    assert.equal(report.planning.phone.source, "pilot_manifest", "Source must be pilot_manifest")
    assert.equal(report.planning.phone.state, "<PRESENTE>", "State must be PRESENTE")
    assert.equal(report.planning.phone.normalized, "5511999990001", "Normalized phone must be from manifest")

    console.log("✓ TEST 6 (phone source tracking): PASS")
  } finally {
    global.planejarSincronizacaoDocumentalHubSpot = originalPlan
  }
}

// RUN ALL TESTS
async function runAll() {
  try {
    await testOutOfOrderSelection()
    await testMissingImportId()
    await testDuplicateImportIds()
    await testWrongCount()
    testCanonicalReportNumberStatesBehavioral()
    testPhoneSourceTracking()
    
    console.log("\n✓✓✓ ALL BEHAVIORAL TESTS PASSED ✓✓✓")
  } catch (error) {
    console.error("\n✗✗✗ TEST FAILED ✗✗✗")
    console.error(error)
    process.exitCode = 1
  }
}

if (require.main === module) {
  runAll()
}

module.exports = { testOutOfOrderSelection, testMissingImportId, testDuplicateImportIds, testWrongCount, testCanonicalReportNumberStatesBehavioral, testPhoneSourceTracking }
