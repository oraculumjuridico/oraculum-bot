const crypto = require("crypto")
const {
  hsAtualizarContato,
  hsAtualizarNegocio,
  montarPropsContatoHubSpot
} = require("./hubspot-core")
const {
  CONTACT_WRITE_PROPERTIES,
  DEAL_WRITE_PROPERTIES,
  normalizeCpfHubSpot
} = require("./hubspot-contract")
const {
  normalizarContratoEvidencias,
  registrarDivergenciaDocumental
} = require("./document-evidence-model")
const { sanitizarTextoEntrada } = require("../utils/text")

const DOCUMENT_HUBSPOT_SYNC_VERSION = "document-hubspot-sync-v1"
const DEFAULT_MIN_CONFIDENCE = 0.85
const CANONICAL_DOCUMENT_HUBSPOT_SYNC_VERSION = "document-hubspot-sync-v2-canonical"
const canonicalSyncInFlight = new Map()

const BLOCKED_FIELDS = new Set([
  "rg",
  "numero_rg",
  "orgao_emissor",
  "orgao_emissor_rg",
  "data_emissao_rg",
  "crm",
  "cid",
  "exames",
  "laudos",
  "cnis",
  "documentos",
  "pdfs",
  "ocr",
  "texto_ocr",
  "texto_completo",
  "historico_documental",
  "divergencias"
])

const CONTACT_FIELD_MAP = {
  nome: "firstname",
  nome_completo: "firstname",
  cpf: "cpf_do_cliente",
  data_nascimento: "date_of_birth",
  data_de_nascimento: "date_of_birth",
  nascimento: "date_of_birth",
  telefone: "phone",
  whatsapp: "phone",
  email: "email",
  cidade: "city",
  uf: "state",
  estado: "state"
}

const CONTACT_VALIDATION_FIELDS = {
  phone: ["telefone_validado", "telefonevalidado", "whatsapp_validado", "whatsappvalidado", "phone_validated"],
  email: ["email_validado", "emailvalidado", "email_validated"]
}

const DEAL_FIELD_MAP = {
  area_juridica: "area_juridica",
  area: "area_juridica",
  tipo_caso: "tipo_de_caso",
  tipo_de_caso: "tipo_de_caso",
  urgencia: "urgencia",
  prioridade: "hs_priority",
  pasta_drive: "pasta_drive",
  link_pasta_drive: "pasta_drive",
  // Map process-related extracted fields to numero_de_caso (use consolidated canonical if available)
  numero_processo: "numero_de_caso",
  numero_de_processo: "numero_de_caso",
  processo: "numero_de_caso"
}

function nowISO(options = {}) {
  return options.now || new Date().toISOString()
}

