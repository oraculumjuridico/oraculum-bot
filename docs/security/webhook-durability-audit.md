# Auditoria de durabilidade do webhook WhatsApp

Data: 02/07/2026
Escopo: fluxo de entrada do `POST /webhook` até resposta ao cliente
Natureza: auditoria técnica somente leitura

## Resumo executivo

O webhook valida a assinatura, extrai mensagens, marca cada mensagem na
deduplicação em memória e responde HTTP 200. Somente depois do ACK, por meio de
`setImmediate`, começa o processamento.

Nenhum destes itens é persistido:

- mensagem recebida;
- fila de mensagens;
- lock por usuário;
- mapa de deduplicação;
- estado “pendente/processando/concluído” da mensagem.

Consequentemente, uma queda depois do HTTP 200 pode perder a mensagem. A janela
não termina quando o `setImmediate` começa: ela permanece durante a espera na
fila e durante o processamento, até que todos os efeitos necessários tenham
terminado. O estado do usuário ainda é salvo com debounce, criando uma janela
adicional de inconsistência.

## 1. Fluxo completo

```text
Meta
  |
  v
POST /webhook
  |
  +-- express.json guarda rawBody
  +-- validarAssinaturaMeta
  +-- percorre entry/change/messages
  +-- calcula chave de deduplicação
  +-- marca ID em mensagensProcessadas (memória)
  |
  v
HTTP 200
  |
  v
setImmediate
  |
  v
processarMensagemWebhook
  |
  v
processar -> filasMensagens (memória)
  |
  v
drenaFilaUsuario -> executarComLockUsuario (memória)
  |
  v
processarComLock
  |
  +-- resolve HubSpot/estado
  +-- atualiza consulta
  +-- processarInterno
  +-- sincroniza HubSpot
  +-- agenda persistência de users
  |
  v
monta resposta visual/áudio
  |
  v
envia resposta pelo WhatsApp
```

### 1.1 Parsing

`express.json` é configurado aproximadamente nas linhas 333–338 de
`server.js`.

O callback `verify` copia os bytes originais para `req.rawBody`. Isso permite
validar a assinatura HMAC sem depender da reserialização do JSON.

Limite atual do corpo: 1 MB.

### 1.2 Segurança

O endpoint usa `validarAssinaturaMeta`.

Em produção:

- ausência de App Secret retorna 503;
- ausência ou formato inválido da assinatura retorna 401;
- assinatura incorreta retorna 401;
- assinatura correta chama o endpoint.

### 1.3 Extração

No `POST /webhook`, o código percorre:

1. `req.body.entry`;
2. `entry.changes`;
3. `change.value.messages`.

Eventos sem `messages`, como atualizações de status, resultam numa lista vazia
e recebem HTTP 200 sem processamento adicional.

Para cada mensagem são extraídos:

- `message.from`;
- texto, button reply ou list reply;
- `message.id`;
- `message.type`;
- `message.timestamp`;
- o objeto `value`, que contém contatos e contexto;
- o objeto integral `message`, incluindo referência de mídia quando houver.

### 1.4 Deduplicação

Antes do ACK, o endpoint chama:

```js
mensagemJaProcessada(message.id, dedupeKey)
```

Se a função retorna `false`, `{ value, message }` é incluído na lista local
`mensagens`.

### 1.5 ACK

Depois de percorrer todo o payload, o código executa:

```js
res.sendStatus(200)
```

Localização atual: `server.js`, linha aproximada 14420.

Nesse ponto:

- a mensagem está marcada na deduplicação em memória;
- a mensagem existe na variável local `mensagens`;
- ainda não entrou em `filasMensagens`;
- ainda não passou pelo lock;
- ainda não foi persistida;
- nenhuma regra de negócio foi executada.

### 1.6 Agendamento assíncrono

Depois do ACK e da verificação de lista vazia, o código chama:

```js
setImmediate(async () => { ... })
```

Localização: linhas aproximadas 14423–14431.

