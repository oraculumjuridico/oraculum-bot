const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const persistence = require("../src/domain/state-persistence")
const { obterOuCriarContato, obterOuCriarNegocio } = require("../src/domain/hubspot-operation-journal")

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "oraculum-hubspot-journal-"))
persistence.configurarStatePersistence({ DATA_DIR: dataDir })
persistence.carregarWebhookInbox()
test.after(() => fs.rmSync(dataDir, { recursive: true, force: true }))

test("journal impede segunda criação de contato para a mesma mensagem", async () => {
  let creates = 0
  const input = { messageId: "msg-contact-1", identity: "5511999990000", numeroCaso: "CLI.2026.001", procurar: async () => null, criar: async () => `contact-${++creates}` }
  assert.equal((await obterOuCriarContato(input)).contactId, "contact-1")
  assert.equal((await obterOuCriarContato(input)).contactId, "contact-1")
  assert.equal(creates, 1)
})

test("creating sem confirmação bloqueia duplicidade e exige reconciliação", async () => {
  const key = persistence.criarChaveOperacaoHubSpot({ messageId: "msg-deal-uncertain", operationType: "deal", identity: "contact-x", numeroCaso: "CLI.2026.002" })
  persistence.registrarOperacaoHubSpot({ operationKey: key, messageId: "msg-deal-uncertain", operationType: "deal", numeroCaso: "CLI.2026.002", status: "creating" })
  let creates = 0
  await assert.rejects(
    obterOuCriarNegocio({ messageId: "msg-deal-uncertain", identity: "contact-x", numeroCaso: "CLI.2026.002", procurar: async () => null, criar: async () => `deal-${++creates}` }),
    { code: "HUBSPOT_RECONCILIATION_REQUIRED" }
  )
  assert.equal(creates, 0)
  assert.equal(persistence.obterOperacaoHubSpot(key).status, "reconciliation_required")
})

test("resultado de reconciliação conclui operação sem POST", async () => {
  let creates = 0
  const result = await obterOuCriarNegocio({
    messageId: "msg-deal-found", identity: "contact-y", numeroCaso: "CLI.2026.003",
    procurar: async () => ({ id: "deal-existing" }), criar: async () => `deal-${++creates}`
  })
  assert.equal(result.dealId, "deal-existing")
  assert.equal(creates, 0)
})
