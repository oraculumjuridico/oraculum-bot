const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { enviarAudioPedidoDocumentos } = require("../src/domain/admin-document-request-audio")

async function executar({ dentroJanela24h = true, preference = "audio_sempre", falharAudio = false } = {}) {
  const chamadas = { gerar: 0, enviar: 0, logs: [], erros: [] }
  const enviado = await enviarAudioPedidoDocumentos({
    dentroJanela24h,
    usuario: { atendente: "Lia", communicationPreference: { preference } },
    from: "5511999999999",
    texto: "Documentos pendentes: identidade e comprovante de residencia.",
    deveEnviarAudioAutomatico: () => preference === "audio_sempre",
    gerarAudioAtendente: async () => {
      chamadas.gerar += 1
      if (falharAudio) throw new Error("tts indisponivel")
      return "pedido.ogg"
    },
    urlAudioAtendente: arquivo => `https://audio.invalid/${arquivo}`,
    enviarAudio: async () => { chamadas.enviar += 1 },
    logInfo: evento => chamadas.logs.push(evento),
    logErro: (...args) => chamadas.erros.push(args)
  })
  return { enviado, chamadas }
}

;(async () => {
  for (const preference of ["texto", "nao_definido"]) {
    const { enviado, chamadas } = await executar({ preference })
    assert.equal(enviado, false)
    assert.equal(chamadas.enviar, 0)
  }

  const permitido = await executar()
  assert.equal(permitido.enviado, true)
  assert.equal(permitido.chamadas.gerar, 1)
  assert.equal(permitido.chamadas.enviar, 1)

  const foraJanela = await executar({ dentroJanela24h: false })
  assert.equal(foraJanela.enviado, false)
  assert.equal(foraJanela.chamadas.enviar, 0)

  const falha = await executar({ falharAudio: true })
  assert.equal(falha.enviado, false)
  assert.equal(falha.chamadas.enviar, 0)
  assert.equal(falha.chamadas.erros.length, 1)

  const primeira = await executar()
  const segunda = await executar()
  assert.equal(primeira.chamadas.enviar, 1)
  assert.equal(segunda.chamadas.enviar, 1)

  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
  const inicioHandler = server.indexOf("async function pedirDocsCasoAdmin")
  const fimHandler = server.indexOf("async function", inicioHandler + 1)
  const handler = server.slice(inicioHandler, fimHandler)
  assert.match(server, /const envioDocumentos = await templateService\.atualizacaoCasoSegura/)
  assert.match(server, /const enviadoCliente = envioDocumentos\.sent[\s\S]*?if \(enviadoCliente\) \{[\s\S]*?await enviarAudioPedidoDocumentos\(/)
  assert.match(server, /dentroJanela24h: templateService\.conversaDentroJanela24h\(u\.ultimaMsg\)/)
  assert.match(server, /deveEnviarAudioAutomatico,\s*gerarAudioAtendente,\s*urlAudioAtendente,\s*enviarAudio/)
  assert.match(server, /from: destino/)
  assert.match(server, /usuario: u/)
  assert.doesNotMatch(handler, /u\.modoTexto/)
  assert.doesNotMatch(handler, /deveForcarAudioPreModo/)
  assert.doesNotMatch(handler, /ACOLHIMENTO_MODO|ACOLHIMENTO_PARA_QUEM/)

  const migrationSource = server.indexOf("function definirPreferenciaComunicacao")
  assert.ok(migrationSource > 0, "definirPreferenciaComunicacao deve existir")
  assert.match(server, /"migracao_legado"/)
  assert.match(server, /record\.source !== "migracao_legado" && Boolean\(record\.selectedAt\)/)

  console.log("admin-document-request-audio.test.js: ok")
})().catch(error => { console.error(error); process.exitCode = 1 })
