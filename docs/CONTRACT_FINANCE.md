# Controle financeiro dos contratos administrativos do INSS

## Princípio

O andamento jurídico e o financeiro são independentes. Um Negócio pode estar em `Caso finalizado` e continuar com parcelas contratuais abertas. Nenhuma rotina financeira altera `dealstage` e nenhuma finalização jurídica encerra a cobrança.

## Onde cada informação fica

- **HubSpot (Pagamentos):** fonte oficial de cada valor efetivamente recebido.
- **HubSpot (Negócio):** resumo do acordo, parcelas previstas, saldo e próximo vencimento.
- **Neon/PostgreSQL:** espelho atual e histórico de alterações/pagamentos.
- **WhatsApp Admin:** consulta, configuração do acordo e registro de pagamentos.
- **Tarefa HubSpot:** lembrete interno do próximo vencimento.
- **Cliente:** não recebe mensagem automática de cobrança.

## Configuração pelo WhatsApp Admin

Abra `Financeiro`, selecione o caso e use `Configurar acordo`. Envie uma linha como:

`total: 6000; parcelas: 12; valor: 500; vencimento: 10/10/2026; gatilho: primeiro pagamento do benefício`

Para registrar uma parcela pelo WhatsApp Admin, use `Registrar pagamento` e informe:

`valor: 500; data: 23/09/2026`

O sistema cria um registro nativo em `Pagamentos`, associa-o ao Negócio e, somente depois dessa confirmação, reduz o saldo, avança o vencimento e atualiza a tarefa interna.

## Registro diretamente no HubSpot

Registre o recebimento no cartão nativo `Pagamentos` do Negócio. O agendador interno consulta pagamentos associados em até 15 minutos e, para cada pagamento concluído ainda não conciliado, recalcula o acordo e cria a nota interna. A abertura da tela financeira no WhatsApp Admin também solicita a conciliação imediata.

Pagamentos anteriores à data `Controlar pagamentos a partir de` não são baixados automaticamente. Isso evita que transações antigas sejam contadas por engano.

Alterações manuais nos campos do acordo aparecem no WhatsApp Admin na próxima abertura do controle daquele caso e são espelhadas no Neon.

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
- Cada baixa exige um Pagamento nativo concluído, gera histórico idempotente no PostgreSQL e nota interna no Negócio.
- O mesmo ID de Pagamento nunca é contabilizado duas vezes.
- Se a credencial do bot não tiver acesso a `commerce_payments`, o acordo continua visível, mas nenhuma baixa é presumida.
- A tarefa de vencimento usa uma chave idempotente por Negócio, evitando duplicação.
