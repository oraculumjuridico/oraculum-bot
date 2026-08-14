# Catálogo de funções do runtime

> Arquivo gerado por `npm run docs:catalog`. Não editar manualmente.

Este índice cobre as funções nomeadas de `server.js`, `tts.js` e `src/`. A explicação conceitual dos fluxos está em `docs/ORACULUM_SYSTEM_GUIDE.md`.

Total: **2429 funções** em **235 módulos**.

- **pública**: aparece no contrato `module.exports` do módulo;
- **interna**: detalhe de implementação usado dentro do próprio módulo.

## `server.js`

Composição principal, rotas HTTP e orquestração dos fluxos WhatsApp.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `criarRequestId` | 596 | interna | Cria request id. |
| `primeiroValorObservabilidade` | 601 | interna | Executa a responsabilidade interna “primeiro valor observabilidade”. |
| `telefoneRemetenteWebhookMeta` | 605 | interna | Executa a responsabilidade interna “telefone remetente webhook meta”. |
| `contextoObservabilidade` | 615 | interna | Executa a responsabilidade interna “contexto observabilidade”. |
| `logOperacional` | 629 | interna | Executa a responsabilidade interna “log operacional”. |
| `logSkipOperacional` | 636 | interna | Executa a responsabilidade interna “log skip operacional”. |
| `validarAdminHttp` | 722 | interna | Valida admin http. |
| `linkHubSpot` | 785 | interna | Executa a responsabilidade interna “link hub spot”. |
| `criarTransporteEmail` | 790 | interna | Cria transporte email. |
| `enviarEmailNotificacao` | 798 | interna | Envia email notificacao. |
| `enviarWhatsAppAdmin` | 826 | interna | Envia whats app admin. |
| `enviarWhatsAppAdmin_para` | 851 | interna | Envia whats app admin para. |
| `enviarRespostaAdmin` | 875 | interna | Envia resposta admin. |
| `notificarMensagemUrgente` | 890 | interna | Executa a responsabilidade interna “notificar mensagem urgente”. |
| `notificarAgendamento` | 921 | interna | Executa a responsabilidade interna “notificar agendamento”. |
| `sortearAtendente` | 975 | interna | Executa a responsabilidade interna “sortear atendente”. |
| `criarRespostaFallbackProcessamento` | 989 | interna | Cria resposta fallback processamento. |
| `obterBaseUrlPublica` | 997 | interna | Obtém base url publica. |
| `montarUrlPublica` | 1007 | interna | Monta url publica. |
| `urlAudioAtendente` | 1017 | interna | Executa a responsabilidade interna “url audio atendente”. |
| `etapaValida` | 1022 | interna | Executa a responsabilidade interna “etapa valida”. |
| `telefonePreferenciaComunicacao` | 1041 | interna | Executa a responsabilidade interna “telefone preferencia comunicacao”. |
| `obterPreferenciaComunicacao` | 1045 | interna | Obtém preferencia comunicacao. |
| `promoverPreferenciaComunicacao` | 1057 | interna | Executa a responsabilidade interna “promover preferencia comunicacao”. |
| `definirPreferenciaComunicacao` | 1063 | interna | Executa a responsabilidade interna “definir preferencia comunicacao”. |
| `rotuloPreferenciaComunicacao` | 1075 | interna | Executa a responsabilidade interna “rotulo preferencia comunicacao”. |
| `invalidarCacheResumoOperacional` | 1088 | interna | Executa a responsabilidade interna “invalidar cache resumo operacional”. |
| `executarComLockUsuario` | 1093 | interna | Executa com lock usuario. |
| `criarChaveMensagemDuplicada` | 1120 | interna | Cria chave mensagem duplicada. |
| `mensagemJaProcessada` | 1129 | interna | Executa a responsabilidade interna “mensagem ja processada”. |
| `novoUsuario` | 1145 | interna | Executa a responsabilidade interna “novo usuario”. |
| `nomeValidoParaExibicao` | 1222 | interna | Executa a responsabilidade interna “nome valido para exibicao”. |
| `resolverNomeBaseWhatsApp` | 1227 | interna | Resolve nome base whats app. |
| `resolverNomeBriefing` | 1234 | interna | Resolve nome briefing. |
| `resolverUsuarioPorHubSpot` | 1249 | interna | Resolve usuario por hub spot. |
| `salvarEtapa` | 1368 | interna | Salva etapa. |
| `obterEtapaSegura` | 1384 | interna | Obtém etapa segura. |
| `podeRetomar` | 1393 | interna | Executa a responsabilidade interna “pode retomar”. |
| `setStage` | 1399 | interna | Executa a responsabilidade interna “set stage”. |
| `telaConfirmarTranscricao` | 1584 | interna | Executa a responsabilidade interna “tela confirmar transcricao”. |
| `telaConfirmarArea` | 1607 | interna | Executa a responsabilidade interna “tela confirmar area”. |
| `telaConfirmarAreaAudio` | 1626 | interna | Executa a responsabilidade interna “tela confirmar area audio”. |
| `telaConfirmarDadosAudio` | 1655 | interna | Executa a responsabilidade interna “tela confirmar dados audio”. |
| `enviarAudioPedidoCidade` | 1760 | interna | Envia audio pedido cidade. |
| `enviarAudioConfirmacaoLocalizacao` | 1775 | interna | Envia audio confirmacao localizacao. |
| `respostaAposCidade` | 1785 | interna | Executa a responsabilidade interna “resposta apos cidade”. |
| `textoContextoTitularCaso` | 1821 | interna | Executa a responsabilidade interna “texto contexto titular caso”. |
| `detectarAmbiguidadeTitularNome` | 1832 | interna | Detecta ambiguidade titular nome. |
| `telaEscolhaModo` | 1850 | interna | Executa a responsabilidade interna “tela escolha modo”. |
| `telaParaQuem` | 1877 | interna | Executa a responsabilidade interna “tela para quem”. |
| `perguntarTitularNomePreCadastro` | 1926 | interna | Executa a responsabilidade interna “perguntar titular nome pre cadastro”. |
| `gerarCaso` | 1955 | interna | Gera caso. |
| `gerarBriefingCaso` | 1958 | interna | Gera briefing caso. |
| `proximaAcao` | 1968 | interna | Executa a responsabilidade interna “proxima acao”. |
| `resumoCaso` | 2005 | interna | Executa a responsabilidade interna “resumo caso”. |
| `getHubSpotResumoCliente` | 2021 | interna | Executa a responsabilidade interna “get hub spot resumo cliente”. |
| `getHubSpotDescricaoCompleta` | 2035 | interna | Executa a responsabilidade interna “get hub spot descricao completa”. |
| `restaurarTipoCasoHubSpot` | 2079 | interna | Restaura tipo caso hub spot. |
| `garantirNomenclaturaJuridicaUsuario` | 2101 | interna | Garante nomenclatura juridica usuario. |
| `getHubSpotDealStateProps` | 2129 | interna | Executa a responsabilidade interna “get hub spot deal state props”. |
| `getHubSpotDealProps` | 2157 | interna | Executa a responsabilidade interna “get hub spot deal props”. |
| `mapearStageParaDealstage` | 2165 | interna | Executa a responsabilidade interna “mapear stage para dealstage”. |
| `getLabelOrigemCaptacao` | 2205 | interna | Executa a responsabilidade interna “get label origem captacao”. |
| `getNomeDeal` | 2213 | interna | Executa a responsabilidade interna “get nome deal”. |
| `getNotaLead` | 2225 | interna | Executa a responsabilidade interna “get nota lead”. |
| `ehFinalizacaoCasoTerceiro` | 2252 | interna | Determina se finalizacao caso terceiro. |
| `telaVoltarConfirmacaoTerceiro` | 2271 | interna | Executa a responsabilidade interna “tela voltar confirmacao terceiro”. |
| `criarSnapshotCasoCliente` | 2292 | interna | Cria snapshot caso cliente. |
| `restaurarCasoAnteriorCliente` | 2340 | interna | Restaura caso anterior cliente. |
| `voltarMenuCasoAnteriorCliente` | 2410 | interna | Executa a responsabilidade interna “voltar menu caso anterior cliente”. |
| `temDadosUteisTerceiroIncompleto` | 2416 | interna | Executa a responsabilidade interna “tem dados uteis terceiro incompleto”. |
| `capturarLeadTerceiroIncompleto` | 2427 | interna | Executa a responsabilidade interna “capturar lead terceiro incompleto”. |
| `cancelarNovoCasoClienteEVoltarMenu` | 2500 | interna | Cancela novo caso cliente evoltar menu. |
| `registrarCasoTerceiroNoWhatsAppInformado` | 2531 | interna | Registra caso terceiro no whats app informado. |
| `finalizarCadastroTerceiroEVoltarOrigem` | 2605 | interna | Executa a responsabilidade interna “finalizar cadastro terceiro evoltar origem”. |
| `encerrarNovoCasoClienteEVoltarMenu` | 2645 | interna | Encerra novo caso cliente evoltar menu. |
| `usuarioTemRelatoParaRetomada` | 2668 | pública | Executa a responsabilidade interna “usuario tem relato para retomada”. |
| `usuarioTemProgressoParaRetomada` | 2678 | pública | Executa a responsabilidade interna “usuario tem progresso para retomada”. |
| `identificarEtapaAtual` | 2721 | interna | Executa a responsabilidade interna “identificar etapa atual”. |
| `registrarUltimaPergunta` | 2738 | interna | Registra ultima pergunta. |
| `limparDadosCasoAtual` | 2764 | interna | Executa a responsabilidade interna “limpar dados caso atual”. |
| `limparDadosAtendimento` | 2877 | interna | Executa a responsabilidade interna “limpar dados atendimento”. |
| `prepararNovaEntradaAposFluxoEncerrado` | 2925 | interna | Executa a responsabilidade interna “preparar nova entrada apos fluxo encerrado”. |
| `enviarOpcoesPadrao` | 2996 | interna | Envia opcoes padrao. |
| `prepararConfirmacaoEntrada` | 3010 | interna | Executa a responsabilidade interna “preparar confirmacao entrada”. |
| `limparEntradaPendente` | 3052 | interna | Executa a responsabilidade interna “limpar entrada pendente”. |
| `resetarSessaoAtendimento` | 3058 | interna | Executa a responsabilidade interna “resetar sessao atendimento”. |
| `responderEncerramento` | 3097 | interna | Responde encerramento. |
| `encerrarComCaptura` | 3118 | interna | Encerra com captura. |
| `encerrarAtendimento` | 3147 | interna | Encerra atendimento. |
| `encerrarClienteCadastrado` | 3153 | interna | Encerra cliente cadastrado. |
| `executarEncerramentoFluxo` | 3180 | interna | Executa encerramento fluxo. |
| `executarRecomecoFluxo` | 3213 | interna | Executa recomeco fluxo. |
| `stageAceitaTextoLivre` | 3249 | interna | Executa a responsabilidade interna “stage aceita texto livre”. |
| `ehStageFluxoAntigo` | 3271 | interna | Determina se stage fluxo antigo. |
| `migrarFluxoAntigoParaRelatoLivre` | 3328 | interna | Executa a responsabilidade interna “migrar fluxo antigo para relato livre”. |
| `podeMostrarMenuCliente` | 3339 | pública | Executa a responsabilidade interna “pode mostrar menu cliente”. |
| `etapaPermitidaComCasoOficial` | 3344 | interna | Executa a responsabilidade interna “etapa permitida com caso oficial”. |
| `getNumeroCasoOficialDoNegocio` | 3357 | interna | Executa a responsabilidade interna “get numero caso oficial do negocio”. |
| `avancarAposTelefoneConfirmado` | 3361 | interna | Executa a responsabilidade interna “avancar apos telefone confirmado”. |
| `retomarUltimaPergunta` | 3378 | interna | Executa a responsabilidade interna “retomar ultima pergunta”. |
| `reapresentarPerguntaAtual` | 3384 | interna | Executa a responsabilidade interna “reapresentar pergunta atual”. |
| `perguntarNome` | 3388 | interna | Executa a responsabilidade interna “perguntar nome”. |
| `perguntarNomeProprio` | 3407 | interna | Executa a responsabilidade interna “perguntar nome proprio”. |
| `textoSolicitarNomeRepresentante` | 3439 | interna | Executa a responsabilidade interna “texto solicitar nome representante”. |
| `textoConfirmarNomeRepresentante` | 3449 | interna | Executa a responsabilidade interna “texto confirmar nome representante”. |
| `textoSolicitarNomePessoaAtendida` | 3461 | interna | Executa a responsabilidade interna “texto solicitar nome pessoa atendida”. |
| `textoConfirmarNomePessoaAtendida` | 3471 | interna | Executa a responsabilidade interna “texto confirmar nome pessoa atendida”. |
| `textoExplicarSituacaoTerceiro` | 3481 | interna | Executa a responsabilidade interna “texto explicar situacao terceiro”. |
| `audioSolicitarNomeRepresentante` | 3493 | interna | Executa a responsabilidade interna “audio solicitar nome representante”. |
| `audioConfirmarNomeRepresentante` | 3497 | interna | Executa a responsabilidade interna “audio confirmar nome representante”. |
| `audioSolicitarNomePessoaAtendida` | 3501 | interna | Executa a responsabilidade interna “audio solicitar nome pessoa atendida”. |
| `audioConfirmarNomePessoaAtendida` | 3505 | interna | Executa a responsabilidade interna “audio confirmar nome pessoa atendida”. |
| `audioExplicarSituacaoTerceiro` | 3509 | interna | Executa a responsabilidade interna “audio explicar situacao terceiro”. |
| `pedirRelatoAposNome` | 3516 | interna | Executa a responsabilidade interna “pedir relato apos nome”. |
| `perguntarCidade` | 3571 | interna | Executa a responsabilidade interna “perguntar cidade”. |
| `perguntarDescricao` | 3582 | interna | Executa a responsabilidade interna “perguntar descricao”. |
| `perguntarDocumentos` | 3588 | interna | Executa a responsabilidade interna “perguntar documentos”. |
| `enviarTelaDocumentosCaso` | 3598 | interna | Envia tela documentos caso. |
| `respostaRecomecoMenuPrincipal` | 3609 | interna | Executa a responsabilidade interna “resposta recomeco menu principal”. |
| `iniciarFluxoRelatoLivre` | 3619 | interna | Inicia fluxo relato livre. |
| `deveCapturarLeadIncompleto` | 3640 | interna | Executa a responsabilidade interna “deve capturar lead incompleto”. |
| `pularDescricaoPorAgora` | 3658 | interna | Executa a responsabilidade interna “pular descricao por agora”. |
| `ehStageDescricaoCaso` | 3702 | interna | Determina se stage descricao caso. |
| `entrarEtapaDescricao` | 3706 | interna | Executa a responsabilidade interna “entrar etapa descricao”. |
| `limparTimer` | 3712 | interna | Executa a responsabilidade interna “limpar timer”. |
| `limparTimerIncentivoDescricao` | 3716 | interna | Executa a responsabilidade interna “limpar timer incentivo descricao”. |
| `executarCallbackTimerUsuario` | 3723 | interna | Executa callback timer usuario. |
| `agendarIncentivoDescricao` | 3733 | interna | Agenda incentivo descricao. |
| `iniciarTimer` | 3782 | interna | Inicia timer. |
| `restaurarTimersPersistidos` | 3930 | interna | Restaura timers persistidos. |
| `telaRegioes` | 3967 | interna | Executa a responsabilidade interna “tela regioes”. |
| `telaUFsRegiao` | 3974 | interna | Executa a responsabilidade interna “tela ufs regiao”. |
| `criarCtx` | 3979 | interna | Cria ctx. |
| `textoOuTraco` | 4031 | interna | Executa a responsabilidade interna “texto ou traco”. |
| `resumoFatosJuridico` | 4035 | interna | Executa a responsabilidade interna “resumo fatos juridico”. |
| `pedidoClienteJuridico` | 4043 | interna | Executa a responsabilidade interna “pedido cliente juridico”. |
| `riscoPrazoJuridico` | 4071 | interna | Executa a responsabilidade interna “risco prazo juridico”. |
| `documentosEssenciaisJuridico` | 4080 | interna | Executa a responsabilidade interna “documentos essenciais juridico”. |
| `proximaEtapaConfirmacao` | 4087 | interna | Executa a responsabilidade interna “proxima etapa confirmacao”. |
| `calcularStageAposAgendamento` | 4095 | interna | Calcula stage apos agendamento. |
| `atualizarEstadoConsultaUsuario` | 4102 | interna | Atualiza estado consulta usuario. |
| `localizarUsuarioAgendamento` | 4112 | interna | Executa a responsabilidade interna “localizar usuario agendamento”. |
| `localizarUsuarioReengajamento` | 4130 | interna | Executa a responsabilidade interna “localizar usuario reengajamento”. |
| `telefoneCandidatoReengajamento` | 4146 | interna | Executa a responsabilidade interna “telefone candidato reengajamento”. |
| `candidateReasonsReengajamento` | 4163 | interna | Executa a responsabilidade interna “candidate reasons reengajamento”. |
| `montarCandidatoReengajamento` | 4179 | interna | Monta candidato reengajamento. |
| `adicionarCandidatoReengajamento` | 4194 | interna | Executa a responsabilidade interna “adicionar candidato reengajamento”. |
| `lerUsersPersistidosParaReengajamento` | 4203 | interna | Executa a responsabilidade interna “ler users persistidos para reengajamento”. |
| `descobrirCandidatosReengajamento` | 4216 | interna | Executa a responsabilidade interna “descobrir candidatos reengajamento”. |
| `criarContextoReengajamentoTemplate` | 4231 | interna | Cria contexto reengajamento template. |
| `validarJanelaEnvioReengajamento` | 4249 | interna | Valida janela envio reengajamento. |
| `validarScheduledForReengajamento` | 4265 | interna | Valida scheduled for reengajamento. |
| `validarExpiracaoReengajamento` | 4285 | interna | Valida expiracao reengajamento. |
| `enviarJobReengajamento` | 4303 | interna | Envia job reengajamento. |
| `validarCadenciaReengajamento` | 4328 | interna | Valida cadencia reengajamento. |
| `registrarEnvioReengajamento` | 4338 | interna | Registra envio reengajamento. |
| `tipoLembreteConsultaValido` | 4346 | interna | Executa a responsabilidade interna “tipo lembrete consulta valido”. |
| `calcularAlvoLembreteConsulta` | 4350 | interna | Calcula alvo lembrete consulta. |
| `validarJanelaEnvioLembreteConsulta` | 4362 | interna | Valida janela envio lembrete consulta. |
| `criarContextoConsultaTemplate` | 4388 | interna | Cria contexto consulta template. |
| `liberarAgendamentoERecalcularStage` | 4410 | interna | Executa a responsabilidade interna “liberar agendamento erecalcular stage”. |
| `labelStageAdmin` | 4478 | interna | Executa a responsabilidade interna “label stage admin”. |
| `montarNotificacaoCancelamentoClienteAdmin` | 4557 | interna | Monta notificacao cancelamento cliente admin. |
| `normalizarItemAdminLocal` | 4584 | interna | Normaliza item admin local. |
| `hsAdminContarNegociosPorStages` | 4619 | interna | Executa a responsabilidade interna “hs admin contar negocios por stages”. |
| `hsAdminBuscarContatoDoNegocio` | 4632 | interna | Executa a responsabilidade interna “hs admin buscar contato do negocio”. |
| `hidratarDadosContatoAdmin` | 4663 | interna | Executa a responsabilidade interna “hidratar dados contato admin”. |
| `hsAdminBuscarNegociosPorStages` | 4686 | interna | Executa a responsabilidade interna “hs admin buscar negocios por stages”. |
| `hsAdminBuscarTodosNegociosPorStages` | 4757 | interna | Executa a responsabilidade interna “hs admin buscar todos negocios por stages”. |
| `hsAdminBuscarNegociosDireto` | 4789 | interna | Executa a responsabilidade interna “hs admin buscar negocios direto”. |
| `deduplicarDealsAdmin` | 4823 | interna | Executa a responsabilidade interna “deduplicar deals admin”. |
| `hsAdminBuscarDealsPorNumeroCaso` | 4827 | interna | Executa a responsabilidade interna “hs admin buscar deals por numero caso”. |
| `confirmarVinculoPosHumanoHubSpot` | 4846 | interna | Executa a responsabilidade interna “confirmar vinculo pos humano hub spot”. |
| `hsAdminBuscarContatosPorNome` | 4865 | interna | Executa a responsabilidade interna “hs admin buscar contatos por nome”. |
| `hsAdminBuscarContatosPorTelefone` | 4878 | interna | Executa a responsabilidade interna “hs admin buscar contatos por telefone”. |
| `cpfValidoConsultaAdmin` | 4898 | interna | Executa a responsabilidade interna “cpf valido consulta admin”. |
| `classificarConsultaCasoAdmin` | 4910 | interna | Classifica consulta caso admin. |
| `hsAdminListarDealsDosContatosEstrito` | 4921 | interna | Executa a responsabilidade interna “hs admin listar deals dos contatos estrito”. |
| `resolverConsultaCasoAdmin` | 4927 | interna | Resolve consulta caso admin. |
| `mapearComLimite` | 4962 | interna | Executa a responsabilidade interna “mapear com limite”. |
| `worker` | 4968 | interna | Executa a responsabilidade interna “worker”. |
| `reconciliarTituloNegocioHubSpotAdmin` | 4979 | interna | Executa a responsabilidade interna “reconciliar titulo negocio hub spot admin”. |
| `hsAdminItensPorStages` | 5007 | interna | Executa a responsabilidade interna “hs admin itens por stages”. |
| `hsAdminItemPorDealId` | 5020 | interna | Executa a responsabilidade interna “hs admin item por deal id”. |
| `adminItensAtivosHubSpot` | 5045 | interna | Executa a responsabilidade interna “admin itens ativos hub spot”. |
| `adminFonteCasos` | 5050 | interna | Executa a responsabilidade interna “admin fonte casos”. |
| `adminResumoOperacional` | 5069 | interna | Executa a responsabilidade interna “admin resumo operacional”. |
| `gerarAlertasOperacionaisAdmin` | 5113 | interna | Gera alertas operacionais admin. |
| `maiorAlertaOperacionalAdmin` | 5177 | interna | Executa a responsabilidade interna “maior alerta operacional admin”. |
| `gerarResumoDiarioOperacional` | 5181 | interna | Gera resumo diario operacional. |
| `ordenarPorRisco` | 5196 | interna | Executa a responsabilidade interna “ordenar por risco”. |
| `usuariosAdminOrdenados` | 5255 | interna | Executa a responsabilidade interna “usuarios admin ordenados”. |
| `salvarListaCasosAdmin` | 5262 | interna | Salva lista casos admin. |
| `obterCasoAdmin` | 5282 | interna | Obtém caso admin. |
| `prepararSessaoClienteAcaoAdmin` | 5296 | interna | Executa a responsabilidade interna “preparar sessao cliente acao admin”. |
| `chaveCasoAdmin` | 5325 | interna | Executa a responsabilidade interna “chave caso admin”. |
| `limparRevisoesCasosAdmin` | 5337 | interna | Executa a responsabilidade interna “limpar revisoes casos admin”. |
| `obterRevisaoCasoAdmin` | 5344 | interna | Obtém revisao caso admin. |
| `casoAdminRevisado` | 5351 | interna | Executa a responsabilidade interna “caso admin revisado”. |
| `marcarCasoAdminRevisado` | 5355 | interna | Marca caso admin revisado. |
| `motivoPrioridadeAdmin` | 5367 | interna | Executa a responsabilidade interna “motivo prioridade admin”. |
| `scorePrioridadeAdmin` | 5372 | interna | Executa a responsabilidade interna “score prioridade admin”. |
| `gerarPrioridadesAdmin` | 5376 | interna | Gera prioridades admin. |
| `hidratarNomesPrioridadesAdmin` | 5393 | interna | Executa a responsabilidade interna “hidratar nomes prioridades admin”. |
| `nomePrioridadeAdmin` | 5401 | interna | Executa a responsabilidade interna “nome prioridade admin”. |
| `resolverTelefoneInterfaceAdmin` | 5407 | interna | Resolve telefone interface admin. |
| `linhaPrioridadeAdmin` | 5412 | interna | Executa a responsabilidade interna “linha prioridade admin”. |
| `textoDetalheCasoAdmin` | 5432 | interna | Executa a responsabilidade interna “texto detalhe caso admin”. |
| `telaAdminPrincipal` | 5491 | interna | Executa a responsabilidade interna “tela admin principal”. |
| `iniciarConsultaCasoAdmin` | 5532 | interna | Inicia consulta caso admin. |
| `encerrarConsultaPendenteAdmin` | 5558 | interna | Encerra consulta pendente admin. |
| `encerrarAcaoCasoPendenteAdmin` | 5565 | interna | Encerra acao caso pendente admin. |
| `executarConsultaCasoAdmin` | 5572 | interna | Executa consulta caso admin. |
| `iniciarComplementacaoCasoAdmin` | 5631 | interna | Inicia complementacao caso admin. |
| `executarComplementacaoCasoAdmin` | 5659 | interna | Executa complementacao caso admin. |
| `iniciarEnvioDocumentoCasoAdmin` | 5696 | interna | Inicia envio documento caso admin. |
| `executarDocumentoCasoSelecionadoAdmin` | 5710 | interna | Executa documento caso selecionado admin. |
| `iniciarAgendamentoCasoAdmin` | 5771 | interna | Inicia agendamento caso admin. |
| `executarAgendamentoCasoAdmin` | 5787 | interna | Executa agendamento caso admin. |
| `telaAdminPrioridades` | 5807 | interna | Executa a responsabilidade interna “tela admin prioridades”. |
| `telaAdminCasos` | 5892 | interna | Executa a responsabilidade interna “tela admin casos”. |
| `telaAdminAlertas` | 5920 | interna | Executa a responsabilidade interna “tela admin alertas”. |
| `telaAdminListaCasos` | 5957 | interna | Executa a responsabilidade interna “tela admin lista casos”. |
| `telaAdminFalhaHubSpot` | 6004 | interna | Executa a responsabilidade interna “tela admin falha hub spot”. |
| `telaAdminCasosNovos` | 6012 | interna | Executa a responsabilidade interna “tela admin casos novos”. |
| `filtro` | 6014 | interna | Executa a responsabilidade interna “filtro”. |
| `telaAdminCasosAnalise` | 6021 | interna | Executa a responsabilidade interna “tela admin casos analise”. |
| `telaAdminCasosDocumentos` | 6033 | interna | Executa a responsabilidade interna “tela admin casos documentos”. |
| `telaAdminCasosAtivos` | 6042 | interna | Executa a responsabilidade interna “tela admin casos ativos”. |
| `telaAdminAlertasUrgentes` | 6052 | interna | Executa a responsabilidade interna “tela admin alertas urgentes”. |
| `telaAdminAlertasSemResposta` | 6061 | interna | Executa a responsabilidade interna “tela admin alertas sem resposta”. |
| `telaAdminAlertasDocs` | 6073 | interna | Executa a responsabilidade interna “tela admin alertas docs”. |
| `telaAdminAlertasAgenda` | 6082 | interna | Executa a responsabilidade interna “tela admin alertas agenda”. |
| `telaAdminResumoDiario` | 6087 | interna | Executa a responsabilidade interna “tela admin resumo diario”. |
| `telaDetalheCasoAdmin` | 6103 | pública | Executa a responsabilidade interna “tela detalhe caso admin”. |
| `montarTela` | 6135 | interna | Monta tela. |
| `botaoVoltarCasoAdmin` | 6154 | interna | Executa a responsabilidade interna “botao voltar caso admin”. |
| `formatarCpfAdmin` | 6159 | pública | Formata cpf admin. |
| `resolverUrlCofreCredenciaisAdmin` | 6165 | interna | Resolve url cofre credenciais admin. |
| `telaCredenciaisCasoAdmin` | 6176 | pública | Executa a responsabilidade interna “tela credenciais caso admin”. |
| `telaDocumentosCasoAdmin` | 6206 | interna | Executa a responsabilidade interna “tela documentos caso admin”. |
| `telaComunicacaoCasoAdmin` | 6233 | interna | Executa a responsabilidade interna “tela comunicacao caso admin”. |
| `confirmarPedidoDocumentosAdmin` | 6249 | interna | Executa a responsabilidade interna “confirmar pedido documentos admin”. |
| `confirmarLembreteCasoAdmin` | 6273 | interna | Executa a responsabilidade interna “confirmar lembrete caso admin”. |
| `telaRevisaoDocumentalAdmin` | 6287 | interna | Executa a responsabilidade interna “tela revisao documental admin”. |
| `aplicarRevisaoDocumentalAdmin` | 6326 | interna | Aplica revisao documental admin. |
| `telaPreferenciaComunicacaoAdmin` | 6362 | interna | Executa a responsabilidade interna “tela preferencia comunicacao admin”. |
| `atualizarPreferenciaComunicacaoAdmin` | 6377 | interna | Atualiza preferencia comunicacao admin. |
| `telaLinksCasoAdmin` | 6384 | interna | Executa a responsabilidade interna “tela links caso admin”. |
| `marcarCasoRevisadoAdmin` | 6418 | interna | Marca caso revisado admin. |
| `preferenciaAudioSempreCanonica` | 6453 | interna | Executa a responsabilidade interna “preferencia audio sempre canonica”. |
| `chaveAtivaAudioPedidoDocumentos` | 6463 | interna | Executa a responsabilidade interna “chave ativa audio pedido documentos”. |
| `consumirPendenciaAudioPedidoDocumentos` | 6470 | interna | Executa a responsabilidade interna “consumir pendencia audio pedido documentos”. |
| `pedirDocsCasoAdmin` | 6510 | interna | Executa a responsabilidade interna “pedir docs caso admin”. |
| `marcarCasoUrgenteAdmin` | 6616 | interna | Marca caso urgente admin. |
| `enviarAnaliseCasoAdmin` | 6671 | interna | Envia analise caso admin. |
| `enviarLembreteCasoAdmin` | 6717 | interna | Envia lembrete caso admin. |
| `resumoConsultaAdmin` | 6776 | interna | Executa a responsabilidade interna “resumo consulta admin”. |
| `obterConsultasAtivasAdmin` | 6784 | interna | Obtém consultas ativas admin. |
| `telaConsultasAdmin` | 6827 | interna | Executa a responsabilidade interna “tela consultas admin”. |
| `obterItemAdmin` | 6859 | interna | Obtém item admin. |
| `telaDetalheConsultaAdmin` | 6873 | interna | Executa a responsabilidade interna “tela detalhe consulta admin”. |
| `telaConfirmarCancelamentoAdmin` | 6919 | interna | Executa a responsabilidade interna “tela confirmar cancelamento admin”. |
| `cancelarConsultaAdmin` | 6957 | interna | Cancela consulta admin. |
| `obterConsultaAtivaCliente` | 7036 | interna | Obtém consulta ativa cliente. |
| `cancelarEventoConsultaUsuario` | 7066 | interna | Cancela evento consulta usuario. |
| `processarAdminWhatsApp` | 7108 | interna | Processa admin whats app. |
| `detalharErroHubspot` | 7441 | interna | Executa a responsabilidade interna “detalhar erro hubspot”. |
| `capturarLeadIncompleto` | 7445 | interna | Executa a responsabilidade interna “capturar lead incompleto”. |
| `getCalendar` | 7607 | interna | Executa a responsabilidade interna “get calendar”. |
| `baixarMidia` | 7617 | interna | Executa a responsabilidade interna “baixar midia”. |
| `textoAudioConfirmacaoDados` | 7666 | interna | Executa a responsabilidade interna “texto audio confirmacao dados”. |
| `enviarTelaImagemOuTexto` | 7678 | interna | Envia tela imagem ou texto. |
| `enviarGuiaDocs` | 7704 | interna | Envia guia docs. |
| `responderTelaDocumento` | 7726 | interna | Responde tela documento. |
| `enviarIntroDocumentos` | 7734 | interna | Envia intro documentos. |
| `prepararFluxoResumoOutro` | 7765 | interna | Executa a responsabilidade interna “preparar fluxo resumo outro”. |
| `uploadDocumentoCano` | 7779 | interna | Executa a responsabilidade interna “upload documento cano”. |
| `pastaUploadDocumento` | 7801 | interna | Executa a responsabilidade interna “pasta upload documento”. |
| `detectarEncerramentoPorAudio` | 7807 | interna | Detecta encerramento por audio. |
| `finalizarCadastro` | 7828 | interna | Executa a responsabilidade interna “finalizar cadastro”. |
| `finalizarCadastroAssistidoAdmin` | 8110 | interna | Executa a responsabilidade interna “finalizar cadastro assistido admin”. |
| `tela_confirmacao` | 8134 | interna | Executa a responsabilidade interna “tela confirmacao”. |
| `telaConfirmacaoComImagem` | 8178 | interna | Executa a responsabilidade interna “tela confirmacao com imagem”. |
| `voltarParaConfirmacao` | 8198 | interna | Executa a responsabilidade interna “voltar para confirmacao”. |
| `limparCorrecaoPendente` | 8217 | interna | Executa a responsabilidade interna “limpar correcao pendente”. |
| `pedirCampoCorrecao` | 8224 | interna | Executa a responsabilidade interna “pedir campo correcao”. |
| `reabrirCorrecaoPendente` | 8241 | interna | Executa a responsabilidade interna “reabrir correcao pendente”. |
| `responderFalhaAudioCorrecao` | 8294 | interna | Responde falha audio correcao. |
| `textoAudioConfirmacaoNome` | 8305 | interna | Executa a responsabilidade interna “texto audio confirmacao nome”. |
| `prepararConfirmacaoCorrecao` | 8312 | interna | Executa a responsabilidade interna “preparar confirmacao correcao”. |
| `aplicarCorrecaoPendente` | 8368 | interna | Aplica correcao pendente. |
| `horarioAindaPodeSerAgendado` | 8440 | interna | Executa a responsabilidade interna “horario ainda pode ser agendado”. |
| `iniciarAgendamento` | 8448 | interna | Inicia agendamento. |
| `telaAdvogadoCliente` | 8498 | interna | Executa a responsabilidade interna “tela advogado cliente”. |
| `deveEnviarAudioAutomatico` | 8509 | interna | Executa a responsabilidade interna “deve enviar audio automatico”. |
| `enviarAudio` | 8532 | interna | Envia audio. |
| `enviarAudioModoVoz` | 8537 | interna | Envia audio modo voz. |
| `aplicarEmojiTelaCliente` | 8555 | interna | Aplica emoji tela cliente. |
| `ehContatoAdmin` | 8565 | interna | Determina se contato admin. |
| `enviarAudioAutomaticoTela` | 8571 | interna | Envia audio automatico tela. |
| `responderTelaComAudio` | 8584 | interna | Responde tela com audio. |
| `saudacaoPorHorarioCliente` | 8589 | interna | Executa a responsabilidade interna “saudacao por horario cliente”. |
| `saudacaoGenero` | 8615 | interna | Executa a responsabilidade interna “saudacao genero”. |
| `menuClienteComAudio` | 8618 | interna | Executa a responsabilidade interna “menu cliente com audio”. |
| `apresentarMenuClientePosHumano` | 8679 | interna | Executa a responsabilidade interna “apresentar menu cliente pos humano”. |
| `abrirSelecaoCasoParaAcao` | 8687 | interna | Executa a responsabilidade interna “abrir selecao caso para acao”. |
| `executarAcaoPendenteCliente` | 8706 | interna | Executa acao pendente cliente. |
| `telaAdvogadoClienteComAudio` | 8718 | interna | Executa a responsabilidade interna “tela advogado cliente com audio”. |
| `telaStatusCliente` | 8724 | interna | Executa a responsabilidade interna “tela status cliente”. |
| `telaConfirmarCancelamentoConsultaCliente` | 8837 | interna | Executa a responsabilidade interna “tela confirmar cancelamento consulta cliente”. |
| `cancelarConsultaCliente` | 8867 | interna | Cancela consulta cliente. |
| `confirmarAberturaNovoCasoCliente` | 8925 | interna | Executa a responsabilidade interna “confirmar abertura novo caso cliente”. |
| `abrirNovoCasoCliente` | 8944 | interna | Executa a responsabilidade interna “abrir novo caso cliente”. |
| `iniciarMensagemUrgenteCliente` | 8980 | interna | Inicia mensagem urgente cliente. |
| `gerarConfortoUrgenteCliente` | 8998 | interna | Gera conforto urgente cliente. |
| `respostaUrgenteRegistradaComAudio` | 9028 | interna | Executa a responsabilidade interna “resposta urgente registrada com audio”. |
| `aproveitarRelatoAudioClienteNovoCaso` | 9047 | interna | Executa a responsabilidade interna “aproveitar relato audio cliente novo caso”. |
| `proximaEtapaNovoCasoClienteAposModo` | 9065 | interna | Executa a responsabilidade interna “proxima etapa novo caso cliente apos modo”. |
| `executarIntencaoDetectadaCliente` | 9118 | interna | Executa intencao detectada cliente. |
| `executarIntencaoCliente` | 9126 | interna | Executa intencao cliente. |
| `sairContextoDocumentosCliente` | 9193 | interna | Executa a responsabilidade interna “sair contexto documentos cliente”. |
| `responderComTimer` | 9204 | interna | Responde com timer. |
| `telaDescreverCaso` | 9209 | interna | Executa a responsabilidade interna “tela descrever caso”. |
| `telaConfirmarUrgente` | 9219 | interna | Executa a responsabilidade interna “tela confirmar urgente”. |
| `telaConfirmarUrgenteComAudio` | 9226 | interna | Executa a responsabilidade interna “tela confirmar urgente com audio”. |
| `deveOferecerExplicarTudo` | 9241 | interna | Executa a responsabilidade interna “deve oferecer explicar tudo”. |
| `prepararOfertaExplicarTudoFinal` | 9247 | interna | Executa a responsabilidade interna “preparar oferta explicar tudo final”. |
| `iniciarConfirmacaoDescricao` | 9256 | interna | Inicia confirmacao descricao. |
| `respostaAposConfirmarDescricao` | 9271 | interna | Executa a responsabilidade interna “resposta apos confirmar descricao”. |
| `flowInicio` | 9302 | interna | Executa a responsabilidade interna “flow inicio”. |
| `flowInicioRetorno` | 9324 | interna | Executa a responsabilidade interna “flow inicio retorno”. |
| `obterStageRetomadaOriginal` | 9342 | pública | Obtém stage retomada original. |
| `obterCamposResumo` | 9361 | interna | Obtém campos resumo. |
| `formatarResumoValor` | 9363 | interna | Formata resumo valor. |
| `possuiResumoValido` | 9387 | interna | Executa a responsabilidade interna “possui resumo valido”. |
| `flowMenuCorrecaoRetomada` | 9405 | interna | Executa a responsabilidade interna “flow menu correcao retomada”. |
| `flowRetomadaAutomatica` | 9441 | interna | Executa a responsabilidade interna “flow retomada automatica”. |
| `flowRetomadaMenu` | 9469 | pública | Executa a responsabilidade interna “flow retomada menu”. |
| `flowResumoRetomada` | 9497 | interna | Executa a responsabilidade interna “flow resumo retomada”. |
| `flowResumoAtendimento` | 9568 | interna | Executa a responsabilidade interna “flow resumo atendimento”. |
| `reiniciarFluxoRetomada` | 9594 | interna | Executa a responsabilidade interna “reiniciar fluxo retomada”. |
| `respostaOpcaoInvalidaRetomada` | 9616 | interna | Executa a responsabilidade interna “resposta opcao invalida retomada”. |
| `responderImprevistoPreAtendimento` | 9628 | interna | Responde imprevisto pre atendimento. |
| `redirecionarCorrecaoPreAtendimento` | 9708 | interna | Executa a responsabilidade interna “redirecionar correcao pre atendimento”. |
| `jaTemDadosParaConfirmacao` | 9715 | interna | Executa a responsabilidade interna “ja tem dados para confirmacao”. |
| `irParaEditar` | 9718 | interna | Executa a responsabilidade interna “ir para editar”. |
| `tratarImprevistoPreAtendimento` | 9856 | interna | Executa a responsabilidade interna “tratar imprevisto pre atendimento”. |
| `tratarIntervencaoPreAtendimento` | 9881 | interna | Executa a responsabilidade interna “tratar intervencao pre atendimento”. |
| `conduzirPreAtendimentoIA` | 9928 | interna | Executa a responsabilidade interna “conduzir pre atendimento ia”. |
| `flowAcolhimentoCidade` | 10041 | interna | Executa a responsabilidade interna “flow acolhimento cidade”. |
| `flowAcolhimentoConfirmaWhatsapp` | 10081 | interna | Executa a responsabilidade interna “flow acolhimento confirma whatsapp”. |
| `telaEsclarecimentoConfuso` | 10130 | interna | Executa a responsabilidade interna “tela esclarecimento confuso”. |
| `flowNome` | 10160 | interna | Executa a responsabilidade interna “flow nome”. |
| `flowCidade` | 10164 | interna | Executa a responsabilidade interna “flow cidade”. |
| `flowDescricao` | 10168 | interna | Executa a responsabilidade interna “flow descricao”. |
| `flowDocumentos` | 10185 | interna | Executa a responsabilidade interna “flow documentos”. |
| `flowDescConfirma` | 10189 | interna | Executa a responsabilidade interna “flow desc confirma”. |
| `flowConfirmacao` | 10220 | interna | Executa a responsabilidade interna “flow confirmacao”. |
| `flowCliente` | 10239 | interna | Executa a responsabilidade interna “flow cliente”. |
| `flowConfirmarEntrada` | 10249 | interna | Executa a responsabilidade interna “flow confirmar entrada”. |
| `flowNovoCasoConfirma` | 10275 | interna | Executa a responsabilidade interna “flow novo caso confirma”. |
| `flowColetaTelOutro` | 10294 | interna | Executa a responsabilidade interna “flow coleta tel outro”. |
| `flowColetaTelWpp` | 10299 | interna | Executa a responsabilidade interna “flow coleta tel wpp”. |
| `flowColetaTelWppContato` | 10305 | interna | Executa a responsabilidade interna “flow coleta tel wpp contato”. |
| `flowDescErroTranscricao` | 10325 | interna | Executa a responsabilidade interna “flow desc erro transcricao”. |
| `flowAguardandoUrgente` | 10335 | interna | Executa a responsabilidade interna “flow aguardando urgente”. |
| `flowUrgenteAudioErroTranscricao` | 10340 | interna | Executa a responsabilidade interna “flow urgente audio erro transcricao”. |
| `flowUrgenteAudioConfirma` | 10345 | interna | Executa a responsabilidade interna “flow urgente audio confirma”. |
| `flowAudioFluxoConfirma` | 10350 | interna | Executa a responsabilidade interna “flow audio fluxo confirma”. |
| `flowAudioConfirmarDados` | 10355 | interna | Executa a responsabilidade interna “flow audio confirmar dados”. |
| `flowAudioConfirmarTranscricao` | 10370 | interna | Executa a responsabilidade interna “flow audio confirmar transcricao”. |
| `flowAudioConfirmarAreaCanal` | 10383 | interna | Executa a responsabilidade interna “flow audio confirmar area canal”. |
| `flowMenuCorrecao` | 10396 | interna | Executa a responsabilidade interna “flow menu correcao”. |
| `flowCorrigirValor` | 10413 | interna | Executa a responsabilidade interna “flow corrigir valor”. |
| `flowCorrigirUf` | 10420 | interna | Executa a responsabilidade interna “flow corrigir uf”. |
| `flowCorrigirSel` | 10425 | interna | Executa a responsabilidade interna “flow corrigir sel”. |
| `flowConfirmarCorrecao` | 10433 | interna | Executa a responsabilidade interna “flow confirmar correcao”. |
| `flowRetomadaFallback` | 10440 | interna | Executa a responsabilidade interna “flow retomada fallback”. |
| `flowAssessoriaInicial` | 10458 | interna | Executa a responsabilidade interna “flow assessoria inicial”. |
| `limparLinhaComentario` | 10501 | interna | Executa a responsabilidade interna “limpar linha comentario”. |
| `obterNomeFlow` | 10633 | interna | Obtém nome flow. |
| `executarFlowSeguro` | 10637 | interna | Executa flow seguro. |
| `retomarFluxo` | 10655 | interna | Executa a responsabilidade interna “retomar fluxo”. |
| `processarRetomadaOuReinicio` | 10700 | pública | Processa retomada ou reinicio. |
| `verificarRetomadaAutomatica` | 10960 | interna | Verifica retomada automatica. |
| `tentarRestaurarClienteHubSpotParaMenu` | 11041 | interna | Executa a responsabilidade interna “tentar restaurar cliente hub spot para menu”. |
| `processarAnaliseDocumentalSegura` | 11060 | interna | Processa analise documental segura. |
| `rotulosDocumentosCaso` | 11095 | interna | Executa a responsabilidade interna “rotulos documentos caso”. |
| `sincronizarNotaAnaliseCasoSegura` | 11105 | interna | Executa a responsabilidade interna “sincronizar nota analise caso segura”. |
| `dependenciasReavaliacaoDocumentalPosHumana` | 11153 | interna | Executa a responsabilidade interna “dependencias reavaliacao documental pos humana”. |
| `sincronizarDecisaoDocumentalCanonicaHubSpotSeguro` | 11171 | interna | Executa a responsabilidade interna “sincronizar decisao documental canonica hub spot seguro”. |
| `confirmarDocumentoCanonicoSeguro` | 11222 | interna | Executa a responsabilidade interna “confirmar documento canonico seguro”. |
| `consolidarDocumentosDoCasoSeguro` | 11258 | interna | Executa a responsabilidade interna “consolidar documentos do caso seguro”. |
| `registrarDocumentoNoCicloPosHumano` | 11272 | interna | Registra documento no ciclo pos humano. |
| `processarMidia` | 11293 | interna | Processa midia. |
| `proximaConfirmacaoProgressiva` | 11674 | interna | Executa a responsabilidade interna “proxima confirmacao progressiva”. |
| `textoComIntroducaoAudio` | 11679 | interna | Executa a responsabilidade interna “texto com introducao audio”. |
| `processarAudioCanalAtendimento` | 11822 | interna | Processa audio canal atendimento. |
| `adaptarTextoAudioCadastral` | 11918 | interna | Executa a responsabilidade interna “adaptar texto audio cadastral”. |
| `transcreverAudioRespostaCadastral` | 11948 | interna | Executa a responsabilidade interna “transcrever audio resposta cadastral”. |
| `processarAudioNoFluxo` | 11960 | interna | Processa audio no fluxo. |
| `processarUrgenciaOuCorrecao` | 12046 | interna | Processa urgencia ou correcao. |
| `processarInterno` | 13072 | pública | Processa interno. |
| `processar` | 17489 | interna | Processa processar. |
| `drenaFilaUsuario` | 17527 | interna | Executa a responsabilidade interna “drena fila usuario”. |
| `carregarPendenciasComplementaresPosHumanas` | 17548 | interna | Carrega pendencias complementares pos humanas. |
| `complementoPosHumanoEstaCompleto` | 17598 | interna | Executa a responsabilidade interna “complemento pos humano esta completo”. |
| `criarVerificadorCompletudePosHumana` | 17607 | interna | Cria verificador completude pos humana. |
| `criarDispatcherPosHumano` | 17614 | interna | Cria dispatcher pos humano. |
| `withLegalNomenclature` | 17678 | interna | Executa a responsabilidade interna “with legal nomenclature”. |
| `processarComLock` | 17850 | interna | Processa com lock. |
| `arquivoExiste` | 17934 | interna | Executa a responsabilidade interna “arquivo existe”. |
| `dataModificacaoArquivo` | 17939 | interna | Executa a responsabilidade interna “data modificacao arquivo”. |
| `resumirCallbackIdempotency` | 17948 | interna | Executa a responsabilidade interna “resumir callback idempotency”. |
| `resumirWebhookInbox` | 17972 | interna | Executa a responsabilidade interna “resumir webhook inbox”. |
| `agruparUltimosErrosPorCategoria` | 17993 | interna | Executa a responsabilidade interna “agrupar ultimos erros por categoria”. |
| `montarHealthInternoOperacional` | 18001 | interna | Monta health interno operacional. |
| `processarMensagemWebhook` | 18065 | interna | Processa mensagem webhook. |
| `drenarWebhookInbox` | 18103 | interna | Executa a responsabilidade interna “drenar webhook inbox”. |
| `postRotaInterna` | 18939 | interna | Executa a responsabilidade interna “post rota interna”. |
| `planejarConsultasNoAgendador` | 18955 | interna | Executa a responsabilidade interna “planejar consultas no agendador”. |
| `planejarReengajamentosNoAgendador` | 18995 | interna | Executa a responsabilidade interna “planejar reengajamentos no agendador”. |
| `despacharRotaAgendada` | 19011 | interna | Executa a responsabilidade interna “despachar rota agendada”. |
| `sincronizarConsultaNoAgendador` | 19033 | interna | Executa a responsabilidade interna “sincronizar consulta no agendador”. |
| `executarAgendadorInterno` | 19057 | interna | Executa agendador interno. |
| `iniciarServidor` | 19121 | pública | Inicia servidor. |

