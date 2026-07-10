const crypto = require("node:crypto")
const {
  getConsultaHistory,
  getConsultaStateAt
} = require("./consultation-replay-engine")
const {
  readConsultaDecisions
} = require("./consultation-decision-audit")

function snapshotHash(snapshot) {
  const { legalSnapshotHash, ...content } = snapshot
  return crypto.createHash("sha256").update(JSON.stringify(content)).digest("hex")
}

async function createConsultationLegalSnapshot(dealId, {
  getCurrentView,
  domainVersion,
  consultationVersion,
  eventModelHash,
  generatedAt = new Date().toISOString()
}) {
  const cutoff = new Date(generatedAt).getTime()
  const history = getConsultaHistory(dealId)
    .filter(event => new Date(event.timestamp).getTime() <= cutoff)
  const replayState = getConsultaStateAt(dealId, generatedAt)
  const currentView = await getCurrentView(dealId)
  const decisions = readConsultaDecisions(dealId)
    .filter(decision => new Date(decision.timestamp).getTime() <= cutoff)
  const snapshot = {
    legalAuditMode: true,
    dealId: String(dealId),
    generatedAt: new Date(generatedAt).toISOString(),
    domainVersion,
    consultationVersion,
    eventModelHash,
    consistency: {
      replayStatus: replayState.status,
      readModelStatus: currentView.status,
      consistent: replayState.status === currentView.status
    },
    currentState: currentView,
    replayState,
    eventHistory: history,
    decisionHistory: decisions
  }
  snapshot.legalSnapshotHash = snapshotHash(snapshot)
  return Object.freeze(snapshot)
}

module.exports = {
  snapshotHash,
  createConsultationLegalSnapshot
}
