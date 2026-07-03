# Auditoria da correção recursiva de cidade em `CONFIRMAR_ENTRADA`

## Escopo

Esta auditoria cobre exclusivamente o redirecionamento de correção textual de
cidade ainda inline no stage `CONFIRMAR_ENTRADA`.

Não inclui:

- retry textual inválido;
- confirmação final;
- correções de nome ou telefone;
- implementação de handler;
- remoção de legacy.

## 1. Linhas exatas restantes

No estado atual de `server.js`, o bloco ocupa as linhas **13175–13181**:

```js
if (tipo === "cidade") {
  // Para cidade, redireciona para o handler completo de cidade (com IBGE, CEP etc.)
  limparEntradaPendente(u)
  setStage(u, STAGES.ACOLHIMENTO_CIDADE)
  iniciarTimer(from)
  return await processarInterno(
    from,
    u.nomeWA || "",
    text,
    { type: "text", text: { body: text } },
    u
  )
}
```

O bloco fica depois das tentativas de correção de nome e telefone e antes do
handler híbrido de retry inválido.

## 2. Fluxo completo de execução

### Pré-condições externas ao bloco

O fluxo só chega ao bloco quando:

1. `u.stage === STAGES.CONFIRMAR_ENTRADA`;
2. existe `text`;
3. `text` não é `entrada_ok`;
4. `text` não é `entrada_corrigir`;
5. `u._entradaPendenteTipo` foi capturado em `tipo`;
6. `handleConfirmEntryCorrectedName` não tratou a entrada;
7. `handleConfirmEntryPhone` não tratou a entrada;
8. `tipo === "cidade"`.

Essa precedência é relevante: cidade é avaliada somente depois dos dois
handlers de correção já existentes.

### Execução local

1. remove a confirmação pendente por `limparEntradaPendente(u)`;
2. muda o stage para `ACOLHIMENTO_CIDADE`;
3. inicia timer;
4. cria um novo payload textual com o mesmo `text`;
5. chama recursivamente `processarInterno`;
6. aguarda e retorna a resposta da chamada recursiva sem transformação.

### Execução recursiva

A nova invocação entra em `processarInterno` aproximadamente na linha 9870 e,
antes de alcançar o branch de cidade:

1. sanitiza novamente `text`;
2. define `u.ultimaMsg = Date.now()`;
3. define `u.modoDigitando = false`;
4. recalcula `u.temCadastroCompleto`;
5. chama `limparTimer(u)`;
6. chama `limparTimerIncentivoDescricao(u)`;
7. registra `_stageRetomadaOriginal` se aplicável;
8. atravessa as guardas e routers anteriores na ordem normal;
9. recalcula as decisões de intake;
10. alcança o fluxo `COLLECT_CITY` textual em
   `ACOLHIMENTO_CIDADE`.

O processamento completo de cidade então pode:

- tratar seleção/negação de cidades homônimas;
- confirmar temporários de cidade/UF/região;
- buscar CEP;
- buscar cidade por nome;
- enviar a mensagem “Buscando sua cidade”;
- consultar serviços geográficos;
- gerar/enviar áudio;
- iniciar timers;
- preencher temporários;
- sincronizar contato/negócio;
- avançar para a resposta posterior à cidade.

## 3. Ponto de recursão

O ponto exato está na linha aproximada **13180**:

```js
return await processarInterno(
  from,
  u.nomeWA || "",
  text,
  { type: "text", text: { body: text } },
  u
)
```

Parâmetros preservados:

- mesmo `from`;
- `nomeWA` obtido de `u.nomeWA`, com fallback `""`;
- mesmo texto informado pelo cliente;
- payload sintético com `type: "text"`;
- mesma referência de `u`.

A identidade de `u` e o formato exato do payload são parte do comportamento.

## 4. Side effects antes da recursão

### 4.1 Limpeza da entrada pendente

`limparEntradaPendente(u)` remove os campos temporários de confirmação, incluindo:

- `_entradaPendenteTipo`;
- `_entradaPendenteValor`;
- `_entradaPendenteOrigem`;
- demais campos tratados pelo helper atual.

Esse é o primeiro side effect.

### 4.2 Mudança de stage

`setStage(u, STAGES.ACOLHIMENTO_CIDADE)`:

- altera `u.stage`;
- registra transição;
- dispara `void atualizarDealstage(u)` conforme a implementação atual de
  `setStage`.

Portanto, a mudança de stage possui também uma consequência externa assíncrona.

