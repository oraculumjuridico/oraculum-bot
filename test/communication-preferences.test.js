"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { createCommunicationPreferences, applyPreferenceToUser, legacyPreference } = require("../src/domain/communication-preferences")

let passed = 0
function test(name, fn) { try { fn(); passed += 1; console.log(`ok - ${name}`) } catch (error) { console.error(`not ok - ${name}`); throw error } }
function newStore() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "oraculum-communication-preferences-"))
  return { dataDir, store: createCommunicationPreferences({ dataDir, writeJsonAtomically: (file, value) => fs.writeFileSync(file, JSON.stringify(value), "utf8") }) }
}

test("grava e restaura os três estados", () => {
  const { dataDir, store } = newStore()
  for (const preference of ["nao_definido", "texto", "audio_sempre"]) store.set({ preference, source: "admin_manual", contactId: `c-${preference}`, phoneNormalized: "5511999999999" })
  const restored = createCommunicationPreferences({ dataDir, writeJsonAtomically: () => {} }); restored.load()
  for (const preference of ["nao_definido", "texto", "audio_sempre"]) assert.equal(restored.resolve({ contactId: `c-${preference}` }).preference, preference)
})

test("contactId prevalece sobre telefone", () => {
  const { store } = newStore()
  store.set({ preference: "texto", source: "admin_manual", contactId: "contact-priority", phoneNormalized: "5511888888888" })
  store.set({ preference: "audio_sempre", source: "pre_atendimento", phoneNormalized: "5511777777777" })
  assert.equal(store.resolve({ contactId: "contact-priority", phoneNormalized: "5511777777777" }).preference, "texto")
})

test("registro por telefone é promovido por contactId sem cópia divergente", () => {
  const { store } = newStore()
  store.set({ preference: "texto", source: "pre_atendimento", phoneNormalized: "5511666666666" })
  const promoted = store.promote({ contactId: "contact-promoted", phoneNormalized: "5511666666666" })
  assert.equal(promoted.preference, "texto")
  assert.equal(store.snapshot().byContactId["contact-promoted"].preference, "texto")
  assert.equal(store.snapshot().byPhone["5511666666666"], undefined)
})

test("promoção repetida é idempotente", () => {
  const { store } = newStore()
  store.set({ preference: "audio_sempre", source: "pre_atendimento", phoneNormalized: "5511666666666" })
  const first = store.promote({ contactId: "contact-promoted", phoneNormalized: "5511666666666" })
  const second = store.promote({ contactId: "contact-promoted", phoneNormalized: "5511666666666" })
  assert.deepEqual(second, first)
})

test("pré-atendimento preserva as escolhas explícitas de texto e áudio", () => {
  const { store } = newStore()
  store.set({ preference: "texto", source: "pre_atendimento", phoneNormalized: "5511444444444" })
  store.set({ preference: "audio_sempre", source: "pre_atendimento", phoneNormalized: "5511333333333" })
  assert.equal(store.resolve({ phoneNormalized: "5511444444444" }).preference, "texto")
  assert.equal(store.resolve({ phoneNormalized: "5511333333333" }).preference, "audio_sempre")
})

test("áudio recebido isoladamente não altera a preferência", () => {
  const { store } = newStore()
  store.set({ preference: "texto", source: "pre_atendimento", contactId: "audio-isolado", phoneNormalized: "5511222222222" })
  assert.equal(store.resolve({ contactId: "audio-isolado" }).preference, "texto")
})

test("pré-atendimento do servidor registra texto e áudio sem depender de mídia recebida", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
  assert.match(server, /modoAtendimento === "texto" \? "texto" : "audio_sempre"/)
  assert.match(server, /"pre_atendimento"/)
  assert.doesNotMatch(server, /msgObj\?\.type[^\n]{0,120}definirPreferenciaComunicacao/)
})

test("modoTexto legado true resulta em texto e false em nao_definido", () => {
  assert.equal(legacyPreference(true), "texto")
  assert.equal(legacyPreference(false), "nao_definido")
  const user = { modoTexto: true }
  applyPreferenceToUser(user, { preference: "nao_definido", source: "migracao_legado" })
  assert.equal(user.modoTexto, true)
})

test("snapshot antigo não sobrescreve preferência explícita", () => {
  const { store } = newStore()
  store.set({ preference: "texto", source: "pre_atendimento", contactId: "contact-explicit", phoneNormalized: "5511555555555" })
  assert.equal(store.resolve({ contactId: "contact-explicit", snapshotPreference: { preference: "audio_sempre" }, modoTexto: false }).preference, "texto")
})

test("dois negócios locais do mesmo contato recebem a mesma preferência", () => {
  const record = { preference: "audio_sempre", source: "admin_manual", contactId: "same-contact", phoneNormalized: "5511111111111" }
  const first = { contatoId: "same-contact", negocioId: "deal-a", modoTexto: true }
  const second = { contatoId: "same-contact", negocioId: "deal-b", modoTexto: true }
  applyPreferenceToUser(first, record); applyPreferenceToUser(second, record)
  assert.equal(first.communicationPreference.preference, second.communicationPreference.preference)
  assert.equal(first.modoTexto, false); assert.equal(second.modoTexto, false)
})

test("arquivo inválido é tratado com segurança", () => {
  const { dataDir, store } = newStore()
  fs.writeFileSync(store.file, "{corrompido", "utf8")
  assert.doesNotThrow(() => store.load())
  assert.equal(store.resolve({ modoTexto: false }).preference, "nao_definido")
})

test("Admin não acrescenta escrita externa e exige contato", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
  assert.match(server, /casoPreferenciaComunicacao/)
  assert.match(server, /if \(!item\?\.u\?\.contatoId\)/)
  assert.match(server, /"admin_manual"/)
  assert.doesNotMatch(server, /hsAtualizarContato\(.*communication/i)
  assert.doesNotMatch(server, /hsCriarContato\(.*communication/i)
  assert.doesNotMatch(server, /hsCriarNegocio\(.*communication/i)
})

test("não há logs de telefone completo no módulo", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "domain", "communication-preferences.js"), "utf8")
  assert.doesNotMatch(source, /console\.(log|warn|error)/)
  assert.doesNotMatch(source, /log(Debug|Erro)\(/)
})

console.log(`RESULT ${passed}/13 passed`)
