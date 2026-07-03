const assert = require("node:assert/strict")

const {
  handleAudioConfirmation
} = require("../src/domain/stage-handlers/audio-confirmation-handler")

function criarContexto(u, texto) {
  const chamadas = {
    stages: [],
    timers: [],
    classificacoes: [],
    aplicacoes: [],
    audiosGerados: [],
    audiosEnviados: [],
    esperas: [],
    erros: [],
    confirmacoes: []
  }
  return {
    chamadas,
    ctx: {
      u,
      texto,
      from: "5511",
      stages: {
        AUDIO_CONFIRMAR_TRANSCRICAO: "audio_confirmar_transcricao",
        AUDIO_CONFIRMAR_AREA_CANAL: "audio_confirmar_area_canal",
        AUDIO_AGUARDANDO: "audio_aguardando"
      },
      setStage: (usuario, stage) => {
        chamadas.stages.push(stage)
        usuario.stage = stage
      },
      iniciarTimer: from => chamadas.timers.push(from),
      telaConfirmarAreaAudio: async (from, usuario) => {
        assert.equal(from, "5511")
        assert.equal(usuario, u)
        return { texto: "confirmar área", opcoes: [] }
      },
      responderComTimer: (from, payload) => {
        chamadas.timers.push(from)
        return payload
      },
      classificarAreaAudio: async transcricao => {
        chamadas.classificacoes.push(transcricao)
        return { area: "Trabalhista" }
      },
      aplicarClassificacaoJuridica: (usuario, classificacao) => {
        chamadas.aplicacoes.push({ usuario, classificacao })
      },
      gerarAudioAtendente: async (atendente, prompt) => {
        chamadas.audiosGerados.push({ atendente, prompt })
        return "audio.ogg"
      },
      enviarAudio: async (from, url) => {
        chamadas.audiosEnviados.push({ from, url })
      },
      urlAudioAtendente: arquivo => `/audios/${arquivo}`,
      esperar: async ms => chamadas.esperas.push(ms),
      logErro: (...args) => chamadas.erros.push(args),
      normalizarTextoCRM: valor => valor.trim().replace(/\s+/g, " "),
      telaConfirmarTranscricao: async (from, atendente, transcricao, area) => {
        chamadas.confirmacoes.push({ from, atendente, transcricao, area })
        return { texto: "confirmar transcrição", opcoes: [] }
      }
    }
  }
}

async function main() {
  {
    const u = {
      stage: "audio_confirmar_transcricao",
      _audioCanalTranscricao: "Fui demitida ontem"
    }
    const { ctx, chamadas } = criarContexto(u, "audio_transcricao_ok")
    assert.deepEqual(
      await handleAudioConfirmation(ctx),
      {
        handled: true,
        response: { texto: "confirmar área", opcoes: [] }
      }
    )
    assert.deepEqual(chamadas.classificacoes, ["Fui demitida ontem"])
    assert.equal(chamadas.aplicacoes[0].usuario, u)
    assert.deepEqual(chamadas.aplicacoes[0].classificacao, { area: "Trabalhista" })
    assert.equal(u.stage, "audio_confirmar_area_canal")
    assert.deepEqual(chamadas.timers, ["5511"])
  }

  {
    const u = {
      stage: "audio_confirmar_transcricao",
      atendente: "Ana"
    }
    const { ctx, chamadas } = criarContexto(u, "audio_transcricao_novo")
    assert.deepEqual(
      await handleAudioConfirmation(ctx),
      {
        handled: true,
        response: {
          texto: "🎙️ Pode enviar seu novo áudio agora.\n\n_Fale com calma. Estou aqui para ouvir você._",
          opcoes: null
        }
      }
    )
    assert.equal(u.stage, "audio_aguardando")
    assert.deepEqual(chamadas.timers, ["5511"])
    assert.deepEqual(chamadas.audiosGerados, [{
      atendente: "Ana",
      prompt: "Tudo bem! Pode enviar um novo áudio agora. Fale com calma explicando sua situação."
    }])
    assert.deepEqual(chamadas.audiosEnviados, [{
      from: "5511",
      url: "/audios/audio.ogg"
    }])
    assert.deepEqual(chamadas.esperas, [3000])
  }

  {
    const u = {
      stage: "audio_confirmar_transcricao",
      _audioCanalTranscricao: "texto anterior"
    }
    const { ctx, chamadas } = criarContexto(u, "  novo   relato trabalhista  ")
    assert.deepEqual(
      await handleAudioConfirmation(ctx),
      {
        handled: true,
        response: { texto: "confirmar área", opcoes: [] }
      }
    )
    assert.equal(u._audioCanalTranscricao, "novo relato trabalhista")
    assert.deepEqual(chamadas.classificacoes, ["novo relato trabalhista"])
    assert.equal(u.stage, "audio_confirmar_area_canal")
  }

  {
    const u = {
      stage: "audio_confirmar_transcricao",
      atendente: "Ana"
    }
    const { ctx, chamadas } = criarContexto(u, "audio_transcricao_texto")
    assert.deepEqual(
      await handleAudioConfirmation(ctx),
      {
        handled: true,
        response: {
          texto: "✍️ Digite abaixo sua situação com suas próprias palavras.\n\n_Escreva à vontade. Estou aqui para ajudar._",
          opcoes: null
        }
      }
    )
    assert.deepEqual(chamadas.audiosGerados, [{
      atendente: "Ana",
      prompt: "Tudo bem! Digite agora sua situação com suas próprias palavras. Pode escrever à vontade."
    }])
    assert.deepEqual(chamadas.audiosEnviados, [{
      from: "5511",
      url: "/audios/audio.ogg"
    }])
    assert.deepEqual(chamadas.esperas, [3000])
    assert.deepEqual(chamadas.timers, ["5511"])
  }

  {
    const u = {
      stage: "audio_confirmar_transcricao",
      atendente: "Ana",
      _audioCanalTranscricao: "Relato atual",
      area: "Trabalhista"
    }
    const { ctx, chamadas } = criarContexto(u, "")
    assert.deepEqual(
      await handleAudioConfirmation(ctx),
      {
        handled: true,
        response: { texto: "confirmar transcrição", opcoes: [] }
      }
    )
    assert.deepEqual(chamadas.confirmacoes, [{
      from: "5511",
      atendente: "Ana",
      transcricao: "Relato atual",
      area: "Trabalhista"
    }])
    assert.deepEqual(chamadas.timers, ["5511", "5511"])
  }

  {
    const u = { stage: "audio_confirmar_transcricao" }
    const { ctx, chamadas } = criarContexto(u, "audio_transcricao_ok")
    assert.deepEqual(
      await handleAudioConfirmation(ctx),
      {
        handled: true,
        response: {
          texto: "Não encontrei a transcrição anterior. Envie seu áudio novamente, por favor.",
          opcoes: [{ id: "audio_enviar", title: "🎤 Enviar áudio" }]
        }
      }
    )
    assert.deepEqual(chamadas.timers, ["5511", "5511"])
  }

  {
    const u = { stage: "cliente" }
    const { ctx, chamadas } = criarContexto(u, "audio_transcricao_ok")
    assert.deepEqual(
      await handleAudioConfirmation(ctx),
      { handled: false, response: null }
    )
    assert.deepEqual(chamadas.stages, [])
    assert.deepEqual(chamadas.timers, [])
    assert.deepEqual(chamadas.classificacoes, [])
  }

  console.log("audio-confirmation-handler.test.js: ok")
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
