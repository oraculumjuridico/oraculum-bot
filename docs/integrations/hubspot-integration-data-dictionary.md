# Dicionário de Dados Oficial — Bot Oráculum × HubSpot

**Status:** modelo de referência para futuras implementações
**Escopo:** Contact, Deal, Notes, Google Drive, Google Calendar e estado efêmero do bot
**Princípio central:** HubSpot é a fonte da verdade dos dados de negócio; Drive é a fonte dos documentos; Calendar é a fonte da agenda; o bot mantém somente estado transitório.

## 1. Regras de autoridade

1. **Contact representa uma pessoa.**
2. **Deal representa um caso jurídico.**
3. **Note representa narrativa ou evento histórico imutável.**
4. **Google Drive armazena arquivos binários do caso.**
5. **Google Calendar armazena compromissos de consulta.**
6. **O bot mantém somente contexto efêmero necessário para conduzir a conversa atual.**
7. Dados de caso não devem ser gravados em propriedades de Contact.
8. Dados permanentes não devem depender de `estado_bot_snapshot` ou `etapa_do_bot`.
9. Um dado possui uma única fonte da verdade. Cópias em outros sistemas são projeções ou referências.
10. Alterações bidirecionais exigem comparação de versão ou timestamp para evitar sobrescrita silenciosa.

## 2. Convenções

### Obrigatoriedade

- **Sim:** necessário para criar ou operar corretamente o registro.
- **Condicional:** obrigatório somente a partir de determinado evento.
- **Não:** opcional ou derivado.
- **Legado:** mantido apenas durante migração.

### Direções

- **Bot→HubSpot:** o bot captura ou gera e persiste no CRM.
- **HubSpot→Bot:** o bot somente consulta o valor oficial.
- **Bidirecional:** bot e operador podem corrigir, com HubSpot prevalecendo após persistência.
- **Local:** não sai do sistema que é sua fonte da verdade.

### Valores canônicos

- Urgência: `Alta`, `Moderada`, `Baixa`.
- Prioridade HubSpot: `high`, `medium`, `low`.
- Origem: vocabulário controlado, inicialmente `whatsapp`, `instagram`, `facebook`, `site`.
- Temperatura não será um conceito independente no modelo-alvo; quando necessária, será derivada de `hs_priority`.
- Status de consulta: `sem_consulta`, `agendada`, `cancelada`, `encerrada`, `realizada`, `nao_compareceu`.

## 3. Identificadores e associações

| Dado | Objeto | Propriedade/campo | Fonte da verdade | Altera | Consome | Sincronização | Obrigatório | Observações |
|---|---|---|---|---|---|---|---|---|
| ID da pessoa no HubSpot | Contact | Record ID (`contactId`) | HubSpot | HubSpot | bot, admin, integrações | HubSpot→Bot após busca/criação | Sim | Identificador técnico; não deve ser recriado pelo bot |
| ID do caso no HubSpot | Deal | Record ID (`dealId`) | HubSpot | HubSpot | bot, Calendar, Drive, admin | HubSpot→Bot após busca/criação | Sim | Chave técnica da integração do caso |
| Associação pessoa–caso | Contact ↔ Deal | associação CRM | HubSpot | bot ou advogado | bot, HubSpot, relatórios | Bot→HubSpot na abertura; leitura posterior | Sim | Um Contact pode possuir vários Deals |
| Número público do caso | Deal | `numero_de_caso` | HubSpot após criação | ambos | bot, advogado, Notes, Drive, Calendar | Bot→HubSpot na abertura; depois bidirecional controlada | Condicional | Deve ser único e estável |
| ID da pasta do Drive | Drive/Bot | `folderId` | Drive | bot | bot | Drive→Bot na criação/consulta | Condicional | Não é substituído pelo URL |
| Link da pasta do caso | Deal | `pasta_drive` | HubSpot como referência; Drive como destino real | bot | advogado, bot | Bot→HubSpot após criar pasta | Condicional | Label recomendado: “Pasta do caso no Drive” |
| ID do evento de consulta | Calendar | `event.id` | Calendar | Calendar | bot, admin | Calendar→Bot | Condicional | Não deve ser usado sozinho para inferir status |

