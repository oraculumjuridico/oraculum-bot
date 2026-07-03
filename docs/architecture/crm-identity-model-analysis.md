# Fase 10 — diagnóstico do modelo de identidade CRM

## Escopo e evidência

Esta análise é exclusivamente arquitetural e read-only. Foram examinados os fluxos de WhatsApp, criação e busca de Contacts, associação Contact–Deal, casos para terceiros, persistência local e metadata de Consultation.

Não houve leitura dos registros reais do HubSpot nesta sessão. Portanto, o documento descreve o comportamento implementado e os riscos demonstráveis pelo código; não quantifica duplicidades ou associações incorretas existentes na base de produção.

## Resumo executivo

Hoje um Contact não possui um significado único.

Na maior parte do fluxo, ele funciona como:

> o registro HubSpot encontrado pelo número de WhatsApp usado como telefone operacional do atendimento.

No caso simples, esse registro também representa a pessoa atendida e o cliente. Nos fluxos para terceiros, porém, o sistema tenta fazer o Contact representar a pessoa atendida, mesmo quando outra pessoa iniciou a conversa. Se o telefone do terceiro ainda não existe, o número do remetente pode ser usado temporariamente ou em leads incompletos.

Assim, o modelo atual é uma mistura de:

- pessoa;
- canal WhatsApp;
- cliente;
- destinatário das mensagens;
- contato associado ao caso.

O código já reconhece que “quem fala” e “quem é atendido” podem ser pessoas diferentes, mas essa distinção existe principalmente em flags da sessão e campos do snapshot, não em entidades CRM e associações tipadas.

## 1. O que um Contact representa hoje

### Caso comum

Quando a própria pessoa abre o atendimento:

- `Contact` representa a pessoa atendida;
- `phone` representa seu WhatsApp;
- o mesmo Contact é associado ao Deal;
- o Contact também é tratado operacionalmente como cliente e destinatário das comunicações.

Nesse cenário, pessoa, cliente e canal coincidem.

### Caso para terceiro

O sistema coleta separadamente:

- `u.nomeContato`: quem está falando no WhatsApp;
- `u.nome`: pessoa atendida;
- `u.relacaoComAtendido`: relação entre ambos;
- `u.whatsappContato`: WhatsApp informado para a pessoa atendida;
- `u.telefoneEhDoCliente`: indica se o telefone pertence à pessoa atendida;
- `u.atendimentoParaTerceiro` ou `u._novoCasoParaTerceiro`: controla o fluxo.

Contudo, no HubSpot não são criadas duas pessoas com papéis explícitos. O código procura ou cria um único Contact pelo telefone selecionado por `getTelefoneContato()`, associa esse Contact ao Deal e guarda a identidade do outro participante principalmente no snapshot, em texto ou em Notes.

### Conclusão funcional

Hoje Contact representa:

| Conceito | Representa? | Observação |
|---|---|---|
| Pessoa física | Parcialmente | nome e cidade são gravados como dados pessoais |
| Número de WhatsApp | Fortemente | busca, deduplicação e retomada dependem do telefone |
| Cliente jurídico | Frequentemente | no fluxo simples, Contact é tratado como cliente |
| Pessoa atendida | Pretendido | sobretudo após coleta do telefone do terceiro |
| Titular do canal | Nem sempre | em casos para terceiros, quem conversa pode ser outra pessoa |
| Representante | Não explicitamente | relação existe apenas em campos de sessão/texto |

O significado efetivo é, portanto, “pessoa alcançável por este telefone”, com sobreposição de papéis.

## 2. Como um Contact é identificado

### Chave de busca

`hsBuscarPorPhone(phone)`:

1. normaliza o número;
2. pesquisa Contact com `phone EQ número normalizado`;
3. usa o primeiro resultado retornado.

Evidência:

- `src/domain/hubspot-core.js`, função `hsBuscarPorPhone`;
- `src/domain/phone-name.js`, função `normalizarNumeroWhatsAppEnvio`.

