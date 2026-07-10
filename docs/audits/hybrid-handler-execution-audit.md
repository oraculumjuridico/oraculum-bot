# Auditoria da execução híbrida de handlers

## Escopo e método

Auditoria estática do estado atual do repositório, sem alteração de código ou
testes. Foram considerados handlers:

- funções `handle*` que retornam `{ handled, response }`;
- routers extraídos que possuem o mesmo contrato e são usados como delegadores
  em `server.js`.

Não existe atualmente o diretório `src/domain/client/handlers/`. Portanto, os
handlers atômicos associados aos `nextAction` do intake ainda não existem. A
execução ativa continua baseada nos handlers de stage e routers listados abaixo.

## Semântica de fallback encontrada

O padrão atual do `server.js` é:

```js
const resultado = await handler(ctx)
if (resultado.handled) return resultado.response
```

Assim, o código subsequente funciona como fallback somente quando
`handled === false`. Exceções lançadas pelo handler são propagadas ao tratamento
global de `processarComLock`; elas não acionam o branch legacy imediatamente
posterior.

Não foi encontrada execução paralela de handler e branch legacy. O risco
relevante ocorre quando um handler altera estado e, depois disso, retorna
`handled: false`.

## Inventário e classificação

### 1. `handleAudioIntake`

- **Arquivo:** `src/domain/audio/audio-intake-pipeline-router.js`
- **Chamada:** `server.js`, aproximadamente linhas 8298–8330, dentro de
  `processarMidia`.
- **Responsabilidade:** upload opcional, transcrição, classificação de intenção
  do áudio, observação documental, novo caso, urgência, descrição e resposta
  final de áudio recebido.
- **Side effects:** upload no Drive; transcrição externa; notas HubSpot;
  chamadas a fluxos de intenção; envio de áudio/telas; timers; `setStage`;
  `salvarEtapa`; mutações em campos temporários de áudio e documentos de `u`.
- **Primeiro side effect:** para áudio elegível, `uploadPastaAudio` quando há
  pasta aplicável; nos demais casos, `transcrever`.
- **Fallback após side effect:** não. O único `handled: false` ocorre na guarda
  inicial `!ehAudio`, antes de I/O ou mutação. Depois de aceitar áudio, todos os
  retornos normais são `handled: true`; erros são propagados.
- **Duplicação possível:** não foi identificado caminho normal que repita
  mensagem, upload, nota ou persistência via fallback.
- **Classificação:** **SEGURO**.

### 2. `handleAudioConfirmation`

- **Arquivo:** `src/domain/stage-handlers/audio-confirmation-handler.js`
- **Chamada:** `server.js`, aproximadamente linhas 11516–11535.
- **Responsabilidade:** confirmar, refazer ou corrigir transcrição e avançar para
  confirmação de área.
- **Side effects:** `setStage`; timer; classificação externa; mutações da
  classificação jurídica e de `_audioCanalTranscricao`; geração e envio de TTS.
- **Primeiro side effect:** após a guarda de stage, varia por caminho:
  `iniciarTimer`, `classificarAreaAudio`, `setStage` ou atribuição em
  `_audioCanalTranscricao`.
- **Fallback após side effect:** não. Stage não correspondente retorna
  `handled: false` antes de qualquer efeito. Falhas de classificação são
  propagadas. Falhas de TTS são registradas e o handler retorna `handled: true`.
- **Duplicação possível:** não; o tratamento local de erro de TTS não libera o
  legacy.
- **Classificação:** **SEGURO**.

### 3. `handleDescriptionConfirmation`

- **Arquivo:** `src/domain/stage-handlers/description-confirmation-handler.js`
- **Chamada:** `server.js`, aproximadamente linhas 13299–13311.
- **Responsabilidade:** confirmar ou corrigir a descrição/transcrição.
- **Side effects:** mutações de `descricao`, `_descTemp` e buffers de áudio;
  `sincronizarNegocio`; mudança de etapa; timer.
- **Primeiro side effect:** em confirmação, atribuição de `u.descricao`; em
  correção, inclusão em `audiosDescCorrigidos` ou limpeza de temporários; no
  fallback visual, timer.
- **Fallback após side effect:** não. Apenas stage não correspondente retorna
  `handled: false`, antes de qualquer efeito.
- **Duplicação possível:** não foi encontrado caminho de reexecução legacy após
  sincronização ou mutação.
- **Classificação:** **SEGURO**.

### 4. `handleConfirmEntryCorrection`

- **Arquivo:** `src/domain/stage-handlers/confirm-entry-correction-handler.js`
- **Chamada:** `server.js`, aproximadamente linhas 13087–13099.
- **Responsabilidade:** tratar o payload legado `entrada_corrigir`.
- **Side effects:** timer; geração e envio de áudio.
- **Primeiro side effect:** `iniciarTimer`, após validar stage e payload.
- **Fallback após side effect:** não. A recusa ocorre integralmente na guarda
  inicial. Erro de TTS é absorvido, mas o resultado continua `handled: true`.
- **Duplicação possível:** não.
- **Classificação:** **SEGURO**.

### 5. `handleConfirmEntryCorrectedName`

