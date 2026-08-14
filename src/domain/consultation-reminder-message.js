"use strict"

const TIME_ZONE = "America/Sao_Paulo"

function dataValida(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function primeiroNome(value) {
  return String(value || "cliente").trim().split(/\s+/).filter(Boolean)[0] || "cliente"
}

function formatarData(value) {
  const date = dataValida(value)
  if (!date) return "data confirmada"
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date)
}

function formatarHora(value) {
  const date = dataValida(value)
  if (!date) return "horário confirmado"
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date)
}

function montarParametrosLembreteConsulta({ tipo, name, datetime } = {}) {
  const nome = primeiroNome(name)
  const data = formatarData(datetime)
  const hora = formatarHora(datetime)
  if (String(tipo || "").toLowerCase() === "24h") return [nome, `${data} às ${hora}`]
  return [nome, data, hora]
}

function montarMensagemLembreteConsulta({ tipo, name, datetime } = {}) {
  const nome = primeiroNome(name)
  const data = formatarData(datetime)
  const hora = formatarHora(datetime)
  const chave = String(tipo || "").trim().toLowerCase()
  const abertura = chave === "1h"
    ? "⏰ Sua consulta começa em 1 hora!"
    : chave === "hoje"
      ? "📅 Lembrete: sua consulta é hoje!"
      : "📅 Lembrete da sua consulta jurídica"

  return [
    abertura,
    "",
    `Olá, ${nome}! Sua consulta com um advogado da Oráculum está marcada para ${data}, às ${hora}.`,
    "",
    "Fique atento ao WhatsApp no horário combinado. Se precisar reagendar, fale conosco por aqui."
  ].join("\n")
}

module.exports = {
  formatarData,
  formatarHora,
  montarParametrosLembreteConsulta,
  montarMensagemLembreteConsulta
}
