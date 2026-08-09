"use strict"

const { sanitizarTextoEntrada } = require("../utils/text")
const {
  extractInssLegalFacts,
  hasUncertainty,
  sameValue
} = require("./inss-legal-facts")

const BPC_BASE_FIELDS = new Set([
  "bpcRequerenteTipo",
  "bpcDeficiencia",
  "bpcImpedimentoLongoPrazo",
  "bpcComposicaoFamiliar",
  "bpcDespesas",
  "bpcCadUnico",
  "bpcSituacaoAdministrativa"
])

const BPC_SHARED_FIELDS = new Set([
  "beneficio", "dataRequerimento", "motivo", "houvePericia", "dataPericia",
  "protocoloRequerimento", "nb", "cartaDecisaoAdministrativa", "recursoAdministrativo"
])

const MEMBER_FIELD_PREFIX = "bpcDetalhesMembro__"
const CORRECTION_SIGNAL = /\b(corrig\w*|correcao|na verdade|falei errado|informei errado|nao foi)\b/i

function plain(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim()
}

function present(value) {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === "object") return Object.keys(value).length > 0
  return String(value).trim() !== ""
}

function equivalent(left, right) {
  if (left && right && typeof left === "object" && typeof right === "object") {
    return JSON.stringify(left) === JSON.stringify(right)
  }
  return sameValue(left, right)
}

function answer(value, origem = "cliente", status = "confirmado", extra = {}) {
  return { valor: value, status, origem, ...extra }
}

function addFact(facts, field, value, origem, status = "confirmado", extra = {}) {
  if (!isBpcLegalField(field) || !present(value) || Object.prototype.hasOwnProperty.call(facts, field)) return
  facts[field] = answer(value, origem, status, extra)
}

function isBpcCase(input = {}) {
  const source = typeof input === "string"
    ? input
    : [
        input?.beneficio?.valor, input?.tipoCaso?.valor, input?.descricao?.valor,
        input?.situacao?.valor, input?.beneficio, input?.tipoCaso, input?.descricao,
        input?.situacao, input?.subTipo, input?.subtipo
      ].filter(present).join(" ")
  return /\b(bpc|loas|beneficio de prestacao continuada)\b/.test(plain(source))
}

function memberFieldId(memberId) {
  return `${MEMBER_FIELD_PREFIX}${String(memberId || "").replace(/[^a-z0-9_-]/gi, "")}`
}

function memberIdFromField(field) {
  return String(field || "").startsWith(MEMBER_FIELD_PREFIX)
    ? String(field).slice(MEMBER_FIELD_PREFIX.length)
    : null
}

function isBpcLegalField(field) {
  return BPC_BASE_FIELDS.has(field) || BPC_SHARED_FIELDS.has(field) || Boolean(memberIdFromField(field))
}

function normalizeMoney(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null
  const raw = String(value || "").trim().replace(/[.,]+$/, "").replace(/\s+/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".")
  const numeric = Number(raw)
  return Number.isFinite(numeric) ? numeric : null
}

function makeMember({ id, label, relation, applicant = false, sameHousehold = null, minor = false, aliases = [] }) {
  return {
    memberId: id,
    label,
    relation,
    applicant: Boolean(applicant),
    sameHousehold,
    minor: Boolean(minor),
    aliases: [...new Set([label, ...aliases].map(plain).filter(Boolean))],
    age: null,
    workStatus: null,
    incomes: [],
    benefits: []
  }
}

function cloneFamily(previousAnswers = {}) {
  const value = previousAnswers?.bpcComposicaoFamiliar?.valor || previousAnswers?.bpcComposicaoFamiliar
  const members = Array.isArray(value?.members) ? value.members : []
  return { members: members.map(member => ({
    ...member,
    aliases: [...(member.aliases || [])],
    incomes: [...(member.incomes || [])],
    benefits: [...(member.benefits || [])]
  })), unassignedFacts: [...(value?.unassignedFacts || [])] }
}

function upsertMember(family, incoming, { allowAliasMerge = true } = {}) {
  let existing = family.members.find(item => item.memberId === incoming.memberId)
  if (!existing && allowAliasMerge) {
    existing = family.members.find(item => (item.aliases || []).some(alias => incoming.aliases.includes(alias)))
  }
  if (!existing) {
    family.members.push(incoming)
    return incoming
  }
  existing.aliases = [...new Set([...(existing.aliases || []), ...(incoming.aliases || [])])]
  for (const key of ["label", "relation", "age", "workStatus"]) {
    if (!present(existing[key]) && present(incoming[key])) existing[key] = incoming[key]
  }
  if (incoming.sameHousehold === false) existing.sameHousehold = false
  else if (existing.sameHousehold === null && incoming.sameHousehold === true) existing.sameHousehold = true
  existing.applicant ||= incoming.applicant
  existing.minor ||= incoming.minor
  return existing
}

