# Teste controlado do HubSpot

Ferramenta isolada para validar um contato fictício, um negócio fictício e sua associação. Nunca use dados de clientes.

```powershell
node scripts/hubspot-controlled-test.js
node scripts/hubspot-controlled-test.js --dry-run
node scripts/hubspot-controlled-test.js --apply
node scripts/hubspot-controlled-test.js --verify
node scripts/hubspot-controlled-test.js --rollback
```

- `--dry-run` é o padrão, funciona localmente, não exige token e não usa rede.
- `--apply` realiza escrita real e exige `HUBSPOT_CONTROLLED_TEST_CONFIRM=APPLY_ONE_FICTITIOUS_CONTACT_DEAL_ASSOCIATION`, além de autorização humana específica.
- `--verify` é somente leitura no HubSpot, valida os IDs e o marcador e registra `status.verify = completed` no manifesto local após o sucesso.
- `--rollback` arquiva somente os dois IDs validados do manifesto e exige `HUBSPOT_CONTROLLED_TEST_CONFIRM=ROLLBACK_ONLY_MANIFEST_OBJECTS`, além de autorização humana específica.

O manifesto fica, por padrão, no diretório temporário do sistema em `oraculum-hubspot-controlled-test/manifest.json`. Ele contém apenas marcador técnico, IDs do teste, hashes, timestamps e status. Um caminho alternativo pode ser definido em `HUBSPOT_CONTROLLED_TEST_MANIFEST`.

O script recusa sobrescrever um manifesto existente e usa uma trava exclusiva por manifesto. Remova manualmente apenas um manifesto de dry-run já revisado ou escolha outro caminho antes de iniciar nova execução. Argumentos desconhecidos e combinações de modos são rejeitados.

Nunca use `scripts/maintenance/reset-hubspot.js` para este procedimento. Antes de `--apply`, confirme que automações capazes de disparar notificações ou tarefas estão desabilitadas. Revise o dry-run e obtenha autorização explícita antes de qualquer escrita ou rollback.
