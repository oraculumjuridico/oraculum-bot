const { limparContextoConversa } = require("../conversation-context")

const TIPO_CONTEXTO = "template_reengajamento"

async function processar({ usuario } = {}) {
  limparContextoConversa(usuario)

  return {
    consumiu: true,
    seguirFluxoNormal: true,
    resposta: null
  }
}

module.exports = {
  tipo: TIPO_CONTEXTO,
  processar
}
