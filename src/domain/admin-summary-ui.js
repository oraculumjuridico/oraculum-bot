function checklistProducaoAdmin() {
  return [
    "node --check server.js",
    "node verificar.js",
    "node smoke.js",
    "Confirmar servidor/ngrok/webhook antes de reiniciar",
    "Teste WhatsApp pelo proprietario",
    "Registrar resultado no Resumo_bot.md"
  ]
}

function normalizarSemAcentoAdmin(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function abreviarAreaResumoAdmin(area = "") {
  const normalizada = normalizarSemAcentoAdmin(area)
  if (normalizada.includes("inss") || normalizada.includes("previd")) return "PREV"
  if (normalizada.includes("trabalh")) return "TRAB"
  if (normalizada.includes("consum")) return "CONS"
  if (normalizada.includes("famil")) return "FAM"
  if (normalizada.includes("banc") || normalizada.includes("financ")) return "BANC"
  if (normalizada.includes("penal") || normalizada.includes("crimin")) return "PEN"
  if (normalizada.includes("imob")) return "IMOB"
  if (normalizada.includes("civil") || normalizada.includes("civel")) return "CIV"
  return "JUR"
}

function nomeCurtoResumoAdmin(nome = "") {
  const partes = String(nome || "").trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return "Cliente"
  if (partes.length === 1) return partes[0]
  return `${partes[0]} ${partes[partes.length - 1]}`.slice(0, 28)
}

function tituloCasoResumoAdmin(b = {}) {
  return `${abreviarAreaResumoAdmin(b.area)} • Caso ${b.numeroCaso || "sem caso"}`
}

function textoResumoDiarioOperacional(resumo) {
  const linhaBriefing = item => {
    const b = item.briefing
    const titulo = tituloCasoResumoAdmin(b)
    const docs = b.documentos.faltantesCriticos.length ? ` · Docs: ${b.documentos.faltantesCriticos.length}` : ""
    return `${titulo} · ${b.stageLabel} · ${b.scoreEmocional.nivel}/${b.scoreEmocional.valor}${docs}\n   Cliente: ${nomeCurtoResumoAdmin(b.nome)}`
  }
  const linhaAlerta = item => {
    const b = item.briefing
    const alerta = item.alertas[0]
    return `${tituloCasoResumoAdmin(b)}\n   ${alerta.texto}\n   Acao: ${alerta.acao}\n   Cliente: ${nomeCurtoResumoAdmin(b.nome)}`
  }
  const linhaAcao = (item, idx) => {
    const b = item.briefing
    const alerta = item.alertas[0]
    const motivo = alerta?.texto || b.stageLabel
    return `${idx + 1}. ${tituloCasoResumoAdmin(b)}\n   ${motivo}\n   ${b.proximaAcao}`
  }

  const urgentes = resumo.filas.urgentes.slice(0, 5).map(linhaBriefing)
  const docs = resumo.filas.documentosPendentes.slice(0, 5).map(linhaBriefing)
  const alertas = resumo.filas.alertasOperacionais.slice(0, 5).map(linhaAlerta)
  const proximasAcoes = resumo.filas.proximasAcoes.slice(0, 3).map(linhaAcao)
  const recentes = resumo.filas.recentes.slice(0, 5).map(linhaBriefing)
  return [
    "*Resumo diario*",
    "",
    "*Operacao*",
    `Casos ativos: ${resumo.totais.casosClientes}`,
    `Consultas futuras: ${resumo.totais.consultasAtivas}`,
    `Em análise: ${resumo.totais.emAnalise}`,
    `Docs pendentes: ${resumo.totais.documentosPendentes}`,
    "",
    "*Riscos*",
    `Urgentes: ${resumo.totais.alertasUrgentes}`,
    `Proximas acoes: ${resumo.filas.proximasAcoes.length}`,
    `Itens analisados: ${resumo.totais.itensAnalisados}`,
    `Fonte: ${resumo.fonte}`,
    "",
    "*Agir primeiro*",
    ...(proximasAcoes.length ? proximasAcoes : ["Nenhuma acao prioritaria agora."]),
    "",
    "*Alertas operacionais*",
    ...(alertas.length ? alertas : ["Nenhum alerta operacional aberto."]),
    "",
    "*Risco emocional/urgencia*",
    ...(urgentes.length ? urgentes : ["Nenhum alerta emocional alto."]),
    "",
    "*Documentos*",
    ...(docs.length ? docs : ["Nenhum caso com documento critico pendente."]),
    "",
    "*Recentes*",
    ...(recentes.length ? recentes : ["Nenhum caso recente encontrado."]),
    "",
    "*Validação técnica*",
    "Verificações técnicas são realizadas durante a validação e o deploy."
  ].join("\n")
}

module.exports = {
  checklistProducaoAdmin,
  textoResumoDiarioOperacional
}