O callback percorre as mensagens do mesmo request sequencialmente. Erros de
cada mensagem são capturados e apenas registrados.

### 1.7 Primeiro processamento

Existem três marcos diferentes:

| Marco | Local aproximado | Significado |
|---|---:|---|
| Callback começa | 14423 | Event loop entra no `setImmediate` |
| Processamento de webhook começa | 14426 | Chama `processarMensagemWebhook` |
| Mensagem entra na fila do usuário | 14287 | `processar()` faz `push` em `filasMensagens` |
| Regra de negócio começa | 14320 | `processarComLock()` inicia resolução HubSpot |

O primeiro processamento efetivo de negócio ocorre somente depois de:

- ACK;
- `setImmediate`;
- montagem de nome/texto;
- inserção na fila;
- espera por mensagens anteriores;
- aquisição do lock.

## 2. Uso de `setImmediate`

### Objetivo atual

Responder rapidamente à Meta e deslocar trabalho demorado para depois do ACK.

Isso evita manter a conexão aberta durante:

- consultas HubSpot;
- download de mídia;
- transcrição;
- geração de áudio;
- Drive;
- Calendar;
- envio de resposta.

### Risco

`setImmediate` não é uma fila. É apenas um callback pendente no event loop.

Se o processo terminar:

- o callback desaparece;
- a lista `mensagens` desaparece;
- não existe replay;
- a Meta já recebeu HTTP 200.

## 3. Filas

### Estrutura

`filasMensagens` é um `Map` global em memória, indexado por `from`.

Cada item contém:

- `nomeWA`;
- `text`;
- `msgObj`;
- função `resolve`.

### Comportamento

- primeira mensagem inicia `drenaFilaUsuario`;
- mensagens posteriores do mesmo usuário aguardam;
- o dreno processa uma por vez;
- ao final remove o item;
- quando esvazia, remove a fila do `Map`.

### Limitações

- não sobrevive restart;
- não é compartilhada entre instâncias;
- não possui limite ou backpressure explícito;
- não possui tentativas;
- não possui dead-letter;
- não possui estado durável de conclusão.

## 4. Locks

### Estrutura

`locksUsuarios` é outro `Map` global em memória.

`executarComLockUsuario()`:

1. normaliza o telefone;
2. obtém a Promise anterior;
3. registra uma nova Promise;
4. espera a anterior;
5. executa a tarefa;
6. libera em `finally`.

### Proteção oferecida

Evita efeitos simultâneos para o mesmo usuário dentro da mesma instância.

### Limitações

- não sobrevive restart;
- não coordena múltiplas instâncias;
- não protege contra reprocessamento posterior da mesma mensagem;
- não transforma fila em armazenamento durável.

Fila e lock oferecem serialização, não durabilidade.

## 5. Deduplicação atual

### Chave primária

Quando `message.id` existe, ele é usado como chave.

### Chave fallback

Quando o ID não existe:

```text
fallback:<from>:<type>:<text>:<timestamp-ou-janela>
```

Se não houver timestamp, a janela é calculada em blocos de 15 segundos.

### Retenção

Antes de cada consulta, entradas com mais de 10 minutos são removidas.

### Momento da marcação

A chave é inserida no `Map` quando a mensagem é apenas aceita para a lista
local, antes do HTTP 200 e antes do processamento.

Isso representa “vista”, não “processada com sucesso”.

### Sobrevivência a restart

Não sobrevive.

`mensagensProcessadas` não é serializado por
`src/domain/state-persistence.js`.

### Efeitos colaterais do desenho atual

- duas entregas concorrentes na mesma instância são deduplicadas;
- após restart, o mesmo ID pode ser processado novamente;
- mensagem que falha depois de marcada não pode ser tentada novamente na mesma
  instância durante a janela;
- dois textos legítimos idênticos sem ID/timestamp, no mesmo bloco de 15
  segundos, podem ser tratados como duplicados;
- em múltiplas instâncias, cada processo possui seu próprio mapa.

