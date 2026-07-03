# Auditoria de segurança do webhook Meta

Data: 02/07/2026
Escopo: autenticação do `POST /webhook` da Meta
Natureza: auditoria técnica somente leitura

## Resumo executivo

O middleware implementa corretamente a validação HMAC SHA-256 quando
`APP_SECRET` ou `META_APP_SECRET` está configurado:

- usa o corpo bruto recebido;
- calcula HMAC SHA-256;
- exige prefixo `sha256=`;
- usa `crypto.timingSafeEqual`;
- retorna 401 para assinatura ausente ou inválida;
- só chama o endpoint depois da validação.

Em produção, a ausência do secret causa falha fechada com HTTP 503.

Entretanto, o ambiente auditado não possui:

- `APP_SECRET`;
- `META_APP_SECRET`;
- `NODE_ENV`.

Sem `NODE_ENV=production` e sem secret, o middleware entra no comportamento de
desenvolvimento e aceita qualquer requisição, inclusive sem assinatura.

Conclusão:

- o código possui proteção condicional adequada;
- o ambiente auditado **não está protegido hoje**;
- a Durable Inbox não corrige autenticação: ela persiste qualquer payload que
  o middleware deixar passar.

## 1. Componentes envolvidos

### Middleware

Arquivo:

```text
src/domain/webhook-security.js
```

Função:

```js
validarAssinaturaMeta(req, res, next)
```

### Captura do corpo bruto

Arquivo:

```text
server.js
```

Configuração aproximada:

```js
app.use(express.json({
  limit: "1mb",
  verify: (req, _res, buf) => {
    req.rawBody = Buffer.from(buf)
  }
}))
```

### Integração no endpoint

```js
app.post("/webhook", validarAssinaturaMeta, ...)
```

O middleware é executado antes de:

- extrair mensagens;
- persistir na Durable Inbox;
- responder HTTP 200;
- iniciar o dreno;
- executar regras de negócio.

## 2. Uso de `META_APP_SECRET`

O código aceita duas variáveis:

```js
process.env.APP_SECRET || process.env.META_APP_SECRET
```

### Precedência

1. `APP_SECRET`;
2. `META_APP_SECRET`.

Se ambas existirem, `APP_SECRET` prevalece.

### Observação

O nome usado pela Meta no painel é “App Secret”. A aplicação suporta tanto o
nome curto `APP_SECRET` quanto o mais explícito `META_APP_SECRET`.

### Ambiente auditado

| Variável | Configurada |
|---|---|
| `APP_SECRET` | Não |
| `META_APP_SECRET` | Não |
| `NODE_ENV` | Não |
| `VERIFY_TOKEN` | Sim |
| `INTERNAL_WEBHOOK_SECRET` | Sim |

Nenhum valor de segredo foi lido ou registrado no relatório.

`VERIFY_TOKEN` não substitui o App Secret:

- `VERIFY_TOKEN` autentica o handshake GET de configuração;
- App Secret autentica cada POST recebido.

## 3. Validação de `X-Hub-Signature-256`

### 3.1 Leitura do header

O middleware lê:

```text
x-hub-signature-256
```

Headers HTTP são case-insensitive no Express.

### 3.2 Formato

É obrigatório começar com:

```text
sha256=
```

Header ausente, vazio ou com outro prefixo retorna HTTP 401.

### 3.3 Corpo assinado

O cálculo usa prioritariamente:

```js
req.rawBody
```

Esse buffer é capturado pelo callback `verify` do parser JSON antes da
desserialização.

Isso é correto. Assinar `JSON.stringify(req.body)` como caminho principal seria
frágil, pois espaços, ordem de propriedades e escapes podem mudar.

### 3.4 Fallback

Se `rawBody` não for Buffer, o middleware usa:

```js
Buffer.from(JSON.stringify(req.body || {}), "utf8")
```

No servidor normal, `rawBody` deve sempre existir para JSON válido. O fallback
é útil em testes, mas pode rejeitar uma assinatura válida se outra integração
chamar o middleware sem preservar os bytes originais.

