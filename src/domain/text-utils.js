const {
  sanitizarTextoEntrada,
  normalizarTextoGatilho
} = require("../utils/text")

function formatarSituacaoJuridica(situacao, tipo, subTipo) {
  const mapa = {
    // INSS
    "cortado":               "Benefício previdenciário cancelado indevidamente",
    "negado":                "Benefício previdenciário indeferido pelo INSS",
    "novo":                  "Solicitação de novo benefício previdenciário",
    "revisao":               "Revisão de benefício previdenciário",
    // Trabalhista
    "Demissao":              "Demissão sem justa causa",
    "demissao":              "Demissão sem justa causa",
    "Direitos nao pagos":    "Direitos trabalhistas não pagos",
    "direitos nao pagos":    "Direitos trabalhistas não pagos",
    "Acidente de trabalho":  "Acidente de trabalho com afastamento",
    "acidente de trabalho":  "Acidente de trabalho com afastamento",
    "Assedio moral":         "Assédio moral no ambiente de trabalho",
    "assedio moral":         "Assédio moral no ambiente de trabalho",
    // Outros
    "Consultoria juridica":  "Consultoria jurídica especializada",
    "consultoria juridica":  "Consultoria jurídica especializada",
    "Revisao de documentos": "Revisão e análise de documentos jurídicos",
    "revisao de documentos": "Revisão e análise de documentos jurídicos",
    "Outro assunto":         "Outro assunto jurídico",
    "Outros":                "Outros casos jurídicos",
    "outros":                "Outros casos jurídicos",
  }
  const chave = (situacao || tipo || subTipo || "").trim()
  return mapa[chave] || (chave
    ? chave.charAt(0).toUpperCase() + chave.slice(1).replace(/_/g, " ")
    : "—")
}

function formatarDetalheJuridico(detalhe, assuntoResumo, descricao = "") {
  const d = (detalhe || assuntoResumo || descricao || "").trim()
  if (!d) return "—"
  const limite = d.length > 140 ? d.slice(0, 137).trimEnd() + "..." : d
  const texto = limite.charAt(0).toUpperCase() + limite.slice(1)
  return texto.endsWith(".") || texto.endsWith("!") || texto.endsWith("?")
    ? texto
    : texto + "."
}

function detectarReferenciaTerceiro(texto = "") {
  const t = normalizarTextoGatilho(texto)
  if (!t) return null

  const refs = [
    { re: /\b(minha|da minha|pra minha|para minha)\s+mae\b|\b(mae dela|mae dele)\b/, relacao: "mae", label: "mãe" },
    { re: /\b(meu|do meu|pro meu|para meu)\s+pai\b|\b(pai dela|pai dele)\b/, relacao: "pai", label: "pai" },
    { re: /\b(minha|da minha|pra minha|para minha)\s+filha\b|\b(filha dela|filha dele)\b/, relacao: "filha", label: "filha" },
    { re: /\b(meu|do meu|pro meu|para meu)\s+filho\b|\b(filho dela|filho dele)\b/, relacao: "filho", label: "filho" },
    { re: /\b(minha|da minha|pra minha|para minha)\s+esposa\b|\b(minha|da minha)\s+mulher\b/, relacao: "esposa", label: "esposa" },
    { re: /\b(meu|do meu|pro meu|para meu)\s+esposo\b|\b(meu|do meu)\s+marido\b/, relacao: "esposo", label: "esposo" },
    { re: /\b(minha|da minha|pra minha|para minha)\s+irma\b|\birma dela|irma dele\b/, relacao: "irma", label: "irmã" },
    { re: /\b(meu|do meu|pro meu|para meu)\s+irmao\b|\birmao dela|irmao dele\b/, relacao: "irmao", label: "irmão" },
    { re: /\b(minha|da minha|pra minha|para minha)\s+avo\b|\b(meu|do meu|pro meu|para meu)\s+avo\b|\bavos?\b/, relacao: "avo", label: "avó/avô" },
    { re: /\b(outra pessoa|terceiro|terceira pessoa|parente|familiar|cliente e outra pessoa)\b/, relacao: "terceiro", label: "outra pessoa" }
  ]

  return refs.find(item => item.re.test(t)) || null
}

function formatarValorCorrecao(campo, valor, extra = {}) {
  if (campo === "cidade") {
    const cidade = extra.cidade || valor
    return `${cidade}${extra.uf ? `, ${extra.uf}` : ""}${extra.regiao ? ` (${extra.regiao})` : ""}`
  }
  return sanitizarTextoEntrada(valor) || "—"
}

function classificarReuniaoCliente({ summary = "", description = "", tituloHubSpot = "", corpoHubSpot = "" } = {}) {
  const texto = normalizarTextoGatilho([summary, description, tituloHubSpot, corpoHubSpot].filter(Boolean).join(" "))
  const marcadoresConsultaCaso = [
    "[caso]",
    "[consulta]",
    "consulta juridica",
    "consulta do caso",
    "consulta principal",
    "consulta com advogado"
  ]

  if (marcadoresConsultaCaso.some(m => texto.includes(m))) return "consulta_caso"
  return "pontual"
}

function textoAudioOpcoes(opcoes = [], prefixo = "") {
  const lista = Array.isArray(opcoes) ? opcoes.filter(o => sanitizarTextoEntrada(o?.title)) : []
  if (!lista.length) return ""
  const ordinais = ["Primeira", "Segunda", "Terceira", "Quarta", "Quinta", "Sexta", "Setima", "Oitava", "Nona", "Decima"]
  const corpo = lista.map((opcao, idx) => {
    const ordinal = ordinais[idx] || `${idx + 1}a`
    return `${ordinal} opcao: ${removerFormatacaoParaAudio(opcao.title).replace(/[.!?;:]+$/g, "")}`
  }).join(". ")
  return `${prefixo ? `${prefixo}: ` : ""}${corpo}.`
}

function removerFormatacaoParaAudio(texto = "") {
  return sanitizarTextoEntrada(texto)
    .replace(/\bCNIS\b/gi, "extrato de contribuições do Meu INSS")
    .replace(/```/g, " ")
    .replace(/[*_~`]/g, "")
    .replace(/[•·]/g, ". ")
    .replace(/[━─]+/g, ". ")
    .replace(/[●○]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function textoAudioAutomatico(payload = {}) {
  const textoBase = removerFormatacaoParaAudio(payload?.texto || "")
  const opcoes = Array.isArray(payload?.opcoes) ? payload.opcoes.slice(0, 4) : []
  const textoOpcoes = opcoes.length ? ` ${textoAudioOpcoes(opcoes, "Opcoes na tela")}` : ""
  const combinado = `${textoBase}${textoOpcoes}`.trim()
  if (combinado.length <= 850) return combinado
  return combinado.slice(0, 847).replace(/\s+\S*$/, "") + "..."
}

function textoTemMarcadorVisual(texto = "") {
  const t = sanitizarTextoEntrada(texto)
  if (!t) return true
  if (/^[●○◯⚪✅❌⚠⏳⌛📌📍📎📩📄📊📱📋📅📆📁📂📞📲💬💡💰🏥🏛⚖🔎🔍🔢🎉🎙👀👂👤👋🏠➕✍✏🕒]/u.test(t)) return true
  return /^\p{Extended_Pictographic}/u.test(t)
}

module.exports = {
  formatarSituacaoJuridica,
  formatarDetalheJuridico,
  detectarReferenciaTerceiro,
  formatarValorCorrecao,
  classificarReuniaoCliente,
  removerFormatacaoParaAudio,
  textoAudioOpcoes,
  textoAudioAutomatico,
  textoTemMarcadorVisual
}
