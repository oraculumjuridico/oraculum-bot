"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")

delete process.env.GROQ_KEY

const { criarAnaliseFallback } = require("../src/domain/admin-assisted-ai-intelligence")
const {
  criarCampoAdminAssistido,
  criarDadosVaziosAdminAssistido
} = require("../src/domain/admin-assisted-ai-schema")
const {
  criarQuestionarioAdminAssistido,
  proximaPerguntaAdminAssistido
} = require("../src/domain/admin-assisted-questionnaire")
const {
  gerarRevisaoCurtaAdminAssistido,
  gerarResumoAdminAssistido,
  textoResumoAnaliseAdminAssistido,
  acaoRevisaoAdminAssistido,
  iniciarAtendimentoAssistidoAdmin,
  processarAtendimentoAssistidoAdmin
} = require("../src/domain/admin-assisted-ai-flow")

function depsComSessoes(transcricao = null) {
  const sessoesAdminWhatsApp = new Map()
  return {
    sessoesAdminWhatsApp,
    normalizarNumeroWhatsAppEnvio: valor => String(valor || "").replace(/\D/g, ""),
    transcreverAudioAdmin: transcricao === null ? undefined : async () => transcricao
  }
}

function dadosBase(area = "Trabalhista") {
  return {
    ...criarDadosVaziosAdminAssistido(),
    nomeCompleto: criarCampoAdminAssistido("Jesaías Mendes da Silva", "confirmado"),
    telefone: criarCampoAdminAssistido("5581999990000", "confirmado"),
    cidade: criarCampoAdminAssistido("Recife", "confirmado"),
    uf: criarCampoAdminAssistido("PE", "confirmado"),
    areaJuridica: criarCampoAdminAssistido(area, "inferido"),
    tipoCaso: criarCampoAdminAssistido("Verbas rescisórias", "inferido"),
    descricao: criarCampoAdminAssistido("Dispensa sem pagamento das verbas rescisórias.", "confirmado"),
    objetivo: criarCampoAdminAssistido("Receber as verbas devidas", "confirmado"),
    documentosMencionados: criarCampoAdminAssistido("CTPS, TRCT", "confirmado")
  }
}

test("relato natural preserva nome completo e não o pergunta novamente", () => {
  const analise = criarAnaliseFallback("Atendi hoje Jesaías Mendes da Silva, demitido sem receber a rescisão.")
  assert.equal(analise.dados.nomeCompleto.valor, "Jesaías Mendes da Silva")
  assert.equal(analise.dados.nomeCompleto.status, "confirmado")
  const proxima = proximaPerguntaAdminAssistido({
    questionario: criarQuestionarioAdminAssistido("Trabalhista"),
    dados: analise.dados
  })
  assert.notEqual(proxima?.campo, "nomeCompleto")
})

test("duas pessoas não promovem administrador a cliente", () => {
  const analise = criarAnaliseFallback("Eu sou Ana Paula, administradora. O cliente é Carlos Eduardo Pereira, que foi demitido.")
  assert.equal(analise.dados.nomeCompleto.valor, "Carlos Eduardo Pereira")
  assert.equal(analise.clientePrincipal, "Carlos Eduardo Pereira")
  assert.equal(analise.dados.existeTerceiro.valor, true)
})

test("planejador usa perguntas da área e evita questionário previdenciário no trabalhista", () => {
  const dados = dadosBase("Trabalhista")
  const pergunta = proximaPerguntaAdminAssistido({
    questionario: criarQuestionarioAdminAssistido("Trabalhista"),
    dados,
    perguntados: ["email"]
  })
  assert.ok(pergunta)
  assert.notEqual(pergunta.campo, "beneficio")
  assert.notEqual(pergunta.campo, "resultadoPericia")
})

test("área ambígua é marcada para confirmação sem conclusão definitiva", () => {
  const analise = criarAnaliseFallback("Foi demitido e não recebeu a rescisão; também precisa pedir auxílio por incapacidade no INSS.")
  assert.equal(analise.dados.areaJuridica.status, "precisa_conferir")
  assert.ok(analise.areasProvaveis.includes("Trabalhista"))
  assert.ok(analise.areasProvaveis.includes("INSS"))
})

