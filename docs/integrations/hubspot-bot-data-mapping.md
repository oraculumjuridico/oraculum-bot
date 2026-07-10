# HubSpot Data Mapping & Bot Telemetry Structure

## 1. Escopo e método

Este documento descreve o comportamento observável no código atual. Ele não valida a configuração real do portal HubSpot, workflows externos, relatórios ou propriedades que possam ter sido criadas manualmente.

Foram considerados:

- chamadas às APIs CRM v3 de Contacts, Deals, Notes e Meetings;
- associações Contact–Deal, Note–Contact e Note–Deal;
- propriedades geradas pelo bot e propriedades lidas para retomada/administração;
- fluxos de cadastro, triagem, documentos, urgência, consulta e ações administrativas.

Classificação utilizada:

- **raw**: conteúdo recebido ou identificador praticamente sem interpretação;
- **structured**: valor normalizado, enumerado ou campo técnico;
- **semantic**: síntese ou classificação produzida a partir do contexto;
- **snapshot**: agregado serializado de estado operacional.

As frequências abaixo são frequências de gatilho, não volumes medidos em produção.

Mapa das principais origens no repositório:

| Responsabilidade | Origem |
|---|---|
| CRUD de Contacts, Deals, Notes e associações | `src/domain/hubspot-core.js` |
| fila por Deal, sincronização, retomada e consultas de Deals | `src/domain/hubspot-sync.js` |
| composição das propriedades do Deal | `server.js`, `getHubSpotDealStateProps()` |
| nomes, pipeline e mapeamento de stages | `server.js`, `getNomeDeal()`, `mapearStageParaDealstage()` e `HS_STAGE` |
| serialização do snapshot | `src/domain/state-persistence.js`, `serializarEstado()` |
| gatilhos de Notes e rotas administrativas | `server.js` |
| leitura de Meetings | `server.js`, rota `/buscar-contato-reuniao` |

O bot **não cria definições de propriedades customizadas** no portal. Ele pressupõe que elas já existam e envia valores para seus nomes internos.

## 2. Resumo executivo

O bot usa o HubSpot de quatro maneiras:

1. **Contact** identifica operacionalmente o telefone e guarda poucos dados cadastrais.
2. **Deal** representa o atendimento/caso e recebe tanto dados permanentes quanto estado transitório do bot.
3. **Notes** registram eventos selecionados, documentos, mensagens relevantes e ações administrativas.
4. **Meetings** são somente consultadas por uma rota de integração; o código analisado não cria Meetings no HubSpot.

Não foi encontrado:

- envio completo da conversa para HubSpot Conversations;
- criação de custom Timeline Events;
- sincronização de todas as mensagens do WhatsApp;
- leitura operacional das Notes pelo bot;
- criação de tags ou labels próprias do HubSpot.

A maior concentração de redundância está no Deal: `description`, `descricao_completa`, `resumo_cliente` e `estado_bot_snapshot` podem conter versões do mesmo relato. Há também Notes idênticas criadas separadamente no Contact e no Deal.

## 3. Inventário de objetos e dados

### 3.1 Contacts

| Campo | Operação | Origem no bot | Frequência | Tipo | Dependências e consumo |
|---|---|---|---|---|---|
| `firstname` | cria, atualiza e lê | nome informado, nome do perfil ou fallback `Lead WhatsApp` | criação; confirmação de nome; sincronizações cadastrais | structured | exibição, retomada, admin e identificação em integração de reunião |
| `phone` | cria, atualiza, pesquisa e lê | número WhatsApp normalizado | criação/captura; pesquisa antes de criar | structured | chave operacional de deduplicação e localização do Contact |
| `city` | cria e atualiza | `u.cidade` | criação e sincronização cadastral | structured | cadastro; não foi localizado uso decisório posterior |
| `state` | atualiza | `u.uf` | sincronização cadastral | structured | não foi localizado consumo pelo bot |
| `uf` | atualiza | `u.uf` | sincronização cadastral | structured | propriedade aparentemente customizada; não foi localizado consumo pelo bot |
| `area_juridica` | lê em busca por telefone | propriedade já existente no Contact | a cada busca por telefone | semantic | não aparece no payload atual de criação/atualização do Contact; leitura sem consumo funcional evidente no retorno da busca |

