const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")

const source = fs.readFileSync(
  path.join(__dirname, "..", "server.js"),
  "utf8"
)
const audioSource = fs.readFileSync(
  path.join(__dirname, "..", "src", "domain", "audio", "audio-intake-pipeline-router.js"),
  "utf8"
)

function trecho(inicio, fim, origem = source) {
  const indiceInicio = origem.indexOf(inicio)
  const indiceFim = origem.indexOf(fim, indiceInicio)
  assert.notEqual(indiceInicio, -1, `Trecho inicial ausente: ${inicio}`)
  assert.notEqual(indiceFim, -1, `Trecho final ausente: ${fim}`)
  return origem.slice(indiceInicio, indiceFim)
}

assert.equal(source.includes("Etapa 6 de 6 · *Relato*"), false)
assert.equal(
  source.includes("●●●○○○ 📝 Etapa 3 de 6 · *Relato*"),
  true
)

const retomadaAutomatica = trecho(
  "async function verificarRetomadaAutomatica",
  "async function tentarRestaurarClienteHubSpotParaMenu"
)
assert.match(retomadaAutomatica, /if \(!u\.modoTexto && u\.atendente\)/)
assert.doesNotMatch(retomadaAutomatica, /if \(u\.atendente\)/)

assert.equal(
  source.includes('assessoria_inicial: "escolher como você prefere ser atendido"'),
  false
)
assert.equal(
  source.match(/assessoria_inicial: "confirmar o entendimento do seu relato"/g)?.length,
  2
)

const opcaoInvalida = trecho(
  "function respostaOpcaoInvalidaRetomada",
  "async function responderImprevistoPreAtendimento"
)
assert.match(
  opcaoInvalida,
  /🤔 Não entendi\. Por favor, escolha uma das opções do menu para continuar\. 👇/
)

const helperIntencaoDetectada = trecho(
  "async function executarIntencaoDetectadaCliente",
  "async function executarIntencaoCliente"
)

async function testarHelperIntencao({
  intencao,
  resultadoSelecao = false
}) {
  const chamadasSelecao = []
  const chamadasExecucao = []
  const contexto = {
    abrirSelecaoCasoParaAcao: async (from, u, acao) => {
      chamadasSelecao.push({ from, u, acao })
      return resultadoSelecao
    },
    executarIntencaoCliente: async (from, u, acao, texto) => {
      chamadasExecucao.push({ from, u, acao, texto })
      return { texto: `executado:${acao}`, opcoes: null }
    }
  }
  vm.runInNewContext(
    `${helperIntencaoDetectada}; this.helper = executarIntencaoDetectadaCliente`,
    contexto
  )
  const usuario = { negocioId: "deal-atual" }
  const resultado = await contexto.helper("5511000000000", usuario, intencao, "mensagem livre")
  return { resultado, chamadasSelecao, chamadasExecucao }
}

async function executarTestesSelecaoCaso() {
  for (const intencao of ["status", "documentos", "advogado"]) {
    const casoUnico = await testarHelperIntencao({ intencao })
    assert.equal(casoUnico.chamadasSelecao.length, 1)
    assert.equal(casoUnico.chamadasSelecao[0].acao, intencao)
    assert.equal(casoUnico.chamadasExecucao.length, 1)
    assert.equal(casoUnico.chamadasExecucao[0].acao, intencao)
    assert.equal(casoUnico.resultado.texto, `executado:${intencao}`)

    const variosCasos = await testarHelperIntencao({
      intencao,
      resultadoSelecao: null
    })
    assert.equal(variosCasos.chamadasSelecao.length, 1)
    assert.equal(variosCasos.chamadasExecucao.length, 0)
    assert.equal(variosCasos.resultado.texto, null)
    assert.equal(variosCasos.resultado.opcoes, null)
  }

  const intencaoNaoRelacionada = await testarHelperIntencao({
    intencao: "urgente"
  })
  assert.equal(intencaoNaoRelacionada.chamadasSelecao.length, 0)
  assert.equal(intencaoNaoRelacionada.chamadasExecucao.length, 1)

  const caminhoAudio = trecho(
    "const intencaoAudio = detectarIntencaoCliente(trans)",
    "if (pareceNovaSituacaoCliente(trans))",
    audioSource
  )
  assert.match(
    caminhoAudio,
    /executarIntencaoDetectadaCliente\(from, u, intencaoAudio, trans\)/
  )
  assert.doesNotMatch(
    caminhoAudio,
    /executarIntencaoCliente\(from, u, intencaoAudio, trans\)/
  )

  const caminhoTexto = trecho(
    "const intencaoTexto = detectarIntencaoCliente(text)",
    "if (text && !ehMensagemEntradaGlobal"
  )
  assert.match(
    caminhoTexto,
    /executarIntencaoDetectadaCliente\(from, u, intencaoTexto, text\)/
  )
  assert.doesNotMatch(
    caminhoTexto,
    /executarIntencaoCliente\(from, u, intencaoTexto, text\)/
  )

  const botoesCliente = trecho(
    'if (text === "m_status")',
    'if (text === "dir_agendar")'
  )
  for (const [botao, acao] of [
    ["m_status", "status"],
    ["m_docs", "documentos"],
    ["m_adv", "advogado"]
  ]) {
    assert.match(botoesCliente, new RegExp(`text === "${botao}"`))
    assert.match(
      botoesCliente,
      new RegExp(`abrirSelecaoCasoParaAcao\\(from, u, "${acao}"\\)`)
    )
  }

  assert.match(source, /const ultimosCliquesStatus = new Map\(\)/)
  assert.match(source, /const ultimosCliquesMenuCliente = new Map\(\)/)
  assert.match(source, /fila\.some\(item => item\.text === "m_status"\) \|\| agora - ultimoClique < 15000/)
  assert.match(source, /fila\.some\(item => item\.text === "m_inicio"\) \|\| agora - ultimoClique < 15000/)
  const statusCliente = trecho(
    "async function telaStatusCliente",
    "async function telaConfirmarCancelamentoConsultaCliente"
  )
  assert.match(statusCliente, /\{ audioAutomatico: false, semAudioResposta: true \}/)
  assert.match(statusCliente, /void enviarAudioModoVoz\(from, u, gerarAudioDaTela\(telaStatus\), "status cliente"\)/)
}

executarTestesSelecaoCaso()
  .then(() => console.log("whatsapp-flow-ux.test.js: ok"))
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
