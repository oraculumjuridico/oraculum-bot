# Auditoria dos próximos alvos híbridos da Fase 2

## Escopo e método

Esta auditoria considera o estado atual de `server.js`, do
`client-post-intake-decision-router` e dos handlers existentes. Nenhum código
ou teste foi alterado.

As estimativas de linhas indicam quanto código legacy poderá sair de
`server.js` numa fase futura, depois da estabilização do handler. Na fase
híbrida atual o branch legacy permanece e, portanto, a criação do handler não
produz essa redução física imediatamente.

## Estado atual da migração

O `client-post-intake-decision-router` representa 13 ações atômicas de
revalidação:

- 4 de nome;
- 5 de cidade;
- 4 de telefone.

Há quatro ações com interceptação híbrida:

| Ação atômica | Handler | Chamada em `server.js` | Cobertura efetiva |
|---|---|---:|---|
| `revalidate_name_confirm` | `revalidate-name-confirm.handler.js` | 10497–10505 | Integral |
| `revalidate_name_correct_text` | `revalidate-name-correct-text.handler.js` | 10507–10529 | Parcial: nome válido e retry de texto inválido; negação pura retorna `success:false` e segue para o `WAIT` legacy |
| `revalidate_city_confirm` | `revalidate-city-confirm.handler.js` | 10572–10580 | Integral |
| `revalidate_phone_confirm` | `revalidate-phone-confirm.handler.js` | 10661–10672 | Integral |

O handler `confirm-entry-invalid-retry.handler.js`, chamado em
`server.js` aproximadamente nas linhas 13207–13216, também é híbrido, mas
pertence a `CONFIRMAR_ENTRADA`, não às ações de revalidação.

Todos os branches legacy continuam fisicamente presentes. Os handlers
interceptam as ações aplicáveis antes deles; `success:false` ainda libera o
fallback.

## Branches de revalidação ainda inline

### Nome

Região macro: `server.js` 10532–10570.

| Subfluxo | Linhas atuais | Situação | Dependências e efeitos |
|---|---:|---|---|
| Confirmação | 10533–10537 | Coberto integralmente pelo handler híbrido | Muta `_revalidaConfirmados`; chama `proximaConfirmacaoProgressiva` |
| Correção textual válida | 10539–10557 | Coberta pelo handler híbrido | Validação de nome, mutação de `u`, HubSpot, áudio opcional, espera e progressão |
| Correção textual inválida | 10558–10565 | Coberta, exceto negação pura | Timer e resposta; negação pura não inicia efeitos no handler |
| Espera/imprevisto | 10567–10569 | Exclusivamente legacy | `tratarImprevistoPreAtendimento`, cujo contrato pode produzir efeitos antes de retornar |
| Revalidação por áudio | 11070–11119 | Exclusivamente legacy | Envio, download, transcrição, validação, HubSpot, áudio, mutações e progressão |

Existe ainda uma continuação de nome em 10730–10744: quando a action macro é
`COLLECT_NAME` e `u._revalidandoCampos` está ativo, o servidor valida o nome,
inicia retry ou atualiza `u` e avança a revalidação. Ela é parte funcional da
revalidação, embora sua action atômica seja `collect_name_text`.

### Cidade

Região macro: `server.js` 10582–10659.

| Subfluxo | Linhas atuais | Situação | Dependências e efeitos |
|---|---:|---|---|
| Confirmação | 10583–10587 | Coberto integralmente pelo handler híbrido | Muta `_revalidaConfirmados`; chama progressão |
| Seleção de cidade homônima | 10589–10609 | Exclusivamente legacy | Lê `_cidadesMultiplas`; muta cidade/UF/região; remove estado temporário; áudio opcional; progressão |
| Correção textual | 10611–10654 | Exclusivamente legacy | Normalização, busca de cidade, mutações, opções múltiplas, áudio, timer e progressão |
| Espera/imprevisto | 10656–10658 | Exclusivamente legacy | `tratarImprevistoPreAtendimento` |
| Revalidação por áudio | 11122–11208 | Exclusivamente legacy | Envio, download, transcrição, CEP/cidade, opções múltiplas, HubSpot, áudio, timer e progressão |

