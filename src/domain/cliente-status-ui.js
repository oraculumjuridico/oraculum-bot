const HS_STAGE = {
  LEAD: "appointmentscheduled",
  CADASTRO: "qualifiedtobuy",
  ANALISE: "presentationscheduled",
  AGUARDANDO_DOCS: "decisionmakerboughtin",
  DOCS: "contractsent",
  AGENDAMENTO: "1343040832",
  PROTOCOLO: "1343040098",
  PROCESSO: "1337291921",
  FINAL: "1343039663"
}
const { cabecalhoCasoAtivo } = require("./client-menu-ui")

function opcoesStatusCliente(stageAtualHS = null, temFaltantesCriticos = false, temAgendamentoAtivo = false) {
  const stagesDocumentos = [HS_STAGE.AGUARDANDO_DOCS, HS_STAGE.ANALISE, HS_STAGE.DOCS]
  // Se há agendamento ativo (evento no calendário), sempre mostra Reagendar — independente do stage de documentos
  if (temAgendamentoAtivo || stageAtualHS === HS_STAGE.AGENDAMENTO) {
    if (temFaltantesCriticos) return [
      { id: "m_docs",              title: "📎 Enviar faltantes" },
      { id: "adv_agendar_ligacao", title: "📅 Reagendar consulta" },
      { id: "cliente_cancelar_consulta", title: "❌ Cancelar consulta" }
    ]
    return [
      { id: "adv_agendar_ligacao", title: "📅 Reagendar consulta" },
      { id: "cliente_cancelar_consulta", title: "❌ Cancelar consulta" },
      { id: "m_inicio",            title: "🏠 Menu do cliente" }
    ]
  }
  if (temFaltantesCriticos && stagesDocumentos.includes(stageAtualHS)) {
    return [
      { id: "m_docs",   title: "📎 Enviar faltantes" },
      { id: "m_adv",    title: "👨‍⚖️ Falar com advogado" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
    ]
  }
  if (stageAtualHS === HS_STAGE.AGUARDANDO_DOCS) return [
    { id: "m_docs",   title: "📎 Enviar docs agora" },
    { id: "m_adv",    title: "👨‍⚖️ Falar com advogado" },
    { id: "m_inicio", title: "🏠 Menu do cliente" }
  ]
  if (stageAtualHS === HS_STAGE.AGENDAMENTO) return [
    { id: "adv_agendar_ligacao", title: "📅 Reagendar consulta" },
    { id: "cliente_cancelar_consulta", title: "❌ Cancelar consulta" },
    { id: "m_inicio", title: "🏠 Menu do cliente" }
  ]
  if (stageAtualHS === HS_STAGE.PROTOCOLO || stageAtualHS === HS_STAGE.PROCESSO) return [
    { id: "m_adv",    title: "👨‍⚖️ Falar com advogado" },
    { id: "m_inicio", title: "🏠 Menu do cliente" }
  ]
  if (stageAtualHS === HS_STAGE.FINAL) return [
    { id: "m_novocaso", title: "📋 Abrir novo caso" },
    { id: "m_inicio",   title: "🏠 Menu do cliente" }
  ]
  return [
    { id: "m_adv",    title: "👨‍⚖️ Falar com advogado" },
    { id: "m_docs",   title: "📎 Enviar documentos" },
    { id: "m_inicio", title: "🏠 Menu do cliente" }
  ]
}

function montarBarraStatusCliente({
  stageAtualHS = null,
  todosDocsEnviados = false,
  temFaltantesCriticos = false,
  temAgendamentoAtivo = false,
  temEventoCalendar = false,
  consultaPassou = false
} = {}) {
  // Stages que já passaram pela análise jurídica
  const ordemFlat = [
    HS_STAGE.LEAD, HS_STAGE.CADASTRO, HS_STAGE.ANALISE,
    HS_STAGE.AGUARDANDO_DOCS, HS_STAGE.DOCS, HS_STAGE.AGENDAMENTO,
    HS_STAGE.PROTOCOLO, HS_STAGE.PROCESSO, HS_STAGE.FINAL
  ]
  const idxAtual = ordemFlat.indexOf(stageAtualHS)
  const idxAnalise = ordemFlat.indexOf(HS_STAGE.ANALISE)
  const jaPassouAnalise = idxAtual >= idxAnalise && idxAtual !== -1

  // Barra de progresso por linha
  const ordemBarra = [
    { stages: [HS_STAGE.LEAD, HS_STAGE.CADASTRO],        label: "Registro" },
    { stages: [HS_STAGE.ANALISE],                         label: "Análise jurídica" },
    { stages: [HS_STAGE.AGUARDANDO_DOCS, HS_STAGE.DOCS], label: "Documentos" },
    { stages: [HS_STAGE.AGENDAMENTO],                     label: "Consulta com advogado" },
    { stages: [HS_STAGE.PROTOCOLO],                       label: "Protocolo" },
    { stages: [HS_STAGE.PROCESSO],                        label: "Processo em andamento" },
    { stages: [HS_STAGE.FINAL],                           label: "Encerramento" },
  ]

  return ordemBarra.map(etapa => {
    // Análise jurídica — controlada pelos documentos, não pelo stage
    if (etapa.stages.includes(HS_STAGE.ANALISE)) {
      if (!jaPassouAnalise) return `⚪ ${etapa.label}`
      if (todosDocsEnviados) return `✅ ${etapa.label}`
      return `🔄 *${etapa.label}*`
    }

    // Documentos - controlado pelos documentos reais, nao pela ordem do stage
    if (etapa.stages.some(s => [HS_STAGE.AGUARDANDO_DOCS, HS_STAGE.DOCS].includes(s))) {
      if (!jaPassouAnalise) return `⚪ ${etapa.label}`
      if (temFaltantesCriticos) return `🔄 *${etapa.label}*`
      return `✅ ${etapa.label}`
    }

    // Consulta com advogado - controlada pelo evento do calendario
    if (etapa.stages.includes(HS_STAGE.AGENDAMENTO)) {
      if (temEventoCalendar && consultaPassou) return `✅ ${etapa.label}`
      if (temAgendamentoAtivo) return `🔄 *${etapa.label}*`
      // fallback: usa lógica normal do stage
    }

    const idxEtapa = Math.max(...etapa.stages.map(s => ordemFlat.indexOf(s)))
    const isAtiva    = etapa.stages.includes(stageAtualHS)
    const isConcluida = idxEtapa < idxAtual && !isAtiva
    const emoji = isAtiva ? "🔄" : isConcluida ? "✅" : "⚪"
    const label = isAtiva ? `*${etapa.label}*` : etapa.label
    return `${emoji} ${label}`
  }).join("\n")
}

function montarBlocoAgendamentoStatus(temAgendamentoAtivo, consultaDataHora) {
  const blocoAgendamento = []
  if (temAgendamentoAtivo && consultaDataHora) {
    const dataConsulta = consultaDataHora.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit"
    })
    // Formatar: "quinta-feira, 28 de maio às 11h" com primeira letra maiúscula
    const dataFormatada = dataConsulta.replace(/:\d{2}$/, "h").replace(/^./, c => c.toUpperCase())
    blocoAgendamento.push(
      "━━━━━━━━━━━━━━━",
      "📅 *Consulta agendada*",
      "",
      `*${dataFormatada}*`,
      "_Enviaremos um lembrete antes da sua consulta._"
    )
  }
  return blocoAgendamento
}