Observações:

- O telefone funciona como chave de fato: a busca usa igualdade em `phone`, e o primeiro resultado é reaproveitado.
- O fallback mínimo de criação envia somente `firstname` e `phone`.
- Dados do caso são concentrados no Deal. O código atual não envia número de caso, urgência ou pasta do Drive como propriedades do Contact.
- Um Contact é associado a Deals por `deal_to_contact`.

### 3.2 Deals

#### Propriedades de plataforma e pipeline

| Campo | Operação | Origem | Frequência | Tipo | Dependências e consumo |
|---|---|---|---|---|---|
| `dealname` | cria, atualiza e lê | temperatura/origem antes do cadastro; número, nome e tipo após cadastro | criação; evolução cadastral; sincronizações relevantes | semantic | painel administrativo e seleção de Deal |
| `pipeline` | cria | constante `default` | uma vez por Deal | structured | configuração do pipeline HubSpot |
| `dealstage` | cria, atualiza e lê | mapeamento do estágio interno e ações jurídicas/documentais | criação e transições | structured | busca de Deals ativos, telas administrativas e proteção contra regressão |
| `hubspot_owner_id` | cria | constante `90513737` | uma vez por Deal | structured | atribuição fixa de proprietário |
| `createdate` | somente lê | HubSpot | consultas administrativas | structured | ordenação e idade do Deal |
| `closedate` | somente lê | HubSpot | consultas administrativas | structured | contexto de Deal; não é escrito pelo bot |

Pipeline e stages enviados:

| Nome lógico no código | ID enviado |
|---|---|
| Lead | `appointmentscheduled` |
| Cadastro | `qualifiedtobuy` |
| Análise | `presentationscheduled` |
| Aguardando documentos | `decisionmakerboughtin` |
| Documentos | `contractsent` |
| Protocolo | `1343040098` |
| Processo | `1337291921` |
| Final | `1343039663` |

Os nomes comerciais exibidos no portal não podem ser confirmados apenas pelo código. O bot não envia um stage de Consulta/Agendamento. Consulta ativa pode impedir regressão de stage, mas o estado de agenda vem do domínio Calendar-first.

#### Propriedades funcionais e customizadas

| Campo | Operação | Conteúdo/origem | Frequência | Tipo | Dependências e consumo |
|---|---|---|---|---|---|
| `description` | cria/atualiza/lê | relato `u.descricao`, normalizado | sincronização quando o estado mudou | raw | fallback de retomada e painel admin |
| `descricao_completa` | cria/atualiza/lê | relato completo; função de composição quando disponível | sincronização quando o estado mudou | semantic/raw | retomada como fallback de `description`, painel admin |
| `resumo_cliente` | cria/atualiza/lê | resumo do assunto, com fallback para descrição | sincronização quando o estado mudou | semantic | retomada de `assuntoResumo`, painel admin |
| `area_juridica` | cria/atualiza/lê | `u.area` | sincronização quando o estado mudou | semantic | seleção/exibição do caso e retomada |
| `urgencia` | cria/atualiza/lê | `Alta`, `Moderada` ou `Baixa` | sincronização quando o estado mudou; ação admin | structured | contagem/priorização administrativa e retomada |
| `cidade` | cria/atualiza | `u.cidade` | sincronização quando o estado mudou | structured | sem leitura localizada no fluxo principal |
| `pasta_drive` | cria/atualiza/lê | URL `u.pastaDriveLink` | criação da pasta/cadastro e sincronização | structured | acesso operacional ao acervo; também duplicada no snapshot/Notes |
| `origem_atendimento` | cria/atualiza | origem sanitizada; padrão `whatsapp` | criação e sincronização | structured | influencia nome inicial do Deal; valores reconhecidos no código: `whatsapp`, `instagram`, `facebook`, `site`, `pagina_oficial` e `pagina-oficial`; outros valores são enviados como recebidos |
| `estado_bot_snapshot` | cria/atualiza/lê | JSON produzido por `serializarEstado(u)` | toda sincronização cujo estado serializado mudou | snapshot | retomada ampla da sessão e reconstrução do estado do usuário |
| `etapa_do_bot` | cria/atualiza/lê | stage conversacional normalizado | mudança de estado | structured | retomada da pergunta/etapa; pode ser explicitamente esvaziado |
| `tipo_de_caso` | cria/atualiza/lê | classificação composta de área/tipo | mudança de classificação | semantic | restauração de área e tipo |
| `temperatura_lead` | cria/atualiza/lê | `Frio`, `Morno` ou `Quente` | mudança de sinais/estado | semantic | nome do Deal e painel admin |
| `hs_priority` | cria/atualiza/lê | `low`, `medium` ou `high`, derivado da temperatura | junto com temperatura | structured/derived | contagem administrativa de urgentes |
| `numero_de_caso` | atualiza/lê | `u.numeroCaso` | conclusão do cadastro | structured | identificador oficial do caso e retomada |

