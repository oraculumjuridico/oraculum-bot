# Oráculum Bot — prontidão para produção assistida

Data da auditoria local: 2026-07-11
Base: `main`, commit `7a47b71 feat: consolidate client documents into organized PDFs`
Runtime local: Node.js 24.14.1, npm 11.11.0. O projeto declara Node 20/npm 10 para produção.

## 1. Resumo executivo

O código está próximo de um piloto assistido, mas o **go-live permanece reprovado até os gates externos**: configurar e validar segredos no Render, executar migração/restore Neon autorizados, validar schema HubSpot real, testar os dois números Meta, confirmar Drive privado e executar 1 caso fictício e 1–3 casos piloto supervisionados. Localmente, foram corrigidos shutdown concorrente, dry-run divergente, limite de mídia e preparação offline de casos/To Do.

Não foram usados casos reais nem serviços externos. Nenhuma migração, mensagem, deploy ou escrita em CRM/Drive foi executada.

## 2. Estado inicial e diferenças

- Branch: `main`.
- Commit: `7a47b71`.
- Remote: `origin` no repositório informado.
- Worktree inicial deste sprint já continha alterações deliberadas do graceful shutdown: `package.json`, `server.js` e dois arquivos novos.
- Versão HTTP exibida: `Oraculum v6.4`.
- Dependências de produção auditadas por `npm audit --omit=dev`: 0 vulnerabilidades conhecidas.
- Relatórios antigos sobre Drive público e webhook sem fila estão desatualizados: o código atual não chama `permissions.create`, e o webhook persiste/espelha a Durable Inbox antes do ACK.

## 3. Classificação

**GO-LIVE REPROVADO no estado atual do ambiente**, não por falha local conhecida de fluxo principal, mas porque os gates externos essenciais ainda não foram comprovados. Após os gates listados na seção 20, a classificação esperada é **APROVADO COM RESSALVAS** para poucos clientes, uma instância e supervisão humana.

## 4. Bloqueios corrigidos localmente

1. Shutdown: dois handlers concorrentes foram substituídos por fluxo único, idempotente, com persistência local, fechamento HTTP, flush/fim do pool e timeout.
2. Dry-run Neon: usa a mesma allowlist `configuredFiles()` da migração real.
3. Mídia: download Axios limitado por `WHATSAPP_MEDIA_MAX_BYTES` (20 MiB padrão), inclusive preflight por `file_size` quando disponível.
4. Casos: `dry-run` não consulta HubSpot por padrão; leitura remota exige `--allow-readonly-hubspot=true`.
5. Casos: relatório inclui `ready`, `blocked` e lote `pilotCandidates` sem PII.
6. To Do: importador local aceita JSON, CSV, texto e PDF textual; preserva original localmente e gera confiança/incertezas.

## 5. Bloqueios externos restantes

- Neon: migração real, restart e restore ainda não executados.
- Render: variáveis, health, memória e restart ainda não validados no serviço real.
- Meta: App Secret, token, webhook assinado e comportamento dos dois números precisam de teste no painel/ambiente real.
- HubSpot: nomes internos, enums, owner e pipeline devem ser confirmados no portal real, somente leitura primeiro.
- Drive: acesso autenticado e negação anônima devem ser comprovados em arquivo fictício.
- Calendar/Make: canário fictício de ciclo completo ainda não executado.
- Casos: lote piloto não foi auditado nem autorizado.
- Disparos: não existe ainda console operacional completo de campanha; qualquer envio deve permanecer desativado.

## 6. Graceful shutdown

- Um registro por sinal (`SIGTERM`, `SIGINT`).
- Chamadas duplicadas compartilham a mesma Promise.
- `persistirUsersAgora({ propagarErro: true })` e sessões são executadas antes do flush.
- `closeExternalStateRepository()` aguarda `flushExternalState({ throwOnError: false })` e fecha o pool.
- O listener HTTP é fechado para novas conexões.
- Timeout de 15 s evita espera infinita; logs usam apenas códigos técnicos.
- Risco residual: após timeout, uma indisponibilidade longa pode deixar espelhamento pendente; o processo termina deliberadamente.