function setIncome(member, income) {
  const key = `${income.type}:${income.amount ?? "none"}:${income.description || ""}`
  if (!(member.incomes || []).some(item => `${item.type}:${item.amount ?? "none"}:${item.description || ""}` === key)) {
    member.incomes = [...(member.incomes || []), income]
  }
}

function setBenefit(member, benefit) {
  const key = plain(`${benefit.type}:${benefit.description || ""}:${benefit.amount ?? ""}`)
  if (!(member.benefits || []).some(item => plain(`${item.type}:${item.description || ""}:${item.amount ?? ""}`) === key)) {
    member.benefits = [...(member.benefits || []), benefit]
  }
}

function inferSubtype(text) {
  const normalized = plain(text)
  if (/\b(meu filho|minha filha|crianca requerente|pedido (?:e|eh) para (?:uma )?crianca|menino requerente|menina requerente|menor requerente)\b/.test(normalized)) return "crianca"
  if (/\b(idoso|idosa|pessoa idosa)\b/.test(normalized)) return "idoso"
  const age = Number(normalized.match(/\b(\d{2,3})\s+anos\b/)?.[1])
  if (age >= 65) return "idoso"
  if (/\b(adulto|adulta|para mim|eu tenho deficiencia|meu bpc)\b/.test(normalized)) return "adulto"
  return null
}

function ensureApplicant(family, subtype) {
  if (family.members.some(member => member.applicant)) return
  if (subtype === "crianca") {
    upsertMember(family, makeMember({ id: "requerente", label: "crianca requerente", relation: "requerente", applicant: true, sameHousehold: true, minor: true }))
  } else if (subtype) {
    upsertMember(family, makeMember({ id: "requerente", label: "requerente", relation: "requerente", applicant: true, sameHousehold: true }))
  }
}

function addCountedMembers(family, count, kind, subtype) {
  for (let index = 1; index <= count; index++) {
    const minor = /filh|irma/.test(kind)
    upsertMember(family, makeMember({
      id: `${kind}_${index}`,
      label: `${kind} ${index}`,
      relation: kind,
      sameHousehold: true,
      minor,
      aliases: [kind]
    }), { allowAliasMerge: false })
  }
  ensureApplicant(family, subtype)
}

const FAMILY_ROLE_DEFINITIONS = Object.freeze([
  { id: "ex_marido", relation: "ex_marido", label: "ex-marido", pattern: /\b(?:meu )?ex-marido\b/, aliases: ["ex-marido"] },
  { id: "ex_esposa", relation: "ex_esposa", label: "ex-esposa", pattern: /\b(?:minha )?ex-esposa\b/, aliases: ["ex-esposa"] },
  { id: "pai_da_crianca", relation: "pai_da_crianca", label: "pai da crianca", pattern: /\b(?:o )?pai (?:da crianca|do meu filho|da minha filha)\b/, aliases: ["pai da crianca", "pai do meu filho", "pai da minha filha"] },
  { id: "mae_da_crianca", relation: "mae_da_crianca", label: "mae da crianca", pattern: /\b(?:a )?mae (?:da crianca|do meu filho|da minha filha)\b/, aliases: ["mae da crianca", "mae do meu filho", "mae da minha filha"] },
  { id: "marido", relation: "marido", label: "marido", pattern: /\b(?:meu |o )?(?:atual )?marido\b/, aliases: ["marido", "marido atual"] },
  { id: "esposa", relation: "esposa", label: "esposa", pattern: /\b(?:minha |a )?(?:atual )?esposa\b/, aliases: ["esposa", "esposa atual"] },
  { id: "companheiro", relation: "companheiro", label: "companheiro", pattern: /\b(?:meu |o )?companheiro\b/, aliases: ["companheiro"] },
  { id: "companheira", relation: "companheira", label: "companheira", pattern: /\b(?:minha |a )?companheira\b/, aliases: ["companheira"] },
  { id: "padrasto", relation: "padrasto", label: "padrasto", pattern: /\b(?:meu |o )?padrasto\b/, aliases: ["padrasto"] },
  { id: "madrasta", relation: "madrasta", label: "madrasta", pattern: /\b(?:minha |a )?madrasta\b/, aliases: ["madrasta"] },
  { id: "mae", relation: "mae", label: "mae", pattern: /\b(?:minha |a )?mae\b/, aliases: ["mae", "minha mae"] },
  { id: "pai", relation: "pai", label: "pai", pattern: /\b(?:meu |o )?pai\b/, aliases: ["pai", "meu pai"] },
  { id: "filho_1", relation: "filho", label: "filho", pattern: /\b(?:meu |nosso |o )?filho\b/, aliases: ["filho", "meu filho", "nosso filho"], minor: true },
  { id: "filha_1", relation: "filha", label: "filha", pattern: /\b(?:minha |nossa |a )?filha\b/, aliases: ["filha", "minha filha", "nossa filha"], minor: true },
  { id: "irmao_1", relation: "irmao", label: "irmao", pattern: /\b(?:meu |o )?irmao\b/, aliases: ["irmao", "meu irmao"] },
  { id: "irma_1", relation: "irma", label: "irma", pattern: /\b(?:minha |a )?irma\b/, aliases: ["irma", "minha irma"] },
  { id: "avo_1", relation: "avo", label: "avo", pattern: /\b(?:meu |o )?avo\b/, aliases: ["avo", "meu avo"] },
  { id: "avo_f_1", relation: "avo", label: "avo", pattern: /\b(?:minha |a )?avo\b/, aliases: ["avo", "minha avo"] },
  { id: "neto_1", relation: "neto", label: "neto", pattern: /\b(?:meu |o )?neto\b/, aliases: ["neto", "meu neto"], minor: true },
  { id: "neta_1", relation: "neta", label: "neta", pattern: /\b(?:minha |a )?neta\b/, aliases: ["neta", "minha neta"], minor: true }
])

