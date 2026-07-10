const assert = require("node:assert/strict")
const {
  handle
} = require("../src/domain/client/handlers/revalidate-name-confirm.handler")

async function main() {
  {
    const u = {
      stage: "revalida_nome",
      _revalidaConfirmados: ["cidade"],
      marcador: { preservado: true }
    }
    const estadoAntes = structuredClone(u)
    let continuidades = 0
    const result = await handle({
      decision: { nextAction: "revalidate_name_correct_text" },
      u,
      from: "5511",
      proximaConfirmacaoProgressiva: async () => {
        continuidades += 1
        return { texto: "não deveria executar" }
      }
    })
    assert.deepEqual(result, { success: false, response: null })
    assert.deepEqual(u, estadoAntes)
    assert.equal(continuidades, 0)
  }

  {
    const u = { stage: "revalida_nome" }
    const resposta = { texto: "próxima confirmação", opcoes: [] }
    const chamadas = []
    const result = await handle({
      decision: { nextAction: "revalidate_name_confirm" },
      u,
      from: "5511",
      proximaConfirmacaoProgressiva: async (from, usuario) => {
        chamadas.push({ from, usuario })
        return resposta
      }
    })
    assert.deepEqual(result, { success: true, response: resposta })
    assert.deepEqual(u._revalidaConfirmados, ["nome"])
    assert.equal(chamadas.length, 1)
    assert.equal(chamadas[0].from, "5511")
    assert.equal(chamadas[0].usuario, u)
  }

  {
    const confirmados = ["cidade"]
    const u = {
      stage: "revalida_nome",
      _revalidaConfirmados: confirmados
    }
    const result = await handle({
      decision: { nextAction: "revalidate_name_confirm" },
      u,
      from: "5511",
      proximaConfirmacaoProgressiva: async () => undefined
    })
    assert.deepEqual(result, { success: true, response: undefined })
    assert.equal(u._revalidaConfirmados, confirmados)
    assert.deepEqual(confirmados, ["cidade", "nome"])
  }

  for (const decision of [undefined, null, {}, { nextAction: "" }]) {
    const u = { _revalidaConfirmados: ["cidade"] }
    const estadoAntes = structuredClone(u)
    const result = await handle({
      decision,
      u,
      from: "5511",
      proximaConfirmacaoProgressiva: async () => {
        throw new Error("não deveria executar")
      }
    })
    assert.deepEqual(result, { success: false, response: null })
    assert.deepEqual(u, estadoAntes)
  }

  {
    const erro = new Error("falha após mutação")
    const u = { _revalidaConfirmados: [] }
    await assert.rejects(
      handle({
        decision: { nextAction: "revalidate_name_confirm" },
        u,
        from: "5511",
        proximaConfirmacaoProgressiva: async () => {
          throw erro
        }
      }),
      candidate => candidate === erro
    )
    assert.deepEqual(u._revalidaConfirmados, ["nome"])
  }
}

main()
  .then(() => console.log("revalidate-name-confirm.handler.test.js: ok"))
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
