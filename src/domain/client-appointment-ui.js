const { createClientScreen } = require("./declarative-screen-guard")

function telaConsultaAdvogado(cabecalhoCaso = "") {
  return createClientScreen({
    id: "consulta_advogado",
    titulo: "Consulta com advogado",
    texto: `👨‍⚖️ *Falar com advogado*\n${cabecalhoCaso}\n\nVocê pode agendar uma consulta ou deixar uma mensagem urgente para nossa equipe.`,
    textoAudioBase: "Você pode agendar uma consulta com um advogado ou deixar uma mensagem urgente para nossa equipe",
    acoes: [
      { id: "adv_agendar_ligacao", label: "📅 Agendar consulta" },
      { id: "adv_urg", label: "⚠️ Mensagem urgente" },
      { id: "m_novocaso", label: "➕ Abrir novo caso" }
    ]
  })
}

function telaBuscandoHorarios() {
  return createClientScreen({
    id: "consulta_buscando_horarios",
    titulo: "Buscando horários",
    texto: "🔍 Buscando horários disponíveis...",
    textoAudioBase: "",
    acoes: []
  })
}

function telaConsultaSemHorarios(cabecalhoCaso = "") {
  return createClientScreen({
    id: "consulta_sem_horarios",
    titulo: "Sem horários disponíveis",
    texto: `😔 Não encontrei horários disponíveis no momento.\n${cabecalhoCaso}\n\nVocê pode deixar uma mensagem urgente para nossa equipe ou voltar ao menu do cliente.`,
    textoAudioBase: "No momento não encontrei horários disponíveis",
    acoes: [
      { id: "adv_urg", label: "⚠️ Mensagem urgente" },
      { id: "m_inicio", label: "🏠 Menu do cliente" }
    ]
  })
}

function telaHorariosConsulta({
  cabecalhoCaso = "",
  slots = [],
  pagina = 0,
  temMais = false,
  formatarSlot
} = {}) {
  const acoes = slots.slice(0, 8).map((slot, index) => ({
    id: `slot_${index}`,
    label: formatarSlot(slot)
  }))
  if (pagina > 0) acoes.unshift({ id: "slots_pagina_anterior", label: "⬅️ Horários anteriores" })
  if (temMais) acoes.push({ id: "slots_proxima_pagina", label: "➡️ Ver mais horários" })
  acoes.push({ id: "m_inicio", label: "🏠 Menu do cliente" })

  return createClientScreen({
    id: "consulta_horarios_disponiveis",
    titulo: "Horários disponíveis",
    texto: `📅 *Horários disponíveis:*\n${cabecalhoCaso}\n\nEscolha o melhor para você:`,
    textoAudioBase: "Vou mostrar os horários disponíveis para você. Escolha o melhor horário",
    acoes
  })
}

function telaDuracaoConsulta({ dataHora = "", dataHoraAudio = dataHora, primeiroNome = "você" } = {}) {
  return createClientScreen({
    id: "consulta_duracao",
    titulo: "Duração da consulta",
    texto: `✅ *${dataHora}* selecionado!\n\nQual a duração da consulta?`,
    textoAudioBase: `Ótimo, ${primeiroNome}. Você selecionou ${dataHoraAudio}. Agora escolha a duração desejada`,
    acoes: [
      { id: "dur_20", label: "⏱️ 20 minutos" },
      { id: "dur_30", label: "⏱️ 30 minutos" },
      { id: "dur_45", label: "⏱️ 45 minutos" },
      { id: "dur_60", label: "⏱️ 1 hora" },
      { id: "m_inicio", label: "🏠 Menu do cliente" }
    ]
  })
}

function telaConfirmacaoConsulta({
  dataHora = "",
  dataHoraAudio = dataHora,
  duracao = "",
  nome = "Não informado",
  numeroCaso = "Não informado"
} = {}) {
  return createClientScreen({
    id: "consulta_confirmacao",
    titulo: "Confirmar consulta",
    texto: `📋 *Confirme sua consulta:*\n\n📅 Data: *${dataHora}*\n⏱️ Duração: *${duracao}*\n👤 Nome: *${nome}*\n📄 Caso: *${numeroCaso}*\n\nEstá correto?`,
    textoAudioBase: `Confirme sua consulta. Data e horário: ${dataHoraAudio}. Duração: ${duracao}`,
    acoes: [
      { id: "ag_confirmar", label: "✅ Confirmar" },
      { id: "ag_outro_horario", label: "📅 Outro horário" },
      { id: "m_inicio", label: "🏠 Menu do cliente" }
    ]
  })
}

