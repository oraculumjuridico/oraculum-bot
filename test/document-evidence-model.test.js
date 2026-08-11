"use strict"

const assert = require("node:assert/strict")
const {
  DOCUMENT_EVIDENCE_CONTRACT_VERSION,
  criarEvidenceId,
  normalizarContratoEvidencias,
  registrarEvidenciaDocumental,
  registrarConfirmacaoDocumental,
  registrarDivergenciaDocumental,
  registrarDecisaoDocumental
} = require("../src/domain/document-evidence-model")
const {
  normalizarEstadoDocumental,
  salvarEstadoDocumental
} = require("../src/domain/document-state-repository")

const SHA_A = "a".repeat(64)
const SHA_B = "b".repeat(64)
const NOW = "2026-08-08T18:00:00.000Z"

function evidencia(overrides = {}) {
  return {
    fileId: "file-image-1",
    sha256: SHA_A,
    mimeType: "image/jpeg",
    tipoDocumento: "RG frente",
    classificacao: { tipoDocumento: "RG frente", confianca: 0.9 },
    extracao: { camposExtraidos: { rg: "fixture-rg" } },
    coverage: ["front"],
    status: "analyzed",
    version: 1,
    ...overrides
  }
}

async function main() {
  const usuario = {
    docsEntregues: ["doc_existente"],
    docsParciais: [],
    docsAusentes: ["doc_pendente"],
    docsDispensados: []
  }
  const snapshotUsuario = JSON.stringify(usuario)

  let registry = normalizarContratoEvidencias({ documentos: [{ registryId: "legado" }] })
  assert.equal(registry.evidenceContractVersion, DOCUMENT_EVIDENCE_CONTRACT_VERSION)
  assert.deepEqual(registry.evidencias, [])
  assert.deepEqual(registry.confirmacoes, [])
  assert.deepEqual(registry.decisoes, [])

  registry = registrarEvidenciaDocumental(registry, evidencia())
  assert.equal(registry.evidencias.length, 1)
  assert.equal(registry.evidencias[0].evidenceId, "file-image-1")
  assert.equal(registry.evidencias[0].pageNumber, null)
  assert.deepEqual(registry.evidencias[0].arquivoFisico, {
    fileId: "file-image-1", sha256: SHA_A, mimeType: "image/jpeg"
  })

  const pageId = criarEvidenceId("file-pdf-1", 2)
  assert.equal(pageId, "file-pdf-1#page=2")
  assert.equal(criarEvidenceId("file-pdf-1", 2), pageId)
  registry = registrarEvidenciaDocumental(registry, evidencia({
    fileId: "file-pdf-1", sha256: SHA_B, mimeType: "image/png", pageNumber: 2,
    evidenceId: pageId, coverage: ["back"]
  }))
  assert.equal(registry.evidencias.at(-1).unidadeLogica.pageNumber, 2)

  registry = registrarEvidenciaDocumental(registry, evidencia({
    fileId: "file-image-copy", sha256: SHA_A
  }))
  const sameContent = registry.evidencias.filter(item => item.sha256 === SHA_A)
  assert.equal(sameContent.length, 2)
  assert.notEqual(sameContent[0].evidenceId, sameContent[1].evidenceId)

  registry = registrarEvidenciaDocumental(registry, evidencia({
    version: 2,
    classificacao: { tipoDocumento: "RG frente", confianca: 0.95 }
  }))
  assert.equal(registry.evidencias.filter(item => item.evidenceId === "file-image-1").length, 2)
  assert.deepEqual(
    registry.evidencias.filter(item => item.evidenceId === "file-image-1").map(item => item.version),
    [1, 2]
  )

  const antesRepeticao = registry.evidencias.length
  registry = registrarEvidenciaDocumental(registry, evidencia())
  assert.equal(registry.evidencias.length, antesRepeticao)

  registry = registrarConfirmacaoDocumental(registry, {
    fileId: "file-image-1",
    data: NOW,
    origem: "fixture_confirmation",
    assertion: "attachment_confirmed",
    telefone: "nao_deve_persistir",
    token: "nao_deve_persistir",
    nome: "nao_deve_persistir",
    cpf: "nao_deve_persistir"
  })
  assert.equal(registry.confirmacoes.length, 1)
  assert.equal(registry.confirmacoes[0].fileId, "file-image-1")
  assert.equal(Object.hasOwn(registry.confirmacoes[0], "telefone"), false)
  assert.equal(Object.hasOwn(registry.confirmacoes[0], "token"), false)
  assert.equal(Object.hasOwn(registry.confirmacoes[0], "nome"), false)
  assert.equal(Object.hasOwn(registry.confirmacoes[0], "cpf"), false)

  registry = registrarConfirmacaoDocumental(registry, {
    fileId: "file-image-1",
    data: "2026-08-08T18:01:00.000Z",
    origem: "fixture_confirmation",
    assertion: "attachment_confirmed"
  })
  assert.equal(registry.confirmacoes.length, 1)
  assert.equal(registry.confirmacoes[0].data, NOW)

  assert.throws(
    () => registrarConfirmacaoDocumental(registry, {
      fileId: "file-inexistente", data: NOW, origem: "fixture_confirmation"
    }),
    error => error.code === "DOCUMENT_CONFIRMATION_FILE_NOT_FOUND"
  )

  registry = registrarDivergenciaDocumental(registry, {
    code: "IDENTITY_CONFLICT",
    evidenceIds: ["file-image-1", "file-image-copy"],
    createdAt: NOW,
    details: { preview: Buffer.from("nao persistir") }
  })
  assert.equal(registry.divergencias.filter(item => item.divergenceId).length, 1)

  registry = registrarDecisaoDocumental(registry, {
    requirementId: "fixture_requirement",
    revision: 1,
    status: "not_promoted",
    evidenceIds: ["file-image-1"],
    confirmationIds: [registry.confirmacoes[0].confirmationId],
    reasonCode: "fixture_only",
    decidedAt: NOW
  })
  assert.equal(registry.decisoes.length, 1)

  registry = registrarEvidenciaDocumental(registry, evidencia({
    fileId: "file-buffer-test",
    classificacao: { tipoDocumento: "RG frente", imagem: Buffer.from("classificacao") },
    extracao: { camposExtraidos: {}, bruto: Buffer.from("extracao") }
  }))
  const serialized = JSON.stringify(registry)
  assert.equal(serialized.includes('"type":"Buffer"'), false)
  assert.equal(serialized.includes("classificacao"), true)
  assert.equal(serialized.includes("extracao"), true)

  const estadoLegado = normalizarEstadoDocumental({
    version: 1,
    updatedAt: NOW,
    registry: { documentos: [{ registryId: "documento-antigo" }] }
  }, { now: NOW })
  assert.deepEqual(estadoLegado.registry.documentos, [{ registryId: "documento-antigo" }])
  assert.deepEqual(estadoLegado.registry.evidencias, [])
  assert.deepEqual(estadoLegado.registry.confirmacoes, [])
  assert.deepEqual(estadoLegado.registry.decisoes, [])

  let persisted
  const saved = await salvarEstadoDocumental("folder-fixture", { registry }, {
    now: NOW,
    salvarJsonEmSubpastaDrive: async (_folder, _subfolder, _name, data) => {
      persisted = JSON.parse(JSON.stringify(data))
      return { id: "state-fixture", name: "document-state.json" }
    }
  })
  assert.equal(saved.estado.registry.evidencias.length, registry.evidencias.length)
  assert.equal(JSON.stringify(persisted).includes('"type":"Buffer"'), false)

  assert.equal(JSON.stringify(usuario), snapshotUsuario)
  console.log("document-evidence-model.test.js: ok")
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
