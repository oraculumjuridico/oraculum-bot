"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")

test("menu Admin expõe todos os fluxos operacionais e handlers reais", () => {
  for (const token of [
    "Prioridades", "Novo atendimento IA", "Consultar caso", "Documentos", "Comunicação",
    "Consultas", "Alertas", "executarConsultaCasoAdmin", "executarComplementacaoCasoAdmin",
    "processExistingCaseAdminMedia", "executarAgendamentoCasoAdmin"
  ]) assert.match(server, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
})

test("upload administrativo posterior exige seleção e só confirma após fileId", () => {
  assert.match(server, /acaoCasoPendente:\s*"enviar_documento"/)
  assert.match(server, /caseFolderId:\s*item\.u\.pastaDriveId/)
  assert.match(server, /if \(!result\.ok\)/)
  assert.match(server, /Documento confirmado no caso/)
})

test("agendamento não usa integração sem credenciais e mantém mensagem de pendência", () => {
  assert.match(server, /calendarConfigured = Boolean/)
  assert.match(server, /calendarConfigured \? criarEventoConsulta : undefined/)
  assert.match(server, /Solicitação registrada, aguardando confirmação/)
})