function montarBlocoDocumentosStatus(statusDocs, temFaltantesCriticos = false) {
  const blocoDocumentos = ["━━━━━━━━━━━━━━━"]
  if (temFaltantesCriticos) {
    const listaFaltantes = statusDocs.faltantesCriticos.map(d => d.label).join(", ")
    blocoDocumentos.push("📎 *Documentos faltantes*", listaFaltantes)
  } else {
    blocoDocumentos.push("📎 *Documentos*", "_Você pode enviar documentos adicionais a qualquer momento._")
  }
  return blocoDocumentos
}

function montarTextoStatusCliente({
  numeroCaso = "",
  iconeArea = "",
  area = "",
  tipoCasoFormatado = "",
  barra = "",
  blocoAgendamento = [],
  blocoDocumentos = []
} = {}) {
  const linhaTipo = tipoCasoFormatado && tipoCasoFormatado !== "—" ? `📌 ${tipoCasoFormatado}` : null
  return [
    "📊 *Status do seu caso*",
    cabecalhoCasoAtivo({ numeroCaso, area }),
    ...(linhaTipo ? [linhaTipo] : []),
    "",
    barra,
    ...blocoAgendamento,
    ...blocoDocumentos
  ].join("\n")
}

function montarAudioStatusCliente({
  stageAtualHS = null,
  temAgendamentoAtivo = false,
  consultaDataHoraAudio = "",
  documentosFaltantesQtd = 0,
  documentosFaltantesAudio = ""
} = {}) {
  const partesAudio = []

  // Estado do caso
  const stageAudioMap = {
    [HS_STAGE.LEAD]:            "Seu caso foi registrado e nossa equipe irá analisá-lo em breve.",
    [HS_STAGE.CADASTRO]:        "Seu cadastro está sendo finalizado. Em breve seu caso vai para análise.",
    [HS_STAGE.ANALISE]:         "Seu caso está em análise jurídica.",
    [HS_STAGE.AGUARDANDO_DOCS]: "Seu caso está em análise jurídica e aguardando os documentos.",
    [HS_STAGE.DOCS]:            "Seus documentos foram recebidos e o caso está em análise.",
    [HS_STAGE.AGENDAMENTO]:     "Seu caso está em análise e há uma consulta agendada.",
    [HS_STAGE.PROTOCOLO]:       "Seu caso foi protocolado junto ao órgão responsável.",
    [HS_STAGE.PROCESSO]:        "Seu processo está em andamento. Avisaremos a cada novidade.",
    [HS_STAGE.FINAL]:           "Seu caso foi encerrado. Para nova demanda, estamos à disposição."
  }
  partesAudio.push(stageAudioMap[stageAtualHS] || "Seu caso está em andamento.")

  // Agendamento ativo
  if (temAgendamentoAtivo && consultaDataHoraAudio) {
    partesAudio.push(`Você tem uma consulta agendada para ${consultaDataHoraAudio}. Prepare-se: esteja em local silencioso, com o celular carregado e os documentos em mãos. Se precisar, você pode reagendar ou cancelar a consulta pelas opções desta tela.`)
  }

  // Faltantes
  if (documentosFaltantesQtd > 0) {
    partesAudio.push(`Ainda faltam ${documentosFaltantesQtd} documento${documentosFaltantesQtd > 1 ? "s" : ""}: ${documentosFaltantesAudio}. Envie pelo WhatsApp quando puder.`)
  }

  return partesAudio.join(" ")
}

module.exports = {
  opcoesStatusCliente,
  montarBarraStatusCliente,
  montarBlocoAgendamentoStatus,
  montarBlocoDocumentosStatus,
  montarTextoStatusCliente,
  montarAudioStatusCliente
}
