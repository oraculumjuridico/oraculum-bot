require("dotenv").config({ quiet: true })

const fs = require("node:fs")
const path = require("node:path")
const axios = require("axios")

const ROOT = path.join(__dirname, "..")
const USERS_STATE_FILE = path.join(ROOT, "data", "users-state.json")

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "")
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function parseSnapshot(value) {
  if (value && typeof value === "object") return value
  try {
    const parsed = JSON.parse(value || "{}")
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return { _invalid: true }
  }
}

function associatedContactIds(deal) {
  return (deal?.associations?.contacts?.results || [])
    .map(item => String(item.id || ""))
    .filter(Boolean)
}

function isThirdPartyState(state = {}) {
  return state.atendimentoParaTerceiro === true ||
    state._novoCasoParaTerceiro === true ||
    state.telefoneEhDoCliente === false ||
    Boolean(state.relacaoComAtendido) ||
    (
      Boolean(normalizeName(state.nomeContato)) &&
      Boolean(normalizeName(state.nome)) &&
      normalizeName(state.nomeContato) !== normalizeName(state.nome)
    )
}

function isRepresentationState(state = {}) {
  if (!isThirdPartyState(state)) return false
  return Boolean(
    state.relacaoComAtendido ||
    state.nomeContato ||
    state._casoAnteriorCliente ||
    state.papelContato === "representante"
  )
}

function hasUnclearContactIdentity(contact = {}) {
  const name = normalizeName(contact.properties?.firstname)
  const phone = normalizePhone(contact.properties?.phone)
  return !name ||
    !phone ||
    ["lead whatsapp", "cliente", "voce", "contato", "lead indicado"].includes(name)
}

function indexesFromInputs(deals, sessions) {
  const cases = []
  for (const deal of deals) {
    cases.push({
      source: "hubspot_deal",
      id: String(deal.id || ""),
      state: parseSnapshot(deal.properties?.estado_bot_snapshot),
      contactIds: associatedContactIds(deal)
    })
  }
  for (const [key, state] of Object.entries(sessions || {})) {
    cases.push({
      source: "local_session",
      id: String(state?.negocioId || `session:${key}`),
      state: state || {},
      contactIds: state?.contatoId ? [String(state.contatoId)] : []
    })
  }
  return cases
}

function analyzeIdentityImpact({
  contacts = [],
  deals = [],
  sessions = {},
  calendarEvents = []
} = {}) {
  const cases = indexesFromInputs(deals, sessions)
  const thirdPartyCases = new Set()
  const representations = new Set()
  const unclearContacts = new Set(
    contacts.filter(hasUnclearContactIdentity).map(contact => String(contact.id))
  )
  const dealStates = new Map()

  for (const item of cases) {
    if (!item.id) continue
    if (!dealStates.has(item.id) || item.source === "hubspot_deal") {
      dealStates.set(item.id, item.state)
    }
    if (isThirdPartyState(item.state)) thirdPartyCases.add(item.id)
    if (isRepresentationState(item.state)) representations.add(item.id)

    if (isThirdPartyState(item.state)) {
      const originPhone = normalizePhone(item.state._numero)
      const attendedPhone = normalizePhone(item.state.whatsappContato)
      const phoneDiffersFromAttended = originPhone && attendedPhone && originPhone !== attendedPhone
      if (phoneDiffersFromAttended || item.state.telefoneEhDoCliente === false) {
        for (const contactId of item.contactIds) unclearContacts.add(contactId)
      }
    }
  }

  let aliasedPersonReferences = 0
  for (const event of calendarEvents) {
    const metadata = event.extendedProperties?.private || event.metadata || {}
    const dealId = String(metadata.dealId || "")
    const personId = String(metadata.personId || "")
    const contactId = String(metadata.contactId || "")
    const relatedState = dealStates.get(dealId) || {}
    if (
      !personId ||
      (personId === contactId && isThirdPartyState(relatedState))
    ) {
      aliasedPersonReferences += 1
      if (contactId) unclearContacts.add(contactId)
    }
  }

  const casesAffected = new Set([...thirdPartyCases, ...representations]).size
  const contactsAffected = unclearContacts.size
  const affectedRatio = contacts.length
    ? contactsAffected / contacts.length
    : 0
  const level = casesAffected === 0 && contactsAffected === 0 && aliasedPersonReferences === 0
    ? "NONE"
    : affectedRatio >= 0.25 || aliasedPersonReferences > 0
      ? "HIGH"
      : "MEDIUM"

  return {
    totalContacts: contacts.length,
    suspectedThirdPartyCases: thirdPartyCases.size,
    suspectedRepresentations: representations.size,
    contactsWithoutClearPerson: contactsAffected,
    estimatedMigrationImpact: {
      level,
      contactsRequiringReview: contactsAffected,
      casesRequiringReview: casesAffected,
      aliasedPersonReferences,
      evidenceCoverage: {
        hubspotContacts: contacts.length,
        hubspotDeals: deals.length,
        localSessions: Object.keys(sessions || {}).length,
        calendarEvents: calendarEvents.length
      }
    }
  }
}

async function listHubSpotObjects(objectType, properties, token) {
  const records = []
  let after = null
  do {
    const response = await axios.get(
      `https://api.hubapi.com/crm/v3/objects/${objectType}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          limit: 100,
          archived: false,
          properties: properties.join(","),
          ...(objectType === "deals" ? { associations: "contacts" } : {}),
          ...(after ? { after } : {})
        }
      }
    )
    records.push(...(response.data?.results || []))
    after = response.data?.paging?.next?.after || null
  } while (after)
  return records
}

function readLocalSessions(file = USERS_STATE_FILE) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"))?.users || {}
  } catch {
    return {}
  }
}

function readCalendarExport(file = process.env.CRM_IDENTITY_CALENDAR_EXPORT) {
  if (!file) return []
  const resolved = path.resolve(ROOT, file)
  const parsed = JSON.parse(fs.readFileSync(resolved, "utf8"))
  return Array.isArray(parsed) ? parsed : (parsed.events || [])
}

async function collectCurrentIdentityImpact({
  token = process.env.HUBSPOT_TOKEN
} = {}) {
  if (!token) throw new Error("HUBSPOT_TOKEN ausente para analise read-only")
  const [contacts, deals] = await Promise.all([
    listHubSpotObjects("contacts", ["firstname", "phone"], token),
    listHubSpotObjects("deals", ["estado_bot_snapshot", "numero_de_caso"], token)
  ])
  return analyzeIdentityImpact({
    contacts,
    deals,
    sessions: readLocalSessions(),
    calendarEvents: readCalendarExport()
  })
}

if (require.main === module) {
  collectCurrentIdentityImpact()
    .then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch(error => {
      process.stderr.write(`${JSON.stringify({
        mode: "READ_ONLY",
        error: error.response?.data?.message || error.message
      })}\n`)
      process.exitCode = 1
    })
}

module.exports = {
  normalizePhone,
  normalizeName,
  parseSnapshot,
  associatedContactIds,
  isThirdPartyState,
  isRepresentationState,
  hasUnclearContactIdentity,
  analyzeIdentityImpact,
  listHubSpotObjects,
  readLocalSessions,
  readCalendarExport,
  collectCurrentIdentityImpact
}
