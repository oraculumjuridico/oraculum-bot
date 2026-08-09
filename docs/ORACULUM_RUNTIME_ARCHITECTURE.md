# Arquitetura operacional atual do Oráculum Bot

## Visão geral

O runtime Node.js recebe webhooks WhatsApp em `server.js` e encaminha cada interação para fluxos de cliente, Admin/Atendimento Assistido, documentos, consultas ou pós-humano. A aplicação mantém compatibilidade com estado legado, mas domínios novos ficam em módulos de `src/domain` e adaptadores de infraestrutura.

## Fontes de verdade

| Domínio | Fonte canônica | Projeções/artefatos |
| --- | --- | --- |
| Caso | identidade conjunta Contact + Deal + `numeroCaso` | objeto `u`, snapshot HubSpot |
| Documento | `document-state.json` e registry versionado | `u.docsEntregues`, `u.docsParciais`, pendências e inventários |
| Jurídico | estados canônicos de INSS/BPC, endereço e `nomenclaturaJuridica` | campos legados e propriedades HubSpot permitidas |
| Pós-humano | ciclo durável e action context PostgreSQL | contexto local e mensagens apresentadas |
| Importação | plano/checkpoint canônico e reserva de número | relatórios dry-run e projeções externas |

## Fluxo do cliente

- O menu e as telas declarativas ficam em `src/domain/client-*` e `declarative-screen*`.
- Texto e áudio convergem para os mesmos resolvedores. Áudio jurídico é transcrito antes da interpretação; mídia documental segue o pipeline de documento.
- Retomada, múltiplos casos e seleção ativa preservam Deal e `numeroCaso`; não é permitido escolher caso arbitrariamente.
- A saudação do menu é local e neutra, sem dependência de IA externa.

## Documentos

O caminho canônico é: entrada → normalização → análise/OCR/classificação → evidência versionada no registry → confirmação por `fileId` → decisão do requisito → `marcarStatusDocumento` → persistência de `u` → claim e reavaliação do mesmo ciclo.

- Identidade física usa `fileId`, SHA-256 e `fileId + pageNumber` quando aplicável.
- Decisões guardam `evidenceRefs` com versão e hash; nova versão não altera a decisão histórica.
- RG/CNH só promovem com confiança e identidade suficientes. Nome isolado, contexto guiado ou quantidade de páginas não provam completude.
- Documento diferente do pedido é preservado, mas não satisfaz o requisito pedido.
- Divergências fortes de CPF/RG, titular versus terceiro, baixa confiança e conflito entre variantes levam a review.
- PDF local é renderizado/analisado por página. Falha parcial preserva unidades válidas e registra erro técnico.
- O caso real de verso de RG que falhou em produção continua `PENDENTE DE VALIDAÇÃO REAL` até existir imagem/log sanitizado reproduzível.

## Pós-humano

O botão `Atendimento realizado` cria um action context opaco, case-sensitive, com TTL e vínculo a Admin, Contact, Deal e caso. A confirmação segue inspect → reconfirmação HubSpot → transação consume + createCycle.

O dispatcher tolera contexto nulo e resolve pelas demais identidades. O ciclo coleta pendências cadastrais, jurídicas e documentais, uma pergunta por vez. A reavaliação documental usa claim durável no mesmo `cycleId`; não chama `createCycle`.

Estados de transporte incertos ou já iniciados bloqueiam novo outbound inclusive em revisão posterior. Apenas falha comprovadamente pré-transporte/rejeição segura é retryable; `completed` pode seguir a semântica normal.

## HubSpot e Drive

- HubSpot só recebe campos presentes na allowlist e nunca sofre overwrite silencioso de dado manual divergente.
- Dados pessoais extraídos exigem documento reconhecido, confirmado, entregue, versionado, do titular, com confiança e sem divergência.
- Nome é decomposto pela lógica existente (`firstname`/`lastname`); CPF e nascimento usam propriedades existentes.
- Drive mantém pasta vinculada ao caso. Upload só é confirmado após `fileId` válido; falha não produz falso sucesso nem upload duplicado.
- Testes usam mocks. Provas de integração real dependem de execução explicitamente autorizada.

## WhatsApp/Meta e voz

- `ultimaMsg` registra apenas mensagem real do cliente e define a janela de 24h.
- Dentro da janela é permitido envio livre; fora dela, apenas template aprovado. Restauração HubSpot não fabrica timestamp recente.
- O instante exato de 24h é aceito; depois dele usa-se template.
- TTS preserva Unicode pt-BR até o payload UTF-8 e converte a saída para OGG/OPUS. Provedor/modelo não foi trocado.

## Admin e Atendimento Assistido

Admin usa allowlist e callbacks canônicos. Upload administrativo exige caso selecionado e confirmação pelo `fileId`. Atendimento Assistido converge para os mesmos estados canônicos de cadastro, jurídico, endereço e documentos; não cria classificadores paralelos.

## Importação e análise local

`scripts/import-real-cases.js` separa audit/review/dry-run de apply/resume. O dry-run gera relatório e plano canônicos sem reservar número nem escrever externamente. Aplicação requer autorização, reserva, checkpoints e configuração PostgreSQL; nunca deve ser inferida de uma auditoria local.

`src/domain/local-case-document-analysis.js` implementa inventário, PDF por página, consolidação e revisão. O resultado deve convergir para os mesmos contratos canônicos, sem promover evidência incerta.

## Persistência, segurança e idempotência

- Estado local usa gravação temporária exclusiva + rename e pode ser espelhado externamente quando configurado.
- Action contexts e ciclos usam operações duráveis/transacionais; tokens, telefone, CPF e nomes não entram em logs estruturados.
- Callbacks, respostas repetidas, webhooks duplicados e concorrência têm testes de idempotência.
- Nunca use `npm audit fix`, migration, credencial ou serviço real como parte de teste local comum.

## Gates de teste e publicação

1. Testes focados da alteração.
2. `npm run test:post-human` e `npm run test:case-analysis` quando atingidos.
3. `npm test`, interpretando timeout como não aprovação e diagnosticando a suíte responsável.
4. `node --check` para todo JS alterado e `git diff --check`.
5. Auditar arquivos/commits, worktree e diff contra `origin/main`.
6. Push somente após autorização, sem force; PR, migration e deploy continuam separados.

## Backlog conhecido

- Reproduzir com evidência sanitizada o RG verso que falhou no piloto real.
- Executar gates PostgreSQL e integrações reais somente em ambiente autorizado.
- Reduzir gradualmente o wiring legado de `server.js` sem criar arquitetura paralela.