### 4.3 Timer

`iniciarTimer(from)` altera o estado operacional do usuário e agenda os timers
atuais.

Logo depois, a entrada recursiva chama `limparTimer(u)`. Essa sequência
aparentemente redundante faz parte do comportamento vigente e não pode ser
otimizada durante a extração.

## 5. Side effects depois da recursão

Não existe efeito local depois do `await`: a resposta recursiva é retornada
diretamente.

Dentro da chamada recursiva, contudo, podem ocorrer:

- mutações operacionais no início de `processarInterno`;
- limpeza de timers;
- mensagens WhatsApp;
- TTS;
- consultas de CEP/cidade;
- sincronização HubSpot;
- alterações de stage;
- atualizações de cidade, UF, região e temporários;
- timers do fluxo de cidade.

Esses efeitos são transitivos e pertencem ao processamento normal de
`ACOLHIMENTO_CIDADE`.

## 6. Mutações em `u`

### Antes da recursão

- limpeza de `_entradaPendente*`;
- `stage = STAGES.ACOLHIMENTO_CIDADE`;
- alterações operacionais produzidas por `iniciarTimer`.

### No início da recursão

- `ultimaMsg`;
- `modoDigitando`;
- `temCadastroCompleto`;
- possíveis campos de retomada;
- limpeza/reconfiguração de timers.

### No fluxo de cidade

Conforme a entrada:

- `_cidadesMultiplas`;
- `_cidadeTemp`;
- `_ufTemp`;
- `_regiaoTemp`;
- `_cidadeAudioTemp`;
- `_ufAudioTemp`;
- `_regiaoAudioTemp`;
- `cidade`;
- `uf`;
- `regiao`;
- `_revalidaConfirmados`;
- stages e flags utilizados pela continuidade.

## 7. Timers

Há dois momentos relevantes:

1. `iniciarTimer(from)` imediatamente antes da recursão;
2. `limparTimer(u)` no início da chamada recursiva.

O fluxo de cidade pode posteriormente iniciar um novo timer.

Uma extração 1:1 deve manter essa ordem exata. Remover o primeiro timer ou
adiá-lo para depois da recursão seria otimização comportamental fora do escopo.

## 8. Mudanças de stage

Mudança direta:

```text
CONFIRMAR_ENTRADA → ACOLHIMENTO_CIDADE
```

O processamento recursivo pode reafirmar `ACOLHIMENTO_CIDADE` durante
confirmações e buscas ou avançar conforme o resultado e a confirmação do
cliente.

## 9. Sincronizações

Não há chamada explícita de sincronização nas sete linhas auditadas.

Entretanto:

- `setStage` dispara atualização de dealstage de forma assíncrona;
- o fluxo recursivo de cidade pode chamar
  `sincronizarContatoNegocioHubSpot(u)` após confirmação;
- o tratamento externo de `processarComLock` pode sincronizar estado ao final
  se detectar alteração relevante.

Portanto, a extração deve tratar sincronização como efeito transitivo real.

## 10. Dependências externas

Dependências diretas:

- `u`;
- `tipo`;
- `text`;
- `from`;
- `STAGES.ACOLHIMENTO_CIDADE`;
- `limparEntradaPendente`;
- `setStage`;
- `iniciarTimer`;
- `processarInterno`.

Dependências indiretas da recursão:

- sanitização e classificação de entrada;
- routers de intake;
- busca de CEP e cidade;
- WhatsApp/TTS;
- HubSpot;
- timers;
- flows de continuidade após cidade.

## Riscos de regressão

### Alto — fallback após limpeza

Se um handler híbrido limpar a entrada pendente e depois retornar
`success: false`, o branch legacy repetirá:

- limpeza;
- stage;
- timer;
- recursão.

Isso viola diretamente a regra de não fallback depois do primeiro efeito.

### Alto — captura de erro após efeito

Qualquer `try/catch` que converta erro de `setStage`, timer ou recursão em
`success: false` causará reexecução legacy. Após
`limparEntradaPendente`, todo erro deve ser propagado.

### Alto — mudança do payload recursivo

Alterar `type`, `text.body`, `nomeWA`, `from` ou identidade de `u` pode fazer o
input passar por guards diferentes.

### Médio — ordem timer/recursão

O timer iniciado antes da recursão é limpo na nova entrada. Apesar de parecer
dispensável, removê-lo pode alterar flags, persistência ou comportamento
observável.

