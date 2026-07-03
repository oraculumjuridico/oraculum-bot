# CRM Identity — roadmap oficial

## Objetivo

Consolidar o ciclo de descoberta e planejamento do domínio CRM Identity e registrar a sequência prevista para adoção incremental.

Este roadmap não autoriza:

- implementação;
- alteração no HubSpot;
- migração de dados;
- alteração em Consultation;
- remoção de contratos legados.

## Visão geral

| Fase | Estado | Resultado |
|---|---|---|
| Fase 10A — Discovery | **CONCLUÍDA** | problema, domínio, lacunas e linguagem definidos |
| Fase 10B — Migration Strategy | **CONCLUÍDA** | estratégia incremental, coexistência e critérios definidos |
| Fase 10C — Incremental Adoption | **PLANEJADA** | sete etapas condicionadas por gates |

## Fase 10A — Discovery

Estado: **CONCLUÍDA**.

### Resultados

- maior gargalo identificado;
- identidade separada conceitualmente de canal;
- atores e papéis definidos;
- ambiguidades atuais mapeadas;
- impacto nos componentes identificado;
- linguagem ubíqua oficial estabelecida;
- aliases perigosos catalogados.

### Documentos de referência

- `crm-domain-identity-model.md`;
- `crm-identity-gap-analysis.md`;
- `crm-ubiquitous-language.md`;
- `crm-language-adoption-map.md`.

### Conclusão

O modelo atual funciona sem ambiguidade apenas quando:

```text
Person = titular do WhatsApp = pessoa atendida = Client = Contact
```

Casos para terceiros demonstram que essa equivalência não é universal.

## Fase 10B — Migration Strategy

Estado: **CONCLUÍDA**.

### Resultados

- Contact preservado como contrato técnico;
- Big Bang descartado;
- Case Party definido como primeiro conceito de adoção;
- shadow classification definida como caminho inicial;
- coexistência entre legado e modelo novo estabelecida;
- etapas reversíveis identificadas;
- migrações que exigem revisão humana catalogadas;
- critérios de sucesso por etapa definidos.

### Documento de referência

- `crm-identity-migration-strategy.md`.

### Decisão

A adoção deve seguir:

```text
papel no caso
→ pessoa atendida explícita
→ ator da conversa
→ canal
→ identidade estável
→ representação e autorização
→ remoção de aliases
```

## Fase 10C — Incremental Adoption

Estado: **PLANEJADA**.

### Regras de execução futura

1. Uma etapa só começa após conclusão formal da anterior.
2. Contact continua disponível durante a transição.
3. Nenhuma classificação ambígua será inferida silenciosamente.
4. Casos simples e para terceiros serão validados separadamente.
5. Toda etapa deverá possuir modo de observação antes de controlar decisões.
6. Migrações destrutivas são proibidas antes da Etapa 7.
7. Consultation permanece Calendar-first.
8. `contactId` continua significando HubSpot Contact Identifier.
9. `personId` não pode ser reinterpretado antes da Etapa 5.
10. Rollback e métricas são requisitos de entrada para qualquer mudança operacional.

## Etapa 1 — Case Party

### Objetivo

Introduzir o conceito de participação de uma pessoa em um Legal Case sem remover Contact.

Case Party deve permitir distinguir que:

- um registro está relacionado ao caso;
- a relação possui um papel;
- associação técnica não é significado funcional.

### Impacto

Áreas afetadas conceitualmente:

- vínculo Contact–Deal;
- leitura de participantes;
- relatórios;
- casos para terceiros;
- Notes e autoria;
- seleção de destinatários.

Impacto estimado: **ALTO**, com baixo impacto operacional inicial se adotado apenas em observação.

### Reversibilidade

**ALTA**.

Enquanto Contact e associações legadas permanecerem intactos, a nova classificação pode ser ignorada sem interromper o fluxo atual.

### Necessidade de migração

Inicialmente:

- nenhuma migração obrigatória;
- classificação paralela de novos casos;
- inventário dos vínculos existentes.

Posteriormente:

- backfill apenas de casos inequívocos;
- casos ambíguos exigem revisão.

### Dependências

- linguagem ubíqua aprovada;
- papéis iniciais definidos;
- inventário de associações Contact–Deal;
- métricas de divergência;
- amostra de casos próprios e para terceiros.

### Critério de conclusão

- todo novo vínculo de pessoa com caso possui papel conhecido ou status “não classificado”;
- Contact associado não é presumido automaticamente como participante principal;
- relatórios distinguem associação técnica de Case Party;
- divergências com o legado são mensuráveis;
- nenhum fluxo atual sofre regressão.

## Etapa 2 — Pessoa Atendida Explícita

### Objetivo

Garantir que todo Legal Case identifique explicitamente a pessoa cuja situação jurídica é objeto do atendimento.

### Impacto

Áreas afetadas:

- abertura de caso;
- casos para terceiros;
- narrativa;
- documentos;
- consultas;
- relatórios;
- seleção de caso;
- histórico jurídico.

Impacto estimado: **ALTO**.

### Reversibilidade

**ALTA** em modo paralelo.

