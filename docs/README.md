# Documentação do Bot Oráculum

Comece por:

1. [ORACULUM_SYSTEM_GUIDE.md](ORACULUM_SYSTEM_GUIDE.md), visão funcional e filosofia do bot;
2. [ORACULUM_RUNTIME_ARCHITECTURE.md](ORACULUM_RUNTIME_ARCHITECTURE.md), fontes canônicas e arquitetura atual;
3. [operations/PRODUCTION_RUNBOOK.md](operations/PRODUCTION_RUNBOOK.md), publicação, operação e rollback;
4. [reference/FUNCTION_CATALOG.md](reference/FUNCTION_CATALOG.md), índice gerado de todas as funções nomeadas do runtime.

Esta árvore separa documentação por finalidade:

- `architecture/`: modelos, roadmaps e análises estruturais;
- `audits/`: auditorias técnicas e diagnósticos pontuais;
- `decisions/`: decisões arquiteturais futuras;
- `development/`: instruções e materiais de desenvolvimento;
- `integrations/`: contratos e estudos de integrações externas;
- `operations/`: runbooks, baseline e aprendizado operacional;
- `pilot/`: checklist e relatórios do piloto;
- `release/`: prontidão e reprodutibilidade de release;
- `reference/`: catálogos técnicos gerados;
- `security/`: segurança, webhook, Drive e durabilidade.

Arquivos exigidos por ferramentas específicas permanecem nos locais reconhecidos
por elas. Por exemplo, workflows continuam em `.github/workflows/`.

Relatórios de auditoria preservam o estado da data em que foram escritos. Quando houver divergência, o guia do sistema e a arquitetura do runtime são as fontes atuais.
