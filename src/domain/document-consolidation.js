const crypto = require("node:crypto")
const { baixarArquivoDrive, salvarArquivoBinarioDrive } = require("./drive-files")
const { carregarEstadoDocumental, atualizarEstadoDocumental } = require("./document-state-repository")
const { agruparDocumentosProcessados } = require("./document-grouper")
const { comporPdfsDocumentais } = require("./document-pdf-composer")
const { criarDocumentRegistry, atualizarDocumentRegistry } = require("./document-registry")
const { normalizarEntradaDocumental } = require("./document-input-normalizer")
const { logDebug, logErro } = require("../utils/logging")

function hash(valor) {
  return crypto.createHash("sha256").update(valor).digest("hex")
}

function analisesConcluidas(analises = []) {
  return analises.filter(item => item?.status === "concluido" && item?.arquivo?.fileId && (
    item?.pipeline?.classificacao ||
    (item?.pipeline?.units || []).some(unit => unit?.pipeline?.classificacao)
  ))
}

function assinaturaConsolidacao(analises = [], documentosEsperados = []) {
  const material = analisesConcluidas(analises).map(item => ({
    fileId: item.arquivo.fileId,
    hash: item.arquivo.hash || item.hash || null,
    tipo: item.pipeline.classificacao?.tipoDocumento ||
      (item.pipeline.units || []).map(unit => unit?.pipeline?.classificacao?.tipoDocumento).filter(Boolean),
    nome: item.arquivo.nome || item.arquivo.nomeOriginal || null,
    versao: item.versaoPipeline || item.arquivo.modifiedTime || item.dataProcessamento || null
  })).sort((a, b) => a.fileId.localeCompare(b.fileId))
  return hash(JSON.stringify({ material, documentosEsperados }))
}

function removerBuffers(valor) {
  if (Buffer.isBuffer(valor)) return undefined
  if (Array.isArray(valor)) return valor.map(removerBuffers).filter(item => item !== undefined)
  if (valor && typeof valor === "object") return Object.fromEntries(Object.entries(valor).flatMap(([chave, item]) => {
    const limpo = removerBuffers(item)
    return limpo === undefined ? [] : [[chave, limpo]]
  }))
  return valor
}

async function prepararDocumentosDasAnalises(analises = [], deps = {}) {
  const baixar = deps.baixarArquivoDrive || baixarArquivoDrive
  const normalizar = deps.normalizarEntradaDocumental || normalizarEntradaDocumental
  const documentos = []
  const avisos = []
  let arquivosPreparados = 0
  for (const analise of analisesConcluidas(analises)) {
    const arquivo = analise.arquivo
    let buffer
    let technicalCode
    try {
      buffer = await baixar(arquivo.fileId)
      if (!Buffer.isBuffer(buffer) || !buffer.length) technicalCode = "DOWNLOAD_EMPTY"
    } catch (error) {
      technicalCode = String(error?.code || error?.name || "DOWNLOAD_ERROR")
    }
    if (!Buffer.isBuffer(buffer) || !buffer.length) {
      avisos.push({ code: "DOCUMENT_CONSOLIDATION_DOWNLOAD_FAILED", fileId: arquivo.fileId, ...(technicalCode ? { technicalCode } : {}) })
      continue
    }
    if (/application\/pdf/i.test(arquivo.mimeType || "") && Array.isArray(analise.pipeline?.units)) {
      let normalized
      try {
        normalized = await normalizar({ fileId: arquivo.fileId, buffer, mimeType: "application/pdf" }, deps)
      } catch (error) {
        avisos.push({ code: "DOCUMENT_CONSOLIDATION_PDF_RENDER_FAILED", fileId: arquivo.fileId, technicalCode: String(error?.code || error?.name || "PDF_RENDER_ERROR") })
        continue
      }
      const analysisByPage = new Map((analise.pipeline.units || []).map(unit => [Number(unit?.unit?.pageNumber), unit?.pipeline]))
      let paginasPreparadas = 0
      for (const unit of normalized.units || []) {
        const pipeline = analysisByPage.get(Number(unit.pageNumber))
        if (!pipeline?.classificacao || !Buffer.isBuffer(unit.buffer)) {
          avisos.push({ code: "DOCUMENT_CONSOLIDATION_PDF_PAGE_ANALYSIS_MISSING", fileId: arquivo.fileId, pageNumber: unit.pageNumber })
          continue
        }
        documentos.push({
          fileId: `${arquivo.fileId}#page=${unit.pageNumber}`,
          sourceFileId: arquivo.fileId,
          arquivoOriginal: arquivo.nome || arquivo.nomeOriginal || null,
          referenciaArquivoOriginal: arquivo.nomeOriginal || arquivo.nome || arquivo.fileId,
          mimeType: unit.mimeType,
          webViewLink: arquivo.webViewLink || null,
          buffer: unit.buffer,
          classificacao: pipeline.classificacao,
          extracao: pipeline.extracao,
          contexto: arquivo.contexto || analise.contexto || null,
          pageNumber: unit.pageNumber,
          ...Object.fromEntries(["grupoDocumento", "documentGroup", "groupId", "carteiraId", "ctpsId"].flatMap(chave => {
            const valor = pipeline?.[chave] ?? pipeline?.classificacao?.[chave] ?? arquivo[chave] ?? analise[chave]
            return valor == null ? [] : [[chave, valor]]
          }))
        })
        paginasPreparadas += 1
      }
      if (paginasPreparadas > 0) arquivosPreparados += 1
      continue
    }
    documentos.push({
      fileId: arquivo.fileId,
      arquivoOriginal: arquivo.nome || arquivo.nomeOriginal || null,
      referenciaArquivoOriginal: arquivo.nomeOriginal || arquivo.nome || arquivo.fileId,
      mimeType: arquivo.mimeType || null,
      webViewLink: arquivo.webViewLink || null,
      buffer,
      classificacao: analise.pipeline.classificacao,
      extracao: analise.pipeline.extracao,
      contexto: arquivo.contexto || analise.contexto || null,
      ...Object.fromEntries(["pageNumber", "grupoDocumento", "documentGroup", "groupId", "carteiraId", "ctpsId"].flatMap(chave => {
        const valor = analise[chave] ?? arquivo[chave] ?? analise.pipeline?.[chave]
        return valor == null ? [] : [[chave, valor]]
      }))
    })
    arquivosPreparados += 1
  }
  return { documentos, avisos, arquivosPreparados }
}

