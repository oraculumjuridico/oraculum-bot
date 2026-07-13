# Teste controlado do Google Calendar

Ferramenta isolada para validar uma agenda institucional usando somente um evento fictício, sem participantes, Meet, lembretes ou dados de clientes.

```powershell
node scripts/calendar-controlled-test.js
node scripts/calendar-controlled-test.js --dry-run
node scripts/calendar-controlled-test.js --preflight
node scripts/calendar-controlled-test.js --apply
node scripts/calendar-controlled-test.js --verify
node scripts/calendar-controlled-test.js --rollback
node scripts/calendar-controlled-test.js --verify-rollback
```

- `--dry-run` é padrão, local, sem credenciais e sem rede.
- `--preflight` é leitura real e exige autorização; valida agenda, timezone, propriedade, cardinalidade e conflito.
- `--apply` cria exatamente um evento e exige `CALENDAR_CONTROLLED_TEST_CONFIRM=APPLY_ONE_FICTITIOUS_EVENT`.
- `--verify` lê somente o ID do manifesto.
- `--rollback` exclui somente o evento validado e exige `CALENDAR_CONTROLLED_TEST_CONFIRM=DELETE_ONLY_MANIFEST_EVENT`.
- `--verify-rollback` confirma por leitura a remoção do mesmo ID.

Os modos reais usam a mesma configuração institucional pura do runtime; `ORACULUM_GOOGLE_CALENDAR_ID` ou `GOOGLE_CALENDAR_ID` podem explicitá-la para a ferramenta. `primary` nunca é aceito e o ID é armazenado apenas como hash. A criação e a exclusão usam sempre `sendUpdates: "none"`.

O manifesto fica no diretório temporário, com escrita atômica e trava exclusiva. A ferramenta não importa servidor, estado, HubSpot ou módulos produtivos de consulta. Agenda compartilhada exige revisão específica. Restauração exige autorização e procedimento separados.