## 7. Neon e persistência

| Item | Evidência local | Estado |
|---|---|---|
| Provider | `postgres`, `neon` ou URL configurada | aprovado localmente |
| Obrigatório em produção | `EXTERNAL_STATE_REQUIRED`, fallback fechado por padrão | aprovado localmente |
| Schema | duas tabelas isoladas no repository | aprovado em FakePool |
| Hidratação | checksum + escrita atômica | testado |
| Fila/flush | Promise serial e `pendingWrites` | testado |
| Migração repetida | migration ID e skip | testado |
| Dry-run fiel | mesma allowlist da migração | testado |
| Health | probe e tamanho do banco | testado em FakePool |
| Close | flush seguido de `pool.end()` | testado |
| Migração real | proibida neste sprint | bloqueador externo |
| Restore real | não executado | bloqueador externo |

Configuração Render esperada: `NODE_ENV=production`, `ORACULUM_DATA_DIR=/tmp/oraculum`, provider `neon`, SSL ativo, required ativo, fallback efêmero desativado, pool 2 e timeout 10 s. A URL deve existir apenas como secret.

## 8. Matriz HubSpot

| Dado | Objeto | Nome interno | Tipo/valor produzido | Origem | Risco/validação |
|---|---|---|---|---|---|
| Nome | Contact | `firstname` | texto | `montarPropsContatoHubSpot` | padrão; validar tamanho |
| Telefone | Contact | `phone` | E.164 normalizado | `hubspot-core` | chave de busca; validar duplicados |
| E-mail | Contact | `email`, `work_email` | e-mail | `hubspot-core` | confirmar necessidade de duplicação |
| Cidade/UF | Contact | `city`, `state` | texto | `hubspot-core` | padrão; `uf` custom não é enviado |
| Área | Contact | `area_juridica` | enum | `hubspot-contract` | custom; conferir enum real |
| Benefício | Contact | `beneficio`, `beneficio_de_interesse` | texto/enum | contrato documental | conferir propriedades reais |
| CPF | Contact | `cpf_do_cliente` | texto | contrato documental | sensível; confirmar base legal/permissão |
| Nascimento | Contact | `date_of_birth` | data | contrato documental | validar formato HubSpot |
| Caso | Contact | `numero_caso`, `numero_do_caso` | texto | contrato documental | confirmar qual campo será canônico |
| Título | Deal | `dealname` | título semântico | `hubspot-deal-title` | padrão; testado localmente |
| Pipeline | Deal | `pipeline` | `default` | criação | confirmar portal |
| Estágio | Deal | `dealstage` | IDs configurados | server/sync | confirmar IDs e labels reais |
| Owner | Deal | `hubspot_owner_id` | ID fixo | `hubspot-core` | confirmar usuário real |
| Relato | Deal | `description` | texto | estado do caso | padrão; limitar conteúdo sensível |
| Área/tipo | Deal | `area_juridica`, `tipo_de_caso` | enum | contrato | validar enums reais |
| Caso oficial | Deal | `numero_de_caso` | texto | estado/importador | chave de idempotência |
| Drive | Deal | `pasta_drive` | webViewLink privado | estado | link não implica acesso público |
| Temperatura | Deal | `temperatura_lead` | Frio/Morno/Quente | lead temperature | custom; validar enum |
| Prioridade | Deal | `hs_priority` | low/medium/high | derivado | padrão; validado localmente |
| Snapshot | Deal | `estado_bot_snapshot` | JSON | state-persistence | volume e dados sensíveis; revisar retenção |
| Origem | Deal | `origem_atendimento` | texto | captura | validar enums/workflows |

