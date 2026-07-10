# Auditoria de migração para Tela Declarativa Unificada

Data da análise: 29 de junho de 2026.

## Escopo e método

Esta auditoria considera apenas apresentações destinadas ao cliente. Telas administrativas, webhooks sem interface e mensagens puramente operacionais foram excluídos.

Uma **tela** é uma unidade de apresentação identificável por função, estado ou `id`, ainda que possua conteúdo dinâmico. Variações de uma mesma função (por exemplo, horários e quantidade de casos) permanecem na mesma unidade quando compartilham o mesmo contrato de renderização.

Classificação:

- **DECLARATIVA**: criada por `createClientScreen()` — atualmente importado com o alias local `criarTela` — e com botões e áudio derivados de `acoes[]`.
- **HÍBRIDA**: ainda não usa o modelo declarativo, mas UI e áudio compartilham parcialmente o mesmo payload ou lista de opções.
- **LEGADO**: texto, botões e áudio são montados por caminhos imperativos independentes, ou não existe vínculo estrutural entre eles.

Observação importante: em `server.js` e `documents-ui.js`, `criarTela` é um alias de `createClientScreen`; não há consumo direto do engine de baixo nível nesses arquivos.

## Resumo quantitativo

| Classificação | Total |
| --- | ---: |
| DECLARATIVA | 27 |
| HÍBRIDA | 8 |
| LEGADO | 25 |
| **Total** | **60** |

O conjunto declarativo corresponde a `status_cliente` e 26 contratos documentais. O restante está concentrado em `server.js`, `client-menu-ui.js` e `pre-atendimento-ui.js`.

## Telas declarativas

Todas as telas abaixo:

- são criadas pelo alias `criarTela`, que aponta para `createClientScreen`;
- têm botões produzidos por `gerarBotoesDaTela()`, diretamente ou pelo getter `opcoes`;
- têm áudio produzido por `gerarAudioDaTela()`;
- não importam diretamente `declarative-screen.js`.

