"use strict"

const {
  normalizarContratoEvidencias,
  registrarConfirmacaoDocumental,
  registrarDivergenciaDocumental,
  registrarDecisaoDocumental
} = require("./document-evidence-model")

const DOCUMENT_REQUIREMENT_MIN_CLASSIFICATION_CONFIDENCE = 0.85

function text(value) {
  return String(value || "").trim()
}

function normalized(value) {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

function digits(value) { return text(value).replace(/\D/g, "") }

function validCpf(value) {
  const cpf = digits(value)
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false
  const digit = length => {
    let sum = 0
    for (let index = 0; index < length; index++) sum += Number(cpf[index]) * (length + 1 - index)
    const result = (sum * 10) % 11
    return result === 10 ? 0 : result
  }
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10])
}

function fields(evidence = {}) {
  const source = evidence.extracao?.camposExtraidos || {}
  const find = aliases => Object.entries(source).find(([key]) => aliases.includes(normalized(key)))?.[1]
  const cpf = digits(find(["cpf", "numero cpf"]))
  return {
    rg: normalized(find(["rg", "numero rg", "registro geral"])).replace(/[^a-z0-9]/g, ""),
    cpf: validCpf(cpf) ? cpf : "",
    nome: normalized(find(["nome", "nome completo", "titular"])).replace(/\s+/g, " "),
    nascimento: digits(find(["data nascimento", "data de nascimento", "nascimento"])),
    partyRole: normalized(evidence.partyRole)
  }
}

function evidenceKey(evidence = {}) {
  return `${evidence.evidenceId}:${Number(evidence.version)}:${evidence.sha256 || ""}`
}

function confirmedEvidence(registry) {
  const confirmationsByEvidence = new Map()
  for (const confirmation of registry.confirmacoes) {
    let refs = confirmation.evidenceRefs || []
    if (!refs.length) {
      const oldestByEvidenceId = new Map()
      for (const evidence of registry.evidencias.filter(item => item.fileId === confirmation.fileId)) {
        const current = oldestByEvidenceId.get(evidence.evidenceId)
        if (!current || evidence.version < current.version) oldestByEvidenceId.set(evidence.evidenceId, evidence)
      }
      refs = [...oldestByEvidenceId.values()].map(item => ({
        evidenceId: item.evidenceId, version: item.version, sha256: item.sha256
      }))
    }
    for (const ref of refs) confirmationsByEvidence.set(evidenceKey(ref), confirmation)
  }
  const latestConfirmed = new Map()
  for (const evidence of registry.evidencias) {
    const confirmation = confirmationsByEvidence.get(evidenceKey(evidence))
    if (!confirmation) continue
    const current = latestConfirmed.get(evidence.evidenceId)
    if (!current || evidence.version > current.evidence.version) latestConfirmed.set(evidence.evidenceId, { evidence, confirmation })
  }
  return [...latestConfirmed.values()]
}

function documentKind(evidence) {
  return normalized(evidence.tipoDocumento || evidence.classificacao?.tipoDocumento)
}

function eligible(evidence) {
  const kind = documentKind(evidence)
  return ["rg frente", "rg verso", "rg", "cnh"].includes(kind) &&
    Number(evidence.classificacao?.confianca) >= DOCUMENT_REQUIREMENT_MIN_CLASSIFICATION_CONFIDENCE &&
    normalized(evidence.partyRole) === "titular" &&
    !["error", "erro", "quarantined", "review"].includes(normalized(evidence.status)) &&
    !(evidence.erros || []).length
}

function coverage(evidence) {
  const result = new Set((evidence.coverage || []).map(normalized))
  const kind = documentKind(evidence)
  if (kind === "rg frente") result.add("front")
  if (kind === "rg verso") result.add("back")
  return result
}

