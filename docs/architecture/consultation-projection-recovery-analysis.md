# Consultation — análise de recuperação de projeções

## Escopo

Este documento mapeia as projeções atuais do bounded context Consultation e propõe capabilities de recuperação. Nenhuma capability é implementada nesta etapa.

O Event Store permanece append-only. Calendar, Read Model, HubSpot e projeções locais não são modificados por esta análise.

## Resumo executivo

O sistema não possui atualmente um Read Model materializado. `getConsultaView(dealId)` calcula a visão em tempo de leitura combinando Google Calendar e Event Store. Portanto, `REBUILD_READ_MODEL` não corresponde hoje a uma reconstrução de banco ou arquivo.

As projeções persistidas existentes são:

1. eventos e metadados no Google Calendar;
2. estado resumido da consulta na sessão do bot, persistido em `data/users-state.json`;
3. duplicação desse estado dentro de `estado_bot_snapshot` no HubSpot;
4. métricas agregadas em `data/consulta-metrics.json`.

O script de reconciliação atual é Calendar-first. Ele classifica eventos do Calendar, atualiza resultados manuais no próprio Calendar, acrescenta fatos ao Event Store e corrige `consultaStatus` das sessões locais. Não existe rebuild completo baseado exclusivamente em replay do Event Store.

## Fontes e projeções

### 1. Event Store de consultas

**Papel:** registro histórico append-only e base do replay.

**Armazenamento:** `data/consulta-events.jsonl`, ou caminho definido por `CONSULTA_EVENTS_FILE`.

**Escritores:**

- comandos do facade Consultation;
- criação e alteração de consultas;
- cancelamentos;
- resultados administrativos;
- `scripts/reconcile-consulta.js`.

**Reconstrução:** não se aplica. O Event Store é fonte histórica, não projeção descartável. A cadeia global e a cadeia por caso são validadas antes da leitura.

**Risco:** nunca deve ser alvo de rebuild, patch ou correção histórica.

### 2. Consultation Read Model

**Papel:** visão lógica atual usada pelos fluxos operacionais.

**Armazenamento:** não é persistido.

**Construção atual:** `getConsultaView(dealId)` consulta o estado atual no Calendar e combina esse estado com a timeline do Event Store.

**Escritores:** nenhum. É uma projeção efêmera e somente leitura.

**Reconstrução atual:** cada chamada já recalcula a visão. Não existe cache materializado próprio a invalidar ou reconstruir.

**Risco:** uma divergência classificada como `READ_MODEL_OUTDATED` pode representar erro de regra, versão de código ou input inconsistente; não necessariamente dados obsoletos. Uma capability chamada `rebuildConsultationReadModel()` seria enganosa enquanto não existir materialização.

### 3. Projeção Google Calendar

**Papel:** fonte de verdade do estado atual da agenda.

**Armazenamento:** eventos do Google Calendar, incluindo `extendedProperties.private` com `dealId`, `personId`, `contactId`, `tipoConsulta`, versão de integração e resultado manual.

**Escritores:**

- `calendar-scheduling.js`, por meio dos comandos expostos pelo facade;
- webhooks administrativos no servidor para vínculo de metadata;
- cancelamentos;
- marcação manual de `realizada` ou `nao_compareceu`;
- reconciliação de eventos expirados.

**Reconstrução atual:** não existe reprojeção integral a partir do Event Store. A migração existente consegue localizar e vincular eventos, mas não recria com segurança toda a agenda.

**Riscos:**

- Calendar é a fonte oficial atual; sobrescrevê-lo automaticamente a partir do replay inverteria essa responsabilidade;
- eventos podem conter participantes, recorrência, notificações e alterações externas não representadas no Event Store;
- recriação pode duplicar compromissos, disparar notificações ou restaurar evento legitimamente cancelado;
- o histórico do Event Store pode não conter todos os atributos necessários para recriar um evento equivalente.

### 4. Projeção de sessão do bot

**Papel:** cache operacional para menus, status e retomada de conversa.

**Armazenamento:**

- objeto `users` em memória;
- `data/users-state.json`.

**Dados de consulta observados:** `consultaStatus`, `tipoConsulta`, `_consultaInicio`, `_consultaFim`, fonte da consulta e dados auxiliares de interação.

**Escritores:**

- `atualizarEstadoConsultaUsuario()` no servidor;
- fluxos administrativos e de cancelamento;
- persistência com debounce em `state-persistence.js`;
- `scripts/reconcile-consulta.js`, atualmente apenas para `consultaStatus`.

