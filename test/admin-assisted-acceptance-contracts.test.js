"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const axios = require("axios")
const { createLiveCaseFlow } = require("../src/domain/live-case-executor-bridge")
const { montarPropsContatoHubSpot, hsBuscarPorCpf } = require("../src/domain/hubspot-core")
const {
  criarCampoAdminAssistido,
  criarCampoCpfAdminAssistido,
  criarDadosVaziosAdminAssistido
} = require("../src/domain/admin-assisted-ai-schema")
const {
  montarUsuarioFinalizacaoAdminAssistido,
  confirmarCriarCasoAdminAssistido
} = require("../src/domain/admin-assisted-ai-flow")

function canonicalDeps(overrides = {}) {
  const calls = []
  return {
    calls,
    checkpointRepository: { async load() { return null }, async save() {} },
    hsBuscarPorCpf: async () => { calls.push("cpf"); return null },
    hsBuscarPorPhone: async () => { calls.push("phone"); return null },
    hsCriarContato: async () => { calls.push("create-contact"); return "contact-1" },
    hsAtualizarContato: async () => true,
    montarPropsContatoHubSpot: () => ({ firstname: "Pessoa" }),
    montarPropsAusentesContatoHubSpot: () => ({}),
    hsBuscarNegocioAbertoDoContato: async () => { calls.push("find-deal"); return "deal-old" },
    hsCriarNegocio: async () => { calls.push("create-deal"); return "deal-new" },
    hsAtualizarNegocioSerializado: async () => true,
    hsAtualizarEtapaNegocio: async () => true,
    montarTituloNegocioHubSpot: () => "Caso sintético",
    getHubSpotDealStateProps: () => ({}),
    hsAssociar: async (contactId, dealId) => { calls.push(`associate:${contactId}:${dealId}`); return true },
    criarPastaCliente: async () => ({ id: "folder-1" }),
    uploadDrive: async () => null,
    processarAnaliseDocumentalSegura: async () => ({}),
    enviarWhatsAppAdmin: async () => {},
    hsCriarNota: async () => true,
    hsCriarNotaNegocio: async () => true,
    ...overrides
  }
}

function canonicalUser(overrides = {}) {
  return {
    nome: "Pessoa Sintética",
    nomeConfirmado: true,
    cpf: "52998224725",
    whatsappContato: "5581999990000",
    numeroCaso: "CASE.SYN.001",
    area: "Civil",
    situacao: "Contrato",
    tipo: "civil",
    documents: [],
    _reviewBlockers: [],
    ...overrides
  }
}

test("reconciliação canônica procura CPF antes do telefone", async () => {
  const deps = canonicalDeps({
    hsBuscarPorCpf: async () => { deps.calls.push("cpf"); return { id: "contact-cpf", properties: {} } }
  })
  const flow = createLiveCaseFlow(deps)
  const result = await flow.executeLiveCaseFlow(canonicalUser())
  assert.equal(result.result.completed, true)
  assert.equal(deps.calls.includes("phone"), false)
  assert.equal(deps.calls[0], "cpf")
  assert.ok(deps.calls.includes("associate:contact-cpf:deal-old"))
})

test("busca CPF do runtime consulta canônico e legado, deduplica e bloqueia ambiguidade", async () => {
  const original = axios.post
  const values = []
  try {
    axios.post = async (_url, body) => {
      values.push(body.filterGroups[0].filters[0].value)
      return { data: { results: [{ id: "same-contact", properties: {} }] } }
    }
    assert.equal((await hsBuscarPorCpf("529.982.247-25")).id, "same-contact")
    assert.deepEqual(values, ["52998224725", "529.982.247-25"])
    axios.post = async (_url, body) => ({ data: { results: [{ id: body.filterGroups[0].filters[0].value }] } })
    await assert.rejects(() => hsBuscarPorCpf("52998224725"), error => error.code === "HUBSPOT_CONTACT_CPF_AMBIGUOUS")
  } finally {
    axios.post = original
  }
})

test("novo caso cria outro Negócio para o mesmo Contato", async () => {
  const deps = canonicalDeps({
    hsBuscarPorCpf: async () => ({ id: "contact-existing", properties: {} })
  })
  const flow = createLiveCaseFlow(deps)
  const result = await flow.executeLiveCaseFlow(canonicalUser({ _novoCasoDeCliente: true }))
  assert.equal(result.result.completed, true)
  assert.equal(deps.calls.includes("find-deal"), false)
  assert.ok(deps.calls.includes("create-deal"))
  assert.ok(deps.calls.includes("associate:contact-existing:deal-new"))
})

test("Contato genérico incompatível encontrado por telefone não é reutilizado", async () => {
  const deps = canonicalDeps({
    hsBuscarPorCpf: async () => null,
    hsBuscarPorPhone: async () => ({ id: "generic-contact", properties: { firstname: "Outra", lastname: "Pessoa" } })
  })
  const flow = createLiveCaseFlow(deps)
  const result = await flow.executeLiveCaseFlow(canonicalUser())
  assert.equal(result.result.completed, false)
  assert.equal(result.result.code, "HUBSPOT_PHONE_IDENTITY_CONFLICT")
  assert.equal(deps.calls.includes("create-contact"), false)
  assert.equal(deps.calls.some(call => call.startsWith("associate:")), false)
})

