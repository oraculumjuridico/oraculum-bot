# Requisitos — WhatsApp Admin completo

## Escopo e segurança

- O administrador autenticado inicia, consulta e complementa atendimentos pelo WhatsApp sem acessar casos reais durante os testes.
- Texto e áudio alimentam a mesma extração estruturada; dados inferidos nunca são tratados como confirmados.
- CPF possui estados explícitos: não informado, formato inválido, válido não conferido e conferido com documento. O valor persistível é sempre canônico (11 dígitos).
- CPF inválido bloqueia a criação. Remoção/ausência é ação explícita e nunca resulta de falha de validação.
- Idade informada não gera data de nascimento estimada.
- Telefone do cliente identifica o contato; o número do administrador é somente autoria/auditoria.
- Uma única confirmação canônica governa texto e interações. Nenhuma integração escreve antes dela.
- Contato, negócio e pasta devem ser confirmados pelo contrato de sucesso; falha parcial é visível e recuperável.
- Documentos aceitos: PDF, JPEG e PNG, com limite de tamanho, nome sanitizado, hash, deduplicação e revisão de titularidade antes da promoção ao Drive.
- Logs não contêm CPF, telefone, relato ou conteúdo documental em claro.
- Não fazem parte desta entrega: templates Meta, reengajamento, ações reais, canário, deploy, merge, push ou commit.

## Fluxos

1. Atendimento assistido: relato → extração → perguntas faltantes → revisão → edição → confirmação → criação.
2. Consulta/complementação: selecionar caso → mostrar pendências → editar somente campos escolhidos → confirmar mudanças.
3. Documentos: selecionar caso → receber mídia → validar → classificar → conferir titularidade → promover → confirmar ID.
4. Agenda e pós-humano permanecem acessíveis pelo menu e preservam contratos existentes.

## Critérios de aceite

- Nenhum CPF matematicamente inválido alcança o executor.
- `529.982.247-25` e `52998224725` resultam em `52998224725`.
- Uma resposta já registrada não é perguntada novamente.
- Toda tela oferece contexto/progresso e rotas claras de retorno/cancelamento.
- Suíte completa e verificação sintática passam sem chamadas externas reais.

A verificação individual está registrada em [acceptance-matrix.md](./acceptance-matrix.md). Nenhum atalho de menu é considerado implementado sem handler e teste correspondentes.
