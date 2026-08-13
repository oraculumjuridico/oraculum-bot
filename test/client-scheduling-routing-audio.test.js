"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { formatarSlot, formatarSlotAudio } = require("../src/domain/calendar-format")
const { removerSlotsDuplicados } = require("../src/domain/calendar-scheduling")
const { telaHorariosConsulta } = require("../src/domain/client-appointment-ui")
const { gerarAudioDaTela } = require("../src/domain/declarative-screen-guard")

const quinta = new Date("2027-08-12T18:00:00-03:00")
const audioData = formatarSlotAudio(quinta)
assert.equal(audioData, "quinta feira, doze de agosto, às dezoito horas")

const tela = telaHorariosConsulta({
  slots: [quinta],
  formatarSlot: () => "Qua 12/ago às 18h",
  formatarSlotAudio
})
const audioTela = gerarAudioDaTela(tela)
assert.match(audioTela, /Para quinta feira, doze de agosto, às dezoito horas, toque nesse horário/)
assert.doesNotMatch(audioTela, /12\/ago|18h/)

const oito = new Date("2026-08-14T08:00:00-03:00")
const oitoETrinta = new Date("2026-08-14T08:30:00-03:00")
assert.match(formatarSlot(oito), /08h$/)
assert.match(formatarSlot(oitoETrinta), /08h30$/)
assert.equal(removerSlotsDuplicados([oito, new Date(oito), oitoETrinta]).length, 2)

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
assert.match(server, /ehCallbackFluxoCliente/)
assert.match(server, /if \(!ehCallbackCliente\) \{[\s\S]{0,160}dispatchConversationContext/)
assert.match(server, /registrarUltimaPergunta\(u, \{ texto: telaHorarios\.texto, opcoes: opcoesHorarios \}\)/)
assert.match(server, /telaHorariosConsulta\(\{[\s\S]{0,240}formatarSlot,[\s\S]{0,80}formatarSlotAudio/)
assert.match(server, /let resultado = await enviarAudioTransportComResultado\(from, audioUrl\)/)
assert.match(server, /if \(imageUrl && quantidadeOpcoes <= 3\)/)
assert.match(server, /if \(imageUrl && quantidadeOpcoes > 3\)[\s\S]{0,120}enviarImagemWhatsApp\(from, imageUrl, "", null\)/)
assert.match(server, /if \(!resultado\?\.accepted\)[\s\S]{0,260}enviarAudioTransportComResultado\(from, audioUrl\)/)

console.log("client-scheduling-routing-audio.test.js: ok")
