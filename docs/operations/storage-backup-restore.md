# Storage operacional

O diretório `data/` precisa estar integralmente em volume persistente. Deploy sem
esse volume não é autorizado.

Arquivos que precisam sobreviver a restart, redeploy e troca de instância:

- `data/webhook-inbox.json`
- `data/users-state.json`
- `data/consulta-events.jsonl`
- `data/consultation-decisions.jsonl`
- `data/consultation-integrity-events.jsonl`

## Requisitos mínimos

1. Montar um volume persistente no caminho absoluto `<app>/data`.
2. Executar apenas uma instância gravadora enquanto a persistência usar arquivos
   locais.
3. Gerar snapshot externo, criptografado e diário de todo o diretório.
4. Manter no mínimo 7 snapshots diários e 4 semanais.
5. Gerar snapshot adicional antes de cada deploy.
6. Monitorar falhas de escrita, espaço livre e idade do último backup.

## Backup

O backup deve copiar o diretório inteiro como uma unidade, preservando nomes,
conteúdo e timestamps. Arquivos `*.tmp` e `*.lock` não constituem backup e podem
ser excluídos da cópia somente depois de confirmar que o processo foi parado.

Procedimento seguro:

1. interromper o recebimento de tráfego;
2. encerrar o processo com `SIGTERM` e aguardar sua saída;
3. copiar `data/` para storage externo criptografado;
4. registrar checksum SHA-256 e horário do snapshot;
5. reiniciar o processo e reabrir o tráfego.

## Restore

1. manter a aplicação parada;
2. preservar uma cópia do volume atual;
3. restaurar o snapshot para um diretório vazio;
4. validar os checksums;
5. confirmar que os arquivos JSON são parseáveis e que cada JSONL possui uma
   entrada JSON válida por linha;
6. iniciar uma única instância;
7. verificar replay da Durable Inbox e ausência de mensagens duplicadas;
8. liberar tráfego somente após a verificação.

Um restore completo deve ser ensaiado antes do Go-Live e depois trimestralmente.
Documentação sem volume provisionado e restore comprovado não torna o storage
resiliente.