Ele não cria um bypass: uma reserialização diferente tende a causar falso
negativo, não aceitação indevida.

### 3.5 Cálculo

```js
crypto.createHmac("sha256", appSecret)
  .update(rawBody)
  .digest("hex")
```

Resultado esperado:

```text
sha256=<hex>
```

### 3.6 Comparação

A comparação:

1. converte os dois valores em Buffer;
2. compara o comprimento;
3. usa `crypto.timingSafeEqual` quando os comprimentos são iguais.

Isso evita comparação caractere a caractere com tempo variável.

O retorno antecipado por comprimento diferente revela apenas o tamanho do
header, não o secret.

## 4. Fluxo de rejeição

### Assinatura ausente

Com secret configurado:

```text
header ausente
-> não começa com sha256=
-> HTTP 401
-> next() não é chamado
-> Durable Inbox não recebe payload
```

### Assinatura inválida

```text
calcula HMAC esperado
-> timingSafeEqual retorna false
-> HTTP 401
-> endpoint não executa
```

### Secret ausente em produção

```text
NODE_ENV = production/prod
-> secret ausente
-> log de configuração
-> HTTP 503
-> endpoint não executa
```

O uso de 503, em vez de 401, indica corretamente indisponibilidade de
configuração.

### JSON inválido ou maior que 1 MB

O parser Express rejeita antes do middleware/endpoint. A Durable Inbox não é
acionada.

## 5. Fluxo de sucesso

```text
POST /webhook
-> express.json preserva rawBody
-> middleware encontra App Secret
-> header contém sha256=
-> HMAC esperado é calculado sobre rawBody
-> comparação segura aprova
-> next()
-> endpoint extrai mensagens
-> Durable Inbox persiste com fsync
-> HTTP 200
-> dreno/processamento
```

A validação ocorre na posição correta: antes de qualquer ACK ou persistência.

## 6. Secret ausente

### Produção reconhecida

São considerados produção apenas:

```text
production
prod
```

A comparação é normalizada para minúsculas.

Resultado: HTTP 503.

### Desenvolvimento ou ambiente não reconhecido

Para:

- `development`;
- `test`;
- `staging`;
- string vazia;
- variável ausente;
- qualquer outro valor;

o middleware:

1. emite aviso uma vez;
2. chama `next()`;
3. não valida assinatura.

### Risco

O comportamento depende de duas configurações corretas simultaneamente:

1. definir o secret;
2. ou, se ausente, definir exatamente `NODE_ENV=production`.

Um deploy público com `NODE_ENV` ausente é tratado como desenvolvimento.

Esse é o estado do ambiente local auditado.

## 7. Assinatura inválida

Com secret configurado:

- não há fallback para modo desenvolvimento;
- não há tentativa com `VERIFY_TOKEN`;
- não há aceitação parcial;
- retorna 401;
- não persiste;
- não processa;
- não responde ao usuário;
- não cria receipt.

Isso ocorre em qualquer `NODE_ENV`.

Logo, configurar o secret protege inclusive desenvolvimento e staging.

## 8. Diferenças entre desenvolvimento e produção

| Situação | Produção | Não produção |
|---|---|---|
| Secret configurado + assinatura válida | Aceita | Aceita |
| Secret configurado + assinatura inválida | 401 | 401 |
| Secret configurado + assinatura ausente | 401 | 401 |
| Secret ausente | 503 | Aceita sem validação |
| Aviso de configuração | Log de erro | Warning uma vez |

A diferença só existe quando o secret está ausente.

## 9. Verificação comportamental realizada

O middleware foi invocado diretamente, sem servidor ou rede.

Resultados:

| Cenário | Resultado |
|---|---|
| Assinatura válida com `APP_SECRET` | `next()` |
| Assinatura inválida | HTTP 401 |
| Assinatura ausente | HTTP 401 |
| Produção sem secret | HTTP 503 |
| Desenvolvimento sem secret | `next()` |
| Assinatura válida usando `META_APP_SECRET` | `next()` |

