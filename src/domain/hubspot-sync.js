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
const { logDebug, logErro } = require("../utils/logging")

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
  hidratarUsuarioPersistido: null
}
let HS_STAGES_FINALIZADOS = new Set()

function configurarHubSpotSync(config = {}) {
  deps = { ...deps, ...config }
  HS_STAGES_FINALIZADOS = new Set([deps.HS_STAGE.FINAL])
}

async function hsAtualizarNegocioComEstado(u, props = {}) {
  if (!u?.negocioId) return null
  return hsAtualizarNegocio(u.negocioId, deps.getHubSpotDealProps(u, props))
}

async function atualizarDealstage(u) {
  if (!u?.negocioId) return null

  // Se não temos o stage em memória, busca do HubSpot antes de qualquer decisão
  if (!u.negocioStageId) {
    try {
      const res = await axios.get(
        `https://api.hubapi.com/crm/v3/objects/deals/${u.negocioId}?properties=dealstage`,
        { headers: { Authorization: `Bearer ${deps.HUBSPOT_TOKEN}` } }
      )
      u.negocioStageId = res.data?.properties?.dealstage || null
    } catch (e) { logErro("hubspot", "atualizarDealstage: falha ao buscar stage: " + e.message) }
  }

  const dealstage = deps.mapearStageParaDealstage(u)
  if (!dealstage) return null

  const stageAtual = sanitizarTextoEntrada(u.negocioStageId)
  const stagePendente = sanitizarTextoEntrada(u._negocioStageIdPendente)
  const stageEfetivo = stagePendente || stageAtual
  if (stageEfetivo === dealstage) return null

  logDebug(`[HUBSPOT] Atualizando estágio do negócio: ${stageAtual || "-"} ? ${dealstage}`)
  u._negocioStageIdPendente = dealstage

  const dealId = await hsAtualizarNegocio(u.negocioId, { dealstage })
  if (dealId) {
    u.negocioStageId = dealstage
    u._hubspotSyncSnapshot = null
  }

  if (u._negocioStageIdPendente === dealstage) u._negocioStageIdPendente = null
  return dealId
}

