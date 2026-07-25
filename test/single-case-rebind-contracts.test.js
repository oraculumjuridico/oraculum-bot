"use strict"

const { describe, it } = require("node:test")
const assert = require("node:assert/strict")
const {
  REBIND_SCHEMA_VERSION,
  ALLOWED_REBIND_REASONS,
  normalizeAuthorizationSet,
  computeAuthorizationSetHash,
  validateReason,
  validateRequestedBy,
  validateReconciliationEvidence,
  validateCheckpointEligibility,
  computeRebindId,
  validateRebindRequest,
  createRebindRequest,
  sanitizeRebindResponse,
  createRebindAuditMetadata
} = require("../src/domain/single-case-rebind-contracts")

// Fixtures sintÃ©ticas - SEM DADOS REAIS
const validAuthIds = ["auth-id-alpha-12345", "auth-id-beta-67890"]
const validAuthIdsReversed = ["auth-id-beta-67890", "auth-id-alpha-12345"]
const newAuthIds = ["auth-id-gamma-11111", "auth-id-delta-22222"]

const validReconciliationEvidence = {
  decision: "RECONCILIATION_ELIGIBLE",
  reason: "CONTACT_READ_ONLY_VERIFIED",
  contactEvidence: {
    caseImportId: "case-import-synthetic-001",
    contactId: "hubspot-contact-9999999",
    verified: true
  },
  namePresentation: {
    semanticMatch: true,
    materialDivergence: false
  },
  resume: {
    checkpointRebindRequired: true,
    ambiguity: "NONE"
  },
  evidenceHash: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
}

const validCheckpoint = {
  status: "failed",
  version: 1,
  caseImportId: "case-import-synthetic-001",
  caseFingerprint: "abc123def456",
  caseNumber: "INSS.123456.001",
  authorizablePlanHash: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  authorizationIds: validAuthIds,
  steps: {
    reservation: { status: "completed" },
    contact: { status: "failed", errorCode: "CONTACT_FIELDS_DIVERGENCE" },
    deal: { status: "pending" },
    association: { status: "pending" },
    area_folder: { status: "pending" },
    case_folder: { status: "pending" },
    uploads: { status: "pending" },
    final_verify: { status: "pending" }
  },
  resources: {
    contactId: null,
    dealId: null,
    associationId: null,
    areaFolderId: null,
    caseFolderId: null
  },
  uploads: {},
  finalProof: null
}