O comportamento observado coincide com o código.

## 10. Cobertura de testes existente

### O que existe

- `test/webhook-durability.test.js` confirma persistência antes do ACK;
- testes gerais verificam sintaxe e fluxos;
- o middleware foi exercitado manualmente nesta auditoria.

### O que não existe

Não foi encontrado teste automatizado dedicado cobrindo:

- HMAC válido;
- HMAC inválido;
- header ausente;
- raw body alterado;
- produção sem secret;
- desenvolvimento sem secret;
- alias `META_APP_SECRET`;
- precedência de `APP_SECRET`;
- `timingSafeEqual`;
- garantia de que inbox não é chamada após 401/503.

Portanto, a lógica existe, mas sua regressão não está protegida por suíte
específica.

## 11. Possibilidade de spoofing

### Com secret configurado e protegido

Risco de spoofing direto: baixo.

Um atacante sem App Secret não consegue alterar ou fabricar payload e produzir
HMAC válido.

### Sem secret em ambiente fail-open

Risco: crítico.

Qualquer origem capaz de alcançar o endpoint pode enviar JSON semelhante ao da
Meta. O payload será:

- aceito;
- persistido;
- processado;
- potencialmente usado para HubSpot, Drive, Calendar e WhatsApp.

### Replay de payload legitimamente assinado

HMAC garante autenticidade e integridade, não frescor.

Quem capturar payload e assinatura válidos pode tentar reenviá-los.

A Durable Inbox reduz esse risco:

- usa `message.id` como chave persistente;
- registros pendentes impedem segunda inserção;
- receipts concluídos impedem reprocessamento por 7 dias.

Após a expiração do receipt, o mesmo ID pode voltar a ser aceito.

Não há validação explícita de idade do `message.timestamp`.

### Vazamento do secret

Se o App Secret vazar:

- o atacante pode assinar qualquer payload;
- deduplicação não impede IDs inéditos;
- é necessário rotacionar no painel Meta e no ambiente.

O secret nunca deve ser commitado ou logado.

### DoS

Proteções existentes:

- limite JSON de 1 MB;
- rejeição de assinatura antes da inbox quando secret existe.

Sem secret, um atacante pode provocar:

- crescimento da inbox;
- I/O síncrono com `fsync`;
- processamento de mensagens falsas;
- chamadas externas.

## 12. Compatibilidade com Durable Inbox

### Ordem atual

```text
express.json/rawBody
-> validarAssinaturaMeta
-> registrarMensagensWebhook
-> HTTP 200
-> dreno
```

Essa ordem é correta.

### Rejeição

401 ou 503 ocorre antes de:

- criar arquivo pendente;
- escrever `webhook-inbox.json`;
- criar receipt;
- responder 200.

### Sucesso

Somente payload autenticado deveria alcançar a inbox.

No ambiente auditado, como o middleware está fail-open, a inbox durável pode
preservar e reproduzir payload falso. Durabilidade aumenta o impacto de uma
configuração de autenticação incorreta.

### Restart

Mensagens já autenticadas e persistidas não precisam ter a assinatura
revalidada no replay. A integridade do arquivo local passa a depender das
permissões do filesystem.

Isso é aceitável se:

- inbox tiver acesso restrito;
- volume estiver protegido;
- apenas o processo puder escrever.

## 13. Correção mínima recomendada

Há duas partes distintas.

### 13.1 Correção operacional obrigatória

Não exige PR:

1. configurar `APP_SECRET` ou `META_APP_SECRET` no secret manager do ambiente;
2. configurar `NODE_ENV=production`;
3. reiniciar o serviço;
4. testar assinatura válida e inválida;
5. confirmar que o secret não aparece em log;
6. registrar procedimento de rotação.

Sem isso, nenhuma mudança de teste torna o ambiente protegido.

