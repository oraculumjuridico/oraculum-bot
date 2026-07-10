# Auditoria arquitetural — `CONFIRMAR_ENTRADA`

## Escopo e localização

Arquivo auditado: `server.js`.

- Início exato: linha **13.147**
- Fim exato: linha **13.302**
- Tamanho atual: **156 linhas**
- Condição de entrada: `u.stage === STAGES.CONFIRMAR_ENTRADA`
- Próximo bloco: `NOVO CASO CONFIRMA`

As linhas são relativas ao estado atual do arquivo e podem mudar após novas edições.

## Responsabilidade atual

O bloco acumula quatro responsabilidades:

1. orientar o cliente a corrigir a informação pendente;
2. validar e reapresentar correções livres de nome, telefone ou cidade;
3. aceitar a informação pendente e encaminhar o fluxo conforme tipo e origem;
4. reapresentar a confirmação quando a entrada não é reconhecida.

O tipo da informação está em `u._entradaPendenteTipo`. A procedência do fluxo está em `u._entradaPendenteOrigem`.

## Mapa completo de caminhos

### 1. Payload `entrada_corrigir`

Linhas aproximadas: 13.148–13.159.

1. Renova o timer.
2. Se o atendimento não estiver em modo texto:
   - gera áudio TTS;
   - envia o áudio;
   - aguarda 3 segundos;
   - registra erro de TTS sem interromper o fluxo.
3. Retorna a orientação para informar o valor correto.

Não altera o stage nem limpa a entrada pendente.

### 2. Texto livre diferente dos payloads

Linhas aproximadas: 13.160–13.208.

Condição:

```js
text && text !== "entrada_ok" && text !== "entrada_corrigir"
```

#### 2.1. Correção de nome

Linhas aproximadas: 13.164–13.180.

1. Extrai nome de uma frase explícita de correção ou limpa/formata o texto.
2. Valida se o resultado aparenta ser um nome completo.
3. Quando válido:
   - grava `u._entradaPendenteValor`;
   - opcionalmente gera e envia áudio;
   - aguarda 4 segundos;
   - reapresenta o valor com o botão `entrada_ok`.
4. Quando inválido, cai na resposta comum de valor não identificado.

#### 2.2. Correção de telefone

Linhas aproximadas: 13.181–13.197.

1. Normaliza o telefone.
2. Exige ao menos 12 dígitos após normalização.
3. Quando válido:
   - grava `u._entradaPendenteValor`;
   - formata o número para exibição;
   - opcionalmente gera e envia áudio;
   - aguarda 4 segundos;
   - reapresenta o valor com o botão `entrada_ok`.
4. Quando inválido, cai na resposta comum de valor não identificado.

#### 2.3. Correção de cidade

Linhas aproximadas: 13.198–13.204.

1. Limpa a entrada pendente.
2. Altera o stage para `STAGES.ACOLHIMENTO_CIDADE`.
3. Renova o timer.
4. Reentra recursivamente em `processarInterno()` com uma mensagem textual sintética.

Essa recursão transfere a validação de cidade para o handler completo de cidade, incluindo CEP e IBGE.

#### 2.4. Texto livre inválido ou tipo desconhecido

Linhas aproximadas: 13.205–13.207.

1. Renova o timer.
2. Retorna a mensagem de informação não identificada.

### 3. Payload `entrada_ok`

Linhas aproximadas: 13.209–13.295.

Antes de decidir o destino:

1. captura `origem`, `tipo` e `valor`;
2. executa `limparEntradaPendente(u)`;
3. despacha conforme o tipo capturado.

#### 3.1. Aceitação de nome

Linhas aproximadas: 13.214–13.228.

1. Grava `u.nome`.
2. Marca `u.nomeConfirmado = true`.
3. Sincroniza contato e negócio, exceto durante novo caso para terceiro ainda sem WhatsApp.
4. Se a origem for `coleta_tel_outro`:
   - altera o stage para `coleta_tel_wpp`;
   - renova o timer;
   - envia orientação em áudio conforme o modo;
   - pede o WhatsApp da pessoa atendida.
5. Para as demais origens:
   - renova o timer;
   - delega para `flowAcolhimentoConfirmaWhatsapp`.

#### 3.2. Aceitação de telefone

Linhas aproximadas: 13.229–13.281.

Primeiro normaliza e grava `u.whatsappContato`.

##### Origem `coleta_tel_wpp_contato`

- Se nome e confirmação do nome já existem:
  - marca WhatsApp como verificado;
  - define se o telefone pertence ao cliente;
  - renova o timer;
  - delega para `flowAcolhimentoCidade` com `suprimirAudio: true`.
