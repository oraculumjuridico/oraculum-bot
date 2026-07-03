# Consultation — diagnóstico de problemas operacionais

## Escopo e qualidade da evidência

Este relatório foi produzido a partir do código, dos scripts operacionais, do estado local persistido e do histórico Git disponível em 28/06/2026.

Não houve acesso aos dados reais do Google Calendar ou do HubSpot: o conector HubSpot não disponibilizou ferramentas de leitura nesta sessão e nenhuma consulta autenticada aos serviços externos foi executada. Também não há, no workspace, exportação de chamados, logs históricos de produção ou observabilidade dos últimos 30 dias.

Consequentemente:

- falhas demonstráveis pelo código são apresentadas como falhas ou lacunas reais do sistema;
- cenários previstos pelo código são apresentados como riscos operacionais, não como incidentes confirmados;
- frequências e impactos financeiros sem fonte auditável são marcados como não mensuráveis;
- não se atribui a ausência de arquivos locais à ausência de incidentes em produção.

## Resumo executivo

O principal problema operacional não é apenas a possibilidade de drift. É a ausência de evidência contínua para dizer quando, quantas vezes e em quais casos o drift ocorreu.

O workspace atual contém somente `data/users-state.json`, com uma sessão e nenhum `negocioId`. Não contém:

- `data/consulta-events.jsonl`;
- `data/consultation-decisions.jsonl`;
- `data/consultation-integrity-events.jsonl`;
- `data/consulta-metrics.json`.

Assim, replay, auditoria de decisões, histórico de self-healing e métricas operacionais não oferecem amostra local dos últimos 30 dias.

Além disso, a auditoria read-only disponível não conclui em runtime: `scripts/audit-consulta-phase1.js` referencia `STAGE_CONSULTA`, que não está definido. Isso impede que o próprio instrumento existente produza o diagnóstico integral de Calendar, HubSpot e sessão.

## 1. Falhas que ainda exigem intervenção manual

### 1.1 Calendar indisponível ou falha de cancelamento

O cancelamento administrativo depende de exclusão no Calendar. Se a chamada falha, o sistema retorna “Tente novamente em instantes” e não possui fila durável, retry assíncrono ou compensação automática.

Evidência:

- `server.js:4646-4657`;
- o erro encerra a operação e oferece apenas nova tentativa manual.

Impacto operacional:

- operador precisa repetir o cancelamento;
- enquanto isso, o evento pode continuar ativo e o horário ocupado;
- cliente, sessão e HubSpot podem permanecer com informação diferente do Calendar.

### 1.2 Cancelamento parcialmente concluído

Após cancelar no Calendar, o fluxo ainda tenta registrar nota no HubSpot e avisar o cliente. Essas ações podem falhar independentemente. O retorno ao administrador mostra cada falha, mas não existe compensação ou retry persistente.

Evidência:

- `server.js:4660-4696`;
- o código reporta “Nota HubSpot: não registrada” e “Cliente avisado: não enviado”.

Intervenção manual possível:

- registrar a ocorrência no CRM;
- avisar o cliente;
- conferir se a agenda e o caso ficaram coerentes.

### 1.3 Cancelamento sem vínculo seguro com eventId

Quando o item administrativo não possui `eventId`, o sistema se recusa corretamente a cancelar, mas orienta o operador a abrir o HubSpot ou atualizar a agenda.

Evidência:

- `server.js:4608-4617`.

Isso exige identificação ou correção manual do vínculo Calendar ↔ Deal.

### 1.4 Falha de sincronização HubSpot

As rotinas de HubSpot registram erro, mas não mantêm outbox, fila de retry ou confirmação posterior de convergência.

Evidência:

- `src/domain/hubspot-sync.js:118-125`;
- `src/domain/hubspot-core.js:121-131`;
- o erro é enviado ao log e propagado ou convertido em resultado de falha, sem mecanismo durável de recuperação.

### 1.5 Drifts fora da projeção de sessão

Somente a sessão persistida possui capability oficial de recovery. Os seguintes diagnósticos continuam sem reparo oficial:

| Drift | Situação operacional |
|---|---|
| `READ_MODEL_OUTDATED` | exige investigação de regra/código; não há Read Model persistido para rebuild |
| `CALENDAR_PROJECTION_DRIFT` | exige decisão manual; Calendar é a fonte operacional e não há reprojeção segura |
| `MULTI_PROJECTION_DRIFT` | não há rebuild integral |
| `UNKNOWN_DRIFT` | investigação manual obrigatória |

Evidência:

- `src/domain/consultation/integrity/consultation-auto-repair-engine.js`;
- apenas `SESSION_PROJECTION_DRIFT` possui `officialMechanism`;
- os outros mecanismos precisam ser fornecidos externamente e autorizados.

### 1.6 Session recovery incompleto em processo ativo

