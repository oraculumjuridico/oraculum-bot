const {
  createCaseParty
} = require("./case-party")
const {
  normalizeRoleToken,
  DEFAULT_CASE_PARTY_ROLE_REGISTRY
} = require("./case-party-role-registry")
const {
  DEFAULT_CASE_PARTY_CONTEXT_RESOLVER,
  resolveCasePartyContext,
  resolveCasePartyContextWithTrace
} = require("./case-party-context-resolver")
const {
  auditEnabled,
  createDecisionTrace,
  attachDecisionTrace
} = require("./case-party-decision-trace")
const {
  resolveStableDecision
} = require("./case-party-resolution-stability")

const LEGACY_ROLE_MAP = Object.freeze(
  Object.fromEntries([
    "atendido",
    "pessoa_atendida",
    "assistido",
    "solicitante",
    "indicante",
    "representante",
    "cliente",
    "cliente_contratante",
    "responsavel_financeiro",
    "contato_autorizado",
    "terceiro_interessado"
  ].map(alias => [alias, DEFAULT_CASE_PARTY_ROLE_REGISTRY.resolve(alias)]))
)

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "")
}

function normalizeLegacyRole(value) {
  return normalizeRoleToken(value).toLowerCase()
}

function contactIdentity(contact = {}) {
  return {
    contactId: String(contact.id || contact.contactId || contact.contatoId || "").trim(),
    phone: normalizePhone(contact.properties?.phone || contact.phone || contact.telefone)
  }
}

function caseIdentity(caseContext = {}) {
  return String(
    caseContext.caseId ||
    caseContext.dealId ||
    caseContext.negocioId ||
    caseContext.id ||
    caseContext.numeroCaso ||
    ""
  ).trim()
}

function legacyState(caseContext = {}) {
  return caseContext.state ||
    caseContext.snapshot ||
    caseContext.session ||
    caseContext
}

function buildResolutionContext(
  contact = {},
  caseContext = {},
  roleRegistry = DEFAULT_CASE_PARTY_ROLE_REGISTRY
) {
  const state = legacyState(caseContext)
  const identity = contactIdentity(contact)
  const attendedContactId = String(
    caseContext.assistedContactId ||
    caseContext.metadata?.assistedContactId ||
    state.assistedContactId ||
    ""
  ).trim()
  const actorContactId = String(
    caseContext.actorContactId ||
    caseContext.metadata?.actorContactId ||
    state.actorContactId ||
    ""
  ).trim()
  const attendedPhone = normalizePhone(
    caseContext.assistedPhone ||
    caseContext.metadata?.assistedPhone ||
    state.whatsappContato
  )
  const actorPhone = normalizePhone(
    caseContext.actorPhone ||
    caseContext.metadata?.actorPhone ||
    state._numero ||
    state.from
  )
  return {
    contact: identity,
    state,
    caseContext,
    roleRegistry,
    thirdParty: state.atendimentoParaTerceiro === true ||
      state._novoCasoParaTerceiro === true ||
      state.telefoneEhDoCliente === false,
    matches: {
      assistedContact: Boolean(
        identity.contactId &&
        attendedContactId &&
        identity.contactId === attendedContactId
      ),
      assistedPhone: Boolean(
        identity.phone &&
        attendedPhone &&
        identity.phone === attendedPhone
      ),
      actorContact: Boolean(
        identity.contactId &&
        actorContactId &&
        identity.contactId === actorContactId
      ),
      actorPhone: Boolean(
        identity.phone &&
        actorPhone &&
        identity.phone === actorPhone
      )
    },
    normalizeRoleToken
  }
}

function explicitAttributions(
  caseContext = {},
  roleRegistry = DEFAULT_CASE_PARTY_ROLE_REGISTRY
) {
  const resolutionContext = buildResolutionContext({}, caseContext, roleRegistry)
  return DEFAULT_CASE_PARTY_CONTEXT_RESOLVER.rules[0]({
    ...resolutionContext,
    existingRoles: new Set()
  })
}

function deriveContactRoleAttributions(
  contact = {},
  caseContext = {},
  {
    roleRegistry = DEFAULT_CASE_PARTY_ROLE_REGISTRY,
    contextResolver = DEFAULT_CASE_PARTY_CONTEXT_RESOLVER
  } = {}
) {
  const context = buildResolutionContext(contact, caseContext, roleRegistry)
  return resolveCasePartyContext({
    ...context,
    resolver: contextResolver
  })
}

function mapContactToCaseParty({
  contact,
  caseContext = {},
  roleRegistry = DEFAULT_CASE_PARTY_ROLE_REGISTRY,
  contextResolver = DEFAULT_CASE_PARTY_CONTEXT_RESOLVER,
  auditMode = false,
  stabilityMode = false
}) {
  const identity = contactIdentity(contact)
  const state = legacyState(caseContext)
  const resolutionContext = buildResolutionContext(contact, caseContext, roleRegistry)
  const resolved = resolveStableDecision({
    stabilityMode,
    fingerprintInput: {
      contact,
      caseContext,
      roleRegistry,
      contextResolver,
      auditEnabled: auditEnabled(auditMode)
    },
    resolve: () => auditEnabled(auditMode)
      ? resolveCasePartyContextWithTrace({
          ...resolutionContext,
          resolver: contextResolver
        })
      : {
          attributions: contextResolver.resolve(resolutionContext),
          appliedRules: [],
          appliedResolvers: []
        }
  })
  const resolution = resolved.resolution
  const caseParty = createCaseParty({
    caseId: caseIdentity(caseContext),
    contactId: identity.contactId,
    roleAttributions: resolution.attributions,
    relationship: state.relacaoComAtendido
      ? {
          declaredType: state.relacaoComAtendido,
          source: "legacy.relacaoComAtendido"
        }
      : null,
    roleRegistry
  })
  if (!auditEnabled(auditMode)) return caseParty
  const trace = createDecisionTrace({
    caseParty,
    resolutionContext,
    appliedRules: resolution.appliedRules,
    appliedResolvers: resolution.appliedResolvers,
    stability: resolved.stability
  })
  return attachDecisionTrace(caseParty, trace, auditMode)
}

module.exports = {
  LEGACY_ROLE_MAP,
  normalizePhone,
  normalizeLegacyRole,
  contactIdentity,
  caseIdentity,
  legacyState,
  buildResolutionContext,
  explicitAttributions,
  deriveContactRoleAttributions,
  mapContactToCaseParty
}
