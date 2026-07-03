# Fase 10 — modelo conceitual de identidade e relacionamentos

## Objetivo

Estabelecer um vocabulário de domínio que separe:

```text
IDENTIDADE
CANAL
PAPEL NO CASO
RELACIONAMENTO
```

Este documento não define implementação, banco, classes, APIs ou migração.

## Princípio central

Uma pessoa não é:

- seu telefone;
- seu Contact;
- seu papel em um caso;
- sua sessão de WhatsApp.

Uma mesma pessoa pode:

- possuir vários canais;
- operar um canal que não lhe pertence;
- participar de vários casos;
- exercer papéis diferentes em cada caso;
- mudar de papel ao longo do tempo.

Da mesma forma, um caso pode envolver várias pessoas, cada uma com direitos, responsabilidades e níveis de acesso diferentes.

## Vocabulário essencial

### Identidade

É o sujeito estável do domínio: a pessoa cuja continuidade independe de telefone, caso ou papel.

### Canal

É o meio pelo qual uma comunicação é enviada ou recebida.

Exemplos:

- WhatsApp;
- telefone;
- e-mail.

### Papel no caso

É a função exercida por uma pessoa dentro de um caso específico.

Exemplos:

- pessoa atendida;
- cliente contratante;
- representante;
- responsável financeiro;
- terceiro interessado.

### Relacionamento

É o vínculo contextual entre:

- pessoa e canal;
- pessoa e caso;
- pessoa e outra pessoa;
- profissional e caso.

O relacionamento pode possuir validade, origem, autorização, verificação e histórico próprios.

## 1. Atores do negócio

### Pessoa

É o ator humano fundamental.

Os demais conceitos não são tipos permanentes de pessoa. São papéis assumidos por uma pessoa em determinado contexto.

### Pessoa atendida

Pessoa cuja situação jurídica é objeto do atendimento.

Pode ou não:

- iniciar a conversa;
- ser titular do WhatsApp;
- contratar o escritório;
- pagar pelos serviços;
- participar diretamente de uma consulta.

### Cliente

Pessoa que mantém relação de atendimento ou contratação com o escritório.

“Cliente” não deve ser presumido como sinônimo automático de:

- pessoa atendida;
- titular do canal;
- pagador;
- representante.

Uma pessoa atendida pode ainda não ser cliente contratante. Um contratante pode contratar em benefício de outra pessoa.

### Cliente contratante

Pessoa que aceita ou celebra a contratação relativa ao caso.

Pode coincidir com a pessoa atendida, mas isso não é obrigatório.

### Representante

Pessoa que atua em nome ou no interesse da pessoa atendida.

O termo abrange situações distintas:

- familiar que inicia o atendimento;
- responsável legal;
- procurador;
- curador;
- pessoa autorizada informalmente;
- intermediário sem representação comprovada.

Ser representante não implica automaticamente autorização irrestrita para receber informações.

### Responsável financeiro

Pessoa responsável por pagamento, cobrança ou obrigação financeira relacionada ao caso.

Pode ser:

- a pessoa atendida;
- o cliente contratante;
- o representante;
- outra pessoa.

Esse papel é independente do mérito jurídico do caso.

### Titular do WhatsApp

Pessoa à qual o número ou conta é atribuído.

Titularidade não garante que essa pessoa:

- esteja operando o canal naquele momento;
- seja a pessoa atendida;
- seja cliente;
- esteja autorizada a receber informações do caso.

### Operador do canal

Pessoa que efetivamente envia e recebe mensagens por determinado canal em certo período.

Pode ser diferente do titular declarado.

### Solicitante

Pessoa que inicia um atendimento ou pede a abertura de um caso.

O solicitante pode ser:

- a pessoa atendida;
- um representante;
- um familiar;
- um terceiro interessado;
- alguém cuja legitimidade ainda não foi confirmada.

### Contato autorizado

Pessoa autorizada a receber determinado tipo de comunicação sobre o caso.

A autorização pode ser limitada por:

- assunto;
- canal;
- período;
- nível de confidencialidade.

### Terceiro interessado

Pessoa relacionada ao caso que possui interesse ou participação, mas não é necessariamente:

- pessoa atendida;
- cliente;
- representante;
- responsável financeiro.

### Parte relacionada

Pessoa mencionada ou envolvida juridicamente no caso.

Pode incluir:

- dependente;
- beneficiário;
- responsável legal;
- testemunha;
- parte contrária.

Nem toda parte relacionada deve possuir acesso ao atendimento.

### Advogado

Profissional responsável por atendimento, análise, orientação ou condução jurídica do caso.

É uma pessoa com papel profissional no caso, não parte do caso.

### Operador administrativo

Profissional do escritório que executa atividades administrativas.

Pode:

- conferir dados;
- solicitar documentos;
- registrar informações;
- organizar agenda;
- acompanhar pendências.

Não deve ser confundido com advogado responsável.

### Escritório

Ator institucional que presta o serviço, mantém o CRM e responde pelo tratamento das informações.

## 2. Relacionamentos existentes

