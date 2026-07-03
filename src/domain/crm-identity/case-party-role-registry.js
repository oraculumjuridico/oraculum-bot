const DEFAULT_ROLE_DEFINITIONS = Object.freeze([
  {
    role: "ASSISTED_PERSON",
    aliases: ["atendido", "pessoa_atendida", "assistido"],
    priority: 100
  },
  {
    role: "REQUESTER",
    aliases: ["solicitante", "indicante"],
    priority: 80
  },
  {
    role: "REPRESENTATIVE",
    aliases: ["representante"],
    priority: 70
  },
  {
    role: "CLIENT",
    aliases: ["cliente", "cliente_contratante"],
    priority: 60
  },
  {
    role: "FINANCIAL_RESPONSIBLE",
    aliases: ["responsavel_financeiro"],
    priority: 50
  },
  {
    role: "AUTHORIZED_CONTACT",
    aliases: ["contato_autorizado"],
    priority: 40
  },
  {
    role: "INTERESTED_THIRD_PARTY",
    aliases: ["terceiro_interessado"],
    priority: 30
  }
])

function normalizeRoleToken(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function normalizeRoleDefinition(definition) {
  const input = typeof definition === "string"
    ? { role: definition }
    : definition || {}
  const role = normalizeRoleToken(input.role)
  if (!role || role === "UNCLASSIFIED") {
    throw new Error(`definicao de papel invalida: ${input.role || "-"}`)
  }
  const aliases = [...new Set(
    [role, ...(input.aliases || [])]
      .map(normalizeRoleToken)
      .filter(Boolean)
  )]
  return Object.freeze({
    role,
    aliases: Object.freeze(aliases),
    priority: Number.isFinite(Number(input.priority))
      ? Number(input.priority)
      : 0
  })
}

function createCasePartyRoleRegistry({
  definitions = DEFAULT_ROLE_DEFINITIONS
} = {}) {
  const normalized = definitions.map(normalizeRoleDefinition)
  const byRole = new Map()
  const byAlias = new Map()
  for (const definition of normalized) {
    if (byRole.has(definition.role)) {
      throw new Error(`papel duplicado no registry: ${definition.role}`)
    }
    byRole.set(definition.role, definition)
    for (const alias of definition.aliases) {
      if (byAlias.has(alias) && byAlias.get(alias) !== definition.role) {
        throw new Error(`alias de papel duplicado no registry: ${alias}`)
      }
      byAlias.set(alias, definition.role)
    }
  }

  return Object.freeze({
    roles: Object.freeze([...byRole.keys()]),
    has(role) {
      return byRole.has(normalizeRoleToken(role))
    },
    resolve(value) {
      return byAlias.get(normalizeRoleToken(value)) || null
    },
    definition(role) {
      return byRole.get(normalizeRoleToken(role)) || null
    },
    priority(role) {
      return byRole.get(normalizeRoleToken(role))?.priority ?? 0
    },
    extend(additionalDefinitions = []) {
      return createCasePartyRoleRegistry({
        definitions: [...normalized, ...additionalDefinitions]
      })
    }
  })
}

const DEFAULT_CASE_PARTY_ROLE_REGISTRY = createCasePartyRoleRegistry()

module.exports = {
  DEFAULT_ROLE_DEFINITIONS,
  normalizeRoleToken,
  normalizeRoleDefinition,
  createCasePartyRoleRegistry,
  DEFAULT_CASE_PARTY_ROLE_REGISTRY
}
