# Auditoria declarativa v2 — módulo Cliente

Data: 30 de junho de 2026.

## Método

Foi considerada **tela** cada contrato de apresentação identificável por função, estado ou `id`. Variações que usam o mesmo contrato foram agrupadas; contratos com IDs e comportamentos visuais distintos foram contados separadamente.

Classificação:

- **Declarativa:** criada por `createClientScreen()` diretamente ou pelo alias local `criarTela`, com UI e orientação das ações derivadas de `acoes[]`.
- **Híbrida:** não usa a fachada declarativa, mas compartilha parcialmente o payload ou as opções entre UI e áudio.
- **Legada:** texto, botões e áudio são montados por caminhos imperativos independentes, ou não existe contrato único de apresentação.

Os commits `ab9b12e`, `292c0db`, `34da2cd`, `b04d0fc` e `05285d2` estão presentes no histórico atual.

# Resumo executivo

| Categoria | Quantidade | Percentual |
| --- | ---: | ---: |
| Declarativas | 42 | 61,8% |
| Híbridas | 5 | 7,4% |
| Legadas | 21 | 30,9% |
| **Total** | **68** | **100%** |

Foram encontrados 40 IDs declarativos literais no código. Outros dois IDs são produzidos dinamicamente por `telaCancelamentoIndisponivel()` — `consulta_cancelamento_indisponivel` e `consulta_cancelamento_desatualizado` — chegando a 42 contratos declarativos em runtime.

As áreas de maior uso do cliente já estão declarativas:

- menu principal e seleção de caso;
- status;
- documentos;
- consulta com advogado;
- agendamento e reagendamento;
- cancelamento da consulta.

Restam 26 contratos fora do padrão: cinco híbridos e 21 legados.

# Inventário

Nas observações:

- **CS** = usa `createClientScreen()`;
- **CT** = usa o nome local `criarTela()` — alias de `createClientScreen`;
- **BM** = gera botões manualmente fora de `acoes[]`;
- **AM** = gera áudio manualmente fora de `gerarAudioDaTela()`;
- **Ações** = possui `acoes[]`;
- **Duplicação** = UI e áudio repetem listas/instruções em caminhos independentes.

## Declarativas

