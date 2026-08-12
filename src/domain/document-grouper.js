const GRUPOS_DOCUMENTAIS = Object.freeze([
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
  "outros"
])

function normalizarTexto(texto = "") {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

function normalizarDocumento(documento = {}, index = 0) {
  const classificacao = documento.classificacao || {}
  const extracao = documento.extracao || {}
  const camposExtraidos = documento.camposExtraidos || extracao.camposExtraidos || {}

  return {
    ...documento,
    tipoDocumento: documento.tipoDocumento || classificacao.tipoDocumento || null,
    categoria: documento.categoria || classificacao.categoria || null,
    subtipo: documento.subtipo || classificacao.subtipo || null,
    confianca: documento.confianca ?? classificacao.confianca ?? null,
    camposExtraidos,
    referenciaArquivoOriginal: documento.referenciaArquivoOriginal || documento.arquivoOriginal || documento.fileRef || documento.fileId || null,
    indiceEntrada: index
  }
}

function criarGruposVazios() {
  return Object.fromEntries(GRUPOS_DOCUMENTAIS.map(grupo => [grupo, []]))
}

function chaveRG(documento) {
  const campos = documento.camposExtraidos || {}
  return normalizarTexto(campos.rg || campos.cpf || campos.nome || documento.referenciaArquivoOriginal || `indice-${documento.indiceEntrada}`)
}

function isRGFrente(documento) {
  return normalizarTexto(documento.tipoDocumento).includes("rg frente")
}

function isRGVerso(documento) {
  return normalizarTexto(documento.tipoDocumento).includes("rg verso")
}

function adicionarDocumentoPessoal(documento, grupos) {
  const tipo = normalizarTexto(documento.tipoDocumento)
  const categoria = normalizarTexto(documento.categoria)

  if (tipo.includes("comprovante de residencia")) {
    grupos.comprovantesResidencia.push(documento)
    return
  }
  if (tipo.includes("ctps") || tipo.includes("carteira de trabalho")) return

  if (
    categoria === "documentos_pessoais" ||
    ["cpf", "cnh", "certidao"].some(parte => tipo.includes(parte)) ||
    isRGFrente(documento) ||
    isRGVerso(documento)
  ) {
    grupos.documentosPessoais.push(documento)
  }

}

function adicionarDocumentoMedico(documento, grupos) {
  const tipo = normalizarTexto(documento.tipoDocumento)
  const subtipo = normalizarTexto(documento.subtipo)

  if (tipo.includes("laudo") || subtipo.includes("laudo")) {
    grupos.laudos.push(documento)
    return
  }
  if (tipo.includes("exame") || subtipo.includes("exame")) {
    grupos.exames.push(documento)
    return
  }
  if (tipo.includes("receita") || subtipo.includes("prescricao")) {
    grupos.receitas.push(documento)
  }
}

function adicionarDocumentoJuridico(documento, grupos) {
  const tipo = normalizarTexto(documento.tipoDocumento)
  const categoria = normalizarTexto(documento.categoria)

  if (tipo.includes("holerite")) {
    grupos.holerites.push(documento)
  }

  if (
    categoria === "previdenciario" ||
    ["cnis", "carta do inss", "indeferimento", "comunicacao de decisao"].some(parte => tipo.includes(parte))
  ) {
    grupos.documentosPrevidenciarios.push(documento)
  }

  if (!tipo.includes("holerite") && (
    categoria === "trabalhista" ||
    ["trct", "contrato de trabalho", "extrato fgts"].some(parte => tipo.includes(parte))
  )) {
    grupos.documentosTrabalhistas.push(documento)
  }

  if (
    categoria === "processual" ||
    ["peticao", "sentenca", "decisao", "andamento"].some(parte => tipo.includes(parte))
  ) {
    grupos.documentosProcessuais.push(documento)
  }
}

function chaveCTPS(documento) {
  const campos = documento.camposExtraidos || {}
  const explicita = documento.grupoDocumento || documento.documentGroup || documento.groupId || documento.carteiraId || documento.ctpsId
  if (explicita) return { chave: `explicita:${normalizarTexto(explicita)}`, confiavel: true }
  if (campos.numero && campos.serie && campos.uf) return { chave: `campos:${normalizarTexto(campos.numero)}:${normalizarTexto(campos.serie)}:${normalizarTexto(campos.uf)}`, confiavel: true }
  // Páginas renderizadas de um mesmo PDF físico pertencem à mesma carteira,
  // salvo quando número/série ou um identificador explícito provarem o contrário.
  const origem = documento.sourceFileId || documento.fileId || documento.referenciaArquivoOriginal || documento.arquivoOriginal
  if (origem) return { chave: `origem:${normalizarTexto(origem)}`, confiavel: false }
  return { chave: `entrada:${documento.indiceEntrada}`, confiavel: false }
}

function agruparCTPS(documentos, grupos, avisos) {
  const carteiras = new Map()
  for (const documento of documentos) {
    const tipo = normalizarTexto(documento.tipoDocumento)
    if (!tipo.includes("ctps") && !tipo.includes("carteira de trabalho")) continue
    const identificacao = chaveCTPS(documento)
    if (!carteiras.has(identificacao.chave)) carteiras.set(identificacao.chave, { ...identificacao, documentos: [] })
    carteiras.get(identificacao.chave).documentos.push(documento)
  }
  grupos.ctps.push(...[...carteiras.values()].map(carteira => ({
    ...carteira,
    documentos: carteira.documentos.sort((a, b) => {
      const paginaA = Number.isFinite(Number(a.pageNumber)) ? Number(a.pageNumber) : Number.MAX_SAFE_INTEGER
      const paginaB = Number.isFinite(Number(b.pageNumber)) ? Number(b.pageNumber) : Number.MAX_SAFE_INTEGER
      return paginaA - paginaB || a.indiceEntrada - b.indiceEntrada
    })
  })))
  if (grupos.ctps.some(carteira => !carteira.confiavel)) avisos.push({ code: "DOCUMENT_GROUPER_CTPS_REVIEW", message: "separacao de CTPS requer revisao manual" })
}

function agruparRG(documentos, grupos) {
  const frentes = new Map()
  const versos = new Map()

  for (const documento of documentos) {
    if (isRGFrente(documento)) {
      const chave = chaveRG(documento)
      if (!frentes.has(chave)) frentes.set(chave, [])
      frentes.get(chave).push(documento)
    }
    if (isRGVerso(documento)) {
      const chave = chaveRG(documento)
      if (!versos.has(chave)) versos.set(chave, [])
      versos.get(chave).push(documento)
    }
  }

  const chaves = new Set([...frentes.keys(), ...versos.keys()])
  for (const chave of chaves) {
    const frenteLista = frentes.get(chave) || []
    const versoLista = versos.get(chave) || []
    const pares = Math.min(frenteLista.length, versoLista.length)

    for (let index = 0; index < pares; index += 1) {
      grupos.rgPares.push({
        chave,
        frente: frenteLista[index],
        verso: versoLista[index]
      })
    }

    grupos.rgFrentesSemVerso.push(...frenteLista.slice(pares))
    grupos.rgVersosSemFrente.push(...versoLista.slice(pares))
  }
}

function documentoFoiAgrupado(documento, grupos) {
  return [
    grupos.documentosPessoais,
    grupos.comprovantesResidencia,
    grupos.ctps.flatMap(carteira => carteira.documentos),
    grupos.holerites,
    grupos.laudos,
    grupos.exames,
    grupos.receitas,
    grupos.documentosPrevidenciarios,
    grupos.documentosTrabalhistas,
    grupos.documentosProcessuais
  ].some(lista => lista.includes(documento))
}

function agruparDocumentosProcessados(documentos = []) {
  const grupos = criarGruposVazios()
  const avisos = []
  const erros = []

  if (!Array.isArray(documentos)) {
    return {
      ...grupos,
      avisos,
      erros: [{
        code: "DOCUMENT_GROUPER_INPUT_INVALID",
        message: "lista de documentos processados deve ser um array"
      }]
    }
  }

  const normalizados = documentos.map(normalizarDocumento)

  for (const documento of normalizados) {
    adicionarDocumentoPessoal(documento, grupos)
    adicionarDocumentoMedico(documento, grupos)
    adicionarDocumentoJuridico(documento, grupos)
  }

  agruparRG(normalizados, grupos)
  agruparCTPS(normalizados, grupos, avisos)

  for (const documento of normalizados) {
    if (!documentoFoiAgrupado(documento, grupos)) {
      grupos.outros.push(documento)
    }
  }

  if (grupos.rgFrentesSemVerso.length || grupos.rgVersosSemFrente.length) {
    avisos.push({
      code: "DOCUMENT_GROUPER_RG_INCOMPLETE",
      message: "existem documentos RG sem frente ou verso correspondente"
    })
  }

  return {
    ...grupos,
    avisos,
    erros
  }
}

module.exports = {
  GRUPOS_DOCUMENTAIS,
  agruparDocumentosProcessados
}
