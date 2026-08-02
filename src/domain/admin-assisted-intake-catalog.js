"use strict"

const { ESTADOS_EXTENSO, buscarPorCEP, buscarCidadePorNomeInteligente } = require("./geo-search")

const GENERIC_DOCUMENT = "Documentos existentes, ainda não identificados"
const REGISTRATION_STATUS = Object.freeze({ INITIAL: "cadastro_inicial", COMPLEMENTATION: "aguardando_complementacao", DOCUMENTS: "aguardando_documentos", REVIEW: "em_revisao_humana", COMPLETE: "cadastro_completo" })

const GENERAL_QUESTIONS = Object.freeze([
  { id: "nomeCompleto", group: "Identificação", priority: 10, required: true, admin: "Qual é o nome completo do cliente?", client: "Qual é o seu nome completo?", target: "contact", documentExtractable: true },
  { id: "telefone", group: "Contato", priority: 20, required: true, admin: "Qual é o telefone do cliente?", client: "Qual é o seu telefone?", target: "contact" },
  { id: "cidade", group: "Contato", priority: 21, required: true, admin: "Qual é a cidade ou o CEP do cliente?", client: "Qual é a sua cidade ou CEP?", target: "contact", documentExtractable: true },
  { id: "uf", group: "Contato", priority: 22, required: true, admin: "Qual é o estado (UF) do cliente?", client: "Qual é o seu estado (UF)?", target: "contact", documentExtractable: true },
  { id: "cpf", group: "Identificação", priority: 23, required: false, admin: "Qual é o CPF do cliente?", client: "Qual é o seu CPF?", target: "contact", documentExtractable: true },
  { id: "dataNascimento", group: "Identificação", priority: 24, required: false, admin: "Qual é a data de nascimento do cliente?", client: "Qual é a sua data de nascimento?", target: "contact", documentExtractable: true },
  { id: "areaJuridica", group: "Caso", priority: 25, required: true, admin: "Qual é a área jurídica do caso?", client: "Qual é a área do seu caso?", target: "deal" },
  { id: "tipoCaso", group: "Caso", priority: 26, required: true, admin: "Qual é o tipo da demanda?", client: "Qual é o tipo da sua demanda?", target: "deal" },
  { id: "descricao", group: "Caso", priority: 30, required: true, admin: "Descreva o problema jurídico principal.", client: "Conte resumidamente o que aconteceu.", target: "deal" },
  { id: "objetivo", group: "Caso", priority: 35, required: false, admin: "Qual é o objetivo do cliente?", client: "O que você pretende obter com o atendimento?", target: "deal" },
  { id: "urgencia", group: "Caso", priority: 40, required: false, admin: "Existe prazo ou urgência?", client: "Existe algum prazo ou risco urgente?", target: "deal", skippable: true },
  { id: "email", group: "Contato", priority: 60, required: false, admin: "Qual é o e-mail do cliente?", client: "Qual é o seu e-mail?", target: "contact", skippable: true }
])

const AREA_QUESTIONS = Object.freeze({
  INSS: [
    { id: "beneficio", required: true, admin: "Qual benefício ou requerimento está envolvido?", client: "Qual benefício ou requerimento está envolvido?" },
    { id: "motivo", required: true, admin: "Qual foi o motivo da decisão do INSS?", client: "Qual foi o motivo informado pelo INSS?" },
    { id: "dataRequerimento", condition: ({ data }) => /requer|indefer|recurso/i.test(value(data, "tipoCaso") + " " + value(data, "descricao")), admin: "Qual é a data do requerimento ou da decisão?", client: "Qual é a data do requerimento ou da decisão?" },
    { id: "nb", condition: ({ data }) => /benef[ií]cio|cessad|revis/i.test(value(data, "descricao")), admin: "Qual é o número do benefício, se houver?", client: "Qual é o número do benefício, se houver?", skippable: true }
  ],
  Trabalhista: [{ id: "empresa", required: true, admin: "Qual empresa está envolvida?", client: "Qual empresa está envolvida?" }, { id: "motivo", required: true, admin: "O vínculo terminou? Por qual motivo?", client: "O vínculo terminou? Por qual motivo?" }],
  Família: [{ id: "parteContraria", required: true, admin: "Quem é a outra parte?", client: "Quem é a outra parte?" }, { id: "vinculoFamiliar", required: true, admin: "Qual é a relação familiar entre as partes?", client: "Qual é a relação familiar entre as partes?" }],
  Consumidor: [{ id: "fornecedor", required: true, admin: "Qual fornecedor está envolvido?", client: "Qual fornecedor está envolvido?" }, { id: "produtoServico", required: true, admin: "Qual produto ou serviço está envolvido?", client: "Qual produto ou serviço está envolvido?" }],
  Bancário: [{ id: "fornecedor", required: true, admin: "Qual instituição financeira está envolvida?", client: "Qual instituição financeira está envolvida?" }, { id: "problema", required: true, admin: "Qual é o problema bancário?", client: "Qual é o problema bancário?" }],
  Penal: [{ id: "posicaoPenal", required: true, admin: "O cliente é vítima, investigado ou acusado?", client: "Você é vítima, investigado ou acusado?" }],
  Civil: [{ id: "parteContraria", required: true, admin: "Quem é a outra parte?", client: "Quem é a outra parte?" }, { id: "contratoOuFato", required: true, admin: "Existe contrato ou qual fato originou a demanda?", client: "Existe contrato ou qual fato originou a demanda?" }],
  Imobiliário: [{ id: "imovel", required: true, admin: "Qual imóvel está envolvido?", client: "Qual imóvel está envolvido?" }, { id: "parteContraria", required: true, admin: "Quem é a outra parte?", client: "Quem é a outra parte?" }],
  Outros: []
})

