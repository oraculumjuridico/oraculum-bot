# Auditoria de reprodutibilidade da release

Data: 02/07/2026
Branch local: `main`
HEAD local: `ba75eb227e2531ec996b55f2cccda2b5c054a126`
Natureza: auditoria técnica somente leitura

## Resumo executivo

A release atualmente executada e testada no workspace **não é reproduzível a
partir do Git**.

Existem três estados diferentes:

1. `origin/main`, 59 commits atrás;
2. `HEAD` local, contendo os hardenings recentes;
3. workspace local, contendo mais 9 alterações rastreadas e 120 arquivos não
   rastreados.

O workspace local depende de módulos de consulta e identidade CRM ainda não
versionados. O `package.json` local executa testes e scripts também não
versionados. O workflow de CI está presente apenas como arquivo não rastreado.

Uma máquina nova consegue reconstruir o `HEAD` local com `npm ci` em termos de
dependências JavaScript, mas não consegue reconstruir o sistema que está
rodando e passando na suíte ampla do workspace.

## 1. Estados de release existentes

### 1.1 Remoto

`origin/main`:

```text
e174decdb5c689e0ca6d663e63d18ceec24f5d2f
fix: hardening + correções finais
2026-04-19
```

O branch local está:

```text
59 commits à frente
0 commits atrás
```

Portanto, os hardenings recentes não estão disponíveis para qualquer deploy
que consuma diretamente `origin/main`.

### 1.2 HEAD local

```text
ba75eb227e2531ec996b55f2cccda2b5c054a126
security: fail closed without Meta app secret
```

Esse commit contém:

- uploads privados no Drive;
- Durable Inbox;
- fail-closed do webhook Meta;
- handlers híbridos recentes.

### 1.3 Workspace

O workspace acrescenta mudanças não commitadas sobre o HEAD:

```text
9 arquivos rastreados alterados
120 arquivos não rastreados
913 inserções e 307 remoções nos arquivos rastreados
```

Além disso, aproximadamente 7.016 linhas de código/teste/CI operacional estão
em 69 arquivos não rastreados sob:

- `.github`;
- `scripts`;
- `src`;
- `test`.

## 2. Estado atual do worktree

### Arquivos rastreados modificados

| Arquivo | Situação | Impacto |
|---|---|---|
| `.gitignore.js` | Removido | Arquivo binário rastreado; intenção da remoção não está documentada |
| `package.json` | Modificado | Muda suíte, scripts de auditoria, migração e release |
| `server.js` | Modificado | 429 adições/232 remoções; altera runtime de consulta, locks e integrações |
| `src/domain/calendar-scheduling.js` | Modificado | 378 adições/46 remoções; mudança estrutural em agendamento |
| `src/domain/cliente-status-ui.js` | Modificado | Ajustes no estado de consulta |
| `src/domain/hubspot-core.js` | Modificado | Ajuste de contrato/escrita |
| `src/domain/hubspot-sync.js` | Modificado | 49 adições/10 remoções; sincronização |
| `src/domain/state-persistence.js` | Modificado | Estado de consulta e temporização |
| `tts.js` | Modificado | Timeouts, limpeza e geração de áudio |

### Observação

Essas alterações coexistem com commits de hardening seletivos. O conteúdo
local de `server.js` e `state-persistence.js` não é igual ao conteúdo do HEAD,
embora os hardenings estejam commitados.

## 3. Arquivos não rastreados

Distribuição:

| Grupo | Quantidade |
|---|---:|
| Raiz | 46 |
| `src/` | 36 |
| `test/` | 28 |
| `scripts/` | 7 |
| `.github/` | 2 |
| `docs/` | 1 |
| Total | 120 |

### 3.1 Runtime de consulta

Não rastreados:

- `src/domain/consultation-events.js`;
- `src/domain/consultation-guards.js`;
- `src/domain/consultation-metrics.js`;
- `src/domain/consultation-read-model.js`;
- árvore `src/domain/consultation/`.

O `server.js` local importa `src/domain/consultation`. Uma cópia limpa não
possui esse diretório.

### 3.2 Identidade CRM

Não rastreada:

- árvore `src/domain/crm-identity/`.

Ela contém resolução de partes do caso, papéis, rastreio de decisão e
estabilidade.

### 3.3 Scripts operacionais

Não rastreados:

- auditoria de consulta;
- baseline operacional;
- métricas de integridade;
- análise de identidade;
- migração Calendar;
- reconciliação.

