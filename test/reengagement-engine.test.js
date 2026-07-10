const assert = require("node:assert/strict")

const {
  avaliarElegibilidadeReengajamento
} = require("../src/domain/reengagement-engine")

const HORA_MS = 60 * 60 * 1000
const DIA_MS = 24 * HORA_MS

function passado(ms) {
  return Date.now() - ms
}

function tipos(resultado) {
  return resultado.eventos.map(evento => evento.tipoEvento)
}

function evento(resultado, tipoEvento) {
  return resultado.eventos.find(item => item.tipoEvento === tipoEvento)
}

{
  const resultado = avaliarElegibilidadeReengajamento({
    ultimaMsg: passado(2 * HORA_MS + 1)
  })

  assert.equal(resultado.elegivel, true)
  assert.deepEqual(tipos(resultado), ["abandono_2h"])
  assert.equal(evento(resultado, "abandono_2h").template, "retomada_atendimento")
  assert.equal(evento(resultado, "abandono_2h").prioridade, 50)
}

{
  const resultado = avaliarElegibilidadeReengajamento({
    ultimaMsg: passado(DIA_MS + 1)
  })

  assert.equal(resultado.elegivel, true)
  assert.deepEqual(tipos(resultado), ["abandono_24h", "abandono_2h"])
}

{
  const resultado = avaliarElegibilidadeReengajamento({
    ultimaMsg: passado(7 * DIA_MS + 1),
    leadIncompletoCapturado: true
  })

  assert.equal(resultado.elegivel, true)
  assert.deepEqual(tipos(resultado), ["abandono_7d", "abandono_24h", "abandono_2h"])
  assert.equal(evento(resultado, "abandono_7d").motivo, "lead_incompleto_capturado_sem_conversao")
}

{
  const resultado = avaliarElegibilidadeReengajamento({
    stage: "COLETA_DESC_AUDIO",
    descricao: ""
  })

  assert.equal(resultado.elegivel, true)
  assert.deepEqual(tipos(resultado), ["descricao_pendente"])
}

{
  const resultado = avaliarElegibilidadeReengajamento({
    numeroCaso: "PREV.260701.001",
    docsAusentes: ["doc_rg"],
    docsParciais: []
  })

  assert.equal(resultado.elegivel, true)
  assert.deepEqual(tipos(resultado), ["documentos_pendentes"])
  assert.equal(evento(resultado, "documentos_pendentes").template, "caso_atualizacao")
}

{
  const resultado = avaliarElegibilidadeReengajamento({
    stage: "AGENDAMENTO_DURACAO",
    consultaStatus: "sem_consulta"
  })

  assert.equal(resultado.elegivel, true)
  assert.deepEqual(tipos(resultado), ["agendamento_nao_concluido"])
}

{
  const resultado = avaliarElegibilidadeReengajamento({
    consultaStatus: "nao_compareceu"
  })

  assert.equal(resultado.elegivel, true)
  assert.deepEqual(tipos(resultado), ["no_show_consulta"])
  assert.equal(evento(resultado, "no_show_consulta").template, "caso_atualizacao")
}

{
  const resultado = avaliarElegibilidadeReengajamento({
    encerrado: true,
    ultimaMsg: passado(8 * DIA_MS),
    leadIncompletoCapturado: true,
    consultaStatus: "nao_compareceu",
    docsAusentes: ["doc_rg"],
    numeroCaso: "PREV.260701.001"
  })

  assert.equal(resultado.elegivel, false)
  assert.deepEqual(resultado.eventos, [])
}

{
  const resultado = avaliarElegibilidadeReengajamento({
    optOut: true,
    ultimaMsg: passado(8 * DIA_MS),
    leadIncompletoCapturado: true
  })

  assert.equal(resultado.elegivel, false)
  assert.deepEqual(resultado.eventos, [])
}

{
  const resultado = avaliarElegibilidadeReengajamento({
    numeroCaso: "PREV.260701.001",
    stage: "AGENDAMENTO_CONFIRMAR",
    consultaStatus: "nao_compareceu",
    descricao: "",
    docsAusentes: ["doc_rg"],
    docsParciais: ["doc_ctps"]
  })

  assert.equal(resultado.elegivel, true)
  assert.deepEqual(tipos(resultado), [
    "no_show_consulta",
    "documentos_pendentes",
    "agendamento_nao_concluido"
  ])
}

{
  const resultado = avaliarElegibilidadeReengajamento({
    ultimaMsg: passado(8 * DIA_MS),
    leadIncompletoCapturado: true,
    stage: "descricao_caso",
    descricao: ""
  })

  assert.deepEqual(tipos(resultado), [
    "abandono_7d",
    "abandono_24h",
    "abandono_2h",
    "descricao_pendente"
  ])
}

{
  const resultado = avaliarElegibilidadeReengajamento({
    numeroCaso: "PREV.260701.001",
    stage: "cliente",
    consultaStatus: "agendada",
    descricao: "Relato completo",
    docsEntregues: ["doc_rg"],
    docsAusentes: [],
    docsParciais: [],
    ultimaMsg: passado(30 * 60 * 1000)
  })

  assert.equal(resultado.elegivel, false)
  assert.deepEqual(resultado.eventos, [])
  assert.deepEqual(resultado.avisos, [])
  assert.deepEqual(resultado.erros, [])
}

console.log("reengagement-engine.test.js: ok")
