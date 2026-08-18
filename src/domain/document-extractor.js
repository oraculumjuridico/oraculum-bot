const CAMPOS_POR_DOCUMENTO = Object.freeze({
  rg: ["nome", "cpf", "rg", "dataNascimento", "filiacao", "orgaoEmissor", "uf", "dataEmissao"],
  cnh: ["nome", "cpf", "registro", "categoria", "validade", "primeiraHabilitacao"],
  ctps: ["numero", "serie", "uf"],
  certidao: ["nome", "filiacao", "dataNascimento", "livro", "folha", "termo"],
  holerite: ["empresa", "competencia", "cargo", "salarioLiquido", "salarioBruto"],
  cnis: ["nb", "der", "dib", "dcb", "beneficio"],
  cartaInss: ["nb", "tipoDecisao", "data", "beneficio"],
  laudo: ["medico", "crm", "especialidade", "cid", "dataLaudo"],
  processo: ["numero", "vara", "tribunal"],
  cpf: ["cpf", "nome"],
  cadastroSocial: ["nome", "cpf", "nis", "dataAtualizacao", "municipio"]
})

function normalizarTexto(texto = "") {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function limparValor(valor = "") {
  return String(valor || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s:;.,-]+/, "")
    .replace(/[\s;,.:-]+$/, "")
    .trim()
}

