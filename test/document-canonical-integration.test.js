"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { processarAnaliseDocumentalPosUpload } = require("../src/domain/document-analysis-integration")
const { confirmCanonicalDocument } = require("../src/domain/document-canonical-service")
const { projectDocumentDecision } = require("../src/domain/document-checklist-projection")
const { marcarStatusDocumento } = require("../src/domain/documents-core")
const { PostHumanCycleRepository } = require("../src/domain/post-human-cycle-model")
const { reevaluatePostHumanForDecision } = require("../src/domain/post-human-document-reevaluation")
const { processPostHumanCycle } = require("../src/domain/post-human-flow")

function pdfFixture(pageCount = 2) {
  const kids = []
  const pageObjects = []
  for (let index = 0; index < pageCount; index++) {
    const pageObject = 3 + index * 2
    const contentObject = pageObject + 1
    kids.push(`${pageObject} 0 R`)
    pageObjects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << >> /Contents ${contentObject} 0 R >>`,
      `<< /Length 27 >>\nstream\n0 0 0 rg ${30 + index} 80 240 40 re f\nendstream`
    )
  }
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pageCount} >>`,
    ...pageObjects
  ]
  let output = "%PDF-1.4\n"
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output))
    output += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(output)
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let index = 1; index <= objects.length; index++) {
    output += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`
  }
  return Buffer.from(output + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
}

function memoryDrive() {
  const files = new Map()
  return {
    files,
    lerJsonEmSubpastaDrive: async (_folder, _subfolder, filename) => ({ dados: files.get(filename) || null }),
    salvarJsonEmSubpastaDrive: async (_folder, _subfolder, filename, data) => {
      files.set(filename, structuredClone(data))
      return { id: `${filename}-id`, name: filename, folderId: "admin-folder" }
    }
  }
}

function pipelineForPage(page) {
  return {
    preprocessamento: { avisos: [], erros: [] },
    ocr: { textoCompleto: page === 1 ? "RG FRENTE" : "RG VERSO", avisos: [], erros: [] },
    classificacao: { tipoDocumento: page === 1 ? "RG frente" : "RG verso", confianca: 0.96 },
    extracao: {
      camposExtraidos: { rg: "12.345.678-9", cpf: "529.982.247-25", nome: "CLIENTE FICTICIO" },
      avisos: [], erros: []
    }
  }
}

async function main() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "oraculum-canonical-integration-"))
  try {
    const drive = memoryDrive()
    const buffer = pdfFixture(2)
    let analyzedPages = 0
    const deps = {
      ...drive,
      executarPipelineDocumental: async () => pipelineForPage(++analyzedPages),
      agruparDocumentosProcessados: documentos => ({ documentosPessoais: documentos, avisos: [], erros: [] }),
      logDebug: () => {},
      logErro: () => {}
    }
    const analyzed = await processarAnaliseDocumentalPosUpload({
      pastaDriveId: "case-folder",
      arquivo: { id: "real-two-page-pdf", name: "identidade.pdf" },
      buffer,
      mimeType: "application/pdf",
      contexto: { partyRole: "titular" }
    }, deps)
    assert.equal(analyzed.ok, true)
    assert.equal(analyzedPages, 2)
    assert.deepEqual(analyzed.evidencias.map(item => item.evidenceId), [
      "real-two-page-pdf#page=1", "real-two-page-pdf#page=2"
    ])

    const confirmed = await confirmCanonicalDocument({
      pastaDriveId: "case-folder",
      fileId: "real-two-page-pdf",
      origem: "client_callback",
      now: "2026-08-08T15:00:00.000Z"
    }, deps)
    assert.equal(confirmed.ok, true)
    assert.equal(confirmed.decision.status, "delivered")
    assert.deepEqual(confirmed.decision.evidenceRefs.map(item => item.version), [1, 1])

    const usuario = {
      negocioId: "deal-1", contatoId: "contact-1", numeroCaso: "PRV.TEST.1",
      telefoneNormalizado: "5500000000000", listaDocumental: ["doc_rg"],
      docsEntregues: [], docsParciais: [], docsAusentes: ["doc_rg"]
    }
    const projection = projectDocumentDecision(usuario, confirmed.decision, marcarStatusDocumento)
    assert.equal(projection.changed, true)
    assert.deepEqual(usuario.docsEntregues, ["doc_rg"])
    assert.deepEqual(usuario.docsAusentes, [])

    const userFile = path.join(root, "usuario.json")
    await fs.promises.writeFile(userFile, JSON.stringify(usuario))
    const persistedUser = JSON.parse(await fs.promises.readFile(userFile, "utf8"))
    assert.deepEqual(persistedUser.docsEntregues, ["doc_rg"])

    const repository = new PostHumanCycleRepository({ file: path.join(root, "cycles.json"), mode: "local" })
    await repository.initialize()
    const cycle = await repository.createCycle(persistedUser)
    let unexpectedCreates = 0
    const originalCreateCycle = repository.createCycle.bind(repository)
    repository.createCycle = async (...args) => { unexpectedCreates++; return originalCreateCycle(...args) }
    let outbound = 0
    const reevaluated = await reevaluatePostHumanForDecision({
      usuario: persistedUser,
      decision: confirmed.decision,
      repository
    }, {
      processCycle: (currentCycle, currentUser) => processPostHumanCycle({
        cycle: currentCycle,
        usuario: currentUser,
        repository,
        deps: {
          resolverListaDocumental: () => [{ id: "doc_rg" }],
          camposComplementaresPendentes: () => [],
          isComplete: () => true,
          sendFree: async () => { outbound++; throw new Error("outbound nao esperado") },
          sendTemplate: async () => { outbound++; throw new Error("outbound nao esperado") }
        }
      })
    })
    assert.equal(reevaluated.processed, true)
    assert.equal(reevaluated.cycleId, cycle.cycleId)
    assert.equal((await repository.getCycle(cycle.cycleId)).status, "completed")
    assert.equal((await repository.getCycle(cycle.cycleId)).payload.documentDecisionClaims.doc_rg.state, "completed")
    assert.equal(unexpectedCreates, 0)
    assert.equal(outbound, 0)
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true })
  }
}

main().then(() => console.log("document-canonical-integration.test.js: ok")).catch(error => {
  console.error(error)
  process.exitCode = 1
})