- **Arquivo:** `src/domain/stage-handlers/confirm-entry-corrected-name-handler.js`
- **Chamada:** `server.js`, aproximadamente linhas 13105–13120.
- **Responsabilidade:** validar e reconfirmar nome corrigido.
- **Side effects:** atribuição de `_entradaPendenteValor`; geração e envio de
  áudio.
- **Primeiro side effect:** atribuição de `_entradaPendenteValor`, somente após
  todas as guardas e validações puras.
- **Fallback após side effect:** não. Nome não aplicável ou inválido retorna
  `handled: false` antes da mutação. Falha de TTS mantém `handled: true`.
- **Duplicação possível:** não.
- **Classificação:** **SEGURO**.

### 6. `handleConfirmEntryPhone`

- **Arquivo:** `src/domain/stage-handlers/confirm-entry-phone-handler.js`
- **Chamada:** `server.js`, aproximadamente linhas 13122–13135.
- **Responsabilidade:** validar e reconfirmar telefone corrigido.
- **Side effects:** atribuição de `_entradaPendenteValor`; geração e envio de
  áudio.
- **Primeiro side effect:** atribuição de `_entradaPendenteValor`, após
  normalização e validação puras.
- **Fallback após side effect:** não. Telefone não aplicável ou inválido retorna
  `handled: false` antes da mutação. Falha de TTS mantém `handled: true`.
- **Duplicação possível:** não.
- **Classificação:** **SEGURO**.

### 7. `handleConfirmEntryFinalAcceptance`

- **Arquivo:** `src/domain/stage-handlers/confirm-entry-final-acceptance-handler.js`
- **Chamada:** `server.js`, aproximadamente linhas 13148–13169.
- **Responsabilidade:** aplicar definitivamente nome, telefone ou cidade
  pendente e continuar o fluxo correspondente.
- **Side effects:** limpeza da entrada pendente; mutações extensas em `u`;
  sincronização HubSpot; stages; timers; envio de áudio; chamadas a flows.
- **Primeiro side effect:** `limparEntradaPendente(u)`, imediatamente após
  confirmar stage e `entrada_ok`.
- **Fallback após side effect:** **sim**. Se `_entradaPendenteTipo` não for
  `nome`, `telefone` ou `cidade`, o handler já limpou a entrada pendente e termina
  com `{ handled: false, response: null }`.
- **Consequência:** o `server.js` chama em seguida
  `handleConfirmEntryInvalid`, que inicia timer e devolve retry. Portanto existe
  reexecução/fallback após mutação observável.
- **Duplicação de mensagens:** não há duplicação determinística da mesma
  mensagem, mas há execução de fallback após alteração de estado.
- **Duplicação de persistência/sincronização:** não no caminho de tipo
  desconhecido, porque ele retorna antes dessas chamadas. Nos caminhos
  reconhecidos, erros posteriores são propagados e não liberam fallback.
- **Classificação:** **INCOMPATÍVEL**.

### 8. `handleConfirmEntryInvalid`

- **Arquivo:** `src/domain/stage-handlers/confirm-entry-invalid-handler.js`
- **Chamada:** `server.js`, aproximadamente linhas 13172–13178.
- **Responsabilidade:** retry final para entrada não reconhecida.
- **Side effects:** timer.
- **Primeiro side effect:** `iniciarTimer`, após a guarda de stage.
- **Fallback após side effect:** não. Quando aplicável, sempre retorna
  `handled: true`.
- **Duplicação possível:** isoladamente não; ele evidencia o problema do handler
  anterior quando é alcançado após a limpeza indevida da entrada pendente.
- **Classificação:** **SEGURO** isoladamente.

### 9. `processarColetaLegada` (`criarLegacyIntakeRouter`)

- **Arquivo:** `src/domain/legacy-intake-router.js`
- **Chamada:** `server.js`, aproximadamente linhas 13295–13296.
- **Responsabilidade:** stages legados de nome, região, UF, cidade,
  contribuição, benefício e descrição.
- **Side effects:** validação; mutações cadastrais; stages; timers; preparação de
  confirmação; entrada em descrição.
- **Primeiro side effect:** depende do stage. Entradas inválidas geralmente
  iniciam timer; entradas válidas mutam `u`/stage ou chamam
  `prepararConfirmacaoEntrada`.
- **Fallback após side effect:** não. O retorno final `handled: false` só é
  alcançado quando nenhum stage foi reconhecido. Cada stage reconhecido retorna
  `handled: true`, inclusive em entrada inválida.
- **Duplicação possível:** não foi encontrado caminho de fallback legacy após
  mutação; exceções são propagadas.
- **Classificação:** **SEGURO**.

### 10. `processarPosAudio` (`criarPostAudioRouter`)

- **Arquivo:** `src/domain/post-audio-router.js`
- **Chamada:** `server.js`, aproximadamente linhas 13417–13418.
- **Responsabilidade:** continuar, recomeçar, encerrar, aplicar sugestão ou
  retomar descrição depois de áudio.
- **Side effects:** limpeza de temporários; stages; timers; sincronização do
  negócio; chamadas a fluxos externos.
