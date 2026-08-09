# Oráculum Bot — contexto para manutenção

Leia primeiro [docs/ORACULUM_RUNTIME_ARCHITECTURE.md](docs/ORACULUM_RUNTIME_ARCHITECTURE.md). Ele descreve o runtime atual, fontes de verdade, integrações e gates.

## Invariantes

- Um caso mantém o mesmo Contact, Deal, `numeroCaso`, pasta Drive e histórico.
- `document-state.json`/registry guardam a verdade documental; `u.docs*` é projeção operacional.
- Evidência incerta, conflitante ou de terceiro não satisfaz requisito do titular nem preenche dados pessoais.
- O pós-humano reavalia o mesmo ciclo; não cria ciclo/caso novo e protege outbound entre revisões.
- A janela Meta de 24h nasce somente de mensagem real do cliente (`ultimaMsg`).
- Tokens de ação são opacos, case-sensitive e nunca devem aparecer em logs.

## Áreas sensíveis

- `server.js`: wiring legado e roteamento central; fazer alterações pequenas e cobertas.
- `src/domain/document-*`: pipeline e estado documental canônico.
- `src/domain/post-human-*`: ciclo, claim, outbound e recuperação.
- `scripts/import-*` e `src/domain/canonical-case*`: importação local, planejamento e aplicação controlada.
- migrations/PostgreSQL, HubSpot, Drive, Meta e Render: nunca executar/escrever sem autorização explícita.

## Testes essenciais

```text
npm run test:post-human
npm run test:case-analysis
npm test
node --check server.js
git diff --check
```

Use também os testes focados da área alterada. Testes PostgreSQL reais são gates separados e exigem ambiente autorizado.

## Publicação

Antes de publicar: atualizar refs, exigir worktree limpa, verificar ancestralidade com `origin/main`, auditar `origin/main..HEAD` e garantir push fast-forward. Não fazer rebase/merge/force push automaticamente. PR, deploy e migration são passos separados.

## Não reabrir sem evidência

- Não reduzir confiança documental para fazer fixture passar.
- Não tornar token case-insensitive.
- Não criar segunda fonte de verdade para documentos, identidade ou nomenclatura.
- Não tratar mídia recebida como documento entregue.
- O verso de RG observado em produção permanece pendente de validação real; o código local sozinho não prova a causa.
