# Fase 10 — análise de lacunas entre o modelo de identidade e o CRM atual

## Escopo

Este documento compara:

- o modelo conceitual definido em `crm-domain-identity-model.md`;
- o comportamento atual do bot, CRM, HubSpot, Consultation e sessões.

Não define implementação, banco, classes, APIs ou mudanças no HubSpot.

## Resumo executivo

Os quatro conceitos do modelo aparecem parcialmente no sistema atual:

| Conceito | Situação atual | Lacuna |
|---|---|---|
| Identidade | representada por Contact, nome e contexto da sessão | **ALTA** |
| Canal | representado por telefone, `from` e `whatsappContato` | **ALTA** |
| Papel no caso | inferido por flags e fluxo | **ALTA** |
| Relacionamento | indicado por textos e campos isolados | **ALTA** |

O problema principal não é ausência absoluta de informação. O sistema já coleta parte dos dados necessários.

O problema é que:

- os dados não possuem significado único;
- pessoa e canal compartilham a mesma chave operacional;
- papéis não estão vinculados formalmente ao caso;
- relações não possuem escopo, validade ou histórico;
- consumidores downstream interpretam convenções diferentes.

## 1. Onde cada conceito aparece hoje

### Identidade

#### Contact HubSpot

O Contact é a representação mais próxima de uma pessoa.

Contém:

- `firstname`;
- `phone`;
- cidade;
- ID HubSpot.

Porém, é localizado pelo telefone e pode representar tanto a pessoa atendida quanto o titular do canal ou um representante.

Evidências:

- `hsBuscarPorPhone()` pesquisa `phone EQ número`;
- `hsCriarContato()` grava nome e telefone;
- a busca usa o primeiro resultado encontrado.

#### Sessão

A identidade aparece em:

- `u.nome`;
- `u.nomeContato`;
- `u.nomeWA`;
- `u.nomePerfilWhatsApp`;
- `u.nomeHubspot`;
- `u.contatoId`.

O significado de `u.nome` muda:

- caso simples: pessoa que conversa e é atendida;
- caso para terceiro: pessoa atendida;
- `u.nomeContato`: pessoa que conversa.

#### Consultation

Existe `personId`, mas normalmente:

- recebe `contactId`;
- usa `contactId` como fallback;
- não referencia uma identidade independente.

#### Avaliação

Existe um identificador técnico de Contact, mas não existe identidade canônica independente de canal e CRM.

Lacuna: **ALTA**.

### Canal

#### WhatsApp de origem

`from` é:

- chave da sessão;
- remetente da mensagem;
- fallback de telefone;
- critério de busca no HubSpot;
- destino de resposta.

#### Telefone cadastrado

O canal também aparece em:

- `Contact.phone`;
- `u.whatsappContato`;
- `u._numero`;
- `u.telefoneEhDoCliente`;
- `u.whatsappVerificado`.

#### Normalização

`normalizarNumeroWhatsAppEnvio()` trata diferenças de formato e nono dígito.

#### Avaliação

O canal existe como valor, mas não como conceito independente.

Não há significado explícito para:

- titular;
- operador;
- compartilhamento;
- período de validade;
- consentimento;
- uso autorizado por caso.

Lacuna: **ALTA**.

### Papel no caso

#### Pessoa atendida

É inferida principalmente por:

- `u.nome`;
- `u.atendimentoParaTerceiro`;
- narrativa das telas;
- telefone selecionado para continuidade.

#### Representante ou solicitante

É indicado por:

- `u.nomeContato`;
- `u.relacaoComAtendido`;
- `u.papelContato`;
- `u._casoAnteriorCliente`;
- fluxo de terceiro.

#### Cliente

É inferido por:

- existência de `numeroCaso`;
- acesso ao menu;
- Contact associado ao Deal;
- sessão em stage de cliente.

#### Advogado e operador

Existem no fluxo operacional e na atribuição do escritório, mas não aparecem como participação histórica uniforme no caso.

#### Associação HubSpot

`deal_to_contact` vincula Contact e Deal sem informar papel.

#### Avaliação

Papéis existem no discurso e nas decisões do bot, mas não como relacionamento explícito e consultável.

Lacuna: **ALTA**.

### Relacionamento

#### Pessoa e pessoa

Aparece em:

