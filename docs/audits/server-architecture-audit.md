# Auditoria estrutural do `server.js`

Data: 30 de junho de 2026.

## Método

A análise foi executada sobre o arquivo presente no working tree atual.

As métricas de funções foram obtidas por varredura estática e balanceamento de chaves. Os números são aproximados, mas suficientes para comparar tamanho, concentração de decisões e acoplamento.

Critérios de risco:

- **Baixo risco:** código puro ou quase puro, sem mutação de estado e sem integração externa.
- **Médio risco:** orquestração relativamente isolada, mas com estado ou dependências injetáveis.
- **Alto risco:** mistura estado, regras, integrações, persistência e respostas ao usuário.

# Resumo executivo

O `server.js` possui atualmente:

- **15.303 linhas**;
- aproximadamente **683 KB**;
- **310 funções nomeadas**;
- **12 rotas HTTP**;
- quatro funções com mais de 200 linhas.

O tamanho não está distribuído de forma uniforme. O principal problema é `processarInterno()`:

- aproximadamente 4.582 linhas;
- cerca de 30% de todo o arquivo;
- 622 condicionais;
- 585 usos de `await`;
- mais de 300 referências aproximadas a envio, estado ou integrações.

As migrações declarativas reduziram a duplicação de UI e áudio, mas os apresentadores ainda são chamados por um dispatcher que concentra:

- interpretação da entrada;
- decisão de estado;
- mutação de sessão;
- HubSpot;
- Calendar;
- Drive;
- transcrição;
- persistência;
- envio ao WhatsApp.

Não é recomendável extrair `processarInterno()` inteiro. A redução deve ocorrer pelas bordas, começando por funções puras e contratos já testáveis.

## Funções acima de 200 linhas

| Função | Linhas aproximadas | Condicionais | `await`s | Risco |
| --- | ---: | ---: | ---: | --- |
| `processarInterno()` | 4.582 | 622 | 585 | Alto |
| `processarUrgenciaOuCorrecao()` | 957 | 157 | 148 | Alto |
| `processarMidia()` | 353 | 33 | 20 | Alto |
| `processarRetomadaOuReinicio()` | 259 | 26 | 15 | Médio |

# Top 10 maiores blocos

| Ordem | Bloco | Região aproximada | Tamanho | Responsabilidades misturadas | Dependências principais | Acoplamento | Risco de extração |
| ---: | --- | --- | ---: | --- | --- | --- | --- |
| 1 | Dispatcher central do cliente | `processarInterno()`, linhas 10.137–14.718 | 4.582 | Estados, handlers, UI, áudio, HubSpot, Drive, Calendar e persistência | Quase todo o servidor | Muito alto | Alto |
| 2 | Urgência, correções e confirmação progressiva | `processarUrgenciaOuCorrecao()`, linhas 9.179–10.135 | 957 | Interpretação, transcrição, correção cadastral, UI e mutação de estado | AssemblyAI, TTS, stages, busca de cidade | Muito alto | Alto |
| 3 | Área administrativa do WhatsApp | linhas 3.971–4.901 | ~931 | Menus, sessões admin, HubSpot, Calendar, alertas e comandos | HubSpot, Consultation, WhatsApp, memória admin | Alto | Médio |
| 4 | Apresentação e orquestração da Área do Cliente | linhas ~5.693–6.550 | ~858 | Menu, status, consulta, cancelamento, intenções e áudio | HubSpot, Calendar, telas declarativas, timers | Alto | Médio |
| 5 | Rotas e webhooks HTTP | linhas 14.788–15.303 | ~516 | Validação HTTP, busca de registros, Calendar, mensagens e respostas | Express, WhatsApp, Calendar, Consultation | Alto | Médio |
| 6 | Captura de lead e finalização cadastral | linhas 4.907–5.386 | ~480 | Contact, Deal, Notes, Drive, snapshot, temperatura e notificações | HubSpot, Drive, WhatsApp, persistência | Muito alto | Alto |
| 7 | Processamento de mídia | `processarMidia()`, linhas 8.406–8.758 | 353 | Download, transcrição, upload, classificação, Notes, telas e estado documental | WhatsApp, AssemblyAI, Drive, HubSpot | Muito alto | Alto |
| 8 | Estado local, timers e recuperação | linhas ~2.887–3.208 | ~322 | Timers, retomada, captura incompleta, persistência e envio | `users`, persistence, WhatsApp, HubSpot | Muito alto | Alto |
| 9 | Pipeline de áudio do atendimento | linhas ~8.909–9.177 | ~269 | Canal, transcrição, classificação e roteamento por stage | AssemblyAI, IA, estado e UI | Alto | Alto |
| 10 | Retomada e reinício | `processarRetomadaOuReinicio()`, linhas 8.046–8.304 | 259 | Comandos globais, restauração, estado e respostas | flow map, timers, sessão, WhatsApp | Alto | Médio |