### Telefone

Região macro: `server.js` 10674–10728.

| Subfluxo | Linhas atuais | Situação | Dependências e efeitos |
|---|---:|---|---|
| Confirmação | 10675–10691 | Coberto integralmente pelo handler híbrido | Três continuações conforme flags; mutações e chamada do fluxo seguinte |
| Correção textual | 10693–10723 | Exclusivamente legacy | Normalização, mutações em telefone, áudio opcional, confirmação/progressão/coleta de cidade ou retry |
| Espera/imprevisto | 10725–10727 | Exclusivamente legacy | `tratarImprevistoPreAtendimento` |
| Revalidação por áudio | 11014–11068 | Exclusivamente legacy | Envio, download, transcrição, normalização, áudio, timer, mutações e três continuações |

## Fluxos exclusivamente legacy

As nove actions de revalidação abaixo ainda não possuem handler:

1. `revalidate_name_audio`;
2. `revalidate_name_wait`;
3. `revalidate_city_select`;
4. `revalidate_city_correct_text`;
5. `revalidate_city_audio`;
6. `revalidate_city_wait`;
7. `revalidate_phone_correct_text`;
8. `revalidate_phone_audio`;
9. `revalidate_phone_wait`.

Além delas, a continuação `collect_name_text` com
`u._revalidandoCampos === true` permanece integralmente inline. Isso completa
os dez alvos relevantes para esgotar a execução legacy da revalidação.

## Dez próximos candidatos

Ordem recomendada considerando fronteira de efeitos, ganho, facilidade de
caracterização e dependências:

| Ordem | Handler candidato | Linhas legacy removíveis | Risco | Justificativa |
|---:|---|---:|---|---|
| 1 | `revalidate-city-select.handler.js` | 18–22 | BAIXO/MÉDIO | Validação de índice e opção ocorre antes da primeira mutação. Caminho curto e determinístico; áudio é posterior e já está protegido por `try/catch`. |
| 2 | `revalidate-phone-correct-text.handler.js` | 28–35 | MÉDIO | Normalização e validação antecedem efeitos. Bom ganho, mas há três continuações conforme flags de `u`. |
| 3 | Handler da continuação `collect_name_text` em revalidação | 12–15 | MÉDIO | Curto e testável, porém a mesma action também representa coleta comum; a aplicabilidade precisa incluir `_revalidandoCampos` sem capturar o fluxo geral. |
| 4 | `revalidate-city-correct-text.handler.js` | 40–48 | MÉDIO/ALTO | Ganho relevante, mas busca externa e bifurcação entre cidade única, múltiplas opções e inválida aumentam o estado observável. |
| 5 | `revalidate-name-wait.handler.js` | 3–5 | MÉDIO | Poucas linhas. Antes da migração é necessário caracterizar se `tratarImprevistoPreAtendimento` pode produzir efeito e retornar valor falso. |
| 6 | `revalidate-city-wait.handler.js` | 3–5 | MÉDIO | Mesmo risco contratual do `WAIT` de nome e ganho muito baixo. |
| 7 | `revalidate-phone-wait.handler.js` | 3–5 | MÉDIO | Mesmo risco contratual dos demais `WAIT`; não deve usar fallback após efeito interno. |
| 8 | `revalidate-name-audio.handler.js` | 45–52 | ALTO | Primeiro envio ocorre antes de download/transcrição; qualquer erro posterior precisa ser propagado sem fallback. Inclui HubSpot. |
| 9 | `revalidate-phone-audio.handler.js` | 50–58 | ALTO | Muitos efeitos externos e três continuações de negócio após a mutação do telefone. |
| 10 | `revalidate-city-audio.handler.js` | 80–90 | ALTO | Maior ganho bruto, mas combina mídia, transcrição, CEP, busca de cidade, desambiguação, HubSpot, áudio e timers. |

Os números não incluem imports, montagem de `ctx` ou testes. São estimativas
do branch que poderá ser removido quando o fallback legacy daquela action for
desativado.

## Fronteiras híbridas dos melhores candidatos

### `revalidate_city_select`

