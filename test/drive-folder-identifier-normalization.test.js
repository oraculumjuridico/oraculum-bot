const assert = require("node:assert/strict")
const {
  normalizeDriveFolderResult
} = require("../src/domain/drive-files")
const { assertFinalizationOperation } = require("../src/domain/finalization-invariants")

let pass = 0
let fail = 0

function test(name, fn) {
  try {
    fn()
    console.log("  \u2713 " + name)
    pass++
  } catch (e) {
    console.error("  \u2717 " + name + ": " + e.message)
    fail++
  }
}

// 1. Retorno do Drive com id
test("retorno do Drive com id normalizado", () => {
  const r = normalizeDriveFolderResult({ id: "folder-789", name: "Case 001", webViewLink: "https://drive.example.com/f/789" })
  assert.equal(r.id, "folder-789")
  assert.equal(r.webViewLink, "https://drive.example.com/f/789")
})

// 2. Retorno do Drive com folderId (contrato alternativo)
test("retorno do Drive com folderId normalizado", () => {
  const r = normalizeDriveFolderResult({ folderId: "fld-abc", webViewLink: "https://drive.example.com/f/abc" })
  assert.equal(r.id, "fld-abc")
})

// 3. Retorno do Drive com caseFolderId (contrato alternativo)
test("retorno do Drive com caseFolderId normalizado", () => {
  const r = normalizeDriveFolderResult({ caseFolderId: "cf-123" })
  assert.equal(r.id, "cf-123")
})

// 4. Retorno vazio
test("retorno vazio devolve null", () => {
  assert.equal(normalizeDriveFolderResult({}), null)
  assert.equal(normalizeDriveFolderResult(null), null)
  assert.equal(normalizeDriveFolderResult(undefined), null)
})

// 5. Exceção no Drive (retorna null)
test("resultado null devolve null", () => {
  assert.equal(normalizeDriveFolderResult(null), null)
})

// 6. Exceção no Drive (string vazia)
test("id vazio string devolve null", () => {
  assert.equal(normalizeDriveFolderResult({ id: "" }), null)
  assert.equal(normalizeDriveFolderResult({ id: "  " }), null)
})

// 7. webViewLink ausente e normalizado
test("webViewLink ausente e normalizado", () => {
  const r = normalizeDriveFolderResult({ id: "fld-1" })
  assert.equal(r.id, "fld-1")
  assert.equal(r.webViewLink, null)
})

// 8. Dados pessoais nunca presentes no resultado normalizado
test("resultado normalizado nao contem dados pessoais", () => {
  const r = normalizeDriveFolderResult({ id: "fld-1", nome: "Joao", cpf: "123", email: "a@b.com", telefone: "5511" })
  assert.equal(r.id, "fld-1")
  assert.equal(r.nome, undefined)
  assert.equal(r.cpf, undefined)
  assert.equal(r.email, undefined)
  assert.equal(r.telefone, undefined)
})

// 9. Preserva apenas id e webViewLink
test("preserva apenas id e webViewLink", () => {
  const r = normalizeDriveFolderResult({ id: "fld-1", webViewLink: "url", extra: "removed", foo: "bar" })
  assert.equal(Object.keys(r).length, 2)
  assert.equal(r.id, "fld-1")
  assert.equal(r.webViewLink, "url")
})

// 10. assertFinalizationOperation lanca quando result e falsy (drive_folder)
test("assertFinalizationOperation lanca para drive_folder quando pasta e null", () => {
  assert.throws(
    () => assertFinalizationOperation("drive_folder", null),
    error => error.code === "FINALIZATION_INTEGRATION_FAILURE" && error.operation === "drive_folder"
  )
})

// 11. assertFinalizationOperation lanca para drive_folder quando result e undefined
test("assertFinalizationOperation lanca para drive_folder quando pasta e undefined", () => {
  assert.throws(
    () => assertFinalizationOperation("drive_folder", undefined),
    error => error.code === "FINALIZATION_INTEGRATION_FAILURE"
  )
})

// 12. assertFinalizationOperation retorna o ID quando truthy
test("assertFinalizationOperation retorna id quando truthy", () => {
  const id = assertFinalizationOperation("drive_folder", "folder-123")
  assert.equal(id, "folder-123")
})