Operações localizadas: busca/criação/atualização de Contact e Deal, associação, Notes e leitura de associações. Há lock por Deal e snapshot para evitar PATCH redundante. Não há retry geral em `hubspot-core`; o importador de casos possui retry para 429/5xx. Validar 429/5xx em homologação antes de escala.

Fixtures locais do contrato cobrem variações; não foi consultado o portal. Antes de escrita real, executar somente leitura do schema e comparar `CONTACT_WRITE_PROPERTIES`, `DEAL_WRITE_PROPERTIES` e enums.

## 9. Casos

- `audit` e `review`: locais/offline.
- `dry-run`: offline por padrão; consulta HubSpot somente com flag explícita.
- `apply`/`resume`: exigem confirmação forte, automações confirmadas desativadas e token.
- Checkpoint por `importId`, `sourceHash`, Contact e Deal evita reaplicação.
- Relatório não expõe identificadores; mostra evidências booleanas, hashes, conflitos e bloqueios.
- Lote piloto: `--pilot-size=1..10` gera somente `importId/sourceHash` dos casos prontos.
- Não foi lida a pasta real de INSS neste sprint.

Sequência futura: fixture fictícia → audit/review → dry-run offline → leitura HubSpot autorizada → 1–3 pilotos → conferência manual → restante autorizado.

## 10. Importação To Do

`npm run cases:import-todo -- --input=<arquivo> --output=<diretório>` é exclusivamente local. Aceita JSON, CSV, TXT e PDF com camada textual. CSV serve para exportações de planilha. PDF escaneado sem texto deve ir para revisão/OCR existente; não foi adicionado OCR pesado. Saídas:

- `todo-cases-intermediate.json`: texto original, extrações e campos incertos;
- `todo-cases-report.json`: contagens, confiança e ausências, sem conteúdo original.

Não escreve em HubSpot/Drive e usa fixtures fictícias no teste.

## 11. WhatsApp Admin

Há autenticação por número + senha/hash, comparação segura, TTL de 30 minutos e bloqueio após três falhas. Menus admin possuem retorno ao menu em múltiplas telas. A máquina de estados do cliente reconhece menu, voltar, documentos, advogado e retomada em testes existentes.

Pendente antes de ampliar o piloto: teste conversacional consolidado para frases naturais “não quero responder”, “outras opções”, “pular”, “enviar depois”, “corrigi errado” em cada coletor. Não realizar grande reescrita agora; fallback humano deve permanecer visível.

## 12. Disparos controlados

Estado: **bloqueado para envio**. O código possui templates e reengajamento idempotente, mas não há uma interface completa de campanha manual com seleção, preview, consentimento, pausa/retomada/cancelamento e relatório. Para o piloto, mensagens devem ser disparadas somente caso a caso, após conferência humana, nunca para toda a base.

Chave futura: `cliente|caso|template|finalidade|campanha|período`. Preview deve omitir CPF, diagnóstico, benefício, banco, senha e links de documentos.

## 13. Segurança objetiva

| Área | Evidência | Estado/Risco |
|---|---|---|
| Meta webhook | HMAC SHA-256 do raw body, timing-safe, fail closed | aprovado localmente |
| Durable Inbox | gravação + flush antes do ACK, replay e receipts | aprovado localmente |
| Payload | `express.json` 1 MiB | aprovado |
| Rate limit | Meta 1000/min/IP; internas 180/min/IP | existe; alto para abuso distribuído |
| Rotas internas | segredo timing-safe | aprovado localmente |
| Áudios públicos | URL assinada, TTL e static restrito | aprovado localmente |
| Mídia Meta | limite 20 MiB antes/durante download | corrigido |
| OCR/PDF | bytes, arquivos, páginas, pixels/dimensões e timeout | aprovado localmente |
| Drive | sem `permissions.create`/`anyone`, originais preservados | aprovado por teste; validar real |
| HubSpot logs | sanitização de telefone/CPF/Bearer e nomes de propriedades | coberto |
| Logs gerais | alguns caminhos ainda registram `error.message/stack` | risco residual; auditar produção |
| Dependências | 0 high/critical/moderate/low em `npm audit --omit=dev` | aprovado em 2026-07-11 |
| Concorrência | locks por usuário/Deal, filas de persistência | aprovado localmente |