## `src/adapters/drive-single-case-adapter.js`

Adaptador de integração: drive single case adapter.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `fail` | 5 | interna | Executa a responsabilidade interna “fail”. |
| `validId` | 6 | interna | Executa a responsabilidade interna “valid id”. |
| `validDestination` | 7 | interna | Executa a responsabilidade interna “valid destination”. |
| `createDriveSingleCaseAdapter` | 8 | pública | Executa a responsabilidade interna “create drive single case adapter”. |
| `call` | 13 | interna | Executa a responsabilidade interna “call”. |
| `list` | 22 | interna | Executa a responsabilidade interna “list”. |

## `src/adapters/google-drive-single-case-client.js`

Adaptador de integração: google drive single case client.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `fail` | 3 | interna | Executa a responsabilidade interna “fail”. |
| `esc` | 4 | interna | Executa a responsabilidade interna “esc”. |
| `createGoogleDriveSingleCaseClient` | 5 | pública | Executa a responsabilidade interna “create google drive single case client”. |
| `call` | 10 | interna | Executa a responsabilidade interna “call”. |
| `list` | 11 | interna | Executa a responsabilidade interna “list”. |

## `src/adapters/hubspot-http-client.js`

Adaptador de integração: hubspot http client.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `fail` | 9 | interna | Executa a responsabilidade interna “fail”. |
| `createHubSpotHttpClient` | 13 | pública | Executa a responsabilidade interna “create hub spot http client”. |
| `request` | 19 | interna | Executa a responsabilidade interna “request”. |
| `objectPort` | 49 | interna | Executa a responsabilidade interna “object port”. |

## `src/adapters/hubspot-single-case-adapter.js`

Adaptador de integração: hubspot single case adapter.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `sanitizeError` | 21 | interna | Executa a responsabilidade interna “sanitize error”. |
| `validateContext` | 31 | interna | Executa a responsabilidade interna “validate context”. |
| `createHubSpotSingleCaseAdapters` | 41 | pública | Executa a responsabilidade interna “create hub spot single case adapters”. |
| `withTimeout` | 47 | interna | Executa a responsabilidade interna “with timeout”. |

## `src/adapters/hubspot-task-adapter.js`

Adaptador de integração: hubspot task adapter.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `headers` | 2 | interna | Executa a responsabilidade interna “headers”. |
| `createHubSpotTaskAdapter` | 6 | pública | Executa a responsabilidade interna “create hub spot task adapter”. |

## `src/adapters/single-case-content-loader.js`

Adaptador de integração: single case content loader.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `fail` | 5 | interna | Executa a responsabilidade interna “fail”. |
| `createSingleCaseContentLoader` | 7 | pública | Executa a responsabilidade interna “create single case content loader”. |

## `src/adapters/single-case-content-resolver.js`

Adaptador de integração: single case content resolver.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `fail` | 9 | interna | Executa a responsabilidade interna “fail”. |
| `createSingleCaseContentResolver` | 10 | pública | Executa a responsabilidade interna “create single case content resolver”. |
| `one` | 21 | interna | Executa a responsabilidade interna “one”. |

## `src/adapters/single-case-plan-loader.js`

Adaptador de integração: single case plan loader.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `fail` | 10 | interna | Executa a responsabilidade interna “fail”. |
| `createSingleCasePlanLoader` | 11 | pública | Executa a responsabilidade interna “create single case plan loader”. |

## `src/adapters/single-case-reservation-adapter.js`

Adaptador de integração: single case reservation adapter.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `fail` | 5 | interna | Executa a responsabilidade interna “fail”. |
| `createSingleCaseReservationAdapter` | 6 | pública | Executa a responsabilidade interna “create single case reservation adapter”. |
| `read` | 10 | interna | Executa a responsabilidade interna “read”. |

## `src/adapters/single-case-reservation-repository.js`

Adaptador de integração: single case reservation repository.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `fail` | 2 | interna | Executa a responsabilidade interna “fail”. |
| `createSingleCaseReservationRepository` | 3 | pública | Executa a responsabilidade interna “create single case reservation repository”. |

## `src/composition/oraculum-runtime-env.js`

Composição de dependências: oraculum runtime env.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `loadOperationalEnvironment` | 9 | pública | Executa a responsabilidade interna “load operational environment”. |

## `src/composition/single-case-authorization-components.js`

Composição de dependências: single case authorization components.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `trustedPublicKeysFromEnv` | 11 | pública | Executa a responsabilidade interna “trusted public keys from env”. |
| `createSingleCaseAuthorizationComponents` | 30 | pública | Executa a responsabilidade interna “create single case authorization components”. |

## `src/composition/single-case-coordination-components.js`

Composição de dependências: single case coordination components.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `createSingleCaseCoordinationComponents` | 4 | pública | Executa a responsabilidade interna “create single case coordination components”. |

## `src/composition/single-case-executor-composition.js`

Composição de dependências: single case executor composition.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `validateDependency` | 8 | interna | Executa a responsabilidade interna “validate dependency”. |
| `createSingleCaseExecutorComposition` | 15 | pública | Executa a responsabilidade interna “create single case executor composition”. |

## `src/composition/single-case-real-composition.js`

Composição de dependências: single case real composition.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `requiredPort` | 14 | interna | Executa a responsabilidade interna “required port”. |
| `integerSetting` | 20 | interna | Executa a responsabilidade interna “integer setting”. |
| `createSingleCaseRealComposition` | 27 | pública | Executa a responsabilidade interna “create single case real composition”. |

## `src/composition/single-case-real-preflight.js`

Composição de dependências: single case real preflight.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `sha256` | 14 | interna | Executa a responsabilidade interna “sha256”. |
| `safeCode` | 16 | interna | Executa a responsabilidade interna “safe code”. |
| `runSingleCaseRealPreflight` | 17 | pública | Executa a responsabilidade interna “run single case real preflight”. |

## `src/config/institutional-calendar.js`

Configuração e diagnóstico: institutional calendar.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `calendarConfigurationError` | 4 | interna | Executa a responsabilidade interna “calendar configuration error”. |
| `resolveInstitutionalCalendarId` | 10 | pública | Executa a responsabilidade interna “resolve institutional calendar id”. |

## `src/config/production-readiness.js`

Configuração e diagnóstico: production readiness.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `texto` | 2 | interna | Executa a responsabilidade interna “texto”. |
| `habilitado` | 6 | interna | Executa a responsabilidade interna “habilitado”. |
| `presente` | 10 | interna | Executa a responsabilidade interna “presente”. |
| `check` | 14 | interna | Executa a responsabilidade interna “check”. |
| `avaliarProntidaoProducao` | 25 | pública | Executa a responsabilidade interna “avaliar prontidao producao”. |

## `src/domain/action-guidance.js`

Regra de domínio: action guidance.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `limparRotulo` | 2 | pública | Executa a responsabilidade interna “limpar rotulo”. |
| `descricaoAcao` | 11 | pública | Executa a responsabilidade interna “descricao acao”. |
| `orientarTextoComAcoes` | 52 | pública | Executa a responsabilidade interna “orientar texto com acoes”. |
| `orientarAudioAcao` | 59 | pública | Executa a responsabilidade interna “orientar audio acao”. |

## `src/domain/address-facts.js`

Regra de domínio: address facts.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `plain` | 11 | interna | Executa a responsabilidade interna “plain”. |
| `present` | 16 | interna | Executa a responsabilidade interna “present”. |
| `normalizeCep` | 20 | pública | Executa a responsabilidade interna “normalize cep”. |
| `normalizeUf` | 25 | pública | Executa a responsabilidade interna “normalize uf”. |
| `uncertainText` | 33 | pública | Executa a responsabilidade interna “uncertain text”. |
| `makeFact` | 37 | interna | Executa a responsabilidade interna “make fact”. |
| `extractReference` | 49 | interna | Executa a responsabilidade interna “extract reference”. |
| `extractExplicitUf` | 58 | interna | Executa a responsabilidade interna “extract explicit uf”. |
| `cleanComponent` | 68 | interna | Executa a responsabilidade interna “clean component”. |
| `extractSyntacticFacts` | 72 | pública | Executa a responsabilidade interna “extract syntactic facts”. |
| `same` | 167 | pública | Executa a responsabilidade interna “same”. |
| `previousValue` | 175 | interna | Executa a responsabilidade interna “previous value”. |
| `applyCorrectionMetadata` | 182 | interna | Executa a responsabilidade interna “apply correction metadata”. |
| `buildAddressAnswerResult` | 197 | pública | Executa a responsabilidade interna “build address answer result”. |
| `trustedAddressDocumentFacts` | 259 | pública | Executa a responsabilidade interna “trusted address document facts”. |

## `src/domain/admin-assisted-ai-flow.js`

Regra de domínio: admin assisted ai flow.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `criarEstadoAtendimentoAssistido` | 63 | pública | Cria estado atendimento assistido. |
| `chaveAdmin` | 88 | interna | Executa a responsabilidade interna “chave admin”. |
| `obterSessaoAdmin` | 95 | interna | Obtém sessao admin. |
| `sessaoAdminAssistidaExpirada` | 120 | interna | Executa a responsabilidade interna “sessao admin assistida expirada”. |
| `salvarSessaoAdmin` | 126 | interna | Salva sessao admin. |
| `atendimentoAssistidoAdminAtivo` | 139 | pública | Executa a responsabilidade interna “atendimento assistido admin ativo”. |
| `telaInicioAtendimentoAssistidoAdmin` | 144 | pública | Executa a responsabilidade interna “tela inicio atendimento assistido admin”. |
| `iniciarAtendimentoAssistidoAdmin` | 161 | pública | Inicia atendimento assistido admin. |
| `tipoEntradaAdminAssistido` | 178 | interna | Executa a responsabilidade interna “tipo entrada admin assistido”. |
| `registrarEntradaAtendimentoAssistidoAdmin` | 184 | pública | Registra entrada atendimento assistido admin. |
| `valorCampo` | 211 | interna | Executa a responsabilidade interna “valor campo”. |
| `textoCampo` | 215 | interna | Executa a responsabilidade interna “texto campo”. |
| `emailValidoAdminAssistido` | 221 | interna | Executa a responsabilidade interna “email valido admin assistido”. |
| `textoCurto` | 230 | interna | Executa a responsabilidade interna “texto curto”. |
| `entradaPedeInformarDepois` | 236 | interna | Executa a responsabilidade interna “entrada pede informar depois”. |
| `camposCriticosFinalizacaoAdminAssistido` | 244 | interna | Executa a responsabilidade interna “campos criticos finalizacao admin assistido”. |
| `campoPodeFicarPendenteAdminAssistido` | 248 | interna | Executa a responsabilidade interna “campo pode ficar pendente admin assistido”. |
| `camposFaltantesAtivosAdminAssistido` | 252 | interna | Executa a responsabilidade interna “campos faltantes ativos admin assistido”. |
| `proximoCampoAtivoAdminAssistido` | 261 | interna | Executa a responsabilidade interna “proximo campo ativo admin assistido”. |
| `mergeDadosAdminAssistido` | 269 | interna | Executa a responsabilidade interna “merge dados admin assistido”. |
| `mergeComplementoAdminAssistido` | 282 | interna | Executa a responsabilidade interna “merge complemento admin assistido”. |
| `indicadorCampoAdminAssistido` | 296 | interna | Executa a responsabilidade interna “indicador campo admin assistido”. |
| `valorResumoCampoAdminAssistido` | 305 | interna | Executa a responsabilidade interna “valor resumo campo admin assistido”. |
| `formatarLinhaStatusAdminAssistido` | 311 | interna | Formata linha status admin assistido. |
| `valoresCamposAdminAssistido` | 316 | interna | Executa a responsabilidade interna “valores campos admin assistido”. |
| `listaResumoCopiloto` | 327 | interna | Lista esumo copiloto. |
| `gerarSecaoCopilotoJuridicoAdminAssistido` | 332 | interna | Gera secao copiloto juridico admin assistido. |
| `camposResumoAdminAssistido` | 362 | interna | Executa a responsabilidade interna “campos resumo admin assistido”. |
| `formatarLinhaColetaAdminAssistido` | 382 | interna | Formata linha coleta admin assistido. |
| `textoResumoAnaliseAdminAssistidoLegado` | 390 | interna | Executa a responsabilidade interna “texto resumo analise admin assistido legado”. |
| `textoResumoAnaliseAdminAssistido` | 411 | pública | Executa a responsabilidade interna “texto resumo analise admin assistido”. |
| `textoConfirmacaoCurtaAdminAssistido` | 444 | interna | Executa a responsabilidade interna “texto confirmacao curta admin assistido”. |
| `pendenciasRevisaoAdminAssistido` | 459 | interna | Executa a responsabilidade interna “pendencias revisao admin assistido”. |
| `obterAdminAssistidoDaSessao` | 466 | interna | Obtém admin assistido da sessao. |
| `camposEditaveisAdminAssistido` | 471 | interna | Executa a responsabilidade interna “campos editaveis admin assistido”. |
| `gerarResumoAdminAssistido` | 484 | pública | Gera resumo admin assistido. |
| `linhaSePreenchido` | 494 | interna | Executa a responsabilidade interna “linha se preenchido”. |
| `secao` | 502 | interna | Executa a responsabilidade interna “secao”. |
| `gerarRevisaoCurtaAdminAssistido` | 525 | pública | Gera revisao curta admin assistido. |
| `opcoesRevisaoAdminAssistido` | 547 | interna | Executa a responsabilidade interna “opcoes revisao admin assistido”. |
| `opcoesRevisaoEmailAdminAssistido` | 556 | interna | Executa a responsabilidade interna “opcoes revisao email admin assistido”. |
| `responderRevisaoCaso` | 565 | interna | Responde revisao caso. |
| `entradaEhAudio` | 574 | interna | Executa a responsabilidade interna “entrada eh audio”. |
| `capturarEntradaAtendimentoAssistido` | 579 | interna | Executa a responsabilidade interna “capturar entrada atendimento assistido”. |
| `telaConfirmarAudioAdminAssistido` | 614 | interna | Executa a responsabilidade interna “tela confirmar audio admin assistido”. |
| `telaErroAudioAdminAssistido` | 632 | interna | Executa a responsabilidade interna “tela erro audio admin assistido”. |
| `atualizarCampoPendente` | 643 | pública | Atualiza campo pendente. |
| `normalizarComandoAdminAssistido` | 680 | interna | Normaliza comando admin assistido. |
| `acaoNavegacaoAdminAssistido` | 688 | interna | Executa a responsabilidade interna “acao navegacao admin assistido”. |
| `opcoesNavegacaoAdminAssistido` | 696 | interna | Executa a responsabilidade interna “opcoes navegacao admin assistido”. |
| `acaoRevisaoAdminAssistido` | 704 | pública | Executa a responsabilidade interna “acao revisao admin assistido”. |
| `acaoRevisaoEmailAdminAssistido` | 713 | pública | Executa a responsabilidade interna “acao revisao email admin assistido”. |
| `acaoConfirmacaoAudioAdminAssistido` | 722 | interna | Executa a responsabilidade interna “acao confirmacao audio admin assistido”. |
| `acaoRetomadaAdminAssistido` | 729 | interna | Executa a responsabilidade interna “acao retomada admin assistido”. |
| `telaRetomadaAtendimentoAssistidoAdmin` | 736 | interna | Executa a responsabilidade interna “tela retomada atendimento assistido admin”. |
| `textoEscolhaCampoEdicao` | 752 | interna | Executa a responsabilidade interna “texto escolha campo edicao”. |
| `resolverCampoEdicao` | 764 | interna | Resolve campo edicao. |
| `atualizarAnaliseAdminAssistido` | 775 | interna | Atualiza analise admin assistido. |
| `criarPayloadLogAdminAssistido` | 813 | pública | Cria payload log admin assistido. |
| `registrarLogAdminAssistido` | 838 | interna | Registra log admin assistido. |
| `normalizarTelefoneAdminAssistido` | 849 | interna | Normaliza telefone admin assistido. |
| `normalizarPrioridadeAdminAssistido` | 862 | interna | Normaliza prioridade admin assistido. |
| `resumoDadosComplementaresAdminAssistido` | 874 | interna | Executa a responsabilidade interna “resumo dados complementares admin assistido”. |
| `montarDescricaoAdminAssistido` | 934 | interna | Monta descricao admin assistido. |
| `montarUsuarioFinalizacaoAdminAssistido` | 945 | pública | Monta usuario finalizacao admin assistido. |
| `textoSucessoCriacaoCasoAdminAssistido` | 1066 | interna | Executa a responsabilidade interna “texto sucesso criacao caso admin assistido”. |
| `labelInvariante` | 1083 | pública | Executa a responsabilidade interna “label invariante”. |
| `confirmarCriarCasoAdminAssistido` | 1095 | pública | Executa a responsabilidade interna “confirmar criar caso admin assistido”. |
| `salvarNovoEstadoAtendimento` | 1361 | interna | Salva novo estado atendimento. |
| `cancelarAtendimentoAssistidoAdmin` | 1368 | interna | Cancela atendimento assistido admin. |
| `voltarAtendimentoAssistidoAdmin` | 1392 | interna | Executa a responsabilidade interna “voltar atendimento assistido admin”. |
| `responderEstadoAtualAtendimentoAssistido` | 1412 | interna | Responde estado atual atendimento assistido. |
| `telaRevisaoEmailAdminAssistido` | 1436 | pública | Executa a responsabilidade interna “tela revisao email admin assistido”. |
| `acaoRevisaoEmailAdminAssistidoHandler` | 1454 | pública | Executa a responsabilidade interna “acao revisao email admin assistido handler”. |
| `processarAtendimentoAssistidoAdmin` | 1534 | pública | Processa atendimento assistido admin. |

