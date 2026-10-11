const axios = require("axios")
const {
  HS,
  filtrarPropsHubSpot,
  hsAtualizarContato,
  hsAtualizarNegocio
} = require("./hubspot-core")
const {
  sanitizarTextoEntrada,
  normalizarStageKey,
  normalizarTextoCRM
} = require("../utils/text")
const { logDebug, logErroHubSpot } = require("../utils/logging")
const { montarTituloNegocioHubSpot } = require("./hubspot-deal-title")

let deps = {
  HUBSPOT_TOKEN: "",
  HS_STAGE: null,
  hubspotClient: null,
  getHubSpotDealProps: null,
  getHubSpotDealStateProps: null,
  getNomeDeal: null,
  mapearStageParaDealstage: null,
  getNumeroCasoOficialDoNegocio: null,
  restaurarTipoCasoHubSpot: null,
  etapaValida: null,
  serializarEstado: null,
  desserializarEstado: null,
  hidratarUsuarioPersistido: null,
  garantirNomenclaturaJuridicaUsuario: null
}
let HS_STAGES_FINALIZADOS = new Set()
const filasMutacaoNegocio = new Map()
const JANELA_LEAD_INCOMPLETO_MS = 30 * 24 * 60 * 60 * 1000
const HUBSPOT_CASE_PROPERTIES = [
  "dealstage", "dealname", "createdate", "closedate", "hs_lastmodifieddate",
  "description", "resumo_cliente", "descricao_completa", "area_juridica", "urgencia",
  "pasta_drive", "estado_bot_snapshot", "etapa_do_bot", "tipo_de_caso",
  "oraculum_case_subtype", "temperatura_lead", "hs_priority", "numero_de_caso",
  "origem_atendimento", "oraculum_document_status", "oraculum_documents_received",
  "oraculum_documents_pending", "oraculum_analysis_status", "oraculum_review_required",
  "oraculum_next_action"
].join(",")

function dataAtualizacaoNegocio(negocio = {}) {
  const props = negocio.properties || {}
  const valor = props.hs_lastmodifieddate || negocio.updatedAt || props.createdate || negocio.createdAt
  const texto = sanitizarTextoEntrada(valor)
  const ts = texto
    ? (/^\d+$/.test(texto) ? Number(texto) : new Date(texto).getTime())
    : NaN
  return Number.isFinite(ts) ? ts : null
}

function leadIncompletoRetomavel(negocio, agora = Date.now()) {
  if (!negocio || sanitizarTextoEntrada(negocio?.properties?.numero_de_caso)) return false
  const atualizadoEm = dataAtualizacaoNegocio(negocio)
  return atualizadoEm !== null && agora - atualizadoEm >= 0 && agora - atualizadoEm <= JANELA_LEAD_INCOMPLETO_MS
}

function selecionarLeadRetomavel(leads = [], agora = Date.now()) {
  return [...leads]
    .filter(lead => leadIncompletoRetomavel(lead, agora))
    .sort((a, b) => (dataAtualizacaoNegocio(b) || 0) - (dataAtualizacaoNegocio(a) || 0))[0] || null
}

function ordemStageHubSpot(stage) {
  const ordem = [
    deps.HS_STAGE?.LEAD,
    deps.HS_STAGE?.CADASTRO,
    deps.HS_STAGE?.ANALISE,
    deps.HS_STAGE?.AGUARDANDO_DOCS,
    deps.HS_STAGE?.DOCS,
    deps.HS_STAGE?.AGENDAMENTO,
    deps.HS_STAGE?.PROTOCOLO,
    deps.HS_STAGE?.PROCESSO,
    deps.HS_STAGE?.FINAL
  ].filter(Boolean)
  return ordem.indexOf(stage)
}

function movimentoRegressivoHubSpot(stageAtual, novoStage) {
  const atual = ordemStageHubSpot(stageAtual)
  const novo = ordemStageHubSpot(novoStage)
  return atual >= 0 && novo >= 0 && novo < atual
}