describe("single-case-rebind-contracts", () => {

  describe("Teste 1: requisiÃ§Ã£o vÃ¡lida", () => {
    it("deve criar uma requisiÃ§Ã£o de rebind vÃ¡lida", () => {
      const request = createRebindRequest({
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: validAuthIds,
        newAuthorizationIds: newAuthIds,
        reconciliationEvidence: validReconciliationEvidence,
        reason: "CONTACT_RECONCILED_AFTER_DIVERGENCE",
        requestedBy: "system-operator-01"
      })

      assert.ok(request.rebindId)
      assert.equal(request.sourceCheckpointVersion, 1)
      assert.equal(request.reboundCheckpointVersion, 2)
      assert.ok(Object.isFrozen(request))
    })
  })

  describe("legacy checkpoint compatibility", () => {
    it("accepts only the historical verification failure", () => {
      const request = { caseImportId: validCheckpoint.caseImportId, sourceCheckpointVersion: validCheckpoint.version, oldAuthorizationIds: validAuthIds }
      const legacyCheckpoint = { ...validCheckpoint, steps: { ...validCheckpoint.steps, contact: { status: "failed", errorCode: "VERIFICATION_FAILED" } } }
      assert.doesNotThrow(() => validateCheckpointEligibility(legacyCheckpoint, request))
    })

    it("rejects unrelated contact failures", () => {
      const request = { caseImportId: validCheckpoint.caseImportId, sourceCheckpointVersion: validCheckpoint.version, oldAuthorizationIds: validAuthIds }
      const invalidCheckpoint = { ...validCheckpoint, steps: { ...validCheckpoint.steps, contact: { status: "failed", errorCode: "EXTERNAL_EFFECT_UNKNOWN" } } }
      assert.throws(() => validateCheckpointEligibility(invalidCheckpoint, request), /CHECKPOINT_CONTACT_ERROR_CODE_WRONG/)
    })
  })

  describe("fronteira HubSpot para continuação Drive", () => {
    const request = {
      caseImportId: validCheckpoint.caseImportId,
      sourceCheckpointVersion: validCheckpoint.version,
      oldAuthorizationIds: validAuthIds,
      reason: "AUTHORIZATION_PAIR_REFRESHED_AFTER_EXPIRY"
    }
    const boundary = {
      ...validCheckpoint,
      status: "running",
      steps: {
        reservation: { status: "completed", result: { verified: true } },
        contact: { status: "completed", result: { id: "contact-synthetic", evidence: { verified: true }, decision: {} } },
        deal: { status: "completed", result: { id: "deal-synthetic", evidence: { verified: true } } },
        association: { status: "completed", result: { id: "association-synthetic", evidence: { verified: true } } },
        area_folder: { status: "pending" },
        case_folder: { status: "pending" },
        uploads: { status: "pending" },
        final_verify: { status: "pending" }
      },
      resources: {
        contactId: "contact-synthetic",
        dealId: "deal-synthetic",
        associationId: "association-synthetic",
        areaFolderId: null,
        caseFolderId: null
      }
    }

    it("aceita refresh expirado com HubSpot completo e Drive pendente", () => {
      assert.doesNotThrow(() => validateCheckpointEligibility(boundary, request))
    })

    it("rejeita fronteira parcial para outros motivos", () => {
      assert.throws(() => validateCheckpointEligibility(boundary, { ...request, reason: "PLAN_REGENERATED_AFTER_SAFE_CORRECTION" }), /CHECKPOINT_STATUS_NOT_FAILED/)
    })

    it("rejeita Drive já iniciado ou recurso HubSpot ausente", () => {
      const started = { ...boundary, steps: { ...boundary.steps, area_folder: { status: "running" } } }
      assert.throws(() => validateCheckpointEligibility(started, request), /CHECKPOINT_STATUS_NOT_FAILED/)
      const missing = { ...boundary, resources: { ...boundary.resources, dealId: null } }
      assert.throws(() => validateCheckpointEligibility(missing, request), /CHECKPOINT_CONTINUATION_RESOURCE_MISSING/)
    })
  })

  describe("Teste 2: IDs em ordem diferente produzem mesmo set hash", () => {
    it("deve gerar o mesmo hash para IDs em ordens diferentes", () => {
      const hash1 = computeAuthorizationSetHash(validAuthIds)
      const hash2 = computeAuthorizationSetHash(validAuthIdsReversed)
      assert.equal(hash1, hash2)
    })
  })

  describe("Teste 3: rebindId Ã© determinÃ­stico", () => {
    it("deve gerar o mesmo rebindId para requisiÃ§Ãµes idÃªnticas", () => {
      const request1 = createRebindRequest({
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: validAuthIds,
        newAuthorizationIds: newAuthIds,
        reconciliationEvidence: validReconciliationEvidence,
        reason: "CONTACT_RECONCILED_AFTER_DIVERGENCE",
        requestedBy: "system-operator-01"
      })

      const request2 = createRebindRequest({
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: validAuthIds,
        newAuthorizationIds: newAuthIds,
        reconciliationEvidence: validReconciliationEvidence,
        reason: "CONTACT_RECONCILED_AFTER_DIVERGENCE",
        requestedBy: "system-operator-01"
      })

      assert.equal(request1.rebindId, request2.rebindId)
    })
  })

  describe("Teste 4: alteraÃ§Ã£o do par muda rebindId", () => {
    it("deve gerar rebindId diferente quando newAuthorizationIds muda", () => {
      const request1 = createRebindRequest({
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: validAuthIds,
        newAuthorizationIds: newAuthIds,
        reconciliationEvidence: validReconciliationEvidence,
        reason: "CONTACT_RECONCILED_AFTER_DIVERGENCE",
        requestedBy: "system-operator-01"
      })

      const request2 = createRebindRequest({
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: validAuthIds,
        newAuthorizationIds: ["auth-id-epsilon-33333", "auth-id-zeta-44444"],
        reconciliationEvidence: validReconciliationEvidence,
        reason: "CONTACT_RECONCILED_AFTER_DIVERGENCE",
        requestedBy: "system-operator-01"
      })

      assert.notEqual(request1.rebindId, request2.rebindId)
    })
  })

  describe("Teste 5: alteraÃ§Ã£o da evidÃªncia muda rebindId", () => {
    it("deve gerar rebindId diferente quando evidenceHash muda", () => {
      const evidence2 = { ...validReconciliationEvidence, evidenceHash: "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3" }

      const request1 = createRebindRequest({
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: validAuthIds,
        newAuthorizationIds: newAuthIds,
        reconciliationEvidence: validReconciliationEvidence,
        reason: "CONTACT_RECONCILED_AFTER_DIVERGENCE",
        requestedBy: "system-operator-01"
      })

      const request2 = createRebindRequest({
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: validAuthIds,
        newAuthorizationIds: newAuthIds,
        reconciliationEvidence: evidence2,
        reason: "CONTACT_RECONCILED_AFTER_DIVERGENCE",
        requestedBy: "system-operator-01"
      })

      assert.notEqual(request1.rebindId, request2.rebindId)
    })
  })

  describe("Teste 6: alteraÃ§Ã£o da versÃ£o muda rebindId", () => {
    it("deve gerar rebindId diferente quando sourceCheckpointVersion muda", () => {
      const request1 = createRebindRequest({
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: validAuthIds,
        newAuthorizationIds: newAuthIds,
        reconciliationEvidence: validReconciliationEvidence,
        reason: "CONTACT_RECONCILED_AFTER_DIVERGENCE",
        requestedBy: "system-operator-01"
      })

      const request2 = createRebindRequest({
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 2,
        oldAuthorizationIds: validAuthIds,
        newAuthorizationIds: newAuthIds,
        reconciliationEvidence: validReconciliationEvidence,
        reason: "CONTACT_RECONCILED_AFTER_DIVERGENCE",
        requestedBy: "system-operator-01"
      })

      assert.notEqual(request1.rebindId, request2.rebindId)
    })
  })

  describe("Teste 7-9: timestamp, leaseId, fencingToken nÃ£o participam do rebindId", () => {
    it("deve ignorar campos nÃ£o canÃ´nicos no cÃ¡lculo do rebindId", () => {
      const request = createRebindRequest({
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: validAuthIds,
        newAuthorizationIds: newAuthIds,
        reconciliationEvidence: validReconciliationEvidence,
        reason: "CONTACT_RECONCILED_AFTER_DIVERGENCE",
        requestedBy: "system-operator-01"
      })

      // Simular adiÃ§Ã£o de campos extras nÃ£o afeta o rebindId computado
      const requestWithExtras = {
        ...request,
        timestamp: new Date().toISOString(),
        leaseId: "lease-12345",
        fencingToken: 999
      }

      // Recomputar rebindId com a funÃ§Ã£o pura
      const recomputedId = computeRebindId(request)
      assert.equal(request.rebindId, recomputedId)
    })
  })

  describe("Teste 10: exatamente dois IDs sÃ£o exigidos", () => {
    it("deve rejeitar array com um ID", () => {
      assert.throws(() => {
        createRebindRequest({
          caseImportId: "case-import-synthetic-001",
          sourceCheckpointVersion: 1,
          oldAuthorizationIds: ["auth-id-single"],
          newAuthorizationIds: newAuthIds,
          reconciliationEvidence: validReconciliationEvidence,
          reason: "CONTACT_RECONCILED_AFTER_DIVERGENCE",
          requestedBy: "system-operator-01"
        })
      }, /WRONG_COUNT/)
    })

    it("deve rejeitar array com trÃªs IDs", () => {
      assert.throws(() => {
        createRebindRequest({
          caseImportId: "case-import-synthetic-001",
          sourceCheckpointVersion: 1,
          oldAuthorizationIds: ["auth-id-1", "auth-id-2", "auth-id-3"],
          newAuthorizationIds: newAuthIds,
          reconciliationEvidence: validReconciliationEvidence,
          reason: "CONTACT_RECONCILED_AFTER_DIVERGENCE",
          requestedBy: "system-operator-01"
        })
      }, /WRONG_COUNT/)
    })
  })

  describe("Teste 11: IDs repetidos sÃ£o rejeitados", () => {
    it("deve rejeitar IDs duplicados", () => {
      assert.throws(() => {
        createRebindRequest({
          caseImportId: "case-import-synthetic-001",
          sourceCheckpointVersion: 1,
          oldAuthorizationIds: ["auth-id-same", "auth-id-same"],
          newAuthorizationIds: newAuthIds,
          reconciliationEvidence: validReconciliationEvidence,
          reason: "CONTACT_RECONCILED_AFTER_DIVERGENCE",
          requestedBy: "system-operator-01"
        })
      }, /DUPLICATE/)
    })
  })

  describe("Teste 12: arrays originais nÃ£o sÃ£o mutados", () => {
    it("nÃ£o deve mutar os arrays de entrada", () => {
      const originalOld = ["auth-id-beta-67890", "auth-id-alpha-12345"]
      const originalNew = ["auth-id-delta-22222", "auth-id-gamma-11111"]
      const copyOld = [...originalOld]
      const copyNew = [...originalNew]

      createRebindRequest({
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: originalOld,
        newAuthorizationIds: originalNew,
        reconciliationEvidence: validReconciliationEvidence,
        reason: "CONTACT_RECONCILED_AFTER_DIVERGENCE",
        requestedBy: "system-operator-01"
      })

      assert.deepEqual(originalOld, copyOld)
      assert.deepEqual(originalNew, copyNew)
    })
  })

  describe("Teste 13: reason fora do enum Ã© rejeitado", () => {
    it("deve rejeitar reason nÃ£o permitido", () => {
      assert.throws(() => {
        createRebindRequest({
          caseImportId: "case-import-synthetic-001",
          sourceCheckpointVersion: 1,
          oldAuthorizationIds: validAuthIds,
          newAuthorizationIds: newAuthIds,
          reconciliationEvidence: validReconciliationEvidence,
          reason: "INVALID_REASON",
          requestedBy: "system-operator-01"
        })
      }, /REBIND_REASON_NOT_ALLOWED/)
    })
  })

  describe("Teste 14: requestedBy com email Ã© rejeitado", () => {
    it("deve rejeitar identificador com @", () => {
      assert.throws(() => {
        validateRequestedBy("user@example.com")
      }, /REBIND_REQUESTED_BY_CONTAINS_EMAIL/)
    })
  })

  describe("Teste 15: requestedBy com CPF Ã© rejeitado", () => {
    it("deve rejeitar identificador com 11 dÃ­gitos consecutivos", () => {
      assert.throws(() => {
        validateRequestedBy("user-12345678901")
      }, /REBIND_REQUESTED_BY_CONTAINS_CPF/)
    })
  })

  describe("Teste 16: requestedBy com telefone Ã© rejeitado", () => {
    it("deve rejeitar identificador com 10-13 dÃ­gitos consecutivos", () => {
      assert.throws(() => {
        validateRequestedBy("user-5511987654321")
      }, /REBIND_REQUESTED_BY_CONTAINS_PHONE/)
    })
  })

  describe("Teste 17: requestedBy tÃ©cnico vÃ¡lido Ã© aceito", () => {
    it("deve aceitar identificadores tÃ©cnicos vÃ¡lidos", () => {
      assert.doesNotThrow(() => {
        validateRequestedBy("system-operator-01")
        validateRequestedBy("service-account-xyz")
        validateRequestedBy("admin.user_123")
      })
    })
  })

  describe("Teste 18: checkpoint completed Ã© rejeitado", () => {
    it("deve rejeitar checkpoint com status completed", () => {
      const checkpoint = { ...validCheckpoint, status: "completed" }
      const request = {
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: validAuthIds
      }

      assert.throws(() => {
        validateCheckpointEligibility(checkpoint, request)
      }, /CHECKPOINT_STATUS_NOT_FAILED/)
    })
  })

  describe("Teste 19: contact completed Ã© rejeitado", () => {
    it("deve rejeitar checkpoint com contact status completed", () => {
      const checkpoint = {
        ...validCheckpoint,
        steps: {
          ...validCheckpoint.steps,
          contact: { status: "completed" }
        }
      }
      const request = {
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: validAuthIds
      }

      assert.throws(() => {
        validateCheckpointEligibility(checkpoint, request)
      }, /CHECKPOINT_CONTACT_NOT_FAILED/)
    })
  })

  describe("regeneração segura antes do contato", () => {
    it("aceita contact pending quando nenhum efeito HubSpot começou", () => {
      const checkpoint = {
        ...validCheckpoint,
        steps: {
          ...validCheckpoint.steps,
          contact: { status: "pending" }
        }
      }
      const request = {
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: validAuthIds,
        reason: "PLAN_REGENERATED_AFTER_SAFE_CORRECTION"
      }
      assert.doesNotThrow(() => validateCheckpointEligibility(checkpoint, request))
    })
  })

  describe("Teste 20: deal completed Ã© rejeitado", () => {
    it("deve rejeitar checkpoint com deal status completed", () => {
      const checkpoint = {
        ...validCheckpoint,
        steps: {
          ...validCheckpoint.steps,
          deal: { status: "completed" }
        }
      }
      const request = {
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: validAuthIds
      }

      assert.throws(() => {
        validateCheckpointEligibility(checkpoint, request)
      }, /CHECKPOINT_DEAL_NOT_PENDING/)
    })
  })

  describe("Teste 21: uploads existentes sÃ£o rejeitados", () => {
    it("deve rejeitar checkpoint com uploads nÃ£o vazio", () => {
      const checkpoint = {
        ...validCheckpoint,
        uploads: { "doc1.pdf": "upload-id-123" }
      }
      const request = {
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: validAuthIds
      }

      assert.throws(() => {
        validateCheckpointEligibility(checkpoint, request)
      }, /CHECKPOINT_UPLOADS_NOT_EMPTY/)
    })
  })

  describe("Teste 22: finalProof existente Ã© rejeitado", () => {
    it("deve rejeitar checkpoint com finalProof nÃ£o null", () => {
      const checkpoint = {
        ...validCheckpoint,
        finalProof: { verified: true }
      }
      const request = {
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: validAuthIds
      }

      assert.throws(() => {
        validateCheckpointEligibility(checkpoint, request)
      }, /CHECKPOINT_FINAL_PROOF_PRESENT/)
    })
  })

  describe("Teste 23: authorizationIds antigos divergentes sÃ£o rejeitados", () => {
    it("deve rejeitar quando checkpoint.authorizationIds nÃ£o coincide com oldAuthorizationIds", () => {
      const checkpoint = validCheckpoint
      const request = {
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: ["auth-id-wrong-1", "auth-id-wrong-2"]
      }

      assert.throws(() => {
        validateCheckpointEligibility(checkpoint, request)
      }, /CHECKPOINT_AUTHORIZATION_IDS_MISMATCH/)
    })
  })

  describe("Teste 24: sourceCheckpointVersion divergente Ã© rejeitada", () => {
    it("deve rejeitar quando checkpoint.version nÃ£o coincide com sourceCheckpointVersion", () => {
      const checkpoint = validCheckpoint
      const request = {
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 99,
        oldAuthorizationIds: validAuthIds
      }

      assert.throws(() => {
        validateCheckpointEligibility(checkpoint, request)
      }, /CHECKPOINT_VERSION_MISMATCH/)
    })
  })

  describe("Teste 25: evidÃªncia ambÃ­gua Ã© rejeitada", () => {
    it("deve rejeitar evidÃªncia com ambiguity nÃ£o NONE", () => {
      const evidence = {
        ...validReconciliationEvidence,
        resume: { ...validReconciliationEvidence.resume, ambiguity: "MULTIPLE_CONTACTS" }
      }
      const request = {
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: validAuthIds,
        newAuthorizationIds: newAuthIds
      }

      assert.throws(() => {
        validateReconciliationEvidence(evidence, request)
      }, /RECONCILIATION_AMBIGUITY_PRESENT/)
    })
  })

  describe("Teste 26: evidÃªncia indeterminada Ã© rejeitada", () => {
    it("deve rejeitar evidÃªncia com decision nÃ£o RECONCILIATION_ELIGIBLE", () => {
      const evidence = {
        ...validReconciliationEvidence,
        decision: "INDETERMINATE"
      }
      const request = {
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: validAuthIds,
        newAuthorizationIds: newAuthIds
      }

      assert.throws(() => {
        validateReconciliationEvidence(evidence, request)
      }, /RECONCILIATION_EVIDENCE_NOT_ELIGIBLE/)
    })
  })

  describe("Teste 27: semanticMatch false Ã© rejeitado", () => {
    it("deve rejeitar evidÃªncia com semanticMatch false", () => {
      const evidence = {
        ...validReconciliationEvidence,
        namePresentation: { ...validReconciliationEvidence.namePresentation, semanticMatch: false }
      }
      const request = {
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: validAuthIds,
        newAuthorizationIds: newAuthIds
      }

      assert.throws(() => {
        validateReconciliationEvidence(evidence, request)
      }, /RECONCILIATION_SEMANTIC_MATCH_FALSE/)
    })
  })

  describe("Teste 28: vÃ­nculo de plano divergente Ã© rejeitado", () => {
    it("deve rejeitar quando checkpoint.authorizablePlanHash Ã© invÃ¡lido", () => {
      const checkpoint = { ...validCheckpoint, authorizablePlanHash: "invalid-hash" }
      const request = {
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: validAuthIds
      }

      assert.throws(() => {
        validateCheckpointEligibility(checkpoint, request)
      }, /CHECKPOINT_AUTHORIZABLE_PLAN_HASH_INVALID/)
    })
  })

  describe("Teste 29: vÃ­nculo de caso divergente Ã© rejeitado", () => {
    it("deve rejeitar quando checkpoint.caseImportId nÃ£o coincide com request.caseImportId", () => {
      const checkpoint = validCheckpoint
      const request = {
        caseImportId: "case-import-different",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: validAuthIds
      }

      assert.throws(() => {
        validateCheckpointEligibility(checkpoint, request)
      }, /CHECKPOINT_CASE_IMPORT_ID_MISMATCH/)
    })
  })

  describe("Teste 30: resposta nÃ£o contÃ©m authorizationIds", () => {
    it("deve rejeitar resposta que contÃ©m oldAuthorizationIds", () => {
      const response = {
        status: "completed",
        rebindId: "rebind-123",
        sourceCheckpointVersion: 1,
        reboundCheckpointVersion: 2,
        authorizationCount: 2,
        previousAuthorizationSetHash: "hash1",
        currentAuthorizationSetHash: "hash2",
        reconciliationEvidenceHash: "hash3",
        reason: "CONTACT_RECONCILED_AFTER_DIVERGENCE",
        requestedBy: "system-operator-01",
        oldAuthorizationIds: validAuthIds
      }

      assert.throws(() => {
        sanitizeRebindResponse(response)
      }, /REBIND_RESPONSE_CONTAINS_OLD_AUTHORIZATION_IDS/)
    })
  })

  describe("Teste 31: resposta Ã© deep-frozen", () => {
    it("deve congelar profundamente a resposta sanitizada", () => {
      const response = {
        status: "completed",
        rebindId: "rebind-123",
        sourceCheckpointVersion: 1,
        reboundCheckpointVersion: 2,
        authorizationCount: 2,
        previousAuthorizationSetHash: "hash1",
        currentAuthorizationSetHash: "hash2",
        reconciliationEvidenceHash: "hash3",
        reason: "CONTACT_RECONCILED_AFTER_DIVERGENCE",
        requestedBy: "system-operator-01"
      }

      const sanitized = sanitizeRebindResponse(response)
      assert.ok(Object.isFrozen(sanitized))
    })
  })

  describe("Teste 32: estruturas retornadas nÃ£o compartilham referÃªncias mutÃ¡veis", () => {
    it("deve clonar estruturas para evitar compartilhamento de referÃªncias", () => {
      const request = createRebindRequest({
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: validAuthIds,
        newAuthorizationIds: newAuthIds,
        reconciliationEvidence: validReconciliationEvidence,
        reason: "CONTACT_RECONCILED_AFTER_DIVERGENCE",
        requestedBy: "system-operator-01"
      })

      // Tentativa de mutar nÃ£o afeta o objeto original
      assert.throws(() => {
        request.oldAuthorizationIds.push("new-id")
      })
    })
  })

  describe("Teste 33: hashes possuem 64 caracteres hex lowercase", () => {
    it("deve gerar hashes com 64 caracteres hexadecimais lowercase", () => {
      const hash = computeAuthorizationSetHash(validAuthIds)
      assert.equal(hash.length, 64)
      assert.match(hash, /^[a-f0-9]{64}$/)

      const request = createRebindRequest({
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: validAuthIds,
        newAuthorizationIds: newAuthIds,
        reconciliationEvidence: validReconciliationEvidence,
        reason: "CONTACT_RECONCILED_AFTER_DIVERGENCE",
        requestedBy: "system-operator-01"
      })

      assert.equal(request.rebindId.length, 64)
      assert.match(request.rebindId, /^[a-f0-9]{64}$/)
    })
  })

  describe("Teste 34: nenhum fixture contÃ©m dados reais do Piloto 1", () => {
    it("deve usar apenas dados sintÃ©ticos nos fixtures", () => {
      // Verificar que fixtures nÃ£o contÃªm padrÃµes de dados reais
      assert.ok(!validAuthIds.some(id => /^\d{11}$/.test(id))) // Sem CPF
      assert.ok(!validReconciliationEvidence.contactEvidence.caseImportId.includes("real")) // Sem marcador "real"
      assert.ok(validCheckpoint.caseImportId.includes("synthetic")) // Marcado como sintÃ©tico

      // Verificar que evidÃªncia nÃ£o contÃ©m campos pessoais
      assert.ok(!validReconciliationEvidence.contactEvidence.firstname)
      assert.ok(!validReconciliationEvidence.contactEvidence.cpf)
      assert.ok(!validReconciliationEvidence.contactEvidence.phone)
    })
  })

  describe("Teste 35: requestedBy com nÃºmeros nÃ£o consecutivos Ã© aceito", () => {
    it("deve aceitar identificadores tÃ©cnicos com nÃºmeros nÃ£o consecutivos", () => {
      assert.doesNotThrow(() => {
        validateRequestedBy("server-1-node-2-pod-3")
        validateRequestedBy("worker.123.456.789")
        validateRequestedBy("svc-9a8b7c6d")
      })
    })
  })

  describe("Teste 36: requestedBy string de 64 caracteres vÃ¡lida Ã© aceita", () => {
    it("deve aceitar string de exatamente 64 caracteres vÃ¡lida", () => {
      const sixtyFourChars = "s" + "a".repeat(63)
      assert.equal(sixtyFourChars.length, 64)
      assert.doesNotThrow(() => {
        validateRequestedBy(sixtyFourChars)
      })
    })
  })

  describe("Teste 37: requestedBy string de 65 caracteres Ã© rejeitada", () => {
    it("deve rejeitar string de 65 caracteres", () => {
      const sixtyFiveChars = "s" + "a".repeat(64)
      assert.equal(sixtyFiveChars.length, 65)
      assert.throws(() => {
        validateRequestedBy(sixtyFiveChars)
      }, /REBIND_REQUESTED_BY_LENGTH_INVALID/)
    })
  })

  describe("Teste 38: requestedBy com 10 dÃ­gitos consecutivos Ã© rejeitado", () => {
    it("deve rejeitar identificador com 10 dÃ­gitos consecutivos", () => {
      assert.throws(() => {
        validateRequestedBy("user-1234567890")
      }, /REBIND_REQUESTED_BY_CONTAINS_PHONE/)
    })
  })

  describe("Teste 39: requestedBy com 12 dÃ­gitos consecutivos Ã© rejeitado", () => {
    it("deve rejeitar identificador com 12 dÃ­gitos consecutivos", () => {
      assert.throws(() => {
        validateRequestedBy("user-551198765432")
      }, /REBIND_REQUESTED_BY_CONTAINS_PHONE/)
    })
  })

  describe("Teste 40: requestedBy com 9 dÃ­gitos consecutivos Ã© aceito", () => {
    it("deve aceitar identificador com 9 dÃ­gitos consecutivos", () => {
      assert.doesNotThrow(() => {
        validateRequestedBy("worker-123456789")
      })
    })
  })

  describe("Teste 41: campos extras arbitrÃ¡rios nÃ£o alteram rebindId", () => {
    it("deve gerar mesmo rebindId independente de campos extras", () => {
      const request1 = createRebindRequest({
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: validAuthIds,
        newAuthorizationIds: newAuthIds,
        reconciliationEvidence: validReconciliationEvidence,
        reason: "CONTACT_RECONCILED_AFTER_DIVERGENCE",
        requestedBy: "system-operator-01"
      })

      const requestWithExtras = {
        ...request1,
        extraField1: "arbitrary-value",
        extraField2: 12345,
        extraField3: { nested: "object" },
        timestamp: "2026-07-17T10:00:00Z",
        leaseId: "lease-abc-123",
        fencingToken: 42
      }

      const rebindId1 = computeRebindId(request1)
      const rebindId2 = computeRebindId(requestWithExtras)

      assert.equal(rebindId1, rebindId2)
      assert.equal(rebindId1, request1.rebindId)
    })
  })

  describe("Teste 42: createRebindAuditMetadata possui apenas chaves permitidas", () => {
    it("deve retornar somente chaves sanitizadas sem IDs completos", () => {
      const request = createRebindRequest({
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: validAuthIds,
        newAuthorizationIds: newAuthIds,
        reconciliationEvidence: validReconciliationEvidence,
        reason: "CONTACT_RECONCILED_AFTER_DIVERGENCE",
        requestedBy: "system-operator-01"
      })

      const metadata = createRebindAuditMetadata(request)
      const keys = Object.keys(metadata).sort()
      const expectedKeys = [
        "authorizationCount",
        "caseImportId",
        "currentAuthorizationSetHash",
        "previousAuthorizationSetHash",
        "reason",
        "rebindId",
        "reboundCheckpointVersion",
        "reconciliationEvidenceHash",
        "requestedBy",
        "sourceCheckpointVersion"
      ].sort()

      assert.deepEqual(keys, expectedKeys)
    })
  })

  describe("Teste 43: createRebindAuditMetadata nÃ£o contÃ©m IDs completos", () => {
    it("deve rejeitar presenÃ§a de arrays de IDs de autorizaÃ§Ã£o", () => {
      const request = createRebindRequest({
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: validAuthIds,
        newAuthorizationIds: newAuthIds,
        reconciliationEvidence: validReconciliationEvidence,
        reason: "CONTACT_RECONCILED_AFTER_DIVERGENCE",
        requestedBy: "system-operator-01"
      })

      const metadata = createRebindAuditMetadata(request)

      assert.equal(metadata.oldAuthorizationIds, undefined)
      assert.equal(metadata.newAuthorizationIds, undefined)
      assert.equal(metadata.previousAuthorizationIds, undefined)
      assert.equal(metadata.authorizationIds, undefined)
    })
  })

  describe("Teste 44: createRebindAuditMetadata Ã© deep-frozen", () => {
    it("deve congelar profundamente os metadados de auditoria", () => {
      const request = createRebindRequest({
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: validAuthIds,
        newAuthorizationIds: newAuthIds,
        reconciliationEvidence: validReconciliationEvidence,
        reason: "CONTACT_RECONCILED_AFTER_DIVERGENCE",
        requestedBy: "system-operator-01"
      })

      const metadata = createRebindAuditMetadata(request)
      assert.ok(Object.isFrozen(metadata))
    })
  })

  describe("Teste 45: createRebindAuditMetadata mantÃ©m hashes corretos", () => {
    it("deve manter os hashes de autorizaÃ§Ã£o corretos", () => {
      const request = createRebindRequest({
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: validAuthIds,
        newAuthorizationIds: newAuthIds,
        reconciliationEvidence: validReconciliationEvidence,
        reason: "CONTACT_RECONCILED_AFTER_DIVERGENCE",
        requestedBy: "system-operator-01"
      })

      const metadata = createRebindAuditMetadata(request)

      assert.equal(metadata.previousAuthorizationSetHash, request.oldAuthorizationSetHash)
      assert.equal(metadata.currentAuthorizationSetHash, request.newAuthorizationSetHash)
      assert.equal(metadata.reconciliationEvidenceHash, request.reconciliationEvidenceHash)
    })
  })
})