## `src/domain/admin-assisted-ai-intelligence.js`

Regra de domínio: admin assisted ai intelligence.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `textoTemSobrenome` | 14 | interna | Executa a responsabilidade interna “texto tem sobrenome”. |
| `extrairNomeFallback` | 18 | interna | Executa a responsabilidade interna “extrair nome fallback”. |
| `detectarAreasAmbiguasFallback` | 29 | interna | Detecta areas ambiguas fallback. |
| `extrairCpfFallback` | 36 | interna | Executa a responsabilidade interna “extrair cpf fallback”. |
| `extrairIdadeFallback` | 41 | interna | Executa a responsabilidade interna “extrair idade fallback”. |
| `extrairTelefoneFallback` | 47 | interna | Executa a responsabilidade interna “extrair telefone fallback”. |
| `extrairEmailFallback` | 52 | interna | Executa a responsabilidade interna “extrair email fallback”. |
| `extrairCidadeUfFallback` | 57 | interna | Executa a responsabilidade interna “extrair cidade uf fallback”. |
| `extrairAposMarcador` | 75 | interna | Executa a responsabilidade interna “extrair apos marcador”. |
| `detectarAreaFallback` | 85 | interna | Detecta area fallback. |
| `detectarTipoCasoFallback` | 97 | interna | Detecta tipo caso fallback. |
| `detectarTerceiroFallback` | 154 | interna | Detecta terceiro fallback. |
| `normalizarTextoAnalise` | 162 | interna | Normaliza texto analise. |
| `pontuarAreaAdminAssistido` | 169 | interna | Executa a responsabilidade interna “pontuar area admin assistido”. |
| `detectarAreaPorIntencaoFallback` | 173 | interna | Detecta area por intencao fallback. |
| `extrairDocumentosMencionadosFallback` | 210 | interna | Executa a responsabilidade interna “extrair documentos mencionados fallback”. |
| `relatoIndicaDocumentosGenericos` | 228 | interna | Executa a responsabilidade interna “relato indica documentos genericos”. |
| `campoDocumentosDoRelato` | 233 | interna | Executa a responsabilidade interna “campo documentos do relato”. |
| `detectarUrgenciaFallback` | 242 | interna | Detecta urgencia fallback. |
| `montarResumoCurtoAdminAssistido` | 249 | interna | Monta resumo curto admin assistido. |
| `criarAnaliseFallback` | 262 | pública | Cria analise fallback. |
| `normalizarCampoExtraido` | 325 | interna | Normaliza campo extraido. |
| `normalizarAnaliseIA` | 336 | pública | Normaliza analise ia. |
| `extrairDadosAtendimentoAssistidoIA` | 404 | pública | Executa a responsabilidade interna “extrair dados atendimento assistido ia”. |

## `src/domain/admin-assisted-ai-schema.js`

Regra de domínio: admin assisted ai schema.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `valorENormalizadoInvalido` | 59 | pública | Executa a responsabilidade interna “valor enormalizado invalido”. |
| `campoAdminAssistidoPreenchido` | 129 | pública | Executa a responsabilidade interna “campo admin assistido preenchido”. |
| `normalizarAreaJuridicaAdminAssistido` | 393 | pública | Normaliza area juridica admin assistido. |
| `normalizarStatusCampoAdminAssistido` | 408 | pública | Normaliza status campo admin assistido. |
| `criarCampoAdminAssistido` | 416 | pública | Cria campo admin assistido. |
| `criarCampoCpfAdminAssistido` | 424 | pública | Cria campo cpf admin assistido. |
| `normalizarCampoAdminAssistido` | 437 | pública | Normaliza campo admin assistido. |
| `criarDadosVaziosAdminAssistido` | 448 | pública | Cria dados vazios admin assistido. |
| `obterCamposObrigatoriosAdminAssistido` | 457 | pública | Obtém campos obrigatorios admin assistido. |
| `obterCamposRevisaoEspecificosAdminAssistido` | 462 | pública | Obtém campos revisao especificos admin assistido. |
| `camposFaltantesAdminAssistido` | 467 | pública | Executa a responsabilidade interna “campos faltantes admin assistido”. |
| `proximoCampoObrigatorioAdminAssistido` | 477 | pública | Executa a responsabilidade interna “proximo campo obrigatorio admin assistido”. |
| `perguntaCampoAdminAssistido` | 481 | pública | Executa a responsabilidade interna “pergunta campo admin assistido”. |
| `labelCampoAdminAssistido` | 497 | pública | Executa a responsabilidade interna “label campo admin assistido”. |

## `src/domain/admin-assisted-intake-catalog.js`

Regra de domínio: admin assisted intake catalog.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `value` | 123 | interna | Executa a responsabilidade interna “value”. |
| `answered` | 125 | pública | Executa a responsabilidade interna “answered”. |
| `contextText` | 126 | interna | Executa a responsabilidade interna “context text”. |
| `isIncapacity` | 127 | interna | Determina se incapacity. |
| `isDenied` | 128 | interna | Determina se denied. |
| `hasApplication` | 129 | interna | Determina se existe application. |
| `isBpcDisability` | 137 | interna | Determina se bpc disability. |
| `isTrue` | 138 | interna | Determina se true. |
| `isFalse` | 139 | interna | Determina se false. |
| `needsContributionHistory` | 140 | interna | Executa a responsabilidade interna “needs contribution history”. |
| `needsBenefitNumber` | 141 | interna | Executa a responsabilidade interna “needs benefit number”. |
| `needsApplicationProtocol` | 142 | interna | Executa a responsabilidade interna “needs application protocol”. |
| `questionCatalog` | 143 | pública | Executa a responsabilidade interna “question catalog”. |
| `pendingQuestions` | 144 | pública | Executa a responsabilidade interna “pending questions”. |
| `pendingPostHumanLegalQuestions` | 145 | pública | Executa a responsabilidade interna “pending post human legal questions”. |
| `normalizeDocumentName` | 171 | interna | Executa a responsabilidade interna “normalize document name”. |
| `isGenericDocumentReference` | 173 | pública | Determina se generic document reference. |
| `reconcileDocuments` | 174 | pública | Executa a responsabilidade interna “reconcile documents”. |
| `clean` | 175 | interna | Executa a responsabilidade interna “clean”. |
| `classifyInssDemand` | 179 | pública | Executa a responsabilidade interna “classify inss demand”. |
| `registrationStatus` | 180 | pública | Executa a responsabilidade interna “registration status”. |
| `safeOcrUpdates` | 181 | pública | Executa a responsabilidade interna “safe ocr updates”. |
| `normalizeUf` | 182 | pública | Executa a responsabilidade interna “normalize uf”. |
| `resolveCityOrCep` | 183 | pública | Executa a responsabilidade interna “resolve city or cep”. |

## `src/domain/admin-assisted-media.js`

Regra de domínio: admin assisted media.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `normalizeCategoryText` | 17 | interna | Executa a responsabilidade interna “normalize category text”. |
| `resolveAdminDocumentStorageCategory` | 21 | pública | Executa a responsabilidade interna “resolve admin document storage category”. |
| `sanitizeMediaName` | 31 | pública | Executa a responsabilidade interna “sanitize media name”. |
| `mediaType` | 43 | pública | Executa a responsabilidade interna “media type”. |
| `mediaDescriptor` | 47 | pública | Executa a responsabilidade interna “media descriptor”. |
| `createAdminAssistedMediaStaging` | 58 | pública | Executa a responsabilidade interna “create admin assisted media staging”. |
| `stage` | 62 | interna | Executa a responsabilidade interna “stage”. |
| `promote` | 102 | interna | Executa a responsabilidade interna “promote”. |
| `review` | 123 | interna | Executa a responsabilidade interna “review”. |
| `list` | 137 | interna | Executa a responsabilidade interna “list”. |
| `processExistingCaseAdminMedia` | 144 | pública | Executa a responsabilidade interna “process existing case admin media”. |

## `src/domain/admin-assisted-questionnaire.js`

Regra de domínio: admin assisted questionnaire.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `criarQuestionarioAdminAssistido` | 31 | pública | Cria questionario admin assistido. |
| `criarQuestionarioCatalogadoAdminAssistido` | 43 | pública | Cria questionario catalogado admin assistido. |
| `respondido` | 56 | interna | Executa a responsabilidade interna “respondido”. |
| `proximaPerguntaAdminAssistido` | 65 | pública | Executa a responsabilidade interna “proxima pergunta admin assistido”. |

## `src/domain/admin-auth.js`

Regra de domínio: admin auth.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `configurarAdminAuth` | 18 | pública | Executa a responsabilidade interna “configurar admin auth”. |
| `ehWhatsAppAdmin` | 22 | pública | Determina se whats app admin. |
| `chaveAdminWhatsApp` | 28 | pública | Executa a responsabilidade interna “chave admin whats app”. |
| `logSegurancaAdmin` | 32 | pública | Executa a responsabilidade interna “log seguranca admin”. |
| `hashSenhaAdmin` | 38 | pública | Determina se existe h senha admin. |
| `compararTextoSeguro` | 42 | pública | Executa a responsabilidade interna “comparar texto seguro”. |
| `senhaAdminConfigurada` | 52 | pública | Executa a responsabilidade interna “senha admin configurada”. |
| `senhaAdminValida` | 56 | pública | Executa a responsabilidade interna “senha admin valida”. |
| `obterTentativaAdminWhatsApp` | 64 | pública | Obtém tentativa admin whats app. |
| `adminWhatsAppBloqueado` | 76 | pública | Executa a responsabilidade interna “admin whats app bloqueado”. |
| `registrarFalhaSenhaAdmin` | 81 | pública | Registra falha senha admin. |
| `adminWhatsAppAutenticado` | 97 | pública | Executa a responsabilidade interna “admin whats app autenticado”. |
| `telaSenhaAdminWhatsApp` | 110 | pública | Executa a responsabilidade interna “tela senha admin whats app”. |
| `autenticarAdminWhatsApp` | 129 | pública | Executa a responsabilidade interna “autenticar admin whats app”. |
| `bloquearAdminWhatsApp` | 137 | pública | Executa a responsabilidade interna “bloquear admin whats app”. |

## `src/domain/admin-case-operations.js`

Regra de domínio: admin case operations.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `normalizeSearch` | 29 | interna | Executa a responsabilidade interna “normalize search”. |
| `normalizeAdminField` | 33 | pública | Executa a responsabilidade interna “normalize admin field”. |
| `parseAdminScheduleDate` | 40 | pública | Executa a responsabilidade interna “parse admin schedule date”. |
| `maskName` | 55 | pública | Executa a responsabilidade interna “mask name”. |
| `maskLast4` | 59 | pública | Executa a responsabilidade interna “mask last4”. |
| `searchableCase` | 64 | interna | Executa a responsabilidade interna “searchable case”. |
| `searchAdminCases` | 77 | pública | Executa a responsabilidade interna “search admin cases”. |
| `buildCaseComplement` | 101 | pública | Executa a responsabilidade interna “build case complement”. |
| `applyComplementLocally` | 121 | pública | Executa a responsabilidade interna “apply complement locally”. |
| `scheduleAdminCase` | 127 | pública | Executa a responsabilidade interna “schedule admin case”. |

## `src/domain/admin-case-ui.js`

Regra de domínio: admin case ui.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `configurarAdminCaseUi` | 23 | pública | Executa a responsabilidade interna “configurar admin case ui”. |
| `idadeUltimaInteracaoAdmin` | 27 | pública | Executa a responsabilidade interna “idade ultima interacao admin”. |
| `minutosParaTexto` | 33 | pública | Executa a responsabilidade interna “minutos para texto”. |
| `labelIdadeAdmin` | 42 | pública | Executa a responsabilidade interna “label idade admin”. |
| `normalizarSemAcentoAdmin` | 47 | interna | Normaliza sem acento admin. |
| `abreviarAreaAdmin` | 54 | pública | Executa a responsabilidade interna “abreviar area admin”. |
| `nomeCurtoAdmin` | 67 | interna | Executa a responsabilidade interna “nome curto admin”. |
| `tituloCasoCurtoAdmin` | 74 | pública | Executa a responsabilidade interna “titulo caso curto admin”. |
| `resumoCasoAdmin` | 80 | pública | Executa a responsabilidade interna “resumo caso admin”. |
| `tituloOpcaoCasoAdmin` | 92 | pública | Executa a responsabilidade interna “titulo opcao caso admin”. |
| `opcoesAposAcaoCasoAdmin` | 102 | pública | Executa a responsabilidade interna “opcoes apos acao caso admin”. |

## `src/domain/admin-document-request-audio.js`

Regra de domínio: admin document request audio.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `enviarAudioPedidoDocumentos` | 2 | pública | Envia audio pedido documentos. |

## `src/domain/admin-hubspot-deal-mapper.js`

Regra de domínio: admin hubspot deal mapper.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `mapearNegociosHubSpotAdmin` | 2 | pública | Executa a responsabilidade interna “mapear negocios hub spot admin”. |

## `src/domain/admin-hubspot-search-response.js`

Regra de domínio: admin hubspot search response.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `inspecionarRespostaBuscaHubSpotAdmin` | 2 | pública | Executa a responsabilidade interna “inspecionar resposta busca hub spot admin”. |

## `src/domain/admin-item-merge.js`

Regra de domínio: admin item merge.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `mesclarItemAdminHubspotComMemoria` | 2 | pública | Executa a responsabilidade interna “mesclar item admin hubspot com memoria”. |
| `telefoneIdentidadeAdmin` | 61 | interna | Executa a responsabilidade interna “telefone identidade admin”. |
| `contarPorTelefone` | 68 | interna | Executa a responsabilidade interna “contar por telefone”. |
| `negocioIdAdmin` | 77 | interna | Executa a responsabilidade interna “negocio id admin”. |
| `contarPorNegocioId` | 81 | interna | Executa a responsabilidade interna “contar por negocio id”. |
| `mesclarItensAdminPorIdentidade` | 90 | pública | Executa a responsabilidade interna “mesclar itens admin por identidade”. |

## `src/domain/admin-legal-dossier-ui.js`

Regra de domínio: admin legal dossier ui.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `normalizarArray` | 7 | interna | Normaliza array. |
| `texto` | 11 | interna | Executa a responsabilidade interna “texto”. |
| `primeiroObjeto` | 16 | interna | Executa a responsabilidade interna “primeiro objeto”. |
| `obterDocumentRegistryCaso` | 20 | pública | Obtém document registry caso. |
| `documentRegistryTemDocumentosProcessados` | 35 | pública | Executa a responsabilidade interna “document registry tem documentos processados”. |
| `obterClienteCaso` | 43 | interna | Obtém cliente caso. |
| `obterNegocioCaso` | 54 | interna | Obtém negocio caso. |
| `formatarDivergencia` | 66 | interna | Formata divergencia. |
| `formatarPdf` | 75 | interna | Formata pdf. |
| `formatarListaCurta` | 81 | interna | Formata lista curta. |
| `formatarCopiloto` | 87 | interna | Formata copiloto. |
| `montarResumoDossieJuridicoWhatsApp` | 100 | pública | Monta resumo dossie juridico whats app. |
| `montarDossieJuridicoAdminWhatsApp` | 143 | pública | Monta dossie juridico admin whats app. |

## `src/domain/admin-name-resolver.js`

Regra de domínio: admin name resolver.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `sanitizarNomeExibicao` | 2 | pública | Sanitiza nome exibicao. |
| `validarNomePerfilWhatsApp` | 13 | pública | Valida nome perfil whats app. |
| `montarNomeCompletoHubSpot` | 20 | pública | Monta nome completo hub spot. |
| `resolverNomeUnificado` | 30 | pública | Resolve nome unificado. |
| `resolverNomeParaAdmin` | 60 | pública | Resolve nome para admin. |
| `resolverNomeParaUsuario` | 65 | pública | Resolve nome para usuario. |
| `primeiroEUltimoNome` | 71 | pública | Executa a responsabilidade interna “primeiro eultimo nome”. |

## `src/domain/admin-post-human-complementation.js`

Regra de domínio: admin post human complementation.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `actionTtlMs` | 11 | interna | Executa a responsabilidade interna “action ttl ms”. |
| `actionMaxContexts` | 12 | interna | Executa a responsabilidade interna “action max contexts”. |
| `normalizeAdminId` | 13 | pública | Executa a responsabilidade interna “normalize admin id”. |
| `normalizeCaseNumber` | 14 | pública | Executa a responsabilidade interna “normalize case number”. |
| `normalizePhone` | 15 | interna | Executa a responsabilidade interna “normalize phone”. |
| `configuredPilotCases` | 20 | pública | Executa a responsabilidade interna “configured pilot cases”. |
| `getAllowedPilotCases` | 30 | pública | Executa a responsabilidade interna “get allowed pilot cases”. |
| `isPilotCaseAllowed` | 35 | pública | Determina se pilot case allowed. |
| `repositoryFor` | 36 | interna | Executa a responsabilidade interna “repository for”. |
| `pruneActionContexts` | 41 | pública | Executa a responsabilidade interna “prune action contexts”. |
| `safeLog` | 46 | interna | Executa a responsabilidade interna “safe log”. |
| `tokenFromInteraction` | 49 | interna | Executa a responsabilidade interna “token from interaction”. |
| `waitForActionContextButton` | 50 | pública | Executa a responsabilidade interna “wait for action context button”. |
| `montarBotaoAtendimentoRealizado` | 55 | pública | Monta botao atendimento realizado. |
| `handleAtendimentoRealizadoConfirmation` | 77 | pública | Executa a responsabilidade interna “handle atendimento realizado confirmation”. |

## `src/domain/admin-summary-ui.js`

Regra de domínio: admin summary ui.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `checklistProducaoAdmin` | 1 | pública | Executa a responsabilidade interna “checklist producao admin”. |
| `normalizarSemAcentoAdmin` | 11 | interna | Normaliza sem acento admin. |
| `abreviarAreaResumoAdmin` | 18 | interna | Executa a responsabilidade interna “abreviar area resumo admin”. |
| `nomeCurtoResumoAdmin` | 31 | interna | Executa a responsabilidade interna “nome curto resumo admin”. |
| `tituloCasoResumoAdmin` | 38 | interna | Executa a responsabilidade interna “titulo caso resumo admin”. |
| `textoResumoDiarioOperacional` | 42 | pública | Executa a responsabilidade interna “texto resumo diario operacional”. |
| `linhaBriefing` | 44 | interna | Executa a responsabilidade interna “linha briefing”. |
| `linhaAlerta` | 50 | interna | Executa a responsabilidade interna “linha alerta”. |
| `linhaAcao` | 55 | interna | Executa a responsabilidade interna “linha acao”. |

## `src/domain/admin-urgency.js`

Regra de domínio: admin urgency.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `normalizarUrgenciaHubSpotAdmin` | 6 | pública | Normaliza urgencia hub spot admin. |
| `resolverUrgenciaAdmin` | 15 | pública | Resolve urgencia admin. |
| `persistirUrgenciaAltaAdmin` | 23 | pública | Persiste urgencia alta admin. |

## `src/domain/area-audio-classifier.js`

Regra de domínio: area audio classifier.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `classificarAreaAudio` | 7 | pública | Classifica area audio. |

## `src/domain/assemblyai-transcription.js`

Regra de domínio: assemblyai transcription.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `transcrever` | 5 | pública | Executa a responsabilidade interna “transcrever”. |

## `src/domain/audio-legal-ai.js`

Regra de domínio: audio legal ai.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `classificarResumoOutro` | 15 | pública | Classifica resumo outro. |
| `aplicarClassificacaoJuridica` | 45 | pública | Aplica classificacao juridica. |
| `classificacaoEhFraca` | 64 | pública | Executa a responsabilidade interna “classificacao eh fraca”. |
| `gerarPerguntaEsclarecimentoRelato` | 90 | pública | Gera pergunta esclarecimento relato. |
| `acumularRelato` | 102 | pública | Executa a responsabilidade interna “acumular relato”. |
| `deveEsclarecerRelato` | 111 | pública | Executa a responsabilidade interna “deve esclarecer relato”. |
| `aplicarSugestaoFluxoOutro` | 119 | pública | Aplica sugestao fluxo outro. |
| `classificarAcaoAudioFluxo` | 139 | pública | Classifica acao audio fluxo. |
| `fallback` | 141 | interna | Executa a responsabilidade interna “fallback”. |
| `extrairNomeAudio` | 178 | pública | Executa a responsabilidade interna “extrair nome audio”. |
| `extrairCidadeAudio` | 206 | pública | Executa a responsabilidade interna “extrair cidade audio”. |
| `extrairCampoCorrecaoIA` | 255 | pública | Executa a responsabilidade interna “extrair campo correcao ia”. |
| `consolidarDescricaoCorrecaoIA` | 294 | pública | Executa a responsabilidade interna “consolidar descricao correcao ia”. |
| `gerarResumoDescricaoConfirmacao` | 354 | pública | Gera resumo descricao confirmacao. |

## `src/domain/audio-url-security.js`

Regra de domínio: audio url security.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `obterSegredoAudio` | 7 | pública | Obtém segredo audio. |
| `caminhoAudioSeguro` | 16 | pública | Executa a responsabilidade interna “caminho audio seguro”. |
| `assinaturaAudio` | 22 | interna | Executa a responsabilidade interna “assinatura audio”. |
| `criarCaminhoAudioAssinado` | 29 | pública | Cria caminho audio assinado. |
| `compararSeguro` | 44 | interna | Executa a responsabilidade interna “comparar seguro”. |
| `validarUrlAudioAssinada` | 50 | pública | Valida url audio assinada. |

## `src/domain/audio/audio-intake-pipeline-router.js`

Regra de domínio: audio intake pipeline router.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `handleAudioIntake` | 1 | pública | Executa a responsabilidade interna “handle audio intake”. |

## `src/domain/automation-pilot.js`

Regra de domínio: automation pilot.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `normalize` | 2 | interna | Executa a responsabilidade interna “normalize”. |
| `normalizePhone` | 6 | interna | Executa a responsabilidade interna “normalize phone”. |
| `values` | 10 | interna | Executa a responsabilidade interna “values”. |
| `automationPilotConfig` | 14 | pública | Executa a responsabilidade interna “automation pilot config”. |
| `automationTargetAllowed` | 23 | pública | Executa a responsabilidade interna “automation target allowed”. |

## `src/domain/bpc-legal-facts.js`

Regra de domínio: bpc legal facts.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `plain` | 27 | interna | Executa a responsabilidade interna “plain”. |
| `present` | 32 | interna | Executa a responsabilidade interna “present”. |
| `equivalent` | 39 | interna | Executa a responsabilidade interna “equivalent”. |
| `answer` | 46 | interna | Executa a responsabilidade interna “answer”. |
| `addFact` | 50 | interna | Executa a responsabilidade interna “add fact”. |
| `isBpcCase` | 55 | pública | Determina se bpc case. |
| `memberFieldId` | 66 | pública | Executa a responsabilidade interna “member field id”. |
| `memberIdFromField` | 70 | pública | Executa a responsabilidade interna “member id from field”. |
| `isBpcLegalField` | 76 | pública | Determina se bpc legal field. |
| `normalizeMoney` | 80 | interna | Executa a responsabilidade interna “normalize money”. |
| `makeMember` | 87 | interna | Executa a responsabilidade interna “make member”. |
| `cloneFamily` | 103 | interna | Executa a responsabilidade interna “clone family”. |
| `upsertMember` | 114 | interna | Executa a responsabilidade interna “upsert member”. |
| `setIncome` | 134 | interna | Executa a responsabilidade interna “set income”. |
| `setBenefit` | 141 | interna | Executa a responsabilidade interna “set benefit”. |
| `inferSubtype` | 148 | interna | Executa a responsabilidade interna “infer subtype”. |
| `ensureApplicant` | 158 | interna | Executa a responsabilidade interna “ensure applicant”. |
| `addCountedMembers` | 167 | interna | Executa a responsabilidade interna “add counted members”. |
| `familyClauses` | 208 | interna | Executa a responsabilidade interna “family clauses”. |
| `residenceFromClause` | 212 | interna | Executa a responsabilidade interna “residence from clause”. |
| `roleDefinitionsInClause` | 218 | interna | Executa a responsabilidade interna “role definitions in clause”. |
| `addPendingFamilyFact` | 230 | interna | Executa a responsabilidade interna “add pending family fact”. |
| `extractFamily` | 238 | interna | Executa a responsabilidade interna “extract family”. |
| `findMemberForReference` | 327 | interna | Executa a responsabilidade interna “find member for reference”. |
| `applyWorkAndIncome` | 351 | interna | Executa a responsabilidade interna “apply work and income”. |
| `extractExpenses` | 400 | interna | Executa a responsabilidade interna “extract expenses”. |
| `extractCadUnico` | 418 | interna | Executa a responsabilidade interna “extract cad unico”. |
| `extractAdministrativeStatus` | 430 | interna | Executa a responsabilidade interna “extract administrative status”. |
| `extractBpcLegalFacts` | 441 | pública | Executa a responsabilidade interna “extract bpc legal facts”. |
| `trustedBpcDocumentFacts` | 514 | pública | Executa a responsabilidade interna “trusted bpc document facts”. |
| `mergeBpcFacts` | 525 | pública | Executa a responsabilidade interna “merge bpc facts”. |
| `memberNeedsDetails` | 547 | pública | Executa a responsabilidade interna “member needs details”. |
| `nextFamilyMember` | 556 | pública | Executa a responsabilidade interna “next family member”. |
| `inferCorrectionMember` | 561 | interna | Executa a responsabilidade interna “infer correction member”. |
| `buildBpcLegalAnswerResult` | 566 | pública | Executa a responsabilidade interna “build bpc legal answer result”. |

## `src/domain/calendar-format.js`

Regra de domínio: calendar format.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `numeroPorExtenso` | 1 | pública | Executa a responsabilidade interna “numero por extenso”. |
| `partesDataLocal` | 11 | interna | Executa a responsabilidade interna “partes data local”. |
| `formatarSlot` | 26 | pública | Formata slot. |
| `horaPorExtensoAudio` | 39 | pública | Executa a responsabilidade interna “hora por extenso audio”. |
| `formatarSlotAudio` | 73 | pública | Formata slot audio. |

## `src/domain/calendar-scheduling.js`

Regra de domínio: calendar scheduling.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `appendConsultaEvent` | 7 | interna | Executa a responsabilidade interna “append consulta event”. |
| `configurarConsultaEventSink` | 9 | pública | Executa a responsabilidade interna “configurar consulta event sink”. |
| `horarioAindaPodeSerAgendado` | 23 | interna | Executa a responsabilidade interna “horario ainda pode ser agendado”. |
| `partesNoFuso` | 31 | interna | Executa a responsabilidade interna “partes no fuso”. |
| `horarioDentroDoExpediente` | 42 | pública | Executa a responsabilidade interna “horario dentro do expediente”. |
| `removerSlotsDuplicados` | 61 | pública | Remove slots duplicados. |
| `getCalendar` | 71 | interna | Executa a responsabilidade interna “get calendar”. |
| `buscarHorariosDisponiveis` | 83 | pública | Busca horarios disponiveis. |
| `registrarHistoricoAgendamento` | 143 | interna | Registra historico agendamento. |
| `criarEventoConsulta` | 176 | pública | Cria evento consulta. |
| `classificarEstadoEvento` | 292 | pública | Classifica estado evento. |
| `obterEstadoEventoConsulta` | 328 | pública | Obtém estado evento consulta. |
| `buscarEventoConsultaPorDeal` | 344 | pública | Busca evento consulta por deal. |
| `listarEventosConsultaPorDeal` | 349 | pública | Lista eventos consulta por deal. |
| `cancelarEventosAtivosDoDeal` | 363 | pública | Cancela eventos ativos do deal. |
| `selecionarEventoConsultaMaisRecente` | 382 | pública | Executa a responsabilidade interna “selecionar evento consulta mais recente”. |
| `listarEventosConsultaAtivos` | 394 | pública | Lista eventos consulta ativos. |
| `listarTodosEventosConsulta` | 409 | pública | Lista todos eventos consulta. |
| `buscarPrimeiroEventoCalendarNoIntervalo` | 432 | pública | Busca primeiro evento calendar no intervalo. |
| `obterEstadoConsulta` | 444 | pública | Obtém estado consulta. |
| `definirResultadoConsulta` | 457 | pública | Executa a responsabilidade interna “definir resultado consulta”. |
| `vincularEventoConsulta` | 482 | pública | Executa a responsabilidade interna “vincular evento consulta”. |

## `src/domain/callback-idempotency.js`

Regra de domínio: callback idempotency.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `retentionMs` | 12 | interna | Executa a responsabilidade interna “retention ms”. |
| `processingTtlMs` | 17 | interna | Executa a responsabilidade interna “processing ttl ms”. |
| `emptyStore` | 22 | interna | Executa a responsabilidade interna “empty store”. |
| `stableValue` | 30 | interna | Executa a responsabilidade interna “stable value”. |
| `createCallbackKey` | 41 | pública | Executa a responsabilidade interna “create callback key”. |
| `writeJsonAtomic` | 50 | interna | Executa a responsabilidade interna “write json atomic”. |
| `readStore` | 72 | interna | Executa a responsabilidade interna “read store”. |
| `removeExpired` | 85 | interna | Executa a responsabilidade interna “remove expired”. |
| `recoverAbandonedProcessing` | 96 | interna | Executa a responsabilidade interna “recover abandoned processing”. |
| `recoverCallbackIdempotencyAbandonedProcessing` | 110 | pública | Executa a responsabilidade interna “recover callback idempotency abandoned processing”. |
| `beginCallbackExecution` | 121 | pública | Executa a responsabilidade interna “begin callback execution”. |
| `completeCallbackExecution` | 150 | pública | Executa a responsabilidade interna “complete callback execution”. |
| `abandonCallbackExecution` | 165 | pública | Executa a responsabilidade interna “abandon callback execution”. |

## `src/domain/canonical-case-executor.js`

Regra de domínio: canonical case executor.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `createCheckpoint` | 24 | pública | Executa a responsabilidade interna “create checkpoint”. |
| `projectScalarFields` | 46 | interna | Executa a responsabilidade interna “project scalar fields”. |
| `projectList` | 56 | interna | Executa a responsabilidade interna “project list”. |
| `projectStepResult` | 61 | interna | Executa a responsabilidade interna “project step result”. |
| `projectCanonicalCheckpointForPersistence` | 78 | pública | Executa a responsabilidade interna “project canonical checkpoint for persistence”. |
| `createCanonicalCaseExecutor` | 97 | pública | Executa a responsabilidade interna “create canonical case executor”. |
| `execute` | 100 | interna | Executa a responsabilidade interna “execute”. |
| `buildPersistedCheckpoint` | 140 | interna | Executa a responsabilidade interna “build persisted checkpoint”. |

## `src/domain/canonical-case-plan.js`

Regra de domínio: canonical case plan.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `clean` | 10 | interna | Executa a responsabilidade interna “clean”. |
| `unique` | 14 | interna | Executa a responsabilidade interna “unique”. |
| `stable` | 18 | interna | Executa a responsabilidade interna “stable”. |
| `planHash` | 24 | pública | Executa a responsabilidade interna “plan hash”. |
| `normalizeDocument` | 32 | interna | Executa a responsabilidade interna “normalize document”. |
| `deriveBlockers` | 49 | interna | Executa a responsabilidade interna “derive blockers”. |
| `createCanonicalCasePlan` | 68 | pública | Executa a responsabilidade interna “create canonical case plan”. |
| `validateCanonicalCasePlan` | 144 | pública | Executa a responsabilidade interna “validate canonical case plan”. |
| `assertCanonicalCasePlanReady` | 162 | pública | Executa a responsabilidade interna “assert canonical case plan ready”. |

## `src/domain/canonical-case.js`

Regra de domínio: canonical case.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `first` | 5 | interna | Executa a responsabilidade interna “first”. |
| `clean` | 7 | interna | Executa a responsabilidade interna “clean”. |
| `compact` | 8 | interna | Executa a responsabilidade interna “compact”. |
| `canonicalCaseFromAnalysis` | 12 | pública | Executa a responsabilidade interna “canonical case from analysis”. |
| `canonicalCaseToHubSpot` | 76 | pública | Executa a responsabilidade interna “canonical case to hub spot”. |
| `mergeNonEmpty` | 104 | pública | Executa a responsabilidade interna “merge non empty”. |

## `src/domain/case-number-plan-sync.js`

Regra de domínio: case number plan sync.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `fingerprint` | 9 | pública | Executa a responsabilidade interna “fingerprint”. |
| `validatePlanForCaseNumberSync` | 13 | pública | Executa a responsabilidade interna “validate plan for case number sync”. |
| `validateReservationForPlan` | 31 | pública | Executa a responsabilidade interna “validate reservation for plan”. |
| `applyCaseNumberReservationToPlan` | 44 | pública | Executa a responsabilidade interna “apply case number reservation to plan”. |

## `src/domain/case-number.js`

