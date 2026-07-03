const assert = require("node:assert/strict")

const { criarLegacyIntakeRouter } = require("../src/domain/legacy-intake-router")

function criarHarness() {
  const chamadas = {
    timers: [],
    stages: [],
    confirmacoes: [],
    descricoes: []
  }
  const STAGES = {
    CONFIRMACAO: "confirmacao",
    COLETA_DESC_AUDIO: "coleta_desc_audio",
    DESC_ERRO_TRANSCRICAO: "desc_erro_transcricao"
  }
  const processar = criarLegacyIntakeRouter({
    STAGES,
    REGIOES: {
      reg_se: { label: "Sudeste" }
    },
    UF_MAP: {
      uf_sp: "SP"
    },
    extrairNomeDaCorrecaoExplicita: () => null,
    formatarNome: texto => texto.split(" ").map(palavra => palavra.charAt(0).toUpperCase() + palavra.slice(1)).join(" "),
    limparTextoSomenteLetras: texto => String(texto || "").replace(/[^A-Za-zÀ-ÿ\s]/g, "").trim(),
    ehNomeAparente: nome => nome.includes(" ") ? true : "incompleto",
    responderComTimer: (from, payload) => {
      chamadas.timers.push(from)
      return payload
    },
    prepararConfirmacaoEntrada: async (from, u, tipo, valor, origem) => {
      chamadas.confirmacoes.push({ from, u, tipo, valor, origem })
      return { texto: `confirmar:${tipo}:${valor}:${origem}`, opcoes: null }
    },
    iniciarTimer: from => chamadas.timers.push(from),
    telaRegioes: () => ({ texto: "regioes", opcoes: [] }),
    setStage: (u, stage) => {
      chamadas.stages.push(stage)
      u.stage = stage
    },
    telaUFsRegiao: regiao => ({ texto: `ufs:${regiao}`, opcoes: [] }),
    formatarCidade: texto => texto.split(" ").map(palavra => palavra.charAt(0).toUpperCase() + palavra.slice(1)).join(" "),
    deveOferecerExplicarTudo: () => false,
    prepararOfertaExplicarTudoFinal: () => ({ texto: "explicar tudo", opcoes: null }),
    entrarEtapaDescricao: (u, stage) => {
      chamadas.descricoes.push(stage)
      u.stage = stage
    },
    telaDescreverCaso: () => ({ texto: "descrever caso", opcoes: null }),
    iniciarConfirmacaoDescricao: (from, u, texto, stage) => {
      chamadas.confirmacoes.push({ from, u, tipo: "descricao", valor: texto, origem: stage })
      return { texto: `confirmar descricao:${texto}`, opcoes: null }
    }
  })
  return { processar, chamadas }
}

async function main() {
  {
    const { processar, chamadas } = criarHarness()
    assert.deepEqual(
      await processar({ from: "5511", u: { stage: "cliente" }, text: "menu" }),
      { handled: false, response: null }
    )
    assert.deepEqual(chamadas.timers, [])
  }

  {
    const { processar, chamadas } = criarHarness()
    const u = { stage: "coleta_nome" }
    assert.deepEqual(
      await processar({ from: "5511", u, text: "maria silva" }),
      {
        handled: true,
        response: { texto: "confirmar:nome:Maria Silva:coleta_nome", opcoes: null }
      }
    )
    assert.equal(chamadas.confirmacoes[0].u, u)
  }

  {
    const { processar, chamadas } = criarHarness()
    const u = { stage: "coleta_regiao" }
    assert.deepEqual(
      await processar({ from: "5511", u, text: "reg_se" }),
      { handled: true, response: { texto: "ufs:reg_se", opcoes: [] } }
    )
    assert.equal(u._regiao, "reg_se")
    assert.equal(u.regiao, "Sudeste")
    assert.equal(u.stage, "coleta_uf")
    assert.deepEqual(chamadas.timers, ["5511"])
  }

  {
    const { processar, chamadas } = criarHarness()
    const u = { stage: "coleta_uf", _regiao: "reg_se" }
    assert.deepEqual(
      await processar({ from: "5511", u, text: "uf_sp" }),
      {
        handled: true,
        response: {
          texto: "●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\nDigite a cidade onde você mora",
          opcoes: null
        }
      }
    )
    assert.equal(u.uf, "SP")
    assert.equal(u.stage, "coleta_cidade_regiao")
    assert.deepEqual(chamadas.timers, ["5511"])
  }

  {
    const { processar, chamadas } = criarHarness()
    const u = { stage: "coleta_contrib" }
    assert.deepEqual(
      await processar({ from: "5511", u, text: "col_c3" }),
      {
        handled: true,
        response: {
          texto: "🏥 Você já recebe algum benefício do INSS?",
          opcoes: [
            { id: "col_b1", title: "✅ Sim, recebo" },
            { id: "col_b2", title: "❌ Não recebo" }
          ]
        }
      }
    )
    assert.equal(u.contribuicao, "Mais de 1 ano")
    assert.equal(u.stage, "coleta_benef")
    assert.deepEqual(chamadas.timers, ["5511"])
  }

  {
    const { processar, chamadas } = criarHarness()
    const u = { stage: "coleta_benef" }
    const resultado = await processar({ from: "5511", u, text: "col_b1" })
    assert.equal(resultado.handled, true)
    assert.match(resultado.response.texto, /Conte o que aconteceu/)
    assert.equal(u.recebeBeneficio, "Sim")
    assert.equal(u.stage, "coleta_desc_audio")
    assert.deepEqual(chamadas.descricoes, ["coleta_desc_audio"])
    assert.deepEqual(chamadas.timers, ["5511"])
  }

  {
    const { processar, chamadas } = criarHarness()
    const u = { stage: "coleta_desc_audio" }
    assert.deepEqual(
      await processar({ from: "5511", u, text: "Descrição completa do caso" }),
      {
        handled: true,
        response: { texto: "confirmar descricao:Descrição completa do caso", opcoes: null }
      }
    )
    assert.deepEqual(chamadas.confirmacoes[0], {
      from: "5511",
      u,
      tipo: "descricao",
      valor: "Descrição completa do caso",
      origem: "coleta_desc_audio"
    })
  }

  {
    const { processar, chamadas } = criarHarness()
    const u = { stage: "coleta_cidade" }
    assert.deepEqual(
      await processar({ from: "5511", u, text: "são paulo" }),
      {
        handled: true,
        response: { texto: "confirmar:cidade:São Paulo:coleta_cidade", opcoes: null }
      }
    )
    assert.equal(chamadas.confirmacoes[0].tipo, "cidade")
  }

  console.log("legacy-intake-router.test.js: ok")
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
