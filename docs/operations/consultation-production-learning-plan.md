# Consultation — plano de aprendizagem operacional de 90 dias

## Objetivo

Validar a arquitetura atual em produção antes de decidir por novas capabilities.

O plano é exclusivamente observacional. Não autoriza:

- watchdog;
- autocorreção;
- novas escritas;
- mudanças no Event Store;
- alteração do HubSpot ou Calendar;
- expansão automática das Fases 9 ou 10.

## Princípios

1. Ausência de telemetria não significa ausência de falha.
2. Um erro técnico isolado não justifica uma nova camada arquitetural.
3. Toda ocorrência deve ser correlacionada por `dealId`.
4. Métricas devem distinguir evento, incidente e intervenção humana.
5. Calendar continua sendo a fonte operacional da agenda.
6. Fase 9 só será reaberta diante de problema recorrente e reparável.
7. Fase 10 só será iniciada diante de impacto comprovado do modelo de identidade.

## Janela e cadência

- Duração: 90 dias.
- Coleta: contínua pelas fontes já existentes.
- Consolidação: semanal.
- Revisões formais: dias 30, 60 e 90.
- Unidade principal: consulta/Deal.

## 1. Métricas semanais

### Cobertura

| Métrica | Definição |
|---|---|
| Deals auditados | quantidade incluída na auditoria read-only |
| Consultas Calendar observadas | eventos de consulta encontrados |
| Sessões locais observadas | sessões associadas a Deal |
| Cobertura da auditoria | Deals auditados ÷ Deals ativos elegíveis |
| Eventos com metadata completa | percentual com `dealId`, `personId` e `contactId` |

### Integridade

| Métrica | Definição |
|---|---|
| Total de drifts | `consultation.integrity_drift_detected` |
| Drifts por tipo | Read Model, Calendar, múltiplas projeções, sessão ou desconhecido |
| Taxa de drift | Deals com drift ÷ Deals auditados |
| Drifts repetidos | mesmo Deal e tipo em mais de uma coleta |
| Drifts não resolvidos | drift sem convergência posterior |
| Self-healings | `consultation.self_healed` |
| Taxa de recuperação | drifts resolvidos ÷ drifts detectados |
| Tempo de recuperação | detecção até convergência confirmada |

### Calendar

| Métrica | Definição |
|---|---|
| Múltiplos eventos ativos | Deals com mais de um evento futuro ativo |
| Eventos sem Deal | evento de consulta sem `dealId` |
| Eventos sem pessoa/Contact | ausência de `personId` ou `contactId` |
| Consultas expiradas sem resultado | evento passado ainda `encerrada` |
| Cancelamentos incompletos | Calendar cancelado sem atualização das demais camadas |
| Reagendamentos manuais | operações que exigiram intervenção humana |
| Falhas de API Calendar | erros de leitura, criação, alteração ou exclusão |

### HubSpot e sessão

| Métrica | Definição |
|---|---|
| Snapshot ativo sem evento | snapshot indica agendada, Calendar não |
| Sessão ativa sem evento | sessão indica agendada, Calendar não |
| Sessão divergente | `consultaStatus` diferente do Calendar |
| Falhas HubSpot | erro de leitura, atualização, associação ou Note |
| Ajustes manuais HubSpot | correções feitas por operador |
| Deals no stage legado Consulta | presença residual de `1343040832` |

### Impacto operacional

| Métrica | Definição |
|---|---|
| Incidentes com cliente afetado | cliente recebeu estado, lembrete ou cancelamento incorreto |
| Consultas perdidas | consulta não realizada por falha sistêmica |
| Mensagens incorretas | aviso enviado à pessoa ou horário errado |
| Intervenções manuais | ações humanas para restaurar consistência |
| Minutos por intervenção | tempo efetivamente gasto |
| Custo operacional estimado | horas de intervenção × custo/hora |

## Registro semanal mínimo

Cada fechamento semanal deve conter:

```text
Semana:
Deals auditados:
Cobertura:
Consultas Calendar:
Drifts por tipo:
Drifts repetidos:
Self-healings:
Falhas Calendar:
Falhas HubSpot:
Intervenções manuais:
Clientes afetados:
Tempo operacional gasto:
Incidentes críticos:
Lacunas de telemetria:
Decisão: manter / investigar / reabrir fase
```

