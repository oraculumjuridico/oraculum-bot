"use strict"

const { montarTituloNegocioHubSpot, siglaCanonicaNegocio } = require("./hubspot-deal-title")
const { sanitizarTextoEntrada } = require("../utils/text")

const first = value => Array.isArray(value) ? value.find(item => sanitizarTextoEntrada(item)) : value
const clean = value => sanitizarTextoEntrada(first(value) || "")
const compact = value => Object.fromEntries(Object.entries(value).filter(([, item]) =>
  item !== undefined && item !== null && (!Array.isArray(item) || item.length) &&
  (typeof item !== "string" || item.trim())
))

function canonicalCaseFromAnalysis({ analysis, selection, caseNumber, provenance = {} } = {}) {
  const result = analysis?.consolidatedResult || analysis?.consolidatedCase || analysis || {}
  const type = clean(result.mappedType?.value || result.mappedType || selection?.type)
  const area = clean(result.area || "INSS")
  const internalCaseNumber = clean(caseNumber || result.canonicalSuggestions?.numero_de_caso?.value || result.canonicalSuggestions?.numero_de_caso)
  const documents = Array.isArray(result.documentosClassificados) ? result.documentosClassificados : []
  const pending = Array.isArray(result.documentsPending) ? result.documentsPending : []
  const model = {
    schemaVersion: 1,
    caseImportId: clean(analysis?.caseImportId || result.importId || selection?.importId),
    holder: compact({
      name: clean(result.nomesEncontrados),
      cpf: clean(result.cpfsEncontrados),
      phone: clean(result.telefonesEncontrados || selection?.phone),
      email: clean(result.emailsEncontrados),
      city: clean(result.cidade),
      state: clean(result.estado || result.uf)
    }),
    relatedParties: Array.isArray(result.thirdParties) ? result.thirdParties : [],
    legal: compact({
      area,
      type,
      subtype: clean(result.subtipo),
      benefit: clean(result.tiposBeneficioEncontrados),
      benefitNumber: clean(result.numerosBeneficioEncontrados),
      protocol: clean(result.numerosRequerimentoEncontrados),
      stage: clean(result.plannedStage?.value || result.plannedStage),
      situation: clean(result.situacaoAtual),
      priority: clean(result.prioridade),
      temperature: clean(result.temperatura || "Quente")
    }),
    documents: {
      found: documents,
      pending,
      quarantined: Array.isArray(result.quarantinedDocuments) ? result.quarantinedDocuments : [],
      summary: clean(result.resumoDocumental) ||
        `Documentos analisados: ${Number(result.analyzedFileCount || documents.length || 0)}. Pendências: ${pending.length}.`
    },
    review: compact({
      required: Array.isArray(result.blockingReviewReasons) && result.blockingReviewReasons.length > 0,
      reasons: result.reviewReasons || [],
      humanReviewApplied: Boolean(result.humanReviewApplied || analysis?.identityConfirmationApplied)
    }),
    identifiers: compact({
      internalCaseNumber,
      abbreviation: siglaCanonicaNegocio({ area, numeroCaso: internalCaseNumber })
    }),
    source: compact({
      folderReference: clean(result.sourceFolder || selection?.folder),
      files: result.contentHashes || [],
      provenance
    }),
    confidence: Number(result.confidence || 0)
  }
  model.title = montarTituloNegocioHubSpot({
    area,
    numeroCaso: internalCaseNumber,
    temperatura: model.legal.temperature
  })
  return model
}

function canonicalCaseToHubSpot(model = {}) {
  const contact = compact({
    firstname: model.holder?.name,
    cpf_do_cliente: model.holder?.cpf,
    phone: model.holder?.phone,
    email: model.holder?.email,
    city: model.holder?.city,
    state: model.holder?.state
  })
  const deal = compact({
    dealname: model.title,
    numero_de_caso: model.identifiers?.internalCaseNumber,
    area_juridica: model.legal?.area,
    tipo_de_caso: model.legal?.type,
    temperatura_lead: model.legal?.temperature,
    pasta_drive: model.source?.folderReference,
    resumo_cliente: model.documents?.summary
  })
  return { contact, deal }
}

function mergeNonEmpty(existing = {}, proposed = {}) {
  const merged = { ...existing }
  for (const [key, value] of Object.entries(compact(proposed))) {
    if (merged[key] === undefined || merged[key] === null || String(merged[key]).trim() === "") merged[key] = value
  }
  return merged
}

module.exports = { canonicalCaseFromAnalysis, canonicalCaseToHubSpot, mergeNonEmpty }
