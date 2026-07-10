const DOCUMENT_CHECKLIST_VERSION = "document-checklist-v1"

const MATRIZ_DOCUMENTAL = Object.freeze({
  trabalhista: {
    obrigatorios: ["RG", "CPF", "CTPS", "Holerites", "TRCT"],
    opcionais: ["Contrato de trabalho", "Extrato FGTS"]
  },
  inss: {
    obrigatorios: ["RG", "CPF", "CNIS"],
    opcionais: ["Cartas do INSS", "Laudos", "Receitas", "Exames"]
  },
  familia: {
    obrigatorios: ["RG", "CPF"],
    opcionais: ["Certidao nascimento", "Certidao casamento"]
  },
  consumidor: {
    obrigatorios: ["RG", "CPF"],
    opcionais: ["Contrato", "Comprovantes", "Prints"]
  },
  penal: {
    obrigatorios: ["RG", "CPF"],
    opcionais: ["BO", "Processo", "Decisoes"]
  },
  civil: {
    obrigatorios: ["RG", "CPF"],
    opcionais: []
  },
  imobiliario: {
    obrigatorios: ["RG", "CPF"],
    opcionais: ["Matricula", "Contrato", "IPTU"]
  }
})

const ALIASES_DOCUMENTAIS = Object.freeze({
  RG: ["rg", "rg frente", "rg verso", "cnh", "identidade", "documento de identidade"],
  CPF: ["cpf", "cadastro de pessoa fisica"],
  CTPS: ["ctps", "carteira de trabalho"],
  Holerites: ["holerite", "holerites", "contracheque", "recibo de salario"],
  TRCT: ["trct", "termo de rescisao", "termo de rescisao do contrato de trabalho"],
  "Contrato de trabalho": ["contrato de trabalho"],
  "Extrato FGTS": ["extrato fgts", "fgts"],
  CNIS: ["cnis"],
  "Cartas do INSS": ["carta do inss", "cartas do inss", "comunicacao de decisao", "indeferimento"],
  Laudos: ["laudo", "laudos", "atestado"],
  Receitas: ["receita", "receitas"],
  Exames: ["exame", "exames"],
  "Certidao nascimento": ["certidao de nascimento", "certidao nascimento"],
  "Certidao casamento": ["certidao de casamento", "certidao casamento"],
  Contrato: ["contrato"],
  Comprovantes: ["comprovante", "comprovantes", "nota fiscal", "recibo"],
  Prints: ["print", "prints", "screenshot", "conversa"],
  BO: ["bo", "boletim de ocorrencia"],
  Processo: ["processo", "peticao", "sentenca", "andamento"],
  Decisoes: ["decisao", "decisoes", "sentenca"],
  Matricula: ["matricula", "matricula do imovel"],
  IPTU: ["iptu"]
})

