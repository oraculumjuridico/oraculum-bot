"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const crypto = require("node:crypto")
const { main, parseArgs, areaNameFor } = require("../scripts/generate-single-case-apply-plan")

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex")

function mockPostgres(t, caseNumber = "PRV.260714.707") {
  const oldMode = process.env.CASE_NUMBER_RESERVATION_MODE
  const oldUrl = process.env.EXTERNAL_STATE_DATABASE_URL
  process.env.CASE_NUMBER_RESERVATION_MODE = "postgres"
  process.env.EXTERNAL_STATE_DATABASE_URL = "postgresql://mock:mock@localhost:5432/mock"

  const { Pool: RealPool } = require("pg")
  const mockPool = {
    connect: async () => ({
      query: async (sql, params) => {
        if (sql === "BEGIN" || sql === "SET TRANSACTION READ ONLY" || sql === "ROLLBACK") return {}
        if (sql.includes("case_number_reservations")) {
          return {
            rowCount: 1,
            rows: [{ reservation_key: params[0], case_number: caseNumber, status: "reserved" }]
          }
        }
        throw new Error("Unexpected query in mock")
      },
      release: () => {}
    }),
    end: async () => {}
  }
  require.cache[require.resolve("pg")].exports.Pool = function() { return mockPool }

  t.after(() => {
    require.cache[require.resolve("pg")].exports.Pool = RealPool
    if (oldMode !== undefined) process.env.CASE_NUMBER_RESERVATION_MODE = oldMode
    else delete process.env.CASE_NUMBER_RESERVATION_MODE
    if (oldUrl !== undefined) process.env.EXTERNAL_STATE_DATABASE_URL = oldUrl
    else delete process.env.EXTERNAL_STATE_DATABASE_URL
  })
}

async function harness() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "single-case-plan-")), contentRoot = path.join(root, "content")
  await fs.mkdir(contentRoot)
  const contents = [], physicalOccurrences = []
  for (let index = 0; index < 12; index++) {
    const bytes = Buffer.from(`sanitized-${index}`), hash = sha256(bytes), contentDocumentId = `C-${hash.slice(0, 20)}`, file = path.join(contentRoot, `file-${index}.pdf`)
    await fs.writeFile(file, bytes)
    contents.push({ contentDocumentId, sha256: hash, analysisStatus: index === 4 ? "IGNORED" : "ANALYZED", quarantined: false })
    physicalOccurrences.push({ physicalDocumentId: `P-${index + 1}`, contentDocumentId, sha256: hash, localReference: file })
  }
  for (const [suffix, sourceIndex] of [[13, 2], [14, 6]]) {
    const source = physicalOccurrences[sourceIndex], copy = path.join(contentRoot, `copy-${suffix}.pdf`)
    await fs.copyFile(source.localReference, copy)
    physicalOccurrences.push({ ...source, physicalDocumentId: `P-${suffix}`, localReference: copy })
  }
  const caseImportId = "case-script-sanitized", caseNumber = "PRV.260714.707"
  const identity = { schemaVersion: 1, caseImportId, identityConfirmationApplied: true, safeToPlanHubSpot: true, reviewedInventory: { contents, physicalOccurrences } }
  const plan = { schemaVersion: 1, caseImportId, safeToPlanHubSpot: true, safeToApply: false, contactPlan: { properties: { firstname: "Cliente Ficticio", cpf_do_cliente: "fixture", phone: "fixture" } }, dealPlan: { caseNumber, properties: { numero_de_caso: caseNumber, area_juridica: "Previdenciário (INSS)", pipeline: "fixture", dealstage: "fixture" } }, documentPlan: { physicalOccurrences: 14, uniqueContents: 12, ignoredNonDocumentContents: 1, binaryDuplicateOccurrences: 2 }, caseNumberReservationSync: { source: "OFFICIAL_POSTGRES_RESERVATION" } }
  const identityPath = path.join(root, "identity.json"), planPath = path.join(root, "plan.json"), manifestPath = path.join(root, "manifest.json")
  await fs.writeFile(identityPath, JSON.stringify(identity)); const planBytes = Buffer.from(JSON.stringify(plan)); await fs.writeFile(planPath, planBytes)
  const argv = ["--identity", identityPath, "--base-plan", planPath, "--content-root", contentRoot, "--output-plan", planPath, "--output-manifest", manifestPath, "--expected-plan-sha256", sha256(planBytes)]
  return { root, planPath, manifestPath, argv }
}

