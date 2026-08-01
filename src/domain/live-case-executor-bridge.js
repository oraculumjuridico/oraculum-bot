const { createCanonicalCasePlan, validateCanonicalCasePlan, PLAN_STATUS } = require("./canonical-case-plan")
const { createCanonicalCaseExecutor } = require("./canonical-case-executor")
const { createHubSpotTaskService } = require("./hubspot-task-service")
const { normalizeDriveFolderResult } = require("./drive-files")

function clean(value) {
  return value === null || value === undefined ? null : String(value).trim() || null
}

function comparableName(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim().toLowerCase()
}

function buildCanonicalPlan(u, context = {}) {
  const documents = (u.documents || []).map(doc => ({
    sha256: clean(doc.sha256),
    fileId: clean(doc.fileId || doc.id),
    name: clean(doc.name || doc.nome),
    mimeType: clean(doc.mimeType),
    type: clean(doc.type || doc.tipoDocumental),
    partyRole: clean(doc.partyRole || doc.documentOwnerRole),
    confidence: Number.isFinite(Number(doc.confidence ?? doc.confianca)) ? Number(doc.confidence ?? doc.confianca) : null,
    status: clean(doc.status) || "received",
    quarantineReason: clean(doc.quarantineReason),
    originalPreserved: doc.originalPreserved !== false
  }))

  const plan = createCanonicalCasePlan({
    source: context.source || "live_whatsapp_client",
    identity: {
      name: clean(u.nome || u.nomeContato),
      cpf: clean(u.cpf || u._cpf),
      dateOfBirth: clean(u.dataNascimento),
      phone: clean(u.whatsappContato || u._numero),
      email: clean(u.email),
      provenance: { stage: u.stage, confirmed: Boolean(u.nomeConfirmado), source: context.source || "live" },
      ambiguous: Boolean(u._identityAmbiguous)
    },
    contact: {
      action: u.contatoId ? "verify" : "resolve",
      id: clean(u.contatoId),
      properties: context.contactProperties || {},
      ambiguous: Boolean(u._contactAmbiguous)
    },
    deal: {
      action: u.negocioId ? "verify" : "resolve",
      id: clean(u.negocioId),
      properties: context.dealProperties || {},
      ambiguous: Boolean(u._dealAmbiguous)
    },
    association: {
      required: true,
      verified: Boolean(u.contatoId && u.negocioId),
      ambiguous: Boolean(u._associationAmbiguous)
    },
    caseNumber: {
      value: clean(u.numeroCaso),
      reservationRequired: !u.numeroCaso
    },
    confirmedData: u.confirmedData || {},
    inferredData: u.inferredData || {},
    divergences: u.divergences || [],
    parties: u.parties || [],
    documents: {
      received: documents,
      pending: (u.documentosPendentes || []).map(d => clean(d.sha256 || d.name)).filter(Boolean)
    },
    drive: {
      canonicalFolderId: clean(u.pastaDriveId),
      canonicalFolderUrl: clean(u.pastaDriveLink),
      quarantineFolderId: clean(u._pastaDriveQuarentenaId),
      ambiguous: Boolean(u._driveAmbiguous),
      uploads: (u.documents || []).filter(d => d.fileId || d.id).map(d => ({ fileId: clean(d.fileId || d.id), sha256: clean(d.sha256) }))
    },
    hubspot: {
      contactUpdates: context.contactUpdates || {},
      dealUpdates: context.dealUpdates || {}
    },
    tasks: context.tasks || [],
    nextAction: clean(u.nextAction),
    review: {
      required: Boolean(u._reviewRequired),
      blockers: (u._reviewBlockers || []).map(b => clean(b)).filter(Boolean)
    },
    notifications: {
      internal: context.internalNotifications || [],
      external: [],
      externalAuthorized: false
    },
    createdAt: u._canonicalPlanCreatedAt || new Date().toISOString()
  })

  const validation = validateCanonicalCasePlan(plan)
  if (!validation.ok) {
    const error = new Error(`canonical case plan invalid: ${validation.errors.join(",")}`)
    error.code = "CANONICAL_CASE_PLAN_INVALID"
    error.errors = validation.errors
    throw error
  }

  return plan
}

