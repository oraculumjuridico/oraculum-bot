const assert = require("node:assert/strict")

;(async () => {
  const { app, iniciarServidor, users } = require("../server.js")

  assert.ok(app, "server app should exist")
  assert.ok(typeof iniciarServidor === "function", "iniciarServidor should be a function")
  assert.ok(typeof users === "object", "users state should exist")

  const testPhone = "5511999990000"
  if (!users[testPhone]) {
    users[testPhone] = {
      stage: "acolhimento",
      etapa: "audio_aguardando",
      nomeWA: "Cliente Teste",
      nome: "Cliente Teste",
      whatsappContato: testPhone,
      cpf: "12345678900",
      area: "INSS",
      situacao: "Aposentadoria",
      tipo: "previdenciario",
      contatoId: null,
      negocioId: null,
      pastaDriveId: null,
      numeroCaso: null,
      documents: [],
      nomeConfirmado: true,
      _reviewRequired: false,
      _reviewBlockers: [],
      _canonicalCheckpoints: {},
      _canonicalPlanHash: null,
      _canonicalPlanStatus: null
    }
  }

  const u = users[testPhone]
  assert.ok(u._canonicalCheckpoints, "user should have _canonicalCheckpoints")
  assert.equal(u._canonicalPlanHash, null, "plan hash should be null before execution")

  console.log("server-canonical-integration.test.js: ok")
})().catch(error => { console.error(error); process.exitCode = 1 })
