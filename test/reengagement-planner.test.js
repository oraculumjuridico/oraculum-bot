const assert = require("node:assert/strict")

const {
  planejarReengajamentos
} = require("../src/domain/reengagement-planner")

const HORA_MS = 60 * 60 * 1000
const DIA_MS = 24 * HORA_MS
const AGORA = new Date("2026-07-09T12:00:00.000Z").getTime()

function passado(ms) {
  return AGORA - ms
}

function tipos(resultado) {
  return resultado.jobs.map(job => job.tipoEvento)
}

function job(resultado, tipoEvento) {
  return resultado.jobs.find(item => item.tipoEvento === tipoEvento)
}

function planejar(usuario) {
  return planejarReengajamentos(usuario, { agora: AGORA })
}

{
  const ultimaMsg = passado(2 * HORA_MS + 1)
  const resultado = planejar({
    phone: "5599999999999",
    ultimaMsg
  })

  assert.deepEqual(tipos(resultado), ["abandono_2h"])
  assert.equal(job(resultado, "abandono_2h").id, "5599999999999:abandono_2h")
  assert.equal(job(resultado, "abandono_2h").scheduledFor, new Date(ultimaMsg + 2 * HORA_MS).toISOString())
}

{
  const ultimaMsg = passado(DIA_MS + 1)
  const resultado = planejar({
    phone: "5599999999999",
    ultimaMsg
  })

  assert.deepEqual(tipos(resultado), ["abandono_24h", "abandono_2h"])
  assert.equal(job(resultado, "abandono_24h").scheduledFor, new Date(ultimaMsg + DIA_MS).toISOString())
}

{
  const ultimaMsg = passado(7 * DIA_MS + 1)
  const resultado = planejar({
    phone: "5599999999999",
    ultimaMsg,
    leadIncompletoCapturado: true
  })

  assert.deepEqual(tipos(resultado), ["abandono_7d", "abandono_24h", "abandono_2h"])
  assert.equal(job(resultado, "abandono_7d").scheduledFor, new Date(ultimaMsg + 7 * DIA_MS).toISOString())
}

{
  const ultimaMsg = passado(25 * HORA_MS)
  const resultado = planejar({
    phone: "5599999999999",
    numeroCaso: "PREV.260701.001",
    ultimaMsg,
    docsAusentes: ["doc_rg"],
    docsParciais: []
  })

  assert.deepEqual(tipos(resultado), ["documentos_pendentes"])
  assert.equal(job(resultado, "documentos_pendentes").id, "5599999999999:PREV.260701.001:documentos_pendentes")
  assert.equal(job(resultado, "documentos_pendentes").template, "caso_atualizacao")
  assert.equal(job(resultado, "documentos_pendentes").scheduledFor, new Date(ultimaMsg + DIA_MS).toISOString())
}

{
  const ultimaMsg = passado(3 * HORA_MS)
  const resultado = planejar({
    phone: "5599999999999",
    ultimaMsg,
    stage: "descricao_caso",
    descricao: ""
  })

  assert.deepEqual(tipos(resultado), ["abandono_2h", "descricao_pendente"])
  assert.equal(job(resultado, "descricao_pendente").scheduledFor, new Date(ultimaMsg + 2 * HORA_MS).toISOString())
}

{
  const ultimaMsg = passado(3 * HORA_MS)
  const resultado = planejar({
    phone: "5599999999999",
    ultimaMsg,
    stage: "AGENDAMENTO_HORARIO",
    consultaStatus: "sem_consulta"
  })

  assert.deepEqual(tipos(resultado), ["agendamento_nao_concluido", "abandono_2h"])
  assert.equal(job(resultado, "agendamento_nao_concluido").scheduledFor, new Date(ultimaMsg + 2 * HORA_MS).toISOString())
}

{
  const resultado = planejar({
    phone: "5599999999999",
    consultaStatus: "nao_compareceu"
  })

  assert.deepEqual(tipos(resultado), ["no_show_consulta"])
  assert.equal(job(resultado, "no_show_consulta").scheduledFor, new Date(AGORA).toISOString())
}

{
  const resultado = planejar({
    phone: "5599999999999",
    numeroCaso: "PREV.260701.001",
    ultimaMsg: passado(25 * HORA_MS),
    docsAusentes: ["doc_rg"],
    docsParciais: ["doc_ctps"]
  })

  assert.deepEqual(tipos(resultado), ["documentos_pendentes"])
  assert.equal(new Set(resultado.jobs.map(item => item.id)).size, resultado.jobs.length)
}

{
  const ultimaMsg = passado(8 * DIA_MS)
  const resultado = planejar({
    phone: "5599999999999",
    numeroCaso: "PREV.260701.001",
    ultimaMsg,
    stage: "AGENDAMENTO_CONFIRMAR",
    consultaStatus: "nao_compareceu",
    docsAusentes: ["doc_rg"]
  })

  assert.deepEqual(tipos(resultado), [
    "no_show_consulta",
    "documentos_pendentes",
    "agendamento_nao_concluido"
  ])
  assert.equal(resultado.jobs[0].prioridade, 100)
  assert.equal(resultado.jobs[1].prioridade, 90)
  assert.equal(resultado.jobs[2].prioridade, 80)
}

{
  const resultado = planejar({
    phone: "5599999999999",
    numeroCaso: "PREV.260701.001",
    stage: "AGENDAMENTO_CONFIRMAR",
    consultaStatus: "sem_consulta"
  })

  assert.deepEqual(resultado.jobs, [])
  assert.deepEqual(resultado.avisos, ["evento_sem_ultimaMsg_valida:agendamento_nao_concluido"])
}

{
  const resultado = planejar({
    phone: "5599999999999",
    numeroCaso: "PREV.260701.001",
    stage: "cliente",
    consultaStatus: "agendada",
    descricao: "Relato completo",
    docsAusentes: [],
    docsParciais: [],
    ultimaMsg: passado(30 * 60 * 1000)
  })

  assert.deepEqual(resultado.jobs, [])
  assert.deepEqual(resultado.avisos, [])
  assert.deepEqual(resultado.erros, [])
}

console.log("reengagement-planner.test.js: ok")
