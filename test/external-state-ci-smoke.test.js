const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const repository = require("../src/infrastructure/external-state-repository")

const managedEnvironment = [
  "NODE_ENV",
  "CI",
  "CI_SMOKE_TEST",
  "EXTERNAL_STATE_REQUIRED",
  "EXTERNAL_STATE_PROVIDER",
  "EXTERNAL_STATE_DATABASE_URL",
  "DATABASE_URL"
]
const originalEnvironment = Object.fromEntries(managedEnvironment.map(name => [name, process.env[name]]))
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oraculum-ci-smoke-"))

function setEnvironment(values) {
  for (const name of managedEnvironment) delete process.env[name]
  for (const [name, value] of Object.entries(values)) process.env[name] = value
}

async function expectMissingPersistenceFailure(environment) {
  setEnvironment({ ...environment, EXTERNAL_STATE_REQUIRED: "true" })
  await assert.rejects(
    repository.initializeExternalStateRepository({ directory: tempDir }),
    /persistencia externa obrigatoria mas nao configurada/
  )
}

;(async () => {
  setEnvironment({
    NODE_ENV: "test",
    CI: "true",
    CI_SMOKE_TEST: "true",
    EXTERNAL_STATE_REQUIRED: "true"
  })
  assert.deepEqual(
    await repository.initializeExternalStateRepository({ directory: tempDir }),
    { enabled: false, required: false, restoredFiles: 0 }
  )

  await expectMissingPersistenceFailure({ NODE_ENV: "production" })
  await expectMissingPersistenceFailure({ NODE_ENV: "test", CI: "true" })

  console.log("external-state-ci-smoke.test.js: ok")
})().finally(async () => {
  await repository.closeExternalStateRepository()
  for (const [name, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  fs.rmSync(tempDir, { recursive: true, force: true })
}).catch(error => {
  console.error(error)
  process.exitCode = 1
})
