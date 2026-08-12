"use strict"

const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const {
  registrarEvidenciaDocumental,
  normalizarContratoEvidencias
} = require("../src/domain/document-evidence-model")
const { confirmAndDecide } = require("../src/domain/document-requirement-engine")
const { confirmCanonicalDocument } = require("../src/domain/document-canonical-service")
const {
  planejarSincronizacaoDocumentalHubSpot,
  sincronizarDocumentosHubSpot,
  aplicarDadosDocumentaisConfiaveisAoUsuario,
  validarContextoDocumentalHubSpot
} = require("../src/domain/document-hubspot-sync")
const { resolveComplementaryContext } = require("../src/domain/post-human-complementary-fields")

const NOW = "2026-08-08T18:00:00.000Z"
const VALID_FIELDS = {
  nome: "Maria da Silva",
  cpf: "529.982.247-25",
  data_nascimento: "1990-02-03"
}

function addEvidence(registry, input = {}) {
  const fields = input.fields || VALID_FIELDS
  return registrarEvidenciaDocumental(registry, {
    fileId: input.fileId || "identity",
    sha256: input.sha256 || crypto.createHash("sha256").update(`${input.fileId || "identity"}:${input.version || 1}`).digest("hex"),
    tipoDocumento: input.tipoDocumento || "CNH",
    classificacao: { tipoDocumento: input.tipoDocumento || "CNH", confianca: input.classificationConfidence ?? 0.96 },
    extracao: {
      camposExtraidos: fields,
      confiancaPorCampo: Object.fromEntries(Object.keys(fields).map(field => [field, input.confidence ?? 0.96]))
    },
    coverage: input.coverage || [],
    partyRole: input.partyRole === undefined ? "titular" : input.partyRole,
    status: input.status || "analyzed",
    erros: input.erros || [],
    version: input.version || 1
  })
}

function delivered(input = {}) {
  let registry = addEvidence(normalizarContratoEvidencias({}), input)
  const result = confirmAndDecide(registry, {
    fileId: input.fileId || "identity",
    origem: "doc_cliente_anexar",
    assertion: input.assertion || "document_complete",
    data: NOW
  })
  return result
}

function syncInput(result, overrides = {}) {
  return {
    registry: result.registry,
    decision: result.decision,
    usuario: overrides.usuario || {},
    contato: overrides.contato || { id: "contact-1", properties: {} },
    negocio: overrides.negocio || { id: "deal-1", properties: { numero_de_caso: "PRV.260801.813" } }
  }
}