test("script gera somente artefatos locais sanitizados", async t => {
  const h = await harness(); t.after(() => fs.rm(h.root, { recursive: true, force: true }))
  const output = [], report = await main({ argv: h.argv, output: value => output.push(value) })
  const plan = JSON.parse(await fs.readFile(h.planPath)), manifest = JSON.parse(await fs.readFile(h.manifestPath))
  assert.equal(report.planRegenerated, true)
  assert.equal(plan.documentPlan.contents.length, 12)
  assert.equal(plan.documentPlan.occurrences.length, 14)
  assert.equal(manifest.length, 11)
  assert.ok(manifest.every(item => !path.isAbsolute(item.relativePath)))
  assert.equal(output.length, 1)
})

test("script recusa plano-base divergente", async t => {
  const h = await harness(); t.after(() => fs.rm(h.root, { recursive: true, force: true }))
  h.argv[h.argv.length - 1] = "0".repeat(64)
  await assert.rejects(() => main({ argv: h.argv, output() {} }), /BASE_PLAN_DIVERGENT/)
})

test("parser exige argumentos explícitos e regra de área é canônica", () => {
  assert.throws(() => parseArgs([]), /ARGUMENT_MISSING/)
  assert.equal(areaNameFor("Previdenciário (INSS)"), "Previdenciário")
  assert.equal(areaNameFor("Trabalhista"), "Trabalhista")
})

// ═══ COMPARISON MODE TESTS ═══

test("comparison mode: gera artefatos temporários fora do repositório", async t => {
  mockPostgres(t)
  const h = await harness(); t.after(() => fs.rm(h.root, { recursive: true, force: true }))
  const tempDir = path.join(os.tmpdir(), `comparison-${Date.now()}`)
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }))

  const comparisonArgv = ["--identity", h.argv[1], "--base-plan", h.argv[3], "--content-root", h.argv[5], "--comparison-output-dir", tempDir, "--expected-plan-sha256", h.argv[11], "--preserve-temporaries"]
  const output = [], report = await main({ argv: comparisonArgv, output: value => output.push(value) })

  assert.equal(report.comparisonMode, true)
  assert.equal(report.readOnly, true)
  assert.ok(await fs.access(report.generated.planPath).then(() => true).catch(() => false))
  assert.ok(await fs.access(report.generated.manifestPath).then(() => true).catch(() => false))
  assert.match(report.generated.planHash, /^[a-f0-9]{64}$/)
  assert.match(report.generated.manifestHash, /^[a-f0-9]{64}$/)
  assert.match(report.generated.authorizablePlanHash, /^[a-f0-9]{64}$/)
  assert.match(report.generated.reservationEvidenceHash, /^[a-f0-9]{64}$/)
})

test("comparison mode: rejeita diretório oficial de planos", async t => {
  const h = await harness(); t.after(() => fs.rm(h.root, { recursive: true, force: true }))
  const officialDir = path.resolve("data/case-import/plans")
  const comparisonArgv = ["--identity", h.argv[1], "--base-plan", h.argv[3], "--content-root", h.argv[5], "--comparison-output-dir", officialDir, "--expected-plan-sha256", h.argv[11]]
  await assert.rejects(() => main({ argv: comparisonArgv, output() {} }), /COMPARISON_DIR_OFFICIAL_REJECTED/)
})

test("comparison mode: rejeita diretório oficial de manifestos", async t => {
  const h = await harness(); t.after(() => fs.rm(h.root, { recursive: true, force: true }))
  const officialDir = path.resolve("data/case-import/content-manifests")
  const comparisonArgv = ["--identity", h.argv[1], "--base-plan", h.argv[3], "--content-root", h.argv[5], "--comparison-output-dir", officialDir, "--expected-plan-sha256", h.argv[11]]
  await assert.rejects(() => main({ argv: comparisonArgv, output() {} }), /COMPARISON_DIR_OFFICIAL_REJECTED/)
})

test("comparison mode: rejeita caminho dentro do repositório", async t => {
  const h = await harness(); t.after(() => fs.rm(h.root, { recursive: true, force: true }))
  const insideWorkspace = path.resolve("temp-comparison")
  const comparisonArgv = ["--identity", h.argv[1], "--base-plan", h.argv[3], "--content-root", h.argv[5], "--comparison-output-dir", insideWorkspace, "--expected-plan-sha256", h.argv[11]]
  await assert.rejects(() => main({ argv: comparisonArgv, output() {} }), /COMPARISON_DIR_INSIDE_WORKSPACE_REJECTED/)
})