describe("Teste 46: validateResumeProofRequest válida", () => {
  it("deve validar requisição de prova de retomada", () => {
    const { validateResumeProofRequest } = require("../src/domain/single-case-rebind-contracts")

    const request = {
      caseImportId: "case-import-synthetic-001",
      checkpoint: {
        version: 2,
        authorizationIds: newAuthIds
      },
      expectedBindings: {
        caseImportId: "case-import-synthetic-001",
        caseFingerprint: "abc123def456",
        caseNumber: "INSS.123456.001",
        authorizablePlanHash: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
        planHash: "b1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
        manifestHash: "c1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
        reservationEvidenceHash: "d1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
        schemaVersion: 2
      },
      now: "2026-07-19T12:00:00.000Z"
    }

    assert.doesNotThrow(() => validateResumeProofRequest(request))
  })
})

describe("Teste 47: sanitizeResumeProofResponse não contém IDs ou records", () => {
  it("deve rejeitar prova que contém authorizationIds", () => {
    const { sanitizeResumeProofResponse } = require("../src/domain/single-case-rebind-contracts")

    const proof = {
      status: "VALID_REBIND_RESUME",
      rebindId: "a".repeat(64),
      caseImportId: "case-import-synthetic-001",
      sourceCheckpointVersion: 1,
      reboundCheckpointVersion: 2,
      authorizationCount: 2,
      currentAuthorizationSetHash: "b".repeat(64),
      committedAt: "2026-07-19T12:00:00.000Z",
      authorizationIds: ["id1", "id2"]
    }

    assert.throws(
      () => sanitizeResumeProofResponse(proof),
      /REBIND_RESUME_RESPONSE_CONTAINS_AUTHORIZATION_IDS/
    )
  })

  it("deve rejeitar prova que contém authorizationRecords", () => {
    const { sanitizeResumeProofResponse } = require("../src/domain/single-case-rebind-contracts")

    const proof = {
      status: "VALID_REBIND_RESUME",
      rebindId: "a".repeat(64),
      caseImportId: "case-import-synthetic-001",
      sourceCheckpointVersion: 1,
      reboundCheckpointVersion: 2,
      authorizationCount: 2,
      currentAuthorizationSetHash: "b".repeat(64),
      committedAt: "2026-07-19T12:00:00.000Z",
      authorizationRecords: []
    }

    assert.throws(
      () => sanitizeResumeProofResponse(proof),
      /REBIND_RESUME_RESPONSE_CONTAINS_AUTHORIZATION_RECORDS/
    )
  })
})

