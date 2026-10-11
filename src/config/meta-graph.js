"use strict"

const DEFAULT_META_GRAPH_VERSION = "v23.0"
const MINIMUM_META_GRAPH_MAJOR = 23

function normalizarMetaGraphVersion(value) {
  const version = String(value || "").trim()
  if (!/^v?\d+\.\d+$/.test(version)) return DEFAULT_META_GRAPH_VERSION
  const normalized = version.startsWith("v") ? version : `v${version}`
  const major = Number(normalized.slice(1).split(".")[0])
  return major >= MINIMUM_META_GRAPH_MAJOR ? normalized : DEFAULT_META_GRAPH_VERSION
}

const META_GRAPH_VERSION = normalizarMetaGraphVersion(process.env.META_GRAPH_VERSION)
const META_GRAPH_BASE_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`

function metaGraphUrl(resource = "") {
  return `${META_GRAPH_BASE_URL}/${String(resource).replace(/^\/+/, "")}`
}

module.exports = {
  DEFAULT_META_GRAPH_VERSION,
  MINIMUM_META_GRAPH_MAJOR,
  META_GRAPH_VERSION,
  META_GRAPH_BASE_URL,
  normalizarMetaGraphVersion,
  metaGraphUrl
}