test("comparison mode: não altera arquivos oficiais", async t => {
  mockPostgres(t)
  const h = await harness(); t.after(() => fs.rm(h.root, { recursive: true, force: true }))

  // Simular arquivos oficiais
  const officialPlansDir = path.join(h.root, "official-plans")
  const officialManifestsDir = path.join(h.root, "official-manifests")
  await fs.mkdir(officialPlansDir)
  await fs.mkdir(officialManifestsDir)
  const officialPlan = path.join(officialPlansDir, "case-script-sanitized.json")
  const officialManifest = path.join(officialManifestsDir, "case-script-sanitized.json")
  await fs.writeFile(officialPlan, JSON.stringify({ test: "original" }))
  await fs.writeFile(officialManifest, JSON.stringify([{ test: "original" }]))

  const beforePlan = await fs.readFile(officialPlan, "utf8")
  const beforeManifest = await fs.readFile(officialManifest, "utf8")

  const tempDir = path.join(os.tmpdir(), `comparison-${Date.now()}`)
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }))
  const comparisonArgv = ["--identity", h.argv[1], "--base-plan", h.argv[3], "--content-root", h.argv[5], "--comparison-output-dir", tempDir, "--expected-plan-sha256", h.argv[11]]
  await main({ argv: comparisonArgv, output() {} })

  const afterPlan = await fs.readFile(officialPlan, "utf8")
  const afterManifest = await fs.readFile(officialManifest, "utf8")

  assert.equal(afterPlan, beforePlan)
  assert.equal(afterManifest, beforeManifest)
})

test("comparison mode: calcula quatro hashes corretamente", async t => {
  const h = await harness(); t.after(() => fs.rm(h.root, { recursive: true, force: true }))
  const tempDir = path.join(os.tmpdir(), `comparison-${Date.now()}`)
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }))

  // Set env vars to simulate PostgreSQL unavailable (test should fail)
  const oldMode = process.env.CASE_NUMBER_RESERVATION_MODE
  const oldUrl = process.env.EXTERNAL_STATE_DATABASE_URL
  delete process.env.CASE_NUMBER_RESERVATION_MODE
  delete process.env.EXTERNAL_STATE_DATABASE_URL
  t.after(() => {
    if (oldMode !== undefined) process.env.CASE_NUMBER_RESERVATION_MODE = oldMode
    if (oldUrl !== undefined) process.env.EXTERNAL_STATE_DATABASE_URL = oldUrl
  })

  const comparisonArgv = ["--identity", h.argv[1], "--base-plan", h.argv[3], "--content-root", h.argv[5], "--comparison-output-dir", tempDir, "--expected-plan-sha256", h.argv[11], "--preserve-temporaries"]

  // Should fail with POSTGRES_MODE_REQUIRED
  await assert.rejects(() => main({ argv: comparisonArgv, output() {} }), /POSTGRES_MODE_REQUIRED/)
})

test("comparison mode: PostgreSQL ausente causa falha", async t => {
  const h = await harness(); t.after(() => fs.rm(h.root, { recursive: true, force: true }))
  const tempDir = path.join(os.tmpdir(), `comparison-${Date.now()}`)
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }))

  const oldMode = process.env.CASE_NUMBER_RESERVATION_MODE
  const oldUrl = process.env.EXTERNAL_STATE_DATABASE_URL
  delete process.env.CASE_NUMBER_RESERVATION_MODE
  delete process.env.EXTERNAL_STATE_DATABASE_URL
  t.after(() => {
    if (oldMode !== undefined) process.env.CASE_NUMBER_RESERVATION_MODE = oldMode
    if (oldUrl !== undefined) process.env.EXTERNAL_STATE_DATABASE_URL = oldUrl
  })

  const comparisonArgv = ["--identity", h.argv[1], "--base-plan", h.argv[3], "--content-root", h.argv[5], "--comparison-output-dir", tempDir, "--expected-plan-sha256", h.argv[11]]
  await assert.rejects(() => main({ argv: comparisonArgv, output() {} }), /POSTGRES_MODE_REQUIRED/)
})

test("comparison mode: modo não postgres causa falha", async t => {
  const h = await harness(); t.after(() => fs.rm(h.root, { recursive: true, force: true }))
  const tempDir = path.join(os.tmpdir(), `comparison-${Date.now()}`)
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }))

  const oldMode = process.env.CASE_NUMBER_RESERVATION_MODE
  process.env.CASE_NUMBER_RESERVATION_MODE = "memory"
  t.after(() => {
    if (oldMode !== undefined) process.env.CASE_NUMBER_RESERVATION_MODE = oldMode
    else delete process.env.CASE_NUMBER_RESERVATION_MODE
  })

  const comparisonArgv = ["--identity", h.argv[1], "--base-plan", h.argv[3], "--content-root", h.argv[5], "--comparison-output-dir", tempDir, "--expected-plan-sha256", h.argv[11]]
  await assert.rejects(() => main({ argv: comparisonArgv, output() {} }), /POSTGRES_MODE_REQUIRED/)
})