## 2. Eventos que indicam falhas reais

### Falha crítica

- consulta futura desaparece ou é duplicada;
- cliente recebe horário incorreto;
- cancelamento não chega ao Calendar;
- evento é associado ao Deal ou pessoa errada;
- consulta realizada é marcada como no-show;
- pessoa não autorizada recebe informação do caso;
- Event Store ou cadeia de auditoria está corrompida;
- múltiplos eventos ativos provocam conflito de agenda;
- reparo altera estado correto para estado incorreto.

### Falha alta

- `MULTI_PROJECTION_DRIFT`;
- mesmo drift reaparece após correção;
- Calendar e replay discordam sobre cancelamento ou resultado;
- sessão mostra consulta ativa sem evento;
- metadata impede localizar Deal ou participante;
- falha HubSpot exige ajuste manual;
- operação Calendar conclui, mas histórico não é registrado.

### Falha média

- Read Model temporariamente divergente sem afetar cliente;
- snapshot HubSpot desatualizado com Calendar correto;
- evento expirado aguarda reconciliação além da janela acordada;
- Note administrativa não registrada;
- métrica agregada diverge sem impacto de agenda.

### Não classificar automaticamente como incidente

- erro transitório resolvido por retry sem impacto;
- drift detectado durante janela normal de consistência eventual;
- ausência esperada de evento para Deal sem consulta;
- diferença em campo não operacional;
- zero eventos em ambiente sem atividade.

## 3. Hipóteses arquiteturais não validadas

| Hipótese | Evidência necessária |
|---|---|
| Calendar-first elimina divergência perceptível | 90 dias sem incidente funcional de fonte conflitante |
| Read Model representa corretamente o estado atual | comparação recorrente com Calendar e fluxo real |
| Event Store contém toda mudança relevante | nenhum evento Calendar sem evento de domínio correspondente |
| Idempotência evita duplicações sob retries reais | retries observados sem múltiplos eventos ativos |
| Reconciliador converge sessão e Calendar | drifts resolvidos sem recorrência |
| Replay permanece igual ao estado atual | verificações em volume representativo |
| Hash chain é suficiente para auditoria | stores reais íntegros durante toda a janela |
| Session recovery é seguro | ainda não validável em runtime concorrente |
| Metadata identifica corretamente participantes | amostra real com casos próprios e para terceiros |
| Enforcement não prejudica operação | ausência de falhas de produção causadas por bloqueio legítimo |
| API Calendar suporta o volume | latência e rate limit dentro dos limites |
| Filesystem local é suficiente | ausência de perda, corrida ou inconsistência entre instâncias |

## 4. Gatilhos para reabrir a Fase 9

Reabrir imediatamente se ocorrer qualquer um:

- corrupção confirmada de Event Store, Decision Audit ou hash chain;
- consulta criada, cancelada ou concluída com estado incorreto para o cliente;
- `MULTI_PROJECTION_DRIFT` em caso ativo;
- perda de evento histórico após operação Calendar bem-sucedida;
- self-healing produzir estado incorreto;
- três ou mais incidentes críticos em 30 dias.

Reabrir por recorrência se, durante quatro semanas:

- taxa de drift superar 2% dos Deals auditados;
- mais de 20% dos drifts forem repetidos;
- mais de cinco intervenções manuais mensais forem necessárias;
- tempo mediano de resolução superar quatro horas;
- falhas de sincronização afetarem mais de 1% das consultas;
- consultas expiradas permanecerem sem resultado por mais de 24 horas;
- cobertura de metadata ficar abaixo de 99%.

Não reabrir apenas porque:

- existem drifts sem impacto e de curta duração;
- a amostra ainda é pequena;
- métricas continuam indisponíveis;
- uma capability seria tecnicamente interessante.

## 5. Gatilhos para iniciar a Fase 10 — Identity

Iniciar imediatamente diante de:

- informação jurídica enviada à pessoa errada;
- caso associado ao Contact errado;
- terceiro negar atendimento que foi vinculado à sua identidade;
- documentos ou Notes aparecerem na timeline da pessoa errada;
- consulta associada ao representante quando deveria estar no assistido;
- incidente LGPD ou quebra de confidencialidade relacionado a identidade.