# Regiões com alta concentração de handlers

## `processarInterno()`

É a maior concentração do sistema. As regiões mais densas são:

| Região aproximada | Conteúdo predominante | Evidência |
| --- | --- | --- |
| 10.251–10.500 | comandos globais, entrada e desvios iniciais | ~15 handlers em 250 linhas |
| 11.501–12.000 | acolhimento, áudio e confirmações | ~24 handlers e 10 comparações de stage |
| 12.251–13.500 | nome, WhatsApp, cidade, área e classificação | dezenas de branches por stage |
| 13.501–14.000 | novo caso, coleta jurídica e urgência | ~52 handlers em 500 linhas |
| 14.001–14.750 | Área do Cliente e documentos | ~38 handlers, Notes, Drive e persistência |

## `processarUrgenciaOuCorrecao()`

Entre as linhas 9.251 e 10.000 há aproximadamente:

- 54 handlers;
- 13 verificações de stage;
- áudio, localização e correções no mesmo bloco.

## `processarAdminWhatsApp()`

As linhas 4.751–5.000 concentram aproximadamente 25 decisões por comando administrativo, embora a função tenha somente 111 linhas por usar retornos compactos.

# Mistura de responsabilidades

| Bloco | Regra de negócio | UI | Integração externa | Persistência | Consequência |
| --- | :---: | :---: | :---: | :---: | --- |
| `processarInterno()` | Sim | Sim | Sim | Sim | Qualquer extração ampla possui grande superfície de regressão. |
| `processarUrgenciaOuCorrecao()` | Sim | Sim | Sim | Sim | Correções aparentemente visuais podem alterar dados cadastrais. |
| `processarMidia()` | Sim | Sim | Sim | Sim | Falha pode gerar perda, duplicação ou Note inconsistente. |
| `finalizarCadastro()` | Sim | Parcial | Sim | Sim | Ordem das escritas é operacionalmente relevante. |
| Timers e retomadas | Sim | Sim | Sim | Sim | Erros aparecem somente após inatividade ou reinício. |
| Admin WhatsApp | Sim | Sim | Sim | Parcial | Sessão administrativa e operação real estão acopladas. |
| Rotas Calendar | Sim | Parcial | Sim | Parcial | Alteração indevida pode afetar eventos reais. |
| Detectores de intenção | Sim, pura | Não | Não | Não | São candidatos seguros para extração. |
| Formatadores de áudio/UI | Não | Sim | Não | Não | Baixo risco se o contrato textual for caracterizado. |

# Extrações de baixo risco

## 1. Detectores puros de intenção do cliente

Funções candidatas:

- `detectarIntencaoCliente()`;
- `pareceDuvidaCasoAtualOuNovo()`;
- `pareceNovaSituacaoCliente()`;
- `detectarModoAtendimento()`.

Tamanho estimado: **50–80 linhas**, mais testes.

Dependências:

- `normalizarTextoGatilho()`;
- nenhuma escrita;
- nenhuma integração externa;
- nenhum acesso obrigatório a `users`.

Benefício:

- cria uma fronteira testável antes do dispatcher;
- reduz o risco de futuras alterações de linguagem;
- diminui `server.js` sem mexer em fluxo, estado ou infraestrutura.

Risco: **baixo**.

## 2. Formatadores de apresentação e áudio automático

Funções candidatas:

- `textoAudioOpcoes()`;
- `removerFormatacaoParaAudio()`;
- `textoAudioAutomatico()`;
- `textoTemMarcadorVisual()`;
- `saudacaoPorHorarioCliente()`.

Tamanho estimado: **70–110 linhas**.

Dependências:

- sanitização textual;
- nenhuma integração externa;
- contrato de texto utilizado por telas legadas.

Risco: **baixo**, desde que existam testes de snapshot textual.

## 3. Predicados e formatadores administrativos puros

Exemplos:

- labels;
- resumos;
- ordenação;
- cálculo de prioridade sem I/O.

Tamanho estimado: **80–150 linhas**, distribuídas na região administrativa.

Risco: **baixo**, mas o ganho deve ser limitado apenas às funções comprovadamente puras.