Antifraude mínimo para templates/telas: confirmar números oficiais; não pedir senha; não aceitar mudança inesperada de Pix; número processual não prova identidade; oferecer canal humano para contato suspeito.

## 14. Inventário Make

| Blueprint | Módulos | Classificação | Operações aproximadas |
|---|---:|---|---|
| Consulta — ciclo de vida e limpeza | 2 | útil/depende de Calendar; revisar router | watcher + rotas por evento |
| Consulta — planejamento | 5 | potencialmente indispensável se callbacks não forem locais | watcher + HTTP + delete + iterator + create por lembrete |
| Consulta — disparo recorrente | 6 | potencialmente indispensável | trigger + busca + iterator + HTTP + até 2 updates/job |
| Reengajamento — planejamento | 7 | útil depois; manter desligado no piloto inicial | trigger + 2 HTTP + 2 iterators + delete/create por job |
| Reengajamento — dispatcher | 6 | útil depois; manter desligado | trigger + busca + iterator + HTTP + updates |
| Reengajamento legacy 20260710 | 6 | legado/duplicado | não ativar |

Nenhum blueprint foi importado ou ativado. Não é possível inferir com segurança a distribuição atual nas três contas. Não criar quarta conta. Conferir no painel frequência e operações reais; iniciar apenas consulta essencial e deixar reengajamento desligado (`AUTO_REENGAJAMENTO=false`).

## 15. Render

- Start: `node server.js` via `npm start`.
- Porta: `PORT`, padrão 10000; Express escuta todas as interfaces.
- Health público consulta persistência externa e devolve 503 se required e banco não estiver `ok`.
- Health interno protegido inclui RAM, erros, arquivos e persistência.
- Shutdown fecha HTTP e PostgreSQL.
- Cache local: `/tmp/oraculum`; fonte persistente: Neon.
- Plano gratuito: uma instância, OCR limitado e sem processamento em massa.

Checklist: commit/testes → variáveis → deploy → `/health` → `/health-interno` → fixture fictícia → restart → confirmar `restoredFiles`/Inbox → rollback documentado. Não foi feito deploy.

## 16. Meta e dois números

Para cada número: confirmar WABA, Phone Number ID, token, webhook, assinatura, templates, qualidade, função (principal/contingência), SMS/ligação, atendimento humano e aviso antifraude. No número previamente usado no app, verificar no painel oficial a elegibilidade de coexistência Business App/Cloud API. Não desregistrar, excluir ou recadastrar nada durante a verificação.

## 17. Capacidade gratuita

Não há fonte local suficiente para afirmar cotas atuais de Meta, Make, Groq, AssemblyAI, Drive, Calendar ou HubSpot; conferir painéis.

| Serviço | Função | 10/dia | 30/dia | 100/dia | Controle/fallback |
|---|---|---|---|---|---|
| Render | runtime | provável piloto | monitorar | risco CPU/RAM/sleep | uma instância, limites OCR, fila |
| Neon | estado | baixo volume | monitorar bytes/writes | conferir painel | documentos compactos, health, backup |
| HubSpot | CRM | conferir API | conferir | risco 429 | snapshot, locks, retry futuro |
| Make | lembretes | conferir operações | conferir | risco alto se muitos módulos | reduzir cenários/frequência |
| Meta | mensagens | conferir painel | conferir | conferir | Durable Inbox e envio manual |
| Drive | documentos | conferir storage/API | conferir | risco volume | limites e consolidação |
| Calendar | agenda | baixo | monitorar | conferir | idempotência e reconciliação |
| Groq | IA | conferir painel | conferir | risco cota | fallback determinístico |
| AssemblyAI | áudio | conferir minutos | conferir | risco alto | limitar áudio e fallback texto |
| TTS | voz | conferir | conferir | risco | texto sempre disponível |
| OCR/PDF | CPU local | controlado | monitorar | risco Render | pixels/páginas/timeout |