`refreshConsultationSessionProjection()` altera `data/users-state.json`, mas não o objeto `users` já carregado na memória do servidor.

Evidência:

- `src/domain/consultation/projections/consultation-session-recovery.js`;
- a capability lê e regrava exclusivamente o arquivo.

Portanto, depois de um refresh:

- o runtime pode continuar operando com valor antigo;
- uma persistência normal posterior pode sobrescrever o arquivo recuperado;
- a recuperação segura exige coordenação ou reinício controlado.

### 1.7 Eventos expirados sem resultado explícito

Um evento passado é classificado como `encerrada`. A reconciliação precisa convertê-lo para `realizada` ou `nao_compareceu`, usando `resultadoPadraoExpiracao`, cujo padrão é `nao_compareceu`.

Evidência:

- `src/domain/calendar-scheduling.js`, função `classificarEstadoEvento`;
- `scripts/reconcile-consulta.js`, função `reconciliarEventos`.

Sem execução periódica e bem-sucedida do reconciliador, o estado pode permanecer `encerrada`. Além disso, inferir `nao_compareceu` por padrão não comprova que a pessoa realmente faltou; resultados reais ainda dependem de marcação administrativa ou regra operacional explícita.

## 2. Divergências ainda possíveis

### Consultation Event Store × Calendar

Possibilidades demonstráveis:

- criação do evento no Calendar seguida de falha ao registrar histórico;
- exclusão/cancelamento no Calendar sem append correspondente;
- evento criado ou editado diretamente no Google Calendar sem evento de domínio;
- histórico vazio ou incompleto enquanto Calendar possui agenda real.

Evidência:

- `src/domain/calendar-scheduling.js`, `registrarHistoricoAgendamento()` captura a falha do Event Store, apenas registra log e permite que a operação Calendar permaneça concluída;
- o workspace não contém `data/consulta-events.jsonl`.

Consequência:

- o estado atual pelo Calendar pode funcionar;
- replay, timeline, prova histórica e verificação de integridade ficam incompletos ou divergentes.

### Consultation × HubSpot

Possibilidades:

- Calendar cancelado, mas nota ou atualização HubSpot falha;
- `estado_bot_snapshot` continua contendo estado antigo;
- stage jurídico permanece válido, mas telas ou operadores interpretam propriedades legadas como agenda;
- rotinas antigas ainda recalculam ou exibem “novo stage” depois de cancelamento.

Evidência:

- `server.js:3442-3450` prevê revisão manual “no HubSpot/agenda” quando a operação fica incompleta;
- `server.js:4690-4695` ainda apresenta `novoStage` e “HubSpot stage” na auditoria do cancelamento;
- `server.js:1499` persiste `estado_bot_snapshot`;
- `server.js:3471` e `src/domain/client-menu-ui.js:83` ainda desserializam o snapshot.

Não foi possível medir quantos Deals reais estão divergentes sem leitura do HubSpot.

### Consultation × sessão local

Possibilidades:

- sessão marcada `agendada` sem evento Calendar ativo;
- sessão com status anterior após cancelamento, expiração ou resultado manual;
- arquivo corrigido por recovery e memória do servidor ainda antiga;
- persistência concorrente desfazendo o recovery.

Evidência:

- `scripts/audit-consulta-phase1.js` possui regras específicas para `SESSAO_LOCAL_ATIVA_SEM_EVENTO` e `SESSAO_LOCAL_ATIVA_EVENTO_NAO_ATIVO`;
- `scripts/reconcile-consulta.js` altera `sessao.consultaStatus` quando difere do Calendar;
- `consultation-session-recovery.js` não atualiza a sessão viva.

Estado local observado:

- uma sessão persistida;
- zero sessões associadas a `negocioId`;
- zero sessões `agendada`, `cancelada`, `realizada` ou `nao_compareceu`.

Essa amostra não permite avaliar casos Consultation reais.

### HubSpot × sessão local

O snapshot HubSpot e a sessão local são gravados por mecanismos diferentes. Não existe transação distribuída entre os dois.

Evidência:

- `server.js:1499` prepara `estado_bot_snapshot`;
- `src/domain/state-persistence.js` persiste `users-state.json`;
- falhas HubSpot são tratadas separadamente das falhas de persistência local.

Uma escrita pode concluir e a outra falhar, deixando retomada e CRM com estados diferentes.

## 3. Chamados e bugs recorrentes

### Não há base de chamados disponível

Não existe no repositório:

- exportação de tickets;
- identificadores de incidentes;
- série histórica de erros;
- classificação de causa;
- contagem por tipo de chamado.

Logo, não é possível afirmar honestamente quais bugs são “recorrentes” nem sua frequência.

### Defeito verificável no auditor operacional

`scripts/audit-consulta-phase1.js` usa:

```text
STAGE_CONSULTA
```

na geração do escopo, mas essa constante não é declarada no arquivo. Se `auditar()` chega à montagem do retorno, ocorre `ReferenceError`.