function classificacaoGenerica(valor = "") {
  const normalizado = sanitizarTextoEntrada(valor).toLowerCase()
  return !normalizado || ["outros", "outros_livre", "inss_outros", "trab_outros", "bpc_generico"].includes(normalizado)
}

function aplicarContextoAtualHubSpot(u, props = {}) {
  if (!u || !props || typeof props !== "object") return
  if (props.dealstage) u.negocioStageId = props.dealstage
  if (props.numero_de_caso) u.numeroCaso = props.numero_de_caso
  if (props.area_juridica) u.area = props.area_juridica

  const subtipoAtual = u.oraculum_case_subtype || u.subTipo || u.subtipo
  const subtipoHubSpot = sanitizarTextoEntrada(props.oraculum_case_subtype)
  if (subtipoHubSpot && (classificacaoGenerica(subtipoAtual) || !classificacaoGenerica(subtipoHubSpot))) {
    u.oraculum_case_subtype = subtipoHubSpot
    u.subTipo = subtipoHubSpot
  }

  const tipoAtual = u.tipo_de_caso || u.tipoCaso || u.tipo
  const tipoHubSpot = sanitizarTextoEntrada(props.tipo_de_caso)
  if (tipoHubSpot && (classificacaoGenerica(tipoAtual) || !classificacaoGenerica(tipoHubSpot))) {
    u.tipo_de_caso = tipoHubSpot
    u.tipoCaso = tipoHubSpot
  }

  if (!u.numeroCaso && props.temperatura_lead) u.temperatura = props.temperatura_lead
}

async function buscarContextoAtualHubSpot(u) {
  if (!u?.negocioId) return null
  try {
    const res = await axios.get(
      `https://api.hubapi.com/crm/v3/objects/deals/${u.negocioId}?properties=dealstage,dealname,numero_de_caso,area_juridica,tipo_de_caso,oraculum_case_subtype,temperatura_lead`,
      { headers: { Authorization: `Bearer ${deps.HUBSPOT_TOKEN}` } }
    )
    const props = res.data?.properties || null
    if (props) aplicarContextoAtualHubSpot(u, props)
    return props
  } catch (e) {
    logErroHubSpot(e, {
      operation: "buscarContextoAtualNegocio",
      dealId: u.negocioId,
      properties: ["dealstage", "dealname", "numero_de_caso", "area_juridica", "tipo_de_caso", "oraculum_case_subtype", "temperatura_lead"]
    })
    return null
  }
}

async function executarComLockNegocio(dealId, tarefa) {
  const chave = sanitizarTextoEntrada(dealId)
  if (!chave) return tarefa()

  const anterior = filasMutacaoNegocio.get(chave) || Promise.resolve()
  let liberar
  const atual = new Promise(resolve => { liberar = resolve })
  filasMutacaoNegocio.set(chave, atual)

  await anterior.catch(() => {})
  try {
    return await tarefa()
  } finally {
    liberar()
    if (filasMutacaoNegocio.get(chave) === atual) {
      filasMutacaoNegocio.delete(chave)
    }
  }
}

function configurarHubSpotSync(config = {}) {
  deps = { ...deps, ...config }
  HS_STAGES_FINALIZADOS = new Set([deps.HS_STAGE.FINAL])
}

async function hsAtualizarNegocioComEstado(u, props = {}) {
  if (!u?.negocioId) return null
  return executarComLockNegocio(
    u.negocioId,
    async () => {
      const contextoAtual = await buscarContextoAtualHubSpot(u)
      if (!contextoAtual) return null
      return hsAtualizarNegocio(u.negocioId, deps.getHubSpotDealProps(u, props))
    }
  )
}

