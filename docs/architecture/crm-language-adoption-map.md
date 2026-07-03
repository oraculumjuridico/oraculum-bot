# CRM Identity — mapa de adoção da linguagem ubíqua

## Escopo

Este documento mapeia a linguagem oficial de `crm-ubiquitous-language.md` para a implementação atual.

Classificações:

| Classificação | Significado |
|---|---|
| Compatível com a nova linguagem | uso técnico ou funcional possui significado inequívoco |
| Parcialmente compatível | o conceito correto está presente, mas misturado ou incompleto |
| Incompatível | o uso equipara conceitos que a linguagem oficial separa |

Não propõe implementação, banco ou alteração do HubSpot.

## Resumo executivo

O termo Contact é tecnicamente legítimo quando significa:

> registro Contact da API HubSpot.

Ele se torna incompatível quando passa a significar:

- Person;
- Communication Endpoint;
- Conversation Actor;
- Client;
- Case Party;
- destinatário autorizado.

O principal alias perigoso é:

```text
personId = contactId
```

As principais dependências ocultas são:

```text
phone → Contact → Deal → caso atual → destinatário
```

e:

```text
primeiro Contact associado → participante principal
```

O esforço global de adoção da linguagem é **ALTO**, porque a ambiguidade atravessa CRM, sessão, Calendar, webhooks, Notes, documentos, menus e relatórios.

## 1. Onde aparece o termo Contact

### Integração técnica com HubSpot

Componentes:

- `src/domain/hubspot-core.js`;
- `src/domain/hubspot-sync.js`;
- `server.js`;
- `scripts/crm-identity-impact-analysis.js`.

Usos:

- buscar Contact;
- criar Contact;
- atualizar Contact;
- associar Contact a Deal;
- associar Note a Contact;
- listar Deals associados ao Contact;
- consultar propriedades `firstname` e `phone`.

Classificação:

- **Compatível com a nova linguagem** quando “Contact” significa explicitamente HubSpot Contact;
- **Parcialmente compatível** quando nomes como `contato`, `contatoId` ou `contactId` não deixam claro que se trata de um registro externo;
- **Incompatível** quando o Contact é tratado como Person ou Case Party.

### Sessão e snapshot

Componentes:

- `server.js`;
- `src/domain/state-persistence.js`;
- `src/domain/hubspot-sync.js`.

Usos:

- `u.contatoId`;
- restauração de `contatoId`;
- cópia para snapshot;
- hidratação da sessão;
- decisão de que existe cadastro;
- vínculo entre conversa e Deal.

Classificação: **Parcialmente compatível**.

O ID técnico é útil, mas a sessão o utiliza como referência ampla da pessoa e do caso, sem distinguir HubSpot Contact Identifier de Person Identifier.

### Fluxos administrativos

Componentes:

- normalização de casos para painel;
- busca de Contact associado ao Deal;
- Notes administrativas;
- cancelamentos;
- lembretes;
- pedidos de documentos.

Usos:

- recuperar o primeiro Contact associado;
- obter telefone;
- enviar comunicação;
- registrar Note.

Classificação: **Incompatível** quando o primeiro Contact é presumido como participante ou destinatário correto.

### Consultation

Componentes:

- `src/domain/calendar-scheduling.js`;
- `scripts/migrate-consulta-calendar.js`;
- `scripts/audit-consulta-phase1.js`;
- rota de reunião em `server.js`.

Usos:

- metadata `contactId`;
- fallback de `personId`;
- busca do Contact associado ao Deal;
- obtenção de nome e telefone para lembrete.

Classificação:

- `contactId` como HubSpot Contact Identifier: **Compatível**;
- Contact como participante principal: **Parcialmente compatível**;
- `personId = contactId`: **Incompatível**.

### Testes e auditorias

Componentes:

- testes Consultation;
- testes de impacto de identidade;
- auditoria Calendar;
- análise read-only de CRM.

Classificação:

- testes que usam IDs diferentes: **Compatível**;
- teste que simula alias `personId/contactId`: **Compatível** como diagnóstico;
- qualquer fixture que trate igualdade como estado normal: **Incompatível** semanticamente.

## 2. Onde `contactId` e `contatoId` são utilizados

### Como identificador técnico HubSpot

Usos:

- URL de Contact;
- atualização de propriedades;
- associação com Deal;
- associação com Note;
- consulta de Deals associados.

Classificação: **Compatível com a nova linguagem**.

Nome oficial do significado:

> HubSpot Contact Identifier.