Regra de domínio: case number.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `normalizeArea` | 5 | pública | Executa a responsabilidade interna “normalize area”. |
| `resolvePrefix` | 9 | pública | Executa a responsabilidade interna “resolve prefix”. |
| `validateFormat` | 25 | pública | Executa a responsabilidade interna “validate format”. |
| `formatExample` | 30 | pública | Executa a responsabilidade interna “format example”. |
| `generateCandidate` | 34 | pública | Executa a responsabilidade interna “generate candidate”. |
| `p` | 37 | interna | Executa a responsabilidade interna “p”. |
| `createService` | 48 | pública | Executa a responsabilidade interna “create service”. |
| `findByKey` | 51 | interna | Executa a responsabilidade interna “find by key”. |
| `findByNumber` | 55 | interna | Executa a responsabilidade interna “find by number”. |
| `reserve` | 59 | interna | Executa a responsabilidade interna “reserve”. |
| `release` | 81 | interna | Executa a responsabilidade interna “release”. |
| `defaultDataDir` | 91 | interna | Executa a responsabilidade interna “default data dir”. |
| `localReservationsFile` | 94 | interna | Executa a responsabilidade interna “local reservations file”. |
| `localRead` | 98 | interna | Executa a responsabilidade interna “local read”. |
| `localWrite` | 104 | interna | Executa a responsabilidade interna “local write”. |
| `createLocalAdapter` | 112 | pública | Executa a responsabilidade interna “create local adapter”. |
| `createPostgresAdapter` | 155 | pública | Executa a responsabilidade interna “create postgres adapter”. |

## `src/domain/case-reconciler.js`

Regra de domínio: case reconciler.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `key` | 1 | interna | Executa a responsabilidade interna “key”. |
| `indexBy` | 4 | interna | Executa a responsabilidade interna “index by”. |
| `reconcileCaseState` | 15 | pública | Executa a responsabilidade interna “reconcile case state”. |

## `src/domain/client-appointment-ui.js`

Regra de domínio: client appointment ui.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `telaConsultaAdvogado` | 2 | pública | Executa a responsabilidade interna “tela consulta advogado”. |
| `telaBuscandoHorarios` | 16 | pública | Executa a responsabilidade interna “tela buscando horarios”. |
| `telaConsultaSemHorarios` | 26 | pública | Executa a responsabilidade interna “tela consulta sem horarios”. |
| `telaHorariosConsulta` | 39 | pública | Executa a responsabilidade interna “tela horarios consulta”. |
| `telaDuracaoConsulta` | 65 | pública | Executa a responsabilidade interna “tela duracao consulta”. |
| `telaConfirmacaoConsulta` | 81 | pública | Executa a responsabilidade interna “tela confirmacao consulta”. |
| `telaFalhaAgendamento` | 107 | pública | Executa a responsabilidade interna “tela falha agendamento”. |
| `telaAgendamentoConfirmado` | 121 | pública | Executa a responsabilidade interna “tela agendamento confirmado”. |
| `telaConfirmarCancelamentoConsulta` | 147 | pública | Executa a responsabilidade interna “tela confirmar cancelamento consulta”. |
| `telaCancelamentoIndisponivel` | 160 | pública | Executa a responsabilidade interna “tela cancelamento indisponivel”. |
| `telaConsultaCancelada` | 173 | pública | Executa a responsabilidade interna “tela consulta cancelada”. |
| `telaFalhaCancelamentoConsulta` | 193 | pública | Executa a responsabilidade interna “tela falha cancelamento consulta”. |

## `src/domain/client-intent-detector.js`

Regra de domínio: client intent detector.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `detectarIntencaoCliente` | 2 | pública | Detecta intencao cliente. |
| `pareceDuvidaCasoAtualOuNovo` | 18 | pública | Executa a responsabilidade interna “parece duvida caso atual ou novo”. |
| `pareceNovaSituacaoCliente` | 27 | pública | Executa a responsabilidade interna “parece nova situacao cliente”. |

## `src/domain/client-menu-ui.js`

Regra de domínio: client menu ui.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `configurarClientMenuUi` | 6 | pública | Executa a responsabilidade interna “configurar client menu ui”. |
| `requireDep` | 10 | interna | Executa a responsabilidade interna “require dep”. |
| `iconeAreaJuridica` | 16 | pública | Executa a responsabilidade interna “icone area juridica”. |
| `cabecalhoCasoAtivo` | 28 | pública | Executa a responsabilidade interna “cabecalho caso ativo”. |
| `numeroParaIcone` | 34 | pública | Executa a responsabilidade interna “numero para icone”. |
| `formatarDataBR` | 39 | pública | Formata data br. |
| `textoAudioCasosCliente` | 46 | pública | Executa a responsabilidade interna “texto audio casos cliente”. |
| `textoAudioResumoCasosCliente` | 53 | pública | Executa a responsabilidade interna “texto audio resumo casos cliente”. |
| `deveMostrarBoasVindasMenuCliente` | 59 | pública | Executa a responsabilidade interna “deve mostrar boas vindas menu cliente”. |
| `textoAudioSelecaoCaso` | 64 | pública | Executa a responsabilidade interna “texto audio selecao caso”. |
| `resumoCasoMenuCliente` | 72 | pública | Executa a responsabilidade interna “resumo caso menu cliente”. |
| `montarCasosMenuCliente` | 111 | pública | Monta casos menu cliente. |
| `montarPainelCasosCliente` | 142 | pública | Monta painel casos cliente. |
| `menuCliente` | 175 | pública | Executa a responsabilidade interna “menu cliente”. |

## `src/domain/client-message-builders.js`

Regra de domínio: client message builders.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `telaAudioClienteCasoAtualOuNovo` | 2 | pública | Executa a responsabilidade interna “tela audio cliente caso atual ou novo”. |
| `telaClienteCasoAtualOuNovo` | 14 | pública | Executa a responsabilidade interna “tela cliente caso atual ou novo”. |
| `telaAudioNoFluxo` | 27 | pública | Executa a responsabilidade interna “tela audio no fluxo”. |
| `gerarFallbackEmpatico` | 39 | pública | Gera fallback empatico. |

## `src/domain/client-mode-ui.js`

Regra de domínio: client mode ui.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `telaModoAtendimento` | 5 | pública | Executa a responsabilidade interna “tela modo atendimento”. |

## `src/domain/client-navigation-router.js`

Regra de domínio: client navigation router.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `criarClientNavigationRouter` | 1 | pública | Cria client navigation router. |

## `src/domain/client/client-flow-callback-router.js`

Regra de domínio: client flow callback router.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `ehCallbackFluxoCliente` | 4 | pública | Determina se callback fluxo cliente. |
| `alinharEtapaAoCallbackCliente` | 9 | pública | Executa a responsabilidade interna “alinhar etapa ao callback cliente”. |

## `src/domain/client/client-intake-decision-router.js`

Regra de domínio: client intake decision router.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `routeClientIntake` | 9 | pública | Executa a responsabilidade interna “route client intake”. |

## `src/domain/client/client-post-intake-decision-router.js`

Regra de domínio: client post intake decision router.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `atomicResult` | 118 | interna | Executa a responsabilidade interna “atomic result”. |
| `routeRevalidation` | 126 | interna | Executa a responsabilidade interna “route revalidation”. |
| `routeThirdParty` | 145 | interna | Executa a responsabilidade interna “route third party”. |
| `routeOnboarding` | 162 | interna | Executa a responsabilidade interna “route onboarding”. |
| `routeClientPostIntake` | 176 | pública | Executa a responsabilidade interna “route client post intake”. |

## `src/domain/client/handlers/confirm-entry-invalid-retry.handler.js`

Regra de domínio: confirm entry invalid retry handler.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `handle` | 1 | pública | Executa a responsabilidade interna “handle”. |

## `src/domain/client/handlers/revalidate-city-confirm.handler.js`

Regra de domínio: revalidate city confirm handler.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `handle` | 1 | pública | Executa a responsabilidade interna “handle”. |

## `src/domain/client/handlers/revalidate-city-select.handler.js`

Regra de domínio: revalidate city select handler.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `handle` | 1 | pública | Executa a responsabilidade interna “handle”. |

## `src/domain/client/handlers/revalidate-name-confirm.handler.js`

Regra de domínio: revalidate name confirm handler.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `handle` | 1 | pública | Executa a responsabilidade interna “handle”. |

## `src/domain/client/handlers/revalidate-name-correct-text.handler.js`

Regra de domínio: revalidate name correct text handler.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `handle` | 1 | pública | Executa a responsabilidade interna “handle”. |

## `src/domain/client/handlers/revalidate-phone-confirm.handler.js`

Regra de domínio: revalidate phone confirm handler.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `handle` | 1 | pública | Executa a responsabilidade interna “handle”. |

## `src/domain/client/handlers/revalidate-phone-correct-text.handler.js`

Regra de domínio: revalidate phone correct text handler.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `handle` | 1 | pública | Executa a responsabilidade interna “handle”. |

## `src/domain/cliente-status-ui.js`

Regra de domínio: cliente status ui.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `opcoesStatusCliente` | 13 | pública | Executa a responsabilidade interna “opcoes status cliente”. |
| `montarBarraStatusCliente` | 55 | pública | Monta barra status cliente. |
| `montarBlocoAgendamentoStatus` | 116 | pública | Monta bloco agendamento status. |
| `montarBlocoDocumentosStatus` | 138 | pública | Monta bloco documentos status. |
| `montarTextoStatusCliente` | 149 | pública | Monta texto status cliente. |
| `montarAudioStatusCliente` | 170 | pública | Monta audio status cliente. |

## `src/domain/communication-preferences.js`

Regra de domínio: communication preferences.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `clean` | 9 | interna | Executa a responsabilidade interna “clean”. |
| `normalizePhone` | 11 | interna | Executa a responsabilidade interna “normalize phone”. |
| `normalizePreference` | 12 | interna | Executa a responsabilidade interna “normalize preference”. |
| `normalizeSource` | 13 | interna | Executa a responsabilidade interna “normalize source”. |
| `normalizeRecord` | 14 | pública | Executa a responsabilidade interna “normalize record”. |
| `legacyPreference` | 25 | pública | Executa a responsabilidade interna “legacy preference”. |
| `projectLegacyMode` | 29 | pública | Executa a responsabilidade interna “project legacy mode”. |
| `createCommunicationPreferences` | 35 | pública | Executa a responsabilidade interna “create communication preferences”. |
| `normalizeState` | 39 | interna | Executa a responsabilidade interna “normalize state”. |
| `persist` | 52 | interna | Executa a responsabilidade interna “persist”. |
| `load` | 58 | interna | Executa a responsabilidade interna “load”. |
| `resolve` | 64 | interna | Executa a responsabilidade interna “resolve”. |
| `set` | 72 | interna | Executa a responsabilidade interna “set”. |
| `promote` | 91 | interna | Executa a responsabilidade interna “promote”. |
| `applyPreferenceToUser` | 105 | pública | Executa a responsabilidade interna “apply preference to user”. |

## `src/domain/consultation-events.js`

Regra de domínio: consultation events.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `sleep` | 25 | interna | Executa a responsabilidade interna “sleep”. |
| `adquirirLock` | 29 | interna | Executa a responsabilidade interna “adquirir lock”. |
| `lerEventos` | 42 | interna | Executa a responsabilidade interna “ler eventos”. |
| `calcularHashEvento` | 71 | pública | Calcula hash evento. |
| `normalizarMetadata` | 76 | pública | Normaliza metadata. |
| `criarChaveEvento` | 93 | interna | Cria chave evento. |
| `appendConsultaEvent` | 104 | pública | Executa a responsabilidade interna “append consulta event”. |
| `ordenarEventos` | 161 | interna | Executa a responsabilidade interna “ordenar eventos”. |
| `getConsultaHistory` | 168 | pública | Executa a responsabilidade interna “get consulta history”. |
| `getConsultaTimeline` | 174 | pública | Executa a responsabilidade interna “get consulta timeline”. |

## `src/domain/consultation-guards.js`

Regra de domínio: consultation guards.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `enforcementMode` | 4 | interna | Executa a responsabilidade interna “enforcement mode”. |
| `withConsultaReadAccess` | 13 | pública | Executa a responsabilidade interna “with consulta read access”. |
| `assertConsultaReadAccess` | 17 | pública | Executa a responsabilidade interna “assert consulta read access”. |
| `validarStack` | 32 | interna | Valida stack. |
| `forbidDirectCalendarUsage` | 37 | pública | Executa a responsabilidade interna “forbid direct calendar usage”. |
| `forbidDirectEventStoreUsage` | 42 | pública | Executa a responsabilidade interna “forbid direct event store usage”. |

## `src/domain/consultation-metrics.js`

Regra de domínio: consultation metrics.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `calcularMetricasConsulta` | 6 | pública | Calcula metricas consulta. |
| `persistirMetricasConsulta` | 27 | pública | Persiste metricas consulta. |

## `src/domain/consultation-read-model.js`

Regra de domínio: consultation read model.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `appendVersionedConsultaEvent` | 20 | pública | Executa a responsabilidade interna “append versioned consulta event”. |
| `eventoAtualResumo` | 23 | interna | Executa a responsabilidade interna “evento atual resumo”. |
| `resumirTimeline` | 41 | interna | Executa a responsabilidade interna “resumir timeline”. |
| `derivarStatusAtual` | 54 | pública | Executa a responsabilidade interna “derivar status atual”. |
| `montarConsultaView` | 74 | pública | Monta consulta view. |
| `getConsultaView` | 121 | pública | Executa a responsabilidade interna “get consulta view”. |
| `listConsultasAtivasViews` | 133 | pública | Executa a responsabilidade interna “list consultas ativas views”. |
| `getConsultaCalendarEventState` | 144 | pública | Executa a responsabilidade interna “get consulta calendar event state”. |
| `findConsultaCalendarEvent` | 148 | pública | Executa a responsabilidade interna “find consulta calendar event”. |
| `listConsultaCalendarEventsForReconciliation` | 152 | pública | Executa a responsabilidade interna “list consulta calendar events for reconciliation”. |
| `findConsultaCalendarEventInRange` | 156 | pública | Executa a responsabilidade interna “find consulta calendar event in range”. |

## `src/domain/consultation-reminder-contact-resolver.js`

Regra de domínio: consultation reminder contact resolver.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `httpStatus` | 2 | pública | Executa a responsabilidade interna “http status”. |
| `controlledFailure` | 6 | interna | Executa a responsabilidade interna “controlled failure”. |
| `resolveConsultationReminderContact` | 17 | pública | Executa a responsabilidade interna “resolve consultation reminder contact”. |

## `src/domain/consultation/consultation-audit-verifier.js`

Regra de domínio: consultation audit verifier.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `sha256` | 3 | pública | Executa a responsabilidade interna “sha256”. |
| `hashWithout` | 9 | pública | Determina se existe h without. |
| `verifyEventChain` | 15 | pública | Executa a responsabilidade interna “verify event chain”. |
| `verifyDecisionChain` | 29 | pública | Executa a responsabilidade interna “verify decision chain”. |
| `verifyTemporalConsistency` | 41 | pública | Executa a responsabilidade interna “verify temporal consistency”. |
| `valid` | 43 | interna | Executa a responsabilidade interna “valid”. |
| `buildDossierProof` | 50 | pública | Executa a responsabilidade interna “build dossier proof”. |
| `verifyConsultaLegalDossier` | 68 | pública | Executa a responsabilidade interna “verify consulta legal dossier”. |

## `src/domain/consultation/consultation-change-control.js`

Regra de domínio: consultation change control.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `canonicalize` | 2 | pública | Executa a responsabilidade interna “canonicalize”. |
| `manifestStructuralPayload` | 11 | pública | Executa a responsabilidade interna “manifest structural payload”. |
| `manifestStructuralDigest` | 16 | pública | Executa a responsabilidade interna “manifest structural digest”. |
| `domainVersionPayload` | 23 | pública | Executa a responsabilidade interna “domain version payload”. |
| `domainVersionSeal` | 33 | pública | Executa a responsabilidade interna “domain version seal”. |
| `assertDomainVersionSeal` | 47 | pública | Executa a responsabilidade interna “assert domain version seal”. |
| `assertExplicitApproval` | 60 | pública | Executa a responsabilidade interna “assert explicit approval”. |
| `assertManifestStructure` | 83 | pública | Executa a responsabilidade interna “assert manifest structure”. |
| `enforceConsultationChangeControl` | 109 | pública | Executa a responsabilidade interna “enforce consultation change control”. |

## `src/domain/consultation/consultation-decision-audit.js`

Regra de domínio: consultation decision audit.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `decisionHash` | 8 | pública | Executa a responsabilidade interna “decision hash”. |
| `readConsultaDecisions` | 13 | pública | Executa a responsabilidade interna “read consulta decisions”. |
| `appendConsultaDecision` | 31 | pública | Executa a responsabilidade interna “append consulta decision”. |

## `src/domain/consultation/consultation-dependency-firewall.js`

Regra de domínio: consultation dependency firewall.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `firewallMode` | 6 | interna | Executa a responsabilidade interna “firewall mode”. |
| `protectedModule` | 17 | pública | Executa a responsabilidade interna “protected module”. |
| `isFacade` | 41 | interna | Determina se facade. |
| `internalAccessAllowed` | 46 | pública | Executa a responsabilidade interna “internal access allowed”. |
| `violation` | 58 | interna | Executa a responsabilidade interna “violation”. |
| `installConsultationDependencyFirewall` | 68 | pública | Executa a responsabilidade interna “install consultation dependency firewall”. |

## `src/domain/consultation/consultation-integrity-check.js`

Regra de domínio: consultation integrity check.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `fileChecksum` | 10 | pública | Executa a responsabilidade interna “file checksum”. |
| `loadConsultationManifest` | 14 | pública | Executa a responsabilidade interna “load consultation manifest”. |
| `assertPathInsideRoot` | 18 | pública | Executa a responsabilidade interna “assert path inside root”. |
| `checkConsultationIntegrity` | 29 | pública | Executa a responsabilidade interna “check consultation integrity”. |

## `src/domain/consultation/consultation-legal-dossier-builder.js`

Regra de domínio: consultation legal dossier builder.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `buildDossierSummary` | 8 | pública | Executa a responsabilidade interna “build dossier summary”. |
| `buildConsultaLegalDossier` | 22 | pública | Executa a responsabilidade interna “build consulta legal dossier”. |

## `src/domain/consultation/consultation-legal-snapshot.js`

Regra de domínio: consultation legal snapshot.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `snapshotHash` | 9 | pública | Executa a responsabilidade interna “snapshot hash”. |
| `createConsultationLegalSnapshot` | 14 | pública | Executa a responsabilidade interna “create consultation legal snapshot”. |

## `src/domain/consultation/consultation-narrative-generator.js`

Regra de domínio: consultation narrative generator.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `formatTimestamp` | 9 | pública | Executa a responsabilidade interna “format timestamp”. |
| `narrativeItem` | 17 | pública | Executa a responsabilidade interna “narrative item”. |
| `generateConsultaNarrative` | 31 | pública | Executa a responsabilidade interna “generate consulta narrative”. |

## `src/domain/consultation/consultation-replay-engine.js`

Regra de domínio: consultation replay engine.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `reduceConsultaEvent` | 3 | pública | Executa a responsabilidade interna “reduce consulta event”. |
| `initialConsultaState` | 44 | pública | Executa a responsabilidade interna “initial consulta state”. |
| `replayConsultaEvents` | 57 | pública | Executa a responsabilidade interna “replay consulta events”. |
| `getConsultaHistory` | 71 | pública | Executa a responsabilidade interna “get consulta history”. |
| `getConsultaStateAt` | 75 | pública | Executa a responsabilidade interna “get consulta state at”. |

## `src/domain/consultation/event-versioning.js`

Regra de domínio: event versioning.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `eventModelHash` | 40 | pública | Executa a responsabilidade interna “event model hash”. |
| `assertEventModelVersion` | 50 | pública | Executa a responsabilidade interna “assert event model version”. |
| `assertEventSchemaVersion` | 63 | pública | Executa a responsabilidade interna “assert event schema version”. |
| `versionConsultaEvent` | 77 | pública | Executa a responsabilidade interna “version consulta event”. |

## `src/domain/consultation/index.js`

Regra de domínio: index.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `assertConsultationArchitecture` | 39 | pública | Executa a responsabilidade interna “assert consultation architecture”. |
| `assertConsultationReleaseIntegrity` | 59 | pública | Executa a responsabilidade interna “assert consultation release integrity”. |
| `getConsultaView` | 81 | pública | Executa a responsabilidade interna “get consulta view”. |
| `getConsultaHistory` | 94 | pública | Executa a responsabilidade interna “get consulta history”. |
| `getConsultaStateAt` | 98 | pública | Executa a responsabilidade interna “get consulta state at”. |
| `getConsultaFullAudit` | 111 | pública | Executa a responsabilidade interna “get consulta full audit”. |
| `buildConsultaLegalDossier` | 122 | pública | Executa a responsabilidade interna “build consulta legal dossier”. |
| `criarEventoConsulta` | 130 | pública | Cria evento consulta. |
| `definirResultadoConsulta` | 143 | pública | Executa a responsabilidade interna “definir resultado consulta”. |
| `cancelarEventosAtivosDoDeal` | 156 | pública | Cancela eventos ativos do deal. |
| `vincularEventoConsulta` | 169 | pública | Executa a responsabilidade interna “vincular evento consulta”. |
| `appendConsultaEvent` | 182 | pública | Executa a responsabilidade interna “append consulta event”. |

## `src/domain/consultation/integrity/consultation-auto-repair-engine.js`

Regra de domínio: consultation auto repair engine.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `officialSessionProjectionRefresh` | 13 | pública | Executa a responsabilidade interna “official session projection refresh”. |
| `authorizeReplayRepairMechanism` | 41 | pública | Executa a responsabilidade interna “authorize replay repair mechanism”. |
| `hashesFromVerification` | 51 | pública | Determina se existe hes from verification. |
| `integrityRepairError` | 59 | pública | Executa a responsabilidade interna “integrity repair error”. |
| `repairIntegrityDrift` | 66 | pública | Executa a responsabilidade interna “repair integrity drift”. |

## `src/domain/consultation/integrity/consultation-drift-detector.js`

Regra de domínio: consultation drift detector.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `detectIntegrityDrift` | 28 | pública | Executa a responsabilidade interna “detect integrity drift”. |

## `src/domain/consultation/integrity/consultation-integrity-drift-event.js`

Regra de domínio: consultation integrity drift event.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `readIntegrityDriftEvents` | 14 | pública | Executa a responsabilidade interna “read integrity drift events”. |
| `recordIntegrityDriftDetected` | 21 | pública | Executa a responsabilidade interna “record integrity drift detected”. |

## `src/domain/consultation/integrity/consultation-integrity-event-store.js`

Regra de domínio: consultation integrity event store.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `sleep` | 14 | interna | Executa a responsabilidade interna “sleep”. |
| `acquireLock` | 18 | interna | Executa a responsabilidade interna “acquire lock”. |
| `hashIntegrityEvent` | 31 | pública | Determina se existe h integrity event. |
| `readIntegrityEvents` | 36 | pública | Executa a responsabilidade interna “read integrity events”. |
| `appendIntegrityEvent` | 59 | pública | Executa a responsabilidade interna “append integrity event”. |

## `src/domain/consultation/integrity/consultation-integrity-hash.js`

Regra de domínio: consultation integrity hash.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `isTransientField` | 12 | interna | Determina se transient field. |
| `canonicalizeConsultationState` | 16 | pública | Executa a responsabilidade interna “canonicalize consultation state”. |
| `hashConsultationState` | 36 | pública | Determina se existe h consultation state. |
| `generateIntegritySnapshot` | 44 | pública | Executa a responsabilidade interna “generate integrity snapshot”. |

## `src/domain/consultation/integrity/consultation-self-healed-event.js`

Regra de domínio: consultation self healed event.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `readConsultationSelfHealedEvents` | 10 | pública | Executa a responsabilidade interna “read consultation self healed events”. |
| `recordConsultationSelfHealed` | 17 | pública | Executa a responsabilidade interna “record consultation self healed”. |

## `src/domain/consultation/integrity/consultation-self-verification-engine.js`

Regra de domínio: consultation self verification engine.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `normalizeStatus` | 10 | pública | Executa a responsabilidade interna “normalize status”. |
| `toIntegrityProjection` | 15 | pública | Executa a responsabilidade interna “to integrity projection”. |
| `compareValues` | 34 | pública | Executa a responsabilidade interna “compare values”. |
| `verifyConsultationIntegrity` | 49 | pública | Executa a responsabilidade interna “verify consultation integrity”. |

## `src/domain/consultation/projections/consultation-session-recovery.js`

Regra de domínio: consultation session recovery.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `sessionProjectionFromReplay` | 19 | pública | Executa a responsabilidade interna “session projection from replay”. |
| `selectConsultationSessions` | 28 | pública | Executa a responsabilidade interna “select consultation sessions”. |
| `projectionSnapshot` | 34 | pública | Executa a responsabilidade interna “projection snapshot”. |
| `atomicWriteJson` | 46 | pública | Executa a responsabilidade interna “atomic write json”. |
| `refreshConsultationSessionProjection` | 53 | pública | Executa a responsabilidade interna “refresh consultation session projection”. |

## `src/domain/conversation-context-dispatcher.js`

Regra de domínio: conversation context dispatcher.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `criarEnvelopeMensagemContexto` | 3 | pública | Cria envelope mensagem contexto. |
| `dispatchConversationContext` | 29 | pública | Executa a responsabilidade interna “dispatch conversation context”. |

## `src/domain/conversation-context-handlers/template-consulta.handler.js`

Regra de domínio: template consulta handler.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `processar` | 2 | pública | Processa processar. |

## `src/domain/conversation-context-handlers/template-reengajamento.handler.js`

Regra de domínio: template reengajamento handler.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `processar` | 4 | pública | Processa processar. |

## `src/domain/conversation-context-registry.js`

Regra de domínio: conversation context registry.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `criarConversationContextRegistry` | 3 | pública | Cria conversation context registry. |
| `registrar` | 6 | interna | Registra registrar. |
| `obter` | 14 | interna | Obtém obter. |
| `listar` | 18 | interna | Lista listar. |

## `src/domain/conversation-context.js`

Regra de domínio: conversation context.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `contextoConversaValido` | 1 | pública | Executa a responsabilidade interna “contexto conversa valido”. |
| `contextoConversaExpirado` | 4 | pública | Executa a responsabilidade interna “contexto conversa expirado”. |
| `normalizarContextoConversa` | 10 | pública | Normaliza contexto conversa. |
| `obterContextoConversaAtivo` | 28 | pública | Obtém contexto conversa ativo. |
| `limparContextoConversa` | 35 | pública | Executa a responsabilidade interna “limpar contexto conversa”. |

## `src/domain/crm-identity/case-party-context-resolver.js`

Regra de domínio: case party context resolver.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `confidenceLabel` | 8 | pública | Executa a responsabilidade interna “confidence label”. |
| `attribution` | 14 | pública | Executa a responsabilidade interna “attribution”. |
| `explicitRoleRule` | 31 | pública | Executa a responsabilidade interna “explicit role rule”. |
| `legacyRoleHintRule` | 54 | pública | Executa a responsabilidade interna “legacy role hint rule”. |
| `relationshipHintRule` | 66 | pública | Executa a responsabilidade interna “relationship hint rule”. |
| `assistedPartyRule` | 91 | pública | Executa a responsabilidade interna “assisted party rule”. |
| `requesterRule` | 122 | pública | Executa a responsabilidade interna “requester rule”. |
| `simpleCaseAssistedRule` | 139 | pública | Executa a responsabilidade interna “simple case assisted rule”. |
| `createCasePartyContextResolver` | 164 | pública | Executa a responsabilidade interna “create case party context resolver”. |
| `execute` | 172 | interna | Executa a responsabilidade interna “execute”. |
| `resolveCasePartyContext` | 214 | pública | Executa a responsabilidade interna “resolve case party context”. |
| `resolveCasePartyContextWithTrace` | 235 | pública | Executa a responsabilidade interna “resolve case party context with trace”. |

## `src/domain/crm-identity/case-party-decision-trace.js`

Regra de domínio: case party decision trace.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `deepClone` | 3 | interna | Executa a responsabilidade interna “deep clone”. |
| `deepFreeze` | 8 | interna | Executa a responsabilidade interna “deep freeze”. |
| `auditEnabled` | 14 | pública | Executa a responsabilidade interna “audit enabled”. |
| `countItems` | 18 | interna | Executa a responsabilidade interna “count items”. |
| `sanitizeInputContext` | 23 | pública | Executa a responsabilidade interna “sanitize input context”. |
| `createDecisionTrace` | 58 | pública | Executa a responsabilidade interna “create decision trace”. |
| `attachDecisionTrace` | 95 | pública | Executa a responsabilidade interna “attach decision trace”. |
| `explainCaseParty` | 108 | pública | Executa a responsabilidade interna “explain case party”. |
| `hasCasePartyDecisionTrace` | 122 | pública | Determina se existe case party decision trace. |

## `src/domain/crm-identity/case-party-multi-resolver.js`

Regra de domínio: case party multi resolver.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `createResolverStrategy` | 14 | pública | Executa a responsabilidade interna “create resolver strategy”. |
| `selectResolverStrategies` | 39 | pública | Executa a responsabilidade interna “select resolver strategies”. |
| `confidenceRank` | 48 | pública | Executa a responsabilidade interna “confidence rank”. |
| `sourceRank` | 56 | pública | Executa a responsabilidade interna “source rank”. |
| `compareCandidates` | 60 | pública | Executa a responsabilidade interna “compare candidates”. |
| `mergeResolverResults` | 73 | pública | Executa a responsabilidade interna “merge resolver results”. |
| `executeStrategy` | 107 | pública | Executa a responsabilidade interna “execute strategy”. |
| `createMultiCasePartyContextResolver` | 141 | pública | Executa a responsabilidade interna “create multi case party context resolver”. |
| `execute` | 151 | interna | Executa a responsabilidade interna “execute”. |
| `hasMetadataRoles` | 182 | pública | Determina se existe metadata roles. |
| `hasRelationshipHints` | 189 | pública | Determina se existe relationship hints. |
| `createStandardMultiCasePartyContextResolver` | 197 | pública | Executa a responsabilidade interna “create standard multi case party context resolver”. |

## `src/domain/crm-identity/case-party-resolution-stability.js`

Regra de domínio: case party resolution stability.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `canonicalize` | 4 | pública | Executa a responsabilidade interna “canonicalize”. |
| `stableSerialize` | 25 | pública | Executa a responsabilidade interna “stable serialize”. |
| `describeRoleRegistry` | 29 | pública | Executa a responsabilidade interna “describe role registry”. |
| `describeContextResolver` | 38 | pública | Executa a responsabilidade interna “describe context resolver”. |
| `contextFingerprintPayload` | 62 | pública | Executa a responsabilidade interna “context fingerprint payload”. |
| `createContextFingerprint` | 79 | pública | Executa a responsabilidade interna “create context fingerprint”. |
| `cloneResolution` | 87 | interna | Executa a responsabilidade interna “clone resolution”. |
| `createResolutionStabilityCache` | 91 | pública | Executa a responsabilidade interna “create resolution stability cache”. |
| `removeExpired` | 101 | interna | Executa a responsabilidade interna “remove expired”. |
| `trim` | 108 | interna | Executa a responsabilidade interna “trim”. |
| `stabilityEnabled` | 153 | pública | Executa a responsabilidade interna “stability enabled”. |
| `resolveStableDecision` | 157 | pública | Executa a responsabilidade interna “resolve stable decision”. |

## `src/domain/crm-identity/case-party-role-registry.js`

Regra de domínio: case party role registry.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `normalizeRoleToken` | 38 | pública | Executa a responsabilidade interna “normalize role token”. |
| `normalizeRoleDefinition` | 47 | pública | Executa a responsabilidade interna “normalize role definition”. |
| `createCasePartyRoleRegistry` | 69 | pública | Executa a responsabilidade interna “create case party role registry”. |

## `src/domain/crm-identity/case-party.js`

Regra de domínio: case party.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `deepFreeze` | 38 | pública | Executa a responsabilidade interna “deep freeze”. |
| `normalizeEvidence` | 44 | pública | Executa a responsabilidade interna “normalize evidence”. |
| `createRoleAttribution` | 52 | pública | Executa a responsabilidade interna “create role attribution”. |
| `mergeRoleAttributions` | 90 | pública | Executa a responsabilidade interna “merge role attributions”. |
| `createCaseParty` | 130 | pública | Executa a responsabilidade interna “create case party”. |
| `hasCasePartyRole` | 168 | pública | Determina se existe case party role. |

## `src/domain/crm-identity/contact-case-party-mapper.js`

Regra de domínio: contact case party mapper.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `normalizePhone` | 37 | pública | Executa a responsabilidade interna “normalize phone”. |
| `normalizeLegacyRole` | 41 | pública | Executa a responsabilidade interna “normalize legacy role”. |
| `contactIdentity` | 45 | pública | Executa a responsabilidade interna “contact identity”. |
| `caseIdentity` | 52 | pública | Executa a responsabilidade interna “case identity”. |
| `legacyState` | 63 | pública | Executa a responsabilidade interna “legacy state”. |
| `buildResolutionContext` | 70 | pública | Executa a responsabilidade interna “build resolution context”. |
| `explicitAttributions` | 134 | pública | Executa a responsabilidade interna “explicit attributions”. |
| `deriveContactRoleAttributions` | 145 | pública | Executa a responsabilidade interna “derive contact role attributions”. |
| `mapContactToCaseParty` | 160 | pública | Executa a responsabilidade interna “map contact to case party”. |

## `src/domain/declarative-screen-guard.js`

