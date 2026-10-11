# Auditoria integral do Oráculum — 11/10/2026

## Atualização após a auditoria

As duas primeiras correções operacionais decorrentes desta leitura foram concluídas em 11/10/2026:

- a versão da Meta Graph API foi centralizada e o runtime passou a exigir no mínimo a `v23.0` em texto, template, áudio, imagem, indicador de digitação, download de mídia e validação da WABA;
- uma saudação recebida depois de uma sessão antiga deixou de repetir uma etapa velha: cliente com caso oficial volta ao menu, pré-atendimento com progresso recebe as opções de continuar, recomeçar ou encerrar, e conversa recente continua na pergunta atual.

Os testes de regressão desses cenários, a suíte funcional e o contrato documental foram aprovados antes da publicação.

## Escopo e conclusão

Esta leitura cobriu o runtime principal, pré-atendimento, atendimento do cliente e do administrador, documentos, consultas, pós-atendimento, persistência, integrações, segurança HTTP, credenciais, observabilidade, CI e documentação operacional.

O núcleo funcional está consistente com a filosofia do Oráculum: sigilo, identidade única de pessoa/caso, ausência de certeza inventada, uma pergunta por vez, convergência entre texto e áudio, falha segura e controle humano. A suíte completa passou, a auditoria arquitetural de consultas passou e não há vulnerabilidades conhecidas nas dependências de produção.

As correções prioritárias estão nas fronteiras operacionais. A mais urgente é a versão expirada da API da Meta usada pelo transporte real.

## Prioridade crítica

### 1. Transporte real ainda usa Meta Graph API `v19.0`

**Status: corrigido após a auditoria.** O diagnóstico abaixo registra a condição encontrada antes da correção.

O envio de texto, template, áudio, imagem, indicador de digitação e download de mídia usa URLs `graph.facebook.com/v19.0` fixas em `server.js` e `src/domain/whatsapp-transport.js`. O arquivo `.env.example` declara `META_GRAPH_VERSION=v23.0`, mas o transporte ignora essa configuração; somente o validador de WABA a utiliza.

A tabela oficial de versões da Meta informa que a `v19.0` expirou em 21/05/2026. Portanto, em 11/10/2026 o runtime está preso a uma versão fora do período de disponibilidade, mesmo que algumas chamadas ainda estejam funcionando por compatibilidade ou migração da plataforma.

Correção recomendada:

1. criar uma única configuração de versão da Graph API;
2. usá-la em todos os envios, leituras de mídia e validações;
3. migrar primeiro para uma versão ainda suportada e homologada pelo WhatsApp Cloud API;
4. bloquear no boot versões expiradas ou fora da lista permitida;
5. criar teste que proíba URLs versionadas fixas fora do módulo de configuração.

