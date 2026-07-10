# Auditoria macro dos próximos alvos de `processarInterno`

## Escopo e dimensão atual

Auditoria estática da função `processarInterno`, sem alteração de código ou
testes.

No estado atual:

- início: linha aproximada **9870**;
- próxima função de topo (`drenaFilaUsuario`): linha aproximada **14229**;
- extensão aproximada: **4.359 linhas**;
- tamanho total de `server.js`: aproximadamente **14.778 linhas**.

As estimativas abaixo consideram fronteiras funcionais, não apenas cada `if`.
Durante a fase híbrida, handlers novos aumentam temporariamente a quantidade de
linhas porque o legacy permanece. O “potencial de redução” representa a fase
posterior, quando o caminho legacy estiver estabilizado e puder ser removido.

## Mapa resumido

| # | Região aproximada | Responsabilidade | Linhas | Risco | Testabilidade | Modelo híbrido | Execution-router futuro |
|---:|---|---|---:|---|---|---|---|
| 1 | 9870–10461 | ingresso, retomadas e guards globais | 592 | Alto | Média | Baixa | Média |
| 2 | 10462–10495 | gateway de mídia e áudio já delegado | 34 | Médio | Alta | Média | Alta |
| 3 | 10496–10721 | revalidação textual e progressiva | 226 | Médio | Alta | **Alta** | **Alta** |
| 4 | 10722–11362 | interceptores cadastrais de áudio | 641 | Alto | Média | Média | Alta |
| 5 | 11363–11574 | acolhimento e relato inicial por voz/texto | 212 | Médio/alto | Média | Alta | Alta |
| 6 | 11575–12066 | assessoria, confirmação de dados e correções | 492 | Alto | Baixa/média | Média | Média |
| 7 | 12067–12774 | titularidade, nomes e WhatsApp | 708 | Alto | Média | Alta por action | Alta |
| 8 | 12775–13011 | coleta e confirmação textual de cidade | 237 | Alto | Média | Média | Alta |
| 9 | 13012–13087 | área, entendimento e direcionamento | 76 | Médio | Média/alta | Alta | Alta |
| 10 | 13088–13123 | encerramento e guard de opções | 36 | Médio | Alta | Média | Média |
| 11 | 13124–13228 | `CONFIRMAR_ENTRADA` | 105 | Médio | Alta | Alta | Alta |
| 12 | 13229–13341 | confirmação de novo caso/terceiro | 113 | Alto | Média | Média | Alta |
| 13 | 13342–13464 | coleta legada, descrição e urgência | 123 | Médio | Alta | Média | Média |
| 14 | 13465–14198 | pós-áudio, navegação e menu do cliente | 734 | Alto | Baixa/média | Baixa | Média |
| 15 | 14199–14228 | fallback global | 30 | Médio | Alta | Baixa | Baixa |

## 1. Ingresso, retomadas e guards globais

### Linhas

9870–10461, aproximadamente 592 linhas.

### Responsabilidade

- sanitização;
- atualização de atividade;
- limpeza/restauração de timers;
- fluxo encerrado;
- reconhecimento de terceiro;
- retomadas;
- recomeço/encerramento global;
- guards de documentos, cliente e mensagens simultâneas;
- preparação do contexto da mensagem.

### Dependências principais

`users`, HubSpot, persistência, timers, retomadas, menu do cliente, reconhecimento
de terceiro, mídia e helpers globais.

### Side effects

Mutações extensas em `u`, timers, buscas HubSpot, recursão em
`processarInterno`, mensagens, persistência agendada e mudança de stage.

### Acoplamento e risco

Acoplamento transversal muito alto. A ordem dessas guards determina qual fluxo
recebe a mensagem. Uma extração estrutural pode alterar precedência global.

- **Risco:** alto.
- **Facilidade de caracterização:** média; exige matriz de stages e estados.
- **Compatibilidade híbrida:** baixa, pois uma recusa tardia pode ocorrer depois
  de efeitos globais.
- **Execution-router:** média; primeiro seria necessário separar guards de
  despacho.
- **Redução potencial:** 250–400 linhas, mas não em uma PR segura pequena.

## 2. Gateway de mídia e áudio já delegado

### Linhas

10462–10495, aproximadamente 34 linhas.

### Responsabilidade

Chamar `processarMidia`, responder documento antes do relato e chamar
`processarAudioCanalAtendimento`.

### Dependências e efeitos

WhatsApp, download/upload, áudio, documentos, timers e os routers já extraídos.