Iniciar por evidência acumulada se:

- mais de 5% dos casos auditados forem para terceiros;
- mais de 2% dos Contacts exigirem revisão de identidade;
- houver três ou mais colisões nome × telefone em 30 dias;
- houver reutilização incorreta de Deal por telefone compartilhado;
- operadores precisarem distinguir manualmente representante e assistido de forma recorrente;
- `personId === contactId` impedir identificar o participante real;
- troca de telefone causar duplicação ou perda de histórico.

Adiar Fase 10 se:

- casos de terceiro forem raros;
- não houver erro de associação;
- correções forem pontuais e de baixo custo;
- a cobertura de dados ainda não permitir medir identidade.

## 6. Indicadores de sucesso

A arquitetura atual será considerada bem-sucedida se, ao final dos 90 dias:

- cobertura de auditoria for superior a 95%;
- metadata completa for superior a 99%;
- não houver incidente crítico com cliente;
- não houver múltiplos eventos ativos;
- taxa de drift funcional for inferior a 1%;
- drifts transitórios convergirem dentro da janela acordada;
- não houver recorrência após convergência;
- nenhuma operação depender do stage legado Consulta;
- nenhuma intervenção manual recorrente for necessária;
- Calendar, Read Model e replay concordarem nos casos auditados;
- Event Store e cadeias permanecerem íntegros;
- falhas HubSpot não alterarem o estado de agenda;
- custo operacional de manutenção for baixo e previsível.

Sucesso não exige zero erro técnico. Exige ausência de erro funcional relevante e recuperação controlada.

## 7. Indicadores de necessidade de novas capabilities

### Nova observabilidade

Justificada quando:

- falhas continuam não mensuráveis;
- não há correlação entre drift e resolução;
- incidentes não podem ser atribuídos a um Deal;
- tempo de recuperação não pode ser calculado.

### Watchdog somente observacional

Justificado quando:

- auditoria manual não cobre mais de 95%;
- drifts surgem entre fechamentos semanais;
- detecção tardia aumenta impacto;
- volume impede revisão humana.

### Recovery de sessão

Justificado quando:

- `SESSION_PROJECTION_DRIFT` é recorrente;
- sessão incorreta afeta menus ou retomadas;
- custo de correção manual é relevante.

Antes disso, exige coordenação entre memória viva, arquivo e locks.

### Recovery de metadata Calendar

Justificado quando:

- eventos sem metadata são recorrentes;
- horários e status continuam corretos;
- reparo pode ser limitado a vínculos.

### Reprojeção Calendar

Somente justificável se:

- Event Store representar integralmente agenda, participantes e timezone;
- Calendar perder dados de forma recorrente;
- houver dry-run, autorização, lock e rollback operacional.

Não é recomendada no ciclo atual.

### Recovery HubSpot

Justificado quando:

- snapshot ou propriedades divergentes causam trabalho recorrente;
- a allowlist de campos reparáveis puder ser isolada;
- Calendar e Event Store permanecerem protegidos.

### Identity bounded context

Justificado pelos gatilhos da Fase 10, especialmente risco de confidencialidade, associação errada e volume de casos para terceiros.

## Revisões formais

### Dia 30

- verificar cobertura;
- eliminar métricas ainda indisponíveis;
- classificar primeiros incidentes;
- não aprovar autocorreção.

### Dia 60

- analisar tendências;
- identificar drifts repetidos;
- calcular custo operacional;
- avaliar se algum gatilho foi atingido.

### Dia 90

Escolher uma decisão:

1. **ENCERRAR** — arquitetura estável; manter observação normal.
2. **REABRIR FASE 9** — integridade exige capability específica.
3. **INICIAR FASE 10** — identidade causa impacto comprovado.
4. **PRORROGAR OBSERVAÇÃO** — dados insuficientes, sem incidente crítico.

## Recomendação inicial

Com a baseline atual:

- manter observação;
- não habilitar watchdog;
- não habilitar autocorreção;
- melhorar apenas a disponibilidade das métricas;
- revisar semanalmente;
- exigir evidência antes de qualquer expansão.

O objetivo dos 90 dias não é provar que a arquitetura é perfeita. É descobrir, com custo baixo e evidência real, onde ela merece permanecer simples.
