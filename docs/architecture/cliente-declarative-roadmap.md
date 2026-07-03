# Roadmap declarativo das telas do cliente

Data da auditoria: 30 de junho de 2026.

## Critério de inventário

Foi considerada tela toda unidade de apresentação identificável por função, estado ou `id`, incluindo menus, confirmações, falhas e telas que aguardam texto, áudio ou mídia.

- **Declarativa:** criada por `createClientScreen()` — importado em alguns arquivos com o alias `criarTela` — com áudio e UI derivados da tela.
- **Híbrida:** ainda não usa `createClientScreen()`, mas áudio e botões compartilham parcialmente o mesmo payload ou conjunto de opções.
- **Legada:** áudio e interface são produzidos por caminhos imperativos independentes, ou não existe contrato declarativo.

Telas administrativas e mensagens puramente operacionais foram excluídas.

# Resumo

| Classificação | Quantidade |
| --- | ---: |
| Declarativas | 27 |
| Híbridas | 8 |
| Legadas | 25 |
| **Total** | **60** |

Os commits `ab9b12e`, `292c0db` e `34da2cd` estão presentes no histórico atual. Foram localizados 27 IDs criados pela fachada declarativa: `status_cliente` e 26 telas documentais.

## Telas declarativas

| # | Nome da tela | Arquivo | Função principal | Áudio? | Botões? | Usa `createClientScreen`? | Classificação |
| ---: | --- | --- | --- | :---: | :---: | :---: | --- |
| 1 | Status do caso (`status_cliente`) | `server.js` | `telaStatusCliente()` | Sim | Sim, dinâmicos | Sim | Declarativa |
| 2 | Introdução de documentos (`documentos_introducao`) | `server.js` | `enviarIntroDocumentos()` | Sim | Sim | Sim | Declarativa |
| 3 | Documentos pendentes (`documentos_pendentes`) | `src/domain/documents-ui.js` | `telaDocsPendentesComImagem()` | Sim | Sim | Sim | Declarativa |
| 4 | Documento atual (`documento_atual`) | `src/domain/documents-ui.js` | `telaEnvioDoc()` | Sim | Sim, dinâmicos | Sim | Declarativa |
| 5 | Documento CPF (`documento_atual_cpf`) | `src/domain/documents-ui.js` | `telaEnvioDoc()` | Sim | Sim | Sim | Declarativa |
| 6 | Conclusão dos documentos (`documentos_concluidos`) | `src/domain/documents-ui.js` | `telaConcluido()` | Sim | Sim | Sim | Declarativa |
| 7 | Mídia inválida (`documento_midia_invalida`) | `server.js` | `processarMidia()` | Sim | Sim | Sim | Declarativa |
| 8 | Arquivo pendente preservado (`documento_pendente_preservado`) | `server.js` | `processarMidia()` | Sim | Sim | Sim | Declarativa |
| 9 | Pasta indisponível (`documento_pasta_indisponivel`) | `server.js` | `processarMidia()` | Sim | Sim | Sim | Declarativa |
| 10 | Falha no download (`documento_download_falhou`) | `server.js` | `processarMidia()` | Sim | Sim | Sim | Declarativa |
| 11 | Observação documental por áudio (`documento_observacao_audio`) | `server.js` | `processarMidia()` | Sim | Sim | Sim | Declarativa |
| 12 | Falha no upload avulso (`documento_avulso_upload_falhou`) | `server.js` | `processarMidia()` | Sim | Sim | Sim | Declarativa |
| 13 | Arquivo avulso recebido (`documento_avulso_recebido`) | `server.js` | `processarMidia()` | Sim | Sim | Sim | Declarativa |
| 14 | Falha no upload guiado (`documento_guiado_upload_falhou`) | `server.js` | `processarMidia()` | Sim | Sim | Sim | Declarativa |
| 15 | Documento guiado recebido (`documento_guiado_recebido`) | `server.js` | `processarMidia()` | Sim | Sim, dinâmicos | Sim | Declarativa |
| 16 | Arquivo pendente ausente (`documento_pendente_ausente`) | `server.js` | handler `doc_cliente_anexar` em `processarInterno()` | Sim | Sim | Sim | Declarativa |
| 17 | Falha ao renomear arquivo (`documento_avulso_renomeacao_falhou`) | `server.js` | handler `doc_cliente_anexar` em `processarInterno()` | Sim | Sim | Sim | Declarativa |
| 18 | Documento avulso anexado (`documento_avulso_anexado`) | `server.js` | handler `doc_cliente_anexar` em `processarInterno()` | Sim | Sim | Sim | Declarativa |
| 19 | Arquivo para classificação ausente (`documento_classificacao_pendente_ausente`) | `server.js` | classificação avulsa em `processarInterno()` | Sim | Sim | Sim | Declarativa |
| 20 | Falha na classificação (`documento_avulso_classificacao_falhou`) | `server.js` | classificação avulsa em `processarInterno()` | Sim | Sim | Sim | Declarativa |
| 21 | Documento avulso classificado (`documento_avulso_classificado`) | `server.js` | classificação avulsa em `processarInterno()` | Sim | Sim | Sim | Declarativa |
| 22 | Envio adicional (`documento_envio_extra`) | `server.js` | handler `docs_confirmar_envio_extra` | Sim | Sim | Sim | Declarativa |
| 23 | Observação documental por texto (`documento_observacao_texto`) | `server.js` | fluxo documental em `processarInterno()` | Sim | Sim | Sim | Declarativa |
| 24 | Falha no reenvio (`documento_reenvio_falhou`) | `server.js` | handler `docs_reenviar` | Sim | Sim | Sim | Declarativa |
| 25 | Aguardando reenvio (`documento_reenvio_aguardando`) | `server.js` | handler `docs_reenviar` | Sim | Não; aguarda mídia | Sim | Declarativa |
| 26 | Aguardando complemento (`documento_complemento_aguardando`) | `server.js` | handler `docs_maisFotos` | Sim | Não; aguarda mídia | Sim | Declarativa |
| 27 | Continuar documentos depois (`documentos_continuar_depois`) | `server.js` | handler `docs_depois` | Sim | Sim | Sim | Declarativa |

