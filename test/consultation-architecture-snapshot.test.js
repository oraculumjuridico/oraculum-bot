const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const root = path.join(__dirname, "..")
const snapshot = JSON.parse(
  fs.readFileSync(path.join(root, "consultation-architecture-snapshot.json"), "utf8")
)
const facade = require("../src/domain/consultation")

function importsConsulta(arquivo) {
  const conteudo = fs.readFileSync(path.join(root, arquivo), "utf8")
  return [...new Set(
    [...conteudo.matchAll(/require\(["']([^"']+)["']\)/g)]
      .map(match => match[1])
      .filter(request => /domain\/consultation(?:$|[-/])/.test(request.replaceAll("\\", "/")))
  )].sort()
}

function main() {
  assert.equal(facade.CONSULTATION_VERSION, snapshot.consultationVersion)
  assert.equal(facade.eventModelHash(), snapshot.eventModelHash)
  assert.deepEqual(Object.keys(facade).sort(), [...snapshot.publicExports].sort())

  const importadores = {}
  for (const arquivo of ["server.js", ...fs.readdirSync(path.join(root, "scripts"))
    .filter(nome => nome.endsWith(".js"))
    .map(nome => `scripts/${nome}`), ...fs.readdirSync(path.join(root, "src", "scripts"))
    .filter(nome => nome.endsWith(".js"))
    .map(nome => `src/scripts/${nome}`)]) {
    const imports = importsConsulta(arquivo)
    if (imports.length) importadores[arquivo] = imports
  }
  assert.deepEqual(importadores, snapshot.externalImportWhitelist)

  for (const alvo of [
    "./src/domain/consultation-read-model",
    "./src/domain/calendar-scheduling",
    "./src/domain/consultation-events",
    "./src/domain/consultation-metrics"
  ]) {
    const tentativa = spawnSync(process.execPath, ["-e", `
      process.env.CONSULTATION_FIREWALL_MODE = "strict";
      require("./src/domain/consultation");
      require(${JSON.stringify(alvo)});
    `], { cwd: root, encoding: "utf8" })
    assert.notEqual(tentativa.status, 0, `firewall deveria bloquear ${alvo}`)
    assert.match(`${tentativa.stdout}${tentativa.stderr}`, /CONSULTATION_DEPENDENCY_FIREWALL|consultation-firewall/)
  }

  console.log("consultation-architecture-snapshot.test.js: ok")
}

main()
