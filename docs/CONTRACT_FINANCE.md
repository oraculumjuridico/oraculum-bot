# Controle financeiro dos contratos administrativos do INSS

## Princípio

O andamento jurídico e o financeiro são independentes. Um Negócio pode estar em `Caso finalizado` e continuar com parcelas contratuais abertas. Nenhuma rotina financeira altera `dealstage` e nenhuma finalização jurídica encerra a cobrança.

## Onde cada informação fica

- **HubSpot (Negócio):** visão operacional atual do acordo, parcelas e saldo.
- **Neon/PostgreSQL:** espelho atual e histórico de alterações/pagamentos.
- **WhatsApp Admin:** consulta, configuração do acordo e registro de pagamentos.
- **Tarefa HubSpot:** lembrete interno do próximo vencimento.
- **Cliente:** não recebe mensagem automática de cobrança.

## Configuração pelo WhatsApp Admin

Abra `Financeiro`, selecione o caso e use `Configurar acordo`. Envie uma linha como:

`total: 6000; parcelas: 12; valor: 500; vencimento: 10/10/2026; gatilho: primeiro pagamento do benefício`

Para registrar uma parcela, use `Registrar pagamento` e informe:

`valor: 500; data: 23/09/2026`

O sistema incrementa as parcelas pagas, reduz o saldo, avança o vencimento e atualiza a tarefa interna.

## Registro diretamente no HubSpot

Na seção financeira do Negócio, marque `Registrar próxima parcela como paga`. O agendador interno processa a marcação em até 15 minutos, registra uma parcela pelo valor configurado, recalcula o acordo, cria a nota interna e desmarca o comando. Essa ação nunca envia mensagem ao cliente.

Alterações manuais nos demais campos aparecem no WhatsApp Admin na próxima abertura do controle daquele caso e são espelhadas no Neon.

## Situações financeiras

- `Não configurado`: nenhum acordo registrado.
- `Aguardando condição do contrato`: cobrança depende de concessão, primeiro pagamento ou outro gatilho.
- `Em dia`: acordo ativo sem vencimento identificado.
- `Parcela vencida`: próximo vencimento anterior à data atual.
- `Renegociado`: acordo substituído por nova composição.
- `Suspenso`: cobrança pausada por decisão administrativa.
- `Quitado`: saldo encerrado.
- `Não se aplica`: caso sem cobrança contratual.

## Segurança operacional

- Nenhum caso existente recebe valor ou dívida automaticamente.
- O pipeline jurídico não é modificado.
- Não há comunicação financeira automática com clientes.
- Cada baixa gera histórico no PostgreSQL e nota interna no Negócio.
- A tarefa de vencimento usa uma chave idempotente por Negócio, evitando duplicação.