test("comparison mode: DATABASE_URL ausente causa falha", async t => {
  const h = await harness(); t.after(() => fs.rm(h.root, { recursive: true, force: true }))
  const tempDir = path.join(os.tmpdir(), `comparison-${Date.now()}`)
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }))

  const oldMode = process.env.CASE_NUMBER_RESERVATION_MODE
  const oldUrl = process.env.EXTERNAL_STATE_DATABASE_URL
  const oldDbUrl = process.env.DATABASE_URL
  process.env.CASE_NUMBER_RESERVATION_MODE = "postgres"
  delete process.env.EXTERNAL_STATE_DATABASE_URL
  delete process.env.DATABASE_URL
  t.after(() => {
    if (oldMode !== undefined) process.env.CASE_NUMBER_RESERVATION_MODE = oldMode
    else delete process.env.CASE_NUMBER_RESERVATION_MODE
    if (oldUrl !== undefined) process.env.EXTERNAL_STATE_DATABASE_URL = oldUrl
    if (oldDbUrl !== undefined) process.env.DATABASE_URL = oldDbUrl
  })

  const comparisonArgv = ["--identity", h.argv[1], "--base-plan", h.argv[3], "--content-root", h.argv[5], "--comparison-output-dir", tempDir, "--expected-plan-sha256", h.argv[11]]
  await assert.rejects(() => main({ argv: comparisonArgv, output() {} }), /POSTGRES_CONNECTION_REQUIRED/)
})

test("comparison mode: cleanup remove temporários por padrão", async t => {
  mockPostgres(t)
  const h = await harness(); t.after(() => fs.rm(h.root, { recursive: true, force: true }))
  const tempDir = path.join(os.tmpdir(), `comparison-${Date.now()}`)
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }))

  const comparisonArgv = ["--identity", h.argv[1], "--base-plan", h.argv[3], "--content-root", h.argv[5], "--comparison-output-dir", tempDir, "--expected-plan-sha256", h.argv[11]]
  const report = await main({ argv: comparisonArgv, output() {} })

  // Arquivos devem ter sido removidos
  const planExists = await fs.access(report.generated.planPath).then(() => true).catch(() => false)
  const manifestExists = await fs.access(report.generated.manifestPath).then(() => true).catch(() => false)

  assert.equal(planExists, false)
  assert.equal(manifestExists, false)
})

test("comparison mode: --preserve-temporaries mantém arquivos", async t => {
  mockPostgres(t)
  const h = await harness(); t.after(() => fs.rm(h.root, { recursive: true, force: true }))
  const tempDir = path.join(os.tmpdir(), `comparison-${Date.now()}`)
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }))

  const comparisonArgv = ["--identity", h.argv[1], "--base-plan", h.argv[3], "--content-root", h.argv[5], "--comparison-output-dir", tempDir, "--expected-plan-sha256", h.argv[11], "--preserve-temporaries"]
  const report = await main({ argv: comparisonArgv, output() {} })

  // Arquivos devem estar presentes
  const planExists = await fs.access(report.generated.planPath).then(() => true).catch(() => false)
  const manifestExists = await fs.access(report.generated.manifestPath).then(() => true).catch(() => false)

  assert.equal(planExists, true)
  assert.equal(manifestExists, true)
})

test("comparison mode: cleanup funciona em falha", async t => {
  const h = await harness(); t.after(() => fs.rm(h.root, { recursive: true, force: true }))
  const tempDir = path.join(os.tmpdir(), `comparison-${Date.now()}`)
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }))

  // Simular falha injetando hash errado
  const badArgv = ["--identity", h.argv[1], "--base-plan", h.argv[3], "--content-root", h.argv[5], "--comparison-output-dir", tempDir, "--expected-plan-sha256", "0".repeat(64)]

  await assert.rejects(() => main({ argv: badArgv, output() {} }), /BASE_PLAN_DIVERGENT/)

  // Diretório temporário não deve ter sido criado ou deve estar vazio
  const dirExists = await fs.access(tempDir).then(() => true).catch(() => false)
  assert.equal(dirExists, false)
})

test("modo normal: preserva validação de output-plan igual a base-plan", async t => {
  const h = await harness(); t.after(() => fs.rm(h.root, { recursive: true, force: true }))
  const differentOutput = path.join(h.root, "different-plan.json")
  const badArgv = ["--identity", h.argv[1], "--base-plan", h.argv[3], "--content-root", h.argv[5], "--output-plan", differentOutput, "--output-manifest", h.argv[9], "--expected-plan-sha256", h.argv[11]]
  await assert.rejects(() => main({ argv: badArgv, output() {} }), /OUTPUT_PLAN_MUST_MATCH_BASE/)
})

