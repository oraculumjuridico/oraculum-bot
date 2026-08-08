"use strict"

function projectDocumentDecision(usuario, decision, marcarStatusDocumento) {
  if (!usuario || !decision || decision.requirementId !== "doc_rg") return { changed: false, reason: "unsupported" }
  const cursors = usuario.documentDecisionProjectionRevisions || {}
  const currentRevision = Number(cursors.doc_rg || 0)
  if (Number(decision.revision) <= currentRevision) return { changed: false, reason: "already_projected" }
  if (!['partial', 'delivered'].includes(decision.status)) return { changed: false, reason: "not_promoted" }
  const alreadyDelivered = Array.isArray(usuario.docsEntregues) && usuario.docsEntregues.includes("doc_rg")
  if (!(alreadyDelivered && decision.status === "partial")) {
    marcarStatusDocumento(usuario, "doc_rg", decision.status === "delivered" ? "docsEntregues" : "docsParciais")
  }
  usuario.documentDecisionProjectionRevisions = { ...cursors, doc_rg: Number(decision.revision) }
  return { changed: true, revision: Number(decision.revision), status: alreadyDelivered ? "delivered" : decision.status }
}

module.exports = { projectDocumentDecision }
