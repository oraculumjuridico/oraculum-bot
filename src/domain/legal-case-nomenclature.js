"use strict"

const { sanitizarTextoEntrada } = require("../utils/text")

const SCHEMA_VERSION = 1

const SUBTYPES = Object.freeze({
  incapacidade_temporaria: { benefit: "incapacidade", label: "Benefício por incapacidade temporária", type: "inss_incapacidade" },
  incapacidade_permanente: { benefit: "incapacidade", label: "Benefício por incapacidade permanente", type: "inss_incapacidade" },
  auxilio_acidente: { benefit: "auxilio_acidente", label: "Auxílio-acidente", type: "inss_incapacidade" },
  bpc_deficiencia: { benefit: "bpc", label: "BPC/LOAS à pessoa com deficiência", type: "inss_bpc" },
  bpc_crianca_deficiencia: { benefit: "bpc", label: "BPC/LOAS à criança com deficiência", type: "inss_bpc" },
  bpc_idoso: { benefit: "bpc", label: "BPC/LOAS à pessoa idosa", type: "inss_bpc" },
  bpc_generico: { benefit: "bpc", label: "BPC/LOAS", type: "inss_bpc" },
  aposentadoria: { benefit: "aposentadoria", label: "Aposentadoria", type: "inss_aposentadoria" },
  pensao_morte: { benefit: "pensao_morte", label: "Pensão por morte", type: "inss_dependentes" },
  salario_maternidade: { benefit: "salario_maternidade", label: "Salário-maternidade", type: "inss_dependentes" }
})

const SITUATIONS = Object.freeze({
  nao_requerido: "Não requerido",
  requerido: "Requerido",
  em_analise: "Em análise",
  concedido: "Concedido",
  indeferido: "Indeferido",
  cessado: "Cessado",
  suspenso: "Suspenso",
  em_recurso: "Em recurso",
  em_revisao: "Em revisão"
})

const OBJECTIVES = Object.freeze({
  obter_concessao: "Obter concessão do benefício",
  reverter_indeferimento: "Obter concessão/reverter indeferimento",
  restabelecer_beneficio: "Restabelecer o benefício",
  revisar_beneficio: "Revisar o benefício",
  recurso_administrativo: "Recorrer administrativamente",
  analisar_possibilidade: "Analisar possibilidade jurídica",
  acompanhar_requerimento: "Acompanhar o requerimento"
})

const SOURCE_PRIORITY = Object.freeze({
  relato: 1,
  resposta_persistida: 2,
  usuario: 3,
  negocio: 4,
  documento_confirmado: 5,
  classificacao_existente: 6
})

function plain(value) {
  return sanitizarTextoEntrada(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim()
}

function present(value) {
  return value !== null && value !== undefined && String(value).trim() !== ""
}

function unwrap(value) {
  if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "valor")) return value.valor
  return value
}

function normalizedCode(value) {
  return plain(unwrap(value)).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
}

function isCorrection(text) {
  return /\b(corrig\w*|na verdade|falei errado|informei errado|nao foi)\b/.test(plain(text))
}

function isUncertainStatement(text) {
  return /^\s*(acho|talvez|nao sei|nao lembro|creio|pode ser|provavelmente)\b/.test(plain(text))
}

function withoutThirdPartyBenefit(text) {
  return sanitizarTextoEntrada(text).split(/(?<=[.!?;])\s+|\n+/).filter(part => {
    const normalized = plain(part)
    const third = /\b(meu|minha|do|da)\s+(pai|mae|marido|esposa|avo|irmao|irma|filho|filha)\b/.test(normalized)
    const self = /\b(eu|pedi|requeri|meu beneficio|minha aposentadoria|para mim|meu pedido|para (?:meu|minha))\b/.test(normalized)
    return !third || self
  }).join(". ")
}

function inferSituation(text) {
  const value = plain(text)
  if (!value) return null
  if (/\b(indeferid\w*|negad\w*|negaram|negou|nao conced\w*)\b/.test(value)) return "indeferido"
  if (/\b(cessad\w*|cortad\w*|cancelad\w*)\b/.test(value)) return "cessado"
  if (/\b(suspens\w*|suspenderam|suspendeu)\b/.test(value)) return "suspenso"
  if (/\b(em recurso|recorri|recurso administrativo)\b/.test(value)) return "em_recurso"
  if (/\b(em revisao|pedido de revisao|revisando)\b/.test(value)) return "em_revisao"
  if (/\b(em analise|analisando|aguardando decisao|ainda nao saiu)\b/.test(value)) return "em_analise"
  if (/\b(concedid\w*|aprovad\w*|deferid\w*)\b/.test(value)) return "concedido"
  if (/\b(nunca pedi|nao pedi|nao fiz (?:o )?requerimento)\b/.test(value)) return "nao_requerido"
  if (/\b(pedi|requeri|dei entrada|fiz (?:o )?pedido|protocolei)\b/.test(value)) return "requerido"
  return null
}