`estado_bot_snapshot` contém quase todo o objeto de sessão, acrescido de dados derivados:

- scores emocional e operacional;
- status e pendências documentais;
- indicador de consulta ativa;
- próxima ação;
- dados cadastrais, relato, caso, IDs e links;
- etapas, flags e buffers serializáveis que não foram explicitamente removidos.

São removidos antes do envio apenas alguns campos internos, como locks/timers, última mensagem, número-chave da sessão, cache de sincronização, buffers de áudio e parte do estado temporário de menus. O snapshot é substituído por inteiro a cada PATCH; não é append-only.

### 3.3 Associações

| Associação | Escrita | Uso |
|---|---|---|
| Deal → Contact (`deal_to_contact`) | após criação/reuso do Deal | liga caso ao Contact |
| Note → Contact (`note_to_contact`) | após criar Note de Contact | timeline do Contact |
| Note → Deal (`note_to_deal`) | após criar Note de Deal | timeline do caso |
| Meeting → Deal | somente lê | resolução de reunião para Deal |
| Deal → Contact | lê | painel admin e rota de reunião |

O código usa o primeiro Contact associado ao Deal e o primeiro Deal associado ao Meeting nos fluxos correspondentes.

### 3.4 Notes

Todas as Notes usam:

```text
[TIPO]

conteúdo
```

com `hs_timestamp` igual ao horário da criação. A Notes API cria um objeto separado para cada destino; quando a mesma informação vai para Contact e Deal, são duas Notes independentes.

#### Cadastro, lead e representação

| Tipo | Destino | Gatilho e conteúdo | Frequência |
|---|---|---|---|
| `CLASSIFICACAO DE LEAD` | Deal | Deal inicial/incompleto; classificação e sinais do lead | uma vez na criação desse Deal |
| `LEAD INCOMPLETO` | Contact | captura por inatividade; nome, telefone, área e stage interno | por captura de lead incompleto |
| `LEAD INCOMPLETO - CASO PARA TERCEIRO` | Contact e Deal | motivo da interrupção, quem abriu, telefones, terceiro, relato e caso original | por fluxo de terceiro interrompido |
| `CADASTRO COMPLETO` | Contact e Deal | resumo do caso, score, Drive e WhatsApp | uma vez por cadastro concluído |
| `DIVERGENCIA DE NOME - CASO PARA TERCEIRO` | Contact e Deal | nomes divergentes e telefone preservado | quando o telefone existente pertence a outro nome |
| `ALERTA - NOTIFICACAO AO TERCEIRO NAO ENVIADA` | Deal | telefone e provável causa da falha de WhatsApp | por falha de notificação |
| `CASO NAO RECONHECIDO PELO WHATSAPP INFORMADO` | Contact | telefone, caso e nome cadastrado | quando o destinatário rejeita o caso |