async function atualizarDealstageSemLock(u, contextoAtual = undefined) {
  if (!u?.negocioId) return null

  // O HubSpot é relido antes da decisão para respeitar hidratação e mudanças
  // manuais, sobretudo os estágios jurídicos protegidos.
  if (contextoAtual === undefined) contextoAtual = await buscarContextoAtualHubSpot(u)
  if (!contextoAtual) return null

  const dealstage = deps.mapearStageParaDealstage(u)
  if (!dealstage) return null

  const stageAtual = sanitizarTextoEntrada(u.negocioStageId)
  const stagePendente = sanitizarTextoEntrada(u._negocioStageIdPendente)
  const stageEfetivo = stagePendente || stageAtual
  if (stageEfetivo === dealstage) return null
  if (movimentoRegressivoHubSpot(stageEfetivo, dealstage)) {
    logDebug(`[HUBSPOT] Movimento regressivo ignorado: ${stageEfetivo} -> ${dealstage}`)
    return null
  }

  logDebug(`[HUBSPOT] Atualizando estágio do negócio: ${stageAtual || "-"} ? ${dealstage}`)
  u._negocioStageIdPendente = dealstage

  const dealId = await hsAtualizarNegocio(u.negocioId, {
    dealstage,
    dealname: montarTituloNegocioHubSpot(
      { ...u, negocioStageId: dealstage },
      { HS_STAGE: deps.HS_STAGE, stage: dealstage }
    )
  })
  if (dealId) {
    u.negocioStageId = dealstage
    u._hubspotSyncSnapshot = null
  }

  if (u._negocioStageIdPendente === dealstage) u._negocioStageIdPendente = null
  return dealId
}

async function atualizarDealstage(u) {
  if (!u?.negocioId) return null
  return executarComLockNegocio(u.negocioId, () => atualizarDealstageSemLock(u))
}

async function sincronizarNegocioSemLock(u) {
  if (!u?.negocioId) return null

  try {
    const contextoAtual = await buscarContextoAtualHubSpot(u)
    if (!contextoAtual) return null
    await atualizarDealstageSemLock(u, contextoAtual)
    const props = {
      ...deps.getHubSpotDealStateProps(u),
      dealname: montarTituloNegocioHubSpot(u, { HS_STAGE: deps.HS_STAGE })
    }

    if (!Object.keys(props).length) return null

    const snapshot = JSON.stringify({ dealId: u.negocioId, props })
    if (u._hubspotSyncSnapshot === snapshot) return null

    logDebug(`[HUBSPOT] Sincronizando negócio: ${u.negocioId}`)
    const dealId = await hsAtualizarNegocio(u.negocioId, props)
    if (dealId) u._hubspotSyncSnapshot = snapshot
    return dealId
  } catch (e) {
    logErroHubSpot(e, {
      operation: "sincronizarNegocio",
      dealId: u?.negocioId,
      properties: deps.getHubSpotDealStateProps(u)
    })
    return null
  }
}

async function sincronizarNegocio(u) {
  if (!u?.negocioId) return null
  return executarComLockNegocio(u.negocioId, () => sincronizarNegocioSemLock(u))
}

