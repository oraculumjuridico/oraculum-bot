const { sanitizarTextoEntrada } = require("../utils/text")
const { getPrimeiroNome } = require("./phone-name")

let deps = {}

function configurarClientMenuUi(dependencias = {}) {
  deps = { ...deps, ...dependencias }
}

function requireDep(nome) {
  const dep = deps[nome]
  if (typeof dep !== "function") throw new Error(`client-menu-ui dependencia ausente: ${nome}`)
  return dep
}

function iconeAreaJuridica(area = "") {
  const a = sanitizarTextoEntrada(area).toLowerCase()
  if (a.includes("inss") || a.includes("previd")) return "🏛️"
  if (a.includes("trabalh")) return "💼"
  if (a.includes("fam")) return "👨‍👩‍👧"
  if (a.includes("consum")) return "🛒"
  if (a.includes("penal")) return "⚖️"
  if (a.includes("civil") || a.includes("cível")) return "📜"
  if (a.includes("imob") || a.includes("imóv") || a.includes("aluguel")) return "🏠"
  return "📋"
}

function numeroParaIcone(numero) {
  const mapa = ["?", "?", "?", "?", "?", "?", "?", "?", "?"]
  return mapa[numero - 1] || String(numero)
}

function formatarDataBR(valor) {
  if (!valor) return null
  const data = valor instanceof Date ? valor : new Date(valor)
  if (Number.isNaN(data.getTime())) return null
  return data.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
}

function textoAudioCasosCliente(casos = []) {
  return casos.map((caso, idx) => {
    const ordinal = ["Primeiro", "Segundo", "Terceiro", "Quarto", "Quinto", "Sexto", "Sétimo", "Oitavo", "Nono"][idx] || `${idx + 1}º`
    return `${ordinal} caso: ${caso.area || "Atendimento"}, ${caso.situacao || "em análise"}.`
  }).join(" ")
}

function textoAudioResumoCasosCliente(casos = []) {
  return casos
    .map(caso => `${caso.situacao || caso.area || "atendimento em análise"}`)
    .join("; ")
}

function deveMostrarBoasVindasMenuCliente(u, agora = Date.now()) {
  const ultimo = Number(u?._ultimoMenuClienteAt || 0)
  return !u?._menuClienteJaApresentado || !ultimo || (agora - ultimo) > 6 * 60 * 60 * 1000
}

function textoAudioOpcoesMenuCliente(opcoes = null) {
  const textoAudioOpcoes = requireDep("textoAudioOpcoes")
  const opcoesMenu = Array.isArray(opcoes) ? opcoes : [
    { title: "Status do meu caso" },
    { title: "Enviar documentos" },
    { title: "Falar com advogado" },
    { title: "Abrir novo caso" }
  ]
  return textoAudioOpcoes(opcoesMenu)
}

function textoAudioSelecaoCaso(acao) {
  return ({
    status: "Para qual atendimento você quer ver o status?",
    documentos: "Para qual atendimento você quer enviar documentos?",
    advogado: "Para qual atendimento você quer falar com advogado?"
  })[acao] || "Sobre qual atendimento você quer continuar?"
}

function resumoCasoMenuCliente(negocio, fallback = {}) {
  const desserializarEstado = requireDep("desserializarEstado")
  const restaurarTipoCasoHubSpot = requireDep("restaurarTipoCasoHubSpot")
  const getNumeroCasoOficialDoNegocio = requireDep("getNumeroCasoOficialDoNegocio")
  const formatarSituacaoJuridica = requireDep("formatarSituacaoJuridica")
  const props = negocio?.properties || {}
  const snapshot = desserializarEstado(props.estado_bot_snapshot) || {}
  const tipoRestaurado = restaurarTipoCasoHubSpot(props.tipo_de_caso)
  const numeroCasoOficial =
    getNumeroCasoOficialDoNegocio(negocio) ||
    snapshot.numeroCaso ||
    fallback.numeroCaso ||
    ""
  const numeroCaso = numeroCasoOficial || sanitizarTextoEntrada(props.dealname) || "Caso"
  const area = snapshot.area || props.area_juridica || tipoRestaurado.area || fallback.area || "Atendimento"
  const situacaoBase =
    snapshot.situacao ||
    snapshot.detalhe ||
    snapshot.assuntoResumo ||
    props.resumo_cliente ||
    props.description ||
    props.descricao_completa ||
    fallback.situacao ||
    fallback.assuntoResumo ||
    fallback.descricao ||
    "Em análise"
  const situacao = formatarSituacaoJuridica(situacaoBase, snapshot.tipo || tipoRestaurado.tipo || fallback.tipo, snapshot.subTipo || fallback.subTipo)
  return {
    id: negocio?.id || fallback.negocioId || null,
    stageId: negocio?.stageId || props.dealstage || fallback.negocioStageId || null,
    numeroCaso,
    hasNumeroCaso: Boolean(numeroCasoOficial),
    area,
    situacao: situacao && situacao !== "—" ? situacao : "Em análise",
    createdate: negocio?.createdate || props.createdate || null,
    negocio
  }
}