Antes de efeitos:

1. conferir `decision.nextAction`;
2. conferir `_cidadesMultiplas`;
3. extrair e validar o índice;
4. resolver a opção escolhida.

Primeiro efeito: atribuição a `u.cidade` na linha aproximada 10593. Se a action,
o array, o índice ou a opção não forem aplicáveis, o handler pode retornar
`success:false` sem alteração observável. Depois da atribuição, erros devem ser
propagados ou tratados dentro do próprio fluxo; fallback fica proibido.

### `revalidate_phone_correct_text`

Antes de efeitos:

1. conferir action e presença do texto;
2. normalizar telefone;
3. validar quantidade de dígitos.

No caminho válido, o primeiro efeito é `u.whatsappContato = telNorm`, por volta
da linha 10696. No caminho inválido, o primeiro efeito é `iniciarTimer`. Os
dois caminhos podem ser isolados com clareza, mas o válido precisa preservar
as três continuações: correção em `CONFIRMAR_ENTRADA`, revalidação progressiva
e retomada da coleta de cidade.

## Respostas objetivas

### A) Qual é a próxima menor PR segura?

`revalidate_city_select`.

É o menor branch com ganho não trivial e uma fronteira híbrida verificável:
toda a decisão de aplicabilidade ocorre antes da primeira mutação. A PR deve
manter o bloco 10589–10609 intacto como fallback e testar opção válida, índice
inválido, estado temporário ausente, modo texto, modo áudio e propagação de
erro após a primeira mutação.

Os três `WAIT` têm menos linhas, mas não são a menor PR **segura** sem antes
caracterizar o contrato e os efeitos de `tratarImprevistoPreAtendimento`.

### B) Qual é a melhor relação risco/ganho agora?

`revalidate_phone_correct_text`.

Ele pode futuramente retirar cerca de 28–35 linhas, tem validação técnica antes
da primeira mutação e reutiliza dependências já exercitadas pelo handler
`revalidate-phone-confirm`. O risco é médio, concentrado nas três continuações
determinadas pelas flags existentes.

### C) Qual é o próximo handler híbrido recomendado?

`src/domain/client/handlers/revalidate-city-select.handler.js`.

Ele deve preceder a correção textual de telefone por ser a melhor unidade para
validar, com menor superfície, a semântica “não aplicável antes de efeitos;
sem fallback depois da mutação”.

### D) Existe algum conjunto já pronto para remoção futura do legacy?

Sim, com ressalva de estabilização: os branches de confirmação
`revalidate_name_confirm`, `revalidate_city_confirm` e
`revalidate_phone_confirm` têm handlers integrais, guardas de aplicabilidade e
testes dedicados. Eles formam o primeiro conjunto coerente para uma futura PR
de remoção do fallback legacy.

O `confirm-entry-invalid-retry` também está integralmente interceptado, mas
pertence a outro stage e deve ser removido em PR separada.

`revalidate_name_correct_text` ainda não está pronto para remoção total: a
negação pura retorna `success:false` intencionalmente e depende do tratamento
legacy de imprevisto. Remover seu branch agora eliminaria esse fallback.

### E) Qual região do `server.js` mais encolheu desde o início da Fase 2?

Fisicamente, nenhuma. Entre os commits híbridos analisados, `server.js` ganhou
74 linhas e perdeu 1, saldo de **+73 linhas**, porque a regra desta fase exige
preservar os branches legacy.

Em termos de execução alcançável, a região que mais encolheu foi a
**revalidação de nome**: confirmação, correção válida e retry textual inválido
passam pelos handlers antes do bloco antigo, desviando aproximadamente 30–35
linhas de execução legacy. Essa é redução lógica de responsabilidade, não
redução física do arquivo.

## Conclusão

A migração já cobre integralmente as três confirmações e parcialmente a
correção textual de nome. O passo seguinte mais seguro é a seleção de cidade
homônima; depois, a correção textual de telefone oferece o melhor ganho por
risco. Os pipelines de áudio devem permanecer no fim da sequência porque o
primeiro envio ocorre cedo e torna qualquer fallback posterior incompatível
com a regra híbrida.