test("modo normal: regenera plano e manifesto como antes", async t => {
  const h = await harness(); t.after(() => fs.rm(h.root, { recursive: true, force: true }))
  const report = await main({ argv: h.argv, output() {} })
  assert.equal(report.planRegenerated, true)
  assert.equal(report.manifestGenerated, true)
  assert.equal(report.comparisonMode, undefined) // não é modo comparativo
  const plan = JSON.parse(await fs.readFile(h.planPath))
  assert.equal(plan.documentPlan.contents.length, 12)
})

// ═══ ADDITIONAL FAIL-CLOSED TESTS ═══

test("comparison mode: connection string inválida causa falha", async t => {
  const h = await harness(); t.after(() => fs.rm(h.root, { recursive: true, force: true }))
  const tempDir = path.join(os.tmpdir(), `comparison-${Date.now()}`)
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }))

  const oldMode = process.env.CASE_NUMBER_RESERVATION_MODE
  const oldUrl = process.env.EXTERNAL_STATE_DATABASE_URL
  process.env.CASE_NUMBER_RESERVATION_MODE = "postgres"
  process.env.EXTERNAL_STATE_DATABASE_URL = "postgresql://invalid:invalid@localhost:9999/nonexistent"

  const { Pool: RealPool } = require("pg")
  const mockPool = {
    connect: async () => { throw new Error("ECONNREFUSED") },
    end: async () => {}
  }
  require.cache[require.resolve("pg")].exports.Pool = function() { return mockPool }

  t.after(() => {
    require.cache[require.resolve("pg")].exports.Pool = RealPool
    if (oldMode !== undefined) process.env.CASE_NUMBER_RESERVATION_MODE = oldMode
    else delete process.env.CASE_NUMBER_RESERVATION_MODE
    if (oldUrl !== undefined) process.env.EXTERNAL_STATE_DATABASE_URL = oldUrl
    else delete process.env.EXTERNAL_STATE_DATABASE_URL
  })

  const comparisonArgv = ["--identity", h.argv[1], "--base-plan", h.argv[3], "--content-root", h.argv[5], "--comparison-output-dir", tempDir, "--expected-plan-sha256", h.argv[11]]
  await assert.rejects(() => main({ argv: comparisonArgv, output() {} }), /RESERVATION_VERIFICATION_FAILED/)
})

test("comparison mode: reserva inexistente causa falha", async t => {
  const h = await harness(); t.after(() => fs.rm(h.root, { recursive: true, force: true }))
  const tempDir = path.join(os.tmpdir(), `comparison-${Date.now()}`)
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }))

  const oldMode = process.env.CASE_NUMBER_RESERVATION_MODE
  const oldUrl = process.env.EXTERNAL_STATE_DATABASE_URL
  process.env.CASE_NUMBER_RESERVATION_MODE = "postgres"
  process.env.EXTERNAL_STATE_DATABASE_URL = "postgresql://mock:mock@localhost:5432/mock"

  const { Pool: RealPool } = require("pg")
  const mockPool = {
    connect: async () => ({
      query: async (sql) => {
        if (sql === "BEGIN" || sql === "SET TRANSACTION READ ONLY" || sql === "ROLLBACK") return {}
        if (sql.includes("case_number_reservations")) return { rowCount: 0, rows: [] }
        throw new Error("Unexpected query")
      },
      release: () => {}
    }),
    end: async () => {}
  }
  require.cache[require.resolve("pg")].exports.Pool = function() { return mockPool }

  t.after(() => {
    require.cache[require.resolve("pg")].exports.Pool = RealPool
    if (oldMode !== undefined) process.env.CASE_NUMBER_RESERVATION_MODE = oldMode
    else delete process.env.CASE_NUMBER_RESERVATION_MODE
    if (oldUrl !== undefined) process.env.EXTERNAL_STATE_DATABASE_URL = oldUrl
    else delete process.env.EXTERNAL_STATE_DATABASE_URL
  })

  const comparisonArgv = ["--identity", h.argv[1], "--base-plan", h.argv[3], "--content-root", h.argv[5], "--comparison-output-dir", tempDir, "--expected-plan-sha256", h.argv[11]]
  await assert.rejects(() => main({ argv: comparisonArgv, output() {} }), /RESERVATION_NOT_FOUND/)
})

