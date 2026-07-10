# Relatorio - bloqueadores criticos de producao

Data: 2026-07-08

## Escopo

Resolvidos somente os bloqueadores criticos de producao ligados a templates de
consulta, idempotencia de callbacks e arquitetura Make para lembretes.

Nao foram alterados intencionalmente:

- fluxos juridicos;
- menus;
- `processarInterno()`;
- handler `template_consulta`, que permanece sem inteligencia propria.

## Bloqueadores resolvidos

### 1. Template sem contexto ativo

Resolvido.

`/lembrete` agora exige usuario localizado e `contextoConversa` valido antes de
criar a execucao idempotente e antes de chamar o envio do template.

`template-service` aceita `requireContextoConversa: true`. Nesse modo:

- se nao houver usuario persistivel, nao envia;
- se o contexto for invalido, nao envia;
- se a Meta falhar, restaura o contexto anterior;
- se a Meta confirmar o envio, o cliente ja tem contexto ativo para responder.

### 2. Idempotencia em `processing` abandonado

Resolvido.

`callback-idempotency` agora possui TTL especifico para registros
`processing`, configuravel por:

```text
CALLBACK_IDEMPOTENCY_PROCESSING_TTL_MS=900000
```

No boot do Node, `recoverCallbackIdempotencyAbandonedProcessing()` remove
execucoes antigas em `processing`. Em novas tentativas, `beginCallbackExecution`
tambem recupera registros abandonados antes de decidir se deve bloquear.

Um lembrete nao fica permanentemente travado por reinicio do servidor ou queda
durante processamento.

### 3. Arquitetura Make materializada

Resolvido no repositorio.

Blueprints finais:

```text
docs/integrations/make-blueprints/oraculum-consulta-planejamento.blueprint.json
docs/integrations/make-blueprints/oraculum-consulta-disparo-recorrente.blueprint.json
docs/integrations/make-blueprints/oraculum-consulta-ciclo-vida.blueprint.json
```

Data Store:

```text
consulta_reminders
```

Estados minimos:

```text
pending
sent
skipped
cancelled
```

Fluxos cobertos:

- planejamento por evento Calendar;
- replanejamento em reagendamento;
- disparo recorrente Scheduler + Data Store;
- retry mantendo `pending`;
- cancelamento e evento excluido marcando `cancelled`;
- consulta concluida marcando pendencias como `skipped`.

## Validacao executada

Comandos executados:

```text
node test/template-service-context.test.js
node test/callback-idempotency.test.js
node test/calendar-event-id-hardening.test.js
node test/consultation-architecture-audit.test.js
node test/consultation-architecture-hard-lock.test.js
node test/webhook-durability.test.js
```

Todos passaram.

Tambem foi validado parse JSON dos blueprints em
`docs/integrations/make-blueprints`.

`npm test` foi iniciado, mas excedeu 120s sem concluir nesta sessao. Os testes
focados e as auditorias de arquitetura relevantes passaram.

## Matriz dos cenarios solicitados

| Cenario | Status |
| --- | --- |
| Agendamento normal | Coberto por blueprint de planejamento + rota `/consulta-lembrete-dados` |
| Reagendamento | Coberto por cancelamento de pendencias antigas e recriacao de `pending` |
| Cancelamento | Coberto por `cancelled` + `/evento-cancelado` |
| Evento excluido | Mesmo caminho de cancelamento |
| Retry | `pending` preservado em rede/5xx; idempotencia duravel no bot |
| Reinicio do Node | `processing` abandonado recuperado por TTL no boot e no begin |
| Reinicio do Make | Data Store preserva `pending`; Scheduler retoma |
| Queda de rede | Registro permanece `pending`; proximo ciclo tenta novamente |

## Limitacao remanescente

A importacao/ativacao dentro da conta Make ainda depende de reconectar as
credenciais e variaveis da conta (`Google Calendar`, `HTTP Oraculum`,
`Data Store consulta_reminders`). A arquitetura e os blueprints finais estao
materializados no repositorio; a conexao operacional externa deve ser feita no
painel Make com os segredos reais.