function restaurarEstadoNegocioHubSpot(u, negocio) {
  if (!u || !negocio?.properties) return

  const estadoSnapshot = deps.desserializarEstado(negocio.properties.estado_bot_snapshot)

  if (estadoSnapshot) {
    const restaurado = deps.hidratarUsuarioPersistido({
      ...u,
      ...estadoSnapshot,
      contatoId: u.contatoId || estadoSnapshot.contatoId || null,
      negocioId: negocio.id || estadoSnapshot.negocioId || u.negocioId || null,
      negocioStageId: negocio.stageId || estadoSnapshot.negocioStageId || u.negocioStageId || null,
      numeroCaso: deps.getNumeroCasoOficialDoNegocio(negocio) || u.numeroCaso || estadoSnapshot.numeroCaso || null,
      nomeWA: u.nomeWA || estadoSnapshot.nomeWA || "Cliente",
      nomePerfilWhatsApp: u.nomePerfilWhatsApp || estadoSnapshot.nomePerfilWhatsApp || estadoSnapshot.nomeWA || "Cliente",
      nomeHubspot: u.nomeHubspot || estadoSnapshot.nomeHubspot || null,
      _hubspotSemContato: typeof u._hubspotSemContato === "boolean" ? u._hubspotSemContato : Boolean(estadoSnapshot._hubspotSemContato)
    })

    restaurado._numero = u._numero || null
    restaurado._hubspotSyncSnapshot = null
    restaurado.processing = false
    restaurado.timer = null
    restaurado.timerIncentivoDescricao = null
    // A janela de 24h pertence exclusivamente a uma mensagem real do cliente.
    // Restaurar um snapshot do HubSpot nunca deve fabricar atividade recente.
    restaurado.ultimaMsg = u.ultimaMsg || estadoSnapshot.ultimaMsg || null

    Object.assign(u, restaurado)
  }

  const descricao = sanitizarTextoEntrada(negocio.properties.description) ||
    sanitizarTextoEntrada(negocio.properties.descricao_completa)
  const tipo = sanitizarTextoEntrada(negocio.properties.tipo_de_caso)
  const subtipo = sanitizarTextoEntrada(negocio.properties.oraculum_case_subtype)
  const area = sanitizarTextoEntrada(negocio.properties.area_juridica)
  const etapa = normalizarStageKey(negocio.properties.etapa_do_bot)
  const numeroCasoOficial = deps.getNumeroCasoOficialDoNegocio(negocio)
  const pastaDrive = sanitizarTextoEntrada(negocio.properties.pasta_drive)
  const origemAtendimento = sanitizarTextoEntrada(negocio.properties.origem_atendimento)

  u.numeroCaso = numeroCasoOficial
  if (area) u.area = area
  if (pastaDrive) u.pastaDriveLink = pastaDrive
  if (origemAtendimento) u.origemCaptacao = origemAtendimento

  u._hubspotCaseHasSnapshot = Boolean(estadoSnapshot)
  u._hubspotImportedCase = origemAtendimento === "importacao_arquivo"
  u._hubspotDocumentStatus = sanitizarTextoEntrada(negocio.properties.oraculum_document_status) || null
  u._hubspotDocumentsReceived = sanitizarTextoEntrada(negocio.properties.oraculum_documents_received) || null
  u._hubspotDocumentsPending = sanitizarTextoEntrada(negocio.properties.oraculum_documents_pending) || null
  u._hubspotAnalysisStatus = sanitizarTextoEntrada(negocio.properties.oraculum_analysis_status) || null
  u._hubspotReviewRequired = sanitizarTextoEntrada(negocio.properties.oraculum_review_required).toLowerCase() === "true"
  u._hubspotNextAction = sanitizarTextoEntrada(negocio.properties.oraculum_next_action) || null

  if (descricao && !u.descricao) {
    const descricaoNormalizada = normalizarTextoCRM(descricao)
    u.descricao = descricaoNormalizada
    if (!u.assuntoResumo) u.assuntoResumo = descricaoNormalizada
  }

  if (tipo) {
    u.tipo_de_caso = tipo
    u.tipoCaso = tipo
    const tipoRestaurado = deps.restaurarTipoCasoHubSpot(tipo)
    if (tipoRestaurado.area && !u.area) u.area = tipoRestaurado.area
    if (tipoRestaurado.tipo && !u.tipo) u.tipo = tipoRestaurado.tipo
  }

  // As propriedades canônicas do negócio são posteriores ao snapshot e devem
  // refinar classificações genéricas persistidas em atendimentos antigos.
  if (subtipo) {
    u.oraculum_case_subtype = subtipo
    u.subTipo = subtipo
  }
  if (typeof deps.garantirNomenclaturaJuridicaUsuario === "function") {
    deps.garantirNomenclaturaJuridicaUsuario(u)
  }

  if (deps.etapaValida(etapa)) {
    u.etapa = etapa
    u.lastPergunta = etapa
  }
}

