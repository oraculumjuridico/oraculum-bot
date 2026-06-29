const {
  criarTela,
  gerarBotoesDaTela: gerarBotoes,
  gerarAudioDaTela: gerarAudio
} = require("./declarative-screen")

// Toda nova UI do cliente deve entrar por createClientScreen().
// Chamadas imperativas existentes são legado e não devem ser replicadas.
const CLIENT_SCREEN_MARKER = Symbol("oraculum.client-screen")

function warningEnabled() {
  return process.env.NODE_ENV !== "production"
}

function warn(message, logger = console) {
  if (!warningEnabled()) return
  const output = typeof logger?.warn === "function" ? logger.warn.bind(logger) : console.warn
  output(`[declarative-screen] ${message}`)
}

function createClientScreen(definition = {}, options = {}) {
  if (!Array.isArray(definition.acoes)) {
    warn(`Tela "${definition.id || "sem-id"}" criada sem acoes[].`, options.logger)
  }

  const tela = criarTela(definition)
  Object.defineProperty(tela, CLIENT_SCREEN_MARKER, {
    value: true,
    enumerable: false
  })
  return tela
}

function isClientScreen(tela) {
  return Boolean(tela?.[CLIENT_SCREEN_MARKER] && Array.isArray(tela.acoes))
}

function validateClientScreen(tela, options = {}) {
  if (!isClientScreen(tela)) {
    warn(
      `Tela "${tela?.id || "sem-id"}" não foi criada por createClientScreen(). Uso tratado como LEGACY.`,
      options.logger
    )
    return false
  }
  return true
}

function gerarBotoesDaTela(tela, options = {}) {
  validateClientScreen(tela, options)
  return gerarBotoes(tela)
}

function gerarAudioDaTela(tela, options = {}) {
  validateClientScreen(tela, options)
  return gerarAudio(tela)
}

module.exports = {
  createClientScreen,
  isClientScreen,
  validateClientScreen,
  gerarBotoesDaTela,
  gerarAudioDaTela
}