## 4. Contact — pessoa

| Dado | Propriedade | Fonte da verdade | Altera | Consome | Momento da sincronização | Direção | Obrigatório | Observações técnicas |
|---|---|---|---|---|---|---|---|---|
| Nome | `firstname` | HubSpot | ambos | bot, advogado, mensagens | identificação e correção | Bidirecional | Sim | Não usar nome do perfil como confirmação definitiva |
| Sobrenome | `lastname` | HubSpot | ambos | advogado, relatórios | quando confirmado | Bidirecional | Não | Não inferir automaticamente |
| Telefone principal | `phone` | HubSpot | ambos, com validação | bot, WhatsApp, admin | primeiro contato e correção | Bidirecional | Sim | Normalizado em formato único; chave operacional, não identidade conceitual |
| Telefone alternativo | `mobilephone` | HubSpot | ambos | advogado, bot sob demanda | quando informado | Bidirecional | Não | Não substituir `phone` silenciosamente |
| E-mail | `email` | HubSpot | ambos | advogado, notificações autorizadas | quando confirmado | Bidirecional | Não | Validar formato e consentimento |
| Cidade de residência | `city` | HubSpot | ambos | bot, advogado, relatórios | cadastro e correção | Bidirecional | Condicional | Não duplicar em Deal se for residência |
| Estado/UF | `state` | HubSpot | ambos | bot, advogado, filtros | cadastro e correção | Bidirecional | Condicional | `uf` não existe no schema; usar exclusivamente `state` |
| Data de nascimento | `date_of_birth` | HubSpot | ambos | advogado, análise jurídica | quando necessária | Bidirecional | Não | Substitui `idade`, que se torna obsoleta |
| CPF | `cpf_do_cliente` | HubSpot | ambos, com acesso restrito | advogado; bot somente se autorizado | validação cadastral/documental | Bidirecional controlada | Não | Dado sensível; só manter com finalidade, retenção e controle de acesso definidos |
| Proprietário do Contact | `hubspot_owner_id` | HubSpot | advogado/admin | CRM, relatórios | atribuição/reorganização | HubSpot→Bot | Não | Bot não deve redistribuir automaticamente sem regra formal |
| Data de criação | `createdate` | HubSpot | HubSpot | bot, relatórios | automática | HubSpot→Bot | Sim | Somente leitura |

### Propriedades de Contact descontinuadas no modelo-alvo

| Propriedade | Destino |
|---|---|
| `area_juridica` | Deal `area_juridica` |
| `beneficio` | Deal `tipo_de_caso` ou Note narrativa |
| `beneficio_de_interesse` | Deal `tipo_de_caso` ou Note narrativa |
| `cliente_ja_atendido` | derivado dos Deals associados |
| `fase_do_processo` | Deal `dealstage` |
| `favorite_content_topics` | sem destino; remover após dependências |
| `idade` | Contact `date_of_birth` |
| `numero_caso` | Deal `numero_de_caso` |
| `numero_do_caso` | Deal `numero_de_caso` |
| `origem_lead` | Deal `origem_atendimento` |
| `pasta_drive` | Deal `pasta_drive` |
| `preferred_channels` | revisar futuramente; opções atuais não representam o canal real |
| `situacao_caso` | Deal `dealstage`, `tipo_de_caso` ou Note |
| `tipo_de_caso` | Deal `tipo_de_caso` |

## 5. Deal — caso jurídico

