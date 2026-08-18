const crypto = require("crypto")
const {
  normalizarContratoEvidencias,
  registrarEvidenciaDocumental,
  registrarConfirmacaoDocumental,
  registrarDivergenciaDocumental,
  registrarDecisaoDocumental
} = require("./document-evidence-model")

const DOCUMENT_REGISTRY_VERSION = "document-registry-v1"

const EMPTY_GROUPS = Object.freeze([
  "documentosPessoais",
  "rgPares",
  "rgFrentesSemVerso",
  "rgVersosSemFrente",
  "comprovantesResidencia",
  "ctps",
  "holerites",
  "laudos",
  "exames",
  "receitas",
  "documentosPrevidenciarios",
  "documentosTrabalhistas",
  "documentosProcessuais",
  "comprovantesCras",
  "outros"
])

function nowISO(options = {}) {
  return options.now || new Date().toISOString()
}

function normalizarTexto(texto = "") {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

function normalizarArray(valor) {
  return Array.isArray(valor) ? valor : []
}

function hashBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) return null
  return crypto.createHash("sha256").update(buffer).digest("hex")
}

function hashTexto(valor) {
  if (!valor) return null
  return crypto.createHash("sha256").update(String(valor)).digest("hex")
}

function extrairClassificacao(entrada = {}) {
  return entrada.classificacao ||
    entrada.pipeline?.classificacao ||
    entrada.resultadoPipeline?.classificacao ||
    null
}

function extrairExtracao(entrada = {}) {
  return entrada.extracao ||
    entrada.pipeline?.extracao ||
    entrada.resultadoPipeline?.extracao ||
    null
}

function extrairArquivo(entrada = {}) {
  return entrada.arquivo ||
    entrada.drive ||
    entrada.referenciaDrive ||
    entrada.arquivoDrive ||
    {}
}

function obterFileId(entrada = {}) {
  const arquivo = extrairArquivo(entrada)
  return entrada.fileId || arquivo.fileId || arquivo.id || entrada.id || null
}

function obterNomeArquivo(entrada = {}) {
  const arquivo = extrairArquivo(entrada)
  return entrada.nome ||
    entrada.name ||
    entrada.arquivoOriginal ||
    entrada.referenciaArquivoOriginal ||
    arquivo.nome ||
    arquivo.name ||
    arquivo.nomeOriginal ||
    null
}

function obterMimeType(entrada = {}) {
  const arquivo = extrairArquivo(entrada)
  return entrada.mimeType || arquivo.mimeType || null
}

function obterDrive(entrada = {}) {
  const arquivo = extrairArquivo(entrada)
  return {
    fileId: obterFileId(entrada),
    nome: obterNomeArquivo(entrada),
    webViewLink: entrada.webViewLink || arquivo.webViewLink || arquivo.link || null,
    pastaId: entrada.pastaId || arquivo.pastaId || arquivo.folderId || null,
    mimeType: obterMimeType(entrada)
  }
}

function obterHash(entrada = {}) {
  const arquivo = extrairArquivo(entrada)
  return entrada.hash ||
    entrada.sha256 ||
    arquivo.hash ||
    arquivo.sha256 ||
    hashBuffer(entrada.buffer) ||
    hashBuffer(arquivo.buffer) ||
    hashTexto(obterFileId(entrada) || obterNomeArquivo(entrada))
}

function obterTipoDocumento(entrada = {}) {
  const classificacao = extrairClassificacao(entrada) || {}
  return entrada.tipoDocumento || classificacao.tipoDocumento || "Documento desconhecido"
}

function obterCategoria(entrada = {}) {
  const classificacao = extrairClassificacao(entrada) || {}
  return entrada.categoria || classificacao.categoria || null
}

function obterChaveDocumento(entrada = {}) {
  return entrada.chaveDocumento ||
    entrada.registryId ||
    obterFileId(entrada) ||
    obterHash(entrada) ||
    obterNomeArquivo(entrada) ||
    `documento-${crypto.randomUUID()}`
}

function criarRegistroVazio() {
  return {
    versao: DOCUMENT_REGISTRY_VERSION,
    documentos: [],
    grupos: [],
    pdfs: [],
    pendencias: [],
    divergencias: [],
    evidencias: [],
    confirmacoes: [],
    decisoes: [],
    estatisticas: {},
    metadados: {
      criadoEm: null,
      atualizadoEm: null,
      historicoProcessamento: []
    }
  }
}

