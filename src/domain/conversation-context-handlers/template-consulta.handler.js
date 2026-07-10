const TIPO_CONTEXTO = "template_consulta"

async function processar() {
  return {
    consumiu: false,
    seguirFluxoNormal: true
  }
}

module.exports = {
  tipo: TIPO_CONTEXTO,
  processar
}
