"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { PostHumanCycleRepository } = require("../src/domain/post-human-cycle-model")
const { reevaluatePostHumanForDecision } = require("../src/domain/post-human-document-reevaluation")

async function createRepo() {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "oraculum-doc-claim-"))
  const repository = new PostHumanCycleRepository({ file: path.join(dir, "cycles.json"), mode: "local" })
  await repository.initialize()
  return { repository, dir }
}

async function main() {
  const { repository, dir } = await createRepo()
  try {
    const user = { negocioId: "deal-1", contatoId: "contact-1", numeroCaso: "PRV.1" }
    const cycle = await repository.createCycle(user)
    let calls = 0
    const decision = { requirementId: "doc_rg", revision: 1 }
    const first = await reevaluatePostHumanForDecision({ usuario: user, decision, repository }, {
      processCycle: async current => { calls++; return repository.updateStatus(current.cycleId, "analyzing") }
    })
    assert.equal(first.processed, true)
    assert.equal(calls, 1)
    const repeated = await reevaluatePostHumanForDecision({ usuario: user, decision, repository }, {
      processCycle: async () => { calls++ }
    })
    assert.equal(repeated.reason, "already_processed")
    assert.equal(calls, 1)
    assert.equal((await repository.getCycle(cycle.cycleId)).payload.documentDecisionClaims.doc_rg.state, "completed")

    const concurrentDecision = { requirementId: "doc_rg", revision: 2 }
    const concurrent = await Promise.all([
      reevaluatePostHumanForDecision({ usuario: user, decision: concurrentDecision, repository }, { processCycle: async () => { calls++ } }),
      reevaluatePostHumanForDecision({ usuario: user, decision: concurrentDecision, repository }, { processCycle: async () => { calls++ } })
    ])
    assert.equal(concurrent.filter(item => item.processed).length, 1)

    const other = await repository.createCycle({ negocioId: "deal-2", contatoId: "contact-2", numeroCaso: "PRV.2" })
    await repository.claimDocumentDecision(other.cycleId, { requirementId: "doc_rg", revision: 1 })
    await repository.updateStatus(other.cycleId, "analyzing")
    await repository.updateStatus(other.cycleId, "ready_to_send")
    await repository.updateStatus(other.cycleId, "sending")
    let sendingCalls = 0
    const blocked = await reevaluatePostHumanForDecision({
      usuario: { negocioId: "deal-2", contatoId: "contact-2", numeroCaso: "PRV.2" },
      decision: { ...decision, revision: 2 },
      repository
    }, { processCycle: async () => { sendingCalls++ } })
    assert.equal(blocked.processed, false)
    assert.equal(sendingCalls, 0)
    assert.equal((await repository.getCycle(other.cycleId)).payload.documentDecisionClaims.doc_rg.revision, 1)

    const retryUser = { negocioId: "deal-3", contatoId: "contact-3", numeroCaso: "PRV.3" }
    const retryCycle = await repository.createCycle(retryUser)
    let retries = 0
    const failedBeforeOutbound = await reevaluatePostHumanForDecision({ usuario: retryUser, decision, repository }, {
      now: "2026-08-08T12:00:00.000Z",
      processCycle: async current => {
        retries++
        await repository.updateStatus(current.cycleId, "analyzing")
        throw new Error("before outbound")
      }
    })
    assert.equal(failedBeforeOutbound.claimed, true)
    const resumed = await reevaluatePostHumanForDecision({ usuario: retryUser, decision, repository }, {
      now: "2026-08-08T12:10:00.000Z",
      staleMs: 1,
      processCycle: async () => { retries++ }
    })
    assert.equal(resumed.processed, true)
    assert.equal(retries, 2)

    const acceptedUser = { negocioId: "deal-4", contatoId: "contact-4", numeroCaso: "PRV.4" }
    const acceptedCycle = await repository.createCycle(acceptedUser)
    let acceptedCalls = 0
    await reevaluatePostHumanForDecision({ usuario: acceptedUser, decision, repository }, {
      processCycle: async current => {
        acceptedCalls++
        await repository.updateStatus(current.cycleId, "analyzing")
        await repository.updateStatus(current.cycleId, "ready_to_send")
        await repository.updateStatus(current.cycleId, "sending")
        await repository.updateStatus(current.cycleId, "message_sent", { providerMessageId: "new-provider" })
        await repository.updateStatus(current.cycleId, "awaiting_response")
        throw new Error("after outbound accepted")
      }
    })
    const finalized = await reevaluatePostHumanForDecision({ usuario: acceptedUser, decision, repository }, {
      processCycle: async () => { acceptedCalls++ }
    })
    assert.equal(finalized.finalized, true)
    assert.equal(acceptedCalls, 1)
    assert.equal((await repository.getCycle(acceptedCycle.cycleId)).payload.documentDecisionClaims.doc_rg.state, "completed")

    const retryableUser = { negocioId: "deal-5", contatoId: "contact-5", numeroCaso: "PRV.5" }
    const retryableCycle = await repository.createCycle(retryableUser)
    let retryableCalls = 0
    const retryableFailure = await reevaluatePostHumanForDecision({ usuario: retryableUser, decision, repository }, {
      processCycle: async current => {
        retryableCalls++
        await repository.updateStatus(current.cycleId, "analyzing")
        await repository.updateStatus(current.cycleId, "failed_transient", { resultadoEnvio: "nao_enviado" })
        return { failed: true, retryableBeforeSend: true, failurePhase: "before_transport" }
      }
    })
    assert.equal(retryableFailure.retryable, true)
    assert.equal((await repository.getCycle(retryableCycle.cycleId)).payload.documentDecisionClaims.doc_rg.state, "retryable")
    const retriedImmediately = await reevaluatePostHumanForDecision({
      usuario: retryableUser, decision: { ...decision, revision: 2 }, repository
    }, {
      processCycle: async current => {
        retryableCalls++
        await repository.updateStatus(current.cycleId, "analyzing")
        return repository.updateStatus(current.cycleId, "completed")
      }
    })
    assert.equal(retriedImmediately.processed, true)
    assert.equal(retryableCalls, 2)

    const uncertainUser = { negocioId: "deal-6", contatoId: "contact-6", numeroCaso: "PRV.6" }
    const uncertainCycle = await repository.createCycle(uncertainUser)
    let uncertainCalls = 0
    const uncertainFailure = await reevaluatePostHumanForDecision({ usuario: uncertainUser, decision, repository }, {
      processCycle: async current => {
        uncertainCalls++
        await repository.updateStatus(current.cycleId, "analyzing")
        await repository.updateStatus(current.cycleId, "ready_to_send")
        await repository.updateStatus(current.cycleId, "sending")
        await repository.updateStatus(current.cycleId, "failed_transient", { resultadoEnvio: "incerto" })
        return { failed: true, uncertain: true, failurePhase: "transport_outcome_unknown" }
      }
    })
    assert.equal(uncertainFailure.blocked, true)
    assert.equal((await repository.getCycle(uncertainCycle.cycleId)).payload.documentDecisionClaims.doc_rg.state, "outbound_uncertain")
    const uncertainRepeated = await reevaluatePostHumanForDecision({ usuario: uncertainUser, decision, repository }, {
      processCycle: async () => { uncertainCalls++ }
    })
    assert.equal(uncertainRepeated.processed, false)
    assert.equal(uncertainCalls, 1, "resultado incerto nao pode provocar segundo outbound automatico")
    const uncertainRevision2 = await Promise.all([
      reevaluatePostHumanForDecision({
        usuario: uncertainUser, decision: { ...decision, revision: 2 }, repository
      }, { processCycle: async () => { uncertainCalls++ } }),
      reevaluatePostHumanForDecision({
        usuario: uncertainUser, decision: { ...decision, revision: 2 }, repository
      }, { processCycle: async () => { uncertainCalls++ } })
    ])
    assert.equal(uncertainRevision2.every(item => item.processed === false), true)
    assert.equal(uncertainCalls, 1, "duas tentativas concorrentes de nova revisao nao podem produzir outbound")

    const postTransportUser = { negocioId: "deal-7", contatoId: "contact-7", numeroCaso: "PRV.7" }
    const postTransportCycle = await repository.createCycle(postTransportUser)
    let postTransportCalls = 0
    const postTransportFailure = await reevaluatePostHumanForDecision({ usuario: postTransportUser, decision, repository }, {
      processCycle: async current => {
        postTransportCalls++
        await repository.updateStatus(current.cycleId, "analyzing")
        await repository.updateStatus(current.cycleId, "ready_to_send")
        await repository.updateStatus(current.cycleId, "sending")
        await repository.updateStatus(current.cycleId, "failed_terminal", { resultadoEnvio: "falha" })
        return { failed: true, failurePhase: "after_transport_without_acceptance" }
      }
    })
    assert.equal(postTransportFailure.blocked, true)
    assert.equal((await repository.getCycle(postTransportCycle.cycleId)).payload.documentDecisionClaims.doc_rg.state, "failed_after_transport")
    const postTransportRepeated = await reevaluatePostHumanForDecision({ usuario: postTransportUser, decision, repository }, {
      processCycle: async () => { postTransportCalls++ }
    })
    assert.equal(postTransportRepeated.processed, false)
    assert.equal(postTransportCalls, 1)
    const postTransportRevision2 = await repository.claimDocumentDecision(postTransportCycle.cycleId, {
      requirementId: "doc_rg", revision: 2
    })
    assert.equal(postTransportRevision2.claimed, false)
    assert.equal(postTransportRevision2.blockedState, "failed_after_transport")

    for (const status of ["message_sent", "awaiting_response"]) {
      const suffix = status === "message_sent" ? "8" : "9"
      const waitingUser = { negocioId: `deal-${suffix}`, contatoId: `contact-${suffix}`, numeroCaso: `PRV.${suffix}` }
      const waitingCycle = await repository.createCycle(waitingUser)
      await repository.claimDocumentDecision(waitingCycle.cycleId, { requirementId: "doc_rg", revision: 1 })
      await repository.updateStatus(waitingCycle.cycleId, "analyzing")
      await repository.updateStatus(waitingCycle.cycleId, "ready_to_send")
      await repository.updateStatus(waitingCycle.cycleId, "sending")
      await repository.updateStatus(waitingCycle.cycleId, "message_sent", { providerMessageId: `provider-${suffix}` })
      if (status === "awaiting_response") await repository.updateStatus(waitingCycle.cycleId, "awaiting_response")
      let waitingCalls = 0
      const waitingRevision2 = await reevaluatePostHumanForDecision({
        usuario: waitingUser, decision: { ...decision, revision: 2 }, repository
      }, { processCycle: async () => { waitingCalls++ } })
      assert.equal(waitingRevision2.processed, false)
      assert.equal(waitingCalls, 0, `${status} nao pode reenviar em revisao posterior`)
    }

    const completedClaimCycle = await repository.createCycle({
      negocioId: "deal-10", contatoId: "contact-10", numeroCaso: "PRV.10"
    })
    const completedRevision1 = await repository.claimDocumentDecision(completedClaimCycle.cycleId, {
      requirementId: "doc_rg", revision: 1
    })
    await repository.completeDocumentDecision(completedClaimCycle.cycleId, {
      requirementId: "doc_rg", revision: 1, claimId: completedRevision1.claimId
    })
    const completedRevision2 = await repository.claimDocumentDecision(completedClaimCycle.cycleId, {
      requirementId: "doc_rg", revision: 2
    })
    assert.equal(completedRevision2.claimed, true)

    const absent = await reevaluatePostHumanForDecision({
      usuario: { negocioId: "missing", contatoId: "missing", numeroCaso: "PRV.X" }, decision, repository
    }, { processCycle: async () => {} })
    assert.equal(absent.reason, "cycle_not_found")
    assert.equal(typeof repository.createCycle, "function")
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true })
  }
}

main().then(() => console.log("post-human-document-reevaluation.test.js: ok")).catch(error => {
  console.error(error)
  process.exitCode = 1
})