test("comparison mode: múltiplas reservas causa falha", async t => {
  const h = await harness(); t.after(() => fs.rm(h.root, { recursive: true, force: true }))
  const tempDir = path.join(os.tmpdir(), `comparison-${Date.now()}`)
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }))

  const oldMode = process.env.CASE_NUMBER_RESERVATION_MODE
  const oldUrl = process.env.EXTERNAL_STATE_DATABASE_URL
  process.env.CASE_NUMBER_RESERVATION_MODE = "postgres"
  process.env.EXTERNAL_STATE_DATABASE_URL = "postgresql://mock:mock@localhost:5432/mock"

  const { Pool: RealPool } = require("pg")
  const mockPool = {
    connect: async () => ({
      query: async (sql, params) => {
        if (sql === "BEGIN" || sql === "SET TRANSACTION READ ONLY" || sql === "ROLLBACK") return {}
        if (sql.includes("case_number_reservations")) {
          return {
            rowCount: 2,
            rows: [
              { reservation_key: params[0], case_number: "PRV.260714.707", status: "reserved" },
              { reservation_key: params[0], case_number: "PRV.260714.708", status: "reserved" }
            ]
          }
        }
        throw new Error("Unexpected query")
      },
      release: () => {}
    }),
    end: async () => {}
  }
  require.cache[require.resolve("pg")].exports.Pool = function() { return mockPool }

  t.after(() => {
    require.cache[require.resolve("pg")].exports.Pool = RealPool
    if (oldMode !== undefined) process.env.CASE_NUMBER_RESERVATION_MODE = oldMode
    else delete process.env.CASE_NUMBER_RESERVATION_MODE
    if (oldUrl !== undefined) process.env.EXTERNAL_STATE_DATABASE_URL = oldUrl
    else delete process.env.EXTERNAL_STATE_DATABASE_URL
  })

  const comparisonArgv = ["--identity", h.argv[1], "--base-plan", h.argv[3], "--content-root", h.argv[5], "--comparison-output-dir", tempDir, "--expected-plan-sha256", h.argv[11]]
  await assert.rejects(() => main({ argv: comparisonArgv, output() {} }), /RESERVATION_AMBIGUOUS/)
})

test("comparison mode: caseNumber divergente causa falha", async t => {
  const h = await harness(); t.after(() => fs.rm(h.root, { recursive: true, force: true }))
  const tempDir = path.join(os.tmpdir(), `comparison-${Date.now()}`)
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }))

  const oldMode = process.env.CASE_NUMBER_RESERVATION_MODE
  const oldUrl = process.env.EXTERNAL_STATE_DATABASE_URL
  process.env.CASE_NUMBER_RESERVATION_MODE = "postgres"
  process.env.EXTERNAL_STATE_DATABASE_URL = "postgresql://mock:mock@localhost:5432/mock"

  const { Pool: RealPool } = require("pg")
  const mockPool = {
    connect: async () => ({
      query: async (sql, params) => {
        if (sql === "BEGIN" || sql === "SET TRANSACTION READ ONLY" || sql === "ROLLBACK") return {}
        if (sql.includes("case_number_reservations")) {
          return {
            rowCount: 1,
            rows: [{ reservation_key: params[0], case_number: "DIFFERENT.999999.999", status: "reserved" }]
          }
        }
        throw new Error("Unexpected query")
      },
      release: () => {}
    }),
    end: async () => {}
  }
  require.cache[require.resolve("pg")].exports.Pool = function() { return mockPool }

  t.after(() => {
    require.cache[require.resolve("pg")].exports.Pool = RealPool
    if (oldMode !== undefined) process.env.CASE_NUMBER_RESERVATION_MODE = oldMode
    else delete process.env.CASE_NUMBER_RESERVATION_MODE
    if (oldUrl !== undefined) process.env.EXTERNAL_STATE_DATABASE_URL = oldUrl
    else delete process.env.EXTERNAL_STATE_DATABASE_URL
  })

  const comparisonArgv = ["--identity", h.argv[1], "--base-plan", h.argv[3], "--content-root", h.argv[5], "--comparison-output-dir", tempDir, "--expected-plan-sha256", h.argv[11]]
  await assert.rejects(() => main({ argv: comparisonArgv, output() {} }), /RESERVATION_NUMBER_MISMATCH/)
})