function clonarRegistry(registry = {}) {
  return JSON.parse(JSON.stringify(normalizarContratoEvidencias({
    ...criarRegistroVazio(),
    ...registry,
    documentos: normalizarArray(registry.documentos),
    grupos: normalizarArray(registry.grupos),
    pdfs: normalizarArray(registry.pdfs),
    pendencias: normalizarArray(registry.pendencias),
    divergencias: normalizarArray(registry.divergencias),
    metadados: {
      ...criarRegistroVazio().metadados,
      ...(registry.metadados || {}),
      historicoProcessamento: normalizarArray(registry.metadados?.historicoProcessamento)
    }
  })))
}

function criarVersaoDocumento(entrada = {}, options = {}) {
  const classificacao = extrairClassificacao(entrada)
  const extracao = extrairExtracao(entrada)
  const arquivo = extrairArquivo(entrada)
  const status = entrada.status || (normalizarArray(entrada.erros).length ? "erro" : "processado")

  return {
    versao: Number(entrada.versao || 0),
    fileId: obterFileId(entrada),
    hash: obterHash(entrada),
    nome: obterNomeArquivo(entrada),
    mimeType: obterMimeType(entrada),
    drive: obterDrive(entrada),
    tipoDocumento: obterTipoDocumento(entrada),
    categoria: obterCategoria(entrada),
    classificacao,
    extracao,
    pipeline: entrada.pipeline || entrada.resultadoPipeline || null,
    agrupamentos: entrada.agrupamentos || null,
    dataProcessamento: entrada.dataProcessamento || arquivo.dataProcessamento || nowISO(options),
    status,
    avisos: normalizarArray(entrada.avisos),
    erros: normalizarArray(entrada.erros)
  }
}

function criarDocumentoCanonico(entrada = {}, version = {}, options = {}) {
  const chaveDocumento = obterChaveDocumento(entrada)
  return {
    registryId: chaveDocumento,
    chaveDocumento,
    fileId: version.fileId,
    hash: version.hash,
    nome: version.nome,
    mimeType: version.mimeType,
    drive: version.drive,
    tipoDocumento: version.tipoDocumento,
    categoria: version.categoria,
    status: version.status === "erro" ? "erro" : "vigente",
    vigente: version.status !== "erro",
    duplicado: false,
    duplicadosCom: [],
    versaoAtual: 1,
    criadoEm: nowISO(options),
    atualizadoEm: version.dataProcessamento,
    historicoProcessamento: [{
      evento: "documento_registrado",
      data: version.dataProcessamento,
      status: version.status
    }],
    versoes: [{
      ...version,
      versao: 1
    }]
  }
}

function aplicarVersaoDocumento(documento = {}, entrada = {}, options = {}) {
  const version = criarVersaoDocumento(entrada, options)
  const proximaVersao = (documento.versoes || []).length + 1
  const versao = {
    ...version,
    versao: proximaVersao
  }

  return {
    ...documento,
    fileId: versao.fileId,
    hash: versao.hash,
    nome: versao.nome,
    mimeType: versao.mimeType,
    drive: versao.drive,
    tipoDocumento: versao.tipoDocumento,
    categoria: versao.categoria,
    status: versao.status === "erro" ? "erro" : "vigente",
    vigente: versao.status !== "erro",
    versaoAtual: proximaVersao,
    atualizadoEm: versao.dataProcessamento,
    historicoProcessamento: [
      ...normalizarArray(documento.historicoProcessamento),
      {
        evento: "documento_reprocessado",
        data: versao.dataProcessamento,
        status: versao.status
      }
    ],
    versoes: [
      ...normalizarArray(documento.versoes),
      versao
    ]
  }
}

function registrarDocumento(registry = {}, entrada = {}, options = {}) {
  const estado = clonarRegistry(registry)
  const versao = criarVersaoDocumento(entrada, options)
  const chaveDocumento = obterChaveDocumento(entrada)
  const index = estado.documentos.findIndex(documento =>
    documento.chaveDocumento === chaveDocumento ||
    (versao.fileId && documento.fileId === versao.fileId)
  )

  if (index >= 0) {
    estado.documentos[index] = aplicarVersaoDocumento(estado.documentos[index], entrada, options)
  } else {
    estado.documentos.push(criarDocumentoCanonico(entrada, versao, options))
  }

  return recalcularRegistry(estado, options)
}