function deveSincronizarEstadoHubSpot(estadoAnterior, u) {
  const snapshotAnterior = typeof estadoAnterior === "string" ? estadoAnterior : deps.serializarEstado(estadoAnterior)
  const snapshotAtual = deps.serializarEstado(u)
  return snapshotAnterior !== snapshotAtual
}

async function sincronizarContatoNegocioHubSpot(u, options = {}) {
  if (!u) return
  if (u._novoCasoParaTerceiro && u.telefoneEhDoCliente === false && !u.numeroCaso) {
    logDebug("[HUBSPOT] Sync ignorado durante coleta de caso para terceiro.")
    return
  }
  const nomePodeSerAtualizado = Boolean(
    u.nomeConfirmado === true &&
    typeof u.nome === "string" &&
    u.nome.trim() &&
    (options.permitirAtualizacaoNome === true || !u.numeroCaso)
  )
  if (nomePodeSerAtualizado) {
    u.nomeHubspot = u.nome.trim()
    u.oraculumIdentityProvenance = sanitizarTextoEntrada(
      options.origemNome || u.oraculumIdentityProvenance ||
      (u.numeroCaso ? "client_explicit_correction" : "confirmed_intake")
    )
  }

  const partesNome = nomePodeSerAtualizado
    ? u.nome.trim().split(/\s+/).filter(Boolean)
    : []
  const contatoProps = filtrarPropsHubSpot({
    firstname: partesNome.shift(),
    lastname: partesNome.join(" "),
    city: u.cidade,
    state: u.uf,
    oraculum_identity_provenance: nomePodeSerAtualizado ? u.oraculumIdentityProvenance : undefined
  })

  if (u.contatoId && Object.keys(contatoProps).length) {
    await hsAtualizarContato(u.contatoId, contatoProps)
  }

  // Atualiza dealname com temperatura atual do lead
  if (u.negocioId) {
    const dealname = montarTituloNegocioHubSpot(u, { HS_STAGE: deps.HS_STAGE })
    await hsAtualizarNegocioComEstado(u, { dealname })
  }
}

async function hsBuscarNegociosDoContato(contactId) {
  try {
    const res = await axios.get(
      `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}/associations/deals`,
      { headers: HS() }
    )
    const dealIds = (res.data?.results || []).map(r => r.id)
    return dealIds
  } catch (e) {
    logErroHubSpot(e, { operation: "buscarNegociosDoContato", contactId })
    return []
  }
}

async function hsBuscarNegocioAbertoDoContato(contactId) {
  const negocio = await hsBuscarNegocioAbertoInfoDoContato(contactId)
  return negocio?.id || null
}

async function hsBuscarNegocioAbertoInfoDoContato(contactId) {
  try {
    const dealIds = await hsBuscarNegociosDoContato(contactId)
    if (!dealIds.length) return null

    for (const dealId of dealIds) {
      try {
        const res = await axios.get(
          `https://api.hubapi.com/crm/v3/objects/deals/${dealId}?properties=${HUBSPOT_CASE_PROPERTIES}`,
          { headers: HS() }
        )
        const stage = res.data?.properties?.dealstage
        const numeroCaso = sanitizarTextoEntrada(res.data?.properties?.numero_de_caso)
        const negocio = {
          id: dealId,
          stageId: stage,
          dealname: res.data?.properties?.dealname || null,
          createdAt: res.data?.createdAt || null,
          updatedAt: res.data?.updatedAt || null,
          properties: res.data?.properties || {}
        }
        if (stage && !HS_STAGES_FINALIZADOS.has(stage) && (numeroCaso || leadIncompletoRetomavel(negocio))) {
          logDebug("Negócio existente encontrado:", dealId)
          return negocio
        }
      } catch {}
    }
    return null
  } catch (e) {
    logErroHubSpot(e, { operation: "buscarNegocioAberto", contactId })
    return null
  }
}

