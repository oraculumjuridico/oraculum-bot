# Make - lembretes temporizados de consulta

## Objetivo

Substituir o encadeamento legado:

```text
Google Calendar -> /buscar-contato-reuniao -> /lembrete
```

por lembretes realmente temporizados. O bot continua confirmando o agendamento
imediatamente pelo fluxo existente. O Make fica responsavel apenas pelo
planejamento, disparo e limpeza dos lembretes.

## Blueprints finais

Blueprints versionados no repositorio:

```text
docs/integrations/make-blueprints/oraculum-consulta-planejamento.blueprint.json
docs/integrations/make-blueprints/oraculum-consulta-disparo-recorrente.blueprint.json
docs/integrations/make-blueprints/oraculum-consulta-ciclo-vida.blueprint.json
```

Blueprint operacional existente convertido para planejamento:

```text
C:\Users\jesai\Documents\ARQUIVOS PESSOAIS\Direito\Escritorio Oraculum\Bot Oraculum\Make.com\Integration Google Calendar, HTTP.blueprint.json
```

Backup anterior:

```text
C:\Users\jesai\Documents\ARQUIVOS PESSOAIS\Direito\Escritorio Oraculum\Bot Oraculum\Make.com\Integration Google Calendar, HTTP.blueprint.backup-before-reminders-20260708.json
```

Data Store:

```text
consulta_reminders
```

Estados permitidos:

```text
pending
sent
skipped
cancelled
```

## Cenario 1 - planejamento e reagendamento

Gatilho:

```text
Google Calendar - Watch Events
```

Filtro:

```text
event.id existe
status != cancelled
start.dateTime existe
```

HTTP:

```http
POST /consulta-lembrete-dados
{
  "eventId": "{{event.id}}"
}
```

Resposta esperada:

```json
{
  "phone": "55...",
  "name": "Nome",
  "eventId": "...",
  "dealId": "...",
  "casoId": "...",
  "datetime": "2026-07-09T14:00:00-03:00",
  "reminders": {
    "24h": "2026-07-08T17:00:00.000Z",
    "1h": "2026-07-09T16:00:00.000Z"
  }
}
```

Ao criar ou reagendar, o Make cancela pendencias antigas do mesmo `eventId` e
cria novos registros:

```text
{{eventId}}:24h
{{eventId}}:hoje
{{eventId}}:1h
```

Registro minimo:

```json
{
  "eventId": "...",
  "phone": "55...",
  "name": "Nome",
  "dealId": "...",
  "casoId": "...",
  "datetime": "...",
  "tipo": "24h",
  "scheduledFor": "...",
  "status": "pending"
}
```

## Cenario 2 - disparo recorrente

Gatilho:

```text
Scheduler - a cada 5 minutos
```

Busca no Data Store:

```text
status == pending
scheduledFor <= now
```

Para cada registro:

```http
POST /lembrete
{
  "phone": "{{phone}}",
  "name": "{{name}}",
  "eventId": "{{eventId}}",
  "dealId": "{{dealId}}",
  "casoId": "{{casoId}}",
  "datetime": "{{datetime}}",
  "tipo": "{{tipo}}",
  "scheduledFor": "{{scheduledFor}}"
}
```

Resultados:

```text
2xx                         -> sent
409 lembrete_antecipado     -> manter pending
409 consulta_passada        -> skipped
409 evento cancelado        -> skipped
404 usuario/evento ausente  -> skipped
5xx ou erro de rede         -> manter pending
```

O retry e seguro porque `/lembrete` usa idempotencia duravel. `processing`
abandonado por reinicio do Node e recuperado por TTL
`CALLBACK_IDEMPOTENCY_PROCESSING_TTL_MS` antes de bloquear nova tentativa.

## Cenario 3 - ciclo de vida e limpeza

Cancelamento ou evento excluido:

```text
marcar {{eventId}}:* pending como cancelled
POST /evento-cancelado
```

Reagendamento:

```text
marcar {{eventId}}:* pending como cancelled
POST /consulta-lembrete-dados
criar novos pending com scheduledFor atualizado
```

Consulta concluida:

```text
marcar {{eventId}}:* pending como skipped
POST /pos-consulta
```

## Contrato do template

`/lembrete` nao envia texto livre. Ele chama `template-service` com
`requireContextoConversa: true`.

Se o usuario nao for localizado ou o contexto nao puder ser persistido, o
template nao e enviado. Se o envio Meta falhar, o contexto anterior e restaurado
e a chave de idempotencia e liberada para retry.

## Fluxograma final

```text
Bot agenda consulta
  |
  v
Google Calendar cria/atualiza evento
  |
  v
Make Watch Events
  |
  +-- cancelado/excluido -> Data Store cancelled -> POST /evento-cancelado
  |
  +-- reagendado --------> Data Store cancelled antigos
  |                         POST /consulta-lembrete-dados
  |                         cria pending novos
  |
  +-- novo evento -------> POST /consulta-lembrete-dados
                            cria pending 24h/hoje/1h
                              |
                              v
Scheduler recorrente
  |
  v
Data Store busca pending vencido
  |
  v
POST /lembrete
  |
  +-- usuario/contexto ausente -> sem envio -> skipped
  |
  +-- evento cancelado/passado -> sem envio -> skipped
  |
  +-- Meta/template falha -----> idempotencia liberada -> pending/retry
  |
  +-- sucesso -----------------> contexto ativo + template enviado -> sent
```

## Validacao

| Caso | Resultado esperado |
| --- | --- |
| Agendamento normal | cria `pending` e Scheduler envia no horario, depois `sent` |
| Reagendamento | cancela pendencias antigas e cria novos `pending` |
| Cancelamento | marca pendencias como `cancelled` e chama `/evento-cancelado` |
| Evento excluido | mesmo caminho de cancelamento |
| Retry | `5xx`/rede deixa `pending`; proximo ciclo reprocessa |
| Reinicio do Node | `processing` antigo e recuperado por TTL e pode reenviar |
| Reinicio do Make | Data Store preserva `pending`; Scheduler volta a buscar |
| Queda de rede | registro permanece `pending`; idempotencia do bot evita duplicidade |
