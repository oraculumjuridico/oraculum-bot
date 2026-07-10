const { gerarChecklistDocumental } = require("./document-checklist")
const { detectarDivergenciasDocumentais } = require("./document-divergence-detector")

const LEGAL_DOSSIER_VERSION = "legal-dossier-v1"

function normalizarArray(valor) {
  return Array.isArray(valor) ? valor : []
}

function texto(valor) {
  if (valor === null || valor === undefined) return ""
  return String(valor).trim()
}

function primeiroValor(...valores) {
  return valores.find(valor => texto(valor)) || null
}

function properties(registro = {}) {
  return registro?.properties || registro || {}
}

function versaoVigente(documento = {}) {
  return normalizarArray(documento.versoes).at(-1) || documento
}

function camposExtraidos(documento = {}) {
  const versao = versaoVigente(documento)
  return versao.extracao?.camposExtraidos || documento.extracao?.camposExtraidos || {}
}

function referenciaDocumento(documento = {}) {
  return {
    registryId: documento.registryId || documento.chaveDocumento || null,
    fileId: documento.fileId || null,
    hash: documento.hash || null,
    nome: documento.nome || null,
    tipoDocumento: documento.tipoDocumento || null,
    status: documento.status || null,
    versaoAtual: documento.versaoAtual || normalizarArray(documento.versoes).length || 1
  }
}

function valorCampo(registry = {}, aliases = []) {
  for (const documento of normalizarArray(registry.documentos)) {
    if (documento.status === "erro" || documento.vigente === false) continue
    const campos = camposExtraidos(documento)
    const entrada = Object.entries(campos).find(([campo]) =>
      aliases.some(alias => campo.toLowerCase() === alias.toLowerCase())
    )
    if (entrada && texto(entrada[1])) return entrada[1]
  }
  return null
}

function montarCliente(registry = {}, contato = {}, inputCliente = {}) {
  const props = properties(contato)
  return {
    nome: primeiroValor(inputCliente.nome, props.firstname, props.nome, valorCampo(registry, ["nome", "nome_completo", "nomeCompleto"])),
    cpf: primeiroValor(inputCliente.cpf, props.cpf_do_cliente, props.cpf, valorCampo(registry, ["cpf", "cpf_do_cliente"])),
    dataNascimento: primeiroValor(inputCliente.dataNascimento, props.date_of_birth, props.dataNascimento, valorCampo(registry, ["dataNascimento", "data_nascimento", "data de nascimento"])),
    telefones: [
      inputCliente.telefone,
      inputCliente.whatsapp,
      props.phone,
      props.mobilephone,
      valorCampo(registry, ["telefone", "whatsapp"])
    ].filter(Boolean),
    cidade: primeiroValor(inputCliente.cidade, props.city, props.cidade, valorCampo(registry, ["cidade", "municipio"])),
    uf: primeiroValor(inputCliente.uf, props.state, props.uf, valorCampo(registry, ["uf", "estado"]))
  }
}

function montarCaso(registry = {}, negocio = {}, inputCaso = {}) {
  const props = properties(negocio)
  const metadados = registry.metadados || {}
  return {
    area: primeiroValor(inputCaso.area, props.area_juridica, metadados.area_juridica, metadados.areaJuridica),
    tipo: primeiroValor(inputCaso.tipo, props.tipo_de_caso, metadados.tipo_de_caso, metadados.tipoCaso),
    numeroHubSpot: primeiroValor(inputCaso.numeroHubSpot, props.numero_de_caso, props.numero_caso, metadados.casoId, metadados.numeroCaso),
    responsavel: primeiroValor(inputCaso.responsavel, props.hubspot_owner_id, props.responsavel, metadados.responsavel)
  }
}

function montarDocumentacao(checklist = {}) {
  return {
    recebidos: normalizarArray(checklist.recebidos),
    pendentes: normalizarArray(checklist.pendentes),
    percentual: Number(checklist.percentualCompleto || 0)
  }
}