### Pessoa e canal

| Relacionamento | Significado |
|---|---|
| titular de | pessoa à qual o canal é atribuído |
| operador de | pessoa que utiliza o canal |
| alcançável por | canal apto a receber comunicação destinada à pessoa |
| autorizou contato por | consentimento para uso do canal |
| verificou posse de | confirmação de acesso ao canal |

### Pessoa e caso

| Relacionamento | Significado |
|---|---|
| é pessoa atendida em | situação jurídica pertence à pessoa |
| é cliente contratante de | pessoa contrata o serviço |
| representa em | pessoa atua em nome de outra no caso |
| é responsável financeiro por | pessoa assume obrigação financeira |
| é contato autorizado de | pessoa pode receber comunicações |
| é terceiro interessado em | pessoa possui interesse sem ser assistida |
| é parte relacionada a | pessoa participa ou é mencionada juridicamente |
| solicitou abertura de | pessoa iniciou o atendimento |

### Pessoa e pessoa

| Relacionamento | Significado |
|---|---|
| representa | uma pessoa atua por outra |
| é responsável legal por | vínculo jurídico de responsabilidade |
| é familiar de | relação familiar declarada |
| foi autorizado por | autorização concedida por outra pessoa |
| indicou | pessoa encaminhou outra ao escritório |

Essas relações não substituem o papel no caso. Ser familiar não implica representação ou acesso.

### Profissional e caso

| Relacionamento | Significado |
|---|---|
| advogado responsável por | responsabilidade jurídica principal |
| advogado participante em | atuação pontual ou compartilhada |
| operador administrativo de | atribuição administrativa |
| realizou atendimento em | participação em consulta ou contato |

### Canal e caso

| Relacionamento | Significado |
|---|---|
| canal autorizado para | meio permitido para comunicação do caso |
| canal preferencial de | principal destino operacional |
| canal de origem de | meio pelo qual determinada informação chegou |

O canal não participa do caso como pessoa. Ele apenas transporta comunicação.

## 3. Relacionamentos temporários

São necessariamente temporários ou sujeitos a revisão:

- operador de um canal;
- posse verificada de um canal;
- autorização de contato;
- canal preferencial;
- representação;
- contato autorizado;
- responsável financeiro;
- cliente contratante;
- advogado responsável;
- operador administrativo;
- participação em consulta;
- acesso a informações;
- status de cliente;
- papel de solicitante durante a abertura.

Também podem mudar:

- titularidade declarada do canal;
- relação familiar;
- responsabilidade legal;
- condição de pessoa atendida, quando o escopo do caso muda.

Um relacionamento temporário precisa indicar, conceitualmente:

- quando começou;
- quando terminou;
- se está ativo;
- por que foi alterado;
- qual era seu escopo.

## 4. Relacionamentos que precisam de histórico

### Histórico obrigatório

Devem manter histórico completo:

- representação;
- autorização para receber informações;
- titularidade e operação do canal;
- consentimento de contato;
- pessoa atendida no caso;
- cliente contratante;
- responsável financeiro;
- advogado responsável;
- atribuições administrativas relevantes;
- reconhecimento ou rejeição de atendimento por terceiro;
- alteração de canal preferencial;
- verificação de identidade ou posse.

### Motivos

O histórico deve permitir responder:

- quem podia agir por quem em determinada data?
- quem podia receber informações?
- qual canal era considerado válido?
- quem forneceu um relato ou documento?
- quem era o responsável pelo caso?
- quando uma autorização foi concedida ou revogada?

### Relacionamentos que podem ser apenas informativos

Relações como indicação ou parentesco podem não exigir o mesmo rigor, salvo quando fundamentarem:

- representação;
- responsabilidade legal;
- acesso;
- contratação;
- comunicação confidencial.

## 5. Informações pertencentes à pessoa

Pertencem à identidade da pessoa, independentemente do caso:

- nome civil;
- nome social;
- data de nascimento;
- documento de identificação;
- nacionalidade;
- estado civil, quando relevante;
- dados gerais de localização;
- necessidades de acessibilidade;
- preferências gerais de comunicação;
- status de verificação da identidade;
- histórico de alterações cadastrais.

Não pertencem diretamente à pessoa:

- número de caso;
- stage do Deal;
- urgência de um caso;
- consulta específica;
- papel de representante;
- telefone como identidade;
- responsabilidade financeira de um caso.

Uma informação pessoal pode mudar ao longo do tempo sem criar uma nova pessoa.

## 6. Informações pertencentes ao canal

Pertencem ao canal:

- tipo do canal;
- endereço ou número;
- forma normalizada;
- plataforma;
- status técnico;
- capacidade de envio e recebimento;
- verificação de posse;
- data da última verificação;
- origem do canal;
- restrições de uso;
- consentimento de comunicação;
- preferência operacional;
- período de validade;
- titular declarado;
- operador conhecido.

Titular e operador são relacionamentos com pessoas, não propriedades imutáveis do canal.

O histórico de mensagens pertence à interação realizada pelo canal, com autoria atribuída à pessoa quando conhecida.

