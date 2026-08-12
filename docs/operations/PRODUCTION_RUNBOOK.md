# Runbook de produção

## Objetivo

Este documento define o caminho único para verificar, publicar, observar e reverter o Oráculum. Nenhum teste operacional deve enviar mensagem a cliente real. Canários externos usam exclusivamente identidades de teste autorizadas.

## 1. Pré-requisitos

- Node.js 20 e npm 10;
- worktree limpa e sincronizada com `origin/main`;
- variáveis preenchidas conforme `.env.example`;
- Neon/PostgreSQL acessível e obrigatório;
- uma única instância do runtime;
- Meta App Secret, tokens e IDs válidos;
- Drive configurado sem permissão pública;
- Calendar, HubSpot e pasta raiz do Drive associados à conta institucional;
- Lightning opcionalmente disponível; falha de TTS não pode interromper o texto.

## 2. Gates locais

```bash
npm ci
npm run docs:catalog
npm test
npm run test:case-analysis
npm run test:internal-scheduler
node test/production-readiness.test.js
node --check server.js
node --check tts.js
git diff --check
```

Testes PostgreSQL reais são executados somente com banco explicitamente autorizado. Scripts `apply`, `resume`, migrações, importação, reconciliação e envio não pertencem ao gate local comum.

## 3. Diagnóstico de configuração

`GET /health-interno`, autenticado por `INTERNAL_WEBHOOK_SECRET`, inclui `configuracao`:

- `ready`: todos os itens obrigatórios estão presentes;
- `blockers`: capacidades obrigatórias ausentes;
- `optionalUnavailable`: transcrição, IA ou TTS não disponíveis;
- `checks`: estado por categoria sem mostrar valores ou segredos.

O diagnóstico valida presença e escopo, não confirma que a credencial ainda é aceita pelo provedor. A confirmação externa é um gate separado.

## 4. Publicação

1. buscar `origin/main`;
2. confirmar que o commit é descendente de `origin/main`;
3. revisar `git diff origin/main...HEAD`;
4. executar os gates;
5. criar commit identificável;
6. fazer push fast-forward para `main`;
7. aguardar o Auto-Deploy;
8. verificar `GET /health` até HTTP 200;
9. verificar `GET /health-interno` sem registrar o segredo;
10. observar erros, inbox e fila antes de qualquer canário.

Nunca usar force push, apagar migrations aplicadas ou alterar variáveis sem registrar o motivo.

## 5. Verificação pós-deploy

Sem enviar mensagens:

- `/health` responde `status=ok`;
- persistência externa responde `database=ok` no health interno;
- `configuracao.ready=true` ou cada bloqueio está conscientemente aceito antes de liberar tráfego;
- inbox não cresce continuamente em `pending`, `processing` ou `error`;
- agendador não fica em execução permanente;
- não aparecem 401/403/429/5xx recorrentes de Meta, HubSpot, Drive ou Calendar;
- memória e número de erros permanecem estáveis.

## 6. Canário autorizado

Quando houver autorização, usar somente o contato de teste definido pelo proprietário. O roteiro mínimo cobre:

1. mensagem dentro da janela de 24 horas;
2. menu com três opções;
3. retomada do mesmo Contact e Deal;
4. correção de nome, telefone e cidade;
5. documento simples e documento que exige revisão;
6. retorno ao menu;
7. consulta/agendamento de teste;
8. Admin consultando o mesmo caso;
9. ausência de negócio, pasta ou arquivo duplicado;
10. áudio com fallback textual disponível.

Todo artefato de canário deve ser removível e marcado como teste.

## 7. Incidentes

### Webhook retorna 401

Verificar assinatura e `APP_SECRET`/`META_APP_SECRET`. Não desativar a validação.

### Webhook retorna 503

Verificar segredo Meta ausente e persistência obrigatória. Não mudar `NODE_ENV` para contornar.

### Inbox cresce

Bloquear novos canários, verificar o primeiro registro em erro, integração causadora e capacidade da persistência. Não apagar a inbox antes de exportar backup.

### HubSpot falha

Preservar o estado local/durável, evitar recriar Contact ou Deal e usar reconciliação após restaurar a credencial.

### Drive falha

Não marcar documento como entregue. Preservar referência da mídia e orientar reenvio somente se o conteúdo não puder ser recuperado.

### Calendar falha

Não confirmar horário sem `eventId`. Registrar pendência humana e reconciliar depois.

### TTS falha

Manter a resposta escrita. O problema de voz não pode bloquear atendimento.

## 8. Backup e rollback

Antes de mudança de alto risco:

```bash
npm run storage:backup
npm run storage:verify
```

Rollback de código usa o último commit saudável por novo commit de reversão. Não usar reset destrutivo em `main`. Restauração de estado exige confirmação explícita e segue `docs/operations/storage-backup-restore.md`.

## 9. Critério de liberação

O bot pode operar em produção quando:

- commit e documentação são reproduzíveis;
- gates locais passam;
- health público e interno estão saudáveis;
- não há bloqueador de configuração;
- arquivos permanecem privados;
- inbox e persistência sobrevivem a reinício;
- automações têm escopo explícito;
- existe rollback conhecido;
- o canário autorizado não cria duplicidade nem mensagem indevida.