| Tela | Arquivo | Classificação | Observações |
| --- | --- | --- | --- |
| Status do caso (`status_cliente`) | `server.js` — `telaStatusCliente()` | Declarativa | Origem: Área do Cliente. CS: sim, via CT; CT: sim; BM: não; AM: não; Ações: sim; duplicação: não. |
| Introdução de documentos (`documentos_introducao`) | `server.js` — `enviarIntroDocumentos()` | Declarativa | Origem: entrada documental. CS: sim, via CT; CT: sim; BM/AM: não; Ações: sim; duplicação: não. |
| Documentos pendentes (`documentos_pendentes`) | `src/domain/documents-ui.js` — `telaDocsPendentesComImagem()` | Declarativa | Origem: retomada de documentos. CS: sim, via CT; CT: sim; BM/AM: não; Ações: sim. |
| Documento atual (`documento_atual`) | `src/domain/documents-ui.js` — `telaEnvioDoc()` | Declarativa | Origem: guia documental. CS: sim, via CT; CT: sim; BM/AM: não; Ações: sim e dinâmicas. |
| Documento CPF (`documento_atual_cpf`) | `src/domain/documents-ui.js` — `telaEnvioDoc()` | Declarativa | Origem: guia do CPF. CS: sim, via CT; CT: sim; BM/AM: não; Ações: sim. |
| Conclusão dos documentos (`documentos_concluidos`) | `src/domain/documents-ui.js` — `telaConcluido()` | Declarativa | Origem: fim do guia. CS: sim, via CT; CT: sim; BM/AM: não; Ações: sim. |
| Mídia inválida (`documento_midia_invalida`) | `server.js` — `processarMidia()` | Declarativa | Origem: recebimento de mídia. CS: sim, via CT; BM/AM: não; Ações: sim. |
| Arquivo pendente preservado (`documento_pendente_preservado`) | `server.js` — `processarMidia()` | Declarativa | Origem: proteção do arquivo avulso. CS: sim, via CT; BM/AM: não; Ações: sim. |
| Pasta indisponível (`documento_pasta_indisponivel`) | `server.js` — `processarMidia()` | Declarativa | Origem: falha operacional antes do upload. CS: sim, via CT; BM/AM: não; Ações: sim. |
| Falha no download (`documento_download_falhou`) | `server.js` — `processarMidia()` | Declarativa | Origem: recebimento WhatsApp. CS: sim, via CT; BM/AM: não; Ações: sim. |
| Observação documental por áudio (`documento_observacao_audio`) | `server.js` — `processarMidia()` | Declarativa | Origem: áudio durante o guia. CS: sim, via CT; BM/AM: não; Ações: sim. |
| Falha no upload avulso (`documento_avulso_upload_falhou`) | `server.js` — `processarMidia()` | Declarativa | Origem: upload avulso. CS: sim, via CT; BM/AM: não; Ações: sim. |
| Arquivo avulso recebido (`documento_avulso_recebido`) | `server.js` — `processarMidia()` | Declarativa | Origem: classificação avulsa. CS: sim, via CT; BM/AM: não; Ações: sim. |
| Falha no upload guiado (`documento_guiado_upload_falhou`) | `server.js` — `processarMidia()` | Declarativa | Origem: upload guiado. CS: sim, via CT; BM/AM: não; Ações: sim. |
| Documento guiado recebido (`documento_guiado_recebido`) | `server.js` — `processarMidia()` | Declarativa | Origem: confirmação do upload. CS: sim, via CT; BM/AM: não; Ações: sim e dinâmicas. |
| Arquivo pendente ausente (`documento_pendente_ausente`) | `server.js` — handler `doc_cliente_anexar` | Declarativa | Origem: confirmação de anexo. CS: sim, via CT; BM/AM: não; Ações: sim. |
| Falha ao renomear arquivo (`documento_avulso_renomeacao_falhou`) | `server.js` — handler `doc_cliente_anexar` | Declarativa | Origem: Drive. CS: sim, via CT; BM/AM: não; Ações: sim. |
| Documento avulso anexado (`documento_avulso_anexado`) | `server.js` — handler `doc_cliente_anexar` | Declarativa | Origem: sucesso do anexo. CS: sim, via CT; BM/AM: não; Ações: sim. |
| Arquivo de classificação ausente (`documento_classificacao_pendente_ausente`) | `server.js` — classificação avulsa | Declarativa | CS: sim, via CT; BM/AM: não; Ações: sim. |
| Falha na classificação (`documento_avulso_classificacao_falhou`) | `server.js` — classificação avulsa | Declarativa | CS: sim, via CT; BM/AM: não; Ações: sim. |
| Documento avulso classificado (`documento_avulso_classificado`) | `server.js` — classificação avulsa | Declarativa | CS: sim, via CT; BM/AM: não; Ações: sim. |
| Envio adicional (`documento_envio_extra`) | `server.js` — handler `docs_confirmar_envio_extra` | Declarativa | CS: sim, via CT; BM/AM: não; Ações: sim. |
| Observação documental por texto (`documento_observacao_texto`) | `server.js` — fluxo documental | Declarativa | CS: sim, via CT; BM/AM: não; Ações: sim. |
| Falha no reenvio (`documento_reenvio_falhou`) | `server.js` — handler `docs_reenviar` | Declarativa | CS: sim, via CT; BM/AM: não; Ações: sim. |
| Aguardando reenvio (`documento_reenvio_aguardando`) | `server.js` — handler `docs_reenviar` | Declarativa | CS: sim, via CT; BM/AM: não; Ações: vazio; aguarda mídia. |
| Aguardando complemento (`documento_complemento_aguardando`) | `server.js` — handler `docs_maisFotos` | Declarativa | CS: sim, via CT; BM/AM: não; Ações: vazio; aguarda mídia. |
| Continuar documentos depois (`documentos_continuar_depois`) | `server.js` — handler `docs_depois` | Declarativa | CS: sim, via CT; BM/AM: não; Ações: sim. |
| Seleção de caso (`selecao_caso_cliente`) | `src/domain/client-menu-ui.js` — `montarPainelCasosCliente()` | Declarativa | Origem: múltiplos casos. CS: sim direto; CT: não; BM/AM: não; Ações: sim e dinâmicas; duplicação: não. |
| Menu principal (`menu_principal_cliente`) | `src/domain/client-menu-ui.js` — `menuCliente()` | Declarativa | Origem: Área do Cliente. CS: sim direto; CT: não; BM/AM: não; Ações: sim; duplicação: não. |
| Consulta com advogado (`consulta_advogado`) | `src/domain/client-appointment-ui.js` — `telaConsultaAdvogado()` | Declarativa | Origem: ação `m_adv`. CS: sim; CT: não; BM/AM: não; Ações: sim. |
| Buscando horários (`consulta_buscando_horarios`) | `src/domain/client-appointment-ui.js` — `telaBuscandoHorarios()` | Declarativa | Origem: início de agendamento/reagendamento. CS: sim; Ações: vazio; sem áudio acionável. |
| Sem horários (`consulta_sem_horarios`) | `src/domain/client-appointment-ui.js` — `telaConsultaSemHorarios()` | Declarativa | Origem: disponibilidade vazia. CS: sim; BM/AM: não; Ações: sim. |
| Horários disponíveis (`consulta_horarios_disponiveis`) | `src/domain/client-appointment-ui.js` — `telaHorariosConsulta()` | Declarativa | Origem: Calendar. CS: sim; BM/AM: não; Ações: slots e paginação dinâmicos. |
| Duração (`consulta_duracao`) | `src/domain/client-appointment-ui.js` — `telaDuracaoConsulta()` | Declarativa | Origem: escolha de slot. CS: sim; BM/AM: não; Ações: sim. |
| Confirmação da consulta (`consulta_confirmacao`) | `src/domain/client-appointment-ui.js` — `telaConfirmacaoConsulta()` | Declarativa | Origem: escolha da duração. CS: sim; BM/AM: não; Ações: sim. |
| Falha no agendamento (`consulta_agendamento_falhou`) | `src/domain/client-appointment-ui.js` — `telaFalhaAgendamento()` | Declarativa | Origem: falha ao criar evento. CS: sim; BM/AM: não; Ações: sim. |
| Consulta agendada (`consulta_agendada`) | `src/domain/client-appointment-ui.js` — `telaAgendamentoConfirmado()` | Declarativa | Origem: sucesso do Calendar. CS: sim; BM/AM: não; Ações: sim. |
| Confirmação do cancelamento (`consulta_cancelamento_confirmacao`) | `src/domain/client-appointment-ui.js` — `telaConfirmarCancelamentoConsulta()` | Declarativa | Origem: ação de cancelamento. CS: sim; BM/AM: não; Ações: sim. |
| Cancelamento indisponível (`consulta_cancelamento_indisponivel`) | `src/domain/client-appointment-ui.js` — `telaCancelamentoIndisponivel()` | Declarativa | Origem: nenhuma consulta ativa. CS: sim; Ações: vazio; UI e áudio pelo engine. |
| Cancelamento desatualizado (`consulta_cancelamento_desatualizado`) | `src/domain/client-appointment-ui.js` — `telaCancelamentoIndisponivel({ alterada: true })` | Declarativa | Origem: revalidação. CS: sim; Ações: vazio; UI e áudio pelo engine. |
| Consulta cancelada (`consulta_cancelada`) | `src/domain/client-appointment-ui.js` — `telaConsultaCancelada()` | Declarativa | Origem: sucesso do cancelamento. CS: sim; BM/AM: não; Ações: sim. |
| Falha no cancelamento (`consulta_cancelamento_falhou`) | `src/domain/client-appointment-ui.js` — `telaFalhaCancelamentoConsulta()` | Declarativa | Origem: erro do Calendar. CS: sim; BM/AM: não; Ações: sim. |

