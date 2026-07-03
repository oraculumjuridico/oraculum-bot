# Fase 10B — estratégia de migração de identidade

## Objetivo

Reduzir progressivamente a ambiguidade entre:

- Person;
- Communication Endpoint;
- Conversation Actor;
- Client;
- Case Party;
- Representative;
- Authorization;
- HubSpot Contact.

Esta estratégia não define implementação, banco, APIs, classes ou alterações no HubSpot.

## Princípios da migração

1. Contact continua sendo um registro técnico válido do HubSpot.
2. Contact deixa de ser tratado como significado completo de pessoa, canal ou papel.
3. Nenhum identificador legado deve ser descartado no início.
4. Conceitos novos devem coexistir com os atuais até sua equivalência ser comprovada.
5. Dados ambíguos não devem ser migrados por inferência silenciosa.
6. Casos simples devem continuar funcionando durante toda a transição.
7. Casos para terceiros devem orientar a validação da nova linguagem.
8. Cada etapa precisa ser observável, reversível e mensurável.
9. Consultation Calendar-first não deve ser reaberta para migrar identidade.
10. Migração sem evidência deve falhar para revisão, não escolher o primeiro Contact.

## 1. Menor mudança possível

A menor mudança com maior valor é:

> **deixar explícito qual papel o registro atual exerce no caso, sem substituir Contact.**

Hoje, uma associação Contact–Deal significa apenas que existe um vínculo. O sistema presume que esse Contact seja:

- pessoa atendida;
- cliente;
- representante;
- destinatário;
- participante da consulta.

A primeira redução de ambiguidade consiste em distinguir, conceitualmente:

```text
HubSpot Contact Identifier
≠
papel exercido no Legal Case
```

No primeiro momento, não é necessário resolver toda a identidade civil nem separar todos os canais. É suficiente impedir que “Contact associado” continue significando automaticamente “pessoa atendida”.

### Papel mínimo obrigatório

O primeiro papel a ser distinguido deve ser:

> **Pessoa Atendida no Legal Case.**

Com isso, torna-se possível responder:

- de quem é o problema jurídico;
- quem não deve ser presumido como assistido;
- quando o Contact atual representa apenas solicitante ou representante.

### Resultado esperado

A menor mudança reduz imediatamente:

- seleção do primeiro Contact como participante principal;
- atribuição incorreta de narrativa;
- confusão em casos para terceiros;
- alias entre Contact e Client;
- incerteza sobre quem é sujeito do caso.

## 2. Primeiro conceito novo

O primeiro conceito a ser introduzido operacionalmente deve ser:

> **Case Party.**

### Justificativa

Case Party:

- resolve a ambiguidade mais próxima do negócio;
- permite manter Contact durante a transição;
- não exige identificar toda Person imediatamente;
- separa vínculo com o caso de cadastro CRM;
- permite representar assistido, representante e responsável financeiro;
- prepara a adoção posterior de Authorization.

### Primeiro papel

A primeira variação de Case Party deve ser:

```text
PERSONA_ATENDIDA
```

ou equivalente na linguagem oficial “pessoa atendida”.

Depois:

1. solicitante;
2. representante;
3. cliente contratante;
4. contato autorizado;
5. responsável financeiro;
6. terceiro interessado.

### Por que Person não vem primeiro

Person é o núcleo definitivo da identidade, mas introduzi-la primeiro exigiria resolver imediatamente:

- deduplicação;
- múltiplos telefones;
- Contacts duplicados;
- merge;
- identidade civil;
- vínculos históricos.

Case Party permite aprender quais pessoas e papéis realmente precisam ser distinguidos antes dessa migração mais ampla.

## 3. Coexistência com Contact

### Significado durante a transição

Contact deve ser tratado como:

> **registro CRM externo que pode referenciar uma pessoa, mas não define sozinho seu papel ou autorização.**

### Regras de coexistência

1. `contactId` continua válido como HubSpot Contact Identifier.
2. Contact continua recebendo sincronizações tecnicamente necessárias.
3. Deals existentes continuam associados a Contacts.
4. Case Party passa a declarar o papel exercido no caso.
5. Contact sem Case Party explícita permanece “legado não classificado”.
6. Nenhum Contact legado deve ser automaticamente classificado como Representative.
7. Casos simples podem receber classificação de pessoa atendida somente quando a evidência for inequívoca.
8. Casos ambíguos devem permanecer pendentes de revisão.
9. `personId` não deve ganhar novo significado enquanto continuar sendo alias.
10. Relatórios devem distinguir “Contact associado” de “Case Party confirmada”.