| # | Tela / ID | Arquivo e função | Origem do áudio | Origem dos botões | `criarTela()` | `createClientScreen()` | Status |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | `status_cliente` | `server.js:6013`, `telaStatusCliente()` | `textoAudioBase` + `acoes[]`, via `gerarAudioDaTela()` | `acoes[]`, via `gerarBotoesDaTela()` | Sim, alias | Sim | DECLARATIVA |
| 2 | `documentos_introducao` | `server.js:5205`, `enviarIntroDocumentos()` | Engine declarativo | `acoes[]` | Sim, alias | Sim | DECLARATIVA |
| 3 | `documentos_pendentes` | `src/domain/documents-ui.js:121`, `telaDocsPendentesComImagem()` | Engine declarativo | `acoes[]` | Sim, alias | Sim | DECLARATIVA |
| 4 | `documento_atual` | `src/domain/documents-ui.js:196`, `telaEnvioDoc()` | Engine declarativo | `acoes[]`, derivadas das opções documentais existentes | Sim, alias | Sim | DECLARATIVA |
| 5 | `documento_atual_cpf` | `src/domain/documents-ui.js:196`, `telaEnvioDoc()` | Engine declarativo | `acoes[]` | Sim, alias | Sim | DECLARATIVA |
| 6 | `documentos_concluidos` | `src/domain/documents-ui.js:166`, `telaConcluido()` | Engine declarativo | `acoes[]` | Sim, alias | Sim | DECLARATIVA |
| 7 | `documento_midia_invalida` | `server.js:8484`, `processarMidia()` | Engine declarativo | `acoes[]` | Sim, alias | Sim | DECLARATIVA |
| 8 | `documento_pendente_preservado` | `server.js:8484`, `processarMidia()` | Engine declarativo | `acoes[]` | Sim, alias | Sim | DECLARATIVA |
| 9 | `documento_pasta_indisponivel` | `server.js:8484`, `processarMidia()` | Engine declarativo | `acoes[]` | Sim, alias | Sim | DECLARATIVA |
| 10 | `documento_download_falhou` | `server.js:8484`, `processarMidia()` | Engine declarativo | `acoes[]` | Sim, alias | Sim | DECLARATIVA |
| 11 | `documento_observacao_audio` | `server.js:8484`, `processarMidia()` | Engine declarativo | `acoes[]` | Sim, alias | Sim | DECLARATIVA |
| 12 | `documento_avulso_upload_falhou` | `server.js:8484`, `processarMidia()` | Engine declarativo | `acoes[]` | Sim, alias | Sim | DECLARATIVA |
| 13 | `documento_avulso_recebido` | `server.js:8484`, `processarMidia()` | Engine declarativo | `acoes[]` | Sim, alias | Sim | DECLARATIVA |
| 14 | `documento_guiado_upload_falhou` | `server.js:8484`, `processarMidia()` | Engine declarativo | `acoes[]` | Sim, alias | Sim | DECLARATIVA |
| 15 | `documento_guiado_recebido` | `server.js:8484`, `processarMidia()` | Engine declarativo | `acoes[]` | Sim, alias | Sim | DECLARATIVA |
| 16 | `documento_pendente_ausente` | `server.js:14210`, handler `doc_cliente_anexar` | Engine declarativo | `acoes[]` | Sim, alias | Sim | DECLARATIVA |
| 17 | `documento_avulso_renomeacao_falhou` | `server.js:14224`, handler `doc_cliente_anexar` | Engine declarativo | `acoes[]` | Sim, alias | Sim | DECLARATIVA |
| 18 | `documento_avulso_anexado` | `server.js:14252`, handler `doc_cliente_anexar` | Engine declarativo | `acoes[]` | Sim, alias | Sim | DECLARATIVA |
| 19 | `documento_classificacao_pendente_ausente` | `server.js:14279`, classificação de arquivo avulso | Engine declarativo | `acoes[]` | Sim, alias | Sim | DECLARATIVA |
| 20 | `documento_avulso_classificacao_falhou` | `server.js:14299`, classificação de arquivo avulso | Engine declarativo | `acoes[]` | Sim, alias | Sim | DECLARATIVA |
| 21 | `documento_avulso_classificado` | `server.js:14327`, classificação de arquivo avulso | Engine declarativo | `acoes[]` | Sim, alias | Sim | DECLARATIVA |
| 22 | `documento_envio_extra` | `server.js:14401`, handler `docs_confirmar_envio_extra` | Engine declarativo | `acoes[]` | Sim, alias | Sim | DECLARATIVA |
| 23 | `documento_observacao_texto` | `server.js:14476`, observação textual documental | Engine declarativo | `acoes[]` | Sim, alias | Sim | DECLARATIVA |
| 24 | `documento_reenvio_falhou` | `server.js:14550`, handler `docs_reenviar` | Engine declarativo | `acoes[]` | Sim, alias | Sim | DECLARATIVA |
| 25 | `documento_reenvio_aguardando` | `server.js:14583`, reenvio de documento | Engine declarativo | `acoes[]` vazias; a ação esperada é envio de mídia | Sim, alias | Sim | DECLARATIVA |
| 26 | `documento_complemento_aguardando` | `server.js:14598`, complemento de documento | Engine declarativo | `acoes[]` vazias; a ação esperada é envio de mídia | Sim, alias | Sim | DECLARATIVA |
| 27 | `documentos_continuar_depois` | `server.js:14714`, handler `docs_depois` | Engine declarativo | `acoes[]` | Sim, alias | Sim | DECLARATIVA |

## Telas híbridas