function registrarDocumentos(registry = {}, documentos = [], options = {}) {
  return normalizarArray(documentos).reduce(
    (estado, documento) => registrarDocumento(estado, documento, options),
    registry
  )
}

function documentoReferencia(documento = {}) {
  return {
    registryId: documento.registryId || documento.chaveDocumento || null,
    fileId: documento.fileId || null,
    hash: documento.hash || null,
    nome: documento.nome || null,
    tipoDocumento: documento.tipoDocumento || null
  }
}

function chaveEntradaGrupo(item = {}) {
  return item.registryId ||
    item.chaveDocumento ||
    item.fileId ||
    item.id ||
    item.referenciaArquivoOriginal ||
    item.arquivoOriginal ||
    item.nome ||
    item.name ||
    null
}

function resolverReferenciaGrupo(item = {}, documentos = []) {
  const chave = chaveEntradaGrupo(item)
  const encontrado = documentos.find(documento =>
    documento.registryId === chave ||
    documento.fileId === chave ||
    documento.hash === item.hash ||
    documento.nome === chave
  )
  return encontrado ? documentoReferencia(encontrado) : {
    registryId: chave,
    fileId: item.fileId || item.id || null,
    hash: item.hash || null,
    nome: item.nome || item.name || item.referenciaArquivoOriginal || null,
    tipoDocumento: item.tipoDocumento || item.classificacao?.tipoDocumento || null
  }
}

function achatarItensGrupo(valor) {
  if (!Array.isArray(valor)) return []
  return valor.flatMap(item => {
    if (item?.frente || item?.verso) return [item.frente, item.verso].filter(Boolean)
    return [item]
  })
}

function montarGrupos(agrupamentos = {}, documentos = []) {
  return EMPTY_GROUPS
    .map(nome => ({
      nome,
      documentos: achatarItensGrupo(agrupamentos[nome]).map(item => resolverReferenciaGrupo(item, documentos))
    }))
    .filter(grupo => grupo.documentos.length > 0)
}

function normalizarPdf(pdf = {}, options = {}) {
  return {
    tipo: pdf.tipo || null,
    arquivo: pdf.arquivo || pdf.nome || null,
    paginas: Number(pdf.paginas || 0),
    drive: {
      fileId: pdf.fileId || pdf.drive?.fileId || pdf.drive?.id || null,
      webViewLink: pdf.webViewLink || pdf.drive?.webViewLink || null,
      pastaId: pdf.pastaId || pdf.drive?.pastaId || pdf.drive?.folderId || null
    },
    originais: normalizarArray(pdf.originais),
    hash: pdf.hash || hashBuffer(pdf.buffer) || null,
    dataGeracao: pdf.dataGeracao || nowISO(options),
    versao: Number(pdf.versao || 1)
  }
}

