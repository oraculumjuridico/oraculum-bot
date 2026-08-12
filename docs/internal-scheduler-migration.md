# Agendador interno do Oráculum

## Objetivo

Substituir os cinco cenários ativos do Make.com por uma fila controlada pelo
próprio Oráculum e persistida no PostgreSQL/Neon.

Os blueprints da pasta Make.com permanecem intactos como referência e fallback.
Eles só devem ser removidos depois da validação do agendador em produção.

## O que foi absorvido

- planejamento dos lembretes de consulta de 24 horas, do dia e de 1 hora;
- disparo dos lembretes vencidos;
- encerramento e limpeza do ciclo de vida da consulta;
- planejamento dos reengajamentos;
- disparo dos reengajamentos vencidos;
- deduplicação, tentativas, lease concorrente, histórico e resultado no Neon.

## Operação

O serviço cria automaticamente a tabela oraculum_scheduled_jobs.

Variáveis:

- INTERNAL_SCHEDULER_ENABLED=true
- INTERNAL_SCHEDULER_INTERVAL_MS=300000
- INTERNAL_SCHEDULER_BATCH_SIZE=25
- CONSULTA_LEMBRETE_HOJE_HORA=9
- INTERNAL_WEBHOOK_SECRET já usado pelas rotas internas
- DATABASE_URL ou EXTERNAL_STATE_DATABASE_URL já usado pelo Neon

Enquanto o Render estiver acordado, o próprio processo verifica a fila a cada
cinco minutos. Para acordar o Render gratuito, instale o disparador em
docs/google-apps-script-agendador.gs.

Endpoint do disparador: POST /internal/processar-agendamentos

Monitoramento: GET /internal/agendador-status

Ambos exigem x-internal-secret.

## Migração segura

1. publicar o código com INTERNAL_SCHEDULER_ENABLED=false;
2. instalar o Google Apps Script;
3. ativar INTERNAL_SCHEDULER_ENABLED=true;
4. confirmar planejamento e processamento no endpoint de status;
5. manter os cenários do Make desligados para evitar dois disparadores;
6. preservar os blueprints até a validação completa em produção.