const EXTERNAL_RESIDENCE = /\b(nao mora comigo|nao vive comigo|mora (?:em )?outra casa|mora (?:em )?outro endereco|mora sozinho|mora com outra familia|mora ao lado|mora em outra cidade|vive em outra casa|mudou-se|se mudou)\b/
const SHARED_RESIDENCE = /\b(mora comigo|vive comigo|moramos juntos|vivemos juntos|mesma casa|mesmo domicilio|moro com|moramos com|vive na residencia)\b/

function familyClauses(text) {
  return plain(text).split(/(?:[.;]|,?\s+mas\s+)/).map(item => item.trim()).filter(Boolean)
}

function residenceFromClause(clause) {
  if (EXTERNAL_RESIDENCE.test(clause)) return false
  if (SHARED_RESIDENCE.test(clause)) return true
  return null
}

function roleDefinitionsInClause(clause, subtype) {
  return FAMILY_ROLE_DEFINITIONS.filter(definition => {
    if (!definition.pattern.test(clause)) return false
    if (definition.id === "marido" && /\bex-marido\b/.test(clause)) return false
    if (definition.id === "esposa" && /\bex-esposa\b/.test(clause)) return false
    if (definition.id === "pai" && /\bpai (?:da crianca|do meu filho|da minha filha)\b/.test(clause)) return false
    if (definition.id === "mae" && /\bmae (?:da crianca|do meu filho|da minha filha)\b/.test(clause)) return false
    if (subtype === "crianca" && ["filho_1", "filha_1"].includes(definition.id) && /\b(meu filho|minha filha)\b/.test(clause)) return false
    return true
  })
}

function addPendingFamilyFact(family, fact) {
  const key = plain(`${fact.type}:${fact.raw}:${fact.beneficiaryReference || ""}`)
  family.unassignedFacts ||= []
  if (!family.unassignedFacts.some(item => plain(`${item.type}:${item.raw}:${item.beneficiaryReference || ""}`) === key)) {
    family.unassignedFacts.push(fact)
  }
}

