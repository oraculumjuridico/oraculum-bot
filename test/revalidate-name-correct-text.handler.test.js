const assert = require("node:assert/strict")
const {
  handle
} = require("../src/domain/client/handlers/revalidate-name-correct-text.handler")

function criarContexto({
  u,
  decision = { nextAction: "revalidate_name_correct_text" },
  nomeExtraido = null,
  nomeAparente = true,
  puraNegacao = false
}) {
  const chamadas = {
    sincronizacoes: [],
    audiosGerados: [],
    audiosEnviados: [],
    esperas: [],
    erros: [],
    timers: [],
    respostasComTimer: [],
    progressões: []
  }
  return {
    chamadas,
    ctx: {
      decision,
      u,
      texto: "meu nome é Maria Silva",
      from: "5511",
      extrairNomeDaCorrecaoExplicita: () => nomeExtraido,
      formatarNome: texto => texto.trim(),
      limparTextoSomenteLetras: texto => texto.replace(/[^A-Za-zÀ-ÿ ]/g, "").trim(),
      ehNomeAparente: () => nomeAparente,
      parecePuraNegacaoSemNome: () => puraNegacao,
      sincronizarContatoNegocioHubSpot: async usuario => {
        chamadas.sincronizacoes.push(usuario)
      },
      gerarAudioAtendente: async (atendente, texto) => {
        chamadas.audiosGerados.push({ atendente, texto })
        return "audio.ogg"
      },
      enviarAudio: async (from, url) => chamadas.audiosEnviados.push({ from, url }),
      urlAudioAtendente: arquivo => `https://audio/${arquivo}`,
      esperar: async ms => chamadas.esperas.push(ms),
      logErro: (...args) => chamadas.erros.push(args),
      iniciarTimer: from => chamadas.timers.push(from),
      responderComTimer: (from, response) => {
        chamadas.respostasComTimer.push({ from, response })
        return response
      },
      proximaConfirmacaoProgressiva: async (from, usuario) => {
        chamadas.progressões.push({ from, usuario })
        return { texto: "próxima confirmação", opcoes: [] }
      }
    }
  }
}

async function main() {
  for (const caso of [
    {
      decision: { nextAction: "revalidate_name_confirm" },
      texto: "Maria Silva"
    },
    {
      decision: { nextAction: "revalidate_name_correct_text" },
      texto: ""
    },
    {
      decision: {},
      texto: "Maria Silva"
    }
  ]) {
    const u = {
      stage: "revalida_nome",
      _revalidaConfirmados: ["cidade"]
    }
    const estadoAntes = structuredClone(u)
    const { ctx, chamadas } = criarContexto({ u, decision: caso.decision })
    ctx.texto = caso.texto
    assert.deepEqual(
      await handle(ctx),
      { success: false, response: null }
    )
    assert.deepEqual(u, estadoAntes)
    assert.deepEqual(chamadas.sincronizacoes, [])
    assert.deepEqual(chamadas.timers, [])
    assert.deepEqual(chamadas.progressões, [])
  }

  {
    const u = {
      stage: "revalida_nome",
      atendente: "Ana",
      modoTexto: false
    }
    const { ctx, chamadas } = criarContexto({
      u,
      nomeExtraido: "Maria Silva"
    })
    assert.deepEqual(
      await handle(ctx),
      {
        success: true,
        response: { texto: "próxima confirmação", opcoes: [] }
      }
    )
    assert.equal(u.nome, "Maria Silva")
    assert.equal(u.nomeConfirmado, true)
    assert.deepEqual(u._revalidaConfirmados, ["nome"])
    assert.deepEqual(chamadas.sincronizacoes, [u])
    assert.deepEqual(chamadas.audiosGerados, [{
      atendente: "Ana",
      texto: "Entendi! Nome atualizado para Maria Silva."
    }])
    assert.deepEqual(chamadas.audiosEnviados, [{
      from: "5511",
      url: "https://audio/audio.ogg"
    }])
    assert.deepEqual(chamadas.esperas, [2000])
    assert.equal(chamadas.progressões.length, 1)
  }

  {
    const confirmados = ["cidade"]
    const u = {
      stage: "revalida_nome",
      modoTexto: true,
      _revalidaConfirmados: confirmados
    }
    const { ctx, chamadas } = criarContexto({
      u,
      nomeExtraido: "João Souza"
    })
    ctx.proximaConfirmacaoProgressiva = async () => undefined
    assert.deepEqual(
      await handle(ctx),
      { success: true, response: undefined }
    )
    assert.equal(u._revalidaConfirmados, confirmados)
    assert.deepEqual(confirmados, ["cidade", "nome"])
    assert.deepEqual(chamadas.audiosGerados, [])
  }

  {
    const u = {
      stage: "revalida_nome",
      modoTexto: true,
      marcador: "preservado"
    }
    const { ctx, chamadas } = criarContexto({
      u,
      nomeAparente: false
    })
    ctx.texto = "texto inválido"
    const estadoAntes = structuredClone(u)
    assert.deepEqual(
      await handle(ctx),
      {
        success: true,
        response: {
          texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nNão consegui identificar o nome. Por favor, informe apenas o nome completo. Pode falar ou digitar. 🎙️`,
          opcoes: [{ id: "revalida_nome_ok", title: "✅ Confirmar atual" }]
        }
      }
    )
    assert.deepEqual(u, estadoAntes)
    assert.deepEqual(chamadas.timers, ["5511"])
    assert.equal(chamadas.respostasComTimer.length, 1)
    assert.deepEqual(chamadas.sincronizacoes, [])
  }

  {
    const u = {
      stage: "revalida_nome",
      _revalidaConfirmados: ["cidade"]
    }
    const estadoAntes = structuredClone(u)
    const { ctx, chamadas } = criarContexto({
      u,
      nomeAparente: false,
      puraNegacao: true
    })
    ctx.texto = "não"
    assert.deepEqual(
      await handle(ctx),
      { success: false, response: null }
    )
    assert.deepEqual(u, estadoAntes)
    assert.deepEqual(chamadas.timers, [])
    assert.deepEqual(chamadas.sincronizacoes, [])
  }

  {
    const erro = new Error("falha após mutação")
    const u = {
      stage: "revalida_nome",
      modoTexto: true
    }
    const { ctx } = criarContexto({
      u,
      nomeExtraido: "Maria Silva"
    })
    ctx.sincronizarContatoNegocioHubSpot = async () => {
      throw erro
    }
    await assert.rejects(
      handle(ctx),
      candidate => candidate === erro
    )
    assert.equal(u.nome, "Maria Silva")
    assert.equal(u.nomeConfirmado, true)
  }

  {
    const u = {
      stage: "revalida_nome",
      atendente: "Ana",
      modoTexto: false
    }
    const { ctx, chamadas } = criarContexto({
      u,
      nomeExtraido: "Maria Silva"
    })
    ctx.gerarAudioAtendente = async () => {
      throw new Error("tts indisponível")
    }
    const result = await handle(ctx)
    assert.equal(result.success, true)
    assert.equal(chamadas.erros.length, 1)
    assert.deepEqual(u._revalidaConfirmados, ["nome"])
    assert.equal(chamadas.progressões.length, 1)
  }
}

main()
  .then(() => console.log("revalidate-name-correct-text.handler.test.js: ok"))
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