**Reconstrução atual:** parcial. `reconciliarSessoes()` recalcula `consultaStatus` usando eventos projetados do Calendar. Não recompõe todos os campos da sessão e não usa replay do Event Store como fonte exclusiva.

**Riscos:**

- o arquivo mistura estado de consulta com todo o estado conversacional;
- regravar o objeto inteiro pode destruir contexto transitório legítimo do WhatsApp;
- uma recuperação segura deve alterar somente um subconjunto explicitamente permitido de campos de consulta.

### 5. Snapshot do HubSpot

**Papel:** cópia ampla do estado do bot no Deal.

**Armazenamento:** propriedade `estado_bot_snapshot`.

**Escritores:**

- serialização em `state-persistence.js`;
- sincronização de Deal em `hubspot-sync.js`;
- sincronização normal ao final do processamento de mensagens.

**Dados de consulta:** o snapshot serializado inclui `consultaStatus`, `tipoConsulta`, `consulta_ativa` derivada e possivelmente campos auxiliares da sessão.

**Reconstrução atual:** não existe rebuild específico de consulta. O snapshot é regravado como efeito da sincronização geral do usuário.

**Riscos:**

- o snapshot mistura conversa, documentos, CRM e consulta;
- reconstruir o snapshot completo a partir do replay é impossível e perigoso;
- a recuperação deve preservar todos os campos não pertencentes à consulta e aplicar atualização com controle de concorrência.

### 6. Projeção de métricas

**Papel:** agregados operacionais de consultas.

**Armazenamento:** `data/consulta-metrics.json`.

**Escritor:** `persistirMetricasConsulta()` durante `scripts/reconcile-consulta.js`.

**Reconstrução atual:** total a partir da lista de eventos do Calendar processada pela reconciliação, não a partir do Event Store.

**Riscos:**

- pode divergir do replay histórico;
- o arquivo usa substituição completa e não possui versionamento de projeção;
- métricas de Calendar e métricas jurídicas baseadas em eventos podem ter semânticas diferentes.

## Artefatos que não são projeções operacionais

Os arquivos abaixo são registros ou exportações e não devem participar de auto repair:

- `data/consultation-decisions.jsonl`;
- `data/consultation-integrity-events.jsonl`;
- snapshots jurídicos e dossiês exportados;
- proofs e narrativas.

Eles são append-only ou artefatos probatórios. Não devem ser reconstruídos para “corrigir” estado operacional.

## Estado atual de replay e rebuild

### Replay persistente

Não existe projeção persistente produzida continuamente pelo replay.

Existe replay determinístico em memória:

- `getConsultaHistory(dealId)`;
- `getConsultaStateAt(dealId, timestamp)`;
- `replayConsultaEvents(dealId, events, timestamp)`.

O resultado é retornado ao chamador e não é persistido como Read Model.

### Rebuild parcial

Existe rebuild parcial das sessões locais:

- lê Calendar;
- classifica o evento mais recente por Deal;
- corrige somente `consultaStatus`;
- substitui `data/users-state.json`.

Existe rebuild integral do arquivo de métricas, porém baseado no Calendar.

### Rebuild total

Não existe rebuild total e replay-first que reconstrua, de forma coordenada:

- sessão local;
- snapshot HubSpot;
- métricas;
- Calendar.

Também não existe transaction boundary, checkpoint de projeção, versão de projection schema ou mecanismo de rollback entre esses destinos.

## Dependências e limites

| Componente | Depende de | Pode ser reconstruído apenas por replay hoje? |
|---|---|---|
| Read Model efêmero | Calendar + Event Store | Não aplicável; já é recalculado |
| Calendar | Google Calendar API + metadata externa | Não |
| Sessão local | Calendar, runtime do bot e contexto conversacional | Parcialmente |
| HubSpot snapshot | Sessão completa + CRM | Não |
| Métricas | Eventos Calendar classificados | Não, na implementação atual |

## Estratégia recomendada

### Princípios

1. Event Store nunca é destino de reparo.
2. Todo rebuild recebe um replay imutável como input.
3. Cada projection writer possui allowlist de campos.
4. Calendar não é sobrescrito automaticamente enquanto continuar sendo a fonte de verdade.
5. Toda execução começa com dry-run, diff e chave de idempotência.
6. Escritas usam compare-and-set ou versão da projeção.
7. Após escrever, o Self Verification Engine confirma a convergência.
8. Falha parcial interrompe a operação e exige investigação; não há rollback por reescrita de eventos.

### Ordem recomendada de implementação

