"use strict"

const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const test = require("node:test")
const assert = require("node:assert/strict")
const { resolveComplementaryContext } = require("../src/domain/post-human-complementary-fields")
const { primeiroEUltimoNome } = require("../src/domain/admin-name-resolver")

const NOME_CANONICO = "Jesaias Belmiro Leite Mendes"

function resolver({ firstname, lastname, usuario = {} } = {}) {
  return resolveComplementaryContext({
    usuario: { nome: NOME_CANONICO, ...usuario },
    contact: { id: "contact-1", properties: { firstname, lastname } }
  })
}

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start)
  assert.ok(start >= 0 && end > start, `recorte ausente: ${startMarker}`)
  return source.slice(start, end)
}

function executarWebhookComPerfilReal({ telefone, usuario, payload, message }) {
  const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
  const helpersNome = sourceBetween(serverSource, "function nomeValidoParaExibicao", "async function resolverUsuarioPorHubSpot")
  const resolverHubSpot = sourceBetween(serverSource, "async function resolverUsuarioPorHubSpot", "function salvarEtapa")
  const webhookHandler = sourceBetween(serverSource, "async function processarMensagemWebhook", "let webhookInboxDraining")
  const users = { [telefone]: usuario }
  let chamadaProcessar = null
  const sandbox = {
    users,
    Date,
    sanitizarTextoEntrada: value => String(value || "").trim(),
    telefoneCanonico: value => String(value || ""),
    validarNomePerfilWhatsApp: require("../src/domain/admin-name-resolver").validarNomePerfilWhatsApp,
    montarNomeCompletoHubSpot: require("../src/domain/admin-name-resolver").montarNomeCompletoHubSpot,
    hsBuscarContatoSeguro: async () => ({ status: "ok", contato: null }),
    hsBuscarNegociosComCasoDoContato: async () => null,
    definirContatoId: (u, contatoId) => { u.contatoId = contatoId },
    agendarPersistenciaUsers: () => {},
    consumirPendenciaAudioPedidoDocumentos: async () => {},
    digitando: async () => {},
    processar: async (from, nomeWA, text, msgObj) => {
      chamadaProcessar = { from, nomeWA, text, msgObj }
      await sandbox.resolverUsuarioPorHubSpot(from, nomeWA)
      return null
    }
  }

  vm.runInNewContext(
    `${helpersNome}\n${resolverHubSpot}\n${webhookHandler}\nthis.resolverUsuarioPorHubSpot = resolverUsuarioPorHubSpot; this.processarMensagemWebhook = processarMensagemWebhook`,
    sandbox,
    { filename: "server.js" }
  )

  return sandbox.processarMensagemWebhook(payload.value, message)
    .then(() => ({ usuario: users[telefone], chamadaProcessar }))
}

test("identidade pós-humana usa firstname e lastname completos do HubSpot", () => {
  const result = resolver({ firstname: "Jesaias", lastname: "Belmiro Leite Mendes" })

  assert.equal(result.humanReviewRequired, false)
  assert.equal(result.reviewReason, null)
  assert.equal(result.data.nomeCompleto.valor, NOME_CANONICO)
})

test("identidade pós-humana ainda sinaliza divergência real de nome", () => {
  const result = resolver({ firstname: "Outro", lastname: "Nome" })

  assert.equal(result.humanReviewRequired, true)
  assert.equal(result.reviewReason, "dados_divergentes")
  assert.deepEqual(result.divergences.map(item => item.field), ["nomeCompleto"])
})

test("profile.name real do webhook não participa da identidade canônica pós-humana", async () => {
  const telefone = "5511999999999"
  const profileName = "Nome diferente no WhatsApp"
  const usuarioInicial = {
    nome: NOME_CANONICO,
    nomeConfirmado: true,
    nomeHubspot: NOME_CANONICO,
    _hubspotConsultadoEm: Date.now(),
    _hubspotResultadoId: "contact-1"
  }
  const { usuario, chamadaProcessar } = await executarWebhookComPerfilReal({
    telefone,
    usuario: usuarioInicial,
    payload: {
      value: {
        contacts: [{ wa_id: telefone, profile: { name: profileName } }],
        messages: [{ id: "wamid.profile-name", from: telefone, text: { body: "oi" } }]
      }
    },
    message: { id: "wamid.profile-name", from: telefone, text: { body: "oi" } }
  })

  assert.equal(chamadaProcessar.nomeWA, profileName)
  assert.equal(usuario.nomeWA, profileName)
  assert.equal(usuario.nomePerfilWhatsApp, profileName)
  assert.equal(usuario.nome, NOME_CANONICO)

  const result = resolveComplementaryContext({
    usuario,
    firstname: "Jesaias",
    contact: { id: "contact-1", properties: { firstname: "Jesaias", lastname: "Belmiro Leite Mendes" } }
  })

  assert.equal(result.humanReviewRequired, false)
  assert.equal(result.data.nomeCompleto.valor, NOME_CANONICO)
})

test("ausência de lastname mantém fallback seguro para firstname", () => {
  const result = resolver({ firstname: "Jesaias", lastname: undefined, usuario: { nome: "Jesaias" } })

  assert.equal(result.humanReviewRequired, false)
  assert.equal(result.data.nomeCompleto.valor, "Jesaias")
})

test("display compacto do Admin continua usando primeiro e último nome", () => {
  assert.equal(primeiroEUltimoNome(NOME_CANONICO), "Jesaias Mendes")
})
