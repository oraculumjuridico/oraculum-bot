const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
const { classificarEstadoEvento } = require("../src/domain/calendar-scheduling")

function rotaEntre(inicio, fim) {
  const posicaoInicial = server.indexOf(inicio)
  const posicaoFinal = server.indexOf(fim, posicaoInicial)
  assert.notEqual(posicaoInicial, -1, `Rota inicial ausente: ${inicio}`)
  assert.notEqual(posicaoFinal, -1, `Rota final ausente: ${fim}`)
  return server.slice(posicaoInicial, posicaoFinal)
}

const buscarContato = rotaEntre(
  'app.post("/buscar-contato-reuniao"',
  'app.post("/consulta-lembrete-dados"'
)
assert.match(buscarContato, /const \{ eventId, datetime \} = req\.body/)
assert.match(buscarContato, /if \(eventId\) \{\s+eventoCalendar = await getConsultaCalendarEventState\(eventId\)/)
assert.match(buscarContato, /new Date\(eventoCalendar\?\.inicio \|\| datetime\)/)
assert.match(buscarContato, /let dealId = sanitizarTextoEntrada\(metadataEvento\.dealId\)/)
assert.match(buscarContato, /if \(!dealId\) \{\s+const buscaReuniao = await axios\.post/)
assert.match(buscarContato, /if \(!eventoCalendarId\) \{\s+try \{\s+eventoCalendar = await findConsultaCalendarEventInRange/)
assert.match(buscarContato, /return res\.json\(\{ phone, name, eventId: eventoCalendarId/)

const dadosLembrete = rotaEntre(
  'app.post("/consulta-lembrete-dados"',
  'app.post("/evento-cancelado"'
)
assert.match(dadosLembrete, /const \{ eventId \} = req\.body/)
assert.match(dadosLembrete, /const evento = await getConsultaCalendarEventState\(eventId\)/)
assert.match(dadosLembrete, /reminders: \{/)
assert.match(dadosLembrete, /"24h": new Date\(new Date\(inicioConsulta\)\.getTime\(\) - 24 \* 60 \* 60 \* 1000\)\.toISOString\(\)/)
assert.match(dadosLembrete, /"1h": new Date\(new Date\(inicioConsulta\)\.getTime\(\) - 60 \* 60 \* 1000\)\.toISOString\(\)/)

const confirmacao = rotaEntre(
  'app.post("/agendamento"',
  'app.post("/buscar-contato-reuniao"'
)
assert.match(confirmacao, /const \{ phone, name, datetime, caseid, eventId \} = req\.body/)
assert.match(confirmacao, /const evento = await getConsultaCalendarEventState\(eventId\)/)
assert.match(confirmacao, /dataHora = evento\.inicio \|\| dataHora/)

const cancelamento = rotaEntre(
  'app.post("/evento-cancelado"',
  'app.post("/pos-consulta"'
)
assert.match(cancelamento, /const \{ eventId, dealId, phone \} = req\.body/)
assert.match(cancelamento, /localizarUsuarioAgendamento\(\{ eventId, dealId, phone \}\)/)

const posConsulta = rotaEntre(
  'app.post("/pos-consulta"',
  'app.post("/consulta-status"'
)
assert.match(posConsulta, /const \{ eventId, dealId, phone, force \} = req\.body/)
assert.match(posConsulta, /localizarUsuarioAgendamento\(\{ eventId, dealId, phone \}\)/)

const consultaStatus = rotaEntre(
  'app.post("/consulta-status"',
  'app.post("/lembrete"'
)
assert.match(consultaStatus, /if \(!eventId \|\| !\["realizada", "nao_compareceu"\]/)
assert.match(consultaStatus, /await definirResultadoConsulta\(eventId, status\)/)

const lembrete = server.slice(server.indexOf('app.post("/lembrete"'))
assert.match(lembrete, /const \{ phone, name, datetime, tipo, eventId, scheduledFor, dealId, casoId, params \} = req\.body/)
assert.match(lembrete, /evento = await getConsultaCalendarEventState\(eventId\)/)
assert.match(lembrete, /dataEvento = evento\.inicio \|\| dataEvento/)
assert.match(lembrete, /validarJanelaEnvioLembreteConsulta\(\{ tipo, inicioConsulta: dataEvento, scheduledFor \}\)/)
assert.match(lembrete, /const contextoConversa = criarContextoConsultaTemplate/)
assert.match(lembrete, /usuario_nao_encontrado_para_contexto/)
assert.match(lembrete, /contexto_conversa_template_invalido/)
assert.match(lembrete, /templateService\.consultaLembrete\(numero, tipo, parametrosTemplate, \{/)
assert.match(lembrete, /requireContextoConversa: true/)
assert.match(lembrete, /abandonCallbackExecution\(callbackKey\)/)

const classificado = classificarEstadoEvento({
  id: "evento-exato",
  status: "confirmed",
  summary: "Consulta Jurídica",
  description: "Caso 123",
  start: { dateTime: new Date(Date.now() + 3600000).toISOString() },
  end: { dateTime: new Date(Date.now() + 7200000).toISOString() },
  extendedProperties: { private: { dealId: "deal-123" } }
})
assert.equal(classificado.eventId, "evento-exato")
assert.equal(classificado.summary, "Consulta Jurídica")
assert.equal(classificado.description, "Caso 123")
assert.equal(classificado.metadata.dealId, "deal-123")

console.log("calendar-event-id-hardening.test.js: ok")
