"use strict"

const CALLBACK_CLIENTE = /^(?:m_|docs_|doc_|cliente_|adv_|dir_|novo_caso_|nc_|slot_|slots_|dur_|ag_|audio_dados_|conf_ok$|conf_corrigir$|conf_menu$)/

function ehCallbackFluxoCliente({ tipo = "", texto = "" } = {}) {
  return ["interactive", "button"].includes(String(tipo || "").toLowerCase()) &&
    CALLBACK_CLIENTE.test(String(texto || "").trim())
}

function alinharEtapaAoCallbackCliente(u, texto, stages = {}) {
  if (!u || u.numeroCaso && /^(?:audio_dados_|conf_ok$|conf_corrigir$)/.test(texto)) return false

  const opcoesAtuais = new Set((u.lastPerguntaPayload?.opcoes || []).map(opcao => opcao?.id).filter(Boolean))
  const callbackEstavaNaTela = opcoesAtuais.has(texto)
  let etapa = null

  if (/^slot_\d+$/.test(texto) && Array.isArray(u._slotsDisponiveis) && u._slotsDisponiveis.length) {
    etapa = stages.AGENDAMENTO_HORARIO
  } else if (/^dur_(?:20|30|45|60)$/.test(texto) && u._slotEscolhido) {
    etapa = stages.AGENDAMENTO_DURACAO
  } else if (/^ag_(?:confirmar|outro_horario)$/.test(texto) && u._slotEscolhido) {
    etapa = stages.AGENDAMENTO_CONFIRMAR
  } else if (/^audio_dados_(?:confirmar|corrigir)$/.test(texto) && callbackEstavaNaTela) {
    etapa = stages.AUDIO_CONFIRMAR_DADOS
  } else if (/^(?:conf_ok|conf_corrigir)$/.test(texto) && callbackEstavaNaTela) {
    etapa = stages.CONFIRMACAO
  }

  if (!etapa || u.stage === etapa) return false
  u.stage = etapa
  u.etapa = etapa
  return true
}

module.exports = {
  CALLBACK_CLIENTE,
  ehCallbackFluxoCliente,
  alinharEtapaAoCallbackCliente
}