## Híbridas

| Tela | Arquivo | Classificação | Observações |
| --- | --- | --- | --- |
| Escolha entre áudio e texto | `server.js` / `src/domain/pre-atendimento-ui.js` — `telaEscolhaModo()` / `perguntaAtualPreAtendimento()` | Híbrida | CS/CT: não; BM: sim, via `opcoes`; AM: sim, via campo `audio`; Ações: não; duplicação: sim. |
| Atendimento para si ou terceiro | `server.js` / `src/domain/pre-atendimento-ui.js` — `telaParaQuem()` / `perguntaAtualPreAtendimento()` | Híbrida | CS/CT: não; BM: sim; AM: sim; Ações: não; UI e áudio compartilham o mesmo objeto, mas usam campos paralelos. |
| Confirmações do pré-atendimento | `src/domain/pre-atendimento-ui.js` — `perguntaAtualPreAtendimento()` | Híbrida | Abrange nome, WhatsApp e cidade. CS/CT: não; BM/AM: sim; Ações: não; duplicação: sim. |
| Opção inválida / repetição automática | `server.js` — `enviarAudioAutomaticoTela()` / `textoAudioAutomatico()` | Híbrida | CS/CT: não; BM: payload legado; AM: derivado parcialmente do payload; Ações: não; duplicação: parcial. |
| Perguntas jurídicas do classificador | `src/domain/audio-legal-ai.js` / `server.js` — classificador e `flowMap` | Híbrida | CS/CT: não; BM: sim, via `opcoes`; AM: automático/condicional; Ações: não; duplicação: parcial. |