### Três estados de transição

| Estado | Significado |
|---|---|
| Legado | apenas Contact–Deal existente |
| Classificado | Contact possui papel explícito no caso |
| Identificado | papel aponta para Person reconhecida, independente do Contact |

Esses estados permitem convivência gradual sem Big Bang.

## 4. Contratos externos dependentes de Contact

### HubSpot

- objeto Contact;
- `contactId`;
- propriedade `phone`;
- `firstname`;
- associação Contact–Deal;
- associação Note–Contact;
- busca de Deals do Contact;
- primeiro Contact associado ao Deal.

Impacto: **ALTO**.

### Google Calendar

- `contactId` em metadata;
- `personId` atualmente preenchido por Contact;
- nome e WhatsApp na descrição;
- participante presumido da consulta.

Impacto no estado da agenda: **BAIXO**.

Impacto na identidade do participante: **ALTO**.

### WhatsApp

- número de origem;
- número de destino;
- sessão indexada por telefone;
- templates para terceiro;
- reconhecimento ou rejeição do caso;
- retomada pelo número.

Impacto: **ALTO**.

### Webhooks

Contratos relevantes:

- `/agendamento`;
- `/buscar-contato-reuniao`;
- `/evento-cancelado`;
- `/pos-consulta`;
- `/consulta-status`;
- `/lembrete`.

Campos relevantes:

- `phone`;
- `name`;
- `contactId`;
- `personId`;
- `dealId`;
- `caseid`;
- `eventId`.

Impacto: **ALTO**.

### Make, n8n e integrações equivalentes

Dependem de:

- reunião HubSpot;
- Contact associado;
- telefone;
- nome;
- Deal;
- Calendar.

Impacto: **ALTO**.

### Sessão e snapshot

Dependem de:

- `contatoId`;
- `whatsappContato`;
- `_numero`;
- `nome`;
- `nomeContato`;
- flags de terceiro;
- `negocioId`.

Impacto: **ALTO**.

### Notes e documentos

Dependem de:

- Contact para associação;
- Deal para contexto;
- nomes e telefone em texto;
- autoria inferida.

Impacto: **ALTO**.

### Relatórios e painéis

Dependem de:

- Contact como cliente;
- Deals associados;
- primeiro Contact;
- nome e telefone;
- consulta atribuída ao Contact.

Impacto: **ALTO**.

## 5. Como evitar Big Bang

### Compatibilidade por adição

Conceitos novos devem ser adicionados ao lado dos legados.

Durante a transição:

- Contact continua existindo;
- `contactId` continua trafegando;
- papéis novos são observados paralelamente;
- consumidores legados permanecem disponíveis;
- divergências são medidas antes de alterar decisões.

### Shadow classification

Os papéis podem ser classificados inicialmente sem controlar o fluxo.

Objetivo:

- comparar classificação nova com comportamento atual;
- medir casos ambíguos;
- identificar falsos positivos;
- validar o vocabulário.

### Dual interpretation

Durante um período:

- visão legada responde “qual Contact está associado?”;
- visão nova responde “qual Case Party exerce qual papel?”.

Nenhuma delas deve sobrescrever silenciosamente a outra.

### Migração somente quando inequívoca

Classificar automaticamente apenas quando todos os sinais concordarem.

Exemplo conceitual de caso inequívoco:

- uma única pessoa;
- telefone confirmado;
- atendimento próprio;
- sem flag de terceiro;
- sem nome divergente;
- sem múltiplos Contacts ou Deals ambíguos.

Casos para terceiros, telefone compartilhado ou nome divergente exigem revisão.

### Rollout por consumidor

Cada consumidor adota a nova linguagem separadamente:

1. relatórios;
2. telas administrativas;
3. fluxos de leitura;
4. automações não críticas;
5. comunicação;
6. Consultation;
7. decisões de CRM.

Consumidores críticos devem migrar por último, depois da validação.

### Depreciação tardia

Aliases como `personId = contactId` só devem ser removidos quando:

- todos os produtores enviarem os dois significados corretamente;
- consumidores estiverem migrados;
- legado estiver identificado;
- rollback estiver disponível.

## 6. Sequência incremental de adoção

### Etapa 0 — baseline semântica

Objetivo:

- medir como Contact, telefone e papéis são usados hoje.