Regra de domínio: declarative screen guard.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `warningEnabled` | 10 | interna | Executa a responsabilidade interna “warning enabled”. |
| `warn` | 14 | interna | Executa a responsabilidade interna “warn”. |
| `createClientScreen` | 20 | pública | Executa a responsabilidade interna “create client screen”. |
| `isClientScreen` | 33 | pública | Determina se client screen. |
| `validateClientScreen` | 37 | pública | Executa a responsabilidade interna “validate client screen”. |
| `gerarBotoesDaTela` | 48 | pública | Gera botoes da tela. |
| `gerarAudioDaTela` | 53 | pública | Gera audio da tela. |

## `src/domain/declarative-screen.js`

Regra de domínio: declarative screen.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `normalizarAcoes` | 2 | interna | Normaliza acoes. |
| `criarTela` | 20 | pública | Cria tela. |
| `gerarBotoesDaTela` | 45 | pública | Gera botoes da tela. |
| `gerarAudioDaTela` | 52 | pública | Gera audio da tela. |

## `src/domain/document-ai-assistant.js`

Regra de domínio: document ai assistant.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `uniqueStrings` | 6 | interna | Executa a responsabilidade interna “unique strings”. |
| `construirSinaisDocumentais` | 12 | pública | Constrói sinais documentais. |
| `parseJsonResponse` | 49 | pública | Executa a responsabilidade interna “parse json response”. |
| `avaliarDocumentoComIA` | 62 | pública | Executa a responsabilidade interna “avaliar documento com ia”. |

## `src/domain/document-analysis-integration.js`

Regra de domínio: document analysis integration.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `serializarErro` | 21 | interna | Executa a responsabilidade interna “serializar erro”. |
| `removerBuffers` | 28 | pública | Remove buffers. |
| `coletarEventos` | 45 | interna | Executa a responsabilidade interna “coletar eventos”. |
| `criarDocumentoProcessado` | 54 | interna | Cria documento processado. |
| `normalizarAnaliseExistente` | 64 | interna | Normaliza analise existente. |
| `arquivoJaProcessadoComSucesso` | 81 | interna | Executa a responsabilidade interna “arquivo ja processado com sucesso”. |
| `coverageFrom` | 85 | interna | Executa a responsabilidade interna “coverage from”. |
| `ocrConfidenceBucket` | 96 | pública | Executa a responsabilidade interna “ocr confidence bucket”. |
| `recognizedSidesFromType` | 104 | interna | Executa a responsabilidade interna “recognized sides from type”. |
| `emitirLogsDocumentaisSeguros` | 111 | pública | Executa a responsabilidade interna “emitir logs documentais seguros”. |
| `nextEvidenceVersion` | 160 | interna | Executa a responsabilidade interna “next evidence version”. |
| `registrarDivergenciaSeNova` | 166 | interna | Registra divergencia se nova. |
| `montarEntradaSucesso` | 173 | interna | Monta entrada sucesso. |
| `montarEntradaErro` | 199 | interna | Monta entrada erro. |
| `processarAnaliseDocumentalPosUpload` | 219 | pública | Processa analise documental pos upload. |

## `src/domain/document-canonical-service.js`

Regra de domínio: document canonical service.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `confirmCanonicalDocument` | 9 | pública | Executa a responsabilidade interna “confirm canonical document”. |

## `src/domain/document-checklist-projection.js`

Regra de domínio: document checklist projection.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `projectDocumentDecision` | 2 | pública | Executa a responsabilidade interna “project document decision”. |

## `src/domain/document-checklist.js`

Regra de domínio: document checklist.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `normalizarTexto` | 58 | interna | Normaliza texto. |
| `normalizarArray` | 68 | interna | Normaliza array. |
| `documentoReferencia` | 72 | interna | Executa a responsabilidade interna “documento referencia”. |
| `versaoVigente` | 85 | interna | Executa a responsabilidade interna “versao vigente”. |
| `extracaoVigente` | 89 | interna | Executa a responsabilidade interna “extracao vigente”. |
| `camposExtraidos` | 93 | interna | Executa a responsabilidade interna “campos extraidos”. |
| `textosDocumento` | 97 | interna | Executa a responsabilidade interna “textos documento”. |
| `documentoCorresponde` | 111 | interna | Executa a responsabilidade interna “documento corresponde”. |
| `documentosAtuais` | 121 | interna | Executa a responsabilidade interna “documentos atuais”. |
| `documentosInvalidos` | 128 | interna | Executa a responsabilidade interna “documentos invalidos”. |
| `documentosDuplicados` | 140 | interna | Executa a responsabilidade interna “documentos duplicados”. |
| `parseDataPossivel` | 148 | interna | Executa a responsabilidade interna “parse data possivel”. |
| `dataReferencia` | 160 | interna | Executa a responsabilidade interna “data referencia”. |
| `extrairDataVencimento` | 164 | interna | Executa a responsabilidade interna “extrair data vencimento”. |
| `documentosVencidos` | 181 | interna | Executa a responsabilidade interna “documentos vencidos”. |
| `resolverArea` | 191 | interna | Resolve area. |
| `localizarRecebidos` | 213 | interna | Executa a responsabilidade interna “localizar recebidos”. |
| `itensPendentes` | 225 | interna | Executa a responsabilidade interna “itens pendentes”. |
| `gerarResumo` | 232 | interna | Gera resumo. |
| `gerarChecklistDocumental` | 252 | pública | Gera checklist documental. |

## `src/domain/document-classifier.js`

Regra de domínio: document classifier.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `normalizarTextoClassificacao` | 220 | interna | Normaliza texto classificacao. |
| `normalizarQuantidadePaginas` | 230 | interna | Normaliza quantidade paginas. |
| `normalizarMetadadosImagem` | 236 | interna | Normaliza metadados imagem. |
| `contarOcorrenciasTermo` | 241 | interna | Executa a responsabilidade interna “contar ocorrencias termo”. |
| `pontuarTermos` | 255 | interna | Executa a responsabilidade interna “pontuar termos”. |
| `calcularBonusContexto` | 270 | interna | Calcula bonus contexto. |
| `calcularCandidato` | 295 | interna | Calcula candidato. |
| `calcularConfianca` | 314 | interna | Calcula confianca. |
| `montarCandidatoDesconhecido` | 321 | interna | Monta candidato desconhecido. |
| `classificarDocumento` | 331 | pública | Classifica documento. |

## `src/domain/document-consolidation.js`

Regra de domínio: document consolidation.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `hash` | 9 | interna | Determina se existe h. |
| `analisesConcluidas` | 13 | interna | Executa a responsabilidade interna “analises concluidas”. |
| `assinaturaConsolidacao` | 20 | pública | Executa a responsabilidade interna “assinatura consolidacao”. |
| `removerBuffers` | 32 | interna | Remove buffers. |
| `prepararDocumentosDasAnalises` | 42 | pública | Executa a responsabilidade interna “preparar documentos das analises”. |
| `dependencias` | 120 | interna | Executa a responsabilidade interna “dependencias”. |
| `consolidarDocumentosDoCaso` | 136 | pública | Executa a responsabilidade interna “consolidar documentos do caso”. |

## `src/domain/document-content-inventory.js`

Regra de domínio: document content inventory.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `sha256` | 8 | interna | Executa a responsabilidade interna “sha256”. |
| `contentDocumentIdForHash` | 10 | pública | Executa a responsabilidade interna “content document id for hash”. |
| `normalizeReference` | 11 | interna | Executa a responsabilidade interna “normalize reference”. |
| `physicalDocumentIdFor` | 17 | pública | Executa a responsabilidade interna “physical document id for”. |
| `sanitizeReasons` | 22 | interna | Executa a responsabilidade interna “sanitize reasons”. |
| `sanitizeAnalysisResult` | 26 | interna | Executa a responsabilidade interna “sanitize analysis result”. |
| `technicalReviewAnalysis` | 41 | pública | Executa a responsabilidade interna “technical review analysis”. |
| `validateInventory` | 54 | pública | Executa a responsabilidade interna “validate inventory”. |
| `buildDocumentContentInventory` | 100 | pública | Executa a responsabilidade interna “build document content inventory”. |

## `src/domain/document-divergence-detector.js`

Regra de domínio: document divergence detector.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `normalizarArray` | 128 | interna | Normaliza array. |
| `normalizarChave` | 132 | interna | Normaliza chave. |
| `normalizarTextoComparavel` | 143 | interna | Normaliza texto comparavel. |
| `normalizarDigitos` | 147 | interna | Normaliza digitos. |
| `normalizarAlfanumerico` | 151 | interna | Normaliza alfanumerico. |
| `normalizarDinheiro` | 159 | interna | Normaliza dinheiro. |
| `normalizarData` | 169 | interna | Normaliza data. |
| `mapaAliases` | 184 | interna | Executa a responsabilidade interna “mapa aliases”. |
| `versaoVigente` | 194 | interna | Executa a responsabilidade interna “versao vigente”. |
| `documentoElegivel` | 198 | interna | Executa a responsabilidade interna “documento elegivel”. |
| `camposExtraidos` | 202 | interna | Executa a responsabilidade interna “campos extraidos”. |
| `confiancasExtraidas` | 207 | interna | Executa a responsabilidade interna “confiancas extraidas”. |
| `referenciaDocumento` | 212 | interna | Executa a responsabilidade interna “referencia documento”. |
| `confiancaDoCampo` | 222 | interna | Executa a responsabilidade interna “confianca do campo”. |
| `normalizarValorCampo` | 230 | interna | Normaliza valor campo. |
| `coletarValoresComparaveis` | 236 | interna | Executa a responsabilidade interna “coletar valores comparaveis”. |
| `mesmaFonte` | 263 | interna | Executa a responsabilidade interna “mesma fonte”. |
| `assinaturaDivergencia` | 267 | interna | Executa a responsabilidade interna “assinatura divergencia”. |
| `compararCampo` | 277 | interna | Executa a responsabilidade interna “comparar campo”. |
| `gerarResumo` | 315 | interna | Gera resumo. |
| `detectarDivergenciasDocumentais` | 329 | pública | Detecta divergencias documentais. |

## `src/domain/document-evidence-model.js`

Regra de domínio: document evidence model.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `texto` | 6 | interna | Executa a responsabilidade interna “texto”. |
| `erroContrato` | 10 | interna | Executa a responsabilidade interna “erro contrato”. |
| `exigirTexto` | 14 | interna | Executa a responsabilidade interna “exigir texto”. |
| `normalizarSha256` | 20 | interna | Normaliza sha256. |
| `normalizarPageNumber` | 28 | interna | Normaliza page number. |
| `sanitizarPersistivel` | 37 | pública | Sanitiza persistivel. |
| `stableHash` | 57 | interna | Executa a responsabilidade interna “stable hash”. |
| `criarEvidenceId` | 61 | pública | Cria evidence id. |
| `criarArquivoFisico` | 67 | pública | Cria arquivo fisico. |
| `criarUnidadeLogica` | 75 | pública | Cria unidade logica. |
| `normalizarCoverage` | 86 | interna | Normaliza coverage. |
| `normalizarEvidenceRefs` | 90 | pública | Normaliza evidence refs. |
| `criarEvidenciaDocumental` | 105 | pública | Cria evidencia documental. |
| `criarConfirmationId` | 139 | interna | Cria confirmation id. |
| `criarConfirmacaoDocumental` | 151 | pública | Cria confirmacao documental. |
| `criarDivergenciaDocumental` | 165 | pública | Cria divergencia documental. |
| `criarDecisaoDocumental` | 180 | pública | Cria decisao documental. |
| `materialIgual` | 200 | interna | Executa a responsabilidade interna “material igual”. |
| `normalizarLista` | 204 | interna | Normaliza lista. |
| `normalizarContratoEvidencias` | 214 | pública | Normaliza contrato evidencias. |
| `adicionarVersionado` | 227 | interna | Executa a responsabilidade interna “adicionar versionado”. |
| `registrarEvidenciaDocumental` | 237 | pública | Registra evidencia documental. |
| `registrarConfirmacaoDocumental` | 246 | pública | Registra confirmacao documental. |
| `registrarDivergenciaDocumental` | 278 | pública | Registra divergencia documental. |
| `registrarDecisaoDocumental` | 287 | pública | Registra decisao documental. |

## `src/domain/document-extractor.js`

Regra de domínio: document extractor.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `normalizarTexto` | 13 | interna | Normaliza texto. |
| `limparValor` | 20 | interna | Executa a responsabilidade interna “limpar valor”. |
| `normalizarLinhas` | 28 | interna | Normaliza linhas. |
| `criarResultadoBase` | 36 | interna | Cria resultado base. |
| `serializarErro` | 46 | interna | Executa a responsabilidade interna “serializar erro”. |
| `resolverFamiliaDocumento` | 53 | pública | Resolve familia documento. |
| `encontrarPorRegex` | 72 | interna | Executa a responsabilidade interna “encontrar por regex”. |
| `encontrarPorLinha` | 83 | interna | Executa a responsabilidade interna “encontrar por linha”. |
| `primeiroValor` | 103 | interna | Executa a responsabilidade interna “primeiro valor”. |
| `dataPorRotulo` | 107 | interna | Executa a responsabilidade interna “data por rotulo”. |
| `setCampo` | 115 | interna | Executa a responsabilidade interna “set campo”. |
| `extrairPessoaBasico` | 121 | interna | Executa a responsabilidade interna “extrair pessoa basico”. |
| `extrairRG` | 142 | interna | Executa a responsabilidade interna “extrair rg”. |
| `extrairCNH` | 161 | interna | Executa a responsabilidade interna “extrair cnh”. |
| `extrairCTPS` | 176 | interna | Executa a responsabilidade interna “extrair ctps”. |
| `extrairCertidao` | 190 | interna | Executa a responsabilidade interna “extrair certidao”. |
| `extrairHolerite` | 199 | interna | Executa a responsabilidade interna “extrair holerite”. |
| `extrairCNIS` | 219 | interna | Executa a responsabilidade interna “extrair cnis”. |
| `extrairCartaINSS` | 229 | interna | Executa a responsabilidade interna “extrair carta inss”. |
| `extrairLaudo` | 244 | interna | Executa a responsabilidade interna “extrair laudo”. |
| `extrairProcesso` | 260 | interna | Executa a responsabilidade interna “extrair processo”. |
| `extrairCPF` | 277 | interna | Executa a responsabilidade interna “extrair cpf”. |
| `extrairDadosDocumento` | 308 | pública | Executa a responsabilidade interna “extrair dados documento”. |

## `src/domain/document-grouper.js`

Regra de domínio: document grouper.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `normalizarTexto` | 18 | interna | Normaliza texto. |
| `classificacaoGuiadaParaAgrupamento` | 26 | pública | Executa a responsabilidade interna “classificacao guiada para agrupamento”. |
| `normalizarDocumento` | 52 | interna | Normaliza documento. |
| `criarGruposVazios` | 74 | interna | Cria grupos vazios. |
| `chaveRG` | 78 | interna | Executa a responsabilidade interna “chave rg”. |
| `isRGFrente` | 87 | interna | Determina se rgfrente. |
| `isRGVerso` | 91 | interna | Determina se rgverso. |
| `adicionarDocumentoPessoal` | 95 | interna | Executa a responsabilidade interna “adicionar documento pessoal”. |
| `adicionarDocumentoMedico` | 120 | interna | Executa a responsabilidade interna “adicionar documento medico”. |
| `adicionarDocumentoJuridico` | 137 | interna | Executa a responsabilidade interna “adicionar documento juridico”. |
| `chaveCTPS` | 167 | interna | Executa a responsabilidade interna “chave ctps”. |
| `agruparCTPS` | 179 | interna | Executa a responsabilidade interna “agrupar ctps”. |
| `agruparRG` | 199 | interna | Executa a responsabilidade interna “agrupar rg”. |
| `documentoFoiAgrupado` | 236 | interna | Executa a responsabilidade interna “documento foi agrupado”. |
| `agruparDocumentosProcessados` | 252 | pública | Executa a responsabilidade interna “agrupar documentos processados”. |

## `src/domain/document-guided-receipt.js`

Regra de domínio: document guided receipt.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `normalized` | 5 | interna | Executa a responsabilidade interna “normalized”. |
| `requestedSide` | 9 | pública | Executa a responsabilidade interna “requested side”. |
| `evidenceSide` | 16 | pública | Executa a responsabilidade interna “evidence side”. |
| `response` | 26 | interna | Executa a responsabilidade interna “response”. |
| `pendingReview` | 48 | interna | Executa a responsabilidade interna “pending review”. |
| `evaluateGuidedDocumentReceipt` | 72 | pública | Executa a responsabilidade interna “evaluate guided document receipt”. |
| `applyGuidedDocumentReceipt` | 131 | pública | Executa a responsabilidade interna “apply guided document receipt”. |

## `src/domain/document-hubspot-sync.js`

Regra de domínio: document hubspot sync.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `nowISO` | 77 | interna | Executa a responsabilidade interna “now iso”. |
| `normalizarTexto` | 81 | interna | Normaliza texto. |
| `normalizarArray` | 90 | interna | Normaliza array. |
| `valorVazio` | 94 | interna | Executa a responsabilidade interna “valor vazio”. |
| `obterProperties` | 98 | interna | Obtém properties. |
| `obterId` | 102 | interna | Obtém id. |
| `normalizarConfiancas` | 110 | interna | Normaliza confiancas. |
| `confiancaCampo` | 119 | interna | Executa a responsabilidade interna “confianca campo”. |
| `iterarCamposExtraidos` | 126 | interna | Executa a responsabilidade interna “iterar campos extraidos”. |
| `campoTemValidacao` | 153 | interna | Executa a responsabilidade interna “campo tem validacao”. |
| `normalizarValorHubSpot` | 164 | interna | Normaliza valor hub spot. |
| `camposValidadosManualmente` | 184 | interna | Executa a responsabilidade interna “campos validados manualmente”. |
| `campoManual` | 194 | interna | Executa a responsabilidade interna “campo manual”. |
| `podeAtualizarCampo` | 202 | interna | Executa a responsabilidade interna “pode atualizar campo”. |
| `assinaturaAtualizacao` | 214 | pública | Executa a responsabilidade interna “assinatura atualizacao”. |
| `ordenarObjeto` | 221 | interna | Executa a responsabilidade interna “ordenar objeto”. |
| `obterAssinaturas` | 225 | interna | Obtém assinaturas. |
| `montarResumoDocumental` | 229 | interna | Monta resumo documental. |
| `candidatosContato` | 238 | interna | Executa a responsabilidade interna “candidatos contato”. |
| `candidatosNegocio` | 251 | interna | Executa a responsabilidade interna “candidatos negocio”. |
| `montarPlanoObjeto` | 289 | interna | Monta plano objeto. |
| `normalizarNome` | 354 | interna | Normaliza nome. |
| `normalizarData` | 359 | interna | Normaliza data. |
| `normalizarValorCanonico` | 372 | interna | Normaliza valor canonico. |
| `compararValorCanonico` | 379 | interna | Executa a responsabilidade interna “comparar valor canonico”. |
| `evidenceRefKey` | 387 | interna | Executa a responsabilidade interna “evidence ref key”. |
| `obterDecisaoCanonica` | 391 | interna | Obtém decisao canonica. |
| `resolverEvidenciasExatas` | 398 | interna | Resolve evidencias exatas. |
| `operacoesCanonicas` | 413 | interna | Executa a responsabilidade interna “operacoes canonicas”. |
| `idOperacaoCanonica` | 417 | interna | Executa a responsabilidade interna “id operacao canonica”. |
| `registrarDivergenciaSeNova` | 425 | interna | Registra divergencia se nova. |
| `planoCanonicoBloqueado` | 435 | interna | Executa a responsabilidade interna “plano canonico bloqueado”. |
| `planejarSincronizacaoDocumentalCanonicaHubSpot` | 449 | pública | Executa a responsabilidade interna “planejar sincronizacao documental canonica hub spot”. |
| `planejarSincronizacaoDocumentalHubSpot` | 610 | pública | Executa a responsabilidade interna “planejar sincronizacao documental hub spot”. |
| `registrarOperacoesCanonicas` | 678 | interna | Registra operacoes canonicas. |
| `aplicarDadosDocumentaisConfiaveisAoUsuario` | 697 | pública | Aplica dados documentais confiaveis ao usuario. |
| `normalizarNumeroCasoDocumental` | 708 | interna | Normaliza numero caso documental. |
| `validarContextoDocumentalHubSpot` | 712 | pública | Valida contexto documental hub spot. |
| `operacaoPersistida` | 728 | interna | Executa a responsabilidade interna “operacao persistida”. |
| `executarSincronizacaoCanonica` | 748 | interna | Executa sincronizacao canonica. |
| `chaveSincronizacaoCanonica` | 781 | interna | Executa a responsabilidade interna “chave sincronizacao canonica”. |
| `sincronizarDocumentosCanonicosHubSpot` | 791 | interna | Executa a responsabilidade interna “sincronizar documentos canonicos hub spot”. |
| `registrarAssinaturas` | 803 | interna | Registra assinaturas. |
| `sincronizarDocumentosHubSpot` | 819 | pública | Executa a responsabilidade interna “sincronizar documentos hub spot”. |

## `src/domain/document-human-review.js`

Regra de domínio: document human review.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `texto` | 14 | interna | Executa a responsabilidade interna “texto”. |
| `normalizado` | 18 | interna | Executa a responsabilidade interna “normalizado”. |
| `latestEvidence` | 22 | pública | Executa a responsabilidade interna “latest evidence”. |
| `needsHumanReview` | 31 | pública | Executa a responsabilidade interna “needs human review”. |
| `analysisNameByFile` | 41 | interna | Executa a responsabilidade interna “analysis name by file”. |
| `listPendingHumanReviews` | 49 | pública | Executa a responsabilidade interna “list pending human reviews”. |
| `updateAnalysis` | 88 | interna | Executa a responsabilidade interna “update analysis”. |
| `applyHumanDocumentReview` | 116 | pública | Executa a responsabilidade interna “apply human document review”. |

## `src/domain/document-image-preprocessing.js`

Regra de domínio: document image preprocessing.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `normalizarMimeType` | 27 | interna | Normaliza mime type. |
| `isSupportedDocumentImage` | 31 | pública | Determina se supported document image. |
| `criarErroPreprocessamento` | 36 | interna | Cria erro preprocessamento. |
| `normalizarEntradaImagem` | 42 | interna | Normaliza entrada imagem. |
| `montarOpcoes` | 62 | interna | Monta opcoes. |
| `validarDimensoes` | 76 | interna | Valida dimensoes. |
| `aplicarPerfil` | 84 | interna | Aplica perfil. |
| `passosPerfil` | 121 | interna | Executa a responsabilidade interna “passos perfil”. |
| `preprocessarImagemDocumento` | 133 | pública | Executa a responsabilidade interna “preprocessar imagem documento”. |

## `src/domain/document-image-quality.js`

Regra de domínio: document image quality.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `rounded` | 15 | interna | Executa a responsabilidade interna “rounded”. |
| `avaliarQualidadeImagem` | 19 | pública | Executa a responsabilidade interna “avaliar qualidade imagem”. |

## `src/domain/document-input-normalizer.js`

Regra de domínio: document input normalizer.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `detectMime` | 14 | pública | Executa a responsabilidade interna “detect mime”. |
| `extensionMatchesMime` | 30 | pública | Executa a responsabilidade interna “extension matches mime”. |
| `renderPdfPages` | 39 | pública | Executa a responsabilidade interna “render pdf pages”. |
| `sha256` | 80 | pública | Executa a responsabilidade interna “sha256”. |
| `erro` | 84 | interna | Executa a responsabilidade interna “erro”. |
| `normalizarEntradaDocumental` | 88 | pública | Normaliza entrada documental. |

## `src/domain/document-ocr.js`

Regra de domínio: document ocr.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `normalizarMimeType` | 12 | interna | Normaliza mime type. |
| `criarErroOCR` | 16 | interna | Cria erro ocr. |
| `serializarErroOCR` | 23 | interna | Executa a responsabilidade interna “serializar erro ocr”. |
| `criarResultadoOCR` | 34 | interna | Cria resultado ocr. |
| `normalizarEntradaOCR` | 45 | interna | Normaliza entrada ocr. |
| `encerrarWorkerOCR` | 68 | interna | Encerra worker ocr. |
| `executarOCRImagem` | 80 | pública | Executa ocrimagem. |

## `src/domain/document-party-identity.js`

Regra de domínio: document party identity.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `text` | 6 | interna | Executa a responsabilidade interna “text”. |
| `normalized` | 10 | interna | Executa a responsabilidade interna “normalized”. |
| `digits` | 14 | interna | Executa a responsabilidade interna “digits”. |
| `field` | 18 | interna | Executa a responsabilidade interna “field”. |
| `identityFromFields` | 23 | pública | Executa a responsabilidade interna “identity from fields”. |
| `identityFromUser` | 32 | pública | Executa a responsabilidade interna “identity from user”. |
| `compareIdentity` | 41 | pública | Executa a responsabilidade interna “compare identity”. |
| `trustedRegistryIdentities` | 60 | interna | Executa a responsabilidade interna “trusted registry identities”. |
| `evidenceKey` | 66 | interna | Executa a responsabilidade interna “evidence key”. |
| `confirmedEvidenceKeys` | 70 | interna | Executa a responsabilidade interna “confirmed evidence keys”. |
| `hasOpenDivergence` | 78 | interna | Determina se existe open divergence. |
| `hasConfirmedTrustedFront` | 83 | pública | Determina se existe confirmed trusted front. |
| `resolveDocumentPartyIdentity` | 95 | pública | Executa a responsabilidade interna “resolve document party identity”. |

## `src/domain/document-pdf-composer.js`

Regra de domínio: document pdf composer.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `normalizarTexto` | 60 | interna | Normaliza texto. |
| `filtrarPorTipo` | 68 | interna | Executa a responsabilidade interna “filtrar por tipo”. |
| `obterBufferDocumento` | 75 | interna | Obtém buffer documento. |
| `obterMimeTypeDocumento` | 82 | interna | Obtém mime type documento. |
| `obterReferenciaOriginal` | 90 | pública | Obtém referencia original. |
| `chaveDocumento` | 100 | interna | Executa a responsabilidade interna “chave documento”. |
| `documentosUnicos` | 110 | interna | Executa a responsabilidade interna “documentos unicos”. |
| `prepararPaginaDocumento` | 122 | interna | Executa a responsabilidade interna “preparar pagina documento”. |
| `formatNumber` | 173 | interna | Executa a responsabilidade interna “format number”. |
| `criarObjeto` | 177 | interna | Cria objeto. |
| `criarStream` | 189 | interna | Cria stream. |
| `calcularImagemNaPagina` | 198 | interna | Calcula imagem na pagina. |
| `criarPdfDePaginas` | 212 | pública | Cria pdf de paginas. |
| `gerarPdfDefinicao` | 284 | interna | Gera pdf definicao. |
| `registrarAvisosRGIncompleto` | 305 | interna | Registra avisos rgincompleto. |
| `comporPdfsDocumentais` | 322 | pública | Executa a responsabilidade interna “compor pdfs documentais”. |
| `definicoesCTPS` | 343 | interna | Executa a responsabilidade interna “definicoes ctps”. |

## `src/domain/document-pipeline-orchestrator.js`

Regra de domínio: document pipeline orchestrator.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `criarErroPipeline` | 19 | interna | Cria erro pipeline. |
| `serializarErroPipeline` | 26 | interna | Executa a responsabilidade interna “serializar erro pipeline”. |
| `criarEtapaInterrompida` | 37 | pública | Cria etapa interrompida. |
| `resultadoTemErro` | 49 | interna | Executa a responsabilidade interna “resultado tem erro”. |
| `criarResultadoVazio` | 53 | interna | Cria resultado vazio. |
| `montarMetadadosImagem` | 62 | interna | Monta metadados imagem. |
| `errosPipeline` | 73 | interna | Executa a responsabilidade interna “erros pipeline”. |
| `tipoConhecido` | 78 | interna | Executa a responsabilidade interna “tipo conhecido”. |
| `resultadoSeguro` | 83 | pública | Executa a responsabilidade interna “resultado seguro”. |
| `pontuarResultado` | 90 | pública | Executa a responsabilidade interna “pontuar resultado”. |
| `resumoTentativa` | 109 | interna | Executa a responsabilidade interna “resumo tentativa”. |
| `classificacoesConflitantes` | 127 | pública | Executa a responsabilidade interna “classificacoes conflitantes”. |
| `executarTentativaDocumental` | 134 | interna | Executa tentativa documental. |
| `executarPipelineDocumental` | 206 | pública | Executa pipeline documental. |

## `src/domain/document-registry.js`

Regra de domínio: document registry.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `nowISO` | 28 | interna | Executa a responsabilidade interna “now iso”. |
| `normalizarTexto` | 32 | interna | Normaliza texto. |
| `normalizarArray` | 40 | interna | Normaliza array. |
| `hashBuffer` | 44 | interna | Determina se existe h buffer. |
| `hashTexto` | 49 | interna | Determina se existe h texto. |
| `extrairClassificacao` | 54 | interna | Executa a responsabilidade interna “extrair classificacao”. |
| `extrairExtracao` | 61 | interna | Executa a responsabilidade interna “extrair extracao”. |
| `extrairArquivo` | 68 | interna | Executa a responsabilidade interna “extrair arquivo”. |
| `obterFileId` | 76 | interna | Obtém file id. |
| `obterNomeArquivo` | 81 | interna | Obtém nome arquivo. |
| `obterMimeType` | 93 | interna | Obtém mime type. |
| `obterDrive` | 98 | interna | Obtém drive. |
| `obterHash` | 109 | interna | Obtém hash. |
| `obterTipoDocumento` | 120 | interna | Obtém tipo documento. |
| `obterCategoria` | 125 | interna | Obtém categoria. |
| `obterChaveDocumento` | 130 | interna | Obtém chave documento. |
| `criarRegistroVazio` | 139 | interna | Cria registro vazio. |
| `clonarRegistry` | 159 | interna | Executa a responsabilidade interna “clonar registry”. |
| `criarVersaoDocumento` | 176 | interna | Cria versao documento. |
| `criarDocumentoCanonico` | 202 | interna | Cria documento canonico. |
| `aplicarVersaoDocumento` | 233 | interna | Aplica versao documento. |
| `registrarDocumento` | 269 | pública | Registra documento. |
| `registrarDocumentos` | 287 | interna | Registra documentos. |
| `documentoReferencia` | 294 | interna | Executa a responsabilidade interna “documento referencia”. |
| `chaveEntradaGrupo` | 304 | interna | Executa a responsabilidade interna “chave entrada grupo”. |
| `resolverReferenciaGrupo` | 316 | interna | Resolve referencia grupo. |
| `achatarItensGrupo` | 333 | interna | Executa a responsabilidade interna “achatar itens grupo”. |
| `montarGrupos` | 341 | interna | Monta grupos. |
| `normalizarPdf` | 350 | interna | Normaliza pdf. |
| `normalizarOriginaisParaComparacao` | 367 | interna | Normaliza originais para comparacao. |
| `registrarPdfs` | 379 | pública | Registra pdfs. |
| `detectarDuplicidades` | 408 | interna | Detecta duplicidades. |
| `aplicarDuplicidades` | 418 | interna | Aplica duplicidades. |
| `detectarDivergencias` | 442 | interna | Detecta divergencias. |
| `pendenciasPorEsperados` | 468 | interna | Executa a responsabilidade interna “pendencias por esperados”. |
| `pendenciasPorAgrupamentos` | 484 | interna | Executa a responsabilidade interna “pendencias por agrupamentos”. |
| `contarPor` | 505 | interna | Executa a responsabilidade interna “contar por”. |
| `calcularEstatisticas` | 513 | pública | Calcula estatisticas. |
| `recalcularRegistry` | 530 | interna | Executa a responsabilidade interna “recalcular registry”. |
| `entradasDeAnalises` | 541 | interna | Executa a responsabilidade interna “entradas de analises”. |
| `extrairDocumentosEntrada` | 554 | interna | Executa a responsabilidade interna “extrair documentos entrada”. |
| `criarDocumentRegistry` | 569 | pública | Cria document registry. |
| `atualizarDocumentRegistry` | 587 | pública | Atualiza document registry. |

## `src/domain/document-requirement-engine.js`

Regra de domínio: document requirement engine.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `text` | 11 | interna | Executa a responsabilidade interna “text”. |
| `normalized` | 15 | interna | Executa a responsabilidade interna “normalized”. |
| `digits` | 19 | interna | Executa a responsabilidade interna “digits”. |
| `validCpf` | 21 | pública | Executa a responsabilidade interna “valid cpf”. |
| `digit` | 25 | interna | Executa a responsabilidade interna “digit”. |
| `fields` | 33 | interna | Executa a responsabilidade interna “fields”. |
| `find` | 36 | interna | Executa a responsabilidade interna “find”. |
| `evidenceKey` | 46 | interna | Executa a responsabilidade interna “evidence key”. |
| `confirmedEvidence` | 50 | interna | Executa a responsabilidade interna “confirmed evidence”. |
| `documentKind` | 76 | interna | Executa a responsabilidade interna “document kind”. |
| `eligible` | 80 | interna | Executa a responsabilidade interna “eligible”. |
| `scopedPairCandidate` | 89 | pública | Executa a responsabilidade interna “scoped pair candidate”. |
| `trustedFront` | 97 | interna | Executa a responsabilidade interna “trusted front”. |
| `scopedFrontBackMatch` | 102 | pública | Executa a responsabilidade interna “scoped front back match”. |
| `coverage` | 107 | interna | Executa a responsabilidade interna “coverage”. |
| `strongIdentity` | 115 | pública | Executa a responsabilidade interna “strong identity”. |
| `latestDecision` | 132 | interna | Executa a responsabilidade interna “latest decision”. |
| `sameMaterial` | 138 | interna | Executa a responsabilidade interna “same material”. |
| `addDivergence` | 143 | interna | Executa a responsabilidade interna “add divergence”. |
| `decideRg` | 151 | pública | Executa a responsabilidade interna “decide rg”. |
| `confirmAndDecide` | 268 | pública | Executa a responsabilidade interna “confirm and decide”. |