function normalizarTexto(valor = "") {
  return sanitizarTextoEntrada(valor)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function normalizarArray(valor) {
  return Array.isArray(valor) ? valor : []
}

function valorVazio(valor) {
  return valor === null || valor === undefined || String(valor).trim() === ""
}

function obterProperties(registro = {}) {
  return registro?.properties || registro || {}
}

function obterId(registro = {}, aliases = []) {
  for (const alias of aliases) {
    if (!valorVazio(registro?.[alias])) return String(registro[alias])
  }
  if (!valorVazio(registro?.id)) return String(registro.id)
  return null
}

function normalizarConfiancas(confiancas = {}) {
  return Object.fromEntries(
    Object.entries(confiancas || {}).map(([campo, confianca]) => [
      normalizarTexto(campo),
      Number(confianca)
    ])
  )
}

function confiancaCampo(campoNormalizado, versao = {}) {
  const confiancas = normalizarConfiancas(versao.extracao?.confiancaPorCampo)
  if (Number.isFinite(confiancas[campoNormalizado])) return confiancas[campoNormalizado]
  const classificacao = Number(versao.classificacao?.confianca)
  return Number.isFinite(classificacao) ? classificacao : 0
}

function iterarCamposExtraidos(registry = {}) {
  const candidatos = []
  for (const documento of normalizarArray(registry.documentos)) {
    if (documento.status === "erro" || documento.vigente === false) continue
    const versao = normalizarArray(documento.versoes).at(-1) || documento
    const campos = versao.extracao?.camposExtraidos || {}
    for (const [campoOriginal, valor] of Object.entries(campos)) {
      const campo = normalizarTexto(campoOriginal)
      if (!campo || BLOCKED_FIELDS.has(campo) || valorVazio(valor)) continue
      candidatos.push({
        campoOriginal,
        campo,
        valor,
        origem: {
          registryId: documento.registryId || documento.chaveDocumento || null,
          fileId: documento.fileId || null,
          tipoDocumento: documento.tipoDocumento || versao.tipoDocumento || null,
          campo: campoOriginal
        },
        confianca: confiancaCampo(campo, versao),
        documento
      })
    }
  }
  return candidatos
}

function campoTemValidacao(candidato = {}, hubspotField) {
  const validadores = CONTACT_VALIDATION_FIELDS[hubspotField]
  if (!validadores) return true

  const campos = candidato.documento?.versoes?.at(-1)?.extracao?.camposExtraidos || {}
  const normalizados = Object.fromEntries(
    Object.entries(campos).map(([campo, valor]) => [normalizarTexto(campo), valor])
  )
  return validadores.some(campo => normalizados[campo] === true || String(normalizados[campo]).toLowerCase() === "true")
}

function normalizarValorHubSpot(field, valor) {
  const texto = sanitizarTextoEntrada(valor)
  if (!texto) return ""
  if (field === "hs_priority") {
    const normalizado = normalizarTexto(texto)
    if (["alta", "high"].includes(normalizado)) return "high"
    if (["media", "medio", "moderada", "medium"].includes(normalizado)) return "medium"
    if (["baixa", "low"].includes(normalizado)) return "low"
    return texto
  }
  if (field === "urgencia") {
    const normalizado = normalizarTexto(texto)
    if (["alta", "high"].includes(normalizado)) return "Alta"
    if (["baixa", "low"].includes(normalizado)) return "Baixa"
    if (["media", "medio", "moderada", "normal", "medium"].includes(normalizado)) return "Moderada"
    return texto
  }
  return texto
}

function camposValidadosManualmente(registro = {}) {
  const props = obterProperties(registro)
  return new Set([
    ...normalizarArray(registro.camposValidadosManualmente),
    ...normalizarArray(registro.propertiesValidadasManualmente),
    ...normalizarArray(props.campos_validados_manualmente),
    ...normalizarArray(props.properties_validadas_manualmente)
  ].map(normalizarTexto))
}

function campoManual(registro = {}, field) {
  const props = obterProperties(registro)
  const manual = camposValidadosManualmente(registro)
  return manual.has(normalizarTexto(field)) ||
    props[`${field}_validado_manualmente`] === true ||
    props[`${field}_manual`] === true
}

function podeAtualizarCampo({ registro, field, valorNovo, confianca, minConfidence, force = false }) {
  const props = obterProperties(registro)
  const valorAnterior = props[field]

  if (valorVazio(valorNovo)) return false
  if (campoManual(registro, field)) return false
  if (String(valorAnterior || "").trim() === String(valorNovo || "").trim()) return false
  if (valorVazio(valorAnterior)) return true
  if (force) return true
  return Number(confianca) >= minConfidence
}

function assinaturaAtualizacao(tipoObjeto, objectId, props = {}) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ tipoObjeto, objectId, props: ordenarObjeto(props) }))
    .digest("hex")
}

function ordenarObjeto(objeto = {}) {
  return Object.fromEntries(Object.entries(objeto).sort(([a], [b]) => a.localeCompare(b)))
}

function obterAssinaturas(registry = {}) {
  return new Set(normalizarArray(registry.metadados?.hubspotDocumentSync?.assinaturas))
}

function montarResumoDocumental(registry = {}) {
  const estatisticas = registry.estatisticas || {}
  const total = Number(estatisticas.totalDocumentos || normalizarArray(registry.documentos).length || 0)
  const pendencias = Number(estatisticas.totalPendencias || normalizarArray(registry.pendencias).length || 0)
  const divergencias = Number(estatisticas.totalDivergencias || normalizarArray(registry.divergencias).length || 0)
  if (!total && !pendencias && !divergencias) return ""
  return `Documentos recebidos: ${total}. Pendencias: ${pendencias}. Divergencias: ${divergencias}.`
}

function candidatosContato(registry = {}) {
  return iterarCamposExtraidos(registry)
    .map(candidato => ({
      ...candidato,
      hubspotField: CONTACT_FIELD_MAP[candidato.campo]
    }))
    .filter(candidato =>
      candidato.hubspotField &&
      CONTACT_WRITE_PROPERTIES.has(candidato.hubspotField) &&
      campoTemValidacao(candidato, candidato.hubspotField)
    )
}