async function hsBuscarNegociosComCasoDoContato(contactId) {
  if (!contactId) return { casosOficiais: [], casosAtivos: [], casosFinalizados: [], leads: [], finalizados: [] }
  try {
    const dealIds = await hsBuscarNegociosDoContato(contactId)
    if (!dealIds.length) return { casosOficiais: [], casosAtivos: [], casosFinalizados: [], leads: [], finalizados: [] }

    const casosOficiais = []
    const casosAtivos = []
    const casosFinalizados = []
    const leads = []
    const finalizados = []

    for (const dealId of dealIds) {
      try {
        const res = await axios.get(
          `https://api.hubapi.com/crm/v3/objects/deals/${dealId}?properties=${HUBSPOT_CASE_PROPERTIES}`,
          { headers: HS() }
        )
        const props = res.data?.properties || {}
        const stage = props.dealstage
        const numeroCaso = sanitizarTextoEntrada(props.numero_de_caso) || null
        const info = {
          id: dealId,
          stageId: stage,
          dealname: props.dealname || null,
          createdAt: res.data?.createdAt || null,
          updatedAt: res.data?.updatedAt || null,
          properties: props
        }

        if (numeroCaso) {
          const caso = { ...info, numeroCaso, finalizado: !stage || HS_STAGES_FINALIZADOS.has(stage) }
          casosOficiais.push(caso)
          if (caso.finalizado) casosFinalizados.push(caso)
          else casosAtivos.push(caso)
        } else if (!stage || HS_STAGES_FINALIZADOS.has(stage)) {
          finalizados.push(info)
        } else {
          leads.push(info)
        }
      } catch (e) {
        logErroHubSpot(e, { operation: "buscarNegocioComCaso", contactId, dealId })
      }
    }

    return { casosOficiais, casosAtivos, casosFinalizados, leads, finalizados }
  } catch (e) {
    logErroHubSpot(e, { operation: "buscarNegociosComCaso", contactId })
    return { casosOficiais: [], casosAtivos: [], casosFinalizados: [], leads: [], finalizados: [] }
  }
}

async function hsListarNegociosAtivosDoContato(contactId) {
  try {
    const dealIds = await hsBuscarNegociosDoContato(contactId)
    if (!dealIds.length) return []

    const negocios = []
    for (const dealId of dealIds) {
      try {
        const res = await axios.get(
          `https://api.hubapi.com/crm/v3/objects/deals/${dealId}?properties=${HUBSPOT_CASE_PROPERTIES}`,
          { headers: HS() }
        )
        const stage = res.data?.properties?.dealstage
        if (stage && !HS_STAGES_FINALIZADOS.has(stage)) {
          negocios.push({
            id: dealId,
            stageId: stage,
            dealname: res.data?.properties?.dealname || null,
            createdate: res.data?.properties?.createdate || null,
            properties: res.data?.properties || {}
          })
        }
      } catch (e) {
        logErroHubSpot(e, {
          operation: "listarNegocioAtivo",
          contactId,
          dealId
        })
      }
    }

    return negocios.sort((a, b) => String(b.createdate || "").localeCompare(String(a.createdate || "")))
  } catch (e) {
    logErroHubSpot(e, { operation: "listarNegociosAtivos", contactId })
    return []
  }
}

const ADMIN_ACTIVE_DEAL_PROPERTIES = HUBSPOT_CASE_PROPERTIES