### Criação

Se nenhum Contact é encontrado:

- cria Contact com `firstname`, `phone` e `city`;
- o nome pode vir de `u.nome`, perfil do WhatsApp ou fallback “Lead WhatsApp”.

Evidência:

- `src/domain/hubspot-core.js`, função `hsCriarContato`.

### Identificação em memória

As sessões são indexadas pelo número de WhatsApp de origem (`from`). O estado guarda depois:

- `contatoId`;
- `negocioId`;
- `whatsappContato`;
- nomes e flags de terceiro.

Assim, a chave do runtime é o canal, enquanto a chave externa do CRM é o ID HubSpot descoberto pelo mesmo canal.

### Identificação em Consultation

Eventos Calendar recebem:

- `dealId`;
- `personId`;
- `contactId`.

Porém, `personId` usa fallback para `contactId`; não existe entidade Person independente.

Evidência:

- `src/domain/calendar-scheduling.js:194-195`;
- `server.js:15014-15017`.

Atualmente `personId` e `contactId` podem ser apenas dois nomes para o mesmo ID HubSpot.

## 3. O telefone é chave primária de fato?

Sim, operacionalmente.

Embora o HubSpot forneça `contactId` como identificador técnico, o sistema usa telefone para:

- localizar Contact;
- decidir se cria ou reutiliza Contact;
- indexar sessão local;
- localizar usuário em webhooks;
- transferir a continuidade de caso para o WhatsApp do terceiro;
- deduplicar parcialmente pessoas;
- encontrar o destinatário de lembretes e comunicações.

Portanto:

- `contactId` é a chave técnica depois da resolução;
- `phone` é a chave natural e de resolução de identidade;
- `from` é a chave primária do estado conversacional.

### Limitações dessa chave

- uma pessoa pode trocar de número;
- um número pode ser compartilhado por família ou empresa;
- um representante pode usar seu número para abrir casos de várias pessoas;
- números reciclados podem passar a pertencer a outra pessoa;
- normalização com ou sem nono dígito pode gerar equivalências ou divergências;
- múltiplos Contacts com o mesmo `phone` não são tratados explicitamente;
- a busca usa apenas o primeiro resultado;
- não há chave civil estável, como CPF, nem `personId` próprio.

## 4. Distinção entre papéis

### Pessoa atendida

Existe conceitualmente.

É normalmente representada por:

- `u.nome`;
- cidade e dados do caso;
- WhatsApp em `u.whatsappContato`;
- Contact associado ao Deal, quando o fluxo conclui como esperado.

Não existe entidade ou associação CRM denominada “pessoa atendida”.

### Cliente

Não há definição formal única.

O termo é usado para:

- pessoa com caso cadastrado;
- usuário que acessa o menu do cliente;
- Contact associado ao Deal;
- destinatário do WhatsApp;
- pessoa atendida.

Logo, “cliente” funciona como status operacional, não como papel jurídico modelado.

### Responsável financeiro

Não foi encontrado modelo específico.

Não existem campos, entidade ou associação tipada que indiquem:

- quem contrata;
- quem paga;
- quem recebe cobrança;
- quem é responsável financeiro.

Menções a impacto financeiro são dados de urgência do caso, não identidade do pagador.

### Titular do WhatsApp

Existe apenas de maneira indireta:

- `from` identifica quem está na conversa;
- `u.nomeContato` guarda seu nome no fluxo para terceiro;
- `u.telefoneEhDoCliente` compara canal e pessoa atendida;
- `u.whatsappContato` guarda o telefone escolhido para continuidade.

Não há entidade `CommunicationEndpoint` nem associação “este número pertence/é operado por esta pessoa”.

### Representante

Existe como intenção de fluxo, mas não como identidade persistente estruturada.

O sistema reconhece relações como:

- mãe/pai;
- filho/filha;
- esposo/esposa;
- irmão/irmã;
- avô/avó;
- familiar, amigo ou terceiro.

