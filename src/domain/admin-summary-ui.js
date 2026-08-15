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
  const linhaAcao = (item, idx) => {
    const b = item.briefing
    const alerta = item.alertas[0]
    const motivo = alerta?.texto || b.stageLabel
    return `${idx + 1}. *${nomeCurtoResumoAdmin(b.nome)}* · ${tituloCasoResumoAdmin(b)}\n   Motivo: ${motivo}\n   Próxima ação: ${b.proximaAcao}`
  }
  const linhaDocumento = item => {
    const b = item.briefing
    const quantidade = b.documentos.faltantesCriticos.length
    return `• *${nomeCurtoResumoAdmin(b.nome)}* · ${tituloCasoResumoAdmin(b)}\n   ${quantidade} documento(s) crítico(s) pendente(s)`
  }

  const proximasAcoes = resumo.filas.proximasAcoes.slice(0, 5).map(linhaAcao)
  const docs = (resumo.filas.documentosComplementares || [])
    .slice(0, 3)
    .map(linhaDocumento)
  return [
    "📊 *Resumo diário*",
    "",
    "*Visão geral*",
    `Casos ativos: ${resumo.totais.casosClientes}`,
    `Em análise: ${resumo.totais.emAnalise}`,
    `Agendamentos futuros: ${resumo.totais.consultasAtivas}`,
    `Documentos pendentes: ${resumo.totais.documentosPendentes}`,
    `Urgentes: ${resumo.totais.alertasUrgentes}`,
    `Pré-atendimentos em aberto: ${resumo.totais.preAtendimentos || 0}`,
    "",
    "*Prioridades de hoje*",
    ...(proximasAcoes.length ? proximasAcoes : ["✅ Nenhuma ação prioritária agora."]),
    "",
    "*Outras pendências documentais*",
    ...(docs.length ? docs : ["✅ Nenhuma pendência adicional fora das prioridades."])
  ].join("\n")
}

module.exports = {
  checklistProducaoAdmin,
  textoResumoDiarioOperacional
}