Referência: [Meta — Graph API versions](https://developers.facebook.com/docs/graph-api/changelog/versions/).

## Prioridade alta

### 2. Persistência externa não faz parte do contrato de sucesso de todas as gravações

`persistirUsersAgora({ propagarErro: true })` grava o arquivo local e dispara `mirrorStateFile(...)` em segundo plano. A função é síncrona e retorna antes do PostgreSQL; por isso, até chamadas com `await persistirUsersAgora(...)` aguardam apenas `undefined`. O mesmo padrão existe em `gravarJsonAtomico` e no armazenamento de idempotência.

O webhook principal reduz o risco porque executa `flushExternalState()` antes do HTTP 200 e ao concluir o dreno. Outros caminhos administrativos e internos podem confirmar sucesso após a escrita local, antes da réplica durável. Exemplo concreto: `/admin/limpar-usuario` pode responder sucesso e a exclusão reaparecer após reinício se a réplica falhar.

Correção recomendada:

- tornar a persistência durável assíncrona e aguardável;
- definir explicitamente operações que exigem confirmação do PostgreSQL;
- fazer `propagarErro` incluir a réplica externa;
- manter debounce apenas para alterações que aceitam consistência eventual;
- testar falha da réplica depois do rename local.

### 3. Estado inválido de usuários falha aberto no boot

`carregarUsersPersistidos()` captura erro de leitura/JSON, registra e continua com `users` vazio. Isso pode apagar da memória a continuidade de conversas e favorecer reconstruções ou duplicidades, contrariando o princípio “mesma pessoa, mesmo caso”. Inbox, idempotência e outros armazenamentos são mais estritos.

Correção recomendada: em produção, falhar o boot quando `users-state.json` existe e está ilegível, com restauração explícita do último estado íntegro. Estado ausente continua sendo um cenário válido apenas quando comprovadamente inicial.

### 4. Prontidão bloqueada não impede o processo de parecer saudável

O boot calcula `avaliarProntidaoProducao()` e registra `ready` ou `blocked`, mas continua iniciando o servidor. O `/health` considera somente o PostgreSQL. A própria suíte demonstra que o servidor sobe com bloqueadores de Meta, HubSpot, Google, autenticação interna, URL pública e administração.

Correção recomendada:

- separar liveness de readiness;
- impedir o `listen` em produção quando houver bloqueador obrigatório;
- configurar a plataforma para consultar o endpoint de readiness;
- manter no diagnóstico somente nomes de verificações, sem valores secretos.

### 5. Logs ainda podem expor dados pessoais e conteúdo do atendimento

`logErro` imprime mensagem e stack sem a sanitização usada nos erros do HubSpot. `logContextoExecucao`, quando `DEBUG_LOGS=true`, registra telefone completo e mensagem completa. Há chamadas que incluem diretamente telefone, mensagens de provedores e detalhes de erro. Isso conflita com a regra documental de não registrar PII.

Correção recomendada:

- aplicar um redator central recursivo a todo log, incluindo erro e stack;
- mascarar telefone, CPF, e-mail, tokens, URLs de capacidade e conteúdo de mensagens;
- bloquear `DEBUG_LOGS=true` em produção na prontidão;
- armazenar no monitor somente códigos e categorias sanitizadas.

### 6. Chave do cofre está acoplada à senha administrativa

O cofre cifra perfis e senhas com AES-256-GCM, o que é adequado, mas deriva a chave do material de `ADMIN_WHATSAPP_PASSWORD` ou de seu hash SHA-256, com salt fixo. A mesma senha autentica o administrador e protege todas as credenciais. Trocar essa senha pode tornar os registros existentes indecifráveis; não há versão de chave nem processo de rotação. A prontidão também aceita senha em texto ou hash sem requisito mínimo de força.

Correção recomendada:

- usar um segredo de criptografia dedicado, aleatório e de alta entropia;
- versionar a chave por registro e implementar rotação;
- usar scrypt/Argon2 com salt individual para autenticação administrativa;
- exigir requisitos mínimos e rejeitar segredo compartilhado ou fraco no boot.

## Prioridade média

### 7. TLS do PostgreSQL não valida o certificado do servidor

O pool usa `ssl: { rejectUnauthorized: false }`. O tráfego é cifrado, mas a identidade do servidor não é verificada.

Correção recomendada: adotar validação completa com CA/`verify-full` conforme a configuração suportada pelo provedor, mantendo uma opção explícita apenas para ambiente local.

### 8. CI não bloqueia regressões de dependência ou da versão da Meta

O workflow roda a suíte e as travas arquiteturais, mas não executa `npm audit --omit=dev`. Também não verifica se todo transporte usa a versão configurada da Meta. As dependências estão limpas hoje, porém isso depende de auditoria manual.

Correção recomendada: adicionar ambos os gates ao CI e automatizar atualização controlada de dependências.

### 9. Release publicada não é identificável pelo endpoint de saúde

O código e o `/health` repetem `Oraculum v6.4`, enquanto `package.json` declara `1.0.0`. O endpoint não mostra commit/build. A resposta pública 200 confirma que o serviço vive, mas não prova qual revisão está publicada.

Correção recomendada: centralizar a versão e expor `release`/commit curto não sensível, obtido do ambiente de build. Usar o mesmo identificador em logs e saúde interna.

### 10. Arquivos locais sensíveis têm permissões inconsistentes

Vários temporários usam modo `0600`, porém `users-state.json`, arquivos JSONL de consultas e alguns artefatos são criados sem modo explícito. Em Linux, isso pode resultar em `0644`, dependendo do `umask`.

Correção recomendada: aplicar `0600` a todo estado que contenha dados pessoais, credenciais, eventos ou documentos temporários.

### 11. Retenção e memória precisam de política explícita

`users` conserva todas as conversas carregadas. Alguns mapas por telefone — áudios enviados e cliques recentes — não têm limpeza global. O desenho atual pressupõe uma instância única e crescerá com o histórico.

Correção recomendada: definir retenção jurídica e operacional, remover caches expirados, hidratar estado sob demanda e manter no processo somente sessões ativas. Antes de escalar horizontalmente, mover locks, rate limits e sessões necessárias para armazenamento compartilhado.

### 12. Exclusão LGPD é manual e não possui execução técnica auditável

A página pública orienta pedido por e-mail e menciona WhatsApp, HubSpot, Drive e armazenamento. O endpoint administrativo atual limpa apenas o estado local do usuário. Não há uma operação única que localize, anonimize/remova e registre a decisão em todos os sistemas.

Correção recomendada: criar primeiro um runbook com checklist, identidade do solicitante, bases de retenção e evidências por sistema; depois, automatizar somente as etapas seguras e reversíveis, com aprovação humana.

### 13. Integridade JSONL pode ignorar uma última linha malformada

O histórico principal de consultas descarta linhas que não parseiam antes de validar a cadeia de hashes. Uma linha corrompida no meio tende a quebrar a cadeia seguinte, mas uma última linha truncada pode ser ignorada silenciosamente.

Correção recomendada: qualquer linha não vazia e inválida deve bloquear a leitura com código de corrupção; adicionar teste específico para truncamento da última linha.

### 14. O runtime central continua grande demais

`server.js` tem 18.831 linhas e 441 declarações de função. O repositório possui 248 arquivos JavaScript de runtime e 340 arquivos de teste. A modularização avançou, mas transporte Meta, boot/readiness, persistência e parte dos fluxos ainda estão misturados no arquivo central.

Correção recomendada: extrair por fronteiras já existentes, começando pelos itens que precisam de correção acima. Evitar uma reescrita geral; cada extração deve preservar os contratos e testes atuais.

## Pendências já reconhecidas

- validar com evidência real e sanitizada o caso de verso de RG que falhou em produção;
- executar gates reais de PostgreSQL e provedores somente em ambiente autorizado;
- manter supervisão do Lightning TTS e fallback textual;
- aprofundar especializações jurídicas sem permitir inferências incertas;
- reduzir gradualmente o wiring legado de `server.js`.

## Evidências executadas

- `npm test`: aprovado;
- `npm run audit:consulta:architecture`: aprovado, 301 arquivos, zero violações;
- `npm run consultation:release-check`: aprovado;
- `npm audit --omit=dev`: zero vulnerabilidades em 191 dependências;
- `GET https://oraculum-bot.onrender.com/health`: HTTP 200, `status=ok`, `version=Oraculum v6.4`;
- branch local, `origin/main` e `origin/fix/pre-atendimento-hardening` sincronizados no commit `db96970`;
- árvore de trabalho limpa antes da criação deste relatório.

## Ordem recomendada de execução

1. ~~migrar e centralizar a versão da Meta~~ — concluído;
2. tornar duráveis e aguardáveis as gravações críticas;
3. falhar fechado no carregamento de estado inválido;
4. corrigir readiness/health e identificar o release;
5. sanitizar integralmente os logs;
6. separar e rotacionar a chave do cofre;
7. endurecer TLS, permissões de arquivo e CI;
8. implantar retenção, exclusão auditável e extrações graduais do `server.js`.