function telaFalhaAgendamento() {
  return createClientScreen({
    id: "consulta_agendamento_falhou",
    titulo: "Falha no agendamento",
    texto: "⚠️ Não consegui confirmar esse agendamento agora.\n\nVocê pode tentar novamente ou deixar uma mensagem urgente para nossa equipe.",
    textoAudioBase: "Não consegui confirmar esse agendamento agora",
    acoes: [
      { id: "adv_agendar_ligacao", label: "📅 Tentar novamente" },
      { id: "adv_urg", label: "⚠️ Mensagem urgente" },
      { id: "m_inicio", label: "🏠 Menu do cliente" }
    ]
  })
}

function telaAgendamentoConfirmado({
  dataHora = "",
  dataHoraAudio = dataHora,
  duracao = "",
  numeroCaso = "Não informado",
  primeiroNome = "você"
} = {}) {
  return createClientScreen({
    id: "consulta_agendada",
    titulo: "Consulta agendada",
    texto: `🎉 *Consulta agendada com sucesso!*\n\n📅 *${dataHora}*\n⏱️ Duração: *${duracao}*\n📄 Caso: *${numeroCaso}*\n\n📲 Fique atento ao WhatsApp no horário combinado. 😊`,
    textoAudioBase: `Consulta agendada com sucesso, ${primeiroNome}. Sua consulta está marcada para ${dataHoraAudio}, com duração de ${duracao}. Fique atento ao WhatsApp no horário combinado`,
    acoes: [
      { id: "m_status", label: "📊 Status do meu caso" },
      { id: "m_docs", label: "📎 Enviar documentos" },
      { id: "m_inicio", label: "🏠 Menu do cliente" }
    ]
  })
}

function telaConfirmarCancelamentoConsulta(dataHora = "", dataHoraAudio = dataHora) {
  return createClientScreen({
    id: "consulta_cancelamento_confirmacao",
    titulo: "Cancelar consulta",
    texto: `❌ *Cancelar consulta*\n\nVocê quer cancelar sua consulta de *${dataHora}*?\n\n_Se confirmar, o horário será removido da agenda e nossa equipe será avisada._`,
    textoAudioBase: `Você quer cancelar sua consulta de ${dataHoraAudio}? Se confirmar, o horário será removido da agenda e nossa equipe será avisada`,
    acoes: [
      { id: "cliente_cancelar_consulta_sim", label: "✅ Sim, cancelar" },
      { id: "m_status", label: "⬅️ Voltar" }
    ]
  })
}

function telaCancelamentoIndisponivel({ alterada = false } = {}) {
  const mensagem = alterada
    ? "A consulta mudou ou não está mais ativa. Vou mostrar o status atualizado do seu caso."
    : "Não encontrei uma consulta futura ativa para cancelar. Vou mostrar o status atualizado do seu caso."
  return createClientScreen({
    id: alterada ? "consulta_cancelamento_desatualizado" : "consulta_cancelamento_indisponivel",
    titulo: "Cancelamento indisponível",
    texto: `ℹ️ ${mensagem}`,
    textoAudioBase: mensagem,
    acoes: []
  })
}

function telaConsultaCancelada(dataHora = "", dataHoraAudio = dataHora) {
  return createClientScreen({
    id: "consulta_cancelada",
    titulo: "Consulta cancelada",
    texto: [
      "✅ *Consulta cancelada*",
      "",
      `Sua consulta de *${dataHora}* foi cancelada.`,
      "",
      "Quando quiser marcar outro horário, toque em *Agendar consulta*."
    ].join("\n"),
    textoAudioBase: `Pronto. Sua consulta de ${dataHoraAudio} foi cancelada`,
    acoes: [
      { id: "adv_agendar_ligacao", label: "📅 Agendar consulta" },
      { id: "m_status", label: "📊 Ver status" },
      { id: "m_inicio", label: "🏠 Menu do cliente" }
    ]
  })
}

function telaFalhaCancelamentoConsulta() {
  return createClientScreen({
    id: "consulta_cancelamento_falhou",
    titulo: "Falha no cancelamento",
    texto: "⚠️ *Não consegui cancelar a consulta agora.*\n\nTente novamente em instantes ou fale com nossa equipe.",
    textoAudioBase: "Não consegui cancelar a consulta agora. Nossa equipe pode ajudar você pelo WhatsApp",
    acoes: [
      { id: "cliente_cancelar_consulta_sim", label: "🔄 Tentar de novo" },
      { id: "m_adv", label: "👨‍⚖️ Falar com advogado" },
      { id: "m_status", label: "⬅️ Voltar" }
    ]
  })
}

module.exports = {
  telaConsultaAdvogado,
  telaBuscandoHorarios,
  telaConsultaSemHorarios,
  telaHorariosConsulta,
  telaDuracaoConsulta,
  telaConfirmacaoConsulta,
  telaFalhaAgendamento,
  telaAgendamentoConfirmado,
  telaConfirmarCancelamentoConsulta,
  telaCancelamentoIndisponivel,
  telaConsultaCancelada,
  telaFalhaCancelamentoConsulta
}