### Médio — `setStage` possui efeito externo

Além da mutação local, `setStage` dispara atualização de dealstage. Duplicar a
chamada pode gerar atualizações externas repetidas.

### Médio — precedência dos validadores

O handler de cidade deve continuar sendo tentado apenas depois das correções de
nome e telefone.

## Respostas

### A) A recursão pode ser isolada sem alterar comportamento?

**Sim**, desde que seja movida integralmente com:

- a mesma guarda de aplicabilidade;
- a limpeza antes do stage;
- o mesmo stage;
- o timer antes da recursão;
- os mesmos argumentos e payload;
- `await` e retorno direto da resposta.

Não deve ser substituída por chamada direta ao branch de cidade nesta fase:
isso pularia os efeitos iniciais e guards de `processarInterno`.

### B) Existe risco de duplicação de efeitos no modo híbrido?

**Sim, risco alto** se o handler liberar fallback depois de
`limparEntradaPendente`.

Duplicações possíveis:

- atualização de stage/dealstage;
- timers;
- execução completa da recursão;
- mensagens e buscas geográficas;
- sincronizações posteriores.

O risco é controlável com uma única guarda pura antes da limpeza e sem captura
de erros após ela.

### C) É possível transformar esse fluxo em handler híbrido?

**Sim.**

O handler deve:

1. validar aplicabilidade antes de qualquer efeito;
2. retornar `success: false` somente nessa guarda;
3. executar as cinco operações atuais na mesma ordem;
4. retornar `success: true` com a resposta recursiva;
5. propagar qualquer erro após a limpeza.

O branch legacy deve permanecer logo abaixo durante a estabilização.

### D) Qual contrato mínimo seria necessário?

```js
async function handle({
  u,
  tipo,
  texto,
  from,
  stages,
  limparEntradaPendente,
  setStage,
  iniciarTimer,
  processarInterno
}) {
  if (
    u.stage !== stages.CONFIRMAR_ENTRADA ||
    !texto ||
    tipo !== "cidade"
  ) {
    return { success: false, response: null }
  }

  limparEntradaPendente(u)
  setStage(u, stages.ACOLHIMENTO_CIDADE)
  iniciarTimer(from)

  return {
    success: true,
    response: await processarInterno(
      from,
      u.nomeWA || "",
      texto,
      { type: "text", text: { body: texto } },
      u
    )
  }
}

module.exports = { handle }
```

Na integração real, a função recursiva pode ser injetada com nome mais explícito,
mas deve continuar apontando para o mesmo `processarInterno` e não envolver
`try/catch`.

### E) Qual redução líquida estimada seria obtida?

O bloco legacy possui **7 linhas físicas**, incluindo guarda e comentário.

Durante a fase híbrida:

- nenhuma linha legacy pode ser removida;
- o servidor ganhará importação e chamada do handler;
- a redução líquida imediata será negativa.

Após estabilização e remoção definitiva do legacy:

- serão removidas 7 linhas do bloco;
- a chamada híbrida permanecerá;
- isoladamente, a quantidade física de linhas do servidor provavelmente ainda
  será semelhante ou ligeiramente maior;
- o ganho principal será redução de lógica de negócio inline, não contagem
  bruta.

Uma redução líquida relevante só surgirá quando a futura camada de execução
consolidar imports, chamadas e injeção de dependências.

### F) Após essa extração, `CONFIRMAR_ENTRADA` estaria efetivamente esgotado?

**Não durante a fase híbrida.**

Ainda permaneceriam:

- o branch legacy de cidade, por exigência de fallback;
- o branch legacy do retry inválido, também preservado na migração híbrida;
- a orquestração dos handlers já extraídos;
- o guard de texto livre e a captura de tipo/origem.

Depois de estabilizar os handlers de retry e cidade e remover os dois legacies,
o stage ficaria praticamente esgotado de lógica de negócio inline. Restaria a
orquestração, que só deve ser reduzida na futura camada de execução.

## Recomendação técnica

A correção recursiva de cidade é extraível, mas deve ser uma PR isolada e
tratada como risco médio/alto. Os testes precisam caracterizar:

1. recusa sem efeitos para tipo diferente;
2. ordem exata: limpeza → stage → timer → recursão;
3. identidade de `u`;
4. payload textual exato;
5. resposta recursiva, inclusive `undefined`;
6. propagação de erro em cada ponto depois do primeiro efeito;
7. ausência de fallback depois de qualquer mutação.
