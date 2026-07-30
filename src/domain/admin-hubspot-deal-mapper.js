"use strict"

function mapearNegociosHubSpotAdmin(data = {}) {
  const results = Array.isArray(data.results) ? data.results : []
  return results.map(negocio => ({
    id: negocio.id,
    stageId: negocio.properties?.dealstage || null,
    createdate: negocio.properties?.createdate || null,
    properties: { ...(negocio.properties || {}) }
  }))
}

module.exports = { mapearNegociosHubSpotAdmin }
