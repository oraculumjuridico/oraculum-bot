# Design da inbox durável do webhook WhatsApp

Data: 02/07/2026
Fase: Go-Live Hardening
Natureza: design técnico, sem implementação

## 1. Objetivo e limites

O objetivo é eliminar a perda de mensagens depois do HTTP 200 usando apenas a
infraestrutura existente:

- Node.js;
- filesystem local;
- `DATA_DIR`;
- escrita atômica já usada por `state-persistence.js`;
- fila e lock atuais;
- uma única instância do bot no primeiro Go-Live.

Não serão introduzidos:

- broker externo;
- banco de dados;
- Redis;
- serviço de filas;
- mudança em regras de negócio;
- mudança de UX.

## 2. Garantia oferecida

O modelo será **at-least-once**:

- toda mensagem confirmada com HTTP 200 estará duravelmente registrada;
- mensagem pendente será retomada após restart;
- mensagem concluída será reconhecida após restart e não será processada
  novamente durante a janela de retenção;
- erro não removerá a mensagem da inbox.

O modelo não consegue prometer `exactly-once` para todos os efeitos externos.

Exemplo inevitável:

1. HubSpot recebe uma nota;
2. o processo morre;
3. a inbox ainda não foi marcada como concluída;
4. o replay executa o fluxo novamente.

Evitar integralmente essa duplicação exigiria idempotência em cada integração
ou uma transação distribuída, que não existe na infraestrutura atual.

## 3. Invariantes obrigatórios

1. Nunca enviar HTTP 200 antes de `fsync` do registro recebido.
2. Nunca remover uma pendência antes do processamento completo.
3. Nunca tratar um registro `completed` como novo durante a retenção.
4. `processing` encontrado no startup volta para `pending`.
5. Erro de disco antes do ACK retorna 500.
6. Erro de processamento depois do ACK mantém registro durável.
7. Payload concluído deve ser removido para reduzir retenção de dados pessoais.
8. A ordenação por usuário deve permanecer.
9. A inbox deve funcionar com uma única instância.
10. O Go-Live depende de volume persistente.

## 4. Onde a mensagem será persistida

Arquivo proposto:

```text
data/webhook-inbox.json
```

O caminho deve ser derivado do mesmo `DATA_DIR` já configurado em
`state-persistence.js`.

### Por que arquivo separado?

Usar `users-state.json` seria menor conceitualmente, mas faria cada webhook
reescrever todo o estado de todos os usuários antes do ACK. Isso aumenta:

- latência;
- contenção;
- impacto de corrupção;
- tamanho de escrita;
- acoplamento entre inbox e estado conversacional.

Um arquivo separado:

- continua usando o mesmo filesystem;
- não cria infraestrutura nova;
- reutiliza o mesmo padrão atômico;
- permite retenção e recuperação independentes;
- reduz custo por ACK.

### Escrita atômica

Reutilizar o padrão existente:

1. criar diretório;
2. serializar JSON;
3. criar arquivo temporário exclusivo;
4. escrever;
5. `fsync`;
6. fechar;
7. `rename` para `webhook-inbox.json`;
8. remover temporário em falha.

### Permissões locais

O arquivo contém dados pessoais e referências de mídia. Deve ser criado com
permissões restritas ao processo, preferencialmente modo `0600` em sistemas
compatíveis.

## 5. Estrutura persistida

