# Evidências finais de Go Live — 2026-07-10

## Parecer executivo

**GO LIVE NÃO APROVADO.** Persistent Disk pago foi removido da arquitetura. A persistência de produção passa a usar PostgreSQL externo gratuito, mas a URL Neon ainda precisa ser criada e a migração real executada. Make e a importação dos casos permanecem como validações externas separadas.

Nenhum registro HubSpot foi criado ou alterado pela importação e nenhuma mensagem foi enviada.

## Implementações e correções

- importador `scripts/import-real-cases.js`: `audit`, `dry-run`, `apply`, `resume` e `report`; varredura recursiva, checkpoint atômico, retomada, idempotência, deduplicação CPF → telefone → e-mail e número oficial → título, retry limitado, timeout, concorrência limitada, relatório por hash de caso e logs sem PII;
- aplicação protegida por confirmação literal e `IMPORT_AUTOMATIONS_CONFIRMED_DISABLED=true`;
- casos sem nome/chave de contato/número oficial comprovado são recusados para revisão, sem inferência por nome;
- correção do enum real `contacts.area_juridica`: `INSS` → `Previdenciário (INSS)`;
- áudio da etapa cidade não pode mais ser silenciado por `skipIntroAudio`;
- teste de terminologia passou a incluir o módulo de UI extraído;
- persistência configurável por `ORACULUM_DATA_DIR`, com gravabilidade exposta apenas no health interno protegido;
- `.env.*` ignorado, preservando `.env.example`;
- blueprints de consulta receberam timezone explícito e inventário completo de variáveis.

## Testes e comandos executados

| Verificação | Resultado |
|---|---|
| `npm test` (suíte declarada) | 44/44; 282,3 s |
| todos os `test/*.test.js` antes da correção | 110/112; duas regressões localizadas |
| todos os `test/*.test.js` após correções | **113/113**; 277,4 s |
| `node --check` nos JS alterados | passou |
| persistência/backup/webhook durability | passou |
| HubSpot smoke real read-only | autenticado; Contacts e Deals válidos |
| títulos HubSpot dry-run real | 0 mudanças; 0 revisões |
| Meta/WABA real read-only | conexão, número e WABA válidos; 8 templates listados |
| parse dos 6 JSON Make | passou |
| importação offline | 25/25 reconhecidos; 0 erros |
| dry-run HubSpot | concluído; 0 erros; 0 duplicidades |
| tentativa de apply | bloqueada antes de escrita por automações não confirmadas |

## HubSpot — matriz campo a campo

API real: 413 propriedades de Contact e 209 de Deal. Todos os campos abaixo existem e não são read-only.

| Objeto | Campos produzidos | Origem/valor | Tipo real | Status/correção |
|---|---|---|---|---|
| Contact | `firstname`, `email`, `work_email`, `phone`, `city`, `state` | cadastro normalizado | string | válido |
| Contact | `area_juridica` | área | enumeration | corrigido para valor interno `Previdenciário (INSS)`; demais `Trabalhista`, `Outros` válidos |
| Contact | `beneficio`, `beneficio_de_interesse`, `situacao_caso` | triagem | string | válido |
| Contact | `cpf_do_cliente`, `date_of_birth` | cadastro comprovado | string | válido |
| Contact | `numero_caso`, `numero_do_caso`, `pasta_drive` | caso/Drive | string | válido |
| Contact | `origem_lead` | `Bot Whatsapp` | enumeration | válido |
| Contact | `tipo_de_caso` | tipo normalizado | enumeration | 8/8 valores conferidos |
| Deal | `dealname`, `description`, `resumo_cliente`, `descricao_completa`, `estado_bot_snapshot`, `etapa_do_bot`, `area_juridica`, `urgencia`, `cidade`, `pasta_drive`, `origem_atendimento`, `numero_de_caso` | estado do caso | string | válido |
| Deal | `pipeline`, `dealstage`, `hubspot_owner_id` | configuração | enumeration | válido; IDs do pipeline dependem da configuração existente |
| Deal | `tipo_de_caso` | classificador | enumeration | 12/12 valores conferidos |
| Deal | `temperatura_lead` | Frio/Morno/Quente | enumeration | 3/3 válidos |
| Deal | `hs_priority` | low/medium/high | enumeration | 3/3 válidos |

Criação/atualização real não foi usada como teste porque produziria dados jurídicos e poderia acionar workflows. O dry-run fez buscas reais sem mutação.

## Títulos

O único gerador é `src/domain/hubspot-deal-title.js`. Testes cobrem LF/LM/LQ/cliente, área, número oficial e preservação. Auditoria real encontrou `totalComMudanca=0`. Mudança manual no portal só volta a ser corrigida quando houver uma sincronização local; suporte imediato exige webhook/workflow HubSpot chamando endpoint autenticado, ainda não configurado externamente.

## Make — cenário a cenário