- `relacaoComAtendido`;
- nomes de quem abriu e de quem será atendido;
- textos como “aberto por”;
- Notes de caso para terceiro.

#### Pessoa e caso

Aparece em:

- associação genérica Contact–Deal;
- `contatoId` dentro da sessão;
- Notes;
- snapshot;
- `papelContato`.

#### Pessoa e canal

Aparece em:

- `telefoneEhDoCliente`;
- `whatsappVerificado`;
- `whatsappContato`;
- confirmação “usar número atual”.

#### Reconhecimento

O terceiro pode:

- reconhecer o caso;
- declarar que não reconhece.

O resultado é tratado por flags, Note e alerta administrativo.

#### Avaliação

Relacionamentos são registrados como estado corrente ou narrativa. Não possuem modelo uniforme de:

- início;
- fim;
- escopo;
- autorização;
- evidência;
- revogação;
- histórico.

Lacuna: **ALTA**.

## 2. Conceitos que não existem

| Conceito ausente | Consequência | Lacuna |
|---|---|---|
| identidade canônica independente do Contact | troca de telefone ou CRM pode fragmentar a pessoa | **ALTA** |
| canal como conceito independente | telefone continua sendo identidade operacional | **ALTA** |
| operador do canal | não se sabe quem efetivamente enviou a mensagem | **ALTA** |
| titularidade temporal do canal | número compartilhado ou reciclado não é representado | **ALTA** |
| participação tipada no caso | associação Contact–Deal não informa papel | **ALTA** |
| cliente contratante distinto do assistido | contratação pode ser atribuída à pessoa errada | **ALTA** |
| responsável financeiro | cobrança não possui sujeito explícito | **ALTA** |
| contato autorizado | posse do canal pode ser confundida com autorização | **ALTA** |
| representação com escopo | familiaridade pode ser confundida com poder de agir | **ALTA** |
| histórico de representação | não se reconstrói quem podia agir em determinada data | **ALTA** |
| consentimento de contato contextual | autorização de comunicação não é demonstrável | **ALTA** |
| autoria estruturada de relatos/documentos | histórico jurídico pode ficar ambíguo | **ALTA** |
| vigência dos papéis | papel atual sobrescreve o contexto anterior | **MÉDIA** |
| participação profissional histórica | responsabilidade jurídica pode ficar difusa | **MÉDIA** |
| terceiro interessado tipado | terceiros ficam apenas em narrativa | **MÉDIA** |
| parte relacionada sem acesso | menção jurídica e permissão de acesso não são separadas | **ALTA** |

## 3. Conceitos misturados

### Contact = pessoa + canal

O Contact recebe dados pessoais, mas sua resolução depende de `phone`.

Mistura:

- identidade;
- endereço de comunicação;
- destinatário;
- cliente;
- participante do caso.

Lacuna: **ALTA**.

### `from` = sessão + operador + identidade presumida

O número de origem indexa a sessão e é usado como pista de pessoa.

Mistura:

- canal;
- operador;
- identidade;
- contexto conversacional.

Lacuna: **ALTA**.

### `u.nome` = ator ou pessoa atendida

O significado varia conforme `atendimentoParaTerceiro`.

Mistura:

- identidade de quem fala;
- identidade do sujeito do caso.

Lacuna: **ALTA**.

### `contatoId` = Contact associado + pessoa + destinatário

É usado para:

- atualizar dados pessoais;
- criar Notes;
- buscar Deals;
- associar consultas;
- preencher `personId`.

Mistura:

- projeção CRM;
- identidade;
- papel no caso;
- destino operacional.

Lacuna: **ALTA**.

### `personId` = identidade aparente + alias de Contact

O nome sugere identidade independente, mas o valor normalmente é o `contactId`.

Lacuna: **ALTA**.

### Contact–Deal = qualquer participação no caso

A associação genérica pode significar:

- assistido;
- solicitante;
- representante;
- cliente;
- destinatário.

Lacuna: **ALTA**.

### `telefoneEhDoCliente` = titularidade + papel + destino

A flag tenta responder simultaneamente:

- de quem é o telefone;
- se o canal pertence ao assistido;
- qual número deve ser usado;
- quem é o cliente.

Lacuna: **ALTA**.

### “Cliente” = status operacional + papel jurídico

O termo controla menu e retomada, mas também descreve a pessoa atendida.

Lacuna: **MÉDIA**.