- **Risco:** médio.
- **Caracterização:** alta; os contratos já retornam resposta ou `null`.
- **Compatibilidade híbrida:** média.
- **Execution-router:** alta.
- **Redução potencial:** baixa, 10–20 linhas, pois o bloco já é majoritariamente
  orquestração.

Não é um alvo prioritário.

## 3. Revalidação textual e progressiva

### Linhas

10496–10721, aproximadamente 226 linhas.

### Responsabilidade

- handlers híbridos de confirmação de nome/cidade/telefone;
- correção textual de nome;
- correção textual de cidade;
- correção textual de WhatsApp;
- progressão campo a campo;
- retry e imprevistos.

### Dependências principais

Validadores puros, `sincronizarContatoNegocioHubSpot`, busca de cidade,
normalização de telefone, TTS, WhatsApp, timer,
`proximaConfirmacaoProgressiva`, `voltarParaConfirmacao` e
`flowAcolhimentoCidade`.

### Side effects

Mutações cadastrais, `_revalidaConfirmados`, sincronização, áudio, timers e
mudanças indiretas de stage.

### Acoplamento e risco

O action model já diferencia:

- `revalidate_name_confirm`;
- `revalidate_name_correct_text`;
- `revalidate_name_wait`;
- equivalentes de cidade e telefone.

Isso reduz o risco de captura indevida.

- **Risco:** médio no bloco; baixo/médio por action.
- **Caracterização:** alta.
- **Compatibilidade híbrida:** alta, com guard por `nextAction`.
- **Execution-router:** alta.
- **Redução potencial:** 120–170 linhas depois da remoção de todos os legacies.

### Melhor subalvo

`revalidate_name_correct_text`, aproximadamente 25–35 linhas de negócio:

- action já atômico;
- validação e side effect inicial claros;
- sem recursão;
- apenas uma sincronização e TTS opcional;
- precedência imediatamente após `revalidate_name_confirm`.

## 4. Interceptores cadastrais de áudio

### Linhas

10722–11362, aproximadamente 641 linhas.

### Responsabilidade

Áudio para:

- nome do contato;
- nome do cliente;
- cidade;
- revalidação de nome/cidade/WhatsApp;
- telefone;
- nome de terceiro;
- adaptação de resposta cadastral.

### Dependências e efeitos

Download, transcrição, prompts, validação, busca geográfica, TTS, mensagens,
stages, timers, sincronização e mutações temporárias.

- **Risco:** alto.
- **Caracterização:** média; exige doubles para mídia/transcrição.
- **Compatibilidade híbrida:** média. A guarda pode ser pura, mas o primeiro I/O
  ocorre cedo e impede fallback posterior.
- **Execution-router:** alta, pois há actions de origem `audio`.
- **Redução potencial:** 400–550 linhas.

Apesar do ganho, não deve ser o próximo alvo.

## 5. Acolhimento e relato inicial

### Linhas

11363–11574, aproximadamente 212 linhas.

### Responsabilidade

Boas-vindas, escolha de canal, opções de áudio, relato em texto, classificação
inicial e confirmação de transcrição.

### Dependências e efeitos

Imagem/WhatsApp, TTS, IA, classificação, timers, stages, histórico e relato
acumulado.

- **Risco:** médio/alto.
- **Caracterização:** média.
- **Compatibilidade híbrida:** alta por action de onboarding, mas baixa após o
  primeiro envio/classificação.
- **Execution-router:** alta.
- **Redução potencial:** 140–180 linhas.

Recomendável somente após completar os handlers textuais de revalidação.

## 6. Assessoria, confirmação de dados e correções

### Linhas

11575–12066, aproximadamente 492 linhas.

### Responsabilidade

Assessoria inicial, confirmação de área/dados, finalização de cadastro,
correção via IA e mini-stages de edição.

### Dependências e efeitos

Groq/axios, cadastro, HubSpot, Drive, TTS, WhatsApp, timers, stages, seleção de
campo e fluxos de terceiro.

- **Risco:** alto.
- **Caracterização:** baixa/média.
- **Compatibilidade híbrida:** média.
- **Execution-router:** média; algumas decisões ainda estão locais.
- **Redução potencial:** 300–400 linhas.

Deve ser evitado no curto prazo.

## 7. Titularidade, nomes e WhatsApp

### Linhas

12067–12774, aproximadamente 708 linhas.

### Responsabilidade

Modo, para quem é o atendimento, nome do contato, nome do atendido, confirmação
de titularidade, confirmação de nome e WhatsApp próprio/de terceiro.

### Dependências e efeitos