Hipótese: um atendimento pode ter várias mensagens, 0–N documentos e 0–N áudios; sem telemetria real não há consumo médio confiável. Coletar métricas no piloto antes de projetar 100/dia.

## 18. Backup, restore e rollback

Backup: health com `pendingWrites=0`, exportação lógica das duas tabelas, criptografia e SHA-256 fora de Render/Neon. Restore: parar tráfego, restaurar em banco/branch temporário, validar checksums, iniciar uma instância, confirmar hidratação/Inbox e liberar somente após fixture.

Rollback: registrar commit implantado; manter release anterior; parar entrada; preservar banco; implantar commit anterior compatível; health; restart/restore; fixture; reconciliar efeitos externos antes de reabrir.

## 19. Backlog pós-go-live

- OCR/CamScanner avançado/OpenCV;
- TTS neural e vozes;
- Oracle/repository adapter;
- scheduler distribuído;
- circuit breaker/retry geral HubSpot;
- painel completo de campanhas controladas;
- telemetria/cotas/alertas externos;
- auditoria ampla de logs gerais;
- refatoração de `server.js` e branches legacy;
- site, redes sociais, marketing e dashboards.

## 20. Gates exatos para produção assistida

1. Worktree deliberado convertido em release reproduzível após revisão humana.
2. Suíte completa verde no commit candidato.
3. Variáveis obrigatórias presentes sem exibir valores.
4. Migração Neon autorizada, health `ok`, restart e restore ensaiado.
5. Schema HubSpot real validado somente leitura; fixture controlada depois de autorização.
6. Drive fictício privado validado autenticado/anônimo.
7. Meta: assinaturas válida/inválida e ambos os números testados.
8. Make: somente cenários indispensáveis, segredo interno e operações conferidas.
9. 1 caso fictício completo; depois 1–3 casos piloto autorizados.
10. Responsável humano, antifraude, monitoramento e rollback prontos.

## 21. Próximos comandos

### Grupo A — seguros e somente leitura

```powershell
git status --short
git diff --check
git diff --stat
npm audit --omit=dev
node scripts/migrate-state-to-postgres.js --dry-run
node scripts/import-real-cases.js audit --root=<PASTA_FICTICIA>
node scripts/import-real-cases.js dry-run --root=<PASTA_FICTICIA> --pilot-size=1
```

### Grupo B — testes locais

```powershell
npm test
node test/graceful-shutdown.test.js
node test/external-state-repository.test.js
node test/migrate-state-dry-run.test.js
node test/webhook-durability.test.js
node test/hubspot-contract.test.js
node test/import-real-cases.test.js
npm run cases:import-todo -- --input=<FIXTURE> --output=<TEMP>
```

### Grupo C — escrita real que exige autorização (não executar agora)

```powershell
npm run state:migrate:postgres
node <futuro-smoke-hubspot-ficticio-com-confirmacao>
npm run cases:apply -- --root=<LOTE_PILOTO> --confirm-live-import=I_UNDERSTAND_THIS_WRITES_TO_HUBSPOT
npm run cases:resume -- --root=<LOTE_AUTORIZADO> --confirm-live-import=I_UNDERSTAND_THIS_WRITES_TO_HUBSPOT
# Importar/ativar cenário Make no painel
# Alterar variáveis/deploy no Render
# Disparar template Meta somente para lista autorizada
```

### Grupo D — deploy (não executar agora)

```powershell
git add <ARQUIVOS_EXPLICITAMENTE_REVISADOS>
git commit -m "chore: prepare assisted production rollout"
git push origin main
# Deploy do commit no Render
# GET /health e /health-interno
# Restart controlado e validação de restore
# Rollback para o commit anterior se qualquer gate falhar
```
