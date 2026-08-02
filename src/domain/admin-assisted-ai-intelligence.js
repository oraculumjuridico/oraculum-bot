const axios = require("axios")
const { sanitizarTextoEntrada } = require("../utils/text")
const { logErro } = require("../utils/logging")
const {
  AREAS_JURIDICAS_ADMIN_ASSISTIDO,
  criarCampoAdminAssistido,
  criarDadosVaziosAdminAssistido,
  normalizarAreaJuridicaAdminAssistido,
  normalizarStatusCampoAdminAssistido,
  normalizarCampoAdminAssistido,
  documentoPossuiEvidenciaNoRelato,
  isDocumentoGenericoRelato,
  calcularDocumentosPendentes,
  obterDocumentosRecomendadosPorArea
} = require("./admin-assisted-ai-schema")

const { GROQ_KEY } = process.env

function textoTemSobrenome(texto = "") {
  return sanitizarTextoEntrada(texto).split(/\s+/).filter(Boolean).length >= 2
}

function extrairNomeFallback(texto = "") {
  const entrada = sanitizarTextoEntrada(texto)
  const match = entrada.match(/\b(?:o\s+cliente\s+(?:é|e)|a\s+cliente\s+(?:é|e)|cliente\s*[:\-]|atendi(?:\s+hoje)?|caso(?:\s+[\p{L}-]+){0,3}?\s+(?:de|para)|para)\s+([^,.;\n]+)/iu)
  const candidato = match?.[1]?.trim() || ""
  const partes = candidato.split(/\s+/).filter(Boolean).slice(0, 7)
  if (partes.length < 2) return null
  const conectivos = new Set(["da", "de", "do", "das", "dos", "e"])
  if (!partes.every(parte => conectivos.has(parte.toLowerCase()) || /^\p{Lu}[\p{L}'-]+$/u.test(parte))) return null
  return partes.join(" ")
}

function detectarAreasAmbiguasFallback(texto = "") {
  const t = normalizarTextoAnalise(texto)
  const previdenciario = /\b(inss|previdenci|beneficio|aposentadoria|auxilio|bpc|loas|incapacidade)\b/.test(t)
  const pretensaoTrabalhista = /\b(rescis\w*|fgts|verbas|hora extra|salario atrasado)\b/.test(t)
  return previdenciario && pretensaoTrabalhista ? ["Trabalhista", "INSS"] : []
}

function extrairCpfFallback(texto = "") {
  const match = sanitizarTextoEntrada(texto).match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/)
  return match?.[0] || null
}

function extrairIdadeFallback(texto = "") {
  const match = sanitizarTextoEntrada(texto).match(/\b(?:idade\s*[:=-]?\s*|tem\s+)(\d{1,3})\s*(?:anos?)?\b/i)
  const idade = Number(match?.[1])
  return Number.isInteger(idade) && idade >= 0 && idade <= 130 ? idade : null
}

function extrairTelefoneFallback(texto = "") {
  const match = sanitizarTextoEntrada(texto).match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-\s]?\d{4}\b/)
  return match?.[0] || null
}

function extrairEmailFallback(texto = "") {
  const match = sanitizarTextoEntrada(texto).match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)
  return match?.[0] || null
}

