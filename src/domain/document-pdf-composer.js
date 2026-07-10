const sharp = require("sharp")

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const PAGE_MARGIN = 36

const PDF_DEFINITIONS = Object.freeze([
  {
    tipo: "RG",
    arquivo: "RG.pdf",
    getDocumentos: grupos => [
      ...(grupos.rgPares || []).flatMap(par => [par.frente, par.verso].filter(Boolean)),
      ...(grupos.rgFrentesSemVerso || []),
      ...(grupos.rgVersosSemFrente || [])
    ]
  },
  {
    tipo: "CNH",
    arquivo: "CNH.pdf",
    getDocumentos: grupos => filtrarPorTipo(grupos.documentosPessoais, ["cnh"])
  },
  {
    tipo: "CTPS",
    arquivo: "CTPS.pdf",
    getDocumentos: grupos => filtrarPorTipo(grupos.documentosPessoais, ["ctps"])
  },
  {
    tipo: "Certidao",
    arquivo: "Certidao.pdf",
    getDocumentos: grupos => filtrarPorTipo(grupos.documentosPessoais, ["certidao", "certidão"])
  },
  {
    tipo: "DocumentosPessoais",
    arquivo: "DocumentosPessoais.pdf",
    getDocumentos: grupos => grupos.documentosPessoais || []
  },
  {
    tipo: "Laudos",
    arquivo: "Laudos.pdf",
    getDocumentos: grupos => grupos.laudos || []
  },
  {
    tipo: "Exames",
    arquivo: "Exames.pdf",
    getDocumentos: grupos => grupos.exames || []
  },
  {
    tipo: "Receitas",
    arquivo: "Receitas.pdf",
    getDocumentos: grupos => grupos.receitas || []
  },
  {
    tipo: "Holerites",
    arquivo: "Holerites.pdf",
    getDocumentos: grupos => grupos.holerites || []
  },
  {
    tipo: "DocumentosPrevidenciarios",
    arquivo: "DocumentosPrevidenciarios.pdf",
    getDocumentos: grupos => grupos.documentosPrevidenciarios || []
  },
  {
    tipo: "DocumentosTrabalhistas",
    arquivo: "DocumentosTrabalhistas.pdf",
    getDocumentos: grupos => grupos.documentosTrabalhistas || []
  },
  {
    tipo: "DocumentosProcessuais",
    arquivo: "DocumentosProcessuais.pdf",
    getDocumentos: grupos => grupos.documentosProcessuais || []
  },
  {
    tipo: "Outros",
    arquivo: "Outros.pdf",
    getDocumentos: grupos => grupos.outros || []
  }
])