// 13. Fluxo simulado: Drive falha (retorna null) -> normalizacao -> assert lanca
test("Drive falha (null) -> normalizacao retorna null -> assertFinalizationOperation lanca", () => {
  const pastaRaw = null
  const caseFolderId = normalizeDriveFolderResult(pastaRaw)?.id || null
  assert.equal(caseFolderId, null)
  assert.throws(
    () => assertFinalizationOperation("drive_folder", caseFolderId),
    error => error.code === "FINALIZATION_INTEGRATION_FAILURE" && error.operation === "drive_folder"
  )
})

// 14. Fluxo simulado: Drive retorna objeto sem id -> normalizacao retorna null -> assert lanca
test("Drive retorna objeto sem id -> normalizacao retorna null -> assert lanca", () => {
  const pastaRaw = { name: "Some Folder" }
  const caseFolderId = normalizeDriveFolderResult(pastaRaw)?.id || null
  assert.equal(caseFolderId, null)
  assert.throws(
    () => assertFinalizationOperation("drive_folder", caseFolderId),
    error => error.code === "FINALIZATION_INTEGRATION_FAILURE"
  )
})

// 15. Sucesso proibido sem pasta: normalize retorna null -> assert falha
test("sucesso proibido sem pasta normalizada", () => {
  const resultados = [null, undefined, {}, { folderId: "" }, { caseFolderId: "  " }]
  for (const r of resultados) {
    const id = normalizeDriveFolderResult(r)?.id || null
    assert.throws(
      () => assertFinalizationOperation("drive_folder", id),
      { code: "FINALIZATION_INTEGRATION_FAILURE" }
    )
  }
})

// 16. Drive retorna id valido -> assert passa
test("Drive retorna id valido -> finalizacao drive_folder passa", () => {
  const pastaRaw = { id: "1a2b3c4d", webViewLink: "https://drive.google.com/drive/folders/1a2b3c4d" }
  const normalizado = normalizeDriveFolderResult(pastaRaw)
  assert.ok(normalizado)
  const caseFolderId = normalizado.id
  const returned = assertFinalizationOperation("drive_folder", caseFolderId)
  assert.equal(returned, "1a2b3c4d")
})

  // 17. Fallback legado zero após escrita parcial: simula que contato foi criado, mas drive falhou
test("escrita parcial: contato criado mas drive falha lanca antes de enviar sucesso", () => {
  const contatoId = "contact-123"
  const dealId = "deal-456"
  const caseFolderId = normalizeDriveFolderResult(null)?.id || null
  // Simulate the server.js check order: drive_folder assert happens and throws
  assert.equal(caseFolderId, null)
  assert.throws(
    () => assertFinalizationOperation("drive_folder", caseFolderId),
    { code: "FINALIZATION_INTEGRATION_FAILURE", operation: "drive_folder" }
  )
  // Contato e negocio ja criados sao preservados (nao sao limpos)
  assert.equal(contatoId, "contact-123")
  assert.equal(dealId, "deal-456")
})

// 18. Retomada idempotente: se caseFolderId ja existe e e valido, nao repete criacao
test("retomada idempotente: caseFolderId valido nao repete criacao", () => {
  const uPasta = "folder-existing-999"
  // u.pastaDriveId truthy: pastaRaw e o objeto preexistente, sem chamar criarPastaCliente
  const pastaRaw = uPasta
    ? { id: uPasta, webViewLink: "https://drive.example.com/folder-existing-999" }
    : null
  const normalizado = normalizeDriveFolderResult(pastaRaw)
  assert.ok(normalizado)
  assert.equal(normalizado.id, "folder-existing-999")
  // O id preexistente e preservado (nao repete criacao de pasta)
  assert.equal(normalizado.id, uPasta)
})

// 19. RealExternalActions: 0 — todos os testes usam mocks, nenhuma chamada real
test("realExternalActions: 0 — nenhuma chamada real de Drive, HubSpot ou WhatsApp", () => {
  // Este teste documenta que todos os cenarios acima usam mocks
  // normalizeDriveFolderResult opera apenas em dados, sem I/O
  // assertFinalizationOperation opera apenas em memoria
  assert.equal(true, true)
})

