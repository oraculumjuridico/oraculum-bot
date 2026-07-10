# Consultation — diagnóstico operacional das capabilities de integridade

## Objetivo

Este documento consolida o estado operacional da Fase 9 antes da introdução de qualquer Integrity Watchdog.

Não propõe ativação automática imediata. O foco é distinguir:

- o que o domínio consegue detectar;
- o que consegue registrar como evidência;
- o que consegue efetivamente reparar;
- quais lacunas ainda impedem operação autônoma segura.

## Resumo executivo

O domínio já possui uma cadeia completa de componentes conceituais:

1. hashing determinístico;
2. self verification;
3. classificação de drift;
4. evento auditável de drift;
5. Auto Repair Engine;
6. uma capability oficial de recovery da sessão persistida;
7. evento auditável de self-healing.

Essa cadeia ainda não está conectada automaticamente.

O único reparo oficial implementado é a atualização da projeção de sessão em `data/users-state.json`. Mesmo esse reparo ainda não atualiza o objeto `users` carregado na memória do servidor e não possui coordenação com a persistência normal do bot.

Os drifts atualmente detectados pelo Self Verification Engine dizem respeito a replay, Read Model e Calendar. A projeção de sessão não participa dessa verificação. Consequentemente, `SESSION_PROJECTION_DRIFT` pode ser tratado pelo Auto Repair Engine quando fornecido explicitamente, mas ainda não é produzido automaticamente pelo Drift Detector.

Não há condições seguras para habilitar watchdog com reparo automático geral.

## 1. O que já é detectado

### 1.1 Hashing determinístico

`consultation-integrity-hash.js`:

- canonicaliza objetos com ordenação recursiva;
- remove campos transitórios conhecidos;
- calcula SHA-256;
- produz hashes independentes para Read Model, replay e Calendar.

O hashing identifica mudança de conteúdo, mas não determina sozinho a causa ou a correção adequada.

### 1.2 Self Verification Engine

`consultation-self-verification-engine.js` compara:

- estado reconstruído por replay;
- estado retornado pelo Read Model;
- projeção atual do Calendar.

O replay é usado como valor esperado.

As inconsistências incluem:

- caminho do campo;
- valor esperado;
- valor atual;
- fonte divergente.

Campos comparados na projeção normalizada:

- `dealId`;
- `status`;
- `event.calendarEventId`;
- `event.inicio`;
- `event.fim`;
- `event.tipoConsulta`.

### 1.3 Drift Detector

`consultation-drift-detector.js` classifica:

| Drift | Condição |
|---|---|
| `READ_MODEL_OUTDATED` | replay e Calendar iguais; Read Model diferente |
| `CALENDAR_PROJECTION_DRIFT` | replay e Read Model iguais; Calendar diferente |
| `MULTI_PROJECTION_DRIFT` | Read Model e Calendar divergem do replay |
| `UNKNOWN_DRIFT` | resultado não enquadrado ou hashes incompletos |

O detector não executa reparos.

### 1.4 Integridade criptográfica

Também são detectáveis:

- adulteração da cadeia global de eventos;
- adulteração da cadeia por caso;
- alteração da cadeia de decisões;
- quebra da cadeia de eventos de integridade;
- inconsistência temporal;
- divergência entre replay e estado apresentado em dossiê;
- alteração de arquivos críticos protegidos pelo manifest.

### 1.5 O que ainda não é detectado

Não há verificação automática de:

- `consultaStatus` da sessão em memória;
- `consultaStatus` persistido em `users-state.json`;
- fragmento de consulta em `estado_bot_snapshot`;
- métricas em `consulta-metrics.json`;
- igualdade entre sessão em memória e sessão persistida;
- perda de atualização concorrente entre runtime e recovery;
- eventos Calendar sem representação histórica suficiente;
- duplicação ou ausência de registros no Decision Audit Trail;
- atraso máximo aceitável de uma projeção;
- drift baseado em checkpoint ou sequence lag.

## 2. O que já é auditado

### 2.1 Drift detectado

`consultation.integrity_drift_detected` pode registrar:

- `consultationId`;
- data de detecção;
- tipo e severidade;
- estratégia recomendada;
- hashes das três fontes;
- inconsistências campo a campo.

O evento utiliza envelope v3, storage append-only, lock local e cadeia SHA-256.

O mesmo ato gera entrada no Decision Audit Trail:

`INTEGRITY_DRIFT_DETECTED`.

O registro ainda não é chamado automaticamente pelo Verification Engine ou Drift Detector.