## `src/domain/document-scanner.js`

Regra de domínio: document scanner.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `scannerEnabled` | 17 | pública | Executa a responsabilidade interna “scanner enabled”. |
| `loadOpenCv` | 21 | interna | Executa a responsabilidade interna “load open cv”. |
| `executarSerializado` | 33 | interna | Executa serializado. |
| `distancia` | 39 | interna | Executa a responsabilidade interna “distancia”. |
| `ordenarPontos` | 43 | pública | Executa a responsabilidade interna “ordenar pontos”. |
| `cosineAt` | 55 | interna | Executa a responsabilidade interna “cosine at”. |
| `qualidadeRetangular` | 64 | pública | Executa a responsabilidade interna “qualidade retangular”. |
| `pontosDoContorno` | 72 | interna | Executa a responsabilidade interna “pontos do contorno”. |
| `detectarQuadrilatero` | 81 | interna | Detecta quadrilatero. |
| `escalarPontos` | 133 | interna | Executa a responsabilidade interna “escalar pontos”. |
| `dimensoesSaida` | 140 | interna | Executa a responsabilidade interna “dimensoes saida”. |
| `transformarPerspectiva` | 156 | interna | Executa a responsabilidade interna “transformar perspectiva”. |
| `digitalizarInterno` | 213 | interna | Executa a responsabilidade interna “digitalizar interno”. |
| `digitalizarImagemDocumento` | 285 | pública | Executa a responsabilidade interna “digitalizar imagem documento”. |

## `src/domain/document-state-repository.js`

Regra de domínio: document state repository.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `nowISO` | 10 | interna | Executa a responsabilidade interna “now iso”. |
| `objeto` | 14 | interna | Executa a responsabilidade interna “objeto”. |
| `normalizarArray` | 18 | interna | Normaliza array. |
| `estadoVazio` | 22 | pública | Executa a responsabilidade interna “estado vazio”. |
| `normalizarEstadoDocumental` | 35 | pública | Normaliza estado documental. |
| `estadoValido` | 50 | interna | Executa a responsabilidade interna “estado valido”. |
| `dependencias` | 59 | interna | Executa a responsabilidade interna “dependencias”. |
| `assinaturaMaterialEstado` | 66 | interna | Executa a responsabilidade interna “assinatura material estado”. |
| `carregarEstadoDocumental` | 79 | pública | Carrega estado documental. |
| `estadoExiste` | 91 | pública | Executa a responsabilidade interna “estado existe”. |
| `salvarEstadoDocumental` | 95 | pública | Salva estado documental. |
| `atualizarEstadoDocumental` | 109 | pública | Atualiza estado documental. |

## `src/domain/documents-core.js`

Regra de domínio: documents core.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `normalizarChaveDoc` | 286 | pública | Normaliza chave doc. |
| `normalizarTextoDoc` | 399 | interna | Normaliza texto doc. |
| `resolverValor` | 411 | interna | Resolve valor. |
| `chaveDocumentosCaso` | 451 | pública | Executa a responsabilidade interna “chave documentos caso”. |
| `inferirGrupoDocumento` | 469 | pública | Executa a responsabilidade interna “inferir grupo documento”. |
| `inferirAceitaDocumento` | 483 | pública | Executa a responsabilidade interna “inferir aceita documento”. |
| `normalizarDocumentoGuia` | 493 | pública | Normaliza documento guia. |
| `getDocumentosLista` | 506 | pública | Executa a responsabilidade interna “get documentos lista”. |
| `getDocumentosListaCaso` | 514 | pública | Executa a responsabilidade interna “get documentos lista caso”. |
| `getDocumentos` | 522 | pública | Executa a responsabilidade interna “get documentos”. |
| `getDocumentosCaso` | 526 | pública | Executa a responsabilidade interna “get documentos caso”. |
| `criarContextoDocsCasoAtual` | 530 | pública | Cria contexto docs caso atual. |
| `aplicarContextoDocsCasoAtual` | 543 | pública | Aplica contexto docs caso atual. |
| `detectarComandoDocumento` | 557 | pública | Detecta comando documento. |
| `listaIdsDocumento` | 574 | pública | Executa a responsabilidade interna “lista ids documento”. |
| `removerIdDocumentoDeListas` | 578 | pública | Remove id documento de listas. |
| `marcarStatusDocumento` | 586 | pública | Marca status documento. |
| `garantirListasDocumentos` | 594 | pública | Garante listas documentos. |
| `calcularStatusDocumentos` | 601 | pública | Calcula status documentos. |
| `porStatus` | 611 | interna | Executa a responsabilidade interna “por status”. |
| `getDocsPendentes` | 629 | pública | Executa a responsabilidade interna “get docs pendentes”. |
| `getDocsFaltantesReenviaveis` | 633 | pública | Executa a responsabilidade interna “get docs faltantes reenviaveis”. |
| `removerIdsDocumento` | 642 | pública | Remove ids documento. |
| `reabrirDocsFaltantesReenviaveis` | 648 | pública | Executa a responsabilidade interna “reabrir docs faltantes reenviaveis”. |
| `getDocumentoAtualGuia` | 662 | pública | Executa a responsabilidade interna “get documento atual guia”. |
| `documentoAtualAceitaTexto` | 676 | pública | Executa a responsabilidade interna “documento atual aceita texto”. |
| `textoIndicaDocumentoAusente` | 683 | pública | Executa a responsabilidade interna “texto indica documento ausente”. |

## `src/domain/documents-ui.js`

Regra de domínio: documents ui.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `limparTextoAudioDoc` | 49 | pública | Executa a responsabilidade interna “limpar texto audio doc”. |
| `imagemPorAreaTipo` | 57 | pública | Executa a responsabilidade interna “imagem por area tipo”. |
| `imagemPorCaso` | 62 | pública | Executa a responsabilidade interna “imagem por caso”. |
| `criarTelaComImagemValidada` | 67 | pública | Cria tela com imagem validada. |
| `fraseEnvioDocumentoAudio` | 79 | pública | Executa a responsabilidade interna “frase envio documento audio”. |
| `textoAudioTelaDocumentoCaso` | 98 | pública | Executa a responsabilidade interna “texto audio tela documento caso”. |
| `numeroFalado` | 116 | interna | Executa a responsabilidade interna “numero falado”. |
| `textoAudioAcaoDocumental` | 136 | interna | Executa a responsabilidade interna “texto audio acao documental”. |
| `telaDocsPendentesComImagem` | 146 | pública | Executa a responsabilidade interna “tela docs pendentes com imagem”. |
| `montarStatusDocumentosVisual` | 169 | pública | Monta status documentos visual. |
| `telaConcluido` | 191 | pública | Executa a responsabilidade interna “tela concluido”. |
| `telaEnvioDoc` | 221 | pública | Executa a responsabilidade interna “tela envio doc”. |

## `src/domain/drive-files.js`

Regra de domínio: drive files.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `getDrive` | 15 | interna | Executa a responsabilidade interna “get drive”. |
| `detalhesErroDrive` | 21 | pública | Executa a responsabilidade interna “detalhes erro drive”. |
| `escapeDriveQueryValue` | 29 | pública | Executa a responsabilidade interna “escape drive query value”. |
| `getNomePastaArea` | 33 | pública | Executa a responsabilidade interna “get nome pasta area”. |
| `obterOuCriarPastaArea` | 41 | pública | Obtém ou criar pasta area. |
| `criarPastaCliente` | 72 | pública | Cria pasta cliente. |
| `uploadDrive` | 147 | pública | Executa a responsabilidade interna “upload drive”. |
| `obterOuCriarSubpastaDrive` | 172 | pública | Obtém ou criar subpasta drive. |
| `buscarArquivoDrivePorNome` | 205 | pública | Busca arquivo drive por nome. |
| `listarArquivosDriveNaPasta` | 224 | pública | Lista arquivos drive na pasta. |
| `baixarArquivoDrive` | 247 | pública | Executa a responsabilidade interna “baixar arquivo drive”. |
| `salvarArquivoBinarioDrive` | 258 | pública | Salva arquivo binario drive. |
| `lerJsonDrive` | 274 | pública | Executa a responsabilidade interna “ler json drive”. |
| `salvarJsonDrive` | 289 | pública | Salva json drive. |
| `lerJsonEmSubpastaDrive` | 323 | pública | Executa a responsabilidade interna “ler json em subpasta drive”. |
| `salvarJsonEmSubpastaDrive` | 331 | pública | Salva json em subpasta drive. |
| `marcarArquivoDriveSubstituido` | 338 | pública | Marca arquivo drive substituido. |
| `renomearArquivoDrive` | 358 | pública | Executa a responsabilidade interna “renomear arquivo drive”. |
| `uploadPastaAudio` | 375 | pública | Executa a responsabilidade interna “upload pasta audio”. |
| `normalizeDriveFolderResult` | 406 | pública | Executa a responsabilidade interna “normalize drive folder result”. |
| `salvarAudioTranscritoNoCaso` | 413 | pública | Salva audio transcrito no caso. |

## `src/domain/finalization-invariants.js`

Regra de domínio: finalization invariants.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `textoPreenchido` | 1 | interna | Executa a responsabilidade interna “texto preenchido”. |
| `isPlaceholderValue` | 4 | interna | Determina se placeholder value. |
| `collectFinalizationViolations` | 11 | pública | Executa a responsabilidade interna “collect finalization violations”. |
| `assertFinalizationInvariants` | 68 | pública | Executa a responsabilidade interna “assert finalization invariants”. |
| `assertFinalizationOperation` | 78 | pública | Executa a responsabilidade interna “assert finalization operation”. |

## `src/domain/geo-search.js`

Regra de domínio: geo search.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `estadoPorExtenso` | 20 | pública | Executa a responsabilidade interna “estado por extenso”. |
| `buscarPorCEP` | 27 | pública | Busca por cep. |
| `mapearRegiaoPorUF` | 66 | pública | Executa a responsabilidade interna “mapear regiao por uf”. |
| `buscarLocalizacaoGoogleMaps` | 83 | pública | Busca localizacao google maps. |
| `municipioIBGEParaLocalizacao` | 113 | pública | Executa a responsabilidade interna “municipio ibgepara localizacao”. |
| `extrairFiltroUFEstado` | 124 | pública | Executa a responsabilidade interna “extrair filtro ufestado”. |
| `removerFiltroUFEstado` | 138 | pública | Remove filtro ufestado. |
| `distanciaLevenshtein` | 147 | pública | Executa a responsabilidade interna “distancia levenshtein”. |
| `scoreMunicipioBusca` | 171 | pública | Executa a responsabilidade interna “score municipio busca”. |
| `buscarCidadeNaBaseLocal` | 180 | pública | Busca cidade na base local. |
| `carregarMunicipiosIBGE` | 206 | pública | Carrega municipios ibge. |
| `buscarCidadePorNomeInteligente` | 216 | pública | Busca cidade por nome inteligente. |
| `abreviarCidadeBotao` | 246 | pública | Executa a responsabilidade interna “abreviar cidade botao”. |
| `buscarCidadePorNome` | 275 | pública | Busca cidade por nome. |

## `src/domain/github-oidc.js`

Regra de domínio: github oidc.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `decodeBase64Url` | 9 | interna | Executa a responsabilidade interna “decode base64 url”. |
| `decodeJson` | 13 | interna | Executa a responsabilidade interna “decode json”. |
| `oidcKeys` | 17 | interna | Executa a responsabilidade interna “oidc keys”. |
| `expectedAudience` | 30 | interna | Executa a responsabilidade interna “expected audience”. |
| `verifyGitHubActionsOidc` | 35 | pública | Executa a responsabilidade interna “verify git hub actions oidc”. |
| `bearerToken` | 62 | pública | Executa a responsabilidade interna “bearer token”. |

## `src/domain/groq-client-replies.js`

Regra de domínio: groq client replies.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `configurarGroqClientReplies` | 9 | pública | Executa a responsabilidade interna “configurar groq client replies”. |
| `respostaIA` | 13 | pública | Executa a responsabilidade interna “resposta ia”. |
| `respostaIACliente` | 32 | pública | Executa a responsabilidade interna “resposta iacliente”. |

## `src/domain/http-security.js`

Regra de domínio: http security.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `aplicarHeadersSeguranca` | 1 | pública | Aplica headers seguranca. |
| `criarRateLimiter` | 10 | pública | Cria rate limiter. |

## `src/domain/hubspot-analysis-note.js`

Regra de domínio: hubspot analysis note.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `cleanText` | 6 | interna | Executa a responsabilidade interna “clean text”. |
| `redactSensitiveData` | 15 | pública | Executa a responsabilidade interna “redact sensitive data”. |
| `limitNoteBody` | 26 | interna | Executa a responsabilidade interna “limit note body”. |
| `uniqueList` | 32 | interna | Executa a responsabilidade interna “unique list”. |
| `markerForCase` | 49 | pública | Executa a responsabilidade interna “marker for case”. |
| `requiresHumanReview` | 55 | pública | Executa a responsabilidade interna “requires human review”. |
| `addSection` | 66 | interna | Executa a responsabilidade interna “add section”. |
| `formatAnalysisNote` | 74 | pública | Executa a responsabilidade interna “format analysis note”. |
| `hasUsefulContent` | 104 | interna | Determina se existe useful content. |
| `withSyncLock` | 116 | interna | Executa a responsabilidade interna “with sync lock”. |
| `syncAnalysisNote` | 130 | pública | Executa a responsabilidade interna “sync analysis note”. |

## `src/domain/hubspot-contract.js`

Regra de domínio: hubspot contract.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `normalizeText` | 27 | interna | Executa a responsabilidade interna “normalize text”. |
| `isPlaceholderValue` | 35 | pública | Determina se placeholder value. |
| `isValidCpf` | 47 | pública | Determina se valid cpf. |
| `normalizeCpfHubSpot` | 66 | pública | Executa a responsabilidade interna “normalize cpf hub spot”. |
| `normalizeEmailHubSpot` | 71 | interna | Executa a responsabilidade interna “normalize email hub spot”. |
| `validateHubSpotProperties` | 210 | pública | Executa a responsabilidade interna “validate hub spot properties”. |

## `src/domain/hubspot-core.js`

Regra de domínio: hubspot core.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `configurarHubSpotCore` | 16 | pública | Executa a responsabilidade interna “configurar hub spot core”. |
| `HS` | 20 | pública | Executa a responsabilidade interna “hs”. |
| `warnHubSpotPayload` | 22 | interna | Executa a responsabilidade interna “warn hub spot payload”. |
| `normalizarAreaContatoHubSpot` | 56 | interna | Normaliza area contato hub spot. |
| `normalizarTipoContatoHubSpot` | 64 | interna | Normaliza tipo contato hub spot. |
| `emailValidoHubSpot` | 94 | pública | Executa a responsabilidade interna “email valido hub spot”. |
| `montarPropsContatoHubSpot` | 102 | pública | Monta props contato hub spot. |
| `montarPropsAusentesContatoHubSpot` | 157 | pública | Monta props ausentes contato hub spot. |
| `hsBuscarPorPhone` | 170 | pública | Executa a responsabilidade interna “hs buscar por phone”. |
| `hsBuscarContatoSeguro` | 199 | pública | Executa a responsabilidade interna “hs buscar contato seguro”. |
| `hsBuscarPorCpf` | 210 | pública | Executa a responsabilidade interna “hs buscar por cpf”. |
| `hsCriarContato` | 237 | pública | Executa a responsabilidade interna “hs criar contato”. |
| `criacao` | 250 | interna | Executa a responsabilidade interna “criacao”. |
| `hsCriarNegocio` | 279 | pública | Executa a responsabilidade interna “hs criar negocio”. |
| `hsAssociar` | 323 | pública | Executa a responsabilidade interna “hs associar”. |
| `filtrarPropsHubSpot` | 333 | pública | Executa a responsabilidade interna “filtrar props hub spot”. |
| `hsAtualizarContato` | 344 | pública | Executa a responsabilidade interna “hs atualizar contato”. |
| `hsAtualizarNegocio` | 368 | pública | Executa a responsabilidade interna “hs atualizar negocio”. |
| `hsCriarNota` | 392 | pública | Executa a responsabilidade interna “hs criar nota”. |
| `hsCriarNotaNegocio` | 412 | pública | Executa a responsabilidade interna “hs criar nota negocio”. |
| `hsSincronizarNotaAnalise` | 501 | pública | Executa a responsabilidade interna “hs sincronizar nota analise”. |

## `src/domain/hubspot-deal-title.js`

Regra de domínio: hubspot deal title.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `normalizarTextoTitulo` | 13 | interna | Normaliza texto titulo. |
| `siglaAreaNegocio` | 20 | pública | Executa a responsabilidade interna “sigla area negocio”. |
| `numeroCasoNegocio` | 26 | pública | Executa a responsabilidade interna “numero caso negocio”. |
| `siglaNumeroCaso` | 36 | pública | Executa a responsabilidade interna “sigla numero caso”. |
| `siglaCanonicaNegocio` | 41 | pública | Executa a responsabilidade interna “sigla canonica negocio”. |
| `rotuloAreaCasoNegocio` | 78 | pública | Executa a responsabilidade interna “rotulo area caso negocio”. |
| `tipoCompativelComArea` | 84 | interna | Executa a responsabilidade interna “tipo compativel com area”. |
| `nomenclaturaJuridicaTitulo` | 93 | interna | Executa a responsabilidade interna “nomenclatura juridica titulo”. |
| `rotuloTipoCasoNegocio` | 112 | pública | Executa a responsabilidade interna “rotulo tipo caso negocio”. |
| `tipoGenerico` | 124 | interna | Executa a responsabilidade interna “tipo generico”. |
| `classificacaoTituloNegocio` | 142 | pública | Executa a responsabilidade interna “classificacao titulo negocio”. |
| `montarTituloNegocioHubSpot` | 164 | pública | Monta titulo negocio hub spot. |
| `aplicarTituloNegocioHubSpot` | 175 | pública | Aplica titulo negocio hub spot. |

## `src/domain/hubspot-sync.js`

Regra de domínio: hubspot sync.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `classificacaoGenerica` | 34 | interna | Executa a responsabilidade interna “classificacao generica”. |
| `aplicarContextoAtualHubSpot` | 39 | interna | Aplica contexto atual hub spot. |
| `buscarContextoAtualHubSpot` | 62 | interna | Busca contexto atual hub spot. |
| `executarComLockNegocio` | 82 | pública | Executa com lock negocio. |
| `configurarHubSpotSync` | 102 | pública | Executa a responsabilidade interna “configurar hub spot sync”. |
| `hsAtualizarNegocioComEstado` | 107 | pública | Executa a responsabilidade interna “hs atualizar negocio com estado”. |
| `atualizarDealstageSemLock` | 119 | interna | Atualiza dealstage sem lock. |
| `atualizarDealstage` | 154 | pública | Atualiza dealstage. |
| `sincronizarNegocioSemLock` | 159 | interna | Executa a responsabilidade interna “sincronizar negocio sem lock”. |
| `sincronizarNegocio` | 190 | pública | Executa a responsabilidade interna “sincronizar negocio”. |
| `restaurarEstadoNegocioHubSpot` | 195 | pública | Restaura estado negocio hub spot. |
| `deveSincronizarEstadoHubSpot` | 267 | pública | Executa a responsabilidade interna “deve sincronizar estado hub spot”. |
| `sincronizarContatoNegocioHubSpot` | 273 | pública | Executa a responsabilidade interna “sincronizar contato negocio hub spot”. |
| `hsBuscarNegociosDoContato` | 302 | pública | Executa a responsabilidade interna “hs buscar negocios do contato”. |
| `hsBuscarNegocioAbertoDoContato` | 316 | pública | Executa a responsabilidade interna “hs buscar negocio aberto do contato”. |
| `hsBuscarNegocioAbertoInfoDoContato` | 321 | pública | Executa a responsabilidade interna “hs buscar negocio aberto info do contato”. |
| `hsBuscarNegociosComCasoDoContato` | 351 | pública | Executa a responsabilidade interna “hs buscar negocios com caso do contato”. |
| `hsListarNegociosAtivosDoContato` | 391 | pública | Executa a responsabilidade interna “hs listar negocios ativos do contato”. |
| `hsListarNegociosAtivosDoContatoEstrito` | 434 | pública | Executa a responsabilidade interna “hs listar negocios ativos do contato estrito”. |
| `hsAtualizarEtapaNegocio` | 477 | pública | Executa a responsabilidade interna “hs atualizar etapa negocio”. |
| `hsMoverStage` | 484 | pública | Executa a responsabilidade interna “hs mover stage”. |
| `hsMoverStageSeguro` | 492 | pública | Executa a responsabilidade interna “hs mover stage seguro”. |
| `hsAtualizarNegocioSerializado` | 498 | pública | Executa a responsabilidade interna “hs atualizar negocio serializado”. |

## `src/domain/hubspot-task-service.js`

Regra de domínio: hubspot task service.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `clean` | 2 | interna | Executa a responsabilidade interna “clean”. |
| `taskMarker` | 6 | pública | Executa a responsabilidade interna “task marker”. |
| `normalizeTaskSpec` | 12 | pública | Executa a responsabilidade interna “normalize task spec”. |
| `taskProperties` | 30 | pública | Executa a responsabilidade interna “task properties”. |
| `createHubSpotTaskService` | 42 | pública | Executa a responsabilidade interna “create hub spot task service”. |
| `ensureTask` | 47 | interna | Executa a responsabilidade interna “ensure task”. |
| `completeTask` | 73 | interna | Executa a responsabilidade interna “complete task”. |

## `src/domain/human-document-review.js`

Regra de domínio: human document review.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `reviewIdForSha256` | 40 | pública | Executa a responsabilidade interna “review id for sha256”. |
| `validateIsoDate` | 49 | interna | Executa a responsabilidade interna “validate iso date”. |
| `validateReviewDocument` | 56 | pública | Executa a responsabilidade interna “validate review document”. |
| `validateHumanReviewSchema` | 86 | pública | Executa a responsabilidade interna “validate human review schema”. |
| `validateHumanReviewContext` | 116 | pública | Executa a responsabilidade interna “validate human review context”. |
| `assertValidHumanReviewContext` | 153 | pública | Executa a responsabilidade interna “assert valid human review context”. |
| `sanitizeQuarantineReason` | 169 | interna | Executa a responsabilidade interna “sanitize quarantine reason”. |
| `buildHumanReviewCandidates` | 173 | pública | Executa a responsabilidade interna “build human review candidates”. |
| `buildHumanReviewCandidatesFromInventory` | 206 | pública | Executa a responsabilidade interna “build human review candidates from inventory”. |
| `validateCandidatePackageAgainstInventory` | 233 | pública | Executa a responsabilidade interna “validate candidate package against inventory”. |
| `applyHumanReviewToContentInventory` | 258 | pública | Executa a responsabilidade interna “apply human review to content inventory”. |
| `findHumanReviewForDocument` | 278 | pública | Executa a responsabilidade interna “find human review for document”. |
| `shouldQuarantineDocumentWithReview` | 282 | pública | Executa a responsabilidade interna “should quarantine document with review”. |
| `applyHumanReviewToConsolidation` | 290 | pública | Executa a responsabilidade interna “apply human review to consolidation”. |

## `src/domain/human-primary-identity-confirmation.js`

Regra de domínio: human primary identity confirmation.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `normalizeName` | 11 | interna | Executa a responsabilidade interna “normalize name”. |
| `digits` | 13 | interna | Executa a responsabilidade interna “digits”. |
| `reviewIdFor` | 14 | interna | Executa a responsabilidade interna “review id for”. |
| `contentIdFor` | 15 | interna | Executa a responsabilidade interna “content id for”. |
| `validCpf` | 16 | pública | Executa a responsabilidade interna “valid cpf”. |
| `validatePrimaryIdentityConfirmationSchema` | 26 | pública | Executa a responsabilidade interna “validate primary identity confirmation schema”. |
| `validatePrimaryIdentityConfirmationContext` | 68 | pública | Executa a responsabilidade interna “validate primary identity confirmation context”. |
| `applyPrimaryIdentityConfirmation` | 90 | pública | Executa a responsabilidade interna “apply primary identity confirmation”. |
| `removeIdentityMissing` | 101 | interna | Executa a responsabilidade interna “remove identity missing”. |

## `src/domain/identity.js`

Regra de domínio: identity.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `telefoneCanonico` | 3 | pública | Executa a responsabilidade interna “telefone canonico”. |
| `obterContatoId` | 11 | pública | Obtém contato id. |
| `definirContatoId` | 15 | pública | Executa a responsabilidade interna “definir contato id”. |
| `obterNegocioId` | 22 | pública | Obtém negocio id. |
| `definirNegocioId` | 26 | pública | Executa a responsabilidade interna “definir negocio id”. |

## `src/domain/inss-case-reconciliation.js`

Regra de domínio: inss case reconciliation.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `plain` | 10 | interna | Executa a responsabilidade interna “plain”. |
| `tokens` | 15 | interna | Executa a responsabilidade interna “tokens”. |
| `similarity` | 19 | pública | Executa a responsabilidade interna “similarity”. |
| `redactSecrets` | 26 | pública | Executa a responsabilidade interna “redact secrets”. |
| `parseMarkdownCases` | 33 | pública | Executa a responsabilidade interna “parse markdown cases”. |
| `matchMarkdownBlock` | 57 | pública | Executa a responsabilidade interna “match markdown block”. |
| `firstField` | 67 | interna | Executa a responsabilidade interna “first field”. |
| `plausibleName` | 73 | interna | Executa a responsabilidade interna “plausible name”. |
| `cleanOfficialName` | 80 | interna | Executa a responsabilidade interna “clean official name”. |
| `phone` | 152 | interna | Executa a responsabilidade interna “phone”. |
| `classifyParties` | 156 | interna | Executa a responsabilidade interna “classify parties”. |
| `evidenceForCase` | 163 | pública | Executa a responsabilidade interna “evidence for case”. |
| `summarizeCase` | 202 | pública | Executa a responsabilidade interna “summarize case”. |
| `preserve` | 265 | pública | Executa a responsabilidade interna “preserve”. |
| `caseFingerprint` | 271 | pública | Executa a responsabilidade interna “case fingerprint”. |
| `extractCaseSignals` | 275 | pública | Executa a responsabilidade interna “extract case signals”. |
| `unique` | 278 | interna | Executa a responsabilidade interna “unique”. |

## `src/domain/inss-legal-facts.js`

Regra de domínio: inss legal facts.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `plain` | 22 | interna | Executa a responsabilidade interna “plain”. |
| `present` | 27 | interna | Executa a responsabilidade interna “present”. |
| `sameValue` | 31 | pública | Executa a responsabilidade interna “same value”. |
| `answer` | 36 | interna | Executa a responsabilidade interna “answer”. |
| `addFact` | 40 | interna | Executa a responsabilidade interna “add fact”. |
| `firstMatch` | 45 | interna | Executa a responsabilidade interna “first match”. |
| `extractDateNear` | 53 | interna | Executa a responsabilidade interna “extract date near”. |
| `extractBenefit` | 61 | interna | Executa a responsabilidade interna “extract benefit”. |
| `hasUncertainty` | 79 | pública | Determina se existe uncertainty. |
| `extractStandaloneDate` | 85 | interna | Executa a responsabilidade interna “extract standalone date”. |
| `isExplicitCorrection` | 93 | interna | Determina se explicit correction. |
| `previousValue` | 97 | interna | Executa a responsabilidade interna “previous value”. |
| `inferCorrectionField` | 101 | pública | Executa a responsabilidade interna “infer correction field”. |
| `extractCorrectionValue` | 117 | interna | Executa a responsabilidade interna “extract correction value”. |
| `markUncertain` | 139 | interna | Executa a responsabilidade interna “mark uncertain”. |
| `extractInssLegalFacts` | 147 | pública | Executa a responsabilidade interna “extract inss legal facts”. |
| `trustedDocumentFacts` | 220 | pública | Executa a responsabilidade interna “trusted document facts”. |
| `mergeInssFacts` | 231 | pública | Executa a responsabilidade interna “merge inss facts”. |
| `isInssLegalField` | 251 | pública | Determina se inss legal field. |
| `buildInssLegalAnswerResult` | 255 | pública | Executa a responsabilidade interna “build inss legal answer result”. |

## `src/domain/internal-scheduler-plans.js`

Regra de domínio: internal scheduler plans.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `validDate` | 2 | interna | Executa a responsabilidade interna “valid date”. |
| `reminderToday` | 7 | pública | Executa a responsabilidade interna “reminder today”. |
| `consultationScope` | 16 | pública | Executa a responsabilidade interna “consultation scope”. |
| `reengagementScope` | 56 | pública | Executa a responsabilidade interna “reengagement scope”. |
| `consultationLifecycleScope` | 70 | pública | Executa a responsabilidade interna “consultation lifecycle scope”. |

## `src/domain/internal-scheduler.js`

Regra de domínio: internal scheduler.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `sanitizedCode` | 2 | pública | Executa a responsabilidade interna “sanitized code”. |
| `processInternalSchedule` | 7 | pública | Executa a responsabilidade interna “process internal schedule”. |

## `src/domain/lead-temperature.js`

Regra de domínio: lead temperature.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `calcScore` | 21 | pública | Executa a responsabilidade interna “calc score”. |
| `scoreEmocional` | 31 | pública | Executa a responsabilidade interna “score emocional”. |
| `adicionar` | 42 | interna | Executa a responsabilidade interna “adicionar”. |
| `definirTemperatura` | 67 | pública | Executa a responsabilidade interna “definir temperatura”. |
| `getTemperaturaLeadHubSpot` | 83 | pública | Executa a responsabilidade interna “get temperatura lead hub spot”. |
| `mapearTemperatura` | 161 | pública | Executa a responsabilidade interna “mapear temperatura”. |
| `mapearPrioridade` | 170 | pública | Executa a responsabilidade interna “mapear prioridade”. |
| `mapearTipoCaso` | 179 | pública | Executa a responsabilidade interna “mapear tipo caso”. |
| `areaNormalizada` | 214 | interna | Executa a responsabilidade interna “area normalizada”. |

## `src/domain/legacy-intake-router.js`

Regra de domínio: legacy intake router.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `criarLegacyIntakeRouter` | 1 | pública | Cria legacy intake router. |

## `src/domain/legal-assistant-engine.js`

Regra de domínio: legal assistant engine.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `normalizarTexto` | 17 | interna | Normaliza texto. |
| `normalizarArray` | 25 | interna | Normaliza array. |
| `objeto` | 29 | interna | Executa a responsabilidade interna “objeto”. |
| `resposta` | 33 | interna | Executa a responsabilidade interna “resposta”. |
| `resolverEstadoDocumental` | 42 | interna | Resolve estado documental. |
| `montarFontes` | 53 | interna | Monta fontes. |
| `consultaChecklist` | 78 | interna | Executa a responsabilidade interna “consulta checklist”. |
| `consultaPercentual` | 82 | interna | Executa a responsabilidade interna “consulta percentual”. |
| `consultaRegistry` | 86 | interna | Executa a responsabilidade interna “consulta registry”. |
| `consultaUltimoLaudo` | 90 | interna | Executa a responsabilidade interna “consulta ultimo laudo”. |
| `consultaDivergencia` | 94 | interna | Executa a responsabilidade interna “consulta divergencia”. |
| `consultaDossie` | 98 | interna | Executa a responsabilidade interna “consulta dossie”. |
| `requerIA` | 102 | interna | Executa a responsabilidade interna “requer ia”. |
| `itensChecklistPendentes` | 106 | interna | Executa a responsabilidade interna “itens checklist pendentes”. |
| `itensChecklistRecebidos` | 110 | interna | Executa a responsabilidade interna “itens checklist recebidos”. |
| `responderChecklist` | 114 | interna | Responde checklist. |
| `camposExtraidos` | 142 | interna | Executa a responsabilidade interna “campos extraidos”. |
| `documentoElegivel` | 148 | interna | Executa a responsabilidade interna “documento elegivel”. |
| `valorCampoRegistry` | 152 | interna | Executa a responsabilidade interna “valor campo registry”. |
| `ultimoDocumentoPorTipo` | 167 | interna | Executa a responsabilidade interna “ultimo documento por tipo”. |
| `responderRegistry` | 175 | interna | Responde registry. |
| `responderDivergencias` | 198 | interna | Responde divergencias. |
| `responderDossie` | 219 | interna | Responde dossie. |
| `responderHubSpot` | 249 | interna | Responde hub spot. |
| `responderCalendar` | 261 | interna | Responde calendar. |
| `fallbackIA` | 270 | interna | Executa a responsabilidade interna “fallback ia”. |
| `consultarAssistenteJuridico` | 289 | pública | Executa a responsabilidade interna “consultar assistente juridico”. |

## `src/domain/legal-case-nomenclature.js`

