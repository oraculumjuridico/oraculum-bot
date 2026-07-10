const { normalizarTextoGatilho, sanitizarTextoEntrada } = require("../utils/text")

const DOCUMENTOS_POR_AREA = {
  INSS: [
    "RG",
    "CPF",
    "CNIS",
    "Carta de indeferimento",
    "Processo administrativo",
    "Laudos",
    "Receitas",
    "Exames"
  ],
  Trabalhista: [
    "CTPS",
    "Contrato",
    "Holerites",
    "Extrato FGTS",
    "TRCT",
    "Cartoes de ponto",
    "Convencao coletiva"
  ],
  Familia: [
    "Certidao de casamento",
    "Certidao de nascimento",
    "Comprovante de residencia",
    "Comprovantes financeiros"
  ],
  Consumidor: [
    "Contrato",
    "Nota fiscal",
    "Conversas",
    "Comprovantes",
    "Prints"
  ],
  Bancario: [
    "Contrato bancario",
    "Extratos",
    "Comprovantes de desconto",
    "Prints do aplicativo",
    "Comunicacoes do banco"
  ],
  Penal: [
    "Boletim de ocorrencia",
    "Inquerito",
    "Intimacoes",
    "Sentencas",
    "Procuracao"
  ],
  Civil: [
    "Contratos",
    "Comprovantes",
    "Fotos",
    "Mensagens"
  ],
  Imobiliario: [
    "Matricula",
    "Escritura",
    "Contrato",
    "IPTU",
    "Fotos"
  ],
  Outros: [
    "Documentos pessoais",
    "Comprovantes",
    "Contratos",
    "Mensagens"
  ]
}

const PERGUNTAS_POR_AREA = {
  INSS: [
    "Houve pericia?",
    "Beneficio foi negado?",
    "Possui laudos recentes?",
    "O beneficio foi cessado?",
    "Existe recurso administrativo em andamento?"
  ],
  Trabalhista: [
    "Recebia horas extras?",
    "Tinha intervalo?",
    "Possui testemunhas?",
    "Houve assedio?",
    "Recebia comissao?"
  ],
  Familia: [
    "Existem filhos?",
    "Ha acordo?",
    "Existe medida protetiva?",
    "Ha valores de alimentos em atraso?",
    "As partes moram na mesma cidade?"
  ],
  Consumidor: [
    "Tentou resolver administrativamente?",
    "Possui protocolo?",
    "O produto ou servico ainda esta em garantia?",
    "Houve negativacao?",
    "Tem comprovante de pagamento?"
  ],
  Bancario: [
    "Qual banco ou financeira esta envolvido?",
    "Ha contrato ou proposta do emprestimo?",
    "Existe desconto em folha ou beneficio?",
    "Houve negativacao?",
    "Tentou resolver administrativamente?"
  ],
  Penal: [
    "Existe audiencia marcada?",
    "Houve intimacao recente?",
    "O cliente e vitima, acusado ou familiar?",
    "Existe boletim de ocorrencia?",
    "Ha risco de prisao ou medida cautelar?"
  ],
  Civil: [
    "Existe contrato escrito?",
    "Ha prazo judicial ou notificacao recente?",
    "Possui comprovantes de pagamento?",
    "Existem mensagens entre as partes?",
    "Ha testemunhas?"
  ],
  Imobiliario: [
    "Existe contrato escrito?",
    "O imovel possui matricula atualizada?",
    "Ha notificacao ou prazo para desocupacao?",
    "O IPTU esta em nome de quem?",
    "Existem fotos ou vistorias?"
  ],
  Outros: [
    "Existe algum prazo informado?",
    "Ha documentos principais do caso?",
    "Tentou resolver administrativamente?",
    "Existe parte contraria identificada?"
  ]
}

function normalizarArea(area) {
  const texto = normalizarTextoGatilho(area)
  if (texto.includes("inss") || texto.includes("previd")) return "INSS"
  if (texto.includes("trabalh")) return "Trabalhista"
  if (texto.includes("famil") || texto.includes("fam")) return "Familia"
  if (texto.includes("banc") || texto.includes("financ") || texto.includes("emprest")) return "Bancario"
  if (texto.includes("consum")) return "Consumidor"
  if (texto.includes("penal") || texto.includes("criminal")) return "Penal"
  if (texto.includes("civil")) return "Civil"
  if (texto.includes("imob") || texto.includes("imovel")) return "Imobiliario"
  return "Outros"
}

function valoresTexto(objeto = {}) {
  if (!objeto || typeof objeto !== "object") return []
  return Object.values(objeto).flatMap(valor => {
    if (valor && typeof valor === "object" && !Array.isArray(valor)) {
      if (Object.prototype.hasOwnProperty.call(valor, "valor")) return [valor.valor]
      return valoresTexto(valor)
    }
    return [valor]
  }).filter(valor => valor !== null && valor !== undefined && String(valor).trim())
}

function montarTextoCaso(entrada = {}) {
  return [
    entrada.areaJuridica,
    entrada.area,
    entrada.tipoCaso,
    entrada.tipo,
    entrada.resumo,
    entrada.descricao,
    ...valoresTexto(entrada.dadosColetados || entrada.dados || {}),
    ...valoresTexto(entrada.informacoesEspecificas || {})
  ].map(sanitizarTextoEntrada).filter(Boolean).join(" ")
}