#### Consulta e agenda

| Tipo | Destino | Gatilho e conteúdo | Frequência |
|---|---|---|---|
| `AGENDAMENTO SOLICITADO` | Contact | cliente solicita iniciar agendamento; caso e área | por solicitação |
| `CONSULTA AGENDADA` | Contact | data/hora, duração, caso e área | por agendamento concluído |
| `CONSULTA CANCELADA PELO CLIENTE NO WHATSAPP` | Contact | data/hora e eventId | por cancelamento do cliente |
| `CONSULTA CANCELADA PELO WHATSAPP ADMIN` | Contact | data/hora e eventId | por cancelamento administrativo |

Essas Notes são histórico humano. O estado operacional da consulta não é reconstruído a partir delas.

#### Documentos e arquivos

| Tipo | Destino | Gatilho e conteúdo |
|---|---|---|
| `DOCUMENTO RECEBIDO` | Contact | arquivo, caso e link do Drive |
| `DOCUMENTO RECEBIDO - AGUARDANDO CLASSIFICACAO` | Contact | arquivo e link antes de o cliente classificar |
| `DOCUMENTO ANEXADO AO CASO` | Contact | tipo opcional, arquivo renomeado e link |
| `DOCUMENTO ENVIADO DURANTE AGENDAMENTO` | Deal | arquivo recebido enquanto existe consulta agendada |
| `DOCUMENTO INFORMADO COMO AUSENTE` | Contact | documento e justificativa/mensagem |
| `INFORMACAO DOCUMENTAL RECEBIDA` | Contact | informação textual aceita como documento |
| `OBSERVACAO SOBRE DOCUMENTO` | Contact | texto livre sobre o documento atual |
| `OBSERVACAO EM AUDIO SOBRE DOCUMENTO` | Contact | transcrição do áudio |
| `DOCUMENTOS FALTANTES REABERTOS PARA ENVIO` | Contact | lista e status dos documentos reabertos |
| `DOCUMENTO MARCADO COMO SUBSTITUIDO` | Contact | arquivo anterior e eventual link preservado |
| `DOCUMENTO COMPLETO - FRENTE E VERSO NA MESMA IMAGEM` | Contact | documento e arquivo |
| `DOCUMENTO PARCIAL - CLIENTE SEGUIU SEM VERSO` | Contact | item pendente e progresso |
| `DOCUMENTO PULADO PELO CLIENTE` | Contact | documento e progresso |
| `DOCUMENTO AVANCADO SEM TODAS AS PAGINAS` | Contact | documento, item pendente e progresso |

São Notes potencialmente frequentes porque ocorrem por arquivo, observação ou decisão documental, não apenas por caso.

#### Mensagens, áudio e urgência

| Tipo | Destino | Gatilho e conteúdo |
|---|---|---|
| `MENSAGEM URGENTE` | Contact | mensagem textual ou conteúdo confirmado como urgente |
| `ÁUDIO URGENTE` | Contact | transcrição, com link do Drive em alguns caminhos |
| `MENSAGEM SOBRE CASO ATUAL` | Contact | mensagem/transcrição e eventual link do áudio |
| `ÁUDIO — <PASTA>` | Contact | tipo dinâmico por pasta; transcrição e eventual link |
| `PEDIDO DE CANCELAMENTO OU DESISTENCIA` | Contact | mensagem original, remetente e caso |

Não há Note para cada mensagem. Somente interações classificadas por fluxos específicos são registradas.

#### Operação administrativa

| Tipo | Destino | Gatilho e conteúdo |
|---|---|---|
| `PEDIDO DE DOCUMENTOS PELO ADMIN` | Contact e Deal | documentos solicitados após envio ao cliente |
| `CASO MARCADO URGENTE` | Contact e Deal | urgência anterior e próxima ação |
| `ANALISE OPERACIONAL - ADMIN` | Contact e Deal | briefing/análise operacional |
| `LEMBRETE PELO ADMIN` | Contact e Deal | próxima ação após envio do lembrete |