test("comparison mode: status inválido causa falha", async t => {
  const h = await harness(); t.after(() => fs.rm(h.root, { recursive: true, force: true }))
  const tempDir = path.join(os.tmpdir(), `comparison-${Date.now()}`)
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }))

  const oldMode = process.env.CASE_NUMBER_RESERVATION_MODE
  const oldUrl = process.env.EXTERNAL_STATE_DATABASE_URL
  process.env.CASE_NUMBER_RESERVATION_MODE = "postgres"
  process.env.EXTERNAL_STATE_DATABASE_URL = "postgresql://mock:mock@localhost:5432/mock"

  const { Pool: RealPool } = require("pg")
  const mockPool = {
    connect: async () => ({
      query: async (sql, params) => {
        if (sql === "BEGIN" || sql === "SET TRANSACTION READ ONLY" || sql === "ROLLBACK") return {}
        if (sql.includes("case_number_reservations")) {
          return {
            rowCount: 1,
            rows: [{ reservation_key: params[0], case_number: "PRV.260714.707", status: "expired" }]
          }
        }
        throw new Error("Unexpected query")
      },
      release: () => {}
    }),
    end: async () => {}
  }
  require.cache[require.resolve("pg")].exports.Pool = function() { return mockPool }

  t.after(() => {
    require.cache[require.resolve("pg")].exports.Pool = RealPool
    if (oldMode !== undefined) process.env.CASE_NUMBER_RESERVATION_MODE = oldMode
    else delete process.env.CASE_NUMBER_RESERVATION_MODE
    if (oldUrl !== undefined) process.env.EXTERNAL_STATE_DATABASE_URL = oldUrl
    else delete process.env.EXTERNAL_STATE_DATABASE_URL
  })

  const comparisonArgv = ["--identity", h.argv[1], "--base-plan", h.argv[3], "--content-root", h.argv[5], "--comparison-output-dir", tempDir, "--expected-plan-sha256", h.argv[11]]
  await assert.rejects(() => main({ argv: comparisonArgv, output() {} }), /RESERVATION_STATUS_INVALID/)
})

test("comparison mode: ROLLBACK executado em sucesso", async t => {
  const h = await harness(); t.after(() => fs.rm(h.root, { recursive: true, force: true }))
  const tempDir = path.join(os.tmpdir(), `comparison-${Date.now()}`)
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }))

  let rollbackCalled = false
  const oldMode = process.env.CASE_NUMBER_RESERVATION_MODE
  const oldUrl = process.env.EXTERNAL_STATE_DATABASE_URL
  process.env.CASE_NUMBER_RESERVATION_MODE = "postgres"
  process.env.EXTERNAL_STATE_DATABASE_URL = "postgresql://mock:mock@localhost:5432/mock"

  const { Pool: RealPool } = require("pg")
  const mockPool = {
    connect: async () => ({
      query: async (sql, params) => {
        if (sql === "BEGIN" || sql === "SET TRANSACTION READ ONLY") return {}
        if (sql === "ROLLBACK") { rollbackCalled = true; return {} }
        if (sql.includes("case_number_reservations")) {
          return {
            rowCount: 1,
            rows: [{ reservation_key: params[0], case_number: "PRV.260714.707", status: "reserved" }]
          }
        }
        throw new Error("Unexpected query")
      },
      release: () => {}
    }),
    end: async () => {}
  }
  require.cache[require.resolve("pg")].exports.Pool = function() { return mockPool }

  t.after(() => {
    require.cache[require.resolve("pg")].exports.Pool = RealPool
    if (oldMode !== undefined) process.env.CASE_NUMBER_RESERVATION_MODE = oldMode
    else delete process.env.CASE_NUMBER_RESERVATION_MODE
    if (oldUrl !== undefined) process.env.EXTERNAL_STATE_DATABASE_URL = oldUrl
    else delete process.env.EXTERNAL_STATE_DATABASE_URL
  })

  const comparisonArgv = ["--identity", h.argv[1], "--base-plan", h.argv[3], "--content-root", h.argv[5], "--comparison-output-dir", tempDir, "--expected-plan-sha256", h.argv[11]]
  await main({ argv: comparisonArgv, output() {} })

  assert.equal(rollbackCalled, true)
})

