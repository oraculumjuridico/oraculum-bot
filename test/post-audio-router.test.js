const assert = require("node:assert/strict")

const { criarPostAudioRouter } = require("../src/domain/post-audio-router")

function criarHarness({ ultimaPergunta = null } = {}) {
  const chamadas = {
    recomecos: [],
    encerramentos: [],
    timers: [],
    sugestoes: [],
    stages: [],
    sincronizacoes: [],
    telasAudio: []
  }
  const STAGES = {
    AUDIO_FLUXO_CONFIRMA: "audio_fluxo_confirma",
    SUGESTAO_FLUXO_OUTRO: "sugestao_fluxo_outro",
    EXPLICAR_TUDO_OFERTA: "explicar_tudo_oferta",
    GATILHO: "gatilho",
    COLETA_DESC_AUDIO: "coleta_desc_audio"
  }
  const processar = criarPostAudioRouter({
    STAGES,
    executarRecomecoFluxo: async (from, u) => {
      chamadas.recomecos.push({ from, u })
      return { texto: "recomeçar", opcoes: null }
    },
    executarEncerramentoFluxo: async (from, u) => {
      chamadas.encerramentos.push({ from, u })
      return { texto: "encerrar", opcoes: null }
    },
    retomarUltimaPergunta: () => ultimaPergunta,
    iniciarTimer: from => chamadas.timers.push(from),
    responderComTimer: (from, payload) => {
      chamadas.timers.push(from)
      return payload
    },
    telaAudioNoFluxo: (texto, resposta) => {
      chamadas.telasAudio.push({ texto, resposta })
      return { texto: `áudio:${texto}:${resposta}`, opcoes: [] }
    },
    aplicarSugestaoFluxoOutro: (u, categoria) => {
      chamadas.sugestoes.push({ u, categoria })
    },
    setStage: (u, stage) => {
      chamadas.stages.push(stage)
      u.stage = stage
    },
    sincronizarNegocio: async u => {
      chamadas.sincronizacoes.push(u)
    },
    telaDescreverCaso: () => ({ texto: "descrever caso", opcoes: null })
  })
  return { processar, chamadas }
}

async function main() {
  {
    const { processar } = criarHarness()
    assert.deepEqual(
      await processar({ from: "5511", u: { stage: "cliente" }, text: "menu" }),
      { handled: false, response: null }
    )
  }

  {
    const ultimaPergunta = { texto: "pergunta anterior", opcoes: [] }
    const { processar, chamadas } = criarHarness({ ultimaPergunta })
    const u = {
      stage: "audio_fluxo_confirma",
      _audioFluxoAcao: "continuar",
      _audioFluxoTexto: "relato",
      _audioFluxoResposta: "orientação"
    }
    assert.deepEqual(
      await processar({ from: "5511", u, text: "audio_fluxo_seguir" }),
      { handled: true, response: ultimaPergunta }
    )
    assert.equal(u._audioFluxoAcao, null)
    assert.equal(u._audioFluxoTexto, null)
    assert.equal(u._audioFluxoResposta, null)
    assert.deepEqual(chamadas.timers, ["5511"])
  }

  {
    const { processar, chamadas } = criarHarness()
    const u = {
      stage: "audio_fluxo_confirma",
      _audioFluxoTexto: "relato",
      _audioFluxoAcao: "continuar",
      _audioFluxoResposta: "orientação"
    }
    assert.deepEqual(
      await processar({ from: "5511", u, text: "audio_fluxo_recomecar" }),
      { handled: true, response: { texto: "recomeçar", opcoes: null } }
    )
    assert.equal(chamadas.recomecos.length, 1)
    assert.equal(u._audioFluxoTexto, null)
    assert.equal(u._audioFluxoAcao, null)
    assert.equal(u._audioFluxoResposta, null)
  }

  {
    const { processar, chamadas } = criarHarness()
    const u = {
      stage: "audio_fluxo_confirma",
      _audioFluxoTexto: "relato",
      _audioFluxoAcao: "continuar",
      _audioFluxoResposta: "orientação"
    }
    assert.deepEqual(
      await processar({ from: "5511", u, text: "audio_fluxo_encerrar" }),
      { handled: true, response: { texto: "encerrar", opcoes: null } }
    )
    assert.equal(chamadas.encerramentos.length, 1)
    assert.equal(u._audioFluxoTexto, null)
    assert.equal(u._audioFluxoAcao, null)
    assert.equal(u._audioFluxoResposta, null)
  }

  {
    const { processar, chamadas } = criarHarness()
    const u = { stage: "explicar_tudo_oferta" }
    assert.deepEqual(
      await processar({ from: "5511", u, text: "explicar_tudo" }),
      { handled: true, response: { texto: "descrever caso", opcoes: null } }
    )
    assert.equal(u._descOrigemStage, "explicar_tudo")
    assert.equal(u.stage, "coleta_desc_audio")
    assert.deepEqual(chamadas.timers, ["5511"])
  }

  {
    const { processar, chamadas } = criarHarness()
    const u = {
      stage: "sugestao_fluxo_outro",
      _sugestaoFluxo: { categoria: "trabalhista" }
    }
    assert.deepEqual(
      await processar({ from: "5511", u, text: "sug_fluxo" }),
      {
        handled: true,
        response: {
          texto: "✅ Certo! Vamos registrar sua solicitação.",
          opcoes: [{ id: "cont", title: "▶️ Continuar" }]
        }
      }
    )
    assert.equal(chamadas.sugestoes[0].categoria, "trabalhista")
    assert.equal(chamadas.sincronizacoes[0], u)
    assert.equal(u._sugestaoFluxo, null)
    assert.equal(u.stage, "gatilho")
    assert.deepEqual(chamadas.timers, ["5511"])
  }

  {
    const { processar, chamadas } = criarHarness()
    const u = {
      stage: "audio_fluxo_confirma",
      _audioFluxoTexto: "relato",
      _audioFluxoResposta: "orientação"
    }
    assert.deepEqual(
      await processar({ from: "5511", u, text: "resposta_invalida" }),
      {
        handled: true,
        response: { texto: "áudio:relato:orientação", opcoes: [] }
      }
    )
    assert.deepEqual(chamadas.telasAudio, [{ texto: "relato", resposta: "orientação" }])
    assert.deepEqual(chamadas.timers, ["5511"])
  }

  {
    const { processar } = criarHarness()
    assert.deepEqual(
      await processar({
        from: "5511",
        u: { stage: "sugestao_fluxo_outro" },
        text: "resposta_invalida"
      }),
      { handled: false, response: null }
    )
  }

  {
    const { processar, chamadas } = criarHarness()
    const u = { stage: "explicar_tudo_oferta" }
    assert.deepEqual(
      await processar({ from: "5511", u, text: "resposta_invalida" }),
      { handled: true, response: { texto: "descrever caso", opcoes: null } }
    )
    assert.equal(u.stage, "coleta_desc_audio")
    assert.deepEqual(chamadas.timers, ["5511"])
  }

  console.log("post-audio-router.test.js: ok")
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