### 2.2 Self-healing

`consultation.self_healed` registra:

- instante do reparo;
- drift e estratégia;
- hashes anteriores;
- hashes resultantes;
- verificação anterior;
- verificação posterior.

Ele somente é persistido quando `verificationAfter.healthy === true`.

O mesmo ato registra:

`SELF_HEALING_EXECUTED`.

### 2.3 Dossiês e snapshots jurídicos

O domínio já consegue produzir:

- replay histórico;
- timeline;
- decisões;
- narrativa;
- proof SHA-256;
- dossiê verificável;
- validação contra adulteração.

Esses artefatos são evidência e não projeções reparáveis.

### 2.4 Limitações da auditoria atual

- eventos de drift não têm chave de idempotência;
- retries podem registrar múltiplas detecções equivalentes;
- o Decision Audit Trail não usa lock de escrita;
- locks existentes são locais ao processo e não distribuídos;
- não existe correlação única que ligue verificação, drift, reparo e self-healed;
- não existe status persistido de tentativa de reparo iniciada, abortada ou falha;
- falha após modificar a projeção, mas antes de registrar `self_healed`, deixa uma lacuna de auditoria;
- os eventos não são disparados automaticamente.

## 3. O que já pode ser corrigido

### 3.1 Session Projection persistida

Capability oficial:

`refreshConsultationSessionProjection({ consultationId })`.

Fonte:

- replay do Event Store.

Destino:

- `data/users-state.json`.

Allowlist de campos:

- `consultaStatus`;
- `tipoConsulta`;
- `_consultaInicio`;
- `_consultaFim`.

Garantias implementadas:

- preservação dos demais campos;
- escrita por arquivo temporário e rename;
- hash antes e depois;
- ausência de escrita quando o hash já está correto;
- idempotência para o mesmo replay.

### 3.2 Integração com Auto Repair

Mapeamento disponível:

`SESSION_PROJECTION_DRIFT → REFRESH_SESSION_PROJECTION`.

O Auto Repair Engine:

1. verifica;
2. obtém replay;
3. chama mecanismo autorizado;
4. verifica novamente;
5. exige resultado saudável;
6. registra `consultation.self_healed`.

### 3.3 Limitações do recovery de sessão

A capability atualiza somente o arquivo persistido.

Ela não atualiza:

- o objeto global `users` já carregado pelo servidor;
- sessões em outros processos ou instâncias;
- snapshot do HubSpot;
- Calendar;
- métricas.

Em processo ativo, uma gravação posterior de `state-persistence.js` pode sobrescrever o arquivo recuperado com estado antigo ainda presente em memória.

Também não existe lock compartilhado entre:

- `refreshConsultationSessionProjection`;
- debounce de `state-persistence.js`;
- script de reconciliação.

Portanto, a capability comprova o modelo de recovery, mas ainda não é segura para execução automática concorrente em produção.

## 4. Projeções sem recovery capability

### 4.1 Read Model

Não possui recovery porque não é persistido. É calculado a cada chamada.

Uma divergência do Read Model indica potencialmente:

- erro de regra;
- versão de código;
- interpretação divergente dos eventos;
- input Calendar inconsistente.

Não há objeto materializado para reconstruir.

### 4.2 Calendar

Não existe capability oficial de reprojeção.

Há comandos pontuais para:

- criar evento;
- cancelar;
- definir resultado;
- vincular metadata.

Esses comandos não constituem rebuild seguro.

### 4.3 HubSpot snapshot

Não existe recovery específico.

O estado de consulta está misturado a um snapshot amplo de conversa e CRM. Regravar esse objeto por replay poderia destruir dados não relacionados.

### 4.4 Métricas

Não existe capability replay-first.

O arquivo de métricas é atualmente reconstruído pelo reconciliador a partir do Calendar.

### 4.5 Sessão em memória

Não existe capability de refresh coordenado do objeto `users`.

A projeção persistida e a projeção viva podem divergir após o recovery do arquivo.

### 4.6 Artefatos de auditoria

Decision Audit, eventos de integridade, dossiês e proofs não devem possuir recovery mutável. São registros ou artefatos append-only.

## 5. Drifts que ainda não podem ser autocorrigidos

### `READ_MODEL_OUTDATED`

Estratégia nominal:

`REBUILD_READ_MODEL`.

Situação real:

- não existe Read Model materializado;
- não existe capability oficial;
- exige investigação de código ou regra.

### `CALENDAR_PROJECTION_DRIFT`

Estratégia nominal:

`REPROJECT_CALENDAR`.

Situação real:

- não existe capability oficial;
- Calendar continua sendo source of truth operacional;
- reprojeção automática é insegura.

### `MULTI_PROJECTION_DRIFT`

Estratégia nominal:

`FULL_REPLAY_REBUILD`.

Situação real:

- não existe rebuild completo;
- só a sessão persistida possui capability;
- deve falhar fechado.

### `UNKNOWN_DRIFT`

Permanece obrigatoriamente manual.

### `SESSION_PROJECTION_DRIFT`

Existe capability de correção, mas:

- o Self Verification Engine não compara a sessão;
- o Drift Detector não produz essa classificação;
- a correção não atualiza sessão em memória;
- não há lock coordenado.

Assim, ainda não deve ser disparado por watchdog.

## 6. Riscos remanescentes

### Concorrência

- corrida entre recovery e persistência normal;
- múltiplas instâncias escrevendo o mesmo arquivo;
- ausência de lock distribuído;
- perda de atualizações do usuário durante reparo.

### Fonte da verdade

- replay é usado como esperado pelo verificador;
- Calendar é definido como source of truth operacional;
- em certos cenários os dois podem divergir legitimamente;
- falta uma política explícita para decidir quando replay pode prevalecer sobre Calendar.

### Cobertura incompleta de estado

O modelo comparável usa poucos campos. Participantes, timezone, recorrência, notificações e metadata externa não são verificados.

### Auditoria e idempotência

- eventos repetidos em retries;
- ausência de correlation ID;
- ausência de evento `self_healing_failed`;
- possibilidade de reparo concluído sem registro por falha subsequente;
- Decision Audit sem lock.

### Disponibilidade

- Google Calendar ou filesystem indisponíveis podem parecer drift;
- relógio e timezone podem gerar falsos positivos;
- ausência de política de retry e backoff;
- verificação massiva pode consumir API Calendar.

### Segurança operacional

- capability de escrita exposta no facade;
- falta de autorização por operador, tenant ou ambiente;
- ausência de dry-run obrigatório;
- ausência de limite diário de reparos;
- ausência de circuit breaker.

### Evolução de schema

- projeção de sessão não possui `projectionSchemaVersion`;
- não há checkpoint de sequence;
- migrações futuras podem alterar o significado dos hashes.

## 7. O que falta para habilitar watchdog automático

### Pré-requisitos obrigatórios

1. incluir a sessão persistida e a sessão em memória no Self Verification Engine;
2. fazer o Drift Detector produzir `SESSION_PROJECTION_DRIFT`;
3. criar adapter oficial para atualizar sessão em memória e arquivo na mesma região crítica;
4. compartilhar lock com `state-persistence.js`;
5. criar lock distribuído por `consultationId`;
6. adicionar chave idempotente/correlation ID à sequência de integridade;
7. registrar início, sucesso e falha de cada tentativa;
8. impedir execução concorrente para o mesmo caso;
9. definir política explícita Calendar versus replay;
10. excluir drifts sem capability oficial da autocorreção;
11. implementar dry-run e diff antes da escrita;
12. adicionar rate limit, retry, backoff e circuit breaker;
13. definir timeout e orçamento de API;
14. adicionar métricas e alertas operacionais;
15. implementar kill switch global e por capability;
16. criar autorização explícita por ambiente;
17. testar recuperação após crash entre escrita e auditoria;
18. realizar testes com múltiplos processos;
19. definir retenção dos eventos de integridade;
20. validar comportamento com Event Store vazio, legado ou parcialmente migrado.

### Política recomendada para a primeira versão

Um watchdog inicial deve operar apenas em modo observação:

1. verificar;
2. classificar;
3. registrar `integrity_drift_detected`;
4. alertar;
5. nunca reparar.

Após estabilização, pode-se habilitar reparo somente para:

`SESSION_PROJECTION_DRIFT`.

Mesmo nesse caso, somente depois de implementar atualização coordenada da sessão viva e lock compartilhado.

Todos os demais drifts devem continuar com:

`MANUAL_INVESTIGATION`.

## Conclusão

A Fase 9 já fornece detecção, classificação, evidência e um primeiro mecanismo de recuperação controlada. Ela ainda não fornece segurança de concorrência, cobertura de todas as projeções ou política suficiente para operação autônoma.

O próximo passo seguro não é ativar correção automática. É ampliar a verificação da sessão, coordenar o writer da projeção persistida com o runtime e executar o watchdog inicialmente em modo somente observação.
