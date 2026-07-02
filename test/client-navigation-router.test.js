const assert = require("node:assert/strict")

const { criarClientNavigationRouter } = require("../src/domain/client-navigation-router")

function criarHarness() {
  const chamadas = {
    stages: [],
    timers: [],
    inicios: [],
    menus: [],
    novosCasos: []
  }
  const processar = criarClientNavigationRouter({
    podeMostrarMenuCliente: u => Boolean(u?.numeroCaso),
    setStage: (u, stage) => {
      chamadas.stages.push(stage)
      u.stage = stage
    },
    iniciarTimer: from => chamadas.timers.push(from),
    getPrimeiroNomeRetomada: u => u.nome.split(" ")[0],
    iniciarFluxoRelatoLivre: async (from, u, opcoes) => {
      chamadas.inicios.push({ from, u, opcoes })
      return { texto: "início do atendimento", opcoes: null }
    },
    menuClienteComAudio: async (from, u) => {
      chamadas.menus.push({ from, u })
      return { texto: "menu do cliente", opcoes: [] }
    },
    abrirNovoCasoCliente: async (from, u) => {
      chamadas.novosCasos.push({ from, u })
      return { texto: "abrir novo caso", opcoes: null }
    }
  })
  return { processar, chamadas }
}

async function main() {
  {
    const { processar } = criarHarness()
    assert.deepEqual(
      await processar({ from: "5511", u: { stage: "cliente" }, text: "m_inicio" }),
      { handled: false, response: null }
    )
  }

  {
    const { processar, chamadas } = criarHarness()
    const u = { stage: "inicio" }
    assert.deepEqual(
      await processar({ from: "5511", u, text: "oi" }),
      {
        handled: true,
        response: { texto: "início do atendimento", opcoes: null }
      }
    )
    assert.deepEqual(chamadas.inicios, [
      { from: "5511", u, opcoes: { boasVindas: true } }
    ])
  }

  {
    const { processar, chamadas } = criarHarness()
    const u = {
      stage: "inicio",
      nome: "Maria Silva",
      numeroCaso: "ORA-123",
      area: "Trabalhista"
    }
    assert.deepEqual(
      await processar({ from: "5511", u, text: "oi" }),
      {
        handled: true,
        response: {
          texto: "Que bom te ver novamente, *Maria* 😊\n\nVocê já possui um atendimento conosco.\n\n📄 Caso: *ORA-123*\n⚖️ Área: Trabalhista\n\nO que deseja fazer?",
          opcoes: [
            { id: "ret_acompanhar", title: "📊 Acompanhar meu caso" },
            { id: "ret_novo", title: "➕ Abrir novo caso" }
          ]
        }
      }
    )
    assert.equal(u.stage, "inicio_retorno")
    assert.deepEqual(chamadas.timers, ["5511"])
  }

  {
    const { processar, chamadas } = criarHarness()
    const u = {
      stage: "inicio_retorno",
      numeroCaso: "ORA-123"
    }
    assert.deepEqual(
      await processar({ from: "5511", u, text: "ret_acompanhar" }),
      {
        handled: true,
        response: { texto: "menu do cliente", opcoes: [] }
      }
    )
    assert.equal(u.stage, "cliente")
    assert.deepEqual(chamadas.timers, ["5511"])
    assert.equal(chamadas.menus[0].u, u)
  }

  {
    const { processar, chamadas } = criarHarness()
    const u = { stage: "inicio_retorno" }
    assert.deepEqual(
      await processar({ from: "5511", u, text: "ret_acompanhar" }),
      {
        handled: true,
        response: { texto: "início do atendimento", opcoes: null }
      }
    )
    assert.deepEqual(chamadas.inicios[0].opcoes, { boasVindas: true })
  }

  {
    const { processar, chamadas } = criarHarness()
    const u = {
      stage: "inicio_retorno",
      numeroCaso: "ORA-123"
    }
    assert.deepEqual(
      await processar({ from: "5511", u, text: "ret_novo" }),
      {
        handled: true,
        response: { texto: "abrir novo caso", opcoes: null }
      }
    )
    assert.equal(chamadas.novosCasos[0].u, u)
  }

  {
    const { processar, chamadas } = criarHarness()
    assert.deepEqual(
      await processar({
        from: "5511",
        u: { stage: "inicio_retorno", numeroCaso: "ORA-123" },
        text: "resposta_invalida"
      }),
      { handled: false, response: null }
    )
    assert.deepEqual(chamadas.timers, [])
    assert.deepEqual(chamadas.menus, [])
    assert.deepEqual(chamadas.novosCasos, [])
  }

  console.log("client-navigation-router.test.js: ok")
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