function candidatosNegocio(registry = {}) {
  const candidatos = iterarCamposExtraidos(registry)
    .map(candidato => ({
      ...candidato,
      hubspotField: DEAL_FIELD_MAP[candidato.campo]
    }))
    .filter(candidato => candidato.hubspotField && DEAL_WRITE_PROPERTIES.has(candidato.hubspotField))

  const metadados = registry.metadados || {}
  for (const [campo, hubspotField] of Object.entries(DEAL_FIELD_MAP)) {
    const valor = metadados[campo] || metadados[hubspotField]
    if (!valorVazio(valor) && DEAL_WRITE_PROPERTIES.has(hubspotField)) {
      candidatos.push({
        campoOriginal: campo,
        campo,
        valor,
        hubspotField,
        origem: { metadados: true, campo },
        confianca: 1
      })
    }
  }

  const resumo = metadados.resumoDocumental || montarResumoDocumental(registry)
  if (!valorVazio(resumo)) {
    candidatos.push({
      campoOriginal: "resumo_documental",
      campo: "resumo_documental",
      valor: resumo,
      hubspotField: "resumo_cliente",
      origem: { registry: true, campo: "resumo_documental" },
      confianca: 1
    })
  }

  return candidatos
}

function montarPlanoObjeto({ tipoObjeto, registro, candidatos, minConfidence, assinaturas }) {
  const props = {}
  const auditoria = []
  const bloqueados = []
  const objectId = obterId(registro, tipoObjeto === "contacts" ? ["contactId", "contatoId"] : ["dealId", "negocioId"])

  for (const candidato of candidatos) {
    const field = candidato.hubspotField
    const valorNovo = normalizarValorHubSpot(field, candidato.valor)
    const valorAnterior = obterProperties(registro)[field] || ""

    if (!podeAtualizarCampo({
      registro,
      field,
      valorNovo,
      confianca: candidato.confianca,
      minConfidence
    })) {
      bloqueados.push({
        campo: field,
        origemDocumental: candidato.origem,
        confianca: candidato.confianca,
        motivo: campoManual(registro, field) ? "manual_validado" : "regra_atualizacao"
      })
      continue
    }

    props[field] = valorNovo
    auditoria.push({
      objeto: tipoObjeto,
      campo: field,
      valorAnterior,
      valorNovo,
      origemDocumental: candidato.origem,
      confianca: candidato.confianca
    })
  }

  const propsOrdenadas = ordenarObjeto(props)
  const assinatura = objectId && Object.keys(propsOrdenadas).length
    ? assinaturaAtualizacao(tipoObjeto, objectId, propsOrdenadas)
    : null
  const idempotente = assinatura ? assinaturas.has(assinatura) : false

  return {
    tipoObjeto,
    objectId,
    props: idempotente ? {} : propsOrdenadas,
    auditoria: idempotente ? [] : auditoria,
    bloqueados,
    assinatura,
    idempotente
  }
}

const CANONICAL_CONTACT_FIELDS = Object.freeze({
  nome: { hubspotField: "firstname", userField: "nome", kind: "name" },
  nome_completo: { hubspotField: "firstname", userField: "nome", kind: "name" },
  cpf: { hubspotField: "cpf_do_cliente", userField: "cpf", kind: "cpf" },
  data_nascimento: { hubspotField: "date_of_birth", userField: "dataNascimento", kind: "date" },
  data_de_nascimento: { hubspotField: "date_of_birth", userField: "dataNascimento", kind: "date" },
  nascimento: { hubspotField: "date_of_birth", userField: "dataNascimento", kind: "date" },
  datanascimento: { hubspotField: "date_of_birth", userField: "dataNascimento", kind: "date" }
})

function normalizarNome(valor) {
  const nome = sanitizarTextoEntrada(valor).replace(/\s+/g, " ").trim()
  return nome.length >= 2 && /[A-Za-zÀ-ÿ]/.test(nome) ? nome : null
}

