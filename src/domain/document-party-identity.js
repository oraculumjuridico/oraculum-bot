"use strict"

const { normalizeCpfHubSpot } = require("./hubspot-contract")

const MIN_PAIRED_BACK_CLASSIFICATION_CONFIDENCE = 0.85

function text(value) {
  return String(value || "").trim()
}

function normalized(value) {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ")
}

function digits(value) {
  return text(value).replace(/\D/g, "")
}

function field(source = {}, aliases = []) {
  const entries = Object.entries(source || {})
  return entries.find(([key]) => aliases.includes(normalized(key)))?.[1] || null
}

function identityFromFields(source = {}) {
  return {
    cpf: normalizeCpfHubSpot(field(source, ["cpf", "numero cpf"])) || "",
    rg: normalized(field(source, ["rg", "numero rg", "registro geral"])).replace(/[^a-z0-9]/g, ""),
    nome: normalized(field(source, ["nome", "nome completo", "titular"])),
    nascimento: digits(field(source, ["data nascimento", "data de nascimento", "nascimento", "datanascimento"]))
  }
}

function identityFromUser(usuario = {}) {
  return {
    cpf: normalizeCpfHubSpot(usuario.cpf || usuario.cpfCliente || usuario.cpf_do_cliente) || "",
    rg: normalized(usuario.rg || usuario.numeroRg || usuario.numero_rg).replace(/[^a-z0-9]/g, ""),
    nome: normalized(usuario.nome || usuario.nomeCompleto),
    nascimento: digits(usuario.dataNascimento || usuario.data_nascimento || usuario.date_of_birth)
  }
}

function compareIdentity(candidate, trusted) {
  const cpfComparable = Boolean(candidate.cpf && trusted.cpf)
  const rgComparable = Boolean(candidate.rg && trusted.rg)
  if (cpfComparable && candidate.cpf !== trusted.cpf) {
    return { status: "terceiro", reasonCode: "cpf_mismatch" }
  }
  if (rgComparable && candidate.rg !== trusted.rg) {
    return { status: "terceiro", reasonCode: "rg_mismatch" }
  }
  if (cpfComparable) return { status: "titular", reasonCode: "cpf_match" }
  if (rgComparable) return { status: "titular", reasonCode: "rg_match" }
  if (candidate.nome && candidate.nascimento && trusted.nome && trusted.nascimento) {
    return candidate.nome === trusted.nome && candidate.nascimento === trusted.nascimento
      ? { status: "titular", reasonCode: "name_birth_match" }
      : { status: "terceiro", reasonCode: "name_birth_mismatch" }
  }
  return { status: "indeterminado", reasonCode: "strong_identity_insufficient" }
}

function trustedRegistryIdentities(registry = {}) {
  return (registry.evidencias || [])
    .filter(item => normalized(item.partyRole) === "titular" && !["review", "error", "erro", "quarantined"].includes(normalized(item.status)))
    .map(item => identityFromFields(item.extracao?.camposExtraidos || {}))
}

function evidenceKey(evidence = {}) {
  return `${evidence.evidenceId}:${Number(evidence.version)}:${evidence.sha256 || ""}`
}

function confirmedEvidenceKeys(registry = {}) {
  const keys = new Set()
  for (const confirmation of registry.confirmacoes || []) {
    for (const ref of confirmation.evidenceRefs || []) keys.add(evidenceKey(ref))
  }
  return keys
}

function hasOpenDivergence(registry = {}, evidenceId) {
  return (registry.divergencias || []).some(item =>
    item.status !== "resolved" && (item.evidenceIds || []).includes(evidenceId))
}

function hasConfirmedTrustedFront(registry = {}, requirementId = "doc_rg") {
  const confirmed = confirmedEvidenceKeys(registry)
  return (registry.evidencias || []).some(evidence => {
    const kind = normalized(evidence.tipoDocumento || evidence.classificacao?.tipoDocumento)
    const scopedRequirement = evidence.requirementId || (kind === "rg frente" ? "doc_rg" : null)
    return kind === "rg frente" && scopedRequirement === requirementId &&
      normalized(evidence.partyRole) === "titular" && normalized(evidence.status) === "analyzed" &&
      Number(evidence.classificacao?.confianca || 0) >= MIN_PAIRED_BACK_CLASSIFICATION_CONFIDENCE &&
      confirmed.has(evidenceKey(evidence)) && !hasOpenDivergence(registry, evidence.evidenceId)
  })
}

function resolveDocumentPartyIdentity({
  extraction = {}, trustedUser = {}, registry = {}, documentType = null,
  classificationConfidence = 0, requirementId = null, allowExactNameMatch = false
} = {}) {
  const candidate = identityFromFields(extraction.camposExtraidos || extraction)
  const trusted = [identityFromUser(trustedUser), ...trustedRegistryIdentities(registry)]
  let confirmedMatch = null
  for (const identity of trusted) {
    const result = compareIdentity(candidate, identity)
    if (result.status === "terceiro") return result
    if (result.status === "titular" && !confirmedMatch) confirmedMatch = result
  }
  if (confirmedMatch) return confirmedMatch
  if (allowExactNameMatch && candidate.nome && candidate.nome.split(" ").length >= 2 &&
      trusted.some(identity => identity.nome && identity.nome === candidate.nome)) {
    return { status: "titular", reasonCode: "pilot_guided_exact_full_name_match" }
  }
  const kind = normalized(documentType)
  if (kind === "rg verso" && requirementId === "doc_rg" &&
      Number(classificationConfidence) >= MIN_PAIRED_BACK_CLASSIFICATION_CONFIDENCE &&
      hasConfirmedTrustedFront(registry, requirementId)) {
    return { status: "scoped_pair_candidate", reasonCode: "confirmed_trusted_front_available" }
  }
  return {
    status: "indeterminado",
    reasonCode: "strong_identity_insufficient"
  }
}

module.exports = {
  MIN_PAIRED_BACK_CLASSIFICATION_CONFIDENCE,
  identityFromFields,
  identityFromUser,
  compareIdentity,
  resolveDocumentPartyIdentity,
  hasConfirmedTrustedFront
}
