# Reauditoria de `CONFIRMAR_ENTRADA` após as migrações de revalidação

## Escopo

Auditoria estática e exclusiva do bloco:

```js
if (u.stage === STAGES.CONFIRMAR_ENTRADA) {
  // ...
}
```

As migrações híbridas `revalidate_name_confirm`,
`revalidate_city_confirm` e `revalidate_phone_confirm` pertencem aos stages
`REVALIDA_NOME`, `REVALIDA_CIDADE` e `REVALIDA_WHATSAPP`. Elas não modificaram
diretamente `CONFIRMAR_ENTRADA`; servem como referência para futuras migrações
híbridas.

## 1. Linhas remanescentes

No estado atual de `server.js`, o bloco ocupa aproximadamente:

- início: linha **13123**;
- fim: linha **13216**;
- extensão bruta: **94 linhas**.

O próximo stage começa na linha aproximada 13219
(`novo_caso_confirma`).

Grande parte dessas 94 linhas já é orquestração e injeção de dependências para
handlers extraídos. A lógica inline efetivamente remanescente está concentrada
aproximadamente nas linhas 13138–13184.

## 2. Fluxos restantes

### 2.1 Pedido explícito de correção

- **Entrada:** `text === "entrada_corrigir"`.
- **Executor atual:** `handleConfirmEntryCorrection`.
- **Responsabilidade:** orientar o cliente a informar o valor correto.
- **Estado:** já extraído; `server.js` apenas injeta dependências e retorna se
  `handled`.

### 2.2 Correção textual de nome

- **Entrada:** texto livre, pendência do tipo `nome`.
- **Executor atual:** `handleConfirmEntryCorrectedName`.
- **Responsabilidade:** extrair, validar, armazenar o novo valor pendente e
  reapresentar confirmação.
- **Estado:** já extraído.

### 2.3 Correção textual de telefone

- **Entrada:** texto livre, pendência do tipo `telefone`.
- **Executor atual:** `handleConfirmEntryPhone`.
- **Responsabilidade:** normalizar, validar, armazenar o telefone pendente e
  reapresentar confirmação.
- **Estado:** já extraído.

### 2.4 Correção textual de cidade

- **Entrada:** texto livre, pendência do tipo `cidade`.
- **Executor atual:** inline em `server.js`.
- **Responsabilidade:** limpar a confirmação pendente, redirecionar para
  `ACOLHIMENTO_CIDADE` e reprocessar o mesmo texto no fluxo completo de cidade.
- **Operações atuais:**

```js
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
```

### 2.5 Valor corrigido não reconhecido

- **Entrada:** texto livre que não foi aceito pelos handlers de nome/telefone e
  não pertence ao tipo cidade.
- **Executor atual:** inline em `server.js`.
- **Responsabilidade:** iniciar timer e pedir novamente a informação.
- **Resposta:** texto fixo já existente, sem mudança de stage.

### 2.6 Aceitação final

- **Entrada:** `text === "entrada_ok"`.
- **Executor atual:** `handleConfirmEntryFinalAcceptance`.
- **Responsabilidade:** aplicar definitivamente nome, telefone ou cidade e
  continuar conforme origem/contexto.
- **Estado:** já extraído e protegido pelo commit `001cd7e`; tipo desconhecido é
  recusado antes de limpar o estado pendente.

### 2.7 Fallback final do stage

- **Entrada:** qualquer caminho ainda não tratado.
- **Executor atual:** `handleConfirmEntryInvalid`.
- **Responsabilidade:** iniciar timer e reapresentar a confirmação.
- **Estado:** já extraído.

## 3. Side effects existentes

| Subfluxo | Side effects |
|---|---|
| Pedido de correção | timer, geração e envio de áudio |
| Nome corrigido | mutação de `_entradaPendenteValor`, TTS e envio de áudio |
| Telefone corrigido | mutação de `_entradaPendenteValor`, TTS e envio de áudio |
| Cidade corrigida | limpeza de pendência, stage, timer e recursão em `processarInterno` |
| Valor não reconhecido | timer |
| Aceitação final | mutações cadastrais, limpeza de pendência, stages, timers, áudio, sincronização e flows |
| Fallback final | timer |

Não há upload, Drive, documentos ou Calendar neste bloco.

## 4. Mudanças em `u`

### Pedido de correção

O handler não altera diretamente campos cadastrais. O timer altera o estado
operacional associado ao usuário.

### Nome corrigido

- `_entradaPendenteValor = nomeLimpo`.

### Telefone corrigido

- `_entradaPendenteValor = telNorm`.

### Cidade corrigida inline

