const assert = require("node:assert/strict")
const {
  handle
} = require("../src/domain/client/handlers/revalidate-city-select.handler")

function dependencias(overrides = {}) {
  return {
    from: "5511",
    mapearRegiaoPorUF: uf => `região-${uf}`,
    estadoPorExtenso: uf => `estado-${uf}`,
    gerarAudioAtendente: async () => "audio.ogg",
    enviarAudio: async () => undefined,
    urlAudioAtendente: arquivo => `https://audio/${arquivo}`,
    esperar: async () => undefined,
    logErro: () => undefined,
    proximaConfirmacaoProgressiva: async () => ({ texto: "próxima confirmação" }),
    ...overrides
  }
}

async function main() {
  {
    const u = {
      _cidadesMultiplas: [{ cidade: "Recife", uf: "PE", regiao: "Nordeste" }],
      marcador: { preservado: true }
    }
    const estadoAntes = structuredClone(u)
    let chamadas = 0
    const result = await handle({
      decision: {
        nextAction: "revalidate_city_correct_text"
      },
      u,
      texto: "revalida_cidade_multipla_0",
      ...dependencias({
        proximaConfirmacaoProgressiva: async () => {
          chamadas += 1
          return null
        }
      })
    })
    assert.deepEqual(result, { success: false, response: null })
    assert.deepEqual(u, estadoAntes)
    assert.equal(chamadas, 0)
  }

  {
    const resposta = { texto: "próxima confirmação", opcoes: [] }
    const u = {
      atendente: "Lia",
      modoTexto: true,
      _cidadesMultiplas: [
        { cidade: "Santa Maria", uf: "RS" },
        { cidade: "Santa Maria", uf: "DF", regiao: "Centro-Oeste" }
      ],
      _revalidaConfirmados: ["nome"]
    }
    const chamadas = []
    const result = await handle({
      decision: {
        nextAction: "revalidate_city_select"
      },
      u,
      texto: "revalida_cidade_multipla_1",
      ...dependencias({
        proximaConfirmacaoProgressiva: async (from, usuario) => {
          chamadas.push({ from, usuario })
          return resposta
        }
      })
    })
    assert.deepEqual(result, { success: true, response: resposta })
    assert.equal(u.cidade, "Santa Maria")
    assert.equal(u.uf, "DF")
    assert.equal(u.regiao, "Centro-Oeste")
    assert.equal("_cidadesMultiplas" in u, false)
    assert.deepEqual(u._revalidaConfirmados, ["nome", "cidade"])
    assert.deepEqual(chamadas, [{ from: "5511", usuario: u }])
  }

  {
    const u = {
      atendente: "Lia",
      modoTexto: false,
      _cidadesMultiplas: [{ cidade: "Recife", uf: "PE" }]
    }
    const audio = []
    const result = await handle({
      decision: {
        nextAction: "revalidate_city_select"
      },
      u,
      texto: "revalida_cidade_multipla_0",
      ...dependencias({
        gerarAudioAtendente: async (atendente, texto) => {
          audio.push({ etapa: "gerar", atendente, texto })
          return "confirmacao.ogg"
        },
        enviarAudio: async (from, url) => {
          audio.push({ etapa: "enviar", from, url })
        },
        esperar: async ms => {
          audio.push({ etapa: "esperar", ms })
        }
      })
    })
    assert.equal(result.success, true)
    assert.equal(u.regiao, "região-PE")
    assert.deepEqual(audio, [
      {
        etapa: "gerar",
        atendente: "Lia",
        texto: "Entendi! Cidade atualizada para Recife, estado-PE."
      },
      {
        etapa: "enviar",
        from: "5511",
        url: "https://audio/confirmacao.ogg"
      },
      { etapa: "esperar", ms: 2000 }
    ])
  }

  for (const text of [
    "revalida_cidade_multipla_2",
    "revalida_cidade_multipla_invalida"
  ]) {
    const u = {
      _cidadesMultiplas: [{ cidade: "Recife", uf: "PE" }],
      marcador: "preservado"
    }
    const estadoAntes = structuredClone(u)
    const result = await handle({
      decision: {
        nextAction: "revalidate_city_select"
      },
      u,
      texto: text,
      ...dependencias()
    })
    assert.deepEqual(result, { success: false, response: null })
    assert.deepEqual(u, estadoAntes)
  }

  for (const decision of [
    undefined,
    null,
    {},
    { nextAction: "revalidate_city_select" },
    { nextAction: "revalidate_city_select" }
  ]) {
    const u = { marcador: { preservado: true } }
    const estadoAntes = structuredClone(u)
    const result = await handle({
      decision,
      u,
      texto: undefined,
      ...dependencias()
    })
    assert.deepEqual(result, { success: false, response: null })
    assert.deepEqual(u, estadoAntes)
  }

  {
    const erro = new Error("falha após primeira mutação")
    const u = {
      _cidadesMultiplas: [{ cidade: "Recife", uf: "PE" }]
    }
    await assert.rejects(
      handle({
        decision: {
          nextAction: "revalidate_city_select"
        },
        u,
        texto: "revalida_cidade_multipla_0",
        ...dependencias({
          mapearRegiaoPorUF: () => {
            throw erro
          }
        })
      }),
      candidate => candidate === erro
    )
    assert.equal(u.cidade, "Recife")
    assert.equal(u.uf, "PE")
    assert.deepEqual(u._cidadesMultiplas, [{ cidade: "Recife", uf: "PE" }])
  }
}

main()
  .then(() => console.log("revalidate-city-select.handler.test.js: ok"))
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