Atividades conceituais:

- inventariar aliases;
- classificar contratos;
- estabelecer casos de referência;
- definir indicadores.

Dados alterados: nenhum.

Reversibilidade: total.

### Etapa 1 — vocabulário e identificação de papel

Objetivo:

- distinguir HubSpot Contact Identifier de papel no caso.

Escopo:

- pessoa atendida;
- solicitante;
- representante presumido.

Dados alterados: nenhum no primeiro momento observacional.

Reversibilidade: total.

### Etapa 2 — Case Party paralela

Objetivo:

- representar papéis sem remover Contact.

Escopo inicial:

- pessoa atendida;
- solicitante;
- representante.

Dados alterados:

- novos vínculos conceituais para casos classificados.

Reversibilidade:

- alta enquanto consumidores ainda usam legado;
- rollback consiste em ignorar a classificação nova.

### Etapa 3 — Conversation Actor e Communication Endpoint

Objetivo:

- separar quem conversa do meio utilizado.

Escopo:

- sessão atual;
- titular declarado;
- operador;
- número de origem;
- número preferencial.

Dados alterados:

- classificação de sessões e canais;
- histórico apenas quando disponível.

Reversibilidade:

- alta em modo paralelo;
- média quando automações começarem a consumir o novo significado.

### Etapa 4 — Person

Objetivo:

- criar continuidade de identidade independente de Contact e telefone.

Escopo:

- mapear pessoas inequívocas;
- manter referências aos Contacts;
- não realizar merges ambíguos.

Dados alterados:

- identidade canônica;
- vínculos com Contacts e endpoints;
- associação com Case Parties.

Reversibilidade:

- média;
- registros novos podem ser desconsiderados, mas merges ou consolidações não são facilmente reversíveis.

### Etapa 5 — Representative e Authorization

Objetivo:

- distinguir relação familiar, representação e permissão de acesso.

Escopo:

- casos para terceiros;
- reconhecimento;
- escopo de comunicação;
- validade e revogação.

Dados alterados:

- relacionamentos e histórico.

Reversibilidade:

- média para relações novas;
- baixa se o legado for reinterpretado sem evidência.

### Etapa 6 — Client e Financial Responsible

Objetivo:

- separar pessoa atendida, contratante e responsável financeiro.

Dados alterados:

- papéis contratuais e financeiros;
- histórico de vigência.

Reversibilidade:

- média;
- decisões financeiras confirmadas precisam ser preservadas.

### Etapa 7 — adoção por consumidores

Objetivo:

- substituir inferências legadas por conceitos explícitos.

Ordem recomendada:

1. relatórios;
2. painéis;
3. consultas read-only;
4. Notes e autoria;
5. automações;
6. comunicação;
7. Consultation participant metadata;
8. seleção e criação de Deals.

Dados alterados:

- depende do consumidor;
- contratos externos podem exigir versionamento.

Reversibilidade:

- alta em relatórios;
- média em automações;
- baixa em contratos externos sem compatibilidade.

### Etapa 8 — depreciação do legado

Objetivo:

- remover significados ambíguos, não necessariamente o objeto Contact.

Alvos:

- `personId = contactId`;
- primeiro Contact como participante;
- telefone como identidade;
- Contact como Client;
- associação sem papel como decisão.

Dados alterados:

- eventual consolidação ou arquivamento de compatibilidade.

Reversibilidade: baixa.

Deve ocorrer somente após janela prolongada de validação.

## 7. Etapas reversíveis

| Etapa | Reversibilidade | Condição |
|---|---|---|
| baseline semântica | total | apenas observação |
| vocabulário | total | não controla operação |
| shadow classification | total | resultado não é fonte de decisão |
| Case Party paralela | alta | legado continua disponível |
| Actor e Endpoint paralelos | alta | sessão legada continua íntegra |
| relatórios novos | alta | relatórios antigos preservados |
| painéis read-only | alta | sem escrita ou decisão |
| Person independente | média | sem merge destrutivo |
| Authorization | média | relações append-only e revogáveis |
| automações usando novos papéis | média | feature rollback e contrato duplo |
| migração de contratos externos | média/baixa | depende de compatibilidade de versão |
| merge de identidade | baixa | difícil desfazer com segurança |
| remoção de aliases legados | baixa | exige consumidores integralmente migrados |

## 8. Etapas que exigem migração de dados

### Não exigem migração