## Telas híbridas

| # | Nome da tela | Arquivo | Função principal | Áudio? | Botões? | Usa `createClientScreen`? | Classificação |
| ---: | --- | --- | --- | :---: | :---: | :---: | --- |
| 28 | Escolha de atendimento por áudio ou texto | `server.js`; `src/domain/pre-atendimento-ui.js` | `telaEscolhaModo()` / `perguntaAtualPreAtendimento()` | Sim | Sim | Não | Híbrida |
| 29 | Atendimento para si ou terceiro | `server.js`; `src/domain/pre-atendimento-ui.js` | `telaParaQuem()` / `perguntaAtualPreAtendimento()` | Sim | Sim | Não | Híbrida |
| 30 | Confirmações do pré-atendimento | `src/domain/pre-atendimento-ui.js` | `perguntaAtualPreAtendimento()` | Sim | Sim, conforme estado | Não | Híbrida |
| 31 | Menu principal do cliente | `src/domain/client-menu-ui.js`; `server.js` | `menuCliente()` / `menuClienteComAudio()` | Sim | Sim | Não | Híbrida |
| 32 | Seleção de caso | `src/domain/client-menu-ui.js`; `server.js` | `montarPainelCasosCliente()` / `menuClienteComAudio()` | Sim | Sim, dinâmicos | Não | Híbrida |
| 33 | Consulta com advogado | `server.js` | `telaAdvogadoCliente()` / `telaAdvogadoClienteComAudio()` | Sim | Sim | Não | Híbrida |
| 34 | Opção inválida e repetição automática | `server.js` | `enviarAudioAutomaticoTela()` / `textoAudioAutomatico()` | Sim | Sim, reutilizados do payload | Não | Híbrida |
| 35 | Perguntas jurídicas do classificador | `src/domain/audio-legal-ai.js`; `server.js` | classificador e consumidor do `flowMap` | Sim, condicional | Sim, dinâmicos | Não | Híbrida |

