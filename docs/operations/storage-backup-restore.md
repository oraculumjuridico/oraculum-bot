# Storage operacional

O diretório `data/` precisa estar integralmente em volume persistente. Deploy sem
esse volume não é autorizado.

## Render

Para o runtime Node nativo do Render, anexar um Persistent Disk pago ao web
service com:

- mount path: `/opt/render/project/src/data`
- tamanho inicial: o menor tamanho pago compatível com a operação
- número de instâncias: `1`

O filesystem padrão do Render é efêmero. Somente arquivos abaixo do mount path
sobrevivem a restart e redeploy. Um Persistent Disk só pode ser anexado a uma
instância, o que também impõe a regra de escritor único.

O Render cria snapshots criptografados automaticamente uma vez por dia e os
mantém por pelo menos sete dias. O primeiro snapshot e a opção de restore devem
ser confirmados no Dashboard antes da liberação de tráfego real.

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
3. Confirmar snapshot diário criptografado do Persistent Disk no Render.
4. Manter os snapshots diários do provedor e uma exportação externa semanal.
5. Gerar snapshot adicional antes de cada deploy.
6. Monitorar falhas de escrita, espaço livre e idade do último backup.

## Backup

O snapshot diário gerenciado do Render é a proteção primária. Cron Jobs do Render
não conseguem acessar Persistent Disks, portanto não devem ser usados para copiar
o volume.

Para uma exportação adicional, executar via SSH no próprio web service, com o
tráfego interrompido e `STORAGE_BACKUP_DIR` apontando para um destino externo
montado ou copiado imediatamente para fora da instância:

```bash
npm run storage:backup -- --source /opt/render/project/src/data
```

O comando cria manifesto com tamanho e SHA-256 de cada arquivo. Arquivos
`*.tmp` e `*.lock` não integram o snapshot.

Procedimento seguro:

1. interromper o recebimento de tráfego;
2. encerrar o processo com `SIGTERM` e aguardar sua saída;
3. criar o snapshot e copiá-lo para storage externo criptografado;
4. registrar checksum SHA-256 e horário do snapshot;
5. reiniciar o processo e reabrir o tráfego.

## Restore

Para perda integral do volume, preferir o restore do snapshot pelo Dashboard do
Render. Ele restaura o disco inteiro e descarta alterações posteriores ao ponto
escolhido.

Para restaurar uma exportação criada pelo utilitário:

```bash
npm run storage:verify -- --snapshot /caminho/do/snapshot
npm run storage:restore -- \
  --snapshot /caminho/do/snapshot \
  --target /opt/render/project/src/data \
  --confirm-restore
```

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

## Evidência obrigatória para Go-Live

- tela do serviço mostrando o disco montado no caminho correto;
- snapshot diário disponível;
- serviço configurado com uma instância;
- data, responsável e resultado do último restore;
- checksum do snapshot usado no ensaio;
- contagem de registros pendentes e recibos da inbox antes e depois do restore.
