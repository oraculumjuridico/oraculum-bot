const assert = require("node:assert/strict")
const { handleAudioIntake } = require("../src/domain/audio/audio-intake-pipeline-router")

const STAGES = {
  CLIENTE: "cliente",
  AGUARDANDO_URGENTE: "aguardando_urgente",
  COLETA_DESC_AUDIO: "coleta_desc_audio",
  URGENTE_AUDIO_ERRO_TRANSCRICAO: "urgente_audio_erro_transcricao",
  URGENTE_AUDIO_CONFIRMA: "urgente_audio_confirma",
  DESC_ERRO_TRANSCRICAO: "desc_erro_transcricao"
}

function criarContexto({
  stage = STAGES.CLIENTE,
  ehAudio = true,
  transcricao = "mensagem ambígua",
  intencao = null,
  emFluxoDocumento = false,
  comandoDocumento = null
} = {}) {
  const chamadas = { intencoes: [], notas: [], timers: 0, transcricoes: 0 }
  const u = {
    stage,
    nome: "Maria Silva",
    numeroCaso: "OR-1",
    contatoId: "contato-1",
    _numero: "5511999999999",
    pastaDriveId: null,
    _docsClienteGuiado: emFluxoDocumento
  }
  const ctx = {
    from: "5511999999999",
    nomeWA: "Maria",
    u,
    ehAudio,
    midia: { buffer: Buffer.from("audio"), mimeType: "audio/ogg" },
    STAGES,
    formatarNome: texto => texto,
    uploadPastaAudio: async () => null,
    transcrever: async () => {
      chamadas.transcricoes += 1
      return transcricao
    },
    detectarComandoDocumento: () => comandoDocumento,
    textoIndicaDocumentoAusente: () => false,
    detectarIntencaoCliente: () => intencao,
    executarIntencaoDetectadaCliente: async (_from, _u, valor, texto) => {
      chamadas.intencoes.push({ valor, texto })
      return { texto: `encaminhado:${valor}` }
    },
    responderComTimer: (_from, resposta) => resposta,
    getDocumentoAtualGuia: () => ({ doc: { label: "RG" }, folha: "frente" }),
    hsCriarNota: async (...args) => chamadas.notas.push(args),
    iniciarTimer: () => { chamadas.timers += 1 },
    responderTelaDocumento: (_from, _u, tela) => tela,
    criarTela: tela => tela,
    fraseEnvioDocumentoAudio: (doc, folha) => `Envie ${folha} de ${doc.label}`,
    pareceNovaSituacaoCliente: () => false,
    normalizarTextoCRM: texto => texto,
    confirmarAberturaNovoCasoCliente: async () => ({ texto: "confirmar novo caso" }),
    telaAudioClienteCasoAtualOuNovo: () => ({ texto: "caso atual ou novo", opcoes: [] }),
    enviarAudioModoVoz: async () => {},
    textoAudioOpcoes: () => "",
    setStage: (usuario, novoStage) => { usuario.stage = novoStage },
    telaConfirmarUrgenteComAudio: async () => ({ texto: "confirmar urgente" }),
    iniciarConfirmacaoDescricao: async () => ({ texto: "confirmar descrição" }),
    salvarEtapa: () => {}
  }
  return { ctx, u, chamadas }
}

async function testarIntencaoClara(intencao) {
  const transcricao = `pedido de ${intencao}`
  const { ctx, chamadas } = criarContexto({ transcricao, intencao })
  const resultado = await handleAudioIntake(ctx)
  assert.deepEqual(resultado, {
    handled: true,
    response: { texto: `encaminhado:${intencao}` }
  })
  assert.deepEqual(chamadas.intencoes, [{ valor: intencao, texto: transcricao }])
}

async function executar() {
  for (const intencao of ["status", "documentos", "advogado"]) {
    await testarIntencaoClara(intencao)
  }

  const ambiguo = criarContexto({ transcricao: "não sei o que preciso" })
  const resultadoAmbiguo = await handleAudioIntake(ambiguo.ctx)
  assert.equal(resultadoAmbiguo.handled, true)
  assert.match(resultadoAmbiguo.response.texto, /Áudio salvo/)
  assert.equal(ambiguo.chamadas.intencoes.length, 0)

  const vazio = criarContexto({ transcricao: "" })
  const resultadoVazio = await handleAudioIntake(vazio.ctx)
  assert.equal(resultadoVazio.handled, true)
  assert.equal(resultadoVazio.response.texto, "✅ Áudio salvo na pasta do caso.\nNossa equipe vai ouvir em breve.")

  const naoAudio = criarContexto({ ehAudio: false, stage: "confirmar_entrada" })
  const resultadoNaoAudio = await handleAudioIntake(naoAudio.ctx)
  assert.deepEqual(resultadoNaoAudio, { handled: false, response: null })
  assert.equal(naoAudio.u.stage, "confirmar_entrada")
  assert.equal(naoAudio.chamadas.transcricoes, 0)

  const documento = criarContexto({
    transcricao: "quero saber o status",
    intencao: "status",
    emFluxoDocumento: true
  })
  const resultadoDocumento = await handleAudioIntake(documento.ctx)
  assert.equal(resultadoDocumento.response.texto, "encaminhado:status")
  assert.equal(documento.chamadas.notas.length, 0)

  const observacao = criarContexto({
    transcricao: "esta é uma observação",
    emFluxoDocumento: true,
    comandoDocumento: "docs_depois"
  })
  const resultadoObservacao = await handleAudioIntake(observacao.ctx)
  assert.equal(resultadoObservacao.response.id, "documento_observacao_audio")
  assert.equal(observacao.chamadas.notas[0][1], "OBSERVACAO EM AUDIO SOBRE DOCUMENTO")
  assert.equal(observacao.chamadas.timers, 1)
}

executar()
  .then(() => console.log("audio-intake-pipeline-router.test.js: ok"))
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