O `package.json` local aponta diretamente para esses scripts.

### 3.4 Scripts de release

Não rastreados:

- `src/scripts/consultation-architecture-audit.js`;
- `src/scripts/consultation-release-check.js`;
- exporters legais.

Sem eles:

- `npm run audit:consulta:architecture` falha;
- `npm run consultation:release-check` falha;
- o workflow proposto falha.

### 3.5 Testes

Há 28 testes não rastreados de:

- consultas;
- replay;
- idempotência;
- arquitetura;
- integridade;
- recuperação;
- identidade CRM.

O `npm test` local referencia esses arquivos. Num clone limpo do HEAD, o
`package.json` antigo executa apenas `hubspot-contract.test.js`.

Logo, o resultado “npm test passou” do workspace não é reproduzível no HEAD.

### 3.6 CI

Não rastreados:

- `.github/workflows/consultation-architecture.yml`;
- `.github/copilot-instructions.md`.

O workflow usa:

- Ubuntu;
- Node 20;
- `npm ci`;
- auditoria arquitetural;
- release check;
- `npm test`.

Como não está versionado, o GitHub não o executa.

### 3.7 Baselines e manifestos

Não rastreados na raiz:

- `consultation-architecture-baseline.json`;
- `consultation-architecture-snapshot.json`;
- relatórios e baselines operacionais.

Dentro do domínio há também
`src/domain/consultation/consultation-manifest.json`.

É necessário decidir quais são:

- entrada obrigatória do release;
- saída gerada;
- evidência auditável;
- artefato local descartável.

Adicionar tudo indiscriminadamente ao Git pode versionar resultados locais ou
dados operacionais.

## 4. Dependências locais não versionadas

### 4.1 Node.js

Ambiente local:

```text
Node v24.14.1
npm 11.11.0
```

Workflow não rastreado:

```text
Node 20
```

Ausentes:

- `engines.node` no `package.json`;
- `.nvmrc`;
- `.node-version`;
- campo `packageManager`.

Uma máquina nova pode instalar uma versão diferente e obter comportamento
distinto.

### 4.2 Dependências npm

Pontos positivos:

- `package-lock.json` existe;
- é rastreado;
- lockfile v3;
- dependências raiz correspondem ao `package.json`;
- todas as seis dependências diretas aparecem no lock.

Dependências:

- `axios`;
- `dotenv`;
- `express`;
- `googleapis`;
- `node-fetch`;
- `nodemailer`.

O lock permite `npm ci`, desde que a versão de Node seja compatível.

### 4.3 FFmpeg

`tts.js` executa:

```text
ffmpeg
```

via `execFileSync`.

FFmpeg:

- não é pacote npm;
- não é instalado por script;
- não possui versão fixada;
- não é documentado;
- não há Dockerfile.

Uma máquina sem FFmpeg perde áudio TTS.

### 4.4 Filesystem

O sistema depende de diretórios graváveis:

- `data/`;
- `audios/atendentes/`;
- diretório temporário do sistema.

Durable Inbox exige:

- volume persistente;
- permissão de escrita;
- rename atômico;
- `fsync`;
- operação com uma única instância.

Nada disso está descrito em manifesto de deploy.

### 4.5 Módulos locais

O HEAD rastreado foi analisado:

```text
109 arquivos rastreados
0 requires relativos ausentes
```

Portanto, o HEAD possui fechamento interno de imports.

O workspace local, contudo, depende dos módulos não rastreados de consulta e
CRM descritos acima.

## 5. Variáveis obrigatórias de ambiente

Não existe `.env.example`.

### 5.1 Obrigatórias para o núcleo

| Variável | Finalidade | Ambiente local auditado |
|---|---|---|
| `NODE_ENV` | Segurança e enforcement | Ausente |
| `APP_SECRET` ou `META_APP_SECRET` | Assinatura Meta | Ausente |
| `VERIFY_TOKEN` | Handshake webhook | Configurada |
| `WHATSAPP_TOKEN` | Graph API | Configurada |
| `PHONE_NUMBER_ID` | Graph API | Configurada |
| `HUBSPOT_TOKEN` | CRM | Configurada |
| `GOOGLE_CLIENT_ID` | OAuth | Configurada |
| `GOOGLE_CLIENT_SECRET` | OAuth | Configurada |
| `GOOGLE_REFRESH_TOKEN` | OAuth | Configurada |
| `DRIVE_PASTA_CLIENTES_ID` | Pasta raiz | Configurada |
| `ASSEMBLYAI_KEY` | Transcrição | Configurada |
| `GROQ_KEY` | IA | Configurada |
| `INTERNAL_WEBHOOK_SECRET` | Rotas internas | Configurada |
| `ADMIN_WHATSAPP_PASSWORD_HASH` | Administração | Configurada |