Formato raiz:

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-07-02T12:00:00.000Z",
  "records": {},
  "receipts": {}
}
```

### 5.1 Registro pendente

Chave: `dedupeKey`.

```json
{
  "key": "wamid....",
  "messageId": "wamid....",
  "from": "5581...",
  "status": "pending",
  "receivedAt": "2026-07-02T12:00:00.000Z",
  "updatedAt": "2026-07-02T12:00:00.000Z",
  "attempts": 0,
  "nextAttemptAt": null,
  "lastError": null,
  "profileName": "Cliente",
  "message": {},
  "sequence": 123
}
```

### Campos

| Campo | Finalidade |
|---|---|
| `key` | Identidade persistente da mensagem |
| `messageId` | ID original da Meta, quando houver |
| `from` | Preservar fila e ordem por usuário |
| `status` | `pending`, `processing` ou `error` |
| `receivedAt` | Auditoria e ordenação |
| `updatedAt` | Diagnóstico de travamento |
| `attempts` | Controle de tentativas |
| `nextAttemptAt` | Backoff local |
| `lastError` | Código/mensagem sanitizada |
| `profileName` | Reconstruir `nomeWA` sem persistir `value` inteiro |
| `message` | Payload mínimo necessário ao processamento |
| `sequence` | Desempate determinístico |

### Payload mínimo

Persistir somente:

- `id`;
- `from`;
- `timestamp`;
- `type`;
- `text`;
- `interactive`;
- `audio`;
- `voice`;
- `image`;
- `document`;
- `video`;
- `context`, se usado.

Não persistir o objeto `value` integral. Para
`processarMensagemWebhook`, reconstruir apenas:

```js
{
  contacts: [{
    wa_id: record.from,
    profile: { name: record.profileName }
  }]
}
```

Isso reduz dados duplicados e torna o schema explícito.

### 5.2 Recibo concluído

Depois da conclusão, remover o payload de `records` e registrar:

```json
{
  "key": "wamid....",
  "messageId": "wamid....",
  "completedAt": "2026-07-02T12:00:04.000Z",
  "expiresAt": "2026-07-09T12:00:04.000Z"
}
```

O recibo não precisa conter:

- texto;
- nome;
- mídia;
- resposta;
- telefone completo.

Se a chave for o próprio `messageId`, nenhum telefone precisa ser mantido.

### Retenção

Recomendação inicial:

- recibos concluídos: 7 dias;
- erros: até resolução manual ou limite operacional;
- pendentes: nunca apagar automaticamente;
- payload de concluídos: apagar imediatamente.

## 6. Construção da chave persistente

### 6.1 Com `message.id`

Usar o ID original da Meta:

```text
message.id
```

### 6.2 Sem `message.id`

Gerar SHA-256 sobre representação canônica:

```text
from
type
timestamp
mediaId
interactiveId
texto
```

Formato:

```text
fallback:<sha256>
```

Não gravar texto ou telefone na própria chave.

Se não houver timestamp, manter a janela atual de 15 segundos como parte da
entrada do hash.

## 7. Estados

### 7.1 `pending`

Significado:

- mensagem duravelmente recebida;
- ainda não começou ou precisa ser retomada;
- pode ser drenada.

Transições:

```text
novo -> pending
processing após restart -> pending
error quando nextAttemptAt vence -> pending
```

### 7.2 `processing`

Significado:

- uma execução foi iniciada;
- não deve ser iniciada novamente dentro do mesmo processo.

Antes de chamar `processarMensagemWebhook`:

1. status = `processing`;
2. `attempts += 1`;
3. `updatedAt = now`;
4. persistir a inbox.

Se o processo morrer, esse status será encontrado no restart e convertido para
`pending`.

### 7.3 `completed`

Não permanecerá como payload em `records`.

Conclusão:

1. `processarMensagemWebhook` retorna sem erro;
2. persistir imediatamente o estado de usuários;
3. remover registro de `records`;
4. criar recibo em `receipts`;
5. persistir inbox;
6. liberar próximo item.

Persistir o usuário antes do recibo reduz a chance de marcar como concluída uma
mensagem cujo stage ainda não chegou ao disco.

### 7.4 `error`

Quando o processamento lança erro:

```json
{
  "status": "error",
  "attempts": 2,
  "lastError": {
    "code": "ETIMEDOUT",
    "message": "timeout sanitizado"
  },
  "nextAttemptAt": "2026-07-02T12:01:00.000Z"
}
```

Regras:

- nunca remover;
- nunca criar recibo;
- persistir imediatamente;
- aplicar backoff;
- continuar drenando outros usuários;
- limitar retries automáticos;
- após limite, manter erro para inspeção manual.

Sugestão inicial:

- máximo de 3 tentativas automáticas;
- backoff: 5 s, 30 s, 5 min;
- depois, estado `error` sem retry automático.

## 8. Ordem exata das operações

### Recebimento

1. Express preserva `rawBody`.
2. Middleware valida assinatura.
3. Endpoint extrai mensagens.
4. Para cada mensagem:
   - calcula chave;
   - consulta `records`;
   - consulta `receipts`;
   - se já existe, não duplica;
   - se é nova, cria `pending`.
5. Persiste o lote inteiro uma única vez.
6. Se persistência falhar, responde 500.
7. Se persistência confirmar `fsync`, responde 200.
8. Agenda dreno.

### Processamento

1. Dreno seleciona `pending` mais antigo.
2. Respeita ordem por `sequence`.
3. Marca `processing`.
4. Persiste.
5. Reconstrói `value` mínimo.
6. Chama `processarMensagemWebhook`.
7. Aguarda inclusive envio textual/áudio.
8. Persiste `users` imediatamente.
9. Cria recibo `completed`.
10. Remove payload.
11. Persiste inbox.

### Erro

1. Captura erro.
2. Sanitiza.
3. Marca `error`.
4. Calcula `nextAttemptAt`.
5. Persiste.
6. Não cria recibo.
7. Não apaga payload.

## 9. Momento do HTTP 200

### Antes

```text
dedupe em memória
-> HTTP 200
-> setImmediate
-> fila em memória
-> processamento
```

### Depois

```text
dedupe/inbox durável
-> fsync confirmado
-> HTTP 200
-> dreno
-> fila existente
-> processamento
-> estado persistido
-> recibo durável
```

O ACK passa a significar:

> “A mensagem foi recebida e pode ser recuperada após restart.”

Ele não significa:

> “Todos os efeitos já foram concluídos.”

## 10. Replay após restart

### Inicialização

Depois de carregar usuários e antes de aceitar tráfego:

1. carregar `webhook-inbox.json`;
2. validar `schemaVersion`;
3. validar records individualmente;
4. converter `processing` para `pending`;
5. remover recibos expirados;
6. persistir normalização, se houve alteração;
7. iniciar `app.listen`;
8. agendar dreno.

### Ordem

Ordenar por:

1. `sequence`;
2. `receivedAt`;
3. `key`.

A fila atual continua serializando por `from`.

### Concorrência do dreno

Adicionar apenas um guard em memória:

```text
webhookInboxDraining = true/false
```

Ele evita dois drenos simultâneos na mesma instância. A fonte de verdade
continua sendo o arquivo.

### Instâncias

Este design exige uma única instância.

Com duas instâncias e storage não coordenado:

- ambas podem processar;
- locks não são compartilhados;
- arquivos podem divergir.

Go-Live com mais de uma instância exige outra etapa arquitetural e está fora da
menor PR.

## 11. Como evitar duplicação

### Duplicação de entrega

Suprimida por:

- chave persistente;
- registro `pending/processing/error`;
- recibo `completed`;
- retenção de 7 dias;
- cache em memória opcional.

### Duplicação após restart

- `completed` não volta para fila;
- `processing` volta, pois não há prova de conclusão;
- `pending` volta;
- `error` respeita backoff.

### Duplicação de efeitos externos

Não é totalmente eliminada.

Para reduzir:

- incluir `messageId` em notas/metadados quando possível;
- reutilizar IDs existentes;
- manter funções idempotentes já existentes;
- não repetir automaticamente depois do limite;
- registrar tentativa e momento do erro;
- testar crash após cada integração.

O objetivo desta PR é eliminar perda, não reescrever todas as integrações para
exactly-once.

## 12. Reutilização da persistência atual

`state-persistence.js` já possui:

- diretório de dados;
- escrita temporária;
- `fsync`;
- rename;
- limpeza de temporário;
- logging;
- carga no startup.

Design recomendado:

1. extrair internamente o trecho mecânico para:

```js
gravarJsonAtomico(caminho, payload, { strict })
```

2. manter `persistirUsersAgora()` usando esse helper;
3. adicionar funções de inbox no mesmo módulo;
4. em modo `strict`, propagar erro para impedir HTTP 200;
5. não alterar o contrato dos chamadores atuais de persistência de usuário.

API interna sugerida:

```js
carregarWebhookInbox()
registrarMensagensWebhook(records)
marcarWebhookProcessing(key)
marcarWebhookCompleted(key)
marcarWebhookError(key, error)
listarWebhookPendentes()
limparWebhookReceiptsExpirados()
```

Não criar novo módulo nesta PR.

## 13. Persistência do estado do usuário e conclusão

Sequência obrigatória ao concluir:

```text
processarMensagemWebhook retornou
-> persistirUsersAgora()
-> marcarWebhookCompleted()
-> persistir inbox
```

Falhas possíveis:

- crash antes de `persistirUsersAgora`: replay;
- crash depois de users e antes do receipt: replay possível;
- crash depois do receipt: não reprocessa.

Essa ordem prefere possível duplicação a perda.

Inverter a ordem criaria risco de:

1. marcar completed;
2. morrer;
3. perder mutação do usuário;
4. bloquear replay.

Isso seria perda lógica e é proibido.

## 14. Impacto em performance

### Custo por request

Antes do ACK haverá:

- serialização do arquivo de inbox;
- escrita;
- `fsync`;
- rename.

Estimativa local:

- poucos milissegundos em disco rápido;
- dezenas ou centenas em storage remoto/lento.

### Otimização mínima

Persistir todas as mensagens do mesmo POST em um único lote, não uma escrita
por mensagem.

### Crescimento

Receipts de 7 dias precisam de limpeza:

- na carga;
- antes de persistências periódicas;
- sem varrer a cada mensagem se o volume crescer.

### Estado de usuários

Arquivo separado evita reescrever `users-state.json` antes de cada ACK.

### Limites

Adicionar:

- tamanho máximo da inbox;
- idade máxima observável;
- contador de pendências;
- alerta quando disco ou serialização falhar.

Não descartar silenciosamente ao atingir limite. Retornar 503/500 para permitir
retry da Meta.

## 15. Dados pessoais e segurança local

A inbox contém payload ainda não processado.

Requisitos:

- modo de arquivo restrito;
- não logar payload;
- sanitizar `lastError`;
- remover payload após conclusão;
- não copiar raw body inteiro;
- não incluir tokens;
- backup protegido;
- retenção documentada.

## 16. Plano de rollback

### Rollback normal

1. pausar tráfego ou webhook;
2. aguardar `pending = 0` e `processing = 0`;
3. preservar cópia do arquivo de inbox;
4. implantar release anterior;
5. manter arquivo para auditoria;
6. reativar tráfego.

### Rollback com pendências

Não apagar a inbox.

Opções:

- corrigir e redeployar a versão durável;
- processar pendências por ferramenta operacional controlada;
- somente então voltar ao release anterior.

Voltar imediatamente ao código antigo com pendências significa abandonar
mensagens e viola o objetivo do hardening.

### Feature flag

Pode existir:

```text
WEBHOOK_DURABLE_INBOX_ENABLED=true
```

Uso recomendado:

- ativada em homologação;
- ativada no Go-Live;
- desligamento apenas emergencial e com tráfego pausado.

Não usar fallback automático para o modo não durável quando o disco falhar.
Falha de persistência deve causar HTTP 500/503.

### Compatibilidade de arquivo

- `schemaVersion` obrigatório;
- versão desconhecida deve impedir ACK/processamento;
- release anterior simplesmente ignora o arquivo, mas o rollback operacional
  não deve ocorrer enquanto houver pendências.

## 17. Testes necessários

### Recebimento

- mensagem nova é persistida antes do ACK;
- lote é persistido numa única escrita;
- falha de escrita retorna 500;
- duplicata pendente recebe 200 sem duplicar registro;
- duplicata concluída recebe 200 sem processar;
- payload inválido não cria registro.

### Crash/restart

- crash depois do ACK e antes do dreno;
- `pending` reaparece;
- `processing` vira `pending`;
- `completed` não reaparece;
- `error` preserva tentativa e backoff.

### Ordem

- duas mensagens do mesmo usuário mantêm ordem;
- usuários distintos não corrompem registros;
- novo webhook durante replay não inicia segundo dreno.

### Conclusão

- usuário é persistido antes do receipt;
- payload é removido;
- receipt é mantido;
- receipt expirado é limpo;
- erro não remove mensagem.

### Segurança

- arquivo não inclui tokens;
- erro é sanitizado;
- modo de arquivo é restrito quando suportado;
- payload concluído não permanece.

## 18. Observabilidade mínima

Sem criar nova plataforma, expor no `/health-interno`:

- `webhook_pending`;
- `webhook_processing`;
- `webhook_error`;
- `webhook_oldest_age_seconds`;
- `webhook_receipts`;
- `webhook_last_persist_error`.

Não expor:

- IDs;
- telefone;
- texto;
- nome;
- payload.

## Respostas finais

### A) Fluxo exato antes e depois da mudança

#### Antes

```text
assinatura
-> extrair
-> dedupe em memória
-> HTTP 200
-> setImmediate
-> fila/lock em memória
-> processar
-> persistência debounced
```

#### Depois

```text
assinatura
-> extrair
-> dedupe durável
-> registrar pending
-> fsync/rename
-> HTTP 200
-> dreno
-> marcar processing + persistir
-> fila/lock atuais
-> processar
-> persistir users
-> criar receipt completed
-> remover payload
-> persistir inbox
```

No restart:

```text
carregar users
-> carregar inbox
-> processing vira pending
-> iniciar servidor
-> drenar pendências
```

### B) Menor conjunto de arquivos que precisará ser alterado

Obrigatórios:

1. `server.js`;
2. `src/domain/state-persistence.js`;
3. `test/webhook-durability.test.js`.

Opcional:

4. `package.json`, somente para incluir o teste na suíte padrão.

Nenhum novo módulo de produção é necessário.

### C) Estimativa de linhas

| Arquivo | Adições/modificações estimadas |
|---|---:|
| `server.js` | 55–85 |
| `state-persistence.js` | 140–210 |
| Teste | 220–330 |
| `package.json` opcional | 1–2 |

Total: **416–627 linhas**.

Código de produção: aproximadamente **195–295 linhas**.

### D) Risco operacional

Classificação: **MÉDIO/ALTO**.

Principais riscos:

- aumento de latência antes do ACK;
- falha de disco bloquear webhook;
- replay duplicar efeito externo parcial;
- inbox crescer por poison message;
- payload sensível em disco;
- rollback com pendências;
- duas instâncias processarem o mesmo arquivo;
- erro de ordenação por usuário.

Mitigações:

- uma instância;
- volume persistente;
- escrita em lote;
- rollout por feature flag;
- número de homologação;
- limites e métricas;
- testes de crash;
- rollback somente com inbox drenada.

### E) Critérios objetivos para considerar o webhook durável

O webhook será considerado durável quando todos forem verdadeiros:

1. HTTP 200 só ocorre depois de escrita atômica e `fsync`.
2. Falha de persistência produz 500/503.
3. Mensagem pendente sobrevive restart.
4. Registro `processing` é retomado após restart.
5. Mensagem concluída não é reprocessada após restart.
6. Duplicata com mesmo `message.id` não cria segundo registro.
7. Erro mantém payload e tentativa.
8. Ordem de mensagens do mesmo usuário é preservada.
9. Estado do usuário é persistido antes do receipt de conclusão.
10. Payload concluído é removido.
11. Receipts sobrevivem restart e expiram conforme política.
12. Métricas não expõem dados pessoais.
13. Volume de produção é persistente.
14. Deploy opera com uma única instância.
15. Testes de crash antes/depois do ACK passam.
16. Teste de disco indisponível confirma que não há ACK falso.
17. Rollback com inbox vazia é validado.

## Decisão recomendada

Implementar a inbox em `state-persistence.js`, usando arquivo separado dentro
do `DATA_DIR`, sem alterar `processarInterno`.

Essa é a menor mudança que:

- elimina a perda entre ACK e processamento;
- reaproveita o filesystem e escrita atômica existentes;
- não introduz serviço novo;
- mantém fila, lock e regras atuais;
- permite rollback controlado.