**MÉDIA** quando a pessoa atendida passar a controlar comunicações ou decisões.

### Necessidade de migração

- novos casos devem receber classificação explícita;
- casos legados inequívocos podem ser classificados;
- casos com múltiplos Contacts, telefone divergente ou terceiro exigem revisão;
- nenhuma identidade civil deve ser inferida apenas pelo telefone.

### Dependências

- Etapa 1 concluída;
- papel de pessoa atendida definido em Case Party;
- critérios para caso inequívoco;
- tratamento explícito de “não identificado”;
- autoria de relato distinguível.

### Critério de conclusão

- 100% dos novos casos possuem pessoa atendida explícita ou pendência declarada;
- solicitante e pessoa atendida são distintos quando necessário;
- nenhum primeiro Contact é usado como pessoa atendida por convenção;
- relatórios conseguem contar casos por pessoa atendida;
- casos para terceiros preservam quem abriu e para quem foi aberto.

## Etapa 3 — Conversation Actor

### Objetivo

Identificar quem efetivamente participa da conversa sem presumir que essa pessoa seja a pessoa atendida, Client ou titular do canal.

### Impacto

Áreas afetadas:

- sessão;
- autoria de mensagens;
- fluxos para terceiros;
- retomada;
- documentos;
- Notes;
- reconhecimento do caso;
- acesso a informações.

Impacto estimado: **ALTO**.

### Reversibilidade

**ALTA** em observação paralela.

**MÉDIA** após o ator passar a controlar autorização e acesso.

### Necessidade de migração

- sessões novas devem declarar ator conhecido, declarado ou desconhecido;
- histórico antigo pode permanecer sem ator confirmado;
- mensagens anteriores não devem receber autoria inferida sem evidência;
- casos simples podem ser classificados quando todos os sinais concordarem.

### Dependências

- pessoa atendida explícita;
- vocabulário de ator confirmado;
- distinção entre ator e solicitante;
- estado para ator não identificado;
- critérios de verificação.

### Critério de conclusão

- toda nova sessão distingue Conversation Actor de pessoa atendida;
- autoria de novas interações é conhecida ou marcada como desconhecida;
- iniciar conversa não cria automaticamente Case Party;
- casos para terceiros mantêm atores distintos;
- nenhuma comunicação confidencial é liberada apenas por posse do número.

## Etapa 4 — Communication Endpoint

### Objetivo

Separar o meio de comunicação da identidade da Person e do papel no Legal Case.

### Impacto

Áreas afetadas:

- WhatsApp;
- telefone;
- busca de Contact;
- sessão;
- webhooks;
- lembretes;
- destinatários;
- consentimento;
- troca ou compartilhamento de número.

Impacto estimado: **ALTO**.

### Reversibilidade

**ALTA** enquanto o endpoint for mantido paralelamente ao telefone legado.

**MÉDIA** após automações passarem a consumir Endpoint Identifier.

### Necessidade de migração

- números existentes precisam ser reconhecidos como endpoints;
- vínculo com Person não deve ser presumido em casos ambíguos;
- titularidade, operação e verificação podem exigir enriquecimento;
- histórico de titularidade não deve ser inventado;
- formatos normalizados precisam preservar referência ao valor original.

### Dependências

- Conversation Actor;
- regra de titular versus operador;
- critérios de posse e verificação;
- contratos externos catalogados;
- política de canal compartilhado;
- política de canal autorizado por caso.

### Critério de conclusão

- telefone identifica um Communication Endpoint, não uma Person;
- sessão referencia ator e endpoint separadamente;
- troca de número não cria automaticamente nova identidade;
- número compartilhado pode ser representado sem consolidar pessoas;
- webhooks distinguem localização por canal de identificação pessoal.

## Etapa 5 — Person

### Objetivo

Estabelecer identidade estável independente de Contact, telefone, sessão e papel.

### Impacto

Áreas afetadas:

- deduplicação;
- múltiplos canais;
- múltiplos casos;
- Contacts;
- relatórios;
- Consultation participant metadata;
- documentos;
- histórico jurídico.

Impacto estimado: **MUITO ALTO**.

### Reversibilidade

**MÉDIA** enquanto não houver merge destrutivo.

**BAIXA** após consolidação de identidades ou remoção de duplicidades.

### Necessidade de migração

- criação de referências entre Person e Contacts;
- associação de endpoints;
- associação de Case Parties;
- backfill somente para casos inequívocos;
- revisão humana para colisões;
- preservação integral de referências legadas.

Não migrar automaticamente:

- pessoas com mesmo telefone;
- Contacts com nomes divergentes;
- identidade civil não confirmada;
- múltiplos Contacts potencialmente pertencentes à mesma pessoa.

### Dependências

- Case Party;
- pessoa atendida explícita;
- Conversation Actor;
- Communication Endpoint;
- critérios de identidade;
- política de duplicidade;
- política de merge;
- trilha de proveniência.

### Critério de conclusão

- Person mantém continuidade independente de telefone;
- um Contact é tratado como referência CRM;
- uma Person pode possuir múltiplos endpoints;
- uma Person pode participar de múltiplos casos;
- métricas distinguem Person, Contact e Endpoint;
- `personId` identifica exclusivamente Person;
- nenhum merge ambíguo é automático.

