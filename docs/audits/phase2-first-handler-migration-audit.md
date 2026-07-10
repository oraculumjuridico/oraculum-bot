# Auditoria da primeira migração de handler da Fase 2

## Escopo

Esta auditoria cobre exclusivamente a ação atômica:

```text
revalidate_name_confirm
```

Não propõe alterações nos demais caminhos de revalidação de nome, no
decision-router ou na UX.

## 1. Localização da lógica atual

### Geração da decisão

O action é declarado em:

- `src/domain/client/client-post-intake-decision-router.js`
- constante `ATOMIC_ACTIONS.REVALIDATE_NAME_CONFIRM`
- valor exato: `"revalidate_name_confirm"`

Ele é produzido por `routeRevalidation("NAME", source, text)` quando:

- a rota anterior é `ROUTES.NAME`;
- o modo é `revalidation`;
- a origem não é áudio;
- o texto é exatamente `revalida_nome_ok`.

### Execução

A execução permanece inline em `processarInterno`, aproximadamente nas linhas
10492–10497 de `server.js`:

```js
if (clientPostIntakeAction === CLIENT_POST_INTAKE_ACTIONS.REVALIDATE_NAME) {
  if (text === "revalida_nome_ok") {
    if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
    u._revalidaConfirmados.push("nome")
    return await proximaConfirmacaoProgressiva(from, u)
  }
  // outros caminhos macro de REVALIDATE_NAME
}
```

Há uma particularidade de transição: `server.js` atualmente descarta o action
atômico e conserva apenas `legacyAction`:

```js
const { legacyAction: clientPostIntakeAction } =
  routeClientPostIntake(...)
```

Para a migração híbrida, o servidor precisará preservar também `nextAction`,
sem mudar a geração ou o conteúdo da decisão.

## 2. Dependências utilizadas

O bloco possui somente quatro dependências:

| Dependência | Uso |
|---|---|
| `u` | leitura e mutação de `_revalidaConfirmados` |
| `from` | argumento de continuidade |
| `proximaConfirmacaoProgressiva` | executa a próxima confirmação |
| `nextAction` | guarda de aplicabilidade do novo handler |

O handler não precisa receber `text`, stage, timers, WhatsApp, HubSpot, áudio ou
normalizadores. Reavaliar `text` ou stage dentro dele duplicaria decisão já
formalizada no router.

## 3. Side effects

O caminho executa:

1. possível criação de `u._revalidaConfirmados = []`;
2. inclusão de `"nome"` no array;
3. chamada assíncrona a `proximaConfirmacaoProgressiva(from, u)`.

`proximaConfirmacaoProgressiva` pode, conforme o próximo campo:

- enviar áudio;
- iniciar timer;
- alterar stage;
- devolver a próxima tela;
- avançar para a confirmação seguinte.

Esses efeitos são dependências transitivas e devem continuar sendo executados
pela mesma função existente.

## 4. Primeiro side effect

O primeiro efeito observável é:

- a atribuição de `u._revalidaConfirmados = []`, quando o valor ainda não é
  array; ou
- `u._revalidaConfirmados.push("nome")`, quando o array já existe.

Toda validação de aplicabilidade do handler deve ocorrer antes dessa linha.

Depois desse ponto, erros de `proximaConfirmacaoProgressiva` devem ser
propagados. Eles não podem ser convertidos em `{ success: false }`.

## 5. Implementação 1:1 recomendada

Arquivo:

```text
src/domain/client/handlers/revalidate_name_confirm.handler.js
```

Contrato recomendado:

```js
async function handle({
  decision,
  u,
  from,
  proximaConfirmacaoProgressiva
}) {
  if (decision?.nextAction !== "revalidate_name_confirm") {
    return { success: false, response: null }
  }

  if (!Array.isArray(u._revalidaConfirmados)) {
    u._revalidaConfirmados = []
  }
  u._revalidaConfirmados.push("nome")

  return {
    success: true,
    response: await proximaConfirmacaoProgressiva(from, u)
  }
}

module.exports = { handle }
```

Características obrigatórias:

- a guarda usa somente `decision.nextAction`;
- a recusa ocorre antes de qualquer acesso mutável;
- o corpo copia a ordem atual das operações;
- não há `try/catch` em torno da execução após a mutação;
- a resposta de `proximaConfirmacaoProgressiva` é preservada sem transformação.

## 6. Preservação do fallback híbrido

Integração recomendada em `server.js`:

```js
const clientPostIntakeDecision = routeClientPostIntake(...)
const clientPostIntakeAction = clientPostIntakeDecision.legacyAction

const resultadoConfirmacaoNome = await revalidateNameConfirmHandler.handle({
  decision: clientPostIntakeDecision,
  u,
  from,
  proximaConfirmacaoProgressiva
})

if (resultadoConfirmacaoNome.success) {
  return resultadoConfirmacaoNome.response
}

// branch legacy atual permanece durante a estabilização
```

Regras de segurança:

1. `success: false` só pode ocorrer na guarda inicial;
2. a guarda não chama dependências nem altera `u`;
3. o branch legacy permanece alcançável para outros actions macro de
   `REVALIDATE_NAME`;
