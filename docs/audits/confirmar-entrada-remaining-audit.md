# Reauditoria — remanescente de `CONFIRMAR_ENTRADA`

## Estado atual

Arquivo: `server.js`.

- Início do stage: linha **13.149**
- Fim do stage: linha **13.308**
- Tamanho total atual: **160 linhas**
- Núcleo ainda inline: aproximadamente **136 linhas**

O tamanho total inclui as delegações já extraídas:

- `handleConfirmEntryCorrection`, linhas 13.150–13.162;
- `handleConfirmEntryInvalid`, linhas 13.301–13.307.

O stage continua na mesma posição de precedência, entre a validação de opções da pergunta anterior e `NOVO CASO CONFIRMA`.

## Fluxos já extraídos

### Pedido explícito de correção

Handler: `confirm-entry-correction-handler.js`.

Responsabilidade:

- reconhecer `entrada_corrigir`;
- renovar o timer;
- orientar por texto;
- opcionalmente orientar por áudio;
- manter o stage `CONFIRMAR_ENTRADA`.

### Fallback inválido

Handler: `confirm-entry-invalid-handler.js`.

Responsabilidade:

- tratar entrada não consumida pelos demais caminhos;
- renovar o timer;
- reapresentar o botão `entrada_ok`;
- preservar o stage.

## Fluxos que permanecem inline

## 1. Correção livre de valor pendente

Linhas: **13.164–13.212**.

Condição:

```js
text && text !== "entrada_ok" && text !== "entrada_corrigir"
```

O fluxo lê:

- `u._entradaPendenteTipo`;
- `u._entradaPendenteOrigem`.

### 1.1. Correção livre de nome

Linhas: **13.168–13.184**.

Responsabilidade:

1. extrair nome explícito ou limpar e formatar o texto;
2. validar se aparenta ser nome completo;
3. gravar `u._entradaPendenteValor`;
4. opcionalmente gerar áudio;
5. aguardar 4 segundos;
6. reapresentar o valor com `entrada_ok`.

Dependências:

- `extrairNomeDaCorrecaoExplicita`;
- `formatarNome`;
- `limparTextoSomenteLetras`;
- `ehNomeAparente`;
- `gerarAudioAtendente`;
- `enviarAudio`;
- `urlAudioAtendente`;
- `setTimeout`;
- `logErro`.

Mutações:

- `u._entradaPendenteValor`.

Stage:

- permanece `CONFIRMAR_ENTRADA`.

Timer de sessão:

- não chama `iniciarTimer` quando o nome é válido;
- o caminho inválido cai no retry comum, que renova o timer.

Risco: **baixo/médio**.

Linhas removíveis estimadas: **16–18**.

Extração isolada: **sim**. É o menor subfluxo restante com fronteira clara.

### 1.2. Correção livre de telefone

Linhas: **13.185–13.201**.

Responsabilidade:

1. normalizar o telefone;
2. validar quantidade mínima de dígitos;
3. gravar `u._entradaPendenteValor`;
4. formatar o valor para exibição;
5. opcionalmente gerar áudio;
6. aguardar 4 segundos;
7. reapresentar o valor com `entrada_ok`.

Dependências:

- `normalizarTelefone`;
- `formatarTelefoneExibicao`;
- TTS, envio de áudio, URL, espera e log.

Mutações:

- `u._entradaPendenteValor`.

Stage:

- permanece `CONFIRMAR_ENTRADA`.

Timer de sessão:

- não chama `iniciarTimer` quando o telefone é válido;
- o caminho inválido cai no retry comum.

Risco: **médio**.

Linhas removíveis estimadas: **16–18**.

Extração isolada: **sim**, desde que os testes fixem normalização, quantidade de dígitos, texto e áudio.

### 1.3. Correção livre de cidade

Linhas: **13.202–13.208**.

Responsabilidade:

1. limpar entrada pendente;
2. alterar o stage para `STAGES.ACOLHIMENTO_CIDADE`;
3. renovar o timer;
4. reentrar em `processarInterno()` com mensagem textual sintética.

Dependências:

- `limparEntradaPendente`;
- `setStage`;
- `iniciarTimer`;
- `processarInterno`.

Mutações:

- limpa `_entradaPendenteTipo`, `_entradaPendenteValor` e `_entradaPendenteOrigem`;
- altera `u.stage`.

Stage resultante:

- `STAGES.ACOLHIMENTO_CIDADE`.

Recursão:

- direta em `processarInterno()`.

Risco: **alto**.

Linhas removíveis estimadas: **6–8**.

Extração isolada: **tecnicamente possível**, mas não recomendada antes de introduzir uma dependência explícita de reentrada, como `reprocessarMensagem`.

### 1.4. Retry de valor não identificado

Linhas: **13.209–13.211**.

Responsabilidade:

- renovar timer;
- informar que o valor não foi identificado.

Dependências:

- `iniciarTimer`.

Mutações:

- nenhuma direta.

Risco: **baixo**.

Linhas removíveis estimadas: **3–4**.

Extração isolada: possível, mas pequena demais para justificar uma PR sozinha.

## 2. Aceitação final — payload `entrada_ok`

Linhas: **13.213–13.299**.

Antes do despacho:

1. captura `origem`, `tipo` e `valor`;
2. executa `limparEntradaPendente(u)`;
3. decide o destino usando os valores capturados.

Essa ordem é crítica. Limpar antes de capturar altera o comportamento.

## 2.1. Aceitação de nome

Linhas: **13.218–13.232**.

Responsabilidade:

- gravar nome confirmado;
- sincronizar quando permitido;
- encaminhar para telefone de terceiro ou confirmação do WhatsApp.

Dependências:

- `sincronizarContatoNegocioHubSpot`;
- `setStage`;
- `iniciarTimer`;
- `primeiroNomeCliente`;
- `enviarAudioModoVoz`;
- `flowAcolhimentoConfirmaWhatsapp`.

Chamadas externas:

- HubSpot, por `sincronizarContatoNegocioHubSpot`;
- áudio, por `enviarAudioModoVoz`.

Mutações:

- `u.nome`;
- `u.nomeConfirmado`;
- `u.stage`, quando a origem é `coleta_tel_outro`.

Stages:

- `coleta_tel_wpp`, para terceiro;
- stage definido indiretamente por `flowAcolhimentoConfirmaWhatsapp` nos demais casos.

Timers:

- renovado diretamente nos dois destinos.

Risco: **médio**.

Linhas removíveis estimadas: **14–16**.

Extração isolada: **sim**, com sincronização e áudio injetados.

## 2.2. Aceitação de telefone

Linhas: **13.233–13.285**.

Responsabilidade:

- normalizar e gravar telefone;
- decidir destino conforme a origem;
- tratar fluxos comum, terceiro, correção anterior e novo caso.

Dependências:

- `normalizarNumeroWhatsAppEnvio`;
- `flowAcolhimentoCidade`;
- `voltarParaConfirmacao`;
- `enviarAudioPedidoCidade`;
- `aproveitarRelatoAudioClienteNovoCaso`;
- `enviarAudioModoVoz`;
- `respostaRecomecoMenuPrincipal`;
- `setStage`;
- `iniciarTimer`.

### Origem `coleta_tel_wpp_contato`

Com nome confirmado:

- marca WhatsApp como verificado;
- define `telefoneEhDoCliente`;
- renova timer;
- delega para cidade com áudio suprimido.

Sem nome confirmado:

- altera stage para `coleta_nome`;
- renova timer;
- solicita nome completo.

### Origem `coleta_tel_wpp`

Fluxos internos:

1. correção do WhatsApp da confirmação;
2. novo caso para terceiro;
3. novo caso do cliente;
4. fluxo comum.

### Outras origens

- renova timer;
- retorna ao fallback de recomeço.

Chamadas externas:

- áudio direto e indireto;
- envio de mensagem e classificação indiretos por `aproveitarRelatoAudioClienteNovoCaso`;
- possível sincronização indireta por `voltarParaConfirmacao`.

Mutações:

- `u.whatsappContato`;
- `u.whatsappVerificado`;
- `u.telefoneEhDoCliente`;
- remoção de `u._corrigindoWhatsappConfirmacao`;
- `u.stage`.

Stages diretos:

- `coleta_nome`;
- `STAGES.ACOLHIMENTO_CIDADE`;
- `STAGES.AUDIO_AGUARDANDO`.

Timers:

- variam por origem;
- alguns destinos renovam diretamente;
- outros delegam para função que também controla timer.

Risco: **alto**.

Linhas removíveis estimadas: **50–55**.

Extração isolada: **não como um único handler inicial**. Deve ser decomposta por origem antes ou durante a extração.