// Consulta administrativa: ao contrário do helper legado acima, falhas de
// associação/leitura não podem ser confundidas com um contato sem negócios.
async function hsListarNegociosAtivosDoContatoEstrito(contactId) {
  try {
    const associacoes = await axios.get(
      `https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(contactId)}/associations/deals`,
      { headers: HS() }
    )
    if (!Array.isArray(associacoes?.data?.results)) {
      return { ok: false, deals: [], errorCode: "INVALID_HUBSPOT_RESPONSE" }
    }
    const dealIds = associacoes.data.results.map(item => item?.id).filter(Boolean)
    if (dealIds.length !== associacoes.data.results.length) {
      return { ok: false, deals: [], errorCode: "INVALID_HUBSPOT_RESPONSE" }
    }

    const negocios = []
    for (const dealId of dealIds) {
      const res = await axios.get(
        `https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(dealId)}?properties=${ADMIN_ACTIVE_DEAL_PROPERTIES}`,
        { headers: HS() }
      )
      if (!res?.data || typeof res.data !== "object" || !res.data.properties || typeof res.data.properties !== "object") {
        return { ok: false, deals: [], errorCode: "INVALID_HUBSPOT_RESPONSE" }
      }
      const stage = res.data.properties.dealstage
      if (typeof stage !== "string" || !stage.trim()) {
        return { ok: false, deals: [], errorCode: "INVALID_HUBSPOT_RESPONSE" }
      }
      if (!HS_STAGES_FINALIZADOS.has(stage)) {
        negocios.push({
          id: String(res.data.id || dealId),
          stageId: stage,
          dealname: res.data.properties.dealname || null,
          createdate: res.data.properties.createdate || null,
          properties: res.data.properties
        })
      }
    }
    return { ok: true, deals: negocios.sort((a, b) => String(b.createdate || "").localeCompare(String(a.createdate || ""))) }
  } catch (e) {
    logErroHubSpot(e, { operation: "listarNegociosAtivosEstrito", contactId })
    return { ok: false, deals: [], errorCode: sanitizarTextoEntrada(e?.code || e?.response?.status || "HUBSPOT_QUERY_FAILED") }
  }
}

async function hsAtualizarEtapaNegocio(dealId, stageId) {
  if (!dealId) return
  return executarComLockNegocio(dealId, () =>
    hsAtualizarNegocio(dealId, { dealstage: stageId })
  )
}

async function hsMoverStage(nId, stage) {
  if (!nId) return
  return hsAtualizarEtapaNegocio(nId, stage)
}

// Move o stage no HubSpot apenas se o stage atual NÃO for um stage avançado.
// Impede que ações de documentos regridam o pipeline após agendamento.
async function hsMoverStageSeguro(nId, novoStage, stageAtual, temEventoCalendar = false) {
  const stagesProtegidos = [deps.HS_STAGE.AGENDAMENTO, deps.HS_STAGE.PROTOCOLO, deps.HS_STAGE.PROCESSO, deps.HS_STAGE.FINAL]
  if (stagesProtegidos.includes(stageAtual) || temEventoCalendar || movimentoRegressivoHubSpot(stageAtual, novoStage)) return false
  await hsMoverStage(nId, novoStage)
  return true
}

async function hsAtualizarNegocioSerializado(dealId, props = {}) {
  if (!dealId) return null
  return executarComLockNegocio(dealId, () => hsAtualizarNegocio(dealId, props))
}

module.exports = {
  configurarHubSpotSync,
  executarComLockNegocio,
  hsAtualizarNegocioComEstado,
  hsAtualizarNegocioSerializado,
  atualizarDealstage,
  sincronizarNegocio,
  restaurarEstadoNegocioHubSpot,
  deveSincronizarEstadoHubSpot,
  sincronizarContatoNegocioHubSpot,
  hsBuscarNegociosDoContato,
  hsBuscarNegocioAbertoDoContato,
  hsBuscarNegocioAbertoInfoDoContato,
  hsBuscarNegociosComCasoDoContato,
  leadIncompletoRetomavel,
  selecionarLeadRetomavel,
  hsListarNegociosAtivosDoContato,
  hsListarNegociosAtivosDoContatoEstrito,
  hsAtualizarEtapaNegocio,
  hsMoverStage,
  hsMoverStageSeguro
}