### 13.2 Menor PR segura de hardening

Alterar o middleware para falhar fechado sempre que o secret estiver ausente,
independentemente de `NODE_ENV`.

Comportamento:

```text
secret ausente -> HTTP 503 em todos os ambientes
```

Desenvolvimento deve usar um secret local de teste. Não é necessário permitir
webhook unsigned.

Adicionar teste dedicado:

```text
test/meta-webhook-security.test.js
```

Cobertura:

- válida;
- inválida;
- ausente;
- corpo alterado;
- `APP_SECRET`;
- `META_APP_SECRET`;
- secret ausente em dev/prod;
- Durable Inbox não alcançada após rejeição, por verificação de ordem/middleware.

### Por que fail-closed global?

- elimina dependência de `NODE_ENV` correto;
- evita staging público desprotegido;
- simplifica o contrato;
- reduz combinações;
- torna erro de configuração visível imediatamente.

## Respostas finais

### A) O webhook está protegido hoje?

**Condicionalmente.**

O código protege corretamente quando `APP_SECRET` ou `META_APP_SECRET` está
configurado. Também falha fechado quando reconhece produção e o secret está
ausente.

Sem secret fora de produção reconhecida, aceita payload unsigned.

### B) O ambiente auditado está protegido hoje?

**Não.**

No ambiente auditado:

- App Secret ausente;
- `NODE_ENV` ausente;
- comportamento equivalente a desenvolvimento;
- requisições sem assinatura são aceitas.

Isso não prova que o ambiente remoto implantado tenha a mesma configuração.
Cada ambiente deve ser verificado separadamente.

### C) Qual é a menor PR segura para corrigir eventuais falhas?

1. tornar ausência de secret fail-closed em qualquer ambiente;
2. criar teste automatizado específico;
3. manter HMAC, raw body e comparação atuais;
4. não alterar endpoint nem Durable Inbox.

A correção operacional do ambiente — cadastrar o secret — deve ocorrer mesmo
com essa PR.

### D) Quais arquivos seriam alterados?

Somente:

```text
src/domain/webhook-security.js
test/meta-webhook-security.test.js
```

Opcionalmente:

```text
package.json
```

apenas para incluir o teste na suíte padrão.

Não é necessário alterar:

- `server.js`;
- Durable Inbox;
- HubSpot;
- Drive;
- Calendar;
- WhatsApp transport;
- UX.

### E) Risco da mudança

Risco: **BAIXO em produção / MÉDIO em desenvolvimento**.

Produção:

- com secret correto, comportamento não muda;
- sem secret, já retornava 503.

Desenvolvimento:

- chamadas unsigned deixarão de funcionar;
- desenvolvedores precisarão configurar secret e assinatura;
- fixtures/testes antigos sem assinatura podem falhar.

O risco é controlável e desejável para hardening.

### F) Estimativa de linhas

| Arquivo | Estimativa |
|---|---:|
| `webhook-security.js` | 5–15 linhas alteradas/removidas |
| Teste dedicado | 100–170 linhas |
| `package.json` opcional | 1 linha |

Total estimado: **106–186 linhas**.

Código de produção: no máximo aproximadamente **15 linhas**.

## Critérios para encerrar o bloqueador

1. App Secret configurado no ambiente real.
2. `NODE_ENV=production`.
3. Serviço reiniciado após configuração.
4. Payload assinado válido recebe 200 após persistência.
5. Assinatura inválida recebe 401.
6. Assinatura ausente recebe 401.
7. Secret ausente recebe 503 em qualquer ambiente.
8. Requisição rejeitada não aparece na inbox.
9. Secret não aparece em logs.
10. Teste automatizado dedicado passa.
11. Procedimento de rotação está documentado.

## Recomendação

Executar primeiro a configuração do secret no ambiente de produção. Em seguida,
fazer a pequena PR fail-closed com teste dedicado.

Essa combinação fecha o risco de spoofing sem alterar Durable Inbox, regras de
negócio ou UX.
