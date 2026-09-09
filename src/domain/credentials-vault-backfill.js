"use strict"

function planejarCofresCasosAtivos(negocios = [], finalStage) {
  const unicos = new Map()
  for (const negocio of negocios || []) {
    const id = String(negocio?.id || "").trim()
    const props = negocio?.properties || {}
    const numeroCaso = String(props.numero_de_caso || "").trim()
    const stage = String(props.dealstage || "").trim()
    if (!id || !numeroCaso || !stage || stage === String(finalStage || "")) continue
    unicos.set(id, negocio)
  }
  return [...unicos.values()]
}

module.exports = { planejarCofresCasosAtivos }
