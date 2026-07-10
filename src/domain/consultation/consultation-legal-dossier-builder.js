const {
  generateConsultaNarrative
} = require("./consultation-narrative-generator")
const {
  buildDossierProof,
  verifyConsultaLegalDossier
} = require("./consultation-audit-verifier")

function buildDossierSummary(content, proof) {
  return {
    dealId: content.dealId,
    generatedAt: content.generatedAt,
    finalStatus: content.replayState.status,
    eventCount: content.eventHistory.length,
    decisionCount: content.decisionHistory.length,
    replayConsistent: content.currentState.status === content.replayState.status,
    eventChainHead: proof.eventChainHead,
    decisionChainHead: proof.decisionChainHead,
    proofHash: proof.proofHash
  }
}

async function buildConsultaLegalDossier(dealId, {
  getFullAudit,
  generatedAt = new Date().toISOString()
}) {
  const audit = await getFullAudit(dealId, generatedAt)
  const narrative = generateConsultaNarrative(dealId, audit.eventHistory)
  const content = {
    dossierSchemaVersion: 1,
    dossierType: "consultation.legal.dossier",
    legalAdmissibilityMode: true,
    dealId: String(dealId),
    generatedAt: new Date(generatedAt).toISOString(),
    domainVersion: audit.domainVersion,
    consultationVersion: audit.consultationVersion,
    eventModelHash: audit.eventModelHash,
    replayState: audit.replayState,
    currentState: audit.currentState,
    eventHistory: audit.eventHistory,
    decisionHistory: audit.decisionHistory,
    narrative
  }
  const proof = buildDossierProof(content)
  const dossier = Object.freeze({ ...content, proof })
  const verification = verifyConsultaLegalDossier(dossier)
  if (!verification.valid) {
    const error = new Error(`dossie juridico de consulta invalido: ${verification.errors.join(",")}`)
    error.code = "CONSULTATION_LEGAL_DOSSIER_INVALID"
    error.verification = verification
    throw error
  }
  return {
    dossier,
    summary: buildDossierSummary(content, proof),
    proof,
    verification
  }
}

module.exports = {
  buildDossierSummary,
  buildConsultaLegalDossier
}
