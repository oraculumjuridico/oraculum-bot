# Make - planejamento de reengajamentos

## Objetivo

Definir o cenario Make responsavel pelo planejamento operacional dos
reengajamentos do Oraculum.

O Make e responsavel apenas por:

- descobrir candidatos;
- chamar o bot para planejar jobs;
- gravar e substituir registros no Data Store.

O Make de planejamento nunca deve:

- enviar mensagens;
- chamar Meta;
- chamar WhatsApp;
- chamar Template Service diretamente;
- atualizar HubSpot;
- alterar contato;
- alterar negocio;
- criar scheduler dentro do bot.

O envio real pertence a outro cenario, que consome `reengagement_jobs` e chama
`POST /reengajamento` somente no horario planejado.

## Referencia operacional

Este fluxo segue a mesma separacao usada nos lembretes de consulta:

```text
planejamento -> Data Store -> disparo recorrente
```

No reengajamento, o cenario desta pagina cobre apenas a primeira parte:

```text
planejamento -> Data Store
```

Endpoints envolvidos:

```http
POST /reengagement-candidates
POST /reengajamento-dados
POST /reengajamento
```

Nesta documentacao, `/reengagement-candidates` descobre candidatos potenciais
e `/reengajamento-dados` planeja jobs para cada candidato.

## Seguranca HTTP

Os endpoints de reengajamento usam a protecao interna do bot
`validarWebhookInterno`.

Variaveis obrigatorias do cenario de planejamento:

```text
ORACULUM_BASE_URL
INTERNAL_WEBHOOK_SECRET
```

`REENGAGEMENT_CANDIDATES` nao e mais dependencia obrigatoria. Ela permanece
apenas como legado/opcional para operacoes ainda nao migradas e nao deve ser
usada pelo blueprint oficial de planejamento.

Header canonico para os blueprints Make:

```http
x-internal-secret: {{INTERNAL_WEBHOOK_SECRET}}
```

O middleware interno tambem aceita `x-oraculum-secret` e
`Authorization: Bearer {{INTERNAL_WEBHOOK_SECRET}}` por compatibilidade, mas os
blueprints de reengajamento devem usar somente `x-internal-secret` para manter o
mesmo contrato dos blueprints de consulta.

Endpoints protegidos neste fluxo:

```http
POST /reengagement-candidates
POST /reengajamento-dados
POST /reengajamento
```

## Data Store

Nome:

```text
reengagement_jobs
```

Estrutura minima de cada registro:

```json
{
  "id": "...",
  "phone": "...",
  "dealId": "...",
  "contactId": "...",
  "numeroCaso": "...",
  "tipoEvento": "...",
  "template": "...",
  "scheduledFor": "...",
  "prioridade": 0,
  "status": "pending"
}
```

Estados permitidos:

```text
pending
sent
skipped
cancelled
```

Campos recomendados para operacao e auditoria no Make:

```json
{
  "dedupeKey": "{{phone}}:{{tipoEvento}}:{{scheduledFor}}",
  "plannedAt": "{{now}}",
  "source": "reengagement-planning",
  "lastCheckedAt": "{{now}}"
}
```

Esses campos sao auxiliares do Make. O contrato minimo do Data Store permanece
o bloco anterior.

## Cenario 1 - planejamento

Gatilho:

```text
Scheduler - a cada 30 minutos
```

Fluxo:

```text
Scheduler
  -> HTTP POST /reengagement-candidates
  -> iterar candidates[]
  -> HTTP POST /reengajamento-dados
  -> recebe jobs
  -> cancela jobs antigos equivalentes
  -> cria novos registros pending
```

### Descoberta de candidatos

O Make deve usar o endpoint interno do bot como fonte oficial de descoberta:

```http
POST /reengagement-candidates
Content-Type: application/json
x-internal-secret: {{INTERNAL_WEBHOOK_SECRET}}

{}
```

Resposta:

```json
{
  "candidates": [
    {
      "phone": "5599999999999",
      "dealId": "12345",
      "contactId": "67890",
      "numeroCaso": "PREV.260701.001",
      "source": "memory",
      "candidateReasons": ["possui_numero_caso", "possui_deal"]
    }
  ]
}
```

O endpoint apenas descobre candidatos possiveis usando informacoes ja
disponiveis no bot, com prioridade para sessoes em memoria e depois estado
persistido existente. Ele nao calcula elegibilidade, nao chama HubSpot, nao
envia mensagens e nao cria jobs.

`REENGAGEMENT_CANDIDATES` fica como mecanismo legado/opcional para ambientes que
ainda nao migraram o cenario Make. A substituicao operacional oficial e:

```text
REENGAGEMENT_CANDIDATES manual -> POST /reengagement-candidates
```

No blueprint oficial atualizado, a variavel manual nao e lida.

Cada candidato deve fornecer ao menos um destes identificadores:

```json
{
  "phone": "5599999999999"
}
```

ou:

```json
{
  "dealId": "12345"
}
```

O Make nao deve inferir regras de elegibilidade. Ele apenas chama o bot e usa
os jobs retornados.

