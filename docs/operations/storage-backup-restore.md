# Storage operacional

Produção usa PostgreSQL externo gratuito como fonte persistente e `/tmp/oraculum` como cache efêmero. Persistent Disk do Render não deve ser criado. Consulte `free-external-persistence.md` para configuração, migração e limites.

## Backup

O plano Neon Free oferece janela curta de restore, não backup diário com SLA. Fazer exportação lógica periódica das tabelas `oraculum_state_documents` e `oraculum_state_migrations` para destino criptografado e fora do Render/Neon. Nunca registrar o conteúdo dos documentos em logs.

Antes de deploy relevante:

1. verificar `/health-interno` (`database=ok`, `pendingWrites=0`);
2. exportar as duas tabelas com `pg_dump` usando conexão segura;
3. criptografar o dump e registrar SHA-256;
4. executar a suíte completa;
5. implantar uma única instância gravadora.

O utilitário `scripts/storage-snapshot.js` permanece válido para snapshots locais de desenvolvimento e para materializar uma exportação restaurada, mas o cache do Render não é backup.

## Restore

1. parar o serviço;
2. restaurar o dump PostgreSQL em banco vazio ou branch temporária;
3. conferir checksums em `oraculum_state_documents`;
4. configurar a URL restaurada;
5. iniciar o bot e confirmar `restoredFiles`, inbox, sessões e idempotência;
6. liberar tráfego somente após teste sem duplicação de webhook.

Um restore deve ser ensaiado antes do Go Live e trimestralmente. O plano gratuito não oferece SLA, PITR longo nem backup diário garantido.