function normalizarLinhas(texto = "") {
  return String(texto || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(linha => linha.trim())
    .filter(Boolean)
}

function criarResultadoBase() {
  return {
    camposExtraidos: {},
    confiancaPorCampo: {},
    camposNaoEncontrados: [],
    avisos: [],
    erros: []
  }
}

function serializarErro(error, code = "DOCUMENT_EXTRACTION_ERROR") {
  return {
    code: error?.code || code,
    message: error?.message || String(error || "erro desconhecido na extracao documental")
  }
}

function resolverFamiliaDocumento(tipoDocumento, resultadoClassificador = {}) {
  const tipo = normalizarTexto(tipoDocumento || resultadoClassificador.tipoDocumento)
  const categoria = normalizarTexto(resultadoClassificador.categoria)
  const subtipo = normalizarTexto(resultadoClassificador.subtipo)

  if (tipo.includes("cpf") && !tipo.includes("rg")) return "cpf"
  if (tipo.includes("rg")) return "rg"
  if (tipo.includes("cnh") || tipo.includes("habilitacao")) return "cnh"
  if (tipo.includes("ctps") || tipo.includes("carteira de trabalho")) return "ctps"
  if (tipo.includes("certidao")) return "certidao"
  if (tipo.includes("holerite") || tipo.includes("contracheque")) return "holerite"
  if (tipo.includes("cnis")) return "cnis"
  if (tipo.includes("carta do inss") || tipo.includes("indeferimento") || tipo.includes("comunicacao de decisao")) return "cartaInss"
  if (tipo.includes("laudo") || subtipo.includes("laudo")) return "laudo"
  if (categoria.includes("cadastro_social") || tipo.includes("cadastro unico") || tipo.includes("cras")) return "cadastroSocial"
  if (categoria.includes("processual") || ["peticao", "sentenca", "decisao", "andamento"].some(item => tipo.includes(item))) return "processo"

  return null
}

function encontrarPorRegex(texto, patterns, confidence = 0.86) {
  for (const pattern of patterns) {
    const match = String(texto || "").match(pattern)
    const value = limparValor(match?.[1])
    if (value) {
      return { value, confidence }
    }
  }
  return null
}

function encontrarPorLinha(texto, labels, confidence = 0.82) {
  const linhas = normalizarLinhas(texto)
  const labelsNormalizados = labels.map(normalizarTexto)

  for (const linha of linhas) {
    const linhaNormalizada = normalizarTexto(linha)
    for (const label of labelsNormalizados) {
      const index = linhaNormalizada.indexOf(label)
      if (index === -1) continue

      const valor = limparValor(linha.slice(index + label.length))
      if (valor && normalizarTexto(valor) !== label) {
        return { value: valor, confidence }
      }
    }
  }

  return null
}

function primeiroValor(...candidatos) {
  return candidatos.find(Boolean) || null
}

function dataPorRotulo(texto, labels) {
  const labelPattern = labels.map(label => normalizarTexto(label).replace(/\s+/g, "\\s+")).join("|")
  const textoNormalizado = normalizarTexto(texto)
  const match = textoNormalizado.match(new RegExp(`(?:${labelPattern}).{0,30}?(\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4})`, "i"))
  if (match?.[1]) return { value: match[1], confidence: 0.86 }
  return null
}

function setCampo(resultado, campo, candidato) {
  if (!candidato?.value) return
  resultado.camposExtraidos[campo] = candidato.value
  resultado.confiancaPorCampo[campo] = candidato.confidence
}

function extrairPessoaBasico(texto) {
  return {
    nome: primeiroValor(
      encontrarPorLinha(texto, ["nome civil", "nome"], 0.84),
      encontrarPorRegex(texto, [/\bnome\s*[:.-]?\s*([A-ZÀ-Ý][A-ZÀ-Ý\s.'-]{4,})/i], 0.78)
    ),
    cpf: encontrarPorRegex(texto, [
      /\bcpf\s*[:.-]?\s*(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/i,
      /\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/
    ], 0.9),
    dataNascimento: primeiroValor(
      dataPorRotulo(texto, ["data de nascimento", "nascimento", "nasc"]),
      encontrarPorRegex(texto, [/\bnasc(?:imento)?\s*[:.-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i], 0.82)
    ),
    filiacao: primeiroValor(
      encontrarPorLinha(texto, ["filiacao", "filiação"], 0.78),
      encontrarPorRegex(texto, [/\bfili[açc][aã]o\s*[:.-]?\s*([A-ZÀ-Ý][A-ZÀ-Ý\s.'-]{8,})/i], 0.76)
    )
  }
}

function extrairRG(texto) {
  return {
    ...extrairPessoaBasico(texto),
    rg: encontrarPorRegex(texto, [
      /\b(?:rg|registro geral)\s*[:.-]?\s*([0-9][0-9.\- ]{4,}[0-9xX]?)/i,
      /\bidentidade\s*[:.-]?\s*([0-9][0-9.\- ]{4,}[0-9xX]?)/i
    ], 0.88),
    orgaoEmissor: encontrarPorRegex(texto, [
      /\b(?:orgao emissor|órgão emissor|emissor)\s*[:.-]?\s*([A-Z]{2,10}(?:[/-][A-Z]{2})?)/i,
      /\b(SSP[/-][A-Z]{2})\b/i
    ], 0.84),
    uf: encontrarPorRegex(texto, [
      /\b(?:uf|estado)\s*[:.-]?\s*([A-Z]{2})\b/i,
      /\bSSP[/-]([A-Z]{2})\b/i
    ], 0.8),
    dataEmissao: dataPorRotulo(texto, ["data de emissao", "expedicao", "emissao"])
  }
}

function extrairCNH(texto) {
  return {
    ...extrairPessoaBasico(texto),
    registro: encontrarPorRegex(texto, [
      /\b(?:registro|renach)\s*[:.-]?\s*([0-9]{6,15})/i
    ], 0.88),
    categoria: encontrarPorRegex(texto, [
      /\bcategoria\s*[:.-]?\s*([A-E]{1,2}(?:\/[A-E])?)\b/i,
      /\bcat\.?\s*hab\.?\s*[:.-]?\s*([A-E]{1,2}(?:\/[A-E])?)\b/i
    ], 0.86),
    validade: dataPorRotulo(texto, ["validade", "valido ate"]),
    primeiraHabilitacao: dataPorRotulo(texto, ["primeira habilitacao", "1 habilitacao", "1a habilitacao"])
  }
}

function extrairCTPS(texto) {
  return {
    numero: encontrarPorRegex(texto, [
      /\b(?:ctps|numero|n[uú]mero)\s*[:.-]?\s*([0-9]{3,12})/i
    ], 0.84),
    serie: encontrarPorRegex(texto, [
      /\b(?:serie|s[eé]rie)\s*[:.-]?\s*([0-9A-Z]{2,8})/i
    ], 0.84),
    uf: encontrarPorRegex(texto, [
      /\buf\s*[:.-]?\s*([A-Z]{2})\b/i
    ], 0.82)
  }
}

function extrairCertidao(texto) {
  return {
    ...extrairPessoaBasico(texto),
    livro: encontrarPorRegex(texto, [/\blivro\s*[:.-]?\s*([A-Z0-9/-]{1,12})/i], 0.86),
    folha: encontrarPorRegex(texto, [/\bfolha\s*[:.-]?\s*([A-Z0-9/-]{1,12})/i], 0.86),
    termo: encontrarPorRegex(texto, [/\btermo\s*[:.-]?\s*([A-Z0-9/-]{1,15})/i], 0.86)
  }
}

function extrairHolerite(texto) {
  return {
    empresa: primeiroValor(
      encontrarPorLinha(texto, ["empresa", "empregador", "razao social"], 0.82),
      encontrarPorRegex(texto, [/\b(?:empresa|empregador)\s*[:.-]?\s*([A-ZÀ-Ý0-9][A-ZÀ-Ý0-9\s.&'-]{3,})/i], 0.78)
    ),
    competencia: encontrarPorRegex(texto, [
      /\bcompet[eê]ncia\s*[:.-]?\s*([0-1]?\d[/-]\d{4})/i,
      /\bcompet[eê]ncia\s*[:.-]?\s*([a-zç]+\/\d{4})/i
    ], 0.86),
    cargo: encontrarPorLinha(texto, ["cargo", "funcao", "função"], 0.78),
    salarioLiquido: encontrarPorRegex(texto, [
      /\b(?:sal[aá]rio liquido|salario liquido|liquido a receber|valor liquido)\s*[:.-]?\s*(R?\$?\s*[0-9.]+,\d{2})/i
    ], 0.9),
    salarioBruto: encontrarPorRegex(texto, [
      /\b(?:sal[aá]rio bruto|salario bruto|total de proventos|proventos)\s*[:.-]?\s*(R?\$?\s*[0-9.]+,\d{2})/i
    ], 0.86)
  }
}

function extrairCNIS(texto) {
  return {
    nb: encontrarPorRegex(texto, [/\b(?:nb|beneficio)\s*[:.-]?\s*([0-9]{3}\.?[0-9]{3}\.?[0-9]{3}-?\d?)/i], 0.84),
    der: dataPorRotulo(texto, ["der"]),
    dib: dataPorRotulo(texto, ["dib"]),
    dcb: dataPorRotulo(texto, ["dcb"]),
    beneficio: encontrarPorLinha(texto, ["beneficio", "benefício", "especie", "espécie"], 0.78)
  }
}

function extrairCartaINSS(texto) {
  return {
    nb: encontrarPorRegex(texto, [/\b(?:nb|beneficio)\s*[:.-]?\s*([0-9]{3}\.?[0-9]{3}\.?[0-9]{3}-?\d?)/i], 0.84),
    tipoDecisao: primeiroValor(
      encontrarPorRegex(texto, [/\b(indeferido|indeferimento|deferido|concedido|cessado|suspenso)\b/i], 0.84),
      encontrarPorLinha(texto, ["tipo de decisao", "decisao", "decisão"], 0.78)
    ),
    data: primeiroValor(
      dataPorRotulo(texto, ["data da decisao", "data", "emissao"]),
      encontrarPorRegex(texto, [/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/], 0.68)
    ),
    beneficio: encontrarPorLinha(texto, ["beneficio", "benefício", "especie", "espécie"], 0.78)
  }
}

function extrairLaudo(texto) {
  return {
    medico: primeiroValor(
      encontrarPorLinha(texto, ["medico", "médico"], 0.82),
      encontrarPorRegex(texto, [/\b(?:dr\.?|dra\.?|medico|m[eé]dico)\s*[:.-]?\s*([A-ZÀ-Ý][A-ZÀ-Ý .'-]{4,})/i], 0.78)
    ),
    crm: encontrarPorRegex(texto, [/\bCRM\s*[:.-]?\s*([A-Z]{2}[/-]?\s*\d{3,8}|\d{3,8}[/-]?[A-Z]{2})\b/i], 0.9),
    especialidade: encontrarPorLinha(texto, ["especialidade"], 0.78),
    cid: encontrarPorRegex(texto, [/\bCID\s*[:.-]?\s*([A-Z]\d{2}(?:\.\d)?)\b/i], 0.9),
    dataLaudo: primeiroValor(
      dataPorRotulo(texto, ["data do laudo", "data"]),
      encontrarPorRegex(texto, [/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/], 0.66)
    )
  }
}

function extrairProcesso(texto) {
  return {
    numero: encontrarPorRegex(texto, [
      /\b(?:processo|autos)\s*[:.-]?\s*([0-9]{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/i,
      /\b([0-9]{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})\b/
    ], 0.92),
    vara: encontrarPorRegex(texto, [
      /\b(\d{1,2}[aªº]?\s+vara\s+[a-zà-ÿ\s]+)(?:\n|,|\.|$)/i,
      /\bvara\s*[:.-]?\s*([0-9a-zà-ÿªº\s]{4,})/i
    ], 0.82),
    tribunal: encontrarPorRegex(texto, [
      /\b(TRT-?\d{1,2}|TRF-?\d{1,2}|TJ[A-Z]{2}|TST|STJ|STF)\b/i,
      /\btribunal\s*[:.-]?\s*([A-ZÀ-Ýa-zà-ÿ\s]{4,})/i
    ], 0.82)
  }
}

function extrairCPF(texto) {
  return {
    cpf: primeiroValor(
      encontrarPorRegex(texto, [
        /\bcpf\s*[:.-]?\s*(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/i,
        /\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/
      ], 0.9),
      encontrarPorRegex(texto, [
        /\bcpf\s*[:.-]?\s*(\d{11})\b/i
      ], 0.82)
    ),
    nome: primeiroValor(
      encontrarPorLinha(texto, ["nome civil", "nome"], 0.84),
      encontrarPorRegex(texto, [/\bnome\s*[:.-]?\s*([A-ZÀ-Ý][A-ZÀ-Ý\s.'-]{4,})/i], 0.78)
    )
  }
}

function extrairCadastroSocial(texto) {
  return {
    nome: primeiroValor(
      encontrarPorLinha(texto, ["nome do responsavel familiar", "responsavel familiar", "nome completo", "nome"], 0.84),
      encontrarPorRegex(texto, [/\bnome\s*[:.-]?\s*([A-ZÀ-Ý][A-ZÀ-Ý\s.'-]{4,})/i], 0.76)
    ),
    cpf: primeiroValor(
      encontrarPorRegex(texto, [
        /\bcpf\s*[:.-]?\s*(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/i,
        /\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/
      ], 0.9),
      encontrarPorRegex(texto, [/\bcpf\s*[:.-]?\s*(\d{11})\b/i], 0.82)
    ),
    nis: encontrarPorRegex(texto, [
      /\b(?:nis|nit|pis|pasep)\s*[:.-]?\s*(\d{3}\.?\d{5}\.?\d{2}-?\d|\d{11})\b/i
    ], 0.9),
    dataAtualizacao: primeiroValor(
      dataPorRotulo(texto, ["data da atualizacao", "atualizado em", "ultima atualizacao", "data da entrevista"]),
      encontrarPorRegex(texto, [/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/], 0.64)
    ),
    municipio: encontrarPorLinha(texto, ["municipio", "cidade"], 0.8)
  }
}

const EXTRATORES = Object.freeze({
  rg: extrairRG,
  cnh: extrairCNH,
  ctps: extrairCTPS,
  certidao: extrairCertidao,
  holerite: extrairHolerite,
  cnis: extrairCNIS,
  cartaInss: extrairCartaINSS,
  laudo: extrairLaudo,
  processo: extrairProcesso,
  cpf: extrairCPF,
  cadastroSocial: extrairCadastroSocial
})

function extrairDadosDocumento(input = {}) {
  const resultado = criarResultadoBase()

  try {
    const tipoDocumento = input.tipoDocumento || input.resultadoClassificador?.tipoDocumento
    const textoOCR = String(input.textoOCR || "")
    const familia = resolverFamiliaDocumento(tipoDocumento, input.resultadoClassificador || {})

    if (!textoOCR.trim()) {
      resultado.erros.push({ code: "DOCUMENT_TEXT_REQUIRED", message: "texto OCR ausente ou vazio" })
      return resultado
    }

    if (!familia || !EXTRATORES[familia]) {
      resultado.avisos.push({
        code: "DOCUMENT_TYPE_UNSUPPORTED",
        message: `tipo documental sem extrator configurado: ${tipoDocumento || "desconhecido"}`
      })
      return resultado
    }

    const candidatos = EXTRATORES[familia](textoOCR)
    for (const campo of CAMPOS_POR_DOCUMENTO[familia]) {
      setCampo(resultado, campo, candidatos[campo])
      if (!resultado.camposExtraidos[campo]) {
        resultado.camposNaoEncontrados.push(campo)
      }
    }

    if (resultado.camposNaoEncontrados.length) {
      resultado.avisos.push({
        code: "DOCUMENT_FIELDS_NOT_FOUND",
        message: "um ou mais campos esperados nao foram encontrados"
      })
    }

    return resultado
  } catch (error) {
    resultado.erros.push(serializarErro(error))
    return resultado
  }
}

module.exports = {
  CAMPOS_POR_DOCUMENTO,
  extrairDadosDocumento,
  resolverFamiliaDocumento
}
