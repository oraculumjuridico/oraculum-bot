const assert = require("node:assert/strict")

const {
  handleDescriptionConfirmation
} = require("../src/domain/stage-handlers/description-confirmation-handler")

function criarContexto(u, texto) {
  const chamadas = {
    ordem: [],
    stages: [],
    timers: []
  }
  return {
    chamadas,
    ctx: {
      u,
      texto,
      from: "5511",
      stages: {
        DESC_CONFIRMA: "desc_confirma",
        COLETA_DESC_AUDIO: "coleta_desc_audio"
      },
      normalizarTextoCRM: valor => {
        chamadas.ordem.push("normalizar")
        return valor.replace(/\s+/g, " ")
      },
      sincronizarNegocio: async usuario => {
        chamadas.ordem.push("sincronizar")
        assert.equal(usuario, u)
      },
      respostaAposConfirmarDescricao: async (from, usuario) => {
        chamadas.ordem.push("responder")
        assert.equal(from, "5511")
        assert.equal(usuario, u)
        return { texto: "descrição confirmada", opcoes: null }
      },
      entrarEtapaDescricao: (usuario, stage) => {
        chamadas.stages.push(stage)
        usuario.stage = stage
      },
      iniciarTimer: from => chamadas.timers.push(from),
      telaDescreverCaso: () => ({ texto: "descrever caso", opcoes: null })
    }
  }
}

async function main() {
  {
    const u = {
      stage: "desc_confirma",
      _descTemp: "  relato   completo  "
    }
    const { ctx, chamadas } = criarContexto(u, "desc_ok")
    assert.deepEqual(
      await handleDescriptionConfirmation(ctx),
      {
        handled: true,
        response: { texto: "descrição confirmada", opcoes: null }
      }
    )
    assert.equal(u.descricao, "relato completo")
    assert.equal(u._descTemp, null)
    assert.deepEqual(chamadas.ordem, ["normalizar", "sincronizar", "responder"])
    assert.deepEqual(chamadas.timers, [])
  }

  {
    const buffer = Buffer.from("audio")
    const u = {
      stage: "desc_confirma",
      _descTemp: "relato",
      _descOrigemStage: "explicar_tudo",
      _audioDescBuffer: buffer,
      _audioDescMime: "audio/ogg",
      _audioDescNome: "relato.ogg",
      audiosDescCorrigidos: []
    }
    const { ctx, chamadas } = criarContexto(u, "desc_corrigir")
    assert.deepEqual(
      await handleDescriptionConfirmation(ctx),
      {
        handled: true,
        response: { texto: "descrever caso", opcoes: null }
      }
    )
    assert.deepEqual(u.audiosDescCorrigidos, [{
      buffer,
      mimeType: "audio/ogg",
      nome: "relato.ogg"
    }])
    assert.equal(u._descTemp, null)
    assert.equal(u._audioDescBuffer, null)
    assert.equal(u._audioDescMime, null)
    assert.equal(u._audioDescNome, null)
    assert.equal(u.stage, "coleta_desc_audio")
    assert.deepEqual(chamadas.stages, ["coleta_desc_audio"])
    assert.deepEqual(chamadas.timers, ["5511"])
  }

  {
    const u = { stage: "desc_confirma" }
    const { ctx, chamadas } = criarContexto(u, "resposta_invalida")
    assert.deepEqual(
      await handleDescriptionConfirmation(ctx),
      {
        handled: true,
        response: {
          texto: "Transcrição recebida.",
          opcoes: [
            { id: "desc_ok", title: "✅ Confirmar" },
            { id: "desc_corrigir", title: "✏️ Corrigir" }
          ]
        }
      }
    )
    assert.deepEqual(chamadas.timers, ["5511"])
  }

  {
    const u = { stage: "cliente" }
    const { ctx, chamadas } = criarContexto(u, "desc_ok")
    assert.deepEqual(
      await handleDescriptionConfirmation(ctx),
      { handled: false, response: null }
    )
    assert.deepEqual(chamadas.ordem, [])
    assert.deepEqual(chamadas.stages, [])
    assert.deepEqual(chamadas.timers, [])
  }

  console.log("description-confirmation-handler.test.js: ok")
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
