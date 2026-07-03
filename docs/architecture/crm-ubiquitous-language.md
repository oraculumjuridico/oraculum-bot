# CRM Identity — linguagem ubíqua oficial

## Objetivo

Este documento estabelece o vocabulário oficial para decisões futuras sobre identidade, comunicação, participação em casos e sessões conversacionais.

Os termos devem ser utilizados com o mesmo significado por:

- jurídico;
- atendimento;
- administrativo;
- produto;
- engenharia;
- CRM;
- automações;
- relatórios.

Este documento não define implementação, banco, classes, APIs ou migração.

## Regras gerais de linguagem

1. Pessoa não é sinônimo de telefone.
2. Canal não é sinônimo de pessoa.
3. Quem conversa não é necessariamente quem será atendido.
4. Cliente é um papel, não uma identidade.
5. Representante é um papel contextual, não uma característica permanente.
6. Participar de um caso não concede acesso automático a todas as informações.
7. Autorização possui escopo e validade.
8. Todo papel é interpretado no contexto de um caso.
9. Todo identificador deve declarar qual conceito identifica.
10. `Contact` não deve ser usado como termo de domínio.

## 1. Person

### Definição

Ser humano cuja identidade permanece reconhecível independentemente de:

- telefone;
- canal;
- sessão;
- caso;
- papel;
- registro CRM.

### Responsabilidade

Responder:

> Quem é esta pessoa?

Person concentra somente informações que descrevem a pessoa como sujeito, não sua participação em um caso específico.

### Exemplos

- Maria da Silva, atendida em um caso previdenciário.
- João Souza, filho que inicia atendimento para Maria.
- Ana Lima, advogada responsável.
- Carlos Alves, responsável financeiro de um caso.

### Anti-exemplos

- número `5511999999999`;
- Contact HubSpot;
- Deal;
- perfil do WhatsApp;
- “representante” sem identificar qual pessoa;
- sessão ativa;
- `personId`.

Um identificador referencia uma Person, mas não é a própria Person.

### Relações

- pode utilizar um ou mais Communication Endpoints;
- pode ser Conversation Actor;
- pode exercer papel de Client;
- pode participar de um Legal Case como Case Party;
- pode atuar como Representative;
- pode ser Financial Responsible;
- pode conceder ou receber Authorization;
- pode participar de várias Conversation Sessions.

## 2. Communication Endpoint

### Definição

Meio endereçável pelo qual comunicações podem ser enviadas ou recebidas.

### Responsabilidade

Responder:

> Por qual meio esta comunicação acontece?

O endpoint descreve o canal, sua disponibilidade e sua relação temporal com pessoas.

### Exemplos

- conta de WhatsApp vinculada a um número;
- número telefônico;
- endereço de e-mail;
- canal corporativo autorizado.

### Anti-exemplos

- Person;
- titular do número;
- Conversation Actor;
- cliente;
- mensagem;
- sessão;
- autorização para acessar um caso.

Possuir ou operar um endpoint não concede, por si só, acesso jurídico.

### Relações

- pode ter uma Person como titular declarada;
- pode ser operado por uma Person;
- pode ser usado em uma Conversation Session;
- pode ser autorizado para comunicação de um Legal Case;
- transporta interações de um Conversation Actor;
- pode mudar de titular ou operador ao longo do tempo.

## 3. Conversation Actor

### Definição

Person que efetivamente participa de uma conversa em determinado momento.

Quando a identidade ainda não foi confirmada, o ator é apenas declarado ou presumido, nunca considerado verificado automaticamente.

### Responsabilidade

Responder:

> Quem está falando nesta conversa?

### Exemplos

- Maria conversa em seu próprio WhatsApp sobre seu caso.
- João usa seu WhatsApp para abrir atendimento para a mãe.
- Uma funcionária autorizada responde pelo canal de uma empresa.
- Pessoa ainda não identificada inicia conversa por um número conhecido.

### Anti-exemplos

- titular técnico do número que não participa da conversa;
- pessoa atendida que não está conversando;
- Communication Endpoint;
- sessão;
- Contact associado ao Deal;
- destinatário presumido.

### Relações

- é uma Person, quando identificada;
- utiliza um Communication Endpoint;
- participa de uma Conversation Session;
- pode ser Client, Representative ou terceiro;
- pode falar em nome próprio ou de outra Person;
- não se torna Case Party apenas por iniciar uma conversa.