| Dado | Propriedade | Fonte da verdade | Altera | Consome | Momento da sincronização | Direção | Obrigatório | Observações técnicas |
|---|---|---|---|---|---|---|---|---|
| Nome do caso | `dealname` | HubSpot | ambos | advogado, bot, relatórios | criação e correção de identificação | Bidirecional | Sim | Formato legível; não deve carregar estado transitório |
| Pipeline | `pipeline` | HubSpot | advogado/admin | HubSpot, bot | criação | HubSpot→Bot | Sim | Bot usa `default`; mudança exige configuração explícita |
| Estágio do caso | `dealstage` | HubSpot | ambos | bot, advogado, filtros, relatórios | transição jurídica/comercial | Bidirecional | Sim | Não representa consulta nem etapa de conversa |
| Proprietário do caso | `hubspot_owner_id` | HubSpot | advogado/admin | equipe, relatórios, bot | atribuição ou redistribuição | HubSpot→Bot | Sim | Remover owner fixo do contrato futuro |
| Número do caso | `numero_de_caso` | HubSpot após criação | ambos, correção excepcional | todos os componentes | abertura do caso | Bot→HubSpot; depois bidirecional controlada | Condicional | Identificador de negócio, não Record ID |
| Área jurídica | `area_juridica` | HubSpot | ambos | bot, advogado, filtros, relatórios | triagem e reclassificação | Bidirecional | Sim após triagem | Label “Área jurídica”; valores controlados |
| Tipo do caso | `tipo_de_caso` | HubSpot | ambos | bot, advogado, filtros, relatórios | triagem e reclassificação | Bidirecional | Condicional | Enum do HubSpot e mapper do bot devem possuir contrato idêntico |
| Urgência jurídica | `urgencia` | HubSpot | ambos | bot, advogado, painel | triagem e revisão | Bidirecional | Sim após triagem | `Alta`, `Moderada`, `Baixa`; não confundir com temperatura |
| Prioridade operacional | `hs_priority` | HubSpot | ambos | filtros, painel, bot | triagem/repriorização | Bidirecional | Não | `high`, `medium`, `low` |
| Origem do atendimento | `origem_atendimento` | HubSpot | bot; advogado corrige | relatórios, bot | criação do Deal | Bot→HubSpot; correção HubSpot→Bot | Sim | Vocabulário controlado |
| Síntese factual | `description` | HubSpot | ambos | advogado, bot, admin | confirmação do relato e revisão | Bidirecional | Condicional | Curta e estável; não incluir estado de UI |
| Resumo operacional | `resumo_cliente` | HubSpot | ambos | advogado, bot, painel | evento relevante do caso | Bidirecional | Não | Label recomendado: “Resumo operacional do caso” |
| Link da pasta | `pasta_drive` | HubSpot/Drive | bot | advogado, bot | criação ou reparo da pasta | Bot→HubSpot | Condicional | Drive continua fonte dos arquivos |
| Data de criação | `createdate` | HubSpot | HubSpot | bot, relatórios | automática | HubSpot→Bot | Sim | Somente leitura |
| Data de fechamento | `closedate` | HubSpot | advogado/HubSpot | bot, relatórios | encerramento | HubSpot→Bot | Não | Não inferir apenas pela inatividade |
| Motivo de perda | `closed_lost_reason` | HubSpot | advogado | relatórios | encerramento sem contratação/prosseguimento | HubSpot→Bot | Não | Narrativa complementar pode ir em Note |
| Próximo passo | `hs_next_step` | HubSpot | advogado | equipe, bot sob demanda | revisão do caso | HubSpot→Bot | Não | Preferir ao texto transitório `proxima_acao` no snapshot |
| Última atividade | `notes_last_updated` | HubSpot | HubSpot | bot, painel | automática | HubSpot→Bot | Não | Derivada |
| Quantidade de atividades | `num_notes` | HubSpot | HubSpot | painel, relatórios | automática | HubSpot→Bot | Não | Derivada |

### Propriedades de Deal em transição

| Propriedade | Status-alvo | Regra |
|---|---|---|
| `cidade` | descontinuar | usar Contact `city`, salvo criação futura de conceito explícito “cidade do fato/foro” |
| `descricao_completa` | descontinuar | mover narrativa e eventos para Notes; preservar apenas durante migração |
| `estado_bot_snapshot` | remover | estado conversacional não pertence ao CRM |
| `etapa_do_bot` | remover | etapa de conversa é efêmera |
| `temperatura_lead` | unificar | usar `hs_priority` como classificação operacional |