O fail-closed já implementado faz o webhook retornar 503 enquanto App Secret
estiver ausente.

### 5.2 URL pública

O código aceita:

1. `PUBLIC_BASE_URL`;
2. `APP_URL`;
3. `RENDER_EXTERNAL_URL`;
4. `NGROK_URL`.

No ambiente local, `NGROK_URL` está configurado. Isso não documenta qual URL
deve existir em produção.

### 5.3 Notificação

- `GMAIL_USER`;
- `GMAIL_PASS`;
- `WHATSAPP_ADMIN`;
- templates WhatsApp.

### 5.4 Opcionais com impacto funcional

- `GOOGLE_MAPS_API_KEY`;
- imagens de telas/documentos;
- `AUTO_REENGAJAMENTO`;
- timeouts;
- flags de consulta;
- paths de eventos;
- flags de enforcement/firewall;
- logs debug.

Não há matriz documentando:

- obrigatória;
- opcional;
- default;
- formato;
- ambiente;
- responsável;
- rotação.

## 6. Passo a passo atual de deploy

Não foram encontrados:

- README;
- runbook de deploy;
- Dockerfile;
- Procfile;
- `render.yaml`;
- manifesto de infraestrutura;
- versão de Node;
- exemplo de ambiente.

O único caminho inferível é:

```text
git clone/pull
-> instalar Node
-> npm ci
-> instalar FFmpeg
-> configurar variáveis
-> configurar volume persistente
-> npm start
-> configurar webhook Meta
-> configurar callbacks internos
```

Esse passo a passo é inferido do código, não documentado pelo projeto.

### CI pretendida

O workflow local não rastreado sugere:

```text
checkout
-> Node 20
-> npm ci
-> auditoria de arquitetura
-> release check
-> npm test
```

Como o workflow e os scripts não estão no Git, esse pipeline não existe para o
repositório remoto.

## 7. Possibilidade de reconstrução limpa

### 7.1 Reconstruir o HEAD local

Parcialmente possível:

- package lock está íntegro;
- requires relativos do HEAD estão completos;
- `npm ci` é possível;
- `node server.js` é o entrypoint.

Ainda faltam:

- versão de Node;
- FFmpeg;
- ambiente;
- volume;
- runbook;
- infraestrutura externa.

### 7.2 Reconstruir o workspace validado

Não é possível a partir do Git:

- módulos runtime estão não rastreados;
- scripts de package estão não rastreados;
- testes estão não rastreados;
- CI está não rastreada;
- nove arquivos têm conteúdo apenas local.

### 7.3 Reconstruir a partir do remoto

Não reproduz nem o HEAD nem o workspace:

- `origin/main` está 59 commits atrás;
- os hardenings recentes não estão publicados;
- o diff histórico inclui grande remoção de `node_modules` e dados antes
  rastreados, exigindo revisão cuidadosa antes do push.

## 8. Dependências externas não documentadas

### Serviços

- Meta WhatsApp Graph API v19;
- HubSpot CRM;
- Google Drive;
- Google Calendar;
- Google Maps Geocoding;
- AssemblyAI;
- Groq;
- Gmail SMTP;
- endpoint não oficial do Google Translate TTS;
- Anthropic API em uma função sem autenticação explícita.

### Recursos externos

- calendário fixo `oraculum.juridico@gmail.com`;
- pasta raiz Drive;
- templates WhatsApp aprovados;
- URLs de imagens;
- callbacks de cancelamento, pós-consulta, status e lembretes;
- domínio público HTTPS;
- credenciais OAuth com scopes adequados.

### Plataforma

- single instance;
- volume persistente;
- timezone `America/Sao_Paulo`;
- acesso de saída à internet;
- FFmpeg no PATH;
- memória e disco suficientes para mídia.

Nenhuma dessas dependências possui runbook consolidado no Git.

## 9. Diferenças entre local e produção