function inferBenefitFacts(text, structured = {}) {
  const raw = withoutThirdPartyBenefit([
    text,
    unwrap(structured.beneficio), unwrap(structured.tipoCaso), unwrap(structured.tipo),
    unwrap(structured.subTipo), unwrap(structured.subtipo), unwrap(structured.bpcRequerenteTipo),
    unwrap(structured.bpcDeficiencia)
  ].filter(present).join(". "))
  const value = plain(raw)
  const explicitCode = normalizedCode(unwrap(structured.subtype || structured.subtipo || structured.subTipo))
  if (SUBTYPES[explicitCode]) return { subtype: explicitCode }
  if (/\b(auxilio[- ]doenca|auxilio por incapacidade temporaria|beneficio por incapacidade temporaria)\b/.test(value)) return { subtype: "incapacidade_temporaria" }
  if (/\b(aposentadoria por incapacidade permanente|aposentadoria por invalidez|incapacidade permanente)\b/.test(value)) return { subtype: "incapacidade_permanente" }
  if (/\b(auxilio acidente)\b/.test(value)) return { subtype: "auxilio_acidente" }
  if (/\b(pensao por morte)\b/.test(value)) return { subtype: "pensao_morte" }
  if (/\b(salario maternidade)\b/.test(value)) return { subtype: "salario_maternidade" }
  const bpc = /\b(bpc|loas|beneficio de prestacao continuada)\b/.test(value)
  if (bpc) {
    const child = /\b(crianca|meu filho|minha filha|menor requerente)\b/.test(value) || normalizedCode(structured.bpcRequerenteTipo) === "crianca"
    const elderly = /\b(idoso|idosa|pessoa idosa)\b/.test(value) || normalizedCode(structured.bpcRequerenteTipo) === "idoso"
    const disability = /\b(deficiencia|autismo|tea|paralisia|sindrome|impedimento)\b/.test(value) || present(unwrap(structured.bpcDeficiencia))
    if (elderly) return { subtype: "bpc_idoso" }
    if (child && disability) return { subtype: "bpc_crianca_deficiencia" }
    if (disability) return { subtype: "bpc_deficiencia" }
    return { subtype: "bpc_generico" }
  }
  if (/\b(aposentadoria(?: por idade| por tempo de contribuicao)?)\b/.test(value)) return { subtype: "aposentadoria" }
  return { subtype: null }
}

function inferObjective(text, situation) {
  const value = plain(text)
  if (!value) return null
  if (/\b(apenas|so)?\s*(orientacao|orientar|tirar duvida|analisar|saber se tenho direito|possibilidade)\b/.test(value)) return "analisar_possibilidade"
  if (/\b(acompanhar|saber andamento|ver como esta)\b/.test(value)) return "acompanhar_requerimento"
  if (/\b(recorrer|entrar com recurso|recurso administrativo)\b/.test(value)) return "recurso_administrativo"
  if (/\b(revisar|revisao do beneficio|recalcular)\b/.test(value)) return "revisar_beneficio"
  if (/\b(restabelecer|voltar a receber|reativar)\b/.test(value)) return "restabelecer_beneficio"
  if (/\b(quero|preciso|busco|pretendo|gostaria de)\b[^.!?]{0,80}\b(conseguir|obter|receber|concessao|beneficio)\b|\b(conseguir|obter)\s+(?:o\s+)?beneficio\b/.test(value)) {
    return situation === "indeferido" ? "reverter_indeferimento" : "obter_concessao"
  }
  return null
}

function contextualizeObjective(objective, situation) {
  if (objective === "obter_concessao") {
    if (situation === "indeferido") return "reverter_indeferimento"
    if (["cessado", "suspenso"].includes(situation)) return "restabelecer_beneficio"
  }
  if (objective === "reverter_indeferimento" && ["nao_requerido", "requerido", "em_analise"].includes(situation)) {
    return "obter_concessao"
  }
  return objective
}

