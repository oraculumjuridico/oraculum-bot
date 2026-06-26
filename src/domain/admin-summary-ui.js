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

function textoResumoDiarioOperacional(resumo) {
  const linhaBriefing = item => {
    const b = item.briefing
    const caso = b.numeroCaso ? `📄 ${b.numeroCaso}` : "📄 Sem caso"
    const docs = b.documentos.faltantesCriticos.length ? ` · 📎 ${b.documentos.faltantesCriticos.length}` : ""
    return `👤 ${b.nome} · ${caso} · ${b.area || "area nao definida"} · ${b.stageLabel} · 💬 ${b.scoreEmocional.nivel}/${b.scoreEmocional.valor}${docs}`
  }
  const linhaAlerta = item => {
    const b = item.briefing
    const alerta = item.alertas[0]
    const caso = b.numeroCaso ? b.numeroCaso : "sem caso"
    return `🚩 ${b.nome} · ${caso}\n   ${alerta.texto}\n   Acao: ${alerta.acao}`
  }
  const linhaAcao = (item, idx) => {
    const b = item.briefing
    const alerta = item.alertas[0]
    const motivo = alerta?.texto || b.stageLabel
    return `${idx + 1}. ${b.nome} · ${b.numeroCaso || "sem caso"}\n   ${motivo}\n   ${b.proximaAcao}`
  }

  const urgentes = resumo.filas.urgentes.slice(0, 5).map(linhaBriefing)
  const docs = resumo.filas.documentosPendentes.slice(0, 5).map(linhaBriefing)
  const alertas = resumo.filas.alertasOperacionais.slice(0, 5).map(linhaAlerta)
  const proximasAcoes = resumo.filas.proximasAcoes.slice(0, 3).map(linhaAcao)
  const recentes = resumo.filas.recentes.slice(0, 5).map(linhaBriefing)
  const checklist = (resumo.checklistProducao || []).map(item => `- ${item}`)

  return [
    "📊 *Resumo diario*",
    "",
    "⚙️ *Operacao*",
    `📂 Casos ativos: ${resumo.totais.casosClientes}`,
    `📅 Consultas futuras: ${resumo.totais.consultasAtivas}`,
    `🔎 Em analise: ${resumo.totais.emAnalise}`,
    `📎 Docs pendentes: ${resumo.totais.documentosPendentes}`,
    "",
    "🚨 *Riscos*",
    `🔥 Urgentes: ${resumo.totais.alertasUrgentes}`,
    `� Proximas acoes: ${resumo.filas.proximasAcoes.length}`,
    `�🧮 Itens analisados: ${resumo.totais.itensAnalisados}`,
    `🧭 Fonte: ${resumo.fonte}`,
    "",
    "🎯 *Agir primeiro*",
    ...(proximasAcoes.length ? proximasAcoes : ["✅ Nenhuma acao prioritaria agora."]),
    "",
    "🚨 *Alertas operacionais*",
    ...(alertas.length ? alertas : ["✅ Nenhum alerta operacional aberto."]),
    "",
    "🔥 *Risco emocional/urgencia*",
    ...(urgentes.length ? urgentes : ["✅ Nenhum alerta emocional alto."]),
    "",
    "📎 *Documentos*",
    ...(docs.length ? docs : ["✅ Nenhum caso com documento critico pendente."]),
    "",
    "🕘 *Recentes*",
    ...(recentes.length ? recentes : ["✅ Nenhum caso recente encontrado."]),
    "",
    "🧪 *Checklist producao*",
    ...checklist
  ].join("\n")
}

module.exports = {
  checklistProducaoAdmin,
  textoResumoDiarioOperacional
}