function strongIdentity(left, right) {
  const a = fields(left); const b = fields(right)
  if (a.partyRole && b.partyRole && a.partyRole !== b.partyRole) return { match: false, divergent: true, code: "party_role_mismatch" }
  const cpfComparable = Boolean(a.cpf && b.cpf)
  const rgComparable = Boolean(a.rg && b.rg)
  if (cpfComparable && a.cpf !== b.cpf) return { match: false, divergent: true, code: "cpf_mismatch" }
  if (rgComparable && a.rg !== b.rg) return { match: false, divergent: true, code: "rg_mismatch" }
  if (cpfComparable) return { match: true }
  if (rgComparable) return { match: true }
  if (a.nome && b.nome && a.nascimento && b.nascimento) {
    return a.nome === b.nome && a.nascimento === b.nascimento
      ? { match: true }
      : { match: false, divergent: true, code: "name_birth_mismatch" }
  }
  return { match: false, divergent: false, code: "identity_insufficient" }
}

function latestDecision(registry, requirementId) {
  return registry.decisoes
    .filter(item => item.requirementId === requirementId)
    .sort((a, b) => b.revision - a.revision)[0] || null
}

function sameMaterial(left, right) {
  const keys = ["status", "reasonCode", "evidenceIds", "evidenceRefs", "confirmationIds", "divergenceIds", "reviewIds"]
  return keys.every(key => JSON.stringify(left?.[key] || []) === JSON.stringify(right?.[key] || []))
}

function addDivergence(registry, code, evidenceIds, now) {
  const signature = [...evidenceIds].sort().join("|")
  const existing = registry.divergencias.find(item => item.code === code && [...(item.evidenceIds || [])].sort().join("|") === signature)
  if (existing) return { registry, divergence: existing }
  const updated = registrarDivergenciaDocumental(registry, { code, evidenceIds, status: "open", createdAt: now })
  return { registry: updated, divergence: updated.divergencias.find(item => item.code === code && [...(item.evidenceIds || [])].sort().join("|") === signature) }
}