Estas quatro categorias duplicam deliberadamente a mesma narrativa em dois objetos.

### 3.5 Meetings, Events, Conversations, tags e metadata

| Recurso | Situação atual |
|---|---|
| HubSpot Meetings | somente leitura: busca por `hs_meeting_start_time`, lê título, corpo e início, e percorre associações |
| Custom Timeline Events | não encontrados |
| HubSpot Conversations/messages | nenhum envio encontrado |
| WhatsApp completo | não sincronizado; apenas mensagens selecionadas viram Notes |
| Tags/labels | nenhuma API de tags/labels encontrada |
| Pipeline | `default` |
| Metadata adicional | IDs de Contact/Deal ficam na sessão/snapshot; links e IDs de Calendar/Drive aparecem em propriedades ou Notes conforme o fluxo |

## 4. Fluxo Bot → HubSpot

### 4.1 Primeiro contato e lead

```text
WhatsApp: telefone, perfil, mensagens
        |
        v
normalização do telefone + sessão local + classificação inicial
        |
        +--> busca Contact por phone
        |       +--> encontrou: reutiliza/atualiza dados permitidos
        |       `--> não encontrou: cria Contact
        |
        +--> busca Deal aberto associado
        |       +--> encontrou: reutiliza
        |       `--> não encontrou: cria Deal em Lead
        |
        +--> associa Contact e Deal
        `--> cria Notes de lead quando o gatilho exigir
```

Perda de contexto: mensagens anteriores ao gatilho não são copiadas integralmente. O HubSpot recebe sínteses, relato, snapshot e Notes selecionadas.

### 4.2 Cadastro e triagem

```text
respostas do cliente
   -> normalização/IA/classificações
   -> sessão local
   -> properties do Deal:
      relato + resumo + área + tipo + urgência + temperatura
      + etapa do bot + snapshot + origem + Drive
   -> dealstage comercial/jurídico/documental
   -> Note de cadastro completo
```

Duplicação: relato e síntese podem aparecer em três propriedades e dentro do snapshot; o resumo do cadastro também aparece em duas Notes.

### 4.3 Sincronização contínua

```text
mensagem/ação muda a sessão
        |
        v
compara estado serializado anterior e atual
        |
        +--> sem mudança: não sincroniza
        `--> com mudança:
              fila em memória por dealId
              -> atualiza stage quando aplicável
              -> PATCH do conjunto completo de propriedades de estado
              -> memoriza o último payload na sessão
```

Há serialização por Deal e supressão de payload idêntico enquanto o processo/sessão vive. Não há fila durável nem debounce específico para a API HubSpot. Reinício do processo elimina o cache de deduplicação.

### 4.4 Documentos e mídia

```text
WhatsApp arquivo/áudio/texto
   -> validação e classificação
   -> arquivo binário no Drive
   -> status documental na sessão/snapshot
   -> Note no HubSpot com contexto, transcrição e/ou link
   -> eventual stage documental do Deal
```

O binário não é copiado para o HubSpot pelo código analisado. A Note guarda referência textual ao Drive.

### 4.5 Consultas

```text
ação do cliente/admin
   -> domínio de consulta / Google Calendar
   -> estado operacional obtido pelo read model
   -> Note histórica seletiva no Contact
```

O HubSpot não é a fonte de verdade da agenda. Existe ainda uma rota que lê Meetings do HubSpot e associa o resultado a Deal/Contact para interoperabilidade.

## 5. Análise de limpeza

### 5.1 Redundâncias confirmadas