## Telas legadas

| # | Nome da tela | Arquivo | Função principal | Áudio? | Botões? | Usa `createClientScreen`? | Classificação |
| ---: | --- | --- | --- | :---: | :---: | :---: | --- |
| 36 | Retorno de cliente cadastrado | `server.js` | `flowInicio()` / `flowInicioRetorno()` | Sim | Sim | Não | Legada |
| 37 | Retomada automática | `server.js` | `flowRetomadaAutomatica()` | Sim | Sim | Não | Legada |
| 38 | Menu de retomada | `server.js` | `flowRetomadaMenu()` | Sim | Sim | Não | Legada |
| 39 | Resumo da retomada | `server.js` | `flowResumoRetomada()` | Sim | Sim | Não | Legada |
| 40 | Correção durante retomada | `server.js` | `flowMenuCorrecaoRetomada()` | Sim | Sim, dinâmicos | Não | Legada |
| 41 | Relato livre / descrição do caso | `server.js` | `telaDescreverCaso()` e fluxos de relato | Sim, condicional | Sim | Não | Legada |
| 42 | Confirmação da transcrição | `server.js` | `telaConfirmarTranscricao()` / `flowAudioConfirmarTranscricao()` | Sim | Sim | Não | Legada |
| 43 | Confirmação da área | `server.js` | `telaConfirmarArea()` / `telaConfirmarAreaAudio()` | Sim | Sim | Não | Legada |
| 44 | Assessoria inicial | `server.js` | `flowAssessoriaInicial()` | Sim | Sim | Não | Legada |
| 45 | Avaliação de urgência | `server.js` | `processarUrgenciaOuCorrecao()` e fluxo `gatilho` | Sim, condicional | Sim | Não | Legada |
| 46 | Confirmação final dos dados | `server.js` | `tela_confirmacao()` / `telaConfirmacaoComImagem()` | Sim | Sim | Não | Legada |
| 47 | Correção de dados | `server.js` | `flowMenuCorrecao()` e funções correlatas | Sim, condicional | Sim, dinâmicos | Não | Legada |
| 48 | Seleção de região e UF | `server.js` | `telaRegioes()` / `telaUFsRegiao()` | Sim, automático | Sim, dinâmicos | Não | Legada |
| 49 | Agendamento: horários disponíveis | `server.js` | `iniciarAgendamento()` | Sim | Sim, slots e paginação dinâmicos | Não | Legada |
| 50 | Agendamento: nenhum horário | `server.js` | ramo sem slots de `iniciarAgendamento()` | Sim | Sim | Não | Legada |
| 51 | Cancelamento: confirmação | `server.js` | `telaConfirmarCancelamentoConsultaCliente()` | Sim | Sim | Não | Legada |
| 52 | Cancelamento: resultado | `server.js` | `cancelarConsultaCliente()` | Sim | Sim | Não | Legada |
| 53 | Mensagem urgente: entrada | `server.js` | `iniciarMensagemUrgenteCliente()` | Sim | Não; aguarda texto/áudio | Não | Legada |
| 54 | Mensagem urgente: confirmação do áudio | `server.js` | `telaConfirmarUrgente()` / `telaConfirmarUrgenteComAudio()` | Sim | Sim | Não | Legada |
| 55 | Mensagem urgente registrada | `server.js` | `respostaUrgenteRegistradaComAudio()` | Sim | Sim | Não | Legada |
| 56 | Confirmação de novo caso | `server.js` | `confirmarAberturaNovoCasoCliente()` | Sim | Sim | Não | Legada |
| 57 | Caso atual ou novo caso | `server.js` | `telaAudioClienteCasoAtualOuNovo()` / `telaClienteCasoAtualOuNovo()` | Sim | Sim | Não | Legada |
| 58 | Pedido de cancelamento ou desistência | `server.js` | ramo `cancelar` de `executarIntencaoCliente()` | Sim | Sim | Não | Legada |
| 59 | Ajuda para relato confuso | `server.js` | `telaEsclarecimentoConfuso()` e handlers `confuso_*` | Sim | Sim | Não | Legada |
| 60 | Documentos já completos / envio adicional | `server.js` | ramo `documentos` de `executarIntencaoCliente()` | Sim | Sim | Não | Legada |