## Legadas

| Tela | Arquivo | Classificação | Observações |
| --- | --- | --- | --- |
| Retorno de cliente cadastrado | `server.js` — `flowInicio()` / `flowInicioRetorno()` | Legada | CS/CT/Ações: não; BM e AM: sim; duplicação: sim. |
| Retomada automática | `server.js` — `flowRetomadaAutomatica()` | Legada | TTS direto por `gerarAudioAtendente()` e botões literais; duplicação: sim. |
| Menu de retomada | `server.js` — `flowRetomadaMenu()` | Legada | TTS direto duplicado e botões literais; duplicação: sim. |
| Resumo da retomada | `server.js` — `flowResumoRetomada()` | Legada | Áudio e opções montados por estado em caminhos separados. |
| Correção durante retomada | `server.js` — `flowMenuCorrecaoRetomada()` | Legada | Campos viram botões e lista de áudio separadamente; alto potencial de divergência. |
| Relato livre / descrição do caso | `server.js` — `telaDescreverCaso()` e fluxos de relato | Legada | BM: sim; AM: automático ou manual; sem `acoes[]`. |
| Confirmação da transcrição | `server.js` — `telaConfirmarTranscricao()` / `flowAudioConfirmarTranscricao()` | Legada | UI e TTS independentes; BM/AM: sim; duplicação: sim. |
| Confirmação da área | `server.js` — `telaConfirmarArea()` / `telaConfirmarAreaAudio()` | Legada | UI e áudio paralelos; sem fachada. |
| Assessoria inicial | `server.js` — `flowAssessoriaInicial()` | Legada | Apresentação condicionada à classificação; botões e áudio fora do engine. |
| Avaliação de urgência | `server.js` — `processarUrgenciaOuCorrecao()` e fluxo `gatilho` | Legada | Diversos retornos literais; áudio condicional e opções paralelas. |
| Confirmação final dos dados | `server.js` — `tela_confirmacao()` / `telaConfirmacaoComImagem()` | Legada | `textoAudioConfirmacaoDados()` e `tela_confirmacao().opcoes` são caminhos independentes. |
| Correção de dados | `server.js` — `flowMenuCorrecao()` e correlatas | Legada | Opções dinâmicas e orientação de áudio separada; grande volume de estados. |
| Seleção de região e UF | `server.js` — `telaRegioes()` / `telaUFsRegiao()` | Legada | Botões dinâmicos por região; áudio automático legado; sem `acoes[]`. |
| Mensagem urgente — entrada | `server.js` — `iniciarMensagemUrgenteCliente()` | Legada | Sem botões, mas texto/áudio não usam contrato declarativo. |
| Mensagem urgente — confirmação do áudio | `server.js` — `telaConfirmarUrgente()` / `telaConfirmarUrgenteComAudio()` | Legada | Três ações repetidas manualmente na UI e no TTS. |
| Mensagem urgente registrada | `server.js` — `respostaUrgenteRegistradaComAudio()` | Legada | Botões e áudio manuais; inclui entrada para novo agendamento. |
| Confirmação de novo caso | `server.js` — `confirmarAberturaNovoCasoCliente()` | Legada | `opcoesNovoCaso` e texto de áudio manual; duplicação das ações. |
| Caso atual ou novo caso | `server.js` — `telaAudioClienteCasoAtualOuNovo()` / `telaClienteCasoAtualOuNovo()` | Legada | Duas funções visuais próximas e narração externa; duplicação: sim. |
| Pedido de cancelamento ou desistência | `server.js` — ramo `cancelar` de `executarIntencaoCliente()` | Legada | Áudio e botões literais independentes. |
| Ajuda para relato confuso | `server.js` — `telaEsclarecimentoConfuso()` e handlers `confuso_*` | Legada | Áudio e opções manuais; sem `acoes[]`. |
| Documentos já completos / envio adicional | `server.js` — ramo `documentos` de `executarIntencaoCliente()` | Legada | Único contrato documental interativo residual: `telaDocsCompletos` é objeto literal com áudio separado. |