| # | Tela / fluxo | Arquivo e função | Origem do áudio | Origem dos botões | `criarTela()` | `createClientScreen()` | Status |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 28 | Escolha de modo de atendimento | `server.js:1233`, `telaEscolhaModo()`; `pre-atendimento-ui.js`, `perguntaAtualPreAtendimento()` | Campo `audio` do mesmo modelo, enviado por helper legado | `opcoes` do modelo | Não | Não | HÍBRIDA |
| 29 | Para quem é o atendimento | `server.js:1262`, `telaParaQuem()`; `pre-atendimento-ui.js` | Campo `audio` do mesmo modelo | `opcoes` do modelo | Não | Não | HÍBRIDA |
| 30 | Confirmações do pré-atendimento | `src/domain/pre-atendimento-ui.js:34–125`, `perguntaAtualPreAtendimento()` | Campo `audio` do modelo por estado | `opcoes` do modelo por estado | Não | Não | HÍBRIDA |
| 31 | Menu principal do cliente | `client-menu-ui.js:186`, `menuCliente()`; `server.js:5906`, `menuClienteComAudio()` | Montado em `menuClienteComAudio()`, mas enumera `tela.opcoes` por `textoAudioOpcoesMenuCliente()` | `menuCliente().opcoes` | Não | Não | HÍBRIDA |
| 32 | Seleção de caso | `client-menu-ui.js:145`, `montarPainelCasosCliente()`; `server.js:5906` | Gerado a partir da mesma lista de casos, porém em função separada | `casos.map(...)` em `montarPainelCasosCliente()` | Não | Não | HÍBRIDA |
| 33 | Menu “Falar com advogado” | `server.js:5770`, `telaAdvogadoCliente()`; `server.js:6002`, `telaAdvogadoClienteComAudio()` | Texto manual + `textoAudioOpcoes(tela.opcoes)` | `telaAdvogadoCliente().opcoes` | Não | Não | HÍBRIDA |
| 34 | Pergunta automática / opção inválida | `server.js:5839`, `enviarAudioAutomaticoTela()`; `server.js:13459–13484` | `textoAudioAutomatico(payload)` deriva texto e até quatro opções do payload | `payload.opcoes` | Não | Não | HÍBRIDA |
| 35 | Perguntas jurídicas geradas pelo classificador | `src/domain/audio-legal-ai.js:121–136`; consumo em `server.js` | O payload pode ser narrado automaticamente pelo caminho legado | `opcoes` retornadas pelo classificador | Não | Não | HÍBRIDA |

## Telas legadas