function dependencias(deps = {}) {
  return {
    carregarEstadoDocumental: deps.carregarEstadoDocumental || carregarEstadoDocumental,
    atualizarEstadoDocumental: deps.atualizarEstadoDocumental || atualizarEstadoDocumental,
    baixarArquivoDrive: deps.baixarArquivoDrive || baixarArquivoDrive,
    normalizarEntradaDocumental: deps.normalizarEntradaDocumental || normalizarEntradaDocumental,
    salvarArquivoBinarioDrive: deps.salvarArquivoBinarioDrive || salvarArquivoBinarioDrive,
    agruparDocumentosProcessados: deps.agruparDocumentosProcessados || agruparDocumentosProcessados,
    comporPdfsDocumentais: deps.comporPdfsDocumentais || comporPdfsDocumentais,
    criarDocumentRegistry: deps.criarDocumentRegistry || criarDocumentRegistry,
    atualizarDocumentRegistry: deps.atualizarDocumentRegistry || atualizarDocumentRegistry,
    logDebug: deps.logDebug || logDebug,
    logErro: deps.logErro || logErro
  }
}

async function consolidarDocumentosDoCaso(input = {}, deps = {}) {
  const d = dependencias(deps)
  const resumo = { ok: false, skipped: false, reason: null, documentosConsiderados: 0, pdfsGerados: 0, pdfsSalvos: 0, avisos: [], erros: [] }
  if (!input.pastaDriveId) return { ...resumo, skipped: true, reason: "pastaDriveId obrigatorio" }
  const estado = await d.carregarEstadoDocumental(input.pastaDriveId) || { analysis: {}, registry: {}, pdfs: [] }
  const analises = Array.isArray(estado.analysis?.analises) ? estado.analysis.analises : []
  const totalAnalisesElegiveis = analisesConcluidas(analises).length
  const assinatura = assinaturaConsolidacao(analises, input.documentosEsperados || [])
  const pdfsAnteriores = Array.isArray(estado.pdfs) ? estado.pdfs : []
  const metadadosAnteriores = estado.registry?.metadados || {}
  const pdfsEsperadosAnteriores = Array.isArray(metadadosAnteriores.pdfsEsperados) ? [...metadadosAnteriores.pdfsEsperados].sort() : []
  const pdfsRegistradosPorNome = new Map(pdfsAnteriores.map(pdf => [pdf.arquivo || pdf.nome, pdf]))
  const todosPdfsEsperadosRegistrados = pdfsEsperadosAnteriores.every(nome => {
    const pdf = pdfsRegistradosPorNome.get(nome)
    return Boolean(pdf && (pdf.fileId || pdf.drive?.fileId))
  })
  if (metadadosAnteriores.assinaturaConsolidacao === assinatura && metadadosAnteriores.consolidacaoCompleta === true && pdfsEsperadosAnteriores.length === pdfsAnteriores.length && todosPdfsEsperadosRegistrados) {
    return { ...resumo, ok: true, skipped: true, reason: "consolidacao sem alteracoes", documentosConsiderados: analisesConcluidas(analises).length, pdfsGerados: pdfsAnteriores.length, pdfsSalvos: pdfsAnteriores.length }
  }

  const preparados = await prepararDocumentosDasAnalises(analises, {
    baixarArquivoDrive: d.baixarArquivoDrive,
    normalizarEntradaDocumental: d.normalizarEntradaDocumental
  })
  const todosDocumentosPreparados = totalAnalisesElegiveis > 0 && preparados.arquivosPreparados === totalAnalisesElegiveis
  resumo.documentosConsiderados = preparados.documentos.length
  resumo.avisos.push(...preparados.avisos)
  const agrupamentos = d.agruparDocumentosProcessados(preparados.documentos)
  resumo.avisos.push(...(agrupamentos.avisos || []))
  resumo.erros.push(...(agrupamentos.erros || []))
  const composicao = await d.comporPdfsDocumentais(agrupamentos)
  resumo.pdfsGerados = composicao.pdfsGerados?.length || 0
  resumo.avisos.push(...(composicao.avisos || []))
  resumo.erros.push(...(composicao.erros || []))

  const pdfs = []
  for (const pdf of composicao.pdfsGerados || []) {
    try {
      const salvo = await d.salvarArquivoBinarioDrive(input.pastaDriveId, pdf.arquivo, pdf.buffer, "application/pdf")
      if (!salvo?.id) {
        resumo.erros.push({ code: "DOCUMENT_CONSOLIDATION_PDF_SAVE_FAILED", arquivo: pdf.arquivo })
        continue
      }
      pdfs.push({ ...removerBuffers(pdf), fileId: salvo.id, webViewLink: salvo.webViewLink || null, pastaId: input.pastaDriveId, mimeType: "application/pdf", hash: pdf.hash || hash(pdf.buffer) })
    } catch (error) {
      resumo.erros.push({ code: "DOCUMENT_CONSOLIDATION_PDF_SAVE_FAILED", arquivo: pdf.arquivo })
      d.logErro("document_consolidation", `falha tecnica ao salvar PDF: ${error.code || error.name || "erro"}`)
    }
  }
  resumo.pdfsSalvos = pdfs.length
  const pdfsEsperados = (composicao.pdfsGerados || []).map(pdf => pdf.arquivo).filter(Boolean).sort()
  const todosPdfsSalvos = resumo.pdfsGerados > 0 && pdfs.length === resumo.pdfsGerados
  const possuiOriginalForaDoConsolidado = (composicao.originaisPreservados || []).length > 0
  const consolidacaoMaterialCompleta = todosDocumentosPreparados && todosPdfsSalvos && !possuiOriginalForaDoConsolidado

  let registry = estado.registry?.versao
    ? d.atualizarDocumentRegistry(estado.registry, { analises, agrupamentos, pdfs, documentosEsperados: input.documentosEsperados })
    : d.criarDocumentRegistry({ numeroCaso: input.numeroCaso, pastaDriveId: input.pastaDriveId, analises, agrupamentos, pdfs, documentosEsperados: input.documentosEsperados })
  registry = {
    ...registry,
    originaisPreservados: removerBuffers(composicao.originaisPreservados || []),
    metadados: {
      ...(registry.metadados || {}),
      assinaturaConsolidacao: consolidacaoMaterialCompleta ? assinatura : null,
      consolidacaoCompleta: false,
      pdfsEsperados
    }
  }
  if (consolidacaoMaterialCompleta) registry.metadados.consolidacaoCompleta = true
  const atualizado = await d.atualizarEstadoDocumental(input.pastaDriveId, { analysis: estado.analysis, registry: removerBuffers(registry), pdfs: removerBuffers(pdfs) })
  if (!atualizado) resumo.erros.push({ code: "DOCUMENT_CONSOLIDATION_STATE_SAVE_FAILED" })
  resumo.ok = consolidacaoMaterialCompleta && Boolean(atualizado)
  resumo.reason = resumo.ok ? null : "consolidacao incompleta"
  d.logDebug(`[DOCUMENT_CONSOLIDATION] concluida: documentos=${resumo.documentosConsiderados}, pdfs=${resumo.pdfsSalvos}`)
  return resumo
}

module.exports = { consolidarDocumentosDoCaso, prepararDocumentosDasAnalises, assinaturaConsolidacao }
