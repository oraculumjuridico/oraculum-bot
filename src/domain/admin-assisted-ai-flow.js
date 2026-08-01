const crypto = require("node:crypto")
const { sanitizarTextoEntrada } = require("../utils/text")
const { normalizarNumeroWhatsAppEnvio } = require("./phone-name")
const {
  assertFinalizationInvariants,
  collectFinalizationViolations
} = require("./finalization-invariants")
const {
  criarCampoAdminAssistido,
  criarDadosVaziosAdminAssistido,
  camposFaltantesAdminAssistido,
  proximoCampoObrigatorioAdminAssistido,
  perguntaCampoAdminAssistido,
  labelCampoAdminAssistido,
  obterCamposObrigatoriosAdminAssistido,
  obterCamposRevisaoEspecificosAdminAssistido,
  normalizarCampoAdminAssistido,
  PLACEHOLDERS_INVALIDOS
} = require("./admin-assisted-ai-schema")
const {
  extrairDadosAtendimentoAssistidoIA
} = require("./admin-assisted-ai-intelligence")
const {
  analisarCasoJuridico
} = require("./legal-copilot")

const ADMIN_ASSISTIDO_ORIGEM = "admin_assistido_ia"
const ADMIN_ASSISTIDO_ETAPA_INICIAL = "aguardando_relato"
const ADMIN_ASSISTIDO_ETAPA_COLETA = "coletando_campos"
const ADMIN_ASSISTIDO_ETAPA_REVISAO = "revisao_caso"
const ADMIN_ASSISTIDO_ETAPA_EDITAR_CAMPO = "editar_campo"
const ADMIN_ASSISTIDO_ETAPA_AGUARDANDO_EDICAO = "aguardando_edicao"
const ADMIN_ASSISTIDO_ETAPA_CONFIRMAR_AUDIO = "confirmar_audio"
const ADMIN_ASSISTIDO_ETAPA_COMPLETO = "cadastro_completo"
const ADMIN_ASSISTIDO_TTL_MS = 24 * 60 * 60 * 1000
const COPILOTO_LIMITE_ITENS = 5

const CAMPOS_DADOS_CLIENTE_REVISAO = [
  "nomeCompleto",
  "cpf",
  "dataNascimento",
  "telefone",
  "email",
  "cidade",
  "uf"
]

const CAMPOS_CASO_REVISAO = [
  "areaJuridica",
  "tipoCaso",
  "descricao"
]

function criarEstadoAtendimentoAssistido({ iniciadoEm = new Date().toISOString() } = {}) {
  return {
    ativo: true,
    etapa: ADMIN_ASSISTIDO_ETAPA_INICIAL,
    dados: criarDadosVaziosAdminAssistido(),
    historico: [],
    perguntaPendente: null,
    campoEmEdicao: null,
    audioTranscricaoPendente: null,
    etapaAntesAudio: null,
    camposPerguntados: [],
    analise: null,
    iniciadoEm,
    atualizadoEm: iniciadoEm,
    aguardandoConfirmacaoRetomada: false,
    suporteFuturo: {
      texto: true,
      audio: true,
      extracaoIA: true,
      confirmacao: true,
      criacaoCaso: true
    }
  }
}

function chaveAdmin(from, normalizarNumeroWhatsAppEnvio) {
  if (typeof normalizarNumeroWhatsAppEnvio === "function") {
    return normalizarNumeroWhatsAppEnvio(from)
  }
  return sanitizarTextoEntrada(from)
}

function obterSessaoAdmin(
  from,
  { sessoesAdminWhatsApp, normalizarNumeroWhatsAppEnvio, agendarPersistenciaSessoesAdminAssistidas } = {}
) {
  const chave = chaveAdmin(from, normalizarNumeroWhatsAppEnvio)
  if (!chave || !sessoesAdminWhatsApp) return { chave: "", sessao: null }
  const sessao = sessoesAdminWhatsApp.get(chave) || {}
  if (sessaoAdminAssistidaExpirada(sessao)) {
    sessoesAdminWhatsApp.set(chave, {
      ...sessao,
      listaAtiva: null,
      adminAssistido: null,
      ts: Date.now()
    })
    if (typeof agendarPersistenciaSessoesAdminAssistidas === "function") {
      agendarPersistenciaSessoesAdminAssistidas(sessoesAdminWhatsApp)
    }
    return { chave, sessao: sessoesAdminWhatsApp.get(chave) || {} }
  }
  return {
    chave,
    sessao
  }
}

function sessaoAdminAssistidaExpirada(sessao = {}, agora = Date.now()) {
  if (!sessao?.adminAssistido?.ativo) return false
  const referencia = Date.parse(sessao.adminAssistido.atualizadoEm || sessao.adminAssistido.iniciadoEm || sessao.ts || "")
  return Number.isFinite(referencia) && agora - referencia > ADMIN_ASSISTIDO_TTL_MS
}

function salvarSessaoAdmin(chave, sessao, { sessoesAdminWhatsApp, agendarPersistenciaSessoesAdminAssistidas } = {}) {
  if (!chave || !sessoesAdminWhatsApp) return false
  const agora = new Date().toISOString()
  const adminAssistido = sessao?.adminAssistido
    ? { ...sessao.adminAssistido, atualizadoEm: agora }
    : sessao?.adminAssistido
  sessoesAdminWhatsApp.set(chave, { ...sessao, adminAssistido, ts: Date.now() })
  if (typeof agendarPersistenciaSessoesAdminAssistidas === "function") {
    agendarPersistenciaSessoesAdminAssistidas(sessoesAdminWhatsApp)
  }
  return true
}

function atendimentoAssistidoAdminAtivo(from, deps = {}) {
  const { sessao } = obterSessaoAdmin(from, deps)
  return Boolean(sessao?.adminAssistido?.ativo)
}

function telaInicioAtendimentoAssistidoAdmin() {
  return {
    texto: [
      "👨‍⚖️ *Atendimento Assistido por IA*",
      "",
      "Descreva o caso livremente.",
      "",
      "Você pode enviar texto ou áudio.",
      "",
      "A IA irá identificar automaticamente a área jurídica e solicitará apenas as informações que faltarem antes da criação do caso."
    ].join("\n"),
    opcoes: opcoesNavegacaoAdminAssistido({ voltar: false }),
    registrarPergunta: false,
    audio: false
  }
}

function iniciarAtendimentoAssistidoAdmin(from, deps = {}) {
  const { chave, sessao } = obterSessaoAdmin(from, deps)
  if (!chave) return telaInicioAtendimentoAssistidoAdmin()

  salvarSessaoAdmin(chave, {
    ...sessao,
    listaAtiva: "admin_assistido",
    adminAssistido: criarEstadoAtendimentoAssistido()
  }, deps)

  return telaInicioAtendimentoAssistidoAdmin()
}

function tipoEntradaAdminAssistido(msgObj = null) {
  const tipo = sanitizarTextoEntrada(msgObj?.type).toLowerCase()
  if (tipo) return tipo
  return "text"
}

function registrarEntradaAtendimentoAssistidoAdmin(from, text, msgObj, deps = {}) {
  const { chave, sessao } = obterSessaoAdmin(from, deps)
  if (!chave || !sessao?.adminAssistido?.ativo) return false

  const adminAssistido = sessao.adminAssistido
  const historico = Array.isArray(adminAssistido.historico)
    ? adminAssistido.historico
    : []

  salvarSessaoAdmin(chave, {
    ...sessao,
    adminAssistido: {
      ...adminAssistido,
      historico: [
        ...historico,
        {
          recebidoEm: new Date().toISOString(),
          tipo: tipoEntradaAdminAssistido(msgObj),
          texto: sanitizarTextoEntrada(text)
        }
      ]
    }
  }, deps)

  return true
}

function valorCampo(dados = {}, campo = "") {
  return dados[campo]?.valor || null
}

function textoCampo(dados = {}, campo = "") {
  const valor = valorCampo(dados, campo)
  if (valor === null || valor === undefined) return ""
  return sanitizarTextoEntrada(valor)
}

function emailValidoAdminAssistido(email) {
  if (!email || typeof email !== "string") return false
  const trimmed = email.trim().toLowerCase()
  if (!trimmed) return false
  if (PLACEHOLDERS_INVALIDOS.has(trimmed)) return false
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(trimmed)
}

function textoCurto(valor = "", limite = 160) {
  const texto = sanitizarTextoEntrada(valor).replace(/\s+/g, " ")
  if (texto.length <= limite) return texto
  return `${texto.slice(0, limite - 3).trim()}...`
}