## 6. Notes — narrativa e eventos

Notes são append-only no modelo lógico: correções devem gerar nova Note de retificação, não apagar silenciosamente o histórico anterior.

| Dado | Propriedade/campo | Fonte da verdade | Altera | Consome | Momento | Direção | Obrigatório | Observações |
|---|---|---|---|---|---|---|---|---|
| Tipo do evento | prefixo/envelope de `hs_note_body` | HubSpot | ambos | advogado, auditoria | criação da Note | Bot→HubSpot ou manual | Sim | Usar vocabulário canônico |
| Corpo narrativo | `hs_note_body` | HubSpot | ambos | advogado, auditoria, bot sob demanda | evento relevante | Bot→HubSpot ou manual | Sim | Texto humano; não usar como estado atual estruturado |
| Data do evento | `hs_timestamp` | HubSpot | bot/HubSpot | timeline, auditoria | ocorrência | Bot→HubSpot | Sim | Deve representar o fato, não apenas horário do retry |
| Caso associado | associação Note→Deal | HubSpot | bot/advogado | timeline do caso | criação | Bot→HubSpot | Sim para narrativa de caso | Evita depender do número no texto |
| Pessoa associada | associação Note→Contact | HubSpot | bot/advogado | timeline da pessoa | criação | Bot→HubSpot | Condicional | Associar apenas se a Note também for relevante à pessoa |
| Origem da ação | envelope: `bot`, `cliente`, `advogado`, `sistema` | HubSpot | criador | auditoria | criação | Bot→HubSpot/manual | Sim para Notes automáticas | Atualmente pode estar apenas no texto |
| Referência do Drive | ID/link no envelope ou corpo | HubSpot como referência | bot | advogado | upload | Bot→HubSpot | Condicional | Não copiar o binário |
| Referência do Calendar | `eventId` no envelope ou corpo | HubSpot como referência | bot | advogado/auditoria | evento de agenda relevante | Bot→HubSpot | Condicional | Calendar permanece fonte do status |

### Conteúdos que devem ser Notes

- relato original confirmado;
- transcrição de áudio confirmada;
- observação documental;
- documento recebido, substituído, ausente ou parcial;
- análise jurídica;
- decisão administrativa;
- pedido de cancelamento/desistência;
- mensagem urgente;
- divergência cadastral;
- falha operacional relevante;
- histórico de agendamento, cancelamento ou comparecimento quando útil à operação.

## 7. Google Drive — documentos

| Dado | Campo | Fonte da verdade | Altera | Consome | Momento | Direção | Obrigatório | Observações |
|---|---|---|---|---|---|---|---|---|
| Pasta do caso | folder ID | Drive | bot/advogado autorizado | bot | abertura | Local; link Bot→HubSpot | Condicional | Uma pasta por caso |
| Nome da pasta | nome no Drive | Drive | bot/advogado | equipe | abertura/correção | Local | Condicional | Incluir número do caso |
| Arquivo | file ID | Drive | bot/advogado | equipe, bot | upload | Local | Condicional | Identificador estável |
| Nome do arquivo | nome no Drive | Drive | bot/advogado | equipe | upload/classificação | Local | Sim por arquivo | Padronizar sem usar como única metadata |
| Tipo MIME | metadata do Drive | Drive | Drive/bot no upload | bot | upload/leitura | Local | Sim por arquivo | Usado para tratamento técnico |
| Link do arquivo | `webViewLink` | Drive | Drive | HubSpot Note, advogado | upload | Drive→Bot→HubSpot | Condicional | Referência, não fonte do conteúdo |
| Versão/substituição | metadata/nome + Note histórica | Drive e HubSpot | ambos | equipe, auditoria | substituição | Drive local; evento Bot→HubSpot | Condicional | Não apagar versão anterior sem política |
| Conteúdo binário | bytes | Drive | cliente/bot/advogado | equipe jurídica | upload | Local | Condicional | Nunca armazenar em snapshot |