function normalizarTexto(valor = "") {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizarArray(valor) {
  return Array.isArray(valor) ? valor : []
}

function documentoReferencia(documento = {}, extra = {}) {
  return {
    item: extra.item || null,
    registryId: documento.registryId || documento.chaveDocumento || null,
    fileId: documento.fileId || null,
    hash: documento.hash || null,
    nome: documento.nome || null,
    tipoDocumento: documento.tipoDocumento || null,
    status: documento.status || null,
    ...extra
  }
}

function versaoVigente(documento = {}) {
  return normalizarArray(documento.versoes).at(-1) || documento
}

function extracaoVigente(documento = {}) {
  return versaoVigente(documento).extracao || documento.extracao || {}
}

function camposExtraidos(documento = {}) {
  return extracaoVigente(documento).camposExtraidos || {}
}

function textosDocumento(documento = {}) {
  const versao = versaoVigente(documento)
  const campos = camposExtraidos(documento)
  return [
    documento.tipoDocumento,
    documento.categoria,
    documento.nome,
    versao.tipoDocumento,
    versao.categoria,
    versao.nome,
    ...Object.entries(campos).flatMap(([campo, valor]) => [campo, valor])
  ].filter(Boolean).map(normalizarTexto)
}

function documentoCorresponde(documento = {}, item) {
  const textos = textosDocumento(documento)
  const aliases = (ALIASES_DOCUMENTAIS[item] || [item]).map(normalizarTexto)
  return aliases.some(alias => textos.some(texto =>
    texto === alias ||
    texto.includes(alias) ||
    alias.includes(texto)
  ))
}

function documentosAtuais(registry = {}) {
  return normalizarArray(registry.documentos).filter(documento =>
    documento.vigente !== false &&
    documento.status !== "erro"
  )
}

function documentosInvalidos(registry = {}) {
  return normalizarArray(registry.documentos)
    .filter(documento =>
      documento.status === "erro" ||
      normalizarTexto(documento.tipoDocumento) === "documento desconhecido"
    )
    .map(documento => documentoReferencia(documento, {
      motivo: documento.status === "erro" ? "erro_processamento" : "tipo_desconhecido",
      erros: normalizarArray(versaoVigente(documento).erros).concat(normalizarArray(documento.erros))
    }))
}

function documentosDuplicados(registry = {}) {
  return normalizarArray(registry.documentos)
    .filter(documento => documento.duplicado)
    .map(documento => documentoReferencia(documento, {
      duplicadosCom: normalizarArray(documento.duplicadosCom)
    }))
}

function parseDataPossivel(valor) {
  if (!valor) return null
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor
  const texto = String(valor).trim()
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00.000Z`)
  const br = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (br) return new Date(`${br[3]}-${br[2]}-${br[1]}T00:00:00.000Z`)
  const data = new Date(texto)
  return Number.isNaN(data.getTime()) ? null : data
}

function dataReferencia(options = {}) {
  return parseDataPossivel(options.today || options.now) || new Date()
}

function extrairDataVencimento(documento = {}) {
  const campos = camposExtraidos(documento)
  const chaves = Object.keys(campos)
  const chave = chaves.find(campo => {
    const normalizado = normalizarTexto(campo)
    return [
      "validade",
      "data validade",
      "data de validade",
      "vencimento",
      "data vencimento",
      "data de vencimento"
    ].includes(normalizado)
  })
  return chave ? parseDataPossivel(campos[chave]) : null
}

function documentosVencidos(registry = {}, options = {}) {
  const hoje = dataReferencia(options)
  return documentosAtuais(registry)
    .map(documento => ({ documento, vencimento: extrairDataVencimento(documento) }))
    .filter(item => item.vencimento && item.vencimento < hoje)
    .map(item => documentoReferencia(item.documento, {
      dataVencimento: item.vencimento.toISOString().slice(0, 10)
    }))
}

function resolverArea(registry = {}, options = {}) {
  const origem = [
    options.area,
    registry.area,
    registry.areaJuridica,
    registry.metadados?.area,
    registry.metadados?.areaJuridica,
    registry.metadados?.area_juridica,
    registry.metadados?.tipo_de_caso,
    registry.metadados?.tipoCaso
  ].filter(Boolean).join(" ")
  const texto = normalizarTexto(origem)
  if (texto.includes("trabalh")) return "trabalhista"
  if (texto.includes("inss") || texto.includes("previd")) return "inss"
  if (texto.includes("famil")) return "familia"
  if (texto.includes("consum")) return "consumidor"
  if (texto.includes("penal") || texto.includes("criminal")) return "penal"
  if (texto.includes("imob") || texto.includes("imovel")) return "imobiliario"
  if (texto.includes("civil")) return "civil"
  return options.areaPadrao || "civil"
}

function localizarRecebidos(registry = {}, itens = []) {
  const atuais = documentosAtuais(registry)
  return itens.flatMap(item => {
    const encontrados = atuais.filter(documento => documentoCorresponde(documento, item))
    if (!encontrados.length) return []
    return [{
      item,
      documentos: encontrados.map(documento => documentoReferencia(documento))
    }]
  })
}

function itensPendentes(itens = [], recebidos = []) {
  const recebidosSet = new Set(recebidos.map(item => item.item))
  return itens
    .filter(item => !recebidosSet.has(item))
    .map(item => ({ item }))
}

function gerarResumo({ totalObrigatorios, recebidosObrigatorios, pendentes, percentualCompleto }) {
  if (!totalObrigatorios) {
    return "Nenhuma matriz documental obrigatoria foi identificada para a area informada."
  }
  if (percentualCompleto === 100) {
    return [
      "Documentacao completa.",
      `Foram identificados ${totalObrigatorios} documentos obrigatorios.`,
      "Todos foram recebidos."
    ].join(" ")
  }
  const faltantes = pendentes.map(item => item.item).join(" e ")
  return [
    "Documentacao parcialmente completa.",
    `Foram identificados ${totalObrigatorios} documentos obrigatorios.`,
    `${recebidosObrigatorios} foram recebidos.`,
    faltantes ? `Restam ${faltantes}.` : "Nao ha pendencias obrigatorias identificadas."
  ].join(" ")
}

function gerarChecklistDocumental(registry = {}, options = {}) {
  const area = resolverArea(registry, options)
  const matriz = MATRIZ_DOCUMENTAL[area] || MATRIZ_DOCUMENTAL.civil
  const recebidos = localizarRecebidos(registry, matriz.obrigatorios)
  const pendentes = itensPendentes(matriz.obrigatorios, recebidos)
  const opcionaisRecebidos = localizarRecebidos(registry, matriz.opcionais)
  const opcionaisPendentes = itensPendentes(matriz.opcionais, opcionaisRecebidos)
  const percentualCompleto = matriz.obrigatorios.length
    ? Math.round((recebidos.length / matriz.obrigatorios.length) * 100)
    : 100

  return {
    versao: DOCUMENT_CHECKLIST_VERSION,
    area,
    recebidos,
    pendentes,
    opcionaisRecebidos,
    opcionaisPendentes,
    duplicados: documentosDuplicados(registry),
    invalidos: documentosInvalidos(registry),
    vencidos: documentosVencidos(registry, options),
    percentualCompleto,
    resumo: gerarResumo({
      totalObrigatorios: matriz.obrigatorios.length,
      recebidosObrigatorios: recebidos.length,
      pendentes,
      percentualCompleto
    })
  }
}

module.exports = {
  DOCUMENT_CHECKLIST_VERSION,
  MATRIZ_DOCUMENTAL,
  gerarChecklistDocumental
}
