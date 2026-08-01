"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")

delete process.env.GROQ_KEY

const { criarAnaliseFallback, normalizarAnaliseIA } = require("../src/domain/admin-assisted-ai-intelligence")
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

test("primeiro nome exige nome completo e nome completo informado não é repetido", async () => {
  const deps = depsComSessoes()
  const from = "5581555550000"
  iniciarAtendimentoAssistidoAdmin(from, deps)
  const parcial = await processarAtendimentoAssistidoAdmin(from, "Caso trabalhista de Jesaías, demitido sem receber rescisão.", { type: "text" }, deps)
  assert.match(parcial.texto, /nome completo do cliente/i)
  assert.equal(deps.sessoesAdminWhatsApp.get(from).adminAssistido.perguntaPendente, "nomeCompleto")

  const completa = criarAnaliseFallback("Caso trabalhista de Jesaías Mendes da Silva, demitido sem receber rescisão.")
  const proxima = proximaPerguntaAdminAssistido({ questionario: criarQuestionarioAdminAssistido("Trabalhista"), dados: completa.dados })
  assert.notEqual(proxima?.campo, "nomeCompleto")
})

test("documentação genérica não é transformada em documentos específicos", () => {
  const fallback = criarAnaliseFallback("A cliente trouxe alguns documentos para o atendimento.")
  assert.equal(fallback.dados.documentosMencionados.valor, "Documentos existentes, ainda não identificados")
  assert.equal(fallback.dados.documentosMencionados.status, "precisa_conferir")
  assert.doesNotMatch(String(fallback.dados.documentosMencionados.valor), /CNIS|contracheque|recibo/i)

  const groq = normalizarAnaliseIA({
    confianca: 0.9,
    dados: { documentosMencionados: { valor: "CNIS, contracheques e recibos de autônomo", status: "confirmado" } }
  }, "A cliente trouxe alguns documentos para o atendimento.")
  assert.equal(groq.dados.documentosMencionados.valor, "Documentos existentes, ainda não identificados")
  assert.equal(groq.dados.documentosMencionados.status, "precisa_conferir")
})

test("somente documentos nominalmente mencionados aparecem como específicos", () => {
  const analise = criarAnaliseFallback("A cliente trouxe CNIS, contracheques e a carta de indeferimento do INSS.")
  assert.match(analise.dados.documentosMencionados.valor, /CNIS/)
  assert.match(analise.dados.documentosMencionados.valor, /Holerites/)
  assert.match(analise.dados.documentosMencionados.valor, /Carta de indeferimento/)
})

test("telefone, cidade, UF, CPF e nascimento não repetem interpretação completa", async () => {
  const deps = depsComSessoes()
  const from = "5581444440000"
  iniciarAtendimentoAssistidoAdmin(from, deps)
  const inicial = await processarAtendimentoAssistidoAdmin(from, "Caso de Maria de Souza. O INSS negou benefício por incapacidade.", { type: "text" }, deps)
  assert.match(inicial.texto, /Entendi o caso/)
  assert.match(inicial.texto, /Maria de Souza/)

  for (const resposta of ["(81) 99999-0000", "Recife", "PE", "52998224725", "01/01/1980"]) {
    const tela = await processarAtendimentoAssistidoAdmin(from, resposta, { type: "text" }, deps)
    assert.doesNotMatch(tela.texto, /Entendi o caso|Informações encontradas|Síntese:/)
    assert.ok((tela.texto.match(/\?/g) || []).length <= 1)
  }
})

test("revisão mantém nome incompleto e documentos não identificados como pendências", () => {
  const dados = dadosBase()
  dados.nomeCompleto = criarCampoAdminAssistido("Jesaías", "confirmado")
  dados.documentosMencionados = criarCampoAdminAssistido("Documentos existentes, ainda não identificados", "precisa_conferir")
  const revisao = gerarRevisaoCurtaAdminAssistido({ dados, faltantes: [] })
  assert.match(revisao, /Nome completo/)
  assert.match(revisao, /Documentos/)
  assert.doesNotMatch(revisao, /Nenhuma crítica/)
})