Classificadores, IA de imprevisto, normalizadores, TTS, WhatsApp, timers, stages,
sincronização e flags de terceiro.

- **Risco:** alto no conjunto; médio por action isolado.
- **Caracterização:** média/alta por action.
- **Compatibilidade híbrida:** alta, porque a Fase 1 formalizou actions de
  onboarding.
- **Execution-router:** alta.
- **Redução potencial:** 450–600 linhas.

Boa área futura, mas não deve ser migrada como bloco único.

## 8. Coleta e confirmação textual de cidade

### Linhas

12775–13011, aproximadamente 237 linhas.

### Responsabilidade

CEP, cidade homônima, confirmação/correção de localização, UF/região,
temporários e continuidade.

### Dependências e efeitos

ViaCEP/busca geográfica, WhatsApp, TTS, sincronização HubSpot, timers, stages e
várias mutações temporárias.

- **Risco:** alto.
- **Caracterização:** média.
- **Compatibilidade híbrida:** média; há muitos efeitos antes de respostas.
- **Execution-router:** alta quando cada action estiver estabilizado.
- **Redução potencial:** 170–210 linhas.

Evitar junto com a recursão de cidade de `CONFIRMAR_ENTRADA`; os dois fluxos se
acoplam diretamente.

## 9. Área, entendimento e direcionamento

### Linhas

13012–13087, aproximadamente 76 linhas.

### Responsabilidade

Escolha de área, classificação do entendimento, tratamento de terceiro/dúvida,
relato curto e encaminhamento para menu, confirmação ou relato.

### Dependências e efeitos

IA/classificação, respostas de imprevisto, TTS/telas, timers, stages e menu.

- **Risco:** médio.
- **Caracterização:** média/alta.
- **Compatibilidade híbrida:** alta.
- **Execution-router:** alta.
- **Redução potencial:** 45–60 linhas.

É um candidato posterior razoável, mas `revalidate_name_correct_text` possui
fronteira mais simples.

## 10. Encerramento e guard de opções

### Linhas

13088–13123, aproximadamente 36 linhas.

### Responsabilidade

Encerramento global e recuperação de opção inválida em telas declarativas.

### Dependências e efeitos

Encerramento/captura, IA opcional, áudio/tela e pergunta anterior.

- **Risco:** médio, pois precede `CONFIRMAR_ENTRADA`.
- **Caracterização:** alta.
- **Compatibilidade híbrida:** média.
- **Execution-router:** média; é guard transversal, não action de intake local.
- **Redução potencial:** 20–25 linhas.

Não priorizar antes de estabilizar o intake por action.

## 11. `CONFIRMAR_ENTRADA`

### Linhas

13124–13228, aproximadamente 105 linhas.

### Responsabilidade

Correção, aplicação final, retry e redirecionamento recursivo de cidade.

### Estado atual

Quase todos os subfluxos já estão em handlers. Restam inline:

- cidade recursiva;
- legacies híbridos preservados;
- orquestração e injeção.

- **Risco:** médio; cidade isolada é médio/alto.
- **Caracterização:** alta.
- **Compatibilidade híbrida:** alta.
- **Execution-router:** alta.
- **Redução potencial adicional de negócio:** apenas 7–12 linhas.

Não continuar agora: a relação risco/ganho caiu bastante.

## 12. Confirmação de novo caso/terceiro

### Linhas

13229–13341, aproximadamente 113 linhas.

### Responsabilidade

Definir se o telefone/caso pertence ao cliente ou terceiro, restaurar dados do
caso anterior e iniciar novo relato.

### Dependências e efeitos

Muitas flags de terceiro, limpeza/restauração de estado, stages, timers, áudio,
menu e relato pendente.

- **Risco:** alto.
- **Caracterização:** média.
- **Compatibilidade híbrida:** média.
- **Execution-router:** alta depois de actions específicas.
- **Redução potencial:** 80–100 linhas.

Evitar por enquanto.

## 13. Coleta legada, descrição e urgência

### Linhas

13342–13464, aproximadamente 123 linhas.

### Responsabilidade

Router legado, confirmação de descrição, gatilho/urgência e confirmação de áudio
urgente.

### Dependências e efeitos

Handlers já extraídos, timers, stages, HubSpot, notificações e buffers de áudio.

- **Risco:** médio.
- **Caracterização:** alta para routers; média para urgência.
- **Compatibilidade híbrida:** média.
- **Execution-router:** média.
- **Redução potencial:** 50–80 linhas.

