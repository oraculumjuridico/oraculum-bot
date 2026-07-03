# CRM Oráculum — análise do próximo gargalo de negócio

## Escopo

Esta análise considera como contexto:

- encerramento estrutural de Consultation v9;
- limitações operacionais ainda em observação;
- diagnóstico atual do modelo de identidade CRM.

Não apresenta arquitetura, implementação ou plano de migração.

## Conclusão executiva

O maior gargalo conceitual do CRM Oráculum é:

> **a incapacidade de distinguir com segurança a pessoa atendida, quem opera o WhatsApp, quem representa o cliente e qual papel cada pessoa exerce em cada caso.**

Consultation v9 reduziu a ambiguidade de agenda ao definir uma fonte de verdade. O CRM ainda não possui equivalente semântico para identidade.

O sistema funciona de forma natural quando:

```text
titular do WhatsApp = pessoa atendida = cliente = Contact
```

Quando essa igualdade não existe, a distinção depende de flags, nomes, Notes, snapshots e interpretação contextual.

Essa é a maior dívida porque pode contaminar simultaneamente:

- associação Contact–Deal;
- comunicação com o cliente;
- histórico jurídico;
- documentos;
- consultas;
- confidencialidade;
- relatórios;
- reaproveitamento de casos.

A frequência real desse problema ainda não foi validada em produção. A prioridade decorre do impacto potencial e da abrangência, não de volume comprovado.

## Priorização

| Prioridade | Tema | Impacto potencial | Evidência atual |
|---:|---|---|---|
| 1 | Identidade, canal e papéis no caso | crítico | ambiguidade comprovada no modelo; frequência não validada |
| 2 | Qualidade e confiabilidade dos dados CRM | alto | busca por telefone, primeiro resultado e associações sem papel |
| 3 | Autoria e localização da narrativa jurídica | alto | informação distribuída entre propriedades, Notes e snapshot |
| 4 | Semântica do ciclo jurídico/comercial | médio/alto | Deal concentra etapas de naturezas distintas |
| 5 | Observabilidade operacional | médio | falhas HubSpot/Calendar e custo de correção ainda não mensuráveis |
| 6 | Consultation | controlado | estruturalmente encerrado; permanece em observação |

## 1. Problema operacional original que permanece

O problema original ainda presente é:

> **o atendimento começa por um canal, mas o CRM presume que o canal identifica a pessoa e que essa pessoa é o sujeito do caso.**

O telefone continua sendo a chave operacional para:

- localizar ou criar Contact;
- restaurar sessão;
- decidir qual Deal reutilizar;
- enviar mensagens;
- vincular consulta;
- associar histórico.

Essa estratégia é suficiente no caso simples, mas frágil quando:

- alguém abre atendimento para terceiro;
- um familiar representa a pessoa atendida;
- o número é compartilhado;
- a pessoa troca de telefone;
- o telefone já existe com outro nome;
- um Contact possui vários Deals ativos;
- várias pessoas participam do mesmo caso.

### Manifestação operacional

O sistema precisa responder repetidamente:

- quem está falando?
- para quem é o caso?
- de quem é o telefone?
- quem pode receber informações?
- qual Contact deve ser associado?
- qual Deal deve ser reutilizado?

Essas perguntas não são respondidas por um conceito estável do CRM. São resolvidas caso a caso por lógica procedural.

### Situação observada

A análise read-only mais recente encontrou:

- 1 Contact;
- 1 Deal;
- 1 sessão local;
- nenhum caso suspeito de terceiro nessa amostra.

Isso não elimina o gargalo. Apenas demonstra que a base observada é pequena demais para medir sua incidência.

## 2. Ambiguidades de domínio

### Contact

Pode significar:

- pessoa física;
- titular do telefone;
- pessoa atendida;
- cliente;
- representante;
- destinatário operacional.

Não existe significado único.

### Cliente

Pode significar:

- pessoa com acesso ao menu;
- pessoa atendida;
- Contact associado ao Deal;
- contratante;
- titular do WhatsApp.

Não há distinção entre cliente jurídico, usuário do canal e contratante.

### Pessoa atendida

Existe no discurso do sistema, mas não possui papel explícito no relacionamento CRM.

No fluxo para terceiro, geralmente aparece em `u.nome`; no fluxo simples, o mesmo campo também identifica quem conversa.

### Representante

É reconhecido pelo fluxo, mas não possui vínculo persistente e inequívoco com:

- a pessoa representada;
- o caso;
- o escopo de autorização;
- o direito de receber informações.

### Responsável financeiro

Não está modelado.

O CRM não distingue:

- quem é atendido;
- quem contrata;
- quem paga;
- quem deve receber cobrança.

### Telefone

É tratado ao mesmo tempo como:

- atributo pessoal;
- endereço de comunicação;
- índice da sessão;
- critério de deduplicação;
- chave para localizar identidade.

### Contact–Deal

A associação não informa o papel da pessoa no caso.

Quando existem vários Contacts, partes do sistema usam o primeiro associado. Quando existem vários Deals, partes do sistema procuram o primeiro não finalizado.

### `personId`

Frequentemente é apenas outro nome para `contactId`.

O campo transmite a ideia de identidade independente sem garantir que exista uma pessoa distinta do registro CRM.

### Autoria da informação

Em caso para terceiro, nem sempre é estruturalmente claro se:

- o relato veio da pessoa atendida;
- o representante relatou em nome dela;
- o documento foi enviado pelo assistido ou por terceiro;
- a autorização foi confirmada.

## 3. Áreas com maior dívida conceitual

### 1. Identidade e papéis

Nível de dívida: **crítico**.

Razões:

- mistura pessoa e canal;
- depende do telefone;
- não representa múltiplos papéis;
- não registra claramente representação;
- afeta confidencialidade e autoria;
- contamina outros domínios.

### 2. Relação entre pessoas e casos

Nível de dívida: **alto**.

Razões:

- associação Contact–Deal sem significado;
- dificuldade com múltiplos participantes;
- seleção do primeiro Contact associado;
- possível reaproveitamento do Deal errado;
- ausência de contratante e responsável financeiro.

### 3. Qualidade do cadastro

Nível de dívida: **alto**.

Razões:

- telefone funciona como unicidade lógica;
- múltiplos resultados não são tratados;
- colisão de nome é registrada em Note, mas não resolvida;
- número compartilhado ou reciclado pode consolidar pessoas distintas;
- mudança de telefone pode duplicar identidade.

### 4. Narrativa e histórico jurídico

Nível de dívida: **alto**.

Razões:

- informação pode estar em propriedades, Notes, snapshot ou Drive;
- autoria pode ser ambígua;
- timeline do Contact pode misturar casos de pessoas diferentes;
- associação incorreta de identidade compromete o valor do histórico.

### 5. Semântica do Deal e pipeline

Nível de dívida: **médio/alto**.

Razões:

- Deal já representa o caso jurídico, mas o pipeline ainda pode misturar estados comerciais, jurídicos e administrativos;
- etapas não necessariamente representam uma única progressão;
- operação pode interpretar stage como status global do caso.

### 6. Observabilidade de CRM

Nível de dívida: **médio**.

Razões:

- falhas HubSpot não possuem série histórica confiável;
- ajustes manuais não são quantificados;
- custo de inconsistência não é conhecido;
- ausência de métrica dificulta confirmar a prioridade por volume.

### 7. Consultation

Nível de dívida: **controlado**.

Razões:

- fonte de verdade e fronteiras foram definidas;
- riscos residuais estão documentados;
- domínio encontra-se em observação;
- nova expansão foi deliberadamente adiada.

Consultation não deve ser o foco do próximo ciclo sem gatilho operacional.

## 4. Foco da próxima evolução

O tema prioritário deve ser:

> **clareza de identidade e de papéis das pessoas em relação ao caso e ao canal de atendimento.**

O foco de negócio não é “criar uma entidade Person” nem “refatorar Contacts”. Essas seriam decisões posteriores.

O problema a resolver primeiro é semântico:

- saber quem está falando;
- saber quem será atendido;
- saber quem é cliente ou contratante;
- saber quem representa quem;
- saber quem pode receber informações;
- saber a quem pertencem relato, documento, consulta e histórico.

### Por que este tema vem antes dos demais

1. Pode provocar exposição indevida de informação jurídica.
2. Pode associar um caso à pessoa errada.
3. Afeta todos os canais e não apenas consultas.
4. Compromete a confiabilidade do HubSpot como CRM.
5. Torna Notes, documentos e histórico juridicamente ambíguos.
6. Aumenta o custo de atendimento de casos para terceiros.
7. Limita qualquer evolução futura de contratos, cobrança e relacionamento.

### Condição de prioridade

Essa prioridade deve ser confirmada por observação dos gatilhos já definidos:

- casos para terceiros;
- Contacts que exigem revisão;
- colisões nome × telefone;
- reutilização incorreta de Deal;
- informação enviada à pessoa errada;
- associação errada de consulta ou documento.

Se esses sinais não aparecerem em volume representativo, o tema continua conceitualmente importante, mas pode não justificar intervenção imediata.

## 5. Impacto esperado no negócio

### Redução de risco jurídico e de confidencialidade

Maior clareza sobre:

- titular da informação;
- destinatário autorizado;
- pessoa atendida;
- representante;
- autoria do relato.

Impacto esperado: menor probabilidade de exposição de dados, associação indevida e incidente LGPD.

### Melhoria da qualidade do CRM

Impacto esperado:

- menos Contacts ambíguos;
- menos colisões de nome e telefone;
- menos Deals associados à pessoa errada;
- histórico mais confiável;
- segmentação e relatórios mais úteis.

### Redução de retrabalho

Operadores deixam de precisar reconstruir manualmente:

- quem abriu o caso;
- para quem é o atendimento;
- qual telefone usar;
- qual Contact é correto;
- quem deve receber mensagem ou documento.

Impacto esperado: menor tempo de conferência e correção.

### Atendimento mais seguro para terceiros

Impacto esperado:

- menos recusas por “não reconheço este caso”;
- menor chance de comunicação para pessoa errada;
- continuidade mais clara entre iniciador e assistido;
- menor confusão em consultas e documentos.

### Histórico jurídico mais confiável

Impacto esperado:

- melhor atribuição de relatos;
- menor mistura entre casos;
- maior clareza de quem forneceu cada informação;
- maior valor probatório e administrativo do histórico.

### Base para crescimento

Enquanto identidade permanecer ambígua, crescimento aumenta o risco de colisão e retrabalho.

Impacto esperado ao resolver o tema:

- maior capacidade de operar múltiplos casos por pessoa;
- melhor suporte a representantes e familiares;
- melhor controle de contratação e cobrança;
- menor dependência de conhecimento informal da equipe.

## Avaliação final

### Maior gargalo

**Identidade e papéis em relação ao caso e ao canal.**

### Severidade

**Alta pelo impacto potencial.**

### Frequência comprovada

**Ainda não validada.**

### Prioridade recomendada

**Primeira entre as dívidas conceituais do CRM, condicionada à medição dos casos reais para terceiros e colisões de identidade.**

### Tema que não deve liderar o próximo ciclo

**Consultation.**

Consultation v9 está encerrado e deve permanecer em observação, salvo ocorrência dos gatilhos formais de reabertura.