test("comparison mode: ROLLBACK executado em falha", async t => {
  const h = await harness(); t.after(() => fs.rm(h.root, { recursive: true, force: true }))
  const tempDir = path.join(os.tmpdir(), `comparison-${Date.now()}`)
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }))

  let rollbackCalled = false
  const oldMode = process.env.CASE_NUMBER_RESERVATION_MODE
  const oldUrl = process.env.EXTERNAL_STATE_DATABASE_URL
  process.env.CASE_NUMBER_RESERVATION_MODE = "postgres"
  process.env.EXTERNAL_STATE_DATABASE_URL = "postgresql://mock:mock@localhost:5432/mock"

  const { Pool: RealPool } = require("pg")
  const mockPool = {
    connect: async () => ({
      query: async (sql) => {
        if (sql === "BEGIN" || sql === "SET TRANSACTION READ ONLY") return {}
        if (sql === "ROLLBACK") { rollbackCalled = true; return {} }
        if (sql.includes("case_number_reservations")) return { rowCount: 0, rows: [] }
        throw new Error("Unexpected query")
      },
      release: () => {}
    }),
    end: async () => {}
  }
  require.cache[require.resolve("pg")].exports.Pool = function() { return mockPool }

  t.after(() => {
    require.cache[require.resolve("pg")].exports.Pool = RealPool
    if (oldMode !== undefined) process.env.CASE_NUMBER_RESERVATION_MODE = oldMode
    else delete process.env.CASE_NUMBER_RESERVATION_MODE
    if (oldUrl !== undefined) process.env.EXTERNAL_STATE_DATABASE_URL = oldUrl
    else delete process.env.EXTERNAL_STATE_DATABASE_URL
  })

  const comparisonArgv = ["--identity", h.argv[1], "--base-plan", h.argv[3], "--content-root", h.argv[5], "--comparison-output-dir", tempDir, "--expected-plan-sha256", h.argv[11]]
  await assert.rejects(() => main({ argv: comparisonArgv, output() {} }), /RESERVATION_NOT_FOUND/)

  assert.equal(rollbackCalled, true)
})

test("comparison mode: nenhuma query de escrita executada", async t => {
  const h = await harness(); t.after(() => fs.rm(h.root, { recursive: true, force: true }))
  const tempDir = path.join(os.tmpdir(), `comparison-${Date.now()}`)
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }))

  const queries = []
  const oldMode = process.env.CASE_NUMBER_RESERVATION_MODE
  const oldUrl = process.env.EXTERNAL_STATE_DATABASE_URL
  process.env.CASE_NUMBER_RESERVATION_MODE = "postgres"
  process.env.EXTERNAL_STATE_DATABASE_URL = "postgresql://mock:mock@localhost:5432/mock"

  const { Pool: RealPool } = require("pg")
  const mockPool = {
    connect: async () => ({
      query: async (sql, params) => {
        queries.push(sql)
        if (sql === "BEGIN" || sql === "SET TRANSACTION READ ONLY" || sql === "ROLLBACK") return {}
        if (sql.includes("case_number_reservations")) {
          return {
            rowCount: 1,
            rows: [{ reservation_key: params[0], case_number: "PRV.260714.707", status: "reserved" }]
          }
        }
        throw new Error("Unexpected query")
      },
      release: () => {}
    }),
    end: async () => {}
  }
  require.cache[require.resolve("pg")].exports.Pool = function() { return mockPool }

  t.after(() => {
    require.cache[require.resolve("pg")].exports.Pool = RealPool
    if (oldMode !== undefined) process.env.CASE_NUMBER_RESERVATION_MODE = oldMode
    else delete process.env.CASE_NUMBER_RESERVATION_MODE
    if (oldUrl !== undefined) process.env.EXTERNAL_STATE_DATABASE_URL = oldUrl
    else delete process.env.EXTERNAL_STATE_DATABASE_URL
  })

  const comparisonArgv = ["--identity", h.argv[1], "--base-plan", h.argv[3], "--content-root", h.argv[5], "--comparison-output-dir", tempDir, "--expected-plan-sha256", h.argv[11]]
  await main({ argv: comparisonArgv, output() {} })

  // Verificar que nenhuma query de escrita foi executada
  const writeQueries = queries.filter(q =>
    q.toUpperCase().includes("INSERT") ||
    q.toUpperCase().includes("UPDATE") ||
    q.toUpperCase().includes("DELETE") ||
    q.toUpperCase().includes("ALTER") ||
    q.toUpperCase().includes("DROP") ||
    q.toUpperCase().includes("CREATE")
  )

  assert.equal(writeQueries.length, 0)
})

test("comparison mode: quatro hashes hex64 em sucesso", async t => {
  mockPostgres(t)
  const h = await harness(); t.after(() => fs.rm(h.root, { recursive: true, force: true }))
  const tempDir = path.join(os.tmpdir(), `comparison-${Date.now()}`)
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }))

  const comparisonArgv = ["--identity", h.argv[1], "--base-plan", h.argv[3], "--content-root", h.argv[5], "--comparison-output-dir", tempDir, "--expected-plan-sha256", h.argv[11]]
  const report = await main({ argv: comparisonArgv, output() {} })

  assert.match(report.generated.planHash, /^[a-f0-9]{64}$/)
  assert.match(report.generated.manifestHash, /^[a-f0-9]{64}$/)
  assert.match(report.generated.authorizablePlanHash, /^[a-f0-9]{64}$/)
  assert.match(report.generated.reservationEvidenceHash, /^[a-f0-9]{64}$/)
})