## 4. Client

### Definição

Person que mantém relação de atendimento ou contratação reconhecida com o escritório em determinado contexto.

Quando necessário, o termo deve ser qualificado:

- Prospective Client;
- Assisted Client;
- Contracting Client.

### Responsabilidade

Responder:

> Qual é a relação desta pessoa com a prestação de serviços do escritório?

### Exemplos

- pessoa atendida que contratou o escritório;
- pai que contrata serviço em benefício de filho menor;
- pessoa ainda em avaliação como Prospective Client.

### Anti-exemplos

- qualquer pessoa que envia mensagem;
- qualquer Contact HubSpot;
- titular do WhatsApp;
- parte contrária;
- representante sem relação de contratação;
- lead técnico criado por abandono.

### Relações

- é uma Person;
- pode ser Case Party;
- pode coincidir com a pessoa atendida;
- pode ser Financial Responsible;
- pode atuar por Authorization;
- pode participar de várias Conversation Sessions;
- não é definido pelo Communication Endpoint.

## 5. Case Party

### Definição

Participação de uma Person em um Legal Case com um papel explícito.

Case Party não é uma categoria permanente de pessoa. É a expressão contextual de sua participação naquele caso.

### Responsabilidade

Responder:

> Qual papel esta pessoa exerce neste caso?

### Papéis possíveis

- pessoa atendida;
- cliente contratante;
- representante;
- responsável financeiro;
- contato autorizado;
- dependente;
- beneficiário;
- terceiro interessado;
- parte relacionada;
- parte contrária;
- testemunha.

### Exemplos

- Maria é pessoa atendida no Caso A.
- João é Representative no Caso A.
- Carlos é Financial Responsible no Caso A.
- Ana é testemunha no Caso B.

### Anti-exemplos

- associação Contact–Deal sem papel;
- Contact;
- pessoa mencionada sem relação com o caso;
- número de telefone;
- participante de conversa sem vínculo reconhecido;
- papel válido para todos os casos da pessoa.

### Relações

- vincula uma Person a um Legal Case;
- pode estar condicionado a Authorization;
- pode utilizar um Communication Endpoint autorizado;
- possui vigência e histórico;
- pode coexistir com outros papéis da mesma Person;
- informa quem pode participar de Consultation, documentos e comunicações.

## 6. Representative

### Definição

Case Party que atua em nome, no interesse ou por conta de outra Person dentro de um Legal Case.

### Responsabilidade

Responder:

> Quem pode agir por outra pessoa neste caso, em qual escopo e com qual fundamento?

### Exemplos

- mãe responsável por filho menor;
- procurador com poderes definidos;
- curador;
- familiar autorizado apenas a acompanhar o atendimento;
- pessoa que inicia o caso em nome de terceiro, com representação ainda pendente de validação.

### Anti-exemplos

- familiar sem autorização;
- pessoa que apenas indicou o escritório;
- titular do WhatsApp;
- responsável financeiro sem poder de representação;
- Conversation Actor automaticamente presumido como representante;
- papel global válido para todos os casos.

### Relações

- é uma Person;
- é uma Case Party;
- representa outra Person;
- atua em um Legal Case específico;
- depende de Authorization ou fundamento reconhecido;
- pode ser Client ou Financial Responsible, mas não necessariamente;
- pode usar Communication Endpoint próprio ou autorizado.

## 7. Financial Responsible

### Definição

Case Party responsável por obrigação financeira, pagamento ou recebimento de cobrança relacionada a um Legal Case.

### Responsabilidade

Responder:

> Quem responde financeiramente por este caso?

### Exemplos

- pessoa atendida que paga seus honorários;
- pai que paga pelo caso do filho;
- empresa que assume o custo do atendimento;
- representante que também assume a responsabilidade financeira.

### Anti-exemplos

- pessoa que sofre impacto financeiro narrado no caso;
- titular do WhatsApp;
- representante sem obrigação financeira;
- Contact associado;
- pagador ocasional sem responsabilidade reconhecida;
- stage de contratação.

### Relações

- é uma Person;
- é uma Case Party;
- relaciona-se a um Legal Case específico;
- pode coincidir com Client, Representative ou pessoa atendida;
- pode possuir Communication Endpoint próprio para cobrança;
- não recebe acesso jurídico automaticamente.

