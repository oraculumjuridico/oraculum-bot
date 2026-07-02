const assert = require("node:assert/strict")

const {
  handleConfirmEntryPhone
} = require("../src/domain/stage-handlers/confirm-entry-phone-handler")

function criarContexto(u, texto, normalizar = valor => valor) {
  const chamadas = {
    normalizacoes: [],
    formatacoes: [],
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
      normalizarTelefone: valor => {
        chamadas.normalizacoes.push(valor)
        return normalizar(valor)
      },
      formatarTelefoneExibicao: valor => {
        chamadas.formatacoes.push(valor)
        return "(11) 9 8765-4321"
      },
      gerarAudioAtendente: async (atendente, prompt) => {
        chamadas.audiosGerados.push({ atendente, prompt })
        return "telefone.ogg"
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
      _entradaPendenteTipo: "telefone",
      modoTexto: false,
      atendente: "Ana"
    }
    const { ctx, chamadas } = criarContexto(u, "11987654321", () => "5511987654321")
    assert.deepEqual(
      await handleConfirmEntryPhone(ctx),
      {
        handled: true,
        response: {
          texto: "●●●●○○ 📱 Etapa 4 de 6 · *WhatsApp*\n\nVocê informou: *(11) 9 8765-4321*\nEstá correto? Se não estiver, é só me dizer o número correto agora. Pode falar ou digitar. 🎙️",
          opcoes: [{ id: "entrada_ok", title: "✅ Confirmar" }]
        }
      }
    )
    assert.equal(u._entradaPendenteValor, "5511987654321")
    assert.equal(u.stage, "confirmar_entrada")
    assert.deepEqual(chamadas.normalizacoes, ["11987654321"])
    assert.deepEqual(chamadas.formatacoes, ["5511987654321"])
    assert.deepEqual(chamadas.audiosGerados, [{
      atendente: "Ana",
      prompt: "Entendi! O número é (11) 9 8765-4321. Está correto? Se não estiver, me diga o número correto agora."
    }])
    assert.deepEqual(chamadas.audiosEnviados, [{
      from: "5511",
      url: "/audios/telefone.ogg"
    }])
    assert.deepEqual(chamadas.esperas, [4000])
  }

  {
    const u = {
      stage: "confirmar_entrada",
      _entradaPendenteTipo: "telefone",
      _entradaPendenteValor: "anterior"
    }
    const { ctx, chamadas } = criarContexto(u, "123", () => "5511123")
    assert.deepEqual(
      await handleConfirmEntryPhone(ctx),
      { handled: false, response: null }
    )
    assert.equal(u._entradaPendenteValor, "anterior")
    assert.equal(u.stage, "confirmar_entrada")
    assert.deepEqual(chamadas.formatacoes, [])
    assert.deepEqual(chamadas.audiosGerados, [])
  }

  {
    const u = {
      stage: "confirmar_entrada",
      _entradaPendenteTipo: "telefone"
    }
    const { ctx, chamadas } = criarContexto(u, "", () => "5511987654321")
    assert.deepEqual(
      await handleConfirmEntryPhone(ctx),
      { handled: false, response: null }
    )
    assert.deepEqual(chamadas.normalizacoes, [])
    assert.equal(u.stage, "confirmar_entrada")
  }

  for (const [stage, tipo, texto] of [
    ["cliente", "telefone", "11987654321"],
    ["confirmar_entrada", "nome", "11987654321"],
    ["confirmar_entrada", "telefone", "entrada_ok"],
    ["confirmar_entrada", "telefone", "entrada_corrigir"]
  ]) {
    const u = { stage, _entradaPendenteTipo: tipo }
    const { ctx, chamadas } = criarContexto(u, texto, () => "5511987654321")
    assert.deepEqual(
      await handleConfirmEntryPhone(ctx),
      { handled: false, response: null }
    )
    assert.deepEqual(chamadas.normalizacoes, [])
    assert.equal(u.stage, stage)
  }

  console.log("confirm-entry-phone-handler.test.js: ok")
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
