const assert = require("node:assert/strict")

const {
  handleConfirmEntryCorrectedName
} = require("../src/domain/stage-handlers/confirm-entry-corrected-name-handler")

function criarContexto(u, texto, opcoes = {}) {
  const chamadas = {
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
      extrairNomeDaCorrecaoExplicita: opcoes.extrairNome || (() => null),
      formatarNome: valor => valor.split(" ").map(palavra => palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase()).join(" "),
      limparTextoSomenteLetras: valor => String(valor || "").replace(/[^A-Za-zÀ-ÿ\s]/g, "").replace(/\s+/g, " ").trim(),
      ehNomeAparente: opcoes.ehNomeAparente || (nome => nome.includes(" ")),
      gerarAudioAtendente: async (atendente, prompt) => {
        chamadas.audiosGerados.push({ atendente, prompt })
        return "nome.ogg"
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
      _entradaPendenteTipo: "nome",
      modoTexto: false,
      atendente: "Ana"
    }
    const { ctx, chamadas } = criarContexto(u, "maria silva")
    assert.deepEqual(
      await handleConfirmEntryCorrectedName(ctx),
      {
        handled: true,
        response: {
          texto: "●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nVocê informou: *Maria Silva*\nEstá correto? Se não estiver, é só me dizer o nome correto agora. Pode falar ou digitar. 🎙️",
          opcoes: [{ id: "entrada_ok", title: "✅ Confirmar" }]
        }
      }
    )
    assert.equal(u._entradaPendenteValor, "Maria Silva")
    assert.equal(u.stage, "confirmar_entrada")
    assert.deepEqual(chamadas.audiosGerados, [{
      atendente: "Ana",
      prompt: "Entendi! O nome é Maria Silva. Está correto? Se não estiver, me diga o nome correto agora."
    }])
    assert.deepEqual(chamadas.audiosEnviados, [{
      from: "5511",
      url: "/audios/nome.ogg"
    }])
    assert.deepEqual(chamadas.esperas, [4000])
  }

  {
    const u = {
      stage: "confirmar_entrada",
      _entradaPendenteTipo: "nome",
      modoTexto: true
    }
    const { ctx, chamadas } = criarContexto(u, "não, meu nome é Joana Souza", {
      extrairNome: () => "Joana Souza"
    })
    const resultado = await handleConfirmEntryCorrectedName(ctx)
    assert.equal(resultado.handled, true)
    assert.equal(u._entradaPendenteValor, "Joana Souza")
    assert.deepEqual(chamadas.audiosGerados, [])
    assert.deepEqual(chamadas.audiosEnviados, [])
    assert.deepEqual(chamadas.esperas, [])
  }

  {
    const u = {
      stage: "confirmar_entrada",
      _entradaPendenteTipo: "nome",
      _entradaPendenteValor: "Nome anterior"
    }
    const { ctx, chamadas } = criarContexto(u, "maria", {
      ehNomeAparente: () => "incompleto"
    })
    assert.deepEqual(
      await handleConfirmEntryCorrectedName(ctx),
      { handled: false, response: null }
    )
    assert.equal(u._entradaPendenteValor, "Nome anterior")
    assert.deepEqual(chamadas.audiosGerados, [])
  }

  for (const [stage, tipo, texto] of [
    ["cliente", "nome", "Maria Silva"],
    ["confirmar_entrada", "telefone", "Maria Silva"],
    ["confirmar_entrada", "nome", "entrada_ok"],
    ["confirmar_entrada", "nome", "entrada_corrigir"],
    ["confirmar_entrada", "nome", ""]
  ]) {
    const u = { stage, _entradaPendenteTipo: tipo }
    const { ctx } = criarContexto(u, texto)
    assert.deepEqual(
      await handleConfirmEntryCorrectedName(ctx),
      { handled: false, response: null }
    )
  }

  console.log("confirm-entry-corrected-name-handler.test.js: ok")
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