1. materializar uma projeção de consulta isolada, sem dados conversacionais;
2. implementar rebuild dessa projeção por replay;
3. fazer sessão local e HubSpot consumirem essa projeção, sem copiar o estado inteiro;
4. implementar métricas replay-first;
5. manter Calendar em modo de verificação e metadata repair;
6. somente avaliar reprojeção de Calendar após capturar no Event Store todos os atributos necessários.

## Capabilities propostas

### `rebuildConsultationReadProjection()`

**Recomendação:** criar uma projeção persistida própria antes de oferecer esta capability.

**Input:** `consultationId`, estado produzido pelo replay e versão esperada da projeção.

**Escopo de escrita:** somente storage dedicado da projeção de consulta.

**Não deve:** escrever Calendar, HubSpot, sessão conversacional ou Event Store.

**Idempotência:** `consultationId + eventStoreSequence + projectionSchemaVersion`.

Esta capability implementaria oficialmente `REBUILD_READ_MODEL`. No estado atual, ela não pode ser implementada corretamente porque o Read Model é efêmero.

### `refreshConsultationSessionProjection()`

**Objetivo:** atualizar somente campos de consulta na sessão local.

**Campos candidatos:** `consultaStatus`, `tipoConsulta`, `_consultaInicio` e `_consultaFim`.

**Fonte:** projeção replay-first validada.

**Proteções:** allowlist de campos, preservação do restante da conversa e escrita atômica de `users-state.json`.

### `refreshConsultationHubSpotProjection()`

**Objetivo:** atualizar somente o fragmento estruturado de consulta no HubSpot.

**Pré-requisito recomendado:** separar propriedades de consulta do `estado_bot_snapshot`.

**Proteções:** leitura da versão atual, merge restrito, compare-and-set e proibição de regravar narrativa/conversa.

Não deve reconstruir o snapshot completo.

### `rebuildConsultationMetricsProjection()`

**Objetivo:** recalcular métricas a partir do Event Store.

**Fonte:** replay de todos os casos até uma sequência/checkpoint conhecido.

**Saída:** arquivo temporário validado e substituição atômica de `consulta-metrics.json`.

**Proteções:** `projectionSchemaVersion`, checkpoint e contagens reconciliadas.

### `repairConsultationCalendarMetadata()`

**Objetivo:** reparar apenas metadata ausente ou inválida de eventos já identificados.

**Escopo permitido:** `extendedProperties.private` estritamente necessárias ao vínculo.

**Não deve:** alterar horário, participantes, recorrência, cancelamento ou resultado sem aprovação específica.

Esta capability é mais segura que uma reprojeção completa e pode atender parte de `CALENDAR_PROJECTION_DRIFT`.

### `reprojectConsultationCalendar()`

**Recomendação atual:** não habilitar para auto repair.

Só deve ser considerada depois que o Event Store representar integralmente:

- horário e timezone;
- duração;
- participantes;
- recorrência;
- notificações;
- status e cancelamento;
- identidade e versão do evento externo.

Até lá, `CALENDAR_PROJECTION_DRIFT` deve resultar em `MANUAL_INVESTIGATION` ou reparo restrito de metadata.

### `fullConsultationProjectionRebuild()`

**Objetivo futuro:** orquestrar, nesta ordem:

1. replay;
2. rebuild da projeção dedicada;
3. refresh da sessão local;
4. refresh restrito do HubSpot;
5. rebuild das métricas;
6. verificação final.

**Calendar:** excluído por padrão. Uma ação separada e explicitamente aprovada trataria metadata.

**Pré-requisitos:** projection schema version, checkpoint, locks por caso, dry-run, journal de execução e writers idempotentes.

## Mapeamento recomendado para o Auto Repair Engine

| Diagnóstico | Mapeamento atual seguro | Mapeamento futuro |
|---|---|---|
| `READ_MODEL_OUTDATED` | reexecutar verificação; não há materialização para rebuild | `rebuildConsultationReadProjection()` |
| `CALENDAR_PROJECTION_DRIFT` | investigação manual ou metadata repair restrito | `repairConsultationCalendarMetadata()`; reprojeção integral somente após novos pré-requisitos |
| `MULTI_PROJECTION_DRIFT` | investigação manual | `fullConsultationProjectionRebuild()` sem Calendar |
| `UNKNOWN_DRIFT` | investigação manual | investigação manual |

## Conclusão

O sistema possui replay, mas ainda não possui projection recovery replay-first. O reconciliador existente é uma rotina parcial Calendar-first e não deve ser reutilizado diretamente como capability oficial de auto repair.

A primeira capability recomendada é criar e reconstruir uma projeção persistida, isolada e versionada de consulta. A reprojeção integral do Calendar não é segura na arquitetura atual e não deve ser automatizada.