function extractFamily(text, { previousAnswers = {}, subtype = null } = {}) {
  const normalized = plain(text)
  const family = cloneFamily(previousAnswers)
  ensureApplicant(family, subtype)
  const childCase = subtype === "crianca" || family.members.some(member => member.applicant && member.minor)
  if (/\b(comigo|eu)\b/.test(normalized) && !EXTERNAL_RESIDENCE.test(normalized)) {
    upsertMember(family, makeMember({
      id: childCase ? "mae" : "requerente",
      label: childCase ? "mae" : "requerente",
      relation: childCase ? "mae" : "requerente",
      applicant: !childCase,
      sameHousehold: true,
      aliases: ["eu", "comigo", childCase ? "mae" : "requerente"]
    }))
  }

  let lastMentionedMembers = []
  for (const clause of familyClauses(text)) {
    const residence = residenceFromClause(clause) ?? (/^(eu,|eu e |somos )/.test(clause) ? true : null)
    const explicitDistinctFather = /\bpai (?:da crianca|do meu filho|da minha filha)\b[^.!?]{0,30}\b(outra pessoa|nao e meu marido|diferente do marido)\b/.test(clause)
    const safeSharedChild = /\b(nosso filho|nossa filha)\b/.test(clause) && !/\b(ex-marido|ex-esposa|padrasto|madrasta|outra pessoa)\b/.test(clause)
    const relevantClause = residence !== null || safeSharedChild || explicitDistinctFather ||
      /\b(ganha|renda|trabalh\w*|desempreg\w*|sem renda|recebe|aposentadoria|pensao|beneficio|\d{1,3} anos)\b/.test(clause)
    if (!relevantClause) continue
    const definitions = roleDefinitionsInClause(clause, subtype)
    const mentionedMembers = []
    for (const definition of definitions) {
      let id = definition.id
      let relation = definition.relation
      let aliases = [...definition.aliases]
      let allowAliasMerge = true
      if (childCase && ["marido", "companheiro"].includes(id)) {
        id = "pai"
        relation = "pai"
        aliases = [...new Set([...aliases, "pai", "pai da crianca"])]
      } else if (childCase && ["esposa", "companheira"].includes(id)) {
        id = "mae"
        relation = "mae"
        aliases = [...new Set([...aliases, "mae", "mae da crianca"])]
      }
      const parentRole = ["pai_da_crianca", "mae_da_crianca"].includes(id)
      if (parentRole) {
        const contextualAlias = id === "pai_da_crianca" ? "pai da crianca" : "mae da crianca"
        const candidates = family.members.filter(member => (member.aliases || []).includes(contextualAlias))
        if (candidates.length === 1 && !explicitDistinctFather && residence !== false) {
          id = candidates[0].memberId
          relation = candidates[0].relation
        } else {
          allowAliasMerge = false
        }
      }
      const member = upsertMember(family, makeMember({
        id,
        label: definition.label,
        relation,
        sameHousehold: residence,
        minor: definition.minor,
        aliases
      }), { allowAliasMerge })
      mentionedMembers.push(member)
      if (parentRole && id === definition.id && !explicitDistinctFather && residence === null &&
          family.members.filter(item => item.sameHousehold === true && !item.minor && !item.applicant).length > 1) {
        member.identityStatus = "precisa_conferir"
      }
    }

    if (!mentionedMembers.length && residence !== null && lastMentionedMembers.length === 1) {
      lastMentionedMembers[0].sameHousehold = residence
    }
    if (mentionedMembers.length) lastMentionedMembers = [...new Set(mentionedMembers)]

    if (safeSharedChild) {
      const spouse = family.members.filter(member => ["marido", "companheiro", "esposa", "companheira"].includes(member.relation) && member.sameHousehold === true)
      if (spouse.length === 1) {
        const alias = ["marido", "companheiro"].includes(spouse[0].relation) ? "pai da crianca" : "mae da crianca"
        spouse[0].aliases = [...new Set([...(spouse[0].aliases || []), alias])]
      }
    }
  }

  const numberWords = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5 }
  for (const match of normalized.matchAll(/\b(\d+|um|uma|dois|duas|tres|quatro|cinco)\s+(filhos?|filhas?|irmaos?|irmas?)\b/g)) {
    const count = Number(match[1]) || numberWords[match[1]] || 1
    const kind = match[2].startsWith("filh") ? "filho" : "irmao"
    addCountedMembers(family, count, kind, subtype)
  }
  return family
}

function findMemberForReference(family, text, expectedMemberId = null) {
  if (expectedMemberId) return family.members.find(member => member.memberId === expectedMemberId) || null
  const normalized = plain(text)
  const direct = family.members.filter(member => (member.aliases || []).some(alias => alias && new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(normalized)))
  if (direct.length === 1) return direct[0]
  if (direct.length > 1) {
    const nonApplicants = direct.filter(member => !member.applicant)
    if (nonApplicants.length === 1) return nonApplicants[0]
    const factAt = normalized.search(/\b(ganha|renda|trabalh\w*|desempreg\w*|recebe|aposentadoria|pensao|beneficio)\b/)
    if (factAt >= 0) {
      const ranked = direct.map(member => ({
        member,
        at: Math.max(...(member.aliases || []).map(alias => normalized.lastIndexOf(alias, factAt)))
      })).filter(item => item.at >= 0).sort((left, right) => right.at - left.at)
      if (ranked.length && (ranked.length === 1 || ranked[0].at > ranked[1].at)) return ranked[0].member
    }
  }
  if (/\b(ele|ela)\b/.test(normalized)) {
    const adults = family.members.filter(member => member.sameHousehold === true && !member.minor && !member.applicant)
    if (adults.length === 1) return adults[0]
  }
  return null
}