### Como referência de identidade na sessão

Usos:

- `u.contatoId`;
- restauração e persistência;
- continuidade de conversa;
- detecção de cadastro existente.

Classificação: **Parcialmente compatível**.

O campo identifica um registro CRM, mas é consumido como se identificasse a Person.

### Como chave para localizar casos

Usos:

- `hsBuscarNegocioAbertoDoContato`;
- `hsListarNegociosAtivosDoContato`;
- escolha de Deal não finalizado.

Classificação: **Incompatível** quando Contact é usado como substituto de Case Party e determina o caso atual sem papel ou seleção explícita.

### Como destinatário de Notes

Usos:

- cadastro completo;
- documentos;
- urgência;
- cancelamento;
- agendamento;
- ações administrativas;
- divergência de nome.

Classificação:

- Note estritamente pessoal: **Parcialmente compatível**;
- Note narrativa do caso associada somente ao Contact: **Incompatível**;
- Note associada também ao Deal, com autoria clara: mais próxima de **Compatível**.

### Como vínculo de Consultation

Usos:

- metadata Calendar;
- auditoria de metadata;
- migração;
- obtenção de telefone para reuniões.

Classificação: **Parcialmente compatível** como referência CRM; **Incompatível** quando substitui participante ou Person.

### Como sinal de “cliente existente”

Usos:

- presença de `contatoId` participa de decisões de retomada e cadastro;
- Contact encontrado pode indicar que o usuário já está no CRM.

Classificação: **Incompatível** quando HubSpot Contact é tratado como Client.

## 3. Onde `personId` é utilizado

### Criação de evento Calendar

Arquivo:

- `src/domain/calendar-scheduling.js`.

Comportamento:

```text
personId = cliente.personId || cliente.contatoId
```

Classificação: **Incompatível**.

O fallback torna Person Identifier sinônimo de HubSpot Contact Identifier.

### Vinculação de metadata Calendar

Comportamento:

```text
personId = metadata.personId || metadata anterior || metadata.contactId
```

Classificação: **Incompatível**.

### Rota de reunião

Arquivo:

- `server.js`.

Comportamento:

```text
personId = contactId
contactId = contactId
```

Classificação: **Incompatível**.

A duplicação fornece dois nomes para o mesmo identificador sem criar dois conceitos.

### Migração

Arquivo:

- `scripts/migrate-consulta-calendar.js`.

Comportamento:

```text
personId = snapshot.personId || snapshot.contatoId
```

Classificação: **Incompatível** para identidade; aceitável apenas como compatibilidade legada explicitamente marcada.

### Auditoria

Arquivo:

- `scripts/audit-consulta-phase1.js`.

Comportamento:

- exige presença de `personId` e `contactId`;
- não verifica se os dois possuem semântica distinta.

Classificação: **Parcialmente compatível**.

### Analisador de impacto

Arquivo:

- `scripts/crm-identity-impact-analysis.js`.

Comportamento:

- detecta ausência de `personId`;
- detecta alias em casos de terceiro.

Classificação: **Compatível com a nova linguagem** como ferramenta diagnóstica.

## 4. Assunções implícitas

### Person = Contact

| Componente | Assunção | Classificação |
|---|---|---|
| criação/atualização de Contact | nome da sessão é gravado no Contact | **Parcialmente compatível** |
| HubSpot Sync | `u.nome` atualiza `firstname` do `u.contatoId` | **Incompatível** em casos de terceiro |
| Calendar | `personId` recebe `contactId` | **Incompatível** |
| rota de reunião | primeiro Contact vira `personId` | **Incompatível** |
| snapshot | `contatoId` restaura contexto de pessoa | **Parcialmente compatível** |
| Notes | Contact recebe narrativa do caso | **Incompatível** quando pessoa e caso não coincidem |

### Contact = Canal

| Componente | Assunção | Classificação |
|---|---|---|
| `hsBuscarPorPhone` | telefone resolve Contact | **Parcialmente compatível** como lookup; não como identidade |
| criação de Contact | um telefone cria um Contact | **Incompatível** para número compartilhado ou reciclado |
| reunião | `Contact.phone` define destinatário | **Incompatível** sem Authorization |
| sessão | `from` e Contact são correlacionados | **Parcialmente compatível** |
| terceiro | telefone escolhido determina o Contact associado | **Incompatível** quando operador e assistido diferem |
| webhooks | payload `phone` localiza usuário/caso | **Incompatível** como contrato de identidade |

### Contact = Client

