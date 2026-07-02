const assert = require("node:assert/strict")

const {
  handleConfirmEntryInvalid
} = require("../src/domain/stage-handlers/confirm-entry-invalid-handler")

function criarContexto(u) {
  const timers = []
  return {
    timers,
    ctx: {
      u,
      from: "5511",
      stages: {
        CONFIRMAR_ENTRADA: "confirmar_entrada"
      },
      iniciarTimer: from => timers.push(from)
    }
  }
}

async function main() {
  {
    const u = { stage: "confirmar_entrada" }
    const { ctx, timers } = criarContexto(u)
    assert.deepEqual(
      await handleConfirmEntryInvalid(ctx),
      {
        handled: true,
        response: {
          texto: "Confirme a informação ou me diga a correção agora. Pode falar ou digitar. 🎙️",
          opcoes: [{ id: "entrada_ok", title: "✅ Confirmar" }]
        }
      }
    )
    assert.deepEqual(timers, ["5511"])
    assert.equal(u.stage, "confirmar_entrada")
  }

  {
    const u = { stage: "cliente" }
    const { ctx, timers } = criarContexto(u)
    assert.deepEqual(
      await handleConfirmEntryInvalid(ctx),
      { handled: false, response: null }
    )
    assert.deepEqual(timers, [])
    assert.equal(u.stage, "cliente")
  }

  console.log("confirm-entry-invalid-handler.test.js: ok")
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