function applyWorkAndIncome(text, family, expectedMemberId = null) {
  const normalized = plain(text)
  let members = []
  const selected = findMemberForReference(family, text, expectedMemberId)
  if (selected) members = [selected]
  if (!members.length && /\b(filhos|filhas)\b/.test(normalized)) members = family.members.filter(member => member.relation === "filho")
  if (!members.length && /\b(irmaos|irmas)\b/.test(normalized)) members = family.members.filter(member => member.relation === "irmao")
  const hasEconomicFact = /\b(ganha|renda|trabalh\w*|desempreg\w*|recebe|aposentadoria|pensao|beneficio)\b/.test(normalized)
  if (!members.length) {
    if (hasEconomicFact) addPendingFamilyFact(family, { type: "economic_fact", raw: sanitizarTextoEntrada(text), status: "precisa_conferir", reasonCode: "member_identity_ambiguous" })
    return { applied: false, ambiguous: hasEconomicFact }
  }
  if (members.some(member => member.identityStatus === "precisa_conferir")) {
    addPendingFamilyFact(family, { type: "economic_fact", raw: sanitizarTextoEntrada(text), status: "precisa_conferir", reasonCode: "member_identity_ambiguous" })
    return { applied: false, ambiguous: hasEconomicFact }
  }
  if (/\b(paga|pago|pagando)\s+pensao\b/.test(normalized)) {
    addPendingFamilyFact(family, {
      type: "pensao_recebida",
      raw: sanitizarTextoEntrada(text),
      beneficiaryReference: /\bpara (?:o )?meu filho\b/.test(normalized) ? "filho" : null,
      status: "precisa_conferir",
      reasonCode: "pension_beneficiary_requires_confirmation"
    })
    return { applied: false, ambiguous: true }
  }
  const amountMatch = text.match(/R\$\s*([\d.,]+)/i) || text.match(/\b(?:ganha|recebe|renda(?: de)?)\s+([\d.,]+)\b/i)
  const amount = normalizeMoney(amountMatch?.[1])
  const benefitType = normalized.match(/\b(aposentadoria|pensao|bpc|loas|auxilio[- ]?doenca|beneficio social|bolsa familia)\b/)?.[1]
  const age = Number(normalized.match(/\b(\d{1,3})\s+anos\b/)?.[1])
  for (const member of members) {
    if (/\b(nao trabalh\w*|nao estou trabalhando|desempreg\w*|sem trabalho|sem renda)\b/.test(normalized)) {
      member.workStatus = "sem_trabalho"
      setIncome(member, { type: "sem_renda", amount: 0, status: "informado" })
    } else if (/\b(renda informal|bico|autonom|diarista)\b/.test(normalized)) {
      member.workStatus = "renda_informal"
      setIncome(member, { type: "renda_informal", amount, status: amount === null ? "valor_pendente" : "informado" })
    } else if (/\b(trabalh\w*|empregad\w*|salario|ganha)\b/.test(normalized)) {
      member.workStatus = "trabalha"
      setIncome(member, { type: "trabalho", amount, status: amount === null ? "valor_pendente" : "informado" })
    }
    if (benefitType) {
      setBenefit(member, { type: /bpc|loas|social|bolsa/.test(benefitType) ? "assistencial_social" : "previdenciario", description: benefitType, amount, status: amount === null ? "valor_pendente" : "informado" })
    }
    if (Number.isInteger(age) && age >= 0 && age <= 130) member.age = age
  }
  return { applied: members.some(member => member.workStatus || member.incomes.length || member.benefits.length || member.age !== null), ambiguous: false, member: members[0], members }
}

function extractExpenses(text) {
  const normalized = plain(text)
  if (/\b(nao|nenhum|nenhuma|sem)\b[^.!?]{0,35}\b(despesa|gasto)\b|\bnao temos gastos? relevantes?\b/.test(normalized)) {
    return { none: true, items: [] }
  }
  const catalog = [
    ["medicamentos", /\b(remedio|medicamentos?)\b/],
    ["terapias", /\b(terapia|fonoaudiolog|fisioterapia|psicolog)\b/],
    ["tratamentos", /\b(consulta|tratamento)\b/],
    ["alimentacao_especial", /\b(alimentacao especial|dieta especial)\b/],
    ["transporte_tratamento", /\b(transporte|passagem)\b/],
    ["fraldas_insumos", /\b(fralda|insumo)\b/],
    ["aluguel", /\baluguel\b/]
  ]
  const items = catalog.filter(([, pattern]) => pattern.test(normalized)).map(([type]) => ({ type, status: "informado" }))
  return items.length ? { none: false, items } : null
}