### Chamada HTTP

Para candidato por telefone:

```http
POST /reengajamento-dados
Content-Type: application/json
x-internal-secret: {{INTERNAL_WEBHOOK_SECRET}}

{
  "phone": "{{phone}}"
}
```

Para candidato por negocio:

```http
POST /reengajamento-dados
Content-Type: application/json
x-internal-secret: {{INTERNAL_WEBHOOK_SECRET}}

{
  "dealId": "{{dealId}}"
}
```

## Contrato esperado

Resposta esperada de `POST /reengajamento-dados`:

```json
{
  "phone": "5599999999999",
  "dealId": "...",
  "contactId": "...",
  "numeroCaso": "...",
  "jobs": [
    {
      "id": "...",
      "tipoEvento": "abandono_24h",
      "template": "retomada_atendimento",
      "scheduledFor": "...",
      "prioridade": 60
    }
  ]
}
```

Quando nao houver elegibilidade, a resposta deve conter `jobs: []`:

```json
{
  "phone": "5599999999999",
  "dealId": "...",
  "contactId": "...",
  "numeroCaso": "...",
  "jobs": []
}
```

Erros esperados:

```text
400 - phone ou dealId ausente/invalido
404 - usuario nao encontrado
500 - falha interna
```

Em `400`, `404` ou `500`, o Make nao deve criar novos registros `pending`.

## Chave de deduplicacao

Chave operacional do Data Store:

```text
{{phone}}:{{tipoEvento}}:{{scheduledFor}}
```

Exemplo:

```text
5599999999999:abandono_24h:2026-07-09T12:00:00.000Z
```

Observacao:

- `job.id` vem do bot e deve ser preservado no campo `id`.
- A chave do Data Store usa `scheduledFor` para permitir novo planejamento
  quando o horario mudar.

## Criacao dos registros

Para cada item em `jobs`, o Make cria um registro em `reengagement_jobs`:

```json
{
  "id": "{{job.id}}",
  "phone": "{{response.phone}}",
  "dealId": "{{response.dealId}}",
  "contactId": "{{response.contactId}}",
  "numeroCaso": "{{response.numeroCaso}}",
  "tipoEvento": "{{job.tipoEvento}}",
  "template": "{{job.template}}",
  "scheduledFor": "{{job.scheduledFor}}",
  "prioridade": "{{job.prioridade}}",
  "status": "pending"
}
```

Filtro antes de criar:

```text
job.scheduledFor existe
status desejado == pending
```

Opcionalmente, o Make pode ignorar jobs com `scheduledFor` muito antigo para
evitar fila operacional atrasada. Essa tolerancia deve ser configurada no Make,
nao no bot.

## Reagendamento

Sempre que o planejamento rodar para um mesmo candidato, o Make deve substituir
os pendentes equivalentes.

Procedimento:

```text
1. Buscar registros em reengagement_jobs com:
   phone == response.phone
   status == pending
   tipoEvento presente nos jobs retornados ou em criterios monitorados

2. Remover ou marcar como cancelled os pending antigos equivalentes.

3. Criar novos pending usando a chave:
   {{phone}}:{{tipoEvento}}:{{scheduledFor}}
```

Equivalencia recomendada:

```text
mesmo phone
mesmo tipoEvento
status == pending
```

Se o `scheduledFor` mudou, o registro anterior deixa de representar o plano
atual e deve ser removido/cancelado antes da criacao do novo.

## Cancelamento

O planejamento nao precisa cancelar por chamada ao bot. Ele apenas mantem o
Data Store coerente.

Marcar ou remover `pending` antigos quando:

- usuario responder;
- caso for encerrado;
- negocio mudar de estagio;
- novo planejamento nao retornar mais aquele evento;
- o endpoint de disparo `POST /reengajamento` retornar `skipped`.

O endpoint de disparo revalida a elegibilidade no momento do envio. Portanto,
se a situacao mudou entre planejamento e disparo, ele retornara `skipped` e o
Make deve atualizar o registro:

```text
status = skipped
lastCheckedAt = now
skipReason = response.reason
```

O endpoint tambem compara o `scheduledFor` recebido pelo Make com o
`scheduledFor` replanejado pelo bot para o mesmo `jobId` e `tipoEvento`.

Tolerancia aceita:

```text
REENGAGEMENT_SCHEDULE_TOLERANCE_MS = 300000
```

Se a diferenca absoluta for maior que 5 minutos, o bot nao envia template, nao
inicia idempotencia e retorna:

```json
{
  "status": "skipped",
  "reason": "scheduledFor_divergente"
}
```

O endpoint tambem expira jobs muito antigos. Mesmo que o `scheduledFor` recebido
seja igual ao replanejado, o bot nao envia templates quando o horario planejado
ficou mais de 24 horas atrasado.

Limite operacional:

```text
REENGAGEMENT_MAX_DELAY_HOURS = 24
```

Resposta esperada:

```json
{
  "status": "skipped",
  "reason": "job_expirado"
}
```