O melhor subalvo desta região seria urgência, mas envolve notas/notificações e é
inferior ao candidato de revalidação textual.

## 14. Pós-áudio, navegação e menu do cliente

### Linhas

13465–14198, aproximadamente 734 linhas.

### Responsabilidade

Pós-áudio e navegação já delegados, menu do cliente, status, documentos,
advogado, agendamento, novo caso, cancelamento e encerramento.

### Dependências e efeitos

HubSpot, Drive, Calendar, WhatsApp, documentos, seleção de caso, imagens,
timers, notificações e inúmeras flags.

- **Risco:** alto.
- **Caracterização:** baixa/média sem grande matriz de integração.
- **Compatibilidade híbrida:** baixa para o bloco; média por ação individual.
- **Execution-router:** média, pois mistura domínios além de intake.
- **Redução potencial:** **500–650 linhas**, o maior ganho bruto.

É o maior candidato por volume, mas não pela relação risco/ganho.

## 15. Fallback global

### Linhas

14199–14228, aproximadamente 30 linhas.

### Responsabilidade

Garantir timer e resposta final quando nenhum fluxo tratou a mensagem.

### Dependências e efeitos

Timer, modo de atendimento, áudio/tela e fallback empático.

- **Risco:** médio apesar do tamanho, pois é a última barreira de segurança.
- **Caracterização:** alta.
- **Compatibilidade híbrida:** baixa; não deve competir com handlers.
- **Execution-router:** baixa; deve permanecer fora de dispatch específico.
- **Redução potencial:** 15–20 linhas.

Não é um bom primeiro alvo.

## Ranking dos próximos candidatos

| Ordem | Candidato | Linhas de negócio | Risco | Ganho | Testabilidade |
|---:|---|---:|---|---|---|
| 1 | `revalidate_name_correct_text` | 25–35 | Baixo/médio | Bom | Alta |
| 2 | `revalidate_phone_correct_text` | 30–45 | Médio | Bom | Alta |
| 3 | `revalidate_name_wait` | 3–8 | Baixo | Baixo | Alta |
| 4 | modo/para quem por action isolado | 10–30 | Médio | Médio | Alta |
| 5 | área/entendimento/direcionamento | 45–60 | Médio | Médio | Média/alta |

`revalidate_city_correct_text` possui ganho maior, mas busca geográfica,
ambiguidade de cidades e áudio opcional elevam o risco.

## Respostas finais

### A) Qual é o melhor alvo para a próxima PR?

**`revalidate_name_correct_text`.**

Ele já possui `nextAction` atômico, fica ao lado dos três handlers híbridos
estabilizados e possui uma fronteira clara:

1. guarda pura pelo action;
2. extração/validação do nome;
3. mutação cadastral;
4. sincronização;
5. TTS opcional;
6. progressão existente.

### B) Qual tem a melhor relação risco/ganho?

Também **`revalidate_name_correct_text`**.

O ganho estimado de 25–35 linhas é significativamente maior que os handlers de
confirmação já migrados, sem recursão, mídia, CEP, seleção de caso ou múltiplas
integrações.

### C) Qual gera maior redução líquida?

O bloco de **menu do cliente/documentos/agendamento** (aproximadamente
13472–14198) possui o maior potencial bruto: cerca de 500–650 linhas.

Essa não é uma recomendação de execução imediata. O bloco mistura vários
domínios externos e exigiria decomposição prévia e extensa caracterização.

### D) Qual é o próximo candidato recomendado para handler híbrido?

**`revalidate_name_correct_text`**, seguido por
`revalidate_phone_correct_text`.

O handler deve seguir a mesma invariável:

- `success: false` somente antes de qualquer mutação/I/O;
- depois de alterar `u.nome`, sincronizar ou enviar áudio, erros devem ser
  propagados e o legacy não pode executar.

### E) Qual região deve ser evitada por enquanto?

Evitar:

1. **menu do cliente/documentos/agendamento**, pelo acoplamento com HubSpot,
   Drive, Calendar, seleção de caso e UX declarativa;
2. **`CORRIGIR_DADOS`**, pela classificação via IA e múltiplos mini-stages;
3. **coleta textual/recursiva de cidade**, pelo acoplamento com CEP, cidades
   homônimas, sincronização e recursão;
4. **interceptores cadastrais de áudio**, até haver uma matriz de testes de
   download/transcrição/efeitos.

## Recomendação única

Próxima PR:

```text
handler híbrido revalidate_name_correct_text
```

Não combinar com wait, áudio, cidade, telefone ou remoção de legacy.