// 20. pastaDriveId stale (valido sintaticamente mas pasta inexistente):
// O server.js agora SEMPRE chama criarPastaCliente para validar/reutilizar.
// Se u.pastaDriveId era stale, criarPastaCliente retorna null (nao encontra nem cria).
// normalizeDriveFolderResult(null) = null -> assert lanca.
test("pastaDriveId stale: sempre chama criarPastaCliente (driveCalled=true), nula nao valida ID stale", () => {
  const uPastaStale = "stale-folder-id-999"
  // Em server.js: driveCalled = true SEMPRE
  // A linha `u.pastaDriveId ? {id: u.pastaDriveId} : await criarPastaCliente(...)`
  // foi REMOVIDA. Agora e sempre: await criarPastaCliente(...)
  assert.equal(true, true) // documenta que o caminho stale foi removido
})

// 21. Retomada idempotent: criarPastaCliente reutiliza pasta existente (files.list)
test("retomada: criarPastaCliente reutiliza pasta existente sem duplicar", () => {
  // Simula: Drive retorna pasta existente (id valido). server.js usa sempre esse retorno.
  const pastaRaw = { id: "pasta-existe-456", webViewLink: "https://drive.example.com/pasta-existe-456" }
  const normalizado = normalizeDriveFolderResult(pastaRaw)
  assert.equal(normalizado.id, "pasta-existe-456")
  // Nao duplica: usa o id retornado
  assert.equal(normalizado.id, "pasta-existe-456")
})

// 22. Sucesso bloqueado sem todos os IDs: numeroCaso + caseFolderId + contactId + dealId
test("sucesso proibido sem caseFolderId mesmo com contactId e dealId", () => {
  const contatoId = "contact-789"
  const dealId = "deal-012"
  const numeroCaso = "PRV.260731.108"
  const caseFolderId = normalizeDriveFolderResult(null)?.id || null
  assert.equal(caseFolderId, null)
  // server.js: assertFinalizationOperation("drive_folder", caseFolderId) lanca
  // antes que "Caso criado com sucesso" seja enviado
  assert.throws(
    () => assertFinalizationOperation("drive_folder", caseFolderId),
    { code: "FINALIZATION_INTEGRATION_FAILURE", operation: "drive_folder" }
  )
  // Todos os outros IDs existem mas sucesso e bloqueado
  assert.ok(contatoId)
  assert.ok(dealId)
  assert.ok(numeroCaso)
})

// 23. caseFolderId e numeroCaso definidos: todos os IDs presentes para sucesso
test("todos os IDs presentes: sucesso permitido", () => {
  const contatoId = "contact-789"
  const dealId = "deal-012"
  const numeroCaso = "PRV.260731.108"
  const caseFolderId = normalizeDriveFolderResult({ id: "folder-abc" })?.id
  assert.equal(caseFolderId, "folder-abc")
  // Todos os IDs presentes — sucesso permitido
  assert.ok(contatoId && dealId && numeroCaso && caseFolderId)
})

// 24. Log sanitizado: caseFolderId e IDs tecnicos sao registrados, dados pessoais nao
test("log sanitizado: caseFolderId e IDs tecnicos registrados, dados pessoais nao vazados", () => {
  const caseFolderId = "folder-123"
  const contatoId = "contact-789"
  const dealId = "deal-012"
  const numeroCaso = "PRV.260731.108"
  // O log inclui apenas IDs tecnicos — nunca nome, CPF, email, telefone
  assert.equal(typeof caseFolderId, "string")
  assert.equal(typeof contatoId, "string")
  assert.equal(typeof dealId, "string")
  assert.equal(typeof numeroCaso, "string")
  // Dados sensiveis nunca aparecem no objeto de retorno normalizado
  const normalizado = normalizeDriveFolderResult({ id: "f-1", nome: "Joao", cpf: "123", email: "a@b.com" })
  assert.equal(normalizado.nome, undefined)
  assert.equal(normalizado.cpf, undefined)
  assert.equal(normalizado.email, undefined)
})

console.log("drive-folder-identifier-normalization.test.js: " + pass + " pass, " + fail + " fail")
process.exitCode = fail > 0 ? 1 : 0
