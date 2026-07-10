# Bot Oráculum — Relatório Final de Pilot Freeze

Data: 2026-07-03
Branch auditado: `release/snapshot-consolidation`
Commit local auditado: `f9bd7f06f49129c80541cfbf498ac12d4323967e`

## Decisão

**FREEZE DO PILOTO AINDA NÃO APROVADO.**

O código local está tecnicamente consistente, mas o commit auditado ainda não é
um artefato publicado: o branch local está quatro commits à frente de
`origin/release/snapshot-consolidation`. O remoto permanece em `03387a3`, sem os
seguintes hardenings:

- simplificação de UX do piloto (`b367274`);
- auditoria de templates Meta (`a27d33c`);
- prioridade de `eventId` do Calendar (`b183314`);
- proteção contra finalização parcial (`f9bd7f0`).

Sem publicação, CI verde desse SHA e confirmação do mesmo SHA no Render, não é
possível afirmar que o ambiente do piloto contém as correções auditadas.

## Estado técnico local

Validações executadas no commit local:

- `consultation:release-check`: aprovado;
- auditoria arquitetural estrita: aprovada, 101 arquivos e zero violações;
- teste de finalização transacional: aprovado;
- teste de identificação por `eventId`: aprovado;
- `node --check server.js`: aprovado;
- suíte completa havia sido aprovada após o último hardening.

Hardenings concluídos no código local:

- webhook Meta fail-closed;
- Durable Inbox persistida antes do ACK;
- deduplicação e replay após restart;
- arquivos Drive sem permissão pública automática;
- storage com backup/restore e runbook;
- Node.js 20/npm 10 e CI versionada;
- invariantes obrigatórias antes da criação de caso;
- interrupção da finalização após falha obrigatória;
- retry com reutilização de número, pasta, contato e negócio;
- Calendar como fonte do estado da consulta;
- identificação de eventos por `eventId`, com fallback temporal legado;
- idempotência de agendamento por negócio;
- checklist operacional do piloto.

## Bloqueadores técnicos para o freeze

1. **Commit local não publicado**
   - `HEAD`: `f9bd7f0`;
   - upstream: `03387a3`;
   - diferença: quatro commits.

2. **CI remota não executada para `f9bd7f0`**
   - validação local não substitui o pipeline do artefato publicado.

3. **Runtime implantado não comprovado**
   - falta evidência de que o Render executa exatamente `f9bd7f0`.

4. **Worktree de preparação não está limpo**
   - existe exclusão rastreada de `.gitignore.js`;
   - existem arquivos não rastreados, inclusive scripts operacionais;
   - o checklist e este relatório ainda não estão versionados.

O worktree sujo não invalida o commit `f9bd7f0`, mas impede usar este diretório
como evidência de uma release limpa e aumenta o risco de inclusão acidental.

## Gates externos antes do piloto

Após publicar o commit, ainda devem ser confirmados:

- PostgreSQL externo gratuito configurado e recovery validado;
- instância única;
- snapshot diário e restore testado;
- Meta App Secret configurado;
- template de terceiro aprovado;
- Make.com enviando `eventId` e sem loop;
- HubSpot, Drive e Calendar de produção acessíveis;
- caso controlado completo conferido nas quatro plataformas;
- responsável humano disponível durante todo o período.

Esses itens são condições operacionais. Tornam-se bloqueadores somente se não
forem comprovados antes da primeira conversa real.

## Riscos operacionais remanescentes

Depois de publicar e validar o runtime, permanecem:

- indisponibilidade transitória de Meta, HubSpot, Drive, Calendar, IA ou
  transcrição;
- janela extrema entre confirmação de uma operação remota e fsync do ID local;
- falhas de templates fora da janela de atendimento;
- eventos legados sem `eventId` ou metadados;
- interpretação inesperada de mudança de assunto em campos de texto livre;
- abandono e retorno após vários dias;
- erro humano em Make.com, HubSpot ou atendimento administrativo;
- crescimento de storage e necessidade de monitorar espaço;
- necessidade de conferência manual de cada caso durante o piloto.

Nenhum desses riscos justifica nova funcionalidade antes do piloto. Eles devem
ser controlados pelo checklist operacional.

## Procedimento mínimo para aprovar o freeze

1. Preservar o estado local atual e não incluir arquivos alheios.
2. Publicar explicitamente os quatro commits no branch de release.
3. Exigir CI verde para o SHA final.
4. Implantar o mesmo SHA no Render.
5. Confirmar o SHA no runtime.
6. Executar smoke controlado de WhatsApp, caso, Drive, HubSpot e Calendar.
7. Confirmar Neon, Inbox, migração/recovery e instância única.
8. Registrar evidências e declarar o SHA como baseline congelado.

Depois disso, durante o piloto:

- proibir novas funcionalidades;
- proibir refatorações e extrações;
- aceitar somente correção crítica de segurança, perda/duplicação de dados,
  indisponibilidade ou bloqueio integral de fluxo;
- exigir PR pequena, teste de regressão, CI verde e rollback definido;
- registrar toda exceção ao freeze no diário operacional.

## Respostas

### A) Existem bloqueadores técnicos para iniciar o piloto?

Sim. O código auditado está quatro commits à frente do remoto, não possui CI
remota para o SHA final e não foi comprovado como runtime do Render.

### B) O sistema está suficientemente estável?

O código local está suficientemente estável para um piloto supervisionado. A
release ainda não está pronta até publicação, CI e confirmação do deploy.

### C) Quais riscos restantes são operacionais e não técnicos?

Indisponibilidade de fornecedores, templates Meta, configuração do Make.com,
supervisão dos casos, retorno tardio, falha humana, espaço em disco, backup,
restore e conferência diária entre WhatsApp, HubSpot, Drive e Calendar.

### D) Recomenda-se congelar novas funcionalidades durante o piloto?

Sim. Após fechar os gates de release, recomenda-se freeze integral, permitindo
somente correções críticas, pequenas, testadas e com rollback.