function normalizarTexto(texto = "") {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

function filtrarPorTipo(documentos = [], termos = []) {
  return (documentos || []).filter(documento => {
    const tipo = normalizarTexto(documento?.tipoDocumento || documento?.classificacao?.tipoDocumento)
    return termos.some(termo => tipo.includes(normalizarTexto(termo)))
  })
}

function obterBufferDocumento(documento = {}) {
  if (Buffer.isBuffer(documento.buffer)) return documento.buffer
  if (Buffer.isBuffer(documento.arquivo?.buffer)) return documento.arquivo.buffer
  if (Buffer.isBuffer(documento.pipeline?.preprocessamento?.buffer)) return documento.pipeline.preprocessamento.buffer
  return null
}

function obterMimeTypeDocumento(documento = {}) {
  return documento.mimeType ||
    documento.arquivo?.mimeType ||
    documento.pipeline?.preprocessamento?.mimeType ||
    documento.preprocessamento?.mimeType ||
    null
}

function obterReferenciaOriginal(documento = {}) {
  return {
    fileId: documento.fileId || documento.arquivo?.fileId || documento.id || null,
    nome: documento.nome || documento.name || documento.arquivoOriginal || documento.referenciaArquivoOriginal || documento.arquivo?.nome || null,
    webViewLink: documento.webViewLink || documento.arquivo?.webViewLink || null,
    tipoDocumento: documento.tipoDocumento || documento.classificacao?.tipoDocumento || null,
    categoria: documento.categoria || documento.classificacao?.categoria || null
  }
}

function chaveDocumento(documento = {}, index = 0) {
  return documento.fileId ||
    documento.id ||
    documento.referenciaArquivoOriginal ||
    documento.arquivoOriginal ||
    documento.nome ||
    documento.name ||
    `documento-${index}`
}

function documentosUnicos(documentos = []) {
  const vistos = new Set()
  const saida = []
  for (const documento of documentos.filter(Boolean)) {
    const chave = chaveDocumento(documento, saida.length)
    if (vistos.has(chave)) continue
    vistos.add(chave)
    saida.push(documento)
  }
  return saida
}

async function prepararPaginaDocumento(documento, contexto, avisos) {
  const buffer = obterBufferDocumento(documento)
  const referencia = obterReferenciaOriginal(documento)
  if (!buffer) {
    avisos.push({
      code: "DOCUMENT_PDF_SOURCE_BUFFER_MISSING",
      message: `documento sem buffer para compor ${contexto}`,
      original: referencia
    })
    return null
  }

  const mimeType = obterMimeTypeDocumento(documento)
  if (/application\/pdf/i.test(mimeType || "")) {
    avisos.push({
      code: "DOCUMENT_PDF_SOURCE_PDF_UNSUPPORTED",
      message: `PDF de origem ainda nao e mesclado pelo compositor: ${contexto}`,
      original: referencia
    })
    return null
  }

  try {
    const imagem = sharp(buffer, { failOn: "none" }).rotate()
    const metadata = await imagem.metadata()
    const jpeg = await imagem.flatten({ background: "#ffffff" }).jpeg({ quality: 88 }).toBuffer()
    return {
      buffer: jpeg,
      width: metadata.width || 1,
      height: metadata.height || 1,
      original: referencia
    }
  } catch (error) {
    avisos.push({
      code: "DOCUMENT_PDF_IMAGE_INVALID",
      message: `imagem invalida para compor ${contexto}: ${error.message}`,
      original: referencia
    })
    return null
  }
}

function formatNumber(value) {
  return Number(value).toFixed(2).replace(/\.?0+$/, "")
}

function criarObjeto(id, conteudo) {
  const body = Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(String(conteudo), "binary")
  return {
    id,
    buffer: Buffer.concat([
      Buffer.from(`${id} 0 obj\n`, "ascii"),
      body,
      Buffer.from("\nendobj\n", "ascii")
    ])
  }
}

function criarStream(dicionario, conteudo) {
  const body = Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(String(conteudo), "binary")
  return Buffer.concat([
    Buffer.from(`${dicionario}\nstream\n`, "ascii"),
    body,
    Buffer.from("\nendstream", "ascii")
  ])
}

function calcularImagemNaPagina(width, height) {
  const maxWidth = PAGE_WIDTH - PAGE_MARGIN * 2
  const maxHeight = PAGE_HEIGHT - PAGE_MARGIN * 2
  const escala = Math.min(maxWidth / width, maxHeight / height)
  const drawWidth = width * escala
  const drawHeight = height * escala
  return {
    width: drawWidth,
    height: drawHeight,
    x: (PAGE_WIDTH - drawWidth) / 2,
    y: (PAGE_HEIGHT - drawHeight) / 2
  }
}

function criarPdfDePaginas(paginas = []) {
  const totalPaginas = paginas.length
  const catalogId = 1
  const pagesId = 2
  const firstPageId = 3
  const objetos = []
  const pageIds = []

  objetos.push(criarObjeto(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`))

  paginas.forEach((pagina, index) => {
    const pageId = firstPageId + index * 3
    const imageId = pageId + 1
    const contentId = pageId + 2
    const pos = calcularImagemNaPagina(pagina.width, pagina.height)
    const comando = [
      "q",
      `${formatNumber(pos.width)} 0 0 ${formatNumber(pos.height)} ${formatNumber(pos.x)} ${formatNumber(pos.y)} cm`,
      `/Im${index + 1} Do`,
      "Q"
    ].join("\n")

    pageIds.push(pageId)
    objetos.push(criarObjeto(imageId, criarStream(
      `<< /Type /XObject /Subtype /Image /Width ${pagina.width} /Height ${pagina.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pagina.buffer.length} >>`,
      pagina.buffer
    )))
    objetos.push(criarObjeto(contentId, criarStream(
      `<< /Length ${Buffer.byteLength(comando, "ascii")} >>`,
      Buffer.from(comando, "ascii")
    )))
    objetos.push(criarObjeto(pageId, [
      "<< /Type /Page",
      `/Parent ${pagesId} 0 R`,
      `/MediaBox [0 0 ${formatNumber(PAGE_WIDTH)} ${formatNumber(PAGE_HEIGHT)}]`,
      `/Resources << /XObject << /Im${index + 1} ${imageId} 0 R >> >>`,
      `/Contents ${contentId} 0 R`,
      ">>"
    ].join("\n")))
  })

  objetos.push(criarObjeto(pagesId, `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${totalPaginas} >>`))
  objetos.sort((a, b) => a.id - b.id)

  const partes = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "binary")]
  const offsets = [0]
  for (const objeto of objetos) {
    offsets[objeto.id] = partes.reduce((total, parte) => total + parte.length, 0)
    partes.push(objeto.buffer)
  }

  const xrefOffset = partes.reduce((total, parte) => total + parte.length, 0)
  const maxId = Math.max(...objetos.map(objeto => objeto.id))
  const xref = [
    "xref",
    `0 ${maxId + 1}`,
    "0000000000 65535 f ",
    ...Array.from({ length: maxId }, (_, index) => {
      const offset = offsets[index + 1] || 0
      return `${String(offset).padStart(10, "0")} 00000 n `
    }),
    "trailer",
    `<< /Size ${maxId + 1} /Root ${catalogId} 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF"
  ].join("\n")
  partes.push(Buffer.from(xref, "ascii"))

  return Buffer.concat(partes)
}

async function gerarPdfDefinicao(definicao, grupos, avisos) {
  const documentos = documentosUnicos(definicao.getDocumentos(grupos))
  if (!documentos.length) return null

  const paginas = []
  for (const documento of documentos) {
    const pagina = await prepararPaginaDocumento(documento, definicao.tipo, avisos)
    if (pagina) paginas.push(pagina)
  }
  if (!paginas.length) return null

  return {
    tipo: definicao.tipo,
    arquivo: definicao.arquivo,
    buffer: criarPdfDePaginas(paginas),
    paginas: paginas.length,
    originais: paginas.map(pagina => pagina.original)
  }
}

function registrarAvisosRGIncompleto(grupos = {}, avisos) {
  for (const documento of grupos.rgFrentesSemVerso || []) {
    avisos.push({
      code: "DOCUMENT_PDF_RG_INCOMPLETE",
      message: "RG gerado sem verso correspondente",
      original: obterReferenciaOriginal(documento)
    })
  }
  for (const documento of grupos.rgVersosSemFrente || []) {
    avisos.push({
      code: "DOCUMENT_PDF_RG_INCOMPLETE",
      message: "RG gerado sem frente correspondente",
      original: obterReferenciaOriginal(documento)
    })
  }
}

async function comporPdfsDocumentais(grupos = {}, options = {}) {
  const avisos = []
  const erros = []
  const pdfsGerados = []
  const definicoes = options.definicoes || PDF_DEFINITIONS

  if (!grupos || typeof grupos !== "object") {
    return {
      pdfsGerados,
      avisos,
      erros: [{
        code: "DOCUMENT_PDF_GROUPS_INVALID",
        message: "grupos documentais devem ser um objeto"
      }]
    }
  }

  registrarAvisosRGIncompleto(grupos, avisos)

  for (const definicao of definicoes) {
    try {
      const pdf = await gerarPdfDefinicao(definicao, grupos, avisos)
      if (pdf) pdfsGerados.push(pdf)
    } catch (error) {
      erros.push({
        code: "DOCUMENT_PDF_COMPOSITION_ERROR",
        message: `falha ao gerar ${definicao.tipo}: ${error.message}`
      })
    }
  }

  return {
    pdfsGerados,
    avisos,
    erros
  }
}

module.exports = {
  PDF_DEFINITIONS,
  comporPdfsDocumentais,
  criarPdfDePaginas,
  obterReferenciaOriginal
}