Sub-handlers sugeridos:

- `confirmed-contact-phone-handler`;
- `confirmed-third-party-phone-handler`;
- `confirmed-new-client-case-phone-handler`;
- `confirmed-standard-phone-handler`.

## 2.3. Aceitação de cidade

Linhas: **13.286–13.298**.

Responsabilidade:

- gravar cidade;
- sincronizar;
- encaminhar para confirmação de dados, relato livre ou confirmação de WhatsApp.

Dependências:

- `sincronizarContatoNegocioHubSpot`;
- `iniciarTimer`;
- `setStage`;
- `telaConfirmarDadosAudio`;
- `iniciarFluxoRelatoLivre`;
- `flowAcolhimentoConfirmaWhatsapp`.

Chamadas externas:

- HubSpot;
- áudio e mensagens indiretamente pelos flows e telas.

Mutações:

- `u.cidade`;
- `u.stage` em um dos destinos.

Stages:

- `STAGES.AUDIO_CONFIRMAR_DADOS`, quando já há relato;
- stages definidos pelos flows delegados.

Timers:

- renovado diretamente para origens legadas;
- controlado indiretamente nos outros destinos.

Risco: **médio/alto**.

Linhas removíveis estimadas: **12–14**.

Extração isolada: **sim**, mas somente com sincronização e builders/flows injetados.

## Dependências remanescentes consolidadas

### Parsers e normalizadores

- `extrairNomeDaCorrecaoExplicita`
- `formatarNome`
- `limparTextoSomenteLetras`
- `ehNomeAparente`
- `normalizarTelefone`
- `formatarTelefoneExibicao`
- `normalizarNumeroWhatsAppEnvio`
- `primeiroNomeCliente`

### Estado e despacho

- `limparEntradaPendente`
- `setStage`
- `iniciarTimer`
- `processarInterno`
- `STAGES`

### Integrações e áudio

- `sincronizarContatoNegocioHubSpot`
- `gerarAudioAtendente`
- `enviarAudio`
- `urlAudioAtendente`
- `enviarAudioModoVoz`
- `enviarAudioPedidoCidade`
- `setTimeout`
- `logErro`

### Flows e telas

- `flowAcolhimentoConfirmaWhatsapp`
- `flowAcolhimentoCidade`
- `voltarParaConfirmacao`
- `aproveitarRelatoAudioClienteNovoCaso`
- `iniciarFluxoRelatoLivre`
- `telaConfirmarDadosAudio`
- `respostaRecomecoMenuPrincipal`

## Alterações remanescentes em `u`

Diretas:

- `_entradaPendenteValor`
- `nome`
- `nomeConfirmado`
- `whatsappContato`
- `whatsappVerificado`
- `telefoneEhDoCliente`
- `cidade`
- remoção de `_corrigindoWhatsappConfirmacao`

Por `limparEntradaPendente`:

- `_entradaPendenteTipo = null`
- `_entradaPendenteValor = null`
- `_entradaPendenteOrigem = null`

Por transição:

- `stage`

Delegações realizam mutações adicionais fora da fronteira do stage.

## Sincronizações remanescentes

### Diretas

`sincronizarContatoNegocioHubSpot(u)` ocorre:

- ao aceitar nome, salvo exceção de terceiro ainda sem WhatsApp;
- sempre ao aceitar cidade.

### Indiretas

- `voltarParaConfirmacao` chama sincronização do negócio;
- outros flows podem persistir ou sincronizar conforme seus próprios contratos.

Não há sincronização direta na correção livre de nome ou telefone.

## Uso de telefone

O telefone participa de duas responsabilidades diferentes:

1. **correção do valor pendente**, que apenas normaliza, valida, formata e reapresenta;
2. **aceitação final**, que grava e roteia para múltiplos destinos.

Essas responsabilidades não devem ser extraídas juntas.

Estados usados na aceitação:

- `_entradaPendenteOrigem`;
- `_novoCasoParaTerceiro`;
- `_novoCasoDeCliente`;
- `_corrigindoWhatsappConfirmacao`;
- `atendimentoParaTerceiro`;
- `nomeConfirmado`;
- `nome`;
- `modoTexto`.

## Timers remanescentes

Chamadas diretas a `iniciarTimer(from)` permanecem em:

- retry de correção livre inválida;
- redirecionamento de cidade;
- aceitação de nome;
- aceitação de telefone por contato;
- aceitação de telefone para terceiro;
- aceitação de telefone de novo caso;
- aceitação comum de telefone;
- origem desconhecida de telefone;
- aceitação de cidade de origem legada.

Há esperas de 4 segundos nas reconfirmações por áudio de nome e telefone.

## Mudanças de stage remanescentes

Diretas:

- `STAGES.ACOLHIMENTO_CIDADE`
- `coleta_tel_wpp`
- `coleta_nome`
- `STAGES.AUDIO_AGUARDANDO`
- `STAGES.AUDIO_CONFIRMAR_DADOS`

Indiretas:

- stages definidos por `flowAcolhimentoCidade`;
- stages definidos por `flowAcolhimentoConfirmaWhatsapp`;
- stages definidos por `voltarParaConfirmacao`;
- stages definidos por `iniciarFluxoRelatoLivre`;
- stages definidos por `aproveitarRelatoAudioClienteNovoCaso`.

## Riscos principais de regressão

1. limpar `_entradaPendente*` antes de capturar tipo, origem e valor;
2. mudar a precedência entre correção livre e `entrada_ok`;
3. tratar telefone de terceiro como telefone do próprio cliente;
4. perder o retorno especial de `_corrigindoWhatsappConfirmacao`;
5. ignorar relato pendente ao abrir novo caso;
6. duplicar ou remover timer em destinos que já controlam timer;
7. trocar a ordem entre sincronização e navegação;
8. alterar a supressão de áudio ao seguir para cidade;
9. substituir a recursão de cidade por chamada direta sem repetir as mesmas guardas;
10. transformar fallthrough em resposta tratada;
11. alterar os IDs `entrada_ok`;
12. combinar correção e aceitação de telefone em um único handler.

## Respostas finais

### A) É seguro extrair a aceitação final isoladamente?

**Não como um único handler monolítico.**

O payload `entrada_ok` combina três domínios:

- aceitação de nome;
- aceitação de telefone;
- aceitação de cidade.

É seguro extrair primeiro um dispatcher fino que capture `tipo`, `origem` e `valor`, limpe a entrada pendente e delegue por tipo, mas somente depois que cada tipo tiver testes próprios. A aceitação de nome pode ser extraída isoladamente com risco médio. Cidade exige caracterização da sincronização. Telefone deve ser decomposto.

### B) É seguro extrair telefone isoladamente?

**A correção livre de telefone, sim. A aceitação final de telefone, não em uma única etapa.**

A correção livre é local: normaliza, valida, grava o valor pendente e reapresenta. A aceitação final possui várias origens, flags de terceiro, retorno à confirmação, novo caso e relato pendente. Ela precisa ser dividida por origem.

### C) Qual é a próxima menor PR segura?

Extrair somente a **correção livre de nome** para:

```text
src/domain/stage-handlers/confirm-entry-corrected-name-handler.js
```

Contrato sugerido:

```js
{ handled, response }
```

Motivos:

- não sincroniza;
- não muda stage;
- não usa recursão;
- não participa de seleção de caso;
- altera apenas `_entradaPendenteValor`;
- possui uma única saída válida e fallthrough explícito;
- permite testar texto, áudio opcional e espera de 4 segundos.

Redução bruta estimada: **16–18 linhas**. A redução líquida no primeiro PR provavelmente será pequena por causa do contexto de dependências.

Ordem recomendada depois dessa PR:

1. correção livre de telefone;
2. retry comum de valor não identificado;
3. aceitação de nome;
4. aceitação de cidade;
5. redirecionamento recursivo de cidade;
6. rotas de aceitação de telefone por origem;
7. dispatcher final de `entrada_ok`;
8. handler agregador do stage.

### D) Qual redução líquida estimada resta nesse stage?

Há aproximadamente **136 linhas de lógica inline** ainda extraíveis.

Se o stage completo for substituído por um handler agregador com contexto explícito:

- remoção do bloco atual: aproximadamente 160 linhas;
- importação, contexto e delegação: aproximadamente 25–35 linhas;
- redução líquida estimada: **125–135 linhas**.

Considerando apenas o núcleo ainda não extraído e mantendo as duas delegações atuais em `server.js`, a redução líquida adicional seria aproximadamente **100–115 linhas**.

O volume total do projeto aumentará com handlers e testes, mas `processarInterno()` perderá a maior parte da complexidade ciclomática desse stage.