- Sem nome confirmado:
  - altera o stage para `coleta_nome`;
  - renova o timer;
  - solicita o nome completo.

##### Origem `coleta_tel_wpp`

1. Marca WhatsApp como verificado.
2. Define `telefoneEhDoCliente` conforme novo caso para terceiro.
3. Se `_corrigindoWhatsappConfirmacao` estiver ativo:
   - remove a flag;
   - retorna por `voltarParaConfirmacao`.
4. Se `_novoCasoParaTerceiro` estiver ativo:
   - altera o stage para `STAGES.ACOLHIMENTO_CIDADE`;
   - renova o timer;
   - opcionalmente envia áudio pedindo cidade;
   - retorna a tela de cidade da pessoa atendida.
5. Se `_novoCasoDeCliente` estiver ativo:
   - tenta aproveitar relato de áudio pendente;
   - se houver relato, retorna imediatamente;
   - caso contrário, altera o stage para `STAGES.AUDIO_AGUARDANDO`;
   - renova o timer;
   - envia orientação de relato;
   - retorna a tela de novo relato.
6. Fluxo comum:
   - altera o stage para `STAGES.ACOLHIMENTO_CIDADE`;
   - renova o timer;
   - opcionalmente envia áudio pedindo cidade;
   - retorna a tela de cidade do cliente.

##### Outras origens de telefone

1. Renova o timer.
2. Retorna `respostaRecomecoMenuPrincipal(u)`.

#### 3.3. Aceitação de cidade

Linhas aproximadas: 13.282–13.294.

1. Grava `u.cidade`.
2. Sincroniza contato e negócio.
3. Para origens de coleta legada de cidade:
   - renova o timer;
   - se já houver descrição ou transcrição, altera o stage para `STAGES.AUDIO_CONFIRMAR_DADOS` e apresenta os dados;
   - caso contrário, inicia o fluxo de relato sem boas-vindas.
4. Para outras origens:
   - delega para `flowAcolhimentoConfirmaWhatsapp`.

#### 3.4. Tipo ausente ou desconhecido

Não há retorno dentro do branch `entrada_ok`. O fluxo chega ao fallback genérico do próprio stage.

### 4. Resposta inválida, vazia ou tipo não reconhecido

Linhas aproximadas: 13.296–13.301.

1. Renova o timer.
2. Reapresenta a confirmação com o botão `entrada_ok`.

### 5. Stage não correspondente

O bloco não executa qualquer operação e o processamento segue para `NOVO CASO CONFIRMA`.

## Dependências diretas

### Estado e parâmetros

- `u`
- `text`
- `from`
- `STAGES`

### Parsers e formatadores

- `extrairNomeDaCorrecaoExplicita`
- `formatarNome`
- `limparTextoSomenteLetras`
- `ehNomeAparente`
- `normalizarTelefone`
- `formatarTelefoneExibicao`
- `normalizarNumeroWhatsAppEnvio`
- `primeiroNomeCliente`

### Estado e navegação

- `limparEntradaPendente`
- `setStage`
- `iniciarTimer`
- `respostaRecomecoMenuPrincipal`
- `processarInterno`

### Fluxos e telas

- `flowAcolhimentoConfirmaWhatsapp`
- `flowAcolhimentoCidade`
- `voltarParaConfirmacao`
- `aproveitarRelatoAudioClienteNovoCaso`
- `iniciarFluxoRelatoLivre`
- `telaConfirmarDadosAudio`

### Áudio e observabilidade

- `gerarAudioAtendente`
- `enviarAudio`
- `urlAudioAtendente`
- `enviarAudioModoVoz`
- `enviarAudioPedidoCidade`
- `setTimeout`
- `logErro`

### Sincronização

- `sincronizarContatoNegocioHubSpot`

## Chamadas externas

### Diretas

- TTS por `gerarAudioAtendente`;
- envio de mídia por `enviarAudio`;
- sincronização com HubSpot por `sincronizarContatoNegocioHubSpot`;
- envio de áudio por `enviarAudioModoVoz`;
- envio do pedido de cidade por `enviarAudioPedidoCidade`.

### Indiretas relevantes

- `voltarParaConfirmacao` sincroniza o negócio, renova timer e pode apresentar telas com áudio;
- `aproveitarRelatoAudioClienteNovoCaso` envia mensagem, classifica área e altera o fluxo;
- `iniciarFluxoRelatoLivre` altera stage, timer e pode enviar imagem/mensagem;
- `flowAcolhimentoCidade` pode gerar áudio e alterar stage;
- `flowAcolhimentoConfirmaWhatsapp` pode gerar áudio e alterar stage;
- `telaConfirmarDadosAudio` pode gerar e enviar áudio.