test("propriedades permanentes ficam no Contato e dados sem propriedade ficam no resumo", () => {
  const props = montarPropsContatoHubSpot("5581888880000", {
    nome: "Pessoa Sintética Completa",
    whatsappContato: "5581999990000",
    cpf: "52998224725",
    email: "pessoa@example.test",
    endereco: "Rua Teste",
    numeroEndereco: "42",
    complementoEndereco: "Sala 3",
    bairro: "Centro",
    cidade: "Recife",
    uf: "PE",
    cep: "50000000",
    origemCaptacao: "admin_assistido_ia"
  })
  assert.equal(props.firstname, "Pessoa")
  assert.equal(props.lastname, "Sintética Completa")
  assert.equal(props.phone, "5581999990000")
  assert.match(props.address, /Rua Teste/)
  assert.match(props.address, /42/)
  assert.match(props.address, /Sala 3/)
  assert.match(props.address, /Centro/)
  assert.equal(props.cpf_do_cliente, "52998224725")

  const dados = criarDadosVaziosAdminAssistido()
  for (const [campo, valor] of Object.entries({
    nomeCompleto: "Pessoa Sintética", telefone: "5581999990000", cidade: "Recife", uf: "PE",
    areaJuridica: "INSS", tipoCaso: "Incapacidade", descricao: "Relato sintético.",
    estadoCivil: "Casada", profissao: "Analista", situacaoProfissional: "Afastada",
    acidenteTrabalho: "Não", limitacoesAtuais: "Limitação sintética", composicaoFamiliar: "Duas pessoas",
    rendaAtual: "Valor informado", dataRequerimento: "01/02/2026", resultadoPericia: "Indeferido",
    conflitoInteresses: "Não identificado"
  })) dados[campo] = criarCampoAdminAssistido(valor, "confirmado")
  dados.cpf = criarCampoCpfAdminAssistido("52998224725", "confirmado")
  const usuario = montarUsuarioFinalizacaoAdminAssistido("5581888880000", { dados }, {})
  for (const texto of ["Estado civil: Casada", "Profissão: Analista", "Limitações atuais: Limitação sintética", "Renda atual: Valor informado", "Resultado da perícia: Indeferido"]) {
    assert.match(usuario.descricao, new RegExp(texto))
  }
  assert.doesNotMatch(usuario.descricao, /52998224725/)
})

test("contrato final bloqueia individualmente cada ID e emite evento técnico seguro no sucesso", async () => {
  const base = criarDadosVaziosAdminAssistido()
  for (const [campo, valor] of Object.entries({ nomeCompleto: "Pessoa Sintética", telefone: "5581999990000", cidade: "Recife", uf: "PE", areaJuridica: "Outros", tipoCaso: "Outro", descricao: "Relato sintético." })) {
    base[campo] = criarCampoAdminAssistido(valor, "confirmado")
  }
  const ids = { numeroCaso: "CASE.SYN.002", contatoId: "contact-2", negocioId: "deal-2", pastaDriveId: "folder-2" }
  for (const ausente of Object.keys(ids)) {
    let externalCalls = 0
    const admin = { ativo: true, etapa: "revisao_caso", dados: base, historico: [] }
    const resposta = await confirmarCriarCasoAdminAssistido("5581888880000", `missing-${ausente}`, { adminAssistido: admin }, admin, {
      sessoesAdminWhatsApp: new Map(),
      finalizarCadastroAssistido: async (_from, u) => {
        externalCalls += 1
        for (const [key, value] of Object.entries(ids)) if (key !== ausente && key !== "numeroCaso") u[key] = value
        return ausente === "numeroCaso" ? null : ids.numeroCaso
      }
    })
    assert.equal(externalCalls, 1)
    assert.doesNotMatch(resposta.texto, /Caso criado com sucesso/)
  }

  const logs = []
  const admin = { ativo: true, etapa: "revisao_caso", dados: base, historico: [] }
  await confirmarCriarCasoAdminAssistido("5581888880000", "success", { adminAssistido: admin }, admin, {
    sessoesAdminWhatsApp: new Map(),
    finalizarCadastroAssistido: async (_from, u) => {
      u.contatoId = ids.contatoId; u.negocioId = ids.negocioId; u.pastaDriveId = ids.pastaDriveId
      return ids.numeroCaso
    },
    logAdminAssistido: event => logs.push(event)
  })
  const final = logs.find(event => event.evento === "criacao_caso_concluida")
  assert.ok(final.executionId)
  assert.equal(final.status, "success")
  assert.equal(final.etapa, "final_verify")
  assert.equal(final.contactId, ids.contatoId)
  assert.equal(final.dealId, ids.negocioId)
  assert.equal(final.numeroCaso, ids.numeroCaso)
  assert.equal(final.caseFolderId, ids.pastaDriveId)
  assert.ok(Number.isFinite(final.durationMs))
  assert.equal(JSON.stringify(final).includes("5581999990000"), false)
})