function entradaPedeInformarDepois(texto = "") {
  const comando = sanitizarTextoEntrada(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
  return /\b(informar depois|nao tenho|nao sei|sem esse dado|pular|pular etapa|depois eu vejo|complementar depois)\b/.test(comando)
}

function camposCriticosFinalizacaoAdminAssistido() {
  return new Set(["nomeCompleto", "telefone", "cidade", "areaJuridica", "descricao"])
}

function campoPodeFicarPendenteAdminAssistido(campo, area = "Outros") {
  return campo && !camposCriticosFinalizacaoAdminAssistido().has(campo)
}

function camposFaltantesAtivosAdminAssistido(dados = {}, area = "", pendentesPosterior = []) {
  const pendentes = new Set(Array.isArray(pendentesPosterior) ? pendentesPosterior : [])
  return camposFaltantesAdminAssistido(dados, area).filter(campo => !pendentes.has(campo))
}

function proximoCampoAtivoAdminAssistido(dados = {}, area = "", pendentesPosterior = []) {
  return camposFaltantesAtivosAdminAssistido(dados, area, pendentesPosterior)[0] || null
}

function mergeDadosAdminAssistido(dadosAtuais = {}, novosDados = {}) {
  const base = { ...criarDadosVaziosAdminAssistido(), ...dadosAtuais }
  for (const [campo, novo] of Object.entries(novosDados || {})) {
    if (!Object.prototype.hasOwnProperty.call(base, campo)) continue
    const valorNovo = novo?.valor
    const statusNovo = novo?.status
    if (valorNovo === null || valorNovo === undefined || String(valorNovo).trim() === "") continue
    if (base[campo]?.status === "confirmado" && statusNovo !== "confirmado") continue
    base[campo] = normalizarCampoAdminAssistido(campo, valorNovo, statusNovo || "inferido")
  }
  return base
}

function indicadorCampoAdminAssistido(info = criarCampoAdminAssistido()) {
  if (info.status === "invalido") return "❌ Inválido"
  if (info.status === "precisa_conferir") return "⚠️ Precisa conferir"
  if (info.status === "confirmado") return "✅ Confirmado"
  if (info.status === "inferido") return "🟡 Inferido"
  return "❌ Não informado"
}

function valorResumoCampoAdminAssistido(info = criarCampoAdminAssistido()) {
  if (!info.valor && info.valor !== false) return "Não informado"
  if (typeof info.valor === "boolean") return info.valor ? "Sim" : "Não"
  return String(info.valor).trim() || "Não informado"
}

function formatarLinhaStatusAdminAssistido(dados, campo) {
  const info = dados[campo] || criarCampoAdminAssistido()
  return `- ${labelCampoAdminAssistido(campo)}: ${indicadorCampoAdminAssistido(info)} - ${valorResumoCampoAdminAssistido(info)}`
}

function valoresCamposAdminAssistido(dados = {}) {
  return Object.fromEntries(
    Object.entries(dados || {}).map(([campo, info]) => [
      campo,
      info && typeof info === "object" && Object.prototype.hasOwnProperty.call(info, "valor")
        ? info.valor
        : info
    ])
  )
}

function listaResumoCopiloto(itens = [], vazio = "Nenhum ponto identificado.", limite = COPILOTO_LIMITE_ITENS) {
  if (!Array.isArray(itens) || itens.length === 0) return [`- ${vazio}`]
  return itens.slice(0, limite).map(item => `- ${item}`)
}

function gerarSecaoCopilotoJuridicoAdminAssistido(adminAssistido = {}, dados = {}, area = "Outros", especificos = []) {
  const dadosPlanos = valoresCamposAdminAssistido(dados)
  const analise = analisarCasoJuridico({
    areaJuridica: area,
    tipoCaso: textoCampo(dados, "tipoCaso") || adminAssistido.analise?.tipoCaso || "",
    resumo: textoCampo(dados, "resumoJuridico") || textoCampo(dados, "descricao") || "",
    dadosColetados: dadosPlanos,
    camposObrigatorios: obterCamposObrigatoriosAdminAssistido(area),
    documentosJaInformados: dadosPlanos.documentosJaInformados || dadosPlanos.documentos || [],
    informacoesEspecificas: Object.fromEntries(especificos.map(campo => [campo, dadosPlanos[campo]]))
  })

  return [
    "\uD83E\uDDE0 Copiloto Jur\u00eddico",
    "",
    "Urg\u00eancia",
    `- N\u00edvel: ${analise.urgencia.nivel}`,
    ...listaResumoCopiloto(analise.urgencia.justificativas),
    "",
    "Poss\u00edveis riscos",
    ...listaResumoCopiloto(analise.riscosIdentificados),
    "",
    "Documentos recomendados",
    ...listaResumoCopiloto(analise.documentosRecomendados),
    "",
    "Perguntas sugeridas",
    ...listaResumoCopiloto(analise.perguntasSugeridas)
  ].join("\n")
}

function camposResumoAdminAssistido(area, dados = {}, faltantes = []) {
  const principais = [
    "nomeCompleto",
    "cpf",
    "dataNascimento",
    "telefone",
    "email",
    "cidade",
    "uf",
    "areaJuridica",
    "tipoCaso",
    "descricao"
  ]
  const obrigatorios = new Set([
    ...principais,
    ...faltantes
  ])
  return Array.from(obrigatorios).filter(campo => dados[campo])
}

function formatarLinhaColetaAdminAssistido(dados, campo) {
  const info = dados[campo] || criarCampoAdminAssistido()
  const label = labelCampoAdminAssistido(campo)
  if (info.status === "confirmado") return `✅ ${label}`
  if (info.status === "inferido") return `🟡 ${label}`
  return `❌ ${label}`
}

function textoResumoAnaliseAdminAssistidoLegado({ dados, faltantes, proximoCampo }) {
  const area = valorCampo(dados, "areaJuridica") || "Outros"
  const tipoCaso = valorCampo(dados, "tipoCaso")
  const resumo = valorCampo(dados, "resumoJuridico") || valorCampo(dados, "descricao")
  const linhasCampos = camposResumoAdminAssistido(area, dados, faltantes)
    .map(campo => formatarLinhaColetaAdminAssistido(dados, campo))

  return [
    "Área identificada:",
    area,
    tipoCaso ? `\nTipo do caso:\n${tipoCaso}` : "",
    "",
    "Informações encontradas",
    "",
    ...linhasCampos,
    resumo ? `\nResumo jurídico:\n${resumo}` : "",
    "",
    perguntaCampoAdminAssistido(proximoCampo)
  ].filter(linha => linha !== "").join("\n")
}

function textoResumoAnaliseAdminAssistido({ dados, faltantes, proximoCampo }) {
  const area = valorCampo(dados, "areaJuridica") || "Outros"
  const tipoCaso = valorCampo(dados, "tipoCaso")
  const resumo = valorCampo(dados, "resumoJuridico") || valorCampo(dados, "descricao")
  const objetivo = valorCampo(dados, "objetivo") || valorCampo(dados, "motivo") || tipoCaso || "Complementar objetivo"
  const pendencias = Array.isArray(faltantes) && faltantes.length
    ? faltantes.map(labelCampoAdminAssistido).join(", ")
    : "Sem pendências críticas"
  const linhasCampos = camposResumoAdminAssistido(area, dados, faltantes)
    .map(campo => formatarLinhaColetaAdminAssistido(dados, campo))

  return [
    "Área identificada:",
    area,
    tipoCaso ? `\nTipo do caso:\n${tipoCaso}` : "",
    "",
    "Resumo curto",
    `Área: ${area}`,
    `Subárea: ${tipoCaso || "Baixa confiança"}`,
    `Situação: ${textoCurto(resumo || valorCampo(dados, "descricao") || "Não informada", 140)}`,
    `Objetivo do cliente: ${textoCurto(objetivo, 100)}`,
    `Pendências: ${pendencias}`,
    "",
    "Informações encontradas",
    "",
    ...linhasCampos,
    resumo ? `\nResumo jurídico:\n${textoCurto(resumo, 220)}` : "",
    "",
    perguntaCampoAdminAssistido(proximoCampo),
    campoPodeFicarPendenteAdminAssistido(proximoCampo)
      ? "\nSe não tiver esse dado agora, responda: Informar depois."
      : ""
  ].filter(linha => linha !== "").join("\n")
}

function obterAdminAssistidoDaSessao(sessao = {}) {
  if (sessao.adminAssistido) return sessao.adminAssistido
  return sessao
}

function camposEditaveisAdminAssistido(adminAssistido = {}) {
  const dados = adminAssistido.dados || criarDadosVaziosAdminAssistido()
  const area = valorCampo(dados, "areaJuridica") || adminAssistido.analise?.areaJuridica || "Outros"
  return Array.from(new Set([
    ...CAMPOS_CASO_REVISAO,
    "resumoJuridico",
    "documentosMencionados",
    "urgencia",
    ...CAMPOS_DADOS_CLIENTE_REVISAO,
    ...obterCamposRevisaoEspecificosAdminAssistido(area)
  ])).filter(campo => dados[campo])
}

function gerarResumoAdminAssistido(sessao = {}) {
  const adminAssistido = obterAdminAssistidoDaSessao(sessao)
  const dados = {
    ...criarDadosVaziosAdminAssistido(),
    ...(adminAssistido.dados || {})
  }
  const area = valorCampo(dados, "areaJuridica") || adminAssistido.analise?.areaJuridica || "Outros"
  const especificos = obterCamposRevisaoEspecificosAdminAssistido(area)
  const secaoCopiloto = gerarSecaoCopilotoJuridicoAdminAssistido(adminAssistido, dados, area, especificos)
  const pendentesPosterior = Array.isArray(adminAssistido.pendentesPosterior) ? adminAssistido.pendentesPosterior : []
  const linhasPendentesPosterior = pendentesPosterior.length
    ? pendentesPosterior.map(campo => `- ${labelCampoAdminAssistido(campo)}`)
    : ["- Nenhuma"]

  return [
    "*Revisão do Caso*",
    "",
    "1. Área jurídica",
    formatarLinhaStatusAdminAssistido(dados, "areaJuridica"),
    "",
    "2. Tipo do caso",
    formatarLinhaStatusAdminAssistido(dados, "tipoCaso"),
    "",
    "3. Resumo do problema",
    formatarLinhaStatusAdminAssistido(dados, "descricao"),
    "",
    "4. Dados do cliente",
    ...CAMPOS_DADOS_CLIENTE_REVISAO.map(campo => formatarLinhaStatusAdminAssistido(dados, campo)),
    "",
    "5. Informações específicas da área jurídica",
    ...especificos.map(campo => formatarLinhaStatusAdminAssistido(dados, campo)),
    "",
    "6. Pendencias para complementar depois",
    ...linhasPendentesPosterior,
    "",
    secaoCopiloto,
    "",
    "Escolha uma opção:",
    "",
    "1️⃣ Confirmar e criar caso",
    "2️⃣ Editar informações",
    "3️⃣ Cancelar atendimento"
  ].join("\n")
}

function opcoesRevisaoAdminAssistido() {
  return [
    { id: "admin_assistido_confirmar", title: "✅ Confirmar" },
    { id: "admin_assistido_editar", title: "✏️ Editar" },
    { id: "admin_assistido_cancelar", title: "❌ Cancelar" }
  ]
}

function opcoesRevisaoEmailAdminAssistido() {
  return [
    { id: "admin_assistido_email_corrigir", title: "1️⃣ Corrigir e-mail" },
    { id: "admin_assistido_email_omitir", title: "2️⃣ Deixar sem e-mail" },
    { id: "admin_assistido_email_depois", title: "3️⃣ Informar depois" },
    { id: "admin_assistido_email_revisar", title: "4️⃣ Revisar dados" }
  ]
}

function responderRevisaoCaso(adminAssistido = {}) {
  return {
    texto: gerarResumoAdminAssistido(adminAssistido),
    opcoes: opcoesRevisaoAdminAssistido(),
    registrarPergunta: false,
    audio: false
  }
}

function entradaEhAudio(msgObj = null) {
  const tipo = tipoEntradaAdminAssistido(msgObj)
  return tipo === "audio" || tipo === "voice"
}

async function capturarEntradaAtendimentoAssistido(text, msgObj, deps = {}) {
  if (!entradaEhAudio(msgObj)) {
    return { texto: sanitizarTextoEntrada(text), audio: false, erroAudio: null }
  }

  if (typeof deps.transcreverAudioAdmin !== "function") {
    return {
      texto: "",
      audio: true,
      erroAudio: "Não consegui processar áudio neste ambiente. Envie o relato por texto ou tente novamente."
    }
  }

  try {
    const transcricao = sanitizarTextoEntrada(await deps.transcreverAudioAdmin(msgObj))
    if (!transcricao) {
      return {
        texto: "",
        audio: true,
        erroAudio: "Não consegui transcrever esse áudio. Reenvie o áudio com mais clareza ou envie o relato por texto."
      }
    }
    return { texto: transcricao, audio: true, erroAudio: null }
  } catch (e) {
    if (typeof deps.logErro === "function") {
      deps.logErro("admin_assistido", `Falha ao transcrever áudio assistido: ${e.message}`, e)
    }
    return {
      texto: "",
      audio: true,
      erroAudio: "Não consegui transcrever esse áudio agora. Reenvie o áudio ou envie o relato por texto."
    }
  }
}

function telaConfirmarAudioAdminAssistido(transcricao = "") {
  return {
    texto: [
      "Transcrevi o seguinte:",
      "",
      transcricao || "Não informado",
      "",
      "Está correto?"
    ].join("\n"),
    opcoes: [
      { id: "admin_assistido_audio_confirmar", title: "✅ Confirmar" },
      { id: "admin_assistido_audio_reenviar", title: "🔁 Reenviar áudio" }
    ],
    registrarPergunta: false,
    audio: false
  }
}

function telaErroAudioAdminAssistido(mensagem) {
  return {
    texto: mensagem || "Não consegui transcrever esse áudio. Reenvie o áudio ou envie o relato por texto.",
    opcoes: [
      { id: "admin_assistido_audio_reenviar", title: "🔁 Reenviar áudio" }
    ],
    registrarPergunta: false,
    audio: false
  }
}

function atualizarCampoPendente(adminAssistido = {}, texto = "") {
  const campo = adminAssistido.perguntaPendente
  if (!campo) return adminAssistido.dados || criarDadosVaziosAdminAssistido()
  if (entradaPedeInformarDepois(texto)) {
    const area = valorCampo(adminAssistido.dados || {}, "areaJuridica") || "Outros"
    if (campoPodeFicarPendenteAdminAssistido(campo, area)) {
      return {
        ...(adminAssistido.dados || criarDadosVaziosAdminAssistido()),
        [campo]: criarCampoAdminAssistido(null, "ausente")
      }
    }
    return adminAssistido.dados || criarDadosVaziosAdminAssistido()
  }
  return {
    ...(adminAssistido.dados || criarDadosVaziosAdminAssistido()),
    [campo]: normalizarCampoAdminAssistido(campo, texto, "confirmado")
  }
}

function normalizarComandoAdminAssistido(texto = "") {
  return sanitizarTextoEntrada(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function acaoNavegacaoAdminAssistido(texto = "") {
  const comando = normalizarComandoAdminAssistido(texto)
  if (["admin_assistido_cancelar", "cancelar", "cancelar atendimento", "sair"].includes(comando)) return "cancelar"
  if (["admin_assistido_menu", "menu", "menu admin", "inicio", "admin"].includes(comando)) return "menu"
  if (["admin_assistido_voltar", "voltar", "retornar"].includes(comando)) return "voltar"
  return null
}

function opcoesNavegacaoAdminAssistido({ voltar = true, cancelar = true, menu = true } = {}) {
  return [
    voltar ? { id: "admin_assistido_voltar", title: "Voltar" } : null,
    cancelar ? { id: "admin_assistido_cancelar", title: "Cancelar" } : null,
    menu ? { id: "admin_assistido_menu", title: "Menu admin" } : null
  ].filter(Boolean)
}

function acaoRevisaoAdminAssistido(texto = "") {
  const comando = normalizarComandoAdminAssistido(texto)
  if (["1", "confirmar", "confirmar e criar caso", "admin_assistido_confirmar"].includes(comando)) return "confirmar"
  if (["2", "editar", "editar informacoes", "editar informações", "admin_assistido_editar"].includes(comando)) return "editar"
  if (["3", "cancelar", "cancelar atendimento", "admin_assistido_cancelar"].includes(comando)) return "cancelar"
  return null
}

function acaoRevisaoEmailAdminAssistido(texto = "") {
  const comando = normalizarComandoAdminAssistido(texto)
  if (["1", "corrigir", "corrigir email", "corrigir e-mail", "admin_assistido_email_corrigir"].includes(comando)) return "corrigir"
  if (["2", "omitir", "deixar sem email", "deixar sem e-mail", "admin_assistido_email_omitir"].includes(comando)) return "omitir"
  if (["3", "depois", "informar depois", "admin_assistido_email_depois"].includes(comando)) return "depois"
  if (["4", "revisar", "revisar dados", "admin_assistido_email_revisar"].includes(comando)) return "revisar"
  return null
}

function acaoConfirmacaoAudioAdminAssistido(texto = "") {
  const comando = normalizarComandoAdminAssistido(texto)
  if (["confirmar", "sim", "ok", "1", "admin_assistido_audio_confirmar"].includes(comando)) return "confirmar"
  if (["reenviar", "reenviar audio", "2", "admin_assistido_audio_reenviar"].includes(comando)) return "reenviar"
  return null
}

function acaoRetomadaAdminAssistido(texto = "") {
  const comando = normalizarComandoAdminAssistido(texto)
  if (["continuar", "sim", "1", "admin_assistido_retomar_continuar"].includes(comando)) return "continuar"
  if (["cancelar", "nao", "não", "2", "admin_assistido_retomar_cancelar"].includes(comando)) return "cancelar"
  return null
}

function telaRetomadaAtendimentoAssistidoAdmin() {
  return {
    texto: [
      "Foi encontrado um atendimento em andamento.",
      "",
      "Deseja continuar?"
    ].join("\n"),
    opcoes: [
      { id: "admin_assistido_retomar_continuar", title: "✅ Continuar" },
      { id: "admin_assistido_retomar_cancelar", title: "❌ Cancelar" }
    ],
    registrarPergunta: false,
    audio: false
  }
}

function textoEscolhaCampoEdicao(adminAssistido = {}) {
  const campos = camposEditaveisAdminAssistido(adminAssistido)
  const linhas = campos.map((campo, idx) => `${idx + 1}. ${labelCampoAdminAssistido(campo)}`)
  return [
    "Qual campo deseja alterar?",
    "",
    ...linhas,
    "",
    "Envie o número ou o nome do campo."
  ].join("\n")
}

function resolverCampoEdicao(adminAssistido = {}, texto = "") {
  const campos = camposEditaveisAdminAssistido(adminAssistido)
  const comando = normalizarComandoAdminAssistido(texto)
  const numero = Number.parseInt(comando, 10)
  if (Number.isInteger(numero) && numero >= 1 && numero <= campos.length) return campos[numero - 1]
  return campos.find(campo => {
    const label = normalizarComandoAdminAssistido(labelCampoAdminAssistido(campo))
    return comando === normalizarComandoAdminAssistido(campo) || comando === label
  }) || null
}

function atualizarAnaliseAdminAssistido(analise, dados, origemAtual = null) {
  if (!analise && !origemAtual) return analise
  return {
    ...(analise || {}),
    areaJuridica: valorCampo(dados, "areaJuridica") || analise?.areaJuridica || null,
    tipoCaso: valorCampo(dados, "tipoCaso") || analise?.tipoCaso || null,
    clientePrincipal: valorCampo(dados, "clientePrincipal") || valorCampo(dados, "nomeCompleto") || analise?.clientePrincipal || null,
    existeTerceiro: valorCampo(dados, "existeTerceiro") ?? analise?.existeTerceiro ?? null,
    resumoJuridico: valorCampo(dados, "resumoJuridico") || valorCampo(dados, "descricao") || analise?.resumoJuridico || null,
    origem: origemAtual || analise?.origem || null
  }
}

const CAMPOS_LOG_TECNICO_ADMIN_ASSISTIDO = new Set([
  "resultado",
  "code",
  "operation",
  "numeroCaso",
  "contatoId",
  "negocioId",
  "pastaDriveId",
  "area",
  "etapa",
  "status",
  "reason",
  "faltantes",
  "failedInvariant",
  "stage",
  "adapter",
  "executionId",
  "contactId",
  "dealId",
  "caseFolderId",
  "durationMs",
  "created",
  "reused"
])

function criarPayloadLogAdminAssistido(evento, detalhes = {}) {
  const payload = {
    evento: sanitizarTextoEntrada(evento),
    origem: ADMIN_ASSISTIDO_ORIGEM
  }
  if (!detalhes || typeof detalhes !== "object" || Array.isArray(detalhes)) return payload

  for (const [campo, valor] of Object.entries(detalhes)) {
    const campoLog = campo
    if (!CAMPOS_LOG_TECNICO_ADMIN_ASSISTIDO.has(campoLog)) continue
    if (Array.isArray(valor)) {
      payload[campoLog] = valor
        .filter(item => typeof item === "string")
        .map(item => sanitizarTextoEntrada(item).slice(0, 80))
        .filter(Boolean)
      continue
    }
    if (!["string", "number", "boolean"].includes(typeof valor)) continue
    payload[campoLog] = typeof valor === "string"
      ? sanitizarTextoEntrada(valor).slice(0, 160)
      : valor
  }
  return payload
}

function registrarLogAdminAssistido(deps = {}, evento, detalhes = {}) {
  const payload = criarPayloadLogAdminAssistido(evento, detalhes)
  if (typeof deps.logAdminAssistido === "function") {
    deps.logAdminAssistido(payload)
    return
  }
  if (typeof deps.logDebug === "function") {
    deps.logDebug("[ADMIN_ASSISTIDO]", JSON.stringify(payload))
  }
}

function normalizarTelefoneAdminAssistido(telefone, deps = {}) {
  const raw = sanitizarTextoEntrada(telefone)
  if (!raw) return ""
  if (typeof deps.normalizarNumeroWhatsAppEnvio === "function") {
    return deps.normalizarNumeroWhatsAppEnvio(raw)
  }
  const digitos = raw.replace(/\D/g, "")
  if (!digitos) return ""
  if (digitos.startsWith("55")) return digitos
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`
  return digitos
}

function normalizarPrioridadeAdminAssistido(dados = {}) {
  const texto = [
    textoCampo(dados, "prioridade"),
    textoCampo(dados, "urgencia"),
    textoCampo(dados, "descricao"),
    textoCampo(dados, "resumoJuridico")
  ].join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  if (/\b(urgente|alta|prazo|hoje|amanha|liminar|audiencia|intimad)\b/.test(texto)) return "alta"
  if (/\b(baixa|sem urgencia|sem prazo)\b/.test(texto)) return "baixa"
  return "normal"
}

function resumoDadosComplementaresAdminAssistido(dados = {}) {
  const campos = [
    "idade",
    "dataNascimento",
    "email",
    "beneficio",
    "nb",
    "dataNegativa",
    "empresa",
    "cargo",
    "dataAdmissao",
    "dataDemissao",
    "motivo",
    "parteContraria",
    "vinculoFamiliar",
    "filhos",
    "objetivo",
    "estadoCivil",
    "profissao",
    "situacaoProfissional",
    "endereco",
    "numeroEndereco",
    "complementoEndereco",
    "bairro",
    "cep",
    "apelido",
    "conflitoInteresses",
    "acidenteTrabalho",
    "limitacoesAtuais",
    "atividadeHabitual",
    "composicaoFamiliar",
    "rendaAtual",
    "beneficioAnterior",
    "dataRequerimento",
    "resultadoPericia",
    "documentosMedicos",
    "motivoEncerramentoVinculo",
    "naturezaDemanda",
    "orgao",
    "fornecedor",
    "produtoServico",
    "problema",
    "posicaoPenal",
    "contratoOuFato",
    "imovel",
    "situacao"
  ]
  return campos
    .map(campo => {
      const valor = textoCampo(dados, campo)
      if (!valor) return null
      return campo === "idade"
        ? `Idade informada: ${valor}`
        : `${labelCampoAdminAssistido(campo)}: ${valor}`
    })
    .filter(Boolean)
    .join("\n")
}

function montarDescricaoAdminAssistido(dados = {}) {
  const descricao = textoCampo(dados, "descricao")
  const resumo = textoCampo(dados, "resumoJuridico")
  const complemento = resumoDadosComplementaresAdminAssistido(dados)
  return [
    descricao,
    resumo && resumo !== descricao ? `Resumo juridico: ${resumo}` : null,
    complemento ? `Dados complementares:\n${complemento}` : null
  ].filter(Boolean).join("\n\n")
}

function montarUsuarioFinalizacaoAdminAssistido(from, adminAssistido = {}, deps = {}) {
  const dados = {
    ...criarDadosVaziosAdminAssistido(),
    ...(adminAssistido.dados || {})
  }
  const telefone = normalizarTelefoneAdminAssistido(textoCampo(dados, "telefone"), deps)
  const area = textoCampo(dados, "areaJuridica") || adminAssistido.analise?.areaJuridica || "Outros"
  const tipo = textoCampo(dados, "tipoCaso") || adminAssistido.analise?.tipoCaso || "outros"
  const descricao = montarDescricaoAdminAssistido(dados)
  const nome = textoCampo(dados, "nomeCompleto") || textoCampo(dados, "clientePrincipal")

  return {
    stage: "confirmacao",
    etapa: "confirmacao",
    nomeWA: nome || "Cliente",
    nomePerfilWhatsApp: nome || "Cliente",
    origemCaptacao: ADMIN_ASSISTIDO_ORIGEM,
    nome,
    cpf: textoCampo(dados, "cpf"),
    idade: Number.isInteger(Number(valorCampo(dados, "idade"))) ? Number(valorCampo(dados, "idade")) : null,
    dataNascimento: textoCampo(dados, "dataNascimento"),
    email: (function() {
      const emailRaw = textoCampo(dados, "email")
      return emailRaw && emailValidoAdminAssistido(emailRaw) ? emailRaw : null
    })(),
    estadoCivil: textoCampo(dados, "estadoCivil") || null,
    profissao: textoCampo(dados, "profissao") || null,
    situacaoProfissional: textoCampo(dados, "situacaoProfissional") || null,
    endereco: textoCampo(dados, "endereco") || null,
    numeroEndereco: textoCampo(dados, "numeroEndereco") || null,
    complementoEndereco: textoCampo(dados, "complementoEndereco") || null,
    bairro: textoCampo(dados, "bairro") || null,
    cep: textoCampo(dados, "cep") || null,
    apelido: textoCampo(dados, "apelido") || null,
    beneficio: textoCampo(dados, "beneficio"),
    beneficioInteresse: textoCampo(dados, "beneficio"),
    nomeConfirmado: Boolean(nome),
    nomeHubspot: null,
    regiao: null,
    cidade: textoCampo(dados, "cidade"),
    uf: textoCampo(dados, "uf"),
    area,
    tipo,
    situacao: textoCampo(dados, "situacao") || tipo,
    subTipo: textoCampo(dados, "motivo") || null,
    detalhe: textoCampo(dados, "problema") || textoCampo(dados, "objetivo") || null,
    objetivo: textoCampo(dados, "objetivo") || null,
    acidenteTrabalho: valorCampo(dados, "acidenteTrabalho"),
    limitacoesAtuais: textoCampo(dados, "limitacoesAtuais") || null,
    motivoEncerramentoVinculo: textoCampo(dados, "motivoEncerramentoVinculo") || null,
    composicaoFamiliar: textoCampo(dados, "composicaoFamiliar") || null,
    rendaAtual: textoCampo(dados, "rendaAtual") || null,
    dataRequerimento: textoCampo(dados, "dataRequerimento") || null,
    dataNegativa: textoCampo(dados, "dataNegativa") || null,
    resultadoPericia: textoCampo(dados, "resultadoPericia") || null,
    conflitoInteresses: textoCampo(dados, "conflitoInteresses") || null,
    naturezaDemanda: textoCampo(dados, "naturezaDemanda") || textoCampo(dados, "motivo") || null,
    orgao: textoCampo(dados, "orgao") || null,
    dataAtendimento: adminAssistido.iniciadoEm || new Date().toISOString(),
    _docKey: null,
    urgencia: normalizarPrioridadeAdminAssistido(dados),
    semReceber: false,
    contribuicao: null,
    recebeBeneficio: null,
    descricao,
    assuntoResumo: textoCampo(dados, "resumoJuridico") || descricao,
    whatsappVerificado: Boolean(telefone),
    telefoneEhDoCliente: true,
    whatsappContato: telefone,
    atendimentoParaTerceiro: false,
    relacaoComAtendido: null,
    papelContato: null,
    contatoId: null,
    negocioId: null,
    numeroCaso: null,
    pastaDriveId: null,
    pastaDriveLink: null,
    consultaStatus: "sem_consulta",
    tipoConsulta: "inicial",
    contextoConversa: null,
    score: 0,
    documentosEnviados: false,
    docsEntregues: [],
    docsAusentes: [],
    docsPulados: [],
    docsParciais: [],
    docsDispensados: [],
    docAtualIdx: 0,
    ultimoArqId: null,
    ultimoArqNome: null,
    corrigirCampo: null,
    historiaIA: [],
    lastPergunta: null,
    lastPerguntaPayload: null,
    leadIncompletoCapturado: false,
    audiosDescCorrigidos: [],
    _novoCasoDeCliente: true,
    _numero: telefone || (typeof deps.normalizarNumeroWhatsAppEnvio === "function" ? deps.normalizarNumeroWhatsAppEnvio(from) : sanitizarTextoEntrada(from)),
    _adminAssistido: {
      criadoPor: sanitizarTextoEntrada(from),
      iniciadoEm: adminAssistido.iniciadoEm || null,
      historico: Array.isArray(adminAssistido.historico) ? adminAssistido.historico : [],
      pendentesPosterior: Array.isArray(adminAssistido.pendentesPosterior) ? adminAssistido.pendentesPosterior : [],
      dados
    }
  }
}

function textoSucessoCriacaoCasoAdminAssistido(u = {}, numeroCaso = "") {
  return [
    "✅ Caso criado com sucesso.",
    "",
    "Protocolo:",
    numeroCaso || u.numeroCaso || "Não informado",
    "",
    "Contato:",
    u.nome || "Não informado",
    "",
    "Área:",
    u.area || "Não informada",
    "",
    "Deseja fazer mais alguma coisa?"
  ].join("\n")
}

function labelInvariante(invariante) {
  const labels = {
    nome: "Nome (mínimo 3 caracteres)",
    telefone: "Telefone/WhatsApp (com DDD e 9º dígito)",
    cidade: "Cidade (mínimo 2 caracteres)",
    relato: "Relato/descrição (mínimo 3 caracteres)",
    area: "Área jurídica (mínimo 2 caracteres)",
    identidade: "Identidade do atendimento (cliente/terceiro)"
  }
  return labels[invariante] || invariante
}

async function confirmarCriarCasoAdminAssistido(from, chave, sessao, adminAssistido, deps = {}) {
  const executionId = crypto.randomUUID()
  const startedAt = Date.now()
  const dados = adminAssistido.dados || criarDadosVaziosAdminAssistido()
  const area = valorCampo(dados, "areaJuridica") || adminAssistido.analise?.areaJuridica || "Outros"
  const pendentesPosterior = Array.isArray(adminAssistido.pendentesPosterior) ? adminAssistido.pendentesPosterior : []
  const faltantes = camposFaltantesAdminAssistido(dados, area)
  const invalidos = Object.entries(dados)
    .filter(([, info]) => info?.status === "invalido")
    .map(([campo]) => campo)
  const faltantesCriticos = faltantes.filter(campo => camposCriticosFinalizacaoAdminAssistido().has(campo))
  const bloqueios = [...new Set([...invalidos, ...faltantesCriticos])]
  const proximoCampo = bloqueios[0] || null

  if (proximoCampo) {
    const novoEstado = {
      ...adminAssistido,
      etapa: ADMIN_ASSISTIDO_ETAPA_COLETA,
      perguntaPendente: proximoCampo,
      faltantes,
      pendentesPosterior
    }
    salvarNovoEstadoAtendimento(chave, sessao, novoEstado, deps)
    registrarLogAdminAssistido(deps, "confirmacao_bloqueada_campos_faltantes", {
      resultado: "bloqueado",
      faltantes: bloqueios
    })
    return {
      texto: invalidos.length
        ? `${invalidos.map(campo => `${labelCampoAdminAssistido(campo)} inválido`).join(", ")}. Corrija o dado antes de confirmar.`
        : textoResumoAnaliseAdminAssistido({ dados, faltantes, proximoCampo }),
      opcoes: opcoesNavegacaoAdminAssistido(),
      registrarPergunta: false,
      audio: false
    }
  }

  if (typeof deps.finalizarCadastroAssistido !== "function") {
    throw new Error("finalizarCadastroAssistido nao configurado")
  }

  const snapshotSessao = { ...sessao, adminAssistido }
  const u = montarUsuarioFinalizacaoAdminAssistido(from, adminAssistido, deps)

  // Pré-validação: detecta invariantes de finalização ANTES de qualquer escrita
  // externa. Este bloco previne que campos com texto insuficiente (1-2 chars)
  // passem em camposFaltantesAdminAssistido (que aceita length>0) e cheguem ao
  // executor, onde assertFinalizationInvariants exige minLength=3.
  const normFn = deps.normalizarNumeroWhatsAppEnvio || normalizarNumeroWhatsAppEnvio
  const preViolations = collectFinalizationViolations({
    from: u.whatsappContato || from,
    u,
    normalizarNumeroWhatsAppEnvio: normFn
  })
  if (preViolations.length > 0) {
    registrarLogAdminAssistido(deps, "criacao_caso_bloqueada_invariantes", {
      resultado: "bloqueado",
      code: "FINALIZATION_INVARIANTS_VIOLATION",
      operation: "finalizar_cadastro_assistido",
      failedInvariant: preViolations.join(","),
      stage: "pre_finalization"
    })
    if (typeof deps.logErro === "function") {
      deps.logErro("admin_assistido", `Caso não criado: invariantes ausentes; code=FINALIZATION_INVARIANTS_VIOLATION; operation=finalizar_cadastro_assistido; stage=pre_finalization; failedInvariant=${preViolations.join(",")}`)
    }
    return {
      texto: [
        "⚠️ Não foi possível criar o caso: dados insuficientes.",
        "",
        "Campos que precisam ser revisados:",
        ...preViolations.map(v => `- ${labelInvariante(v)}`),
        "",
        "Escolha uma opção:",
        "",
        "1️⃣ Editar informações",
        "2️⃣ Cancelar atendimento"
      ].join("\n"),
      opcoes: opcoesRevisaoAdminAssistido(),
      registrarPergunta: false,
      audio: false
    }
  }

  registrarLogAdminAssistido(deps, "criacao_caso_iniciada", {
    resultado: "iniciado",
    area: u.area
  })

  try {
    const numeroCaso = await deps.finalizarCadastroAssistido(u.whatsappContato || from, u)
    const contatoId = u.contatoId || u.contactId || null
    const negocioId = u.negocioId || u.dealId || null
    const pastaDriveId = u.pastaDriveId || u.caseFolderId || null
    const sucessoContratoValido = Boolean(numeroCaso && contatoId && negocioId && pastaDriveId)
    if (!sucessoContratoValido) {
      registrarLogAdminAssistido(deps, "criacao_caso_bloqueada_invariantes", {
        resultado: "bloqueado",
        code: "SUCCESS_CONTRACT_VIOLATION",
        operation: "finalizar_cadastro_assistido",
        failedInvariant: "success_contract",
        stage: "post_finalization"
      })
      if (typeof deps.logErro === "function") {
        deps.logErro("admin_assistido", `Caso não criado: contrato de sucesso incompleto; code=SUCCESS_CONTRACT_VIOLATION; operation=finalizar_cadastro_assistido; stage=post_finalization; failedInvariant=success_contract`)
      }
      return {
        texto: [
          "⚠️ Não foi possível criar o caso: dados insuficientes.",
          "",
          "Os identificadores obrigatórios não foram retornados pelo fluxo de finalização.",
          "",
          "Escolha uma opção:",
          "",
          "1️⃣ Editar informações",
          "2️⃣ Cancelar atendimento"
        ].join("\n"),
        opcoes: opcoesRevisaoAdminAssistido(),
        registrarPergunta: false,
        audio: false
      }
    }

    const documentosAprovados = (Array.isArray(adminAssistido.documentos) ? adminAssistido.documentos : [])
      .filter(documento => documento?.status === "approved" && documento?.sha256)
    const documentosPromovidos = []
    if (documentosAprovados.length && typeof deps.promoverMidiaAdminAssistida !== "function") {
      throw Object.assign(new Error("promotor de mídia administrativa não configurado"), {
        code: "ADMIN_MEDIA_PROMOTER_MISSING",
        operation: "drive_document_upload"
      })
    }
    for (const documento of documentosAprovados) {
      const promovido = await deps.promoverMidiaAdminAssistida(documento.sha256, {
        folderId: pastaDriveId,
        caseNumber: numeroCaso
      })
      if (!promovido?.fileId) {
        throw Object.assign(new Error("upload administrativo sem confirmação"), {
          code: "ADMIN_MEDIA_UPLOAD_VERIFY_FAILED",
          operation: "drive_document_upload"
        })
      }
      documentosPromovidos.push(promovido)
    }

    const novoEstado = {
      ...adminAssistido,
      ativo: false,
      etapa: ADMIN_ASSISTIDO_ETAPA_COMPLETO,
      casoCriado: {
        numeroCaso,
        contatoId,
        negocioId,
        pastaDriveId,
        pastaDriveLink: u.pastaDriveLink || null,
        documentos: documentosPromovidos.map(documento => ({
          fileId: documento.fileId,
          sha256: documento.sha256,
          category: documento.category || null
        }))
      }
    }
    salvarSessaoAdmin(chave, {
      ...sessao,
      listaAtiva: null,
      adminAssistido: novoEstado
    }, deps)
    registrarLogAdminAssistido(deps, "criacao_caso_concluida", {
      resultado: "sucesso",
      status: "success",
      etapa: "final_verify",
      executionId,
      contactId: contatoId,
      dealId: negocioId,
      numeroCaso,
      caseFolderId: pastaDriveId,
      contatoId,
      negocioId,
      pastaDriveId,
      created: [
        u._canonicalCheckpoint?.steps?.contact?.result?.action === "created" ? "contact" : null,
        u._canonicalCheckpoint?.steps?.deal?.result?.action === "created" ? "deal" : null,
        u._canonicalCheckpoint?.steps?.drive?.result?.action === "created" ? "drive" : null
      ].filter(Boolean),
      reused: [
        u._canonicalCheckpoint?.steps?.contact?.result?.action === "verified" ? "contact" : null,
        u._canonicalCheckpoint?.steps?.deal?.result?.action === "verified" ? "deal" : null
      ].filter(Boolean),
      durationMs: Date.now() - startedAt
    })
    return {
      texto: textoSucessoCriacaoCasoAdminAssistido(u, numeroCaso),
      opcoes: opcoesNavegacaoAdminAssistido({ voltar: false, cancelar: false }),
      registrarPergunta: false,
      audio: false
    }
  } catch (e) {
    salvarSessaoAdmin(chave, snapshotSessao, deps)

    // Detectar falha de e-mail inválido e direcionar ao campo específico.
    // Evita repetição infinita do mesmo payload: se o e-mail é inválido,
    // retorna à edição do campo em vez de oferecer "Confirmar e criar caso".
     if (e?.operation === "hubspot_contact" && e?.code === "FINALIZATION_INTEGRATION_FAILURE") {
      if (!u.email || !emailValidoAdminAssistido(u.email)) {
        const novoEstado = {
          ...adminAssistido,
          etapa: ADMIN_ASSISTIDO_ETAPA_REVISION_EMAIL,
          perguntaPendente: null,
          campoEmEdicao: null,
          faltantes: ["email"],
          _ultimaFalhaIntegracao: "email_invalido"
        }
        salvarNovoEstadoAtendimento(chave, sessao, novoEstado, deps)
        registrarLogAdminAssistido(deps, "integracao_falhou_email_invalido", {
          resultado: "bloqueado",
          field: "email",
          operation: e?.operation
        })
        return telaRevisaoEmailAdminAssistido()
      }
    }

    if (typeof deps.rollbackCriacaoCasoAssistido === "function") {
      await deps.rollbackCriacaoCasoAssistido({ erro: e, usuario: u, sessao: snapshotSessao })
    }
    registrarLogAdminAssistido(deps, "criacao_caso_falhou_rollback_sessao", {
      resultado: "falha",
      code: e?.code || null,
      operation: e?.operation || null,
      failedInvariant: Array.isArray(e?.violations) ? e.violations.join(",") : null,
      stage: e?.stage || "finalizacao",
      adapter: e?.adapter || "canonical"
    })
    if (typeof deps.logErro === "function") {
      const code = sanitizarTextoEntrada(e?.code) || "CASE_CREATION_FAILURE"
      const operation = sanitizarTextoEntrada(e?.operation) || "finalizar_cadastro_assistido"
      const violations = Array.isArray(e?.violations) ? e.violations.join(",") : "none"
      const stage = sanitizarTextoEntrada(e?.stage) || "finalizacao"
      const adapter = sanitizarTextoEntrada(e?.adapter) || "canonical"
      deps.logErro("admin_assistido", `Falha técnica ao criar caso assistido; code=${code}; operation=${operation}; stage=${stage}; adapter=${adapter}; failedInvariant=${violations}`)
    }
    return {
      texto: [
        "Não consegui criar o caso com segurança.",
        "",
        "A sessão foi preservada para revisão e nenhuma informação será perguntada novamente.",
        "",
        "Escolha uma opção:",
        "",
        "1️⃣ Confirmar e criar caso",
        "2️⃣ Editar informações",
        "3️⃣ Cancelar atendimento"
      ].join("\n"),
      opcoes: opcoesRevisaoAdminAssistido(),
      registrarPergunta: false,
      audio: false
    }
  }
}

function salvarNovoEstadoAtendimento(chave, sessao, adminAssistido, deps) {
  salvarSessaoAdmin(chave, {
    ...sessao,
    adminAssistido
  }, deps)
}

async function cancelarAtendimentoAssistidoAdmin(chave, sessao, deps = {}) {
  const novaSessao = {
    ...sessao,
    listaAtiva: null,
    adminAssistido: null
  }
  salvarSessaoAdmin(chave, novaSessao, deps)

  if (typeof deps.telaAdminPrincipal === "function") {
    const menu = await deps.telaAdminPrincipal()
    return {
      ...menu,
      texto: ["Atendimento Assistido cancelado.", "", menu?.texto || ""].filter(Boolean).join("\n")
    }
  }

  return {
    texto: "Atendimento Assistido cancelado. Retornando ao menu Admin.",
    opcoes: opcoesNavegacaoAdminAssistido({ voltar: false, cancelar: false }),
    registrarPergunta: false,
    audio: false
  }
}

async function voltarAtendimentoAssistidoAdmin(chave, sessao, adminAssistido, deps = {}) {
  if (!adminAssistido || [
    ADMIN_ASSISTIDO_ETAPA_INICIAL,
    ADMIN_ASSISTIDO_ETAPA_COLETA
  ].includes(adminAssistido.etapa)) {
    return await cancelarAtendimentoAssistidoAdmin(chave, sessao, deps)
  }

  const novoEstado = {
    ...adminAssistido,
    etapa: ADMIN_ASSISTIDO_ETAPA_REVISAO,
    perguntaPendente: null,
    campoEmEdicao: null,
    audioTranscricaoPendente: null,
    etapaAntesAudio: null
  }
  salvarNovoEstadoAtendimento(chave, sessao, novoEstado, deps)
  return responderRevisaoCaso(novoEstado)
}

function responderEstadoAtualAtendimentoAssistido(adminAssistido = {}) {
  if (adminAssistido.etapa === ADMIN_ASSISTIDO_ETAPA_REVISAO) return responderRevisaoCaso(adminAssistido)
  if (adminAssistido.etapa === ADMIN_ASSISTIDO_ETAPA_CONFIRMAR_AUDIO) {
    return telaConfirmarAudioAdminAssistido(adminAssistido.audioTranscricaoPendente)
  }

  const dados = adminAssistido.dados || criarDadosVaziosAdminAssistido()
  const area = valorCampo(dados, "areaJuridica") || adminAssistido.analise?.areaJuridica || "Outros"
  const pendentesPosterior = Array.isArray(adminAssistido.pendentesPosterior) ? adminAssistido.pendentesPosterior : []
  const faltantes = camposFaltantesAtivosAdminAssistido(dados, area, pendentesPosterior)
  const proximoCampo = adminAssistido.perguntaPendente || proximoCampoAtivoAdminAssistido(dados, area, pendentesPosterior)
  if (proximoCampo) {
    return {
      texto: textoResumoAnaliseAdminAssistido({ dados, faltantes, proximoCampo }),
      opcoes: opcoesNavegacaoAdminAssistido(),
      registrarPergunta: false,
      audio: false
    }
  }
  return responderRevisaoCaso({ ...adminAssistido, etapa: ADMIN_ASSISTIDO_ETAPA_REVISAO })
}

const ADMIN_ASSISTIDO_ETAPA_REVISION_EMAIL = "revision_email"

function telaRevisaoEmailAdminAssistido() {
  return {
    texto: [
      "*Revisão de e-mail*",
      "",
      "O e-mail informado não é válido ou foi omitido.",
      "",
      "1️⃣ Corrigir e-mail",
      "2️⃣ Deixar sem e-mail",
      "3️⃣ Informar depois",
      "4️⃣ Revisar dados"
    ].join("\n"),
    opcoes: opcoesRevisaoEmailAdminAssistido(),
    registrarPergunta: false,
    audio: false
  }
}

async function acaoRevisaoEmailAdminAssistidoHandler(acao, from, chave, sessao, adminAssistido, deps) {
  const dados = adminAssistido.dados || criarDadosVaziosAdminAssistido()
  const area = valorCampo(dados, "areaJuridica") || adminAssistido.analise?.areaJuridica || "Outros"
  const pendentesPosterior = Array.isArray(adminAssistido.pendentesPosterior) ? adminAssistido.pendentesPosterior : []

  if (acao === "corrigir") {
    const novoEstado = {
      ...adminAssistido,
      etapa: ADMIN_ASSISTIDO_ETAPA_AGUARDANDO_EDICAO,
      campoEmEdicao: "email",
      perguntaPendente: "email"
    }
    salvarNovoEstadoAtendimento(chave, sessao, novoEstado, deps)
    return {
      texto: "Qual é o e-mail correto do cliente?",
      opcoes: opcoesNavegacaoAdminAssistido(),
      registrarPergunta: false,
      audio: false
    }
  }

  if (acao === "omitir") {
    const novoEstado = {
      ...adminAssistido,
      dados: {
        ...dados,
        email: criarCampoAdminAssistido(null, "ausente")
      },
      etapa: ADMIN_ASSISTIDO_ETAPA_REVISAO,
      campoEmEdicao: null,
      perguntaPendente: null
    }
    salvarNovoEstadoAtendimento(chave, sessao, novoEstado, deps)
    const faltantes = camposFaltantesAtivosAdminAssistido(novoEstado.dados, area, pendentesPosterior)
    const proximoCampo = proximoCampoAtivoAdminAssistido(novoEstado.dados, area, pendentesPosterior)
    return {
      texto: textoResumoAnaliseAdminAssistido({ dados: novoEstado.dados, faltantes, proximoCampo }),
      opcoes: opcoesRevisaoAdminAssistido(),
      registrarPergunta: false,
      audio: false
    }
  }

  if (acao === "depois") {
    const novoEstado = {
      ...adminAssistido,
      dados: {
        ...dados,
        email: criarCampoAdminAssistido(null, "ausente")
      },
      pendentesPosterior: Array.from(new Set([...pendentesPosterior, "email"])),
      etapa: ADMIN_ASSISTIDO_ETAPA_REVISAO,
      campoEmEdicao: null,
      perguntaPendente: null
    }
    salvarNovoEstadoAtendimento(chave, sessao, novoEstado, deps)
    const faltantes = camposFaltantesAtivosAdminAssistido(novoEstado.dados, area, novoEstado.pendentesPosterior)
    const proximoCampo = proximoCampoAtivoAdminAssistido(novoEstado.dados, area, novoEstado.pendentesPosterior)
    return {
      texto: textoResumoAnaliseAdminAssistido({ dados: novoEstado.dados, faltantes, proximoCampo }),
      opcoes: opcoesRevisaoAdminAssistido(),
      registrarPergunta: false,
      audio: false
    }
  }

  if (acao === "revisar") {
    const novoEstado = {
      ...adminAssistido,
      etapa: ADMIN_ASSISTIDO_ETAPA_REVISAO,
      campoEmEdicao: null,
      perguntaPendente: null
    }
    salvarNovoEstadoAtendimento(chave, sessao, novoEstado, deps)
    return responderRevisaoCaso(novoEstado)
  }

  return telaRevisaoEmailAdminAssistido()
}

async function processarAtendimentoAssistidoAdmin(from, text, msgObj = null, deps = {}) {
  const { chave, sessao } = obterSessaoAdmin(from, deps)
  if (!chave || !sessao?.adminAssistido?.ativo) {
    return {
      texto: "Fluxo de Atendimento Assistido iniciado.",
      opcoes: opcoesNavegacaoAdminAssistido(),
      registrarPergunta: false,
      audio: false
    }
  }

  let adminAssistido = sessao.adminAssistido
  const textoComando = sanitizarTextoEntrada(text)
  const navegacao = acaoNavegacaoAdminAssistido(textoComando)
  if (navegacao === "cancelar" || navegacao === "menu") {
    return await cancelarAtendimentoAssistidoAdmin(chave, sessao, deps)
  }
  if (navegacao === "voltar") {
    return await voltarAtendimentoAssistidoAdmin(chave, sessao, adminAssistido, deps)
  }

  if (adminAssistido.aguardandoConfirmacaoRetomada) {
    const acaoRetomada = acaoRetomadaAdminAssistido(textoComando)
    if (acaoRetomada === "cancelar") {
      return await cancelarAtendimentoAssistidoAdmin(chave, sessao, deps)
    }
    if (acaoRetomada !== "continuar") {
      return telaRetomadaAtendimentoAssistidoAdmin()
    }
    adminAssistido = {
      ...adminAssistido,
      aguardandoConfirmacaoRetomada: false
    }
    salvarNovoEstadoAtendimento(chave, sessao, adminAssistido, deps)
    return responderEstadoAtualAtendimentoAssistido(adminAssistido)
  }

  const tipoMidia = tipoEntradaAdminAssistido(msgObj)
  if (["image", "document"].includes(tipoMidia)) {
    if (typeof deps.processarMidiaAdminAssistida !== "function") {
      return {
        texto: "A mídia não pôde ser preparada com segurança. Tente novamente ou envie após selecionar o caso.",
        opcoes: opcoesNavegacaoAdminAssistido(),
        registrarPergunta: false,
        audio: false
      }
    }
    const resultadoMidia = await deps.processarMidiaAdminAssistida(msgObj, {
      from,
      adminAssistido
    })
    if (!resultadoMidia?.ok) {
      return {
        texto: "Não consegui validar esse arquivo. Ele não foi anexado ao caso.",
        opcoes: opcoesNavegacaoAdminAssistido(),
        registrarPergunta: false,
        audio: false
      }
    }
    const documentos = Array.isArray(adminAssistido.documentos) ? adminAssistido.documentos : []
    const documento = resultadoMidia.document
    const novoEstado = {
      ...adminAssistido,
      documentos: documentos.some(item => item.sha256 === documento.sha256)
        ? documentos
        : [...documentos, documento],
      revisaoDocumentalNecessaria: documento.status !== "approved"
    }
    salvarNovoEstadoAtendimento(chave, sessao, novoEstado, deps)
    return {
      texto: [
        resultadoMidia.duplicate ? "Arquivo já recebido anteriormente." : "Arquivo recebido e analisado.",
        `Status: ${documento.status === "approved" ? "aprovado" : "em quarentena para revisão"}.`,
        documento.type ? `Tipo: ${documento.type}.` : null,
        "Você pode enviar outros arquivos ou continuar o atendimento."
      ].filter(Boolean).join("\n"),
      opcoes: opcoesNavegacaoAdminAssistido(),
      registrarPergunta: false,
      audio: false
    }
  }

  const entradaCapturada = await capturarEntradaAtendimentoAssistido(text, msgObj, deps)
  registrarEntradaAtendimentoAssistidoAdmin(from, entradaCapturada.texto, msgObj, deps)
  const sessaoRegistrada = obterSessaoAdmin(from, deps).sessao || sessao
  if (sessaoRegistrada?.adminAssistido) {
    sessao.adminAssistido = sessaoRegistrada.adminAssistido
    adminAssistido = sessao.adminAssistido
  }

  if (entradaCapturada.erroAudio) {
    return telaErroAudioAdminAssistido(entradaCapturada.erroAudio)
  }

  if (adminAssistido.etapa === ADMIN_ASSISTIDO_ETAPA_CONFIRMAR_AUDIO) {
    if (entradaCapturada.audio) {
      const novoEstadoAudio = {
        ...adminAssistido,
        audioTranscricaoPendente: entradaCapturada.texto
      }
      salvarNovoEstadoAtendimento(chave, sessao, novoEstadoAudio, deps)
      return telaConfirmarAudioAdminAssistido(entradaCapturada.texto)
    }

    const acaoAudio = acaoConfirmacaoAudioAdminAssistido(entradaCapturada.texto)
    if (acaoAudio === "reenviar") {
      const novoEstadoAudio = {
        ...adminAssistido,
        etapa: adminAssistido.etapaAntesAudio || ADMIN_ASSISTIDO_ETAPA_INICIAL,
        audioTranscricaoPendente: null,
        etapaAntesAudio: null
      }
      salvarNovoEstadoAtendimento(chave, sessao, novoEstadoAudio, deps)
      return {
        texto: "Tudo bem. Reenvie o áudio ou envie o relato por texto.",
        opcoes: opcoesNavegacaoAdminAssistido(),
        registrarPergunta: false,
        audio: false
      }
    }
    if (acaoAudio !== "confirmar") {
      return telaConfirmarAudioAdminAssistido(adminAssistido.audioTranscricaoPendente)
    }

    text = adminAssistido.audioTranscricaoPendente || ""
    msgObj = { type: "text", text: { body: text } }
    adminAssistido = {
      ...adminAssistido,
      etapa: adminAssistido.etapaAntesAudio || ADMIN_ASSISTIDO_ETAPA_INICIAL,
      audioTranscricaoPendente: null,
      etapaAntesAudio: null
    }
    sessao.adminAssistido = adminAssistido
  } else if (entradaCapturada.audio) {
    const novoEstadoAudio = {
      ...adminAssistido,
      etapa: ADMIN_ASSISTIDO_ETAPA_CONFIRMAR_AUDIO,
      etapaAntesAudio: adminAssistido.etapa,
      audioTranscricaoPendente: entradaCapturada.texto
    }
    salvarNovoEstadoAtendimento(chave, sessao, novoEstadoAudio, deps)
    return telaConfirmarAudioAdminAssistido(entradaCapturada.texto)
  }

  const entrada = sanitizarTextoEntrada(text || entradaCapturada.texto)

  if (adminAssistido.etapa === ADMIN_ASSISTIDO_ETAPA_REVISAO) {
    const acao = acaoRevisaoAdminAssistido(entrada)

    if (acao === "confirmar") {
      return await confirmarCriarCasoAdminAssistido(from, chave, sessao, adminAssistido, deps)
    }

    if (acao === "editar") {
      const novoEstado = {
        ...adminAssistido,
        etapa: ADMIN_ASSISTIDO_ETAPA_EDITAR_CAMPO,
        campoEmEdicao: null
      }
      salvarNovoEstadoAtendimento(chave, sessao, novoEstado, deps)
      return {
        texto: textoEscolhaCampoEdicao(novoEstado),
        opcoes: opcoesNavegacaoAdminAssistido(),
        registrarPergunta: false,
        audio: false
      }
    }

     if (acao === "cancelar") {
      return await cancelarAtendimentoAssistidoAdmin(chave, sessao, deps)
    }

    return responderRevisaoCaso(adminAssistido)
  }

  // Roteamento de botões de revisão de e-mail
  if (adminAssistido.etapa === ADMIN_ASSISTIDO_ETAPA_REVISION_EMAIL) {
    const acaoEmail = acaoRevisaoEmailAdminAssistido(entrada)
    if (acaoEmail) {
      return await acaoRevisaoEmailAdminAssistidoHandler(acaoEmail, from, chave, sessao, adminAssistido, deps)
    }
    return telaRevisaoEmailAdminAssistido()
  }

  if (adminAssistido.etapa === ADMIN_ASSISTIDO_ETAPA_EDITAR_CAMPO) {
    const campo = resolverCampoEdicao(adminAssistido, entrada)
    if (!campo) {
      return {
        texto: ["Não encontrei esse campo.", "", textoEscolhaCampoEdicao(adminAssistido)].join("\n"),
        opcoes: opcoesNavegacaoAdminAssistido(),
        registrarPergunta: false,
        audio: false
      }
    }

    const novoEstado = {
      ...adminAssistido,
      etapa: ADMIN_ASSISTIDO_ETAPA_AGUARDANDO_EDICAO,
      campoEmEdicao: campo
    }
    salvarNovoEstadoAtendimento(chave, sessao, novoEstado, deps)
    return {
      texto: perguntaCampoAdminAssistido(campo),
      opcoes: opcoesNavegacaoAdminAssistido(),
      registrarPergunta: false,
      audio: false
    }
  }

  if (adminAssistido.etapa === ADMIN_ASSISTIDO_ETAPA_AGUARDANDO_EDICAO) {
    const campo = adminAssistido.campoEmEdicao
    let dadosEditados = {
      ...(adminAssistido.dados || criarDadosVaziosAdminAssistido()),
      [campo]: normalizarCampoAdminAssistido(campo, entrada, "confirmado")
    }

    // Validação de e-mail: se o campo for "email" e o valor for inválido,
    // permanecer na edição sem avançar. Nunca salvar o ID do botão como e-mail.
    if (campo === "email" && !emailValidoAdminAssistido(entrada)) {
      const novoEstadoEmailInvalido = {
        ...adminAssistido,
        dados: dadosEditados,
        etapa: ADMIN_ASSISTIDO_ETAPA_AGUARDANDO_EDICAO,
        campoEmEdicao: "email",
        perguntaPendente: "email"
      }
      salvarNovoEstadoAtendimento(chave, sessao, novoEstadoEmailInvalido, deps)
      return {
        texto: [
          "*O e-mail informado não é válido.*",
          "",
          "1️⃣ Corrigir e-mail",
          "2️⃣ Deixar sem e-mail",
          "3️⃣ Informar depois",
          "4️⃣ Revisar dados"
        ].join("\n"),
        opcoes: opcoesRevisaoEmailAdminAssistido(),
        registrarPergunta: false,
        audio: false
      }
    }

    // Se o e-mail foi validado com sucesso, limpar estado de falha anterior
    if (campo === "email" && emailValidoAdminAssistido(entrada)) {
      dadosEditados = {
        ...dadosEditados,
        email: criarCampoAdminAssistido(entrada, "confirmado")
      }
      delete dadosEditados._ultimaFalhaIntegracao
    }

    const areaEditada = valorCampo(dadosEditados, "areaJuridica") || adminAssistido.analise?.areaJuridica || "Outros"
    const pendentesPosteriorEdicao = Array.isArray(adminAssistido.pendentesPosterior) ? adminAssistido.pendentesPosterior : []
    const faltantesEdicao = camposFaltantesAtivosAdminAssistido(dadosEditados, areaEditada, pendentesPosteriorEdicao)
    const proximoCampoEdicao = proximoCampoAtivoAdminAssistido(dadosEditados, areaEditada, pendentesPosteriorEdicao)
    const novoEstado = {
      ...adminAssistido,
      etapa: proximoCampoEdicao ? ADMIN_ASSISTIDO_ETAPA_COLETA : ADMIN_ASSISTIDO_ETAPA_REVISAO,
      dados: dadosEditados,
      analise: atualizarAnaliseAdminAssistido(adminAssistido.analise, dadosEditados),
      perguntaPendente: proximoCampoEdicao,
      campoEmEdicao: null,
      faltantes: faltantesEdicao
    }
    salvarNovoEstadoAtendimento(chave, sessao, novoEstado, deps)

    if (!proximoCampoEdicao) return responderRevisaoCaso(novoEstado)
    return {
      texto: textoResumoAnaliseAdminAssistido({
        dados: dadosEditados,
        faltantes: faltantesEdicao,
        proximoCampo: proximoCampoEdicao
      }),
      opcoes: opcoesNavegacaoAdminAssistido(),
      registrarPergunta: false,
      audio: false
    }
  }

  let dados = adminAssistido.dados || criarDadosVaziosAdminAssistido()
  let analise = adminAssistido.analise || null

  if (adminAssistido.etapa === ADMIN_ASSISTIDO_ETAPA_INICIAL) {
    analise = await extrairDadosAtendimentoAssistidoIA(entrada)
    dados = mergeDadosAdminAssistido(dados, analise.dados)
  } else if (entrada) {
    dados = atualizarCampoPendente(adminAssistido, entrada)
  }

  const area = valorCampo(dados, "areaJuridica") || analise?.areaJuridica || "Outros"
  const pendentesPosteriorAtuais = Array.isArray(adminAssistido.pendentesPosterior) ? adminAssistido.pendentesPosterior : []
  const campoPendentePulou = entradaPedeInformarDepois(entrada) && campoPodeFicarPendenteAdminAssistido(adminAssistido.perguntaPendente)
    ? adminAssistido.perguntaPendente
    : null
  const pendentesPosterior = campoPendentePulou && !pendentesPosteriorAtuais.includes(campoPendentePulou)
    ? [...pendentesPosteriorAtuais, campoPendentePulou]
    : pendentesPosteriorAtuais
  const faltantes = camposFaltantesAtivosAdminAssistido(dados, area, pendentesPosterior)
  const proximoCampo = proximoCampoAtivoAdminAssistido(dados, area, pendentesPosterior)
  const camposPerguntados = Array.isArray(adminAssistido.camposPerguntados)
    ? adminAssistido.camposPerguntados
    : []

  const novoEstado = {
    ...adminAssistido,
    etapa: proximoCampo ? ADMIN_ASSISTIDO_ETAPA_COLETA : ADMIN_ASSISTIDO_ETAPA_REVISAO,
    dados,
    analise: atualizarAnaliseAdminAssistido(analise, dados, analise?.origem),
    perguntaPendente: proximoCampo,
    campoEmEdicao: null,
    pendentesPosterior,
    camposPerguntados: proximoCampo && !camposPerguntados.includes(proximoCampo)
      ? [...camposPerguntados, proximoCampo]
      : camposPerguntados,
    faltantes
  }

  salvarNovoEstadoAtendimento(chave, sessao, novoEstado, deps)

  if (!proximoCampo) return responderRevisaoCaso(novoEstado)

  return {
    texto: textoResumoAnaliseAdminAssistido({ dados, faltantes, proximoCampo }),
    opcoes: opcoesNavegacaoAdminAssistido(),
    registrarPergunta: false,
    audio: false
  }
}

module.exports = {
  ADMIN_ASSISTIDO_ETAPA_INICIAL,
  ADMIN_ASSISTIDO_ETAPA_COLETA,
  ADMIN_ASSISTIDO_ETAPA_REVISAO,
  ADMIN_ASSISTIDO_ETAPA_EDITAR_CAMPO,
  ADMIN_ASSISTIDO_ETAPA_AGUARDANDO_EDICAO,
  ADMIN_ASSISTIDO_ETAPA_CONFIRMAR_AUDIO,
  ADMIN_ASSISTIDO_ETAPA_COMPLETO,
  ADMIN_ASSISTIDO_ETAPA_REVISION_EMAIL,
  criarEstadoAtendimentoAssistido,
  atendimentoAssistidoAdminAtivo,
  iniciarAtendimentoAssistidoAdmin,
  processarAtendimentoAssistidoAdmin,
  telaInicioAtendimentoAssistidoAdmin,
  registrarEntradaAtendimentoAssistidoAdmin,
  gerarResumoAdminAssistido,
  montarUsuarioFinalizacaoAdminAssistido,
  confirmarCriarCasoAdminAssistido,
  acaoRevisaoAdminAssistido,
  acaoRevisaoEmailAdminAssistido,
  acaoRevisaoEmailAdminAssistidoHandler,
  telaRevisaoEmailAdminAssistido,
  labelInvariante,
  criarPayloadLogAdminAssistido
}