test("coleta mostra interpretação curta e somente uma pergunta principal", () => {
  const texto = textoResumoAnaliseAdminAssistido({
    dados: dadosBase(),
    faltantes: ["cpf", "empresa", "dataDemissao"],
    proximoCampo: "cpf"
  })
  assert.match(texto, /\*Entendi o caso\*/)
  assert.match(texto, /\*Qual é o CPF/)
  assert.doesNotMatch(texto, /Não informado|Etapa \d+ de \d+|snapshot|propriedade/i)
  assert.equal((texto.match(/\?/g) || []).length, 1)
})

test("revisão curta omite ficha técnica e ficha completa permanece organizada", () => {
  const estado = { dados: dadosBase(), faltantes: ["cpf"], pendentesPosterior: [] }
  const curta = gerarRevisaoCurtaAdminAssistido(estado)
  assert.match(curta, /\*Revisão do caso\*/)
  assert.match(curta, /Cliente:/)
  assert.match(curta, /Área:/)
  assert.match(curta, /Documentos:/)
  assert.doesNotMatch(curta, /Confirmado|Inferido|Não informado|Copiloto Jurídico/)

  const completa = gerarResumoAdminAssistido(estado)
  for (const secao of ["Identificação", "Contato", "Caso", "Documentos", "Pendências", "Observações"]) {
    assert.match(completa, new RegExp(secao))
  }
  assert.equal(acaoRevisaoAdminAssistido("admin_assistido_ficha_completa"), "ficha_completa")
})

test("resposta curta altera o campo perguntado e preserva todo o estado anterior", async () => {
  const deps = depsComSessoes()
  const from = "5581888880000"
  iniciarAtendimentoAssistidoAdmin(from, deps)
  await processarAtendimentoAssistidoAdmin(from, "Caso trabalhista para Maria de Souza, demitida sem receber rescisão.", { type: "text" }, deps)
  const antes = deps.sessoesAdminWhatsApp.get(from).adminAssistido
  assert.equal(antes.perguntaPendente, "telefone")
  const nome = antes.dados.nomeCompleto.valor
  const descricao = antes.dados.descricao.valor
  await processarAtendimentoAssistidoAdmin(from, "(81) 99999-0000", { type: "text" }, deps)
  const depois = deps.sessoesAdminWhatsApp.get(from).adminAssistido
  assert.equal(depois.dados.telefone.valor, "(81) 99999-0000")
  assert.equal(depois.dados.nomeCompleto.valor, nome)
  assert.equal(depois.dados.descricao.valor, descricao)
  assert.equal(depois.dados.areaJuridica.valor, "Trabalhista")
})

test("áudio confirmado converge para o mesmo estado canônico do texto", async () => {
  const relato = "Caso trabalhista para Maria de Souza, demitida sem receber rescisão."
  const textoDeps = depsComSessoes()
  const audioDeps = depsComSessoes(relato)
  iniciarAtendimentoAssistidoAdmin("5581777770000", textoDeps)
  iniciarAtendimentoAssistidoAdmin("5581666660000", audioDeps)
  await processarAtendimentoAssistidoAdmin("5581777770000", relato, { type: "text" }, textoDeps)
  await processarAtendimentoAssistidoAdmin("5581666660000", "", { type: "audio", audio: { id: "midia-ficticia" } }, audioDeps)
  await processarAtendimentoAssistidoAdmin("5581666660000", "admin_assistido_audio_confirmar", { type: "text" }, audioDeps)
  const estadoTexto = textoDeps.sessoesAdminWhatsApp.get("5581777770000").adminAssistido
  const estadoAudio = audioDeps.sessoesAdminWhatsApp.get("5581666660000").adminAssistido
  for (const campo of ["nomeCompleto", "areaJuridica", "tipoCaso", "descricao"]) {
    assert.deepEqual(estadoAudio.dados[campo], estadoTexto.dados[campo])
  }
  assert.equal(estadoAudio.perguntaPendente, estadoTexto.perguntaPendente)
})