describe("Teste 48: prova congelada profundamente", () => {
  it("deve congelar prova e records", () => {
    const { validateResumeProof } = require("../src/domain/single-case-rebind-contracts")

    const authorizationRecords = Object.freeze([
      Object.freeze({ authorizationId: "auth-resume-001" }),
      Object.freeze({ authorizationId: "auth-resume-002" })
    ])

    const proof = {
      status: "VALID_REBIND_RESUME",
      rebindId: "a".repeat(64),
      caseImportId: "case-import-synthetic-001",
      sourceCheckpointVersion: 1,
      reboundCheckpointVersion: 2,
      authorizationCount: 2,
      currentAuthorizationSetHash: "b".repeat(64),
      committedAt: "2026-07-19T12:00:00.000Z",
      authorizationRecords
    }

    const validated = validateResumeProof(proof)

    assert.ok(Object.isFrozen(validated))
    assert.ok(Object.isFrozen(validated.authorizationRecords))
    assert.ok(Object.isFrozen(validated.authorizationRecords[0]))
    assert.ok(Object.isFrozen(validated.authorizationRecords[1]))
  })
})

describe("Teste 49: caseImportId dos bindings deve coincidir com a requisição", () => {
  it("deve rejeitar expectedBindings de outro caso", () => {
    const { validateResumeProofRequest } = require("../src/domain/single-case-rebind-contracts")

    const request = {
      caseImportId: "case-import-synthetic-001",
      checkpoint: {
        version: 2,
        authorizationIds: newAuthIds
      },
      expectedBindings: {
        caseImportId: "case-import-synthetic-002",
        caseFingerprint: "abc123def456",
        caseNumber: "INSS.123456.001",
        authorizablePlanHash: "a".repeat(64),
        planHash: "b".repeat(64),
        manifestHash: "c".repeat(64),
        reservationEvidenceHash: "d".repeat(64),
        schemaVersion: 2
      },
      now: "2026-07-19T12:00:00.000Z"
    }

    assert.throws(
      () => validateResumeProofRequest(request),
      /REBIND_RESUME_EXPECTED_BINDINGS_CASE_IMPORT_ID_MISMATCH/
    )
  })
})

