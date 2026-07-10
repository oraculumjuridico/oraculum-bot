const crypto = require("node:crypto")
const { replayConsultaEvents } = require("./consultation-replay-engine")

function sha256(value) {
  return crypto.createHash("sha256").update(
    typeof value === "string" ? value : JSON.stringify(value)
  ).digest("hex")
}

function hashWithout(object, field) {
  const clone = { ...object }
  delete clone[field]
  return sha256(clone)
}

function verifyEventChain(events = []) {
  let previousHash = null
  for (let index = 0; index < events.length; index++) {
    const event = events[index]
    if (
      event.previousDealEventHash !== previousHash ||
      event.eventHash !== hashWithout(event, "eventHash") ||
      event.dealSequence !== index + 1
    ) return false
    previousHash = event.eventHash
  }
  return true
}

function verifyDecisionChain(decisions = []) {
  let previousHash = null
  for (const decision of decisions) {
    if (
      decision.previousHash !== previousHash ||
      decision.hash !== hashWithout(decision, "hash")
    ) return false
    previousHash = decision.hash
  }
  return true
}

function verifyTemporalConsistency(events = [], decisions = []) {
  const valid = list => list.every((item, index) => {
    const current = new Date(item.timestamp).getTime()
    const previous = index ? new Date(list[index - 1].timestamp).getTime() : current
    return Number.isFinite(current) && current >= previous
  })
  return valid(events) && valid(decisions)
}

function buildDossierProof(content) {
  const proof = {
    algorithm: "SHA-256",
    eventChainHead: content.eventHistory.at(-1)?.eventHash || null,
    decisionChainHead: content.decisionHistory.at(-1)?.hash || null,
    componentHashes: {
      eventHistory: sha256(content.eventHistory),
      decisionHistory: sha256(content.decisionHistory),
      replayState: sha256(content.replayState),
      currentState: sha256(content.currentState),
      narrative: sha256(content.narrative)
    },
    dossierContentHash: sha256(content)
  }
  proof.proofHash = hashWithout(proof, "proofHash")
  return proof
}

function verifyConsultaLegalDossier(dossier) {
  const { proof, ...content } = dossier || {}
  const errors = []
  if (!verifyEventChain(content.eventHistory)) errors.push("event_chain_invalid")
  if (!verifyDecisionChain(content.decisionHistory)) errors.push("decision_chain_invalid")
  if (!verifyTemporalConsistency(content.eventHistory, content.decisionHistory)) {
    errors.push("temporal_order_invalid")
  }
  const replay = replayConsultaEvents(content.dealId, content.eventHistory)
  if (
    replay.status !== content.replayState?.status ||
    replay.eventStoreSequence !== content.replayState?.eventStoreSequence
  ) errors.push("replay_mismatch")
  if (content.currentState?.status !== content.replayState?.status) {
    errors.push("current_state_mismatch")
  }
  const expectedProof = buildDossierProof(content)
  if (JSON.stringify(expectedProof) !== JSON.stringify(proof)) errors.push("proof_invalid")
  return {
    valid: errors.length === 0,
    admissible: errors.length === 0,
    errors,
    verifiedAt: new Date().toISOString(),
    proofHash: expectedProof.proofHash
  }
}

module.exports = {
  sha256,
  hashWithout,
  verifyEventChain,
  verifyDecisionChain,
  verifyTemporalConsistency,
  buildDossierProof,
  verifyConsultaLegalDossier
}