function extractCadUnico(text) {
  const normalized = plain(text)
  if (!/cadunico|cadastro unico/.test(normalized)) return null
  if (hasUncertainty(text)) return { status: "precisa_conferir", value: "informado_com_incerteza" }
  if (/\b(nao tenho|nao possui|sem cadastro|nao estou cadastr)\b/.test(normalized)) return { status: "confirmado", value: "nao_possui" }
  if (/\b(desatualiz\w*|precisa atualizar|regularizar|pendente)\b/.test(normalized)) return { status: "confirmado", value: "precisa_regularizar" }
  if (/\b(atualizad\w*|em dia)\b/.test(normalized)) return { status: "confirmado", value: "atualizado" }
  if (/\b(tenho|possui|cadastrad)\b/.test(normalized)) return { status: "confirmado", value: "possui" }
  if (/\bnao sei\b/.test(normalized)) return { status: "precisa_conferir", value: "nao_sabe" }
  return null
}

function extractAdministrativeStatus(text, { allowContextless = false } = {}) {
  const normalized = plain(text)
  if (!allowContextless && !/\b(bpc|loas|pedido|requerimento|inss)\b/.test(normalized)) return null
  if (/\b(indeferid\w*|negad\w*|negaram|nao conced\w*)\b/.test(normalized)) return "indeferido"
  if (/\b(em analise|analisando|aguardando decisao|ainda nao saiu)\b/.test(normalized)) return "em_analise"
  if (/\b(concedid|aprovad|deferid)\b/.test(normalized)) return "concedido"
  if (/\b(nunca pedi|nao pedi|nao fiz requerimento)\b/.test(normalized)) return "nao_requerido"
  if (/\b(ja pedi|dei entrada|fiz o pedido|requeri)\b/.test(normalized)) return "requerido"
  return null
}