function montarCasosMenuCliente(u, negocios = []) {
  const formatarSituacaoJuridica = requireDep("formatarSituacaoJuridica")
  const serializarEstado = requireDep("serializarEstado")
  const casos = negocios
    .map(n => resumoCasoMenuCliente(n, u))
    .filter(c => c.id && c.hasNumeroCaso)

  if (!casos.some(c => c.id === u.negocioId) && u.numeroCaso && u.negocioId) {
    casos.unshift({
      id: u.negocioId,
      stageId: u.negocioStageId || null,
      numeroCaso: u.numeroCaso,
      hasNumeroCaso: true,
      area: u.area || "Atendimento",
      situacao: formatarSituacaoJuridica(u.situacao, u.tipo, u.subTipo) || "Em análise",
      createdate: null,
      negocio: {
        id: u.negocioId,
        stageId: u.negocioStageId || null,
        properties: {
          dealstage: u.negocioStageId || null,
          numero_de_caso: u.numeroCaso,
          estado_bot_snapshot: serializarEstado(u)
        }
      }
    })
  }

  return casos.slice(0, 9)
}

function montarPainelCasosCliente(u, casos = []) {
  const saudacaoPorHorarioCliente = requireDep("saudacaoPorHorarioCliente")
  u._casosMenuCliente = casos
  const acao = u._acaoPendente || "caso"
  const pergunta = {
    status: "Para qual atendimento você quer ver o status?",
    documentos: "Para qual atendimento você quer enviar documentos?",
    advogado: "Para qual atendimento você quer falar com advogado?"
  }[acao] || "Para qual atendimento?"
  const nomeExib = getPrimeiroNome(u) || "cliente"
  const saudacao = saudacaoPorHorarioCliente()
  const linhasCasos = casos.map((caso, idx) => {
    const marcador = numeroParaIcone(idx + 1)
    return `${iconeAreaJuridica(caso.area)} ${marcador} *${caso.numeroCaso}* · ${caso.area || "Atendimento"}\n_${caso.situacao || "Em análise"}_`
  }).join("\n\n")
  return {
    texto: [
      "📂 *Selecione o caso*",
      "",
      pergunta,
      "",
      linhasCasos
    ].join("\n"),
    opcoes: [
      ...casos.map((caso, idx) => ({
        id: `m_caso_${idx}`,
        title: `${numeroParaIcone(idx + 1)} ${caso.numeroCaso}`
      })),
      { id: "m_novocaso", title: "➕ Abrir novo caso" }
    ]
  }
}

function menuCliente(u, casosCliente = null) {
  const podeMostrarMenuCliente = requireDep("podeMostrarMenuCliente")
  const respostaRecomecoMenuPrincipal = requireDep("respostaRecomecoMenuPrincipal")
  const saudacaoPorHorarioCliente = requireDep("saudacaoPorHorarioCliente")
  const formatarSituacaoJuridica = requireDep("formatarSituacaoJuridica")
  if (!podeMostrarMenuCliente(u)) return respostaRecomecoMenuPrincipal(u)
  const nomeExib = getPrimeiroNome(u) || "cliente"
  const primeiraApresentacao = !u._menuClienteJaApresentado
  const saudacao = saudacaoPorHorarioCliente()
  const casos = Array.isArray(casosCliente) ? casosCliente : null
  const temVariosCasos = casos?.length > 1
  if (temVariosCasos) u._casosMenuCliente = casos
  if (temVariosCasos && u._mostrarPainelCasosCliente) {
    return montarPainelCasosCliente(u, casos)
  }
  const boasVindas = Boolean(u._menuClienteBoasVindas)

  const situacaoMenu = formatarSituacaoJuridica(u.situacao, u.tipo, u.subTipo)
  const casoInfo = u.numeroCaso
    ? `${iconeAreaJuridica(u.area)} ① *${u.numeroCaso}* · ${u.area || "—"}\n_${situacaoMenu && situacaoMenu !== "—" ? situacaoMenu : "Em análise"}_`
    : ""
  const listaCasos = temVariosCasos
    ? casos.map(caso => `${iconeAreaJuridica(caso.area)} *${caso.numeroCaso}* · ${caso.area || "Atendimento"}\n_${caso.situacao || "Em análise"}_`).join("\n\n")
    : null
  const cabecalho = `⚖️ *${saudacao}, ${nomeExib}!*`
  const linhaBoasVindas = boasVindas ? "\n\nSeja bem-vindo(a) de volta à Oráculum." : ""
  const pergunta = "*O que deseja fazer?*"
  const corpo = temVariosCasos
    ? `${cabecalho}${linhaBoasVindas}\n\n📋 *Seus atendimentos:*\n\n${listaCasos}\n\n${pergunta}`
    : `${cabecalho}${linhaBoasVindas}\n\n${casoInfo}\n\n${pergunta}`

  return {
    texto: corpo,
    opcoes: [
      { id: "m_status",   title: "📊 Status do meu caso" },
      { id: "m_docs", title: "📎 Enviar documentos" },
      { id: "m_adv",      title: "👨‍⚖️ Falar com advogado" },
      { id: "m_novocaso", title: "➕ Abrir novo caso" }
    ]
  }
}

module.exports = {
  configurarClientMenuUi,
  iconeAreaJuridica,
  numeroParaIcone,
  formatarDataBR,
  textoAudioCasosCliente,
  textoAudioResumoCasosCliente,
  deveMostrarBoasVindasMenuCliente,
  textoAudioOpcoesMenuCliente,
  textoAudioSelecaoCaso,
  resumoCasoMenuCliente,
  montarCasosMenuCliente,
  montarPainelCasosCliente,
  menuCliente
}