Status jurídico ou documental do caso não deve ser inferido apenas pela existência de arquivos no Drive.

## 8. Google Calendar — consultas

| Dado | Campo | Fonte da verdade | Altera | Consome | Momento | Direção | Obrigatório | Observações |
|---|---|---|---|---|---|---|---|---|
| Evento | `event.id` | Calendar | bot/admin | bot, admin | agendamento | Bidirecional Calendar↔Bot | Sim para consulta |
| Caso | `extendedProperties.private.dealId` | Calendar referenciando HubSpot | bot | read model | criação/vinculação | Bot→Calendar | Sim |
| Pessoa | `personId` | Calendar referenciando HubSpot | bot | auditoria | criação/vinculação | Bot→Calendar | Condicional | No modelo atual pode coincidir com Contact ID |
| Contact | `contactId` | Calendar referenciando HubSpot | bot | bot/admin | criação/vinculação | Bot→Calendar | Sim |
| Tipo da consulta | `tipoConsulta` | Calendar | ambos | bot/admin | agendamento/reagendamento | Bidirecional | Sim | Ex.: `inicial`, `retorno` |
| Versão da integração | `versaoIntegracao` | Calendar | bot | integração | criação/vinculação | Bot→Calendar | Sim | Atual: `3` |
| Chave idempotente | `chaveIdempotencia` | Calendar | bot | integração | criação | Bot→Calendar | Sim | Impede duplicação |
| Tipo histórico | `eventoConsultaTipo` | Calendar/event store | bot | auditoria | criação/reagendamento | Bot→Calendar | Sim | Ex.: scheduled/rescheduled |
| Resultado padrão de expiração | `resultadoPadraoExpiracao` | Calendar | ambos | reconciliação | criação/correção | Bidirecional | Não | Atual: `nao_compareceu` |
| Status manual | `consultaStatus` | Calendar | advogado/admin | bot | realização/no-show | Calendar→Bot | Condicional | Somente `realizada` ou `nao_compareceu` manualmente |
| Atualização manual | `consultaStatusAtualizadoEm` | Calendar | bot ao persistir ação admin | auditoria | marcação manual | Bot→Calendar | Condicional | ISO-8601 |
| Início | `start.dateTime` | Calendar | ambos | bot, cliente, admin | agendamento/reagendamento | Bidirecional | Sim |
| Fim | `end.dateTime` | Calendar | ambos | bot, cliente, admin | agendamento/reagendamento | Bidirecional | Sim |
| Status atual | derivado do evento | Calendar | Calendar/admin | read model | leitura | Calendar→Bot | Sim | Cancelamento sobrescreve estado ativo |

O HubSpot pode receber uma Note histórica sobre a consulta, mas nunca deve determinar o status atual da agenda.

## 9. Estado efêmero do bot

| Dado | Armazenamento | Fonte | Altera | Consome | Vida útil | Obrigatório | Observações |
|---|---|---|---|---|---|---|---|
| Chave da sessão WhatsApp | memória/cache com TTL | bot | bot | roteador | sessão atual | Sim | Não é identidade da pessoa |
| Etapa da conversa | memória/cache com TTL | bot | bot | fluxo conversacional | sessão atual | Sim | Não sincronizar em Deal |
| Última pergunta/payload | memória/cache com TTL | bot | bot | fluxo | sessão atual | Condicional | Pode ser descartado |
| Caso selecionado no menu | memória/cache com TTL | bot | cliente/bot | menus | sessão atual | Condicional | Deal continua fonte do caso |
| Buffers de áudio | memória temporária | bot | bot | transcrição | até confirmação | Condicional | Apagar após uso |
| Texto/transcrição pendente | memória temporária | bot | cliente/bot | confirmação | até confirmação | Condicional | Após confirmar, vira Note |
| Cursor de coleta documental | memória/cache com TTL | bot | bot | fluxo de documentos | sessão atual | Condicional | Não representa status jurídico |
| Timers | memória | bot | bot | automação conversacional | segundos/minutos | Condicional | Nunca persistir no CRM |
| Locks de processamento | memória | bot | bot | concorrência | duração da operação | Sim | Técnico |
| Cache de deduplicação | memória/cache com TTL | bot | bot | webhook/mensagens | janela curta | Sim | Técnico |
| Retry/backoff | memória/fila operacional | bot | bot | integrações | até sucesso/expiração | Condicional | Não é dado de negócio |
| Projeção de consulta | memória | Calendar | bot | menus | até próxima leitura | Condicional | Sempre revalidar no Calendar |
| IDs externos em uso | memória | HubSpot/Drive/Calendar | bot | integração | sessão/operação | Sim | São referências, não autoridade |

