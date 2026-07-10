# Relatório de persistência gratuita e Go Live — 10/07/2026

## Parecer

**GO LIVE NÃO APROVADO neste ambiente.** Toda implementação local foi concluída e testada. Falta exclusivamente criar o projeto Neon Free, fornecer a connection string, executar a migração real e comprovar recovery após restart no Render. Persistent Disk pago não integra mais a arquitetura.

## Solução

- fonte persistente: Neon PostgreSQL Free;
- cache compatível: `/tmp/oraculum` no Render Free;
- driver: `pg`, pool máximo padrão 2;
- boot remote-first e fail-closed em produção;
- write-through serializado, checksums SHA-256 e flush nos webhooks/callbacks;
- duas tabelas: documentos versionados e histórico de migrações;
- health público retorna 503 se a persistência obrigatória falhar;
- health interno mede conexão, fila, restauração, bytes e percentual de 500 MB;
- SIGTERM/SIGINT drenam a fila;
- adaptador isolado para futura substituição por Oracle/CLOB.

## Arquivos desta implementação

- `src/infrastructure/external-state-repository.js`;
- `scripts/migrate-state-to-postgres.js`;
- `test/external-state-repository.test.js`;
- `src/domain/state-persistence.js`;
- `src/domain/callback-idempotency.js`;
- `src/domain/consultation-events.js`;
- `src/domain/consultation/consultation-decision-audit.js`;
- `src/domain/consultation/integrity/consultation-integrity-event-store.js`;
- `src/domain/consultation/consultation-manifest.json`;
- `server.js`, `.env.example`, `package.json`, `package-lock.json`;
- documentação em `docs/operations` e checklists de piloto/release.

## Migração

Dry-run executado: 3 arquivos, 86.559 bytes, checksums válidos; 77.345 bytes de inbox, 9.212 bytes de sessões administrativas e 2 bytes de users. A tentativa real retornou `persistencia PostgreSQL nao configurada`, comprovando ausência de credencial sem expô-la. Nenhum dado foi enviado externamente.

Com URL configurada:

```powershell
npm run state:migrate:postgres:dry
npm run state:migrate:postgres
```

A migração é idempotente; `--force` é operação explícita de substituição e não ocorre no boot.

## Testes

- suíte completa: **114/114**, 145,6 s;
- teste de repositório: schema, restore, checksum, mirror, migração idempotente, health, limite e fail-closed;
- callback idempotency, Durable Inbox, sessões administrativas, backup/restore e consulta: passaram;
- hard-lock e release check do domínio: passaram (30 arquivos de integridade, 147 de arquitetura);
- `node --check`: 110 arquivos, 0 falhas;
- npm audit: 0 vulnerabilidades após instalação do `pg`.

## Configuração externa restante

1. Criar Neon Free e copiar URL pooled SSL.
2. Configurar variáveis de `docs/operations/free-external-persistence.md` no Render.
3. Executar migração com o serviço parado.
4. Fazer deploy sem Disk.
5. Verificar `/health` 200 e `/health-interno`: `database=ok`, `pendingWrites=0`, `lastError=null`.
6. Criar estado de homologação, reiniciar e comprovar `restoredFiles > 0`, sessão, inbox e callback preservados.

## Riscos remanescentes

- plano gratuito sem SLA e com janela curta de restore;
- 0,5 GB, 100 CU-hours/mês/projeto e 5 GB de egress exigem monitoração;
- espelho integral de JSONL aumenta egress em alto volume;
- uma única instância gravadora continua sendo a configuração suportada; concorrência multi-instância exigirá operações SQL granulares/leases;
- dados jurídicos demandam política de acesso, backup criptografado e avaliação de privacidade do fornecedor;
- runtime local Node 24, enquanto produção declara Node 20; repetir suíte no build Render.