## Mutações diretas em `u`

- `u._entradaPendenteValor`
- `u.nome`
- `u.nomeConfirmado`
- `u.whatsappContato`
- `u.whatsappVerificado`
- `u.telefoneEhDoCliente`
- `u.cidade`
- remoção de `u._corrigindoWhatsappConfirmacao`

Por meio de `limparEntradaPendente(u)`:

- `u._entradaPendenteTipo = null`
- `u._entradaPendenteValor = null`
- `u._entradaPendenteOrigem = null`

Por meio de `setStage`, o bloco também altera `u.stage`.

Funções delegadas realizam mutações adicionais, mas elas não pertencem diretamente ao bloco.

## Timers e esperas

### Timer de sessão

`iniciarTimer(from)` é chamado nos seguintes caminhos:

- payload `entrada_corrigir`;
- correção livre inválida;
- redirecionamento de cidade;
- nome aceito com origem `coleta_tel_outro`;
- nome aceito nas demais origens;
- telefone de contato com nome confirmado;
- telefone de contato sem nome confirmado;
- novo caso para terceiro;
- novo caso de cliente sem relato pendente;
- fluxo comum após telefone;
- origem de telefone não reconhecida;
- cidade aceita em fluxo legado;
- fallback genérico.

Alguns fluxos delegados também renovam o timer internamente.

### Esperas de UX

- 3 segundos após orientação de correção;
- 4 segundos após reconfirmação de nome;
- 4 segundos após reconfirmação de telefone.

Essas esperas usam `setTimeout` dentro de `Promise`.

## Stages alterados diretamente

- `STAGES.ACOLHIMENTO_CIDADE`
- `coleta_tel_wpp`
- `coleta_nome`
- `STAGES.AUDIO_AGUARDANDO`
- `STAGES.AUDIO_CONFIRMAR_DADOS`

Stages adicionais podem ser alterados pelas funções delegadas.

## Recursão em `processarInterno()`

Existe um ponto explícito de recursão na correção de cidade, linha atual 13.203:

```js
return await processarInterno(
  from,
  u.nomeWA || "",
  text,
  { type: "text", text: { body: text } },
  u
)
```

Antes da recursão:

1. a entrada pendente é limpa;
2. o stage muda para `STAGES.ACOLHIMENTO_CIDADE`;
3. o timer é renovado.

Riscos:

- dependência circular se um futuro handler importar diretamente `processarInterno`;
- repetição de validações globais executadas no início de `processarInterno`;
- dificuldade para testar sem injetar uma função de reentrada;
- possibilidade de alteração de precedência se a recursão for substituída por chamada direta ao handler de cidade.

Uma extração deve receber a reentrada como dependência explícita, por exemplo `reprocessarMensagem`, sem importar `server.js`.

## Side effects consolidados

- mutação do usuário;
- transição de stage;
- renovação de timer;
- esperas temporizadas;
- geração e envio de áudio;
- sincronização com HubSpot;
- reentrada no dispatcher principal;
- chamadas a flows que também mutam estado e enviam mensagens;
- classificação e aproveitamento indireto de relato pendente;
- logs de falhas de TTS.

## Decomposição recomendada

### 1. `confirm-entry-correction-prompt-handler`

Responsabilidade:

- tratar exclusivamente o payload `entrada_corrigir`.

Dependências:

- `u`, `text`, `from`;
- `iniciarTimer`;
- TTS, envio de áudio, URL de áudio, espera e log.

Risco: **baixo/médio**.

Linhas removíveis estimadas: **10–12**.

### 2. `confirm-entry-corrected-value-handler`

Responsabilidade:

- tratar texto livre como novo valor pendente;
- despachar correção de nome, telefone ou cidade;
- produzir a resposta comum de valor inválido.

Dependências:

- parsers e formatadores de nome/telefone;
- TTS e envio;
- `limparEntradaPendente`;
- `setStage`, timer;
- função injetada de reentrada em `processarInterno`.

Risco: **médio/alto**, principalmente pela correção de cidade recursiva.

Linhas removíveis estimadas: **45–50**.

Subdivisão interna recomendada:

- `correct-pending-name`;
- `correct-pending-phone`;
- `redirect-pending-city`.

### 3. `confirm-entry-accept-name-handler`

Responsabilidade:

- aceitar nome pendente;
- sincronizar quando permitido;
- encaminhar para coleta de WhatsApp ou confirmação de WhatsApp.

Dependências:

- sincronização HubSpot;
- `setStage`, timer;
- `primeiroNomeCliente`;
- áudio e `flowAcolhimentoConfirmaWhatsapp`.

Risco: **médio**.

Linhas removíveis estimadas: **15–18**.

### 4. `confirm-entry-accept-phone-handler`

Responsabilidade:

- aceitar telefone;
- decidir destino conforme `_entradaPendenteOrigem`;
- tratar fluxos de terceiro, novo caso, correção de WhatsApp e fluxo comum.

Dependências:

- normalização de telefone;
- `setStage`, timer;
- flows de cidade e confirmação;
- áudio;
- aproveitamento de relato pendente;
- retorno à confirmação.

Risco: **alto**.

Linhas removíveis estimadas: **50–55**.

Subdivisão interna recomendada:

- `route-confirmed-contact-phone`;
- `route-confirmed-new-case-phone`;
- `route-confirmed-standard-phone`.

### 5. `confirm-entry-accept-city-handler`

Responsabilidade:

- aceitar cidade;
- sincronizar;
- decidir entre confirmação de dados, relato livre ou confirmação de WhatsApp.

Dependências:

- sincronização HubSpot;
- timer e `setStage`;
- `telaConfirmarDadosAudio`;
- `iniciarFluxoRelatoLivre`;
- `flowAcolhimentoConfirmaWhatsapp`.

Risco: **médio/alto**.

Linhas removíveis estimadas: **12–15**.

### 6. `confirm-entry-invalid-handler`

Responsabilidade:

- renovar o timer;
- reapresentar o botão `entrada_ok`.

Dependências:

- `iniciarTimer`.

Risco: **baixo**.

Linhas removíveis estimadas: **5–7**.

### 7. `confirm-entry-stage-handler`

Responsabilidade:

- verificar `STAGES.CONFIRMAR_ENTRADA`;
- capturar tipo, origem e valor antes da limpeza;
- ordenar os sub-handlers;
- devolver `{ handled, response }`.

Dependências:

- sub-handlers;
- `limparEntradaPendente`.

Risco: **médio** por controlar a precedência.

Linhas removíveis adicionais estimadas no `server.js`: **5–10**.

## Arquitetura proposta

```text
confirm-entry-stage-handler
├── correction-prompt
├── corrected-value
│   ├── pending-name
│   ├── pending-phone
│   └── pending-city/reentry
├── accept-entry
│   ├── accept-name
│   ├── accept-phone
│   └── accept-city
└── invalid-response
```

O handler de stage deve preservar o contrato:

```js
{ handled, response }
```

Todas as dependências com efeito devem entrar via contexto. Nenhum sub-handler deve importar `server.js`.

## Ordem recomendada de extração

1. `confirm-entry-invalid-handler`;
2. `confirm-entry-correction-prompt-handler`;
3. correção pendente de nome;
4. correção pendente de telefone;
5. redirecionamento de cidade com reentrada injetada;
6. `confirm-entry-accept-name-handler`;
7. `confirm-entry-accept-city-handler`;
8. rotas internas de telefone;
9. `confirm-entry-accept-phone-handler`;
10. `confirm-entry-stage-handler`.

Essa ordem começa pelos ramos sem integração e deixa o telefone, que concentra mais estados e destinos, para depois da caracterização.

## Menor PR segura possível

Extrair apenas o fallback genérico para `confirm-entry-invalid-handler`.

Escopo:

- stage já confirmado pelo chamador;
- entrada vazia ou não reconhecida;
- renovação do timer;
- retorno textual idêntico.

Ganho estimado: **5–7 linhas brutas**. O ganho líquido isolado será pequeno ou nulo, mas cria um primeiro contrato testável sem tocar em áudio, HubSpot, recursão ou seleção de caso.

Se a PR precisar produzir redução líquida relevante, o menor pacote recomendável é:

1. fallback inválido;
2. payload `entrada_corrigir`;
3. correção de nome;
4. correção de telefone.

Esse pacote remove aproximadamente **45–55 linhas brutas** e evita inicialmente a recursão de cidade e os caminhos de aceitação com integração.

## Estimativa de redução líquida

Extraindo o stage completo para um handler e deixando em `server.js` apenas montagem do contexto e delegação:

- remoção bruta: aproximadamente **156 linhas**;
- delegação e contexto no `server.js`: aproximadamente **20–30 linhas**;
- redução líquida estimada do `server.js`: **125–135 linhas**.

A decomposição aumenta o volume total do projeto por causa de contratos e testes, mas reduz significativamente a concentração de responsabilidades e a complexidade ciclomática de `processarInterno()`.