## 4. Conceitos representados por flags, textos e convenções

### Flags

| Conceito inferido | Representação atual | Lacuna |
|---|---|---|
| caso para terceiro | `atendimentoParaTerceiro` | **MÉDIA** |
| novo caso para terceiro | `_novoCasoParaTerceiro` | **MÉDIA** |
| telefone pertence ao atendido | `telefoneEhDoCliente` | **ALTA** |
| canal verificado | `whatsappVerificado` | **MÉDIA** |
| caso não reconhecido | `_casoNaoReconhecido` | **ALTA** |
| espera por reconhecimento | `_aguardandoReconhecimentoTerceiro` | **MÉDIA** |

Flags são úteis para fluxo, mas não expressam pessoa, vínculo, vigência ou histórico.

### Textos livres

| Conceito inferido | Onde aparece | Lacuna |
|---|---|---|
| quem abriu o caso | Notes e resumo “Aberto por” | **ALTA** |
| divergência de identidade | Note de divergência de nome | **ALTA** |
| representação | relato, Note e descrição | **ALTA** |
| rejeição do atendimento | Note “caso não reconhecido” | **ALTA** |
| relação familiar | narrativa e `relacaoComAtendido` livre/limitado | **MÉDIA** |
| autoria de relato | prefixos textuais como “De:” | **ALTA** |

Texto preserva contexto humano, mas não permite decisão segura ou consulta uniforme.

### Convenções implícitas

| Convenção | Significado presumido | Lacuna |
|---|---|---|
| primeiro Contact associado | participante principal | **ALTA** |
| primeiro Deal aberto | caso atual | **ALTA** |
| `u.nome` em caso de terceiro | pessoa atendida | **ALTA** |
| `u.nomeContato` | pessoa no WhatsApp | **MÉDIA** |
| `Contact.phone` | identidade do usuário | **ALTA** |
| acesso ao número | autorização para receber informação | **ALTA** |
| `personId = contactId` | Contact representa pessoa real | **ALTA** |
| menu “cliente” | pessoa possui relação legítima com o caso | **ALTA** |

## 5. Componentes impactados por uma futura separação

### HubSpot

Impactos conceituais:

- significado do Contact;
- uso de `phone`;
- associação Contact–Deal;
- seleção do Contact principal;
- Notes associadas ao Contact;
- deduplicação;
- relatórios por Contact.

Nível de impacto: **ALTO**.

### CRM

Impactos conceituais:

- criação e localização de pessoas;
- criação e reutilização de Deals;
- identificação da pessoa atendida;
- casos para terceiros;
- contratação;
- cobrança;
- permissões de acesso;
- autoria de informações.

Nível de impacto: **ALTO**.

### Consultation

Impactos conceituais:

- significado de `personId`;
- significado de `contactId`;
- destinatário de lembretes;
- participante da consulta;
- pessoa atendida versus representante;
- histórico jurídico do participante.

Calendar-first não precisa ser reaberto para reconhecer a lacuna. O impacto está na identidade vinculada à consulta, não no estado da agenda.

Nível de impacto: **MÉDIO/ALTO**.

### Sessões

Impactos conceituais:

- chave por telefone;
- identidade do ator;
- caso selecionado;
- pessoa atendida;
- troca de canal;
- continuidade no telefone de terceiro;
- recuperação e retomada.

Nível de impacto: **ALTO**.

### Automações

Impactos conceituais:

- webhooks localizados por telefone;
- lembretes;
- envio de mensagens;
- busca do primeiro Contact;
- associação automática;
- reutilização de Deal;
- notificações de terceiro;
- criação de Notes.

Nível de impacto: **ALTO**.

### Relatórios

Impactos conceituais:

- total de clientes;
- total de pessoas atendidas;
- casos por pessoa;
- consultas por participante;
- leads de terceiro;
- conversão;
- responsável financeiro;
- autoria e origem;
- qualidade de cadastro.

Nível de impacto: **ALTO**.

## 6. Classificação consolidada das lacunas

### ALTA

- identidade dependente de telefone;
- Contact sem significado único;
- associação Contact–Deal sem papel;
- `personId` como alias de `contactId`;
- ausência de representação formal;
- ausência de autorização de acesso;
- ausência de responsável financeiro;
- autoria não estruturada;
- primeiro Contact/Deal como convenção;
- canal confundido com pessoa;
- falta de histórico de relações.