function normalizarOriginaisParaComparacao(originais) {
  return normalizarArray(originais).map(original => {
    const material = {
      fileId: original?.fileId || original?.drive?.fileId || null,
      nome: original?.nome || original?.arquivo || original?.name || null,
      referenciaArquivoOriginal: original?.referenciaArquivoOriginal || null,
      pageNumber: original?.pageNumber ?? original?.folha ?? original?.pagina ?? null
    }
    return Object.fromEntries(Object.entries(material).filter(([, valor]) => valor !== null && valor !== undefined && valor !== ""))
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}

function registrarPdfs(registry = {}, pdfs = [], options = {}) {
  const estado = clonarRegistry(registry)
  for (const pdf of normalizarArray(pdfs)) {
    const normalizado = normalizarPdf(pdf, options)
    if (!normalizado.tipo && !normalizado.arquivo) continue
    const index = estado.pdfs.findIndex(item =>
      (normalizado.tipo && item.tipo === normalizado.tipo) ||
      (normalizado.arquivo && item.arquivo === normalizado.arquivo)
    )
    if (index >= 0) {
      const anterior = estado.pdfs[index]
      const materialIgual = anterior.tipo === normalizado.tipo &&
        anterior.arquivo === normalizado.arquivo &&
        anterior.hash === normalizado.hash &&
        anterior.drive?.fileId === normalizado.drive?.fileId &&
        JSON.stringify(normalizarOriginaisParaComparacao(anterior.originais)) === JSON.stringify(normalizarOriginaisParaComparacao(normalizado.originais))
      estado.pdfs[index] = {
        ...normalizado,
        originais: materialIgual ? anterior.originais : normalizado.originais,
        dataGeracao: materialIgual ? anterior.dataGeracao : normalizado.dataGeracao,
        versao: materialIgual ? Number(anterior.versao || 1) : Number(anterior.versao || 1) + 1
      }
    } else {
      estado.pdfs.push(normalizado)
    }
  }
  return recalcularRegistry(estado, options)
}

function detectarDuplicidades(documentos = []) {
  const porHash = new Map()
  for (const documento of documentos) {
    if (!documento.hash || documento.status === "erro") continue
    if (!porHash.has(documento.hash)) porHash.set(documento.hash, [])
    porHash.get(documento.hash).push(documento)
  }
  return [...porHash.values()].filter(lista => lista.length > 1)
}

function aplicarDuplicidades(registry = {}) {
  const estado = clonarRegistry(registry)
  estado.documentos = estado.documentos.map(documento => ({
    ...documento,
    duplicado: false,
    duplicadosCom: []
  }))

  const gruposDuplicados = detectarDuplicidades(estado.documentos)
  for (const grupo of gruposDuplicados) {
    const ids = grupo.map(documento => documento.registryId)
    estado.documentos = estado.documentos.map(documento => (
      ids.includes(documento.registryId)
        ? {
            ...documento,
            duplicado: true,
            duplicadosCom: ids.filter(id => id !== documento.registryId)
          }
        : documento
    ))
  }
  return estado
}

function detectarDivergencias(registry = {}) {
  const divergencias = normalizarArray(registry.divergencias).filter(item => item?.divergenceId)
  const gruposDuplicados = detectarDuplicidades(registry.documentos)
  for (const grupo of gruposDuplicados) {
    divergencias.push({
      code: "DOCUMENT_REGISTRY_DUPLICATE",
      message: "documentos com hash identico registrados mais de uma vez",
      documentos: grupo.map(documentoReferencia)
    })
  }

  for (const documento of registry.documentos || []) {
    const tipos = new Set(normalizarArray(documento.versoes).map(versao => normalizarTexto(versao.tipoDocumento)).filter(Boolean))
    if (tipos.size > 1) {
      divergencias.push({
        code: "DOCUMENT_REGISTRY_TYPE_CHANGED",
        message: "documento teve tipo alterado entre versoes",
        documento: documentoReferencia(documento),
        tipos: [...tipos]
      })
    }
  }

  return divergencias
}

function pendenciasPorEsperados(registry = {}, documentosEsperados = []) {
  return normalizarArray(documentosEsperados).flatMap(esperado => {
    const tipoEsperado = normalizarTexto(esperado.tipoDocumento || esperado.tipo || esperado.label || esperado)
    const existe = registry.documentos.some(documento =>
      documento.status !== "erro" && normalizarTexto(documento.tipoDocumento).includes(tipoEsperado)
    )
    if (existe) return []
    return [{
      code: "DOCUMENT_REGISTRY_DOCUMENT_MISSING",
      tipoDocumento: esperado.tipoDocumento || esperado.tipo || esperado.label || esperado,
      obrigatorio: esperado.obrigatorio !== false,
      message: `documento pendente: ${esperado.label || esperado.tipoDocumento || esperado.tipo || esperado}`
    }]
  })
}

function pendenciasPorAgrupamentos(agrupamentos = {}) {
  const pendencias = []
  for (const documento of normalizarArray(agrupamentos.rgFrentesSemVerso)) {
    pendencias.push({
      code: "DOCUMENT_REGISTRY_RG_BACK_MISSING",
      tipoDocumento: "RG verso",
      original: resolverReferenciaGrupo(documento, []),
      message: "RG com frente recebida sem verso correspondente"
    })
  }
  for (const documento of normalizarArray(agrupamentos.rgVersosSemFrente)) {
    pendencias.push({
      code: "DOCUMENT_REGISTRY_RG_FRONT_MISSING",
      tipoDocumento: "RG frente",
      original: resolverReferenciaGrupo(documento, []),
      message: "RG com verso recebido sem frente correspondente"
    })
  }
  return pendencias
}

function contarPor(documentos = [], campo) {
  return documentos.reduce((acc, documento) => {
    const chave = documento[campo] || "nao_informado"
    acc[chave] = (acc[chave] || 0) + 1
    return acc
  }, {})
}

function calcularEstatisticas(registry = {}) {
  const documentos = normalizarArray(registry.documentos)
  return {
    totalDocumentos: documentos.length,
    documentosVigentes: documentos.filter(documento => documento.status === "vigente").length,
    documentosComErro: documentos.filter(documento => documento.status === "erro").length,
    documentosDuplicados: documentos.filter(documento => documento.duplicado).length,
    totalVersoes: documentos.reduce((total, documento) => total + normalizarArray(documento.versoes).length, 0),
    totalGrupos: normalizarArray(registry.grupos).length,
    totalPdfs: normalizarArray(registry.pdfs).length,
    totalPendencias: normalizarArray(registry.pendencias).length,
    totalDivergencias: normalizarArray(registry.divergencias).length,
    porTipo: contarPor(documentos, "tipoDocumento"),
    porCategoria: contarPor(documentos, "categoria")
  }
}

function recalcularRegistry(registry = {}, options = {}) {
  let estado = aplicarDuplicidades(registry)
  estado.divergencias = detectarDivergencias(estado)
  estado.estatisticas = calcularEstatisticas(estado)
  estado.metadados = {
    ...estado.metadados,
    atualizadoEm: nowISO(options)
  }
  return estado
}

function entradasDeAnalises(analises = []) {
  return normalizarArray(analises).map(analise => ({
    ...analise,
    fileId: analise.arquivo?.fileId,
    nome: analise.arquivo?.nome,
    mimeType: analise.arquivo?.mimeType,
    webViewLink: analise.arquivo?.webViewLink,
    pipeline: analise.pipeline,
    agrupamentos: analise.agrupamentos,
    status: analise.status === "erro" ? "erro" : "processado"
  }))
}

function extrairDocumentosEntrada(input = {}) {
  return [
    ...normalizarArray(input.documentos),
    ...entradasDeAnalises(input.analises),
    ...(input.resultadoPipeline || input.pipeline
      ? [{
          arquivo: input.arquivo,
          pipeline: input.resultadoPipeline || input.pipeline,
          agrupamentos: input.agrupamentos,
          status: input.status
        }]
      : [])
  ]
}

function criarDocumentRegistry(input = {}, options = {}) {
  const data = nowISO(options)
  const inicial = {
    ...criarRegistroVazio(),
    metadados: {
      criadoEm: data,
      atualizadoEm: data,
      casoId: input.casoId || input.numeroCaso || null,
      pastaDriveId: input.pastaDriveId || null,
      historicoProcessamento: [{
        evento: "registry_criado",
        data
      }]
    }
  }
  return atualizarDocumentRegistry(inicial, input, options)
}

function atualizarDocumentRegistry(registry = {}, input = {}, options = {}) {
  let estado = clonarRegistry(registry)
  const data = nowISO(options)
  const documentos = extrairDocumentosEntrada(input)

  estado = registrarDocumentos(estado, documentos, options)

  if (input.agrupamentos) {
    estado.grupos = montarGrupos(input.agrupamentos, estado.documentos)
    estado.pendencias = [
      ...estado.pendencias.filter(p => !String(p.code || "").startsWith("DOCUMENT_REGISTRY_RG_")),
      ...pendenciasPorAgrupamentos(input.agrupamentos)
    ]
  }

  const pdfs = input.pdfs || input.pdfsGerados || input.pdfsDerivados
  if (pdfs) {
    estado = registrarPdfs(estado, pdfs, options)
  }

  if (input.documentosEsperados) {
    estado.pendencias = [
      ...estado.pendencias.filter(p => p.code !== "DOCUMENT_REGISTRY_DOCUMENT_MISSING"),
      ...pendenciasPorEsperados(estado, input.documentosEsperados)
    ]
  }

  estado.metadados = {
    ...estado.metadados,
    atualizadoEm: data,
    historicoProcessamento: [
      ...normalizarArray(estado.metadados?.historicoProcessamento),
      {
        evento: "registry_atualizado",
        data,
        documentosRecebidos: documentos.length,
        pdfsRecebidos: normalizarArray(pdfs).length
      }
    ]
  }

  return recalcularRegistry(estado, options)
}

module.exports = {
  DOCUMENT_REGISTRY_VERSION,
  criarDocumentRegistry,
  atualizarDocumentRegistry,
  registrarDocumento,
  registrarPdfs,
  calcularEstatisticas,
  normalizarContratoEvidencias,
  registrarEvidenciaDocumental,
  registrarConfirmacaoDocumental,
  registrarDivergenciaDocumental,
  registrarDecisaoDocumental
}