function decideRg(registryInput = {}, options = {}) {
  let registry = normalizarContratoEvidencias(registryInput)
  const now = options.now || new Date().toISOString()
  const allConfirmedEntries = confirmedEvidence(registry)
  const identityKinds = new Set(["rg frente", "rg verso", "rg", "cnh"])
  const preexistingDivergenceIds = new Set()
  for (const entry of allConfirmedEntries) {
    const evidence = entry.evidence
    if (!identityKinds.has(documentKind(evidence))) continue
    let code = null
    if (Number(evidence.classificacao?.confianca) < DOCUMENT_REQUIREMENT_MIN_CLASSIFICATION_CONFIDENCE) {
      code = "document_classification_confidence_insufficient"
    } else if (normalized(evidence.partyRole) !== "titular") {
      code = normalized(evidence.partyRole) === "terceiro"
        ? "document_holder_identity_mismatch"
        : "document_holder_identity_unverified"
    }
    if (!code) continue
    const added = addDivergence(registry, code, [evidence.evidenceId], now)
    registry = added.registry
    if (added.divergence) preexistingDivergenceIds.add(added.divergence.divergenceId)
  }
  const confirmedEntries = allConfirmedEntries.filter(item => eligible(item.evidence))
  const evidences = confirmedEntries.map(item => item.evidence)
  const confirmations = new Map(confirmedEntries.map(item => [evidenceKey(item.evidence), item.confirmation]))
  const used = new Set()
  const confirmationIds = new Set()
  const divergenceIds = new Set(preexistingDivergenceIds)
  let delivered = false
  let partial = evidences.length > 0

  for (const evidence of evidences) {
    const confirmation = confirmations.get(evidenceKey(evidence))
    used.add(evidence.evidenceId); confirmationIds.add(confirmation.confirmationId)
    const ownCoverage = coverage(evidence)
    const completeAssertion = ["front_and_back_same_image", "document_complete", "digital_complete"]
      .includes(normalized(confirmation.assertion))
    if (completeAssertion && (documentKind(evidence).startsWith("rg") || documentKind(evidence) === "cnh")) delivered = true
    if (ownCoverage.has("digital_complete")) delivered = true
  }

  for (let leftIndex = 0; leftIndex < evidences.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < evidences.length; rightIndex++) {
      const left = evidences[leftIndex]; const right = evidences[rightIndex]
      const sides = new Set([...coverage(left), ...coverage(right)])
      if (!(sides.has("front") && sides.has("back"))) continue
      if (left.fileId !== right.fileId && left.sha256 === right.sha256) {
        const added = addDivergence(registry, "duplicate_binary_content", [left.evidenceId, right.evidenceId], now)
        registry = added.registry
        const divergence = added.divergence
        if (divergence) divergenceIds.add(divergence.divergenceId)
        continue
      }
      const identity = strongIdentity(left, right)
      if (identity.divergent) {
        const added = addDivergence(registry, identity.code, [left.evidenceId, right.evidenceId], now)
        registry = added.registry
        const divergence = added.divergence
        divergenceIds.add(divergence.divergenceId)
      } else if (identity.match) {
        delivered = true
        used.add(left.evidenceId); used.add(right.evidenceId)
        confirmationIds.add(confirmations.get(evidenceKey(left)).confirmationId)
        confirmationIds.add(confirmations.get(evidenceKey(right)).confirmationId)
      }
    }
  }

  const previous = latestDecision(registry, "doc_rg")
  if (previous?.status === "delivered" && previous.evidenceRefs?.length) {
    for (const previousRef of previous.evidenceRefs) {
      const current = evidences.find(item => item.evidenceId === previousRef.evidenceId &&
        (item.version !== previousRef.version || item.sha256 !== previousRef.sha256))
      if (!current) continue
      const added = addDivergence(registry, "confirmed_evidence_version_changed", [current.evidenceId], now)
      registry = added.registry
      if (added.divergence) divergenceIds.add(added.divergence.divergenceId)
    }
  }
  let candidate = divergenceIds.size
    ? { status: "review", reasonCode: "identity_divergence" }
    : delivered
      ? { status: "delivered", reasonCode: "confirmed_complete_identity" }
      : partial
        ? { status: "partial", reasonCode: "confirmed_incomplete" }
        : { status: "not_promoted", reasonCode: "confirmed_evidence_unavailable" }
  const preserveDelivered = previous?.status === "delivered" && candidate.status !== "delivered" && candidate.status !== "review"
  if (preserveDelivered) {
    candidate = { status: "delivered", reasonCode: "delivered_revision_preserved" }
  }
  const material = {
    ...candidate,
    evidenceIds: [...new Set([...(preserveDelivered ? previous.evidenceIds : []), ...used])].sort(),
    evidenceRefs: [...new Map([
      ...((preserveDelivered ? previous.evidenceRefs : []) || []),
      ...evidences.filter(item => used.has(item.evidenceId)).map(item => ({
        evidenceId: item.evidenceId, version: item.version, sha256: item.sha256
      }))
    ].map(ref => [`${ref.evidenceId}:${ref.version}:${ref.sha256 || ""}`, ref])).values()]
      .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId) || left.version - right.version),
    confirmationIds: [...new Set([...(preserveDelivered ? previous.confirmationIds : []), ...confirmationIds])].sort(),
    divergenceIds: [...new Set([...(preserveDelivered ? previous.divergenceIds || [] : []), ...divergenceIds])].sort(),
    reviewIds: preserveDelivered ? previous.reviewIds || [] : []
  }
  if (previous && sameMaterial(previous, material)) return { registry, decision: previous, created: false }
  const decision = {
    requirementId: "doc_rg", revision: (previous?.revision || 0) + 1, ...material, decidedAt: now
  }
  registry = registrarDecisaoDocumental(registry, decision)
  return { registry, decision, created: true }
}

function confirmAndDecide(registryInput = {}, input = {}) {
  const now = input.data || input.now || new Date().toISOString()
  let registry = registrarConfirmacaoDocumental(registryInput, {
    confirmationId: input.confirmationId,
    fileId: input.fileId,
    origem: input.origem,
    assertion: input.assertion,
    data: now
  })
  const result = decideRg(registry, { now })
  return result
}

module.exports = {
  DOCUMENT_REQUIREMENT_MIN_CLASSIFICATION_CONFIDENCE,
  confirmAndDecide,
  decideRg,
  strongIdentity,
  validCpf
}