Evidência:

- lista declarada: `STAGES_CONHECIDOS`;
- referência inválida: cálculo de `dealsNoStageLegado`.

Consequência:

- a auditoria que deveria quantificar divergências não produz relatório completo;
- problemas reais podem permanecer sem inventário;
- o diagnóstico de produção depende de inspeção manual ou correção prévia do auditor.

### Categorias de falha previstas repetidamente no código

Embora não seja possível provar recorrência histórica, o código trata explicitamente:

- falha ao listar consultas no Calendar;
- falha ao deletar evento;
- evento sem ID Calendar;
- falha de atualização HubSpot;
- nota HubSpot não registrada;
- aviso ao cliente não enviado;
- sessão ativa sem evento;
- múltiplos eventos ativos;
- metadata Calendar ausente;
- snapshot inválido ou ativo sem evento.

Essas categorias formam o catálogo mínimo recomendado para chamados e métricas futuras.

## 4. Quantidades nos últimos 30 dias

Período solicitado: 30/05/2026 a 28/06/2026.

| Operação | Quantidade comprovável | Motivo |
|---|---:|---|
| Corrigir estado | Não mensurável | não há log de reconciliações, eventos de integridade ou histórico de repairs disponível |
| Reagendar manualmente | Não mensurável | não há acesso ao Calendar nem exportação de chamados; eventos de domínio locais estão ausentes |
| Ajustar HubSpot | Não mensurável | não há acesso ao CRM nem audit log/exportação local |
| Reparar dados | Não mensurável | `consultation-integrity-events.jsonl` e Decision Audit não existem no workspace |

Evidências quantitativas disponíveis:

| Fonte | Observação |
|---|---:|
| `data/users-state.json` | 1 sessão |
| Sessões com `negocioId` | 0 |
| `consulta-events.jsonl` | arquivo ausente |
| `consultation-decisions.jsonl` | arquivo ausente |
| `consultation-integrity-events.jsonl` | arquivo ausente |
| `consulta-metrics.json` | arquivo ausente |
| Commits visíveis no período | 1 commit, sem histórico de incidente no assunto |

Esses números descrevem apenas o workspace, não a produção.

Para obter as quatro contagens reais seriam necessários, no mínimo:

1. audit log do HubSpot no período;
2. eventos Calendar e histórico de alterações;
3. logs de execução do reconciliador;
4. Event Store e Decision Audit usados em produção;
5. chamados classificados por `dealId` e tipo de intervenção.

## 5. Impacto financeiro e operacional

### Impacto financeiro

Não há dados de:

- horas gastas por operador;
- custo/hora;
- consultas perdidas;
- taxa de no-show indevidamente atribuída;
- receita média por consulta ou caso;
- conversão perdida após falha.

Portanto, o impacto financeiro não pode ser calculado com evidência.

Fórmula recomendada para futura mensuração:

```text
impacto mensal =
  (intervenções manuais × minutos médios ÷ 60 × custo/hora)
  + (consultas perdidas × margem média por consulta)
  + (casos perdidos por falha × margem média por caso)
```

### Impacto operacional comprovável

| Falha | Impacto |
|---|---|
| Falha Calendar | cancelamento ou estado não conclui; requer tentativa manual |
| Falha HubSpot após Calendar | CRM perde rastreabilidade ou fica desatualizado |
| Falha no aviso WhatsApp | cliente pode comparecer a consulta cancelada ou perder reagendamento |
| Event Store incompleto | replay e dossiê jurídico deixam de refletir toda a operação |
| Sessão divergente | bot pode mostrar opção, status ou retomada incorretos |
| Expiração não reconciliada | consulta permanece `encerrada`, sem resultado operacional final |
| Auditor quebrado | equipe não consegue quantificar divergências com o instrumento existente |

### Severidade sugerida

- **Alta:** Calendar alterado sem histórico; cancelamento sem aviso; sessão ativa sem evento; múltiplos eventos ativos.
- **Média:** HubSpot ou snapshot desatualizado com Calendar correto; evento sem metadata completa; expiração sem resultado.
- **Baixa:** falha isolada de nota administrativa quando Calendar, cliente e estado atual estão corretos.

## Conclusão

Hoje ainda há intervenção manual necessária quando Calendar, HubSpot ou comunicação falham parcialmente, quando falta vínculo por `eventId`, e para todos os drifts sem recovery oficial.

O problema mais urgente para gestão é observabilidade: não existe evidência local suficiente para responder quantas intervenções ocorreram em 30 dias ou quanto custaram. Antes de um watchdog automático, é necessário tornar a auditoria executável, preservar logs de reconciliação e correlacionar Calendar, HubSpot, sessão e eventos por `dealId`.

Com a evidência atual, qualquer número de incidentes ou impacto financeiro seria especulativo.