`relacaoComAtendido` guarda parte dessa informação. Não há:

- Contact obrigatoriamente criado para o representante;
- associação representante ↔ pessoa atendida;
- associação representante ↔ Deal;
- tipo de representação;
- validade, consentimento ou documento comprobatório;
- poderes para receber informação jurídica.

## 5. Fluxos que permitem terceiro abrir atendimento

### Novo atendimento detectado como caso de terceiro

O pré-atendimento detecta linguagem como:

- “é para minha mãe”;
- “quero ajudar meu amigo”;
- “vou responder por alguém”;
- “caso para outra pessoa”.

Fontes:

- regras em `src/domain/pre-atendimento-classifier.js`;
- classificação por IA com confiança alta;
- escolha explícita `para_quem_outro`.

O fluxo coleta primeiro quem está no WhatsApp e depois a pessoa atendida.

### Cliente existente abrindo novo caso para terceiro

No menu, um cliente com caso anterior pode abrir outro caso para outra pessoa.

O sistema:

- cria snapshot temporário do caso anterior;
- coleta nome e WhatsApp do terceiro;
- cria novo Deal;
- tenta preparar sessão no número informado;
- notifica o terceiro para reconhecer ou rejeitar o atendimento;
- devolve o iniciador ao caso original.

### Terceiro com WhatsApp informado

Quando o telefone da pessoa atendida é diferente do remetente:

- uma nova sessão pode ser preparada sob esse número;
- o terceiro recebe convite para reconhecer o caso;
- o sistema tenta fazer a continuidade ocorrer no canal da pessoa atendida.

### Lead incompleto para terceiro

Se o fluxo é abandonado:

- pode ser criado Contact/Deal de lead incompleto;
- usa o WhatsApp do terceiro, se disponível;
- caso contrário, pode usar o telefone do remetente;
- a identidade de quem abriu e da pessoa atendida fica descrita em Note.

Esse é o cenário de maior ambiguidade, pois o CRM pode registrar como Contact do lead um canal que pertence ao representante.

## 6. Ambiguidades existentes

### Contact pessoa versus Contact canal

O Contact recebe nome e cidade de pessoa, mas é localizado pelo telefone. Não há como representar com clareza:

- uma pessoa com vários telefones;
- um telefone compartilhado;
- um telefone operado por representante;
- troca de telefone sem troca de identidade.

### `nome` muda de significado conforme o fluxo

No fluxo simples, `u.nome` é quem conversa e é atendido.

No fluxo para terceiro:

- `u.nome` é a pessoa atendida;
- `u.nomeContato` é quem conversa.

Funções que não considerem `atendimentoParaTerceiro` podem atribuir dados à pessoa errada.

### Contact associado ao Deal sem papel

`hsAssociar()` cria associação genérica `deal_to_contact`.

Não informa se o Contact é:

- parte atendida;
- representante;
- titular do canal;
- responsável financeiro;
- contratante;
- contato de emergência.

### Apenas o primeiro Contact é consumido

Em rotinas administrativas e de reunião, o sistema pega:

```text
associations/contacts → results[0]
```

Mesmo que um Deal possua vários Contacts, não há seleção por papel.

### Reutilização de Deal aberto por Contact

O sistema percorre Deals associados ao Contact e retorna o primeiro não finalizado.

Em certos fluxos isso pode unir uma nova demanda ao caso aberto errado, especialmente quando:

- um representante abre casos para pessoas diferentes;
- um número é compartilhado;
- o Contact possui vários Deals ativos.

Há listagem posterior de múltiplos Deals para o menu, mas a captura inicial ainda possui caminho de reutilização do primeiro Deal aberto.

### Colisão entre nome e telefone

Quando telefone do terceiro já existe com nome diferente:

- o sistema preserva o nome do Contact;
- registra divergência em Note;
- ainda associa o caso àquele Contact.

Isso evita sobrescrita destrutiva, mas não resolve qual pessoa realmente controla o número.