4. se a execução começar e falhar, a exceção deve subir; não pode haver captura
   que libere o legacy;
5. o handler deve ser chamado antes do branch macro atual.

Esse desenho impede execução dupla: para `revalidate_name_confirm`, o handler
retorna `success: true` e o servidor encerra; para outra ação, ele recusa sem
efeitos e o fluxo atual continua.

## 7. Testes de caracterização necessários

Arquivo recomendado:

```text
test/revalidate_name_confirm.handler.test.js
```

### Cenário 1 — action não aplicável

- `nextAction` diferente de `revalidate_name_confirm`;
- retorno `{ success: false, response: null }`;
- `u` integralmente idêntico antes/depois;
- `proximaConfirmacaoProgressiva` não chamada.

### Cenário 2 — confirmação com array ausente

- action exato;
- cria `_revalidaConfirmados`;
- adiciona somente `"nome"`;
- chama `proximaConfirmacaoProgressiva` uma vez com `from` e o mesmo `u`;
- retorna `{ success: true, response }` com a resposta original.

### Cenário 3 — confirmação com array existente

- preserva itens anteriores;
- acrescenta `"nome"` no final;
- não substitui o array por outro objeto;
- chama a continuidade exatamente uma vez.

### Cenário 4 — erro após o primeiro efeito

- `proximaConfirmacaoProgressiva` lança;
- a promise de `handle` rejeita com o mesmo erro;
- o handler não devolve `success: false`;
- a mutação já iniciada permanece visível, demonstrando por que o legacy não
  pode ser executado.

### Cenário 5 — integração híbrida

Caracterizar no teste do servidor ou em teste textual dedicado:

- `nextAction` é preservado no retorno do post-router;
- handler é chamado antes do branch legacy;
- retorno `success: true` encerra o fluxo;
- recusa limpa permite alcançar o comportamento macro preexistente.

## 8. Riscos de regressão

### Baixo — alteração da ordem de confirmação

Se o handler for chamado depois do branch macro, ele nunca executará. A chamada
deve ficar imediatamente antes do bloco `REVALIDATE_NAME`.

### Médio — fallback depois de mutação

Um `catch` que transforme erro em `success: false` causará reexecução legacy
depois do `push("nome")`. Isso pode duplicar `"nome"` e repetir a continuidade.

### Médio — uso acidental de `legacyAction`

O handler deve guardar pelo action atômico. Usar `REVALIDATE_NAME` faria o
handler capturar correção textual, áudio e espera, alterando precedência.

### Baixo — alteração da identidade do array

Uma reescrita como spread ou deduplicação modificaria semântica e identidade.
Deve ser mantido o `push` atual.

### Baixo — transformação da resposta

A resposta da continuidade deve ser repassada como está dentro de
`{ success: true, response }`.

### Baixo — action ausente

Durante a coexistência, action ausente ou diferente deve resultar em recusa
limpa e deixar o legacy trabalhar.

## 9. Contrato recomendado

```js
async function handle(ctx) {
  return {
    success: true,
    response: ctxResponse
  }
}

module.exports = { handle }
```

Semântica:

- `success: false`: não aplicável, zero efeitos;
- `success: true`: execução concluída, servidor deve retornar `response`;
- exceção: execução começou ou falhou; servidor deve propagar e não executar
  fallback.

Não é necessário campo adicional de side effect para este handler, porque há
uma única guarda pura antes de todas as mutações e não existe captura depois
delas.

## Respostas finais

### A) Quantas linhas devem sair do `server.js`?

O sub-bloco possui **5 linhas físicas de lógica/controle** elegíveis para remoção
(aproximadamente linhas 10493–10497).

Na primeira PR híbrida, porém, **zero linhas legacy devem ser removidas**: essas
5 linhas permanecem temporariamente como fallback. Elas deixam de ser o caminho
principal para o action atômico e só devem ser removidas na fase posterior de
eliminação do legacy.

### B) Quais arquivos serão criados?

1. `src/domain/client/handlers/revalidate_name_confirm.handler.js`
2. `test/revalidate_name_confirm.handler.test.js`

Também haverá modificação mínima em `server.js` para:

- preservar o objeto completo retornado por `routeClientPostIntake`;
- chamar o handler;
- retornar sua resposta quando `success === true`.

### C) Qual é a menor PR segura para iniciar a Fase 2?

Uma PR contendo exclusivamente:

1. o handler `revalidate_name_confirm`;
2. seu teste unitário de contrato, mutação, continuidade e propagação de erro;
3. a chamada híbrida antes do branch macro de revalidação de nome;
4. um teste de integração/ordem do fallback;
5. nenhuma remoção do branch legacy;
6. nenhuma alteração nos routers ou em outras ações.

Essa é a menor unidade que comprova ponta a ponta:

```text
nextAction atômico
  → handler aplicável
  → primeiro side effect
  → continuidade existente
  → retorno sem executar legacy
```

e, simultaneamente:

```text
action não aplicável
  → success: false sem efeitos
  → fluxo legacy preservado
```