- limpeza de `_entradaPendenteTipo`;
- limpeza de `_entradaPendenteValor`;
- limpeza de `_entradaPendenteOrigem`;
- mudança de `stage` para `ACOLHIMENTO_CIDADE`;
- mutações adicionais podem ocorrer na chamada recursiva.

### Aceitação final

Dependendo do tipo e origem:

- `nome`;
- `nomeConfirmado`;
- `whatsappContato`;
- `whatsappVerificado`;
- `telefoneEhDoCliente`;
- `cidade`;
- flags temporárias de correção;
- limpeza dos campos `_entradaPendente*`;
- campos e flags modificados pelos flows subsequentes.

### Fallbacks

O fallback de valor não reconhecido e o fallback final não alteram campos
cadastrais, mas iniciam timer.

## 5. Timers

Timers são iniciados em:

- `handleConfirmEntryCorrection`;
- redirecionamento inline de cidade;
- fallback inline de valor não reconhecido;
- vários caminhos de `handleConfirmEntryFinalAcceptance`;
- `handleConfirmEntryInvalid`.

Os handlers de nome e telefone corrigidos não iniciam timer diretamente; eles
podem gerar e enviar TTS antes de retornar a tela.

## 6. Mudanças de stage

O bloco pode produzir:

- `ACOLHIMENTO_CIDADE`;
- `AUDIO_AGUARDANDO`;
- `AUDIO_CONFIRMAR_DADOS`;
- `"coleta_tel_wpp"`;
- `"coleta_nome"`;
- outros stages definidos pelos flows chamados após a aceitação.

O redirecionamento inline de cidade sempre define
`STAGES.ACOLHIMENTO_CIDADE` antes da recursão.

## 7. Sincronizações

A sincronização direta está concentrada em
`handleConfirmEntryFinalAcceptance`:

- `sincronizarContatoNegocioHubSpot(u)` para nome, salvo a exceção já existente
  de novo caso para terceiro sem WhatsApp;
- `sincronizarContatoNegocioHubSpot(u)` para cidade.

Os demais subfluxos não sincronizam diretamente. A recursão da cidade pode
alcançar sincronizações posteriores do fluxo de acolhimento, mas isso é efeito
transitivo, não chamada direta deste bloco.

## 8. Chamadas externas

### Comunicação e áudio

- `gerarAudioAtendente`;
- `enviarAudio`;
- `enviarAudioModoVoz`;
- `enviarAudioPedidoCidade`.

### CRM/sincronização

- `sincronizarContatoNegocioHubSpot`.

### Fluxos e telas

- `voltarParaConfirmacao`;
- `flowAcolhimentoConfirmaWhatsapp`;
- `flowAcolhimentoCidade`;
- `aproveitarRelatoAudioClienteNovoCaso`;
- `respostaRecomecoMenuPrincipal`;
- `telaConfirmarDadosAudio`;
- `iniciarFluxoRelatoLivre`.

### Recursão

- `processarInterno` no redirecionamento de correção de cidade.

## 9. Dependências

O bloco completo injeta ou usa:

- `u`, `text`, `from`, `nomeWA`;
- `STAGES`;
- `iniciarTimer`;
- `gerarAudioAtendente`, `enviarAudio`, `enviarAudioModoVoz`;
- `urlAudioAtendente`;
- `logErro`;
- `extrairNomeDaCorrecaoExplicita`;
- `formatarNome`, `limparTextoSomenteLetras`, `ehNomeAparente`;
- `normalizarTelefone`, `normalizarNumeroWhatsAppEnvio`;
- `formatarTelefoneExibicao`;
- `limparEntradaPendente`;
- `sincronizarContatoNegocioHubSpot`;
- `setStage`;
- `primeiroNomeCliente`;
- `flowAcolhimentoConfirmaWhatsapp`;
- `flowAcolhimentoCidade`;
- `voltarParaConfirmacao`;
- `enviarAudioPedidoCidade`;
- `aproveitarRelatoAudioClienteNovoCaso`;
- `respostaRecomecoMenuPrincipal`;
- `telaConfirmarDadosAudio`;
- `iniciarFluxoRelatoLivre`;
- `processarInterno`.

## 10. Riscos de regressão

### Alto — correção de cidade com recursão

A ordem atual é crítica:

1. capturar `tipo` e `origem`;
2. limpar pendência;
3. mudar stage;
4. iniciar timer;
5. reprocessar exatamente o mesmo texto como mensagem textual.

Alterar payload, ordem ou stage pode mudar validação geográfica, áudio, retry e
sincronização.

### Médio — precedência nome → telefone → cidade

Texto livre é oferecido primeiro ao handler de nome, depois ao de telefone e só
então ao redirecionamento de cidade. A ordem evita que o fallback seja exibido
antes de todos os validadores aplicáveis.