## 10. Dados derivados

Dados derivados não devem criar uma segunda fonte da verdade.

| Dado derivado | Entradas | Destino permitido | Persistência |
|---|---|---|---|
| Prioridade sugerida | urgência, maturidade e contexto | `hs_priority`, após regra explícita | HubSpot |
| Resumo operacional | Deal + Notes + Drive + Calendar | `resumo_cliente` | HubSpot |
| Nome do Deal | número, nome e tipo | `dealname` | HubSpot |
| Consulta ativa | evento Calendar | memória/read model | não persistir como autoridade no HubSpot |
| Quantidade de Notes | atividades HubSpot | `num_notes` | calculada pelo HubSpot |
| Última atividade | atividades HubSpot | `notes_last_updated` | calculada pelo HubSpot |
| Cliente recorrente | Deals associados | calculado em consulta/relatório | não criar flag manual |
| Idade | data de nascimento + data atual | calculada na aplicação | não persistir |
| Status documental | eventos documentais + revisão operacional | resumo operacional; futura propriedade estruturada somente se houver capacidade | não inferir apenas do Drive |

## 11. Matriz resumida de sincronização

| Informação | Destino | Fonte da verdade | Altera | Direção | Momento |
|---|---|---|---|---|---|
| Identidade e contato | Contact | HubSpot | ambos | Bidirecional | cadastro/correção |
| Classificação do caso | Deal | HubSpot | ambos | Bidirecional | triagem/reclassificação |
| Estágio jurídico/comercial | Deal | HubSpot | ambos | Bidirecional | transição de negócio |
| Narrativa e eventos | Note | HubSpot | ambos | Bot→HubSpot ou manual | ocorrência |
| Documentos | Drive | Drive | ambos | Drive local; referências→HubSpot | upload |
| Consultas | Calendar | Calendar | ambos | Calendar↔Bot | evento de agenda |
| Estado da conversa | Bot | Bot | bot | Local | sessão atual |

## 12. Critérios para mudança deste dicionário

Qualquer evolução futura deve:

1. identificar a fonte da verdade antes de criar campo;
2. provar que uma propriedade padrão não atende à necessidade;
3. evitar duplicar dados de Contact em Deal ou vice-versa;
4. especificar enum, nulabilidade, autor e momento da sincronização;
5. prever migração e rollback;
6. verificar o limite de propriedades customizadas do portal;
7. atualizar este documento antes da implementação;
8. validar consultas, filtros e relatórios afetados;
9. impedir que dados efêmeros sejam promovidos a dados CRM;
10. manter Calendar e Drive independentes da lógica de status do HubSpot.

## 13. Decisão arquitetural congelada

- **HubSpot Contact:** fonte da verdade da pessoa.
- **HubSpot Deal:** fonte da verdade do caso jurídico.
- **HubSpot Notes:** fonte da verdade da narrativa e dos eventos administrativos/jurídicos.
- **Google Drive:** fonte da verdade dos documentos binários.
- **Google Calendar:** fonte da verdade dos compromissos de consulta.
- **Bot:** orquestrador e interface conversacional com estado efêmero.

`estado_bot_snapshot`, `etapa_do_bot`, propriedades de caso no Contact e duplicações narrativas são considerados legado de transição, não componentes do modelo definitivo.