function extractBpcLegalFacts(text, { expectedField = null, previousAnswers = {}, origem = "cliente" } = {}) {
  const raw = sanitizarTextoEntrada(text?.text || text)
  const normalized = plain(raw)
  const facts = { ...extractInssLegalFacts(raw, { expectedField: BPC_SHARED_FIELDS.has(expectedField) ? expectedField : null, origem }) }
  if (!raw) return facts

  if (facts.beneficio && /\b(pai|mae|marido|esposa|avo|irmao|irma)\b[^.!?]{0,80}\b(aposentadoria|pensao|beneficio|bpc|loas|auxilio)\b/.test(normalized)) {
    delete facts.beneficio
  }
  if (!facts.motivo && /\b(indeferid\w*|negad\w*|negaram|nao conced\w*)\b/.test(normalized)) {
    const reason = raw.match(/(?:indeferid\w*|negad\w*|negaram|não conced\w*)[^.!?\n]{0,35}?(?:porque|pois|motivo(?: foi)?|disseram que)\s+([^.!?\n]{3,180})/i)?.[1]
    addFact(facts, "motivo", reason, origem)
  }

  const subtype = inferSubtype(raw) || (expectedField === "bpcRequerenteTipo"
    ? (/\bcrianca\b/.test(normalized) ? "crianca" : /\bidos[oa]\b/.test(normalized) ? "idoso" : /\badult[oa]\b/.test(normalized) ? "adulto" : null)
    : null) || previousAnswers?.bpcRequerenteTipo?.valor || null
  addFact(facts, "bpcRequerenteTipo", subtype, origem)

  if (/\b(deficiencia|autismo|tea|paralisia|sindrome|impedimento)\b/.test(normalized)) {
    addFact(facts, "bpcDeficiencia", raw, origem, hasUncertainty(raw) ? "precisa_conferir" : "confirmado")
  }
  if (/\b(nao (?:e|eh) de longo prazo|temporari[oa]|passageir[oa])\b/.test(normalized)) {
    addFact(facts, "bpcImpedimentoLongoPrazo", false, origem)
  } else if (/\b(longo prazo|permanente|ha mais de \d+ (?:anos|meses)|desde \d{4})\b/.test(normalized)) {
    addFact(facts, "bpcImpedimentoLongoPrazo", true, origem, hasUncertainty(raw) ? "precisa_conferir" : "confirmado")
  }

  const family = extractFamily(raw, { previousAnswers, subtype })
  const expectedMemberId = memberIdFromField(expectedField)
  const familyInput = /\b(moro|mora|moram|vive|vivem|mesma casa|domicilio|marido|esposa|companheir\w*|pai|mae|filh\w*|irma\w*|avo|net[oa]|renda|ganha|trabalha|desempreg\w*|beneficio|aposentadoria|pensao)\b/.test(normalized)
  const incomeClauses = expectedMemberId
    ? [raw]
    : plain(raw).split(/(?:;|\.\s+|\s+e\s+(?=(?:eu|ele|ela|o pai|a mae|minha mae|meu pai|meu irmao|minha irma|meu marido|minha esposa|meu companheiro|minha companheira|os filhos|as filhas|\d+ filhos?|um filho|uma filha|dois filhos|duas filhas|tres filhos)\b))/i)
  let incomeApplied = false
  let incomeAmbiguous = false
  for (const clause of incomeClauses) {
    const result = applyWorkAndIncome(clause, family, expectedMemberId)
    incomeApplied ||= result.applied
    incomeAmbiguous ||= result.ambiguous
  }
  if (familyInput && family.members.length) {
    const identityAmbiguous = family.members.some(member => member.identityStatus === "precisa_conferir")
    addFact(facts, "bpcComposicaoFamiliar", family, origem,
      identityAmbiguous || (incomeAmbiguous && !incomeApplied) ? "precisa_conferir" : "confirmado",
      identityAmbiguous || (incomeAmbiguous && !incomeApplied) ? { reasonCode: "member_identity_ambiguous" } : {})
  }

  const expenses = extractExpenses(raw)
  addFact(facts, "bpcDespesas", expenses, origem)
  const cadUnico = extractCadUnico(raw)
  if (cadUnico) addFact(facts, "bpcCadUnico", cadUnico.value, origem, cadUnico.status)
  addFact(facts, "bpcSituacaoAdministrativa", extractAdministrativeStatus(raw, { allowContextless: expectedField === "bpcSituacaoAdministrativa" }), origem)

  if (expectedField === "bpcDeficiencia" && !facts.bpcDeficiencia && raw && !hasUncertainty(raw)) addFact(facts, expectedField, raw, origem)
  if (expectedField === "bpcImpedimentoLongoPrazo" && !facts.bpcImpedimentoLongoPrazo) {
    if (/^(sim|s|confirmo)[.!]?$/.test(normalized)) addFact(facts, expectedField, true, origem)
    else if (/^(nao|n|negativo)[.!]?$/.test(normalized)) addFact(facts, expectedField, false, origem)
  }
  if (expectedField === "bpcCadUnico" && !facts.bpcCadUnico && raw) {
    addFact(facts, expectedField, raw, origem, "precisa_conferir", { reasonCode: "cadunico_ambiguous" })
  }
  if (expectedField && memberIdFromField(expectedField) && !facts.bpcComposicaoFamiliar && raw) {
    addFact(facts, "bpcComposicaoFamiliar", family, origem, "precisa_conferir", { reasonCode: "member_identity_ambiguous" })
  }
  if (hasUncertainty(raw)) {
    for (const [field, fact] of Object.entries(facts)) {
      if (BPC_BASE_FIELDS.has(field)) fact.status = "precisa_conferir"
    }
  }
  return facts
}

function trustedBpcDocumentFacts(documents = {}) {
  const facts = {}
  for (const item of Array.isArray(documents?.facts) ? documents.facts : []) {
    const trusted = item?.trusted === true || ["confirmed", "delivered"].includes(String(item?.status || "").toLowerCase())
    const principal = ["titular", "primary_holder"].includes(String(item?.partyRole || "").toLowerCase())
    if (!trusted || !principal || item?.review === true || !BPC_BASE_FIELDS.has(item?.field) || !present(item?.value)) continue
    addFact(facts, item.field, item.value, "documento_confirmado")
  }
  return facts
}