### MÉDIA

- flags de terceiro sem histórico;
- distinção parcial entre `nome` e `nomeContato`;
- verificação de WhatsApp sem contexto temporal;
- relação familiar limitada;
- participação profissional não uniforme;
- conceito de cliente usado como status operacional.

### BAIXA

- diferenças de nomenclatura nas telas;
- redundância de nomes de exibição;
- formatação de telefone;
- labels narrativos que não participam de decisão.

Lacunas baixas tornam-se altas quando usadas para inferir identidade ou autorização.

## 7. Ordem de migração conceitual

Esta ordem descreve esclarecimento semântico, não implementação.

### 1. Fixar o vocabulário

Definir sem ambiguidade:

- pessoa;
- canal;
- ator da conversa;
- pessoa atendida;
- cliente contratante;
- representante;
- responsável financeiro;
- contato autorizado.

Prioridade: **ALTA**.

Motivo: nenhuma separação posterior é confiável se os termos continuarem intercambiáveis.

### 2. Identificar as equivalências atuais

Classificar cada uso de:

- Contact;
- `contatoId`;
- `personId`;
- `from`;
- `u.nome`;
- `u.nomeContato`;
- `whatsappContato`.

Para cada uso, esclarecer se representa:

- identidade;
- canal;
- ator;
- destinatário;
- papel.

Prioridade: **ALTA**.

### 3. Distinguir ator da conversa e pessoa atendida

Estabelecer conceitualmente que:

- quem fala pode ser diferente de quem é atendido;
- a diferença não depende apenas de uma flag;
- ambos podem precisar de continuidade própria.

Prioridade: **ALTA**.

### 4. Distinguir pessoa e canal

Clarificar:

- titularidade;
- operação;
- verificação;
- compartilhamento;
- troca de número;
- canal autorizado por caso.

Prioridade: **ALTA**.

### 5. Formalizar papéis no caso

Definir quais papéis são necessários e quais podem coexistir:

- assistido;
- contratante;
- representante;
- responsável financeiro;
- contato autorizado;
- terceiro interessado.

Prioridade: **ALTA**.

### 6. Formalizar relacionamentos e autorizações

Definir:

- escopo;
- origem;
- validade;
- confirmação;
- revogação;
- histórico.

Prioridade: **ALTA**.

### 7. Definir autoria e proveniência

Clarificar para relatos, documentos, mensagens e decisões:

- quem forneceu;
- em nome de quem;
- por qual canal;
- em que contexto;
- com qual confirmação.

Prioridade: **ALTA**.

### 8. Reinterpretar domínios consumidores

Revisar conceitualmente:

- HubSpot;
- sessões;
- Consultation;
- automações;
- relatórios.

O objetivo é identificar onde cada consumidor precisa de:

- pessoa;
- canal;
- papel;
- relacionamento.

Prioridade: **MÉDIA/ALTA**.

### 9. Definir critérios de consistência

Exemplos conceituais:

- todo caso possui pessoa atendida identificável;
- todo destinatário possui autorização conhecida;
- todo representante possui vínculo contextual;
- todo canal possui relação conhecida com seu operador;
- `personId` nunca significa apenas “primeiro Contact”.

Prioridade: **ALTA**.

### 10. Validar com casos reais

Aplicar o vocabulário a cenários:

- pessoa abrindo caso próprio;
- filho pela mãe;
- cônjuge pelo parceiro;
- responsável legal;
- terceiro sem autorização;
- número compartilhado;
- pessoa com vários canais;
- representante com vários assistidos;
- responsável financeiro distinto.

Prioridade: **ALTA**.

## Conclusão

O sistema atual já percebe a diferença entre identidade, canal, papel e relacionamento, mas não a preserva como estrutura semântica uniforme.

Hoje:

```text
IDENTIDADE      aparece como Contact, nome e personId
CANAL           aparece como phone, from e whatsappContato
PAPEL NO CASO   aparece como flags, fluxo e convenções
RELACIONAMENTO  aparece como relacaoComAtendido, Notes e texto
```

O gap central é:

> informações suficientes para suspeitar do vínculo existem, mas não há significado estável para afirmar quem é quem, em qual papel, com qual autorização e durante qual período.

A migração conceitual deve começar pelo vocabulário e pelas equivalências atuais, antes de qualquer decisão técnica.