| Redundância | Efeito |
|---|---|
| `description` × `descricao_completa` | normalmente carregam o mesmo relato ou variações pouco distinguíveis |
| `resumo_cliente` × relato | o fallback transforma o relato completo em “resumo” quando não há síntese |
| propriedades estruturadas × `estado_bot_snapshot` | área, urgência, tipo, etapa, IDs, pasta e relato reaparecem no JSON |
| Note de `CADASTRO COMPLETO` × propriedades × snapshot | resumo, score, Drive e telefone reaparecem |
| Notes administrativas no Contact e no Deal | dois objetos de Note com corpo idêntico |
| links do Drive | podem aparecer em `pasta_drive`, snapshot e múltiplas Notes |
| consulta | evento no Calendar e referências narrativas/eventId em Notes/snapshot |
| temperatura × `hs_priority` × nome do Deal | mesma avaliação expressa de três formas |

### 5.2 Campos sem consumo localizado

Os seguintes campos são enviados, mas não foi encontrado consumo funcional relevante pelo próprio bot:

- Contact `state` e `uf`;
- Deal `cidade`;
- Deal `origem_atendimento` após a formação do nome inicial;
- Contact `area_juridica`, que é solicitado na busca, mas não usado pelo helper.

Isso não prova que sejam inúteis: podem alimentar views, workflows ou relatórios configurados diretamente no HubSpot.

### 5.3 Inconsistências de formato

- `urgencia` usa valores capitalizados no HubSpot, enquanto a sessão usa `alta`, `normal`, `baixa`.
- `temperatura_lead` usa português capitalizado; `hs_priority` usa inglês minúsculo.
- origem aceita aliases (`site`, `pagina_oficial`, `pagina-oficial`) e valores não enumerados.
- tipos de Note misturam acentos, caixa alta, hífen e travessão; há tipos dinâmicos de áudio.
- o corpo de Note é texto sem envelope estruturado; caso, telefone, arquivo e origem precisam ser extraídos por parsing.
- `hs_timestamp` registra o momento da escrita, que pode não ser o horário do evento narrado.
- o owner do Deal é um ID fixo no código.

### 5.4 Dados sem consumo no CRM pelo bot

- Notes são gravadas, mas não são lidas para decisão, retomada ou reconstrução.
- histórico completo do WhatsApp não chega ao CRM.
- anexos permanecem no Drive; HubSpot recebe links.
- Meetings são lidas apenas por uma rota específica.

### 5.5 Perda de contexto

- Não existe sequência completa de mensagens, remetentes e respostas.
- Notes de Contact podem misturar eventos de vários Deals do mesmo Contact.
- várias Notes têm número do caso no texto, sem associação simultânea ao Deal.
- a associação escolhe o primeiro resultado em alguns fluxos, o que é ambíguo quando há múltiplos associados.
- o snapshot é substituído; estados anteriores não ficam disponíveis nessa propriedade.
- links do Drive podem perder utilidade se o arquivo for removido, embora renomear normalmente preserve o ID/link.

## 6. Modelo normalizado proposto

Esta é uma proposta de organização futura; não implica migração ou alteração do portal.

### 6.1 Contact mínimo

| Campo lógico | Finalidade |
|---|---|
| `firstname` | nome de apresentação confirmado |
| `phone` | telefone normalizado usado pela integração atual |
| `city` / região | apenas se houver uso comprovado em atendimento ou relatório |

Não colocar no Contact estado do caso, documentos, urgência, consulta ou narrativa de um Deal específico.

### 6.2 Deal estruturado

| Grupo | Campos |
|---|---|
| Identificação | `numero_de_caso`, `dealname` |
| Classificação | `area_juridica`, `tipo_de_caso` |
| Operação jurídica/comercial | `pipeline`, `dealstage`, `hubspot_owner_id` |
| Priorização | uma classificação canônica de urgência; prioridade derivada apenas se necessária |
| Origem | `origem_atendimento` com enum controlado |
| Referências | `pasta_drive` |
| Resumo atual | um único resumo curto e explicitamente definido |

Estado conversacional, flags de tela e buffers não deveriam compor o modelo CRM normalizado. Durante a transição, o snapshot precisa permanecer compatível até que todos os consumidores sejam inventariados.

