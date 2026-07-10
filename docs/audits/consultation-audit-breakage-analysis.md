# Consultation — análise da quebra da auditoria operacional

## Resumo

A quebra ocorre em `scripts/audit-consulta-phase1.js`, na montagem de `escopo.dealsNoStageLegado`.

O código comparava `deal.properties.dealstage` com `STAGE_CONSULTA`, identificador que não era declarado nem importado. A execução chegava ao fim das verificações e então lançava `ReferenceError`, descartando o relatório completo.

A correção segura é usar uma constante local e explicitamente histórica:

```text
LEGACY_CONSULTA_STAGE = "1343040832"
```

Esse é o ID do antigo stage HubSpot “Consulta”, anteriormente representado por `HS_STAGE.AGENDAMENTO`.

## 1. Localização das referências

### Referência inválida

- `scripts/audit-consulta-phase1.js`: uso de `STAGE_CONSULTA` no contador `dealsNoStageLegado`.

### Constante histórica equivalente

- commit `83a844421dae77fc15ca2c3871d25e4f11e957c7`, de 26/06/2026:
  `HS_STAGE.AGENDAMENTO = "1343040832"` em `server.js`.

### IDs relacionados que não são substitutos

- `appointmentscheduled` é `HS_STAGE.LEAD` no runtime atual;
- `qualifiedtobuy` é Cadastro;
- `presentationscheduled` é Análise.

Usar qualquer um desses IDs para `dealsNoStageLegado` produziria contagem semanticamente incorreta.

## 2. Onde ocorre a quebra

Fluxo:

1. a auditoria carrega Deals, eventos Calendar e sessões;
2. executa as regras de inconsistência;
3. começa a construir o objeto final;
4. avalia `dealsNoStageLegado`;
5. acessa `STAGE_CONSULTA` inexistente;
6. lança `ReferenceError`;
7. `main()` captura o erro e imprime somente o envelope de erro.

Portanto, nenhum relatório operacional completo é entregue, mesmo que toda a coleta externa tenha funcionado.

## 3. Desde quando a constante deixou de existir

O repositório permite delimitar, mas não datar exatamente a introdução do defeito:

- em 26/06/2026, o commit `83a8444` ainda continha `HS_STAGE.AGENDAMENTO` com ID `1343040832`;
- no working tree atual, `HS_STAGE.AGENDAMENTO` foi removido do runtime como parte da arquitetura Calendar-first;
- `scripts/audit-consulta-phase1.js` está sem histórico Git rastreável no estado atual do workspace.

Assim, a conclusão verificável é:

> a referência ficou órfã durante a remoção do stage operacional “Consulta”, depois do estado registrado em 26/06/2026; não há commit do script que permita atribuir data ou alteração exata.

Não é correto afirmar uma data mais precisa com a evidência disponível.

## 4. Substituto correto

O substituto correto não é reintroduzir `HS_STAGE.AGENDAMENTO` no domínio operacional.

A auditoria precisa apenas reconhecer dados legados. Por isso foi adotado:

```text
LEGACY_CONSULTA_STAGE = "1343040832"
```

O ID também foi incluído em `STAGES_CONHECIDOS`. Antes da correção, mesmo sem o `ReferenceError`, a consulta HubSpot não buscava Deals nesse stage; consequentemente, o contador de legado seria incompleto.

Essa solução:

- preserva Calendar como fonte de verdade;
- não devolve efeito operacional ao stage;
- não altera Deals;
- limita o uso do ID ao diagnóstico read-only.

## 5. Relatórios afetados

### Diretamente incompleto

`npm run audit:consulta`:

- não entregava `escopo`;
- não entregava `totais`;
- não entregava `achados`;
- não contabilizava Deals no stage legado.

### Indiretamente afetados

Qualquer processo humano ou CI que consumisse a saída de `audit:consulta` receberia somente erro, incluindo análises de:

- eventos sem metadata;
- múltiplos eventos ativos;
- evento ativo associado a Deal inexistente;
- snapshot ativo sem evento;
- sessão local ativa sem evento;
- sessão ativa ligada a evento não ativo;
- distribuição de eventos por status;
- distribuição de Deals por stage.

Os relatórios jurídicos, replay, self-healing e Event Store não dependem desse script e não eram afetados.

## 6. Risco de dados incorretos

### Antes da correção

Não havia escrita incorreta: a auditoria bloqueia `PATCH`, `PUT` e `DELETE` no cliente HubSpot e não altera Calendar.

Os riscos eram analíticos:

- relatório ausente por exceção;
- falso zero ou subcontagem de Deals no stage legado, caso algum consumidor contornasse a exceção;
- decisões operacionais tomadas sem inventário completo.

### Segundo defeito estabilizado

Os achados eram mantidos em um objeto global. Duas chamadas a `auditar()` no mesmo processo acumulavam resultados anteriores, inflando métricas.

A correção limpa os achados no início de cada auditoria. Isso não altera fontes externas e torna a geração de métricas determinística por execução.

## 7. Correção e cobertura

Foram implementados:

- constante `LEGACY_CONSULTA_STAGE`;
- inclusão do ID legado na busca;
- substituição da referência inválida;
- reset dos achados por execução;
- proteção `require.main === module` para permitir teste sem disparar APIs;
- exports exclusivamente do script de auditoria;
- teste de relatório completo, métricas, idempotência e ausência dos nomes inválidos.

Não foram alterados:

- Event Store;
- replay;
- self-healing;
- facade pública Consultation;
- Calendar;
- dados HubSpot.
