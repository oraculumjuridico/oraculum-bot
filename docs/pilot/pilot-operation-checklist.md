# Bot Oráculum — Checklist Operacional do Piloto

Data-base: 2026-07-03
Escopo: piloto controlado com poucos clientes reais e supervisão humana diária.

## 1. Condição de entrada no piloto

O piloto somente pode começar quando todos os itens abaixo estiverem comprovados:

- [ ] Commit aprovado implantado e registrado no diário do piloto.
- [ ] CI do commit implantado está verde.
- [ ] `npm test`, `consultation:release-check` e auditoria arquitetural aprovados.
- [ ] Serviço Render saudável e sem reinícios recorrentes.
- [ ] Uma única instância gravadora está ativa.
- [ ] Neon Free configurado; cache efêmero em `/tmp/oraculum`; health PostgreSQL `ok`.
- [ ] Restart controlado preservou os arquivos de `data/`.
- [ ] Snapshot diário do Render está ativo.
- [ ] Último restore testado possui data, responsável e resultado registrados.
- [ ] Backup adicional foi feito antes da abertura do piloto.
- [ ] Meta webhook, assinatura e template de terceiro foram testados.
- [ ] HubSpot, Drive, Calendar e Make.com foram testados com um caso controlado.
- [ ] Escritório definiu responsável operacional e substituto.
- [ ] Volume inicial está limitado a poucos clientes acompanháveis manualmente.

Não iniciar se algum segredo obrigatório estiver ausente, se o disco não estiver
montado ou se não houver responsável disponível para acompanhar os primeiros
atendimentos.

## 2. Configurações obrigatórias

### Meta / WhatsApp

- [ ] `VERIFY_TOKEN`
- [ ] `WHATSAPP_TOKEN`
- [ ] `PHONE_NUMBER_ID`
- [ ] `APP_SECRET` ou `META_APP_SECRET`
- [ ] `WHATSAPP_ADMIN`
- [ ] `WHATSAPP_TEMPLATE_TERCEIRO`
- [ ] `WHATSAPP_TEMPLATE_LANG=pt_BR`
- [ ] `WHATSAPP_TEMPLATE_TERCEIRO_IMAGEM_URL`, se o template aprovado tiver imagem
- [ ] Webhook de produção aponta para `POST /webhook`.
- [ ] Assinatura válida é aceita e assinatura inválida retorna 401.
- [ ] Ausência de App Secret retorna 503.
- [ ] Template de terceiro consta como aprovado no Meta Business Manager.

Não registrar valores de segredos neste documento ou no diário do piloto.

### HubSpot

- [ ] `HUBSPOT_TOKEN`
- [ ] `HUBSPOT_PORTAL`
- [ ] Pipeline e stages usados pelo Bot existem no portal de produção.
- [ ] Propriedades exigidas pelo contrato do projeto existem.
- [ ] Owner configurado no runtime pertence ao ambiente de produção.
- [ ] Contato, negócio, associação e notas foram validados com caso controlado.
- [ ] Nenhuma automação do HubSpot cria evento Calendar concorrente com o Bot.

### Google

- [ ] `GOOGLE_CLIENT_ID`
- [ ] `GOOGLE_CLIENT_SECRET`
- [ ] `GOOGLE_REFRESH_TOKEN`
- [ ] `DRIVE_PASTA_CLIENTES_ID`
- [ ] `GOOGLE_MAPS_API_KEY`
- [ ] Conta autorizada possui acesso ao Calendar operacional.
- [ ] Pasta raiz do Drive pertence ao escritório e não possui permissão `anyone`.
- [ ] Upload retorna ID e `webViewLink` sem tornar o arquivo público.
- [ ] Calendar usado em produção é `oraculum.juridico@gmail.com`.

### Render e persistência