## 7. Informações pertencentes ao caso

Pertencem ao caso:

- número do caso;
- área jurídica;
- tipo e subtipo;
- fatos e narrativa;
- pedido ou objetivo jurídico;
- urgência;
- prazos;
- situação jurídica;
- documentos;
- análises;
- decisões;
- notas jurídicas e administrativas;
- pasta de documentos;
- consultas relacionadas;
- pipeline e estágio;
- origem do atendimento;
- status de contratação;
- status processual;
- histórico do caso.

O caso referencia pessoas por seus papéis, mas não deve copiar sua identidade como se fosse estado próprio.

Relatos e documentos também precisam registrar:

- quem forneceu;
- em nome de quem;
- por qual canal;
- em que momento;
- com qual nível de confirmação.

## 8. Informações pertencentes ao relacionamento

Pertencem ao vínculo entre pessoa, caso e canal:

- papel exercido;
- tipo de representação;
- relação declarada com a pessoa atendida;
- escopo da autorização;
- permissão para receber informações;
- permissão para enviar documentos;
- responsabilidade financeira;
- preferência de contato para aquele caso;
- canal autorizado;
- prioridade do contato;
- origem da declaração;
- nível de verificação;
- evidência apresentada;
- início e fim;
- status ativo, suspenso ou revogado;
- responsável pela validação;
- motivo da alteração.

Essas informações não devem ser tratadas como atributos permanentes da pessoa.

Exemplo:

> “Maria representa João no Caso A” pertence ao relacionamento. Não significa que Maria represente João em todos os casos.

## 9. Modelo conceitual do domínio

### Conceitos fundamentais

| Conceito | Responsabilidade conceitual |
|---|---|
| Pessoa | identidade humana estável |
| Canal | meio de comunicação |
| Caso | unidade jurídica atendida |
| Participação no caso | papel de uma pessoa em um caso |
| Relação entre pessoas | representação, responsabilidade ou vínculo declarado |
| Autorização | permissão contextual e temporal |
| Interação | comunicação ocorrida por um canal |
| Profissional responsável | atuação do escritório no caso |

### Relações cardinais

- uma pessoa pode utilizar vários canais;
- um canal pode ser operado por mais de uma pessoa ao longo do tempo;
- uma pessoa pode participar de vários casos;
- um caso pode envolver várias pessoas;
- uma pessoa pode exercer vários papéis no mesmo caso;
- um papel pode mudar ou terminar;
- uma representação vincula representante, representado e caso;
- uma autorização possui escopo e validade;
- uma interação ocorre por um canal e possui autor conhecido, declarado ou desconhecido.

### Estrutura conceitual

```text
PESSOA
  ├── relaciona-se com ── CANAL
  │                         ├── titularidade
  │                         ├── operação
  │                         ├── verificação
  │                         └── consentimento
  │
  ├── participa de ────── CASO
  │                         ├── pessoa atendida
  │                         ├── cliente contratante
  │                         ├── representante
  │                         ├── responsável financeiro
  │                         ├── contato autorizado
  │                         └── terceiro interessado
  │
  └── relaciona-se com ── PESSOA
                            ├── representação
                            ├── responsabilidade legal
                            ├── parentesco declarado
                            └── autorização

PROFISSIONAL
  └── atua em ─────────── CASO
                            ├── responsabilidade jurídica
                            ├── participação
                            └── atividade administrativa
```

### Regras conceituais

1. Uma identidade não é deduzida apenas pelo telefone.
2. Um canal não concede acesso automático a um caso.
3. A pessoa que fala não é presumida como pessoa atendida.
4. O Contact não define sozinho o papel no caso.
5. Todo caso deve saber quem é sua pessoa atendida.
6. Todo acesso por representante depende de relação e autorização.
7. Responsabilidade financeira é independente de representação.
8. Um papel vale somente no contexto e período declarados.
9. Autoria de relato, documento e decisão deve ser distinguível.
10. Alterações de papel ou autorização não apagam o histórico anterior.

## Separação final

### IDENTIDADE

Responde:

> Quem é a pessoa?

Permanece estável apesar de mudanças de telefone, caso ou papel.

### CANAL

Responde:

> Por onde a comunicação acontece e quem pode operar esse meio?

Não define identidade nem autorização jurídica.

### PAPEL NO CASO

Responde:

> O que esta pessoa representa neste caso específico?

Pode variar entre casos e ao longo do tempo.

### RELACIONAMENTO

Responde:

> Qual vínculo permite que esta pessoa use este canal, participe deste caso ou aja por outra pessoa?

Possui contexto, validade, escopo, origem e histórico.

## Conclusão

O núcleo do domínio não é “Contact com telefone”. É:

```text
uma pessoa identificável
usando ou associada a um canal
exercendo um papel específico
dentro de um relacionamento contextual e temporal
com um caso
```

Essa separação elimina a equivalência implícita entre pessoa, cliente, telefone e Contact sem presumir que todos os atendimentos tenham múltiplos participantes.