| Arquivo final | Cenário/webhook | Data Store | Variáveis | Ação externa |
|---|---|---|---|---|
| `oraculum-consulta-planejamento.blueprint.json` | planejamento; `/consulta-lembrete-dados` | `consulta_reminders` | calendar ID, base URL, secret, hora de hoje | importar/reconectar |
| `oraculum-consulta-disparo-recorrente.blueprint.json` | lembretes; `/lembrete` | `consulta_reminders` | base URL, secret | importar/reconectar |
| `oraculum-consulta-ciclo-vida.blueprint.json` | cancelamento, reagendamento, pós; `/evento-cancelado`, `/consulta-lembrete-dados`, `/pos-consulta` | `consulta_reminders` | calendar ID, base URL, secret, hora de hoje | importar/reconectar |
| `oraculum-reengagement-planning.blueprint.json` | planning; `/reengagement-candidates`, `/reengajamento-dados` | `reengagement_jobs` | base URL, secret | importar/reconectar |
| `oraculum-reengagement-dispatcher.blueprint.json` | dispatcher; `/reengajamento` | `reengagement_jobs` | base URL, secret | importar/reconectar |

Timezone: `America/Sao_Paulo`. Desativar cenários antigos equivalentes e **não importar** `oraculum-reengagement-planning.blueprint.legacy-20260710.json` (backup preservado). Não há blueprint separado de agendamento: criação/edição/cancelamento do Calendar ocorre no bot; Make observa o ciclo e dispara lembretes.

## Casos reais

Fonte: 25 pastas de caso, 97 diretórios totais, 869 arquivos, 924.435.258 bytes. Dry-run conectado:

- reconhecidos: 25;
- contatos potencialmente novos por chave extraída: 3;
- negócios potencialmente novos: 3;
- existentes: 0; duplicidades: 0; erros: 0;
- incompletos/revisão manual: 25;
- criados/atualizados: **0/0**.

Relatório detalhado mascarado: `data/case-import/latest-report.json` (ignorado pelo Git). A aplicação recusou escrita porque `IMPORT_AUTOMATIONS_CONFIRMED_DISABLED` não foi confirmado. Mesmo após essa confirmação, casos incompletos continuam automaticamente ignorados.

Comandos:

```powershell
npm run cases:audit
npm run cases:dry-run
npm run cases:report
$env:IMPORT_AUTOMATIONS_CONFIRMED_DISABLED='true'
npm run cases:apply
npm run cases:resume
```

Antes de `apply`: preencher/corrigir as evidências na origem (nomes de pastas/arquivos com CPF/telefone/e-mail e número oficial comprovados) ou evoluir o extrator com OCR revisado; executar novamente o dry-run; desativar workflows HubSpot que enviem mensagens; obter aprovação humana do relatório.

## Homologação e integrações

Simulados por testes: LF/LM/LQ/cliente; título/estágio/área/número; Contact/Deal/associação e falha transitória; texto/áudio/documento; atendimento assistido; documentos “depois” e complemento; agenda, remarcação, cancelamento, lembrete, pós-consulta; reengajamento e cancelamento por resposta; status; restart/recovery; idempotência e persistência. Resultado: 113/113.

Meta: webhook/assinatura/idempotência cobertos; conta, WABA, número e templates validados read-only. Os aliases legados `consulta_notificacao` e `caso_atualizacao` não existem; estão listados `consulta_notificacao_2` e `caso_atualizacao_v3`. Lembretes 24h/hoje/1h estão aprovados.

Google Calendar/Drive: criação, atualização, cancelamento, timezone, IDs, deduplicação, segurança de pasta/nome e falhas são cobertos por testes simulados. Não foram criados evento/pasta de produção para evitar efeitos reais e dados de teste.

## Persistência gratuita — procedimento obrigatório

Não criar Persistent Disk. Criar Neon Free, definir `/tmp/oraculum` e as variáveis descritas em `docs/operations/free-external-persistence.md`, executar `npm run state:migrate:postgres` e confirmar no health interno `provider=postgres`, `database=ok`, `pendingWrites=0`. Reiniciar o Render e confirmar restauração de sessão/inbox/idempotência.

## Pendências exclusivamente manuais e riscos

- Neon/Render: criar banco Free, migrar os documentos e testar restart conforme acima.
- Make: importar cinco arquivos finais, criar/reusar os dois Data Stores, mapear variáveis, reconectar Google Calendar/HTTP, ativar um cenário de cada função e desativar legados.
- HubSpot: desativar workflows de mensagem durante importação; revisar 25 casos e confirmar `IMPORT_AUTOMATIONS_CONFIRMED_DISABLED=true` somente na janela controlada.
- Meta: confirmar se os dois aliases legados ainda são chamados por workflow externo; o código usa os templates operacionais validados.
- Runtime local foi Node 24.14.1, enquanto produção declara Node 20.x; repetir `npm test` no build Render Node 20.
- `.env.backup-*` e `.env.bak` permanecem no computador por serem arquivos do usuário; agora estão ignorados, mas devem ser guardados fora do repositório ou removidos manualmente após backup seguro.

## Checklist final

- [x] suíte completa e `node --check`;
- [x] campos/enums HubSpot e títulos reais read-only;
- [x] Make auditado, JSON válido, timezone/variáveis corrigidos, backup legado preservado;
- [x] importador, checkpoint, retry, mascaramento, dry-run e tentativa segura de apply;
- [x] persistência local, restart/recovery e health;
- [x] Meta real read-only; Google/Drive simulados;
- [ ] PostgreSQL Free configurado, migrado e recovery validado no Render;
- [ ] cenários Make importados/conectados/ativados e legados desativados;
- [ ] casos reais revisados e automações HubSpot confirmadas como desativadas;
- [ ] importação real e conferência pós-importação.