## 6. Persistência

### O que é persistido

`src/domain/state-persistence.js` salva:

- `savedAt`;
- mapa `users`;
- estado do fluxo e do caso.

A escrita usa:

- arquivo temporário;
- `fs.openSync` exclusivo;
- `writeFileSync`;
- `fsyncSync`;
- `renameSync`.

Esse mecanismo é atomicamente melhor que escrita direta.

### O que não é persistido

- payload do webhook;
- `message.id`;
- `mensagensProcessadas`;
- `filasMensagens`;
- `locksUsuarios`;
- tentativas;
- estado pendente/processando/concluído;
- erro de processamento por mensagem.

### Momento da persistência

`processarComLock()` chama `agendarPersistenciaUsers()` em `finally`.

Também há agendamento depois de registrar a última pergunta.

A persistência é debounced:

- atraso normal de 300 ms;
- espera máxima de 2 segundos.

Logo, mesmo depois da regra de negócio retornar, uma queda pode ocorrer antes
do estado do usuário chegar ao disco.

## 7. Cenários de morte do processo

### 7.1 Antes da validação/ACK

Se o processo cai antes de responder:

- a Meta não recebe ACK;
- a Meta tende a reenviar;
- os mapas em memória somem;
- a mensagem pode ser processada no restart.

Risco de perda: baixo, assumindo retry da Meta.
Risco de duplicação: baixo, pois o processamento ainda não começou.

### 7.2 Depois da marca de dedupe e antes do ACK

Se houver crash:

- dedupe em memória desaparece;
- não houve regra de negócio;
- a Meta reenvia;
- o fluxo tende a recuperar.

Se houver exceção sem encerramento do processo:

- o endpoint tenta responder 500;
- a chave continua em `mensagensProcessadas`;
- a Meta reenvia;
- a nova entrega pode ser descartada como duplicada e receber 200.

Essa é uma pequena janela de perda pré-ACK, mesmo sem crash.

### 7.3 Depois do ACK e antes do `setImmediate`

Se o processo cai:

- a Meta considera a mensagem entregue;
- callback e lista local desaparecem;
- não há registro em disco;
- não há replay.

Resultado: perda integral da mensagem.

### 7.4 Durante o `setImmediate`, antes da fila

Mesmo resultado:

- ACK já enviado;
- mensagem ainda vive apenas na stack/heap;
- restart perde a mensagem.

### 7.5 Aguardando na fila

Se o usuário já possui mensagem em processamento, novas mensagens ficam no
array de `filasMensagens`.

Se o processo cai:

- todas as mensagens aguardando são perdidas;
- nenhuma será restaurada.

### 7.6 Durante o processamento

O resultado depende do ponto exato:

| Ponto da falha | Resultado possível |
|---|---|
| Antes de qualquer efeito | Mensagem perdida |
| Após mutar `u`, antes de persistir | Estado volta ao snapshot anterior no restart |
| Após HubSpot, antes de estado local | HubSpot avançado e bot local atrasado |
| Após Drive, antes de nota/estado | Arquivo órfão ou não referenciado |
| Após Calendar, antes de estado local | Evento existente sem confirmação local |
| Após enviar WhatsApp, antes de persistir | Cliente recebeu resposta, mas estado pode regredir |
| Durante envio de áudio/texto | Entrega parcial |

`processarComLock()` captura muitas exceções e produz fallback, mas isso não
protege contra término abrupto do processo.

### 7.7 Depois do processamento, antes do flush

Como a persistência possui debounce, o processo pode:

- ter enviado resposta;
- ter alterado HubSpot;
- ainda não ter salvo `users-state.json`.

No restart, o usuário pode retornar a um stage anterior e repetir uma etapa.

## 8. Perda potencial

Há perda potencial em quatro regiões:

1. exceção depois de marcar dedupe e antes do ACK, sem restart;
2. depois do ACK e antes do callback;
3. fila em memória;
4. processamento ou persistência parcial após ACK.