async function sincronizarNegocio(u) {
  if (!u?.negocioId) return null

  try {
    await atualizarDealstage(u)
    const props = deps.getHubSpotDealStateProps(u)

    if (!Object.keys(props).length) return null

    const snapshot = JSON.stringify({ dealId: u.negocioId, props })
    if (u._hubspotSyncSnapshot === snapshot) return null

    logDebug(`[HUBSPOT] Sincronizando negócio: ${u.negocioId}`)
    const dealId = await hsAtualizarNegocio(u.negocioId, props)
    if (dealId) u._hubspotSyncSnapshot = snapshot
    return dealId
  } catch (e) {
    const mensagem = e?.response?.data?.message || e?.message || "falha ao sincronizar negócio"
    console.error(`[ERRO][HUBSPOT_SYNC] deal=${u?.negocioId || "-"} caso=${u?.numeroCaso || "-"} stage=${u?.stage || "-"} :: ${mensagem}`)
    if (e?.stack) console.error(`[ERRO][HUBSPOT_SYNC] ${e.stack}`)
    return null
  }
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
    restaurado.ultimaMsg = u.ultimaMsg || Date.now()

    Object.assign(u, restaurado)
  }

  const descricao = sanitizarTextoEntrada(negocio.properties.description) ||
    sanitizarTextoEntrada(negocio.properties.descricao_completa)
  const tipo = sanitizarTextoEntrada(negocio.properties.tipo_de_caso)
  const etapa = normalizarStageKey(negocio.properties.etapa_do_bot)
  const numeroCasoOficial = deps.getNumeroCasoOficialDoNegocio(negocio)

  u.numeroCaso = numeroCasoOficial

  if (descricao && !u.descricao) {
    const descricaoNormalizada = normalizarTextoCRM(descricao)
    u.descricao = descricaoNormalizada
    if (!u.assuntoResumo) u.assuntoResumo = descricaoNormalizada
  }

  if (tipo && !u.tipo) {
    const tipoRestaurado = deps.restaurarTipoCasoHubSpot(tipo)
    if (tipoRestaurado.area && !u.area) u.area = tipoRestaurado.area
    if (tipoRestaurado.tipo) u.tipo = tipoRestaurado.tipo
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

async function sincronizarContatoNegocioHubSpot(u) {
  if (!u) return
  if (u._novoCasoParaTerceiro && u.telefoneEhDoCliente === false && !u.numeroCaso) {
    logDebug("[HUBSPOT] Sync ignorado durante coleta de caso para terceiro.")
    return
  }
  if (typeof u.nome === "string" && u.nome.trim()) u.nomeHubspot = u.nome.trim()

  const contatoProps = filtrarPropsHubSpot({
    firstname: (u.nome && u.nome !== "cliente" && u.nome !== "você" ? u.nome : undefined),
    city: u.cidade,
    state: u.uf
  })

  if (u.contatoId && Object.keys(contatoProps).length) {
    await hsAtualizarContato(u.contatoId, contatoProps)
  }

  // Atualiza dealname com temperatura atual do lead
  if (u.negocioId) {
    const dealname = deps.getNomeDeal(u)
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
    logErro("hubspot", "buscarNegociosDoContato: " + (e.response?.data?.message || e.message))
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
          `https://api.hubapi.com/crm/v3/objects/deals/${dealId}?properties=dealstage,dealname,closedate,description,resumo_cliente,descricao_completa,area_juridica,urgencia,pasta_drive,estado_bot_snapshot,etapa_do_bot,tipo_de_caso,temperatura_lead,hs_priority,numero_de_caso`,
          { headers: HS() }
        )
        const stage = res.data?.properties?.dealstage
        if (stage && !HS_STAGES_FINALIZADOS.has(stage)) {
          logDebug("Negócio existente encontrado:", dealId)
          return {
            id: dealId,
            stageId: stage,
            dealname: res.data?.properties?.dealname || null,
            properties: res.data?.properties || {}
          }
        }
      } catch {}
    }
    return null
  } catch (e) {
    logErro("hubspot", "buscarNegocioAberto: " + (e.response?.data?.message || e.message))
    return null
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
          `https://api.hubapi.com/crm/v3/objects/deals/${dealId}?properties=dealstage,dealname,createdate,closedate,description,resumo_cliente,descricao_completa,area_juridica,urgencia,pasta_drive,estado_bot_snapshot,etapa_do_bot,tipo_de_caso,temperatura_lead,hs_priority,numero_de_caso`,
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
        logErro("hubspot", "listarNegocioAtivo: " + (e.response?.data?.message || e.message))
      }
    }

    return negocios.sort((a, b) => String(b.createdate || "").localeCompare(String(a.createdate || "")))
  } catch (e) {
    logErro("hubspot", "listarNegociosAtivos: " + (e.response?.data?.message || e.message))
    return []
  }
}

async function hsAtualizarEtapaNegocio(dealId, stageId) {
  if (!dealId) return
  try {
    await deps.hubspotClient.crm.deals.basicApi.update(dealId, {
      properties: { dealstage: stageId }
    })
  } catch (e) { logErro("hubspot", "atualizarEtapaNegocio: " + (e.response?.data?.message || e.message)) }
}

async function hsMoverStage(nId, stage) {
  if (!nId) return
  return hsAtualizarEtapaNegocio(nId, stage)
}

// Move o stage no HubSpot apenas se o stage atual NÃO for um stage avançado.
// Impede que ações de documentos regridam o pipeline após agendamento.
async function hsMoverStageSeguro(nId, novoStage, stageAtual, temEventoCalendar = false) {
  const stagesProtegidos = [deps.HS_STAGE.AGENDAMENTO, deps.HS_STAGE.PROTOCOLO, deps.HS_STAGE.PROCESSO, deps.HS_STAGE.FINAL]
  if (stagesProtegidos.includes(stageAtual) || temEventoCalendar) return false
  await hsMoverStage(nId, novoStage)
  return true
}

module.exports = {
  configurarHubSpotSync,
  hsAtualizarNegocioComEstado,
  atualizarDealstage,
  sincronizarNegocio,
  restaurarEstadoNegocioHubSpot,
  deveSincronizarEstadoHubSpot,
  sincronizarContatoNegocioHubSpot,
  hsBuscarNegociosDoContato,
  hsBuscarNegocioAbertoDoContato,
  hsBuscarNegocioAbertoInfoDoContato,
  hsListarNegociosAtivosDoContato,
  hsAtualizarEtapaNegocio,
  hsMoverStage,
  hsMoverStageSeguro
}
