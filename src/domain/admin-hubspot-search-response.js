"use strict"

function inspecionarRespostaBuscaHubSpotAdmin(response = {}) {
  const data = response?.data
  const resultsIsArray = Array.isArray(data?.results)
  const rawResultCount = resultsIsArray ? data.results.length : null
  const total = Number.isFinite(Number(data?.total)) ? Number(data.total) : null
  const hasPaging = Boolean(data?.paging?.next?.after)
  const metadata = {
    httpStatus: Number.isFinite(Number(response?.status)) ? Number(response.status) : null,
    resultsIsArray,
    rawResultCount,
    total,
    hasPaging
  }

  if (!data || typeof data !== "object" || !resultsIsArray) {
    return { ok: false, reason: "invalid_hubspot_response", metadata }
  }

  return { ok: true, reason: null, metadata }
}

module.exports = { inspecionarRespostaBuscaHubSpotAdmin }