A região 2 é a janela mais clara e determinística: nenhuma parte da mensagem
está durável.

## 9. Duplicação potencial

### 9.1 Restart

O mapa de dedupe desaparece. Se a Meta ou outra origem reenviar o mesmo ID, ele
será aceito novamente.

### 9.2 Múltiplas instâncias

Mapas, filas e locks não são compartilhados. Duas instâncias podem processar o
mesmo ID ao mesmo tempo.

### 9.3 Crash após efeito e antes de conclusão durável

Uma futura implementação de replay poderá repetir:

- nota HubSpot;
- atualização de negócio;
- criação de pasta/arquivo;
- evento Calendar;
- mensagem WhatsApp.

Persistir a entrada elimina perda, mas torna idempotência dos efeitos ainda
mais importante.

### 9.4 Fallback sem ID

Depois de 15 segundos sem timestamp ou depois de 10 minutos de retenção, uma
reentrega pode ser considerada nova.

## 10. Dependências do fluxo

### Entrada e segurança

- Express;
- parser JSON;
- `rawBody`;
- App Secret Meta;
- assinatura `x-hub-signature-256`.

### Identidade e estado

- `message.id`;
- `message.from`;
- contato do payload;
- `users`;
- HubSpot;
- arquivo local de estado.

### Serialização

- `mensagensProcessadas`;
- `filasMensagens`;
- `locksUsuarios`.

### Regras de negócio

- `processarInterno`;
- handlers e routers;
- seleção de caso;
- documentos;
- revalidação;
- agendamento.

### Integrações

- WhatsApp Graph API;
- HubSpot;
- Google Drive;
- Google Calendar;
- AssemblyAI;
- Groq;
- TTS/FFmpeg;
- e-mail/notificações administrativas.

### Operação

- event loop Node.js;
- filesystem;
- volume persistente;
- processo único ou coordenação entre instâncias.

## 11. Menor correção sem broker externo

Dentro das restrições, a menor solução segura é uma **inbox durável local**
acoplada ao mecanismo de persistência já existente.

Não é necessário introduzir Redis, RabbitMQ, SQS ou outro broker.

### Semântica mínima

1. validar assinatura;
2. extrair mensagem e chave estável;
3. persistir a mensagem como `pending`;
4. executar `fsync`;
5. somente então responder HTTP 200;
6. depois do ACK, drenar pendências;
7. no startup, restaurar e drenar pendências antigas;
8. marcar `completed` somente depois que
   `processarMensagemWebhook()` terminar;
9. manter recibo de conclusão por uma janela definida;
10. em erro, manter `pending` com contador e último erro sanitizado.

### Ordem correta da deduplicação

A fonte de verdade deve passar a ser durável:

- `pending`: já recebido, deve ser processado ou retomado;
- `processing`: opcional; no restart volta para `pending`;
- `completed`: não processar novamente;
- ausente: registrar antes do ACK.

O `Map` atual pode continuar como cache, mas não como fonte de verdade.

### Armazenamento mínimo

Há duas opções locais:

1. incluir inbox e recibos no arquivo de estado existente;
2. usar arquivo separado dentro do mesmo `DATA_DIR`.

Para a menor PR, reutilizar `state-persistence.js` e seu padrão
temporário + `fsync` + rename reduz superfície. Um arquivo separado evita
reescrever todos os usuários por mensagem, mas adiciona outro ciclo de
persistência.

Em ambos os casos, o volume precisa ser persistente. Disco efêmero não elimina
a janela em restart de host/deploy.

## Respostas

### A) Qual é exatamente a janela de perda de mensagem?

A janela principal começa na execução de:

```js
res.sendStatus(200)
```

e permanece enquanto a mensagem existir somente:

- na variável local `mensagens`;
- no callback de `setImmediate`;
- em `filasMensagens`;
- no processamento em andamento;
- ou em mutações ainda não persistidas.

O trecho de perda integral mais objetivo vai do ACK até o primeiro efeito
durável bem-sucedido. Porém, como não existe registro durável da mensagem, uma
queda durante todo o processamento pode gerar perda total ou parcial.