Regra de domínio: legal case nomenclature.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `plain` | 86 | interna | Executa a responsabilidade interna “plain”. |
| `present` | 91 | interna | Executa a responsabilidade interna “present”. |
| `unwrap` | 95 | interna | Executa a responsabilidade interna “unwrap”. |
| `normalizedCode` | 100 | interna | Executa a responsabilidade interna “normalized code”. |
| `isCorrection` | 104 | interna | Determina se correction. |
| `isUncertainStatement` | 108 | interna | Determina se uncertain statement. |
| `withoutThirdPartyBenefit` | 112 | interna | Executa a responsabilidade interna “without third party benefit”. |
| `inferSituation` | 121 | pública | Executa a responsabilidade interna “infer situation”. |
| `inferBenefitFacts` | 136 | interna | Executa a responsabilidade interna “infer benefit facts”. |
| `inferArea` | 199 | interna | Executa a responsabilidade interna “infer area”. |
| `inferObjective` | 214 | pública | Executa a responsabilidade interna “infer objective”. |
| `contextualizeObjective` | 228 | interna | Executa a responsabilidade interna “contextualize objective”. |
| `sourcePayload` | 239 | interna | Executa a responsabilidade interna “source payload”. |
| `candidateForSource` | 276 | interna | Executa a responsabilidade interna “candidate for source”. |
| `cloneClassification` | 296 | interna | Executa a responsabilidade interna “clone classification”. |
| `sameClassification` | 305 | interna | Executa a responsabilidade interna “same classification”. |
| `isGenericSubtype` | 309 | interna | Determina se generic subtype. |
| `isGenericArea` | 318 | interna | Determina se generic area. |
| `resolveField` | 323 | interna | Executa a responsabilidade interna “resolve field”. |
| `resolveLegalCaseNomenclature` | 343 | pública | Executa a responsabilidade interna “resolve legal case nomenclature”. |
| `projectLegalCaseNomenclature` | 402 | pública | Executa a responsabilidade interna “project legal case nomenclature”. |
| `applyLegalCaseNomenclatureToUser` | 412 | pública | Executa a responsabilidade interna “apply legal case nomenclature to user”. |

## `src/domain/legal-copilot.js`

Regra de domínio: legal copilot.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `normalizarArea` | 135 | interna | Normaliza area. |
| `valoresTexto` | 148 | interna | Executa a responsabilidade interna “valores texto”. |
| `montarTextoCaso` | 159 | interna | Monta texto caso. |
| `normalizarLista` | 172 | interna | Normaliza lista. |
| `contemDocumento` | 183 | interna | Executa a responsabilidade interna “contem documento”. |
| `camposObrigatoriosPendentes` | 191 | interna | Executa a responsabilidade interna “campos obrigatorios pendentes”. |
| `adicionarRisco` | 200 | interna | Executa a responsabilidade interna “adicionar risco”. |
| `identificarRiscos` | 206 | interna | Executa a responsabilidade interna “identificar riscos”. |
| `calcularUrgencia` | 234 | interna | Calcula urgencia. |
| `analisarCasoJuridico` | 258 | pública | Executa a responsabilidade interna “analisar caso juridico”. |

## `src/domain/legal-dossier.js`

Regra de domínio: legal dossier.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `normalizarArray` | 5 | interna | Normaliza array. |
| `texto` | 9 | interna | Executa a responsabilidade interna “texto”. |
| `primeiroValor` | 14 | interna | Executa a responsabilidade interna “primeiro valor”. |
| `properties` | 18 | interna | Executa a responsabilidade interna “properties”. |
| `versaoVigente` | 22 | interna | Executa a responsabilidade interna “versao vigente”. |
| `camposExtraidos` | 26 | interna | Executa a responsabilidade interna “campos extraidos”. |
| `referenciaDocumento` | 31 | interna | Executa a responsabilidade interna “referencia documento”. |
| `valorCampo` | 43 | interna | Executa a responsabilidade interna “valor campo”. |
| `montarCliente` | 55 | interna | Monta cliente. |
| `montarCaso` | 73 | interna | Monta caso. |
| `montarDocumentacao` | 84 | interna | Monta documentacao. |
| `montarPdfs` | 92 | interna | Monta pdfs. |
| `montarLinks` | 109 | interna | Monta links. |
| `evento` | 127 | interna | Executa a responsabilidade interna “evento”. |
| `montarCronologia` | 136 | interna | Monta cronologia. |
| `montarCopiloto` | 155 | interna | Monta copiloto. |
| `criarDossieJuridico` | 184 | pública | Cria dossie juridico. |

## `src/domain/live-case-executor-bridge.js`

Regra de domínio: live case executor bridge.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `clean` | 5 | pública | Executa a responsabilidade interna “clean”. |
| `comparableName` | 9 | interna | Executa a responsabilidade interna “comparable name”. |
| `buildCanonicalPlan` | 13 | pública | Executa a responsabilidade interna “build canonical plan”. |
| `createLiveCaseFlow` | 103 | pública | Executa a responsabilidade interna “create live case flow”. |
| `executeLiveCaseFlow` | 431 | interna | Executa a responsabilidade interna “execute live case flow”. |

## `src/domain/local-case-document-analysis.js`

Regra de domínio: local case document analysis.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `shouldIgnoreInventoryFile` | 12 | pública | Executa a responsabilidade interna “should ignore inventory file”. |
| `getBlockingReviewReasons` | 18 | pública | Executa a responsabilidade interna “get blocking review reasons”. |
| `sha256` | 29 | pública | Executa a responsabilidade interna “sha256”. |
| `unique` | 30 | interna | Executa a responsabilidade interna “unique”. |
| `digits` | 31 | interna | Executa a responsabilidade interna “digits”. |
| `normalizeKey` | 32 | interna | Executa a responsabilidade interna “normalize key”. |
| `validCpf` | 33 | pública | Executa a responsabilidade interna “valid cpf”. |
| `normalizePhone` | 43 | pública | Executa a responsabilidade interna “normalize phone”. |
| `normalizeEmail` | 49 | pública | Executa a responsabilidade interna “normalize email”. |
| `normalizeName` | 53 | pública | Executa a responsabilidade interna “normalize name”. |
| `normalizeDate` | 56 | interna | Executa a responsabilidade interna “normalize date”. |
| `detectMime` | 63 | pública | Executa a responsabilidade interna “detect mime”. |
| `extensionMatchesMime` | 66 | interna | Executa a responsabilidade interna “extension matches mime”. |
| `renderPdfPages` | 69 | pública | Executa a responsabilidade interna “render pdf pages”. |
| `ocrWithTimeout` | 72 | pública | Executa a responsabilidade interna “ocr with timeout”. |
| `processPage` | 94 | interna | Executa a responsabilidade interna “process page”. |
| `imageWithinLimits` | 105 | interna | Executa a responsabilidade interna “image within limits”. |
| `transientTextFields` | 111 | interna | Executa a responsabilidade interna “transient text fields”. |
| `canonicalizePipeline` | 126 | pública | Executa a responsabilidade interna “canonicalize pipeline”. |
| `normalizedNameSignature` | 146 | interna | Executa a responsabilidade interna “normalized name signature”. |
| `namesSignificantlyDiverge` | 149 | pública | Executa a responsabilidade interna “names significantly diverge”. |
| `consolidateCase` | 162 | pública | Executa a responsabilidade interna “consolidate case”. |
| `collect` | 164 | interna | Executa a responsabilidade interna “collect”. |
| `walkFiles` | 277 | interna | Executa a responsabilidade interna “walk files”. |
| `readCache` | 291 | pública | Executa a responsabilidade interna “read cache”. |
| `atomicJson` | 297 | interna | Executa a responsabilidade interna “atomic json”. |
| `analyzeCaseFolder` | 303 | pública | Executa a responsabilidade interna “analyze case folder”. |
| `csvEscape` | 367 | interna | Executa a responsabilidade interna “csv escape”. |
| `sanitizedFieldState` | 371 | interna | Executa a responsabilidade interna “sanitized field state”. |
| `sanitizeReviewReasons` | 377 | interna | Executa a responsabilidade interna “sanitize review reasons”. |
| `sanitizeCaseAnalysis` | 470 | pública | Executa a responsabilidade interna “sanitize case analysis”. |
| `count` | 496 | interna | Executa a responsabilidade interna “count”. |
| `sanitizeAnalysisReport` | 551 | pública | Executa a responsabilidade interna “sanitize analysis report”. |
| `analysisSummaryCsv` | 560 | pública | Executa a responsabilidade interna “analysis summary csv”. |
| `writeAnalysisReports` | 565 | pública | Executa a responsabilidade interna “write analysis reports”. |

## `src/domain/message-classifiers.js`

Regra de domínio: message classifiers.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `detectarSofrimentoIntenso` | 5 | pública | Detecta sofrimento intenso. |
| `detectarModoAtendimento` | 21 | pública | Detecta modo atendimento. |
| `deveAtivarModoDigitando` | 65 | pública | Executa a responsabilidade interna “deve ativar modo digitando”. |

## `src/domain/meta-waba-validator.js`

Regra de domínio: meta waba validator.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `obterWabaConfigurada` | 6 | interna | Obtém waba configurada. |
| `contarParametrosBody` | 10 | pública | Executa a responsabilidade interna “contar parametros body”. |
| `possuiHeader` | 18 | pública | Executa a responsabilidade interna “possui header”. |
| `normalizarCatalogo` | 22 | pública | Normaliza catalogo. |
| `graphGet` | 35 | interna | Executa a responsabilidade interna “graph get”. |
| `listarTemplatesWaba` | 46 | interna | Lista templates waba. |
| `listarPhoneNumbersWaba` | 69 | interna | Lista phone numbers waba. |
| `registrar` | 92 | interna | Registra registrar. |
| `compararTemplates` | 99 | interna | Executa a responsabilidade interna “comparar templates”. |
| `validarMetaWaba` | 144 | pública | Valida meta waba. |
| `formatarRelatorioMetaWaba` | 222 | pública | Formata relatorio meta waba. |
| `validarMetaWabaNoBoot` | 226 | pública | Valida meta waba no boot. |

## `src/domain/name-normalization.js`

Regra de domínio: name normalization.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `isAllUppercase` | 46 | pública | Determina se all uppercase. |
| `isRecognizedAcronym` | 55 | pública | Determina se recognized acronym. |
| `capitalize` | 62 | interna | Executa a responsabilidade interna “capitalize”. |
| `normalizePersonNameWord` | 70 | interna | Executa a responsabilidade interna “normalize person name word”. |
| `normalizePersonNameToken` | 89 | interna | Executa a responsabilidade interna “normalize person name token”. |
| `normalizeTextWord` | 104 | interna | Executa a responsabilidade interna “normalize text word”. |
| `normalizePersonName` | 137 | pública | Executa a responsabilidade interna “normalize person name”. |
| `normalizeTextWithAcronyms` | 160 | pública | Executa a responsabilidade interna “normalize text with acronyms”. |

## `src/domain/phone-name.js`

Regra de domínio: phone name.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `primeiroNomeCliente` | 7 | pública | Executa a responsabilidade interna “primeiro nome cliente”. |
| `getTelefoneContato` | 14 | pública | Executa a responsabilidade interna “get telefone contato”. |
| `normalizarNumeroWhatsAppEnvio` | 29 | pública | Normaliza numero whats app envio. |
| `normalizarTelefone` | 54 | pública | Normaliza telefone. |
| `normalizarTelefoneHubSpot` | 60 | pública | Normaliza telefone hub spot. |
| `primeiroEUltimoNome` | 74 | pública | Executa a responsabilidade interna “primeiro eultimo nome”. |
| `normalizarNomeComparacao` | 81 | pública | Normaliza nome comparacao. |
| `formatarTelefoneExibicao` | 90 | pública | Formata telefone exibicao. |
| `formatarTelefoneAudio` | 99 | pública | Formata telefone audio. |
| `digitoParaVozTelefone` | 120 | pública | Executa a responsabilidade interna “digito para voz telefone”. |
| `numeroDoisDigitosParaVoz` | 135 | pública | Executa a responsabilidade interna “numero dois digitos para voz”. |
| `normalizarTokenNome` | 207 | pública | Normaliza token nome. |
| `ehNomeAparente` | 211 | pública | Determina se nome aparente. |
| `extrairNomeDaCorrecaoExplicita` | 241 | pública | Executa a responsabilidade interna “extrair nome da correcao explicita”. |
| `parecePuraNegacaoSemNome` | 284 | pública | Executa a responsabilidade interna “parece pura negacao sem nome”. |
| `getNomeAtualizado` | 289 | pública | Executa a responsabilidade interna “get nome atualizado”. |
| `getPrimeiroNome` | 294 | pública | Executa a responsabilidade interna “get primeiro nome”. |
| `getPrimeiroNomeRetomada` | 298 | pública | Executa a responsabilidade interna “get primeiro nome retomada”. |

## `src/domain/post-audio-router.js`

Regra de domínio: post audio router.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `criarPostAudioRouter` | 1 | pública | Cria post audio router. |

## `src/domain/post-human-action-context-repository.js`

Regra de domínio: post human action context repository.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `normalizeRow` | 5 | pública | Executa a responsabilidade interna “normalize row”. |

## `src/domain/post-human-adaptive-sender.js`

Regra de domínio: post human adaptive sender.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `enviarSolicitacaoAdaptativa` | 6 | pública | Envia solicitacao adaptativa. |

## `src/domain/post-human-complementary-fields.js`

Regra de domínio: post human complementary fields.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `present` | 75 | interna | Executa a responsabilidade interna “present”. |
| `normalize` | 77 | interna | Executa a responsabilidade interna “normalize”. |
| `normalizeIndicator` | 78 | interna | Executa a responsabilidade interna “normalize indicator”. |
| `properties` | 81 | interna | Executa a responsabilidade interna “properties”. |
| `read` | 82 | interna | Executa a responsabilidade interna “read”. |
| `sourceLoaded` | 87 | interna | Executa a responsabilidade interna “source loaded”. |
| `respostaValida` | 88 | pública | Executa a responsabilidade interna “resposta valida”. |
| `recebeBeneficioConfirmado` | 96 | pública | Executa a responsabilidade interna “recebe beneficio confirmado”. |
| `indicadorNbObrigatorio` | 101 | pública | Executa a responsabilidade interna “indicador nb obrigatorio”. |
| `camposJuridicosInssCondicionais` | 107 | interna | Executa a responsabilidade interna “campos juridicos inss condicionais”. |
| `resolveComplementaryContext` | 112 | pública | Executa a responsabilidade interna “resolve complementary context”. |
| `resolveComplementaryFields` | 204 | pública | Executa a responsabilidade interna “resolve complementary fields”. |

## `src/domain/post-human-cycle-model.js`

Regra de domínio: post human cycle model.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `nowIso` | 23 | interna | Executa a responsabilidade interna “now iso”. |
| `normalizeRow` | 25 | pública | Executa a responsabilidade interna “normalize row”. |

## `src/domain/post-human-dispatcher.js`

Regra de domínio: post human dispatcher.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `notHandled` | 5 | interna | Executa a responsabilidade interna “not handled”. |
| `normalizeResult` | 16 | pública | Executa a responsabilidade interna “normalize result”. |
| `logSafely` | 32 | pública | Executa a responsabilidade interna “log safely”. |
| `createPostHumanDispatcher` | 38 | pública | Executa a responsabilidade interna “create post human dispatcher”. |
| `recoverPostHumanCycles` | 98 | pública | Executa a responsabilidade interna “recover post human cycles”. |

## `src/domain/post-human-document-analyzer.js`

Regra de domínio: post human document analyzer.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `unique` | 11 | interna | Executa a responsabilidade interna “unique”. |
| `analisarEstadoDocumental` | 17 | pública | Executa a responsabilidade interna “analisar estado documental”. |

## `src/domain/post-human-document-pipeline.js`

Regra de domínio: post human document pipeline.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `same` | 2 | interna | Executa a responsabilidade interna “same”. |
| `createLegacyDocumentPipeline` | 6 | pública | Executa a responsabilidade interna “create legacy document pipeline”. |

## `src/domain/post-human-document-reevaluation.js`

Regra de domínio: post human document reevaluation.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `reevaluatePostHumanForDecision` | 2 | pública | Executa a responsabilidade interna “reevaluate post human for decision”. |

## `src/domain/post-human-feature-flag.js`

Regra de domínio: post human feature flag.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `isPostHumanComplementationEnabled` | 1 | pública | Determina se post human complementation enabled. |

## `src/domain/post-human-flow.js`

Regra de domínio: post human flow.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `processPostHumanCycle` | 6 | pública | Executa a responsabilidade interna “process post human cycle”. |

## `src/domain/post-human-hubspot-updater.js`

Regra de domínio: post human hubspot updater.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `normalize` | 14 | interna | Executa a responsabilidade interna “normalize”. |
| `empty` | 16 | interna | Executa a responsabilidade interna “empty”. |
| `jsonObject` | 17 | interna | Executa a responsabilidade interna “json object”. |
| `planSafeUpdate` | 27 | pública | Executa a responsabilidade interna “plan safe update”. |
| `atualizarHubSpotSeguro` | 50 | pública | Atualiza hub spot seguro. |

## `src/domain/post-human-response-handler.js`

Regra de domínio: post human response handler.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `classify` | 5 | pública | Executa a responsabilidade interna “classify”. |
| `resolverCiclo` | 13 | pública | Resolve ciclo. |
| `tratarRespostaClientePosAtendimento` | 28 | pública | Executa a responsabilidade interna “tratar resposta cliente pos atendimento”. |

## `src/domain/post-human-safe-log.js`

Regra de domínio: post human safe log.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `sanitizeSensitive` | 2 | pública | Executa a responsabilidade interna “sanitize sensitive”. |
| `sanitizeObject` | 10 | pública | Executa a responsabilidade interna “sanitize object”. |
| `sanitizeError` | 22 | pública | Executa a responsabilidade interna “sanitize error”. |
| `safeCycleLog` | 26 | pública | Executa a responsabilidade interna “safe cycle log”. |

## `src/domain/post-human-solicitation-builder.js`

Regra de domínio: post human solicitation builder.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `catalogoDocumentalCanonico` | 9 | interna | Executa a responsabilidade interna “catalogo documental canonico”. |
| `nomesDocumentos` | 25 | interna | Executa a responsabilidade interna “nomes documentos”. |
| `construirSolicitacaoDocumentos` | 36 | interna | Constrói solicitacao documentos. |
| `construirSolicitacao` | 56 | pública | Constrói solicitacao. |

## `src/domain/pre-atendimento-classifier.js`

Regra de domínio: pre atendimento classifier.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `textoNormalizadoPreAtendimento` | 9 | pública | Executa a responsabilidade interna “texto normalizado pre atendimento”. |
| `pareceCasoParaTerceiroPreAtendimento` | 13 | pública | Executa a responsabilidade interna “parece caso para terceiro pre atendimento”. |
| `relacaoTerceiroPreAtendimento` | 36 | pública | Executa a responsabilidade interna “relacao terceiro pre atendimento”. |
| `parecePedidoAdvogadoDiretoPreAtendimento` | 61 | pública | Executa a responsabilidade interna “parece pedido advogado direto pre atendimento”. |
| `parecePerguntaFuncionalPreAtendimento` | 67 | pública | Executa a responsabilidade interna “parece pergunta funcional pre atendimento”. |
| `pareceDuvidaPreAtendimento` | 75 | pública | Executa a responsabilidade interna “parece duvida pre atendimento”. |
| `pareceRelatoJuridicoAntecipado` | 85 | pública | Executa a responsabilidade interna “parece relato juridico antecipado”. |
| `temaJuridicoPreAtendimento` | 103 | pública | Executa a responsabilidade interna “tema juridico pre atendimento”. |
| `classificarImprevistoPreAtendimentoIA` | 114 | pública | Classifica imprevisto pre atendimento ia. |
| `classificarEntradaPreAtendimento` | 159 | pública | Classifica entrada pre atendimento. |
| `respostaCurtaDuvidaPreAtendimento` | 181 | pública | Executa a responsabilidade interna “resposta curta duvida pre atendimento”. |

## `src/domain/pre-atendimento-ui.js`

Regra de domínio: pre atendimento ui.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `descricaoRelacaoTerceiroPreAtendimento` | 4 | pública | Executa a responsabilidade interna “descricao relacao terceiro pre atendimento”. |
| `perguntaAtualPreAtendimento` | 31 | pública | Executa a responsabilidade interna “pergunta atual pre atendimento”. |
| `gerarMensagemAcolhimento` | 135 | pública | Gera mensagem acolhimento. |

## `src/domain/public-image-validator.js`

Regra de domínio: public image validator.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `imageSignatureMatches` | 10 | pública | Executa a responsabilidade interna “image signature matches”. |
| `extensionMatches` | 21 | interna | Executa a responsabilidade interna “extension matches”. |
| `validatePublicImageUrl` | 28 | pública | Executa a responsabilidade interna “validate public image url”. |
| `clearPublicImageValidationCache` | 83 | pública | Executa a responsabilidade interna “clear public image validation cache”. |

## `src/domain/public-lgpd-pages.js`

Regra de domínio: public lgpd pages.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `escapeHtml` | 4 | interna | Executa a responsabilidade interna “escape html”. |
| `pageLayout` | 10 | interna | Executa a responsabilidade interna “page layout”. |
| `privacyPolicyPage` | 50 | pública | Executa a responsabilidade interna “privacy policy page”. |
| `dataDeletionPage` | 69 | pública | Executa a responsabilidade interna “data deletion page”. |

## `src/domain/pvr-existing-resource-preflight.js`

Regra de domínio: pvr existing resource preflight.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `result` | 6 | interna | Executa a responsabilidade interna “result”. |
| `contactKeys` | 10 | interna | Executa a responsabilidade interna “contact keys”. |
| `idsFrom` | 18 | interna | Executa a responsabilidade interna “ids from”. |
| `preflightExistingPvrResources` | 25 | pública | Executa a responsabilidade interna “preflight existing pvr resources”. |
| `reviewReasonsAfterPvrPreflight` | 67 | pública | Executa a responsabilidade interna “review reasons after pvr preflight”. |

## `src/domain/pvr-final-artifacts.js`

Regra de domínio: pvr final artifacts.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `fail` | 11 | interna | Executa a responsabilidade interna “fail”. |
| `json` | 12 | interna | Executa a responsabilidade interna “json”. |
| `clone` | 13 | interna | Executa a responsabilidade interna “clone”. |
| `validateSynchronizedPvrBasePlan` | 14 | pública | Executa a responsabilidade interna “validate synchronized pvr base plan”. |
| `driveRulesFor` | 23 | interna | Executa a responsabilidade interna “drive rules for”. |
| `createPvrFinalArtifacts` | 30 | pública | Executa a responsabilidade interna “create pvr final artifacts”. |
| `artifactPaths` | 57 | interna | Executa a responsabilidade interna “artifact paths”. |
| `readIfPresent` | 63 | interna | Executa a responsabilidade interna “read if present”. |
| `writePvrFinalArtifacts` | 67 | pública | Executa a responsabilidade interna “write pvr final artifacts”. |

## `src/domain/reengagement-cancel-webhook.js`

Regra de domínio: reengagement cancel webhook.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `valorTexto` | 5 | interna | Executa a responsabilidade interna “valor texto”. |
| `montarPayloadCancelamentoReengajamento` | 9 | pública | Monta payload cancelamento reengajamento. |
| `cancelarReengajamentosPendentes` | 27 | pública | Cancela reengajamentos pendentes. |

## `src/domain/reengagement-engine.js`

Regra de domínio: reengagement engine.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `normalizarStage` | 27 | interna | Normaliza stage. |
| `lista` | 31 | interna | Executa a responsabilidade interna “lista”. |
| `temTexto` | 35 | interna | Executa a responsabilidade interna “tem texto”. |
| `timestampMs` | 39 | interna | Executa a responsabilidade interna “timestamp ms”. |
| `idadeDesde` | 46 | interna | Executa a responsabilidade interna “idade desde”. |
| `criarEvento` | 52 | interna | Cria evento. |
| `avaliarElegibilidadeReengajamento` | 61 | pública | Executa a responsabilidade interna “avaliar elegibilidade reengajamento”. |

## `src/domain/reengagement-planner.js`

Regra de domínio: reengagement planner.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `timestampMs` | 16 | interna | Executa a responsabilidade interna “timestamp ms”. |
| `valorTexto` | 23 | interna | Executa a responsabilidade interna “valor texto”. |
| `telefoneUsuario` | 27 | interna | Executa a responsabilidade interna “telefone usuario”. |
| `idJob` | 38 | interna | Executa a responsabilidade interna “id job”. |
| `scheduledForEvento` | 45 | interna | Executa a responsabilidade interna “scheduled for evento”. |
| `avaliarComRelogio` | 57 | interna | Executa a responsabilidade interna “avaliar com relogio”. |
| `normalizarEntrada` | 71 | interna | Normaliza entrada. |
| `planejarReengajamentos` | 87 | pública | Executa a responsabilidade interna “planejar reengajamentos”. |

## `src/domain/retomada-summary.js`

Regra de domínio: retomada summary.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `montarTextoResumoRetomada` | 4 | pública | Monta texto resumo retomada. |
| `formatarResumoValor` | 36 | interna | Formata resumo valor. |

## `src/domain/safe-client-notification.js`

Regra de domínio: safe client notification.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `insideWindow` | 2 | pública | Executa a responsabilidade interna “inside window”. |
| `notificationKey` | 7 | pública | Executa a responsabilidade interna “notification key”. |
| `sendSafeClientNotification` | 16 | pública | Executa a responsabilidade interna “send safe client notification”. |

## `src/domain/single-case-apply-contracts.js`

Regra de domínio: single case apply contracts.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `canonicalize` | 28 | pública | Executa a responsabilidade interna “canonicalize”. |
| `sha256` | 48 | pública | Executa a responsabilidade interna “sha256”. |
| `deepClone` | 50 | pública | Executa a responsabilidade interna “deep clone”. |
| `deepFreeze` | 51 | pública | Executa a responsabilidade interna “deep freeze”. |
| `contactVerificationProjection` | 52 | pública | Executa a responsabilidade interna “contact verification projection”. |
| `contactVerificationHash` | 71 | pública | Executa a responsabilidade interna “contact verification hash”. |
| `validateContactVerificationEvidence` | 76 | pública | Executa a responsabilidade interna “validate contact verification evidence”. |
| `groupDocuments` | 83 | pública | Executa a responsabilidade interna “group documents”. |
| `authorizableProjection` | 106 | pública | Executa a responsabilidade interna “authorizable projection”. |
| `authorizablePlanHash` | 124 | pública | Executa a responsabilidade interna “authorizable plan hash”. |
| `authorizationScopesForExecution` | 126 | pública | Executa a responsabilidade interna “authorization scopes for execution”. |
| `exactScope` | 131 | pública | Executa a responsabilidade interna “exact scope”. |
| `executionScopeForAuthorization` | 138 | pública | Executa a responsabilidade interna “execution scope for authorization”. |
| `reservationEvidenceProjection` | 148 | pública | Executa a responsabilidade interna “reservation evidence projection”. |
| `reservationEvidenceHash` | 152 | pública | Executa a responsabilidade interna “reservation evidence hash”. |
| `authorizationPayload` | 153 | pública | Executa a responsabilidade interna “authorization payload”. |
| `validateAuthorizationShape` | 160 | pública | Executa a responsabilidade interna “validate authorization shape”. |
| `validateAuthorizationDates` | 176 | pública | Executa a responsabilidade interna “validate authorization dates”. |
| `createAuthorizationVerifier` | 186 | pública | Executa a responsabilidade interna “create authorization verifier”. |
| `validateAuthorizations` | 210 | pública | Executa a responsabilidade interna “validate authorizations”. |

## `src/domain/single-case-apply.js`

Regra de domínio: single case apply.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `fail` | 24 | interna | Executa a responsabilidade interna “fail”. |
| `validId` | 26 | interna | Executa a responsabilidade interna “valid id”. |
| `oneOrNone` | 27 | interna | Executa a responsabilidade interna “one or none”. |
| `evidence` | 28 | interna | Executa a responsabilidade interna “evidence”. |
| `exactKeys` | 29 | interna | Executa a responsabilidade interna “exact keys”. |
| `isPlainObject` | 30 | interna | Determina se plain object. |
| `sanitizedErrorCode` | 32 | pública | Executa a responsabilidade interna “sanitized error code”. |
| `verifyContactEvidence` | 38 | interna | Executa a responsabilidade interna “verify contact evidence”. |
| `verifyDealEvidence` | 39 | interna | Executa a responsabilidade interna “verify deal evidence”. |
| `verifyAssociationEvidence` | 40 | interna | Executa a responsabilidade interna “verify association evidence”. |
| `verifyFolderEvidence` | 41 | interna | Executa a responsabilidade interna “verify folder evidence”. |
| `verifyUploadEvidence` | 42 | interna | Executa a responsabilidade interna “verify upload evidence”. |
| `requiresExistingResources` | 44 | interna | Executa a responsabilidade interna “requires existing resources”. |
| `validateRequiredExistingResourcesPlan` | 48 | pública | Executa a responsabilidade interna “validate required existing resources plan”. |
| `requiredContact` | 57 | interna | Executa a responsabilidade interna “required contact”. |
| `requiredDeal` | 71 | interna | Executa a responsabilidade interna “required deal”. |
| `requiredFolder` | 79 | interna | Executa a responsabilidade interna “required folder”. |
| `preflightRequiredExistingResources` | 88 | pública | Executa a responsabilidade interna “preflight required existing resources”. |
| `prepareCheckpointForExecution` | 108 | interna | Executa a responsabilidade interna “prepare checkpoint for execution”. |
| `validateAdapters` | 116 | pública | Executa a responsabilidade interna “validate adapters”. |
| `validatePlan` | 124 | pública | Executa a responsabilidade interna “validate plan”. |
| `makeDecision` | 136 | pública | Executa a responsabilidade interna “make decision”. |
| `makeContactDecision` | 141 | pública | Executa a responsabilidade interna “make contact decision”. |
| `newCheckpoint` | 151 | pública | Executa a responsabilidade interna “new checkpoint”. |
| `validateCheckpoint` | 155 | pública | Executa a responsabilidade interna “validate checkpoint”. |
| `transition` | 194 | interna | Executa a responsabilidade interna “transition”. |
| `executeSingleCaseApplyInternal` | 199 | interna | Executa a responsabilidade interna “execute single case apply internal”. |
| `save` | 307 | interna | Executa a responsabilidade interna “save”. |
| `operationContext` | 315 | interna | Executa a responsabilidade interna “operation context”. |
| `run` | 326 | interna | Executa a responsabilidade interna “run”. |
| `createSingleCaseApplyExecutor` | 469 | pública | Executa a responsabilidade interna “create single case apply executor”. |

## `src/domain/single-case-authorization-emitter.js`

Regra de domínio: single case authorization emitter.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `supersedeNonUsableAuthorizations` | 27 | pública | Executa a responsabilidade interna “supersede non usable authorizations”. |
| `checkNoActiveAuthorizations` | 51 | pública | Executa a responsabilidade interna “check no active authorizations”. |
| `emitAuthorizationPair` | 80 | pública | Executa a responsabilidade interna “emit authorization pair”. |

## `src/domain/single-case-authorization-signer.js`

Regra de domínio: single case authorization signer.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `fail` | 5 | interna | Executa a responsabilidade interna “fail”. |
| `createSingleCaseAuthorizationSigner` | 7 | pública | Executa a responsabilidade interna “create single case authorization signer”. |

## `src/domain/single-case-contact-reconciliation.js`

Regra de domínio: single case contact reconciliation.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `validId` | 7 | interna | Executa a responsabilidade interna “valid id”. |
| `checkNamePresentation` | 8 | pública | Executa a responsabilidade interna “check name presentation”. |
| `checkpointState` | 36 | interna | Executa a responsabilidade interna “checkpoint state”. |
| `authorizationResumePlan` | 43 | pública | Executa a responsabilidade interna “authorization resume plan”. |
| `reconciliationEvidenceHash` | 51 | pública | Executa a responsabilidade interna “reconciliation evidence hash”. |
| `reconcileSingleCaseContactCheckpoint` | 61 | pública | Executa a responsabilidade interna “reconcile single case contact checkpoint”. |

## `src/domain/single-case-content-manifest.js`

Regra de domínio: single case content manifest.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `fail` | 6 | interna | Executa a responsabilidade interna “fail”. |
| `sha256` | 8 | interna | Executa a responsabilidade interna “sha256”. |
| `buildContentFiles` | 12 | pública | Executa a responsabilidade interna “build content files”. |

## `src/domain/single-case-import-bridge.js`

Regra de domínio: single case import bridge.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `fail` | 7 | interna | Executa a responsabilidade interna “fail”. |
| `clone` | 8 | interna | Executa a responsabilidade interna “clone”. |
| `inventoryCaseImportId` | 9 | interna | Executa a responsabilidade interna “inventory case import id”. |
| `confirmedIdentity` | 19 | interna | Executa a responsabilidade interna “confirmed identity”. |
| `validPreflight` | 24 | interna | Executa a responsabilidade interna “valid preflight”. |
| `createSingleCaseImportBridgeBasePlan` | 35 | pública | Executa a responsabilidade interna “create single case import bridge base plan”. |
| `synchronizePvrAdoptionToBasePlan` | 76 | pública | Executa a responsabilidade interna “synchronize pvr adoption to base plan”. |

## `src/domain/single-case-plan-generator.js`

