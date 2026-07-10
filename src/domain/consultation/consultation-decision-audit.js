const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const { mirrorStateFile } = require("../../infrastructure/external-state-repository")

const DECISIONS_FILE = process.env.CONSULTA_DECISIONS_FILE ||
  path.join(path.resolve(process.env.ORACULUM_DATA_DIR || path.join(__dirname, "..", "..", "..", "data")), "consultation-decisions.jsonl")

function decisionHash(decision) {
  const { hash, ...payload } = decision
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex")
}

function readConsultaDecisions(dealId = null) {
  if (!fs.existsSync(DECISIONS_FILE)) return []
  const decisions = fs.readFileSync(DECISIONS_FILE, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line))
  let previousHash = null
  for (const decision of decisions) {
    if (decision.previousHash !== previousHash || decision.hash !== decisionHash(decision)) {
      const error = new Error("cadeia de auditoria de decisoes de consulta corrompida")
      error.code = "CONSULTATION_DECISION_AUDIT_CORRUPTED"
      throw error
    }
    previousHash = decision.hash
  }
  return dealId ? decisions.filter(item => item.dealId === String(dealId)) : decisions
}

function appendConsultaDecision({
  dealId,
  type = null,
  decision,
  origin,
  input,
  output,
  eventId = null,
  timestamp = new Date().toISOString()
}) {
  if (!dealId || !decision || !origin) {
    throw new Error("dealId, decision e origin sao obrigatorios na auditoria")
  }
  const existing = readConsultaDecisions()
  const entry = {
    schemaVersion: 1,
    decisionId: crypto.randomUUID(),
    dealId: String(dealId),
    type: type || decision,
    decision,
    origin,
    input: input ?? null,
    output: output ?? null,
    eventId,
    timestamp: new Date(timestamp).toISOString(),
    previousHash: existing.at(-1)?.hash || null
  }
  entry.hash = decisionHash(entry)
  fs.mkdirSync(path.dirname(DECISIONS_FILE), { recursive: true })
  fs.appendFileSync(DECISIONS_FILE, `${JSON.stringify(entry)}\n`, "utf8")
  mirrorStateFile(DECISIONS_FILE).catch(() => {})
  return entry
}

module.exports = {
  DECISIONS_FILE,
  decisionHash,
  readConsultaDecisions,
  appendConsultaDecision
}
