"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { PostHumanCycleRepository } = require("../src/domain/post-human-cycle-model")
const { processPostHumanCycle } = require("../src/domain/post-human-flow")
const { tratarRespostaClientePosAtendimento } = require("../src/domain/post-human-response-handler")
const { montarBotaoAtendimentoRealizado, handleAtendimentoRealizadoConfirmation } = require("../src/domain/admin-post-human-complementation")
const { PostHumanPostgresMock } = require("./mocks/post-human-postgres-mock")

;
(async () => {
  const originalEnabled = process.env.POST_HUMAN_COMPLEMENTATION_ENABLED
  const originalCases = process.env.POST_HUMAN_PILOT_CASES
  process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = "true"
  const authorized = "PILOT-001"
  process.env.POST_HUMAN_PILOT_CASES = authorized
  const button = montarBotaoAtendimentoRealizado("D-PILOT", authorized, { allowedCases: [authorized], adminId: "ADMIN", contatoId: "CONTACT-PILOT", customerPhone: "5511999999999", customerPhoneConfirmed: true })
  assert.equal(button?.title, "✅ Atendimento realizado")
  assert.equal(montarBotaoAtendimentoRealizado("D-OTHER", "OTHER", { allowedCases: [authorized] }), null)

  const externalCalls = { metaMock: 0, hubspotMock: 0, driveMock: 0, postgresMock: 0, real: 0 }
  const pool = new PostHumanPostgresMock(() => { externalCalls.postgresMock++ })
  const repo = new PostHumanCycleRepository({ pool, mode: "postgres" })
  await repo.initialize()
  const usuario = { negocioId: "D-PILOT", contatoId: "CONTACT-PILOT", numeroCaso: authorized, telefoneNormalizado: "5511999999999", ultimaMsg: Date.now(), listaDocumental: ["RG"], docsEntregues: ["RG"] }
  const confirmation = await handleAtendimentoRealizadoConfirmation({
    from: "ADMIN", interactionId: button.id, usuario, isAdmin: value => value === "ADMIN", repository: repo,
    processCycle: (cycle, currentUser) => processPostHumanCycle({
      cycle, repository: repo, usuario: currentUser,
      deps: {
        sendFree: async () => { externalCalls.metaMock++; return { id: "mock-provider-id" } },
        sendTemplate: async () => { externalCalls.metaMock++; return { id: "mock-provider-id" } },
        templateConfig: { nome: "caso_atualizacao_v3", idioma: "pt_BR", parametrosEsperados: 0, componentes: [] },
        listarArquivosDrive: async () => { externalCalls.driveMock++; return [] },
        listarNotasDocumentais: async () => { externalCalls.hubspotMock++; return [] }
      }
    })
  })
  assert.equal(confirmation.existing, false)
  assert.equal(confirmation.text, "Atendimento humano registrado. A verificação de pendências foi iniciada.")
  const cycle = await repo.findActiveByBusiness("D-PILOT")
  assert.equal(cycle.status, "awaiting_response")

  const skipButton = montarBotaoAtendimentoRealizado("D-SKIP", authorized, { allowedCases: [authorized], adminId: "ADMIN", contatoId: "CONTACT-SKIP", customerPhone: "5511999999998", customerPhoneConfirmed: true })
  const skipUsuario = { negocioId: "D-SKIP", contatoId: "CONTACT-SKIP", numeroCaso: authorized, telefoneNormalizado: "5511999999998", listaDocumental: ["RG"], docsEntregues: ["RG"] }
  let skipGetLatestCallCount = 0
  const skipConfirmation = await handleAtendimentoRealizadoConfirmation({
    from: "ADMIN", interactionId: skipButton.id, usuario: skipUsuario, isAdmin: value => value === "ADMIN", repository: repo,
    processCycle: (cycle, currentUser) => processPostHumanCycle({
      cycle, repository: repo, usuario: currentUser,
      deps: {
        getLatestCustomerMessage: async () => (skipGetLatestCallCount++ === 0 ? 1000 : 2000),
        sendFree: async () => { externalCalls.metaMock++; return { id: "mock-provider-id" } },
        sendTemplate: async () => { externalCalls.metaMock++; return { id: "mock-provider-id" } },
        templateConfig: { nome: "caso_atualizacao_v3", idioma: "pt_BR", parametrosEsperados: 0, componentes: [] },
        listarArquivosDrive: async () => { externalCalls.driveMock++; return [] },
        listarNotasDocumentais: async () => { externalCalls.hubspotMock++; return [] }
      }
    })
  })
  assert.equal(skipConfirmation.existing, false)
  assert.equal(skipConfirmation.skipped, true)
  assert.equal(skipConfirmation.text, "Nova mensagem do cliente surgiu durante a análise. O envio foi cancelado e o caso precisa ser revisado.")
  assert.equal(externalCalls.metaMock, 1)
  const skipCycle = await repo.findActiveByBusiness("D-SKIP")
  assert.equal(skipCycle.status, "ready_to_send")

  const response = await tratarRespostaClientePosAtendimento({
    from: "5511999999999", msgType: "text", content: "informação final",
    usuario: { negocioId: "D-PILOT", contatoId: "CONTACT-PILOT", numeroCaso: authorized }, repository: repo,
    deps: { saveInformation: async () => { externalCalls.hubspotMock++ }, isComplete: () => true }
  })
  assert.equal(response.cycle.status, "completed")
  assert.equal(externalCalls.real, 0)
  console.log(JSON.stringify({ pilot: "PASS", authorizedCase: authorized, finalStatus: "completed", externalCalls, realExternalActions: 0 }))
  if (originalEnabled === undefined) delete process.env.POST_HUMAN_COMPLEMENTATION_ENABLED
  else process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = originalEnabled
  if (originalCases === undefined) delete process.env.POST_HUMAN_PILOT_CASES
  else process.env.POST_HUMAN_PILOT_CASES = originalCases
})().catch(error => { console.error(error); process.exitCode = 1 })