| # | Tela / fluxo | Arquivo e função | Origem do áudio | Origem dos botões | `criarTela()` | `createClientScreen()` | Status |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 36 | Retorno de cliente cadastrado | `server.js:6695–6735`, `flowInicio()` e `flowInicioRetorno()` | String manual em `enviarAudioModoVoz()` | Array literal no retorno | Não | Não | LEGADO |
| 37 | Retomada automática | `server.js:6834`, `flowRetomadaAutomatica()` | TTS manual com `gerarAudioAtendente()` | Array literal no retorno | Não | Não | LEGADO |
| 38 | Menu de retomada | `server.js:6862`, `flowRetomadaMenu()` | TTS manual duplicado | Array literal no retorno | Não | Não | LEGADO |
| 39 | Resumo de retomada | `server.js:6890`, `flowResumoRetomada()` | Texto de áudio montado manualmente conforme estado | Opções montadas separadamente | Não | Não | LEGADO |
| 40 | Correção durante retomada | `server.js:6798`, `flowMenuCorrecaoRetomada()` | Lista textual manual dos campos | `camposResumo.map(...)` em caminho separado | Não | Não | LEGADO |
| 41 | Relato livre / descrever caso | `server.js:6590`, `telaDescreverCaso()` e fluxos de relato | Áudio automático ou strings manuais no roteador | Array literal | Não | Não | LEGADO |
| 42 | Confirmação da transcrição | `server.js:919`, `telaConfirmarTranscricao()`; `server.js:7768`, `flowAudioConfirmarTranscricao()` | Texto TTS próprio | Array literal independente | Não | Não | LEGADO |
| 43 | Confirmação de área | `server.js:940–957`, `telaConfirmarArea()` / `telaConfirmarAreaAudio()` | Texto TTS próprio | Array literal independente | Não | Não | LEGADO |
| 44 | Assessoria inicial | `server.js:7887`, `flowAssessoriaInicial()` | Áudio manual condicionado ao relato/classificação | Opções construídas no fluxo | Não | Não | LEGADO |
| 45 | Urgência do caso | `server.js:9257`, `processarUrgenciaOuCorrecao()` e fluxos `gatilho` | Áudio automático/manual conforme entrada | Arrays literais por estado | Não | Não | LEGADO |
| 46 | Confirmação final dos dados | `server.js:5395–5450`, `tela_confirmacao()` / `telaConfirmacaoComImagem()` | `textoAudioConfirmacaoDados()` em chamada separada | `tela_confirmacao().opcoes` | Não | Não | LEGADO |
| 47 | Menu de correção de dados | `server.js:7794–7837`, `flowMenuCorrecao()` e correlatas | Orientação manual ou áudio automático | Opções montadas por campo/estado | Não | Não | LEGADO |
| 48 | Seleção de região e UF | `server.js:3189–3202`, `telaRegioes()` / `telaUFsRegiao()` | Áudio automático do payload, quando aplicável | Arrays e `map()` locais | Não | Não | LEGADO |
| 49 | Horários disponíveis | `server.js:5700`, `iniciarAgendamento()` | Frase manual que não deriva da lista variável de slots | `slots.map(...)` + paginação | Não | Não | LEGADO |
| 50 | Agenda sem horários | `server.js:5700`, ramo sem slots de `iniciarAgendamento()` | String manual | Array literal separado | Não | Não | LEGADO |
| 51 | Confirmar cancelamento de consulta | `server.js:6119`, `telaConfirmarCancelamentoConsultaCliente()` | String manual com data | Array literal separado | Não | Não | LEGADO |
| 52 | Resultado do cancelamento de consulta | `server.js:6160–6270`, `cancelarConsultaCliente()` | Strings manuais por resultado | Botões montados nos retornos | Não | Não | LEGADO |
| 53 | Início de mensagem urgente | `server.js:6365`, `iniciarMensagemUrgenteCliente()` | String manual | Sem botões; aguarda texto/áudio | Não | Não | LEGADO |
| 54 | Confirmação de áudio urgente | `server.js:6600–6635`, `telaConfirmarUrgente()` / `telaConfirmarUrgenteComAudio()` | TTS manual enumera três opções | Array literal independente | Não | Não | LEGADO |
| 55 | Mensagem urgente registrada | `server.js:6413`, `respostaUrgenteRegistradaComAudio()` | String manual | Array literal enviado com imagem/texto | Não | Não | LEGADO |
| 56 | Confirmar abertura de novo caso | `server.js:6310`, `confirmarAberturaNovoCasoCliente()` | String manual | Array construído separadamente | Não | Não | LEGADO |
| 57 | Caso atual ou novo caso | `server.js:6285–6308`, `telaAudioClienteCasoAtualOuNovo()` / `telaClienteCasoAtualOuNovo()` | Duas funções paralelas para áudio e UI | Array literal na função visual | Não | Não | LEGADO |
| 58 | Pedido de cancelamento/desistência | `server.js:6507–6570`, `executarIntencaoCliente()` | String manual | Array literal separado | Não | Não | LEGADO |
| 59 | Ajuda para relato confuso | `server.js:7524`, `telaEsclarecimentoConfuso()` e handlers `confuso_*` | String TTS própria | Array literal separado | Não | Não | LEGADO |
| 60 | Documentos já completos / envio adicional | `server.js:6507–6540`, ramo `documentos` de `executarIntencaoCliente()` | String manual em `enviarAudioModoVoz()` | Objeto literal `telaDocsCompletos.opcoes` | Não | Não | LEGADO |

## Pontos estruturais observados

### Guard atual

`src/domain/declarative-screen-guard.js`:

- fornece `createClientScreen()`;
- marca telas criadas pela fachada;
- avisa em desenvolvimento/teste quando `acoes[]` não é fornecido;
- avisa quando os geradores recebem um objeto não criado pela fachada;
- mantém os warnings desabilitados em produção.

O teste `test/declarative-screen-guard.test.js` impede novos módulos em `src/` de importarem diretamente o engine de baixo nível. Ele não transforma nem bloqueia automaticamente construções imperativas dentro do grande `server.js`; esse arquivo continua sendo a principal superfície pela qual o legado pode crescer.

### Compatibilidade residual em documentos

Apesar da migração das telas documentais identificadas, permanecem dois caminhos de compatibilidade:

1. `enviarGuiaDocs()` ainda aceita string/objeto genérico antes de chamar o engine declarativo (`server.js:5175–5194`).
2. O ramo “documentos já completos” cria `telaDocsCompletos` manualmente (`server.js:6517–6539`).

