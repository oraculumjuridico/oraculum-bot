"use strict"

const STATES = Object.freeze({
  SEM_DOCUMENTOS: "SEM_DOCUMENTOS",
  DOCUMENTOS_PARCIAIS: "DOCUMENTOS_PARCIAIS",
  DOCUMENTOS_COMPLETOS: "DOCUMENTOS_COMPLETOS",
  DOCUMENTOS_NAO_ANALISADOS: "DOCUMENTOS_NAO_ANALISADOS",
  INFORMACOES_COMPLEMENTARES_PENDENTES: "INFORMACOES_COMPLEMENTARES_PENDENTES",
  REVISAO_HUMANA_NECESSARIA: "REVISAO_HUMANA_NECESSARIA"
})

function unique(values) {
  return [...new Set((values || []).filter(Boolean).map(value =>
    typeof value === "object" ? String(value.id || value.name || value.nome || value.label || "") : String(value)
  ).filter(Boolean))]
}

async function analisarEstadoDocumental(usuario, negocioId, deps = {}) {
  if (!usuario || String(usuario.negocioId || negocioId) !== String(negocioId)) {
    return { estado: STATES.REVISAO_HUMANA_NECESSARIA, motivo: "contexto_negocio_invalido" }
  }
  const lista = unique(await Promise.resolve(deps.resolverListaDocumental?.(usuario.area, usuario.tipoCaso) || usuario.listaDocumental || []))
  const recebidos = unique(usuario.docsEntregues)
  const ausentesDeclarados = unique(usuario.docsAusentes)
  const parciais = unique(usuario.docsParciais)
  const dispensados = unique(usuario.docsDispensados)
  const requiredSources = new Set(deps.requiredSources || [])
  let driveFiles = []
  let notas = []
  let driveError = null
  if (requiredSources.has("drive") && typeof deps.listarArquivosDrive !== "function") driveError = "fonte_drive_indisponivel"
  else try { driveFiles = unique(await Promise.resolve(deps.listarArquivosDrive?.(negocioId) || [])) } catch (error) { driveError = error.message }
  let notesError = false
  if (requiredSources.has("hubspot_notes") && typeof deps.listarNotasDocumentais !== "function") notesError = true
  else try { notas = unique(await Promise.resolve(deps.listarNotasDocumentais?.(negocioId) || [])) } catch { notesError = true }
  const evidenceExists = recebidos.length + parciais.length + driveFiles.length + notas.length > 0
  if (driveError || notesError) return { estado: STATES.REVISAO_HUMANA_NECESSARIA, listaDocumental: lista, recebidos, driveFiles, documentosPendentesUpload: recebidos, erroDrive: Boolean(driveError), erroNotas: notesError }
  if (!lista.length) return { estado: evidenceExists ? STATES.DOCUMENTOS_NAO_ANALISADOS : STATES.REVISAO_HUMANA_NECESSARIA, listaDocumental: lista, recebidos, driveFiles, notas }
  const delivered = new Set([...recebidos, ...dispensados])
  const ausentes = unique([...ausentesDeclarados, ...lista.filter(item => !delivered.has(item) && !parciais.includes(item))])
  let estado
  const arquivosNaoClassificados = driveFiles.length > 0 && recebidos.length === 0 && parciais.length === 0
  if (arquivosNaoClassificados) estado = STATES.DOCUMENTOS_NAO_ANALISADOS
  else if (!evidenceExists && ausentes.length === lista.length) estado = STATES.SEM_DOCUMENTOS
  else if (parciais.length || ausentes.length) estado = STATES.DOCUMENTOS_PARCIAIS
  else if (lista.every(item => delivered.has(item))) estado = STATES.DOCUMENTOS_COMPLETOS
  else estado = STATES.DOCUMENTOS_NAO_ANALISADOS
  const complementary = await Promise.resolve(deps.camposComplementaresPendentes?.(usuario, negocioId) || [])
  if (complementary?.humanReviewRequired) {
    return {
      estado: STATES.REVISAO_HUMANA_NECESSARIA, listaDocumental: lista, recebidos,
      ausentes, parciais, dispensados, driveFiles, notas,
      motivo: complementary.reviewReason || "informacoes_complementares_divergentes"
    }
  }
  const camposPendentes = unique(Array.isArray(complementary) ? complementary : complementary.camposPendentes)
  if (estado === STATES.DOCUMENTOS_COMPLETOS && camposPendentes.length) estado = STATES.INFORMACOES_COMPLEMENTARES_PENDENTES
  return { estado, listaDocumental: lista, recebidos, ausentes, parciais, dispensados, driveFiles, notas, camposPendentes }
}

module.exports = { STATES, analisarEstadoDocumental }