function normalizarData(valor) {
  const texto = sanitizarTextoEntrada(valor)
  const match = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/) || texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (!match) return null
  const year = match[1].length === 4 ? Number(match[1]) : Number(match[3])
  const month = match[1].length === 4 ? Number(match[2]) : Number(match[2])
  const day = match[1].length === 4 ? Number(match[3]) : Number(match[1])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (year < 1900 || year > new Date().getUTCFullYear() ||
      date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function normalizarValorCanonico(kind, valor) {
  if (kind === "cpf") return normalizeCpfHubSpot(String(valor || ""))
  if (kind === "date") return normalizarData(valor)
  if (kind === "name") return normalizarNome(valor)
  return null
}

function compararValorCanonico(kind, left, right) {
  const a = normalizarValorCanonico(kind, left)
  const b = normalizarValorCanonico(kind, right)
  if (!a || !b) return false
  if (kind === "name") return normalizarTexto(a) === normalizarTexto(b)
  return a === b
}

function evidenceRefKey(ref = {}) {
  return `${ref.evidenceId}:${Number(ref.version)}:${ref.sha256 || ""}`
}

function obterDecisaoCanonica(input = {}, registry = {}) {
  if (input.decision) return input.decision
  return normalizarArray(registry.decisoes)
    .filter(item => item.requirementId === "doc_rg")
    .sort((left, right) => Number(right.revision) - Number(left.revision))[0] || null
}

function resolverEvidenciasExatas(registry, decision) {
  if (!normalizarArray(decision?.evidenceRefs).length) {
    return { evidencias: [], bloqueio: "legacy_decision_without_versioned_refs" }
  }
  const evidencias = []
  for (const ref of decision.evidenceRefs) {
    const encontrada = normalizarArray(registry.evidencias).find(item =>
      item.evidenceId === ref.evidenceId && Number(item.version) === Number(ref.version) &&
      (!ref.sha256 || item.sha256 === ref.sha256))
    if (!encontrada) return { evidencias: [], bloqueio: "versioned_evidence_not_found" }
    evidencias.push(encontrada)
  }
  return { evidencias, bloqueio: null }
}

function operacoesCanonicas(registry = {}) {
  return normalizarArray(registry.metadados?.hubspotDocumentSync?.operacoes)
}

function idOperacaoCanonica({ objectId, decision, field, evidenceRefs }) {
  return `document-hubspot:${crypto.createHash("sha256").update(JSON.stringify({
    objectId: String(objectId || ""), requirementId: decision.requirementId,
    revision: Number(decision.revision), field,
    evidenceRefs: normalizarArray(evidenceRefs).map(evidenceRefKey).sort()
  })).digest("hex").slice(0, 40)}`
}

function registrarDivergenciaSeNova(registry, input) {
  const evidenceIds = [...new Set(normalizarArray(input.evidenceIds))].sort()
  const fields = [...new Set(normalizarArray(input.details?.fields))].sort()
  const existente = normalizarArray(registry.divergencias).some(item =>
    item.code === input.code &&
    JSON.stringify([...(item.evidenceIds || [])].sort()) === JSON.stringify(evidenceIds) &&
    JSON.stringify([...(item.details?.fields || [])].sort()) === JSON.stringify(fields))
  return existente ? registry : registrarDivergenciaDocumental(registry, { ...input, evidenceIds })
}

function planoCanonicoBloqueado(registry, decision, motivo, detalhes = {}) {
  return {
    versao: CANONICAL_DOCUMENT_HUBSPOT_SYNC_VERSION,
    canonical: true,
    decision,
    registry,
    contato: { objectId: null, props: {}, auditoria: [], bloqueados: [{ motivo, ...detalhes }], idempotente: false },
    negocio: { objectId: null, props: {}, auditoria: [], bloqueados: [], idempotente: true },
    trustedUserPatch: {},
    auditoria: [],
    bloqueados: [{ motivo, ...detalhes }]
  }
}

function planejarSincronizacaoDocumentalCanonicaHubSpot(input = {}, options = {}) {
  let registry = normalizarContratoEvidencias(input.registry || input.documentRegistry || {})
  const decision = obterDecisaoCanonica(input, registry)
  const contato = input.contato || input.contact || {}
  const usuario = input.usuario || input.user || {}
  const objectId = obterId(contato, ["contactId", "contatoId"])
  const minConfidence = Number(options.minConfidence || DEFAULT_MIN_CONFIDENCE)
  if (!decision || decision.requirementId !== "doc_rg") return planoCanonicoBloqueado(registry, decision, "canonical_decision_missing")
  if (decision.status !== "delivered" || normalizarArray(decision.divergenceIds).length) {
    return planoCanonicoBloqueado(registry, decision, decision.status === "review" ? "canonical_decision_in_review" : "canonical_decision_not_delivered")
  }
  if (!objectId) return planoCanonicoBloqueado(registry, decision, "contact_identity_missing")
  const exact = resolverEvidenciasExatas(registry, decision)
  if (exact.bloqueio) return planoCanonicoBloqueado(registry, decision, exact.bloqueio)
  const evidenceIds = exact.evidencias.map(item => item.evidenceId)
  const evidenceUnsafe = exact.evidencias.some(item =>
    normalizarTexto(item.partyRole) !== "titular" ||
    ["review", "error", "erro", "quarantined"].includes(normalizarTexto(item.status)) ||
    normalizarArray(item.erros).length)
  if (evidenceUnsafe) {
    registry = registrarDivergenciaSeNova(registry, {
      code: "hubspot_document_party_or_evidence_unsafe", evidenceIds, status: "open",
      createdAt: nowISO(options), details: { requirementId: decision.requirementId, revision: decision.revision }
    })
    return planoCanonicoBloqueado(registry, decision, "party_or_evidence_unsafe")
  }

  const byField = new Map()
  for (const evidence of exact.evidencias) {
    const fields = evidence.extracao?.camposExtraidos || {}
    for (const [original, rawValue] of Object.entries(fields)) {
      const mapping = CANONICAL_CONTACT_FIELDS[normalizarTexto(original)]
      if (!mapping) continue
      const value = normalizarValorCanonico(mapping.kind, rawValue)
      const confidence = confiancaCampo(normalizarTexto(original), evidence)
      if (!value) continue
      const evidenceRef = { evidenceId: evidence.evidenceId, version: evidence.version, sha256: evidence.sha256 }
      const destinations = mapping.kind === "name"
        ? Object.entries(montarPropsContatoHubSpot("", { nome: value }))
          .filter(([field, part]) => ["firstname", "lastname"].includes(field) && !valorVazio(part))
          .map(([hubspotField, part]) => ({ ...mapping, hubspotField, value: part, userValue: value }))
        : [{ ...mapping, value, userValue: value }]
      for (const destination of destinations) {
        const candidates = byField.get(destination.hubspotField) || []
        candidates.push({ ...destination, confidence, evidenceRef })
        byField.set(destination.hubspotField, candidates)
      }
    }
  }

  const identityConflictFields = []
  for (const [field, candidates] of byField) {
    if (!["firstname", "lastname", "cpf_do_cliente"].includes(field)) continue
    const kind = candidates[0].kind
    const distinct = new Set(candidates.map(item => kind === 'name' ? normalizarTexto(item.value) : item.value))
    if (distinct.size > 1) identityConflictFields.push(field)
  }
  if (identityConflictFields.length) {
    registry = registrarDivergenciaSeNova(registry, {
      code: "hubspot_document_identity_conflict", evidenceIds, status: "open",
      createdAt: nowISO(options), details: {
        fields: identityConflictFields.sort(), requirementId: decision.requirementId, revision: decision.revision
      }
    })
    return planoCanonicoBloqueado(registry, decision, "document_identity_conflict", {
      campos: identityConflictFields.sort()
    })
  }

  const props = {}
  const auditoria = []
  const bloqueados = []
  const trustedUserPatch = {}
  const nameCandidates = [...(byField.get("firstname") || []), ...(byField.get("lastname") || [])]
  const canonicalFullName = nameCandidates[0]?.userValue || null
  const nameBlocked = Boolean(canonicalFullName && (
    (!valorVazio(usuario.nome) && !compararValorCanonico("name", usuario.nome, canonicalFullName)) ||
    ["firstname", "lastname"].some(field => {
      const expected = (byField.get(field) || [])[0]?.value
      const current = obterProperties(contato)[field]
      return !valorVazio(current) && expected && !compararValorCanonico("name", current, expected)
    }) ||
    ["firstname", "lastname"].some(field => campoManual(contato, field))
  ))
  if (nameBlocked) {
    bloqueados.push({ campo: "firstname/lastname", motivo: "name_value_conflict" })
    registry = registrarDivergenciaSeNova(registry, {
      code: "hubspot_document_existing_value_conflict", evidenceIds, status: "open", createdAt: nowISO(options),
      details: { fields: ["firstname", "lastname"], requirementId: decision.requirementId, revision: decision.revision }
    })
  }
  const existingOperations = new Set(operacoesCanonicas(registry)
    .filter(item => ["applied", "equal"].includes(item.outcome)).map(item => item.operationId))
  for (const [field, candidates] of byField) {
    if (nameBlocked && ["firstname", "lastname"].includes(field)) continue
    const mapping = candidates[0]
    const distinct = new Map(candidates.map(item => [
      mapping.kind === "name" ? normalizarTexto(item.value) : item.value, item
    ]))
    if (distinct.size !== 1) {
      bloqueados.push({ campo: field, motivo: "document_values_divergent" })
      registry = registrarDivergenciaSeNova(registry, {
        code: "hubspot_document_identity_conflict", evidenceIds, status: "open",
        createdAt: nowISO(options), details: { fields: [field], requirementId: decision.requirementId, revision: decision.revision }
      })
      continue
    }
    const candidate = [...distinct.values()][0]
    const confidence = Math.min(...candidates.map(item => Number(item.confidence || 0)))
    const supportRefs = candidates.map(item => item.evidenceRef)
    const operationId = idOperacaoCanonica({ objectId, decision, field, evidenceRefs: supportRefs })
    if (confidence < minConfidence) {
      bloqueados.push({ campo: field, motivo: "confidence_below_existing_threshold", confianca: confidence })
      continue
    }
    if (campoManual(contato, field)) {
      bloqueados.push({ campo: field, motivo: "manual_validado", confianca: confidence })
      continue
    }
    const currentHubSpot = obterProperties(contato)[field]
    const currentUser = usuario[mapping.userField]
    const userValue = candidate.userValue || candidate.value
    if (!valorVazio(currentUser) && !compararValorCanonico(mapping.kind, currentUser, userValue)) {
      bloqueados.push({ campo: field, motivo: "user_value_conflict", confianca: confidence })
      registry = registrarDivergenciaSeNova(registry, {
        code: "hubspot_document_user_conflict", evidenceIds, status: "open", createdAt: nowISO(options),
        details: { fields: [field], requirementId: decision.requirementId, revision: decision.revision }
      })
      continue
    }
    const alreadyApplied = existingOperations.has(operationId)
    const equal = !valorVazio(currentHubSpot) && compararValorCanonico(mapping.kind, currentHubSpot, candidate.value)
    if (!valorVazio(currentHubSpot) && !equal) {
      bloqueados.push({ campo: field, motivo: "hubspot_value_conflict", confianca: confidence })
      registry = registrarDivergenciaSeNova(registry, {
        code: "hubspot_document_existing_value_conflict", evidenceIds, status: "open", createdAt: nowISO(options),
        details: { fields: [field], requirementId: decision.requirementId, revision: decision.revision }
      })
      continue
    }
    if (!alreadyApplied && !equal) props[field] = candidate.value
    trustedUserPatch[mapping.userField] = userValue
    auditoria.push({
      objeto: "contacts", objectId, campo: field, operationId, outcome: alreadyApplied ? "idempotent" : equal ? "equal" : "planned",
      origemDocumental: { requirementId: decision.requirementId, revision: decision.revision, evidenceRefs: supportRefs },
      confianca: confidence, automatico: true
    })
  }
  return {
    versao: CANONICAL_DOCUMENT_HUBSPOT_SYNC_VERSION,
    canonical: true,
    decision,
    registry,
    contato: { objectId, props: ordenarObjeto(props), auditoria, bloqueados, idempotente: auditoria.length > 0 && auditoria.every(item => item.outcome === "idempotent") },
    negocio: { objectId: obterId(input.negocio || input.deal || {}, ["dealId", "negocioId"]), props: {}, auditoria: [], bloqueados: [], idempotente: true },
    trustedUserPatch,
    auditoria,
    bloqueados
  }
}

function planejarSincronizacaoDocumentalHubSpot(input = {}, options = {}) {
  if (input?.decision) return planejarSincronizacaoDocumentalCanonicaHubSpot(input, options)
  const registry = input.registry || input.documentRegistry || input
  const contato = input.contato || input.contact || {}
  const negocio = input.negocio || input.deal || {}
  const minConfidence = Number(options.minConfidence || DEFAULT_MIN_CONFIDENCE)
  const assinaturas = obterAssinaturas(registry)

  const contatoPlano = montarPlanoObjeto({
    tipoObjeto: "contacts",
    registro: contato,
    candidatos: candidatosContato(registry),
    minConfidence,
    assinaturas
  })
  const negocioPlano = montarPlanoObjeto({
    tipoObjeto: "deals",
    registro: negocio,
    candidatos: candidatosNegocio(registry),
    minConfidence,
    assinaturas
  })

  // Integrate consolidation information if provided by the pipeline
  // Use only consolidatedCase explicitly provided by the producer. Planner must not rerun the full
  // document pipeline silently; the producer of the registry must attach consolidatedCase when available.
  const consolidated = registry?.consolidatedCase || null

  if (consolidated) {
    // A. Block CPF when consolidation indicates multiple valid CPFs
    if (Array.isArray(consolidated.conflicts) && consolidated.conflicts.includes('multiple_valid_cpfs')) {
      if (contatoPlano.props && contatoPlano.props.cpf_do_cliente) {
        contatoPlano.bloqueados.push({
          campo: 'cpf_do_cliente',
          origemDocumental: { consolidated: true },
          confianca: 0,
          motivo: 'consolidation_conflict'
        })
        delete contatoPlano.props.cpf_do_cliente
      }
    }

    // B. Map a single consolidated process number to numero_de_caso when available
    const proc = consolidated.canonicalSuggestions && consolidated.canonicalSuggestions.numero_de_caso
    if (proc) {
      const field = 'numero_de_caso'
      const valorNormalizado = normalizarValorHubSpot(field, proc)
      if (podeAtualizarCampo({ registro: negocio, field, valorNovo: valorNormalizado, confianca: 1, minConfidence })) {
        negocioPlano.props = negocioPlano.props || {}
        if (!negocioPlano.props[field]) {
          negocioPlano.props[field] = valorNormalizado
          negocioPlano.auditoria.push({ objeto: 'deals', campo: field, valorAnterior: obterProperties(negocio)[field] || '', valorNovo: valorNormalizado, origemDocumental: { consolidated: true }, confianca: 1 })
        }
      } else {
        negocioPlano.bloqueados.push({ campo: field, origemDocumental: { consolidated: true }, confianca: 1, motivo: 'regra_atualizacao' })
      }
    }
  }

  return {
    versao: DOCUMENT_HUBSPOT_SYNC_VERSION,
    contato: contatoPlano,
    negocio: negocioPlano,
    auditoria: [...contatoPlano.auditoria, ...negocioPlano.auditoria],
    bloqueados: [...contatoPlano.bloqueados, ...negocioPlano.bloqueados]
  }
}

function registrarOperacoesCanonicas(registry = {}, operacoes = [], options = {}) {
  const metadataAnterior = registry.metadados?.hubspotDocumentSync || {}
  const existentes = normalizarArray(metadataAnterior.operacoes)
  const ids = new Set(existentes.map(item => item?.operationId).filter(Boolean))
  const novas = operacoes.filter(item => item?.operationId && !ids.has(item.operationId))
  return {
    ...registry,
    metadados: {
      ...(registry.metadados || {}),
      hubspotDocumentSync: {
        ...metadataAnterior,
        versao: CANONICAL_DOCUMENT_HUBSPOT_SYNC_VERSION,
        atualizadoEm: nowISO(options),
        operacoes: [...existentes, ...novas]
      }
    }
  }
}

function aplicarDadosDocumentaisConfiaveisAoUsuario(usuario = {}, patch = {}) {
  const aplicados = {}
  for (const [campo, valor] of Object.entries(patch || {})) {
    if (valorVazio(valor)) continue
    if (!valorVazio(usuario[campo]) && String(usuario[campo]).trim() !== String(valor).trim()) continue
    usuario[campo] = valor
    aplicados[campo] = valor
  }
  return aplicados
}

function normalizarNumeroCasoDocumental(value) {
  return sanitizarTextoEntrada(value).toUpperCase().replace(/\s+/g, "")
}

function validarContextoDocumentalHubSpot({ usuario = {}, contato = {}, negocio = {}, associatedContactIds = [] } = {}) {
  const expectedContactId = String(usuario.contatoId || "")
  const expectedDealId = String(usuario.negocioId || "")
  const expectedCase = normalizarNumeroCasoDocumental(usuario.numeroCaso)
  const contactId = String(obterId(contato, ["contactId", "contatoId"]) || "")
  const dealId = String(obterId(negocio, ["dealId", "negocioId"]) || "")
  const dealCase = normalizarNumeroCasoDocumental(obterProperties(negocio).numero_de_caso)
  const associated = normalizarArray(associatedContactIds).map(String)
  if (!expectedContactId || !expectedDealId || !expectedCase) return { ok: false, reason: "expected_identity_missing" }
  if (contactId !== expectedContactId) return { ok: false, reason: "contact_identity_mismatch" }
  if (dealId !== expectedDealId) return { ok: false, reason: "deal_identity_mismatch" }
  if (dealCase !== expectedCase) return { ok: false, reason: "case_identity_mismatch" }
  if (associated.length !== 1 || associated[0] !== expectedContactId) return { ok: false, reason: "contact_deal_association_mismatch" }
  return { ok: true, contactId, dealId, numeroCaso: expectedCase }
}

function operacaoPersistida(item = {}, outcome, options = {}) {
  return {
    operationId: item.operationId,
    objectType: item.objeto,
    objectId: item.objectId || null,
    field: item.campo,
    outcome,
    requirementId: item.origemDocumental?.requirementId || null,
    revision: Number(item.origemDocumental?.revision || 0),
    evidenceRefs: normalizarArray(item.origemDocumental?.evidenceRefs).map(ref => ({
      evidenceId: ref.evidenceId,
      version: Number(ref.version),
      sha256: ref.sha256
    })),
    confidence: Number(item.confianca || 0),
    automatic: true,
    updatedAt: nowISO(options)
  }
}

async function executarSincronizacaoCanonica(input = {}, deps = {}, options = {}) {
  const plano = planejarSincronizacaoDocumentalCanonicaHubSpot(input, options)
  const atualizarContato = deps.hsAtualizarContato || hsAtualizarContato
  const planejadas = plano.auditoria.filter(item => item.outcome === "planned")
  const iguais = plano.auditoria.filter(item => item.outcome === "equal")
  let registry = plano.registry

  if (plano.contato.objectId && Object.keys(plano.contato.props).length) {
    let atualizado = null
    try {
      atualizado = await atualizarContato(plano.contato.objectId, plano.contato.props)
    } catch (error) {
      return { ok: false, retryable: true, error: error?.message || String(error), plano, registry, trustedUserPatch: {} }
    }
    if (!atualizado) {
      return { ok: false, retryable: true, error: "hubspot_contact_update_failed", plano, registry, trustedUserPatch: {} }
    }
  }

  const concluidas = [
    ...planejadas.map(item => operacaoPersistida(item, "applied", options)),
    ...iguais.map(item => operacaoPersistida(item, "equal", options))
  ]
  registry = registrarOperacoesCanonicas(registry, concluidas, options)
  return {
    ok: true,
    plano,
    registry,
    auditoria: plano.auditoria,
    trustedUserPatch: plano.trustedUserPatch
  }
}

function chaveSincronizacaoCanonica(input = {}) {
  const decision = input.decision || {}
  return crypto.createHash("sha256").update(JSON.stringify({
    objectId: obterId(input.contato || input.contact || {}, ["contactId", "contatoId"]),
    requirementId: decision.requirementId,
    revision: decision.revision,
    evidenceRefs: normalizarArray(decision.evidenceRefs).map(evidenceRefKey).sort()
  })).digest("hex")
}

async function sincronizarDocumentosCanonicosHubSpot(input = {}, deps = {}, options = {}) {
  const key = chaveSincronizacaoCanonica(input)
  if (canonicalSyncInFlight.has(key)) return canonicalSyncInFlight.get(key)
  const promise = executarSincronizacaoCanonica(input, deps, options)
  canonicalSyncInFlight.set(key, promise)
  try {
    return await promise
  } finally {
    if (canonicalSyncInFlight.get(key) === promise) canonicalSyncInFlight.delete(key)
  }
}

function registrarAssinaturas(registry = {}, assinaturas = [], options = {}) {
  const existentes = obterAssinaturas(registry)
  for (const assinatura of assinaturas.filter(Boolean)) existentes.add(assinatura)
  return {
    ...registry,
    metadados: {
      ...(registry.metadados || {}),
      hubspotDocumentSync: {
        versao: DOCUMENT_HUBSPOT_SYNC_VERSION,
        atualizadoEm: nowISO(options),
        assinaturas: [...existentes]
      }
    }
  }
}

async function sincronizarDocumentosHubSpot(input = {}, deps = {}, options = {}) {
  if (input?.decision) return sincronizarDocumentosCanonicosHubSpot(input, deps, options)
  const registry = input.registry || input.documentRegistry || input
  const plano = planejarSincronizacaoDocumentalHubSpot(input, options)
  const atualizarContato = deps.hsAtualizarContato || hsAtualizarContato
  const atualizarNegocio = deps.hsAtualizarNegocio || hsAtualizarNegocio
  const assinaturasAplicadas = []

  if (plano.contato.objectId && Object.keys(plano.contato.props).length) {
    const atualizado = await atualizarContato(plano.contato.objectId, plano.contato.props)
    if (atualizado) assinaturasAplicadas.push(plano.contato.assinatura)
  }

  if (plano.negocio.objectId && Object.keys(plano.negocio.props).length) {
    const atualizado = await atualizarNegocio(plano.negocio.objectId, plano.negocio.props)
    if (atualizado) assinaturasAplicadas.push(plano.negocio.assinatura)
  }

  return {
    ok: true,
    plano,
    auditoria: plano.auditoria.filter(item =>
      assinaturasAplicadas.includes(plano.contato.assinatura) && item.objeto === "contacts" ||
      assinaturasAplicadas.includes(plano.negocio.assinatura) && item.objeto === "deals"
    ),
    registry: registrarAssinaturas(registry, assinaturasAplicadas, options)
  }
}

module.exports = {
  DOCUMENT_HUBSPOT_SYNC_VERSION,
  CANONICAL_DOCUMENT_HUBSPOT_SYNC_VERSION,
  BLOCKED_FIELDS,
  planejarSincronizacaoDocumentalHubSpot,
  planejarSincronizacaoDocumentalCanonicaHubSpot,
  sincronizarDocumentosHubSpot,
  aplicarDadosDocumentaisConfiaveisAoUsuario,
  validarContextoDocumentalHubSpot,
  assinaturaAtualizacao
}
