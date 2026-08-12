"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { formatarSlotAudio } = require("../src/domain/calendar-format")
const { telaHorariosConsulta } = require("../src/domain/client-appointment-ui")
const { gerarAudioDaTela } = require("../src/domain/declarative-screen-guard")

const quinta = new Date(2027, 7, 12, 18, 0, 0)
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

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
assert.match(server, /\(\?:m_\|docs_\|doc_\|cliente_\|adv_\|dir_\|novo_caso_\|nc_\|slot_\|slots_\|dur_\|ag_\)/)
assert.match(server, /telaHorariosConsulta\(\{[\s\S]{0,240}formatarSlot,[\s\S]{0,80}formatarSlotAudio/)

console.log("client-scheduling-routing-audio.test.js: ok")
