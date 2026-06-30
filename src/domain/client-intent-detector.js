const { normalizarTextoGatilho } = require("../utils/text")

function detectarIntencaoCliente(texto = "") {
  const t = normalizarTextoGatilho(texto)
  if (!t) return null
  if (/^(oi|ola|olá|menu|inicio|início|bom dia|boa tarde|boa noite)$/.test(t)) return "menu"
  if (/\b(cancel|desmarc|desmarca|desist|nao quero|não quero)\b/.test(t) && /\b(consulta|agendamento|agenda|ligacao|ligação|horario|horário)\b/.test(t)) return "cancelar_consulta"
  if (/\b(cancel|desist|nao quero mais|não quero mais|nao preciso mais|não preciso mais|encerrar caso|fechar caso)\b/.test(t)) return "cancelar"
  if (/\b(obrigad|valeu|tchau|ate logo|ate mais|até logo|até mais|por hoje|encerrar|finalizar|fechar)\b/.test(t)) return "despedida"
  if (/\b(urgente|urgencia|urgência|prazo|intimad|amanha|amanhã|hoje|liminar|audiencia|audiência)\b/.test(t)) return "urgente"
  if (/\b(agend|marcar|ligacao|ligação|consulta|horario|horário)\b/.test(t)) return "agendar"
  if (/\b(advogad|falar com|especialista|atendente|humano)\b/.test(t)) return "advogado"
  if (/\b(documentos?|docs?|foto|pdf|anex|enviar arquivo|mandar arquivo)\b/.test(t)) return "documentos"
  if (/\b(status|andamento|meu caso|processo|situacao do caso|situação do caso)\b/.test(t)) return "status"
  if (/\b(novo caso|outro caso|abrir caso|nova situacao|nova situação|situacao nova|situação nova|outro problema|outro atendimento|abrir outro atendimento)\b/.test(t)) return "novo_caso"
  return null
}

function pareceDuvidaCasoAtualOuNovo(texto = "") {
  const t = normalizarTextoGatilho(texto)
  if (!t) return false
  const falaCasoAtual = /\b(caso atual|processo atual|meu processo|meu caso|nesse processo|neste processo)\b/.test(t)
  const falaNovo = /\b(novo|nova|outro|outra|abrir|atendimento|situacao nova|situação nova|preciso abrir)\b/.test(t)
  const perguntaEncaixe = /\b(entra|encaixa|serve|faz parte|preciso|devo)\b/.test(t)
  return falaCasoAtual && falaNovo && perguntaEncaixe
}

function pareceNovaSituacaoCliente(texto = "") {
  const t = normalizarTextoGatilho(texto)
  if (t.length < 160) return false
  return /\b(inss|aposent|beneficio|benefício|trabalho|demiss|acidente|familia|família|divorcio|divórcio|pensao|pensão|consumidor|compra|cobranca|cobrança|vizinho|imovel|imóvel|contrato|processo)\b/.test(t)
}

module.exports = {
  detectarIntencaoCliente,
  pareceDuvidaCasoAtualOuNovo,
  pareceNovaSituacaoCliente
}