# Extrações de médio risco

## 1. Retomada e reinício

Alvo: `processarRetomadaOuReinicio()`.

Tamanho: 259 linhas.

Dependências:

- `flowMap`;
- timers;
- sessão;
- último payload;
- comandos globais.

Risco: **médio**. A função já possui uma fronteira clara, mas depende da ordem de mutações.

## 2. Controllers das rotas operacionais

Alvo:

- `/agendamento`;
- `/buscar-contato-reuniao`;
- `/evento-cancelado`;
- `/pos-consulta`;
- `/consulta-status`;
- `/lembrete`.

Tamanho potencial removido: **350–500 linhas**.

Dependências:

- Express;
- validação interna;
- Calendar/Consultation;
- WhatsApp.

Risco: **médio** se a extração preservar exatamente assinatura HTTP, status e payload.

## 3. Área administrativa do WhatsApp

Tamanho potencial: **700–900 linhas** entre telas, sessões e dispatcher.

Dependências:

- funções de consulta HubSpot;
- estado administrativo em memória;
- Consultation Read Model;
- notificações.

Risco: **médio**. Há uma fronteira funcional clara, mas muitas dependências devem ser passadas explicitamente.

## 4. Orquestração da Área do Cliente

Alvo: funções de menu, status, consulta e intenção após a apresentação já migrada.

Tamanho potencial: **400–700 linhas**.

Risco: **médio**. As telas estão isoladas, porém as funções ainda alteram timers, caso ativo e estado de consulta.

# Extrações de alto risco

## `processarInterno()`

Não deve ser movido integralmente.

Uma extração monolítica apenas transferiria 4.582 linhas para outro arquivo sem reduzir acoplamento. O risco inclui regressões em:

- ordenação de handlers;
- prioridade de comandos;
- seleção de caso;
- retomadas;
- estados documentais;
- coleta de terceiro;
- agenda.

## `processarUrgenciaOuCorrecao()`

Apesar de ser uma única função, contém vários domínios funcionais. Deve ser quebrada por estado somente depois de testes de caracterização abrangentes.

## `processarMidia()`

Não é uma extração mecânica. A função combina integridade documental, transcrição e roteamento de intenção. Uma mudança incorreta pode causar efeitos externos irreversíveis.

## Timers e persistência

Os timers dependem da identidade do usuário, stage esperado, última mensagem, retomada e captura de lead. A extração exige testes com relógio controlado e reinício.

## Finalização cadastral

`finalizarCadastro()` e captura de lead coordenam várias escritas externas. A ordem das operações deve ser documentada antes de qualquer separação.

# Próxima refatoração recomendada

Extrair apenas os **detectores puros de intenção do cliente** para um módulo folha.

Escopo recomendado:

1. mover `detectarIntencaoCliente()`;
2. mover `pareceDuvidaCasoAtualOuNovo()`;
3. mover `pareceNovaSituacaoCliente()`;
4. mover `detectarModoAtendimento()`;
5. adicionar testes de caracterização com as mesmas entradas atuais;
6. substituir somente as referências por importações, sem mudar expressões regulares.

Por que esta é a primeira extração:

- não altera estado;
- não toca em HubSpot, Calendar, Drive ou WhatsApp;
- não altera persistência;
- não exige injeção de dezenas de dependências;
- possui rollback trivial;
- cria uma fronteira útil para reduzir gradualmente o dispatcher.

Não é recomendado começar pela maior função. O melhor primeiro passo é remover lógica pura de dentro dela e estabilizar a fronteira.

# Ganho estimado

## Primeira extração

- redução direta: aproximadamente **50–80 linhas**;
- redução de dependências do dispatcher: pequena, mas real;
- ganho de testabilidade: alto;
- risco operacional: baixo.

## Pacote conservador de baixo risco

Somando detectores, formatadores de áudio e helpers administrativos puros:

- redução estimada: **200–340 linhas**;
- redução percentual do `server.js`: aproximadamente **1,3%–2,2%**;
- sem necessidade de alterar arquitetura ou fluxos.

## Médio prazo

Após caracterização de retomadas e controllers:

- redução adicional possível: **1.000–1.600 linhas**;
- `server.js` poderia cair para aproximadamente **13.400–14.100 linhas**;
- o ganho principal seria separação de responsabilidades, não apenas contagem física.

Uma redução maior do que isso exigiria decompor `processarInterno()` por famílias de estado. Hoje essa intervenção é de alto risco e não é recomendada como próximo passo.