function createLiveCaseFlow(deps = {}) {
  const checkpointRepository = deps.checkpointRepository || {
    async load() { return null },
    async save() { return }
  }

  const hubspotToken = deps.hubspotToken || process.env.HUBSPOT_TOKEN
  const taskService = createHubSpotTaskService(
    deps.taskAdapter || {
      async findByMarker(marker) {
        if (!hubspotToken) return []
        const axios = require("axios")
        const response = await axios.post("https://api.hubapi.com/crm/v3/objects/tasks/search", {
          filterGroups: [{ filters: [{ propertyName: "hs_task_body", operator: "CONTAINS_TOKEN", value: marker }] }],
          properties: ["hs_task_subject", "hs_task_body", "hs_task_status", "hs_timestamp", "hubspot_owner_id"],
          limit: 100
        }, { headers: { Authorization: `Bearer ${hubspotToken}`, "Content-Type": "application/json" } })
        return response.data?.results || []
      },
      async create(properties) {
        const axios = require("axios")
        const response = await axios.post("https://api.hubapi.com/crm/v3/objects/tasks", { properties }, { headers: { Authorization: `Bearer ${hubspotToken}`, "Content-Type": "application/json" } })
        return response.data
      },
      async update(id, properties) {
        const axios = require("axios")
        const response = await axios.patch(`https://api.hubapi.com/crm/v3/objects/tasks/${encodeURIComponent(id)}`, { properties }, { headers: { Authorization: `Bearer ${hubspotToken}`, "Content-Type": "application/json" } })
        return response.data
      },
      async associate(taskId, objectType, objectId) {
        const axios = require("axios")
        const associationType = objectType === "contacts" ? "task_to_contact" : "task_to_deal"
        await axios.put(
          `https://api.hubapi.com/crm/v3/objects/tasks/${encodeURIComponent(taskId)}/associations/${objectType}/${encodeURIComponent(objectId)}/${associationType}`,
          {},
          { headers: { Authorization: `Bearer ${hubspotToken}`, "Content-Type": "application/json" } }
        )
        return true
      },
      async verify(id, marker, expected = {}) {
        const axios = require("axios")
        const response = await axios.get(
          `https://api.hubapi.com/crm/v3/objects/tasks/${encodeURIComponent(id)}?properties=hs_task_body,hs_task_status,hs_timestamp&associations=contacts,deals`,
          { headers: { Authorization: `Bearer ${hubspotToken}`, "Content-Type": "application/json" } }
        )
        const record = response.data
        const contacts = (record?.associations?.contacts?.results || []).map(item => String(item.id))
        const deals = (record?.associations?.deals?.results || []).map(item => String(item.id))
        return {
          ok: Boolean(record?.properties?.hs_task_body?.includes(marker)) &&
            (!expected.contactId || contacts.includes(String(expected.contactId))) &&
            (!expected.dealId || deals.includes(String(expected.dealId))),
          record
        }
      }
    }
  )

  const adapters = {
    identity: async (plan, checkpoint) => {
      if (!plan.identity?.name) throw new Error("identity_name_missing")
      if (!plan.identity?.cpf && !plan.identity?.phone && !plan.identity?.email) throw new Error("identity_safe_key_missing")
      if (plan.identity?.ambiguous) throw new Error("identity_ambiguous")
      return { verified: true, name: plan.identity.name, cpf: plan.identity.cpf, phone: plan.identity.phone, email: plan.identity.email }
    },

    contact: async (plan, checkpoint) => {
      const { hsBuscarPorCpf, hsBuscarPorPhone, hsCriarContato, hsAtualizarContato, montarPropsContatoHubSpot, montarPropsAusentesContatoHubSpot } = deps
      if (!hsCriarContato) return { id: plan.contact?.id, action: "skipped" }

      let contactId = plan.contact?.id
      let action = "skipped"
      const usuario = checkpoint.context.u || {}
      let pastaDriveMissing = false

      let existing = null
      if (!contactId && plan.identity?.cpf && typeof hsBuscarPorCpf === "function") {
        existing = await hsBuscarPorCpf(plan.identity.cpf)
        contactId = existing?.id || null
      }
      if (!contactId && plan.identity?.phone) {
        existing = await hsBuscarPorPhone(plan.identity.phone)
        const existingName = comparableName([existing?.properties?.firstname, existing?.properties?.lastname].filter(Boolean).join(" "))
        const expectedName = comparableName(plan.identity?.name)
        if (existing?.id && existingName && expectedName && existingName !== expectedName) {
          throw Object.assign(new Error("telefone pertence a contato incompatível"), { code: "HUBSPOT_PHONE_IDENTITY_CONFLICT" })
        }
        contactId = existing?.id || null
        if (contactId && existing?.properties?.firstname && !usuario.nomeHubspot) {
          usuario.nomeHubspot = existing.properties.firstname
        }
      }

      if (!contactId) {
        const props = montarPropsContatoHubSpot(plan.identity.phone, usuario)
        contactId = await hsCriarContato(plan.identity.phone, usuario)
        action = "created"
        pastaDriveMissing = true
      } else {
        action = "verified"
        const props = montarPropsContatoHubSpot(plan.identity.phone, usuario)
        existing = existing || (plan.identity?.phone ? await hsBuscarPorPhone(plan.identity.phone) : null)
        pastaDriveMissing = !String(existing?.properties?.pasta_drive || "").trim()
        const missing = montarPropsAusentesContatoHubSpot(existing, props)
        if (Object.keys(missing).length) {
          await hsAtualizarContato(contactId, missing)
        }
      }

      usuario.contatoId = contactId
      return { id: contactId, action, verified: Boolean(contactId), pastaDriveMissing }
    },

    deal: async (plan, checkpoint) => {
      const { hsCriarNegocio, hsAtualizarNegocioSerializado, hsAtualizarEtapaNegocio, hsBuscarNegocioAbertoDoContato, montarTituloNegocioHubSpot, getHubSpotDealStateProps } = deps
      if (!hsCriarNegocio) return { id: plan.deal?.id, action: "skipped" }

      let dealId = plan.deal?.id
      const usuario = checkpoint.context.u || {}
      const contactId = checkpoint.steps.contact?.result?.id || usuario.contatoId
      let action = "skipped"

      if (!dealId && contactId && !usuario._novoCasoDeCliente) {
        dealId = await hsBuscarNegocioAbertoDoContato(contactId)
        if (dealId) usuario.negocioId = dealId
      }

      const dealname = montarTituloNegocioHubSpot(
        { ...usuario, numeroCaso: plan.caseNumber?.value, negocioStageId: deps.HS_STAGE?.ANALISE },
        { HS_STAGE: deps.HS_STAGE, stage: deps.HS_STAGE?.ANALISE }
      )

      if (!dealId) {
        dealId = await hsCriarNegocio(usuario, { stage: deps.HS_STAGE?.ANALISE })
        usuario.negocioId = dealId
        action = "created"
      } else {
        action = "verified"
        await hsAtualizarNegocioSerializado(dealId, { dealname })
      }

      if (plan.caseNumber?.value) {
        await hsAtualizarNegocioSerializado(dealId, {
          numero_de_caso: plan.caseNumber.value,
          dealname
        })
      }
      await hsAtualizarEtapaNegocio(dealId, deps.HS_STAGE?.ANALISE)
      usuario.negocioStageId = deps.HS_STAGE?.ANALISE

      return { id: dealId, action, verified: Boolean(dealId) }
    },

    association: async (plan, checkpoint) => {
      const { hsAssociar } = deps
      if (!hsAssociar) return { id: null, action: "skipped" }
      const usuario = checkpoint.context.u || {}
      const contactId = checkpoint.steps.contact?.result?.id || usuario.contatoId
      const dealId = checkpoint.steps.deal?.result?.id || usuario.negocioId
      if (!contactId || !dealId) return { id: null, action: "skipped" }
      const associated = await hsAssociar(contactId, dealId)
      return { id: associated ? `${contactId}-${dealId}` : null, action: associated ? "created" : "failed", verified: associated }
    },

    case_number: async (plan, checkpoint) => {
      if (plan.caseNumber?.value) return { value: plan.caseNumber.value, action: "reserved" }
      throw new Error("case_number_missing")
    },

    drive: async (plan, checkpoint) => {
      const { criarPastaCliente } = deps
      const usuario = checkpoint.context.u || {}
      const caseNumber = plan.caseNumber?.value
      if (!caseNumber) return { id: plan.drive?.canonicalFolderId, action: "skipped" }

      let folderId = plan.drive?.canonicalFolderId
      let action = "skipped"

      if (!folderId) {
        const pastaRaw = await criarPastaCliente(caseNumber, plan.identity?.name || "Cliente", usuario.area, usuario.situacao, usuario.tipo)
        const pastaNormalizada = normalizeDriveFolderResult(pastaRaw)
        folderId = pastaNormalizada ? pastaNormalizada.id : null
        usuario.pastaDriveId = folderId
        usuario.pastaDriveLink = (pastaNormalizada ? pastaNormalizada.webViewLink : null) || usuario.pastaDriveLink || null
        action = "created"
      } else {
        action = "verified"
      }

      return { id: folderId, action, verified: Boolean(folderId) }
    },

    documents: async (plan, checkpoint) => {
      const { uploadDrive, processarAnaliseDocumentalSegura } = deps
      const folderId = checkpoint.steps.drive?.result?.id || deps.u?.pastaDriveId
      const results = []

      for (const doc of (plan.documents?.received || [])) {
        if (doc.fileId && doc.status === "approved") {
          results.push({ sha256: doc.sha256, fileId: doc.fileId, action: "already_uploaded" })
          continue
        }
        if (doc.status === "quarantined" || doc.status === "review_required") {
          results.push({ sha256: doc.sha256, action: "quarantined", reason: doc.quarantineReason })
          continue
        }
        if (doc.buffer && folderId && uploadDrive) {
          try {
            const uploaded = await uploadDrive(folderId, doc.name || `doc_${doc.sha256?.slice(0, 8)}`, doc.buffer, doc.mimeType)
            if (uploaded?.id) {
              results.push({ sha256: doc.sha256, fileId: uploaded.id, action: "uploaded" })
            } else {
              results.push({ sha256: doc.sha256, action: "upload_failed" })
            }
          } catch (e) {
            results.push({ sha256: doc.sha256, action: "upload_failed", error: e.message })
          }
        } else {
          results.push({ sha256: doc.sha256, action: "pending" })
        }
      }

      return { count: results.length, documents: results }
    },

    hubspot: async (plan, checkpoint) => {
      const { hsAtualizarContato, hsAtualizarNegocioSerializado, getHubSpotDealStateProps } = deps
      const usuario = checkpoint.context.u || {}
      const contactId = checkpoint.steps.contact?.result?.id || usuario.contatoId
      const dealId = checkpoint.steps.deal?.result?.id || usuario.negocioId
      if (!dealId || !hsAtualizarNegocioSerializado) return { updated: false }

      const pastaDriveMissing = checkpoint.steps.contact?.result?.pastaDriveMissing === true
      if (contactId && pastaDriveMissing && usuario.pastaDriveLink && typeof hsAtualizarContato === "function") {
        const contatoAtualizado = await hsAtualizarContato(contactId, { pasta_drive: usuario.pastaDriveLink })
        if (!contatoAtualizado) throw new Error("hubspot_contact_drive_folder_update_failed")
      }

      const props = {
        ...(plan.hubspot?.dealUpdates || {}),
        ...(getHubSpotDealStateProps ? getHubSpotDealStateProps(usuario) : {})
      }
      await hsAtualizarNegocioSerializado(dealId, props)
      return { updated: true, contactId, dealId }
    },

    tasks: async (plan, checkpoint) => {
      const { ensureTask } = taskService
      const usuario = checkpoint.context.u || {}
      const contactId = checkpoint.steps.contact?.result?.id || usuario.contatoId
      const dealId = checkpoint.steps.deal?.result?.id || usuario.negocioId
      const results = []

      for (const taskSpec of (plan.tasks || [])) {
        try {
          const result = await ensureTask({
            ...taskSpec,
            contactId: contactId || taskSpec.contactId,
            dealId: dealId || taskSpec.dealId
          })
          results.push(result)
        } catch (e) {
          results.push({ error: e.message, key: taskSpec.key })
        }
      }

      return { created: results.filter(r => !r.error).length, tasks: results }
    },

    internal_notifications: async (plan, checkpoint) => {
      const { enviarWhatsAppAdmin, hsCriarNota, hsCriarNotaNegocio } = deps
      const usuario = checkpoint.context.u || {}
      const dealId = checkpoint.steps.deal?.result?.id || usuario.negocioId
      const contactId = checkpoint.steps.contact?.result?.id || usuario.contatoId
      const results = []

      for (const notification of (plan.notifications?.internal || [])) {
        try {
          if (notification.type === "whatsapp_admin" && enviarWhatsAppAdmin) {
            await enviarWhatsAppAdmin(notification.message)
            results.push({ type: "whatsapp_admin", sent: true })
          } else if (notification.type === "hubspot_note" && contactId && hsCriarNota) {
            await hsCriarNota(contactId, notification.subject || "NOTIFICACAO", notification.message)
            results.push({ type: "hubspot_note_contact", sent: true })
          } else if (notification.type === "hubspot_deal_note" && dealId && hsCriarNotaNegocio) {
            await hsCriarNotaNegocio(dealId, notification.subject || "NOTIFICACAO", notification.message)
            results.push({ type: "hubspot_note_deal", sent: true })
          }
        } catch (e) {
          results.push({ type: notification.type, error: e.message })
        }
      }

      return { sent: results.filter(r => r.sent).length, notifications: results }
    },

    final_verify: async (plan, checkpoint) => {
      const usuario = checkpoint.context.u || {}
      const contactId = checkpoint.steps.contact?.result?.id || usuario.contatoId
      const dealId = checkpoint.steps.deal?.result?.id || usuario.negocioId
      const folderId = checkpoint.steps.drive?.result?.id || usuario.pastaDriveId
      const association = checkpoint.steps.association?.result

      if (!contactId || !dealId || !folderId || !association?.id || association.verified !== true) {
        throw new Error("final_verify_missing_resources")
      }

      return {
        verified: true,
        contactId,
        dealId,
        folderId,
        associationId: association.id,
        documentsCount: (plan.documents?.received || []).length,
        tasksCount: (plan.tasks || []).length
      }
    }
  }

  const executor = createCanonicalCaseExecutor({
    adapters,
    checkpointRepository
  })

   async function executeLiveCaseFlow(u, context = {}) {
    // ISOCAÇÃO DE EXECUÇÃO: o usuário u e todas as variáveis derivadas
    // (contatoId, negocioId, pastaDriveId, etc.) são mantidos apenas no
    // checkpoint local de esta execução. O objeto global `deps` NÃO é
    // mutado, evitando cross-contaminação entre execuções concorrentes.
    const planoLocal = buildCanonicalPlan(u, context)
    try {
      const result = await executor.execute(planoLocal, { u, ...context })

      if (result.checkpoint) {
        // Aplicar recursos do checkpoint ao usuário local após conclusão bem-sucedida.
        // Cada execução opera em seu próprio objeto u — nenhum estado compartilhado.
        const resources = result.checkpoint.resources || {}
        if (resources.contactId) u.contatoId = u.contatoId || resources.contactId
        if (resources.dealId) u.negocioId = u.negocioId || resources.dealId
        if (resources.caseFolderId) u.pastaDriveId = u.pastaDriveId || resources.caseFolderId

        // Propagar campos mutáveis definidos pelos adaptadores (nomeHubspot, etc.)
        const usuarioFromCheckpoint = result.checkpoint.context.u || {}
        if (usuarioFromCheckpoint.nomeHubspot && !u.nomeHubspot) u.nomeHubspot = usuarioFromCheckpoint.nomeHubspot
        if (usuarioFromCheckpoint.negocioStageId && !u.negocioStageId) u.negocioStageId = usuarioFromCheckpoint.negocioStageId
        if (usuarioFromCheckpoint.pastaDriveLink && !u.pastaDriveLink) u.pastaDriveLink = usuarioFromCheckpoint.pastaDriveLink

        u._canonicalPlanHash = planoLocal.hash
        u._canonicalCheckpoint = result.checkpoint
        u._canonicalPlanStatus = result.planStatus || planoLocal.status
      }

      return { plan: planoLocal, result }
    } catch (error) {
      const checkpointStore = await checkpointRepository.load(planoLocal.hash)
      const partialResources = checkpointStore?.resources || {}
      const interruptedStep = checkpointStore
        ? Object.keys(checkpointStore.steps || {}).find(step =>
            checkpointStore.steps[step].status === "failed" ||
            checkpointStore.steps[step].status === "processing"
          ) || null
        : null
      const hasPartialWrites = Object.keys(partialResources).length > 0

      if (checkpointStore) {
        u._canonicalPlanHash = planoLocal.hash
        u._canonicalCheckpoint = checkpointStore
        u._canonicalPlanStatus = checkpointStore.status
      }

      return {
        plan: planoLocal,
        result: {
          completed: false,
          error: error.message,
          code: error.code,
          planHash: planoLocal.hash,
          planStatus: planoLocal.status,
          interruptedStep,
          partialResources,
          hasPartialWrites,
          partialCheckpoint: checkpointStore
        }
      }
    }
  }

  return { executeLiveCaseFlow, buildCanonicalPlan, taskService }
}

module.exports = {
  createLiveCaseFlow,
  buildCanonicalPlan,
  clean
}