| Componente | Assunção | Classificação |
|---|---|---|
| captura de lead | Contact existente indica cadastro | **Parcialmente compatível** |
| menu/retomada | `contatoId` participa da decisão de cliente existente | **Incompatível** |
| busca de Deal | Deals do Contact são casos do cliente | **Incompatível** sem Case Party |
| Notes | Contact recebe eventos do cliente/caso | **Incompatível** em representação |
| painel admin | Contact associado fornece nome e telefone do cliente | **Incompatível** quando há múltiplos papéis |
| Consultation | Contact associado é participante da consulta | **Incompatível** |

## 5. Classificação por componente

| Componente | Compatibilidade predominante | Motivo |
|---|---|---|
| `hubspot-core.js` | **Parcialmente compatível** | API técnica correta, deduplicação por telefone e associação sem papel |
| `hubspot-sync.js` | **Incompatível** | atualiza Person presumida a partir da sessão e busca casos pelo Contact |
| estado em `server.js` | **Incompatível** | `contatoId`, nome, telefone, ator e cliente compartilham contexto |
| fluxo de terceiro | **Parcialmente compatível** | distingue nomes e telefone, mas não preserva relações formais |
| persistência de sessão | **Parcialmente compatível** | persiste referência técnica sem semântica independente |
| Notes | **Incompatível** | narrativa pode ser associada ao Contact errado ou sem papel |
| admin CRM | **Incompatível** | primeiro Contact é tratado como participante principal |
| Calendar metadata | **Incompatível** | alias `personId/contactId` |
| Event Store Consultation | **Parcialmente compatível** | histórico por Deal é consistente, participante não é |
| auditoria Consultation | **Parcialmente compatível** | verifica presença, não identidade |
| analisador de impacto | **Compatível** | explicita e mede ambiguidades |
| testes de alias | **Compatível** como diagnóstico | cobrem risco conhecido |

## 6. Aliases perigosos

### `personId` ↔ `contactId`

Severidade: **ALTA**.

Risco:

- Contact parecer identidade canônica;
- participante de consulta ser atribuído incorretamente;
- migrações perpetuarem a equivalência.

### `contatoId` ↔ Person

Severidade: **ALTA**.

Risco:

- nome ou cidade de uma pessoa serem gravados em outra;
- histórico ser associado ao registro errado.

### `phone` / `from` ↔ Person

Severidade: **ALTA**.

Risco:

- número compartilhado, reciclado ou operado por representante;
- retomada com identidade incorreta.

### `u.nome` ↔ Conversation Actor / pessoa atendida

Severidade: **ALTA**.

Risco:

- autoria e sujeito do caso mudarem conforme a flag de terceiro.

### `Contact associado` ↔ Case Party principal

Severidade: **ALTA**.

Risco:

- primeiro Contact ser usado como pessoa atendida, cliente ou destinatário.

### `Contact existente` ↔ Client existente

Severidade: **MÉDIA/ALTA**.

Risco:

- lead, representante ou canal conhecido ser tratado como cliente.

## 7. Dependências ocultas

### Resolução em cadeia por telefone

```text
phone
→ HubSpot Contact
→ Deals associados
→ primeiro Deal não finalizado
→ caso atual
```

Classificação: **Incompatível**.

Dependência oculta:

- o canal escolhe indiretamente a Person e o Legal Case.

### Seleção do primeiro Contact

```text
Deal
→ associations/contacts
→ results[0]
→ nome e telefone
```

Classificação: **Incompatível**.

Dependência oculta:

- ordem de associação substitui papel no caso.

### Sessão por número

```text
from
→ users[from]
→ contatoId
→ negocioId
```

Classificação: **Parcialmente compatível** para conversa; **Incompatível** para identidade.

### Snapshot

O snapshot preserva:

- `contatoId`;
- nomes;
- telefone;
- flags de terceiro;
- negócio atual.

Classificação: **Parcialmente compatível**.

Dependência oculta:

- restauração recompõe a mesma mistura sem revalidar identidade ou papel.

### Notes

Notes funcionam como compensação semântica:

- divergência de nome;
- quem abriu;
- caso para terceiro;
- não reconhecimento.

Classificação: **Incompatível** como fonte de relação; útil como evidência narrativa.

### Consultation

O estado da agenda é independente, mas o participante ainda depende de:

- primeiro Contact;
- `contactId`;
- telefone.

Classificação: **Parcialmente compatível** no estado; **Incompatível** na identidade.

## 8. Contratos externos afetados

### HubSpot API