| Dimensão | Local | Produção conhecida/documentada |
|---|---|---|
| Sistema operacional | Windows | Não documentado; workflow usa Ubuntu |
| Node | 24.14.1 | Não fixado; workflow pretendido usa 20 |
| npm | 11.11.0 | Não fixado |
| URL pública | Ngrok | Não documentada |
| App Secret Meta | Ausente | Precisa ser configurado |
| `NODE_ENV` | Ausente | Precisa ser `production` |
| Filesystem | Disco local | Persistência não comprovada |
| Instâncias | Uma execução local | Não documentado |
| FFmpeg | Disponível localmente | Não garantido |
| CI | Arquivos locais | Não versionada |
| Estado | Dados locais existentes | Migração/backup não documentados |

## 10. Riscos numa nova máquina

1. Instalar Node incompatível.
2. Não ter FFmpeg.
3. Não possuir `.env`.
4. Webhook retornar 503 por falta do App Secret.
5. Não conseguir enviar WhatsApp por token/Phone ID.
6. Não acessar HubSpot, Drive ou Calendar.
7. Durable Inbox gravar em disco efêmero.
8. URLs de áudio apontarem para host incorreto.
9. Scripts do `package.json` não existirem.
10. Runtime local de consulta não existir.
11. Testes locais não existirem.
12. CI não existir.
13. Callbacks de consulta não estarem configurados.
14. Dados/state não serem migrados.
15. Diferenças Windows/Linux afetarem FFmpeg, paths e permissões.

## 11. Risco de dados e segredos no Git

### Proteções atuais

`.gitignore` cobre:

- `.env`;
- `node_modules/`;
- `data/users-state.json`;
- áudios TTS;
- logs.

### Lacuna da Durable Inbox

Não cobre:

```text
data/webhook-inbox.json
```

Esse arquivo pode conter:

- texto de cliente;
- telefone;
- referência de mídia;
- payload da Meta.

Ele está hoje protegido apenas porque o diretório `data/` aparece ignorado no
estado local, mas o padrão rastreado explicitamente lista apenas
`data/users-state.json`. É necessário verificar a origem dessa exclusão e
adicionar regra explícita para a inbox e demais event stores com dados reais.

### Histórico remoto

O histórico entre `origin/main` e HEAD indica que `node_modules` e
`data/users-state.json` já estiveram rastreados no remoto.

Isso exige:

- não reintroduzir esses arquivos;
- revisar se houve dados pessoais no histórico;
- avaliar limpeza/rotação conforme política de segurança.

## 12. O que precisa ser consolidado

### Obrigatório para o runtime desejado

- `server.js`;
- `src/domain/calendar-scheduling.js`;
- `src/domain/cliente-status-ui.js`;
- `src/domain/hubspot-core.js`;
- `src/domain/hubspot-sync.js`;
- `src/domain/state-persistence.js`;
- `tts.js`;
- `src/domain/consultation-events.js`;
- `src/domain/consultation-guards.js`;
- `src/domain/consultation-metrics.js`;
- `src/domain/consultation-read-model.js`;
- `src/domain/consultation/**`;
- `src/domain/crm-identity/**`.

### Obrigatório para construir e validar

- `package.json`;
- `.github/workflows/consultation-architecture.yml`;
- `scripts/**` referenciados no package;
- `src/scripts/**`;
- testes referenciados por `npm test`;
- baselines/manifests usados pelos release checks.

### Obrigatório para operação segura

- `.gitignore` com inbox/event stores/artefatos sensíveis;
- `.env.example` sem valores;
- versão de Node;
- runbook de deploy;
- requisito de FFmpeg;
- requisito de single instance;
- volume persistente;
- backup/restore;
- rollback;
- lista de callbacks.

### Precisa de decisão, não de inclusão automática

- 30+ auditorias e roadmaps na raiz;
- reset scripts;
- token generator;
- scripts Python;
- arquivos de baseline operacional;
- snapshots gerados;
- `docs/development/CLAUDE.md`;
- `.github/copilot-instructions.md`;
- `.gitignore.js` removido.

Esses itens devem ser classificados como:

- documentação versionada;
- ferramenta operacional versionada;
- artefato gerado ignorado;
- arquivo local descartável.

## Respostas finais

### A) A release atual é reproduzível?

**Não.**

O HEAD é parcialmente reconstruível, mas não corresponde ao workspace
validado. O remoto está 59 commits atrás. O workspace depende de runtime,
scripts, testes e CI não rastreados.

### B) O que impede uma reconstrução limpa?

