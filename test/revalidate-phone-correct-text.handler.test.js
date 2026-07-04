const assert = require("node:assert/strict")
const {
  handle
} = require("../src/domain/client/handlers/revalidate-phone-correct-text.handler")

function criarContexto(u, overrides = {}) {
  const chamadas = {
    timers: [],
    respostas: [],
    audios: [],
    voltas: [],
    progressoes: [],
    cidades: []
  }
  return {
    chamadas,
    ctx: {
      decision: { nextAction: "revalidate_phone_correct_text" },
      u,
      texto: "(81) 99999-0000",
      from: "558188888888",
      normalizarTelefone: () => "5581999990000",
      formatarTelefoneExibicao: telefone => `formatado:${telefone}`,
      gerarAudioAtendente: async (atendente, texto) => {
        chamadas.audios.push({ tipo: "gerar", atendente, texto })
        return "telefone.ogg"
      },
      enviarAudio: async (from, url) => {
        chamadas.audios.push({ tipo: "enviar", from, url })
      },
      urlAudioAtendente: arquivo => `https://audio/${arquivo}`,
      esperar: async ms => {
        chamadas.audios.push({ tipo: "esperar", ms })
      },
      logErro: (...args) => {
        chamadas.audios.push({ tipo: "erro", args })
      },
      iniciarTimer: from => {
        chamadas.timers.push(from)
      },
      responderComTimer: (from, response) => {
        chamadas.respostas.push({ from, response })
        return response
      },
      voltarParaConfirmacao: async (from, usuario) => {
        chamadas.voltas.push({ from, usuario })
        return { texto: "voltar para confirmação", opcoes: null }
      },
      proximaConfirmacaoProgressiva: async (from, usuario, opcoes) => {
        chamadas.progressoes.push({ from, usuario, opcoes })
        return { texto: "próxima confirmação", opcoes: [] }
      },
      flowAcolhimentoCidade: async (usuario, contexto) => {
        chamadas.cidades.push({ usuario, contexto })
        return { texto: "informar cidade", opcoes: null }
      },
      ...overrides
    }
  }
}