## Fluxos solicitados em destaque

| Fluxo | Situação atual |
| --- | --- |
| Menu principal | Híbrido. Os botões vêm de `menuCliente()`, enquanto `menuClienteComAudio()` monta a narração separadamente, embora reutilize as opções. |
| Seleção de caso | Híbrida. Casos alimentam UI e áudio, mas por transformações separadas. |
| Consulta com advogado | Híbrida. A narração enumera `tela.opcoes`, porém não existe tela declarativa. |
| Mensagem urgente | Legada nas etapas de entrada, confirmação e sucesso. |
| Agendamento | Legado. Slots e paginação são dinâmicos, mas o áudio é uma frase fixa independente. |
| Reagendamento | Usa a mesma tela legada de horários de `iniciarAgendamento()`. |
| Cancelamento | Legado na confirmação e no resultado. |
| Documentos | Há 26 contratos declarativos, mas permanece a tela legada “documentos já completos / envio adicional”. |

# Prioridade de migração

A ordem abaixo considera primeiro frequência de uso, depois risco técnico e, por fim, dependência de regras de negócio.

| Ordem | Recorte | Uso | Risco | Dependência de negócio | Justificativa |
| ---: | --- | --- | --- | --- | --- |
| 1 | Menu principal + seleção de caso | Muito alto | Baixo–médio | Baixa | É a porta central da Área do Cliente; já existe um payload parcialmente comum e a mudança pode ficar restrita à apresentação. |
| 2 | Consulta com advogado | Alto | Baixo | Baixa | Tela pequena, três ações estáveis e áudio já derivado parcialmente das opções. |
| 3 | Retomada automática e menu de retomada | Alto | Médio | Média | Muito visível e possui TTS duplicado, mas exige preservar cuidadosamente estados e timers. |
| 4 | Confirmação final dos dados | Alto | Médio | Média | Tela frequente e importante; depende do conteúdo dinâmico da coleta. |
| 5 | Agendamento e reagendamento | Médio–alto | Médio | Alta | Maior ganho auditivo por causa dos slots variáveis, mas depende de paginação e estado da agenda. |
| 6 | Mensagem urgente | Médio | Baixo–médio | Média | Poucas ações, porém atravessa entrada por texto, áudio e confirmação. |
| 7 | Cancelamento de consulta | Médio | Médio | Alta | Pequena em UI, mas ligada à validação e mutação no Calendar. |
| 8 | Pré-atendimento interativo | Alto | Médio–alto | Alta | Muitas telas; já é híbrido, mas atravessa diversos estados de coleta. |
| 9 | Documento completo / envio adicional residual | Baixo–médio | Baixo | Baixa | Fecha a única tela documental interativa claramente fora do padrão. |
| 10 | Perguntas jurídicas e correções | Variável | Alto | Alta | Grande número de estados e maior risco de alterar a triagem sem intenção. |

# Próxima recomendação

Migrar **menu principal e seleção de caso** como um único recorte de apresentação.

Motivos:

1. são as telas de maior uso da Área do Cliente;
2. já compartilham dados entre UI e áudio, reduzindo o risco da migração;
3. a mudança pode ficar limitada a `src/domain/client-menu-ui.js` e ao consumo em `menuClienteComAudio()`;
4. não exige alterar HubSpot, seleção efetiva do caso, persistência, handlers ou regras de negócio;
5. elimina a principal fonte dinâmica de divergência antes de avançar para fluxos mais sensíveis, como Calendar.

Nenhuma outra migração é recomendada neste relatório.
