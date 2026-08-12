// ================================================================
//  ORACULUM ADVOCACIA — v6.4
//  WhatsApp · HubSpot · Google Drive · AssemblyAI · Groq AI
// ================================================================

const {
  assertConsultationArchitecture,
  assertConsultationReleaseIntegrity
} = require("./src/domain/consultation")
assertConsultationReleaseIntegrity({ root: __dirname })
assertConsultationArchitecture({ root: __dirname })

// ================================================================
//  CONFIG / INIT
// ================================================================

// ================================================================
require("dotenv").config()

const express    = require("express")
const axios      = require("axios")
const { google } = require("googleapis")
const { privacyPolicyPage, dataDeletionPage } = require("./src/domain/public-lgpd-pages")
const { INSTITUTIONAL_CALENDAR_ID: CALENDAR_ID } = require("./src/config/institutional-calendar")
const path       = require("path")
const fs         = require("fs")
const crypto     = require("crypto")
const { gerarAudioAtendente } = require("./tts")
const nodemailer = require("nodemailer")
const {
  sanitizarTextoEntrada,
  normalizarStageKey,
  normalizarTextoGatilho,
  ehMensagemEntradaGlobal,
  normalizarNomeCidadeBusca,
  formatarNome,
  formatarCidade,
  normalizarTextoCRM,
  limparTextoSomenteLetras
} = require("./src/utils/text")
const {
  DOCS_EXTRA,
  getDocumentosListaCaso,
  getDocumentosCaso,
  criarContextoDocsCasoAtual,
  aplicarContextoDocsCasoAtual,
  detectarComandoDocumento,
  marcarStatusDocumento,
  garantirListasDocumentos,
  calcularStatusDocumentos,
  getDocsPendentes,
  getDocsFaltantesReenviaveis,
  reabrirDocsFaltantesReenviaveis,
  getDocumentoAtualGuia,
  documentoAtualAceitaTexto,
  textoIndicaDocumentoAusente
} = require("./src/domain/documents-core")
const {
  fraseEnvioDocumentoAudio,
  imagemPorAreaTipo,
  imagemPorCaso,
  telaDocsPendentesComImagem,
  montarStatusDocumentosVisual,
  telaEnvioDoc,
  IMAGEM_DOCS_FINAL_URL
} = require("./src/domain/documents-ui")
const {
  descricaoRelacaoTerceiroPreAtendimento,
  perguntaAtualPreAtendimento,
  gerarMensagemAcolhimento
} = require("./src/domain/pre-atendimento-ui")
const { telaModoAtendimento } = require("./src/domain/client-mode-ui")
const {
  detectarIntencaoCliente,
  pareceDuvidaCasoAtualOuNovo,
  pareceNovaSituacaoCliente
} = require("./src/domain/client-intent-detector")
const {
  detectarSofrimentoIntenso,
  detectarModoAtendimento,
  deveAtivarModoDigitando
} = require("./src/domain/message-classifiers")
const {
  telaClienteCasoAtualOuNovo,
  telaAudioClienteCasoAtualOuNovo,
  telaAudioNoFluxo,
  gerarFallbackEmpatico
} = require("./src/domain/client-message-builders")
const { criarLegacyIntakeRouter } = require("./src/domain/legacy-intake-router")
const { criarPostAudioRouter } = require("./src/domain/post-audio-router")
const { criarClientNavigationRouter } = require("./src/domain/client-navigation-router")
const { handleDescriptionConfirmation } = require("./src/domain/stage-handlers/description-confirmation-handler")
const { handleAudioConfirmation } = require("./src/domain/stage-handlers/audio-confirmation-handler")
const { handleConfirmEntryInvalid } = require("./src/domain/stage-handlers/confirm-entry-invalid-handler")
const { handleConfirmEntryCorrection } = require("./src/domain/stage-handlers/confirm-entry-correction-handler")
const { handleConfirmEntryCorrectedName } = require("./src/domain/stage-handlers/confirm-entry-corrected-name-handler")
const { handleConfirmEntryPhone } = require("./src/domain/stage-handlers/confirm-entry-phone-handler")
const { handleConfirmEntryFinalAcceptance } = require("./src/domain/stage-handlers/confirm-entry-final-acceptance-handler")
const { handleAudioIntake } = require("./src/domain/audio/audio-intake-pipeline-router")
const { routeClientIntake } = require("./src/domain/client/client-intake-decision-router")
const { NEXT_ACTIONS: CLIENT_POST_INTAKE_ACTIONS, routeClientPostIntake } = require("./src/domain/client/client-post-intake-decision-router")
const { handle: handleRevalidateNameConfirm } = require("./src/domain/client/handlers/revalidate-name-confirm.handler")
const { executarComRetryHubSpot, mascararErroHubSpot } = require("./src/utils/hubspot-retry")
const { resolverNomeParaAdmin, resolverNomeUnificado, validarNomePerfilWhatsApp, montarNomeCompletoHubSpot, primeiroEUltimoNome: primeiroEUltimoNomeAdmin } = require("./src/domain/admin-name-resolver")
const { handle: handleRevalidateNameCorrectText } = require("./src/domain/client/handlers/revalidate-name-correct-text.handler")
const { handle: handleRevalidateCityConfirm } = require("./src/domain/client/handlers/revalidate-city-confirm.handler")
const { handle: handleRevalidateCitySelect } = require("./src/domain/client/handlers/revalidate-city-select.handler")
const { handle: handleRevalidatePhoneConfirm } = require("./src/domain/client/handlers/revalidate-phone-confirm.handler")
const { handle: handleRevalidatePhoneCorrectText } = require("./src/domain/client/handlers/revalidate-phone-correct-text.handler")
const { handle: handleConfirmEntryInvalidRetry } = require("./src/domain/client/handlers/confirm-entry-invalid-retry.handler")
const {
  formatarSituacaoJuridica,
  formatarDetalheJuridico,
  detectarReferenciaTerceiro,
  formatarValorCorrecao,
  classificarReuniaoCliente,
  removerFormatacaoParaAudio,
  textoAudioOpcoes,
  textoAudioAutomatico,
  textoTemMarcadorVisual
} = require("./src/domain/text-utils")
const {
  textoNormalizadoPreAtendimento,
  pareceCasoParaTerceiroPreAtendimento,
  relacaoTerceiroPreAtendimento,
  parecePedidoAdvogadoDiretoPreAtendimento,
  parecePerguntaFuncionalPreAtendimento,
  classificarEntradaPreAtendimento,
  respostaCurtaDuvidaPreAtendimento
} = require("./src/domain/pre-atendimento-classifier")
const {
  classificarAreaAudio
} = require("./src/domain/area-audio-classifier")
const {
  classificarResumoOutro,
  aplicarClassificacaoJuridica,
  gerarPerguntaEsclarecimentoRelato,
  acumularRelato,
  deveEsclarecerRelato,
  aplicarSugestaoFluxoOutro,
  classificarAcaoAudioFluxo,
  extrairNomeAudio,
  extrairCidadeAudio,
  extrairCampoCorrecaoIA,
  consolidarDescricaoCorrecaoIA,
  gerarResumoDescricaoConfirmacao
} = require("./src/domain/audio-legal-ai")
const {
  calcScore,
  scoreEmocional,
  definirTemperatura,
  getTemperaturaLeadHubSpot,
  mapearTemperatura,
  mapearPrioridade,
  mapearTipoCaso
} = require("./src/domain/lead-temperature")
const {
  opcoesStatusCliente,
  montarBarraStatusCliente,
  montarBlocoAgendamentoStatus,
  montarBlocoDocumentosStatus,
  montarTextoStatusCliente,
  montarAudioStatusCliente
} = require("./src/domain/cliente-status-ui")
const {
  telaConsultaAdvogado,
  telaBuscandoHorarios,
  telaConsultaSemHorarios,
  telaHorariosConsulta,
  telaDuracaoConsulta,
  telaConfirmacaoConsulta,
  telaFalhaAgendamento,
  telaAgendamentoConfirmado,
  telaConfirmarCancelamentoConsulta,
  telaCancelamentoIndisponivel,
  telaConsultaCancelada,
  telaFalhaCancelamentoConsulta
} = require("./src/domain/client-appointment-ui")
const {
  createClientScreen: criarTela,
  gerarBotoesDaTela,
  gerarAudioDaTela
} = require("./src/domain/declarative-screen-guard")
const {
  configurarClientMenuUi,
  iconeAreaJuridica,
  cabecalhoCasoAtivo,
  textoAudioResumoCasosCliente,
  deveMostrarBoasVindasMenuCliente,
  montarCasosMenuCliente,
  menuCliente
} = require("./src/domain/client-menu-ui")
const {
  montarTextoResumoRetomada
} = require("./src/domain/retomada-summary")
const {
  avaliarElegibilidadeReengajamento
} = require("./src/domain/reengagement-engine")
const {
  planejarReengajamentos
} = require("./src/domain/reengagement-planner")
const {
  checklistProducaoAdmin,
  textoResumoDiarioOperacional
} = require("./src/domain/admin-summary-ui")
const {
  configurarAdminCaseUi,
  idadeUltimaInteracaoAdmin,
  minutosParaTexto,
  labelIdadeAdmin,
  resumoCasoAdmin,
  tituloOpcaoCasoAdmin,
  opcoesAposAcaoCasoAdmin,
  ADMIN_MENU_LABELS
} = require("./src/domain/admin-case-ui")
const {
  montarBotaoAtendimentoRealizado,
  waitForActionContextButton,
  handleAtendimentoRealizadoConfirmation,
  isPilotCaseAllowed,
  normalizeCaseNumber
} = require("./src/domain/admin-post-human-complementation")
const { isPostHumanComplementationEnabled } = require("./src/domain/post-human-feature-flag")
const { automationTargetAllowed } = require("./src/domain/automation-pilot")
const { PostHumanCycleRepository } = require("./src/domain/post-human-cycle-model")
const { PostHumanActionContextRepository } = require("./src/domain/post-human-action-context-repository")
const { processPostHumanCycle } = require("./src/domain/post-human-flow")
const { createPostHumanDispatcher, recoverPostHumanCycles } = require("./src/domain/post-human-dispatcher")
const { createLegacyDocumentPipeline } = require("./src/domain/post-human-document-pipeline")
const {
  CONTACT_FIELDS: POST_HUMAN_CONTACT_FIELDS,
  DEAL_FIELDS: POST_HUMAN_DEAL_FIELDS,
  resolveComplementaryContext,
  resolveComplementaryFields
} = require("./src/domain/post-human-complementary-fields")
const { buildInssLegalAnswerResult, isInssLegalField } = require("./src/domain/inss-legal-facts")
const { buildBpcLegalAnswerResult, isBpcLegalField, isBpcCase } = require("./src/domain/bpc-legal-facts")
const {
  resolveLegalCaseNomenclature,
  applyLegalCaseNomenclatureToUser
} = require("./src/domain/legal-case-nomenclature")
const { ADDRESS_FIELDS, buildAddressAnswerResult } = require("./src/domain/address-facts")
const { CAMPOS_ADMIN_ASSISTIDO } = require("./src/domain/admin-assisted-ai-schema")
const { atualizarHubSpotSeguro } = require("./src/domain/post-human-hubspot-updater")
const { META_TEMPLATES } = require("./src/domain/meta-templates")
const {
  montarDossieJuridicoAdminWhatsApp
} = require("./src/domain/admin-legal-dossier-ui")
const {
  mesclarItensAdminPorIdentidade
} = require("./src/domain/admin-item-merge")
const {
  searchAdminCases,
  buildCaseComplement,
  applyComplementLocally,
  scheduleAdminCase
} = require("./src/domain/admin-case-operations")
const {
  mapearNegociosHubSpotAdmin
} = require("./src/domain/admin-hubspot-deal-mapper")
const {
  inspecionarRespostaBuscaHubSpotAdmin
} = require("./src/domain/admin-hubspot-search-response")
const {
  resolverUrgenciaAdmin,
  persistirUrgenciaAltaAdmin
} = require("./src/domain/admin-urgency")
const {
  numeroPorExtenso,
  formatarSlot,
  formatarSlotAudio
} = require("./src/domain/calendar-format")
const {
  getConsultaView,
  listConsultasAtivasViews,
  findConsultaCalendarEventInRange,
  getConsultaCalendarEventState,
  listConsultaCalendarEventsForReconciliation,
  classificarEstadoCalendar,
  buscarHorariosDisponiveis,
  criarEventoConsulta,
  definirResultadoConsulta,
  cancelarEventosAtivosDoDeal,
  appendConsultaEvent
} = require("./src/domain/consultation")
const {
  estadoPorExtenso,
  mapearRegiaoPorUF,
  buscarCidadePorNome,
  buscarCidadePorNomeInteligente,
  buscarPorCEP,
  abreviarCidadeBotao
} = require("./src/domain/geo-search")
const {
  criarPastaCliente,
  uploadDrive,
  obterOuCriarSubpastaDrive,
  marcarArquivoDriveSubstituido,
  renomearArquivoDrive,
  uploadPastaAudio,
  salvarAudioTranscritoNoCaso,
  listarArquivosDriveNaPasta
} = require("./src/domain/drive-files")
const {
  processarAnaliseDocumentalPosUpload
} = require("./src/domain/document-analysis-integration")
const { confirmCanonicalDocument } = require("./src/domain/document-canonical-service")
const { projectDocumentDecision } = require("./src/domain/document-checklist-projection")
const { reevaluatePostHumanForDecision } = require("./src/domain/post-human-document-reevaluation")
const {
  sincronizarDocumentosHubSpot,
  aplicarDadosDocumentaisConfiaveisAoUsuario,
  validarContextoDocumentalHubSpot
} = require("./src/domain/document-hubspot-sync")
const { atualizarEstadoDocumental } = require("./src/domain/document-state-repository")
const { resolveDocumentPartyIdentity } = require("./src/domain/document-party-identity")
const {
  evaluateGuidedDocumentReceipt,
  applyGuidedDocumentReceipt
} = require("./src/domain/document-guided-receipt")
const { executarPipelineDocumental } = require("./src/domain/document-pipeline-orchestrator")
const { createAdminAssistedMediaStaging, processExistingCaseAdminMedia } = require("./src/domain/admin-assisted-media")
const { createLiveCaseFlow, buildCanonicalPlan } = require("./src/domain/live-case-executor-bridge")
const { criarGracefulShutdown } = require("./src/infrastructure/graceful-shutdown")
const {
  consolidarDocumentosDoCaso
} = require("./src/domain/document-consolidation")
const {
  configurarLogging,
  logDebug,
  logInfo,
  logContextoExecucao,
  logErro,
  detalhesErroHubSpot,
  logErroHubSpot,
  mascararTelefoneLog
} = require("./src/utils/logging")
const {
  digitando,
  enviar,
  enviarAudio: enviarAudioTransport,
  enviarAudioComResultado: enviarAudioTransportComResultado,
  enviarImagemWhatsApp,
  ultimosAudiosEnviados,
  validarDestinatarioWhatsApp,
  validarTextoWhatsApp,
  validarOpcoesWhatsApp
} = require("./src/domain/whatsapp-transport")
const templateService = require("./src/domain/template-service")
const { enviarAudioPedidoDocumentos } = require("./src/domain/admin-document-request-audio")
const { validarMetaWabaNoBoot } = require("./src/domain/meta-waba-validator")
const {
  validarAssinaturaMeta,
  validarWebhookInterno
} = require("./src/domain/webhook-security")
const {
  criarCaminhoAudioAssinado,
  validarUrlAudioAssinada
} = require("./src/domain/audio-url-security")
const {
  aplicarHeadersSeguranca,
  criarRateLimiter
} = require("./src/domain/http-security")
const {
  configurarStatePersistence,
  serializarEstado,
  desserializarEstado,
  persistirUsersAgora,
  agendarPersistenciaUsers,
  persistirSessoesAdminAssistidasAgora,
  agendarPersistenciaSessoesAdminAssistidas,
  carregarSessoesAdminAssistidasPersistidas,
  hidratarUsuarioPersistido,
  carregarUsersPersistidos,
  gravarJsonAtomico,
  criarChaveWebhookDuravel,
  carregarWebhookInbox,
  registrarMensagensWebhook,
  listarWebhookPendentes,
  marcarWebhookProcessing,
  marcarWebhookCompleted,
  marcarWebhookError,
  obterEstadoWebhookInbox,
  carregarMensagensOutbound,
  registrarMensagemOutbound,
  atualizarStatusMensagemOutbound,
  carregarPendenciasAudioPedidoDocumentos,
  criarPendenciaAudioPedidoDocumentos,
  reservarPendenciaAudioPedidoDocumentos,
  concluirPendenciaAudioPedidoDocumentos
} = require("./src/domain/state-persistence")
const { createCommunicationPreferences, applyPreferenceToUser } = require("./src/domain/communication-preferences")
const api = { persistirUsersAgora }
const {
  CALLBACK_IDEMPOTENCY_FILE,
  createCallbackKey,
  beginCallbackExecution,
  completeCallbackExecution,
  abandonCallbackExecution,
  recoverCallbackIdempotencyAbandonedProcessing
} = require("./src/domain/callback-idempotency")
const {
  initializeExternalStateRepository,
  flushExternalState,
  externalStateHealth,
  closeExternalStateRepository,
  getPool
} = require("./src/infrastructure/external-state-repository")
const {
  initializeInternalScheduler,
  createInternalSchedulerRepository
} = require("./src/infrastructure/internal-scheduler-postgres")
const { processInternalSchedule } = require("./src/domain/internal-scheduler")
const {
  consultationScope,
  consultationLifecycleScope,
  reengagementScope
} = require("./src/domain/internal-scheduler-plans")
const {
  dispatchConversationContext
} = require("./src/domain/conversation-context-dispatcher")
const {
  cancelarReengajamentosPendentes
} = require("./src/domain/reengagement-cancel-webhook")
const {
  transcrever
} = require("./src/domain/assemblyai-transcription")
const {
  configurarHubSpotCore,
  HS,
  hsBuscarPorCpf,
  hsBuscarPorPhone,
  hsBuscarContatoSeguro,
  hsCriarContato,
  hsCriarNegocio,
  hsAssociar,
  filtrarPropsHubSpot,
  montarPropsContatoHubSpot,
  montarPropsAusentesContatoHubSpot,
  hsAtualizarContato,
  hsCriarNota,
  hsCriarNotaNegocio,
  hsAtualizarNegocio
} = require("./src/domain/hubspot-core")
const {
  configurarHubSpotSync,
  hsAtualizarNegocioComEstado,
  hsAtualizarNegocioSerializado,
  atualizarDealstage,
  sincronizarNegocio,
  restaurarEstadoNegocioHubSpot,
  deveSincronizarEstadoHubSpot,
  sincronizarContatoNegocioHubSpot,
  hsBuscarNegocioAbertoDoContato,
  hsBuscarNegocioAbertoInfoDoContato,
  hsBuscarNegociosComCasoDoContato,
  hsListarNegociosAtivosDoContato,
  hsListarNegociosAtivosDoContatoEstrito,
  hsAtualizarEtapaNegocio,
  hsMoverStage,
  hsMoverStageSeguro
} = require("./src/domain/hubspot-sync")
const {
  telefoneCanonico,
  definirContatoId,
  definirNegocioId
} = require("./src/domain/identity")
const { normalizarTelefoneHubSpot } = require("./src/domain/phone-name")
const {
  configurarGroqClientReplies,
  respostaIA,
  respostaIACliente
} = require("./src/domain/groq-client-replies")
const {
  configurarAdminAuth,
  ehWhatsAppAdmin,
  chaveAdminWhatsApp,
  logSegurancaAdmin,
  senhaAdminConfigurada,
  senhaAdminValida,
  adminWhatsAppBloqueado,
  registrarFalhaSenhaAdmin,
  adminWhatsAppAutenticado,
  telaSenhaAdminWhatsApp,
  autenticarAdminWhatsApp,
  bloquearAdminWhatsApp
} = require("./src/domain/admin-auth")
const {
  atendimentoAssistidoAdminAtivo,
  iniciarAtendimentoAssistidoAdmin,
  processarAtendimentoAssistidoAdmin,
  criarPayloadLogAdminAssistido
} = require("./src/domain/admin-assisted-ai-flow")
const {
  montarTituloNegocioHubSpot,
  aplicarTituloNegocioHubSpot
} = require("./src/domain/hubspot-deal-title")

const adminAssistedMediaStaging = createAdminAssistedMediaStaging({
  maxBytes: Number(process.env.WHATSAPP_MEDIA_MAX_BYTES || 20 * 1024 * 1024)
})

const HS_STAGE = {
  LEAD: "appointmentscheduled",
  CADASTRO: "qualifiedtobuy",
  ANALISE: "presentationscheduled",
  AGUARDANDO_DOCS: "decisionmakerboughtin",
  DOCS: "contractsent",
  PROTOCOLO: "1343040098",
  PROCESSO: "1337291921",
  FINAL: "1343039663"
}

const liveCaseFlow = createLiveCaseFlow({
  hubspotToken: process.env.HUBSPOT_TOKEN,
  checkpointRepository: {
    async load(hash) {
      const key = `canonical_checkpoint:${hash}`
      const raw = users?._canonicalCheckpoints?.[key]
      return raw || null
    },
    async save(hash, checkpoint) {
      const key = `canonical_checkpoint:${hash}`
      if (!users._canonicalCheckpoints) users._canonicalCheckpoints = {}
      users._canonicalCheckpoints[key] = checkpoint
      agendarPersistenciaUsers()
    }
  },
  hsBuscarPorCpf,
  hsBuscarPorPhone,
  hsCriarContato,
  hsAtualizarContato,
  montarPropsContatoHubSpot,
  montarPropsAusentesContatoHubSpot,
  hsCriarNegocio,
  hsAtualizarNegocioSerializado,
  hsAtualizarEtapaNegocio,
  hsBuscarNegocioAbertoDoContato,
  montarTituloNegocioHubSpot,
  getHubSpotDealStateProps,
  criarPastaCliente,
  uploadDrive,
  marcarArquivoDriveSubstituido,
  renomearArquivoDrive,
  uploadPastaAudio,
  salvarAudioTranscritoNoCaso,
  listarArquivosDriveNaPasta,
  hsCriarNota,
  hsCriarNotaNegocio,
  hsAssociar,
  hsAtualizarNegocio,
  enviarWhatsAppAdmin,
  processarAnaliseDocumentalSegura
})

const {
  primeiroNomeCliente,
  getTelefoneContato,
  normalizarNumeroWhatsAppEnvio,
  normalizarTelefone,
  primeiroEUltimoNome,
  normalizarNomeComparacao,
  formatarTelefoneExibicao,
  formatarTelefoneAudio,
  ehNomeAparente,
  extrairNomeDaCorrecaoExplicita,
  parecePuraNegacaoSemNome,
  getPrimeiroNome,
  getPrimeiroNomeRetomada
} = require("./src/domain/phone-name")
const {
  assertFinalizationInvariants,
  assertFinalizationOperation
} = require("./src/domain/finalization-invariants")

const app = express()
app.set("trust proxy", 1)
app.disable("x-powered-by")
app.use(aplicarHeadersSeguranca)

function criarRequestId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return `${Date.now().toString(36)}-${crypto.randomBytes(8).toString("hex")}`
}

function primeiroValorObservabilidade(...valores) {
  return valores.find(valor => sanitizarTextoEntrada(valor))
}

function telefoneRemetenteWebhookMeta(body = {}) {
  for (const entry of body.entry || []) {
    for (const change of entry?.changes || []) {
      const remetente = change?.value?.messages?.find(message => sanitizarTextoEntrada(message?.from))?.from
      if (remetente) return remetente
    }
  }
  return ""
}

function contextoObservabilidade(req, extras = {}) {
  const body = req?.body || {}
  const query = req?.query || {}
  return {
    route: req?.route?.path || req?.path || extras.route || "",
    requestId: req?.requestId || "",
    phone: primeiroValorObservabilidade(extras.phone, body.phone, body.numero, body.whatsapp, body.from, telefoneRemetenteWebhookMeta(body), query.phone),
    dealId: primeiroValorObservabilidade(extras.dealId, body.dealId, body.casoId, query.dealId),
    contactId: primeiroValorObservabilidade(extras.contactId, body.contactId, query.contactId),
    numeroCaso: primeiroValorObservabilidade(extras.numeroCaso, body.numeroCaso, query.numeroCaso),
    ...extras
  }
}

function logOperacional(req, event, extras = {}) {
  return logInfo({
    event,
    ...contextoObservabilidade(req, extras)
  })
}

function logSkipOperacional(req, reason, extras = {}) {
  return logOperacional(req, `operational_skip.${reason}`, {
    status: reason,
    ...extras
  })
}

const ROTAS_OBSERVADAS = new Set([
  "/webhook",
  "/reengagement-candidates",
  "/reengajamento-dados",
  "/reengajamento",
  "/agendamento",
  "/lembrete",
  "/consulta-status",
  "/internal/processar-agendamentos",
  "/internal/agendador-status"
])

app.use((req, res, next) => {
  req.requestId = criarRequestId()
  res.setHeader("x-request-id", req.requestId)
  next()
})

const limitarWebhookMeta = criarRateLimiter({
  limite: 1000,
  janelaMs: 60 * 1000,
  escopo: "webhook-meta"
})
const limitarWebhookInterno = criarRateLimiter({
  limite: 180,
  janelaMs: 60 * 1000,
  escopo: "webhook-interno"
})
const limitarAudios = criarRateLimiter({
  limite: 600,
  janelaMs: 60 * 1000,
  escopo: "audios"
})

app.use("/webhook", limitarWebhookMeta)
app.use([
  "/health-interno",
  "/resumo-diario",
  "/agendamento",
  "/buscar-contato-reuniao",
  "/evento-cancelado",
  "/pos-consulta",
  "/consulta-status",
  "/lembrete",
  "/internal/processar-agendamentos",
  "/internal/agendador-status"
], limitarWebhookInterno)

const AXIOS_TIMEOUT_MS = Number(process.env.AXIOS_TIMEOUT_MS || 15000)
axios.defaults.timeout = Number.isFinite(AXIOS_TIMEOUT_MS) && AXIOS_TIMEOUT_MS > 0 ? AXIOS_TIMEOUT_MS : 15000
app.use(express.json({
  limit: "1mb",
  verify: (req, _res, buf) => {
    req.rawBody = Buffer.from(buf)
  }
}))
app.use((req, res, next) => {
  if (!ROTAS_OBSERVADAS.has(req.path)) return next()
  const startedAt = Date.now()
  logOperacional(req, "endpoint.start", { status: "started" })
  res.on("finish", () => {
    logOperacional(req, "endpoint.finish", {
      status: res.statusCode,
      durationMs: Date.now() - startedAt
    })
  })
  next()
})
app.use(
  "/audios",
  limitarAudios,
  validarUrlAudioAssinada,
  express.static(path.join(__dirname, "audios"), {
    dotfiles: "deny",
    index: false,
    fallthrough: false
  })
)

function validarAdminHttp(req, res, next) {
  const senha = sanitizarTextoEntrada(req.headers["x-admin-password"] || req.body?.adminPassword || "")
  if (!senhaAdminConfigurada() || !senhaAdminValida(senha)) {
    logSegurancaAdmin(req.body?.phone || req.query?.phone || "-", "acesso http admin negado")
    return res.sendStatus(401)
  }
  next()
}

app.post("/admin/limpar-usuario", validarAdminHttp, async (req, res) => {
  try {
    const telefone = normalizarNumeroWhatsAppEnvio(req.body?.phone || req.body?.numero || "")
    const confirmar = sanitizarTextoEntrada(req.body?.confirmar || "")

    if (!telefone) {
      return res.status(400).json({ ok: false, motivo: "telefone_obrigatorio" })
    }
    if (confirmar !== "LIMPAR_USUARIO") {
      return res.status(400).json({ ok: false, motivo: "confirmacao_invalida" })
    }

    const numeroMascarado = mascararTelefoneLog(telefone)
    const tinha = Object.prototype.hasOwnProperty.call(users, telefone)
    if (tinha) {
      const anterior = { ...users[telefone] }
      delete users[telefone]
      try {
        await api.persistirUsersAgora({ propagarErro: true })
        logInfo(`[admin] usuario_removido phone=${numeroMascarado}`)
      } catch (e) {
        users[telefone] = anterior
        throw e
      }
    } else {
      logInfo(`[admin] usuario_nao_encontrado phone=${numeroMascarado}`)
    }

    return res.json({ ok: true, removido: tinha })
  } catch (e) {
    logErro("admin-limpar-usuario", e.message, e)
    return res.sendStatus(500)
  }
})
// ================================================================
//  NOTIFICAÇÕES — WhatsApp pessoal + E-mail
// ================================================================
const WHATSAPP_ADMIN   = process.env.WHATSAPP_ADMIN   || ""
const HUBSPOT_PORTAL   = process.env.HUBSPOT_PORTAL   || "51306019"
const GMAIL_USER       = process.env.GMAIL_USER       || ""
const GMAIL_PASS       = process.env.GMAIL_PASS       || ""
const AUTO_REENGAJAMENTO = String(process.env.AUTO_REENGAJAMENTO || "").toLowerCase() === "true"
const REENGAGEMENT_SCHEDULE_TOLERANCE_MS = 300000
const REENGAGEMENT_MAX_DELAY_HOURS = 24
const REENGAGEMENT_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000
const REENGAGEMENT_MAX_ATTEMPTS = 3

// Parceiros por área — adicione aqui quando fechar parceria
// Exemplo: { whatsapp: "5581999999999", email: "parceiro@email.com" }
const PARCEIROS_AREA = {
  // familia: { whatsapp: "", email: "" },
  // penal:   { whatsapp: "", email: "" },
}

function linkHubSpot(negocioId) {
  if (!negocioId) return ""
  return `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL}/deal/${negocioId}`
}

function criarTransporteEmail() {
  if (!GMAIL_USER || !GMAIL_PASS) return null
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_USER, pass: GMAIL_PASS }
  })
}

async function enviarEmailNotificacao({ assunto, tituloCard, linhas, negocioId }) {
  const transporte = criarTransporteEmail()
  if (!transporte) return
  const link = linkHubSpot(negocioId)
  const itensHtml = linhas.map(l => `<tr><td style="padding:6px 0;color:#555;font-size:14px;">${l}</td></tr>`).join("")
  const html = `
  <div style="background:#f5f0e8;padding:30px;font-family:Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">
      <div style="background:linear-gradient(135deg,#C9A84C,#a07830);padding:24px 32px;text-align:center;">
        <p style="margin:0;color:#fff;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Oráculum Advocacia</p>
        <h1 style="margin:8px 0 0;color:#fff;font-size:20px;font-weight:700;">${tituloCard}</h1>
      </div>
      <div style="padding:28px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0">${itensHtml}</table>
        ${link ? `<div style="margin-top:24px;text-align:center;"><a href="${link}" style="background:#C9A84C;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">Ver no HubSpot →</a></div>` : ""}
      </div>
      <div style="background:#f9f6f0;padding:14px 32px;text-align:center;font-size:11px;color:#999;">
        Oráculum Advocacia e Consultoria Jurídica · oraculum.juridico@gmail.com
      </div>
    </div>
  </div>`
  try {
    await transporte.sendMail({ from: `"Oráculum Bot" <${GMAIL_USER}>`, to: GMAIL_USER, subject: assunto, html })
  } catch (e) {
    console.error("[email] Falha ao enviar:", e.message)
  }
}

async function enviarWhatsAppAdmin(mensagem) {
  const destino = normalizarNumeroWhatsAppEnvio(WHATSAPP_ADMIN)
  if (!destino) return
  const validacaoDestino = validarDestinatarioWhatsApp(destino)
  if (!validacaoDestino.valido) {
    logErro("whatsapp-admin", `destinatario_invalido: ${validacaoDestino.motivo}`)
    return
  }
  const textoValidado = validarTextoWhatsApp(mensagem)
  if (!textoValidado.valido) {
    logErro("whatsapp-admin", `texto_invalido: ${textoValidado.motivo}`)
    return
  }
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      { messaging_product: "whatsapp", to: validacaoDestino.numero, type: "text", text: { body: textoValidado.texto } },
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" } }
    )
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message
    console.error("[whatsapp-admin] Falha ao notificar:", msg)
  }
}

async function enviarWhatsAppAdmin_para(numero, mensagem) {
  const destino = normalizarNumeroWhatsAppEnvio(numero)
  if (!destino) return
  const validacaoDestino = validarDestinatarioWhatsApp(destino)
  if (!validacaoDestino.valido) {
    logErro("whatsapp-parceiro", `destinatario_invalido: ${validacaoDestino.motivo}`)
    return
  }
  const textoValidado = validarTextoWhatsApp(mensagem)
  if (!textoValidado.valido) {
    logErro("whatsapp-parceiro", `texto_invalido: ${textoValidado.motivo}`)
    return
  }
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      { messaging_product: "whatsapp", to: validacaoDestino.numero, type: "text", text: { body: textoValidado.texto } },
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" } }
    )
  } catch (e) {
    console.error("[whatsapp-parceiro] Falha ao notificar:", e.message)
  }
}

async function enviarRespostaAdmin(from, resposta, messageId) {
  const texto = sanitizarTextoEntrada(resposta?.texto || "")
  const opcoes = Array.isArray(resposta?.opcoes) ? resposta.opcoes : null
  if (!texto && (!opcoes || opcoes.length === 0)) return false

  if (texto.length > 800 && opcoes && opcoes.length > 0) {
    const textoOk = await enviar(from, texto, null, true, messageId)
    if (!textoOk) return false
    const menuOk = await enviar(from, "Escolha uma opção abaixo:", opcoes, true, messageId, true)
    return menuOk
  }

  return await enviar(from, texto, opcoes || null, true, messageId)
}

async function notificarMensagemUrgente(u, mensagem, negocioId) {
  const area = u.area || "Não informado"
  const caso = u.numeroCaso || "Não informado"
  const nome = u.nome || "Não informado"
  const cidade = u.cidade ? `${u.cidade}${u.uf ? " - " + u.uf : ""}` : "Não informada"
  const link = linkHubSpot(negocioId)

  // WhatsApp pessoal
  const textoWA = `⚡ *Mensagem urgente*\nCaso ${caso}\n\n👤 ${nome}\n📍 ${cidade}\n⚖️ Área: ${area}\n📩 "${mensagem.slice(0, 200)}${mensagem.length > 200 ? "..." : ""}"\n\n🔗 ${link}`
  await enviarWhatsAppAdmin(textoWA)

  // E-mail
  await enviarEmailNotificacao({
    assunto: `⚡ Mensagem urgente: ${nome} (Caso ${caso})`,
    tituloCard: "⚡ Mensagem Urgente Recebida",
    linhas: [
      `<b>👤 Cliente:</b> ${nome}`,
      `<b>📍 Cidade:</b> ${cidade}`,
      `<b>⚖️ Área:</b> ${area}`,
      `<b>📄 Caso:</b> ${caso}`,
      `<b>📩 Mensagem:</b><br><div style="background:#fff8e1;border-left:3px solid #C9A84C;padding:10px 14px;margin-top:6px;font-style:italic;">${mensagem.replace(/\n/g, "<br>")}</div>`
    ],
    negocioId
  })

  // Notificar parceiro se área configurada
  const area_key = (area || "").toLowerCase().replace(/\s+/g, "_")
  const parceiro = PARCEIROS_AREA[area_key]
  if (parceiro?.whatsapp) await enviarWhatsAppAdmin_para(parceiro.whatsapp, textoWA)
}

async function notificarAgendamento(u, slot, duracao, negocioId) {
  const nome = u.nome || "Não informado"
  const caso = u.numeroCaso || "Não informado"
  const area = u.area || "Não informada"
  const cidade = u.cidade ? `${u.cidade}${u.uf ? " - " + u.uf : ""}` : "Não informada"
  const dataHora = slot ? formatarSlot(slot) : "Não informado"
  const duracaoLabel = duracao === 60 ? "1 hora" : `${duracao || 30} minutos`
  const link = linkHubSpot(negocioId)

  // WhatsApp pessoal
  const textoWA = `📅 *Consulta confirmada*\nCaso ${caso}\n\n👤 ${nome}\n📍 ${cidade}\n⚖️ Área: ${area}\n🕐 ${dataHora} (${duracaoLabel})\n\n🔗 ${link}`
  await enviarWhatsAppAdmin(textoWA)

  // E-mail
  await enviarEmailNotificacao({
    assunto: `📅 Agendamento: ${nome} (Caso ${caso})`,
    tituloCard: "📅 Consulta Agendada",
    linhas: [
      `<b>👤 Cliente:</b> ${nome}`,
      `<b>📍 Cidade:</b> ${cidade}`,
      `<b>⚖️ Área:</b> ${area}`,
      `<b>📄 Caso:</b> ${caso}`,
      `<b>🕐 Data/Hora:</b> ${dataHora}`,
      `<b>⏱️ Duração:</b> ${duracaoLabel}`
    ],
    negocioId
  })
}

const {
  VERIFY_TOKEN, WHATSAPP_TOKEN, PHONE_NUMBER_ID,
  HUBSPOT_TOKEN,
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN,
  DRIVE_PASTA_CLIENTES_ID,
  GROQ_KEY
} = process.env

const DATA_DIR = path.resolve(process.env.ORACULUM_DATA_DIR || path.join(__dirname, "data"))
const USERS_STATE_FILE = path.join(DATA_DIR, "users-state.json")
const communicationPreferences = createCommunicationPreferences({ dataDir: DATA_DIR, writeJsonAtomically: gravarJsonAtomico })

const HS_PIPELINE = "default"

// ================================================================
//  STATE (users, persistência)
// ================================================================

const monitor = { conversas: 0, cadastros: 0, erros: [], inicio: new Date() }
const DEBUG_LOGS = String(process.env.DEBUG_LOGS || "").toLowerCase() === "true"
configurarLogging({ monitor, DEBUG_LOGS })
const FALLBACK_PROCESSAMENTO_TEXTO = "Tive uma dificuldade para entender sua mensagem agora. Pode mandar de novo ou escrever em poucas palavras?"
const MESSAGE_DEDUPE_WINDOW_MS = 10 * 60 * 1000
const MESSAGE_DEDUPE_FALLBACK_WINDOW_MS = 15 * 1000

function sortearAtendente() {
  const atendentes = [
    "Helena",
    "Clara",
    "Beatriz",
    "Isabela",
    "Mariana"
  ]
  return atendentes[Math.floor(Math.random() * atendentes.length)]
}
configurarGroqClientReplies({
  sortearAtendente
})

function criarRespostaFallbackProcessamento() {
  return {
    texto: FALLBACK_PROCESSAMENTO_TEXTO,
    opcoes: null,
    registrarPergunta: false
  }
}

function obterBaseUrlPublica() {
  return sanitizarTextoEntrada(
    process.env.PUBLIC_BASE_URL ||
    process.env.APP_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    process.env.NGROK_URL ||
    ""
  ).replace(/\/+$/, "")
}

function montarUrlPublica(caminho) {
  const base = obterBaseUrlPublica()
  const pathUrl = `/${sanitizarTextoEntrada(caminho).replace(/^\/+/, "")}`
  if (!base) {
    console.warn(`[CONFIG] PUBLIC_BASE_URL/APP_URL/NGROK_URL ausente; URL relativa gerada: ${pathUrl}`)
    return pathUrl
  }
  return `${base}${pathUrl}`
}

function urlAudioAtendente(arquivo) {
  const ttlSeconds = Number(process.env.AUDIO_URL_TTL_SECONDS || 15 * 60)
  return montarUrlPublica(criarCaminhoAudioAssinado(arquivo, { ttlSeconds }))
}

function etapaValida(etapa) {
  if (!etapa) return false
  const e = String(etapa).toLowerCase().trim()
  return ETAPAS_VALIDAS.has(e)
}

const users = {}
const mensagensProcessadas = new Map()
const sessoesAdminWhatsApp = new Map()
// Fila por usuário — garante que mensagens simultâneas sejam processadas em ordem,
// sem perda de conteúdo quando o cliente envia várias mensagens rapidamente.
const filasMensagens = new Map()
const locksUsuarios = new Map()
const sessoesAdminAutenticadas = new Map()
const tentativasAdminWhatsApp = new Map()
const revisoesCasosAdmin = new Map()

function telefonePreferenciaComunicacao(u, from = "") {
  return normalizarNumeroWhatsAppEnvio(u?.whatsappContato || u?._numero || from)
}

function obterPreferenciaComunicacao(u, from = "") {
  const phoneNormalized = telefonePreferenciaComunicacao(u, from)
  const record = communicationPreferences.resolve({
    contactId: u?.contatoId,
    phoneNormalized,
    snapshotPreference: u?.communicationPreference,
    modoTexto: u?.modoTexto
  })
  applyPreferenceToUser(u, record)
  return record
}

function promoverPreferenciaComunicacao(u, from = "") {
  const record = communicationPreferences.promote({ contactId: u?.contatoId, phoneNormalized: telefonePreferenciaComunicacao(u, from) })
  if (record) applyPreferenceToUser(u, record)
  return record
}

function definirPreferenciaComunicacao(u, from, preference, source) {
  const record = communicationPreferences.set({
    preference, source, contactId: u.contatoId, phoneNormalized: telefonePreferenciaComunicacao(u, from)
  })
  for (const [numero, usuario] of Object.entries(users)) {
    if (String(usuario?.contatoId || "") === String(u.contatoId)) applyPreferenceToUser(usuario, record)
  }
  applyPreferenceToUser(u, record)
  agendarPersistenciaUsers()
  return record
}

function rotuloPreferenciaComunicacao(record) {
  if (record?.preference === "texto") return "📝 Comunicação por texto"
  if (record?.preference === "audio_sempre") return "🔊 Comunicação sempre por áudio"
  return "❓ Comunicação não definida"
}

// Cache curto do resumo operacional para reduzir chamadas ao HubSpot
const cacheResumoOperacional = {
  dados: null,
  timestamp: 0,
  TTL: 20000 // 20 segundos
}

function invalidarCacheResumoOperacional() {
  cacheResumoOperacional.dados = null
  cacheResumoOperacional.timestamp = 0
}

async function executarComLockUsuario(from, tarefa) {
  const chave = normalizarNumeroWhatsAppEnvio(from) || sanitizarTextoEntrada(from)
  if (!chave) return tarefa()

  const anterior = locksUsuarios.get(chave) || Promise.resolve()
  let liberar
  const atual = new Promise(resolve => { liberar = resolve })
  locksUsuarios.set(chave, atual)

  await anterior.catch(() => {})
  try {
    return await tarefa()
  } finally {
    liberar()
    if (locksUsuarios.get(chave) === atual) {
      locksUsuarios.delete(chave)
    }
  }
}
configurarAdminAuth({
  WHATSAPP_ADMIN,
  sessoesAdminWhatsApp,
  sessoesAdminAutenticadas,
  tentativasAdminWhatsApp,
  normalizarNumeroWhatsAppEnvio
})

function criarChaveMensagemDuplicada(from, text, msgObj = null) {
  const numero = sanitizarTextoEntrada(from) || "-"
  const tipo = sanitizarTextoEntrada(msgObj?.type || "text").toLowerCase() || "text"
  const texto = sanitizarTextoEntrada(text).toLowerCase() || "-"
  const timestamp = sanitizarTextoEntrada(msgObj?.timestamp)
  const janela = timestamp || String(Math.floor(Date.now() / MESSAGE_DEDUPE_FALLBACK_WINDOW_MS))
  return `fallback:${numero}:${tipo}:${texto}:${janela}`
}

function mensagemJaProcessada(messageId, fallbackKey = "") {
  const agora = Date.now()
  for (const [id, ts] of mensagensProcessadas.entries()) {
    if (agora - ts > MESSAGE_DEDUPE_WINDOW_MS) mensagensProcessadas.delete(id)
  }

  const id = sanitizarTextoEntrada(messageId)
  const fallback = sanitizarTextoEntrada(fallbackKey)
  const chave = id || fallback
  if (!chave) return false
  if (mensagensProcessadas.has(chave)) return true

  mensagensProcessadas.set(chave, agora)
  return false
}

function novoUsuario(nomeWA) {
  return {
    stage: "acolhimento", etapa: STAGES.AUDIO_AGUARDANDO, nomeWA,
    nomePerfilWhatsApp: nomeWA || "Cliente",
    origemCaptacao: "whatsapp",
    nome: null, regiao: null, cidade: null, uf: null,
    area: null, tipo: null, situacao: null, subTipo: null, detalhe: null,
    _docKey: null,
    urgencia: "normal", semReceber: false,
    contribuicao: null, recebeBeneficio: null, descricao: null,
    whatsappVerificado: false, telefoneEhDoCliente: null, whatsappContato: null,
    atendimentoParaTerceiro: false, relacaoComAtendido: null, papelContato: null,
    _nomeTitularPendente: null, _nomeTitularOrigem: null,
    nomeConfirmado: false,
    nomeHubspot: null,
    contatoId: null, negocioId: null, numeroCaso: null,
    pastaDriveId: null, pastaDriveLink: null,
    consultaStatus: "sem_consulta",
    tipoConsulta: "inicial",
    contextoConversa: null,
    score: 0, documentosEnviados: false,
    docsEntregues: [], docsAusentes: [], docsPulados: [], docsParciais: [], docsDispensados: [],
    docAtualIdx: 0, ultimoArqId: null, ultimoArqNome: null,
    corrigirCampo: null, historiaIA: [],
    lastPergunta: null, lastPerguntaPayload: null,
    leadIncompletoCapturado: false,
    audiosDescCorrigidos: [],
    assuntoResumo: null,
    _ofereceuExplicarTudo: false,
    _sugestaoFluxo: null,
    _hubspotSyncSnapshot: null,
    _hubspotConsultadoEm: null,
    _hubspotResultadoId: null,
    _proximoStageAposDescricao: null,
    _proximaPerguntaAposDescricao: null,
    _entradaPendenteTipo: null, _entradaPendenteValor: null, _entradaPendenteOrigem: null,
    _canonicalPlanHash: null,
    _canonicalPlanStatus: null,
    _canonicalCheckpoints: {},
    atendente: null,
    aguardandoRetomada: false,
    temCadastroCompleto: false,
    jaOfereceuRetomada: false,
    jaIncentivouDescricao: false,
    _retomadaEhLeadFrio: false,
    _stageRetomadaOriginal: null,
    _negocioStageIdPendente: null,
    _fluxoEncerrado: false,
    _descOrigemStage: null,
    _audioFluxoTexto: null, _audioFluxoAcao: null, _audioFluxoResposta: null,
    _urgenteAudioBuffer: null, _urgenteAudioMime: null, _urgenteAudioNome: null, _urgenteAudioTexto: null,
    _retornarParaConfirmacao: false,
    _origemConfirmacao: null,
    _correcaoPendenteCampo: null,
    _correcaoPendenteValor: null,
    _correcaoPendenteExtra: null,
    _correcaoPendenteSubcampo: null,
    _historicoDescricao: [],
    _resumoDescricaoIA: null,
    _resumoDescricaoIABase: null,
    _casoAnteriorCliente: null,
    _casoRecemAberto: false,
    _contextoDocsCasoAtual: null,
    processing: false,
    modoDigitando: false,
    modoTexto: false,
    communicationPreference: null,
    aguardandoResposta: false,
    _jaEsclareceuRelato: false,
    _jaAcolheuSofrimento: false,
    timer: null, timerIncentivoDescricao: null, ultimaMsg: Date.now()
  }
}

function nomeValidoParaExibicao(valor) {
  const nome = sanitizarTextoEntrada(valor)
  return nome && nome.toLowerCase() !== "cliente" ? nome : ""
}

function resolverNomeBaseWhatsApp(nomeWA, sessaoAtual = null) {
  return nomeValidoParaExibicao(nomeWA) ||
    nomeValidoParaExibicao(sessaoAtual?.nomeWA) ||
    nomeValidoParaExibicao(sessaoAtual?.nomePerfilWhatsApp) ||
    "Cliente"
}

function resolverNomeBriefing(u = {}) {
  const resultado = resolverNomeUnificado({
    contato: null,
    u: {
      nomeConfirmado: u.nomeConfirmado,
      nome: u.nome,
      nomeHubspot: u.nomeHubspot,
      nomeWA: u.nomeWA,
      nomePerfilWhatsApp: u.nomePerfilWhatsApp
    },
    nomePerfilWhatsApp: u.nomePerfilWhatsApp
  })
  return resultado.nome
}

async function resolverUsuarioPorHubSpot(from, nomeWA) {
  const telefone = telefoneCanonico(from) || from
  from = telefone
  const sessaoAtual = users[from] || null
  let u = null
  
  // Validar nome do perfil WhatsApp
  const { valido: perfilValido, nome: perfilSanitizado } = (typeof validarNomePerfilWhatsApp === "function")
    ? validarNomePerfilWhatsApp(nomeWA)
    : { valido: false, nome: "" }
  const nomePerfilWhatsApp = perfilSanitizado || nomeValidoParaExibicao(sessaoAtual?.nomePerfilWhatsApp) || "Cliente"
  const nomeBase = resolverNomeBaseWhatsApp(nomeWA, sessaoAtual)
  
  // Verificar se já consultou HubSpot recentemente (TTL 5 minutos)
  const jaConsultouHubSpot = sessaoAtual?._hubspotConsultadoEm &&
    (Date.now() - sessaoAtual._hubspotConsultadoEm < 5 * 60 * 1000)
  
  let contato = null
  
  // Só consultar HubSpot se não consultou recentemente
  if (!jaConsultouHubSpot) {
    const resultadoBusca = await hsBuscarContatoSeguro(from)
    if (resultadoBusca.status === "error" || resultadoBusca.status === "timeout") {
      throw Object.assign(new Error("HUBSPOT_CONTACT_LOOKUP_UNCERTAIN"), { code: "HUBSPOT_CONTACT_LOOKUP_UNCERTAIN" })
    }
    contato = resultadoBusca.contato
    if (sessaoAtual) {
      sessaoAtual._hubspotConsultadoEm = Date.now()
      sessaoAtual._hubspotResultadoId = contato?.id || null
    }
  } else if (sessaoAtual?._hubspotResultadoId) {
    // Reutilizar resultado da consulta anterior
    contato = { id: sessaoAtual._hubspotResultadoId }
  }
  
  const podeReutilizarSessaoLocalSemHubSpot = Boolean(
    !contato?.id &&
    sessaoAtual &&
    sessaoAtual._hubspotSemContato &&
    !sessaoAtual.contatoId &&
    !sessaoAtual.negocioId &&
    !sessaoAtual.numeroCaso
  )

  if (contato?.id) {
    if (!sessaoAtual) {
      users[from] = novoUsuario(nomeBase)
      monitor.conversas++
    }
    u = users[from]
    u._hubspotSemContato = false
    u._hubspotConsultadoEm = Date.now()
    u._hubspotResultadoId = contato.id
    
    // Salvar nome completo do HubSpot
    const nomeHubspotCompleto = montarNomeCompletoHubSpot(contato)
    u.nomeHubspot = nomeHubspotCompleto || u.nomeHubspot || null
    
    // Se não tiver nome confirmado, usar nome do HubSpot
    if (!u.nomeConfirmado && nomeHubspotCompleto) {
      u.nome = nomeHubspotCompleto
    }

    // Restaurar contactId
    definirContatoId(u, contato.id)

    // Buscar negócios associados ao contato para localizar caso existente
    const negociosHubSpot = await hsBuscarNegociosComCasoDoContato(contato.id)
    if (negociosHubSpot) {
      const casosComNumeroCaso = negociosHubSpot.casosOficiais
      // Se houver exatamente um caso oficial, restaurar o negócio
      if (casosComNumeroCaso.length === 1) {
        const negocio = casosComNumeroCaso[0]
        restaurarEstadoNegocioHubSpot(u, negocio.negocio || negocio)
        definirNegocioId(u, negocio.id)
      }
      // Se houver múltiplos casos oficiais, reconhecer como cliente e armazenar a lista
      if (casosComNumeroCaso.length > 1) {
        u._casosDisponiveis = casosComNumeroCaso.map(c => ({ id: c.id, numeroCaso: c.numeroCaso, area: c.properties?.area_juridica, dealname: c.properties?.dealname || null }))
      }
    }
  } else if (podeReutilizarSessaoLocalSemHubSpot) {
    u = sessaoAtual
  } else {
    if (sessaoAtual) {
      limparTimer(sessaoAtual)
      limparTimerIncentivoDescricao(sessaoAtual)
    } else {
      monitor.conversas++
    }
    u = novoUsuario(nomeBase)
    users[from] = u
    u._hubspotSemContato = true
    u._hubspotConsultadoEm = Date.now()
    u._hubspotResultadoId = null
  }

  if (!u._numero && telefone) u._numero = telefone
  u.nomeWA = nomeBase
  u.nomePerfilWhatsApp = nomePerfilWhatsApp
  
  if (!contato?.id) {
    if (!u.nomeConfirmado) {
      u.nome = null
      u.nomeHubspot = null
    }
    u.nomeConfirmado = u.nomeConfirmado || false
    u._hubspotSemContato = true
  } else {
    u._hubspotSemContato = false
    u.whatsappContato = telefone
  }
  
  u._numero = telefone
  agendarPersistenciaUsers()

  return { contato, u }
}

function salvarEtapa(numero, etapa) {
  const u = users[numero]
  if (!u) return STAGES.AUDIO_AGUARDANDO

const etapaNormalizada = String(etapa).toLowerCase().trim()

if (!etapaValida(etapaNormalizada)) {
  logErro("estado", `Tentativa de salvar etapa invalida para ${numero}: ${etapaNormalizada}`)
  return obterEtapaSegura(numero)
}

u.etapa = etapaNormalizada
  logDebug("📍 Salvando etapa:", u.etapa)
  return u.etapa
}

function obterEtapaSegura(numero) {
  const u = users[numero]
  const etapaAtual = u?.etapa
  if (etapaValida(etapaAtual)) return etapaAtual
  logDebug(`⚠️ Fallback de etapa para relato livre: ${numero} (${etapaAtual || "vazia"})`)
  if (u) u.etapa = STAGES.AUDIO_AGUARDANDO
  return STAGES.AUDIO_AGUARDANDO
}

function podeRetomar(numero) {
  return !users[numero]?.aguardandoResposta
}

// Formata texto livre para o CRM: Title Case + sem acentos

function setStage(u, newStage) {
  const stageAtual = normalizarStageKey(u?.stage)
  const stageNormalizado = normalizarStageKey(newStage)

  if (!STAGE_VALUES.has(stageNormalizado)) {
    logErro("STAGE_INVALIDO", "stage inválido detectado")
    logContextoExecucao({
      from: u?._numero,
      stage: stageAtual || "-",
      flow: "setStage",
      msg: stageNormalizado || sanitizarTextoEntrada(newStage) || "-"
    })
    return u?.stage
  }

  if (stageNormalizado === STAGES.CLIENTE && !u?.numeroCaso) {
    logDebug("[BLOCK] acesso indevido ao menu cliente sem numeroCaso")
    Reflect.set(u, "stage", STAGES.AUDIO_AGUARDANDO)
    void atualizarDealstage(u)
    return u.stage
  }

  logDebug(`[TRANSITION] ${stageAtual || "-"} -> ${stageNormalizado} | USER: ${u?._numero || "-"}`)
  Reflect.set(u, "stage", stageNormalizado)
  void atualizarDealstage(u)
  return u.stage
}

// ================================================================
//  STAGES
// ================================================================

const STAGES = {
  INICIO: "inicio",
  // Novo fluxo humanizado
  ACOLHIMENTO: "acolhimento",
  ESCOLHA_CANAL: "escolha_canal",
  AUDIO_OPCOES: "audio_opcoes",
  AUDIO_AGUARDANDO: "audio_aguardando",
  AUDIO_PROCESSANDO: "audio_processando",
  AUDIO_CONFIRMAR_TRANSCRICAO: "audio_confirmar_transcricao",
  AUDIO_CONFIRMAR_AREA: "audio_confirmar_area",
  AUDIO_CONFIRMAR_AREA_CANAL: "audio_confirmar_area_canal",
  AUDIO_CONFIRMAR_DADOS: "audio_confirmar_dados",
  ACOLHIMENTO_MODO: "acolhimento_modo",
  ACOLHIMENTO_PARA_QUEM: "acolhimento_para_quem",
  ACOLHIMENTO_NOME_CONTATO: "acolhimento_nome_contato",
  ACOLHIMENTO_CONFIRMA_NOME_CONTATO: "acolhimento_confirma_nome_contato",
  ACOLHIMENTO_NOME: "acolhimento_nome",
  ACOLHIMENTO_CONFIRMA_NOME: "acolhimento_confirma_nome",
  ACOLHIMENTO_CONFIRMA_TITULAR_NOME: "acolhimento_confirma_titular_nome",
  ACOLHIMENTO_CONFIRMA_WHATSAPP: "acolhimento_confirma_whatsapp",
  ACOLHIMENTO_CONFIRMA_WHATSAPP_OUTRO: "acolhimento_confirma_whatsapp_outro",
  ACOLHIMENTO_CIDADE: "acolhimento_cidade",
  ACOLHIMENTO_CEP: "acolhimento_cep",
  ESCOLHA_AREA: "escolha_area",
  ENTENDIMENTO_INICIAL: "entendimento_inicial",
  DIRECIONAMENTO: "direcionamento",
  // Fim novo fluxo
  AREA: "area",
  NOME: "nome",
  CIDADE: "cidade",
  DESCRICAO_CASO: "descricao_caso",
  DOCUMENTOS: "documentos",
  CLIENTE: "cliente",
  AGUARDANDO_URGENTE: "aguardando_urgente",
  URGENTE_AUDIO_CONFIRMA: "urgente_audio_confirma",
  URGENTE_AUDIO_ERRO_TRANSCRICAO: "urgente_audio_erro_transcricao",
  COLETA_DESC: "coleta_desc",
  COLETA_DESC_AUDIO: "coleta_desc_audio",
  DESC_CONFIRMA: "desc_confirma",
  DESC_ERRO_TRANSCRICAO: "desc_erro_transcricao",
  SUGESTAO_FLUXO_OUTRO: "sugestao_fluxo_outro",
  EXPLICAR_TUDO_OFERTA: "explicar_tudo_oferta",
  AGENDAMENTO_HORARIO: "agendamento_horario",
  AGENDAMENTO_DURACAO: "agendamento_duracao",
  AGENDAMENTO_CONFIRMAR: "agendamento_confirmar",
  AUDIO_FLUXO_CONFIRMA: "audio_fluxo_confirma",
  CONFIRMAR_ENTRADA: "confirmar_entrada",
  CONFIRMACAO: "confirmacao",
  MENU_CORRECAO: "menu_correcao",
  CORRIGIR_VALOR: "corrigir_valor",
  CORRIGIR_UF: "corrigir_uf",
  CORRIGIR_SEL: "corrigir_sel",
  CONFIRMAR_CORRECAO: "confirmar_correcao",
  INICIO_RETORNO: "inicio_retorno",
  NOVO_CASO_CONFIRMA: "novo_caso_confirma",
  RETOMADA_AUTOMATICA: "retomada_automatica",
  RETOMADA_MENU: "retomada_menu",
  RESUMO_ATENDIMENTO: "resumo_atendimento",
  RESUMO_RETOMADA: "resumo_retomada",
  COLETA_NOME: "coleta_nome",
  COLETA_REGIAO: "coleta_regiao",
  COLETA_UF: "coleta_uf",
  COLETA_CIDADE: "coleta_cidade",
  COLETA_CIDADE_REGIAO: "coleta_cidade_regiao",
  COLETA_CONTRIB: "coleta_contrib",
  COLETA_CONTRIB_REGIAO: "coleta_contrib_regiao",
  COLETA_CONTRIB_REGIAO_V2: "coleta_contrib_regiao_v2",
  COLETA_BENEF: "coleta_benef",
  COLETA_BENEF_REGIAO_V2: "__coleta_benef_regiao_v2__",
  COLETA_NOME_LEGADO: "__coleta_nome_legado__",
  COLETA_CIDADE_LEGADO: "__coleta_cidade_legado__",
  COLETA_REGIAO_LEGADO: "__coleta_regiao_legado__",
  COLETA_UF_LEGADO: "__coleta_uf_legado__",
  COLETA_VERIF_TEL: "coleta_verif_tel",
  COLETA_TEL_OUTRO: "coleta_tel_outro",
  COLETA_TEL_WPP: "coleta_tel_wpp",
  COLETA_TEL_WPP_CONTATO: "coleta_tel_wpp_contato",
  COLETA_TEL_WPP_CONFIRMA: "coleta_tel_wpp_confirma",
  GATILHO: "gatilho",
  URGENCIA: "urgencia",
  INSS_MENU: "inss_menu",
  INSS_NOVO: "inss_novo",
  INSS_NEG_TIPO: "inss_neg_tipo",
  INSS_CORT_TIPO: "inss_cort_tipo",
  INSS_APOS: "inss_apos",
  INSS_BPC: "inss_bpc",
  INSS_INC: "inss_inc",
  INSS_DEP: "inss_dep",
  INSS_OUT: "inss_out",
  INSS_JA: "inss_ja",
  INSS_NEG_QUANDO: "inss_neg_quando",
  INSS_CORT_MOT: "inss_cort_mot",
  INSS_CORT_REC: "inss_cort_rec",
  INSS_CORT_QDO: "inss_cort_qdo",
  TRAB_MENU: "trab_menu",
  TRAB_DEM_TIPO: "trab_dem_tipo",
  TRAB_DEM_VERB: "trab_dem_verb",
  TRAB_DEM_QDO: "trab_dem_qdo",
  TRAB_DIR_TIPO: "trab_dir_tipo",
  TRAB_DIR_PEND: "trab_dir_pend",
  TRAB_ACID_AF: "trab_acid_af",
  TRAB_ASS_S: "trab_ass_s",
  TRAB_ASS_PROV: "trab_ass_prov",
  TRAB_OUT_DESC: "trab_out_desc",
  OUTROS_MENU: "outros_menu",
  OUT_CONS_TIPO: "out_cons_tipo",
  OUT_REV_TIPO: "out_rev_tipo",
  OUT_DESC: "out_desc",
  ASSESSORIA_INICIAL: "assessoria_inicial",
  CORRIGIR_DADOS: "corrigir_dados",
  // Mini-stages de edição com retorno automático para confirmação
  EDITAR_NOME: "editar_nome",
  EDITAR_CIDADE: "editar_cidade",
  EDITAR_AREA: "editar_area",
  EDITAR_SITUACAO: "editar_situacao",
  EDITAR_DETALHE: "editar_detalhe",
  EDITAR_URGENCIA: "editar_urgencia",
  EDITAR_DESCRICAO: "editar_descricao",
  CONFIRMAR_CORRECAO_NOME: "confirmar_correcao_nome",
  CONFIRMAR_CORRECAO_CIDADE: "confirmar_correcao_cidade",
  // Revalidação progressiva após Recomeçar
  REVALIDA_NOME: "revalida_nome",
  REVALIDA_CIDADE: "revalida_cidade",
  REVALIDA_WHATSAPP: "revalida_whatsapp"
}

const STAGE_VALUES = new Set(Object.values(STAGES).map(normalizarStageKey))
const ETAPAS_NAO_RETOMAVEIS = new Set([
  STAGES.INICIO,
  STAGES.CLIENTE,
  STAGES.RETOMADA_AUTOMATICA,
  STAGES.RETOMADA_MENU,
  STAGES.RESUMO_ATENDIMENTO,
  STAGES.RESUMO_RETOMADA,
  STAGES.INICIO_RETORNO
].map(normalizarStageKey))
const ETAPAS_VALIDAS = new Set([...STAGE_VALUES].filter(stage => !ETAPAS_NAO_RETOMAVEIS.has(stage)))
configurarStatePersistence({
  DATA_DIR,
  USERS_STATE_FILE,
  users,
  monitor,
  novoUsuario,
  gerarBriefingCaso,
  podeMostrarMenuCliente,
  etapaValida,
  STAGES
})

// ================================================================
//  NOVO FLUXO HUMANIZADO - FUNÇÕES AUXILIARES
// ================================================================

async function telaConfirmarTranscricao(from, u, transcricao, area) {
  const preview = String(transcricao || "").trim()
  const previewExibir = preview.slice(0, 360) + (preview.length > 360 ? "..." : "")

  if (deveEnviarAudioAutomatico(u, from)) {
    try {
      const ogg = await gerarAudioAtendente(u?.atendente,
        `Recebi seu áudio. Ouvi o seguinte: "${preview.slice(0, 200)}${preview.length > 200 ? "..." : ""}". Está correto? Se estiver, toque em Confirmar envio. Se não estiver, toque em Enviar novo áudio ou em Corrigir digitando.`)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 4000))
    } catch (e) { logErro("tts", "Falha áudio confirmar transcrição", e) }
  }

  return {
    texto: `🎙️ *Recebi seu áudio!*\n\nIsto é o que entendi:\n\n_"${previewExibir}"_\n\nO que deseja fazer?`,
    opcoes: [
      { id: "audio_transcricao_ok", title: "✅ Confirmar envio" },
      { id: "audio_transcricao_novo", title: "🔁 Enviar novo áudio" },
      { id: "audio_transcricao_texto", title: "✍️ Corrigir digitando" }
    ]
  }
}

async function telaConfirmarArea(from, u, area) {
  if (deveEnviarAudioAutomatico(u, from)) {
    try {
      const ogg = await gerarAudioAtendente(u?.atendente,
        `Identifiquei que seu caso é sobre ${area}. Você tem duas opções. Primeira: Sim, está certo. Segunda: Explicar melhor a situação, se a área parecer errada.`)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 4000))
    } catch (e) { logErro("tts", "Falha áudio confirmar área", e) }
  }

  return {
    texto: `⚖️ Identifiquei que seu caso é sobre *${area || "Outros"}*.\n\nEstá correto?`,
    opcoes: [
      { id: "audio_area_sim", title: "✅ Sim, está certo" },
      { id: "audio_area_nao", title: "✏️ Explicar melhor" }
    ]
  }
}

async function telaConfirmarAreaAudio(from, u, origemTexto = false) {
  if (deveEnviarAudioAutomatico(u, from)) {
    try {
      const textoAudio = origemTexto
        ? `Identifiquei que seu caso é sobre ${u.area || "Outros"}. Está correto? Primeira opção: Sim, está certo. Segunda opção: Explicar melhor a situação. Terceira opção: Corrigir o texto.`
        : `Identifiquei que seu caso é sobre ${u.area || "Outros"}. Está correto? Primeira opção: Sim, está certo. Segunda opção: Explicar melhor a situação.`
      const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 4000))
    } catch (e) { logErro("tts", "Falha áudio confirmar área audio", e) }
  }

  const opcoes = origemTexto
    ? [
        { id: "audio_area_canal_sim", title: "✅ Sim, está certo" },
        { id: "audio_area_canal_nao", title: "✏️ Explicar melhor" },
        { id: "audio_transcricao_texto", title: "✏️ Corrigir texto" }
      ]
    : [
        { id: "audio_area_canal_sim", title: "✅ Sim, está certo" },
        { id: "audio_area_canal_nao", title: "✏️ Explicar melhor" }
      ]

  return {
    texto: `⚖️ Identifiquei que seu caso é sobre *${u.area || "Outros"}*.\n\nEstá correto?`,
    opcoes
  }
}

async function telaConfirmarDadosAudio(from, u, opcoesAudio = {}) {
  // No fluxo de terceiro, quem está no WhatsApp é nomeContato (ex: José),
  // não a pessoa atendida (u.nome = Alberina).
  const primeiroNome = u.atendimentoParaTerceiro && u.nomeContato
    ? u.nomeContato.split(" ")[0]
    : primeiroNomeCliente(u) || "você"
  const primeiroNomeAtendido = u.atendimentoParaTerceiro && u.nome
    ? u.nome.split(" ")[0]
    : null
  const urgenciaLabel = { alta: "Alta 🔴", normal: "Moderada 🟡", baixa: "Baixa 🟢" }
  const urgenciaVoz   = { alta: "alta", normal: "moderada", baixa: "baixa" }

  // Só envia áudio se o usuário NÃO está no modo texto
  if (!u.modoTexto) {
    try {
      const situacaoVoz = formatarSituacaoJuridica(u.situacao, u.tipo, u.subTipo)
      const detalheVoz  = formatarDetalheJuridico(u.detalhe, u.assuntoResumo, u.descricao || u._audioCanalTranscricao || u._resumoDescricaoIA)
      const cidadeVoz   = u.cidade && u.uf
        ? `${u.cidade}, ${estadoPorExtenso(u.uf) || u.uf}`
        : u.cidade || "não informada"
      const areaVoz = u.area || "não identificada"
      const urgVoz  = urgenciaVoz[u.urgencia] || "moderada"
      const whatsappVoz = formatarTelefoneAudio(u.whatsappContato || from || "")
      const briefingVoz = gerarBriefingCaso(u)
      const proximaEtapaVoz = proximaEtapaConfirmacao(u, briefingVoz)

      const _comSofrimento = u._jaAcolheuSofrimento === true
      let textoAudio = _comSofrimento
        ? `${primeiroNome ? primeiroNome + ", " : ""}vou confirmar os dados registrados. `
        : primeiroNomeAtendido
          ? `${primeiroNome}, vou confirmar os dados de ${primeiroNomeAtendido} com você. `
          : `${primeiroNome}, vou confirmar seus dados com você. `
      textoAudio += _comSofrimento
        ? `O caso envolve ${areaVoz}, com urgência ${urgVoz}. `
        : `Entendi que o caso envolve ${areaVoz}, com urgência ${urgVoz}. Depois da confirmação, ${proximaEtapaVoz}. `
      textoAudio += `Nome: ${u.nome || "não informado"}. `
      textoAudio += `WhatsApp: ${whatsappVoz}. `
      textoAudio += `Cidade: ${cidadeVoz}. `
      textoAudio += `Área jurídica: ${areaVoz}. `
      if (situacaoVoz && situacaoVoz !== "Não informado") textoAudio += `Situação: ${situacaoVoz}. `
      if (detalheVoz  && detalheVoz  !== "Não informado") textoAudio += `Detalhe: ${detalheVoz}. `
      textoAudio += `Urgência: ${urgVoz}. `
      textoAudio += _comSofrimento
        ? `Confirme quando estiver pronto. Primeira opção: Confirmar. Segunda opção: Corrigir dados. Terceira opção: Voltar.`
        : `Tudo está correto? Primeira opção: Confirmar. Segunda opção: Corrigir dados. Terceira opção: Voltar.`
      const introducaoAudio = typeof opcoesAudio.introducaoAudio === "string"
        ? opcoesAudio.introducaoAudio.trim()
        : ""
      if (introducaoAudio) textoAudio = `${introducaoAudio} ${textoAudio}`

      const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
      await enviarAudio(from, urlAudioAtendente(ogg))
      // Delay proporcional ao tamanho do áudio (fluxo "para terceiro" tem texto mais longo
      // e 8s fixos não eram suficientes, fazendo a tela de confirmação atropelar o áudio).
      const delayAudio = Math.max(8000, textoAudio.length * 55)
      await new Promise(r => setTimeout(r, delayAudio))
    } catch (e) { logErro("tts", "Falha áudio confirmar dados", e) }
  }

  // Para terceiro: nome deve ser sempre o da pessoa atendida (u.nome), nunca do contato.
  // Se u.nome estiver vazio num fluxo de terceiro, sinaliza explicitamente para o usuário corrigir.
  const nome = u.atendimentoParaTerceiro
    ? (u.nome || "⚠️ não informado. Corrija antes de confirmar")
    : (u.nome || u.nomeContato || "Não informado")
  const whatsapp = formatarTelefoneExibicao(u.whatsappContato || from || "")
  // formato padronizado de cidade - "Cidade, UF"
  const cidade = u.cidade && u.uf ? `${u.cidade}, ${u.uf}` : u.cidade || "Não informada"
  const descPreview = await gerarResumoDescricaoConfirmacao(u)

  const situacaoFormatada = formatarSituacaoJuridica(u.situacao, u.tipo, u.subTipo)
  const detalheBase = u.detalhe || u.assuntoResumo || descPreview || u.descricao || u._audioCanalTranscricao
  const detalheFormatado  = formatarDetalheJuridico(detalheBase, null)

  // Tom sóbrio na tela quando sofrimento foi detectado
  const _camposTela = [
    `👤 *Nome:* ${nome}`,
    (u.atendimentoParaTerceiro && u.nomeContato) ? `👥 *Aberto por:* ${u.nomeContato}` : null,
    `📱 WhatsApp: *${whatsapp || "Não informado"}*`,
    `📍 *Cidade:* ${cidade}`,
    `⚖️ *Área:* ${u.area || "Não informada"}`,
    situacaoFormatada && situacaoFormatada !== "Não informado" ? `📌 *Situação:* ${situacaoFormatada}` : null,
    detalheFormatado  && detalheFormatado  !== "Não informado" ? `🔎 *Detalhe:* ${detalheFormatado}`  : null,
    `⚡ *Urgência:* ${urgenciaLabel[u.urgencia] || "Moderada 🟡"}`,
    descPreview && descPreview !== "Não informado" ? `💬 *Descrição:* ${descPreview}` : null,
  ].filter(Boolean).join("\n")
  const textoConfirmacao = u._jaAcolheuSofrimento
    ? `●●●●●● Etapa 6 de 6 · *Confirmação*\n\n*Confira seus dados:*\n\n${_camposTela}\n\nQuando confirmar, seu caso será registrado e nossa equipe será notificada.`
    : `●●●●●● ✅ Etapa 6 de 6 · *Confirmação*\n\n✅ *Confira seus dados antes de confirmar:*\n\n${_camposTela}\n\n*Ao confirmar, seu caso será registrado oficialmente e nossa equipe será notificada.*\n\nTudo está correto?`
  const opcoesConfirmacao = [
    { id: "audio_dados_confirmar", title: "✅ Confirmar" },
    { id: "audio_dados_corrigir", title: "✏️ Corrigir" },
    { id: "conf_menu", title: "⬅️ Voltar" }
  ]
  const imagemUrl = IMAGEM_CONFIRMACAO_URL
  try {
    const enviada = await enviarImagemWhatsApp(from, imagemUrl, textoConfirmacao, opcoesConfirmacao)
    if (enviada) return { texto: null, opcoes: null }
    return { texto: textoConfirmacao, opcoes: opcoesConfirmacao }
  } catch (e) {
    logErro("confirmacao", "Falha ao enviar imagem de confirmacao audio", e)
    return { texto: textoConfirmacao, opcoes: opcoesConfirmacao }
  }
}

async function enviarAudioPedidoCidade(from, atendente, opcoes = {}) {
  const { nomeTerceiro = null, introducaoAudio = "" } = opcoes
  if (!from || !atendente) return
  try {
    const pergunta = nomeTerceiro
      ? `Agora preciso saber onde ${nomeTerceiro} mora. Você pode enviar um CEP, digitar o nome da cidade, ou enviar um áudio falando o nome da cidade.`
      : `Agora preciso saber onde você mora. Você pode enviar um CEP, digitar o nome da sua cidade, ou enviar um áudio falando o nome da cidade.`
    const texto = [sanitizarTextoEntrada(introducaoAudio), pergunta].filter(Boolean).join(" ")
    const ogg = await gerarAudioAtendente(atendente, texto)
    await enviarAudio(from, urlAudioAtendente(ogg))
    ultimosAudiosEnviados.set(String(from), Date.now())
    await new Promise(r => setTimeout(r, 3000))
  } catch (e) { logErro("tts", "Falha áudio cidade", e) }
}

async function enviarAudioConfirmacaoLocalizacao(from, atendente, cidade, uf, regiao, origem = "cidade") {
  try {
    const estadoAudio = estadoPorExtenso(uf)
    const ogg = await gerarAudioAtendente(atendente,
      `Encontrei! ${cidade}, estado de ${estadoAudio}, região ${regiao}. Está correto? Se não estiver, me diga a cidade correta agora. Pode falar ou digitar.`)
    await enviarAudio(from, urlAudioAtendente(ogg))
    await new Promise(r => setTimeout(r, 4000))
  } catch (e) { logErro("tts", origem === "cep" ? "Falha áudio CEP" : "Falha áudio cidade", e) }
}

async function respostaAposCidade(from, u) {
  const primeiroNome = primeiroNomeCliente(u) || "você"
  if (u._audioCanalTranscricao || u.descricao) {
    setStage(u, STAGES.AUDIO_CONFIRMAR_DADOS)
    iniciarTimer(from)
    return await telaConfirmarDadosAudio(from, u)
  }

  setStage(u, STAGES.AUDIO_AGUARDANDO)
  iniciarTimer(from)

  const ehTerceiro = Boolean(u.atendimentoParaTerceiro || u._novoCasoParaTerceiro)
  const primeiroNomeAtendido = ehTerceiro && u.nome ? u.nome.split(" ")[0] : null

  const textoTela = primeiroNomeAtendido
    ? textoExplicarSituacaoTerceiro(primeiroNomeAtendido)
    : `●●●○○○ 📝 Etapa 3 de 6 · *Relato*\n\nAgora me conte sua situação com detalhes para eu preparar seu caso, *${primeiroNome}*.\n\n💬 Você pode responder por mensagem de texto ou, se preferir, enviar um áudio. 🎙️`

  if (!u.modoTexto) {
    try {
      const textoAudio = primeiroNomeAtendido
        ? audioExplicarSituacaoTerceiro(primeiroNomeAtendido)
        : `Agora me conte sua situação com detalhes para eu preparar seu caso, ${primeiroNome}. Pode enviar um áudio ou digitar.`
      const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 3000))
    } catch (e) { logErro("tts", "Falha áudio pedido relato", e) }
  }

  return { texto: textoTela, opcoes: null, semAudio: true }
}

// ================================================================
//  HELPERS
// ================================================================

function textoContextoTitularCaso(u = {}) {
  const partes = [
    u.descricao,
    u._audioCanalTranscricao,
    u.assuntoResumo,
    u._descTemp,
    u._resumoDescricaoIA
  ].filter(Boolean).join(" ")
  return normalizarTextoCRM(partes || "")
}

function detectarAmbiguidadeTitularNome(u = {}, texto = "") {
  const atual = detectarReferenciaTerceiro(texto)
  const previo = detectarReferenciaTerceiro(textoContextoTitularCaso(u))
  const ref = atual || previo
  if (!ref) return null

  const textoNorm = normalizarTextoGatilho(texto)
  const falaNomeDeTerceiro =
    /\b(nome (dela|dele|da minha|do meu)|ela se chama|ele se chama|chama ela|chama ele|o nome e|o nome é)\b/.test(textoNorm)

  return {
    relacao: ref.relacao,
    label: ref.label,
    origem: atual ? "mensagem_atual" : "contexto_do_relato",
    falaNomeDeTerceiro
  }
}

async function telaEscolhaModo(from, u, { comAudio = false, comBoasVindas = false } = {}) {
  // ○●○○○○ Etapa 1 de 6 — escolha do modo de comunicação.
  // Definida aqui, antes do relato, para que nenhum áudio seja enviado
  // a quem prefere texto e vice-versa.
  setStage(u, STAGES.ACOLHIMENTO_MODO)
  iniciarTimer(from)
  const tela = telaModoAtendimento({
    atendente: u.atendente,
    boasVindas: comBoasVindas,
    reapresentacao: comAudio
  })
  if (u.modoTexto !== true) {
    await enviarAudioModoVoz(from, u, gerarAudioDaTela(tela), "escolha modo atendimento")
  }
  if (IMAGEM_ASSESSORIA_INICIAL_URL) {
    const enviada = await enviarImagemWhatsApp(
      from,
      IMAGEM_ASSESSORIA_INICIAL_URL,
      tela.texto,
      gerarBotoesDaTela(tela)
    )
    if (enviada) return { texto: null, opcoes: null, semAudio: true }
  }
  tela.semAudio = true
  return tela
}

async function telaParaQuem(from, u) {
  // Pergunta universal: o atendimento é para o próprio contato ou para outra pessoa?
  // Dispara para todos os clientes novos — com ou sem detecção prévia de terceiro no relato.
  const relacao = u.relacaoComAtendido
  const mapaRelacao = {
    // chaves sem acento (valores antigos)
    mae: "sua mãe", pai: "seu pai", filho: "seu filho", filha: "sua filha",
    esposa: "sua esposa", esposo: "seu esposo", conjuge: "seu cônjuge",
    irmao: "seu irmão", irma: "sua irmã", avo: "seu avô/avó", terceiro: "outra pessoa",
    // chaves com acento (valores retornados por relacaoTerceiroPreAtendimento)
    "mãe": "sua mãe", "irmão": "seu irmão", "irmã": "sua irmã",
    "avó": "sua avó", "avô": "seu avô",
    amiga: "sua amiga", amigo: "seu amigo",
    tia: "sua tia", tio: "seu tio",
    sobrinha: "sua sobrinha", sobrinho: "seu sobrinho",
    neta: "sua neta", neto: "seu neto",
    vizinha: "sua vizinha", vizinho: "seu vizinho"
  }
  const labelRelacao = mapaRelacao[relacao] || null

  setStage(u, STAGES.ACOLHIMENTO_PARA_QUEM)
  iniciarTimer(from)

  // Texto e áudio adaptados: quando o relato mencionou alguém, personaliza; senão, genérico.
  const textoAudio = labelRelacao
    ? `Só uma pergunta rápida antes de começar. Você está aqui para cuidar do seu próprio caso, ou vai abrir um atendimento para ${labelRelacao}? Primeira opção: É para mim. Segunda opção: É para ${labelRelacao}.`
    : `Só uma pergunta rápida antes de começar. Você está aqui para cuidar do seu próprio caso, ou vai abrir um atendimento para outra pessoa, como um familiar ou amigo? Primeira opção: É para mim. Segunda opção: É para outra pessoa.`

  if (deveEnviarAudioAutomatico(u, from)) {
    try {
      const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 4000))
    } catch (e) { logErro("tts", "Falha áudio para_quem", e) }
  }

  const textoTela = labelRelacao
    ? `💬 *Só uma pergunta rápida antes de começar...*\n\nVocê está aqui para cuidar do seu próprio caso, ou quer abrir um atendimento para *${labelRelacao}*?`
    : `💬 *Só uma pergunta rápida antes de começar...*\n\nVocê está aqui para cuidar do seu próprio caso, ou quer abrir um atendimento para outra pessoa, um familiar ou amigo?`

  return {
    texto: textoTela,
    opcoes: [
      { id: "para_quem_eu", title: "🙋 É para mim" },
      { id: "para_quem_outro", title: labelRelacao ? `👤 É para ${labelRelacao}` : "👤 É para outra pessoa" }
    ]
  }
}

async function perguntarTitularNomePreCadastro(from, u, nomeLimpo, contexto = {}) {
  u._nomeTemp = nomeLimpo
  u._nomeTitularPendente = contexto
  setStage(u, STAGES.ACOLHIMENTO_CONFIRMA_TITULAR_NOME)
  iniciarTimer(from)

  const alvo = contexto?.label || "outra pessoa"
  const textoAudio = `Só para eu preencher corretamente: ${nomeLimpo} é o seu nome, ou é o nome da pessoa atendida, ${alvo}? Se o nome estiver errado, me diga o nome correto agora.`
  if (deveEnviarAudioAutomatico(u, from)) {
    try {
      const ogg = await gerarAudioAtendente(u.atendente, `Só para eu preencher corretamente: ${nomeLimpo} é o seu nome, ou é o nome da pessoa atendida, ${alvo}? Primeira opção: é meu nome. Segunda opção: é o nome da pessoa atendida. Se o nome estiver errado, me diga o nome correto agora.`)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 4000))
    } catch (e) { logErro("tts", "Falha áudio titular nome", e) }
  }

  return {
    texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ Entendi o nome *${nomeLimpo}*.\n\nComo você mencionou ${alvo}, preciso confirmar para não cadastrar errado:\n\nEsse é o seu nome ou o nome da pessoa atendida?\n\n_Se o nome estiver errado, é só me dizer o nome correto agora. 🎙️_`,
    opcoes: [
      { id: "nome_titular_contato", title: "🙋 Meu nome" },
      { id: "nome_titular_atendido", title: "👤 Pessoa atendida" }
    ]
  }
}

// Backwards-compatible wrapper for case number generation; implementation
// delegated to src/domain/case-number.js to avoid duplicated logic.
const { generateCandidate: _generateCandidate } = require("./src/domain/case-number")
function gerarCaso(area) {
  return _generateCandidate(area)
}

function gerarBriefingCaso(u = {}) {
  const statusDocs = calcularStatusDocumentos(u)
  const scoreBase = calcScore(u)
  const emocional = scoreEmocional(u)
  const relato = sanitizarTextoEntrada(u._resumoDescricaoIA || u.assuntoResumo || u.descricao || u._audioCanalTranscricao)
  const cidade = u.cidade ? `${u.cidade}${u.uf ? " - " + u.uf : ""}` : ""
  const stage = u.stage === STAGES.ACOLHIMENTO_MODO
    ? u.stage
    : u.negocioStageId || mapearStageParaDealstage(u) || u.stage || ""
  const proximaAcao = (() => {
    if (!u.numeroCaso) return "Concluir pre-atendimento e gerar caso."
    if (u.consultaStatus === "agendada") return "Acompanhar consulta agendada."
    if (statusDocs.faltantesCriticos.length > 0) return "Cobrar documentos faltantes."
    if (stage === HS_STAGE.ANALISE) return "Revisar analise juridica inicial."
    if (stage === HS_STAGE.PROTOCOLO) return "Acompanhar protocolo."
    if (stage === HS_STAGE.PROCESSO) return "Acompanhar andamento processual."
    if (stage === HS_STAGE.FINAL) return "Caso encerrado."
    return "Revisar caso no HubSpot."
  })()

  return {
    numeroCaso: u.numeroCaso || null,
    nome: resolverNomeBriefing(u),
    whatsapp: u._numero || u.whatsappContato || null,
    cidade: cidade || null,
    area: u.area || null,
    situacao: u.situacao || u.tipo || null,
    detalhe: u.detalhe || u.subTipo || null,
    urgencia: u.urgencia || "normal",
    stage,
    stageLabel: labelStageAdmin(stage),
    relato: relato || null,
    scoreOperacional: scoreBase,
    scoreEmocional: emocional,
    documentos: {
      total: statusDocs.total,
      recebidos: statusDocs.recebidos.length,
      faltantesCriticos: statusDocs.faltantesCriticos.map(doc => doc.label),
      pendentesFluxo: statusDocs.pendentesFluxo.map(doc => doc.label)
    },
    consultaAtiva: u.consultaStatus === "agendada",
    hubspot: u.negocioId ? linkHubSpot(u.negocioId) : null,
    drive: u.pastaDriveLink || null,
    proximaAcao
  }
}

function resumoCaso(u) {
  return [
    `👤 Nome: ${u.nome || "Não informado"}`,
    `📍 Cidade: ${u.cidade || "Não informada"}${u.uf ? " - " + u.uf : ""}`,
    `⚖️ Área: ${u.area || "Não informada"}`,
    u.tipo      ? `📌 Tipo: ${u.tipo}` : null,
    u.situacao  ? `📌 Situação: ${u.situacao}` : null,
    u.subTipo   ? `🔎 Detalhe: ${u.subTipo}` : null,
    u.detalhe   ? `ℹ️ Info: ${u.detalhe}` : null,
    `⚡ Urgência: ${{ alta: "Alta 🔴", normal: "Moderada 🟡", baixa: "Baixa 🟢" }[u.urgencia] || "Moderada 🟡"}`,
    `💼 Contribuiu ao INSS: ${u.contribuicao || "Não informado"}`,
    `🏥 Recebe benefício: ${u.recebeBeneficio || "Não informado"}`,
    u.descricao ? `💬 Descrição: ${u.descricao}` : null,
  ].filter(Boolean).join("\n")
}

function getHubSpotResumoCliente(u) {
  const briefing = gerarBriefingCaso(u)
  const emocional = scoreEmocional(u)
  const statusDocs = calcularStatusDocumentos(u)
  const faltantesCriticos = statusDocs.faltantesCriticos.length
  const docsTexto = faltantesCriticos > 0
    ? `${faltantesCriticos} documento${faltantesCriticos === 1 ? "" : "s"} faltante${faltantesCriticos === 1 ? "" : "s"}`
    : "Documentos completos"
  const proximaAcao = briefing.proximaAcao || "Revisar caso no HubSpot"
  const urgenciaLabel = { alta: "Alta", normal: "Moderada", baixa: "Baixa" }[u?.urgencia] || "Moderada"
  const stageLabel = briefing.stageLabel || labelStageAdmin(briefing.stage)
  return `Proxima acao: ${proximaAcao}; Stage: ${stageLabel}; Urgencia: ${urgenciaLabel}; Risco emocional: ${emocional.nivel}; ${docsTexto}`
}

function getHubSpotDescricaoCompleta(u) {
  const briefing = gerarBriefingCaso(u)
  const relatoLivre = normalizarTextoCRM(u.descricao || u._audioCanalTranscricao || "")
  const resumoIA = normalizarTextoCRM(u._resumoDescricaoIA || u.assuntoResumo || "")
  const documentosFaltantes = briefing.documentos.faltantesCriticos.length
    ? briefing.documentos.faltantesCriticos.join(", ")
    : "Nenhum documento critico pendente"
  const contato = briefing.whatsapp || u.whatsappContato || u._numero || ""
  const campos = [
    "Painel operacional:",
    `Proxima acao: ${briefing.proximaAcao}`,
    `Stage: ${briefing.stageLabel}`,
    `Urgencia: ${ { alta: "Alta", normal: "Moderada", baixa: "Baixa" }[u?.urgencia] || "Moderada" }`,
    `Risco emocional: ${briefing.scoreEmocional.nivel} (${briefing.scoreEmocional.valor}/10)`,
    `Documentos: ${briefing.documentos.recebidos}/${briefing.documentos.total || 0} recebidos; faltantes criticos: ${documentosFaltantes}`,
    `Status do cadastro: ${sanitizarTextoEntrada(u.statusCadastro) || "cadastro_inicial"}`,
    Array.isArray(u.faltantesCadastro) && u.faltantesCadastro.length ? `Pendencias do cadastro: ${u.faltantesCadastro.join(", ")}` : null,
    `Consulta ativa: ${briefing.consultaAtiva ? "sim" : "nao"}`,
    briefing.drive ? `Drive: ${briefing.drive}` : null,
    briefing.hubspot ? `HubSpot: ${briefing.hubspot}` : null,
    "",
    "Resumo juridico-operacional:",
    `Fatos: ${resumoFatosJuridico(u, briefing)}`,
    `Pedido do cliente: ${pedidoClienteJuridico(u, briefing)}`,
    `Risco/prazo: ${riscoPrazoJuridico(u, briefing)}`,
    `Documentos essenciais: ${documentosEssenciaisJuridico(briefing)}`,
    `Proxima acao sugerida: ${briefing.proximaAcao}`,
    "",
    relatoLivre ? `Relato livre:\n${relatoLivre}` : null,
    resumoIA && resumoIA !== relatoLivre ? `Resumo IA:\n${resumoIA}` : null,
    "Dados do caso:",
    briefing.numeroCaso ? `Caso: ${briefing.numeroCaso}` : null,
    briefing.nome ? `Cliente: ${briefing.nome}` : null,
    contato ? `WhatsApp: ${contato}` : null,
    briefing.area ? `Area: ${briefing.area}` : null,
    briefing.situacao ? `Situacao: ${briefing.situacao}` : null,
    briefing.detalhe ? `Detalhe: ${briefing.detalhe}` : null,
    briefing.cidade ? `Cidade: ${briefing.cidade}` : null,
    `Score operacional: ${briefing.scoreOperacional}`,
    `Documentos faltantes: ${documentosFaltantes}`
  ]
  return campos.filter(Boolean).join("\n")
}

function restaurarTipoCasoHubSpot(valor) {
  if (!valor || typeof valor !== "string") return {}

  const [area, tipo] = valor.split("_")

  const areaMap = {
    inss: "area_inss",
    trab: "area_trab",
    familia: "area_familia",
    consumidor: "area_consumidor",
    penal: "area_penal",
    civil: "area_civil",
    imovel: "area_imovel",
    outros: "area_outros",
  }

  return {
    area: areaMap[area] || null,
    tipo: tipo || null,
  }
}

function garantirNomenclaturaJuridicaUsuario(u = {}) {
  if (!u || typeof u !== "object") return null
  const model = resolveLegalCaseNomenclature({
    current: u.nomenclaturaJuridica,
    narrative: [u.descricao, u.assuntoResumo, u.detalhe, u.objetivo].filter(Boolean),
    usuario: u,
    classification: {
      area: u.area,
      tipo: u.tipo_de_caso || u.tipoCaso || u.tipo,
      subTipo: u.oraculum_case_subtype || u.subTipo || u.subtipo,
      situacao: u.situacao,
      objetivo: u.objetivo
    }
  })
  if (model.divergences?.length || (!model.area && !model.subtype)) return null
  applyLegalCaseNomenclatureToUser(u, model)
  return model
}

function getHubSpotDealStateProps(u) {
  garantirNomenclaturaJuridicaUsuario(u)
  const temperatura = getTemperaturaLeadHubSpot(u)
  const stageBot = normalizarStageKey(u?.stage)
  const etapaBot = (stageBot === STAGES.AUDIO_AGUARDANDO && !usuarioTemRelatoParaRetomada(u))
    ? ""
    : stageBot
  return filtrarPropsHubSpot({
    description: typeof u?.descricao === "string" ? normalizarTextoCRM(u.descricao) : u?.descricao,
    resumo_cliente: getHubSpotResumoCliente(u),
    descricao_completa: getHubSpotDescricaoCompleta(u),
    estado_bot_snapshot: serializarEstado(u),
    etapa_do_bot: etapaBot,
    tipo_de_caso: mapearTipoCaso(u) || u?.nomenclaturaJuridica?.type || "",
    oraculum_case_subtype: u?.nomenclaturaJuridica?.subtype || u?.oraculum_case_subtype || u?.subTipo || u?.subtipo || "",
    temperatura_lead: mapearTemperatura(temperatura),
    hs_priority: mapearPrioridade(temperatura),
    // urgencia normalizada e consistente
    urgencia: { alta: "Alta", normal: "Moderada", baixa: "Baixa" }[u?.urgencia] || "Moderada",
    area_juridica: u.area || "",
    cidade: u.cidade || "",
    pasta_drive: u.pastaDriveLink || "",
    origem_atendimento: sanitizarTextoEntrada(u?.origemCaptacao) || "whatsapp"
  })
}

function getHubSpotDealProps(u, extraProps = {}) {
  const props = filtrarPropsHubSpot({
    ...getHubSpotDealStateProps(u),
    ...extraProps
  })
  return aplicarTituloNegocioHubSpot(u, props, { HS_STAGE })
}

function mapearStageParaDealstage(u) {
  const stageAtual = normalizarStageKey(u?.stage)
  const stageRetomada = typeof obterStageRetomadaOriginal === "function" ? obterStageRetomadaOriginal(u) : null
  const stageBaseNormalizado = [STAGES.RETOMADA_AUTOMATICA, STAGES.RETOMADA_MENU, STAGES.RESUMO_ATENDIMENTO, STAGES.RESUMO_RETOMADA].includes(stageAtual)
    ? normalizarStageKey(stageRetomada)
    : stageAtual
  const stageBase = stageBaseNormalizado || ""

  // Proteção global — nunca regride de stage avançado independente do stageBase
  const stagesAvancados = [HS_STAGE.PROTOCOLO, HS_STAGE.PROCESSO, HS_STAGE.FINAL]
  if (stagesAvancados.includes(u?.negocioStageId)) return null

  if (stageBase === STAGES.CLIENTE || stageBase === STAGES.DOCUMENTOS) {
    const pendentes = getDocsPendentes(u)
    const statusDocs = calcularStatusDocumentos(u)
    if (u?.documentosEnviados === true && pendentes.length === 0 && statusDocs.faltantesCriticos.length === 0) return HS_STAGE.DOCS
    if (u?._docsClienteGuiado || u?.etapa === "documentos") return HS_STAGE.AGUARDANDO_DOCS
    if (u?.documentosEnviados === true) return HS_STAGE.AGUARDANDO_DOCS
    return HS_STAGE.ANALISE
  }
  if (stageBase === STAGES.COLETA_DESC_AUDIO || stageBase === STAGES.DESCRICAO_CASO) return HS_STAGE.ANALISE
  if (stageBase === STAGES.INICIO) return HS_STAGE.LEAD
  if (stageBase === STAGES.AREA || stageBase.includes("menu")) return HS_STAGE.CADASTRO
  if (stageBase.includes("coleta") || stageBase.includes("confirmar") || stageBase === STAGES.CONFIRMACAO) return HS_STAGE.CADASTRO

  return null
}

function getLabelOrigemCaptacao(u) {
  const origem = sanitizarTextoEntrada(u?.origemCaptacao).toLowerCase()
  if (origem === "instagram") return "Instagram"
  if (origem === "facebook") return "Facebook"
  if (origem === "site" || origem === "pagina_oficial" || origem === "pagina-oficial") return "Site"
  return "WPP"
}

function getNomeDeal(u) {
  return montarTituloNegocioHubSpot(u, { HS_STAGE })
}

configurarHubSpotCore({
  monitor,
  HS_STAGE,
  HS_PIPELINE,
  getNomeDeal,
  getHubSpotDealStateProps
})

function getNotaLead(u) {
  const temperatura = definirTemperatura(u)
  const stageAtual = sanitizarTextoEntrada(u?.stage) || "não informado"

  const simbolo = temperatura === "quente" ? "🟢" : temperatura === "morno" ? "🟡" : "⚪"
  const label   = temperatura === "quente" ? "QUENTE" : temperatura === "morno" ? "MORNO" : "FRIO"
  const interpretacao =
    temperatura === "quente"
      ? "Preencheu todos os dados e está pronto para contato imediato."
      : temperatura === "morno"
        ? "Informou nome e cidade. Precisa de abordagem para concluir."
        : "Entrou, mas não preencheu informações. Requer nurturing."

  return [
    "🤖 Lead gerado via bot",
    "",
    `${simbolo} Temperatura: ${label}`,
    `📍 Etapa do bot: ${stageAtual}`,
    u?.nome   ? `👤 Nome: ${u.nome}` : null,
    u?.cidade ? `📍 Cidade: ${u.cidade}${u.uf ? " - " + u.uf : ""}` : null,
    u?.area   ? `⚖️ Área: ${u.area}` : null,
    "",
    "🧠 Interpretação:",
    interpretacao
  ].filter(Boolean).join("\n")
}


function ehFinalizacaoCasoTerceiro(u) {
  // Fluxo clássico: cliente existente abre caso para outra pessoa
  const fluxoClassico = Boolean(
    u?._novoCasoParaTerceiro &&
    u?._casoAnteriorCliente &&
    u?.telefoneEhDoCliente === false &&
    normalizarNumeroWhatsAppEnvio(u?.whatsappContato)
  )
  // Fluxo novo: usuário novo que veio pelo ACOLHIMENTO_PARA_QUEM
  const fluxoNovo = Boolean(
    u?.atendimentoParaTerceiro &&
    !u?._casoAnteriorCliente &&
    u?.telefoneEhDoCliente === false &&
    normalizarNumeroWhatsAppEnvio(u?.whatsappContato)
  )
  return fluxoClassico || fluxoNovo
}

function telaVoltarConfirmacaoTerceiro(u, origem = "texto") {
  const nomeTerceiro = primeiroNomeCliente(u) || "a pessoa atendida"
  const confirmarId = origem === "audio" ? "terceiro_audio_conf_continuar" : "terceiro_conf_continuar"
  const corrigirId = origem === "audio" ? "audio_dados_corrigir" : "conf_corrigir"
  // Cenário D: cliente cadastrado abre caso para terceiro — tem menu próprio para voltar
  // Cenário B: novo cliente abre caso para terceiro — não tem menu, apenas cancela
  const temCasoAnterior = Boolean(u._casoAnteriorCliente)
  const cancelarTitle = temCasoAnterior ? "🏠 Meu menu" : "↩️ Cancelar atendimento"
  const textoTela = temCasoAnterior
    ? `⬅️ *Antes de voltar*\n\nEste atendimento é para *${nomeTerceiro}*.\n\nPara evitar misturar este caso com o seu atendimento original, escolha uma opção abaixo:`
    : `⬅️ *Atendimento para outra pessoa*\n\nVocê está abrindo um caso para *${nomeTerceiro}*.\n\nO que deseja fazer?`
  return {
    texto: textoTela,
    opcoes: [
      { id: confirmarId, title: "✅ Ver confirmação" },
      { id: corrigirId, title: "✏️ Corrigir dados" },
      { id: "terceiro_cancelar_menu", title: cancelarTitle }
    ]
  }
}

function criarSnapshotCasoCliente(u) {
  if (!u) return null
  return {
    numeroCaso: u.numeroCaso || null,
    negocioId: u.negocioId || null,
    contatoId: u.contatoId || null,
    negocioStageId: u.negocioStageId || null,
    pastaDriveId: u.pastaDriveId || null,
    pastaDriveLink: u.pastaDriveLink || null,
    nome: u.nome || null,
    nomeConfirmado: Boolean(u.nomeConfirmado),
    cidade: u.cidade || null,
    uf: u.uf || null,
    regiao: u.regiao || null,
    area: u.area || null,
    tipo: u.tipo || null,
    _docKey: u._docKey || null,
    situacao: u.situacao || null,
    subTipo: u.subTipo || null,
    detalhe: u.detalhe || null,
    urgencia: u.urgencia || "normal",
    semReceber: Boolean(u.semReceber),
    descricao: u.descricao || null,
    assuntoResumo: u.assuntoResumo || null,
    _audioCanalTranscricao: u._audioCanalTranscricao || null,
    whatsappVerificado: Boolean(u.whatsappVerificado),
    telefoneEhDoCliente: u.telefoneEhDoCliente ?? null,
    whatsappContato: u.whatsappContato || null,
    modoTexto: Boolean(u.modoTexto),
    docsEntregues: Array.isArray(u.docsEntregues) ? [...u.docsEntregues] : [],
    docsAusentes: Array.isArray(u.docsAusentes) ? [...u.docsAusentes] : [],
    docsPulados: Array.isArray(u.docsPulados) ? [...u.docsPulados] : [],
    docsParciais: Array.isArray(u.docsParciais) ? [...u.docsParciais] : [],
    docsDispensados: Array.isArray(u.docsDispensados) ? [...u.docsDispensados] : [],
    docAtualIdx: u.docAtualIdx || 0,
    documentosEnviados: Boolean(u.documentosEnviados),
    ultimoArqId: u.ultimoArqId || null,
    ultimoArqNome: u.ultimoArqNome || null
  }
}

function restaurarCasoAnteriorCliente(u, fromAtual = null) {
  const caso = u?._casoAnteriorCliente
  if (!caso?.numeroCaso) return false
  const numeroAtual = sanitizarTextoEntrada(fromAtual || u._numero)

  Object.assign(u, {
    stage: STAGES.CLIENTE,
    etapa: STAGES.CLIENTE,
    _numero: numeroAtual || u._numero || null,
    numeroCaso: caso.numeroCaso,
    negocioId: caso.negocioId || null,
    contatoId: caso.contatoId || null,
    negocioStageId: caso.negocioStageId || null,
    pastaDriveId: caso.pastaDriveId || null,
    pastaDriveLink: caso.pastaDriveLink || null,
    nome: caso.nome || u.nome || null,
    nomeConfirmado: Boolean(caso.nomeConfirmado),
    cidade: caso.cidade || null,
    uf: caso.uf || null,
    regiao: caso.regiao || null,
    area: caso.area || null,
    tipo: caso.tipo || null,
    _docKey: caso._docKey || null,
    situacao: caso.situacao || null,
    subTipo: caso.subTipo || null,
    detalhe: caso.detalhe || null,
    urgencia: caso.urgencia || "normal",
    semReceber: Boolean(caso.semReceber),
    descricao: caso.descricao || null,
    assuntoResumo: caso.assuntoResumo || null,
    _audioCanalTranscricao: caso._audioCanalTranscricao || null,
    whatsappVerificado: Boolean(caso.whatsappVerificado),
    telefoneEhDoCliente: caso.telefoneEhDoCliente ?? null,
    whatsappContato: caso.whatsappContato || null,
    modoTexto: Boolean(caso.modoTexto),
    docsEntregues: Array.isArray(caso.docsEntregues) ? [...caso.docsEntregues] : [],
    docsAusentes: Array.isArray(caso.docsAusentes) ? [...caso.docsAusentes] : [],
    docsPulados: Array.isArray(caso.docsPulados) ? [...caso.docsPulados] : [],
    docsParciais: Array.isArray(caso.docsParciais) ? [...caso.docsParciais] : [],
    docsDispensados: Array.isArray(caso.docsDispensados) ? [...caso.docsDispensados] : [],
    docAtualIdx: caso.docAtualIdx || 0,
    documentosEnviados: Boolean(caso.documentosEnviados),
    ultimoArqId: caso.ultimoArqId || null,
    ultimoArqNome: caso.ultimoArqNome || null,
    _novoCasoDeCliente: false,
    _novoCasoParaTerceiro: false,
    _casoAnteriorCliente: null,
    temCadastroCompleto: true,
    leadIncompletoCapturado: false,
    _entradaPendenteTipo: null,
    _entradaPendenteValor: null,
    _entradaPendenteOrigem: null,
    aguardandoResposta: false,
    aguardandoRetomada: false,
    lastPergunta: null,
    lastPerguntaPayload: null,
    _ultimoMenuClienteAt: Date.now()
  })

  agendarPersistenciaUsers()
  return true
}

async function voltarMenuCasoAnteriorCliente(from, u) {
  if (!restaurarCasoAnteriorCliente(u, from)) return null
  iniciarTimer(from)
  return await menuClienteComAudio(from, u)
}

function temDadosUteisTerceiroIncompleto(u) {
  if (!u?._novoCasoParaTerceiro) return false
  return Boolean(
    sanitizarTextoEntrada(u.nome) ||
    sanitizarTextoEntrada(u.whatsappContato) ||
    sanitizarTextoEntrada(u._audioCanalTranscricao) ||
    sanitizarTextoEntrada(u.descricao) ||
    sanitizarTextoEntrada(u.assuntoResumo)
  )
}

async function capturarLeadTerceiroIncompleto(from, u, motivo = "interrupcao") {
  if (!u?._novoCasoParaTerceiro || u._leadTerceiroIncompletoCapturado) return null
  if (!temDadosUteisTerceiroIncompleto(u)) return null

  const casoAnterior = u._casoAnteriorCliente || null
  const nomeQuemAbriu = primeiroEUltimoNome(casoAnterior?.nome || "")
  const telefoneTerceiro = normalizarNumeroWhatsAppEnvio(u.whatsappContato)
  const nomeTerceiro = sanitizarTextoEntrada(u.nome)
  const relato = sanitizarTextoEntrada(u._audioCanalTranscricao || u.descricao || u.assuntoResumo)
  const telefoneCaptura = telefoneTerceiro || normalizarNumeroWhatsAppEnvio(from)

  const lead = {
    ...u,
    numeroCaso: null,
    contatoId: null,
    negocioId: null,
    pastaDriveId: null,
    pastaDriveLink: null,
    nome: nomeTerceiro || (nomeQuemAbriu ? `Indicado por ${nomeQuemAbriu}` : "Lead indicado"),
    nomeWA: nomeTerceiro || u.nomeWA || "Lead indicado",
    nomePerfilWhatsApp: nomeTerceiro || u.nomePerfilWhatsApp || "Lead indicado",
    whatsappContato: telefoneTerceiro || null,
    telefoneEhDoCliente: telefoneTerceiro ? false : true,
    area: u.area || "Atendimento de terceiro",
    descricao: relato || u.descricao || null,
    assuntoResumo: u.assuntoResumo || relato || null,
    stage: `terceiro_incompleto_${normalizarStageKey(u.stage) || "interrompido"}`,
    leadIncompletoCapturado: false,
    _casoAnteriorCliente: null
  }

  const linhas = [
    `Lead incompleto de caso para terceiro.`,
    `Motivo: ${motivo}`,
    `Aberto por: ${nomeQuemAbriu || "cliente original"} (${from})`,
    `Telefone de captura: ${telefoneCaptura}`,
    `Telefone informado do terceiro: ${telefoneTerceiro || "nao informado"}`,
    `Nome do terceiro: ${nomeTerceiro || "nao informado"}`,
    `Relato: ${relato || "nao informado"}`,
    `Caso original: ${casoAnterior?.numeroCaso || "nao informado"}`
  ]
  const nota = linhas.join("\n")

  let contatoId = null
  const existente = await hsBuscarPorPhone(telefoneCaptura).catch(e => {
    logErroHubSpot(e, { operation: "buscarContatoTerceiroIncompleto" })
    return null
  })
  contatoId = existente?.id || null
  if (!contatoId) {
    contatoId = await hsCriarContato(telefoneCaptura, lead)
  } else if (telefoneTerceiro && nomeTerceiro) {
    const nomeExistenteHS = existente?.properties?.firstname || ""
    if (normalizarNomeComparacao(nomeExistenteHS) === normalizarNomeComparacao(nomeTerceiro)) {
      logDebug("[HUBSPOT] Lead terceiro incompleto associado a contato existente do proprio terceiro.")
    } else {
      logDebug("[HUBSPOT] Lead terceiro incompleto com telefone ja existente; nome do contato preservado.")
    }
  }
  if (!contatoId) return null

  const negocioId = await hsCriarNegocio(lead, {
    stage: HS_STAGE.LEAD
  })
  if (negocioId) {
    await hsAssociar(contatoId, negocioId)
    await hsCriarNotaNegocio(negocioId, "LEAD INCOMPLETO - CASO PARA TERCEIRO", nota)
  }
  await hsCriarNota(contatoId, "LEAD INCOMPLETO - CASO PARA TERCEIRO", nota)
  u._leadTerceiroIncompletoCapturado = true
  return { contatoId, negocioId }
}

async function cancelarNovoCasoClienteEVoltarMenu(from, u, motivo = "cancelado") {
  await capturarLeadTerceiroIncompleto(from, u, motivo).catch(e =>
    logErroHubSpot(e, {
      operation: "capturarLeadTerceiroIncompleto",
      contactId: u?.contatoId,
      dealId: u?.negocioId
    })
  )
  const tinhaDados = temDadosUteisTerceiroIncompleto(u)
  if (!restaurarCasoAnteriorCliente(u, from)) return null
  iniciarTimer(from)
  await enviarAudioModoVoz(
    from,
    u,
    tinhaDados
      ? "Tudo bem. Pausei a abertura desse caso para outra pessoa e registrei as informações já enviadas. Vou te levar de volta ao seu menu."
      : "Tudo bem. Cancelei a abertura desse caso para outra pessoa e vou te levar de volta ao seu menu.",
    "cancelar novo caso terceiro"
  )
  return {
    texto: tinhaDados
      ? `🕒 *Atendimento pausado*\n\nRegistrei as informações já enviadas sobre o caso da outra pessoa.\n\nAgora você voltou para o seu menu do cliente.`
      : `✅ *Abertura cancelada*\n\nNenhum dado foi salvo porque você ainda não tinha informado nome, WhatsApp ou a situação da outra pessoa.\n\nAgora você voltou para o seu menu do cliente.`,
    opcoes: [
      { id: "m_inicio", title: "🏠 Meu menu" },
      { id: "m_novocaso", title: "➕ Abrir outro" },
      { id: "m_encerrar", title: "👋 Encerrar" }
    ]
  }
}

async function registrarCasoTerceiroNoWhatsAppInformado(from, u, numeroCaso, casoAnterior = null) {
  const telefoneTerceiro = normalizarNumeroWhatsAppEnvio(u.whatsappContato)
  if (!telefoneTerceiro || telefoneTerceiro === normalizarNumeroWhatsAppEnvio(from)) return false
  const nomeQuemAbriu = (casoAnterior?.nome || u.nomeContato || "").split(" ")[0].trim() || ""
  const estadoBase = desserializarEstado(serializarEstado(u)) || {}

  const estadoTerceiro = {
    ...estadoBase,
    stage: STAGES.CLIENTE,
    etapa: STAGES.CLIENTE,
    _numero: telefoneTerceiro,
    _novoCasoDeCliente: false,
    _novoCasoParaTerceiro: false,
    _casoAnteriorCliente: null,
    telefoneEhDoCliente: true,
    whatsappContato: telefoneTerceiro,
    whatsappVerificado: true,
    temCadastroCompleto: true,
    _aguardandoReconhecimentoTerceiro: true,
    aguardandoResposta: false,
    aguardandoRetomada: false,
    lastPergunta: null,
    lastPerguntaPayload: null
  }
  let sessaoTerceiroPreparada = false
  if (!locksUsuarios.has(telefoneTerceiro)) {
    sessaoTerceiroPreparada = await executarComLockUsuario(telefoneTerceiro, () => {
      const estadoAnteriorTerceiro = users[telefoneTerceiro]
      if (estadoAnteriorTerceiro) {
        limparTimer(estadoAnteriorTerceiro)
        limparTimerIncentivoDescricao(estadoAnteriorTerceiro)
      }
      users[telefoneTerceiro] = { ...novoUsuario(u.nome || "Cliente"), ...estadoTerceiro }
      return true
    })
  } else {
    logErro("concorrencia", `Sessao ativa impediu substituicao do estado do terceiro: ${telefoneTerceiro}`)
  }

  let enviado = false
  if (sessaoTerceiroPreparada) {
    enviado = await templateService.casoTerceiro(telefoneTerceiro, {
      nomeAtendido: primeiroNomeCliente(u) || u.nome || "tudo bem",
      nomeSolicitante: nomeQuemAbriu || "uma pessoa próxima",
      numeroCaso,
      area: u.area || "Jurídico"
    })
  }

  if (sessaoTerceiroPreparada && !enviado) {
    enviado = await enviar(telefoneTerceiro,
      `Olá, *${primeiroNomeCliente(u) || u.nome || "tudo bem"}*!\n\nUm novo atendimento jurídico foi aberto para você pela *Oráculum Advocacia*${nomeQuemAbriu ? ` a pedido de *${nomeQuemAbriu}*` : ""}.\n\n📄 *Número do caso:* \`\`\`${numeroCaso}\`\`\`\n⚖️ *Área:* ${u.area ? "Direito " + u.area : "Jurídico"}\n\nA continuidade deste atendimento será feita por este WhatsApp.\n\nVocê reconhece esse atendimento?\n\n━━━━━━━━━━━━━━━\n_Seus dados são tratados com sigilo e utilizados exclusivamente para fins jurídicos, conforme a LGPD._`,
      [
        { id: "terceiro_reconhece", title: "✅ Reconheço" },
        { id: "terceiro_nao_reconhece", title: "❌ Não reconheço" }
      ]
    )
  }

  if (!enviado) {
    logErro("whatsapp", `Falha ao avisar terceiro sobre novo caso: ${telefoneTerceiro}`)
    if (u.negocioId) {
      await hsCriarNotaNegocio(
        u.negocioId,
        "ALERTA - NOTIFICACAO AO TERCEIRO NAO ENVIADA",
        `Não foi possível enviar a notificação automática ao WhatsApp informado (${telefoneTerceiro}). Provável janela de 24h fechada ou template ausente/não aprovado.`
      )
    }
  }

  agendarPersistenciaUsers()
  return enviado
}

async function finalizarCadastroTerceiroEVoltarOrigem(from, u, numeroCaso, casoAnterior = null) {
  const nomeTerceiro = u.nome || "a pessoa informada"
  const areaTerceiro = u.area || "Atendimento"
  const docs = getDocumentosListaCaso(u).map(d => `· ${d.label}`).join("\n")
  const notificacaoTerceiroEnviada = await registrarCasoTerceiroNoWhatsAppInformado(from, u, numeroCaso, casoAnterior)

  if (casoAnterior) {
    u._casoAnteriorCliente = casoAnterior
    restaurarCasoAnteriorCliente(u, from)
  } else {
    // Fluxo novo: usuário sem caso anterior — encerrar sessão limpa
    u._fluxoEncerrado = true
    setStage(u, STAGES.AUDIO_AGUARDANDO)
  }

  const avisoNotificacao = notificacaoTerceiroEnviada
    ? ""
    : "\n\n⚠️ O WhatsApp informado ficou registrado, mas a notificação automática pode não ter sido entregue agora."
  const texto = `🎉 *Caso de ${nomeTerceiro} registrado com sucesso!*\n\n📄 *Número do caso:* \`\`\`${numeroCaso}\`\`\`\n\n_Guarde esse número. É com ele que identificamos o atendimento._\n\nSeu caso foi encaminhado a um especialista em *Direito ${areaTerceiro}*, que fará a análise e entrará em contato em breve.\n\n⏱️ Prazo estimado: até 2 dias úteis\n━━━━━━━━━━━━━━━\n📋 *Documentos que podem ser necessários:*\n${docs}\n\nVocê pode enviar agora ou depois pelo WhatsApp informado.${avisoNotificacao}`
  const opcoes = casoAnterior
    ? [
        { id: "m_inicio", title: "🏠 Meu menu" },
        { id: "m_novocaso", title: "➕ Abrir outro" },
        { id: "m_encerrar", title: "👋 Encerrar" }
      ]
    : [
        { id: "m_encerrar", title: "👋 Encerrar" }
      ]

  if (IMAGEM_CASO_REGISTRADO_URL) {
    const enviada = await enviarImagemWhatsApp(from, IMAGEM_CASO_REGISTRADO_URL, texto, opcoes)
    if (enviada) return { texto: null, opcoes: null }
  }

  return {
    texto,
    opcoes
  }
}

async function encerrarNovoCasoClienteEVoltarMenu(from, u) {
  await capturarLeadTerceiroIncompleto(from, u, "encerramento_manual").catch(e =>
    logErroHubSpot(e, {
      operation: "capturarLeadTerceiroIncompletoEncerramento",
      contactId: u?.contatoId,
      dealId: u?.negocioId
    })
  )
  const tinhaDados = temDadosUteisTerceiroIncompleto(u)
  if (!restaurarCasoAnteriorCliente(u, from)) return null
  await enviarAudioModoVoz(
    from,
    u,
    tinhaDados
      ? "Tudo bem. Encerrei este novo atendimento e registrei as informações já enviadas. Vou te levar de volta ao menu do cliente."
      : "Tudo bem. Encerrei este novo atendimento e vou te levar de volta ao menu do cliente.",
    "encerrar novo caso cliente"
  )
  u._menuClienteJaApresentado = true
  iniciarTimer(from)
  return menuCliente(u)
}

function usuarioTemRelatoParaRetomada(u) {
  return Boolean(
    sanitizarTextoEntrada(u?._audioCanalTranscricao) ||
    sanitizarTextoEntrada(u?.descricao) ||
    sanitizarTextoEntrada(u?.assuntoResumo) ||
    sanitizarTextoEntrada(u?._descTemp) ||
    sanitizarTextoEntrada(u?._relatoAnterior)
  )
}

function usuarioTemProgressoParaRetomada(u) {
  if (!u) return false

  const stageSalvo = obterStageRetomadaOriginal(u)
  const stageNormalizado = normalizarStageKey(stageSalvo)
  const stageValido = etapaValida(stageSalvo) && !ETAPAS_NAO_RETOMAVEIS.has(stageNormalizado)

  const nomeConfirmado = Boolean(u.nomeConfirmado)
  const cidadeExplicita = Boolean(sanitizarTextoEntrada(u.cidade))
  const modoEscolhido = Boolean(u.modoTexto === true || u.modoTexto === false)
  const temTerceiro = Boolean(u._casoAnteriorCliente || u.atendimentoParaTerceiro)
  const areaColetada = Boolean(sanitizarTextoEntrada(u.area))
  const situacaoColetada = Boolean(sanitizarTextoEntrada(u.situacao))
  const urgenciaColetada = Boolean(sanitizarTextoEntrada(u.urgencia) && u.urgencia !== "normal")
  const relatoColetado = usuarioTemRelatoParaRetomada(u)

  if (stageValido) {
    const stageInicialSemDados = [
      STAGES.AUDIO_AGUARDANDO,
      STAGES.ACOLHIMENTO_MODO,
      STAGES.ACOLHIMENTO_PARA_QUEM,
      STAGES.ACOLHIMENTO_NOME_CONTATO,
      STAGES.ACOLHIMENTO_CONFIRMA_NOME_CONTATO,
      STAGES.ACOLHIMENTO_CONFIRMA_TITULAR_NOME,
      STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP,
      STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP_OUTRO
    ].includes(stageNormalizado)
    if (stageInicialSemDados && !nomeConfirmado && !cidadeExplicita && !modoEscolhido && !temTerceiro) {
      return false
    }
    return true
  }

  if (nomeConfirmado) return true
  if (cidadeExplicita) return true
  if (modoEscolhido) return true
  if (temTerceiro) return true
  if (areaColetada || situacaoColetada || urgenciaColetada) return true
  if (relatoColetado) return true

  return false
}


function identificarEtapaAtual(u, payload) {
  const origem = payload?.perguntaId || u?.stage || ""

  if (ehStageDescricaoCaso(origem) || ehStageDescricaoCaso(u?.stage)) return "descricao_caso"
  if (["coleta_nome", "__coleta_nome_legado__", "coleta_tel_outro"].includes(origem) || ["coleta_nome", "__coleta_nome_legado__", "coleta_tel_outro"].includes(u?.stage)) return "nome"
  if (["coleta_cidade", "coleta_cidade_regiao", "__coleta_cidade_legado__"].includes(origem) || ["coleta_cidade", "coleta_cidade_regiao", "__coleta_cidade_legado__"].includes(u?.stage)) return "cidade"
  if (
    origem === "documentos" ||
    /documentos do caso/i.test(payload?.texto || "") ||
    (payload?.opcoes || []).some(o => ["docs_reenviar", "docs_maisFotos", "docs_proxdoc", "docs_pular_doc", "docs_rg_verso_junto", "docs_rg_sem_verso", "docs_enviar_faltantes", "docs_ver_status", "doc_cpf_skip", "docs_confirmar_envio_extra"].includes(o.id))
  ) return "documentos"
  if (origem === STAGES.AREA || origem === "area") return "area"

  return origem || "pergunta"
}

function registrarUltimaPergunta(u, payload) {
  if (!u || !payload?.texto || payload.registrarPergunta === false) return
  if (u.stage === STAGES.RETOMADA_AUTOMATICA) return
  if ([STAGES.RETOMADA_MENU, STAGES.RESUMO_ATENDIMENTO, STAGES.RESUMO_RETOMADA].includes(u.stage)) {
    u.lastPerguntaPayload = { texto: payload.texto, opcoes: payload.opcoes || null }
    u.aguardandoResposta = true
    return
  }
  const deveSalvar = payload.opcoes?.length || payload.texto.includes("?") || u.stage !== "cliente"
  if (!deveSalvar) return
  u.lastPergunta = payload.perguntaId || u.stage || "pergunta"
  if (u.stage === STAGES.AUDIO_AGUARDANDO && !usuarioTemRelatoParaRetomada(u)) {
    u.lastPerguntaPayload = { texto: payload.texto, opcoes: payload.opcoes || null }
    u.aguardandoResposta = true
    return
  }
  // Só salvar etapa se o stage atual for uma etapa válida (não está em ETAPAS_NAO_RETOMAVEIS)
  // Ex: stage "cliente" não é retomável — apenas registrar o payload sem tentar persistir a etapa
  const etapaParaSalvar = identificarEtapaAtual(u, payload)
  if (etapaValida(etapaParaSalvar)) {
    salvarEtapa(u._numero, etapaParaSalvar)
  }
  u.lastPerguntaPayload = { texto: payload.texto, opcoes: payload.opcoes || null }
  u.aguardandoResposta = true
}

function limparDadosCasoAtual(u, { preservarNome = true, marcarFluxoEncerrado = false } = {}) {
  const nomePreservado = preservarNome && u.nomeConfirmado ? u.nome : null
  const _stageAntes = u.stage
  const _etapaAntes = u.etapa
  const _stageRetomadaOriginalAntes = u._stageRetomadaOriginal
  const _stageRetomadaPreservado = obterStageRetomadaOriginal(u)
  const _atendenteAntes = u.atendente
  const _nomeConfirmadoAntes = Boolean(u.nomeConfirmado)
  const _areaAntes = u.area || null
  const _areaDetectadaAntes = u._areaDetectada || null
  const _situacaoAntes = u.situacao || null
  const _cidadeAntes = u.cidade || null
  const _ufAntes = u.uf || null
  const _regiaoAntes = u.regiao || null
  const _urgenciaAntes = u.urgencia || null
  const _descricaoAntes = u.descricao || null
  const _audioCanalTranscricaoAntes = u._audioCanalTranscricao || null
  const _negocioIdAntes = u.negocioId || null
  const _contatoIdAntes = u.contatoId || null
  limparTimerIncentivoDescricao(u)
  Object.assign(u, {
    stage: "inicio",
    etapa: STAGES.AUDIO_AGUARDANDO,
    nome: nomePreservado,
    regiao: null, cidade: null, uf: null,
    area: null, tipo: null, situacao: null, subTipo: null, detalhe: null,
    _docKey: null,
    urgencia: "normal", semReceber: false,
    contribuicao: null, recebeBeneficio: null, descricao: null,
    contatoId: null, negocioId: null, numeroCaso: null,
    pastaDriveId: null, pastaDriveLink: null,
    consultaStatus: "sem_consulta",
    tipoConsulta: "inicial",
    score: 0, documentosEnviados: false,
    docsEntregues: [], docsAusentes: [], docsPulados: [], docsParciais: [], docsDispensados: [],
    docAtualIdx: 0, ultimoArqId: null, ultimoArqNome: null,
    corrigirCampo: null, historiaIA: [],
    lastPergunta: null, lastPerguntaPayload: null,
    leadIncompletoCapturado: false,
    audiosDescCorrigidos: [],
    assuntoResumo: null,
    _ofereceuExplicarTudo: false,
    _sugestaoFluxo: null,
    _hubspotSyncSnapshot: null,
    _proximoStageAposDescricao: null,
    _proximaPerguntaAposDescricao: null,
    _entradaPendenteTipo: null, _entradaPendenteValor: null, _entradaPendenteOrigem: null,
    aguardandoRetomada: false,
    temCadastroCompleto: false,
    jaOfereceuRetomada: false,
    jaIncentivouDescricao: false,
    _retomadaEhLeadFrio: false,
    _stageRetomadaOriginal: null,
    _negocioStageIdPendente: null,
    _fluxoEncerrado: Boolean(marcarFluxoEncerrado),
    _regiao: null, _descTemp: null,
    _novoCasoParaTerceiro: false,
    _contextoDocsCasoAtual: null,
    _audioDescBuffer: null, _audioDescMime: null, _audioDescNome: null,
    _descOrigemStage: null,
    _audioFluxoTexto: null, _audioFluxoAcao: null, _audioFluxoResposta: null,
    _urgenteAudioBuffer: null, _urgenteAudioMime: null, _urgenteAudioNome: null, _urgenteAudioTexto: null,
    modoDigitando: false,
    aguardandoResposta: false,
    _jaEsclareceuRelato: false,
    _jaAcolheuSofrimento: false
  })
  if (marcarFluxoEncerrado) {
    const _stageTecnicoRetomada = [
      STAGES.RETOMADA_AUTOMATICA,
      STAGES.RETOMADA_MENU,
      STAGES.RESUMO_RETOMADA,
      STAGES.RESUMO_ATENDIMENTO
    ].includes(_stageAntesNormalizado)
    u.etapa = etapaValida(_etapaAntes) ? normalizarStageKey(_etapaAntes) : _stageRetomadaPreservado
    u._stageRetomadaOriginal = _stageTecnicoRetomada
      ? (_stageRetomadaPreservado || _stageRetomadaOriginalAntes || u.etapa)
      : (_stageRetomadaPreservado || _stageAntesNormalizado || u.etapa)
    u.atendente = _atendenteAntes || null
    u.nome = nomePreservado || null
    u.nomeConfirmado = _nomeConfirmadoAntes
    u.area = _areaAntes
    u._areaDetectada = _areaDetectadaAntes
    u.situacao = _situacaoAntes
    u.cidade = _cidadeAntes
    u.uf = _ufAntes
    u.regiao = _regiaoAntes
    u.urgencia = _urgenciaAntes || "normal"
    u.descricao = _descricaoAntes
    u._audioCanalTranscricao = _audioCanalTranscricaoAntes
    u.negocioId = _negocioIdAntes
    u.contatoId = _contatoIdAntes
  }
  agendarPersistenciaUsers()
}

function limparDadosAtendimento(u) {
  limparTimerIncentivoDescricao(u)
  Object.assign(u, {
    stage: "inicio",
    etapa: STAGES.AUDIO_AGUARDANDO,
    regiao: null, cidade: null, uf: null,
    area: null, tipo: null, situacao: null, subTipo: null, detalhe: null,
    _docKey: null,
    urgencia: "normal", semReceber: false,
    contribuicao: null, recebeBeneficio: null, descricao: null,
    pastaDriveId: null, pastaDriveLink: null,
    consultaStatus: "sem_consulta", tipoConsulta: "inicial",
    score: 0, documentosEnviados: false,
    docsEntregues: [], docsAusentes: [], docsPulados: [], docsParciais: [], docsDispensados: [],
    docAtualIdx: 0, ultimoArqId: null, ultimoArqNome: null,
    corrigirCampo: null,
    lastPergunta: null, lastPerguntaPayload: null,
    leadIncompletoCapturado: false,
    audiosDescCorrigidos: [],
    assuntoResumo: null,
    _ofereceuExplicarTudo: false,
    _sugestaoFluxo: null,
    _proximoStageAposDescricao: null,
    _proximaPerguntaAposDescricao: null,
    _entradaPendenteTipo: null, _entradaPendenteValor: null, _entradaPendenteOrigem: null,
    aguardandoRetomada: false,
    temCadastroCompleto: false,
    jaOfereceuRetomada: false,
    jaIncentivouDescricao: false,
    _retomadaEhLeadFrio: false,
    _stageRetomadaOriginal: null,
    _negocioStageIdPendente: null,
    _fluxoEncerrado: false,
    _regiao: null, _descTemp: null,
    _audioDescBuffer: null, _audioDescMime: null, _audioDescNome: null,
    _descOrigemStage: null,
    _audioFluxoTexto: null, _audioFluxoAcao: null, _audioFluxoResposta: null,
    _urgenteAudioBuffer: null, _urgenteAudioMime: null, _urgenteAudioNome: null, _urgenteAudioTexto: null,
    modoDigitando: false,
    aguardandoResposta: false,
    _jaAcolheuSofrimento: false
  })
  agendarPersistenciaUsers()
}

function prepararNovaEntradaAposFluxoEncerrado(u, nomeWA = "") {
  if (!u) return
  limparTimer(u)
  limparTimerIncentivoDescricao(u)

  const numero            = u._numero || null
  const nomeBase          = sanitizarTextoEntrada(u.nomeWA || nomeWA || "Cliente") || "Cliente"
  const nomePerfilWhatsApp = sanitizarTextoEntrada(u.nomePerfilWhatsApp || nomeWA || nomeBase) || "Cliente"
  const nomeHubspot       = u.nomeHubspot || null
  const hubspotSemContato = Boolean(u._hubspotSemContato)
  const processing        = Boolean(u.processing)

  // Preserva dados do cliente cadastrado
  const numeroCaso        = u.numeroCaso || null
  const negocioId         = u.negocioId || null
  const contatoId         = u.contatoId || null
  const nome              = u.nome || null
  const nomeConfirmado    = Boolean(u.nomeConfirmado)
  const area              = u.area || null
  const situacao          = u.situacao || null
  const urgencia          = u.urgencia || null
  const cidade            = u.cidade || null
  const uf                = u.uf || null
  const regiao            = u.regiao || null
  const docsEntregues     = u.docsEntregues || null
  const docsAusentes      = u.docsAusentes || null
  const docsPulados       = u.docsPulados || null
  const docsParciais      = u.docsParciais || null
  const docsDispensados   = u.docsDispensados || null
  const quantidadeCasos   = u.quantidadeCasos || null
  const temCadastroCompleto = Boolean(u.temCadastroCompleto)
  const modoTexto           = Boolean(u.modoTexto)

  Object.assign(u, novoUsuario(nomeBase), {
    _numero:              numero,
    nomeWA:               nomeBase,
    nomePerfilWhatsApp,
    nomeHubspot,
    _hubspotSemContato:   hubspotSemContato,
    processing,
    _fluxoEncerrado:      false,
    ultimaMsg:            Date.now(),
    // Restaura dados do cliente
    numeroCaso,
    negocioId,
    contatoId,
    nome,
    nomeConfirmado,
    area,
    situacao,
    urgencia,
    cidade,
    uf,
    regiao,
    docsEntregues,
    docsAusentes,
    docsPulados,
    docsParciais,
    docsDispensados,
    quantidadeCasos,
    temCadastroCompleto,
    modoTexto,
    atendente: u.atendente || null,
    _stageRetomadaOriginal: u._stageRetomadaOriginal || null,
    _areaDetectada: u._areaDetectada || null,
    _audioCanalTranscricao: u._audioCanalTranscricao || null,
  })

  agendarPersistenciaUsers()
}

function enviarOpcoesPadrao(_from, modo = "documentos") {
  if (modo === "retorno_docs") {
    return [
      { id: "m_docs", title: "📎 Enviar documentos" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
    ]
  }
  return [
    { id: "docs_pular_doc", title: "Não tenho este" },
    { id: "docs_depois", title: "Continuar depois" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
  ]
}

async function prepararConfirmacaoEntrada(from, u, tipo, valor, origem) {
  u._entradaPendenteTipo = tipo
  u._entradaPendenteValor = valor
  u._entradaPendenteOrigem = origem
  setStage(u, STAGES.CONFIRMAR_ENTRADA)
  iniciarTimer(from)
  const label = tipo === "telefone" ? formatarTelefoneExibicao(valor) : valor
  const labelAudio = tipo === "telefone" ? formatarTelefoneAudio(valor) : valor
  const contextoAudio = origem === "coleta_tel_outro"
    ? "confirmar nome terceiro"
    : tipo === "telefone"
      ? "confirmar telefone"
      : tipo === "cidade"
        ? "confirmar cidade"
        : "confirmar entrada"
  const textoAudio = tipo === "nome"
    ? (origem === "coleta_tel_outro"
        ? audioConfirmarNomePessoaAtendida(labelAudio)
        : `Entendi. O nome informado foi ${labelAudio}. Está correto? Se sim, toque em Confirmar. Se não estiver, me diga o nome correto agora, pode falar ou digitar.`)
    : tipo === "telefone"
      ? `O número informado foi ${labelAudio}. Está correto? Se sim, toque em Confirmar. Se não estiver, me diga o número correto agora, pode falar ou digitar.`
      : tipo === "cidade"
        ? `Você informou ${labelAudio}. Está correto? Se sim, toque em Confirmar. Se não estiver, me diga a cidade correta agora, pode falar ou digitar.`
        : `Você informou ${labelAudio}. Está correto? Se sim, toque em Confirmar. Se não estiver, me diga a informação correta agora, pode falar ou digitar.`
  await enviarAudioModoVoz(from, u, textoAudio, contextoAudio)
  const barra = tipo === "nome"
      ? (origem === "coleta_tel_outro" ? null : "●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n")
    : tipo === "telefone"
      ? "●●●●○○ 📱 Etapa 4 de 6 · *WHATSAPP*\n\n"
    : tipo === "cidade"
        ? "●●●●●○ 📍 Etapa 5 de 6 · *CIDADE*\n\n"
      : ""
  return {
    texto: origem === "coleta_tel_outro"
      ? textoConfirmarNomePessoaAtendida(label)
      : `${barra || ""}Você informou: *${label}*\nEstá correto? Se não estiver, é só me dizer a informação correta agora. Pode falar ou digitar. 🎙️`,
    opcoes: [
      { id: "entrada_ok", title: "✅ Confirmar" }
    ]
  }
}

function limparEntradaPendente(u) {
  u._entradaPendenteTipo = null
  u._entradaPendenteValor = null
  u._entradaPendenteOrigem = null
}

function resetarSessaoAtendimento(u) {
  const _stageAntes = u.stage
  const _atendenteAntes = u.atendente
  const _nomeAntes = u.nomeConfirmado ? u.nome : null
  const _nomeConfirmadoAntes = Boolean(u.nomeConfirmado)
  const _areaAntes = u.area || null
  const _areaDetectadaAntes = u._areaDetectada || null
  const _situacaoAntes = u.situacao || null
  const _cidadeAntes = u.cidade || null
  const _ufAntes = u.uf || null
  const _regiaoAntes = u.regiao || null
  const _urgenciaAntes = u.urgencia || null
  const _descricaoAntes = u.descricao || null
  const _audioCanalAntes = u._audioCanalTranscricao || null
  const _negocioIdAntes = u.negocioId || null
  const _contatoIdAntes = u.contatoId || null
  const _modoTextoAntes = Boolean(u.modoTexto)
  const base = novoUsuario(u.nomeWA || "Cliente")
  Object.assign(u, base)
  u._fluxoEncerrado = true
  u._stageRetomadaOriginal = _stageAntes || null
  u.atendente = _atendenteAntes || null
  u.nome = _nomeAntes
  u.nomeConfirmado = _nomeConfirmadoAntes
  u.area = _areaAntes
  u._areaDetectada = _areaDetectadaAntes
  u.situacao = _situacaoAntes
  u.cidade = _cidadeAntes
  u.uf = _ufAntes
  u.regiao = _regiaoAntes
  u.urgencia = _urgenciaAntes || "normal"
  u.descricao = _descricaoAntes
  u._audioCanalTranscricao = _audioCanalAntes
  u.negocioId = _negocioIdAntes
  u.contatoId = _contatoIdAntes
  u.modoTexto = _modoTextoAntes
  agendarPersistenciaUsers()
}

function responderEncerramento(u) {
  limparTimer(u)
  resetarSessaoAtendimento(u)
  // mensagem de encerramento mais humana, com emoji e nome
  // Quando atendimento para terceiro, fala com quem está no WhatsApp (nomeContato)
  const primeiroNome = (u.atendimentoParaTerceiro && u.nomeContato)
    ? u.nomeContato.split(" ")[0]
    : (primeiroNomeCliente(u) || "")
  const saudacao = primeiroNome ? `, ${primeiroNome}` : ""
  return {
    texto: `👋 Foi um prazer te atender${saudacao}! 😊\n\nSeu atendimento foi encerrado. Qualquer coisa, é só me chamar aqui. Estou sempre disponível para ajudar. Até logo! 💙`,
    opcoes: null,
    registrarPergunta: false
  }
}

/**
 * Encerra o atendimento garantindo captura do lead no HubSpot.
 * Se o usuário ainda não é cliente (sem numeroCaso), captura antes de encerrar.
 */
async function encerrarComCaptura(from, u) {
  if (u?._casoAnteriorCliente && !u.numeroCaso) {
    const menuAnterior = await encerrarNovoCasoClienteEVoltarMenu(from, u)
    if (menuAnterior) return menuAnterior
  }
  if (u && !u.numeroCaso && !u.leadIncompletoCapturado) {
    await capturarLeadIncompleto(from, u).catch(e =>
      logErroHubSpot(e, {
        operation: "encerrarComCaptura",
        contactId: u?.contatoId,
        dealId: u?.negocioId
      })
    )
  }
  if (!u.modoTexto && from) {
    try {
      const primeiroNome = (u.atendimentoParaTerceiro && u.nomeContato)
        ? u.nomeContato.split(" ")[0]
        : (primeiroNomeCliente(u) || "")
      const textoAudio = primeiroNome
        ? `Foi um prazer te atender, ${primeiroNome}! Qualquer coisa, é só me chamar. Até logo!`
        : `Foi um prazer te atender! Qualquer coisa, é só me chamar. Até logo!`
      const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 1500))
    } catch (e) { logErro("tts", "Falha áudio encerramento", e) }
  }
  return responderEncerramento(u)
}

async function encerrarAtendimento(from, u) {
  if (u?.numeroCaso) return encerrarClienteCadastrado(from, u)
  salvarEtapa(u._numero, u.stage)
  return encerrarComCaptura(from, u)
}

async function encerrarClienteCadastrado(from, u) {
  limparTimer(u)
  limparTimerIncentivoDescricao(u)
  const primeiroNome = (u.atendimentoParaTerceiro && u.nomeContato)
    ? u.nomeContato.split(" ")[0]
    : (primeiroNomeCliente(u) || "você")
  setStage(u, STAGES.CLIENTE)
  u._fluxoEncerrado = false
  u.aguardandoResposta = false
  u.aguardandoRetomada = false
  u.jaOfereceuRetomada = false
  u.lastPergunta = null
  u.lastPerguntaPayload = null
  agendarPersistenciaUsers()
  await enviarAudioModoVoz(
    from,
    u,
    `Tudo certo, ${primeiroNome}. Quando precisar, é só me chamar por aqui.`,
    "encerrar cliente cadastrado"
  )
  return {
    texto: `Tudo certo, *${primeiroNome}*. Quando precisar, é só me chamar por aqui.`,
    opcoes: null,
    registrarPergunta: false
  }
}

async function executarEncerramentoFluxo(from, u) {
  if (u?.numeroCaso) return encerrarClienteCadastrado(from, u)
  if (u?._casoAnteriorCliente && !u.numeroCaso) {
    const menuAnterior = await encerrarNovoCasoClienteEVoltarMenu(from, u)
    if (menuAnterior) return menuAnterior
  }
  limparTimer(u)
  const primeiroNome = (u.atendimentoParaTerceiro && u.nomeContato)
    ? u.nomeContato.split(" ")[0]
    : (primeiroNomeCliente(u) || "você")
  if (!u.numeroCaso && !u.leadIncompletoCapturado) {
    await capturarLeadIncompleto(from, u).catch(e =>
      logErroHubSpot(e, {
        operation: "executarEncerramentoFluxo",
        contactId: u?.contatoId,
        dealId: u?.negocioId
      })
    )
  }
  limparDadosCasoAtual(u, { marcarFluxoEncerrado: true })
  if (!u.modoTexto && from) {
    try {
      const textoAudio = primeiroNome !== "você"
        ? `Tudo bem, ${primeiroNome}! Quando quiser retomar, é só me chamar.`
        : `Tudo bem! Quando quiser retomar, é só me chamar.`
      const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 1000))
    } catch (e) { logErro("tts", "Falha áudio encerramento", e) }
  }
  return { texto: `Tudo bem, ${primeiroNome}! 😊 Quando quiser retomar, é só me chamar.`, opcoes: null, registrarPergunta: false }
}

async function executarRecomecoFluxo(from, u) {
  if (podeMostrarMenuCliente(u)) {
    setStage(u, STAGES.CLIENTE)
    iniciarTimer(from)
    return await menuClienteComAudio(from, u)
  }

  u._audioFluxoTexto = null
  u._audioFluxoAcao = null
  u._audioFluxoResposta = null
  u._revalidandoCampos = true
  u.aguardandoResposta = false
  u.aguardandoRetomada = false
  if (!u.atendente) u.atendente = sortearAtendente()
  setStage(u, STAGES.AUDIO_AGUARDANDO)
  iniciarTimer(from)

  const primeiroNome = (u.atendimentoParaTerceiro && u.nomeContato)
    ? u.nomeContato.split(" ")[0]
    : (primeiroNomeCliente(u) || "")
  const saudacao = primeiroNome ? `, ${primeiroNome}` : ""
  const textoAudio = `Tudo bem${saudacao}. Vamos recomeçar com calma. Pode me contar sua situação novamente${complementoModo}. Estou aqui para ajudar você.`
  if (!u.modoTexto && from) {
    try {
      const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 3000))
    } catch (e) { logErro("tts", "Falha áudio recomeçar fluxo", e) }
  }

  return {
    texto: `🔄 Tudo bem${saudacao} 😊\n\nVamos *recomeçar* com calma.\n\nPode me contar sua situação novamente${complementoModo}. Estou aqui para ajudar você.`,
    opcoes: null
  }
}

function stageAceitaTextoLivre(stage) {
  return new Set([
    "coleta_tel_outro",
    "coleta_tel_wpp",
    "coleta_tel_wpp_contato",
    STAGES.COLETA_DESC,
    STAGES.COLETA_DESC_AUDIO,
    STAGES.AGUARDANDO_URGENTE,
    STAGES.CORRIGIR_VALOR,
    STAGES.CONFIRMAR_ENTRADA,
    STAGES.AUDIO_AGUARDANDO,
    STAGES.ACOLHIMENTO_CONFIRMA_NOME,
    STAGES.ACOLHIMENTO_CONFIRMA_NOME_CONTATO,
    STAGES.ACOLHIMENTO_CONFIRMA_TITULAR_NOME,
    STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP,
    STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP_OUTRO,
    STAGES.ASSESSORIA_INICIAL,
    STAGES.CONFIRMAR_CORRECAO_NOME,
    STAGES.CONFIRMAR_CORRECAO_CIDADE
  ]).has(stage)
}

function ehStageFluxoAntigo(stage) {
  return new Set([
    STAGES.AREA,
    STAGES.ESCOLHA_CANAL,
    STAGES.ESCOLHA_AREA,
    STAGES.ENTENDIMENTO_INICIAL,
    STAGES.DIRECIONAMENTO,
    STAGES.AUDIO_OPCOES,
    STAGES.GATILHO,
    STAGES.URGENCIA,
    STAGES.COLETA_NOME_LEGADO,
    STAGES.COLETA_REGIAO,
    STAGES.COLETA_REGIAO_LEGADO,
    STAGES.COLETA_UF,
    STAGES.COLETA_UF_LEGADO,
    STAGES.COLETA_CIDADE,
    STAGES.COLETA_CIDADE_LEGADO,
    STAGES.COLETA_CIDADE_REGIAO,
    STAGES.COLETA_CONTRIB,
    STAGES.COLETA_CONTRIB_REGIAO,
    STAGES.COLETA_CONTRIB_REGIAO_V2,
    STAGES.COLETA_BENEF,
    STAGES.COLETA_BENEF_REGIAO_V2,
    STAGES.COLETA_VERIF_TEL,
    STAGES.INSS_MENU,
    STAGES.INSS_NOVO,
    STAGES.INSS_NEG_TIPO,
    STAGES.INSS_CORT_TIPO,
    STAGES.INSS_APOS,
    STAGES.INSS_BPC,
    STAGES.INSS_INC,
    STAGES.INSS_DEP,
    STAGES.INSS_OUT,
    STAGES.INSS_JA,
    STAGES.INSS_NEG_QUANDO,
    STAGES.INSS_CORT_MOT,
    STAGES.INSS_CORT_REC,
    STAGES.INSS_CORT_QDO,
    STAGES.TRAB_MENU,
    STAGES.TRAB_DEM_TIPO,
    STAGES.TRAB_DEM_VERB,
    STAGES.TRAB_DEM_QDO,
    STAGES.TRAB_DIR_TIPO,
    STAGES.TRAB_DIR_PEND,
    STAGES.TRAB_ACID_AF,
    STAGES.TRAB_ASS_S,
    STAGES.TRAB_ASS_PROV,
    STAGES.OUTROS_MENU,
    STAGES.OUT_CONS_TIPO,
    STAGES.OUT_REV_TIPO,
    STAGES.OUT_DESC,
    STAGES.TRAB_OUT_DESC,
    STAGES.SUGESTAO_FLUXO_OUTRO,
    STAGES.EXPLICAR_TUDO_OFERTA
  ].map(normalizarStageKey)).has(normalizarStageKey(stage))
}

function migrarFluxoAntigoParaRelatoLivre(u) {
  if (!u || u.numeroCaso || !ehStageFluxoAntigo(u.stage)) return false
  logDebug(`[LEGADO] ${u.stage} -> ${STAGES.AUDIO_AGUARDANDO} | USER: ${u._numero || "-"}`)
  setStage(u, STAGES.AUDIO_AGUARDANDO)
  salvarEtapa(u._numero, STAGES.AUDIO_AGUARDANDO)
  u.lastPergunta = null
  u.lastPerguntaPayload = null
  u._stageRetomadaOriginal = null
  return true
}

function podeMostrarMenuCliente(u) {
  return Boolean(u?.numeroCaso) ||
    Boolean(Array.isArray(u?._casosDisponiveis) && u._casosDisponiveis.length)
}

function getNumeroCasoOficialDoNegocio(negocio) {
  return sanitizarTextoEntrada(negocio?.properties?.numero_de_caso) || null
}

async function avancarAposTelefoneConfirmado(from, u) {
  if (u.nomeConfirmado && u.nome) {
    iniciarTimer(from)
    return await flowAcolhimentoCidade(u, { from })
  }
  setStage(u, STAGES.ACOLHIMENTO_NOME)
  salvarEtapa(u._numero || from, STAGES.ACOLHIMENTO_NOME)
  iniciarTimer(from)
  await enviarAudioModoVoz(
    from,
    u,
    "Para continuar, me diga o nome completo da pessoa atendida. Pode falar em áudio ou digitar.",
    "telefone confirmado nome"
  )
  return { texto: "●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n😊 Para continuar, qual é o *nome completo* da pessoa atendida?", opcoes: null }
}

function retomarUltimaPergunta(u) {
  if (u.stage === STAGES.RETOMADA_AUTOMATICA) return null
  if (u.lastPerguntaPayload) return u.lastPerguntaPayload
  return null
}

function reapresentarPerguntaAtual(u) {
  return retomarUltimaPergunta(u)
}

async function perguntarNome(u) {
  const from = u._numero || ""
  if (u._vindoDeRetomada && !u.modoTexto && from) {
    u._vindoDeRetomada = false
    try {
      const textoRetomada = `Certo! Você estava na etapa de informar seu nome. Qual é o seu nome completo?`
      const ogg = await gerarAudioAtendente(u.atendente, textoRetomada)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 2000))
    } catch (e) { logErro("tts", "Falha áudio retomada nome", e) }
  }
  setStage(u, STAGES.ACOLHIMENTO_NOME)
  salvarEtapa(u._numero, "nome")
  return { texto: "●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n😊 Fico feliz em poder ajudar! Para começar, qual é o seu *nome completo*?", opcoes: null }
}

// Equivalente ao ACOLHIMENTO_NOME_CONTATO para o fluxo "para mim".
// Entra via ACOLHIMENTO_PARA_QUEM → "É para mim" e prepara o stage ACOLHIMENTO_NOME.
async function perguntarNomeProprio(from, u) {
  setStage(u, STAGES.ACOLHIMENTO_NOME)
  iniciarTimer(from)
  const audioNome = `Entendido! Vou registrar o caso em seu nome. Para comecar, qual e o seu nome completo? Pode falar em audio ou digitar.`
  if (!u.modoTexto) {
    try {
      const ogg = await gerarAudioAtendente(u.atendente, audioNome)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 3500))
    } catch (e) { logErro("tts", "Falha audio nome proprio", e) }
  }
  return {
    texto: `●●○○○○ 👤 Etapa 2 de 6 · *SEU NOME*\n\n🙋 *Atendimento para você*\n\nQual é o seu *nome completo*?\n\n_Digite ou envie um áudio com seu nome._ 🎙️`,
    opcoes: null
  }
}

function textoSolicitarNomeRepresentante() {
  return `●●○○○○ 👤 Etapa 2 de 6 · *SEU NOME*

👥 Você está abrindo um caso para outra pessoa.

⚠️ Agora preciso do seu nome, ou seja, da pessoa que está conversando conosco neste WhatsApp.

🎙️ Você pode digitar ou enviar um áudio.`
}

function textoConfirmarNomeRepresentante(representativeName) {
  return `●●○○○○ 👤 Etapa 2 de 6 · *SEU NOME*

👥 Você está abrindo um caso para outra pessoa.

✅ Entendi. Seu nome é ${representativeName}.

Está correto?

Se precisar corrigir, basta informar seu nome novamente por texto ou áudio. 🎙️`
}

function textoSolicitarNomePessoaAtendida(representativeName) {
  return `●●○○○○ 👤 Etapa 2 de 6 · *NOME DA PESSOA ATENDIDA*

✅ Ótimo, ${representativeName}!

Agora preciso do nome completo da pessoa para quem você está abrindo este atendimento.

🎙️ Você pode digitar ou enviar um áudio.`
}

function textoConfirmarNomePessoaAtendida(clientName) {
  return `●●○○○○ 👤 Etapa 2 de 6 · *NOME DA PESSOA ATENDIDA*

✅ O nome da pessoa atendida é ${clientName}.

Está correto?

Se precisar corrigir, basta informar o nome novamente por texto ou áudio. 🎙️`
}

function textoExplicarSituacaoTerceiro(clientName) {
  return `●●●○○○ 📝 Etapa 3 de 6 · *EXPLIQUE A SITUAÇÃO*

📝 Agora me conte o que está acontecendo com ${clientName}.

Quanto mais detalhes você puder informar, melhor poderemos entender o caso.

🎙️ Você pode enviar um áudio ou digitar sua mensagem.

⚖️ Essas informações serão organizadas para que o advogado já conheça o caso antes do atendimento.`
}

function audioSolicitarNomeRepresentante() {
  return "Você está abrindo um caso para outra pessoa. Agora preciso do seu nome, ou seja, da pessoa que está conversando conosco neste WhatsApp. Você pode digitar ou enviar um áudio."
}

function audioConfirmarNomeRepresentante(representativeName) {
  return `Você está abrindo um caso para outra pessoa. Entendi. Seu nome é ${representativeName}. Está correto? Se precisar corrigir, informe seu nome novamente por texto ou áudio. Se estiver correto, toque em Sim, está certo.`
}

function audioSolicitarNomePessoaAtendida(representativeName) {
  return `Ótimo, ${representativeName}! Agora preciso do nome completo da pessoa para quem você está abrindo este atendimento. Você pode digitar ou enviar um áudio.`
}

function audioConfirmarNomePessoaAtendida(clientName) {
  return `O nome da pessoa atendida é ${clientName}. Está correto? Se precisar corrigir, informe o nome novamente por texto ou áudio. Se estiver correto, toque em Sim, está certo.`
}

function audioExplicarSituacaoTerceiro(clientName) {
  return `Agora me conte o que está acontecendo com ${clientName}. Quanto mais detalhes você puder informar, melhor poderemos entender o caso. Você pode enviar um áudio ou digitar sua mensagem. Essas informações serão organizadas para que o advogado já conheça o caso antes do atendimento.`
}

// Pede o relato do caso após a coleta do(s) nome(s), antes de WhatsApp e cidade.
// Chamada quando o novo usuário veio pelo fluxo para_quem → nome(s) sem ter relatado ainda.
async function pedirRelatoAposNome(from, u) {
  // Quando atendimentoParaTerceiro: quem está no WhatsApp é u.nomeContato (ex: José),
  // quem vai ser atendido é u.nome (ex: Alberina).
  // A saudação é para quem está no WhatsApp; o "alvo" do relato é quem vai ser atendido.
  const primeiroNomeWhats = u.atendimentoParaTerceiro
    ? (u.nomeContato ? u.nomeContato.split(" ")[0] : "")
    : (primeiroNomeCliente(u) || "")
  const saudacao = primeiroNomeWhats ? `, ${primeiroNomeWhats}` : ""

  const primeiroNomeAtendido = u.atendimentoParaTerceiro
    ? (u.nome ? u.nome.split(" ")[0] : "a pessoa atendida")
    : null

  const alvoAudio = u.atendimentoParaTerceiro
    ? `o que está acontecendo com ${primeiroNomeAtendido}`
    : "a sua situação"

  // Sinalizar que o nome já foi coletado e confirmado neste fluxo,
  // para que proximaConfirmacaoProgressiva não o reclame.
  u._revalidandoCampos = true
  u._aguardandoRelatoAposNome = true
  if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
  if (!u._revalidaConfirmados.includes("nome")) u._revalidaConfirmados.push("nome")

  setStage(u, STAGES.AUDIO_AGUARDANDO)
  iniciarTimer(from)

  if (!u.modoTexto) {
    try {
      const textoAudioRelato = u.atendimentoParaTerceiro
        ? audioExplicarSituacaoTerceiro(primeiroNomeAtendido)
        : `Entendido${saudacao}! Agora me conta ${alvoAudio}. Pode falar em áudio ou digitar, do jeito que for mais fácil para você.`
      const ogg = await gerarAudioAtendente(u.atendente, textoAudioRelato)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 4000))
    } catch (e) { logErro("tts", "Falha áudio relato pós-nome", e) }
  }

  const textoAlvoTela = u.atendimentoParaTerceiro
    ? `o que está acontecendo com *${primeiroNomeAtendido}*`
    : "a *sua situação*"

  const textoRelato = u.atendimentoParaTerceiro
    ? textoExplicarSituacaoTerceiro(primeiroNomeAtendido)
    : `●●●○○○ 📝 *Etapa 3 de 6 · EXPLIQUE A SITUAÇÃO*\n\n📝 *Agora me conta o caso${saudacao}*\n\nMe conta ${textoAlvoTela} com detalhes.\n\nPode falar em áudio 🎙️ ou digitar 💬, do jeito que for mais fácil pra você.\n\n_Vou preparar tudo para o advogado já chegar pronto para te atender._ ⚖️`

  if (process.env.IMAGEM_RELATO_URL) {
    try {
      const enviada = await enviarImagemWhatsApp(from, process.env.IMAGEM_RELATO_URL, textoRelato, null)
      if (enviada) return { texto: null, opcoes: null }
    } catch (e) { logErro("imagem", "Falha ao enviar imagem relato pós-nome", e) }
  }

  return { texto: textoRelato, opcoes: null }
}

function perguntarCidade(u, stage = null) {
  const stageCidade = stage || STAGES.ACOLHIMENTO_CIDADE
  setStage(u, stageCidade)
  salvarEtapa(u._numero, "acolhimento_cidade")
  const primeiroNomeAtendido = u.atendimentoParaTerceiro && u.nome ? u.nome.split(" ")[0] : null
  const textoCidade = primeiroNomeAtendido
    ? `Em qual *cidade* ${primeiroNomeAtendido} mora?\n\nSe preferir, pode informar o *CEP* também.`
    : `Em qual *cidade* você mora?\n\nSe preferir, pode informar o *CEP* também.`
  return { texto: `●●●●●○ 📍 Etapa 5 de 6 · *CIDADE*\n\n${textoCidade}`, opcoes: null }
}

function perguntarDescricao(u, stage = STAGES.COLETA_DESC_AUDIO) {
  entrarEtapaDescricao(u, stage)
  salvarEtapa(u._numero, "descricao_caso")
  return telaDescreverCaso()
}

async function perguntarDocumentos(from, u) {
  salvarEtapa(u._numero, "documentos")
  setStage(u, STAGES.CLIENTE)
  garantirListasDocumentos(u)
  u.docAtualIdx = u.docAtualIdx || 0
  u._docsClienteGuiado = false
  await enviarIntroDocumentos(from, u)
  return null
}

async function enviarTelaDocumentosCaso(from, u) {
  salvarEtapa(u._numero, "documentos")
  setStage(u, STAGES.CLIENTE)
  garantirListasDocumentos(u)
  u.docAtualIdx = u.docAtualIdx || 0
  u._docsClienteGuiado = true
  const tela = telaEnvioDoc(u, enviarOpcoesPadrao)
  await enviarGuiaDocs(from, u, tela)
  return null
}

function respostaRecomecoMenuPrincipal(u) {
  const primeiroNome = primeiroNomeCliente(u) || ""
  const saudacao = primeiroNome ? `, ${primeiroNome}` : ""
  setStage(u, STAGES.AUDIO_AGUARDANDO)
  return {
    texto: `Tudo bem${saudacao} 🙂\n\nVamos recomeçar com calma.\n\nPode me contar sua situação novamente${u?.modoTexto ? " por texto" : " por áudio ou texto"}. Estou aqui para ajudar você.`,
    opcoes: null
  }
}

async function iniciarFluxoRelatoLivre(from, u, { boasVindas = true } = {}) {
  if (!u.atendente) u.atendente = sortearAtendente()
  setStage(u, STAGES.AUDIO_AGUARDANDO)
  iniciarTimer(from)

  if (boasVindas) {
    try {
      const textoBoasVindas = `Olá 😊\n\nSeja bem-vindo(a) à *Oráculum Advocacia.* Eu sou *${u.atendente}* e vou acompanhar este atendimento.\n\nFarei algumas perguntas para preparar seu caso. Ao final, você poderá falar com um advogado.\n\nVocê pode digitar *recomeçar* ou *encerrar* a qualquer momento.\n\n_Seus dados são tratados com sigilo e usados exclusivamente para fins jurídicos, conforme a LGPD._`
      const imagemUrl = IMAGEM_BOAS_VINDAS_URL
      const enviada = await enviarImagemWhatsApp(from, imagemUrl, textoBoasVindas)
      if (!enviada) await enviar(from, textoBoasVindas)
    } catch (e) {
      logErro("boas-vindas", "Falha ao enviar imagem de boas-vindas", e)
      await enviar(from, `Olá 😊\n\nSeja bem-vindo(a) à *Oráculum Advocacia.* Eu sou *${u.atendente}* e vou acompanhar este atendimento.\n\nFarei algumas perguntas para preparar seu caso. Ao final, você poderá falar com um advogado.\n\nVocê pode digitar *recomeçar* ou *encerrar* a qualquer momento.\n\n_Seus dados são tratados com sigilo e usados exclusivamente para fins jurídicos, conforme a LGPD._`)
    }
  }

  // Após as boas-vindas, pergunta o modo de atendimento preferido (etapa 1 de 6)
  return await telaEscolhaModo(from, u, { comBoasVindas: boasVindas })
}


function deveCapturarLeadIncompleto(u) {
  if (u?.leadIncompletoCapturado) return false
  if (u?.numeroCaso) return false
  // Não capturar lead se ainda está no fluxo inicial (antes de qualquer interação relevante)
  const stagesIniciais = new Set([
    "audio_processando", "audio_confirmar_transcricao",
    "audio_confirmar_area_canal", "escolha_canal",
    "acolhimento"
    // audio_aguardando e assessoria_inicial removidos:
    // usuario que chegou ate esses stages ja relatou e tem dados capturáveis
  ])
  if (stagesIniciais.has(String(u?.stage || "").toLowerCase())) return false
  // não bloquear captura por ausência de nome —
  // o fallback "Lead WhatsApp" é aplicado em capturarLeadIncompleto
  return true
}

async function pularDescricaoPorAgora(from, u) {
  u.jaIncentivouDescricao = true
  salvarEtapa(u._numero, "descricao_caso")
  u._descTemp = null
  u._audioDescBuffer = null
  u._audioDescMime = null
  u._audioDescNome = null

  if (u._descOrigemStage === "trab_out_desc" || u._descOrigemStage === "out_desc" || u.stage === "trab_out_desc" || u.stage === "out_desc") {
    u._descOrigemStage = null
    setStage(u, "gatilho")
    iniciarTimer(from)
    return {
      texto: "Sem problemas 😊 podemos continuar e você envia depois",
      opcoes: [{ id: "cont", title: "▶️ Continuar" }]
    }
  }

  if (u._proximoStageAposDescricao) {
    const proximoStage = u._proximoStageAposDescricao
    const proximaPergunta = u._proximaPerguntaAposDescricao
    u._proximoStageAposDescricao = null
    u._proximaPerguntaAposDescricao = null
    u._descOrigemStage = null
    setStage(u, proximoStage)
    iniciarTimer(from)
    if (proximoStage === STAGES.CONFIRMACAO) {
      await sincronizarNegocio(u)
      const tela = await telaConfirmacaoComImagem(from, u)
      return { texto: `Sem problemas 😊 podemos continuar e você envia depois\n\n${tela.texto}`, opcoes: tela.opcoes }
    }
    if (proximaPergunta) {
      return { texto: `Sem problemas 😊 podemos continuar e você envia depois\n\n${proximaPergunta.texto}`, opcoes: proximaPergunta.opcoes || null }
    }
  }

  u._descOrigemStage = null
  setStage(u, STAGES.CONFIRMACAO)
  iniciarTimer(from)
  await sincronizarNegocio(u)
  const tela = await telaConfirmacaoComImagem(from, u)
      return { texto: `Sem problemas 😊 podemos continuar e você envia depois\n\n${tela.texto}`, opcoes: tela.opcoes }
}

function ehStageDescricaoCaso(stage) {
  return [STAGES.COLETA_DESC, STAGES.COLETA_DESC_AUDIO, "trab_out_desc", "out_desc"].includes(stage)
}

function entrarEtapaDescricao(u, stage = STAGES.COLETA_DESC_AUDIO) {
  setStage(u, stage)
  salvarEtapa(u._numero, "descricao_caso")
  u.jaIncentivouDescricao = false
}

function limparTimer(u) {
  if (u.timer) { clearTimeout(u.timer); u.timer = null }
}

function limparTimerIncentivoDescricao(u) {
  if (u?.timerIncentivoDescricao) {
    clearTimeout(u.timerIncentivoDescricao)
    u.timerIncentivoDescricao = null
  }
}

function executarCallbackTimerUsuario(from, estadoEsperado, ultimaMsgEsperada, contexto, tarefa) {
  executarComLockUsuario(from, () => {
    if (users[from] !== estadoEsperado) return null
    if (Number(estadoEsperado?.ultimaMsg || 0) !== ultimaMsgEsperada) return null
    return tarefa()
  }).catch(err => {
    logErro("timer_usuario", `Falha no timer ${contexto} | USER: ${sanitizarTextoEntrada(from) || "-"}`, err)
  })
}

function agendarIncentivoDescricao(from) {
  const u = users[from]
  if (!u) return

  limparTimerIncentivoDescricao(u)

  if (obterEtapaSegura(u._numero) !== "descricao_caso") return
  if (!ehStageDescricaoCaso(u.stage)) return
  if (u.jaIncentivouDescricao) return

  const ultimaMsgBase = Number(u.ultimaMsg || 0)
  const espera = u.modoDigitando ? 3 * 60 * 1000 : 2 * 60 * 1000

  u.timerIncentivoDescricao = setTimeout(() => executarCallbackTimerUsuario(from, u, ultimaMsgBase, "incentivo_descricao", async () => {
    const atual = users[from]
    if (!atual) return
    if (obterEtapaSegura(atual._numero) !== "descricao_caso") return
    if (!ehStageDescricaoCaso(atual.stage)) return
    if (atual.jaIncentivouDescricao) return
    if (Number(atual.ultimaMsg || 0) !== ultimaMsgBase) return

    atual.jaIncentivouDescricao = true
    atual.timerIncentivoDescricao = null
    atual.aguardandoResposta = true
    agendarPersistenciaUsers()

    // Áudio no incentivo de descrição se modo voz
    const textoIncentivo = `Posso te ajudar nisso. Se preferir, pode mandar um áudio ou escrever do seu jeito. Quer continuar agora ou prefere fazer isso depois?`
    if (!atual.modoTexto && atual.atendente) {
      try {
        const ogg = await gerarAudioAtendente(atual.atendente, textoIncentivo)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 2000))
      } catch (e) { logErro("tts", "Falha áudio incentivo descrição", e) }
    }
    await enviar(
      from,
      "Posso te ajudar nisso 😊\nSe preferir, pode mandar um áudio ou escrever do seu jeito.\n\nQuer continuar agora ou prefere fazer isso depois?",
      [
        { id: "desc_incentivo_continuar", title: "▶️ Continuar agora" },
        { id: "desc_incentivo_depois",    title: "⏭️ Enviar depois" },
        { id: "desc_incentivo_menu",      title: "🏠 Menu do cliente" },
        { id: "desc_incentivo_encerrar",  title: "👋 Encerrar" }
      ],
      false
    )
  }), espera)
}

function iniciarTimer(from) {
  const u = users[from]
  if (!u) return
  limparTimer(u)

  if (u.numeroCaso) {
    const ultimaMsgBase = Number(u.ultimaMsg || 0)
    u.timer = setTimeout(() => executarCallbackTimerUsuario(from, u, ultimaMsgBase, "cliente_inatividade", () => {
      const atual = users[from]
      if (!atual) return
      atual.aguardandoResposta = false
      atual.aguardandoRetomada = false
      atual.modoDigitando = false
      atual.timer = null
      agendarPersistenciaUsers()
    }), 30 * 60 * 1000)
    return
  }

  agendarIncentivoDescricao(from)

  // Para clientes com sofrimento detectado: pausa em 10 min (dobro) + abandono em 20 min.
  // Razão: a pessoa pode precisar de mais tempo para se organizar emocionalmente
  // sem sentir que o atendimento foi encerrado por falta de resposta rápida.
  const temSofrimentoAtivo = u._jaAcolheuSofrimento === true
  const t1 = (temSofrimentoAtivo ? 10 : 5) * 60 * 1000 + (u.modoDigitando ? 3 * 60 * 1000 : 0)
  const t2 = (temSofrimentoAtivo ? 20 : 10) * 60 * 1000

  if (!AUTO_REENGAJAMENTO) {
    const ultimaMsgBase = Number(u.ultimaMsg || 0)
    u.timer = setTimeout(() => executarCallbackTimerUsuario(from, u, ultimaMsgBase, "lead_inatividade", () => {
      const atual = users[from]
      if (!atual) return
      atual.aguardandoResposta = false
      atual.aguardandoRetomada = false
      atual.modoDigitando = false
      atual.timer = null
      agendarPersistenciaUsers()
    }), t1 + t2)
    return
  }

  const ultimaMsgBase = Number(u.ultimaMsg || 0)
  u.timer = setTimeout(() => executarCallbackTimerUsuario(from, u, ultimaMsgBase, "reengajamento", async () => {
    if (!users[from]) return
    if (u.modoDigitando) {
      u.modoDigitando = false
      iniciarTimer(from)
      return
    }

    if (u._casoAnteriorCliente && !u.numeroCaso) {
      const primeiroNomePausaTerceiro = primeiroNomeCliente(u._casoAnteriorCliente) || ""
      const saudacaoPausaTerceiro = primeiroNomePausaTerceiro ? `, ${primeiroNomePausaTerceiro}` : ""
      const textoPausaTerceiro = `Oi${saudacaoPausaTerceiro}. A abertura do caso para outra pessoa ficou pausada. Você quer continuar de onde parou ou cancelar e voltar ao seu menu?`
      if (!u.modoTexto && u.atendente) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, textoPausaTerceiro)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 2000))
        } catch (e) { logErro("tts", "Falha áudio pausa terceiro", e) }
      }
      const _labelCancelarTimer = "🏠 Meu menu"
      await enviar(from, `🕒 *Abertura de caso pausada*\n\nOi${saudacaoPausaTerceiro} 😊\n\nVocê estava abrindo um atendimento para outra pessoa.\n\nComo deseja continuar?`, [
        { id: "cont_retomar", title: "▶️ Continuar" },
      { id: "terceiro_cancelar_menu", title: _labelCancelarTimer },
      { id: "m_encerrar", title: "👋 Encerrar" }
      ], false)

      u.aguardandoResposta = true
      u.aguardandoRetomada = true

      const ultimaMsgAbandonoTerceiro = Number(u.ultimaMsg || 0)
      u.timer = setTimeout(() => executarCallbackTimerUsuario(from, u, ultimaMsgAbandonoTerceiro, "abandono_terceiro", async () => {
        if (!users[from]) return
        if (u.modoDigitando) u.modoDigitando = false
        u.aguardandoRetomada = false
        u.aguardandoResposta = false
        const resposta = await cancelarNovoCasoClienteEVoltarMenu(from, u, "inatividade")
        if (resposta) await enviar(from, resposta.texto, resposta.opcoes || null, false)
        agendarPersistenciaUsers()
      }), t2)
      return
    }

    // Mensagem de pausa — diferenciada se sofrimento foi detectado nesta sessão
    const primeiroNomePausa = primeiroNomeCliente(u) || ""
    const saudacaoPausa = primeiroNomePausa ? `, ${primeiroNomePausa}` : ""
    const pausaComSofrimento = u._jaAcolheuSofrimento === true
    const textoPausa = pausaComSofrimento
      ? `Oi${saudacaoPausa}, estou por aqui. Sei que o que você me contou é difícil. Seu atendimento ficou salvo. Quando quiser continuar, é só me chamar.`
      : `Oi${saudacaoPausa} 😊 Fiquei te esperando. Seu progresso está salvo. Como deseja continuar?`
    const textoTelaPausa = pausaComSofrimento
      ? `💙 *Aqui quando você precisar*\n\nOi${saudacaoPausa}. Estou por aqui.\n\n_Sei que o que você me contou é difícil. Seu atendimento ficou salvo. Continue quando se sentir pronto._\n\nComo deseja continuar?`
      : `🕒 *Atendimento pausado*\n\nOi${saudacaoPausa} 😊 Fiquei te esperando.\n\n📌 Seu progresso está salvo.\n\nComo deseja continuar?`
    if (!u.modoTexto && u.atendente) {
      try {
        const ogg = await gerarAudioAtendente(u.atendente, textoPausa)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 2000))
      } catch (e) { logErro("tts", "Falha áudio pausa", e) }
    }
    await enviar(from, textoTelaPausa, [
        { id: "cont_retomar", title: "▶️ Continuar" },
      { id: "recomecar",    title: "🔄 Recomeçar" },
      { id: "m_encerrar", title: "👋 Encerrar" }
    ], false)

    // salvar o stage exato do momento da pausa para que cont_retomar
    // restaure o stage correto (ex: AUDIO_AGUARDANDO) e não apenas o payload visual
    u._stageRetomadaOriginal = u.stage
    u.aguardandoResposta = true
    u.aguardandoRetomada = true

    const ultimaMsgAbandono = Number(u.ultimaMsg || 0)
    u.timer = setTimeout(() => executarCallbackTimerUsuario(from, u, ultimaMsgAbandono, "abandono", async () => {
      if (!users[from]) return
      if (u.modoDigitando) u.modoDigitando = false

      u.aguardandoRetomada = false
      u.aguardandoResposta = false

      // Mensagem de abandono — diferenciada se sofrimento foi detectado nesta sessão
      const primeiroNomeAb = primeiroNomeCliente(u) || ""
      const saudacaoAb = primeiroNomeAb ? `, ${primeiroNomeAb}` : ""
      const abandonoComSofrimento = u._jaAcolheuSofrimento === true
      const textoAbandono = abandonoComSofrimento
        ? `Tudo bem${saudacaoAb}. Vou ficar por aqui. Quando você estiver pronto para continuar, é só me chamar. Cuide-se.`
        : `Tudo bem${saudacaoAb}. Vou pausar por agora. Quando quiser continuar, é só me chamar aqui. Estou à disposição. 😊`
      const textoTelaAbandono = abandonoComSofrimento
        ? `💙 Tudo bem${saudacaoAb}.\n\nFico por aqui. Quando você estiver pronto para continuar, é só me chamar.\n\n_Cuide-se._`
        : `Tudo bem${saudacaoAb}. Vou pausar por agora. 😊\n\nQuando quiser continuar, é só me chamar aqui. Estou à disposição!`
      if (!u.modoTexto && u.atendente) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, textoAbandono)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 2000))
        } catch (e) { logErro("tts", "Falha áudio abandono", e) }
      }
      await enviar(from, textoTelaAbandono, null, false)

      await capturarLeadIncompleto(from, u)
      limparDadosCasoAtual(u, { preservarNome: false, marcarFluxoEncerrado: true })
      agendarPersistenciaUsers()
    }), t2)
  }), t1)
}

function restaurarTimersPersistidos() {
  const agora = Date.now()
  let restaurados = 0

  for (const [from, u] of Object.entries(users)) {
    if (!u || u._fluxoEncerrado) continue
    u._numero = from
    limparTimer(u)
    limparTimerIncentivoDescricao(u)

    const ultimaMsg = Number(u.ultimaMsg || 0)
    const idade = ultimaMsg ? agora - ultimaMsg : Infinity
    const janelaRecente = u.numeroCaso ? 30 * 60 * 1000 : 15 * 60 * 1000
    if (idade > janelaRecente) continue

    iniciarTimer(from)
    restaurados++
  }

  if (restaurados) logDebug(`[PERSISTENCIA] ${restaurados} timer(s) restaurado(s)`)
}

const UF_MAP = {
  uf_ac:"AC", uf_al:"AL", uf_am:"AM", uf_ap:"AP", uf_ba:"BA", uf_ce:"CE",
  uf_df:"DF", uf_es:"ES", uf_go:"GO", uf_ma:"MA", uf_mg:"MG", uf_ms:"MS",
  uf_mt:"MT", uf_pa:"PA", uf_pb:"PB", uf_pe:"PE", uf_pi:"PI", uf_pr:"PR",
  uf_rj:"RJ", uf_rn:"RN", uf_ro:"RO", uf_rr:"RR", uf_rs:"RS", uf_sc:"SC",
  uf_se:"SE", uf_sp:"SP", uf_to:"TO"
}
const REGIOES = {
  reg_n:  { label:"Norte",        ufs:[["uf_ac","AC"],["uf_am","AM"],["uf_ap","AP"],["uf_pa","PA"],["uf_ro","RO"],["uf_rr","RR"],["uf_to","TO"]] },
  reg_ne: { label:"Nordeste",     ufs:[["uf_al","AL"],["uf_ba","BA"],["uf_ce","CE"],["uf_ma","MA"],["uf_pb","PB"],["uf_pe","PE"],["uf_pi","PI"],["uf_rn","RN"],["uf_se","SE"]] },
  reg_co: { label:"Centro-Oeste", ufs:[["uf_df","DF"],["uf_go","GO"],["uf_ms","MS"],["uf_mt","MT"]] },
  reg_se: { label:"Sudeste",      ufs:[["uf_es","ES"],["uf_mg","MG"],["uf_rj","RJ"],["uf_sp","SP"]] },
  reg_s:  { label:"Sul",          ufs:[["uf_pr","PR"],["uf_rs","RS"],["uf_sc","SC"]] }
}
function telaRegioes() {
  return { texto:"🗺️ *Selecione sua região no Brasil*", opcoes:[
    { id:"reg_n", title:"🌳 Norte" }, { id:"reg_ne", title:"☀️ Nordeste" },
    { id:"reg_co", title:"🌾 Centro-Oeste" }, { id:"reg_se", title:"🏙️ Sudeste" },
    { id:"reg_s", title:"🌲 Sul" }
  ]}
}
function telaUFsRegiao(regId) {
  const reg = REGIOES[regId]
  if (!reg) return telaRegioes()
  return { texto: `📍 *${reg.label}*\n\nEscolha seu estado:`, opcoes: reg.ufs.map(([id,title]) => ({ id, title: `📍 ${title}` })) }
}

function criarCtx({ from = "", nomeWA = "", text = "", msgObj = null, buttonId = "", tipo = "", ehAudio = false, ehDoc = false, timestamp = Date.now() } = {}) {
  return {
    from: sanitizarTextoEntrada(from),
    nomeWA: sanitizarTextoEntrada(nomeWA),
    text: String(text ?? "").trim(),
    msgObj,
    buttonId: sanitizarTextoEntrada(buttonId),
    isAudio: ehAudio,
    isImage: sanitizarTextoEntrada(tipo) === "image",
    messageId: sanitizarTextoEntrada(msgObj?.id),
    timestamp
  }
}

// ================================================================
//  SERVICES (IA, áudio, integrações)
// ================================================================

const hubspotClient = {
  crm: {
    deals: {
      basicApi: {
        update: async (dealId, body) => {
          const stageId = body?.properties?.dealstage
          logDebug("Mudando etapa para:", stageId)
          return axios.patch(
            `https://api.hubapi.com/crm/v3/objects/deals/${dealId}`,
            body,
            { headers: HS() }
          )
        }
      }
    }
  }
}
configurarHubSpotSync({
  HUBSPOT_TOKEN,
  HS_STAGE,
  hubspotClient,
  getHubSpotDealProps,
  getHubSpotDealStateProps,
  getNomeDeal,
  mapearStageParaDealstage,
  getNumeroCasoOficialDoNegocio,
  restaurarTipoCasoHubSpot,
  etapaValida,
  serializarEstado,
  desserializarEstado,
  hidratarUsuarioPersistido
})

function textoOuTraco(valor) {
  return sanitizarTextoEntrada(valor) || "-"
}

function resumoFatosJuridico(u = {}, briefing = gerarBriefingCaso(u)) {
  const area = textoOuTraco(briefing.area)
  const situacao = formatarSituacaoJuridica(briefing.situacao, u.tipo, u.subTipo)
  const cidade = textoOuTraco(briefing.cidade)
  const relato = textoOuTraco(briefing.relato)
  return `Caso de ${area}, em ${cidade}. Situacao informada: ${textoOuTraco(situacao)}. Relato-base: ${relato}`
}

function pedidoClienteJuridico(u = {}, briefing = gerarBriefingCaso(u)) {
  const relato = normalizarTextoGatilho([
    briefing.relato,
    u.descricao,
    u._audioCanalTranscricao,
    u.assuntoResumo,
    u.situacao,
    u.detalhe
  ].filter(Boolean).join(" "))

  if (/\b(aposentadoria|bpc|beneficio|inss|auxilio|pericia)\b/.test(relato)) {
    return "Analisar beneficio previdenciario e orientar providencias/documentos."
  }
  if (/\b(demissao|verbas|salario|fgts|rescisao|trabalho|emprego|assedi)\b/.test(relato)) {
    return "Avaliar direitos trabalhistas, valores pendentes e proxima medida."
  }
  if (/\b(pensao|guarda|divorcio|alimentos|filho|familia)\b/.test(relato)) {
    return "Avaliar medida familiar cabivel e documentos para analise."
  }
  if (/\b(divida|cobranca|produto|servico|banco|negativacao|consumidor)\b/.test(relato)) {
    return "Analisar relacao de consumo, provas e possibilidade de solucao."
  }
  if (/\b(despejo|aluguel|imovel|locacao|posse|condominio)\b/.test(relato)) {
    return "Avaliar situacao imobiliaria, risco imediato e documentos do imovel."
  }
  return "Analisar viabilidade juridica e orientar os proximos passos."
}

function riscoPrazoJuridico(u = {}, briefing = gerarBriefingCaso(u)) {
  const urgencia = u.urgencia || briefing.urgencia || "normal"
  const emocional = briefing.scoreEmocional?.nivel || "baixo"
  if (urgencia === "alta") return "Prioridade alta. Verificar prazo, risco imediato e necessidade de resposta humana rapida."
  if (emocional === "alto") return "Risco emocional alto. Recomendada revisao humana cuidadosa mesmo sem prazo confirmado."
  if (briefing.consultaAtiva) return "Consulta ativa. Conferir pauta e documentos antes do atendimento."
  return "Sem prazo critico confirmado no pre-atendimento. Revisar documentos e validar viabilidade."
}

function documentosEssenciaisJuridico(briefing = {}) {
  const faltantes = briefing.documentos?.faltantesCriticos || []
  if (!faltantes.length) return "Nenhum documento critico pendente no checklist atual."
  const lista = faltantes.slice(0, 5).join(", ")
  return faltantes.length > 5 ? `${lista} e outros ${faltantes.length - 5}.` : lista
}

function proximaEtapaConfirmacao(u = {}, briefing = gerarBriefingCaso(u)) {
  if (u.urgencia === "alta") return "nossa equipe sera avisada para priorizar a analise inicial"
  if ((briefing.documentos?.faltantesCriticos || []).length > 0) return "o caso sera registrado e voce podera enviar os documentos por aqui"
  return "o caso sera registrado oficialmente para analise da equipe"
}

// Estágios considerados "finalizados" no HubSpot — negócios nesses estágios são ignorados


function calcularStageAposAgendamento(u) {
  const statusDocs = calcularStatusDocumentos(u)
  const recebeuAlgumDocumento = Boolean(u?.documentosEnviados) || statusDocs.recebidos.length > 0
  if (!recebeuAlgumDocumento) return HS_STAGE.ANALISE
  if (statusDocs.faltantesCriticos.length > 0) return HS_STAGE.AGUARDANDO_DOCS
  return HS_STAGE.DOCS
}

async function atualizarEstadoConsultaUsuario(u) {
  if (!u) return { status: "sem_consulta", fonte: "sem_usuario" }
  const estado = await getConsultaView(u.negocioId)
  u.consultaStatus = estado.status
  u._consultaEstadoFonte = estado.fonte || null
  u._consultaInicio = estado.inicio || null
  u._consultaFim = estado.fim || null
  return estado
}

async function localizarUsuarioAgendamento({ eventId = "", dealId = "", phone = "" } = {}) {
  const evento = sanitizarTextoEntrada(eventId)
  let negocio = sanitizarTextoEntrada(dealId)
  const numero = normalizarNumeroWhatsAppEnvio(phone)
  if (!negocio && evento) {
    const estadoEvento = await getConsultaCalendarEventState(evento)
    negocio = sanitizarTextoEntrada(estadoEvento?.metadata?.dealId)
  }

  for (const [from, u] of Object.entries(users)) {
    if (negocio && String(u?.negocioId || "") === negocio) return { from, u }
    if (numero && normalizarNumeroWhatsAppEnvio(from) === numero) return { from, u }
    if (numero && normalizarNumeroWhatsAppEnvio(u?.whatsappContato) === numero) return { from, u }
  }

  return { from: null, u: null }
}

function localizarUsuarioReengajamento({ dealId = "", phone = "" } = {}) {
  const negocio = sanitizarTextoEntrada(dealId)
  const numero = normalizarNumeroWhatsAppEnvio(phone)

  for (const [from, u] of Object.entries(users)) {
    if (negocio && String(u?.negocioId || "") === negocio) return { from, u }
    if (numero && normalizarNumeroWhatsAppEnvio(from) === numero) return { from, u }
    if (numero && normalizarNumeroWhatsAppEnvio(u?._numero) === numero) return { from, u }
    if (numero && normalizarNumeroWhatsAppEnvio(u?.phone) === numero) return { from, u }
    if (numero && normalizarNumeroWhatsAppEnvio(u?.telefone) === numero) return { from, u }
    if (numero && normalizarNumeroWhatsAppEnvio(u?.whatsappContato) === numero) return { from, u }
  }

  return { from: null, u: null }
}

function telefoneCandidatoReengajamento(from, usuario = {}) {
  for (const valor of [
    from ||
    null,
    usuario?._numero,
    usuario?.phone,
    usuario?.telefone,
    usuario?.whatsapp,
    usuario?.whatsappContato,
    usuario?.numero
  ]) {
    const normalizado = normalizarNumeroWhatsAppEnvio(valor)
    if (normalizado) return normalizado
  }
  return ""
}

function candidateReasonsReengajamento(usuario = {}) {
  const reasons = []
  if (sanitizarTextoEntrada(usuario?.numeroCaso)) reasons.push("possui_numero_caso")
  else reasons.push("sem_numero_caso")
  if (sanitizarTextoEntrada(usuario?.negocioId)) reasons.push("possui_deal")
  else reasons.push("sem_deal")
  if (Array.isArray(usuario?.docsAusentes) && usuario.docsAusentes.length > 0) reasons.push("docs_ausentes")
  if (Array.isArray(usuario?.docsParciais) && usuario.docsParciais.length > 0) reasons.push("docs_parciais")
  if (sanitizarTextoEntrada(usuario?.consultaStatus) === "nao_compareceu") reasons.push("consulta_no_show")
  if (sanitizarTextoEntrada(usuario?.consultaStatus) === "sem_consulta") reasons.push("sem_consulta")
  if (usuario?.leadIncompletoCapturado === true) reasons.push("lead_incompleto_capturado")
  if (sanitizarTextoEntrada(usuario?.stage)) reasons.push(`stage:${sanitizarTextoEntrada(usuario.stage)}`)
  if (usuario?.ultimaMsg) reasons.push("possui_ultima_msg")
  return reasons
}

function montarCandidatoReengajamento(from, usuario = {}, source = "memory") {
  const phone = telefoneCandidatoReengajamento(from, usuario)
  if (!phone) return null
  if (usuario?.encerrado === true || usuario?.optOut === true || usuario?._fluxoEncerrado === true) return null

  return {
    phone,
    dealId: sanitizarTextoEntrada(usuario?.negocioId) || null,
    contactId: sanitizarTextoEntrada(usuario?.contatoId) || null,
    numeroCaso: sanitizarTextoEntrada(usuario?.numeroCaso) || null,
    source,
    candidateReasons: candidateReasonsReengajamento(usuario)
  }
}

function adicionarCandidatoReengajamento(candidatos, vistos, from, usuario, source) {
  const candidato = montarCandidatoReengajamento(from, usuario, source)
  if (!candidato) return
  const chave = candidato.phone || (candidato.dealId ? `deal:${candidato.dealId}` : "")
  if (!chave || vistos.has(chave)) return
  vistos.add(chave)
  candidatos.push(candidato)
}

function lerUsersPersistidosParaReengajamento() {
  try {
    if (!fs.existsSync(USERS_STATE_FILE)) return {}
    const raw = fs.readFileSync(USERS_STATE_FILE, "utf8")
    if (!raw.trim()) return {}
    const parsed = JSON.parse(raw)
    return parsed?.users && typeof parsed.users === "object" ? parsed.users : {}
  } catch (e) {
    logErro("reengagement-candidates", "Falha ao ler users persistidos: " + e.message, e)
    return {}
  }
}

function descobrirCandidatosReengajamento() {
  const candidatos = []
  const vistos = new Set()

  for (const [from, usuario] of Object.entries(users)) {
    adicionarCandidatoReengajamento(candidatos, vistos, from, usuario, "memory")
  }

  for (const [from, usuario] of Object.entries(lerUsersPersistidosParaReengajamento())) {
    adicionarCandidatoReengajamento(candidatos, vistos, from, usuario, "persisted_state")
  }

  return candidatos
}

function criarContextoReengajamentoTemplate({ tipoEvento, jobId, dealId, numeroCaso, scheduledFor }) {
  return {
    tipo: "template_reengajamento",
    origem: "meta_template",
    entidade: {
      jobId: jobId || null,
      dealId: dealId || null,
      casoId: numeroCaso || dealId || null
    },
    acaoEsperada: "retomada_atendimento",
    dados: {
      tipoEvento: tipoEvento || null,
      scheduledFor: scheduledFor || null
    },
    expiracao: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  }
}

function validarJanelaEnvioReengajamento(scheduledFor, agora = Date.now()) {
  const agendado = new Date(scheduledFor || "")
  if (isNaN(agendado.getTime())) return { ok: false, motivo: "scheduledFor_invalido" }

  const toleranciaAntecipacaoMs = 60 * 1000
  if (agora + toleranciaAntecipacaoMs < agendado.getTime()) {
    return {
      ok: false,
      motivo: "reengajamento_antecipado",
      scheduledFor: agendado.toISOString()
    }
  }

  return { ok: true, alvo: agendado }
}

function validarScheduledForReengajamento(scheduledForRecebido, scheduledForPlanejado) {
  const recebido = new Date(scheduledForRecebido || "")
  const planejado = new Date(scheduledForPlanejado || "")
  if (isNaN(recebido.getTime()) || isNaN(planejado.getTime())) {
    return { ok: false, motivo: "scheduledFor_invalido" }
  }

  const diferencaMs = Math.abs(recebido.getTime() - planejado.getTime())
  if (diferencaMs > REENGAGEMENT_SCHEDULE_TOLERANCE_MS) {
    return {
      ok: false,
      motivo: "scheduledFor_divergente",
      diferencaMs,
      toleranciaMs: REENGAGEMENT_SCHEDULE_TOLERANCE_MS
    }
  }

  return { ok: true, diferencaMs, toleranciaMs: REENGAGEMENT_SCHEDULE_TOLERANCE_MS }
}

function validarExpiracaoReengajamento(scheduledFor, agora = Date.now()) {
  const agendado = new Date(scheduledFor || "")
  if (isNaN(agendado.getTime())) return { ok: false, motivo: "scheduledFor_invalido" }

  const atrasoMs = agora - agendado.getTime()
  const maxDelayMs = REENGAGEMENT_MAX_DELAY_HOURS * 60 * 60 * 1000
  if (atrasoMs > maxDelayMs) {
    return {
      ok: false,
      motivo: "job_expirado",
      atrasoMs,
      maxDelayMs
    }
  }

  return { ok: true, atrasoMs, maxDelayMs }
}

async function enviarJobReengajamento(numero, usuario, job, contextoConversa) {
  const options = {
    usuario,
    contextoConversa,
    requireContextoConversa: true,
    forceTemplate: true
  }

  if (job.template === "retomada_atendimento") {
    return templateService.retomadaAtendimento(numero, {
      ultimaMsg: usuario.ultimaMsg,
      params: []
    }, options)
  }

  if (job.template === "caso_atualizacao") {
    const resumo = job.tipoEvento === "documentos_pendentes"
      ? `Há documentos pendentes no caso ${usuario.numeroCaso || "em atendimento"}. Responda por aqui para continuar.`
      : `Há uma atualização pendente no caso ${usuario.numeroCaso || "em atendimento"}. Responda por aqui para continuar.`
    return templateService.casoAtualizacao(numero, [resumo], options)
  }

  return false
}

function validarCadenciaReengajamento(usuario = {}, job = {}, agora = Date.now()) {
  const history = usuario._reengagementHistory && typeof usuario._reengagementHistory === "object"
    ? usuario._reengagementHistory : {}
  const record = history[job.id] || {}
  if (Number(record.attempts || 0) >= REENGAGEMENT_MAX_ATTEMPTS) return { ok: false, motivo: "limite_tentativas" }
  const lastSentAt = Date.parse(record.lastSentAt || "")
  if (Number.isFinite(lastSentAt) && agora - lastSentAt < REENGAGEMENT_MIN_INTERVAL_MS) return { ok: false, motivo: "cadencia_minima" }
  return { ok: true, history, record }
}

function registrarEnvioReengajamento(usuario = {}, job = {}, agora = Date.now()) {
  const validacao = validarCadenciaReengajamento(usuario, job, agora)
  const history = { ...(validacao.history || usuario._reengagementHistory || {}) }
  const previous = history[job.id] || {}
  history[job.id] = { attempts: Number(previous.attempts || 0) + 1, lastSentAt: new Date(agora).toISOString() }
  usuario._reengagementHistory = history
}

function tipoLembreteConsultaValido(tipo) {
  return ["24h", "hoje", "1h"].includes(String(tipo || "").trim().toLowerCase())
}

function calcularAlvoLembreteConsulta(tipo, inicioConsulta, scheduledFor = "") {
  const inicio = new Date(inicioConsulta || "")
  const agendado = new Date(scheduledFor || "")
  if (!isNaN(agendado.getTime())) return agendado
  if (isNaN(inicio.getTime())) return null

  const chave = String(tipo || "").trim().toLowerCase()
  if (chave === "24h") return new Date(inicio.getTime() - 24 * 60 * 60 * 1000)
  if (chave === "1h") return new Date(inicio.getTime() - 60 * 60 * 1000)
  return null
}

function validarJanelaEnvioLembreteConsulta({ tipo, inicioConsulta, scheduledFor, agora = Date.now() }) {
  if (!tipoLembreteConsultaValido(tipo)) return { ok: false, status: 400, motivo: "tipo_invalido" }

  const inicio = new Date(inicioConsulta || "")
  if (isNaN(inicio.getTime())) return { ok: false, status: 400, motivo: "datetime_invalido" }
  if (inicio.getTime() <= agora) return { ok: false, status: 409, motivo: "consulta_passada" }

  const alvo = calcularAlvoLembreteConsulta(tipo, inicioConsulta, scheduledFor)
  if (String(tipo || "").trim().toLowerCase() === "hoje" && !alvo) {
    return { ok: false, status: 400, motivo: "scheduledFor_obrigatorio_para_lembrete_hoje" }
  }
  if (!alvo) return { ok: true, alvo: null }

  const toleranciaAntecipacaoMs = 60 * 1000
  if (agora + toleranciaAntecipacaoMs < alvo.getTime()) {
    return {
      ok: false,
      status: 409,
      motivo: "lembrete_antecipado",
      scheduledFor: alvo.toISOString()
    }
  }

  return { ok: true, alvo }
}

function criarContextoConsultaTemplate({ tipo, eventId, dealId, casoId, inicioConsulta }) {
  const templateTipo = templateService.templateTipoConsultaLembrete(tipo)
  if (!templateTipo) return null

  const inicio = new Date(inicioConsulta || "")
  const baseExpiracao = !isNaN(inicio.getTime()) ? inicio.getTime() : Date.now()
  return {
    tipo: "template_consulta",
    origem: "meta_template",
    entidade: {
      eventId: eventId || null,
      dealId: dealId || null,
      casoId: casoId || null
    },
    acaoEsperada: "confirmacao_consulta",
    dados: {
      templateTipo
    },
    expiracao: new Date(baseExpiracao + 2 * 60 * 60 * 1000).toISOString()
  }
}

async function liberarAgendamentoERecalcularStage(u, motivo = "agendamento_liberado") {
  if (!u) return { atualizado: false, motivo: "usuario_nao_encontrado" }

  const estadoConsulta = await getConsultaView(u.negocioId)
  const eventoAnterior = estadoConsulta.eventId || null
  if (eventoAnterior && ["cancelada", "encerrada", "nao_compareceu"].includes(estadoConsulta.status)) {
    await appendConsultaEvent({
      tipo: estadoConsulta.status === "cancelada" ? "consulta.canceled" : "consulta.expired",
      dealId: u.negocioId,
      timestamp: estadoConsulta.fim || new Date().toISOString(),
      consultaStatus: estadoConsulta.status,
      metadata: {
        calendarEventId: eventoAnterior,
        inicio: estadoConsulta.inicio,
        fim: estadoConsulta.fim,
        tipoConsulta: estadoConsulta.metadata?.tipoConsulta,
        versaoIntegracao: estadoConsulta.metadata?.versaoIntegracao || "3"
      },
      origem: motivo.includes("admin") ? "admin" : motivo.includes("cliente") ? "client" : "system",
      chaveIdempotencia: `calendar:${eventoAnterior}:${estadoConsulta.status}`
    })
  }
  if (eventoAnterior) {
    u._ultimoEventoCalendarId = eventoAnterior
    u._ultimoEventoCalendarMotivo = motivo
    u._ultimoEventoCalendarLiberadoEm = new Date().toISOString()
  }
  u.consultaStatus = estadoConsulta.status

  const stageAtual = sanitizarTextoEntrada(u.negocioStageId)
  const stagesNaoRecalcular = [HS_STAGE.PROTOCOLO, HS_STAGE.PROCESSO, HS_STAGE.FINAL]
  if (stagesNaoRecalcular.includes(stageAtual)) {
    agendarPersistenciaUsers()
    return { atualizado: true, stageAlterado: false, motivo, eventoAnterior, stageAtual }
  }

  const novoStage = calcularStageAposAgendamento(u)
  let hubspotTentado = false
  let hubspotAtualizado = null
  if (u.negocioId && novoStage && stageAtual !== novoStage) {
    hubspotTentado = true
    const atualizado = await hsAtualizarNegocioComEstado(u, { dealstage: novoStage })
    hubspotAtualizado = Boolean(atualizado)
    if (atualizado) {
      u.negocioStageId = novoStage
      u._hubspotSyncSnapshot = null
    }
  } else if (novoStage) {
    u.negocioStageId = novoStage
  }

  agendarPersistenciaUsers()
  return {
    atualizado: true,
    stageAlterado: stageAtual !== novoStage,
    motivo,
    eventoAnterior,
    stageAnterior: stageAtual,
    novoStage,
    hubspotTentado,
    hubspotAtualizado
  }
}


let postHumanCycleRepository = null
let postHumanActionContextRepository = null
function labelStageAdmin(stage) {
  const mapa = {
    [HS_STAGE.LEAD]: "🟡 Lead",
    [HS_STAGE.CADASTRO]: "📝 Cadastro",
    [HS_STAGE.ANALISE]: "🔎 Analise",
    [HS_STAGE.AGUARDANDO_DOCS]: "📎 Docs pendentes",
    [HS_STAGE.DOCS]: "📁 Docs recebidos",
    [HS_STAGE.PROTOCOLO]: "📮 Protocolo",
    [HS_STAGE.PROCESSO]: "⚖️ Processo",
    [HS_STAGE.FINAL]: "✅ Encerrado",
    [STAGES.ACOLHIMENTO_MODO]: "Pré-atendimento"
  }
  return mapa[stage] || sanitizarTextoEntrada(stage) || "⚪ Sem stage"
}

const ADMIN_IDS = {
  menu: "adm_menu",
  prioridades: "adm_prioridades",
  agenda: "adm_agenda",
  casos: "adm_casos",
  alertas: "adm_alertas",
  casosNovos: "adm_casos_novos",
  casosAnalise: "adm_casos_analise",
  casosDocs: "adm_casos_docs",
  casosAtivos: "adm_casos_ativos",
  alertasCriticos: "adm_alertas_criticos",
  alertasParados: "adm_alertas_parados",
  alertasDocs: "adm_alertas_docs",
  alertasAgenda: "adm_alertas_agenda",
  alertasUrgentes: "adm_alertas_urgentes",
  alertasSemResposta: "adm_alertas_sem_resposta",
  resumo: "adm_resumo_diario",
  atendimentoAssistidoIa: "adm_atendimento_assistido_ia",
  consultarCaso: "adm_consultar_caso",
  completarInformacoes: "adm_completar_informacoes",
  enviarDocumentos: "adm_enviar_documentos",
  casoCompletar: "adm_caso_completar",
  casoEnviarDocumento: "adm_caso_enviar_documento",
  casoAgendar: "adm_caso_agendar",
  casoPreferenciaComunicacao: "adm_caso_preferencia_comunicacao",
  preferenciaTexto: "adm_preferencia_texto",
  preferenciaAudioSempre: "adm_preferencia_audio_sempre",
  preferenciaNaoDefinida: "adm_preferencia_nao_definida",
  casoLinks: "adm_caso_links",
  casoPedirDocs: "adm_caso_pedir_docs",
  casoLembrete: "adm_caso_lembrete",
  casoRevisado: "adm_caso_revisado",
  casoMarcarUrgente: "adm_caso_marcar_urg",
  casoEnviarAnalise: "adm_caso_enviar_analise",
  cancelarConsulta: "adm_cancelar_consulta",
  cancelarSim: "adm_cancelar_sim",
  cancelarNao: "adm_cancelar_nao"
}
configurarAdminCaseUi({
  ADMIN_IDS,
  labelStageAdmin,
  resolverNomeBriefing: resolverNomeParaAdmin,
  resolverTelefoneAdminAutenticado: (item, adminAutenticado) => adminAutenticado
    ? normalizarNumeroWhatsAppEnvio(item?.from || item?.u?._numero || item?.u?.whatsappContato)
    : "",
  primeiroEUltimoNome: primeiroEUltimoNomeAdmin
})

const ADMIN_REVISADO_TTL_MS = 6 * 60 * 60 * 1000

function montarNotificacaoCancelamentoClienteAdmin({ from, u, dataHora, eventoId, resultado } = {}) {
  const novoStage = resultado?.novoStage || u?.negocioStageId
  const stageAnterior = resultado?.stageAnterior || resultado?.stageAtual || ""
  const hubspotLink = u?.negocioId ? linkHubSpot(u.negocioId) : ""
  const hubspotOk = !resultado?.hubspotTentado || resultado?.hubspotAtualizado === true
  const precisaRevisar = !resultado?.atualizado || !hubspotOk || !u?.negocioId
  const statusOperacional = precisaRevisar
    ? "⚠️ *Ação recomendada:* revisar manualmente no HubSpot/agenda."
    : "✅ *Nenhuma ação manual necessária.*\nO evento foi removido, o stage foi recalculado e o caso ficou na etapa correta."

  return [
    precisaRevisar ? "⚠️ *Cancelamento precisa de revisão*" : "❌ *Consulta cancelada pelo cliente*",
    "",
    `👤 ${u?.nome || "Cliente"}`,
    `📄 Caso: ${u?.numeroCaso || "-"}`,
    `⚖️ Área: ${u?.area || "-"}`,
    `📅 Consulta: ${dataHora || "-"}`,
    `📱 WhatsApp: ${from || "-"}`,
    `📌 Novo status: ${labelStageAdmin(novoStage)}`,
    stageAnterior && stageAnterior !== novoStage ? `🔁 Antes: ${labelStageAdmin(stageAnterior)}` : "",
    eventoId ? `🗓️ Evento: ${eventoId}` : "",
    hubspotLink ? `🔗 HubSpot: ${hubspotLink}` : "🔗 HubSpot: negócio não identificado",
    "",
    statusOperacional
  ].filter(Boolean).join("\n")
}

function normalizarItemAdminLocal(from, u, negocio = null, contato = null) {
  const props = negocio?.properties || {}
  const snapshot = desserializarEstado(props.estado_bot_snapshot) || {}
  const telefone = normalizarNumeroWhatsAppEnvio(contato?.properties?.phone || from || snapshot._numero || snapshot.whatsappContato)

  const { nome: nomeResolvido } = resolverNomeUnificado({ contato, u })

  const base = hidratarUsuarioPersistido({
    ...snapshot,
    nome: snapshot.nome || nomeResolvido || props.dealname || u?.nome || null,
    nomeWA: snapshot.nomeWA || u?.nomeWA || null,
    nomePerfilWhatsApp: snapshot.nomePerfilWhatsApp || u?.nomePerfilWhatsApp || null,
    nomeHubspot: nomeResolvido || snapshot.nomeHubspot || u?.nomeHubspot || null,
    contatoId: contato?.id || snapshot.contatoId || u?.contatoId || null,
    negocioId: negocio?.id || snapshot.negocioId || u?.negocioId || null,
    negocioStageId: negocio?.stageId || props.dealstage || snapshot.negocioStageId || u?.negocioStageId || null,
    numeroCaso: getNumeroCasoOficialDoNegocio(negocio) || snapshot.numeroCaso || u?.numeroCaso || null,
    area: snapshot.area || props.area_juridica || u?.area || null,
    tipo: snapshot.tipo || props.tipo_de_caso || u?.tipo || null,
    subTipo: snapshot.subTipo || snapshot.subtipo || props.oraculum_case_subtype || u?.subTipo || u?.subtipo || null,
    urgencia: resolverUrgenciaAdmin({
      hubspot: props.urgencia,
      snapshot: snapshot.urgencia,
      local: u?.urgencia
    }),
    descricao: snapshot.descricao || props.description || props.descricao_completa || u?.descricao || null,
    assuntoResumo: snapshot.assuntoResumo || props.resumo_cliente || u?.assuntoResumo || null
  })
  garantirNomenclaturaJuridicaUsuario(base)
  base._numero = telefone || from || null
  return { from: telefone || from || "", u: base, negocio, contato }
}

async function hsAdminContarNegociosPorStages(stages = []) {
  const valores = stages.filter(Boolean)
  if (!valores.length) return { ok: true, total: 0, errorCode: null, errorMessage: null }
  try {
    const resultado = await hsAdminBuscarNegociosPorStages(valores, 1)
    if (!resultado.ok) return { ok: false, total: 0, errorCode: resultado.errorCode, errorMessage: resultado.errorMessage }
    return { ok: true, total: resultado.total, errorCode: null, errorMessage: null }
  } catch (e) {
    logErroHubSpot(e, { operation: "adminContarNegociosPorStages" })
    return { ok: false, total: 0, errorCode: "HUBSPOT_QUERY_FAILED", errorMessage: "hubspot_query_failed" }
  }
}

async function hsAdminBuscarContatoDoNegocio(dealId) {
  try {
    return await executarComRetryHubSpot(
      async () => {
        const assoc = await axios.get(
          `https://api.hubapi.com/crm/v3/objects/deals/${dealId}/associations/contacts`,
          { headers: HS() }
        )
        const contactId = assoc.data?.results?.[0]?.id
        if (!contactId) return null
        const contato = await axios.get(
          `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}?properties=firstname,lastname,phone`,
          { headers: HS() }
        )
        return contato.data || null
      },
      {
        maxTentativas: 3,
        operacao: "adminBuscarContatoDoNegocio",
        idempotente: true,
        onRetry: (info) => {
          logDebug(`[HUBSPOT_RETRY] ${info.operacao} tentativa=${info.tentativa}/${info.maxTentativas} delay=${info.delayMs}ms`)
        }
      }
    )
  } catch (e) {
    logErroHubSpot(e, { operation: "adminBuscarContatoDoNegocio", dealId })
    return null
  }
}

async function hsAdminBuscarNegociosPorStages(stages = [], limit = 50, after = null) {
  const valores = stages.filter(Boolean)
  if (!valores.length) return { ok: true, deals: [], total: 0, after: null, errorCode: null, errorMessage: null }
  const inicio = Date.now()
  try {
    return await executarComRetryHubSpot(
      async () => {
        const body = {
          filterGroups: [{ filters: [{ propertyName: "dealstage", operator: "IN", values: valores }] }],
          sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
          properties: [
            "dealstage", "dealname", "createdate", "closedate", "description",
            "resumo_cliente", "descricao_completa", "area_juridica", "estado_bot_snapshot",
            "etapa_do_bot", "tipo_de_caso", "temperatura_lead", "hs_priority", "numero_de_caso",
            "urgencia", "oraculum_case_subtype"
          ],
          limit
        }
        if (after) body.after = after
        const res = await axios.post(
          "https://api.hubapi.com/crm/v3/objects/deals/search",
          body,
          { headers: HS() }
        )
        const inspecao = inspecionarRespostaBuscaHubSpotAdmin(res)
        logInfo({
          event: "admin.hubspot.search",
          status: inspecao.ok ? "success" : "invalid_response",
          operation: "adminBuscarNegociosPorStages",
          searchType: "stages",
          ...inspecao.metadata,
          durationMs: Date.now() - inicio
        })
        if (!inspecao.ok) {
          return {
            ok: false, deals: [], total: 0, after: null,
            errorCode: "INVALID_HUBSPOT_RESPONSE",
            errorMessage: inspecao.reason
          }
        }
        const deals = mapearNegociosHubSpotAdmin(res.data)
        return {
          ok: true,
          deals,
          total: res.data?.total || 0,
          after: res.data?.paging?.next?.after || null,
          errorCode: null,
          errorMessage: null
        }
      },
      {
        maxTentativas: 3,
        operacao: "adminBuscarNegociosPorStages",
        idempotente: true,
        onRetry: (info) => {
          logDebug(`[HUBSPOT_RETRY] ${info.operacao} tentativa=${info.tentativa}/${info.maxTentativas} delay=${info.delayMs}ms`)
        }
      }
    )
  } catch (e) {
    logInfo({ event: "admin.hubspot.search", status: "error", operation: "adminBuscarNegociosPorStages", searchType: "stages", httpStatus: e?.response?.status, durationMs: Date.now() - inicio })
    logErroHubSpot(e, { operation: "adminBuscarNegociosPorStages" })
    return {
      ok: false,
      deals: [], total: 0, after: null,
      errorCode: sanitizarTextoEntrada(e?.response?.data?.category || e?.response?.data?.errorType || e?.code || e?.response?.status || "HUBSPOT_QUERY_FAILED"),
      errorMessage: sanitizarTextoEntrada(mascararErroHubSpot(e)).replace(/(?:\+?55[\s.-]?)?(?:\(?\d{2}\)?[\s.-]?)?9?\d{4}[\s.-]?\d{4}\b/g, "[PHONE REDACTED]").slice(0, 300)
    }
  }
}

async function hsAdminBuscarTodosNegociosPorStages(stages = [], queue = "ativos") {
  const inicio = Date.now()
  const deals = []
  const dealIds = new Set()
  const cursors = new Set()
  let after = null
  let total = 0
  do {
    const resultado = await hsAdminBuscarNegociosPorStages(stages, 100, after)
    if (!resultado.ok) {
      logInfo({ event: "admin.cases.query", status: "error", queue, stages: stages.join(","), errorCode: resultado.errorCode, durationMs: Date.now() - inicio })
      return { ...resultado, deals: [] }
    }
    for (const deal of resultado.deals) {
      if (deal?.id && !dealIds.has(String(deal.id))) {
        dealIds.add(String(deal.id))
        deals.push(deal)
      }
    }
    total = resultado.total
    after = resultado.after
    if (after && cursors.has(String(after))) {
      logInfo({ event: "admin.cases.query", status: "error", queue, stages: stages.join(","), errorCode: "PAGING_CURSOR_REPEATED", durationMs: Date.now() - inicio })
      return { ok: false, deals: [], total, after: null, errorCode: "PAGING_CURSOR_REPEATED", errorMessage: "cursor de paginação repetido" }
    }
    if (after) cursors.add(String(after))
    logInfo({ event: "admin.cases.query", status: "page", queue, stages: stages.join(","), receivedCount: resultado.deals.length, hubspotTotal: total, after: after || "", durationMs: Date.now() - inicio })
  } while (after)
  logInfo({ event: "admin.cases.query", status: deals.length ? "success" : "empty", queue, stages: stages.join(","), receivedCount: deals.length, hubspotTotal: total, durationMs: Date.now() - inicio })
  return { ok: true, deals, total, after: null, errorCode: null, errorMessage: null }
}

async function hsAdminBuscarNegociosDireto(query, after = null) {
  const texto = sanitizarTextoEntrada(query)
  if (!texto) return { ok: true, deals: [], total: 0, after: null, errorCode: null, errorMessage: null }
  const inicio = Date.now()
  try {
    const res = await executarComRetryHubSpot(async () => axios.post("https://api.hubapi.com/crm/v3/objects/deals/search", {
      query: texto,
      sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
      properties: ["dealstage", "dealname", "area_juridica", "estado_bot_snapshot", "numero_de_caso"],
      limit: 100,
      ...(after ? { after } : {})
    }, { headers: HS() }), { maxTentativas: 3, operacao: "adminBuscarNegociosDireto", idempotente: true })
    const inspecao = inspecionarRespostaBuscaHubSpotAdmin(res)
    logInfo({
      event: "admin.hubspot.search",
      status: inspecao.ok ? "success" : "invalid_response",
      operation: "adminBuscarNegociosDireto",
      searchType: "direct",
      ...inspecao.metadata,
      durationMs: Date.now() - inicio
    })
    if (!inspecao.ok) {
      return { ok: false, deals: [], total: 0, after: null, errorCode: "INVALID_HUBSPOT_RESPONSE", errorMessage: inspecao.reason }
    }
    return { ok: true, deals: mapearNegociosHubSpotAdmin(res.data), total: res.data?.total || 0, after: res.data?.paging?.next?.after || null, errorCode: null, errorMessage: null }
  } catch (e) {
    logInfo({ event: "admin.hubspot.search", status: "error", operation: "adminBuscarNegociosDireto", searchType: "direct", httpStatus: e?.response?.status, durationMs: Date.now() - inicio })
    logErroHubSpot(e, { operation: "adminBuscarNegociosDireto" })
    return { ok: false, deals: [], total: 0, after: null, errorCode: sanitizarTextoEntrada(e?.response?.status || e?.code || "HUBSPOT_QUERY_FAILED"), errorMessage: sanitizarTextoEntrada(mascararErroHubSpot(e)).slice(0, 300) }
  }
}

const ADMIN_DEAL_SEARCH_PROPERTIES = ["dealstage", "dealname", "area_juridica", "estado_bot_snapshot", "numero_de_caso"]

function deduplicarDealsAdmin(deals = []) {
  return [...new Map((Array.isArray(deals) ? deals : []).filter(deal => deal?.id).map(deal => [String(deal.id), deal])).values()]
}

async function hsAdminBuscarDealsPorNumeroCaso(numeroCaso) {
  try {
    const res = await executarComRetryHubSpot(() => axios.post("https://api.hubapi.com/crm/v3/objects/deals/search", {
      filterGroups: [{ filters: [{ propertyName: "numero_de_caso", operator: "EQ", value: numeroCaso }] }],
      properties: ADMIN_DEAL_SEARCH_PROPERTIES,
      limit: 100
    }, { headers: HS() }), { maxTentativas: 3, operacao: "adminBuscarDealPorNumeroCaso", idempotente: true })
    const inspecao = inspecionarRespostaBuscaHubSpotAdmin(res)
    if (!inspecao.ok) return { ok: false, deals: [], errorCode: "INVALID_HUBSPOT_RESPONSE", errorMessage: inspecao.reason }
    return { ok: true, deals: mapearNegociosHubSpotAdmin(res.data) }
  } catch (e) {
    logErroHubSpot(e, { operation: "adminBuscarDealPorNumeroCaso" })
    return { ok: false, deals: [], errorCode: sanitizarTextoEntrada(e?.code || e?.response?.status || "HUBSPOT_QUERY_FAILED"), errorMessage: "hubspot_query_failed" }
  }
}

// Read-only confirmation immediately before creating a post-human cycle.  The
// rendered Admin snapshot is deliberately not a source of truth here.
async function confirmarVinculoPosHumanoHubSpot(context) {
  try {
    const result = await hsAdminBuscarDealsPorNumeroCaso(context.numeroCaso)
    if (!result?.ok || !Array.isArray(result.deals)) return { ok: false, reason: result?.errorCode === "INVALID_HUBSPOT_RESPONSE" ? "hubspot_invalid_response" : "hubspot_error" }
    if (result.deals.length === 0) return { ok: false, reason: "hubspot_deal_not_found" }
    if (result.deals.length !== 1) return { ok: false, reason: "hubspot_ambiguous" }
    const deal = result.deals[0]
    if (String(deal?.id) !== String(context.negocioId) || normalizeCaseNumber(deal?.numeroCaso || deal?.properties?.numero_de_caso) !== normalizeCaseNumber(context.numeroCaso)) return { ok: false, reason: "hubspot_deal_mismatch" }
    const association = await axios.get(
      `https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(context.negocioId)}/associations/contacts`, { headers: HS() }
    )
    if (!Array.isArray(association?.data?.results)) return { ok: false, reason: "hubspot_invalid_response" }
    const contacts = association.data.results.map(item => String(item?.id || "")).filter(Boolean)
    if (contacts.length !== 1) return { ok: false, reason: contacts.length ? "hubspot_ambiguous" : "hubspot_contact_mismatch" }
    return contacts[0] === String(context.contatoId) ? { ok: true } : { ok: false, reason: "hubspot_contact_mismatch" }
  } catch (error) {
    return { ok: false, reason: error?.response || error?.code ? "hubspot_error" : "hubspot_invalid_response" }
  }
}

async function hsAdminBuscarContatosPorNome(nome) {
  try {
    const res = await executarComRetryHubSpot(() => axios.post("https://api.hubapi.com/crm/v3/objects/contacts/search", {
      query: nome, properties: ["firstname", "lastname", "phone", "mobilephone"], limit: 100
    }, { headers: HS() }), { maxTentativas: 3, operacao: "adminBuscarContatosPorNome", idempotente: true })
    if (!Array.isArray(res?.data?.results)) return { ok: false, contatos: [], errorCode: "INVALID_HUBSPOT_RESPONSE" }
    return { ok: true, contatos: res.data.results }
  } catch (e) {
    logErroHubSpot(e, { operation: "adminBuscarContatosPorNome" })
    return { ok: false, contatos: [], errorCode: sanitizarTextoEntrada(e?.code || e?.response?.status || "HUBSPOT_QUERY_FAILED") }
  }
}

async function hsAdminBuscarContatosPorTelefone(telefone) {
  try {
    const phone = normalizarTelefoneHubSpot(telefone)
    if (!phone) return { ok: true, contatos: [] }
    const res = await executarComRetryHubSpot(() => axios.post("https://api.hubapi.com/crm/v3/objects/contacts/search", {
      filterGroups: [
        { filters: [{ propertyName: "phone", operator: "EQ", value: phone }] },
        { filters: [{ propertyName: "mobilephone", operator: "EQ", value: phone }] }
      ],
      properties: ["firstname", "lastname", "phone", "mobilephone"], limit: 100
    }, { headers: HS() }), { maxTentativas: 3, operacao: "adminBuscarContatosPorTelefone", idempotente: true })
    if (!Array.isArray(res?.data?.results)) return { ok: false, contatos: [], errorCode: "INVALID_HUBSPOT_RESPONSE" }
    const contatos = [...new Map(res.data.results.filter(contato => contato?.id).map(contato => [String(contato.id), contato])).values()]
    return { ok: true, contatos }
  } catch (e) {
    logErroHubSpot(e, { operation: "adminBuscarContatosPorTelefone" })
    return { ok: false, contatos: [], errorCode: sanitizarTextoEntrada(e?.code || e?.response?.status || "HUBSPOT_QUERY_FAILED") }
  }
}

function cpfValidoConsultaAdmin(valor) {
  const cpf = String(valor || "").replace(/\D/g, "")
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false
  for (let tamanho = 9; tamanho <= 10; tamanho++) {
    let soma = 0
    for (let indice = 0; indice < tamanho; indice++) soma += Number(cpf[indice]) * (tamanho + 1 - indice)
    const digito = (soma * 10) % 11 % 10
    if (digito !== Number(cpf[tamanho])) return false
  }
  return true
}

function classificarConsultaCasoAdmin(texto) {
  const valor = sanitizarTextoEntrada(texto)
  const digitos = valor.replace(/\D/g, "")
  if (/^[A-Za-z]{2,6}[.\-]\d{6}[.\-]\d{3,}$/i.test(valor)) return "case_number"
  if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(valor)) return "cpf"
  if (/^\+?55[\s().-]*\d/.test(valor) || (/^[+()\d\s-]+$/.test(valor) && digitos.length >= 10 && digitos.length <= 13 && /[()\s-]/.test(valor))) return "phone"
  if (digitos.length === 11) return cpfValidoConsultaAdmin(digitos) ? "cpf" : "phone"
  if (digitos.length >= 10 && digitos.length <= 13) return "phone"
  return "contact_name"
}

async function hsAdminListarDealsDosContatosEstrito(contatos = []) {
  const resultados = await Promise.all(contatos.map(contato => hsListarNegociosAtivosDoContatoEstrito(contato.id)))
  const falha = resultados.find(resultado => !resultado?.ok)
  return falha ? { ok: false, deals: [], errorCode: falha.errorCode || "HUBSPOT_QUERY_FAILED" } : { ok: true, deals: resultados.flatMap(resultado => resultado.deals) }
}

async function resolverConsultaCasoAdmin(query, after = null) {
  const texto = sanitizarTextoEntrada(query)
  const inicio = Date.now()
  const cpf = texto.replace(/\D/g, "")
  let estrategia = classificarConsultaCasoAdmin(texto)
  let resultado
  if (estrategia === "case_number") {
    resultado = await hsAdminBuscarDealsPorNumeroCaso(texto.toUpperCase())
  } else if (estrategia === "cpf") {
    try {
      const contato = await hsBuscarPorCpf(cpf)
      resultado = contato?.id ? await hsAdminListarDealsDosContatosEstrito([contato]) : { ok: true, deals: [] }
    } catch (e) { resultado = { ok: false, deals: [], errorCode: sanitizarTextoEntrada(e?.code || "HUBSPOT_QUERY_FAILED") } }
  } else if (estrategia === "phone") {
    const contatos = await hsAdminBuscarContatosPorTelefone(texto)
    resultado = contatos.ok ? await hsAdminListarDealsDosContatosEstrito(contatos.contatos) : { ok: false, deals: [], errorCode: contatos.errorCode }
  } else {
    estrategia = "contact_name"
    const contatos = await hsAdminBuscarContatosPorNome(texto)
    if (!contatos.ok) resultado = { ok: false, deals: [], errorCode: contatos.errorCode }
    else {
      try {
        const porContato = await hsAdminListarDealsDosContatosEstrito(contatos.contatos)
        if (!porContato.ok) return { ok: false, deals: [], total: 0, after: null, errorCode: porContato.errorCode, errorMessage: null }
        const fallback = await hsAdminBuscarNegociosDireto(texto, after)
        if (!fallback.ok) resultado = fallback
        else resultado = { ok: true, deals: [...porContato.deals, ...fallback.deals], total: fallback.total, after: fallback.after }
      } catch (e) { resultado = { ok: false, deals: [], errorCode: sanitizarTextoEntrada(e?.code || "HUBSPOT_QUERY_FAILED") } }
    }
  }
  const deals = deduplicarDealsAdmin(resultado?.deals)
  logInfo({ event: "admin.cases.resolve", status: resultado?.ok ? (deals.length ? "success" : "empty") : "error", searchStrategy: estrategia, dealCount: deals.length, durationMs: Date.now() - inicio })
  return { ok: Boolean(resultado?.ok), deals, total: resultado?.total ?? deals.length, after: resultado?.after || null, errorCode: resultado?.errorCode || null, errorMessage: resultado?.errorMessage || null }
}

async function mapearComLimite(itens = [], limite = 2, fn) {
  const entrada = Array.isArray(itens) ? itens : []
  const max = Math.max(1, Number(limite) || 1)
  const saida = new Array(entrada.length)
  let idx = 0

  async function worker() {
    while (idx < entrada.length) {
      const atual = idx++
      saida[atual] = await fn(entrada[atual], atual)
    }
  }

  await Promise.all(Array.from({ length: Math.min(max, entrada.length) }, worker))
  return saida
}

async function reconciliarTituloNegocioHubSpotAdmin(negocio = {}, item = {}) {
  const dealId = sanitizarTextoEntrada(negocio.id)
  const props = negocio.properties || {}
  if (!dealId) return false

  const tituloEsperado = montarTituloNegocioHubSpot({
    ...(item.u || {}),
    area: props.area_juridica || item.u?.area,
    numeroCaso: getNumeroCasoOficialDoNegocio(negocio) || item.u?.numeroCaso,
    negocioStageId: props.dealstage || negocio.stageId || item.u?.negocioStageId,
    temperatura: props.temperatura_lead
  }, {
    HS_STAGE,
    stage: props.dealstage || negocio.stageId
  })
  const tituloAtual = sanitizarTextoEntrada(props.dealname)
  if (!tituloEsperado || tituloAtual === tituloEsperado) return false

  const atualizado = await hsAtualizarNegocioSerializado(dealId, { dealname: tituloEsperado })
  if (atualizado) {
    negocio.properties = { ...props, dealname: tituloEsperado }
    if (item.u && (!item.u.nome || item.u.nome === tituloAtual)) item.u.nome = item.u.nomeWA || "Cliente"
    // Invalidar cache após escrita no HubSpot
    invalidarCacheResumoOperacional()
  }
  return Boolean(atualizado)
}

async function hsAdminItensPorStages(stages = [], limit = 30, after = null) {
  const resultado = await hsAdminBuscarNegociosPorStages(stages, limit, after)
  const deals = resultado.deals || []
  return {
    ok: resultado.ok,
    items: deals.map(negocio => normalizarItemAdminLocal("", null, negocio, null)),
    total: resultado.total || 0,
    nextAfter: resultado.after || null,
    errorCode: resultado.errorCode || null,
    errorMessage: resultado.errorMessage || null
  }
}


async function hsAdminItemPorDealId(dealId) {
  const id = sanitizarTextoEntrada(dealId)
  if (!id) return null
  try {
    const res = await executarComRetryHubSpot(
      async () => axios.get(
        `https://api.hubapi.com/crm/v3/objects/deals/${id}?properties=dealstage,dealname,createdate,closedate,description,resumo_cliente,descricao_completa,area_juridica,estado_bot_snapshot,etapa_do_bot,tipo_de_caso,oraculum_case_subtype,temperatura_lead,hs_priority,numero_de_caso,urgencia`,
        { headers: HS() }
      ),
      { operacao: "adminBuscarDealPorCalendar", maxTentativas: 3 }
    )
    const negocio = {
      id,
      stageId: res.data?.properties?.dealstage || null,
      createdate: res.data?.properties?.createdate || null,
      properties: res.data?.properties || {}
    }
    return normalizarItemAdminLocal("", null, negocio, null)
  } catch (e) {
    logErroHubSpot(e, { operation: "adminBuscarDealPorCalendar", dealId: id })
    return null
  }
}

async function adminItensAtivosHubSpot(limit = 100) {
  const stagesAtivos = Object.values(HS_STAGE).filter(stage => stage !== HS_STAGE.FINAL)
  return await hsAdminItensPorStages(stagesAtivos, limit)
}

async function adminFonteCasos(filtro = () => true, stages = Object.values(HS_STAGE).filter(stage => stage !== HS_STAGE.FINAL), limit = 30, after = null) {
  const resultado = await hsAdminItensPorStages(stages, limit, after)
  if (!resultado.ok) return { ok: false, items: [], total: 0, nextAfter: null, errorCode: resultado.errorCode, errorMessage: resultado.errorMessage }
  const itensHubSpot = resultado.items
  const vistos = new Set(itensHubSpot.map(item => String(item.u?.negocioId || item.negocio?.id || "")).filter(Boolean))
  const locais = usuariosAdminOrdenados(filtro).filter(item => {
    const id = String(item.u?.negocioId || "")
    return !id || !vistos.has(id)
  })
  const items = [...itensHubSpot, ...locais].filter(({ u }) => u && filtro(u))
  logInfo({ event: "admin.cases.queue", status: items.length ? "success" : "empty", queue: "filtered", stages: stages.join(","), receivedCount: itensHubSpot.length, hubspotTotal: resultado.total, filteredCount: items.length })
  return {
    ok: true,
    items,
    total: resultado.total + (after ? 0 : locais.length),
    nextAfter: resultado.nextAfter
  }
}

async function adminResumoOperacional() {
  const agora = Date.now()
  if (cacheResumoOperacional.dados && (agora - cacheResumoOperacional.timestamp) < cacheResumoOperacional.TTL) {
    logDebug("[ADMIN_CACHE] Usando resumo operacional em cache")
    return cacheResumoOperacional.dados
  }

  const stagesAtivos = Object.values(HS_STAGE).filter(stage => stage !== HS_STAGE.FINAL)
  const contagemAtivos = await hsAdminContarNegociosPorStages(stagesAtivos)
  if (!contagemAtivos.ok) return { ok: false, errorCode: contagemAtivos.errorCode, errorMessage: contagemAtivos.errorMessage }
  const contagemAnalise = await hsAdminContarNegociosPorStages([HS_STAGE.ANALISE])
  if (!contagemAnalise.ok) return { ok: false, errorCode: contagemAnalise.errorCode, errorMessage: contagemAnalise.errorMessage }
  const totalAtivos = contagemAtivos.total
  const totalAnalise = contagemAnalise.total

  const ativosResultado = await adminItensAtivosHubSpot(Math.min(totalAtivos, 100))
  if (!ativosResultado.ok) return { ok: false, errorCode: ativosResultado.errorCode, errorMessage: ativosResultado.errorMessage }
  const ativos = ativosResultado.items
  const memoria = usuariosAdminOrdenados()
  const todos = mesclarItensAdminPorIdentidade(ativos, memoria)

  // Contar casos reais (com numeroCaso) e pré-atendimentos
  const casosComNumero = todos.filter(({ u }) => Boolean(u.numeroCaso))
  const preAtendimentos = todos.filter(({ u }) => !u.numeroCaso)

  const resultado = {
    ok: true,
    fonte: ativos.length ? "HubSpot + memoria local" : "memoria local",
    totalClientes: totalAtivos,
    totalCasosComNumero: casosComNumero.length,
    totalPreAtendimentos: preAtendimentos.length,
    consultasAtivas: todos.filter(({ u }) => u.consultaStatus === "agendada").length,
    docsPendentes: todos.filter(({ u }) => calcularStatusDocumentos(u).faltantesCriticos.length > 0 && Boolean(u.numeroCaso)).length,
    urgentes: todos.filter(({ u }) => u.urgencia === "alta" || u.stage === STAGES.AGUARDANDO_URGENTE || u.hs_priority === "high").length,
    analise: totalAnalise,
    todos
  }

  cacheResumoOperacional.dados = resultado
  cacheResumoOperacional.timestamp = agora
  logDebug("[ADMIN_CACHE] Resumo operacional armazenado em cache")
  return resultado
}

function gerarAlertasOperacionaisAdmin(item) {
  const u = item?.u || {}
  const briefing = gerarBriefingCaso(u)
  const idade = idadeUltimaInteracaoAdmin(u)
  const alertas = []

  if (u._solicitouHumano === true && !u._fluxoEncerrado) {
    alertas.push({
      tipo: "humano_solicitado",
      peso: 90,
      texto: "Cliente pediu atendimento humano",
      acao: "Retomar contato humano ou revisar o pre-atendimento."
    })
  }

  if ((briefing.urgencia === "alta" || briefing.scoreEmocional.nivel === "alto") && !u._fluxoEncerrado) {
    alertas.push({
      tipo: "critico",
      peso: 100 + briefing.scoreEmocional.valor,
      texto: "Urgencia ou risco emocional alto",
      acao: "Responder ou revisar com prioridade."
    })
  }

  if (!briefing.numeroCaso && idade > 2 * 60 * 60 * 1000 && !u._fluxoEncerrado) {
    alertas.push({
      tipo: "lead_parado",
      peso: 85,
      texto: `Lead sem caso parado ha ${labelIdadeAdmin(idade)}`,
      acao: "Retomar pre-atendimento ou marcar como revisado."
    })
  }

  if (briefing.numeroCaso && briefing.documentos.faltantesCriticos.length > 0 && idade > 24 * 60 * 60 * 1000) {
    alertas.push({
      tipo: "docs_24h",
      peso: 75 + briefing.documentos.faltantesCriticos.length,
      texto: `Docs criticos pendentes sem movimento ha ${labelIdadeAdmin(idade)}`,
      acao: "Pedir documentos pelo admin."
    })
  }

  if (briefing.consultaAtiva) {
    alertas.push({
      tipo: "consulta",
      peso: 45,
      texto: "Consulta ativa",
      acao: "Conferir pauta, documentos e links antes do atendimento."
    })
  }

  if (briefing.stage === HS_STAGE.ANALISE && idade > 24 * 60 * 60 * 1000 && !casoAdminRevisado(item)) {
    alertas.push({
      tipo: "analise_parada",
      peso: 55,
      texto: `Caso em analise sem revisao ha ${labelIdadeAdmin(idade)}`,
      acao: "Revisar briefing e marcar como revisado."
    })
  }

  return alertas.sort((a, b) => b.peso - a.peso)
}

function maiorAlertaOperacionalAdmin(item) {
  return gerarAlertasOperacionaisAdmin(item)[0] || null
}

async function gerarResumoDiarioOperacional({ limite = 10 } = {}) {
  const resumo = await adminResumoOperacional()
  if (!resumo.ok) return resumo
  const briefings = resumo.todos
    .filter(({ u }) => Boolean(u))
    .map(({ from, u }) => {
      const item = { from, u }
      return {
        from,
        u,
        briefing: gerarBriefingCaso(u),
        alertas: gerarAlertasOperacionaisAdmin(item)
      }
    })

  const ordenarPorRisco = (a, b) =>
    (b.briefing.scoreEmocional.valor - a.briefing.scoreEmocional.valor) ||
    (b.briefing.scoreOperacional - a.briefing.scoreOperacional)

  const urgentes = briefings
    .filter(item => item.briefing.urgencia === "alta" || item.briefing.scoreEmocional.nivel === "alto")
    .sort(ordenarPorRisco)
    .slice(0, limite)

  const docsPendentes = briefings
    .filter(item => item.briefing.numeroCaso && item.briefing.documentos.faltantesCriticos.length > 0)
    .sort((a, b) => b.briefing.documentos.faltantesCriticos.length - a.briefing.documentos.faltantesCriticos.length)
    .slice(0, limite)

  const consultas = briefings
    .filter(item => item.briefing.consultaAtiva)
    .slice(0, limite)

  const recentes = briefings
    .filter(item => item.briefing.numeroCaso)
    .slice(0, limite)

  const alertasOperacionais = briefings
    .filter(item => item.alertas.length > 0)
    .sort((a, b) => (b.alertas[0]?.peso || 0) - (a.alertas[0]?.peso || 0))
    .slice(0, limite)

  const proximasAcoes = briefings
    .filter(item => item.briefing.proximaAcao && item.briefing.stage !== HS_STAGE.FINAL)
    .sort((a, b) =>
      ((b.alertas[0]?.peso || 0) - (a.alertas[0]?.peso || 0)) ||
      (b.briefing.scoreOperacional - a.briefing.scoreOperacional)
    )
    .slice(0, 3)

  return {
    geradoEm: new Date().toISOString(),
    fonte: resumo.fonte,
    totais: {
      casosClientes: resumo.totalClientes,
      consultasAtivas: resumo.consultasAtivas,
      emAnalise: resumo.analise,
      documentosPendentes: resumo.docsPendentes,
      alertasUrgentes: resumo.urgentes,
      itensAnalisados: briefings.length
    },
    filas: {
      urgentes,
      documentosPendentes: docsPendentes,
      consultasAtivas: consultas,
      recentes,
      alertasOperacionais,
      proximasAcoes
    },
    checklistProducao: checklistProducaoAdmin()
  }
}

function usuariosAdminOrdenados(filtro = () => true) {
  return Object.entries(users)
    .filter(([, u]) => u && filtro(u))
    .sort((a, b) => Number(b[1]?.ultimaMsg || 0) - Number(a[1]?.ultimaMsg || 0))
    .map(([from, u]) => ({ from, u }))
}

function salvarListaCasosAdmin(from, itens, origem = ADMIN_IDS.casos, pagina = 1, tamanhoPagina = 8, totalItens = 0, totalPaginas = 1, nextAfter = null) {
  const chaveAdmin = normalizarNumeroWhatsAppEnvio(from)
  if (!chaveAdmin) return
  const sessaoAtual = sessoesAdminWhatsApp.get(chaveAdmin) || {}
  sessoesAdminWhatsApp.set(chaveAdmin, {
    ...sessaoAtual,
    casos: itens,
    casoSelecionado: null,
    origemCasos: origem,
    listaAtiva: "casos",
    paginaAtual: pagina,
    tamanhoPagina,
    totalItens,
    totalPaginas,
    nextAfter,
    ts: Date.now()
  })
}

function obterCasoAdmin(from, idx = null) {
  const chaveAdmin = normalizarNumeroWhatsAppEnvio(from)
  const sessao = sessoesAdminWhatsApp.get(chaveAdmin)
  if (!sessao) return null

  const indice = idx === null || idx === undefined ? sessao.casoSelecionado : idx
  const item = sessao.casos?.[indice]
  if (!item) return null
  sessao.casoSelecionado = indice
  sessao.ts = Date.now()
  sessoesAdminWhatsApp.set(chaveAdmin, sessao)
  return item
}

function prepararSessaoClienteAcaoAdmin(item) {
  const u = item?.u
  const destino = normalizarNumeroWhatsAppEnvio(item?.from || u?._numero || u?.whatsappContato)
  if (!u || !destino) return ""

  const atual = users[destino] || novoUsuario(u.nomeWA || u.nome || "Cliente")
  Object.assign(atual, hidratarUsuarioPersistido({
    ...atual,
    ...u,
    _numero: destino,
    whatsappContato: u.whatsappContato || destino,
    stage: u.numeroCaso ? STAGES.CLIENTE : (u.stage || atual.stage),
    etapa: u.etapa || atual.etapa || STAGES.AUDIO_AGUARDANDO,
    _fluxoEncerrado: false,
    aguardandoRetomada: false,
    jaOfereceuRetomada: false,
    processing: false
  }))
  atual._numero = destino
  atual.processing = false
  atual.timer = null
  atual.timerIncentivoDescricao = null
  users[destino] = atual
  item.from = destino
  item.u = atual
  agendarPersistenciaUsers()
  return destino
}

function chaveCasoAdmin(item) {
  const u = item?.u || item || {}
  return sanitizarTextoEntrada(
    u.negocioId ||
    u.numeroCaso ||
    item?.from ||
    u._numero ||
    u.whatsappContato ||
    ""
  )
}

function limparRevisoesCasosAdmin() {
  const agora = Date.now()
  for (const [chave, revisao] of revisoesCasosAdmin.entries()) {
    if (!revisao?.ate || revisao.ate <= agora) revisoesCasosAdmin.delete(chave)
  }
}

function obterRevisaoCasoAdmin(item) {
  limparRevisoesCasosAdmin()
  const chave = chaveCasoAdmin(item)
  if (!chave) return null
  return revisoesCasosAdmin.get(chave) || null
}

function casoAdminRevisado(item) {
  return Boolean(obterRevisaoCasoAdmin(item))
}

function marcarCasoAdminRevisado(from, item) {
  const chave = chaveCasoAdmin(item)
  if (!chave) return null
  const revisao = {
    por: chaveAdminWhatsApp(from) || null,
    em: new Date().toISOString(),
    ate: Date.now() + ADMIN_REVISADO_TTL_MS
  }
  revisoesCasosAdmin.set(chave, revisao)
  return revisao
}

function motivoPrioridadeAdmin(u, briefing = gerarBriefingCaso(u)) {
  const motivos = []
  if (briefing.scoreEmocional.nivel === "alto" || briefing.urgencia === "alta") motivos.push("urgente emocional")
  if (briefing.documentos.faltantesCriticos.length) motivos.push(`${briefing.documentos.faltantesCriticos.length} doc(s) critico(s)`)
  if (!briefing.numeroCaso) motivos.push("pre-cadastro")
  const idade = Date.now() - Number(u?.ultimaMsg || 0)
  if (idade > 2 * 60 * 60 * 1000 && !u?._fluxoEncerrado && u?.stage !== STAGES.CLIENTE) motivos.push(`sem resposta ha ${minutosParaTexto(idade)}`)
  if (briefing.consultaAtiva) motivos.push("consulta futura")
  return motivos.slice(0, 2).join(" + ") || briefing.proximaAcao || "acompanhar"
}

function scorePrioridadeAdmin({ u }) {
  const briefing = gerarBriefingCaso(u)
  let score = briefing.scoreOperacional || 0
  score += (briefing.scoreEmocional.valor || 0) * 10
  if (briefing.urgencia === "alta") score += 40
  if (briefing.documentos.faltantesCriticos.length) score += 20 + briefing.documentos.faltantesCriticos.length * 5
  if (!briefing.numeroCaso) score += 10
  const idade = Date.now() - Number(u?.ultimaMsg || 0)
  if (idade > 2 * 60 * 60 * 1000 && !u?._fluxoEncerrado && u?.stage !== STAGES.CLIENTE) score += 25
  if (briefing.consultaAtiva) score += 8
  return score
}

async function gerarPrioridadesAdmin(limite = 10) {
  const resumo = await adminResumoOperacional()
  if (!resumo.ok) return { ok: false, items: [], errorCode: resumo.errorCode, errorMessage: resumo.errorMessage }
  return {
    ok: true,
    items: resumo.todos
    .filter(({ u }) => Boolean(u))
    .map(item => ({ ...item, prioridadeScore: scorePrioridadeAdmin(item) }))
    .filter(item => !casoAdminRevisado(item))
    .filter(item => item.prioridadeScore > 0)
    .sort((a, b) => b.prioridadeScore - a.prioridadeScore)
    .slice(0, limite)
  }
}

function resolverTelefoneInterfaceAdmin(item, adminAutenticado = false) {
  if (!adminAutenticado) return ""
  return normalizarNumeroWhatsAppEnvio(item?.from || item?.u?._numero || item?.u?.whatsappContato)
}

function linhaPrioridadeAdmin(item, idx, { adminAutenticado = false } = {}) {
  const u = item.u
  const briefing = gerarBriefingCaso(u)
  const caso = briefing.numeroCaso ? `📄 Caso ${briefing.numeroCaso}` : "📄 Sem caso"
  const telefoneAdmin = resolverTelefoneInterfaceAdmin(item, adminAutenticado)
  const statusDocumental = sanitizarTextoEntrada(u.oraculumDocumentStatus || u.oraculum_document_status)
  const subtipo = sanitizarTextoEntrada(u.oraculumCaseSubtype || u.oraculum_case_subtype || u.subTipo)
  const quarentena = Array.isArray(u.documentosQuarentena) ? u.documentosQuarentena.length : Number(u.documentosQuarentena || 0)
  const divergencias = Array.isArray(u.divergenciasDocumentais) ? u.divergenciasDocumentais.length : Number(u.divergenciasDocumentais || 0)
  const tarefasAbertas = Array.isArray(u.tarefasAbertas) ? u.tarefasAbertas.length : Number(u.tarefasAbertas || 0)
  const consolidacao = sanitizarTextoEntrada(u.statusConsolidacao || u.consolidacaoDocumental?.status)
  return [
    `${idx}. 👤 *${briefing.nome || "Cliente"}*`,
    telefoneAdmin ? `   📱 ${telefoneAdmin}` : null,
    `   🚩 ${motivoPrioridadeAdmin(u, briefing)}`,
    `   ${caso} · ${briefing.stageLabel}`,
    `   🎯 Acao: ${briefing.proximaAcao || "acompanhar"}`
  ].filter(Boolean).join("\n")
}

function textoDetalheCasoAdmin(item, { adminAutenticado = false } = {}) {
  const { from, u } = item
  const briefing = gerarBriefingCaso(u)
  const docs = briefing.documentos
  const revisao = obterRevisaoCasoAdmin(item)
  const consulta = briefing.consultaAtiva
    ? "Ativa"
    : "Nao agendada"
  const alerta = maiorAlertaOperacionalAdmin(item)
  const relato = sanitizarTextoEntrada(briefing.relato || briefing.resumo || u.descricao || u.assuntoResumo)
  const relatoCurto = relato ? relato.slice(0, 700) + (relato.length > 700 ? "..." : "") : "Sem relato consolidado."
  const dossieJuridico = montarDossieJuridicoAdminWhatsApp(item)
  const telefoneAdmin = resolverTelefoneInterfaceAdmin(item, adminAutenticado)
  const statusDocumental = sanitizarTextoEntrada(u.oraculumDocumentStatus || u.oraculum_document_status)
  const subtipo = sanitizarTextoEntrada(u.oraculumCaseSubtype || u.oraculum_case_subtype || u.subTipo)
  const quarentena = Array.isArray(u.documentosQuarentena) ? u.documentosQuarentena.length : Number(u.documentosQuarentena || 0)
  const divergencias = Array.isArray(u.divergenciasDocumentais) ? u.divergenciasDocumentais.length : Number(u.divergenciasDocumentais || 0)
  const tarefasAbertas = Array.isArray(u.tarefasAbertas) ? u.tarefasAbertas.length : Number(u.tarefasAbertas || 0)
  const consolidacao = sanitizarTextoEntrada(u.statusConsolidacao || u.consolidacaoDocumental?.status)
  return [
    `👤 *${briefing.nome || "Cliente"}*`,
    "",
    `📄 Caso: ${briefing.numeroCaso || "sem caso"}`,
    telefoneAdmin ? `📱 WhatsApp: ${telefoneAdmin}` : "",
    `⚖️ Area: ${briefing.area || "nao definida"}`,
    `🧭 Tipo/subtipo: ${[u.tipo, subtipo].filter(Boolean).join(" / ") || "nao definido"}`,
    `📌 Status: ${briefing.stageLabel}`,
    `💬 Emocional: ${briefing.scoreEmocional.nivel}/${briefing.scoreEmocional.valor}`,
    `📎 Docs: ${docs.faltantesCriticos.length ? `${docs.faltantesCriticos.length} faltante(s)` : "sem critico faltante"}`,
    statusDocumental ? `🗃️ Status documental: ${statusDocumental}` : "",
    quarentena ? `🛡️ Quarentena: ${quarentena}` : "",
    divergencias ? `⚠️ Divergencias: ${divergencias}` : "",
    tarefasAbertas ? `✅ Tarefas abertas: ${tarefasAbertas}` : "",
    consolidacao ? `📚 Consolidação: ${consolidacao}` : "",
    `📅 Consulta: ${consulta}`,
    alerta ? `🚨 Alerta: ${alerta.texto}` : "",
    revisao ? `✅ Revisado: ate ${new Date(revisao.ate).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}` : "",
    briefing.hubspot ? `🔗 HubSpot: ${briefing.hubspot}` : "",
    briefing.drive ? `🗂️ Drive: ${briefing.drive}` : "",
    "",
    "🧾 *Relato*",
    relatoCurto,
    "",
    "🎯 *Proxima acao*",
    briefing.proximaAcao || "Acompanhar caso.",
    dossieJuridico ? "\n" + dossieJuridico : ""
  ].filter(Boolean).join("\n")
}

async function telaAdminPrincipal() {
  const resumo = await adminResumoOperacional()
  if (!resumo.ok) return telaAdminFalhaHubSpot()
  const semResposta = resumo.todos.filter(({ u }) => {
    const idade = Date.now() - Number(u.ultimaMsg || 0)
    return idade > 2 * 60 * 60 * 1000 && !u._fluxoEncerrado && u.stage !== STAGES.CLIENTE
  }).length

  return {
    texto: [
      "⚖️ *Admin Oraculum*",
      "",
      "📍 *Prioridade agora*",
      `🚨 ${resumo.urgentes} urgente(s)`,
      `📎 ${resumo.docsPendentes} com docs pendentes`,
      `📅 ${resumo.consultasAtivas} consulta(s) futura(s)`,
      `🔎 ${resumo.analise} em analise`,
      semResposta ? `⏳ ${semResposta} sem resposta ha mais de 2h` : "✅ Sem fila parada acima de 2h",
      "",
      `🧭 Fonte: ${resumo.fonte}`,
      "🔐 Sessao expira em 30 min sem uso.",
      "",
      "Escolha por onde agir."
    ].join("\n"),
    opcoes: [
      { id: ADMIN_IDS.prioridades, title: "📌 Prioridades" },
      { id: ADMIN_IDS.agenda, title: "📅 Agendar/consultas" },
      { id: ADMIN_IDS.casos, title: "📂 Casos" },
      { id: ADMIN_IDS.consultarCaso, title: "🔎 Consultar caso" },
      { id: ADMIN_IDS.completarInformacoes, title: "✏️ Completar dados" },
      { id: ADMIN_IDS.enviarDocumentos, title: "📎 Enviar documentos" },
      { id: ADMIN_IDS.alertas, title: "🚨 Alertas" },
      { id: ADMIN_IDS.resumo, title: "📊 Resumo diário" },
      { id: ADMIN_IDS.atendimentoAssistidoIa, title: "👨‍⚖️ Atendimento com IA" }
    ],
    registrarPergunta: false
  }
}

function iniciarConsultaCasoAdmin(from) {
  const chave = normalizarNumeroWhatsAppEnvio(from)
  const sessao = sessoesAdminWhatsApp.get(chave) || {}
  const {
    casos: _casos,
    casoSelecionado: _casoSelecionado,
    origemCasos: _origemCasos,
    listaAtiva: _listaAtiva,
    paginaAtual: _paginaAtual,
    tamanhoPagina: _tamanhoPagina,
    totalItens: _totalItens,
    totalPaginas: _totalPaginas,
    nextAfter: _nextAfter,
    ...sessaoSemListaDeCasos
  } = sessao
  sessoesAdminWhatsApp.set(chave, { ...sessaoSemListaDeCasos, acaoCasoPendente: "consultar", ts: Date.now() })
  return {
    texto: "🔎 *Consultar caso*\n\nInforme o protocolo, nome, CPF ou telefone. Identificadores serão exibidos de forma mascarada.",
    opcoes: [
      { id: ADMIN_IDS.casos, title: "📂 Ver todos os casos" },
      { id: ADMIN_IDS.menu, title: `🏠 ${ADMIN_MENU_LABELS.voltarMenu}` }
    ],
    registrarPergunta: false
  }
}

function encerrarConsultaPendenteAdmin(from) {
  const chave = normalizarNumeroWhatsAppEnvio(from)
  const sessao = sessoesAdminWhatsApp.get(chave) || {}
  if (sessao.acaoCasoPendente !== "consultar") return
  sessoesAdminWhatsApp.set(chave, { ...sessao, acaoCasoPendente: null, ts: Date.now() })
}

async function executarConsultaCasoAdmin(from, query) {
  // A consulta é pontual: qualquer resultado encerra a espera por texto.
  encerrarConsultaPendenteAdmin(from)
  const inicio = Date.now()
  const deals = []
  const dealIds = new Set()
  const cursors = new Set()
  let after = null
  do {
    const pagina = await resolverConsultaCasoAdmin(query, after)
    if (!pagina.ok) {
      logInfo({ event: "admin.cases.search", status: "error", queue: "consulta", errorCode: pagina.errorCode, durationMs: Date.now() - inicio })
      return telaAdminFalhaHubSpot()
    }
    for (const deal of pagina.deals) {
      if (deal?.id && !dealIds.has(String(deal.id))) {
        dealIds.add(String(deal.id))
        deals.push(deal)
      }
    }
    after = pagina.after
    if (after && cursors.has(String(after))) {
      logInfo({ event: "admin.cases.search", status: "error", queue: "consulta", errorCode: "PAGING_CURSOR_REPEATED", durationMs: Date.now() - inicio })
      return telaAdminFalhaHubSpot()
    }
    if (after) cursors.add(String(after))
  } while (after)
  const encontrados = searchAdminCases(deals.map(negocio => normalizarItemAdminLocal("", null, negocio, null)), query)
  logInfo({ event: "admin.cases.search", status: encontrados.length ? "success" : "empty", queue: "consulta", receivedCount: deals.length, filteredCount: encontrados.length, durationMs: Date.now() - inicio })
  const chave = normalizarNumeroWhatsAppEnvio(from)
  const sessao = sessoesAdminWhatsApp.get(chave) || {}
  if (!encontrados.length) {
    return {
      texto: "Nenhum caso encontrado nesta fila. Confira o dado e tente novamente.",
      opcoes: [{ id: ADMIN_IDS.menu, title: `🏠 ${ADMIN_MENU_LABELS.voltarMenu}` }],
      registrarPergunta: false
    }
  }
  const limitados = encontrados.slice(0, 8)
  salvarListaCasosAdmin(from, limitados.map(result => result.item), ADMIN_IDS.consultarCaso, 1, 8, encontrados.length, Math.ceil(encontrados.length / 8), null)
  const atual = sessoesAdminWhatsApp.get(chave) || {}
  sessoesAdminWhatsApp.set(chave, { ...atual, acaoCasoPendente: null, ts: Date.now() })
  return {
    texto: [
      "🔎 *Resultados da consulta*",
      "",
      ...limitados.map((result, index) => `${index + 1}. ${result.numeroCaso || "Sem protocolo"} · ${result.nomeMascarado} · CPF ${result.cpfMascarado} · Tel. ${result.telefoneMascarado}`),
      encontrados.length > limitados.length ? "\nRefine a busca para ver os demais resultados." : "",
      "",
      "Selecione o caso correto."
    ].filter(Boolean).join("\n"),
    opcoes: [
      ...limitados.map((result, index) => ({ id: `admin_caso_${index}`, title: `${index + 1}. ${result.numeroCaso || result.nomeMascarado}`.slice(0, 24) })),
      { id: ADMIN_IDS.menu, title: `🏠 ${ADMIN_MENU_LABELS.voltarMenu}` }
    ],
    registrarPergunta: false
  }
}

function iniciarComplementacaoCasoAdmin(from) {
  const item = obterCasoAdmin(from)
  if (!item?.u?.contatoId || !item?.u?.negocioId) return { texto: "Selecione novamente um caso com Contato e Negócio confirmados.", opcoes: [{ id: ADMIN_IDS.casos, title: "📂 Casos" }], registrarPergunta: false }
  const chave = normalizarNumeroWhatsAppEnvio(from)
  const sessao = sessoesAdminWhatsApp.get(chave) || {}
  sessoesAdminWhatsApp.set(chave, { ...sessao, acaoCasoPendente: "completar", ts: Date.now() })
  return {
    texto: "✏️ *Completar informações*\n\nEnvie somente um campo no formato `campo: valor`. Exemplo: `cidade: Recife`. Os demais dados serão preservados.",
    opcoes: [{ id: ADMIN_IDS.menu, title: `🏠 ${ADMIN_MENU_LABELS.voltarMenu}` }],
    registrarPergunta: false
  }
}

async function executarComplementacaoCasoAdmin(from, text) {
  const item = obterCasoAdmin(from)
  const match = sanitizarTextoEntrada(text).match(/^([\p{L}][\p{L}\d_]*)\s*:\s*(.+)$/u)
  if (!item?.u || !match) return { texto: "Use o formato `campo: valor`, alterando somente um campo.", opcoes: [{ id: ADMIN_IDS.menu, title: `🏠 ${ADMIN_MENU_LABELS.voltarMenu}` }], registrarPergunta: false }
  try {
    const operation = buildCaseComplement({ usuario: item.u, campo: match[1], valor: match[2], adminId: chaveAdminWhatsApp(from) })
    const atualizado = { ...item.u, ...operation.localPatch }
    if (Object.keys(operation.contactPatch).length) {
      const propriedades = montarPropsContatoHubSpot(atualizado.whatsappContato || item.from, atualizado)
      const aliases = { nome: ["firstname", "lastname"], telefone: ["phone", "mobilephone"], email: ["email", "work_email"], cpf: ["cpf_do_cliente"], dataNascimento: ["date_of_birth"], endereco: ["address"], numeroEndereco: ["address"], complementoEndereco: ["address"], bairro: ["address"], cidade: ["city"], uf: ["state"], cep: ["zip"] }
      const permitidas = aliases[match[1]] || []
      if (permitidas.length) {
        const patch = Object.fromEntries(Object.entries(propriedades).filter(([key]) => permitidas.includes(key)))
        if (!Object.keys(patch).length || !await hsAtualizarContato(item.u.contatoId, patch)) throw new Error("contact_update_not_confirmed")
      } else {
        const label = match[1].replace(/([a-z])([A-Z])/g, "$1 $2")
        atualizado.descricao = [sanitizarTextoEntrada(item.u.descricao), `${label}: ${sanitizarTextoEntrada(match[2])}`].filter(Boolean).join("\n")
        operation.localPatch.descricao = atualizado.descricao
        if (!await hsAtualizarNegocioSerializado(item.u.negocioId, getHubSpotDealStateProps(atualizado))) throw new Error("fallback_summary_update_not_confirmed")
      }
    }
    if (Object.keys(operation.dealPatch).length) {
      const dealProps = getHubSpotDealStateProps(atualizado)
      if (!await hsAtualizarNegocioSerializado(item.u.negocioId, dealProps)) throw new Error("deal_update_not_confirmed")
    }
    applyComplementLocally(item.u, operation)
    agendarPersistenciaUsers()
    const chave = normalizarNumeroWhatsAppEnvio(from)
    const sessao = sessoesAdminWhatsApp.get(chave) || {}
    sessoesAdminWhatsApp.set(chave, { ...sessao, acaoCasoPendente: null, ts: Date.now() })
    return { texto: `✅ Campo *${match[1]}* atualizado. Os demais dados foram preservados.`, opcoes: [{ id: ADMIN_IDS.casoCompletar, title: "✏️ Alterar outro campo" }, { id: ADMIN_IDS.menu, title: `🏠 ${ADMIN_MENU_LABELS.voltarMenu}` }], registrarPergunta: false }
  } catch {
    return { texto: "Não foi possível confirmar a atualização. Nenhum dado foi apagado.", opcoes: [{ id: ADMIN_IDS.casoCompletar, title: "✏️ Tentar novamente" }, { id: ADMIN_IDS.menu, title: `🏠 ${ADMIN_MENU_LABELS.voltarMenu}` }], registrarPergunta: false }
  }
}

function iniciarEnvioDocumentoCasoAdmin(from) {
  const item = obterCasoAdmin(from)
  const folderId = item?.u?.pastaDriveId || item?.u?.caseFolderId
  if (!item?.u?.numeroCaso || !folderId) return { texto: "Selecione um caso com pasta confirmada antes de enviar o documento.", opcoes: [{ id: ADMIN_IDS.casos, title: "📂 Casos" }], registrarPergunta: false }
  const chave = normalizarNumeroWhatsAppEnvio(from)
  const sessao = sessoesAdminWhatsApp.get(chave) || {}
  sessoesAdminWhatsApp.set(chave, { ...sessao, acaoCasoPendente: "enviar_documento", ts: Date.now() })
  return {
    texto: `📤 *Anexar documento*\n\nCaso: ${item.u.numeroCaso}\nEnvie um PDF, JPEG ou PNG. O sucesso só será informado após confirmação do Drive.`,
    opcoes: [{ id: ADMIN_IDS.menu, title: `🏠 ${ADMIN_MENU_LABELS.voltarMenu}` }],
    registrarPergunta: false
  }
}

async function executarDocumentoCasoSelecionadoAdmin(from, msgObj) {
  const chave = normalizarNumeroWhatsAppEnvio(from)
  const sessao = sessoesAdminWhatsApp.get(chave) || {}
  const item = ["enviar_documento", "completar"].includes(sessao.acaoCasoPendente) ? obterCasoAdmin(from) : null
  if (!item?.u) return null
  try {
    const esperado = String(item.u.cpf || item.u._cpf || "").replace(/\D/g, "")
    const result = await processExistingCaseAdminMedia({
      staging: adminAssistedMediaStaging,
      message: msgObj,
      caseRecord: {
        numeroCaso: item.u.numeroCaso,
        caseFolderId: item.u.pastaDriveId || item.u.caseFolderId,
        cpf: esperado,
        receivedDocuments: item.u._canonicalDocuments || {}
      },
      deps: {
        downloadMedia: baixarMidia,
        analyzeDocument: input => executarPipelineDocumental(input),
        resolveIntegrity: async ({ pipeline }) => {
          const campos = pipeline?.extracao?.camposExtraidos || {}
          const encontrado = String(campos.cpf || campos.cpf_do_cliente || "").replace(/\D/g, "")
          return esperado && encontrado && esperado === encontrado
            ? { approved: true, partyRole: "titular" }
            : { approved: false, partyRole: null, reason: esperado && encontrado ? "cpf_divergente" : "identidade_documental_nao_confirmada" }
        },
        uploadVerified: async ({ folderId, name, buffer, mimeType, sha256 }) => {
          const arquivo = await uploadDrive(folderId, name, buffer, mimeType)
          return arquivo?.id ? { id: arquivo.id, sha256, webViewLink: arquivo.webViewLink || null } : null
        }
      }
    })
    if (!result.ok) {
      return {
        texto: result.reviewRequired
          ? "⚠️ Documento recebido em quarentena. A identidade precisa ser conferida antes do envio ao caso."
          : "Não foi possível validar o arquivo. Nenhum documento foi confirmado.",
        opcoes: [{ id: ADMIN_IDS.casoEnviarDocumento, title: "📤 Tentar novamente" }, { id: ADMIN_IDS.menu, title: `🏠 ${ADMIN_MENU_LABELS.voltarMenu}` }],
        registrarPergunta: false,
        audio: false
      }
    }
    item.u._canonicalDocuments = item.u._canonicalDocuments || {}
    item.u._canonicalDocuments[result.sha256] = {
      fileId: result.fileId,
      sha256: result.sha256,
      category: result.document?.category || null,
      storageCategory: result.document?.storageCategory || "Outros",
      status: "uploaded",
      uploadedAt: new Date().toISOString()
    }
    item.u.documentosEnviados = true
    agendarPersistenciaUsers()
    sessoesAdminWhatsApp.set(chave, { ...sessao, acaoCasoPendente: sessao.acaoCasoPendente === "completar" ? "completar" : null, ts: Date.now() })
    return { texto: `✅ Documento confirmado no caso ${item.u.numeroCaso}.`, opcoes: [{ id: ADMIN_IDS.casoEnviarDocumento, title: "📤 Enviar outro" }, { id: ADMIN_IDS.menu, title: `🏠 ${ADMIN_MENU_LABELS.voltarMenu}` }], registrarPergunta: false, audio: false }
  } catch (error) {
    logErro("admin_document_upload", `Falha técnica; code=${sanitizarTextoEntrada(error?.code) || "ADMIN_MEDIA_UPLOAD_FAILED"}`)
    return { texto: "Não foi possível confirmar o documento no Drive. Nenhum sucesso foi registrado; você pode tentar novamente.", opcoes: [{ id: ADMIN_IDS.casoEnviarDocumento, title: "📤 Tentar novamente" }, { id: ADMIN_IDS.menu, title: `🏠 ${ADMIN_MENU_LABELS.voltarMenu}` }], registrarPergunta: false, audio: false }
  }
}

function iniciarAgendamentoCasoAdmin(from) {
  const item = obterCasoAdmin(from)
  if (!item?.u?.negocioId) return { texto: "Selecione um caso com Negócio confirmado antes de agendar.", opcoes: [{ id: ADMIN_IDS.casos, title: "📂 Casos" }], registrarPergunta: false }
  const chave = normalizarNumeroWhatsAppEnvio(from)
  const sessao = sessoesAdminWhatsApp.get(chave) || {}
  sessoesAdminWhatsApp.set(chave, { ...sessao, acaoCasoPendente: "agendar", ts: Date.now() })
  return { texto: "📅 *Agendar atendimento*\n\nInforme data e hora em formato ISO, por exemplo: `2026-08-10T13:00:00-03:00`.", opcoes: [{ id: ADMIN_IDS.menu, title: `🏠 ${ADMIN_MENU_LABELS.voltarMenu}` }], registrarPergunta: false }
}

async function executarAgendamentoCasoAdmin(from, text) {
  const item = obterCasoAdmin(from)
  const dataHora = sanitizarTextoEntrada(text)
  if (!item?.u || !dataHora || Number.isNaN(new Date(dataHora).getTime())) return { texto: "Data ou hora inválida. Use o formato ISO informado.", opcoes: [{ id: ADMIN_IDS.casoAgendar, title: "📅 Tentar novamente" }, { id: ADMIN_IDS.menu, title: `🏠 ${ADMIN_MENU_LABELS.voltarMenu}` }], registrarPergunta: false }
  const calendarConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN)
  const result = await scheduleAdminCase({ usuario: item.u, dataHora, duracaoMin: 60, createEvent: calendarConfigured ? criarEventoConsulta : undefined })
  const chave = normalizarNumeroWhatsAppEnvio(from)
  const sessao = sessoesAdminWhatsApp.get(chave) || {}
  sessoesAdminWhatsApp.set(chave, { ...sessao, acaoCasoPendente: null, ts: Date.now() })
  if (!result.ok) {
    item.u.adminSchedulingPending = { requestedAt: new Date().toISOString(), dataHora, status: "pending_human" }
    agendarPersistenciaUsers()
    return { texto: "Solicitação registrada, aguardando confirmação", opcoes: [{ id: ADMIN_IDS.menu, title: `🏠 ${ADMIN_MENU_LABELS.voltarMenu}` }], registrarPergunta: false }
  }
  item.u.consultaEventoId = result.eventId
  item.u.consultaStatus = "agendada"
  agendarPersistenciaUsers()
  return { texto: `✅ Agendamento confirmado. Evento: ${result.eventId}`, opcoes: [{ id: ADMIN_IDS.agenda, title: "📅 Ver consultas" }, { id: ADMIN_IDS.menu, title: `🏠 ${ADMIN_MENU_LABELS.voltarMenu}` }], registrarPergunta: false }
}

async function telaAdminPrioridades(from, pagina = 1) {
  try {
    const tamanhoPagina = 8
    const prioridades = await gerarPrioridadesAdmin(100)
    if (!prioridades.ok) return telaAdminFalhaHubSpot()
    const itens = prioridades.items
    const totalItens = itens.length
    const totalPaginas = Math.max(1, Math.ceil(totalItens / tamanhoPagina))
    const inicio = (pagina - 1) * tamanhoPagina
    const itensPagina = itens.slice(inicio, inicio + tamanhoPagina)

    salvarListaCasosAdmin(from, itens, ADMIN_IDS.prioridades, pagina, tamanhoPagina, totalItens, totalPaginas, null)
    if (!itensPagina.length) {
      return {
        texto: "📌 *Prioridades*\n\n✅ Nao encontrei casos com risco operacional relevante agora.",
        opcoes: [
          { id: ADMIN_IDS.menu, title: `🏠 ${ADMIN_MENU_LABELS.voltarMenu}` },
          { id: ADMIN_IDS.casos, title: "📂 Casos" }
        ],
        registrarPergunta: false
      }
    }

    // Contar casos e pré-atendimentos
    const casosComNumero = itens.filter(item => Boolean(item?.u?.numeroCaso)).length
    const preAtendimentos = itens.length - casosComNumero

    const linhas = itensPagina.map((item, idx) => linhaPrioridadeAdmin(item, idx + 1 + inicio, { adminAutenticado: true }))
    const opcoes = [
      ...itensPagina.map((item, idx) => ({
        id: `admin_caso_${idx + inicio}`,
        title: tituloOpcaoCasoAdmin(item, idx + inicio)
      }))
    ]

    // Navegação entre páginas
    if (pagina > 1) opcoes.push({ id: `admin_prioridades_pagina_${pagina - 1}`, title: "⬅️ Anterior" })
    if (pagina < totalPaginas) opcoes.push({ id: `admin_prioridades_pagina_${pagina + 1}`, title: "➡️ Próxima" })
    opcoes.push({ id: ADMIN_IDS.menu, title: `🏠 ${ADMIN_MENU_LABELS.voltarMenu}` })

    const inicioExibicao = totalItens === 0 ? 0 : (pagina - 1) * tamanhoPagina + 1
    const fimExibicao = Math.min(pagina * tamanhoPagina, totalItens)

    const composicao = casosComNumero > 0 && preAtendimentos > 0
      ? `Casos: ${casosComNumero} · Pre-atendimentos: ${preAtendimentos}`
      : (casosComNumero > 0 ? `Casos: ${casosComNumero}` : `Pre-atendimentos: ${preAtendimentos}`)

    return {
      texto: [
        "📌 *Prioridades*",
        "",
        ...linhas,
        "",
        `Página ${pagina} de ${totalPaginas}`,
        `Exibindo ${inicioExibicao}–${fimExibicao} de ${totalItens}`,
        composicao,
        "",
        "Toque em um caso para ver o detalhe."
      ].join("\n\n"),
      opcoes,
      registrarPergunta: false
    }
  } catch (erro) {
    logErro("admin", `telaAdminPrioridades falhou: ${mascararErroHubSpot(erro)}`)
    return {
      texto: "📌 *Prioridades*\n\n⚠️ O HubSpot esta temporariamente ocupado.\n\nSua sessao admin permanece ativa. Tente novamente em alguns segundos.",
      opcoes: [
        { id: ADMIN_IDS.prioridades, title: "🔄 Tentar novamente" },
        { id: ADMIN_IDS.menu, title: `🏠 ${ADMIN_MENU_LABELS.voltarMenu}` }
      ],
      registrarPergunta: false
    }
  }
}

async function telaAdminCasos() {
  const resumo = await adminResumoOperacional()
  if (!resumo.ok) return telaAdminFalhaHubSpot()
  const novos = resumo.todos.filter(({ u }) => [HS_STAGE.LEAD, HS_STAGE.CADASTRO].includes(u.negocioStageId) || (!u.numeroCaso && u.stage !== STAGES.CLIENTE)).length
  const analise = resumo.analise
  const docs = resumo.docsPendentes

  return {
    texto: [
      "📂 *Filas de casos*",
      "",
      `🆕 Novos/pre-cadastro: ${novos}`,
      `🔎 Em analise: ${analise}`,
      `📎 Com documentos pendentes: ${docs}`,
      "",
      "Escolha uma fila."
    ].join("\n"),
    opcoes: [
      { id: ADMIN_IDS.casosNovos, title: "🆕 Novos casos" },
      { id: ADMIN_IDS.casosAnalise, title: "🔎 Casos em análise" },
      { id: ADMIN_IDS.casosDocs, title: "📎 Documentos pendentes" },
      { id: ADMIN_IDS.casosAtivos, title: "📋 Todos ativos" },
      { id: ADMIN_IDS.menu, title: `🏠 ${ADMIN_MENU_LABELS.voltarMenu}` }
    ],
    registrarPergunta: false
  }
}

async function telaAdminAlertas() {
  const resumo = await adminResumoOperacional()
  if (!resumo.ok) return telaAdminFalhaHubSpot()
  const criticos = resumo.todos.filter(({ u }) => {
    const emocional = scoreEmocional(u)
    return u.urgencia === "alta" || u.stage === STAGES.AGUARDANDO_URGENTE || emocional.nivel === "alto"
  }).length
  const parados = resumo.todos.filter(({ u }) => {
    const idade = Date.now() - Number(u.ultimaMsg || 0)
    return idade > 2 * 60 * 60 * 1000 && !u._fluxoEncerrado && u.stage !== STAGES.CLIENTE
  }).length
  const docs = resumo.docsPendentes
  const agenda = resumo.consultasAtivas

  return {
    texto: [
      "🚨 *Alertas*",
      "",
      `🔥 Criticos: ${criticos}`,
      `⏳ Parados: ${parados}`,
      `📎 Docs: ${docs}`,
      `📅 Agenda: ${agenda}`,
      "",
      "Escolha uma fila para agir."
    ].join("\n"),
    opcoes: [
      { id: ADMIN_IDS.alertasCriticos, title: "🔥 Casos críticos" },
      { id: ADMIN_IDS.alertasParados, title: "⏳ Casos parados" },
      { id: ADMIN_IDS.alertasDocs, title: "📎 Documentos pendentes" },
      { id: ADMIN_IDS.alertasAgenda, title: "📅 Consultas futuras" },
      { id: ADMIN_IDS.resumo, title: "📊 Resumo diário" },
      { id: ADMIN_IDS.menu, title: `🏠 ${ADMIN_MENU_LABELS.voltarMenu}` }
    ],
    registrarPergunta: false
  }
}

function telaAdminListaCasos(from, titulo, itens, vazio, voltar = ADMIN_IDS.casos, pagina = 1, totalPaginas = 1) {
  const tamanhoPagina = 8
  salvarListaCasosAdmin(from, itens, voltar, pagina, tamanhoPagina, itens.length, totalPaginas, null)
  if (!itens.length) {
    return {
      texto: `${titulo}\n\n${vazio}`,
      opcoes: [
        { id: voltar, title: "⬅️ Voltar" },
        { id: ADMIN_IDS.menu, title: `🏠 ${ADMIN_MENU_LABELS.voltarMenu}` }
      ],
      registrarPergunta: false
    }
  }

  const inicio = (pagina - 1) * tamanhoPagina
  const itensExibidos = itens.slice(inicio, inicio + tamanhoPagina)
  const linhas = itensExibidos.map((item, idx) => resumoCasoAdmin(item, idx + 1 + inicio, { adminAutenticado: true }))
  const nomesOpcoes = itensExibidos.map(item => primeiroEUltimoNome(resolverNomeBriefing(item.u)) || "Cliente")
  const contagemNomes = nomesOpcoes.reduce((acc, nome) => {
    const chave = normalizarNomeComparacao(nome)
    acc.set(chave, (acc.get(chave) || 0) + 1)
    return acc
  }, new Map())
  const opcoes = [
    ...itensExibidos.map((item, idx) => ({
      id: `admin_caso_${idx + inicio}`,
      title: tituloOpcaoCasoAdmin(item, idx + inicio, {
        nomeCurto: nomesOpcoes[idx],
        duplicado: contagemNomes.get(normalizarNomeComparacao(nomesOpcoes[idx])) > 1
      })
    }))
  ]
  if (pagina > 1) opcoes.push({ id: `admin_casos_pagina_${pagina - 1}`, title: "⬅️ Página anterior" })
  if (pagina < totalPaginas) opcoes.push({ id: `admin_casos_pagina_${pagina + 1}`, title: "Próxima página ➡️" })
  opcoes.push(
    { id: voltar, title: ADMIN_MENU_LABELS.voltarLista },
    { id: ADMIN_IDS.menu, title: ADMIN_MENU_LABELS.voltarMenu }
  )
  const inicioExibicao = itens.length === 0 ? 0 : (pagina - 1) * tamanhoPagina + 1
  const fimExibicao = Math.min(pagina * tamanhoPagina, itens.length)
  return {
    texto: [titulo, "", ...linhas, "", `Página ${pagina} de ${totalPaginas}`, `Exibindo ${inicioExibicao}–${fimExibicao} de ${itens.length}`, "Toque em um caso para ver o detalhe operacional."].join("\n\n"),
    opcoes,
    registrarPergunta: false
  }
}

function telaAdminFalhaHubSpot() {
  return {
    texto: "Não foi possível consultar os casos no HubSpot agora. Tente novamente em alguns minutos.",
    opcoes: [{ id: ADMIN_IDS.casos, title: "📂 Filas de casos" }, { id: ADMIN_IDS.menu, title: `🏠 ${ADMIN_MENU_LABELS.voltarMenu}` }],
    registrarPergunta: false
  }
}

async function telaAdminCasosNovos(from) {
  const filtro = u => [HS_STAGE.LEAD, HS_STAGE.CADASTRO].includes(u.negocioStageId) || (!u.numeroCaso && u.stage !== STAGES.CLIENTE)
  const resultado = await adminFonteCasos(filtro, [HS_STAGE.LEAD, HS_STAGE.CADASTRO], 100)
  if (!resultado.ok) return telaAdminFalhaHubSpot()
  const { items: itens, total } = resultado
  const totalPaginas = Math.max(1, Math.ceil(total / 8))
  return telaAdminListaCasos(from, "🆕 *Novos casos e pre-cadastros*", itens, "✅ Nao encontrei novos casos ou pre-cadastros parados.", ADMIN_IDS.casos, 1, totalPaginas)
}

async function telaAdminCasosAnalise(from) {
  const filtro = u => u.negocioStageId === HS_STAGE.ANALISE && Boolean(u.numeroCaso)
  const resultado = await adminFonteCasos(filtro, [HS_STAGE.ANALISE], 100)
  if (!resultado.ok) return telaAdminFalhaHubSpot()
  const { items: itens, total } = resultado
  const totalPaginas = Math.max(1, Math.ceil(total / 8))
  return telaAdminListaCasos(from, "🔎 *Casos em analise*", itens, "✅ Nao encontrei casos em analise no HubSpot nem na memoria atual.", ADMIN_IDS.casos, 1, totalPaginas)
}

async function telaAdminCasosDocumentos(from) {
  const filtro = u => calcularStatusDocumentos(u).faltantesCriticos.length > 0 && Boolean(u.numeroCaso)
  const resultado = await adminFonteCasos(filtro, [HS_STAGE.AGUARDANDO_DOCS, HS_STAGE.ANALISE, HS_STAGE.DOCS], 100)
  if (!resultado.ok) return telaAdminFalhaHubSpot()
  const { items: itens, total } = resultado
  const totalPaginas = Math.max(1, Math.ceil(total / 8))
  return telaAdminListaCasos(from, "📎 *Casos com documentos pendentes*", itens, "✅ Nao encontrei casos com documentos criticos pendentes.", ADMIN_IDS.casos, 1, totalPaginas)
}

async function telaAdminCasosAtivos(from) {
  const stages = Object.values(HS_STAGE).filter(stage => stage !== HS_STAGE.FINAL)
  const resultado = await hsAdminBuscarTodosNegociosPorStages(stages, "todos_ativos")
  if (!resultado.ok) return telaAdminFalhaHubSpot()
  const hubspot = resultado.deals.map(negocio => normalizarItemAdminLocal("", null, negocio, null))
  const itens = mesclarItensAdminPorIdentidade(hubspot, usuariosAdminOrdenados())
  logInfo({ event: "admin.cases.session", status: itens.length ? "saved" : "empty", queue: "todos_ativos", receivedCount: hubspot.length, hubspotTotal: resultado.total, filteredCount: itens.length })
  return telaAdminListaCasos(from, "📋 *Todos os casos ativos*", itens, "Nenhum caso encontrado nesta fila.", ADMIN_IDS.casos, 1, Math.max(1, Math.ceil(itens.length / 8)))
}

async function telaAdminAlertasUrgentes(from) {
  const filtro = u => u.urgencia === "alta" || u.stage === STAGES.AGUARDANDO_URGENTE || scoreEmocional(u).nivel === "alto"
  const resultado = await adminFonteCasos(filtro, Object.values(HS_STAGE).filter(stage => stage !== HS_STAGE.FINAL), 100)
  if (!resultado.ok) return telaAdminFalhaHubSpot()
  const { items: itens, total } = resultado
  const totalPaginas = Math.max(1, Math.ceil(total / 8))
  return telaAdminListaCasos(from, "🔥 *Alertas criticos*", itens, "✅ Nao encontrei alerta critico no HubSpot nem na memoria atual.", ADMIN_IDS.alertas, 1, totalPaginas)
}

async function telaAdminAlertasSemResposta(from) {
  const filtro = u => {
    const idade = Date.now() - Number(u.ultimaMsg || 0)
    return idade > 2 * 60 * 60 * 1000 && !u._fluxoEncerrado && u.stage !== STAGES.CLIENTE
  }
  const resultado = await adminFonteCasos(filtro, [HS_STAGE.LEAD, HS_STAGE.CADASTRO, HS_STAGE.ANALISE], 100)
  if (!resultado.ok) return telaAdminFalhaHubSpot()
  const { items: itens, total } = resultado
  const totalPaginas = Math.max(1, Math.ceil(total / 8))
  return telaAdminListaCasos(from, "⏳ *Casos parados*", itens, "✅ Nao encontrei pre-atendimentos parados ha mais de 2 horas.", ADMIN_IDS.alertas, 1, totalPaginas)
}

async function telaAdminAlertasDocs(from) {
  const filtro = u => calcularStatusDocumentos(u).faltantesCriticos.length > 0 && Boolean(u.numeroCaso)
  const resultado = await adminFonteCasos(filtro, [HS_STAGE.AGUARDANDO_DOCS, HS_STAGE.ANALISE, HS_STAGE.DOCS], 100)
  if (!resultado.ok) return telaAdminFalhaHubSpot()
  const { items: itens, total } = resultado
  const totalPaginas = Math.max(1, Math.ceil(total / 8))
  return telaAdminListaCasos(from, "📎 *Alertas de documentos*", itens, "✅ Nao encontrei documentos criticos pendentes.", ADMIN_IDS.alertas, 1, totalPaginas)
}

async function telaAdminAlertasAgenda(from) {
  const itens = await obterConsultasAtivasAdmin()
  return telaAdminListaCasos(from, "📅 *Alertas de agenda*", itens, "✅ Nao encontrei consultas futuras ativas.", ADMIN_IDS.alertas)
}

async function telaAdminResumoDiario() {
  const resumo = await gerarResumoDiarioOperacional({ limite: 10 })
  if (!resumo.ok) return telaAdminFalhaHubSpot()

  return {
    texto: textoResumoDiarioOperacional(resumo),
    opcoes: [
      { id: ADMIN_IDS.prioridades, title: "📌 Prioridades" },
      { id: ADMIN_IDS.alertas, title: "🚨 Alertas" },
      { id: ADMIN_IDS.casos, title: "📂 Casos" },
      { id: ADMIN_IDS.menu, title: `🏠 ${ADMIN_MENU_LABELS.voltarMenu}` }
    ],
    registrarPergunta: false
  }
}

function telaDetalheCasoAdmin(from, idx) {
  const item = obterCasoAdmin(from, idx)
  if (!item) {
    return {
      texto: "A lista anterior expirou. Abra novamente Filas de casos e selecione o caso.",
      opcoes: [
        { id: ADMIN_IDS.prioridades, title: "Prioridades" },
        { id: ADMIN_IDS.casos, title: "Casos" }
      ],
      registrarPergunta: false
    }
  }

  const chaveAdmin = normalizarNumeroWhatsAppEnvio(from)
  const sessao = sessoesAdminWhatsApp.get(chaveAdmin) || {}
  const voltar = sessao.origemCasos || ADMIN_IDS.prioridades

  const botaoPosAtendimento = montarBotaoAtendimentoRealizado(item.u?.negocioId, item.u?.numeroCaso, {
    adminId: normalizarNumeroWhatsAppEnvio(from),
    contatoId: item.u?.contatoId,
    customerPhone: normalizarNumeroWhatsAppEnvio(item.from || item.u?._numero || item.u?.whatsappContato),
    customerPhoneConfirmed: item.u?.telefoneEhDoCliente === true,
    actionContextRepository: postHumanActionContextRepository
  })
  const preferencia = obterPreferenciaComunicacao(item.u, item.from || from)
  const montarTela = botao => ({
    texto: `${textoDetalheCasoAdmin(item, { adminAutenticado: true })}\n\n${rotuloPreferenciaComunicacao(preferencia)}`,
    opcoes: [
      botao,
      { id: ADMIN_IDS.casoMarcarUrgente, title: `🚨 ${ADMIN_MENU_LABELS.marcarUrgente}` },
      { id: ADMIN_IDS.casoEnviarAnalise, title: `📝 ${ADMIN_MENU_LABELS.registrarAnalise}` },
      { id: ADMIN_IDS.casoPedirDocs, title: `📎 ${ADMIN_MENU_LABELS.pedirDocumentos}` },
      { id: ADMIN_IDS.casoCompletar, title: "✏️ Completar dados" },
      { id: ADMIN_IDS.casoEnviarDocumento, title: "📤 Anexar documento" },
      { id: ADMIN_IDS.casoAgendar, title: "📅 Agendar atendimento" },
      { id: ADMIN_IDS.casoPreferenciaComunicacao, title: "💬 Preferência de comunicação" },
      { id: voltar, title: `⬅️ ${ADMIN_MENU_LABELS.voltarLista}` },
      { id: ADMIN_IDS.agenda, title: `📅 ${ADMIN_MENU_LABELS.verConsultas}` },
      { id: ADMIN_IDS.menu, title: `🏠 ${ADMIN_MENU_LABELS.voltarMenu}` }
    ],
    registrarPergunta: false
  })
  return botaoPosAtendimento ? waitForActionContextButton(botaoPosAtendimento).then(montarTela) : montarTela(null)
}

function telaPreferenciaComunicacaoAdmin(from) {
  const item = obterCasoAdmin(from)
  if (!item?.u?.contatoId) return { texto: "Este caso não possui contato confirmado. Nenhuma preferência foi alterada.", opcoes: [{ id: ADMIN_IDS.casos, title: "📂 Casos" }], registrarPergunta: false }
  const atual = obterPreferenciaComunicacao(item.u, item.from || from)
  return {
    texto: `💬 *Preferência de comunicação*\n\nAtual: ${rotuloPreferenciaComunicacao(atual)}\n\nEscolha a preferência para todos os casos desta pessoa.`,
    opcoes: [
      { id: ADMIN_IDS.preferenciaTexto, title: "📝 Texto" },
      { id: ADMIN_IDS.preferenciaAudioSempre, title: "🔊 Sempre com áudio" },
      { id: ADMIN_IDS.preferenciaNaoDefinida, title: "❓ Não definida" },
      { id: `admin_caso_${(sessoesAdminWhatsApp.get(normalizarNumeroWhatsAppEnvio(from)) || {}).casoSelecionado || 0}`, title: "⬅️ Voltar ao caso" }
    ], registrarPergunta: false
  }
}

async function atualizarPreferenciaComunicacaoAdmin(from, preference) {
  const item = obterCasoAdmin(from)
  if (!item?.u?.contatoId) return { texto: "Este caso não possui contato confirmado. Nenhuma preferência foi alterada.", opcoes: [{ id: ADMIN_IDS.casos, title: "📂 Casos" }], registrarPergunta: false }
  definirPreferenciaComunicacao(item.u, item.from || from, preference, "admin_manual")
  return await telaDetalheCasoAdmin(from)
}

function telaLinksCasoAdmin(from) {
  const item = obterCasoAdmin(from)
  if (!item) {
    return {
      texto: "Nao encontrei o caso selecionado. Abra *Prioridades* ou *Casos* para atualizar.",
      opcoes: [
        { id: ADMIN_IDS.prioridades, title: "Prioridades" },
        { id: ADMIN_IDS.casos, title: "Casos" }
      ],
      registrarPergunta: false
    }
  }

  const { u } = item
  const telefoneAdmin = resolverTelefoneInterfaceAdmin(item, true)
  return {
    texto: [
      "🔗 *Links do caso*",
      "",
      `👤 Cliente: ${u.nome || u.nomeWA || "Cliente"}`,
      `📄 Caso: ${u.numeroCaso || "-"}`,
      u.negocioId ? `🔗 HubSpot: ${linkHubSpot(u.negocioId)}` : "⚠️ HubSpot: nao encontrado",
      u.pastaDriveLink ? `🗂️ Drive: ${u.pastaDriveLink}` : "⚠️ Drive: nao encontrado",
      telefoneAdmin ? `📱 WhatsApp: ${telefoneAdmin}` : ""
    ].filter(Boolean).join("\n"),
    opcoes: [
      { id: ADMIN_IDS.casoRevisado, title: `✅ ${ADMIN_MENU_LABELS.marcarRevisado}` },
      { id: ADMIN_IDS.prioridades, title: "📌 Prioridades" },
      { id: ADMIN_IDS.menu, title: `🏠 ${ADMIN_MENU_LABELS.voltarMenu}` }
    ],
    registrarPergunta: false
  }
}

async function marcarCasoRevisadoAdmin(from) {
  invalidarCacheResumoOperacional()
  const item = obterCasoAdmin(from)
  if (!item) {
    return {
      texto: "Nao encontrei o caso selecionado. Abra *Prioridades* ou *Casos* para atualizar.",
      opcoes: [
        { id: ADMIN_IDS.prioridades, title: "Prioridades" },
        { id: ADMIN_IDS.casos, title: "Casos" }
      ],
      registrarPergunta: false
    }
  }

  const revisao = marcarCasoAdminRevisado(from, item)
  const ate = revisao
    ? new Date(revisao.ate).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
    : "algumas horas"
  return {
    texto: [
      "✅ *Caso marcado como revisado.*",
      "",
      `👤 Cliente: ${item.u?.nome || item.u?.nomeWA || "Cliente"}`,
      `📄 Caso: ${item.u?.numeroCaso || "-"}`,
      `📌 Ele sai de *Prioridades* ate ${ate}.`
    ].join("\n"),
    opcoes: [
      { id: ADMIN_IDS.prioridades, title: "📌 Prioridades" },
      { id: ADMIN_IDS.casos, title: "📂 Casos" },
      { id: ADMIN_IDS.menu, title: `🏠 ${ADMIN_MENU_LABELS.voltarMenu}` }
    ],
    registrarPergunta: false
  }
}

function preferenciaAudioSempreCanonica(u, from) {
  const record = communicationPreferences.resolve({
    contactId: u?.contatoId,
    phoneNormalized: telefonePreferenciaComunicacao(u, from),
    snapshotPreference: u?.communicationPreference,
    modoTexto: u?.modoTexto
  })
  return record?.preference === "audio_sempre" && record.source !== "migracao_legado" && Boolean(record.selectedAt)
}

function chaveAtivaAudioPedidoDocumentos(u, from) {
  const contact = sanitizarTextoEntrada(u?.contatoId) || telefonePreferenciaComunicacao(u, from)
  const deal = sanitizarTextoEntrada(u?.negocioId)
  const caso = sanitizarTextoEntrada(u?.numeroCaso)
  return `admin_document_request_audio:${contact}:${deal}:${caso}`
}

async function consumirPendenciaAudioPedidoDocumentos(from) {
  const u = users[from]
  if (!u || ehWhatsAppAdmin(from)) return false
  const pendencia = reservarPendenciaAudioPedidoDocumentos({
    contactId: u.contatoId,
    phoneNormalized: telefonePreferenciaComunicacao(u, from),
    dealId: u.negocioId,
    numeroCaso: u.numeroCaso
  })
  if (!pendencia) return false

  if (!preferenciaAudioSempreCanonica(u, from)) {
    concluirPendenciaAudioPedidoDocumentos(pendencia.operationId, { status: "suppressed", reason: "preference_changed" })
    logInfo({ event: "admin.document_request_audio", status: "suppressed", reason: "preference_changed", action: "pedir_documentos" })
    return false
  }

  try {
    const ogg = await gerarAudioAtendente(u.atendente, pendencia.audioText)
    const envio = await enviarAudioTransportComResultado(from, urlAudioAtendente(ogg))
    if (!envio?.accepted) {
      concluirPendenciaAudioPedidoDocumentos(pendencia.operationId, { status: "pending", reason: envio?.immediateError || "audio_send_failed" })
      logInfo({ event: "admin.document_request_audio", status: "failed", action: "pedir_documentos" })
      return false
    }
    concluirPendenciaAudioPedidoDocumentos(pendencia.operationId, { status: "sent", providerMessageId: envio.providerMessageId })
    if (envio.providerMessageId) registrarMensagemOutbound({
      providerMessageId: envio.providerMessageId, numeroCaso: u.numeroCaso, contactId: u.contatoId,
      dealId: u.negocioId, action: "pedir_documentos_audio", channel: envio.channel,
      destinationMasked: envio.destinationMasked
    })
    logInfo({ event: "admin.document_request_audio", status: "sent", action: "pedir_documentos" })
    return true
  } catch (error) {
    concluirPendenciaAudioPedidoDocumentos(pendencia.operationId, { status: "pending", reason: "tts_failed" })
    logErro("tts", "Falha áudio pendente pedir documentos admin", error)
    return false
  }
}

async function pedirDocsCasoAdmin(from) {
  invalidarCacheResumoOperacional()
  const item = obterCasoAdmin(from)
  if (!item) {
    return {
      texto: "Nao encontrei o caso selecionado. Abra *Prioridades* ou *Casos* para atualizar.",
      opcoes: [{ id: ADMIN_IDS.prioridades, title: "Prioridades" }],
      registrarPergunta: false
    }
  }

  const { u } = item
  const destino = prepararSessaoClienteAcaoAdmin(item)
  const statusDocs = calcularStatusDocumentos(u)
  const faltantes = statusDocs.faltantesCriticos.slice(0, 8)
  if (!destino) {
    return {
      texto: "Nao encontrei WhatsApp do cliente para pedir documentos com seguranca.",
      opcoes: opcoesAposAcaoCasoAdmin(),
      registrarPergunta: false
    }
  }
  if (!faltantes.length) {
    return {
      texto: "Esse caso nao tem documento critico pendente no status atual.",
      opcoes: opcoesAposAcaoCasoAdmin(),
      registrarPergunta: false
    }
  }

  const nome = primeiroNomeCliente(u) || "cliente"
  const lista = faltantes.map(doc => `- ${doc.label}`).join("\n")
  const mensagemDocumentos = [
      `Oi, *${nome}*. Passando para lembrar dos documentos que ainda faltam no seu caso:`,
      "",
      lista,
      "",
      "Quando puder, envie por aqui no WhatsApp. Se tiver dificuldade, pode mandar foto aos poucos."
    ].join("\n")
  const envioDocumentos = await templateService.atualizacaoCasoSegura(destino, {
    ultimaMsg: u.ultimaMsg,
    texto: mensagemDocumentos,
    resumoTemplate: `Documentos pendentes do caso ${u.numeroCaso || ""}: ${faltantes.map(doc => doc.label).join(", ")}.`,
    usuario: u
  })
  const enviadoCliente = envioDocumentos.sent
  // Fora da janela, atualizacaoCasoSegura preserva o template aprovado e não
  // há áudio. Dentro da janela, o complemento fala somente com autorização
  // canônica explícita (audio_sempre), após a imagem + legenda já aceita.
  if (enviadoCliente) {
    await enviarAudioPedidoDocumentos({
      dentroJanela24h: templateService.conversaDentroJanela24h(u.ultimaMsg),
      usuario: u,
      from: destino,
      texto: mensagemDocumentos,
      deveEnviarAudioAutomatico,
      gerarAudioAtendente,
      urlAudioAtendente,
      enviarAudio,
      logInfo,
      logErro
    })
  }
  if (enviadoCliente && !templateService.conversaDentroJanela24h(u.ultimaMsg) && envioDocumentos.channel === "template" && preferenciaAudioSempreCanonica(u, destino)) {
    criarPendenciaAudioPedidoDocumentos({
      activeKey: chaveAtivaAudioPedidoDocumentos(u, destino), contactId: u.contatoId,
      phoneNormalized: telefonePreferenciaComunicacao(u, destino), dealId: u.negocioId,
      numeroCaso: u.numeroCaso, providerMessageId: envioDocumentos.providerMessageId,
      audioText: mensagemDocumentos
    })
  }
  if (enviadoCliente && envioDocumentos.providerMessageId) {
    const outbound = registrarMensagemOutbound({
      providerMessageId: envioDocumentos.providerMessageId,
      numeroCaso: u.numeroCaso, contactId: u.contatoId, dealId: u.negocioId,
      action: "pedir_documentos", channel: envioDocumentos.channel,
      destinationMasked: envioDocumentos.destinationMasked
    })
    logInfo({ event: "outbound.accepted", status: "accepted_by_meta", providerMessageId: outbound.providerMessageId,
      numeroCaso: outbound.numeroCaso, contactId: outbound.contactId, dealId: outbound.dealId,
      action: outbound.action, channel: outbound.channel, fallback: Boolean(envioDocumentos.fallback), phoneMasked: outbound.destinationMasked })
  }

  let notaContato = false
  let notaNegocio = false
  if (enviadoCliente) {
    const corpo = `Pedido de documentos enviado pelo WhatsApp admin.\nCanal: ${envioDocumentos.channel}\nCaso: ${u.numeroCaso || "-"}\nDocumentos:\n${lista}`
    notaContato = u.contatoId ? await hsCriarNota(u.contatoId, "PEDIDO DE DOCUMENTOS PELO ADMIN", corpo) : false
    notaNegocio = u.negocioId ? await hsCriarNotaNegocio(u.negocioId, "PEDIDO DE DOCUMENTOS PELO ADMIN", corpo) : false
  }

  return {
    texto: [
      "*Pedido de documentos*",
      "",
      `📨 Solicitação aceita pela Meta: ${enviadoCliente ? "✅" : "❌ falhou"}`,
      `👤 Nota contato: ${notaContato ? "✅ ok" : "⚠️ nao registrada"}`,
      `📄 Nota negocio: ${notaNegocio ? "✅ ok" : "⚠️ nao registrada"}`,
      "",
      `📎 Documentos: ${faltantes.length}`
    ].join("\n"),
    opcoes: opcoesAposAcaoCasoAdmin(),
    registrarPergunta: false
  }
}

async function marcarCasoUrgenteAdmin(from) {
  invalidarCacheResumoOperacional()
  const item = obterCasoAdmin(from)
  if (!item) {
    return {
      texto: "Nao encontrei o caso selecionado. Abra *Prioridades* ou *Casos* para atualizar.",
      opcoes: [{ id: ADMIN_IDS.prioridades, title: "Prioridades" }],
      registrarPergunta: false
    }
  }

  const { u } = item
  const resultado = await persistirUrgenciaAltaAdmin({
    item,
    atualizarNegocio: hsAtualizarNegocioSerializado,
    criarNotaContato: hsCriarNota,
    criarNotaNegocio: hsCriarNotaNegocio,
    gerarBriefing: gerarBriefingCaso
  })

  if (!resultado.persisted) {
    return {
      texto: [
        "⚠️ *Não foi possível marcar o caso como urgente no HubSpot.*",
        "",
        `👤 Cliente: ${u.nome || u.nomeWA || "Cliente"}`,
        `📄 Caso: ${u.numeroCaso || "-"}`,
        "",
        "A urgência local não foi alterada. Tente novamente."
      ].join("\n"),
      opcoes: [
        { id: ADMIN_IDS.casoMarcarUrgente, title: "🔄 Tentar novamente" },
        ...opcoesAposAcaoCasoAdmin()
      ],
      registrarPergunta: false
    }
  }

  return {
    texto: [
      "🚨 *Caso marcado como urgente no HubSpot.*",
      "",
      `👤 Cliente: ${u.nome || u.nomeWA || "Cliente"}`,
      `📄 Caso: ${u.numeroCaso || "-"}`,
      `⚡ Urgencia: ${u.urgencia}`,
      "",
      `👤 Nota contato: ${resultado.notaContato ? "✅ ok" : "⚠️ nao registrada"}`,
      `📄 Nota negocio: ${resultado.notaNegocio ? "✅ ok" : "⚠️ nao registrada"}`,
      resultado.notesComplete ? "" : "⚠️ A urgência foi persistida, mas uma ou mais notas não foram registradas."
    ].join("\n"),
    opcoes: opcoesAposAcaoCasoAdmin(),
    registrarPergunta: false
  }
}

async function enviarAnaliseCasoAdmin(from) {
  invalidarCacheResumoOperacional()
  const item = obterCasoAdmin(from)
  if (!item) {
    return {
      texto: "Nao encontrei o caso selecionado. Abra *Prioridades* ou *Casos* para atualizar.",
      opcoes: [{ id: ADMIN_IDS.prioridades, title: "Prioridades" }],
      registrarPergunta: false
    }
  }

  const { u } = item
  const briefing = gerarBriefingCaso(u)
  const textoAnalise = [
    `Analise operacional pelo admin`,
    `Cliente: ${briefing.nome}`,
    `Caso: ${briefing.numeroCaso || "sem caso"}`,
    `Area: ${briefing.area || "-"}`,
    `Status: ${briefing.stageLabel}`,
    `Urgencia: ${briefing.urgencia}`,
    `Docs faltantes: ${briefing.documentos.faltantesCriticos.length}`,
    `Proxima acao: ${briefing.proximaAcao}`,
    `HubSpot: ${briefing.hubspot || "-"}`,
    `Drive: ${briefing.drive || "-"}`
  ].join("\n")

  let notaContato = false
  let notaNegocio = false
  if (u.contatoId) notaContato = await hsCriarNota(u.contatoId, "ANALISE OPERACIONAL - ADMIN", textoAnalise)
  if (u.negocioId) notaNegocio = await hsCriarNotaNegocio(u.negocioId, "ANALISE OPERACIONAL - ADMIN", textoAnalise)

  return {
    texto: [
      "📝 *Analise registrada no HubSpot.*",
      "",
      `👤 Cliente: ${briefing.nome}`,
      `📄 Caso: ${briefing.numeroCaso || "-"}`,
      `🎯 Proxima acao: ${briefing.proximaAcao}`,
      `👤 Nota contato: ${notaContato ? "✅ ok" : "⚠️ nao registrada"}`,
      `📄 Nota negocio: ${notaNegocio ? "✅ ok" : "⚠️ nao registrada"}`
    ].join("\n"),
    opcoes: opcoesAposAcaoCasoAdmin(),
    registrarPergunta: false
  }
}

async function enviarLembreteCasoAdmin(from) {
  invalidarCacheResumoOperacional()
  const item = obterCasoAdmin(from)
  if (!item) {
    return {
      texto: "Nao encontrei o caso selecionado. Abra *Prioridades* ou *Casos* para atualizar.",
      opcoes: [{ id: ADMIN_IDS.prioridades, title: "Prioridades" }],
      registrarPergunta: false
    }
  }

  const { u } = item
  const destino = prepararSessaoClienteAcaoAdmin(item)
  if (!destino) {
    return {
      texto: "Nao encontrei WhatsApp do cliente para enviar lembrete com seguranca.",
      opcoes: opcoesAposAcaoCasoAdmin(),
      registrarPergunta: false
    }
  }

  const briefing = gerarBriefingCaso(u)
  const nome = primeiroNomeCliente(u) || "cliente"
  const mensagemLembrete = [
      `Oi, *${nome}*. Passando para lembrar do andamento do seu caso *${u.numeroCaso || ""}*.`,
      "",
      briefing.proximaAcao || "Nossa equipe segue acompanhando seu atendimento.",
      "",
      "Se precisar falar com a equipe, responda por aqui mesmo."
    ].join("\n")
  const envioLembrete = await templateService.atualizacaoCasoSegura(destino, {
    ultimaMsg: u.ultimaMsg,
    texto: mensagemLembrete,
    resumoTemplate: `Atualização do caso ${u.numeroCaso || ""}: ${briefing.proximaAcao || "Nossa equipe segue acompanhando o atendimento."}`,
    usuario: u
  })
  const enviadoCliente = envioLembrete.sent

  let notaContato = false
  let notaNegocio = false
  if (enviadoCliente) {
    const corpo = `Lembrete operacional enviado pelo WhatsApp admin.\nCanal: ${envioLembrete.channel}\nCaso: ${u.numeroCaso || "-"}\nProxima acao: ${briefing.proximaAcao || "-"}`
    notaContato = u.contatoId ? await hsCriarNota(u.contatoId, "LEMBRETE PELO ADMIN", corpo) : false
    notaNegocio = u.negocioId ? await hsCriarNotaNegocio(u.negocioId, "LEMBRETE PELO ADMIN", corpo) : false
  }

  return {
    texto: [
      "*Lembrete do caso*",
      "",
      `📨 Cliente avisado: ${enviadoCliente ? "✅ ok" : "❌ falhou"}`,
      `👤 Nota contato: ${notaContato ? "✅ ok" : "⚠️ nao registrada"}`,
      `📄 Nota negocio: ${notaNegocio ? "✅ ok" : "⚠️ nao registrada"}`
    ].join("\n"),
    opcoes: opcoesAposAcaoCasoAdmin(),
    registrarPergunta: false
  }
}

function resumoConsultaAdmin(item, idx = null) {
  const partes = []
  if (idx !== null) partes.push(`${idx}.`)
  partes.push(`👤 ${item.u?.nome || "Cliente"}`)
  const quando = item.inicio ? formatarSlot(new Date(item.inicio)) : "horario nao encontrado"
  return `${partes.join(" ")} · 📅 ${quando}`
}

async function obterConsultasAtivasAdmin() {
  const consultas = []
  const vistos = new Set()

  let consultasViews = []
  try {
    consultasViews = await listConsultasAtivasViews()
  } catch (e) {
    logErro("admin_whatsapp", "Falha ao listar consultas no Calendar: " + e.message)
  }
  const itensCalendar = await mapearComLimite(consultasViews, 5, async view => ({
    estado: view,
    item: await hsAdminItemPorDealId(view.dealId)
  }))
  for (const { estado, item } of itensCalendar) {
    if (!item) continue
    const u = item.u
    const eventId = estado.eventId
    u.consultaStatus = estado.status

    const chave = String(u?.negocioId || item.negocio?.id || eventId || item.from || "")
    if (chave) vistos.add(chave)
    consultas.push({
      from: item.from,
      u,
      eventId,
      inicio: estado?.inicio || null,
      fim: estado?.fim || null,
      negocioId: u.negocioId || item.negocio?.id || null,
      contatoId: u.contatoId || item.contato?.id || null,
      fonte: "Calendar"
    })
  }

  consultas.sort((a, b) => {
    const da = a.inicio ? new Date(a.inicio).getTime() : Number.MAX_SAFE_INTEGER
    const db = b.inicio ? new Date(b.inicio).getTime() : Number.MAX_SAFE_INTEGER
    return da - db
  })

  return consultas
}

async function telaConsultasAdmin(from) {
  const consultas = await obterConsultasAtivasAdmin()
  const chaveAdmin = normalizarNumeroWhatsAppEnvio(from)
  const sessaoAtual = sessoesAdminWhatsApp.get(chaveAdmin) || {}
  sessoesAdminWhatsApp.set(chaveAdmin, { ...sessaoAtual, consultas, selecionada: null, listaAtiva: "consultas", ts: Date.now() })

  if (!consultas.length) {
    return {
      texto: "📅 *Consultas futuras*\n\n✅ Nao encontrei consultas futuras ativas no HubSpot nem na memoria local.",
      opcoes: [
        { id: ADMIN_IDS.menu, title: `🏠 ${ADMIN_MENU_LABELS.voltarMenu}` },
        { id: ADMIN_IDS.casos, title: "📂 Casos" }
      ],
      registrarPergunta: false
    }
  }

  const consultasExibidas = consultas.slice(0, 8)
  const linhas = consultasExibidas.map((item, idx) => resumoConsultaAdmin(item, idx + 1))
  return {
    texto: ["📅 *Consultas futuras*", "", ...linhas, "", "Toque em uma consulta para ver as acoes."].join("\n"),
    opcoes: [
      ...consultasExibidas.map((item, idx) => ({
        id: `admin_consulta_${idx}`,
        title: `${idx + 1}. ${(item.u?.nome || "Cliente").slice(0, 16)}`
      })),
      { id: ADMIN_IDS.menu, title: ADMIN_MENU_LABELS.voltarMenu }
    ],
    registrarPergunta: false
  }
}

function obterItemAdmin(from, idx = null) {
  const chaveAdmin = normalizarNumeroWhatsAppEnvio(from)
  const sessao = sessoesAdminWhatsApp.get(chaveAdmin)
  if (!sessao) return null

  const indice = idx === null || idx === undefined ? sessao.selecionada : idx
  const item = sessao.consultas?.[indice]
  if (!item) return null
  sessao.selecionada = indice
  sessao.ts = Date.now()
  sessoesAdminWhatsApp.set(chaveAdmin, sessao)
  return item
}

function telaDetalheConsultaAdmin(from, idx) {
  const item = obterItemAdmin(from, idx)
  if (!item) {
    return {
      texto: "Nao encontrei essa consulta na lista atual. Envie *consultas* para atualizar.",
      opcoes: [
        { id: ADMIN_IDS.agenda, title: "Atualizar consultas" },
        { id: ADMIN_IDS.menu, title: ADMIN_MENU_LABELS.voltarMenu }
      ],
      registrarPergunta: false
    }
  }

  const u = item.u
  const dataHora = item.inicio ? formatarSlot(new Date(item.inicio)) : "horario nao encontrado"
  const texto = [
    "📅 *Consulta selecionada*",
    "",
    `👤 Cliente: ${u.nome || "Cliente"}`,
    `📄 Caso: ${u.numeroCaso || "-"}`,
    `📱 WhatsApp: ${item.from || "-"}`,
    `⚖️ Area: ${u.area || "-"}`,
    `🕒 Data: ${dataHora}`,
    `🧭 Fonte: ${item.fonte || "-"}`,
    item.negocioId ? `🔗 HubSpot: ${linkHubSpot(item.negocioId)}` : ""
  ].filter(Boolean).join("\n")

  const opcoes = item.eventId
    ? [
      { id: ADMIN_IDS.cancelarConsulta, title: "❌ Cancelar consulta" },
      { id: ADMIN_IDS.agenda, title: "🔄 Atualizar consultas" },
      { id: ADMIN_IDS.menu, title: ADMIN_MENU_LABELS.voltarMenu }
    ]
    : [
      { id: ADMIN_IDS.agenda, title: "🔄 Atualizar consultas" },
      { id: ADMIN_IDS.casos, title: "📂 Ver casos" },
      { id: ADMIN_IDS.menu, title: ADMIN_MENU_LABELS.voltarMenu }
    ]

  return {
    texto,
    opcoes,
    registrarPergunta: false
  }
}

function telaConfirmarCancelamentoAdmin(from) {
  const item = obterItemAdmin(from)
  if (!item) {
    return {
      texto: "Nao encontrei a consulta selecionada. Envie *consultas* para atualizar.",
      opcoes: [
        { id: ADMIN_IDS.agenda, title: "Atualizar consultas" },
        { id: ADMIN_IDS.menu, title: ADMIN_MENU_LABELS.voltarMenu }
      ],
      registrarPergunta: false
    }
  }

  const u = item.u
  if (!item.eventId) {
    return {
      texto: "Essa consulta esta no HubSpot, mas nao encontrei o ID do evento Calendar para cancelar com seguranca. Abra o HubSpot ou atualize a agenda.",
      opcoes: [
        { id: ADMIN_IDS.agenda, title: "Atualizar consultas" },
        { id: ADMIN_IDS.casos, title: "Ver casos" },
        { id: ADMIN_IDS.menu, title: ADMIN_MENU_LABELS.voltarMenu }
      ],
      registrarPergunta: false
    }
  }
  const dataHora = item.inicio ? formatarSlot(new Date(item.inicio)) : "horario nao encontrado"
  return {
    texto: `❌ *Confirmar cancelamento?*\n\n👤 Cliente: *${u.nome || "Cliente"}*\n🕒 Consulta: *${dataHora}*`,
    opcoes: [
      { id: ADMIN_IDS.cancelarSim, title: "❌ Confirmar cancelar" },
      { id: ADMIN_IDS.cancelarNao, title: "⬅️ Voltar à consulta" },
      { id: ADMIN_IDS.agenda, title: `📅 ${ADMIN_MENU_LABELS.verConsultas}` },
      { id: ADMIN_IDS.menu, title: ADMIN_MENU_LABELS.voltarMenu }
    ],
    registrarPergunta: false
  }
}

async function cancelarConsultaAdmin(from) {
  const item = obterItemAdmin(from)
  if (!item) {
    return {
      texto: "Nao encontrei a consulta selecionada. Envie *consultas* para atualizar.",
      opcoes: [
        { id: ADMIN_IDS.agenda, title: "Atualizar consultas" },
        { id: ADMIN_IDS.menu, title: ADMIN_MENU_LABELS.voltarMenu }
      ],
      registrarPergunta: false
    }
  }

  const { u } = item
  const eventoId = item.eventId
  let calendarOk = false
  const dataHora = item.inicio ? formatarSlot(new Date(item.inicio)) : "data anterior"
  let resultado
  try {
    resultado = await cancelarEventoConsultaUsuario(u, "cancelado_admin_whatsapp", eventoId)
    calendarOk = true
  } catch (e) {
    logErro("admin_whatsapp", "Falha ao deletar evento: " + e.message, e)
    return {
      texto: "Nao consegui cancelar o evento no Google Calendar. Tente novamente em instantes.",
      opcoes: [
        { id: ADMIN_IDS.cancelarSim, title: "Tentar cancelar" },
        { id: ADMIN_IDS.agenda, title: "Atualizar consultas" },
        { id: ADMIN_IDS.menu, title: ADMIN_MENU_LABELS.voltarMenu }
      ],
      registrarPergunta: false
    }
  }
  let notaHubSpotOk = false
  if (u.contatoId) {
    notaHubSpotOk = await hsCriarNota(
      u.contatoId,
      "CONSULTA CANCELADA PELO WHATSAPP ADMIN",
      `Consulta cancelada pelo WhatsApp admin.\nCaso: ${u.numeroCaso || "-"}\nData: ${dataHora}\nEvento: ${eventoId || "-"}`
    )
  }

  let clienteAvisadoOk = false
  if (item.from) {
    const nome = primeiroNomeCliente(u) || "cliente"
    clienteAvisadoOk = await enviar(
      item.from,
      `Consulta cancelada, *${nome}*.\n\nSua consulta de *${dataHora}* foi cancelada.\n\nQuando quiser remarcar, toque em *Agendar consulta* no menu do cliente.`,
      null,
      false
    )
  }

  const chaveAdmin = normalizarNumeroWhatsAppEnvio(from)
  sessoesAdminWhatsApp.delete(chaveAdmin)

  return {
    texto: [
      "✅ *Consulta cancelada.*",
      "",
      `👤 Cliente: ${u.nome || "Cliente"}`,
      `📄 Caso: ${u.numeroCaso || "-"}`,
      `🕒 Data: ${dataHora}`,
      resultado?.novoStage ? `📌 Novo stage: ${labelStageAdmin(resultado.novoStage)}` : "",
      "",
      "🧾 *Auditoria*",
      `📅 Calendar: ${calendarOk ? "✅ ok" : "⚠️ sem evento"}`,
      `🔗 HubSpot stage: ${resultado?.hubspotTentado ? (resultado?.hubspotAtualizado ? "✅ ok" : "❌ falhou") : "⚪ sem alteracao"}`,
      `📝 Nota HubSpot: ${notaHubSpotOk ? "✅ ok" : "⚠️ nao registrada"}`,
      `📨 Cliente avisado: ${clienteAvisadoOk ? "✅ ok" : "⚠️ nao enviado"}`
    ].filter(Boolean).join("\n"),
    opcoes: [
      { id: ADMIN_IDS.agenda, title: `📅 ${ADMIN_MENU_LABELS.verConsultas}` },
      { id: ADMIN_IDS.menu, title: ADMIN_MENU_LABELS.voltarMenu }
    ],
    registrarPergunta: false
  }
}

async function obterConsultaAtivaCliente(u) {
  if (!u?.negocioId) return null
  const estado = await atualizarEstadoConsultaUsuario(u)
  if (estado.status === "cancelada" || estado.status === "encerrada") {
    if (estado.status === "encerrada" && estado.eventId) {
      await appendConsultaEvent({
        tipo: "consulta.expired",
        dealId: u.negocioId,
        timestamp: estado.fim || new Date().toISOString(),
        consultaStatus: "encerrada",
        metadata: {
          calendarEventId: estado.eventId,
          inicio: estado.inicio,
          fim: estado.fim,
          tipoConsulta: estado.metadata?.tipoConsulta,
          versaoIntegracao: estado.metadata?.versaoIntegracao || "3"
        },
        origem: "system",
        chaveIdempotencia: `calendar:${estado.eventId}:encerrada`
      })
    }
    await liberarAgendamentoERecalcularStage(
      u,
      estado.status === "cancelada" ? "evento_cancelado_cliente_verificacao" : "consulta_passada_cliente_verificacao"
    )
    return null
  }
  return estado.status === "agendada" ? estado : null
}

async function cancelarEventoConsultaUsuario(u, motivo = "consulta_cancelada", eventoId = null) {
  const estadoAtual = await getConsultaView(u?.negocioId)
  const idEvento = sanitizarTextoEntrada(estadoAtual?.eventId)
  const idSolicitado = sanitizarTextoEntrada(eventoId)
  if (idSolicitado && idEvento && idSolicitado !== idEvento) {
    throw new Error("evento informado nao corresponde a consulta ativa do deal")
  }
  if (idEvento) {
    try {
      const cal = getCalendar()
      await cal.events.delete({ calendarId: CALENDAR_ID, eventId: idEvento })
    } catch (e) {
      const status = e?.code || e?.response?.status || e?.status
      if (status !== 404 && status !== 410) throw e
    }
  }

  const origem = motivo.includes("cliente")
    ? "client"
    : motivo.includes("admin")
      ? "admin"
      : "system"
  if (idEvento) {
    await appendConsultaEvent({
      tipo: "consulta.canceled",
      dealId: u.negocioId,
      consultaStatus: "cancelada",
      metadata: {
        calendarEventId: idEvento,
        inicio: estadoAtual.inicio,
        fim: estadoAtual.fim,
        tipoConsulta: estadoAtual.metadata?.tipoConsulta,
        versaoIntegracao: estadoAtual.metadata?.versaoIntegracao || "3"
      },
      origem,
      chaveIdempotencia: `calendar:${idEvento}:cancelada`
    })
  }

  return await liberarAgendamentoERecalcularStage(u, motivo)
}

async function processarAdminWhatsApp(from, text, msgObj = null) {
  const callbackPosHumano = sanitizarTextoEntrada(text)
  const comando = /^admin_post_human_completed_[A-Za-z0-9_-]{24}$/.test(callbackPosHumano) ? callbackPosHumano : normalizarTextoGatilho(text)

  if (["sair", "bloquear", "logout"].includes(comando)) {
    bloquearAdminWhatsApp(from)
    return {
      texto: "Acesso admin bloqueado. Para abrir novamente, envie qualquer mensagem e digite a senha.",
      opcoes: null,
      registrarPergunta: false,
      audio: false
    }
  }

  if (!adminWhatsAppAutenticado(from)) {
    if (!senhaAdminConfigurada()) {
      logSegurancaAdmin(from, "configuracao de senha ausente")
      return telaSenhaAdminWhatsApp({ configuracaoAusente: true })
    }
    if (adminWhatsAppBloqueado(from)) {
      return telaSenhaAdminWhatsApp({ bloqueado: true })
    }
    if (senhaAdminValida(text)) {
      autenticarAdminWhatsApp(from)
      // CORREÇÃO: não carregar prioridades imediatamente após autenticação
      // Retornar menu principal leve para evitar dependência do HubSpot
      return await telaAdminPrincipal()
    }
    const tentativaInvalida = Boolean(sanitizarTextoEntrada(text))
    if (tentativaInvalida) registrarFalhaSenhaAdmin(from)
    return telaSenhaAdminWhatsApp({
      tentativaInvalida,
      bloqueado: adminWhatsAppBloqueado(from)
    })
  }

  const depsAtendimentoAssistido = {
    sessoesAdminWhatsApp,
    normalizarNumeroWhatsAppEnvio,
    telaAdminPrincipal,
    finalizarCadastroAssistido: finalizarCadastroAssistidoAdmin,
    agendarPersistenciaSessoesAdminAssistidas,
    logDebug,
    logErro,
    resolverLocalizacaoAdminAssistido: async entrada => {
      const texto = sanitizarTextoEntrada(entrada)
      const cep = texto.replace(/\D/g, "")
      return cep.length === 8 ? buscarPorCEP(cep) : buscarCidadePorNomeInteligente(texto)
    },
    logAdminAssistido: evento => {
      const payloadSeguro = criarPayloadLogAdminAssistido(evento?.evento, evento)
      logDebug("[ADMIN_ASSISTIDO]", JSON.stringify(payloadSeguro))
    },
    transcreverAudioAdmin: async msg => {
      const mediaId = msg?.audio?.id || msg?.voice?.id
      if (!mediaId) return ""
      const midia = await baixarMidia(mediaId)
      if (!midia) return ""
      return await transcrever(midia.buffer, midia.mimeType, {
        origem: "admin_atendimento_assistido"
      })
    },
    processarMidiaAdminAssistida: async (msg, contexto = {}) => adminAssistedMediaStaging.stage(msg, {
      downloadMedia: baixarMidia,
      analyzeDocument: input => executarPipelineDocumental(input),
      resolveIntegrity: async ({ pipeline }) => {
        const esperado = String(contexto.adminAssistido?.dados?.cpf?.valor || "").replace(/\D/g, "")
        const campos = pipeline?.extracao?.camposExtraidos || {}
        const encontrado = String(campos.cpf || campos.cpf_do_cliente || "").replace(/\D/g, "")
        if (esperado && encontrado && esperado === encontrado) {
          return { approved: true, partyRole: "titular" }
        }
        return {
          approved: false,
          partyRole: null,
          reason: esperado && encontrado ? "cpf_divergente" : "identidade_documental_nao_confirmada"
        }
      }
    }),
    promoverMidiaAdminAssistida: async (sha256, destination) => adminAssistedMediaStaging.promote(sha256, destination, {
      uploadVerified: async ({ folderId, name, buffer, mimeType, sha256: expectedSha }) => {
        const arquivo = await uploadDrive(folderId, name, buffer, mimeType)
        return arquivo?.id ? { id: arquivo.id, sha256: expectedSha, webViewLink: arquivo.webViewLink || null } : null
      }
    })
  }

  if (["admin_atendimento_assistido_ia", ADMIN_IDS.atendimentoAssistidoIa].includes(comando)) {
    encerrarConsultaPendenteAdmin(from)
    return iniciarAtendimentoAssistidoAdmin(from, depsAtendimentoAssistido)
  }

  if (atendimentoAssistidoAdminAtivo(from, depsAtendimentoAssistido)) {
    return processarAtendimentoAssistidoAdmin(from, text, msgObj, depsAtendimentoAssistido)
  }

  const tipoMidiaAdminSemContexto = sanitizarTextoEntrada(msgObj?.type).toLowerCase()
  if (["image", "document", "video"].includes(tipoMidiaAdminSemContexto)) {
    const respostaCasoSelecionado = await executarDocumentoCasoSelecionadoAdmin(from, msgObj)
    if (respostaCasoSelecionado) return respostaCasoSelecionado
    return {
      texto: "Recebi a midia, mas preciso de um contexto para usa-la. Abra *Casos* para escolher um caso ou *Atendimento Assistido* para iniciar um atendimento.",
      opcoes: [
        { id: ADMIN_IDS.casos, title: "📂 Casos" },
        { id: ADMIN_IDS.atendimentoAssistidoIa, title: "👨‍⚖️ Atendimento IA" },
        { id: ADMIN_IDS.menu, title: `🏠 ${ADMIN_MENU_LABELS.voltarMenu}` }
      ],
      registrarPergunta: false,
      audio: false
    }
  }

  const sessaoAcaoAdmin = sessoesAdminWhatsApp.get(normalizarNumeroWhatsAppEnvio(from)) || {}
  const navegacaoAdmin = new Set(["menu", "inicio", "admin", "admin_menu", ADMIN_IDS.menu, "voltar", "retornar", "cancelar", "admin_voltar", "admin_cancelar"])
  const consultaPendente = sessaoAcaoAdmin.acaoCasoPendente === "consultar"
  let consultaConsumidaComoTexto = false
  let iniciouNovaConsulta = false
  let comandoNaoReconhecido = false
  try {
  if (sessaoAcaoAdmin.acaoCasoPendente === "completar" && sanitizarTextoEntrada(text) && !navegacaoAdmin.has(comando)) {
    return executarComplementacaoCasoAdmin(from, text)
  }
  if (sessaoAcaoAdmin.acaoCasoPendente === "agendar" && sanitizarTextoEntrada(text) && !navegacaoAdmin.has(comando)) {
    return executarAgendamentoCasoAdmin(from, text)
  }

  if (["voltar", "retornar", "cancelar", "admin_voltar", "admin_cancelar"].includes(comando)) {
    const chave = normalizarNumeroWhatsAppEnvio(from)
    const sessaoAdmin = sessoesAdminWhatsApp.get(chave) || {}
    if (comando.includes("cancelar")) {
      sessoesAdminWhatsApp.set(chave, { ts: Date.now(), listaAtiva: null })
      return await telaAdminPrincipal()
    }
    if (sessaoAdmin.listaAtiva === "consultas") return await telaConsultasAdmin(from)
    if (sessaoAdmin.origemCasos === ADMIN_IDS.alertas) return await telaAdminAlertas()
    if (sessaoAdmin.origemCasos === ADMIN_IDS.prioridades) return await telaAdminPrioridades(from)
    if (sessaoAdmin.listaAtiva === "casos") return await telaAdminCasos()
    return await telaAdminPrincipal()
  }

  if (["", "admin", "menu", "inicio", "admin_menu", ADMIN_IDS.menu].includes(comando)) {
    return await telaAdminPrincipal()
  }

  if (["prioridades", "prioridade", "admin_prioridades", ADMIN_IDS.prioridades].includes(comando)) {
    return await telaAdminPrioridades(from)
  }

  if (["consultas", "consulta", "agenda", "agendamentos", "admin_consultas", ADMIN_IDS.agenda].includes(comando)) {
    return await telaConsultasAdmin(from)
  }

  if (["consultar caso", ADMIN_IDS.consultarCaso].includes(comando)) {
    iniciouNovaConsulta = true
    return iniciarConsultaCasoAdmin(from)
  }

  if (["admin_casos", ADMIN_IDS.casos, "casos", "filas de casos"].includes(comando)) return await telaAdminCasos()
  if (["completar informacoes", "completar informações", ADMIN_IDS.completarInformacoes].includes(comando)) return await telaAdminCasos()
  if (["enviar documentos", ADMIN_IDS.enviarDocumentos].includes(comando)) return await telaAdminCasosDocumentos(from)
  if (["completar caso", ADMIN_IDS.casoCompletar].includes(comando)) return iniciarComplementacaoCasoAdmin(from)
  if (["anexar documento", ADMIN_IDS.casoEnviarDocumento].includes(comando)) return iniciarEnvioDocumentoCasoAdmin(from)
  if (["agendar atendimento", ADMIN_IDS.casoAgendar].includes(comando)) return iniciarAgendamentoCasoAdmin(from)
  if (["preferencia de comunicacao", "preferência de comunicação", ADMIN_IDS.casoPreferenciaComunicacao].includes(comando)) return telaPreferenciaComunicacaoAdmin(from)
  if ([ADMIN_IDS.preferenciaTexto].includes(comando)) return await atualizarPreferenciaComunicacaoAdmin(from, "texto")
  if ([ADMIN_IDS.preferenciaAudioSempre].includes(comando)) return await atualizarPreferenciaComunicacaoAdmin(from, "audio_sempre")
  if ([ADMIN_IDS.preferenciaNaoDefinida].includes(comando)) return await atualizarPreferenciaComunicacaoAdmin(from, "nao_definido")
  if (["admin_casos_novos", ADMIN_IDS.casosNovos].includes(comando)) return await telaAdminCasosNovos(from)
  if (["admin_casos_analise", ADMIN_IDS.casosAnalise].includes(comando)) return await telaAdminCasosAnalise(from)
  if (["admin_casos_docs", ADMIN_IDS.casosDocs].includes(comando)) return await telaAdminCasosDocumentos(from)
  if (["admin_casos_ativos", ADMIN_IDS.casosAtivos].includes(comando)) return await telaAdminCasosAtivos(from)

  if (["admin_alertas", ADMIN_IDS.alertas, "alertas"].includes(comando)) return await telaAdminAlertas()
  if (["admin_alertas_criticos", "admin_alertas_urgentes", ADMIN_IDS.alertasCriticos, ADMIN_IDS.alertasUrgentes].includes(comando)) return await telaAdminAlertasUrgentes(from)
  if (["admin_alertas_parados", "admin_alertas_sem_resposta", ADMIN_IDS.alertasParados, ADMIN_IDS.alertasSemResposta].includes(comando)) return await telaAdminAlertasSemResposta(from)
  if (["admin_alertas_docs", ADMIN_IDS.alertasDocs].includes(comando)) return await telaAdminAlertasDocs(from)
  if (["admin_alertas_agenda", ADMIN_IDS.alertasAgenda].includes(comando)) return await telaAdminAlertasAgenda(from)
  if (["admin_resumo_diario", ADMIN_IDS.resumo].includes(comando)) return await telaAdminResumoDiario()

  // Telefones podem conter apenas dígitos. Em uma consulta pendente, texto livre
  // deve ser resolvido antes de qualquer tentativa de seleção por índice.
  const interacaoAdmin = comando.startsWith("admin_")
  if (consultaPendente && sanitizarTextoEntrada(text) && !interacaoAdmin) {
    consultaConsumidaComoTexto = true
    return executarConsultaCasoAdmin(from, text)
  }

  const matchConsulta = comando.match(/^admin_consulta_(\d+)$/)
  if (matchConsulta) return telaDetalheConsultaAdmin(from, Number(matchConsulta[1]))

  const matchCaso = comando.match(/^admin_caso_(\d+)$/)
  if (matchCaso) return await telaDetalheCasoAdmin(from, Number(matchCaso[1]))

  if (/^\d+$/.test(comando)) {
    const sessaoAdmin = sessoesAdminWhatsApp.get(normalizarNumeroWhatsAppEnvio(from))
    if (sessaoAdmin?.listaAtiva === "casos") {
      const itemCaso = obterCasoAdmin(from, Number(comando) - 1)
      if (itemCaso) return await telaDetalheCasoAdmin(from)
      return {
      texto: "A lista anterior expirou. Abra novamente Filas de casos e selecione o caso.",
        opcoes: [
          { id: ADMIN_IDS.prioridades, title: "📌 Prioridades" },
          { id: ADMIN_IDS.casos, title: "📂 Casos" },
          { id: ADMIN_IDS.menu, title: `🏠 ${ADMIN_MENU_LABELS.voltarMenu}` }
        ],
        registrarPergunta: false
      }
    }
    if (sessaoAdmin?.listaAtiva === "consultas") {
      return telaDetalheConsultaAdmin(from, Number(comando) - 1)
    }
    return {
      texto: "⚠️ Nao ha uma lista ativa para esse numero.\n\nAbra *Agenda*, *Prioridades* ou *Casos* primeiro.",
      opcoes: [
        { id: ADMIN_IDS.agenda, title: `📅 ${ADMIN_MENU_LABELS.verConsultas}` },
        { id: ADMIN_IDS.prioridades, title: "📌 Prioridades" },
        { id: ADMIN_IDS.casos, title: "📂 Casos" }
      ],
      registrarPergunta: false
    }
  }

  const matchPaginaCasos = comando.match(/^admin_casos_pagina_(\d+)$/)
  if (matchPaginaCasos) {
    const sessaoAdmin = sessoesAdminWhatsApp.get(normalizarNumeroWhatsAppEnvio(from)) || {}
    const origem = sessaoAdmin.origemCasos || ADMIN_IDS.casos
    if (origem === ADMIN_IDS.prioridades) return await telaAdminPrioridades(from, Number(matchPaginaCasos[1]))
    if (origem === ADMIN_IDS.casos) return await telaAdminCasos(from, Number(matchPaginaCasos[1]))
    return await telaAdminListaCasos(from, "", sessaoAdmin.casos || [], "", origem, Number(matchPaginaCasos[1]), sessaoAdmin.totalPaginas || 1)
  }

  const matchPaginaPrioridades = comando.match(/^admin_prioridades_pagina_(\d+)$/)
  if (matchPaginaPrioridades) return await telaAdminPrioridades(from, Number(matchPaginaPrioridades[1]))

  if (comando.startsWith("admin_post_human_completed_")) {
    const item = obterCasoAdmin(from)
    if (!item?.u) return { texto: "Selecione novamente o caso antes de confirmar o atendimento.", opcoes: [], registrarPergunta: false }
    const usuario = {
      ...item.u,
      telefoneNormalizado: normalizarNumeroWhatsAppEnvio(item.from || item.u._numero || item.u.whatsappContato)
    }
    const result = await handleAtendimentoRealizadoConfirmation({
      from,
      interactionId: comando,
      usuario,
      isAdmin: ehWhatsAppAdmin,
      repository: postHumanCycleRepository,
      actionContextRepository: postHumanActionContextRepository,
      confirmHubspotContext: confirmarVinculoPosHumanoHubSpot,
      logger: logInfo,
      processCycle: (cycle, currentUser) => processPostHumanCycle({
        cycle,
        usuario: currentUser,
        repository: postHumanCycleRepository,
        deps: {
          resolverListaDocumental: () => getDocumentosListaCaso(currentUser),
          listarArquivosDrive: async () => currentUser.pastaDriveId ? listarArquivosDriveNaPasta(currentUser.pastaDriveId) : [],
          requiredSources: currentUser.pastaDriveId ? ["drive"] : [],
          camposComplementaresPendentes: async () => {
            const context = await carregarPendenciasComplementaresPosHumanas({
              usuario: currentUser, cycle, repository: postHumanCycleRepository
            })
            return context
          },
          getLatestCustomerMessage: () => users[normalizarNumeroWhatsAppEnvio(currentUser._numero || currentUser.whatsappContato)]?.ultimaMsg ?? currentUser.ultimaMsg,
          applySafeHubspotUpdates: async () => ({ humanReviewRequired: false, divergences: [] }),
          isComplete: criarVerificadorCompletudePosHumana(currentUser, postHumanCycleRepository),
          sendFree: (to, text) => enviar(to, text),
          presentClientMenu: (to) => apresentarMenuClientePosHumano(to, item.u),
          sendTemplate: (to, name, params, language, options) => enviarTemplateWhatsApp(to, name, params, language, options),
          templateConfig: META_TEMPLATES.casoAtualizacao,
          buildTemplateParams: solicitacao => [solicitacao.texto]
        }
      })
    })
    return { texto: result.text, opcoes: opcoesAposAcaoCasoAdmin(), registrarPergunta: false }
  }

    if (["admin_cancelar_consulta", ADMIN_IDS.cancelarConsulta].includes(comando)) return telaConfirmarCancelamentoAdmin(from)
  if (["admin_cancelar_nao", ADMIN_IDS.cancelarNao].includes(comando)) return telaDetalheConsultaAdmin(from)
  if (["admin_cancelar_sim", ADMIN_IDS.cancelarSim].includes(comando)) return await cancelarConsultaAdmin(from)
  if (["admin_caso_links", ADMIN_IDS.casoLinks].includes(comando)) return telaLinksCasoAdmin(from)
  if (["admin_caso_pedir_docs", ADMIN_IDS.casoPedirDocs].includes(comando)) return await pedirDocsCasoAdmin(from)
  if (["admin_caso_lembrete", ADMIN_IDS.casoLembrete].includes(comando)) return await enviarLembreteCasoAdmin(from)
  if (["admin_caso_marcar_urg", ADMIN_IDS.casoMarcarUrgente].includes(comando)) return await marcarCasoUrgenteAdmin(from)
  if (["admin_caso_enviar_analise", ADMIN_IDS.casoEnviarAnalise].includes(comando)) return await enviarAnaliseCasoAdmin(from)
  if (["admin_caso_revisado", ADMIN_IDS.casoRevisado].includes(comando)) return await marcarCasoRevisadoAdmin(from)

  comandoNaoReconhecido = true
  const menu = await telaAdminPrincipal()
  return {
    ...menu,
    texto: [
      "Nao reconheci esse comando admin.",
      "",
      menu.texto
    ].join("\n")
  }
  } finally {
    // A própria cadeia de rotas acima define o que é ação administrativa. Só o
    // texto que chega ao fallback pode ser consumido como consulta pendente.
    if (consultaPendente && !consultaConsumidaComoTexto && !iniciouNovaConsulta && !comandoNaoReconhecido) {
      encerrarConsultaPendenteAdmin(from)
    }
  }
}

function detalharErroHubspot(e) {
  return JSON.stringify(detalhesErroHubSpot(e))
}

async function capturarLeadIncompleto(from, u) {
  try {
    logDebug("[CAPTURA] inicio")
    const sessao = u || users[from] || null
    logDebug("[CAPTURA] sessao ativa:", Boolean(sessao))

    if (sessao && !sessao.atendente) sessao.atendente = sortearAtendente()

    if (!sessao) {
      logDebug("⚠️ Sem sessão ativa, seguindo captura com fallback pelo telefone")
    }

    if (sessao && !deveCapturarLeadIncompleto(sessao)) {
      if (sessao.leadIncompletoCapturado) logDebug("? Lead já capturado anteriormente, abortando captura")
      if (sessao.numeroCaso) logDebug("? Sessão já possui número de caso, abortando captura")
      return null
    }

    const lead = sessao || {
      nome: null,
      nomeWA: null,
      area: null,
      numeroCaso: null,
      pastaDriveLink: null,
      contatoId: null,
      negocioId: null,
      stage: "sem_sessao"
    }

    const telefone = getTelefoneContato(from, lead)
    // sempre usar fallback "Lead WhatsApp" ou "Contato sem nome" quando nome ausente
    const nome = (lead.nome && String(lead.nome).trim() && lead.nome !== "cliente" && lead.nome !== "você")
      ? lead.nome
      : (lead.nomePerfilWhatsApp && String(lead.nomePerfilWhatsApp).trim())
        ? lead.nomePerfilWhatsApp
        : (lead.nomeWA && String(lead.nomeWA).trim())
          ? lead.nomeWA
          : "Lead WhatsApp"
    const area = lead.area || "Atendimento inicial"
    logDebug("[CAPTURA] dados mínimos preparados")
    let contatoId = null
    let negocioId = null

    logDebug("➡️ Validando contato no HubSpot antes de qualquer reaproveitamento...")
    let existente = null
    try {
      existente = await hsBuscarPorPhone(telefone)
    } catch (e) {
      logErroHubSpot(e, { operation: "capturarLeadBuscarContato" })
    }
    if (existente?.properties?.firstname && !lead.nomeHubspot) lead.nomeHubspot = existente.properties.firstname
    contatoId = existente?.id || null

    if (!contatoId) {
      // SEMPRE criar contato mesmo sem nome — usar fallback
      try {
        contatoId = await hsCriarContato(telefone, {
          ...lead,
          nome,
          area,
          numeroCaso: null,
          pastaDriveLink: null
        })
      } catch (e) {
        logErroHubSpot(e, {
          operation: "capturarLeadCriarContato",
          properties: ["firstname", "phone", "city"]
        })
        // segunda tentativa mínima — só telefone + nome fallback
        try {
          const res = await axios.post(
            "https://api.hubapi.com/crm/v3/objects/contacts",
            { properties: { firstname: nome, phone: telefone } },
            { headers: HS() }
          )
          contatoId = res.data.id
          monitor.cadastros++
        } catch (e2) {
          logErroHubSpot(e2, {
            operation: "capturarLeadCriarContatoFallback",
            properties: ["firstname", "phone"]
          })
        }
      }
    } else {
      logDebug("Contato confirmado no HubSpot:", contatoId)
      await hsAtualizarContato(contatoId, { firstname: nome, phone: telefone })
    }
    if (sessao) sessao.contatoId = contatoId
    if (sessao && contatoId) sessao._hubspotSemContato = false

    if (!contatoId) {
      logDebug("Falha ao criar/obter contato no HubSpot. Cancelando criacao de negocio.")
      logErroHubSpot(new Error("Contato HubSpot indisponível"), {
        operation: "capturarLeadSemContato"
      })
      return null
    }

    // verificar negócio existente ANTES de criar novo — evitar duplicatas
    if (contatoId) {
      try {
        negocioId = await hsBuscarNegocioAbertoDoContato(contatoId)
      } catch (e) {
        logErroHubSpot(e, {
          operation: "capturarLeadBuscarNegocioAberto",
          contactId: contatoId
        })
      }
    }

    // também checar se já existe negocioId na sessão antes de criar novo
    if (!negocioId && sessao?.negocioId) {
      negocioId = sessao.negocioId
      logDebug("Negócio reutilizado da sessão:", negocioId)
    }

    if (!negocioId) {
      logDebug("➡️ Indo criar negócio...")
      const temperatura = definirTemperatura(lead)
      const notaLead = getNotaLead(lead)

      logDebug("🌡️ Temperatura do lead:", temperatura)
      try {
        const negocioCriadoId = await hsCriarNegocio({
          ...lead,
          nome,
          area
        }, {
          stage: HS_STAGE.LEAD
        })
        negocioId = negocioCriadoId

        if (negocioCriadoId) {
          await hsCriarNotaNegocio(negocioCriadoId, "CLASSIFICACAO DE LEAD", notaLead)
        }
      } catch (e) {
        logErroHubSpot(e, {
          operation: "capturarLeadCriarNegocio",
          contactId: contatoId
        })
        throw e
      }
    } else {
      logDebug("Negócio reutilizado:", negocioId)
    }
    if (sessao) sessao.negocioId = negocioId || null
    if (sessao?.negocioId) await sincronizarNegocio(sessao)

    if (contatoId && negocioId) {
      await hsAssociar(contatoId, negocioId)
      await hsCriarNota(
        contatoId,
        "LEAD INCOMPLETO",
        `Lead capturado por inatividade.\nNome: ${nome}\nTelefone: ${telefone}\nÁrea: ${lead.area || "Não informada"}\nStage interno: ${lead.stage}`
      )
    } else {
      logDebug("Captura incompleta no HubSpot:", { contatoId, negocioId })
    }

    if (sessao) sessao.leadIncompletoCapturado = true
    return { contatoId, negocioId }
  } catch (err) {
    logDebug("? ERRO capturaLead:", err.response?.data || err.message || err)
    logErroHubSpot(err, {
      operation: "capturarLeadIncompleto",
      contactId: u?.contatoId,
      dealId: u?.negocioId
    })
    return null
  }
}

const WHATSAPP_MEDIA_MAX_BYTES = Math.max(1024, Number(process.env.WHATSAPP_MEDIA_MAX_BYTES || 20 * 1024 * 1024))

function getCalendar() {
  const oauth2 = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    "urn:ietf:wg:oauth:2.0:oob"
  )
  oauth2.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN })
  return google.calendar({ version: "v3", auth: oauth2 })
}

async function baixarMidia(mediaId) {
  try {
    const info = await axios.get(`https://graph.facebook.com/v19.0/${mediaId}`, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } })
    if (Number(info.data.file_size || 0) > WHATSAPP_MEDIA_MAX_BYTES) throw Object.assign(new Error("midia excede limite"), { code: "MEDIA_SIZE_LIMIT" })
    const file = await axios.get(info.data.url, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
      responseType: "arraybuffer",
      maxContentLength: WHATSAPP_MEDIA_MAX_BYTES,
      maxBodyLength: WHATSAPP_MEDIA_MAX_BYTES
    })
    const buffer = Buffer.from(file.data)
    if (buffer.length > WHATSAPP_MEDIA_MAX_BYTES) throw Object.assign(new Error("midia excede limite"), { code: "MEDIA_SIZE_LIMIT" })
    logDebug(`[WHATSAPP] Midia baixada | mime=${info.data.mime_type || "application/octet-stream"} | bytes=${buffer.length}`)
    return { buffer, mimeType: info.data.mime_type || "application/octet-stream" }
  } catch (e) { logErro("whatsapp", `baixarMidia: ${e.code || e.name || "erro"}`); return null }
}

const IMAGEM_BOAS_VINDAS_URL = process.env.IMAGEM_BOAS_VINDAS_URL || ""
const IMAGEM_MENU_CLIENTE_URL = process.env.IMAGEM_MENU_CLIENTE_URL || ""
const IMAGEM_GUIA_DOCS_URL = process.env.IMAGEM_GUIA_DOCS_URL || ""
const IMAGEM_CONFIRMACAO_URL = process.env.IMAGEM_CONFIRMACAO_URL || ""
const IMAGEM_CASO_REGISTRADO_URL = process.env.IMAGEM_CASO_REGISTRADO_URL || ""
const IMAGEM_NOVO_CASO_URL = process.env.IMAGEM_NOVO_CASO_URL || ""
const IMAGEM_ASSESSORIA_INICIAL_URL = process.env.IMAGEM_ASSESSORIA_INICIAL_URL || ""
const IMAGEM_POS_RELATO_URL = process.env.IMAGEM_POS_RELATO_URL || ""
const IMAGEM_SELECAO_CASO_URL = process.env.IMAGEM_SELECAO_CASO_URL || ""
const IMAGEM_ADV_URL = process.env.IMAGEM_ADV_URL || ""
const IMAGEM_ADV_HORARIOS_URL = process.env.IMAGEM_ADV_HORARIOS_URL || ""
const IMAGEM_ADV_URGENTE_URL = process.env.IMAGEM_ADV_URGENTE_URL || ""
const IMAGEM_STATUS_URL = process.env.IMAGEM_STATUS_URL || ""
const IMAGEM_ADV_AGENDADO_URL = process.env.IMAGEM_ADV_AGENDADO_URL || ""
const IMAGEM_ADV_URGENTE_REGISTRADA_URL = process.env.IMAGEM_ADV_URGENTE_REGISTRADA_URL || ""
const IMAGEM_DOC_AVULSO_URL = process.env.IMAGEM_DOC_AVULSO_URL || ""
const IMAGEM_DOC_ANEXADO_URL = process.env.IMAGEM_DOC_ANEXADO_URL || ""
const IMAGEM_ENVIO_EXTRA_URL = process.env.IMAGEM_ENVIO_EXTRA_URL || ""

const CAPTION_GUIA_DOCS = "📎 Guia rápido: veja como fotografar e enviar seu documento com segurança."
const IMAGEM_DOC_RECEBIDO_URL = process.env.IMAGEM_DOC_RECEBIDO_URL || ""
const TEXTO_INTRO_DOCS = [
  "📎 *Antes de enviar seus documentos*",
  "",
  "Para que nossa equipe consiga analisar tudo com segurança, envie fotos nítidas, completas e sem reflexo.",
  "",
  "Coloque o documento sobre uma superfície plana, em local bem iluminado, enquadre todas as bordas e envie uma foto por vez. Se preferir, também pode enviar PDF.",
  "",
  "Quando estiver pronto, toque em *Entendi, continuar*."
].join("\n")
const AUDIO_GUIA_DOCS_TEXTO = "Antes de enviar seus documentos, veja estas orientações. Coloque o documento sobre uma superfície plana, em local bem iluminado, tire a foto enquadrando o documento inteiro e envie aqui pelo WhatsApp. Se a foto já estiver salva no celular, toque no clipe, abra a galeria e selecione. Seus documentos são tratados com sigilo e segurança. Na tela, você tem três opções: Entendi, para continuar para a lista do seu caso; Continuar depois, se quiser deixar para outro momento; ou Menu do cliente, para voltar."

function textoAudioConfirmacaoDados(u) {
  const primeiroNome = primeiroNomeCliente(u) || "você"
  const cidade = u.cidade && u.uf ? `${u.cidade}, ${u.uf}` : u.cidade || "não informada"
  const situacao = formatarSituacaoJuridica(u.situacao, u.tipo, u.subTipo)
  const urgencia = ({ alta: "alta", normal: "moderada", baixa: "baixa" })[u.urgencia] || "moderada"
  // Tom sóbrio quando sofrimento foi detectado — sem encorajamento
  const fechamento = u._jaAcolheuSofrimento
    ? "Se tudo estiver certo, confirme para registrar o caso. Se precisar corrigir algo, escolha Corrigir. Para voltar, use a opção Voltar."
    : "Se tudo estiver certo, confirme para registrar o caso e permitir que o advogado comece a análise. Se precisar corrigir algo, escolha Corrigir. Para voltar, use a opção Voltar."
  return `${primeiroNome}, revise os dados antes de confirmar. Nome: ${u.nome || "não informado"}. Cidade: ${cidade}. Área: ${u.area || "não informada"}. Situação: ${situacao || "não informada"}. Urgência: ${urgencia}. ${fechamento}`
}

async function enviarTelaImagemOuTexto(from, imageUrl, texto, opcoes = null, chamadaOpcoes = "👇 *Escolha uma opção abaixo:*") {
  const payload = aplicarEmojiTelaCliente(from, { texto, opcoes })
  const textoTela = payload.texto
  const opcoesTela = payload.opcoes || null
  await enviarAudioAutomaticoTela(from, users[from], payload, "tela direta")

  const opcoesImagem = Array.isArray(opcoesTela) && opcoesTela.length <= 3 ? opcoesTela : null
  if (imageUrl) {
    const enviada = await enviarImagemWhatsApp(from, imageUrl, textoTela, opcoesImagem)
    if (enviada) {
      if (Array.isArray(opcoesTela) && opcoesTela.length > 3) {
        await new Promise(r => setTimeout(r, 500))
        return aplicarEmojiTelaCliente(from, { texto: chamadaOpcoes, opcoes: opcoesTela })
      }
      return { texto: null, opcoes: null }
    }
  }
  return { texto: textoTela, opcoes: opcoesTela }
}

async function enviarGuiaDocs(from, u, tela) {
  try {
    const payload = typeof tela === "string" ? { texto: tela, opcoes: null } : (tela || {})

    await enviarAudioModoVoz(from, u, gerarAudioDaTela(payload), "documentos caso")
    if (u?.modoTexto === false) await new Promise(r => setTimeout(r, 2500))

    const imageUrl = payload.imagemUrl || imagemPorCaso(u) || imagemPorAreaTipo(u?.area, u?.tipo, u?.situacao, u?.detalhe)
    const imagemEnviada = imageUrl
      ? await enviarImagemWhatsApp(from, imageUrl, payload.texto || CAPTION_GUIA_DOCS, payload.opcoes || null)
      : false

    if (!imagemEnviada && payload.texto) {
      await enviar(from, payload.texto, payload.opcoes || null, false)
    }
  } catch (e) {
    logErro("guia_docs", "Falha ao enviar guia", e)
    const payload = typeof tela === "string" ? { texto: tela, opcoes: null } : (tela || {})
    if (payload.texto) await enviar(from, payload.texto, payload.opcoes || null, false)
  }
}

async function responderTelaDocumento(from, u, tela) {
  await enviarAudioModoVoz(from, u, gerarAudioDaTela(tela), `documentos ${tela.id || "tela"}`)
  return responderComTimer(from, {
    texto: tela.texto,
    opcoes: gerarBotoesDaTela(tela)
  })
}

async function enviarIntroDocumentos(from, u) {
  const textoIntroDocumentos = `${TEXTO_INTRO_DOCS}\n\n${cabecalhoCasoAtivo(u)}`
  const telaIntro = criarTela({
    id: "documentos_introducao",
    titulo: "Envio de documentos",
    texto: textoIntroDocumentos,
    textoAudioBase: AUDIO_GUIA_DOCS_TEXTO,
    acoes: [
      { id: "docs_intro_ok", label: "✅ Entendi" },
      { id: "docs_depois", label: "Continuar depois" },
      { id: "m_inicio", label: "🏠 Menu do cliente" }
    ]
  })
  const opcoes = gerarBotoesDaTela(telaIntro)
  try {
    await enviarAudioModoVoz(from, u, gerarAudioDaTela(telaIntro), "introducao documentos")
    const enviada = IMAGEM_GUIA_DOCS_URL
      ? await enviarImagemWhatsApp(from, IMAGEM_GUIA_DOCS_URL, textoIntroDocumentos, opcoes)
      : false
    if (!enviada) {
      await enviar(from, textoIntroDocumentos, opcoes, false)
    }
  } catch (e) {
    logErro("intro_docs", "Falha ao enviar introducao de documentos", e)
    await enviar(from, textoIntroDocumentos, opcoes, false)
  }
}

async function prepararFluxoResumoOutro(from, u) {
  const sugestao = await classificarResumoOutro(u, u.assuntoResumo)
  if (sugestao?.categoria && Number(sugestao.confianca || 0) >= 0.6 && sugestao.categoria !== "generico") {
    aplicarSugestaoFluxoOutro(u, sugestao.categoria)
  }

  u._sugestaoFluxo = null
  u._proximaPerguntaAposDescricao = null
  setStage(u, STAGES.CONFIRMACAO)
  iniciarTimer(from)
  await sincronizarNegocio(u)
  return await telaConfirmacaoComImagem(from, u)
}

async function uploadDocumentoCano(u, pastaId, nome, buffer, mimeType, contexto = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return null
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex")
  if (!u._canonicalDocuments) u._canonicalDocuments = {}
  if (u._canonicalDocuments[sha256]?.fileId) {
    return { id: u._canonicalDocuments[sha256].fileId, sha256, webViewLink: u._canonicalDocuments[sha256].webViewLink || null }
  }
  const arquivo = await uploadDrive(pastaId, nome, buffer, mimeType)
  if (!arquivo?.id) return null
  u._canonicalDocuments[sha256] = {
    fileId: arquivo.id,
    sha256,
    name: nome,
    mimeType,
    status: "uploaded",
    uploadedAt: new Date().toISOString(),
    webViewLink: arquivo.webViewLink || null,
    contexto: contexto || {}
  }
  return arquivo
}

async function pastaUploadDocumento(u) {
  if (!isPilotCaseAllowed(u?.numeroCaso)) return u?.pastaDriveId || null
  const pasta = await obterOuCriarSubpastaDrive(u?.pastaDriveId, "00 - Originais recebidos")
  return pasta?.id || null
}

async function detectarEncerramentoPorAudio(from, u, msgObj, tipo) {
  const mediaId = msgObj?.[tipo]?.id
  if (!mediaId) return null

  const midia = await baixarMidia(mediaId)
  if (!midia) return null

  const transcricao = await transcrever(midia.buffer, midia.mimeType, { origem: "intencao_encerrar" })
  if (!transcricao) return null

  const decisao = await classificarAcaoAudioFluxo(u, transcricao)
  if (decisao?.acao !== "encerrar") return null

  logDebug(`[AUDIO_ENCERRAR] Intenção de encerrar detectada | USER: ${from} | STAGE: ${u?.stage || "-"} | MSG: "${sanitizarTextoEntrada(transcricao)}"`)
  return executarEncerramentoFluxo(from, u)
}

// ================================================================
//  FLOWS (funções separadas por etapa)
// ================================================================

async function finalizarCadastro(from, u) {
  assertFinalizationInvariants({
    from,
    u,
    normalizarNumeroWhatsAppEnvio
  })
  const telefoneContato = getTelefoneContato(from, u)
  const ehTerceiro = u.telefoneEhDoCliente === false
  const ehNovoCasoCliente = Boolean(u._novoCasoDeCliente)
  if (u.numeroCaso) {
    logDebug("? Sessão já possui número de caso, reutilizando existente")
  } else {
    // Reservation integration is gated by ENABLE_CASE_NUMBER_RESERVATION env var.
    const mode = String(process.env.CASE_NUMBER_RESERVATION_MODE || 'legacy').trim().toLowerCase()
    if (mode === 'legacy') {
      u.numeroCaso = gerarCaso(u.area)
      persistirUsersAgora({ propagarErro: true })
    } else if (mode === 'local-test') {
      if (process.env.NODE_ENV !== 'test' && String(process.env.CASE_NUMBER_ALLOW_LOCAL_TEST || '').toLowerCase() !== 'true') {
        throw new Error('local-test mode not allowed in this environment')
      }
      try {
        const { createLocalAdapter, createService } = require('./src/domain/case-number')
        const caseNumberService = createService(createLocalAdapter({ dataDir: process.env.CASE_NUMBER_DATA_DIR || (process.env.DATA_DIR || 'data') }))
        const key = `interactive:${crypto.createHash('sha256').update(String(from)).digest('hex')}`
        const res = await caseNumberService.reserve({ key, area: u.area })
        if (!res || !res.reserved) throw new Error('reservation_failed')
        u.numeroCaso = res.numero
        persistirUsersAgora({ propagarErro: true })
      } catch (e) {
        logErro('case_number_reservation', 'local_test_reservation_failed', e)
        throw new Error('local_test_reservation_failed')
      }
    } else if (mode === 'postgres') {
      // postgres mode requires the repo pool from external-state-repository
      try {
        const { getPool } = require('./src/infrastructure/external-state-repository')
        const { createPostgresAdapter, createService } = require('./src/domain/case-number')
        const pool = getPool()
        if (!pool) throw new Error('postgres_pool_unavailable')
        // verify migration/table exists
        try {
          await pool.query("SELECT 1 FROM case_number_reservations LIMIT 1")
        } catch (e) {
          throw new Error('case_number_reservations_table_missing')
        }
        const caseNumberService = createService(createPostgresAdapter({ pool }))
        const key = `interactive:${crypto.createHash('sha256').update(String(from)).digest('hex')}`
        const res = await caseNumberService.reserve({ key, area: u.area })
        if (!res || !res.reserved) throw new Error('reservation_failed')
        u.numeroCaso = res.numero
        persistirUsersAgora({ propagarErro: true })
      } catch (e) {
        logErro('case_number_reservation', 'reservation_failed_postgres', e)
        // do NOT fallback to generateCandidate in postgres mode
        throw e
      }
    } else {
      throw new Error('unsupported CASE_NUMBER_RESERVATION_MODE')
    }
  }
  const numeroCaso = u.numeroCaso
  u.score       = calcScore(u)
  u.docsEntregues = []; u.docsAusentes = []; u.docsPulados = []; u.docsParciais = []; u.docsDispensados = []
  u.docAtualIdx = 0; u.ultimoArqId = null

  let canonicalExecuted = false
    const canonicalContext = {
      source: "live_finalize_cadastro",
      contactProperties: montarPropsContatoHubSpot(telefoneContato, u),
      dealProperties: { ...getHubSpotDealStateProps(u), numero_de_caso: numeroCaso },
      tasks: [
        {
          key: `case-created-${numeroCaso}`,
          subject: `Caso ${numeroCaso} criado`,
          body: `Contato e negócio criados para o caso ${numeroCaso}.`,
          status: "NOT_STARTED",
          priority: "MEDIUM",
          type: "TODO",
          ownerId: u.ownerId || null
        }
      ],
      internalNotifications: [
        {
          type: "hubspot_note",
          subject: "CADASTRO COMPLETO",
          message: resumoCaso(u) + `\n\nScore: ${u.score}\nDrive: ${u.pastaDriveLink || "—"}\nWhatsApp: ${telefoneContato}`
        }
      ]
    }
    if (ehTerceiro) {
      canonicalContext.internalNotifications.push({
        type: "hubspot_note",
        subject: "DIVERGENCIA DE NOME - CASO PARA TERCEIRO",
        message: [
          "Caso para terceiro com telefone ja existente no HubSpot.",
          `Nome atual do contato: ${existente?.properties?.firstname || "nao informado"}`,
          `Nome informado neste atendimento: ${nomeTerceiro || "nao informado"}`,
          `Telefone informado: ${telefoneContato}`,
          "O nome do contato foi preservado para evitar sobrescrever o verdadeiro dono do numero."
        ].join("\n")
      })
    }

    const canonicalResult = await liveCaseFlow.executeLiveCaseFlow(u, canonicalContext)
    if (canonicalResult?.result?.completed) {
      canonicalExecuted = true
      if (!u.pastaDriveId && u._canonicalCheckpoint?.steps?.drive?.result?.id) {
        u.pastaDriveId = u._canonicalCheckpoint.steps.drive.result.id
      }
    } else if (canonicalResult?.result?.error) {
      const partial = canonicalResult.result.partialResources || {}
      const hasPartial = canonicalResult.result.hasPartialWrites
      const interruptedStep = canonicalResult.result.interruptedStep
      logErro("canonical_executor", `fallback para legado: ${canonicalResult.result.error}`, {
        canonicalError: canonicalResult.result.error,
        canonicalErrorCode: canonicalResult.result.code,
        interruptedStep,
        hasPartialWrites: hasPartial,
        partialResources: partial,
        planHash: canonicalResult.result.planHash
      })
      if (hasPartial) {
        if (partial.contactId) u.contatoId = u.contatoId || partial.contactId
        if (partial.dealId) u.negocioId = u.negocioId || partial.dealId
        if (partial.caseFolderId && !u.pastaDriveId) {
          u.pastaDriveId = partial.caseFolderId
        }
      }
      canonicalExecuted = false
    }

  if (!canonicalExecuted) {
    if (hasPartial) {
      logErro("canonical_executor", "FALLBACK_BLOCKED_PARTIAL_WRITES", { hasPartialWrites: hasPartial, interruptedStep, partialResources: partial })
      throw new Error("FALLBACK_BLOCKED_PARTIAL_WRITES: require admin-assisted resolution")
    }
    var driveCalled = !u.pastaDriveId
    var pastaRaw = u.pastaDriveId
      ? { id: u.pastaDriveId, webViewLink: u.pastaDriveLink || null }
      : await criarPastaCliente(numeroCaso, u.nome, u.area, u.situacao, u.tipo)
    var pastaNormalizada = normalizeDriveFolderResult(pastaRaw)
    var caseFolderId = pastaNormalizada ? pastaNormalizada.id : null
    logDebug("[CANONICAL] canonical_step=drive driveCalled=true driveResultHasId=" + String(!!caseFolderId) + " contactId=" + String(u.contatoId || "-") + " dealId=" + String(u.negocioId || "-") + " numeroCaso=" + String(numeroCaso || "-"))
    assertFinalizationOperation("drive_folder", caseFolderId)
    u.pastaDriveId = caseFolderId
    u.pastaDriveLink = (pastaNormalizada ? pastaNormalizada.webViewLink : null) || null
    persistirUsersAgora({ propagarErro: true })

    const existenteCpf = u.cpf ? await hsBuscarPorCpf(u.cpf) : null
    const existente = existenteCpf || await hsBuscarPorPhone(telefoneContato)
    const nomeExistenteCompleto = [existente?.properties?.firstname, existente?.properties?.lastname].filter(Boolean).join(" ")
    if (!existenteCpf && existente?.id && nomeExistenteCompleto && u.nome && normalizarNomeComparacao(nomeExistenteCompleto) !== normalizarNomeComparacao(u.nome)) {
      throw Object.assign(new Error("telefone pertence a contato incompatível"), { code: "HUBSPOT_PHONE_IDENTITY_CONFLICT" })
    }
    if (existente?.properties?.firstname && !u.nomeHubspot) u.nomeHubspot = existente.properties.firstname
    let contatoId = u.contatoId || existente?.id || null

    const nomeExistenteHS = existente?.properties?.firstname || ""
    const telefoneJaEhDeOutro = ehTerceiro && contatoId &&
      nomeExistenteHS &&
      normalizarNomeComparacao(nomeExistenteHS) !== normalizarNomeComparacao(nomeTerceiro)

    if (telefoneJaEhDeOutro) {
      logDebug("[HUBSPOT] Telefone do terceiro ja existe com outro nome. Preservando contato e registrando divergencia no negocio.")
    } else if (!contatoId) {
      contatoId = await hsCriarContato(telefoneContato, u)
    } else {
      logDebug("Contato encontrado no HubSpot:", contatoId)
      const propsContato = montarPropsContatoHubSpot(telefoneContato, u)
      const propsAusentes = montarPropsAusentesContatoHubSpot(existente, propsContato)
      if (u.nomeConfirmado && u.nome && !ehTerceiro) propsAusentes.firstname = u.nome
      if (Object.keys(propsAusentes).length) await hsAtualizarContato(contatoId, propsAusentes)
    }
    assertFinalizationOperation("hubspot_contact", contatoId)
    u.contatoId = contatoId
    if (contatoId) u._hubspotSemContato = false
    promoverPreferenciaComunicacao(u, from)
    persistirUsersAgora({ propagarErro: true })

    let negocioId = u.negocioId || null
    if (!negocioId && contatoId && !ehNovoCasoCliente) {
      const negocioExistente = await hsBuscarNegocioAbertoDoContato(contatoId)
      if (negocioExistente) {
        negocioId = negocioExistente
        u.negocioId = negocioId
        logDebug("Negócio existente encontrado:", negocioId)
      }
    }

    garantirNomenclaturaJuridicaUsuario(u)
    const dealnameFinal = montarTituloNegocioHubSpot(
      { ...u, numeroCaso, negocioStageId: HS_STAGE.ANALISE },
      { HS_STAGE, stage: HS_STAGE.ANALISE }
    )

    if (!negocioId) {
      logDebug("Nenhum negócio encontrado, criando novo")
      negocioId = await hsCriarNegocio(u, { stage: HS_STAGE.ANALISE })
      u.negocioId = negocioId
    } else {
      logDebug("Negócio já existe, atualizando dealname:", negocioId)
      u.negocioId = negocioId
      await hsAtualizarNegocioSerializado(u.negocioId, {
        dealname: dealnameFinal
      })
    }
    assertFinalizationOperation("hubspot_deal", negocioId)
    u.negocioId = negocioId
    persistirUsersAgora({ propagarErro: true })

    if (u.negocioId && u.numeroCaso) {
      const casoAtualizado = await hsAtualizarNegocioSerializado(u.negocioId, {
        numero_de_caso: u.numeroCaso,
        dealname: dealnameFinal
      })
      assertFinalizationOperation("hubspot_case_number", casoAtualizado)
      const etapaAtualizada = await hsAtualizarEtapaNegocio(u.negocioId, HS_STAGE.ANALISE)
      assertFinalizationOperation("hubspot_stage", etapaAtualizada)
      u.negocioStageId = HS_STAGE.ANALISE
    }
    if (u.contatoId) {
      const propsContatoPosCaso = montarPropsAusentesContatoHubSpot(existente, montarPropsContatoHubSpot(telefoneContato, u))
      if (Object.keys(propsContatoPosCaso).length) await hsAtualizarContato(contatoId, propsContatoPosCaso)
    }
    const associado = await hsAssociar(contatoId, negocioId)
    assertFinalizationOperation("hubspot_association", associado)
    const estadoAtualizado = await hsAtualizarNegocioSerializado(u.negocioId, getHubSpotDealStateProps(u))
    assertFinalizationOperation("hubspot_state", estadoAtualizado)

    if (contatoId) {
      await hsCriarNota(contatoId, "CADASTRO COMPLETO", resumoCaso(u) + `\n\nScore: ${u.score}\nDrive: ${u.pastaDriveLink || "—"}\nWhatsApp: ${telefoneContato}`)
      if (u.negocioId) {
        await hsCriarNotaNegocio(u.negocioId, "CADASTRO COMPLETO", resumoCaso(u) + `\n\nScore: ${u.score}\nDrive: ${u.pastaDriveLink || "—"}\nWhatsApp: ${telefoneContato}`)
      }
      if (telefoneJaEhDeOutro) {
        const notaDivergencia = [
          "Caso para terceiro com telefone ja existente no HubSpot.",
          `Nome atual do contato: ${nomeExistenteHS || "nao informado"}`,
          `Nome informado neste atendimento: ${nomeTerceiro || "nao informado"}`,
          `Telefone informado: ${telefoneContato}`,
          "O nome do contato foi preservado para evitar sobrescrever o verdadeiro dono do numero."
        ].join("\n")
        await hsCriarNota(contatoId, "DIVERGENCIA DE NOME - CASO PARA TERCEIRO", notaDivergencia)
        if (u.negocioId) await hsCriarNotaNegocio(u.negocioId, "DIVERGENCIA DE NOME - CASO PARA TERCEIRO", notaDivergencia)
      }
    }
  }

  // Salvar áudio de descrição guardado antes do cadastro
  if (u._audioDescBuffer && u.pastaDriveId) {
    try {
      await uploadPastaAudio(u.pastaDriveId, u._audioDescNome || "cliente", "Áudios Transcritos Confirmados", u._audioDescBuffer, u._audioDescMime)
      u._audioDescBuffer = null; u._audioDescMime = null; u._audioDescNome = null
      logDebug("[DRIVE] Áudio de descrição salvo após cadastro")
    } catch (e) { logErro("drive", "salvarAudioDesc: " + e.message) }
  }

  if (u.audiosDescCorrigidos?.length && u.pastaDriveId) {
    try {
      for (const audio of u.audiosDescCorrigidos) {
        if (!audio?.buffer) continue
        await uploadPastaAudio(u.pastaDriveId, audio.nome || "cliente", "Áudios Transcritos Corrigidos", audio.buffer, audio.mimeType)
      }
      u.audiosDescCorrigidos = []
      logDebug("[DRIVE] Áudios corrigidos salvos após cadastro")
    } catch (e) { logErro("drive", "salvarAudiosCorrigidos: " + e.message) }
  }

  Reflect.set(u, "stage", STAGES.CLIENTE)
  u._novoCasoDeCliente = false
  u._casoAnteriorCliente = null
  u.leadIncompletoCapturado = false
  agendarPersistenciaUsers()
  return numeroCaso
}

async function finalizarCadastroAssistidoAdmin(from, u) {
  const telefone = normalizarNumeroWhatsAppEnvio(u?.whatsappContato || from)
  if (!telefone) return finalizarCadastro(from, u)

  const tinhaSessaoAnterior = Object.prototype.hasOwnProperty.call(users, telefone)
  const sessaoAnterior = tinhaSessaoAnterior ? users[telefone] : null
  users[telefone] = u

  try {
    const numeroCaso = await finalizarCadastro(telefone, u)
    users[telefone] = u
    return numeroCaso
  } catch (e) {
    if (tinhaSessaoAnterior) users[telefone] = sessaoAnterior
    else delete users[telefone]
    try {
      persistirUsersAgora({ propagarErro: true })
    } catch (persistError) {
      logErro("admin_assistido", "Falha ao persistir rollback local: " + persistError.message, persistError)
    }
    throw e
  }
}

async function tela_confirmacao(u) {
  const urgenciaLabel = { alta: "Alta 🔴", normal: "Moderada 🟡", baixa: "Baixa 🟢" }
  const cidade = u.cidade && u.uf ? `${u.cidade}, ${u.uf}` : u.cidade || "Não informada"
  const whatsapp = formatarTelefoneExibicao(u.whatsappContato || u._numero || "")
  // sempre gerar resumo via IA, não apenas quando cache existe
  const descExibir = (u.descricao || u._audioCanalTranscricao)
    ? await gerarResumoDescricaoConfirmacao(u)
    : "Não informado"
  // Para terceiro: nome deve ser sempre o da pessoa atendida (u.nome), nunca do contato.
  const nome = u.atendimentoParaTerceiro
    ? (u.nome || "⚠️ não informado. Corrija antes de confirmar")
    : (u.nome || u.nomeContato || "Não informado")
  const situacaoFormatada = formatarSituacaoJuridica(u.situacao, u.tipo, u.subTipo)
  const detalheBase = u.detalhe || u.assuntoResumo || descExibir || u.descricao || u._audioCanalTranscricao
  const detalheFormatado = formatarDetalheJuridico(detalheBase, null)

  const linhas = [
    `👤 *Nome:* ${nome}`,
    (u.atendimentoParaTerceiro && u.nomeContato) ? `👥 *Aberto por:* ${u.nomeContato}` : null,
    `📱 WhatsApp: *${whatsapp || "Não informado"}*`,
    `📍 *Cidade:* ${cidade}`,
    `⚖️ *Área:* ${u.area || "Não informada"}`,
    situacaoFormatada && situacaoFormatada !== "Não informado" ? `📌 *Situação:* ${situacaoFormatada}` : null,
    detalheFormatado  && detalheFormatado  !== "Não informado" ? `🔎 *Detalhe:* ${detalheFormatado}`  : null,
    `⚡ *Urgência:* ${urgenciaLabel[u.urgencia] || "Moderada 🟡"}`,
    descExibir && descExibir !== "Não informado" ? `💬 *Descrição:* ${descExibir}` : null,
  ].filter(Boolean).join("\n")

  // Quando sofrimento foi detectado: texto de confirmação mais sóbrio,
  // sem frases de encorajamento. A pessoa só precisa confirmar ou corrigir.
  const sofrimentoNaSessao = u._jaAcolheuSofrimento === true
  const textoIntroConf = sofrimentoNaSessao
    ? `●●●●●● Etapa 6 de 6 · *Confirmação*\n\n*Confira seus dados:*\n\n${linhas}\n\nQuando confirmar, seu caso será registrado e nossa equipe será notificada.`
    : `●●●●●● ✅ Etapa 6 de 6 · *Confirmação*\n\n✅ *Confira seus dados antes de confirmar:*\n\n${linhas}\n\n*Ao confirmar, seu caso será registrado oficialmente e nossa equipe será notificada.*\n\nTudo está correto?`
  return {
    texto: textoIntroConf,
    opcoes: [
      { id: "conf_ok",       title: "✅ Confirmar" },
      { id: "conf_corrigir", title: "✏️ Corrigir" },
      { id: "conf_menu",     title: "⬅️ Voltar" }
    ]
  }
}

async function telaConfirmacaoComImagem(from, u) {
  const tela = await tela_confirmacao(u)
  const imagemUrl = IMAGEM_CONFIRMACAO_URL
  await enviarAudioModoVoz(from, u, textoAudioConfirmacaoDados(u), "confirmacao dados")
  try {
    const enviada = await enviarImagemWhatsApp(from, imagemUrl, tela.texto, tela.opcoes)
    if (enviada) return { texto: null, opcoes: null }
    return tela
  } catch (e) {
    logErro("confirmacao", "Falha ao enviar imagem de confirmacao", e)
    return tela
  }
}

// ------------------------------------------------------------------
// Helper: retornar para a tela de confirmação correta após edição
// u._origemConfirmacao = "audio" | "texto"
// ------------------------------------------------------------------
async function voltarParaConfirmacao(from, u) {
  u._retornarParaConfirmacao = false
  await sincronizarNegocio(u)
  iniciarTimer(from)

  // Invalidar cache de resumo para forçar regerar com dados atualizados
  u._resumoDescricaoIA = null
  u._resumoDescricaoIABase = null

  if (u._origemConfirmacao === "audio") {
    // Modo voz: usa telaConfirmarDadosAudio que já respeita modoTexto internamente
    setStage(u, STAGES.AUDIO_CONFIRMAR_DADOS)
    return await telaConfirmarDadosAudio(from, u)
  }

  // Modo texto padrão
  setStage(u, STAGES.CONFIRMACAO)
  return await telaConfirmacaoComImagem(from, u)
}

function limparCorrecaoPendente(u) {
  u._correcaoPendenteCampo = null
  u._correcaoPendenteValor = null
  u._correcaoPendenteExtra = null
  u._correcaoPendenteSubcampo = null
}

async function pedirCampoCorrecao(from, u, aviso = "") {
  limparCorrecaoPendente(u)
  setStage(u, STAGES.CORRIGIR_DADOS)
  iniciarTimer(from)
  const prefixo = aviso ? `${aviso}\n\n` : ""
  const texto = `${prefixo}✏️ *O que você gostaria de corrigir?*\n\n_Diga ou digite o que está errado. Por exemplo: "meu nome está errado", "a cidade está errada" ou "o WhatsApp está errado"._`
  if (!u.modoTexto) {
    try {
      const ogg = await gerarAudioAtendente(u.atendente,
        `Tudo bem. Me diga o que deseja corrigir. Pode falar em áudio ou digitar.`)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 2500))
    } catch (e) { logErro("tts", "Falha áudio perguntar correcao", e) }
  }
  return responderComTimer(from, { texto, opcoes: null })
}

async function reabrirCorrecaoPendente(from, u) {
  const campo = u._correcaoPendenteCampo
  if (!campo) return pedirCampoCorrecao(from, u)

  const config = {
    nome: {
      stage: STAGES.EDITAR_NOME,
      texto: "●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n😊 Fico feliz em poder ajudar! Para começar, qual é o seu nome completo?\n\n_Digite ou envie um áudio com seu nome._",
      audio: "Tudo bem. Me diga somente o nome completo."
    },
    cidade: {
      stage: STAGES.EDITAR_CIDADE,
      texto: "📍 *Em qual cidade você mora?*\n\n_Digite a cidade com o estado, por exemplo: Recife Pernambuco, ou informe o CEP com oito dígitos._",
      audio: "Tudo bem. Me diga sua cidade com o estado, por exemplo Recife Pernambuco, ou informe o CEP com oito dígitos."
    },
    situacao: {
      stage: STAGES.EDITAR_SITUACAO,
      texto: "📌 *Qual é a situação correta?*\n\n_Descreva brevemente ou envie um áudio._",
      audio: "Tudo bem. Me conte a situação correta do seu caso."
    },
    detalhe: {
      stage: STAGES.EDITAR_DETALHE,
      texto: "🔎 *Qual é o detalhe correto?*\n\n_Digite ou envie um áudio._",
      audio: "Tudo bem. Me diga o detalhe correto do caso."
    },
    descricao: {
      stage: STAGES.EDITAR_DESCRICAO,
      texto: "💬 *Qual é a descrição correta do seu caso?*\n\n_Digite ou envie um áudio com a descrição atualizada._",
      audio: "Tudo bem. Me conte a descrição correta do seu caso. Vou juntar com o relato anterior e organizar tudo."
    }
  }

  if (campo === "area") {
    u._correcaoPendenteCampo = null
    u._correcaoPendenteValor = null
    u._correcaoPendenteExtra = null
    return pedirCampoCorrecao(from, u, "A área jurídica é definida pela análise do relato. Se ela parecer errada, corrija a descrição do caso com mais detalhes.")
  }

  const cfg = config[campo]
  if (!cfg) return pedirCampoCorrecao(from, u)
  setStage(u, cfg.stage)
  iniciarTimer(from)
  if (!u.modoTexto) {
    try {
      const ogg = await gerarAudioAtendente(u.atendente, cfg.audio)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 3000))
    } catch (e) { logErro("tts", "Falha áudio reabrir correcao", e) }
  }
  return responderComTimer(from, { texto: cfg.texto, opcoes: null })
}

async function responderFalhaAudioCorrecao(from, u, textoFallback = "Não consegui ouvir com clareza. Pode enviar outro áudio ou digitar?") {
  if (!u.modoTexto) {
    try {
      const ogg = await gerarAudioAtendente(u.atendente, textoFallback)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 3000))
    } catch (e) { logErro("tts", "Falha áudio fallback correcao", e) }
  }
  return responderComTimer(from, { texto: textoFallback, opcoes: null })
}

function textoAudioConfirmacaoNome(nome, { pessoaAtendida = false } = {}) {
  const identificacao = pessoaAtendida
    ? `O nome da pessoa atendida é ${nome}.`
    : `Seu nome é ${nome}.`
  return `${identificacao} Está correto? Se estiver, toque no botão Sim, está certo. Se não estiver, digite o nome correto ou envie um novo áudio.`
}

async function prepararConfirmacaoCorrecao(from, u, campo, valor, extra = {}) {
  u._correcaoPendenteCampo = campo
  u._correcaoPendenteValor = valor
  u._correcaoPendenteExtra = extra || null

  if (campo === "nome") {
    setStage(u, STAGES.CONFIRMAR_CORRECAO_NOME)
    iniciarTimer(from)
    // Determinar se é o nome do contato (quem está no WhatsApp) ou da pessoa atendida
    const subcampoNome = u._correcaoPendenteSubcampo || "nome"
    const ehNomeContato = subcampoNome === "nomeContato"
    const ehFluxoTerceiro = Boolean(u.atendimentoParaTerceiro || u._novoCasoParaTerceiro)
    const textoConfNome = ehFluxoTerceiro
      ? (ehNomeContato ? textoConfirmarNomeRepresentante(valor) : textoConfirmarNomePessoaAtendida(valor))
      : `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ Seu nome é *${valor}*.\n\nEstá correto? Se não estiver, é só me dizer o nome certo agora. Pode falar ou digitar. 🎙️`
    const audioConfNome = ehFluxoTerceiro
      ? (ehNomeContato ? audioConfirmarNomeRepresentante(valor) : audioConfirmarNomePessoaAtendida(valor))
      : textoAudioConfirmacaoNome(valor)
    if (!u.modoTexto) {
      try {
        const ogg = await gerarAudioAtendente(u.atendente, audioConfNome)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3500))
      } catch (e) { logErro("tts", "Falha áudio confirmar correção nome", e) }
    }
    return responderComTimer(from, {
      texto: textoConfNome,
      opcoes: [{ id: "nome_correcao_confirmar", title: "✅ Sim, está certo" }]
    })
  }

  if (campo === "cidade") {
    const cidadeExib = extra?.cidade || valor
    const ufExib = extra?.uf || ""
    const regiaoExib = extra?.regiao || ""
    const textoExib = `${cidadeExib}${ufExib ? `, ${ufExib}` : ""}${regiaoExib ? ` (${regiaoExib})` : ""}`
    const textoAudio = `${cidadeExib}${ufExib ? `, ${estadoPorExtenso(ufExib) || ufExib}` : ""}. Está correto? Se estiver, toque no botão Sim, está certo. Se não estiver, digite a cidade correta ou envie um novo áudio.`
    setStage(u, STAGES.CONFIRMAR_CORRECAO_CIDADE)
    iniciarTimer(from)
    if (!u.modoTexto) {
      try {
        const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3500))
      } catch (e) { logErro("tts", "Falha áudio confirmar correção cidade", e) }
    }
    return responderComTimer(from, {
      texto: `●●●●●○ 📍 Etapa 5 de 6 · *CIDADE*\n\n✅ Localizei: *${textoExib}*.\n\nEstá correto? Se não estiver, é só me dizer a cidade certa agora. Pode falar ou digitar. 🎙️`,
      opcoes: [{ id: "cidade_correcao_confirmar", title: "✅ Sim, está certo" }]
    })
  }

  // Demais campos (situacao, detalhe, descricao): aplica direto como antes
  return await aplicarCorrecaoPendente(from, u)
}

async function aplicarCorrecaoPendente(from, u) {
  const campo = u._correcaoPendenteCampo
  const valor = u._correcaoPendenteValor
  const extra = u._correcaoPendenteExtra || {}
  if (!campo) return pedirCampoCorrecao(from, u)

  if (campo === "nome") {
    const subcampoNome = u._correcaoPendenteSubcampo || "nome"
    if (subcampoNome === "nomeContato") {
      u.nomeContato = valor
    } else {
      u.nome = valor
      u.nomeConfirmado = true
    }
  } else if (campo === "cidade") {
    u.cidade = extra.cidade || valor
    u.uf = extra.uf || u.uf
    u.regiao = extra.regiao || u.regiao
  } else if (campo === "situacao") {
    u.situacao = valor
  } else if (campo === "detalhe") {
    u.detalhe = valor
  } else if (campo === "descricao") {
    if (!Array.isArray(u._historicoDescricao)) u._historicoDescricao = []
    if (u.descricao) {
      u._historicoDescricao.push({ texto: u.descricao, ts: new Date().toISOString() })
    }
    u._resumoDescricaoIA = null
    u._resumoDescricaoIABase = null
    u.descricao = extra.descricao || valor
    u._audioCanalTranscricao = u.descricao
    if (extra.area) {
      u.area = extra.area
      u._areaDetectada = extra.area
    }
    if (extra.situacao) u.situacao = extra.situacao
    if (extra.detalhe) u.detalhe = extra.detalhe
    if (extra.urgencia) {
      u.urgencia = extra.urgencia
      u.semReceber = extra.urgencia === "alta"
    }
  }

  const campoAplicado = campo
  limparCorrecaoPendente(u)
  if (campoAplicado === "descricao") {
    const aviso = "Atualizei o resumo do seu caso com base na nova descrição. Também revisei área, situação, detalhe e urgência quando necessário."
    if (!u.modoTexto) {
      try {
        const ogg = await gerarAudioAtendente(u.atendente, aviso)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3000))
      } catch (e) { logErro("tts", "Falha áudio aviso descrição consolidada", e) }
    }
    await enviar(from, `✅ ${aviso}`, null, false)
  }
  // Se o relato ainda não foi dado (usuário interrompeu o pré-atendimento para corrigir
  // um dado antes de relatar), sempre volta para pedirRelatoAposNome independentemente
  // de _retornarParaConfirmacao — que só deve valer após o relato existir.
  const relatoAusente = !u.numeroCaso && !u._audioCanalTranscricao && !u.descricao
  if (relatoAusente) {
    return await pedirRelatoAposNome(from, u)
  }
  // Se o cliente ainda não chegou à tela de confirmação, retomar a coleta
  // no próximo campo que falta em vez de exibir uma confirmação incompleta.
  if (!u._retornarParaConfirmacao && !u.numeroCaso) {
    if (!u.whatsappVerificado) return responderComTimer(from, await flowAcolhimentoConfirmaWhatsapp(u, { from }))
    if (!u.cidade) return responderComTimer(from, await flowAcolhimentoCidade(u, { from }))
  }
  return await voltarParaConfirmacao(from, u)
}

async function iniciarAgendamento(from, u) {
  const telaBusca = telaBuscandoHorarios()
  await enviar(from, telaBusca.texto, gerarBotoesDaTela(telaBusca), false)

  let slots = []
  let temMais = false
  let pagina = 0
  try {
    const resultado = await buscarHorariosDisponiveis(u._paginaSlots || 0)
    slots = resultado.slots
    temMais = resultado.temMais
    pagina = resultado.pagina
  } catch (e) {
    logErro("calendar", "Erro ao buscar horários: " + e.message)
  }

  if (!slots || slots.length === 0) {
    const telaSemHorarios = telaConsultaSemHorarios(cabecalhoCasoAtivo(u))
    await enviarAudioModoVoz(from, u, gerarAudioDaTela(telaSemHorarios), "sem horários")
    return telaSemHorarios
  }

  // Salva slots no estado do usuário
  u._slotsDisponiveis = slots.map(s => s.toISOString())
  u._paginaSlots = pagina

  const telaHorarios = telaHorariosConsulta({
    cabecalhoCaso: cabecalhoCasoAtivo(u),
    slots,
    pagina,
    temMais,
    formatarSlot
  })
  await enviarAudioModoVoz(from, u, gerarAudioDaTela(telaHorarios), "horários")

  setStage(u, STAGES.AGENDAMENTO_HORARIO)
  iniciarTimer(from)

  return await enviarTelaImagemOuTexto(
    from,
    IMAGEM_ADV_HORARIOS_URL,
    telaHorarios.texto,
    gerarBotoesDaTela(telaHorarios),
    "📅 *Toque no melhor horário para você.*"
  )
}

function telaAdvogadoCliente(u) {
  return telaConsultaAdvogado(cabecalhoCasoAtivo(u))
}

// A preferência canônica de comunicação controla o áudio automático.
// Somente audio_sempre autoriza envio de áudio; texto e nao_definido bloqueiam.
// Compatibilidade legada: modoTexto true conserva o bloqueio de texto;
// modoTexto false nunca autoriza áudio sem escolha canônica explícita.
// Durante o pré-atendimento (ACOLHIMENTO / ACOLHIMENTO_MODO), se não houver
// preferência canônica nem legado, o áudio é forçado para a saudação inicial.
function deveEnviarAudioAutomatico(u, from = "") {
  if (!u) return false
  const phone = telefonePreferenciaComunicacao(u, from)
  const record = communicationPreferences.resolve({
    contactId: u?.contatoId,
    phoneNormalized: phone,
    snapshotPreference: u?.communicationPreference,
    modoTexto: u?.modoTexto
  })
  // A escolha somente é explícita quando tem uma origem canônica e data de
  // seleção. Snapshots incompletos e a migração legada não autorizam áudio.
  const isCanonical = record && record.source !== "migracao_legado" && Boolean(record.selectedAt)
  if (isCanonical) {
    return record.preference === "audio_sempre"
  }
  if (u?.modoTexto === true) return false
  // modoTexto === false é apenas projeção legada: nunca é autorização.
  return u?.stage === STAGES.ACOLHIMENTO || u?.stage === STAGES.ACOLHIMENTO_MODO
}

// Última barreira para os fluxos legados que ainda chamam enviarAudio
// diretamente. Ela mantém a exceção de apresentação no pré-atendimento e
// impede que uma preferência canônica seja contornada por esses call sites.
async function enviarAudio(from, audioUrl) {
  const u = users[from]
  if (u && !deveEnviarAudioAutomatico(u, from)) return
  return enviarAudioTransport(from, audioUrl)
}

async function enviarAudioModoVoz(from, u, texto, contexto = "cliente") {
  if (!from || !u?.atendente) return
  if (!deveEnviarAudioAutomatico(u, from)) return
  try {
    const ogg = await gerarAudioAtendente(u.atendente, texto)
    await enviarAudio(from, urlAudioAtendente(ogg))
    ultimosAudiosEnviados.set(String(from), Date.now())
    await new Promise(r => setTimeout(r, 2500))
  } catch (e) { logErro("tts", `Falha áudio ${contexto}`, e) }
}

function aplicarEmojiTelaCliente(from, payload = {}) {
  if (!payload?.texto || ehContatoAdmin(from)) return payload
  if (payload.semEmoji === true || textoTemMarcadorVisual(payload.texto)) return payload
  return { ...payload, texto: `💬 ${payload.texto}` }
}

function ehContatoAdmin(from) {
  const a = normalizarNumeroWhatsAppEnvio(from)
  const b = normalizarNumeroWhatsAppEnvio(WHATSAPP_ADMIN)
  return Boolean(a && b && a === b)
}

async function enviarAudioAutomaticoTela(from, u, payload, contexto = "tela") {
  if (!from || !u || !u.atendente || ehContatoAdmin(from)) return
  if (!deveEnviarAudioAutomatico(u, from)) return
  if (!payload?.texto) return
  if (payload.audio === false || payload.semAudio === true) return
  const agora = Date.now()
  const ultimoAudio = Number(ultimosAudiosEnviados.get(String(from)) || 0)
  if (ultimoAudio && agora - ultimoAudio < 12000) return
  const textoAudio = textoAudioAutomatico(payload)
  if (!textoAudio) return
  await enviarAudioModoVoz(from, u, textoAudio, `auto ${contexto}`)
}

async function responderTelaComAudio(from, u, payload, textoAudio, contexto = "cliente") {
  await enviarAudioModoVoz(from, u, textoAudio, contexto)
  return responderComTimer(from, payload)
}

function saudacaoPorHorarioCliente(data = new Date()) {
  const hora = Number(new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false
  }).format(data))
  if (hora >= 5 && hora < 12) return "Bom dia"
  if (hora >= 12 && hora < 18) return "Boa tarde"
  if (hora >= 18 && hora < 24) return "Boa noite"
  return "Boa madrugada"
}

configurarClientMenuUi({
  formatarSituacaoJuridica,
  serializarEstado,
  desserializarEstado,
  restaurarTipoCasoHubSpot,
  getNumeroCasoOficialDoNegocio,
  podeMostrarMenuCliente,
  respostaRecomecoMenuPrincipal,
  saudacaoPorHorarioCliente,
  textoAudioOpcoes
})

// Saudação inclusiva e determinística: o Menu não depende de inferência externa de gênero.
function saudacaoGenero() {
  return "Seja bem-vindo(a)"
}

async function menuClienteComAudio(from, u) {
  const primeiroNome = primeiroNomeCliente(u) || "cliente"
  const primeiraApresentacao = !u._menuClienteJaApresentado
  const saudacao = saudacaoPorHorarioCliente()
  const negocios = u.contatoId ? await hsListarNegociosAtivosDoContato(u.contatoId) : []
  const casosCliente = montarCasosMenuCliente(u, negocios)
  const temPainel = casosCliente.length > 1 && u._mostrarPainelCasosCliente
  const temVariosCasos = casosCliente.length > 1
  const casoSelecionadoAudio = u._casoSelecionadoAudio
  const boasVindas = !temPainel && deveMostrarBoasVindasMenuCliente(u)
  const resumoCasosAudio = temVariosCasos
    ? `Você tem ${casosCliente.length} atendimentos: ${textoAudioResumoCasosCliente(casosCliente)}.`
    : `Seu atendimento atual é sobre ${formatarSituacaoJuridica(u.situacao, u.tipo, u.subTipo) || u.area || "seu caso"}.`
  u._menuClienteBoasVindas = boasVindas
  u._casoSelecionadoAudio = null
  const textoAudioBase = casoSelecionadoAudio
    ? `Você selecionou o caso de ${casoSelecionadoAudio.area || "Atendimento"}, número ${casoSelecionadoAudio.numeroCaso}`
    : boasVindas
    ? `${saudacao}, ${primeiroNome}! ${await saudacaoGenero(u.nome || primeiroNome)} de volta à Oráculum. ${resumoCasosAudio}`
    : `${saudacao}, ${primeiroNome}! ${resumoCasosAudio}`
  const tela = menuCliente(u, casosCliente, { textoAudioBase })
  const textoAudioMenu = gerarAudioDaTela(tela)
  const opcoesMenu = gerarBotoesDaTela(tela)

  if (temPainel) {
    await enviarAudioModoVoz(from, u, textoAudioMenu, "menu cliente")
  }

  let menuEnviado = false
  if (temPainel && IMAGEM_SELECAO_CASO_URL) {
    const imagemEnviada = await enviarImagemWhatsApp(from, IMAGEM_SELECAO_CASO_URL, tela.texto, null)
    if (imagemEnviada) {
      menuEnviado = true
      await new Promise(r => setTimeout(r, 1000))
    }
  } else if (!temPainel && IMAGEM_MENU_CLIENTE_URL) {
    const imagemEnviada = await enviarImagemWhatsApp(from, IMAGEM_MENU_CLIENTE_URL, tela.texto, opcoesMenu)
    if (imagemEnviada) {
      menuEnviado = true
      await new Promise(r => setTimeout(r, 1000))
    }
  }
  if (!menuEnviado) {
    await enviar(from, tela.texto, temPainel ? null : opcoesMenu, false)
    await new Promise(r => setTimeout(r, 500))
  }
  registrarUltimaPergunta(u, tela)
  if (!temPainel) {
    await enviarAudioModoVoz(from, u, textoAudioMenu, "menu cliente")
    await new Promise(r => setTimeout(r, 5000))
  }
  if (temPainel && opcoesMenu.length) {
    await enviar(from, "📂 *Toque no caso sobre o qual deseja continuar.*", opcoesMenu, false)
    await new Promise(r => setTimeout(r, 500))
  }
  if (!temPainel) u._ultimoMenuClienteAt = Date.now()
  u._menuClienteBoasVindas = false
  u._menuClienteJaApresentado = true
  return null
}

async function apresentarMenuClientePosHumano(from, u) {
  if (!u?.numeroCaso) return false
  setStage(u, STAGES.CLIENTE)
  iniciarTimer(from)
  await menuClienteComAudio(from, u)
  return true
}

async function abrirSelecaoCasoParaAcao(from, u, acao) {
  // se o cliente veio direto da tela de confirmação do caso recém-aberto,
  // não exibir seleção — o contexto é óbvio: a ação é para o caso atual
  if (u._casoRecemAberto) {
    u._casoRecemAberto = false
    return false
  }
  if (u._menuClienteCasoAtivo && u.negocioId) return false
  const negocios = u.contatoId ? await hsListarNegociosAtivosDoContato(u.contatoId) : []
  const casosCliente = montarCasosMenuCliente(u, negocios)
  if (casosCliente.length <= 1) return false
  u._casosMenuCliente = casosCliente
  u._acaoPendente = acao
  u._mostrarPainelCasosCliente = true
  u._menuClienteCasoAtivo = false
  iniciarTimer(from)
  return await menuClienteComAudio(from, u)
}

async function executarAcaoPendenteCliente(from, u) {
  const acao = u._acaoPendente || null
  u._acaoPendente = null
  u._mostrarPainelCasosCliente = false
  u._docsClienteGuiado = false

  if (acao === "status") return await telaStatusCliente(from, u)
  if (acao === "documentos") return await executarIntencaoCliente(from, u, "documentos", "m_docs")
  if (acao === "advogado") return await telaAdvogadoClienteComAudio(from, u)
  return await menuClienteComAudio(from, u)
}

async function telaAdvogadoClienteComAudio(from, u) {
  const tela = telaAdvogadoCliente(u)
  await enviarAudioModoVoz(from, u, gerarAudioDaTela(tela), "menu advogado cliente")
  return await enviarTelaImagemOuTexto(from, IMAGEM_ADV_URL, tela.texto, gerarBotoesDaTela(tela))
}

async function telaStatusCliente(from, u) {
  let stageAtualHS = u.negocioStageId || null
  let negocioAtual = null
  if (u.negocioId) {
    try {
      const res = await axios.get(
        `https://api.hubapi.com/crm/v3/objects/deals/${u.negocioId}?properties=dealstage,createdate`,
        { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
      )
      stageAtualHS = res.data?.properties?.dealstage || stageAtualHS
      negocioAtual = res.data || null
      u.negocioStageId = stageAtualHS
    } catch (e) {
      logErroHubSpot(e, {
        operation: "consultarDealstageStatusCliente",
        dealId: u.negocioId,
        properties: ["dealstage", "createdate"]
      })
    }
  }

  // Calendar é a fonte exclusiva de verdade da agenda.
  let consultaDataHora = null
  let consultaPassou = false
  let estadoConsulta = null
  try {
    estadoConsulta = await atualizarEstadoConsultaUsuario(u)
    if (estadoConsulta.inicio) consultaDataHora = new Date(estadoConsulta.inicio)
    consultaPassou = ["encerrada", "realizada", "nao_compareceu"].includes(estadoConsulta.status)
    if (estadoConsulta.status === "cancelada") {
      const liberacao = await liberarAgendamentoERecalcularStage(u, "evento_cancelado_calendar")
      if (liberacao.novoStage) stageAtualHS = liberacao.novoStage
    }
  } catch (e) {
    logErro("calendar", "Falha ao obter estado central da consulta: " + e.message)
  }
  const temAgendamentoAtivo = u.consultaStatus === "agendada"

  // Documentos
  const statusDocs = calcularStatusDocumentos(u)
  const temFaltantesCriticos = statusDocs.faltantesCriticos.length > 0
  const todosDocsEnviados = !temFaltantesCriticos

  const barra = montarBarraStatusCliente({
    stageAtualHS,
    todosDocsEnviados,
    temFaltantesCriticos,
    temAgendamentoAtivo,
    temEventoCalendar: Boolean(estadoConsulta?.encontrado),
    consultaPassou
  })

  // Tipo do caso
  const tipoCasoFormatado = formatarSituacaoJuridica(u.situacao, u.tipo, u.subTipo)

  // Bloco de agendamento — só aparece se data não passou
  const blocoAgendamento = montarBlocoAgendamentoStatus(temAgendamentoAtivo, consultaDataHora)

  // Bloco de documentos — sempre aparece
  const blocoDocumentos = montarBlocoDocumentosStatus(statusDocs, temFaltantesCriticos)

  const iconeArea = iconeAreaJuridica(u.area || "")

  const textoStatus = montarTextoStatusCliente({
    numeroCaso: u.numeroCaso,
    iconeArea,
    area: u.area,
    tipoCasoFormatado,
    barra,
    blocoAgendamento,
    blocoDocumentos
  })

  // Áudio — narra o estado completo para quem não lê
  const nomesDocStatus = statusDocs.faltantesCriticos.map(d => d.label)
  const listaAudioStatus = temFaltantesCriticos
    ? (nomesDocStatus.length === 1
      ? nomesDocStatus[0]
      : nomesDocStatus.slice(0, -1).join(", ") + " e " + nomesDocStatus[nomesDocStatus.length - 1])
    : ""
  const acaoAudio = montarAudioStatusCliente({
    stageAtualHS,
    temAgendamentoAtivo,
    consultaDataHoraAudio: temAgendamentoAtivo && consultaDataHora ? formatarSlotAudio(consultaDataHora) : "",
    documentosFaltantesQtd: temFaltantesCriticos ? nomesDocStatus.length : 0,
    documentosFaltantesAudio: removerFormatacaoParaAudio(listaAudioStatus)
  })

  const telaStatus = criarTela({
    id: "status_cliente",
    titulo: "Status do caso",
    textoAudioBase: acaoAudio,
    acoes: opcoesStatusCliente(stageAtualHS, temFaltantesCriticos, temAgendamentoAtivo)
      .map(opcao => ({ id: opcao.id, label: opcao.title }))
  })

  await enviarAudioModoVoz(from, u, gerarAudioDaTela(telaStatus), "status cliente")

  return await enviarTelaImagemOuTexto(
    from,
    IMAGEM_STATUS_URL,
    textoStatus,
    gerarBotoesDaTela(telaStatus)
  )
}

async function telaConfirmarCancelamentoConsultaCliente(from, u) {
  let estado = null
  try {
    estado = await obterConsultaAtivaCliente(u)
  } catch (e) {
    logErro("calendar", "Falha ao verificar consulta para cancelamento: " + e.message, e)
  }

  if (!estado?.inicio) {
    const telaIndisponivel = telaCancelamentoIndisponivel()
    await enviarAudioModoVoz(from, u, gerarAudioDaTela(telaIndisponivel), "cancelamento consulta sem agenda")
    await enviar(from, telaIndisponivel.texto, gerarBotoesDaTela(telaIndisponivel), false)
    return await telaStatusCliente(from, u)
  }

  const dataConsulta = new Date(estado.inicio)
  const dataHora = formatarSlot(dataConsulta)
  const dataHoraAudio = formatarSlotAudio(dataConsulta)
  u._cancelamentoConsultaPendente = {
    eventId: estado.eventId,
    inicio: estado.inicio,
    ts: Date.now()
  }
  iniciarTimer(from)

  const telaCancelamento = telaConfirmarCancelamentoConsulta(dataHora, dataHoraAudio)
  await enviarAudioModoVoz(from, u, gerarAudioDaTela(telaCancelamento), "confirmar cancelamento consulta")
  return telaCancelamento
}

async function cancelarConsultaCliente(from, u) {
  const pendente = u._cancelamentoConsultaPendente || {}
  let estado = null
  try {
    estado = await obterConsultaAtivaCliente(u)
  } catch (e) {
    logErro("calendar", "Falha ao revalidar consulta para cancelamento: " + e.message, e)
  }

  const estadoAtual = await getConsultaView(u.negocioId)
  const eventoAtual = sanitizarTextoEntrada(estadoAtual.eventId)
  const eventoPendente = sanitizarTextoEntrada(pendente.eventId)
  if (!estado?.inicio || (eventoPendente && eventoAtual && eventoPendente !== eventoAtual)) {
    u._cancelamentoConsultaPendente = null
    const telaDesatualizada = telaCancelamentoIndisponivel({ alterada: true })
    await enviarAudioModoVoz(from, u, gerarAudioDaTela(telaDesatualizada), "cancelamento consulta revalidacao")
    await enviar(from, telaDesatualizada.texto, gerarBotoesDaTela(telaDesatualizada), false)
    return await telaStatusCliente(from, u)
  }

  const dataConsulta = new Date(estado.inicio)
  const dataHora = formatarSlot(dataConsulta)
  const dataHoraAudio = formatarSlotAudio(dataConsulta)
  try {
    const resultado = await cancelarEventoConsultaUsuario(u, "cancelado_cliente_whatsapp", eventoAtual)
    u._cancelamentoConsultaPendente = null

    if (u.contatoId) {
      await hsCriarNota(
        u.contatoId,
        "CONSULTA CANCELADA PELO CLIENTE NO WHATSAPP",
        `Consulta cancelada pelo cliente no WhatsApp.\nCaso: ${u.numeroCaso || "-"}\nData: ${dataHora}\nEvento: ${eventoAtual || "-"}`
      )
    }

    await enviarWhatsAppAdmin(montarNotificacaoCancelamentoClienteAdmin({
      from,
      u,
      dataHora,
      eventoId: eventoAtual,
      resultado
    }))

    iniciarTimer(from)
    const telaCancelada = telaConsultaCancelada(dataHora, dataHoraAudio)
    telaCancelada.registrarPergunta = false
    telaCancelada._resultadoCancelamento = resultado
    await enviarAudioModoVoz(from, u, gerarAudioDaTela(telaCancelada), "consulta cancelada cliente")
    return telaCancelada
  } catch (e) {
    logErro("calendar", "Falha ao cancelar consulta pelo cliente: " + e.message, e)
    const telaFalhaCancelamento = telaFalhaCancelamentoConsulta()
    telaFalhaCancelamento.registrarPergunta = false
    await enviarAudioModoVoz(from, u, gerarAudioDaTela(telaFalhaCancelamento), "erro cancelamento consulta cliente")
    return telaFalhaCancelamento
  }
}

async function confirmarAberturaNovoCasoCliente(from, u) {
  const textoNovoCaso = `➕ *Abrir novo caso*\n\nVocê quer iniciar um novo atendimento separado do caso atual?\n\nSeu caso atual continuará registrado, mas esta conversa passará a coletar uma nova situação.`
  const opcoesNovoCaso = [
    { id: "novo_caso_confirmar", title: "✅ Sim, abrir" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
  ]
  await enviarAudioModoVoz(
    from,
    u,
    `Você quer iniciar um novo atendimento separado do caso atual? Seu caso atual continuará registrado, mas esta conversa passará a coletar uma nova situação. ${textoAudioOpcoes(opcoesNovoCaso)}`,
    "confirmar novo caso cliente"
  )
  if (IMAGEM_NOVO_CASO_URL) {
    const enviada = await enviarImagemWhatsApp(from, IMAGEM_NOVO_CASO_URL, textoNovoCaso, opcoesNovoCaso)
    if (enviada) return { texto: null, opcoes: null }
  }
  return { texto: textoNovoCaso, opcoes: opcoesNovoCaso }
}

async function abrirNovoCasoCliente(from, u) {
  const nomeExibicao = u.nome
  const cidadeExibicao = u.cidade
  const ufExibicao = u.uf
  const regiaoExibicao = u.regiao
  if (!u._casoAnteriorCliente) u._casoAnteriorCliente = criarSnapshotCasoCliente(u)
  limparDadosCasoAtual(u)
  u._novoCasoDeCliente = true
  u.atendimentoParaTerceiro = false
  u.nomeContato = null
  u.relacaoComAtendido = null
  u.papelContato = null
  u.nome = nomeExibicao
  u.nomeConfirmado = Boolean(nomeExibicao)
  u._cidadeClienteAnterior = cidadeExibicao || null
  u._ufClienteAnterior = ufExibicao || null
  u._regiaoClienteAnterior = regiaoExibicao || null
  setStage(u, STAGES.NOVO_CASO_CONFIRMA)
  iniciarTimer(from)
  const opcoesNovoCasoCliente = [
    { id: "nc_meu", title: "✅ É para mim" },
    { id: "nc_outro", title: "👤 É para outra pessoa" },
    { id: "m_inicio", title: "🏠 Menu do cliente" }
  ]
  await enviarAudioModoVoz(
    from,
    u,
    `Vamos abrir um novo caso. O caso atual continua registrado. ${textoAudioOpcoes(opcoesNovoCasoCliente)}`,
    "novo caso cliente"
  )
  return {
    texto: `➕ *Abrir novo caso*\n\nPara quem é este novo atendimento?\n\nSeu caso atual continuará registrado. Se for para outra pessoa, pediremos os dados e o WhatsApp dela.\n\n*Seus dados atuais:*\n👤 *${nomeExibicao || "Nome não informado"}*\n📍 ${cidadeExibicao || "Cidade não informada"}${ufExibicao ? " - " + ufExibicao : ""}`,
    opcoes: opcoesNovoCasoCliente
  }
}

async function iniciarMensagemUrgenteCliente(from, u) {
  const conforto = await gerarConfortoUrgenteCliente(u)
  await enviarAudioModoVoz(
    from,
    u,
    `${conforto} Pode deixar sua mensagem urgente agora. Você pode digitar ou enviar um áudio. Nossa equipe será notificada.`,
    "mensagem urgente cliente"
  )
  setStage(u, STAGES.AGUARDANDO_URGENTE)
  iniciarTimer(from)
  return await enviarTelaImagemOuTexto(
    from,
    IMAGEM_ADV_URGENTE_URL,
    `📩 *Mensagem urgente*\n\n${conforto}\n\nDigite sua mensagem ou envie um áudio agora.\n\nTudo será registrado imediatamente e nossa equipe será notificada. ⚡\n\n📄 Caso: *${u.numeroCaso}*\n\n⏱️ _Prazo de retorno: até 4 horas em dias úteis._`,
    null
  )
}

async function gerarConfortoUrgenteCliente(u) {
  const fallback = "Sinto muito que isso esteja preocupando você. Vou registrar com cuidado."
  if (!GROQ_KEY) return fallback
  try {
    const prompt = `Escreva UMA frase curta de acolhimento para cliente jurídico preocupado.
Área: ${u.area || "não informada"}.
Situação: ${u.situacao || u.detalhe || "não informada"}.
Regras: máximo 16 palavras, sem promessa de resultado, sem urgência artificial, linguagem simples, texto puro.`
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 60,
        temperature: 0.6
      },
      { headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" } }
    )
    const frase = sanitizarTextoEntrada(res.data?.choices?.[0]?.message?.content || "")
      .replace(/^["'“”]+|["'“”]+$/g, "")
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean)[0]
    return frase && frase.length <= 140 ? frase : fallback
  } catch (e) {
    logErro("groq", "gerarConfortoUrgenteCliente: " + e.message)
    return fallback
  }
}

async function respostaUrgenteRegistradaComAudio(from, u, contexto = "mensagem urgente registrada") {
  const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })
  await enviarAudioModoVoz(
    from,
    u,
    "Sua mensagem urgente foi registrada. Nossa equipe será notificada e retornará em até 4 horas em dias úteis. Você pode agendar uma consulta ou voltar ao menu do cliente.",
    contexto
  )
  return responderComTimer(from, await enviarTelaImagemOuTexto(
    from,
    IMAGEM_ADV_URGENTE_REGISTRADA_URL,
    `✅ *Mensagem urgente registrada!*\n\n🕐 Registrada às: *${agora}*\n⏱️ Prazo de retorno: *até 4 horas* em dias úteis.\n\nNossa equipe foi notificada. ⚡\n\n📄 Caso: *${u.numeroCaso}*`,
    [
      { id: "adv_agendar_ligacao", title: "📅 Agendar consulta" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
    ]
  ))
}

async function aproveitarRelatoAudioClienteNovoCaso(from, u) {
  const relatoPendente = sanitizarTextoEntrada(u._audioClientePendenteTexto || "")
  if (!relatoPendente) return null

  u._audioClientePendenteTexto = null
  u._audioClientePendenteArquivo = null
  u._audioCanalTranscricao = normalizarTextoCRM(relatoPendente)
  if (!Array.isArray(u.historiaIA)) u.historiaIA = []
  u.historiaIA.push({ role: "user", content: relatoPendente })

  await enviar(from, "📖 Vou aproveitar o relato que você já enviou para iniciar este novo caso.")

  const classificacao = await classificarAreaAudio(u._audioCanalTranscricao)
  aplicarClassificacaoJuridica(u, classificacao)
  iniciarTimer(from)
  return await flowAssessoriaInicial(u, { from, origem: "audio_cliente_novo_caso" })
}

async function proximaEtapaNovoCasoClienteAposModo(from, u) {
  if (!u._novoCasoDeCliente) return null
  if (u._novoCasoParaTerceiro) {
    if (!u.nomeConfirmado || !u.nome) {
      setStage(u, "coleta_tel_outro")
      iniciarTimer(from)
      const representativeName = (u.nomeContato || u._casoAnteriorCliente?.nome || "").split(" ")[0] || "você"
      if (!u.modoTexto) {
        await enviarAudioModoVoz(from, u, audioSolicitarNomePessoaAtendida(representativeName), "novo caso terceiro nome")
      }
      return {
        texto: textoSolicitarNomePessoaAtendida(representativeName),
        opcoes: null
      }
    }
    if (!u._audioCanalTranscricao && !u.descricao) {
      return await pedirRelatoAposNome(from, u)
    }
    if (!u.whatsappContato || !u.whatsappVerificado) {
      setStage(u, "coleta_tel_wpp")
      iniciarTimer(from)
      if (!u.modoTexto) {
        await enviarAudioModoVoz(from, u, `Agora preciso do WhatsApp com DDD de ${primeiroNomeCliente(u) || "essa pessoa"}.`, "novo caso terceiro whatsapp")
      }
      return {
        texto: `●●●●○○ 📱 Etapa 4 de 6 · *WHATSAPP*\n\nQual é o WhatsApp com DDD de *${primeiroNomeCliente(u) || "essa pessoa"}* para contato da equipe?`,
        opcoes: null
      }
    }
    return await flowAcolhimentoCidade(u, { from })
  }
  if (u.nomeConfirmado && u.nome && u.whatsappVerificado && (u.cidade || u.uf || u.regiao)) {
    setStage(u, STAGES.AUDIO_CONFIRMAR_DADOS)
    iniciarTimer(from)
    return await telaConfirmarDadosAudio(from, u)
  }
  if (!u.nomeConfirmado || !u.nome) {
    setStage(u, STAGES.ACOLHIMENTO_NOME)
    iniciarTimer(from)
    if (!u.modoTexto) {
      await enviarAudioModoVoz(from, u, "Preciso confirmar o nome da pessoa deste novo caso. Qual é o nome completo?", "novo caso nome")
    }
    return {
      texto: "●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nQual é o nome completo da pessoa deste novo caso?",
      opcoes: null
    }
  }
  if (!u.whatsappVerificado) {
    return await flowAcolhimentoConfirmaWhatsapp(u, { from })
  }
  return await flowAcolhimentoCidade(u, { from })
}

async function executarIntencaoDetectadaCliente(from, u, intencao, textoOriginal = "") {
  if (["status", "documentos", "advogado"].includes(intencao)) {
    const selecao = await abrirSelecaoCasoParaAcao(from, u, intencao)
    if (selecao !== false) return selecao || { texto: null, opcoes: null }
  }
  return executarIntencaoCliente(from, u, intencao, textoOriginal)
}

async function executarIntencaoCliente(from, u, intencao, textoOriginal = "") {
  if (!intencao) return null
  if (intencao !== "documentos") u._docsClienteGuiado = false
  if (intencao === "menu") return await menuClienteComAudio(from, u)
  if (intencao === "status") return await telaStatusCliente(from, u)
  if (intencao === "documentos") {
    garantirListasDocumentos(u)
    const pendentes = getDocsPendentes(u)
    const faltantes = getDocsFaltantesReenviaveis(u)
    if (pendentes.length === 0 && faltantes.length === 0 && u.documentosEnviados) {
      await enviarAudioModoVoz(
        from,
        u,
        "Seus documentos já estão completos. Deseja enviar algo adicional, como uma foto mais nítida ou um complemento?",
        "documentos já completos"
      )
      iniciarTimer(from)
      const telaDocsCompletos = {
        texto: "📎 *Envio de documentos*\n\nSeus documentos já estão completos. Deseja enviar algo adicional, como uma foto mais nítida ou um complemento?",
        opcoes: [
          { id: "docs_confirmar_envio_extra", title: "✅ Sim, enviar" },
          { id: "m_inicio", title: "🏠 Menu do cliente" }
        ]
      }
      if (IMAGEM_DOCS_FINAL_URL) {
        await enviarImagemWhatsApp(from, IMAGEM_DOCS_FINAL_URL, telaDocsCompletos.texto, telaDocsCompletos.opcoes)
        return null
      }
      return telaDocsCompletos
    }
    const moveuParaDocumentos = await hsMoverStageSeguro(
      u.negocioId,
      HS_STAGE.AGUARDANDO_DOCS,
      u.negocioStageId,
      false
    )
    if (moveuParaDocumentos) u.negocioStageId = HS_STAGE.AGUARDANDO_DOCS
    salvarEtapa(u._numero, "documentos")
    setStage(u, STAGES.CLIENTE)
    u.docAtualIdx = u.docAtualIdx || 0
    u._docsClienteGuiado = false
    await enviarIntroDocumentos(from, u)
    iniciarTimer(from)
    return null
  }
  if (intencao === "advogado") return await telaAdvogadoClienteComAudio(from, u)
  if (intencao === "agendar") {
    return await iniciarAgendamento(from, u)
  }
  if (intencao === "cancelar_consulta") return await telaConfirmarCancelamentoConsultaCliente(from, u)
  if (intencao === "urgente") return await iniciarMensagemUrgenteCliente(from, u)
  if (intencao === "novo_caso") return await confirmarAberturaNovoCasoCliente(from, u)
  if (intencao === "despedida") return await encerrarClienteCadastrado(from, u)
  if (intencao === "cancelar") {
    await hsCriarNota(u.contatoId, "PEDIDO DE CANCELAMENTO OU DESISTENCIA", `De: ${u.nome || "-"} (${from})\nCaso: ${u.numeroCaso || "-"}\n\nMensagem: ${textoOriginal || "-"}`)
    await enviarAudioModoVoz(from, u, "Entendi. Para cancelar ou encerrar um caso, fale com nossa equipe. Você pode falar com um advogado ou voltar ao menu do cliente.", "cancelamento cliente")
    return {
      texto: "📌 *Entendi.*\n\nPara cancelar ou encerrar um caso, fale com nossa equipe.",
      opcoes: [
      { id: "m_adv",      title: "👨‍⚖️ Falar com advogado" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
      ]
    }
  }
  return null
}


function sairContextoDocumentosCliente(u) {
  if (!u) return
  u._docsClienteGuiado = false
  setStage(u, STAGES.CLIENTE)
  u.etapa = STAGES.CLIENTE
  u.lastPergunta = null
  u.lastPerguntaPayload = null
  u.aguardandoResposta = false
}

function responderComTimer(from, payload) {
  iniciarTimer(from)
  return payload
}

function telaDescreverCaso() {
  return {
    texto: "●●●○○○ 📝 Etapa 3 de 6 · *Relato*\n\n✍️ Pode me contar um pouco mais sobre seu caso?\nVocê pode digitar ou enviar um áudio 😊",
    opcoes: [
      { id: "desc_incentivo_depois", title: "⏳ Enviar depois" },
        { id: "desc_incentivo_menu",      title: "🏠 Menu do cliente" },
    ]
  }
}

function telaConfirmarUrgente(transcricao) {
  return {
    texto: `🎙️ *Áudio recebido e transcrito!*\n\n📝 *Transcrição:*\n\n"${transcricao.slice(0, 400)}${transcricao.length > 400 ? "..." : ""}"\n\nConfirme ou corrija as informações.`,
    opcoes: [{ id:"urg_audio_ok", title:"✅ Confirmar" }, { id:"urg_audio_corrigir", title:"✏️ Corrigir" }, { id: "m_inicio", title: "🏠 Menu do cliente" }]
  }
}

async function telaConfirmarUrgenteComAudio(from, u, transcricao) {
  try {
    const ogg = await gerarAudioAtendente(u.atendente,
      `Recebi sua mensagem! Ouvi o que você disse.
    Você tem três opções.
    Primeira: Confirmar, para enviar essa mensagem para nossa equipe.
    Segunda: Corrigir, se quiser gravar novamente.
    Terceira: Menu do cliente, para voltar ao menu principal.`)
    await enviarAudio(from, urlAudioAtendente(ogg))
    await new Promise(r => setTimeout(r, 4000))
  } catch (e) { logErro("tts", "Falha áudio confirmar urgente", e) }

  return telaConfirmarUrgente(transcricao)
}

function deveOferecerExplicarTudo(u) {
  if (!u) return false
  if (u._ofereceuExplicarTudo) return false
  return !u.descricao && !u._descTemp
}

function prepararOfertaExplicarTudoFinal(from, u, proximoStage, proximaPergunta) {
  u._ofereceuExplicarTudo = true
  u._proximoStageAposDescricao = proximoStage
  u._proximaPerguntaAposDescricao = proximaPergunta
  setStage(u, STAGES.COLETA_DESC_AUDIO)
  iniciarTimer(from)
  return telaDescreverCaso()
}

function iniciarConfirmacaoDescricao(from, u, texto, origemStage) {
  u._descTemp = normalizarTextoCRM(texto)
  u._descOrigemStage = origemStage
  setStage(u, STAGES.DESC_CONFIRMA)
  iniciarTimer(from)
  const preview = u._descTemp.length > 400 ? u._descTemp.slice(0, 400) + "..." : u._descTemp
  return {
    texto: `📝 *Você descreveu:*\n\n"${preview}"\n\nEstá correto?`,
    opcoes: [
      { id: "desc_ok", title: "✅ Confirmar" },
      { id: "desc_corrigir", title: "✏️ Corrigir" }
    ]
  }
}

async function respostaAposConfirmarDescricao(from, u) {
  if (u._descOrigemStage === "trab_out_desc" || u._descOrigemStage === "out_desc") {
    u.assuntoResumo = normalizarTextoCRM(u.descricao || u._descTemp || "")
    u.descricao = u.assuntoResumo
    u._descOrigemStage = null
    return prepararFluxoResumoOutro(from, u)
  }

  if (u._proximoStageAposDescricao) {
    const proximoStage = u._proximoStageAposDescricao
    const proximaPergunta = u._proximaPerguntaAposDescricao
    u._proximoStageAposDescricao = null
    u._proximaPerguntaAposDescricao = null
    u._descOrigemStage = null
    setStage(u, proximoStage)
    iniciarTimer(from)
    if (proximoStage === STAGES.CONFIRMACAO) {
      await sincronizarNegocio(u)
      return await telaConfirmacaoComImagem(from, u)
    }
    if (proximaPergunta) return proximaPergunta
    return { texto: "Perfeito. Vou considerar esses detalhes no atendimento.", opcoes: [{ id: "cont", title: "▶️ Continuar" }] }
  }

  setStage(u, "confirmacao")
  u._descOrigemStage = null
  iniciarTimer(from)
  await sincronizarNegocio(u)
  return await telaConfirmacaoComImagem(from, u)
}

async function flowInicio(u, ctx) {
  const from = ctx?.from || u._numero || ""
  if (podeMostrarMenuCliente(u)) {
    setStage(u, STAGES.INICIO_RETORNO)
    const nomeExib = getPrimeiroNomeRetomada(u)
    await enviarAudioModoVoz(
      from,
      u,
      `Que bom te ver novamente, ${nomeExib}. Voce ja possui um atendimento conosco. Na tela, escolha acompanhar meu caso ou abrir novo caso.`,
      "inicio retorno"
    )
    return {
        texto: `Que bom te ver novamente, *${nomeExib}* 😊\n\nVocê já possui um atendimento conosco.\n\n📄 Caso: *${u.numeroCaso}*\n⚖️ Área: ${u.area}\n\nO que deseja fazer?`,
      opcoes: [
        { id: "ret_acompanhar", title: "📊 Acompanhar meu caso" },
        { id: "ret_novo", title: "➕ Abrir novo caso" }
      ]
    }
  }
  return await iniciarFluxoRelatoLivre(from, u, { boasVindas: true })
}

async function flowInicioRetorno(u, ctx) {
  setStage(u, STAGES.INICIO_RETORNO)
  const nomeExib = getPrimeiroNomeRetomada(u)
  await enviarAudioModoVoz(
    ctx?.from || u?._numero || "",
    u,
    `Que bom te ver novamente, ${nomeExib}. Voce ja possui um atendimento conosco. Na tela, escolha acompanhar meu caso ou abrir novo caso.`,
    "inicio retorno"
  )
  return {
        texto: `Que bom te ver novamente, *${nomeExib}* 😊\n\nVocê já possui um atendimento conosco.\n\n📄 Caso: *${u.numeroCaso}*\n⚖️ Área: ${u.area}\n\nO que deseja fazer?`,
    opcoes: [
        { id: "ret_acompanhar", title: "📊 Acompanhar meu caso" },
      { id: "ret_novo", title: "➕ Abrir novo caso" }
    ]
  }
}

function obterStageRetomadaOriginal(u) {
  const candidatos = [
    u?._stageRetomadaOriginal,
    obterEtapaSegura(u?._numero),
    u?.etapa,
    u?.lastPergunta,
    u?.stage
  ]

  for (const candidato of candidatos) {
    const etapa = normalizarStageKey(candidato)
    if (!etapaValida(etapa)) continue
    if ([STAGES.RETOMADA_AUTOMATICA, STAGES.RETOMADA_MENU, STAGES.RESUMO_ATENDIMENTO, STAGES.RESUMO_RETOMADA].includes(etapa)) continue
    return etapa
  }

  return STAGES.AUDIO_AGUARDANDO
}

function obterCamposResumo(u) {
  const formatarResumoValor = valor => {
    const texto = sanitizarTextoEntrada(valor)
    if (!texto) return null

    const mapa = {
      area_inss: "INSS",
      area_trab: "Trabalhista",
      area_familia: "Família",
      area_consumidor: "Consumidor",
      area_penal: "Penal",
      area_civil: "Civil",
      area_imovel: "Imobiliário",
      area_outros: "Outros"
    }

    if (mapa[texto]) return mapa[texto]

    return texto
      .replace(/_/g, " ")
      .split(" ")
      .filter(Boolean)
      .map(parte => parte.charAt(0).toUpperCase() + parte.slice(1))
      .join(" ")
  }

  const possuiResumoValido = valor => {
    const texto = sanitizarTextoEntrada(valor)
    return !!texto && !/^nao informado$/i.test(texto) && !!formatarResumoValor(valor)
  }

  const campos = []

  if (possuiResumoValido(u?.area)) campos.push({ key: "area", label: "Área", valor: u.area })
  if (possuiResumoValido(u?.tipo)) campos.push({ key: "tipo", label: "Tipo", valor: u.tipo })
  if (possuiResumoValido(u?.situacao)) campos.push({ key: "situacao", label: "Situação", valor: u.situacao })
  if (possuiResumoValido(u?.regiao)) campos.push({ key: "regiao", label: "Região", valor: u.regiao })
  if (possuiResumoValido(u?.uf)) campos.push({ key: "uf", label: "Estado", valor: u.uf })
  if (possuiResumoValido(u?.cidade)) campos.push({ key: "cidade", label: "Cidade", valor: u.cidade })
  if (possuiResumoValido(u?.descricao)) campos.push({ key: "descricao", label: "Descrição", valor: u.descricao })

  return campos
}

async function flowMenuCorrecaoRetomada(u, ctx) {
  const camposResumo = obterCamposResumo(u)

  if (camposResumo.length === 0) {
    await enviarAudioModoVoz(
      ctx?.from || u?._numero || "",
      u,
      "Nao encontrei dados para corrigir no resumo. Toque em continuar para seguir o atendimento.",
      "correcao retomada vazia"
    )
    return {
      texto: "âœï¸ Nenhum dado para corrigir no resumo.",
      opcoes: [{ id: "rr_continuar", title: "▶️ Continuar" }]
    }
  }

  const opcoes = camposResumo.map(campo => ({
    id: `rr_corr_${campo.key}`,
    title: `✏️ ${campo.label}`
  }))

  opcoes.push({ id: "rr_corr_voltar", title: "⬅️ Voltar ao resumo" })

  await enviarAudioModoVoz(
    ctx?.from || u?._numero || "",
    u,
    `Qual informacao voce deseja corrigir? As opcoes aparecem na tela: ${camposResumo.map(c => c.label).join(", ")}. Tambem pode voltar ao resumo.`,
    "menu correcao retomada"
  )

  return {
    texto: "✏️ Qual informação deseja corrigir?",
    opcoes: opcoes
  }
}

async function flowRetomadaAutomatica(u, ctx = {}) {
  if (!etapaValida(u?._stageRetomadaOriginal)) {
    u._stageRetomadaOriginal = obterStageRetomadaOriginal(u)
  }
  setStage(u, STAGES.RETOMADA_MENU)
  const from = ctx.from || u._numero || ""
  const nome = getPrimeiroNomeRetomada(u)
  if (!u.modoTexto && from) {
    try {
      const textoAudio = nome
        ? `Oi, ${nome}! Fiquei te esperando. Seu atendimento ficou salvo. Você tem três opções: a primeira é continuar de onde parou, a segunda é recomeçar do início, e a terceira é encerrar o atendimento. Qual delas você escolhe?`
        : `Oi! Fiquei te esperando. Seu atendimento ficou salvo. Você tem três opções: a primeira é continuar de onde parou, a segunda é recomeçar do início, e a terceira é encerrar o atendimento. Qual delas você escolhe?`
      const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 2000))
    } catch (e) { logErro("tts", "Falha áudio retomada automática", e) }
  }
  return {
    texto: `🕒 *Atendimento pausado*\n\nOi${nome ? `, *${nome}*` : ""} 😊 Fiquei te esperando.\n\n📌 Seu atendimento ficou salvo.\n\nComo deseja continuar?`,
    opcoes: [
      { id: "rm_continuar", title: "▶️ Continuar" },
      { id: "rm_recomecar", title: "🔄 Recomeçar" },
      { id: "m_encerrar", title: "👋 Encerrar" }
    ],
    perguntaId: STAGES.RETOMADA_MENU
  }
}

async function flowRetomadaMenu(u, ctx = {}) {
  if (!etapaValida(u?._stageRetomadaOriginal)) {
    u._stageRetomadaOriginal = obterStageRetomadaOriginal(u)
  }
  setStage(u, STAGES.RETOMADA_MENU)
  const from = ctx.from || u._numero || ""
  const nome = getPrimeiroNomeRetomada(u)
  if (!u.modoTexto && from) {
    try {
      const textoAudio = nome
        ? `Oi, ${nome}! Fiquei te esperando. Seu atendimento ficou salvo. Você tem três opções: a primeira é continuar de onde parou, a segunda é recomeçar do início, e a terceira é encerrar o atendimento. Qual delas você escolhe?`
        : `Oi! Fiquei te esperando. Seu atendimento ficou salvo. Você tem três opções: a primeira é continuar de onde parou, a segunda é recomeçar do início, e a terceira é encerrar o atendimento. Qual delas você escolhe?`
      const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 2000))
    } catch (e) { logErro("tts", "Falha áudio retomada menu", e) }
  }
  return {
    texto: `🕒 *Atendimento pausado*\n\nOi${nome ? `, *${nome}*` : ""} 😊 Fiquei te esperando.\n\n📌 Seu atendimento ficou salvo.\n\nComo deseja continuar?`,
    opcoes: [
      { id: "rm_continuar", title: "▶️ Continuar" },
      { id: "rm_recomecar", title: "🔄 Recomeçar" },
      { id: "m_encerrar", title: "👋 Encerrar" }
    ],
    perguntaId: STAGES.RETOMADA_MENU
  }
}

async function flowResumoRetomada(u, ctx = {}) {
  if (!etapaValida(u?._stageRetomadaOriginal)) {
    u._stageRetomadaOriginal = obterStageRetomadaOriginal(u)
  }
  setStage(u, STAGES.RESUMO_RETOMADA)
  const from = ctx.from || u._numero || ""
  const nome = getPrimeiroNomeRetomada(u)
  if (!u.modoTexto && from) {
    try {
      const stageResumo = u?._stageRetomadaOriginal || u?.stage || ""
      const labelEtapa = {
        acolhimento_nome: "informar seu nome",
        acolhimento_confirma_nome: "confirmar seu nome",
        acolhimento_confirma_whatsapp: "confirmar seu WhatsApp",
        acolhimento_cidade: "informar sua cidade",
        audio_confirmar_dados: "confirmação dos dados",
        assessoria_inicial: "confirmar o entendimento do seu relato",
        coleta_desc: "descrever seu caso",
        gatilho: "avaliação de urgência",
        confirmacao: "confirmação final dos dados"
      }
      const etapaLegivel = labelEtapa[stageResumo] || "uma das etapas do atendimento"
      const textoOriginal = sanitizarTextoEntrada(u?.assuntoResumo || u?.descricao || u?._audioCanalTranscricao)
      let fraseRelato = ""
      if (textoOriginal && GROQ_KEY) {
        try {
          const resposta = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
            model: "llama-3.1-8b-instant",
            messages: [
              { role: "system", content: "Você é um assistente jurídico. Resuma o relato do cliente em UMA frase curtíssima, no estilo 'que você foi agredido por um vizinho' ou 'sobre um problema com seu empregador'. Não use termos técnicos. Comece sempre com 'que você'." },
              { role: "user", content: textoOriginal }
            ],
            max_tokens: 80,
            temperature: 0.3
          }, { headers: { Authorization: `Bearer ${GROQ_KEY}` } })
          fraseRelato = resposta.data.choices?.[0]?.message?.content?.trim() || ""
        } catch (e) {
          logErro("groq", "Falha resumo relato no áudio da retomada", e)
          fraseRelato = textoOriginal ? textoOriginal.slice(0, 120) : ""
        }
      }
      const itensFeitos = []
      if (u.nome || u.nomeHubspot) itensFeitos.push(`nos informou seu nome como ${u.nome || u.nomeHubspot}`)
      if (u.cidade) itensFeitos.push(`nos disse que mora em ${u.cidade}`)
      if (fraseRelato) itensFeitos.push(`nos contou ${fraseRelato}`)
      const resumoFeito = itensFeitos.length > 0
        ? ` Você já ${itensFeitos.join(", ")}.`
        : ""
      const relatoAudio = fraseRelato
        ? ` Você nos contou ${fraseRelato}.`
        : ""
      const textoAudio = nome
        ? `${nome}, você parou na etapa de ${etapaLegivel}.${relatoAudio} Quer continuar, corrigir algo, recomeçar ou encerrar?`
        : `Você parou na etapa de ${etapaLegivel}.${relatoAudio} Quer continuar, corrigir algo, recomeçar ou encerrar?`
      const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 2000))
    } catch (e) { logErro("tts", "Falha áudio resumo retomada", e) }
  }
  return {
    texto: await montarTextoResumoRetomada(u, sortearAtendente),
    opcoes: [
      { id: "rr_continuar", title: "✅ Continuar" },
      { id: "rr_corrigir", title: "✏️ Corrigir algo" },
      { id: "rr_recomecar", title: "🔄 Recomeçar" },
      { id: "rr_encerrar", title: "👋 Encerrar" }
    ],
    perguntaId: STAGES.RESUMO_RETOMADA
  }
}

async function flowResumoAtendimento(u, ctx) {
  if (!etapaValida(u?._stageRetomadaOriginal)) {
    u._stageRetomadaOriginal = obterStageRetomadaOriginal(u)
  }

  setStage(u, STAGES.RESUMO_ATENDIMENTO)
  const from = ctx?.from || u?._numero || ""
  const texto = await montarTextoResumoRetomada(u, sortearAtendente)
  await enviarAudioModoVoz(
    from,
    u,
    "Vou relembrar seu atendimento anterior. Confira o resumo na tela e escolha se deseja continuar, corrigir, recomecar ou encerrar.",
    "resumo atendimento"
  )
  return {
    texto,
    opcoes: [
      { id: "ra_continuar", title: "✅ Sim, continuar" },
      { id: "ra_corrigir", title: "✏️ Corrigir" },
      { id: "ra_recomecar", title: "🔄 Recomeçar" },
      { id: "ra_encerrar", title: "👋 Encerrar" }
    ],
    perguntaId: STAGES.RESUMO_ATENDIMENTO
  }
}

function reiniciarFluxoRetomada(u) {
  Object.assign(u, {
    stage: STAGES.INICIO,
    tipo: null,
    area: null,
    descricao: null,
    temCadastroCompleto: false,
    numeroCaso: null,
    situacao: null,
    subTipo: null,
    detalhe: null,
    documentosEnviados: false,
    lastPergunta: null,
    lastPerguntaPayload: null,
    aguardandoResposta: false,
    aguardandoRetomada: false,
    jaOfereceuRetomada: false,
    _retomadaEhLeadFrio: false,
    _stageRetomadaOriginal: null
  })
}

function respostaOpcaoInvalidaRetomada() {
  return {
    texto: "🤔 Não entendi. Por favor, escolha uma das opções do menu para continuar. 👇",
    opcoes: [
      { id: "rm_continuar", title: "▶️ Continuar atendimento" },
      { id: "rm_recomecar", title: "🔄 Recomeçar" },
      { id: "m_encerrar", title: "👋 Encerrar" }
    ],
    perguntaId: STAGES.RETOMADA_MENU
  }
}

async function responderImprevistoPreAtendimento(from, u, stage, tipo, textoOriginal = "") {
  const pergunta = perguntaAtualPreAtendimento(stage, u)
  let texto = ""
  let audio = ""

  // Se o tipo for 'relato' mas o texto indica claramente que é caso de terceira pessoa,
  // tratar como 'terceiro' para não cadastrar o nome do remetente por engano.
  try {
    if (tipo === "relato") {
      const ehTerceiro = pareceCasoParaTerceiroPreAtendimento(textoOriginal) || (relacaoTerceiroPreAtendimento(textoOriginal) !== "pessoa atendida")
      if (ehTerceiro) tipo = "terceiro"
    }
  } catch (e) { /* silencioso: não quebrar fluxo se algo falhar */ }

  if (tipo === "terceiro") {
    const relacao = relacaoTerceiroPreAtendimento(textoOriginal)
    const alvoTexto = descricaoRelacaoTerceiroPreAtendimento(relacao)
    u.atendimentoParaTerceiro = true
    u.telefoneEhDoCliente = false
    u._nomeTitularOrigem = "atendido"
    u.relacaoComAtendido = relacao
    u._nomeTemp = null
    // Preservar o relato que veio antecipado para não perder após coletar nomes
    const relatoExtraido = normalizarTextoCRM(textoOriginal)
    if (relatoExtraido && !u._audioCanalTranscricao) {
      u._audioCanalTranscricao = relatoExtraido
      u._relatoAntecipadoPreAtendimento = relatoExtraido
    }
    setStage(u, STAGES.ACOLHIMENTO_NOME_CONTATO)
    salvarEtapa(u._numero || from, STAGES.ACOLHIMENTO_NOME_CONTATO)
    texto = textoSolicitarNomeRepresentante()
    audio = audioSolicitarNomeRepresentante()
    return await responderTelaComAudio(
      from,
      u,
      {
        texto,
        opcoes: [
          { id: "pre_nome_informar", title: "👤 Informar nome" },
          { id: "pre_mim_continuar", title: "🙋 É para mim" }
        ]
      },
      audio,
      "pre atendimento terceiro pede nome contato"
    )
  } else if (tipo === "advogado_direto" || tipo === "duvida") {
    // Se sofrimento foi detectado nesta sessão, a resposta ao pedido de advogado
    // precisa ser empática, não burocrática — reconhece a urgência emocional e
    // enquadra o cadastro como cuidado, não como barreira.
    let resposta
    if (u._jaAcolheuSofrimento && tipo === "advogado_direto") {
      resposta = "Entendo que você quer falar com alguém agora, e vou garantir que isso aconteça. Para que o advogado chegue já sabendo tudo sobre sua situação e possa te ajudar de verdade, preciso registrar algumas informações antes. Leva poucos minutos."
    } else {
      resposta = respostaCurtaDuvidaPreAtendimento(textoOriginal)
    }
    texto = `💬 ${resposta}\n\n${pergunta.texto}`
    audio = `${resposta} ${pergunta.audio}`
  } else if (tipo === "relato") {
    const relato = normalizarTextoCRM(textoOriginal)
    if (relato && !u.descricao) {
      u.descricao = relato
      u._relatoAntecipadoPreAtendimento = relato
    }
    texto = `📝 Entendi e guardei essa informação sobre a situação.\n\n${pergunta.texto}`
    audio = `Entendi e guardei essa informação sobre a situação. ${pergunta.audio}`
  } else {
    texto = `🤔 Não consegui entender se isso era uma resposta da etapa ou uma dúvida.\n\n${pergunta.texto}`
    audio = `Não consegui entender se isso era uma resposta da etapa ou uma dúvida. ${pergunta.audio}`
  }

  iniciarTimer(from)
  return await responderTelaComAudio(
    from,
    u,
    { texto, opcoes: pergunta.opcoes },
    audio,
    "imprevisto pre atendimento"
  )
}

async function redirecionarCorrecaoPreAtendimento(from, u, campo) {
  const campoNorm = sanitizarTextoEntrada(campo || "").toLowerCase()

  // Verdadeiro se o cliente já tem dados suficientes para exibir a tela de confirmação
  // (nome confirmado E cidade coletada). Se faltar algum, ao terminar a edição o fluxo
  // retoma normalmente pela sequência de coleta, não pela tela de confirmação.
  const jaTemDadosParaConfirmacao = () => !!(u.nomeConfirmado && u.cidade)

  // Helper: ir para mini-stage de edição com retorno à confirmação
  const irParaEditar = async (stage, textoMsg, textoAudio) => {
    u._retornarParaConfirmacao = jaTemDadosParaConfirmacao()
    u._origemConfirmacao = u.modoTexto ? "texto" : "audio"
    setStage(u, stage)
    iniciarTimer(from)
    if (!u.modoTexto && textoAudio) {
      try {
        const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3000))
      } catch (e) { logErro("tts", "Falha áudio redirecionarCorrecao", e) }
    }
    return responderComTimer(from, { texto: textoMsg, opcoes: null })
  }

  if (campoNorm === "nome") {
    // No fluxo para terceiro, quando ambos os nomes já foram coletados, perguntar
    // qual dos dois o usuário quer corrigir antes de abrir o editor.
    if (u.atendimentoParaTerceiro && u.nomeContato && u.nome) {
      const primeiroNomeContato = u.nomeContato.split(" ")[0]
      const primeiroNomeAtendido = u.nome.split(" ")[0]
      u._retornarParaConfirmacao = jaTemDadosParaConfirmacao()
      u._origemConfirmacao = u.modoTexto ? "texto" : "audio"
      setStage(u, STAGES.EDITAR_NOME)
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente,
            `Entendido! Qual nome você quer corrigir? Primeira opção: seu nome, ${primeiroNomeContato}. Segunda opção: o nome da pessoa atendida, ${primeiroNomeAtendido}.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 4000))
        } catch (e) { logErro("tts", "Falha áudio qual nome corrigir", e) }
      }
      return responderComTimer(from, {
        texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nQual nome você quer corrigir?`,
        opcoes: [
          { id: "corr_nome_contato", title: `🙋 Meu nome (${primeiroNomeContato})` },
          { id: "corr_nome_atendido", title: `👤 Nome de ${primeiroNomeAtendido}` }
        ]
      })
    }
    // Fluxo para si, ou para terceiro mas com apenas um nome coletado: vai direto
    const ehNomeContato = u.atendimentoParaTerceiro && u.nomeContato && !u.nome
    u._correcaoPendenteSubcampo = ehNomeContato ? "nomeContato" : "nome"
    return await irParaEditar(
      STAGES.EDITAR_NOME,
      `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nEntendido! Qual é o nome correto?\n\n_Digite ou envie um áudio com o nome completo._`,
      `Entendido! Me diga o nome correto, pode falar ou digitar.`
    )
  }
  if (campoNorm === "whatsapp") {
    u._retornarParaConfirmacao = jaTemDadosParaConfirmacao()
    u._origemConfirmacao = u.modoTexto ? "texto" : "audio"
    u._corrigindoWhatsappConfirmacao = jaTemDadosParaConfirmacao()
    setStage(u, STAGES.REVALIDA_WHATSAPP)
    iniciarTimer(from)
    const numeroAtual = formatarTelefoneExibicao(getTelefoneContato(from, u))
    if (!u.modoTexto) {
      try {
        const digitosAudio = String(getTelefoneContato(from, u) || "").replace(/\D/g, "").split("").join(" ")
        const ogg = await gerarAudioAtendente(u.atendente,
          `Entendido! Seu WhatsApp está como ${digitosAudio}. Se quiser usar outro número, é só falar ou digitar com DDD agora.`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3500))
      } catch (e) { logErro("tts", "Falha áudio redirecionarCorrecao whatsapp", e) }
    }
    return responderComTimer(from, {
      texto: `●●●●○○ 📱 Etapa 4 de 6 · *WHATSAPP*\n\nSeu WhatsApp está como *${numeroAtual || from}*.\n\nEsse é o número correto? Se quiser usar outro, é só digitar ou falar com DDD agora. 🎙️`,
      opcoes: [{ id: "revalida_whatsapp_ok", title: "✅ Confirmar" }]
    })
  }
  if (campoNorm === "cidade") {
    return await irParaEditar(
      STAGES.EDITAR_CIDADE,
      `●●●●●○ 📍 Etapa 5 de 6 · *CIDADE*\n\nEntendido! Qual é a cidade correta?\n\nDigite a cidade com o estado (ex: *Recife, PE*) ou informe o CEP.`,
      `Entendido! Me diga a cidade correta com o estado, ou informe o CEP.`
    )
  }
  if (campoNorm === "situacao") {
    return await irParaEditar(
      STAGES.EDITAR_SITUACAO,
      `📌 Entendido! *Qual é a situação correta?*\n\n_Descreva brevemente ou envie um áudio._`,
      `Entendido! Me conta a situação correta do seu caso.`
    )
  }
  if (campoNorm === "detalhe") {
    return await irParaEditar(
      STAGES.EDITAR_DETALHE,
      `🔎 Entendido! *Qual é o detalhe correto?*\n\n_Digite ou envie um áudio._`,
      `Entendido! Me diga o detalhe correto.`
    )
  }
  if (campoNorm === "urgencia") {
    u._retornarParaConfirmacao = jaTemDadosParaConfirmacao()
    u._origemConfirmacao = u.modoTexto ? "texto" : "audio"
    setStage(u, STAGES.EDITAR_URGENCIA)
    iniciarTimer(from)
    if (!u.modoTexto) {
      try {
        const ogg = await gerarAudioAtendente(u.atendente,
          `Entendido! Qual é o nível de urgência correto? Primeira opção: Alta, preciso de ajuda urgente. Segunda opção: Moderada, posso aguardar um pouco. Terceira opção: Baixa, sem pressa.`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3500))
      } catch (e) { logErro("tts", "Falha áudio redirecionarCorrecao urgencia", e) }
    }
    return responderComTimer(from, {
      texto: `⚡ Entendido! *Qual é o nível de urgência correto?*`,
      opcoes: [
        { id: "eu_alta",   title: "🔴 Alta" },
        { id: "eu_normal", title: "🟡 Moderada" },
        { id: "eu_baixa",  title: "🟢 Baixa" }
      ]
    })
  }
  if (campoNorm === "descricao") {
    return await irParaEditar(
      STAGES.EDITAR_DESCRICAO,
      `💬 Entendido! *Qual é a descrição correta do caso?*\n\n_Digite ou envie um áudio com a descrição atualizada._`,
      `Entendido! Me conta a descrição correta do seu caso.`
    )
  }

  // Campo não identificado — pede para especificar via CORRIGIR_DADOS
  setStage(u, STAGES.CORRIGIR_DADOS)
  iniciarTimer(from)
  if (!u.modoTexto) {
    try {
      const ogg = await gerarAudioAtendente(u.atendente,
        `Entendido, você quer corrigir algo. Me diz o que está errado: pode ser o nome, o WhatsApp, a cidade ou qualquer outro dado.`)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 3500))
    } catch (e) { logErro("tts", "Falha áudio redirecionarCorrecao outro", e) }
  }
  return responderComTimer(from, {
    texto: `✏️ Entendido, você quer corrigir algo!\n\nMe diz o que está errado. Pode ser o nome, o WhatsApp, a cidade ou qualquer outro dado.\n\n_Digite ou envie um áudio._`,
    opcoes: null
  })
}

async function tratarImprevistoPreAtendimento(from, u, stage, texto = "") {
  const entrada = sanitizarTextoEntrada(texto)
  if (!entrada) return null
  const classificacao = await classificarEntradaPreAtendimento(stage, entrada)
  if (classificacao.tipo === "correcao") {
    return await redirecionarCorrecaoPreAtendimento(from, u, classificacao.tema)
  }
  if (classificacao.tipo === "terceiro") {
    u.atendimentoParaTerceiro = true
    u._nomeTitularOrigem = u._nomeTitularOrigem || "atendido"
    return await responderImprevistoPreAtendimento(from, u, stage, "terceiro", entrada)
  }
  if (classificacao.tipo === "advogado_direto") {
    return await responderImprevistoPreAtendimento(from, u, stage, "advogado_direto", entrada)
  }
  if (classificacao.tipo === "duvida") {
    return await responderImprevistoPreAtendimento(from, u, stage, "duvida", entrada)
  }
  if (classificacao.tipo === "relato") {
    return await responderImprevistoPreAtendimento(from, u, stage, "relato", entrada)
  }
  // Fallback inteligente: classificador não reconheceu — IA conduz o cliente de volta
  return await conduzirPreAtendimentoIA(from, u, stage, entrada)
}

async function tratarIntervencaoPreAtendimento(from, u, stage, texto = "", opcoes = {}) {
  const entrada = sanitizarTextoEntrada(texto)
  if (!entrada) return null
  const classificacao = await classificarEntradaPreAtendimento(stage, entrada, opcoes)
  if (classificacao.tipo === "correcao") {
    // Intenção de corrigir um campo já informado — redireciona independentemente do stage,
    // inclusive em AUDIO_AGUARDANDO quando o usuário deveria estar relatando o caso.
    // Exemplos: "quero mudar o nome", "o WhatsApp está errado", "a cidade está errada".
    return await redirecionarCorrecaoPreAtendimento(from, u, classificacao.tema)
  }
  if (classificacao.tipo === "terceiro") {
    // Em AUDIO_AGUARDANDO o bot já pediu o relato — deixar passar sem interceptar
    if (stage === STAGES.AUDIO_AGUARDANDO) return null
    return await responderImprevistoPreAtendimento(from, u, stage, "terceiro", entrada)
  }
  if (classificacao.tipo === "advogado_direto") {
    return await responderImprevistoPreAtendimento(from, u, stage, "advogado_direto", entrada)
  }
  if (classificacao.tipo === "duvida") {
    // Em AUDIO_AGUARDANDO o bot já pediu o relato — uma mensagem que apenas menciona
    // um tema jurídico (ex: "consumidor", "banco", "divida") é o próprio relato, não
    // uma dúvida sobre o serviço. Só interceptar aqui se for claramente uma pergunta
    // funcional ("?", "como funciona", "quanto custa"), pedido de falar com advogado,
    // ou o usuário disser explicitamente que tem uma dúvida.
    if (stage === STAGES.AUDIO_AGUARDANDO) {
      const ehDuvidaExplicita =
        /\b(duvida|dúvida|duvidas|dúvidas)\b/.test(textoNormalizadoPreAtendimento(entrada)) ||
        parecePedidoAdvogadoDiretoPreAtendimento(entrada) ||
        parecePerguntaFuncionalPreAtendimento(entrada)
      if (!ehDuvidaExplicita) return null
    }
    return await responderImprevistoPreAtendimento(from, u, stage, "duvida", entrada)
  }
  // Relato jurídico legítimo: deixa passar para classificarAreaAudio processar normalmente
  if (classificacao.tipo === "relato") return null
  // Fallback inteligente: classificador não reconheceu — IA conduz o cliente de volta
  // Nota: só chamado se usarIA não foi false (intervencao sem IA retorna null normalmente)
  if (opcoes.usarIA !== false) {
    return await conduzirPreAtendimentoIA(from, u, stage, entrada)
  }
  return null
}

// Condutor inteligente do pré-atendimento via IA — chamado apenas quando as regras e o
// classificador não reconheceram a mensagem (retorno null). Gera resposta contextual
// que acolhe o que o cliente disse e redireciona gentilmente para o dado que ainda falta.
async function conduzirPreAtendimentoIA(from, u, stage, textoOriginal = "") {
  const entrada = sanitizarTextoEntrada(textoOriginal)
  if (!GROQ_KEY || !entrada || entrada.length < 3) return null

  const pergunta = perguntaAtualPreAtendimento(stage, u)
  const dadoFaltante = pergunta?.audio || pergunta?.texto || "a informação solicitada"
  const primeiroNome = primeiroNomeCliente(u) || ""

  const contextoDados = []
  if (u.nome) contextoDados.push(`Nome já coletado: ${u.nome}`)
  if (u.atendimentoParaTerceiro) contextoDados.push("Atendimento para terceiro: sim")
  const contextoStr = contextoDados.length ? contextoDados.join(". ") + "." : "Nenhum dado coletado ainda."

  const stageDescricao = {
    [STAGES.AUDIO_AGUARDANDO]: "aguardando o cliente relatar a situação jurídica",
    [STAGES.ACOLHIMENTO_MODO]: "aguardando escolha do modo de comunicação (áudio ou texto)",
    [STAGES.ACOLHIMENTO_PARA_QUEM]: "aguardando confirmação se o atendimento é para o contato ou para terceiro",
    [STAGES.ACOLHIMENTO_NOME_CONTATO]: "aguardando o nome de quem está no WhatsApp (o contato que abre o caso para outra pessoa)",
    [STAGES.ACOLHIMENTO_CONFIRMA_NOME_CONTATO]: "aguardando confirmação do nome de quem está no WhatsApp antes de prosseguir",
    [STAGES.ACOLHIMENTO_NOME]: "aguardando o nome completo da pessoa atendida",
    [STAGES.ACOLHIMENTO_CONFIRMA_NOME]: "aguardando confirmação do nome informado",
    [STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP]: "aguardando confirmação se este WhatsApp pertence à pessoa atendida",
    [STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP_OUTRO]: "aguardando escolha sobre qual número usar",
    [STAGES.ACOLHIMENTO_CIDADE]: "aguardando a cidade onde a pessoa atendida mora"
  }
  const descricaoStage = stageDescricao[stage] || "em etapa de pré-atendimento"

  // Score emocional da mensagem atual para calibrar o tom da resposta
  const sofrimentoDetectado = detectarSofrimentoIntenso(entrada)
  const emocional = scoreEmocional({ _audioCanalTranscricao: entrada, urgencia: u.urgencia })
  const nivelEmocional = emocional.nivel // "alto", "medio", "baixo"

  const instrucaoTom = sofrimentoDetectado || nivelEmocional === "alto"
    ? `ATENÇÃO: O cliente demonstra sofrimento real nesta mensagem. Antes de qualquer coisa, acolha com genuína empatia (1 frase curta e humana). Só depois, de forma suave, conduza para o dado que falta. Nunca soe burocrático ou apressado.`
    : nivelEmocional === "medio"
    ? "O cliente está preocupado. Seja atencioso e mostre que entendeu antes de pedir o dado."
    : "Seja direto, gentil e natural."

  try {
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: `Você é a atendente virtual do escritório Oráculum Advocacia no WhatsApp. Seu objetivo é conduzir o cliente pelo pré-cadastro de forma acolhedora e humana.

O cliente enviou uma mensagem inesperada durante o pré-atendimento. Você deve:
1. Reconhecer brevemente o que o cliente disse (máximo 2 frases, sem julgamentos)
2. Explicar com clareza o que está acontecendo agora no atendimento (1 frase)
3. Pedir de forma natural e gentil o dado que ainda falta

INSTRUÇÃO DE TOM: ${instrucaoTom}

REGRAS OBRIGATÓRIAS:
- Use emojis com moderação (1 a 3 por mensagem)
- Linguagem simples, acessível para pessoas com baixa escolaridade
- Nunca use termos jurídicos complexos
- Sempre termine perguntando o dado que falta
- Responda em português brasileiro informal e acolhedor
- NÃO invente informações sobre o escritório ou sobre o caso
- O texto de áudio deve ser igual ao texto da tela, mas SEM emojis e SEM asteriscos

Responda APENAS com JSON válido no formato:
{"textoTela":"texto com emojis e formatação WhatsApp","textoAudio":"mesmo texto sem emojis e sem asteriscos"}`
          },
          {
            role: "user",
            content: `Etapa atual: ${descricaoStage}
Contexto (dados já confirmados anteriormente): ${contextoStr}
${primeiroNome ? `Nome do cliente nesta conversa: ${primeiroNome}` : ""}
Tom emocional detectado: ${nivelEmocional}${sofrimentoDetectado ? " (sofrimento intenso detectado)" : ""}
MENSAGEM ENVIADA AGORA PELO CLIENTE (não é dado confirmado — é o que ele acabou de digitar): "${entrada}"
Dado que ainda precisa ser coletado: ${dadoFaltante}`
          }
        ],
        temperature: 0.4,
        max_tokens: 350,
        response_format: { type: "json_object" }
      },
      { headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" } }
    )

    let out = {}
    try {
      out = JSON.parse(res.data.choices?.[0]?.message?.content || "{}")
    } catch (e) {
      logErro("groq", "conduzirPreAtendimentoIA: parse JSON falhou", e)
      return null
    }

    const textoTela = sanitizarTextoEntrada(out.textoTela)
    const textoAudio = sanitizarTextoEntrada(out.textoAudio)
    if (!textoTela || textoTela.length < 10) return null

    // Sempre usa os botões conhecidos do stage atual — nunca IDs livres da IA,
    // pois IDs sem handler no servidor causam trava silenciosa no fluxo.
    const botoes = pergunta?.opcoes || null

    iniciarTimer(from)
    return await responderTelaComAudio(
      from,
      u,
      { texto: textoTela, opcoes: botoes },
      textoAudio || textoTela,
      "pre atendimento ia condutor"
    )
  } catch (e) {
    logErro("groq", "conduzirPreAtendimentoIA: " + e.message)
    return null
  }
}

async function flowAcolhimentoCidade(u, ctx = {}) {
  const from = ctx.from || u._numero || ""
  const introducaoAudio = sanitizarTextoEntrada(ctx.introducaoAudio)
  const primeiroNome = primeiroNomeCliente(u) || u.nome?.split(" ")[0] || u.nomeHubspot?.split(" ")[0] || u.nomeWA?.split(" ")[0] || ""
  const ehTerceiro = Boolean(u.atendimentoParaTerceiro || u._novoCasoParaTerceiro)
  let audioRetomadaEnviado = false
  if (u._vindoDeRetomada && !u.modoTexto && from) {
    u._vindoDeRetomada = false
    try {
      const nomeTerceiroRetomada = ehTerceiro && u.nome ? u.nome.split(" ")[0] : null
      const textoRetomada = nomeTerceiroRetomada
        ? `Certo! Você estava informando a cidade de ${nomeTerceiroRetomada}. Para continuar, me diga onde ${nomeTerceiroRetomada} mora. Você pode enviar um CEP, digitar o nome da cidade, ou enviar um áudio falando o nome da cidade.`
        : primeiroNome
          ? `Certo, ${primeiroNome}! Você estava informando sua cidade. Para continuar, me diga onde você mora. Você pode enviar um CEP, digitar o nome da cidade, ou enviar um áudio falando o nome da cidade.`
          : `Certo! Você estava informando sua cidade. Para continuar, me diga onde você mora. Você pode enviar um CEP, digitar o nome da cidade, ou enviar um áudio falando o nome da cidade.`
      const ogg = await gerarAudioAtendente(u.atendente, textoRetomada)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 3000))
      audioRetomadaEnviado = true
    } catch (e) { logErro("tts", "Falha áudio retomada cidade", e) }
  }
  if (!audioRetomadaEnviado && u.modoTexto !== true) {
    const nomeTerceiro = ehTerceiro && u.nome ? u.nome.split(" ")[0] : null
    await enviarAudioPedidoCidade(from, u.atendente, { nomeTerceiro, introducaoAudio })
  }
  setStage(u, STAGES.ACOLHIMENTO_CIDADE)
  salvarEtapa(u._numero || from, "acolhimento_cidade")
  const primeiroNomeAtendido = ehTerceiro && u.nome ? u.nome.split(" ")[0] : null
  const textoCidadeTela = primeiroNomeAtendido
    ? `Em qual *cidade* ${primeiroNomeAtendido} mora?\n\n_Pode digitar o nome da cidade, informar o CEP ou enviar um áudio._`
    : `Em qual *cidade* você mora${primeiroNome ? `, *${primeiroNome}*` : ""}?\n\n_Pode digitar o nome da cidade, informar o CEP ou enviar um áudio._`
  return {
    texto: `●●●●●○ 📍 Etapa 5 de 6 · *CIDADE*

${textoCidadeTela}`,
    opcoes: null,
    semAudio: true
  }
}

async function flowAcolhimentoConfirmaWhatsapp(u, ctx = {}) {
  const from = ctx.from || u._numero || ""
  let digitos = from.replace(/\D/g, "")
  if (digitos.length === 12) digitos = digitos.slice(0, 4) + "9" + digitos.slice(4)
  const ddd = digitos.slice(2, 4)
  const nono = digitos.slice(4, 5)
  const bloco1 = digitos.slice(5, 9)
  const bloco2 = digitos.slice(9, 13)
  const numeroFormatado = `(${ddd}) ${nono} ${bloco1}-${bloco2}`
  const numeroAudio = `DDD ${ddd.split("").join(" ")} ${nono} ${bloco1.slice(0,2)} ${bloco1.slice(2,4)} ${bloco2.slice(0,2)} ${bloco2.slice(2,4)}`
  const primeiroNome = primeiroNomeCliente(u) || u.nome?.split(" ")[0] || u.nomeHubspot?.split(" ")[0] || u.nomeWA?.split(" ")[0] || ""
  const ehParaSi = !u.atendimentoParaTerceiro
  if (!u.modoTexto && from) {
    try {
      let textoAudio
      if (u._vindoDeRetomada) {
        textoAudio = primeiroNome
          ? `Certo, ${primeiroNome}! Você estava confirmando seu número de WhatsApp. O número ${numeroAudio} é o seu? Se for esse mesmo, toque em Confirmar. Se preferir usar outro número, é só me dizer agora.`
          : `Certo! Você estava confirmando seu número de WhatsApp. O número ${numeroAudio} é o seu? Se for esse mesmo, toque em Confirmar. Se preferir usar outro número, é só me dizer agora.`
      } else if (ehParaSi) {
        textoAudio = primeiroNome
          ? `${primeiroNome}, vou registrar o número deste WhatsApp como seu contato. É o ${numeroAudio}. Está certo? Se preferir usar outro número, é só me dizer agora. Pode falar ou digitar.`
          : `Vou registrar o número deste WhatsApp como seu contato. É o ${numeroAudio}. Está certo? Se preferir usar outro número, é só me dizer agora. Pode falar ou digitar.`
      } else {
        textoAudio = primeiroNome
          ? `${primeiroNome}, o número deste WhatsApp é ${numeroAudio}. É o seu? Se for esse mesmo, toque em Confirmar. Se não for, é só me dizer o número correto com DDD agora. Pode falar ou digitar.`
          : `O número deste WhatsApp é ${numeroAudio}. É o seu? Se for esse mesmo, toque em Confirmar. Se não for, é só me dizer o número correto com DDD agora. Pode falar ou digitar.`
      }
      const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 4000))
    } catch (e) { logErro("tts", "Falha áudio whatsapp", e) }
  }
  u._vindoDeRetomada = false
  setStage(u, STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP)
  salvarEtapa(u._numero || from, "acolhimento_confirma_whatsapp")
  const textoNome = primeiroNome ? `*${primeiroNome}*` : `você`
  const textoTela = ehParaSi
    ? `●●●●○○ 📱 Etapa 4 de 6 · *WHATSAPP*\n\nVamos registrar seu número de contato, ${textoNome}.\n\nSeu WhatsApp é o *${numeroFormatado}*?\n\nConfirme ou informe outro número com DDD agora. 🎙️`
    : `●●●●○○ 📱 Etapa 4 de 6 · *WHATSAPP*\n\nPrecisamos confirmar seu número de contato, ${textoNome}.\n\nO número *${numeroFormatado}* é o seu WhatsApp?\n\nSe não for, é só digitar ou falar o número correto com DDD agora. 🎙️`
  return {
    texto: textoTela,
    opcoes: [
      { id: "whatsapp_sim", title: "✅ Confirmar" }
    ],
    semAudio: true
  }
}

async function telaEsclarecimentoConfuso(from, u) {
  const primeiroNome = primeiroNomeCliente(u) || ""
  const textoTela = `🤔 Posso ajudar de 4 formas rápidas:

- Registrar um caso agora (eu te guio passo a passo)
- Tirar uma dúvida sobre como o serviço funciona
- Registrar para outra pessoa (ex.: minha mãe)
- Pedir atendimento humano urgente

Como prefere continuar?`
  const textoAudio = `Posso ajudar de quatro formas rápidas: registrar um caso agora, tirar uma dúvida sobre o serviço, registrar para outra pessoa, ou pedir atendimento humano. Como prefere continuar?`
  iniciarTimer(from)
  return await responderTelaComAudio(
    from,
    u,
    {
      texto: textoTela,
      opcoes: [
        { id: "confuso_exemplos", title: "💡 Ver exemplos" },
        { id: "confuso_registrar", title: "📄 Registrar caso" },
        { id: "confuso_duvida", title: "❓ Tenho dúvida" },
        { id: "confuso_terceiro", title: "👥 É para outra pessoa" },
        { id: "confuso_humano", title: "🆘 Falar com humano" }
      ]
    },
    textoAudio,
    "esclarecimento confuso"
  )
}

async function flowNome(u, ctx) {
  return await perguntarNome(u)
}

function flowCidade(u, ctx) {
  return perguntarCidade(u)
}

async function flowDescricao(u, ctx) {
  const from = ctx?.from || u._numero || ""
  const primeiroNome = primeiroNomeCliente(u) || ""
  if (u._vindoDeRetomada && !u.modoTexto && from) {
    u._vindoDeRetomada = false
    try {
      const textoRetomada = primeiroNome
        ? `Certo, ${primeiroNome}! Você estava descrevendo seu caso. Pode continuar me contando o que aconteceu, digitando ou enviando um áudio.`
        : `Certo! Você estava descrevendo seu caso. Pode continuar me contando o que aconteceu, digitando ou enviando um áudio.`
      const ogg = await gerarAudioAtendente(u.atendente, textoRetomada)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 2000))
    } catch (e) { logErro("tts", "Falha áudio retomada descricao", e) }
  }
  return perguntarDescricao(u, ehStageDescricaoCaso(u.stage) ? u.stage : STAGES.COLETA_DESC_AUDIO)
}

function flowDocumentos(u, ctx) {
  return perguntarDocumentos(ctx.from, u)
}

async function flowDescConfirma(u, ctx) {
  setStage(u, STAGES.DESC_CONFIRMA)
  salvarEtapa(u._numero, "descricao_caso")
  if (!u._descTemp) {
    await enviarAudioModoVoz(
      ctx?.from || u?._numero || "",
      u,
      "Pode me contar um pouco mais sobre seu caso. Voce pode digitar ou enviar um audio.",
      "descricao caso"
    )
    return telaDescreverCaso()
  }
  await enviarAudioModoVoz(
    ctx?.from || u?._numero || "",
    u,
    "Entendi sua descrição. Se estiver correta, toque em Confirmar. Se quiser mudar, toque em Corrigir, digite a correção ou envie um novo áudio.",
    "confirmar descricao"
  )
  return {
    texto: `Entendi assim:

"${u._descTemp}"

Está correto?`,
    opcoes: [
      { id: "desc_ok", title: "✅ Confirmar" },
      { id: "desc_corrigir", title: "✏️ Corrigir" }
    ]
  }
}

async function flowConfirmacao(u, ctx) {
  const from = ctx?.from || u._numero || ""
  const primeiroNome = primeiroNomeCliente(u) || ""
  if (u._vindoDeRetomada && !u.modoTexto && from) {
    u._vindoDeRetomada = false
    try {
      const textoRetomada = primeiroNome
        ? `Certo, ${primeiroNome}! Você parou na etapa de confirmação dos dados. Vou confirmar seus dados para dar continuidade.`
        : `Certo! Você parou na etapa de confirmação dos dados. Vou confirmar seus dados para dar continuidade.`
      const ogg = await gerarAudioAtendente(u.atendente, textoRetomada)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 2000))
    } catch (e) { logErro("tts", "Falha áudio retomada confirmacao", e) }
  }
  setStage(u, STAGES.CONFIRMACAO)
  salvarEtapa(u._numero || from, "confirmacao")
  return await telaConfirmacaoComImagem(from, u)
}

async function flowCliente(u, ctx) {
  if (!podeMostrarMenuCliente(u) || !u.numeroCaso) {
    logDebug('[BLOCK] acesso indevido ao menu cliente sem numeroCaso | USER:', u._numero)
    salvarEtapa(u._numero, STAGES.AUDIO_AGUARDANDO)
    return respostaRecomecoMenuPrincipal(u)
  }
  setStage(u, STAGES.CLIENTE)
  return await menuClienteComAudio(ctx?.from || u._numero, u)
}

function flowConfirmarEntrada(u, ctx) {
  setStage(u, STAGES.CONFIRMAR_ENTRADA)
  if (u._entradaPendenteTipo && u._entradaPendenteValor) {
    const label = u._entradaPendenteTipo === "telefone"
      ? formatarTelefoneExibicao(u._entradaPendenteValor)
      : u._entradaPendenteValor
    const barra = u._entradaPendenteTipo === "nome"
      ? "●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n"
      : u._entradaPendenteTipo === "cidade"
        ? "●●●●●○ 📍 Etapa 5 de 6 · *CIDADE*\n\n"
        : ""
    return {
      texto: `${barra}Você informou: *${label}*\nEstá correto? Se não estiver, é só me dizer a informação correta agora. Pode falar ou digitar. 🎙️`,
      opcoes: [
        { id: "entrada_ok", title: "✅ Confirmar" }
      ]
    }
  }
  return {
    texto: "Confirme a informação ou me diga a correção agora. Pode falar ou digitar. 🎙️",
    opcoes: [
      { id: "entrada_ok", title: "✅ Confirmar" }
    ]
  }
}

function flowNovoCasoConfirma(u, ctx) {
  setStage(u, STAGES.NOVO_CASO_CONFIRMA)
  const from = ctx?.from || u?._numero || ""
  const primeiroNome = primeiroNomeCliente(u) || "você"
  if (!u.modoTexto && from && u.atendente) {
    gerarAudioAtendente(u.atendente,
      `Você quer abrir um novo atendimento. Escolha se o caso é para você ou para outra pessoa. Seu caso atual continuará registrado.`
    ).then(ogg => enviarAudio(from, urlAudioAtendente(ogg))).catch(e => logErro("tts", "Falha áudio novo caso confirma", e))
  }
  return {
    texto: `➕ *Abrir novo caso*\n\nPara quem é este novo atendimento?\n\nSeu caso atual continuará registrado. Se for para outra pessoa, pediremos os dados e o WhatsApp dela.\n\n*Seus dados atuais:*\n👤 *${primeiroNome}*\n📍 ${u.cidade || "Cidade não informada"}${u.uf ? " - " + u.uf : ""}`,
    opcoes: [
      { id: "nc_meu", title: "✅ É para mim" },
      { id: "nc_outro", title: "👤 É para outra pessoa" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
    ]
  }
}

function flowColetaTelOutro(u, ctx) {
  setStage(u, STAGES.COLETA_TEL_OUTRO)
  return { texto: "👤 *Dados da pessoa atendida*\n\nTudo bem! Qual é o nome completo da pessoa que está sendo atendida?", opcoes: null }
}

function flowColetaTelWpp(u, ctx) {
  setStage(u, STAGES.COLETA_TEL_WPP)
  const primeiroNome = primeiroNomeCliente(u) || "você"
          return { texto: `●●●●○○ 📱 Etapa 4 de 6 · *WHATSAPP*\n\nQual é o WhatsApp com DDD de *${primeiroNome}* para contato da equipe?`, opcoes: null }
}

async function flowColetaTelWppContato(u, ctx) {
  const from = ctx?.from || u._numero || ""
  setStage(u, STAGES.COLETA_TEL_WPP_CONTATO)
  const primeiroNomeAtendido = u.nome ? u.nome.split(" ")[0] : "a pessoa atendida"
  const numeroFormatado = formatarTelefoneExibicao(from)
  if (!u.modoTexto) {
    try {
      const ogg = await gerarAudioAtendente(u.atendente, `O atendimento de ${primeiroNomeAtendido} será pelo número ${numeroFormatado}? Se for esse mesmo, toque em Confirmar. Se for outro número, é só digitar ou falar o WhatsApp com DDD agora.`)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 4000))
    } catch (e) { logErro("tts", "Falha áudio coleta wpp contato", e) }
  }
  return {
    texto: `●●●●○○ 📱 Etapa 4 de 6 · *WHATSAPP*\n\nO atendimento de *${primeiroNomeAtendido}* será pelo número *${numeroFormatado}*?\n\nSe for outro número, é só digitar ou falar o WhatsApp com DDD agora. 🎙️`,
    opcoes: [
      { id: "wpp_contato_esse", title: "✅ Confirmar" }
    ]
  }
}

function flowDescErroTranscricao(u, ctx) {
  setStage(u, STAGES.DESC_ERRO_TRANSCRICAO)
  return {
    texto: "🎙️ *Não consegui ouvir esse áudio com clareza.*\n\nToque em *Corrigir* para enviar outro áudio ou escreva a situação em poucas palavras.",
    opcoes: [
      { id: "desc_corrigir", title: "✏️ Corrigir" }
    ]
  }
}

function flowAguardandoUrgente(u, ctx) {
  setStage(u, STAGES.AGUARDANDO_URGENTE)
  return { texto: `📩 *Mensagem urgente*\n\nDigite sua mensagem ou envie um áudio agora.\n\nTudo será registrado imediatamente e nossa equipe será notificada. ⚡\n\n📄 Caso: *${u.numeroCaso}*\n\n⏱️ _Prazo de retorno: até 4 horas em dias úteis._`, opcoes: null }
}

function flowUrgenteAudioErroTranscricao(u, ctx) {
  setStage(u, STAGES.URGENTE_AUDIO_ERRO_TRANSCRICAO)
  return { texto: `📩 *Mensagem urgente*\n\nDigite sua mensagem ou envie um áudio agora.\n\nTudo será registrado imediatamente e nossa equipe será notificada. ⚡\n\n📄 Caso: *${u.numeroCaso}*\n\n⏱️ _Prazo de retorno: até 4 horas em dias úteis._`, opcoes: null }
}

function flowUrgenteAudioConfirma(u, ctx) {
  setStage(u, STAGES.URGENTE_AUDIO_CONFIRMA)
  return telaConfirmarUrgente(u._urgenteAudioTexto || "")
}

function flowAudioFluxoConfirma(u, ctx) {
  salvarEtapa(u._numero, STAGES.AUDIO_AGUARDANDO)
  return respostaRecomecoMenuPrincipal(u)
}

async function flowAudioConfirmarDados(u, ctx) {
  const from = ctx?.from || u._numero || ""
  const primeiroNome = primeiroNomeCliente(u) || ""
  let introducaoAudio = ""
  if (u._vindoDeRetomada && !u.modoTexto && from) {
    u._vindoDeRetomada = false
    introducaoAudio = primeiroNome
      ? `Certo, ${primeiroNome}! Você parou na etapa de confirmação dos dados. Vou confirmar seus dados para dar continuidade.`
      : `Certo! Você parou na etapa de confirmação dos dados. Vou confirmar seus dados para dar continuidade.`
  }
  setStage(u, STAGES.AUDIO_CONFIRMAR_DADOS)
  salvarEtapa(u._numero || from, "audio_confirmar_dados")
  return telaConfirmarDadosAudio(from, u, { introducaoAudio })
}

async function flowAudioConfirmarTranscricao(u, ctx) {
  const from = ctx?.from || u._numero || ""
  setStage(u, STAGES.AUDIO_CONFIRMAR_TRANSCRICAO)
  salvarEtapa(u._numero || from, "audio_confirmar_transcricao")

  if (!u._audioCanalTranscricao) {
    setStage(u, STAGES.AUDIO_AGUARDANDO)
    return iniciarFluxoRelatoLivre(from, u, { boasVindas: false })
  }

  return telaConfirmarTranscricao(from, u, u._audioCanalTranscricao, u.area)
}

async function flowAudioConfirmarAreaCanal(u, ctx) {
  const from = ctx?.from || u._numero || ""
  setStage(u, STAGES.AUDIO_CONFIRMAR_AREA_CANAL)
  salvarEtapa(u._numero || from, "audio_confirmar_area_canal")

  if (!u.area && u._audioCanalTranscricao) {
    const classificacao = await classificarAreaAudio(u._audioCanalTranscricao)
    aplicarClassificacaoJuridica(u, classificacao)
  }

  return telaConfirmarAreaAudio(from, u, Boolean(u.modoTexto))
}

function flowMenuCorrecao(u, ctx) {
  setStage(u, STAGES.MENU_CORRECAO)
  return {
    texto: "✏️ Qual informação deseja corrigir?",
    opcoes: [
      { id: "cor_nome",     title: "👤 Nome" },
      { id: "cor_whatsapp", title: "📱 WhatsApp" },
      { id: "cor_cidade",   title: "📍 Cidade" },
      { id: "cor_uf",       title: "🗺️ Estado" },
      { id: "cor_situacao", title: "📌 Situação" },
      { id: "cor_detalhe",  title: "🔎 Detalhe" },
      { id: "cor_urgencia", title: "⚡ Urgência" },
      { id: "cor_desc",     title: "💬 Descrição" }
    ]
  }
}

function flowCorrigirValor(u, ctx) {
  setStage(u, STAGES.CORRIGIR_VALOR)
  if (u.corrigirCampo === "nome") return { texto: "👤 *Correção de nome*\n\nDigite o nome correto:", opcoes: null }
  if (u.corrigirCampo === "cidade") return { texto: "📍 *Correção de cidade*\n\nDigite a cidade correta:", opcoes: null }
  return { texto: "💬 *Correção da descrição*\n\nDigite a descrição correta:", opcoes: null }
}

function flowCorrigirUf(u, ctx) {
  setStage(u, STAGES.CORRIGIR_UF)
  return telaRegioes()
}

function flowCorrigirSel(u, ctx) {
  setStage(u, STAGES.CORRIGIR_SEL)
  if (u.corrigirCampo === "contribuicao") {
    return { texto: "Corrija a informação sobre contribuição ao INSS:", opcoes: [{ id: "cc_nunca", title: "❌ Nunca" }, { id: "cc_pouco", title: "⏰ Pouco tempo" }, { id: "cc_1ano", title: "📆 Mais de 1 ano" }, { id: "cc_muito", title: "🏆 Muitos anos" }] }
  }
  return { texto: "Você recebe algum benefício?", opcoes: [{ id: "cb_sim", title: "✅ Sim" }, { id: "cb_nao", title: "❌ Não" }] }
}

async function flowConfirmarCorrecao(u, ctx) {
  // Aplica a correção pendente diretamente e retorna para a confirmação geral.
  // Não exibe tela intermediária de sub-confirmação por campo.
  const from = ctx?.from || u?._numero || ""
  return await aplicarCorrecaoPendente(from, u)
}

function flowRetomadaFallback(u, ctx) {
  logErro("flow_inexistente", `Stage nao tratado: ${ctx.stageKey || "-"}`)
  logContextoExecucao({
    from: u?._numero,
    stage: ctx?.stageKey || u?.stage,
    flow: "flowRetomadaFallback",
    msg: ctx?.text
  })
  const ultimaPergunta = retomarUltimaPergunta(u)
  if (ultimaPergunta) return ultimaPergunta
  salvarEtapa(u._numero, STAGES.AUDIO_AGUARDANDO)
  return respostaRecomecoMenuPrincipal(u)
}

// ================================================================
//  DETECTOR DE SOFRIMENTO EMOCIONAL NO RELATO
// ================================================================

async function flowAssessoriaInicial(u, ctx = {}) {
  const from = ctx.from || u._numero || ""
  const origemRelato = ctx.origem || "audio"
  const introducaoAudio = sanitizarTextoEntrada(ctx.introducaoAudio)
  const primeiroNome = primeiroNomeCliente(u) || "você"
  const areaLabel = u.area || "sua situação"
  const relato = u._audioCanalTranscricao || ""

  // Score emocional — usado para calibrar o tom da resposta
  const emocional = scoreEmocional(u)
  const nivelEmocional = emocional.nivel // "alto", "medio", "baixo"
  const instrucaoTom = nivelEmocional === "alto"
    ? "O usuário parece estar em sofrimento real (desespero, urgência, vulnerabilidade). Seja especialmente acolhedor, demonstre que entendeu o peso da situação. Use palavras que transmitam cuidado genuíno."
    : nivelEmocional === "medio"
    ? "O usuário está preocupado com a situação. Seja atencioso e mostre que a situação foi compreendida."
    : "Seja direto e profissional, mas ainda humano e acessível."

  // Groq — comentário empático calibrado pelo score emocional
  let comentarioGroq = null
  try {
    const prompt = `Você é assistente jurídica da Oráculum Advocacia no WhatsApp.
Área identificada: ${areaLabel}.
Relato do usuário: ${relato}
Urgência detectada: ${u.urgencia || "normal"}.

Instrução de tom: ${instrucaoTom}

Responda com EXATAMENTE 1 frase empática, mostrando que entendeu a situação do usuário.
Máximo de 25 palavras. Texto puro, sem emoji, sem formatação, sem asterisco.
Fale como pessoa, nunca como robô. Linguagem simples e acessível.
NÃO escreva nada além dessa frase.`

    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 120,
        temperature: 0.7
      },
      { headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" } }
    )
    const limparLinhaComentario = linha => linha
      .replace(/^\s*(linha\s*)?\d+\s*[:.)-]\s*/i, "")
      .replace(/^\s*linha\s*\d+\s*[:.)-]\s*/i, "")
      .trim()
    const linhas = res.data.choices[0].message.content.trim().split("\n").map(limparLinhaComentario).filter(Boolean)
    comentarioGroq = `✅ *${linhas[0] || ""}*`
  } catch (e) {
    logErro("groq", "flowAssessoriaInicial tentativa 1: " + e.message)
    // Retenta com prompt simplificado
    try {
      const res2 = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model: "llama-3.1-8b-instant",
          messages: [{ role: "user", content: `Você é assistente jurídica da Oráculum Advocacia. O usuário tem um caso de ${areaLabel} com urgência ${u.urgencia || "normal"}. ${instrucaoTom} Responda com exatamente 1 frase empática de até 25 palavras, texto puro, sem emoji, sem prometer resultado.` }],
          max_tokens: 120,
          temperature: 0.7
        },
        { headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" } }
      )
      const linhas2 = res2.data.choices[0].message.content.trim().split("\n").map(l => l.trim()).filter(Boolean)
      comentarioGroq = `✅ *${linhas2[0] || ""}*`
    } catch (e2) {
      logErro("groq", "flowAssessoriaInicial tentativa 2: " + e2.message)
      // Fallback final — contextualizado por área e urgência, nunca genérico
      comentarioGroq = `✅ *${gerarFallbackEmpatico(areaLabel, u.urgencia)}*`
    }
  }

  // Parágrafo extra de acolhimento para score emocional alto
  let blocoAcolhimento = ""
  if (nivelEmocional === "alto") {
    blocoAcolhimento = `\n\n💙 _Entendemos que você pode estar passando por um momento difícil. Nossa equipe vai tratar o seu caso com prioridade e cuidado._`
  }

  // Áudio do comentário — limpa formatação visual antes de enviar ao TTS
  if (!u.modoTexto) {
    const sufixoAudio = ` Foi isso que entendi. Se estiver correto, toque em Está correto. Se quiser acrescentar ou corrigir algo, é só falar ou digitar agora mesmo.`
    const comentarioAudio = [
      introducaoAudio,
      removerFormatacaoParaAudio(comentarioGroq + (nivelEmocional === "alto" ? " Entendemos que você pode estar passando por um momento difícil. Nossa equipe vai tratar o seu caso com prioridade e cuidado." : "")),
      sufixoAudio.trim()
    ].filter(Boolean).join(" ")
    let audioEnviado = false
    try {
      const ogg = await gerarAudioAtendente(u.atendente, comentarioAudio)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 5000))
      audioEnviado = true
    } catch (e) { logErro("tts", "Falha áudio assessoria tentativa 1", e) }
    if (!audioEnviado) {
      try {
        const ogg2 = await gerarAudioAtendente(u.atendente, [introducaoAudio, sufixoAudio.trim()].filter(Boolean).join(" "))
        await enviarAudio(from, urlAudioAtendente(ogg2))
        await new Promise(r => setTimeout(r, 3000))
      } catch (e2) { logErro("tts", "Falha áudio assessoria tentativa 2", e2) }
    }
  }

  setStage(u, STAGES.ASSESSORIA_INICIAL)
  salvarEtapa(u._numero || from, "assessoria_inicial")

  const textoAssessoria = `${comentarioGroq}${blocoAcolhimento}\n\nFoi isso que entendi. Está correto?\n\n_Se estiver, toque em Está correto. Se quiser acrescentar ou corrigir algo, é só digitar ou enviar um áudio agora._`
  const opcoesAssessoria = [
    { id: "continuar_audio", title: "✅ Está correto" }
  ]
  if (IMAGEM_POS_RELATO_URL) {
    const enviada = await enviarImagemWhatsApp(from, IMAGEM_POS_RELATO_URL, textoAssessoria, opcoesAssessoria)
    if (enviada) return { texto: null, opcoes: null }
  }
  return { texto: textoAssessoria, opcoes: opcoesAssessoria }
}

// ================================================================
//  FLOW MAP (objeto de roteamento)
// ================================================================

const flowMap = Object.freeze({
  [STAGES.INICIO]: flowInicio,
  [STAGES.INICIO_RETORNO]: flowInicioRetorno,
  [STAGES.RETOMADA_AUTOMATICA]: flowRetomadaAutomatica,
  [STAGES.RETOMADA_MENU]: flowRetomadaMenu,
  [STAGES.RESUMO_ATENDIMENTO]: flowResumoAtendimento,
  [STAGES.RESUMO_RETOMADA]: flowResumoRetomada,
  [STAGES.NOME]: flowNome,
  [STAGES.CIDADE]: flowCidade,
  [STAGES.CONFIRMAR_ENTRADA]: flowConfirmarEntrada,
  [STAGES.NOVO_CASO_CONFIRMA]: flowNovoCasoConfirma,
  [STAGES.COLETA_TEL_OUTRO]: flowColetaTelOutro,
  [STAGES.COLETA_TEL_WPP]: flowColetaTelWpp,
  [STAGES.COLETA_TEL_WPP_CONTATO]: flowColetaTelWppContato,
  [STAGES.COLETA_DESC]: flowDescricao,
  [STAGES.COLETA_DESC_AUDIO]: flowDescricao,
  [STAGES.DESCRICAO_CASO]: flowDescricao,
  [STAGES.TRAB_OUT_DESC]: flowDescricao,
  [STAGES.OUT_DESC]: flowDescricao,
  [STAGES.DOCUMENTOS]: flowDocumentos,
  [STAGES.DESC_ERRO_TRANSCRICAO]: flowDescErroTranscricao,
  [STAGES.DESC_CONFIRMA]: flowDescConfirma,
  [STAGES.AGUARDANDO_URGENTE]: flowAguardandoUrgente,
  [STAGES.URGENTE_AUDIO_ERRO_TRANSCRICAO]: flowUrgenteAudioErroTranscricao,
  [STAGES.URGENTE_AUDIO_CONFIRMA]: flowUrgenteAudioConfirma,
  [STAGES.AUDIO_FLUXO_CONFIRMA]: flowAudioFluxoConfirma,
  [STAGES.AUDIO_CONFIRMAR_DADOS]: flowAudioConfirmarDados,
  [STAGES.MENU_CORRECAO]: flowMenuCorrecao,
  [STAGES.CORRIGIR_VALOR]: flowCorrigirValor,
  [STAGES.CORRIGIR_UF]: flowCorrigirUf,
  [STAGES.CORRIGIR_SEL]: flowCorrigirSel,
  [STAGES.CONFIRMAR_CORRECAO]: flowConfirmarCorrecao,
  [STAGES.CONFIRMACAO]: flowConfirmacao,
  [STAGES.CLIENTE]: flowCliente,
  [STAGES.ACOLHIMENTO]: flowNome,
  [STAGES.ACOLHIMENTO_MODO]: flowNome,
  [STAGES.ACOLHIMENTO_PARA_QUEM]: flowNome,
  [STAGES.ACOLHIMENTO_NOME_CONTATO]: flowNome,
  [STAGES.ACOLHIMENTO_CONFIRMA_NOME_CONTATO]: flowNome,
  [STAGES.ACOLHIMENTO_NOME]: flowNome,
  [STAGES.ACOLHIMENTO_CONFIRMA_NOME]: flowNome,
  [STAGES.ACOLHIMENTO_CONFIRMA_TITULAR_NOME]: flowNome,
  [STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP]: flowAcolhimentoConfirmaWhatsapp,
  [STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP_OUTRO]: flowAcolhimentoConfirmaWhatsapp,
  [STAGES.ACOLHIMENTO_CIDADE]: flowAcolhimentoCidade,
  [STAGES.AUDIO_AGUARDANDO]: flowNome,
  [STAGES.AUDIO_PROCESSANDO]: flowNome,
  [STAGES.AUDIO_CONFIRMAR_TRANSCRICAO]: flowAudioConfirmarTranscricao,
  [STAGES.AUDIO_CONFIRMAR_AREA_CANAL]: flowAudioConfirmarAreaCanal,
  [STAGES.ASSESSORIA_INICIAL]: flowAssessoriaInicial
})

// ================================================================
//  DISPATCHER (retomarFluxo)
// ================================================================

function obterNomeFlow(flow) {
  return typeof flow === "function" && flow.name ? flow.name : "flow_desconhecido"
}

function executarFlowSeguro(flow, u, ctx = {}) {
  const flowName = obterNomeFlow(flow)
  logDebug(`[FLOW] ${flowName} | USER: ${ctx?.from || u?._numero || "-"} | STAGE: ${ctx?.stageKey || u?.stage || "-"}`)
  logContextoExecucao({
    from: ctx?.from || u?._numero,
    stage: ctx?.stageKey || u?.stage,
    flow: flowName,
    msg: ctx?.text
  })

  try {
    return flow(u, ctx)
  } catch (err) {
    logErro("flow", `Falha ao executar ${flowName}`, err)
    return criarRespostaFallbackProcessamento()
  }
}

function retomarFluxo(u, ctx = criarCtx()) {
  const etapaBruta = ctx?.stageForcada || obterEtapaSegura(u._numero) || u.lastPergunta || u.stage || STAGES.AUDIO_AGUARDANDO
  const etapa = normalizarStageKey(etapaBruta) || STAGES.AUDIO_AGUARDANDO

  logDebug("🔁 Retomando etapa:", etapa)

  if (!u.numeroCaso && ehStageFluxoAntigo(etapa)) {
    logDebug(`[RETOMADA_LEGADO] ${etapa} -> ${STAGES.AUDIO_AGUARDANDO} | USER: ${u?._numero || "-"}`)
    salvarEtapa(u._numero, STAGES.AUDIO_AGUARDANDO)
    u.lastPergunta = null
    u.lastPerguntaPayload = null
    u._stageRetomadaOriginal = null
    return respostaRecomecoMenuPrincipal(u)
  }

  const etapaAtual = normalizarStageKey(u.etapa)
  if (!etapaValida(etapaAtual) && !u.lastPerguntaPayload) {
    logDebug("⚠️ Etapa inválida/inicio → redirecionando para relato livre")
    salvarEtapa(u._numero, STAGES.AUDIO_AGUARDANDO)
    return respostaRecomecoMenuPrincipal(u)
  }

  const STAGES_SEM_FLOWMAP = new Set([
    STAGES.AGENDAMENTO_HORARIO, STAGES.AGENDAMENTO_DURACAO, STAGES.AGENDAMENTO_CONFIRMAR,
    STAGES.CORRIGIR_DADOS, STAGES.CONFIRMAR_CORRECAO_NOME, STAGES.CONFIRMAR_CORRECAO_CIDADE,
    STAGES.REVALIDA_WHATSAPP, STAGES.EDITAR_NOME, STAGES.EDITAR_CIDADE, STAGES.EDITAR_SITUACAO,
    STAGES.EDITAR_DETALHE, STAGES.EDITAR_URGENCIA, STAGES.EDITAR_DESCRICAO,
    STAGES.REVALIDA_NOME, STAGES.REVALIDA_CIDADE, STAGES.COLETA_TEL_WPP_CONFIRMA
  ])
  if (STAGES_SEM_FLOWMAP.has(etapa)) {
    return processarInterno(u._numero, u.nomeWA || "", "", { type: "text", text: { body: "" } }, u)
  }

  const flowCtx = { ...ctx, stageKey: etapa }
  const flow = flowMap[etapa]

  if (flow) return executarFlowSeguro(flow, u, flowCtx)
  logErro("flow_inexistente", `Nenhum flow encontrado para stage ${etapa || "-"} | USER: ${u?._numero || "-"} — redirecionando para INICIO`)
  return flowRetomadaFallback(u, flowCtx)
}

// ================================================================
//  PROCESSADOR (processar)
// ================================================================

async function processarRetomadaOuReinicio(from, u, text, buttonId = "", ctx = null) {
  const msg = String(text || "").toLowerCase().trim()
  const botao = String(buttonId || "").trim()
  const stageAtual = normalizarStageKey(u?.stage)
  const opcoesAtuais = new Set((u.lastPerguntaPayload?.opcoes || []).map(o => o.id))
  const contextoDescricao = opcoesAtuais.has("desc_incentivo_continuar") || opcoesAtuais.has("desc_incentivo_menu") || opcoesAtuais.has("desc_incentivo_encerrar")
  const contextoRetomada = opcoesAtuais.has("ret_auto_continuar") || opcoesAtuais.has("ret_auto_menu") || opcoesAtuais.has("cont_retomar") || opcoesAtuais.has("recomecar")
  const contextoRetomadaMenu =
    stageAtual === STAGES.RETOMADA_MENU ||
    opcoesAtuais.has("rm_continuar") ||
    opcoesAtuais.has("rm_recomecar")
  const contextoResumoRetomada =
    stageAtual === STAGES.RESUMO_RETOMADA ||
    opcoesAtuais.has("rr_continuar") ||
    opcoesAtuais.has("rr_corrigir") ||
    opcoesAtuais.has("rr_recomecar") ||
    opcoesAtuais.has("rr_encerrar")
  const contextoResumoAtendimento =
    stageAtual === STAGES.RESUMO_ATENDIMENTO ||
    opcoesAtuais.has("ra_continuar") ||
    opcoesAtuais.has("ra_corrigir") ||
    opcoesAtuais.has("ra_recomecar") ||
    opcoesAtuais.has("ra_encerrar")

  if (botao === "desc_incentivo_continuar" || (contextoDescricao && msg.includes("continuar"))) {
    const stageDescricao = ehStageDescricaoCaso(u.stage) ? u.stage : STAGES.COLETA_DESC_AUDIO
    entrarEtapaDescricao(u, stageDescricao)
    iniciarTimer(from)
    return telaDescreverCaso()
  }

  if (text === "desc_incentivo_depois") {
    return await pularDescricaoPorAgora(from, u)
  }

  if (
    botao === "desc_incentivo_menu" ||
    botao === "ret_auto_menu" ||
    ((contextoDescricao || contextoRetomada) && msg.includes("menu"))
  ) {
    u.jaIncentivouDescricao = true
    if (u._retomadaEhLeadFrio) {
      u._retomadaEhLeadFrio = false
      u.negocioStageId = HS_STAGE.LEAD
      salvarEtapa(u._numero, STAGES.AUDIO_AGUARDANDO)
      iniciarTimer(from)
      return respostaRecomecoMenuPrincipal(u)
    }
    if (!podeMostrarMenuCliente(u)) {
      salvarEtapa(u._numero, STAGES.AUDIO_AGUARDANDO)
      iniciarTimer(from)
      return await responderTelaComAudio(
        from,
        u,
        respostaRecomecoMenuPrincipal(u),
        "Tudo bem. Vamos recomeçar com calma. Pode me contar sua situação novamente por áudio ou texto. Estou aqui para ajudar você.",
        "recomeco menu principal"
      )
    }
    setStage(u, STAGES.CLIENTE)
    iniciarTimer(from)
    return await menuClienteComAudio(from, u)
  }

  if (
    botao === "desc_incentivo_encerrar" ||
    botao === "m_encerrar" ||
    ((contextoDescricao || contextoRetomada) && msg.includes("encerrar"))
  ) {
    return executarEncerramentoFluxo(from, u)
  }

  if (
    botao === "ret_auto_continuar" ||
    (contextoRetomada && msg.includes("continuar"))
  ) {
    u._stageRetomadaOriginal = obterStageRetomadaOriginal(u)
    const resposta = await flowRetomadaMenu(u, ctx || criarCtx({ from, nomeWA: u.nomeWA, text, buttonId }))
    iniciarTimer(from)
    return resposta
  }

  // cont_retomar é pausa temporária — restaurar tela exata, sem fluxo intermediário
  if (botao === "cont_retomar") {
    limparTimer(u)
    u.aguardandoResposta = false
    u.aguardandoRetomada = false
    iniciarTimer(from)
    const telaAnterior = retomarUltimaPergunta(u)
    if (telaAnterior) {
      // restaurar o stage exato do momento da pausa para que o próximo
      // input do usuário seja processado no flow correto (ex: AUDIO_AGUARDANDO
      // e não NOVO_CASO_CONFIRMA, que causava volta à tela "É para mim / outra pessoa")
      if (u._stageRetomadaOriginal) {
        setStage(u, u._stageRetomadaOriginal)
        u._stageRetomadaOriginal = null
      }
      if (!u.modoTexto && from) {
        try {
          const nomeRetomada = getPrimeiroNomeRetomada(u)
          const stageAtual = u?._stageRetomadaOriginal || u?.stage || ""
          const labelEtapaCont = {
            acolhimento_nome: "informar seu nome",
            acolhimento_confirma_nome: "confirmar seu nome",
            acolhimento_confirma_whatsapp: "confirmar seu WhatsApp",
            acolhimento_cidade: "informar sua cidade",
            assessoria_inicial: "confirmar o entendimento do seu relato",
            coleta_desc: "descrever seu caso",
            gatilho: "avaliação de urgência",
            confirmacao: "confirmação final dos dados"
          }
          const etapaLegivelCont = labelEtapaCont[stageAtual] || "onde você havia parado"
          const textoAudio = nomeRetomada
            ? `Certo, ${nomeRetomada}! Vamos continuar. Você estava na etapa de ${etapaLegivelCont}.`
            : `Certo! Vamos continuar. Você estava na etapa de ${etapaLegivelCont}.`
          const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 2000))
        } catch (e) { logErro("tts", "Falha áudio cont_retomar", e) }
      }
      return telaAnterior
    }
    // Fallback: se não há snapshot, usar retomarFluxo normalmente
    u._stageRetomadaOriginal = obterStageRetomadaOriginal(u)
    return await flowRetomadaMenu(u, ctx || criarCtx({ from, nomeWA: u.nomeWA, text, buttonId }))
  }

  if (
    botao === "rm_continuar" ||
    (contextoRetomadaMenu && (msg === "1" || msg.includes("continuar")))
  ) {
    setStage(u, STAGES.RESUMO_RETOMADA)
    iniciarTimer(from)
    return await flowResumoRetomada(u, { from })
  }

  if (
    botao === "rm_recomecar" ||
    text === "recomecar" ||
    (contextoRetomadaMenu && (msg === "2" || msg.includes("recome")))
  ) {
    u._retomadaEhLeadFrio = false
    if (u.numeroCaso) {
      return responderComTimer(from, await menuClienteComAudio(from, u))
    }
    // recomeçar faz revalidação progressiva dos dados preservados
    u._revalidandoCampos = true
    u.aguardandoResposta = false
    u.aguardandoRetomada = false
    setStage(u, STAGES.AUDIO_AGUARDANDO)
    iniciarTimer(from)
    const primeiroNomeRec = primeiroNomeCliente(u) || ""
    const saudacaoRec = primeiroNomeRec ? `, ${primeiroNomeRec}` : ""
    const textoRec = `Tudo bem${saudacaoRec}. Vamos recomeçar com calma. Pode me contar sua situação novamente${u.modoTexto ? " por texto" : " por áudio ou texto"}. Estou aqui para ajudar você.`
    if (!u.modoTexto) {
      try {
        const ogg = await gerarAudioAtendente(u.atendente, textoRec)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3000))
      } catch (e) { logErro("tts", "Falha audio recomeçar pausa", e) }
    }
    return {
      texto: `🔄 Tudo bem${saudacaoRec} 😊\n\nVamos *recomeçar* com calma.\n\nPode me contar sua situação novamente${u.modoTexto ? " por texto" : " por áudio ou texto"}. Estou aqui para ajudar você.`,
      opcoes: null
    }
  }

  if (
    botao === "ra_continuar" ||
    (contextoResumoAtendimento && msg.includes("continuar"))
  ) {
    u._retomadaEhLeadFrio = false
    const stageRetomada = obterStageRetomadaOriginal(u)
    u._stageRetomadaOriginal = null
    const resposta = retomarFluxo(u, { ...(ctx || criarCtx({ from, nomeWA: u.nomeWA, text, buttonId })), stageForcada: stageRetomada })
    iniciarTimer(from)
    return resposta
  }

  if (
    botao === "ra_corrigir" ||
    (contextoResumoAtendimento && msg.includes("corrigir"))
  ) {
    u._retomadaEhLeadFrio = false
    iniciarTimer(from)
    setStage(u, STAGES.MENU_CORRECAO)
    return flowMenuCorrecao(u)
  }

  if (
    botao === "ra_recomecar" ||
    (contextoResumoAtendimento && msg.includes("recome"))
  ) {
    reiniciarFluxoRetomada(u)
    iniciarTimer(from)
    return respostaRecomecoMenuPrincipal(u)
  }

  if (
    botao === "ra_encerrar" ||
    (contextoResumoAtendimento && msg.includes("encerrar"))
  ) {
    return executarEncerramentoFluxo(from, u)
  }

  if (
    botao === "rr_continuar" ||
    (contextoResumoRetomada && msg.includes("continuar"))
  ) {
    u._retomadaEhLeadFrio = false
    const stageRetomada = obterStageRetomadaOriginal(u)
    u._stageRetomadaOriginal = null
    u._vindoDeRetomada = true
    const resposta = retomarFluxo(u, { ...(ctx || criarCtx({ from, nomeWA: u.nomeWA, text, buttonId })), stageForcada: stageRetomada })
    iniciarTimer(from)
    return resposta
  }

  if (
    botao === "rr_corrigir" ||
    (contextoResumoRetomada && msg.includes("corrigir"))
  ) {
    u._retomadaEhLeadFrio = false
    u._correcaoOrigem = "resumo_retomada"
    iniciarTimer(from)
    setStage(u, STAGES.MENU_CORRECAO)
    return flowMenuCorrecaoRetomada(u)
  }

  if (
    botao === "rr_recomecar" ||
    (contextoResumoRetomada && msg.includes("recome"))
  ) {
    u._retomadaEhLeadFrio = false
    if (u.numeroCaso) {
      return responderComTimer(from, await menuClienteComAudio(from, u))
    }
    limparDadosAtendimento(u)
    return await executarRecomecoFluxo(from, u)
  }

  if (
    botao === "rr_encerrar" ||
    (contextoResumoRetomada && msg.includes("encerrar"))
  ) {
    return executarEncerramentoFluxo(from, u)
  }

  if (contextoRetomadaMenu && (text || buttonId)) {
    iniciarTimer(from)
    return respostaOpcaoInvalidaRetomada()
  }

  if (text === "audio_fluxo_encerrar") {
    return executarEncerramentoFluxo(from, u)
  }

  return null
}

async function verificarRetomadaAutomatica(from, u) {
  if (!u) return null
  logDebug("[RETOMADA]", {
    podeRetomar: podeRetomar(from),
    jaOfereceuRetomada: u.jaOfereceuRetomada,
    negocioId: u.negocioId,
    numeroCaso: u.numeroCaso,
    stage: u.stage,
    aguardandoResposta: u.aguardandoResposta
  })
  if (!podeRetomar(from)) return null
  if (u.jaOfereceuRetomada) return null
  // Cliente ativo com caso confirmado — não precisa de retomada
  if (u.numeroCaso) return null

  // Se tem negocioId em memória mas não tem numeroCaso,
  // pode ser retomada — deixa continuar a verificação
  // mas reseta o negocioId para buscar dados frescos do HubSpot
  if (u.negocioId && !u.numeroCaso) {
    u.negocioId = null
    u.jaOfereceuRetomada = false
  }
  if (u.stage !== STAGES.INICIO) return null

  logDebug("🔁 Verificando retomada no HubSpot")
  const contato = await hsBuscarPorPhone(getTelefoneContato(from, u))
  if (!contato?.id) return null

  logDebug("Contato encontrado:", contato.id)
  const negocio = await hsBuscarNegocioAbertoInfoDoContato(contato.id)
  if (!negocio?.id) return null

  logDebug("Negócio aberto encontrado:", negocio.id)
  u.contatoId = contato.id
  u.negocioId = negocio.id
  const nomeHS = contato.properties?.firstname
  u.nomeHubspot = (nomeHS && nomeHS !== "cliente" && nomeHS !== "você" ? nomeHS : null) || u.nomeHubspot || null
  u.nome = (u.nome && u.nome !== "cliente" ? u.nome : null) || u.nomeHubspot || u.nomeWA || null
  u.area = u.area || contato.properties?.area_juridica || "Atendimento em andamento"
  u.negocioStageId = negocio.stageId || u.negocioStageId || null
  restaurarEstadoNegocioHubSpot(u, negocio)
  if (u.numeroCaso) {
    logDebug("🔁 Cliente com número de caso restaurado pelo HubSpot; enviando menu cliente")
    setStage(u, STAGES.CLIENTE)
    u._fluxoEncerrado = false
    u.aguardandoRetomada = false
    u.jaOfereceuRetomada = false
    return await menuClienteComAudio(from, u)
  }
  if (!usuarioTemRelatoParaRetomada(u)) {
    logDebug("🔁 Retomada ignorada: usuario ainda nao enviou relato")
    u.aguardandoRetomada = false
    u.jaOfereceuRetomada = false
    u._retomadaEhLeadFrio = false
    u._stageRetomadaOriginal = null
    u.etapa = null
    u.lastPergunta = null
    u.lastPerguntaPayload = null
    u.aguardandoResposta = false
    setStage(u, STAGES.ACOLHIMENTO)
    return null
  }
  setStage(u, STAGES.RETOMADA_AUTOMATICA)
  u.jaOfereceuRetomada = true
  u._retomadaEhLeadFrio = u.negocioStageId === HS_STAGE.LEAD
  u._stageRetomadaOriginal = obterStageRetomadaOriginal(u)

  // No modo voz, envia o áudio antes da tela de reengajamento.
  if (!u.modoTexto && u.atendente) {
    const primeiroNomeRetomada = getPrimeiroNomeRetomada(u) || "você"
    try {
      const ogg = await gerarAudioAtendente(u.atendente,
        `Olá, ${primeiroNomeRetomada}! Que bom te ver de volta. Seu último atendimento foi com a atendente ${u.atendente}. Você iniciou um atendimento, mas não chegou a concluir. Estou aqui para te ajudar a continuar de onde parou.`)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 4000))
    } catch (e) { logErro("tts", "Falha áudio retomada automática", e) }
  }

  return await flowRetomadaMenu(u)
}

async function tentarRestaurarClienteHubSpotParaMenu(from, u) {
  if (!u || u.numeroCaso) return false
  const contato = await hsBuscarPorPhone(getTelefoneContato(from, u))
  if (!contato?.id) return false
  const negocio = await hsBuscarNegocioAbertoInfoDoContato(contato.id)
  if (!negocio?.id) return false
  u.contatoId = contato.id
  u.negocioId = negocio.id
  restaurarEstadoNegocioHubSpot(u, negocio)
  if (!u.numeroCaso) return false
  setStage(u, STAGES.CLIENTE)
  u._fluxoEncerrado = false
  u.aguardandoRetomada = false
  u.jaOfereceuRetomada = false
  u.lastPergunta = null
  u.lastPerguntaPayload = null
  return true
}

async function processarAnaliseDocumentalSegura({ u, arquivo, buffer, mimeType, nomeOriginal, contexto = {} }) {
  try {
    const resultado = await processarAnaliseDocumentalPosUpload({
      pastaDriveId: u?.pastaDriveId,
      arquivo,
      buffer,
      mimeType,
      nomeOriginal,
      contexto: {
        numeroCaso: u?.numeroCaso || null,
        area: u?.area || null,
        tipo: u?.tipo || null,
        subTipo: u?.subTipo || null,
        ...contexto
      },
      resolvePartyRole: ({ pipeline, registry, contexto: analysisContext }) => resolveDocumentPartyIdentity({
        extraction: pipeline?.extracao || {},
        trustedUser: u || {},
        registry,
        documentType: pipeline?.classificacao?.tipoDocumento,
        classificationConfidence: pipeline?.classificacao?.confianca,
        requirementId: analysisContext?.documentoId || null,
        allowExactNameMatch: analysisContext?.fluxoDocumento === "guiado" && isPilotCaseAllowed(u?.numeroCaso)
      })
    })
    if (resultado?.reason && !resultado.skipped) {
      logErro("document_analysis", resultado.reason)
    }
    return resultado
  } catch (e) {
    logErro("document_analysis", `falha nao bloqueante: ${e.message}`, e)
    return { ok: false, skipped: false, reason: e.message }
  }
}

function dependenciasReavaliacaoDocumentalPosHumana(usuario, cycle) {
  return {
    resolverListaDocumental: () => getDocumentosListaCaso(usuario),
    listarArquivosDrive: async () => usuario.pastaDriveId ? listarArquivosDriveNaPasta(usuario.pastaDriveId) : [],
    requiredSources: usuario.pastaDriveId ? ["drive"] : [],
    camposComplementaresPendentes: () => carregarPendenciasComplementaresPosHumanas({
      usuario, cycle, repository: postHumanCycleRepository
    }),
    getLatestCustomerMessage: () => users[normalizarNumeroWhatsAppEnvio(usuario._numero || usuario.whatsappContato)]?.ultimaMsg ?? usuario.ultimaMsg,
    sendFree: (to, message) => enviar(to, message),
    presentClientMenu: to => apresentarMenuClientePosHumano(to, usuario),
    sendTemplate: (to, name, params, language, options) => enviarTemplateWhatsApp(to, name, params, language, options),
    templateConfig: META_TEMPLATES.casoAtualizacao,
    buildTemplateParams: solicitation => [solicitation.texto],
    isComplete: criarVerificadorCompletudePosHumana(usuario, postHumanCycleRepository)
  }
}

async function sincronizarDecisaoDocumentalCanonicaHubSpotSeguro(u, canonical) {
  if (!u?.contatoId || !u?.negocioId || !u?.numeroCaso || !u?.pastaDriveId ||
      !canonical?.decision || !canonical?.registry) {
    return { ok: false, skipped: true, reason: "canonical_hubspot_context_missing" }
  }
  try {
    const contactProperties = ["firstname", "lastname", "cpf_do_cliente", "date_of_birth"]
    const [contactResponse, dealResponse, associationResponse] = await Promise.all([
      axios.get(
        `https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(u.contatoId)}?properties=${encodeURIComponent(contactProperties.join(","))}`,
        { headers: HS() }
      ),
      axios.get(
        `https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(u.negocioId)}?properties=numero_de_caso`,
        { headers: HS() }
      ),
      axios.get(
        `https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(u.negocioId)}/associations/contacts`,
        { headers: HS() }
      )
    ])
    const associatedIds = (associationResponse.data?.results || []).map(item => String(item.id))
    const validContext = validarContextoDocumentalHubSpot({
      usuario: u,
      contato: { id: contactResponse.data?.id, properties: contactResponse.data?.properties || {} },
      negocio: { id: dealResponse.data?.id, properties: dealResponse.data?.properties || {} },
      associatedContactIds: associatedIds
    })
    if (!validContext.ok) return { ok: false, skipped: true, reason: validContext.reason }

    const sync = await sincronizarDocumentosHubSpot({
      registry: canonical.registry,
      decision: canonical.decision,
      usuario: u,
      contato: { id: String(u.contatoId), properties: contactResponse.data?.properties || {} },
      negocio: { id: String(u.negocioId), properties: dealResponse.data?.properties || {} }
    }, { hsAtualizarContato })
    if (sync.registry) {
      const persisted = await atualizarEstadoDocumental(u.pastaDriveId, { registry: sync.registry })
      if (!persisted?.arquivo) {
        return { ...sync, ok: false, retryable: true, reason: "canonical_sync_provenance_persistence_failed", trustedUserPatch: {} }
      }
    }
    if (sync.ok) aplicarDadosDocumentaisConfiaveisAoUsuario(u, sync.trustedUserPatch)
    return sync
  } catch (error) {
    logErro("document_hubspot_sync", `falha nao bloqueante: ${error.code || error.name || "erro"}`)
    return { ok: false, skipped: false, retryable: true, reason: "canonical_hubspot_sync_failed" }
  }
}

async function confirmarDocumentoCanonicoSeguro(u, fileId, options = {}) {
  if (!u?.pastaDriveId || !fileId) return { ok: false, skipped: true, reason: "case_or_file_missing" }
  try {
    const canonical = await confirmCanonicalDocument({
      pastaDriveId: u.pastaDriveId,
      fileId,
      origem: options.origem || "client_callback",
      assertion: options.assertion || null
    })
    if (!canonical.ok) return canonical
    const projection = projectDocumentDecision(u, canonical.decision, marcarStatusDocumento)
    const promotable = ["partial", "delivered"].includes(canonical.decision?.status)
    if (!promotable) return { ...canonical, projection, reevaluation: { processed: false, reason: "decision_not_promoted" } }
    const hubspotSync = ["partial", "delivered"].includes(canonical.decision?.status)
      ? await sincronizarDecisaoDocumentalCanonicaHubSpotSeguro(u, canonical)
      : { ok: true, skipped: true, reason: "decision_not_promotable" }
    await api.persistirUsersAgora({ propagarErro: true })
    const reevaluation = await reevaluatePostHumanForDecision({
      usuario: u,
      decision: canonical.decision,
      repository: postHumanCycleRepository
    }, {
      processCycle: (cycle, currentUser) => processPostHumanCycle({
        cycle,
        usuario: currentUser,
        repository: postHumanCycleRepository,
        deps: dependenciasReavaliacaoDocumentalPosHumana(currentUser, cycle)
      })
    })
    return { ...canonical, projection, hubspotSync, reevaluation }
  } catch (error) {
    logErro("document_canonical", `falha nao bloqueante: ${error.code || error.name || "erro"}`)
    return { ok: false, skipped: false, reason: error.code || "DOCUMENT_CANONICAL_ERROR" }
  }
}

async function consolidarDocumentosDoCasoSeguro({ u, contexto = {} }) {
  try {
    return await consolidarDocumentosDoCaso({
      pastaDriveId: u?.pastaDriveId,
      numeroCaso: u?.numeroCaso,
      documentosEsperados: getDocumentosListaCaso(u),
      contexto
    })
  } catch (e) {
    logErro("document_consolidation", `falha nao bloqueante: ${e.code || e.name || "erro"}`)
    return { ok: false, skipped: false, reason: "falha tecnica de consolidacao", erros: [{ code: e.code || "DOCUMENT_CONSOLIDATION_ERROR" }] }
  }
}

async function registrarDocumentoNoCicloPosHumano(u, metadata = {}) {
  const handoff = u?._postHumanDocumentHandoff
  if (!handoff || !postHumanCycleRepository ||
      String(handoff.contatoId || "") !== String(u.contatoId || "") ||
      String(handoff.negocioId || "") !== String(u.negocioId || "") ||
      String(handoff.numeroCaso || "").toUpperCase() !== String(u.numeroCaso || "").toUpperCase()) return false
  try {
    await postHumanCycleRepository.updateStatus(handoff.cycleId, "awaiting_response", {
      documentoRecebidoEm: new Date().toISOString(),
      documentoMetadados: {
        mediaType: sanitizarTextoEntrada(metadata.mediaType || "document").slice(0, 30),
        fluxo: sanitizarTextoEntrada(metadata.fluxo || "legacy_document_pipeline_v1").slice(0, 80)
      }
    })
    handoff.persisted = true
    return true
  } catch {
    return false
  }
}

async function processarMidia(from, nomeWA, u, msgObj, tipo, ehAudio, ehDoc) {
  if (!(ehAudio || ehDoc)) return null
  if (![STAGES.CLIENTE, STAGES.AGUARDANDO_URGENTE, STAGES.COLETA_DESC_AUDIO, "trab_out_desc", "out_desc"].includes(u.stage)) return null

  const mediaId  = msgObj?.[tipo]?.id
  const nomeArq  = msgObj?.document?.filename || (tipo === "image" ? `imagem_${Date.now()}.jpg` : `audio_${Date.now()}`)
  const mimeType = msgObj?.[tipo]?.mime_type || "application/octet-stream"

  if (!mediaId) {
    return responderTelaDocumento(from, u, criarTela({
      id: "documento_midia_invalida",
      titulo: "Arquivo não identificado",
      texto: "Nao consegui identificar o arquivo. Tente enviar novamente como foto ou PDF.",
      textoAudioBase: "Não consegui identificar o arquivo",
      acoes: [
        { id: "m_docs", label: "Tentar novamente" },
        { id: "m_inicio", label: "🏠 Menu do cliente" }
      ]
    }))
  }
  if (
    u.stage === STAGES.CLIENTE &&
    ehDoc &&
    !u._docsClienteGuiado &&
    (u._docClientePendenteId || u._docClientePendenteArquivo)
  ) {
    return responderTelaDocumento(from, u, criarTela({
      id: "documento_pendente_preservado",
      titulo: "Arquivo pendente",
      texto: "📎 Já existe um arquivo aguardando sua confirmação.\n\nConclua ou cancele o arquivo anterior antes de enviar outro. O arquivo pendente foi preservado.",
      textoAudioBase: "Já existe um arquivo aguardando sua confirmação. O arquivo pendente foi preservado",
      acoes: [
        { id: "doc_cliente_anexar", label: "✅ Anexar anterior" },
        { id: "m_inicio", label: "🏠 Menu do cliente" }
      ]
    }))
  }
  if (!u.pastaDriveId && ![STAGES.COLETA_DESC_AUDIO, "trab_out_desc", "out_desc"].includes(u.stage)) {
    if (u.numeroCaso) {
      const pastaRaw2 = await criarPastaCliente(u.numeroCaso, u.nome || nomeWA || "Cliente", u.area, u.situacao, u.tipo)
      const pastaNormalizada2 = normalizeDriveFolderResult(pastaRaw2)
      if (pastaNormalizada2) {
        u.pastaDriveId = pastaNormalizada2.id
        u.pastaDriveLink = pastaNormalizada2.webViewLink || u.pastaDriveLink || null
      }
    }
    if (!u.pastaDriveId) {
      return responderTelaDocumento(from, u, criarTela({
        id: "documento_pasta_indisponivel",
        titulo: "Pasta em preparação",
        texto: "⏳ Sua pasta está sendo preparada. Aguarde um instante e tente novamente.",
        textoAudioBase: "Sua pasta está sendo preparada. Aguarde um instante",
        acoes: [
          { id: "m_docs", label: "Tentar novamente" },
          { id: "m_inicio", label: "🏠 Menu do cliente" }
        ]
      }))
    }
  }

  await enviar(from, ehAudio ? "👂 Estou ouvindo seu áudio..." : "📎 Recebi seu arquivo. Estou salvando...", null, false)
  const midia = await baixarMidia(mediaId)
  if (!midia) {
    return responderTelaDocumento(from, u, criarTela({
      id: "documento_download_falhou",
      titulo: "Falha ao receber arquivo",
      texto: "❌ Não consegui baixar o arquivo. Tente reenviar.",
      textoAudioBase: "Não consegui baixar o arquivo",
      acoes: [
        { id: "m_docs", label: "Tentar novamente" },
        { id: "m_inicio", label: "🏠 Menu do cliente" }
      ]
    }))
  }

  const audioIntakeResult = await handleAudioIntake({
    from,
    nomeWA,
    u,
    ehAudio,
    midia,
    STAGES,
    formatarNome,
    uploadPastaAudio,
    transcrever,
    detectarComandoDocumento,
    textoIndicaDocumentoAusente,
    detectarIntencaoCliente,
    executarIntencaoDetectadaCliente,
    responderComTimer,
    getDocumentoAtualGuia,
    hsCriarNota,
    iniciarTimer,
    responderTelaDocumento,
    criarTela,
    fraseEnvioDocumentoAudio,
    pareceNovaSituacaoCliente,
    normalizarTextoCRM,
    confirmarAberturaNovoCasoCliente,
    telaAudioClienteCasoAtualOuNovo,
    enviarAudioModoVoz,
    textoAudioOpcoes,
    setStage,
    telaConfirmarUrgenteComAudio,
    iniciarConfirmacaoDescricao,
    salvarEtapa
  })
  if (audioIntakeResult.handled) return audioIntakeResult.response

  if (u.stage === STAGES.CLIENTE && ehDoc && !u._docsClienteGuiado) {
    const prN = formatarNome(u.nome || nomeWA || "cliente").split(" ")[0]
    const ulN = formatarNome(u.nome || nomeWA || "").split(" ").filter(Boolean).slice(-1)[0] || ""
    const nCli = ulN && ulN !== prN ? `${prN} ${ulN}` : prN
    const ext = (nomeArq || "").split(".").pop()
    const nomeFinal = `Aguardando classificacao - ${nCli}${ext && ext.length <= 4 ? "." + ext : ".jpg"}`
    const pastaOriginais = await pastaUploadDocumento(u)
    const arquivo = await uploadDocumentoCano(u, pastaOriginais, nomeFinal, midia.buffer, midia.mimeType, { fluxoDocumento: "avulso_pendente", nomeSalvo: nomeFinal })
    if (!arquivo) {
      return responderTelaDocumento(from, u, criarTela({
        id: "documento_avulso_upload_falhou",
        titulo: "Falha ao salvar arquivo",
        texto: "❌ Não consegui salvar. Pode tentar novamente?",
        textoAudioBase: "Não consegui salvar o arquivo",
        acoes: [
          { id: "m_docs", label: "📎 Enviar documentos" },
          { id: "m_inicio", label: "🏠 Menu do cliente" }
        ]
      }))
    }
    await processarAnaliseDocumentalSegura({
      u,
      arquivo,
      buffer: midia.buffer,
      mimeType: midia.mimeType,
      nomeOriginal: nomeArq,
      contexto: {
        fluxoDocumento: "avulso_pendente",
        nomeSalvo: nomeFinal
      }
    })
    await registrarDocumentoNoCicloPosHumano(u, { mediaType: tipo, fluxo: "avulso_pendente" })
    u._docClientePendenteArquivo = arquivo.webViewLink || null
    u._docClientePendenteId = arquivo.id || null
    u._docClientePendenteNome = nomeFinal
    await hsCriarNota(
      u.contatoId,
      "DOCUMENTO RECEBIDO - AGUARDANDO CLASSIFICACAO",
      `De: ${u.nome || "-"} (${from})\nCaso: ${u.numeroCaso || "-"}\nArquivo: ${nomeFinal}\nStatus: aguardando classificacao pelo cliente${arquivo.webViewLink ? `\nDrive: ${arquivo.webViewLink}` : ""}`
    )
    const casoInfoAvulso = u.numeroCaso ? `\n\n📄 *${u.numeroCaso}* · ${iconeAreaJuridica(u.area || "")} ${u.area || "Não informada"}\n_${formatarSituacaoJuridica(u.situacao, u.tipo, u.subTipo) || "Em análise"}_` : ""
    const telaAvulso = criarTela({
      id: "documento_avulso_recebido",
      titulo: "Arquivo recebido",
      texto: `📎 *Recebi seu arquivo!*${casoInfoAvulso}\n\nDeseja anexar ao seu caso?`,
      textoAudioBase: "Recebi um arquivo. Deseja anexar esse documento ao seu caso?",
      imagemUrl: IMAGEM_DOC_AVULSO_URL,
      acoes: [
        { id: "doc_cliente_anexar", label: "✅ Sim, anexar" },
        { id: "m_inicio", label: "🏠 Menu do cliente" }
      ]
    })
    await enviarGuiaDocs(from, u, telaAvulso)
    registrarUltimaPergunta(u, telaAvulso)
    iniciarTimer(from)
    return {}
  }

  garantirListasDocumentos(u)

  const pendentes = getDocsPendentes(u)
  const docAtual = pendentes[0]
  const folhas = docAtual?.folhas || ["Foto"]
  const fIdx = u.docAtualIdx || 0
  const folha = folhas[fIdx] || `Foto ${fIdx + 1}`
  const prN = formatarNome(u.nome || nomeWA || "cliente").split(" ")[0]
  const ulN = formatarNome(u.nome || nomeWA || "").split(" ").filter(Boolean).slice(-1)[0] || ""
  const nCli = ulN && ulN !== prN ? `${prN} ${ulN}` : prN
  const lblD = docAtual ? docAtual.label : "Documento"
  const ext2 = (nomeArq || "").split(".").pop()
  const nArqFinal = `${lblD} - ${folha} - ${nCli}${ext2 && ext2.length <= 4 ? "."+ext2 : ".jpg"}`
  const arquivoEhPdf = /pdf/i.test(midia.mimeType || mimeType || "") || /\.pdf$/i.test(nomeArq || "")

  const pastaOriginais = await pastaUploadDocumento(u)
  const arquivo = await uploadDocumentoCano(u, pastaOriginais, nArqFinal, midia.buffer, midia.mimeType, { fluxoDocumento: "guiado", documentoId: docAtual?.id || null, documentoLabel: lblD, folha, nomeSalvo: nArqFinal })
  if (!arquivo) {
    return responderTelaDocumento(from, u, criarTela({
      id: "documento_guiado_upload_falhou",
      titulo: "Falha ao salvar documento",
      texto: "❌ Não consegui salvar. Pode tentar novamente?",
      textoAudioBase: "Não consegui salvar o documento",
      acoes: [
        { id: "m_docs", label: "Tentar novamente" },
        { id: "m_adv", label: "👨‍⚖️ Falar com advogado" },
        { id: "m_inicio", label: "🏠 Menu do cliente" }
      ]
    }))
  }

  const resultadoAnaliseGuiada = await processarAnaliseDocumentalSegura({
    u,
    arquivo,
    buffer: midia.buffer,
    mimeType: midia.mimeType,
    nomeOriginal: nomeArq,
    contexto: {
      fluxoDocumento: "guiado",
      documentoId: docAtual?.id || null,
      documentoLabel: lblD,
      folha,
      nomeSalvo: nArqFinal
    }
  })
  await registrarDocumentoNoCicloPosHumano(u, { mediaType: tipo, fluxo: "guiado" })
  let recebimentoGuiado = null
  let confirmacaoCanonicaGuiada = null
  if (docAtual?.id === "doc_rg") {
    recebimentoGuiado = evaluateGuidedDocumentReceipt({
      requirementId: docAtual.id,
      folha,
      analysisResult: resultadoAnaliseGuiada
    })
    logInfo({
      event: "document.guided_receipt",
      status: recebimentoGuiado.accepted ? "accepted" : "rejected",
      requestedSide: folha,
      recognizedSides: (recebimentoGuiado.recognizedSides || []).join(",") || "none",
      reasonCode: recebimentoGuiado.reasonCode || "unknown",
      qualityWarnings: (recebimentoGuiado.qualityWarnings || []).join(",") || "none",
      selectedVariant: resultadoAnaliseGuiada?.evidencias?.[0]?.ocr?.selectedVariant ||
        resultadoAnaliseGuiada?.entrada?.pipeline?.selectedVariant || "unknown"
    })
    if (recebimentoGuiado.confirmEvidence) {
      confirmacaoCanonicaGuiada = await confirmarDocumentoCanonicoSeguro(u, arquivo.id, {
        origem: "guided_matched_upload"
      })
    }
    applyGuidedDocumentReceipt(u, recebimentoGuiado, {
      requirementId: docAtual.id,
      fileId: arquivo.id,
      totalParts: folhas.length,
      decisionStatus: confirmacaoCanonicaGuiada?.decision?.status || null
    })
    if (!recebimentoGuiado.accepted && confirmacaoCanonicaGuiada?.decision?.status !== "delivered") {
      u.ultimoArqId = null
      u.ultimoArqNome = null
      salvarEtapa(u._numero, "documentos")
      const telaReenvioDocumento = criarTela({
        id: `documento_guiado_${recebimentoGuiado.reasonCode || "reenvio"}`,
        titulo: "Precisamos de outro arquivo",
        texto: recebimentoGuiado.message,
        textoAudioBase: recebimentoGuiado.message,
        acoes: [
          { id: "docs_depois", label: "Continuar depois" },
          { id: "m_inicio", label: "🏠 Menu do cliente" }
        ]
      })
      await enviarGuiaDocs(from, u, telaReenvioDocumento)
      registrarUltimaPergunta(u, telaReenvioDocumento)
      iniciarTimer(from)
      return {}
    }
  }
  u.ultimoArqId = arquivo.id
  u.ultimoArqNome = nArqFinal
  u.documentosEnviados = true
  salvarEtapa(u._numero, "documentos")
  if (u.stage === STAGES.AGUARDANDO_URGENTE) setStage(u, STAGES.CLIENTE)

  // Consulta ativa é decidida exclusivamente por consultaStatus.
  // A proteção de stages jurídicos avançados permanece em hsMoverStageSeguro.
  if (u.negocioId) {
    if (u.consultaStatus === "agendada") {
      await hsCriarNotaNegocio(u.negocioId, "DOCUMENTO ENVIADO DURANTE AGENDAMENTO",
        `${u.nome || "-"} (${from}) enviou um documento enquanto há consulta agendada.\nCaso: ${u.numeroCaso || "-"}\nArquivo: ${nArqFinal}`)
    } else {
      const pendentesAposEnvio = getDocsPendentes(u)
      const stageCorreto = pendentesAposEnvio.length > 0 ? HS_STAGE.AGUARDANDO_DOCS : HS_STAGE.DOCS
      const moveu = await hsMoverStageSeguro(u.negocioId, stageCorreto, u.negocioStageId, false)
      if (moveu) u.negocioStageId = stageCorreto
    }
  }

  await hsCriarNota(u.contatoId, "DOCUMENTO RECEBIDO", `De: ${u.nome} (${from})\nCaso: ${u.numeroCaso}\nArquivo: ${nArqFinal}\nDrive: ${arquivo.webViewLink}`)

  if (docAtual?.id !== "doc_rg") u.docAtualIdx = arquivoEhPdf ? folhas.length : fIdx + 1
  const rgAguardandoVerso = docAtual?.id === "doc_rg" && u.docAtualIdx < folhas.length
  const docAtualCompleto = docAtual?.id === "doc_rg"
    ? u.docAtualIdx >= folhas.length
    : arquivoEhPdf || u.docAtualIdx >= folhas.length
  const temProximoDoc = pendentes.length > 1
  const proximaAcaoTitle = !docAtualCompleto ? "Próxima página" : temProximoDoc ? "Próximo documento" : "Concluir envio"
  const statusRecebido = docAtualCompleto
    ? montarStatusDocumentosVisual(u, { docConcluidoId: docAtual?.id || null })
    : montarStatusDocumentosVisual(u, { docEmAndamentoId: docAtual?.id || null })
  const textoFinalTela = !docAtualCompleto
    ? `Envie a próxima parte quando estiver pronto.`
    : temProximoDoc
      ? `Toque em *Próximo documento* quando estiver pronto.`
      : `Todos os documentos foram enviados. Toque em *Concluir envio* para finalizar.`
  const textoAudioRecebido = rgAguardandoVerso
    ? `${lblD}, ${folha}, recebido. Se o verso estiver nesse mesmo arquivo, toque em Usar mesma foto. Se quiser seguir sem o verso, toque em Seguir sem verso. Se preferir parar por agora, toque em Continuar depois.`
    : arquivoEhPdf
      ? `${lblD} recebido em PDF. Na tela, você pode ${temProximoDoc ? "seguir para o próximo documento" : "concluir o envio"} ou continuar depois.`
    : !docAtualCompleto
      ? `${lblD}, ${folha}, recebido. Envie a próxima parte quando estiver pronto ou toque em Continuar depois para parar por agora.`
      : temProximoDoc
        ? `${lblD} recebido. Na tela, você pode enviar complemento, seguir para o próximo documento ou continuar depois.`
        : `${lblD} recebido. Todos os documentos foram enviados. Toque em Concluir envio para finalizar ou em Continuar depois para parar por agora.`
  const opcoesRecebido = rgAguardandoVerso
    ? [
          { id:"docs_rg_verso_junto", title: "Usar mesma foto" },
          { id:"docs_rg_sem_verso", title: "Seguir sem verso" },
          { id: "docs_depois", title: "Continuar depois" }
        ]
    : (arquivoEhPdf
      ? [
          { id:"docs_proxdoc", title: proximaAcaoTitle },
          { id: "docs_depois", title: "Continuar depois" }
        ]
      : (!docAtualCompleto
        ? [
            { id:"docs_proxdoc", title: "Próxima página" },
            { id:"docs_pular_doc", title: "Sem esta parte" },
            { id: "docs_depois", title: "Continuar depois" }
          ]
        : [
            { id:"docs_maisFotos", title:"Enviar complemento" },
            { id:"docs_proxdoc", title: proximaAcaoTitle },
            { id: "docs_depois", title: "Continuar depois" }
          ]))
  const telaRecebido = criarTela({
    id: "documento_guiado_recebido",
    titulo: "Documento recebido",
    texto: `✅ *${lblD}${docAtualCompleto ? "" : `: ${folha}`}* recebido!\n\n📊 *Andamento do envio*\n${statusRecebido.texto}\n\n${textoFinalTela}`,
    textoAudioBase: textoAudioRecebido,
    imagemUrl: IMAGEM_DOC_RECEBIDO_URL,
    acoes: opcoesRecebido.map(opcao => ({ id: opcao.id, label: opcao.title }))
  })
  await enviarGuiaDocs(from, u, telaRecebido)
  registrarUltimaPergunta(u, telaRecebido)
  iniciarTimer(from)
  return {}
}

async function proximaConfirmacaoProgressiva(from, u, opcoesAudio = {}) {
  const introducaoAudio = typeof opcoesAudio.introducaoAudio === "string"
    ? opcoesAudio.introducaoAudio.trim()
    : ""
  const textoComIntroducaoAudio = texto => introducaoAudio ? `${introducaoAudio} ${texto}` : texto
  const campos = [
    {
      chave: "nome",
      preenchido: () => !!(u.nome && u.nome.trim().length > 2),
      confirmar: async () => {
        const pergunta = `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n👤 Seu nome está como *${u.nome}*. Está correto?\n\nSe não estiver, é só me dizer o nome correto agora. Pode falar ou digitar. 🎙️`
        const opcoes = [
          { id: "revalida_nome_ok", title: "✅ Confirmar" }
        ]
        if (!u.modoTexto) {
          try {
            const ogg = await gerarAudioAtendente(u.atendente, textoComIntroducaoAudio(`Seu nome está como ${u.nome}. Está correto? Se estiver, toque em Confirmar. Se não estiver, é só me dizer o nome correto agora. Pode falar ou digitar.`))
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 2000))
          } catch (e) { logErro("tts", "Falha áudio confirmar nome", e) }
        }
        setStage(u, STAGES.REVALIDA_NOME)
        iniciarTimer(from)
        return responderComTimer(from, { texto: pergunta, opcoes })
      },
      coletar: async () => {
      const pergunta = `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n😊 Fico feliz em poder ajudar! Para começar, qual é o seu nome completo?`
        if (!u.modoTexto) {
          try {
            const ogg = await gerarAudioAtendente(u.atendente, textoComIntroducaoAudio(`Qual é o seu nome completo?`))
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 2000))
          } catch (e) { logErro("tts", "Falha áudio coletar nome", e) }
        }
        setStage(u, STAGES.ACOLHIMENTO_NOME)
        iniciarTimer(from)
        return responderComTimer(from, { texto: pergunta, opcoes: null })
      }
    },
    {
      chave: "whatsapp",
      preenchido: () => !!u.whatsappVerificado,
      confirmar: async () => {
        let _dig = from.replace(/\D/g, "")
        if (_dig.length === 12) _dig = _dig.slice(0, 4) + "9" + _dig.slice(4)
        const _ddd = _dig.slice(2, 4)
        const _nono = _dig.slice(4, 5)
        const _b1 = _dig.slice(5, 9)
        const _b2 = _dig.slice(9, 13)
        const numExib = `(${_ddd}) ${_nono} ${_b1}-${_b2}`
        const pergunta = `●●●●○○ 📱 Etapa 4 de 6 · *WHATSAPP*\n\nSeu WhatsApp está como *${numExib}*. Está correto?\n\nSe não estiver, é só digitar ou falar o número correto com DDD agora. 🎙️`
        const opcoes = [
          { id: "revalida_whatsapp_ok", title: "✅ Confirmar" }
        ]
        if (!u.modoTexto) {
          try {
            const _numAudio = `DDD ${_ddd.split("").join(" ")} ${_nono} ${_b1.slice(0,2)} ${_b1.slice(2,4)} ${_b2.slice(0,2)} ${_b2.slice(2,4)}`
            const ogg = await gerarAudioAtendente(u.atendente, textoComIntroducaoAudio(`Seu WhatsApp está como ${_numAudio}. Está correto? Se estiver, toque em Confirmar. Se não estiver, é só digitar ou falar o número correto com DDD agora.`))
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 2000))
          } catch (e) { logErro("tts", "Falha áudio confirmar whatsapp", e) }
        }
        setStage(u, STAGES.REVALIDA_WHATSAPP)
        iniciarTimer(from)
        return responderComTimer(from, { texto: pergunta, opcoes })
      },
      coletar: async () => {
        let _dig = from.replace(/\D/g, "")
        if (_dig.length === 12) _dig = _dig.slice(0, 4) + "9" + _dig.slice(4)
        const _ddd = _dig.slice(2, 4)
        const _nono = _dig.slice(4, 5)
        const _b1 = _dig.slice(5, 9)
        const _b2 = _dig.slice(9, 13)
        const numExib = `(${_ddd}) ${_nono} ${_b1}-${_b2}`
        if (!u.modoTexto) {
          try {
            const _numAudio = `DDD ${_ddd.split("").join(" ")} ${_nono} ${_b1.slice(0,2)} ${_b1.slice(2,4)} ${_b2.slice(0,2)} ${_b2.slice(2,4)}`
            const ogg = await gerarAudioAtendente(u.atendente, textoComIntroducaoAudio(`Este WhatsApp tem o número ${_numAudio}. É o seu? Se não for, é só me dizer o número correto com DDD agora. Pode falar ou digitar.`))
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 4000))
          } catch (e) { logErro("tts", "Falha áudio coletar whatsapp", e) }
        }
        setStage(u, STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP)
        iniciarTimer(from)
        const primeiroNome = primeiroNomeCliente(u) || "você"
        return responderComTimer(from, {
          texto: `●●●●○○ 📱 Etapa 4 de 6 · *WHATSAPP*\n\nPerfeito, *${primeiroNome}*! 😊\n\nEste número *${numExib}* é o seu WhatsApp?\n\nSe não for, é só digitar ou falar o número correto com DDD agora. 🎙️`,
          opcoes: [
            { id: "nc_meu", title: "✅ Confirmar" }
          ]
        })
      }
    },
    {
      chave: "cidade",
      preenchido: () => !!(u.cidade && u.cidade.trim().length > 1),
      confirmar: async () => {
        const cidadeExib = u.uf ? `${u.cidade}, ${u.uf}` : u.cidade
        const regiaoExib = u.regiao ? ` (${u.regiao})` : ``
        const pergunta = `●●●●●○ 📍 Etapa 5 de 6 · *CIDADE*\n\n✅ A cidade que você informou é *${cidadeExib}*${regiaoExib}. Está correto?\n\nSe não estiver, é só me dizer a cidade correta agora. Pode falar ou digitar. 🎙️`
        const opcoes = [
          { id: "revalida_cidade_ok", title: "✅ Confirmar" }
        ]
        if (!u.modoTexto) {
          try {
            const estadoFull = estadoPorExtenso(u.uf) || u.uf || ""
            const ogg = await gerarAudioAtendente(u.atendente, textoComIntroducaoAudio(`A cidade que você informou é ${u.cidade}${estadoFull ? ", " + estadoFull : ""}. Está correto? Se estiver, toque em Confirmar. Se não estiver, é só me dizer a cidade correta agora. Pode falar ou digitar.`))
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 2000))
          } catch (e) { logErro("tts", "Falha áudio confirmar cidade", e) }
        }
        setStage(u, STAGES.REVALIDA_CIDADE)
        iniciarTimer(from)
        return responderComTimer(from, { texto: pergunta, opcoes })
      },
      coletar: async () => {
        const pergunta = `●●●●●○ 📍 Etapa 5 de 6 · *CIDADE*\n\nÓtimo! Em qual *cidade* você mora?\n\nSe preferir, pode informar o *CEP* também.`
        if (!u.modoTexto) {
          try {
            const ogg = await gerarAudioAtendente(u.atendente, textoComIntroducaoAudio(`Em qual cidade você mora?`))
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 2000))
          } catch (e) { logErro("tts", "Falha áudio coletar cidade", e) }
        }
        setStage(u, STAGES.ACOLHIMENTO_CIDADE)
        iniciarTimer(from)
        return responderComTimer(from, { texto: pergunta, opcoes: null })
      }
    }
  ]

  for (const campo of campos) {
    if (campo.preenchido()) {
      const jaConfirmado = (u._revalidaConfirmados || []).includes(campo.chave)
      if (!jaConfirmado) return await campo.confirmar()
    } else {
      return await campo.coletar()
    }
  }

  u._revalidandoCampos = false
  u._revalidaConfirmados = []
  setStage(u, STAGES.CONFIRMACAO)
  return responderComTimer(from, await telaConfirmarDadosAudio(from, u, {
    introducaoAudio: textoComIntroducaoAudio(`Ótimo! Vou mostrar um resumo dos seus dados para você confirmar.`)
  }))
}

async function processarAudioCanalAtendimento(from, nomeWA, u, msgObj, tipo, ehAudio, ehDoc) {
  if (!ehAudio || ehDoc) return null
  if (u.numeroCaso) return null
  if (u.stage !== STAGES.AUDIO_AGUARDANDO) return null

  const mediaId = msgObj?.[tipo]?.id
  if (!mediaId) {
    return responderComTimer(from, { texto: "Não consegui identificar seu áudio. Pode tentar enviar novamente?", opcoes: null })
  }

  await enviar(from, "👂 Estou ouvindo seu áudio...", null, false)

  const midia = await baixarMidia(mediaId)
  if (!midia) {
    return responderComTimer(from, { texto: "Não consegui baixar esse áudio. Pode tentar novamente?", opcoes: null })
  }

  setStage(u, STAGES.AUDIO_PROCESSANDO)
  const transcricao = await transcrever(midia.buffer, midia.mimeType, { origem: "audio_opcoes" })
  if (!transcricao) {
    setStage(u, STAGES.AUDIO_AGUARDANDO)
    iniciarTimer(from)
    return responderComTimer(from, {
      texto: "Não consegui ouvir esse áudio com clareza. Você pode enviar outro áudio ou corrigir por texto.",
      opcoes: [
        { id: "audio_enviar", title: "🎤 Enviar novo áudio" },
        { id: "audio_voltar_texto", title: "✍️ Corrigir por texto" }
      ]
    })
  }

  u._audioCanalTranscricao = acumularRelato(u, normalizarTextoCRM(transcricao))
  if (!Array.isArray(u.historiaIA)) u.historiaIA = []
  u.historiaIA.push({ role: "user", content: transcricao })

  const classificacao = await classificarAreaAudio(u._audioCanalTranscricao)
  iniciarTimer(from)

  // "Recomeçar" — confirmação progressiva campo a campo
  if (u._revalidandoCampos) {
    aplicarClassificacaoJuridica(u, classificacao)
    u._revalidaConfirmados = []
    return await proximaConfirmacaoProgressiva(from, u, {
      introducaoAudio: `Atualizei seu relato. Agora vou confirmar seus dados com você.`
    })
  }
  // "Voltar" da confirmação: atualiza relato e revisa dados campo a campo (igual ao Recomeçar)
  if (u._voltandoConfirmacao) {
    aplicarClassificacaoJuridica(u, classificacao)
    u._voltandoConfirmacao = false
    u._revalidandoCampos = true
    u._revalidaConfirmados = []
    return await proximaConfirmacaoProgressiva(from, u, {
      introducaoAudio: `Atualizei seu relato. Agora vou confirmar seus dados com você.`
    })
  }

  // Guarda: classificação fraca → pede esclarecimento antes de avançar
  if (deveEsclarecerRelato(u, classificacao)) {
    u._jaEsclareceuRelato = true
    setStage(u, STAGES.AUDIO_AGUARDANDO)
    const pergunta = gerarPerguntaEsclarecimentoRelato(classificacao, u._audioCanalTranscricao)
    if (!u.modoTexto) {
      try {
        const textoAudioEsc = removerFormatacaoParaAudio(pergunta)
        const ogg = await gerarAudioAtendente(u.atendente, textoAudioEsc)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 4000))
      } catch (e) { logErro("tts", "Falha áudio esclarecimento relato", e) }
    }
    return responderComTimer(from, { texto: pergunta, opcoes: null })
  }

  aplicarClassificacaoJuridica(u, classificacao)
  u._jaEsclareceuRelato = false
  return await flowAssessoriaInicial(u, { from, origem: "audio" })
}

const STAGES_AUDIO_RESPOSTA_CADASTRAL = new Set([
  STAGES.ACOLHIMENTO_MODO,
  STAGES.ACOLHIMENTO_PARA_QUEM,
  STAGES.ACOLHIMENTO_CONFIRMA_TITULAR_NOME,
  STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP,
  STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP_OUTRO,
  STAGES.CONFIRMAR_ENTRADA,
  STAGES.COLETA_TEL_WPP_CONTATO
])

function adaptarTextoAudioCadastral(stage, texto) {
  const original = sanitizarTextoEntrada(texto)
  if (!original || /\d/.test(original)) return original
  const t = normalizarTextoGatilho(original)
  const partes = t.split(/\s+/).filter(Boolean)
  if (!partes.length || partes.length > 6 || t.length > 80) return original

  const confirma = /^(sim|isso|isso mesmo|correto|certo|esta correto|ta certo|pode confirmar|confirmar|confirmo|pode usar|pode usar este|pode usar esse|usar esse numero|usar este numero|esse numero|este numero|esse mesmo|continuar assim)$/.test(t)
  const negaOuCorrige = /^(nao|nao esta correto|nao e isso|errado|esta errado|incorreto|quero corrigir|corrigir)$/.test(t)
  const querOutro = /^(nao e esse|nao e este|outro numero|quero informar outro|informar outro|quero outro numero|usar outro numero)$/.test(t)

  if (stage === STAGES.CONFIRMAR_ENTRADA) {
    if (confirma) return "entrada_ok"
    if (negaOuCorrige || querOutro) return "entrada_corrigir"
  }
  if (stage === STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP) {
    if (confirma) return "whatsapp_sim"
    if (negaOuCorrige || querOutro) return "whatsapp_nao"
  }
  if (stage === STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP_OUTRO) {
    if (confirma) return "wpp_continuar_assim"
    if (querOutro) return "wpp_informar_outro"
  }
  if (stage === STAGES.COLETA_TEL_WPP_CONTATO) {
    if (confirma) return "wpp_contato_esse"
    if (negaOuCorrige || querOutro) return "wpp_contato_outro"
  }
  return original
}

async function transcreverAudioRespostaCadastral(from, u, msgObj, tipo) {
  if (!STAGES_AUDIO_RESPOSTA_CADASTRAL.has(u.stage)) return null
  const mediaId = msgObj?.[tipo]?.id || msgObj?.audio?.id || msgObj?.voice?.id
  if (!mediaId) return { erro: "Não consegui processar seu áudio. Pode tentar novamente ou digitar?" }
  await enviar(from, "👂 Estou ouvindo seu áudio...", null, false)
  const midia = await baixarMidia(mediaId)
  if (!midia) return { erro: "Não consegui baixar esse áudio. Pode tentar novamente ou digitar?" }
  const transcricao = await transcrever(midia.buffer, midia.mimeType, { origem: `audio_cadastral:${u.stage}` })
  if (!transcricao) return { erro: "Não consegui ouvir com clareza. Pode enviar outro áudio ou digitar?" }
  return { text: adaptarTextoAudioCadastral(u.stage, normalizarTextoCRM(transcricao)) }
}

async function processarAudioNoFluxo(from, nomeWA, u, msgObj, tipo, ehAudio) {
  if (!ehAudio) return null
  if (u.numeroCaso) return null
  if ([
    STAGES.CLIENTE,
    STAGES.ACOLHIMENTO,
    STAGES.AGUARDANDO_URGENTE,
    STAGES.COLETA_DESC_AUDIO,
    STAGES.DESC_CONFIRMA,
    STAGES.DESC_ERRO_TRANSCRICAO,
    STAGES.SUGESTAO_FLUXO_OUTRO,
    STAGES.EXPLICAR_TUDO_OFERTA,
    STAGES.URGENTE_AUDIO_CONFIRMA,
    STAGES.URGENTE_AUDIO_ERRO_TRANSCRICAO,
    STAGES.AUDIO_FLUXO_CONFIRMA,
    STAGES.AUDIO_OPCOES,
    STAGES.AUDIO_AGUARDANDO,
    STAGES.AUDIO_PROCESSANDO,
    STAGES.AUDIO_CONFIRMAR_TRANSCRICAO,
    STAGES.AUDIO_CONFIRMAR_AREA,
    STAGES.AUDIO_CONFIRMAR_DADOS,
    STAGES.COLETA_TEL_OUTRO,
    STAGES.COLETA_TEL_WPP,
    STAGES.COLETA_TEL_WPP_CONFIRMA,
    STAGES.ACOLHIMENTO_MODO,
    STAGES.ACOLHIMENTO_PARA_QUEM,
    STAGES.ACOLHIMENTO_CONFIRMA_TITULAR_NOME,
    STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP,
    STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP_OUTRO,
    STAGES.CONFIRMAR_ENTRADA,
    STAGES.COLETA_TEL_WPP_CONTATO,
    // -- Stages de confirmação de nome no pré-atendimento — têm handler de áudio próprio --
    STAGES.ACOLHIMENTO_CONFIRMA_NOME,
    STAGES.ACOLHIMENTO_CONFIRMA_NOME_CONTATO,
    // -- Mini-stages de edição — têm handlers próprios; não devem cair aqui --
    STAGES.CORRIGIR_DADOS,
    STAGES.CONFIRMAR_CORRECAO,
    STAGES.EDITAR_NOME,
    STAGES.EDITAR_CIDADE,
    STAGES.EDITAR_AREA,
    STAGES.EDITAR_SITUACAO,
    STAGES.EDITAR_DETALHE,
    STAGES.EDITAR_URGENCIA,
    STAGES.EDITAR_DESCRICAO,
    STAGES.CONFIRMAR_CORRECAO_NOME,
    STAGES.CONFIRMAR_CORRECAO_CIDADE,
    STAGES.MENU_CORRECAO,
    STAGES.CONFIRMACAO,
    "trab_out_desc",
    "out_desc",
    "inicio",
    "inicio_retorno"
  ].includes(u.stage)) return null

  const mediaId = msgObj?.[tipo]?.id
  if (!mediaId) return null

  const midia = await baixarMidia(mediaId)
  if (!midia) {
    return responderComTimer(from, { texto: "Nao consegui baixar esse audio. Pode tentar novamente?", opcoes: null })
  }

  const transcricao = await transcrever(midia.buffer, midia.mimeType, { origem: "fluxo" })
  if (!transcricao) {
    const ultimaPergunta = retomarUltimaPergunta(u)
    if (ultimaPergunta) {
      return responderComTimer(from, {
        texto: "Nao consegui entender esse audio agora. Vou te manter no ponto em que estavamos.",
        opcoes: [
        { id: "cont_retomar", title: "▶️ Continuar" },
      { id: "recomecar",    title: "🔄 Recomeçar" },
      { id: "audio_fluxo_encerrar", title: "👋 Encerrar" }
        ]
      })
    }
    return responderComTimer(from, { texto: "Nao consegui entender esse audio agora. Se preferir, responda por texto.", opcoes: null })
  }

  const decisao = await classificarAcaoAudioFluxo(u, transcricao)
  u._audioFluxoTexto = normalizarTextoCRM(transcricao)
  u._audioFluxoAcao = decisao.acao
  u._audioFluxoResposta = decisao.recomendacao
  setStage(u, STAGES.AUDIO_FLUXO_CONFIRMA)
  return responderComTimer(from, telaAudioNoFluxo(u._audioFluxoTexto, u._audioFluxoResposta))
}

async function processarUrgenciaOuCorrecao(from, u, text, msgObj, ehDoc, ehAudio) {
  if (u.stage === STAGES.AGUARDANDO_URGENTE && text && !ehDoc && !ehAudio) {
    if (/^[a-z][a-z0-9_]{1,20}$/.test(text)) {
      setStage(u, STAGES.CLIENTE)
    } else {
      const mensagemUrgente = normalizarTextoCRM(text)
      await hsCriarNota(u.contatoId, "MENSAGEM URGENTE", `De: ${u.nome} (${from})\nCaso: ${u.numeroCaso}\nArea: ${u.area}\n\n${mensagemUrgente}`)
      await hsMoverStage(u.negocioId, HS_STAGE.ANALISE)
      notificarMensagemUrgente(u, mensagemUrgente, u.negocioId).catch(e => console.error("[notif] urgente:", e.message))
      setStage(u, STAGES.CLIENTE)
      return await respostaUrgenteRegistradaComAudio(from, u, "mensagem urgente texto registrada")
    }
  }

  if (u.stage === STAGES.CONFIRMAR_CORRECAO) {
    if (text === "correcao_confirmar") {
      return await aplicarCorrecaoPendente(from, u)
    }
    if (text === "correcao_corrigir") {
      return await reabrirCorrecaoPendente(from, u)
    }

    const valorExibido = formatarValorCorrecao(u._correcaoPendenteCampo, u._correcaoPendenteValor, u._correcaoPendenteExtra || {})
    const barra = u._correcaoPendenteCampo === "nome"
      ? "●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n"
      : u._correcaoPendenteCampo === "cidade"
        ? "●●●●●○ 📍 Etapa 5 de 6 · *CIDADE*\n\n"
        : ""
    return responderComTimer(from, {
      texto: `${barra}Você informou: *${valorExibido}*.\n\nEstá correto?`,
      opcoes: [
      { id: "correcao_confirmar", title: "✅ Confirmar" },
      { id: "correcao_corrigir", title: "✏️ Corrigir" }
      ]
    })
  }

  if (u.stage === STAGES.CORRIGIR_VALOR && text) {
    if (u.corrigirCampo) {
      if (u.corrigirCampo === "nome") u[u.corrigirCampo] = formatarNome(text.trim())
      else if (u.corrigirCampo === "cidade") u[u.corrigirCampo] = formatarCidade(text.trim())
      else u[u.corrigirCampo] = normalizarTextoCRM(text)
      await sincronizarContatoNegocioHubSpot(u)
      u.corrigirCampo = null
    }

    // Se a correção veio do Resumo de Retomada, voltar para lá
    if (u._correcaoOrigem === "resumo_retomada") {
      u._correcaoOrigem = null
      setStage(u, STAGES.RESUMO_RETOMADA)
      await sincronizarNegocio(u)
      return responderComTimer(from, await flowResumoRetomada(u))
    }

    // Caso contrário, ir para Confirmação normal
    setStage(u, STAGES.CONFIRMACAO)
    await sincronizarNegocio(u)
    return responderComTimer(from, await telaConfirmacaoComImagem(from, u))
  }

  if (u.stage === STAGES.CORRIGIR_UF) {
    if (REGIOES[text]) { u._regiao = text; return responderComTimer(from, telaUFsRegiao(text)) }
    const val = UF_MAP[text]
    if (val) {
      u.uf = val

      // Se veio do Resumo de Retomada, voltar para lá
      if (u._correcaoOrigem === "resumo_retomada") {
        u._correcaoOrigem = null
        setStage(u, STAGES.RESUMO_RETOMADA)
        await sincronizarNegocio(u)
        return responderComTimer(from, await flowResumoRetomada(u))
      }

      // Retornar para a tela de confirmação correta (texto ou áudio)
      u._correcaoOrigem = null
      return responderComTimer(from, await voltarParaConfirmacao(from, u))
    }
    return responderComTimer(from, telaRegioes())
  }

  if (u.stage === STAGES.CORRIGIR_SEL) {
    const mc = { cc_nunca: "Nunca", cc_pouco: "Pouco tempo", cc_1ano: "Mais de 1 ano", cc_muito: "Muitos anos" }
    const mb = { cb_sim: "Sim", cb_nao: "Não" }
    const val = mc[text] || mb[text]
    if (val && u.corrigirCampo) {
      u[u.corrigirCampo] = val
      u.corrigirCampo = null

      // Se a correção veio do Resumo de Retomada, voltar para lá
      if (u._correcaoOrigem === "resumo_retomada") {
        u._correcaoOrigem = null
        setStage(u, STAGES.RESUMO_RETOMADA)
        await sincronizarNegocio(u)
        return responderComTimer(from, await flowResumoRetomada(u))
      }

      // Caso contrário, ir para Confirmação normal
      setStage(u, STAGES.CONFIRMACAO)
      await sincronizarNegocio(u)
      return responderComTimer(from, await telaConfirmacaoComImagem(from, u))
    }
  }

  if (u.stage === STAGES.CONFIRMACAO) {
    if (text === "conf_ok") {
      try {
        const casoAnteriorCliente = u._casoAnteriorCliente
        const casoParaTerceiro = ehFinalizacaoCasoTerceiro(u)
        const eraNovoCasoDeCliente = Boolean(u._novoCasoDeCliente)
        const numeroCaso = await finalizarCadastro(from, u)
        // marcar que o caso foi recém-aberto para que "Enviar documentos"
        // vá direto para o fluxo de docs sem exibir seleção de caso
        u._casoRecemAberto = true
        if (eraNovoCasoDeCliente) u._contextoDocsCasoAtual = criarContextoDocsCasoAtual(u, numeroCaso)
        if (casoParaTerceiro) {
          u._casoRecemAberto = false
          u._contextoDocsCasoAtual = null
          return responderComTimer(from, await finalizarCadastroTerceiroEVoltarOrigem(from, u, numeroCaso, casoAnteriorCliente))
        }
        if (!u._contextoDocsCasoAtual) u._contextoDocsCasoAtual = criarContextoDocsCasoAtual(u, numeroCaso)
        const docs = getDocumentosCaso(u)
        const primeiroNome = primeiroNomeCliente(u) || "você"
        const textoCasoReg = `🎉 *${primeiroNome}, seu caso foi registrado!*\n\n📄 *Número do caso:* \`\`\`${numeroCaso}\`\`\`\n\n_Guarde esse número. É com ele que identificamos seu atendimento por aqui._\n\nSeu caso foi encaminhado a um especialista em *${u.area ? "Direito " + u.area : "Direito"}*, que fará a análise e entrará em contato em breve.\n\n⏱️ Prazo estimado: até 2 dias úteis\n\n━━━━━━━━━━━━━━━\n📋 *Documentos que podem ser necessários:*\n${docs}\n\nVocê pode enviar agora ou depois, como preferir.`
        const opcoesCasoReg = [
      { id: "m_docs", title: "📎 Enviar documentos" },
      { id: "m_adv",      title: "👨‍⚖️ Falar com advogado" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
        ]
        if (IMAGEM_CASO_REGISTRADO_URL) {
          const enviada = await enviarImagemWhatsApp(from, IMAGEM_CASO_REGISTRADO_URL, textoCasoReg, opcoesCasoReg)
          if (enviada) return responderComTimer(from, { texto: null, opcoes: null })
        }
        return responderComTimer(from, { texto: textoCasoReg, opcoes: opcoesCasoReg })
      } catch (e) {
        const detalhesErroFinalizacao = [
          `Falha ao finalizar cadastro (conf_ok): ${e.message}`,
          e.code ? `code=${e.code}` : null,
          e.operation ? `operation=${e.operation}` : null,
          Array.isArray(e.violations) && e.violations.length ? `violations=${e.violations.join(",")}` : null
        ].filter(Boolean).join(" | ")
        logErro("finalizarCadastro", detalhesErroFinalizacao, e)
        setStage(u, STAGES.CONFIRMACAO)
        return responderComTimer(from, {
          texto: `⚠️ Ocorreu um problema ao registrar seu caso. Seus dados estão salvos.\n\nPor favor, tente confirmar novamente.`,
          opcoes: [
            { id: "conf_ok", title: "🔄 Tentar novamente" },
            { id: "conf_corrigir", title: "✏️ Corrigir dados" }
          ]
        })
      }
    }
    if (text === "conf_corrigir") {
      u._retornarParaConfirmacao = true
      u._origemConfirmacao = u.modoTexto ? "texto" : "audio"
      setStage(u, STAGES.CORRIGIR_DADOS)
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente,
            `Claro! Me diga o que deseja corrigir. Pode falar em áudio ou digitar. Por exemplo: meu nome está errado, a cidade está errada, ou o WhatsApp está errado.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio corrigir dados conf", e) }
      }
      return responderComTimer(from, {
      texto: `✏️ *O que você gostaria de corrigir?*

_Diga ou digite o que está errado. Por exemplo: "meu nome está errado", "a cidade está errada" ou "o WhatsApp está errado"._`,
        opcoes: null
      })
    }
    if (text === "conf_menu") {
      if (ehFinalizacaoCasoTerceiro(u)) {
        iniciarTimer(from)
        const temCasoAnterior = Boolean(u._casoAnteriorCliente)
        const textoAudioVoltar = temCasoAnterior
          ? "Este atendimento é para outra pessoa. Para evitar misturar com seu caso original, escolha se deseja ver a confirmação, corrigir os dados ou voltar ao seu menu."
          : "Você está abrindo um caso para outra pessoa. Escolha se deseja ver a confirmação, corrigir os dados ou cancelar o atendimento."
        await enviarAudioModoVoz(from, u, textoAudioVoltar, "voltar confirmacao terceiro")
        return responderComTimer(from, telaVoltarConfirmacaoTerceiro(u, "texto"))
      }
      // Voltar na confirmação (fluxo "para mim"): exibe tela intermediária
      // com opções claras, sem regredir ao relato.
      iniciarTimer(from)
      const primeiroNomeVoltar = primeiroNomeCliente(u) || ""
      const textoAudioVoltarParaMim = primeiroNomeVoltar
        ? `${primeiroNomeVoltar}, você voltou da tela de confirmação. Escolha se deseja ver os dados novamente, corrigir alguma informação ou contar a situação de outro jeito.`
        : "Você voltou da tela de confirmação. Escolha se deseja ver os dados novamente, corrigir alguma informação ou contar a situação de outro jeito."
      await enviarAudioModoVoz(from, u, textoAudioVoltarParaMim, "voltar confirmacao para_mim")
      const textoTelaVoltarParaMim = primeiroNomeVoltar
        ? `⬅️ *Tudo bem, ${primeiroNomeVoltar}.*\n\nO que você gostaria de fazer?`
        : `⬅️ *Tudo bem.*\n\nO que você gostaria de fazer?`
      return responderComTimer(from, {
        texto: textoTelaVoltarParaMim,
        opcoes: [
          { id: "conf_ok_ver", title: "✅ Ver meus dados" },
          { id: "conf_corrigir", title: "✏️ Corrigir algo" },
          { id: "conf_menu_recontar", title: "🔄 Contar de novo" }
        ]
      })
    }
    if (text === "conf_ok_ver") {
      iniciarTimer(from)
      return responderComTimer(from, await telaConfirmacaoComImagem(from, u))
    }
    if (text === "conf_menu_recontar") {
      u._revalidandoCampos = true
      u.aguardandoResposta = false
      u.aguardandoRetomada = false
      setStage(u, STAGES.AUDIO_AGUARDANDO)
      iniciarTimer(from)
      const primeiroNomeRecontar = primeiroNomeCliente(u) || ""
      const saudacaoRecontar = primeiroNomeRecontar ? `, ${primeiroNomeRecontar}` : ""
      const textoRecontar = `Tudo bem${saudacaoRecontar}. Pode me contar sua situação novamente${u.modoTexto ? " por texto" : " por áudio ou texto"}. Estou aqui para ajudar você.`
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, textoRecontar)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha audio voltar confirmacao recontar", e) }
      }
      return {
        texto: `🔄 Tudo bem${saudacaoRecontar} 😊\n\nPode me contar sua situação novamente${u.modoTexto ? " por texto" : " por áudio ou texto"}. Estou aqui para ajudar você.`,
        opcoes: null
      }
    }
    if (text === "terceiro_conf_continuar") {
      iniciarTimer(from)
      return responderComTimer(from, await telaConfirmacaoComImagem(from, u))
    }
    const imprevistoConfirmacao = await tratarImprevistoPreAtendimento(from, u, u.stage, text)
    if (imprevistoConfirmacao) return imprevistoConfirmacao
  }

  if (u.stage === STAGES.MENU_CORRECAO) {
    // Menu de correção da Retomada (dinâmico)
    if (text?.startsWith("rr_corr_")) {
      const campo = text.replace("rr_corr_", "")

      if (campo === "voltar") {
        setStage(u, STAGES.RESUMO_RETOMADA)
        iniciarTimer(from)
        return await flowResumoRetomada(u)
      }

      u.corrigirCampo = campo

      if (campo === "area") {
        iniciarTimer(from)
        return responderComTimer(from, {
          texto: "A área jurídica é definida pela análise do relato. Se ela parecer errada, corrija a descrição do caso com mais detalhes.",
          opcoes: null
        })
      }

      if (campo === "tipo" || campo === "situacao" || campo === "descricao") {
        setStage(u, STAGES.CORRIGIR_VALOR)
        const label = { tipo: "tipo", situacao: "situação", descricao: "descrição" }[campo]
        return responderComTimer(from, { texto: `Digite a ${label} corrigida:`, opcoes: null })
      }
      if (campo === "cidade") {
        setStage(u, STAGES.CORRIGIR_VALOR)
        return responderComTimer(from, { texto: "Digite a cidade correta:", opcoes: null })
      }
      if (campo === "uf") {
        setStage(u, STAGES.CORRIGIR_UF)
        return responderComTimer(from, telaRegioes())
      }
      if (campo === "regiao") {
        setStage(u, STAGES.CORRIGIR_UF)
        return responderComTimer(from, telaRegioes())
      }
    }

    // Menu de correção normal (da Confirmação — texto ou áudio)
    // Todos os campos agora usam mini-stages EDITAR_* com retorno automático
    if (text === "cor_nome") {
      u._retornarParaConfirmacao = true
      setStage(u, STAGES.EDITAR_NOME)
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, "Tudo bem. Me diga o nome completo correto. Pode falar ou digitar.")
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 2500))
        } catch (e) { logErro("tts", "Falha áudio cor_nome", e) }
      }
      return responderComTimer(from, { texto: "●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n😊 Fico feliz em poder ajudar! Para começar, qual é o seu nome completo?\n\n_Digite ou envie um áudio._", opcoes: null })
    }
    if (text === "cor_whatsapp") {
      u._retornarParaConfirmacao = true
      u._corrigindoWhatsappConfirmacao = true
      setStage(u, STAGES.REVALIDA_WHATSAPP)
      iniciarTimer(from)
      const numeroAtual = formatarTelefoneExibicao(getTelefoneContato(from, u))
      if (!u.modoTexto) {
        try {
          const digitosAudio = String(getTelefoneContato(from, u) || "").replace(/\D/g, "").split("").join(" ")
          const ogg = await gerarAudioAtendente(u.atendente,
            `Seu WhatsApp de contato está como ${digitosAudio}. Está correto? Se quiser usar outro número, é só falar ou digitar o WhatsApp com DDD agora.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3500))
        } catch (e) { logErro("tts", "Falha áudio corrigir whatsapp", e) }
      }
      return responderComTimer(from, {
        texto: `Seu WhatsApp está como *${numeroAtual || from}*.\n\nEstá correto? Se quiser usar outro número, é só digitar ou falar com DDD agora. 🎙️`,
        opcoes: [
          { id: "revalida_whatsapp_ok", title: "✅ Confirmar" }
        ]
      })
    }
    if (text === "cor_cidade") {
      u._retornarParaConfirmacao = true
      setStage(u, STAGES.EDITAR_CIDADE)
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, "Tudo bem. Me diga a cidade com o estado, por exemplo Recife Pernambuco, ou informe o CEP com oito dígitos.")
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio cor_cidade", e) }
      }
      return responderComTimer(from, { texto: "📍 *Em qual cidade você mora?*\n\n_Digite a cidade com o estado, por exemplo: Recife Pernambuco, ou informe o CEP com oito dígitos._", opcoes: null })
    }
    if (text === "cor_uf") {
      u._correcaoOrigem = u._origemConfirmacao === "audio" ? "audio_confirmacao" : "confirmacao"
      setStage(u, STAGES.CORRIGIR_UF)
      iniciarTimer(from)
      return responderComTimer(from, telaRegioes())
    }
    if (text === "cor_area") {
      iniciarTimer(from)
      return responderComTimer(from, {
        texto: "A área jurídica é definida pela análise do relato. Se ela parecer errada, corrija a descrição do caso com mais detalhes.",
        opcoes: null
      })
    }
    if (text === "cor_situacao") {
      u._retornarParaConfirmacao = true
      setStage(u, STAGES.EDITAR_SITUACAO)
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, "Tudo bem. Me conte a situação correta do seu caso. Pode falar ou digitar.")
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 2500))
        } catch (e) { logErro("tts", "Falha áudio cor_situacao", e) }
      }
      return responderComTimer(from, { texto: "📌 *Qual é a situação correta?*\n\n_Descreva brevemente ou envie um áudio._", opcoes: null })
    }
    if (text === "cor_detalhe") {
      u._retornarParaConfirmacao = true
      setStage(u, STAGES.EDITAR_DETALHE)
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, "Tudo bem. Me diga o detalhe correto do caso. Pode falar ou digitar.")
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 2500))
        } catch (e) { logErro("tts", "Falha áudio cor_detalhe", e) }
      }
      return responderComTimer(from, { texto: "🔎 *Qual é o detalhe correto?*\n\n_Digite ou envie um áudio._", opcoes: null })
    }
    if (text === "cor_urgencia") {
      u._retornarParaConfirmacao = true
      setStage(u, STAGES.EDITAR_URGENCIA)
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, "Qual é o nível de urgência correto? Alta, moderada ou baixa?")
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 2500))
        } catch (e) { logErro("tts", "Falha áudio cor_urgencia", e) }
      }
      return responderComTimer(from, {
        texto: "⚡ *Qual é o nível de urgência correto?*",
        opcoes: [
          { id: "eu_alta",   title: "🔴 Alta" },
          { id: "eu_normal", title: "🟡 Moderada" },
          { id: "eu_baixa",  title: "🟢 Baixa" }
        ]
      })
    }
    if (text === "cor_desc") {
      u._retornarParaConfirmacao = true
      setStage(u, STAGES.EDITAR_DESCRICAO)
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, "Tudo bem. Me conte a descrição correta do seu caso. Pode falar em áudio ou digitar.")
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio cor_desc", e) }
      }
      return responderComTimer(from, { texto: "💬 *Qual é a descrição correta do seu caso?*\n\n_Digite ou envie um áudio com a descrição atualizada._", opcoes: null })
    }
    // Legado — manter contrib/benef para retomada
    if (text === "cor_contrib") {
      u.corrigirCampo = "contribuicao"
      u._correcaoOrigem = "confirmacao"
      setStage(u, STAGES.CORRIGIR_SEL)
      return responderComTimer(from, { texto: "Corrija a informação sobre contribuição ao INSS:", opcoes: [{ id: "cc_nunca", title: "Nunca" }, { id: "cc_pouco", title: "Pouco tempo" }, { id: "cc_1ano", title: "Mais de 1 ano" }, { id: "cc_muito", title: "Muitos anos" }] })
    }
    if (text === "cor_benef") {
      u.corrigirCampo = "recebeBeneficio"
      u._correcaoOrigem = "confirmacao"
      setStage(u, STAGES.CORRIGIR_SEL)
      return responderComTimer(from, { texto: "Você recebe algum benefício?", opcoes: [{ id: "cb_sim", title: "Sim" }, { id: "cb_nao", title: "Não" }] })
    }
  }

  // ---------------------------------------------------------------
  //  MINI-STAGES DE EDIÇÃO — retornam automaticamente para confirmação
  // ---------------------------------------------------------------

  // -- EDITAR_NOME --
  if (u.stage === STAGES.EDITAR_NOME) {
    // Botões de escolha: qual nome corrigir (fluxo para terceiro com ambos os nomes coletados)
    if (text === "corr_nome_contato" || text === "corr_nome_atendido") {
      u._correcaoPendenteSubcampo = text === "corr_nome_contato" ? "nomeContato" : "nome"
      const ehContato = u._correcaoPendenteSubcampo === "nomeContato"
      const nomeAtual = ehContato ? u.nomeContato : u.nome
      const textoTela = ehContato
        ? `●●○○○○ 👤 Etapa 2 de 6 · IDENTIFICAÇÃO\n\nSeu nome atual é ${nomeAtual || "não informado"}.\n\nQual é o nome correto?\n\n🎙️ Você pode digitar ou enviar um áudio.`
        : `●●○○○○ 👤 Etapa 3 de 6 · IDENTIFICAÇÃO\n\nO nome atual da pessoa atendida é ${nomeAtual || "não informado"}.\n\nQual é o nome correto?\n\n🎙️ Você pode digitar ou enviar um áudio.`
      const textoAudio = ehContato
        ? `Seu nome está como ${nomeAtual || "não informado"}. Qual é o nome correto? Pode falar ou digitar.`
        : `O nome da pessoa atendida está como ${nomeAtual || "não informado"}. Qual é o nome correto? Pode falar ou digitar.`
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3500))
        } catch (e) { logErro("tts", "Falha áudio pede nome correto após escolha", e) }
      }
      return responderComTimer(from, { texto: textoTela, opcoes: null })
    }
    let textoEntrada = text
    if (!textoEntrada && ehAudio) {
      const mediaId = msgObj?.audio?.id || msgObj?.voice?.id
      if (mediaId) {
        const midia = await baixarMidia(mediaId)
        if (midia) {
          if (!u.modoTexto) await enviar(from, "👂 Ouvindo...", null, false)
          textoEntrada = await transcrever(midia.buffer, midia.mimeType, { origem: "editar_nome" })
        }
      }
    }
    if (!textoEntrada) {
      if (ehAudio) return await responderFalhaAudioCorrecao(from, u)
      return responderComTimer(from, { texto: "●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n😊 Fico feliz em poder ajudar! Para começar, qual é o seu nome completo?\n\n_Digite ou envie um áudio._", opcoes: null })
    }
    const nomeLimpo = await extrairNomeAudio(textoEntrada)
    const validacaoNome = nomeLimpo ? ehNomeAparente(nomeLimpo, textoEntrada) : false
    if (!nomeLimpo || validacaoNome === false) return responderComTimer(from, { texto: "Pode me dizer só o nome completo, por favor?", opcoes: null })
    if (validacaoNome === "incompleto") return responderComTimer(from, { texto: "Preciso do nome completo. Por favor, informe também o sobrenome.", opcoes: null })
    return await prepararConfirmacaoCorrecao(from, u, "nome", nomeLimpo)
  }

  // -- EDITAR_CIDADE --
  if (u.stage === STAGES.EDITAR_CIDADE) {
    if (text === "edit_cidade_nenhuma") {
      delete u._cidadesMultiplasEdit
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, "Tudo bem. Me diga novamente o nome da cidade junto com o estado, ou informe o CEP.")
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio nenhuma cidade edição", e) }
      }
      iniciarTimer(from)
      return responderComTimer(from, {
        texto: "📍 Tudo bem. Informe novamente a *cidade com o estado* ou o *CEP*.\n\nExemplos:\n• Condado Pernambuco\n• Condado PE\n• 55940000",
        opcoes: null
      })
    }

    if (text?.startsWith("edit_cidade_multipla_") && Array.isArray(u._cidadesMultiplasEdit)) {
      const idxEdit = parseInt(text.replace("edit_cidade_multipla_", ""), 10)
      const escolhidaEdit = u._cidadesMultiplasEdit[idxEdit]
      if (escolhidaEdit) {
        delete u._cidadesMultiplasEdit
        return await prepararConfirmacaoCorrecao(from, u, "cidade", escolhidaEdit.cidade, {
          cidade: escolhidaEdit.cidade,
          uf: escolhidaEdit.uf,
          regiao: escolhidaEdit.regiao
        })
      }
    }

    let textoEntrada = text
    if (!textoEntrada && ehAudio) {
      const mediaId = msgObj?.audio?.id || msgObj?.voice?.id
      if (mediaId) {
        const midia = await baixarMidia(mediaId)
        if (midia) {
          if (!u.modoTexto) await enviar(from, "👂 Ouvindo...", null, false)
          textoEntrada = await transcrever(midia.buffer, midia.mimeType, { origem: "editar_cidade" })
        }
      }
    }
    if (!textoEntrada) {
      if (ehAudio) return await responderFalhaAudioCorrecao(from, u)
      return responderComTimer(from, { texto: "📍 *Em qual cidade você mora?*\n\n_Digite a cidade com o estado, por exemplo: Recife Pernambuco, ou informe o CEP com oito dígitos._", opcoes: null })
    }

    let textoCidade = (await extrairCidadeAudio(textoEntrada)).trim()
    if (textoCidade.toUpperCase().startsWith("CEP:")) textoCidade = textoCidade.slice(4).trim()
    const cepRegexEdit = /^\d{5}-?\d{3}$/
    if (cepRegexEdit.test(textoCidade.replace(/\D/g, ""))) {
      try {
        const infoCEP = await buscarPorCEP(textoCidade.replace(/\D/g, ""))
        return await prepararConfirmacaoCorrecao(from, u, "cidade", infoCEP.cidade, {
          cidade: infoCEP.cidade,
          uf: infoCEP.uf,
          regiao: infoCEP.regiao
        })
      } catch (e) {
        return responderComTimer(from, {
          texto: "Não consegui localizar este CEP. Você pode tentar novamente com oito dígitos ou informar a cidade com o estado. Exemplo: Recife Pernambuco.",
          opcoes: null
        })
      }
    }

    // verificar homônimos na edição de cidade
    const locCidadeEdit = await buscarCidadePorNome(textoCidade)
    if (locCidadeEdit?.multiplos && locCidadeEdit.opcoes?.length > 1) {
      const opcoesListaEdit = locCidadeEdit.opcoes.slice(0, 4).map((op, i) => ({
        id: `edit_cidade_multipla_${i}`,
        title: abreviarCidadeBotao(op.cidade, op.uf)
      }))
      u._cidadesMultiplasEdit = locCidadeEdit.opcoes
      if (!u.modoTexto) {
        try {
          const nomesAudio = locCidadeEdit.opcoes.slice(0, 4)
            .map(op => `${op.cidade}, ${estadoPorExtenso(op.uf) || op.uf}`).join("; ")
          const ogg = await gerarAudioAtendente(u.atendente,
            `Encontrei ${numeroPorExtenso(locCidadeEdit.opcoes.length, "feminino")} cidades com esse nome: ${nomesAudio}. Selecione a opção correspondente. Se a sua cidade não aparecer, diga o nome com o estado agora.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 4000))
        } catch (e) { logErro("tts", "Falha áudio cidades múltiplas edição", e) }
      }
      iniciarTimer(from)
      return responderComTimer(from, {
        texto: `●●●●●○ 📍 Etapa 5 de 6 · *CIDADE*\n\n🔍 Encontrei *${locCidadeEdit.opcoes.length} cidades* com esse nome. Qual é a sua?\n\n_Se a sua cidade não aparecer, diga ou digite o nome com o estado._`,
        opcoes: opcoesListaEdit
      })
    }
    if (locCidadeEdit?.cidade) {
      return await prepararConfirmacaoCorrecao(from, u, "cidade", locCidadeEdit.cidade, {
        cidade: locCidadeEdit.cidade,
        uf: locCidadeEdit.uf || u.uf,
        regiao: locCidadeEdit.regiao || u.regiao
      })
    }

    if (!u.modoTexto) {
      try {
        const ogg = await gerarAudioAtendente(u.atendente, `Não encontrei essa cidade. Me diga a cidade junto com o estado, por exemplo Recife Pernambuco, ou informe o CEP com oito dígitos.`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3000))
      } catch (e) { logErro("tts", "Falha áudio cidade não encontrada edição", e) }
    }
    return responderComTimer(from, {
      texto: `📍 Não consegui encontrar essa cidade.\n\nTente informar a *cidade com o estado* ou o *CEP*.\n\nExemplos:\n• Recife Pernambuco\n• Olinda PE\n• 50000000`,
      opcoes: null
    })
  }

  // -- EDITAR_AREA --
  if (u.stage === STAGES.EDITAR_AREA) {
    return pedirCampoCorrecao(from, u, "A área jurídica é definida pela análise do relato. Se ela parecer errada, corrija a descrição do caso com mais detalhes.")
  }

  // -- EDITAR_SITUACAO --
  if (u.stage === STAGES.EDITAR_SITUACAO) {
    let textoEntrada = text
    if (!textoEntrada && ehAudio) {
      const mediaId = msgObj?.audio?.id || msgObj?.voice?.id
      if (mediaId) {
        const midia = await baixarMidia(mediaId)
        if (midia) {
          if (!u.modoTexto) await enviar(from, "👂 Ouvindo...", null, false)
          textoEntrada = await transcrever(midia.buffer, midia.mimeType, { origem: "editar_situacao" })
        }
      }
    }
    if (!textoEntrada) {
      if (ehAudio) return await responderFalhaAudioCorrecao(from, u)
      return responderComTimer(from, { texto: "📌 *Qual é a situação correta?*\n\n_Descreva brevemente ou envie um áudio._", opcoes: null })
    }
    const situacaoIA = await extrairCampoCorrecaoIA("situacao", textoEntrada, u)
    return await prepararConfirmacaoCorrecao(from, u, "situacao", situacaoIA)
  }

  // -- EDITAR_DETALHE --
  if (u.stage === STAGES.EDITAR_DETALHE) {
    let textoEntrada = text
    if (!textoEntrada && ehAudio) {
      const mediaId = msgObj?.audio?.id || msgObj?.voice?.id
      if (mediaId) {
        const midia = await baixarMidia(mediaId)
        if (midia) {
          if (!u.modoTexto) await enviar(from, "👂 Ouvindo...", null, false)
          textoEntrada = await transcrever(midia.buffer, midia.mimeType, { origem: "editar_detalhe" })
        }
      }
    }
    if (!textoEntrada) {
      if (ehAudio) return await responderFalhaAudioCorrecao(from, u)
      return responderComTimer(from, { texto: "🔎 *Qual é o detalhe correto?*\n\n_Digite ou envie um áudio._", opcoes: null })
    }
    const detalheIA = await extrairCampoCorrecaoIA("detalhe", textoEntrada, u)
    return await prepararConfirmacaoCorrecao(from, u, "detalhe", detalheIA)
  }

  // -- EDITAR_URGENCIA --
  if (u.stage === STAGES.EDITAR_URGENCIA) {
    const lower = (text || "").toLowerCase()
    if (text === "eu_alta" || lower.includes("alta") || lower.includes("urgent")) {
      u.urgencia = "alta"
      u.semReceber = true
      return responderComTimer(from, await voltarParaConfirmacao(from, u))
    }
    if (text === "eu_normal" || lower.includes("moder") || lower.includes("normal") || lower.includes("aguard")) {
      u.urgencia = "normal"
      u.semReceber = false
      return responderComTimer(from, await voltarParaConfirmacao(from, u))
    }
    if (text === "eu_baixa" || lower.includes("baix") || lower.includes("sem pres")) {
      u.urgencia = "baixa"
      u.semReceber = false
      return responderComTimer(from, await voltarParaConfirmacao(from, u))
    }
    return responderComTimer(from, {
      texto: "⚡ *Qual é o nível de urgência correto?*",
      opcoes: [
          { id: "eu_alta",   title: "🔴 Alta" },
          { id: "eu_normal", title: "🟡 Moderada" },
          { id: "eu_baixa",  title: "🟢 Baixa" }
      ]
    })
  }

  // -- EDITAR_DESCRICAO --
  if (u.stage === STAGES.EDITAR_DESCRICAO) {
    let textoEntrada = text
    if (!textoEntrada && ehAudio) {
      const mediaId = msgObj?.audio?.id || msgObj?.voice?.id
      if (mediaId) {
        const midia = await baixarMidia(mediaId)
        if (midia) {
          if (!u.modoTexto) await enviar(from, "👂 Ouvindo...", null, false)
          textoEntrada = await transcrever(midia.buffer, midia.mimeType, { origem: "editar_descricao" })
        }
      }
    }
    if (!textoEntrada) {
      if (ehAudio) return await responderFalhaAudioCorrecao(from, u)
      return responderComTimer(from, { texto: "💬 *Qual é a descrição correta do seu caso?*\n\n_Digite ou envie um áudio com a descrição atualizada._", opcoes: null })
    }

    const consolidado = await consolidarDescricaoCorrecaoIA(u, textoEntrada)
    return await prepararConfirmacaoCorrecao(from, u, "descricao", consolidado.descricao, consolidado)
  }

  // -- CONFIRMAR_CORRECAO_NOME --
  if (u.stage === STAGES.CONFIRMAR_CORRECAO_NOME) {
    if (text === "nome_correcao_confirmar") {
      return await aplicarCorrecaoPendente(from, u)
    }
    let textoEntrada = text
    if (!textoEntrada && ehAudio) {
      const mediaId = msgObj?.audio?.id || msgObj?.voice?.id
      if (mediaId) {
        const midia = await baixarMidia(mediaId)
        if (midia) {
          if (!u.modoTexto) await enviar(from, "👂 Ouvindo...", null, false)
          textoEntrada = await transcrever(midia.buffer, midia.mimeType, { origem: "confirmar_correcao_nome" })
        }
      }
    }
    const subcampoNome = u._correcaoPendenteSubcampo || "nome"
    const ehNomeContato = subcampoNome === "nomeContato"
    if (!textoEntrada) {
      if (ehAudio) return await responderFalhaAudioCorrecao(from, u)
      const nomeAtual = u._correcaoPendenteValor || ""
      const textoReapres = ehNomeContato
        ? textoConfirmarNomeRepresentante(nomeAtual)
        : textoConfirmarNomePessoaAtendida(nomeAtual)
      return responderComTimer(from, {
        texto: textoReapres,
        opcoes: [{ id: "nome_correcao_confirmar", title: "✅ Sim, está certo" }]
      })
    }
    const nomeLimpo = await extrairNomeAudio(textoEntrada)
    const validacaoNomeCorr = nomeLimpo ? ehNomeAparente(nomeLimpo, textoEntrada) : false
    if (!nomeLimpo || validacaoNomeCorr === false) {
      return responderComTimer(from, { texto: "Pode me dizer só o nome completo, por favor?", opcoes: null })
    }
    if (validacaoNomeCorr === "incompleto") {
      return responderComTimer(from, { texto: "Preciso do nome completo. Por favor, informe também o sobrenome.", opcoes: null })
    }
    u._correcaoPendenteValor = nomeLimpo
    iniciarTimer(from)
    const textoReconf = ehNomeContato
      ? textoConfirmarNomeRepresentante(nomeLimpo)
      : textoConfirmarNomePessoaAtendida(nomeLimpo)
    const audioReconf = ehNomeContato
      ? audioConfirmarNomeRepresentante(nomeLimpo)
      : audioConfirmarNomePessoaAtendida(nomeLimpo)
    if (!u.modoTexto) {
      try {
        const ogg = await gerarAudioAtendente(u.atendente, audioReconf)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3500))
      } catch (e) { logErro("tts", "Falha áudio reconfirmar nome correção", e) }
    }
    return responderComTimer(from, {
      texto: textoReconf,
      opcoes: [{ id: "nome_correcao_confirmar", title: "✅ Sim, está certo" }]
    })
  }

  // -- CONFIRMAR_CORRECAO_CIDADE --
  if (u.stage === STAGES.CONFIRMAR_CORRECAO_CIDADE) {
    if (text === "cidade_correcao_confirmar") {
      return await aplicarCorrecaoPendente(from, u)
    }
    let textoEntrada = text
    if (!textoEntrada && ehAudio) {
      const mediaId = msgObj?.audio?.id || msgObj?.voice?.id
      if (mediaId) {
        const midia = await baixarMidia(mediaId)
        if (midia) {
          if (!u.modoTexto) await enviar(from, "👂 Ouvindo...", null, false)
          textoEntrada = await transcrever(midia.buffer, midia.mimeType, { origem: "confirmar_correcao_cidade" })
        }
      }
    }
    if (!textoEntrada) {
      if (ehAudio) return await responderFalhaAudioCorrecao(from, u)
      const cidadeAtual = u._correcaoPendenteExtra?.cidade || u._correcaoPendenteValor || ""
      const ufAtual = u._correcaoPendenteExtra?.uf || ""
      const regiaoAtual = u._correcaoPendenteExtra?.regiao || ""
      const textoExib = `${cidadeAtual}${ufAtual ? `, ${ufAtual}` : ""}${regiaoAtual ? ` (${regiaoAtual})` : ""}`
      return responderComTimer(from, {
        texto: `●●●●●○ 📍 Etapa 5 de 6 · *CIDADE*\n\n✅ Localizei: *${textoExib}*.\n\nEstá correto? Se não estiver, é só me dizer a cidade certa agora. Pode falar ou digitar. 🎙️`,
        opcoes: [{ id: "cidade_correcao_confirmar", title: "✅ Sim, está certo" }]
      })
    }
    let textoCidade = (await extrairCidadeAudio(textoEntrada)).trim()
    if (textoCidade.toUpperCase().startsWith("CEP:")) textoCidade = textoCidade.slice(4).trim()
    const cepRegexConf = /^\d{5}-?\d{3}$/
    if (cepRegexConf.test(textoCidade.replace(/\D/g, ""))) {
      try {
        const infoCEP = await buscarPorCEP(textoCidade.replace(/\D/g, ""))
        return await prepararConfirmacaoCorrecao(from, u, "cidade", infoCEP.cidade, {
          cidade: infoCEP.cidade, uf: infoCEP.uf, regiao: infoCEP.regiao
        })
      } catch (e) {
        return responderComTimer(from, {
          texto: "Não consegui localizar este CEP. Tente novamente com oito dígitos ou informe a cidade com o estado.",
          opcoes: null
        })
      }
    }
    const locConf = await buscarCidadePorNome(textoCidade)
    if (locConf?.multiplos && locConf.opcoes?.length > 1) {
      u._cidadesMultiplasEdit = locConf.opcoes
      setStage(u, STAGES.EDITAR_CIDADE)
      iniciarTimer(from)
      const opcoesLista = locConf.opcoes.slice(0, 4).map((op, i) => ({
        id: `edit_cidade_multipla_${i}`,
        title: abreviarCidadeBotao(op.cidade, op.uf)
      }))
      if (!u.modoTexto) {
        try {
          const nomesAudio = locConf.opcoes.slice(0, 4).map(op => `${op.cidade}, ${estadoPorExtenso(op.uf) || op.uf}`).join("; ")
          const ogg = await gerarAudioAtendente(u.atendente,
            `Encontrei ${numeroPorExtenso(locConf.opcoes.length, "feminino")} cidades com esse nome: ${nomesAudio}. Selecione a opção correspondente.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 4000))
        } catch (e) { logErro("tts", "Falha áudio cidades múltiplas confirmar correção cidade", e) }
      }
      return responderComTimer(from, {
        texto: `●●●●●○ 📍 Etapa 5 de 6 · *CIDADE*\n\n🔍 Encontrei *${locConf.opcoes.length} cidades* com esse nome. Qual é a sua?\n\n_Se a sua cidade não aparecer, diga ou digite o nome com o estado._`,
        opcoes: opcoesLista
      })
    }
    if (locConf?.cidade) {
      return await prepararConfirmacaoCorrecao(from, u, "cidade", locConf.cidade, {
        cidade: locConf.cidade, uf: locConf.uf || u.uf, regiao: locConf.regiao || u.regiao
      })
    }
    if (!u.modoTexto) {
      try {
        const ogg = await gerarAudioAtendente(u.atendente, "Não encontrei essa cidade. Me diga a cidade junto com o estado, por exemplo Recife Pernambuco, ou informe o CEP.")
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3000))
      } catch (e) { logErro("tts", "Falha áudio cidade não encontrada confirmar correção", e) }
    }
    return responderComTimer(from, {
      texto: `📍 Não consegui encontrar essa cidade.\n\nTente informar a *cidade com o estado* ou o *CEP*.\n\nExemplos:\n• Recife Pernambuco\n• Olinda PE\n• 50000000`,
      opcoes: null
    })
  }
  if (u.stage === STAGES.AGENDAMENTO_HORARIO) {
    if (text === "m_inicio") {
      setStage(u, STAGES.CLIENTE)
      iniciarTimer(from)
      return await menuClienteComAudio(from, u)
    }
    if (text === "adv_urg") return await iniciarMensagemUrgenteCliente(from, u)

    if (text === "slots_proxima_pagina") {
      u._paginaSlots = (u._paginaSlots || 0) + 1
      return await iniciarAgendamento(from, u)
    }

    if (text === "slots_pagina_anterior") {
      u._paginaSlots = Math.max(0, (u._paginaSlots || 1) - 1)
      return await iniciarAgendamento(from, u)
    }

    if (text && text.startsWith("slot_")) {
      const idx = parseInt(text.replace("slot_", ""))
      const slots = (u._slotsDisponiveis || []).map(s => new Date(s))
      const slotEscolhido = slots[idx]

      if (!slotEscolhido) {
        return await iniciarAgendamento(from, u)
      }

      u._slotEscolhido = slotEscolhido.toISOString()
      setStage(u, STAGES.AGENDAMENTO_DURACAO)
      iniciarTimer(from)

      const primeiroNome = primeiroNomeCliente(u) || "você"
      const slotFormatado = formatarSlotAudio(slotEscolhido)
      const telaDuracao = telaDuracaoConsulta({
        dataHora: formatarSlot(slotEscolhido),
        dataHoraAudio: slotFormatado,
        primeiroNome
      })
      await enviarAudioModoVoz(from, u, gerarAudioDaTela(telaDuracao), "duração agendamento")
      return telaDuracao
    }
    iniciarTimer(from)
    return await iniciarAgendamento(from, u)
  }

  // -- AGENDAMENTO_DURACAO --
  if (u.stage === STAGES.AGENDAMENTO_DURACAO) {
    if (text === "m_inicio") {
      setStage(u, STAGES.CLIENTE)
      iniciarTimer(from)
      return await menuClienteComAudio(from, u)
    }
    if (text === "adv_urg") return await iniciarMensagemUrgenteCliente(from, u)

    const duracoes = { dur_20: 20, dur_30: 30, dur_45: 45, dur_60: 60 }
    const duracao = duracoes[text]

    if (!duracao || !u._slotEscolhido) {
      setStage(u, STAGES.AGENDAMENTO_HORARIO)
      return await iniciarAgendamento(from, u)
    }

    u._duracaoEscolhida = duracao
    setStage(u, STAGES.AGENDAMENTO_CONFIRMAR)
    iniciarTimer(from)

    const slot = new Date(u._slotEscolhido)
    const primeiroNome = primeiroNomeCliente(u) || "você"
    const duracaoLabel = duracao === 60 ? "1 hora" : `${duracao} minutos`

    const telaConfirmacao = telaConfirmacaoConsulta({
      dataHora: formatarSlot(slot),
      dataHoraAudio: formatarSlotAudio(slot),
      duracao: duracaoLabel,
      nome: u.nome || "Não informado",
      numeroCaso: u.numeroCaso || "Não informado"
    })
    await enviarAudioModoVoz(from, u, gerarAudioDaTela(telaConfirmacao), "confirmar agendamento")
    return telaConfirmacao
  }

  // -- AGENDAMENTO_CONFIRMAR --
  if (u.stage === STAGES.AGENDAMENTO_CONFIRMAR) {
    if (text === "m_inicio") {
      setStage(u, STAGES.CLIENTE)
      iniciarTimer(from)
      return await menuClienteComAudio(from, u)
    }
    if (text === "adv_urg") return await iniciarMensagemUrgenteCliente(from, u)

    if (text === "ag_outro_horario") {
      return await iniciarAgendamento(from, u)
    }

    if (text === "ag_confirmar") {
      const slot = new Date(u._slotEscolhido)
      const duracao = u._duracaoEscolhida || 30
      const primeiroNome = primeiroNomeCliente(u) || "você"
      const duracaoLabel = duracao === 60 ? "1 hora" : `${duracao} minutos`

      let eventoId = null
      try {
        eventoId = await criarEventoConsulta(u, slot, duracao, { origem: "client" })
        if (eventoId) await atualizarEstadoConsultaUsuario(u)
        if (u.negocioId) {
          await hsCriarNota(u.contatoId, "CONSULTA AGENDADA",
            `${u.nome} agendou consulta para ${formatarSlot(slot)} (${duracaoLabel}).\nCaso: ${u.numeroCaso} | Área: ${u.area}`)
          notificarAgendamento(u, slot, duracao, u.negocioId).catch(e => console.error("[notif] agendamento:", e.message))
        }
      } catch (e) {
        logErro("calendar", "Erro ao criar evento: " + e.message)
      }

      if (!eventoId) {
        delete u._slotsDisponiveis
        delete u._slotEscolhido
        delete u._duracaoEscolhida
        setStage(u, STAGES.CLIENTE)
        iniciarTimer(from)
        const telaFalha = telaFalhaAgendamento()
        await enviarAudioModoVoz(from, u, gerarAudioDaTela(telaFalha), "falha agendamento")
        return telaFalha
      }

      // Limpa dados temporários
      delete u._slotsDisponiveis
      delete u._slotEscolhido
      delete u._duracaoEscolhida
      setStage(u, STAGES.CLIENTE)
      iniciarTimer(from)

      const telaAgendada = telaAgendamentoConfirmado({
        dataHora: formatarSlot(slot),
        dataHoraAudio: formatarSlotAudio(slot),
        duracao: duracaoLabel,
        numeroCaso: u.numeroCaso,
        primeiroNome
      })
      await enviarAudioModoVoz(from, u, gerarAudioDaTela(telaAgendada), "agendamento confirmado")

      return await enviarTelaImagemOuTexto(
        from,
        IMAGEM_ADV_AGENDADO_URL,
        telaAgendada.texto,
        gerarBotoesDaTela(telaAgendada)
      )
    }

    iniciarTimer(from)
    return await iniciarAgendamento(from, u)
  }

  return null
}

const processarColetaLegada = criarLegacyIntakeRouter({
  STAGES,
  REGIOES,
  UF_MAP,
  extrairNomeDaCorrecaoExplicita,
  formatarNome,
  limparTextoSomenteLetras,
  ehNomeAparente,
  responderComTimer,
  prepararConfirmacaoEntrada,
  iniciarTimer,
  telaRegioes,
  setStage,
  telaUFsRegiao,
  formatarCidade,
  deveOferecerExplicarTudo,
  prepararOfertaExplicarTudoFinal,
  entrarEtapaDescricao,
  telaDescreverCaso,
  iniciarConfirmacaoDescricao
})

const processarPosAudio = criarPostAudioRouter({
  STAGES,
  executarRecomecoFluxo,
  executarEncerramentoFluxo,
  retomarUltimaPergunta,
  iniciarTimer,
  responderComTimer,
  telaAudioNoFluxo,
  aplicarSugestaoFluxoOutro,
  setStage,
  sincronizarNegocio,
  telaDescreverCaso
})

const processarNavegacaoCliente = criarClientNavigationRouter({
  podeMostrarMenuCliente,
  setStage,
  iniciarTimer,
  getPrimeiroNomeRetomada,
  iniciarFluxoRelatoLivre,
  menuClienteComAudio,
  abrirNovoCasoCliente
})

async function processarInterno(from, nomeWA, text, msgObj, u) {
  text = sanitizarTextoEntrada(text)
  u.ultimaMsg = Date.now()
  u.modoDigitando = false
  u.temCadastroCompleto = Boolean(u.temCadastroCompleto || podeMostrarMenuCliente(u))
  limparTimer(u)
  limparTimerIncentivoDescricao(u)

  const STAGES_RETOMADA_IGNORAR = [
    STAGES.RETOMADA_AUTOMATICA,
    STAGES.RETOMADA_MENU,
    STAGES.RESUMO_RETOMADA,
    STAGES.ACOLHIMENTO,
    STAGES.AUDIO_AGUARDANDO,
    STAGES.AUDIO_CONFIRMAR_TRANSCRICAO,
    STAGES.AUDIO_CONFIRMAR_AREA_CANAL,
    STAGES.ASSESSORIA_INICIAL
  ]
  if (u.stage && !STAGES_RETOMADA_IGNORAR.includes(u.stage) && !u._stageRetomadaOriginal) {
    u._stageRetomadaOriginal = u.stage
  }

  if (u._fluxoEncerrado) {
    logDebug(`[FLUXO_MORTO] Ignorando interação antiga e reiniciando entrada | USER: ${sanitizarTextoEntrada(from) || "-"}`)

    const telefone = getTelefoneContato(from, u)
    const contatoHS = await hsBuscarPorPhone(telefone)
    const temNoHS = contatoHS?.id != null

    if (((u.contatoId || u.negocioId) || temNoHS) && !u.numeroCaso) {
      if (temNoHS && !u.contatoId) u.contatoId = contatoHS.id
      u._fluxoEncerrado = false
      u.jaOfereceuRetomada = false
      if (!usuarioTemProgressoParaRetomada(u)) {
        u.aguardandoRetomada = false
        u._retomadaEhLeadFrio = false
        u._stageRetomadaOriginal = null
        u.etapa = null
        u.lastPergunta = null
        u.lastPerguntaPayload = null
        u.aguardandoResposta = false
        setStage(u, STAGES.ACOLHIMENTO)
        return processarInterno(from, nomeWA, "", { type: "text", text: { body: "" } }, u)
      }
      const _stagePreservado = u._stageRetomadaOriginal || null
      setStage(u, STAGES.RETOMADA_AUTOMATICA)
      u._retomadaEhLeadFrio = false
      u._stageRetomadaOriginal = _stagePreservado || obterStageRetomadaOriginal(u)
      u.atendente = u.atendente || sortearAtendente()
      return processarInterno(from, nomeWA, "", { type: "text", text: { body: "" } }, u)
    }

    if (u.numeroCaso) {
      u._fluxoEncerrado = false
      limparTimer(u)
      return await menuClienteComAudio(from, u)
    }

    prepararNovaEntradaAposFluxoEncerrado(u, nomeWA)
    return processarInterno(from, nomeWA, "", { type: "text", text: { body: "" } }, u)
  }

  const tipo    = sanitizarTextoEntrada(msgObj?.type)
  const ehAudio = tipo === "audio"
  const ehDoc   = tipo === "document" || tipo === "image"

  const buttonId = sanitizarTextoEntrada(msgObj?.interactive?.button_reply?.id || msgObj?.interactive?.list_reply?.id || "")
  const textoRetomada = sanitizarTextoEntrada(msgObj?.text?.body || msgObj?.interactive?.button_reply?.title || msgObj?.interactive?.list_reply?.title || text).toLowerCase()
  const usuarioRespondendoAgora = Boolean(u.aguardandoResposta) && Boolean(text || buttonId || ehAudio || ehDoc)
  const ctx = criarCtx({ from, nomeWA, text, msgObj, buttonId, tipo, ehAudio, ehDoc, timestamp: Date.now() })

  if (u._casoNaoReconhecido && u.numeroCaso) {
    return {
      texto: `⚠️ Este atendimento ficou marcado como *não reconhecido*.\n\nNossa equipe foi notificada para verificar o ocorrido. Você não precisa dar continuidade por aqui agora.`,
      opcoes: null,
      registrarPergunta: false
    }
  }

  if (
    u._aguardandoReconhecimentoTerceiro &&
    u.numeroCaso &&
    !["terceiro_reconhece", "terceiro_nao_reconhece"].includes(buttonId || text) &&
    !normalizarTextoGatilho(text).includes("reconhe")
  ) {
    iniciarTimer(from)
    return {
      texto: `📄 *Atendimento aberto para você*\n\nAntes de acessar o menu do cliente, preciso confirmar uma coisa:\n\nVocê reconhece este atendimento?`,
      opcoes: [
        { id: "terceiro_reconhece", title: "✅ Reconheço" },
        { id: "terceiro_nao_reconhece", title: "❌ Não reconheço" }
      ]
    }
  }

  if (u._casoAnteriorCliente && !u.numeroCaso && !ehAudio && !ehDoc && (buttonId === "terceiro_cancelar_menu" || text === "terceiro_cancelar_menu")) {
    const menuAnterior = await cancelarNovoCasoClienteEVoltarMenu(from, u, "cancelado_pelo_menu")
    if (menuAnterior) return menuAnterior
  }

  // Cenário B: novo cliente (sem caso anterior) que abriu atendimento para terceiro e clicou em cancelar
  if (!u._casoAnteriorCliente && !u.numeroCaso && !ehAudio && !ehDoc && (buttonId === "terceiro_cancelar_menu" || text === "terceiro_cancelar_menu")) {
    limparTimer(u)
    if (!u.leadIncompletoCapturado) {
      await capturarLeadIncompleto(from, u).catch(e =>
        logErroHubSpot(e, {
          operation: "cancelarTerceiroNovo",
          contactId: u?.contatoId,
          dealId: u?.negocioId
        })
      )
    }
    limparDadosCasoAtual(u, { marcarFluxoEncerrado: true })
    await enviarAudioModoVoz(from, u, "Tudo bem. Cancelei o atendimento. Quando quiser começar de novo, é só me chamar.", "cancelar terceiro novo")
    return {
      texto: `✅ *Atendimento cancelado.*\n\nQuando quiser começar um novo atendimento, é só me chamar aqui. 😊`,
      opcoes: null
    }
  }

  if (u._casoAnteriorCliente && !u.numeroCaso && !ehAudio && !ehDoc && (buttonId === "m_inicio" || ehMensagemEntradaGlobal(text))) {
    const menuAnterior = await cancelarNovoCasoClienteEVoltarMenu(from, u, "menu_ou_saudacao")
    if (menuAnterior) return menuAnterior
  }

  if (!ehAudio && !ehDoc && !u.numeroCaso) {
    if (text === "pre_nome_informar") {
      iniciarTimer(from)
      if (u.atendimentoParaTerceiro) {
        // Se nomeContato ainda não foi coletado, pedir antes do nome do atendido
        if (!u.nomeContato) {
          setStage(u, STAGES.ACOLHIMENTO_NOME_CONTATO)
          return await responderTelaComAudio(
            from,
            u,
            {
              texto: textoSolicitarNomeRepresentante(),
              opcoes: null
            },
            audioSolicitarNomeRepresentante(),
            "pre atendimento pede nome contato"
          )
        }
        setStage(u, STAGES.ACOLHIMENTO_NOME)
        return await responderTelaComAudio(
          from,
          u,
          {
            texto: textoSolicitarNomePessoaAtendida((u.nomeContato || "").split(" ")[0] || u.nomeContato),
            opcoes: null
          },
          audioSolicitarNomePessoaAtendida((u.nomeContato || "").split(" ")[0] || u.nomeContato),
          "pre atendimento nome terceiro"
        )
      }
      return await perguntarNome(u)
    }
    if (text === "pre_mim_continuar") {
      u.atendimentoParaTerceiro = false
      u.telefoneEhDoCliente = null
      u.relacaoComAtendido = null
      u._nomeTitularOrigem = null
      u._nomeTemp = null
      setStage(u, STAGES.ACOLHIMENTO_NOME)
      iniciarTimer(from)
      return await responderTelaComAudio(
        from,
        u,
        {
          texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n🙋 *Atendimento para você*\n\nTudo bem. Vou registrar o atendimento no seu nome.\n\nQual é o seu *nome completo*?`,
          opcoes: null
        },
        "Tudo bem. Vou registrar o atendimento no seu nome. Qual é o seu nome completo?",
        "pre atendimento para mim"
      )
    }
    if (text === "pre_cidade_informar") {
      iniciarTimer(from)
      return await flowAcolhimentoCidade(u, { from })
    }
    if (text === "pre_terceiro_continuar") {
      u.atendimentoParaTerceiro = true
      u.telefoneEhDoCliente = false
      u._nomeTitularOrigem = "atendido"
      setStage(u, STAGES.ACOLHIMENTO_NOME_CONTATO)
      iniciarTimer(from)
      return await responderTelaComAudio(
        from,
        u,
        {
          texto: textoSolicitarNomeRepresentante(),
          opcoes: null
        },
        audioSolicitarNomeRepresentante(),
        "pre atendimento terceiro pede nome contato"
      )
    }
    // Handlers para tela de esclarecimento quando o usuário está confuso
    if (text === "confuso_registrar") {
      iniciarTimer(from)
      setStage(u, STAGES.AUDIO_AGUARDANDO)
      if (!u.atendente) u.atendente = sortearAtendente()
      try {
        const ogg = await gerarAudioAtendente(u.atendente,
          `Certo! Me conte o que aconteceu. Pode falar em áudio ou digitar. Eu vou organizar tudo para o advogado.`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3000))
      } catch (e) { logErro("tts", "Falha áudio iniciar relato confuso", e) }
      return {
        texto: `Me conte sua situação. 😊\n\nPode falar em áudio 🎙️ ou digitar ✍️, do jeito que for mais fácil pra você.`,
        opcoes: null
      }
    }
    if (text === "confuso_exemplos") {
      iniciarTimer(from)
      const exemplos = `Aqui estão alguns exemplos curtos que ajudam a registrar bem o caso:\n\n• Meu benefício do INSS foi cortado há 2 meses\n• É sobre o caso da minha mãe: cancelaram o benefício dela\n• Fui demitido sem receber aviso e FGTS\n• Preciso saber se vocês atendem em minha cidade\n\nSe um desses descreve seu caso, clique em \"Registrar com resumo\" para eu abrir o atendimento com esse texto, ou digite mais detalhes.`
      const exemplosAudio = `Alguns exemplos: meu benefício do INSS foi cortado há dois meses. É sobre o caso da minha mãe: cancelaram o benefício dela. Fui demitido sem receber aviso e FGTS. Preciso saber se vocês atendem na minha cidade. Se algum desses descreve seu caso, escolha registrar com resumo ou digite mais detalhes.`
      return await responderTelaComAudio(from, u, { texto: exemplos, opcoes: [ { id: "confuso_registrar_resumo", title: "📄 Registrar com resumo" }, { id: "confuso_back", title: "🔙 Voltar" } ] }, exemplosAudio, "exemplos confuso")
    }
    if (text === "confuso_registrar_resumo") {
      iniciarTimer(from)
      const resumo = u._ultimoTextoConfuso || u._audioCanalTranscricao || text || ""
      if (!resumo || resumo.replace(/\s+/g, "").length < 3) {
        return responderComTimer(from, { texto: `Não encontrei um resumo salvo. Por favor, digite uma frase curta que resuma o caso.` , opcoes: null })
      }
      // aceitar resumo e seguir com classificação/assessoria
      u._audioCanalTranscricao = resumo
      u._relatoAntecipadoPreAtendimento = normalizarTextoCRM(resumo)
      try {
        const classificacao = await classificarAreaAudio(u._audioCanalTranscricao)
        aplicarClassificacaoJuridica(u, classificacao)
      } catch (e) { logErro('classificar', 'erro ao classificar resumo', e) }
      return await flowAssessoriaInicial(u, { from, origem: "texto" })
    }
    if (text === "confuso_back") {
      iniciarTimer(from)
      return await telaEsclarecimentoConfuso(from, u)
    }
    if (text === "confuso_duvida") {
      iniciarTimer(from)
      const resposta = respostaCurtaDuvidaPreAtendimento(text)
      return responderComTimer(from, { texto: `💬 ${resposta}\n\nSe quiser registrar um caso, clique em *Registrar caso*.`, opcoes: [ { id: "confuso_registrar", title: "📄 Registrar caso" } ] })
    }
    if (text === "confuso_terceiro") {
      u.atendimentoParaTerceiro = true
      u.telefoneEhDoCliente = false
      u._nomeTitularOrigem = "atendido"
      setStage(u, STAGES.ACOLHIMENTO_NOME_CONTATO)
      iniciarTimer(from)
      return await responderTelaComAudio(
        from,
        u,
        {
          texto: textoSolicitarNomeRepresentante(),
          opcoes: null
        },
        audioSolicitarNomeRepresentante(),
        "pre atendimento terceiro pede nome contato"
      )
    }
    if (text === "confuso_humano") {
      // sinaliza pedido de humano e coleta dados mínimos
      u._solicitouHumano = true
      setStage(u, STAGES.ACOLHIMENTO_NOME)
      iniciarTimer(from)
      return await responderTelaComAudio(
        from,
        u,
        {
          texto: `🆘 Vamos encaminhar para um atendente humano. Antes disso, preciso anotar um nome e telefone rápido para direcionar o pedido. Qual é seu *nome completo*?`,
          opcoes: null
        },
        "Vamos encaminhar para um atendente humano. Antes disso, preciso anotar um nome e telefone rápido. Qual é seu nome completo?",
        "pedido humano iniciar"
      )
    }
  }

  if (!ehAudio && !ehDoc && !u.numeroCaso && (buttonId === "m_inicio" || ehMensagemEntradaGlobal(text))) {
    if (await tentarRestaurarClienteHubSpotParaMenu(from, u)) {
      return await menuClienteComAudio(from, u)
    }
  }

  const botoesClienteComCaso = new Set([
    "m_docs",
    "docs_pedido_admin",
    "m_status",
    "m_adv",
    "dir_agendar",
    "adv_ag",
    "adv_urg",
    "adv_agendar_ligacao",
    "cliente_cancelar_consulta",
    "cliente_cancelar_consulta_sim"
  ])
  if (!ehAudio && !ehDoc && !u.numeroCaso && botoesClienteComCaso.has(buttonId || text)) {
    await tentarRestaurarClienteHubSpotParaMenu(from, u)
  }

  if (ehAudio && !ehDoc && ![STAGES.AUDIO_AGUARDANDO, STAGES.AUDIO_PROCESSANDO].includes(u.stage)) {
    const respostaEncerrarAudio = await detectarEncerramentoPorAudio(from, u, msgObj, tipo)
    if (respostaEncerrarAudio) return respostaEncerrarAudio
  }
  const entradaPrioritariaRetomadaMenu = buttonId || text
  const devePriorizarHandlerRetomadaMenu = (
    u.stage === STAGES.RETOMADA_MENU &&
    ["rm_continuar", "rm_recomecar", "m_encerrar"].includes(entradaPrioritariaRetomadaMenu)
  )

  logContextoExecucao({ from: ctx.from, stage: u.stage, flow: "processar", msg: ctx.text })

  migrarFluxoAntigoParaRelatoLivre(u)
  if (u.numeroCaso && ehStageFluxoAntigo(u.stage)) {
    logDebug(`[LEGADO_CLIENTE] ${u.stage} -> ${STAGES.CLIENTE} | USER: ${u._numero || "-"}`)
    setStage(u, STAGES.CLIENTE)
    salvarEtapa(u._numero, STAGES.AUDIO_AGUARDANDO)
    return await menuClienteComAudio(from, u)
  }

  if (!devePriorizarHandlerRetomadaMenu && [STAGES.RETOMADA_AUTOMATICA, STAGES.RETOMADA_MENU].includes(u.stage)) {
    iniciarTimer(from)
    if (u.lastPerguntaPayload) return u.lastPerguntaPayload
    const flowFn = flowMap[u.stage]
    if (flowFn) {
      const resultado = await flowFn(u, ctx)
      if (resultado) return resultado
    }
    return null
  }

  if (!ehAudio && !ehDoc && ehMensagemEntradaGlobal(text)) {
    // Estados onde saudações devem ser bloqueadas (estados intermediários)
    const estadosBloqueioSaudacao = [
      STAGES.ACOLHIMENTO_PARA_QUEM,
      STAGES.ACOLHIMENTO_NOME,
      STAGES.ACOLHIMENTO_NOME_CONTATO,
      STAGES.ACOLHIMENTO_CONFIRMA_NOME_CONTATO,
      STAGES.ACOLHIMENTO_CONFIRMA_NOME,
      STAGES.ACOLHIMENTO_CONFIRMA_TITULAR_NOME,
      STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP,
      STAGES.ACOLHIMENTO_CIDADE,
      STAGES.ACOLHIMENTO_CEP,
      STAGES.ENTENDIMENTO_INICIAL,
      STAGES.DIRECIONAMENTO,
      STAGES.NOME,
      STAGES.CIDADE,
      STAGES.DESCRICAO_CASO,
      STAGES.CONFIRMACAO,
      STAGES.COLETA_NOME,
      STAGES.COLETA_REGIAO,
      STAGES.COLETA_UF,
      STAGES.COLETA_CIDADE,
      STAGES.COLETA_CIDADE_REGIAO,
      STAGES.COLETA_CONTRIB,
      STAGES.COLETA_CONTRIB_REGIAO,
      STAGES.COLETA_CONTRIB_REGIAO_V2,
      STAGES.COLETA_BENEF,
      STAGES.COLETA_BENEF_REGIAO_V2,
      STAGES.COLETA_VERIF_TEL,
      STAGES.COLETA_TEL_OUTRO,
      STAGES.COLETA_TEL_WPP,
      STAGES.COLETA_TEL_WPP_CONTATO,
      STAGES.GATILHO,
      STAGES.URGENCIA,
      STAGES.INSS_MENU,
      STAGES.INSS_NOVO,
      STAGES.INSS_NEG_TIPO,
      STAGES.INSS_CORT_TIPO,
      STAGES.INSS_APOS,
      STAGES.INSS_BPC,
      STAGES.INSS_INC,
      STAGES.INSS_DEP,
      STAGES.INSS_OUT,
      STAGES.INSS_JA,
      STAGES.INSS_NEG_QUANDO,
      STAGES.INSS_CORT_MOT,
      STAGES.INSS_CORT_REC,
      STAGES.INSS_CORT_QDO,
      STAGES.TRAB_MENU,
      STAGES.TRAB_DEM_TIPO,
      STAGES.TRAB_DEM_VERB,
      STAGES.TRAB_DEM_QDO,
      STAGES.TRAB_DIR_TIPO,
      STAGES.TRAB_DIR_PEND,
      STAGES.TRAB_ACID_AF,
      STAGES.TRAB_ASS_S,
      STAGES.TRAB_ASS_PROV,
      STAGES.TRAB_OUT_DESC,
      STAGES.OUTROS_MENU,
      STAGES.OUT_CONS_TIPO,
      STAGES.OUT_REV_TIPO,
      STAGES.OUT_DESC,
      STAGES.AGUARDANDO_URGENTE,
      STAGES.URGENTE_AUDIO_CONFIRMA,
      STAGES.URGENTE_AUDIO_ERRO_TRANSCRICAO,
      STAGES.COLETA_DESC,
      STAGES.COLETA_DESC_AUDIO,
      STAGES.DESC_CONFIRMA,
      STAGES.DESC_ERRO_TRANSCRICAO,
      STAGES.SUGESTAO_FLUXO_OUTRO,
      STAGES.EXPLICAR_TUDO_OFERTA,
      STAGES.AUDIO_FLUXO_CONFIRMA,
      STAGES.AUDIO_CONFIRMAR_DADOS,
      STAGES.CONFIRMAR_ENTRADA,
      STAGES.MENU_CORRECAO,
      STAGES.CORRIGIR_VALOR,
      STAGES.CORRIGIR_UF,
      STAGES.CORRIGIR_SEL,
      STAGES.INICIO_RETORNO,
      STAGES.NOVO_CASO_CONFIRMA,
      STAGES.REVALIDA_NOME,
      STAGES.REVALIDA_CIDADE
    ]

    if (estadosBloqueioSaudacao.includes(u.stage)) {
      logDebug("[BLOQUEIO OI] usuário em fluxo ativo:", u.stage)
      iniciarTimer(from)
      return reapresentarPerguntaAtual(u)
    }

    if ([STAGES.RETOMADA_AUTOMATICA, STAGES.RETOMADA_MENU, STAGES.RESUMO_ATENDIMENTO, STAGES.RESUMO_RETOMADA].includes(u.stage)) {
      iniciarTimer(from)
      if (u.lastPerguntaPayload) return u.lastPerguntaPayload
      const flowRetomada = flowMap[u.stage]
      if (flowRetomada) return flowRetomada(u, ctx)
    }

    if (u.stage && ![STAGES.INICIO, STAGES.CLIENTE].includes(u.stage) && u.lastPerguntaPayload) {
      iniciarTimer(from)
      return u.lastPerguntaPayload
    }
  }

  // -- Detecção global de encerramento por texto livre ----------------------
  // Funciona em qualquer stage, exceto campos de texto livre e clientes já cadastrados.
  // Clientes cadastrados (numeroCaso) têm tratamento próprio dentro do stage "cliente".
  if (text && !ehAudio && !ehDoc && !u.numeroCaso && !stageAceitaTextoLivre(u.stage)) {
    const lowerEnc = text.toLowerCase()
    const reEncerrar = /^(encerr|tchau|obrigad|valeu|flw|vlw|ate\s*(logo|mais|breve)|por\s*hoje|finaliz|nao\s*(quero|preciso)|pode\s*fechar|encerra\b)/
    if (reEncerrar.test(lowerEnc)) {
      return encerrarComCaptura(from, u)
    }
  }
  // -------------------------------------------------------------------------

  if (!devePriorizarHandlerRetomadaMenu && (u.aguardandoRetomada || !podeRetomar(from) || usuarioRespondendoAgora)) {
    const msg = textoRetomada

    if (buttonId === "terceiro_cancelar_menu" || text === "terceiro_cancelar_menu") {
      u.aguardandoRetomada = false
      u.aguardandoResposta = false
      const menuAnterior = await cancelarNovoCasoClienteEVoltarMenu(from, u, "cancelado_pelo_menu")
      if (menuAnterior) return menuAnterior
      // Cenário B: novo cliente sem caso anterior — encerra limpo
      limparTimer(u)
      if (!u.leadIncompletoCapturado) {
        await capturarLeadIncompleto(from, u).catch(e =>
          logErroHubSpot(e, {
            operation: "cancelarTerceiroNovoRetomada",
            contactId: u?.contatoId,
            dealId: u?.negocioId
          })
        )
      }
      limparDadosCasoAtual(u, { marcarFluxoEncerrado: true })
      await enviarAudioModoVoz(from, u, "Tudo bem. Cancelei o atendimento. Quando quiser começar de novo, é só me chamar.", "cancelar terceiro novo retomada")
      return {
        texto: `✅ *Atendimento cancelado.*\n\nQuando quiser começar um novo atendimento, é só me chamar aqui. 😊`,
        opcoes: null
      }
    }

    if ((buttonId === "recomecar" || msg.includes("recome")) && u._casoAnteriorCliente && !u.numeroCaso) {
      u.aguardandoRetomada = false
      u.aguardandoResposta = false
      iniciarTimer(from)
      return {
        texto: `🔄 *Recomeçar abertura de caso*\n\nVocê está abrindo um atendimento para outra pessoa.\n\nDeseja continuar de onde parou ou cancelar e voltar ao seu menu?`,
        opcoes: [
        { id: "cont_retomar", title: "▶️ Continuar" },
        { id: "terceiro_cancelar_menu", title: "🏠 Meu menu" },
        { id: "m_encerrar", title: "👋 Encerrar" }
        ]
      }
    }

    if (buttonId === "recomecar" || msg.includes("recome")) {
      u.aguardandoRetomada = false
      u.aguardandoResposta = false
      if (podeMostrarMenuCliente(u)) {
        return responderComTimer(from, await menuClienteComAudio(from, u))
      }
      // recomeçar faz revalidação progressiva dos dados preservados
      if (!u.atendente) u.atendente = sortearAtendente()
      u._revalidandoCampos = true
      setStage(u, STAGES.AUDIO_AGUARDANDO)
      iniciarTimer(from)
      const primeiroNomeRec = primeiroNomeCliente(u) || ""
      const saudacaoRec = primeiroNomeRec ? `, ${primeiroNomeRec}` : ""
      const modoDefinido = u.modoTexto !== undefined && u.modoTexto !== null
      const textoRec = `Tudo bem${saudacaoRec}. Vamos recomeçar com calma. Pode me contar sua situação novamente${u.modoTexto === false ? " por áudio ou texto" : u.modoTexto === true ? " por texto" : " por áudio ou texto"}. Estou aqui para ajudar você.`
      if (!u.modoTexto) {
        // Modo voz (false) ou ainda não definido (null/undefined): enviar áudio
        try {
          const ogg = await gerarAudioAtendente(u.atendente, textoRec)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha audio recomeçar pausa", e) }
      }
      return {
        texto: `🔄 Tudo bem${saudacaoRec} 😊\n\nVamos *recomeçar* com calma.\n\nPode me contar sua situação novamente${u.modoTexto === true ? " por texto" : " por áudio ou texto"}. Estou aqui para ajudar você.`,
        opcoes: null
      }
    }

    if (buttonId === "m_encerrar" || msg.includes("encerrar")) {
      u.aguardandoRetomada = false
      u.aguardandoResposta = false
      return encerrarAtendimento(from, u)
    }
  }
  if (usuarioRespondendoAgora) u.aguardandoResposta = false

  // Só executa processarRetomadaOuReinicio quando o stage atual é de retomada/resumo,
  // ou quando os botões/contexto são explicitamente de retomada ou descrição.
  // Sem essa guarda, a função intercepta mensagens destinadas a handlers de stage
  // ativos (ACOLHIMENTO_NOME, ACOLHIMENTO_CIDADE, etc.) e os impede de executar.
  const stageAtualNorm = normalizarStageKey(u.stage)
  const ehStageRetomada = [
    STAGES.RETOMADA_AUTOMATICA, STAGES.RETOMADA_MENU,
    STAGES.RESUMO_RETOMADA, STAGES.RESUMO_ATENDIMENTO
  ].includes(stageAtualNorm)
  const ehBotaoRetomada = [
    "rm_continuar", "rm_recomecar", "rr_continuar", "rr_corrigir",
    "rr_recomecar", "rr_encerrar", "ra_continuar", "ra_corrigir",
    "ra_recomecar", "ra_encerrar", "ret_auto_continuar", "ret_auto_menu",
    "cont_retomar", "recomecar", "desc_incentivo_continuar",
    "desc_incentivo_depois", "desc_incentivo_menu", "desc_incentivo_encerrar",
    "audio_fluxo_encerrar"
  ].includes(buttonId)
  const opcoesLastPergunta = new Set((u.lastPerguntaPayload?.opcoes || []).map(o => o.id))
  const ehContextoRetomadaOuDesc =
    opcoesLastPergunta.has("rm_continuar") || opcoesLastPergunta.has("rr_continuar") ||
    opcoesLastPergunta.has("ra_continuar") || opcoesLastPergunta.has("ret_auto_continuar") ||
    opcoesLastPergunta.has("desc_incentivo_continuar") || opcoesLastPergunta.has("cont_retomar")

  if (ehStageRetomada || ehBotaoRetomada || ehContextoRetomadaOuDesc) {
    const respostaRetomada = await processarRetomadaOuReinicio(from, u, text, buttonId, ctx)
    if (respostaRetomada) return respostaRetomada
  }

  if (u.aguardandoRetomada) {
    logDebug("? Ignorando verificação automática de retomada")
  } else if (u.stage === STAGES.INICIO) {
    const respostaRetomadaAutomatica = await verificarRetomadaAutomatica(from, u)
    if (respostaRetomadaAutomatica) return respostaRetomadaAutomatica
  }

  // Cliente já cadastrado retornando — vai direto para menu cliente
  if (u.numeroCaso && podeMostrarMenuCliente(u) &&
      [STAGES.INICIO, STAGES.CLIENTE].includes(u.stage) &&
      !ehAudio &&
      !ehDoc &&
      !text.startsWith("m_caso_") &&
      !["dir_agendar", "adv_ag", "adv_urg", "adv_agendar_ligacao", "cliente_cancelar_consulta", "cliente_cancelar_consulta_sim", "m_adv", "m_status", "m_docs", "docs_pedido_admin", "docs_intro_ok", "doc_cpf_skip", "docs_reenviar", "docs_maisFotos", "docs_proxdoc", "docs_pular_doc", "docs_depois", "docs_rg_verso_junto", "docs_rg_sem_verso", "docs_enviar_faltantes", "docs_ver_status", "doc_cliente_anexar", "doc_cliente_tipo_pessoal", "doc_cliente_tipo_prova", "doc_cliente_tipo_outro", "docs_confirmar_envio_extra", "m_novocaso", "novo_caso_confirmar", "m_encerrar", "m_inicio"].includes(text)) {
    setStage(u, STAGES.CLIENTE)
    iniciarTimer(from)
    return await menuClienteComAudio(from, u)
  }



  if (u._novoCasoParaTerceiro && !u.numeroCaso && ehDoc) {
    iniciarTimer(from)
    await enviarAudioModoVoz(
      from,
      u,
      "Recebi seu arquivo, mas primeiro preciso concluir o cadastro da pessoa atendida. Depois os documentos poderão ser enviados pelo WhatsApp dela.",
      "documento durante caso terceiro"
    )
    const _labelCancelarDoc = u._casoAnteriorCliente ? "🏠 Meu menu" : "↩️ Cancelar atendimento"
    return {
      texto: `📎 *Arquivo recebido, mas ainda não vou anexar.*\n\nPrimeiro preciso concluir o cadastro da pessoa atendida.\n\nDepois que o caso for aberto, os documentos poderão ser enviados pelo WhatsApp dela.`,
      opcoes: [
        { id: "cont_retomar", title: "▶️ Continuar" },
      { id: "terceiro_cancelar_menu", title: _labelCancelarDoc }
      ]
    }
  }

  const respostaMidia = await processarMidia(from, nomeWA, u, msgObj, tipo, ehAudio, ehDoc)
  if (respostaMidia) return respostaMidia

  // Imagem ou documento enviado enquanto o bot ainda aguarda o relato:
  // não trava nem some — orienta gentilmente a enviar o relato primeiro.
  if (ehDoc && u.stage === STAGES.AUDIO_AGUARDANDO) {
    iniciarTimer(from)
    return await responderTelaComAudio(
      from,
      u,
      {
        texto: `📎 Recebi seu arquivo! Mas por enquanto ainda não tenho onde guardá-lo, pois o caso ainda não foi aberto.\n\nMe conta primeiro o que está acontecendo (pode falar em áudio 🎙️ ou digitar 💬). Depois do cadastro você poderá enviar documentos normalmente. 😊`,
        opcoes: null
      },
      "Recebi seu arquivo. Mas o caso ainda não foi aberto, então ainda não tenho onde guardá-lo. Me conta primeiro o que está acontecendo, por áudio ou digitando. Depois do cadastro você poderá enviar documentos normalmente.",
      "doc antes do relato"
    )
  }

  const respostaAudioCanal = await processarAudioCanalAtendimento(from, nomeWA, u, msgObj, tipo, ehAudio, ehDoc)
  if (respostaAudioCanal) return respostaAudioCanal

  const clientIntakeDecision = routeClientIntake(
    { text, isAudio: ehAudio },
    { stage: u.stage, stages: STAGES }
  )
  const clientPostIntakeDecision = routeClientPostIntake(clientIntakeDecision, {
    text,
    isAudio: ehAudio,
    stage: u.stage,
    stages: STAGES
  })
  const clientPostIntakeAction = clientPostIntakeDecision.legacyAction

  const resultadoRevalidacaoNomeConfirmada = await handleRevalidateNameConfirm({
    decision: clientPostIntakeDecision,
    u,
    from,
    proximaConfirmacaoProgressiva
  })
  if (resultadoRevalidacaoNomeConfirmada.success) {
    return resultadoRevalidacaoNomeConfirmada.response
  }

  const resultadoCorrecaoTextualNome = await handleRevalidateNameCorrectText({
    decision: clientPostIntakeDecision,
    u,
    texto: text,
    from,
    extrairNomeDaCorrecaoExplicita,
    formatarNome,
    limparTextoSomenteLetras,
    ehNomeAparente,
    parecePuraNegacaoSemNome,
    sincronizarContatoNegocioHubSpot,
    gerarAudioAtendente,
    enviarAudio,
    urlAudioAtendente,
    esperar: ms => new Promise(resolve => setTimeout(resolve, ms)),
    logErro,
    iniciarTimer,
    responderComTimer,
    proximaConfirmacaoProgressiva
  })
  if (resultadoCorrecaoTextualNome.success) {
    return resultadoCorrecaoTextualNome.response
  }

  // handlers de revalidação progressiva
  if (clientPostIntakeAction === CLIENT_POST_INTAKE_ACTIONS.REVALIDATE_NAME) {
    if (text === "revalida_nome_ok") {
      if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
      u._revalidaConfirmados.push("nome")
      return await proximaConfirmacaoProgressiva(from, u)
    }
    // Texto livre = cliente digitou ou falou o nome correto diretamente
    if (text && text !== "revalida_nome_ok") {
      // Verifica intenção de correção explícita antes de extrair nome puro
      const nomeCorrecaoRevalida = extrairNomeDaCorrecaoExplicita(text)
      const nomeLimpo = nomeCorrecaoRevalida || formatarNome(limparTextoSomenteLetras(text))
      if (ehNomeAparente(nomeLimpo, nomeCorrecaoRevalida ? nomeLimpo : text) === true) {
        u.nome = nomeLimpo
        u.nomeConfirmado = true
        await sincronizarContatoNegocioHubSpot(u)
        if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
        u._revalidaConfirmados.push("nome")
        return await proximaConfirmacaoProgressiva(from, u, {
          introducaoAudio: `Entendi! Nome atualizado para ${nomeLimpo}.`
        })
      }
      // Negação pura sem nome → deixa cair no imprevisto abaixo
      if (!parecePuraNegacaoSemNome(text)) {
        iniciarTimer(from)
        return responderComTimer(from, {
          texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nNão consegui identificar o nome. Por favor, informe apenas o nome completo. Pode falar ou digitar. 🎙️`,
          opcoes: [{ id: "revalida_nome_ok", title: "✅ Confirmar atual" }]
        })
      }
    }
    // Mensagem que não é o nome — verificar se é intenção de corrigir outro campo
    const imprevistoRevalidaNome = await tratarImprevistoPreAtendimento(from, u, u.stage, text)
    if (imprevistoRevalidaNome) return imprevistoRevalidaNome
  }

  const resultadoRevalidacaoCidadeConfirmada = await handleRevalidateCityConfirm({
    decision: clientPostIntakeDecision,
    u,
    from,
    proximaConfirmacaoProgressiva
  })
  if (resultadoRevalidacaoCidadeConfirmada.success) {
    return resultadoRevalidacaoCidadeConfirmada.response
  }

  const resultadoSelecaoCidadeRevalidada = await handleRevalidateCitySelect({
    decision: clientPostIntakeDecision,
    u,
    texto: text,
    from,
    mapearRegiaoPorUF,
    estadoPorExtenso,
    gerarAudioAtendente,
    enviarAudio,
    urlAudioAtendente,
    esperar: ms => new Promise(resolve => setTimeout(resolve, ms)),
    logErro,
    proximaConfirmacaoProgressiva
  })
  if (resultadoSelecaoCidadeRevalidada.success) {
    return resultadoSelecaoCidadeRevalidada.response
  }

  if (clientPostIntakeAction === CLIENT_POST_INTAKE_ACTIONS.REVALIDATE_CITY) {
    if (text === "revalida_cidade_ok") {
      if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
      u._revalidaConfirmados.push("cidade")
      return await proximaConfirmacaoProgressiva(from, u)
    }
    // Seleção de cidade homônima
    if (text?.startsWith("revalida_cidade_multipla_") && Array.isArray(u._cidadesMultiplas)) {
      const idx = parseInt(text.replace("revalida_cidade_multipla_", ""), 10)
      const escolhida = u._cidadesMultiplas[idx]
      if (escolhida) {
        u.cidade = escolhida.cidade
        u.uf = escolhida.uf
        u.regiao = escolhida.regiao || mapearRegiaoPorUF(escolhida.uf)
        delete u._cidadesMultiplas
        const estadoFull = estadoPorExtenso(escolhida.uf) || escolhida.uf || ""
        if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
        u._revalidaConfirmados.push("cidade")
        return await proximaConfirmacaoProgressiva(from, u, {
          introducaoAudio: `Entendi! Cidade atualizada para ${escolhida.cidade}${estadoFull ? ", " + estadoFull : ""}.`
        })
      }
    }
    // Texto livre = cliente digitou ou falou a cidade correta diretamente
    if (text && text !== "revalida_cidade_ok" && !text.startsWith("revalida_cidade_multipla_")) {
      const cidadeLimpa = normalizarNomeCidadeBusca(text)
      const loc = await buscarCidadePorNome(cidadeLimpa || text)
      if (loc && !loc.multiplos) {
        u.cidade = loc.cidade
        u.uf = loc.uf
        u.regiao = loc.regiao || mapearRegiaoPorUF(loc.uf)
        const estadoFull = estadoPorExtenso(loc.uf) || loc.uf || ""
        if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
        u._revalidaConfirmados.push("cidade")
        return await proximaConfirmacaoProgressiva(from, u, {
          introducaoAudio: `Entendi! Cidade atualizada para ${loc.cidade}${estadoFull ? ", " + estadoFull : ""}.`
        })
      }
      if (loc?.multiplos && loc.opcoes?.length > 1) {
        u._cidadesMultiplas = loc.opcoes
        const opcoesLista = loc.opcoes.slice(0, 4).map((op, i) => ({
          id: `revalida_cidade_multipla_${i}`,
          title: abreviarCidadeBotao(op.cidade, op.uf)
        }))
        if (!u.modoTexto) {
          try {
            const nomesAudio = loc.opcoes.slice(0, 4).map(op => `${op.cidade}, ${estadoPorExtenso(op.uf) || op.uf}`).join("; ")
            const ogg = await gerarAudioAtendente(u.atendente, `Encontrei ${numeroPorExtenso(loc.opcoes.length, "feminino")} cidades com esse nome: ${nomesAudio}. Selecione a opção correspondente.`)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 4000))
          } catch (e) { logErro("tts", "Falha áudio cidades múltiplas revalida", e) }
        }
        iniciarTimer(from)
        return responderComTimer(from, {
          texto: `●●●●●○ 📍 Etapa 5 de 6 · *CIDADE*\n\n🔍 Encontrei *${loc.opcoes.length} cidades* com esse nome. Qual é a correta?\n\n_Se não aparecer, diga ou digite o nome com o estado._`,
          opcoes: opcoesLista
        })
      }
      iniciarTimer(from)
      return responderComTimer(from, {
        texto: `●●●●●○ 📍 Etapa 5 de 6 · *CIDADE*\n\nNão consegui identificar essa cidade. Informe cidade e estado (ex: *Recife, PE*) ou o CEP. Pode falar ou digitar. 🎙️`,
        opcoes: [{ id: "revalida_cidade_ok", title: "✅ Confirmar atual" }]
      })
    }
    // Mensagem que não é cidade — verificar se é intenção de corrigir outro campo
    const imprevistoRevalidaCidade = await tratarImprevistoPreAtendimento(from, u, u.stage, text)
    if (imprevistoRevalidaCidade) return imprevistoRevalidaCidade
  }

  const resultadoRevalidacaoTelefoneConfirmada = await handleRevalidatePhoneConfirm({
    decision: clientPostIntakeDecision,
    u,
    from,
    responderComTimer,
    voltarParaConfirmacao,
    proximaConfirmacaoProgressiva,
    flowAcolhimentoCidade
  })
  if (resultadoRevalidacaoTelefoneConfirmada.success) {
    return resultadoRevalidacaoTelefoneConfirmada.response
  }

  const resultadoCorrecaoTextualTelefone = await handleRevalidatePhoneCorrectText({
    decision: clientPostIntakeDecision,
    u,
    texto: text,
    from,
    normalizarTelefone,
    formatarTelefoneExibicao,
    gerarAudioAtendente,
    enviarAudio,
    urlAudioAtendente,
    esperar: ms => new Promise(resolve => setTimeout(resolve, ms)),
    logErro,
    iniciarTimer,
    responderComTimer,
    voltarParaConfirmacao,
    proximaConfirmacaoProgressiva,
    flowAcolhimentoCidade
  })
  if (resultadoCorrecaoTextualTelefone.success) {
    return resultadoCorrecaoTextualTelefone.response
  }

  if (clientPostIntakeAction === CLIENT_POST_INTAKE_ACTIONS.REVALIDATE_PHONE) {
    if (text === "revalida_whatsapp_ok") {
      if (u._corrigindoWhatsappConfirmacao) {
        u.whatsappVerificado = true
        if (!u.whatsappContato) u.whatsappContato = from
        delete u._corrigindoWhatsappConfirmacao
        return responderComTimer(from, await voltarParaConfirmacao(from, u))
      }
      if (u._revalidandoCampos) {
        if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
        u._revalidaConfirmados.push("whatsapp")
        return await proximaConfirmacaoProgressiva(from, u)
      }
      // Usuário novo corrigindo WhatsApp antes de ter cidade — retoma coleta de cidade
      u.whatsappVerificado = true
      if (!u.whatsappContato) u.whatsappContato = from
      return await flowAcolhimentoCidade(u, { from })
    }
    // Texto livre = cliente digitou outro número diretamente
    if (text && text !== "revalida_whatsapp_ok") {
      const telNorm = normalizarTelefone(text)
      if (telNorm && telNorm.replace(/\D/g, "").length >= 12) {
        u.whatsappContato = telNorm
        u.whatsappVerificado = true
        u.telefoneEhDoCliente = !u.atendimentoParaTerceiro
        const label = formatarTelefoneExibicao(telNorm)
        if (u._corrigindoWhatsappConfirmacao && !u.modoTexto) {
          try {
            const ogg = await gerarAudioAtendente(u.atendente, `Entendi! Vou usar o número ${label}.`)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 2000))
          } catch (e) { logErro("tts", "Falha áudio novo número revalida", e) }
        }
        if (u._corrigindoWhatsappConfirmacao) {
          delete u._corrigindoWhatsappConfirmacao
          return responderComTimer(from, await voltarParaConfirmacao(from, u))
        }
        if (u._revalidandoCampos) {
          if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
          u._revalidaConfirmados.push("whatsapp")
          return await proximaConfirmacaoProgressiva(from, u, {
            introducaoAudio: `Entendi! Vou usar o número ${label}.`
          })
        }
        // Usuário novo corrigindo WhatsApp antes de ter cidade — retoma coleta de cidade
        return await flowAcolhimentoCidade(u, {
          from,
          introducaoAudio: `Entendi! Vou usar o número ${label}.`
        })
      }
      iniciarTimer(from)
      return responderComTimer(from, {
        texto: `●●●●○○ 📱 Etapa 4 de 6 · *WHATSAPP*\n\nNão consegui identificar o número. Informe com DDD. Pode falar ou digitar. 🎙️`,
        opcoes: [{ id: "revalida_whatsapp_ok", title: "✅ Confirmar atual" }]
      })
    }
    // Mensagem que não é número — verificar se é intenção de corrigir outro campo
    const imprevistoRevalidaWhatsapp = await tratarImprevistoPreAtendimento(from, u, u.stage, text)
    if (imprevistoRevalidaWhatsapp) return imprevistoRevalidaWhatsapp
  }

  // Após corrigir nome no fluxo de revalidação → continuar progressão
  if (clientPostIntakeAction === CLIENT_POST_INTAKE_ACTIONS.COLLECT_NAME && u._revalidandoCampos && text) {
    const nomeRevalida = extrairNomeDaCorrecaoExplicita(text) || formatarNome(limparTextoSomenteLetras(text))
    if (ehNomeAparente(nomeRevalida, text) !== true) {
      iniciarTimer(from)
      return responderComTimer(from, {
        texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nNão consegui identificar o nome. Por favor, informe apenas o nome completo. Pode falar ou digitar. 🎙️`,
        opcoes: [{ id: "revalida_nome_ok", title: "✅ Confirmar atual" }]
      })
    }
    u.nome = nomeRevalida
    u.nomeConfirmado = true
    if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
    u._revalidaConfirmados.push("nome")
    return await proximaConfirmacaoProgressiva(from, u)
  }

  // Intercepta áudio no stage de coleta do nome do contato (quem está no WhatsApp, caso para terceiro)
  if (clientPostIntakeAction === CLIENT_POST_INTAKE_ACTIONS.PROCESS_THIRD_PARTY && u.stage === STAGES.ACOLHIMENTO_NOME_CONTATO && ehAudio) {
    try {
      const mediaId = msgObj?.[tipo]?.id
      if (!mediaId) {
        return { texto: `Não consegui processar seu áudio. Por favor, *digite seu nome*.`, opcoes: null }
      }
      await enviar(from, "👂 Estou ouvindo seu áudio...", null, false)
      const midia = await baixarMidia(mediaId)
      if (!midia) {
        return { texto: `Não consegui processar seu áudio. Por favor, *digite seu nome*.`, opcoes: null }
      }
      const transcricao = await transcrever(midia.buffer, midia.mimeType, {
        origem: "nome",
        prompt: "Transcreva em português brasileiro com foco em identificar apenas o nome completo informado pelo cliente."
      })
      const nomeLimpo = await extrairNomeAudio(transcricao)
      const validacaoNomeContato = nomeLimpo ? ehNomeAparente(nomeLimpo, transcricao || "") : false
      if (!nomeLimpo || validacaoNomeContato === false) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente,
            `Não consegui entender seu nome. Por favor, fale seu nome completo devagar, ou digite.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio nome contato inválido", e) }
        return { texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*

Não consegui entender seu nome. Por favor, tente novamente ou *digite seu nome completo*.`, opcoes: null }
      }
      if (validacaoNomeContato === "incompleto") {
        try {
          const ogg = await gerarAudioAtendente(u.atendente,
            `Preciso do nome completo. Por favor, informe também o sobrenome.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio nome contato incompleto", e) }
        return { texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*

Preciso do nome completo. Por favor, informe também o *sobrenome*.`, opcoes: null }
      }
      u._nomeContatoTemp = nomeLimpo
      const primeiroNomeContato = nomeLimpo.split(" ")[0] || nomeLimpo
      setStage(u, STAGES.ACOLHIMENTO_CONFIRMA_NOME_CONTATO)
      iniciarTimer(from)
      try {
        const ogg = await gerarAudioAtendente(
          u.atendente,
          textoAudioConfirmacaoNome(nomeLimpo)
        )
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 4000))
      } catch (e) { logErro("tts", "Falha áudio confirmar nome contato (áudio)", e) }
      return {
        texto: textoConfirmarNomeRepresentante(nomeLimpo),
        opcoes: [
          { id: "confirma_nome_contato_sim", title: "✅ Sim, está certo" }
        ]
      }
    } catch (e) {
      logErro("tts", "Falha transcrição nome contato por áudio", e)
      return { texto: `Não consegui processar seu áudio. Por favor, *digite seu nome*.`, opcoes: null }
    }
  }

  // Intercepta áudio no stage de coleta de nome
  if (clientPostIntakeAction === CLIENT_POST_INTAKE_ACTIONS.COLLECT_NAME && ehAudio) {
    try {
      const mediaId = msgObj?.[tipo]?.id
      if (!mediaId) {
        return { texto: `Não consegui processar seu áudio. Por favor, *digite seu nome*.`, opcoes: null }
      }

  await enviar(from, "👂 Estou ouvindo seu áudio...", null, false)
      const midia = await baixarMidia(mediaId)
      if (!midia) {
        return { texto: `Não consegui processar seu áudio. Por favor, *digite seu nome*.`, opcoes: null }
      }

      const transcricao = await transcrever(midia.buffer, midia.mimeType, {
        origem: "nome",
        prompt: "Transcreva em português brasileiro com foco em identificar apenas o nome completo informado pelo cliente."
      })
      const nomeLimpo = await extrairNomeAudio(transcricao)

      const validacaoNomeAcol = nomeLimpo ? ehNomeAparente(nomeLimpo, transcricao || "") : false

      const ambiguidade = detectarAmbiguidadeTitularNome(u, transcricao)
      if (ambiguidade && validacaoNomeAcol !== false) {
        return await perguntarTitularNomePreCadastro(from, u, nomeLimpo, ambiguidade)
      }

      if (!nomeLimpo || validacaoNomeAcol === false) {
        // Antes de desistir, verificar se o áudio era uma correção de outro campo
        if (transcricao && transcricao.length >= 4) {
          const imprevistoNomeAudio = await tratarImprevistoPreAtendimento(from, u, u.stage, transcricao)
          if (imprevistoNomeAudio) return imprevistoNomeAudio
        }
        try {
          const ogg = await gerarAudioAtendente(u.atendente,
            `Não consegui entender seu nome. Por favor, fale seu nome completo devagar, ou digite seu nome.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio nome inválido", e) }
        return { texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*

Não consegui entender seu nome. Por favor, tente novamente ou *digite seu nome completo*.`, opcoes: null }
      }

      if (validacaoNomeAcol === "incompleto") {
        try {
          const ogg = await gerarAudioAtendente(u.atendente,
            `Preciso do nome completo. Por favor, informe também o sobrenome.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio nome incompleto acolhimento", e) }
        return { texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*

Preciso do nome completo. Por favor, informe também o *sobrenome*.`, opcoes: null }
      }

      u._nomeTemp = nomeLimpo
      setStage(u, STAGES.ACOLHIMENTO_CONFIRMA_NOME)
      iniciarTimer(from)
      const coletandoNomeAtendido = u.atendimentoParaTerceiro && !!u.nomeContato

      try {
        const ogg = await gerarAudioAtendente(
          u.atendente,
          coletandoNomeAtendido
            ? audioConfirmarNomePessoaAtendida(nomeLimpo)
            : textoAudioConfirmacaoNome(nomeLimpo)
        )
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 4000))
      } catch (e) { logErro("tts", "Falha áudio confirmar nome", e) }

      return {
      texto: coletandoNomeAtendido
        ? textoConfirmarNomePessoaAtendida(nomeLimpo)
        : `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ Seu nome é *${nomeLimpo}*.\n\nEstá correto? Se não estiver, é só me dizer agora. Pode falar ou digitar. 🎙️`,
        opcoes: [
          { id: "nome_confirmar", title: "✅ Sim, está certo" }
        ]
      }
    } catch (e) {
      logErro("tts", "Falha transcrição nome por áudio", e)
      return { texto: `Não consegui processar seu áudio. Por favor, *digite seu nome*.`, opcoes: null }
    }
  }

  if (clientPostIntakeAction === CLIENT_POST_INTAKE_ACTIONS.COLLECT_CITY && ehAudio) {
    try {
      const mediaId = msgObj?.[tipo]?.id
      if (!mediaId) return { texto: `Não consegui processar seu áudio. Por favor, digite sua cidade ou CEP.`, opcoes: null }

  await enviar(from, "👂 Estou ouvindo seu áudio...", null, false)
      const midia = await baixarMidia(mediaId)
      if (!midia) return { texto: `Não consegui processar seu áudio. Por favor, digite sua cidade ou CEP.`, opcoes: null }

      const transcricao = await transcrever(midia.buffer, midia.mimeType, {
        origem: "cidade",
        prompt: "Transcreva em português brasileiro com foco em identificar apenas a cidade onde o cliente mora."
      })
      logDebug(`[CIDADE_AUDIO] Transcrição bruta: "${transcricao}"`)
      if (!transcricao) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente,
            `Não consegui ouvir seu áudio com clareza. Pode tentar novamente, falar mais devagar, ou digitar o nome da sua cidade?`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3500))
        } catch (e) { logErro("tts", "Falha áudio transcrição cidade null", e) }
        iniciarTimer(from)
        return { texto: `●●●●●○ 📍 Etapa 5 de 6 · *CIDADE*\n\n🎙️ Não consegui ouvir seu áudio. Tente novamente ou *digite o nome da cidade ou CEP*. `, opcoes: null }
      }
      const cidadeLimpa = await extrairCidadeAudio(transcricao)
      logDebug(`[CIDADE_AUDIO] Após extrairCidadeAudio: "${cidadeLimpa}"`)
      const digitosCidade = cidadeLimpa.replace(/\D/g, "")
      let localizacao = null
      let cidadeIdentificada = null

      if (/^\d{8}$/.test(digitosCidade)) {
        const infoCEP = await buscarPorCEP(digitosCidade)
        cidadeIdentificada = infoCEP.cidade
        localizacao = {
          cidade: infoCEP.cidade,
          uf: infoCEP.uf,
          estado: infoCEP.uf,
          regiao: infoCEP.regiao
        }
      } else {
        // Tentar nome completo primeiro — evita fragmentar "Presidente Kennedy" em palavras
        localizacao = await buscarCidadePorNome(cidadeLimpa)

        // Só tentar por palavras individuais se o nome completo não retornou nada
        if (!localizacao) {
          const palavras = cidadeLimpa
    .replace(/[•·]/g, " ")
            .split(/\s+/)
            .filter(p => p.length > 2)

          for (const palavra of palavras) {
            localizacao = await buscarCidadePorNome(palavra)
            if (localizacao && !localizacao.multiplos) break
          }
        }

        // Só atribuir cidade se for resultado único — multiplos não têm .cidade
        cidadeIdentificada = localizacao?.multiplos ? null : localizacao?.cidade
        logDebug(`[CIDADE_AUDIO] localizacao.multiplos: ${localizacao?.multiplos}`)
        logDebug(`[CIDADE_AUDIO] cidadeIdentificada: "${cidadeIdentificada}"`)

        // tratar cidades homônimas (multiplos) no modo voice
        // Leitura correta: "Cidade, Estado por extenso" — nunca "Cidade - UF" com hífen
        if (localizacao?.multiplos && localizacao.opcoes?.length > 1) {
          const opcoesLista = localizacao.opcoes.slice(0, 4).map((op, i) => ({
            id: `cidade_multipla_${i}`,
            // título curto para caber no botão do WhatsApp
            title: abreviarCidadeBotao(op.cidade, op.uf)
          }))
          u._cidadesMultiplas = localizacao.opcoes
          if (!u.modoTexto) {
            try {
              // áudio usa nome completo do estado, não sigla
              const nomesAudio = localizacao.opcoes.slice(0, 4)
                .map(op => `${op.cidade}, ${estadoPorExtenso(op.uf) || op.uf}`).join("; ")
              const ogg = await gerarAudioAtendente(u.atendente,
                `Encontrei ${numeroPorExtenso(localizacao.opcoes.length, "feminino")} cidades com esse nome: ${nomesAudio}. Selecione a opção correspondente. Se a sua cidade não aparecer, diga o nome com o estado agora.`)
              await enviarAudio(from, urlAudioAtendente(ogg))
              await new Promise(r => setTimeout(r, 4000))
            } catch (e) { logErro("tts", "Falha áudio cidades múltiplas", e) }
          }
          iniciarTimer(from)
          return responderComTimer(from, {
          texto: `●●●●●○ 📍 Etapa 5 de 6 · *CIDADE*\n\n🔍 Encontrei *${localizacao.opcoes.length} cidades* com esse nome. Qual é a sua?\n\n_Se a sua cidade não aparecer, diga ou digite o nome com o estado._`,
            opcoes: opcoesLista
          })
        }
      }

      if (!cidadeIdentificada || cidadeIdentificada.length < 2) {
        // Antes de desistir, verificar se o áudio era uma correção de outro campo
        if (transcricao && transcricao.length >= 4) {
          const imprevistoCidadeAudio = await tratarImprevistoPreAtendimento(from, u, u.stage, transcricao)
          if (imprevistoCidadeAudio) return imprevistoCidadeAudio
        }
        try {
          const ogg = await gerarAudioAtendente(u.atendente,
            `Não consegui identificar sua cidade. Você pode digitar o nome da cidade, informar o CEP com oito dígitos, ou enviar um novo áudio falando o nome da cidade devagar.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 4000))
        } catch (e) { logErro("tts", "Falha áudio erro cidade", e) }
        return { texto: `●●●●●○ 📍 Etapa 5 de 6 · *CIDADE*\n\n🎙️ Não consegui entender sua cidade. Digite o nome, informe o CEP ou envie outro áudio.`, opcoes: null }
      }

      u.cidade = cidadeIdentificada
      u.uf = localizacao.uf
      u.regiao = localizacao.regiao
      u._cidadeAudioTemp = cidadeIdentificada
      u._ufAudioTemp = u.uf
      u._regiaoAudioTemp = u.regiao
      await sincronizarContatoNegocioHubSpot(u)
      await enviarAudioConfirmacaoLocalizacao(from, u.atendente, cidadeIdentificada, u.uf || "UF não identificada", u.regiao || "não identificada", "cidade")
      iniciarTimer(from)
      // formato padrão "Cidade, UF" com vírgula
      return {
        texto: `●●●●●○ 📍 Etapa 5 de 6 · *CIDADE*\n\n✅ Localizei: *${cidadeIdentificada}${u.uf ? `, ${u.uf}` : ""}* (${u.regiao || "não identificada"}). Está correto? Se não estiver, é só me dizer a cidade correta agora. Pode falar ou digitar. 🎙️`,
        opcoes: [
          { id: "cidade_confirmar", title: "✅ Confirmar cidade" }
        ]
      }
    } catch (e) {
      logErro("tts", "Falha transcrição cidade por áudio", e)
      return { texto: `Não consegui processar seu áudio. Por favor, digite sua cidade ou CEP.`, opcoes: null }
    }
  }

  if (clientPostIntakeAction === CLIENT_POST_INTAKE_ACTIONS.REVALIDATE_PHONE && ehAudio) {
    try {
      const mediaId = msgObj?.[tipo]?.id
      if (!mediaId) {
        return { texto: `Não consegui processar seu áudio. Por favor, *digite o número com DDD*.`, opcoes: [{ id: "revalida_whatsapp_ok", title: "✅ Confirmar atual" }] }
      }
      await enviar(from, "👂 Estou ouvindo seu áudio...", null, false)
      const midia = await baixarMidia(mediaId)
      if (!midia) {
        return { texto: `Não consegui processar seu áudio. Por favor, *digite o número com DDD*.`, opcoes: [{ id: "revalida_whatsapp_ok", title: "✅ Confirmar atual" }] }
      }
      const transcricao = await transcrever(midia.buffer, midia.mimeType, {
        origem: "revalida_whatsapp",
        prompt: "Transcreva em português brasileiro com foco em identificar apenas o número de telefone ou WhatsApp informado pelo cliente, incluindo o DDD."
      })
      const telNorm = normalizarTelefone(transcricao || "")
      if (!telNorm || telNorm.replace(/\D/g, "").length < 12) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, `Não consegui identificar o número. Por favor, fale o número com DDD devagar, ou digite.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio número inválido revalida whatsapp", e) }
        iniciarTimer(from)
        return responderComTimer(from, {
          texto: `●●●●○○ 📱 Etapa 4 de 6 · *WHATSAPP*\n\nNão consegui identificar o número. Por favor, informe com DDD. Pode falar ou digitar. 🎙️`,
          opcoes: [{ id: "revalida_whatsapp_ok", title: "✅ Confirmar atual" }]
        })
      }
      u.whatsappContato = telNorm
      u.whatsappVerificado = true
      u.telefoneEhDoCliente = !u.atendimentoParaTerceiro
      const label = formatarTelefoneExibicao(telNorm)
      if (u._corrigindoWhatsappConfirmacao && !u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, `Entendi! Vou usar o número ${label}.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 2000))
        } catch (e) { logErro("tts", "Falha áudio novo número revalida whatsapp áudio", e) }
      }
      if (u._corrigindoWhatsappConfirmacao) {
        delete u._corrigindoWhatsappConfirmacao
        return responderComTimer(from, await voltarParaConfirmacao(from, u))
      }
      if (u._revalidandoCampos) {
        if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
        u._revalidaConfirmados.push("whatsapp")
        return await proximaConfirmacaoProgressiva(from, u, {
          introducaoAudio: `Entendi! Vou usar o número ${label}.`
        })
      }
      // Usuário novo corrigindo WhatsApp antes de ter cidade — retoma coleta de cidade
      return await flowAcolhimentoCidade(u, {
        from,
        introducaoAudio: `Entendi! Vou usar o número ${label}.`
      })
    } catch (e) {
      logErro("tts", "Falha transcrição whatsapp revalida por áudio", e)
      return { texto: `Não consegui processar seu áudio. Por favor, *digite o número com DDD*.`, opcoes: [{ id: "revalida_whatsapp_ok", title: "✅ Confirmar atual" }] }
    }
  }

  if (clientPostIntakeAction === CLIENT_POST_INTAKE_ACTIONS.REVALIDATE_NAME && ehAudio) {
    try {
      const mediaId = msgObj?.[tipo]?.id
      if (!mediaId) {
        return { texto: `Não consegui processar seu áudio. Por favor, *digite seu nome*.`, opcoes: null }
      }
      await enviar(from, "👂 Estou ouvindo seu áudio...", null, false)
      const midia = await baixarMidia(mediaId)
      if (!midia) {
        return { texto: `Não consegui processar seu áudio. Por favor, *digite seu nome*.`, opcoes: null }
      }
      const transcricao = await transcrever(midia.buffer, midia.mimeType, {
        origem: "nome",
        prompt: "Transcreva em português brasileiro com foco em identificar apenas o nome completo informado pelo cliente."
      })
      const nomeLimpo = formatarNome(limparTextoSomenteLetras(await extrairNomeAudio(transcricao) || ""))
      const validacaoNomeRevalida = nomeLimpo ? ehNomeAparente(nomeLimpo, transcricao || "") : false
      if (!nomeLimpo || validacaoNomeRevalida === false) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, `Não consegui entender seu nome. Por favor, fale seu nome completo devagar, ou digite seu nome.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio nome inválido revalida", e) }
        return { texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nNão consegui entender seu nome. Por favor, tente novamente ou *digite seu nome*.`, opcoes: [{ id: "revalida_nome_ok", title: "✅ Confirmar atual" }] }
      }
      if (validacaoNomeRevalida === "incompleto") {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, `Preciso do nome completo. Por favor, informe também o sobrenome.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio nome incompleto revalida", e) }
        return { texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nPreciso do nome completo. Por favor, informe também o *sobrenome*.`, opcoes: [{ id: "revalida_nome_ok", title: "✅ Confirmar atual" }] }
      }
      u.nome = nomeLimpo
      u.nomeConfirmado = true
      await sincronizarContatoNegocioHubSpot(u)
      if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
      u._revalidaConfirmados.push("nome")
      return await proximaConfirmacaoProgressiva(from, u, {
        introducaoAudio: `Entendi! Nome atualizado para ${nomeLimpo}.`
      })
    } catch (e) {
      logErro("tts", "Falha transcrição nome revalida por áudio", e)
      return { texto: `Não consegui processar seu áudio. Por favor, *digite seu nome*.`, opcoes: null }
    }
  }

  if (clientPostIntakeAction === CLIENT_POST_INTAKE_ACTIONS.REVALIDATE_CITY && ehAudio) {
    try {
      const mediaId = msgObj?.[tipo]?.id
      if (!mediaId) return { texto: `Não consegui processar seu áudio. Por favor, digite sua cidade ou CEP.`, opcoes: null }
      await enviar(from, "👂 Estou ouvindo seu áudio...", null, false)
      const midia = await baixarMidia(mediaId)
      if (!midia) return { texto: `Não consegui processar seu áudio. Por favor, digite sua cidade ou CEP.`, opcoes: null }
      const transcricao = await transcrever(midia.buffer, midia.mimeType, {
        origem: "cidade",
        prompt: "Transcreva em português brasileiro com foco em identificar apenas a cidade onde o cliente mora."
      })
      if (!transcricao) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, `Não consegui ouvir seu áudio com clareza. Pode tentar novamente, falar mais devagar, ou digitar o nome da cidade?`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3500))
        } catch (e) { logErro("tts", "Falha áudio transcrição cidade revalida null", e) }
        iniciarTimer(from)
        return { texto: `●●●●●○ 📍 Etapa 5 de 6 · *CIDADE*\n\n🎙️ Não consegui ouvir seu áudio. Tente novamente ou *digite o nome da cidade ou CEP*.`, opcoes: null }
      }
      const cidadeLimpa = await extrairCidadeAudio(transcricao)
      const digitosCidade = cidadeLimpa.replace(/\D/g, "")
      let localizacao = null
      let cidadeIdentificada = null
      if (/^\d{8}$/.test(digitosCidade)) {
        const infoCEP = await buscarPorCEP(digitosCidade)
        cidadeIdentificada = infoCEP.cidade
        localizacao = { cidade: infoCEP.cidade, uf: infoCEP.uf, estado: infoCEP.uf, regiao: infoCEP.regiao }
      } else {
        localizacao = await buscarCidadePorNome(cidadeLimpa)
        if (!localizacao) {
          const palavras = cidadeLimpa.replace(/[•·]/g, " ").split(/\s+/).filter(p => p.length > 2)
          for (const palavra of palavras) {
            localizacao = await buscarCidadePorNome(palavra)
            if (localizacao && !localizacao.multiplos) break
          }
        }
        cidadeIdentificada = localizacao?.multiplos ? null : localizacao?.cidade
        if (localizacao?.multiplos && localizacao.opcoes?.length > 1) {
          u._cidadesMultiplas = localizacao.opcoes
          const opcoesLista = localizacao.opcoes.slice(0, 4).map((op, i) => ({
            id: `revalida_cidade_multipla_${i}`,
            title: abreviarCidadeBotao(op.cidade, op.uf)
          }))
          if (!u.modoTexto) {
            try {
              const nomesAudio = localizacao.opcoes.slice(0, 4).map(op => `${op.cidade}, ${estadoPorExtenso(op.uf) || op.uf}`).join("; ")
              const ogg = await gerarAudioAtendente(u.atendente, `Encontrei ${numeroPorExtenso(localizacao.opcoes.length, "feminino")} cidades com esse nome: ${nomesAudio}. Selecione a opção correspondente. Se a sua cidade não aparecer, diga o nome com o estado agora.`)
              await enviarAudio(from, urlAudioAtendente(ogg))
              await new Promise(r => setTimeout(r, 4000))
            } catch (e) { logErro("tts", "Falha áudio cidades múltiplas revalida áudio", e) }
          }
          iniciarTimer(from)
          return responderComTimer(from, {
            texto: `●●●●●○ 📍 Etapa 5 de 6 · *CIDADE*\n\n🔍 Encontrei *${localizacao.opcoes.length} cidades* com esse nome. Qual é a correta?\n\n_Se não aparecer, diga ou digite o nome com o estado._`,
            opcoes: opcoesLista
          })
        }
      }
      if (!cidadeIdentificada || cidadeIdentificada.length < 2) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, `Não consegui identificar sua cidade. Você pode digitar o nome da cidade, informar o CEP com oito dígitos, ou enviar um novo áudio falando o nome da cidade devagar.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 4000))
        } catch (e) { logErro("tts", "Falha áudio erro cidade revalida", e) }
        return { texto: `●●●●●○ 📍 Etapa 5 de 6 · *CIDADE*\n\n🎙️ Não consegui entender sua cidade. Digite o nome, informe o CEP ou envie outro áudio.`, opcoes: null }
      }
      u.cidade = cidadeIdentificada
      u.uf = localizacao.uf
      u.regiao = localizacao.regiao || mapearRegiaoPorUF(localizacao.uf)
      await sincronizarContatoNegocioHubSpot(u)
      const estadoFull = estadoPorExtenso(localizacao.uf) || localizacao.uf || ""
      if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
      u._revalidaConfirmados.push("cidade")
      return await proximaConfirmacaoProgressiva(from, u, {
        introducaoAudio: `Entendi! Cidade atualizada para ${cidadeIdentificada}${estadoFull ? ", " + estadoFull : ""}.`
      })
    } catch (e) {
      logErro("tts", "Falha transcrição cidade revalida por áudio", e)
      return { texto: `Não consegui processar seu áudio. Por favor, digite sua cidade ou CEP.`, opcoes: null }
    }
  }

  if (clientPostIntakeAction === CLIENT_POST_INTAKE_ACTIONS.COLLECT_PHONE && ehAudio) {
    try {
  await enviar(from, "👂 Estou ouvindo seu áudio...", null, false)
      const mediaId = msgObj.audio?.id || msgObj.voice?.id
      if (!mediaId) {
        return {
          texto: `Não consegui receber o áudio. Por favor, *digite seu número com DDD*.`,
          opcoes: null
        }
      }
      const midia = await baixarMidia(mediaId)
      const transcricao = await transcrever(midia.buffer, midia.mimeType, { origem: "telefone" })

      // Extrai apenas os dígitos da transcrição
      const apenasDigitos = transcricao.replace(/\D/g, "")

      if (apenasDigitos.length < 10) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente,
            `Não consegui identificar o número corretamente.
            Por favor, diga apenas os números.
            Primeiro o DDD com dois dígitos, depois o número completo.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio número inválido", e) }
        return {
        texto: `Não consegui identificar o número. Por favor, tente novamente.\n\nExemplo: *DDD 9 0000-0000*`,
          opcoes: null
        }
      }

      // Formata o número para exibição e leitura
      const ddd = apenasDigitos.slice(0, 2)
      const nono = apenasDigitos.slice(2, 3)
      const bloco1 = apenasDigitos.slice(3, 7)
      const bloco2 = apenasDigitos.slice(7, 11)
      const numeroLegivel = `DDD ${ddd.split("").join(" ")} ${nono} ${bloco1.slice(0,2)} ${bloco1.slice(2,4)} ${bloco2.slice(0,2)} ${bloco2.slice(2,4)}`
      const numeroFormatado = `${ddd} ${nono}${bloco1}-${bloco2}`

      u._telefoneTemp = normalizarNumeroWhatsAppEnvio(apenasDigitos)
      setStage(u, STAGES.COLETA_TEL_WPP_CONFIRMA)
      iniciarTimer(from)

      try {
        const ogg = await gerarAudioAtendente(u.atendente,
          `Entendi! O número informado é ${numeroLegivel}.
          Está correto?
          Primeira opção: Sim, está correto.
          Segunda opção: Corrigir número.`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 4000))
      } catch (e) { logErro("tts", "Falha áudio confirmar telefone", e) }

      return {
        texto: `●●●●○○ 📱 Etapa 4 de 6 · *WHATSAPP*\n\n📋 O número informado é *${numeroFormatado}*.\n\nEstá correto?`,
        opcoes: [
          { id: "tel_confirmar", title: "✅ Sim, está correto" },
          { id: "tel_corrigir", title: "✏️ Corrigir número" }
        ]
      }
    } catch (e) {
      logErro("tts", "Falha transcrição telefone por áudio", e)
      return {
        texto: `Não consegui processar seu áudio. Por favor, *digite seu número com DDD*.`,
        opcoes: null
      }
    }
  }

  if (clientPostIntakeAction === CLIENT_POST_INTAKE_ACTIONS.CONFIRM_PHONE) {
    if (text === "tel_confirmar") {
      u.whatsappContato = normalizarNumeroWhatsAppEnvio(u._telefoneTemp)
      u.whatsappVerificado = true
      u.telefoneEhDoCliente = true
      delete u._telefoneTemp
      if (u._corrigindoWhatsappConfirmacao) {
        delete u._corrigindoWhatsappConfirmacao
        return responderComTimer(from, await voltarParaConfirmacao(from, u))
      }
      if (u._revalidandoCampos) {
        if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
        u._revalidaConfirmados.push("whatsapp")
        return await proximaConfirmacaoProgressiva(from, u)
      }
      return await flowAcolhimentoCidade(u, { from })
    }
    if (text === "tel_corrigir") {
      setStage(u, STAGES.COLETA_TEL_WPP)
      iniciarTimer(from)
      try {
        const ogg = await gerarAudioAtendente(u.atendente,
          `Tudo bem! Por favor, informe seu número novamente.
          Diga apenas os números, começando pelo DDD.
          Por exemplo: oito um, nove, nove quatro seis zero, dois dois dois zero.`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 4000))
      } catch (e) { logErro("tts", "Falha áudio corrigir telefone", e) }
      return {
        texto: `Por favor, informe seu número novamente.\n\nExemplo: *DDD 9 0000-0000*`,
        opcoes: null
      }
    }
  }

  if (clientPostIntakeAction === CLIENT_POST_INTAKE_ACTIONS.PROCESS_THIRD_PARTY && u.stage === STAGES.COLETA_TEL_OUTRO && ehAudio) {
    try {
      const mediaId = msgObj?.[tipo]?.id
      if (!mediaId) {
        return responderComTimer(from, {
          texto: "Não consegui processar seu áudio. Por favor, digite o nome completo da pessoa atendida.",
          opcoes: null
        })
      }

  await enviar(from, "👂 Estou ouvindo seu áudio...", null, false)
      const midia = await baixarMidia(mediaId)
      if (!midia) {
        return responderComTimer(from, {
          texto: "Não consegui baixar esse áudio. Pode tentar novamente ou digitar o nome completo da pessoa atendida.",
          opcoes: null
        })
      }

      const transcricao = await transcrever(midia.buffer, midia.mimeType, {
        origem: "nome",
        prompt: "Transcreva em português brasileiro com foco em identificar apenas o nome completo da pessoa atendida."
      })
      const nomeLimpo = await extrairNomeAudio(transcricao)
      const validacaoNomeTerceiro = nomeLimpo ? ehNomeAparente(nomeLimpo, transcricao || "") : false

      if (!nomeLimpo || validacaoNomeTerceiro === false) {
        return responderComTimer(from, {
          texto: "Não consegui entender o nome. Pode falar o nome completo devagar ou digitar?",
          opcoes: null
        })
      }

      if (validacaoNomeTerceiro === "incompleto") {
        return responderComTimer(from, {
          texto: "Preciso do nome completo da pessoa atendida. Por favor, informe também o sobrenome.",
          opcoes: null
        })
      }

      return await prepararConfirmacaoEntrada(from, u, "nome", nomeLimpo, "coleta_tel_outro")
    } catch (e) {
      logErro("audio_nome_terceiro", "Falha ao processar nome do terceiro por áudio", e)
      return responderComTimer(from, {
        texto: "Não consegui processar esse áudio. Por favor, digite o nome completo da pessoa atendida.",
        opcoes: null
      })
    }
  }

  if (ehAudio && !ehDoc) {
    const respostaAudioCadastral = await transcreverAudioRespostaCadastral(from, u, msgObj, tipo)
    if (respostaAudioCadastral?.erro) {
      // ACOLHIMENTO_PARA_QUEM: além do aviso de erro, reapresenta a própria
      // pergunta ("é para você ou para outra pessoa?") para o cliente não
      // ficar sem contexto. Mantém o comportamento de áudio da etapa
      // (pré-escolha definitiva de modo, sempre áudio + texto).
      if (u.stage === STAGES.ACOLHIMENTO_PARA_QUEM) {
        await enviar(from, respostaAudioCadastral.erro, null, false)
        iniciarTimer(from)
        return await telaParaQuem(from, u)
      }
      return responderComTimer(from, { texto: respostaAudioCadastral.erro, opcoes: null })
    }
    if (respostaAudioCadastral?.text) text = respostaAudioCadastral.text
  }

  const respostaAudioFluxo = await processarAudioNoFluxo(from, nomeWA, u, msgObj, tipo, ehAudio)
  if (respostaAudioFluxo) return respostaAudioFluxo

  const respostaUrgenciaOuCorrecao = await processarUrgenciaOuCorrecao(from, u, text, msgObj, ehDoc, ehAudio)
  if (respostaUrgenciaOuCorrecao) return respostaUrgenciaOuCorrecao

  // Novo fluxo humanizado
  if (u.stage === STAGES.ACOLHIMENTO) {
    if (!u.atendente) u.atendente = sortearAtendente()
    iniciarTimer(from)

    // se veio do Voltar da confirmação, pular apresentação institucional
    if (u._voltandoConfirmacao) {
      u._voltandoConfirmacao = false
      setStage(u, STAGES.AUDIO_AGUARDANDO)
      return {
        texto: `Me conta sua situação. 😊\n\nPode falar em áudio 🎙️ ou digitar ✍️, do jeito que for mais fácil pra você.\n\n_Vou preparar tudo para o advogado já chegar pronto para te atender._ ⚖️`,
        opcoes: null
      }
    }

    // Apresentação completa — somente no atendimento inicial (imagem + texto juntos via caption)
    try {
      const textoBoasVindasCompleto = `Olá 😊\n\nSeja muito bem-vindo(a) à *Oráculum Advocacia.*\n\nEu sou *${u.atendente}* e vou acompanhar você durante este atendimento. Nossa equipe atua nas áreas *Previdenciária*, *Trabalhista* e em outras demandas jurídicas, sempre com atenção e cuidado com o seu caso. 💙\n\n⚖️ *Ao final do cadastro, você poderá falar diretamente com um advogado.*\n\nVocê pode digitar *recomeçar* ou *encerrar* a qualquer momento.\n\nConte comigo.\n\n━━━━━━━━━━━━━━━\n_Seus dados são tratados com sigilo e utilizados exclusivamente para fins jurídicos, conforme a LGPD._`
      const imagemUrl = IMAGEM_BOAS_VINDAS_URL
      const enviada = await enviarImagemWhatsApp(from, imagemUrl, textoBoasVindasCompleto)
      if (!enviada) await enviar(from, textoBoasVindasCompleto)
    } catch (e) {
      logErro("boas-vindas", "Falha ao enviar imagem de boas-vindas", e)
      await enviar(from, `Olá 😊\n\nSeja muito bem-vindo(a) à *Oráculum Advocacia.*\n\nEu sou *${u.atendente}* e vou acompanhar você durante este atendimento. Nossa equipe atua nas áreas *Previdenciária*, *Trabalhista* e em outras demandas jurídicas, sempre com atenção e cuidado com o seu caso. 💙\n\n⚖️ *Ao final do cadastro, você poderá falar diretamente com um advogado.*\n\nVocê pode digitar *recomeçar* ou *encerrar* a qualquer momento.\n\nConte comigo.\n\n━━━━━━━━━━━━━━━\n_Seus dados são tratados com sigilo e utilizados exclusivamente para fins jurídicos, conforme a LGPD._`)
    }
    // Após apresentação, pergunta o modo de atendimento preferido (etapa 1 de 6)
    return await telaEscolhaModo(from, u, { comBoasVindas: true })
  }

  if (u.stage === STAGES.ESCOLHA_CANAL) {
    if (text === "canal_texto") {
      u.modoTexto = true
      return await iniciarFluxoRelatoLivre(from, u, { boasVindas: false })
    }
    if (text === "canal_audio") {
      setStage(u, STAGES.AUDIO_AGUARDANDO)
      iniciarTimer(from)

      try {
        const ogg = await gerarAudioAtendente(u.atendente,
          `Você escolheu o atendimento por voz. Vou fazer uma pergunta por vez. Comece contando o que aconteceu e, quando terminar, envie o áudio.`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 4000))
      } catch (e) { logErro("tts", "Falha áudio aguardando", e) }

      return {
        texto: `🎙️ *Conte o que aconteceu*\n\nEnvie um áudio com a sua situação.\n\n_Se preferir, pode digitar._`,
        opcoes: null
      }
    }
    iniciarTimer(from)
    return await iniciarFluxoRelatoLivre(from, u, { boasVindas: false })
  }

  if (u.stage === STAGES.AUDIO_OPCOES) {
    if (text === "audio_enviar") {
      setStage(u, STAGES.AUDIO_AGUARDANDO)
      iniciarTimer(from)

      try {
        const ogg = await gerarAudioAtendente(u.atendente,
          `Pode começar. Conte o que aconteceu e, quando terminar, envie o áudio.`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 4000))
      } catch (e) { logErro("tts", "Falha áudio aguardando", e) }

      return {
        texto: `🎙️ *Conte o que aconteceu*\n\nEnvie um áudio com a sua situação.\n\n_Se preferir, pode digitar._`,
        opcoes: null
      }
    }
    if (text === "canal_texto") {
      u.modoTexto = true
      return await iniciarFluxoRelatoLivre(from, u, { boasVindas: false })
    }
    if (text === "audio_voltar_texto") {
      u.modoTexto = true
      return await iniciarFluxoRelatoLivre(from, u, { boasVindas: false })
    }
    iniciarTimer(from)
    return await iniciarFluxoRelatoLivre(from, u, { boasVindas: false })
  }

  if (u.stage === STAGES.AUDIO_AGUARDANDO) {
    if (text === "canal_texto") {
      u.modoTexto = true
      return await iniciarFluxoRelatoLivre(from, u, { boasVindas: false })
    }
    if (text === "audio_voltar_texto") {
      u.modoTexto = true
      return await iniciarFluxoRelatoLivre(from, u, { boasVindas: false })
    }
    if (text) {
      // Usuário digitou em vez de enviar áudio — tratar como transcrição manual
      // 1ª passagem: só regras, sem IA (rápido — detecta terceiro/duvida/relato por regex)
      const intervencaoSituacao = await tratarIntervencaoPreAtendimento(from, u, u.stage, text, { usarIA: false })
      if (intervencaoSituacao) return intervencaoSituacao
      // 2ª passagem: com IA completa, incluindo conduzirPreAtendimentoIA como fallback
      // Cobre textos curtos e frases inesperadas que as regras não reconheceram
      const intervencaoSituacaoIA = await tratarIntervencaoPreAtendimento(from, u, u.stage, text)
      if (intervencaoSituacaoIA) return intervencaoSituacaoIA
      // Se ainda não houve intervenção, perguntar como o usuário prefere prosseguir
      try {
        const classificacaoCheck = await classificarEntradaPreAtendimento(u.stage, text)
        if (classificacaoCheck && classificacaoCheck.tipo === "desconhecido") {
          try {
            u._ultimoTextoConfuso = text
          } catch (e) { /* ignore */ }
          return await telaEsclarecimentoConfuso(from, u)
        }
      } catch (e) { logErro("classificacao", "erro verificação desconhecido", e) }
      // Só chega aqui se a IA também não conseguiu gerar resposta (ex: GROQ_KEY ausente)
      if (text && text.replace(/\s+/g, "").length < 20) {
        iniciarTimer(from)
        return await responderTelaComAudio(
          from,
          u,
          {
            texto: `💬 Entendi que você precisa de ajuda!\n\nPara que eu possa preparar seu caso direitinho, me conta um pouco mais sobre o que está acontecendo.\n\nPode falar à vontade. 😊`,
            opcoes: null
          },
          "Entendi que você precisa de ajuda. Para preparar seu caso direitinho, me conte um pouco mais sobre o que está acontecendo. Pode falar à vontade.",
          "situacao curta"
        )
      }
      await enviar(from, "👀 Lendo sua mensagem...")
      u._audioCanalTranscricao = acumularRelato(u, text)

      // Detector de sofrimento intenso — responde com acolhimento antes de classificar
      if (detectarSofrimentoIntenso(text) && !u._jaAcolheuSofrimento) {
        u._jaAcolheuSofrimento = true
        const msgAcolhimento = gerarMensagemAcolhimento(text)
        await enviar(from, msgAcolhimento)
        if (!u.modoTexto && u.atendente) {
          try {
            const textoAudio = removerFormatacaoParaAudio(msgAcolhimento)
            const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 3000))
          } catch (e) { logErro("tts", "Falha áudio acolhimento sofrimento", e) }
        }
      }

      const classificacao = await classificarAreaAudio(u._audioCanalTranscricao)
      iniciarTimer(from)
      // Relato coletado por pedirRelatoAposNome — sair do modo revalidação e seguir normalmente
      if (u._revalidandoCampos && u._aguardandoRelatoAposNome) {
        u._aguardandoRelatoAposNome = false
        u._revalidandoCampos = false
      }
      // "Recomeçar" — confirmação progressiva campo a campo
      if (u._revalidandoCampos) {
        aplicarClassificacaoJuridica(u, classificacao)
        u._revalidaConfirmados = []
        return await proximaConfirmacaoProgressiva(from, u, {
          introducaoAudio: `Atualizei sua situação. Agora vou confirmar seus dados com você.`
        })
      }
      // "Voltar" da confirmação: atualiza a situação e revisa campos um a um (igual ao áudio)
      if (u._voltandoConfirmacao) {
        aplicarClassificacaoJuridica(u, classificacao)
        u._voltandoConfirmacao = false
        u._revalidandoCampos = true
        u._revalidaConfirmados = []
        return await proximaConfirmacaoProgressiva(from, u, {
          introducaoAudio: `Atualizei sua situação. Agora vou confirmar seus dados com você.`
        })
      }

      // Guarda: classificação fraca → pede esclarecimento antes de avançar
      if (deveEsclarecerRelato(u, classificacao)) {
        u._jaEsclareceuRelato = true
        setStage(u, STAGES.AUDIO_AGUARDANDO)
        const pergunta = gerarPerguntaEsclarecimentoRelato(classificacao, u._audioCanalTranscricao)
        return responderComTimer(from, { texto: pergunta, opcoes: null })
      }

      aplicarClassificacaoJuridica(u, classificacao)
      u._jaEsclareceuRelato = false
      return await flowAssessoriaInicial(u, { from, origem: "texto" })
    }
  }

  const resultadoConfirmacaoAudio = await handleAudioConfirmation({
    u,
    texto: text,
    from,
    stages: STAGES,
    setStage,
    iniciarTimer,
    telaConfirmarAreaAudio,
    responderComTimer,
    classificarAreaAudio,
    aplicarClassificacaoJuridica,
    gerarAudioAtendente,
    enviarAudio,
    urlAudioAtendente,
    esperar: ms => new Promise(resolve => setTimeout(resolve, ms)),
    logErro,
    normalizarTextoCRM,
    telaConfirmarTranscricao
  })
  if (resultadoConfirmacaoAudio.handled) return resultadoConfirmacaoAudio.response

  if (u.stage === STAGES.ASSESSORIA_INICIAL) {
    // "Continuar" — modo já definido na etapa 1, apenas avança o fluxo
    if (text === "continuar_audio") {
      iniciarTimer(from)
      // Se veio do Voltar/Recomeçar, retoma revalidação campo a campo
      if (u._revalidandoCampos) {
        u._revalidaConfirmados = u._revalidaConfirmados || []
        return await proximaConfirmacaoProgressiva(from, u, {
          introducaoAudio: `Atualizei sua situação. Agora vou confirmar seus dados com você.`
        })
      }
      const proximaNovoCaso = await proximaEtapaNovoCasoClienteAposModo(from, u)
      if (proximaNovoCaso) return proximaNovoCaso
      if (!u.nomeConfirmado) {
        return await telaParaQuem(from, u)
      }
      // Fluxo de terceiro: nome já coletado, próxima etapa é o WhatsApp da pessoa atendida
      if (u.atendimentoParaTerceiro) {
        iniciarTimer(from)
        return await flowColetaTelWppContato(u, { from })
      }
      // Fluxo "para mim": nome já confirmado — vai direto para WhatsApp
      if (u.nomeConfirmado) {
        return await flowAcolhimentoConfirmaWhatsapp(u, { from })
      }
      setStage(u, STAGES.ACOLHIMENTO_NOME)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, `Ótimo! Agora preciso saber seu nome completo. Você pode falar em áudio ou digitar.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio nome assessoria", e) }
      }
      return {
        texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n😊 Fico feliz em poder ajudar! Para começar, qual é o seu nome completo?\n\n_${u.modoTexto ? "Digite seu nome abaixo." : "Pode falar em áudio ou digitar."}_`,
        opcoes: null
      }
    }
    if (text === "relato_novo") {
      u._relatoAnterior = u._audioCanalTranscricao || null
      u._audioCanalTranscricao = null
      setStage(u, STAGES.AUDIO_AGUARDANDO)
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente,
            `Sem problema! Pode explicar sua situação de novo agora, por áudio ou digitando. Tente contar com um pouco mais de detalhe para que o advogado chegue bem preparado.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 4000))
        } catch (e) { logErro("tts", "Falha áudio nova situação", e) }
      }
      if (process.env.IMAGEM_RELATO_URL) {
        try {
          const enviada = await enviarImagemWhatsApp(from, process.env.IMAGEM_RELATO_URL, `🎙️ Pode explicar sua situação de novo agora, por áudio ou digitando.\n\nQuanto mais detalhes, melhor o advogado chega preparado.`, null)
          if (enviada) return { texto: null, opcoes: null }
        } catch (e) { logErro("imagem", "Falha imagem explicar de novo", e) }
      }
      return {
        texto: `🎙️ Pode explicar sua situação de novo agora, por áudio ou digitando.\n\nQuanto mais detalhes, melhor o advogado chega preparado.`,
        opcoes: null
      }
    }
    // Texto livre = complemento/correção ao relato já feito (sem botão necessário).
    // Em vez de descartar o relato anterior e reprocessar do zero em AUDIO_AGUARDANDO
    // (o que fazia o classificador interpretar o complemento isoladamente, às vezes
    // como "duvida" sobre a área, perdendo todo o contexto já coletado), anexamos o
    // texto novo ao relato existente e regeramos a tela "Foi isso que entendi?".
    if (text && text !== "continuar_audio") {
      const complemento = normalizarTextoCRM(text)
      const relatoAnterior = sanitizarTextoEntrada(u._audioCanalTranscricao || u.descricao || "")
      u._audioCanalTranscricao = relatoAnterior ? `${relatoAnterior}. ${complemento}` : complemento
      u.descricao = u._audioCanalTranscricao
      iniciarTimer(from)
      const classificacao = await classificarAreaAudio(u._audioCanalTranscricao)
      aplicarClassificacaoJuridica(u, classificacao)
      return await flowAssessoriaInicial(u, {
        from,
        origem: "texto",
        introducaoAudio: "Entendi! Vou acrescentar essa informação ao que você já me contou."
      })
    }
    iniciarTimer(from)
    return responderComTimer(from, {
      texto: `Confirme ou me conte a situação de novo. Pode falar ou digitar. 🎙️`,
      opcoes: [
        { id: "continuar_audio", title: "✅ Está correto" }
      ]
    })
  }

  if (u.stage === STAGES.AUDIO_CONFIRMAR_AREA_CANAL) {
    if (text === "audio_transcricao_texto") {
      setStage(u, STAGES.AUDIO_AGUARDANDO)
      iniciarTimer(from)
      return await responderTelaComAudio(
        from,
        u,
        {
          texto: `✍️ Digite novamente sua situação com suas próprias palavras.\n\n_Escreva à vontade. Estou aqui para ajudar._`,
          opcoes: null
        },
        "Tudo bem. Digite novamente sua situação com suas próprias palavras. Escreva à vontade, estou aqui para ajudar.",
        "corrigir situacao area"
      )
    }
    if (text === "audio_area_canal_sim") {
      if (!u.nomeConfirmado) {
        setStage(u, STAGES.ACOLHIMENTO_NOME)
        iniciarTimer(from)
        try {
          const ogg = await gerarAudioAtendente(u.atendente,
            `Ótimo! Agora preciso saber seu nome completo. Você pode digitar ou enviar um áudio falando seu nome.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio nome", e) }
        return {
          texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nPerfeito! ✅\n\n😊 Fico feliz em poder ajudar! Para começar, qual é o seu nome completo?\n\n_Você pode digitar ou enviar um áudio com seu nome._`,
          opcoes: null
        }
      }
      setStage(u, STAGES.AUDIO_CONFIRMAR_DADOS)
      iniciarTimer(from)
      return await telaConfirmarDadosAudio(from, u)
    }
    if (text === "audio_area_canal_nao") {
      u._audioCanalTranscricao = null
      u._areaDetectada = null
      u.area = null
      setStage(u, STAGES.AUDIO_AGUARDANDO)
      iniciarTimer(from)
      try {
        const ogg = await gerarAudioAtendente(u.atendente,
          `Tudo bem. Me conte novamente o que aconteceu, com um pouco mais de detalhe, para eu analisar melhor a área do seu caso.`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3000))
      } catch (e) { logErro("tts", "Falha áudio corrigir situacao area", e) }
      return {
        texto: "Tudo bem. Me conte novamente o que aconteceu, com um pouco mais de detalhe, para eu analisar melhor a área do seu caso.\n\n_Pode enviar áudio ou digitar._",
        opcoes: null
      }
    }
  }

  if (u.stage === STAGES.AUDIO_CONFIRMAR_DADOS) {
    if (text === "audio_dados_confirmar") {
      u.descricao = u._audioCanalTranscricao || u.descricao
      try {
        const casoAnteriorCliente = u._casoAnteriorCliente
        const casoParaTerceiro = ehFinalizacaoCasoTerceiro(u)
        const eraNovoCasoDeCliente = Boolean(u._novoCasoDeCliente)
        const numeroCaso = await finalizarCadastro(from, u)
        // marcar que o caso foi recém-aberto para que "Enviar documentos"
        // vá direto para o fluxo de docs sem exibir seleção de caso (espelho do conf_ok)
        u._casoRecemAberto = true
        if (eraNovoCasoDeCliente) u._contextoDocsCasoAtual = criarContextoDocsCasoAtual(u, numeroCaso)
        if (casoParaTerceiro) {
          u._casoRecemAberto = false
          u._contextoDocsCasoAtual = null
          const respostaTerceiro = await finalizarCadastroTerceiroEVoltarOrigem(from, u, numeroCaso, casoAnteriorCliente)
          await enviarAudioModoVoz(
            from,
            u,
            `Caso registrado com sucesso. O número do caso é ${numeroCaso.split("").join(" ")}. A continuidade será pelo WhatsApp informado da pessoa atendida. Ela poderá enviar menu no próprio WhatsApp para acompanhar o atendimento. Nesta conversa, você voltou para o seu atendimento original.`,
            "novo caso terceiro registrado"
          )
          return respostaTerceiro
        }
        if (!u._contextoDocsCasoAtual) u._contextoDocsCasoAtual = criarContextoDocsCasoAtual(u, numeroCaso)
        const docs = getDocumentosCaso(u)
        const primeiroNome = primeiroNomeCliente(u) || "você"

        try {
          const textoAudioCadastro = eraNovoCasoDeCliente
            ? `Pronto, ${primeiroNome}. Seu novo caso foi registrado com sucesso. O número do caso é ${numeroCaso.split("").join(" ")}. Um especialista vai analisar essa nova situação e entrar em contato em breve pelo WhatsApp. Você pode enviar documentos, falar com advogado ou voltar ao menu do cliente.`
            : `Parabéns, ${primeiroNome}! Você agora é cliente do Escritório Oráculum. Seu número de caso é ${numeroCaso.split("").join(" ")}. Um especialista vai analisar sua situação e entrar em contato em breve pelo WhatsApp. Você já pode agendar uma consulta, enviar documentos ou acompanhar o status do seu caso.`
          const ogg = await gerarAudioAtendente(u.atendente,
            textoAudioCadastro)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 6000))
        } catch (e) { logErro("tts", "Falha áudio cadastro realizado", e) }

        const textoCasoRegAudio = `🎉 *${primeiroNome}, seu caso foi registrado!*\n\n📄 *Número do caso:* \`\`\`${numeroCaso}\`\`\`\n\n_Guarde esse número. É com ele que identificamos seu atendimento por aqui._\n\nSeu caso foi encaminhado a um especialista em *${u.area ? "Direito " + u.area : "Direito"}*, que fará a análise e entrará em contato em breve.\n\n⏱️ Prazo estimado: até 2 dias úteis\n\n━━━━━━━━━━━━━━━\n📋 *Documentos que podem ser necessários:*\n${docs}\n\nVocê pode enviar agora ou depois, como preferir.`
        const opcoesCasoRegAudio = [
      { id: "m_adv",      title: "👨‍⚖️ Falar com advogado" },
      { id: "m_docs", title: "📎 Enviar documentos" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
        ]
        if (IMAGEM_CASO_REGISTRADO_URL) {
          const enviada = await enviarImagemWhatsApp(from, IMAGEM_CASO_REGISTRADO_URL, textoCasoRegAudio, opcoesCasoRegAudio)
          if (enviada) return { texto: null, opcoes: null }
        }
        return { texto: textoCasoRegAudio, opcoes: opcoesCasoRegAudio }
      } catch (e) {
        const detalhesErroFinalizacaoAudio = [
          `Falha ao finalizar cadastro (audio_dados_confirmar): ${e.message}`,
          e.code ? `code=${e.code}` : null,
          e.operation ? `operation=${e.operation}` : null,
          Array.isArray(e.violations) && e.violations.length ? `violations=${e.violations.join(",")}` : null
        ].filter(Boolean).join(" | ")
        logErro("finalizarCadastro", detalhesErroFinalizacaoAudio, e)
        setStage(u, STAGES.AUDIO_CONFIRMAR_DADOS)
        return responderComTimer(from, {
          texto: `⚠️ Ocorreu um problema ao registrar seu caso. Seus dados estão salvos.\n\nPor favor, tente confirmar novamente.`,
          opcoes: [
            { id: "audio_dados_confirmar", title: "🔄 Tentar novamente" },
            { id: "audio_dados_corrigir", title: "✏️ Corrigir dados" }
          ]
        })
      }
    }

    if (text === "audio_dados_corrigir") {
      setStage(u, STAGES.CORRIGIR_DADOS)
      u._retornarParaConfirmacao = true
      u._origemConfirmacao = "audio"
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente,
            `Claro! Me diga o que deseja corrigir. Pode falar em áudio ou digitar. Por exemplo: meu nome está errado, a cidade está errada, ou o WhatsApp está errado.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio corrigir dados", e) }
      }
      return {
        texto: `✏️ *O que você gostaria de corrigir?*\n\n_Pode digitar ou enviar um áudio dizendo o que está errado. Por exemplo: "meu nome está errado", "a cidade não está certa" ou "o WhatsApp está errado"._`,
        opcoes: null
      }
    }

    if (text === "conf_menu") {
      if (ehFinalizacaoCasoTerceiro(u)) {
        iniciarTimer(from)
        const temCasoAnterior = Boolean(u._casoAnteriorCliente)
        const textoAudioVoltarAudio = temCasoAnterior
          ? "Este atendimento é para outra pessoa. Para evitar misturar com seu caso original, escolha se deseja ver a confirmação, corrigir os dados ou voltar ao seu menu."
          : "Você está abrindo um caso para outra pessoa. Escolha se deseja ver a confirmação, corrigir os dados ou cancelar o atendimento."
        await enviarAudioModoVoz(from, u, textoAudioVoltarAudio, "voltar confirmacao terceiro audio")
        return responderComTimer(from, telaVoltarConfirmacaoTerceiro(u, "audio"))
      }
      // Voltar na confirmação (modo voz, fluxo "para mim"): mesma tela intermediária
      iniciarTimer(from)
      const primeiroNomeVoltar = primeiroNomeCliente(u) || ""
      const textoAudioVoltarParaMim = primeiroNomeVoltar
        ? `${primeiroNomeVoltar}, você voltou da tela de confirmação. Escolha se deseja ver os dados novamente, corrigir alguma informação ou contar a situação de outro jeito.`
        : "Você voltou da tela de confirmação. Escolha se deseja ver os dados novamente, corrigir alguma informação ou contar a situação de outro jeito."
      await enviarAudioModoVoz(from, u, textoAudioVoltarParaMim, "voltar confirmacao audio para_mim")
      const textoTelaVoltarParaMim = primeiroNomeVoltar
        ? `⬅️ *Tudo bem, ${primeiroNomeVoltar}.*\n\nO que você gostaria de fazer?`
        : `⬅️ *Tudo bem.*\n\nO que você gostaria de fazer?`
      return responderComTimer(from, {
        texto: textoTelaVoltarParaMim,
        opcoes: [
          { id: "audio_dados_conf_ver", title: "✅ Ver meus dados" },
          { id: "audio_dados_corrigir", title: "✏️ Corrigir algo" },
          { id: "conf_menu_recontar", title: "🔄 Contar de novo" }
        ]
      })
    }
    if (text === "audio_dados_conf_ver") {
      iniciarTimer(from)
      return responderComTimer(from, await telaConfirmarDadosAudio(from, u))
    }
    if (text === "conf_menu_recontar") {
      u._revalidandoCampos = true
      u.aguardandoResposta = false
      u.aguardandoRetomada = false
      setStage(u, STAGES.AUDIO_AGUARDANDO)
      iniciarTimer(from)
      const primeiroNomeRecontarAudio = primeiroNomeCliente(u) || ""
      const saudacaoRecontarAudio = primeiroNomeRecontarAudio ? `, ${primeiroNomeRecontarAudio}` : ""
      const textoRecontarAudio = `Tudo bem${saudacaoRecontarAudio}. Pode me contar sua situação novamente${u.modoTexto ? " por texto" : " por áudio ou texto"}. Estou aqui para ajudar você.`
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, textoRecontarAudio)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha audio recontar confirmacao audio", e) }
      }
      return {
        texto: `🔄 Tudo bem${saudacaoRecontarAudio} 😊\n\nPode me contar sua situação novamente${u.modoTexto ? " por texto" : " por áudio ou texto"}. Estou aqui para ajudar você.`,
        opcoes: null
      }
    }

    if (text === "terceiro_audio_conf_continuar") {
      iniciarTimer(from)
      return responderComTimer(from, await telaConfirmarDadosAudio(from, u))
    }

    const imprevistoConfirmacaoAudio = await tratarImprevistoPreAtendimento(from, u, u.stage, text)
    if (imprevistoConfirmacaoAudio) return imprevistoConfirmacaoAudio

    iniciarTimer(from)
    return responderComTimer(from, await telaConfirmarDadosAudio(from, u))
  }

  if (u.stage === STAGES.CORRIGIR_DADOS && (text || ehAudio)) {
    // Se veio áudio, transcrever primeiro
    let textoCorrecao = text
    if (ehAudio && !textoCorrecao) {
      const mediaId = msgObj?.audio?.id || msgObj?.voice?.id
      if (mediaId) {
        const midia = await baixarMidia(mediaId)
        if (midia) {
          await enviar(from, "👂 Ouvindo...", null, false)
          textoCorrecao = await transcrever(midia.buffer, midia.mimeType, { origem: "corrigir_dados" })
        }
      }
    }
    if (!textoCorrecao) {
      if (ehAudio) return await responderFalhaAudioCorrecao(from, u)
      return responderComTimer(from, {
        texto: `✏️ *O que você gostaria de corrigir?*\n\n_Diga ou digite o que está errado. Ex: "meu nome está errado", "a cidade está errada" ou "o WhatsApp está errado"._`,
        opcoes: null
      })
    }

    // Groq identifica qual campo corrigir (com todos os 7 campos suportados)
    let campoDetectado = null
    try {
      const res = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model: "llama-3.1-8b-instant",
          messages: [{
            role: "user",
            content: `O usuário quer corrigir um dado do cadastro. Analise a mensagem e responda com UMA palavra apenas, sendo exatamente uma destas opções: nome, whatsapp, cidade, situacao, detalhe, urgencia, descricao, outro.\n\nRegras:\n- nome ? nome da pessoa está errado\n- whatsapp ? telefone, WhatsApp ou número de contato está errado\n- cidade ? cidade ou localidade está errada\n- situacao ? tipo de benefício, situação do caso\n- detalhe ? subtipo, detalhe específico do caso\n- urgencia ? urgência, prioridade, está sem receber\n- descricao ? descrição livre, relato do caso, inclusive quando a pessoa disser que a área jurídica está errada\n- outro ? não identificou\n\nMensagem: "${textoCorrecao}"\n\nResponda somente a palavra, sem mais nada.`
          }],
          max_tokens: 10,
          temperature: 0
        },
        { headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" } }
      )
      campoDetectado = res.data.choices[0].message.content.trim().toLowerCase()
    } catch (e) { logErro("groq", "Falha ao detectar campo correcao", e) }

    // Helper interno: ir para mini-stage de edição
    const irParaEditar = async (stage, textoMsg, textoAudio) => {
      u._retornarParaConfirmacao = true
      u._origemConfirmacao = u.modoTexto ? "texto" : "audio"
      setStage(u, stage)
      iniciarTimer(from)
      if (!u.modoTexto && textoAudio) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio correcao", e) }
      }
      return { texto: textoMsg, opcoes: null }
    }

    if (campoDetectado === "nome") {
      return await irParaEditar(STAGES.EDITAR_NOME,
        `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n😊 Fico feliz em poder ajudar! Para começar, qual é o seu nome completo?\n\n_Digite ou envie um áudio com seu nome._`,
        `Tudo bem! Me diga seu nome completo.`)
    }
    if (campoDetectado === "whatsapp") {
      u._retornarParaConfirmacao = true
      u._origemConfirmacao = u.modoTexto ? "texto" : "audio"
      u._corrigindoWhatsappConfirmacao = true
      setStage(u, STAGES.REVALIDA_WHATSAPP)
      iniciarTimer(from)
      const numeroAtual = formatarTelefoneExibicao(getTelefoneContato(from, u))
      if (!u.modoTexto) {
        try {
          const digitosAudio = String(getTelefoneContato(from, u) || "").replace(/\D/g, "").split("").join(" ")
          const ogg = await gerarAudioAtendente(u.atendente,
            `Seu WhatsApp de contato está como ${digitosAudio}. Está correto? Se quiser usar outro número, é só falar ou digitar o WhatsApp com DDD agora.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3500))
        } catch (e) { logErro("tts", "Falha áudio corrigir whatsapp", e) }
      }
      return responderComTimer(from, {
        texto: `Seu WhatsApp está como *${numeroAtual || from}*.\n\nEstá correto? Se quiser usar outro número, é só digitar ou falar com DDD agora. 🎙️`,
        opcoes: [
          { id: "revalida_whatsapp_ok", title: "✅ Confirmar" }
        ]
      })
    }
    if (campoDetectado === "cidade") {
      return await irParaEditar(STAGES.EDITAR_CIDADE,
        `📍 *Em qual cidade você mora?*\n\nDigite a cidade com o estado, por exemplo: Recife Pernambuco, ou informe o CEP com oito dígitos.`,
        `Tudo bem! Me diga sua cidade com o estado, por exemplo Recife Pernambuco, ou informe o CEP com oito dígitos.`)
    }
    if (campoDetectado === "area") {
      campoDetectado = "descricao"
    }
    if (campoDetectado === "situacao") {
      return await irParaEditar(STAGES.EDITAR_SITUACAO,
        `📌 *Qual é a situação correta?*\n\n_Descreva brevemente ou envie um áudio._`,
        `Tudo bem! Me conta a situação correta do seu caso.`)
    }
    if (campoDetectado === "detalhe") {
      return await irParaEditar(STAGES.EDITAR_DETALHE,
        `🔎 *Qual é o detalhe correto?*\n\n_Digite ou envie um áudio._`,
        `Tudo bem! Me diga o detalhe correto.`)
    }
    if (campoDetectado === "urgencia") {
      u._retornarParaConfirmacao = true
      u._origemConfirmacao = u._origemConfirmacao || (u.modoTexto ? "texto" : "audio")
      setStage(u, STAGES.EDITAR_URGENCIA)
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, `Tudo bem! Qual é o nível de urgência correto? Primeira opção: Alta, preciso de ajuda urgente. Segunda opção: Moderada, posso aguardar um pouco. Terceira opção: Baixa, sem pressa.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3500))
        } catch (e) { logErro("tts", "Falha áudio urgência", e) }
      }
      return {
        texto: `⚡ *Qual é o nível de urgência correto?*`,
        opcoes: [
          { id: "eu_alta",   title: "🔴 Alta" },
          { id: "eu_normal", title: "🟡 Moderada" },
          { id: "eu_baixa",  title: "🟢 Baixa" }
        ]
      }
    }
    if (campoDetectado === "descricao") {
      return await irParaEditar(STAGES.EDITAR_DESCRICAO,
        `💬 *Qual é a descrição correta do seu caso?*\n\n_Digite ou envie um áudio com a descrição atualizada._`,
        `Tudo bem! Me conta a descrição correta do seu caso. Vou juntar com o relato anterior e organizar tudo.`)
    }

    // Campo não identificado — pedir mais especificidade
    return responderComTimer(from, {
      texto: `Não entendi bem o que deseja corrigir. Pode ser mais específico?\n\nExemplos:\n• _"Meu nome está errado"_\n• _"A cidade está errada"_\n• _"O WhatsApp está errado"_\n• _"Quero mudar minha situação"_\n• _"A urgência está errada"_`,
      opcoes: null
    })
  }

  if (u.stage === STAGES.AUDIO_CONFIRMAR_AREA) {
    if (text === "audio_area_sim") {
      setStage(u, STAGES.ACOLHIMENTO_NOME)
      iniciarTimer(from)

      try {
        const ogg = await gerarAudioAtendente(u.atendente,
          `Ótimo! Agora preciso saber seu nome completo. Você pode digitar seu nome ou me enviar um áudio falando seu nome.`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3000))
      } catch (e) { logErro("tts", "Falha áudio nome", e) }

      return {
        texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nEntendi, você precisa de ajuda com *${u.area}*.\n\n😊 Fico feliz em poder ajudar! Para começar, qual é o seu nome completo?\n\n_Você pode digitar ou enviar um áudio com seu nome._`,
        opcoes: null
      }
    }
    if (text === "audio_area_nao") {
      u._areaDetectada = null
      u.area = null
      setStage(u, STAGES.AUDIO_AGUARDANDO)
      iniciarTimer(from)
      try {
        const ogg = await gerarAudioAtendente(u.atendente,
          `Tudo bem. Me conte novamente o que aconteceu, com um pouco mais de detalhe, para eu analisar melhor a área do seu caso.`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3000))
      } catch (e) { logErro("tts", "Falha áudio corrigir situacao area", e) }
      return {
        texto: "Tudo bem. Me conte novamente o que aconteceu, com um pouco mais de detalhe, para eu analisar melhor a área do seu caso.\n\n_Pode enviar áudio ou digitar._",
        opcoes: null
      }
    }
    if (text) {
      const normalized = text.toLowerCase()
      if (normalized.includes("inss") || normalized.includes("previd")) u.area = "INSS"
      else if (normalized.includes("trabalh")) u.area = "Trabalhista"
      else u.area = "Outros"
      setStage(u, STAGES.ACOLHIMENTO_NOME)
      iniciarTimer(from)

      try {
        const ogg = await gerarAudioAtendente(u.atendente,
          `Ótimo! Agora preciso saber seu nome completo. Você pode digitar seu nome ou me enviar um áudio falando seu nome.`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3000))
      } catch (e) { logErro("tts", "Falha áudio nome", e) }

      return {
        texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nPerfeito, vamos seguir com *${u.area}*.\n\n😊 Fico feliz em poder ajudar! Para começar, qual é o seu nome completo?\n\n_Você pode digitar ou enviar um áudio com seu nome._`,
        opcoes: null
      }
    }
    iniciarTimer(from)
    return responderComTimer(from, await telaConfirmarArea(from, u, u.area || "Outros"))
  }

  // ── ACOLHIMENTO_PARA_QUEM ────────────────────────────────────────────────
  // ── ACOLHIMENTO_MODO ─────────────────────────────────────────────────────
  // Processa a escolha de modo. Define u.modoTexto e avança para telaParaQuem.
  if (u.stage === STAGES.ACOLHIMENTO_MODO) {
    const modoAtendimento = detectarModoAtendimento(text)
    if (modoAtendimento) {
      definirPreferenciaComunicacao(u, from, modoAtendimento === "texto" ? "texto" : "audio_sempre", "pre_atendimento")
      iniciarTimer(from)
      return await telaParaQuem(from, u)
    }
    iniciarTimer(from)
    return await telaEscolhaModo(from, u, { comAudio: true })
  }

  // Pergunta estrutural: o atendimento é para o próprio contato ou para outra pessoa?
  // Elimina a ambiguidade na coleta de nome downstream.
  if (u.stage === STAGES.ACOLHIMENTO_PARA_QUEM) {
    const textoNormParaQuem = normalizarTextoGatilho(text)
    const ehParaMim = text === "para_quem_eu" || /\b(para mim|é meu|sou eu|eu mesmo|meu caso)\b/.test(textoNormParaQuem)
    const ehParaOutro = text === "para_quem_outro" || /\b(para (ela|ele|outra|minha|meu)|é dela|é dele|outra pessoa)\b/.test(textoNormParaQuem)

    // Marcadores de dúvida/incerteza explícita — só avaliados em texto livre
    // (botões "para_quem_eu"/"para_quem_outro" nunca são ambíguos).
    const ehBotao = text === "para_quem_eu" || text === "para_quem_outro"
    const temDuvidaExplicita = !ehBotao &&
      /\b(nao sei|não sei|talvez|nao tenho certeza|não tenho certeza|fico em duvida|fico em dúvida|nao sei dizer|não sei dizer)\b/.test(textoNormParaQuem)

    // Ambíguo quando: (a) ambos os padrões batem ao mesmo tempo, ou
    // (b) há dúvida explícita junto com qualquer classificação.
    const respostaAmbiguaParaQuem = (ehParaMim && ehParaOutro) || (temDuvidaExplicita && (ehParaMim || ehParaOutro))

    if (ehParaMim && !respostaAmbiguaParaQuem) {
      // Resetar flags de terceiro — o caso é para o próprio contato
      u.atendimentoParaTerceiro = false
      u.telefoneEhDoCliente = null
      u.relacaoComAtendido = null
      u._nomeTitularOrigem = null
      u._nomeTemp = null
      // Delega para função dedicada — mesma estrutura do fluxo de terceiro
      return await perguntarNomeProprio(from, u)
    }

    if (ehParaOutro && !respostaAmbiguaParaQuem) {
      // Confirmar/reforçar flags de terceiro e primeiro coletar o nome de quem está
      // no WhatsApp (nomeContato), para só depois pedir o nome da pessoa atendida.
      u.atendimentoParaTerceiro = true
      u.telefoneEhDoCliente = false
      u._nomeTitularOrigem = "atendido"
      u._nomeTemp = null
      // Tentar extrair a relação específica do texto livre (ex: "para minha filha" → "filha")
      // Só sobrescreve se o texto vier de digitação/áudio livre (não de botão)
      if (text !== "para_quem_outro") {
        const relacaoDetectada = relacaoTerceiroPreAtendimento(text)
        if (relacaoDetectada && relacaoDetectada !== "pessoa atendida") {
          u.relacaoComAtendido = relacaoDetectada
        }
      }
      setStage(u, STAGES.ACOLHIMENTO_NOME_CONTATO)
      iniciarTimer(from)
      const _relacaoAudioParaOutro = u.relacaoComAtendido
      const _labelAudioParaOutro = {
        mae: "sua mãe", pai: "seu pai", filho: "seu filho", filha: "sua filha",
        esposa: "sua esposa", esposo: "seu esposo", conjuge: "seu cônjuge",
        irmao: "seu irmão", irma: "sua irmã", avo: "seu avô ou avó", terceiro: "outra pessoa"
      }[_relacaoAudioParaOutro] || descricaoRelacaoTerceiroPreAtendimento(_relacaoAudioParaOutro) || "outra pessoa"
      const audioNomeContato = audioSolicitarNomeRepresentante()
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, audioNomeContato)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3500))
        } catch (e) { logErro("tts", "Falha áudio nome_contato terceiro", e) }
      }
      return {
        texto: textoSolicitarNomeRepresentante(),
        opcoes: null
      }
    }

    // Resposta ambígua (ex: "não sei se é para mim ou para outra pessoa"):
    // não avança o fluxo nem delega ao classificador de imprevisto —
    // apenas reapresenta a pergunta da etapa.
    if (respostaAmbiguaParaQuem) {
      iniciarTimer(from)
      return await telaParaQuem(from, u)
    }

    // Resposta não reconhecida — tenta tratar como imprevisto contextual antes de reapresentar
    if (text) {
      const imprevistoParaQuem = await tratarImprevistoPreAtendimento(from, u, u.stage, text)
      if (imprevistoParaQuem) return imprevistoParaQuem
    }
    iniciarTimer(from)
    return await telaParaQuem(from, u)
  }

  // ── ACOLHIMENTO_NOME_CONTATO ─────────────────────────────────────────────
  // Coleta o nome de quem está no WhatsApp quando o atendimento é para terceiro.
  // Salva em u.nomeContato e depois pede o nome da pessoa atendida.
  const clientIntakeDecisionAtual = routeClientIntake(
    { text, isAudio: ehAudio },
    { stage: u.stage, stages: STAGES }
  )
  const { legacyAction: clientPostIntakeActionAtual } = routeClientPostIntake(clientIntakeDecisionAtual, {
    text,
    isAudio: ehAudio,
    stage: u.stage,
    stages: STAGES
  })

  if (clientPostIntakeActionAtual === CLIENT_POST_INTAKE_ACTIONS.PROCESS_THIRD_PARTY && u.stage === STAGES.ACOLHIMENTO_NOME_CONTATO && text) {

    // 1. Tenta extrair nome — primeiro por padrões de correção explícita ("meu nome é X",
    //    "me chamo X"), depois por remoção de prefixo simples, depois por limpeza pura.
    const nomeCorrecaoContato = extrairNomeDaCorrecaoExplicita(text)
    const textoNormalizado = nomeCorrecaoContato
      ? null // já extraiu o nome correto
      : text
          .replace(/^(meu nome [eé]|me chamo|pode chamar de|sou [oa]?|aqui [eé])\s*/i, "")
          .trim()
    const nomeLimpo = nomeCorrecaoContato || formatarNome(limparTextoSomenteLetras(textoNormalizado))
    const validacaoNomeContato = ehNomeAparente(nomeLimpo, nomeCorrecaoContato ? nomeLimpo : (textoNormalizado || text))

    if (validacaoNomeContato === true) {
      // Nome extraído com sucesso — segue para confirmação
      u._nomeContatoTemp = nomeLimpo
      setStage(u, STAGES.ACOLHIMENTO_CONFIRMA_NOME_CONTATO)
      iniciarTimer(from)
      const audioConfirmar = audioConfirmarNomeRepresentante(nomeLimpo)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, audioConfirmar)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 4000))
        } catch (e) { logErro("tts", "Falha áudio confirmar nome contato", e) }
      }
      return {
        texto: textoConfirmarNomeRepresentante(nomeLimpo),
        opcoes: [
          { id: "confirma_nome_contato_sim", title: "✅ Sim, está certo" }
        ]
      }
    }

    if (validacaoNomeContato === "incompleto") {
      // Primeiro nome reconhecido — pede o sobrenome antes de avançar
      iniciarTimer(from)
      return responderComTimer(from, {
        texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n*👥 Atendimento para outra pessoa*\n\nEntendi *${nomeLimpo}*. Preciso do seu *nome completo*. Pode incluir o sobrenome?\n\n_Digite ou envie um áudio com seu nome completo._ 🎙️`,
        opcoes: null
      })
    }

    // 2. Não parece um nome — verifica se é relato, dúvida, pedido de advogado etc.
    const imprevistoNomeContato = await tratarImprevistoPreAtendimento(from, u, u.stage, text)
    if (imprevistoNomeContato) return imprevistoNomeContato

    // 3. Não foi reconhecido por nada — pede o nome novamente de forma simples
    return responderComTimer(from, {
      texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n*👥 Atendimento para outra pessoa*\n\nNão consegui identificar seu nome. Por favor, *informe apenas seu nome completo*.\n\n_Digite ou envie um áudio com seu nome._ 🎙️`,
      opcoes: null
    })
  }

  // ── ACOLHIMENTO_CONFIRMA_NOME_CONTATO ────────────────────────────────────
  // Confirma o nome de quem está no WhatsApp antes de pedir o nome do atendido.
  if (u.stage === STAGES.ACOLHIMENTO_CONFIRMA_NOME_CONTATO) {
    // Áudio no stage de confirmação do nome do contato — transcreve inline,
    // sem desviar para AUDIO_FLUXO_CONFIRMA ou EDITAR_NOME.
    if (!text && ehAudio) {
      const mediaId = msgObj?.audio?.id || msgObj?.voice?.id
      if (mediaId) {
        const midia = await baixarMidia(mediaId)
        if (midia) {
          if (!u.modoTexto) await enviar(from, "👂 Ouvindo...", null, false)
          const transcricao = await transcrever(midia.buffer, midia.mimeType, { origem: "acolhimento_confirma_nome_contato" })
          if (transcricao) {
            text = transcricao
          } else {
            return responderComTimer(from, {
              texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ Seu nome é *${u._nomeContatoTemp || u.nomeContato || "informado"}*.\n\nNão consegui entender o áudio. Pode digitar o nome correto ou tocar em Confirmar se estiver certo. 🎙️`,
              opcoes: [{ id: "confirma_nome_contato_sim", title: "✅ Sim, está certo" }]
            })
          }
        }
      }
    }
    // Botão: confirmar
    if (text === "confirma_nome_contato_sim") {
      u.nomeContato = u._nomeContatoTemp || u.nomeContato
      u._nomeContatoTemp = null
      const primeiroNomeContato = (u.nomeContato || "").split(" ")[0] || u.nomeContato
      const relacao = u.relacaoComAtendido
      const labelRelacao = {
        mae: "sua mãe", pai: "seu pai", filho: "seu filho", filha: "sua filha",
        esposa: "sua esposa", esposo: "seu esposo", conjuge: "seu cônjuge",
        irmao: "seu irmão", irma: "sua irmã", avo: "seu avô/avó", terceiro: "outra pessoa"
      }[relacao] || "outra pessoa"
      const pronomeRelacao = {
        mae: "dela", filha: "dela", esposa: "dela", irma: "dela",
        pai: "dele", filho: "dele", esposo: "dele", irmao: "dele", avo: "dele/dela", terceiro: "dela"
      }[relacao] || "dela"
      setStage(u, STAGES.ACOLHIMENTO_NOME)
      iniciarTimer(from)
      const audioAtendido = audioSolicitarNomePessoaAtendida(primeiroNomeContato)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, audioAtendido)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 4000))
        } catch (e) { logErro("tts", "Falha áudio pede nome atendido após confirma contato", e) }
      }
      return {
        texto: textoSolicitarNomePessoaAtendida(primeiroNomeContato),
        opcoes: null
      }
    }
    // Texto livre no stage = nome corrigido diretamente (sem botão necessário)
    if (text && text !== "confirma_nome_contato_sim") {
      // 0. Detecta intenção de correção/negação ANTES de extrair nome puro.
      //    Evita que "Não. Meu nome é X" vire "Nao Meu Nome E X" tratado como nome.
      const nomeCorrecaoContato = extrairNomeDaCorrecaoExplicita(text)
      if (
        nomeCorrecaoContato &&
        ehNomeAparente(nomeCorrecaoContato, nomeCorrecaoContato) === true
      ) {
        u._nomeContatoTemp = nomeCorrecaoContato
        const audioReconfirmar = audioConfirmarNomeRepresentante(nomeCorrecaoContato)
        if (!u.modoTexto) {
          try {
            const ogg = await gerarAudioAtendente(u.atendente, audioReconfirmar)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 4000))
          } catch (e) { logErro("tts", "Falha áudio reconfirmar nome contato correcao explicita", e) }
        }
        return {
          texto: textoConfirmarNomeRepresentante(nomeCorrecaoContato),
          opcoes: [{ id: "confirma_nome_contato_sim", title: "✅ Sim, está certo" }]
        }
      }

      // Negação pura ("Não") → imprevisto conduz a pedir o nome correto
      if (parecePuraNegacaoSemNome(text)) {
        const imprevistoNegacaoContato = await tratarImprevistoPreAtendimento(from, u, u.stage, text)
        if (imprevistoNegacaoContato) return imprevistoNegacaoContato
        iniciarTimer(from)
        return responderComTimer(from, { texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nSem problema! Me diga o seu nome correto. Pode falar ou digitar. 🎙️`, opcoes: null })
      }

      // 1. Tenta extrair nome primeiro — correção inline sem passar pelo imprevisto
      const nomeLimpo = formatarNome(limparTextoSomenteLetras(text))
      const validacaoNomeConfContato = ehNomeAparente(nomeLimpo, text)
      if (validacaoNomeConfContato === true) {
        u._nomeContatoTemp = nomeLimpo
        const audioReconfirmar = audioConfirmarNomeRepresentante(nomeLimpo)
        if (!u.modoTexto) {
          try {
            const ogg = await gerarAudioAtendente(u.atendente, audioReconfirmar)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 4000))
          } catch (e) { logErro("tts", "Falha áudio reconfirmar nome contato", e) }
        }
        return {
          texto: textoConfirmarNomeRepresentante(nomeLimpo),
          opcoes: [{ id: "confirma_nome_contato_sim", title: "✅ Sim, está certo" }]
        }
      }
      // 2. Não parece nome — trata como imprevisto
      const imprevisto = await tratarImprevistoPreAtendimento(from, u, u.stage, text)
      if (imprevisto) return imprevisto
      return responderComTimer(from, { texto: "Por favor, me diga seu nome completo usando apenas letras e espaços.", opcoes: null })
    }
  }

  if (clientPostIntakeActionAtual === CLIENT_POST_INTAKE_ACTIONS.COLLECT_NAME && text) {
    // Tenta extrair nome por correção explícita ("meu nome é X", "me chamo X") antes da limpeza pura.
    // Isso evita que frases com prefixo de negação/correção sejam limpas e virem um "nome" inválido.
    const nomeCorrecaoNome = extrairNomeDaCorrecaoExplicita(text)
    const nomeLimpo = nomeCorrecaoNome || formatarNome(limparTextoSomenteLetras(text))
    const coletandoNomeAtendido = u.atendimentoParaTerceiro && !!u.nomeContato

    // Valida se o candidato parece um nome próprio (filtra frases de intenção, palavras
    // funcionais, textos sem sobrenome etc.). textoOriginal passado para detectar ausência
    // de maiúscula em frases longas antes da normalização.
    const validacaoNome = ehNomeAparente(nomeLimpo, nomeCorrecaoNome ? nomeLimpo : text)

    if (validacaoNome === true) {
      if (!coletandoNomeAtendido) {
        const ambiguidade = detectarAmbiguidadeTitularNome(u, text)
        if (ambiguidade) {
          return await perguntarTitularNomePreCadastro(from, u, nomeLimpo, ambiguidade)
        }
      }
    } else if (validacaoNome === "incompleto") {
      // Nome único reconhecido — pede sobrenome antes de avançar
      iniciarTimer(from)
      const textoSobrenome = coletandoNomeAtendido
        ? `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nEntendi *${nomeLimpo}*. Preciso do nome completo da pessoa atendida. Pode incluir o sobrenome?`
        : `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nEntendi *${nomeLimpo}*. Preciso do seu nome completo. Pode incluir o sobrenome?`
      return responderComTimer(from, { texto: textoSobrenome, opcoes: null })
    } else {
      // Não parece nome — trata como imprevisto e redireciona
      const imprevistoNome = await tratarImprevistoPreAtendimento(from, u, u.stage, text)
      if (imprevistoNome) return imprevistoNome
      return responderComTimer(from, { texto: "Por favor, informe um nome válido usando apenas letras e espaços.", opcoes: null })
    }
    u._nomeTemp = nomeLimpo
    setStage(u, STAGES.ACOLHIMENTO_CONFIRMA_NOME)
    iniciarTimer(from)

    const textoConfirmarAudio = coletandoNomeAtendido
      ? audioConfirmarNomePessoaAtendida(nomeLimpo)
      : textoAudioConfirmacaoNome(nomeLimpo)
    const textoConfirmarTela = coletandoNomeAtendido
      ? textoConfirmarNomePessoaAtendida(nomeLimpo)
      : `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ Seu nome é *${nomeLimpo}*.\n\nEstá correto? Se não estiver, é só me dizer seu nome correto agora. Pode falar ou digitar. 🎙️`

    if (!u.modoTexto) {
      try {
        const ogg = await gerarAudioAtendente(u.atendente, textoConfirmarAudio)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 4000))
      } catch (e) { logErro("tts", "Falha áudio confirmar nome", e) }
    }

    return {
      texto: textoConfirmarTela,
      opcoes: [
          { id: "nome_confirmar", title: "✅ Sim, está certo" }
      ]
    }
  }

  if (u.stage === STAGES.ACOLHIMENTO_CONFIRMA_NOME) {
    // Áudio no stage de confirmação de nome — transcreve e trata como correção inline,
    // sem desviar para AUDIO_FLUXO_CONFIRMA ou EDITAR_NOME.
    if (!text && ehAudio) {
      const mediaId = msgObj?.audio?.id || msgObj?.voice?.id
      if (mediaId) {
        const midia = await baixarMidia(mediaId)
        if (midia) {
          if (!u.modoTexto) await enviar(from, "👂 Ouvindo...", null, false)
          const transcricao = await transcrever(midia.buffer, midia.mimeType, { origem: "acolhimento_confirma_nome" })
          if (transcricao) {
            text = transcricao
          } else {
            const coletandoNomeAtendido = u.atendimentoParaTerceiro && !!u.nomeContato
            const telaFalha = coletandoNomeAtendido
              ? `${textoConfirmarNomePessoaAtendida(u._nomeTemp || "informado")}\n\nNão consegui entender o áudio.`
              : `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ Seu nome é *${u._nomeTemp || "informado"}*.\n\nNão consegui entender o áudio. Pode digitar o nome correto ou tocar em Confirmar se estiver certo. 🎙️`
            return responderComTimer(from, { texto: telaFalha, opcoes: [{ id: "nome_confirmar", title: "✅ Sim, está certo" }] })
          }
        }
      }
    }
    if (text === "nome_confirmar") {
      u.nome = u._nomeTemp
      u.nomeConfirmado = true
      u._nomeTitularPendente = null
      await sincronizarContatoNegocioHubSpot(u)
      // se está em revalidação progressiva, retornar ao fluxo de revalidação
      if (u._revalidandoCampos) {
        if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
        u._revalidaConfirmados.push("nome")
        return await proximaConfirmacaoProgressiva(from, u)
      }
      // Usuário novo que veio pelo fluxo ACOLHIMENTO_PARA_QUEM → nome:
      // sempre pede o relato aqui, independente de haver texto prévio.
      // (Texto prévio pode existir se o usuário digitou algo antes dos botões,
      //  mas o relato estruturado da etapa 3 ainda não foi coletado.)
      if (!u.numeroCaso) {
        return await pedirRelatoAposNome(from, u)
      }
      return await flowAcolhimentoConfirmaWhatsapp(u, { from })
    }
    // Texto livre no stage de confirmação = nome corrigido diretamente
    if (text && text !== "nome_confirmar") {
      const coletandoNomeAtendido = u.atendimentoParaTerceiro && !!u.nomeContato

      // 0. Detecta intenção ANTES de extrair o nome puro.
      //    "Não. Meu nome é João Santos" → extrai "João Santos" e reapresenta confirmação.
      //    "Não" puro → cai no imprevisto/condutor para pedir o nome correto.
      //    Isso evita que frases como "Não meu nome é X" sejam limpas para "Nao Meu Nome E X"
      //    e tratadas como se fossem um nome válido.
      const nomeCorrecaoExplicita = extrairNomeDaCorrecaoExplicita(text)
      if (
        nomeCorrecaoExplicita &&
        ehNomeAparente(nomeCorrecaoExplicita, nomeCorrecaoExplicita) === true
      ) {
        u._nomeTemp = nomeCorrecaoExplicita
        u._nomeTitularPendente = null
        const audioReconfirmar = coletandoNomeAtendido
          ? audioConfirmarNomePessoaAtendida(nomeCorrecaoExplicita)
          : textoAudioConfirmacaoNome(nomeCorrecaoExplicita)
        const telaReconfirmar = coletandoNomeAtendido
          ? textoConfirmarNomePessoaAtendida(nomeCorrecaoExplicita)
          : `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ Seu nome é *${nomeCorrecaoExplicita}*.\n\nEstá correto? Se não estiver, é só me dizer seu nome correto agora. Pode falar ou digitar. 🎙️`
        if (!u.modoTexto) {
          try {
            const ogg = await gerarAudioAtendente(u.atendente, audioReconfirmar)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 4000))
          } catch (e) { logErro("tts", "Falha áudio reconfirmar nome correcao explicita", e) }
        }
        return { texto: telaReconfirmar, opcoes: [{ id: "nome_confirmar", title: "✅ Sim, está certo" }] }
      }

      // Negação pura sem nome junto ("Não", "Errado") → imprevisto conduz a pedir o nome correto
      if (parecePuraNegacaoSemNome(text)) {
        const imprevistoPuraNegacao = await tratarImprevistoPreAtendimento(from, u, u.stage, text)
        if (imprevistoPuraNegacao) return imprevistoPuraNegacao
        iniciarTimer(from)
        const nomeAtual = u._nomeTemp || ""
        const telaOrientar = coletandoNomeAtendido
          ? `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nSem problema! Me diga o nome correto da pessoa atendida. Pode falar ou digitar. 🎙️`
          : `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nSem problema! Me diga o seu nome correto. Pode falar ou digitar. 🎙️`
        return responderComTimer(from, { texto: telaOrientar, opcoes: null })
      }

      // 1. Tenta extrair nome puro — se válido, trata como correção inline
      //    sem passar pelo imprevisto (evita desvio para EDITAR_NOME via IA)
      const nomeLimpo = formatarNome(limparTextoSomenteLetras(text))
      const validacaoNomeConf = ehNomeAparente(nomeLimpo, text)
      if (validacaoNomeConf === true) {
        u._nomeTemp = nomeLimpo
        u._nomeTitularPendente = null
        const audioReconfirmar = coletandoNomeAtendido
          ? audioConfirmarNomePessoaAtendida(nomeLimpo)
          : textoAudioConfirmacaoNome(nomeLimpo)
        const telaReconfirmar = coletandoNomeAtendido
          ? textoConfirmarNomePessoaAtendida(nomeLimpo)
          : `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ Seu nome é *${nomeLimpo}*.\n\nEstá correto? Se não estiver, é só me dizer seu nome correto agora. Pode falar ou digitar. 🎙️`
        if (!u.modoTexto) {
          try {
            const ogg = await gerarAudioAtendente(u.atendente, audioReconfirmar)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 4000))
          } catch (e) { logErro("tts", "Falha áudio reconfirmar nome", e) }
        }
        return { texto: telaReconfirmar, opcoes: [{ id: "nome_confirmar", title: "✅ Sim, está certo" }] }
      }
      // 2. Não parece nome — trata como imprevisto
      const imprevisto = await tratarImprevistoPreAtendimento(from, u, u.stage, text)
      if (imprevisto) return imprevisto
      return responderComTimer(from, { texto: "Por favor, me diga o nome completo usando apenas letras e espaços.", opcoes: null })
    }
  }

  if (u.stage === STAGES.ACOLHIMENTO_CONFIRMA_TITULAR_NOME) {
    const textoNorm = normalizarTextoGatilho(text)
    const confirmarContato = text === "nome_titular_contato" || /\b(meu nome|sou eu|eu mesmo|meu|eu sou)\b/.test(textoNorm)
    const confirmarAtendido = text === "nome_titular_atendido" || /\b(pessoa atendida|outra pessoa|de outra pessoa|dele|dela|da pessoa|atendida|atendido)\b/.test(textoNorm)
    const corrigir = text === "nome_corrigir" || textoNorm.includes("corrigir")

    if (confirmarContato || confirmarAtendido) {
      // Se o cliente confirmou que o nome digitado é o DELE, mas o atendimento já foi
      // identificado como sendo para terceiro (ex: "minha mãe"), o nome digitado é do
      // contato que está abrindo o caso — não da pessoa atendida. Nesse caso salvamos
      // como nomeContato e pedimos o nome da pessoa atendida antes de continuar.
      if (confirmarContato && u.atendimentoParaTerceiro) {
        u.nomeContato = u._nomeTemp
        u._nomeTitularOrigem = "contato"
        u._nomeTemp = null
        u._nomeTitularPendente = null
        setStage(u, STAGES.ACOLHIMENTO_NOME)
        iniciarTimer(from)
        const primeiroNomeContato = (u.nomeContato || "").split(" ")[0] || "você"
        const audioAtendido = audioSolicitarNomePessoaAtendida(primeiroNomeContato)
        return await responderTelaComAudio(
          from,
          u,
          {
            texto: textoSolicitarNomePessoaAtendida(primeiroNomeContato),
            opcoes: null
          },
          audioAtendido,
          "confirma titular nome contato pede atendido"
        )
      }

      u.nome = u._nomeTemp
      u.nomeConfirmado = true
      u._nomeTitularPendente = null
      u._nomeTitularOrigem = confirmarContato ? "contato" : "atendido"
      await sincronizarContatoNegocioHubSpot(u)
      if (u._revalidandoCampos) {
        if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
        u._revalidaConfirmados.push("nome")
        return await proximaConfirmacaoProgressiva(from, u)
      }
      // Usuário novo: sempre pede relato antes de WhatsApp
      if (!u.numeroCaso) {
        return await pedirRelatoAposNome(from, u)
      }
      return await flowAcolhimentoConfirmaWhatsapp(u, { from })
    }
    if (corrigir) {
      // Nome parece ser uma correção direta via texto — captura aqui mesmo.
      // Usa extrairNomeDaCorrecaoExplicita para lidar com frases como "Corrigir. Meu nome é X".
      const nomeLimpoCorrecao = extrairNomeDaCorrecaoExplicita(text.replace(/corrigir/i, "").trim())
        || formatarNome(limparTextoSomenteLetras(text.replace(/corrigir/i, "").trim()))
      const validacaoCorrecaoTitular = nomeLimpoCorrecao ? ehNomeAparente(nomeLimpoCorrecao, nomeLimpoCorrecao) : false
      if (validacaoCorrecaoTitular === "incompleto") {
        // Nome único reconhecido — pede sobrenome antes de avançar
        u._nomeTitularPendente = null
        iniciarTimer(from)
        const coletandoNomeAtendido = u.atendimentoParaTerceiro && !!u.nomeContato
        return responderComTimer(from, {
          texto: coletandoNomeAtendido
            ? `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nEntendi *${nomeLimpoCorrecao}*. Preciso do nome completo da pessoa atendida. Pode incluir o sobrenome?`
            : `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nEntendi *${nomeLimpoCorrecao}*. Preciso do seu nome completo. Pode incluir o sobrenome?`,
          opcoes: null
        })
      }
      if (validacaoCorrecaoTitular === true) {
        u._nomeTemp = nomeLimpoCorrecao
        u._nomeTitularPendente = null
        // Vai para confirmação do novo nome
        setStage(u, STAGES.ACOLHIMENTO_CONFIRMA_NOME)
        iniciarTimer(from)
        const coletandoNomeAtendido = u.atendimentoParaTerceiro && !!u.nomeContato
        const audioReconfirmar = textoAudioConfirmacaoNome(nomeLimpoCorrecao, {
          pessoaAtendida: coletandoNomeAtendido
        })
        const telaReconfirmar = coletandoNomeAtendido
          ? `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ O nome da pessoa atendida é *${nomeLimpoCorrecao}*.\n\nEstá correto? Se não estiver, é só me dizer o nome certo agora. Pode falar ou digitar. 🎙️`
          : `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ Seu nome é *${nomeLimpoCorrecao}*.\n\nEstá correto? Se não estiver, é só me dizer seu nome correto agora. Pode falar ou digitar. 🎙️`
        if (!u.modoTexto) {
          try {
            const ogg = await gerarAudioAtendente(u.atendente, audioReconfirmar)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 4000))
          } catch (e) { logErro("tts", "Falha áudio reconfirmar nome após titular", e) }
        }
        return { texto: telaReconfirmar, opcoes: [{ id: "nome_confirmar", title: "✅ Sim, está certo" }] }
      }
      // "Corrigir" sem nome junto — orienta a dizer o nome correto agora
      u._nomeTitularPendente = null
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, "Sem problema! Me diga o nome correto agora, pode falar ou digitar.")
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio orientar correção nome titular", e) }
      }
      return {
        texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nSem problema! Me diga o nome correto agora. Pode falar ou digitar. 🎙️`,
        opcoes: null
      }
    }
    const imprevistoConfirmarNome = await tratarImprevistoPreAtendimento(from, u, u.stage, text)
    if (imprevistoConfirmarNome) return imprevistoConfirmarNome
    // Texto livre que não é payload nem imprevisto — tenta capturar como nome corrigido.
    // Primeiro verifica intenção de correção explícita ("Não. Meu nome é X") antes de limpar o texto.
    if (text) {
      const nomeCorrecaoTitular = extrairNomeDaCorrecaoExplicita(text)
      if (
        nomeCorrecaoTitular &&
        ehNomeAparente(nomeCorrecaoTitular, nomeCorrecaoTitular) === true
      ) {
        u._nomeTemp = nomeCorrecaoTitular
        u._nomeTitularPendente = null
        setStage(u, STAGES.ACOLHIMENTO_CONFIRMA_NOME)
        iniciarTimer(from)
        const coletandoNomeAtendido = u.atendimentoParaTerceiro && !!u.nomeContato
        const audioReconfirmar = textoAudioConfirmacaoNome(nomeCorrecaoTitular, {
          pessoaAtendida: coletandoNomeAtendido
        })
        const telaReconfirmar = coletandoNomeAtendido
          ? `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ O nome da pessoa atendida é *${nomeCorrecaoTitular}*.\n\nEstá correto? Se não estiver, é só me dizer o nome certo agora. Pode falar ou digitar. 🎙️`
          : `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ Seu nome é *${nomeCorrecaoTitular}*.\n\nEstá correto? Se não estiver, é só me dizer seu nome correto agora. Pode falar ou digitar. 🎙️`
        if (!u.modoTexto) {
          try {
            const ogg = await gerarAudioAtendente(u.atendente, audioReconfirmar)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 4000))
          } catch (e) { logErro("tts", "Falha áudio reconfirmar nome titular correcao explicita", e) }
        }
        return { texto: telaReconfirmar, opcoes: [{ id: "nome_confirmar", title: "✅ Sim, está certo" }] }
      }
      const nomeLimpoLivre = formatarNome(limparTextoSomenteLetras(text))
      if (ehNomeAparente(nomeLimpoLivre, text) === true) {
        u._nomeTemp = nomeLimpoLivre
        u._nomeTitularPendente = null
        setStage(u, STAGES.ACOLHIMENTO_CONFIRMA_NOME)
        iniciarTimer(from)
        const coletandoNomeAtendido = u.atendimentoParaTerceiro && !!u.nomeContato
        const audioReconfirmar = textoAudioConfirmacaoNome(nomeLimpoLivre, {
          pessoaAtendida: coletandoNomeAtendido
        })
        const telaReconfirmar = coletandoNomeAtendido
          ? `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ O nome da pessoa atendida é *${nomeLimpoLivre}*.\n\nEstá correto? Se não estiver, é só me dizer o nome certo agora. Pode falar ou digitar. 🎙️`
          : `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ Seu nome é *${nomeLimpoLivre}*.\n\nEstá correto? Se não estiver, é só me dizer seu nome correto agora. Pode falar ou digitar. 🎙️`
        if (!u.modoTexto) {
          try {
            const ogg = await gerarAudioAtendente(u.atendente, audioReconfirmar)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 4000))
          } catch (e) { logErro("tts", "Falha áudio reconfirmar nome titular livre", e) }
        }
        return { texto: telaReconfirmar, opcoes: [{ id: "nome_confirmar", title: "✅ Sim, está certo" }] }
      }
    }
    iniciarTimer(from)
    return {
      texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ Entendi o nome *${u._nomeTemp || "informado"}*.\n\nComo você mencionou ${u._nomeTitularPendente?.label || "outra pessoa"}, preciso confirmar para não cadastrar errado:\n\nEsse é o seu nome ou o nome da pessoa atendida?\n\n_Se o nome estiver errado, é só me dizer o nome correto agora. 🎙️_`,
      opcoes: [
        { id: "nome_titular_contato", title: "🙋 Meu nome" },
        { id: "nome_titular_atendido", title: "👤 Pessoa atendida" }
      ]
    }
  }

  if (u.stage === STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP) {
    if (text === "whatsapp_sim" || text === "nc_meu") {
      u.whatsappVerificado = true
      u.telefoneEhDoCliente = !u.atendimentoParaTerceiro
      u.whatsappContato = from
      // se está em revalidação progressiva, retornar ao fluxo
      if (u._revalidandoCampos) {
        if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
        u._revalidaConfirmados.push("whatsapp")
        return await proximaConfirmacaoProgressiva(from, u)
      }
      return await flowAcolhimentoCidade(u, { from })
    }
    if (text === "whatsapp_nao" || text === "nc_outro") {
      // Para terceiro: número de origem não é do atendido → false.
      // Para si: ainda não sabemos o número definitivo, mantém null até confirmação.
      u.telefoneEhDoCliente = u.atendimentoParaTerceiro ? false : null
      setStage(u, STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP_OUTRO)
      iniciarTimer(from)

      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente,
            `Entendi! Se quiser usar outro número de WhatsApp, é só digitar ou falar o número com DDD agora. Se preferir continuar com este mesmo número, toque em Continuar assim.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 4000))
        } catch (e) { logErro("tts", "Falha áudio outro número", e) }
      }

      return {
        texto: `●●●●○○ 📱 Etapa 4 de 6 · *WHATSAPP*\n\n📱 Entendido! Se quiser usar outro número, é só digitar ou falar o número com DDD agora. Pode falar ou digitar. 🎙️\n\nSe preferir continuar com este número, toque em *Continuar assim*.`,
        opcoes: [
          { id: "wpp_continuar_assim", title: "✅ Continuar assim" }
        ]
      }
    }
    // Texto livre = usuário informou outro número diretamente nessa tela
    if (text && text !== "whatsapp_sim" && text !== "nc_meu" && text !== "whatsapp_nao" && text !== "nc_outro") {
      const telNorm = normalizarTelefone(text)
      if (telNorm && telNorm.replace(/\D/g, "").length >= 12) {
        // Para terceiro: número informado não é do atendido → false. Para si: é do próprio cliente → true.
        u.telefoneEhDoCliente = !u.atendimentoParaTerceiro
        // prepararConfirmacaoEntrada já envia o áudio único de confirmação do número
        return await prepararConfirmacaoEntrada(from, u, "telefone", telNorm, "coleta_tel_wpp_contato")
      }
      // Não parece número — trata como imprevisto
      const imprevistoWhatsapp = await tratarImprevistoPreAtendimento(from, u, u.stage, text)
      if (imprevistoWhatsapp) return imprevistoWhatsapp
    }
    iniciarTimer(from)
    return {
      texto: "●●●●○○ 📱 Etapa 4 de 6 · *WHATSAPP*\n\nPor favor, confirme se este é o seu WhatsApp. Se não for, é só digitar ou falar o número correto com DDD agora. 🎙️",
      opcoes: [
        { id: "whatsapp_sim", title: "✅ Confirmar" }
      ]
    }
  }

  if (u.stage === STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP_OUTRO) {
    if (text === "wpp_informar_outro") {
      // Legado: se alguém ainda enviar esse payload, orienta a digitar o número agora
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, `Sem problema! Digite ou fale o número de WhatsApp com DDD agora.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio orientar número legado", e) }
      }
      return { texto: `●●●●○○ 📱 Etapa 4 de 6 · *WHATSAPP*\n\nDigite ou fale o número com DDD agora. Pode falar ou digitar. 🎙️`, opcoes: [{ id: "wpp_continuar_assim", title: "✅ Continuar assim" }] }
    }
    // Texto livre = número informado diretamente
    if (text && text !== "wpp_continuar_assim") {
      const telNorm = normalizarTelefone(text)
      if (telNorm && telNorm.replace(/\D/g, "").length >= 12) {
        // prepararConfirmacaoEntrada já envia o áudio único de confirmação do número
        return await prepararConfirmacaoEntrada(from, u, "telefone", telNorm, "coleta_tel_wpp_contato")
      }
      // Número inválido — orienta
      iniciarTimer(from)
      return { texto: `●●●●○○ 📱 Etapa 4 de 6 · *WHATSAPP*\n\nNão consegui identificar o número. Por favor, informe com DDD. Pode falar ou digitar. 🎙️`, opcoes: [{ id: "wpp_continuar_assim", title: "✅ Continuar assim" }] }
    }
    if (text === "wpp_continuar_assim") {
      u.whatsappVerificado = true
      if (!u.whatsappContato) u.whatsappContato = from
      // Resolve telefoneEhDoCliente caso ainda esteja null (fluxo "para si" que disse não e voltou atrás)
      if (u.telefoneEhDoCliente === null || u.telefoneEhDoCliente === undefined) {
        u.telefoneEhDoCliente = !u.atendimentoParaTerceiro
      }
      if (u._corrigindoWhatsappConfirmacao) {
        delete u._corrigindoWhatsappConfirmacao
        return responderComTimer(from, await voltarParaConfirmacao(from, u))
      }
      if (u._revalidandoCampos) {
        if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
        u._revalidaConfirmados.push("whatsapp")
        return await proximaConfirmacaoProgressiva(from, u)
      }
      return await flowAcolhimentoCidade(u, { from })
    }
    iniciarTimer(from)
    return { texto: `●●●●○○ 📱 Etapa 4 de 6 · *WHATSAPP*\n\nSe quiser usar outro número, é só digitar ou falar com DDD agora. Se preferir continuar com este, toque em *Continuar assim*. 🎙️`, opcoes: [{ id: "wpp_continuar_assim", title: "✅ Continuar assim" }] }
  }

  if (clientPostIntakeActionAtual === CLIENT_POST_INTAKE_ACTIONS.COLLECT_CITY && text) {
    if (text === "cidade_nenhuma_dessas") {
      delete u._cidadesMultiplas
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente,
            "Tudo bem. Me diga novamente o nome da cidade junto com o estado, ou informe o CEP.")
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha audio nenhuma cidade", e) }
      }
      return responderComTimer(from, {
        texto: `●●●●●○ 📍 Etapa 5 de 6 · *CIDADE*\n\n🏙️ Tudo bem. Informe novamente a *cidade com o estado* ou o *CEP*.\n\nExemplos:\n• Condado, Pernambuco\n• 55940-000`,
        opcoes: null
      })
    }

    // negativa por voz na lista de cidades ambíguas
    if (Array.isArray(u._cidadesMultiplas) && !text.startsWith("cidade_multipla_") && !text.startsWith("cidade_confirmar") && !text.startsWith("cidade_corrigir")) {
      const negativas = ["nenhuma", "não é", "nao e", "nao é", "não e", "outra cidade", "não apareceu", "nao apareceu", "nenhuma dessas", "não encontrei", "nao encontrei", "é outra", "e outra", "não está", "nao esta", "outra"]
      const textoLower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      const ehNegativa = negativas.some(n => textoLower.includes(n.normalize("NFD").replace(/[\u0300-\u036f]/g, "")))
      if (ehNegativa || (ehAudio && textoLower.length > 2 && !u._cidadesMultiplas.some(c => textoLower.includes(c.cidade.toLowerCase().slice(0,4))))) {
        delete u._cidadesMultiplas
        const textoOrientacao = "Tudo bem 😊 Me diga novamente o nome da cidade junto com o estado. Por exemplo: *Presidente Kennedy, Espírito Santo*."
        if (!u.modoTexto && u.atendente) {
          try {
            const ogg = await gerarAudioAtendente(u.atendente, "Tudo bem. Me diga novamente o nome da cidade junto com o estado. Por exemplo: Presidente Kennedy, Espírito Santo.")
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 3000))
          } catch(e) { logErro("tts", "Falha áudio negativa cidade", e) }
        }
        return responderComTimer(from, { texto: textoOrientacao, opcoes: null })
      }
    }

    // selecionar cidade de lista homônima — formato "Cidade, UF" + áudio de confirmação
    if (text?.startsWith("cidade_multipla_") && Array.isArray(u._cidadesMultiplas)) {
      const idx = parseInt(text.replace("cidade_multipla_", ""), 10)
      const escolhida = u._cidadesMultiplas[idx]
      if (escolhida) {
        u._cidadeTemp = escolhida.cidade
        u._ufTemp = escolhida.uf
        u._regiaoTemp = escolhida.regiao
        delete u._cidadesMultiplas
        setStage(u, STAGES.ACOLHIMENTO_CIDADE)
        iniciarTimer(from)
        // áudio de confirmação ao digitar cidade e selecionar da lista
        if (!u.modoTexto) await enviarAudioConfirmacaoLocalizacao(from, u.atendente, escolhida.cidade, escolhida.uf || "UF não identificada", escolhida.regiao || "não identificada", "cidade")
        // formato "Cidade, UF" com vírgula, não barra
        return responderComTimer(from, {
          texto: `●●●●●○ 📍 Etapa 5 de 6 · *CIDADE*\n\n✅ Localizei: *${escolhida.cidade}${escolhida.uf ? `, ${escolhida.uf}` : ""}* (${escolhida.regiao || "não identificada"}). Está correto? Se não estiver, é só me dizer a cidade correta agora. Pode falar ou digitar. 🎙️`,
          opcoes: [
            { id: "cidade_confirmar", title: "✅ Confirmar cidade" }
          ]
        })
      }
    }
    if (text === "cidade_confirmar" && (u._cidadeAudioTemp || u._cidadeTemp)) {
      u.cidade = u._cidadeAudioTemp || u._cidadeTemp
      u.uf = u._ufAudioTemp || u._ufTemp
      u.regiao = u._regiaoAudioTemp || u._regiaoTemp
      delete u._cidadeAudioTemp
      delete u._ufAudioTemp
      delete u._regiaoAudioTemp
      delete u._cidadeTemp
      delete u._ufTemp
      delete u._regiaoTemp
      await sincronizarContatoNegocioHubSpot(u)
      if (u._revalidandoCampos) {
        if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
        u._revalidaConfirmados.push("cidade")
        return await proximaConfirmacaoProgressiva(from, u)
      }
      return await respostaAposCidade(from, u)
    }
    if (text === "cidade_corrigir") {
      // Legado: orienta a dizer a cidade correta agora, sem trocar de tela
      delete u._cidadeAudioTemp
      delete u._ufAudioTemp
      delete u._regiaoAudioTemp
      delete u._cidadeTemp
      delete u._ufTemp
      delete u._regiaoTemp
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const _nomeTerceiroCidade = u.atendimentoParaTerceiro && u.nome ? u.nome.split(" ")[0] : null
          const _textoCidadeCorrigir = _nomeTerceiroCidade
            ? `Sem problema! Me diga a cidade onde ${_nomeTerceiroCidade} mora agora. Pode falar ou digitar.`
            : `Sem problema! Me diga sua cidade agora. Pode falar ou digitar.`
          const ogg = await gerarAudioAtendente(u.atendente, _textoCidadeCorrigir)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3500))
        } catch (e) { logErro("tts", "Falha áudio corrigir cidade legado", e) }
      }
      const _nomeTerceiroCidadeTela = u.atendimentoParaTerceiro && u.nome ? u.nome.split(" ")[0] : null
      return {
        texto: `●●●●●○ 📍 Etapa 5 de 6 · *CIDADE*\n\nSem problema! ${_nomeTerceiroCidadeTela ? `Me diga a cidade onde *${_nomeTerceiroCidadeTela}* mora` : "Me diga sua cidade"} agora. Pode falar ou digitar. 🎙️`,
        opcoes: null
      }
    }
    if (text === "cidade_sim" && u._cidadeTemp) {
      // Confirmar cidade do CEP
      u.cidade = u._cidadeTemp
      u.uf = u._ufTemp
      u.regiao = u._regiaoTemp
      // Limpar temporários
      delete u._cidadeTemp
      delete u._ufTemp
      delete u._regiaoTemp
      await sincronizarContatoNegocioHubSpot(u)
      if (u._revalidandoCampos) {
        if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
        u._revalidaConfirmados.push("cidade")
        return await proximaConfirmacaoProgressiva(from, u)
      }
      return await respostaAposCidade(from, u)
    }
    if (text === "cidade_nao" || text === "tentar_cep" || text === "informar_cidade") {
      // Limpar temporários e pedir novamente
      delete u._cidadeTemp
      delete u._ufTemp
      delete u._regiaoTemp
      iniciarTimer(from)
      if (u.modoTexto !== true) await enviarAudioPedidoCidade(from, u.atendente)
      return {
        texto: `●●●●●○ 📍 Etapa 5 de 6 · *CIDADE*\n\nTudo bem! Em qual *cidade* você mora?\n\nSe preferir, pode informar o *CEP* também.`,
        opcoes: null
      }
    }
    // Tenta buscar cidade/CEP primeiro — evita que a IA intercepte nomes de cidades
    // válidos como "Condado", "União", "Graça" etc. antes de qualquer busca.
    // "Buscando sua cidade..." só é enviado se a busca realmente for executada.
    // O imprevisto é chamado apenas se a busca não encontrar nada.
    const cepRegex = /^\d{5}-?\d{3}$/
    const ehCep = cepRegex.test(text.replace(/\D/g, ""))
    if (ehCep) {
      // Processar CEP
      await enviar(from, "🔍 Buscando sua cidade...", null, false)
      try {
        const cepLimpo = text.replace(/\D/g, "")
        const infoCEP = await buscarPorCEP(cepLimpo)
        // Armazenar temporariamente para confirmação
        u._cidadeTemp = infoCEP.cidade
        u._ufTemp = infoCEP.uf
        u._regiaoTemp = infoCEP.regiao
        // Confirmar localização encontrada
        setStage(u, STAGES.ACOLHIMENTO_CIDADE)
        iniciarTimer(from)
        if (!u.modoTexto) await enviarAudioConfirmacaoLocalizacao(from, u.atendente, infoCEP.cidade, infoCEP.uf, infoCEP.regiao, "cep")
        return {
          // formato padronizado com vírgula
          texto: `●●●●●○ 📍 Etapa 5 de 6 · *CIDADE*\n\n✅ Localizei: *${infoCEP.cidade}, ${infoCEP.uf}* (${infoCEP.regiao}). Está correto?`,
          opcoes: [
            { id: "cidade_sim", title: "✅ Sim, correto" },
            { id: "cidade_nao", title: "❌ Não, informar outra" }
          ]
        }
      } catch (error) {
        // CEP inválido ou erro na API
        iniciarTimer(from)
        return await responderTelaComAudio(
          from,
          u,
          {
            texto: `●●●●●○ 📍 Etapa 5 de 6 · *CIDADE*\n\n📍 Não consegui localizar este CEP.\n\nTente novamente ou informe a cidade diretamente.`,
            opcoes: [
              { id: "tentar_cep", title: "🔄 Tentar outro CEP" },
              { id: "informar_cidade", title: "🏙️ Informar cidade" }
            ]
          },
          "Não consegui localizar este CEP. Você pode tentar outro CEP ou informar a cidade diretamente.",
          "cep nao localizado"
        )
      }
    } else {
      // Processar como cidade
      await enviar(from, "🔍 Buscando sua cidade...", null, false)
      const localizacao = await buscarCidadePorNome(text)
      // cidade homônima em mais de um estado — usar formato "Cidade, Estado"
      if (localizacao?.multiplos && localizacao.opcoes?.length > 1) {
        u._cidadesMultiplas = localizacao.opcoes
        iniciarTimer(from)
        // texto e áudio padronizados - "Cidade, Estado por extenso"
        if (!u.modoTexto) {
          try {
            const nomesAudio = localizacao.opcoes.slice(0, 4)
              .map(op => `${op.cidade}, ${estadoPorExtenso(op.uf) || op.uf}`).join("; ")
            const ogg = await gerarAudioAtendente(u.atendente,
              `Encontrei ${numeroPorExtenso(localizacao.opcoes.length, "feminino")} cidades com esse nome. Por favor, selecione uma das opções: ${nomesAudio}. Se a sua cidade não estiver entre elas, diga o nome da cidade junto com o estado agora.`)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 4000))
          } catch (e) { logErro("tts", "Falha áudio cidades múltiplas digitadas", e) }
        }
        return responderComTimer(from, {
          texto: `●●●●●○ 📍 Etapa 5 de 6 · *CIDADE*\n\n🔍 Encontrei *${localizacao.opcoes.length} cidades* com esse nome. Qual é a sua?\n\n_Se a sua cidade não aparecer nas opções, diga ou digite o nome com o estado._`,
          // títulos curtos para caber no botão do WhatsApp
          opcoes: [
            ...localizacao.opcoes.slice(0, 4).map((op, i) => ({
              id: `cidade_multipla_${i}`,
              title: abreviarCidadeBotao(op.cidade, op.uf)
            }))
          ]
        })
      }
      if (localizacao?.cidade && localizacao.cidade.length >= 2) {
        u._cidadeTemp = localizacao.cidade
        u._ufTemp = localizacao.uf
        u._regiaoTemp = localizacao.regiao
        setStage(u, STAGES.ACOLHIMENTO_CIDADE)
        iniciarTimer(from)
        // áudio de confirmação ao digitar cidade (modo voz)
        if (!u.modoTexto) await enviarAudioConfirmacaoLocalizacao(from, u.atendente, localizacao.cidade, localizacao.uf || "UF não identificada", localizacao.regiao || "não identificada", "cidade")
        return {
          texto: `●●●●●○ 📍 Etapa 5 de 6 · *CIDADE*\n\n✅ Localizei: *${localizacao.cidade}${localizacao.uf ? `, ${localizacao.uf}` : ""}* (${localizacao.regiao || "não identificada"}). Está correto? Se não estiver, é só me dizer a cidade correta agora. Pode falar ou digitar. 🎙️`,
          opcoes: [
            { id: "cidade_confirmar", title: "✅ Confirmar cidade" }
          ]
        }
      }
      // Cidade não encontrada — só agora tenta o imprevisto (mensagem fora de contexto)
      const imprevistoCidadeNaoEncontrada = await tratarImprevistoPreAtendimento(from, u, u.stage, text)
      if (imprevistoCidadeNaoEncontrada) return imprevistoCidadeNaoEncontrada
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente,
            `Não consegui encontrar essa cidade. Por favor, tente digitar o nome da cidade novamente ou informe o CEP com oito dígitos.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3500))
        } catch (e) { logErro("tts", "Falha áudio cidade não encontrada", e) }
      }
      return responderComTimer(from, { texto: `●●●●●○ 📍 Etapa 5 de 6 · *CIDADE*\n\n📍 Não consegui encontrar essa cidade. Tente novamente ou informe o *CEP*.`, opcoes: null })
    }
  }

  if (u.stage === STAGES.ESCOLHA_AREA) {
    u.area = null
    u._areaDetectada = null
    return await iniciarFluxoRelatoLivre(from, u, { boasVindas: false })
  }

  if (u.stage === STAGES.ENTENDIMENTO_INICIAL && (text || ehAudio)) {
    let relato = text
    if (ehAudio) {
  await enviar(from, "👂 Estou ouvindo seu áudio...", null, false)
      const mediaId = msgObj?.audio?.id || msgObj?.voice?.id || msgObj?.[tipo]?.id
      if (!mediaId) return responderComTimer(from, { texto: "Não consegui processar o áudio. Tente novamente ou envie por texto.", opcoes: null })
      const midia = await baixarMidia(mediaId)
      if (!midia) return responderComTimer(from, { texto: "Não consegui processar o áudio. Tente novamente ou envie por texto.", opcoes: null })
      const transcricao = await transcrever(midia.buffer, midia.mimeType, { origem: "entendimento_inicial" })
      if (!transcricao) return responderComTimer(from, { texto: "Não consegui ouvir esse áudio com clareza. Pode mandar de novo ou escrever em poucas palavras?", opcoes: null })
      relato = transcricao
    }

    if (!ehAudio && text) {
      let classificacaoEntendimento = await classificarEntradaPreAtendimento(u.stage, text, { usarIA: false })
      if (classificacaoEntendimento.tipo === "terceiro") {
        return await responderImprevistoPreAtendimento(from, u, u.stage, "terceiro", text)
      }
      if (classificacaoEntendimento.tipo === "advogado_direto") {
        return await responderImprevistoPreAtendimento(from, u, u.stage, "advogado_direto", text)
      }
      if (classificacaoEntendimento.tipo === "duvida") {
        return await responderImprevistoPreAtendimento(from, u, u.stage, "duvida", text)
      }
      if (text.replace(/\s+/g, "").length < 20) {
        iniciarTimer(from)
        return await responderTelaComAudio(
          from,
          u,
          {
            texto: `💬 Entendi. Para preparar seu caso direitinho, me conte um pouco mais sobre o que aconteceu.\n\nPode escrever do seu jeito, em frases simples.`,
            opcoes: null
          },
          "Entendi. Para preparar seu caso direitinho, me conte um pouco mais sobre o que aconteceu. Pode escrever do seu jeito, em frases simples.",
          "situacao curta"
        )
      }
      classificacaoEntendimento = await classificarEntradaPreAtendimento(u.stage, text)
      if (classificacaoEntendimento.tipo === "terceiro") {
        return await responderImprevistoPreAtendimento(from, u, u.stage, "terceiro", text)
      }
      if (classificacaoEntendimento.tipo === "advogado_direto") {
        return await responderImprevistoPreAtendimento(from, u, u.stage, "advogado_direto", text)
      }
      if (classificacaoEntendimento.tipo === "duvida") {
        return await responderImprevistoPreAtendimento(from, u, u.stage, "duvida", text)
      }
    }

    u._audioCanalTranscricao = normalizarTextoCRM(relato)
    u.descricao = u._audioCanalTranscricao
    const classificacao = await classificarAreaAudio(u._audioCanalTranscricao)
    aplicarClassificacaoJuridica(u, classificacao)
    iniciarTimer(from)
    return await flowAssessoriaInicial(u, { from, origem: ehAudio ? "audio" : "texto" })
  }

  if (u.stage === STAGES.DIRECIONAMENTO) {
    if (u.numeroCaso) {
      setStage(u, STAGES.CLIENTE)
      iniciarTimer(from)
      return await menuClienteComAudio(from, u)
    }
    if (u._audioCanalTranscricao || u.descricao) {
      setStage(u, STAGES.AUDIO_CONFIRMAR_DADOS)
      iniciarTimer(from)
      return await telaConfirmarDadosAudio(from, u)
    }
    return await iniciarFluxoRelatoLivre(from, u, { boasVindas: false })
  }
  // Fim novo fluxo humanizado

  if (text === "m_encerrar") {
    if (u.numeroCaso) return await encerrarClienteCadastrado(from, u)
    return encerrarComCaptura(from, u)
  }

  if (!ehAudio && !ehDoc && text && u.stage !== STAGES.CLIENTE && u.lastPerguntaPayload?.opcoes?.length && !stageAceitaTextoLivre(u.stage)) {
    const opcoesValidas = new Set((u.lastPerguntaPayload.opcoes || []).map(o => o.id))
    if (!opcoesValidas.has(text)) {
      if (u.stage && u.stage !== STAGES.CLIENTE) {
        return await responderTelaComAudio(
          from,
          u,
          {
            texto: `🤔 Não entendi. Escolha uma opção do menu 👇\n\n${u.lastPerguntaPayload.texto}`,
            opcoes: u.lastPerguntaPayload.opcoes
          },
          "Não entendi. Por favor, escolha uma das opções do menu para continuar.",
          "opcao invalida"
        )
      }
      const respLivre = ehMensagemEntradaGlobal(text) ? null : (GROQ_KEY ? await respostaIA(u, text) : null)
      return await responderTelaComAudio(
        from,
        u,
        {
          texto: `${respLivre ? respLivre + "\n\n" : ""}👍 Entendi. Vamos continuar de onde paramos.\n\n${u.lastPerguntaPayload.texto}`,
          opcoes: u.lastPerguntaPayload.opcoes
        },
        "Entendi. Vamos continuar de onde paramos. Escolha uma das opções da tela para seguir.",
        "retomar pergunta"
      )
    }
  }

  if (u.stage === STAGES.CONFIRMAR_ENTRADA) {
    const resultadoPedidoCorrecaoEntrada = await handleConfirmEntryCorrection({
      u,
      texto: text,
      from,
      stages: STAGES,
      iniciarTimer,
      gerarAudioAtendente,
      enviarAudio,
      urlAudioAtendente,
      esperar: ms => new Promise(resolve => setTimeout(resolve, ms)),
      logErro
    })
    if (resultadoPedidoCorrecaoEntrada.handled) return resultadoPedidoCorrecaoEntrada.response

    // Texto livre = informação corrigida diretamente
    if (text && text !== "entrada_ok" && text !== "entrada_corrigir") {
      const tipo = u._entradaPendenteTipo
      const origem = u._entradaPendenteOrigem
      const resultadoNomeCorrigido = await handleConfirmEntryCorrectedName({
        u,
        texto: text,
        from,
        stages: STAGES,
        extrairNomeDaCorrecaoExplicita,
        formatarNome,
        limparTextoSomenteLetras,
        ehNomeAparente,
        gerarAudioAtendente,
        enviarAudio,
        urlAudioAtendente,
        esperar: ms => new Promise(resolve => setTimeout(resolve, ms)),
        logErro
      })
      if (resultadoNomeCorrigido.handled) return resultadoNomeCorrigido.response

      const resultadoTelefoneCorrigido = await handleConfirmEntryPhone({
        u,
        texto: text,
        from,
        stages: STAGES,
        normalizarTelefone,
        formatarTelefoneExibicao,
        gerarAudioAtendente,
        enviarAudio,
        urlAudioAtendente,
        esperar: ms => new Promise(resolve => setTimeout(resolve, ms)),
        logErro
      })
      if (resultadoTelefoneCorrigido.handled) return resultadoTelefoneCorrigido.response

      if (tipo === "cidade") {
        // Para cidade, redireciona para o handler completo de cidade (com IBGE, CEP etc.)
        limparEntradaPendente(u)
        setStage(u, STAGES.ACOLHIMENTO_CIDADE)
        iniciarTimer(from)
        return await processarInterno(from, u.nomeWA || "", text, { type: "text", text: { body: text } }, u)
      }
      const resultadoRetryEntradaInvalida = await handleConfirmEntryInvalidRetry({
        u,
        texto: text,
        from,
        stages: STAGES,
        iniciarTimer
      })
      if (resultadoRetryEntradaInvalida.success) {
        return resultadoRetryEntradaInvalida.response
      }
      // Não conseguiu extrair valor válido — orienta
      iniciarTimer(from)
      return { texto: "Não consegui identificar a informação. Por favor, me diga novamente. Pode falar ou digitar. 🎙️", opcoes: null }
    }
    const resultadoAceitacaoFinalEntrada = await handleConfirmEntryFinalAcceptance({
      u,
      texto: text,
      from,
      stages: STAGES,
      limparEntradaPendente,
      sincronizarContatoNegocioHubSpot,
      setStage,
      iniciarTimer,
      primeiroNomeCliente,
      enviarAudioModoVoz,
      flowAcolhimentoConfirmaWhatsapp,
      normalizarNumeroWhatsAppEnvio,
      flowAcolhimentoCidade,
      voltarParaConfirmacao,
      enviarAudioPedidoCidade,
      aproveitarRelatoAudioClienteNovoCaso,
      respostaRecomecoMenuPrincipal,
      telaConfirmarDadosAudio,
      iniciarFluxoRelatoLivre
    })
    if (resultadoAceitacaoFinalEntrada.handled) return resultadoAceitacaoFinalEntrada.response

    // Fallback genérico — reapresenta a tela de confirmação
    const resultadoEntradaInvalida = await handleConfirmEntryInvalid({
      u,
      from,
      stages: STAGES,
      iniciarTimer
    })
    if (resultadoEntradaInvalida.handled) return resultadoEntradaInvalida.response
  }

  // NOVO CASO CONFIRMA — verificar se o telefone é do cliente
  if (u.stage === "novo_caso_confirma") {
    if (text === "m_inicio") {
      const menuAnterior = await voltarMenuCasoAnteriorCliente(from, u)
      if (menuAnterior) return menuAnterior
      setStage(u, STAGES.CLIENTE)
      iniciarTimer(from)
      return await menuClienteComAudio(from, u)
    }
    if (text === "nc_meu") {
      u._novoCasoParaTerceiro = false
      u.atendimentoParaTerceiro = false
      u.nomeContato = null
      u.whatsappVerificado = true
      u.telefoneEhDoCliente = true
      u.whatsappContato = from
      u.cidade = u._cidadeClienteAnterior || u.cidade
      u.uf = u._ufClienteAnterior || u.uf
      u.regiao = u._regiaoClienteAnterior || u.regiao
      delete u._cidadeClienteAnterior
      delete u._ufClienteAnterior
      delete u._regiaoClienteAnterior
      const relatoPendente = await aproveitarRelatoAudioClienteNovoCaso(from, u)
      if (relatoPendente) return relatoPendente
      setStage(u, STAGES.AUDIO_AGUARDANDO); iniciarTimer(from)
      await enviarAudioModoVoz(from, u, "Ótimo. Me conte a nova situação. Pode falar em áudio ou digitar.", "novo caso relato")
      if (process.env.IMAGEM_RELATO_URL) {
        await enviarImagemWhatsApp(from, process.env.IMAGEM_RELATO_URL, `➕ *Novo caso*\n\nÓtimo! Vamos abrir um novo caso. 😊\n\n📋 Me conte a nova situação com detalhes.\n\nPode falar em áudio 🎙️ ou digitar ✍️, do jeito que preferir.`, null)
        return { texto: null, opcoes: null }
      }
      return {
        texto: `➕ *Novo caso*\n\nÓtimo! Vamos abrir um novo caso. 😊\n\n📋 Me conte a nova situação com detalhes.\n\nPode falar em áudio 🎙️ ou digitar ✍️, do jeito que preferir.`,
        opcoes: null
      }
    }
    if (text === "nc_outro") {
      delete u._cidadeClienteAnterior
      delete u._ufClienteAnterior
      delete u._regiaoClienteAnterior
      const nomeQuemAbre = u._casoAnteriorCliente?.nome || u.nomeContato || null
      u._novoCasoParaTerceiro = true
      u.atendimentoParaTerceiro = true
      u.nomeContato = nomeQuemAbre
      u.relacaoComAtendido = u.relacaoComAtendido || "terceiro"
      u.papelContato = "indicante"
      u.whatsappVerificado = false
      u.telefoneEhDoCliente = false
      u.whatsappContato = null
      u.nome = null
      u.nomeConfirmado = false
      u.regiao = null
      u.cidade = null
      u.uf = null
      return await proximaEtapaNovoCasoClienteAposModo(from, u)
    }
  }
  if (u.stage === "coleta_tel_outro" && text) {
    const nomeLimpo = extrairNomeDaCorrecaoExplicita(text) || formatarNome(limparTextoSomenteLetras(text))
    const validacaoTelOutro = nomeLimpo ? ehNomeAparente(nomeLimpo, text) : false
    if (!nomeLimpo || validacaoTelOutro === false) return responderComTimer(from, { texto: "Informe um nome válido usando apenas letras e espaços.", opcoes: null })
    if (validacaoTelOutro === "incompleto") return responderComTimer(from, { texto: "Preciso do nome completo da pessoa atendida. Por favor, informe também o sobrenome.", opcoes: null })
    return await prepararConfirmacaoEntrada(from, u, "nome", nomeLimpo, "coleta_tel_outro")
  }
  if (u.stage === "coleta_tel_wpp" && text) {
    let telefone = text.replace(/\D/g, "")
    // Normalização inteligente: aceita números sem DDD ou sem nono dígito
    const dddFrom = from.replace(/\D/g, "").slice(2, 4) || "81"
    // Sem DDD: 8 ou 9 dígitos ? adiciona DDD do from
    if (telefone.length === 8) telefone = dddFrom + "9" + telefone
    else if (telefone.length === 9) telefone = dddFrom + telefone
    // Com DDD mas sem nono dígito: 10 dígitos ? adiciona nono
    else if (telefone.length === 10) telefone = telefone.slice(0, 2) + "9" + telefone.slice(2)
    // Com DDI 55: 13 dígitos ? remove DDI
    else if (telefone.length === 13 && telefone.startsWith("55")) telefone = telefone.slice(2)
    else if (telefone.length === 12 && telefone.startsWith("55")) telefone = telefone.slice(2, 4) + "9" + telefone.slice(4)
    if (telefone.length !== 11) return responderComTimer(from, { texto: "Não consegui identificar o número. Por favor, informe com DDD. Exemplo: DDD 9 0000-0000.", opcoes: null })
    let digTel = telefone
    const labelTel = `(${digTel.slice(0,2)}) ${digTel.slice(2,3)} ${digTel.slice(3,7)}-${digTel.slice(7,11)}`
    u._entradaPendenteTipo = "telefone"
    u._entradaPendenteValor = telefone
    u._entradaPendenteOrigem = "coleta_tel_wpp"
    setStage(u, STAGES.CONFIRMAR_ENTRADA)
    iniciarTimer(from)
    try {
      const digAudio = digTel.split("").join(" ")
      const ogg = await gerarAudioAtendente(u.atendente,
        `O número informado foi ${digAudio}. Está correto? Se não estiver, me diga o número correto agora, pode falar ou digitar.`)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 3500))
    } catch (e) { logErro("tts", "Falha áudio confirmar telefone digitado", e) }
    return {
      texto: `●●●●○○ 📱 Etapa 4 de 6 · *WHATSAPP*\n\nVocê informou: *${labelTel}*\n\nEstá correto? Se não estiver, é só me dizer o número correto agora. Pode falar ou digitar. 🎙️`,
      opcoes: [
      { id: "entrada_ok", title: "✅ Confirmar" }
      ]
    }
  }

  if (!u.numeroCaso && ehStageFluxoAntigo(u.stage)) {
    logDebug(`[LEGADO_GUARDA_COLETA] ${u.stage} -> ${STAGES.AUDIO_AGUARDANDO} | USER: ${u._numero || "-"}`)
    return await iniciarFluxoRelatoLivre(from, u, { boasVindas: false })
  }

  // COLETA
  const resultadoColetaLegada = await processarColetaLegada({ from, u, text })
  if (resultadoColetaLegada.handled) return resultadoColetaLegada.response

  // DESC_CONFIRMA — confirmar ou voltar para descrição
  const resultadoConfirmacaoDescricao = await handleDescriptionConfirmation({
    u,
    texto: text,
    from,
    stages: STAGES,
    normalizarTextoCRM,
    sincronizarNegocio,
    respostaAposConfirmarDescricao,
    entrarEtapaDescricao,
    iniciarTimer,
    telaDescreverCaso
  })
  if (resultadoConfirmacaoDescricao.handled) return resultadoConfirmacaoDescricao.response

  // GATILHO ? URGENCIA ? COLETA
  if (u.stage === "gatilho") {
    setStage(u, "urgencia"); iniciarTimer(from)
    return { texto: "💰 Isso está te prejudicando *financeiramente* hoje?", opcoes: [{ id: "urg_sim", title: "⚠️ Sim, está" }, { id: "urg_nao", title: "✅ Não, consigo esperar" }] }
  }
  if (u.stage === "urgencia") {
    if (text === "urg_sim") { u.urgencia = "alta"; u.score += 3 }
    if (u.whatsappVerificado) return avancarAposTelefoneConfirmado(from, u)
    setStage(u, "coleta_verif_tel"); iniciarTimer(from)
    return {
      texto: `●●●●○○ 📱 Etapa 4 de 6 · *WHATSAPP*\n\n📱 Esse número *${from}* é o seu WhatsApp?\n\nPreciso saber para que nossa equipe entre em contato corretamente.`,
      opcoes: [
      { id: "tel_meu", title: "✅ Sim, é meu" },
      { id: "tel_outro", title: "👤 Não, é de outra pessoa" }
      ]
    }
  }
  if (u.stage === "coleta_verif_tel") {
    if (text === "tel_outro") {
      u.whatsappVerificado = true
      u.telefoneEhDoCliente = false
      setStage(u, "coleta_tel_wpp_contato"); iniciarTimer(from)
      return { texto: "●●●●○○ 📱 Etapa 4 de 6 · *WHATSAPP*\n\nQual é o WhatsApp com DDD da pessoa que será atendida?", opcoes: null }
    }
    u.whatsappVerificado = true
    u.telefoneEhDoCliente = true
    u.whatsappContato = from
    return avancarAposTelefoneConfirmado(from, u)
  }
  if (u.stage === "coleta_tel_wpp_contato") {
    // Confirmou que o número atual é o WhatsApp da pessoa atendida
    if (text === "wpp_contato_esse") {
      u.whatsappContato = from
      u.whatsappVerificado = true
      u.telefoneEhDoCliente = false
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, `Perfeito! Vou usar este número para o atendimento.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 2000))
        } catch (e) { logErro("tts", "Falha áudio wpp_contato_esse", e) }
      }
      return await avancarAposTelefoneConfirmado(from, u)
    }
    if (text === "wpp_contato_outro") {
      iniciarTimer(from)
      await enviarAudioModoVoz(from, u, "Tudo bem. Diga agora o WhatsApp com DDD da pessoa atendida, por áudio ou digitando.", "informar outro whatsapp atendido")
      return { texto: `●●●●○○ 📱 Etapa 4 de 6 · *WHATSAPP*\n\nDigite ou fale o WhatsApp com DDD da pessoa atendida agora. 🎙️`, opcoes: [{ id: "wpp_contato_esse", title: "✅ Usar número atual" }] }
    }
    // Digitou o número diretamente
    if (text) {
      const telefone = text.replace(/\D/g, "")
      if (![10,11].includes(telefone.length)) return responderComTimer(from, { texto: "Informe um WhatsApp válido com DDD, contendo 10 ou 11 dígitos.", opcoes: null })
      return await prepararConfirmacaoEntrada(from, u, "telefone", telefone, "coleta_tel_wpp_contato")
    }
  }

  if (u.stage === STAGES.URGENTE_AUDIO_ERRO_TRANSCRICAO) {
    if (text === "urg_audio_corrigir") {
      if (u._urgenteAudioBuffer) {
        await salvarAudioTranscritoNoCaso(u, u._urgenteAudioNome, u._urgenteAudioBuffer, u._urgenteAudioMime, "corrigido")
      }
      u._urgenteAudioBuffer = null
      u._urgenteAudioMime = null
      u._urgenteAudioNome = null
      u._urgenteAudioTexto = null
      setStage(u, STAGES.AGUARDANDO_URGENTE)
      iniciarTimer(from)
  return { texto: `📩 *Mensagem urgente*\n\nDigite sua mensagem ou envie um áudio agora.\n\nTudo será registrado imediatamente e nossa equipe será notificada. ⚡\n\n📄 Caso: *${u.numeroCaso}*\n\n⏱️ _Prazo de retorno: até 4 horas em dias úteis._`, opcoes: null }
    }
  }

  if (u.stage === STAGES.URGENTE_AUDIO_CONFIRMA) {
    if (text === "urg_audio_ok") {
      await salvarAudioTranscritoNoCaso(u, u._urgenteAudioNome, u._urgenteAudioBuffer, u._urgenteAudioMime, "confirmado")
      await hsCriarNota(
        u.contatoId,
        "ÁUDIO URGENTE",
        `De: ${u.nome} (${from})\nCaso: ${u.numeroCaso}\n\nTranscrição:\n"${u._urgenteAudioTexto || "Transcrição indisponível"}"`
      )
      await hsMoverStage(u.negocioId, HS_STAGE.ANALISE)
      const _textoAudio = u._urgenteAudioTexto || "Transcrição indisponível"
      notificarMensagemUrgente(u, _textoAudio, u.negocioId).catch(e => console.error("[notif] urgente-audio:", e.message))
      u._urgenteAudioBuffer = null
      u._urgenteAudioMime = null
      u._urgenteAudioNome = null
      u._urgenteAudioTexto = null
      setStage(u, STAGES.CLIENTE)
      return await respostaUrgenteRegistradaComAudio(from, u, "mensagem urgente audio registrada")
    }
    if (text === "urg_audio_corrigir") {
      await salvarAudioTranscritoNoCaso(u, u._urgenteAudioNome, u._urgenteAudioBuffer, u._urgenteAudioMime, "corrigido")
      u._urgenteAudioBuffer = null
      u._urgenteAudioMime = null
      u._urgenteAudioNome = null
      u._urgenteAudioTexto = null
      setStage(u, STAGES.AGUARDANDO_URGENTE)
      iniciarTimer(from)
  return { texto: `📩 *Mensagem urgente*\n\nDigite sua mensagem ou envie um áudio agora.\n\nTudo será registrado imediatamente e nossa equipe será notificada. ⚡\n\n📄 Caso: *${u.numeroCaso}*\n\n⏱️ _Prazo de retorno: até 4 horas em dias úteis._`, opcoes: null }
    }
    return responderComTimer(from, await telaConfirmarUrgenteComAudio(from, u, u._urgenteAudioTexto || ""))
  }

  const resultadoPosAudio = await processarPosAudio({ from, u, text })
  if (resultadoPosAudio.handled) return resultadoPosAudio.response


  const resultadoNavegacaoCliente = await processarNavegacaoCliente({ from, u, text })
  if (resultadoNavegacaoCliente.handled) return resultadoNavegacaoCliente.response

  // MENU CLIENTE
  if (u.stage === "cliente") {
    if (!podeMostrarMenuCliente(u)) {
      salvarEtapa(u._numero, STAGES.AUDIO_AGUARDANDO)
      iniciarTimer(from)
      return respostaRecomecoMenuPrincipal(u)
    }
    if (text === "terceiro_reconhece" || normalizarTextoGatilho(text) === "reconheco" || normalizarTextoGatilho(text) === "reconheço") {
      u._aguardandoReconhecimentoTerceiro = false
      iniciarTimer(from)
      await enviarAudioModoVoz(
        from,
        u,
        "Tudo certo. Vou abrir seu menu do cliente para você acompanhar este atendimento.",
        "terceiro reconhece caso"
      )
      return await menuClienteComAudio(from, u)
    }
    if (text === "terceiro_nao_reconhece" || normalizarTextoGatilho(text).includes("nao reconhe") || normalizarTextoGatilho(text).includes("não reconhe")) {
      u._aguardandoReconhecimentoTerceiro = false
      u._casoNaoReconhecido = true
      iniciarTimer(from)
      if (u.negocioId) {
        await hsMoverStage(u.negocioId, HS_STAGE.LEAD)
        u.negocioStageId = HS_STAGE.LEAD
      }
      await hsCriarNota(
        u.contatoId,
        "CASO NAO RECONHECIDO PELO WHATSAPP INFORMADO",
        `A pessoa do WhatsApp ${from} informou que nao reconhece a abertura do caso.\nCaso: ${u.numeroCaso || "-"}\nNome no cadastro: ${u.nome || "-"}`
      )
      await enviarWhatsAppAdmin(`⚠️ *Caso não reconhecido*\n\n📄 Caso: ${u.numeroCaso || "-"}\n👤 Nome cadastrado: ${u.nome || "-"}\n📱 WhatsApp: ${from}\n\nA pessoa informou que não reconhece a abertura deste atendimento.`)
      await enviarAudioModoVoz(
        from,
        u,
        "Entendi. Registrei que você não reconhece este atendimento. Nossa equipe será notificada para verificar o ocorrido.",
        "terceiro nao reconhece caso"
      )
      return {
        texto: `⚠️ *Entendi.*\n\nRegistrei que você não reconhece este atendimento.\n\nNossa equipe será notificada para verificar o ocorrido. Você não precisa enviar documentos nem dar continuidade por aqui agora.`,
        opcoes: null,
        registrarPergunta: false
      }
    }
    if (text === "audio_cliente_novo_caso") {
      return await abrirNovoCasoCliente(from, u)
    }
    if (text === "audio_cliente_caso_atual") {
      const textoAudio = u._audioClientePendenteTexto || ""
      if (!textoAudio) {
        u._audioClientePendenteArquivo = null
        iniciarTimer(from)
        return await responderTelaComAudio(
          from,
          u,
          {
            texto: "🎙️ Não encontrei um áudio pendente para registrar.\n\nVocê pode enviar o áudio novamente ou voltar ao menu do cliente.",
            opcoes: [
      { id: "m_adv",      title: "👨‍⚖️ Falar com advogado" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
            ]
          },
          "Não encontrei um áudio pendente para registrar. Você pode enviar o áudio novamente ou voltar ao menu do cliente.",
          "audio cliente pendente ausente"
        )
      }
      const urgente = detectarIntencaoCliente(textoAudio) === "urgente"
      await hsCriarNota(
        u.contatoId,
        urgente ? "MENSAGEM URGENTE" : "MENSAGEM SOBRE CASO ATUAL",
        `De: ${u.nome || "-"} (${from})\nCaso: ${u.numeroCaso || "-"}\n\n${textoAudio}${u._audioClientePendenteArquivo ? `\nDrive: ${u._audioClientePendenteArquivo}` : ""}`
      )
      if (urgente) {
        await hsMoverStage(u.negocioId, HS_STAGE.ANALISE)
        notificarMensagemUrgente(u, textoAudio, u.negocioId).catch(e => console.error("[notif] urgente-audio-cliente:", e.message))
      }
      u._audioClientePendenteTexto = null
      u._audioClientePendenteArquivo = null
      if (urgente) {
        setStage(u, STAGES.CLIENTE)
        return await respostaUrgenteRegistradaComAudio(from, u, "mensagem urgente audio cliente caso atual")
      }
      iniciarTimer(from)
      return await responderTelaComAudio(
        from,
        u,
        {
          texto: `✅ *Mensagem registrada no seu caso atual.*\n\nNossa equipe poderá consultar esse registro no atendimento.`,
          opcoes: [
      { id: "m_adv",      title: "👨‍⚖️ Falar com advogado" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
          ]
        },
        "Mensagem registrada no seu caso atual. Nossa equipe poderá consultar esse registro no atendimento.",
        "mensagem caso atual"
      )
    }
    if (text === "doc_cliente_anexar") {
      const nomeDoc = u._docClientePendenteNome || "Documento recebido"
      const linkDoc = u._docClientePendenteArquivo || ""
      const fileIdDoc = u._docClientePendenteId || null
      if (!linkDoc) {
        u._docClientePendenteNome = null
        u._docClientePendenteArquivo = null
        u._docClientePendenteId = null
        u._docsClienteGuiado = false
        iniciarTimer(from)
        return await responderTelaDocumento(from, u, criarTela({
          id: "documento_pendente_ausente",
          titulo: "Arquivo pendente não encontrado",
          texto: "📎 Não encontrei um arquivo pendente para anexar.\n\nPode enviar o documento novamente?",
          textoAudioBase: "Não encontrei um arquivo pendente para anexar. Pode enviar o documento novamente",
          acoes: [
            { id: "m_docs", label: "📎 Enviar documentos" },
            { id: "m_inicio", label: "🏠 Menu do cliente" }
          ]
        }))
      }
      const nomeRenomeado = `Documento anexado - ${primeiroEUltimoNome(u.nome || "cliente") || "cliente"}${path.extname(nomeDoc) || ""}`
      const arquivoRenomeado = await renomearArquivoDrive(fileIdDoc, nomeRenomeado)
      if (!arquivoRenomeado?.id) {
        return await responderTelaDocumento(from, u, criarTela({
          id: "documento_avulso_renomeacao_falhou",
          titulo: "Falha ao anexar documento",
          texto: "⚠️ Não consegui concluir o anexo desse arquivo agora.\n\nO arquivo permanece aguardando confirmação. Tente novamente em instantes.",
          textoAudioBase: "Não consegui concluir o anexo desse arquivo agora. O arquivo continua aguardando confirmação. Tente novamente em instantes",
          acoes: [
            { id: "doc_cliente_anexar", label: "🔄 Tentar novamente" },
            { id: "m_inicio", label: "🏠 Menu do cliente" }
          ]
        }))
      }
      if (u.negocioId) {
        const moveu1 = await hsMoverStageSeguro(u.negocioId, HS_STAGE.DOCS, u.negocioStageId, u.consultaStatus === "agendada")
        if (moveu1) u.negocioStageId = HS_STAGE.DOCS
      }
      const nomeFinalDoc = arquivoRenomeado?.name || nomeDoc
      const linkFinalDoc = arquivoRenomeado?.webViewLink || linkDoc
      await hsCriarNota(
        u.contatoId,
        "DOCUMENTO ANEXADO AO CASO",
        `De: ${u.nome || "-"} (${from})\nCaso: ${u.numeroCaso || "-"}\nArquivo: ${nomeFinalDoc}${linkFinalDoc ? `\nDrive: ${linkFinalDoc}` : ""}`
      )
      await confirmarDocumentoCanonicoSeguro(u, fileIdDoc, { origem: "doc_cliente_anexar" })
      if (isPilotCaseAllowed(u.numeroCaso)) {
        await consolidarDocumentosDoCasoSeguro({ u, contexto: { origem: "documento_avulso_confirmado" } })
      }
      u.documentosEnviados = true
      u._docsClienteGuiado = false
      u._docClientePendenteNome = null
      u._docClientePendenteArquivo = null
      u._docClientePendenteId = null
      const casoInfoAnexado = u.numeroCaso ? `\n\n📄 *${u.numeroCaso}* · ${iconeAreaJuridica(u.area || "")} ${u.area || "Não informada"}\n_${formatarSituacaoJuridica(u.situacao, u.tipo, u.subTipo) || "Em análise"}_` : ""
      const telaAnexado = criarTela({
        id: "documento_avulso_anexado",
        titulo: "Documento anexado",
        texto: `✅ *Documento anexado ao caso!*${casoInfoAnexado}\n\nNossa equipe poderá consultar esse arquivo na análise.`,
        textoAudioBase: "Documento anexado ao caso. Nossa equipe poderá consultar esse arquivo na análise",
        imagemUrl: IMAGEM_DOC_ANEXADO_URL,
        acoes: [
          { id: "m_docs", label: "📎 Enviar documentos" },
          { id: "m_adv", label: "👨‍⚖️ Falar com advogado" },
          { id: "m_inicio", label: "🏠 Menu do cliente" }
        ]
      })
      await enviarGuiaDocs(from, u, telaAnexado)
      registrarUltimaPergunta(u, telaAnexado)
      iniciarTimer(from)
      return {}
    }
    if (text?.startsWith("doc_cliente_tipo_")) {
      const nomeDoc = u._docClientePendenteNome || "Documento recebido"
      const linkDoc = u._docClientePendenteArquivo || ""
      const fileIdDoc = u._docClientePendenteId || null
      if (!linkDoc) {
        u._docClientePendenteNome = null
        u._docClientePendenteArquivo = null
        u._docClientePendenteId = null
        u._docsClienteGuiado = false
        iniciarTimer(from)
        return await responderTelaDocumento(from, u, criarTela({
          id: "documento_classificacao_pendente_ausente",
          titulo: "Arquivo pendente não encontrado",
          texto: "📎 Não encontrei um arquivo pendente para anexar.\n\nPode enviar o documento novamente?",
          textoAudioBase: "Não encontrei um arquivo pendente para anexar. Pode enviar o documento novamente",
          acoes: [
            { id: "m_docs", label: "📎 Enviar documentos" },
            { id: "m_inicio", label: "🏠 Menu do cliente" }
          ]
        }))
      }
      const tiposDocCliente = {
        doc_cliente_tipo_pessoal: "Documento pessoal",
        doc_cliente_tipo_prova: "Prova do caso",
        doc_cliente_tipo_outro: "Outro documento"
      }
      const tipoDoc = tiposDocCliente[text] || "Documento recebido"
      const nomeRenomeado = `${tipoDoc} - ${primeiroEUltimoNome(u.nome || "cliente") || "cliente"}${path.extname(nomeDoc) || ""}`
      const arquivoRenomeado = await renomearArquivoDrive(fileIdDoc, nomeRenomeado)
      if (!arquivoRenomeado?.id) {
        return await responderTelaDocumento(from, u, criarTela({
          id: "documento_avulso_classificacao_falhou",
          titulo: "Falha ao classificar documento",
          texto: "⚠️ Não consegui concluir a classificação desse arquivo agora.\n\nO arquivo permanece aguardando confirmação. Tente novamente em instantes.",
          textoAudioBase: "Não consegui concluir a classificação desse arquivo agora. O arquivo continua aguardando confirmação. Tente novamente em instantes",
          acoes: [
            { id: text, label: "🔄 Tentar novamente" },
            { id: "m_inicio", label: "🏠 Menu do cliente" }
          ]
        }))
      }
      if (u.negocioId) {
        const moveu2 = await hsMoverStageSeguro(u.negocioId, HS_STAGE.DOCS, u.negocioStageId, u.consultaStatus === "agendada")
        if (moveu2) u.negocioStageId = HS_STAGE.DOCS
      }
      const nomeFinalDoc = arquivoRenomeado?.name || nomeDoc
      const linkFinalDoc = arquivoRenomeado?.webViewLink || linkDoc
      await hsCriarNota(
        u.contatoId,
        "DOCUMENTO ANEXADO AO CASO",
        `De: ${u.nome || "-"} (${from})\nCaso: ${u.numeroCaso || "-"}\nTipo: ${tipoDoc}\nArquivo: ${nomeFinalDoc}${linkFinalDoc ? `\nDrive: ${linkFinalDoc}` : ""}`
      )
      if (isPilotCaseAllowed(u.numeroCaso)) {
        await consolidarDocumentosDoCasoSeguro({ u, contexto: { origem: "documento_avulso_classificado" } })
      }
      u.documentosEnviados = true
      u._docsClienteGuiado = false
      u._docClientePendenteNome = null
      u._docClientePendenteArquivo = null
      u._docClientePendenteId = null
      iniciarTimer(from)
      return responderTelaDocumento(from, u, criarTela({
        id: "documento_avulso_classificado",
        titulo: "Documento classificado",
        texto: `✅ *${tipoDoc}* anexado ao caso.\n\nNossa equipe poderá consultar esse arquivo na análise.`,
        textoAudioBase: `${tipoDoc} anexado ao caso. Nossa equipe poderá consultar esse arquivo na análise`,
        acoes: [
          { id: "m_docs", label: "📎 Enviar documentos" },
          { id: "m_adv", label: "👨‍⚖️ Falar com advogado" },
          { id: "m_inicio", label: "🏠 Menu do cliente" }
        ]
      }))
    }
    if (text?.startsWith("m_caso_")) {
      const idx = Number(text.replace("m_caso_", ""))
      const caso = Array.isArray(u._casosMenuCliente) ? u._casosMenuCliente[idx] : null
      if (!caso?.negocio) {
        iniciarTimer(from)
        u._mostrarPainelCasosCliente = true
        return await menuClienteComAudio(from, u)
      }
      const acaoPendente = u._acaoPendente || null
      restaurarEstadoNegocioHubSpot(u, caso.negocio)
      u.stage = STAGES.CLIENTE
      u.etapa = STAGES.CLIENTE
      u._menuClienteCasoAtivo = true
      u._mostrarPainelCasosCliente = false
      u._acaoPendente = acaoPendente
      if (!acaoPendente) {
        u._casoSelecionadoAudio = {
          area: caso.area || u.area,
          numeroCaso: caso.numeroCaso || u.numeroCaso
        }
      }
      iniciarTimer(from)
      if (acaoPendente) return await executarAcaoPendenteCliente(from, u)
      return await menuClienteComAudio(from, u)
    }
    if (text === "m_status") {
      iniciarTimer(from)
      const selecao = await abrirSelecaoCasoParaAcao(from, u, "status")
      if (selecao !== false) return selecao
      return await telaStatusCliente(from, u)
    }
    if (text === "cliente_cancelar_consulta") {
      u._docsClienteGuiado = false
      iniciarTimer(from)
      return await telaConfirmarCancelamentoConsultaCliente(from, u)
    }
    if (text === "cliente_cancelar_consulta_sim") {
      u._docsClienteGuiado = false
      iniciarTimer(from)
      return await cancelarConsultaCliente(from, u)
    }
    if (text === "docs_intro_ok") {
      aplicarContextoDocsCasoAtual(u)
      if (u.negocioId) {
        const moveu3 = await hsMoverStageSeguro(u.negocioId, HS_STAGE.AGUARDANDO_DOCS, u.negocioStageId, u.consultaStatus === "agendada")
        if (moveu3) u.negocioStageId = HS_STAGE.AGUARDANDO_DOCS
      }
      if (getDocsPendentes(u).length === 0 && getDocsFaltantesReenviaveis(u).length > 0) {
        u._docsClienteGuiado = true
        u.etapa = "documentos"
        iniciarTimer(from)
        const telaPendentes = telaDocsPendentesComImagem(u)
        await enviarGuiaDocs(from, u, telaPendentes)
        registrarUltimaPergunta(u, telaPendentes)
        return null
      }
      await enviarTelaDocumentosCaso(from, u)
      iniciarTimer(from)
      return null
    }
    if (text === "docs_confirmar_envio_extra") {
      const casoInfoExtra = u.numeroCaso ? `\n\n📄 *${u.numeroCaso}* · ${iconeAreaJuridica(u.area || "")} ${u.area || "Não informada"}\n_${formatarSituacaoJuridica(u.situacao, u.tipo, u.subTipo) || "Em análise"}_` : ""
      const telaEnvioExtra = criarTela({
        id: "documento_envio_extra",
        titulo: "Enviar arquivo adicional",
        texto: `📎 *Pode enviar o arquivo agora.*${casoInfoExtra}\n\nAssim que receber, vou salvar no seu caso.`,
        textoAudioBase: "Pode enviar o arquivo agora. Assim que receber, vou salvar no seu caso",
        imagemUrl: IMAGEM_ENVIO_EXTRA_URL,
        acoes: [
          { id: "m_inicio", label: "🏠 Menu do cliente" }
        ]
      })
      await enviarGuiaDocs(from, u, telaEnvioExtra)
      registrarUltimaPergunta(u, telaEnvioExtra)
      iniciarTimer(from)
      return {}
    }
    const emFluxoDocumento = Boolean(
      u._docsClienteGuiado ||
      u.etapa === "documentos" ||
      u.lastPergunta === "documentos" ||
      identificarEtapaAtual(u, u.lastPerguntaPayload || {}) === "documentos"
    )
    const comandoDoc = emFluxoDocumento ? detectarComandoDocumento(text) : null
    if (emFluxoDocumento && text && !comandoDoc && !text.startsWith("m_") && !text.startsWith("doc_cliente_tipo_")) {
      const indicaAusenciaDocumento = textoIndicaDocumentoAusente(text)
      const intencaoDocumento = indicaAusenciaDocumento ? null : detectarIntencaoCliente(text)
      if (intencaoDocumento) {
        const respostaIntencao = await executarIntencaoDetectadaCliente(from, u, intencaoDocumento, text)
        return respostaIntencao || {}
      }
      const { doc: docTexto, folha: folhaTexto } = getDocumentoAtualGuia(u)
      if (docTexto && indicaAusenciaDocumento) {
        marcarStatusDocumento(u, docTexto.id, "docsAusentes")
        u.docAtualIdx = 0
        u.ultimoArqId = null
        u.ultimoArqNome = null
        salvarEtapa(u._numero, "documentos")
        await hsCriarNota(
          u.contatoId,
          "DOCUMENTO INFORMADO COMO AUSENTE",
          `De: ${u.nome || "-"} (${from})\nCaso: ${u.numeroCaso || "-"}\nDocumento: ${docTexto.label}\nMensagem do cliente: ${text}`
        )
        const telaAusente = telaEnvioDoc(u, enviarOpcoesPadrao)
        await enviarGuiaDocs(from, u, telaAusente)
        iniciarTimer(from)
        return null
      }

      if (docTexto && documentoAtualAceitaTexto(docTexto)) {
        marcarStatusDocumento(u, docTexto.id, "docsEntregues")
        u.docAtualIdx = 0
        u.documentosEnviados = true
        salvarEtapa(u._numero, "documentos")
        if (u.negocioId) {
          const moveu4 = await hsMoverStageSeguro(u.negocioId, HS_STAGE.DOCS, u.negocioStageId, u.consultaStatus === "agendada")
          if (moveu4) u.negocioStageId = HS_STAGE.DOCS
        }
        await hsCriarNota(
          u.contatoId,
          "INFORMACAO DOCUMENTAL RECEBIDA",
          `De: ${u.nome || "-"} (${from})\nCaso: ${u.numeroCaso || "-"}\nDocumento: ${docTexto.label}\nItem: ${folhaTexto}\n\n${text}`
        )
        const telaTexto = telaEnvioDoc(u, enviarOpcoesPadrao)
        await enviarGuiaDocs(from, u, telaTexto)
        iniciarTimer(from)
        return null
      }

      if (docTexto && text.length >= 20) {
        salvarEtapa(u._numero, "documentos")
        await hsCriarNota(
          u.contatoId,
          "OBSERVACAO SOBRE DOCUMENTO",
          `De: ${u.nome || "-"} (${from})\nCaso: ${u.numeroCaso || "-"}\nDocumento atual: ${docTexto.label}\nItem: ${folhaTexto}\n\n${text}`
        )
        iniciarTimer(from)
        return responderTelaDocumento(from, u, criarTela({
          id: "documento_observacao_texto",
          titulo: "Observação de documento",
          texto: `Anotei essa observação no seu caso.\n\nAgora envie *${folhaTexto}* do documento *${docTexto.label}* quando estiver pronto.`,
          textoAudioBase: `Anotei essa observação no seu caso. ${fraseEnvioDocumentoAudio(docTexto, folhaTexto)}`,
          acoes: [
            { id: "docs_depois", label: "Continuar depois" },
            { id: "m_inicio", label: "🏠 Menu do cliente" }
          ]
        }))
      }
    }
    if (comandoDoc === "doc_cpf_skip") {
      // Pular CPF — já está no RG
      marcarStatusDocumento(u, "doc_cpf", "docsDispensados")
      u.docAtualIdx = 0
      u.ultimoArqId = null
      const telaCpf = telaEnvioDoc(u, enviarOpcoesPadrao)
      await enviarGuiaDocs(from, u, telaCpf)
      iniciarTimer(from)
      return null
    }
    if (comandoDoc === "docs_enviar_faltantes") {
      const reabertos = reabrirDocsFaltantesReenviaveis(u)
      if (!reabertos.length) {
        const telaSemFaltantes = telaEnvioDoc(u, enviarOpcoesPadrao)
        await enviarGuiaDocs(from, u, telaSemFaltantes)
        iniciarTimer(from)
        return null
      }
      salvarEtapa(u._numero, "documentos")
      setStage(u, STAGES.CLIENTE)
      if (u.negocioId) {
        const moveu5 = await hsMoverStageSeguro(u.negocioId, HS_STAGE.AGUARDANDO_DOCS, u.negocioStageId, u.consultaStatus === "agendada")
        if (moveu5) u.negocioStageId = HS_STAGE.AGUARDANDO_DOCS
      }
      await hsCriarNota(
        u.contatoId,
        "DOCUMENTOS FALTANTES REABERTOS PARA ENVIO",
        `De: ${u.nome || "-"} (${from})\nCaso: ${u.numeroCaso || "-"}\nDocumentos reabertos:\n${reabertos.map(item => `- ${item.doc.label} (${item.status})`).join("\n")}`
      )
      const telaFaltantes = telaEnvioDoc(u, enviarOpcoesPadrao)
      await enviarGuiaDocs(from, u, telaFaltantes)
      registrarUltimaPergunta(u, telaFaltantes)
      iniciarTimer(from)
      return null
    }
    if (comandoDoc === "docs_ver_status") {
      iniciarTimer(from)
      return await telaStatusCliente(from, u)
    }
    if (text === "m_docs" || text === "docs_pedido_admin") {
      aplicarContextoDocsCasoAtual(u)
      logDebug("[DOCUMENTOS] contexto:", {
        numeroCaso: u.numeroCaso,
        negocioId: u.negocioId,
        area: u.area,
        tipo: u.tipo,
        situacao: u.situacao,
        detalhe: u.detalhe,
        docKey: u._docKey,
        casoRecemAberto: u._casoRecemAberto,
        acaoPendente: u._acaoPendente
      })
      const selecao = await abrirSelecaoCasoParaAcao(from, u, "documentos")
      if (selecao !== false) return selecao
      return await executarIntencaoCliente(from, u, "documentos", text)
    }
    if (comandoDoc === "docs_reenviar") {
      salvarEtapa(u._numero, "documentos")
      if (u.ultimoArqId) {
        const arquivoSubstituido = await marcarArquivoDriveSubstituido(u.ultimoArqId, u.ultimoArqNome)
        if (!arquivoSubstituido?.id) {
          iniciarTimer(from)
          return responderTelaDocumento(from, u, criarTela({
            id: "documento_reenvio_falhou",
            titulo: "Falha ao reenviar documento",
            texto: "⚠️ *Não consegui substituir o arquivo agora.*\n\nO arquivo atual foi mantido sem alterações. Tente novamente em instantes.",
            textoAudioBase: "Não consegui preparar a substituição desse arquivo agora. O arquivo atual foi mantido",
            acoes: [
              { id: "docs_reenviar", label: "🔄 Tentar novamente" },
              { id: "docs_depois", label: "Continuar depois" },
              { id: "m_inicio", label: "🏠 Menu do cliente" }
            ]
          }))
        }
        await hsCriarNota(
          u.contatoId,
          "DOCUMENTO MARCADO COMO SUBSTITUIDO",
          `De: ${u.nome || "-"} (${from})\nCaso: ${u.numeroCaso || "-"}\nArquivo anterior: ${u.ultimoArqNome || u.ultimoArqId}\nStatus: marcado como substituido, preservado no Drive${arquivoSubstituido?.webViewLink ? `\nDrive: ${arquivoSubstituido.webViewLink}` : ""}`
        )
        u.ultimoArqId = null; u.ultimoArqNome = null
        u.docAtualIdx = Math.max(0, (u.docAtualIdx || 1) - 1)
      }
      const pend2 = getDocsPendentes(u)
      const d2    = pend2[0]
      const f2    = (d2?.folhas || ["Foto"])[u.docAtualIdx || 0] || "Foto"
      iniciarTimer(from)
      const textoReenvio = [
        "📎 Arquivo anterior marcado como substituido.",
        "",
        "Ela foi preservada no Drive para historico do caso.",
        "",
        `Envie novamente: *${f2}* do *${d2?.label || "documento"}*`,
        "",
        "📸 Boa iluminacao, sem reflexo, tudo enquadrado."
      ].join("\n")
      return responderTelaDocumento(from, u, criarTela({
        id: "documento_reenvio_aguardando",
        titulo: "Reenviar documento",
        texto: textoReenvio,
        textoAudioBase: `Arquivo anterior marcado como substituído. ${fraseEnvioDocumentoAudio(d2 || {}, f2).replace(/^Agora envie/, "Envie novamente")} Use boa iluminação, sem reflexo e com tudo enquadrado`,
        acoes: []
      }))
    }
    if (comandoDoc === "docs_maisFotos") {
      salvarEtapa(u._numero, "documentos")
      // Não avança para o próximo documento — permanece no atual
      const pend3  = getDocsPendentes(u)
      const d3     = pend3[0]
      const fAtual = (d3?.folhas || ["Foto"])[u.docAtualIdx || 0] || `Foto ${(u.docAtualIdx||0)+1}`
      iniciarTimer(from)
      return responderTelaDocumento(from, u, criarTela({
        id: "documento_complemento_aguardando",
        titulo: "Complementar documento",
        texto: `Ok! Envie o complemento do documento *${d3?.label || "documento"}*.\n\nItem atual: *${fAtual}*\n\n💡 Mesmas orientações: boa iluminação, sem reflexo, enquadrado corretamente.`,
        textoAudioBase: `Certo. Envie o complemento para ${d3?.label || "o documento"}. O item atual é ${fAtual}. Use boa iluminação, sem reflexo e com tudo enquadrado`,
        acoes: []
      }))
    }
    if (comandoDoc === "docs_rg_verso_junto") {
      salvarEtapa(u._numero, "documentos")
      setStage(u, STAGES.CLIENTE)
      u._docsClienteGuiado = true
      u.etapa = "documentos"
      const { doc: docRg } = getDocumentoAtualGuia(u)
      if (docRg?.id === "doc_rg") {
        await confirmarDocumentoCanonicoSeguro(u, u.ultimoArqId, {
          origem: "docs_rg_verso_junto",
          assertion: "front_and_back_same_image"
        })
        await hsCriarNota(
          u.contatoId,
          "DOCUMENTO COMPLETO - FRENTE E VERSO NA MESMA IMAGEM",
          `De: ${u.nome || "-"} (${from})\nCaso: ${u.numeroCaso || "-"}\nDocumento: ${docRg.label}\nArquivo: ${u.ultimoArqNome || "-"}`
        )
      }
      u.docAtualIdx = 0
      u.ultimoArqId = null
      u.ultimoArqNome = null
      const telaRgCompleto = telaEnvioDoc(u, enviarOpcoesPadrao)
      await enviarGuiaDocs(from, u, telaRgCompleto)
      registrarUltimaPergunta(u, telaRgCompleto)
      iniciarTimer(from)
      return null
    }
    if (comandoDoc === "docs_rg_sem_verso") {
      salvarEtapa(u._numero, "documentos")
      setStage(u, STAGES.CLIENTE)
      u._docsClienteGuiado = true
      u.etapa = "documentos"
      const { doc: docRg, folha: folhaRg, fIdx: fIdxRg, folhas: folhasRg } = getDocumentoAtualGuia(u)
      if (docRg?.id === "doc_rg") {
        await confirmarDocumentoCanonicoSeguro(u, u.ultimoArqId, { origem: "docs_rg_sem_verso" })
        await hsCriarNota(
          u.contatoId,
          "DOCUMENTO PARCIAL - CLIENTE SEGUIU SEM VERSO",
          `De: ${u.nome || "-"} (${from})\nCaso: ${u.numeroCaso || "-"}\nDocumento: ${docRg.label}\nItem pendente: ${folhaRg}\nProgresso: ${fIdxRg} de ${folhasRg.length}`
        )
      }
      u.docAtualIdx = 0
      u.ultimoArqId = null
      u.ultimoArqNome = null
      const telaRgParcial = telaEnvioDoc(u, enviarOpcoesPadrao)
      await enviarGuiaDocs(from, u, telaRgParcial)
      registrarUltimaPergunta(u, telaRgParcial)
      iniciarTimer(from)
      return null
    }
    if (comandoDoc === "docs_pular_doc") {
      salvarEtapa(u._numero, "documentos")
      setStage(u, STAGES.CLIENTE)
      u._docsClienteGuiado = true
      u.etapa = "documentos"
      const { doc: docPular, folha: folhaPular, fIdx: fIdxPular, folhas: folhasPular } = getDocumentoAtualGuia(u)
      if (docPular) {
        const pulouAntesDeEnviar = fIdxPular <= 0 && !u.ultimoArqId
        marcarStatusDocumento(u, docPular.id, pulouAntesDeEnviar ? "docsPulados" : "docsParciais")
        await hsCriarNota(
          u.contatoId,
          pulouAntesDeEnviar ? "DOCUMENTO PULADO PELO CLIENTE" : "DOCUMENTO AVANCADO SEM TODAS AS PAGINAS",
          `De: ${u.nome || "-"} (${from})\nCaso: ${u.numeroCaso || "-"}\nDocumento: ${docPular.label}\nItem pendente ao avancar: ${folhaPular}\nProgresso: ${fIdxPular} de ${folhasPular.length}`
        )
      }
      u.docAtualIdx = 0
      u.ultimoArqId = null
      u.ultimoArqNome = null
      const telaPular = telaEnvioDoc(u, enviarOpcoesPadrao)
      await enviarGuiaDocs(from, u, telaPular)
      registrarUltimaPergunta(u, telaPular)
      iniciarTimer(from)
      return null
    }
    if (comandoDoc === "docs_proxdoc") {
      salvarEtapa(u._numero, "documentos")
      setStage(u, STAGES.CLIENTE)
      u._docsClienteGuiado = true
      u.etapa = "documentos"
      const pend4 = getDocsPendentes(u)
      const docAtual4 = pend4[0]
      const folhas4 = docAtual4?.folhas || ["Foto"]
      const fIdx4 = u.docAtualIdx || 0
      if (docAtual4?.id === "doc_rg" && u.ultimoArqId) {
        await confirmarDocumentoCanonicoSeguro(u, u.ultimoArqId, { origem: "docs_proxdoc" })
      }
      if (fIdx4 >= folhas4.length) {
        // Todas as folhas do documento atual foram enviadas — avança para o próximo documento
        if (docAtual4?.id && docAtual4.id !== "doc_rg") marcarStatusDocumento(u, docAtual4.id, "docsEntregues")
        u.docAtualIdx = 0
      }
      if (getDocsPendentes(u).length === 0) {
        await consolidarDocumentosDoCasoSeguro({
          u,
          contexto: { origem: "conclusao_fluxo_guiado" }
        })
      }
      // Se ainda há folhas pendentes no documento atual, mantém o documento e avança só o índice da folha
      u.ultimoArqId = null
      const tela4 = telaEnvioDoc(u, enviarOpcoesPadrao)
      await enviarGuiaDocs(from, u, tela4)
      registrarUltimaPergunta(u, tela4)
      iniciarTimer(from)
      return null
    }
    if (comandoDoc === "docs_depois") {
      // Se o documento atual já está completo (todas as folhas enviadas), marca como entregue antes de sair
      const pendentesDepois = getDocsPendentes(u)
      const docAtualDepois = pendentesDepois[0]
      if (docAtualDepois) {
        const folhasDepois = docAtualDepois.folhas || ["Foto"]
        const fIdxDepois = u.docAtualIdx || 0
        const docCompletoDepois = fIdxDepois >= folhasDepois.length
        if (docCompletoDepois) {
          if (docAtualDepois.id === "doc_rg" && u.ultimoArqId) {
            await confirmarDocumentoCanonicoSeguro(u, u.ultimoArqId, { origem: "docs_depois" })
          } else if (docAtualDepois.id !== "doc_rg") {
            marcarStatusDocumento(u, docAtualDepois.id, "docsEntregues")
          }
          u.docAtualIdx = 0
        }
      }
      sairContextoDocumentosCliente(u)
      const primeiroNome = primeiroNomeCliente(u) || "você"
      iniciarTimer(from)
      return responderTelaDocumento(from, u, criarTela({
        id: "documentos_continuar_depois",
        titulo: "Continuar depois",
        texto: `Sem problema, ${primeiroNome}! 😊\n\nQuando tiver os documentos, é só voltar aqui e tocar em *"Enviar documentos"*.\n\n📁 Caso: *${u.numeroCaso}*`,
        textoAudioBase: `Sem problema, ${primeiroNome}. Você pode continuar depois`,
        acoes: enviarOpcoesPadrao(from, "retorno_docs").map(opcao => ({
          id: opcao.id,
          label: opcao.title
        }))
      }))
    }
    if (text === "m_adv") {
      u._docsClienteGuiado = false
      iniciarTimer(from)
      const selecao = await abrirSelecaoCasoParaAcao(from, u, "advogado")
      if (selecao !== false) return selecao
      return await telaAdvogadoClienteComAudio(from, u)
    }
    if (text === "dir_agendar") {
      u._docsClienteGuiado = false
      setStage(u, STAGES.CLIENTE)
      iniciarTimer(from)
      return await telaAdvogadoClienteComAudio(from, u)
    }
    if (text === "adv_ag") {
      u._docsClienteGuiado = false
      setStage(u, STAGES.CLIENTE)
      iniciarTimer(from)
      return await telaAdvogadoClienteComAudio(from, u)
    }
    if (text === "adv_urg") {
      u._docsClienteGuiado = false
      return await iniciarMensagemUrgenteCliente(from, u)
    }
    if (text === "adv_agendar_ligacao") {
      u._docsClienteGuiado = false
      if (u.negocioId) {
        await hsCriarNota(u.contatoId, "AGENDAMENTO SOLICITADO",
          `${u.nome} (${from}) solicitou agendamento.\nCaso: ${u.numeroCaso} | Área: ${u.area}`)
      }
      return await iniciarAgendamento(from, u)
    }
    if (text === "m_novocaso") {
      u._docsClienteGuiado = false
      iniciarTimer(from)
      return await confirmarAberturaNovoCasoCliente(from, u)
    }
    if (text === "novo_caso_confirmar") {
      return await abrirNovoCasoCliente(from, u)
    }
    if (text === "m_encerrar") {
      return await encerrarClienteCadastrado(from, u)
    }
    if (text === "m_inicio") {
      u._docsClienteGuiado = false
      u._menuClienteCasoAtivo = false
      u._mostrarPainelCasosCliente = false
      u._acaoPendente = null
      iniciarTimer(from)
      if (podeMostrarMenuCliente(u)) return await menuClienteComAudio(from, u)
      salvarEtapa(u._numero, STAGES.AUDIO_AGUARDANDO)
      return respostaRecomecoMenuPrincipal(u)
    }
    if (text) {
      if (pareceDuvidaCasoAtualOuNovo(text)) {
        u._audioClientePendenteTexto = normalizarTextoCRM(text)
        u._audioClientePendenteArquivo = null
        const telaCasoAtualOuNovo = telaClienteCasoAtualOuNovo(text, "texto")
        await enviarAudioModoVoz(
          from,
          u,
          `Entendi sua dúvida. Essa situação é sobre o caso atual ou você quer abrir um novo caso? ${textoAudioOpcoes(telaCasoAtualOuNovo.opcoes)}`,
          "dúvida caso atual ou novo"
        )
        return responderComTimer(from, telaCasoAtualOuNovo)
      }
      const intencaoTexto = detectarIntencaoCliente(text)
      if (intencaoTexto === "novo_caso" && pareceNovaSituacaoCliente(text)) {
        u._audioClientePendenteTexto = normalizarTextoCRM(text)
        u._audioClientePendenteArquivo = null
        return await confirmarAberturaNovoCasoCliente(from, u)
      }
      if (!intencaoTexto && pareceNovaSituacaoCliente(text)) {
        u._audioClientePendenteTexto = normalizarTextoCRM(text)
        u._audioClientePendenteArquivo = null
        const telaCasoAtualOuNovo = telaClienteCasoAtualOuNovo(text, "texto")
        await enviarAudioModoVoz(
          from,
          u,
          `Entendi que você contou uma nova situação com detalhes. Essa mensagem é sobre o caso atual ou você quer abrir um novo caso? ${textoAudioOpcoes(telaCasoAtualOuNovo.opcoes)}`,
          "texto cliente caso atual ou novo"
        )
        return responderComTimer(from, telaCasoAtualOuNovo)
      }
      const respostaIntencao = await executarIntencaoDetectadaCliente(from, u, intencaoTexto, text)
      if (respostaIntencao) return respostaIntencao
    }
    if (text && !ehMensagemEntradaGlobal(text) && GROQ_KEY) {
      const resp = await respostaIACliente(u, text)
      if (resp) {
        iniciarTimer(from)
        return {
          texto: resp,
          opcoes: [
      { id: "m_adv",      title: "👨‍⚖️ Falar com advogado" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
          ]
        }
      }
    }

    // Fallback — qualquer mensagem não reconhecida mostra o menu
    iniciarTimer(from)
    return await menuClienteComAudio(from, u)
  }

  // FALLBACK
  salvarEtapa(u._numero, STAGES.AUDIO_AGUARDANDO)
  iniciarTimer(from)
  return await responderTelaComAudio(
    from,
    u,
    respostaRecomecoMenuPrincipal(u),
    "Tudo bem. Vamos recomeçar com calma. Pode me contar sua situação novamente por áudio ou texto. Estou aqui para ajudar você.",
    "fallback recomeco"
  )
}

async function processar(from, nomeWA, text, msgObj) {
  // Fila por usuário: enfileira e processa em série, sem perder mensagens
  // enviadas enquanto o processamento anterior ainda está em curso.
  return new Promise((resolve) => {
    if (!filasMensagens.has(from)) filasMensagens.set(from, [])
    filasMensagens.get(from).push({ nomeWA, text, msgObj, resolve })

    // Só inicia o dreno se não há outro em andamento para este usuário
    if (filasMensagens.get(from).length === 1) {
      drenaFilaUsuario(from)
    }
  })
}

async function drenaFilaUsuario(from) {
  const fila = filasMensagens.get(from)
  while (fila && fila.length > 0) {
    const { nomeWA, text, msgObj, resolve } = fila[0]
    let resultado = null
    try {
      resultado = await executarComLockUsuario(
        from,
        () => ehWhatsAppAdmin(from)
          ? processarAdminWhatsApp(from, text, msgObj)
          : processarComLock(from, nomeWA, text, msgObj)
      )
    } catch (e) {
      logErro("fila_usuario", `Erro ao drenar fila | USER: ${sanitizarTextoEntrada(from) || "-"}`, e)
    }
    resolve(resultado)
    fila.shift()
  }
  filasMensagens.delete(from)
}

async function carregarPendenciasComplementaresPosHumanas({ usuario, cycle, repository }) {
  if (!usuario?.contatoId || !usuario?.negocioId ||
      String(usuario.negocioId) !== String(cycle?.negocioId) ||
      String(usuario.contatoId) !== String(cycle?.contatoId)) {
    return { camposPendentes: [], humanReviewRequired: true, reviewReason: "contexto_contato_negocio_invalido" }
  }
  const contactProperties = [...new Set(Object.values(POST_HUMAN_CONTACT_FIELDS).flat())]
  const dealProperties = [...new Set(Object.values(POST_HUMAN_DEAL_FIELDS).flat())]
  const [contactResponse, dealResponse, associationResponse, persistedCycle] = await Promise.all([
    axios.get(
      `https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(usuario.contatoId)}?properties=${encodeURIComponent(contactProperties.join(","))}`,
      { headers: HS() }
    ),
    axios.get(
      `https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(usuario.negocioId)}?properties=${encodeURIComponent(dealProperties.join(","))}`,
      { headers: HS() }
    ),
    axios.get(
      `https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(usuario.negocioId)}/associations/contacts`,
      { headers: HS() }
    ),
    repository.getCycle(cycle.cycleId)
  ])
  const associatedIds = (associationResponse.data?.results || []).map(item => String(item.id))
  const context = resolveComplementaryContext({
    usuario,
    contact: {
      id: String(contactResponse.data?.id || ""),
      loaded: true,
      dealIds: associatedIds.includes(String(usuario.contatoId)) ? [String(usuario.negocioId)] : [],
      properties: contactResponse.data?.properties || {}
    },
    deal: {
      id: String(dealResponse.data?.id || ""),
      loaded: true,
      properties: dealResponse.data?.properties || {}
    },
    answered: persistedCycle?.payload?.respostas || {},
    previousPending: persistedCycle?.payload?.camposPendentes || [],
    documents: {
      recebidos: usuario.docsEntregues || [],
      ausentes: usuario.docsAusentes || [],
      parciais: usuario.docsParciais || []
    },
    expectedContactId: usuario.contatoId,
    expectedDealId: usuario.negocioId
  })
  return context
}

async function complementoPosHumanoEstaCompleto({ cycle, usuario, repository }) {
  if (!cycle?.cycleId || !usuario?.contatoId || !usuario?.negocioId || !usuario?.numeroCaso || !usuario?.pastaDriveId) return false
  const context = await carregarPendenciasComplementaresPosHumanas({ usuario, cycle, repository })
  return !context.humanReviewRequired && context.camposPendentes.length === 0 &&
    !(usuario.docsAusentes || []).length && !(usuario.docsParciais || []).length && !usuario.revisaoDocumentalNecessaria
}

function criarVerificadorCompletudePosHumana(usuario, repository) {
  return async input => {
    const cycle = input?.cycle || input
    return complementoPosHumanoEstaCompleto({ cycle, usuario: input?.usuario || usuario, repository })
  }
}

function criarDispatcherPosHumano({ from, nomeWA, usuario }) {
  return createPostHumanDispatcher({
    isEnabled: isPostHumanComplementationEnabled,
    repository: postHumanCycleRepository,
    normalizePhone: normalizarNumeroWhatsAppEnvio,
    resolveValidatedContactByPhone: async telefoneNormalizado => {
      const found = await hsBuscarPorPhone(telefoneNormalizado)
      const foundPhone = normalizarNumeroWhatsAppEnvio(found?.properties?.phone || found?.properties?.mobilephone)
      return found?.id && foundPhone === telefoneNormalizado
        ? { validated: true, contatoId: String(found.id), telefoneNormalizado: foundPhone }
        : null
    },
    resolveBusiness: async ({ usuario: current, contexto, numeroCaso }) => {
      const negocioId = contexto?.negocioId || current?.negocioId
      const caso = numeroCaso || contexto?.numeroCaso || current?.numeroCaso
      return negocioId && caso ? { validated: true, negocioId, numeroCaso: caso } : null
    },
    transcribeInformationAudio: async ({ content }) => {
      const mediaId = content?.audio?.id || content?.voice?.id
      if (!mediaId) return null
      const media = await baixarMidia(mediaId)
      if (!media) return null
      const transcription = await transcrever(media.buffer, media.mimeType, { origem: "post_human_legal_answer" })
      return transcription ? normalizarTextoCRM(transcription) : null
    },
    saveInformation: async ({ cycle, content }) => {
      const current = await postHumanCycleRepository.getCycle(cycle.cycleId)
      const field = current?.payload?.campoPendente || current?.campoPendente
      if (!field) return { persisted: true }
      const previousAnswers = current?.payload?.respostas || {}
      const previdenciario = /inss|previd/i.test(String(usuario.area || ""))
      const bpcCase = previdenciario && isBpcCase({ ...usuario, ...previousAnswers })
      const legalBpcField = bpcCase && isBpcLegalField(field)
      const legalInssField = previdenciario && isInssLegalField(field)
      const legalField = legalBpcField || legalInssField
      const addressField = ADDRESS_FIELDS.has(field)
      const legalResult = legalBpcField
        ? buildBpcLegalAnswerResult(field, content, { previousAnswers })
        : legalInssField
          ? buildInssLegalAnswerResult(field, content, { previousAnswers })
        : null
      const addressResult = addressField
        ? await buildAddressAnswerResult(field, content, {
            previousAnswers,
            known: usuario,
            resolveLocation: async entrada => {
              const texto = sanitizarTextoEntrada(entrada)
              const cep = texto.replace(/\D/g, "")
              return cep.length === 8 ? buscarPorCEP(cep) : buscarCidadePorNomeInteligente(texto)
            }
          })
        : null
      const canonicalResult = addressResult || legalResult
      const legalAnswers = canonicalResult?.canonicalAnswers || null
      const nomenclaturaJuridica = legalField && Object.values(legalAnswers || {}).some(item => item?.status === "confirmado")
        ? resolveLegalCaseNomenclature({
            current: usuario.nomenclaturaJuridica,
            narrative: sanitizarTextoEntrada(content?.text || content),
            answered: { ...previousAnswers, ...legalAnswers },
            usuario,
            explicitCorrection: Object.values(legalAnswers || {}).some(item => item?.correcao === true)
          })
        : null
      const withLegalNomenclature = result => {
        if (!nomenclaturaJuridica) return result
        const existingPatch = result?.canonicalPatch || {}
        const existingValues = existingPatch.values && typeof existingPatch.values === "object"
          ? existingPatch.values
          : existingPatch.field ? { [existingPatch.field]: existingPatch.value } : {}
        const correctedFields = Object.entries(legalAnswers || {})
          .filter(([, item]) => item?.correcao === true)
          .map(([field]) => field)
        return {
          ...(result || {}),
          canonicalPatch: {
            values: { ...existingValues, nomenclaturaJuridica },
            corrections: [...new Set([...(existingPatch.corrections || []), ...correctedFields])]
          }
        }
      }
      if (legalField && !Object.keys(legalAnswers).length) return withLegalNomenclature(legalResult)
      if (addressField && !Object.keys(legalAnswers || {}).length) return addressResult
      const contactFields = {
        nomeCompleto: "firstname", cpf: "cpf_do_cliente", dataNascimento: "date_of_birth",
        telefone: "phone", email: "email", cidade: "city", uf: "state",
        endereco: "address", numeroEndereco: "address", complementoEndereco: "address",
        bairro: "address", cep: "zip"
      }
      const dealFields = {
        areaJuridica: "area_juridica", tipoCaso: "tipo_de_caso",
        descricao: "description"
      }
      const caseFactField = !contactFields[field] && !dealFields[field] && Boolean(CAMPOS_ADMIN_ASSISTIDO[field])
      const property = contactFields[field] || dealFields[field] || (caseFactField ? "oraculum_case_facts" : null)
      const objectType = contactFields[field] ? "contact" : (dealFields[field] || caseFactField) ? "deal" : null
      const objectId = objectType === "contact" ? cycle.contatoId : cycle.negocioId
      if (legalField && legalAnswers[field]?.status !== "confirmado") return withLegalNomenclature(legalResult)
      if (legalField && (!property || !objectId)) return withLegalNomenclature(legalResult)
      if (addressField) {
        const confirmedValues = Object.fromEntries(Object.entries(legalAnswers)
          .filter(([, item]) => item?.status === "confirmado")
          .map(([key, item]) => [key, item.valor]))
        const canonicalPatch = {
          values: confirmedValues,
          corrections: Object.keys(confirmedValues).filter(key => legalAnswers[key]?.correcao === true)
        }
        const existingContact = cycle.contatoId ? await hsBuscarPorPhone(from) : null
        const currentProperties = existingContact?.properties || {}
        const projected = montarPropsContatoHubSpot(from, { ...usuario, ...confirmedValues })
        const requestedProperties = new Set([
          ...(confirmedValues.cidade ? ["city"] : []),
          ...(confirmedValues.uf ? ["state"] : []),
          ...(confirmedValues.cep ? ["zip"] : []),
          ...((confirmedValues.endereco || usuario.endereco || usuario.address) &&
            Object.keys(confirmedValues).some(key => ["endereco", "numeroEndereco", "complementoEndereco", "bairro"].includes(key)) ? ["address"] : [])
        ])
        const incoming = Object.fromEntries(Object.entries(projected)
          .filter(([key, value]) => requestedProperties.has(key) && sanitizarTextoEntrada(value)))
        return {
          ...addressResult,
          canonicalPatch,
          ...(cycle.contatoId && cycle.negocioId && Object.keys(incoming).length ? {
            hubspot: {
              objectType: "contact", objectId: cycle.contatoId, contactId: cycle.contatoId,
              expectedDealId: cycle.negocioId, current: currentProperties, incoming
            }
          } : {})
        }
      }
      if (!property || !objectId || !cycle.contatoId || !cycle.negocioId) {
        return withLegalNomenclature({ persisted: true, humanReviewRequired: true, reviewReason: "contact_mapping_unavailable" })
      }
      let currentProperties = {}
      if (objectType === "contact") {
        const existingContact = await hsBuscarPorPhone(from)
        currentProperties = existingContact?.properties || {}
      } else {
        const response = await axios.get(
          `https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(objectId)}?properties=${encodeURIComponent(property)}`,
          { headers: HS() }
        )
        currentProperties = response.data?.properties || {}
      }
      const canonicalValue = legalField ? legalAnswers[field]?.valor : sanitizarTextoEntrada(content)
      const incomingValue = caseFactField
        ? JSON.stringify({ [field]: canonicalValue })
        : canonicalValue
      return withLegalNomenclature({
        ...(legalResult || {}),
        persisted: true,
        canonicalPatch: { field, value: canonicalValue },
        hubspot: {
          objectType, objectId, contactId: cycle.contatoId, expectedDealId: cycle.negocioId,
          current: currentProperties, incoming: { [property]: incomingValue }
        }
      })
    },
    applySafeHubspotUpdates: async ({ cycle, objectType, objectId, contactId, expectedDealId, current, incoming }) =>
      atualizarHubSpotSeguro({
        objectType, objectId, current: current || {}, incoming: incoming || {},
        contactId: contactId || cycle.contatoId,
        expectedDealId: expectedDealId || cycle.negocioId,
        cycleId: cycle.cycleId,
        deps: {
          isAssociated: async (validatedContactId, validatedDealId) => {
            const assoc = await axios.get(
              `https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(validatedDealId)}/associations/contacts`,
              { headers: HS() }
            )
            const ids = (assoc.data?.results || []).map(item => String(item.id))
            return ids.length === 1 && ids[0] === String(validatedContactId)
          },
          update: async (type, id, properties) => type === "contact"
            ? hsAtualizarContato(id, properties) : hsAtualizarNegocio(id, properties),
          createReviewNote: async (_type, _id, note) =>
            hsCriarNotaNegocio(cycle.negocioId, "REVISÃO PÓS-ATENDIMENTO", `Ciclo: ${note.cycleId}\nCampos divergentes: ${note.fields.join(", ")}`)
        }
      }),
    updateCanonicalState: async ({ patch }) => {
      const values = patch?.values && typeof patch.values === "object"
        ? patch.values
        : patch?.field ? { [patch.field]: patch.value } : {}
      const userFields = {
        nomeCompleto: "nome", cpf: "cpf", dataNascimento: "dataNascimento", telefone: "whatsappContato",
        email: "email", cidade: "cidade", uf: "uf", areaJuridica: "area", tipoCaso: "tipoCaso",
        descricao: "descricao", beneficio: "beneficio", motivo: "motivo", situacao: "situacao", nb: "nb",
        endereco: "endereco", numeroEndereco: "numeroEndereco", complementoEndereco: "complementoEndereco",
        bairro: "bairro", cep: "cep", referenciaEndereco: "referenciaEndereco"
      }
      let changed = false
      const corrections = new Set(patch?.corrections || [])
      for (const [field, rawValue] of Object.entries(values)) {
        if (field === "nomenclaturaJuridica" && rawValue && typeof rawValue === "object") {
          changed = applyLegalCaseNomenclatureToUser(usuario, rawValue) || changed
          continue
        }
        const target = userFields[field] || (CAMPOS_ADMIN_ASSISTIDO[field] ? field : null)
        const value = sanitizarTextoEntrada(rawValue)
        if (!target || !value) continue
        if (!sanitizarTextoEntrada(usuario[target]) || corrections.has(field)) {
          usuario[target] = value
          changed = true
        }
      }
      if (!changed) return false
      agendarPersistenciaUsers()
      return true
    },
    isComplete: criarVerificadorCompletudePosHumana(usuario, postHumanCycleRepository),
    continueCycle: async ({ cycle }) => processPostHumanCycle({
      cycle,
      usuario,
      repository: postHumanCycleRepository,
      deps: {
        resolverListaDocumental: () => getDocumentosListaCaso(usuario),
        listarArquivosDrive: async () => usuario.pastaDriveId ? listarArquivosDriveNaPasta(usuario.pastaDriveId) : [],
        requiredSources: usuario.pastaDriveId ? ["drive"] : [],
        camposComplementaresPendentes: () => carregarPendenciasComplementaresPosHumanas({ usuario, cycle, repository: postHumanCycleRepository }),
        getLatestCustomerMessage: () => users[normalizarNumeroWhatsAppEnvio(usuario._numero || usuario.whatsappContato)]?.ultimaMsg ?? usuario.ultimaMsg,
        sendFree: (to, message) => enviar(to, message),
        presentClientMenu: (to) => apresentarMenuClientePosHumano(to, usuario),
        sendTemplate: (to, name, params, language, options) => enviarTemplateWhatsApp(to, name, params, language, options),
        templateConfig: META_TEMPLATES.casoAtualizacao,
        buildTemplateParams: solicitation => [solicitation.texto],
        isComplete: criarVerificadorCompletudePosHumana(usuario, postHumanCycleRepository)
      }
    }),
    legacyDocumentPipeline: createLegacyDocumentPipeline({
      processMedia: ({ context, tipo, ehAudio, ehDoc }) =>
        processarMidia(from, nomeWA, usuario, context.rawMessage, tipo, ehAudio, ehDoc),
      persistDocument: ({ handoff }) => Boolean(handoff.persisted)
    }),
    safeLogger: (event, error) => logErro("post_human", `${event}: ${error}`)
  })
}

async function processarComLock(from, nomeWA, text, msgObj) {
  const textoSanitizado = sanitizarTextoEntrada(text)
  const tipoEntrada = String(msgObj?.type || "").toLowerCase()
  const ehCallbackCliente = ["interactive", "button"].includes(tipoEntrada) &&
    /^(?:m_|docs_|doc_|cliente_|adv_|dir_|novo_caso_|nc_)/.test(textoSanitizado)
  let u = users[from] || null

  try {
    const resolvido = await resolverUsuarioPorHubSpot(from, nomeWA)
    const contato = resolvido.contato
    u = resolvido.u
    const { nome: nomeExibicao } = resolverNomeUnificado({ contato, u })
    const nomeWAEfetivo = nomeExibicao
    if (u.negocioId) {
      await atualizarEstadoConsultaUsuario(u).catch(e =>
        logErro("calendar", "Falha ao atualizar estado da consulta na entrada: " + e.message)
      )
    }
    const estadoHubSpotAntes = serializarEstado(u)

    if (postHumanCycleRepository && !ehCallbackCliente) {
      const postHumanDispatch = await criarDispatcherPosHumano({ from, nomeWA: nomeWAEfetivo, usuario: u })({
        from,
        msgType: msgObj?.type,
        content: ["image", "document", "pdf", "audio"].includes(String(msgObj?.type || "").toLowerCase()) ? msgObj : (msgObj?.text?.body || text),
        rawMessage: msgObj,
        usuario: u,
        contexto: u.contextoConversa
      })
      if (postHumanDispatch.handled) {
        const postHumanResponse = postHumanDispatch.response
        if (postHumanDispatch.requiresCaseSelection) {
          return { texto: "Há mais de um caso aguardando complemento. Selecione o caso no Menu do Cliente para continuar.", opcoes: [{ id: "m_inicio", title: "Menu cliente" }] }
        }
        if (postHumanResponse.deferred) return { texto: "Tudo bem. Seu progresso foi salvo e você pode responder depois.", opcoes: [{ id: "m_inicio", title: "Menu cliente" }] }
        if (postHumanResponse.transcriptionFailed) return { texto: "Não consegui ouvir esse áudio com clareza. Pode enviar outro áudio ou responder por texto?", opcoes: [{ id: "m_inicio", title: "Menu cliente" }] }
        if (postHumanResponse.pipelineResponse) return postHumanResponse.pipelineResponse
        if (postHumanDispatch.humanReviewRequired) return { texto: "Recebi sua informação. Ela seguirá para revisão segura antes de qualquer atualização.", opcoes: [{ id: "m_inicio", title: "Menu cliente" }] }
        if (postHumanResponse.partial) return { texto: "Informação recebida e vinculada ao seu caso. Você pode continuar enviando os itens pendentes.", opcoes: [{ id: "m_inicio", title: "Menu cliente" }] }
        if (!postHumanResponse.partial) return { texto: "Informação recebida e vinculada ao seu caso.", opcoes: [{ id: "m_inicio", title: "Menu cliente" }] }
      }
    }

        cancelarReengajamentosPendentes({
      phone: normalizarNumeroWhatsAppEnvio(from),
      dealId: u.negocioId,
      contactId: u.contatoId,
      numeroCaso: u.numeroCaso,
      reason: "user_replied",
      receivedAt: new Date().toISOString()
    })

    const contextoResultado = await dispatchConversationContext({
      from,
      nomeWA: nomeWAEfetivo,
      text: textoSanitizado,
      msgObj,
      usuario: u
    })
    if (contextoResultado?.consumiu && !contextoResultado.seguirFluxoNormal) {
      return contextoResultado.resposta
    }

    const resposta = await processarInterno(from, nomeWAEfetivo, textoSanitizado, msgObj, u)
    if (deveSincronizarEstadoHubSpot(estadoHubSpotAntes, u)) {
      await sincronizarNegocio(u)
    }
    return resposta
  } catch (err) {
    logContextoExecucao({ from, stage: u?.stage, flow: "processar", msg: textoSanitizado })
    logErro("processar", "Falha ao processar solicitacao", err)
    if (u) iniciarTimer(from)
    return criarRespostaFallbackProcessamento()
  } finally {
    agendarPersistenciaUsers()
  }
}

// ================================================================
//  WEBHOOK
// ================================================================

function arquivoExiste(caminho) {
  try { return Boolean(caminho && fs.existsSync(caminho)) }
  catch { return false }
}

function dataModificacaoArquivo(caminho) {
  try {
    if (!caminho || !fs.existsSync(caminho)) return null
    return fs.statSync(caminho).mtime.toISOString()
  } catch {
    return null
  }
}

function resumirCallbackIdempotency() {
  const resumo = {
    totalRecords: 0,
    processing: 0,
    completed: 0,
    expired: 0
  }
  try {
    if (!fs.existsSync(CALLBACK_IDEMPOTENCY_FILE)) return resumo
    const parsed = JSON.parse(fs.readFileSync(CALLBACK_IDEMPOTENCY_FILE, "utf8"))
    const records = parsed?.records && typeof parsed.records === "object" ? parsed.records : {}
    const agora = Date.now()
    for (const record of Object.values(records)) {
      resumo.totalRecords += 1
      if (record?.status === "processing") resumo.processing += 1
      if (record?.status === "completed") resumo.completed += 1
      if (Date.parse(record?.expiresAt || "") <= agora) resumo.expired += 1
    }
  } catch {
    return resumo
  }
  return resumo
}

function resumirWebhookInbox() {
  const resumo = {
    pending: 0,
    processing: 0,
    completed: 0,
    error: 0
  }
  try {
    const inbox = obterEstadoWebhookInbox()
    for (const record of Object.values(inbox.records || {})) {
      if (record?.status === "pending") resumo.pending += 1
      else if (record?.status === "processing") resumo.processing += 1
      else if (record?.status === "error") resumo.error += 1
    }
    resumo.completed = Object.keys(inbox.receipts || {}).length
  } catch {
    return resumo
  }
  return resumo
}

function agruparUltimosErrosPorCategoria() {
  return (monitor.erros || []).reduce((acc, erro) => {
    const tipo = sanitizarTextoEntrada(erro?.tipo).toLowerCase() || "sem_categoria"
    acc[tipo] = (acc[tipo] || 0) + 1
    return acc
  }, {})
}

function montarHealthInternoOperacional() {
  const webhookInboxFile = path.join(DATA_DIR, "webhook-inbox.json")
  return {
    callbackIdempotency: resumirCallbackIdempotency(),
    webhookInbox: resumirWebhookInbox(),
    persistencia: {
      dataDirConfigured: Boolean(sanitizarTextoEntrada(process.env.ORACULUM_DATA_DIR)),
      dataDirWritable: (() => {
        try { fs.accessSync(DATA_DIR, fs.constants.W_OK); return true } catch { return false }
      })(),
      usersStateExists: arquivoExiste(USERS_STATE_FILE),
      usersStateLastModified: dataModificacaoArquivo(USERS_STATE_FILE),
      webhookInboxExists: arquivoExiste(webhookInboxFile),
      callbackStoreExists: arquivoExiste(CALLBACK_IDEMPOTENCY_FILE)
    },
    ultimosErrosPorCategoria: agruparUltimosErrosPorCategoria(),
    reengajamento: {
      AUTO_REENGAJAMENTO,
      REENGAGEMENT_CANCEL_WEBHOOK_URL_configurado: Boolean(sanitizarTextoEntrada(process.env.REENGAGEMENT_CANCEL_WEBHOOK_URL))
    }
  }
}

app.get("/", (_, res) => res.send("Oraculum v6.4"))
app.get("/politica-de-privacidade", (_, res) => res.status(200).type("html").send(privacyPolicyPage()))
app.get("/exclusao-de-dados", (_, res) => res.status(200).type("html").send(dataDeletionPage()))
app.get("/health", async (_, res) => {
  const persistence = await externalStateHealth({ probe: true })
  const healthy = !persistence.required || persistence.database === "ok"
  return res.status(healthy ? 200 : 503).json({ status: healthy ? "ok" : "degraded", version: "Oraculum v6.4" })
})
app.get("/health-interno", validarWebhookInterno, async (_, res) => res.json({
  status: "ok",
  version: "Oraculum v6.4",
  uptime: Math.floor((Date.now() - monitor.inicio) / 1000),
  conversas: monitor.conversas,
  cadastros: monitor.cadastros,
  ativos: Object.keys(users).length,
  erros_count: monitor.erros.length,
  ram_mb: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1),
  persistenciaExterna: await externalStateHealth({ probe: true }),
  ...montarHealthInternoOperacional()
}))
app.get("/resumo-diario", validarWebhookInterno, async (req, res) => {
  try {
    const limite = Math.max(1, Math.min(30, Number(req.query?.limit || req.query?.limite || 10) || 10))
    const resumo = await gerarResumoDiarioOperacional({ limite })
    if (!resumo.ok) return res.status(502).json({ ok: false, errorCode: resumo.errorCode || "HUBSPOT_QUERY_FAILED" })
    if (sanitizarTextoEntrada(req.query?.format).toLowerCase() === "text") {
      return res.type("text/plain").send(textoResumoDiarioOperacional(resumo))
    }
    return res.json(resumo)
  } catch (e) {
    logErro("resumo-diario", e.message, e)
    return res.sendStatus(500)
  }
})
app.get("/webhook", (req, res) => {
  if (req.query["hub.mode"] && req.query["hub.verify_token"] === VERIFY_TOKEN) return res.status(200).send(req.query["hub.challenge"])
  return res.sendStatus(403)
})
async function processarMensagemWebhook(value, message) {
  const incomingMessageId = message.id || null
  const fromRaw   = message.from
  const from      = telefoneCanonico(fromRaw) || fromRaw
  if (users[from] && incomingMessageId) {
    digitando(from, incomingMessageId, "").catch(() => {})
  }
  const contato = (value?.contacts || []).find(item => item?.wa_id === from) || value?.contacts?.[0]
  const nomeWA = contato?.profile?.name || "Cliente"
  const text   = sanitizarTextoEntrada(message.text?.body || message.interactive?.button_reply?.id || message.interactive?.list_reply?.id || "")
  const resposta = await processar(from, nomeWA, text, message)
  // A inbox durável já aceitou e reservou este inbound; a janela foi reaberta
  // por processar(). Consuma antes do áudio automático da resposta para evitar
  // dois áudios consecutivos para a mesma interação.
  await consumirPendenciaAudioPedidoDocumentos(from)
  if (!resposta) return
  if (deveAtivarModoDigitando(resposta) && users[from]) {
    users[from].modoDigitando = true
    iniciarTimer(from)
  }
  const respostaVisual = aplicarEmojiTelaCliente(from, resposta)
  registrarUltimaPergunta(users[from], respostaVisual)
  agendarPersistenciaUsers()
  if (respostaVisual.texto || (Array.isArray(respostaVisual.opcoes) && respostaVisual.opcoes.length > 0)) {
    let envioOk = false
    if (ehWhatsAppAdmin(from)) {
      envioOk = await enviarRespostaAdmin(from, respostaVisual, incomingMessageId)
    } else {
      await enviarAudioAutomaticoTela(from, users[from], respostaVisual, "webhook")
      envioOk = await enviar(from, respostaVisual.texto, respostaVisual.opcoes, true, incomingMessageId)
    }
    if (!envioOk) {
      await enviar(from, "Tive uma dificuldade para responder agora. Pode enviar a mensagem novamente ou tocar em Menu para continuar.", null, false, incomingMessageId)
    }
  }
}

let webhookInboxDraining = false

async function drenarWebhookInbox() {
  if (webhookInboxDraining) return
  webhookInboxDraining = true
  try {
    while (true) {
      const record = listarWebhookPendentes()[0]
      if (!record) break
      if (!marcarWebhookProcessing(record.key)) continue
      try {
        await processarMensagemWebhook(record.payload?.value || {}, record.payload?.message || {})
        persistirUsersAgora({ propagarErro: true })
        marcarWebhookCompleted(record.key)
        await flushExternalState()
      } catch (err) {
        try {
          marcarWebhookError(record.key, err)
          await flushExternalState({ throwOnError: false })
        } catch (persistError) {
          logErro("webhook_inbox", `Falha ao persistir erro da mensagem ${record.messageId || record.key}: ${persistError.message}`, persistError)
        }
        logErro("webhook_async", `Falha ao processar mensagem ${record.messageId || "-"}: ${err.message}`, err)
      }
    }
  } finally {
    webhookInboxDraining = false
  }
}

app.post("/webhook", validarAssinaturaMeta, async (req, res) => {
  try {
    const mensagens = []
    for (const entry of req.body?.entry || []) {
      for (const change of entry?.changes || []) {
        const value = change?.value
        for (const status of value?.statuses || []) {
          const providerMessageId = sanitizarTextoEntrada(status?.id)
          const normalizedStatus = sanitizarTextoEntrada(status?.status).toLowerCase()
          if (!["sent", "delivered", "read", "failed"].includes(normalizedStatus)) {
            logInfo({ event: "outbound.status_ignored", status: normalizedStatus || "unknown", providerMessageId })
            continue
          }
          const error = Array.isArray(status?.errors) ? status.errors[0] : null
          const timestampMs = Number(status?.timestamp) * 1000
          const outbound = atualizarStatusMensagemOutbound(providerMessageId, normalizedStatus, {
            timestamp: Number.isFinite(timestampMs) && timestampMs > 0 ? new Date(timestampMs).toISOString() : null,
            failureCode: error?.code,
            failureDescription: error?.title || error?.message
          })
          logInfo({ event: "outbound.status", status: outbound?.status || normalizedStatus || "unknown",
            providerMessageId, numeroCaso: outbound?.numeroCaso, contactId: outbound?.contactId,
            dealId: outbound?.dealId, action: outbound?.action, channel: outbound?.channel,
            phoneMasked: outbound?.destinationMasked, failureCode: outbound?.failureCode,
            failureDescription: outbound?.failureDescription })
        }
        for (const message of value?.messages || []) {
          const from = message.from
          const text = sanitizarTextoEntrada(message.text?.body || message.interactive?.button_reply?.id || message.interactive?.list_reply?.id || "")
          const dedupeKey = criarChaveMensagemDuplicada(from, text, message)
          mensagens.push({
            key: criarChaveWebhookDuravel(message, dedupeKey),
            messageId: message.id || null,
            from,
            receivedAt: new Date().toISOString(),
            payload: { value, message }
          })
        }
      }
    }

    registrarMensagensWebhook(mensagens)
    await flushExternalState()
    res.sendStatus(200)
    if (!mensagens.length) return

    setImmediate(() => {
      drenarWebhookInbox().catch(err =>
        logErro("webhook_inbox", "Falha ao drenar inbox: " + err.message, err)
      )
    })
  } catch (err) { logErro("webhook", err.message, err); return res.sendStatus(500) }
})

const PORT = process.env.PORT || 10000
// ------------------------------------------------------------------
// ROTA /agendamento — confirmação de ligação agendada
// Rota de compatibilidade para confirmação externa de uma consulta.
// O planejamento e os disparos recorrentes pertencem ao agendador interno.
// ------------------------------------------------------------------
app.post("/agendamento", validarWebhookInterno, async (req, res) => {
  try {
    const { phone, name, datetime, caseid, eventId } = req.body
    if (!phone) return res.sendStatus(400)
    const numero = normalizarNumeroWhatsAppEnvio(phone)
    if (!numero) return res.sendStatus(400)
    const nomeCliente = name || "cliente"
    let dataHora = datetime || "em breve"
    if (eventId) {
      const evento = await getConsultaCalendarEventState(eventId)
      if (!evento?.encontrado) return res.status(404).json({ erro: "evento nao encontrado" })
      dataHora = evento.inicio || dataHora
    }

    // Formatar data se vier em ISO
    let dataFormatada = dataHora
    try {
      if (dataHora.includes("T")) {
        const d = new Date(dataHora)
        dataFormatada = d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })
      }
    } catch {}

    const callbackKey = createCallbackKey("agendamento", {
      phone: numero,
      datetime: datetime || "",
      caseid: caseid || "",
      eventId: eventId || ""
    })
    const callbackExecution = beginCallbackExecution(callbackKey, { route: "/agendamento" })
    if (!callbackExecution.started) return res.sendStatus(200)

    const msg = [
      "📅 *Consulta confirmada!*",
      "",
      `✅ Olá, *${nomeCliente}*! Sua consulta com um advogado da Oráculum está confirmada.`,
      "",
      `🗓️ *Data e horário:* ${dataFormatada}`,
      "",
      "📞 Nosso advogado vai te ligar no número cadastrado. Deixe o celular por perto!",
      "",
      "Precisa reagendar? É só nos chamar aqui no WhatsApp.",
      "",
      "Estamos à disposição! ⚖️"
    ].join("\n")

    await enviar(numero, msg, null, false)
    completeCallbackExecution(callbackKey)
    await flushExternalState()

    // Compatibilidade: esta rota apenas notifica. O estado da agenda vem do Calendar.
    if (caseid) {
      for (const [from, u] of Object.entries(users)) {
        if (u.numeroCaso === caseid && u.negocioId) {
          await executarComLockUsuario(from, async () => {
            const atual = users[from]
            if (!atual || atual.numeroCaso !== caseid || !atual.negocioId) return
            agendarPersistenciaUsers()
          })
          break
        }
      }
    }

    return res.sendStatus(200)
  } catch (e) { logErro("agendamento", e.message); return res.sendStatus(500) }
})

process.on("beforeExit", () => {
  if (internalSchedulerTimer) clearInterval(internalSchedulerTimer)
  persistirUsersAgora()
  persistirSessoesAdminAssistidasAgora(sessoesAdminWhatsApp)
})

// ------------------------------------------------------------------
// ROTA /buscar-contato-reuniao — recebe horário do evento do Calendar e retorna phone + name + tipo
// Compatibilidade para integrações que detectem evento novo no Google Calendar.
// Body preferencial: { eventId: "google-calendar-event-id" }
// Compatibilidade legada: { datetime: "2026-05-29T19:00:00" }
// ------------------------------------------------------------------
app.post("/buscar-contato-reuniao", validarWebhookInterno, async (req, res) => {
  try {
    const { eventId, datetime } = req.body
    if (!eventId && !datetime) return res.status(400).json({ erro: "eventId ou datetime obrigatório" })

    let eventoCalendar = null
    let eventoCalendarId = null
    if (eventId) {
      eventoCalendar = await getConsultaCalendarEventState(eventId)
      if (!eventoCalendar?.encontrado) {
        return res.status(404).json({ erro: "evento não encontrado no Google Calendar" })
      }
      eventoCalendarId = eventoCalendar.eventId
    }

    const dt = new Date(eventoCalendar?.inicio || datetime)
    if (isNaN(dt.getTime())) return res.status(400).json({ erro: "datetime inválido" })
    const inicio = dt.getTime() - 5 * 60 * 1000
    const fim    = dt.getTime() + 5 * 60 * 1000

    const metadataEvento = eventoCalendar?.metadata || eventoCalendar?.extendedProperties?.private || {}
    let reuniao = null
    let dealId = sanitizarTextoEntrada(metadataEvento.dealId)
    let contactId = sanitizarTextoEntrada(metadataEvento.contactId || metadataEvento.personId)

    // Compatibilidade legada: eventos sem dealId ainda dependem da reunião por horário.
    if (!dealId) {
      const buscaReuniao = await axios.post(
        "https://api.hubapi.com/crm/v3/objects/meetings/search",
        {
          filterGroups: [{ filters: [{ propertyName: "hs_meeting_start_time", operator: "BETWEEN", value: String(inicio), highValue: String(fim) }] }],
          sorts: [{ propertyName: "hs_meeting_start_time", direction: "DESCENDING" }],
          properties: ["hs_meeting_title", "hs_meeting_body", "hs_meeting_start_time"],
          limit: 1
        },
        { headers: HS() }
      )
      reuniao = buscaReuniao.data?.results?.[0]
      if (!reuniao) return res.status(404).json({ erro: "reunião não encontrada no HubSpot" })
      const assocDeal = await axios.get(
        `https://api.hubapi.com/crm/v3/objects/meetings/${reuniao.id}/associations/deals`,
        { headers: HS() }
      )
      dealId = assocDeal.data?.results?.[0]?.id
    }
    if (!dealId) return res.status(404).json({ erro: "deal não encontrado para a reunião" })

    // Eventos novos carregam contactId; os antigos usam a associação do negócio.
    if (!contactId) {
      const assocContato = await axios.get(
        `https://api.hubapi.com/crm/v3/objects/deals/${dealId}/associations/contacts`,
        { headers: HS() }
      )
      contactId = assocContato.data?.results?.[0]?.id
    }
    if (!contactId) return res.status(404).json({ erro: "contato não encontrado para o deal" })

    // 4. Buscar nome e telefone do contato
    const contato = await axios.get(
        `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}?properties=firstname,lastname,phone`,
      { headers: HS() }
    )
    const props = contato.data?.properties || {}
    const phone = props.phone || null
    const name  = (props.firstname || "cliente").trim()
    if (!phone) return res.status(404).json({ erro: "telefone não encontrado para o contato" })

    // 5. Compatibilidade: eventos antigos podem chegar sem eventId.
    if (!eventoCalendarId) {
      try {
        eventoCalendar = await findConsultaCalendarEventInRange(inicio, fim)
        eventoCalendarId = eventoCalendar?.status === "cancelled" ? null : (eventoCalendar?.id || null)
      } catch (e) {
        logErro("buscar-contato-reuniao", "Erro ao buscar evento no Calendar: " + e.message)
      }
    }

    const tipoReuniao = classificarReuniaoCliente({
      summary: eventoCalendar?.summary,
      description: eventoCalendar?.description,
      tituloHubSpot: reuniao?.properties?.hs_meeting_title,
      corpoHubSpot: reuniao?.properties?.hs_meeting_body
    })
    const ehConsultaCaso = tipoReuniao === "consulta_caso"

    if (ehConsultaCaso && eventoCalendarId) {
      try {
        const estadoAnteriorConsulta = await getConsultaView(dealId)
        const cal = getCalendar()
        await cal.events.patch({
          calendarId: CALENDAR_ID,
          eventId: eventoCalendarId,
          requestBody: {
            extendedProperties: {
              private: {
                ...(eventoCalendar?.metadata || eventoCalendar?.extendedProperties?.private || {}),
                dealId: String(dealId),
                personId: String(contactId),
                contactId: String(contactId),
                tipoConsulta: "inicial",
                versaoIntegracao: "2"
              }
            }
          }
        })
        const inicioEvento = eventoCalendar?.start?.dateTime || eventoCalendar?.start?.date || null
        const fimEvento = eventoCalendar?.end?.dateTime || eventoCalendar?.end?.date || inicioEvento
        await appendConsultaEvent({
          tipo: estadoAnteriorConsulta.status === "agendada" && estadoAnteriorConsulta.eventId !== eventoCalendarId
            ? "consulta.rescheduled"
            : "consulta.scheduled",
          dealId,
          consultaStatus: "agendada",
          metadata: {
            calendarEventId: eventoCalendarId,
            inicio: inicioEvento,
            fim: fimEvento,
            tipoConsulta: "inicial",
            versaoIntegracao: "3"
          },
          origem: "admin",
          chaveIdempotencia: `calendar:${eventoCalendarId}:agendada`
        })
      } catch (e) {
        logErro("buscar-contato-reuniao", "Erro ao vincular metadata do Calendar: " + e.message)
      }
    }

    // 6. Atualizar memória do bot — encontrar usuário pelo número normalizado
    const phoneNorm = normalizarNumeroWhatsAppEnvio(phone)
    for (const [from, u] of Object.entries(users)) {
      if (normalizarNumeroWhatsAppEnvio(from) === phoneNorm) {
        await executarComLockUsuario(from, async () => {
          const atual = users[from]
          if (!atual) return
          if (ehConsultaCaso && eventoCalendarId) {
            await cancelarEventosAtivosDoDeal(atual.negocioId, { excetoEventId: eventoCalendarId })
          }
          if (ehConsultaCaso && atual.negocioId) {
            await atualizarEstadoConsultaUsuario(atual)
          }
          agendarPersistenciaUsers()
        })
        break
      }
    }

    const agora = Date.now()
    const msAteConsulta = dt.getTime() - agora
    const hojeStr = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
    const consultaStr = dt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
    let tipoLembrete = "24h"
    if (msAteConsulta > 0 && msAteConsulta < 60 * 60 * 1000) tipoLembrete = "1h"
    else if (msAteConsulta > 0 && consultaStr === hojeStr) tipoLembrete = "hoje"

    return res.json({ phone, name, eventId: eventoCalendarId, tipo: tipoLembrete, tipoReuniao })
  } catch (e) {
    logErro("buscar-contato-reuniao", e.message)
    return res.sendStatus(500)
  }
})

// ------------------------------------------------------------------
// ROTA /consulta-lembrete-dados - dados estáveis para o agendador interno
// Body: { eventId }
// O envio continua exclusivo da rota /lembrete, chamada apenas no horario agendado.
// ------------------------------------------------------------------
app.post("/consulta-lembrete-dados", validarWebhookInterno, async (req, res) => {
  try {
    const { eventId } = req.body || {}
    if (!eventId) return res.status(400).json({ erro: "eventId obrigatorio" })

    const evento = await getConsultaCalendarEventState(eventId)
    if (!evento?.encontrado) return res.status(404).json({ erro: "evento nao encontrado no Google Calendar" })
    if (evento.cancelado || evento.status === "cancelled") return res.status(409).json({ erro: "evento cancelado" })

    const metadataEvento = evento.metadata || evento.extendedProperties?.private || {}
    const dealId = sanitizarTextoEntrada(metadataEvento.dealId)
    const contactId = sanitizarTextoEntrada(metadataEvento.contactId || metadataEvento.personId)
    const inicioConsulta = evento.inicio || evento.start?.dateTime || evento.start?.date || null
    if (!inicioConsulta) return res.status(400).json({ erro: "inicio da consulta ausente" })

    let phone = null
    let name = "cliente"
    if (contactId) {
      const contato = await axios.get(
      `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}?properties=firstname,lastname,phone`,
        { headers: HS() }
      )
      const props = contato.data?.properties || {}
      phone = props.phone || null
      name = (props.firstname || "cliente").trim()
    }

    if (!phone && dealId) {
      const localizado = await localizarUsuarioAgendamento({ eventId, dealId })
      phone = localizado.from || localizado.u?.whatsappContato || null
      name = localizado.u?.nome || localizado.u?.nomeCliente || name
    }

    const numero = normalizarNumeroWhatsAppEnvio(phone)
    if (!numero) return res.status(404).json({ erro: "telefone nao encontrado para a consulta" })

    return res.json({
      phone: numero,
      name,
      eventId: evento.eventId || eventId,
      dealId: dealId || null,
      casoId: dealId || null,
      datetime: inicioConsulta,
      reminders: {
        "24h": new Date(new Date(inicioConsulta).getTime() - 24 * 60 * 60 * 1000).toISOString(),
        "1h": new Date(new Date(inicioConsulta).getTime() - 60 * 60 * 1000).toISOString()
      }
    })
  } catch (e) {
    logErro("consulta-lembrete-dados", e.message, e)
    return res.sendStatus(500)
  }
})

// ------------------------------------------------------------------
// ROTA /reengagement-candidates - descoberta interna de candidatos potenciais
// Nao decide elegibilidade, nao planeja jobs e nao aciona integracoes externas.
// ------------------------------------------------------------------
app.post("/reengagement-candidates", validarWebhookInterno, async (_req, res) => {
  try {
    if (!AUTO_REENGAJAMENTO) return res.json({ status: "disabled", candidates: [] })
    return res.json({ candidates: descobrirCandidatosReengajamento() })
  } catch (e) {
    logErro("reengagement-candidates", e.message, e)
    return res.sendStatus(500)
  }
})

// ------------------------------------------------------------------
// ROTA /reengajamento-dados - dados estáveis para planejar reengajamentos
// Body aceito: { phone } ou { dealId }
// Nao envia mensagens, nao chama templates e nao cria agendamentos.
// ------------------------------------------------------------------
app.post("/reengajamento-dados", validarWebhookInterno, async (req, res) => {
  try {
    if (!AUTO_REENGAJAMENTO) return res.json({ status: "disabled", jobs: [] })
    const { phone, dealId } = req.body || {}
    if (!phone && !dealId) return res.status(400).json({ erro: "phone ou dealId obrigatorio" })

    const localizado = localizarUsuarioReengajamento({ phone, dealId })
    if (!localizado.u) return res.status(404).json({ erro: "usuario nao encontrado" })

    const numero = normalizarNumeroWhatsAppEnvio(
      localizado.from ||
      localizado.u?._numero ||
      localizado.u?.phone ||
      localizado.u?.telefone ||
      localizado.u?.whatsappContato ||
      phone
    )
    if (!numero) return res.status(404).json({ erro: "telefone nao encontrado para o usuario" })

    const usuario = {
      ...localizado.u,
      phone: numero,
      _numero: numero
    }
    const avaliacao = avaliarElegibilidadeReengajamento(usuario)
    const planejamento = avaliacao.elegivel
      ? planejarReengajamentos(usuario, { agora: Date.now() })
      : { jobs: [], avisos: avaliacao.avisos || [], erros: avaliacao.erros || [] }

    return res.json({
      phone: numero,
      dealId: usuario.negocioId || null,
      contactId: usuario.contatoId || null,
      numeroCaso: usuario.numeroCaso || null,
      jobs: (planejamento.jobs || []).map(job => ({
        id: job.id,
        tipoEvento: job.tipoEvento,
        template: job.template,
        scheduledFor: job.scheduledFor,
        prioridade: job.prioridade
      }))
    })
  } catch (e) {
    logErro("reengajamento-dados", e.message, e)
    return res.sendStatus(500)
  }
})

// ------------------------------------------------------------------
// ROTA /reengajamento - disparo revalidado pelo agendador
// Body: { phone, tipoEvento, jobId, dealId, scheduledFor }
// Revalida elegibilidade e envia somente o template planejado.
// ------------------------------------------------------------------
app.post("/reengajamento", validarWebhookInterno, async (req, res) => {
  try {
    if (!AUTO_REENGAJAMENTO) return res.json({ status: "skipped", reason: "feature_disabled" })
    const { phone, tipoEvento, jobId, dealId, scheduledFor } = req.body || {}
    if (!phone || !tipoEvento || !jobId || !scheduledFor) {
      return res.status(400).json({ status: "skipped", reason: "payload_invalido" })
    }

    const numero = normalizarNumeroWhatsAppEnvio(phone)
    if (!numero) return res.status(400).json({ status: "skipped", reason: "phone_invalido" })

    const validacaoJanela = validarJanelaEnvioReengajamento(scheduledFor)
    if (!validacaoJanela.ok) {
      return res.status(409).json({
        status: "skipped",
        reason: validacaoJanela.motivo,
        scheduledFor: validacaoJanela.scheduledFor
      })
    }

    const localizado = localizarUsuarioReengajamento({ phone: numero, dealId })
    if (!localizado.u || !localizado.from) {
      return res.status(404).json({ status: "skipped", reason: "usuario_nao_encontrado" })
    }

    if (dealId && String(localizado.u.negocioId || "") !== String(dealId)) {
      logSkipOperacional(req, "dealId_divergente", { phone: numero, dealId })
      return res.status(409).json({ status: "skipped", reason: "dealId_divergente" })
    }

    const usuario = {
      ...localizado.u,
      phone: numero,
      _numero: numero
    }
    const avaliacao = avaliarElegibilidadeReengajamento(usuario)
    if (!avaliacao.elegivel) {
      logSkipOperacional(req, "usuario_nao_elegivel", {
        phone: numero,
        dealId: usuario.negocioId || dealId,
        contactId: usuario.contatoId,
        numeroCaso: usuario.numeroCaso
      })
      return res.json({ status: "skipped", reason: "usuario_nao_elegivel" })
    }

    const planejamento = planejarReengajamentos(usuario, { agora: Date.now() })
    const job = (planejamento.jobs || []).find(item =>
      item.id === jobId &&
      item.tipoEvento === tipoEvento
    )
    if (!job) {
      logSkipOperacional(req, "job_nao_planejado", {
        phone: numero,
        dealId: usuario.negocioId || dealId,
        contactId: usuario.contatoId,
        numeroCaso: usuario.numeroCaso
      })
      return res.json({ status: "skipped", reason: "job_nao_planejado" })
    }

    const validacaoScheduledFor = validarScheduledForReengajamento(scheduledFor, job.scheduledFor)
    if (!validacaoScheduledFor.ok) {
      logSkipOperacional(req, "scheduledFor_divergente", {
        phone: numero,
        dealId: usuario.negocioId || dealId,
        contactId: usuario.contatoId,
        numeroCaso: usuario.numeroCaso
      })
      return res.json({
        status: "skipped",
        reason: validacaoScheduledFor.motivo
      })
    }

    const validacaoExpiracao = validarExpiracaoReengajamento(scheduledFor)
    if (!validacaoExpiracao.ok) {
      logSkipOperacional(req, "job_expirado", {
        phone: numero,
        dealId: usuario.negocioId || dealId,
        contactId: usuario.contatoId,
        numeroCaso: usuario.numeroCaso
      })
      return res.json({
        status: "skipped",
        reason: validacaoExpiracao.motivo
      })
    }

    const callbackKey = createCallbackKey("reengajamento", {
      phone: numero,
      tipoEvento,
      jobId,
      dealId: dealId || "",
      scheduledFor
    })
    const callbackExecution = beginCallbackExecution(callbackKey, { route: "/reengajamento" })
    if (!callbackExecution.started) {
      return res.json({ status: "skipped", reason: "duplicado" })
    }

    const cadencia = validarCadenciaReengajamento(localizado.u, job)
    if (!cadencia.ok) {
      abandonCallbackExecution(callbackKey)
      return res.json({ status: "skipped", reason: cadencia.motivo })
    }

    const contextoConversa = criarContextoReengajamentoTemplate({
      tipoEvento,
      jobId,
      dealId: usuario.negocioId || dealId || null,
      numeroCaso: usuario.numeroCaso || null,
      scheduledFor
    })
    const enviado = await enviarJobReengajamento(numero, localizado.u, job, contextoConversa)
    if (!enviado) {
      abandonCallbackExecution(callbackKey)
      await flushExternalState()
      return res.status(502).json({ status: "skipped", reason: "falha_envio_template" })
    }

    registrarEnvioReengajamento(localizado.u, job)
    agendarPersistenciaUsers()
    completeCallbackExecution(callbackKey)
    await flushExternalState()
    return res.json({
      status: "sent",
      jobId: job.id,
      tipoEvento: job.tipoEvento,
      template: job.template
    })
  } catch (e) {
    logErro("reengajamento", e.message, e)
    return res.sendStatus(500)
  }
})

// ------------------------------------------------------------------
// ROTA /evento-cancelado - encerra o vínculo ativo quando o Calendar avisa cancelamento
// Body aceito: { eventId } ou { dealId } ou { phone }
// ------------------------------------------------------------------
app.post("/evento-cancelado", validarWebhookInterno, async (req, res) => {
  try {
    const { eventId, dealId, phone } = req.body || {}
    if (!eventId && !dealId && !phone) {
      return res.status(400).json({ erro: "eventId, dealId ou phone obrigatorio" })
    }

    const localizado = await localizarUsuarioAgendamento({ eventId, dealId, phone })
    if (!localizado.u || !localizado.from) {
      return res.status(404).json({ erro: "usuario nao encontrado para o agendamento" })
    }

    const resultado = await executarComLockUsuario(localizado.from, async () => {
      const atual = await localizarUsuarioAgendamento({ eventId, dealId, phone })
      if (!atual.u) return null
      return liberarAgendamentoERecalcularStage(atual.u, "evento_cancelado_make")
    })
    if (!resultado) return res.status(404).json({ erro: "usuario nao encontrado para o agendamento" })
    return res.json({ ok: true, ...resultado })
  } catch (e) {
    logErro("evento-cancelado", e.message, e)
    return res.sendStatus(500)
  }
})

// ------------------------------------------------------------------
// ROTA /pos-consulta - encerra o evento ativo e preserva/recalcula apenas o stage jurídico
// Body aceito: { eventId } ou { dealId } ou { phone }
// ------------------------------------------------------------------
app.post("/pos-consulta", validarWebhookInterno, async (req, res) => {
  try {
    const { eventId, dealId, phone, force } = req.body || {}
    const localizado = await localizarUsuarioAgendamento({ eventId, dealId, phone })
    if (!localizado.u || !localizado.from) {
      return res.status(404).json({ erro: "usuario nao encontrado para o agendamento" })
    }

    const resultado = await executarComLockUsuario(localizado.from, async () => {
      const atual = await localizarUsuarioAgendamento({ eventId, dealId, phone })
      if (!atual.u) return null

      const estadoEvento = await getConsultaView(atual.u.negocioId)
      const eventoId = sanitizarTextoEntrada(estadoEvento.eventId)
      if (!eventoId && force) {
        return { atualizado: false, motivo: "sem_evento_calendar", evento: estadoEvento }
      }

      if (estadoEvento.cancelado) {
        const liberacao = await liberarAgendamentoERecalcularStage(atual.u, "evento_cancelado_pos_consulta")
        return { evento: estadoEvento, ...liberacao }
      }

      if (!force && !estadoEvento.passou) {
        return { atualizado: false, motivo: "consulta_ainda_futura", evento: estadoEvento }
      }

      const liberacao = await liberarAgendamentoERecalcularStage(atual.u, "pos_consulta")
      return { evento: estadoEvento, ...liberacao }
    })

    if (!resultado) return res.status(404).json({ erro: "usuario nao encontrado para o agendamento" })
    return res.json({ ok: true, ...resultado })
  } catch (e) {
    logErro("pos-consulta", e.message, e)
    return res.sendStatus(500)
  }
})

// Resultado humano da consulta. O decurso do horário, sozinho, produz "encerrada".
app.post("/consulta-status", validarWebhookInterno, async (req, res) => {
  try {
    const { eventId, status, dealId, phone, origem } = req.body || {}
    if (!eventId || !["realizada", "nao_compareceu"].includes(sanitizarTextoEntrada(status).toLowerCase())) {
      return res.status(400).json({ erro: "eventId e status (realizada|nao_compareceu) obrigatorios" })
    }
    const estado = await definirResultadoConsulta(eventId, status)
    const localizado = await localizarUsuarioAgendamento({ eventId, dealId, phone })
    const dealIdEvento = estado.metadata?.dealId || dealId || localizado.u?.negocioId
    if (!dealIdEvento) return res.status(400).json({ erro: "dealId ausente no evento Calendar" })
    const origemEvento = ["admin", "client", "system"].includes(origem) ? origem : "admin"
    await appendConsultaEvent({
      tipo: estado.status === "realizada" ? "consulta.completed" : "consulta.no_show",
      dealId: dealIdEvento,
      consultaStatus: estado.status,
      metadata: {
        calendarEventId: estado.eventId,
        inicio: estado.inicio,
        fim: estado.fim,
        tipoConsulta: estado.metadata?.tipoConsulta,
        versaoIntegracao: estado.metadata?.versaoIntegracao || "3"
      },
      origem: origemEvento,
      chaveIdempotencia: `calendar:${estado.eventId}:${estado.status}`
    })
    if (localizado.u) {
      await atualizarEstadoConsultaUsuario(localizado.u)
      localizado.u._ultimaConsultaRealizadaEm = estado.status === "realizada" ? new Date().toISOString() : null
      localizado.u._ultimaConsultaNaoCompareceuEm = estado.status === "nao_compareceu" ? new Date().toISOString() : null
      agendarPersistenciaUsers()
    }
    return res.json({ ok: true, estado })
  } catch (e) {
    logErro("consulta-status", e.message, e)
    return res.sendStatus(500)
  }
})

// ------------------------------------------------------------------
// ROTA /lembrete - lembrete automatico antes da consulta
// Chamar pelo agendador interno somente no horário temporizado:
//   - 24h: POST /lembrete com { phone, name, eventId, datetime, tipo: "24h", scheduledFor }
//   - hoje: POST /lembrete com { phone, name, eventId, datetime, tipo: "hoje", scheduledFor }
//   - 1h:  POST /lembrete com { phone, name, eventId, datetime, tipo: "1h", scheduledFor }
// ------------------------------------------------------------------
app.post("/lembrete", validarWebhookInterno, async (req, res) => {
  try {
    const { phone, name, datetime, tipo, eventId, scheduledFor, dealId, casoId, params } = req.body
    if (!phone) return res.sendStatus(400)
    if (!tipoLembreteConsultaValido(tipo)) return res.status(400).json({ erro: "tipo de lembrete invalido" })
    const numero = normalizarNumeroWhatsAppEnvio(phone)
    if (!numero) return res.sendStatus(400)

    let dataEvento = datetime
    let evento = null
    if (eventId) {
      evento = await getConsultaCalendarEventState(eventId)
      if (!evento?.encontrado) return res.status(404).json({ erro: "evento nao encontrado" })
      if (evento.cancelado || evento.status === "cancelled") return res.status(409).json({ erro: "evento cancelado" })
      dataEvento = evento.inicio || dataEvento
    }
    const validacaoJanela = validarJanelaEnvioLembreteConsulta({ tipo, inicioConsulta: dataEvento, scheduledFor })
    if (!validacaoJanela.ok) {
      return res.status(validacaoJanela.status).json({
        erro: validacaoJanela.motivo,
        scheduledFor: validacaoJanela.scheduledFor
      })
    }

    const dealIdContexto = sanitizarTextoEntrada(dealId || evento?.metadata?.dealId)
    const casoIdContexto = sanitizarTextoEntrada(casoId || dealIdContexto)
    const localizado = await localizarUsuarioAgendamento({ eventId, dealId: dealIdContexto, phone: numero })
    const contextoConversa = criarContextoConsultaTemplate({
      tipo,
      eventId,
      dealId: dealIdContexto,
      casoId: casoIdContexto,
      inicioConsulta: dataEvento
    })
    if (!localizado.u || !localizado.from) {
      return res.status(404).json({ erro: "usuario_nao_encontrado_para_contexto" })
    }
    if (!contextoConversa) {
      return res.status(422).json({ erro: "contexto_conversa_template_invalido" })
    }

    const callbackKey = createCallbackKey("lembrete", {
      phone: numero,
      datetime: datetime || "",
      tipo: tipo || "",
      eventId: eventId || ""
    })
    const callbackExecution = beginCallbackExecution(callbackKey, { route: "/lembrete" })
    if (!callbackExecution.started) return res.sendStatus(200)

    const parametrosTemplate = Array.isArray(params) ? params : []
    const enviado = await templateService.consultaLembrete(numero, tipo, parametrosTemplate, {
      usuario: localizado.u,
      contextoConversa,
      requireContextoConversa: true
    })
    if (!enviado) {
      abandonCallbackExecution(callbackKey)
      await flushExternalState()
      return res.status(502).json({ erro: "falha_envio_template" })
    }

    if (localizado.u) agendarPersistenciaUsers()
    completeCallbackExecution(callbackKey)
    await flushExternalState()
    return res.json({
      ok: true,
      templateTipo: templateService.templateTipoConsultaLembrete(tipo),
      contextoCriado: Boolean(localizado.u && contextoConversa)
    })
  } catch (e) { logErro("lembrete", e.message); return res.sendStatus(500) }
})

// ------------------------------------------------------------------
// AGENDADOR INTERNO — substitui os Data Stores e triggers do Make.com.
// Um cron externo gratuito pode apenas acordar este endpoint; todas as
// regras, reservas, tentativas e resultados permanecem no Oráculum/Neon.
// ------------------------------------------------------------------
const INTERNAL_SCHEDULER_ENABLED =
  String(process.env.INTERNAL_SCHEDULER_ENABLED || "false").trim().toLowerCase() === "true"
const INTERNAL_SCHEDULER_INTERVAL_MS = Math.max(
  60000,
  Number(process.env.INTERNAL_SCHEDULER_INTERVAL_MS || 300000)
)
const INTERNAL_SCHEDULER_TODAY_HOUR = Math.max(
  0,
  Math.min(23, Number(process.env.CONSULTA_LEMBRETE_HOJE_HORA || 9))
)
let internalSchedulerRepository = null
let internalSchedulerExecution = null
let internalSchedulerTimer = null

async function postRotaInterna(pathname, payload) {
  const response = await axios.post(
    `http://127.0.0.1:${PORT}${pathname}`,
    payload || {},
    {
      headers: {
        "content-type": "application/json",
        "x-internal-secret": process.env.INTERNAL_WEBHOOK_SECRET
      },
      timeout: 120000,
      validateStatus: () => true
    }
  )
  return { status: response.status, body: response.data || {} }
}

async function planejarConsultasNoAgendador() {
  const now = new Date()
  const events = await listConsultaCalendarEventsForReconciliation({
    timeMin: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    timeMax: new Date(now.getTime() + 370 * 24 * 60 * 60 * 1000).toISOString()
  })
  const scopes = []
  for (const event of events) {
    const state = classificarEstadoCalendar(event)
    if (!state?.eventId) continue
    let scope = null
    if (state.status === "agendada") {
      const response = await postRotaInterna("/consulta-lembrete-dados", { eventId: state.eventId })
      if (response.status === 200 && automationTargetAllowed(response.body)) {
        scope = consultationScope(
          { ...response.body, end: state.fim || null },
          { todayHour: INTERNAL_SCHEDULER_TODAY_HOUR, now }
        )
      }
    } else if (state.status === "cancelada" && automationTargetAllowed({ dealId: state.metadata?.dealId })) {
      scope = consultationLifecycleScope({
        action: "cancel",
        eventId: state.eventId,
        dealId: state.metadata?.dealId,
        scheduledFor: now
      })
    } else if (["encerrada", "realizada", "nao_compareceu"].includes(state.status) &&
        automationTargetAllowed({ dealId: state.metadata?.dealId })) {
      scope = consultationLifecycleScope({
        action: "complete",
        eventId: state.eventId,
        dealId: state.metadata?.dealId,
        scheduledFor: state.fim || now
      })
    }
    if (scope) scopes.push(scope)
  }
  return scopes
}

async function planejarReengajamentosNoAgendador() {
  if (!AUTO_REENGAJAMENTO) return []
  const scopes = []
  for (const candidate of descobrirCandidatosReengajamento()) {
    if (!automationTargetAllowed(candidate)) continue
    const response = await postRotaInterna("/reengajamento-dados", {
      phone: candidate.phone,
      dealId: candidate.dealId
    })
    if (response.status !== 200) continue
    const scope = reengagementScope(response.body)
    if (scope) scopes.push(scope)
  }
  return scopes
}

async function despacharRotaAgendada(pathname, payload) {
  if (!automationTargetAllowed(payload)) {
    logInfo({ event: "scheduler_job_skipped", queue: "internal_scheduler", reasonCode: "pilot_target_not_allowed" })
    return { outcome: "skipped", reason: "pilot_target_not_allowed" }
  }
  const response = await postRotaInterna(pathname, payload)
  if (response.status >= 500) {
    const error = new Error("INTERNAL_ROUTE_UNAVAILABLE")
    error.retryable = true
    throw error
  }
  if (response.status >= 400) {
    return { outcome: "skipped", httpStatus: response.status, reason: response.body?.reason || response.body?.erro || "rejected" }
  }
  const skipped = response.body?.status === "skipped"
  return {
    outcome: skipped ? "skipped" : "sent",
    httpStatus: response.status,
    reason: response.body?.reason || null
  }
}

async function sincronizarConsultaNoAgendador(payload = {}) {
  if (!payload.eventId || !automationTargetAllowed(payload)) {
    return { outcome: "skipped", reason: "pilot_target_not_allowed" }
  }
  try {
    const localizado = await localizarUsuarioAgendamento(payload)
    if (!localizado.u || !localizado.from) return { outcome: "skipped", reason: "usuario_nao_encontrado" }
    const resultado = await executarComLockUsuario(localizado.from, async () => {
      const atual = users[localizado.from]
      if (!atual) return null
      await atualizarEstadoConsultaUsuario(atual)
      await sincronizarNegocio(atual)
      agendarPersistenciaUsers()
      return true
    })
    return resultado
      ? { outcome: "sent" }
      : { outcome: "skipped", reason: "usuario_nao_encontrado" }
  } catch (error) {
    logErro("consulta_sync_scheduler", error.message, error)
    throw error
  }
}

async function executarAgendadorInterno() {
  if (!INTERNAL_SCHEDULER_ENABLED) return { status: "disabled" }
  if (!internalSchedulerRepository) throw new Error("INTERNAL_SCHEDULER_NOT_READY")
  if (internalSchedulerExecution) return internalSchedulerExecution
  internalSchedulerExecution = processInternalSchedule({
    repository: internalSchedulerRepository,
    planners: [planejarConsultasNoAgendador, planejarReengajamentosNoAgendador],
    dispatchers: {
      consultation_reminder: job => despacharRotaAgendada("/lembrete", job.payload),
      consultation_sync: job => sincronizarConsultaNoAgendador(job.payload),
      consultation_lifecycle: job => despacharRotaAgendada(
        job.payload?.action === "cancel" ? "/evento-cancelado" : "/pos-consulta",
        job.payload
      ),
      reengagement: job => despacharRotaAgendada("/reengajamento", job.payload)
    },
    limit: Number(process.env.INTERNAL_SCHEDULER_BATCH_SIZE || 25),
    logger: (event, data) => logInfo({ event, queue: "internal_scheduler", ...data })
  }).finally(() => { internalSchedulerExecution = null })
  return internalSchedulerExecution
}

app.post("/internal/processar-agendamentos", validarWebhookInterno, async (_req, res) => {
  try {
    if (!INTERNAL_SCHEDULER_ENABLED) return res.json({ status: "disabled" })
    const result = await executarAgendadorInterno()
    return res.json({ status: "ok", ...result })
  } catch (error) {
    logErro("internal_scheduler", error.message, error)
    return res.status(503).json({ status: "unavailable" })
  }
})

app.get("/internal/agendador-status", validarWebhookInterno, async (_req, res) => {
  try {
    if (!INTERNAL_SCHEDULER_ENABLED) return res.json({ enabled: false })
    if (!internalSchedulerRepository) return res.status(503).json({ enabled: true, ready: false })
    return res.json({ enabled: true, ready: true, jobs: await internalSchedulerRepository.health() })
  } catch (error) {
    logErro("internal_scheduler", error.message, error)
    return res.status(503).json({ enabled: true, ready: false })
  }
})

let httpServer = null
async function iniciarServidor() {
  try {
    const externalState = await initializeExternalStateRepository({ directory: DATA_DIR })
    console.log(`[PERSISTENCIA_EXTERNA] enabled=${externalState.enabled} restored=${externalState.restoredFiles || 0}`)
    if (INTERNAL_SCHEDULER_ENABLED) {
      const schedulerPool = getPool()
      if (!schedulerPool) throw new Error("INTERNAL_SCHEDULER_DATABASE_REQUIRED")
      await initializeInternalScheduler(schedulerPool)
      internalSchedulerRepository = createInternalSchedulerRepository({ pool: schedulerPool })
      console.log("[AGENDADOR_INTERNO] enabled=true provider=postgres")
    }
    carregarUsersPersistidos()
    communicationPreferences.load()
    for (const [from, u] of Object.entries(users)) {
      promoverPreferenciaComunicacao(u, from)
      obterPreferenciaComunicacao(u, from)
    }
    if (isPostHumanComplementationEnabled()) {
      postHumanCycleRepository = new PostHumanCycleRepository({
        pool: getPool(),
        mode: process.env.NODE_ENV === "production" ? "postgres" : (getPool() ? "postgres" : "local")
      })
      postHumanActionContextRepository = new PostHumanActionContextRepository({
        pool: getPool(),
        mode: process.env.NODE_ENV === "production" ? "postgres" : (getPool() ? "postgres" : "local")
      })
      await postHumanActionContextRepository.initialize()
      await recoverPostHumanCycles({
        isEnabled: isPostHumanComplementationEnabled,
        repository: postHumanCycleRepository,
        isCaseAllowed: isPilotCaseAllowed,
        findUser: cycle => Object.values(users).find(item =>
          String(item?.negocioId) === String(cycle.negocioId) &&
          String(item?.numeroCaso).toUpperCase() === String(cycle.numeroCaso).toUpperCase()),
        processCycle: (cycle, usuario) => processPostHumanCycle({
          cycle, usuario, repository: postHumanCycleRepository,
          deps: {
            resolverListaDocumental: () => getDocumentosListaCaso(usuario),
            listarArquivosDrive: async () => usuario.pastaDriveId ? listarArquivosDriveNaPasta(usuario.pastaDriveId) : [],
            requiredSources: usuario.pastaDriveId ? ["drive"] : [],
            camposComplementaresPendentes: async () => {
              const context = await carregarPendenciasComplementaresPosHumanas({
                usuario, cycle, repository: postHumanCycleRepository
              })
              return context
            },
            getLatestCustomerMessage: () => users[normalizarNumeroWhatsAppEnvio(usuario._numero || usuario.whatsappContato)]?.ultimaMsg ?? usuario.ultimaMsg,
            sendFree: (to, message) => enviar(to, message),
            presentClientMenu: (to) => apresentarMenuClientePosHumano(to, usuario),
            sendTemplate: (to, name, params, language, options) => enviarTemplateWhatsApp(to, name, params, language, options),
            templateConfig: META_TEMPLATES.casoAtualizacao,
            buildTemplateParams: solicitacao => [solicitacao.texto],
            isComplete: criarVerificadorCompletudePosHumana(usuario, postHumanCycleRepository)
          }
        }),
        safeLogger: (event, error) => logErro("post_human", `${event}: ${error}`)
      })
    }
    carregarWebhookInbox()
    carregarMensagensOutbound()
    carregarPendenciasAudioPedidoDocumentos()
    carregarSessoesAdminAssistidasPersistidas(sessoesAdminWhatsApp)
    restaurarTimersPersistidos()
    await validarMetaWabaNoBoot()
    const callbackRecovery = recoverCallbackIdempotencyAbandonedProcessing()
    if (callbackRecovery.recovered > 0) {
      console.log(`[CALLBACK_IDEMPOTENCY] processing_abandonado_recuperado=${callbackRecovery.recovered}`)
    }
  } catch (err) {
    logErro("meta_waba", err.message, err)
    process.exitCode = 1
    return
  }

  httpServer = app.listen(PORT, () => {
    console.log(`Oraculum v6.4 — porta ${PORT}`)
    if (INTERNAL_SCHEDULER_ENABLED) {
      setImmediate(() => executarAgendadorInterno().catch(error =>
        logErro("internal_scheduler", error.message, error)
      ))
      internalSchedulerTimer = setInterval(() => {
        executarAgendadorInterno().catch(error =>
          logErro("internal_scheduler", error.message, error)
        )
      }, INTERNAL_SCHEDULER_INTERVAL_MS)
      internalSchedulerTimer.unref()
    }
    setImmediate(() => {
      drenarWebhookInbox().catch(err =>
        logErro("webhook_inbox", "Falha no replay da inbox: " + err.message, err)
      )
    })
  })
}

const encerrarServidor = criarGracefulShutdown({
  persistirUsersAgora,
  persistirSessoesAdminAssistidasAgora,
  sessoesAdminWhatsApp,
  fecharServidorHttp: () => new Promise((resolve, reject) => {
    if (!httpServer) return resolve()
    httpServer.close(error => error ? reject(error) : resolve())
  }),
  closeExternalStateRepository,
  logErro
})
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => { encerrarServidor(signal) })

module.exports = {
  app,
  iniciarServidor,
  encerrarServidor,
  telaDetalheCasoAdmin,
  sessoesAdminWhatsApp,
  users,
  usuarioTemProgressoParaRetomada,
  usuarioTemRelatoParaRetomada,
  processarInterno,
  flowRetomadaMenu,
  processarRetomadaOuReinicio,
  obterStageRetomadaOriginal,
  STAGES,
  persistirUsersAgora,
  api,
  podeMostrarMenuCliente
}

if (require.main === module) iniciarServidor()