### Médio — aceitação final dependente da origem

O mesmo tipo pendente possui continuações diferentes para:

- `coleta_tel_outro`;
- `coleta_tel_wpp_contato`;
- `coleta_tel_wpp`;
- novo caso de cliente;
- novo caso para terceiro;
- coleta legada de cidade.

### Baixo — valor não reconhecido

O caminho é simples, mas a mensagem e o timer devem permanecer idênticos.

### Baixo — fallback final

Depois do commit `001cd7e`, handlers anteriores só recusam antes de side effects.
O fallback final pode executar com segurança se nenhum deles tratar a entrada.

## Candidatos por subfluxo

| Subfluxo | Responsabilidade | Risco | Linhas removíveis estimadas | Extração isolada | Execução híbrida |
|---|---|---:|---:|---|---|
| Pedido `entrada_corrigir` | orientar correção | Baixo | Já extraído; apenas wiring | Concluída | Não necessária |
| Nome corrigido | validar/reconfirmar nome | Baixo | Já extraído; apenas wiring | Concluída | Possível, mas fora do resíduo inline |
| Telefone corrigido | validar/reconfirmar telefone | Baixo | Já extraído; apenas wiring | Concluída | Possível, mas fora do resíduo inline |
| Cidade corrigida | redirecionar para fluxo geográfico | Alto | 7–9 | Sim, com recursão injetada | Sim, guarda por tipo antes de efeitos |
| Valor não reconhecido | retry textual | Baixo | 3–5 | **Sim** | **Sim, candidata ideal** |
| Aceitação final | aplicar pendência e continuar | Médio/alto | Já extraído; wiring extenso | Concluída | Já protegida contra fallback pós-efeito |
| Fallback final | reapresentar confirmação | Baixo | Já extraído; apenas wiring | Concluída | Não necessária |

## Respostas finais

### A) O que ainda resta de `CONFIRMAR_ENTRADA`?

Restam inline:

1. o guard de texto livre;
2. captura de `tipo` e `origem`;
3. ordenação dos handlers de nome e telefone;
4. redirecionamento de correção de cidade com recursão;
5. retry de valor corrigido não reconhecido.

Pedido de correção, correção de nome, correção de telefone, aceitação final e
fallback final já estão em handlers. O servidor ainda contém a orquestração e a
injeção explícita de todas as dependências.

### B) Qual é a menor PR segura agora?

Extrair exclusivamente o retry de valor corrigido não reconhecido
(aproximadamente linhas 13181–13183) para um handler híbrido.

Contrato seguro:

- guarda de aplicabilidade antes de qualquer efeito;
- `success: false` sem timer nem mutação;
- para ação aplicável, primeiro efeito é `iniciarTimer(from)`;
- depois do timer, retorno obrigatório `success: true`;
- nenhuma captura que libere fallback.

O branch inline deve permanecer como fallback durante a estabilização.

### C) Qual é a próxima migração híbrida recomendada?

O retry de correção textual inválida, antes da cidade recursiva.

Motivos:

- somente um side effect direto: timer;
- nenhuma integração;
- nenhuma mudança de stage;
- nenhuma sincronização;
- resposta estática;
- permite validar a semântica híbrida dentro de `CONFIRMAR_ENTRADA` com risco
  mínimo.

Depois dele, o redirecionamento de cidade deve ser auditado e migrado em PR
própria.

### D) Qual redução líquida estimada ainda existe nesse stage?

O bloco bruto possui 94 linhas, mas a maioria é wiring de handlers já extraídos.

Estimativas:

- lógica inline ainda extraível: aproximadamente **12–18 linhas**;
- redução imediata durante a fase híbrida: **zero**, pois o legacy deve
  permanecer;
- redução final sem criar nova camada de dispatch: pequena ou negativa, porque
  chamadas e injeção de dependências continuam no servidor;
- redução final com uma futura camada única de execução do stage:
  aproximadamente **45–60 linhas líquidas**.

### E) Existe algum bloco pronto para remoção definitiva do legacy?

**Não dentro de `CONFIRMAR_ENTRADA` nesta etapa.**

Os handlers já extraídos são os executores únicos de seus subfluxos; o código no
servidor ao redor deles é orquestração necessária, não uma cópia legacy
equivalente pronta para apagar.

O retry inline e a cidade inline ainda não possuem handlers híbridos. Já os
branches legacy dos três handlers `REVALIDA_*` ficam fora deste stage e exigem
estabilização própria antes de remoção.

## Recomendação única

Próxima PR:

```text
handler híbrido para retry de valor corrigido não reconhecido
```

Não incluir cidade, aceitação final, decision-router ou reorganização do stage na
mesma mudança.