async function main() {
  {
    const u = {
      whatsappContato: "558177777777",
      marcador: { preservado: true }
    }
    const estadoAntes = structuredClone(u)
    const { ctx, chamadas } = criarContexto(u, {
      decision: { nextAction: "revalidate_phone_audio" }
    })
    assert.deepEqual(
      await handle(ctx),
      { success: false, response: null }
    )
    assert.deepEqual(u, estadoAntes)
    assert.deepEqual(chamadas.timers, [])
    assert.deepEqual(chamadas.audios, [])
    assert.deepEqual(chamadas.cidades, [])
  }

  {
    const u = {
      modoTexto: true,
      _revalidandoCampos: true,
      atendimentoParaTerceiro: false,
      _revalidaConfirmados: ["nome"]
    }
    const { ctx, chamadas } = criarContexto(u)
    assert.deepEqual(
      await handle(ctx),
      {
        success: true,
        response: { texto: "próxima confirmação", opcoes: [] }
      }
    )
    assert.equal(u.whatsappContato, "5581999990000")
    assert.equal(u.whatsappVerificado, true)
    assert.equal(u.telefoneEhDoCliente, true)
    assert.deepEqual(u._revalidaConfirmados, ["nome", "whatsapp"])
    assert.equal(chamadas.progressoes.length, 1)
    assert.equal(chamadas.progressoes[0].usuario, u)
    assert.deepEqual(chamadas.progressoes[0].opcoes, {
      introducaoAudio: "Entendi! Vou usar o número formatado:5581999990000."
    })
    assert.deepEqual(chamadas.audios, [])
  }

  {
    const u = {
      atendente: "Lia",
      modoTexto: false,
      atendimentoParaTerceiro: true,
      _corrigindoWhatsappConfirmacao: true
    }
    const { ctx, chamadas } = criarContexto(u)
    assert.deepEqual(
      await handle(ctx),
      {
        success: true,
        response: { texto: "voltar para confirmação", opcoes: null }
      }
    )
    assert.equal(u.telefoneEhDoCliente, false)
    assert.equal("_corrigindoWhatsappConfirmacao" in u, false)
    assert.equal(chamadas.voltas.length, 1)
    assert.equal(chamadas.respostas.length, 1)
    assert.deepEqual(chamadas.audios, [
      {
        tipo: "gerar",
        atendente: "Lia",
        texto: "Entendi! Vou usar o número formatado:5581999990000."
      },
      {
        tipo: "enviar",
        from: "558188888888",
        url: "https://audio/telefone.ogg"
      },
      { tipo: "esperar", ms: 2000 }
    ])
  }

  {
    const u = {
      modoTexto: true,
      atendimentoParaTerceiro: false
    }
    const { ctx, chamadas } = criarContexto(u)
    assert.deepEqual(
      await handle(ctx),
      {
        success: true,
        response: { texto: "informar cidade", opcoes: null }
      }
    )
    assert.deepEqual(chamadas.cidades, [{
      usuario: u,
      contexto: {
        from: "558188888888",
        introducaoAudio: "Entendi! Vou usar o número formatado:5581999990000."
      }
    }])
  }

  {
    const u = {
      whatsappContato: "558177777777",
      marcador: "preservado"
    }
    const { ctx, chamadas } = criarContexto(u, {
      normalizarTelefone: () => null
    })
    const result = await handle(ctx)
    assert.deepEqual(result, {
      success: true,
      response: {
        texto: `●●●●○○ 📱 Etapa 4 de 6 · *WhatsApp*\n\nNão consegui identificar o número. Informe com DDD. Pode falar ou digitar. 🎙️`,
        opcoes: [{ id: "revalida_whatsapp_ok", title: "✅ Confirmar atual" }]
      }
    })
    assert.equal(u.whatsappContato, "558177777777")
    assert.equal(chamadas.timers.length, 1)
    assert.equal(chamadas.respostas.length, 1)
  }

  for (const texto of ["", null, undefined]) {
    const u = {
      whatsappContato: "558177777777",
      marcador: { preservado: true }
    }
    const estadoAntes = structuredClone(u)
    const { ctx, chamadas } = criarContexto(u, { texto })
    assert.deepEqual(
      await handle(ctx),
      { success: false, response: null }
    )
    assert.deepEqual(u, estadoAntes)
    assert.deepEqual(chamadas.timers, [])
    assert.deepEqual(chamadas.audios, [])
  }

  {
    const erro = new Error("falha após primeira mutação")
    const u = {
      modoTexto: true,
      _revalidandoCampos: true
    }
    const { ctx } = criarContexto(u, {
      proximaConfirmacaoProgressiva: async () => {
        throw erro
      }
    })
    await assert.rejects(
      handle(ctx),
      candidate => candidate === erro
    )
    assert.equal(u.whatsappContato, "5581999990000")
    assert.equal(u.whatsappVerificado, true)
    assert.equal(u.telefoneEhDoCliente, true)
    assert.deepEqual(u._revalidaConfirmados, ["whatsapp"])
  }

  {
    const u = {
      atendente: "Lia",
      modoTexto: false,
      _revalidandoCampos: true
    }
    const { ctx, chamadas } = criarContexto(u, {
      gerarAudioAtendente: async () => {
        throw new Error("não deve gerar áudio intermediário")
      }
    })
    const result = await handle(ctx)
    assert.equal(result.success, true)
    assert.deepEqual(chamadas.audios, [])
    assert.deepEqual(chamadas.progressoes[0].opcoes, {
      introducaoAudio: "Entendi! Vou usar o número formatado:5581999990000."
    })
    assert.deepEqual(u._revalidaConfirmados, ["whatsapp"])
  }
}

main()
  .then(() => console.log("revalidate-phone-correct-text.handler.test.js: ok"))
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
