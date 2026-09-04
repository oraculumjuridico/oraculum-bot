"use strict"

async function resolverContatoExistenteComCaso(resultadoBusca, buscarNegocios) {
  if (resultadoBusca?.status !== "ambiguous") {
    return { contato: resultadoBusca?.contato || null, negocios: null, seguro: true }
  }

  const candidatosComCaso = []
  for (const contato of resultadoBusca.contatos || []) {
    const negocios = await buscarNegocios(contato.id)
    if (negocios?.casosOficiais?.length) candidatosComCaso.push({ contato, negocios })
  }

  if (candidatosComCaso.length !== 1) {
    return { contato: null, negocios: null, seguro: false }
  }
  return { ...candidatosComCaso[0], seguro: true }
}

module.exports = { resolverContatoExistenteComCaso }
