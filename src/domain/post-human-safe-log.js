"use strict"

function sanitizeSensitive(value) {
  let text = String(value ?? "")
  text = text.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "***.***.***-**")
  text = text.replace(/\b(?:\+?55)?\s?\(?\d{2}\)?\s?9?\d{4}[- ]?\d{4}\b/g, "[telefone-mascarado]")
  text = text.replace(/(authorization|token|secret|password|api[_-]?key)\s*[:=]\s*\S+/gi, "$1=[mascarado]")
  return text.slice(0, 1000)
}

function sanitizeObject(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value
  if (typeof value !== "object") return sanitizeSensitive(value)
  if (seen.has(value)) return "[circular]"
  seen.add(value)
  if (Array.isArray(value)) return value.map(item => sanitizeObject(item, seen))
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    /authorization|token|secret|password|api[_-]?key/i.test(key) ? "[mascarado]" : sanitizeObject(item, seen)
  ]))
}

function sanitizeError(error) {
  return sanitizeSensitive(error?.message || error || "erro desconhecido")
}

function safeCycleLog(event, cycleId, extras = {}) {
  return {
    event: sanitizeSensitive(event),
    cycleId: sanitizeSensitive(cycleId),
    ...sanitizeObject(extras)
  }
}

module.exports = { sanitizeSensitive, sanitizeObject, sanitizeError, safeCycleLog }
