const assert = require("node:assert/strict")

const {
  handleConfirmEntryCorrection
} = require("../src/domain/stage-handlers/confirm-entry-correction-handler")

function criarContexto(u, texto) {
  const chamadas = {
    timers: [],
    audiosGerados: [],
    audiosEnviados: [],
    esperas: [],
    erros: []
  }
  return {
    chamadas,
    ctx: {
      u,
      texto,
      from: "5511",
      stages: {
        CONFIRMAR_ENTRADA: "confirmar_entrada"
      },
      iniciarTimer: from => chamadas.timers.push(from),
      gerarAudioAtendente: async (atendente, prompt) => {
        chamadas.audiosGerados.push({ atendente, prompt })
        return "correcao.ogg"
      },
      enviarAudio: async (from, url) => {
        chamadas.audiosEnviados.push({ from, url })
      },
      urlAudioAtendente: arquivo => `/audios/${arquivo}`,
      esperar: async ms => chamadas.esperas.push(ms),
      logErro: (...args) => chamadas.erros.push(args)
    }
  }
}

async function main() {
  {
    const u = {
      stage: "confirmar_entrada",
      modoTexto: false,
      atendente: "Ana"
    }
    const { ctx, chamadas } = criarContexto(u, "entrada_corrigir")
    assert.deepEqual(
      await handleConfirmEntryCorrection(ctx),
      {
        handled: true,
        response: {
          texto: "Sem problema! Me diga a informação correta agora. Pode falar ou digitar. 🎙️",
          opcoes: null
        }
      }
    )
    assert.deepEqual(chamadas.timers, ["5511"])
    assert.deepEqual(chamadas.audiosGerados, [{
      atendente: "Ana",
      prompt: "Sem problema. Me diga a informação correta agora, pode falar ou digitar."
    }])
    assert.deepEqual(chamadas.audiosEnviados, [{
      from: "5511",
      url: "/audios/correcao.ogg"
    }])
    assert.deepEqual(chamadas.esperas, [3000])
    assert.equal(u.stage, "confirmar_entrada")
  }

  {
    const u = {
      stage: "confirmar_entrada",
      modoTexto: true,
      atendente: "Ana"
    }
    const { ctx, chamadas } = criarContexto(u, "entrada_corrigir")
    const resultado = await handleConfirmEntryCorrection(ctx)
    assert.equal(resultado.handled, true)
    assert.deepEqual(chamadas.timers, ["5511"])
    assert.deepEqual(chamadas.audiosGerados, [])
    assert.deepEqual(chamadas.audiosEnviados, [])
    assert.deepEqual(chamadas.esperas, [])
    assert.equal(u.stage, "confirmar_entrada")
  }

  {
    const u = { stage: "confirmar_entrada" }
    const { ctx, chamadas } = criarContexto(u, "entrada_ok")
    assert.deepEqual(
      await handleConfirmEntryCorrection(ctx),
      { handled: false, response: null }
    )
    assert.deepEqual(chamadas.timers, [])
    assert.equal(u.stage, "confirmar_entrada")
  }

  {
    const u = { stage: "cliente" }
    const { ctx, chamadas } = criarContexto(u, "entrada_corrigir")
    assert.deepEqual(
      await handleConfirmEntryCorrection(ctx),
      { handled: false, response: null }
    )
    assert.deepEqual(chamadas.timers, [])
    assert.equal(u.stage, "cliente")
  }

  console.log("confirm-entry-correction-handler.test.js: ok")
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