async function main() {
  const once = addEvidence(normalizarContratoEvidencias({}), { fileId: "same-document" })
  const twice = addEvidence(once, { fileId: "same-document" })
  assert.equal(twice.evidencias.length, 1)
  const base = delivered()
  assert.equal(validarContextoDocumentalHubSpot({
    usuario: { contatoId: "contact-1", negocioId: "deal-1", numeroCaso: "PRV.260801.813" },
    contato: { id: "contact-1" },
    negocio: { id: "deal-1", properties: { numero_de_caso: " prv.260801.813 " } },
    associatedContactIds: ["contact-1"]
  }).ok, true)
  assert.equal(validarContextoDocumentalHubSpot({
    usuario: { contatoId: "contact-1", negocioId: "deal-1", numeroCaso: "PRV.260801.813" },
    contato: { id: "contact-1" },
    negocio: { id: "deal-1", properties: { numero_de_caso: "PRV.260801.813" } },
    associatedContactIds: ["contact-1", "third-party"]
  }).reason, "contact_deal_association_mismatch")
  assert.equal(base.decision.status, "delivered")
  const plan = planejarSincronizacaoDocumentalHubSpot(syncInput(base), { now: NOW })
  assert.deepEqual(plan.contato.props, {
    cpf_do_cliente: "52998224725",
    date_of_birth: "1990-02-03",
    firstname: "Maria",
    lastname: "da Silva"
  })
  assert.deepEqual(plan.negocio.props, {})
  assert.ok(plan.auditoria.every(item => item.origemDocumental.evidenceRefs.every(ref =>
    ref.evidenceId && ref.version === 1 && /^[a-f0-9]{64}$/.test(ref.sha256))))

  let calls = 0
  let written = {}
  const first = await sincronizarDocumentosHubSpot(syncInput(base), {
    hsAtualizarContato: async (id, props) => { calls++; assert.equal(id, "contact-1"); written = props; return id },
    hsAtualizarNegocio: async () => { throw new Error("Deal must not be written") }
  }, { now: NOW })
  assert.equal(first.ok, true)
  assert.equal(calls, 1)
  assert.equal(first.registry.metadados.hubspotDocumentSync.operacoes.length, 4)
  assert.ok(first.registry.metadados.hubspotDocumentSync.operacoes.every(item =>
    item.outcome === "applied" && item.evidenceRefs[0].sha256 && !("value" in item)))
  assert.equal(JSON.stringify(first.registry).includes("Buffer"), false)

  const user = {
    whatsappContato: "5585999999999", email: "maria@example.test", cidade: "Fortaleza", uf: "CE",
    area: "INSS", tipo: "incapacidade", descricao: "Caso previdenciario", beneficio: "auxilio",
    motivo: "incapacidade", situacao: "pedido inicial"
  }
  assert.deepEqual(aplicarDadosDocumentaisConfiaveisAoUsuario(user, first.trustedUserPatch), {
    nome: "Maria da Silva", cpf: "52998224725", dataNascimento: "1990-02-03"
  })
  const complementary = resolveComplementaryContext({
    usuario: user,
    contact: { id: "contact-1", dealIds: ["deal-1"], loaded: true, properties: written },
    deal: { id: "deal-1", loaded: true, properties: {} },
    expectedContactId: "contact-1", expectedDealId: "deal-1"
  })
  assert.equal(complementary.camposCadastraisPendentes.includes("nomeCompleto"), false)
  assert.equal(complementary.camposCadastraisPendentes.includes("cpf"), false)
  assert.equal(complementary.camposCadastraisPendentes.includes("dataNascimento"), false)

  const repeated = await sincronizarDocumentosHubSpot(syncInput({ ...base, registry: first.registry }), {
    hsAtualizarContato: async () => { throw new Error("idempotent sync must not PATCH") }
  })
  assert.equal(repeated.ok, true)
  assert.equal(repeated.plano.contato.idempotente, true)

  const equal = planejarSincronizacaoDocumentalHubSpot(syncInput(base, {
    contato: { id: "contact-1", properties: written }
  }))
  assert.deepEqual(equal.contato.props, {})
  assert.ok(equal.auditoria.every(item => item.outcome === "equal"))

  const simpleName = delivered({ fields: { nome: "Maria" } })
  assert.deepEqual(planejarSincronizacaoDocumentalHubSpot(syncInput(simpleName)).contato.props, {
    firstname: "Maria"
  })
  const compoundName = delivered({ fields: { nome: "Maria da Silva" } })
  assert.deepEqual(planejarSincronizacaoDocumentalHubSpot(syncInput(compoundName)).contato.props, {
    firstname: "Maria", lastname: "da Silva"
  })
  assert.deepEqual(planejarSincronizacaoDocumentalHubSpot(syncInput(compoundName, {
    contato: { id: "contact-1", properties: { firstname: "Maria", lastname: "da Silva" } }
  })).contato.props, {})
  assert.deepEqual(planejarSincronizacaoDocumentalHubSpot(syncInput(compoundName, {
    contato: { id: "contact-1", properties: { firstname: "Maria", lastname: "" } }
  })).contato.props, { lastname: "da Silva" })
  assert.deepEqual(planejarSincronizacaoDocumentalHubSpot(syncInput(compoundName, {
    contato: { id: "contact-1", properties: { firstname: "", lastname: "da Silva" } }
  })).contato.props, { firstname: "Maria" })
  const divergentName = planejarSincronizacaoDocumentalHubSpot(syncInput(compoundName, {
    contato: { id: "contact-1", properties: { firstname: "Joana", lastname: "" }, camposValidadosManualmente: ["firstname"] }
  }))
  assert.equal(divergentName.contato.props.firstname, undefined)
  assert.equal(divergentName.contato.props.lastname, undefined)

  const manual = planejarSincronizacaoDocumentalHubSpot(syncInput(base, {
    contato: { id: "contact-1", properties: {}, camposValidadosManualmente: ["cpf_do_cliente"] }
  }))
  assert.equal(manual.contato.props.cpf_do_cliente, undefined)
  assert.ok(manual.bloqueados.some(item => item.motivo === "manual_validado"))

  const existingConflict = planejarSincronizacaoDocumentalHubSpot(syncInput(base, {
    contato: { id: "contact-1", properties: { cpf_do_cliente: "11144477735" } }
  }), { now: NOW })
  assert.equal(existingConflict.contato.props.cpf_do_cliente, undefined)
  assert.ok(existingConflict.registry.divergencias.some(item => item.code === "hubspot_document_existing_value_conflict"))
  assert.equal(JSON.stringify(existingConflict.registry.divergencias).includes("11144477735"), false)

  const userConflict = planejarSincronizacaoDocumentalHubSpot(syncInput(base, {
    usuario: { cpf: "11144477735" }
  }), { now: NOW })
  assert.equal(userConflict.contato.props.cpf_do_cliente, undefined)
  assert.ok(userConflict.registry.divergencias.some(item => item.code === "hubspot_document_user_conflict"))

  const low = delivered({ confidence: 0.5 })
  const lowPlan = planejarSincronizacaoDocumentalHubSpot(syncInput(low))
  assert.deepEqual(lowPlan.contato.props, {})
  assert.ok(lowPlan.bloqueados.every(item => item.motivo === "confidence_below_existing_threshold"))
  const lowClassification = delivered({ classificationConfidence: 0.4 })
  assert.equal(lowClassification.decision.status, "review")
  const sufficientClassification = delivered({ classificationConfidence: 0.9 })
  assert.equal(sufficientClassification.decision.status, "delivered")

  const thirdParty = delivered({ partyRole: "terceiro" })
  const thirdPartyPlan = planejarSincronizacaoDocumentalHubSpot(syncInput(thirdParty), { now: NOW })
  assert.deepEqual(thirdPartyPlan.contato.props, {})
  assert.equal(thirdPartyPlan.bloqueados[0].motivo, "canonical_decision_in_review")

  const partialDecision = { ...base.decision, status: "partial" }
  const partialPlan = planejarSincronizacaoDocumentalHubSpot(syncInput({ ...base, decision: partialDecision }))
  assert.equal(partialPlan.contato.props.cpf_do_cliente, "52998224725")
  const reviewDecision = { ...base.decision, status: "review", divergenceIds: ["div-1"] }
  assert.equal(planejarSincronizacaoDocumentalHubSpot(syncInput({ ...base, decision: reviewDecision })).bloqueados[0].motivo, "canonical_decision_in_review")
  const legacyDecision = { ...base.decision, evidenceRefs: [] }
  assert.equal(planejarSincronizacaoDocumentalHubSpot(syncInput({ ...base, decision: legacyDecision })).bloqueados[0].motivo, "legacy_decision_without_versioned_refs")

  let changedVersionRegistry = addEvidence(base.registry, {
    fileId: "identity", version: 2, sha256: "b".repeat(64), fields: { cpf: "111.444.777-35" }
  })
  const historicalPlan = planejarSincronizacaoDocumentalHubSpot(syncInput({ registry: changedVersionRegistry, decision: base.decision }))
  assert.equal(historicalPlan.contato.props.cpf_do_cliente, "52998224725")

  let divergent = addEvidence(normalizarContratoEvidencias({}), {
    fileId: "front", tipoDocumento: "RG frente", fields: { rg: "123", cpf: "529.982.247-25", nome: "Maria da Silva" }
  })
  divergent = confirmAndDecide(divergent, { fileId: "front", origem: "test", data: NOW }).registry
  divergent = addEvidence(divergent, {
    fileId: "back", tipoDocumento: "RG verso", fields: { rg: "123", cpf: "111.444.777-35", nome: "Maria da Silva" }
  })
  const cpfDivergent = confirmAndDecide(divergent, { fileId: "back", origem: "test", data: NOW })
  assert.equal(cpfDivergent.decision.status, "review")
  assert.ok(cpfDivergent.registry.divergencias.some(item => item.code === "cpf_mismatch"))
  const cpfDivergentPlan = planejarSincronizacaoDocumentalHubSpot(syncInput(cpfDivergent), { now: NOW })
  assert.deepEqual(cpfDivergentPlan.contato.props, {})
  assert.equal(cpfDivergentPlan.bloqueados[0].motivo, "canonical_decision_in_review")

  let nameDivergent = addEvidence(normalizarContratoEvidencias({}), {
    fileId: "name-front", tipoDocumento: "RG frente", fields: { rg: "456", nome: "Maria da Silva" }
  })
  nameDivergent = confirmAndDecide(nameDivergent, { fileId: "name-front", origem: "test", data: NOW }).registry
  nameDivergent = addEvidence(nameDivergent, {
    fileId: "name-back", tipoDocumento: "RG verso", fields: { rg: "456", nome: "Joana de Souza" }
  })
  const nameResult = confirmAndDecide(nameDivergent, { fileId: "name-back", origem: "test", data: NOW })
  assert.deepEqual(planejarSincronizacaoDocumentalHubSpot(syncInput(nameResult), { now: NOW }).contato.props, {})

  const failed = await sincronizarDocumentosHubSpot(syncInput(base), { hsAtualizarContato: async () => null })
  assert.equal(failed.ok, false)
  assert.equal(failed.registry.metadados?.hubspotDocumentSync?.operacoes?.length || 0, 0)
  let retryCalls = 0
  const retried = await sincronizarDocumentosHubSpot(syncInput({ ...base, registry: failed.registry }), {
    hsAtualizarContato: async id => { retryCalls++; return id }
  })
  assert.equal(retried.ok, true)
  assert.equal(retryCalls, 1)

  let concurrentCalls = 0
  const slowUpdater = async id => {
    concurrentCalls++
    await new Promise(resolve => setTimeout(resolve, 20))
    return id
  }
  const concurrent = await Promise.all([
    sincronizarDocumentosHubSpot(syncInput(base), { hsAtualizarContato: slowUpdater }),
    sincronizarDocumentosHubSpot(syncInput(base), { hsAtualizarContato: slowUpdater })
  ])
  assert.equal(concurrentCalls, 1)
  assert.equal(concurrent[0], concurrent[1])

  const noFields = delivered({ fields: { rg: "123456" } })
  const noFieldsResult = await sincronizarDocumentosHubSpot(syncInput(noFields), {
    hsAtualizarContato: async () => { throw new Error("no mapped fields must not PATCH") }
  })
  assert.equal(noFieldsResult.ok, true)
  assert.deepEqual(noFieldsResult.plano.contato.props, {})

  let persistedState = {
    version: 1,
    registry: addEvidence(normalizarContratoEvidencias({}), { fileId: "integration-file" })
  }
  const stateDeps = {
    carregarEstadoDocumental: async () => persistedState,
    atualizarEstadoDocumental: async (_folder, partial) => {
      persistedState = { ...persistedState, ...partial }
      return { arquivo: { id: "document-state" }, estado: persistedState }
    }
  }
  const confirmed = await confirmCanonicalDocument({
    pastaDriveId: "case-folder", fileId: "integration-file", origem: "doc_cliente_anexar",
    assertion: "document_complete", now: NOW
  }, stateDeps)
  assert.equal(confirmed.ok, true)
  const integrationUser = {
    contatoId: "contact-1", negocioId: "deal-1", numeroCaso: "PRV.260801.813",
    whatsappContato: "5585999999999", email: "maria@example.test", cidade: "Fortaleza", uf: "CE",
    area: "INSS", tipo: "incapacidade", descricao: "Caso previdenciario", beneficio: "auxilio",
    motivo: "incapacidade", situacao: "pedido inicial"
  }
  const integrationContact = { id: "contact-1", properties: {} }
  const integrationDeal = { id: "deal-1", properties: { numero_de_caso: "PRV.260801.813" } }
  assert.equal(validarContextoDocumentalHubSpot({
    usuario: integrationUser, contato: integrationContact, negocio: integrationDeal,
    associatedContactIds: ["contact-1"]
  }).ok, true)
  const integratedSync = await sincronizarDocumentosHubSpot({
    registry: confirmed.registry, decision: confirmed.decision, usuario: integrationUser,
    contato: integrationContact, negocio: integrationDeal
  }, {
    hsAtualizarContato: async (id, props) => {
      assert.equal(id, "contact-1")
      integrationContact.properties = { ...integrationContact.properties, ...props }
      return id
    }
  }, { now: NOW })
  await stateDeps.atualizarEstadoDocumental("case-folder", { registry: integratedSync.registry })
  aplicarDadosDocumentaisConfiaveisAoUsuario(integrationUser, integratedSync.trustedUserPatch)
  assert.equal(persistedState.registry.metadados.hubspotDocumentSync.operacoes.length, 4)
  const integratedQuestions = resolveComplementaryContext({
    usuario: integrationUser,
    contact: { ...integrationContact, loaded: true, dealIds: ["deal-1"] },
    deal: { ...integrationDeal, loaded: true },
    expectedContactId: "contact-1", expectedDealId: "deal-1"
  })
  assert.equal(integratedQuestions.camposCadastraisPendentes.some(field =>
    ["nomeCompleto", "cpf", "dataNascimento"].includes(field)), false)
}

main().then(() => console.log("document-canonical-hubspot-sync.test.js: ok")).catch(error => {
  console.error(error)
  process.exitCode = 1
})