function mergeBpcFacts({ data = {}, usuario = {}, documents = {} } = {}) {
  const text = [
    data.descricao?.valor, data.tipoCaso?.valor, data.situacao?.valor, data.beneficio?.valor,
    usuario.descricao, usuario.assuntoResumo, usuario.tipoCaso, usuario.tipo, usuario.situacao,
    usuario.subTipo, usuario.subtipo
  ].filter(present).join(". ")
  const previousAnswers = Object.fromEntries(Object.entries(data).filter(([, item]) => present(item?.valor)))
  const narrativeFacts = extractBpcLegalFacts(text, { previousAnswers, origem: "relato" })
  const documentFacts = trustedBpcDocumentFacts(documents)
  const merged = { ...data }
  const divergences = []
  for (const [field, fact] of Object.entries(narrativeFacts)) {
    if (!present(merged[field]?.valor)) merged[field] = fact
  }
  for (const [field, fact] of Object.entries(documentFacts)) {
    if (present(merged[field]?.valor) && !equivalent(merged[field].valor, fact.valor)) {
      divergences.push({ field, sources: [merged[field].origem || "estado", "documento_confirmado"] })
    } else if (!present(merged[field]?.valor)) merged[field] = fact
  }
  return { data: merged, divergences, narrativeFacts, documentFacts }
}

function memberNeedsDetails(member) {
  if (!member || member.sameHousehold !== true || member.minor) return false
  if (member.workStatus === "sem_trabalho") return false
  if (member.workStatus === "trabalha" || member.workStatus === "renda_informal") {
    return !(member.incomes || []).some(income => income.status === "informado")
  }
  return !(member.incomes || []).some(income => income.status === "informado") && !(member.benefits || []).some(benefit => benefit.status === "informado")
}

function nextFamilyMember(data = {}) {
  const family = data?.bpcComposicaoFamiliar?.valor || data?.bpcComposicaoFamiliar
  return (family?.members || []).find(memberNeedsDetails) || null
}

function inferCorrectionMember(previousAnswers, text) {
  const family = cloneFamily(previousAnswers)
  return { family, member: findMemberForReference(family, text) }
}

function buildBpcLegalAnswerResult(field, content, { previousAnswers = {} } = {}) {
  if (!isBpcLegalField(field)) return null
  const raw = sanitizarTextoEntrada(content?.text || content)
  const correctionResidence = CORRECTION_SIGNAL.test(plain(raw)) ? residenceFromClause(plain(raw)) : null
  if (correctionResidence !== null) {
    const { family, member } = inferCorrectionMember(previousAnswers, raw)
    if (!member) return { persisted: true, canonicalAnswers: {}, skipDefaultAnswer: true, correctionAmbiguous: true }
    const previous = JSON.parse(JSON.stringify(member))
    member.sameHousehold = correctionResidence
    delete member.identityStatus
    return {
      persisted: true,
      canonicalAnswers: {
        bpcComposicaoFamiliar: answer(family, "cliente", "confirmado", {
          correcao: true,
          membroCorrigido: member.memberId,
          valorAnterior: previous
        })
      },
      skipDefaultAnswer: true,
      correctedField: "bpcComposicaoFamiliar"
    }
  }
  if (CORRECTION_SIGNAL.test(plain(raw)) && /\b(renda|ganha|trabalha|desempreg\w*|beneficio|aposentadoria|pensao)\b/.test(plain(raw))) {
    const { family, member } = inferCorrectionMember(previousAnswers, raw)
    if (!member) return { persisted: true, canonicalAnswers: {}, skipDefaultAnswer: true, correctionAmbiguous: true }
    const previous = JSON.parse(JSON.stringify(member))
    member.incomes = []
    member.benefits = []
    member.workStatus = null
    const result = applyWorkAndIncome(raw, family, member.memberId)
    if (!result.applied || hasUncertainty(raw)) {
      return { persisted: true, canonicalAnswers: {}, skipDefaultAnswer: true, correctionAmbiguous: true }
    }
    return {
      persisted: true,
      canonicalAnswers: {
        bpcComposicaoFamiliar: answer(family, "cliente", "confirmado", {
          correcao: true,
          membroCorrigido: member.memberId,
          valorAnterior: previous
        })
      },
      skipDefaultAnswer: true,
      correctedField: "bpcComposicaoFamiliar"
    }
  }
  return {
    persisted: true,
    canonicalAnswers: extractBpcLegalFacts(raw, { expectedField: field, previousAnswers, origem: "cliente" }),
    skipDefaultAnswer: true
  }
}

module.exports = {
  BPC_BASE_FIELDS,
  BPC_SHARED_FIELDS,
  MEMBER_FIELD_PREFIX,
  isBpcCase,
  isBpcLegalField,
  memberFieldId,
  memberIdFromField,
  extractBpcLegalFacts,
  mergeBpcFacts,
  trustedBpcDocumentFacts,
  nextFamilyMember,
  memberNeedsDetails,
  buildBpcLegalAnswerResult
}
