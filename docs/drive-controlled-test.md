# Teste controlado do Google Drive

Ferramenta isolada para validar a integração usando somente uma pasta fictícia e um arquivo de texto fictício. Nunca use dados ou IDs de clientes.

```powershell
node scripts/drive-controlled-test.js
node scripts/drive-controlled-test.js --dry-run
node scripts/drive-controlled-test.js --preflight
node scripts/drive-controlled-test.js --apply
node scripts/drive-controlled-test.js --verify
node scripts/drive-controlled-test.js --rollback
node scripts/drive-controlled-test.js --verify-rollback
```

- `--dry-run` é o padrão, funciona sem credenciais e não inicializa cliente Google nem usa rede.
- `--preflight` faz leitura real mínima da raiz e exige autorização prévia. Aborta em Shared Drive.
- `--apply` cria exatamente uma pasta e um arquivo e exige `DRIVE_CONTROLLED_TEST_CONFIRM=APPLY_ONE_FICTITIOUS_FOLDER_AND_FILE` e autorização específica.
- `--verify` usa apenas leituras dos IDs do manifesto e atualiza somente o manifesto local após sucesso.
- `--rollback` envia somente os dois IDs validados à lixeira e exige `DRIVE_CONTROLLED_TEST_CONFIRM=TRASH_ONLY_MANIFEST_FOLDER_AND_FILE` e autorização específica.
- `--verify-rollback` apenas confirma que os dois IDs do manifesto estão na lixeira.

O manifesto fica no diretório temporário do sistema, contém somente marcador técnico, hashes, IDs criados, timestamps e estados, e é protegido por escrita atômica e trava exclusiva. A ferramenta não importa o servidor, estado de usuários, HubSpot ou funções operacionais do Drive.

Exclusão definitiva, compartilhamento, alteração de permissões, movimentação, operações em lote e restauração não são suportados. Uma restauração real exige autorização separada, revalidação dos mesmos IDs e confirmação dos pais esperados. Nunca execute contra uma raiz não validada; Shared Drive exige revisão específica.