- [ ] `NODE_ENV=production`
- [ ] Node.js 20 e npm 10.
- [ ] `INTERNAL_WEBHOOK_SECRET`
- [ ] `PUBLIC_BASE_URL` e `APP_URL`
- [ ] `AUTO_REENGAJAMENTO=false` durante o piloto inicial.
- [ ] Timeouts HTTP, FFMPEG e demais limites estão configurados.
- [ ] Migração PostgreSQL e recuperação após restart validadas.
- [ ] Apenas uma instância.
- [ ] Snapshot diário disponível no Dashboard.
- [ ] Espaço livre do disco monitorado.

Arquivos persistentes mínimos:

- `data/webhook-inbox.json`
- `data/users-state.json`
- `data/consulta-events.jsonl`
- `data/consultation-decisions.jsonl`
- `data/consultation-integrity-events.jsonl`

### IA, transcrição e comunicação interna

- [ ] `ASSEMBLYAI_KEY`
- [ ] `GROQ_KEY`
- [ ] Credenciais de e-mail, se notificações por e-mail fizerem parte do piloto.
- [ ] Um áudio real curto foi transcrito e classificado antes da abertura.
- [ ] Falha de IA/transcrição foi simulada e o fallback foi compreendido pela equipe.

### Make.com

- [ ] Cenário publicado corresponde ao ambiente de produção.
- [ ] Chamadas internas usam `INTERNAL_WEBHOOK_SECRET`.
- [ ] `eventId` do Google Calendar é enviado sempre que disponível.
- [ ] Busca por `datetime` é usada apenas para eventos legados.
- [ ] Make.com não cria ou cancela eventos em paralelo ao Bot.
- [ ] O cenário ignora atualizações produzidas por ele próprio.
- [ ] Retries do Make.com não produzem notificações duplicadas.

## 3. Checklist antes de abrir o atendimento no dia

- [ ] Confirmar commit implantado no Render.
- [ ] Confirmar CI verde para esse commit.
- [ ] Acessar `GET /health` e exigir HTTP 200 com `status: "ok"`.
- [ ] Acessar `GET /health-interno` com:

```text
Authorization: Bearer <INTERNAL_WEBHOOK_SECRET>
```

- [ ] Registrar uptime, `erros_count`, RAM, conversas, cadastros e ativos.
- [ ] Consultar `GET /resumo-diario?format=text` com o mesmo segredo.
- [ ] Verificar logs desde o último fechamento.
- [ ] Confirmar ausência de loop de restart.
- [ ] Confirmar disco montado e espaço livre.
- [ ] Confirmar idade e status do último snapshot.
- [ ] Validar integridade dos JSON/JSONL ou executar verificação do último backup.
- [ ] Conferir se a Durable Inbox não possui registros presos.
- [ ] Conferir falhas recentes de Meta, HubSpot, Drive, Calendar, IA e transcrição.
- [ ] Conferir casos abertos no dia anterior e suas pendências.
- [ ] Confirmar disponibilidade do responsável humano.

## 4. Checklist durante o dia

Para cada caso concluído:

- [ ] Cliente recebeu um número de caso.
- [ ] `users-state.json` contém o mesmo `numeroCaso`.
- [ ] Estado local contém `contatoId`, `negocioId` e `pastaDriveId`.
- [ ] HubSpot possui o contato correto.
- [ ] HubSpot possui um único negócio correspondente.
- [ ] Contato e negócio estão associados.
- [ ] Negócio contém número do caso, área, cidade, relato, pasta Drive e stage esperado.
- [ ] Pasta Drive possui exatamente o número e nome do caso.
- [ ] Pasta e arquivos não têm permissão pública `anyone`.
- [ ] Se houve agendamento, existe um único evento ativo para o negócio.
- [ ] Evento Calendar contém `dealId`, `contactId` e chave idempotente.
- [ ] Se o caso é de terceiro, a pessoa atendida recebeu e reconheceu a notificação.

Para cada falha relatada pelo cliente:

- [ ] Registrar horário, telefone mascarado, número do caso e stage.
- [ ] Registrar ID da mensagem Meta, se disponível.
- [ ] Registrar integração e operação que falhou.
- [ ] Não pedir ao cliente que repita imediatamente até verificar efeitos parciais.

