"use strict"

const fs = require("fs")
const path = require("path")

const SCHEMA_VERSION = 1
const PREFERENCES = new Set(["nao_definido", "texto", "audio_sempre"])
const SOURCES = new Set(["pre_atendimento", "admin_manual", "migracao_legado"])

function clean(value) { return String(value || "").trim() || null }
function normalizePhone(value) { const digits = String(value || "").replace(/\D/g, ""); return digits || null }
function normalizePreference(value) { return PREFERENCES.has(value) ? value : "nao_definido" }
function normalizeSource(value) { return SOURCES.has(value) ? value : "migracao_legado" }

function normalizeRecord(value = {}) {
  const preference = normalizePreference(value.preference)
  const source = normalizeSource(value.source)
  const selectedAt = clean(value.selectedAt) || null
  const updatedAt = clean(value.updatedAt) || selectedAt || null
  return {
    preference, source, selectedAt, updatedAt,
    contactId: clean(value.contactId), phoneNormalized: normalizePhone(value.phoneNormalized)
  }
}

function legacyPreference(modoTexto) {
  return modoTexto === true ? "texto" : "nao_definido"
}

function projectLegacyMode(record, previous) {
  if (record?.preference === "texto") return true
  if (record?.preference === "audio_sempre") return false
  return previous
}

function createCommunicationPreferences({ dataDir, writeJsonAtomically, mirrorStateFile = () => Promise.resolve() } = {}) {
  const file = path.join(dataDir || "", "communication-preferences.json")
  let state = { schemaVersion: SCHEMA_VERSION, byContactId: {}, byPhone: {} }

  function normalizeState(raw = {}) {
    const next = { schemaVersion: SCHEMA_VERSION, byContactId: {}, byPhone: {} }
    for (const [key, value] of Object.entries(raw.byContactId || {})) {
      const record = normalizeRecord({ ...value, contactId: value?.contactId || key })
      if (record.contactId) next.byContactId[record.contactId] = record
    }
    for (const [key, value] of Object.entries(raw.byPhone || {})) {
      const record = normalizeRecord({ ...value, phoneNormalized: value?.phoneNormalized || key })
      if (record.phoneNormalized && !record.contactId) next.byPhone[record.phoneNormalized] = record
    }
    return next
  }

  function persist() {
    if (typeof writeJsonAtomically !== "function") throw new Error("communication_preferences_writer_missing")
    writeJsonAtomically(file, state)
    return state
  }

  function load() {
    if (!fs.existsSync(file)) return state
    try { state = normalizeState(JSON.parse(fs.readFileSync(file, "utf8"))); return state }
    catch { state = { schemaVersion: SCHEMA_VERSION, byContactId: {}, byPhone: {} }; return state }
  }

  function resolve({ contactId, phoneNormalized, snapshotPreference, modoTexto } = {}) {
    const id = clean(contactId); const phone = normalizePhone(phoneNormalized)
    if (id && state.byContactId[id]) return state.byContactId[id]
    if (phone && state.byPhone[phone]) return state.byPhone[phone]
    if (snapshotPreference && PREFERENCES.has(snapshotPreference.preference)) return normalizeRecord(snapshotPreference)
    return normalizeRecord({ preference: legacyPreference(modoTexto), source: "migracao_legado" })
  }

  function set({ preference, source, contactId, phoneNormalized, selectedAt } = {}) {
    const now = new Date().toISOString()
    const id = clean(contactId); const phone = normalizePhone(phoneNormalized)
    const existing = id ? state.byContactId[id] : (phone ? state.byPhone[phone] : null)
    const record = normalizeRecord({
      preference, source, contactId: id, phoneNormalized: phone,
      selectedAt: selectedAt || existing?.selectedAt || now, updatedAt: now
    })
    if (id) {
      const recovery = phone ? state.byPhone[phone] : null
      if (!record.selectedAt && recovery?.selectedAt) record.selectedAt = recovery.selectedAt
      state.byContactId[id] = record
      if (phone) delete state.byPhone[phone]
    } else if (phone) state.byPhone[phone] = record
    else throw new Error("communication_preference_identity_required")
    persist()
    return record
  }

  function promote({ contactId, phoneNormalized } = {}) {
    const id = clean(contactId); const phone = normalizePhone(phoneNormalized)
    if (!id || !phone || !state.byPhone[phone]) return id ? state.byContactId[id] || null : null
    const phoneRecord = state.byPhone[phone]
    const existing = state.byContactId[id]
    if (!existing) state.byContactId[id] = normalizeRecord({ ...phoneRecord, contactId: id, phoneNormalized: phone })
    delete state.byPhone[phone]
    persist()
    return state.byContactId[id]
  }

  return { file, load, resolve, set, promote, snapshot: () => JSON.parse(JSON.stringify(state)) }
}

function applyPreferenceToUser(user, record) {
  if (!user || !record) return record
  user.communicationPreference = normalizeRecord(record)
  user.modoTexto = projectLegacyMode(record, user.modoTexto)
  return user.communicationPreference
}

module.exports = { SCHEMA_VERSION, createCommunicationPreferences, normalizeRecord, legacyPreference, projectLegacyMode, applyPreferenceToUser }