Regra de domínio: single case plan generator.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `fail` | 14 | interna | Executa a responsabilidade interna “fail”. |
| `hash` | 15 | interna | Determina se existe h. |
| `clone` | 16 | interna | Executa a responsabilidade interna “clone”. |
| `documentPlanDeclarationFor` | 17 | pública | Executa a responsabilidade interna “document plan declaration for”. |
| `validDestination` | 28 | interna | Executa a responsabilidade interna “valid destination”. |
| `generateSingleCaseApplyPlan` | 32 | pública | Executa a responsabilidade interna “generate single case apply plan”. |
| `choices` | 80 | interna | Executa a responsabilidade interna “choices”. |

## `src/domain/single-case-rebind-contracts.js`

Regra de domínio: single case rebind contracts.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `fail` | 16 | interna | Executa a responsabilidade interna “fail”. |
| `validateAuthorizationIds` | 20 | interna | Executa a responsabilidade interna “validate authorization ids”. |
| `normalizeAuthorizationSet` | 28 | pública | Executa a responsabilidade interna “normalize authorization set”. |
| `computeAuthorizationSetHash` | 32 | pública | Executa a responsabilidade interna “compute authorization set hash”. |
| `validateReason` | 37 | pública | Executa a responsabilidade interna “validate reason”. |
| `validateNewHashes` | 43 | interna | Executa a responsabilidade interna “validate new hashes”. |
| `validateRequestedBy` | 55 | pública | Executa a responsabilidade interna “validate requested by”. |
| `validateReconciliationEvidence` | 70 | pública | Executa a responsabilidade interna “validate reconciliation evidence”. |
| `computeReconciliationEvidenceHash` | 101 | pública | Executa a responsabilidade interna “compute reconciliation evidence hash”. |
| `validateCheckpointEligibility` | 111 | pública | Executa a responsabilidade interna “validate checkpoint eligibility”. |
| `computeRebindId` | 196 | pública | Executa a responsabilidade interna “compute rebind id”. |
| `validateRebindRequest` | 211 | pública | Executa a responsabilidade interna “validate rebind request”. |
| `createRebindRequest` | 241 | pública | Executa a responsabilidade interna “create rebind request”. |
| `sanitizeRebindResponse` | 299 | pública | Executa a responsabilidade interna “sanitize rebind response”. |
| `createRebindAuditMetadata` | 322 | pública | Executa a responsabilidade interna “create rebind audit metadata”. |
| `validateResumeProofRequest` | 339 | pública | Executa a responsabilidade interna “validate resume proof request”. |
| `validateResumeProof` | 373 | pública | Executa a responsabilidade interna “validate resume proof”. |
| `sanitizeResumeProofResponse` | 404 | pública | Executa a responsabilidade interna “sanitize resume proof response”. |

## `src/domain/single-case-target.js`

Regra de domínio: single case target.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `fail` | 10 | interna | Executa a responsabilidade interna “fail”. |
| `caseFingerprintFor` | 11 | pública | Executa a responsabilidade interna “case fingerprint for”. |
| `validateCaseFingerprint` | 16 | pública | Executa a responsabilidade interna “validate case fingerprint”. |
| `validateP1PlanContract` | 21 | pública | Executa a responsabilidade interna “validate p1 plan contract”. |
| `resolveP1Target` | 29 | pública | Executa a responsabilidade interna “resolve p1 target”. |

## `src/domain/stage-handlers/audio-confirmation-handler.js`

Regra de domínio: audio confirmation handler.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `handleAudioConfirmation` | 1 | pública | Executa a responsabilidade interna “handle audio confirmation”. |
| `seguirAposClassificacaoAudio` | 23 | interna | Executa a responsabilidade interna “seguir apos classificacao audio”. |

## `src/domain/stage-handlers/confirm-entry-corrected-name-handler.js`

Regra de domínio: confirm entry corrected name handler.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `handleConfirmEntryCorrectedName` | 1 | pública | Executa a responsabilidade interna “handle confirm entry corrected name”. |

## `src/domain/stage-handlers/confirm-entry-correction-handler.js`

Regra de domínio: confirm entry correction handler.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `handleConfirmEntryCorrection` | 1 | pública | Executa a responsabilidade interna “handle confirm entry correction”. |

## `src/domain/stage-handlers/confirm-entry-final-acceptance-handler.js`

Regra de domínio: confirm entry final acceptance handler.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `handleConfirmEntryFinalAcceptance` | 1 | pública | Executa a responsabilidade interna “handle confirm entry final acceptance”. |

## `src/domain/stage-handlers/confirm-entry-invalid-handler.js`

Regra de domínio: confirm entry invalid handler.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `handleConfirmEntryInvalid` | 1 | pública | Executa a responsabilidade interna “handle confirm entry invalid”. |

## `src/domain/stage-handlers/confirm-entry-phone-handler.js`

Regra de domínio: confirm entry phone handler.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `handleConfirmEntryPhone` | 1 | pública | Executa a responsabilidade interna “handle confirm entry phone”. |

## `src/domain/stage-handlers/description-confirmation-handler.js`

Regra de domínio: description confirmation handler.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `handleDescriptionConfirmation` | 1 | pública | Executa a responsabilidade interna “handle description confirmation”. |

## `src/domain/state-persistence.js`

Regra de domínio: state persistence.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `configurarStatePersistence` | 40 | pública | Executa a responsabilidade interna “configurar state persistence”. |
| `criarWebhookInboxVazia` | 44 | interna | Cria webhook inbox vazia. |
| `clonarJson` | 54 | interna | Executa a responsabilidade interna “clonar json”. |
| `arquivoWebhookInbox` | 58 | interna | Executa a responsabilidade interna “arquivo webhook inbox”. |
| `arquivoSessoesAdminAssistidas` | 62 | interna | Executa a responsabilidade interna “arquivo sessoes admin assistidas”. |
| `arquivoMensagensOutbound` | 66 | interna | Executa a responsabilidade interna “arquivo mensagens outbound”. |
| `arquivoPendenciasAudioPedidoDocumentos` | 67 | interna | Executa a responsabilidade interna “arquivo pendencias audio pedido documentos”. |
| `carregarPendenciasAudioPedidoDocumentos` | 68 | pública | Carrega pendencias audio pedido documentos. |
| `persistirPendenciasAudioPedidoDocumentos` | 96 | interna | Persiste pendencias audio pedido documentos. |
| `textoSeguroPendencia` | 99 | interna | Executa a responsabilidade interna “texto seguro pendencia”. |
| `chaveAtivaPendencia` | 100 | interna | Executa a responsabilidade interna “chave ativa pendencia”. |
| `operationIdPendencia` | 103 | interna | Executa a responsabilidade interna “operation id pendencia”. |
| `criarPendenciaAudioPedidoDocumentos` | 106 | pública | Cria pendencia audio pedido documentos. |
| `identidadePendenciaConfere` | 128 | interna | Executa a responsabilidade interna “identidade pendencia confere”. |
| `reservarPendenciaAudioPedidoDocumentos` | 136 | pública | Executa a responsabilidade interna “reservar pendencia audio pedido documentos”. |
| `concluirPendenciaAudioPedidoDocumentos` | 148 | pública | Executa a responsabilidade interna “concluir pendencia audio pedido documentos”. |
| `carregarMensagensOutbound` | 161 | pública | Carrega mensagens outbound. |
| `persistirMensagensOutbound` | 173 | interna | Persiste mensagens outbound. |
| `registrarMensagemOutbound` | 177 | pública | Registra mensagem outbound. |
| `atualizarStatusMensagemOutbound` | 193 | pública | Atualiza status mensagem outbound. |
| `limparMensagensOutboundExpiradas` | 225 | interna | Executa a responsabilidade interna “limpar mensagens outbound expiradas”. |
| `erroArquivoTemporariamenteIndisponivel` | 240 | interna | Executa a responsabilidade interna “erro arquivo temporariamente indisponivel”. |
| `esperarSync` | 244 | interna | Executa a responsabilidade interna “esperar sync”. |
| `renomearComRetry` | 250 | interna | Executa a responsabilidade interna “renomear com retry”. |
| `gravarJsonAtomico` | 268 | pública | Executa a responsabilidade interna “gravar json atomico”. |
| `criarChaveWebhookDuravel` | 291 | pública | Cria chave webhook duravel. |
| `limparWebhookReceiptsExpirados` | 306 | interna | Executa a responsabilidade interna “limpar webhook receipts expirados”. |
| `persistirProximaWebhookInbox` | 317 | interna | Persiste proxima webhook inbox. |
| `carregarWebhookInbox` | 323 | pública | Carrega webhook inbox. |
| `registrarMensagensWebhook` | 358 | pública | Registra mensagens webhook. |
| `listarWebhookPendentes` | 398 | pública | Lista webhook pendentes. |
| `alterarRegistroWebhook` | 405 | interna | Executa a responsabilidade interna “alterar registro webhook”. |
| `marcarWebhookProcessing` | 414 | pública | Marca webhook processing. |
| `marcarWebhookCompleted` | 423 | pública | Marca webhook completed. |
| `marcarWebhookError` | 436 | pública | Marca webhook error. |
| `obterEstadoWebhookInbox` | 447 | pública | Obtém estado webhook inbox. |
| `sessaoAdminAssistidaAtiva` | 451 | interna | Executa a responsabilidade interna “sessao admin assistida ativa”. |
| `sessaoAdminAssistidaExpirada` | 455 | interna | Executa a responsabilidade interna “sessao admin assistida expirada”. |
| `serializarSessoesAdminAssistidas` | 466 | interna | Executa a responsabilidade interna “serializar sessoes admin assistidas”. |
| `persistirSessoesAdminAssistidasAgora` | 483 | pública | Persiste sessoes admin assistidas agora. |
| `agendarPersistenciaSessoesAdminAssistidas` | 503 | pública | Agenda persistencia sessoes admin assistidas. |
| `carregarSessoesAdminAssistidasPersistidas` | 510 | pública | Carrega sessoes admin assistidas persistidas. |
| `serializarEstado` | 552 | pública | Executa a responsabilidade interna “serializar estado”. |
| `desserializarEstado` | 592 | pública | Executa a responsabilidade interna “desserializar estado”. |
| `garantirDiretorioDados` | 606 | pública | Garante diretorio dados. |
| `serializarUsers` | 611 | pública | Executa a responsabilidade interna “serializar users”. |
| `persistirUsersAgora` | 643 | pública | Persiste users agora. |
| `agendarPersistenciaUsers` | 685 | pública | Agenda persistencia users. |
| `hidratarUsuarioPersistido` | 698 | pública | Executa a responsabilidade interna “hidratar usuario persistido”. |
| `carregarUsersPersistidos` | 784 | pública | Carrega users persistidos. |

## `src/domain/template-service.js`

Regra de domínio: template service.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `primeiroNomeTemplate` | 11 | pública | Executa a responsabilidade interna “primeiro nome template”. |
| `opcoesTemplate` | 16 | interna | Executa a responsabilidade interna “opcoes template”. |
| `conversaDentroJanela24h` | 20 | pública | Executa a responsabilidade interna “conversa dentro janela24h”. |
| `persistirContextoConversaAposTemplate` | 25 | pública | Persiste contexto conversa apos template. |
| `enviarTemplateCatalogado` | 33 | interna | Envia template catalogado. |
| `casoTerceiro` | 57 | pública | Executa a responsabilidade interna “caso terceiro”. |
| `casoAtualizacao` | 68 | pública | Executa a responsabilidade interna “caso atualizacao”. |
| `templateTipoConsultaLembrete` | 72 | pública | Executa a responsabilidade interna “template tipo consulta lembrete”. |
| `consultaLembrete` | 78 | pública | Executa a responsabilidade interna “consulta lembrete”. |
| `retomadaAtendimento` | 84 | pública | Executa a responsabilidade interna “retomada atendimento”. |
| `atualizacaoCasoSegura` | 93 | pública | Executa a responsabilidade interna “atualizacao caso segura”. |

## `src/domain/text-utils.js`

Regra de domínio: text utils.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `formatarSituacaoJuridica` | 5 | pública | Formata situacao juridica. |
| `resumirFrasesCompletas` | 36 | pública | Executa a responsabilidade interna “resumir frases completas”. |
| `formatarDetalheJuridico` | 55 | pública | Formata detalhe juridico. |
| `detectarReferenciaTerceiro` | 65 | pública | Detecta referencia terceiro. |
| `formatarValorCorrecao` | 85 | pública | Formata valor correcao. |
| `classificarReuniaoCliente` | 93 | pública | Classifica reuniao cliente. |
| `textoAudioOpcoes` | 108 | pública | Executa a responsabilidade interna “texto audio opcoes”. |
| `removerFormatacaoParaAudio` | 119 | pública | Remove formatacao para audio. |
| `textoAudioAutomatico` | 131 | pública | Executa a responsabilidade interna “texto audio automatico”. |
| `textoTemMarcadorVisual` | 140 | pública | Executa a responsabilidade interna “texto tem marcador visual”. |

## `src/domain/webhook-security.js`

Regra de domínio: webhook security.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `compararAssinaturaSegura` | 4 | interna | Executa a responsabilidade interna “comparar assinatura segura”. |
| `validarAssinaturaMeta` | 10 | pública | Valida assinatura meta. |
| `validarWebhookInterno` | 26 | pública | Valida webhook interno. |

## `src/domain/whatsapp-transport.js`

Regra de domínio: whatsapp transport.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `mascararTelefoneLog` | 15 | interna | Mascara telefone log. |
| `digitando` | 22 | pública | Executa a responsabilidade interna “digitando”. |
| `validarDestinatarioWhatsApp` | 41 | pública | Valida destinatario whats app. |
| `validarTextoWhatsApp` | 54 | pública | Valida texto whats app. |
| `validarOpcoesWhatsApp` | 65 | pública | Valida opcoes whats app. |
| `normalizarTituloOpcaoWhatsApp` | 96 | pública | Normaliza titulo opcao whats app. |
| `resultadoEnvio` | 111 | interna | Executa a responsabilidade interna “resultado envio”. |
| `enviarComResultado` | 115 | pública | Envia com resultado. |
| `enviar` | 199 | pública | Envia enviar. |
| `enviarTemplateComResultado` | 203 | pública | Envia template com resultado. |
| `enviarTemplateWhatsApp` | 260 | pública | Envia template whats app. |
| `enviarAudioComResultado` | 264 | pública | Envia audio com resultado. |
| `enviarAudio` | 284 | pública | Envia audio. |
| `enviarImagemComResultado` | 289 | pública | Envia imagem com resultado. |
| `enviarImagemWhatsApp` | 357 | pública | Envia imagem whats app. |

## `src/infrastructure/case-number-reservations-postgres.js`

Infraestrutura e persistência: case number reservations postgres.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `normalizeExpression` | 44 | pública | Executa a responsabilidade interna “normalize expression”. |
| `checkMatches` | 48 | pública | Executa a responsabilidade interna “check matches”. |
| `readStructuralSchema` | 55 | interna | Executa a responsabilidade interna “read structural schema”. |
| `readCheckSchema` | 73 | interna | Executa a responsabilidade interna “read check schema”. |
| `validateBasicCaseNumberReservationSchema` | 86 | pública | Executa a responsabilidade interna “validate basic case number reservation schema”. |
| `validateCaseNumberReservationSchema` | 88 | pública | Executa a responsabilidade interna “validate case number reservation schema”. |
| `validateReservationData` | 94 | pública | Executa a responsabilidade interna “validate reservation data”. |
| `migrationRegistry` | 105 | interna | Executa a responsabilidade interna “migration registry”. |
| `recordMigration` | 111 | interna | Executa a responsabilidade interna “record migration”. |
| `migrateCaseNumberReservations` | 114 | pública | Executa a responsabilidade interna “migrate case number reservations”. |
| `planCaseNumberReservationReconciliation` | 128 | pública | Executa a responsabilidade interna “plan case number reservation reconciliation”. |
| `reconcileCaseNumberReservations` | 139 | pública | Executa a responsabilidade interna “reconcile case number reservations”. |
| `pvrAdoptionKey` | 160 | pública | Executa a responsabilidade interna “pvr adoption key”. |
| `validPvrReservation` | 165 | interna | Executa a responsabilidade interna “valid pvr reservation”. |
| `selectPvrReservation` | 169 | interna | Executa a responsabilidade interna “select pvr reservation”. |
| `adoptExistingPvrReservation` | 178 | pública | Executa a responsabilidade interna “adopt existing pvr reservation”. |

## `src/infrastructure/external-state-repository.js`

Infraestrutura e persistência: external state repository.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `boolEnv` | 31 | interna | Executa a responsabilidade interna “bool env”. |
| `isCiSmokeTest` | 37 | interna | Determina se ci smoke test. |
| `configuredFiles` | 41 | pública | Executa a responsabilidade interna “configured files”. |
| `safeFileName` | 46 | interna | Executa a responsabilidade interna “safe file name”. |
| `checksum` | 52 | interna | Executa a responsabilidade interna “checksum”. |
| `createPool` | 56 | interna | Executa a responsabilidade interna “create pool”. |
| `ensureSchema` | 67 | interna | Executa a responsabilidade interna “ensure schema”. |
| `atomicLocalWrite` | 87 | interna | Executa a responsabilidade interna “atomic local write”. |
| `hydrateLocalCache` | 94 | interna | Executa a responsabilidade interna “hydrate local cache”. |
| `initializeExternalStateRepository` | 110 | pública | Executa a responsabilidade interna “initialize external state repository”. |
| `upsertContent` | 139 | interna | Executa a responsabilidade interna “upsert content”. |
| `enqueue` | 157 | interna | Executa a responsabilidade interna “enqueue”. |
| `mirrorStateFile` | 168 | pública | Executa a responsabilidade interna “mirror state file”. |
| `flushExternalState` | 177 | pública | Executa a responsabilidade interna “flush external state”. |
| `migrateLocalState` | 183 | pública | Executa a responsabilidade interna “migrate local state”. |
| `externalStateHealth` | 208 | pública | Executa a responsabilidade interna “external state health”. |
| `closeExternalStateRepository` | 225 | pública | Executa a responsabilidade interna “close external state repository”. |
| `getPool` | 231 | pública | Executa a responsabilidade interna “get pool”. |

## `src/infrastructure/graceful-shutdown.js`

Infraestrutura e persistência: graceful shutdown.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `criarGracefulShutdown` | 2 | pública | Cria graceful shutdown. |

## `src/infrastructure/internal-scheduler-postgres.js`

Infraestrutura e persistência: internal scheduler postgres.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `fail` | 8 | interna | Executa a responsabilidade interna “fail”. |
| `text` | 10 | interna | Executa a responsabilidade interna “text”. |
| `instant` | 15 | interna | Executa a responsabilidade interna “instant”. |
| `plainObject` | 20 | interna | Executa a responsabilidade interna “plain object”. |
| `validateJob` | 23 | pública | Executa a responsabilidade interna “validate job”. |
| `initializeInternalScheduler` | 37 | pública | Executa a responsabilidade interna “initialize internal scheduler”. |
| `createInternalSchedulerRepository` | 68 | pública | Executa a responsabilidade interna “create internal scheduler repository”. |
| `replaceScope` | 71 | interna | Executa a responsabilidade interna “replace scope”. |
| `claimDue` | 109 | interna | Executa a responsabilidade interna “claim due”. |
| `complete` | 146 | interna | Executa a responsabilidade interna “complete”. |
| `failJob` | 156 | interna | Executa a responsabilidade interna “fail job”. |
| `health` | 171 | interna | Executa a responsabilidade interna “health”. |

## `src/infrastructure/single-case-authorization-postgres.js`

Infraestrutura e persistência: single case authorization postgres.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `sqlTokens` | 85 | pública | Executa a responsabilidade interna “sql tokens”. |
| `parseSqlExpression` | 103 | pública | Executa a responsabilidade interna “parse sql expression”. |
| `peek` | 106 | interna | Executa a responsabilidade interna “peek”. |
| `take` | 107 | interna | Executa a responsabilidade interna “take”. |
| `parseList` | 108 | interna | Executa a responsabilidade interna “parse list”. |
| `parsePrimary` | 109 | interna | Executa a responsabilidade interna “parse primary”. |
| `parseComparison` | 120 | interna | Executa a responsabilidade interna “parse comparison”. |
| `parseNot` | 131 | interna | Executa a responsabilidade interna “parse not”. |
| `parseAnd` | 132 | interna | Executa a responsabilidade interna “parse and”. |
| `parseOr` | 133 | interna | Executa a responsabilidade interna “parse or”. |
| `canonicalSqlExpression` | 136 | pública | Executa a responsabilidade interna “canonical sql expression”. |
| `normalizeSql` | 137 | pública | Executa a responsabilidade interna “normalize sql”. |
| `normalizeDefault` | 138 | pública | Executa a responsabilidade interna “normalize default”. |
| `parsePgArrayLike` | 141 | interna | Executa a responsabilidade interna “parse pg array like”. |
| `ensureStringArray` | 158 | interna | Executa a responsabilidade interna “ensure string array”. |
| `validateExpectedQuery` | 165 | pública | Executa a responsabilidade interna “validate expected query”. |
| `validateConsumeRequest` | 170 | pública | Executa a responsabilidade interna “validate consume request”. |
| `consumeAuthorizationsWith` | 175 | pública | Executa a responsabilidade interna “consume authorizations with”. |
| `validSignature` | 183 | pública | Executa a responsabilidade interna “valid signature”. |
| `mapRow` | 185 | pública | Executa a responsabilidade interna “map row”. |
| `createSingleCaseAuthorizationRepository` | 196 | pública | Executa a responsabilidade interna “create single case authorization repository”. |
| `bindingMatches` | 207 | interna | Executa a responsabilidade interna “binding matches”. |
| `validateSingleCaseAuthorizationSchema` | 239 | pública | Executa a responsabilidade interna “validate single case authorization schema”. |
| `migrateSingleCaseAuthorizations` | 294 | pública | Executa a responsabilidade interna “migrate single case authorizations”. |

## `src/infrastructure/single-case-authorization-v2-migration.js`

Infraestrutura e persistência: single case authorization v2 migration.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `validateAuthorizationV2Schema` | 22 | pública | Executa a responsabilidade interna “validate authorization v2 schema”. |
| `migrateSingleCaseAuthorizationV2` | 35 | pública | Executa a responsabilidade interna “migrate single case authorization v2”. |

## `src/infrastructure/single-case-authorization-v3-migration.js`

Infraestrutura e persistência: single case authorization v3 migration.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `validateAuthorizationV3Schema` | 21 | pública | Executa a responsabilidade interna “validate authorization v3 schema”. |
| `migrateSingleCaseAuthorizationV3` | 36 | pública | Executa a responsabilidade interna “migrate single case authorization v3”. |

## `src/infrastructure/single-case-coordination-postgres.js`

Infraestrutura e persistência: single case coordination postgres.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `column` | 69 | interna | Executa a responsabilidade interna “column”. |
| `fail` | 87 | interna | Executa a responsabilidade interna “fail”. |
| `instant` | 89 | interna | Executa a responsabilidade interna “instant”. |
| `mapError` | 109 | pública | Executa a responsabilidade interna “map error”. |
| `transaction` | 117 | interna | Executa a responsabilidade interna “transaction”. |
| `validRequest` | 123 | interna | Executa a responsabilidade interna “valid request”. |
| `leaseResult` | 124 | interna | Executa a responsabilidade interna “lease result”. |
| `checkpointDecision` | 128 | interna | Executa a responsabilidade interna “checkpoint decision”. |
| `validateStoredCheckpoint` | 129 | pública | Executa a responsabilidade interna “validate stored checkpoint”. |
| `createSingleCaseCoordinationRepository` | 137 | pública | Executa a responsabilidade interna “create single case coordination repository”. |
| `parsePgArrayLike` | 234 | interna | Executa a responsabilidade interna “parse pg array like”. |
| `ensureStringArray` | 248 | interna | Executa a responsabilidade interna “ensure string array”. |
| `validateSingleCaseCoordinationSchema` | 253 | pública | Executa a responsabilidade interna “validate single case coordination schema”. |
| `migrateSingleCaseCoordination` | 309 | pública | Executa a responsabilidade interna “migrate single case coordination”. |

## `src/infrastructure/single-case-rebind-postgres.js`

Infraestrutura e persistência: single case rebind postgres.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `sqlTokens` | 19 | interna | Executa a responsabilidade interna “sql tokens”. |
| `parseSqlExpression` | 36 | interna | Executa a responsabilidade interna “parse sql expression”. |
| `peek` | 39 | interna | Executa a responsabilidade interna “peek”. |
| `take` | 40 | interna | Executa a responsabilidade interna “take”. |
| `parseList` | 41 | interna | Executa a responsabilidade interna “parse list”. |
| `parsePrimary` | 42 | interna | Executa a responsabilidade interna “parse primary”. |
| `parseArithmetic` | 53 | interna | Executa a responsabilidade interna “parse arithmetic”. |
| `parseComparison` | 62 | interna | Executa a responsabilidade interna “parse comparison”. |
| `parseNot` | 73 | interna | Executa a responsabilidade interna “parse not”. |
| `parseAnd` | 74 | interna | Executa a responsabilidade interna “parse and”. |
| `parseOr` | 75 | interna | Executa a responsabilidade interna “parse or”. |
| `canonicalSqlExpression` | 78 | interna | Executa a responsabilidade interna “canonical sql expression”. |
| `validateAuthorizationExecutionScopePair` | 83 | interna | Executa a responsabilidade interna “validate authorization execution scope pair”. |
| `fail` | 167 | interna | Executa a responsabilidade interna “fail”. |
| `instant` | 169 | interna | Executa a responsabilidade interna “instant”. |
| `mapError` | 257 | interna | Executa a responsabilidade interna “map error”. |
| `transaction` | 265 | interna | Executa a responsabilidade interna “transaction”. |
| `parsePgArrayLike` | 281 | interna | Executa a responsabilidade interna “parse pg array like”. |
| `ensureStringArray` | 296 | interna | Executa a responsabilidade interna “ensure string array”. |
| `parseConsumedBy` | 302 | pública | Executa a responsabilidade interna “parse consumed by”. |
| `parseIndexArray` | 314 | interna | Executa a responsabilidade interna “parse index array”. |
| `normalizeIndexColumns` | 323 | interna | Executa a responsabilidade interna “normalize index columns”. |
| `normalizeIndexDirections` | 329 | interna | Executa a responsabilidade interna “normalize index directions”. |
| `diagnoseLeaseMutationFailure` | 338 | interna | Executa a responsabilidade interna “diagnose lease mutation failure”. |
| `createSingleCaseRebindPostgresRepository` | 377 | pública | Executa a responsabilidade interna “create single case rebind postgres repository”. |
| `preflightNewAuthorizationPair` | 388 | interna | Executa a responsabilidade interna “preflight new authorization pair”. |
| `validateSingleCaseRebindAuditSchema` | 850 | pública | Executa a responsabilidade interna “validate single case rebind audit schema”. |
| `validateProvisionedSingleCaseRebindAuditSchema` | 941 | pública | Executa a responsabilidade interna “validate provisioned single case rebind audit schema”. |
| `migrateSingleCaseRebindAudit` | 971 | pública | Executa a responsabilidade interna “migrate single case rebind audit”. |

## `src/infrastructure/single-case-rebind-resume-postgres.js`

Infraestrutura e persistência: single case rebind resume postgres.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `fail` | 34 | interna | Executa a responsabilidade interna “fail”. |
| `authorizationInstant` | 36 | pública | Executa a responsabilidade interna “authorization instant”. |
| `mapError` | 46 | interna | Executa a responsabilidade interna “map error”. |
| `parsePgArrayLike` | 56 | interna | Executa a responsabilidade interna “parse pg array like”. |
| `ensureStringArray` | 71 | interna | Executa a responsabilidade interna “ensure string array”. |
| `createSingleCaseRebindResumeVerifier` | 77 | pública | Executa a responsabilidade interna “create single case rebind resume verifier”. |

## `src/scripts/consultation-architecture-audit.js`

Ferramenta operacional controlada: consultation architecture audit.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `normalizar` | 3 | interna | Normaliza normalizar. |
| `listarJs` | 7 | interna | Lista js. |
| `nomeModulo` | 17 | interna | Executa a responsabilidade interna “nome modulo”. |
| `acessoInternoPermitido` | 39 | interna | Executa a responsabilidade interna “acesso interno permitido”. |
| `moduloInternoProtegido` | 48 | interna | Executa a responsabilidade interna “modulo interno protegido”. |
| `extrairImports` | 66 | pública | Executa a responsabilidade interna “extrair imports”. |
| `resolverLocal` | 94 | interna | Resolve local. |
| `auditArchitecture` | 105 | pública | Executa a responsabilidade interna “audit architecture”. |
| `avisar` | 112 | interna | Executa a responsabilidade interna “avisar”. |
| `argumentos` | 222 | interna | Executa a responsabilidade interna “argumentos”. |
| `pegar` | 224 | interna | Executa a responsabilidade interna “pegar”. |

## `src/scripts/consultation-export-dossier.js`

Ferramenta operacional controlada: consultation export dossier.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `valueAfter` | 5 | pública | Executa a responsabilidade interna “value after”. |
| `summaryText` | 18 | pública | Executa a responsabilidade interna “summary text”. |

## `src/scripts/consultation-export-legal.js`

Ferramenta operacional controlada: consultation export legal.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `valueAfter` | 5 | pública | Executa a responsabilidade interna “value after”. |

## `src/utils/hubspot-retry.js`

Utilitário compartilhado: hubspot retry.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `mascararErroHubSpot` | 8 | pública | Mascara erro hub spot. |
| `executarComRetryHubSpot` | 15 | pública | Executa com retry hub spot. |

## `src/utils/logging.js`

Utilitário compartilhado: logging.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `configurarLogging` | 5 | pública | Executa a responsabilidade interna “configurar logging”. |
| `logDebug` | 10 | pública | Executa a responsabilidade interna “log debug”. |
| `mascararTelefoneLog` | 14 | pública | Mascara telefone log. |
| `sanitizarCampoLog` | 20 | interna | Sanitiza campo log. |
| `logInfo` | 26 | pública | Executa a responsabilidade interna “log info”. |
| `logContextoExecucao` | 51 | pública | Executa a responsabilidade interna “log contexto execucao”. |
| `logErro` | 58 | pública | Executa a responsabilidade interna “log erro”. |
| `sanitizarMensagemHubSpot` | 74 | pública | Sanitiza mensagem hub spot. |
| `detalhesErroHubSpot` | 81 | pública | Executa a responsabilidade interna “detalhes erro hub spot”. |
| `logErroHubSpot` | 108 | pública | Executa a responsabilidade interna “log erro hub spot”. |

## `src/utils/text.js`

Utilitário compartilhado: text.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `sanitizarTextoEntrada` | 1 | pública | Sanitiza texto entrada. |
| `normalizarStageKey` | 6 | pública | Normaliza stage key. |
| `normalizarTextoGatilho` | 10 | pública | Normaliza texto gatilho. |
| `ehMensagemEntradaGlobal` | 19 | pública | Determina se mensagem entrada global. |
| `normalizarNomeCidadeBusca` | 32 | pública | Normaliza nome cidade busca. |
| `formatarNome` | 43 | pública | Formata nome. |
| `formatarCidade` | 55 | pública | Formata cidade. |
| `normalizarTextoCRM` | 62 | pública | Normaliza texto crm. |
| `limparTextoSomenteLetras` | 75 | pública | Executa a responsabilidade interna “limpar texto somente letras”. |

## `tts.js`

Síntese de voz, normalização de fala e fallback de áudio.

| Função | Linha | Visibilidade | Responsabilidade |
| --- | ---: | --- | --- |
| `numeroPositivo` | 24 | interna | Executa a responsabilidade interna “numero positivo”. |
| `numerosParaFala` | 29 | pública | Executa a responsabilidade interna “numeros para fala”. |
| `normalizarTextoParaFala` | 46 | pública | Normaliza texto para fala. |
| `limparAudiosAntigos` | 78 | interna | Executa a responsabilidade interna “limpar audios antigos”. |
| `dividirTextoTTS` | 94 | interna | Divide texto tts. |
| `caminhoConcatFfmpeg` | 110 | interna | Executa a responsabilidade interna “caminho concat ffmpeg”. |
| `motivoSanitizado` | 114 | interna | Executa a responsabilidade interna “motivo sanitizado”. |
| `registrarTts` | 121 | interna | Registra tts. |
| `perfilDaAtendente` | 125 | pública | Executa a responsabilidade interna “perfil da atendente”. |
| `urlLightning` | 130 | interna | Executa a responsabilidade interna “url lightning”. |
| `aquecerLightningTts` | 134 | pública | Executa a responsabilidade interna “aquecer lightning tts”. |
| `agendarRetryAquecimentoLightning` | 167 | interna | Agenda retry aquecimento lightning. |
| `iniciarKeepAliveLightningTts` | 178 | pública | Inicia keep alive lightning tts. |
| `wavValido` | 193 | pública | Executa a responsabilidade interna “wav valido”. |
| `baixarWavLightning` | 199 | pública | Executa a responsabilidade interna “baixar wav lightning”. |
| `baixarMp3GoogleTTS` | 225 | interna | Executa a responsabilidade interna “baixar mp3 google tts”. |
| `converterParaOgg` | 234 | interna | Converte para ogg. |
| `gerarComGoogle` | 240 | interna | Gera com google. |
| `gerarAudioAtendente` | 261 | pública | Gera audio atendente. |
| `configurarDependenciasTtsParaTeste` | 295 | pública | Executa a responsabilidade interna “configurar dependencias tts para teste”. |