## 8. Authorization

### Definição

Permissão contextual, verificável e temporal concedida a uma Person para executar determinada ação ou receber determinada informação.

### Responsabilidade

Responder:

> Quem autorizou quem, a fazer o quê, em qual caso, por quanto tempo e com qual evidência?

### Exemplos

- pessoa atendida autoriza filha a receber atualizações;
- responsável legal autoriza uso de determinado WhatsApp;
- cliente autoriza representante a enviar documentos;
- escritório autoriza operador administrativo a consultar dados necessários;
- autorização revogada em determinada data.

### Anti-exemplos

- posse de um telefone;
- parentesco;
- Contact associado ao Deal;
- mensagem “é para minha mãe”;
- participação em uma consulta;
- acesso presumido por conhecer o número do caso;
- consentimento sem escopo.

### Relações

- é concedida ou reconhecida por uma Person ou fundamento legítimo;
- beneficia outra Person;
- aplica-se a um Legal Case ou atividade específica;
- pode habilitar Representative ou Contato Autorizado;
- pode limitar uso de Communication Endpoint;
- possui início, fim, escopo, origem, status e histórico;
- pode ser suspensa ou revogada.

## 9. Legal Case

### Definição

Unidade de trabalho jurídico referente a uma situação, demanda ou objetivo específico.

### Responsabilidade

Responder:

> Qual situação jurídica está sendo atendida?

Legal Case concentra fatos, documentos, análises, decisões, urgência e evolução jurídica.

### Exemplos

- pedido de benefício previdenciário;
- ação trabalhista;
- defesa em processo;
- inventário;
- consulta jurídica vinculada a determinada demanda.

### Anti-exemplos

- Person;
- Contact;
- telefone;
- Conversation Session;
- pasta do cliente;
- relacionamento familiar;
- conjunto indistinto de todos os assuntos de uma pessoa.

### Relações

- possui uma ou mais Case Parties;
- possui ao menos uma pessoa atendida identificável;
- pode possuir Client, Representative e Financial Responsible distintos;
- pode autorizar determinados Communication Endpoints;
- pode ser discutido em várias Conversation Sessions;
- pode possuir consultas, documentos, narrativas e histórico;
- recebe atuação de advogados e operadores administrativos.

## 10. Conversation Session

### Definição

Contexto temporário de interação entre o escritório e um Conversation Actor por um Communication Endpoint.

### Responsabilidade

Responder:

> Qual conversa está em andamento, por qual canal, com quem e sobre qual contexto?

### Exemplos

- conversa atual de Maria sobre o Caso A;
- João iniciando atendimento para sua mãe;
- retomada de conversa após interrupção;
- sessão ainda sem Person ou Legal Case confirmado;
- ator selecionando entre vários casos.

### Anti-exemplos

- Person;
- histórico permanente do caso;
- Contact HubSpot;
- autorização;
- Legal Case;
- número de telefone;
- identidade definitiva.

### Relações

- utiliza um Communication Endpoint;
- possui um Conversation Actor conhecido, declarado ou desconhecido;
- pode referenciar um Legal Case selecionado;
- pode coletar intenção e estado transitório;
- pode originar relatos, documentos e pedidos;
- termina ou expira sem apagar Person, Case Party ou Legal Case;
- não concede papel ou Authorization automaticamente.

## Relações essenciais entre os termos

```text
Person
  ├── utiliza/opera ── Communication Endpoint
  │                       └── suporta ── Conversation Session
  │                                        └── possui ── Conversation Actor
  │
  ├── participa como ── Case Party ── em ── Legal Case
  │                         ├── Client
  │                         ├── Representative
  │                         └── Financial Responsible
  │
  └── concede/recebe ── Authorization
                            └── limitada por caso, ação e tempo
```

## Termos que substituem Contact

`Contact` não possui substituto único.

O termo correto depende da pergunta:

| Uso antigo de Contact | Termo oficial |
|---|---|
| pessoa humana | Person |
| telefone ou WhatsApp | Communication Endpoint |
| quem está conversando | Conversation Actor |
| pessoa vinculada ao caso | Case Party |
| pessoa atendida | Case Party com papel pessoa atendida |
| contratante | Client ou Case Party com papel cliente contratante |
| representante | Representative |
| pagador | Financial Responsible |
| destinatário autorizado | Person amparada por Authorization |
| registro do CRM | CRM Record ou HubSpot Contact, apenas em contexto técnico |