Bloqueadores:

1. nove arquivos rastreados com mudanças locais;
2. 120 arquivos não rastreados;
3. módulos runtime de consulta/CRM fora do Git;
4. `package.json` apontando para scripts/testes fora do Git;
5. CI não versionada;
6. ausência de `.env.example`;
7. Node não fixado;
8. FFmpeg não documentado;
9. deploy/volume/single instance não documentados;
10. branch local 59 commits à frente do remoto;
11. ambiente obrigatório incompleto, incluindo App Secret.

### C) Qual é a menor PR ou ação operacional para resolver?

Não existe uma PR minúscula segura que resolva tudo.

#### Menor ação operacional imediata

1. criar backup integral do workspace;
2. criar branch local de consolidação;
3. gerar inventário/patch das mudanças;
4. não executar `git clean`, reset ou deploy;
5. congelar novas mudanças.

Isso reduz risco de perda, mas ainda não torna a release reproduzível.

#### Menor PR útil

Uma PR de **consolidação de release**, sem refatoração:

1. versionar somente runtime necessário;
2. versionar scripts e testes referenciados;
3. versionar workflow;
4. atualizar `.gitignore`;
5. adicionar `.env.example`;
6. fixar Node 20;
7. adicionar runbook mínimo;
8. executar `npm ci` e validações em checkout limpo.

Arquivos de auditoria e ferramentas perigosas devem ficar em PR separada ou ser
ignorados.

### D) Existe risco de perda de código não commitado?

**Sim, alto.**

Estão fora de commits:

- 913 adições e 307 remoções em arquivos rastreados;
- 120 arquivos completos não rastreados;
- cerca de 7.016 linhas em runtime/testes/CI/scripts não rastreados.

Falha de disco, exclusão acidental, `git clean`, reset incorreto ou troca de
máquina pode eliminar esse trabalho.

Arquivos não rastreados não são recuperáveis pelo Git.

### E) Quais arquivos precisam ser consolidados?

Prioridade 1:

- runtime modificado;
- domínio `consultation`;
- domínio `crm-identity`;
- módulos soltos de consulta;
- scripts usados no `package.json`;
- testes usados por `npm test`;
- workflow CI;
- manifestos/baselines exigidos pelo release check.

Prioridade 2:

- `.gitignore`;
- `.env.example`;
- versão Node;
- runbook;
- documentação de FFmpeg, volume e callbacks.

Prioridade 3, após triagem:

- auditorias;
- roadmaps;
- reset scripts;
- geradores de token;
- scripts auxiliares;
- snapshots e outputs.

### F) Estimativa de esforço

| Trabalho | Estimativa |
|---|---:|
| Backup, branch e inventário | 1–2 horas |
| Classificar 120 arquivos | 2–4 horas |
| Consolidar runtime e imports | 3–6 horas |
| Consolidar testes/CI/scripts | 2–4 horas |
| `.gitignore`, env example e Node | 1–2 horas |
| Runbook mínimo de deploy | 2–4 horas |
| Checkout limpo + `npm ci` + testes | 2–4 horas |
| Revisão e push/PR | 2–4 horas |

Total técnico mínimo: **15–30 horas**, aproximadamente **2–4 dias úteis**.

Se os 59 commits e a mudança de consulta precisarem de revisão funcional
detalhada, estimativa prudente: **3–5 dias úteis**.

## Critérios objetivos de reprodutibilidade

A release estará reproduzível quando:

1. `git status` estiver limpo;
2. branch estiver publicado;
3. CI estiver versionada e verde;
4. `npm ci` funcionar em checkout limpo;
5. Node estiver fixado;
6. FFmpeg estiver declarado;
7. todos os requires estiverem rastreados;
8. `npm test` não referenciar arquivos ausentes;
9. release check passar no clone limpo;
10. `.env.example` listar todas as chaves sem segredos;
11. deploy estiver documentado;
12. volume persistente estiver documentado e testado;
13. inbox/event stores estiverem ignorados;
14. hash implantado estiver registrado;
15. rollback para hash anterior estiver testado.

## Recomendação

Suspender deploy até consolidar o workspace numa branch e validar um checkout
limpo com Node 20, `npm ci`, suíte completa e release check.

O primeiro movimento deve ser preservar o trabalho local; o segundo, separar
runtime necessário de documentação/artefatos gerados; o terceiro, publicar
uma release identificável e reproduzível.