- vocabulário;
- inventário;
- baseline;
- shadow classification em memória;
- relatórios puramente comparativos;
- validação de contratos.

### Exigem criação ou enriquecimento de dados

- Case Party;
- vínculo Person–Contact;
- Communication Endpoint;
- titularidade e operação;
- Representative;
- Authorization;
- Client contratante;
- Financial Responsible;
- autoria e proveniência.

### Exigem backfill

- papel da pessoa atendida em Deals existentes;
- solicitante de casos para terceiros;
- representação conhecida;
- participant metadata de consultas;
- classificação de Contacts associados;
- vínculo de canais conhecidos.

### Exigem revisão humana

- telefone compartilhado;
- nome divergente;
- múltiplos Contacts com mesmo telefone;
- múltiplas pessoas em um Contact;
- primeiro Contact possivelmente incorreto;
- terceiro que não reconheceu o caso;
- representante sem autorização comprovada;
- responsável financeiro inferido;
- autoria incerta de relato ou documento.

### Dados que não devem ser inferidos automaticamente

- representação legal;
- autorização ampla;
- titularidade definitiva do canal;
- identidade civil;
- responsável financeiro;
- merge entre pessoas;
- pessoa atendida em caso ambíguo.

## 9. Critérios de sucesso por etapa

### Etapa 0

- 100% dos aliases conhecidos inventariados;
- contratos externos catalogados;
- amostra de casos simples e de terceiro definida;
- baseline mensurável.

### Etapa 1

- linguagem usada de forma consistente;
- “Contact”, “cliente” e “terceiro” deixam de orientar decisões sem qualificação;
- pessoa atendida é identificável nos novos atendimentos;
- nenhum comportamento operacional alterado.

### Etapa 2

- todo novo caso possui Case Party pessoa atendida;
- casos para terceiros distinguem solicitante e assistido;
- divergência entre legado e papel novo é mensurada;
- nenhum caso simples sofre regressão.

### Etapa 3

- toda nova sessão distingue Endpoint e Conversation Actor;
- canal compartilhado pode ser marcado como ambíguo;
- troca de número não cria automaticamente nova identidade;
- destinatário não é escolhido apenas por Contact.

### Etapa 4

- Person possui continuidade independente de telefone;
- Contact permanece referência externa;
- não há merge automático ambíguo;
- múltiplos endpoints podem referenciar a mesma Person;
- métricas distinguem Person de Contact.

### Etapa 5

- todo Representative possui vínculo com pessoa representada e Legal Case;
- Authorization possui escopo e vigência;
- parentesco isolado não concede acesso;
- reconhecimento e revogação mantêm histórico.

### Etapa 6

- pessoa atendida, Client contratante e Financial Responsible podem ser distintos;
- cobrança não depende do primeiro Contact;
- papéis financeiros possuem confirmação;
- relatórios contratuais usam o papel correto.

### Etapa 7

- consumidores críticos não usam `results[0]` como papel;
- webhooks não dependem exclusivamente de telefone para identidade;
- Calendar mantém estado atual sem regressão;
- participant metadata possui significado inequívoco;
- relatórios novos e legados convergem nos casos simples.

### Etapa 8

- `personId` identifica somente Person;
- `contactId` identifica somente HubSpot Contact;
- telefone identifica somente Communication Endpoint;
- Contact não determina Client ou Case Party;
- aliases legados não participam de decisão;
- rollback final foi testado antes da remoção.

## Indicadores transversais

Durante todas as etapas:

- zero informação enviada à pessoa errada;
- zero Deal associado incorretamente por migração;
- zero perda de histórico;
- zero regressão Calendar-first;
- percentual de casos ambíguos conhecido;
- revisão humana concentrada apenas onde necessária;
- capacidade de explicar cada vínculo por evidência.

## Decisão estratégica

A migração deve começar por:

```text
Contact associado
→ Contact com papel explícito no caso
→ Case Party
→ Conversation Actor e Endpoint
→ Person
→ Representative e Authorization
→ Client e Financial Responsible
```

Essa sequência evita Big Bang porque preserva Contact como contrato técnico enquanto remove, progressivamente, seus significados implícitos.

## Conclusão

A primeira evolução não deve tentar eliminar Contact nem criar imediatamente uma identidade global.

O primeiro ganho deve ser semântico:

> saber qual papel cada registro exerce em cada Legal Case.

Depois disso, Person e Communication Endpoint podem ser separados com evidência, sem transformar ambiguidades atuais em dados permanentes.