function value(data, field) { return String(data?.[field]?.valor ?? data?.[field] ?? "").trim() }
function answered(data, field) { const item = data?.[field]; return !(item && typeof item === "object" && ["ausente", "invalido", "precisa_conferir", "contraditorio"].includes(item.status)) && Boolean(value(data, field)) }
function questionCatalog(area = "Outros", context = {}) { return [...GENERAL_QUESTIONS, ...(AREA_QUESTIONS[area] || AREA_QUESTIONS.Outros).map((item, index) => ({ group: "Dados da área", priority: 100 + index, target: "deal", ...item }))].filter(item => !item.condition || item.condition(context)) }
function pendingQuestions({ area = "Outros", data = {}, asked = [], deferred = [] } = {}) { const ignored = new Set([...asked.filter(id => answered(data, id)), ...deferred]); return questionCatalog(area, { data }).filter(item => !answered(data, item.id) && !ignored.has(item.id)) }

function normalizeDocumentName(input) { return String(input || "").trim().replace(/\s+/g, " ") }
function isGenericDocumentReference(input) { const text = normalizeDocumentName(input); return /^(alguns? documentos?|documenta[cç][aã]o(?: que possui)?|documentos? existentes?)$/i.test(text) || text === GENERIC_DOCUMENT }
function reconcileDocuments({ required = [], mentioned = [], received = [], quarantined = [], unidentified = false } = {}) {
  const clean = list => [...new Set((list || []).map(normalizeDocumentName).filter(Boolean).filter(item => !isGenericDocumentReference(item)))]
  const necessary = clean(required); const named = clean(mentioned); const accepted = clean(received); const review = clean(quarantined); const approved = new Set(accepted.map(item => item.toLocaleLowerCase("pt-BR")))
  return { required: necessary, mentioned: named, received: accepted, quarantined: review, unidentified: Boolean(unidentified || (mentioned || []).some(isGenericDocumentReference)), missing: necessary.filter(item => !approved.has(item.toLocaleLowerCase("pt-BR"))) }
}
function classifyInssDemand(input) { const text = String(input || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); if (/aposentadoria/.test(text) && /indefer/.test(text) && /cnis|vincul|contribui/.test(text)) return "Aposentadoria indeferida com necessidade de acerto do CNIS"; if (/beneficio/.test(text) && /cessad/.test(text)) return "Benefício cessado"; if (/recurso administrativo/.test(text)) return "Recurso administrativo"; if (/acerto.*cnis/.test(text)) return "Acerto de CNIS"; return null }
function registrationStatus({ pending = [], documents = {}, materialDivergence = false, resources = {} } = {}) { if (materialDivergence || (documents.quarantined || []).length) return REGISTRATION_STATUS.REVIEW; if ((documents.missing || []).length || documents.unidentified) return REGISTRATION_STATUS.DOCUMENTS; if (pending.length) return resources.negocioId ? REGISTRATION_STATUS.COMPLEMENTATION : REGISTRATION_STATUS.INITIAL; if (![resources.contatoId, resources.negocioId, resources.numeroCaso, resources.pastaDriveId].every(Boolean) || resources.associated !== true) return REGISTRATION_STATUS.INITIAL; return REGISTRATION_STATUS.COMPLETE }
function safeOcrUpdates({ current = {}, extraction = {}, allowlist = [], confidenceThreshold = 0.9, approved = false, principalIdentityMatch = false } = {}) { const updates = {}; const divergences = []; const pending = []; for (const [field, result] of Object.entries(extraction || {})) { if (!allowlist.includes(field) || !approved || !principalIdentityMatch || Number(result?.confidence) < confidenceThreshold) continue; const incoming = String(result?.value || "").trim(); if (!incoming) continue; const existing = String(current[field] || "").trim(); if (!existing) updates[field] = incoming; else if (existing.normalize("NFKC").toLowerCase() !== incoming.normalize("NFKC").toLowerCase()) { divergences.push({ field, existing, incoming }); pending.push(field) } } return { updates, divergences, pending, humanReviewRequired: divergences.length > 0 } }
function normalizeUf(input) { const normalized = String(input || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); for (const [uf, name] of Object.entries(ESTADOS_EXTENSO)) { const candidate = String(name).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); if (normalized === uf.toLowerCase() || normalized === candidate) return uf } return null }
async function resolveCityOrCep(input, deps = {}) { const text = String(input || "").trim(); const digits = text.replace(/\D/g, ""); if (digits.length === 8) return (deps.searchCep || buscarPorCEP)(digits); const ufOnly = normalizeUf(text); if (ufOnly) return { uf: ufOnly, ufOnly: true }; return (await (deps.searchCity || buscarCidadePorNomeInteligente)(text)) || null }

module.exports = { GENERAL_QUESTIONS, AREA_QUESTIONS, GENERIC_DOCUMENT, REGISTRATION_STATUS, questionCatalog, pendingQuestions, reconcileDocuments, isGenericDocumentReference, classifyInssDemand, registrationStatus, safeOcrUpdates, normalizeUf, resolveCityOrCep, answered }