function sourcePayload(source, input) {
  if (source === "relato") {
    const text = Array.isArray(input.narrative) ? input.narrative.join(". ") : input.narrative
    return { text, structured: {} }
  }
  if (source === "resposta_persistida") {
    const structured = Object.fromEntries(Object.entries(input.answered || {}).filter(([, item]) =>
      !item || typeof item !== "object" || !item.status || item.status === "confirmado"))
    return { text: Object.values(structured).map(unwrap).filter(value => typeof value !== "object").join(". "), structured }
  }
  if (source === "usuario") {
    const structured = input.usuario || {}
    return { text: [structured.descricao, structured.assuntoResumo, structured.detalhe, structured.objetivo, structured.situacao].filter(present).join(". "), structured }
  }
  if (source === "negocio") {
    const structured = input.deal?.properties || input.deal || {}
    return { text: [structured.description, structured.descricao_completa, structured.objetivo, structured.situacao_caso].filter(present).join(". "), structured: {
      beneficio: structured.beneficio,
      tipoCaso: structured.tipo_de_caso,
      subtipo: structured.oraculum_case_subtype,
      situacao: structured.situacao_caso,
      objetivo: structured.objetivo
    } }
  }
  if (source === "documento_confirmado") {
    const facts = (Array.isArray(input.documents?.facts) ? input.documents.facts : []).filter(item => {
      const trusted = item?.trusted === true || ["confirmed", "delivered"].includes(String(item?.status || "").toLowerCase())
      const principal = ["titular", "primary_holder"].includes(String(item?.partyRole || "").toLowerCase())
      return trusted && principal && item?.review !== true
    })
    const structured = Object.fromEntries(facts.filter(item => present(item?.field) && present(item?.value)).map(item => [item.field, item.value]))
    return { text: "", structured }
  }
  const structured = input.classification || {}
  return { text: [structured.area, structured.tipo, structured.subTipo, structured.situacao, structured.objetivo, structured.detalhe].filter(present).join(". "), structured }
}

function candidateForSource(source, input) {
  const { text, structured } = sourcePayload(source, input)
  if (["relato", "classificacao_existente"].includes(source) && isUncertainStatement(text)) {
    return { source, priority: SOURCE_PRIORITY[source], area: null, subtype: null, situation: null, objective: null }
  }
  const facts = inferBenefitFacts(text, structured)
  const combined = [text, unwrap(structured.situacao), unwrap(structured.bpcSituacaoAdministrativa), unwrap(structured.objetivo)].filter(present).join(". ")
  const situation = inferSituation(combined)
  const areaText = plain([combined, unwrap(structured.area), unwrap(structured.areaJuridica), unwrap(structured.tipoCaso), facts.subtype].filter(present).join(" "))
  const area = /\b(inss|previd|bpc|loas|incapacidade|aposentadoria|pensao por morte|salario maternidade)\b/.test(areaText) ? "INSS" : null
  return {
    source,
    priority: SOURCE_PRIORITY[source],
    area,
    subtype: facts.subtype,
    situation,
    objective: inferObjective([text, unwrap(structured.objetivo)].filter(present).join(". "), situation)
  }
}

function cloneClassification(model = {}) {
  return {
    area: model.area || null,
    subtype: model.subtype || null,
    situation: model.situation || null,
    objective: model.objective || null
  }
}

function sameClassification(left = {}, right = {}) {
  return ["area", "subtype", "situation", "objective"].every(field => (left[field] || null) === (right[field] || null))
}

function isGenericSubtype(code) {
  return !code || code === "bpc_generico"
}

function resolveField(field, currentValue, candidates, { correction = false } = {}) {
  const available = candidates.filter(item => item[field])
  const preferred = available[0] || null
  if (!preferred) return { value: currentValue || null, source: null, divergences: [] }
  if (!currentValue || (field === "subtype" && isGenericSubtype(currentValue) && !isGenericSubtype(preferred[field]))) {
    return { value: preferred[field], source: preferred.source, divergences: [] }
  }
  if (currentValue === preferred[field]) return { value: currentValue, source: preferred.source, divergences: [] }
  if (correction || (field === "situation" && ["relato", "resposta_persistida"].includes(preferred.source))) {
    return { value: preferred[field], source: preferred.source, divergences: [] }
  }
  return {
    value: currentValue,
    source: "estado_canonico",
    divergences: [{ field, active: currentValue, incoming: preferred[field], sources: ["estado_canonico", preferred.source] }]
  }
}