function extrairCidadeUfFallback(texto = "") {
  const entrada = sanitizarTextoEntrada(texto)
  const matchCidadeUf = entrada.match(/\b(?:cidade|mora em|reside em|de)\s+([A-ZÀ-Ý][\wÀ-ÿ\s.'-]{2,40})\s*[-/,]\s*([A-Z]{2})\b/)
  if (matchCidadeUf) {
    return {
      cidade: matchCidadeUf[1].trim(),
      uf: matchCidadeUf[2].trim().toUpperCase()
    }
  }

  const matchUf = entrada.match(/\b(?:UF|estado)\s*[:\-]?\s*([A-Z]{2})\b/i)
  const matchCidade = entrada.match(/\b(?:cidade|mora em|reside em)\s*[:\-]?\s*([A-ZÀ-Ý][\wÀ-ÿ\s.'-]{2,40})(?:[.,;]|$)/)
  return {
    cidade: matchCidade?.[1]?.trim() || null,
    uf: matchUf?.[1]?.trim().toUpperCase() || null
  }
}

function extrairAposMarcador(texto = "", marcadores = []) {
  const entrada = sanitizarTextoEntrada(texto)
  for (const marcador of marcadores) {
    const re = new RegExp(`\\b${marcador}\\s*[:\\-]?\\s*([^.;\\n]+)`, "i")
    const match = entrada.match(re)
    if (match?.[1]) return match[1].trim()
  }
  return null
}

function detectarAreaFallback(texto = "") {
  const t = sanitizarTextoEntrada(texto).toLowerCase()
  if (/\b(inss|benef[ií]cio|aposentadoria|bpc|loas|aux[ií]lio|per[ií]cia)\b/.test(t)) return "INSS"
  if (/\b(trabalho|trabalhista|empresa|demiss|fgts|sal[aá]rio|rescis)\b/.test(t)) return "Trabalhista"
  if (/\b(div[oó]rcio|guarda|pens[aã]o|fam[ií]lia|invent[aá]rio)\b/.test(t)) return "Família"
  if (/\b(consumidor|banco|produto|servi[cç]o|cobran[cç]a|negativ)\b/.test(t)) return "Consumidor"
  if (/\b(crime|penal|pris[aã]o|delegacia|acusad|v[ií]tima)\b/.test(t)) return "Penal"
  if (/\b(im[oó]vel|aluguel|despejo|usucapi[aã]o|terreno)\b/.test(t)) return "Imobiliário"
  if (/\b(contrato|indeniza[cç][aã]o|d[ií]vida|civil)\b/.test(t)) return "Civil"
  return "Outros"
}

function detectarTipoCasoFallback(texto = "", area = "Outros") {
  const t = sanitizarTextoEntrada(texto).toLowerCase()

  if (area === "INSS") {
    if (/benef[ií]cio.*negad|indefer/.test(t)) return "Benefício negado"
    if (/aposentadoria/.test(t)) return "Aposentadoria"
    if (/\bbpc\b|\bloas\b/.test(t)) return "BPC/LOAS"
    if (/aux[ií]lio/.test(t)) return "Auxílio previdenciário"
  }

  if (area === "Trabalhista") {
    if (/demiss|rescis|verbas/.test(t)) return "Verbas rescisórias"
    if (/fgts/.test(t)) return "FGTS"
    if (/sal[aá]rio/.test(t)) return "Salários em atraso"
  }

  if (area === "Família") {
    if (/div[oó]rcio/.test(t)) return "Divórcio"
    if (/guarda/.test(t)) return "Guarda"
    if (/pens[aã]o/.test(t)) return "Pensão alimentícia"
    if (/invent[aá]rio/.test(t)) return "Inventário"
  }

  if (area === "Consumidor") {
    if (/negativ/.test(t)) return "Negativação indevida"
    if (/cobran[cç]a/.test(t)) return "Cobrança indevida"
    if (/produto|servi[cç]o/.test(t)) return "Problema com produto ou serviço"
  }

  if (area === "Bancário") {
    if (/consignado|emprest/.test(t)) return "Empréstimo/consignado"
    if (/cart[aã]o/.test(t)) return "Cartão bancário"
    if (/pix|conta/.test(t)) return "Conta/Pix"
    if (/negativ/.test(t)) return "Negativação bancária"
    if (/cobran[cç]a|desconto/.test(t)) return "Cobrança bancária"
  }

  if (area === "Penal") {
    if (/v[ií]tima/.test(t)) return "Vítima"
    if (/acusad|pris[aã]o/.test(t)) return "Defesa criminal"
  }

  if (area === "Imobiliário") {
    if (/despejo/.test(t)) return "Despejo"
    if (/aluguel|loca[cç][aã]o/.test(t)) return "Locação"
    if (/usucapi/.test(t)) return "Usucapião"
  }

  if (area === "Civil") {
    if (/indeniza[cç][aã]o/.test(t)) return "Indenização"
    if (/contrato/.test(t)) return "Contrato"
    if (/d[ií]vida/.test(t)) return "Dívida"
  }

  return null
}

function detectarTerceiroFallback(texto = "") {
  const t = sanitizarTextoEntrada(texto).toLowerCase()
  if (/\b(administrador|administradora|atendente)\b/.test(t) && /\b(?:o|a)\s+cliente\b/.test(t)) return true
  if (/\b(terceir|representante|para outra pessoa|em nome de|filho de|filha de|m[aã]e de|pai de)\b/.test(t)) return true
  if (/\b(cliente direto|para ele mesmo|para ela mesma|proprio cliente|pr[oó]prio cliente)\b/.test(t)) return false
  return null
}

function normalizarTextoAnalise(texto = "") {
  return sanitizarTextoEntrada(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function pontuarAreaAdminAssistido(regras = [], texto = "") {
  return regras.reduce((total, [regex, peso]) => total + (regex.test(texto) ? peso : 0), 0)
}

function detectarAreaPorIntencaoFallback(texto = "") {
  const t = normalizarTextoAnalise(texto)
  const scores = {
    INSS: pontuarAreaAdminAssistido([
      [/\b(inss|previdenci|aposentadoria|bpc|loas|beneficio|auxilio|pericia|incapacidade|indeferid|negou|negado|cessou|cortou)\b/, 5],
      [/\b(dar entrada|requerer|pedido|recurso|meu inss)\b/, 2],
      [/\b(sai do trabalho|demitid|empresa|patrao|trabalho)\b.*\b(inss|beneficio|aposentadoria|auxilio|bpc|loas)\b/, 8],
      [/\b(inss|beneficio|aposentadoria|auxilio|bpc|loas)\b.*\b(empresa|trabalho|demitid|patrao)\b/, 5]
    ], t),
    Trabalhista: pontuarAreaAdminAssistido([
      [/\b(trabalhista|demissao|demitid|fgts|salario|rescis|verbas|hora extra|assedio|patrao|empresa)\b/, 4],
      [/\b(sem receber|nao pagou|nao recebi)\b.*\b(salario|rescisao|fgts|empresa)\b/, 4]
    ], t),
    Família: pontuarAreaAdminAssistido([[/\b(divorcio|guarda|pensao alimenticia|familia|inventario|alimentos|filho|filha)\b/, 5]], t),
    Bancário: pontuarAreaAdminAssistido([
      [/\b(banco|bancario|financeira|emprestimo|cartao|pix|conta|tarifa|juros abusiv|consignado)\b/, 5],
      [/\b(banco|financeira)\b.*\b(descont|emprestimo|consignado|cartao|pix|conta|tarifa)\b/, 5],
      [/\b(emprestimo|consignado|cartao)\b.*\b(banco|financeira|descont|indevido)\b/, 5],
      [/\b(cobranca|negativacao|desconto)\b.*\b(banco|financeira|emprestimo|cartao|consignado)\b/, 4]
    ], t),
    Consumidor: pontuarAreaAdminAssistido([[/\b(consumidor|produto|servico|loja|fornecedor|garantia|entrega|defeito|cobranca indevida|negativacao)\b/, 4]], t),
    Penal: pontuarAreaAdminAssistido([[/\b(crime|penal|prisao|delegacia|acusad|vitima|boletim de ocorrencia)\b/, 5]], t),
    Imobiliário: pontuarAreaAdminAssistido([[/\b(imovel|aluguel|despejo|usucapiao|terreno|locacao|condominio)\b/, 5]], t),
    Civil: pontuarAreaAdminAssistido([[/\b(contrato|indenizacao|divida|civil|danos morais|cobranca)\b/, 3]], t)
  }

  if (scores.INSS > 0 && /\b(inss|previdenci|beneficio|aposentadoria|auxilio|bpc|loas)\b/.test(t)) {
    scores.Trabalhista = Math.max(0, scores.Trabalhista - 4)
  }

  const ordenados = Object.entries(scores).sort((a, b) => b[1] - a[1])
  const [area, score] = ordenados[0]
  const segundo = ordenados[1]?.[1] || 0
  if (!score || score < 4 || score - segundo < 2) return "Outros"
  return area
}

function extrairDocumentosMencionadosFallback(texto = "") {
  const t = normalizarTextoAnalise(texto)
  const docs = [
    [/\brg\b|identidade|cnh/, "RG/CNH"],
    [/\bcpf\b/, "CPF"],
    [/\bcnis\b|extrato de contribuic/, "CNIS"],
    [/carta.*(inss|indefer)|indeferimento/, "Carta de indeferimento"],
    [/laudo|atestado|exame|receita/, "Documentos médicos"],
    [/ctps|carteira de trabalho/, "CTPS"],
    [/holerite|contracheque/, "Holerites"],
    [/\btrct\b|rescis/, "TRCT"],
    [/contrato/, "Contrato"],
    [/extrato bancario|extrato do banco/, "Extrato bancário"],
    [/print|conversa|mensagem|whatsapp/, "Prints/conversas"]
  ]
  return docs.filter(([regex]) => regex.test(t)).map(([, label]) => label).join(", ") || null
}

function relatoIndicaDocumentosGenericos(texto = "") {
  const t = normalizarTextoAnalise(texto)
  return /\b(alguns documentos|documentacao|documentos|levou documentos|trouxe documentos)\b/.test(t)
}

function campoDocumentosDoRelato(texto = "") {
  const especificos = extrairDocumentosMencionadosFallback(texto)
  if (especificos) return criarCampoAdminAssistido(especificos, "confirmado")
  if (relatoIndicaDocumentosGenericos(texto)) {
    return criarCampoAdminAssistido("Documentos existentes, ainda não identificados", "precisa_conferir")
  }
  return criarCampoAdminAssistido(null, "ausente")
}

function detectarUrgenciaFallback(texto = "") {
  const t = normalizarTextoAnalise(texto)
  if (/\b(hoje|amanha|prazo|audiencia|intimacao|liminar|despejo|prisao|sem renda|sem receber|cortou|cortado|suspenso)\b/.test(t)) return "Alta"
  if (/\b(sem urgencia|sem prazo|quando der|pode esperar)\b/.test(t)) return "Baixa"
  return null
}

function montarResumoCurtoAdminAssistido({ area = "", tipoCaso = "", texto = "", urgencia = "" } = {}) {
  const entrada = sanitizarTextoEntrada(texto)
    .replace(/\s+/g, " ")
    .slice(0, 180)
  return [
    `Área: ${area || "Baixa confiança"}`,
    `Subárea: ${tipoCaso || "Baixa confiança"}`,
    `Situação: ${entrada || "Não informada"}`,
    `Objetivo do cliente: ${tipoCaso || area || "Não identificado"}`,
    `Pendências: ${urgencia ? `urgência ${urgencia.toLowerCase()}` : "complementar dados"}`
  ].join("\n")
}

function criarAnaliseFallback(texto = "") {
  const dados = criarDadosVaziosAdminAssistido()
  const areasProvaveis = detectarAreasAmbiguasFallback(texto)
  const area = areasProvaveis.length ? null : detectarAreaPorIntencaoFallback(texto)
  const nome = extrairNomeFallback(texto)
  const cpf = extrairCpfFallback(texto)
  const idade = extrairIdadeFallback(texto)
  const telefone = extrairTelefoneFallback(texto)
  const email = extrairEmailFallback(texto)
  const { cidade, uf } = extrairCidadeUfFallback(texto)
  const tipoCaso = detectarTipoCasoFallback(texto, area)
  const existeTerceiro = detectarTerceiroFallback(texto)
  const motivo = extrairAposMarcador(texto, ["motivo", "problema", "porque"])
  const empresa = extrairAposMarcador(texto, ["empresa", "empregador"])
  const beneficio = extrairAposMarcador(texto, ["beneficio", "benefício"])
  const parteContraria = extrairAposMarcador(texto, ["parte contraria", "parte contrária", "contra"])
  const fornecedor = extrairAposMarcador(texto, ["fornecedor", "banco", "loja"])
  const objetivo = extrairAposMarcador(texto, ["objetivo", "pretende", "quer", "precisa"])
  const profissao = extrairAposMarcador(texto, ["profissao", "profissão", "trabalha como", "cargo"])
  const orgao = extrairAposMarcador(texto, ["orgao", "órgão", "entidade"])
  const apelido = extrairAposMarcador(texto, ["nome social", "apelido"])
  const urgencia = detectarUrgenciaFallback(texto)

  dados.areaJuridica = criarCampoAdminAssistido(area, areasProvaveis.length ? "precisa_conferir" : "inferido")
  dados.tipoCaso = criarCampoAdminAssistido(tipoCaso || (area === "Outros" ? "Baixa confiança" : null), tipoCaso || area === "Outros" ? "inferido" : "ausente")
  dados.descricao = criarCampoAdminAssistido(sanitizarTextoEntrada(texto) || null, texto ? "confirmado" : "ausente")
  dados.resumoJuridico = criarCampoAdminAssistido(montarResumoCurtoAdminAssistido({ area, tipoCaso, texto, urgencia }), texto ? "inferido" : "ausente")
  dados.existeTerceiro = criarCampoAdminAssistido(existeTerceiro, existeTerceiro === null ? "ausente" : "inferido")
  dados.cpf = normalizarCampoAdminAssistido("cpf", cpf, cpf ? "confirmado" : "ausente")
  dados.idade = normalizarCampoAdminAssistido("idade", idade, idade !== null ? "confirmado" : "ausente")
  dados.telefone = criarCampoAdminAssistido(telefone, telefone ? "confirmado" : "ausente")
  dados.email = criarCampoAdminAssistido(email, email ? "confirmado" : "ausente")
  dados.cidade = criarCampoAdminAssistido(cidade, cidade ? "confirmado" : "ausente")
  dados.uf = criarCampoAdminAssistido(uf, uf ? "confirmado" : "ausente")
  dados.motivo = criarCampoAdminAssistido(motivo || tipoCaso, motivo ? "confirmado" : tipoCaso ? "inferido" : "ausente")
  dados.empresa = criarCampoAdminAssistido(empresa, empresa ? "confirmado" : "ausente")
  dados.beneficio = criarCampoAdminAssistido(beneficio, beneficio ? "confirmado" : "ausente")
  dados.parteContraria = criarCampoAdminAssistido(parteContraria, parteContraria ? "confirmado" : "ausente")
  dados.fornecedor = criarCampoAdminAssistido(fornecedor, fornecedor ? "confirmado" : "ausente")
  dados.objetivo = criarCampoAdminAssistido(objetivo, objetivo ? "confirmado" : "ausente")
  dados.profissao = criarCampoAdminAssistido(profissao, profissao ? "confirmado" : "ausente")
  dados.orgao = criarCampoAdminAssistido(orgao, orgao ? "confirmado" : "ausente")
  dados.apelido = criarCampoAdminAssistido(apelido, apelido ? "confirmado" : "ausente")
  dados.documentosMencionados = campoDocumentosDoRelato(texto)
  dados.urgencia = criarCampoAdminAssistido(urgencia, urgencia ? "inferido" : "ausente")

  if (nome) {
    dados.nomeCompleto = criarCampoAdminAssistido(nome, textoTemSobrenome(nome) ? "confirmado" : "inferido")
    dados.clientePrincipal = criarCampoAdminAssistido(nome, "inferido")
  }

  return {
    areaJuridica: area,
    areasProvaveis,
    tipoCaso: dados.tipoCaso.valor,
    clientePrincipal: nome,
    existeTerceiro,
    resumoJuridico: dados.resumoJuridico.valor,
    dados,
    origem: "fallback"
  }
}

function normalizarCampoExtraido(campo, valorCampo) {
  if (valorCampo && typeof valorCampo === "object" && !Array.isArray(valorCampo)) {
    return normalizarCampoAdminAssistido(
      campo,
      valorCampo.valor ?? null,
      normalizarStatusCampoAdminAssistido(valorCampo.status, valorCampo.valor)
    )
  }
  return normalizarCampoAdminAssistido(campo, valorCampo ?? null, valorCampo ? "inferido" : "ausente")
}

function normalizarAnaliseIA(parsed = {}, textoOriginal = "") {
  const dados = criarDadosVaziosAdminAssistido()
  const entradaDados = parsed.dados && typeof parsed.dados === "object" && !Array.isArray(parsed.dados)
    ? parsed.dados
    : {}

  for (const campo of Object.keys(dados)) {
    if (Object.prototype.hasOwnProperty.call(entradaDados, campo)) {
      const valorIA = normalizarCampoExtraido(campo, entradaDados[campo])
      // Proveniência documental: preservar documentos explicitamente encontrados no relato.
      // A IA não pode incluir documentos sem correspondência textual no relato original.
      if (campo === "documentosMencionados") {
        const doRelato = campoDocumentosDoRelato(textoOriginal)
        const daIA = valorIA?.valor || null
        const relatoValor = doRelato?.valor || null
        if (relatoValor) {
          // Se o relato tem documentos genéricos, não permite que a IA adicione específicos
          if (isDocumentoGenericoRelato(relatoValor)) {
            dados[campo] = criarCampoAdminAssistido(relatoValor, "precisa_conferir")
          } else {
            // União, normalização e remoção de duplicatas
            const itensRelato = relatoValor.split(",").map(s => s.trim()).filter(Boolean)
            const itensIA = daIA ? daIA.split(",").map(s => s.trim()).filter(Boolean) : []
            // Filtrar documentos da IA que não possuem evidência no texto original
            const itensIAComProva = itensIA.filter(item => documentoPossuiEvidenciaNoRelato(item, textoOriginal))
            const unificado = [...new Set([...itensRelato, ...itensIAComProva])]
            dados[campo] = criarCampoAdminAssistido(
              unificado.length ? unificado.join(", ") : null,
              relatoValor ? "confirmado" : "inferido"
            )
          }
        } else {
          // Sem documentos no relato: aceitar apenas documentos da IA com evidência textual
          const itensIA = daIA ? daIA.split(",").map(s => s.trim()).filter(Boolean) : []
          const itensIAComProva = itensIA.filter(item => documentoPossuiEvidenciaNoRelato(item, textoOriginal))
          dados[campo] = criarCampoAdminAssistido(
            itensIAComProva.length ? itensIAComProva.join(", ") : null,
            itensIAComProva.length ? "inferido" : "ausente"
          )
        }
      } else {
        dados[campo] = valorIA
      }
    }
  }

  const confianca = Number(parsed.confianca ?? parsed.confidence ?? parsed.classificationConfidence ?? 0)
  const baixaConfianca = Number.isFinite(confianca) && confianca > 0 && confianca < 0.65
  const area = baixaConfianca ? "Outros" : normalizarAreaJuridicaAdminAssistido(
    dados.areaJuridica?.valor || parsed.areaJuridica || parsed.area || "Outros"
  )
  dados.areaJuridica = criarCampoAdminAssistido(
    baixaConfianca ? null : area,
    baixaConfianca
      ? "precisa_conferir"
      : dados.areaJuridica?.status && dados.areaJuridica.status !== "ausente" ? dados.areaJuridica.status : "inferido"
  )

  if (!dados.descricao?.valor && textoOriginal) {
    dados.descricao = criarCampoAdminAssistido(sanitizarTextoEntrada(textoOriginal), "confirmado")
  }
  if (relatoIndicaDocumentosGenericos(textoOriginal) && !extrairDocumentosMencionadosFallback(textoOriginal)) {
    dados.documentosMencionados = campoDocumentosDoRelato(textoOriginal)
  }
  if (!dados.resumoJuridico?.valor && parsed.resumoJuridico) {
    dados.resumoJuridico = criarCampoAdminAssistido(parsed.resumoJuridico, "inferido")
  }
  if (!dados.tipoCaso?.valor && parsed.tipoCaso) {
    dados.tipoCaso = criarCampoAdminAssistido(parsed.tipoCaso, "inferido")
  }
  if (baixaConfianca) {
    dados.tipoCaso = criarCampoAdminAssistido("Baixa confiança", "inferido")
  }
  if (!dados.clientePrincipal?.valor && parsed.clientePrincipal) {
    dados.clientePrincipal = criarCampoAdminAssistido(parsed.clientePrincipal, "inferido")
  }
  if (dados.nomeCompleto?.valor && !dados.clientePrincipal?.valor) {
    dados.clientePrincipal = criarCampoAdminAssistido(dados.nomeCompleto.valor, "inferido")
  }

  // Documentos recomendados e pendentes por área
  const recomendados = obterDocumentosRecomendadosPorArea(area)
  dados.documentosRecomendados = criarCampoAdminAssistido(
    recomendados.length ? recomendados.join(", ") : null,
    "inferido"
  )
  dados.documentosPendentes = criarCampoAdminAssistido(
    (() => {
      const pendentes = calcularDocumentosPendentes(
        area,
        dados.documentosMencionados?.valor || "",
        []
      )
      return pendentes.length ? pendentes.join(", ") : null
    })(),
    "inferido"
  )

  return {
    areaJuridica: area,
    areasProvaveis: Array.isArray(parsed.areasProvaveis) ? parsed.areasProvaveis.slice(0, 3) : [],
    tipoCaso: dados.tipoCaso?.valor || null,
    clientePrincipal: dados.clientePrincipal?.valor || dados.nomeCompleto?.valor || null,
    existeTerceiro: dados.existeTerceiro?.valor ?? null,
    resumoJuridico: dados.resumoJuridico?.valor || dados.descricao?.valor || null,
    dados,
    origem: "groq"
  }
}

async function extrairDadosAtendimentoAssistidoIA(texto = "") {
  const entrada = sanitizarTextoEntrada(texto)
  if (!GROQ_KEY || !entrada) return criarAnaliseFallback(entrada)

  try {
    let     system = `Você extrai dados de um atendimento jurídico administrativo.
Responda APENAS JSON válido. Nunca invente informações.
Cada campo em "dados" deve ter exatamente o formato {"valor": valor ou null, "status": "confirmado"|"inferido"|"ausente"|"precisa_conferir"|"contraditorio"|"invalido"}.
Use "confirmado" somente para dado dito explicitamente pelo administrador.
Use "inferido" para conclusão razoável a partir do texto, como área jurídica ou tipo do caso.
Use "ausente" quando não houver informação. Use "precisa_conferir" para inferência relevante que depende de confirmação e "contraditorio" quando o relato trouxer valores incompatíveis.
Separe cliente principal, administrador, representante, familiar, empregador, testemunha, órgão e parte contrária. Nunca use o administrador como cliente quando o texto identificar outra pessoa como cliente.
Em documentosMencionados, liste exclusivamente documentos nominalmente citados no texto. Expressões genéricas como "alguns documentos" ou "documentação" significam documentos ainda não identificados; nunca complete com documentos prováveis da área. Se o relato mencionar "laudo médico" ou "laudo", inclua "Laudo médico/documento médico" apenas se houver essa referência explícita.

Áreas permitidas: ${AREAS_JURIDICAS_ADMIN_ASSISTIDO.join(", ")}.

Campos obrigatórios no objeto "dados":
nomeCompleto, cpf, dataNascimento, idade, telefone, email, cidade, uf,
areaJuridica, tipoCaso, descricao, clientePrincipal, existeTerceiro, resumoJuridico,
empresa, motivo, beneficio, parteContraria, vinculoFamiliar, fornecedor,
produtoServico, posicaoPenal, contratoOuFato, imovel, nb, dataNegativa,
situacao, cargo, dataAdmissao, dataDemissao, filhos, objetivo, problema,
documentosMencionados, urgencia, naturezaDemanda, orgao, apelido, profissao,
situacaoProfissional, estadoCivil, endereco, cep, acidenteTrabalho,
limitacoesAtuais, rendaAtual e composicaoFamiliar.

Também retorne no topo:
areaJuridica, areasProvaveis, tipoCaso, clientePrincipal, existeTerceiro, resumoJuridico.`
    system += `

Classifique pela INTENCAO PRINCIPAL do cliente, nao por palavras isoladas.
Considere objetivo pedido, fato predominante e contexto inteiro.
Exemplos:
- "Sai do meu trabalho e agora quero dar entrada no INSS" => INSS.
- "O INSS negou meu beneficio" => INSS, mesmo se mencionar empresa/trabalho.
- "Fui demitido e nao recebi rescisao/FGTS" => Trabalhista.
- "Banco descontou emprestimo/consignado indevido" => Bancario.
- "Comprei produto e nao entregaram" => Consumidor.
Se a area nao estiver clara, use areaJuridica "Outros", tipoCaso "Baixa confianca" e confianca abaixo de 0.65.
Inclua tambem dados.documentosMencionados e dados.urgencia quando identificaveis.
O resumoJuridico deve ser curto, neste modelo:
Area:
Subarea:
Situacao:
Objetivo do cliente:
Pendencias:
Tambem retorne confianca no topo.`


    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: system },
          { role: "user", content: entrada }
        ],
        temperature: 0,
        max_tokens: 900,
        response_format: { type: "json_object" }
      },
      { headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" } }
    )
    const content = res.data.choices?.[0]?.message?.content || "{}"
    return normalizarAnaliseIA(JSON.parse(content), entrada)
  } catch (e) {
    logErro("admin_assisted_ai", "extrairDadosAtendimentoAssistidoIA: " + e.message)
    return criarAnaliseFallback(entrada)
  }
}

module.exports = {
  criarAnaliseFallback,
  normalizarAnaliseIA,
  extrairDadosAtendimentoAssistidoIA,
  documentoPossuiEvidenciaNoRelato,
  isDocumentoGenericoRelato,
  calcularDocumentosPendentes,
  obterDocumentosRecomendadosPorArea
}
