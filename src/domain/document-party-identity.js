"use strict"

const { normalizeCpfHubSpot } = require("./hubspot-contract")

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

function resolveDocumentPartyIdentity({ extraction = {}, trustedUser = {}, registry = {} } = {}) {
  const candidate = identityFromFields(extraction.camposExtraidos || extraction)
  const trusted = [identityFromUser(trustedUser), ...trustedRegistryIdentities(registry)]
  let sawComparable = false
  for (const identity of trusted) {
    const result = compareIdentity(candidate, identity)
    if (result.status === "titular") return result
    if (result.status === "terceiro") {
      sawComparable = true
      return result
    }
  }
  return {
    status: "indeterminado",
    reasonCode: sawComparable ? "identity_mismatch" : "strong_identity_insufficient"
  }
}

module.exports = {
  identityFromFields,
  identityFromUser,
  compareIdentity,
  resolveDocumentPartyIdentity
}