Regra:

> nunca substituir `Contact` mecanicamente por `Person`; primeiro deve-se identificar qual conceito o uso realmente representa.

## Termos que substituem personId

No discurso de domínio:

- usar **Person** para a entidade;
- usar **Person Identifier** para uma referência inequívoca à Person.

Quando o contexto exigir outro conceito:

| Significado pretendido | Termo correto |
|---|---|
| identificador da pessoa | Person Identifier |
| identificador do registro HubSpot | HubSpot Contact Identifier |
| identificador do canal | Communication Endpoint Identifier |
| identificador da participação no caso | Case Party Identifier |
| identificador de quem conversa | Conversation Actor Identifier |

Regra:

> Person Identifier nunca é sinônimo ou fallback automático de HubSpot Contact Identifier.

`personId` pode permanecer como nome técnico futuro somente se identificar exclusivamente uma Person. Enquanto representar `contactId`, seu significado é ambíguo.

## Termos ambíguos que não devem mais ser usados

### Evitar sem qualificação

| Termo ambíguo | Motivo | Preferir |
|---|---|---|
| Contact | mistura pessoa, canal e CRM | termo específico do contexto |
| contato | pode ser pessoa ou meio | Person, Endpoint ou Contato Autorizado |
| usuário | pode ser ator, cliente ou operador | Conversation Actor, Client ou profissional |
| cliente real | sugere oposição imprecisa | pessoa atendida ou cliente contratante |
| pessoa do WhatsApp | não distingue titular e operador | Conversation Actor ou titular do Endpoint |
| titular | não informa do quê | titular do Communication Endpoint |
| responsável | não informa responsabilidade | Representative, Financial Responsible ou responsável legal |
| terceiro | não informa papel | Representative, terceiro interessado, parte relacionada ou solicitante |
| contato principal | não informa finalidade | canal preferencial ou Case Party principal |
| dono do número | titularidade informal | titular declarado do Endpoint |
| pessoa vinculada | não informa vínculo | Case Party com papel explícito |
| cliente | ambíguo quando isolado | Prospective, Assisted ou Contracting Client |
| representante legal | não usar sem fundamento conhecido | Representative com tipo e fundamento declarados |

### Termos técnicos permitidos apenas em contexto técnico

- HubSpot Contact;
- `contactId`;
- Deal;
- `personId`;
- `from`;
- snapshot;
- sessão;
- telefone.

Esses termos não devem substituir conceitos de negócio em conversas funcionais.

## Frases oficiais

### Preferir

- “João é o Conversation Actor desta sessão.”
- “Maria é a pessoa atendida no Caso A.”
- “João é Representative de Maria no Caso A.”
- “O WhatsApp X é o Communication Endpoint usado nesta sessão.”
- “João possui Authorization para receber atualizações até determinada data.”
- “Carlos é Financial Responsible pelo Caso A.”
- “Ana é Client contratante e também pessoa atendida.”

### Evitar

- “O Contact é João.”
- “O telefone é o cliente.”
- “O personId é o contactId.”
- “Quem está no WhatsApp é o titular do caso.”
- “É terceiro, então pode acompanhar.”
- “Está associado ao Deal, então pode receber tudo.”
- “É o contato principal.”

## Critérios de consistência da linguagem

Uma descrição está semanticamente completa quando responde, conforme o contexto:

1. qual Person está envolvida;
2. qual Communication Endpoint está sendo usado;
3. quem é o Conversation Actor;
4. qual Legal Case está em questão;
5. qual Case Party a pessoa representa;
6. qual Authorization sustenta a ação ou acesso;
7. qual é a vigência do vínculo.

Se a frase usa apenas “Contact”, “cliente”, “terceiro” ou “usuário”, ela provavelmente ainda não expressa o domínio com precisão suficiente.

## Declaração oficial

Para futuras decisões arquiteturais e funcionais:

> **Person define identidade.**

> **Communication Endpoint define o meio de comunicação.**

> **Conversation Actor define quem participa da conversa.**

> **Case Party define o papel da pessoa no Legal Case.**

> **Authorization define o que a pessoa pode fazer ou receber.**

> **Conversation Session define o contexto temporário da interação.**

Nenhum desses conceitos deve ser deduzido exclusivamente a partir de um número de telefone ou registro Contact.