# Próximas migrações recomendadas

| Ordem | Recorte | Impacto | Risco | Legado removido | Fundamentação |
| ---: | --- | --- | --- | --- | --- |
| 1 | Escolha de modo de atendimento | Muito alto | Baixo | 1 híbrida | Primeira decisão de todo novo cliente; apenas dois IDs estáveis; objeto de UI/áudio já está parcialmente centralizado. |
| 2 | Atendimento para si ou terceiro | Muito alto | Baixo–médio | 1 híbrida | Tela inicial frequente, poucas ações e sem dependência de integrações externas. |
| 3 | Retomada automática + menu de retomada | Alto | Médio | 2 legadas e TTS duplicado | Remove duplicação explícita e afeta clientes que interrompem o fluxo, mas exige preservar timers e estados. |
| 4 | Confirmação final dos dados | Alto | Médio | 1 legada central | Tela de alto uso e valor cadastral; depende de conteúdo dinâmico, mas não de integração externa para apresentação. |
| 5 | Mensagem urgente | Alto | Médio | 3 legadas | Remove três contratos e melhora acessibilidade de uma ação sensível; atravessa áudio e registro operacional. |
| 6 | Confirmações de transcrição e área | Alto | Médio | 2 legadas | Ações estáveis, porém ligadas ao fluxo de classificação por áudio. |
| 7 | Novo caso / caso atual ou novo | Médio–alto | Médio | 2 legadas | Remove funções paralelas de UI e áudio sem exigir mudar a criação do caso. |
| 8 | Documento completo / envio adicional residual | Médio | Baixo | 1 legada | Pequena e isolada; conclui integralmente a cobertura declarativa documental. |
| 9 | Pré-atendimento restante e correções | Muito alto | Alto | Maior bloco remanescente | Alto volume removido, mas muitos estados e maior risco de regressão funcional. |
| 10 | Perguntas jurídicas do classificador | Alto | Alto | 1 família híbrida extensa | Grande volume de variantes e dependência direta da triagem jurídica. |

# Próxima migração recomendada

**Escolha de modo de atendimento** (`telaEscolhaModo()` / estado `acolhimento_modo`).

É a próxima migração com melhor relação entre impacto e risco:

1. aparece para praticamente todo novo atendimento;
2. possui somente duas ações estáveis;
3. UI e áudio já estão reunidos no mesmo modelo híbrido;
4. não depende de HubSpot, Calendar, Drive ou regras jurídicas;
5. pode ser migrada isoladamente sem incluir “para quem”, nome, WhatsApp ou cidade.

# Ganho arquitetural estimado

- Cobertura declarativa atual: **61,8%** dos contratos de apresentação catalogados.
- Cobertura das principais áreas pós-cadastro: próxima de **100%** para menu, seleção, status, consulta/agendamento e guia documental principal.
- Contratos ainda fora da fachada: **26**.
- Blocos com maior duplicação direta eliminados nas migrações recentes: menus dinâmicos, slots, duração, confirmação, sucesso e falhas de agenda.
- Risco estrutural reduzido: novos botões nas áreas migradas passam a ser narrados automaticamente pelo mesmo `acoes[]`.

O ganho adicional mais seguro agora não vem de uma migração ampla. Ele vem de converter pequenas telas iniciais híbridas, uma por vez, começando pela escolha do modo de atendimento.