## 5. Como confirmar que o caso foi criado corretamente

Um cadastro somente é considerado concluído quando todos os itens obrigatórios
existem:

1. número do caso persistido;
2. pasta do caso no Google Drive;
3. contato no HubSpot;
4. negócio no HubSpot;
5. associação contato–negócio;
6. número do caso e stage gravados no negócio;
7. snapshot do estado gravado no negócio.

Notas e cópias de áudio são complementares: falhas nelas devem ser investigadas,
mas não tornam inexistente um caso que possui todos os itens acima.

Não usar apenas a mensagem recebida pelo cliente como prova. Conferir sempre o
HubSpot e o Drive durante o piloto.

## 6. Como identificar falhas de integração

### WhatsApp / Meta

Sinais:

- HTTP 401 ou 503 no webhook;
- erro `whatsapp` ou `template`;
- cliente não recebe resposta;
- mesmo `message.id` processado mais de uma vez.

Verificar App Secret, token, Phone Number ID, template aprovado e Durable Inbox.

### Durable Inbox

Estados esperados:

- `pending`: aguardando processamento;
- `processing`: em execução;
- `error`: falhou e deve ser retomado;
- `completed`: recibo sem payload.

É incidente quando um registro permanece em `processing` após restart, aumenta
repetidamente em `error`, perde payload antes de concluir ou gera duas respostas
para o mesmo `message.id`.

### HubSpot

Sinais:

- `numeroCaso` local sem `contatoId` ou `negocioId`;
- contato sem negócio associado;
- dois negócios para o mesmo número de caso;
- stage ou snapshot divergente;
- erros `FINALIZATION_INTEGRATION_FAILURE` com operação `hubspot_*`.

### Google Drive

Sinais:

- `numeroCaso` sem `pastaDriveId`;
- mais de uma pasta com o mesmo número e nome;
- upload sem ID;
- arquivo fora da pasta do caso;
- permissão `anyone`;
- erro `drive_folder`.

### Google Calendar / Make.com

Sinais:

- dois eventos ativos para o mesmo `dealId`;
- callback sem `eventId`;
- evento sem metadados do negócio;
- cancelamento refletido no Calendar, mas não no Bot;
- repetição contínua do mesmo cenário Make.com.

## 7. Procedimento para falha parcial

1. Não confirmar sucesso manualmente ao cliente.
2. Registrar o incidente e preservar os IDs já criados.
3. Consultar HubSpot e Drive antes de repetir a confirmação.
4. Não apagar pasta, contato, negócio ou recibo da Inbox.
5. Se o Bot mostrou a tela de retry, permitir uma única nova confirmação
   supervisionada: o fluxo reutiliza número, pasta e IDs persistidos.
6. Após o retry, verificar novamente todos os itens obrigatórios.
7. Se houver duplicação, suspender novas entradas e reconciliar manualmente.
8. Se o processo ou disco estiver instável, fechar tráfego antes de qualquer
   restore.

Antes de intervenção em storage:

```bash
npm run storage:backup -- --source /opt/render/project/src/data
npm run storage:verify -- --snapshot /caminho/do/snapshot
```

Restore deve seguir integralmente
`docs/operations/storage-backup-restore.md`, com aplicação parada e diretório de
destino vazio.

## 8. Checklist de fechamento diário

- [ ] Total de conversas iniciadas.
- [ ] Total de cadastros iniciados e concluídos.
- [ ] Total de abandonos e retomadas.
- [ ] Casos concluídos conferidos em HubSpot e Drive.
- [ ] Casos de terceiro notificados e reconhecidos.
- [ ] Agendamentos criados, reagendados e cancelados.
- [ ] Mensagens pendentes, em processamento e com erro na Inbox.
- [ ] Erros por integração e tempo de recuperação.
- [ ] Duplicações ou divergências encontradas.
- [ ] Intervenções manuais realizadas.
- [ ] Reclamações ou confusões de UX.
- [ ] Incidentes de segurança ou privacidade.
- [ ] Commit efetivamente implantado.
- [ ] Uptime, reinícios, RAM e espaço livre final.
- [ ] Horário e status do último snapshot/backup.
- [ ] Pendências e responsável pelo dia seguinte.