### `personId` sem entidade Person

Consultation exige `personId`, mas usa `contactId` como fallback. Isso cria aparência de separação sem separação semântica real.

### Consentimento sem modelagem

O terceiro pode reconhecer ou rejeitar o caso pelo WhatsApp. A rejeição gera Note e alerta, mas não existe registro estruturado de:

- consentimento;
- identidade verificada;
- data e escopo da autorização;
- representação legal.

## 7. Riscos

### CRM

- Contacts duplicados por variação de telefone;
- pessoas diferentes consolidadas no mesmo Contact;
- troca indevida de nome/cidade;
- Notes de casos distintos acumuladas na timeline de uma pessoa errada;
- múltiplos Deals associados sem papel identificável;
- segmentação, atendimento e relatórios por pessoa imprecisos;
- impossibilidade de distinguir cliente, parte e representante.

### Consultation

- convite, lembrete ou cancelamento enviado ao representante em vez da pessoa atendida;
- `personId` apontando para Contact que representa apenas o canal;
- reunião associada ao primeiro Contact do Deal, não necessariamente ao participante correto;
- histórico de consulta atribuído à pessoa errada;
- mudança de telefone rompendo a resolução da sessão;
- caso de terceiro não reconhecido ainda mantendo vínculos CRM anteriores.

### HubSpot

- `phone` opera como unicidade lógica sem garantia explícita de unicidade;
- `results[0]` torna colisões silenciosas;
- associação padrão não registra papéis;
- propriedades pessoais podem ser atualizadas a partir do contexto do caso errado;
- buscas de “Deal aberto do Contact” podem reutilizar caso incorreto;
- Contact pode concentrar narrativas juridicamente distintas de várias pessoas.

### Histórico jurídico

- autoria da narrativa pode ficar ambígua: relato do representante ou da parte;
- documentos podem ser atribuídos ao titular errado;
- não há prova estruturada de quem forneceu cada informação;
- consentimento e representação ficam em conversa ou Note, não em vínculo versionado;
- timeline do Contact pode misturar assuntos de pessoas diferentes;
- dossiê pode identificar `contactId` como `personId` sem comprovar identidade;
- risco de confidencialidade ao exibir andamento de caso ao mero titular do número;
- risco LGPD por vincular dados sensíveis à pessoa errada.

## 8. Modelo alvo com entidades explícitas

### 8.1 Person

Representa uma pessoa física, independentemente de telefone, canal ou caso.

Campos mínimos:

- `personId` interno estável;
- nome completo;
- data de nascimento, quando necessária;
- documento civil, quando legitimamente coletado;
- dados de verificação;
- status de identidade;
- referências aos registros HubSpot.

Regra:

> uma Person continua sendo a mesma mesmo quando troca de telefone ou participa de vários casos.

### 8.2 CommunicationEndpoint

Representa um canal de comunicação.

Campos:

- `endpointId`;
- tipo: WhatsApp, telefone, e-mail;
- valor normalizado;
- status de verificação;
- origem;
- validade;
- titular declarado;
- operador atual;
- consentimento de contato.

Relação:

- uma Person pode ter vários endpoints;
- um endpoint pode ser compartilhado ou operado por representante;
- titularidade e uso precisam de contexto temporal.

### 8.3 LegalCase

Representa exclusivamente o caso jurídico.

Mapeamento:

- um Deal HubSpot corresponde a um LegalCase;
- guarda dados estruturados do caso;
- não define identidade apenas por Contact associado.

### 8.4 CaseParty

Associação entre Person e LegalCase com papel explícito.

Papéis possíveis:

- `ASSISTIDO`;
- `CLIENTE_CONTRATANTE`;
- `REPRESENTANTE`;
- `RESPONSAVEL_FINANCEIRO`;
- `PARTE_CONTRARIA`;
- `DEPENDENTE`;
- `CONTATO_AUTORIZADO`.

Campos:

- início e fim da relação;
- origem da informação;
- status de verificação;
- prioridade;
- autorização para receber informações;
- relação familiar ou jurídica.

Uma pessoa pode exercer mais de um papel no mesmo caso.

### 8.5 Representation

Modela a autorização de uma Person para agir por outra em determinado LegalCase.

Campos:

- `representativePersonId`;
- `representedPersonId`;
- `caseId`;
- tipo: informal, responsável legal, procurador, curador etc.;
- escopo;
- status;
- evidência;
- concedida/revogada em;
- verificada por.

Esse vínculo não deve ser inferido apenas porque alguém iniciou o WhatsApp.

### 8.6 CRMContactReference

Mapeia Person para Contact HubSpot sem transformar o Contact na identidade canônica.

Campos:

- `personId`;
- `hubspotContactId`;
- status do vínculo;
- data de sincronização;
- regra de merge;
- proveniência.

No modelo alvo:

- Contact HubSpot representa a projeção CRM de uma Person;
- `phone` é atributo/canal, não identidade;
- o `personId` interno é a chave canônica.

### 8.7 ConversationSession

Representa o estado transitório da conversa.

Campos:

- `sessionId`;
- `endpointId`;
- `actorPersonId`, quando identificado;
- `caseId`, quando selecionado;
- intenção atual;
- estado temporário;
- expiração.

Regra:

> sessão pertence ao canal e ao ator da conversa, não automaticamente à pessoa atendida.

### 8.8 ConsultationParticipant

Associa uma consulta a pessoas e papéis.

Campos:

- `consultationId` ou `calendarEventId`;
- `caseId`;
- `personId`;
- papel: atendido, representante, advogado, acompanhante;
- endpoint de lembrete;
- presença e resultado.

Calendar continua como fonte do compromisso; a identidade dos participantes não deve depender do primeiro Contact associado ao Deal.

## Mapeamento recomendado para HubSpot

| Conceito alvo | HubSpot |
|---|---|
| Person | Contact |
| LegalCase | Deal |
| CaseParty | associação Contact–Deal com label/papel |
| CommunicationEndpoint | propriedades multicanal ou objeto customizado, conforme capacidade da conta |
| Representation | objeto customizado ou associação tipada com propriedades externas |
| Consultation | Calendar, referenciado pelo Deal e participantes |
| ConversationSession | fora do HubSpot |

Se associações HubSpot não suportarem todos os atributos necessários, o sistema deve manter um registro interno canônico e projetar apenas os papéis essenciais no CRM.

## Regras arquiteturais recomendadas

1. `personId` nunca deve ser preenchido automaticamente com `contactId` sem contrato explícito de mapeamento.
2. Telefone identifica endpoint, não pessoa.
3. Todo Deal deve possuir exatamente uma parte principal `ASSISTIDO`, mas pode possuir vários participantes.
4. Quem inicia a conversa deve ser registrado como `actorPersonId`.
5. Representante e assistido devem ser Persons diferentes quando forem pessoas diferentes.
6. Responsável financeiro deve ser papel explícito, não inferência.
7. Toda associação Contact–Deal deve possuir papel.
8. Notas e documentos devem registrar autor/origem.
9. Acesso ao caso deve depender de autorização, não apenas de posse do telefone.
10. Merge de Contacts deve exigir evidência de identidade além do número.

## Conclusão

O modelo atual funciona bem apenas quando:

```text
titular do WhatsApp = pessoa atendida = cliente = Contact
```

O sistema já possui fluxos sofisticados para casos em que essa igualdade não vale, mas tenta acomodá-los dentro de uma estrutura de um Contact e um telefone. Isso desloca a complexidade para flags, snapshots, Notes e regras condicionais.

O modelo alvo deve separar Person, CommunicationEndpoint, LegalCase, CaseParty, Representation e ConversationSession. O HubSpot permanece como projeção CRM de pessoas e casos; não deve ser a única camada capaz de expressar identidade jurídica e autorização.