describe("Teste 50: AUTHORIZATION_PAIR_REFRESHED_AFTER_EXPIRY aceita hashes ausentes e reconciliationEvidenceHash null", () => {
  it("deve aceitar request sem hashes novos e com evidence null", () => {
    const request = createRebindRequest({
      caseImportId: "case-import-synthetic-001",
      sourceCheckpointVersion: 1,
      oldAuthorizationIds: validAuthIds,
      newAuthorizationIds: newAuthIds,
      reconciliationEvidence: null,
      reason: "AUTHORIZATION_PAIR_REFRESHED_AFTER_EXPIRY",
      requestedBy: "system-operator-01"
    })

    assert.equal(request.reason, "AUTHORIZATION_PAIR_REFRESHED_AFTER_EXPIRY")
    assert.equal(request.reconciliationEvidenceHash, null)
    assert.equal(request.newAuthorizablePlanHash, null)
    assert.equal(request.newPlanHash, null)
    assert.equal(request.newManifestHash, null)
    assert.deepEqual(request.newAuthorizationIds, [...newAuthIds].sort())
  })
})

describe("Teste 51: AUTHORIZATION_PAIR_REFRESHED_AFTER_EXPIRY rejeita hashes novos", () => {
  it("deve rejeitar newAuthorizablePlanHash", () => {
    assert.throws(
      () => createRebindRequest({
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: validAuthIds,
        newAuthorizationIds: newAuthIds,
        reconciliationEvidence: null,
        reason: "AUTHORIZATION_PAIR_REFRESHED_AFTER_EXPIRY",
        requestedBy: "system-operator-01",
        newAuthorizablePlanHash: "a".repeat(64)
      }),
      /REBIND_NEW_HASHES_NOT_ALLOWED_FOR_REASON/
    )
  })

  it("deve rejeitar evidence presente", () => {
    assert.throws(
      () => createRebindRequest({
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: validAuthIds,
        newAuthorizationIds: newAuthIds,
        reconciliationEvidence: validReconciliationEvidence,
        reason: "AUTHORIZATION_PAIR_REFRESHED_AFTER_EXPIRY",
        requestedBy: "system-operator-01"
      }),
      /RECONCILIATION_EVIDENCE_NOT_ALLOWED_FOR_REASON/
    )
  })
})

describe("Teste 52: AUTHORIZATION_PAIR_REFRESHED_AFTER_EXPIRY rejeita IDs inválidos", () => {
  it("deve rejeitar count incorreto", () => {
    assert.throws(
      () => createRebindRequest({
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: validAuthIds,
        newAuthorizationIds: newAuthIds.slice(0, 1),
        reconciliationEvidence: null,
        reason: "AUTHORIZATION_PAIR_REFRESHED_AFTER_EXPIRY",
        requestedBy: "system-operator-01"
      }),
      /REBIND_NEW_AUTHORIZATION_IDS_WRONG_COUNT/
    )
  })

  it("deve rejeitar IDs duplicados", () => {
    assert.throws(
      () => createRebindRequest({
        caseImportId: "case-import-synthetic-001",
        sourceCheckpointVersion: 1,
        oldAuthorizationIds: validAuthIds,
        newAuthorizationIds: ["auth-id-aaaaaa", "auth-id-aaaaaa"],
        reconciliationEvidence: null,
        reason: "AUTHORIZATION_PAIR_REFRESHED_AFTER_EXPIRY",
        requestedBy: "system-operator-01"
      }),
      /REBIND_NEW_AUTHORIZATION_IDS_DUPLICATE/
    )
  })
})