Existe ainda uma janela menor antes do ACK: a dedupe é marcada antes da
resposta. Se ocorrer exceção sem restart, o retry pode ser descartado pelo mapa
em memória.

### B) Qual é a menor PR segura para eliminar essa janela?

Uma PR que:

1. persista cada mensagem recebida antes do ACK;
2. faça `fsync`/rename atômico;
3. responda 500 se a persistência falhar;
4. drene `pending` depois do ACK;
5. restaure `pending` no startup;
6. marque `completed` apenas após o processamento completo;
7. use `pending/completed` para deduplicação;
8. mantenha o fluxo de negócio atual inalterado.

Não é recomendável apenas mover o HTTP 200 para depois de todo o processamento:
áudio e integrações podem exceder o prazo esperado pela Meta, induzindo retries
e duplicações.

### C) É suficiente persistir a mensagem antes do ACK?

Não, isoladamente.

Persistir antes do ACK é necessário, mas também são obrigatórios:

- replay no startup;
- dreno de pendências;
- marcação durável de conclusão;
- retenção de IDs concluídos;
- política de retry;
- volume persistente.

Sem replay, a mensagem fica salva mas abandonada. Sem recibo `completed`, uma
reentrega após restart duplica o processamento. Sem idempotência dos efeitos,
crash depois de HubSpot/Drive/WhatsApp ainda pode produzir duplicação no replay.

### D) Quais módulos seriam alterados?

Escopo mínimo recomendado:

- `server.js`
  - endpoint `/webhook`;
  - deduplicação;
  - dreno pós-ACK;
  - replay no startup;
- `src/domain/state-persistence.js`
  - armazenamento atômico de pendências e recibos;
  - carga no startup;
  - conclusão e limpeza;
- `test/webhook-durability.test.js`
  - novo teste de caracterização.

Opcionalmente, `package.json` apenas para incluir o teste na suíte padrão.

Não é necessário alterar:

- `processarInterno`;
- handlers;
- HubSpot;
- Drive;
- Calendar;
- regras de UX.

### E) Qual o risco da mudança?

Risco: **MÉDIO/ALTO**.

Motivos:

- altera o ponto de entrada de todas as mensagens;
- adiciona I/O síncrono antes do ACK;
- precisa preservar ordem por usuário;
- payload contém dados pessoais e deve ter permissão de arquivo restrita;
- replay pode repetir efeitos não idempotentes;
- erro na limpeza pode crescer o arquivo;
- múltiplas instâncias continuam exigindo coordenação de storage/lock;
- depende de volume persistente.

O risco pode ser reduzido com:

- feature flag;
- teste de crash em cada fronteira;
- rollout com um número de homologação;
- uma única instância inicialmente;
- métricas de `pending`, idade máxima e retries;
- limite de tentativas e inspeção manual.

### F) Estimativa de linhas alteradas

Estimativa para produção:

| Arquivo | Linhas |
|---|---:|
| `server.js` | 35–60 |
| `state-persistence.js` | 80–130 |
| Teste dedicado | 180–280 |
| Inclusão opcional no script de testes | 1–2 |

Total estimado: **296–472 linhas**, sendo aproximadamente **115–190 linhas de
produção**.

Uma implementação menor que apenas grave o payload pode ter menos linhas, mas
não elimina a janela porque não oferece replay e conclusão durável.

## Recomendação final

A próxima PR de hardening deve implementar inbox local durável, sem modificar
regras de negócio. Ela deve assumir uma única instância e volume persistente no
primeiro Go-Live.

Antes de liberar clientes reais, é obrigatório testar:

1. crash antes do ACK;
2. crash depois do ACK;
3. restart com mensagem pendente;
4. duas entregas com o mesmo ID;
5. erro de disco;
6. erro durante processamento;
7. conclusão e limpeza;
8. preservação da ordem de duas mensagens do mesmo usuário.
