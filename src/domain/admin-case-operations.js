"use strict"

const { normalizeCpfHubSpot, isPlaceholderValue } = require("./hubspot-contract")
const { normalizarNumeroWhatsAppEnvio } = require("./phone-name")
const { sanitizarTextoEntrada } = require("../utils/text")

const CONTACT_FIELDS = Object.freeze(new Set([
  "nome", "email", "cpf", "dataNascimento", "telefone", "endereco", "numeroEndereco",
  "complementoEndereco", "bairro", "cidade", "uf", "cep", "estadoCivil", "profissao",
  "situacaoProfissional", "apelido"
]))
const DEAL_FIELDS = Object.freeze(new Set([
  "area", "tipo", "situacao", "objetivo", "urgencia", "descricao", "acidenteTrabalho",
  "limitacoesAtuais", "motivoEncerramentoVinculo", "composicaoFamiliar", "rendaAtual",
  "beneficio", "dataRequerimento", "dataNegativa", "resultadoPericia", "conflitoInteresses"
]))

function normalizeSearch(value = "") {
  return sanitizarTextoEntrada(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

function maskName(value = "") {
  return sanitizarTextoEntrada(value).split(/\s+/).filter(Boolean).map(part => `${part[0] || "*"}${"*".repeat(Math.min(3, Math.max(1, part.length - 1)))}`).join(" ")
}

function maskLast4(value = "") {
  const digits = String(value || "").replace(/\D/g, "")
  return digits ? `***${digits.slice(-4)}` : "não informado"
}

function searchableCase(item = {}) {
  const u = item.u || item
  return {
    item,
    numeroCaso: sanitizarTextoEntrada(u.numeroCaso),
    nome: sanitizarTextoEntrada(u.nome || u.nomeWA || u.nomePerfilWhatsApp),
    cpf: normalizeCpfHubSpot(u.cpf || u._cpf),
    telefone: normalizarNumeroWhatsAppEnvio(u.whatsappContato || u._numero || item.from),
    dealId: sanitizarTextoEntrada(u.negocioId),
    contactId: sanitizarTextoEntrada(u.contatoId)
  }
}

function searchAdminCases(items = [], query = "") {
  const text = normalizeSearch(query)
  const cpf = normalizeCpfHubSpot(query)
  const phone = normalizarNumeroWhatsAppEnvio(query)
  if (!text) return []
  return (items || []).map(searchableCase).filter(record =>
    (record.numeroCaso && normalizeSearch(record.numeroCaso) === text) ||
    (cpf && record.cpf === cpf) ||
    (phone && record.telefone === phone) ||
    (record.nome && normalizeSearch(record.nome).includes(text))
  ).map(record => {
    const result = {
      dealId: record.dealId,
      contactId: record.contactId,
      numeroCaso: record.numeroCaso,
      nomeMascarado: maskName(record.nome),
      cpfMascarado: maskLast4(record.cpf),
      telefoneMascarado: maskLast4(record.telefone)
    }
    Object.defineProperty(result, "item", { value: record.item, enumerable: false })
    return result
  })
}

function buildCaseComplement({ usuario = {}, campo, valor, adminId, now = new Date().toISOString() } = {}) {
  const field = sanitizarTextoEntrada(campo)
  const cleanValue = sanitizarTextoEntrada(valor)
  if (!field || (!CONTACT_FIELDS.has(field) && !DEAL_FIELDS.has(field))) throw Object.assign(new Error("campo não permitido"), { code: "ADMIN_COMPLEMENT_FIELD_NOT_ALLOWED" })
  if (!cleanValue || isPlaceholderValue(cleanValue)) throw Object.assign(new Error("valor inválido"), { code: "ADMIN_COMPLEMENT_VALUE_INVALID" })
  if (!usuario.contatoId || !usuario.negocioId) throw Object.assign(new Error("caso sem identidade técnica"), { code: "ADMIN_COMPLEMENT_CASE_IDENTITY_MISSING" })
  const normalized = field === "cpf" ? normalizeCpfHubSpot(cleanValue) : cleanValue
  if (!normalized) throw Object.assign(new Error("valor inválido"), { code: "ADMIN_COMPLEMENT_VALUE_INVALID" })
  return {
    contactId: String(usuario.contatoId),
    dealId: String(usuario.negocioId),
    contactPatch: CONTACT_FIELDS.has(field) ? { [field]: normalized } : {},
    dealPatch: DEAL_FIELDS.has(field) ? { [field]: normalized } : {},
    localPatch: { [field]: normalized },
    historyEntry: { field, at: now, adminId: sanitizarTextoEntrada(adminId) || null },
    createsContact: false,
    createsDeal: false
  }
}

function applyComplementLocally(usuario = {}, operation = {}) {
  Object.assign(usuario, operation.localPatch || {})
  usuario.adminUpdateHistory = [...(Array.isArray(usuario.adminUpdateHistory) ? usuario.adminUpdateHistory : []), operation.historyEntry]
  return usuario
}

async function scheduleAdminCase({ usuario = {}, dataHora, duracaoMin = 60, createEvent } = {}) {
  const pending = {
    ok: false,
    pendingHuman: true,
    eventId: null,
    message: "Solicitação registrada, aguardando confirmação"
  }
  if (!usuario.negocioId || typeof createEvent !== "function") return pending
  try {
    const eventId = await createEvent(usuario, dataHora, duracaoMin, { origem: "whatsapp_admin" })
    if (!eventId) return pending
    return { ok: true, pendingHuman: false, eventId: String(eventId), message: "Agendamento confirmado" }
  } catch {
    return pending
  }
}

module.exports = {
  CONTACT_FIELDS,
  DEAL_FIELDS,
  maskName,
  maskLast4,
  searchAdminCases,
  buildCaseComplement,
  applyComplementLocally,
  scheduleAdminCase
}
