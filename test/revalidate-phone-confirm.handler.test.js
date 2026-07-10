const assert = require("node:assert/strict")
const {
  handle
} = require("../src/domain/client/handlers/revalidate-phone-confirm.handler")

function criarContexto(u, decision = { nextAction: "revalidate_phone_confirm" }) {
  const chamadas = {
    respostasComTimer: [],
    voltas: [],
    progressões: [],
    cidades: []
  }
  return {
    chamadas,
    ctx: {
      decision,
      u,
      from: "5511",
      responderComTimer: (from, response) => {
        chamadas.respostasComTimer.push({ from, response })
        return response
      },
      voltarParaConfirmacao: async (from, usuario) => {
        chamadas.voltas.push({ from, usuario })
        return { texto: "voltar confirmação", opcoes: null }
      },
      proximaConfirmacaoProgressiva: async (from, usuario) => {
        chamadas.progressões.push({ from, usuario })
        return { texto: "próxima confirmação", opcoes: [] }
      },
      flowAcolhimentoCidade: async (usuario, contexto) => {
        chamadas.cidades.push({ usuario, contexto })
        return { texto: "informar cidade", opcoes: null }
      }
    }
  }
}

async function main() {
  {
    const u = {
      stage: "revalida_whatsapp",
      _revalidaConfirmados: ["nome"],
      marcador: { preservado: true }
    }
    const estadoAntes = structuredClone(u)
    const { ctx, chamadas } = criarContexto(
      u,
      { nextAction: "revalidate_phone_correct_text" }
    )
    assert.deepEqual(
      await handle(ctx),
      { success: false, response: null }
    )
    assert.deepEqual(u, estadoAntes)
    assert.deepEqual(chamadas, {
      respostasComTimer: [],
      voltas: [],
      progressões: [],
      cidades: []
    })
  }

  {
    const u = {
      stage: "revalida_whatsapp",
      _corrigindoWhatsappConfirmacao: true
    }
    const { ctx, chamadas } = criarContexto(u)
    assert.deepEqual(
      await handle(ctx),
      {
        success: true,
        response: { texto: "voltar confirmação", opcoes: null }
      }
    )
    assert.equal(u.whatsappVerificado, true)
    assert.equal(u.whatsappContato, "5511")
    assert.equal("_corrigindoWhatsappConfirmacao" in u, false)
    assert.equal(chamadas.voltas.length, 1)
    assert.equal(chamadas.respostasComTimer.length, 1)
  }

  {
    const u = {
      stage: "revalida_whatsapp",
      _revalidandoCampos: true
    }
    const { ctx, chamadas } = criarContexto(u)
    assert.deepEqual(
      await handle(ctx),
      {
        success: true,
        response: { texto: "próxima confirmação", opcoes: [] }
      }
    )
    assert.deepEqual(u._revalidaConfirmados, ["whatsapp"])
    assert.equal(chamadas.progressões.length, 1)
  }

  {
    const confirmados = ["nome"]
    const u = {
      stage: "revalida_whatsapp",
      _revalidandoCampos: true,
      _revalidaConfirmados: confirmados
    }
    const { ctx } = criarContexto(u)
    const result = await handle(ctx)
    assert.equal(result.success, true)
    assert.equal(u._revalidaConfirmados, confirmados)
    assert.deepEqual(confirmados, ["nome", "whatsapp"])
  }

  {
    const u = {
      stage: "revalida_whatsapp",
      _revalidandoCampos: true
    }
    const { ctx } = criarContexto(u)
    ctx.proximaConfirmacaoProgressiva = async () => undefined
    assert.deepEqual(
      await handle(ctx),
      { success: true, response: undefined }
    )
    assert.deepEqual(u._revalidaConfirmados, ["whatsapp"])
  }

  {
    const u = { stage: "revalida_whatsapp" }
    const { ctx, chamadas } = criarContexto(u)
    assert.deepEqual(
      await handle(ctx),
      {
        success: true,
        response: { texto: "informar cidade", opcoes: null }
      }
    )
    assert.equal(u.whatsappVerificado, true)
    assert.equal(u.whatsappContato, "5511")
    assert.deepEqual(chamadas.cidades[0].contexto, {
      from: "5511"
    })
  }

  for (const decision of [null, {}, { nextAction: "" }]) {
    const u = {
      _revalidandoCampos: true,
      _revalidaConfirmados: ["nome"]
    }
    const estadoAntes = structuredClone(u)
    const { ctx, chamadas } = criarContexto(u, decision)
    assert.deepEqual(
      await handle(ctx),
      { success: false, response: null }
    )
    assert.deepEqual(u, estadoAntes)
    assert.equal(chamadas.progressões.length, 0)
  }

  {
    const erro = new Error("falha após mutação")
    const u = {
      _revalidandoCampos: true,
      _revalidaConfirmados: []
    }
    const { ctx } = criarContexto(u)
    ctx.proximaConfirmacaoProgressiva = async () => {
      throw erro
    }
    await assert.rejects(
      handle(ctx),
      candidate => candidate === erro
    )
    assert.deepEqual(u._revalidaConfirmados, ["whatsapp"])
  }
}

main()
  .then(() => console.log("revalidate-phone-confirm.handler.test.js: ok"))
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
