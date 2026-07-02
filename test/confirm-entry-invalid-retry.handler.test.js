const assert = require("node:assert/strict")
const {
  handle
} = require("../src/domain/client/handlers/confirm-entry-invalid-retry.handler")

const stages = {
  CONFIRMAR_ENTRADA: "confirmar_entrada"
}

async function main() {
  for (const caso of [
    {
      u: {
        stage: "cliente",
        _entradaPendenteTipo: "nome"
      },
      texto: "valor inválido"
    },
    {
      u: {
        stage: "confirmar_entrada",
        _entradaPendenteTipo: "cidade"
      },
      texto: "cidade inválida"
    },
    {
      u: {
        stage: "confirmar_entrada",
        _entradaPendenteTipo: "nome"
      },
      texto: "entrada_ok"
    },
    {
      u: {
        stage: "confirmar_entrada",
        _entradaPendenteTipo: "telefone"
      },
      texto: "entrada_corrigir"
    },
    {
      u: {
        stage: "confirmar_entrada",
        _entradaPendenteTipo: "nome"
      },
      texto: ""
    }
  ]) {
    const estadoAntes = structuredClone(caso.u)
    const timers = []
    assert.deepEqual(
      await handle({
        u: caso.u,
        texto: caso.texto,
        from: "5511",
        stages,
        iniciarTimer: from => timers.push(from)
      }),
      { success: false, response: null }
    )
    assert.deepEqual(caso.u, estadoAntes)
    assert.deepEqual(timers, [])
  }

  {
    const u = {
      stage: "confirmar_entrada",
      _entradaPendenteTipo: "nome",
      _entradaPendenteValor: "valor anterior",
      _entradaPendenteOrigem: "origem"
    }
    const estadoAntes = structuredClone(u)
    const timers = []
    assert.deepEqual(
      await handle({
        u,
        texto: "resposta não reconhecida",
        from: "5511",
        stages,
        iniciarTimer: from => timers.push(from)
      }),
      {
        success: true,
        response: {
          texto: "Não consegui identificar a informação. Por favor, me diga novamente. Pode falar ou digitar. 🎙️",
          opcoes: null
        }
      }
    )
    assert.deepEqual(u, estadoAntes)
    assert.deepEqual(timers, ["5511"])
  }

  {
    const erro = new Error("falha ao iniciar timer")
    const efeitos = []
    const u = {
      stage: "confirmar_entrada",
      _entradaPendenteTipo: "telefone"
    }
    await assert.rejects(
      handle({
        u,
        texto: "telefone inválido",
        from: "5511",
        stages,
        iniciarTimer: from => {
          efeitos.push(from)
          throw erro
        }
      }),
      candidate => candidate === erro
    )
    assert.deepEqual(efeitos, ["5511"])
  }
}

main()
  .then(() => console.log("confirm-entry-invalid-retry.handler.test.js: ok"))
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