Esse retorno acontece antes da idempotencia e antes de qualquer envio de
template. O Make deve marcar o registro como `skipped` e preservar
`skipReason = job_expirado`.

### Cancelamento automatico por resposta do usuario

Quando o usuario envia uma nova mensagem, o bot pode notificar um webhook Make
externo configurado em `REENGAGEMENT_CANCEL_WEBHOOK_URL`.

Se a variavel nao estiver configurada, o bot ignora o cancelamento automatico
sem erro operacional.

Payload enviado pelo bot:

```json
{
  "phone": "5599999999999",
  "dealId": "...",
  "contactId": "...",
  "numeroCaso": "...",
  "reason": "user_replied",
  "receivedAt": "2026-07-09T12:00:00.000Z"
}
```

O cenario Make responsavel por esse webhook deve localizar registros em
`reengagement_jobs` com:

```text
phone == payload.phone
status == pending
```

Quando `dealId` estiver presente, recomenda-se restringir tambem por:

```text
dealId == payload.dealId
```

Update minimo recomendado:

```json
{
  "status": "cancelled",
  "cancelledAt": "{{now}}",
  "cancelReason": "user_replied",
  "lastCheckedAt": "{{now}}"
}
```

Esse cancelamento nao envia mensagem, nao chama Meta, nao altera HubSpot e nao
executa Template Service. Falhas do webhook devem ser tratadas apenas como log
operacional; o atendimento do usuario deve continuar normalmente.

## Criterios planejaveis

Os criterios abaixo sao calculados pelo bot. O Make nao deve duplicar essas
regras; deve apenas armazenar os jobs retornados.

```text
abandono_2h
abandono_24h
abandono_7d
descricao_pendente
documentos_pendentes
agendamento_nao_concluido
no_show_consulta
```

Resumo operacional:

| Tipo evento | Intencao operacional | Template esperado |
| --- | --- | --- |
| `abandono_2h` | Lead sem continuidade apos 2h | `retomada_atendimento` |
| `abandono_24h` | Lead sem continuidade apos 24h | `retomada_atendimento` |
| `abandono_7d` | Lead incompleto frio apos 7 dias | `retomada_atendimento` |
| `descricao_pendente` | Relato juridico ainda ausente | `retomada_atendimento` |
| `documentos_pendentes` | Caso com documentos ausentes/parciais | `caso_atualizacao` |
| `agendamento_nao_concluido` | Fluxo de consulta iniciado sem confirmacao | `retomada_atendimento` |
| `no_show_consulta` | Cliente nao compareceu a consulta | `caso_atualizacao` |

## Regras de seguranca operacional

O cenario de planejamento deve obedecer:

- nao chamar `POST /reengajamento`;
- nao enviar mensagem;
- nao chamar Meta;
- nao chamar WhatsApp;
- nao chamar HubSpot para atualizar dados;
- nao alterar contato;
- nao alterar negocio;
- nao recriar regra de elegibilidade no Make;
- nao gravar registros fora de `reengagement_jobs`.

## Fluxograma completo

```text
Scheduler Make - a cada 30 minutos
  |
  v
Descobrir candidatos
POST /reengagement-candidates
  |
  +-- sem phone/dealId -----------------------> ignorar candidato
  |
  v
Para cada candidato
  |
  v
POST /reengajamento-dados
  |
  +-- 400/404/500 ----------------------------> nao criar pending
  |
  v
Resposta com phone/dealId/contactId/numeroCaso/jobs
  |
  +-- jobs vazio -----------------------------> cancelar/remover pending antigos equivalentes
  |
  v
Iterator jobs
  |
  v
Gerar chave Data Store
{{phone}}:{{tipoEvento}}:{{scheduledFor}}
  |
  v
Buscar pending equivalentes
mesmo phone + mesmo tipoEvento
  |
  v
Cancelar/remover pending antigos
  |
  v
Criar novo registro pending
  |
  v
Fim do planejamento

Disparo em outro cenario
  |
  v
Busca reengagement_jobs pending vencidos
  |
  v
POST /reengajamento
  |
  +-- sent ------------------------------------> Data Store sent
  |
  +-- skipped ---------------------------------> Data Store skipped
  |
  +-- erro/rede/5xx ---------------------------> manter pending para retry
```

## Validacao operacional

| Caso | Resultado esperado |
| --- | --- |
| Candidato elegivel | cria um ou mais `pending` em `reengagement_jobs` |
| Candidato sem elegibilidade | nao cria novos jobs e remove/cancela pendentes equivalentes |
| Replanejamento com novo horario | remove/cancela pending antigo e cria novo pending |
| Mesmo job retornado novamente | chave dedup impede duplicidade |
| Usuario responde antes do envio | disparo posterior retorna `skipped`; Data Store vira `skipped` |
| Caso encerrado antes do envio | disparo posterior retorna `skipped`; Data Store vira `skipped` |
| Negocio muda de estagio antes do envio | disparo posterior retorna `skipped`; Data Store vira `skipped` |
| Falha de rede no planejamento | nao criar registro parcial |
| Falha de rede no disparo | manter `pending` para retry no cenario de disparo |