Contratos:

- Contact;
- propriedade `phone`;
- `firstname`;
- associação `deal_to_contact`;
- Notes associadas a Contact;
- buscas de Deals do Contact.

Impacto semântico: **ALTO**.

O termo HubSpot Contact permanece válido tecnicamente. O significado funcional de sua associação é que precisa ser revisto.

### Google Calendar

Contrato:

- `extendedProperties.private.personId`;
- `contactId`;
- `dealId`;
- descrições com nome e WhatsApp.

Impacto semântico: **ALTO**.

O estado Calendar-first não é afetado conceitualmente; os participantes e destinatários são.

### Webhooks e automações

Contratos identificados:

- `/agendamento`;
- `/buscar-contato-reuniao`;
- `/evento-cancelado`;
- `/pos-consulta`;
- `/consulta-status`;
- `/lembrete`.

Campos relevantes:

- `phone`;
- `name`;
- `dealId`;
- `eventId`;
- `caseid`.

Impacto semântico: **ALTO**.

`phone` é usado como chave de localização, não apenas como Endpoint Identifier.

### Make, n8n ou integrações equivalentes

Dependências:

- Contact associado à reunião;
- telefone e nome do primeiro Contact;
- horário para correlacionar reunião;
- metadata Calendar.

Impacto semântico: **ALTO**.

### WhatsApp

Contratos:

- número de origem;
- número de destino;
- template de terceiro;
- botões de reconhecimento;
- sessão por número.

Impacto semântico: **ALTO**.

### Persistência local e snapshot HubSpot

Contratos:

- `contatoId`;
- `whatsappContato`;
- `_numero`;
- nomes;
- flags de terceiro;
- `negocioId`.

Impacto semântico: **ALTO**.

### Relatórios e painéis

Contratos:

- total de clientes;
- casos do Contact;
- nome e telefone do caso;
- consultas do cliente;
- Notes por Contact;
- histórico de atendimento.

Impacto semântico: **ALTO**.

## 9. Estimativa de esforço de adoção

### Por área

| Área | Esforço | Motivo |
|---|---|---|
| vocabulário de documentação e UI | **BAIXO** | alteração semântica e editorial |
| inventário de aliases | **BAIXO/MÉDIO** | ocorrências concentradas e rastreáveis |
| HubSpot técnico | **MÉDIO** | Contact continua existindo, mas uso precisa ser qualificado |
| sessões | **ALTO** | chave, ator, pessoa e caso estão acoplados |
| fluxos de terceiro | **ALTO** | maior concentração de papéis implícitos |
| associações Contact–Deal | **ALTO** | contratos atuais não expressam Case Party |
| Calendar metadata | **MÉDIO/ALTO** | contratos externos e legado `personId/contactId` |
| webhooks e automações | **ALTO** | telefone participa da resolução de identidade |
| Notes e histórico | **ALTO** | autoria e sujeito precisam ser distinguíveis |
| relatórios | **ALTO** | métricas atuais usam Contact como cliente/pessoa |
| testes | **MÉDIO/ALTO** | fixtures e invariantes precisam refletir conceitos distintos |

### Estimativa global

**ALTO**.

Motivos:

1. aproximadamente 98 ocorrências relevantes estão concentradas em `server.js`;
2. o acoplamento atravessa mais de dez arquivos operacionais e scripts;
3. contratos externos usam telefone e Contact;
4. a mudança é semântica, não apenas de nomenclatura;
5. compatibilidade com snapshots e metadata legados precisa ser considerada;
6. Consultation deve preservar o estado Calendar-first enquanto o significado de participante evolui.

### O que não representa esforço alto

Usos estritamente técnicos como:

- chamar endpoint `/crm/v3/objects/contacts/{id}`;
- referir-se ao tipo HubSpot Contact;
- armazenar HubSpot Contact Identifier como referência externa.

Esses usos são compatíveis desde que não substituam Person, Endpoint, Actor ou Case Party.

## Conclusão

O mapa de adoção mostra três categorias:

```text
Contact técnico do HubSpot
→ compatível

Contact usado como pista de pessoa ou canal
→ parcialmente compatível

Contact usado como Person, Client ou Case Party
→ incompatível
```

O maior risco está nos aliases:

```text
personId = contactId
phone = Person
primeiro Contact = Case Party principal
Contact existente = Client
```

A adoção completa da linguagem possui esforço **ALTO**, porque exige que cada consumidor declare qual conceito realmente necessita, sem reabrir a lógica de estado da Consultation.