- **Primeiro side effect:** nos caminhos reconhecidos, limpeza/mutação de `u`,
  `setStage`, timer ou chamada ao fluxo escolhido.
- **Fallback após side effect:** não. Em `SUGESTAO_FLUXO_OUTRO`, texto não
  reconhecido retorna `handled: false`, mas nenhuma mutação ocorreu antes. Nos
  demais caminhos aplicáveis, o retorno é `handled: true`; erros de
  sincronização/fluxo são propagados.
- **Duplicação possível:** não foi identificado caminho que repita sincronização
  ou mensagens pelo legacy.
- **Classificação:** **SEGURO**.

### 11. `processarNavegacaoCliente` (`criarClientNavigationRouter`)

- **Arquivo:** `src/domain/client-navigation-router.js`
- **Chamada:** `server.js`, aproximadamente linhas 13421–13422.
- **Responsabilidade:** início, retorno, menu do caso existente e abertura de
  novo caso.
- **Side effects:** stages; timers; chamadas a menu, novo caso ou relato livre.
- **Primeiro side effect:** em `inicio`, `setStage` quando há menu disponível ou
  chamada direta ao fluxo de relato; em `inicio_retorno`, mudança de stage/timer
  ou chamada ao fluxo selecionado.
- **Fallback após side effect:** não. Opção não reconhecida em
  `inicio_retorno` retorna `handled: false` sem efeitos prévios.
- **Duplicação possível:** não foi encontrado caminho de mensagem ou persistência
  duplicada via fallback.
- **Classificação:** **SEGURO**.

## Matriz de riscos de duplicação

| Componente | Mensagem duplicada | Persistência duplicada | Sincronização duplicada | Legacy após mutação |
|---|---:|---:|---:|---:|
| `handleAudioIntake` | Não identificado | Não identificado | Não identificado | Não |
| `handleAudioConfirmation` | Não identificado | Não identificado | Não identificado | Não |
| `handleDescriptionConfirmation` | Não identificado | Não identificado | Não identificado | Não |
| `handleConfirmEntryCorrection` | Não identificado | Não identificado | Não identificado | Não |
| `handleConfirmEntryCorrectedName` | Não identificado | Não identificado | Não identificado | Não |
| `handleConfirmEntryPhone` | Não identificado | Não identificado | Não identificado | Não |
| `handleConfirmEntryFinalAcceptance` | Retry após mutação, não mensagem idêntica | Não identificado | Não identificado | **Sim** |
| `handleConfirmEntryInvalid` | Não isoladamente | Não | Não | Não |
| `processarColetaLegada` | Não identificado | Não identificado | Não identificado | Não |
| `processarPosAudio` | Não identificado | Não identificado | Não identificado | Não |
| `processarNavegacaoCliente` | Não identificado | Não identificado | Não identificado | Não |

## Respostas finais

### A) Quantos handlers já estão compatíveis?

**10 de 11** componentes com semântica de handler estão compatíveis com a regra
de fallback híbrido.

Também é importante registrar que existem **zero handlers atômicos de intake**
em `src/domain/client/handlers/`; a migração híbrida descrita para os novos
`nextAction` ainda não começou fisicamente.

### B) Quais handlers bloqueiam a Fase 2?

O bloqueador concreto é:

- `handleConfirmEntryFinalAcceptance`

Ele limpa a entrada pendente antes de verificar se o tipo é reconhecido e pode
retornar `handled: false` depois dessa mutação.

Os demais componentes auditados não liberam fallback depois do primeiro efeito.

### C) Qual é a menor PR segura para iniciar a migração?

Alterar somente `handleConfirmEntryFinalAcceptance` para validar o tipo pendente
antes de `limparEntradaPendente(u)`, mantendo todos os caminhos e respostas
inalterados. O teste deve caracterizar especificamente:

1. tipo reconhecido continua executando normalmente;
2. tipo desconhecido retorna `handled: false`;
3. tipo desconhecido preserva integralmente os campos `_entradaPendente*`;
4. o fallback subsequente pode então ocorrer sem efeito anterior.

Essa PR estabelece a invariável necessária antes de introduzir qualquer handler
híbrido novo.

### D) Qual handler deve ser migrado primeiro?

Depois da correção acima, o primeiro candidato deve ser
`revalidate_name_confirm`, porque:

- possui guarda exata por stage e payload;
- a validação de aplicabilidade ocorre antes das mutações;
- seu primeiro efeito pode ser claramente delimitado;
- não exige download, transcrição, upload, sincronização ou múltiplas
  integrações;
- permite validar o protocolo `success: false` sem efeito e `success: true`
  depois do início da execução com risco baixo.

## Conclusão

A base atual já usa delegação exclusiva com retorno imediato para a maioria dos
handlers, e não execução paralela handler+legacy. O risco sistêmico de duplicação
não está disseminado: ele se concentra no retorno `handled: false` após limpeza
de estado em `handleConfirmEntryFinalAcceptance`.

A Fase 2 não deve iniciar antes de remover esse único caminho de fallback após
mutação e de adicionar testes que tornem essa invariável explícita.