Esses pontos não foram alterados nesta auditoria.

### Áudio legado

O áudio cliente ainda pode nascer de quatro caminhos:

1. `gerarAudioDaTela()` — declarativo;
2. `enviarAudioModoVoz()` com texto montado manualmente;
3. `enviarAudioAutomaticoTela()` / `textoAudioAutomatico()` a partir de payload legado;
4. chamadas diretas a `gerarAudioAtendente()` em retomadas e confirmações.

Por isso, “usar TTS” não significa que a tela seja declarativa.

## Ranking de prioridade para próximas migrações

### CRÍTICA

| Ordem | Tela/fluxo | Motivo |
| ---: | --- | --- |
| 1 | Menu principal + seleção de caso | É a principal porta de navegação; possui opções e casos dinâmicos, imagem, áudio condicional e alto impacto em usuários com múltiplos casos. |
| 2 | Horários disponíveis + paginação | A quantidade e os rótulos dos slots variam; o áudio atual não deriva das ações reais. É a maior lacuna auditiva dinâmica remanescente. |
| 3 | Retomada automática/menu/resumo | Três implementações próximas, com TTS manual duplicado e decisões críticas de continuar, recomeçar ou encerrar. |

### ALTA

| Ordem | Tela/fluxo | Motivo |
| ---: | --- | --- |
| 4 | Menu “Falar com advogado” e cancelamento de consulta | Ações sensíveis de agenda e urgência; hoje usam UI e áudio paralelos. |
| 5 | Pré-atendimento interativo | Muitas etapas e confirmações; já possui um modelo parcialmente unificado, tornando a migração incremental e de risco controlável. |
| 6 | Confirmação final e correção de dados | Alta densidade de decisões e impacto direto na qualidade cadastral. |
| 7 | Documentos já completos / envio adicional | É o único contrato documental interativo claramente residual fora do padrão atual. |

### MÉDIA

| Ordem | Tela/fluxo | Motivo |
| ---: | --- | --- |
| 8 | Mensagem urgente: entrada, confirmação e sucesso | Fluxo importante, porém com poucas ações e textos estáveis. |
| 9 | Novo caso / caso atual ou novo | Possui caminhos de texto e áudio duplicados, mas poucas opções. |
| 10 | Confirmações de transcrição, área e urgência | Ações relevantes, porém telas curtas e pouco dinâmicas. |
| 11 | Perguntas jurídicas dinâmicas | Grande quantidade de estados; exige caracterização cuidadosa para não tocar nas regras de triagem. |

### BAIXA

| Ordem | Tela/fluxo | Motivo |
| ---: | --- | --- |
| 12 | Seleção de região/UF | Botões dinâmicos, mas fluxo simples e de baixo impacto operacional. |
| 13 | Ajuda para relato confuso e opção inválida | Telas auxiliares, acionadas com menor frequência. |
| 14 | Mensagens sem botões que apenas aguardam texto/áudio | O ganho da fonte única `acoes[]` é pequeno quando não há ação visual. |

## Arquivos candidatos à próxima migração

Em ordem de relevância:

1. `src/domain/client-menu-ui.js`
2. `server.js`
3. `src/domain/pre-atendimento-ui.js`
4. `src/domain/cliente-status-ui.js` — apenas como dependência de conteúdo; a tela de status já está declarativa.
5. `src/domain/audio-legal-ai.js`

Não há justificativa, neste inventário, para modificar `documents-core.js`, integrações de Drive, HubSpot, Calendar ou persistência.

## Recomendação executiva

A próxima etapa mais valiosa é migrar **menu principal e seleção de caso como um único recorte funcional**, porque ambos são produzidos por `client-menu-ui.js`, compartilham dados dinâmicos e concentram o maior risco de divergência entre opções visuais e orientação auditiva.

Depois, o melhor segundo recorte é **agendamento**, começando exclusivamente pela apresentação dos slots e paginação. Essa tela possui a maior variação de ações em runtime e, portanto, o maior benefício direto de acessibilidade ao derivar UI e áudio do mesmo `acoes[]`.

Cada recorte deve permanecer independente. Esta auditoria não recomenda uma migração em massa do `server.js`.