function montarPdfs(registry = {}) {
  return normalizarArray(registry.pdfs).map(pdf => ({
    tipo: pdf.tipo || null,
    arquivo: pdf.arquivo || null,
    paginas: Number(pdf.paginas || 0),
    versao: Number(pdf.versao || 1),
    hash: pdf.hash || null,
    dataGeracao: pdf.dataGeracao || null,
    drive: pdf.drive || {
      fileId: pdf.fileId || null,
      webViewLink: pdf.webViewLink || null,
      pastaId: pdf.pastaId || null
    },
    originais: normalizarArray(pdf.originais)
  }))
}

function montarLinks(registry = {}, negocio = {}) {
  const props = properties(negocio)
  const pdfs = montarPdfs(registry)
  return {
    pastaDrive: primeiroValor(registry.metadados?.pastaDriveLink, registry.metadados?.pastaDriveUrl, props.pasta_drive, registry.metadados?.pastaDriveId),
    pdfs: pdfs.map(pdf => ({
      tipo: pdf.tipo,
      arquivo: pdf.arquivo,
      fileId: pdf.drive?.fileId || null,
      webViewLink: pdf.drive?.webViewLink || null
    })),
    documentos: normalizarArray(registry.documentos).map(documento => ({
      ...referenciaDocumento(documento),
      webViewLink: documento.drive?.webViewLink || null
    }))
  }
}

function evento(data, tipo, documento, extra = {}) {
  return {
    data: data || null,
    tipo,
    documento: referenciaDocumento(documento),
    ...extra
  }
}

function montarCronologia(registry = {}) {
  const eventos = []
  for (const documento of normalizarArray(registry.documentos)) {
    if (documento.criadoEm) eventos.push(evento(documento.criadoEm, "documento_recebido", documento))
    for (const versao of normalizarArray(documento.versoes)) {
      eventos.push(evento(versao.dataUpload || versao.drive?.dataUpload || documento.drive?.dataUpload || null, "upload_documento", documento, {
        versao: versao.versao || null
      }))
      eventos.push(evento(versao.dataProcessamento || documento.atualizadoEm || null, "processamento_documento", documento, {
        versao: versao.versao || null,
        status: versao.status || documento.status || null
      }))
    }
  }
  return eventos
    .filter(item => item.data)
    .sort((a, b) => String(a.data).localeCompare(String(b.data)))
}

function montarCopiloto(checklist = {}, divergencias = {}) {
  const riscos = []
  const observacoes = []
  const documentosSugeridos = []

  if (normalizarArray(checklist.pendentes).length) {
    riscos.push("documentacao_incompleta")
    documentosSugeridos.push(...checklist.pendentes.map(item => item.item).filter(Boolean))
  }
  if (normalizarArray(divergencias.inconsistenciasCriticas).length) {
    riscos.push("divergencia_critica")
    observacoes.push("Existem divergencias documentais criticas para validacao manual.")
  }
  if (normalizarArray(checklist.vencidos).length) {
    riscos.push("documento_vencido")
    observacoes.push("Ha documento com data de validade ou vencimento ultrapassada.")
  }
  if (normalizarArray(checklist.invalidos).length) {
    riscos.push("documento_invalido")
    observacoes.push("Ha documento invalido ou com classificacao desconhecida.")
  }

  return {
    riscos: [...new Set(riscos)],
    observacoes,
    documentosSugeridos: [...new Set(documentosSugeridos)]
  }
}

function criarDossieJuridico(input = {}, options = {}) {
  const registry = input.registry || input.documentRegistry || input
  const contato = input.contatoHubSpot || input.contato || input.contact || {}
  const negocio = input.negocioHubSpot || input.negocio || input.deal || {}
  const checklist = input.checklist || gerarChecklistDocumental(registry, options)
  const detector = input.divergenciasDocumentais || input.detector || detectarDivergenciasDocumentais(registry)

  return {
    versao: LEGAL_DOSSIER_VERSION,
    cliente: montarCliente(registry, contato, input.cliente || {}),
    caso: montarCaso(registry, negocio, input.caso || {}),
    documentacao: montarDocumentacao(checklist),
    divergencias: normalizarArray(detector.divergencias),
    cronologia: montarCronologia(registry),
    pdfs: montarPdfs(registry),
    links: montarLinks(registry, negocio),
    copiloto: montarCopiloto(checklist, detector)
  }
}

module.exports = {
  LEGAL_DOSSIER_VERSION,
  criarDossieJuridico
}
