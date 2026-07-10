# Persistência gratuita externa — Bot Oráculum

## Solução escolhida

Neon PostgreSQL Free como fonte persistente; `/tmp/oraculum` no Render Free como cache efêmero. O cache existe apenas para preservar os contratos síncronos atuais. Antes de abrir a porta HTTP, o boot cria/verifica o schema, valida checksums e restaura os arquivos remotos. As gravações continuam atômicas localmente e entram numa fila serial de `UPSERT` no PostgreSQL.

PostgreSQL foi escolhido porque representa documentos JSON/JSONL sem perder conteúdo, oferece transações e permite substituir o adaptador por Oracle mantendo a camada de repositório. Upstash Redis foi descartado como fonte primária por ser chave-valor, ter limite gratuito de comandos e aumentar o acoplamento para a futura migração Oracle. Supabase é compatível com o mesmo adaptador, mas o plano gratuito pode pausar projetos após uma semana de inatividade; Neon escala o compute a zero e volta automaticamente.

## Dados cobertos

- `users-state.json`;
- `webhook-inbox.json`;
- `admin-assisted-sessions.json`;
- `callback-idempotency.json`;
- `consulta-events.jsonl`;
- `consultation-decisions.jsonl`;
- `consultation-integrity-events.jsonl`;
- nomes adicionais em `EXTERNAL_STATE_FILES`.

O banco usa `oraculum_state_documents`, com namespace único, versão, formato, conteúdo, SHA-256 e timestamp. `oraculum_state_migrations` torna a importação repetível e auditável. Não são necessários endpoints novos nem alterações em Make ou HubSpot.

## Configuração Neon e Render Free

1. Criar um projeto Free em <https://console.neon.tech> sem cartão.
2. Copiar a connection string **pooled** com `sslmode=require`.
3. No Render, não criar Disk. Definir:

```text
ORACULUM_DATA_DIR=/tmp/oraculum
EXTERNAL_STATE_PROVIDER=neon
EXTERNAL_STATE_DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
EXTERNAL_STATE_SSL=true
EXTERNAL_STATE_REQUIRED=true
EXTERNAL_STATE_ALLOW_EPHEMERAL_FALLBACK=false
EXTERNAL_STATE_POOL_MAX=2
EXTERNAL_STATE_CONNECT_TIMEOUT_MS=10000
```

4. Manter `EXTERNAL_STATE_REQUIRED=true` em produção. Assim o serviço não aceita webhooks se não conseguir restaurar a fonte persistente.
5. Fazer a migração inicial em máquina segura, com a mesma URL:

```powershell
npm run state:migrate:postgres:dry
npm run state:migrate:postgres
```

`--force` substitui documentos remotos pelos arquivos locais e só deve ser usado com backup e serviço parado:

```powershell
npm run state:migrate:postgres:force
```

6. Após a migração, fazer deploy. Consultar `/health-interno` usando `x-internal-secret` e exigir:

```json
{
  "persistenciaExterna": {
    "provider": "postgres",
    "enabled": true,
    "required": true,
    "database": "ok",
    "pendingWrites": 0,
    "lastError": null
  }
}
```

7. Registrar uma sessão de homologação, reiniciar manualmente o Render e confirmar `restoredFiles > 0`, recuperação da sessão, inbox e idempotência.

## Fallback e falhas

- Produção: fail-closed. Sem PostgreSQL no boot, o servidor não abre a porta.
- Desenvolvimento/teste: sem provider configurado, os contratos antigos continuam usando arquivos locais.
- `EXTERNAL_STATE_ALLOW_EPHEMERAL_FALLBACK=true` permite iniciar sem banco, mas não oferece durabilidade após restart. Não usar em produção.
- Webhook e callbacks aguardam o flush remoto antes de responder sucesso nos pontos críticos.
- SIGTERM/SIGINT drenam a fila antes de encerrar.
- Cada documento tem checksum; conteúdo JSON inválido ou checksum remoto divergente bloqueia a restauração.

## Limites e monitoração do plano gratuito

Limites oficiais consultados em 10/07/2026: 0,5 GB por projeto, 100 CU-hours mensais por projeto, 5 GB de egress, compute até 2 CU, escala a zero após inatividade e janela de restore de até 6 horas/1 GB de mudanças. Não há SLA nem suporte empresarial no Free.

`/health-interno` retorna `databaseBytes` e `freePlanUsagePercent` calculado contra 500 MB. Alertas operacionais recomendados:

- aviso em 60%;
- congelar crescimento de JSONL/arquivar em 80%;
- não aguardar 100%, pois o serviço gratuito pode restringir operações;
- acompanhar CU-hours e egress semanalmente no painel Neon.

Como cada alteração de JSONL atualmente espelha o documento inteiro para preservar o contrato, alto volume aumenta egress e compute. Antes de 60% do limite ou tráfego contínuo, evoluir o adaptador para eventos incrementais sem mudar o domínio.

## Migração futura para Oracle

O domínio não conhece `pg`. Somente `external-state-repository.js` conhece o driver e o SQL. A migração futura consiste em implementar o mesmo contrato (`initialize`, `mirror`, `flush`, `migrate`, `health`, `close`) com `oracledb`, criar tabelas equivalentes com `CLOB`, exportar namespace/conteúdo/checksum e trocar a composição no boot. Os JSON e JSONL permanecem semanticamente idênticos.

## Rollback

1. Parar o serviço.
2. Exportar `oraculum_state_documents`.
3. Restaurar cada `content` no nome indicado por `namespace` dentro de `data/`.
4. Executar `npm run storage:verify` e a suíte completa.
5. Para desenvolvimento somente, remover as variáveis externas. Produção não deve voltar ao filesystem efêmero.