## Etapa 6 — Representative e Authorization

### Objetivo

Formalizar quem atua por outra Person, com qual fundamento, escopo, validade e permissão de acesso.

### Impacto

Áreas afetadas:

- casos para terceiros;
- reconhecimento;
- comunicação;
- documentos;
- consultas;
- confidencialidade;
- LGPD;
- contratação;
- acesso ao histórico.

Impacto estimado: **MUITO ALTO**.

### Reversibilidade

**MÉDIA** para vínculos novos e revogáveis.

**BAIXA** se relações legadas forem inferidas sem evidência ou usadas para conceder acesso.

### Necessidade de migração

- relações conhecidas podem ser registradas com proveniência;
- relações apenas narrativas exigem revisão;
- reconhecimento do caso não deve ser convertido automaticamente em autorização irrestrita;
- parentesco não deve ser convertido automaticamente em representação;
- revogações e mudanças precisam preservar histórico.

### Dependências

- Person;
- Case Party;
- pessoa atendida explícita;
- critérios de representação;
- escopos de Authorization;
- estados pendente, validada, suspensa e revogada;
- política de acesso e confidencialidade.

### Critério de conclusão

- todo Representative referencia representado e Legal Case;
- toda permissão possui Authorization ou fundamento explícito;
- Authorization possui escopo e vigência;
- parentesco isolado não concede acesso;
- revogação é efetiva e histórica;
- destinatários de informação são selecionados por autorização.

## Etapa 7 — Remoção de aliases legados

### Objetivo

Remover significados implícitos sem necessariamente eliminar o objeto HubSpot Contact.

Aliases-alvo:

- `personId = contactId`;
- `phone = Person`;
- primeiro Contact = participante principal;
- Contact existente = Client;
- Contact associado = pessoa atendida;
- posse do número = Authorization.

### Impacto

Áreas afetadas:

- HubSpot;
- sessões;
- Calendar metadata;
- webhooks;
- automações;
- relatórios;
- testes;
- snapshots;
- Notes.

Impacto estimado: **MUITO ALTO**.

### Reversibilidade

**BAIXA**.

A etapa só deve começar após:

- consumidores migrados;
- contratos versionados;
- legado identificado;
- rollback testado;
- janela de estabilidade.

### Necessidade de migração

- metadata legada;
- snapshots;
- referências em sessões;
- relatórios;
- contratos externos;
- eventuais dados derivados.

Não remover:

- HubSpot Contact Identifier como referência técnica;
- histórico original;
- proveniência;
- vínculos legados necessários para auditoria.

### Dependências

- Etapas 1 a 6 concluídas;
- cobertura conhecida;
- zero consumidores críticos em aliases;
- contratos externos compatíveis;
- plano de rollback;
- auditoria de dependências;
- período de observação estável.

### Critério de conclusão

- `personId` identifica somente Person;
- `contactId` identifica somente HubSpot Contact;
- telefone identifica somente Communication Endpoint;
- Client é papel explícito;
- Case Party substitui associação sem papel nas decisões;
- Authorization controla acesso;
- nenhum consumidor usa o primeiro Contact como regra;
- aliases legados não participam do comportamento operacional.

## Dependências entre etapas

```text
Etapa 1 — Case Party
    ↓
Etapa 2 — Pessoa Atendida Explícita
    ↓
Etapa 3 — Conversation Actor
    ↓
Etapa 4 — Communication Endpoint
    ↓
Etapa 5 — Person
    ↓
Etapa 6 — Representative e Authorization
    ↓
Etapa 7 — Remoção de aliases legados
```

Uma etapa posterior pode ser estudada antecipadamente, mas não deve controlar operação antes da conclusão das dependências anteriores.

## Gates transversais

Toda etapa futura deve demonstrar:

- zero perda de histórico;
- zero associação indevida;
- zero informação enviada à pessoa errada;
- zero regressão em Consultation Calendar-first;
- compatibilidade com Contact durante a transição;
- métricas antes e depois;
- tratamento explícito de ambiguidades;
- rollback proporcional ao risco;
- documentação atualizada;
- aprovação funcional e jurídica.

## Critérios de pausa

Pausar a Fase 10C se ocorrer:

- identidade errada criada por inferência;
- pessoa atendida incorreta;
- comunicação confidencial indevida;
- merge ambíguo;
- regressão em casos simples;
- regressão em casos para terceiros;
- quebra de contratos externos;
- impacto em Calendar-first;
- ausência de cobertura ou métricas.

## Estado formal do roadmap

### Fase 10A

> **Discovery concluída.**

### Fase 10B

> **Migration Strategy concluída.**

### Fase 10C

> **Incremental Adoption planejada, não iniciada.**

Nenhuma etapa da Fase 10C está autorizada por este documento.

## Decisão final

O planejamento de Identity Migration está formalmente encerrado.

O próximo ciclo, quando autorizado, deve iniciar exclusivamente pela:

> **Etapa 1 — Case Party.**

Person, Authorization e remoção de aliases permanecem dependentes da validação incremental das etapas anteriores.