### 6.3 Interaction Event padronizado

Enquanto Notes forem o mecanismo escolhido, adotar um envelope textual ou JSON estável:

```text
eventType
occurredAt
source: bot | client | admin | system
dealId / caseNumber
channel
summary
references: calendarEventId, driveFileId, driveUrl
schemaVersion
```

Categorias canônicas sugeridas:

- `lead.captured`
- `case.registration_completed`
- `case.urgent_message_received`
- `document.received`
- `document.status_changed`
- `consultation.requested`
- `consultation.scheduled`
- `consultation.canceled`
- `admin.action_performed`
- `integration.delivery_failed`

Uma única Note pode ser associada simultaneamente aos objetos relevantes, evitando criar cópias independentes quando a API/configuração permitir.

### 6.4 Conversation Summary opcional

Um único resumo de conversa, com:

- período resumido;
- assunto principal;
- solicitações pendentes;
- última ação do cliente;
- próxima ação do escritório;
- referência ao caso.

Ele não substitui prova documental, arquivo do Drive nem histórico integral do canal. Deve ter política explícita de atualização e não concorrer com três propriedades narrativas.

### 6.5 Interaction Metadata

Metadados devem ser estruturados e enumerados:

- canal;
- origem da ação;
- tipo de interação;
- timestamp do fato;
- timestamp de ingestão;
- ID do caso;
- IDs externos;
- versão do schema;
- resultado da entrega.

## 7. Regras de segurança para evolução

1. **Inventário antes de remoção:** nenhum campo deve ser descontinuado sem auditar código, workflows, listas, relatórios e integrações do portal.
2. **Mudança aditiva:** introduzir formato normalizado em paralelo ao formato atual.
3. **Dual-write temporário:** comparar cobertura e valores antes de trocar consumidores.
4. **Semântica explícita:** documentar fonte, enum, nulabilidade e momento de atualização de cada campo.
5. **Reversibilidade:** usar feature flag e preservar o payload legado durante a validação.
6. **IDs estáveis:** preservar Contact ID, Deal ID, número do caso e IDs externos; não deduplicar destrutivamente.
7. **Notes imutáveis:** não apagar histórico durante padronização; marcar categorias legadas.
8. **Snapshot protegido:** não reduzir `estado_bot_snapshot` até provar que retomada e admin não dependem dos campos removidos.
9. **Observação antes de limpeza:** medir escrita e leitura por propriedade e categoria de Note.
10. **Validação de portal:** confirmar nomes/IDs de stages, owner, propriedades customizadas e automações diretamente no HubSpot antes de qualquer deploy.
11. **Idempotência:** manter lock por Deal e acrescentar, numa fase futura, chave de idempotência durável para eventos/Notes.
12. **Privacidade:** revisar se transcrições, telefones e relatos jurídicos precisam estar simultaneamente em Contact, Deal, Note, snapshot e Drive.

## 8. Priorização recomendada para a próxima análise

1. Validar no portal quais campos e Notes alimentam workflows, views e relatórios.
2. Medir por 30 dias o volume de PATCHes por propriedade e Notes por categoria.
3. Definir uma fonte narrativa canônica e a diferença formal entre relato completo e resumo.
4. Padronizar categorias e envelope de Notes sem remover as categorias atuais.
5. Mapear consumidores de `estado_bot_snapshot` antes de separar estado conversacional de dados CRM.

## 9. Conclusão

Hoje o HubSpot recebe uma representação rica, porém sobreposta, do atendimento. O Contact é enxuto e orientado pelo telefone; o Deal combina caso, triagem, narrativa e estado conversacional; Notes registram apenas eventos selecionados e frequentemente repetem conteúdo; Drive e Calendar continuam responsáveis pelos binários e pela agenda.

A limpeza segura começa por observabilidade e definição semântica, não por exclusão. O modelo proposto permite reduzir redundância gradualmente sem quebrar a integração existente.
