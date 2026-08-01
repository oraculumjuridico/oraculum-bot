"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const {
  CPF_VERIFICATION,
  criarCampoCpfAdminAssistido,
  criarCampoAdminAssistido,
  criarDadosVaziosAdminAssistido,
  campoAdminAssistidoPreenchido,
  camposFaltantesAdminAssistido
} = require("../src/domain/admin-assisted-ai-schema")
const {
  criarQuestionarioAdminAssistido,
  proximaPerguntaAdminAssistido
} = require("../src/domain/admin-assisted-questionnaire")
const {
  acaoRevisaoAdminAssistido,
  gerarResumoAdminAssistido,
  montarUsuarioFinalizacaoAdminAssistido,
  confirmarCriarCasoAdminAssistido
} = require("../src/domain/admin-assisted-ai-flow")

function dadosValidos() {
  const dados = criarDadosVaziosAdminAssistido()
  for (const [campo, valor] of Object.entries({
    nomeCompleto: "Pessoa Fictícia",
    telefone: "5581999990000",
    cidade: "Recife",
    uf: "PE",
    areaJuridica: "Trabalhista",
    tipoCaso: "Verbas rescisórias",
    descricao: "Relato sintético sem dados reais.",
    empresa: "Empresa Fictícia",
    motivo: "Verbas não pagas"
  })) dados[campo] = criarCampoAdminAssistido(valor, "confirmado")
  dados.cpf = criarCampoCpfAdminAssistido("529.982.247-25", "confirmado")
  return dados
}

test("CPF informado possui estado verificável e formato canônico", () => {
  assert.equal(criarDadosVaziosAdminAssistido().cpf.verificacao, CPF_VERIFICATION.NAO_INFORMADO)
  const valido = criarCampoCpfAdminAssistido("529.982.247-25", "confirmado")
  assert.equal(valido.valor, "52998224725")
  assert.equal(valido.verificacao, CPF_VERIFICATION.FORMATO_VALIDO_NAO_CONFERIDO)
  assert.equal(campoAdminAssistidoPreenchido(valido, "cpf"), true)

  const invalido = criarCampoCpfAdminAssistido("123.456.789-00", "confirmado")
  assert.equal(invalido.status, "invalido")
  assert.equal(invalido.verificacao, CPF_VERIFICATION.FORMATO_INVALIDO)
  assert.equal(campoAdminAssistidoPreenchido(invalido, "cpf"), false)
})

test("CPF inválido aparece como inválido e bloqueia confirmação sem efeitos", async () => {
  const dados = dadosValidos()
  dados.cpf = criarCampoCpfAdminAssistido("123.456.789-00", "confirmado")
  const adminAssistido = { ativo: true, etapa: "revisao_caso", dados, historico: [] }
  assert.match(gerarResumoAdminAssistido(adminAssistido), /❌ Inválido/)

  let efeitos = 0
  const resposta = await confirmarCriarCasoAdminAssistido("5581888880000", "admin", { adminAssistido }, adminAssistido, {
    finalizarCadastroAssistido: async () => { efeitos += 1 },
    sessoesAdminWhatsApp: new Map(),
    normalizarNumeroWhatsAppEnvio: value => String(value).replace(/\D/g, "")
  })
  assert.equal(efeitos, 0)
  assert.match(resposta.texto, /CPF inválido/)
})

test("confirmação textual e payload usam a mesma ação canônica", () => {
  for (const entrada of ["Confirmar", " confirmar ", "CONFIRMAR", "admin_assistido_confirmar", "1"]) {
    assert.equal(acaoRevisaoAdminAssistido(entrada), "confirmar")
  }
})

test("idade permanece separada de data de nascimento", () => {
  const dados = dadosValidos()
  dados.idade = criarCampoAdminAssistido("55", "confirmado")
  dados.dataNascimento = criarCampoAdminAssistido(null, "ausente")
  const usuario = montarUsuarioFinalizacaoAdminAssistido("5581888880000", { dados }, {
    normalizarNumeroWhatsAppEnvio: value => String(value).replace(/\D/g, "")
  })
  assert.equal(usuario.idade, 55)
  assert.equal(usuario.dataNascimento, "")
  assert.notEqual(usuario.dataNascimento, "1970-01-01")
  assert.match(usuario.descricao, /Idade informada: 55/)
})

test("questionário declarativo não repete respondidos e informa progresso", () => {
  const dados = dadosValidos()
  dados.objetivo = criarCampoAdminAssistido(null, "ausente")
  const questionario = criarQuestionarioAdminAssistido("Trabalhista")
  const proxima = proximaPerguntaAdminAssistido({ questionario, dados, perguntados: ["email"] })
  assert.ok(proxima)
  assert.notEqual(proxima.campo, "nomeCompleto")
  assert.match(proxima.texto, /Próxima informação/)
})

test("CPF é opcional somente em atendimento Outros e inválido nunca vira ausência", () => {
  const dados = dadosValidos()
  dados.areaJuridica = criarCampoAdminAssistido("Outros", "confirmado")
  dados.cpf = criarCampoCpfAdminAssistido(null, "ausente")
  assert.equal(camposFaltantesAdminAssistido(dados, "Outros").includes("cpf"), false)
  dados.cpf = criarCampoCpfAdminAssistido("11111111111", "confirmado")
  assert.equal(dados.cpf.status, "invalido")
})

test("documento aprovado só é promovido depois do contrato do caso", async () => {
  const dados = dadosValidos()
  const ordem = []
  const adminAssistido = {
    ativo: true,
    etapa: "revisao_caso",
    dados,
    historico: [],
    documentos: [{ sha256: "a".repeat(64), status: "approved" }]
  }
  const resposta = await confirmarCriarCasoAdminAssistido("5581888880000", "admin", { adminAssistido }, adminAssistido, {
    sessoesAdminWhatsApp: new Map(),
    normalizarNumeroWhatsAppEnvio: value => String(value).replace(/\D/g, ""),
    finalizarCadastroAssistido: async (_telefone, usuario) => {
      ordem.push("caso")
      usuario.contatoId = "contact-synthetic"
      usuario.negocioId = "deal-synthetic"
      usuario.pastaDriveId = "folder-synthetic"
      return "CASE.SYNTHETIC.001"
    },
    promoverMidiaAdminAssistida: async () => {
      ordem.push("documento")
      return { fileId: "file-synthetic", sha256: "a".repeat(64), category: "identificacao" }
    }
  })
  assert.deepEqual(ordem, ["caso", "documento"])
  assert.match(resposta.texto, /Caso criado com sucesso/)
})