function resolveLegalCaseNomenclature(input = {}) {
  const current = input.current && typeof input.current === "object" ? input.current : {}
  const narrative = Array.isArray(input.narrative) ? input.narrative.join(". ") : input.narrative
  const correction = input.explicitCorrection === true || isCorrection(narrative)
  const candidates = Object.keys(SOURCE_PRIORITY).map(source => candidateForSource(source, input))
    .sort((left, right) => left.priority - right.priority)
  const next = cloneClassification(current)
  const sources = { ...(current.sources || {}) }
  const divergences = []
  for (const field of ["area", "subtype", "situation"]) {
    const resolved = resolveField(field, next[field], candidates, { correction })
    next[field] = resolved.value
    if (resolved.source) sources[field] = resolved.source
    divergences.push(...resolved.divergences)
  }
  const objectiveCandidates = candidates.map(candidate => ({
    ...candidate,
    objective: contextualizeObjective(candidate.objective, next.situation)
  }))
  const resolvedObjective = resolveField("objective", next.objective, objectiveCandidates, { correction })
  next.objective = contextualizeObjective(resolvedObjective.value, next.situation)
  if (resolvedObjective.source) sources.objective = resolvedObjective.source
  divergences.push(...resolvedObjective.divergences)
  for (const candidate of objectiveCandidates) {
    for (const field of ["area", "subtype", "situation", "objective"]) {
      if (!candidate[field] || !next[field] || candidate[field] === next[field]) continue
      if (candidate.source === "negocio" || candidate.source === "documento_confirmado") {
        if (!divergences.some(item => item.field === field && item.incoming === candidate[field])) {
          divergences.push({ field, active: next[field], incoming: candidate[field], sources: [sources[field] || "estado_canonico", candidate.source] })
        }
      }
    }
  }
  const changed = !sameClassification(current, next)
  const previousHistory = Array.isArray(current.history) ? current.history : []
  const history = changed && Object.values(cloneClassification(current)).some(Boolean)
    ? [...previousHistory, { revision: Number(current.revision || 1), ...cloneClassification(current) }]
    : previousHistory
  const subtype = SUBTYPES[next.subtype] || null
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: changed ? Number(current.revision || 0) + 1 : Number(current.revision || (Object.values(next).some(Boolean) ? 1 : 0)),
    area: next.area,
    areaLabel: next.area === "INSS" ? "Previdenciário / INSS" : null,
    benefit: subtype?.benefit || null,
    subtype: next.subtype,
    subtypeLabel: subtype?.label || null,
    type: subtype?.type || (next.area === "INSS" ? "inss_outros" : null),
    situation: next.situation,
    situationLabel: SITUATIONS[next.situation] || null,
    objective: next.objective,
    objectiveLabel: OBJECTIVES[next.objective] || null,
    status: divergences.length ? "review" : next.subtype && next.subtype !== "bpc_generico" ? "specific" : next.area ? "generic" : "unknown",
    sources,
    divergences,
    history
  }
}

function projectLegalCaseNomenclature(model = {}) {
  return {
    area: model.area || null,
    tipoCaso: model.type || null,
    subTipo: model.subtype || null,
    situacao: model.situationLabel || null,
    objetivo: model.objectiveLabel || null
  }
}

function applyLegalCaseNomenclatureToUser(usuario = {}, model = {}) {
  if (!usuario || typeof usuario !== "object" || !model || typeof model !== "object") return false
  const projection = projectLegalCaseNomenclature(model)
  const values = {
    area: projection.area,
    tipoCaso: projection.tipoCaso,
    subTipo: projection.subTipo,
    situacao: projection.situacao,
    objetivo: projection.objetivo
  }
  let changed = JSON.stringify(usuario.nomenclaturaJuridica || null) !== JSON.stringify(model)
  if (changed) usuario.nomenclaturaJuridica = model
  for (const [field, value] of Object.entries(values)) {
    if (!present(value) || usuario[field] === value) continue
    usuario[field] = value
    changed = true
  }
  return changed
}

module.exports = {
  SCHEMA_VERSION,
  SUBTYPES,
  SITUATIONS,
  OBJECTIVES,
  resolveLegalCaseNomenclature,
  projectLegalCaseNomenclature,
  applyLegalCaseNomenclatureToUser,
  inferSituation,
  inferObjective
}