function normalizarLista(lista) {
  if (!Array.isArray(lista)) return []
  return lista
    .map(item => {
      if (typeof item === "string") return item
      return item?.label || item?.nome || item?.documento || item?.id || ""
    })
    .map(sanitizarTextoEntrada)
    .filter(Boolean)
}

function contemDocumento(documentosInformados, documento) {
  const alvo = normalizarTextoGatilho(documento)
  return documentosInformados.some(item => {
    const texto = normalizarTextoGatilho(item)
    return texto === alvo || texto.includes(alvo) || alvo.includes(texto)
  })
}

function camposObrigatoriosPendentes(entrada = {}) {
  const obrigatorios = normalizarLista(entrada.camposObrigatorios)
  const dados = entrada.dadosColetados || entrada.dados || {}
  return obrigatorios.filter(campo => {
    const valor = dados?.[campo]?.valor ?? dados?.[campo]
    return valor === null || valor === undefined || String(valor).trim() === ""
  })
}

function adicionarRisco(riscos, texto) {
  if (!texto) return
  const risco = /^poss[ií]vel\b/i.test(texto) ? texto : `Poss\u00edvel ${texto}`
  if (!riscos.includes(risco)) riscos.push(risco)
}

function identificarRiscos({ area, textoNormalizado, documentosJaInformados, documentosPendentes, camposPendentes, dados }) {
  const riscos = []

  if (documentosJaInformados.length < 2) adicionarRisco(riscos, "documentacao incompleta.")
  if (documentosPendentes.length >= 4) adicionarRisco(riscos, "poucos documentos para analise inicial.")
  if (camposPendentes.length) adicionarRisco(riscos, "campos obrigatorios ainda sem confirmacao.")
  if (/\b(prescri|prazo venceu|muito tempo|anos atras)\b/.test(textoNormalizado)) adicionarRisco(riscos, "prescricao.")
  if (/\b(data conflitante|datas conflitantes|nao lembro a data|nao sei a data)\b/.test(textoNormalizado)) adicionarRisco(riscos, "datas conflitantes ou incompletas.")

  if (area === "Trabalhista" && !/\btestemunh/.test(textoNormalizado)) {
    adicionarRisco(riscos, "testemunhas nao informadas.")
  }
  if (area === "INSS" && /\b(cessad|cortad|suspens)\b/.test(textoNormalizado)) {
    adicionarRisco(riscos, "beneficio ja cessado.")
  }
  if (area === "Penal" && !documentosJaInformados.some(doc => normalizarTextoGatilho(doc).includes("procur"))) {
    adicionarRisco(riscos, "ausencia de procuracao.")
  }

  const admissao = Date.parse(dados?.dataAdmissao?.valor || dados?.dataAdmissao || "")
  const demissao = Date.parse(dados?.dataDemissao?.valor || dados?.dataDemissao || "")
  if (!Number.isNaN(admissao) && !Number.isNaN(demissao) && admissao > demissao) {
    adicionarRisco(riscos, "datas conflitantes.")
  }

  return riscos
}

function calcularUrgencia({ textoNormalizado, documentosPendentes, camposPendentes }) {
  const justificativas = []

  if (/\b(prazo proximo|prazo venc|audiencia|audiencia marcada|intimac|hoje|amanha|liminar|tutela|urgente)\b/.test(textoNormalizado)) {
    justificativas.push("Ha indicios de prazo, audiencia ou tutela urgente.")
  }
  if (/\b(sem beneficio|beneficio cortado|sem renda|risco alimentar|alimentos atrasados|despejo|prisao)\b/.test(textoNormalizado)) {
    justificativas.push("Ha indicios de impacto imediato ou risco alimentar.")
  }
  if (justificativas.length) return { nivel: "Alta", justificativas }

  if (documentosPendentes.length || camposPendentes.length || /\b(diligencia|buscar documento|incomplet)\b/.test(textoNormalizado)) {
    return {
      nivel: "M\u00e9dia",
      justificativas: ["Ha documentacao incompleta ou necessidade de diligencia."]
    }
  }

  return {
    nivel: "Baixa",
    justificativas: ["Consulta inicial sem prazo imediato identificado."]
  }
}

function analisarCasoJuridico(entrada = {}) {
  const area = normalizarArea(entrada.areaJuridica || entrada.area)
  const documentosRecomendados = [...(DOCUMENTOS_POR_AREA[area] || DOCUMENTOS_POR_AREA.Outros)]
  const perguntasSugeridas = [...(PERGUNTAS_POR_AREA[area] || PERGUNTAS_POR_AREA.Outros)]
  const documentosJaInformados = normalizarLista(entrada.documentosJaInformados || entrada.documentosInformados || entrada.documentos)
  const documentosPendentes = documentosRecomendados.filter(doc => !contemDocumento(documentosJaInformados, doc))
  const camposPendentes = camposObrigatoriosPendentes(entrada)
  const textoNormalizado = normalizarTextoGatilho(montarTextoCaso(entrada))
  const dados = entrada.dadosColetados || entrada.dados || {}
  const riscosIdentificados = identificarRiscos({
    area,
    textoNormalizado,
    documentosJaInformados,
    documentosPendentes,
    camposPendentes,
    dados
  })
  const urgencia = calcularUrgencia({ textoNormalizado, documentosPendentes, camposPendentes })

  return {
    documentosRecomendados,
    documentosPendentes,
    perguntasSugeridas,
    riscosIdentificados,
    urgencia
  }
}

module.exports = {
  DOCUMENTOS_POR_AREA,
  PERGUNTAS_POR_AREA,
  analisarCasoJuridico
}