O registro diário não deve conter tokens, relatos jurídicos completos ou dados
pessoais desnecessários. Telefones devem ser mascarados.

## 9. Métricas mínimas

| Métrica | Objetivo inicial |
|---|---|
| Mensagens recebidas versus concluídas na Inbox | 100% com recibo ou incidente explicado |
| Casos informados como concluídos versus casos íntegros | 100% |
| Casos com contato, negócio, associação e pasta | 100% |
| Duplicação de negócio, pasta, evento ou mensagem | 0 |
| Webhooks rejeitados por assinatura inválida | monitorar; investigar picos |
| Falhas de integração | registrar por sistema e operação |
| Tempo de recuperação de incidente | medir; nenhum incidente deve ficar sem owner |
| Abandono por etapa | medir nome, relato, telefone, cidade e confirmação |
| Retomadas bem-sucedidas | medir quantidade e percentual |
| Agendamentos divergentes Calendar/Bot | 0 |
| Arquivos públicos no Drive | 0 |
| Registros Inbox presos após restart | 0 |

## 10. Critérios para interromper imediatamente

Suspender novas entradas e manter apenas atendimento humano quando ocorrer:

- perda ou corrupção de `data/`;
- PostgreSQL externo indisponível, fila remota pendente ou mais de uma instância gravadora;
- mensagem reconhecida pelo Meta sem persistência na Durable Inbox;
- duplicação de mensagens para clientes;
- caso informado como concluído sem HubSpot ou Drive íntegros;
- duplicação recorrente de negócio, pasta ou evento;
- arquivo do cliente com acesso público;
- associação de dados/documentos ao cliente ou caso errado;
- loop Make.com/Calendar;
- webhook aceitando assinatura inválida;
- vazamento de segredo ou dado pessoal;
- falha generalizada de HubSpot, Drive, Calendar ou WhatsApp sem fallback humano;
- restore necessário sem backup verificável.

Também interromper se dois incidentes graves iguais ocorrerem, mesmo que tenham
sido corrigidos manualmente.

## 11. Critérios de sucesso e encerramento do piloto

O piloto pode ser encerrado como bem-sucedido quando:

- todos os clientes previstos foram acompanhados;
- 100% dos casos anunciados como criados foram conferidos;
- não houve perda, troca ou exposição de dados;
- não houve duplicação não resolvida;
- Durable Inbox terminou sem registros presos;
- HubSpot, Drive e Calendar estão coerentes;
- abandonos e falhas possuem explicação;
- incidentes foram resolvidos e documentados;
- equipe jurídica confirmou que recebeu informação suficiente;
- equipe operacional consegue executar backup, restore e reconciliação;
- existe decisão registrada sobre ampliar, corrigir ou encerrar o uso.

## Respostas executivas

### A) O sistema está apto para um piloto supervisionado?

Sim, condicionado ao cumprimento integral dos pré-requisitos e à conferência
manual de cada caso concluído.

### B) Quais verificações devem ser feitas diariamente?

Saúde do serviço, commit/CI, erros, Durable Inbox, integridade dos casos em
HubSpot e Drive, eventos Calendar, execuções Make.com, storage, snapshots,
abandonos, retomadas e intervenções manuais.

### C) Quais incidentes exigem parar imediatamente?

Perda/corrupção de storage, falso sucesso, duplicação, associação ao cliente
errado, exposição pública de arquivo, perda/duplicação de webhook, falha de
assinatura, loop de automação ou indisponibilidade generalizada sem atendimento
humano.

### D) O que deve ser registrado ao final de cada dia?

Volumes, conversões, abandonos, retomadas, integridade dos casos, situação da
Inbox, agendamentos, erros por integração, duplicações, incidentes, ações
manuais, métricas do runtime, backup/snapshot, commit implantado e pendências com
responsável.
