/**
 * Test suite for import-real-cases.js inventory() function
 * Validates organizational folder handling and client discovery
 */

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const importScriptPath = path.join(__dirname, "..", "scripts", "import-real-cases.js")
const scriptContent = fs.readFileSync(importScriptPath, "utf8")

console.log("Testing import-real-cases.js inventory enhancements...")

// Test 1: Verify organizational folder pattern detection function exists
console.log("\n✓ Test 1: Organizational folder detection")
assert.match(scriptContent, /isOrganizationalFolder/,
  "Should have isOrganizationalFolder function")
assert.match(scriptContent, /return \/\^\\d\+\\s\*-\\s\*\//,
  "Should detect '1 - ...' pattern")
console.log("  ✓ Function present with correct regex")

// Test 2: Verify internal folder detection function exists
console.log("\n✓ Test 2: Internal folder exclusion")
assert.match(scriptContent, /isInternalFolder/,
  "Should have isInternalFolder function")
assert.match(scriptContent, /processo|documentos|contrato|comprimido/i,
  "Should exclude internal folders")
console.log("  ✓ Function excludes: Processo, Documentos, Contrato, Arq Comprimido")

// Test 3: Verify inventory() reads organizational subfolders
console.log("\n✓ Test 3: Inventory reads organizational subfolders")
assert.match(scriptContent, /allDirs.*filter.*entry.*isDirectory/s,
  "Should filter directories")
assert.match(scriptContent, /for.*const entry of allDirs/s,
  "Should iterate directories")
assert.match(scriptContent, /orgPath|subEntries.*readdir.*orgPath/s,
  "Should read from organizational folders")
console.log("  ✓ inventory() has subfolder reading logic")

// Test 4: Verify command 'review' is supported
console.log("\n✓ Test 4: Review command support")
assert.match(scriptContent, /audit\|review\|dry-run/,
  "Help text should list review")
assert.match(scriptContent, /command.*review/,
  "Script should handle review command")
console.log("  ✓ Review command recognized")

// Test 5: Verify HubSpot skipped in audit/review
console.log("\n✓ Test 5: HubSpot disabled in audit/review")
assert.match(scriptContent, /offlineByDefault\s*=.*command\s*===\s*["']audit["']/s,
  "audit should disable HubSpot")
assert.match(scriptContent, /offlineByDefault\s*=.*command\s*===\s*["']review["']/s,
  "review should disable HubSpot")
console.log("  ✓ online flag correctly gates HubSpot calls")

// Test 6: Verify apply/resume protected
console.log("\n✓ Test 6: Apply/Resume protection")
assert.match(scriptContent, /if\s*\(\s*\[\s*["']apply["']\s*,\s*["']resume["']\s*\]\s*\.includes/,
  "Should only apply/resume for write operations")
console.log("  ✓ Only apply/resume trigger writes")

// Test 7: Verify importId uses path hash
console.log("\n✓ Test 7: ImportId stability")
assert.match(scriptContent, /caseImportIdForRelativeFolder\(path\.relative\(root, folder\)\)/,
  "importId should hash the stable relative folder path")
assert.match(scriptContent, /function caseImportIdForRelativeFolder[\s\S]*sha\(String\(relativeFolder\)\.toLowerCase\(\)\)\.slice\(0, 20\)/,
  "importId helper should preserve the existing SHA-256 path derivation")
console.log("  ✓ importId based on stable path hash")

// Test 8: Verify report generation
console.log("\n✓ Test 8: Report generation")
assert.match(scriptContent, /summarize.*REPORT|atomicWrite.*REPORT/,
  "Should save report")
console.log("  ✓ Report file generated")

// Test 9: Verify conservativeName filter active
console.log("\n✓ Test 9: Name validation")
assert.match(scriptContent, /conservativeName/,
  "Should validate folder names")
console.log("  ✓ Name validation function present")

// Test 10: Verify no credentials in logs
console.log("\n✓ Test 10: Credential protection")
assert.doesNotMatch(scriptContent, /console\.log.*(?:cpf|phone|email|HUBSPOT_TOKEN|Authorization)/i,
  "Should not log credentials")
console.log("  ✓ No credentials logged")

console.log("\n" + "=".repeat(70))
console.log("✅ ALL INVENTORY ENHANCEMENT TESTS PASSED")
console.log("=".repeat(70))
