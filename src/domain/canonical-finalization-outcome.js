function interpretarResultadoFinalizacaoCanonica(canonicalResult = null) {
  const result = canonicalResult?.result || {}
  const partialResources = result.partialResources || {}
  const hasPartialWrites = result.hasPartialWrites === true

  return {
    completed: result.completed === true,
    error: result.error || null,
    code: result.code || null,
    interruptedStep: result.interruptedStep || null,
    hasPartialWrites,
    partialResources,
    planHash: result.planHash || null,
    fallbackAllowed: result.completed !== true && !hasPartialWrites
  }
}

module.exports = { interpretarResultadoFinalizacaoCanonica }
